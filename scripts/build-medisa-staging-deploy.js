#!/usr/bin/env node
'use strict';

/**
 * Staging temp deploy tree builder.
 * Production source'a banner commit etmez; yalnız çıktı dizininde overlay uygular.
 *
 * Env:
 *   MEDISA_STAGING_OUTPUT_DIR (required)
 *   MEDISA_STAGING_INCLUDE_DATA=true|false
 *   MEDISA_STAGING_CONFIG_MODE=safe|acceptance|cleanup
 *   MEDISA_STAGING_TOKEN_SECRET (required for config)
 *   MEDISA_STAGING_RESTORE_HMAC_SECRET (acceptance)
 *   MEDISA_STAGING_EXISTING_HTACCESS (optional path to preserve Auth block)
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const outDir = process.env.MEDISA_STAGING_OUTPUT_DIR;
const includeData = String(process.env.MEDISA_STAGING_INCLUDE_DATA || 'false') === 'true';
const configMode = process.env.MEDISA_STAGING_CONFIG_MODE || 'safe';
const tokenSecret = process.env.MEDISA_STAGING_TOKEN_SECRET || '';
const hmacSecret = process.env.MEDISA_STAGING_RESTORE_HMAC_SECRET || '';
const existingHtaccess = process.env.MEDISA_STAGING_EXISTING_HTACCESS || '';
const adminUser = process.env.MEDISA_STAGING_ADMIN_USER || 'staging_admin';
const adminPass = process.env.MEDISA_STAGING_ADMIN_PASSWORD || '';

if (!outDir) {
  console.error('MEDISA_STAGING_OUTPUT_DIR required');
  process.exit(1);
}
if (!tokenSecret || tokenSecret.length < 32) {
  console.error('MEDISA_STAGING_TOKEN_SECRET required (>=32)');
  process.exit(1);
}
if (!['safe', 'acceptance', 'cleanup'].includes(configMode)) {
  console.error('Invalid MEDISA_STAGING_CONFIG_MODE');
  process.exit(1);
}

const EXCLUDE_DIR_NAMES = new Set([
  '.git', '.github', '.cursor', '.agents', '.vscode', 'node_modules',
  'docs', 'scripts', 'outputs', 'tmp', '_ux-test-output', 'assets'
]);
function isExcludedDirName(name) {
  if (EXCLUDE_DIR_NAMES.has(name)) return true;
  // Avoid recursive copy of prior local/CI staging trees into themselves.
  if (name.startsWith('.staging-')) return true;
  return false;
}
const EXCLUDE_FILE_NAMES = new Set([
  '.cpanel.yml', '.cursorignore', '.editorconfig', 'AGENTS.md',
  'DEPLOYMENT.md', 'DEVELOPER_REPORT.md', 'README.md', 'package.json',
  'package-lock.json', 'config.local.php'
]);

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function shouldCopy(relPosix) {
  const parts = relPosix.split('/');
  if (parts.some((p) => EXCLUDE_DIR_NAMES.has(p))) return false;
  if (EXCLUDE_FILE_NAMES.has(parts[parts.length - 1])) return false;
  if (relPosix.endsWith('.zip')) return false;
  if (relPosix.startsWith('data/') && !includeData) return false;
  if (relPosix === 'data' && !includeData) return false;
  return true;
}

function walkCopy(srcRoot, destRoot) {
  const stack = [''];
  let count = 0;
  while (stack.length) {
    const rel = stack.pop();
    const src = path.join(srcRoot, rel);
    const st = fs.statSync(src);
    const relPosix = rel.split(path.sep).join('/');
    if (st.isDirectory()) {
      if (rel && !shouldCopy(relPosix + '/x')) continue;
      if (rel) ensureDir(path.join(destRoot, rel));
      for (const name of fs.readdirSync(src)) {
        if (!rel && isExcludedDirName(name)) continue;
        if (isExcludedDirName(name)) continue;
        stack.push(path.join(rel, name));
      }
      continue;
    }
    if (!shouldCopy(relPosix)) continue;
    const dest = path.join(destRoot, rel);
    ensureDir(path.dirname(dest));
    fs.copyFileSync(src, dest);
    count += 1;
  }
  return count;
}

function extractAuthBlock(htaccessText) {
  if (!htaccessText) return '';
  const lines = htaccessText.split(/\r?\n/);
  const keep = [];
  let inAuth = false;
  for (const line of lines) {
    if (/AuthType|AuthName|AuthUserFile|Require\s+valid-user|Directory Privacy|#\s*protected/i.test(line)) {
      inAuth = true;
    }
    if (inAuth) {
      keep.push(line);
      if (/Require\s+valid-user/i.test(line)) {
        // keep a couple trailing blank/comment lines then stop at blank after require
        inAuth = 'ending';
      } else if (inAuth === 'ending' && line.trim() === '') {
        break;
      }
    }
  }
  // Fallback: grab contiguous Auth* block
  if (!keep.length) {
    const m = htaccessText.match(/([\s\S]*?(?:AuthType[\s\S]*?Require\s+valid-user[^\n]*))/i);
    return m ? m[1].trim() + '\n' : '';
  }
  const block = keep.join('\n').trim() + '\n';
  if (/AuthUserFile\s+.*public_html\/medisa(?!-staging)/i.test(block)) {
    throw new Error('AuthUserFile points at production path');
  }
  if (!/AuthUserFile/i.test(block) || !/Require\s+valid-user/i.test(block)) {
    throw new Error('Directory Privacy Auth block incomplete');
  }
  return block;
}

function buildHtaccess(baseHtaccess, authBlock) {
  const https = [
    '<IfModule mod_rewrite.c>',
    '  RewriteEngine On',
    '  RewriteCond %{HTTPS} !=on',
    '  RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]',
    '</IfModule>',
    ''
  ].join('\n');
  const headers = [
    '<IfModule mod_headers.c>',
    '  Header always set X-Robots-Tag "noindex, nofollow, noarchive"',
    '</IfModule>',
    'Options -Indexes',
    ''
  ].join('\n');
  // Avoid duplicating RewriteEngine conflict: prepend HTTPS before base rewrites.
  return [
    '# MEDISA STAGING — generated deploy tree overlay',
    authBlock.trim(),
    '',
    https,
    headers,
    baseHtaccess.replace(/^# MEDISA[\s\S]*?\n/, '')
  ].join('\n');
}

function rewriteProductionUrls(html) {
  return String(html).split('https://karmotors.com.tr/medisa').join('https://medisa-staging.karmotors.com.tr');
}

function injectBanner(html) {
  let out = rewriteProductionUrls(html);
  out = out.replace(/<title>([\s\S]*?)<\/title>/i, (m, t) => {
    const text = String(t).trim();
    if (text.startsWith('[STAGING]')) return `<title>${text}</title>`;
    return `<title>[STAGING] ${text}</title>`;
  });
  if (!/medisa-staging-banner/.test(out)) {
    const banner = [
      '<div id="medisa-staging-banner" role="status" style="position:sticky;top:0;z-index:99999;background:#7a1f1f;color:#fff;text-align:center;padding:8px 12px;font:600 13px/1.3 system-ui,sans-serif;">',
      'STAGING — SENTETİK VERİ — PRODUCTION DEĞİL',
      '</div>'
    ].join('');
    if (/<body[^>]*>/i.test(out)) {
      out = out.replace(/<body([^>]*)>/i, `<body$1>${banner}`);
    }
  }
  // Directory Privacy Basic Auth, fetch Authorization: Bearer ile çakışır.
  // Staging shell: Bearer'ı X-Medisa-Authorization'a taşı, Basic için credentials include.
  if (!/medisa-staging-auth-shim/.test(out)) {
    const shim = [
      '<script id="medisa-staging-auth-shim">',
      '(function(){',
      'if(window.__medisaStagingAuthShim)return;window.__medisaStagingAuthShim=1;',
      'var o=window.fetch;',
      'window.fetch=function(i,n){n=n||{};n.credentials=n.credentials||"include";',
      'try{var h=new Headers(n.headers||{});var a=h.get("Authorization");',
      'if(a&&/^Bearer\\s+/i.test(a)){h.set("X-Medisa-Authorization",a);h.delete("Authorization");n.headers=h;}',
      '}catch(e){}return o.call(this,i,n);};',
      '})();',
      '</script>'
    ].join('');
    if (/<head[^>]*>/i.test(out)) {
      out = out.replace(/<head([^>]*)>/i, `<head$1>${shim}`);
    } else if (/<body[^>]*>/i.test(out)) {
      out = out.replace(/<body([^>]*)>/i, `<body$1>${shim}`);
    }
  }
  return out;
}

function writeConfig(mode) {
  const restoreOn = mode === 'acceptance';
  const maintOn = mode === 'acceptance';
  const hmacLine = restoreOn && hmacSecret
    ? `putenv('MEDISA_RESTORE_HMAC_SECRET=${hmacSecret.replace(/'/g, "\\'")}');\n`
    : "putenv('MEDISA_RESTORE_HMAC_SECRET');\n";
  return `<?php
// Generated staging config — do not commit.
putenv('MEDISA_ENVIRONMENT=staging');
putenv('MEDISA_TOKEN_SECRET=${tokenSecret.replace(/'/g, "\\'")}');
putenv('MEDISA_SERVER_RESTORE_ENABLED=${restoreOn ? 'true' : 'false'}');
putenv('MEDISA_RESTORE_MAINTENANCE_MODE=${maintOn ? 'true' : 'false'}');
${hmacLine}$GLOBALS['MEDISA_STAGING_MARKER'] = true;
`;
}

function writeRobots(dest) {
  fs.writeFileSync(path.join(dest, 'robots.txt'), 'User-agent: *\nDisallow: /\n', 'utf8');
}

function patchManifest(filePath, name, shortName) {
  if (!fs.existsSync(filePath)) return;
  const j = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  j.name = name;
  j.short_name = shortName;
  if (j.start_url) j.start_url = './';
  if (j.scope) j.scope = './';
  fs.writeFileSync(filePath, JSON.stringify(j, null, 2) + '\n', 'utf8');
}

function patchServiceWorker(filePath) {
  if (!fs.existsSync(filePath)) return;
  let src = fs.readFileSync(filePath, 'utf8');
  src = src.replace(/medisa-v(\d+)/g, 'medisa-staging-v$1');
  src = src.replace(/medisa-raporlar-/g, 'medisa-staging-raporlar-');
  if (!/STAGING CACHE NAMESPACE/.test(src)) {
    src = '/* STAGING CACHE NAMESPACE */\n' + src;
  }
  fs.writeFileSync(filePath, src, 'utf8');
}

function main() {
  rmrf(outDir);
  ensureDir(outDir);
  const copied = walkCopy(root, outDir);
  console.log('copied_files=' + copied);

  // HTML overlays
  for (const rel of ['index.html', 'driver/index.html', 'driver/dashboard.html', 'admin/driver-report.html']) {
    const p = path.join(outDir, rel);
    if (!fs.existsSync(p)) continue;
    fs.writeFileSync(p, injectBanner(fs.readFileSync(p, 'utf8')), 'utf8');
  }

  patchManifest(path.join(outDir, 'manifest.json'), 'TaşıtMedisa Staging', 'Medisa Staging');
  patchManifest(path.join(outDir, 'driver/manifest.json'), 'TaşıtMedisa Staging', 'Medisa Staging');
  patchManifest(path.join(outDir, 'admin/manifest.json'), 'TaşıtMedisa Staging', 'Medisa Staging');
  patchServiceWorker(path.join(outDir, 'sw.js'));
  writeRobots(outDir);

  const baseHt = fs.readFileSync(path.join(outDir, '.htaccess'), 'utf8');
  let authBlock = '';
  if (existingHtaccess && fs.existsSync(existingHtaccess)) {
    authBlock = extractAuthBlock(fs.readFileSync(existingHtaccess, 'utf8'));
  } else if (/AuthType/i.test(baseHt)) {
    authBlock = extractAuthBlock(baseHt);
  } else {
    console.warn('WARN: no Directory Privacy Auth block found; deploy may drop Basic Auth protection');
  }
  fs.writeFileSync(path.join(outDir, '.htaccess'), buildHtaccess(baseHt, authBlock), 'utf8');

  fs.writeFileSync(path.join(outDir, 'config.local.php'), writeConfig(configMode), 'utf8');

  if (includeData) {
    if (!adminPass) {
      console.error('MEDISA_STAGING_ADMIN_PASSWORD required when INCLUDE_DATA=true');
      process.exit(1);
    }
    const env = {
      ...process.env,
      MEDISA_STAGING_OUTPUT_DIR: outDir,
      MEDISA_STAGING_ADMIN_USER: adminUser,
      MEDISA_STAGING_ADMIN_PASSWORD: adminPass
    };
    const r = spawnSync('php', [path.join(root, 'scripts/generate-medisa-staging-seed.php')], {
      env,
      encoding: 'utf8'
    });
    if (r.status !== 0) {
      console.error(r.stdout || '');
      console.error(r.stderr || '');
      process.exit(r.status || 1);
    }
    console.log((r.stdout || '').trim());
  }

  // Safety: never ship github/scripts/docs
  for (const banned of ['.github', 'scripts', 'docs', '.git']) {
    rmrf(path.join(outDir, banned));
  }
  console.log('staging_deploy_tree_ready=' + outDir);
  console.log('config_mode=' + configMode);
  console.log('include_data=' + includeData);
}

main();
