#!/usr/bin/env node
'use strict';

/**
 * Staging FTPS session helper (explicit FTPS, passive).
 * - Persistent session: one login, many ops (marker sync, no TTY prompt dependency)
 * - Batch session: one login per flush()
 * - 530 = NON_TRANSIENT_AUTH_FAILURE (no retry)
 * - Transient network: bounded retry on reconnect only
 * Secret values never logged.
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn, spawnSync } = require('node:child_process');

const STAGING_FTP_USER = 'medisa_staging@karmotors.com.tr';
const DONE_MARKER = '__MEDISA_FTPS_DONE__';

const TRANSIENT_RE =
  /ECONNRESET|socket hang up|ETIMEDOUT|ESOCKETTIMEDOUT|EPIPE|ECONNABORTED|\b421\b|\b425\b|\b426\b|FTPS_CMD_TIMEOUT|FTPS_PROMPT_TIMEOUT|timeout|Temporary failure/i;
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

function authError(message, password) {
  const text = redact(message, password);
  const kind = classifyFtpError(text);
  const err = new Error((kind === 'NON_TRANSIENT_AUTH_FAILURE' ? 'FTPS_AUTH_530:' : 'FTPS_FAILED:') + text);
  err.code = kind;
  err.ftpClass = kind;
  return err;
}

/**
 * Batch session: one login per flush() (probe / cleanup / fallback).
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
        throw authError(lastErr, this.password);
      }
      if (!allowRetry || kind !== 'TRANSIENT' || attempt >= maxAttempts) {
        throw authError(lastErr, this.password);
      }
      sleepSync(2000 * attempt);
    }
    throw authError(lastErr, this.password);
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
 * Persistent FTPS: one login, serial ops until close().
 * Completion sync via lftp `echo` marker (works without TTY prompts).
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
    this.chain = Promise.resolve();
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
        // Prove session ready with pwd + marker (no prompt dependency).
        await this.#cmd('pwd');
        return { ok: true, attempt };
      } catch (err) {
        lastErr = String(err && err.message ? err.message : err);
        this.#killQuiet();
        const kind = classifyFtpError(lastErr);
        if (kind === 'NON_TRANSIENT_AUTH_FAILURE') {
          throw authError(lastErr, this.password);
        }
        if (!allowRetry || kind !== 'TRANSIENT' || attempt >= maxAttempts) {
          throw authError(lastErr, this.password);
        }
        await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
    }
    throw authError(lastErr, this.password);
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
      this.buf = '';
      await new Promise((resolve, reject) => {
        this.child.stdin.write('bye\n', (err) => (err ? reject(err) : resolve()));
      });
      await new Promise((r) => setTimeout(r, 400));
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
      const child = spawn('lftp', ['-e', 'set cmd:fail-exit true'], {
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

      const openScript = buildOpenLines(this).join('\n') + '\n';
      child.stdin.write(openScript, (err) => {
        if (err) return reject(err);
        // Small settle; readiness is confirmed by first marked cmd in open().
        setTimeout(() => resolve(), 300);
      });
    });
  }

  #cmd(command) {
    // Serialize commands on one connection.
    this.chain = this.chain.then(() => this.#cmdOnce(command));
    return this.chain;
  }

  async #cmdOnce(command) {
    if (!this.child || !this.child.stdin) {
      throw authError('FTPS_NOT_OPEN', this.password);
    }
    const token = DONE_MARKER + '_' + Date.now() + '_' + Math.random().toString(16).slice(2);
    this.buf = '';
    const script = `${command}\necho ${quoteLftp(token)}\n`;
    await new Promise((resolve, reject) => {
      this.child.stdin.write(script, (err) => (err ? reject(err) : resolve()));
    });
    const started = Date.now();
    const timeoutMs = 90000;
    while (Date.now() - started < timeoutMs) {
      const text = this.buf;
      if (AUTH_530_RE.test(text)) {
        throw authError(text, this.password);
      }
      if (text.includes(token)) {
        return text;
      }
      // Fail-fast on hard lftp errors without marker
      if (/^(ftp|mirror|get|put|open):\s/i.test(text) && /failed|denied|error/i.test(text)) {
        throw authError(text, this.password);
      }
      await new Promise((r) => setTimeout(r, 40));
    }
    throw authError('FTPS_CMD_TIMEOUT:' + this.buf, this.password);
  }
}

/**
 * Curl-based one-shot probe (no lftp required). Still one login.
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
  throw authError(combined, cfg.password);
}

module.exports = {
  FtpsSession,
  PersistentFtpsSession,
  classifyFtpError,
  probeWithCurl,
  STAGING_FTP_USER,
  TRANSIENT_RE,
  AUTH_530_RE,
  DONE_MARKER
};
