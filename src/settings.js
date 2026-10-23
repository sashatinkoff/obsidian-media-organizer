// Настройки по умолчанию и вкладка настроек.

const { PluginSettingTab, Setting, Notice } = require('obsidian');
const { renderFolderPicker } = require('./folderSuggest');
const { renderPropertyPicker } = require('./propertyPicker');

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
