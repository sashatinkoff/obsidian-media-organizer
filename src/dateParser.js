// Разбор даты из свойства заметки в "любом" формате.
// Для папок нужен только ГОД, поэтому неоднозначность важна лишь там,
// где разные трактовки дают разный год (например 05.06.07).
// Результат:
//   {kind:'ok', year, text}
//   {kind:'ambiguous', pattern, candidates:[{year,label}], raw}
//   {kind:'unparsed', raw}
//   {kind:'empty'}

const MONTHS = {
  янв: 1, фев: 2, мар: 3, апр: 4, мая: 5, май: 5, июн: 6, июл: 7, авг: 8, сен: 9, окт: 10, ноя: 11, дек: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};
const WORD = '[A-Za-zА-Яа-яЁё]{3,}';
const MIN_YEAR = 1900;
const MAX_YEAR = 2100;

function monthFromName(token) {
  return MONTHS[token.toLowerCase().slice(0, 3)] || 0;
}

function validYear(y) {
  return y >= MIN_YEAR && y <= MAX_YEAR;
}

function fmt(y, m, d) {
  const p = (n) => String(n).padStart(2, '0');
  return m ? (d ? `${y}-${p(m)}-${p(d)}` : `${y}-${p(m)}`) : String(y);
}

function ok(y, m, d) {
  return validYear(y) ? { kind: 'ok', year: y, text: fmt(y, m, d) } : null;
}

function expandYear(yy, nowYear) {
  const n = 2000 + yy;
  return n > nowYear + 1 ? 1900 + yy : n;
}

function fromTimestamp(n) {
  const ms = n > 1e11 ? n : n * 1000;
  const d = new Date(ms);
  return isNaN(d) ? null : ok(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

function parseDate(value, nowYear = new Date().getFullYear()) {
  if (Array.isArray(value)) value = value[0];
  if (value === null || value === undefined) return { kind: 'empty' };
  if (value instanceof Date) {
    return ok(value.getFullYear(), value.getMonth() + 1, value.getDate()) || { kind: 'unparsed', raw: String(value) };
  }
  if (typeof value === 'number') {
    if (value >= MIN_YEAR && value <= MAX_YEAR) return ok(value);
    return fromTimestamp(value) || { kind: 'unparsed', raw: String(value) };
  }

  const raw = String(value).trim();
  if (!raw) return { kind: 'empty' };
  const s = raw.replace(/^\[\[|\]\]$/g, '').replace(/^["']|["']$/g, '').trim();
  const unparsed = { kind: 'unparsed', raw };
  let m;

  // 2024-05-01, 2024.05.01, 2024/5/1, 2024-05-01T10:00:00Z (берём дату как написана, без часовых поясов)
  if ((m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})(?!\d)/))) {
    return ok(+m[1], +m[2], +m[3]) || unparsed;
  }
  // 20240501 или 20240501_123000
  if ((m = s.match(/^(\d{4})(\d{2})(\d{2})(?!\d)/)) && +m[2] >= 1 && +m[2] <= 12 && +m[3] >= 1 && +m[3] <= 31) {
    return ok(+m[1], +m[2], +m[3]) || unparsed;
  }
  if ((m = s.match(/^(\d{4})[-./](\d{1,2})$/))) return ok(+m[1], +m[2]) || unparsed;
  if ((m = s.match(/^(\d{4})$/))) return ok(+m[1]) || unparsed;
  if ((m = s.match(/^(\d{10}|\d{13})$/))) return fromTimestamp(+m[1]) || unparsed;

  // 21.10.2026, 10/21/2026, 21-10-26 ...
  if ((m = s.match(/^(\d{1,2})([-./\s])(\d{1,2})\2(\d{2}|\d{4})(?!\d)/))) {
    const a = +m[1], b = +m[3];
    if (m[4].length === 4) return ok(+m[4]) || unparsed;
    const c = +m[4];
    const dmy = (a <= 31 && b >= 1 && b <= 12) || (b <= 31 && a >= 1 && a <= 12);
    const ymd = b >= 1 && b <= 12 && c >= 1 && c <= 31 && m[1].length === 2 && (a > 31 || 2000 + a <= nowYear + 1);
    const yLast = expandYear(c, nowYear);
    const yFirst = expandYear(a, nowYear);
    if (dmy && ymd && yLast !== yFirst) {
      return {
        kind: 'ambiguous',
        raw,
        pattern: m[0].replace(/\d/g, 'N'),
        candidates: [
          { year: yLast, label: `год в конце (ДД${m[2]}ММ${m[2]}ГГ) → ${yLast}` },
          { year: yFirst, label: `год в начале (ГГ${m[2]}ММ${m[2]}ДД) → ${yFirst}` },
        ],
      };
    }
    if (dmy) return ok(yLast) || unparsed;
    if (ymd) return ok(yFirst) || unparsed;
    return unparsed;
  }

  // 21 октября 2026 / 21 Oct 2026
  let re = new RegExp(`(\\d{1,2})(?:-?(?:го|е))?\\s+(${WORD})\\.?,?\\s+(\\d{4})`);
  if ((m = s.match(re)) && monthFromName(m[2])) return ok(+m[3], monthFromName(m[2]), +m[1]) || unparsed;
  // October 21, 2026
  re = new RegExp(`(${WORD})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})`);
  if ((m = s.match(re)) && monthFromName(m[1])) return ok(+m[3], monthFromName(m[1]), +m[2]) || unparsed;
  // октябрь 2026
  re = new RegExp(`(${WORD})\\.?\\s+(\\d{4})`);
  if ((m = s.match(re)) && monthFromName(m[1])) return ok(+m[2], monthFromName(m[1])) || unparsed;

  // Последняя надежда: нативный разбор
  const t = Date.parse(s);
  if (!isNaN(t)) {
    const d = new Date(t);
    return ok(d.getFullYear(), d.getMonth() + 1, d.getDate()) || unparsed;
  }
  return unparsed;
}

module.exports = { parseDate };
