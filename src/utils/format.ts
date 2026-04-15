import { PositionRecord, RateChange, RateRecord } from '../types';

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

export function formatRate(rate: number | null): string {
  if (rate === null || Number.isNaN(rate)) return 'N/A';
  return formatPercent(rate);
}

function formatAmount(value: number | null): string {
  if (value === null || Number.isNaN(value)) return 'N/A';
  return value.toFixed(6);
}

function pad(value: string, width: number, align: 'left' | 'right' = 'left'): string {
  if (value.length >= width) return value;
  return align === 'right' ? value.padStart(width, ' ') : value.padEnd(width, ' ');
}

function renderTable(
  title: string,
  columns: Array<{ key: string; header: string; align?: 'left' | 'right' }>,
  rows: Record<string, string>[]
): void {
  console.log(`\n${title}`);

  if (rows.length === 0) {
    console.log('(no data)');
    return;
  }

  const widths = columns.map(column => {
    const contentMax = rows.reduce((max, row) => Math.max(max, (row[column.key] ?? '').length), 0);
    return Math.max(column.header.length, contentMax);
  });

  const header = columns
    .map((column, index) => pad(column.header, widths[index], column.align ?? 'left'))
    .join(' | ');
  const divider = widths.map(width => '-'.repeat(width)).join('-+-');

  console.log(header);
  console.log(divider);

  for (const row of rows) {
    const line = columns
      .map((column, index) => pad(row[column.key] ?? '', widths[index], column.align ?? 'left'))
      .join(' | ');
    console.log(line);
  }
}

export function printRates(records: RateRecord[]): void {
  const rows = records.map(record => ({
    market: record.market.toUpperCase(),
    token: record.token,
    supply: formatRate(record.supplyApr),
    borrow: formatRate(record.borrowApr),
    source: record.sourceId ?? '-',
  }));

  renderTable(
    'Rates',
    [
      { key: 'market', header: 'Market' },
      { key: 'token', header: 'Token' },
      { key: 'supply', header: 'Supply APR', align: 'right' },
      { key: 'borrow', header: 'Borrow APR', align: 'right' },
      { key: 'source', header: 'Source' },
    ],
    rows
  );
}

export function printPositions(records: PositionRecord[]): void {
  const rows = records.map(record => ({
    market: record.market.toUpperCase(),
    token: record.token,
    deposit: formatAmount(record.depositAmount),
    borrow: formatAmount(record.borrowAmount),
    source: record.sourceId ?? '-',
  }));

  renderTable(
    'Positions (Principal)',
    [
      { key: 'market', header: 'Market' },
      { key: 'token', header: 'Token' },
      { key: 'deposit', header: 'Deposit', align: 'right' },
      { key: 'borrow', header: 'Borrow', align: 'right' },
      { key: 'source', header: 'Source' },
    ],
    rows
  );
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
