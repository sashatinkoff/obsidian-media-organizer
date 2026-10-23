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
