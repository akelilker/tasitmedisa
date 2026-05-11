/**
 * data (10).json — bozuk ilk taşıt (events yarım): tasitlar dizisindeki ilk objeyi,
 * ikinci araç (1778536692500) başlamadan önce keserek çıkarır.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const src = path.join(process.env.USERPROFILE || '', 'Downloads', 'data (10).json');
const dst = path.join(root, 'data', 'data-recovered-data10.json');

if (!fs.existsSync(src)) {
  console.error('Kaynak bulunamadı:', src);
  process.exit(1);
}

let raw = fs.readFileSync(src, 'utf8');

const anchor = '\n        {\n            "id": "1778536692500"';
const iAnchor = raw.indexOf(anchor);
if (iAnchor === -1) {
  console.error('İkinci araç tamponu bulunamadı.');
  process.exit(1);
}

const tasitlarKey = '"tasitlar"';
const iT = raw.indexOf(tasitlarKey);
if (iT === -1) {
  console.error('tasitlar anahtarı yok.');
  process.exit(1);
}
const iBracket = raw.indexOf('[', iT);
if (iBracket === -1) {
  console.error('tasitlar [ yok.');
  process.exit(1);
}
let firstBrace = raw.indexOf('{', iBracket + 1);
if (firstBrace === -1 || firstBrace >= iAnchor) {
  console.error('İlk araç { bulunamadı veya sıra hatalı.');
  process.exit(1);
}

raw = raw.slice(0, firstBrace) + raw.slice(iAnchor);
JSON.parse(raw);
fs.mkdirSync(path.dirname(dst), { recursive: true });
fs.writeFileSync(dst, raw, 'utf8');
console.log('Tamam:', dst);
console.log('Boyut:', Buffer.byteLength(raw, 'utf8'), 'bayt');
