// Вкладка «Без ссылок»: поиск медиа, на которые не ссылается ни одна заметка, и точечное удаление.

const { Notice, setIcon } = require('obsidian');
const { findOrphans } = require('./orphans');
const { trashFiles } = require('./executor');
const { ConfirmModal } = require('./modals');
const { deleteRun } = require('./stats');
const { formatBytes, formatDate, mediaKind } = require('./utils');

const PAGE_SIZE = 25;
const IMG = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'avif']);
const VID = new Set(['mp4', 'mov', 'webm', 'm4v']);
const SORTS = {
  size: ['Размер: большие сверху', (a, b) => b.size - a.size],
  oldest: ['Дата: старые сверху', (a, b) => a.mtime - b.mtime],
  newest: ['Дата: новые сверху', (a, b) => b.mtime - a.mtime],
  path: ['Путь: А—Я', (a, b) => a.path.localeCompare(b.path)],
};
const TYPES = [['all', 'Все', 'layout-list'], ['photo', 'Фото', 'image'], ['video', 'Видео', 'film']];

function initState() {
  return {
    items: [], scanned: false, protectedCount: 0, total: 0,
    sort: 'size', type: 'all', page: 0,
    log: 'Нажмите «Найти», чтобы показать медиа без ссылок.',
  };
}

function visible(o) {
  return o.items
    .filter((i) => o.type === 'all' || mediaKind(i.ext) === o.type)
    .sort(SORTS[o.sort][1]);
}

function sumSize(items) {
  return items.reduce((s, i) => s + (i.size || 0), 0);
}

function setLog(view, text) {
  view.orph.log = text;
  if (view.orphLogEl) view.orphLogEl.setText(text);
}

async function scanOrphans(view) {
  if (view.busy) return;
  const s = view.plugin.settings;
  const o = view.orph;
  if (!s.folders.length) { new Notice('Сначала выберите папки для уборки на вкладке «Уборка» или в настройках'); return; }
  view.busy = true;
  setLog(view, 'Поиск…');
  view.render();
  try {
    const res = await findOrphans(view.app, s, (done, total) => setLog(view, `Проверяю заметки: ${done} из ${total}`));
    o.items = res.items;
    o.protectedCount = res.protectedCount;
    o.total = res.total;
    o.scanned = true;
    o.page = 0;
    setLog(view, `Просмотрено медиа: ${res.total}. Без ссылок: ${res.items.length} (${formatBytes(sumSize(res.items))}). Защищено упоминанием в тексте: ${res.protectedCount}.`);
  } catch (e) {
    console.error(e);
    setLog(view, 'Ошибка поиска: ' + (e && e.message ? e.message : e));
  }
  view.busy = false;
  view.render();
}

async function deleteItems(view, items) {
  const s = view.plugin.settings;
  const o = view.orph;
  if (!items.length || view.busy) return;
  if (!s.allowOrphanDelete) { new Notice('Сначала включите «Разрешить удаление» на этой вкладке'); return; }

  const bytes = sumSize(items);
  const what = items.length === 1 ? `файл «${items[0].name}»` : `файлов: ${items.length}`;
  const ok = await new ConfirmModal(
    view.app,
    'Удалить медиа без ссылок?',
    `Будет удалено: ${what} (${formatBytes(bytes)}). Файлы уйдут в корзину согласно настройке Obsidian «Файлы и ссылки → Удалённые файлы»: системная корзина, папка .trash или безвозвратное удаление. Проверьте её, если хотите иметь возможность восстановить файлы.`,
    'Удалить',
    true
  ).openAndWait();
  if (!ok) return;

  view.busy = true;
  view.render();
  const res = await trashFiles(view.app, items, (done, total) => setLog(view, `Удалено ${done} из ${total}…`));
  const gone = new Set(res.deleted.map((i) => i.path));
  o.items = o.items.filter((i) => !gone.has(i.path));
  view.items = [];
  view.entries = [];
  const problems = res.failed.length + res.skipped.length;
  if (res.deleted.length || problems) {
    await view.plugin.recordRun(deleteRun(res.deleted, problems));
  }
  setLog(view, `Удалено: ${res.deleted.length} (${formatBytes(sumSize(res.deleted))}). Не тронуто: ${problems}${res.skipped.length ? ' — на некоторые файлы появились ссылки' : ''}.`);
  view.busy = false;
  view.render();
}

function openFile(view, item) {
  const file = view.app.vault.getAbstractFileByPath(item.path);
  if (file) view.app.workspace.getLeaf('tab').openFile(file);
}

function renderOrphansTab(view, el) {
  const o = view.orph;
  const s = view.plugin.settings;
  const rows = visible(o);
  const selected = o.items.filter((i) => i.selected);

  // --- панель действий ---
  const bar = el.createDiv({ cls: 'mo-toolbar' });
  const chips = bar.createDiv({ cls: 'mo-chips' });
  for (const [id, label, icon] of TYPES) {
    const n = id === 'all' ? o.items.length : o.items.filter((i) => mediaKind(i.ext) === id).length;
    const chip = chips.createDiv({ cls: 'mo-chip' + (o.type === id ? ' is-active' : '') });
    setIcon(chip.createSpan({ cls: 'mo-ico' }), icon);
    chip.createSpan({ text: `${label} · ${n}` });
    chip.addEventListener('click', () => { o.type = id; o.page = 0; view.render(); });
  }
  const actions = bar.createDiv({ cls: 'mo-actions' });
  const del = actions.createEl('button', { cls: 'mo-btn danger' });
  setIcon(del.createSpan({ cls: 'mo-ico' }), 'trash-2');
  del.createSpan({ text: selected.length ? `Удалить выбранные · ${selected.length} (${formatBytes(sumSize(selected))})` : 'Удалить выбранные' });
  del.disabled = view.busy || !selected.length || !s.allowOrphanDelete;
  del.addEventListener('click', () => deleteItems(view, selected));
  const scan = actions.createEl('button', { cls: 'mo-btn primary' });
  setIcon(scan.createSpan({ cls: 'mo-ico' }), 'scan-search');
  scan.createSpan({ text: view.busy ? 'Работаю…' : 'Найти' });
  scan.disabled = view.busy;
  scan.addEventListener('click', () => scanOrphans(view));

  // --- верхние панели ---
  const top = el.createDiv({ cls: 'mo-top' });
  const panel = top.createDiv({ cls: 'mo-panel' });
  panel.createDiv({ cls: 'mo-panel-title', text: 'Медиа без ссылок' });
  panel.createEl('p', {
    cls: 'mo-muted',
    text: 'Показаны файлы из выбранных папок, на которые не ссылается ни одна заметка. Файлы, чьё имя встречается в тексте заметок, канвах и базах, не показываются: они считаются используемыми. Выбирайте файлы галочками или удаляйте по одному.',
  });
  const opts = panel.createDiv({ cls: 'mo-opts' });
  view.checkbox(opts, 'Разрешить удаление (по умолчанию выключено)', s.allowOrphanDelete, async (v) => {
    s.allowOrphanDelete = v;
    await view.plugin.saveSettings();
    view.render();
  });
  const sortRow = panel.createDiv({ cls: 'mo-sortrow' });
  sortRow.createSpan({ cls: 'mo-label', text: 'Сортировка' });
  const sel = sortRow.createEl('select', { cls: 'dropdown' });
  for (const k of Object.keys(SORTS)) sel.createEl('option', { value: k, text: SORTS[k][0] });
  sel.value = o.sort;
  sel.addEventListener('change', () => { o.sort = sel.value; o.page = 0; view.render(); });

  const stat = top.createDiv({ cls: 'mo-panel' });
  const head = stat.createDiv({ cls: 'mo-panel-head' });
  head.createDiv({ cls: 'mo-panel-title', text: 'Итог' });
  head.createDiv({ cls: 'mo-pill' + (view.busy ? ' is-busy' : ''), text: view.busy ? 'В работе' : o.scanned ? 'Готово' : 'Ожидание' });
  const tiles = stat.createDiv({ cls: 'mo-tiles' });
  const tile = (n, label, cls) => {
    const t = tiles.createDiv({ cls: 'mo-tile ' + cls });
    t.createDiv({ cls: 'mo-tile-n', text: String(n) });
    t.createDiv({ cls: 'mo-tile-l', text: label });
  };
  tile(o.items.length, 'Без ссылок', 'err');
  tile(selected.length, 'Выбрано', 'ok');
  tile(formatBytes(sumSize(selected)), 'Размер', '');
  tile(o.protectedCount, 'Защищено', 'muted');

  // --- таблица ---
  const wrap = el.createDiv({ cls: 'mo-table' });
  const th = wrap.createDiv({ cls: 'mo-tr mo-tr-orph mo-th' });
  const allCb = th.createEl('input', { type: 'checkbox' });
  allCb.checked = rows.length > 0 && rows.every((i) => i.selected);
  allCb.addEventListener('change', () => { rows.forEach((i) => { i.selected = allCb.checked; }); view.render(); });
  ['', 'Файл', 'Размер · изменён', 'Действия'].forEach((t) => th.createDiv({ text: t }));

  if (!rows.length) {
    wrap.createDiv({ cls: 'mo-empty', text: o.scanned ? 'Медиа без ссылок не найдено' : 'Пока ничего не найдено. Нажмите «Найти».' });
  } else {
    const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    o.page = Math.min(o.page, pages - 1);
    for (const it of rows.slice(o.page * PAGE_SIZE, (o.page + 1) * PAGE_SIZE)) renderRow(view, wrap, it);
  }

  // --- подвал ---
  const foot = el.createDiv({ cls: 'mo-footer' });
  const left = foot.createDiv({ cls: 'mo-log' });
  setIcon(left.createSpan({ cls: 'mo-ico ok' }), 'terminal');
  view.orphLogEl = left.createSpan({ text: o.log });
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pager = foot.createDiv({ cls: 'mo-pager' });
  const prev = pager.createEl('button', { cls: 'mo-pg', text: '‹' });
  prev.disabled = o.page <= 0;
  prev.addEventListener('click', () => { o.page--; view.render(); });
  pager.createSpan({ cls: 'mo-pg-label', text: `${o.page + 1} / ${pages}` });
  const next = pager.createEl('button', { cls: 'mo-pg', text: '›' });
  next.disabled = o.page >= pages - 1;
  next.addEventListener('click', () => { o.page++; view.render(); });
}

function renderRow(view, wrap, it) {
  const row = wrap.createDiv({ cls: 'mo-tr mo-tr-orph' });
  const cb = row.createEl('input', { type: 'checkbox' });
  cb.checked = it.selected;
  cb.addEventListener('change', () => { it.selected = cb.checked; view.render(); });

  const thumb = row.createDiv({ cls: 'mo-thumb mo-clickable' });
  const ext = it.ext.toLowerCase();
  const file = view.app.vault.getAbstractFileByPath(it.path);
  if (file && IMG.has(ext)) thumb.createEl('img', { attr: { src: view.app.vault.getResourcePath(file), loading: 'lazy' } });
  else if (file && VID.has(ext)) thumb.createEl('video', { attr: { src: view.app.vault.getResourcePath(file) + '#t=0.1', preload: 'metadata', muted: 'true' } });
  else setIcon(thumb, mediaKind(ext) === 'video' ? 'film' : 'image');
  thumb.addEventListener('click', () => openFile(view, it));

  const names = row.createDiv({ cls: 'mo-names' });
  names.createDiv({ cls: 'mo-old', text: it.path });
  if (it.note) names.createDiv({ cls: 'mo-reason', text: it.note });

  const meta = row.createDiv({ cls: 'mo-note' });
  meta.createDiv({ text: formatBytes(it.size) });
  meta.createDiv({ cls: 'mo-muted', text: it.mtime ? formatDate(it.mtime) : '—' });

  const acts = row.createDiv({ cls: 'mo-row-actions' });
  const open = acts.createEl('button', { cls: 'mo-icon-btn', attr: { title: 'Открыть файл' } });
  setIcon(open, 'external-link');
  open.addEventListener('click', () => openFile(view, it));
  const del = acts.createEl('button', { cls: 'mo-icon-btn danger', attr: { title: 'Удалить этот файл' } });
  setIcon(del, 'trash-2');
  del.disabled = view.busy;
  del.addEventListener('click', () => deleteItems(view, [it]));
}

module.exports = { renderOrphansTab, initState, scanOrphans };
