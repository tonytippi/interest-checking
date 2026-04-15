function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendOnce(
  botToken: string,
  chatId: string,
  text: string,
  timeoutMs: number
): Promise<void> {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Telegram send failed (${response.status}): ${body}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

export async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  text: string,
  options?: {
    timeoutMs?: number;
    retries?: number;
    retryDelayMs?: number;
  }
): Promise<void> {
  const timeoutMs = options?.timeoutMs ?? 15000;
  const retries = options?.retries ?? 2;
  const retryDelayMs = options?.retryDelayMs ?? 2000;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      await sendOnce(botToken, chatId, text, timeoutMs);
      return;
    } catch (error) {
      lastError = error;
      if (attempt === retries) {
        break;
      }
      await sleep(retryDelayMs * (attempt + 1));
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Telegram send failed');
}
