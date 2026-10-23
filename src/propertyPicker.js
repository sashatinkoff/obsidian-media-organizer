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
