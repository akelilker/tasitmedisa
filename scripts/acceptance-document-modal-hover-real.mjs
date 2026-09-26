#!/usr/bin/env node
/**
 * Gerçek uygulama belge modal hover acceptance (Playwright + PHP built-in server).
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.MEDISA_ROOT || path.resolve(__dirname, '..');
const ARTIFACT_DIR = '/opt/cursor/artifacts/document-modal-hover-real';
const BASE_URL = process.env.MEDISA_BASE_URL || 'http://127.0.0.1:8765';
const VEHICLE_ID = 'veh-doc-hover-1';

async function loginToken() {
  const res = await fetch(`${BASE_URL}/driver/driver_login.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'doc_hover_gm', password: 'TestPass123!' }),
  });
  const json = await res.json();
  if (!json || !json.success || !json.token) {
    throw new Error('Login failed: ' + JSON.stringify(json));
  }
  return json.token;
}

async function readVisualState(page, selector) {
  return page.$eval(selector, (el) => {
    const cs = getComputedStyle(el);
    return {
      color: cs.color,
      backgroundColor: cs.backgroundColor,
      borderTopWidth: cs.borderTopWidth,
      borderTopColor: cs.borderTopColor,
      boxShadow: cs.boxShadow,
      outlineWidth: cs.outlineWidth,
      filter: cs.filter,
      transform: cs.transform,
      scale: cs.scale,
    };
  });
}

async function hoverCapture(page, label, selector, wholeModal) {
  await page.mouse.move(0, 0);
  await page.waitForTimeout(150);
  const beforePath = path.join(ARTIFACT_DIR, `${label}-before.png`);
  const afterPath = path.join(ARTIFACT_DIR, `${label}-after.png`);
  if (wholeModal) {
    await page.locator('#dinamik-olay-modal.active').screenshot({ path: beforePath });
  } else {
    await page.locator(selector).screenshot({ path: beforePath });
  }
  const before = await readVisualState(page, selector);
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`No box for ${selector}`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(200);
  if (wholeModal) {
    await page.locator('#dinamik-olay-modal.active').screenshot({ path: afterPath });
  } else {
    await page.locator(selector).screenshot({ path: afterPath });
  }
  const after = await readVisualState(page, selector);
  return { before, after, beforePath, afterPath };
}

function startPhpServer() {
  return new Promise((resolve, reject) => {
    const child = spawn('php', ['-S', '127.0.0.1:8765', '-t', ROOT], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let ready = false;
    const timer = setTimeout(() => {
      if (!ready) {
        child.kill('SIGTERM');
        reject(new Error('PHP server start timeout'));
      }
    }, 8000);
    child.stdout.on('data', () => {
      if (!ready) {
        ready = true;
        clearTimeout(timer);
        resolve(child);
      }
    });
    child.stderr.on('data', (buf) => {
      const text = String(buf);
      if (text.includes('Development Server')) {
        if (!ready) {
          ready = true;
          clearTimeout(timer);
          resolve(child);
        }
      }
    });
    child.on('error', reject);
    setTimeout(() => {
      if (!ready) {
        ready = true;
        clearTimeout(timer);
        resolve(child);
      }
    }, 500);
  });
}

async function waitAppReady(page) {
  await page.waitForFunction(() => window.__medisaAppReady === true || window.__medisaAppReadyAt, {
    timeout: 120000,
  });
  await page.waitForFunction(() => typeof window.openVehicleDocumentModal === 'function', {
    timeout: 120000,
  });
}

async function main() {
  await mkdir(ARTIFACT_DIR, { recursive: true });
  const php = process.env.MEDISA_USE_EXISTING_SERVER === '1' ? null : await startPhpServer();
  const token = await loginToken();

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript((tok) => {
    window.localStorage.setItem('medisa_portal_token', tok);
    window.sessionStorage.setItem('medisa_portal_token', tok);
  }, token);

  const page = await context.newPage();
  page.setDefaultTimeout(120000);
  await page.goto(`${BASE_URL}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.click('[data-medisa-shell-intent="open-tasitlar"]');
  await waitAppReady(page);

  await page.evaluate(
    ({ vehicleId, docType }) => window.openVehicleDocumentModal(vehicleId, docType),
    { vehicleId: VEHICLE_ID, docType: 'ruhsat' }
  );
  await page.waitForSelector('#dinamik-olay-modal.active .ruhsat-download-btn');

  await page.locator('#dinamik-olay-modal.active').screenshot({
    path: path.join(ARTIFACT_DIR, 'modal-ruhsat-present-wide-before-hover.png'),
  });

  const presentControls = [
    { label: 'download', selector: '#dinamik-olay-modal.active .ruhsat-download-btn' },
    { label: 'preview-present', selector: '#dinamik-olay-modal.active .ruhsat-preview-link.document-presence--present' },
    { label: 'add', selector: '#dinamik-olay-modal.active .ruhsat-add-btn' },
    { label: 'remove', selector: '#dinamik-olay-modal.active .ruhsat-remove-btn' },
    { label: 'vazgec', selector: '#dinamik-olay-modal.active #ruhsat-btn-group .universal-btn-cancel' },
  ];

  const failures = [];
  for (const c of presentControls) {
    const { before, after } = await hoverCapture(page, c.label, c.selector, false);
    const paintKeys =
      c.label === 'vazgec'
        ? ['boxShadow', 'outlineWidth', 'filter']
        : ['color', 'backgroundColor', 'borderTopWidth', 'borderTopColor', 'boxShadow', 'outlineWidth', 'filter'];
    if (!paintKeys.every((k) => before[k] === after[k])) {
      failures.push(`${c.label}: unexpected paint change ${JSON.stringify({ before, after })}`);
    }
    const grew = after.transform !== before.transform || after.scale !== before.scale;
    if (!grew) failures.push(`${c.label}: no scale/transform growth`);
    if (c.label === 'vazgec' && before.borderTopWidth === '0px') {
      failures.push('vazgec: normal state border missing');
    }
  }

  await page.evaluate(
    ({ vehicleId }) => window.openVehicleDocumentModal(vehicleId, 'kasko'),
    { vehicleId: VEHICLE_ID }
  );
  await page.waitForSelector('#dinamik-olay-modal.active .ruhsat-select-box');
  await page.locator('#dinamik-olay-modal.active').screenshot({
    path: path.join(ARTIFACT_DIR, 'modal-kasko-missing-wide-before-hover.png'),
  });

  const missingControls = [
    { label: 'missing-upload-plus', selector: '#dinamik-olay-modal.active .medisa-doc-status-row .ruhsat-select-box' },
    { label: 'calendar', selector: '#dinamik-olay-modal.active .ruhsat-policy-date-stack .olay-date-mobile-btn' },
  ];
  for (const c of missingControls) {
    const { before, after } = await hoverCapture(page, c.label, c.selector, false);
    const paintKeys = ['color', 'backgroundColor', 'borderTopWidth', 'borderTopColor', 'boxShadow', 'outlineWidth', 'filter'];
    if (!paintKeys.every((k) => before[k] === after[k])) {
      failures.push(`${c.label}: unexpected paint change`);
    }
    const grew = after.transform !== before.transform || after.scale !== before.scale;
    if (!grew) failures.push(`${c.label}: no scale/transform growth`);
  }

  await page.evaluate(
    ({ vehicleId }) => window.openEventModal('bakim', vehicleId),
    { vehicleId: VEHICLE_ID }
  );
  await page.waitForSelector('#dinamik-olay-modal.active #ruhsat-btn-group.olay-form-buttons .universal-btn-cancel');
  await hoverCapture(
    page,
    'reference-bakim-cancel',
    '#dinamik-olay-modal.active #ruhsat-btn-group.olay-form-buttons .universal-btn-cancel',
    false
  );

  await browser.close();
  if (php) php.kill('SIGTERM');

  if (failures.length) {
    console.error('FAIL real-app hover acceptance:\n' + failures.join('\n'));
    process.exit(1);
  }
  console.log('PASS real-app document modal hover acceptance');
  console.log('Artifacts:', ARTIFACT_DIR);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
