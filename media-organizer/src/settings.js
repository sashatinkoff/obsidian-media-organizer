// Настройки по умолчанию и вкладка настроек.

const { PluginSettingTab, Setting, Notice } = require('obsidian');
const { renderFolderPicker } = require('./folderSuggest');

const DEFAULT_SETTINGS = {
  folders: [],
  dateProperty: 'date',
  extensions: 'jpg, jpeg, png, gif, webp, bmp, avif, heic, heif, tiff, mp4, mov, mkv, webm, avi, m4v, mpg, mpeg, 3gp',
  indexPad: 3,
  lowercaseNames: false,
  fallbackToCtime: true,
  multiParent: 'skip',
  savedChoices: {},
  history: null,
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

    new Setting(containerEl)
      .setName('Свойство с датой')
      .setDesc('Поле в свойствах родительской заметки. Формат может быть любым. Нет поля — берётся дата создания заметки.')
      .addText((t) => t.setPlaceholder('date').setValue(s.dateProperty).onChange(async (v) => { s.dateProperty = v.trim(); await save(); }));

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
