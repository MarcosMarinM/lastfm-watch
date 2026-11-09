'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createLastfmClient, LastfmError } = require('../src/lastfm');

function track(artist, name, uts, options = {}) {
  return {
    artist: { '#text': artist },
    name,
    album: { '#text': options.album == null ? 'Album' : options.album },
    date: { uts: String(uts) },
    ...(options.nowplaying ? { '@attr': { nowplaying: 'true' } } : {})
  };
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    text: async () => JSON.stringify(body)
  };
}

function client(fetchImpl, overrides = {}) {
  return createLastfmClient({
    apiKey: 'key',
    username: 'user',
    fetchImpl,
    minIntervalMs: 0,
    maxRetries: 0,
    sleepImpl: async () => {},
    ...overrides
  });
}

test('fetchWindow paginates and skips now playing', async () => {
  let calls = 0;
  const fetchImpl = async (url) => {
    calls += 1;
    const page = Number(url.searchParams.get('page'));
    if (page === 1) {
      return jsonResponse({
        recenttracks: {
          track: [track('A', 'T1', 100), track('A', 'T2', 99), track('A', 'Now', 0, { nowplaying: true })],
          '@attr': { totalPages: '2' }
        }
      });
    }
    return jsonResponse({
      recenttracks: {
        track: [track('A', 'T3', 98)],
        '@attr': { totalPages: '2' }
      }
    });
  };

  const scrobbles = await client(fetchImpl).fetchWindow({ fromSec: 90, toSec: 200 });
  assert.equal(calls, 2);
  assert.deepEqual(scrobbles.map((item) => item.title), ['T3', 'T2', 'T1']);
});

test('fetchHistory walks backwards until the API has no more pages', async () => {
  const oldestPage = Array.from({ length: 200 }, (_, index) =>
    track('A', `T${index}`, 1000 - index)
  );

  const fetchImpl = async (url) => {
    const to = Number(url.searchParams.get('to'));
    if (to === 1100) {
      return jsonResponse({ recenttracks: { track: oldestPage } });
    }
    if (to === 800) {
      return jsonResponse({ recenttracks: { track: [track('A', 'Old', 700)] } });
    }
    return jsonResponse({ recenttracks: { track: [] } });
  };

  const scrobbles = await client(fetchImpl).fetchHistory({ beforeSec: 1100 });
  assert.equal(scrobbles.length, 201);
  assert.equal(scrobbles[0].title, 'Old');
});

test('fetchHistory stops at stopAfterSec', async () => {
  const page = Array.from({ length: 200 }, (_, index) => track('A', `T${index}`, 1000 - index));
  const fetchImpl = async () =>
    jsonResponse({ recenttracks: { track: page } });

  const scrobbles = await client(fetchImpl).fetchHistory({
    beforeSec: 1100,
    stopAfterSec: 850
  });
  assert.equal(scrobbles.length, 150);
  assert.equal(scrobbles[0].title, 'T149');
  assert.equal(scrobbles[scrobbles.length - 1].title, 'T0');
});

test('raises a Last.fm error from an API error payload', async () => {
  const fetchImpl = async () => jsonResponse({ error: 6, message: 'User not found' });
  await assert.rejects(
    () => client(fetchImpl).fetchWindow({ fromSec: 0, toSec: 1 }),
    (error) => error instanceof LastfmError && /User not found/.test(error.message)
  );
});

test('retries server errors', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    if (calls === 1) return jsonResponse({ error: 8, message: 'Operation failed' }, 500);
    return jsonResponse({
      recenttracks: { track: [track('A', 'T1', 100)], '@attr': { totalPages: '1' } }
    });
  };

  const scrobbles = await client(fetchImpl, { maxRetries: 1 }).fetchWindow({
    fromSec: 90,
    toSec: 200
  });
  assert.equal(calls, 2);
  assert.equal(scrobbles.length, 1);
});
