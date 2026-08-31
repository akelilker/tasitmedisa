/**
 * PERF-P1-2 — driver başlangıç bundle deterministic byte ölçümü.
 *
 * Gerçek browser timingleri Edge DevTools kabulünde ölçülür. CI kapıları
 * transferden bağımsız kaynak byte ve eager/lazy owner sınırlarını doğrular.
 */
'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { canonicalSourceFileBytes } = require('./lib/canonical-source-bytes');

const ROOT = path.join(__dirname, '..');
const DRIVER = path.join(ROOT, 'driver');
const OLD_JS_BYTES = 208561;
const OLD_CSS_BYTES = 206536;
const JS_FILES = {
  bootstrap: 'driver-script.js',
  login: 'driver-login.js',
  dashboardCore: 'driver-dashboard-core.js',
  history: 'driver-feature-history.js',
  documents: 'driver-feature-documents.js',
  feedback: 'driver-feature-feedback.js',
  password: 'driver-feature-password.js',
  actions: 'driver-feature-actions.js'
};
const CSS_FILES = {
  shell: 'driver-shell.css',
  features: 'driver-features.css',
  compatibility: 'driver-style.css'
};

function bytes(file) {
  return canonicalSourceFileBytes(path.join(DRIVER, file));
}

function pctReduction(oldValue, newValue) {
  return Number(((1 - newValue / oldValue) * 100).toFixed(2));
}

const jsBytes = Object.fromEntries(
  Object.entries(JS_FILES).map(([name, file]) => [name, bytes(file)])
);
const cssBytes = Object.fromEntries(
  Object.entries(CSS_FILES).map(([name, file]) => [name, bytes(file)])
);
const loginInitialJs = jsBytes.bootstrap + jsBytes.login;
const dashboardInitialJs = jsBytes.bootstrap + jsBytes.dashboardCore;
const fullJs = Object.values(jsBytes).reduce((sum, value) => sum + value, 0);
const splitCss = cssBytes.shell + cssBytes.features;

assert.ok(jsBytes.bootstrap <= 20 * 1024, 'driver-script.js 20 KiB kapısını aşıyor');
assert.ok(loginInitialJs <= Math.min(65 * 1024, OLD_JS_BYTES * 0.30), 'login initial JS kapısı aşıldı');
assert.ok(dashboardInitialJs <= Math.min(115 * 1024, OLD_JS_BYTES * 0.55), 'dashboard initial JS kapısı aşıldı');
assert.ok(fullJs <= OLD_JS_BYTES * 1.10, 'full-feature JS %110 kapısını aşıyor');
assert.ok(cssBytes.shell <= OLD_CSS_BYTES * 0.45, 'driver-shell.css %45 kapısını aşıyor');
assert.ok(splitCss <= OLD_CSS_BYTES * 1.05, 'split CSS %105 kapısını aşıyor');

const surfaces = [
  {
    Surface: 'Login',
    Scenario: 'static initial',
    'Old JS bytes': OLD_JS_BYTES,
    'New initial JS bytes': loginInitialJs,
    'Reduction %': pctReduction(OLD_JS_BYTES, loginInitialJs),
    'Old blocking CSS bytes': OLD_CSS_BYTES,
    'New blocking CSS bytes': cssBytes.shell,
    'CSS reduction %': pctReduction(OLD_CSS_BYTES, cssBytes.shell),
    'Old interactive median': 'manual baseline',
    'New interactive median': 'manual Edge',
    'Improvement %': 'manual Edge',
    'Feature requests before interaction': 0
  },
  {
    Surface: 'Dashboard',
    Scenario: 'static initial',
    'Old JS bytes': OLD_JS_BYTES,
    'New initial JS bytes': dashboardInitialJs,
    'Reduction %': pctReduction(OLD_JS_BYTES, dashboardInitialJs),
    'Old blocking CSS bytes': OLD_CSS_BYTES,
    'New blocking CSS bytes': cssBytes.shell,
    'CSS reduction %': pctReduction(OLD_CSS_BYTES, cssBytes.shell),
    'Old interactive median': 'manual baseline',
    'New interactive median': 'manual Edge',
    'Improvement %': 'manual Edge',
    'Feature requests before interaction': 0
  }
];

const features = ['history', 'documents', 'feedback', 'password', 'actions'].map((name) => ({
  Feature: name,
  'JS bytes': jsBytes[name],
  'First open median': 'manual Edge',
  'First open p95': 'manual Edge',
  'Second open median': 'manual Edge',
  'Second open requests': 0,
  'Offline cached result': 'manual PWA'
}));

console.table(surfaces);
console.table(features);
console.log(JSON.stringify({
  kind: 'deterministic-static-byte-gates',
  baseline: { driverScriptBytes: OLD_JS_BYTES, driverStyleBytes: OLD_CSS_BYTES },
  jsBytes,
  cssBytes,
  totals: { loginInitialJs, dashboardInitialJs, fullJs, splitCss },
  gates: {
    bootstrap20KiB: 'PASS',
    loginInitial30PctAnd65KiB: 'PASS',
    dashboardInitial55PctAnd115KiB: 'PASS',
    fullJs110Pct: 'PASS',
    blockingCss45Pct: 'PASS',
    splitCss105Pct: 'PASS'
  },
  browserTiming: 'Edge cold/warm 3 warm-up + 10 measurement manual/live acceptance required'
}, null, 2));
