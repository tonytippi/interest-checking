import dotenv from 'dotenv';
import { loadConfig } from './config';
import { fetchEchelonPositions, fetchEchelonRates } from './markets/echelon';
import { fetchAriesPositions, fetchAriesRates } from './markets/aries';
import { loadState, saveState } from './state';
import { loadCarryState, saveCarryState } from './carry-state';
import { buildStateFromRates, detectRateChanges } from './diff';
import { buildCarryAlertMessage, buildCarryReport, buildCarryStateFromPositions } from './carry';
import { buildChangeMessage, printCarryReport, printPositions, printRates } from './utils/format';
import { sendTelegramMessage } from './notifier/telegram';
import { PositionRecord, RateRecord } from './types';

dotenv.config();

async function fetchAllRates(): Promise<RateRecord[]> {
  const config = loadConfig();

  const [echelonRates, ariesRates] = await Promise.all([
    fetchEchelonRates(config.tokens),
    fetchAriesRates(config.tokens, config.ariesRpcUrl, config.ariesTokenMap),
  ]);

  return [...echelonRates, ...ariesRates];
}

async function fetchAllPositions(): Promise<PositionRecord[]> {
  const config = loadConfig();
  if (!config.walletAddress) return [];

  const [echelonPositions, ariesPositions] = await Promise.all([
    fetchEchelonPositions(config.walletAddress, config.tokens, config.echelonLendingModuleAddress),
    fetchAriesPositions(config.walletAddress, config.tokens, config.ariesTokenMap),
  ]);

  return [...echelonPositions, ...ariesPositions];
}

async function runOnce(): Promise<void> {
  const config = loadConfig();
  const startAt = new Date().toISOString();

  console.log(`[run] start ${startAt}`);
  console.log(`[run] tokens=${config.tokens.join(',')} threshold=${config.aprChangeThreshold}`);
  if (config.walletAddress) {
    console.log(`[run] wallet=${config.walletAddress}`);
  }

  const [records, previousState] = await Promise.all([
    fetchAllRates(),
    loadState(config.stateFilePath),
  ]);

  printRates(records);

  if (config.walletAddress) {
    try {
      const [positions, previousCarryState] = await Promise.all([
        fetchAllPositions(),
        loadCarryState(config.carryStateFilePath),
      ]);

      printPositions(positions);

      const carryReport = buildCarryReport(positions, previousCarryState, startAt);
      printCarryReport(carryReport);

      const nextCarryState = buildCarryStateFromPositions(positions, startAt, previousCarryState);
      await saveCarryState(config.carryStateFilePath, nextCarryState);

      const carryAlert = buildCarryAlertMessage(carryReport, config.carryDriftThresholdPerHour, startAt);
      if (carryAlert) {
        if (!config.telegramBotToken || !config.telegramChatId) {
          console.log('[notify] carry drift alert triggered but TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID missing');
          console.log(carryAlert);
        } else {
          try {
            await sendTelegramMessage(config.telegramBotToken, config.telegramChatId, carryAlert, {
              timeoutMs: 15000,
              retries: 2,
              retryDelayMs: 2000,
            });
            console.log('[notify] carry drift alert sent');
          } catch (error) {
            console.error('[notify] carry drift alert failed, keeping run successful:', error);
          }
        }
      }
    } catch (error) {
      console.error('[position] failed to fetch wallet positions:', error);
    }
  }

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
