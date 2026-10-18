#!/usr/bin/env node
/**
 * Kasko belge yükleme modalı — Vazgeç hover kanıtı (1440 + 390, normal + reduced-motion).
 * Env: VAZGEC_HOVER_PHASE=before|after, MEDISA_BASE_URL, MEDISA_USE_EXISTING_SERVER=1
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.MEDISA_ROOT || path.resolve(__dirname, '..');
const PHASE = process.env.VAZGEC_HOVER_PHASE || 'after';
const ARTIFACT_ROOT = '/opt/cursor/artifacts/vazgec-hover';
const BASE_URL = process.env.MEDISA_BASE_URL || 'http://127.0.0.1:8765';
const VEHICLE_ID = 'veh-doc-hover-1';
const VAZGEC_SEL = '#dinamik-olay-modal.active #ruhsat-btn-group .universal-btn-cancel';

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
    const markReady = () => {
      if (!ready) {
        ready = true;
        clearTimeout(timer);
        resolve(child);
      }
    };
    child.stderr.on('data', (buf) => {
      if (String(buf).includes('Development Server')) markReady();
    });
    child.on('error', reject);
    setTimeout(markReady, 600);
  });
}

async function loginToken() {
  const res = await fetch(`${BASE_URL}/driver/driver_login.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'doc_hover_gm', password: 'TestPass123!' }),
  });
  const json = await res.json();
  if (!json?.success || !json.token) throw new Error('Login failed: ' + JSON.stringify(json));
  return json.token;
}

async function waitAppReady(page) {
  await page.waitForFunction(() => window.__medisaAppReady === true || window.__medisaAppReadyAt, {
    timeout: 120000,
  });
  await page.waitForFunction(() => typeof window.openVehicleDocumentModal === 'function', {
    timeout: 120000,
  });
}

async function readBtnState(page) {
  return page.$eval(VAZGEC_SEL, (el) => {
    const cs = getComputedStyle(el);
    return {
      backgroundColor: cs.backgroundColor,
      borderColor: cs.borderColor,
      color: cs.color,
      transform: cs.transform,
      scale: cs.scale,
      classList: Array.from(el.closest('#ruhsat-btn-group')?.classList || []),
    };
  });
}

async function captureScenario(browser, token, { viewport, motionLabel, reducedMotion }) {
  const phaseDir = path.join(ARTIFACT_ROOT, PHASE);
  await mkdir(phaseDir, { recursive: true });
  const vpLabel = `${viewport.width}x${viewport.height}`;
  const prefix = `${vpLabel}-${motionLabel}`;

  const context = await browser.newContext({
    viewport,
    reducedMotion: reducedMotion || undefined,
  });
  await context.addInitScript((tok) => {
    window.localStorage.setItem('medisa_portal_token', tok);
    window.sessionStorage.setItem('medisa_portal_token', tok);
  }, token);

  const page = await context.newPage();
  page.setDefaultTimeout(120000);
  await page.goto(`${BASE_URL}/index.html`, { waitUntil: 'domcontentloaded' });
  if (reducedMotion) {
    await page.emulateMedia({ reducedMotion: 'reduce' });
  }
  await page.click('[data-medisa-shell-intent="open-tasitlar"]');
  await waitAppReady(page);
  await page.evaluate(
    ({ vehicleId }) => window.openVehicleDocumentModal(vehicleId, 'kasko'),
    { vehicleId: VEHICLE_ID }
  );
  await page.waitForSelector(VAZGEC_SEL);

  await page.mouse.move(0, 0);
  await page.waitForTimeout(120);
  const restPath = path.join(phaseDir, `${prefix}-vazgec-rest.png`);
  await page.locator(VAZGEC_SEL).screenshot({ path: restPath });
  const rest = await readBtnState(page);

  const box = await page.locator(VAZGEC_SEL).boundingBox();
  if (!box) throw new Error('Vazgeç box missing');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(220);
  const hoverPath = path.join(phaseDir, `${prefix}-vazgec-hover.png`);
  await page.locator(VAZGEC_SEL).screenshot({ path: hoverPath });
  const hover = await readBtnState(page);

  await context.close();
  return {
    viewport: vpLabel,
    motion: motionLabel,
    restPath,
    hoverPath,
    rest,
    hover,
  };
}

async function main() {
  const phaseDir = path.join(ARTIFACT_ROOT, PHASE);
  await mkdir(phaseDir, { recursive: true });
  const php =
    process.env.MEDISA_USE_EXISTING_SERVER === '1' ? null : await startPhpServer();
  const token = await loginToken();
  const browser = await chromium.launch({ headless: true });
  const rows = [];
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    for (const motion of [
      { motionLabel: 'normal', reducedMotion: undefined },
      { motionLabel: 'reduced-motion', reducedMotion: 'reduce' },
    ]) {
      rows.push(await captureScenario(browser, token, { viewport, ...motion }));
    }
  }
  await browser.close();
  if (php) php.kill('SIGTERM');
  const report = { phase: PHASE, capturedAt: new Date().toISOString(), rows };
  await writeFile(path.join(phaseDir, 'metrics.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
