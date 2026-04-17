export type MarketName = 'aries' | 'echelon';

export interface RateRecord {
  market: MarketName;
  token: string;
  supplyApr: number | null;
  borrowApr: number | null;
  sourceId?: string;
}

export interface StoredRate {
  supplyApr: number | null;
  borrowApr: number | null;
}

export interface StateSnapshot {
  updatedAt: string;
  rates: Record<string, StoredRate>;
}

export interface CarryTokenSnapshot {
  ariesDeposit: number | null;
  echelonDeposit: number | null;
  echelonBorrow: number | null;
  netCarry: number | null;
}

export interface CarryHistoryPoint {
  at: string;
  netCarry: number;
  ariesDeposit: number | null;
  echelonDeposit: number | null;
  echelonBorrow: number | null;
}

export interface CarryTokenState extends CarryTokenSnapshot {
  history: CarryHistoryPoint[];
}

export interface CarryStateSnapshot {
  updatedAt: string;
  tokens: Record<string, CarryTokenState>;
}

export interface CarryTokenReport {
  token: string;
  ariesDeposit: number | null;
  echelonDeposit: number | null;
  echelonBorrow: number | null;
  netCarry: number | null;
  netCarryDelta: number | null;
  elapsedHours: number | null;
  hourlyDrift: number | null;
  rolling24hDrift: number | null;
  ariesRealApr: number | null;
  echelonRealApr: number | null;
  echelonDepositProfitDelta: number | null;
  echelonDepositProfitPerHour: number | null;
  echelonDepositProfit24hPerHour: number | null;
  echelonDepositRealApr: number | null;
}

export interface RateChange {
  market: MarketName;
  token: string;
  rateType: 'supplyApr' | 'borrowApr';
  previous: number;
  current: number;
  delta: number;
}

export interface PositionRecord {
  market: MarketName;
  token: string;
  depositAmount: number | null;
  borrowAmount: number | null;
  sourceId?: string;
}
