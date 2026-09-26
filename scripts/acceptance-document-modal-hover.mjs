#!/usr/bin/env node
/**
 * Desktop belge modal hover acceptance (Playwright).
 * Çalıştır: npx playwright install chromium && node scripts/acceptance-document-modal-hover.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.MEDISA_ROOT || path.resolve(__dirname, '..');
const ARTIFACT_DIR = '/opt/cursor/artifacts/document-modal-hover';
const FIXTURE_URL_PATH = '/scripts/fixtures/document-modal-hover-fixture.html';

const CONTROLS = [
  { id: 'btn-download', label: 'download' },
  { id: 'btn-preview', label: 'preview-present' },
  { id: 'btn-add', label: 'add' },
  { id: 'btn-remove', label: 'remove' },
  { id: 'btn-calendar', label: 'calendar' },
  { id: 'btn-missing-upload', label: 'missing-upload-plus' },
  { id: 'btn-cancel', label: 'vazgec' },
];

function mime(filePath) {
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  return 'application/octet-stream';
}

function startStaticServer() {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      try {
        const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
        const safe = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
        const filePath = path.join(ROOT, safe.replace(/^\//, ''));
        if (!filePath.startsWith(ROOT)) {
          res.writeHead(403);
          res.end('Forbidden');
          return;
        }
        const data = await readFile(filePath);
        res.writeHead(200, { 'Content-Type': mime(filePath) });
        res.end(data);
      } catch (err) {
        res.writeHead(404);
        res.end(String(err));
      }
    });
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
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
      outlineColor: cs.outlineColor,
      filter: cs.filter,
      transform: cs.transform,
      scale: cs.scale,
    };
  });
}

async function main() {
  const { server, baseUrl } = await startStaticServer();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await page.goto(baseUrl + FIXTURE_URL_PATH, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--theme-color-rgb', '212, 0, 0');
  });

  const failures = [];

  for (const control of CONTROLS) {
    const selector = `#${control.id}`;
    await page.mouse.move(0, 0);
    await page.waitForTimeout(120);
    const beforePath = path.join(ARTIFACT_DIR, `${control.label}-before.png`);
    const afterPath = path.join(ARTIFACT_DIR, `${control.label}-after.png`);
    await page.locator('#ruhsat-modal-content').screenshot({ path: beforePath });
    const before = await readVisualState(page, selector);

    const box = await page.locator(selector).boundingBox();
    if (!box) {
      failures.push(`${control.label}: element box missing`);
      continue;
    }
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(180);
    await page.locator('#ruhsat-modal-content').screenshot({ path: afterPath });
    const after = await readVisualState(page, selector);

    const paintKeys =
      control.label === 'vazgec'
        ? ['boxShadow', 'outlineWidth', 'filter']
        : ['color', 'backgroundColor', 'borderTopWidth', 'borderTopColor', 'boxShadow', 'outlineWidth', 'filter'];
    const samePaint = paintKeys.every((key) => before[key] === after[key]);
    const grew =
      after.transform !== before.transform ||
      after.scale !== before.scale ||
      (after.transform && after.transform !== 'none' && after.transform !== 'matrix(1, 0, 0, 1, 0, 0)');

    if (!samePaint) {
      failures.push(`${control.label}: paint changed on hover ${JSON.stringify({ before, after })}`);
    }
    if (control.label !== 'vazgec' && !grew) {
      failures.push(`${control.label}: no visible scale/transform growth on hover`);
    }
    if (control.label === 'vazgec') {
      const bgChanged = before.backgroundColor !== after.backgroundColor;
      if (!bgChanged || !grew) {
        failures.push(`${control.label}: expected semi-transparent fill + scale on hover`);
      }
    }
  }

  await browser.close();
  server.close();

  if (failures.length) {
    console.error('FAIL document modal hover acceptance:\n' + failures.join('\n'));
    process.exit(1);
  }
  console.log('PASS document modal hover acceptance');
  console.log('Artifacts:', ARTIFACT_DIR);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
