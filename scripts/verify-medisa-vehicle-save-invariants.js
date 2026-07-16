/**
 * Araç kayıt / save zinciri invariant testleri (Node 20+, yerleşik modüller).
 * Çalıştır: npm run tool:verify-vehicle-save
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

const EXPECTED_DIRECT_DATAAPI_CALLERS = 0;
const EXPECTED_KAYIT_JS = '20260712.3';
const EXPECTED_TASITLAR_JS = '20260712.6';
const EXPECTED_AYARLAR_JS = '20260716.3';
const EXPECTED_SCRIPT_CORE_QUERY = '20260716.2';
const EXPECTED_VEHICLE_NOTIFICATION_DOMAIN = '20260712.1';
const EXPECTED_DRIVER_SCRIPT_QUERY = '20260716.1';
const EXPECTED_SW_CACHE = 'medisa-v2.237';
const EXPECTED_NOTIFICATIONS = '20260716.1';
const EXPECTED_RAPORLAR = '20260712.1';
const EXPECTED_KAYIT_CSS = '20260708.1';
const EXPECTED_AYARLAR_CSS = '20260716.3';
const EXPECTED_TASITLAR_YAZICI = '20260517.5';

const EXPECTED_REGISTRY_VERSIONS = {
  tasitlar: EXPECTED_TASITLAR_JS,
  notifications: EXPECTED_NOTIFICATIONS,
  raporlar: EXPECTED_RAPORLAR,
  kayitJs: EXPECTED_KAYIT_JS,
  kayitCss: EXPECTED_KAYIT_CSS,
  ayarlarJs: EXPECTED_AYARLAR_JS,
  ayarlarCss: EXPECTED_AYARLAR_CSS,
  tasitlarYazici: EXPECTED_TASITLAR_YAZICI,
  vehicleNotificationDomain: EXPECTED_VEHICLE_NOTIFICATION_DOMAIN,
};

/** Modüller: internal/registry/loader üçlü parity veya registry-türevli sürüm sözleşmesi. */
const MODULE_VERSION_CONTRACTS = [
  {
    name: 'tasitlar',
    registryKey: 'tasitlar',
    file: 'tasitlar.js',
    contractKind: 'FULL_VERSION_CONTRACT',
    internalPattern: /MEDISA_TASITLAR_MODULE_VERSION\s*=\s*'([^']+)'/,
    versionPublishPattern: /window\.__medisaTasitlarModuleVersion\s*=\s*MEDISA_TASITLAR_MODULE_VERSION/,
    readyInitPattern: /window\.__medisaTasitlarModuleReady\s*=\s*false/,
    readyPublishPattern: /window\.__medisaTasitlarModuleReady\s*=\s*true/,
    loaderVersionCheck: /__medisaTasitlarModuleVersion === V\.tasitlar/,
    loaderStaleInvalidate: /__medisaTasitlarModuleReady === true && window\.__medisaTasitlarModuleVersion !== V\.tasitlar/,
    loaderAsset: 'tasitlar.js',
  },
  {
    name: 'kayit',
    registryKey: 'kayitJs',
    file: 'kayit.js',
    contractKind: 'REGISTRY_DERIVED_VERSION',
    versionPublishPattern: /window\.__medisaKayitModuleVersion\s*=\s*\(window\.MEDISA_MODULE_VERSIONS && window\.MEDISA_MODULE_VERSIONS\.kayitJs\)/,
    readyPublishPattern: /window\.__medisaKayitModuleReady\s*=\s*true/,
    loaderVersionCheck: /__medisaKayitModuleVersion === V\.kayitJs/,
    loaderStaleInvalidate: /__medisaKayitModuleReady === true && window\.__medisaKayitModuleVersion !== V\.kayitJs/,
    loaderAsset: 'kayit.js',
  },
];

/** Sürüm karşılaştırması olmayan modüller: ready flag / API / doğrudan script sözleşmesi. */
const MODULE_BOOT_CONTRACTS = [
  {
    name: 'notifications',
    registryKey: 'notifications',
    file: 'notifications.js',
    contractKind: 'READY_FLAG_ONLY',
    readyInitPattern: /window\.__medisaNotificationsModuleReady\s*=\s*false/,
    readyPublishPattern: /window\.__medisaNotificationsModuleReady\s*=\s*true/,
    loaderReadyCheck: /__medisaNotificationsModuleReady === true/,
    loaderAsset: 'notifications.js',
    loaderNoVersionCheck: true,
  },
  {
    name: 'raporlar',
    registryKey: 'raporlar',
    file: 'raporlar.js',
    contractKind: 'FUNCTION_API_ONLY',
    moduleApiPattern: /window\.openReportsView\s*=\s*function/,
    loaderAsset: 'raporlar.js',
    loaderUsesLazyWrapper: true,
  },
  {
    name: 'vehicleNotificationDomain',
    registryKey: 'vehicleNotificationDomain',
    file: 'vehicle-notification-domain.js',
    contractKind: 'NAMESPACE_VALIDATOR',
    namespaceExportPattern: /window\.MedisaVehicleNotificationDomain\s*=/,
    loaderAsset: 'vehicle-notification-domain.js',
    loaderValidator: /isMedisaVehicleNotificationDomainValid/,
  },
  {
    name: 'tasitlarYazici',
    registryKey: 'tasitlarYazici',
    file: 'tasitlar.js',
    contractKind: 'REGISTRY_QUERY_REFERENCE',
    registryReferencePattern: /MEDISA_MODULE_VERSIONS\.tasitlarYazici/,
    fallbackVersion: EXPECTED_TASITLAR_YAZICI,
    loadedFrom: 'tasitlar.js',
  },
];

const REGISTRY_LOADER_ASSET_BINDINGS = [
  { registryKey: 'tasitlar', asset: 'tasitlar.js' },
  { registryKey: 'notifications', asset: 'notifications.js' },
  { registryKey: 'raporlar', asset: 'raporlar.js' },
  { registryKey: 'kayitJs', asset: 'kayit.js' },
  { registryKey: 'kayitCss', asset: 'kayit.css' },
  { registryKey: 'ayarlarJs', asset: 'ayarlar.js' },
  { registryKey: 'ayarlarCss', asset: 'ayarlar.css' },
  { registryKey: 'vehicleNotificationDomain', asset: 'vehicle-notification-domain.js' },
];

const SCRIPT_CORE_HTML_FILES = [
  'index.html',
  'driver/index.html',
  'driver/dashboard.html',
  'admin/driver-report.html',
];
const DRIVER_HTML_FILES = [
  'driver/index.html',
  'driver/dashboard.html',
];

let failed = 0;
let passed = 0;

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function parseMedisaModuleVersions(scriptCoreJs) {
  var blockMatch = scriptCoreJs.match(/var MEDISA_MODULE_VERSIONS\s*=\s*\{([\s\S]*?)\n\};/);
  assert.ok(blockMatch, 'MEDISA_MODULE_VERSIONS block not found in script-core.js');
  var registry = Object.create(null);
  var pairRe = /(\w+)\s*:\s*'([^']+)'/g;
  var match;
  while ((match = pairRe.exec(blockMatch[1])) !== null) {
    registry[match[1]] = match[2];
  }
  return registry;
}

function verifyMedisaRegistryVersions(registry) {
  Object.keys(EXPECTED_REGISTRY_VERSIONS).forEach(function(key) {
    assert.equal(
      registry[key],
      EXPECTED_REGISTRY_VERSIONS[key],
      'MEDISA_MODULE_VERSIONS.' + key + ' must be ' + EXPECTED_REGISTRY_VERSIONS[key]
    );
  });
}

function verifyRegistryLoaderAssetBindings(scriptCoreJs, registry) {
  REGISTRY_LOADER_ASSET_BINDINGS.forEach(function(binding) {
    var version = registry[binding.registryKey];
    assert.ok(version, 'registry key missing for loader binding: ' + binding.registryKey);
    var vRefPattern = new RegExp(
      binding.asset.replace('.', '\\.') + '\\?v=\' \\+ V\\.' + binding.registryKey
    );
    var medisaRefPattern = new RegExp(
      binding.asset.replace('.', '\\.') + '\\?v=\'\\s*\\+\\s*MEDISA_MODULE_VERSIONS\\.' + binding.registryKey
    );
    assert.ok(
      vRefPattern.test(scriptCoreJs) || medisaRefPattern.test(scriptCoreJs),
      'script-core loader must bind ' + binding.asset + ' to registry key ' + binding.registryKey
    );
  });
}

function verifyModuleVersionContracts(scriptCoreJs, registry) {
  MODULE_VERSION_CONTRACTS.forEach(function(contract) {
    var registryVersion = registry[contract.registryKey];
    assert.ok(registryVersion, contract.name + ': registry key missing: ' + contract.registryKey);
    assert.equal(
      registryVersion,
      EXPECTED_REGISTRY_VERSIONS[contract.registryKey],
      contract.name + ': registry version drift'
    );

    var fileContent = read(contract.file);

    if (contract.internalPattern) {
      var internalMatch = fileContent.match(contract.internalPattern);
      assert.ok(internalMatch, contract.name + ': internal version constant not found in ' + contract.file);
      assert.equal(
        internalMatch[1],
        registryVersion,
        contract.name + ': internal version must match MEDISA_MODULE_VERSIONS.' + contract.registryKey
      );
    }

    if (contract.versionPublishPattern) {
      assert.match(
        fileContent,
        contract.versionPublishPattern,
        contract.name + ': version publish pattern missing in ' + contract.file
      );
    }
    if (contract.readyInitPattern) {
      assert.match(fileContent, contract.readyInitPattern, contract.name + ': ready init=false missing');
    }
    if (contract.readyPublishPattern) {
      assert.match(fileContent, contract.readyPublishPattern, contract.name + ': ready publish=true missing');
    }
    if (contract.loaderVersionCheck) {
      assert.match(scriptCoreJs, contract.loaderVersionCheck, contract.name + ': loader version check missing');
    }
    if (contract.loaderStaleInvalidate) {
      assert.match(scriptCoreJs, contract.loaderStaleInvalidate, contract.name + ': stale ready invalidate missing');
    }
    if (contract.loaderAsset) {
      assert.match(
        scriptCoreJs,
        new RegExp(contract.loaderAsset.replace('.', '\\.') + '\\?v=\' \\+ V\\.' + contract.registryKey),
        contract.name + ': loader asset URL must use V.' + contract.registryKey
      );
    }
  });
}

function verifyModuleBootContracts(scriptCoreJs, registry, swJs) {
  MODULE_BOOT_CONTRACTS.forEach(function(contract) {
    var registryVersion = registry[contract.registryKey];
    assert.ok(registryVersion, contract.name + ': registry key missing: ' + contract.registryKey);

    if (contract.file && contract.file !== 'tasitlar.js') {
      var fileContent = read(contract.file);
      if (contract.readyInitPattern) {
        assert.match(fileContent, contract.readyInitPattern, contract.name + ': ready init=false missing');
      }
      if (contract.readyPublishPattern) {
        assert.match(fileContent, contract.readyPublishPattern, contract.name + ': ready publish=true missing');
      }
      if (contract.moduleApiPattern) {
        assert.match(fileContent, contract.moduleApiPattern, contract.name + ': module API export missing');
      }
      if (contract.namespaceExportPattern) {
        assert.match(fileContent, contract.namespaceExportPattern, contract.name + ': namespace export missing');
      }
    }

    if (contract.registryReferencePattern) {
      var hostContent = read(contract.loadedFrom || contract.file);
      assert.match(hostContent, contract.registryReferencePattern, contract.name + ': registry reference missing');
      if (contract.fallbackVersion) {
        assert.match(
          hostContent,
          new RegExp("\\|\\|\\s*'" + contract.fallbackVersion.replace(/\./g, '\\.') + "'"),
          contract.name + ': fallback version must match registry default'
        );
      }
    }

    if (contract.loaderReadyCheck) {
      assert.match(scriptCoreJs, contract.loaderReadyCheck, contract.name + ': loader ready check missing');
    }
    if (contract.loaderNoVersionCheck) {
      assert.doesNotMatch(
        scriptCoreJs,
        /__medisaNotificationsModuleVersion/,
        contract.name + ': must not use version-based ready without internal contract'
      );
    }
    if (contract.loaderAsset) {
      var assetEsc = contract.loaderAsset.replace(/\./g, '\\.');
      var vLine = new RegExp(assetEsc + "\\?v=' \\+ V\\." + contract.registryKey);
      var medisaLine = new RegExp(assetEsc + "\\?v='[\\s\\S]{0,120}MEDISA_MODULE_VERSIONS\\." + contract.registryKey);
      assert.ok(
        vLine.test(scriptCoreJs) || medisaLine.test(scriptCoreJs),
        contract.name + ': loader asset URL must use registry version'
      );
    }
    if (contract.loaderValidator) {
      assert.match(scriptCoreJs, contract.loaderValidator, contract.name + ': loader validator missing');
    }
    if (contract.loaderUsesLazyWrapper) {
      assert.match(scriptCoreJs, /window\.openReportsView\s*=\s*function\s*\(\)\s*\{[\s\S]*loadAppModule\(RAPORLAR_JS/, contract.name + ': lazy wrapper must load module before delegate');
      assert.match(scriptCoreJs, /openVehiclesView !== lazyOpenVehiclesView/, 'tasitlar lazy wrapper must distinguish stub from real API');
    }
  });

  assert.match(
    swJs,
    new RegExp("CACHE_RAPORLAR_VERSION = 'medisa-raporlar-" + registry.raporlar + "'"),
    'sw.js CACHE_RAPORLAR_VERSION must track MEDISA_MODULE_VERSIONS.raporlar'
  );
}

function verifyOlayEgzozFlowInvariants() {
  var indexHtml = read('index.html');
  var kayitJs = read('kayit.js');
  var tasitlarJs = read('tasitlar.js');

  assert.match(indexHtml, /if \(!window\.closeVehicleEgzozQuestionFlow\)/, 'egzoz confirm close fallback guard missing');
  assert.match(indexHtml, /window\.closeVehicleEgzozQuestionFlow\s*=\s*function/, 'egzoz confirm close early fallback missing');
  assert.match(indexHtml, /if \(!window\.cancelVehicleEgzozDateModal\)/, 'egzoz date cancel fallback guard missing');
  assert.match(indexHtml, /window\.cancelVehicleEgzozDateModal\s*=\s*function/, 'egzoz date cancel early fallback missing');
  assert.match(indexHtml, /function hideEgzozModal\(id\)/, 'egzoz modal hide helper missing in shell');
  assert.match(indexHtml, /onclick="closeVehicleEgzozQuestionFlow\(\)"/, 'egzoz confirm close button must call global handler');
  assert.match(indexHtml, /onclick="cancelVehicleEgzozDateModal\(\)"/, 'egzoz date cancel button must call global handler');
  assert.match(indexHtml, /id="event-menu-modal"/, 'event menu modal shell missing');
  assert.match(indexHtml, /id="dinamik-olay-modal"/, 'dynamic event modal shell missing');
  assert.match(indexHtml, /id="vehicle-egzoz-confirm-modal"/, 'egzoz confirm modal shell missing');
  assert.match(indexHtml, /id="vehicle-egzoz-date-modal"/, 'egzoz date modal shell missing');

  [
    'window.confirmVehicleEgzozSameDate',
    'window.confirmVehicleEgzozDifferentDate',
    'window.saveVehicleEgzozDateModal',
    'window.cancelVehicleEgzozDateModal',
    'window.closeVehicleEgzozQuestionFlow',
  ].forEach(function(symbol) {
    assert.match(
      kayitJs,
      new RegExp(symbol.replace(/\./g, '\\.') + '\\s*=\\s*function'),
      symbol + ' canonical handler missing in kayit.js'
    );
  });
  assert.match(kayitJs, /const vehicleEgzozPromptState\s*=\s*\{/, 'egzoz prompt state owner missing');
  assert.match(kayitJs, /function maybePromptVehicleEgzozFlow\s*\(/, 'egzoz prompt entry missing');
  assert.match(kayitJs, /function showVehicleEgzozConfirmModal\s*\(/, 'egzoz confirm modal opener missing');

  assert.match(tasitlarJs, /window\.openEventModal\s*=\s*function/, 'openEventModal public API missing');
  assert.match(tasitlarJs, /var EVENT_DEFINITIONS\s*=\s*\{/, 'EVENT_DEFINITIONS owner missing');
  assert.match(tasitlarJs, /var EVENT_MENU_GROUPS\s*=\s*\[/, 'EVENT_MENU_GROUPS owner missing');
  assert.match(tasitlarJs, /muayene:\s*\{\s*menuLabel:\s*'Muayene'/, 'muayene event definition missing');
  assert.match(tasitlarJs, /getElementById\('dinamik-olay-modal'\)/, 'dinamik olay modal binding missing');
  assert.match(tasitlarJs, /getElementById\('dinamik-olay-kaydet-btn'\)/, 'dinamik olay save button binding missing');
  assert.match(tasitlarJs, /MedisaVehicleNotificationDomain\.vehicleNeedsK2Belgesi/, 'K2 metadata must use domain helper');
  assert.match(tasitlarJs, /MedisaVehicleNotificationDomain\.vehicleNeedsTakograf/, 'takograf metadata must use domain helper');

  var groupBlock = tasitlarJs.match(/var EVENT_MENU_GROUPS\s*=\s*\[([\s\S]*?)\n\s*\];/);
  assert.ok(groupBlock, 'EVENT_MENU_GROUPS block not found');
  var groupIdCount = (groupBlock[1].match(/id:\s*'[^']+'/g) || []).length;
  assert.equal(groupIdCount, 5, 'Olay Ekle menu must expose 5 category groups');
}

function pass(name, detail) {
  passed += 1;
  console.log('[PASS]', name, detail ? '- ' + detail : '');
}

function fail(name, detail) {
  failed += 1;
  console.error('[FAIL]', name, detail ? '- ' + detail : '');
}

function test(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      return result.then(function() {
        pass(name);
      }).catch(function(err) {
        fail(name, err && err.message ? err.message : String(err));
      });
    }
    pass(name);
    return Promise.resolve();
  } catch (err) {
    fail(name, err && err.message ? err.message : String(err));
    return Promise.resolve();
  }
}

function flushMicrotasks(times) {
  var n = times == null ? 3 : times;
  var chain = Promise.resolve();
  for (var i = 0; i < n; i++) {
    chain = chain.then(function() {
      return new Promise(function(resolve) {
        queueMicrotask(resolve);
      });
    });
  }
  return chain;
}

function createStorage() {
  var map = Object.create(null);
  return {
    getItem: function(key) {
      return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : null;
    },
    setItem: function(key, value) {
      map[key] = String(value);
    },
    removeItem: function(key) {
      delete map[key];
    },
    clear: function() {
      map = Object.create(null);
    },
  };
}

function createClassList() {
  var classes = new Set();
  return {
    add: function() {
      for (var i = 0; i < arguments.length; i++) classes.add(arguments[i]);
    },
    remove: function() {
      for (var i = 0; i < arguments.length; i++) classes.delete(arguments[i]);
    },
    toggle: function(name, force) {
      if (force === true) classes.add(name);
      else if (force === false) classes.delete(name);
      else if (classes.has(name)) classes.delete(name);
      else classes.add(name);
    },
    contains: function(name) {
      return classes.has(name);
    },
  };
}

function createElement(tag, attrs) {
  var el = {
    tagName: String(tag || 'DIV').toUpperCase(),
    id: '',
    className: '',
    classList: createClassList(),
    style: {},
    dataset: {},
    attributes: Object.create(null),
    children: [],
    parentElement: null,
    disabled: false,
    value: '',
    textContent: '',
    innerHTML: '',
    type: '',
    listeners: Object.create(null),
    setAttribute: function(name, value) {
      this.attributes[name] = String(value);
      if (name === 'id') this.id = String(value);
      if (name === 'aria-hidden') this.setAttribute._ariaHidden = String(value);
      if (name === 'aria-busy') this.setAttribute._ariaBusy = String(value);
      if (name === 'aria-disabled') this.setAttribute._ariaDisabled = String(value);
    },
    getAttribute: function(name) {
      if (name === 'data-type') return this.attributes['data-type'] || null;
      if (name === 'aria-busy') return this.setAttribute._ariaBusy || null;
      if (name === 'aria-disabled') return this.setAttribute._ariaDisabled || null;
      return this.attributes[name] != null ? this.attributes[name] : null;
    },
    removeAttribute: function(name) {
      delete this.attributes[name];
      if (name === 'aria-busy') delete this.setAttribute._ariaBusy;
      if (name === 'aria-disabled') delete this.setAttribute._ariaDisabled;
    },
    appendChild: function(child) {
      child.parentElement = this;
      this.children.push(child);
      return child;
    },
    querySelector: function(sel) {
      if (sel === '.vehicle-type-picker-backdrop') {
        return this._backdrop || null;
      }
      return null;
    },
    querySelectorAll: function(sel) {
      if (sel === '.vehicle-type-picker-option') {
        return this._options || [];
      }
      return [];
    },
    closest: function() { return null; },
    matches: function() { return false; },
    addEventListener: function(type, fn) {
      if (!this.listeners[type]) this.listeners[type] = [];
      this.listeners[type].push(fn);
    },
    dispatchEvent: function(evt) {
      var list = this.listeners[evt && evt.type] || [];
      list.forEach(function(fn) {
        fn.call(this, evt);
      }, this);
      return true;
    },
    focus: function() {},
    blur: function() {},
    click: function() {
      this.dispatchEvent({ type: 'click', target: this, currentTarget: this });
    },
    setSelectionRange: function() {},
  };
  if (attrs) {
    Object.keys(attrs).forEach(function(key) {
      el[key] = attrs[key];
    });
  }
  return el;
}

function createFakeJwt(payloadOverrides) {
  var payload = Object.assign({
    exp: Math.floor(Date.now() / 1000) + 3600,
    rol: 'genel_yonetici',
    user_id: 'u1',
  }, payloadOverrides || {});
  var header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64');
  var body = Buffer.from(JSON.stringify(payload)).toString('base64');
  return header + '.' + body + '.sig';
}

function createBrowserContext(options) {
  options = options || {};
  var domListeners = Object.create(null);
  var storage = createStorage();
  var sessionStorage = createStorage();
  var counters = Object.assign({
    saveDataToServer: 0,
    loadDataFromServer: 0,
    invalidateVehicleDateTasksCache: 0,
    updateNotifications: 0,
    alert: 0,
    conflictWarn: 0,
    errorLog: 0,
    dataApiSave: 0,
    writeVehicles: 0,
    showVehicleDetail: 0,
    activeFetches: 0,
    maxActiveFetches: 0,
  }, options.counters || {});

  var windowRef = {
    appData: {
      tasitlar: [{ id: 'v1', plate: '34 TEST 1', version: 1, vehicleType: 'otomobil' }],
      kayitlar: [],
      branches: [{ id: 'b1', name: 'Merkez' }],
      users: [{ id: 'u1', name: 'Test', role: 'genel_yonetici' }],
      ayarlar: {
        sirketAdi: 'Medisa',
        k2Belgesi: { expiryDate: '2030-01-01', documentPath: '', updatedAt: '' },
      },
      sifreler: [],
      arac_aylik_hareketler: [],
      duzeltme_talepleri: [],
      notificationReadState: {},
      monthlyTodoWhatsAppLogs: {},
    },
    medisaSession: {
      authenticated: true,
      role: 'genel_yonetici',
      branch_ids: ['b1'],
      user: { id: 'u1', role: 'genel_yonetici', name: 'Test' },
      permissions: {
        manage_data: true,
        manage_settings: true,
        manage_users: true,
        manage_branches: true,
        view_main_app: true,
        view_reports: true,
      },
    },
    medisaPortalSession: {
      getStoredToken: function() { return createFakeJwt(); },
      clearStoredTokens: function() {},
    },
    MEDISA_MODULE_VERSIONS: {
      kayitJs: EXPECTED_KAYIT_JS,
    },
    location: { pathname: '/', href: 'http://127.0.0.1/' },
    navigator: { onLine: true, userAgent: 'node-test', platform: 'Win32', maxTouchPoints: 0, standalone: false },
    innerWidth: 1280,
    localStorage: storage,
    sessionStorage: sessionStorage,
    __medisaRedirecting: false,
    matchMedia: function() {
      return { matches: false };
    },
    addEventListener: function(type, fn) {
      if (!domListeners[type]) domListeners[type] = [];
      domListeners[type].push(fn);
    },
    removeEventListener: function(type, fn) {
      if (!domListeners[type]) return;
      domListeners[type] = domListeners[type].filter(function(item) { return item !== fn; });
    },
    dispatchEvent: function() { return true; },
    getComputedStyle: function() {
      return { minHeight: '58px', maxHeight: '300px' };
    },
    alert: function() { counters.alert += 1; },
    invalidateVehicleDateTasksCache: function() { counters.invalidateVehicleDateTasksCache += 1; },
    updateNotifications: function() { counters.updateNotifications += 1; },
    getMedisaMainAppSessionRole: function() { return 'genel_yonetici'; },
    getMedisaVehicles: function() {
      return Array.isArray(windowRef.appData.tasitlar) ? windowRef.appData.tasitlar.slice() : [];
    },
    showVehicleDetail: function() { counters.showVehicleDetail += 1; },
    MedisaVehicleNotificationDomain: {
      vehicleNeedsTakograf: function(vehicle) {
        return String(vehicle && vehicle.vehicleType || '') === 'kamyon';
      },
      vehicleNeedsK2Belgesi: function(vehicle) {
        var t = String(vehicle && vehicle.vehicleType || '');
        return t === 'kamyon' || t === 'minivan';
      },
    },
    CustomEvent: function(type, init) {
      return { type: type, detail: init && init.detail };
    },
    Event: function(type) { return { type: type }; },
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    queueMicrotask: queueMicrotask,
    Promise: Promise,
    parseVehicleDateRawToIso: function() { return null; },
    formatNumber: function(v) { return String(v || ''); },
    formatDateShort: function(v) { return String(v || ''); },
  };

  windowRef.console = {
    warn: function(msg) {
      if (String(msg).indexOf('Çakışma:') !== -1) counters.conflictWarn += 1;
      counters.consoleWarn = (counters.consoleWarn || 0) + 1;
    },
    error: function() {
      counters.errorLog += 1;
    },
    log: function() {},
  };

  windowRef.window = windowRef;
  windowRef.global = windowRef;
  windowRef.self = windowRef;

  var body = {
    classList: createClassList(),
    dataset: {},
    removeAttribute: function() {},
  };

  var documentRef = {
    location: windowRef.location,
    readyState: options.readyState || 'complete',
    body: body,
    documentElement: { style: {} },
    getElementById: function(id) {
      if (options.elements && options.elements[id]) return options.elements[id];
      return null;
    },
    querySelector: function() { return null; },
    querySelectorAll: function() { return []; },
    addEventListener: function(type, fn) {
      windowRef.addEventListener(type, fn);
    },
    createElement: function(tag) {
      return createElement(tag);
    },
  };

  windowRef.document = documentRef;

  windowRef.atob = function(input) {
    return Buffer.from(String(input), 'base64').toString('binary');
  };
  windowRef.btoa = function(input) {
    return Buffer.from(String(input), 'binary').toString('base64');
  };

  windowRef.fetch = options.fetch || (async function() {
    return {
      ok: true,
      status: 200,
      text: async function() { return '{}'; },
      json: async function() { return { vehicleVersions: [] }; },
    };
  });

  windowRef.saveDataToServer = async function() {
    counters.saveDataToServer += 1;
    return true;
  };
  windowRef.loadDataFromServer = async function() {
    counters.loadDataFromServer += 1;
    return windowRef.appData;
  };

  var ctx = vm.createContext(windowRef);

  return {
    context: ctx,
    window: windowRef,
    document: documentRef,
    counters: counters,
    domListeners: domListeners,
    loadScript: function(rel) {
      var code = read(rel);
      vm.runInContext(code, ctx, { filename: path.join(ROOT, rel) });
    },
  };
}

function loadDataServiceApi(ctx, saveImpl, loadImpl) {
  if (saveImpl) ctx.window.saveDataToServer = saveImpl;
  if (loadImpl) ctx.window.loadDataFromServer = loadImpl;
  ctx.loadScript('data-service.js');
  if (!ctx.window.dataApi || typeof ctx.window.dataApi.saveVehiclesList !== 'function') {
    throw new Error('window.dataApi.saveVehiclesList export missing');
  }
  return ctx.window.dataApi.saveVehiclesList;
}

function loadDataManager(ctx) {
  ctx.loadScript('data-manager.js');
  if (typeof ctx.window.writeVehicles !== 'function') {
    throw new Error('window.writeVehicles export missing');
  }
  if (typeof ctx.window.saveDataToServer !== 'function') {
    throw new Error('window.saveDataToServer export missing');
  }
}

function loadDataManagerAndService(ctx, saveImpl, loadImpl) {
  loadDataManager(ctx);
  if (saveImpl) ctx.window.saveDataToServer = saveImpl;
  if (loadImpl) ctx.window.loadDataFromServer = loadImpl;
  ctx.loadScript('data-service.js');
  if (!ctx.window.dataApi || typeof ctx.window.dataApi.saveVehiclesList !== 'function') {
    throw new Error('window.dataApi.saveVehiclesList export missing after data-service load');
  }
}

async function bootstrapTrustedDataset(ctx, options) {
  options = options || {};
  var payload = {
    tasitlar: options.tasitlar || [{ id: 'v1', plate: '34 TEST 1', version: 1, vehicleType: 'otomobil', km: '1000', notes: '' }],
    kayitlar: [],
    branches: [{ id: 'b1', name: 'Merkez' }],
    users: options.users || [{ id: 'u1', name: 'Test', role: 'genel_yonetici' }],
    ayarlar: ctx.window.appData.ayarlar,
    sifreler: [],
    arac_aylik_hareketler: [],
    duzeltme_talepleri: [],
    notificationReadState: {},
    monthlyTodoWhatsAppLogs: {},
    session: ctx.window.medisaSession,
  };

  ctx.window.fetch = async function(url, opts) {
    if (opts && opts.method === 'POST') {
      ctx.counters.activeFetches += 1;
      ctx.counters.maxActiveFetches = Math.max(ctx.counters.maxActiveFetches, ctx.counters.activeFetches);
      try {
        if (ctx._fetchImpl) return ctx._fetchImpl(url, opts);
        return {
          ok: true,
          status: 200,
          json: async function() { return { vehicleVersions: [{ id: 'v1', version: 2 }] }; },
        };
      } finally {
        ctx.counters.activeFetches -= 1;
      }
    }
    return {
      ok: true,
      status: 200,
      text: async function() { return JSON.stringify(payload); },
    };
  };

  await ctx.window.loadDataFromServer(true);
}

function findDirectDataApiCallersInKayit(source) {
  var callers = [];
  var fnRegex = /function\s+([A-Za-z0-9_$]+)\s*\([^)]*\)\s*\{[\s\S]*?\}/g;
  var handlerPatterns = [
    "addEventListener('click', function()",
    'addEventListener("click", function()',
    "addEventListener('click', async function()",
    'addEventListener("click", async function()',
  ];
  handlerPatterns.forEach(function(handlerNeedle) {
    var handlerIdx = source.indexOf(handlerNeedle);
    while (handlerIdx !== -1) {
      var slice = source.slice(handlerIdx, handlerIdx + 2500);
      if (slice.indexOf('vehicleTypePickerFromDetail') !== -1 && /dataApi\.saveVehiclesList\s*\(/.test(slice)) {
        callers.push({ name: 'vehicle-type-picker-click-handler', index: handlerIdx });
        break;
      }
      handlerIdx = source.indexOf(handlerNeedle, handlerIdx + handlerNeedle.length);
    }
  });

  var saveViaApiStart = source.indexOf('function saveVehiclesViaApi');
  if (saveViaApiStart !== -1) {
    var saveViaApiBody = source.slice(saveViaApiStart, saveViaApiStart + 400);
    if (/dataApi\.saveVehiclesList\s*\(/.test(saveViaApiBody)) {
      callers.push({ name: 'saveVehiclesViaApi', index: saveViaApiStart });
    }
  }

  return callers;
}

async function runDataServiceTests() {
  await test('data-service saveVehiclesList success', async function() {
    var ctx = createBrowserContext();
    var c = ctx.counters;
    var saveVehiclesList = loadDataServiceApi(ctx, async function() {
      c.saveDataToServer += 1;
      return true;
    }, async function() {
      c.loadDataFromServer += 1;
    });

    var next = [{ id: 'v2', plate: '34 NEW 1', version: 1 }];
    await saveVehiclesList(next);

    assert.deepEqual(ctx.window.appData.tasitlar, next);
    assert.equal(c.saveDataToServer, 1);
    assert.equal(c.loadDataFromServer, 0);
    assert.equal(c.invalidateVehicleDateTasksCache, 1);
    assert.equal(c.updateNotifications, 1);
    assert.equal(c.alert, 0);
  });

  await test('data-service saveVehiclesList save false', async function() {
    var ctx = createBrowserContext();
    var c = ctx.counters;
    var saveVehiclesList = loadDataServiceApi(ctx, async function() {
      c.saveDataToServer += 1;
      return false;
    }, async function() {
      c.loadDataFromServer += 1;
    });

    await assert.rejects(function() {
      return saveVehiclesList([{ id: 'v3', version: 1 }]);
    }, function(err) {
      return err && err.message === 'Sunucuya kayıt yapılamadı.' && err.conflict !== true;
    });

    assert.equal(c.saveDataToServer, 1);
    assert.equal(c.loadDataFromServer, 1);
    assert.equal(c.invalidateVehicleDateTasksCache, 0);
    assert.equal(c.updateNotifications, 0);
  });

  await test('data-service saveVehiclesList conflict', async function() {
    var ctx = createBrowserContext();
    var c = ctx.counters;
    var conflictErr = new Error('Conflict');
    conflictErr.conflict = true;
    var saveVehiclesList = loadDataServiceApi(ctx, async function() {
      c.saveDataToServer += 1;
      throw conflictErr;
    }, async function() {
      c.loadDataFromServer += 1;
    });

    await assert.rejects(function() {
      return saveVehiclesList([{ id: 'v4', version: 1 }]);
    }, function(err) {
      return err === conflictErr;
    });

    assert.equal(c.loadDataFromServer, 1);
    assert.equal(c.conflictWarn, 1);
    assert.equal(c.alert, 0);
    assert.equal(c.invalidateVehicleDateTasksCache, 0);
    assert.equal(c.updateNotifications, 0);
  });

  await test('data-service saveVehiclesList non-conflict exception', async function() {
    var ctx = createBrowserContext();
    var c = ctx.counters;
    var saveVehiclesList = loadDataServiceApi(ctx, async function() {
      c.saveDataToServer += 1;
      throw new Error('NetworkError');
    }, async function() {
      c.loadDataFromServer += 1;
    });

    await assert.rejects(function() {
      return saveVehiclesList([{ id: 'v5', version: 1 }]);
    }, function(err) {
      return err && err.message === 'Sunucuya kayıt yapılamadı.' && err.conflict !== true;
    });

    assert.equal(c.loadDataFromServer, 1);
    assert.equal(c.conflictWarn, 0);
    assert.equal(c.invalidateVehicleDateTasksCache, 0);
    assert.equal(c.updateNotifications, 0);
  });
}

async function runWriteVehiclesTests() {
  await test('writeVehicles dataApi success', async function() {
    var ctx = createBrowserContext();
    loadDataManager(ctx);
    var c = ctx.counters;
    ctx.window.dataApi = {
      saveVehiclesList: async function() {
        c.dataApiSave += 1;
      },
    };

    await ctx.window.writeVehicles([{ id: 'w1', version: 1 }]);
    assert.equal(c.dataApiSave, 1);
    assert.equal(c.saveDataToServer, 0);
    assert.equal(c.alert, 0);
  });

  await test('writeVehicles dataApi conflict', async function() {
    var ctx = createBrowserContext();
    loadDataManager(ctx);
    var c = ctx.counters;
    var conflictErr = new Error('Conflict');
    conflictErr.conflict = true;
    ctx.window.dataApi = {
      saveVehiclesList: async function() {
        throw conflictErr;
      },
    };

    await assert.rejects(function() {
      return ctx.window.writeVehicles([{ id: 'w2', version: 1 }]);
    }, function(err) {
      return err === conflictErr;
    });
    assert.equal(c.alert, 1);
    assert.equal(c.loadDataFromServer, 0);
  });

  await test('writeVehicles dataApi non-conflict error', async function() {
    var ctx = createBrowserContext();
    loadDataManager(ctx);
    var c = ctx.counters;
    var errObj = new Error('save failed');
    ctx.window.dataApi = {
      saveVehiclesList: async function() {
        throw errObj;
      },
    };

    await assert.rejects(function() {
      return ctx.window.writeVehicles([{ id: 'w3', version: 1 }]);
    }, function(err) {
      return err === errObj;
    });
    assert.equal(c.alert, 0);
    assert.equal(c.errorLog, 1);
  });

  await test('writeVehicles direct fallback conflict', async function() {
    var ctx = createBrowserContext();
    loadDataManager(ctx);
    var c = ctx.counters;
    ctx.window.dataApi = null;
    var conflictErr = new Error('Conflict');
    conflictErr.conflict = true;
    ctx.window.saveDataToServer = async function() {
      c.saveDataToServer += 1;
      throw conflictErr;
    };
    ctx.window.loadDataFromServer = async function(force) {
      c.loadDataFromServer += 1;
      assert.equal(force, true);
    };

    await assert.rejects(function() {
      return ctx.window.writeVehicles([{ id: 'w4', version: 1 }]);
    }, function(err) {
      return err === conflictErr;
    });
    assert.equal(c.loadDataFromServer, 1);
    assert.equal(c.alert, 1);
  });

  await test('writeVehicles direct fallback success', async function() {
    var ctx = createBrowserContext();
    loadDataManager(ctx);
    var c = ctx.counters;
    ctx.window.dataApi = null;
    ctx.window.saveDataToServer = async function() {
      c.saveDataToServer += 1;
      return true;
    };

    await ctx.window.writeVehicles([{ id: 'w5', version: 1 }]);
    assert.equal(c.saveDataToServer, 1);
    assert.equal(c.alert, 0);
  });

  await test('writeVehicles dataApi success notifies exactly once', async function() {
    var ctx = createBrowserContext();
    var c = ctx.counters;
    loadDataManagerAndService(ctx, async function() {
      c.saveDataToServer += 1;
      return true;
    });

    await ctx.window.writeVehicles([{ id: 'w8', version: 1 }], { conflictUi: 'caller' });
    assert.equal(c.saveDataToServer, 1);
    assert.equal(c.updateNotifications, 1);
    assert.equal(c.alert, 0);
  });

  await test('writeVehicles fallback success notifies exactly once', async function() {
    var ctx = createBrowserContext();
    loadDataManager(ctx);
    var c = ctx.counters;
    ctx.window.dataApi = null;
    ctx.window.saveDataToServer = async function() {
      c.saveDataToServer += 1;
      return true;
    };

    await ctx.window.writeVehicles([{ id: 'w9', version: 1 }]);
    assert.equal(c.saveDataToServer, 1);
    assert.equal(c.updateNotifications, 1);
    assert.equal(c.alert, 0);
  });

  await test('writeVehicles dataApi conflict caller-owned', async function() {
    var ctx = createBrowserContext();
    loadDataManager(ctx);
    var c = ctx.counters;
    var conflictErr = new Error('Conflict');
    conflictErr.conflict = true;
    ctx.window.dataApi = {
      saveVehiclesList: async function() {
        throw conflictErr;
      },
    };

    await assert.rejects(function() {
      return ctx.window.writeVehicles([{ id: 'w2b', version: 1 }], { conflictUi: 'caller' });
    }, function(err) {
      return err === conflictErr;
    });
    assert.equal(c.alert, 0);
    assert.equal(c.loadDataFromServer, 0);
    assert.equal(c.saveDataToServer, 0);
  });

  await test('writeVehicles fallback conflict caller-owned', async function() {
    var ctx = createBrowserContext();
    loadDataManager(ctx);
    var c = ctx.counters;
    ctx.window.dataApi = null;
    var conflictErr = new Error('Conflict');
    conflictErr.conflict = true;
    ctx.window.saveDataToServer = async function() {
      c.saveDataToServer += 1;
      throw conflictErr;
    };
    ctx.window.loadDataFromServer = async function(force) {
      c.loadDataFromServer += 1;
      assert.equal(force, true);
    };

    await assert.rejects(function() {
      return ctx.window.writeVehicles([{ id: 'w4b', version: 1 }], { conflictUi: 'caller' });
    }, function(err) {
      return err === conflictErr;
    });
    assert.equal(c.saveDataToServer, 1);
    assert.equal(c.loadDataFromServer, 1);
    assert.equal(c.alert, 0);
  });

  await test('writeVehicles fallback false rejects', async function() {
    var ctx = createBrowserContext();
    loadDataManager(ctx);
    var c = ctx.counters;
    ctx.window.dataApi = null;
    var outcomes = [false, undefined, null, 0, ''];
    for (var i = 0; i < outcomes.length; i++) {
      c.saveDataToServer = 0;
      c.updateNotifications = 0;
      c.alert = 0;
      var outcome = outcomes[i];
      ctx.window.saveDataToServer = async function() {
        c.saveDataToServer += 1;
        return outcome;
      };
      await assert.rejects(function() {
        return ctx.window.writeVehicles([{ id: 'w7-' + i, version: 1 }]);
      }, function(err) {
        return err && err.message === 'Sunucuya kayıt yapılamadı.';
      });
      assert.equal(c.saveDataToServer, 1);
      assert.equal(c.updateNotifications, 0);
      assert.equal(c.alert, 0);
    }
  });

  await test('writeVehicles owner missing rejects', async function() {
    var ctx = createBrowserContext();
    loadDataManager(ctx);
    var c = ctx.counters;
    ctx.window.dataApi = null;
    ctx.window.saveDataToServer = undefined;

    await assert.rejects(function() {
      return ctx.window.writeVehicles([{ id: 'w6', version: 1 }]);
    }, function(err) {
      return err && /writeVehicles owner hazır değil/i.test(String(err.message || err));
    });
    assert.equal(c.alert, 0);
    assert.equal(c.saveDataToServer, 0);
  });
}

async function runSaveMutexTests() {
  await test('saveDataToServer serial execution max concurrency 1', async function() {
    var ctx = createBrowserContext();
    loadDataManager(ctx);
    await bootstrapTrustedDataset(ctx);

    var gateResolve;
    var gate = new Promise(function(resolve) { gateResolve = resolve; });
    var postCount = 0;
    ctx._fetchImpl = async function(url, opts) {
      postCount += 1;
      if (postCount === 1) await gate;
      return {
        ok: true,
        status: 200,
        json: async function() { return { vehicleVersions: [] }; },
      };
    };

    var p1 = ctx.window.saveDataToServer();
    var p2 = ctx.window.saveDataToServer();
    await flushMicrotasks(5);
    assert.equal(ctx.counters.maxActiveFetches, 1);
    gateResolve();
    await Promise.all([p1, p2]);
    assert.equal(postCount, 2);
  });

  await test('saveDataToServer queue mode serialized global-state coalescing', async function() {
    var ctx = createBrowserContext();
    loadDataManager(ctx);
    await bootstrapTrustedDataset(ctx);

    var bodies = [];
    var postIndex = 0;
    ctx._fetchImpl = async function(url, opts) {
      postIndex += 1;
      bodies.push(JSON.parse(opts.body));
      if (postIndex === 1) {
        await new Promise(function(resolve) { setTimeout(resolve, 5); });
      }
      return {
        ok: true,
        status: 200,
        json: async function() { return { vehicleVersions: [{ id: 'v1', version: 2 + postIndex }] }; },
      };
    };

    ctx.window.appData.tasitlar[0].km = '1111';
    var p1 = ctx.window.saveDataToServer();
    ctx.window.appData.tasitlar[0].km = '2222';
    var p2 = ctx.window.saveDataToServer();
    await Promise.all([p1, p2]);

    assert.equal(bodies.length, 2);
    assert.equal(bodies[0].tasitlar[0].km, '2222', 'queue mode: payload uses global state at mutex time, not call time');
    console.log('  queue mode: serialized global-state coalescing');
  });

  await test('saveDataToServer mutex opens after non-conflict failure', async function() {
    var ctx = createBrowserContext();
    loadDataManager(ctx);
    await bootstrapTrustedDataset(ctx);

    var attempt = 0;
    ctx._fetchImpl = async function() {
      attempt += 1;
      if (attempt === 1) return { ok: false, status: 500, text: async function() { return 'fail'; } };
      return { ok: true, status: 200, json: async function() { return { vehicleVersions: [] }; } };
    };

    var first = await ctx.window.saveDataToServer();
    assert.equal(first, false);
    var second = await ctx.window.saveDataToServer();
    assert.equal(second, true);
    assert.equal(attempt, 2);
  });

  await test('saveDataToServer mutex opens after conflict rejection', async function() {
    var ctx = createBrowserContext();
    loadDataManager(ctx);
    await bootstrapTrustedDataset(ctx);

    var attempt = 0;
    ctx._fetchImpl = async function() {
      attempt += 1;
      if (attempt === 1) {
        return {
          ok: false,
          status: 409,
          json: async function() { return { conflict: true, message: 'conflict' }; },
        };
      }
      return { ok: true, status: 200, json: async function() { return { vehicleVersions: [] }; } };
    };

    await assert.rejects(function() {
      return ctx.window.saveDataToServer();
    }, function(err) {
      return err && err.conflict === true;
    });
    var second = await ctx.window.saveDataToServer();
    assert.equal(second, true);
    assert.equal(attempt, 2);
  });
}

async function runBaselineSnapshotTests() {
  await test('saveDataToServer baseline uses request snapshot not live appData', async function() {
    var ctx = createBrowserContext();
    loadDataManager(ctx);
    await bootstrapTrustedDataset(ctx);

    var bodies = [];
    var postIndex = 0;
    var fetch1Entered = false;
    var fetch1Release;
    var fetch1Gate = new Promise(function(resolve) { fetch1Release = resolve; });

    ctx._fetchImpl = async function(url, opts) {
      postIndex += 1;
      bodies.push(JSON.parse(opts.body));
      if (postIndex === 1) {
        fetch1Entered = true;
        await fetch1Gate;
      }
      return {
        ok: true,
        status: 200,
        json: async function() {
          return { vehicleVersions: [{ id: 'v1', version: postIndex + 1 }] };
        },
      };
    };

    var vehicles = ctx.window.getMedisaVehicles();
    vehicles[0].km = '200';
    vehicles[0].notes = '';
    ctx.window.appData.tasitlar = vehicles;

    ctx.counters.maxActiveFetches = 0;
    var p1 = ctx.window.saveDataToServer();
    await flushMicrotasks(5);
    assert.equal(fetch1Entered, true, 'first save fetch should start before mutation during pending fetch');
    assert.equal(ctx.counters.maxActiveFetches, 1, 'queue serialized global-state coalescing');

    var vehiclesPending = ctx.window.getMedisaVehicles();
    vehiclesPending[0].notes = 'yeni not';
    ctx.window.appData.tasitlar = vehiclesPending;

    fetch1Release();
    await p1;

    assert.equal(bodies[0].tasitlar[0].km, '200');
    assert.equal(bodies[0].tasitlar[0].notes, '');

    var p2 = ctx.window.saveDataToServer();
    await Promise.all([p2]);

    assert.equal(bodies.length, 2);
    assert.equal(bodies[1]._medisaMutation.collections.indexOf('tasitlar'), 0);
    assert.equal(bodies[1]._medisaMutation.changedVehicleIds.indexOf('v1'), 0);
    assert.equal(bodies[1].tasitlar[0].notes, 'yeni not');
    assert.equal(ctx.counters.maxActiveFetches, 1);
    console.log('  baseline snapshot: second save detects notes drift after first request snapshot');
  });

  await test('saveDataToServer non-vehicle baseline uses request snapshot', async function() {
    var ctx = createBrowserContext();
    loadDataManager(ctx);
    await bootstrapTrustedDataset(ctx, {
      users: [{ id: 'u1', name: 'Eski', role: 'genel_yonetici' }],
    });

    var bodies = [];
    var postIndex = 0;
    var fetch1Entered = false;
    var fetch1Release;
    var fetch1Gate = new Promise(function(resolve) { fetch1Release = resolve; });
    ctx.counters.maxActiveFetches = 0;

    ctx._fetchImpl = async function(url, opts) {
      postIndex += 1;
      bodies.push(JSON.parse(opts.body));
      if (postIndex === 1) {
        fetch1Entered = true;
        await fetch1Gate;
      }
      return {
        ok: true,
        status: 200,
        json: async function() { return { vehicleVersions: [] }; },
      };
    };

    ctx.window.appData.users[0].name = 'Gönderilen';
    var p1 = ctx.window.saveDataToServer();
    await flushMicrotasks(5);
    assert.equal(fetch1Entered, true);

    ctx.window.appData.users[0].name = 'Yeni Lokal';
    fetch1Release();
    var save1Result = await p1;
    assert.equal(save1Result, true);
    assert.equal(ctx.window.appData.users[0].name, 'Yeni Lokal');

    assert.equal(bodies[0].users[0].name, 'Gönderilen');

    var p2 = ctx.window.saveDataToServer();
    var save2Result = await p2;
    assert.equal(save2Result, true);

    assert.equal(bodies.length, 2);
    assert.equal(bodies[1]._medisaMutation.collections.indexOf('users'), 0);
    assert.equal(bodies[1].users[0].name, 'Yeni Lokal');
    assert.equal(ctx.counters.maxActiveFetches, 1);
    console.log('  baseline snapshot: second save detects users drift after first request snapshot');
  });
}

function runStaticInvariants() {
  var ds = read('data-service.js');
  assert.match(ds, /function notifyVehicleListPersisted\(\)/);
  assert.match(ds, /invalidateVehicleDateTasksCache/);
  assert.match(ds, /updateNotifications/);

  var kayit = read('kayit.js');
  var callers = findDirectDataApiCallersInKayit(kayit);
  assert.equal(
    callers.length,
    EXPECTED_DIRECT_DATAAPI_CALLERS,
    'direct dataApi caller count expected ' + EXPECTED_DIRECT_DATAAPI_CALLERS + ', got ' + callers.length + ': ' + JSON.stringify(callers.map(function(c) { return c.name; }))
  );
  assert.doesNotMatch(kayit, /function saveVehiclesViaApi/);
  assert.doesNotMatch(kayit, /dataApi\.saveVehiclesList\s*\(/);

  var performSaveStart = kayit.indexOf('function performSave(recordData, tescilTarihi)');
  assert.notEqual(performSaveStart, -1, 'performSave not found');
  var performSaveBody = kayit.slice(performSaveStart, performSaveStart + 3600);
  assert.match(performSaveBody, /writeVehicles\s*\(\s*vehicles\s*,\s*\{\s*conflictUi:\s*'caller'\s*\}\s*\)/);
  assert.match(performSaveBody, /return\s+window\.writeVehicles/);
  assert.doesNotMatch(performSaveBody, /saveVehiclesViaApi/);
  assert.doesNotMatch(performSaveBody, /updateNotifications/);
  assert.match(performSaveBody, /Veri ezilmesini önlemek için/);
  assert.match(performSaveBody, /Kayıt Güncellendi!/);
  assert.match(performSaveBody, /Yeni Kayıt Oluşturuldu!/);
  var readinessIdx = performSaveBody.indexOf("typeof window.writeVehicles !== 'function'");
  var mutationIdx = performSaveBody.indexOf('let vehicles = readVehicles()');
  assert.notEqual(readinessIdx, -1, 'performSave owner readiness check missing');
  assert.notEqual(mutationIdx, -1, 'performSave vehicles mutation missing');
  assert.ok(readinessIdx < mutationIdx, 'performSave owner readiness must precede persistence mutation');

  var dm = read('data-manager.js');
  assert.match(dm, /resolveWriteVehiclesConflictUi/);
  assert.match(dm, /showWriteVehiclesConflictAlert/);
  assert.match(dm, /notifyWriteVehiclesFallbackPersisted/);
  assert.match(dm, /conflictUi === 'caller'/);
  assert.match(dm, /ok !== true/);
  assert.match(dm, /Sunucuya kayıt yapılamadı\./);

  var pickerHandlerStart = kayit.indexOf('if (fromDetailId) {\r\n            if (vehicleTypeSaveInFlight)');
  if (pickerHandlerStart === -1) {
    pickerHandlerStart = kayit.indexOf('if (fromDetailId) {\n            if (vehicleTypeSaveInFlight)');
  }
  assert.notEqual(pickerHandlerStart, -1, 'detail vehicle type picker handler not found');
  var pickerBranch = kayit.slice(pickerHandlerStart, pickerHandlerStart + 2200);
  assert.match(pickerBranch, /writeVehicles/);
  assert.doesNotMatch(pickerBranch, /dataApi\.saveVehiclesList\s*\(/);
  assert.doesNotMatch(pickerBranch, /\.catch\s*\(\s*function\s*\(\s*\)\s*\{\s*\}\s*\)/);
  assert.match(kayit, /vehicleTypeSaveInFlight/);

  console.log('  direct dataApi callers:', callers.map(function(c) { return c.name; }).join(', '));

  var sc = read('script-core.js');
  var registry = parseMedisaModuleVersions(sc);
  verifyMedisaRegistryVersions(registry);
  verifyRegistryLoaderAssetBindings(sc, registry);
  verifyModuleVersionContracts(sc, registry);

  var sw = read('sw.js');
  verifyModuleBootContracts(sc, registry, sw);
  assert.match(sc, /'getVehicleTypeRuleProfile'/);

  var domainJs = read('vehicle-notification-domain.js');
  assert.match(domainJs, /function getVehicleTypeRuleProfile\s*\(/);
  assert.match(domainJs, /'getVehicleTypeRuleProfile'/);

  var ayarlarJs = read('ayarlar.js');
  assert.match(ayarlarJs, /function zorunluEvrakVehicleNeedsK2\s*\(/);
  assert.match(ayarlarJs, /MedisaVehicleNotificationDomain\.vehicleNeedsK2Belgesi/);

  var driverDataPhp = read('driver/driver_data.php');
  assert.match(driverDataPhp, /medisaSaveVehicleNeedsK2\s*\(\s*\$tasit\s*\)/);
  assert.match(driverDataPhp, /medisaSaveVehicleNeedsTakograf\s*\(\s*\$tasit\s*\)/);
  assert.doesNotMatch(driverDataPhp, /in_array\s*\(\s*\$vehicleType,\s*\[\s*'minivan',\s*'kamyon',\s*'romork'\s*\]/);

  var tasitlarJs = read('tasitlar.js');
  assert.match(tasitlarJs, /function getVehicleTypeRuleProfile\s*\(/);
  assert.match(tasitlarJs, /MedisaVehicleNotificationDomain\.getVehicleTypeRuleProfile/);
  assert.match(tasitlarJs, /'getVehicleTypeRuleProfile'/);
  assert.match(tasitlarJs, /function getVehicleTypeLabel\s*\(/);
  assert.match(tasitlarJs, /window\.getVehicleTypeLabel\s*=\s*getVehicleTypeLabel/);
  assert.match(tasitlarJs, /function getKaportaPartNames\s*\(/);
  assert.match(tasitlarJs, /window\.getKaportaPartNames\s*=\s*getKaportaPartNames/);
  [
    "'otomobil': 'Otomobil'",
    "'minivan': 'Küçük Ticari'",
    "'kamyon': 'Büyük Ticari'",
    "'romork': 'Römork'",
  ].forEach(function(entry) {
    assert.match(tasitlarJs, new RegExp(entry.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });
  [
    "'on-tampon': 'Ön Tampon'",
    "'arka-tampon': 'Arka Tampon'",
    "'kaput': 'Kaput'",
    "'bagaj': 'Bagaj Kapağı'",
    "'sag-on-kapi': 'Sağ Ön Kapı'",
    "'sol-on-kapi': 'Sol Ön Kapı'",
    "'sag-arka-kapi': 'Sağ Arka Kapı'",
    "'sol-arka-kapi': 'Sol Arka Kapı'",
    "'sag-on-camurluk': 'Sağ Ön Çamurluk'",
    "'sol-on-camurluk': 'Sol Ön Çamurluk'",
    "'sag-arka-camurluk': 'Sağ Arka Çamurluk'",
    "'sol-arka-camurluk': 'Sol Arka Çamurluk'",
    "'tavan': 'Tavan'",
  ].forEach(function(entry) {
    assert.match(tasitlarJs, new RegExp(entry.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });

  var yaziciJs = read('tasitlar-yazici.js');
  assert.match(yaziciJs, /typeof window\.getVehicleTypeLabel === 'function'/);
  assert.match(yaziciJs, /typeof window\.getKaportaPartNames === 'function'/);
  assert.doesNotMatch(yaziciJs, /'otomobil':\s*'Otomobil'/);
  assert.doesNotMatch(yaziciJs, /'on-tampon':\s*'Ön Tampon'/);

  var driverScriptJs = read('driver/driver-script.js');
  assert.match(driverScriptJs, /function getVehicleTypeRuleProfileDriver\s*\(/);
  assert.match(driverScriptJs, /MedisaVehicleNotificationDomain\.getVehicleTypeRuleProfile/);

  var driverEventPhp = read('driver/driver_event.php');
  assert.match(driverEventPhp, /medisaGetVehicleTypeRuleProfile\s*\(\s*\$vehicleType\s*\)/);
  assert.doesNotMatch(driverEventPhp, /function getVehicleTypeRuleProfile\s*\(/);

  var corePhp = read('core.php');
  assert.match(corePhp, /function medisaGetVehicleTypeRuleProfile\s*\(/);

  var domainSandbox = {
    window: {
      MedisaVehicleNotificationDomain: null,
      appData: { ayarlar: {} },
      checkDateWarnings: function() { return { class: '', days: null }; }
    }
  };
  vm.createContext(domainSandbox);
  vm.runInContext(domainJs, domainSandbox);
  var getVehicleTypeRuleProfile = domainSandbox.window.MedisaVehicleNotificationDomain.getVehicleTypeRuleProfile;
  assert.equal(typeof getVehicleTypeRuleProfile, 'function');
  [
    ['otomobil', 'otomobil'],
    ['minivan', 'minivan'],
    ['kamyon', 'buyukTicari'],
    ['romork', 'buyukTicari'],
    ['', 'otomobil'],
    ['  KAMYON  ', 'buyukTicari'],
    ['ozel_tip', 'ozel_tip'],
  ].forEach(function(pair) {
    assert.equal(getVehicleTypeRuleProfile(pair[0]), pair[1], 'JS profile for ' + JSON.stringify(pair[0]));
  });

  var execSync = require('node:child_process').execSync;
  [
    ['otomobil', 'otomobil'],
    ['kamyon', 'buyukTicari'],
    ['', 'otomobil'],
    ['ozel_tip', 'ozel_tip'],
  ].forEach(function(pair) {
    var phpArg = pair[0].replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    var phpOut = execSync(
      "php -r \"require 'core.php'; echo medisaGetVehicleTypeRuleProfile('" + phpArg + "');\"",
      { cwd: ROOT, encoding: 'utf8' }
    ).trim();
    assert.equal(phpOut, pair[1], 'PHP profile for ' + JSON.stringify(pair[0]));
  });

  DRIVER_HTML_FILES.forEach(function(rel) {
    var html = read(rel);
    assert.match(html, new RegExp('vehicle-notification-domain\\.js\\?v=' + EXPECTED_VEHICLE_NOTIFICATION_DOMAIN));
    assert.match(html, new RegExp('driver-script\\.js\\?v=' + EXPECTED_DRIVER_SCRIPT_QUERY));
  });

  SCRIPT_CORE_HTML_FILES.forEach(function(rel) {
    var html = read(rel);
    assert.match(html, new RegExp('script-core\\.js\\?v=' + EXPECTED_SCRIPT_CORE_QUERY));
    assert.doesNotMatch(html, /script-core\.js\?v=20260712\.1/);
    assert.doesNotMatch(html, /script-core\.js["']/);
  });

  assert.match(sw, new RegExp("CACHE_VERSION = '" + EXPECTED_SW_CACHE + "'"));

  var indexHtml = read('index.html');
  assert.match(indexHtml, /data-manager\.js\?v=20260716\.1/);
  assert.doesNotMatch(indexHtml, /data-manager\.js\?v=20260712\.5/);
  assert.doesNotMatch(indexHtml, /data-manager\.js\?v=20260712\.4/);
  assert.doesNotMatch(indexHtml, /data-manager\.js\?v=20260712\.3/);
  assert.doesNotMatch(sw, /medisa-v2\.224/);

  verifyOlayEgzozFlowInvariants();
}

function buildPickerDom() {
  var overlay = createElement('div');
  overlay.id = 'vehicle-type-picker-overlay';
  overlay.classList = createClassList();
  overlay.style.display = 'none';
  overlay._ariaHidden = 'false';
  overlay._ariaBusy = null;
  overlay.setAttribute = function(name, value) {
    this.attributes[name] = String(value);
    if (name === 'aria-hidden') this._ariaHidden = String(value);
    if (name === 'aria-busy') this._ariaBusy = String(value);
  };
  overlay.getAttribute = function(name) {
    if (name === 'aria-hidden') return this._ariaHidden || null;
    if (name === 'aria-busy') return this._ariaBusy || null;
    if (name === 'data-type') return this.attributes['data-type'] || null;
    return this.attributes[name] != null ? this.attributes[name] : null;
  };
  overlay.removeAttribute = function(name) {
    delete this.attributes[name];
    if (name === 'aria-busy') this._ariaBusy = null;
  };
  overlay.classList.add = function() {
    createClassList().add.apply(this.classList, arguments);
  };
  overlay.classList.remove = function() {
    createClassList().remove.apply(this.classList, arguments);
  };
  overlay._backdrop = createElement('div');
  overlay._options = [
    createElement('button', { attributes: { 'data-type': 'otomobil' } }),
    createElement('button', { attributes: { 'data-type': 'minivan' } }),
  ];
  overlay.querySelector = function(sel) {
    if (sel === '.vehicle-type-picker-backdrop') return this._backdrop;
    return null;
  };
  overlay.querySelectorAll = function(sel) {
    if (sel === '.vehicle-type-picker-option') return this._options;
    return [];
  };
  overlay._options.forEach(function(opt) {
    opt.attributes = opt.attributes || { 'data-type': opt.getAttribute ? opt.getAttribute('data-type') : 'otomobil' };
    opt.getAttribute = function(name) {
      return this.attributes[name] || null;
    };
    opt.setAttribute = function(name, value) {
      this.attributes[name] = String(value);
    };
    opt.removeAttribute = function(name) {
      delete this.attributes[name];
    };
    opt.disabled = false;
    opt.classList = createClassList();
  });
  return overlay;
}

async function runTipPickerBehaviorTests() {
  function setupKayitContext() {
    var overlay = buildPickerDom();
    var ctx = createBrowserContext({
      elements: {
        'vehicle-type-picker-overlay': overlay,
        'vehicle-modal': createElement('div'),
      },
    });
    ctx.overlay = overlay;
    ctx.loadScript('kayit.js');
    ctx.window.vehicleTypePickerFromDetail = 'v1';
    return ctx;
  }

  await test('tip picker success waits for writeVehicles', async function() {
    var deferredResolve;
    var deferred = new Promise(function(resolve) { deferredResolve = resolve; });
    var ctx = setupKayitContext();
    var c = ctx.counters;
    ctx.window.writeVehicles = function() {
      c.writeVehicles += 1;
      return deferred;
    };

    ctx.overlay._options[1].click();
    await flushMicrotasks(8);
    assert.equal(c.writeVehicles, 1);
    assert.equal(c.showVehicleDetail, 0);

    deferredResolve();
    await flushMicrotasks(8);
    assert.equal(c.showVehicleDetail, 1);
    assert.equal(ctx.overlay.style.display, 'none');
    assert.equal(ctx.overlay._options[1].disabled, false);
  });

  await test('tip picker double click single save', async function() {
    var gateResolve;
    var gate = new Promise(function(resolve) { gateResolve = resolve; });
    var ctx = setupKayitContext();
    var c = ctx.counters;
    ctx.window.writeVehicles = function() {
      c.writeVehicles += 1;
      return gate;
    };

    ctx.overlay._options[0].click();
    ctx.overlay._options[1].click();
    await flushMicrotasks(8);
    assert.equal(c.writeVehicles, 1);
    gateResolve();
    await flushMicrotasks(8);
  });

  await test('tip picker conflict no second alert', async function() {
    var ctx = setupKayitContext();
    var c = ctx.counters;
    var conflictErr = new Error('Conflict');
    conflictErr.conflict = true;
    ctx.window.writeVehicles = async function() {
      c.writeVehicles += 1;
      throw conflictErr;
    };

    ctx.overlay._options[0].click();
    await flushMicrotasks(8);
    assert.equal(c.alert, 0);
    assert.equal(c.showVehicleDetail, 1);
    assert.equal(ctx.overlay.style.display, 'none');
    assert.equal(ctx.overlay._options[0].disabled, false);
  });

  await test('tip picker non-conflict error alert once', async function() {
    var ctx = setupKayitContext();
    var c = ctx.counters;
    ctx.window.writeVehicles = async function() {
      c.writeVehicles += 1;
      throw new Error('NetworkError');
    };

    ctx.overlay._options[0].click();
    await flushMicrotasks(8);
    assert.equal(c.alert, 1);
    assert.equal(c.dataApiSave, 0);
    assert.equal(ctx.overlay._options[0].disabled, false);
    assert.equal(ctx.overlay.style.display, 'none');
  });

  await test('tip picker missing writeVehicles owner', async function() {
    var ctx = setupKayitContext();
    var c = ctx.counters;
    var beforeType = ctx.window.getMedisaVehicles()[0].vehicleType;
    delete ctx.window.writeVehicles;

    ctx.overlay._options[1].click();
    await flushMicrotasks(8);
    assert.equal(ctx.window.getMedisaVehicles()[0].vehicleType, beforeType);
    assert.equal(c.alert, 1);
    assert.equal(c.errorLog, 1);
    assert.equal(ctx.overlay.style.display, 'none');
  });
}

async function main() {
  console.log('verify-medisa-vehicle-save-invariants: start');

  await runDataServiceTests();
  await runWriteVehiclesTests();
  await runSaveMutexTests();
  await runBaselineSnapshotTests();

  await test('static side-effect and caller invariants', function() {
    runStaticInvariants();
  });

  await runTipPickerBehaviorTests();

  console.log('');
  console.log('Summary: PASS=' + passed + ' FAIL=' + failed);
  if (failed > 0) {
    process.exit(1);
  }
  console.log('verify-medisa-vehicle-save-invariants: OK');
}

main().catch(function(err) {
  console.error('[FAIL] runner', err && err.stack ? err.stack : err);
  process.exit(1);
});
