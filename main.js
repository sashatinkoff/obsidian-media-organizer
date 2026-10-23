'use strict';
// Media Organizer 1.1.1 — готовый файл плагина, собран из src/ (tools/build.js). Вручную не правьте.
const obsidian = require('obsidian');
const __modules = {
"dateParser.js": function (module, exports, require) {
// Разбор даты из свойства заметки в "любом" формате.
// Для папок нужен только ГОД, поэтому неоднозначность важна лишь там,
// где разные трактовки дают разный год (например 05.06.07).
// Результат:
//   {kind:'ok', year, text}
//   {kind:'ambiguous', pattern, candidates:[{year,label}], raw}
//   {kind:'unparsed', raw}
//   {kind:'empty'}

const MONTHS = {
  янв: 1, фев: 2, мар: 3, апр: 4, мая: 5, май: 5, июн: 6, июл: 7, авг: 8, сен: 9, окт: 10, ноя: 11, дек: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};
const WORD = '[A-Za-zА-Яа-яЁё]{3,}';
const MIN_YEAR = 1900;
const MAX_YEAR = 2100;

function monthFromName(token) {
  return MONTHS[token.toLowerCase().slice(0, 3)] || 0;
}

function validYear(y) {
  return y >= MIN_YEAR && y <= MAX_YEAR;
}

function fmt(y, m, d) {
  const p = (n) => String(n).padStart(2, '0');
  return m ? (d ? `${y}-${p(m)}-${p(d)}` : `${y}-${p(m)}`) : String(y);
}

function ok(y, m, d) {
  return validYear(y) ? { kind: 'ok', year: y, text: fmt(y, m, d) } : null;
}

function expandYear(yy, nowYear) {
  const n = 2000 + yy;
  return n > nowYear + 1 ? 1900 + yy : n;
}

function fromTimestamp(n) {
  const ms = n > 1e11 ? n : n * 1000;
  const d = new Date(ms);
  return isNaN(d) ? null : ok(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

function parseDate(value, nowYear = new Date().getFullYear()) {
  if (Array.isArray(value)) value = value[0];
  if (value === null || value === undefined) return { kind: 'empty' };
  if (value instanceof Date) {
    return ok(value.getFullYear(), value.getMonth() + 1, value.getDate()) || { kind: 'unparsed', raw: String(value) };
  }
  if (typeof value === 'number') {
    if (value >= MIN_YEAR && value <= MAX_YEAR) return ok(value);
    return fromTimestamp(value) || { kind: 'unparsed', raw: String(value) };
  }

  const raw = String(value).trim();
  if (!raw) return { kind: 'empty' };
  const s = raw.replace(/^\[\[|\]\]$/g, '').replace(/^["']|["']$/g, '').trim();
  const unparsed = { kind: 'unparsed', raw };
  let m;

  // 2024-05-01, 2024.05.01, 2024/5/1, 2024-05-01T10:00:00Z (берём дату как написана, без часовых поясов)
  if ((m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})(?!\d)/))) {
    return ok(+m[1], +m[2], +m[3]) || unparsed;
  }
  // 20240501 или 20240501_123000
  if ((m = s.match(/^(\d{4})(\d{2})(\d{2})(?!\d)/)) && +m[2] >= 1 && +m[2] <= 12 && +m[3] >= 1 && +m[3] <= 31) {
    return ok(+m[1], +m[2], +m[3]) || unparsed;
  }
  if ((m = s.match(/^(\d{4})[-./](\d{1,2})$/))) return ok(+m[1], +m[2]) || unparsed;
  if ((m = s.match(/^(\d{4})$/))) return ok(+m[1]) || unparsed;
  if ((m = s.match(/^(\d{10}|\d{13})$/))) return fromTimestamp(+m[1]) || unparsed;

  // 21.10.2026, 10/21/2026, 21-10-26 ...
  if ((m = s.match(/^(\d{1,2})([-./\s])(\d{1,2})\2(\d{2}|\d{4})(?!\d)/))) {
    const a = +m[1], b = +m[3];
    if (m[4].length === 4) return ok(+m[4]) || unparsed;
    const c = +m[4];
    const dmy = (a <= 31 && b >= 1 && b <= 12) || (b <= 31 && a >= 1 && a <= 12);
    const ymd = b >= 1 && b <= 12 && c >= 1 && c <= 31 && m[1].length === 2 && (a > 31 || 2000 + a <= nowYear + 1);
    const yLast = expandYear(c, nowYear);
    const yFirst = expandYear(a, nowYear);
    if (dmy && ymd && yLast !== yFirst) {
      return {
        kind: 'ambiguous',
        raw,
        pattern: m[0].replace(/\d/g, 'N'),
        candidates: [
          { year: yLast, label: `год в конце (ДД${m[2]}ММ${m[2]}ГГ) → ${yLast}` },
          { year: yFirst, label: `год в начале (ГГ${m[2]}ММ${m[2]}ДД) → ${yFirst}` },
        ],
      };
    }
    if (dmy) return ok(yLast) || unparsed;
    if (ymd) return ok(yFirst) || unparsed;
    return unparsed;
  }

  // 21 октября 2026 / 21 Oct 2026
  let re = new RegExp(`(\\d{1,2})(?:-?(?:го|е))?\\s+(${WORD})\\.?,?\\s+(\\d{4})`);
  if ((m = s.match(re)) && monthFromName(m[2])) return ok(+m[3], monthFromName(m[2]), +m[1]) || unparsed;
  // October 21, 2026
  re = new RegExp(`(${WORD})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})`);
  if ((m = s.match(re)) && monthFromName(m[1])) return ok(+m[3], monthFromName(m[1]), +m[2]) || unparsed;
  // октябрь 2026
  re = new RegExp(`(${WORD})\\.?\\s+(\\d{4})`);
  if ((m = s.match(re)) && monthFromName(m[1])) return ok(+m[2], monthFromName(m[1])) || unparsed;

  // Последняя надежда: нативный разбор
  const t = Date.parse(s);
  if (!isNaN(t)) {
    const d = new Date(t);
    return ok(d.getFullYear(), d.getMonth() + 1, d.getDate()) || unparsed;
  }
  return unparsed;
}

module.exports = { parseDate };

},
"executor.js": function (module, exports, require) {
// Применение плана и откат. Переименование через fileManager — ссылки в заметках обновляются сами.

const { dirOf } = __load("utils.js");
const { rewriteNote, revertNote } = __load("refs.js");

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

},
"folderSuggest.js": function (module, exports, require) {
// Выбор папок с автоподстановкой: поле ввода + чипы выбранных папок.

const { AbstractInputSuggest, TFolder } = require('obsidian');
const { normFolder } = __load("utils.js");

function allFolders(app) {
  const list = app.vault.getAllLoadedFiles().filter((f) => f instanceof TFolder);
  return list.map((f) => (f.path === '/' ? '/' : f.path)).sort((a, b) => a.localeCompare(b));
}

/** Подключает автоподстановку папок к <input>. */
function attachFolderSuggest(app, inputEl, onChoose) {
  if (typeof AbstractInputSuggest === 'function') {
    class FolderSuggest extends AbstractInputSuggest {
      getSuggestions(query) {
        const q = query.toLowerCase();
        return allFolders(app).filter((p) => p.toLowerCase().includes(q)).slice(0, 50);
      }
      renderSuggestion(path, el) { el.setText(path); }
      selectSuggestion(path) { this.setValue(''); this.close(); onChoose(path); }
    }
    return new FolderSuggest(app, inputEl);
  }
  // запасной вариант для старых версий
  const dl = inputEl.parentElement.createEl('datalist');
  dl.id = 'mo-folders-' + Math.random().toString(36).slice(2);
  allFolders(app).forEach((p) => dl.createEl('option', { value: p }));
  inputEl.setAttr('list', dl.id);
  inputEl.addEventListener('change', () => {
    if (inputEl.value.trim()) { onChoose(inputEl.value.trim()); inputEl.value = ''; }
  });
  return null;
}

/** Рисует список выбранных папок и поле добавления. */
function renderFolderPicker(containerEl, app, plugin, onChange) {
  const wrap = containerEl.createDiv({ cls: 'mo-folders' });
  const chips = wrap.createDiv({ cls: 'mo-folder-chips' });
  const s = plugin.settings;

  const redraw = () => {
    chips.empty();
    if (!s.folders.length) chips.createSpan({ cls: 'mo-muted', text: 'Папки не выбраны' });
    s.folders.forEach((f, i) => {
      const chip = chips.createDiv({ cls: 'mo-folder-chip' });
      chip.createSpan({ text: f === '' || f === '/' ? '/ (всё хранилище)' : f });
      const x = chip.createSpan({ cls: 'mo-chip-x', text: '×' });
      x.addEventListener('click', async () => {
        s.folders.splice(i, 1);
        await plugin.saveSettings();
        redraw();
        if (onChange) onChange();
      });
    });
  };

  const input = wrap.createEl('input', { type: 'text', cls: 'mo-input', placeholder: 'Начните вводить название папки…' });
  attachFolderSuggest(app, input, async (path) => {
    const n = normFolder(path);
    if (!s.folders.map(normFolder).includes(n)) {
      s.folders.push(path === '/' ? '/' : n);
      await plugin.saveSettings();
      redraw();
      if (onChange) onChange();
    }
  });
  redraw();
  return wrap;
}

module.exports = { attachFolderSuggest, renderFolderPicker };

},
"main.js": function (module, exports, require) {
// Логика плагина. Методы подмешиваются в класс плагина из корневого main.js.

const { Notice } = require('obsidian');
const { OrganizerView, VIEW_TYPE } = __load("view.js");
const { OrganizerSettingTab, DEFAULT_SETTINGS } = __load("settings.js");
const { undoMoves } = __load("executor.js");
const { undoRun, MAX_RUNS } = __load("stats.js");

module.exports = {
  async start() {
    await this.loadSettings();
    this.registerView(VIEW_TYPE, (leaf) => new OrganizerView(leaf, this));
    this.addRibbonIcon('images', 'Media Organizer', () => this.activateView());
    this.addCommand({ id: 'open', name: 'Открыть Media Organizer', callback: () => this.activateView() });
    this.addCommand({ id: 'undo-last', name: 'Отменить последнюю уборку', callback: () => this.undoLast() });
    this.addSettingTab(new OrganizerSettingTab(this.app, this));
  },

  stop() {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE);
  },

  async loadSettings() {
    const data = (await this.loadData()) || {};
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
    this.settings.folders = Array.isArray(data.folders) ? data.folders : [];
    this.settings.savedChoices = data.savedChoices || {};
    this.settings.stats = { runs: data.stats && Array.isArray(data.stats.runs) ? data.stats.runs : [] };
    // миграция: раньше было одно свойство
    if (!Array.isArray(data.dateProperties)) {
      this.settings.dateProperties = data.dateProperty ? [data.dateProperty] : DEFAULT_SETTINGS.dateProperties.slice();
    }
    delete this.settings.dateProperty;
  },

  async saveSettings() {
    await this.saveData(this.settings);
  },

  /** Добавляет запись о запуске в статистику и сохраняет настройки. */
  async recordRun(run) {
    const runs = this.settings.stats.runs;
    runs.push(run);
    if (runs.length > MAX_RUNS) runs.splice(0, runs.length - MAX_RUNS);
    await this.saveSettings();
  },

  async activateView() {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) {
      leaf = workspace.getLeaf('tab');
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
    }
    workspace.revealLeaf(leaf);
  },

  async undoLast() {
    const h = this.settings.history;
    if (!h || !h.moves || !h.moves.length) { new Notice('Нечего отменять'); return null; }
    const r = await undoMoves(this.app, h.moves, h.edits);
    this.settings.history = null;
    await this.recordRun(undoRun(r.restored, r.skipped));
    new Notice(`Отменено: возвращено ${r.restored}, пропущено ${r.skipped}`);
    return r;
  },
};

},
"modals.js": function (module, exports, require) {
// Диалоги: подтверждение и вопрос по неоднозначным датам.

const { Modal, Setting } = require('obsidian');

class ConfirmModal extends Modal {
  constructor(app, title, text, okLabel, danger) {
    super(app);
    this.title = title; this.text = text; this.okLabel = okLabel || 'Продолжить'; this.danger = !!danger;
    this.result = false;
  }
  openAndWait() {
    return new Promise((resolve) => { this.resolve = resolve; this.open(); });
  }
  onOpen() {
    this.titleEl.setText(this.title);
    this.contentEl.createEl('p', { text: this.text });
    new Setting(this.contentEl)
      .addButton((b) => b.setButtonText('Отмена').onClick(() => this.close()))
      .addButton((b) => {
        if (this.danger) b.setWarning(); else b.setCta();
        b.setButtonText(this.okLabel).onClick(() => { this.result = true; this.close(); });
      });
  }
  onClose() { this.contentEl.empty(); this.resolve(this.result); }
}

/** groups: [{id, type:'ambiguous'|'unparsed', samples, count, candidates?}] -> {id: choice} | null */
class AmbiguityModal extends Modal {
  constructor(app, groups) {
    super(app);
    this.groups = groups;
    this.choices = {};
    this.result = null;
    groups.forEach((g) => { this.choices[g.id] = g.type === 'ambiguous' ? 0 : 'ctime'; });
  }
  openAndWait() {
    return new Promise((resolve) => { this.resolve = resolve; this.open(); });
  }
  onOpen() {
    this.titleEl.setText('Нужно уточнить даты');
    this.contentEl.createEl('p', {
      cls: 'mo-muted',
      text: 'После сканирования нашлись даты, которые нельзя однозначно превратить в год. Выберите, как их читать — выбор запомнится.',
    });
    for (const g of this.groups) {
      const title = g.type === 'ambiguous'
        ? `Формат ${g.pattern} (${g.count} шт.)`
        : `Не удалось распознать (${g.count} шт.)`;
      const setting = new Setting(this.contentEl).setName(title).setDesc('Например: ' + g.samples.join(' · '));
      setting.addDropdown((d) => {
        if (g.type === 'ambiguous') g.candidates.forEach((c, i) => d.addOption(String(i), c.label));
        else d.addOption('ctime', 'Взять дату создания заметки');
        d.addOption('skip', 'Пропустить эти файлы');
        d.setValue(String(this.choices[g.id]));
        d.onChange((v) => { this.choices[g.id] = v === 'skip' || v === 'ctime' ? v : Number(v); });
      });
    }
    new Setting(this.contentEl)
      .addButton((b) => b.setButtonText('Отмена').onClick(() => this.close()))
      .addButton((b) => b.setButtonText('Применить').setCta().onClick(() => { this.result = this.choices; this.close(); }));
  }
  onClose() { this.contentEl.empty(); this.resolve(this.result); }
}

module.exports = { ConfirmModal, AmbiguityModal };

},
"namer.js": function (module, exports, require) {
// Формирование имён файлов: "гремучая смесь" -> "гремучая_смесь_001.jpg".

function sanitizeBase(name, opts) {
  let s = String(name || '')
    .normalize('NFC')
    .replace(/[\\/:*?"<>|#^\[\]]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_.]+|[_.]+$/g, '');
  if (opts && opts.lowercase) s = s.toLowerCase();
  if (s.length > 120) s = s.slice(0, 120).replace(/_+$/, '');
  return s || 'media';
}

function indexedName(base, index, pad, ext) {
  return base + '_' + String(index).padStart(pad, '0') + '.' + ext;
}

module.exports = { sanitizeBase, indexedName };

},
"orphans.js": function (module, exports, require) {
// Поиск медиафайлов, на которые не ссылается ни одна заметка.
// Кроме ссылок, известных Obsidian, дополнительно ищем имя файла в тексте заметок, канв и баз:
// так не пропадут файлы, упомянутые в свойствах, в Canvas или обычным текстом.

const { collectEntries, extensionSet, dateValues } = __load("scanner.js");
const { escapeRegExp } = __load("utils.js");

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

},
"planner.js": function (module, exports, require) {
// Построение плана уборки. Чистая логика без Obsidian API — легко тестировать.
// entries: [{path, basename, name, ext, root, parents:[{path, basename, order, ctime, dateRaw}]}]
// choices: ответы пользователя по неоднозначным датам
//   'amb:<шаблон>' -> 0 | 1 | 'skip'     'unparsed' -> 'ctime' | 'skip'
// exists(path) -> bool: занят ли путь в хранилище.

const { parseDate } = __load("dateParser.js");
const { sanitizeBase, indexedName } = __load("namer.js");
const { joinPath, dirOf, escapeRegExp } = __load("utils.js");

function addPending(map, id, type, sample, extra) {
  let g = map.get(id);
  if (!g) {
    g = Object.assign({ id, type, samples: new Set(), count: 0 }, extra);
    map.set(id, g);
  }
  g.samples.add(sample);
  g.count++;
}

function fallbackDate(parent, settings) {
  if (!settings.fallbackToCtime) return { status: 'nodate', reason: 'В заметке нет даты' };
  return { year: new Date(parent.ctime).getFullYear(), source: 'ctime' };
}

function resolveDate(parent, settings, choices, pending) {
  // пробуем свойства по приоритету: первое, которое удалось прочитать, побеждает
  const raws = parent.dateRaws || (parent.dateRaw !== undefined ? [parent.dateRaw] : []);
  let r = { kind: 'empty' };
  for (const raw of raws) {
    const cur = parseDate(raw);
    if (cur.kind === 'ok') return { year: cur.year, source: 'property' };
    if (r.kind === 'empty' && cur.kind !== 'empty') r = cur;
  }
  if (r.kind === 'empty') return fallbackDate(parent, settings);

  if (r.kind === 'ambiguous') {
    const id = 'amb:' + r.pattern;
    const c = choices[id];
    if (c === undefined) {
      addPending(pending, id, 'ambiguous', r.raw, { pattern: r.pattern, candidates: r.candidates });
      return { status: 'pending', reason: 'Нужен выбор формата даты' };
    }
    if (c === 'skip') return { status: 'nodate', reason: 'Дата пропущена по выбору' };
    return { year: r.candidates[c].year, source: 'property' };
  }

  const c = choices.unparsed;
  if (c === undefined) {
    addPending(pending, 'unparsed', 'unparsed', r.raw, {});
    return { status: 'pending', reason: 'Не удалось распознать дату' };
  }
  if (c === 'ctime') return fallbackDate(parent, { fallbackToCtime: true });
  return { status: 'nodate', reason: 'Дата не распознана' };
}

function buildPlan(entries, settings, choices, exists) {
  choices = choices || {};
  const pending = new Map();
  const items = [];
  const groups = new Map();

  for (const e of entries) {
    const item = {
      id: e.path, oldPath: e.path, newPath: e.path, name: e.name, ext: e.ext,
      status: 'ready', reason: '', year: null, parent: null, parentName: '',
      dateSource: null, selected: false,
    };
    items.push(item);

    if (!e.parents.length) {
      item.status = 'orphan';
      item.reason = 'Файл не вставлен ни в одну заметку (см. вкладку «Без ссылок»)';
      continue;
    }
    const sorted = e.parents.slice().sort((a, b) => a.ctime - b.ctime || a.path.localeCompare(b.path));
    // если файл вставлен (![]) в одни заметки и лишь упомянут ссылкой в других — родитель среди вставивших
    const embedded = sorted.filter((p) => p.embedded);
    const parents = embedded.length ? embedded : sorted;
    if (parents.length > 1 && settings.multiParent === 'skip') {
      const names = parents.slice(0, 3).map((p) => p.basename).join(', ');
      item.status = 'conflict';
      item.reason = `Используется в ${parents.length} заметках: ${names}${parents.length > 3 ? '…' : ''}`;
      continue;
    }
    const p = parents[0];
    item.textNotes = e.parents.filter((x) => x.textRef).map((x) => x.path);
    if (item.textNotes.length) item.hint = 'Упоминание в тексте заметки (не вики-ссылка) плагин обновит сам';
    item.parent = p.path;
    item.parentName = p.basename;

    const d = resolveDate(p, settings, choices, pending);
    if (d.status) { item.status = d.status; item.reason = d.reason; continue; }
    item.year = d.year;
    item.dateSource = d.source;

    const dir = joinPath(e.root, String(d.year));
    const key = p.path + '|' + dir;
    if (!groups.has(key)) groups.set(key, { dir, parent: p, members: [] });
    groups.get(key).members.push({ item, entry: e, order: p.order });
  }

  const taken = new Set();
  const pad = settings.indexPad || 3;

  for (const g of groups.values()) {
    const base = sanitizeBase(g.parent.basename, { lowercase: settings.lowercaseNames });
    const re = new RegExp('^' + escapeRegExp(base) + '_(\\d+)$');
    g.members.sort((a, b) => a.order - b.order || a.item.oldPath.localeCompare(b.item.oldPath));

    // 1) файлы, которые уже названы правильно и лежат где надо, остаются на месте
    for (const m of g.members) {
      if (dirOf(m.item.oldPath) === g.dir && re.test(m.entry.basename)) {
        m.item.newPath = m.item.oldPath;
        taken.add(m.item.oldPath.toLowerCase());
        m.done = true;
      }
    }
    // 2) остальным — первый свободный индекс
    let i = 1;
    for (const m of g.members) {
      if (m.done) continue;
      const ext = m.entry.ext.toLowerCase();
      let cand, lc;
      for (;; i++) {
        cand = joinPath(g.dir, indexedName(base, i, pad, ext));
        lc = cand.toLowerCase();
        if (!taken.has(lc) && !exists(cand)) break;
      }
      taken.add(lc);
      m.item.newPath = cand;
      i++;
    }
  }

  for (const it of items) {
    if (it.status !== 'ready') continue;
    if (it.newPath === it.oldPath) it.status = 'inplace';
    else it.selected = true;
  }

  return {
    items,
    pending: [...pending.values()].map((g) => Object.assign({}, g, { samples: [...g.samples].slice(0, 6) })),
  };
}

module.exports = { buildPlan };

},
"propertyPicker.js": function (module, exports, require) {
// Выбор нескольких свойств с датой: чипы по приоритету + автоподстановка имён свойств хранилища.

const { AbstractInputSuggest } = require('obsidian');

function propertyNames(app) {
  try {
    const info = app.metadataCache.getAllPropertyInfos ? app.metadataCache.getAllPropertyInfos() : {};
    return Object.values(info).map((i) => i.name).sort((a, b) => a.localeCompare(b));
  } catch (e) {
    return [];
  }
}

function renderPropertyPicker(containerEl, app, plugin, onChange) {
  const s = plugin.settings;
  const wrap = containerEl.createDiv({ cls: 'mo-folders' });
  const chips = wrap.createDiv({ cls: 'mo-folder-chips' });

  const commit = async () => {
    await plugin.saveSettings();
    redraw();
    if (onChange) onChange();
  };

  function redraw() {
    chips.empty();
    if (!s.dateProperties.length) chips.createSpan({ cls: 'mo-muted', text: 'Свойства не выбраны — берётся дата создания заметки' });
    s.dateProperties.forEach((name, i) => {
      const chip = chips.createDiv({ cls: 'mo-folder-chip' });
      chip.createSpan({ cls: 'mo-muted', text: String(i + 1) });
      chip.createSpan({ text: name });
      if (i > 0) {
        const up = chip.createSpan({ cls: 'mo-chip-up', text: '↑', attr: { title: 'Поднять приоритет' } });
        up.addEventListener('click', async () => {
          [s.dateProperties[i - 1], s.dateProperties[i]] = [s.dateProperties[i], s.dateProperties[i - 1]];
          await commit();
        });
      }
      const x = chip.createSpan({ cls: 'mo-chip-x', text: '×' });
      x.addEventListener('click', async () => { s.dateProperties.splice(i, 1); await commit(); });
    });
  }

  const add = async (raw) => {
    const name = String(raw || '').trim();
    if (!name || s.dateProperties.some((p) => p.toLowerCase() === name.toLowerCase())) return;
    s.dateProperties.push(name);
    await commit();
  };

  const input = wrap.createEl('input', { type: 'text', cls: 'mo-input', placeholder: 'Имя свойства, Enter — добавить' });
  if (typeof AbstractInputSuggest === 'function') {
    class PropSuggest extends AbstractInputSuggest {
      getSuggestions(q) {
        const low = q.toLowerCase();
        return propertyNames(app).filter((n) => n.toLowerCase().includes(low)).slice(0, 50);
      }
      renderSuggestion(name, el) { el.setText(name); }
      selectSuggestion(name) { this.setValue(''); this.close(); add(name); }
    }
    new PropSuggest(app, input);
  }
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    // если выбрана подсказка, поле уже очищено — тогда ничего не добавляем
    setTimeout(() => { if (input.value.trim()) { add(input.value); input.value = ''; } }, 0);
  });
  redraw();
  return wrap;
}

module.exports = { renderPropertyPicker };

},
"refs.js": function (module, exports, require) {
// Правка упоминаний файла в тексте заметок — для ссылок, которые Obsidian сам не обновляет
// (например, <video src="путь/файл.mp4"> или путь в обычном тексте).

const { escapeRegExp } = __load("utils.js");

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

},
"scanner.js": function (module, exports, require) {
// Сбор медиафайлов из выбранных папок и их родительских заметок (Obsidian API).

const { normFolder, inFolder } = __load("utils.js");

function extensionSet(settings) {
  return new Set(
    String(settings.extensions || '')
      .split(/[\s,;]+/)
      .map((e) => e.trim().replace(/^\./, '').toLowerCase())
      .filter(Boolean)
  );
}

function readProperty(fm, prop) {
  if (!fm || !prop) return undefined;
  if (fm[prop] !== undefined) return fm[prop];
  const low = prop.toLowerCase();
  const key = Object.keys(fm).find((k) => k.toLowerCase() === low);
  return key ? fm[key] : undefined;
}

/** Значения всех заданных свойств с датой (в порядке приоритета), пустые пропускаются. */
function dateValues(fm, settings) {
  const out = [];
  for (const prop of settings.dateProperties || []) {
    const v = readProperty(fm, prop);
    const empty = v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);
    if (!empty) out.push(v);
  }
  return out;
}

/** Позиция каждого вложения/ссылки в заметке — чтобы индексы шли в порядке появления. */
function linkOrder(app, note) {
  const cache = app.metadataCache.getFileCache(note);
  const order = new Map();
  const embeds = new Set();
  if (!cache) return { order, embeds };
  const embedList = cache.embeds || [];
  const refs = [...embedList, ...(cache.links || [])].sort(
    (a, b) => a.position.start.offset - b.position.start.offset
  );
  let n = 0;
  for (const r of refs) {
    const dest = app.metadataCache.getFirstLinkpathDest(r.link.split('#')[0], note.path);
    if (!dest) continue;
    if (!order.has(dest.path)) order.set(dest.path, n++);
    if (embedList.includes(r)) embeds.add(dest.path);
  }
  return { order, embeds };
}

function collectEntries(app, settings) {
  const exts = extensionSet(settings);
  const roots = settings.folders.map(normFolder).sort((a, b) => b.length - a.length);
  const files = app.vault.getFiles().filter((f) => {
    if (!exts.has(f.extension.toLowerCase())) return false;
    return roots.some((r) => inFolder(f.path, r));
  });
  const wanted = new Map(files.map((f) => [f.path, f]));

  // обратные ссылки: файл -> заметки
  const parentsOf = new Map();
  const resolved = app.metadataCache.resolvedLinks;
  for (const notePath of Object.keys(resolved)) {
    const targets = resolved[notePath];
    for (const target of Object.keys(targets)) {
      if (!wanted.has(target)) continue;
      if (!parentsOf.has(target)) parentsOf.set(target, []);
      parentsOf.get(target).push(notePath);
    }
  }

  // запасной путь: ссылка не разрешилась, но имя файла совпадает (однозначно)
  const byName = new Map();
  for (const f of files) {
    const k = f.name.toLowerCase();
    byName.set(k, byName.has(k) ? null : f.path);
  }
  const unresolved = app.metadataCache.unresolvedLinks || {};
  for (const notePath of Object.keys(unresolved)) {
    for (const link of Object.keys(unresolved[notePath])) {
      let name = link.split('#')[0].split('/').pop();
      try { name = decodeURIComponent(name); } catch (e) { /* оставляем как есть */ }
      const target = byName.get(name.toLowerCase());
      if (!target) continue;
      if (!parentsOf.has(target)) parentsOf.set(target, []);
      if (!parentsOf.get(target).includes(notePath)) parentsOf.get(target).push(notePath);
    }
  }

  const noteInfo = new Map();
  const info = (notePath) => {
    if (noteInfo.has(notePath)) return noteInfo.get(notePath);
    const note = app.vault.getAbstractFileByPath(notePath);
    if (!note || note.extension !== 'md') { noteInfo.set(notePath, null); return null; }
    const fm = (app.metadataCache.getFileCache(note) || {}).frontmatter;
    const lo = linkOrder(app, note);
    const v = {
      path: note.path,
      basename: note.basename,
      ctime: note.stat.ctime,
      dateRaws: dateValues(fm, settings),
      order: lo.order,
      embeds: lo.embeds,
    };
    noteInfo.set(notePath, v);
    return v;
  };

  return files.map((f) => {
    const parents = (parentsOf.get(f.path) || [])
      .map(info)
      .filter(Boolean)
      .map((n) => ({
        path: n.path, basename: n.basename, ctime: n.ctime, dateRaws: n.dateRaws,
        order: n.order.has(f.path) ? n.order.get(f.path) : 1e9,
        embedded: n.embeds.has(f.path),
      }));
    return {
      path: f.path,
      basename: f.basename,
      name: f.name,
      ext: f.extension,
      root: roots.find((r) => inFolder(f.path, r)),
      parents,
    };
  });
}

module.exports = { collectEntries, extensionSet, dateValues };

},
"settings.js": function (module, exports, require) {
// Настройки по умолчанию и вкладка настроек.

const { PluginSettingTab, Setting, Notice } = require('obsidian');
const { renderFolderPicker } = __load("folderSuggest.js");
const { renderPropertyPicker } = __load("propertyPicker.js");

const DEFAULT_SETTINGS = {
  folders: [],
  dateProperties: ['date', 'Дата'],
  extensions: 'jpg, jpeg, png, gif, webp, bmp, avif, heic, heif, tiff, mp4, mov, mkv, webm, avi, m4v, mpg, mpeg, 3gp',
  indexPad: 3,
  lowercaseNames: false,
  fallbackToCtime: true,
  multiParent: 'skip',
  savedChoices: {},
  history: null,
  allowOrphanDelete: false,
  reportFolder: 'Media Organizer',
  stats: { runs: [] },
};

class OrganizerSettingTab extends PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }

  display() {
    const { containerEl } = this;
    const s = this.plugin.settings;
    const save = () => this.plugin.saveSettings();
    containerEl.empty();
    containerEl.addClass('mo-settings');

    new Setting(containerEl).setName('Папки для уборки').setDesc(
      'Файлы внутри этих папок будут переименованы и разложены по подпапкам-годам (папка/ГГГГ/имя_001.jpg).'
    ).setHeading();
    renderFolderPicker(containerEl, this.app, this.plugin);

    new Setting(containerEl).setName('Свойства с датой').setDesc(
      'Поля свойств родительской заметки, по приоритету: используется первое, которое удалось прочитать. Форматы могут быть разными. Ничего не нашлось — дата создания заметки.'
    ).setHeading();
    renderPropertyPicker(containerEl, this.app, this.plugin);

    new Setting(containerEl)
      .setName('Дата создания, если поля нет')
      .setDesc('Выключите, чтобы пропускать файлы из заметок без даты.')
      .addToggle((t) => t.setValue(s.fallbackToCtime).onChange(async (v) => { s.fallbackToCtime = v; await save(); }));

    new Setting(containerEl)
      .setName('Файл в нескольких заметках')
      .setDesc('Какое имя давать файлу, который вставлен сразу в несколько заметок.')
      .addDropdown((d) => d
        .addOption('skip', 'Пропускать (показать как конфликт)')
        .addOption('first', 'Брать самую раннюю заметку')
        .setValue(s.multiParent)
        .onChange(async (v) => { s.multiParent = v; await save(); }));

    new Setting(containerEl)
      .setName('Количество цифр в индексе')
      .setDesc('3 → гремучая_смесь_001')
      .addDropdown((d) => d.addOption('2', '2').addOption('3', '3').addOption('4', '4')
        .setValue(String(s.indexPad)).onChange(async (v) => { s.indexPad = Number(v); await save(); }));

    new Setting(containerEl)
      .setName('Имена строчными буквами')
      .addToggle((t) => t.setValue(s.lowercaseNames).onChange(async (v) => { s.lowercaseNames = v; await save(); }));

    new Setting(containerEl)
      .setName('Расширения медиафайлов')
      .setDesc('Через запятую.')
      .addTextArea((t) => t.setValue(s.extensions).onChange(async (v) => { s.extensions = v; await save(); }));

    new Setting(containerEl).setName('Медиа без ссылок и статистика').setHeading();

    new Setting(containerEl)
      .setName('Разрешить удаление медиа без ссылок')
      .setDesc('Включает кнопки удаления на вкладке «Без ссылок». Файлы уходят в корзину по настройке Obsidian «Удалённые файлы». Выключено по умолчанию.')
      .addToggle((t) => t.setValue(s.allowOrphanDelete).onChange(async (v) => { s.allowOrphanDelete = v; await save(); }));

    new Setting(containerEl)
      .setName('Папка для инфографики')
      .setDesc('Сюда кнопка «Сохранить инфографику» на вкладке «Статистика» кладёт SVG-вложение. Пусто — корень хранилища.')
      .addText((t) => t.setPlaceholder('Media Organizer').setValue(s.reportFolder).onChange(async (v) => { s.reportFolder = v.trim(); await save(); }));

    new Setting(containerEl)
      .setName('Сбросить запомненные ответы о датах')
      .setDesc('Плагин снова спросит про неоднозначные форматы при следующем сканировании.')
      .addButton((b) => b.setButtonText('Сбросить').onClick(async () => {
        s.savedChoices = {};
        await save();
        new Notice('Запомненные ответы сброшены');
      }));
  }
}

module.exports = { DEFAULT_SETTINGS, OrganizerSettingTab };

},
"stats.js": function (module, exports, require) {
// Статистика уборок: записи о запусках и сводка для инфографики. Чистая логика.
// Запись запуска: {type:'organize'|'delete'|'undo', at, count, failed, bytes, years:{ГГГГ:n}, photos, videos}

const { mediaKind } = __load("utils.js");

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

},
"statsSvg.js": function (module, exports, require) {
// Инфографика статистики уборок в виде самостоятельного SVG (тёмная палитра макета).
// Один и тот же SVG показывается во вкладке и сохраняется в хранилище как вложение.

const { formatBytes, formatNum, formatDate, plural } = __load("utils.js");

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

},
"tabOrphans.js": function (module, exports, require) {
// Вкладка «Без ссылок»: поиск медиа, на которые не ссылается ни одна заметка, и точечное удаление.

const { Notice, setIcon } = require('obsidian');
const { findOrphans } = __load("orphans.js");
const { trashFiles } = __load("executor.js");
const { ConfirmModal } = __load("modals.js");
const { deleteRun } = __load("stats.js");
const { formatBytes, formatDate, mediaKind } = __load("utils.js");

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

},
"tabStats.js": function (module, exports, require) {
// Вкладка «Статистика»: инфографика, список последних запусков, сохранение SVG в хранилище.

const { Notice, setIcon } = require('obsidian');
const { summarize } = __load("stats.js");
const { buildInfographic } = __load("statsSvg.js");
const { ConfirmModal } = __load("modals.js");
const { ensureFolder } = __load("executor.js");
const { normFolder, joinPath, formatBytes, formatDateTime, isoDate } = __load("utils.js");

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

},
"utils.js": function (module, exports, require) {
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

},
"view.js": function (module, exports, require) {
// Главное окно плагина (по макету docs/design.svg): шапка, настройки, прогресс, таблица, подвал.

const { ItemView, Notice, setIcon } = require('obsidian');
const { collectEntries } = __load("scanner.js");
const { buildPlan } = __load("planner.js");
const { executePlan } = __load("executor.js");
const { AmbiguityModal, ConfirmModal } = __load("modals.js");
const { renderFolderPicker } = __load("folderSuggest.js");
const { renderPropertyPicker } = __load("propertyPicker.js");
const { sanitizeBase, indexedName } = __load("namer.js");
const { renderOrphansTab, initState, scanOrphans } = __load("tabOrphans.js");
const { renderStatsTab } = __load("tabStats.js");
const { organizeRun } = __load("stats.js");
const { attachTextParents } = __load("orphans.js");

const VIEW_TYPE = 'media-organizer-view';
const IMG = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'avif']);
const VID = new Set(['mp4', 'mov', 'webm', 'm4v']);
const PAGE_SIZE = 25;
const TABS = [
  ['organize', 'Уборка', 'folder-tree'],
  ['orphans', 'Без ссылок', 'unlink'],
  ['stats', 'Статистика', 'activity'],
];

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
    this.tab = 'organize';
    this.orph = initState();
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
      await attachTextParents(this.app, s, this.entries, (done, total) => this.setLog(`Проверяю заметки: ${done} из ${total}`));
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
    for (const it of sel) {
      const f = this.app.vault.getAbstractFileByPath(it.oldPath);
      it.size = f && f.stat ? f.stat.size : 0;
    }
    this.progress = { done: 0, total: sel.length };
    this.render();
    const res = await executePlan(this.app, sel, (done, total) => {
      this.progress = { done, total };
      this.updateProgress();
    });
    this.plugin.settings.history = { at: Date.now(), moves: res.moves, edits: res.edits };
    if (res.moves.length || res.failed.length) await this.plugin.recordRun(organizeRun(sel, res.failed.length));
    else await this.plugin.saveSettings();
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
    this.renderTitle(el);
    this.renderTabs(el);
    if (this.tab === 'orphans') { renderOrphansTab(this, el); return; }
    if (this.tab === 'stats') { renderStatsTab(this, el); return; }
    this.renderToolbar(el);
    const top = el.createDiv({ cls: 'mo-top' });
    this.renderConfig(top);
    this.renderProgress(top);
    this.renderTable(el);
    this.renderFooter(el);
  }

  renderTitle(el) {
    const head = el.createDiv({ cls: 'mo-header' });
    const left = head.createDiv();
    const crumbs = left.createDiv({ cls: 'mo-crumbs' });
    crumbs.createSpan({ text: 'Хранилище / Плагины / ' });
    crumbs.createSpan({ cls: 'mo-crumb-active', text: 'Media Organizer' });
    crumbs.createSpan({ cls: 'mo-dot' });
    const ver = this.plugin.manifest && this.plugin.manifest.version;
    if (ver) crumbs.createSpan({ cls: 'mo-muted', text: 'v' + ver });
    left.createEl('h1', { cls: 'mo-title', text: 'Уборка галереи' });
  }

  renderTabs(el) {
    const bar = el.createDiv({ cls: 'mo-tabs' });
    for (const [id, label, icon] of TABS) {
      const tab = bar.createDiv({ cls: 'mo-tab' + (this.tab === id ? ' is-active' : '') });
      setIcon(tab.createSpan({ cls: 'mo-ico' }), icon);
      const n = id === 'orphans' && this.orph.scanned ? ` · ${this.orph.items.length}` : '';
      tab.createSpan({ text: label + n });
      tab.addEventListener('click', () => {
        if (this.busy || this.tab === id) return;
        this.tab = id;
        this.render();
      });
    }
  }

  renderToolbar(el) {
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
    if (it.hint) names.createDiv({ cls: 'mo-muted', text: it.hint });
    if (it.reason) names.createDiv({ cls: 'mo-reason', text: it.reason });
    if (it.status === 'orphan') {
      const go = names.createEl('button', { cls: 'mo-link', text: 'Показать на вкладке «Без ссылок» →' });
      go.addEventListener('click', () => { this.tab = 'orphans'; scanOrphans(this); });
    }

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

},
};
const __cache = {};
function __load(name) {
  if (__cache[name]) return __cache[name].exports;
  const mod = (__cache[name] = { exports: {} });
  __modules[name](mod, mod.exports, require);
  return mod.exports;
}

module.exports = class MediaOrganizerPlugin extends obsidian.Plugin {
  async onload() {
    console.info('[Media Organizer] загружен, версия 1.1.1, модулей: 18');
    Object.assign(this, __load('main.js'));
    await this.start();
  }

  onunload() {
    if (this.stop) this.stop();
  }
};
