'use strict';

const { sleep } = require('./util');

const API_URL = 'https://ws.audioscrobbler.com/2.0/';
const PAGE_SIZE = 200;

class LastfmError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'LastfmError';
    this.code = options.code;
    this.method = options.method;
  }
}

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function text(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') return String(value['#text'] || '');
  return String(value);
}

function normalizeTrack(track) {
  if (!track) return null;
  if (track['@attr'] && track['@attr'].nowplaying === 'true') return null;
  const uts = track.date && track.date.uts;
  if (!uts) return null;
  const timestamp = Number(uts) * 1000;
  if (!Number.isFinite(timestamp)) return null;
  const artist = text(track.artist).trim();
  const title = text(track.name).trim();
  const album = text(track.album).trim();
  if (!artist && !title) return null;
  return { artist, title, album, ts: timestamp };
}

function createLastfmClient(options) {
  const apiKey = options.apiKey;
  const username = options.username;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const minIntervalMs = options.minIntervalMs == null ? 250 : options.minIntervalMs;
  const maxRetries = options.maxRetries == null ? 4 : options.maxRetries;
  const sleepImpl = options.sleepImpl || sleep;
  let lastRequestAt = 0;

  async function throttle() {
    const wait = minIntervalMs - (Date.now() - lastRequestAt);
    if (wait > 0) await sleepImpl(wait);
    lastRequestAt = Date.now();
  }

  function backoff(attempt) {
    return Math.min(1000 * 2 ** attempt, 8000);
  }

  async function request(params, attempt = 0) {
    await throttle();

    const url = new URL(API_URL);
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('format', 'json');
    for (const [name, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(name, String(value));
      }
    }

    let response;
    let body;
    try {
      response = await fetchImpl(url, { headers: { 'user-agent': 'lastfm-watch/1.0' } });
      body = await response.text();
    } catch (error) {
      if (attempt < maxRetries) {
        await sleepImpl(backoff(attempt));
        return request(params, attempt + 1);
      }
      throw new LastfmError(`No se pudo contactar con Last.fm (${params.method})`, {
        method: params.method
      });
    }

    let json = null;
    try {
      json = JSON.parse(body);
    } catch (error) {
      json = null;
    }

    const rateLimited = response.status === 429 || (json && json.error === 29);
    if ((rateLimited || response.status >= 500) && attempt < maxRetries) {
      const retryAfter =
        response.headers && response.headers.get ? Number(response.headers.get('retry-after')) : 0;
      await sleepImpl(retryAfter > 0 ? retryAfter * 1000 : backoff(attempt));
      return request(params, attempt + 1);
    }

    if (!response.ok) {
      throw new LastfmError(`Last.fm respondió HTTP ${response.status} (${params.method})`, {
        method: params.method
      });
    }
    if (!json) {
      throw new LastfmError(`Last.fm devolvió una respuesta no válida (${params.method})`, {
        method: params.method
      });
    }
    if (json.error) {
      throw new LastfmError(
        `Last.fm: ${json.message || 'error desconocido'} (código ${json.error}, ${params.method})`,
        { code: json.error, method: params.method }
      );
    }

    return json;
  }

  async function fetchWindow({ fromSec, toSec, onProgress } = {}) {
    const scrobbles = [];
    const seen = new Set();
    let page = 1;
    let totalPages = 1;

    do {
      const data = await request({
        method: 'user.getRecentTracks',
        user: username,
        from: fromSec,
        to: toSec,
        limit: PAGE_SIZE,
        page
      });

      const attributes = (data.recenttracks && data.recenttracks['@attr']) || {};
      totalPages = Number(attributes.totalPages) || 1;

      for (const track of asArray(data.recenttracks && data.recenttracks.track)) {
        const scrobble = normalizeTrack(track);
        if (!scrobble) continue;
        if (fromSec != null && scrobble.ts < fromSec * 1000) continue;
        if (toSec != null && scrobble.ts > toSec * 1000) continue;
        const id = `${scrobble.ts}\u0000${scrobble.artist}\u0000${scrobble.title}\u0000${scrobble.album}`;
        if (seen.has(id)) continue;
        seen.add(id);
        scrobbles.push(scrobble);
      }

      if (onProgress) onProgress(page, totalPages);
      page += 1;
    } while (page <= totalPages);

    scrobbles.sort((a, b) => a.ts - b.ts);
    return scrobbles;
  }

  async function fetchHistory({ beforeSec, stopAfterSec = 0, onProgress } = {}) {
    const stop = Math.max(Number(stopAfterSec) || 0, 0);
    if (beforeSec == null || beforeSec <= stop) return [];

    const scrobbles = [];
    const seen = new Set();
    let to = beforeSec;
    let requests = 0;

    while (to > stop) {
      const data = await request({
        method: 'user.getRecentTracks',
        user: username,
        to,
        limit: PAGE_SIZE,
        page: 1
      });

      requests += 1;
      const tracks = asArray(data.recenttracks && data.recenttracks.track);
      let oldest = Infinity;

      for (const track of tracks) {
        const scrobble = normalizeTrack(track);
        if (!scrobble) continue;
        const seconds = Math.floor(scrobble.ts / 1000);
        if (seconds < oldest) oldest = seconds;
        if (seconds > beforeSec || seconds <= stop) continue;
        const id = `${scrobble.ts}\u0000${scrobble.artist}\u0000${scrobble.title}\u0000${scrobble.album}`;
        if (seen.has(id)) continue;
        seen.add(id);
        scrobbles.push(scrobble);
      }

      if (onProgress) onProgress(requests, scrobbles.length, oldest);
      if (!tracks.length) break;
      if (!Number.isFinite(oldest)) break;
      if (tracks.length < PAGE_SIZE) break;

      const next = oldest - 1;
      if (next >= to) break;
      to = next;
    }

    scrobbles.sort((a, b) => a.ts - b.ts);
    return scrobbles;
  }

  return { fetchWindow, fetchHistory };
}

module.exports = { createLastfmClient, LastfmError, normalizeTrack };
