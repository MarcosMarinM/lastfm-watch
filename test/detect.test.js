'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildHistory } = require('../src/history');
const { detect } = require('../src/detect');

function scrobble(artist, title, album, ts) {
  return { artist, title, album, ts };
}

function kinds(result) {
  return result.findings.map((finding) => finding.kind);
}

test('detects a new artist spelling variant', () => {
  const history = buildHistory([scrobble('Beyoncé', 'Halo', 'I Am...', 1)]);
  const result = detect([scrobble('Beyonce', 'Halo', 'I Am...', 10)], history, {});
  assert.deepEqual(kinds(result), ['artist_formatting']);
  assert.equal(result.findings[0].current, 'Beyonce');
  assert.equal(result.findings[0].proposed, 'Beyoncé');
  assert.equal(result.findings[0].isNew, true);
});

test('does not flag the canonical spelling', () => {
  const history = buildHistory([scrobble('Beyoncé', 'Halo', 'I Am...', 1)]);
  const result = detect([scrobble('Beyoncé', 'Halo', 'I Am...', 10)], history, {});
  assert.equal(result.total, 0);
});

test('flags a known non-canonical variant as already existing', () => {
  const history = buildHistory([
    scrobble('Beyoncé', 'Halo', 'I Am...', 1),
    scrobble('Beyoncé', 'Halo', 'I Am...', 2),
    scrobble('Beyoncé', 'Halo', 'I Am...', 3),
    scrobble('Beyonce', 'Halo', 'I Am...', 4)
  ]);
  const result = detect([scrobble('Beyonce', 'Halo', 'I Am...', 10)], history, {});
  assert.deepEqual(kinds(result), ['artist_formatting']);
  assert.equal(result.findings[0].isNew, false);
});

test('detects an artist typo with a shared track', () => {
  const history = buildHistory([scrobble('Beyoncé', 'Halo', 'I Am...', 1)]);
  const result = detect([scrobble('Beyoncee', 'Halo', 'I Am...', 10)], history, {});
  assert.deepEqual(kinds(result), ['artist_typo']);
  assert.equal(result.findings[0].proposed, 'Beyoncé');
});

test('detects track formatting variants', () => {
  const history = buildHistory([scrobble('Dua Lipa', 'Levitating', 'Future Nostalgia', 1)]);
  const result = detect([scrobble('Dua Lipa', 'levitating', 'Future Nostalgia', 10)], history, {});
  assert.deepEqual(kinds(result), ['track_formatting']);
  assert.equal(result.findings[0].proposed, 'Levitating');
});

test('detects platform badges', () => {
  const history = buildHistory([scrobble('Dua Lipa', 'Levitating', 'Future Nostalgia', 1)]);
  const result = detect(
    [scrobble('Dua Lipa', 'Levitating (Official Video)', 'Future Nostalgia', 10)],
    history,
    {}
  );
  assert.deepEqual(kinds(result), ['track_badge']);
  assert.equal(result.findings[0].proposed, 'Levitating');
});

test('ignores version markers such as live or remix', () => {
  const history = buildHistory([scrobble('Dua Lipa', 'Levitating', 'Future Nostalgia', 1)]);
  for (const title of ['Levitating (Live)', 'Levitating (Remix)', 'Levitating - Acoustic']) {
    const result = detect([scrobble('Dua Lipa', title, 'Future Nostalgia', 10)], history, {});
    assert.equal(result.total, 0, title);
  }
});

test('detects probable track typos', () => {
  const history = buildHistory([scrobble('Dua Lipa', 'Levitating', 'Future Nostalgia', 1)]);
  const result = detect([scrobble('Dua Lipa', 'Levitatin', 'Future Nostalgia', 10)], history, {});
  assert.deepEqual(kinds(result), ['track_typo']);
  assert.equal(result.findings[0].proposed, 'Levitating');
});

test('does not flag a genuinely new title', () => {
  const history = buildHistory([scrobble('Dua Lipa', 'Levitating', 'Future Nostalgia', 1)]);
  const result = detect([scrobble('Dua Lipa', 'Houdini', 'Radical Optimism', 10)], history, {});
  assert.equal(result.total, 0);
});

test('detects album formatting variants', () => {
  const history = buildHistory([
    scrobble('Dua Lipa', 'Levitating', 'Future Nostalgia', 1)
  ]);
  const result = detect(
    [scrobble('Dua Lipa', 'Levitating', 'future nostalgia', 10)],
    history,
    {}
  );
  assert.deepEqual(kinds(result), ['album']);
  assert.equal(result.findings[0].proposed, 'Future Nostalgia');
});

test('detects featuring credits in artist and title', () => {
  const history = buildHistory([scrobble('Ana', 'Song', 'Album', 1)]);
  const artistResult = detect([scrobble('Ana feat. Bob', 'Song', 'Album', 10)], history, {});
  assert.deepEqual(kinds(artistResult), ['artist_feat']);

  const titleResult = detect([scrobble('Ana', 'Song (feat. Bob)', 'Album', 10)], history, {});
  assert.deepEqual(kinds(titleResult), ['track_feat']);
});

test('detects the artist repeated in the title', () => {
  const history = buildHistory([scrobble('Nina', 'Amame', 'Album', 1)]);
  const result = detect([scrobble('Nina', 'Nina - Amame', 'Album', 10)], history, {});
  assert.deepEqual(kinds(result), ['artist_in_title']);
  assert.equal(result.findings[0].proposed, 'Amame');
});

test('returns nothing when there is no previous history', () => {
  const result = detect([scrobble('Anyone', 'Anything', 'Anywhere', 10)], buildHistory([]), {});
  assert.equal(result.total, 0);
});

test('limits the number of findings but reports the total', () => {
  const history = buildHistory([
    scrobble('Artist A', 'Song', 'Album', 1),
    scrobble('Artist B', 'Song', 'Album', 2),
    scrobble('Artist C', 'Song', 'Album', 3)
  ]);
  const result = detect(
    [
      scrobble('artist a', 'Song', 'Album', 10),
      scrobble('artist b', 'Song', 'Album', 11),
      scrobble('artist c', 'Song', 'Album', 12)
    ],
    history,
    { maxFindings: 2 }
  );
  assert.equal(result.total, 3);
  assert.equal(result.findings.length, 2);
});
