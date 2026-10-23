// Построение плана уборки. Чистая логика без Obsidian API — легко тестировать.
// entries: [{path, basename, name, ext, root, parents:[{path, basename, order, ctime, dateRaw}]}]
// choices: ответы пользователя по неоднозначным датам
//   'amb:<шаблон>' -> 0 | 1 | 'skip'     'unparsed' -> 'ctime' | 'skip'
// exists(path) -> bool: занят ли путь в хранилище.

const { parseDate } = require('./dateParser');
const { sanitizeBase, indexedName } = require('./namer');
const { joinPath, dirOf, escapeRegExp } = require('./utils');

function addPending(map, id, type, sample, extra) {
  let g = map.get(id);
  if (!g) {
    g = Object.assign({ id, type, samples: new Set(), count: 0 }, extra);
    map.set(id, g);
  }
  g.samples.add(sample);
  g.count++;
}

function fallbackDate(parent, settings) {
  if (!settings.fallbackToCtime) return { status: 'nodate', reason: 'В заметке нет даты' };
  return { year: new Date(parent.ctime).getFullYear(), source: 'ctime' };
}

function resolveDate(parent, settings, choices, pending) {
  // пробуем свойства по приоритету: первое, которое удалось прочитать, побеждает
  const raws = parent.dateRaws || (parent.dateRaw !== undefined ? [parent.dateRaw] : []);
  let r = { kind: 'empty' };
  for (const raw of raws) {
    const cur = parseDate(raw);
    if (cur.kind === 'ok') return { year: cur.year, source: 'property' };
    if (r.kind === 'empty' && cur.kind !== 'empty') r = cur;
  }
  if (r.kind === 'empty') return fallbackDate(parent, settings);

  if (r.kind === 'ambiguous') {
    const id = 'amb:' + r.pattern;
    const c = choices[id];
    if (c === undefined) {
      addPending(pending, id, 'ambiguous', r.raw, { pattern: r.pattern, candidates: r.candidates });
      return { status: 'pending', reason: 'Нужен выбор формата даты' };
    }
    if (c === 'skip') return { status: 'nodate', reason: 'Дата пропущена по выбору' };
    return { year: r.candidates[c].year, source: 'property' };
  }

  const c = choices.unparsed;
  if (c === undefined) {
    addPending(pending, 'unparsed', 'unparsed', r.raw, {});
    return { status: 'pending', reason: 'Не удалось распознать дату' };
  }
  if (c === 'ctime') return fallbackDate(parent, { fallbackToCtime: true });
  return { status: 'nodate', reason: 'Дата не распознана' };
}

function buildPlan(entries, settings, choices, exists) {
  choices = choices || {};
  const pending = new Map();
  const items = [];
  const groups = new Map();

  for (const e of entries) {
    const item = {
      id: e.path, oldPath: e.path, newPath: e.path, name: e.name, ext: e.ext,
      status: 'ready', reason: '', year: null, parent: null, parentName: '',
      dateSource: null, selected: false,
    };
    items.push(item);

    if (!e.parents.length) {
      item.status = 'orphan';
      item.reason = 'Файл не вставлен ни в одну заметку (см. вкладку «Без ссылок»)';
      continue;
    }
    const sorted = e.parents.slice().sort((a, b) => a.ctime - b.ctime || a.path.localeCompare(b.path));
    // если файл вставлен (![]) в одни заметки и лишь упомянут ссылкой в других — родитель среди вставивших
    const embedded = sorted.filter((p) => p.embedded);
    const parents = embedded.length ? embedded : sorted;
    if (parents.length > 1 && settings.multiParent === 'skip') {
      const names = parents.slice(0, 3).map((p) => p.basename).join(', ');
      item.status = 'conflict';
      item.reason = `Используется в ${parents.length} заметках: ${names}${parents.length > 3 ? '…' : ''}`;
      continue;
    }
    const p = parents[0];
    item.textNotes = e.parents.filter((x) => x.textRef).map((x) => x.path);
    if (item.textNotes.length) item.hint = 'Упоминание в тексте заметки (не вики-ссылка) плагин обновит сам';
    item.parent = p.path;
    item.parentName = p.basename;

    const d = resolveDate(p, settings, choices, pending);
    if (d.status) { item.status = d.status; item.reason = d.reason; continue; }
    item.year = d.year;
    item.dateSource = d.source;

    const dir = joinPath(e.root, String(d.year));
    const key = p.path + '|' + dir;
    if (!groups.has(key)) groups.set(key, { dir, parent: p, members: [] });
    groups.get(key).members.push({ item, entry: e, order: p.order });
  }

  const taken = new Set();
  const pad = settings.indexPad || 3;

  for (const g of groups.values()) {
    const base = sanitizeBase(g.parent.basename, { lowercase: settings.lowercaseNames });
    const re = new RegExp('^' + escapeRegExp(base) + '_(\\d+)$');
    g.members.sort((a, b) => a.order - b.order || a.item.oldPath.localeCompare(b.item.oldPath));

    // 1) файлы, которые уже названы правильно и лежат где надо, остаются на месте
    for (const m of g.members) {
      if (dirOf(m.item.oldPath) === g.dir && re.test(m.entry.basename)) {
        m.item.newPath = m.item.oldPath;
        taken.add(m.item.oldPath.toLowerCase());
        m.done = true;
      }
    }
    // 2) остальным — первый свободный индекс
    let i = 1;
    for (const m of g.members) {
      if (m.done) continue;
      const ext = m.entry.ext.toLowerCase();
      let cand, lc;
      for (;; i++) {
        cand = joinPath(g.dir, indexedName(base, i, pad, ext));
        lc = cand.toLowerCase();
        if (!taken.has(lc) && !exists(cand)) break;
      }
      taken.add(lc);
      m.item.newPath = cand;
      i++;
    }
  }

  for (const it of items) {
    if (it.status !== 'ready') continue;
    if (it.newPath === it.oldPath) it.status = 'inplace';
    else it.selected = true;
  }

  return {
    items,
    pending: [...pending.values()].map((g) => Object.assign({}, g, { samples: [...g.samples].slice(0, 6) })),
  };
}

module.exports = { buildPlan };
