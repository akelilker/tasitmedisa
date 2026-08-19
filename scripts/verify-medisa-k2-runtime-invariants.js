const fs = require('fs');
const assert = require('assert');
const vm = require('vm');

const notifications = fs.readFileSync('notifications.js', 'utf8');
const driver = fs.readFileSync('driver/driver_data.php', 'utf8');
const ayarlar = fs.readFileSync('ayarlar.js', 'utf8');
const ayarlarCss = fs.readFileSync('ayarlar.css', 'utf8');

assert.match(notifications, /getK2BelgeGroups\(\)\.forEach/);
assert.match(notifications, /k2GroupId/);
assert.match(notifications, /branchIds: Array\.isArray\(group\.branchIds\)/);
assert.match(notifications, /task\.branchIds\.map\(String\)\.indexOf/);
assert.match(notifications, /settings-k2/);
assert.match(driver, /medisaNormalizeK2BelgeGruplari/);
assert.match(driver, /array_map\('strval',\s*\$candidate\['branchIds'\]/);
assert.doesNotMatch(driver, /\$data\['ayarlar'\]\['k2Belgesi'\]/);
assert.match(ayarlar, /required-documents-branch-list-view/);
assert.match(ayarlar, /settings-card-content/);
assert.match(ayarlar, /aria-label="Şubeler" onclick="backToZorunluEvrakBranchList\(event\)"/);
assert.doesNotMatch(ayarlar, /select.*VKN|vergiNo/i);
assert.match(ayarlar, /window\.open\('about:blank', '_blank'\)/);
assert.match(ayarlar, /blankTab\.location\.href = targetUrl/);
assert.match(ayarlar, /window\.location\.href = targetUrl/);
assert.doesNotMatch(ayarlar, /window\.open\('about:blank', '_blank'\).*noopener|window\.open\('about:blank', '_blank'\).*noreferrer/);
assert.equal((ayarlar.match(/window\.open\('about:blank', '_blank'\)/g) || []).length, 1);
assert.match(ayarlar, /required-k2-members-backdrop/);
assert.match(ayarlarCss, /required-k2-members-select\.is-open \.required-k2-members-backdrop[\s\S]*pointer-events:\s*auto/);
assert.match(ayarlarCss, /required-k2-members-backdrop[\s\S]*pointer-events:\s*none/);
assert.match(ayarlarCss, /required-k2-members-trigger[\s\S]*z-index:\s*1/);
assert.match(ayarlarCss, /required-k2-members-summary[\s\S]*width:\s*100%[\s\S]*text-align:\s*center/);
assert.match(ayarlarCss, /required-k2-members-chevron[\s\S]*position:\s*absolute[\s\S]*right:\s*8px/);
assert.match(ayarlarCss, /required-k2-members-title[\s\S]*color:\s*var\(--back-label-color\)/);

const group = { id: 'g1', branchIds: ['a', 'b'], expiryDate: '2027-05-17' };
const tasks = [group].map((item) => ({
  k2GroupId: item.id,
  branchIds: item.branchIds.slice(),
  date: item.expiryDate,
}));
assert.equal(tasks.length, 1);
assert.equal(tasks[0].k2GroupId, 'g1');
assert.equal(tasks.filter((task) => task.branchIds.includes('a')).length, 1);
assert.equal(tasks.filter((task) => task.branchIds.includes('b')).length, 1);
assert.equal(tasks.filter((task) => task.branchIds.includes('c')).length, 0);
assert.notEqual('date|settings-k2|g1|2027-05-17', 'date|settings-k2|g2|2027-05-17');

const k2Start = ayarlar.indexOf('let selectedZorunluEvrakBranchId');
const k2End = ayarlar.indexOf('function formatZorunluEvrakDate', k2Start);
assert.ok(k2Start !== -1 && k2End > k2Start, 'K2 required documents helper bloğu bulunmalı');
const k2Helpers = ayarlar.slice(k2Start, k2End);

function createK2RequiredDocumentsContext(session, visibleBranches) {
  const branchListHost = { innerHTML: '' };
  const membersHost = {
    innerHTML: '',
    dataset: {},
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {}
  };
  const sandbox = {
    window: {
      appData: {
        branches: [{ id: 'app-data-only', name: 'Yanlış owner' }],
        ayarlar: { k2BelgeGruplari: [{ id: 'g1', branchIds: ['A'], expiryDate: '2027-05-17' }] }
      },
      medisaSession: session,
      getMedisaBranches: () => visibleBranches
    },
    document: {
      getElementById: (id) => id === 'required-documents-branch-list'
        ? branchListHost
        : id === 'required-k2-group-members' ? membersHost : null,
      querySelectorAll: () => []
    },
    escapeHtml: (value) => String(value),
    readBranches: () => visibleBranches
  };
  vm.createContext(sandbox);
  vm.runInContext(`
    function readBranches() {
      var result = window.getMedisaBranches();
      return Array.isArray(result) ? result.slice() : [];
    }
    ${k2Helpers}
    this.__k2 = {
      getVisible: getVisibleRequiredDocumentBranches,
      renderBranches: renderRequiredDocumentBranchList,
      renderMembers: renderRequiredDocumentGroupMembers,
      selectBranch: function(id) { selectedZorunluEvrakBranchId = id; }
    };
  `, sandbox);
  return { sandbox, branchListHost, membersHost };
}

const gmContext = createK2RequiredDocumentsContext(
  { authenticated: true, role: 'genel_yonetici', branch_ids: [] },
  [{ id: 'A', name: 'Şube A' }, { id: 'B', name: 'Şube B' }, { id: 'C', name: 'Şube C' }]
);
assert.deepEqual(
  gmContext.sandbox.__k2.getVisible().map((branch) => branch.id),
  ['A', 'B', 'C']
);
gmContext.sandbox.__k2.renderBranches();
assert.match(gmContext.branchListHost.innerHTML, /Şube<br>A/);
assert.match(gmContext.branchListHost.innerHTML, /Şube<br>B/);
assert.match(gmContext.branchListHost.innerHTML, /Şube<br>C/);
gmContext.sandbox.__k2.selectBranch('A');
gmContext.sandbox.__k2.renderMembers();
assert.match(gmContext.membersHost.innerHTML, /Belge, Başka Şubeler İçin de Geçerliyse Seçiniz\./);
assert.match(gmContext.membersHost.innerHTML, /required-k2-members-trigger/);
assert.match(gmContext.membersHost.innerHTML, /required-k2-members-menu/);
assert.doesNotMatch(gmContext.membersHost.innerHTML, /Şube A/);

const bmContext = createK2RequiredDocumentsContext(
  { authenticated: true, role: 'sube_yonetici', branch_ids: ['A'] },
  [{ id: 'A', name: 'Şube A' }]
);
assert.deepEqual(bmContext.sandbox.__k2.getVisible().map((branch) => branch.id), ['A']);
bmContext.sandbox.__k2.renderBranches();
assert.match(bmContext.branchListHost.innerHTML, /Şube<br>A/);
bmContext.sandbox.__k2.selectBranch('A');
bmContext.sandbox.__k2.renderMembers();
assert.equal(bmContext.membersHost.innerHTML, '');

assert.doesNotMatch(ayarlar, /window\.appData\s*&&\s*window\.appData\.session/);
assert.match(ayarlar, /const session = getZorunluEvrakSession\(\);[\s\S]*?mutationPayload\.branchIds = memberIds/);
assert.match(ayarlar, /const session = getZorunluEvrakSession\(\);[\s\S]*?const isGM = String\(session\.role/);
assert.match(ayarlar, /settings-empty-state.*Görüntülenecek şube bulunamadı/);

console.log('PASS: K2 notification, monthly filter and driver/UI scope invariants');
