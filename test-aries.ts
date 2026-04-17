let aries: Record<string, unknown> | null = null;

try {
  // Keep this as runtime-only loading so build does not fail when tssdk is not installed.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  aries = require('@aries-markets/tssdk') as Record<string, unknown>;
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.log('Aries TSSDK is not installed:', message);
}

console.log('Aries TSSDK Exports:');
console.log(aries ? Object.keys(aries) : []);
