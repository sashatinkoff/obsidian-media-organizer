// Статистика уборок: записи о запусках и сводка для инфографики. Чистая логика.
// Запись запуска: {type:'organize'|'delete'|'undo', at, count, failed, bytes, years:{ГГГГ:n}, photos, videos}

const { mediaKind } = require('./utils');

const MONTH_LABELS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const MAX_RUNS = 1000;

function countKinds(items) {
  let photos = 0;
  let videos = 0;
  let bytes = 0;
  for (const i of items) {
    if (mediaKind(i.ext) === 'video') videos++; else photos++;
    bytes += i.size || 0;
  }
  return { photos, videos, bytes };
}

/** Запись о переносе: items — применённые элементы плана (с size), failed — число ошибок. */
function organizeRun(items, failed, now) {
  const done = items.filter((i) => i.status === 'done');
  const years = {};
  for (const i of done) if (i.year) years[i.year] = (years[i.year] || 0) + 1;
  const k = countKinds(done);
  return { type: 'organize', at: now || Date.now(), count: done.length, failed: failed || 0, bytes: k.bytes, years, photos: k.photos, videos: k.videos };
}

/** Запись об удалении: items — реально удалённые файлы (с size). */
function deleteRun(items, failed, now) {
  const k = countKinds(items);
  return { type: 'delete', at: now || Date.now(), count: items.length, failed: failed || 0, bytes: k.bytes, years: {}, photos: k.photos, videos: k.videos };
}

function undoRun(restored, skipped, now) {
  return { type: 'undo', at: now || Date.now(), count: restored, failed: skipped || 0, bytes: 0, years: {}, photos: 0, videos: 0 };
}

function summarize(runs, now) {
  const ref = now ? new Date(now) : new Date();
  const t = {
    runs: 0, moved: 0, deleted: 0, undone: 0, failed: 0,
    bytesMoved: 0, bytesFreed: 0, photos: 0, videos: 0, delPhotos: 0, delVideos: 0,
    firstAt: null, lastAt: null,
  };
  const years = new Map();
  const months = [];
  const byKey = new Map();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(ref.getFullYear(), ref.getMonth() - i, 1);
    const m = { key: d.getFullYear() + '-' + d.getMonth(), label: MONTH_LABELS[d.getMonth()], year: d.getFullYear(), moved: 0, deleted: 0 };
    months.push(m);
    byKey.set(m.key, m);
  }

  for (const r of runs || []) {
    if (!r || !r.type) continue;
    const when = new Date(r.at);
    const month = byKey.get(when.getFullYear() + '-' + when.getMonth());
    t.failed += r.failed || 0;
    if (t.firstAt === null || r.at < t.firstAt) t.firstAt = r.at;
    if (t.lastAt === null || r.at > t.lastAt) t.lastAt = r.at;
    if (r.type === 'organize') {
      t.runs++;
      t.moved += r.count || 0;
      t.bytesMoved += r.bytes || 0;
      t.photos += r.photos || 0;
      t.videos += r.videos || 0;
      for (const y of Object.keys(r.years || {})) years.set(y, (years.get(y) || 0) + r.years[y]);
      if (month) month.moved += r.count || 0;
    } else if (r.type === 'delete') {
      t.runs++;
      t.deleted += r.count || 0;
      t.bytesFreed += r.bytes || 0;
      t.delPhotos += r.photos || 0;
      t.delVideos += r.videos || 0;
      if (month) month.deleted += r.count || 0;
    } else if (r.type === 'undo') {
      t.undone++;
    }
  }

  return Object.assign(t, {
    years: [...years].map(([year, count]) => ({ year: Number(year), count })).sort((a, b) => a.year - b.year),
    months,
  });
}

module.exports = { organizeRun, deleteRun, undoRun, summarize, MAX_RUNS };
