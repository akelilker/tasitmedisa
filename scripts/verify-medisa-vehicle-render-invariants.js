/**
 * Vehicle render source invariants for RECOVERY-R4.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const root = path.resolve(__dirname, '..');
const tj = fs.readFileSync(path.join(root, 'tasitlar.js'), 'utf8');
const dm = fs.readFileSync(path.join(root, 'data-manager.js'), 'utf8');

assert.ok(dm.includes('getMedisaCollectionRevisions'), 'R1 revisions export');
assert.ok(tj.includes('getVehicleCollectionRevisions'), 'render uses revisions');
assert.ok(tj.includes('getCachedVehicleLookupMaps'), 'lookup cache');
assert.ok(tj.includes('__medisaVehicleRenderMetrics'), 'metrics hook');
assert.ok(tj.includes("medisa_perf_debug"), 'metrics gated');
assert.ok(tj.includes('view-card .card-brand-model'), 'card fit retained');
assert.ok(!/fitVehicleTextBoxes[\s\S]{0,400}\.view-list \.list-cell\.list-brand/.test(tj), 'list brand fit removed');
assert.ok(tj.includes("lastReason = 'unchanged-signature'"), 'unchanged skip');
assert.ok(tj.includes('if (viewMode === \'card\')') && tj.includes('fitVehicleTextBoxes(listContainer)'), 'fit only card path');
console.log(JSON.stringify({ ok: true, checks: ['revisions', 'lookup-cache', 'metrics', 'list-fit-removed', 'skip'] }, null, 2));
