/**
 * Demo data: boş branchId -> varsayılan şube; kullanici_paneli/surucu_paneli -> atanmış araç ile uyum.
 * Çalıştır: node scripts/hydrate-demo-data-branches.js
 */
const fs = require('fs');
const path = require('path');
const dataPath = path.join(__dirname, '..', 'data', 'data.json');

const raw = fs.readFileSync(dataPath, 'utf8');
const data = JSON.parse(raw);

const branches = data.branches || [];
const defaultBranch = branches.find((b) => String(b.name || '').toLowerCase().includes('medisa')) || branches[0];
const DEFAULT_BRANCH_ID = defaultBranch ? String(defaultBranch.id) : '1769175251066';

let emptyBranch = 0;
for (const v of data.tasitlar || []) {
  if (!String(v.branchId ?? '').trim()) {
    v.branchId = DEFAULT_BRANCH_ID;
    emptyBranch++;
  }
}

for (const u of data.users || []) {
  const has = (data.tasitlar || []).some(
    (t) => String(t.assignedUserId ?? '') === String(u.id ?? '')
  );
  u.kullanici_paneli = has;
  u.surucu_paneli = has;
}

fs.writeFileSync(dataPath, JSON.stringify(data, null, 4) + '\n', 'utf8');
console.log('hydrate-demo-data-branches:', emptyBranch, 'araç branchId dolduruldu; kullanıcı panel bayrakları güncellendi.');
