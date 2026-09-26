#!/usr/bin/env node
/**
 * Gerçek uygulama belge modal hover acceptance (Playwright + PHP built-in server).
 * 1440px: normal + prefers-reduced-motion: reduce (Windows Animation effects off).
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

const ICON_CONTROLS = [
  { label: 'download', selector: '#dinamik-olay-modal.active .ruhsat-download-btn' },
  { label: 'preview-present', selector: '#dinamik-olay-modal.active .ruhsat-preview-link.document-presence--present' },
  { label: 'add', selector: '#dinamik-olay-modal.active .ruhsat-add-btn' },
  { label: 'remove', selector: '#dinamik-olay-modal.active .ruhsat-remove-btn' },
];

function parseScaleFromState(state) {
  const rawScale = state.scale;
  if (rawScale && rawScale !== 'none') {
    const n = parseFloat(rawScale);
    if (!Number.isNaN(n)) return n;
  }
  const t = state.transform || 'none';
  if (t === 'none') return 1;
  const matrix = t.match(/matrix\(([^)]+)\)/);
  if (matrix) {
    const parts = matrix[1].split(',').map((s) => parseFloat(s.trim()));
    if (parts.length >= 4) {
      const a = parts[0];
      const b = parts[1];
      return Math.hypot(a, b);
    }
  }
  const scaleMatch = t.match(/scale\(([^)]+)\)/);
  if (scaleMatch) {
    const n = parseFloat(scaleMatch[1]);
    if (!Number.isNaN(n)) return n;
  }
  return 1;
}

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

async function hoverCapture(page, label, selector, artifactDir, { wholeModal = false, prefix = '' } = {}) {
  const fileLabel = prefix ? `${prefix}-${label}` : label;
  await page.mouse.move(0, 0);
  await page.waitForTimeout(150);
  const beforePath = path.join(artifactDir, `${fileLabel}-before.png`);
  const afterPath = path.join(artifactDir, `${fileLabel}-after.png`);
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
  return { before, after, beforePath, afterPath, beforeScale: parseScaleFromState(before), afterScale: parseScaleFromState(after) };
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

async function openRuhsatPresentModal(page) {
  await page.evaluate(
    ({ vehicleId, docType }) => window.openVehicleDocumentModal(vehicleId, docType),
    { vehicleId: VEHICLE_ID, docType: 'ruhsat' }
  );
  await page.waitForSelector('#dinamik-olay-modal.active .ruhsat-download-btn');
}

/**
 * @param {import('playwright').Page} page
 * @param {{ runId: string, artifactSubdir: string, saveIconCrops: boolean }} opts
 */
async function runHoverAcceptance(page, opts) {
  const artifactDir = path.join(ARTIFACT_DIR, opts.artifactSubdir);
  await mkdir(artifactDir, { recursive: true });
  const failures = [];
  const scaleReport = {};

  await openRuhsatPresentModal(page);

  for (const c of ICON_CONTROLS) {
    const captureOpts = opts.saveIconCrops ? { prefix: opts.runId } : { prefix: opts.runId };
    const { before, after, beforeScale, afterScale, beforePath, afterPath } = await hoverCapture(
      page,
      c.label,
      c.selector,
      artifactDir,
      { wholeModal: false, ...captureOpts }
    );
    scaleReport[c.label] = {
      before: { transform: before.transform, scale: before.scale, parsedScale: beforeScale },
      after: { transform: after.transform, scale: after.scale, parsedScale: afterScale },
      beforePath: opts.saveIconCrops ? beforePath : undefined,
      afterPath: opts.saveIconCrops ? afterPath : undefined,
    };

    const paintKeys = ['color', 'backgroundColor', 'borderTopWidth', 'borderTopColor', 'boxShadow', 'outlineWidth', 'filter'];
    if (!paintKeys.every((k) => before[k] === after[k])) {
      failures.push(`${opts.runId}/${c.label}: unexpected paint change ${JSON.stringify({ before, after })}`);
    }
    if (afterScale <= 1.001) {
      failures.push(
        `${opts.runId}/${c.label}: scale not > 1 (parsed=${afterScale}, transform=${after.transform}, scale=${after.scale})`
      );
    }
  }

  if (opts.saveIconCrops) {
    const downloadSel = ICON_CONTROLS[0].selector;
    const box = await page.locator(downloadSel).boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(200);
    }
    await page.locator('#dinamik-olay-modal.active').screenshot({
      path: path.join(artifactDir, `${opts.runId}-modal-full-hover-download.png`),
    });
  }

  const vazgecSel = '#dinamik-olay-modal.active #ruhsat-btn-group .universal-btn-cancel';
  const vazgec = await hoverCapture(page, 'vazgec', vazgecSel, artifactDir, { prefix: opts.runId });
  scaleReport.vazgec = {
    after: { transform: vazgec.after.transform, scale: vazgec.after.scale, parsedScale: vazgec.afterScale },
  };
  if (vazgec.afterScale <= 1.001 && vazgec.beforeScale <= 1.001) {
    failures.push(`${opts.runId}/vazgec: no scale growth`);
  }

  await page.evaluate(({ vehicleId }) => window.openVehicleDocumentModal(vehicleId, 'kasko'), {
    vehicleId: VEHICLE_ID,
  });
  await page.waitForSelector('#dinamik-olay-modal.active .ruhsat-select-box');

  const missingControls = [
    { label: 'missing-upload-plus', selector: '#dinamik-olay-modal.active .medisa-doc-status-row .ruhsat-select-box' },
    { label: 'calendar', selector: '#dinamik-olay-modal.active .ruhsat-policy-date-stack .olay-date-mobile-btn' },
  ];
  for (const c of missingControls) {
    const { before, after, beforeScale, afterScale } = await hoverCapture(page, c.label, c.selector, artifactDir, {
      prefix: opts.runId,
    });
    scaleReport[c.label] = {
      before: { transform: before.transform, scale: before.scale, parsedScale: beforeScale },
      after: { transform: after.transform, scale: after.scale, parsedScale: afterScale },
    };
    const paintKeys = ['color', 'backgroundColor', 'borderTopWidth', 'borderTopColor', 'boxShadow', 'outlineWidth', 'filter'];
    if (!paintKeys.every((k) => before[k] === after[k])) {
      failures.push(`${opts.runId}/${c.label}: unexpected paint change`);
    }
    if (afterScale <= 1.001) {
      failures.push(`${opts.runId}/${c.label}: scale not > 1`);
    }
  }

  return { failures, scaleReport };
}

async function main() {
  await mkdir(ARTIFACT_DIR, { recursive: true });
  const php = process.env.MEDISA_USE_EXISTING_SERVER === '1' ? null : await startPhpServer();
  const token = await loginToken();

  const browser = await chromium.launch({ headless: true });
  const allFailures = [];
  const allReports = {};

  for (const scenario of [
    { runId: 'normal', reducedMotion: undefined, artifactSubdir: 'normal', saveIconCrops: false },
    { runId: 'reduced-motion', reducedMotion: 'reduce', artifactSubdir: 'reduced-motion', saveIconCrops: true },
  ]) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      reducedMotion: scenario.reducedMotion,
    });
    await context.addInitScript((tok) => {
      window.localStorage.setItem('medisa_portal_token', tok);
      window.sessionStorage.setItem('medisa_portal_token', tok);
    }, token);

    const page = await context.newPage();
    page.setDefaultTimeout(120000);
    await page.goto(`${BASE_URL}/index.html`, { waitUntil: 'domcontentloaded' });
    if (scenario.reducedMotion) {
      await page.emulateMedia({ reducedMotion: 'reduce' });
    }
    await page.click('[data-medisa-shell-intent="open-tasitlar"]');
    await waitAppReady(page);

    const { failures, scaleReport } = await runHoverAcceptance(page, scenario);
    allFailures.push(...failures);
    allReports[scenario.runId] = scaleReport;
    await context.close();
  }

  await browser.close();
  if (php) php.kill('SIGTERM');

  console.log(JSON.stringify({ scaleReports: allReports }, null, 2));

  if (allFailures.length) {
    console.error('FAIL real-app hover acceptance:\n' + allFailures.join('\n'));
    process.exit(1);
  }
  console.log('PASS real-app document modal hover acceptance (normal + reduced-motion)');
  console.log('Artifacts:', ARTIFACT_DIR);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
