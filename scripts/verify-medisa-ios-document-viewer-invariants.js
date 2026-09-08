/**
 * iOS canonical document viewer (PDF.js) invariants.
 * Çalıştır: node scripts/verify-medisa-ios-document-viewer-invariants.js
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const tasitlar = read('tasitlar.js');
const scriptCore = read('script-core.js');
const styleCore = read('style-core.css');
const sw = read('sw.js');

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

function extractBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, 'başlangıç bulunamadı: ' + startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, 'bitiş bulunamadı: ' + endMarker);
  return source.slice(start, end);
}

test('1. iOS PDF view ruhsat_preview.php gerektirmez', function() {
  const viewer = extractBetween(
    tasitlar,
    'function openIosCanonicalDocumentViewer(vehicleId, documentType, viewerOpts) {',
    'function runVehicleDocumentPrintAction(actionBtn, ruhsatUrl, vehicleId, documentType) {'
  );
  assert.doesNotMatch(viewer, /ruhsat_preview\.php|buildRuhsatPreviewUrl|fetchRuhsatPreviewObjectUrl/);
  assert.match(viewer, /fetchRuhsatDocumentEntry\(/);
  assert.match(viewer, /ensureMedisaPdfJs\(/);
});

test('2. iOS thumbnail auto-hydration server PDF preview çağırmaz', function() {
  const hydrate = extractBetween(
    tasitlar,
    'function hydrateRuhsatPreviewButton(previewBtn, vehicleId, ruhsatUrl, isImage, documentType) {',
    'function openIosCanonicalDocumentViewer(vehicleId, documentType, viewerOpts) {'
  );
  assert.match(hydrate, /isIosCanonicalDocumentViewerHost\(\)/);
  assert.match(hydrate, /ruhsat-preview-pdf-icon|Ön İzleme/);
  const iosBranch = hydrate.slice(hydrate.indexOf('if (!isImage && isIosCanonicalDocumentViewerHost())'));
  assert.doesNotMatch(iosBranch.slice(0, 500), /fetchRuhsatPreviewObjectUrl/);
  assert.match(tasitlar, /function warmRuhsatPreview[\s\S]*?isIosCanonicalDocumentViewerHost\(\)[\s\S]*?return Promise\.resolve\(''\)/);
});

test('3-4. preview/print failure original cooldown set etmez; state ayrık', function() {
  assert.match(tasitlar, /originalCooldownUntil/);
  assert.match(tasitlar, /printCooldownUntil/);
  const preload = extractBetween(
    tasitlar,
    'function preloadIosPwaPrintDocument(vehicleId, documentPath, documentType) {',
    'function warmRuhsatPreview(vehicleId, ruhsatUrl, documentType) {'
  );
  assert.match(preload, /printCooldownUntil\s*=\s*Date\.now\(\)\s*\+\s*30000/);
  assert.doesNotMatch(preload, /originalCooldownUntil\s*=\s*Date\.now/);
  assert.match(preload, /Print\/preview failure MUST NOT set originalCooldownUntil/);
  const fetchSrc = extractBetween(
    tasitlar,
    'function fetchRuhsatDocumentEntry(vehicleId, ruhsatUrl, documentType, opts) {',
    'function fetchRuhsatDocumentObjectUrl(vehicleId, ruhsatUrl, documentType) {'
  );
  assert.match(fetchSrc, /originalCooldownUntil/);
  assert.doesNotMatch(fetchSrc, /printCooldownUntil/);
});

test('5. iOS download/view raw top-level PDF navigation yok', function() {
  const downloadSrc = extractBetween(
    tasitlar,
    'function downloadVehicleDocumentOriginal(vehicleId, documentType) {',
    'function preloadIosPwaImageDocument('
  );
  assert.match(downloadSrc, /openIosCanonicalDocumentViewer/);
  assert.doesNotMatch(downloadSrc, /appendOriginalDocumentDownloadMode/);
  assert.doesNotMatch(downloadSrc, /blankTab\.location/);
  const viewSrc = extractBetween(
    tasitlar,
    'window.viewRuhsatPdf = function(vehicleId, documentType, opts) {',
    'function renderBoyaSchemaKaza(vehicle, container) {'
  );
  assert.match(viewSrc, /isIosCanonicalDocumentViewerHost\(\)/);
  assert.match(viewSrc, /openIosCanonicalDocumentViewer\(vid, dt\)/);
});

test('6. controlled shell Back + Close zorunlu', function() {
  assert.match(scriptCore, /window\.openMedisaPreviewShell\s*=\s*function/);
  assert.match(scriptCore, /showBack !== false/);
  assert.match(scriptCore, /showClose !== false/);
  assert.match(scriptCore, /Geri Dön/);
  assert.match(scriptCore, /Kapat/);
  assert.match(styleCore, /\.medisa-preview-shell-panel--document-viewer/);
});

test('7-8. PDF.js renderer + image renderer', function() {
  assert.match(tasitlar, /ensureMedisaPdfJs\(/);
  assert.match(tasitlar, /medisa-doc-viewer-image/);
  assert.match(tasitlar, /entry\.kind === 'image'/);
  assert.match(tasitlar, /mountPdfPages\(/);
});

test('9-10. PDF.js lazy-load + worker version paired', function() {
  assert.match(tasitlar, /MEDISA_PDFJS_VERSION = '3\.11\.174'/);
  assert.match(tasitlar, /vendor\/pdfjs\/' \+ MEDISA_PDFJS_VERSION/);
  assert.match(tasitlar, /pdf\.min\.js/);
  assert.match(tasitlar, /pdf\.worker\.min\.js/);
  assert.match(tasitlar, /GlobalWorkerOptions\.workerSrc = MEDISA_PDFJS_WORKER/);
  assert.match(tasitlar, /loadScript\(MEDISA_PDFJS_MAIN/);
  assert.ok(fs.existsSync(path.join(ROOT, 'vendor/pdfjs/3.11.174/pdf.min.js')));
  assert.ok(fs.existsSync(path.join(ROOT, 'vendor/pdfjs/3.11.174/pdf.worker.min.js')));
});

test('11-12. share cached File; AbortError hata değil', function() {
  const viewer = extractBetween(
    tasitlar,
    'function openIosCanonicalDocumentViewer(vehicleId, documentType, viewerOpts) {',
    'function runVehicleDocumentPrintAction(actionBtn, ruhsatUrl, vehicleId, documentType) {'
  );
  assert.match(viewer, /function shareCachedFile\(/);
  assert.match(viewer, /navigator\.share\(\{[\s\S]*files:\s*\[file\]/);
  assert.match(viewer, /User gesture: no network fetch here/);
  assert.match(viewer, /name === 'AbortError'/);
  const shareOnly = extractBetween(viewer, 'function shareCachedFile() {', 'function showShareFallback() {');
  assert.doesNotMatch(shareOnly, /fetchRuhsatDocument|fetch\(/);
});

test('13. desktop download owner blob <a download> korunur', function() {
  const downloadSrc = extractBetween(
    tasitlar,
    'function downloadVehicleDocumentOriginal(vehicleId, documentType) {',
    'function preloadIosPwaImageDocument('
  );
  assert.match(downloadSrc, /fetchRuhsatDocumentObjectUrl\(vid, documentUrl, dt\)/);
  assert.match(downloadSrc, /\.download\s*=\s*fileName/);
});

test('14. documentType generic', function() {
  assert.match(tasitlar, /openIosCanonicalDocumentViewer\(vid, dt/);
  assert.match(tasitlar, /getVehicleDocumentConfig\(dt\)/);
});

test('15-16. race cancellation + MIME guard', function() {
  assert.match(tasitlar, /function isStale\(/);
  assert.match(tasitlar, /AbortController/);
  assert.match(tasitlar, /classifyVehicleDocumentMime\(/);
  assert.match(tasitlar, /document-mime-mismatch/);
});

test('17. viewer cleanup cancels render/tasks', function() {
  assert.match(tasitlar, /function destroyViewer\(/);
  assert.match(tasitlar, /renderTask\.cancel|task\.cancel/);
  assert.match(tasitlar, /pdfDoc\.destroy/);
  assert.match(tasitlar, /obs\.disconnect/);
});

test('18. logout/auth purge owner', function() {
  assert.match(tasitlar, /window\.purgeMedisaVehicleDocumentCaches\s*=/);
  const dm = read('data-manager.js');
  assert.match(dm, /purgeMedisaVehicleDocumentCaches/);
});

test('19-21. print ayrı; Imagick iOS print zorunlu değil', function() {
  const viewer = extractBetween(
    tasitlar,
    'function openIosCanonicalDocumentViewer(vehicleId, documentType, viewerOpts) {',
    'function runVehicleDocumentPrintAction(actionBtn, ruhsatUrl, vehicleId, documentType) {'
  );
  assert.match(viewer, /id: 'share'/);
  assert.match(viewer, /id: 'print'/);
  assert.match(viewer, /prepareIosPdfPrintPagesFromEntry|preloadIosPwaPrintDocument/);
  const preload = extractBetween(
    tasitlar,
    'function preloadIosPwaPrintDocument(vehicleId, documentPath, documentType) {',
    'function warmRuhsatPreview(vehicleId, ruhsatUrl, documentType) {'
  );
  assert.doesNotMatch(preload, /buildRuhsatPreviewPageUrl|ruhsat_preview\.php/);
  assert.match(preload, /prepareIosPdfPrintPagesFromEntry|ensureMedisaPdfJs|fetchRuhsatDocumentEntry/);
});

test('22. no public raw token log', function() {
  assert.doesNotMatch(tasitlar, /console\.log\([^\)]*docToken|console\.log\([^\)]*portal_token/);
  assert.doesNotMatch(tasitlar, /cacheKey[^\n]*getMedisaPortalToken\(\)/);
});

test('print pagination: CASE A overflow guards + 1:1 page DOM', function() {
  const printHtmlFn = extractBetween(
    tasitlar,
    'function buildIosPwaPdfPrintHtml(pageUrls) {',
    'function canvasToPrintObjectUrl(canvas) {'
  );
  assert.match(printHtmlFn, /ruhsat-pdf-print-page--break/);
  assert.match(printHtmlFn, /height:296mm/);
  assert.match(printHtmlFn, /max-height:296mm/);
  assert.match(printHtmlFn, /box-sizing:border-box/);
  assert.match(printHtmlFn, /overflow:hidden !important/);
  assert.match(printHtmlFn, /page-break-after:avoid !important/);
  assert.match(printHtmlFn, /break-after:avoid-page !important/);
  assert.doesNotMatch(printHtmlFn, /height:297mm/);
  assert.match(printHtmlFn, /pageCount > 1/);
  // Tek sayfada break class eklenmemeli
  assert.match(printHtmlFn, /isLast = index === pageCount - 1/);
});

test('iOS kart İndir gizlenir; desktop download owner korunur', function() {
  const modalSrc = extractBetween(
    tasitlar,
    'window.openVehicleDocumentModal = function(vehicleId, documentType) {',
    'function renderRuhsatUploadForm('
  );
  assert.match(modalSrc, /if \(!iosCanonical\) \{[\s\S]*?ruhsat-download-btn/);
  assert.match(tasitlar, /function downloadVehicleDocumentOriginal\(/);
  assert.match(tasitlar, /Kaydet \/ Paylaş/);
});

test('pin/SW chain', function() {
  assert.match(tasitlar, /MEDISA_TASITLAR_MODULE_VERSION = '20260907\.3'/);
  assert.match(scriptCore, /tasitlar:\s*'20260907\.3'/);
  assert.match(sw, /CACHE_VERSION = 'medisa-v2\.322'/);
  assert.match(read('index.html'), /script-core\.js\?v=20260908\.6/);
  assert.match(read('index.html'), /style-core\.css\?v=20260908\.2/);
});

console.log('');
console.log('Passed: ' + passed + ' Failed: ' + failed);
if (failed) process.exit(1);
