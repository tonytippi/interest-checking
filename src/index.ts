import dotenv from 'dotenv';
import { loadConfig } from './config';
import { fetchEchelonRates } from './markets/echelon';
import { fetchAriesRates } from './markets/aries';
import { loadState, saveState } from './state';
import { buildStateFromRates, detectRateChanges } from './diff';
import { buildChangeMessage, printRates } from './utils/format';
import { sendTelegramMessage } from './notifier/telegram';
import { RateRecord } from './types';

dotenv.config();

async function fetchAllRates(): Promise<RateRecord[]> {
  const config = loadConfig();

  const [echelonRates, ariesRates] = await Promise.all([
    fetchEchelonRates(config.tokens),
    fetchAriesRates(config.tokens, config.ariesRpcUrl, config.ariesTokenMap),
  ]);

  return [...echelonRates, ...ariesRates];
}

async function runOnce(): Promise<void> {
  const config = loadConfig();
  const startAt = new Date().toISOString();

  console.log(`[run] start ${startAt}`);
  console.log(`[run] tokens=${config.tokens.join(',')} threshold=${config.aprChangeThreshold}`);

  const [records, previousState] = await Promise.all([
    fetchAllRates(),
    loadState(config.stateFilePath),
  ]);

  printRates(records);

  const changes = detectRateChanges(records, previousState, config.aprChangeThreshold);
  const nextState = buildStateFromRates(records);

  await saveState(config.stateFilePath, nextState);

  if (changes.length === 0) {
    console.log('[notify] no significant changes, skip telegram');
  } else if (!config.telegramBotToken || !config.telegramChatId) {
    console.log('[notify] changes found but TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID missing');
    console.log(buildChangeMessage(changes));
  } else {
    const message = buildChangeMessage(changes);
    try {
      await sendTelegramMessage(config.telegramBotToken, config.telegramChatId, message, {
        timeoutMs: 15000,
        retries: 2,
        retryDelayMs: 2000,
      });
      console.log(`[notify] telegram sent (${changes.length} changes)`);
    } catch (error) {
      console.error('[notify] telegram failed, keeping run successful:', error);
      console.log('[notify] rates/state were updated; will retry on next cycle');
    }
  }

  console.log(`[run] end ${new Date().toISOString()}`);
}

async function main(): Promise<void> {
  const config = loadConfig();

  let running = false;
  const intervalMs = config.checkIntervalMinutes * 60 * 1000;

  const safeRun = async (): Promise<void> => {
    if (running) {
      console.log('[run] previous cycle still running, skip this tick');
      return;
    }

    running = true;
    try {
      await runOnce();
    } catch (error) {
      console.error('[run] failed', error);
    } finally {
      running = false;
    }
  };

  await safeRun();

  if (config.runOnce) {
    return;
  }

  console.log(`[scheduler] every ${config.checkIntervalMinutes} minute(s)`);
  setInterval(() => {
    void safeRun();
  }, intervalMs);
}

void main();
