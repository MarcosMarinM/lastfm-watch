'use strict';

const {
  key,
  artistKey,
  looseTitleKey,
  strictTitleKey,
  pickCanonical,
  stripPlatformBadges,
  isVersionMarker,
  hasFeatCredit,
  featBase,
  editDistance,
  sameModuloOrdinals,
  titleRepeatsArtist
} = require('./names');

const KIND_META = {
  artist_typo: { label: 'Posible error en el artista', priority: 100 },
  track_typo: { label: 'Posible error en el título', priority: 95 },
  track_badge: { label: 'Título con distintivo de vídeo', priority: 90 },
  artist_feat: { label: 'Artista con feat.', priority: 85 },
  track_feat: { label: 'Título con feat.', priority: 80 },
  artist_formatting: { label: 'Artista', priority: 75 },
  track_formatting: { label: 'Título', priority: 70 },
  artist_in_title: { label: 'Artista repetido en el título', priority: 65 },
  album: { label: 'Álbum', priority: 60 }
};

function subsetSpellings(spellings, keys) {
  const output = {};
  for (const spelling of keys) output[spelling] = spellings[spelling];
  return output;
}

function recordFindings(map, id, base, example, timestamp) {
  const ts = Number.isFinite(timestamp) ? timestamp : 0;
  let finding = map.get(id);
  if (!finding) {
    finding = {
      ...base,
      count: 0,
      firstTs: ts,
      lastTs: ts,
      examples: []
    };
    map.set(id, finding);
  }
  finding.count += 1;
  if (ts < finding.firstTs) finding.firstTs = ts;
  if (ts > finding.lastTs) finding.lastTs = ts;
  if (
    (example.title || example.album) &&
    finding.examples.length < 3 &&
    !finding.examples.some((item) => item.title === example.title && item.album === example.album)
  ) {
    finding.examples.push(example);
  }
}

function classifyArtist(raw, canonical) {
  if (raw === canonical) return null;
  const rawHasFeat = hasFeatCredit(raw);
  const canonicalHasFeat = hasFeatCredit(canonical);
  if (rawHasFeat && !canonicalHasFeat) return 'artist_feat';
  if (canonicalHasFeat && !rawHasFeat) return null;
  if (rawHasFeat && canonicalHasFeat) {
    return key(raw) === key(canonical) ? 'artist_formatting' : null;
  }
  return 'artist_formatting';
}

function classifyTrack(raw, entry) {
  const rawStrict = strictTitleKey(raw);
  const sameStrict = Object.keys(entry.spellings).filter(
    (spelling) => strictTitleKey(spelling) === rawStrict
  );
  if (sameStrict.length) {
    const proposed = pickCanonical(subsetSpellings(entry.spellings, sameStrict));
    if (proposed !== raw) {
      return { kind: 'track_formatting', proposed, isNew: !entry.spellings[raw] };
    }
    return null;
  }

  if (entry.spellings[raw]) return null;
  if (isVersionMarker(raw)) return null;

  const stripped = stripPlatformBadges(raw);
  if (stripped && stripped !== raw) {
    const strippedStrict = strictTitleKey(stripped);
    const matches = Object.keys(entry.spellings).filter(
      (spelling) => strictTitleKey(spelling) === strippedStrict
    );
    if (matches.length) {
      return {
        kind: 'track_badge',
        proposed: pickCanonical(subsetSpellings(entry.spellings, matches)),
        isNew: true
      };
    }
  }

  if (hasFeatCredit(raw)) {
    const clean = Object.keys(entry.spellings).filter((spelling) => !hasFeatCredit(spelling));
    if (clean.length) {
      return {
        kind: 'track_feat',
        proposed: pickCanonical(subsetSpellings(entry.spellings, clean)),
        isNew: true
      };
    }
  }

  return null;
}

function buildArtistIndex(history) {
  const byInitial = new Map();
  for (const artistKeyValue of Object.keys(history.artists)) {
    const initial = artistKeyValue.slice(0, 1);
    let bucket = byInitial.get(initial);
    if (!bucket) {
      bucket = [];
      byInitial.set(initial, bucket);
    }
    bucket.push(artistKeyValue);
  }
  return byInitial;
}

function findSimilarArtist(artistKeyValue, trackKeys, history, index) {
  if (!artistKeyValue || !trackKeys.size) return null;
  const bucket = index.get(artistKeyValue.slice(0, 1)) || [];
  let best = null;

  for (const candidate of bucket) {
    if (candidate === artistKeyValue) continue;
    const lengthDiff = Math.abs(artistKeyValue.length - candidate.length);
    if (lengthDiff > 2) continue;
    const max = Math.max(artistKeyValue.length, candidate.length) >= 8 ? 2 : 1;
    if (lengthDiff > max) continue;
    const distance = editDistance(artistKeyValue, candidate, max);
    if (distance < 1 || distance > max) continue;
    if (
      distance === 2 &&
      1 - distance / Math.max(artistKeyValue.length, candidate.length) < 0.875
    ) {
      continue;
    }

    const tracks = history.tracks[candidate];
    if (!tracks) continue;
    let shared = 0;
    for (const trackKey of trackKeys) {
      if (tracks[trackKey]) shared += 1;
    }
    if (!shared) continue;

    const score = shared * 10 - distance * 3;
    if (!best || score > best.score) {
      best = {
        key: candidate,
        entry: history.artists[candidate],
        shared,
        distance,
        score
      };
    }
  }

  return best;
}

function findTrackTypo(artistKeyValue, trackKey, scrobble, history) {
  const tracks = history.tracks[artistKeyValue];
  if (!tracks || trackKey.length < 4) return null;
  const initial = trackKey.slice(0, 1);
  const albumKey = scrobble.album ? key(scrobble.album) : '';
  let best = null;

  for (const candidateKey of Object.keys(tracks)) {
    if (candidateKey === trackKey) continue;
    if (candidateKey.slice(0, 1) !== initial) continue;
    if (Math.abs(candidateKey.length - trackKey.length) > 2) continue;
    if (sameModuloOrdinals(candidateKey, trackKey)) continue;
    if (isVersionMarker(candidateKey) || isVersionMarker(scrobble.title)) continue;

    const entry = tracks[candidateKey];
    const sharedAlbum = Boolean(albumKey && entry.albums[albumKey]);
    const max = sharedAlbum ? 2 : 1;
    if (Math.abs(candidateKey.length - trackKey.length) > max) continue;
    const distance = editDistance(trackKey, candidateKey, max);
    if (distance < 1 || distance > max) continue;
    if (
      distance === 2 &&
      1 - distance / Math.max(trackKey.length, candidateKey.length) < 0.8
    ) {
      continue;
    }

    const score = (sharedAlbum ? 5 : 0) + (distance === 1 ? 3 : 0) + Math.min(entry.n, 10) / 10;
    if (!best || score > best.score) {
      best = {
        proposed: pickCanonical(entry.spellings),
        distance,
        sharedAlbum,
        score
      };
    }
  }

  if (!best) return null;
  return {
    proposed: best.proposed,
    note:
      `Se parece a “${best.proposed}” (${best.distance} carácter(es) de diferencia` +
      (best.sharedAlbum ? ', mismo álbum' : '') +
      ').'
  };
}

function detect(recent, history, options = {}) {
  const maxFindings = options.maxFindings == null ? 25 : options.maxFindings;
  const findings = new Map();
  const byArtist = new Map();
  const recentTracks = new Set();

  for (const scrobble of recent) {
    if (!scrobble || (!scrobble.artist && !scrobble.title)) continue;
    const rawArtist = scrobble.artist || '';
    let bucket = byArtist.get(rawArtist);
    if (!bucket) {
      bucket = {
        raw: rawArtist,
        key: artistKey(rawArtist),
        scrobbles: [],
        trackKeys: new Set()
      };
      byArtist.set(rawArtist, bucket);
    }
    bucket.scrobbles.push(scrobble);
    const trackKey = looseTitleKey(scrobble.title);
    if (trackKey) {
      bucket.trackKeys.add(trackKey);
      recentTracks.add(`${bucket.key}\u0000${trackKey}`);
    }
  }

  const index = buildArtistIndex(history);

  for (const bucket of byArtist.values()) {
    const artistKeyValue = bucket.key;
    if (!artistKeyValue) continue;

    const exact = history.artists[artistKeyValue];
    if (!exact) {
      const baseText = featBase(bucket.raw);
      const baseKey = baseText ? artistKey(baseText) : '';
      if (baseKey && baseKey !== artistKeyValue && history.artists[baseKey]) {
        const canonical = pickCanonical(history.artists[baseKey].spellings);
        const base = {
          kind: 'artist_feat',
          artist: '',
          current: bucket.raw,
          proposed: canonical,
          isNew: true
        };
        for (const scrobble of bucket.scrobbles) {
          recordFindings(
            findings,
            `artist_feat\u0000${bucket.raw}`,
            base,
            { title: scrobble.title, album: scrobble.album },
            scrobble.ts
          );
        }
        continue;
      }

      const similar = findSimilarArtist(artistKeyValue, bucket.trackKeys, history, index);
      if (similar) {
        const canonical = pickCanonical(similar.entry.spellings);
        const base = {
          kind: 'artist_typo',
          artist: '',
          current: bucket.raw,
          proposed: canonical,
          isNew: true,
          note: `Se parece a “${canonical}” y comparte ${similar.shared} pista(s) del historial.`
        };
        for (const scrobble of bucket.scrobbles) {
          recordFindings(
            findings,
            `artist_typo\u0000${bucket.raw}`,
            base,
            { title: scrobble.title, album: scrobble.album },
            scrobble.ts
          );
        }
      }
      continue;
    }

    const canonicalArtist = pickCanonical(exact.spellings);
    const artistKind = classifyArtist(bucket.raw, canonicalArtist);
    const artistIsNew = !exact.spellings[bucket.raw];

    for (const scrobble of bucket.scrobbles) {
      if (artistKind) {
        recordFindings(
          findings,
          `${artistKind}\u0000${artistKeyValue}\u0000${bucket.raw}`,
          {
            kind: artistKind,
            artist: '',
            current: bucket.raw,
            proposed: canonicalArtist,
            isNew: artistIsNew
          },
          { title: scrobble.title, album: scrobble.album },
          scrobble.ts
        );
      }

      const trackKey = looseTitleKey(scrobble.title);
      if (trackKey) {
        const trackEntry = history.tracks[artistKeyValue] && history.tracks[artistKeyValue][trackKey];
        if (trackEntry) {
          const variant = classifyTrack(scrobble.title, trackEntry);
          if (variant) {
            recordFindings(
              findings,
              `${variant.kind}\u0000${artistKeyValue}\u0000${trackKey}\u0000${scrobble.title}`,
              {
                kind: variant.kind,
                artist: canonicalArtist,
                current: scrobble.title,
                proposed: variant.proposed,
                isNew: variant.isNew
              },
              { title: scrobble.title, album: scrobble.album },
              scrobble.ts
            );
          }
        } else {
          const typo = findTrackTypo(artistKeyValue, trackKey, scrobble, history);
          if (typo) {
            recordFindings(
              findings,
              `track_typo\u0000${artistKeyValue}\u0000${trackKey}`,
              {
                kind: 'track_typo',
                artist: canonicalArtist,
                current: scrobble.title,
                proposed: typo.proposed,
                isNew: true,
                note: typo.note
              },
              { title: scrobble.title, album: scrobble.album },
              scrobble.ts
            );
          }
        }

        const cleaned = titleRepeatsArtist(scrobble.artist || bucket.raw, scrobble.title);
        if (cleaned) {
          const cleanTitle = stripPlatformBadges(cleaned) || cleaned;
          const cleanKey = looseTitleKey(cleanTitle);
          const cleanEntry =
            cleanKey && history.tracks[artistKeyValue] && history.tracks[artistKeyValue][cleanKey];
          if (cleanEntry) {
            const proposed = pickCanonical(cleanEntry.spellings);
            const currentEntry =
              history.tracks[artistKeyValue] && history.tracks[artistKeyValue][trackKey];
            recordFindings(
              findings,
              `artist_in_title\u0000${artistKeyValue}\u0000${scrobble.title}`,
              {
                kind: 'artist_in_title',
                artist: canonicalArtist,
                current: scrobble.title,
                proposed,
                isNew: !(currentEntry && currentEntry.spellings[scrobble.title])
              },
              { title: scrobble.title, album: scrobble.album },
              scrobble.ts
            );
          }
        }
      }

      if (scrobble.album) {
        const albumKey = key(scrobble.album);
        const albumEntry =
          albumKey && history.albums[artistKeyValue] && history.albums[artistKeyValue][albumKey];
        if (albumEntry) {
          const canonicalAlbum = pickCanonical(albumEntry.spellings);
          if (scrobble.album !== canonicalAlbum) {
            recordFindings(
              findings,
              `album\u0000${artistKeyValue}\u0000${albumKey}\u0000${scrobble.album}`,
              {
                kind: 'album',
                artist: canonicalArtist,
                current: scrobble.album,
                proposed: canonicalAlbum,
                isNew: !albumEntry.spellings[scrobble.album]
              },
              { title: scrobble.title, album: scrobble.album },
              scrobble.ts
            );
          }
        }
      }
    }
  }

  const all = Array.from(findings.values()).map((finding) => {
    const meta = KIND_META[finding.kind];
    return {
      ...finding,
      label: meta.label,
      priority: meta.priority + (finding.isNew ? 10 : 0)
    };
  });

  all.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    if (b.count !== a.count) return b.count - a.count;
    if (b.lastTs !== a.lastTs) return b.lastTs - a.lastTs;
    return a.current < b.current ? -1 : a.current > b.current ? 1 : 0;
  });

  const byKind = {};
  for (const finding of all) byKind[finding.kind] = (byKind[finding.kind] || 0) + 1;

  const firstTimestamp = recent.reduce((value, scrobble) => {
    return Number.isFinite(scrobble.ts) && (value == null || scrobble.ts < value) ? scrobble.ts : value;
  }, null);
  const lastTimestamp = recent.reduce((value, scrobble) => {
    return Number.isFinite(scrobble.ts) && (value == null || scrobble.ts > value) ? scrobble.ts : value;
  }, null);

  return {
    findings: all.slice(0, maxFindings),
    total: all.length,
    byKind,
    stats: {
      scrobbles: recent.length,
      artists: byArtist.size,
      tracks: recentTracks.size,
      historyScrobbles: history.scrobbles,
      fromMs:
        options.fromMs == null ? (firstTimestamp == null ? Date.now() : firstTimestamp) : options.fromMs,
      toMs: options.toMs == null ? (lastTimestamp == null ? Date.now() : lastTimestamp) : options.toMs
    }
  };
}

module.exports = { detect, KIND_META };
