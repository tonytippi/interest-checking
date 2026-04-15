import { Aptos, AptosConfig, Network } from '@aptos-labs/ts-sdk';
import { PositionRecord, RateRecord } from '../types';

interface EchelonAsset {
  symbol?: string;
  supplyApr?: number;
  borrowApr?: number;
  market?: string;
  decimals?: number;
}

interface EchelonResponse {
  data?: {
    assets?: EchelonAsset[];
  };
}

const ECHELON_URL = 'https://app.echelon.market/api/markets?network=aptos_mainnet';

async function fetchEchelonAssets(): Promise<EchelonAsset[]> {
  const response = await fetch(ECHELON_URL);
  if (!response.ok) {
    throw new Error(`Echelon request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as EchelonResponse;
  return payload.data?.assets ?? [];
}

function normalizeToken(token: string): string {
  return token.trim().toUpperCase();
}

function tokenCandidates(token: string): string[] {
  const normalized = normalizeToken(token);
  // Echelon symbols are prefixed with z in current API response, e.g. zUSDC/zUSDT
  return [normalized, `Z${normalized}`];
}

function findAssetForToken(assetsBySymbol: Map<string, EchelonAsset>, token: string): EchelonAsset | undefined {
  const candidates = tokenCandidates(token);
  for (const candidate of candidates) {
    const asset = assetsBySymbol.get(candidate);
    if (asset) return asset;
  }

  return undefined;
}

function normalizePrincipal(rawValue: string | number | bigint, decimals: number): number {
  const value = typeof rawValue === 'bigint' ? rawValue : BigInt(String(rawValue));
  const scale = 10 ** Math.max(0, decimals);
  return Number(value) / scale;
}

export async function fetchEchelonRates(tokens: string[]): Promise<RateRecord[]> {
  const assets = await fetchEchelonAssets();

  const assetsBySymbol = new Map<string, EchelonAsset>();
  for (const asset of assets) {
    if (!asset.symbol) continue;
    assetsBySymbol.set(asset.symbol.toUpperCase(), asset);
  }

  return tokens.map(token => {
    const normalized = normalizeToken(token);
    const asset = findAssetForToken(assetsBySymbol, normalized);
    return {
      market: 'echelon',
      token: normalized,
      supplyApr: typeof asset?.supplyApr === 'number' ? asset.supplyApr : null,
      borrowApr: typeof asset?.borrowApr === 'number' ? asset.borrowApr : null,
      sourceId: asset?.symbol,
    };
  });
}

export async function fetchEchelonPositions(
  walletAddress: string,
  tokens: string[],
  lendingModuleAddress: string
): Promise<PositionRecord[]> {
  const assets = await fetchEchelonAssets();
  const assetsBySymbol = new Map<string, EchelonAsset>();
  for (const asset of assets) {
    if (!asset.symbol) continue;
    assetsBySymbol.set(asset.symbol.toUpperCase(), asset);
  }

  const aptos = new Aptos(new AptosConfig({ network: Network.MAINNET }));

  const positions = await Promise.all(
    tokens.map(async token => {
      const normalized = normalizeToken(token);
      const asset = findAssetForToken(assetsBySymbol, normalized);
      if (!asset?.market) {
        return {
          market: 'echelon' as const,
          token: normalized,
          depositAmount: null,
          borrowAmount: null,
        };
      }

      const decimals = typeof asset.decimals === 'number' ? asset.decimals : 0;
      const marketObject = asset.market;

      const coinsFunction = `${lendingModuleAddress}::lending::account_coins` as const;
      const liabilityFunction = `${lendingModuleAddress}::lending::account_liability` as const;

      const [coins, liability] = await Promise.all([
        aptos.view({
          payload: {
            function: coinsFunction,
            functionArguments: [walletAddress, marketObject],
          },
        }),
        aptos.view({
          payload: {
            function: liabilityFunction,
            functionArguments: [walletAddress, marketObject],
          },
        }),
      ]);

      const depositRaw = coins?.[0] ?? 0;
      const borrowRaw = liability?.[0] ?? 0;

      return {
        market: 'echelon' as const,
        token: normalized,
        depositAmount: normalizePrincipal(depositRaw as string | number | bigint, decimals),
        borrowAmount: normalizePrincipal(borrowRaw as string | number | bigint, decimals),
        sourceId: marketObject,
      };
    })
  );

  return positions;
}
