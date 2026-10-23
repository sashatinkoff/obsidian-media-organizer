// Инфографика статистики уборок в виде самостоятельного SVG (тёмная палитра макета).
// Один и тот же SVG показывается во вкладке и сохраняется в хранилище как вложение.

const { formatBytes, formatNum, formatDate, plural } = require('./utils');

const C = {
  bg: '#0b1326', panel: '#131b2e', card: '#171f33', line: '#2d3449',
  text: '#dae2fd', sub: '#c7c4d7', muted: '#908fa0',
  primary: '#c0c1ff', ok: '#4edea3', warn: '#ffb95f',
};
const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const W = 960;
const M = 24;
const GAP = 16;
const MAX_YEAR_ROWS = 12;

const num = (n) => Math.round(n * 10) / 10;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function rect(x, y, w, h, fill, rx) {
  return `<rect x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}" rx="${rx || 0}" fill="${fill}"/>`;
}

function text(x, y, s, o) {
  const { size = 13, fill = C.text, weight = 400, anchor = 'start' } = o || {};
  return `<text x="${num(x)}" y="${num(y)}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${esc(s)}</text>`;
}

function yearRows(years) {
  let rows = years.slice().sort((a, b) => b.year - a.year).map((r) => ({ label: String(r.year), count: r.count }));
  if (rows.length > MAX_YEAR_ROWS) {
    const rest = years.slice().sort((a, b) => b.year - a.year).slice(MAX_YEAR_ROWS - 1);
    const keep = rows.slice(0, MAX_YEAR_ROWS - 1);
    keep.push({ label: 'до ' + rest[0].year, count: rest.reduce((s, r) => s + r.count, 0) });
    rows = keep;
  }
  return rows;
}

function kpiCards(sum, out, y) {
  const cw = (W - 2 * M - 3 * GAP) / 4;
  const cards = [
    ['УБОРОК', formatNum(sum.runs), sum.undone ? `${sum.undone} ${plural(sum.undone, ['откат', 'отката', 'откатов'])}` : 'откатов нет'],
    ['УПОРЯДОЧЕНО ФАЙЛОВ', formatNum(sum.moved), formatBytes(sum.bytesMoved)],
    ['УДАЛЕНО ФАЙЛОВ', formatNum(sum.deleted), `${formatNum(sum.delPhotos)} фото · ${formatNum(sum.delVideos)} видео`],
    ['ОСВОБОЖДЕНО МЕСТА', formatBytes(sum.bytesFreed), sum.failed ? `ошибок: ${formatNum(sum.failed)}` : 'без ошибок'],
  ];
  cards.forEach((c, i) => {
    const x = M + i * (cw + GAP);
    out.push(rect(x, y, cw, 88, C.panel, 12));
    out.push(text(x + 16, y + 26, c[0], { size: 11, fill: C.muted, weight: 600 }));
    out.push(text(x + 16, y + 62, c[1], { size: 30, weight: 700, fill: i === 3 ? C.ok : C.text }));
    out.push(text(x + 16, y + 79, c[2], { size: 12, fill: C.sub }));
  });
  return y + 88;
}

function yearsPanel(sum, out, x, y, w, h) {
  out.push(rect(x, y, w, h, C.panel, 16));
  out.push(text(x + 20, y + 34, 'Файлы по годам', { size: 15, weight: 600 }));
  const rows = yearRows(sum.years);
  if (!rows.length) {
    out.push(text(x + w / 2, y + h / 2 + 4, 'Пока нет данных — выполните первую уборку', { size: 13, fill: C.muted, anchor: 'middle' }));
    return;
  }
  const max = Math.max(...rows.map((r) => r.count));
  const x0 = x + 84;
  const maxW = w - 84 - 84;
  rows.forEach((r, i) => {
    const ry = y + 58 + i * 28;
    const bw = Math.max(3, (r.count / max) * maxW);
    out.push(text(x + 20, ry + 13, r.label, { size: 13, fill: C.sub }));
    out.push(rect(x0, ry, maxW, 16, C.card, 3));
    out.push(rect(x0, ry, bw, 16, C.primary, 3));
    out.push(text(x0 + maxW + 10, ry + 13, formatNum(r.count), { size: 13, weight: 600 }));
  });
}

function donutPanel(sum, out, x, y, w, h) {
  out.push(rect(x, y, w, h, C.panel, 16));
  out.push(text(x + 20, y + 34, 'Фото и видео', { size: 15, weight: 600 }));
  const total = sum.photos + sum.videos;
  const cx = x + 100;
  const cy = y + 62 + (h - 62) / 2 - 8;
  const r = 62;
  const sw = 24;
  const len = 2 * Math.PI * r;
  out.push(`<circle cx="${num(cx)}" cy="${num(cy)}" r="${r}" fill="none" stroke="${C.card}" stroke-width="${sw}"/>`);
  const segs = [['Фото', sum.photos, C.primary], ['Видео', sum.videos, C.ok]];
  let offset = 0;
  if (total > 0) {
    for (const [, n, color] of segs) {
      if (!n) continue;
      const l = (n / total) * len;
      out.push(`<circle cx="${num(cx)}" cy="${num(cy)}" r="${r}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-dasharray="${num(l)} ${num(len - l)}" stroke-dashoffset="${num(-offset)}" transform="rotate(-90 ${num(cx)} ${num(cy)})"/>`);
      offset += l;
    }
    out.push(text(cx, cy + 6, formatNum(total), { size: 22, weight: 700, anchor: 'middle' }));
    out.push(text(cx, cy + 24, plural(total, ['файл', 'файла', 'файлов']), { size: 11, fill: C.muted, anchor: 'middle' }));
  } else {
    out.push(text(cx, cy + 4, 'нет данных', { size: 12, fill: C.muted, anchor: 'middle' }));
  }
  const lx = cx + r + sw / 2 + 22;
  segs.forEach(([label, n, color], i) => {
    const ly = cy - 36 + i * 56;
    out.push(rect(lx, ly - 10, 10, 10, color, 2));
    out.push(text(lx + 18, ly, label, { size: 13, fill: C.sub }));
    const share = total ? ` · ${Math.round((n / total) * 100)}%` : '';
    out.push(text(lx + 18, ly + 22, formatNum(n) + share, { size: 15, weight: 700 }));
  });
}

function monthsPanel(sum, out, x, y, w, h) {
  out.push(rect(x, y, w, h, C.panel, 16));
  out.push(text(x + 20, y + 34, 'Динамика по месяцам', { size: 15, weight: 600 }));
  out.push(text(x + 20, y + 52, 'последние 12 месяцев', { size: 12, fill: C.muted }));
  const lgx = x + w - 270;
  out.push(rect(lgx, y + 24, 10, 10, C.ok, 2));
  out.push(text(lgx + 16, y + 34, 'Упорядочено', { size: 12, fill: C.sub }));
  out.push(rect(lgx + 126, y + 24, 10, 10, C.warn, 2));
  out.push(text(lgx + 142, y + 34, 'Удалено', { size: 12, fill: C.sub }));

  const left = x + 28;
  const right = x + w - 28;
  const baseY = y + h - 40;
  const maxH = 118;
  const colW = (right - left) / 12;
  const maxVal = Math.max(0, ...sum.months.map((m) => Math.max(m.moved, m.deleted)));
  out.push(rect(left, baseY, right - left, 1, C.line));
  sum.months.forEach((m, i) => {
    const cx = left + colW * i + colW / 2;
    const bars = [[m.moved, C.ok, cx - 22], [m.deleted, C.warn, cx + 2]];
    for (const [v, color, bx] of bars) {
      if (!v || !maxVal) continue;
      const bh = Math.max(3, (v / maxVal) * maxH);
      out.push(rect(bx, baseY - bh, 20, bh, color, 3));
      out.push(text(bx + 10, baseY - bh - 6, formatNum(v), { size: 11, fill: C.sub, anchor: 'middle' }));
    }
    out.push(text(cx, baseY + 20, m.label, { size: 12, fill: C.muted, anchor: 'middle' }));
  });
  if (!maxVal) out.push(text((left + right) / 2, baseY - maxH / 2, 'За последние 12 месяцев событий нет', { size: 13, fill: C.muted, anchor: 'middle' }));
}

/** @returns {string} готовый SVG-документ */
function buildInfographic(sum, opts) {
  const now = (opts && opts.now) || Date.now();
  const out = [];

  out.push(text(M, 46, 'Статистика уборок', { size: 26, weight: 700 }));
  const sub = sum.firstAt
    ? `${formatDate(sum.firstAt)} — ${formatDate(sum.lastAt)} · ${sum.runs} ${plural(sum.runs, ['уборка', 'уборки', 'уборок'])}`
    : 'Данных пока нет — они появятся после первой уборки';
  out.push(text(M, 70, sub, { size: 13, fill: C.sub }));

  let y = kpiCards(sum, out, 92) + GAP;

  const rows = Math.min(yearRows(sum.years).length, MAX_YEAR_ROWS);
  const h1 = Math.max(268, 58 + rows * 28 + 18);
  const w1 = 544;
  yearsPanel(sum, out, M, y, w1, h1);
  donutPanel(sum, out, M + w1 + GAP, y, W - 2 * M - w1 - GAP, h1);
  y += h1 + GAP;

  const h2 = 262;
  monthsPanel(sum, out, M, y, W - 2 * M, h2);
  y += h2 + 28;

  out.push(text(M, y, `Media Organizer · ${formatDate(now)}`, { size: 11, fill: C.muted }));
  const H = y + 20;

  const head = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${FONT}" role="img" aria-labelledby="mo-t mo-d">`
    + '<title id="mo-t">Статистика уборок</title>'
    + `<desc id="mo-d">${esc(sub)}. Упорядочено файлов: ${sum.moved}, удалено: ${sum.deleted}, освобождено места: ${esc(formatBytes(sum.bytesFreed))}.</desc>`
    + rect(0, 0, W, H, C.bg, 0);
  return head + out.join('') + '</svg>';
}

module.exports = { buildInfographic };
