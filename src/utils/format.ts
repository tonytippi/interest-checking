import { RateChange, RateRecord } from '../types';

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

export function formatRate(rate: number | null): string {
  if (rate === null || Number.isNaN(rate)) return 'N/A';
  return formatPercent(rate);
}

export function printRates(records: RateRecord[]): void {
  for (const record of records) {
    console.log(
      `[${record.market.toUpperCase()}] ${record.token} supply=${formatRate(record.supplyApr)} borrow=${formatRate(record.borrowApr)}`
    );
  }
}

export function buildChangeMessage(changes: RateChange[]): string {
  const header = `Interest rate changes detected (${changes.length})`;
  const lines = changes.map(change => {
    const direction = change.current >= change.previous ? '+' : '-';
    return [
      `${change.market.toUpperCase()} ${change.token} ${change.rateType}:`,
      `${formatPercent(change.previous)} -> ${formatPercent(change.current)}`,
      `(${direction}${formatPercent(change.delta)})`,
    ].join(' ');
  });

  return [header, ...lines].join('\n');
}
