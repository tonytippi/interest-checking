import { getClient as getAriesApiClient, Reserves, UserProfile } from '@aries-markets/api';
import { PositionRecord, RateRecord } from '../types';

interface ReserveLike {
  coinAddress: string;
  totalBorrowed: number;
  totalCashAvailable: number;
  reserveAmount: number;
  reserveRatio: number;
  minBorrowRate: number;
  optimalBorrowRate: number;
  maxBorrowRate: number;
  optimalUtilization: number;
}

function normalizeAddress(value: string): string {
  return value.toLowerCase();
}

function extractSymbolFromTypeAddress(typeAddress: string): string | null {
  const cleaned = typeAddress.replace(/\s/g, '');
  const inner = cleaned.match(/<(.+)>/)?.[1] ?? cleaned;
  const parts = inner.split('::');
  if (parts.length < 3) return null;
  return parts[2].toUpperCase();
}

function toReserveList(reserves: Reserves): ReserveLike[] {
  return reserves.stats.map(stat => ({
    coinAddress: stat.key,
    totalBorrowed: Number(stat.value.total_borrowed),
    totalCashAvailable: Number(stat.value.total_cash_available),
    reserveAmount: Number(stat.value.reserve_amount),
    reserveRatio: Number(stat.value.reserve_config.reserve_ratio),
    minBorrowRate: Number(stat.value.interest_rate_config.min_borrow_rate),
    optimalBorrowRate: Number(stat.value.interest_rate_config.optimal_borrow_rate),
    maxBorrowRate: Number(stat.value.interest_rate_config.max_borrow_rate),
    optimalUtilization: Number(stat.value.interest_rate_config.optimal_utilization),
  }));
}

function calcUtilizationUiLike(reserve: ReserveLike): number {
  // Aries UI-equivalent: exclude reserve_amount from lendable base.
  const denom = reserve.totalBorrowed + reserve.totalCashAvailable - reserve.reserveAmount;
  if (denom <= 0) return 0;
  return reserve.totalBorrowed / denom;
}

function calcBorrowAprUiLike(reserve: ReserveLike): number {
  const utilization = calcUtilizationUiLike(reserve);
  const optimalUtilization = reserve.optimalUtilization / 100;

  if (utilization <= optimalUtilization) {
    const factor = optimalUtilization === 0 ? 0 : utilization / optimalUtilization;
    const diff = reserve.optimalBorrowRate - reserve.minBorrowRate;
    return (factor * diff + reserve.minBorrowRate) / 100;
  }

  const factor = (utilization - optimalUtilization) / (1 - optimalUtilization);
  const diff = reserve.maxBorrowRate - reserve.optimalBorrowRate;
  return (factor * diff + reserve.optimalBorrowRate) / 100;
}

function calcSupplyAprUiLike(reserve: ReserveLike, borrowApr: number): number {
  const utilization = calcUtilizationUiLike(reserve);
  const supplierShare = Math.max(0, 1 - reserve.reserveRatio / 100);
  return borrowApr * utilization * supplierShare;
}

function chooseBestReserveAddress(candidates: ReserveLike[]): string | undefined {
  if (candidates.length === 0) return undefined;
  candidates.sort((a, b) => {
    const aTotal = a.totalBorrowed + a.totalCashAvailable;
    const bTotal = b.totalBorrowed + b.totalCashAvailable;
    return bTotal - aTotal;
  });
  return candidates[0]?.coinAddress;
}

function buildSymbolToAddress(tokens: string[], tokenMap: Record<string, string>, reserveList: ReserveLike[]): Map<string, string> {
  const candidatesBySymbol = new Map<string, ReserveLike[]>();
  for (const reserve of reserveList) {
    const parsed = extractSymbolFromTypeAddress(reserve.coinAddress);
    if (!parsed) continue;

    const current = candidatesBySymbol.get(parsed) ?? [];
    current.push(reserve);
    candidatesBySymbol.set(parsed, current);
  }

  const symbolToAddress = new Map<string, string>();
  for (const token of tokens) {
    const symbol = token.toUpperCase();

    const forcedAddress = tokenMap[symbol];
    if (forcedAddress) {
      symbolToAddress.set(symbol, forcedAddress);
      continue;
    }

    const candidates = candidatesBySymbol.get(symbol) ?? [];
    const chosen = chooseBestReserveAddress(candidates);
    if (chosen) {
      symbolToAddress.set(symbol, chosen);
      if (candidates.length > 1) {
        console.log(
          `[aries] token ${symbol} matched ${candidates.length} reserves, selected highest-liquidity ${chosen}`
        );
      }
    }
  }

  return symbolToAddress;
}

function debugCandidates(tokens: string[], reserveList: ReserveLike[]): void {
  if (process.env.ARIES_DEBUG !== 'true') return;

  for (const token of tokens) {
    const normalized = token.toUpperCase();
    const candidates = reserveList.filter(reserve => {
      const symbol = extractSymbolFromTypeAddress(reserve.coinAddress) ?? '';
      return symbol === normalized || reserve.coinAddress.toUpperCase().includes(normalized);
    });

    if (candidates.length === 0) {
      console.log(`[aries][debug] token ${normalized}: no candidates`);
      continue;
    }

    console.log(`[aries][debug] token ${normalized}: ${candidates.length} candidates`);
    for (const reserve of candidates) {
      const util = calcUtilizationUiLike(reserve);
      const borrow = calcBorrowAprUiLike(reserve);
      const supply = calcSupplyAprUiLike(reserve, borrow);
      console.log(
        `[aries][debug] ${reserve.coinAddress} supply=${(supply * 100).toFixed(2)}% borrow=${(borrow * 100).toFixed(2)}% util=${(util * 100).toFixed(2)}% reserveRatio=${reserve.reserveRatio.toFixed(2)}%`
      );
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function queryWithRetry<T>(label: string, operation: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const isHtmlResponse = message.includes("Unexpected token '<'");
      const isLastAttempt = attempt === maxAttempts;

      if (isLastAttempt || !isHtmlResponse) {
        throw error;
      }

      const backoffMs = 700 * attempt;
      console.warn(`[aries] ${label} failed with non-JSON response, retry ${attempt + 1}/${maxAttempts} in ${backoffMs}ms`);
      await sleep(backoffMs);
    }
  }

  throw lastError;
}

function sumPrincipalAcrossProfiles(profile: UserProfile, reserveAddress: string): { deposit: number; borrow: number } {
  const key = normalizeAddress(reserveAddress);
  let deposit = 0;
  let borrow = 0;

  for (const aggregated of Object.values(profile.profiles ?? {})) {
    const deposits = aggregated.deposits ?? {};
    const borrows = aggregated.borrows ?? {};

    for (const [coinAddress, value] of Object.entries(deposits)) {
      if (normalizeAddress(coinAddress) !== key) continue;
      deposit += Number(value?.collateral_coins ?? 0);
    }

    for (const [coinAddress, value] of Object.entries(borrows)) {
      if (normalizeAddress(coinAddress) !== key) continue;
      borrow += Number(value?.borrowed_coins ?? 0);
    }
  }

  return { deposit, borrow };
}

export async function fetchAriesRates(
  tokens: string[],
  _rpcUrl: string,
  tokenMap: Record<string, string>
): Promise<RateRecord[]> {
  const api = getAriesApiClient('https://api-v2.ariesmarkets.xyz');

  const reserves = await api.reserve.current.query();
  const reserveList = toReserveList(reserves);
  const reserveByAddress = new Map(reserveList.map(reserve => [normalizeAddress(reserve.coinAddress), reserve]));

  debugCandidates(tokens, reserveList);

  const symbolToAddress = buildSymbolToAddress(tokens, tokenMap, reserveList);

  return tokens.map(token => {
    const normalizedToken = token.toUpperCase();
    const coinAddress = symbolToAddress.get(normalizedToken);
    if (!coinAddress) {
      return {
        market: 'aries',
        token: normalizedToken,
        supplyApr: null,
        borrowApr: null,
      };
    }

    const reserve = reserveByAddress.get(normalizeAddress(coinAddress));
    if (!reserve) {
      return {
        market: 'aries',
        token: normalizedToken,
        supplyApr: null,
        borrowApr: null,
        sourceId: coinAddress,
      };
    }

    const borrowApr = calcBorrowAprUiLike(reserve);
    const supplyApr = calcSupplyAprUiLike(reserve, borrowApr);

    return {
      market: 'aries',
      token: normalizedToken,
      supplyApr,
      borrowApr,
      sourceId: coinAddress,
    };
  });
}

export async function fetchAriesPositions(
  walletAddress: string,
  tokens: string[],
  tokenMap: Record<string, string>
): Promise<PositionRecord[]> {
  const api = getAriesApiClient('https://api-v2.ariesmarkets.xyz');
  const [reserves, userProfile, coinInfo] = await queryWithRetry('positions', () =>
    Promise.all([
      api.reserve.current.query(),
      api.profile.find.query({ owner: walletAddress }),
      api.coinInfo.currentInfo.query(),
    ])
  );

  const reserveList = toReserveList(reserves);
  const symbolToAddress = buildSymbolToAddress(tokens, tokenMap, reserveList);
  const decimalsByAddress = new Map<string, number>(
    Object.entries(coinInfo ?? {}).map(([address, info]) => [
      normalizeAddress(address),
      Number(info?.decimal ?? 0),
    ])
  );

  return tokens.map(token => {
    const normalizedToken = token.toUpperCase();
    const coinAddress = symbolToAddress.get(normalizedToken);

    if (!coinAddress) {
      return {
        market: 'aries',
        token: normalizedToken,
        depositAmount: null,
        borrowAmount: null,
      };
    }

    const principal = sumPrincipalAcrossProfiles(userProfile, coinAddress);
    const decimals = decimalsByAddress.get(normalizeAddress(coinAddress)) ?? 0;
    const scale = 10 ** Math.max(0, decimals);

    return {
      market: 'aries',
      token: normalizedToken,
      depositAmount: principal.deposit / scale,
      borrowAmount: principal.borrow / scale,
      sourceId: coinAddress,
    };
  });
}
