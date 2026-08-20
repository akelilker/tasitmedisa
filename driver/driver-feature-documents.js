
(function() {
'use strict';
var runtime = window.MedisaDriverRuntime;
if (!runtime) throw new Error('MedisaDriverRuntime eksik');
var s = runtime.state;
var h = runtime.helpers;
var p = runtime.paths;
var getDriverVehicleTypeKey = h.getDriverVehicleTypeKey;
var normalizeDriverVehicleTypeKey = h.normalizeDriverVehicleTypeKey;
var driverVehicleNeedsK2 = h.driverVehicleNeedsK2;
var driverVehicleNeedsTakograf = h.driverVehicleNeedsTakograf;
var driverVehicleIsHeavyCommercial = h.driverVehicleIsHeavyCommercial;
if (typeof getDriverVehicleTypeKey !== 'function'
|| typeof normalizeDriverVehicleTypeKey !== 'function'
|| typeof driverVehicleNeedsK2 !== 'function'
|| typeof driverVehicleNeedsTakograf !== 'function'
|| typeof driverVehicleIsHeavyCommercial !== 'function') {
throw new Error('MedisaDriverRuntime vehicle document helpers eksik');
}
const DRIVER_DOCUMENT_TYPES = [
{ key: 'ruhsat', title: 'Ruhsat', pathField: 'ruhsatPath', icon: 'document' },
{ key: 'sigorta', title: 'Sigorta Poliçesi', pathField: 'sigortaPolicePath', icon: 'shield' },
{ key: 'kasko', title: 'Kasko Poliçesi', pathField: 'kaskoPolicePath', icon: 'shield' },
{ key: 'tasit_karti', title: 'Taşıt Kartı', pathField: 'tasitKartiPath', icon: 'id-card' },
{ key: 'takograf', title: 'Takograf Belgesi', pathField: 'takografBelgesiPath', icon: 'gauge' }
];

function getDriverDocumentTypeConfig(key) {
return DRIVER_DOCUMENT_TYPES.find(function(item) { return item.key === key; });
}

function getDriverDocumentTypesForVehicle(vehicle) {
var keys = ['ruhsat', 'sigorta', 'kasko'];
if (driverVehicleNeedsK2(vehicle)) keys.push('tasit_karti');
if (driverVehicleNeedsTakograf(vehicle)) keys.push('takograf');
return keys.map(function(key) {
return getDriverDocumentTypeConfig(key);
}).filter(Boolean);
}

function hasDriverDocument(vehicle, config) {
return !!(vehicle && config && String(vehicle[config.pathField] || '').trim());
}

function buildDriverDocumentUrl(vehicleId, documentType) {
const rawId = String(vehicleId || '').trim();
if (!rawId) return '';
const url = new URL(p.APP_ROOT + 'ruhsat.php', window.location.origin);
url.searchParams.set('id', rawId);
url.searchParams.set('documentType', String(documentType || 'ruhsat').trim() || 'ruhsat');
return url.toString();
}

function showDriverDocumentTabError(tabWindow, message) {
if (!tabWindow || tabWindow.closed) return;
const safeMessage = String(message || 'Belge açılamadı.').replace(/[<>&"]/g, function(ch) {
return ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[ch] || ch;
});
try {
tabWindow.document.open();
tabWindow.document.write('<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><title>Belge</title></head><body><p>' + safeMessage + '</p></body></html>');
tabWindow.document.close();
} catch (e) {}
}

function mintDriverDocumentToken(vehicleId, documentType) {
const rawId = String(vehicleId || '').trim();
const dt = String(documentType || 'ruhsat').trim() || 'ruhsat';
if (!rawId || !s.currentToken) {
return Promise.reject(new Error('driver-document-auth-missing'));
}
return fetch(p.APP_ROOT + 'document_token.php', {
method: 'POST',
cache: 'no-store',
headers: {
'Content-Type': 'application/json',
'Authorization': 'Bearer ' + s.currentToken
},
body: JSON.stringify({ vehicleId: rawId, documentType: dt })
})
.then(function(response) {
return response.json().then(function(data) {
if (!response.ok || !data || data.ok !== true || !data.token) {
const err = new Error('driver-document-token-failed');
err.httpStatus = response.status;
err.message = (data && data.message) ? data.message : 'Belge erişim anahtarı alınamadı.';
throw err;
}
return {
token: String(data.token),
expiresAt: Number(data.expiresAt) || 0
};
});
});
}

function openDriverDocumentInNewTab(vehicleId, documentType) {
const baseUrl = buildDriverDocumentUrl(vehicleId, documentType);
if (!baseUrl) {
setDriverDocumentsMessage('Taşıt bilgisi bulunamadı.', true);
return;
}
if (!s.currentToken) {
setDriverDocumentsMessage('Oturumunuz sona erdi.', true);
return;
}

let blankTab = null;
try {
blankTab = window.open('about:blank', '_blank');
if (blankTab) {
try {
blankTab.opener = null;
} catch (openerErr) {}
}
} catch (e) {}

mintDriverDocumentToken(vehicleId, documentType)
.then(function(entry) {
let targetUrl;
try {
targetUrl = new URL(baseUrl);
targetUrl.searchParams.delete('token');
targetUrl.searchParams.set('doc', entry.token);
} catch (urlErr) {
throw urlErr;
}
const finalUrl = targetUrl.toString();
if (blankTab && !blankTab.closed) {
try {
blankTab.location.href = finalUrl;
blankTab.focus();
return;
} catch (navErr) {}
}
window.location.href = finalUrl;
})
.catch(function(err) {
if (blankTab && !blankTab.closed) {
showDriverDocumentTabError(blankTab, err && err.message ? err.message : 'Belge açılamadı.');
return;
}
setDriverDocumentsMessage((err && err.message) ? err.message : 'Belge açılamadı.', true);
});
}

function setDriverDocumentsMessage(message, isError) {
const messageEl = document.getElementById('driver-documents-message');
if (!messageEl) return;
messageEl.textContent = message || '';
messageEl.classList.toggle('is-error', !!isError);
}

function getDriverDocumentIconSvg(config) {
if (!config) return '';
var svgOpen = '<svg class="driver-document-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
var svgClose = '</svg>';
if (config.key === 'sigorta') {
return svgOpen +
'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>' +
'<path d="M8 12h8"></path><path d="M12 8v8"></path>' +
svgClose;
}
if (config.key === 'kasko') {
return svgOpen +
'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>' +
'<path d="M7 14h.01"></path><path d="M17 14h.01"></path>' +
'<path d="M6 14h12l-1.4-4.2a1 1 0 0 0-.95-.8H7.35a1 1 0 0 0-.95.8L6 14z"></path>' +
svgClose;
}
if (config.key === 'tasit_karti') {
return svgOpen +
'<rect x="3" y="6" width="18" height="12" rx="2"></rect>' +
'<circle cx="8.5" cy="11" r="2"></circle>' +
'<path d="M13 10h6"></path><path d="M13 14h4"></path>' +
svgClose;
}
if (config.key === 'takograf') {
return svgOpen +
'<path d="M12 15v2"></path>' +
'<path d="M6.5 12a5.5 5.5 0 0 1 11 0"></path>' +
'<path d="M12 12l2.8-3.5"></path>' +
svgClose;
}
return svgOpen +
'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>' +
'<path d="M14 2v6h6"></path><path d="M16 13H8"></path><path d="M16 17H8"></path><path d="M10 9H8"></path>' +
svgClose;
}

function buildDriverDocumentCardHtml(vehicle, config) {
const hasDocument = hasDriverDocument(vehicle, config);
const actionText = hasDocument ? 'Görüntüle' : 'Yüklü Değil';
const disabledAttr = hasDocument ? '' : ' aria-disabled="true"';
const iconHtml = getDriverDocumentIconSvg(config);
return '<button type="button" class="driver-document-card' + (hasDocument ? '' : ' driver-document-card-missing') + '" data-document-type="' + config.key + '"' + disabledAttr + '>' +
'<span class="driver-document-icon-wrap">' + iconHtml + '</span>' +
'<span class="driver-document-title">' + config.title + '</span>' +
'<span class="driver-document-action">' + actionText + '</span>' +
'</button>';
}

function renderDriverDocumentsModal(vehicle) {
const listEl = document.getElementById('driver-documents-list');
if (!listEl) return;
const vehicleId = vehicle && vehicle.id != null ? String(vehicle.id) : '';
const documentTypes = getDriverDocumentTypesForVehicle(vehicle);
const typeByKey = {};
documentTypes.forEach(function(config) {
typeByKey[config.key] = config;
});
const documentRows = [
{ rowClass: 'driver-documents-row driver-documents-row-single', keys: ['ruhsat'] },
{ rowClass: 'driver-documents-row driver-documents-row-pair', keys: ['sigorta', 'kasko'] },
{ rowClass: 'driver-documents-row driver-documents-row-pair driver-documents-row-optional', keys: ['tasit_karti', 'takograf'] }
];
listEl.innerHTML = documentRows.map(function(row) {
const cards = row.keys
.map(function(key) { return typeByKey[key]; })
.filter(Boolean)
.map(function(config) { return buildDriverDocumentCardHtml(vehicle, config); });
if (!cards.length) return '';
var rowClass = row.rowClass;
if (cards.length === 1) {
rowClass += ' driver-documents-row-one';
}
return '<div class="' + rowClass + '">' + cards.join('') + '</div>';
}).join('');
listEl.querySelectorAll('.driver-document-card').forEach(function(card) {
card.addEventListener('click', function() {
const documentType = card.getAttribute('data-document-type') || 'ruhsat';
const config = documentTypes.find(function(item) { return item.key === documentType; });
if (!hasDriverDocument(vehicle, config)) {
setDriverDocumentsMessage(config.title + ' belgesi yüklü değil.', true);
return;
}
const url = buildDriverDocumentUrl(vehicleId, documentType);
if (!url) {
setDriverDocumentsMessage('Taşıt bilgisi bulunamadı.', true);
return;
}
setDriverDocumentsMessage('', false);
openDriverDocumentInNewTab(vehicleId, documentType);
});
});
}
function openDriverDocumentsModal() {
const modal = document.getElementById('driver-documents-modal');
const vehicle = h.getSelectedVehicle();
if (!modal) return;
if (!vehicle || vehicle.id == null) {
setDriverDocumentsMessage('Taşıt bilgisi bulunamadı.', true);
return;
}
renderDriverDocumentsModal(vehicle);
setDriverDocumentsMessage('', false);
const inner = document.querySelector('.driver-action-area-inner[data-vehicle-id="' + String(vehicle.id) + '"]');
if (inner) inner.classList.add('driver-feedback-panel-open');
modal.classList.add('show');
h.updateDriverModalBodyClass();
};

function closeDriverDocumentsModal() {
const modal = document.getElementById('driver-documents-modal');
if (modal) modal.classList.remove('show');
setDriverDocumentsMessage('', false);
document.querySelectorAll('.driver-action-area-inner.driver-feedback-panel-open').forEach(function(el) {
el.classList.remove('driver-feedback-panel-open');
});
h.updateDriverModalBodyClass();
};
runtime.registerFeature('documents', {
openDriverDocumentsModal: openDriverDocumentsModal,
closeDriverDocumentsModal: closeDriverDocumentsModal
});
})();
