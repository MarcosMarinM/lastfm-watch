'use strict';

const { sleep } = require('./util');

class TelegramError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TelegramError';
  }
}

async function sendMessage(options) {
  const token = options.token;
  const chatId = options.chatId;
  const text = options.text;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const sleepImpl = options.sleepImpl || sleep;
  const maxAttempts = options.maxAttempts == null ? 3 : options.maxAttempts;

  let attempt = 0;
  while (true) {
    let response;
    let body;

    try {
      response = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
          disable_web_page_preview: true
        })
      });
      body = await response.text();
    } catch (error) {
      if (attempt + 1 < maxAttempts) {
        attempt += 1;
        await sleepImpl(1000 * attempt);
        continue;
      }
      throw new TelegramError('No se pudo contactar con Telegram');
    }

    let json = null;
    try {
      json = JSON.parse(body);
    } catch (error) {
      json = null;
    }

    if (response.ok && json && json.ok) return json.result;

    if (response.status === 429 && attempt + 1 < maxAttempts) {
      const retryAfter = json && json.parameters && json.parameters.retry_after;
      attempt += 1;
      await sleepImpl((Number(retryAfter) || 2) * 1000);
      continue;
    }

    const description = (json && json.description) || `HTTP ${response.status}`;
    throw new TelegramError(`Telegram rechazó el mensaje: ${description}`);
  }
}

async function sendMessages(options) {
  const messages = options.messages || [];
  for (let index = 0; index < messages.length; index += 1) {
    await sendMessage({ ...options, text: messages[index] });
    if (index + 1 < messages.length) await (options.sleepImpl || sleep)(1100);
  }
}

module.exports = { sendMessage, sendMessages, TelegramError };
