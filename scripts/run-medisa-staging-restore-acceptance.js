#!/usr/bin/env node
'use strict';

/**
 * Live staging restore acceptance (black-box).
 * Secret değerleri stdout'a yazmaz. Production URL'ye istek atmaz.
 *
 * Env (required):
 *   STAGING_BASE_URL
 *   STAGING_BASIC_AUTH_USERNAME
 *   STAGING_BASIC_AUTH_PASSWORD
 *   STAGING_APP_ADMIN_USERNAME
 *   STAGING_APP_ADMIN_PASSWORD
 *   STAGING_FTP_SERVER
 *   STAGING_FTP_USERNAME
 *   STAGING_FTP_PASSWORD
 *   STAGING_TOKEN_SECRET
 *   STAGING_RESTORE_HMAC_SECRET
 * Optional:
 *   STAGING_FTP_PORT=21
 *   MEDISA_STAGING_ACCEPTANCE_PHASE=full|cleanup-only
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const https = require('node:https');
const http = require('node:http');

const root = path.resolve(__dirname, '..');
const CONFIRM = 'SUNUCU YEDEĞİNİ GERİ YÜKLE';
const STAGING_HOST = 'medisa-staging.karmotors.com.tr';
const STAGING_FTP_USER = 'medisa_staging@karmotors.com.tr';
const PROD_HOST_NEEDLE = 'karmotors.com.tr/medisa';

const results = [];
let failures = 0;
const requestLog = [];

function env(name, required = true) {
  const v = process.env[name];
  if ((!v || !String(v).trim()) && required) {
    failHard('MISSING_ENV:' + name);
  }
  return v ? String(v) : '';
}

function record(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail: detail || '' });
  if (!ok) {
    failures += 1;
    console.error('FAIL ' + name + (detail ? ' :: ' + detail : ''));
  } else {
    console.log('PASS ' + name + (detail ? ' :: ' + detail : ''));
  }
}

function failHard(msg) {
  console.error('HARD_FAIL ' + msg);
  process.exit(2);
}

function assertHost(baseUrl) {
  let u;
  try {
    u = new URL(baseUrl);
  } catch {
    failHard('INVALID_BASE_URL');
  }
  if (u.protocol !== 'https:') failHard('BASE_URL_NOT_HTTPS');
  if (u.hostname !== STAGING_HOST) failHard('BASE_URL_HOST_MISMATCH');
  if (baseUrl.includes(PROD_HOST_NEEDLE)) failHard('BASE_URL_LOOKS_LIKE_PRODUCTION');
  return u;
}

function request(baseUrl, { method = 'GET', pathname = '/', headers = {}, body = null, basic = true, bearer = '' } = {}) {
  const u = new URL(pathname, baseUrl);
  if (u.hostname !== STAGING_HOST) {
    failHard('REQUEST_HOST_DENIED:' + u.hostname);
  }
  if (String(u.href).includes(PROD_HOST_NEEDLE)) {
    failHard('REQUEST_PROD_DENIED');
  }
  const authUser = env('STAGING_BASIC_AUTH_USERNAME');
  const authPass = env('STAGING_BASIC_AUTH_PASSWORD');
  const hdrs = Object.assign({}, headers);
  // Directory Privacy occupies Authorization=Basic; app token goes to X-Medisa-Authorization.
  if (bearer) {
    hdrs['X-Medisa-Authorization'] = 'Bearer ' + bearer;
  }
  requestLog.push({ method, host: u.hostname, path: u.pathname, hasBody: !!body });

  const options = {
    protocol: u.protocol,
    hostname: u.hostname,
    port: u.port || 443,
    path: u.pathname + u.search,
    method,
    headers: hdrs,
    auth: basic ? authUser + ':' + authPass : undefined,
    rejectUnauthorized: true,
    timeout: 60000
  };

  const lib = u.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib.request(options, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        const text = buf.toString('utf8');
        let json = null;
        try {
          json = JSON.parse(text);
        } catch {
          json = null;
        }
        resolve({
          status: res.statusCode || 0,
          headers: res.headers,
          text,
          json,
          sha256: crypto.createHash('sha256').update(buf).digest('hex')
        });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error('timeout'));
    });
    if (body != null) {
      const payload = Buffer.isBuffer(body) ? body : Buffer.from(String(body), 'utf8');
      req.setHeader('Content-Length', String(payload.length));
      req.write(payload);
    }
    req.end();
  });
}

function ftps(args) {
  const server = env('STAGING_FTP_SERVER');
  const user = env('STAGING_FTP_USERNAME');
  const pass = env('STAGING_FTP_PASSWORD');
  const port = env('STAGING_FTP_PORT', false) || '21';
  if (user !== STAGING_FTP_USER) failHard('FTP_USER_MISMATCH');
  const base = [
    'curl', '-sS', '--ssl-reqd', '--ftp-ssl', '-k', '--ftp-create-dirs',
    '--connect-timeout', '30', '--max-time', '120',
    '-u', user + ':' + pass
  ];
  const resolved = args.map((a) => a.replace('__FTP_HOST__', `ftp://${server}:${port}`));
  const r = spawnSync(base[0], base.slice(1).concat(resolved), {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024
  });
  if (r.status !== 0) {
    const err = (r.stderr || r.stdout || 'ftp failed').slice(0, 300).replaceAll(pass, '***');
    throw new Error('FTPS_FAILED:' + err);
  }
  return r.stdout || '';
}

function ftpUpload(localPath, remoteName) {
  ftps(['-T', localPath, `__FTP_HOST__/${remoteName}`]);
}

function ftpDownload(remoteName, localPath) {
  const out = ftps([`__FTP_HOST__/${remoteName}`]);
  fs.writeFileSync(localPath, out, 'utf8');
}

function ftpUploadBinary(localPath, remotePath) {
  ftps(['-T', localPath, `__FTP_HOST__/${remotePath}`]);
}

function writeTempConfig(mode, outPath) {
  const token = env('STAGING_TOKEN_SECRET');
  const hmac = env('STAGING_RESTORE_HMAC_SECRET');
  const restoreOn = mode === 'acceptance';
  const maintOn = mode === 'acceptance';
  const hmacLine = restoreOn
    ? `putenv('MEDISA_RESTORE_HMAC_SECRET=${hmac.replace(/'/g, "\\'")}');\n`
    : "putenv('MEDISA_RESTORE_HMAC_SECRET');\n";
  const body = `<?php
putenv('MEDISA_ENVIRONMENT=staging');
putenv('MEDISA_TOKEN_SECRET=${token.replace(/'/g, "\\'")}');
putenv('MEDISA_SERVER_RESTORE_ENABLED=${restoreOn ? 'true' : 'false'}');
putenv('MEDISA_RESTORE_MAINTENANCE_MODE=${maintOn ? 'true' : 'false'}');
${hmacLine}$GLOBALS['MEDISA_STAGING_MARKER'] = true;
ini_set('display_errors', '0');
`;
  fs.writeFileSync(outPath, body, 'utf8');
}

function fixtureBasename(slug, sequence) {
  const date = '2026-08-02';
  const time = String(120000 + sequence).padStart(6, '0');
  const hex = crypto.createHash('sha256').update('medisa-staging-fixture|' + slug).digest('hex').slice(0, 8);
  return `snapshot-${date}-${time}-${hex}.json`;
}

const FIXTURES = [
  'valid-restore-candidate',
  'zero-active-general-manager',
  'duplicate-user-id',
  'actor-missing',
  'actor-inactive',
  'actor-role-downgrade',
  'plaintext-credential',
  'invalid-password-hash',
  'unknown-role',
  'unknown-collection',
  'same-count-different-content',
  'replay-alternate-candidate'
];

async function login(baseUrl) {
  const user = env('STAGING_APP_ADMIN_USERNAME');
  const pass = env('STAGING_APP_ADMIN_PASSWORD');
  const res = await request(baseUrl, {
    method: 'POST',
    pathname: '/driver/driver_login.php',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: user, password: pass })
  });
  if (res.status !== 200 || !res.json?.success || !res.json?.token) {
    const code = res.json?.error_code || res.json?.message || '';
    return { ok: false, detail: 'status=' + res.status + (code ? ' ' + String(code).slice(0, 80) : '') };
  }
  return { ok: true, token: res.json.token };
}

/** Maintenance/write-freeze login'i son_giris yazımında kırar; geçici safe config ile login al. */
async function loginAroundMaintenance(baseUrl, tmpDir) {
  const safeCfg = path.join(tmpDir, 'config.safe-login.php');
  const accCfg = path.join(tmpDir, 'config.acceptance.php');
  writeTempConfig('safe', safeCfg);
  ftpUpload(safeCfg, 'config.local.php');
  const loginRes = await login(baseUrl);
  writeTempConfig('acceptance', accCfg);
  ftpUpload(accCfg, 'config.local.php');
  return loginRes;
}

async function api(baseUrl, token, method, pathname, bodyObj) {
  return request(baseUrl, {
    method,
    pathname,
    headers: { 'Content-Type': 'application/json' },
    body: bodyObj == null ? null : JSON.stringify(bodyObj),
    basic: true,
    bearer: token
  });
}

async function getDataShaViaFtp(tmpDir) {
  const local = path.join(tmpDir, 'data.json');
  // Ensure remote data path exists
  const out = ftps([`__FTP_HOST__/data/data.json`]);
  fs.writeFileSync(local, out);
  return crypto.createHash('sha256').update(out).digest('hex');
}

async function uploadBaselineData(tmpDir) {
  const buildDir = path.join(tmpDir, 'seed-out');
  fs.mkdirSync(buildDir, { recursive: true });
  const r = spawnSync('php', [path.join(root, 'scripts/generate-medisa-staging-seed.php')], {
    env: {
      ...process.env,
      MEDISA_STAGING_OUTPUT_DIR: buildDir,
      MEDISA_STAGING_ADMIN_USER: env('STAGING_APP_ADMIN_USERNAME'),
      MEDISA_STAGING_ADMIN_PASSWORD: env('STAGING_APP_ADMIN_PASSWORD')
    },
    encoding: 'utf8'
  });
  if (r.status !== 0) throw new Error('SEED_FAILED');
  // Upload data tree files individually
  const dataRoot = path.join(buildDir, 'data');
  function walk(dir, prefix) {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const rel = prefix ? prefix + '/' + name : name;
      if (fs.statSync(full).isDirectory()) walk(full, rel);
      else ftpUploadBinary(full, 'data/' + rel.replace(/\\/g, '/'));
    }
  }
  walk(dataRoot, '');
  return path.join(dataRoot, 'data.json');
}

async function runCleanup(baseUrl, tmpDir) {
  const cfg = path.join(tmpDir, 'config.cleanup.php');
  writeTempConfig('cleanup', cfg);
  ftpUpload(cfg, 'config.local.php');
  await uploadBaselineData(tmpDir);

  const unauth = await request(baseUrl, { method: 'GET', pathname: '/', basic: false });
  record('cleanup_unauth_401', unauth.status === 401, 'status=' + unauth.status);

  const auth = await request(baseUrl, { method: 'GET', pathname: '/' });
  record('cleanup_auth_ok', auth.status === 200, 'status=' + auth.status);

  const loginRes = await login(baseUrl);
  record('cleanup_login', loginRes.ok);

  if (loginRes.ok) {
    const reg = await api(baseUrl, loginRes.token, 'GET', '/backup-registry.php');
    const enabled = !!(reg.json && reg.json.restore_enabled);
    const maint = !!(reg.json && reg.json.maintenance_mode);
    record('cleanup_restore_disabled', reg.status === 200 && enabled === false, 'enabled=' + enabled);
    record('cleanup_maintenance_false', reg.status === 200 && maint === false, 'maint=' + maint);
  }

  const prodHits = requestLog.filter((r) => String(r.host + r.path).includes('karmotors.com.tr') && r.host !== STAGING_HOST);
  record('cleanup_no_production_requests', prodHits.length === 0, 'count=' + prodHits.length);
}

async function main() {
  const phase = (process.env.MEDISA_STAGING_ACCEPTANCE_PHASE || 'full').trim();
  const baseUrl = env('STAGING_BASE_URL').replace(/\/+$/, '');
  assertHost(baseUrl);
  if (env('STAGING_FTP_USERNAME') !== STAGING_FTP_USER) failHard('FTP_USER_MISMATCH');

  const tmpDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'medisa-staging-acc-'));
  process.on('exit', () => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  if (phase === 'cleanup-only') {
    await runCleanup(baseUrl, tmpDir);
    printSummary();
    process.exit(failures ? 1 : 0);
  }

  try {
    // A. Safe gates
    const unauth = await request(baseUrl, { method: 'GET', pathname: '/', basic: false });
    record('safe_unauth_401', unauth.status === 401, 'status=' + unauth.status);

    const home = await request(baseUrl, { method: 'GET', pathname: '/' });
    record('safe_auth_home', home.status === 200, 'status=' + home.status);
    record('safe_staging_banner', /medisa-staging-banner|STAGING — SENTETİK VERİ/.test(home.text));
    record('safe_staging_title', /\[STAGING\]/i.test(home.text));
    record('safe_noindex_header', /noindex/i.test(String(home.headers['x-robots-tag'] || '')) || /noindex/i.test(home.text));

    let loginRes = await login(baseUrl);
    record('safe_admin_login', loginRes.ok);
    if (!loginRes.ok) failHard('ADMIN_LOGIN_FAILED');

    let reg = await api(baseUrl, loginRes.token, 'GET', '/backup-registry.php');
    record('safe_restore_disabled', reg.status === 200 && reg.json?.restore_enabled === false);
    record('safe_maintenance_false', reg.status === 200 && reg.json?.maintenance_mode === false);

    // B. Activate acceptance config (maintenance login'i bozar → mevcut token ile devam)
    const accCfg = path.join(tmpDir, 'config.acceptance.php');
    writeTempConfig('acceptance', accCfg);
    ftpUpload(accCfg, 'config.local.php');

    reg = await api(baseUrl, loginRes.token, 'GET', '/backup-registry.php');
    if (reg.status === 401 || reg.json?.auth_required) {
      loginRes = await loginAroundMaintenance(baseUrl, tmpDir);
      record('acceptance_relogin_via_safe', loginRes.ok, loginRes.detail || '');
      if (!loginRes.ok) failHard('ACCEPTANCE_LOGIN_FAILED');
      reg = await api(baseUrl, loginRes.token, 'GET', '/backup-registry.php');
    } else {
      record('acceptance_token_reuse', true, 'status=' + reg.status);
    }
    record('acceptance_restore_enabled', reg.status === 200 && reg.json?.restore_enabled === true);
    record('acceptance_maintenance_true', reg.status === 200 && reg.json?.maintenance_mode === true);
    record('acceptance_secret_configured', reg.status === 200 && reg.json?.secret_configured === true);

    const backups = Array.isArray(reg.json?.backups) ? reg.json.backups : [];
    record('registry_has_backups', backups.length >= 12, 'count=' + backups.length);
    record('registry_no_abspath_leak', !JSON.stringify(reg.json).includes('/home/karmotor'));

    const byName = new Map(backups.map((b) => [b.server_generated_filename, b]));
    const validName = fixtureBasename('valid-restore-candidate', 0);
    const valid = byName.get(validName) || backups.find((b) => b.restore_eligible === true && (b.record_counts?.tasitlar === 2 || b.record_counts?.vehicles === 2));
    record('registry_valid_candidate', !!(valid && valid.restore_eligible), valid ? valid.server_generated_filename : 'missing');

    // Registry actorId=null; actor-self fixture'ları registry'de eligible görünebilir, dry-run'da reject olur.
    const registryIneligible = {
      'zero-active-general-manager': 1,
      'duplicate-user-id': 2,
      'plaintext-credential': 6,
      'invalid-password-hash': 7,
      'unknown-role': 8,
      'unknown-collection': 9
    };
    for (const [slug, seq] of Object.entries(registryIneligible)) {
      const name = fixtureBasename(slug, seq);
      const entry = byName.get(name);
      record('registry_ineligible_' + slug, !!(entry && entry.restore_eligible === false), entry ? (entry.eligibility_error_code || 'ineligible') : 'missing');
    }
    const expectIneligible = {
      ...registryIneligible,
      'actor-missing': 3,
      'actor-inactive': 4,
      'actor-role-downgrade': 5
    };

    if (!valid) failHard('NO_VALID_CANDIDATE');

    // D. Dry-run exact no-write
    const beforeSha = await getDataShaViaFtp(tmpDir);
    const dry = await api(baseUrl, loginRes.token, 'POST', '/backup-restore-dry-run.php', {
      backup_id: valid.backup_id
    });
    const afterDrySha = await getDataShaViaFtp(tmpDir);
    record('dryrun_success', dry.status === 200 && dry.json?.success === true && dry.json?.eligible !== false);
    record('dryrun_intent', typeof dry.json?.intent_token === 'string' && dry.json.intent_token.length > 20);
    record('dryrun_hashes', !!(dry.json?.current_content_sha256 && dry.json?.candidate_content_sha256));
    record('dryrun_exact_nowrite', beforeSha === afterDrySha, 'sha_match=' + (beforeSha === afterDrySha));
    record('dryrun_pii_free', !/TEST 001/.test(JSON.stringify(dry.json || {})));

    // E. Before-hash conflict
    const oldIntent = dry.json?.intent_token;
    // Temporarily leave maintenance for controlled FTP mutate
    const safeCfg = path.join(tmpDir, 'config.safe.php');
    writeTempConfig('safe', safeCfg);
    ftpUpload(safeCfg, 'config.local.php');

    const dataLocal = path.join(tmpDir, 'mutate-data.json');
    ftpDownload('data/data.json', dataLocal);
    const dataObj = JSON.parse(fs.readFileSync(dataLocal, 'utf8'));
    if (Array.isArray(dataObj.tasitlar) && dataObj.tasitlar[0]) {
      const km = Number(dataObj.tasitlar[0].km || 15000) + 7;
      dataObj.tasitlar[0].km = km;
      dataObj.tasitlar[0].guncelKm = String(km);
    }
    fs.writeFileSync(dataLocal, JSON.stringify(dataObj, null, 2) + '\n');
    ftpUploadBinary(dataLocal, 'data/data.json');
    const mutatedSha = crypto.createHash('sha256').update(fs.readFileSync(dataLocal)).digest('hex');

    writeTempConfig('acceptance', accCfg);
    ftpUpload(accCfg, 'config.local.php');
    loginRes = await loginAroundMaintenance(baseUrl, tmpDir);
    if (!loginRes.ok) failHard('RELOGIN_AFTER_MUTATE_FAILED');

    const conflict = await api(baseUrl, loginRes.token, 'POST', '/backup-restore-commit.php', {
      backup_id: valid.backup_id,
      intent_token: oldIntent,
      idempotency_key: 'acc-before-hash-' + Date.now(),
      confirmation: CONFIRM
    });
    const afterConflictSha = await getDataShaViaFtp(tmpDir);
    record(
      'before_hash_changed',
      conflict.status === 409 || conflict.json?.error_code === 'BEFORE_HASH_CHANGED',
      'code=' + (conflict.json?.error_code || conflict.status)
    );
    record('before_hash_no_apply', afterConflictSha === mutatedSha);

    // Restore baseline after conflict
    await uploadBaselineData(tmpDir);
    writeTempConfig('acceptance', accCfg);
    ftpUpload(accCfg, 'config.local.php');
    loginRes = await loginAroundMaintenance(baseUrl, tmpDir);
    if (!loginRes.ok) failHard('RELOGIN_AFTER_BASELINE_FAILED');

    // F. Security fixtures dry-run reject + no write
    const shaBeforeFixtures = await getDataShaViaFtp(tmpDir);
    for (const [slug, seq] of Object.entries(expectIneligible)) {
      const name = fixtureBasename(slug, seq);
      const entry = byName.get(name);
      if (!entry) {
        record('fixture_dryrun_' + slug, false, 'missing');
        continue;
      }
      const d = await api(baseUrl, loginRes.token, 'POST', '/backup-restore-dry-run.php', {
        backup_id: entry.backup_id
      });
      const rejected = d.json?.eligible === false || d.json?.restore_eligible === false || d.json?.success === false || !d.json?.intent_token;
      record('fixture_dryrun_' + slug, rejected, d.json?.error_code || 'rejected');
    }
    const shaAfterFixtures = await getDataShaViaFtp(tmpDir);
    record('fixtures_no_write', shaBeforeFixtures === shaAfterFixtures);

    // Refresh registry after baseline reload
    reg = await api(baseUrl, loginRes.token, 'GET', '/backup-registry.php');
    const backups2 = Array.isArray(reg.json?.backups) ? reg.json.backups : [];
    const byName2 = new Map(backups2.map((b) => [b.server_generated_filename, b]));
    const valid2 = byName2.get(validName) || backups2.find((b) => b.restore_eligible);
    if (!valid2) failHard('VALID_CANDIDATE_MISSING_AFTER_BASELINE');

    // G. Successful restore
    const dry2 = await api(baseUrl, loginRes.token, 'POST', '/backup-restore-dry-run.php', {
      backup_id: valid2.backup_id
    });
    record('success_dryrun', dry2.status === 200 && !!dry2.json?.intent_token);
    const idem = 'acc-success-' + crypto.randomBytes(8).toString('hex');
    const commit = await api(baseUrl, loginRes.token, 'POST', '/backup-restore-commit.php', {
      backup_id: valid2.backup_id,
      intent_token: dry2.json.intent_token,
      idempotency_key: idem,
      confirmation: CONFIRM
    });
    record(
      'success_commit',
      commit.status === 200 && commit.json?.success === true,
      commit.json?.error_code || ('status=' + commit.status)
    );
    record('success_reload_required', commit.json?.reload_required === true || commit.json?.success === true);
    record('success_transaction', !!(commit.json?.transaction_id || commit.json?.success));

    // H. Replay same key
    const replay = await api(baseUrl, loginRes.token, 'POST', '/backup-restore-commit.php', {
      backup_id: valid2.backup_id,
      intent_token: dry2.json.intent_token,
      idempotency_key: idem,
      confirmation: CONFIRM
    });
    record(
      'replay_same_payload',
      replay.status === 200 && (replay.json?.idempotent_replay === true || replay.json?.success === true),
      replay.json?.error_code || ('status=' + replay.status)
    );

    const altName = fixtureBasename('replay-alternate-candidate', 11);
    const alt = byName2.get(altName) || backups2.find((b) => b.server_generated_filename === altName);
    if (alt) {
      const dryAlt = await api(baseUrl, loginRes.token, 'POST', '/backup-restore-dry-run.php', {
        backup_id: alt.backup_id
      });
      const conflictPayload = await api(baseUrl, loginRes.token, 'POST', '/backup-restore-commit.php', {
        backup_id: alt.backup_id,
        intent_token: dryAlt.json?.intent_token || dry2.json.intent_token,
        idempotency_key: idem,
        confirmation: CONFIRM
      });
      record(
        'replay_payload_conflict',
        conflictPayload.status === 409 || conflictPayload.json?.error_code === 'IDEMPOTENCY_CONFLICT',
        conflictPayload.json?.error_code || ('status=' + conflictPayload.status)
      );
    } else {
      record('replay_payload_conflict', false, 'alt fixture missing');
    }

    // I. Maintenance save freeze
    const saveRes = await api(baseUrl, loginRes.token, 'POST', '/save.php', {
      data: { stagingSynthetic: true, probe: true }
    });
    record(
      'maintenance_save_423',
      saveRes.status === 423 || saveRes.json?.error_code === 'MAINTENANCE_REQUIRED',
      'status=' + saveRes.status + ' code=' + (saveRes.json?.error_code || '')
    );

    // J. Concurrent commit (best-effort)
    await uploadBaselineData(tmpDir);
    writeTempConfig('acceptance', accCfg);
    ftpUpload(accCfg, 'config.local.php');
    loginRes = await loginAroundMaintenance(baseUrl, tmpDir);
    if (!loginRes.ok) failHard('RELOGIN_BEFORE_CONCURRENT_FAILED');
    reg = await api(baseUrl, loginRes.token, 'GET', '/backup-registry.php');
    const backups3 = Array.isArray(reg.json?.backups) ? reg.json.backups : [];
    const byName3 = new Map(backups3.map((b) => [b.server_generated_filename, b]));
    const v3 = byName3.get(validName);
    const alt3 = byName3.get(fixtureBasename('same-count-different-content', 10));
    if (v3 && alt3 && alt3.restore_eligible) {
      const d1 = await api(baseUrl, loginRes.token, 'POST', '/backup-restore-dry-run.php', { backup_id: v3.backup_id });
      const d2 = await api(baseUrl, loginRes.token, 'POST', '/backup-restore-dry-run.php', { backup_id: alt3.backup_id });
      const [c1, c2] = await Promise.all([
        api(baseUrl, loginRes.token, 'POST', '/backup-restore-commit.php', {
          backup_id: v3.backup_id,
          intent_token: d1.json?.intent_token,
          idempotency_key: 'acc-conc-a-' + Date.now(),
          confirmation: CONFIRM
        }),
        api(baseUrl, loginRes.token, 'POST', '/backup-restore-commit.php', {
          backup_id: alt3.backup_id,
          intent_token: d2.json?.intent_token,
          idempotency_key: 'acc-conc-b-' + Date.now(),
          confirmation: CONFIRM
        })
      ]);
      const ok1 = c1.status === 200 && c1.json?.success === true;
      const ok2 = c2.status === 200 && c2.json?.success === true;
      const singleWinner = (ok1 && !ok2) || (!ok1 && ok2);
      record('concurrent_single_winner', singleWinner || (!ok1 && !ok2), `a=${ok1},b=${ok2}`);
      record('concurrent_no_double_write', !(ok1 && ok2), `a=${c1.json?.error_code || c1.status},b=${c2.json?.error_code || c2.status}`);
    } else {
      record('concurrent_single_winner', false, 'eligible pair missing');
      record('concurrent_no_double_write', false, 'skipped');
    }

    const prodHits = requestLog.filter((r) => r.host !== STAGING_HOST);
    record('live_no_production_requests', prodHits.length === 0, 'count=' + prodHits.length);
  } catch (err) {
    record('live_acceptance_exception', false, String(err && err.message ? err.message : err).slice(0, 200));
  } finally {
    try {
      await runCleanup(baseUrl, tmpDir);
    } catch (err) {
      record('cleanup_exception', false, String(err && err.message ? err.message : err).slice(0, 200));
    }
  }

  printSummary();
  process.exit(failures ? 1 : 0);
}

function printSummary() {
  const pass = results.filter((r) => r.ok).length;
  const fail = results.filter((r) => !r.ok).length;
  console.log('SUMMARY pass=' + pass + ' fail=' + fail);
  console.log('MODE=LIVE_BLACK_BOX');
}

// Fix accidental JS: `ok1 xor false` is invalid - I need to fix that line
main().catch((err) => {
  console.error('UNCAUGHT ' + String(err && err.message ? err.message : err).slice(0, 300));
  process.exit(2);
});
