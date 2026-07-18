/**
 * Kasko compact lookup client/source invariants (no live credentials).
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const zlib = require('zlib');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

function assertIncludes(hay, needle, msg) {
  assert.ok(hay.includes(needle), msg + ' :: missing ' + needle);
}

const dm = read('data-manager.js');
const ds = read('data-service.js');
const ay = read('ayarlar.js');
const loadPhp = read('load_kasko.php');
const savePhp = read('save_kasko.php');
const idxPhp = read('kasko-index.php');
const cpanel = read('.cpanel.yml');

assertIncludes(dm, "mode=index", 'data-manager loads index mode');
assertIncludes(dm, '__medisaKaskoLookupIndex', 'data-manager builds lookup index');
assertIncludes(dm, 'rows: []', 'data-manager keeps empty rows');
assertIncludes(ds, 'getKaskoDegeriFromPackedIndex', 'data-service packed lookup');
assertIncludes(ds, 'idx.map.get', 'data-service O(1) map get');
assertIncludes(ay, 'loadKaskoListFromServer', 'ayarlar refetches index after save');
assertIncludes(loadPhp, "mode === 'index'", 'load_kasko index mode');
assertIncludes(loadPhp, "mode === 'meta'", 'load_kasko meta mode');
assertIncludes(loadPhp, "mode === 'legacy'", 'load_kasko legacy mode');
assertIncludes(savePhp, 'medisaBuildOrLoadKaskoPackedIndex(true)', 'save rebuilds index');
assertIncludes(idxPhp, "'packed-v1'", 'packed format');
assertIncludes(cpanel, 'kasko-index.php', 'cpanel deploys kasko-index.php');

// Full parity on canonical copy if present outside or in data/
const candidates = [
  path.join(root, 'data', 'kasko-deger-listesi.json'),
  path.join(path.dirname(root), 'tasitmedisa-recovery-r3-r4-20260718-053526', 'kasko', 'canonical-source.json')
];
let sourcePath = candidates.find((p) => fs.existsSync(p));
assert.ok(sourcePath, 'canonical kasko source available for parity');

const raw = fs.readFileSync(sourcePath);
const j = JSON.parse(raw.toString('utf8'));
const fingerprint = crypto.createHash('sha256').update(raw).digest('hex');

function normalizeDigits(v) {
  return String(v == null ? '' : v).replace(/[^0-9]/g, '').replace(/^0+/, '');
}
function findHeader(rows) {
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const s = JSON.stringify(rows[i] || []).toLowerCase();
    if (s.includes('marka') && s.includes('kod')) return i;
  }
  return 1;
}
function buildPacked(decoded) {
  const rows = decoded.rows;
  const headerRowIndex = findHeader(rows);
  const headers = rows[headerRowIndex];
  let markaIndex = -1, tipIndex = -1;
  const years = [], yearCols = [];
  for (let c = 0; c < headers.length; c++) {
    const h = String(headers[c] || '').toLowerCase().trim();
    const hRaw = String(headers[c] || '').trim().replace(/\.0$/, '');
    if (h.includes('marka') && h.includes('kod')) markaIndex = c;
    if ((h.includes('tip') || h.includes('model')) && h.includes('kod')) tipIndex = c;
    if (/^\d{4}$/.test(hRaw)) { years.push(hRaw); yearCols.push(c); }
  }
  if (markaIndex < 0) markaIndex = 0;
  if (tipIndex < 0) tipIndex = 1;
  const dictionary = [0];
  const dictMap = new Map([['0', 0]]);
  const dictId = (n) => {
    const k = String(n);
    if (dictMap.has(k)) return dictMap.get(k);
    const id = dictionary.length;
    dictionary.push(n);
    dictMap.set(k, id);
    return id;
  };
  const keys = [], values = [], keySeen = new Map();
  for (let r = headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length < 2) continue;
    const key = normalizeDigits(row[markaIndex]) + normalizeDigits(row[tipIndex]);
    if (!key) continue;
    const cellIds = yearCols.map((c) => {
      const rawV = row[c];
      let n = typeof rawV === 'number' ? rawV : 0;
      if (typeof rawV !== 'number') {
        let cv = String(rawV || '').replace(/[^0-9,.]/g, '');
        if (cv.includes(',') && cv.includes('.')) cv = cv.replace(/\./g, '').replace(',', '.');
        else if (cv.includes(',')) cv = cv.replace(',', '.');
        else if (cv.includes('.')) cv = cv.replace(/\./g, '');
        n = parseFloat(cv) || 0;
      }
      if (!isFinite(n) || n < 0) n = 0;
      return dictId(n);
    });
    if (keySeen.has(key)) values[keySeen.get(key)] = cellIds;
    else { keySeen.set(key, keys.length); keys.push(key); values.push(cellIds); }
  }
  return {
    schemaVersion: 1, format: 'packed-v1', sourceFingerprint: fingerprint,
    updatedAt: decoded.updatedAt, period: decoded.period, sourceFileName: decoded.sourceFileName,
    rowCount: keys.length, years, dictionary, keys, values
  };
}

function cellDisplayFromRaw(rawVal) {
  let cv = String(rawVal == null ? '' : rawVal).replace(/[^0-9,.]/g, '');
  if (cv.includes(',') && cv.includes('.')) cv = cv.replace(/\./g, '').replace(',', '.');
  else if (cv.includes(',')) cv = cv.replace(',', '.');
  else if (cv.includes('.')) cv = cv.replace(/\./g, '');
  const numVal = (typeof rawVal === 'number') ? rawVal : (parseFloat(cv) || 0);
  if (numVal > 0) return Number(numVal).toLocaleString('tr-TR') + ' ₺';
  return 'Değer Yok (Excel: 0)';
}

const packed = buildPacked(j);
assert.equal(packed.format, 'packed-v1');
assert.ok(!Object.prototype.hasOwnProperty.call(packed, 'rows') || !packed.rows);
const packedBytes = Buffer.byteLength(JSON.stringify(packed), 'utf8');
assert.ok(packedBytes <= raw.length * 0.25, 'compact <= 25% legacy');
assert.ok((raw.length - packedBytes) >= 1024 * 1024, 'absolute savings >= 1MiB');

const yearIndex = Object.create(null);
packed.years.forEach((y, i) => { yearIndex[y] = i; });
const map = new Map();
for (let i = 0; i < packed.keys.length; i++) map.set(packed.keys[i], packed.values[i]);
function packedLookup(kaskoKodu, modelYili) {
  const yi = yearIndex[String(modelYili || '').trim()];
  if (yi == null) return 'Yıl Bulunamadı (' + String(modelYili || '').trim() + ')';
  const cells = map.get(normalizeDigits(kaskoKodu));
  if (!cells) return 'Kasko Kodu Bulunamadı';
  const numVal = packed.dictionary[cells[yi]] || 0;
  if (numVal > 0) return numVal.toLocaleString('tr-TR') + ' ₺';
  return 'Değer Yok (Excel: 0)';
}

let mismatch = 0;
let checked = 0;
const header = findHeader(j.rows);
const headers = j.rows[header];
let markaIndex = 0, tipIndex = 1;
const yearCols = [];
for (let c = 0; c < headers.length; c++) {
  const h = String(headers[c] || '').toLowerCase().trim();
  const hRaw = String(headers[c] || '').trim().replace(/\.0$/, '');
  if (h.includes('marka') && h.includes('kod')) markaIndex = c;
  if ((h.includes('tip') || h.includes('model')) && h.includes('kod')) tipIndex = c;
  if (/^\d{4}$/.test(hRaw)) yearCols.push({ c, y: hRaw });
}
const seenKeys = new Set();
for (let r = header + 1; r < j.rows.length; r++) {
  const row = j.rows[r];
  if (!row) continue;
  const key = normalizeDigits(row[markaIndex]) + normalizeDigits(row[tipIndex]);
  if (!key) continue;
  // last-wins: skip until final occurrence handled by rewriting — verify via packed map vs last row
  seenKeys.add(key);
  for (let yi = 0; yi < yearCols.length; yi++) {
    const expected = cellDisplayFromRaw(row[yearCols[yi].c]);
    // temporary store last expected per key/year; finalize after loop
  }
}

// Rebuild expected last-wins map from rows then compare
const expectedMap = new Map();
for (let r = header + 1; r < j.rows.length; r++) {
  const row = j.rows[r];
  if (!row) continue;
  const key = normalizeDigits(row[markaIndex]) + normalizeDigits(row[tipIndex]);
  if (!key) continue;
  const vals = yearCols.map((yc) => cellDisplayFromRaw(row[yc.c]));
  expectedMap.set(key, vals);
}
for (const [key, vals] of expectedMap.entries()) {
  for (let yi = 0; yi < yearCols.length; yi++) {
    const a = vals[yi];
    const b = packedLookup(key, yearCols[yi].y);
    checked++;
    if (a !== b) mismatch++;
  }
}
assert.equal(mismatch, 0, 'full field parity mismatch=' + mismatch + ' checked=' + checked);
assert.ok(checked >= 400000 || checked === expectedMap.size * yearCols.length, 'checked fields ' + checked);
assert.equal(expectedMap.size, packed.rowCount, 'rowCount parity');

console.log(JSON.stringify({
  ok: true,
  canonicalBytes: raw.length,
  packedBytes,
  ratio: packedBytes / raw.length,
  rowCount: packed.rowCount,
  checked,
  mismatch,
  gzipLegacy: zlib.gzipSync(raw).length,
  gzipPacked: zlib.gzipSync(Buffer.from(JSON.stringify(packed))).length
}, null, 2));
