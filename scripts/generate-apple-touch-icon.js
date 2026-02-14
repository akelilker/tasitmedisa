#!/usr/bin/env node
/**
 * icon/apple-touch-icon.svg dosyasından 180x180 icon/apple-touch-icon.png üretir.
 * Kullanım: npm install sharp (bir kez), sonra node scripts/generate-apple-touch-icon.js
 */

const path = require('path');
const fs = require('fs');

let sharp;
try {
  sharp = require('sharp');
} catch (e) {
  console.error('sharp gerekli. Çalıştır: npm install sharp');
  process.exit(1);
}

const root = path.join(__dirname, '..');
const src = path.join(root, 'icon', 'apple-touch-icon.svg');
const out = path.join(root, 'icon', 'apple-touch-icon.png');

if (!fs.existsSync(src)) {
  console.error('Bulunamadı:', src);
  process.exit(1);
}

sharp(src)
  .resize(180, 180)
  .png()
  .toFile(out)
  .then(() => console.log('Yazıldı:', out))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
