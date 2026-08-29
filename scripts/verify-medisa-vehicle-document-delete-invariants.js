/**
 * Belge silme (VEHICLE_DOCUMENT_DELETE) invariantleri.
 * Gerçek data/data.json, gerçek PDF ve production runtime verisi kullanılmaz;
 * bütün mutation davranışı temp fixture dizininde çalıştırılır.
 * Çalıştır: node scripts/verify-medisa-vehicle-document-delete-invariants.js
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const corePhp = read('core.php');
const deletePhp = read('delete_document.php');
const uploadPhp = read('upload_ruhsat.php');
const tasitlar = read('tasitlar.js');
const tasitlarExtraCss = read('tasitlar-extra.css');
const ayarlarJs = read('ayarlar.js');
const ayarlarCss = read('ayarlar.css');
const scriptCore = read('script-core.js');
const cpanel = read('.cpanel.yml');
const deployWorkflow = read('.github/workflows/deploy-cpanel.yml');
const sw = read('sw.js');

let passed = 0;
let failed = 0;

const pendingAsync = [];

function test(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      pendingAsync.push(
        result.then(function() {
          passed += 1;
          console.log('PASS ' + name);
        }).catch(function(error) {
          failed += 1;
          console.error('FAIL ' + name + ': ' + (error && error.message ? error.message : error));
        })
      );
      return;
    }
    passed += 1;
    console.log('PASS ' + name);
  } catch (error) {
    failed += 1;
    console.error('FAIL ' + name + ': ' + (error && error.message ? error.message : error));
  }
}

function extractBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, 'başlangıç işareti bulunamadı: ' + startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, 'bitiş işareti bulunamadı: ' + endMarker);
  return source.slice(start, end);
}

/* ---------- 1-2 / 18: UI kontratı — "-" yalnız yüklü belgede, "+" davranışı korunur ---------- */

test('UI: yüklü belgede [+] altında [-] var, boş belgede aksiyon yığını hiç kurulmaz', function() {
  const modalSrc = extractBetween(
    tasitlar,
    'window.openVehicleDocumentModal = function(vehicleId, documentType) {',
    'function renderRuhsatUploadForm('
  );
  const hasDocBranch = extractBetween(modalSrc, 'if (hasDoc) {', 'content.appendChild(btnGroup);');
  assert.match(hasDocBranch, /className = 'ruhsat-doc-actions'/, 'yüklü belgede aksiyon sarmalayıcı kurulmalı');
  assert.match(hasDocBranch, /className = 'ruhsat-add-btn'/, '"+" butonu korunmalı');
  assert.match(hasDocBranch, /className = 'ruhsat-remove-btn'/, '"-" butonu yüklü belgede olmalı');
  assert.match(hasDocBranch, /renderRuhsatUploadForm\(content, saveBtn, true, dt\)/, '"+" mevcut değiştirme davranışını korumalı');
  assert.match(hasDocBranch, /requestVehicleDocumentDelete\(vid, dt, docActions\)/, '"-" silme akışını çağırmalı');

  const emptyBranch = modalSrc.slice(modalSrc.indexOf('content.appendChild(btnGroup);'));
  assert.match(emptyBranch, /renderRuhsatUploadForm\(content, saveBtn, false, dt\)/, 'belge yokken yükleme formu render edilmeli');
  assert.doesNotMatch(emptyBranch, /ruhsat-remove-btn/, 'belge yokken "-" render edilmemeli');

  const addIndex = hasDocBranch.indexOf("className = 'ruhsat-add-btn'");
  const removeIndex = hasDocBranch.indexOf("className = 'ruhsat-remove-btn'");
  assert.ok(addIndex < removeIndex, '"-" butonu "+" butonundan sonra (altında) eklenmeli');
});

test('UI: K2 önizlemesinde aynı [+]/[-] kontratı var', function() {
  const previewSrc = extractBetween(
    ayarlarJs,
    'function renderZorunluEvraklarK2Preview()',
    'function setupZorunluEvraklarK2DocumentPicker()'
  );
  assert.match(previewSrc, /required-k2-doc-actions/);
  assert.match(previewSrc, /required-k2-add-btn/);
  assert.match(previewSrc, /required-k2-remove-btn/);
  const pickerSrc = extractBetween(
    ayarlarJs,
    'function renderZorunluEvraklarK2Picker(fileName)',
    'function ensureZorunluEvraklarK2ReplaceConfirm()'
  );
  assert.doesNotMatch(pickerSrc, /required-k2-remove-btn/, 'belge yokken K2 "-" butonu render edilmemeli');
});

test('CSS: [+]/[-] dikey hizalı, masaüstü ve mobil owner blokları güncel', function() {
  assert.match(tasitlarExtraCss, /\.ruhsat-doc-actions \{[\s\S]*?flex-direction: column;/);
  assert.match(tasitlarExtraCss, /\.ruhsat-doc-actions \.ruhsat-remove-btn/);
  assert.match(ayarlarCss, /\.required-k2-doc-actions \{[\s\S]*?flex-direction: column;/);
  assert.doesNotMatch(
    tasitlarExtraCss,
    /:has\(\.ruhsat-preview-link\) \.ruhsat-add-btn \{\s*position: absolute;/,
    'buton üzerindeki eski absolute owner kuralı kalmamalı'
  );
  const mobileBlock = tasitlarExtraCss.slice(tasitlarExtraCss.indexOf('@media (max-width: 640px)'));
  assert.match(mobileBlock, /\.ruhsat-doc-actions \{/, 'mobil blokta aksiyon yığını owner kuralı olmalı');
  assert.match(mobileBlock, /\.ruhsat-remove-btn/, 'mobil blokta "-" butonu boyut kontratını paylaşmalı');
});

/* ---------- 3-5: onay akışı, payload ve çift istek koruması ---------- */

test('Onay: tek generic compact confirm owner script-core.js içinde', function() {
  assert.match(scriptCore, /window\.medisaAskCompactConfirm = function\(options\)/);
  assert.match(scriptCore, /compact-confirm-modal/);
  assert.match(scriptCore, /compact-confirm-message/);
  assert.match(scriptCore, /universal-btn-save/);
  assert.match(scriptCore, /universal-btn-cancel/);
  const confirmOwner = extractBetween(
    scriptCore,
    'window.medisaAskCompactConfirm = function(options)',
    "/** Taşıt Detay'a dön"
  );
  assert.equal(
    (confirmOwner.match(/id = 'medisa-compact-confirm-modal'/g) || []).length,
    1,
    'tek modal kimliği olmalı'
  );
  assert.match(tasitlar, /title: 'BELGE SİLME'/);
  assert.match(tasitlar, /message: 'Belge Silinecektir\. Bu İşlem Geri Alınamaz\. Emin Misiniz\?'/);
  assert.match(ayarlarJs, /title: 'BELGE SİLME'/);
  assert.match(ayarlarJs, /message: 'Belge Silinecektir\. Bu İşlem Geri Alınamaz\. Emin Misiniz\?'/);
  assert.doesNotMatch(tasitlar, /medisa-compact-confirm-modal/, 'Taşıtlar kendi modal kopyasını kurmamalı');
  assert.doesNotMatch(ayarlarJs, /medisa-compact-confirm-modal/, 'Ayarlar kendi modal kopyasını kurmamalı');
});

test('Akış: Hayır istek göndermez, Evet doğru payload gönderir, çift tıklama tek istek üretir', function() {
  const flowSrc = extractBetween(
    tasitlar,
    'function requestVehicleDocumentDelete(vehicleId, documentType, actionsHost)',
    'function applyVehicleDocumentDeleteToClientState('
  );
  const stateSrc = extractBetween(
    tasitlar,
    'function applyVehicleDocumentDeleteToClientState(vehicleId, cfg, data)',
    '/**'
  );
  const disableSrc = extractBetween(
    tasitlar,
    'function setVehicleDocumentActionsDisabled(actionsHost, disabled)',
    'function requestVehicleDocumentDelete('
  );

  function makeSandbox(answer, responseBody) {
    const fetchCalls = [];
    const invalidations = [];
    const rerenders = [];
    const vehicle = {
      id: 'v1',
      version: 7,
      plate: '34 TEST 1',
      ruhsatPath: 'ruhsat/34TEST1_ruhsat_1.pdf',
      muayeneDate: '2027-01-01',
      sigortaDate: '2027-02-02',
      events: [{ id: 'old-upload-event' }]
    };
    const buttons = [
      { className: 'ruhsat-add-btn', disabled: false },
      { className: 'ruhsat-remove-btn', disabled: false }
    ];
    const sandbox = {
      console: { error: function() {} },
      Promise: Promise,
      Number: Number,
      String: String,
      Array: Array,
      Object: Object,
      JSON: JSON,
      alert: function() {},
      showToast: function() {},
      DOM: { dinamikOlayModal: { style: { display: 'flex' } } },
      window: {
        appData: { tasitlar: [vehicle] },
        currentDetailVehicleId: 'v1',
        medisaAskCompactConfirm: function(opts) {
          sandbox.confirmCalls.push(opts);
          return Promise.resolve(answer);
        },
        openVehicleDocumentModal: function() { rerenders.push('document-modal'); },
        showVehicleDetail: function() { rerenders.push('vehicle-detail'); }
      },
      confirmCalls: [],
      fetchCalls: fetchCalls,
      invalidations: invalidations,
      rerenders: rerenders,
      vehicleRef: vehicle,
      buttons: buttons,
      getVehicleDocumentConfig: function() {
        return { key: 'ruhsat', label: 'Ruhsat', pathField: 'ruhsatPath' };
      },
      findVehicleForDocumentUpload: function() { return vehicle; },
      getVehicleDocumentPath: function(v, key) {
        return key === 'ruhsat' ? String(v.ruhsatPath || '') : '';
      },
      buildMedisaAuthHeaders: function() { return { Authorization: 'Bearer test' }; },
      invalidateMedisaDocumentTokenCache: function(id, dt) { invalidations.push('token:' + id + ':' + dt); },
      invalidateRuhsatPreviewCache: function(id, dt) { invalidations.push('preview:' + id + ':' + dt); },
      invalidateRuhsatDocumentCache: function(id, dt) { invalidations.push('document:' + id + ':' + dt); },
      refreshOpenVehicleHistoryList: function() { rerenders.push('history'); },
      fetch: function(url, options) {
        fetchCalls.push({ url: url, options: options });
        return Promise.resolve({
          ok: true,
          json: function() { return Promise.resolve(responseBody); }
        });
      }
    };
    sandbox.actionsHost = {
      querySelectorAll: function() { return buttons; }
    };
    vm.createContext(sandbox);
    vm.runInContext(
      'var vehicleDocumentDeleteInFlight = false;\n' +
      disableSrc + '\n' + flowSrc + '\n' + stateSrc +
      '\nthis.requestVehicleDocumentDelete = requestVehicleDocumentDelete;',
      sandbox
    );
    return sandbox;
  }

  const okBody = {
    success: true,
    documentType: 'ruhsat',
    vehicleId: 'v1',
    vehicleVersion: 8,
    documentPath: '',
    deletedDocumentPath: 'ruhsat/34TEST1_ruhsat_1.pdf',
    documentEvent: { id: 'delete-event-1', type: 'ruhsat-sil' }
  };

  // 3: Hayır -> istek yok, butonlar tekrar aktif
  const noSandbox = makeSandbox(false, okBody);
  noSandbox.requestVehicleDocumentDelete('v1', 'ruhsat', noSandbox.actionsHost);
  return Promise.resolve().then(function() {
    assert.equal(noSandbox.confirmCalls.length, 1);
    assert.equal(noSandbox.fetchCalls.length, 0, 'Hayır seçilince request gönderilmemeli');
    assert.deepEqual(noSandbox.buttons.map(function(b) { return b.disabled; }), [false, false]);

    // 4 + 5: Evet -> tek istek, doğru payload; çift tıklama ikinci istek üretmez
    const yesSandbox = makeSandbox(true, okBody);
    yesSandbox.requestVehicleDocumentDelete('v1', 'ruhsat', yesSandbox.actionsHost);
    yesSandbox.requestVehicleDocumentDelete('v1', 'ruhsat', yesSandbox.actionsHost);
    assert.deepEqual(yesSandbox.buttons.map(function(b) { return b.disabled; }), [true, true], 'silme sırasında butonlar devre dışı olmalı');
    return new Promise(function(resolve) { setTimeout(resolve, 0); }).then(function() {
      assert.equal(yesSandbox.confirmCalls.length, 1, 'çift tıklama ikinci onay açmamalı');
      assert.equal(yesSandbox.fetchCalls.length, 1, 'çift tıklama ikinci silme isteği oluşturmamalı');
      const call = yesSandbox.fetchCalls[0];
      assert.equal(call.url, 'delete_document.php');
      assert.equal(call.options.method, 'POST');
      assert.equal(call.options.cache, 'no-store');
      const payload = JSON.parse(call.options.body);
      assert.deepEqual(payload, {
        documentType: 'ruhsat',
        vehicleId: 'v1',
        vehicleVersion: 7,
        documentPathBefore: 'ruhsat/34TEST1_ruhsat_1.pdf'
      });

      // 15: client cache/token invalidation + state
      assert.deepEqual(yesSandbox.invalidations, [
        'token:v1:ruhsat',
        'preview:v1:ruhsat',
        'document:v1:ruhsat'
      ]);
      assert.equal(yesSandbox.vehicleRef.ruhsatPath, '');
      assert.equal(yesSandbox.vehicleRef.version, 8);
      assert.equal(yesSandbox.vehicleRef.events[0].id, 'delete-event-1');
      assert.equal(yesSandbox.vehicleRef.events[1].id, 'old-upload-event', 'önceki upload geçmişi korunmalı');
      assert.equal(yesSandbox.vehicleRef.muayeneDate, '2027-01-01', 'muayene tarihi korunmalı');
      assert.equal(yesSandbox.vehicleRef.sigortaDate, '2027-02-02', 'sigorta tarihi korunmalı');
      assert.ok(yesSandbox.rerenders.indexOf('document-modal') !== -1, 'belge ekranı yeniden render edilmeli');
      assert.ok(yesSandbox.rerenders.indexOf('vehicle-detail') !== -1, 'taşıt kartı yeniden render edilmeli');
    });
  });
});

test('K2 client: context-aware token cache temizlenir ve grup yeniden render edilir', function() {
  const k2Flow = extractBetween(
    ayarlarJs,
    'async function requestZorunluEvraklarK2DocumentDelete(actionsHost)',
    'async function uploadZorunluEvraklarK2Document(fileInput)'
  );
  assert.match(k2Flow, /zorunluEvrakK2DocTokenCache = null/);
  assert.match(k2Flow, /groupUpdatedAtBefore: String\(\(state && state\.updatedAt\) \|\| ''\)/);
  assert.match(k2Flow, /groupId: groupId/);
  assert.match(k2Flow, /branchId: selectedZorunluEvrakBranchId/);
  assert.match(k2Flow, /refreshZorunluEvraklarK2View\(\)/);
  assert.match(k2Flow, /zorunluEvrakK2DeleteInFlight/);
  assert.doesNotMatch(k2Flow, /location\.reload/, 'hard refresh çözüm olarak kullanılmamalı');
});

/* ---------- 6-14: backend guard, dosya temizliği ve audit (temp fixture) ---------- */

test('Endpoint kontratı: yalnız POST, no-store, auth ve yetki guardları', function() {
  assert.match(deletePhp, /require_once __DIR__ \. '\/core\.php'/);
  assert.match(deletePhp, /header\('Cache-Control: no-store'\)/);
  assert.match(deletePhp, /\$_SERVER\['REQUEST_METHOD'\] !== 'POST'/);
  assert.match(deletePhp, /http_response_code\(405\)/);
  assert.match(deletePhp, /medisaResolveAuthorizedContext\(\$preloadData, 'view_main_app'\)/);
  assert.match(deletePhp, /medisaCanManageVehicleRecord/);
  assert.match(deletePhp, /medisaCanAccessK2BelgeBranch/);
  assert.match(deletePhp, /medisaCanAccessK2BelgeGroup/);
  assert.match(deletePhp, /medisaArrayHasId\(\$preGroup\['branchIds'\] \?\? \[\], \$branchId\)/);
  assert.match(deletePhp, /medisaMutateData\(function \(&\$data\)/);
  assert.match(deletePhp, /medisaEnsureVehicleVersion/);
  assert.match(deletePhp, /medisaBuildVehicleDocumentHistoryEvent\('sil'/);
  assert.match(deletePhp, /medisaDeleteVehicleDocumentFiles/);
  assert.match(deletePhp, /medisaResolveVehicleDocumentSafeFileId/);
  // Yeni paralel document type haritası kurulmamalı
  assert.match(deletePhp, /medisaGetVehicleDocumentConfig\(\$documentType\)/);
  ['ruhsatPath', 'sigortaPolicePath', 'kaskoPolicePath', 'tasitKartiPath', 'takografBelgesiPath', 'satisSozlesmesiPath'].forEach(function(field) {
    assert.doesNotMatch(deletePhp, new RegExp(field), 'paralel document type haritası kurulmamalı: ' + field);
  });
  // Muayene / egzoz bu görevde eklenmez
  assert.doesNotMatch(deletePhp, /muayene|egzoz/i);
  assert.doesNotMatch(corePhp, /'muayene'\s*=>\s*\[\s*'pathField'/);
});

test('Fiziksel silme owner: canonical + legacy + yalnız kendi preview sayfaları (temp fixture)', function() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'medisa-doc-delete-'));
  try {
    const phpSrc = [
      '<?php',
      'error_reporting(E_ALL);',
      "$dataDir = " + JSON.stringify(dir) + ";",
      "function getDataDirPath() { global $dataDir; return $dataDir; }",
      extractBetween(corePhp, 'function medisaResolveVehicleDocumentCandidatePath($rawPath, array $config)', 'function medisaResolveVehicleDocumentFilePath'),
      "$config = ['pathField' => 'ruhsatPath', 'dir' => 'ruhsat'];",
      "@mkdir($dataDir . '/ruhsat', 0700, true);",
      "@mkdir($dataDir . '/ruhsat_preview', 0700, true);",
      "file_put_contents($dataDir . '/ruhsat/34TEST1_ruhsat_1.pdf', 'fixture');",
      "file_put_contents($dataDir . '/ruhsat/v1.pdf', 'fixture');",
      "file_put_contents($dataDir . '/ruhsat/OTHER_ruhsat_2.pdf', 'fixture');",
      "file_put_contents($dataDir . '/ruhsat_preview/v1.jpg', 'fixture');",
      "file_put_contents($dataDir . '/ruhsat_preview/v1_p1.jpg', 'fixture');",
      "file_put_contents($dataDir . '/ruhsat_preview/v1_p2.jpg', 'fixture');",
      "file_put_contents($dataDir . '/ruhsat_preview/v12.jpg', 'fixture');",
      "file_put_contents($dataDir . '/ruhsat_preview/v12_p1.jpg', 'fixture');",
      "$result = medisaDeleteVehicleDocumentFiles($config, 'v1', 'ruhsat/34TEST1_ruhsat_1.pdf');",
      '$cases = [];',
      "$cases['failed-empty'] = empty($result['failed']);",
      "$cases['canonical-deleted'] = ($result['canonicalDeleted'] ?? false) === true;",
      "$cases['canonical-gone'] = !is_file($dataDir . '/ruhsat/34TEST1_ruhsat_1.pdf');",
      "$cases['legacy-gone'] = !is_file($dataDir . '/ruhsat/v1.pdf');",
      "$cases['preview-gone'] = !is_file($dataDir . '/ruhsat_preview/v1.jpg');",
      "$cases['preview-p1-gone'] = !is_file($dataDir . '/ruhsat_preview/v1_p1.jpg');",
      "$cases['preview-p2-gone'] = !is_file($dataDir . '/ruhsat_preview/v1_p2.jpg');",
      "$cases['other-vehicle-pdf-kept'] = is_file($dataDir . '/ruhsat/OTHER_ruhsat_2.pdf');",
      "$cases['prefix-similar-preview-kept'] = is_file($dataDir . '/ruhsat_preview/v12.jpg');",
      "$cases['prefix-similar-page-kept'] = is_file($dataDir . '/ruhsat_preview/v12_p1.jpg');",
      "$traversal = medisaResolveVehicleDocumentCandidatePath('ruhsat/../../data.json', $config);",
      "$cases['traversal-blocked'] = $traversal === null;",
      "$outside = medisaResolveVehicleDocumentCandidatePath('kasko_police/x.pdf', $config);",
      "$cases['other-dir-blocked'] = $outside === null;",
      'foreach ($cases as $key => $ok) {',
      '  if (!$ok) { fwrite(STDERR, "case fail: " . $key . PHP_EOL); exit(1); }',
      '}',
      'echo "ok", PHP_EOL;',
      ''
    ].join('\n');
    const tmpPhp = path.join(dir, 'delete-files-case.php');
    fs.writeFileSync(tmpPhp, phpSrc, 'utf8');
    const r = spawnSync('php', [tmpPhp], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(r.status, 0, 'PHP dosya temizliği: ' + (r.stderr || r.stdout || ''));
    assert.match(String(r.stdout || ''), /ok/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Guard davranışı: stale version / stale path / yetkisiz silme reddedilir (temp fixture)', function() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'medisa-doc-delete-guard-'));
  try {
    const phpSrc = [
      '<?php',
      'error_reporting(E_ALL);',
      "require_once " + JSON.stringify(path.join(ROOT, 'core.php').replace(/\\/g, '/')) + ";",
      '$cases = [];',
      "$vehicle = ['id' => 'v1', 'branchId' => 'b1', 'version' => 5, 'ruhsatPath' => 'ruhsat/a.pdf'];",
      "$cases['version-ok'] = medisaEnsureVehicleVersion($vehicle, 5) === true;",
      "$stale = medisaEnsureVehicleVersion($vehicle, 4);",
      "$cases['stale-version-conflict'] = is_array($stale) && ($stale['status'] ?? 0) === 409 && ($stale['conflict'] ?? false) === true;",
      "$gmContext = ['role' => 'genel_yonetici', 'branch_ids' => []];",
      "$branchContext = ['role' => 'sube_yonetici', 'branch_ids' => ['b2']];",
      "$userContext = ['role' => 'kullanici', 'branch_ids' => ['b1']];",
      "$cases['gm-can-manage'] = medisaCanManageVehicleRecord($vehicle, $gmContext) === true;",
      "$cases['cross-branch-denied'] = medisaCanManageVehicleRecord($vehicle, $branchContext) === false;",
      "$cases['plain-user-denied'] = medisaCanManageVehicleRecord($vehicle, $userContext) === false;",
      "$groupA = ['id' => 'g1', 'branchIds' => ['b1'], 'documentPath' => 'k2_belgesi/k2_g1.pdf', 'updatedAt' => '2026-01-01T00:00:00+03:00'];",
      "$cases['k2-cross-branch-denied'] = medisaCanAccessK2BelgeBranch('b1', $branchContext) === false;",
      "$cases['k2-group-cross-denied'] = medisaCanAccessK2BelgeGroup($groupA, $branchContext) === false;",
      "$cases['k2-branch-allowed'] = medisaCanAccessK2BelgeBranch('b2', $branchContext) === true;",
      "$cases['k2-membership-guard'] = medisaArrayHasId($groupA['branchIds'], 'b2') === false;",
      "$event = medisaBuildVehicleDocumentHistoryEvent('sil', 'ruhsat', '', 'ruhsat/a.pdf', ['user' => ['isim' => 'Test Kullanıcı']], ['vehicleId' => 'v1']);",
      "$cases['audit-type'] = ($event['type'] ?? '') === 'ruhsat-sil';",
      "$cases['audit-file'] = ($event['data']['fileName'] ?? '') === 'a.pdf';",
      "$cases['audit-actor'] = ($event['data']['kaydeden'] ?? '') === 'Test Kullanıcı';",
      "$cases['audit-vehicle'] = ($event['data']['vehicleId'] ?? '') === 'v1';",
      "$cases['audit-timestamp'] = trim((string)($event['timestamp'] ?? '')) !== '';",
      "$cases['audit-operation'] = ($event['data']['islem'] ?? '') === 'silme';",
      "$cases['audit-path-cleared'] = ($event['data']['documentPath'] ?? 'x') === '';",
      "$cases['audit-not-replacement'] = ($event['data']['isReplacement'] ?? true) === false;",
      "$uploadEvent = medisaBuildVehicleDocumentHistoryEvent('yukle', 'ruhsat', 'ruhsat/b.pdf', 'ruhsat/a.pdf', [], []);",
      "$cases['upload-type-intact'] = ($uploadEvent['type'] ?? '') === 'ruhsat-yukle';",
      "$cases['upload-replacement-intact'] = ($uploadEvent['data']['isReplacement'] ?? false) === true;",
      "$cases['k2-safeid'] = medisaResolveVehicleDocumentSafeFileId('k2', medisaGetVehicleDocumentConfig('k2'), '', 'g1', 'b1') === medisaSafeK2BelgeGroupFileIdentity('g1');",
      "$cases['vehicle-safeid'] = medisaResolveVehicleDocumentSafeFileId('ruhsat', medisaGetVehicleDocumentConfig('ruhsat'), 'v1') === 'v1';",
      'foreach ($cases as $key => $ok) {',
      '  if (!$ok) { fwrite(STDERR, "case fail: " . $key . PHP_EOL); exit(1); }',
      '}',
      'echo "ok", PHP_EOL;',
      ''
    ].join('\n');
    const tmpPhp = path.join(dir, 'guard-case.php');
    fs.writeFileSync(tmpPhp, phpSrc, 'utf8');
    const r = spawnSync('php', [tmpPhp], { cwd: dir, encoding: 'utf8' });
    assert.equal(r.status, 0, 'PHP guard davranışı: ' + (r.stderr || r.stdout || ''));
    assert.match(String(r.stdout || ''), /ok/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Silme kapsamı: yalnız belge path alanı temizlenir, iş verileri korunur', function() {
  const mutator = extractBetween(deletePhp, '$mutation = medisaMutateData(function (&$data)', '$status = (int)($mutation[\'status\']');
  assert.match(mutator, /\$vehicle\[\$pathField\] = '';/);
  assert.match(mutator, /\$candidate\['documentPath'\] = '';/);
  [
    'muayeneDate',
    'sigortaDate',
    'kaskoDate',
    'tasitKartiExpiryDate',
    'takografKalibrasyonDate',
    'takografExpiryDate',
    'expiryDate',
    'branchIds',
    'satildiMi',
    'arsivNedeni'
  ].forEach(function(field) {
    assert.doesNotMatch(
      mutator,
      new RegExp("\\$vehicle\\['" + field + "'\\]\\s*=|\\$candidate\\['" + field + "'\\]\\s*="),
      field + ' silme sırasında değiştirilmemeli'
    );
  });
  assert.doesNotMatch(mutator, /array_splice|unset\(\$vehicle\['events'\]/, 'önceki geçmiş kayıtları silinmemeli');
  assert.match(mutator, /array_unshift\(\$vehicle\['events'\], \$documentEvent\)/);
});

test('Fail-closed: fiziksel silme başarısızsa metadata geri alınır ve başarı dönmez', function() {
  const tail = deletePhp.slice(deletePhp.indexOf('$cleanup = medisaDeleteVehicleDocumentFiles('));
  assert.match(tail, /if \(!empty\(\$cleanup\['failed'\]\)\) \{/);
  assert.match(tail, /medisaDocumentDeleteFail\(500/);
  assert.match(tail, /\$candidate\['documentPath'\] = \$deletedPath;/);
  assert.match(tail, /\$vehicle\[\$pathField\] = \$deletedPath;/);
  const failIndex = tail.indexOf("if (!empty($cleanup['failed']))");
  const failMessageIndex = tail.indexOf("medisaDocumentDeleteFail(500");
  assert.ok(failIndex !== -1 && failIndex < failMessageIndex, 'geri alma bloğu 500 cevabından önce olmalı');
  assert.match(deletePhp, /Silinecek belge bulunamadı/);
  assert.match(deletePhp, /medisaBuildConflictResult/);
});

/* ---------- 16-17: K2 bağlam izolasyonu + deploy ---------- */

test('K2 A/B bağlamı: grup üyeliği, revision ve path birlikte doğrulanır', function() {
  const k2Branch = extractBetween(deletePhp, '$group = medisaFindK2BelgeGroupById($data, $groupId);', '$vehicleIndex = medisaFindVehicleIndex($data, $vehicleId);');
  assert.match(k2Branch, /medisaFindK2BelgeGroupById\(\$data, \$groupId\)/);
  assert.match(k2Branch, /medisaArrayHasId\(\$group\['branchIds'\] \?\? \[\], \$branchId\)/);
  assert.match(k2Branch, /\(\$group\['updatedAt'\] \?\? ''\)\) !== \$groupUpdatedAtBefore/);
  assert.match(k2Branch, /\$currentPath !== \$documentPathBefore/);
  assert.match(k2Branch, /medisaBuildConflictResult\('k2Group'/);
});

test('Deploy: yeni endpoint production listesinde ve SW cache dışında', function() {
  assert.match(cpanel, /\/bin\/test -f delete_document\.php/);
  assert.match(cpanel, /\/bin\/cp -a [^\n]*delete_document\.php/);
  assert.doesNotMatch(deployWorkflow, /^\s*delete_document\.php\s*$/m, 'FTP deploy exclude listesinde olmamalı');
  assert.match(sw, /delete_document\.php/);
  const noCacheBlock = extractBetween(sw, 'const isNoCachePhp =', 'if (isNoCachePhp)');
  assert.match(noCacheBlock, /delete_document\.php/, 'PHP endpoint service worker tarafından cache\'lenmemeli');
});

test('Upload owner davranışı korunur: paylaşılan audit/safeId owner core.php içinde', function() {
  assert.match(corePhp, /function medisaVehicleDocumentHistoryMeta\(\$documentType\)/);
  assert.match(corePhp, /function medisaBuildVehicleDocumentHistoryEvent\(/);
  assert.match(corePhp, /function medisaResolveVehicleDocumentSafeFileId\(/);
  assert.match(corePhp, /function medisaDeleteVehicleDocumentFiles\(/);
  assert.doesNotMatch(uploadPhp, /function medisaUploadDocumentHistoryMeta/, 'kopya audit haritası kalmamalı');
  assert.doesNotMatch(uploadPhp, /function medisaBuildVehicleDocumentUploadEvent/, 'kopya event builder kalmamalı');
  assert.match(uploadPhp, /medisaBuildVehicleDocumentHistoryEvent\('yukle', \$documentType/);
  assert.match(uploadPhp, /\$safeId = medisaResolveVehicleDocumentSafeFileId\(/);
  assert.match(uploadPhp, /move_uploaded_file\(\$file\['tmp_name'\], \$targetPath\)/, 'mevcut yükleme akışı korunmalı');
});

Promise.all(pendingAsync).then(function() {
  console.log(passed + ' passed, ' + failed + ' failed');
  process.exit(failed === 0 ? 0 : 1);
});
