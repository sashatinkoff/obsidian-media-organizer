// Необязательный инструмент для разработчиков: собирает src/*.js в один готовый main.js.
// Пользователю плагина запускать его не нужно — собранный main.js уже лежит в корне плагина.
// Запуск: node tools/build.js
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const srcDir = path.join(root, 'src');
const version = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8')).version;
const files = fs.readdirSync(srcDir).filter((f) => f.endsWith('.js')).sort();

let out = `'use strict';
// Media Organizer ${version} — готовый файл плагина, собран из src/ (tools/build.js). Вручную не правьте.
const obsidian = require('obsidian');
const __modules = {
`;
for (const f of files) {
  const code = fs.readFileSync(path.join(srcDir, f), 'utf8').replace(/require\(['"]\.\/([\w-]+)(?:\.js)?['"]\)/g, '__load("$1.js")');
  out += `${JSON.stringify(f)}: function (module, exports, require) {\n${code}\n},\n`;
}
out += `};
const __cache = {};
function __load(name) {
  if (__cache[name]) return __cache[name].exports;
  const mod = (__cache[name] = { exports: {} });
  __modules[name](mod, mod.exports, require);
  return mod.exports;
}

module.exports = class MediaOrganizerPlugin extends obsidian.Plugin {
  async onload() {
    console.info('[Media Organizer] загружен, версия ${version}, модулей: ${files.length}');
    Object.assign(this, __load('main.js'));
    await this.start();
  }

  onunload() {
    if (this.stop) this.stop();
  }
};
`;
fs.writeFileSync(path.join(root, 'main.js'), out);
console.log(`main.js ${version}: собрано модулей ${files.length}`);
