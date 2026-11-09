'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildHistory } = require('../src/history');

function scrobble(artist, title, album, ts) {
  return { artist, title, album, ts };
}

test('buildHistory aggregates artists, tracks and albums', () => {
  const history = buildHistory([
    scrobble('Beyoncé', 'Halo', 'I Am...', 1000),
    scrobble('Beyonce', 'Halo', 'I Am...', 2000),
    scrobble('Beyoncé', 'Halo', 'I Am...', 3000),
    scrobble('Beyoncé', 'Crazy in Love', 'Dangerously in Love', 4000)
  ]);

  assert.equal(history.scrobbles, 4);

  const artistKey = 'beyonce';
  const artist = history.artists[artistKey];
  assert.equal(artist.n, 4);
  assert.equal(artist.first, 1000);
  assert.equal(artist.last, 4000);
  assert.equal(artist.spellings['Beyoncé'].n, 3);
  assert.equal(artist.spellings.Beyonce.n, 1);

  const track = history.tracks[artistKey].halo;
  assert.equal(track.n, 3);
  assert.equal(track.spellings.Halo.n, 3);
  assert.equal(track.albums['i am'], 3);

  const album = history.albums[artistKey]['i am'];
  assert.equal(album.n, 3);
  assert.equal(album.spellings['I Am...'].n, 3);
});
