#!/usr/bin/env node
/**
 * Belge modal tarih çerçevesi — before/after ölçüm ve screenshot (1440 + 390).
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.MEDISA_ROOT || path.resolve(__dirname, '..');
const ARTIFACT_ROOT = process.env.DOC_DATE_ARTIFACT_DIR || '/opt/cursor/artifacts/doc-date-frame';
const PHASE = process.env.DOC_DATE_PHASE || 'after';
const BASE_URL = process.env.MEDISA_BASE_URL || 'http://127.0.0.1:8766';
const VEHICLE_ID = 'veh-doc-hover-1';

function startPhpServer() {
  return new Promise((resolve, reject) => {
    const child = spawn('php', ['-S', '127.0.0.1:8766', '-t', ROOT], {
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

async function measureDateField(page) {
  return page.evaluate(() => {
    const wrap = document.querySelector(
      '#dinamik-olay-modal.active .ruhsat-policy-date-stack .olay-date-mobile-wrap'
    );
    const btn = document.querySelector(
      '#dinamik-olay-modal.active .ruhsat-policy-date-stack .olay-date-mobile-btn'
    );
    const svg = btn?.querySelector('svg');
    const input = document.querySelector(
      '#dinamik-olay-modal.active .ruhsat-policy-date-stack .olay-date-mobile-text'
    );
    const wrapBox = wrap?.getBoundingClientRect();
    const btnBox = btn?.getBoundingClientRect();
    const svgBox = svg?.getBoundingClientRect();
    const wrapCs = wrap ? getComputedStyle(wrap) : null;
    const inputCs = input ? getComputedStyle(input) : null;
    return {
      frameHeight: wrapBox ? Math.round(wrapBox.height * 100) / 100 : null,
      frameWidth: wrapBox ? Math.round(wrapBox.width * 100) / 100 : null,
      iconWidth: svgBox ? Math.round(svgBox.width * 100) / 100 : null,
      iconHeight: svgBox ? Math.round(svgBox.height * 100) / 100 : null,
      btnWidth: btnBox ? Math.round(btnBox.width * 100) / 100 : null,
      btnHeight: btnBox ? Math.round(btnBox.height * 100) / 100 : null,
      wrapBorder: wrapCs ? wrapCs.borderTopWidth : null,
      inputBorder: inputCs ? inputCs.borderTopWidth : null,
    };
  });
}

async function runViewport(browser, token, viewport, phaseDir) {
  const context = await browser.newContext({ viewport });
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
    ({ vehicleId }) => window.openVehicleDocumentModal(vehicleId, 'kasko'),
    { vehicleId: VEHICLE_ID }
  );
  await page.waitForSelector('#dinamik-olay-modal.active .ruhsat-policy-date-stack .olay-date-mobile-wrap');

  const vpLabel = `${viewport.width}x${viewport.height}`;
  const wrapSel = '#dinamik-olay-modal.active .ruhsat-policy-date-stack .olay-date-mobile-wrap';
  const btnSel = '#dinamik-olay-modal.active .ruhsat-policy-date-stack .olay-date-mobile-btn';
  const inputSel = '#dinamik-olay-modal.active .ruhsat-policy-date-stack .olay-date-mobile-text';

  const metrics = await measureDateField(page);
  await page.locator(wrapSel).screenshot({
    path: path.join(phaseDir, `${vpLabel}-date-field-crop.png`),
  });
  await page.locator('#dinamik-olay-modal.active').screenshot({
    path: path.join(phaseDir, `${vpLabel}-modal-full.png`),
  });

  await page.locator(inputSel).focus();
  await page.waitForTimeout(150);
  await page.locator(wrapSel).screenshot({
    path: path.join(phaseDir, `${vpLabel}-date-field-focused.png`),
  });

  const box = await page.locator(btnSel).boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(200);
  }
  await page.locator(wrapSel).screenshot({
    path: path.join(phaseDir, `${vpLabel}-date-field-calendar-hover.png`),
  });

  await context.close();
  return { viewport: vpLabel, ...metrics };
}

async function main() {
  const phaseDir = path.join(ARTIFACT_ROOT, PHASE);
  await mkdir(phaseDir, { recursive: true });
  const php = process.env.MEDISA_USE_EXISTING_SERVER === '1' ? null : await startPhpServer();
  const token = await loginToken();
  const browser = await chromium.launch({ headless: true });
  const results = [];
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    results.push(await runViewport(browser, token, viewport, phaseDir));
  }
  await browser.close();
  if (php) php.kill('SIGTERM');
  const report = { phase: PHASE, capturedAt: new Date().toISOString(), results };
  await writeFile(path.join(phaseDir, 'metrics.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
