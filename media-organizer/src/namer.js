// Формирование имён файлов: "гремучая смесь" -> "гремучая_смесь_001.jpg".

function sanitizeBase(name, opts) {
  let s = String(name || '')
    .normalize('NFC')
    .replace(/[\\/:*?"<>|#^\[\]]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_.]+|[_.]+$/g, '');
  if (opts && opts.lowercase) s = s.toLowerCase();
  if (s.length > 120) s = s.slice(0, 120).replace(/_+$/, '');
  return s || 'media';
}

function indexedName(base, index, pad, ext) {
  return base + '_' + String(index).padStart(pad, '0') + '.' + ext;
}

module.exports = { sanitizeBase, indexedName };
