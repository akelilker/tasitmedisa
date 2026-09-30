'use strict';

/**
 * BRANCH_MISMATCH_MODAL_UI_STANDARDIZATION — focused UI invariants
 * Çalıştır: node scripts/verify-medisa-branch-mismatch-modal-ui-invariants.js
 *
 * Kanonik beklenti:
 * - #vehicle-user-cross-branch-confirm-modal tek owner'dır; ikinci paralel modal yoktur.
 * - Modal chrome'u uygulamanın kanonik küçük onay modalı standardını reuse eder
 *   (header gradient/height, body spacing, universal butonlar, compact-confirm backdrop).
 * - Bilgi tek paragraf değil, structured label/value satırları ile sunulur.
 * - Değerler runtime datasından gelir; iş mantığı (persist sırası / reminder semantiği) değişmez.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
let passed = 0;
let failed = 0;

function ok(name) {
  passed += 1;
  console.log('PASS ' + name);
}
function fail(name, err) {
  failed += 1;
  console.error('FAIL ' + name + ': ' + (err && err.message ? err.message : err));
}
async function run(name, fn) {
  try {
    await fn();
    ok(name);
  } catch (err) {
    fail(name, err);
  }
}
function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

const MODAL_ID = 'vehicle-user-cross-branch-confirm-modal';

(async function main() {
  const html = read('index.html');
  const css = read('style-core.css');
  const dm = read('data-manager.js');
  const tasitlar = read('tasitlar.js');

  await run('visible_title_is_sube_uyumsuzlugu', async function() {
    assert.match(html, /id="vehicle-user-cross-branch-confirm-title">ŞUBE UYUMSUZLUĞU</);
  });

  await run('structured_info_rows_replace_single_paragraph', async function() {
    assert.match(html, /class="compact-confirm-info-list" id="vehicle-user-cross-branch-confirm-info"/);
    const rows = html.match(/class="compact-confirm-info-row"/g) || [];
    assert.equal(rows.length, 3, 'üç bilgi satırı olmalı (yeni şube / kullanıcı / kullanıcı şubesi)');
    assert.match(html, /class="compact-confirm-info-label">Taşıtın Yeni Şubesi</);
    assert.match(html, /class="compact-confirm-info-label">Atanmış Kullanıcı</);
    assert.match(html, /class="compact-confirm-info-label">Kullanıcı Şubesi</);
    assert.match(html, /id="vehicle-user-cross-branch-confirm-vehicle-branch"/);
    assert.match(html, /id="vehicle-user-cross-branch-confirm-user-name"/);
    assert.match(html, /id="vehicle-user-cross-branch-confirm-user-branches"/);
  });

  await run('vehicle_branch_value_bound_from_runtime', async function() {
    assert.match(dm, /getElementById\('vehicle-user-cross-branch-confirm-vehicle-branch'\)/);
    assert.match(dm, /vehicleBranchEl\.textContent = vehicleBranchName/);
    assert.match(tasitlar, /vehicleBranchName: \(yeniSube && yeniSube\.name\)/);
  });

  await run('assigned_user_value_bound_from_runtime', async function() {
    assert.match(dm, /getElementById\('vehicle-user-cross-branch-confirm-user-name'\)/);
    assert.match(dm, /userNameEl\.textContent = assignedUserName/);
    assert.match(tasitlar, /assignedUserName: assignedUser\.name \|\| assignedUser\.isim/);
  });

  await run('user_branch_value_bound_from_canonical_branch_source', async function() {
    assert.match(dm, /getElementById\('vehicle-user-cross-branch-confirm-user-branches'\)/);
    assert.match(dm, /userBranchesEl\.textContent = userBranchNames\.length \? userBranchNames\.join\(', '\)/);
    assert.match(tasitlar, /getUserBranchIds/);
    assert.match(tasitlar, /readBranches\(\)/);
    assert.match(tasitlar, /branches\.find\(b => String\(b\.id\) === String\(branchId\)\)/);
  });

  await run('question_hierarchy_text_present', async function() {
    assert.match(dm, /buildVehicleBranchMismatchReminderMessage/);
    assert.match(dm, /Kullanıcının şube bilgisini kontrol etmek ister misiniz\?/);
    assert.match(dm, /msgEl\.textContent = messageText;/);
  });

  await run('no_string_parse_hack_in_modal_open_helper', async function() {
    const start = dm.indexOf('function askVehicleBranchMismatchReminder');
    const end = dm.indexOf('function getVisibleVehicles', start);
    assert.ok(start >= 0 && end > start, 'askVehicleBranchMismatchReminder owner bulunamadı');
    const block = dm.slice(start, end);
    assert.doesNotMatch(block, /\.split\(|\.match\(|innerHTML|insertAdjacentHTML/, 'string parse / HTML injection yok');
    assert.match(block, /typeof payload === 'object'/, 'structured payload desteklenmeli');
  });

  await run('yes_button_calls_existing_resolver_true', async function() {
    assert.match(html, /id="vehicle-user-cross-branch-confirm-yes"[^>]*>Evet</);
    assert.match(dm, /yesBtn\.addEventListener\('click', onYes\)/);
    assert.match(dm, /function onYes\(e\) \{[\s\S]*?finish\(true\);/);
    assert.match(tasitlar, /if \(reminder\.remind && reminder\.assignedUserId/);
  });

  await run('no_button_calls_existing_resolver_false', async function() {
    assert.match(html, /id="vehicle-user-cross-branch-confirm-no"[^>]*>Hayır</);
    assert.match(dm, /noBtn\.addEventListener\('click', onNo\)/);
    assert.match(dm, /function onNo\(e\) \{[\s\S]*?finish\(false\);/);
  });

  await run('close_x_keeps_soft_reminder_semantics', async function() {
    assert.match(html, /id="vehicle-user-cross-branch-confirm-close"[^>]*aria-label="Kapat"/);
    assert.match(dm, /closeBtn\.addEventListener\('click', onClose\)/);
    assert.match(dm, /function onClose\(e\) \{[\s\S]*?finish\(null\);/);
  });

  await run('click_through_protection_preserved', async function() {
    assert.match(dm, /Önceki Evet\/Hayır pointer olayının yeni handler'a click-through olmaması için ertele/);
    assert.match(dm, /setTimeout\(function\(\) \{\s*resolve\(result\);/);
  });

  await run('backdrop_blur_owner_preserved', async function() {
    assert.match(html, /id="vehicle-user-cross-branch-confirm-modal" class="modal-overlay ayarlar-modal-overlay compact-confirm-modal"/);
    assert.match(css, /body\.modal-open:has\(\.compact-confirm-modal\.active\) #vehicle-detail-modal\.modal-overlay\.active/);
    assert.match(css, /filter: blur\(2px\);/);
    assert.match(css, /body\.modal-open:has\(\.compact-confirm-modal\.active\) \.content-wrap/);
  });

  await run('single_owner_no_duplicate_modal', async function() {
    const ids = html.match(new RegExp('id="' + MODAL_ID + '"', 'g')) || [];
    assert.equal(ids.length, 1, 'modal id tek kez bulunmalı');
    assert.doesNotMatch(html, /branch-mismatch-modal-v2/);
    assert.doesNotMatch(css, /branch-mismatch-modal-v2/);
    assert.doesNotMatch(dm, /branch-mismatch-modal-v2/);
  });

  await run('header_reuses_canonical_small_modal_owner', async function() {
    assert.match(html, /<div class="modal-header">/);
    assert.match(html, /class="modal-close"/);
    assert.match(css, new RegExp('#' + MODAL_ID + ' \\.modal-header,\\n#vehicle-user-cross|#tescil-tarih-input-modal \\.modal-header,\\n#' + MODAL_ID + ' \\.modal-header \\{'));
    assert.match(css, new RegExp('#' + MODAL_ID + ' \\.modal-header \\{\\n    background: var\\(--modal-header-red-gradient\\);'));
    assert.match(css, new RegExp('#' + MODAL_ID + ' \\.modal-header h2 \\{'));
    assert.doesNotMatch(css, new RegExp('#' + MODAL_ID + '[^{]*\\{[^}]*linear-gradient'));
  });

  await run('buttons_reuse_canonical_classes', async function() {
    assert.match(html, /<div class="universal-btn-group">/);
    assert.match(html, /class="universal-btn-save" id="vehicle-user-cross-branch-confirm-yes"/);
    assert.match(html, /class="universal-btn-cancel" id="vehicle-user-cross-branch-confirm-no"/);
  });

  await run('body_spacing_reuses_canonical_classes', async function() {
    assert.match(html, /<div class="modal-body" onclick="event\.stopPropagation\(\);"/);
    assert.match(html, /id="vehicle-user-cross-branch-confirm-message" class="compact-confirm-message"/);
    assert.match(css, /\.compact-confirm-modal \.modal-body \{/);
    assert.match(css, /\.compact-confirm-modal \.compact-confirm-message \{/);
  });

  await run('info_row_css_in_modal_owner_no_important', async function() {
    const start = css.indexOf('/* Branch mismatch info rows:');
    const end = css.indexOf('.compact-confirm-modal .modal-header {', start);
    assert.ok(start >= 0 && end > start, 'info row CSS bloğu bulunamadı');
    const block = css.slice(start, end);
    assert.doesNotMatch(block, /!important/, 'info row CSS !important içermemeli');
    assert.match(block, /\.compact-confirm-modal \.compact-confirm-info-value \{[\s\S]*?overflow-wrap: break-word;/);
    assert.match(block, /color: var\(--form-label-color\);/);
    assert.match(block, /color: var\(--txt-gray-dark\);/);
  });

  await run('no_inline_style_hack_in_info_rows', async function() {
    const start = html.indexOf('id="vehicle-user-cross-branch-confirm-info"');
    const end = html.indexOf('id="vehicle-user-cross-branch-confirm-message"', start);
    assert.ok(start >= 0 && end > start);
    const block = html.slice(start, end);
    assert.doesNotMatch(block, /style=/, 'info satırlarında inline style olmamalı');
  });

  await run('modal_size_and_mobile_overflow_invariant', async function() {
    assert.match(css, /\.compact-confirm-modal\.modal-overlay \.modal-container \{[\s\S]{0,300}max-width: 400px;/);
    assert.match(css, /\.compact-confirm-modal\.modal-overlay \.modal-container \{[\s\S]{0,400}max-height: calc\(100dvh - env\(safe-area-inset-top, 0px\) - env\(safe-area-inset-bottom, 0px\) - 80px\)/);
    assert.match(css, /@media \(max-width: 640px\) and \(display-mode: standalone\) \{[\s\S]*?\.compact-confirm-modal\.modal-overlay \.modal-container \{[\s\S]*?max-height: calc\(100dvh/);
  });

  await run('business_logic_untouched_markers', async function() {
    assert.match(tasitlar, /function resolveSubeDegisiklikUserReminder/);
    assert.match(tasitlar, /const noReminder = \{ remind: false, assignedUserId: '' \};/);
    const start = tasitlar.indexOf('window.updateSubeDegisiklik = function()');
    const end = tasitlar.indexOf('window.updateKullaniciAtama = function()', start);
    assert.ok(start >= 0 && end > start, 'updateSubeDegisiklik bloğu bulunamadı');
    const block = tasitlar.slice(start, end);
    const writePos = block.indexOf('writeVehicles(vehicles)');
    const completePos = block.indexOf('completeDynamicEventSave(');
    const openPos = block.indexOf('window.openUserFormModal(reminder.assignedUserId)');
    assert.ok(writePos >= 0 && completePos > writePos && openPos > completePos, 'persist → UI → kullanıcı formu sırası korunmalı');
  });

  console.log('');
  console.log('Branch mismatch modal UI invariants: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
})();
