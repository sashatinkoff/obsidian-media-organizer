// Главное окно плагина (по макету docs/design.svg): шапка, настройки, прогресс, таблица, подвал.

const { ItemView, Notice, setIcon } = require('obsidian');
const { collectEntries } = require('./scanner');
const { buildPlan } = require('./planner');
const { executePlan } = require('./executor');
const { AmbiguityModal, ConfirmModal } = require('./modals');
const { renderFolderPicker } = require('./folderSuggest');
const { renderPropertyPicker } = require('./propertyPicker');
const { sanitizeBase, indexedName } = require('./namer');

const VIEW_TYPE = 'media-organizer-view';
const IMG = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'avif']);
const VID = new Set(['mp4', 'mov', 'webm', 'm4v']);
const PAGE_SIZE = 25;

const STATUS = {
  ready: ['К переносу', 'ok'], inplace: ['На месте', 'muted'], conflict: ['Конфликт', 'err'],
  orphan: ['Без заметки', 'warn'], nodate: ['Нет даты', 'warn'], pending: ['Нужен выбор', 'warn'],
  done: ['Перенесён', 'ok'], error: ['Ошибка', 'err'],
};
const ATTENTION = new Set(['conflict', 'orphan', 'nodate', 'pending', 'error']);
const FILTERS = [
  ['all', 'Все', 'layout-list', () => true],
  ['ready', 'К переносу', 'arrow-right-circle', (i) => i.status === 'ready' || i.status === 'done'],
  ['attention', 'Внимание', 'alert-triangle', (i) => ATTENTION.has(i.status)],
  ['inplace', 'На месте', 'check', (i) => i.status === 'inplace'],
];

class OrganizerView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.items = [];
    this.entries = [];
    this.filter = 'all';
    this.page = 0;
    this.busy = false;
    this.progress = null;
    this.log = 'Выберите папки и нажмите «Сканировать».';
  }

  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return 'Media Organizer'; }
  getIcon() { return 'images'; }

  async onOpen() {
    this.contentEl.addClass('mo-root');
    this.render();
  }

  // ---------- состояние ----------

  makePlan() {
    const s = this.plugin.settings;
    return buildPlan(this.entries, s, s.savedChoices, (p) => !!this.app.vault.getAbstractFileByPath(p));
  }

  setLog(text) {
    this.log = text;
    if (this.logEl) this.logEl.setText(text);
  }

  counts() {
    const c = { all: this.items.length, ready: 0, attention: 0, inplace: 0 };
    for (const i of this.items) {
      if (i.status === 'ready' || i.status === 'done') c.ready++;
      else if (ATTENTION.has(i.status)) c.attention++;
      else if (i.status === 'inplace') c.inplace++;
    }
    return c;
  }

  visibleItems() {
    const f = FILTERS.find((x) => x[0] === this.filter)[3];
    return this.items.filter(f);
  }

  // ---------- действия ----------

  async scan() {
    if (this.busy) return;
    const s = this.plugin.settings;
    if (!s.folders.length) { new Notice('Сначала выберите папки для уборки'); return; }
    this.busy = true;
    this.setLog('Сканирование…');
    this.render();
    try {
      this.entries = collectEntries(this.app, s);
      let plan = this.makePlan();
      if (plan.pending.length) {
        const res = await new AmbiguityModal(this.app, plan.pending).openAndWait();
        if (res) {
          Object.assign(s.savedChoices, res);
          await this.plugin.saveSettings();
          plan = this.makePlan();
        }
      }
      this.items = plan.items;
      this.page = 0;
      const c = this.counts();
      this.setLog(`Найдено файлов: ${c.all}. К переносу: ${c.ready}, требуют внимания: ${c.attention}.`);
    } catch (e) {
      console.error(e);
      this.setLog('Ошибка сканирования: ' + (e && e.message ? e.message : e));
    }
    this.busy = false;
    this.render();
  }

  async applySelected() {
    if (this.busy) return;
    const sel = this.items.filter((i) => i.selected && i.status === 'ready');
    if (!sel.length) { new Notice('Нечего переносить'); return; }
    const ok = await new ConfirmModal(
      this.app,
      'Применить уборку?',
      `Будет переименовано и перемещено файлов: ${sel.length}. Ссылки в заметках обновятся автоматически. Последнюю уборку можно отменить командой «Отменить последнюю уборку».`,
      'Применить'
    ).openAndWait();
    if (!ok) return;

    this.busy = true;
    this.progress = { done: 0, total: sel.length };
    this.render();
    const res = await executePlan(this.app, sel, (done, total) => {
      this.progress = { done, total };
      this.updateProgress();
    });
    this.plugin.settings.history = { at: Date.now(), moves: res.moves };
    await this.plugin.saveSettings();
    this.busy = false;
    this.progress = null;
    this.setLog(`Готово: перенесено ${res.moves.length}, ошибок ${res.failed.length}.`);
    this.render();
  }

  async undo() {
    if (this.busy) return;
    this.busy = true;
    this.render();
    const r = await this.plugin.undoLast();
    this.busy = false;
    if (r) { this.items = []; this.setLog(`Отменено: возвращено ${r.restored}, пропущено ${r.skipped}.`); }
    this.render();
  }

  // ---------- отрисовка ----------

  render() {
    const el = this.contentEl;
    el.empty();
    this.renderHeader(el);
    const top = el.createDiv({ cls: 'mo-top' });
    this.renderConfig(top);
    this.renderProgress(top);
    this.renderTable(el);
    this.renderFooter(el);
  }

  renderHeader(el) {
    const head = el.createDiv({ cls: 'mo-header' });
    const left = head.createDiv();
    const crumbs = left.createDiv({ cls: 'mo-crumbs' });
    crumbs.createSpan({ text: 'Хранилище / Плагины / ' });
    crumbs.createSpan({ cls: 'mo-crumb-active', text: 'Media Organizer' });
    crumbs.createSpan({ cls: 'mo-dot' });
    left.createEl('h1', { cls: 'mo-title', text: 'Уборка галереи' });

    const bar = el.createDiv({ cls: 'mo-toolbar' });
    const chips = bar.createDiv({ cls: 'mo-chips' });
    const counts = this.counts();
    for (const [id, label, icon] of FILTERS) {
      const chip = chips.createDiv({ cls: 'mo-chip' + (this.filter === id ? ' is-active' : '') });
      setIcon(chip.createSpan({ cls: 'mo-ico' }), icon);
      chip.createSpan({ text: `${label} · ${counts[id]}` });
      chip.addEventListener('click', () => { this.filter = id; this.page = 0; this.render(); });
    }
    const actions = bar.createDiv({ cls: 'mo-actions' });
    if (this.plugin.settings.history) {
      const u = actions.createEl('button', { cls: 'mo-btn', text: 'Отменить последнюю' });
      u.disabled = this.busy;
      u.addEventListener('click', () => this.undo());
    }
    const apply = actions.createEl('button', { cls: 'mo-btn', text: 'Применить' });
    apply.disabled = this.busy || !this.items.some((i) => i.selected && i.status === 'ready');
    apply.addEventListener('click', () => this.applySelected());
    const scan = actions.createEl('button', { cls: 'mo-btn primary' });
    setIcon(scan.createSpan({ cls: 'mo-ico' }), 'scan-search');
    scan.createSpan({ text: this.busy ? 'Работаю…' : 'Сканировать' });
    scan.disabled = this.busy;
    scan.addEventListener('click', () => this.scan());
  }

  renderConfig(top) {
    const s = this.plugin.settings;
    const panel = top.createDiv({ cls: 'mo-panel' });
    panel.createDiv({ cls: 'mo-panel-title', text: 'Настройки сканирования' });

    const card = panel.createDiv({ cls: 'mo-card' });
    card.createDiv({ cls: 'mo-label', text: 'Папки для уборки' });
    renderFolderPicker(card, this.app, this.plugin);

    const row = panel.createDiv({ cls: 'mo-row2' });
    const c1 = row.createDiv({ cls: 'mo-card' });
    c1.createDiv({ cls: 'mo-label', text: 'Свойства с датой (по приоритету)' });
    renderPropertyPicker(c1, this.app, this.plugin);

    const c2 = row.createDiv({ cls: 'mo-card' });
    c2.createDiv({ cls: 'mo-label', text: 'Пример имени' });
    const sample = c2.createDiv({ cls: 'mo-sample' });
    const base = sanitizeBase('гремучая смесь', { lowercase: s.lowercaseNames });
    sample.setText(`2026/${indexedName(base, 1, s.indexPad, 'jpg')}`);

    const opts = panel.createDiv({ cls: 'mo-opts' });
    this.checkbox(opts, 'Брать дату создания заметки, если поля нет', s.fallbackToCtime, async (v) => { s.fallbackToCtime = v; });
    this.checkbox(opts, 'Файл из нескольких заметок: брать самую раннюю (иначе — конфликт)', s.multiParent === 'first', async (v) => { s.multiParent = v ? 'first' : 'skip'; });
  }

  checkbox(parent, label, value, onChange) {
    const l = parent.createEl('label', { cls: 'mo-check' });
    const cb = l.createEl('input', { type: 'checkbox' });
    cb.checked = value;
    l.createSpan({ text: label });
    cb.addEventListener('change', async () => { await onChange(cb.checked); await this.plugin.saveSettings(); });
  }

  renderProgress(top) {
    const panel = top.createDiv({ cls: 'mo-panel' });
    const head = panel.createDiv({ cls: 'mo-panel-head' });
    head.createDiv({ cls: 'mo-panel-title', text: 'Результат' });
    head.createDiv({ cls: 'mo-pill' + (this.busy ? ' is-busy' : ''), text: this.busy ? 'В работе' : 'Ожидание' });

    const c = this.counts();
    const done = this.items.filter((i) => i.status === 'done').length;
    const total = this.progress ? this.progress.total : c.ready + done > 0 ? c.ready : 0;
    const val = this.progress ? this.progress.done : 0;
    const track = panel.createDiv({ cls: 'mo-bar' });
    this.barEl = track.createDiv({ cls: 'mo-bar-fill' });
    this.barLabel = panel.createDiv({ cls: 'mo-bar-label' });
    this.setBar(val, total);

    const tiles = panel.createDiv({ cls: 'mo-tiles' });
    const tile = (n, label, cls) => {
      const t = tiles.createDiv({ cls: 'mo-tile ' + cls });
      t.createDiv({ cls: 'mo-tile-n', text: String(n) });
      t.createDiv({ cls: 'mo-tile-l', text: label });
    };
    tile(c.all, 'Всего', '');
    tile(c.ready, 'Перенос', 'ok');
    tile(c.inplace, 'На месте', 'muted');
    tile(c.attention, 'Внимание', 'err');
  }

  setBar(done, total) {
    const pct = total ? Math.round((done / total) * 100) : 0;
    this.barEl.style.width = pct + '%';
    this.barLabel.setText(this.progress ? `Перенесено ${done} из ${total}` : 'Прогресс появится при применении');
  }

  updateProgress() {
    if (this.barEl && this.progress) this.setBar(this.progress.done, this.progress.total);
  }

  renderTable(el) {
    const wrap = el.createDiv({ cls: 'mo-table' });
    const visible = this.visibleItems();

    const head = wrap.createDiv({ cls: 'mo-tr mo-th' });
    const allCb = head.createEl('input', { type: 'checkbox' });
    const selectable = visible.filter((i) => i.status === 'ready');
    allCb.checked = selectable.length > 0 && selectable.every((i) => i.selected);
    allCb.addEventListener('change', () => { selectable.forEach((i) => { i.selected = allCb.checked; }); this.render(); });
    head.createDiv({ text: '' });
    head.createDiv({ text: 'Было → Станет' });
    head.createDiv({ text: 'Заметка и дата' });
    head.createDiv({ text: 'Статус' });

    if (!visible.length) {
      wrap.createDiv({ cls: 'mo-empty', text: this.items.length ? 'В этой категории пусто' : 'Пока ничего не найдено. Нажмите «Сканировать».' });
      return;
    }
    const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
    this.page = Math.min(this.page, pages - 1);
    for (const it of visible.slice(this.page * PAGE_SIZE, (this.page + 1) * PAGE_SIZE)) this.renderRow(wrap, it);
  }

  renderRow(wrap, it) {
    const row = wrap.createDiv({ cls: 'mo-tr' + (it.status === 'error' || it.status === 'conflict' ? ' is-err' : '') });
    const cb = row.createEl('input', { type: 'checkbox' });
    cb.checked = it.selected;
    cb.disabled = it.status !== 'ready';
    cb.addEventListener('change', () => { it.selected = cb.checked; this.render(); });

    const th = row.createDiv({ cls: 'mo-thumb' });
    const ext = it.ext.toLowerCase();
    const file = this.app.vault.getAbstractFileByPath(it.status === 'done' ? it.newPath : it.oldPath);
    if (file && IMG.has(ext)) {
      th.createEl('img', { attr: { src: this.app.vault.getResourcePath(file), loading: 'lazy' } });
    } else if (file && VID.has(ext)) {
      th.createEl('video', { attr: { src: this.app.vault.getResourcePath(file) + '#t=0.1', preload: 'metadata', muted: 'true' } });
    } else {
      setIcon(th, VID.has(ext) || ['mkv', 'avi', 'mpg', 'mpeg', '3gp'].includes(ext) ? 'film' : 'image');
    }

    const names = row.createDiv({ cls: 'mo-names' });
    names.createDiv({ cls: 'mo-old', text: it.oldPath });
    if (it.newPath !== it.oldPath) names.createDiv({ cls: 'mo-new', text: '→ ' + it.newPath });
    if (it.reason) names.createDiv({ cls: 'mo-reason', text: it.reason });

    const note = row.createDiv({ cls: 'mo-note' });
    note.createDiv({ text: it.parentName || '—' });
    if (it.year) note.createDiv({ cls: 'mo-muted', text: `${it.year} · ${it.dateSource === 'ctime' ? 'дата создания' : 'из свойства'}` });

    const [label, cls] = STATUS[it.status];
    row.createDiv({ cls: 'mo-status' }).createSpan({ cls: 'mo-badge ' + cls, text: label });
  }

  renderFooter(el) {
    const foot = el.createDiv({ cls: 'mo-footer' });
    const left = foot.createDiv({ cls: 'mo-log' });
    setIcon(left.createSpan({ cls: 'mo-ico ok' }), 'terminal');
    this.logEl = left.createSpan({ text: this.log });

    const visible = this.visibleItems();
    const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
    const pager = foot.createDiv({ cls: 'mo-pager' });
    const prev = pager.createEl('button', { cls: 'mo-pg', text: '‹' });
    prev.disabled = this.page <= 0;
    prev.addEventListener('click', () => { this.page--; this.render(); });
    pager.createSpan({ cls: 'mo-pg-label', text: `${this.page + 1} / ${pages}` });
    const next = pager.createEl('button', { cls: 'mo-pg', text: '›' });
    next.disabled = this.page >= pages - 1;
    next.addEventListener('click', () => { this.page++; this.render(); });
  }
}

module.exports = { OrganizerView, VIEW_TYPE };
