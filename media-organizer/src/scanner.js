// Сбор медиафайлов из выбранных папок и их родительских заметок (Obsidian API).

const { normFolder, inFolder } = require('./utils');

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
      dateRaw: readProperty(fm, settings.dateProperty),
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
        path: n.path, basename: n.basename, ctime: n.ctime, dateRaw: n.dateRaw,
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

module.exports = { collectEntries, extensionSet };
