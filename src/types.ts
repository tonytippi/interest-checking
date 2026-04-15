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

export interface RateChange {
  market: MarketName;
  token: string;
  rateType: 'supplyApr' | 'borrowApr';
  previous: number;
  current: number;
  delta: number;
}
