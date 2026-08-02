#!/usr/bin/env node
'use strict';

/**
 * Staging FTPS classification + source contract tests (no live FTP).
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { classifyFtpError, AUTH_530_RE, TRANSIENT_RE } = require('./medisa-staging-ftps.js');

const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

assert.equal(classifyFtpError('curl: (67) Access denied: 530'), 'NON_TRANSIENT_AUTH_FAILURE');
assert.equal(classifyFtpError('FTPS_FAILED: Access denied: 530'), 'NON_TRANSIENT_AUTH_FAILURE');
assert.equal(classifyFtpError('Login incorrect'), 'NON_TRANSIENT_AUTH_FAILURE');
assert.equal(classifyFtpError('ECONNRESET'), 'TRANSIENT');
assert.equal(classifyFtpError('socket hang up'), 'TRANSIENT');
assert.equal(classifyFtpError('ETIMEDOUT'), 'TRANSIENT');
assert.equal(classifyFtpError('ESOCKETTIMEDOUT'), 'TRANSIENT');
assert.equal(classifyFtpError('EPIPE'), 'TRANSIENT');
assert.equal(classifyFtpError('ECONNABORTED'), 'TRANSIENT');
assert.equal(classifyFtpError('421 Service not available'), 'TRANSIENT');
assert.equal(classifyFtpError('425 Cannot open data connection'), 'TRANSIENT');
assert.equal(classifyFtpError('426 Connection closed'), 'TRANSIENT');
assert.equal(classifyFtpError('some unknown blah'), 'OTHER');

assert.equal(AUTH_530_RE.test('Access denied: 530'), true);
assert.equal(TRANSIENT_RE.test('ECONNRESET'), true);
assert.equal(TRANSIENT_RE.test('Access denied: 530'), false);

const helper = read('scripts/medisa-staging-ftps.js');
const accept = read('scripts/run-medisa-staging-restore-acceptance.js');
const wf = read('.github/workflows/staging-restore-acceptance.yml');

assert.match(helper, /NON_TRANSIENT_AUTH_FAILURE/, '530 class present');
assert.match(helper, /PersistentFtpsSession/, 'persistent session present');
assert.match(helper, /__MEDISA_FTPS_DONE__|DONE_MARKER/, 'persistent marker sync');
assert.match(helper, /ops\.push\(\{ type: 'probe' \}\)/, 'probe op');
assert.match(helper, /allowRetry:\s*false,\s*maxAttempts:\s*1/, 'probe no retry');
assert.equal(classifyFtpError('FTPS_CMD_TIMEOUT:'), 'TRANSIENT');

assert.match(accept, /PersistentFtpsSession/, 'runner uses persistent session');
assert.match(accept, /preflight-only/, 'preflight phase');
assert.match(accept, /cleanup-only/, 'cleanup phase');
assert.match(accept, /STAGING_CLEANUP_UNCERTAIN/, 'cleanup uncertain marker');
assert.match(accept, /NON_TRANSIENT_AUTH_FAILURE/, 'auth failure class wired');
assert.match(accept, /MEDISA_STAGING_SKIP_PREFLIGHT/, 'skip preflight after workflow');
assert.match(accept, /ftp_login_budget_live|FTP_LOGIN_TOTAL/, 'login budget tracked');
assert.match(accept, /httpDataSha/, 'dry-run uses HTTP hash');
assert.match(accept, /ftp_parallel_zero/, 'parallel FTP zero asserted');
assertNoProdSecrets(accept);
assertNoProdSecrets(helper);
assertNoProdSecrets(wf);

assert.match(wf, /FTPS auth preflight/, 'workflow preflight step');
assert.match(wf, /preflight-only/, 'workflow preflight phase');
assert.match(wf, /MEDISA_STAGING_SKIP_PREFLIGHT/, 'workflow skips duplicate preflight');
assert.match(wf, /apt-get install -y -qq lftp/, 'lftp installed');
assert.match(wf, /STAGING_CLEANUP_UNCERTAIN/, 'cleanup uncertain fails job');
assert.match(wf, /if:\s*always\(\)/, 'cleanup always');
assert.doesNotMatch(wf, /secrets\.FTP_PASSWORD/, 'no production FTP password');

// Retry policy: 530 must not appear in transient retry allowlist
assert.doesNotMatch(helper, /TRANSIENT_RE\s*=\s*[^;]*530/, '530 not in TRANSIENT_RE');
assert.equal(classifyFtpError('530') === 'NON_TRANSIENT_AUTH_FAILURE' && classifyFtpError('ECONNRESET') === 'TRANSIENT', true);

function assertNoProdSecrets(src) {
  assert.doesNotMatch(src, /secrets\.FTP_PASSWORD/, 'no prod FTP_PASSWORD');
  assert.doesNotMatch(src, /secrets\.FTP_SERVER\b/, 'no prod FTP_SERVER');
  assert.doesNotMatch(src, /secrets\.FTP_USERNAME\b/, 'no prod FTP_USERNAME');
}

console.log('verify-medisa-staging-ftps: OK');
console.log('ftp_530_class=NON_TRANSIENT_AUTH_FAILURE');
console.log('ftp_transient_retry=bounded');
console.log('ftp_auth_retry=none');
