
(function() {
'use strict';
var runtime = window.MedisaDriverRuntime;
if (!runtime) throw new Error('MedisaDriverRuntime eksik');
var s = runtime.state;
var h = runtime.helpers;
var p = runtime.paths;
if (typeof h.persistSessionToken !== 'function') {
throw new Error('MedisaDriverRuntime session helper eksik');
}
function setDriverPasswordMessage(message, isError) {
const messageEl = document.getElementById('driver-password-message');
if (!messageEl) return;
messageEl.textContent = message || '';
messageEl.classList.toggle('is-error', !!isError);
messageEl.classList.toggle('is-success', !!message && !isError);
}

function clearSavedDriverPassword() {
try {
localStorage.removeItem('driver_saved_password');
} catch (e) {}
}

function setDriverPasswordModalMode(isMandatory) {
const title = document.getElementById('driver-password-modal-title');
const closeBtn = document.getElementById('driver-password-modal-close');
const cancelBtn = document.getElementById('driver-password-cancel');
const notice = document.getElementById('driver-password-required-notice');
s.driverPasswordMandatoryMode = isMandatory === true;
if (title) {
title.textContent = isMandatory ? 'Parola Değişikliği Zorunlu' : 'Şifre Değiştir';
}
if (closeBtn) closeBtn.hidden = isMandatory;
if (cancelBtn) cancelBtn.hidden = isMandatory;
if (notice) notice.hidden = !isMandatory;
if (document.body) {
document.body.classList.toggle('password-change-gate-active', isMandatory);
}
}

function openDriverPasswordModal() {
const modal = document.getElementById('driver-password-modal');
const form = document.getElementById('driver-password-form');
if (!modal) return;
if (form) form.reset();
setDriverPasswordMessage('', false);
setDriverPasswordModalMode(false);
modal.classList.add('show');
h.updateDriverModalBodyClass();
setTimeout(function() {
const currentInput = document.getElementById('driver-current-password');
if (currentInput) currentInput.focus();
}, 50);
};

function closeDriverPasswordModal() {
if (s.driverPasswordMandatoryMode) return;
const modal = document.getElementById('driver-password-modal');
const form = document.getElementById('driver-password-form');
if (modal) modal.classList.remove('show');
if (form) form.reset();
setDriverPasswordMessage('', false);
h.updateDriverModalBodyClass();
};

function openMandatoryDriverPasswordChange() {
const modal = document.getElementById('driver-password-modal');
const form = document.getElementById('driver-password-form');
if (!modal) return;
if (form) form.reset();
setDriverPasswordMessage('', false);
setDriverPasswordModalMode(true);
modal.classList.add('show');
h.updateDriverModalBodyClass();
setTimeout(function() {
const currentInput = document.getElementById('driver-current-password');
if (currentInput) currentInput.focus();
}, 50);
};

async function submitDriverPasswordChange(event) {
if (event && typeof event.preventDefault === 'function') event.preventDefault();
if (!h.ensureDriverOnlineForWrite()) return false;
if (!s.currentToken) {
h.logout();
return false;
}

const currentInput = document.getElementById('driver-current-password');
const newInput = document.getElementById('driver-new-password');
const confirmInput = document.getElementById('driver-new-password-confirm');
const submitBtn = document.getElementById('driver-password-submit');
const currentPassword = currentInput ? currentInput.value.trim() : '';
const newPassword = newInput ? newInput.value.trim() : '';
const confirmPassword = confirmInput ? confirmInput.value.trim() : '';

if (!currentPassword || !newPassword || !confirmPassword) {
setDriverPasswordMessage('Tüm şifre alanlarını doldurun.', true);
return false;
}
if (newPassword.length < 6
|| !/[A-ZÇĞİÖŞÜ]/.test(newPassword)
|| !/[a-zçğıöşü]/.test(newPassword)
|| !/[0-9]/.test(newPassword)) {
setDriverPasswordMessage('Yeni parola güvenlik koşullarını karşılamıyor.', true);
return false;
}
if (newPassword !== confirmPassword) {
setDriverPasswordMessage('Yeni parolalar eşleşmiyor.', true);
return false;
}
if (newPassword === currentPassword) {
setDriverPasswordMessage('Yeni parola mevcut paroladan farklı olmalıdır.', true);
return false;
}

if (submitBtn) {
submitBtn.disabled = true;
submitBtn.textContent = 'Kaydediliyor...';
}
setDriverPasswordMessage('', false);

try {
const response = await fetch(p.API_BASE + 'driver_change_password.php', {
method: 'POST',
headers: {
'Content-Type': 'application/json',
'Authorization': 'Bearer ' + s.currentToken
},
body: JSON.stringify({
currentPassword: currentPassword,
newPassword: newPassword
})
});
const data = await response.json();

if (!response.ok || !data.success || !data.token) {
setDriverPasswordMessage((data && data.message) || 'Parola değiştirilemedi. Tekrar deneyin.', true);
return false;
}

const rememberSession = typeof h.isPortalSessionRemembered === 'function'
? h.isPortalSessionRemembered()
: false;
h.persistSessionToken(data.token, rememberSession);
if (s.currentUser) s.currentUser.ilk_giris_parola_onerisi_bekliyor = false;
s.driverPasswordMandatoryMode = false;
setDriverPasswordMessage('Parolanız değiştirildi. Oturumunuz güvenli şekilde yenilendi.', false);
h.clearSavedDriverPassword();
setTimeout(function() {
window.location.href = p.DRIVER_PAGE_BASE + 'index.html';
}, 900);
} catch (error) {
setDriverPasswordMessage('Bağlantı hatası. Lütfen tekrar deneyin.', true);
} finally {
if (submitBtn) {
submitBtn.disabled = false;
submitBtn.textContent = 'Kaydet';
}
}

return false;
};
runtime.registerFeature('password', {
openDriverPasswordModal: openDriverPasswordModal,
closeDriverPasswordModal: closeDriverPasswordModal,
openMandatoryDriverPasswordChange: openMandatoryDriverPasswordChange,
submitDriverPasswordChange: submitDriverPasswordChange
});
})();
