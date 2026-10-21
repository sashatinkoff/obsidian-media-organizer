// Логика плагина. Методы подмешиваются в класс плагина из корневого main.js.

const { Notice } = require('obsidian');
const { OrganizerView, VIEW_TYPE } = require('./view');
const { OrganizerSettingTab, DEFAULT_SETTINGS } = require('./settings');
const { undoMoves } = require('./executor');

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
    // миграция: раньше было одно свойство
    if (!Array.isArray(data.dateProperties)) {
      this.settings.dateProperties = data.dateProperty ? [data.dateProperty] : DEFAULT_SETTINGS.dateProperties.slice();
    }
    delete this.settings.dateProperty;
  },

  async saveSettings() {
    await this.saveData(this.settings);
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
    const r = await undoMoves(this.app, h.moves);
    this.settings.history = null;
    await this.saveSettings();
    new Notice(`Отменено: возвращено ${r.restored}, пропущено ${r.skipped}`);
    return r;
  },
};
