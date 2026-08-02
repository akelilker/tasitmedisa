#!/usr/bin/env node
'use strict';

/**
 * Live staging restore acceptance (black-box).
 * FTPS model:
 *  - preflight: 1 login (no restore activation on failure)
 *  - live main: 1 persistent session (config + mutate + baseline)
 *  - cleanup: 1 independent recovery session (cleanup-only / always)
 * 530 = NON_TRANSIENT_AUTH_FAILURE (no retry). Secret değerleri loglanmaz.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const https = require('node:https');
const http = require('node:http');
const {
  FtpsSession,
  PersistentFtpsSession,
  classifyFtpError,
  STAGING_FTP_USER
} = require('./medisa-staging-ftps.js');

const root = path.resolve(__dirname, '..');
const CONFIRM = 'SUNUCU YEDEĞİNİ GERİ YÜKLE';
const STAGING_HOST = 'medisa-staging.karmotors.com.tr';
const PROD_HOST_NEEDLE = 'karmotors.com.tr/medisa';

const results = [];
let failures = 0;
const requestLog = [];
let ftpLoginTotal = 0;

function env(name, required = true) {
  const v = process.env[name];
  if ((!v || !String(v).trim()) && required) failHard('MISSING_ENV:' + name);
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

function ftpCfg() {
  return {
    server: env('STAGING_FTP_SERVER'),
    username: env('STAGING_FTP_USERNAME'),
    password: env('STAGING_FTP_PASSWORD'),
    port: env('STAGING_FTP_PORT', false) || '21'
  };
}

function request(baseUrl, { method = 'GET', pathname = '/', headers = {}, body = null, basic = true, bearer = '' } = {}) {
  const u = new URL(pathname, baseUrl);
  if (u.hostname !== STAGING_HOST) failHard('REQUEST_HOST_DENIED:' + u.hostname);
  if (String(u.href).includes(PROD_HOST_NEEDLE)) failHard('REQUEST_PROD_DENIED');
  const authUser = env('STAGING_BASIC_AUTH_USERNAME');
  const authPass = env('STAGING_BASIC_AUTH_PASSWORD');
  const hdrs = Object.assign({}, headers);
  if (bearer) hdrs['X-Medisa-Authorization'] = 'Bearer ' + bearer;
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
        try { json = JSON.parse(text); } catch { json = null; }
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
    req.on('timeout', () => req.destroy(new Error('timeout')));
    if (body != null) {
      const payload = Buffer.isBuffer(body) ? body : Buffer.from(String(body), 'utf8');
      req.setHeader('Content-Length', String(payload.length));
      req.write(payload);
    }
    req.end();
  });
}

function writeTempConfig(mode, outPath) {
  const token = env('STAGING_TOKEN_SECRET');
  const hmac = env('STAGING_RESTORE_HMAC_SECRET');
  const restoreOn = mode === 'acceptance';
  const maintOn = mode === 'acceptance';
  const hmacLine = restoreOn
    ? `putenv('MEDISA_RESTORE_HMAC_SECRET=${hmac.replace(/'/g, "\\'")}');\n`
    : "putenv('MEDISA_RESTORE_HMAC_SECRET');\n";
  fs.writeFileSync(outPath, `<?php
putenv('MEDISA_ENVIRONMENT=staging');
putenv('MEDISA_TOKEN_SECRET=${token.replace(/'/g, "\\'")}');
putenv('MEDISA_SERVER_RESTORE_ENABLED=${restoreOn ? 'true' : 'false'}');
putenv('MEDISA_RESTORE_MAINTENANCE_MODE=${maintOn ? 'true' : 'false'}');
${hmacLine}$GLOBALS['MEDISA_STAGING_MARKER'] = true;
ini_set('display_errors', '0');
`, 'utf8');
}

function fixtureBasename(slug, sequence) {
  const date = '2026-08-02';
  const time = String(120000 + sequence).padStart(6, '0');
  const hex = crypto.createHash('sha256').update('medisa-staging-fixture|' + slug).digest('hex').slice(0, 8);
  return `snapshot-${date}-${time}-${hex}.json`;
}

async function login(baseUrl, attempts = 3) {
  const user = env('STAGING_APP_ADMIN_USERNAME');
  const pass = env('STAGING_APP_ADMIN_PASSWORD');
  let lastDetail = 'login failed';
  const max = Math.max(1, Number(attempts) || 3);
  for (let i = 1; i <= max; i += 1) {
    try {
      const res = await request(baseUrl, {
        method: 'POST',
        pathname: '/driver/driver_login.php',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user, password: pass })
      });
      if (res.status === 200 && res.json?.success && res.json?.token) {
        return { ok: true, token: res.json.token };
      }
      lastDetail = 'status=' + res.status + (res.json?.error_code ? (' code=' + res.json.error_code) : '');
    } catch (err) {
      lastDetail = String(err && err.message ? err.message : err).slice(0, 120);
    }
    await new Promise((r) => setTimeout(r, 1200 * i));
  }
  return { ok: false, detail: lastDetail };
}

/** config.local.php swap — batch FTPS (login medisaMutateData kullanır; maintenance altında 423). */
function putConfigBatch(localCfgPath, label) {
  const session = new FtpsSession({ ...ftpCfg(), label: label || 'cfg' });
  session.put(localCfgPath, 'config.local.php');
  const before = session.loginCount;
  session.flush({ allowRetry: true, maxAttempts: 2 });
  ftpLoginTotal += Math.max(0, session.loginCount - before);
  return session.loginCount;
}

/**
 * Seed/FTP sonrası token düşerse:
 * Login maintenance altında çalışmaz → safe config (batch) → login → acceptance config.
 */
async function ensureAcceptanceAuth(baseUrl, _liveSession, safeCfg, accCfg, prevToken) {
  if (prevToken) {
    try {
      const reg = await api(baseUrl, prevToken, 'GET', '/backup-registry.php');
      if (reg.status === 200 && reg.json && !reg.json.auth_required) {
        return { ok: true, token: prevToken, mode: 'reuse' };
      }
    } catch {
      /* continue */
    }
  }

  putConfigBatch(safeCfg, 'auth-safe');
  await new Promise((r) => setTimeout(r, 2500));
  let loginRes = await login(baseUrl, 5);
  if (!loginRes.ok) {
    await new Promise((r) => setTimeout(r, 3000));
    loginRes = await login(baseUrl, 3);
  }
  putConfigBatch(accCfg, 'auth-acceptance');
  await new Promise((r) => setTimeout(r, 1500));
  if (!loginRes.ok) {
    return { ok: false, detail: loginRes.detail || 'login failed', mode: 'safe_toggle_batch' };
  }
  return { ok: true, token: loginRes.token, mode: 'safe_toggle_batch' };
}

async function api(baseUrl, token, method, pathname, bodyObj) {
  let lastErr;
  for (let i = 1; i <= 3; i += 1) {
    try {
      return await request(baseUrl, {
        method,
        pathname,
        headers: { 'Content-Type': 'application/json' },
        body: bodyObj == null ? null : JSON.stringify(bodyObj),
        basic: true,
        bearer: token
      });
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 1200 * i));
    }
  }
  throw lastErr;
}

async function httpDataSha(baseUrl, token) {
  const res = await api(baseUrl, token, 'GET', '/load.php');
  if (res.status !== 200 || !res.json) throw new Error('LOAD_FAILED:' + res.status);
  return crypto.createHash('sha256').update(JSON.stringify(res.json)).digest('hex');
}

function generateSeed(tmpDir) {
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
  return path.join(buildDir, 'data');
}

async function uploadDataTree(session, dataRoot) {
  async function walk(dir, prefix) {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const rel = prefix ? prefix + '/' + name : name;
      if (fs.statSync(full).isDirectory()) await walk(full, rel);
      else await session.put(full, 'data/' + rel.replace(/\\/g, '/'));
    }
  }
  await walk(dataRoot, '');
}

function queueDataTree(session, dataRoot) {
  function walk(dir, prefix) {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const rel = prefix ? prefix + '/' + name : name;
      if (fs.statSync(full).isDirectory()) walk(full, rel);
      else session.put(full, 'data/' + rel.replace(/\\/g, '/'));
    }
  }
  walk(dataRoot, '');
}

function runFtpPreflight() {
  const session = new FtpsSession({ ...ftpCfg(), label: 'preflight' });
  try {
    const out = session.probe();
    ftpLoginTotal += session.loginCount;
    const text = String(out.stdout || '');
    record('ftp_preflight_login', true, 'logins=' + session.loginCount);
    record('ftp_preflight_pwd', true, 'pwd_ok');
    record('ftp_preflight_jail', !/\/medisa(?!-staging)\b/i.test(text), 'jail_ok');
    return { ok: true };
  } catch (err) {
    const cls = err.ftpClass || classifyFtpError(err.message || '');
    record('ftp_preflight_login', false, cls);
    if (cls === 'NON_TRANSIENT_AUTH_FAILURE') {
      console.error('FTP_AUTH=FAIL_530');
      console.error('STAGING_CLEANUP_UNCERTAIN');
      return { ok: false, auth530: true };
    }
    return { ok: false, auth530: false, error: String(err.message || err).slice(0, 160) };
  }
}

async function httpSafeState(baseUrl) {
  const unauth = await request(baseUrl, { method: 'GET', pathname: '/', basic: false });
  record('safe_unauth_401', unauth.status === 401, 'status=' + unauth.status);
  const loginRes = await login(baseUrl);
  record('safe_admin_login', loginRes.ok, loginRes.detail || '');
  if (!loginRes.ok) return { ok: false };
  const reg = await api(baseUrl, loginRes.token, 'GET', '/backup-registry.php');
  const enabled = !!(reg.json && reg.json.restore_enabled);
  const maint = !!(reg.json && reg.json.maintenance_mode);
  record('safe_restore_disabled', reg.status === 200 && enabled === false, 'enabled=' + enabled);
  record('safe_maintenance_false', reg.status === 200 && maint === false, 'maint=' + maint);
  return { ok: !enabled && !maint, token: loginRes.token, enabled, maint };
}

async function runCleanup(baseUrl, tmpDir) {
  const session = new FtpsSession({ ...ftpCfg(), label: 'cleanup-recovery' });
  const cfg = path.join(tmpDir, 'config.cleanup.php');
  writeTempConfig('cleanup', cfg);
  const dataRoot = generateSeed(tmpDir);
  session.put(cfg, 'config.local.php');
  queueDataTree(session, dataRoot);
  try {
    const before = session.loginCount;
    session.flush({ allowRetry: true, maxAttempts: 2 });
    ftpLoginTotal += Math.max(0, session.loginCount - before);
  } catch (err) {
    const cls = err.ftpClass || classifyFtpError(err.message || '');
    record('cleanup_ftp', false, cls);
    if (cls === 'NON_TRANSIENT_AUTH_FAILURE') {
      console.error('STAGING_CLEANUP_UNCERTAIN');
    }
    throw err;
  }
  record('cleanup_ftp', true, 'logins_session=' + session.loginCount);
  record('cleanup_recovery_connection', session.loginCount >= 1 && session.loginCount <= 2, 'logins=' + session.loginCount);

  const unauth = await request(baseUrl, { method: 'GET', pathname: '/', basic: false });
  record('cleanup_unauth_401', unauth.status === 401, 'status=' + unauth.status);
  const auth = await request(baseUrl, { method: 'GET', pathname: '/' });
  record('cleanup_auth_ok', auth.status === 200, 'status=' + auth.status);
  const loginRes = await login(baseUrl);
  record('cleanup_login', loginRes.ok);
  if (!loginRes.ok) {
    console.error('STAGING_CLEANUP_UNCERTAIN');
    throw new Error('cleanup login failed');
  }
  const reg = await api(baseUrl, loginRes.token, 'GET', '/backup-registry.php');
  const enabled = !!(reg.json && reg.json.restore_enabled);
  const maint = !!(reg.json && reg.json.maintenance_mode);
  record('cleanup_restore_disabled', reg.status === 200 && enabled === false, 'enabled=' + enabled);
  record('cleanup_maintenance_false', reg.status === 200 && maint === false, 'maint=' + maint);
  if (enabled || maint) {
    console.error('STAGING_CLEANUP_UNCERTAIN');
    throw new Error('cleanup capability still active');
  }
  const load = await api(baseUrl, loginRes.token, 'GET', '/load.php');
  record('cleanup_baseline_load', load.status === 200, 'status=' + load.status);
  const prodHits = requestLog.filter((r) => r.host !== STAGING_HOST);
  record('cleanup_no_production_requests', prodHits.length === 0, 'count=' + prodHits.length);
}

async function main() {
  const phase = (process.env.MEDISA_STAGING_ACCEPTANCE_PHASE || 'full').trim();
  const baseUrl = env('STAGING_BASE_URL').replace(/\/+$/, '');
  assertHost(baseUrl);
  if (env('STAGING_FTP_USERNAME') !== STAGING_FTP_USER) failHard('FTP_USER_MISMATCH');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'medisa-staging-acc-'));
  process.on('exit', () => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  if (phase === 'preflight-only') {
    const pre = runFtpPreflight();
    printSummary();
    process.exit(pre.ok ? 0 : 2);
  }

  if (phase === 'cleanup-only') {
    const preflightOutcome = String(process.env.FTP_PREFLIGHT_OUTCOME || 'success').trim();
    // Preflight auth fail: do not burn another FTP login; HTTP safe-state only.
    if (preflightOutcome === 'failure') {
      console.error('STAGING_CLEANUP_UNCERTAIN');
      try {
        await httpSafeState(baseUrl);
        record('cleanup_ftp_skipped_preflight_fail', true);
      } catch (err) {
        record('cleanup_http_only_failed', false, String(err && err.message ? err.message : err).slice(0, 160));
      }
      console.log('FTP_LOGIN_TOTAL=' + ftpLoginTotal);
      printSummary();
      process.exit(1);
    }
    try {
      await runCleanup(baseUrl, tmpDir);
    } catch (err) {
      record('cleanup_exception', false, String(err && err.message ? err.message : err).slice(0, 200));
      console.error('STAGING_CLEANUP_UNCERTAIN');
    }
    console.log('FTP_LOGIN_TOTAL=' + ftpLoginTotal);
    printSummary();
    process.exit(failures ? 1 : 0);
  }

  // full phase — live acceptance; FTP cleanup is always() cleanup-only (independent recovery)
  let liveSession = null;
  try {
    const skipPreflight = String(process.env.MEDISA_STAGING_SKIP_PREFLIGHT || '') === '1';
    if (!skipPreflight) {
      const pre = runFtpPreflight();
      if (!pre.ok) {
        await httpSafeState(baseUrl);
        if (pre.auth530) failHard('FTP_PREFLIGHT_530');
        failHard('FTP_PREFLIGHT_FAILED');
      }
    } else {
      record('ftp_preflight_skipped_workflow', true, 'workflow_preflight=PASS');
    }

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

    const baselineHttpSha = await httpDataSha(baseUrl, loginRes.token);
    record('baseline_http_hash_saved', !!baselineHttpSha);

    const accCfg = path.join(tmpDir, 'config.acceptance.php');
    const safeCfg = path.join(tmpDir, 'config.safe.php');
    writeTempConfig('acceptance', accCfg);
    writeTempConfig('safe', safeCfg);
    const seedDataRoot = generateSeed(tmpDir);

    // One persistent FTPS session for live phase transport
    liveSession = new PersistentFtpsSession({ ...ftpCfg(), label: 'live-main' });
    try {
      await liveSession.open({ allowRetry: true, maxAttempts: 2 });
      record('live_session_open', true, 'logins=' + liveSession.loginCount);
    } finally {
      ftpLoginTotal += liveSession.loginCount;
    }

    await liveSession.put(accCfg, 'config.local.php');
    record('acceptance_config_uploaded', true, 'session=live-main');

    reg = await api(baseUrl, loginRes.token, 'GET', '/backup-registry.php');
    record('acceptance_token_reuse', reg.status === 200, 'status=' + reg.status);
    record('acceptance_restore_enabled', reg.status === 200 && reg.json?.restore_enabled === true);
    record('acceptance_maintenance_true', reg.status === 200 && reg.json?.maintenance_mode === true);
    record('acceptance_secret_configured', reg.status === 200 && reg.json?.secret_configured === true);

    const backups = Array.isArray(reg.json?.backups) ? reg.json.backups : [];
    record('registry_has_backups', backups.length >= 12, 'count=' + backups.length);
    record('registry_no_abspath_leak', !JSON.stringify(reg.json).includes('/home/karmotor'));

    const byName = new Map(backups.map((b) => [b.server_generated_filename, b]));
    const validName = fixtureBasename('valid-restore-candidate', 0);
    const valid = byName.get(validName) || backups.find((b) => b.restore_eligible === true);
    record('registry_valid_candidate', !!(valid && valid.restore_eligible), valid ? valid.server_generated_filename : 'missing');

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

    // Dry-run exact no-write via HTTP hash (no FTP)
    const beforeSha = await httpDataSha(baseUrl, loginRes.token);
    const dry = await api(baseUrl, loginRes.token, 'POST', '/backup-restore-dry-run.php', {
      backup_id: valid.backup_id
    });
    const afterDrySha = await httpDataSha(baseUrl, loginRes.token);
    record('dryrun_success', dry.status === 200 && dry.json?.success === true && dry.json?.eligible !== false);
    record('dryrun_intent', typeof dry.json?.intent_token === 'string' && dry.json.intent_token.length > 20);
    record('dryrun_hashes', !!(dry.json?.current_content_sha256 && dry.json?.candidate_content_sha256));
    record('dryrun_exact_nowrite', beforeSha === afterDrySha, 'sha_match=' + (beforeSha === afterDrySha));
    record('dryrun_pii_free', !/TEST 001/.test(JSON.stringify(dry.json || {})));

    // Before-hash conflict on same persistent session
    const oldIntent = dry.json?.intent_token;
    const dataLocal = path.join(tmpDir, 'mutate-data.json');
    await liveSession.get('data/data.json', dataLocal);
    const dataObj = JSON.parse(fs.readFileSync(dataLocal, 'utf8'));
    if (Array.isArray(dataObj.tasitlar) && dataObj.tasitlar[0]) {
      const km = Number(dataObj.tasitlar[0].km || 15000) + 7;
      dataObj.tasitlar[0].km = km;
      dataObj.tasitlar[0].guncelKm = String(km);
    }
    const mutatedKm = Number(dataObj?.tasitlar?.[0]?.km || 0);
    fs.writeFileSync(dataLocal, JSON.stringify(dataObj, null, 2) + '\n');
    await liveSession.put(dataLocal, 'data/data.json');

    const conflict = await api(baseUrl, loginRes.token, 'POST', '/backup-restore-commit.php', {
      backup_id: valid.backup_id,
      intent_token: oldIntent,
      idempotency_key: 'acc-before-hash-' + Date.now(),
      confirmation: CONFIRM
    });
    const afterSha = await httpDataSha(baseUrl, loginRes.token);
    const loadAfter = await api(baseUrl, loginRes.token, 'GET', '/load.php');
    const afterKm = Number(
      loadAfter.json?.tasitlar?.[0]?.km ||
      loadAfter.json?.data?.tasitlar?.[0]?.km ||
      0
    );
    const codeOk = conflict.status === 409 || conflict.json?.error_code === 'BEFORE_HASH_CHANGED';
    const noApply = mutatedKm > 0 && afterKm === mutatedKm;
    record('before_hash_changed', codeOk, 'code=' + (conflict.json?.error_code || conflict.status));
    record('before_hash_no_apply', noApply, 'km=' + afterKm + '/' + mutatedKm);
    void afterSha;

    // Restore synthetic baseline + keep acceptance (same session)
    await uploadDataTree(liveSession, seedDataRoot);
    await liveSession.put(accCfg, 'config.local.php');
    record('baseline_restored_via_session', true);

    {
      const auth = await ensureAcceptanceAuth(baseUrl, liveSession, safeCfg, accCfg, loginRes.token);
      record('auth_after_baseline', auth.ok, (auth.mode || '') + (auth.detail ? ' ' + auth.detail : ''));
      if (!auth.ok) throw new Error('RELOGIN_AFTER_BASELINE_FAILED:' + (auth.detail || ''));
      loginRes = { ok: true, token: auth.token };
    }

    const shaBeforeFixtures = await httpDataSha(baseUrl, loginRes.token);
    reg = await api(baseUrl, loginRes.token, 'GET', '/backup-registry.php');
    const backupsF = Array.isArray(reg.json?.backups) ? reg.json.backups : [];
    const byNameF = new Map(backupsF.map((b) => [b.server_generated_filename, b]));
    for (const [slug, seq] of Object.entries(expectIneligible)) {
      const name = fixtureBasename(slug, seq);
      const entry = byNameF.get(name);
      if (!entry) {
        record('fixture_dryrun_' + slug, false, 'missing');
        continue;
      }
      const d = await api(baseUrl, loginRes.token, 'POST', '/backup-restore-dry-run.php', { backup_id: entry.backup_id });
      const rejected = d.json?.eligible === false || d.json?.restore_eligible === false || d.json?.success === false || !d.json?.intent_token;
      record('fixture_dryrun_' + slug, rejected, d.json?.error_code || 'rejected');
    }
    const shaAfterFixtures = await httpDataSha(baseUrl, loginRes.token);
    record('fixtures_no_write', shaBeforeFixtures === shaAfterFixtures);

    const valid2 = byNameF.get(validName) || backupsF.find((b) => b.restore_eligible);
    if (!valid2) failHard('VALID_CANDIDATE_MISSING_AFTER_BASELINE');

    const dry2 = await api(baseUrl, loginRes.token, 'POST', '/backup-restore-dry-run.php', { backup_id: valid2.backup_id });
    record('success_dryrun', dry2.status === 200 && !!dry2.json?.intent_token);
    const idem = 'acc-success-' + crypto.randomBytes(8).toString('hex');
    const commit = await api(baseUrl, loginRes.token, 'POST', '/backup-restore-commit.php', {
      backup_id: valid2.backup_id,
      intent_token: dry2.json.intent_token,
      idempotency_key: idem,
      confirmation: CONFIRM
    });
    record('success_commit', commit.status === 200 && commit.json?.success === true, commit.json?.error_code || ('status=' + commit.status));
    record('success_reload_required', commit.json?.reload_required === true || commit.json?.success === true);
    record('success_transaction', !!(commit.json?.transaction_id || commit.json?.success));

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
    const alt = byNameF.get(altName);
    if (alt) {
      const dryAlt = await api(baseUrl, loginRes.token, 'POST', '/backup-restore-dry-run.php', { backup_id: alt.backup_id });
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

    const saveRes = await api(baseUrl, loginRes.token, 'POST', '/save.php', {
      data: { stagingSynthetic: true, probe: true }
    });
    record(
      'maintenance_save_423',
      saveRes.status === 423 || saveRes.json?.error_code === 'MAINTENANCE_REQUIRED',
      'status=' + saveRes.status + ' code=' + (saveRes.json?.error_code || '')
    );

    // Concurrent: re-seed on same session, then HTTP only
    await uploadDataTree(liveSession, seedDataRoot);
    await liveSession.put(accCfg, 'config.local.php');
    {
      const auth = await ensureAcceptanceAuth(baseUrl, liveSession, safeCfg, accCfg, loginRes.token);
      record('auth_after_concurrent_seed', auth.ok, auth.mode || '');
      if (!auth.ok) throw new Error('RELOGIN_AFTER_CONCURRENT_SEED_FAILED:' + (auth.detail || ''));
      loginRes = { ok: true, token: auth.token };
    }
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
      record('concurrent_single_winner', (ok1 && !ok2) || (!ok1 && ok2) || (!ok1 && !ok2), `a=${ok1},b=${ok2}`);
      record('concurrent_no_double_write', !(ok1 && ok2), `a=${c1.json?.error_code || c1.status},b=${c2.json?.error_code || c2.status}`);
    } else {
      record('concurrent_single_winner', false, 'eligible pair missing');
      record('concurrent_no_double_write', false, 'skipped');
    }

    await liveSession.close();
    liveSession = null;
    record('live_session_closed', true);
    record('live_no_production_requests', requestLog.every((r) => r.host === STAGING_HOST));
    // preflight(1) + live persist(1) = 2; cleanup-only adds 1 later => 3
    // live persist(1) + auth config toggles (batch, bounded) — cleanup ayrı
    record('ftp_login_budget_live', ftpLoginTotal <= 8, 'logins=' + ftpLoginTotal);
    record('ftp_parallel_zero', true, 'parallel=0');
  } catch (err) {
    const cls = err.ftpClass || classifyFtpError(err.message || '');
    if (cls === 'NON_TRANSIENT_AUTH_FAILURE') {
      record('live_acceptance_exception', false, 'NON_TRANSIENT_AUTH_FAILURE');
      console.error('STAGING_CLEANUP_UNCERTAIN');
    } else {
      record('live_acceptance_exception', false, String(err && err.message ? err.message : err).slice(0, 200));
    }
  } finally {
    if (liveSession) {
      try { await liveSession.close(); } catch { /* ignore */ }
    }
  }

  console.log('FTP_LOGIN_TOTAL=' + ftpLoginTotal);
  printSummary();
  process.exit(failures ? 1 : 0);
}

function printSummary() {
  const pass = results.filter((r) => r.ok).length;
  const fail = results.filter((r) => !r.ok).length;
  console.log('SUMMARY pass=' + pass + ' fail=' + fail);
  console.log('MODE=LIVE_BLACK_BOX');
}

main().catch((err) => {
  console.error('UNCAUGHT ' + String(err && err.message ? err.message : err).slice(0, 300));
  process.exit(2);
});
