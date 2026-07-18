
(function() {
'use strict';
var runtime = window.MedisaDriverRuntime;
if (!runtime) throw new Error('MedisaDriverRuntime eksik');
var s = runtime.state;
var h = runtime.helpers;
var p = runtime.paths;
function setDriverFeedbackMessage(message, isError) {
const messageEl = document.getElementById('driver-feedback-message-status');
if (!messageEl) return;
messageEl.textContent = message || '';
messageEl.classList.toggle('is-error', !!isError);
messageEl.classList.toggle('is-success', !!message && !isError);
}


function closeDriverFeedbackTypeList() {
var list = document.getElementById('driver-feedback-type-list');
var trigger = document.getElementById('driver-feedback-type-trigger');
if (!list || !trigger) return;
unbindFeedbackTypeOutsideClose();
list.classList.remove('open');
trigger.setAttribute('aria-expanded', 'false');
list.setAttribute('aria-hidden', 'true');
list.style.position = '';
list.style.top = '';
list.style.bottom = '';
list.style.left = '';
list.style.right = '';
list.style.width = '';
list.style.maxHeight = '';
list.style.overflowY = '';
list.style.marginTop = '';
list.style.marginBottom = '';
list.style.zIndex = '';
}

function syncDriverFeedbackTypeTriggerFromSelect() {
var select = document.getElementById('driver-feedback-type');
var trigger = document.getElementById('driver-feedback-type-trigger');
var list = document.getElementById('driver-feedback-type-list');
if (!select || !trigger || !list) return;
var idx = select.selectedIndex >= 0 ? select.selectedIndex : 0;
var opt = select.options[idx];
trigger.textContent = opt ? opt.textContent : '';
var val = select.value;
list.querySelectorAll('.vehicle-branch-option').forEach(function(o) {
o.classList.toggle('selected', o.getAttribute('data-value') === val);
});
}

function positionDriverFeedbackTypeList() {
var trigger = document.getElementById('driver-feedback-type-trigger');
var list = document.getElementById('driver-feedback-type-list');
if (!trigger || !list) return;
var r = trigger.getBoundingClientRect();
var gap = 6;
var edgePad = 10;
var footerReserve = 56;
var vh = window.innerHeight || document.documentElement.clientHeight || 640;
var vw = window.innerWidth || document.documentElement.clientWidth || 400;
var spaceBelow = Math.max(0, Math.floor(vh - r.bottom - gap - edgePad - footerReserve));
var spaceAbove = Math.max(0, Math.floor(r.top - gap - edgePad));
var desired = Math.max(list.scrollHeight || 0, 160);
var useAbove = spaceBelow < Math.min(96, desired) && spaceAbove > spaceBelow;
var rawMax = useAbove ? spaceAbove : spaceBelow;
var listMaxHeight = Math.min(260, Math.max(52, rawMax));
var w = Math.min(Math.max(120, r.width), vw - 2 * edgePad);
var left = Math.min(Math.max(edgePad, r.left), vw - w - edgePad);
list.style.position = 'fixed';
list.style.left = left + 'px';
list.style.width = w + 'px';
list.style.right = 'auto';
list.style.marginTop = '0';
list.style.marginBottom = '0';
list.style.maxHeight = listMaxHeight + 'px';
list.style.overflowY = 'auto';
list.style.zIndex = '10060';
if (useAbove) {
list.style.top = 'auto';
list.style.bottom = Math.max(edgePad, vh - r.top + gap) + 'px';
} else {
list.style.top = (r.bottom + gap) + 'px';
list.style.bottom = 'auto';
}
}

var feedbackTypeOutsideBound = false;
function outsideCloseFeedbackType(ev) {
var list = document.getElementById('driver-feedback-type-list');
var wrap = document.querySelector('#driver-feedback-modal .driver-feedback-type-dropdown-wrap');
if (!list || !list.classList.contains('open')) return;
if (wrap && ev.target && typeof wrap.contains === 'function' && wrap.contains(ev.target)) return;
closeDriverFeedbackTypeList();
}
function bindFeedbackTypeOutsideClose() {
if (feedbackTypeOutsideBound) return;
feedbackTypeOutsideBound = true;
document.addEventListener('click', outsideCloseFeedbackType, true);
}
function unbindFeedbackTypeOutsideClose() {
if (!feedbackTypeOutsideBound) return;
feedbackTypeOutsideBound = false;
document.removeEventListener('click', outsideCloseFeedbackType, true);
}

function initDriverFeedbackTypeCustomSelect() {
var select = document.getElementById('driver-feedback-type');
var trigger = document.getElementById('driver-feedback-type-trigger');
var list = document.getElementById('driver-feedback-type-list');
var wrap = document.querySelector('#driver-feedback-modal .driver-feedback-type-dropdown-wrap');
if (!select || !trigger || !list || !wrap) return;
if (trigger.dataset.feedbackTypeBound === '1') return;
trigger.dataset.feedbackTypeBound = '1';

function rebuildOptionRows() {
list.innerHTML = '';
for (var i = 0; i < select.options.length; i++) {
var opt = select.options[i];
var div = document.createElement('div');
div.className = 'vehicle-branch-option';
div.setAttribute('role', 'option');
div.setAttribute('data-value', opt.value);
div.textContent = opt.textContent;
list.appendChild(div);
}
syncDriverFeedbackTypeTriggerFromSelect();
}
rebuildOptionRows();

trigger.addEventListener('click', function(ev) {
ev.preventDefault();
ev.stopPropagation();
var isOpen = list.classList.contains('open');
if (isOpen) {
closeDriverFeedbackTypeList();
} else {
list.classList.add('open');
trigger.setAttribute('aria-expanded', 'true');
list.setAttribute('aria-hidden', 'false');
positionDriverFeedbackTypeList();
requestAnimationFrame(function() {
positionDriverFeedbackTypeList();
setTimeout(function() { bindFeedbackTypeOutsideClose(); }, 0);
});
}
});
trigger.addEventListener('keydown', function(ev) {
if (ev.key === 'Enter' || ev.key === ' ') {
ev.preventDefault();
trigger.click();
}
if (ev.key === 'Escape' && list.classList.contains('open')) {
ev.preventDefault();
closeDriverFeedbackTypeList();
}
});

list.addEventListener('click', function(ev) {
var option = ev.target.closest('.vehicle-branch-option');
if (!option || !option.hasAttribute('data-value')) return;
var value = option.getAttribute('data-value');
select.value = value;
list.querySelectorAll('.vehicle-branch-option').forEach(function(o) { o.classList.remove('selected'); });
option.classList.add('selected');
trigger.textContent = option.textContent;
closeDriverFeedbackTypeList();
select.dispatchEvent(new Event('change', { bubbles: true }));
});


document.addEventListener('keydown', function(ev) {
if (ev.key !== 'Escape') return;
if (!list.classList.contains('open')) return;
ev.preventDefault();
closeDriverFeedbackTypeList();
}, true);
window.addEventListener('resize', function() {
if (list.classList.contains('open')) closeDriverFeedbackTypeList();
});
}

if (document.readyState === 'loading') {
document.addEventListener('DOMContentLoaded', initDriverFeedbackTypeCustomSelect);
} else {
initDriverFeedbackTypeCustomSelect();
}
function openDriverFeedbackModal() {
const modal = document.getElementById('driver-feedback-modal');
const form = document.getElementById('driver-feedback-form');
if (!modal) return;
closeDriverFeedbackTypeList();
if (form) form.reset();
syncDriverFeedbackTypeTriggerFromSelect();
setDriverFeedbackMessage('', false);
const vehicle = typeof h.getSelectedVehicle === 'function' ? h.getSelectedVehicle() : null;
const vid = vehicle && vehicle.id != null ? String(vehicle.id) : '';
if (vid) {
const inner = document.querySelector('.driver-action-area-inner[data-vehicle-id="' + vid + '"]');
if (inner) inner.classList.add('driver-feedback-panel-open');
}
modal.classList.add('show');
h.updateDriverModalBodyClass();

};

window.openDriverDocumentsModal = function() {
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

window.closeDriverDocumentsModal = function() {
const modal = document.getElementById('driver-documents-modal');
if (modal) modal.classList.remove('show');
setDriverDocumentsMessage('', false);
document.querySelectorAll('.driver-action-area-inner.driver-feedback-panel-open').forEach(function(el) {
el.classList.remove('driver-feedback-panel-open');
});
h.updateDriverModalBodyClass();
};

function closeDriverFeedbackModal() {
const modal = document.getElementById('driver-feedback-modal');
const form = document.getElementById('driver-feedback-form');
closeDriverFeedbackTypeList();
if (modal) modal.classList.remove('show');
if (form) form.reset();
setDriverFeedbackMessage('', false);
document.querySelectorAll('.driver-action-area-inner.driver-feedback-panel-open').forEach(function(el) {
el.classList.remove('driver-feedback-panel-open');
});
h.updateDriverModalBodyClass();
};

async function submitDriverFeedback(event) {
if (event && event.preventDefault) event.preventDefault();
if (!h.ensureDriverOnlineForWrite()) return false;
const vehicle = h.getSelectedVehicle();
const typeEl = document.getElementById('driver-feedback-type');
const messageEl = document.getElementById('driver-feedback-message');
const submitBtn = document.getElementById('driver-feedback-submit');
const type = typeEl ? String(typeEl.value || '').trim() : '';
const message = messageEl ? String(messageEl.value || '').trim() : '';

if (!vehicle || vehicle.id == null) {
setDriverFeedbackMessage('Taşıt bilgisi bulunamadı.', true);
return false;
}
if (!type) {
setDriverFeedbackMessage('Konu türünü seçmelisiniz.', true);
return false;
}
if (!message) {
setDriverFeedbackMessage('Mesaj alanını doldurmalısınız.', true);
return false;
}
const messageFormatted = window.capitalizeWords(message);
if (messageFormatted.length > 500) {
setDriverFeedbackMessage('Mesaj çok uzun. En fazla 500 karakter yazabilirsiniz.', true);
return false;
}
if (messageEl) messageEl.value = messageFormatted;

if (submitBtn) submitBtn.disabled = true;
setDriverFeedbackMessage('Gönderiliyor...', false);

try {
const response = await fetch(p.API_BASE + 'driver_feedback.php', {
method: 'POST',
headers: {
'Content-Type': 'application/json',
'Authorization': 'Bearer ' + s.currentToken
},
body: JSON.stringify({
arac_id: vehicle.id,
konu_turu: type,
mesaj: messageFormatted
})
});
const data = await response.json();
if (data && data.success) {
var feedbackTimestamp = data.talep_tarihi || new Date().toISOString();
var localVehicle = (s.allHistoryVehicles || []).find(function(v) {
return String(v.id) === String(vehicle.id);
});
if (localVehicle) {
if (!Array.isArray(localVehicle.events)) localVehicle.events = [];
localVehicle.events.unshift({
id: data.event_id || ('feedback-' + (data.talep_id || Date.now())),
type: 'driver-feedback',
date: feedbackTimestamp.slice(0, 10),
timestamp: feedbackTimestamp,
data: {
konuTuru: type,
mesaj: messageFormatted
}
});
}
setDriverFeedbackMessage('Talebiniz yöneticiye gönderildi.', false);
setTimeout(function() {
closeDriverFeedbackModal();
}, 700);
} else {
setDriverFeedbackMessage((data && data.message) || 'Talep gönderilemedi.', true);
}
} catch (error) {
setDriverFeedbackMessage('Bağlantı hatası oluştu.', true);
} finally {
if (submitBtn) submitBtn.disabled = false;
}

return false;
};
runtime.helpers.syncDriverFeedbackTypeTriggerFromSelect = syncDriverFeedbackTypeTriggerFromSelect;

runtime.registerFeature('feedback', {
openDriverFeedbackModal: openDriverFeedbackModal,
closeDriverFeedbackModal: closeDriverFeedbackModal,
submitDriverFeedback: submitDriverFeedback
});
})();
