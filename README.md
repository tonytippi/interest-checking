# Interest Rate Monitoring Tool

A local Node.js tool to monitor lending and borrowing interest rates from:

- `https://app.ariesmarkets.xyz` (Aries Markets)
- `https://app.echelon.market` (Echelon Market)

The tool runs periodically, compares latest rates with previous values, and sends Telegram alerts only when rates change beyond a configured threshold.

## Goal

Track supply APR and borrow APR for selected tokens and notify when meaningful changes happen.

## Finalized Requirements

- Runtime: Node.js (TypeScript)
- Deployment target: local first
- Default tokens: `USDC`, `USDT`
- Default interval: every `60` minutes
- Aries data source: SDK-first approach (`@aries-markets/tssdk`), using custom calculation only if SDK does not expose required values
- Echelon data source: REST API `https://app.echelon.market/api/markets?network=aptos_mainnet`
- Notifications: Telegram Bot API, send only when changes exceed threshold

## Functional Scope

1. Periodic scheduler to fetch rates every configured interval.
2. Fetch Echelon rates from API and map by token symbol.
3. Fetch Aries rates using SDK/on-chain data path.
4. Normalize output format:
   - market
   - token
   - supplyApr
   - borrowApr
   - timestamp
5. Persist/keep previous run values for comparison.
6. Trigger alert when absolute APR delta exceeds threshold.
7. Print status to console each run.

## Alert Rule

For each market+token+rate-type:

- `delta = abs(currentApr - previousApr)`
- send alert only if `delta >= APR_CHANGE_THRESHOLD`

Threshold is configurable through environment variables.

## Configuration

Create `.env` based on `.env.example`:

- `TOKENS=USDC,USDT`
- `CHECK_INTERVAL_MINUTES=60`
- `APR_CHANGE_THRESHOLD=0.001` (example: 0.1%)
- `TELEGRAM_BOT_TOKEN=...`
- `TELEGRAM_CHAT_ID=...`
- optional RPC/market-specific configs

## Data Notes

### Echelon

Uses market API:

- `GET https://app.echelon.market/api/markets?network=aptos_mainnet`

Expected payload contains assets with fields like:

- `symbol`
- `supplyApr`
- `borrowApr`

### Aries

No simple public APR endpoint. Aries frontend derives data from Aptos resources/tables. Implementation should:

- use `@aries-markets/tssdk` first
- use Aptos SDK/RPC only where needed
- avoid UI scraping

## Suggested Output

### Console

- run start/end timestamp
- fetched rates for monitored tokens
- changed vs unchanged status
- alert sent / skipped reason

### Telegram

Compact diff-oriented message, example:

- `Aries USDC supply: 2.10% -> 2.35% (+0.25%)`
- `Echelon USDT borrow: 6.80% -> 6.55% (-0.25%)`

## Verification Checklist

- Script runs locally without crash.
- Scheduler executes every 60 minutes.
- USDC/USDT rates fetched from both markets (when available).
- Threshold filter suppresses insignificant changes.
- Telegram message delivered when significant change is detected.

## Current Open Questions

- None.
