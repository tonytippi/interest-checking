import { RateChange, RateRecord, StateSnapshot, StoredRate } from './types';

function toKey(record: Pick<RateRecord, 'market' | 'token'>): string {
  return `${record.market}:${record.token}`;
}

export function buildStateFromRates(records: RateRecord[]): StateSnapshot {
  const rates: Record<string, StoredRate> = {};

  for (const record of records) {
    rates[toKey(record)] = {
      supplyApr: record.supplyApr,
      borrowApr: record.borrowApr,
    };
  }

  return {
    updatedAt: new Date().toISOString(),
    rates,
  };
}

export function detectRateChanges(
  records: RateRecord[],
  previousState: StateSnapshot,
  threshold: number
): RateChange[] {
  const changes: RateChange[] = [];

  for (const record of records) {
    const key = toKey(record);
    const previous = previousState.rates[key];
    if (!previous) continue;

    const comparisons: Array<['supplyApr' | 'borrowApr', number | null, number | null]> = [
      ['supplyApr', previous.supplyApr, record.supplyApr],
      ['borrowApr', previous.borrowApr, record.borrowApr],
    ];

    for (const [rateType, prev, curr] of comparisons) {
      if (prev === null || curr === null) continue;
      const delta = Math.abs(curr - prev);
      if (delta < threshold) continue;

      changes.push({
        market: record.market,
        token: record.token,
        rateType,
        previous: prev,
        current: curr,
        delta,
      });
    }
  }

  return changes;
}
