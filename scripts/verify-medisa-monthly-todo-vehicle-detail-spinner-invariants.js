/**
 * MONTHLY_TODO_VEHICLE_DETAIL_STUCK_SPINNER_FIX invariants.
 *
 * Kapsam:
 *  - Ay Özeti / Bu Ay Yapılacaklar satır click owner tekilliği (1 click => 1 kopru => 1 detay isteği)
 *  - global modül spinner stale-rAF guard (depth == 0 iken active OLMAMALI)
 *  - modül hazır / lazy ensure akışlarında spinner kapanış kontratı
 *
 * Çalıştır: node scripts/verify-medisa-monthly-todo-vehicle-detail-spinner-invariants.js
 *
 * jsdom yok — kaynak kontrat + minimal fake DOM/event fixture (repo convention).
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const notifications = read('notifications.js');
const scriptCore = read('script-core.js');
const tasitlar = read('tasitlar.js');

let passed = 0;
let failed = 0;

function ok(name) {
  passed += 1;
  console.log('PASS ' + name);
}
function fail(name, err) {
  failed += 1;
  console.error('FAIL ' + name + ': ' + (err && err.message ? err.message : err));
}
async function run(name, fn) {
  try {
    await fn();
    ok(name);
  } catch (err) {
    fail(name, err);
  }
}

function countMatches(src, re) {
  const copy = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  return (src.match(copy) || []).length;
}

/** Süslü parantez dengeleyici ile isimli fonksiyon gövdesini çıkarır. */
function extractNamedFunction(src, name) {
  const startToken = 'function ' + name + '(';
  const start = src.indexOf(startToken);
  assert.ok(start !== -1, name + ' bulunmalı');
  let i = src.indexOf('{', start);
  assert.ok(i !== -1, name + ' gövde başlangıcı yok');
  let depth = 0;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  assert.fail(name + ' kapanış bulunamadı');
}

function extractBetween(src, beginMark, endMark) {
  const begin = src.indexOf(beginMark);
  assert.ok(begin !== -1, 'başlangıç marker bulunmalı: ' + beginMark);
  const end = src.indexOf(endMark, begin);
  assert.ok(end > begin, 'bitiş marker bulunmalı: ' + endMark);
  return src.slice(begin, end);
}

/** notifications.js içindeki binding revision owner'ı. */
function readInteractionRev() {
  const m = notifications.match(/var MONTHLY_TODO_INTERACTION_REV = (\d+);/);
  assert.ok(m, 'MONTHLY_TODO_INTERACTION_REV bulunmalı');
  return Number(m[1]);
}
/** notifications.js: canonical modal-level etkileşim owner zinciri (+ varsa eski duplicate body owner). */
function loadMonthlyTodoOwners(sandbox) {
  const parts = [
    extractNamedFunction(notifications, 'openMonthlyTodoRowVehicleDetail'),
    extractNamedFunction(notifications, 'bindMonthlyTodoModalDelegatedInteraction')
  ];
  const hasDuplicateOwner = notifications.indexOf('function wireMonthlyTodoModalBodyInteraction(') !== -1;
  if (hasDuplicateOwner) {
    parts.push(extractNamedFunction(notifications, 'wireMonthlyTodoModalBodyInteraction'));
  }
  vm.createContext(sandbox);
  assert.equal(typeof sandbox.countOpenCall, 'function', 'countOpenCall enjekte edilmeli');
  vm.runInContext(
    'var monthlyTodoRowVehicleOpenInflight = false;\n' +
      parts.join('\n') +
      '\nthis.__owners = {' +
      'openRow: openMonthlyTodoRowVehicleDetail,' +
      'bindModal: bindMonthlyTodoModalDelegatedInteraction,' +
      'bodyOwner: typeof wireMonthlyTodoModalBodyInteraction === "function" ? wireMonthlyTodoModalBodyInteraction : null' +
      '};' +
      /* Çağrı sayacı: handler'lar identifier'ı çağrı anında çözer, bu yüzden binding sarılır. */
      '\n(function(){' +
      'var __openRowRaw = openMonthlyTodoRowVehicleDetail;' +
      'openMonthlyTodoRowVehicleDetail = function(row, modalRoot) {' +
      'countOpenCall();' +
      'return __openRowRaw(row, modalRoot);' +
      '};' +
      '})();',
    sandbox
  );
  return { api: sandbox.__owners, hasDuplicateOwner: hasDuplicateOwner };
}



/**
 * Minimal DOM + tarayıcı semantiğine yakın event dispatch (capture → target → bubble).
 * stopPropagation alt düğümlere/hedefe geçişi engeller; aynı düğümdeki diğer listener'lar çalışır.
 */
function createMiniDom() {
  function El(tag) {
    this.tagName = String(tag || '').toUpperCase();
    this.id = '';
    this.className = '';
    this.attributes = Object.create(null);
    this.parentNode = null;
    this.childNodes = [];
    this._listeners = [];
    this._classTokens = [];
  }
  El.prototype.setAttribute = function(name, value) {
    this.attributes[name] = String(value);
    if (name === 'id') this.id = String(value);
    if (name === 'class') {
      this.className = String(value);
      this._classTokens = this.className.split(/\s+/).filter(Boolean);
    }
  };
  El.prototype.getAttribute = function(name) {
    if (name === 'id') return this.id || null;
    return this.attributes[name] != null ? this.attributes[name] : null;
  };
  El.prototype.appendChild = function(child) {
    if (child.parentNode) child.remove();
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  };
  El.prototype.remove = function() {
    if (!this.parentNode) return;
    const kids = this.parentNode.childNodes;
    const i = kids.indexOf(this);
    if (i >= 0) kids.splice(i, 1);
    this.parentNode = null;
  };
  El.prototype.contains = function(node) {
    let cur = node;
    while (cur) {
      if (cur === this) return true;
      cur = cur.parentNode;
    }
    return false;
  };
  function matchesToken(el, token) {
    if (token.charAt(0) === '.') return el.classList.contains(token.slice(1));
    if (token.charAt(0) === '#') return el.id === token.slice(1);
    return el.tagName === String(token).toUpperCase();
  }
  El.prototype.closest = function(sel) {
    let cur = this;
    while (cur) {
      if (matchesToken(cur, sel)) return cur;
      cur = cur.parentNode;
    }
    return null;
  };
  El.prototype.matches = function(sel) {
    return matchesToken(this, sel);
  };
  El.prototype.querySelectorAll = function(sel) {
    const out = [];
    const walk = (node) => {
      for (const child of node.childNodes) {
        if (matchesToken(child, sel)) out.push(child);
        walk(child);
      }
    };
    walk(this);
    return out;
  };
  El.prototype.querySelector = function(sel) {
    return this.querySelectorAll(sel)[0] || null;
  };
  El.prototype.addEventListener = function(type, handler, capture) {
    if (!handler) return;
    this._listeners.push({ type: type, handler: handler, capture: capture === true, removed: false });
  };
  El.prototype.removeEventListener = function(type, handler, capture) {
    const wantCapture = capture === true;
    for (const l of this._listeners) {
      if (l.type === type && l.handler === handler && l.capture === wantCapture) l.removed = true;
    }
  };
  El.prototype.listenerCount = function(type) {
    return this._listeners.filter((l) => l.type === type && !l.removed).length;
  };
  Object.defineProperty(El.prototype, 'classList', {
    get: function() {
      const tokens = this._classTokens;
      const self = this;
      return {
        add: function() {
          for (const t of arguments) if (tokens.indexOf(t) === -1) tokens.push(t);
          self.className = tokens.join(' ');
        },
        remove: function() {
          for (const t of arguments) {
            const i = tokens.indexOf(t);
            if (i >= 0) tokens.splice(i, 1);
          }
          self.className = tokens.join(' ');
        },
        contains: function(t) {
          return tokens.indexOf(t) !== -1;
        },
        toggle: function(t, on) {
          const has = tokens.indexOf(t) !== -1;
          const want = on === undefined ? !has : on === true;
          if (want && !has) this.add(t);
          if (!want && has) this.remove(t);
        }
      };
    }
  });

  function dispatchEvent(target, type, extra) {
    const event = Object.assign(
      {
        type: type,
        target: target,
        bubbles: true,
        cancelable: true,
        defaultPrevented: false,
        stopped: false,
        stoppedImmediate: false,
        preventDefault: function() {
          this.defaultPrevented = true;
        },
        stopPropagation: function() {
          this.stopped = true;
        },
        stopImmediatePropagation: function() {
          this.stopped = true;
          this.stoppedImmediate = true;
        }
      },
      extra || {}
    );
    const path = [];
    let node = target;
    while (node) {
      path.push(node);
      node = node.parentNode;
    }
    function invoke(current, capturePhase) {
      const list = current._listeners.slice();
      for (const l of list) {
        if (l.removed || l.capture !== capturePhase) continue;
        l.handler(event);
        if (event.stoppedImmediate) return;
      }
    }
    for (let i = path.length - 1; i >= 0 && !event.stopped; i--) invoke(path[i], true);
    if (!event.stopped) {
      for (let i = 0; i < path.length && !event.stopped; i++) invoke(path[i], false);
    }
    return event;
  }

  return {
    El: El,
    dispatchClick: function(target) {
      return dispatchEvent(target, 'click');
    },
    dispatchKeydown: function(target, key) {
      return dispatchEvent(target, 'keydown', { key: key });
    }
  };
}

/**
 * Ay Özeti modal etkileşim sahiplerini gerçek kaynaktan yükleyip production zincirini kurar:
 * ensureMonthlyTodoModalMounted → bindMonthlyTodoModalDelegatedInteraction (canonical owner)
 * (+ varsa eski duplicate body owner, regresyon yakalanabilsin diye yüklenir).
 */
function createMonthlyTodoHarness() {
  const dom = createMiniDom();
  const el = (tag, cls, attrs) => {
    const node = new dom.El(tag);
    if (cls) node.setAttribute('class', cls);
    if (attrs) for (const k of Object.keys(attrs)) node.setAttribute(k, attrs[k]);
    return node;
  };

  const modal = el('div', 'modal-overlay monthly-todo-modal-overlay', { id: 'monthly-todo-modal' });
  const container = el('div', 'modal-container monthly-todo-modal-container');
  const body = el('div', 'modal-body monthly-todo-modal-body');
  const row = el('div', 'monthly-todo-task-row', {
    'data-vehicle-id': 'v-1',
    role: 'listitem',
    tabindex: '0'
  });
  const plateCol = el('span', 'monthly-todo-cell monthly-todo-plate-col');
  const plateSpan = el('span', 'monthly-todo-plate');
  const waLink = el('a', 'monthly-todo-wa-link monthly-todo-whatsapp-btn', {
    href: '#',
    'data-wa-url': 'https://wa.me/900000000000',
    'data-reminder-key': 'monthlyTodo:v-1:sigorta:no-date'
  });
  modal.appendChild(container);
  container.appendChild(body);
  body.appendChild(row);
  row.appendChild(plateCol);
  plateCol.appendChild(plateSpan);
  row.appendChild(waLink);

  const rafQueue = [];
  const stats = {
    closeCalls: 0,
    openCalls: 0,
    bridgeCalls: 0,
    detailRequests: [],
    filterCloseCalls: 0
  };

  const sandbox = {
    console: console,
    MONTHLY_TODO_INTERACTION_REV: readInteractionRev(),
    monthlyTodoBranchFilterId: 'all',
    countOpenCall: function() {
      stats.openCalls += 1;
    },
    document: {
      getElementById: function(id) {
        return id === 'monthly-todo-modal' ? modal : null;
      }
    },
    closeMonthlyTodoModal: function() {
      stats.closeCalls += 1;
    },
    closeMonthlyTodoBranchFilter: function() {
      stats.filterCloseCalls += 1;
    },
    setMonthlyTodoBranchFilterOpen: function() {},
    isMonthlyTodoDesktopView: function() {
      return false;
    },
    renderMonthlyTodoModalContent: function() {},
    wireMonthlyTodoWhatsAppLinkHandler: function() {}
  };
  sandbox.window = sandbox;
  sandbox.window.requestAnimationFrame = function(cb) {
    rafQueue.push(cb);
    return rafQueue.length;
  };
  sandbox.window.medisaOpenVehicleDetailFromNotification = function(vehicleId, options) {
    stats.bridgeCalls += 1;
    stats.detailRequests.push({ vehicleId: vehicleId, options: options });
    return Promise.resolve();
  };

  const owners = loadMonthlyTodoOwners(sandbox);

  function flushRaf() {
    let guard = 0;
    while (rafQueue.length) {
      assert.ok(guard++ < 50, 'rAF zinciri makul uzunlukta olmalı');
      rafQueue.shift()();
    }
  }

  return {
    dom: dom,
    modal: modal,
    container: container,
    body: body,
    row: row,
    plateSpan: plateSpan,
    waLink: waLink,
    stats: stats,
    hasDuplicateBodyOwner: owners.hasDuplicateOwner,
    bindModal: owners.api.bindModal,
    wire: function() {
      owners.api.bindModal(modal);
      return owners;
    },
    flushRaf: flushRaf,
    click: function(target) {
      return dom.dispatchClick(target || row);
    },
    enter: function(target) {
      return dom.dispatchKeydown(target || row, 'Enter');
    }
  };
}

/**
 * script-core.js global modül spinner owner'ı (show/hide + depth + element).
 * rAF kuyruğu test tarafından kontrol edilir: gecikmiş aktivasyon simüle edilir.
 */
function createSpinnerHarness() {
  const dom = createMiniDom();
  const bodyEl = new dom.El('body');
  const rafQueue = [];
  const doc = {
    body: bodyEl,
    createElement: function(tag) {
      return new dom.El(tag);
    },
    getElementById: function(id) {
      return bodyEl.childNodes.filter((n) => n.id === id)[0] || null;
    }
  };
  const sandbox = {
    console: console,
    document: doc,
    requestAnimationFrame: function(cb) {
      rafQueue.push(cb);
      return rafQueue.length;
    }
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(
    extractBetween(scriptCore, 'var _moduleSpinnerEl = null;', '/** Kaporta SVG metni') +
      '\nthis.__spinner = {' +
      'show: showModuleSpinner,' +
      'hide: hideModuleSpinner,' +
      'depth: function() { return _moduleSpinnerDepth; },' +
      'el: function() { return _moduleSpinnerEl; },' +
      'setEl: function(v) { _moduleSpinnerEl = v; }' +
      '};',
    sandbox
  );
  const api = sandbox.__spinner;
  return {
    dom: dom,
    doc: doc,
    body: bodyEl,
    rafQueue: rafQueue,
    show: api.show,
    hide: api.hide,
    depth: api.depth,
    el: api.el,
    setEl: api.setEl,
    active: function() {
      const el = api.el();
      return !!(el && el.classList.contains('active'));
    },
    overlayCount: function() {
      return bodyEl.childNodes.filter((n) => n.id === 'module-load-spinner').length;
    },
    newOverlayEl: function() {
      return new dom.El('div');
    },
    flushRaf: function() {
      let guard = 0;
      while (rafQueue.length) {
        assert.ok(guard++ < 50, 'rAF zinciri makul uzunlukta olmalı');
        rafQueue.shift()();
      }
    }
  };
}

/**
 * Bildirim/Ay Özeti köprüsü (script-core) + gerçek spinner owner'ı aynı bağlamda.
 * ensureMedisaTasitlarModuleReady kontrollü deferred ile sağlanır (hydrate / lazy senaryoları).
 */
function createNotificationBridgeHarness() {
  const dom = createMiniDom();
  const bodyEl = new dom.El('body');
  const rafQueue = [];
  const doc = {
    body: bodyEl,
    createElement: function(tag) {
      return new dom.El(tag);
    },
    getElementById: function(id) {
      return bodyEl.childNodes.filter((n) => n.id === id)[0] || null;
    }
  };
  const stats = { detailCalls: [], returnFlags: [], loadErrors: 0 };
  let resolveEnsure = null;
  let rejectEnsure = null;
  const ensurePromise = new Promise(function(resolve, reject) {
    resolveEnsure = resolve;
    rejectEnsure = reject;
  });
  const sandbox = {
    console: console,
    Promise: Promise,
    document: doc,
    requestAnimationFrame: function(cb) {
      rafQueue.push(cb);
      return rafQueue.length;
    },
    showTasitlarModuleLoadError: function() {
      stats.loadErrors += 1;
    },
    ensureMedisaTasitlarModuleReady: function() {
      return ensurePromise;
    }
  };
  sandbox.window = sandbox;
  sandbox.showVehicleDetail = function(vehicleId) {
    stats.detailCalls.push(vehicleId);
    return Promise.resolve();
  };
  sandbox.medisaSetVehicleDetailReturnToMonthlyTodo = function(active) {
    stats.returnFlags.push(active);
  };
  vm.createContext(sandbox);
  vm.runInContext(
    [
      extractBetween(scriptCore, 'var _moduleSpinnerEl = null;', '/** Kaporta SVG metni'),
      extractNamedFunction(scriptCore, 'ensureVehicleNotificationTargetReady'),
      extractBetween(
        scriptCore,
        'window.medisaOpenVehicleDetailFromNotification = function',
        'window.medisaOpenVehicleHistoryFromNotification = function'
      )
    ].join('\n') +
      '\nthis.__bridge = window.medisaOpenVehicleDetailFromNotification;' +
      '\nthis.__spinnerState = {' +
      'depth: function() { return _moduleSpinnerDepth; },' +
      'el: function() { return _moduleSpinnerEl; }' +
      '};',
    sandbox
  );
  const spinnerEl = () => sandbox.__spinnerState.el();
  return {
    stats: stats,
    ensureReady: function() {
      resolveEnsure();
      return this;
    },
    ensureFail: function(err) {
      rejectEnsure(err || new Error('ensure fail'));
      return this;
    },
    bridge: sandbox.__bridge,
    depth: sandbox.__spinnerState.depth,
    active: function() {
      const el = spinnerEl();
      return !!(el && el.classList.contains('active'));
    },
    overlayCount: function() {
      return bodyEl.childNodes.filter((n) => n.id === 'module-load-spinner').length;
    },
    flushRaf: function() {
      while (rafQueue.length) rafQueue.shift()();
    }
  };
}

/** Tarayıcı sırası: önce görev microtask'ları, sonra rAF frame callback'leri. */
function drainMicrotasks() {
  return new Promise(function(resolve) {
    setImmediate(resolve);
  });
}

/* ------------------------------------------------------------------ */
/* 1) Ay Özeti satır tıklaması — tek canonical event owner              */
/* ------------------------------------------------------------------ */

async function monthlyTodoOwnerTests() {
  await run('Ay Özeti: satırdaki iç elemente tek click → tek open + tek köprü + tek detay isteği', function() {
    const h = createMonthlyTodoHarness();
    h.wire();
    h.click(h.plateSpan);
    assert.equal(h.stats.openCalls, 1, 'openMonthlyTodoRowVehicleDetail 1 kez çağrılmalı');
    assert.equal(h.stats.closeCalls, 1, 'modal kapanışı 1 kez tetiklenmeli');
    assert.equal(h.stats.bridgeCalls, 0, 'köprü rAF sonrası çağrılır');
    h.flushRaf();
    assert.equal(h.stats.bridgeCalls, 1, 'medisaOpenVehicleDetailFromNotification 1 kez çağrılmalı');
    assert.equal(h.stats.detailRequests.length, 1, 'tek detay isteği üretilmeli');
  });

  await run('Ay Özeti: satır click sorumluluğu tek owner (body duplicate row-click listener yok)', function() {
    const h = createMonthlyTodoHarness();
    h.wire();
    assert.equal(h.hasDuplicateBodyOwner, false, 'duplicate body owner kaynakta bulunmamalı');
    assert.equal(h.modal.listenerCount('click'), 1, 'modal-level click owner tekil olmalı');
    assert.equal(h.body.listenerCount('click'), 0, 'body-level duplicate click owner olmamalı');
    h.click(h.plateSpan);
    h.flushRaf();
    assert.equal(h.stats.openCalls, 1, 'click başına tek açılış olmalı');
  });

  await run('Ay Özeti: click hedefi satır kökü olsa da tek açılış', function() {
    const h = createMonthlyTodoHarness();
    h.wire();
    h.click(h.row);
    h.flushRaf();
    assert.equal(h.stats.openCalls, 1);
    assert.equal(h.stats.bridgeCalls, 1);
  });

  await run('Ay Özeti: WhatsApp link click taşıt detayı açmaz', function() {
    const h = createMonthlyTodoHarness();
    h.wire();
    h.click(h.waLink);
    h.flushRaf();
    assert.equal(h.stats.openCalls, 0, 'WA link taşıt detayını açmamalı');
    assert.equal(h.stats.bridgeCalls, 0);
  });

  await run('Ay Özeti: Enter tuşu satır detayını bir kez açar', function() {
    const h = createMonthlyTodoHarness();
    h.wire();
    h.enter(h.row);
    h.flushRaf();
    assert.equal(h.stats.openCalls, 1);
    assert.equal(h.stats.bridgeCalls, 1);
  });

  await run('Ay Özeti: binding tekrar çağrılsa da click başına tek açılış (idempotent)', function() {
    const h = createMonthlyTodoHarness();
    h.wire();
    h.bindModal(h.modal);
    h.bindModal(h.modal);
    assert.equal(h.modal.listenerCount('click'), 1, 'rebind duplicate listener üretmemeli');
    h.click(h.plateSpan);
    h.flushRaf();
    assert.equal(h.stats.openCalls, 1);
    assert.equal(h.stats.bridgeCalls, 1);
    assert.equal(h.stats.detailRequests.length, 1);
  });

  await run('Ay Özeti: detay köprüsü returnToMonthlyTodo sözleşmesini korur', function() {
    const h = createMonthlyTodoHarness();
    h.wire();
    h.click(h.plateSpan);
    h.flushRaf();
    assert.equal(h.stats.detailRequests.length, 1);
    assert.equal(h.stats.detailRequests[0].vehicleId, 'v-1');
    assert.equal(h.stats.detailRequests[0].options.returnToMonthlyTodo, true);
  });
}


/* ------------------------------------------------------------------ */
/* 2) Global modül spinner — stale rAF guard + ref-count invariant      */
/* ------------------------------------------------------------------ */

async function spinnerBehaviorTests() {
  await run('spinner: show → hide → gecikmiş rAF active ekleyemez (depth 0 iken kapalı)', function() {
    const s = createSpinnerHarness();
    assert.equal(s.depth(), 0);
    s.show();
    assert.equal(s.depth(), 1);
    s.hide();
    assert.equal(s.depth(), 0, 'hide sonrası depth 0 olmalı');
    assert.equal(s.active(), false);
    s.flushRaf();
    assert.equal(s.depth(), 0);
    assert.equal(s.active(), false, 'gecikmiş rAF active eklememeli');
  });

  await run('spinner: iki show / iki hide sonundaki gecikmiş rAF overlay açık bırakmaz', function() {
    const s = createSpinnerHarness();
    s.show();
    s.show();
    assert.equal(s.depth(), 2);
    assert.equal(s.active(), true, 'ikinci show anında aktif olmalı');
    s.hide();
    assert.equal(s.depth(), 1);
    assert.equal(s.active(), true, 'depth > 0 iken açık kalmalı');
    s.hide();
    assert.equal(s.depth(), 0);
    assert.equal(s.active(), false);
    s.flushRaf();
    assert.equal(s.depth(), 0);
    assert.equal(s.active(), false, 'gecikmiş rAF zinciri aktif bırakmamalı');
  });

  await run('spinner: nested ref-count show/show/hide → aktif kalır, ikinci hide kapatır', function() {
    const s = createSpinnerHarness();
    s.show();
    s.flushRaf();
    s.show();
    s.hide();
    assert.equal(s.depth(), 1);
    assert.equal(s.active(), true, 'bekleyen show varken aktif kalmalı');
    s.hide();
    assert.equal(s.depth(), 0);
    assert.equal(s.active(), false, 'son hide overlayı kapatmalı');
    s.flushRaf();
    assert.equal(s.active(), false);
  });

  await run('spinner: element zaten oluşmuşsa show anında aktif olur, hide kapatır', function() {
    const s = createSpinnerHarness();
    s.show();
    s.flushRaf();
    s.hide();
    assert.equal(s.active(), false);
    s.show();
    assert.equal(s.depth(), 1);
    assert.equal(s.active(), true, 'canonical element varsa rAF beklenmez');
    s.hide();
    assert.equal(s.active(), false);
    assert.equal(s.overlayCount(), 1, 'tek canonical overlay elementi korunur');
  });

  await run('spinner: fazla hide depth negatife düşmez ve overlay aktif kalmaz', function() {
    const s = createSpinnerHarness();
    s.show();
    s.hide();
    s.hide();
    s.hide();
    assert.equal(s.depth(), 0, 'depth 0 altına düşmemeli');
    assert.equal(s.active(), false);
    s.flushRaf();
    assert.equal(s.active(), false);
  });

  await run('spinner: gecikmiş rAF canonical olmayan elemente active ekleyemez', function() {
    const s = createSpinnerHarness();
    s.show();
    const scheduledEl = s.el();
    const otherEl = s.newOverlayEl();
    s.hide();
    s.setEl(otherEl);
    s.flushRaf();
    assert.equal(otherEl.classList.contains('active'), false, 'yeni element etkilenmemeli');
    assert.equal(scheduledEl.classList.contains('active'), false, 'eski elemente active yazılmamalı');
    assert.equal(s.active(), false);
  });

  await run('spinner: gecikmiş rAF guard kaynakta depth + element kimliği ile korunuyor', function() {
    const src = extractBetween(scriptCore, 'var _moduleSpinnerEl = null;', '/** Kaporta SVG metni');
    const rafBlock = src.slice(src.indexOf('requestAnimationFrame(function'));
    assert.match(rafBlock, /if \(_moduleSpinnerDepth <= 0\) return;/);
    assert.match(rafBlock, /if \(_moduleSpinnerEl !== scheduledEl\) return;/);
    assert.match(
      src,
      /function hideModuleSpinner\(\) \{\s*_moduleSpinnerDepth = Math\.max\(0, _moduleSpinnerDepth - 1\);\s*if \(_moduleSpinnerDepth > 0\) return;/
    );
  });
}


/* ------------------------------------------------------------------ */
/* 3) Bildirim / Ay Özeti köprüsü — spinner kapanış matrisi             */
/* ------------------------------------------------------------------ */

async function notificationBridgeTests() {
  await run('CASE 3 modül hydrate: köprü sonrası spinner kapanır, stale rAF geri açamaz', async function() {
    const h = createNotificationBridgeHarness();
    const promise = h.bridge('v-1', { returnToMonthlyTodo: true });
    assert.equal(h.depth(), 1, 'köprü senkron kısmında depth 1 olmalı');
    h.ensureReady();
    await drainMicrotasks();
    assert.equal(h.depth(), 0, 'modül hazır akışı aynı görevde kapanmalı');
    assert.equal(h.active(), false);
    h.flushRaf();
    assert.equal(h.depth(), 0);
    assert.equal(h.active(), false, 'gecikmiş rAF spinnerı geri açamaz');
    assert.deepEqual(h.stats.detailCalls, ['v-1']);
    assert.deepEqual(h.stats.returnFlags, [true]);
    await promise;
  });

  await run('CASE 4 modül lazy: ensure beklerken spinner görünür, tamamlanınca kapanır', async function() {
    const h = createNotificationBridgeHarness();
    const promise = h.bridge('v-1', { returnToMonthlyTodo: true });
    await drainMicrotasks();
    h.flushRaf();
    assert.equal(h.depth(), 1, 'lazy ensure sırasında depth 1 olmalı');
    assert.equal(h.active(), true, 'bekleyen yüklemede overlay görünür olmalı');
    assert.deepEqual(h.stats.detailCalls, [], 'modül hazır olmadan detay açılmamalı');
    h.ensureReady();
    await drainMicrotasks();
    assert.equal(h.depth(), 0);
    assert.equal(h.active(), false, 'detay açıldıktan sonra overlay kapanmalı');
    assert.deepEqual(h.stats.detailCalls, ['v-1']);
    h.flushRaf();
    assert.equal(h.active(), false);
    await promise;
  });

  await run('CASE 6 bildirim kartı: opsiyonsuz köprü returnToMonthlyTodo bayrağını set etmez', async function() {
    const h = createNotificationBridgeHarness();
    const promise = h.bridge('v-1');
    h.ensureReady();
    await drainMicrotasks();
    h.flushRaf();
    assert.deepEqual(h.stats.returnFlags, [], 'opsiyon verilmezse bayrak set edilmemeli');
    assert.deepEqual(h.stats.detailCalls, ['v-1']);
    assert.equal(h.active(), false);
    assert.equal(h.overlayCount(), 1, 'tek canonical overlay elementi kullanılır');
    await promise;
  });

  await run('köprü ensure hatasında da spinnerı kapatır (finally ref-count)', async function() {
    const h = createNotificationBridgeHarness();
    const promise = h.bridge('v-1', { returnToMonthlyTodo: true }).catch(function() {});
    h.ensureFail(new Error('ensure fail'));
    await drainMicrotasks();
    h.flushRaf();
    assert.equal(h.depth(), 0, 'hata yolunda da depth 0 olmalı');
    assert.equal(h.active(), false, 'hata yolunda overlay kapanmalı');
    assert.equal(h.stats.loadErrors, 1, 'modül yükleme hatası bildirilmeli');
    await promise;
  });

  await run('köprü tek detay isteği üretir (duplicate showVehicleDetail yok)', async function() {
    const h = createNotificationBridgeHarness();
    const promise = h.bridge('v-9', { returnToMonthlyTodo: true });
    h.ensureReady();
    await drainMicrotasks();
    h.flushRaf();
    assert.deepEqual(h.stats.detailCalls, ['v-9'], 'tek fiziksel click tek detay isteği üretmeli');
    assert.equal(h.stats.returnFlags.length, 1);
    await promise;
  });
}


/* ------------------------------------------------------------------ */
/* 4) Kaynak kontratları — geri dönüş akışı ve normal Taşıtlar yolu     */
/* ------------------------------------------------------------------ */

async function sourceContractTests() {
  await run('CASE 5 geri dönüş: tek listener → tek modal açılışı ve tek return bayrağı', function() {
    assert.equal(
      countMatches(notifications, /addEventListener\('medisa:open-monthly-todo-return'/g),
      1,
      'Ay Özeti geri dönüş listener owner tekil olmalı'
    );
    const idx = notifications.indexOf("addEventListener('medisa:open-monthly-todo-return'");
    const listenerBody = notifications.slice(idx, idx + 220);
    assert.equal(countMatches(listenerBody, /openMonthlyTodoModal\(\)/g), 1, 'modal tek kez açılmalı');
    assert.equal(countMatches(notifications, /returnToMonthlyTodo: true/g), 1, 'tek return köprüsü olmalı');
    assert.match(
      tasitlar,
      /if \(returnToMonthlyTodoAfterVehicleDetail\) \{\s*returnToMonthlyTodoAfterVehicleDetail = false;\s*window\.dispatchEvent\(new CustomEvent\('medisa:open-monthly-todo-return'\)\);/
    );
  });

  await run('CASE 1 normal Taşıtlar yolu: global spinner kullanılmaz, detay owner değişmedi', function() {
    assert.match(
      tasitlar,
      /function handleVehicleRowClick\(e\)[\s\S]*?window\.showVehicleDetail\(row\.dataset\.vehicleId\);/
    );
    assert.equal(countMatches(tasitlar, /showModuleSpinner\(/g), 0, 'Taşıtlar listesi global spinner kullanmamalı');
    assert.equal(
      countMatches(tasitlar, /var requestGen = \+\+vehicleDetailRequestGeneration;/g),
      1,
      'tek generation owner'
    );
  });

  await run('bildirimden detay köprüsü ensure + finally kontratını korur', function() {
    assert.match(scriptCore, /medisaOpenVehicleDetailFromNotification[\s\S]*?ensureVehicleNotificationTargetReady/);
    assert.match(
      scriptCore,
      /medisaOpenVehicleDetailFromNotification[\s\S]*?finally\(function\(\) \{\s*hideModuleSpinner\(\);/
    );
    assert.equal(
      countMatches(scriptCore, /returnToMonthlyTodo === true/g),
      2,
      'iki köprü opsiyonu aynı sözleşmeyi kullanır'
    );
  });

  await run('notifications.js: duplicate body row-click owner kalıntısı yok', function() {
    assert.doesNotMatch(notifications, /_medisaMonthlyTodoBodyClickHandler/);
    assert.doesNotMatch(notifications, /_medisaMonthlyTodoBodyRev/);
    assert.doesNotMatch(notifications, /bodyEl\.addEventListener\('click'/);
    assert.doesNotMatch(notifications, /openMonthlyTodoRowVehicleDetail\(row, bodyEl/);
    assert.equal(
      countMatches(notifications, /openMonthlyTodoRowVehicleDetail\(row, modalEl\)/g),
      2,
      'row açılışı yalnız capture click + keydown owner üzerinden çağrılmalı'
    );
  });
}

/* ------------------------------------------------------------------ */
/* Runner                                                              */
/* ------------------------------------------------------------------ */

(async function main() {
  await monthlyTodoOwnerTests();
  await spinnerBehaviorTests();
  await notificationBridgeTests();
  await sourceContractTests();
  console.log('\nMonthly todo vehicle detail spinner invariants: ' + passed + ' passed, ' + failed + ' failed');
  if (failed > 0) process.exitCode = 1;
})().catch(function(err) {
  console.error(err);
  process.exit(1);
});

