'use strict';

const engine = require('../engine.js');

const {
  key,
  artistKey,
  looseTitleKey,
  strictTitleKey,
  normaliseText
} = engine.util;

const RE_SPACES = /\s+/g;
const RE_FEAT_TEST = /\b(feat|featuring|ft|con)\b/;

const RE_DIFFERENT_VERSION = new RegExp(
  '\\b(live|en vivo|directo|acoustic|acustico|acustica|remix|remaster|remastered|' +
    'remasterizado|instrumental|karaoke|cover|version|edicion|edit|extended|reprise|' +
    'demo|mono|stereo|radio edit|soundtrack|banda sonora|orchestral|orquesta|' +
    'esc version|eurovision|junior|dancebreak|spanglish|spanish|english|italiano)\\b'
);

const BADGE_WORDS = {
  official: 1,
  oficial: 1,
  audio: 1,
  video: 1,
  lyric: 1,
  lyrics: 1,
  letra: 1,
  letras: 1,
  visual: 1,
  visuals: 1,
  visualizer: 1,
  visualiser: 1,
  clip: 1,
  music: 1,
  full: 1,
  mv: 1,
  hd: 1,
  hq: 1,
  '4k': 1,
  '8k': 1
};

const BADGE_CORE = {
  official: 1,
  oficial: 1,
  audio: 1,
  video: 1,
  lyric: 1,
  lyrics: 1,
  letra: 1,
  letras: 1,
  visual: 1,
  visuals: 1,
  visualizer: 1,
  visualiser: 1,
  mv: 1,
  hd: 1,
  hq: 1,
  '4k': 1,
  '8k': 1
};

const RE_ROMAN = /^(i|ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii|xiii|xiv|xv|xvi|xvii|xviii|xix|xx)$/;

function isPlatformBadge(qualifierKey) {
  const words = String(qualifierKey || '').split(' ').filter(Boolean);
  if (!words.length) return false;
  let core = false;
  for (const word of words) {
    if (!BADGE_WORDS[word]) return false;
    if (BADGE_CORE[word]) core = true;
  }
  return core;
}

function stripPlatformBadges(raw) {
  let output = normaliseText(raw).replace(/[\(\[]([^\)\]]*)[\)\]]/g, (match, inner) => {
    return isPlatformBadge(key(inner)) ? ' ' : match;
  });
  for (let index = 0; index < 5; index += 1) {
    const match = output.match(/\s+-\s+(.{2,})$/);
    if (!match || !isPlatformBadge(key(match[1]))) break;
    output = output.slice(0, match.index);
  }
  return normaliseText(output);
}

function isVersionMarker(text) {
  return RE_DIFFERENT_VERSION.test(key(text));
}

function hasFeatCredit(text) {
  return RE_FEAT_TEST.test(key(text));
}

function featBase(text) {
  return normaliseText(text)
    .replace(/\s*[\(\[]?\s*\b(feat|featuring|ft)\b\.?\s*[\)\]]?\s+.*$/i, ' ')
    .replace(RE_SPACES, ' ')
    .trim();
}

function editDistance(a, b, max) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const row = new Array(b.length + 1);
  for (let index = 0; index <= b.length; index += 1) row[index] = index;
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    let best = row[0];
    for (let j = 1; j <= b.length; j += 1) {
      const temp = row[j];
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + cost);
      if (row[j] < best) best = row[j];
      previous = temp;
    }
    if (best > max) return max + 1;
  }
  return row[b.length];
}

function ordinalStripped(value) {
  return value
    .replace(/[0-9]+/g, ' ')
    .split(' ')
    .filter((word) => word && !RE_ROMAN.test(word))
    .join(' ');
}

function sameModuloOrdinals(aKey, bKey) {
  return ordinalStripped(aKey) === ordinalStripped(bKey);
}

function titleRepeatsArtist(artistName, rawTitle) {
  if (!artistName || !rawTitle) return null;
  const keyOfArtist = artistKey(artistName);
  if (keyOfArtist.length < 3) return null;
  const title = normaliseText(rawTitle);
  if (!key(title).startsWith(keyOfArtist + ' ')) return null;

  const separator = /\s*[-–—:]\s+/g;
  let match;
  while ((match = separator.exec(title))) {
    const prefix = title.slice(0, match.index);
    if (key(prefix) !== keyOfArtist) continue;
    return normaliseText(title.slice(match.index + match[0].length)) || null;
  }
  return null;
}

function pickCanonical(spellings) {
  if (!spellings) return '';
  let best = '';
  let bestCount = -1;
  let bestLast = -1;
  for (const [raw, info] of Object.entries(spellings)) {
    const count = typeof info === 'number' ? info : info && info.n ? info.n : 0;
    const last = info && typeof info === 'object' && info.last ? info.last : 0;
    if (
      count > bestCount ||
      (count === bestCount && last > bestLast) ||
      (count === bestCount && last === bestLast && raw.length > best.length) ||
      (count === bestCount && last === bestLast && raw.length === best.length && best && raw < best)
    ) {
      best = raw;
      bestCount = count;
      bestLast = last;
    }
  }
  return best;
}

module.exports = {
  key,
  artistKey,
  looseTitleKey,
  strictTitleKey,
  stripPlatformBadges,
  isVersionMarker,
  hasFeatCredit,
  featBase,
  editDistance,
  sameModuloOrdinals,
  titleRepeatsArtist,
  pickCanonical
};
