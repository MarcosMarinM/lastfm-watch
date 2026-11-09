'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const names = require('../src/names');

test('artistKey collapses case, accents and punctuation', () => {
  assert.equal(names.artistKey('Beyoncé'), names.artistKey('BEYONCE'));
  assert.equal(names.artistKey('The Beatles'), names.artistKey('Beatles'));
  assert.equal(names.artistKey('Ana feat. Bob'), 'ana bob');
  assert.equal(names.featBase('Ana feat. Bob'), 'Ana');
  assert.equal(names.featBase('Ana (feat. Bob)'), 'Ana');
  assert.equal(names.featBase('The Feature'), 'The Feature');
});

test('looseTitleKey drops qualifiers and featuring credits', () => {
  assert.equal(names.looseTitleKey('Song (Live)'), 'song');
  assert.equal(names.looseTitleKey('Song (feat. Bob)'), 'song');
  assert.equal(names.looseTitleKey('Song - Remastered 2011'), 'song');
});

test('stripPlatformBadges removes video and audio badges only', () => {
  assert.equal(names.stripPlatformBadges('Song (Official Video)'), 'Song');
  assert.equal(names.stripPlatformBadges('Song - Official Audio'), 'Song');
  assert.equal(names.stripPlatformBadges('Song (Live)'), 'Song (Live)');
  assert.equal(names.stripPlatformBadges('Song (from the movie X)'), 'Song (from the movie X)');
});

test('isVersionMarker spots different recordings', () => {
  assert.equal(names.isVersionMarker('Song (Live)'), true);
  assert.equal(names.isVersionMarker('Song - Acoustic'), true);
  assert.equal(names.isVersionMarker('Song (Official Video)'), false);
  assert.equal(names.isVersionMarker('Song'), false);
});

test('titleRepeatsArtist extracts the real title', () => {
  assert.equal(names.titleRepeatsArtist('Nina', 'Nina - Amame'), 'Amame');
  assert.equal(names.titleRepeatsArtist('Nina', 'Nina: Amame'), 'Amame');
  assert.equal(names.titleRepeatsArtist('Nina', 'Amame'), null);
});

test('editDistance is bounded', () => {
  assert.equal(names.editDistance('patataa', 'patata', 2), 1);
  assert.equal(names.editDistance('levitatin', 'levitating', 2), 1);
  assert.equal(names.editDistance('abc', 'xyz', 1), 2);
});

test('sameModuloOrdinals protects numbered songs', () => {
  assert.equal(names.sameModuloOrdinals('lugar i', 'lugar ii'), true);
  assert.equal(names.sameModuloOrdinals('track 1', 'track 2'), true);
  assert.equal(names.sameModuloOrdinals('patata', 'patataa'), false);
});

test('pickCanonical prefers the most frequent spelling', () => {
  assert.equal(
    names.pickCanonical({
      'Beyoncé': { n: 5, last: 1 },
      Beyonce: { n: 2, last: 2 }
    }),
    'Beyoncé'
  );
  assert.equal(
    names.pickCanonical({
      Beyonce: { n: 5, last: 2 },
      'Beyoncé': { n: 5, last: 1 }
    }),
    'Beyonce'
  );
});
