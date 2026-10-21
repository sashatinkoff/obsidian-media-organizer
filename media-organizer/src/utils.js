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

module.exports = { normFolder, inFolder, joinPath, dirOf, escapeRegExp };
