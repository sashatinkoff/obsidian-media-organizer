// Выбор папок с автоподстановкой: поле ввода + чипы выбранных папок.

const { AbstractInputSuggest, TFolder } = require('obsidian');
const { normFolder } = require('./utils');

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
