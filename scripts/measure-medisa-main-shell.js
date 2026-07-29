/**
 * PERF-P2-1 — ana uygulama başlangıç HTML/DOM statik baseline ölçümü.
 * Browser timing alanları ayrı manuel/live kabul gerektirir.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const INDEX_PATH = path.join(ROOT, 'index.html');
const html = fs.readFileSync(INDEX_PATH, 'utf8');

function bytes(value) {
  return Buffer.byteLength(String(value || ''), 'utf8');
}

function sliceBetween(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error('Markup sınırı bulunamadı: ' + startNeedle + ' → ' + endNeedle);
  }
  return source.slice(start, end);
}

function countElements(source) {
  const matches = String(source || '').match(/<(?!\/|!|\?)([a-z][a-z0-9:-]*)(?:\s|>)/gi);
  return matches ? matches.length : 0;
}

function countInlineHandlers(source) {
  const matches = String(source || '').match(/\s(?:onclick|onpointerdown|onsubmit)\s*=/gi);
  return matches ? matches.length : 0;
}

function collectIds(source) {
  const ids = [];
  const re = /\sid\s*=\s*["']([^"']+)["']/gi;
  let match;
  while ((match = re.exec(source))) ids.push(match[1]);
  return ids;
}

function countDuplicateIds(source) {
  const seen = new Set();
  const duplicates = new Set();
  collectIds(source).forEach(function(id) {
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  });
  return { count: duplicates.size, ids: Array.from(duplicates).sort() };
}

const body = sliceBetween(html, '<body', '</body>');
const baseline = {
  indexHtmlBytes: 86417,
  bodyBytes: 76291,
  hiddenFeatureMarkupBytes: 59194,
  totalElementNodes: 651,
  hiddenFeatureNodes: 542,
  surfaceBytes: {
    kayit: 20480,
    vehicles: 10803,
    reports: 1739,
    settings: 22569
  },
  surfaceNodes: {
    kayit: 184,
    vehicles: 105,
    reports: 17,
    settings: 236
  }
};

const totalElements = countElements(body);
const bodyBytes = bytes(body);
const duplicateIds = countDuplicateIds(html);
const featureRootIds = [
  'vehicle-modal',
  'vehicles-modal',
  'reports-modal',
  'branch-modal',
  'event-menu-modal',
  'vehicle-history-modal'
];
const initialFeatureRoots = featureRootIds.filter(function(id) {
  return html.includes('id="' + id + '"');
});
const implementationPresent = initialFeatureRoots.length === 0
  && fs.readFileSync(path.join(ROOT, 'script-core.js'), 'utf8').includes('MedisaMainSurfaceRegistry');
const featureBytes = implementationPresent ? 0 : baseline.hiddenFeatureMarkupBytes;
const featureElements = implementationPresent ? 0 : baseline.hiddenFeatureNodes;
const indexBytes = bytes(html);
const htmlReductionPct = Number(((baseline.indexHtmlBytes - indexBytes) * 100 / baseline.indexHtmlBytes).toFixed(2));
const nodeReductionPct = Number(((baseline.totalElementNodes - totalElements) * 100 / baseline.totalElementNodes).toFixed(2));
const movedTemplateBytes = Object.values(baseline.surfaceBytes).reduce(function(sum, value) { return sum + value; }, 0);

const result = {
  kind: implementationPresent ? 'medisa-main-shell-static-final' : 'medisa-main-shell-static-baseline',
  baseline,
  indexHtmlBytes: indexBytes,
  bodyBytes,
  coreShellBytes: bodyBytes - featureBytes,
  hiddenFeatureMarkupBytes: featureBytes,
  hiddenFeatureMarkupPctOfBody: Number((featureBytes * 100 / bodyBytes).toFixed(2)),
  totalElementNodes: totalElements,
  initialHiddenFeatureNodes: featureElements,
  hiddenFeatureNodePct: Number((featureElements * 100 / totalElements).toFixed(2)),
  modalOverlayCount: (html.match(/class=["'][^"']*(?:modal-overlay|dialog-overlay)[^"']*["']/gi) || []).length,
  duplicateIdCount: duplicateIds.count,
  duplicateIds: duplicateIds.ids,
  inlineEventHandlerCount: countInlineHandlers(html),
  initialFeatureRoots,
  surfaces: Object.fromEntries(Object.keys(baseline.surfaceBytes).map(function(name) {
    return [name, {
      markupBytes: baseline.surfaceBytes[name],
      elementNodes: baseline.surfaceNodes[name],
      initiallyVisible: false
    }];
  })),
  browserTiming: {
    htmlParseP95Ms: 'manual Edge required',
    styleLayoutP95Ms: 'manual Edge required',
    domContentLoadedP95Ms: 'manual Edge required',
    appReadyP95Ms: 'manual Edge required',
    splashHiddenP95Ms: 'manual Edge required'
  },
  thresholds: {
    hiddenMarkup30PctBody: baseline.hiddenFeatureMarkupBytes >= baseline.bodyBytes * 0.30,
    hiddenMarkup50KiB: baseline.hiddenFeatureMarkupBytes >= 50 * 1024,
    hiddenNodes40Pct: baseline.hiddenFeatureNodes >= baseline.totalElementNodes * 0.40,
    browserParseStyleLayout50Ms: 'manual Edge required'
  },
  finalGates: {
    htmlReduction30PctOr50KiB: htmlReductionPct >= 30 || (baseline.indexHtmlBytes - indexBytes) >= 50 * 1024,
    initialDomNodeReduction40Pct: nodeReductionPct >= 40,
    initialFeatureModalNodesZero: initialFeatureRoots.length === 0,
    duplicateIdsZero: duplicateIds.count === 0,
    htmlPlusTemplatesWithin110Pct: (indexBytes + movedTemplateBytes) <= baseline.indexHtmlBytes * 1.10
  },
  deltas: {
    htmlReductionBytes: baseline.indexHtmlBytes - indexBytes,
    htmlReductionPct,
    nodeReduction: baseline.totalElementNodes - totalElements,
    nodeReductionPct,
    htmlPlusMovedTemplateBytes: indexBytes + movedTemplateBytes
  }
};

result.implementationRequired = Object.values(result.thresholds).some(function(value) {
  return value === true;
});

console.log(JSON.stringify(result, null, 2));

if (process.argv.includes('--browser')) {
  runBrowserMeasurements().catch(function(error) {
    console.error('[main-shell-browser] ' + error.stack);
    setTimeout(function() { process.exit(1); }, 10);
  });
}

async function runBrowserMeasurements() {
  const debugPort = process.env.MEDISA_EDGE_DEBUG_PORT || '9223';
  const targetUrl = process.env.MEDISA_MAIN_URL || 'http://127.0.0.1:8765/index.html?medisaPerf=1';
  const allScenarios = [
    { name: 'desktop', width: 1280, height: 800 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'mobile', width: 390, height: 844 }
  ];
  const viewportFilter = process.env.MEDISA_BROWSER_VIEWPORT || '';
  const scenarios = viewportFilter
    ? allScenarios.filter(function(scenario) { return scenario.name === viewportFilter; })
    : allScenarios;
  const cacheFilter = process.env.MEDISA_BROWSER_CACHE || '';
  const cacheModes = cacheFilter ? [cacheFilter] : ['cold', 'warm'];
  const warmups = Number(process.env.MEDISA_BROWSER_WARMUPS || 3);
  const runs = Number(process.env.MEDISA_BROWSER_RUNS || 10);
  const targets = await fetch('http://127.0.0.1:' + debugPort + '/json/list')
    .then(function(response) { return response.json(); });
  const target = targets.find(function(item) {
    return item.type === 'page' && item.url === 'about:blank';
  }) || targets.find(function(item) {
    return item.type === 'page' && /^https?:/.test(item.url || '');
  });
  if (!target) throw new Error('Edge debug page hedefi bulunamadı');
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  const callbacks = new Map();
  const requests = [];
  const navigations = [];
  let sequence = 0;

  socket.addEventListener('message', function(event) {
    const message = JSON.parse(event.data);
    if (message.id && callbacks.has(message.id)) {
      const callback = callbacks.get(message.id);
      callbacks.delete(message.id);
      if (message.error) callback.reject(new Error(message.error.message));
      else callback.resolve(message.result || {});
      return;
    }
    if (message.method === 'Network.requestWillBeSent') {
      requests.push(message.params.request.url);
    }
    if (message.method === 'Page.frameNavigated' && message.params.frame && !message.params.frame.parentId) {
      navigations.push(message.params.frame.url);
    }
    if (message.method === 'Fetch.requestPaused') {
      const requestUrl = message.params.request.url;
      if (/\/load\.php(?:\?|$)/.test(requestUrl)) {
        const fixture = JSON.stringify({
          tasitlar: [],
          kayitlar: [],
          branches: [],
          users: [],
          ayarlar: {},
          sifreler: []
        });
        command('Fetch.fulfillRequest', {
          requestId: message.params.requestId,
          responseCode: 200,
          responseHeaders: [{ name: 'Content-Type', value: 'application/json; charset=utf-8' }],
          body: Buffer.from(fixture, 'utf8').toString('base64')
        }).catch(function() {});
      } else {
        command('Fetch.continueRequest', { requestId: message.params.requestId }).catch(function() {});
      }
    }
  });
  await new Promise(function(resolve, reject) {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });

  function command(method, params) {
    return new Promise(function(resolve, reject) {
      const id = ++sequence;
      const timer = setTimeout(function() {
        if (callbacks.has(id)) {
          callbacks.delete(id);
          reject(new Error('CDP komutu zaman aşımı: ' + method));
        }
      }, 20000);
      callbacks.set(id, {
        resolve: function(value) { clearTimeout(timer); resolve(value); },
        reject: function(error) { clearTimeout(timer); reject(error); }
      });
      socket.send(JSON.stringify({ id, method, params: params || {} }));
    });
  }

  async function evaluate(expression, awaitPromise) {
    const response = await command('Runtime.evaluate', {
      expression,
      awaitPromise: awaitPromise !== false,
      returnByValue: true
    });
    if (response.exceptionDetails) {
      throw new Error(response.exceptionDetails.text || 'Browser evaluate hatası');
    }
    return response.result ? response.result.value : undefined;
  }

  async function waitForRegistry(expectedUrl) {
    let lastState = null;
    // Tam URL karşılaştırması şart: warm ardışık koşularda eski dokümanın pathname'i
    // yeni hedefle aynı olduğundan pathname kontrolü eski dokümana karşı geçer,
    // navigasyon commit olunca context yok olur ve ensure çağrısı patlar.
    for (let attempt = 0; attempt < 240; attempt += 1) {
      try {
        lastState = await evaluate('({href:location.href,ready:document.readyState,registry:!!window.MedisaMainSurfaceRegistry})');
      } catch (evaluateError) {
        lastState = { evaluateError: evaluateError.message };
        await new Promise(function(resolve) { setTimeout(resolve, 50); });
        continue;
      }
      if (lastState.href === expectedUrl && lastState.ready === 'complete' && lastState.registry) return;
      await new Promise(function(resolve) { setTimeout(resolve, 50); });
    }
    throw new Error('MedisaMainSurfaceRegistry hazır olmadı: ' + JSON.stringify(lastState));
  }

  function percentile(values, ratio) {
    const sorted = values.slice().sort(function(a, b) { return a - b; });
    return Number(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)].toFixed(2));
  }

  await command('Page.enable');
  await command('Runtime.enable');
  await command('Network.enable');
  await command('Fetch.enable', { patterns: [{ urlPattern: '*load.php*', requestStage: 'Request' }] });
  await command('Performance.enable');
  await command('Page.addScriptToEvaluateOnNewDocument', {
    source: `(function(){
      try {
        localStorage.setItem('medisa_portal_token', btoa(JSON.stringify({
          exp: Math.floor(Date.now()/1000)+3600,
          rol: 'genel_yonetici',
          user_id: 'perf-fixture'
        })));
        localStorage.setItem('medisa_perf_debug', '1');
      } catch (e) {}
      // Ölçüm sırasında auth-gate yönlendirmesi sayfayı düşürmesin.
      window.__medisaRedirecting = true;
      var nativeFetch = window.fetch;
      window.fetch = function(input, init) {
        var url = typeof input === 'string' ? input : (input && input.url) || '';
        if (/\\/load\\.php(?:\\?|$)/.test(url)) {
          return Promise.resolve(new Response(JSON.stringify({
            tasitlar: [], kayitlar: [], branches: [], users: [], ayarlar: {}, sifreler: []
          }), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } }));
        }
        return nativeFetch.apply(this, arguments);
      };
    })();`
  });
  await command('Page.navigate', { url: new URL('manifest.json', targetUrl).href });
  await new Promise(function(resolve) { setTimeout(resolve, 250); });

  const output = [];
  for (const viewport of scenarios) {
    await command('Emulation.setDeviceMetricsOverride', {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: viewport.width <= 390
    });
    for (const cacheMode of cacheModes) {
      const samples = [];
      for (let run = 0; run < warmups + runs; run += 1) {
        let sample = null;
        let lastRunError = null;
        for (let attempt = 0; attempt < 3 && !sample; attempt += 1) {
          try {
            sample = await measureOneRun(cacheMode, run, attempt);
          } catch (runError) {
            lastRunError = runError;
            console.error('[main-shell-browser] run retry ' + viewport.name + '/' + cacheMode
              + ' run=' + run + ' attempt=' + attempt + ': ' + runError.message
              + ' navigations=' + JSON.stringify(navigations.slice(-4)));
            await new Promise(function(resolve) { setTimeout(resolve, 400); });
          }
        }
        if (!sample) throw lastRunError;
        if (process.env.MEDISA_BROWSER_DEBUG === '1') {
          console.error('[main-shell-debug] ' + viewport.name + '/' + cacheMode + ' run=' + run
            + ' firstOpen=' + JSON.stringify(sample.firstOpen)
            + ' requests=' + sample.requestCount);
        }
        if (run >= warmups) samples.push(sample);
      }

      async function measureOneRun(cacheMode, run, attempt) {
        if (cacheMode === 'cold') await command('Network.clearBrowserCache');
        await command('Performance.disable');
        await command('Performance.enable');
        requests.length = 0;
        navigations.length = 0;
        await evaluate(`localStorage.setItem('medisa_portal_token', btoa(JSON.stringify({exp:Math.floor(Date.now()/1000)+3600,rol:'genel_yonetici',user_id:'perf-fixture',ilk_giris_parola_degistirme_zorunlu:false})))`);
        const runUrl = targetUrl + '&run=' + Date.now() + '-' + run + '-' + attempt;
        await command('Page.navigate', { url: runUrl });
        await waitForRegistry(runUrl);
        await evaluate('window.__medisaRedirecting = true');
        await command('Page.stopLoading');
        // Gerçek kullanıcı ilk tıklaması app hazır + splash kapandıktan sonra gelir;
        // splash overlay input'u bloklar ve 350ms fade + display:none recalc yapar.
        // En erken gerçekçi tıklama anı: splash hidden + fade tamamlanması sonrası.
        await evaluate(`(function(){
          return new Promise(function(resolve) {
            var startedAt = Date.now();
            (function check() {
              if (window.__medisaSplashHiddenAt > 0 || Date.now() - startedAt > 9000) {
                setTimeout(resolve, 500);
                return;
              }
              setTimeout(check, 60);
            })();
          });
        })()`);
        const splashTimings = await evaluate(`(function(){
          return {
            appReadyAt: window.__medisaAppReadyAt || 0,
            splashHiddenAt: window.__medisaSplashHiddenAt || 0,
            readyToHiddenDelay: window.__medisaAppReadyAt && window.__medisaSplashHiddenAt
              ? window.__medisaSplashHiddenAt - window.__medisaAppReadyAt
              : 0
          };
        })()`);
        const initial = await evaluate(`({
          nodes: document.getElementsByTagName('*').length,
          featureRoots: ['vehicle-modal','vehicles-modal','reports-modal','branch-modal','event-menu-modal','vehicle-history-modal'].filter(function(id){ return !!document.getElementById(id); }),
          navigation: (function(){ var n=performance.getEntriesByType('navigation')[0]; return n ? { dcl:n.domContentLoadedEventEnd, load:n.loadEventEnd } : {}; })()
        })`);
        const firstOpen = {};
        const secondOpen = {};
        for (const surface of ['kayit', 'vehicles', 'reports', 'settings']) {
          firstOpen[surface] = await evaluate(`(async function(){ var s=performance.now(); await window.MedisaMainSurfaceRegistry.ensure('${surface}'); return performance.now()-s; })()`);
          const featureRequestCount = function() {
            return requests.filter(function(url) {
              return /\/(?:kayit|tasitlar|tasitlar-base|tasitlar-extra|raporlar|ayarlar)\.(?:js|css)(?:\?|$)/.test(url);
            }).length;
          };
          const beforeSecondRequests = featureRequestCount();
          secondOpen[surface] = await evaluate(`(async function(){ var s=performance.now(); await window.MedisaMainSurfaceRegistry.ensure('${surface}'); return {ms:performance.now()-s, injection:window.__medisaMainShellMetrics.surfaceInjectionCounts['${surface}']}; })()`);
          secondOpen[surface].requests = featureRequestCount() - beforeSecondRequests;
        }
        const duplicateIds = await evaluate(`(function(){var s={},d={};document.querySelectorAll('[id]').forEach(function(n){if(s[n.id])d[n.id]=1;s[n.id]=1;});return Object.keys(d).length;})()`);
        const perfMetrics = await command('Performance.getMetrics');
        const metricMap = Object.fromEntries((perfMetrics.metrics || []).map(function(metric) {
          return [metric.name, metric.value];
        }));
        return {
          initial,
          firstOpen,
          secondOpen,
          duplicateIds,
          splashTimings,
          requestCount: requests.length,
          parseMs: Number(((metricMap.ParseHTMLDuration || 0) * 1000).toFixed(2)),
          styleMs: Number(((metricMap.RecalcStyleDuration || 0) * 1000).toFixed(2)),
          layoutMs: Number(((metricMap.LayoutDuration || 0) * 1000).toFixed(2))
        };
      }
      output.push({
        viewport: viewport.name,
        cache: cacheMode,
        runs,
        initialNodesMedian: percentile(samples.map(function(sample) { return sample.initial.nodes; }), 0.5),
        initialFeatureRootsMax: Math.max.apply(null, samples.map(function(sample) { return sample.initial.featureRoots.length; })),
        domContentLoadedP95Ms: percentile(samples.map(function(sample) { return sample.initial.navigation.dcl || 0; }), 0.95),
        loadP95Ms: percentile(samples.map(function(sample) { return sample.initial.navigation.load || 0; }), 0.95),
        parseStyleLayoutP95Ms: percentile(samples.map(function(sample) { return sample.parseMs + sample.styleMs + sample.layoutMs; }), 0.95),
        firstOpenP95Ms: Object.fromEntries(['kayit', 'vehicles', 'reports', 'settings'].map(function(surface) {
          return [surface, percentile(samples.map(function(sample) { return sample.firstOpen[surface]; }), 0.95)];
        })),
        secondOpenP95Ms: Object.fromEntries(['kayit', 'vehicles', 'reports', 'settings'].map(function(surface) {
          return [surface, percentile(samples.map(function(sample) { return sample.secondOpen[surface].ms; }), 0.95)];
        })),
        secondOpenRequestsMax: Math.max.apply(null, samples.flatMap(function(sample) {
          return Object.values(sample.secondOpen).map(function(second) { return second.requests; });
        })),
        duplicateIdsMax: Math.max.apply(null, samples.map(function(sample) { return sample.duplicateIds; })),
        readyToHiddenDelayP95Ms: percentile(samples.map(function(sample) {
          return sample.splashTimings ? sample.splashTimings.readyToHiddenDelay : 0;
        }), 0.95)
      });
    }
  }
  console.log(JSON.stringify({ kind: 'medisa-main-shell-edge', scenarios: output }, null, 2));
  socket.close();
}
