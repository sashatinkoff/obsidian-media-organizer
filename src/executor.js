// Применение плана и откат. Переименование через fileManager — ссылки в заметках обновляются сами.

const { dirOf } = require('./utils');
const { rewriteNote, revertNote } = require('./refs');

async function ensureFolder(app, dir) {
  if (!dir) return;
  let acc = '';
  for (const part of dir.split('/')) {
    acc = acc ? acc + '/' + part : part;
    if (!app.vault.getAbstractFileByPath(acc)) {
      try { await app.vault.createFolder(acc); } catch (e) { /* уже создана */ }
    }
  }
}

async function move(app, from, to) {
  const file = app.vault.getAbstractFileByPath(from);
  if (!file) throw new Error('Файл не найден');
  if (app.vault.getAbstractFileByPath(to)) throw new Error('Путь назначения занят');
  await ensureFolder(app, dirOf(to));
  await app.fileManager.renameFile(file, to);
}

async function executePlan(app, items, onProgress) {
  const moves = [];
  const edits = [];
  const failed = [];
  let done = 0;
  for (const item of items) {
    try {
      await move(app, item.oldPath, item.newPath);
      moves.push({ from: item.oldPath, to: item.newPath });
      item.status = 'done';
      for (const note of item.textNotes || []) {
        try {
          const pairs = await rewriteNote(app, note, item.oldPath, item.newPath);
          if (pairs) edits.push({ note, pairs });
        } catch (e) {
          item.reason = 'Файл перенесён, но упоминание в «' + note + '» обновить не удалось';
        }
      }
    } catch (e) {
      item.status = 'error';
      item.reason = e && e.message ? e.message : String(e);
      failed.push(item);
    }
    done++;
    if (onProgress) onProgress(done, items.length);
  }
  return { moves, edits, failed };
}

async function undoMoves(app, moves, edits) {
  let restored = 0;
  let skipped = 0;
  for (const m of moves.slice().reverse()) {
    try { await move(app, m.to, m.from); restored++; } catch (e) { skipped++; }
  }
  for (const ed of (edits || []).slice().reverse()) {
    try { await revertNote(app, ed.note, ed.pairs); } catch (e) { /* заметка могла быть удалена */ }
  }
  return { restored, skipped };
}

/** Все файлы, на которые сейчас ссылается хоть одна заметка. */
function linkedTargets(app) {
  const set = new Set();
  const resolved = app.metadataCache.resolvedLinks || {};
  for (const note of Object.keys(resolved)) {
    for (const target of Object.keys(resolved[note])) set.add(target);
  }
  return set;
}

/**
 * Удаляет файлы в корзину согласно настройке Obsidian «Удалённые файлы».
 * Перед удалением повторно проверяет, что на файл не появилась ссылка.
 */
async function trashFiles(app, items, onProgress) {
  const linked = linkedTargets(app);
  const deleted = [];
  const failed = [];
  const skipped = [];
  let done = 0;
  for (const item of items) {
    try {
      const file = app.vault.getAbstractFileByPath(item.path);
      if (!file) throw new Error('Файл не найден');
      if (linked.has(item.path)) {
        item.note = 'Появилась ссылка — файл не тронут';
        skipped.push(item);
      } else {
        if (typeof app.fileManager.trashFile === 'function') await app.fileManager.trashFile(file);
        else await app.vault.trash(file, true);
        deleted.push(item);
      }
    } catch (e) {
      item.note = e && e.message ? e.message : String(e);
      failed.push(item);
    }
    done++;
    if (onProgress) onProgress(done, items.length);
  }
  return { deleted, failed, skipped };
}

module.exports = { executePlan, undoMoves, trashFiles, ensureFolder, linkedTargets };
