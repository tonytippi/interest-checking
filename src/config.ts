import path from 'path';

export interface AppConfig {
  tokens: string[];
  checkIntervalMinutes: number;
  aprChangeThreshold: number;
  telegramBotToken?: string;
  telegramChatId?: string;
  stateFilePath: string;
  runOnce: boolean;
  ariesRpcUrl: string;
  ariesTokenMap: Record<string, string>;
  walletAddress?: string;
  echelonLendingModuleAddress: string;
}

function parsePositiveNumber(input: string | undefined, fallback: number): number {
  if (!input) return fallback;
  const value = Number(input);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function parseBoolean(input: string | undefined, fallback = false): boolean {
  if (!input) return fallback;
  const normalized = input.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

function parseTokens(input: string | undefined): string[] {
  const raw = input ?? 'USDC,USDT';
  return raw
    .split(',')
    .map(token => token.trim().toUpperCase())
    .filter(Boolean);
}

function parseAriesTokenMap(input: string | undefined): Record<string, string> {
  if (!input) return {};

  return input
    .split(',')
    .map(pair => pair.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, pair) => {
      const [symbol, address] = pair.split('=').map(part => part.trim());
      if (!symbol || !address) return acc;
      acc[symbol.toUpperCase()] = address;
      return acc;
    }, {});
}

export function loadConfig(): AppConfig {
  const checkIntervalMinutes = parsePositiveNumber(process.env.CHECK_INTERVAL_MINUTES, 60);
  const aprChangeThreshold = parsePositiveNumber(process.env.APR_CHANGE_THRESHOLD, 0.001);

  return {
    tokens: parseTokens(process.env.TOKENS),
    checkIntervalMinutes,
    aprChangeThreshold,
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
    telegramChatId: process.env.TELEGRAM_CHAT_ID,
    stateFilePath: path.resolve(process.env.STATE_FILE_PATH ?? '.interest-state.json'),
    runOnce: parseBoolean(process.env.RUN_ONCE, false),
    ariesRpcUrl: process.env.ARIES_RPC_URL ?? 'https://fullnode.mainnet.aptoslabs.com/v1',
    ariesTokenMap: parseAriesTokenMap(process.env.ARIES_TOKEN_MAP),
    walletAddress: process.env.WALLET_ADDRESS?.trim(),
    echelonLendingModuleAddress:
      process.env.ECHELON_LENDING_MODULE_ADDRESS ??
      '0xc6bc659f1649553c1a3fa05d9727433dc03843baac29473c817d06d39e7621ba',
  };
}
