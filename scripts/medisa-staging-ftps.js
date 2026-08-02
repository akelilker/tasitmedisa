#!/usr/bin/env node
'use strict';

/**
 * Staging FTPS session helper (explicit FTPS, passive).
 * - Persistent session: one login, many ops
 * - 530 = NON_TRANSIENT_AUTH_FAILURE (no retry)
 * - Transient network: bounded retry on reconnect only
 * Secret values never logged.
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn, spawnSync } = require('node:child_process');

const STAGING_FTP_USER = 'medisa_staging@karmotors.com.tr';

const TRANSIENT_RE =
  /ECONNRESET|socket hang up|ETIMEDOUT|ESOCKETTIMEDOUT|EPIPE|ECONNABORTED|\b421\b|\b425\b|\b426\b|timeout|Temporary failure/i;
const AUTH_530_RE = /\b530\b|Access denied:\s*530|Login incorrect|GetPass\(\) failed/i;

function classifyFtpError(message) {
  const msg = String(message || '');
  if (AUTH_530_RE.test(msg)) return 'NON_TRANSIENT_AUTH_FAILURE';
  if (TRANSIENT_RE.test(msg)) return 'TRANSIENT';
  return 'OTHER';
}

function sleepSync(ms) {
  spawnSync(process.execPath, ['-e', `setTimeout(()=>{},${Number(ms) || 0})`], { stdio: 'ignore' });
}

function redact(text, pass) {
  let out = String(text || '');
  if (pass) out = out.split(pass).join('***');
  return out.slice(0, 400);
}

function quoteLftp(value) {
  return JSON.stringify(String(value));
}

/**
 * Batch session: one login per flush() (fallback / probe / cleanup).
 */
class FtpsSession {
  /**
   * @param {{server:string,username:string,password:string,port?:string|number,label?:string}} cfg
   */
  constructor(cfg) {
    this.server = cfg.server;
    this.username = cfg.username;
    this.password = cfg.password;
    this.port = String(cfg.port || '21');
    this.label = cfg.label || 'ftps';
    this.ops = [];
    this.loginCount = 0;
    if (this.username !== STAGING_FTP_USER) {
      throw new Error('FTP_USER_MISMATCH');
    }
  }

  put(localPath, remotePath) {
    this.ops.push({ type: 'put', localPath, remotePath: remotePath.replace(/^\/+/, '') });
  }

  get(remotePath, localPath) {
    this.ops.push({ type: 'get', remotePath: remotePath.replace(/^\/+/, ''), localPath });
  }

  mkdir(remotePath) {
    this.ops.push({ type: 'mkdir', remotePath: remotePath.replace(/^\/+/, '') });
  }

  /** Salt-okunur auth probe: login + pwd + ls + quit */
  probe() {
    this.ops.push({ type: 'probe' });
    return this.flush({ allowRetry: false, maxAttempts: 1 });
  }

  /**
   * @param {{allowRetry?:boolean,maxAttempts?:number}} opts
   */
  flush(opts = {}) {
    if (!this.ops.length) {
      return { ok: true, loginCount: 0, stdout: '' };
    }
    const allowRetry = opts.allowRetry !== false;
    const maxAttempts = Math.max(1, Number(opts.maxAttempts || (allowRetry ? 3 : 1)));
    const ops = this.ops.slice();
    this.ops = [];

    let lastErr = 'ftp failed';
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      this.loginCount += 1;
      const result = runLftpBatch(this, ops);
      if (result.ok) {
        return { ok: true, loginCount: 1, stdout: result.stdout, attempt };
      }
      lastErr = result.error;
      const kind = classifyFtpError(lastErr);
      if (kind === 'NON_TRANSIENT_AUTH_FAILURE') {
        const err = new Error('FTPS_AUTH_530:' + redact(lastErr, this.password));
        err.code = 'NON_TRANSIENT_AUTH_FAILURE';
        err.ftpClass = kind;
        throw err;
      }
      if (!allowRetry || kind !== 'TRANSIENT' || attempt >= maxAttempts) {
        const err = new Error('FTPS_FAILED:' + redact(lastErr, this.password));
        err.code = kind;
        err.ftpClass = kind;
        throw err;
      }
      sleepSync(2000 * attempt);
    }
    const err = new Error('FTPS_FAILED:' + redact(lastErr, this.password));
    err.code = classifyFtpError(lastErr);
    err.ftpClass = err.code;
    throw err;
  }
}

function buildOpenLines(cfg) {
  return [
    'set ssl:verify-certificate no',
    'set ftp:ssl-force true',
    'set ftp:ssl-protect-data true',
    'set ftp:passive-mode true',
    'set net:max-retries 1',
    'set net:timeout 60',
    'set cmd:fail-exit true',
    `open -u ${quoteLftp(cfg.username)},${quoteLftp(cfg.password)} ftp://${cfg.server}:${cfg.port}`
  ];
}

function buildOpLines(ops) {
  const lines = [];
  for (const op of ops) {
    if (op.type === 'probe') {
      lines.push('pwd');
      lines.push('cls -1');
      continue;
    }
    if (op.type === 'mkdir') {
      lines.push(`glob mkdir -p ${quoteLftp(op.remotePath)}`);
      continue;
    }
    if (op.type === 'put') {
      const remoteDir = path.posix.dirname(op.remotePath);
      if (remoteDir && remoteDir !== '.') {
        lines.push(`glob mkdir -p ${quoteLftp(remoteDir)}`);
      }
      lines.push(`put ${quoteLftp(op.localPath)} -o ${quoteLftp(op.remotePath)}`);
      continue;
    }
    if (op.type === 'get') {
      fs.mkdirSync(path.dirname(op.localPath), { recursive: true });
      lines.push(`get ${quoteLftp(op.remotePath)} -o ${quoteLftp(op.localPath)}`);
    }
  }
  return lines;
}

function runLftpBatch(cfg, ops) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'medisa-ftps-'));
  const scriptPath = path.join(tmp, 'batch.lftp');
  const lines = buildOpenLines(cfg).concat(buildOpLines(ops), ['bye']);
  fs.writeFileSync(scriptPath, lines.join('\n') + '\n', 'utf8');
  const r = spawnSync('lftp', ['-f', scriptPath], {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024
  });
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  if (r.status === 0) {
    return { ok: true, stdout: r.stdout || '' };
  }
  return {
    ok: false,
    error: redact(r.stderr || r.stdout || 'lftp failed', cfg.password)
  };
}

/**
 * Persistent interactive FTPS: one login, serial ops until close().
 * Parallel connections: 0 (single child process).
 */
class PersistentFtpsSession {
  /**
   * @param {{server:string,username:string,password:string,port?:string|number,label?:string}} cfg
   */
  constructor(cfg) {
    this.server = cfg.server;
    this.username = cfg.username;
    this.password = cfg.password;
    this.port = String(cfg.port || '21');
    this.label = cfg.label || 'ftps-persist';
    this.loginCount = 0;
    this.child = null;
    this.buf = '';
    this.closed = false;
    if (this.username !== STAGING_FTP_USER) {
      throw new Error('FTP_USER_MISMATCH');
    }
  }

  /**
   * @param {{allowRetry?:boolean,maxAttempts?:number}} opts
   */
  async open(opts = {}) {
    const allowRetry = opts.allowRetry !== false;
    const maxAttempts = Math.max(1, Number(opts.maxAttempts || (allowRetry ? 2 : 1)));
    let lastErr = 'open failed';
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await this.#openOnce();
        return { ok: true, attempt };
      } catch (err) {
        lastErr = String(err && err.message ? err.message : err);
        const kind = classifyFtpError(lastErr);
        this.#killQuiet();
        if (kind === 'NON_TRANSIENT_AUTH_FAILURE') {
          const e = new Error('FTPS_AUTH_530:' + redact(lastErr, this.password));
          e.code = 'NON_TRANSIENT_AUTH_FAILURE';
          e.ftpClass = kind;
          throw e;
        }
        if (!allowRetry || kind !== 'TRANSIENT' || attempt >= maxAttempts) {
          const e = new Error('FTPS_FAILED:' + redact(lastErr, this.password));
          e.code = kind;
          e.ftpClass = kind;
          throw e;
        }
        await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
    }
    const e = new Error('FTPS_FAILED:' + redact(lastErr, this.password));
    e.ftpClass = classifyFtpError(lastErr);
    throw e;
  }

  async put(localPath, remotePath) {
    const remote = remotePath.replace(/^\/+/, '');
    const remoteDir = path.posix.dirname(remote);
    if (remoteDir && remoteDir !== '.') {
      await this.#cmd(`glob mkdir -p ${quoteLftp(remoteDir)}`);
    }
    await this.#cmd(`put ${quoteLftp(localPath)} -o ${quoteLftp(remote)}`);
  }

  async get(remotePath, localPath) {
    fs.mkdirSync(path.dirname(localPath), { recursive: true });
    await this.#cmd(`get ${quoteLftp(remotePath.replace(/^\/+/, ''))} -o ${quoteLftp(localPath)}`);
  }

  async pwd() {
    return this.#cmd('pwd');
  }

  async cls() {
    return this.#cmd('cls -1');
  }

  async close() {
    if (!this.child || this.closed) return;
    try {
      await this.#cmd('bye', { expectPrompt: false, timeoutMs: 15000 });
    } catch {
      /* ignore */
    }
    this.#killQuiet();
    this.closed = true;
  }

  #killQuiet() {
    if (this.child && !this.child.killed) {
      try {
        this.child.kill('SIGKILL');
      } catch {
        /* ignore */
      }
    }
    this.child = null;
  }

  #openOnce() {
    return new Promise((resolve, reject) => {
      this.buf = '';
      this.closed = false;
      const child = spawn('lftp', [], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: process.env
      });
      this.child = child;
      this.loginCount += 1;

      const onData = (chunk) => {
        this.buf += chunk.toString('utf8');
      };
      child.stdout.on('data', onData);
      child.stderr.on('data', onData);
      child.on('error', (err) => reject(err));
      child.on('exit', (code) => {
        if (!this.closed && code && code !== 0) {
          /* handled by cmd timeout/error */
        }
      });

      const openScript = buildOpenLines(this).join('\n') + '\n';
      child.stdin.write(openScript, (err) => {
        if (err) return reject(err);
        waitForPrompt(this, 60000)
          .then(() => resolve())
          .catch((e) => reject(e));
      });
    });
  }

  async #cmd(command, opts = {}) {
    if (!this.child || !this.child.stdin) {
      const err = new Error('FTPS_NOT_OPEN');
      err.ftpClass = 'OTHER';
      throw err;
    }
    const expectPrompt = opts.expectPrompt !== false;
    const timeoutMs = opts.timeoutMs || 90000;
    this.buf = '';
    await new Promise((resolve, reject) => {
      this.child.stdin.write(command + '\n', (err) => (err ? reject(err) : resolve()));
    });
    if (!expectPrompt) {
      await new Promise((r) => setTimeout(r, 300));
      return this.buf;
    }
    try {
      await waitForPrompt(this, timeoutMs);
    } catch (err) {
      const text = redact(this.buf || String(err.message || err), this.password);
      const kind = classifyFtpError(text);
      const e = new Error((kind === 'NON_TRANSIENT_AUTH_FAILURE' ? 'FTPS_AUTH_530:' : 'FTPS_FAILED:') + text);
      e.ftpClass = kind;
      e.code = kind;
      throw e;
    }
    const out = this.buf;
    if (AUTH_530_RE.test(out)) {
      const e = new Error('FTPS_AUTH_530:' + redact(out, this.password));
      e.ftpClass = 'NON_TRANSIENT_AUTH_FAILURE';
      e.code = 'NON_TRANSIENT_AUTH_FAILURE';
      throw e;
    }
    return out;
  }
}

function waitForPrompt(session, timeoutMs) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const text = session.buf;
      if (AUTH_530_RE.test(text)) {
        return reject(new Error(redact(text, session.password)));
      }
      // lftp prompt forms: "lftp ...> " or "lftp user@host:/> "
      if (/(^|\n)lftp [^>]*>\s*$/.test(text) || /(^|\n)lftp>\s*$/.test(text)) {
        return resolve(text);
      }
      if (Date.now() - started > timeoutMs) {
        return reject(new Error('FTPS_PROMPT_TIMEOUT:' + redact(text, session.password)));
      }
      setTimeout(tick, 50);
    };
    tick();
  });
}

/**
 * Curl-based one-shot probe (no lftp required). Still one login.
 * Used for local auth probe when lftp is unavailable.
 */
function probeWithCurl(cfg) {
  if (cfg.username !== STAGING_FTP_USER) throw new Error('FTP_USER_MISMATCH');
  const args = [
    '-sS',
    '-k',
    '--connect-timeout', '30',
    '--max-time', '60',
    '--ssl-reqd',
    '--ftp-pasv',
    '--ftp-method', 'nocwd',
    '-u', `${cfg.username}:${cfg.password}`,
    `ftp://${cfg.server}:${cfg.port || 21}/`
  ];
  const r = spawnSync('curl', args, { encoding: 'utf8', maxBuffer: 5 * 1024 * 1024 });
  const combined = `${r.stdout || ''}\n${r.stderr || ''}`;
  if (r.status === 0) {
    return { ok: true, stdout: r.stdout || '', loginCount: 1 };
  }
  const kind = classifyFtpError(combined);
  const err = new Error(
    (kind === 'NON_TRANSIENT_AUTH_FAILURE' ? 'FTPS_AUTH_530:' : 'FTPS_FAILED:') +
      redact(combined, cfg.password)
  );
  err.ftpClass = kind;
  err.code = kind;
  throw err;
}

module.exports = {
  FtpsSession,
  PersistentFtpsSession,
  classifyFtpError,
  probeWithCurl,
  STAGING_FTP_USER,
  TRANSIENT_RE,
  AUTH_530_RE
};
