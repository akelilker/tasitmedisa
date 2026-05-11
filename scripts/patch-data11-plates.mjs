/**
 * data (11).json: 78 AAV 277 & 78 ABC 862 → vehicleType romork; 12ABC456 kaydını sil + bildirim anahtarları temizliği.
 */
import fs from 'fs';
import path from 'path';

const src = path.join(process.env.USERPROFILE || '', 'Downloads', 'data (11).json');
const REMOVE_ID = '1778536692500';
const ROMORK_PLATES = new Set(['78 AAV 277', '78 ABC 862']);

if (!fs.existsSync(src)) {
  console.error('Dosya yok:', src);
  process.exit(1);
}

const raw = fs.readFileSync(src, 'utf8');
const data = JSON.parse(raw);

if (!Array.isArray(data.tasitlar)) {
  console.error('tasitlar dizisi yok');
  process.exit(1);
}

let removed = 0;
let romorkSet = 0;
data.tasitlar = data.tasitlar.filter((v) => {
  const id = v && v.id != null ? String(v.id) : '';
  const plate = v && v.plate != null ? String(v.plate).trim() : '';
  if (id === REMOVE_ID || plate === '12ABC456') {
    removed++;
    return false;
  }
  if (plate && ROMORK_PLATES.has(plate)) {
    if (v.vehicleType !== 'romork') {
      v.vehicleType = 'romork';
      if (typeof v.version === 'number') v.version += 1;
      romorkSet++;
    }
  }
  return true;
});

function stripNotificationRefs(nr, needle) {
  if (!nr || typeof nr !== 'object') return;
  for (const bucketKey of Object.keys(nr)) {
    const bucket = nr[bucketKey];
    if (!bucket || typeof bucket !== 'object') continue;
    for (const sub of ['firstSeenDates', 'readKeys', 'dismissedKeys']) {
      const col = bucket[sub];
      if (!col || typeof col !== 'object') continue;
      if (Array.isArray(col)) {
        bucket[sub] = col.filter((x) => typeof x !== 'string' || !x.includes(needle));
      } else {
        for (const k of Object.keys(col)) {
          if (k.includes(needle)) delete col[k];
        }
      }
    }
  }
}

if (data.notificationReadState && typeof data.notificationReadState === 'object') {
  stripNotificationRefs(data.notificationReadState, REMOVE_ID);
}

const out = JSON.stringify(data, null, 4) + '\n';
fs.writeFileSync(src, out, 'utf8');

console.log('Tamam:', src);
console.log('Silinen kayıt (12ABC456):', removed);
console.log('Römork yapılan plaka:', romorkSet, [...ROMORK_PLATES].join(', '));
