'use strict';

const { loadConfig } = require('./config');
const { createLastfmClient } = require('./lastfm');
const { buildHistory } = require('./history');
const { detect } = require('./detect');
const { buildMessages, escapeHtml } = require('./format');
const { sendMessages } = require('./telegram');
const { redact, sleep } = require('./util');

function log(message) {
  process.stdout.write(`[${new Date().toISOString()}] ${message}\n`);
}

async function main(config = loadConfig()) {
  const windowMs = config.windowDays * 24 * 60 * 60 * 1000;
  const windowStartMs = config.nowMs - windowMs;
  const windowStartSec = Math.floor(windowStartMs / 1000);
  const nowSec = Math.floor(config.nowMs / 1000);
  const historySinceSec =
    config.historySinceMs == null ? 0 : Math.floor(config.historySinceMs / 1000);

  log(`Usuario: ${config.lastfmUser}`);
  log(
    `Ventana: ${config.windowDays} días (${new Date(windowStartMs).toISOString()} → ${new Date(
      config.nowMs
    ).toISOString()})`
  );

  const client = createLastfmClient({
    apiKey: config.lastfmApiKey,
    username: config.lastfmUser,
    minIntervalMs: config.minIntervalMs,
    maxRetries: config.retries
  });

  log('Leyendo historial anterior a la ventana…');
  const historyScrobbles = await client.fetchHistory({
    beforeSec: windowStartSec - 1,
    stopAfterSec: historySinceSec,
    onProgress: (requests, collected) => {
      if (requests === 1 || requests % 20 === 0) {
        log(`  historial: ${requests} petición(es), ${collected} scrobble(s)`);
      }
    }
  });
  log(`Historial: ${historyScrobbles.length} scrobble(s)`);

  const history = buildHistory(historyScrobbles);

  log('Leyendo la ventana reciente…');
  const recent = await client.fetchWindow({
    fromSec: windowStartSec,
    toSec: nowSec,
    onProgress: (page, totalPages) => log(`  ventana: página ${page}/${totalPages}`)
  });
  log(`Ventana: ${recent.length} scrobble(s)`);

  const result = detect(recent, history, {
    maxFindings: config.maxFindings,
    fromMs: windowStartMs,
    toMs: config.nowMs
  });

  const messages = buildMessages(result, config);

  if (config.dryRun) {
    log(`DRY_RUN: ${messages.length} mensaje(s) preparados`);
    for (let index = 0; index < messages.length; index += 1) {
      process.stdout.write(
        `\n--- mensaje ${index + 1}/${messages.length} ---\n${messages[index]}\n`
      );
    }
    return result;
  }

  if (!messages.length) {
    log('No hay nada que enviar (NOTIFY_IF_CLEAN=0 y sin incoherencias).');
    return result;
  }

  await sendMessages({
    token: config.telegramToken,
    chatId: config.telegramChatId,
    messages,
    sleepImpl: sleep
  });
  log(`Enviado(s) ${messages.length} mensaje(s) a Telegram.`);
  return result;
}

if (require.main === module) {
  let config;
  try {
    config = loadConfig();
  } catch (error) {
    log(`ERROR: ${error.message}`);
    process.exitCode = 1;
  }

  if (config) {
    main(config).catch(async (error) => {
      process.stderr.write(`${redact(error && error.stack ? error.stack : error)}\n`);
      if (!config.dryRun && config.telegramToken && config.telegramChatId) {
        try {
          await sendMessages({
            token: config.telegramToken,
            chatId: config.telegramChatId,
            messages: [
              `⚠️ <b>La revisión semanal de Last.fm falló</b>\n<code>${escapeHtml(
                redact(error.message || error)
              )}</code>`
            ],
            sleepImpl: sleep
          });
        } catch (sendError) {
          process.stderr.write(`No se pudo avisar por Telegram: ${redact(sendError.message)}\n`);
        }
      }
      process.exitCode = 1;
    });
  }
}

module.exports = { main };
