'use strict';

/**
 * Ayarlar → Şube/Kullanıcı formu buton düzeni + istemci silme guard'ı invariantları.
 * Saf guard fonksiyonları ayarlar.js kaynağından çıkarılıp gerçekten çalıştırılır.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const ayarlarJs = read('ayarlar.js');
const styleCore = read('style-core.css');
const ayarlarCss = read('ayarlar.css');

let failures = 0;
let passed = 0;

function run(name, fn) {
  try {
    fn();
    passed++;
  } catch (error) {
    failures++;
    console.error('FAIL: ' + name + ' — ' + (error && error.message ? error.message : error));
  }
}

/** Kaynaktan tek fonksiyonu süslü parantez dengesiyle çıkarır. */
function extractFunction(source, name) {
  const start = source.indexOf('function ' + name + '(');
  assert.ok(start >= 0, name + ' fonksiyonu ayarlar.js içinde bulunamadı');
  let depth = 0;
  let started = false;
  for (let i = start; i < source.length; i++) {
    const char = source[i];
    if (char === '{') {
      depth++;
      started = true;
    } else if (char === '}') {
      depth--;
      if (started && depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(name + ' fonksiyonu kapatılmamış');
}

const guardNames = [
  'normalizeSettingsRelationId',
  'collectUserBranchRelationIds',
  'collectBranchDeleteBlockers',
  'buildBranchDeleteBlockerMessage',
  'collectUserDeleteBlockers',
  'buildUserDeleteBlockerMessage',
  'setSettingsDeleteRowVisible'
];
const guardSource = guardNames.map((name) => extractFunction(ayarlarJs, name)).join('\n');
const guards = new Function(
  'document',
  guardSource + '\nreturn { ' + guardNames.join(', ') + ' };'
);

function makeFakeDom(rowId) {
  const classes = new Set(['settings-form-danger-row', 'u-hidden']);
  const row = {
    id: rowId,
    classList: {
      toggle(name, force) {
        if (force) classes.add(name);
        else classes.delete(name);
      },
      contains: (name) => classes.has(name)
    }
  };
  return {
    row,
    document: { getElementById: (id) => (id === rowId ? row : null) }
  };
}

const api = guards({ getElementById: () => null });

// --- MARKUP: birincil satır Kaydet + Vazgeç, yıkıcı satır ayrı ---
function extractBlock(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start);
  assert.ok(start >= 0 && end > start, 'markup bloğu bulunamadı: ' + startNeedle);
  return source.slice(start, end);
}

const branchActions = extractBlock(ayarlarJs, '<button type="button" class="universal-btn-save" onclick="saveBranch()">', '</form>');
const userActions = extractBlock(ayarlarJs, '<button type="button" class="universal-btn-save" onclick="saveUser()">', '</form>');

run('branch_primary_row_has_save_and_cancel', function () {
  assert.match(branchActions, /universal-btn-cancel" onclick="closeBranchFormModal\(\)">Vazgeç</);
  const groupEnd = branchActions.indexOf('</div>');
  const primaryRow = branchActions.slice(0, groupEnd);
  assert.ok(primaryRow.includes('universal-btn-save'), 'Kaydet birincil satırda olmalı');
  assert.ok(primaryRow.includes('universal-btn-cancel'), 'Vazgeç birincil satırda olmalı');
  assert.ok(!primaryRow.includes('settings-btn-delete'), 'Sil birincil satırda olmamalı');
});

run('user_primary_row_has_save_and_cancel', function () {
  assert.match(userActions, /universal-btn-cancel" onclick="closeUserFormModal\(\)">Vazgeç</);
  const groupEnd = userActions.indexOf('</div>');
  const primaryRow = userActions.slice(0, groupEnd);
  assert.ok(primaryRow.includes('universal-btn-save'), 'Kaydet birincil satırda olmalı');
  assert.ok(primaryRow.includes('universal-btn-cancel'), 'Vazgeç birincil satırda olmalı');
  assert.ok(!primaryRow.includes('settings-btn-delete'), 'Sil birincil satırda olmamalı');
});

run('delete_lives_in_separate_danger_row', function () {
  assert.match(ayarlarJs, /<div class="settings-form-danger-row u-hidden" id="branch-delete-row">\s*<button type="button" class="settings-btn-delete"[^>]*id="branch-delete-btn">Sil<\/button>/);
  assert.match(ayarlarJs, /<div class="settings-form-danger-row u-hidden" id="user-delete-row">\s*<button type="button" class="settings-btn-delete"[^>]*id="user-delete-btn">Sil<\/button>/);
});

run('cancel_only_calls_close_owner', function () {
  const branchCancel = /onclick="closeBranchFormModal\(\)">Vazgeç/;
  const userCancel = /onclick="closeUserFormModal\(\)">Vazgeç/;
  assert.match(ayarlarJs, branchCancel);
  assert.match(ayarlarJs, userCancel);
  assert.ok(!/onclick="[^"]*save(Branch|User)[^"]*"[^>]*>Vazgeç/.test(ayarlarJs), 'Vazgeç save çağırmamalı');
  assert.ok(!/onclick="[^"]*(confirm|persist|delete)[^"]*"[^>]*>Vazgeç/.test(ayarlarJs), 'Vazgeç confirm/persist/delete çağırmamalı');
});

run('cancel_keeps_history_layer_owner', function () {
  const closeBranch = extractBlock(ayarlarJs, 'window.closeBranchFormModal = function closeBranchFormModal', 'window.saveBranch');
  assert.match(closeBranch, /history\.back\(\)/, 'Vazgeç sonrası kart listesine history katmanı ile dönülmeli');
  assert.ok(!/medisaSettingsGoHome/.test(closeBranch), 'Vazgeç ana sayfaya atlamamalı');
});

// --- GÖRÜNÜRLÜK: tek state owner ---
run('single_visibility_state_owner', function () {
  assert.ok(!/deleteBtn\.style\.display/.test(ayarlarJs), 'inline style.display görünürlük sahipliği kalmamalı');
  assert.match(ayarlarJs, /setSettingsDeleteRowVisible\('branch-delete-row', true\)/);
  assert.match(ayarlarJs, /setSettingsDeleteRowVisible\('branch-delete-row', false\)/);
  assert.match(ayarlarJs, /setSettingsDeleteRowVisible\('user-delete-row', !protectGm\)/);
  assert.match(ayarlarJs, /setSettingsDeleteRowVisible\('user-delete-row', false\)/);
});

run('danger_row_toggle_behavior', function () {
  const fake = makeFakeDom('branch-delete-row');
  const scoped = guards(fake.document);
  scoped.setSettingsDeleteRowVisible('branch-delete-row', true);
  assert.equal(fake.row.classList.contains('u-hidden'), false, 'düzenleme modunda Sil görünür olmalı');
  scoped.setSettingsDeleteRowVisible('branch-delete-row', false);
  assert.equal(fake.row.classList.contains('u-hidden'), true, 'yeni kayıt modunda Sil satırı gizli olmalı');
});

run('hidden_danger_row_consumes_no_layout', function () {
  assert.match(
    styleCore,
    /#branch-form-modal \.settings-form-danger-row\.u-hidden,\s*#user-form-modal \.settings-form-danger-row\.u-hidden \{\s*display: none !important;/
  );
});

// --- CSS OWNER ---
run('css_primary_row_two_equal_columns', function () {
  assert.match(
    styleCore,
    /#branch-form-modal \.universal-btn-group,\s*#user-form-modal \.universal-btn-group \{\s*grid-template-columns: 1fr 1fr !important;/
  );
  assert.ok(!/#branch-delete-btn\.u-hidden/.test(styleCore), 'eski :has tabanlı kural kalmamalı');
  assert.ok(!/#branch-delete-btn\.u-hidden/.test(ayarlarCss), 'eski :has tabanlı kural kalmamalı');
  assert.ok(!/#user-delete-btn\[style\*="flex"\]/.test(ayarlarCss), 'inline-style tabanlı kural kalmamalı');
});

run('css_danger_row_centered_and_controlled_width', function () {
  assert.match(
    styleCore,
    /#branch-form-modal \.settings-form-danger-row,\s*#user-form-modal \.settings-form-danger-row \{[\s\S]*?justify-content: center !important;/
  );
  assert.match(
    styleCore,
    /#branch-form-modal \.settings-btn-delete,\s*#user-form-modal \.settings-btn-delete \{[\s\S]*?width: min\(100%, 160px\) !important;/
  );
  assert.match(styleCore, /#branch-form-modal \.settings-btn-delete,[\s\S]*?color: #ff4d4d !important;/);
});

run('css_cancel_is_neutral_inside_settings_forms', function () {
  assert.match(
    styleCore,
    /#branch-form-modal \.universal-btn-cancel,\s*#user-form-modal \.universal-btn-cancel \{\s*color: #a0aec0 !important;/
  );
  assert.match(styleCore, /\.universal-btn-cancel \{\s*color: #d40000 !important;/, 'ayarlar dışı Vazgeç standardı korunmalı');
});

run('css_scope_limited_to_settings_forms', function () {
  assert.ok(!/\.universal-btn-group \.settings-btn-delete/.test(styleCore), 'ayarlar dışı universal buton kapsamı açılmamalı');
  assert.ok(!/!important[^;]*margin: -/.test(styleCore));
});

// --- İSTEMCİ GUARD DAVRANIŞI ---
run('branch_guard_counts_vehicles_users_and_k2', function () {
  const blockers = api.collectBranchDeleteBlockers('b1', {
    vehicles: [{ id: 'v1', branchId: 'b1' }, { id: 'v2', branchId: 'b2' }],
    users: [
      { id: 'u1', branchIds: ['b1'] },
      { id: 'u2', branchId: 'b1' },
      { id: 'u3', sube_ids: ['b1'] },
      { id: 'u4', sube_id: 'b1' },
      { id: 'u5', branchIds: ['b2'] }
    ],
    k2Groups: [{ id: 'k1', branchIds: ['b1', 'b3'] }, { id: 'k2', branchIds: ['b9'] }]
  });
  assert.equal(blockers.vehicleCount, 1);
  assert.equal(blockers.userCount, 4);
  assert.equal(blockers.k2GroupCount, 1);
  assert.equal(blockers.total, 6);
});

run('branch_guard_normalizes_string_number_ids', function () {
  const blockers = api.collectBranchDeleteBlockers(7, {
    vehicles: [{ id: 'v1', branchId: '7' }],
    users: [{ id: 'u1', branchIds: [7] }, { id: 'u2', sube_id: ' 7 ' }],
    k2Groups: [{ id: 'k1', branchIds: [7] }]
  });
  assert.equal(blockers.total, 4, 'string/number farkı korumayı atlatmamalı');
});

run('branch_guard_allows_empty_branch', function () {
  const blockers = api.collectBranchDeleteBlockers('b_empty', {
    vehicles: [{ id: 'v1', branchId: 'b1' }],
    users: [{ id: 'u1', branchIds: ['b1'] }],
    k2Groups: [{ id: 'k1', branchIds: ['b1'] }]
  });
  assert.equal(blockers.total, 0);
});

run('branch_guard_message_lists_only_positive_counts', function () {
  const message = api.buildBranchDeleteBlockerMessage({ vehicleCount: 2, userCount: 0, k2GroupCount: 1, total: 3 });
  assert.ok(message.startsWith('Bu şubeye bağlı kayıtlar bulunduğu için şube silinemez.'));
  assert.ok(message.includes('2 taşıt'));
  assert.ok(message.includes('1 K2 belge grubu'));
  assert.ok(!message.includes('kullanıcı'), 'sıfır ilişki satırı gösterilmemeli');
});

run('user_guard_counts_canonical_legacy_monthly_and_correction', function () {
  const blockers = api.collectUserDeleteBlockers('u1', {
    vehicles: [{ id: 'v1', assignedUserId: 'u1' }, { id: 'v2', assignedUserId: 'u2' }],
    users: [{ id: 'u1', zimmetli_araclar: ['v1', 'v3'] }],
    monthlyRecords: [{ id: 'm1', surucu_id: 'u1' }, { id: 'm2', surucu_id: 'u2' }],
    correctionRequests: [{ id: 'd1', surucu_id: 'u1' }]
  });
  assert.equal(blockers.vehicleCount, 2, 'canonical + legacy tekilleştirilmeli (v1 iki kez sayılmaz)');
  assert.equal(blockers.monthlyRecordCount, 1);
  assert.equal(blockers.correctionRequestCount, 1);
  assert.equal(blockers.total, 4);
});

run('user_guard_allows_unrelated_user', function () {
  const blockers = api.collectUserDeleteBlockers('u_free', {
    vehicles: [{ id: 'v1', assignedUserId: 'u1' }],
    users: [{ id: 'u_free' }],
    monthlyRecords: [{ id: 'm1', surucu_id: 'u1' }],
    correctionRequests: [{ id: 'd1', surucu_id: 'u1' }]
  });
  assert.equal(blockers.total, 0);
});

run('user_guard_message_lists_only_positive_counts', function () {
  const message = api.buildUserDeleteBlockerMessage({ vehicleCount: 0, monthlyRecordCount: 3, correctionRequestCount: 0, total: 3 });
  assert.ok(message.startsWith('Bu kullanıcıya bağlı kayıtlar bulunduğu için kullanıcı silinemez.'));
  assert.ok(message.includes('3 aylık hareket kaydı'));
  assert.ok(!message.includes('taşıt tahsisi'));
});

run('delete_still_requires_explicit_confirm', function () {
  assert.match(ayarlarJs, /if \(!confirm\('Bu ŞUBEyi silmek istediğinizden emin misiniz\?'\)\) return;/);
  assert.match(ayarlarJs, /if \(!confirm\('Bu Kullanıcıyı silmek istediğinizden emin misiniz\?'\)\) return;/);
});

if (failures > 0) {
  console.error('\nSETTINGS_DELETE_UI_INVARIANTS: FAIL (' + failures + ' hata, ' + passed + ' geçti)');
  process.exit(1);
}
console.log('SETTINGS_DELETE_UI_INVARIANTS: PASS (' + passed + ' kontrol)');
