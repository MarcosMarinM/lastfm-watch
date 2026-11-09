'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { main } = require('../src/run');

function track(artist, name, album, uts) {
  return {
    artist: { '#text': artist },
    name,
    album: { '#text': album },
    date: { uts: String(uts) }
  };
}

function jsonResponse(body) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    text: async () => JSON.stringify(body)
  };
}

test('runs the whole pipeline in dry-run mode', async () => {
  const nowMs = Date.UTC(2026, 10, 9, 8, 0, 0);
  const windowDays = 8;
  const windowStartSec = Math.floor((nowMs - windowDays * 24 * 60 * 60 * 1000) / 1000);
  const calls = [];

  const originalFetch = globalThis.fetch;
  const originalWrite = process.stdout.write;
  process.stdout.write = () => true;

  globalThis.fetch = async (url) => {
    calls.push(url.toString());
    const from = url.searchParams.get('from');
    if (from != null) {
      return jsonResponse({
        recenttracks: {
          track: [track('Beyonce', 'Halo', 'I Am...', windowStartSec + 10)],
          '@attr': { totalPages: '1' }
        }
      });
    }
    return jsonResponse({
      recenttracks: {
        track: [
          track('Beyoncé', 'Halo', 'I Am...', windowStartSec - 100),
          track('Beyoncé', 'Halo', 'I Am...', windowStartSec - 200)
        ]
      }
    });
  };

  try {
    const result = await main({
      lastfmApiKey: 'key',
      lastfmUser: 'user',
      telegramToken: '',
      telegramChatId: '',
      windowDays,
      maxFindings: 10,
      timeZone: 'Europe/Madrid',
      dryRun: true,
      notifyIfClean: true,
      minIntervalMs: 0,
      retries: 0,
      nowMs,
      historySinceMs: null
    });

    assert.equal(calls.length, 2);
    assert.equal(result.total, 1);
    assert.equal(result.findings[0].kind, 'artist_formatting');
    assert.equal(result.findings[0].proposed, 'Beyoncé');
  } finally {
    globalThis.fetch = originalFetch;
    process.stdout.write = originalWrite;
  }
});
