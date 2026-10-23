// Мелкие помощники для путей и строк.

/** Папка из настроек -> путь без слэшей по краям ('' = корень хранилища). */
function normFolder(p) {
  return (p || '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

function inFolder(path, folder) {
  return folder === '' || path.startsWith(folder + '/');
}

function joinPath(dir, name) {
  return dir ? dir + '/' + name : name;
}

function dirOf(path) {
  const i = path.lastIndexOf('/');
  return i < 0 ? '' : path.slice(0, i);
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const VIDEO_EXT = new Set(['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v', 'mpg', 'mpeg', '3gp']);

/** 'video' или 'photo' по расширению. */
function mediaKind(ext) {
  return VIDEO_EXT.has(String(ext || '').toLowerCase()) ? 'video' : 'photo';
}

function formatBytes(n) {
  n = Number(n) || 0;
  const units = ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ'];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  const v = i === 0 ? String(Math.round(n)) : n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2);
  return v.replace('.', ',') + ' ' + units[i];
}

/** Число с неразрывными пробелами между тысячами. */
function formatNum(n) {
  return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function plural(n, forms) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}

function pad2(n) { return String(n).padStart(2, '0'); }

function formatDate(ts) {
  const d = new Date(ts);
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`;
}

function formatDateTime(ts) {
  const d = new Date(ts);
  return `${formatDate(ts)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function isoDate(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

module.exports = {
  normFolder, inFolder, joinPath, dirOf, escapeRegExp,
  mediaKind, formatBytes, formatNum, plural, formatDate, formatDateTime, isoDate,
};
