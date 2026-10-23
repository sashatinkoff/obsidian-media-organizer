// Поиск медиафайлов, на которые не ссылается ни одна заметка.
// Кроме ссылок, известных Obsidian, дополнительно ищем имя файла в тексте заметок, канв и баз:
// так не пропадут файлы, упомянутые в свойствах, в Canvas или обычным текстом.

const { collectEntries, extensionSet, dateValues } = require('./scanner');
const { escapeRegExp } = require('./utils');

const TEXT_EXT = new Set(['md', 'canvas', 'base']);
const STOP = new Set(['\\', '/', '|', '[', ']', '(', ')', '<', '>', '#', '^', '\n', '\r']);
const MAX_BACK = 200;
const MAX_WORDS = 8;

function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Имена медиафайлов, упомянутые в тексте (в нижнем регистре).
 * Идём от каждого «.расширения» назад до разделителя ссылки; для имён с пробелами
 * добавляем варианты без слов слева («см. фото 1.jpg» → «фото 1.jpg», «1.jpg»).
 */
function extractNames(content, exts) {
  const out = new Set();
  if (!exts.length || !content) return out;
  const re = new RegExp('\\.(?:' + exts.map(escapeRegExp).join('|') + ')(?![A-Za-z0-9])', 'gi');
  let m;
  while ((m = re.exec(content))) {
    const end = m.index + m[0].length;
    const lim = Math.max(0, m.index - MAX_BACK);
    let start = m.index;
    while (start > lim && !STOP.has(content[start - 1])) start--;
    const raw = content.slice(start, end);
    let decoded = raw;
    try { decoded = decodeURIComponent(raw); } catch (e) { /* оставляем как есть */ }
    for (const variant of new Set([raw, decoded])) {
      const words = variant.split(/\s+/).filter(Boolean);
      for (let i = 0; i < Math.min(words.length, MAX_WORDS); i++) {
        const name = words.slice(i).join(' ').replace(/^['"`]+/, '').toLowerCase();
        if (name) out.add(name);
      }
    }
  }
  return out;
}

/**
 * @returns {Promise<{items: object[], protectedCount: number, total: number}>}
 * items: [{id, path, name, ext, size, mtime, selected}] — файлы без ссылок
 */
async function findOrphans(app, settings, onProgress) {
  const entries = collectEntries(app, settings);
  const candidates = entries.filter((e) => !e.parents.length);
  if (!candidates.length) return { items: [], protectedCount: 0, total: entries.length };

  const exts = [...extensionSet(settings)];
  const names = new Set();
  const textFiles = app.vault.getFiles().filter((f) => TEXT_EXT.has(f.extension.toLowerCase()));
  for (let i = 0; i < textFiles.length; i++) {
    try {
      for (const n of extractNames(await app.vault.cachedRead(textFiles[i]), exts)) names.add(n);
    } catch (e) { /* нечитаемый файл пропускаем */ }
    if (i % 40 === 0) {
      if (onProgress) onProgress(i, textFiles.length);
      await tick();
    }
  }
  if (onProgress) onProgress(textFiles.length, textFiles.length);

  const items = [];
  let protectedCount = 0;
  for (const c of candidates) {
    if (names.has(c.name.toLowerCase())) { protectedCount++; continue; }
    const file = app.vault.getAbstractFileByPath(c.path);
    items.push({
      id: c.path, path: c.path, name: c.name, ext: c.ext,
      size: file && file.stat ? file.stat.size : 0,
      mtime: file && file.stat ? file.stat.mtime : 0,
      selected: false,
    });
  }
  return { items, protectedCount, total: entries.length };
}

/**
 * Для файлов, которых Obsidian не связал ни с одной заметкой, ищет заметки, где имя файла
 * упомянуто в тексте (HTML-теги, свойства, обычный текст) и добавляет их как родителей.
 * Такие родители помечены textRef: при переносе упоминание правит сам плагин.
 * @returns {Promise<number>} сколько связей найдено
 */
async function attachTextParents(app, settings, entries, onProgress) {
  const orphans = entries.filter((e) => !e.parents.length);
  if (!orphans.length) return 0;
  const exts = [...extensionSet(settings)];
  const wanted = new Map();
  for (const e of orphans) {
    const k = e.name.toLowerCase();
    if (!wanted.has(k)) wanted.set(k, []);
    wanted.get(k).push(e);
  }
  const notes = app.vault.getMarkdownFiles();
  let attached = 0;
  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];
    try {
      const content = await app.vault.cachedRead(note);
      const names = extractNames(content, exts);
      let lower = null;
      for (const [name, list] of wanted) {
        if (!names.has(name)) continue;
        lower = lower === null ? content.toLowerCase() : lower;
        const at = lower.indexOf(name);
        const fm = (app.metadataCache.getFileCache(note) || {}).frontmatter;
        for (const e of list) {
          e.parents.push({
            path: note.path, basename: note.basename, ctime: note.stat.ctime,
            dateRaws: dateValues(fm, settings), order: at < 0 ? 1e9 : at, embedded: true, textRef: true,
          });
          attached++;
        }
      }
    } catch (err) { /* нечитаемую заметку пропускаем */ }
    if (i % 40 === 0) {
      if (onProgress) onProgress(i, notes.length);
      await tick();
    }
  }
  return attached;
}

module.exports = { findOrphans, extractNames, attachTextParents };
