// Вкладка «Статистика»: инфографика, список последних запусков, сохранение SVG в хранилище.

const { Notice, setIcon } = require('obsidian');
const { summarize } = require('./stats');
const { buildInfographic } = require('./statsSvg');
const { ConfirmModal } = require('./modals');
const { ensureFolder } = require('./executor');
const { normFolder, joinPath, formatBytes, formatDateTime, isoDate } = require('./utils');

const RUN_LABELS = { organize: ['Упорядочено', 'ok'], delete: ['Удалено', 'warn'], undo: ['Откат', 'muted'] };

/** Показывает SVG-строку внутри контейнера (без innerHTML). */
function mountSvg(box, svg) {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  if (doc.querySelector('parsererror')) { box.createDiv({ cls: 'mo-empty', text: 'Не удалось построить инфографику' }); return; }
  const node = box.ownerDocument.importNode(doc.documentElement, true);
  node.removeAttribute('width');
  node.removeAttribute('height');
  node.setAttribute('style', 'width:100%;height:auto;display:block;border-radius:16px');
  box.appendChild(node);
}

async function saveInfographic(view) {
  const { app, plugin } = view;
  const s = plugin.settings;
  const svg = buildInfographic(summarize(s.stats.runs));
  const dir = normFolder(s.reportFolder);
  await ensureFolder(app, dir);
  const path = joinPath(dir, `Статистика уборок ${isoDate(Date.now())}.svg`);
  const existing = app.vault.getAbstractFileByPath(path);
  if (existing) await app.vault.modify(existing, svg);
  else await app.vault.create(path, svg);
  new Notice('Инфографика сохранена: ' + path);
  try { await app.workspace.openLinkText(path, '', 'tab'); } catch (e) { /* файл всё равно сохранён */ }
  return path;
}

function renderStatsTab(view, el) {
  const s = view.plugin.settings;
  const runs = s.stats.runs;

  const bar = el.createDiv({ cls: 'mo-toolbar' });
  bar.createDiv({ cls: 'mo-muted', text: `Записей о запусках: ${runs.length}. Хранятся в настройках плагина.` });
  const actions = bar.createDiv({ cls: 'mo-actions' });

  const clear = actions.createEl('button', { cls: 'mo-btn', text: 'Очистить статистику' });
  clear.disabled = !runs.length;
  clear.addEventListener('click', async () => {
    const ok = await new ConfirmModal(view.app, 'Очистить статистику?', 'Записи о прошлых уборках будут удалены. Сами файлы и сохранённые SVG не изменятся.', 'Очистить', true).openAndWait();
    if (!ok) return;
    s.stats.runs = [];
    await view.plugin.saveSettings();
    view.render();
  });

  const save = actions.createEl('button', { cls: 'mo-btn primary' });
  setIcon(save.createSpan({ cls: 'mo-ico' }), 'download');
  save.createSpan({ text: 'Сохранить инфографику (SVG)' });
  save.addEventListener('click', async () => {
    try { await saveInfographic(view); } catch (e) { console.error(e); new Notice('Не удалось сохранить: ' + (e && e.message ? e.message : e)); }
  });

  mountSvg(el.createDiv({ cls: 'mo-infographic' }), buildInfographic(summarize(runs)));

  if (!runs.length) return;
  const wrap = el.createDiv({ cls: 'mo-table mo-runs' });
  const head = wrap.createDiv({ cls: 'mo-tr mo-tr-run mo-th' });
  ['Когда', 'Что', 'Файлов', 'Размер', 'Ошибок'].forEach((t) => head.createDiv({ text: t }));
  for (const r of runs.slice(-10).reverse()) {
    const [label, cls] = RUN_LABELS[r.type] || [r.type, 'muted'];
    const row = wrap.createDiv({ cls: 'mo-tr mo-tr-run' });
    row.createDiv({ text: formatDateTime(r.at) });
    row.createDiv().createSpan({ cls: 'mo-badge ' + cls, text: label });
    row.createDiv({ text: String(r.count || 0) });
    row.createDiv({ text: r.bytes ? formatBytes(r.bytes) : '—' });
    row.createDiv({ cls: r.failed ? 'mo-reason' : 'mo-muted', text: String(r.failed || 0) });
  }
}

module.exports = { renderStatsTab, saveInfographic };
