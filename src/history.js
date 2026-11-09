'use strict';

const { artistKey, key, looseTitleKey } = require('./names');

function bumpSpelling(map, raw, timestamp) {
  if (!raw) return;
  let spelling = map[raw];
  if (!spelling) {
    spelling = map[raw] = { n: 0, first: timestamp, last: timestamp };
  }
  spelling.n += 1;
  if (timestamp < spelling.first) spelling.first = timestamp;
  if (timestamp > spelling.last) spelling.last = timestamp;
}

function buildHistory(scrobbles) {
  const history = { scrobbles: 0, artists: {}, tracks: {}, albums: {} };

  for (const scrobble of scrobbles) {
    if (!scrobble || (!scrobble.artist && !scrobble.title)) continue;
    const timestamp = Number.isFinite(scrobble.ts) ? scrobble.ts : 0;
    const artistKeyValue = artistKey(scrobble.artist);
    if (!artistKeyValue) continue;

    history.scrobbles += 1;

    let artist = history.artists[artistKeyValue];
    if (!artist) {
      artist = history.artists[artistKeyValue] = {
        n: 0,
        first: timestamp,
        last: timestamp,
        spellings: {}
      };
    }
    artist.n += 1;
    if (timestamp < artist.first) artist.first = timestamp;
    if (timestamp > artist.last) artist.last = timestamp;
    bumpSpelling(artist.spellings, scrobble.artist, timestamp);

    const trackKey = looseTitleKey(scrobble.title);
    if (trackKey) {
      let tracks = history.tracks[artistKeyValue];
      if (!tracks) tracks = history.tracks[artistKeyValue] = {};
      let track = tracks[trackKey];
      if (!track) {
        track = tracks[trackKey] = {
          n: 0,
          first: timestamp,
          last: timestamp,
          spellings: {},
          albums: {}
        };
      }
      track.n += 1;
      if (timestamp < track.first) track.first = timestamp;
      if (timestamp > track.last) track.last = timestamp;
      bumpSpelling(track.spellings, scrobble.title, timestamp);
      if (scrobble.album) {
        const albumKey = key(scrobble.album);
        if (albumKey) track.albums[albumKey] = (track.albums[albumKey] || 0) + 1;
      }
    }

    if (scrobble.album) {
      const albumKey = key(scrobble.album);
      if (albumKey) {
        let albums = history.albums[artistKeyValue];
        if (!albums) albums = history.albums[artistKeyValue] = {};
        let album = albums[albumKey];
        if (!album) {
          album = albums[albumKey] = {
            n: 0,
            first: timestamp,
            last: timestamp,
            spellings: {}
          };
        }
        album.n += 1;
        if (timestamp < album.first) album.first = timestamp;
        if (timestamp > album.last) album.last = timestamp;
        bumpSpelling(album.spellings, scrobble.album, timestamp);
      }
    }
  }

  return history;
}

module.exports = { buildHistory };
