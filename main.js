// Media Organizer — загрузчик. Вся логика лежит в папке src/ и подключается при старте.
// Сборка не нужна: достаточно скопировать папку плагина целиком.
const obsidian = require('obsidian');

module.exports = class MediaOrganizerPlugin extends obsidian.Plugin {
  async onload() {
    const adapter = this.app.vault.adapter;
    const srcDir = this.manifest.dir + '/src';
    const listing = await adapter.list(srcDir);
    const sources = {};
    for (const file of listing.files) {
      if (file.endsWith('.js')) sources[file.split('/').pop()] = await adapter.read(file);
    }

    const cache = {};
    const load = (name) => {
      if (cache[name]) return cache[name].exports;
      if (!sources[name]) throw new Error('Media Organizer: нет модуля src/' + name);
      const mod = (cache[name] = { exports: {} });
      const req = (id) => {
        if (id.startsWith('./')) return load(id.slice(2).endsWith('.js') ? id.slice(2) : id.slice(2) + '.js');
        return require(id);
      };
      new Function('module', 'exports', 'require', sources[name] + '\n//# sourceURL=media-organizer/' + name)(mod, mod.exports, req);
      return mod.exports;
    };

    Object.assign(this, load('main.js'));
    await this.start();
  }

  onunload() {
    if (this.stop) this.stop();
  }
};
