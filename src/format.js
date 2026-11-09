'use strict';

const MESSAGE_LIMIT = 3500;

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function code(value) {
  return `<code>${escapeHtml(value)}</code>`;
}

function number(value) {
  try {
    return Number(value).toLocaleString('es-ES');
  } catch (error) {
    return String(value);
  }
}

const formatters = new Map();

function formatDate(timestamp, timeZone, withYear = false) {
  const cacheKey = `${timeZone}\u0000${withYear}`;
  let formatter = formatters.get(cacheKey);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('es-ES', {
      day: 'numeric',
      month: 'short',
      ...(withYear ? { year: 'numeric' } : {}),
      timeZone
    });
    formatters.set(cacheKey, formatter);
  }
  return formatter.format(new Date(timestamp)).replace(/\.$/, '');
}

function findingBlock(finding, position, timeZone) {
  const lines = [];
  lines.push(`<b>${position}. ${finding.label}</b> · ${number(finding.count)} scrobble(s)`);

  if (
    finding.kind === 'artist_typo' ||
    finding.kind === 'artist_formatting' ||
    finding.kind === 'artist_feat'
  ) {
    lines.push(`${code(finding.current)} → ${code(finding.proposed)}`);
  } else {
    lines.push(
      `${escapeHtml(finding.artist)} — ${code(finding.current)} → ${code(finding.proposed)}`
    );
  }

  lines.push(
    [
      finding.isNew ? 'nuevo en la ventana' : 'ya existía en el historial',
      `última vez: ${formatDate(finding.lastTs, timeZone)}`
    ].join(' · ')
  );

  if (finding.note) lines.push(`<i>${escapeHtml(finding.note)}</i>`);
  if (finding.examples.length && finding.kind.startsWith('artist')) {
    lines.push(
      `Ej.: ${finding.examples.map((example) => escapeHtml(example.title)).join(' · ')}`
    );
  }

  return lines.join('\n');
}

function packSections(header, blocks, footer, limit) {
  const chunks = [];
  let current = header;

  function pushCurrent() {
    if (current) chunks.push(current);
  }

  for (const block of blocks) {
    const separator = current ? '\n\n' : '';
    if ((current + separator + block).length <= limit) {
      current = current + separator + block;
      continue;
    }

    pushCurrent();
    current = block;
    if (current.length > limit) {
      const parts = [];
      for (let index = 0; index < current.length; index += limit) {
        parts.push(current.slice(index, index + limit));
      }
      for (let index = 0; index < parts.length - 1; index += 1) chunks.push(parts[index]);
      current = parts[parts.length - 1];
    }
  }

  if (footer) {
    if ((current + '\n\n' + footer).length <= limit) current += '\n\n' + footer;
    else {
      pushCurrent();
      current = footer;
    }
  }

  pushCurrent();
  return chunks;
}

function buildMessages(result, config) {
  if (!result.total && !config.notifyIfClean) return [];

  const stats = result.stats;
  const from = formatDate(stats.fromMs, config.timeZone);
  const to = formatDate(stats.toMs, config.timeZone, true);

  const header = [
    '🎧 <b>Last.fm · revisión de nombres</b>',
    `<b>Ventana:</b> ${from} → ${to} (${config.windowDays} días)`,
    `<b>Revisado:</b> ${number(stats.scrobbles)} scrobble(s) · ${number(stats.artists)} artista(s)`,
    `<b>Historial:</b> ${number(stats.historyScrobbles)} scrobble(s)`
  ].join('\n');

  const footer =
    '<i>Solo se comparan los nombres de la ventana con el historial anterior. No se modifica nada en Last.fm.</i>';

  if (!result.total) {
    const block = [
      '✅ <b>Sin incoherencias de nombres</b>',
      stats.scrobbles
        ? 'Ningún nombre de la ventana se sale del historial previo.'
        : 'No hay scrobble(s) en esta ventana.'
    ].join('\n');
    return packSections(header, [block], footer, MESSAGE_LIMIT);
  }

  const blocks = [];
  if (result.total > result.findings.length) {
    blocks.push(
      `Mostrando las ${number(result.findings.length)} más relevantes de ${number(
        result.total
      )}. Sube <code>MAX_FINDINGS</code> para verlas todas.`
    );
  }

  const findings = result.findings.map((finding, index) =>
    findingBlock(finding, index + 1, config.timeZone)
  );

  return packSections(header, [...blocks, ...findings], footer, MESSAGE_LIMIT);
}

module.exports = { buildMessages, escapeHtml, MESSAGE_LIMIT };
