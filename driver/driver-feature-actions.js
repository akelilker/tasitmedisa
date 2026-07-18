
(function() {
'use strict';
var runtime = window.MedisaDriverRuntime;
if (!runtime) throw new Error('MedisaDriverRuntime eksik');
var s = runtime.state;
var h = runtime.helpers;
var p = runtime.paths;
function toggleDriverActionBlock(type, vehicleId) {
const vid = String(vehicleId);
const inner = document.querySelector('.driver-action-area-inner[data-vehicle-id="' + vid + '"]');
if (!inner) return;
const blocks = {
km: inner.querySelector('#km-block-' + vid),
kaza: document.getElementById('kaza-block-' + vid),
bakim: document.getElementById('bakim-block-' + vid),
sigorta: document.getElementById('sigorta-block-' + vid),
kasko: document.getElementById('kasko-block-' + vid),
muayene: document.getElementById('muayene-block-' + vid),
anahtar: document.getElementById('anahtar-block-' + vid),
lastik: document.getElementById('lastik-block-' + vid)
};
const target = blocks[type];
if (!target) return;
const isShown = target.classList.contains('show');
inner.classList.remove('driver-km-open');
document.body.classList.remove('driver-action-block-open');
inner.querySelectorAll('.driver-action-block').forEach(function(b) { if (b) b.classList.remove('show'); });
if (!isShown) {
target.classList.add('show');
var expandTypes = ['km', 'kaza', 'bakim', 'sigorta', 'kasko', 'muayene', 'anahtar', 'lastik'];
if (expandTypes.indexOf(type) !== -1) {
inner.classList.add('driver-km-open');
document.body.classList.add('driver-action-block-open');
}
if (type === 'kaza') {
const dateEl = document.getElementById('kaza-tarih-' + vid);
if (dateEl && !dateEl.value) { dateEl.value = new Date().toISOString().split('T')[0]; h.syncDriverDateDisplay(dateEl); }
const container = document.getElementById('kaza-kaporta-' + vid);
if (container && !container.querySelector('svg')) {
let boyaliParcalar = {};
try { const raw = container.getAttribute('data-boyali-parcalar'); if (raw) boyaliParcalar = JSON.parse(raw); } catch (e) {}
initDriverKaporta(vid, boyaliParcalar);
}
var kazaTa = document.getElementById('kaza-detay-' + vid);
if (kazaTa && kazaTa.classList.contains('driver-report-textarea-auto')) {
requestAnimationFrame(function() {
kazaTa.style.height = 'auto';
kazaTa.style.height = kazaTa.scrollHeight + 'px';
});
}
}
if (type === 'bakim') {
const dateEl = document.getElementById('bakim-tarih-' + vid);
if (dateEl && !dateEl.value) { dateEl.value = new Date().toISOString().split('T')[0]; h.syncDriverDateDisplay(dateEl); }
var bakimTa = document.getElementById('bakim-detay-' + vid);
if (bakimTa && bakimTa.classList.contains('driver-report-textarea-auto')) {
requestAnimationFrame(function() {
bakimTa.style.height = 'auto';
bakimTa.style.height = bakimTa.scrollHeight + 'px';
});
}
}
if (type === 'sigorta' || type === 'kasko' || type === 'muayene') {
var dateId = type === 'muayene' ? 'driver-muayene-tarih' : (type === 'sigorta' ? 'driver-sigorta-tarih' : 'driver-kasko-tarih');
var dateEl = document.getElementById(dateId + '-' + vid);
if (dateEl && !dateEl.value) { dateEl.value = new Date().toISOString().split('T')[0]; h.syncDriverDateDisplay(dateEl); }
if (type === 'muayene') window.syncDriverEgzozMuayeneFields(vid);
}
if (type === 'anahtar' || type === 'lastik') {
setupDriverEventRadioHandlersForBlock(type, vid);
}
if (type === 'km') {
setTimeout(function() {
const inp = document.getElementById('km-' + vid);
if (inp) inp.scrollIntoView({ behavior: 'smooth', block: 'center' });
}, 50);
} else {
var group = target.closest('.driver-action-group');
(group || target).scrollIntoView({ behavior: 'smooth', block: 'start' });
}
}
};

function focusKmInput(vehicleId) {
toggleDriverActionBlock('km', vehicleId);
};

function cancelKmForm(vid) {
cancelDriverActionForm('km', vid);
};

function cancelDriverActionForm(type, vid) {
const inner = document.querySelector('.driver-action-area-inner[data-vehicle-id="' + vid + '"]');
const blockIds = { km: 'km-block-', kaza: 'kaza-block-', bakim: 'bakim-block-', sigorta: 'sigorta-block-', kasko: 'kasko-block-', muayene: 'muayene-block-', anahtar: 'anahtar-block-', lastik: 'lastik-block-' };
const blockId = (blockIds[type] || '') + vid;
const block = document.getElementById(blockId);
if (block) block.classList.remove('show');
if (inner) {
var anyOpen = inner.querySelectorAll('.driver-action-block.show').length > 0;
if (!anyOpen) {
inner.classList.remove('driver-km-open');
document.body.classList.remove('driver-action-block-open');
}
}
};

function parseDriverKmInput(val) {
if (val == null || val === '') return null;
var n = parseInt(String(val).replace(/\D/g, ''), 10);
return isNaN(n) ? null : n;
}

function resolveGuncelKmForBakim(guncelKm, bakimKmRaw) {
var bakimKmNum = parseDriverKmInput(bakimKmRaw);
if (bakimKmNum === null || bakimKmNum <= guncelKm) return guncelKm;
if (confirm('Bildirilmek İstenen Km Bilgisi, Taşıtın Bildirilmiş Km\'sinden Fazladır. Taşıt Km Bilgisini de Güncellemek İster misiniz?')) {
return bakimKmNum;
}
return guncelKm;
}

async function submitDriverAction(type, vid) {
if (!h.ensureDriverOnlineForWrite()) return;
if (type === 'km') {
submitKmOnly(vid);
return;
}
var guncelKmEl = document.getElementById('km-' + vid);
var guncelKm = guncelKmEl ? parseInt(String(guncelKmEl.value).replace(/\D/g, ''), 10) : 0;
if (!guncelKm || guncelKm <= 0) {
var rec = h.getExistingRecord(vid);
if (rec != null && rec.guncel_km != null) guncelKm = parseInt(String(rec.guncel_km).replace(/\D/g, ''), 10);
}
if (!guncelKm || guncelKm <= 0) {
alert('Lütfen geçerli bir KM değeri girin (Km alanı veya mevcut kayıt).');
if (guncelKmEl) guncelKmEl.focus();
return;
}
var btnBildir, btnVazgec, formActions, successMsg;
if (type === 'kaza') {
var kazaAciklama = (document.getElementById('kaza-detay-' + vid) || {}).value.trim();
if (!kazaAciklama) {
alert('Kaza bildirimi için açıklama girin.');
return;
}
btnBildir = document.querySelector('#kaza-block-' + vid + ' .universal-btn-save');
btnVazgec = document.querySelector('#kaza-block-' + vid + ' .universal-btn-cancel');
formActions = document.querySelector('#kaza-block-' + vid + ' .universal-btn-group');
successMsg = document.getElementById('kaza-success-' + vid);
} else {
var bakimAciklama = (document.getElementById('bakim-detay-' + vid) || {}).value.trim();
if (!bakimAciklama) {
alert('Bakım bildirimi için açıklama girin.');
return;
}
btnBildir = document.querySelector('#bakim-block-' + vid + ' .universal-btn-save');
btnVazgec = document.querySelector('#bakim-block-' + vid + ' .universal-btn-cancel');
formActions = document.querySelector('#bakim-block-' + vid + ' .universal-btn-group');
successMsg = document.getElementById('bakim-success-' + vid);
}
if (type === 'bakim') {
guncelKm = resolveGuncelKmForBakim(guncelKm, ((document.getElementById('bakim-km-' + vid) || {}).value || '').trim());
}
if (btnBildir) btnBildir.disabled = true;
if (btnVazgec) btnVazgec.disabled = true;
var payload = {
arac_id: parseInt(vid, 10),
guncel_km: guncelKm,
bakim_durumu: type === 'bakim' ? 1 : 0,
bakim_aciklama: type === 'bakim' ? window.capitalizeWords((document.getElementById('bakim-detay-' + vid) || {}).value.trim()) : '',
bakim_tarih: type === 'bakim' ? (document.getElementById('bakim-tarih-' + vid) || {}).value : '',
bakim_servis: type === 'bakim' ? window.capitalizeWords(((document.getElementById('bakim-servis-' + vid) || {}).value || '').trim()) : '',
bakim_kisi: type === 'bakim' ? window.capitalizeWords(((document.getElementById('bakim-kisi-' + vid) || {}).value || '').trim()) : '',
bakim_km: type === 'bakim' ? ((document.getElementById('bakim-km-' + vid) || {}).value || '').trim() : '',
bakim_tutar: type === 'bakim' ? ((document.getElementById('bakim-tutar-' + vid) || {}).value || '').trim() : '',
kaza_durumu: type === 'kaza' ? 1 : 0,
kaza_aciklama: type === 'kaza' ? window.capitalizeWords(document.getElementById('kaza-detay-' + vid).value.trim()) : '',
kaza_tarih: type === 'kaza' ? (document.getElementById('kaza-tarih-' + vid).value || '') : '',
kaza_hasar_tutari: type === 'kaza' ? ((document.getElementById('kaza-tutar-' + vid) || {}).value || '').trim() : '',
boya_parcalar: '{}'
};
payload.vehicle_version = h.getVehicleVersionForRequest(vid);
if (type === 'kaza') {
var boyaParcalar = {};
var kaportaContainer = document.getElementById('kaza-kaporta-' + vid);
if (kaportaContainer) {
kaportaContainer.querySelectorAll('svg path[id]').forEach(function(part) {
var partId = part.getAttribute('id');
if (partId === 'araba-govde') return;
var state = part.dataset.state;
if (state === 'boyali' || state === 'degisen') boyaParcalar[partId] = state;
});
}
payload.boya_parcalar = JSON.stringify(boyaParcalar);
}
try {
var response = await fetch(p.API_BASE + 'driver_save.php', {
method: 'POST',
headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + s.currentToken },
body: JSON.stringify(payload)
});
var data = await response.json();
if (await h.handleDriverConflictResponse(data)) return;
if (data.success) {
h.applyVehicleVersionUpdate(vid, data.vehicleVersion);
s.lastCompletedActionInSession = { action: type, vehicleId: vid };
if (formActions) formActions.style.display = 'none';
if (successMsg) successMsg.classList.add('show');
const period = (s.currentPeriod || new Date().toISOString().slice(0, 7)).toString().trim();
s.allHistoryRecords = s.allHistoryRecords || [];
s.allHistoryRecords.push(data.record && typeof data.record === 'object' ? data.record : {
arac_id: vid,
donem: period,
guncel_km: guncelKm,
kayit_tarihi: new Date().toISOString()
});
var localVehicle = (s.allHistoryVehicles || []).find(function(v) { return String(v.id) === String(vid); });
if (localVehicle) {
var vehiclePatch = data.vehiclePatch && typeof data.vehiclePatch === 'object' ? data.vehiclePatch : {};
localVehicle.guncelKm = vehiclePatch.guncelKm != null ? vehiclePatch.guncelKm : guncelKm;
localVehicle.km_state = vehiclePatch.km_state || 'OK';
localVehicle.km_state_reason = vehiclePatch.km_state_reason || 'period_km_exists';
if (vehiclePatch.boyaliParcalar && typeof vehiclePatch.boyaliParcalar === 'object') {
localVehicle.boyaliParcalar = vehiclePatch.boyaliParcalar;
}
if (vehiclePatch.boya != null) {
localVehicle.boya = vehiclePatch.boya;
}
if (!Array.isArray(localVehicle.events)) localVehicle.events = [];
if (Array.isArray(data.events) && data.events.length) {
localVehicle.events.unshift.apply(localVehicle.events, data.events);
}
if (s.allHistoryVehicles && s.allHistoryVehicles.length > 1) {
h.setupPlateDropdown(s.allHistoryVehicles);
}
var historyModal = document.getElementById('history-modal');
if (historyModal && historyModal.classList.contains('show')) {
maybeRefreshHistory();
}
}
h.renderSlidingWarning(s.allHistoryVehicles || [], s.allHistoryRecords);
setTimeout(function() {
var block = document.getElementById((type === 'kaza' ? 'kaza-block-' : 'bakim-block-') + vid);
var inner = document.querySelector('.driver-action-area-inner[data-vehicle-id="' + vid + '"]');
if (block) block.classList.remove('show');
if (inner) {
inner.classList.remove('driver-km-open');
document.body.classList.remove('driver-action-block-open');
}
if (formActions) formActions.style.display = '';
if (successMsg) successMsg.classList.remove('show');
var actionBtn = inner ? inner.querySelector('.driver-action-btn[data-action="' + type + '"]') : null;
if (actionBtn) actionBtn.classList.add('saved');
if (!h.switchDriverDashboardVehicle(vid)) {
h.loadDashboard();
}
}, 4000);
} else {
alert(data.message || 'Kayıt yapılamadı.');
}
} catch (err) {
console.error('Bildirim kaydetme hatası:', err);
alert('Bağlantı hatası.');
} finally {
if (btnBildir) btnBildir.disabled = false;
if (btnVazgec) btnVazgec.disabled = false;
}
};

async function submitKmOnly(vid) {
if (!h.ensureDriverOnlineForWrite()) return;
const kmEl = document.getElementById('km-' + vid);
const km = kmEl ? parseInt(String(kmEl.value).replace(/\D/g, ''), 10) : 0;
if (!km || km <= 0) {
alert('Lütfen geçerli bir KM değeri girin!');
if (kmEl) kmEl.focus();
return;
}
var vehicle = s.allHistoryVehicles && s.allHistoryVehicles.find(function(v) { return String(v.id) === String(vid); });
var rec = h.getExistingRecord(vid);
var oncekiKm = (vehicle && (vehicle.guncelKm != null ? vehicle.guncelKm : '')) || (rec && rec.guncel_km != null ? rec.guncel_km : '');
var oncekiKmNum = parseInt(String(oncekiKm).replace(/\D/g, ''), 10) || 0;
if (oncekiKmNum > 0 && km < oncekiKmNum) {
alert('Bildirilmek İstenen Km, Önceki Kayıtlarla Uyuşmamaktadır. Şirket Yetkilisi İle Görüşün');
if (kmEl) kmEl.focus();
return;
}
const btnBildir = document.querySelector('#km-block-' + vid + ' .universal-btn-save');
const btnVazgec = document.querySelector('#km-block-' + vid + ' .universal-btn-cancel');
const formContent = document.querySelector('#km-block-' + vid + ' .driver-km-form-content');
const successMsg = document.getElementById('km-success-' + vid);
const errorEl = document.getElementById('km-error-' + vid);
if (errorEl) { errorEl.classList.remove('show'); errorEl.textContent = ''; }
if (btnBildir) btnBildir.disabled = true;
if (btnVazgec) btnVazgec.disabled = true;
try {
const response = await fetch(p.API_BASE + 'driver_save.php', {
method: 'POST',
headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + s.currentToken },
body: JSON.stringify({
arac_id: parseInt(vid, 10),
vehicle_version: h.getVehicleVersionForRequest(vid),
guncel_km: km,
km_only: true,
bakim_durumu: 0,
bakim_aciklama: '',
bakim_tarih: '',
bakim_servis: '',
bakim_kisi: '',
bakim_km: '',
bakim_tutar: '',
kaza_durumu: 0,
kaza_aciklama: '',
kaza_tarih: '',
kaza_hasar_tutari: '',
boya_parcalar: '{}'
})
});
const data = await response.json();
if (await h.handleDriverConflictResponse(data)) return;
if (data.success) {
h.applyVehicleVersionUpdate(vid, data.vehicleVersion);
s.lastCompletedActionInSession = { action: 'km', vehicleId: vid };
if (formContent) formContent.style.display = 'none';
if (successMsg) successMsg.classList.add('show');
const period = (s.currentPeriod || new Date().toISOString().slice(0, 7)).toString().trim();
s.allHistoryRecords = s.allHistoryRecords || [];
s.allHistoryRecords.push(data.record && typeof data.record === 'object' ? data.record : {
arac_id: vid,
donem: period,
guncel_km: km,
kayit_tarihi: new Date().toISOString()
});
var localVehicle = (s.allHistoryVehicles || []).find(function(v) { return String(v.id) === String(vid); });
if (localVehicle) {
var vehiclePatch = data.vehiclePatch && typeof data.vehiclePatch === 'object' ? data.vehiclePatch : {};
localVehicle.guncelKm = vehiclePatch.guncelKm != null ? vehiclePatch.guncelKm : km;
localVehicle.km_state = vehiclePatch.km_state || 'OK';
localVehicle.km_state_reason = vehiclePatch.km_state_reason || 'period_km_exists';
if (s.allHistoryVehicles && s.allHistoryVehicles.length > 1) {
h.setupPlateDropdown(s.allHistoryVehicles);
}
var historyModal = document.getElementById('history-modal');
if (historyModal && historyModal.classList.contains('show')) {
maybeRefreshHistory();
}
}
h.renderSlidingWarning(s.allHistoryVehicles || [], s.allHistoryRecords);
setTimeout(function() {
const block = document.getElementById('km-block-' + vid);
const inner = document.querySelector('.driver-action-area-inner[data-vehicle-id="' + vid + '"]');
if (block) block.classList.remove('show');
if (inner) {
inner.classList.remove('driver-km-open');
document.body.classList.remove('driver-action-block-open');
}
if (formContent) formContent.style.display = '';
if (successMsg) successMsg.classList.remove('show');
const kmBtn = inner ? inner.querySelector('.driver-action-btn[data-action="km"]') : null;
if (kmBtn) kmBtn.classList.add('saved');
if (!h.switchDriverDashboardVehicle(vid)) {
h.loadDashboard();
}
}, 4000);
} else {
if (errorEl) { errorEl.textContent = data.message || 'Kayıt yapılamadı.'; errorEl.classList.add('show'); }
}
} catch (err) {
console.error('Km kaydetme hatası:', err);
if (errorEl) { errorEl.textContent = 'Bağlantı hatası.'; errorEl.classList.add('show'); }
} finally {
if (btnBildir) btnBildir.disabled = false;
if (btnVazgec) btnVazgec.disabled = false;
}
};
function setupDriverEventRadioHandlersForBlock(group, vid) {
const block = document.getElementById(group + '-block-' + vid);
if (!block) return;
const btns = block.querySelectorAll('.driver-radio-btn[data-group="' + group + '"]');
var wrap = document.getElementById('driver-' + group + (group === 'anahtar' ? '-detay-wrap' : '-adres-wrap') + '-' + vid);
var input = document.getElementById('driver-' + group + (group === 'anahtar' ? '-detay' : '-adres') + '-' + vid);
var activeBtn = block.querySelector('.driver-radio-btn.active');
if (wrap) wrap.style.display = (activeBtn && activeBtn.dataset.value === 'var') ? 'block' : 'none';
btns.forEach(function(btn) {
btn.onclick = function() {
btns.forEach(function(b) { b.classList.remove('active'); });
btn.classList.add('active');
var isVar = btn.dataset.value === 'var';
if (wrap) wrap.style.display = isVar ? 'block' : 'none';
if (input && !isVar) input.value = '';
};
});
}

function syncDriverEgzozMuayeneFields(vehicleId) {
const suffix = vehicleId ? '-' + String(vehicleId) : '';
const checkbox = document.getElementById('driver-muayene-egzoz-different' + suffix);
const wrap = document.getElementById('driver-muayene-egzoz-date-wrap' + suffix);
const input = document.getElementById('driver-muayene-egzoz-tarih' + suffix);
const visible = !!(checkbox && checkbox.checked);
if (wrap) wrap.classList.toggle('driver-egzoz-date-visible', visible);
if (input) {
input.disabled = !visible;
if (!visible) input.value = '';
}
};

function getDriverMuayenePayload(vehicleId) {
const suffix = vehicleId ? '-' + String(vehicleId) : '';
const tarih = document.getElementById('driver-muayene-tarih' + suffix)?.value.trim() || '';
if (!tarih) {
alert('Tarih zorunludur!');
return null;
}
const egzozCheckbox = document.getElementById('driver-muayene-egzoz-different' + suffix);
const egzozDifferent = !!(egzozCheckbox && egzozCheckbox.checked);
const egzozMuayeneYapilmaDate = egzozDifferent
? (document.getElementById('driver-muayene-egzoz-tarih' + suffix)?.value.trim() || '')
: '';
if (egzozDifferent && !egzozMuayeneYapilmaDate) {
alert('Egzoz Muayene Tarihi zorunludur!');
const egzozInput = document.getElementById('driver-muayene-egzoz-tarih' + suffix);
if (egzozInput) egzozInput.focus();
return null;
}
return { tarih: tarih, egzozMuayeneYapilmaDate: egzozMuayeneYapilmaDate };
}

function positionAndShowMuayenePopover(dateInputEl) {
var popover = document.getElementById('muayene-confirm-popover');
if (!popover || !dateInputEl) return;
var inputRect = dateInputEl.getBoundingClientRect();
var container = dateInputEl.closest('.driver-report-block') || document.body;
var containerRect = container.getBoundingClientRect();
if (s.pendingMuayeneVehicleId) {
var btnGroup = document.querySelector('#muayene-block-' + s.pendingMuayeneVehicleId + ' .universal-btn-group');
if (btnGroup) btnGroup.style.visibility = 'hidden';
}
popover.style.visibility = 'hidden';
popover.style.display = 'block';
var popoverRect = popover.getBoundingClientRect();
var top = inputRect.bottom + 5;
var left = containerRect.left + (containerRect.width / 2) - (popoverRect.width / 2);
var leftClamped = Math.max(16, Math.min(left, window.innerWidth - popoverRect.width - 16));
popover.style.top = top + 'px';
popover.style.left = leftClamped + 'px';
popover.style.visibility = '';
}

function hideMuayenePopoverAndRestore() {
var popover = document.getElementById('muayene-confirm-popover');
if (popover) popover.style.display = 'none';
if (s.pendingMuayeneVehicleId) {
var btnGroup = document.querySelector('#muayene-block-' + s.pendingMuayeneVehicleId + ' .universal-btn-group');
if (btnGroup) btnGroup.style.visibility = '';
}
}

function cancelMuayeneSubmit() {
hideMuayenePopoverAndRestore();
s.pendingMuayeneVehicleId = null;
};

function refreshDriverMuayeneLocally(vehicleId, result) {
const localVehicle = (s.allHistoryVehicles || []).find(function(v) { return String(v.id) === String(vehicleId); });
if (!localVehicle) return false;
const vehiclePatch = result && result.vehiclePatch && typeof result.vehiclePatch === 'object' ? result.vehiclePatch : {};
localVehicle.muayeneDate = vehiclePatch.muayeneDate || localVehicle.muayeneDate || '';
if (!Array.isArray(localVehicle.events)) localVehicle.events = [];
if (result && result.event && typeof result.event === 'object') {
localVehicle.events.unshift(result.event);
}
if (s.allHistoryVehicles && s.allHistoryVehicles.length > 1) {
h.setupPlateDropdown(s.allHistoryVehicles);
}
var historyModal = document.getElementById('history-modal');
if (historyModal && historyModal.classList.contains('show')) {
maybeRefreshHistory();
}
return h.switchDriverDashboardVehicle(vehicleId);
}

async function confirmMuayeneSubmit() {
if (!h.ensureDriverOnlineForWrite()) return;
if (!s.pendingMuayeneVehicleId) return;
s.isMuayeneConfirmed = true;
hideMuayenePopoverAndRestore();
const vid = s.pendingMuayeneVehicleId;
s.pendingMuayeneVehicleId = null;
const payload = getDriverMuayenePayload(vid);
if (!payload) { s.isMuayeneConfirmed = false; return; }
try {
const res = await fetch(p.API_BASE + 'driver_event.php', {
method: 'POST',
headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + s.currentToken },
body: JSON.stringify({ arac_id: parseInt(vid, 10), vehicle_version: h.getVehicleVersionForRequest(vid), event_type: 'muayene', data: payload })
});
const result = await res.json();
if (await h.handleDriverConflictResponse(result)) return;
if (result.success) {
h.applyVehicleVersionUpdate(vid, result.vehicleVersion);
s.lastCompletedActionInSession = { action: 'muayene', vehicleId: vid };
cancelDriverActionForm('muayene', vid);
if (!refreshDriverMuayeneLocally(vid, result)) {
await h.loadDashboard();
}
} else {
alert(result.message || 'Kayıt başarısız!');
}
} catch (err) {
console.error(err);
alert('Bağlantı hatası!');
} finally {
s.isMuayeneConfirmed = false;
}
};

async function saveDriverEventFromBlock(type, vehicleId) {
if (!h.ensureDriverOnlineForWrite()) return;
vehicleId = String(vehicleId);
if (!vehicleId || !s.currentToken) return;
let data = {};
if (type === 'anahtar') {
const block = document.getElementById('anahtar-block-' + vehicleId);
const active = block ? block.querySelector('.driver-radio-btn.active') : null;
if (!active) { alert('Lütfen Durum seçiniz!'); return; }
const durum = active.dataset.value;
data = { durum: durum, detay: durum === 'var' ? window.capitalizeWords(document.getElementById('driver-anahtar-detay-' + vehicleId)?.value.trim() || '') : '' };
} else if (type === 'lastik') {
const block = document.getElementById('lastik-block-' + vehicleId);
const active = block ? block.querySelector('.driver-radio-btn.active') : null;
if (!active) { alert('Lütfen Durum seçiniz!'); return; }
const durum = active.dataset.value;
data = { durum: durum, adres: durum === 'var' ? window.capitalizeWords(document.getElementById('driver-lastik-adres-' + vehicleId)?.value.trim() || '') : '' };
} else if (type === 'muayene') {
const payload = getDriverMuayenePayload(vehicleId);
if (!payload) return;
if (!s.isMuayeneConfirmed) {
const vehicle = s.allHistoryVehicles && s.allHistoryVehicles.find(function(v) { return String(v.id) === String(vehicleId); });
const bitisStr = h.calculateNextMuayeneDate(payload.tarih, vehicle);
const dateEl = document.getElementById('muayene-calc-date');
if (dateEl) dateEl.textContent = bitisStr ? h.formatDateDDMMYYYY(bitisStr) : '--/--/----';
s.pendingMuayeneVehicleId = vehicleId;
var dateInput = document.getElementById('driver-muayene-tarih-' + vehicleId);
positionAndShowMuayenePopover(dateInput);
return;
}
data = payload;
} else if (type === 'sigorta') {
const tarih = document.getElementById('driver-sigorta-tarih-' + vehicleId)?.value.trim() || '';
if (!tarih) { alert('Tarih zorunludur!'); return; }
data = {
tarih: tarih,
firma: window.capitalizeWords(document.getElementById('driver-sigorta-firma-' + vehicleId)?.value.trim() || ''),
acente: window.capitalizeWords(document.getElementById('driver-sigorta-acente-' + vehicleId)?.value.trim() || ''),
iletisim: document.getElementById('driver-sigorta-iletisim-' + vehicleId)?.value.trim() || ''
};
} else if (type === 'kasko') {
const tarih = document.getElementById('driver-kasko-tarih-' + vehicleId)?.value.trim() || '';
if (!tarih) { alert('Tarih zorunludur!'); return; }
data = {
tarih: tarih,
firma: window.capitalizeWords(document.getElementById('driver-kasko-firma-' + vehicleId)?.value.trim() || ''),
acente: window.capitalizeWords(document.getElementById('driver-kasko-acente-' + vehicleId)?.value.trim() || ''),
iletisim: document.getElementById('driver-kasko-iletisim-' + vehicleId)?.value.trim() || ''
};
} else return;
try {
const res = await fetch(p.API_BASE + 'driver_event.php', {
method: 'POST',
headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + s.currentToken },
body: JSON.stringify({ arac_id: parseInt(vehicleId, 10), vehicle_version: h.getVehicleVersionForRequest(vehicleId), event_type: type, data: data })
});
const result = await res.json();
if (await h.handleDriverConflictResponse(result)) return;
if (result.success) {
h.applyVehicleVersionUpdate(vehicleId, result.vehicleVersion);
s.lastCompletedActionInSession = { action: type, vehicleId: vehicleId };
cancelDriverActionForm(type, vehicleId);
if (type === 'anahtar' || type === 'lastik') {
const localVehicle = (s.allHistoryVehicles || []).find(function(v) { return String(v.id) === String(vehicleId); });
if (localVehicle) {
if (type === 'anahtar') {
localVehicle.anahtar = data.durum;
localVehicle.anahtarNerede = data.detay || '';
} else {
localVehicle.lastikDurumu = data.durum;
localVehicle.lastikAdres = data.adres || '';
}
if (!Array.isArray(localVehicle.events)) localVehicle.events = [];
const eventTimestamp = new Date().toISOString();
localVehicle.events.unshift({
id: 'driver-' + type + '-' + Date.now(),
type: type === 'anahtar' ? 'anahtar-guncelle' : 'lastik-guncelle',
date: h.formatDateDDMMYYYY(eventTimestamp.slice(0, 10)),
timestamp: eventTimestamp,
data: Object.assign({}, data, { surucu: s.currentUser && (s.currentUser.isim || s.currentUser.name) ? (s.currentUser.isim || s.currentUser.name) : '' })
});
if (!h.switchDriverDashboardVehicle(vehicleId)) {
await h.loadDashboard();
}
} else {
await h.loadDashboard();
}
} else if (type === 'muayene') {
if (!refreshDriverMuayeneLocally(vehicleId, result)) {
await h.loadDashboard();
}
} else if (type === 'sigorta' || type === 'kasko') {
const localVehicle = (s.allHistoryVehicles || []).find(function(v) { return String(v.id) === String(vehicleId); });
if (localVehicle) {
const vehiclePatch = result.vehiclePatch && typeof result.vehiclePatch === 'object' ? result.vehiclePatch : {};
if (type === 'sigorta') {
localVehicle.sigortaDate = vehiclePatch.sigortaDate || '';
} else {
localVehicle.kaskoDate = vehiclePatch.kaskoDate || '';
}
if (!Array.isArray(localVehicle.events)) localVehicle.events = [];
const eventTimestamp = new Date().toISOString();
localVehicle.events.unshift(result.event && typeof result.event === 'object' ? result.event : {
id: 'driver-' + type + '-' + Date.now(),
type: type === 'sigorta' ? 'sigorta-guncelle' : 'kasko-guncelle',
date: data.tarih || eventTimestamp.slice(0, 10),
timestamp: eventTimestamp,
data: Object.assign({}, data, { bitisTarihi: type === 'sigorta' ? localVehicle.sigortaDate : localVehicle.kaskoDate })
});
if (s.allHistoryVehicles && s.allHistoryVehicles.length > 1) {
h.setupPlateDropdown(s.allHistoryVehicles);
}
var historyModal = document.getElementById('history-modal');
if (historyModal && historyModal.classList.contains('show')) {
maybeRefreshHistory();
}
if (!h.switchDriverDashboardVehicle(vehicleId)) {
await h.loadDashboard();
}
} else {
await h.loadDashboard();
}
} else {
await h.loadDashboard();
}
} else {
alert(result.message || 'Kayıt başarısız!');
}
} catch (err) {
console.error(err);
alert('Bağlantı hatası!');
}
};


function initDriverKaporta(vehicleId, boyaliParcalar) {
const container = document.getElementById('kaza-kaporta-' + vehicleId);
if (!container) return;
boyaliParcalar = boyaliParcalar || {};
if (!s.driverKaportaSvgPromise) {
s.driverKaportaSvgPromise = fetch(p.ICON_BASE + 'kaporta.svg')
.then(function(res) {
if (!res.ok) throw new Error('Kaporta SVG yuklenemedi.');
return res.text();
})
.catch(function(err) {
s.driverKaportaSvgPromise = null;
throw err;
});
}
s.driverKaportaSvgPromise
.then(function(svgText) {
const parser = new DOMParser();
const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
const svg = svgDoc.querySelector('svg');
if (!svg) return;
container.innerHTML = '';
const schemaWrapper = document.createElement('div');
schemaWrapper.className = 'driver-kaporta-schema-wrapper';
schemaWrapper.style.display = 'flex';
schemaWrapper.style.flexDirection = 'column';
schemaWrapper.style.alignItems = 'center';
schemaWrapper.style.justifyContent = 'flex-start';
schemaWrapper.style.overflow = 'visible';
const svgClone = svg.cloneNode(true);
schemaWrapper.appendChild(svgClone);
svgClone.setAttribute('width', '120');
svgClone.setAttribute('height', '180');
svgClone.style.width = '180px';
svgClone.style.height = '120px';
svgClone.style.margin = '0';
svgClone.style.display = 'block';
svgClone.style.transform = 'rotate(90deg)';
svgClone.style.transformOrigin = 'center center';
const allParts = svgClone.querySelectorAll('path[id]');

allParts.forEach(function(part) {
const partId = part.getAttribute('id');
if (partId === 'araba-govde') return;
part.setAttribute('fill', '#888888');
part.style.fill = '#888888';
});

Object.keys(boyaliParcalar).forEach(function(partId) {
if (partId === 'araba-govde') return;
const part = svgClone.querySelector('#' + CSS.escape(partId));
if (!part) return;
const state = boyaliParcalar[partId];
if (state === 'boyali') {
part.setAttribute('fill', '#28a745');
part.style.fill = '#28a745';
} else if (state === 'degisen') {
part.setAttribute('fill', '#d40000');
part.style.fill = '#d40000';
}
part.style.pointerEvents = 'none';
part.style.opacity = '0.7';
});

allParts.forEach(function(part) {
const partId = part.getAttribute('id');
if (partId === 'araba-govde') return;
if (boyaliParcalar[partId]) return;
part.style.cursor = 'pointer';
part.dataset.state = 'boyasiz';
part.addEventListener('click', function(e) {
e.preventDefault();
e.stopPropagation();
const cur = this.dataset.state || 'boyasiz';
var next = 'boyasiz';
if (cur === 'boyasiz') next = 'boyali';
else if (cur === 'boyali') next = 'degisen';
this.dataset.state = next;
if (next === 'boyasiz') {
this.setAttribute('fill', '#888888');
this.style.fill = '#888888';
} else if (next === 'boyali') {
this.setAttribute('fill', '#28a745');
this.style.fill = '#28a745';
} else {
this.setAttribute('fill', '#d40000');
this.style.fill = '#d40000';
}
});
});
const legend = document.createElement('div');
legend.className = 'boya-legend';
legend.style.display = 'flex';
legend.style.flexDirection = 'row';
legend.style.flexWrap = 'nowrap';
legend.style.gap = '12px';
legend.style.justifyContent = 'center';
legend.style.fontSize = '11px';
legend.style.color = '#aaa';
legend.innerHTML = '<div class="boya-legend-item"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#888;margin-right:6px;"></span>Boyasız</div><div class="boya-legend-item"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#28a745;margin-right:6px;"></span>Boyalı</div><div class="boya-legend-item"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#d40000;margin-right:6px;"></span>Değişen</div>';
container.appendChild(schemaWrapper);
container.appendChild(legend);
})
.catch(function(err) { console.error('Kaporta SVG yüklenemedi:', err); });
}
function maybeRefreshHistory() {
var api = runtime.features.history;
if (!api || typeof api.renderHistoryList !== 'function') return;
var historyModal = document.getElementById('history-modal');
if (historyModal && historyModal.classList.contains('show')) api.renderHistoryList();
}

runtime.registerFeature('actions', {
toggleDriverActionBlock: toggleDriverActionBlock,
focusKmInput: focusKmInput,
cancelKmForm: cancelKmForm,
cancelDriverActionForm: cancelDriverActionForm,
submitDriverAction: submitDriverAction,
submitKmOnly: submitKmOnly,
syncDriverEgzozMuayeneFields: syncDriverEgzozMuayeneFields,
cancelMuayeneSubmit: cancelMuayeneSubmit,
confirmMuayeneSubmit: confirmMuayeneSubmit,
saveDriverEventFromBlock: saveDriverEventFromBlock
});
})();
