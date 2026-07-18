
(function() {
'use strict';
var runtime = window.MedisaDriverRuntime;
if (!runtime) throw new Error('MedisaDriverRuntime eksik');
var s = runtime.state;
var h = runtime.helpers;
var p = runtime.paths;

function formatPeriod(period) {
const [year, month] = period.split('-');
const months = ['OCAK', 'ŞUBAT', 'MART', 'NİSAN', 'MAYIS', 'HAZİRAN',
'TEMMUZ', 'AĞUSTOS', 'EYLÜL', 'EKİM', 'KASIM', 'ARALIK'];
return `${months[parseInt(month) - 1]} ${year}`;
}
function formatHistoryVehicleTriggerLabel(v) {
if (!v) return 'Tüm Taşıtlar';
var raw = v.brandModel || [v.marka, v.model].filter(Boolean).join(' ');
var brandModel = h.formatDriverBrandModel(raw || '');
return [h.formatDriverPlaka(v.plaka), brandModel].filter(Boolean).join(' - ');
}

function renderHistoryVehicleTrigger(value, text, vehicle) {
var triggerText = document.querySelector('.history-vehicle-trigger-text');
if (!triggerText) return;
if (value === '' || value == null || !vehicle) {
triggerText.textContent = text || 'Tüm Taşıtlar';
return;
}
var raw = vehicle.brandModel || [vehicle.marka, vehicle.model].filter(Boolean).join(' ');
var brandModel = h.formatDriverBrandModel(raw || '');
var plate = h.formatDriverPlaka(vehicle.plaka);
triggerText.innerHTML =
'<span class="history-selected-plate">' + h.escapeHtmlDriver(plate) + '</span>' +
(brandModel ? '<span class="history-selected-model">' + h.escapeHtmlDriver(brandModel) + '</span>' : '');
}

function updateHistoryTriggerTone(selectedValue) {
const trigger = document.querySelector('.history-vehicle-trigger');
if (!trigger) return;
const isAllSelected = selectedValue === '' || selectedValue == null;
trigger.classList.toggle('history-all-selected', isAllSelected);
}

function setHistoryVehicleDropdownOpen(isOpen) {
const dropdown = document.getElementById('history-vehicle-dropdown');
const trigger = document.querySelector('.history-vehicle-trigger');
const nextOpen = !!isOpen;
if (dropdown) dropdown.style.display = nextOpen ? 'block' : 'none';
if (trigger) {
trigger.classList.toggle('history-vehicle-trigger-open', nextOpen);
trigger.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
}
document.body.classList.toggle(
'driver-history-vehicle-dropdown-open',
nextOpen && document.body.classList.contains('dashboard-page')
);
}

async function loadDriverHistoryIfNeeded() {
if (s.driverHistoryLoaded) return true;
if (s.driverHistoryPromise) return s.driverHistoryPromise;
if (!s.currentToken) return false;

s.driverHistoryPromise = fetch(p.API_BASE + 'driver_history.php?_=' + Date.now(), {
headers: { 'Authorization': 'Bearer ' + s.currentToken },
cache: 'no-store'
})
.then(function(response) {
return response.text().then(function(text) {
var payload = text ? JSON.parse(text) : {};
if (!response.ok || !payload || payload.success !== true) {
throw new Error((payload && payload.message) || 'Geçmiş kayıtları alınamadı.');
}
return payload;
});
})
.then(function(payload) {
s.allHistoryRecords = Array.isArray(payload.records) ? payload.records : [];
var eventsByVehicle = payload.eventsByVehicle && typeof payload.eventsByVehicle === 'object' ? payload.eventsByVehicle : {};
(s.allHistoryVehicles || []).forEach(function(vehicle) {
var vehicleId = String(vehicle && vehicle.id != null ? vehicle.id : '');
vehicle.events = Array.isArray(eventsByVehicle[vehicleId]) ? eventsByVehicle[vehicleId] : [];
});
s.driverHistoryLoaded = true;
return true;
})
.catch(function(error) {
console.error('Geçmiş kayıtları yüklenemedi:', error);
s.driverHistoryLoaded = false;
return false;
})
.finally(function() {
s.driverHistoryPromise = null;
});

return s.driverHistoryPromise;
}


function showHistory() {
var modal = document.getElementById('history-modal');
var hiddenInput = document.getElementById('history-vehicle-filter');
var dropdown = document.getElementById('history-vehicle-dropdown');
if (!modal || !hiddenInput || !dropdown) return;
dropdown.innerHTML = '';
var optAll = document.createElement('div');
optAll.className = 'history-vehicle-option';
optAll.dataset.value = '';
optAll.textContent = 'Tüm Taşıtlar';
optAll.onclick = function() { selectHistoryVehicle('', 'Tüm Taşıtlar'); };
dropdown.appendChild(optAll);
(s.allHistoryVehicles || []).forEach(function(v) {
var opt = document.createElement('div');
opt.className = 'history-vehicle-option';
opt.dataset.value = String(v.id);
var raw = v.brandModel || [v.marka, v.model].filter(Boolean).join(' ');
var brandModel = h.formatDriverBrandModel(raw || '');
opt.textContent = [h.formatDriverPlaka(v.plaka), brandModel].filter(Boolean).join(' - ');
opt.onclick = function() { selectHistoryVehicle(String(v.id), opt.textContent); };
dropdown.appendChild(opt);
});
var defaultVal = '';
var defaultText = 'Tüm Taşıtlar';
var defaultVehicle = null;
if (s.allHistoryVehicles && s.allHistoryVehicles.length === 1) {
defaultVal = String(s.allHistoryVehicles[0].id);
defaultText = formatHistoryVehicleTriggerLabel(s.allHistoryVehicles[0]);
defaultVehicle = s.allHistoryVehicles[0];
} else if (s.allHistoryVehicles && s.allHistoryVehicles.length > 1 && s.selectedVehicleId != null && String(s.selectedVehicleId) !== '') {
var selForHistory = s.allHistoryVehicles.find(function(v) { return String(v.id) === String(s.selectedVehicleId); });
if (selForHistory) {
defaultVal = String(selForHistory.id);
defaultText = formatHistoryVehicleTriggerLabel(selForHistory);
defaultVehicle = selForHistory;
}
}
hiddenInput.value = defaultVal;
renderHistoryVehicleTrigger(defaultVal, defaultText, defaultVehicle);
updateHistoryTriggerTone(defaultVal);
setHistoryVehicleDropdownOpen(false);
modal.classList.add('show');
h.updateDriverModalBodyClass();
var listEl = document.getElementById('history-list');
if (listEl && !s.driverHistoryLoaded) {
listEl.innerHTML = '<p class="history-empty">Geçmiş kayıtlar yükleniyor...</p>';
}
requestAnimationFrame(function() {
loadDriverHistoryIfNeeded().then(function() {
renderHistoryList();
});
});
};

function toggleHistoryVehicleDropdown(ev) {
ev.stopPropagation();
const dropdown = document.getElementById('history-vehicle-dropdown');
if (!dropdown) return;
const isOpen = dropdown.style.display !== 'none';
setHistoryVehicleDropdownOpen(!isOpen);
};

function selectHistoryVehicle(value, text) {
const hiddenInput = document.getElementById('history-vehicle-filter');
if (hiddenInput) hiddenInput.value = value;
var selectedVehicle = value ? (s.allHistoryVehicles || []).find(function(v) { return String(v.id) === String(value); }) : null;
renderHistoryVehicleTrigger(value, text, selectedVehicle);
updateHistoryTriggerTone(value);
setHistoryVehicleDropdownOpen(false);
renderHistoryList();
}

document.addEventListener('click', function(ev) {
const wrap = document.querySelector('.history-vehicle-dropdown-wrap');
const dropdown = document.getElementById('history-vehicle-dropdown');
if (wrap && dropdown && dropdown.style.display !== 'none' && !wrap.contains(ev.target)) {
setHistoryVehicleDropdownOpen(false);
}
});

function normalizeDriverHistoryKm(val) {
if (val == null || val === '') return null;
var n = parseInt(String(val).replace(/\D/g, ''), 10);
return isNaN(n) ? null : n;
}

function driverHistoryDateKey(tsOrIso) {
if (!tsOrIso || typeof tsOrIso !== 'string') return '';
var s = tsOrIso.trim();
var head10 = s.length >= 10 ? s.slice(0, 10) : '';
if (/^\d{4}-\d{2}-\d{2}$/.test(head10)) return head10;
var d = new Date(s);
if (isNaN(d.getTime())) return '';
var y = d.getFullYear();
var m = String(d.getMonth() + 1).padStart(2, '0');
var day = String(d.getDate()).padStart(2, '0');
return y + '-' + m + '-' + day;
}


function isRedundantKmRevizeEvent(evItem, hareketPool) {
if (!evItem || evItem._type !== 'event' || evItem.eventType !== 'km-revize') return false;
var yeni = normalizeDriverHistoryKm(evItem.data && evItem.data.yeniKm);
if (yeni === null) return false;
var vid = String(evItem.arac_id != null ? evItem.arac_id : '');
var dayEvt = '';
var evDateRaw = evItem.date ? String(evItem.date).trim() : '';
if (/^\d{4}-\d{2}-\d{2}$/.test(evDateRaw)) {
dayEvt = evDateRaw;
} else {
dayEvt = driverHistoryDateKey(evItem.timestamp || '');
}
if (!dayEvt) return false;
var pool = hareketPool || [];
return pool.some(function (h) {
if (!h || h._type !== 'hareket') return false;
if (String(h.arac_id) !== vid) return false;
if (normalizeDriverHistoryKm(h.guncel_km) !== yeni) return false;
var dayH = driverHistoryDateKey(h.guncelleme_tarihi || h.kayit_tarihi || '');
return dayH !== '' && dayH === dayEvt;
});
}

function buildCombinedHistoryList() {
var filterEl = document.getElementById('history-vehicle-filter');
var vehicleFilter = (filterEl && filterEl.value) ? filterEl.value : '';
const hareketler = (s.allHistoryRecords || []).map(r => ({ ...r, _type: 'hareket' }));
const eventItems = [];
(s.allHistoryVehicles || []).forEach(v => {
const aracId = v.id;
if (vehicleFilter && String(aracId) !== String(vehicleFilter)) return;
const events = v.events || [];
events.forEach(ev => {
eventItems.push({
_type: 'event',
id: 'evt-' + (ev.id || Math.random()),
arac_id: aracId,
eventType: ev.type,
timestamp: ev.timestamp || '',
date: ev.date || '',
data: ev.data || {}
});
});
});
const hareketFiltered = vehicleFilter
? hareketler.filter(r => String(r.arac_id) === String(vehicleFilter))
: hareketler;
const eventItemsDedup = eventItems.filter(function (ei) {
return !isRedundantKmRevizeEvent(ei, hareketFiltered);
});
const combined = [...hareketFiltered, ...eventItemsDedup];

const sortKey = (item) => {
if (item._type === 'hareket') {
const ts = item.guncelleme_tarihi || item.kayit_tarihi || '';
return ts + '\t' + (item.id != null ? String(item.id) : '');
}
if (item.timestamp) return item.timestamp;
const d = item.date ? parseHistoryDate(item.date) : null;
return d ? d.toISOString() : '';
};
combined.sort((a, b) => (sortKey(b) || '').localeCompare(sortKey(a) || ''));
return combined;
}

function parseHistoryDate(str) {
if (!str || typeof str !== 'string') return null;
const trimmed = str.trim();
if (!trimmed) return null;
if (trimmed.includes('.')) {
const parts = trimmed.split('.');
if (parts.length === 3) {
const day = parseInt(parts[0], 10);
const month = parseInt(parts[1], 10) - 1;
const year = parseInt(parts[2], 10);
if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
const d = new Date(year, month, day);
if (!isNaN(d.getTime())) return d;
}
}
}
const d = new Date(trimmed);
return isNaN(d.getTime()) ? null : d;
}

function formatHistoryPeriod(item) {
function formatDateDDMMYYYY(d) {
if (!d || isNaN(d.getTime())) return '';
const dd = String(d.getDate()).padStart(2, '0');
const mm = String(d.getMonth() + 1).padStart(2, '0');
const yyyy = String(d.getFullYear());
return `${dd}.${mm}.${yyyy}`;
}

if (item._type === 'hareket') {
const ts = item.guncelleme_tarihi || item.kayit_tarihi || '';
const d = ts ? (parseHistoryDate(ts) || new Date(ts)) : null;
const f = d && !isNaN(d.getTime()) ? h.formatDateDDMMYYYY(d) : '';
return f || formatPeriod(item.donem || '');
}

if (item.date) {
const d = parseHistoryDate(item.date);
const f = d ? h.formatDateDDMMYYYY(d) : '';
return f || item.date;
}

if (item.timestamp) {
const d = parseHistoryDate(item.timestamp) || new Date(item.timestamp);
return d && !isNaN(d.getTime()) ? h.formatDateDDMMYYYY(d) : '';
}

return '';
}

function getDriverFeedbackHistoryActionLabel(type) {
var t = String(type || '').toLocaleLowerCase('tr-TR');
if (t === 'sikayet' || t === 'şikayet') return 'Şikayet Edildi.';
if (t === 'oneri' || t === 'öneri') return 'Önerildi.';
return 'Talep Edildi.';
}

function renderHistoryList() {
var listEl = document.getElementById('history-list');
if (!listEl) return;
var sorted;
try {
sorted = buildCombinedHistoryList();
} catch (e) {
listEl.innerHTML = '<p class="history-empty">Kayıtlar yüklenirken hata oluştu.</p>';
return;
}
listEl.innerHTML = '';
if (!sorted || sorted.length === 0) {
listEl.innerHTML = '<p class="history-empty">Geçmiş kayıt bulunamadı.</p>';
return;
}
window._historyRecordMap = window._historyRecordMap || {};
sorted.forEach(item => {
const vehicle = s.allHistoryVehicles.find(v => String(v.id) === String(item.arac_id));
const plaka = vehicle ? h.formatDriverPlaka(vehicle.plaka) : item.arac_id;
const periodLabel = formatHistoryPeriod(item);

let detailsHtml = '';
let showEditBtn = false;

if (item._type === 'hareket') {
window._historyRecordMap[item.id] = item;
showEditBtn = true;
if (item.kaza_durumu) {
detailsHtml = '<p>Kaza Bilgisi Bildirildi.</p>';
if (item.kaza_hasar_tutari) detailsHtml += `<p>Hasar tutar\u0131: ${h.escapeHtmlDriver(item.kaza_hasar_tutari)} TL olarak bildirildi.</p>`;
} else if (item.bakim_durumu) {
const bakimAcik = h.escapeHtmlDriver(window.capitalizeWords(item.bakim_aciklama || 'Var'));
detailsHtml = `<p>Bak\u0131m bilgisi ${bakimAcik} olarak bildirildi.</p>`;
if (item.bakim_tarih) detailsHtml += `<p>Tarih: ${h.escapeHtmlDriver(item.bakim_tarih)}.</p>`;
if (item.guncel_km) detailsHtml += `<p>Km; ${h.formatKm(item.guncel_km)} olarak bildirildi.</p>`;
} else {
detailsHtml = `<p>Km; ${h.formatKm(item.guncel_km) || '0'} olarak bildirildi.</p>`;
}
} else {
const d = item.data || {};
if (item.eventType === 'anahtar-guncelle') {
const durum = (d.durum === 'var') ? 'Var' : 'Yok';
detailsHtml = `<p>Yedek anahtar ${h.escapeHtmlDriver(durum)} olarak bildirildi.</p>`;
if (d.detay) detailsHtml += `<p>Konum: ${h.escapeHtmlDriver(d.detay)}.</p>`;
} else if (item.eventType === 'lastik-guncelle') {
const durum = (d.durum === 'var') ? 'Var' : 'Yok';
detailsHtml = `<p>Yazl\u0131k/ K\u0131\u015fl\u0131k lastik durumu ${h.escapeHtmlDriver(durum)} olarak bildirildi.</p>`;
if (d.adres) detailsHtml += `<p>Adres: ${h.escapeHtmlDriver(d.adres)}.</p>`;
} else if (item.eventType === 'utts-guncelle') {
const durum = d.durum ? 'Evet' : 'Hay\u0131r';
detailsHtml = `<p>UTTS ${h.escapeHtmlDriver(durum)} olarak bildirildi.</p>`;
} else if (item.eventType === 'muayene-guncelle') {
detailsHtml = '<p>Muayene bilgisi g\u00fcncellendi olarak bildirildi.</p>';
if (d.bitisTarihi) detailsHtml += `<p>Biti\u015f tarihi: ${h.escapeHtmlDriver(d.bitisTarihi)}.</p>`;
if (d.egzozMuayeneYapilmaDate) detailsHtml += `<p>Egzoz muayene — yapt\u0131r\u0131lan: ${h.escapeHtmlDriver(d.egzozMuayeneYapilmaDate)}.</p>`;
if (d.egzozMuayeneDate) detailsHtml += `<p>Egzoz muayene — biti\u015f: ${h.escapeHtmlDriver(d.egzozMuayeneDate)}.</p>`;
} else if (item.eventType === 'kasko-guncelle') {
detailsHtml = '<p>Kasko yenilemesi bildirildi.</p>';
if (d.bitisTarihi) detailsHtml += `<p>Biti\u015f tarihi: ${h.escapeHtmlDriver(d.bitisTarihi)}.</p>`;
} else if (item.eventType === 'sigorta-guncelle') {
detailsHtml = '<p>Trafik sigortas\u0131 yenileme bildirildi.</p>';
if (d.bitisTarihi) detailsHtml += `<p>Biti\u015f tarihi: ${h.escapeHtmlDriver(d.bitisTarihi)}.</p>`;
} else if (item.eventType === 'kasko-kodu-guncelle') {
detailsHtml = '<p>Kasko kodu g\u00fcncellendi.</p>';
if (d.kaskoKodu) detailsHtml += `<p>Yeni kod: ${h.escapeHtmlDriver(d.kaskoKodu)}.</p>`;
} else if (item.eventType === 'satis') {
detailsHtml = '<p>Sat\u0131\u015f/pert bildirildi.</p>';
if (d.tutar) detailsHtml += `<p>Tutar: ${h.escapeHtmlDriver(d.tutar)} TL.</p>`;
if (d.aciklama) detailsHtml += `<p>A\u00e7\u0131klama: ${h.escapeHtmlDriver(d.aciklama)}.</p>`;
} else if (item.eventType === 'ceza') {
detailsHtml = '<p>Trafik cezas\u0131 bildirildi.</p>';
if (d.tutar) detailsHtml += `<p>Tutar: ${h.escapeHtmlDriver(d.tutar)} TL.</p>`;
if (d.aciklama) detailsHtml += `<p>A\u00e7\u0131klama: ${h.escapeHtmlDriver(d.aciklama)}.</p>`;
} else if (item.eventType === 'kredi-guncelle') {
detailsHtml = '<p>Hak mahrumiyeti bilgisi g\u00fcncellendi olarak bildirildi.</p>';
} else if (item.eventType === 'takip-cihaz-guncelle') {
detailsHtml = '<p>Takip cihaz\u0131 bilgisi g\u00fcncellendi olarak bildirildi.</p>';
} else if (item.eventType === 'not-guncelle') {
detailsHtml = '<p>Not bilgisi g\u00fcncellendi olarak bildirildi.</p>';
} else if (item.eventType === 'sube-degisiklik') {
detailsHtml = '<p>\u015eube bilgisi g\u00fcncellendi olarak bildirildi.</p>';
} else if (item.eventType === 'kullanici-atama') {
detailsHtml = '<p>Kullan\u0131c\u0131 atamas\u0131 yap\u0131ld\u0131 olarak bildirildi.</p>';
} else if (item.eventType === 'driver-feedback') {
const typeRaw = d.konuTuru || d.konu_turu || d.type;
const mesaj = String(d.mesaj || '').trim();
const actionLabel = getDriverFeedbackHistoryActionLabel(typeRaw);
const mesajQuoted = mesaj ? '"' + h.escapeHtmlDriver(mesaj) + '"' : '—';
detailsHtml = `<p>${mesajQuoted} Konusu ${h.escapeHtmlDriver(actionLabel)}</p>`;
} else {
let fallbackLabel = item.eventType || 'G\u00fcncelleme';
fallbackLabel = fallbackLabel.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
detailsHtml = `<p>${h.escapeHtmlDriver(fallbackLabel)} olarak bildirildi.</p>`;
}
}

const card = document.createElement('div');
card.className = 'history-card';
const editId = typeof item.id === 'number' ? item.id : JSON.stringify(String(item.id));
card.setAttribute('data-record-id', String(editId));
const pencilSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>';
card.innerHTML = `
<div class="history-card-content">
<div class="history-header">
<span class="history-period">${h.escapeHtmlDriver(periodLabel)}</span>
<span class="history-vehicle">${h.escapeHtmlDriver(plaka)}</span>
</div>
<div class="history-details-row">
<div class="history-details">${detailsHtml}</div>
${showEditBtn ? `<button type="button" onclick="showEditRequest(${editId})" class="history-edit-icon" title="Düzeltme Talep Et" aria-label="Düzeltme Talep Et">${pencilSvg}</button>` : ''}
</div>
</div>
`;
listEl.appendChild(card);
});
}

function closeHistory() {
setHistoryVehicleDropdownOpen(false);
document.getElementById('history-modal').classList.remove('show');
h.updateDriverModalBodyClass();
};


function showEditRequest(recordId) {
const record = window._historyRecordMap && window._historyRecordMap[recordId];
if (!record) return;
s.currentRecordId = recordId;
document.getElementById('current-km').textContent = h.formatKm(record.guncel_km) || '0';
document.getElementById('new-km').value = '';
document.getElementById('new-km').placeholder = h.formatKm(record.guncel_km) || 'Örn: 54230';

document.getElementById('current-bakim').textContent = record.bakim_durumu ? window.capitalizeWords(record.bakim_aciklama || 'Var') : 'Yok';
document.getElementById('new-bakim').value = '';
document.getElementById('new-bakim').placeholder = record.bakim_durumu ? window.capitalizeWords(record.bakim_aciklama || '') : "Boş bırakırsanız 'Yok' sayılır";

document.getElementById('current-kaza').textContent = record.kaza_durumu ? window.capitalizeWords(record.kaza_aciklama || 'Var') : 'Yok';
document.getElementById('new-kaza').value = '';
document.getElementById('new-kaza').placeholder = record.kaza_durumu ? window.capitalizeWords(record.kaza_aciklama || '') : "Boş bırakırsanız 'Yok' sayılır";

document.getElementById('edit-reason').value = '';

var sectionKm = document.getElementById('edit-section-km');
var sectionBakim = document.getElementById('edit-section-bakim');
var sectionKaza = document.getElementById('edit-section-kaza');
if (sectionKm) sectionKm.style.display = 'none';
if (sectionBakim) sectionBakim.style.display = 'none';
if (sectionKaza) sectionKaza.style.display = 'none';
if (record.kaza_durumu) {
if (sectionKaza) sectionKaza.style.display = 'block';
window._editRequestVisibleSection = 'kaza';
} else if (record.bakim_durumu) {
if (sectionBakim) sectionBakim.style.display = 'block';
window._editRequestVisibleSection = 'bakim';
} else {
if (sectionKm) sectionKm.style.display = 'block';
window._editRequestVisibleSection = 'km';
}

document.getElementById('edit-request-modal').classList.add('show');
h.updateDriverModalBodyClass();
var row = document.querySelector('#history-modal .history-card[data-record-id="' + String(recordId) + '"]');
if (row) row.classList.add('history-row-editing');
};

function closeEditRequest() {
document.querySelectorAll('#history-modal .history-card.history-row-editing').forEach(function(el) { el.classList.remove('history-row-editing'); });
document.getElementById('edit-request-modal').classList.remove('show');
s.currentRecordId = null;
h.updateDriverModalBodyClass();
};

async function submitEditRequest() {
if (!h.ensureDriverOnlineForWrite()) return;
const record = window._historyRecordMap && window._historyRecordMap[s.currentRecordId];
if (!record) return;
const visibleSection = window._editRequestVisibleSection || 'km';
const reason = document.getElementById('edit-reason').value.trim();
if (!reason) {
alert('Düzeltme sebebini yazmalısınız!');
return;
}

var kmChanged = false, bakimChanged = false, kazaChanged = false;
var newKm = null, newBakim = '', newKaza = '';
if (visibleSection === 'km') {
var newKmVal = document.getElementById('new-km').value.trim();
newKm = newKmVal ? parseInt(newKmVal.replace(/\./g, ''), 10) : null;
kmChanged = newKm !== null && newKm !== (record.guncel_km || 0);
if (newKm !== null && newKm <= 0) {
alert('Geçerli bir KM değeri girin!');
return;
}
} else if (visibleSection === 'bakim') {
newBakim = document.getElementById('new-bakim').value.trim();
var currentBakim = record.bakim_durumu ? (record.bakim_aciklama || '') : '';
bakimChanged = (newBakim || '') !== (currentBakim || '');
} else if (visibleSection === 'kaza') {
newKaza = document.getElementById('new-kaza').value.trim();
var currentKaza = record.kaza_durumu ? (record.kaza_aciklama || '') : '';
kazaChanged = (newKaza || '') !== (currentKaza || '');
}

if (!kmChanged && !bakimChanged && !kazaChanged) {
alert('En az bir alanda değişiklik yapmalısınız!');
return;
}

const payload = { kayit_id: s.currentRecordId, sebep: reason };
if (kmChanged && newKm !== null) payload.yeni_km = newKm;
if (bakimChanged) {
payload.yeni_bakim_durumu = newBakim ? 1 : 0;
payload.yeni_bakim_aciklama = window.capitalizeWords(newBakim);
}
if (kazaChanged) {
payload.yeni_kaza_durumu = newKaza ? 1 : 0;
payload.yeni_kaza_aciklama = window.capitalizeWords(newKaza);
}
try {
const response = await fetch(p.API_BASE + 'driver_request.php', {
method: 'POST',
headers: {
'Content-Type': 'application/json',
'Authorization': 'Bearer ' + s.currentToken
},
body: JSON.stringify(payload)
});

const data = await response.json();

if (data.success) {
alert('✓ Düzeltme talebiniz gönderildi. Admin onayı bekleniyor.');
closeEditRequest();
if (document.getElementById('history-list').parentElement && document.getElementById('history-modal').classList.contains('show')) {
renderHistoryList();
}
} else {
alert('❌ ' + data.message);
}

} catch (error) {
alert('❌ Bağlantı hatası!');
}
};
runtime.registerFeature('history', {
showHistory: showHistory,
closeHistory: closeHistory,
toggleHistoryVehicleDropdown: toggleHistoryVehicleDropdown,
showEditRequest: showEditRequest,
closeEditRequest: closeEditRequest,
submitEditRequest: submitEditRequest,
renderHistoryList: renderHistoryList
});
})();
