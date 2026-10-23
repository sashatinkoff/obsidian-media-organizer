// Правка упоминаний файла в тексте заметок — для ссылок, которые Obsidian сам не обновляет
// (например, <video src="путь/файл.mp4"> или путь в обычном тексте).

const { escapeRegExp } = require('./utils');

function encodeSafe(s) {
  try { return encodeURI(s); } catch (e) { return s; }
}

/**
 * Заменяет упоминания oldPath на newPath: полный путь (в т. ч. с %20) и «голое» имя файла.
 * Имя внутри другого пути (…/другая_папка/имя) и внутри более длинного имени не трогается.
 */
function rewriteReferences(content, oldPath, newPath) {
  let out = content;
  let changed = 0;
  const pairs = [];
  const note = (a, b) => { if (!pairs.some((p) => p.a === a && p.b === b)) pairs.push({ a, b }); };
  const oldName = oldPath.split('/').pop();

  const replaceAll = (a, b) => {
    if (!a || a === b || !out.includes(a)) return;
    changed += out.split(a).length - 1;
    note(a, b);
    out = out.split(a).join(b);
  };
  replaceAll(oldPath, newPath);
  replaceAll(encodeSafe(oldPath), encodeSafe(newPath));

  const bare = (name, replacement) => {
    if (!name) return;
    const re = new RegExp('(?<![\\p{L}\\p{N}_/\\\\@.%-])' + escapeRegExp(name) + '(?![\\p{L}\\p{N}])', 'giu');
    out = out.replace(re, (m) => { changed++; note(m, replacement); return replacement; });
  };
  bare(oldName, newPath);
  if (encodeSafe(oldName) !== oldName) bare(encodeSafe(oldName), encodeSafe(newPath));

  return { content: out, changed, pairs };
}

/** Возвращает текст к исходному виду по списку выполненных замен (в обратном порядке). */
function revertReferences(content, pairs) {
  let out = content;
  for (const p of (pairs || []).slice().reverse()) out = out.split(p.b).join(p.a);
  return out;
}

/** Применяет правку к тексту заметки атомарно, если возможно. */
async function editNote(app, notePath, fn) {
  const file = app.vault.getAbstractFileByPath(notePath);
  if (!file) return false;
  if (typeof app.vault.process === 'function') {
    await app.vault.process(file, fn);
  } else {
    const before = await app.vault.read(file);
    const after = fn(before);
    if (after !== before) await app.vault.modify(file, after);
  }
  return true;
}

/** Правит упоминания в заметке. Возвращает список замен или null, если менять было нечего. */
async function rewriteNote(app, notePath, from, to) {
  let pairs = null;
  await editNote(app, notePath, (data) => {
    const r = rewriteReferences(data, from, to);
    if (r.changed > 0) pairs = r.pairs;
    return r.content;
  });
  return pairs;
}

/** Откатывает ранее выполненные замены в заметке. */
async function revertNote(app, notePath, pairs) {
  return editNote(app, notePath, (data) => revertReferences(data, pairs));
}

module.exports = { rewriteReferences, revertReferences, rewriteNote, revertNote };
