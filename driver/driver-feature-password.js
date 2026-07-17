
(function() {
'use strict';
var runtime = window.MedisaDriverRuntime;
if (!runtime) throw new Error('MedisaDriverRuntime eksik');
var s = runtime.state;
var h = runtime.helpers;
var p = runtime.paths;
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

function setDriverPasswordModalMode(isSuggestion, showForm) {
const title = document.getElementById('driver-password-modal-title');
const closeBtn = document.getElementById('driver-password-modal-close');
const cancelBtn = document.getElementById('driver-password-cancel');
const suggestion = document.getElementById('driver-password-suggestion');
const form = document.getElementById('driver-password-form');
s.driverPasswordSuggestionMode = isSuggestion === true;
if (title) {
title.textContent = isSuggestion
? 'Parolanızı Değiştirmeniz Önerilir'
: 'Şifre Değiştir';
}
if (closeBtn) closeBtn.hidden = isSuggestion;
if (cancelBtn) cancelBtn.hidden = isSuggestion;
if (suggestion) suggestion.hidden = !(isSuggestion && !showForm);
if (form) form.hidden = isSuggestion && !showForm;
}

function openDriverPasswordModal() {
const modal = document.getElementById('driver-password-modal');
const form = document.getElementById('driver-password-form');
if (!modal) return;
if (form) form.reset();
setDriverPasswordMessage('', false);
setDriverPasswordModalMode(false, true);
modal.classList.add('show');
h.updateDriverModalBodyClass();
setTimeout(function() {
const currentInput = document.getElementById('driver-current-password');
if (currentInput) currentInput.focus();
}, 50);
};

function closeDriverPasswordModal() {
if (s.driverPasswordSuggestionMode) return;
const modal = document.getElementById('driver-password-modal');
const form = document.getElementById('driver-password-form');
if (modal) modal.classList.remove('show');
if (form) form.reset();
setDriverPasswordMessage('', false);
h.updateDriverModalBodyClass();
};

function openDriverPasswordSuggestion() {
const modal = document.getElementById('driver-password-modal');
const form = document.getElementById('driver-password-form');
if (!modal) return;
if (form) form.reset();
setDriverPasswordMessage('', false);
const suggestionMessage = document.getElementById('driver-password-suggestion-message');
if (suggestionMessage) suggestionMessage.textContent = '';
setDriverPasswordModalMode(true, false);
modal.classList.add('show');
h.updateDriverModalBodyClass();
};

function startSuggestedPasswordChange() {
setDriverPasswordModalMode(true, true);
setTimeout(function() {
const currentInput = document.getElementById('driver-current-password');
if (currentInput) currentInput.focus();
}, 50);
};

async function continueWithCurrentPassword() {
if (!h.ensureDriverOnlineForWrite() || !s.currentToken) return;
const button = document.getElementById('driver-password-continue');
const message = document.getElementById('driver-password-suggestion-message');
if (button) button.disabled = true;
if (message) message.textContent = '';
try {
const response = await fetch(p.API_BASE + 'driver_password_suggestion.php', {
method: 'POST',
headers: {
'Content-Type': 'application/json',
'Authorization': 'Bearer ' + s.currentToken
},
body: '{}'
});
const data = await response.json();
if (!response.ok || !data.success) {
if (message) message.textContent = (data && data.message) || 'Tercihiniz kaydedilemedi.';
return;
}
if (s.currentUser) s.currentUser.ilk_giris_parola_onerisi_bekliyor = false;
s.driverPasswordSuggestionMode = false;
const modal = document.getElementById('driver-password-modal');
if (modal) modal.classList.remove('show');
setDriverPasswordModalMode(false, true);
h.updateDriverModalBodyClass();
} catch (error) {
if (message) message.textContent = 'Bağlantı hatası. Lütfen tekrar deneyin.';
} finally {
if (button) button.disabled = false;
}
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
if (newPassword.trim() === '') {
setDriverPasswordMessage('Parola yalnız boşluklardan oluşamaz.', true);
return false;
}
if (newPassword.length < 6) {
setDriverPasswordMessage('Yeni parolanız en az 6 karakter olmalıdır.', true);
return false;
}
if (newPassword !== confirmPassword) {
setDriverPasswordMessage('Yeni şifre tekrarı eşleşmiyor.', true);
return false;
}
if (newPassword === currentPassword) {
setDriverPasswordMessage('Yeni şifre mevcut şifreyle aynı olamaz.', true);
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

if (!response.ok || !data.success) {
setDriverPasswordMessage((data && data.message) || 'Şifre değiştirilemedi.', true);
return false;
}

setDriverPasswordMessage('Şifre değiştirildi. Yeniden giriş yapmanız gerekiyor.', false);
h.clearSavedDriverPassword();
h.clearStoredPortalTokens();
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
openDriverPasswordSuggestion: openDriverPasswordSuggestion,
startSuggestedPasswordChange: startSuggestedPasswordChange,
continueWithCurrentPassword: continueWithCurrentPassword,
submitDriverPasswordChange: submitDriverPasswordChange
});
})();
