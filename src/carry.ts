import {
  CarryHistoryPoint,
  CarryStateSnapshot,
  CarryTokenReport,
  CarryTokenSnapshot,
  CarryTokenState,
  PositionRecord,
} from './types';

const EMPTY_CARRY_STATE: CarryStateSnapshot = {
  updatedAt: new Date(0).toISOString(),
  tokens: {},
};

const HISTORY_WINDOW_MS = 24 * 60 * 60 * 1000;
const HOURS_PER_YEAR = 24 * 365;

// Smooth realized APR over recent history to avoid spikes from stepwise balance updates.
const REAL_APR_WINDOW_MS = 6 * 60 * 60 * 1000;
const MIN_REAL_APR_SPAN_MS = 3 * 60 * 60 * 1000;
const MIN_REAL_APR_POINTS = 4;

function safeToken(token: string): string {
  return token.trim().toUpperCase();
}

function toTokenMap(
  records: PositionRecord[]
): Map<string, { ariesDeposit: number | null; echelonDeposit: number | null; echelonBorrow: number | null }> {
  const map = new Map<string, { ariesDeposit: number | null; echelonDeposit: number | null; echelonBorrow: number | null }>();

  for (const record of records) {
    const token = safeToken(record.token);
    const current = map.get(token) ?? { ariesDeposit: null, echelonDeposit: null, echelonBorrow: null };

    if (record.market === 'aries') {
      current.ariesDeposit = record.depositAmount;
    } else if (record.market === 'echelon') {
      current.echelonDeposit = record.depositAmount;
      current.echelonBorrow = record.borrowAmount;
    }

    map.set(token, current);
  }

  return map;
}

function calcNetCarry(snapshot: { ariesDeposit: number | null; echelonBorrow: number | null }): number | null {
  if (snapshot.ariesDeposit === null || snapshot.echelonBorrow === null) return null;
  return snapshot.ariesDeposit - snapshot.echelonBorrow;
}

function parseTimeMs(iso: string): number | null {
  const value = Date.parse(iso);
  return Number.isFinite(value) ? value : null;
}

function hasSnapshotData(state: CarryStateSnapshot): boolean {
  return Object.keys(state.tokens).length > 0;
}

function normalizeHistory(history: CarryHistoryPoint[] | undefined): CarryHistoryPoint[] {
  if (!Array.isArray(history)) return [];
  return history
    .filter(point => Number.isFinite(Date.parse(point.at)) && Number.isFinite(point.netCarry))
    .map(point => ({
      at: point.at,
      netCarry: point.netCarry,
      ariesDeposit: typeof point.ariesDeposit === 'number' ? point.ariesDeposit : null,
      echelonDeposit: typeof point.echelonDeposit === 'number' ? point.echelonDeposit : null,
      echelonBorrow: typeof point.echelonBorrow === 'number' ? point.echelonBorrow : null,
    }));
}

function toTokenState(snapshot: CarryTokenSnapshot): CarryTokenState {
  return {
    ...snapshot,
    history: [],
  };
}

function pruneHistory(history: CarryHistoryPoint[], nowMs: number): CarryHistoryPoint[] {
  const cutoff = nowMs - HISTORY_WINDOW_MS;
  return history.filter(point => {
    const pointMs = parseTimeMs(point.at);
    return pointMs !== null && pointMs >= cutoff;
  });
}

function calcRolling24hDrift(history: CarryHistoryPoint[], valueField: 'netCarry' | 'echelonDeposit'): number | null {
  if (history.length === 0) return null;

  const earliest = history[0];
  const latest = history[history.length - 1];
  const earliestMs = parseTimeMs(earliest.at);
  const latestMs = parseTimeMs(latest.at);

  if (earliestMs === null || latestMs === null) return null;
  const elapsedHours = (latestMs - earliestMs) / (1000 * 60 * 60);
  if (elapsedHours <= 0) return null;

  const earliestValue = earliest[valueField];
  const latestValue = latest[valueField];
  if (earliestValue === null || latestValue === null) return null;

  return (latestValue - earliestValue) / elapsedHours;
}

function calcLinearRegressionSlope(points: Array<{ x: number; y: number }>): number | null {
  if (points.length < 2) return null;

  let sumX = 0;
  let sumY = 0;
  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
  }

  const meanX = sumX / points.length;
  const meanY = sumY / points.length;

  let num = 0;
  let den = 0;
  for (const p of points) {
    const dx = p.x - meanX;
    num += dx * (p.y - meanY);
    den += dx * dx;
  }

  if (den <= 0) return null;
  return num / den;
}

function calcSmoothedRealAprFromHistory(
  history: CarryHistoryPoint[],
  nowMs: number,
  valueField: 'ariesDeposit' | 'echelonBorrow' | 'echelonDeposit'
): number | null {
  const windowStart = nowMs - REAL_APR_WINDOW_MS;

  let anchor: CarryHistoryPoint | null = null;
  const inWindow: CarryHistoryPoint[] = [];

  for (const point of history) {
    const pointMs = parseTimeMs(point.at);
    if (pointMs === null) continue;

    if (pointMs < windowStart) {
      anchor = point;
      continue;
    }

    inWindow.push(point);
  }

  const pointsRaw = anchor ? [anchor, ...inWindow] : inWindow;

  const series: Array<{ tMs: number; value: number }> = [];
  for (const point of pointsRaw) {
    const tMs = parseTimeMs(point.at);
    const value = point[valueField];
    if (tMs === null || value === null || value <= 0) continue;
    series.push({ tMs, value });
  }

  if (series.length < MIN_REAL_APR_POINTS) return null;

  const firstMs = series[0].tMs;
  const lastMs = series[series.length - 1].tMs;
  const spanMs = lastMs - firstMs;
  if (spanMs < MIN_REAL_APR_SPAN_MS) return null;

  const regressionPoints = series.map(p => ({
    x: (p.tMs - firstMs) / (1000 * 60 * 60),
    y: Math.log(p.value),
  }));

  const slopePerHour = calcLinearRegressionSlope(regressionPoints);
  if (slopePerHour === null) return null;

  // Continuous growth slope -> annualized APR.
  return Math.exp(slopePerHour * HOURS_PER_YEAR) - 1;
}

export function buildCarryStateFromPositions(
  positions: PositionRecord[],
  updatedAt: string,
  previousState: CarryStateSnapshot | null = null
): CarryStateSnapshot {
  const tokenMap = toTokenMap(positions);
  const prev = previousState ?? EMPTY_CARRY_STATE;
  const nowMs = parseTimeMs(updatedAt);
  const tokens: Record<string, CarryTokenState> = {};

  for (const [token, snapshot] of tokenMap.entries()) {
    const currentNetCarry = calcNetCarry(snapshot);
    const previousToken = prev.tokens[token];
    const baseState = toTokenState({
      ariesDeposit: snapshot.ariesDeposit,
      echelonDeposit: snapshot.echelonDeposit,
      echelonBorrow: snapshot.echelonBorrow,
      netCarry: currentNetCarry,
    });

    const history = normalizeHistory(previousToken?.history);

    if (currentNetCarry !== null) {
      history.push({
        at: updatedAt,
        netCarry: currentNetCarry,
        ariesDeposit: snapshot.ariesDeposit,
        echelonDeposit: snapshot.echelonDeposit,
        echelonBorrow: snapshot.echelonBorrow,
      });
    }

    const pruned = nowMs !== null ? pruneHistory(history, nowMs) : history;
    tokens[token] = {
      ...baseState,
      history: pruned,
    };
  }

  return {
    updatedAt,
    tokens,
  };
}

export function buildCarryReport(
  positions: PositionRecord[],
  previousState: CarryStateSnapshot | null,
  updatedAt: string
): CarryTokenReport[] {
  const nextState = buildCarryStateFromPositions(positions, updatedAt, previousState);
  const prev = previousState ?? EMPTY_CARRY_STATE;

  const canComputeElapsed = hasSnapshotData(prev);
  const nowMs = parseTimeMs(updatedAt);
  const prevMs = canComputeElapsed ? parseTimeMs(prev.updatedAt) : null;
  const elapsedHours = nowMs !== null && prevMs !== null ? (nowMs - prevMs) / (1000 * 60 * 60) : null;

  return Object.entries(nextState.tokens)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([token, next]) => {
      const old = prev.tokens[token];
      const netCarryDelta = old?.netCarry !== null && old?.netCarry !== undefined && next.netCarry !== null
        ? next.netCarry - old.netCarry
        : null;

      const hourlyDrift =
        netCarryDelta !== null && elapsedHours !== null && elapsedHours > 0 ? netCarryDelta / elapsedHours : null;

      const rolling24hDrift = calcRolling24hDrift(next.history ?? [], 'netCarry');

      const echelonDepositProfitDelta =
        old?.echelonDeposit !== null && old?.echelonDeposit !== undefined && next.echelonDeposit !== null
          ? next.echelonDeposit - old.echelonDeposit
          : null;

      const echelonDepositProfitPerHour =
        echelonDepositProfitDelta !== null && elapsedHours !== null && elapsedHours > 0
          ? echelonDepositProfitDelta / elapsedHours
          : null;

      const echelonDepositProfit24hPerHour = calcRolling24hDrift(next.history ?? [], 'echelonDeposit');

      return {
        token,
        ariesDeposit: next.ariesDeposit,
        echelonDeposit: next.echelonDeposit,
        echelonBorrow: next.echelonBorrow,
        netCarry: next.netCarry,
        netCarryDelta,
        elapsedHours: elapsedHours !== null && elapsedHours > 0 ? elapsedHours : null,
        hourlyDrift,
        rolling24hDrift,
        ariesRealApr: nowMs !== null ? calcSmoothedRealAprFromHistory(next.history ?? [], nowMs, 'ariesDeposit') : null,
        echelonRealApr: nowMs !== null ? calcSmoothedRealAprFromHistory(next.history ?? [], nowMs, 'echelonBorrow') : null,
        echelonDepositProfitDelta,
        echelonDepositProfitPerHour,
        echelonDepositProfit24hPerHour,
        echelonDepositRealApr:
          nowMs !== null ? calcSmoothedRealAprFromHistory(next.history ?? [], nowMs, 'echelonDeposit') : null,
      };
    });
}

export function buildCarryAlertMessage(
  report: CarryTokenReport[],
  driftThresholdPerHour: number,
  atIso: string
): string | null {
  if (driftThresholdPerHour <= 0) return null;

  const breached = report.filter(token => {
    if (token.hourlyDrift === null) return false;
    return Math.abs(token.hourlyDrift) >= driftThresholdPerHour;
  });

  if (breached.length === 0) return null;

  const lines = breached.map(token => {
    const drift = token.hourlyDrift ?? 0;
    const roll = token.rolling24hDrift;
    const rollText = roll === null ? 'N/A' : `${roll >= 0 ? '+' : ''}${roll.toFixed(6)}/h`;

    return [
      `${token.token}: drift=${drift >= 0 ? '+' : ''}${drift.toFixed(6)}/h`,
      `net=${token.netCarry === null ? 'N/A' : `${token.netCarry >= 0 ? '+' : ''}${token.netCarry.toFixed(6)}`}`,
      `roll24h=${rollText}`,
    ].join(' ');
  });

  return [`Carry drift alert @ ${atIso}`, ...lines].join('\n');
}
