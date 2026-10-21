// Применение плана и откат. Переименование через fileManager — ссылки в заметках обновляются сами.

const { dirOf } = require('./utils');

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
  const failed = [];
  let done = 0;
  for (const item of items) {
    try {
      await move(app, item.oldPath, item.newPath);
      moves.push({ from: item.oldPath, to: item.newPath });
      item.status = 'done';
    } catch (e) {
      item.status = 'error';
      item.reason = e && e.message ? e.message : String(e);
      failed.push(item);
    }
    done++;
    if (onProgress) onProgress(done, items.length);
  }
  return { moves, failed };
}

async function undoMoves(app, moves) {
  let restored = 0;
  let skipped = 0;
  for (const m of moves.slice().reverse()) {
    try { await move(app, m.to, m.from); restored++; } catch (e) { skipped++; }
  }
  return { restored, skipped };
}

module.exports = { executePlan, undoMoves };
