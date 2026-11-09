'use strict';

const DEFAULT_TIME_ZONE = 'Europe/Madrid';

function fail(message) {
  throw new Error(message);
}

function toNumber(value, fallback, name, { min = 0 } = {}) {
  if (value == null || value === '') return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min) {
    fail(`${name} debe ser un número mayor o igual que ${min}`);
  }
  return number;
}

function toBoolean(value, fallback = false) {
  if (value == null || value === '') return fallback;
  return /^(1|true|yes|si|sí|on)$/i.test(String(value).trim());
}

function parseInstant(value, name) {
  if (!value) return null;
  const text = String(value).trim();
  if (/^\d+$/.test(text)) {
    const number = Number(text);
    return number < 1e12 ? number * 1000 : number;
  }
  const ms = Date.parse(text);
  if (!Number.isFinite(ms)) fail(`${name} no es una fecha válida: ${value}`);
  return ms;
}

function loadConfig(env = process.env) {
  const dryRun = toBoolean(env.DRY_RUN, false);
  const config = {
    lastfmApiKey: (env.LASTFM_API_KEY || '').trim(),
    lastfmUser: (env.LASTFM_USERNAME || '').trim(),
    telegramToken: (env.TELEGRAM_BOT_TOKEN || '').trim(),
    telegramChatId: (env.TELEGRAM_CHAT_ID || '').trim(),
    windowDays: toNumber(env.WINDOW_DAYS, 8, 'WINDOW_DAYS', { min: 1 }),
    maxFindings: toNumber(env.MAX_FINDINGS, 25, 'MAX_FINDINGS', { min: 1 }),
    timeZone: (env.TIMEZONE || DEFAULT_TIME_ZONE).trim(),
    dryRun,
    notifyIfClean: toBoolean(env.NOTIFY_IF_CLEAN, true),
    minIntervalMs: toNumber(env.LASTFM_MIN_INTERVAL_MS, 250, 'LASTFM_MIN_INTERVAL_MS', { min: 0 }),
    retries: toNumber(env.LASTFM_RETRIES, 4, 'LASTFM_RETRIES', { min: 0 }),
    nowMs: parseInstant(env.NOW, 'NOW') || Date.now(),
    historySinceMs: parseInstant(env.HISTORY_SINCE, 'HISTORY_SINCE')
  };

  const missing = [];
  if (!config.lastfmApiKey) missing.push('LASTFM_API_KEY');
  if (!config.lastfmUser) missing.push('LASTFM_USERNAME');
  if (!dryRun) {
    if (!config.telegramToken) missing.push('TELEGRAM_BOT_TOKEN');
    if (!config.telegramChatId) missing.push('TELEGRAM_CHAT_ID');
  }
  if (missing.length) fail(`Faltan variables de entorno: ${missing.join(', ')}`);
  if (!Number.isInteger(config.windowDays)) fail('WINDOW_DAYS debe ser un número entero');
  if (!Number.isInteger(config.maxFindings)) fail('MAX_FINDINGS debe ser un número entero');

  try {
    new Intl.DateTimeFormat('es-ES', { timeZone: config.timeZone });
  } catch (error) {
    fail(`TIMEZONE no es válida: ${config.timeZone}`);
  }

  return config;
}

module.exports = { loadConfig, DEFAULT_TIME_ZONE };
