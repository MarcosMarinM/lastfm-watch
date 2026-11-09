'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildMessages, MESSAGE_LIMIT } = require('../src/format');

const config = {
  windowDays: 8,
  timeZone: 'Europe/Madrid',
  notifyIfClean: true
};

const stats = {
  scrobbles: 120,
  artists: 30,
  historyScrobbles: 5000,
  fromMs: Date.UTC(2026, 10, 1),
  toMs: Date.UTC(2026, 10, 9)
};

function finding(overrides = {}) {
  return {
    kind: 'artist_formatting',
    label: 'Artista',
    count: 2,
    artist: '',
    current: 'Beyonce',
    proposed: 'Beyoncé',
    isNew: true,
    note: '',
    firstTs: Date.UTC(2026, 10, 8),
    lastTs: Date.UTC(2026, 10, 8),
    examples: [{ title: 'Halo', album: 'I Am...' }],
    ...overrides
  };
}

test('builds a digest with findings', () => {
  const messages = buildMessages(
    { total: 1, findings: [finding()], stats },
    config
  );
  assert.equal(messages.length, 1);
  assert.match(messages[0], /Beyonce/);
  assert.match(messages[0], /Beyoncé/);
  assert.match(messages[0], /nuevo en la ventana/);
  assert.match(messages[0], /Halo/);
});

test('builds a clean-week message', () => {
  const messages = buildMessages({ total: 0, findings: [], stats }, config);
  assert.equal(messages.length, 1);
  assert.match(messages[0], /Sin incoherencias/);
});

test('can skip clean weeks', () => {
  const messages = buildMessages(
    { total: 0, findings: [], stats },
    { ...config, notifyIfClean: false }
  );
  assert.deepEqual(messages, []);
});

test('escapes HTML from Last.fm data', () => {
  const messages = buildMessages(
    {
      total: 1,
      findings: [finding({ current: '<b>Beyonce</b>', proposed: 'Beyoncé' })],
      stats
    },
    config
  );
  assert.doesNotMatch(messages[0], /<b>Beyonce<\/b>/);
  assert.match(messages[0], /&lt;b&gt;Beyonce&lt;\/b&gt;/);
});

test('splits long digests below the Telegram limit', () => {
  const findings = Array.from({ length: 80 }, (_, index) =>
    finding({
      current: `Artist ${index} ${'x'.repeat(80)}`,
      proposed: `Artist ${index} ${'y'.repeat(80)}`
    })
  );
  const messages = buildMessages(
    { total: findings.length, findings, stats },
    config
  );
  assert.ok(messages.length > 1);
  for (const message of messages) {
    assert.ok(message.length <= MESSAGE_LIMIT, `message length ${message.length}`);
  }
});
