/**
 * Vehicle render source invariants for RECOVERY-R4.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const root = path.resolve(__dirname, '..');
const tj = fs.readFileSync(path.join(root, 'tasitlar.js'), 'utf8');
const core = fs.readFileSync(path.join(root, 'script-core.js'), 'utf8');
const dm = fs.readFileSync(path.join(root, 'data-manager.js'), 'utf8');
const measure = fs.readFileSync(path.join(root, 'scripts', 'measure-medisa-vehicle-render.js'), 'utf8');
const fitStart = core.indexOf('window.medisaFitTextWithinBox = function');
const fitEnd = core.indexOf('/** Kolon state:', fitStart);
const fitOwner = fitStart >= 0 && fitEnd > fitStart ? core.slice(fitStart, fitEnd) : '';

assert.ok(dm.includes('getMedisaCollectionRevisions'), 'R1 revisions export');
assert.ok(tj.includes('getVehicleCollectionRevisions'), 'render uses revisions');
assert.ok(tj.includes('getCachedVehicleLookupMaps'), 'lookup cache');
assert.ok(tj.includes('__medisaVehicleRenderMetrics'), 'metrics hook');
assert.ok(tj.includes("medisa_perf_debug"), 'metrics gated');
assert.ok(tj.includes('view-card .card-brand-model'), 'card fit retained');
assert.ok(!/fitVehicleTextBoxes[\s\S]{0,400}\.view-list \.list-cell\.list-brand/.test(tj), 'list brand fit removed');
assert.ok(tj.includes('.view-list .list-cell.list-user .user-name-line2'), 'list user line fit retained');
assert.ok(tj.includes("'type': 'minmax(0, 0.78fr)'"), 'compact desktop type width');
assert.ok(tj.includes("'transmission': 'minmax(0, 0.6fr)'"), 'compact desktop transmission width');
assert.ok(tj.includes("'branch': 'minmax(0, 1.05fr)'"), 'compact desktop branch width');
assert.ok(tj.includes("lastReason = 'unchanged-signature'"), 'unchanged skip');
assert.ok(tj.includes("if (viewMode === 'list' || viewMode === 'card')") && tj.includes('fitVehicleTextBoxes(listContainer)'), 'targeted list user fit path');
assert.ok(fitOwner, 'shared text-fit owner exists');
assert.ok(!/\bwhile\s*\(/.test(fitOwner), 'text-fit has no per-step measurement loop');
assert.ok(fitOwner.includes('calculateTargetSize'), 'text-fit derives target size from first measurement');
assert.ok((fitOwner.match(/requestAnimationFrame\s*\(/g) || []).length === 2, 'text-fit uses one fit frame and one validation frame');
assert.ok(fitOwner.indexOf('var corrections = measurements.map') < fitOwner.indexOf('corrections.forEach'), 'validation reads are batched before correction writes');
assert.ok(measure.includes("path.join(root,'outputs','vehicle-render')"), 'measure artifact repo outputs owner');
assert.ok(measure.includes('fs.mkdirSync(artifactDir,{recursive:true})'), 'measure artifact directory created');
assert.ok(!measure.includes('tasitmedisa-recovery-r3-r4'), 'stale workstation artifact path removed');
console.log(JSON.stringify({ ok: true, checks: ['revisions', 'lookup-cache', 'metrics', 'list-brand-fit-removed', 'list-user-fit-retained', 'compact-column-balance', 'skip', 'text-fit-batched-measurement', 'text-fit-single-validation', 'artifact-owner'] }, null, 2));
