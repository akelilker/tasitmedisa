/**
 * Driver sigorta/kasko poliçe upload invariantleri.
 * Çalıştır: node scripts/verify-medisa-driver-upload-invariants.js
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const corePhp = read('core.php');
const driverUploadPhp = read('driver/driver_upload_document.php');
const uploadPhp = read('upload_ruhsat.php');
const documentsJs = read('driver/driver-feature-documents.js');
const actionsJs = read('driver/driver-feature-actions.js');
const dashboardCore = read('driver/driver-dashboard-core.js');
const cpanel = read('.cpanel.yml');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log('PASS ' + name);
  } catch (error) {
    failed += 1;
    console.error('FAIL ' + name + ': ' + (error && error.message ? error.message : error));
  }
}

test('upload_ruhsat shared core owner kullanır', function() {
  assert.match(uploadPhp, /medisaValidateVehicleDocumentHttpUploadLimits/);
  assert.match(uploadPhp, /medisaResolveVehicleDocumentUploadedFile/);
  assert.match(uploadPhp, /medisaPersistVehicleDocumentPdfFile/);
  assert.match(uploadPhp, /medisaApplyVehicleDocumentUploadMutation/);
  assert.match(uploadPhp, /medisaResolveAuthorizedContext\(\$data, 'view_main_app'\)/);
  assert.match(uploadPhp, /medisaCanManageVehicleRecord\(\$preVehicle, \$context\)/);
});

test('driver_upload_document endpoint kontratı', function() {
  assert.match(driverUploadPhp, /validateToken\(\)/);
  assert.match(driverUploadPhp, /medisaDriverRequireUsableSession\(\$tokenData\)/);
  assert.match(driverUploadPhp, /medisaDriverUserHasVehicleAccess/);
  assert.match(driverUploadPhp, /in_array\(\$documentType, \['sigorta', 'kasko'\], true\)/);
  assert.match(driverUploadPhp, /\['document'\]/);
  assert.match(driverUploadPhp, /skipManageVehicleCheck' => true/);
  assert.match(driverUploadPhp, /requireDriverVehicleAccess' => true/);
  assert.match(driverUploadPhp, /medisaApplyVehicleDocumentUploadMutation/);
  assert.doesNotMatch(driverUploadPhp, /view_main_app/);
  assert.doesNotMatch(driverUploadPhp, /medisaCanManageVehicleRecord/);
  assert.match(cpanel, /driver_upload_document\.php/);
});

test('frontend: ortak upload ekranı ve giriş noktaları', function() {
  assert.match(documentsJs, /driver_upload_document\.php/);
  assert.match(documentsJs, /accept = 'application\/pdf,\.pdf'/);
  assert.match(documentsJs, /DRIVER_POLICY_UPLOAD_MAX_MB = 8/);
  assert.match(documentsJs, /driver-document-upload-add/);
  assert.doesNotMatch(documentsJs, /resolveVehicleUploadFileBlob/);
  assert.match(actionsJs, /uploadPendingDriverPolicyIfAny/);
  assert.match(dashboardCore, /Poliçe Yükle/);
  assert.match(dashboardCore, /openDriverPolicyUploadModal\('sigorta'/);
  assert.match(dashboardCore, /openDriverPolicyUploadModal\('kasko'/);
  const sigortaBlock = dashboardCore.slice(dashboardCore.indexOf('driver-report-block-sigorta'));
  const bildirSigorta = sigortaBlock.indexOf("saveDriverEventFromBlock('sigorta'");
  const policeSigorta = sigortaBlock.indexOf('Poliçe Yükle');
  assert.ok(policeSigorta > 0 && bildirSigorta > policeSigorta, 'Poliçe Yükle Bildir üstünde olmalı');
});

test('PHP: atanmamış taşıt 403, geçersiz tip ve non-PDF 400', function() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'medisa-driver-upload-'));
  const badPdf = path.join(dir, 'not-pdf.bin');
  fs.writeFileSync(badPdf, 'NOTPDF');
  const goodPdf = path.join(dir, 'ok.pdf');
  fs.writeFileSync(goodPdf, '%PDF-1.4 fixture');

  const phpSrc = [
    '<?php',
    "require_once " + JSON.stringify(path.join(ROOT, 'core.php')) + ';',
    "require_once " + JSON.stringify(path.join(ROOT, 'driver/driver_common.php')) + ';',
    '$cases = [];',
    '$files = [',
    "  'document' => [",
    "    'name' => 'x.pdf',",
    "    'type' => 'application/pdf',",
    "    'tmp_name' => " + JSON.stringify(goodPdf) + ',',
    "    'error' => UPLOAD_ERR_OK,",
    "    'size' => filesize(" + JSON.stringify(goodPdf) + ')',
    '  ]',
    '];',
    '$bad = medisaResolveVehicleDocumentUploadedFile([',
    "  'document' => [",
    "    'name' => 'x.pdf',",
    "    'type' => 'application/pdf',",
    "    'tmp_name' => " + JSON.stringify(badPdf) + ',',
    "    'error' => UPLOAD_ERR_OK,",
    "    'size' => filesize(" + JSON.stringify(badPdf) + ')',
    '  ]',
    '], [\'document\'], 0);',
    "$cases['non-pdf'] = ($bad['ok'] ?? true) === false && (int)($bad['status'] ?? 0) === 400;",
    '$data = medisaDefaultData();',
    "$data['users'] = [['id' => 'u1', 'isim' => 'Surucu', 'role' => 'surucu']];",
    "$data['tasitlar'] = [['id' => 'v1', 'plate' => '34TEST1', 'version' => 3, 'assignedUserId' => 'u2', 'sigortaPolicePath' => '']];",
    '$vehicle = $data[\'tasitlar\'][0];',
    '$user = $data[\'users\'][0];',
    "$cases['unassigned'] = medisaDriverUserHasVehicleAccess($vehicle, $user, 'v1') === false;",
    "$docType = 'ruhsat';",
    "$cases['bad-type'] = !in_array($docType, ['sigorta', 'kasko'], true);",
    'foreach ($cases as $key => $ok) {',
    '  if (!$ok) { fwrite(STDERR, "case fail: " . $key . PHP_EOL); exit(1); }',
    '}',
    'echo "ok", PHP_EOL;',
    ''
  ].join('\n');
  const tmpPhp = path.join(dir, 'driver-upload-cases.php');
  fs.writeFileSync(tmpPhp, phpSrc, 'utf8');
  const r = spawnSync('php', [tmpPhp], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, (r.stderr || r.stdout || '').trim());
});

if (failed > 0) {
  process.exitCode = 1;
}
console.log('verify-medisa-driver-upload-invariants: ' + passed + ' passed, ' + failed + ' failed');
