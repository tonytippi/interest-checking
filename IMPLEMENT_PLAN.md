# Periodic Lending Rate Checker

The goal is to create a tool (Node.js script) that runs periodically to check the lending and borrowing interest rates for one or several crypto tokens on Echelon Market and Aries Markets.

## Implementation Details

1.  **Language and Runtime:** Node.js (TypeScript/JavaScript). It allows running a cron-like schedule and interacting with both REST APIs and Headless Browsers easily.
2.  **Scheduler:** The tool will use `node-cron` or standard `setInterval` to run periodically at a configurable interval (e.g., every hour/minute).
3.  **Fetching Echelon Rates:**
    *   Echelon Market provides a straightforward REST API.
    *   We will use native `fetch` to request `https://app.echelon.market/api/markets?network=aptos_mainnet`.
    *   We parse the JSON and extract `supplyApr` and `borrowApr` for the requested tokens (e.g., APT, USDC).
4.  **Fetching Aries Rates:**
    *   Aries Markets does not expose a straightforward REST endpoint for APRs. Their frontend queries Aptos RPC directly using the Move SDK and calculates APRs on the client.
    *   To ensure robustness without needing to reverse-engineer Aries' interest rate utilization formulas, we will proceed with one of two options:
        *   **Option A:** A Headless Browser approach using `puppeteer` to quickly go to `https://app.ariesmarkets.xyz/lending` and extract the rates directly from the DOM, parsing the text.
        *   **Option B:** Using `@aries-markets/tssdk` combined with Aptos TS SDK to fetch from the reserve resources and re-implement the math formula for utilized interest rates.
5.  **Output & Notification:** 
    *   The scraped/fetched rates will be output to the console.
    *   **Telegram Notification:** The tool will format the rates and send a message to a designated Telegram chat. We will use the Telegram Bot API (`https://api.telegram.org/bot<token>/sendMessage`) via native `fetch` to send these updates. This will require `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` configured in a `.env` file.

## Open Questions

> [!WARNING]
> Please review and provide your preferences below.

1.  **Aries Data Collection:** For Aries Markets, do you prefer **Option A (Puppeteer Web Scraper)** or **Option B (Direct RPC lookup + APR calculation via Aries SDK)**? Option A is usually simpler to build but can break if they significantly redesign their UI. Option B is more reliable long-term but requires porting their specific interest rate formulas.
-> Option B
2.  **Which tokens?** Are there specific tokens you want it to log by default (e.g., APT, stAPT, USDC, USDT)?
-> Default is USDC, USDC
3.  **Deployment:** Is this a standalone script you'll run locally in a terminal, or do you intend to deploy it to a serverless function / Docker container later?
- local first
4. **Telegram Credentials:** Do you already have a Telegram Bot Token and Chat ID ready for the `.env` file, or would you like instructions on how to set those up?

## Verification Plan
*   Run the script locally to initiate the rate checking process.
*   Observe the Echelon and Aries supply/borrow rates for the configured tokens in the console and verify they match the live UI.
*   Check the configured Telegram chat to confirm that the bot successfully sent the notification message with the correct rate information.
*   Confirm the scheduler triggers on the defined interval
