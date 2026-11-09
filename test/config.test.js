'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadConfig } = require('../src/config');

const base = {
  LASTFM_API_KEY: 'key',
  LASTFM_USERNAME: 'user',
  TELEGRAM_BOT_TOKEN: 'token',
  TELEGRAM_CHAT_ID: '123'
};

test('loads defaults', () => {
  const config = loadConfig(base);
  assert.equal(config.windowDays, 8);
  assert.equal(config.maxFindings, 25);
  assert.equal(config.timeZone, 'Europe/Madrid');
  assert.equal(config.dryRun, false);
  assert.equal(config.notifyIfClean, true);
});

test('requires Last.fm credentials', () => {
  assert.throws(() => loadConfig({}), /LASTFM_API_KEY.*LASTFM_USERNAME/);
});

test('dry run does not require Telegram credentials', () => {
  const config = loadConfig({
    LASTFM_API_KEY: 'key',
    LASTFM_USERNAME: 'user',
    DRY_RUN: '1'
  });
  assert.equal(config.dryRun, true);
});

test('parses NOW and HISTORY_SINCE', () => {
  const config = loadConfig({
    ...base,
    NOW: '2026-11-09T08:00:00Z',
    HISTORY_SINCE: '2020-01-01'
  });
  assert.equal(config.nowMs, Date.parse('2026-11-09T08:00:00Z'));
  assert.equal(config.historySinceMs, Date.parse('2020-01-01'));
});

test('rejects invalid values', () => {
  assert.throws(() => loadConfig({ ...base, WINDOW_DAYS: 'abc' }), /WINDOW_DAYS/);
  assert.throws(() => loadConfig({ ...base, WINDOW_DAYS: '8.5' }), /entero/);
  assert.throws(() => loadConfig({ ...base, MAX_FINDINGS: '0' }), /MAX_FINDINGS/);
  assert.throws(() => loadConfig({ ...base, TIMEZONE: 'Mars/Olympus' }), /TIMEZONE/);
});
