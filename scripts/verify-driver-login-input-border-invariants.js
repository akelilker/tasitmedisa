/**
 * Driver login input border owner invariants.
 * Guards against 0.5px inset box-shadow hairline (desktop left-edge white pixel).
 * Çalıştır: node scripts/verify-driver-login-input-border-invariants.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const shellCss = read('driver/driver-shell.css');
const loginHtml = read('driver/index.html');
const dashboardHtml = read('driver/dashboard.html');
const compatibilityCss = read('driver/driver-style.css');
const bootstrap = read('driver/driver-script.js');

const inputBlockMatch = shellCss.match(
  /\.login-form \.form-group input \{[\s\S]*?transition:\s*border-color 0\.2s;[\s\S]*?\n\}/
);
assert.ok(inputBlockMatch, 'login-form input owner bloğu bulunmalı');
const inputBlock = inputBlockMatch[0];

assert.match(inputBlock, /border:\s*1px\s+solid\s+rgba\(255,\s*255,\s*255,\s*0\.35\)\s*!important/);
assert.match(inputBlock, /box-shadow:\s*none\s*!important/);
assert.match(inputBlock, /padding:\s*7px 15px/);
assert.match(inputBlock, /transition:\s*border-color\s+0\.2s/);
assert.doesNotMatch(inputBlock, /inset\s+0\s+0\s+0\s+0\.5px/);
assert.doesNotMatch(inputBlock, /border:\s*none\s*!important/);

const focusBlock = shellCss.match(
  /\.login-form \.form-group input:focus,[\s\S]*?\.login-page \.login-form \.form-group input:focus \{[\s\S]*?\n\}/
);
assert.ok(focusBlock, 'login input focus owner bloğu bulunmalı');
assert.match(focusBlock[0], /border-color:\s*var\(--theme-color\)\s*!important/);
assert.match(focusBlock[0], /box-shadow:\s*none\s*!important/);
assert.doesNotMatch(focusBlock[0], /0\.5px/);

const hasValueBlock = shellCss.match(
  /\.login-form \.form-group input\.has-value,[\s\S]*?\.login-page \.login-form \.form-group input\.has-value \{[\s\S]*?\n\}/
);
assert.ok(hasValueBlock, 'login input has-value owner bloğu bulunmalı');
assert.match(hasValueBlock[0], /border-color:\s*var\(--theme-color\)\s*!important/);
assert.match(hasValueBlock[0], /box-shadow:\s*none\s*!important/);
assert.doesNotMatch(hasValueBlock[0], /0\.5px/);

const autofillBlock = shellCss.match(
  /\.login-form \.form-group input:-webkit-autofill,[\s\S]*?transition:\s*background-color 5000s[\s\S]*?\n\}/
);
assert.ok(autofillBlock, 'login input autofill owner bloğu bulunmalı');
assert.match(autofillBlock[0], /-webkit-box-shadow:\s*0 0 0 30px #0f1418 inset\s*!important/);
assert.doesNotMatch(autofillBlock[0], /inset\s+0\s+0\s+0\s+0\.5px/);
assert.match(autofillBlock[0], /border:\s*1px\s+solid\s+rgba\(255,\s*255,\s*255,\s*0\.35\)\s*!important/);

assert.match(
  shellCss,
  /\.login-form \.form-group input\.has-value:-webkit-autofill[\s\S]{0,400}border-color:\s*var\(--theme-color\)\s*!important/
);

const shellPin = (bootstrap.match(/shellCss:\s*['"]([^'"]+)['"]/) || [])[1];
assert.ok(shellPin, 'shellCss pin missing');
const pinRe = new RegExp('driver-shell\\.css\\?v=' + shellPin.replace(/\./g, '\\.'));
assert.match(loginHtml, pinRe);
assert.match(dashboardHtml, pinRe);
assert.match(compatibilityCss, pinRe);

console.log('verify-driver-login-input-border-invariants: OK');
