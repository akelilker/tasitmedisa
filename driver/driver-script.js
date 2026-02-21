/* =========================================
   MEDISA KULLANICI MODÜLÜ - SCRIPT
   ========================================= */

// API Base URL: /tasitmedisa/ veya /medisa/ altındaysa mutlak yol (PHP'ler driver klasöründe)
const API_BASE = (function(){
  var p = document.location.pathname;
  if (p.indexOf('/tasitmedisa') === 0) return '/tasitmedisa/driver/';
  if (p.indexOf('/medisa') === 0) return '/medisa/driver/';
  var base = '/';
  var driverIdx = p.indexOf('/driver');
  if (driverIdx !== -1) {
    base = p.substring(0, driverIdx) + '/';
  } else if (p && p !== '/') {
    base = p.endsWith('/') ? p : p + '/';
  }
  return (base === '/' ? './' : base) + (base !== '/' ? 'driver/' : '');
})();

// İkon/kaporta SVG base path (sürücü paneli farklı dizinde)
const ICON_BASE = (function(){
  var p = document.location.pathname;
  if (p.indexOf('/tasitmedisa') === 0) return '/tasitmedisa/icon/';
  if (p.indexOf('/medisa') === 0) return '/medisa/icon/';
  return '../icon/';
})();

// Sayfa yönlendirmeleri: subpath altında değilse relative path (localhost/driver için)
const DRIVER_PAGE_BASE = (function(){
  var p = document.location.pathname;
  if (p.indexOf('/tasitmedisa') === 0) return '/tasitmedisa/driver/';
  if (p.indexOf('/medisa') === 0) return '/medisa/driver/';
  return '';
})();

// Uygulama sürümü (footer #version-display tek kaynak)
const APP_VERSION = 'v78.2';

// Global değişkenler
let currentToken = null;
let currentUser = null;
let currentRecordId = null;
let allHistoryRecords = [];
let allHistoryVehicles = [];
let currentDriverEventVehicleId = null;
let currentPeriod = '';
let selectedVehicleId = null;
/** Bu oturumda (ekran kapanana kadar) son bildirilen aksiyon: { action, vehicleId }. Ekran kapanınca temizlenir, yeşil geri bildirim beyaz/griye döner. */
let lastCompletedActionInSession = null;

function clearSessionGreenFeedback() { lastCompletedActionInSession = null; }
window.addEventListener('pagehide', clearSessionGreenFeedback);
document.addEventListener('visibilitychange', function() { if (document.hidden) clearSessionGreenFeedback(); });

/** Modal açıkken body scroll kilitlensin (sadece modal içi kayar) */
function updateDriverModalBodyClass() {
  var open = document.querySelector('.driver-modal.show');
  if (open) document.body.classList.add('driver-modal-open');
  else document.body.classList.remove('driver-modal-open');
}

/* =========================================
   LOGIN SAYFASI
   ========================================= */

/* Footer dimmer + versiyon */
(function initLoginFooterDim() {
  const footer = document.getElementById('app-footer');
  const versionEl = document.getElementById('version-display');
  if (versionEl) versionEl.textContent = APP_VERSION;
  if (!footer) return;
  footer.classList.add('dimmed');
  footer.classList.remove('delayed');
  setTimeout(function() {
    if (footer) footer.classList.add('delayed');
  }, 4000);
})();

if (document.getElementById('login-form')) {
    /* Beni Hatırla ile giriş yapıldıysa token localStorage'da; giriş sayfasına gelince doğrudan dashboard'a yönlendir */
    var savedToken = localStorage.getItem('driver_token');
    if (savedToken) {
        window.location.href = DRIVER_PAGE_BASE + 'dashboard.html';
        /* Sayfa yönleniyor, aşağıdaki event listener'lar bir kez çalışacak; dashboard açılınca sorun olmaz */
    }

    var usernameInput = document.getElementById('username');
    var passwordInput = document.getElementById('password');

    /* Beni Hatırla: checkbox + kayıtlı kullanıcı adı/şifre doldur */
    var rememberCheckbox = document.getElementById('remember');
    if (rememberCheckbox && localStorage.getItem('driver_remember_me') === '1') {
        rememberCheckbox.checked = true;
        var savedUser = localStorage.getItem('driver_saved_username');
        if (usernameInput && savedUser) usernameInput.value = savedUser;
        if (passwordInput) passwordInput.value = '';
        try { localStorage.removeItem('driver_saved_password'); } catch (e) {}
    }

    /* Mobilde sayfa açılışında klavye açılmasın - readonly ile engelliyoruz.
       Kullanıcı inputa tıkladığında readonly kaldır, yazabilsin. */
    function removeReadonlyOnFocus(el) {
      if (el && el.hasAttribute && el.hasAttribute('readonly')) {
        el.removeAttribute('readonly');
      }
    }
    if (usernameInput) usernameInput.addEventListener('focus', function() { removeReadonlyOnFocus(this); }, { once: true });
    if (usernameInput) usernameInput.addEventListener('touchstart', function() { removeReadonlyOnFocus(this); }, { once: true, passive: true });
    if (passwordInput) passwordInput.addEventListener('focus', function() { removeReadonlyOnFocus(this); }, { once: true });
    if (passwordInput) passwordInput.addEventListener('touchstart', function() { removeReadonlyOnFocus(this); }, { once: true, passive: true });

    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value;
        const remember = document.getElementById('remember').checked;
        
        const errorDiv = document.getElementById('error-message');
        const loginBtn = document.getElementById('login-btn');
        const btnText = loginBtn.querySelector('.btn-text');
        const btnLoader = loginBtn.querySelector('.btn-loader');
        
        errorDiv.classList.remove('show');
        loginBtn.disabled = true;
        btnText.style.display = 'none';
        btnLoader.style.display = 'inline';
        
        const loginUrl = window.location.origin + API_BASE + 'driver_login.php';
        
        try {
            const response = await fetch(loginUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            
            const data = await response.json();
            
            if (data.success) {
                if (remember) {
                    try {
                        localStorage.setItem('driver_remember_me', '1');
                        localStorage.setItem('driver_saved_username', username);
                        localStorage.removeItem('driver_saved_password');
                    } catch (e) {}
                } else {
                    try {
                        localStorage.removeItem('driver_remember_me');
                        localStorage.removeItem('driver_saved_username');
                        localStorage.removeItem('driver_saved_password');
                    } catch (e) {}
                }
                var tokenToStore = data.token && typeof data.token === 'string' ? data.token : null;
                if (tokenToStore) {
                    try {
                        if (remember) {
                            localStorage.setItem('driver_token', tokenToStore);
                        } else {
                            sessionStorage.setItem('driver_token', tokenToStore);
                        }
                    } catch (storageErr) {
                        console.warn('localStorage/sessionStorage yazılamadı, oturum bu sekme için geçerli olacak.', storageErr);
                        try {
                            sessionStorage.setItem('driver_token', tokenToStore);
                        } catch (e2) {
                            console.error('Token kaydedilemedi.', e2);
                        }
                    }
                }
                window.location.href = DRIVER_PAGE_BASE + 'dashboard.html';
            } else {
                errorDiv.textContent = data.message || 'Giriş başarısız!';
                errorDiv.classList.add('show');
                loginBtn.disabled = false;
                btnText.style.display = 'inline';
                btnLoader.style.display = 'none';
            }
        } catch (error) {
            console.error('Hata:', error);
            errorDiv.textContent = 'Bağlantı hatası! Lütfen tekrar deneyin.';
            errorDiv.classList.add('show');
            loginBtn.disabled = false;
            btnText.style.display = 'inline';
            btnLoader.style.display = 'none';
        }
    });
}

/* =========================================
   SPLASH (3 sn) + DASHBOARD / LOGIN
   ========================================= */

/** Splash 2 sn göster, sonra gizle ve normal akışa devam et */
function initDriverSplash(onComplete) {
  const splash = document.getElementById('driver-splash');
  if (!splash) {
    if (typeof onComplete === 'function') onComplete();
    return;
  }
  setTimeout(function() {
    splash.classList.add('hidden');
    splash.setAttribute('aria-hidden', 'true');
    setTimeout(function() {
      splash.style.display = 'none';
      if (typeof onComplete === 'function') onComplete();
    }, 400);
  }, 2000);
}

if (document.getElementById('driver-two-panel')) {
  const run = () => { initDriverSplash(function() { loadDashboard(); }); };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
  window.addEventListener('pageshow', function(ev) {
    if (ev.persisted) run();
  });
} else if (document.getElementById('driver-splash')) {
  document.addEventListener('DOMContentLoaded', function() { initDriverSplash(); });
}

async function loadDashboard() {
    const token = localStorage.getItem('driver_token') || 
                  sessionStorage.getItem('driver_token');
    
    if (!token) {
        window.location.href = DRIVER_PAGE_BASE + 'index.html';
        return;
    }
    
    currentToken = token;
    
    try {
        const response = await fetch(API_BASE + 'driver_data.php', {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        
        const data = await response.json();
        
        if (!data.success) {
            document.getElementById('loading-spinner').style.display = 'none';
            alert('Oturum süresi doldu! Lütfen tekrar giriş yapın.');
            logout();
            return;
        }
        
        currentUser = data.user;
        allHistoryRecords = data.records || [];
        allHistoryVehicles = data.vehicles || [];
        currentPeriod = data.current_period || '';
        
        document.getElementById('loading-spinner').style.display = 'none';
        
        if (data.vehicles.length === 0) {
            document.getElementById('empty-state').style.display = 'block';
            return;
        }
        
        document.getElementById('driver-two-panel').style.display = 'flex';
        const vehicles = data.vehicles;
        const records = data.records;
        selectedVehicleId = selectedVehicleId || (vehicles[0] && vehicles[0].id);
        if (!getSelectedVehicle() && vehicles && vehicles.length) {
            selectedVehicleId = vehicles[0].id;
        }
        
        renderLeftPanel(vehicles, records);
        renderRightPanel(vehicles, records);
        renderSlidingWarning(vehicles, records);
        
        var actionArea = document.getElementById('driver-action-area');
        if (actionArea) actionArea.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        
        if (vehicles.length > 1) {
            const trigger = document.getElementById('driver-plate-trigger');
            if (trigger) trigger.style.display = '';
            setupPlateDropdown(vehicles);
        }
        
        setupEkstraNotAutoResize();
        setupKmInputs();
        
    } catch (error) {
        console.error('Veri yükleme hatası:', error);
        const spinner = document.getElementById('loading-spinner');
        const emptyEl = document.getElementById('empty-state');
        if (spinner) spinner.style.display = 'none';
        if (emptyEl) {
            emptyEl.style.display = 'block';
            const h3 = emptyEl.querySelector('h3');
            const p = emptyEl.querySelector('p');
            if (h3) h3.textContent = 'Yükleme Hatası';
            if (p) p.textContent = 'Veriler yüklenemedi! Lütfen sayfayı yenileyin.';
            const icon = emptyEl.querySelector('.driver-empty-icon');
            if (icon) icon.textContent = '⚠️';
        }
    }
}

function getSelectedVehicle() {
    return allHistoryVehicles.find(v => String(v.id) === String(selectedVehicleId));
}

function getExistingRecord(vehicleId) {
    const matches = (allHistoryRecords || []).filter(r =>
        String(r.arac_id) === String(vehicleId) && r.donem === currentPeriod
    );
    if (matches.length === 0) return null;
    matches.sort((a, b) => (b.guncelleme_tarihi || b.kayit_tarihi || '').localeCompare(a.guncelleme_tarihi || a.kayit_tarihi || ''));
    return matches[0];
}

function checkDateWarningsDriver(dateStr) {
    if (!dateStr) return { class: '', days: null };
    const date = new Date(dateStr + 'T00:00:00');
    if (isNaN(date.getTime())) return { class: '', days: null };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((date - today) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return { class: 'date-warning-red', days: diffDays };
    if (diffDays <= 3) return { class: 'date-warning-red', days: diffDays };
    if (diffDays <= 21) return { class: 'date-warning-orange', days: diffDays };
    return { class: '', days: diffDays };
}

function renderLeftPanel(vehicles, records) {
    const vehicle = getSelectedVehicle();
    if (!vehicle) return;
    
    const userNameEl = document.getElementById('driver-user-name');
    if (userNameEl && currentUser) {
        userNameEl.textContent = currentUser.isim || currentUser.ad_soyad || currentUser.name || '-';
    }
    
    const plakaEl = document.getElementById('driver-current-plaka');
    if (plakaEl) plakaEl.textContent = vehicle.plaka;
    const subtitleEl = document.getElementById('driver-plate-subtitle');
    if (subtitleEl) subtitleEl.textContent = vehicle.brandModel || [vehicle.marka, vehicle.model].filter(Boolean).join(' ') || '';
    
    const existingRecord = getExistingRecord(vehicle.id);
    const kmVal = vehicle.guncelKm || (existingRecord && existingRecord.guncel_km) || '-';
    const kmFormatted = (kmVal !== '-' && kmVal != null) ? String(kmVal).replace(/\B(?=(\d{3})+(?!\d))/g, '.') : '-';
    const needsKmWarning = (() => {
        const dayOfMonth = new Date().getDate();
        const isFirstOfMonth = dayOfMonth === 1;
        const hasKmThisMonth = existingRecord && existingRecord.guncel_km != null && String(existingRecord.guncel_km).trim() !== '';
        return isFirstOfMonth || !hasKmThisMonth;
    })();
    const kmClass = needsKmWarning ? 'date-warning-red' : '';
    
    const sigortaW = checkDateWarningsDriver(vehicle.sigortaDate);
    const kaskoW = checkDateWarningsDriver(vehicle.kaskoDate);
    const muayeneW = checkDateWarningsDriver(vehicle.muayeneDate);
    
    const anahtarLabel = (vehicle.anahtar === 'var') ? (vehicle.anahtarNerede || 'Var') : 'Yoktur.';
    const lastikLabel = (vehicle.lastikDurumu === 'var') ? (vehicle.lastikAdres || 'Var') : 'Yoktur.';
    const uttsLabel = vehicle.uttsTanimlandi ? 'Evet' : 'Hayır';
    const sigortaSaved = !!(vehicle.sigortaDate && vehicle.sigortaDate.trim());
    const kaskoSaved = !!(vehicle.kaskoDate && vehicle.kaskoDate.trim());
    const muayeneSaved = !!(vehicle.muayeneDate && vehicle.muayeneDate.trim());
    const uttsSaved = vehicle.uttsTanimlandi === true || vehicle.uttsTanimlandi === false;
    /* Yeşil (saved) sadece bu oturumda bildirim yapıldıysa; pencere kapanınca lastCompletedActionInSession temizlenir, orijinal görünüme döner */
    const vid = String(vehicle.id);
    const sessionMatch = (action) => lastCompletedActionInSession && lastCompletedActionInSession.action === action && String(lastCompletedActionInSession.vehicleId) === vid;
    const kmSavedClass = sessionMatch('km') ? 'saved' : '';
    const anahtarSavedClass = sessionMatch('anahtar') ? 'saved' : '';
    const lastikSavedClass = sessionMatch('lastik') ? 'saved' : '';

    const infoEl = document.getElementById('driver-vehicle-info');
    if (infoEl) {
        infoEl.innerHTML = `
            <div class="driver-info-item"><span class="label">Şube</span><span class="value">${escapeHtmlDriver(vehicle.branchName || '-')}</span></div>
            <div class="driver-info-item"><span class="label">Üretim Yılı</span><span class="value">${escapeHtmlDriver(vehicle.year || '-')}</span></div>
            <div class="driver-info-item ${kmSavedClass}"><span class="label">KM</span><span class="value ${kmClass}">${escapeHtmlDriver(kmFormatted)}</span></div>
            <div class="driver-info-item"><span class="label">Sigorta Bitiş</span><span class="value ${sigortaW.class}">${formatDriverDate(vehicle.sigortaDate) || '-'}</span></div>
            <div class="driver-info-item"><span class="label">Kasko Bitiş</span><span class="value ${kaskoW.class}">${formatDriverDate(vehicle.kaskoDate) || '-'}</span></div>
            <div class="driver-info-item"><span class="label">Muayene Bitiş</span><span class="value ${muayeneW.class}">${formatDriverDate(vehicle.muayeneDate) || '-'}</span></div>
            <div class="driver-info-item ${anahtarSavedClass}"><span class="label">Yedek Anahtar</span><span class="value">${escapeHtmlDriver(anahtarLabel)}</span></div>
            <div class="driver-info-item ${lastikSavedClass}"><span class="label">Lastik Durumu</span><span class="value">${escapeHtmlDriver(lastikLabel)}</span></div>
            <div class="driver-info-item"><span class="label">UTTS</span><span class="value">${escapeHtmlDriver(uttsLabel)}</span></div>
        `;
    }
}

function escapeHtmlDriver(t) {
    if (t == null || t === '') return '';
    const d = document.createElement('div');
    d.textContent = t;
    return d.innerHTML;
}

var _plateCloseBound = false;
function setupPlateDropdown(vehicles) {
    const dropdown = document.getElementById('driver-plate-dropdown');
    const currentPlakaEl = document.getElementById('driver-current-plaka');
    const trigger = document.getElementById('driver-plate-trigger');
    if (!dropdown || !currentPlakaEl || !trigger) return;
    
    if (!_plateCloseBound) {
        _plateCloseBound = true;
        document.addEventListener('click', function(ev) {
            if (!ev.target.closest('.driver-plate-dropdown-row')) {
                const d = document.getElementById('driver-plate-dropdown');
                if (d) d.style.display = 'none';
            }
        });
    }
    
    dropdown.innerHTML = vehicles.map(v => {
        const brandModel = v.brandModel || [v.marka, v.model].filter(Boolean).join(' ');
        return `<div class="driver-plate-dropdown-item" role="option" data-vehicle-id="${v.id}" tabindex="0">${escapeHtmlDriver(v.plaka)}${brandModel ? ' – ' + escapeHtmlDriver(brandModel) : ''}</div>`;
    }).join('');
    
    dropdown.querySelectorAll('.driver-plate-dropdown-item').forEach(item => {
        item.addEventListener('click', function(ev) {
            ev.preventDefault();
            ev.stopPropagation();
            const vid = this.getAttribute('data-vehicle-id');
            if (vid == null || vid === '') return;
            selectedVehicleId = vid;
            const sel = getSelectedVehicle();
            if (sel) currentPlakaEl.textContent = sel.plaka;
            dropdown.style.display = 'none';
            loadDashboard();
        });
    });
    
    trigger.onclick = function(ev) {
        ev.stopPropagation();
        const isOpen = dropdown.style.display === 'block';
        dropdown.style.display = isOpen ? 'none' : 'block';
    };
}

function renderRightPanel(vehicles, records) {
    const vehicle = getSelectedVehicle();
    if (!vehicle) return;
    
    const areaEl = document.getElementById('driver-action-area');
    if (!areaEl) return;
    
    const vid = String(vehicle.id);
    const existingRecord = getExistingRecord(vehicle.id);
    const bakimVar = existingRecord && (existingRecord.bakim_durumu || (existingRecord.bakim_aciklama || '').trim());
    const kazaVar = existingRecord && (existingRecord.kaza_durumu || (existingRecord.kaza_aciklama || '').trim());
    const needsKmWarning = (() => {
        const dayOfMonth = new Date().getDate();
        const isFirstOfMonth = dayOfMonth === 1;
        const hasKmThisMonth = existingRecord && existingRecord.guncel_km != null && String(existingRecord.guncel_km).trim() !== '';
        return isFirstOfMonth || !hasKmThisMonth;
    })();
    const hasKmSaved = !needsKmWarning;
    const sigortaW = checkDateWarningsDriver(vehicle.sigortaDate);
    const kaskoW = checkDateWarningsDriver(vehicle.kaskoDate);
    const muayeneW = checkDateWarningsDriver(vehicle.muayeneDate);
    const sigortaSaved = !!(vehicle.sigortaDate && vehicle.sigortaDate.trim());
    const kaskoSaved = !!(vehicle.kaskoDate && vehicle.kaskoDate.trim());
    const muayeneSaved = !!(vehicle.muayeneDate && vehicle.muayeneDate.trim());
    const anahtarSaved = !!(vehicle.anahtar && String(vehicle.anahtar).trim());
    const lastikSaved = !!(vehicle.lastikDurumu && String(vehicle.lastikDurumu).trim());
    const sessionMatch = (action) => lastCompletedActionInSession && lastCompletedActionInSession.action === action && String(lastCompletedActionInSession.vehicleId) === vid;
    const kmBtnClass = sessionMatch('km') ? ' saved' : (needsKmWarning ? ' warning' : (hasKmSaved ? ' data-entered' : ''));
    const kazaBtnClass = sessionMatch('kaza') ? ' saved' : (kazaVar ? ' data-entered' : '');
    const bakimBtnClass = sessionMatch('bakim') ? ' saved' : (bakimVar ? ' data-entered' : '');
    const sigortaBtnClass = sessionMatch('sigorta') ? ' saved' : (sigortaW.class ? ' warning' : (sigortaSaved ? ' data-entered' : ''));
    const kaskoBtnClass = sessionMatch('kasko') ? ' saved' : (kaskoW.class ? ' warning' : (kaskoSaved ? ' data-entered' : ''));
    const muayeneBtnClass = sessionMatch('muayene') ? ' saved' : (muayeneW.class ? ' warning' : (muayeneSaved ? ' data-entered' : ''));
    const anahtarBtnClass = sessionMatch('anahtar') ? ' saved' : (anahtarSaved ? ' data-entered' : '');
    const lastikBtnClass = sessionMatch('lastik') ? ' saved' : (lastikSaved ? ' data-entered' : '');

    areaEl.innerHTML = buildDriverActionArea(vehicle, existingRecord, bakimVar, kazaVar, {
        kmBtnClass, kazaBtnClass, bakimBtnClass, sigortaBtnClass, kaskoBtnClass, muayeneBtnClass, anahtarBtnClass, lastikBtnClass, vid
    });
    
    const kaportaContainer = document.getElementById('kaza-kaporta-' + vid);
    if (kaportaContainer && vehicle) {
        initKaportaForDriver(kaportaContainer, vehicle);
    }
}

function buildDriverActionArea(vehicle, existingRecord, bakimVar, kazaVar, opts) {
    const vid = opts.vid || vehicle.id;
    const today = new Date().toISOString().split('T')[0];
    const esc = (s) => (s == null ? '' : String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'));
    /* Son güncellenen km: taşıt guncelKm (kayıt sonrası) veya mevcut dönem kaydı - binlik ayırıcı ile */
    const lastKm = vehicle.guncelKm != null ? vehicle.guncelKm : (existingRecord && existingRecord.guncel_km != null ? existingRecord.guncel_km : '');
    const kmVal = (lastKm !== '' && lastKm != null) ? esc(formatKm(lastKm)) : '';
    const bakimTarih = existingRecord && existingRecord.bakim_tarih ? existingRecord.bakim_tarih : today;
    const kazaTarih = existingRecord && existingRecord.kaza_tarih ? existingRecord.kaza_tarih : today;
    const bakimAciklama = existingRecord ? esc(existingRecord.bakim_aciklama || '') : '';
    const kazaAciklama = existingRecord ? esc(existingRecord.kaza_aciklama || '') : '';
    const ekstraNot = existingRecord ? esc(existingRecord.ekstra_not || '') : '';
    const kmBtnClass = opts.kmBtnClass || '';
    const kazaBtnClass = opts.kazaBtnClass || '';
    const bakimBtnClass = opts.bakimBtnClass || '';
    const sigortaBtnClass = opts.sigortaBtnClass || '';
    const kaskoBtnClass = opts.kaskoBtnClass || '';
    const muayeneBtnClass = opts.muayeneBtnClass || '';
    const anahtarBtnClass = opts.anahtarBtnClass || '';
    const lastikBtnClass = opts.lastikBtnClass || '';
    return `
        <div class="driver-action-area-inner" data-vehicle-id="${vid}">
            <div class="driver-action-group">
                <button type="button" class="driver-action-btn${kmBtnClass}" data-action="km" onclick="toggleDriverActionBlock('km','${vid}')">Km Bildir</button>
                <div id="km-block-${vid}" class="driver-input-form driver-km-form-wrap driver-action-block">
                    <div class="driver-km-form-content">
                        <div class="form-group driver-km-form">
                            <label for="km-${vid}">Güncel KM</label>
                            <div class="driver-km-input-wrap">
                                <span class="driver-km-fake-placeholder" id="km-placeholder-${vid}">Örn: 45.230</span>
                                <input type="text" id="km-${vid}" class="driver-km-input" inputmode="numeric" pattern="[0-9]*" maxlength="8" data-vehicle-id="${vid}" value="${kmVal}" required autocomplete="off" aria-label="Güncel kilometre">
                            </div>
                        </div>
                        <div class="driver-km-form-actions">
                            <button type="button" class="btn-km-bildir" onclick="submitKmOnly('${vid}')">Bildir</button>
                            <button type="button" class="btn-km-vazgec" onclick="cancelKmForm('${vid}')">Vazgeç</button>
                        </div>
                    </div>
                    <div class="driver-km-success-msg" id="km-success-${vid}">Bildirildi</div>
                    <div class="driver-km-error" id="km-error-${vid}"></div>
                </div>
            </div>
            <div class="driver-action-group">
                <button type="button" class="driver-action-btn${kazaBtnClass}" data-action="kaza" onclick="toggleDriverActionBlock('kaza','${vid}')">Kaza Bildir</button>
                <div id="kaza-block-${vid}" class="driver-report-block driver-report-block-kaza driver-action-block">
                    <div class="form-group"><label for="kaza-tarih-${vid}">Kaza Tarihi</label><input type="date" id="kaza-tarih-${vid}" class="driver-kaza-input" value="${kazaTarih}"></div>
                    <div class="form-group"><label for="kaza-detay-${vid}">Açıklama</label><textarea id="kaza-detay-${vid}" class="driver-report-textarea-auto driver-kaza-textarea" rows="1" placeholder="Kaza açıklamasını yazın..." maxlength="500">${kazaAciklama}</textarea></div>
                    <div class="form-group"><label for="kaza-tutar-${vid}">Hasar Tutarı (TL)</label><input type="text" id="kaza-tutar-${vid}" class="driver-kaza-input" placeholder="5.000" inputmode="numeric"></div>
                    <div class="form-group"><label class="driver-kaporta-label">Hasar gören parçaları işaretleyin (isteğe bağlı)</label><div id="kaza-kaporta-${vid}" class="driver-kaporta-container" data-vehicle-id="${vid}" data-boyali-parcalar='${JSON.stringify(vehicle.boyaliParcalar || {})}'></div></div>
                    <div class="driver-form-actions">
                        <button type="button" class="btn-driver-bildir" onclick="submitDriverAction('kaza','${vid}')">Bildir</button>
                        <button type="button" class="btn-driver-vazgec" onclick="cancelDriverActionForm('kaza','${vid}')">Vazgeç</button>
                    </div>
                    <div class="driver-success-msg" id="kaza-success-${vid}">Bildirildi</div>
                </div>
            </div>
            <div class="driver-action-group">
                <button type="button" class="driver-action-btn${bakimBtnClass}" data-action="bakim" onclick="toggleDriverActionBlock('bakim','${vid}')">Bakım Bildir</button>
                <div id="bakim-block-${vid}" class="driver-report-block driver-report-block-bakim driver-action-block">
                    <div class="form-group"><label for="bakim-tarih-${vid}">Bakım Tarihi</label><input type="date" id="bakim-tarih-${vid}" class="driver-bakim-input" value="${bakimTarih}"></div>
                    <div class="form-group"><label for="bakim-detay-${vid}">Açıklama</label><textarea id="bakim-detay-${vid}" class="driver-report-textarea-auto driver-bakim-textarea" rows="1" placeholder="Bakım detayını yazın..." maxlength="500">${bakimAciklama}</textarea></div>
                    <div class="form-group"><label for="bakim-servis-${vid}">İşlemi Yapan Servis</label><input type="text" id="bakim-servis-${vid}" class="driver-bakim-input" placeholder="Servis adı"></div>
                    <div class="form-group"><label for="bakim-kisi-${vid}">Taşıtı Bakıma Götüren Kişi</label><input type="text" id="bakim-kisi-${vid}" class="driver-bakim-input" placeholder="Kişi adı"></div>
                    <div class="form-group"><label for="bakim-km-${vid}">Bakım Km</label><input type="text" id="bakim-km-${vid}" class="driver-bakim-input" placeholder="50.000" inputmode="numeric"></div>
                    <div class="form-group"><label for="bakim-tutar-${vid}">Tutar (TL)</label><input type="text" id="bakim-tutar-${vid}" class="driver-bakim-input" placeholder="2.500" inputmode="numeric"></div>
                    <div class="driver-form-actions">
                        <button type="button" class="btn-driver-bildir" onclick="submitDriverAction('bakim','${vid}')">Bildir</button>
                        <button type="button" class="btn-driver-vazgec" onclick="cancelDriverActionForm('bakim','${vid}')">Vazgeç</button>
                    </div>
                    <div class="driver-success-msg" id="bakim-success-${vid}">Bildirildi</div>
                </div>
            </div>
            <div class="driver-action-group">
                <button type="button" class="driver-action-btn${sigortaBtnClass}" data-action="sigorta" onclick="toggleDriverActionBlock('sigorta','${vid}')">Trafik Sigortası Yenileme</button>
                <div id="sigorta-block-${vid}" class="driver-report-block driver-report-block-sigorta driver-action-block">
                    <div class="form-group"><label for="driver-sigorta-tarih-${vid}">Yenileme / Başlangıç Tarihi</label><input type="date" id="driver-sigorta-tarih-${vid}" class="form-input" style="width:100%"></div>
                    <div class="form-group"><label for="driver-sigorta-firma-${vid}">Firma (isteğe bağlı)</label><input type="text" id="driver-sigorta-firma-${vid}" class="form-input" placeholder="Sigorta firması" style="width:100%"></div>
                    <div class="form-group"><label for="driver-sigorta-acente-${vid}">Acente (isteğe bağlı)</label><input type="text" id="driver-sigorta-acente-${vid}" class="form-input" placeholder="Acente adı" style="width:100%"></div>
                    <div class="form-group"><label for="driver-sigorta-iletisim-${vid}">İletişim (isteğe bağlı)</label><input type="text" id="driver-sigorta-iletisim-${vid}" class="form-input" placeholder="Telefon / e-posta" inputmode="tel" style="width:100%"></div>
                    <div class="driver-form-actions">
                        <button type="button" class="btn-driver-bildir" onclick="saveDriverEventFromBlock('sigorta','${vid}')">Bildir</button>
                        <button type="button" class="btn-driver-vazgec" onclick="cancelDriverActionForm('sigorta','${vid}')">Vazgeç</button>
                    </div>
                </div>
            </div>
            <div class="driver-action-group">
                <button type="button" class="driver-action-btn${kaskoBtnClass}" data-action="kasko" onclick="toggleDriverActionBlock('kasko','${vid}')">Kasko Yenileme</button>
                <div id="kasko-block-${vid}" class="driver-report-block driver-report-block-kasko driver-action-block">
                    <div class="form-group"><label for="driver-kasko-tarih-${vid}">Yenileme / Başlangıç Tarihi</label><input type="date" id="driver-kasko-tarih-${vid}" class="form-input" style="width:100%"></div>
                    <div class="form-group"><label for="driver-kasko-firma-${vid}">Firma (isteğe bağlı)</label><input type="text" id="driver-kasko-firma-${vid}" class="form-input" placeholder="Kasko firması" style="width:100%"></div>
                    <div class="form-group"><label for="driver-kasko-acente-${vid}">Acente (isteğe bağlı)</label><input type="text" id="driver-kasko-acente-${vid}" class="form-input" placeholder="Acente adı" style="width:100%"></div>
                    <div class="form-group"><label for="driver-kasko-iletisim-${vid}">İletişim (isteğe bağlı)</label><input type="text" id="driver-kasko-iletisim-${vid}" class="form-input" placeholder="Telefon / e-posta" inputmode="tel" style="width:100%"></div>
                    <div class="driver-form-actions">
                        <button type="button" class="btn-driver-bildir" onclick="saveDriverEventFromBlock('kasko','${vid}')">Bildir</button>
                        <button type="button" class="btn-driver-vazgec" onclick="cancelDriverActionForm('kasko','${vid}')">Vazgeç</button>
                    </div>
                </div>
            </div>
            <div class="driver-action-group">
                <button type="button" class="driver-action-btn${muayeneBtnClass}" data-action="muayene" onclick="toggleDriverActionBlock('muayene','${vid}')">Muayene Yenileme</button>
                <div id="muayene-block-${vid}" class="driver-report-block driver-report-block-muayene driver-action-block">
                    <div class="form-group"><label for="driver-muayene-tarih-${vid}">Yaptırılan Tarih</label><input type="date" id="driver-muayene-tarih-${vid}" class="form-input" style="width:100%"></div>
                    <div class="driver-form-actions">
                        <button type="button" class="btn-driver-bildir" onclick="saveDriverEventFromBlock('muayene','${vid}')">Bildir</button>
                        <button type="button" class="btn-driver-vazgec" onclick="cancelDriverActionForm('muayene','${vid}')">Vazgeç</button>
                    </div>
                </div>
            </div>
            <div class="driver-action-group">
                <button type="button" class="driver-action-btn${anahtarBtnClass}" data-action="anahtar" onclick="toggleDriverActionBlock('anahtar','${vid}')">Anahtar Durumu Bildir</button>
                <div id="anahtar-block-${vid}" class="driver-report-block driver-report-block-anahtar driver-action-block">
                    <div class="form-group driver-radio-row">
                        <label class="driver-radio-label">Durum:</label>
                        <div class="driver-radio-group" data-group="anahtar" data-vid="${vid}">
                            <button type="button" class="driver-radio-btn active" data-value="var" data-group="anahtar">Var</button>
                            <button type="button" class="driver-radio-btn" data-value="yok" data-group="anahtar">Yok</button>
                        </div>
                    </div>
                    <div id="driver-anahtar-detay-wrap-${vid}" class="form-group" style="display:none">
                        <label for="driver-anahtar-detay-${vid}" style="color:#ccc;font-size:14px;">Açıklama:</label>
                        <input type="text" id="driver-anahtar-detay-${vid}" class="form-input" placeholder="Anahtar nerede?" style="width:100%">
                    </div>
                    <div class="driver-form-actions">
                        <button type="button" class="btn-driver-bildir" onclick="saveDriverEventFromBlock('anahtar','${vid}')">Bildir</button>
                        <button type="button" class="btn-driver-vazgec" onclick="cancelDriverActionForm('anahtar','${vid}')">Vazgeç</button>
                    </div>
                </div>
            </div>
            <div class="driver-action-group">
                <button type="button" class="driver-action-btn${lastikBtnClass}" data-action="lastik" onclick="toggleDriverActionBlock('lastik','${vid}')">Lastik Durumu Bildir</button>
                <div id="lastik-block-${vid}" class="driver-report-block driver-report-block-lastik driver-action-block">
                    <div class="form-group driver-radio-row">
                        <label class="driver-radio-label">Durum:</label>
                        <div class="driver-radio-group" data-group="lastik" data-vid="${vid}">
                            <button type="button" class="driver-radio-btn" data-value="var" data-group="lastik">Var</button>
                            <button type="button" class="driver-radio-btn active" data-value="yok" data-group="lastik">Yok</button>
                        </div>
                    </div>
                    <div id="driver-lastik-adres-wrap-${vid}" class="form-group" style="display:none">
                        <label for="driver-lastik-adres-${vid}" style="color:#ccc;font-size:14px;">Adres:</label>
                        <input type="text" id="driver-lastik-adres-${vid}" class="form-input" placeholder="Lastik adresi" style="width:100%">
                    </div>
                    <div class="driver-form-actions">
                        <button type="button" class="btn-driver-bildir" onclick="saveDriverEventFromBlock('lastik','${vid}')">Bildir</button>
                        <button type="button" class="btn-driver-vazgec" onclick="cancelDriverActionForm('lastik','${vid}')">Vazgeç</button>
                    </div>
                </div>
            </div>
            <div class="driver-action-group driver-action-footer">
                <div class="form-group driver-ekstra-not-form">
                    <label for="not-${vid}">Not</label>
                    <textarea id="not-${vid}" class="driver-ekstra-not" rows="1" placeholder="Varsa Belirtin.." maxlength="500">${ekstraNot}</textarea>
                </div>
                <button type="button" onclick="saveVehicleData(${vid})" class="btn-save" id="btn-save-${vid}">Bildir</button>
                <div id="status-${vid}" class="status-message"></div>
            </div>
        </div>
    `;
}

window.toggleDriverActionBlock = function(type, vehicleId) {
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
    inner.querySelectorAll('.driver-action-block').forEach(function(b) { if (b) b.classList.remove('show'); });
    if (!isShown) {
        target.classList.add('show');
        var expandTypes = ['km', 'kaza', 'bakim', 'sigorta', 'kasko', 'muayene', 'anahtar', 'lastik'];
        if (expandTypes.indexOf(type) !== -1) inner.classList.add('driver-km-open');
        if (type === 'kaza') {
            const dateEl = document.getElementById('kaza-tarih-' + vid);
            if (dateEl && !dateEl.value) dateEl.value = new Date().toISOString().split('T')[0];
            const container = document.getElementById('kaza-kaporta-' + vid);
            if (container && !container.querySelector('svg')) {
                let boyaliParcalar = {};
                try { const raw = container.getAttribute('data-boyali-parcalar'); if (raw) boyaliParcalar = JSON.parse(raw); } catch (e) {}
                initDriverKaporta(vid, boyaliParcalar);
            }
        }
        if (type === 'bakim') {
            const dateEl = document.getElementById('bakim-tarih-' + vid);
            if (dateEl && !dateEl.value) dateEl.value = new Date().toISOString().split('T')[0];
        }
        if (type === 'sigorta' || type === 'kasko' || type === 'muayene') {
            var dateId = type === 'muayene' ? 'driver-muayene-tarih' : (type === 'sigorta' ? 'driver-sigorta-tarih' : 'driver-kasko-tarih');
            var dateEl = document.getElementById(dateId + '-' + vid);
            if (dateEl && !dateEl.value) dateEl.value = new Date().toISOString().split('T')[0];
        }
        if (type === 'anahtar' || type === 'lastik') {
            setupDriverEventRadioHandlersForBlock(type, vid);
        }
        if (type === 'km') {
            setTimeout(function() {
                const inp = document.getElementById('km-' + vid);
                if (inp) { inp.focus(); inp.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
            }, 50);
        } else {
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
};

window.focusKmInput = function(vehicleId) {
    toggleDriverActionBlock('km', vehicleId);
};

window.cancelKmForm = function(vid) {
    cancelDriverActionForm('km', vid);
};

window.cancelDriverActionForm = function(type, vid) {
    const inner = document.querySelector('.driver-action-area-inner[data-vehicle-id="' + vid + '"]');
    const blockIds = { km: 'km-block-', kaza: 'kaza-block-', bakim: 'bakim-block-', sigorta: 'sigorta-block-', kasko: 'kasko-block-', muayene: 'muayene-block-', anahtar: 'anahtar-block-', lastik: 'lastik-block-' };
    const blockId = (blockIds[type] || '') + vid;
    const block = document.getElementById(blockId);
    if (block) block.classList.remove('show');
    if (inner) inner.classList.remove('driver-km-open');
};

window.submitDriverAction = async function(type, vid) {
    if (type === 'km') {
        submitKmOnly(vid);
        return;
    }
    var guncelKmEl = document.getElementById('km-' + vid);
    var guncelKm = guncelKmEl ? parseInt(String(guncelKmEl.value).replace(/\D/g, ''), 10) : 0;
    if (!guncelKm || guncelKm <= 0) {
        var rec = getExistingRecord(vid);
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
        btnBildir = document.querySelector('#kaza-block-' + vid + ' .btn-driver-bildir');
        btnVazgec = document.querySelector('#kaza-block-' + vid + ' .btn-driver-vazgec');
        formActions = document.querySelector('#kaza-block-' + vid + ' .driver-form-actions');
        successMsg = document.getElementById('kaza-success-' + vid);
    } else {
        var bakimAciklama = (document.getElementById('bakim-detay-' + vid) || {}).value.trim();
        if (!bakimAciklama) {
            alert('Bakım bildirimi için açıklama girin.');
            return;
        }
        btnBildir = document.querySelector('#bakim-block-' + vid + ' .btn-driver-bildir');
        btnVazgec = document.querySelector('#bakim-block-' + vid + ' .btn-driver-vazgec');
        formActions = document.querySelector('#bakim-block-' + vid + ' .driver-form-actions');
        successMsg = document.getElementById('bakim-success-' + vid);
    }
    if (btnBildir) btnBildir.disabled = true;
    if (btnVazgec) btnVazgec.disabled = true;
    var payload = {
        arac_id: parseInt(vid, 10),
        guncel_km: guncelKm,
        bakim_durumu: type === 'bakim' ? 1 : 0,
        bakim_aciklama: type === 'bakim' ? (document.getElementById('bakim-detay-' + vid) || {}).value.trim() : '',
        bakim_tarih: type === 'bakim' ? (document.getElementById('bakim-tarih-' + vid) || {}).value : '',
        bakim_servis: type === 'bakim' ? ((document.getElementById('bakim-servis-' + vid) || {}).value || '').trim() : '',
        bakim_kisi: type === 'bakim' ? ((document.getElementById('bakim-kisi-' + vid) || {}).value || '').trim() : '',
        bakim_km: type === 'bakim' ? ((document.getElementById('bakim-km-' + vid) || {}).value || '').trim() : '',
        bakim_tutar: type === 'bakim' ? ((document.getElementById('bakim-tutar-' + vid) || {}).value || '').trim() : '',
        kaza_durumu: type === 'kaza' ? 1 : 0,
        kaza_aciklama: type === 'kaza' ? (document.getElementById('kaza-detay-' + vid).value.trim()) : '',
        kaza_tarih: type === 'kaza' ? (document.getElementById('kaza-tarih-' + vid).value || '') : '',
        kaza_hasar_tutari: type === 'kaza' ? ((document.getElementById('kaza-tutar-' + vid) || {}).value || '').trim() : '',
        boya_parcalar: '{}',
        ekstra_not: (document.getElementById('not-' + vid) || {}).value || ''
    };
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
        var response = await fetch(API_BASE + 'driver_save.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + currentToken },
            body: JSON.stringify(payload)
        });
        var data = await response.json();
        if (data.success) {
            lastCompletedActionInSession = { action: type, vehicleId: vid };
            if (formActions) formActions.style.display = 'none';
            if (successMsg) successMsg.classList.add('show');
            allHistoryRecords = allHistoryRecords || [];
            allHistoryRecords.push({
                arac_id: vid,
                donem: currentPeriod,
                guncel_km: guncelKm,
                kayit_tarihi: new Date().toISOString()
            });
            renderSlidingWarning(allHistoryVehicles || [], allHistoryRecords);
            setTimeout(function() {
                var block = document.getElementById((type === 'kaza' ? 'kaza-block-' : 'bakim-block-') + vid);
                var inner = document.querySelector('.driver-action-area-inner[data-vehicle-id="' + vid + '"]');
                if (block) block.classList.remove('show');
                if (inner) inner.classList.remove('driver-km-open');
                if (formActions) formActions.style.display = '';
                if (successMsg) successMsg.classList.remove('show');
                var actionBtn = inner ? inner.querySelector('.driver-action-btn[data-action="' + type + '"]') : null;
                if (actionBtn) actionBtn.classList.add('saved');
                loadDashboard();
            }, 2000);
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

window.submitKmOnly = async function(vid) {
    const kmEl = document.getElementById('km-' + vid);
    const km = kmEl ? parseInt(String(kmEl.value).replace(/\D/g, ''), 10) : 0;
    if (!km || km <= 0) {
        alert('Lütfen geçerli bir KM değeri girin!');
        if (kmEl) kmEl.focus();
        return;
    }
    var vehicle = allHistoryVehicles && allHistoryVehicles.find(function(v) { return String(v.id) === String(vid); });
    var rec = getExistingRecord(vid);
    var oncekiKm = (vehicle && (vehicle.guncelKm != null ? vehicle.guncelKm : '')) || (rec && rec.guncel_km != null ? rec.guncel_km : '');
    var oncekiKmNum = parseInt(String(oncekiKm).replace(/\D/g, ''), 10) || 0;
    if (oncekiKmNum > 0 && km < oncekiKmNum) {
        alert('Bildirilmek İstenen Km, Önceki Kayıtlarla Uyuşmamaktadır. Şirket Yetkilisi İle Görüşün');
        if (kmEl) kmEl.focus();
        return;
    }
    const btnBildir = document.querySelector('#km-block-' + vid + ' .btn-km-bildir');
    const btnVazgec = document.querySelector('#km-block-' + vid + ' .btn-km-vazgec');
    const formContent = document.querySelector('#km-block-' + vid + ' .driver-km-form-content');
    const successMsg = document.getElementById('km-success-' + vid);
    const errorEl = document.getElementById('km-error-' + vid);
    if (errorEl) { errorEl.classList.remove('show'); errorEl.textContent = ''; }
    if (btnBildir) btnBildir.disabled = true;
    if (btnVazgec) btnVazgec.disabled = true;
    try {
        const response = await fetch(API_BASE + 'driver_save.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + currentToken },
            body: JSON.stringify({
                arac_id: parseInt(vid, 10),
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
                boya_parcalar: '{}',
                ekstra_not: ''
            })
        });
        const data = await response.json();
        if (data.success) {
            lastCompletedActionInSession = { action: 'km', vehicleId: vid };
            if (formContent) formContent.style.display = 'none';
            if (successMsg) successMsg.classList.add('show');
            allHistoryRecords = allHistoryRecords || [];
            allHistoryRecords.push({
                arac_id: vid,
                donem: currentPeriod,
                guncel_km: km,
                kayit_tarihi: new Date().toISOString()
            });
            renderSlidingWarning(allHistoryVehicles || [], allHistoryRecords);
            setTimeout(function() {
                const block = document.getElementById('km-block-' + vid);
                const inner = document.querySelector('.driver-action-area-inner[data-vehicle-id="' + vid + '"]');
                if (block) block.classList.remove('show');
                if (inner) inner.classList.remove('driver-km-open');
                if (formContent) formContent.style.display = '';
                if (successMsg) successMsg.classList.remove('show');
                const kmBtn = inner ? inner.querySelector('.driver-action-btn[data-action="km"]') : null;
                if (kmBtn) kmBtn.classList.add('saved');
                loadDashboard();
            }, 2000);
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

function buildSlidingWarnings(vehicles, records) {
    const warnings = [];
    const today = new Date();
    const dayOfMonth = today.getDate();
    const isFirstOfMonth = dayOfMonth === 1;
    let needsKmWarning = false;
    
    for (const v of vehicles) {
        const hasKmThisMonth = records.some(r => String(r.arac_id) === String(v.id) && r.donem === currentPeriod && r.guncel_km != null && String(r.guncel_km).trim() !== '');
        if (!hasKmThisMonth) needsKmWarning = true;
        const checkDate = (dateStr, label) => {
            if (!dateStr) return;
            const w = checkDateWarningsDriver(dateStr);
            if (w.class && w.days != null) {
                let msg;
                if (w.days < 0) msg = v.plaka + ' Plakalı Taşıtın ' + label + ' Tarihi ' + Math.abs(w.days) + ' Gün Geçmiştir';
                else msg = v.plaka + ' Plakalı Taşıtın ' + label + ' Tarihine ' + w.days + ' Gün Kalmıştır';
                warnings.push({ text: msg, plaka: v.plaka });
            }
        };
        checkDate(v.muayeneDate, 'Muayene');
        checkDate(v.sigortaDate, 'Sigorta');
        checkDate(v.kaskoDate, 'Kasko');
    }
    if (needsKmWarning) {
        warnings.unshift({ text: 'Güncel Km Bildirmeniz Gerekmektedir', plaka: '' });
    }
    return warnings;
}

let slidingWarningInterval = null;

function renderSlidingWarning(vehicles, records) {
    const el = document.getElementById('driver-sliding-warning');
    if (!el) return;
    
    if (slidingWarningInterval) {
        clearInterval(slidingWarningInterval);
        slidingWarningInterval = null;
    }
    
    const warnings = buildSlidingWarnings(vehicles, records);
    if (warnings.length === 0) {
        el.innerHTML = '';
        el.className = 'driver-sliding-warning';
        return;
    }
    
    const texts = warnings.map(w => w.text);
    let cycleCount = 0;
    let idx = 0;
    
    function showNext() {
        const text = texts[idx];
        el.innerHTML = '<span class="driver-warning-icon" aria-hidden="true">⚠</span> ' + escapeHtmlDriver(text);
        el.className = 'driver-sliding-warning' + (cycleCount >= 3 ? ' driver-warning-pulse' : '');
        idx = (idx + 1) % texts.length;
        if (idx === 0) {
            cycleCount++;
        }
    }
    
    showNext();
    slidingWarningInterval = setInterval(showNext, 5000);
}

function initKaportaForDriver(container, vehicle) {
    if (typeof initKaporta === 'function') {
        initKaporta(container, vehicle);
    }
}

window.toggleDriverPlateDropdown = function(ev) {
    ev.stopPropagation();
    const dropdown = document.getElementById('driver-plate-dropdown');
    if (!dropdown) return;
    const isOpen = dropdown.style.display === 'block';
    dropdown.style.display = isOpen ? 'none' : 'block';
};

function formatDriverDate(val) {
    if (!val) return '-';
    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
        const [y, m, d] = val.split('-');
        return d + '.' + m + '.' + y;
    }
    return val;
}

function setupKmInputs() {
    document.querySelectorAll('.vehicle-card input.driver-km-input, #driver-input-area input.driver-km-input, .driver-action-area input.driver-km-input').forEach(input => {
        var ph = input.parentElement && input.parentElement.querySelector('.driver-km-fake-placeholder');
        function togglePlaceholder() {
            if (ph) ph.style.visibility = (input.value || document.activeElement === input) ? 'hidden' : 'visible';
        }
        togglePlaceholder();
        input.addEventListener('input', function() {
            this.value = this.value.replace(/\D/g, '').slice(0, 8);
            togglePlaceholder();
        });
        input.addEventListener('paste', function(e) {
            e.preventDefault();
            var text = '';
            try {
                text = (e.clipboardData || window.clipboardData).getData('text');
            } catch (err) {}
            this.value = (this.value + (text || '')).replace(/\D/g, '').slice(0, 8);
            togglePlaceholder();
        });
        input.addEventListener('focus', togglePlaceholder);
        input.addEventListener('blur', togglePlaceholder);
    });
}

function setupEkstraNotAutoResize() {
    document.querySelectorAll('.vehicle-card textarea.driver-ekstra-not, #driver-input-area textarea.driver-ekstra-not, .driver-action-area textarea.driver-ekstra-not').forEach(ta => {
        function resize() {
            ta.style.height = 'auto';
            ta.style.height = ta.scrollHeight + 'px';
        }
        ta.addEventListener('input', resize);
        resize();
    });
    document.querySelectorAll('.vehicle-card textarea.driver-report-textarea-auto, #driver-input-area textarea.driver-report-textarea-auto, .driver-action-area textarea.driver-report-textarea-auto').forEach(ta => {
        function resize() {
            ta.style.height = 'auto';
            ta.style.height = ta.scrollHeight + 'px';
        }
        ta.addEventListener('input', resize);
        resize();
    });
}

/* =========================================
   OLAY EKLE - Event Menu & Modals
   ========================================= */

window.openDriverEventMenu = function(vehicleId) {
    currentDriverEventVehicleId = vehicleId;
    const modal = document.getElementById('driver-event-menu-modal');
    const list = document.getElementById('driver-event-menu-list');
    if (!modal || !list) return;
    const events = [
        { id: 'km', label: 'Km Güncelle' },
        { id: 'bakim', label: 'Bakım Bilgisi Ekle' },
        { id: 'kaza', label: 'Kaza Bilgisi Ekle' },
        { id: 'anahtar', label: 'Yedek Anahtar Bilgisi Güncelle' },
        { id: 'lastik', label: 'Yazlık/Kışlık Lastik Durumu Güncelle' },
        { id: 'utts', label: 'UTTS Bilgisi Güncelle' },
        { id: 'muayene', label: 'Muayene Bilgisi Güncelle' },
        { id: 'sigorta', label: 'Trafik Sigortası Yenileme' },
        { id: 'kasko', label: 'Kasko Yenileme' }
    ];
    var safeId = String(vehicleId).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    list.innerHTML = events.map(function(e) {
        const isKaza = e.id === 'kaza';
        const borderColor = isKaza ? '#e1061b' : 'rgba(255, 255, 255, 0.3)';
        const textColor = isKaza ? '#e1061b' : '#ccc';
        return '<button type="button" class="driver-event-menu-btn' + (isKaza ? ' driver-event-menu-btn-kaza' : '') + '" onclick="handleDriverEventChoice(\'' + e.id + '\', \'' + safeId + '\')">' + e.label + '</button>';
    }).join('');
    modal.classList.add('show');
    updateDriverModalBodyClass();
};

window.closeDriverEventMenu = function() {
    const modal = document.getElementById('driver-event-menu-modal');
    if (modal) modal.classList.remove('show');
    currentDriverEventVehicleId = null;
    updateDriverModalBodyClass();
};

window.handleDriverEventChoice = function(type, vehicleId) {
    closeDriverEventMenu();
    if (type === 'km') {
        toggleDriverActionBlock('km', vehicleId);
    } else if (type === 'bakim') {
        var block = document.getElementById('bakim-block-' + vehicleId);
        if (block && block.closest('.driver-action-area-inner')) {
            toggleDriverActionBlock('bakim', vehicleId);
        } else {
            toggleReportBlock('bakim', vehicleId);
            block = document.getElementById('bakim-block-' + vehicleId);
            if (block) block.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    } else if (type === 'kaza') {
        var kazaBlock = document.getElementById('kaza-block-' + vehicleId);
        if (kazaBlock && kazaBlock.closest('.driver-action-area-inner')) {
            toggleDriverActionBlock('kaza', vehicleId);
        } else {
            toggleReportBlock('kaza', vehicleId);
            if (kazaBlock) kazaBlock.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    } else if (['sigorta', 'kasko', 'muayene', 'anahtar', 'lastik'].indexOf(type) !== -1) {
        toggleDriverActionBlock(type, vehicleId);
    } else {
        openDriverEventModal(type, vehicleId);
    }
};

window.openDriverEventModal = function(type, vehicleId) {
    currentDriverEventVehicleId = vehicleId;
    const inner = document.querySelector('.driver-action-area-inner[data-vehicle-id="' + String(vehicleId) + '"]');
    if (inner) inner.classList.add('driver-modal-open');
    const modalId = 'driver-' + type + '-modal';
    const modal = document.getElementById(modalId);
    if (!modal) return;
    if (type === 'anahtar') {
        const vehicle = allHistoryVehicles.find(function(v) { return String(v.id) === String(vehicleId); });
        const wrap = document.getElementById('driver-anahtar-detay-wrap');
        const detay = document.getElementById('driver-anahtar-detay');
        const btns = document.querySelectorAll('#driver-anahtar-modal .driver-radio-btn');
        btns.forEach(function(b) {
            b.classList.toggle('active', b.dataset.value === (vehicle && vehicle.anahtar === 'var' ? 'var' : 'yok'));
        });
        if (wrap && detay) {
            const isVar = (vehicle && vehicle.anahtar === 'var');
            wrap.style.display = isVar ? 'block' : 'none';
            detay.value = (vehicle && vehicle.anahtarNerede) || '';
        }
        setupDriverEventRadioHandlers('anahtar', wrap, detay);
    } else if (type === 'lastik') {
        const vehicle = allHistoryVehicles.find(function(v) { return String(v.id) === String(vehicleId); });
        const wrap = document.getElementById('driver-lastik-adres-wrap');
        const adres = document.getElementById('driver-lastik-adres');
        const btns = document.querySelectorAll('#driver-lastik-modal .driver-radio-btn');
        btns.forEach(function(b) {
            b.classList.toggle('active', b.dataset.value === (vehicle && vehicle.lastikDurumu === 'var' ? 'var' : 'yok'));
        });
        if (wrap && adres) {
            const isVar = (vehicle && vehicle.lastikDurumu === 'var');
            wrap.style.display = isVar ? 'block' : 'none';
            adres.value = (vehicle && vehicle.lastikAdres) || '';
        }
        setupDriverEventRadioHandlers('lastik', wrap, adres);
    } else if (type === 'utts') {
        const vehicle = allHistoryVehicles.find(function(v) { return String(v.id) === String(vehicleId); });
        const btns = document.querySelectorAll('#driver-utts-modal .driver-radio-btn');
        const evet = vehicle && vehicle.uttsTanimlandi;
        btns.forEach(function(b) {
            b.classList.toggle('active', (b.dataset.value === 'evet') === evet);
        });
    } else if (type === 'muayene') {
        const input = document.getElementById('driver-muayene-tarih');
        if (input) input.value = new Date().toISOString().split('T')[0];
    } else if (type === 'sigorta') {
        const input = document.getElementById('driver-sigorta-tarih');
        if (input) input.value = new Date().toISOString().split('T')[0];
        ['firma', 'acente', 'iletisim'].forEach(f => {
            const el = document.getElementById('driver-sigorta-' + f);
            if (el) el.value = '';
        });
    } else if (type === 'kasko') {
        const input = document.getElementById('driver-kasko-tarih');
        if (input) input.value = new Date().toISOString().split('T')[0];
        ['firma', 'acente', 'iletisim'].forEach(f => {
            const el = document.getElementById('driver-kasko-' + f);
            if (el) el.value = '';
        });
    }
    modal.classList.add('show');
    updateDriverModalBodyClass();
};

function setupDriverEventRadioHandlersForBlock(group, vid) {
    const block = document.getElementById(group + '-block-' + vid);
    if (!block) return;
    const btns = block.querySelectorAll('.driver-radio-btn[data-group="' + group + '"]');
    var wrap = document.getElementById('driver-' + group + (group === 'anahtar' ? '-detay-wrap' : '-adres-wrap') + '-' + vid);
    var input = document.getElementById('driver-' + group + (group === 'anahtar' ? '-detay' : '-adres') + '-' + vid);
    var isVarDefault = group === 'anahtar';
    if (wrap) wrap.style.display = isVarDefault ? 'block' : 'none';
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

function setupDriverEventRadioHandlers(group, detailWrap, detailInput) {
    const container = document.getElementById('driver-' + group + '-modal');
    if (!container) return;
    const btns = container.querySelectorAll('.driver-radio-btn[data-group="' + group + '"]');
    btns.forEach(function(btn) {
        btn.onclick = function() {
            btns.forEach(function(b) { b.classList.remove('active'); });
            btn.classList.add('active');
            const isVar = btn.dataset.value === 'var';
            if (detailWrap) detailWrap.style.display = isVar ? 'block' : 'none';
            if (detailInput && !isVar) detailInput.value = '';
        };
    });
}

window.closeDriverEventModal = function(type) {
    const vid = currentDriverEventVehicleId;
    if (vid) {
        const inner = document.querySelector('.driver-action-area-inner[data-vehicle-id="' + String(vid) + '"]');
        if (inner) inner.classList.remove('driver-modal-open');
    }
    const modal = document.getElementById('driver-' + type + '-modal');
    if (modal) modal.classList.remove('show');
    currentDriverEventVehicleId = null;
    updateDriverModalBodyClass();
};

window.saveDriverEventFromBlock = async function(type, vehicleId) {
    vehicleId = String(vehicleId);
    if (!vehicleId || !currentToken) return;
    let data = {};
    if (type === 'anahtar') {
        const block = document.getElementById('anahtar-block-' + vehicleId);
        const active = block ? block.querySelector('.driver-radio-btn.active') : null;
        const durum = active ? active.dataset.value : 'yok';
        data = { durum: durum, detay: durum === 'var' ? (document.getElementById('driver-anahtar-detay-' + vehicleId)?.value.trim() || '') : '' };
    } else if (type === 'lastik') {
        const block = document.getElementById('lastik-block-' + vehicleId);
        const active = block ? block.querySelector('.driver-radio-btn.active') : null;
        const durum = active ? active.dataset.value : 'yok';
        data = { durum: durum, adres: durum === 'var' ? (document.getElementById('driver-lastik-adres-' + vehicleId)?.value.trim() || '') : '' };
    } else if (type === 'muayene') {
        const tarih = document.getElementById('driver-muayene-tarih-' + vehicleId)?.value.trim() || '';
        if (!tarih) { alert('Tarih zorunludur!'); return; }
        data = { tarih: tarih };
    } else if (type === 'sigorta') {
        const tarih = document.getElementById('driver-sigorta-tarih-' + vehicleId)?.value.trim() || '';
        if (!tarih) { alert('Tarih zorunludur!'); return; }
        data = {
            tarih: tarih,
            firma: document.getElementById('driver-sigorta-firma-' + vehicleId)?.value.trim() || '',
            acente: document.getElementById('driver-sigorta-acente-' + vehicleId)?.value.trim() || '',
            iletisim: document.getElementById('driver-sigorta-iletisim-' + vehicleId)?.value.trim() || ''
        };
    } else if (type === 'kasko') {
        const tarih = document.getElementById('driver-kasko-tarih-' + vehicleId)?.value.trim() || '';
        if (!tarih) { alert('Tarih zorunludur!'); return; }
        data = {
            tarih: tarih,
            firma: document.getElementById('driver-kasko-firma-' + vehicleId)?.value.trim() || '',
            acente: document.getElementById('driver-kasko-acente-' + vehicleId)?.value.trim() || '',
            iletisim: document.getElementById('driver-kasko-iletisim-' + vehicleId)?.value.trim() || ''
        };
    } else return;
    try {
        const res = await fetch(API_BASE + 'driver_event.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + currentToken },
            body: JSON.stringify({ arac_id: parseInt(vehicleId, 10), event_type: type, data: data })
        });
        const result = await res.json();
        if (result.success) {
            lastCompletedActionInSession = { action: type, vehicleId: vehicleId };
            cancelDriverActionForm(type, vehicleId);
            await loadDashboard();
        } else {
            alert(result.message || 'Kayıt başarısız!');
        }
    } catch (err) {
        console.error(err);
        alert('Bağlantı hatası!');
    }
};

window.saveDriverEvent = async function(type) {
    const vehicleId = currentDriverEventVehicleId;
    if (!vehicleId || !currentToken) return;
    let data = {};
    if (type === 'anahtar') {
        const active = document.querySelector('#driver-anahtar-modal .driver-radio-btn.active');
        const durum = active ? active.dataset.value : 'yok';
        data = { durum: durum, detay: durum === 'var' ? (document.getElementById('driver-anahtar-detay')?.value.trim() || '') : '' };
    } else if (type === 'lastik') {
        const active = document.querySelector('#driver-lastik-modal .driver-radio-btn.active');
        const durum = active ? active.dataset.value : 'yok';
        data = { durum: durum, adres: durum === 'var' ? (document.getElementById('driver-lastik-adres')?.value.trim() || '') : '' };
    } else if (type === 'utts') {
        const active = document.querySelector('#driver-utts-modal .driver-radio-btn.active');
        data = { durum: active && active.dataset.value === 'evet' };
    } else if (type === 'muayene') {
        const tarih = document.getElementById('driver-muayene-tarih')?.value.trim() || '';
        if (!tarih) {
            alert('Tarih zorunludur!');
            return;
        }
        data = { tarih: tarih };
    } else if (type === 'sigorta') {
        const tarih = document.getElementById('driver-sigorta-tarih')?.value.trim() || '';
        if (!tarih) {
            alert('Tarih zorunludur!');
            return;
        }
        data = {
            tarih: tarih,
            firma: document.getElementById('driver-sigorta-firma')?.value.trim() || '',
            acente: document.getElementById('driver-sigorta-acente')?.value.trim() || '',
            iletisim: document.getElementById('driver-sigorta-iletisim')?.value.trim() || ''
        };
    } else if (type === 'kasko') {
        const tarih = document.getElementById('driver-kasko-tarih')?.value.trim() || '';
        if (!tarih) {
            alert('Tarih zorunludur!');
            return;
        }
        data = {
            tarih: tarih,
            firma: document.getElementById('driver-kasko-firma')?.value.trim() || '',
            acente: document.getElementById('driver-kasko-acente')?.value.trim() || '',
            iletisim: document.getElementById('driver-kasko-iletisim')?.value.trim() || ''
        };
    }
    try {
        const res = await fetch(API_BASE + 'driver_event.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + currentToken },
            body: JSON.stringify({ arac_id: vehicleId, event_type: type, data: data })
        });
        const result = await res.json();
        if (result.success) {
            closeDriverEventModal(type);
            await loadDashboard();
        } else {
            alert(result.message || 'Kayıt başarısız!');
        }
    } catch (err) {
        console.error(err);
        alert('Bağlantı hatası!');
    }
};

// Blok Aç/Kapa (aksiyon butonlarından çağrılır)
window.toggleAndScrollToBlock = function(type, vehicleId) {
    toggleReportBlock(type, vehicleId);
    const block = document.getElementById(type + '-block-' + vehicleId);
    if (block) block.scrollIntoView({ behavior: 'smooth', block: 'center' });
};

window.toggleReportBlock = function(type, vehicleId) {
    const block = document.getElementById(`${type}-block-${vehicleId}`);
    if (!block) return;
    
    const isShown = block.classList.contains('show');
    if (isShown) {
        block.classList.remove('show');
    } else {
        block.classList.add('show');
        // Açılınca tarih boşsa bugünün tarihini ver
        const dateEl = document.getElementById(`${type}-tarih-${vehicleId}`);
        if(dateEl && !dateEl.value) {
             dateEl.value = new Date().toISOString().split('T')[0];
        }
        // Kaza bloku açıldığında kaporta SVG'yi ilk kez yükle (container boşsa)
        if (type === 'kaza') {
            const container = document.getElementById('kaza-kaporta-' + vehicleId);
            if (container && !container.querySelector('svg')) {
                let boyaliParcalar = {};
                try {
                    const raw = container.getAttribute('data-boyali-parcalar');
                    if (raw) boyaliParcalar = JSON.parse(raw);
                } catch (e) {}
                initDriverKaporta(vehicleId, boyaliParcalar);
            }
        }
    }
};

/**
 * Sürücü paneli kaza blokunda kaporta SVG yükler; mevcut boyaliParcalar uygulanır, parçalar tıklanarak boyasiz/boyali/degisen döngüsü
 */
function initDriverKaporta(vehicleId, boyaliParcalar) {
    const container = document.getElementById('kaza-kaporta-' + vehicleId);
    if (!container) return;
    boyaliParcalar = boyaliParcalar || {};
    const url = ICON_BASE + 'kaporta.svg';
    fetch(url)
        .then(function(res) { return res.text(); })
        .then(function(svgText) {
            const parser = new DOMParser();
            const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
            const svg = svgDoc.querySelector('svg');
            if (!svg) return;
            container.innerHTML = '';
            const schemaWrapper = document.createElement('div');
            schemaWrapper.style.display = 'flex';
            schemaWrapper.style.alignItems = 'flex-start';
            schemaWrapper.style.justifyContent = 'center';
            schemaWrapper.style.gap = '12px';
            schemaWrapper.style.maxHeight = '180px';
            schemaWrapper.style.overflow = 'hidden';
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
                part.style.cursor = 'pointer';
                const state = boyaliParcalar[partId] || 'boyasiz';
                part.dataset.state = state;
                if (state === 'boyali') {
                    part.setAttribute('fill', '#28a745');
                    part.style.fill = '#28a745';
                } else if (state === 'degisen') {
                    part.setAttribute('fill', '#e1061b');
                    part.style.fill = '#e1061b';
                }
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
                        this.setAttribute('fill', '#e1061b');
                        this.style.fill = '#e1061b';
                    }
                });
            });
            const legend = document.createElement('div');
            legend.className = 'boya-legend';
            legend.style.display = 'flex';
            legend.style.flexDirection = 'column';
            legend.style.gap = '4px';
            legend.style.fontSize = '11px';
            legend.style.color = '#aaa';
            legend.innerHTML = '<div class="boya-legend-item"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#888;margin-right:6px;"></span>Boyasız</div><div class="boya-legend-item"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#28a745;margin-right:6px;"></span>Boyalı</div><div class="boya-legend-item"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#e1061b;margin-right:6px;"></span>Değişen</div>';
            schemaWrapper.appendChild(legend);
            container.appendChild(schemaWrapper);
        })
        .catch(function(err) { console.error('Kaporta SVG yüklenemedi:', err); });
}

// Kaydetme
window.saveVehicleData = async function(vehicleId) {
    const km = document.getElementById(`km-${vehicleId}`).value;
    
    const bakimBlock = document.getElementById(`bakim-block-${vehicleId}`);
    const bakimAciklama = document.getElementById(`bakim-detay-${vehicleId}`).value.trim();
    const bakimTarih = document.getElementById(`bakim-tarih-${vehicleId}`).value;
    const bakimServis = document.getElementById(`bakim-servis-${vehicleId}`)?.value.trim() || '';
    const bakimKisi = document.getElementById(`bakim-kisi-${vehicleId}`)?.value.trim() || '';
    const bakimKm = document.getElementById(`bakim-km-${vehicleId}`)?.value.trim() || '';
    const bakimTutar = document.getElementById(`bakim-tutar-${vehicleId}`)?.value.trim() || '';
    
    const kazaBlock = document.getElementById(`kaza-block-${vehicleId}`);
    const kazaAciklama = document.getElementById(`kaza-detay-${vehicleId}`).value.trim();
    const kazaTarih = document.getElementById(`kaza-tarih-${vehicleId}`).value;
    const kazaHasarTutari = document.getElementById(`kaza-tutar-${vehicleId}`)?.value.trim() || '';

    const not = document.getElementById(`not-${vehicleId}`).value;

    // Panel açık veya açıklama doluysa "Var" say
    const bakimVar = bakimBlock.classList.contains('show') || bakimAciklama.length > 0;
    const kazaVar = kazaBlock.classList.contains('show') || kazaAciklama.length > 0;

    if (!km || km <= 0) {
        alert('Lütfen geçerli bir KM değeri girin!');
        document.getElementById(`km-${vehicleId}`).focus();
        return;
    }

    if (bakimVar && bakimAciklama === '') {
        alert('Bakım bildirdiniz, lütfen açıklama girin veya iptal etmek için paneli kapatın.');
        bakimBlock.classList.add('show');
        return;
    }

    if (kazaVar && kazaAciklama === '') {
        alert('Kaza bildirdiniz, lütfen açıklama girin veya iptal etmek için paneli kapatın.');
        kazaBlock.classList.add('show');
        return;
    }
    
    // Kaporta: sadece boyalı/değişen parçaları topla
    let boyaParcalar = {};
    const kaportaContainer = document.getElementById('kaza-kaporta-' + vehicleId);
    if (kaportaContainer) {
        const paths = kaportaContainer.querySelectorAll('svg path[id]');
        paths.forEach(function(part) {
            const partId = part.getAttribute('id');
            if (partId === 'araba-govde') return;
            const state = part.dataset.state;
            if (state === 'boyali' || state === 'degisen') boyaParcalar[partId] = state;
        });
    }

    const btn = document.getElementById(`btn-save-${vehicleId}`);
    btn.disabled = true;
    btn.textContent = 'Kaydediliyor...';
    
    try {
        const response = await fetch(API_BASE + 'driver_save.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + currentToken
            },
            body: JSON.stringify({
                arac_id: vehicleId,
                guncel_km: parseInt(km),
                bakim_durumu: bakimVar ? 1 : 0,
                bakim_aciklama: bakimAciklama,
                bakim_tarih: bakimTarih,
                bakim_servis: bakimServis,
                bakim_kisi: bakimKisi,
                bakim_km: bakimKm,
                bakim_tutar: bakimTutar,
                kaza_durumu: kazaVar ? 1 : 0,
                kaza_aciklama: kazaAciklama,
                kaza_tarih: kazaTarih,
                kaza_hasar_tutari: kazaHasarTutari,
                boya_parcalar: JSON.stringify(boyaParcalar),
                ekstra_not: not
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showStatus(vehicleId, 'success', '✅ Kaydedildi!');
            btn.textContent = 'GÜNCELLE';
            if (data.warning) {
                setTimeout(() => { alert(data.warning); }, 500);
            }
        } else {
            showStatus(vehicleId, 'error', '❌ ' + data.message);
            btn.textContent = 'KAYDET';
        }
        
    } catch (error) {
        console.error('Kaydetme hatası:', error);
        showStatus(vehicleId, 'error', '❌ Bağlantı hatası!');
        btn.textContent = 'KAYDET';
    } finally {
        btn.disabled = false;
    }
};

// Durum mesajı
function showStatus(vehicleId, type, message) {
    const statusDiv = document.getElementById(`status-${vehicleId}`);
    statusDiv.className = `status-message ${type}`;
    statusDiv.textContent = message;
    
    setTimeout(() => {
        statusDiv.className = 'status-message';
        statusDiv.textContent = '';
    }, 5000);
}

// Dönem formatı
function formatPeriod(period) {
    const [year, month] = period.split('-');
    const months = ['OCAK', 'ŞUBAT', 'MART', 'NİSAN', 'MAYIS', 'HAZİRAN',
                    'TEMMUZ', 'AĞUSTOS', 'EYLÜL', 'EKİM', 'KASIM', 'ARALIK'];
    return `${months[parseInt(month) - 1]} ${year}`;
}

function formatKm(value) {
    if (value == null || value === '') return '';
    const numStr = String(value).replace(/[^\d]/g, '');
    if (!numStr) return '';
    return numStr.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// Geçmiş kayıtlar - custom dropdown
window.showHistory = function() {
    const hiddenInput = document.getElementById('history-vehicle-filter');
    const triggerText = document.querySelector('.history-vehicle-trigger-text');
    const dropdown = document.getElementById('history-vehicle-dropdown');
    const trigger = document.querySelector('.history-vehicle-trigger');
    dropdown.innerHTML = '';
    const optAll = document.createElement('div');
    optAll.className = 'history-vehicle-option';
    optAll.dataset.value = '';
    optAll.textContent = 'Tüm Taşıtlar';
    optAll.onclick = function() { selectHistoryVehicle('', 'Tüm Taşıtlar'); };
    dropdown.appendChild(optAll);
    allHistoryVehicles.forEach(v => {
        const opt = document.createElement('div');
        opt.className = 'history-vehicle-option';
        opt.dataset.value = String(v.id);
        const brandModel = v.brandModel || [v.marka, v.model].filter(Boolean).join(' ');
        opt.textContent = [v.plaka, brandModel].filter(Boolean).join(' – ');
        opt.onclick = function() { selectHistoryVehicle(String(v.id), opt.textContent); };
        dropdown.appendChild(opt);
    });
    let defaultVal = '';
    let defaultText = 'Tüm Taşıtlar';
    if (allHistoryVehicles.length === 1) {
        defaultVal = String(allHistoryVehicles[0].id);
        const bm = allHistoryVehicles[0].brandModel || [allHistoryVehicles[0].marka, allHistoryVehicles[0].model].filter(Boolean).join(' ');
        defaultText = [allHistoryVehicles[0].plaka, bm].filter(Boolean).join(' – ');
    }
    hiddenInput.value = defaultVal;
    if (triggerText) triggerText.textContent = defaultText;
    if (dropdown) dropdown.style.display = 'none';
    if (trigger) trigger.classList.remove('history-vehicle-trigger-open');
    renderHistoryList();
    document.getElementById('history-modal').classList.add('show');
    updateDriverModalBodyClass();
};

window.toggleHistoryVehicleDropdown = function(ev) {
    ev.stopPropagation();
    const dropdown = document.getElementById('history-vehicle-dropdown');
    const trigger = document.querySelector('.history-vehicle-trigger');
    if (!dropdown || !trigger) return;
    const isOpen = dropdown.style.display !== 'none';
    if (isOpen) {
        dropdown.style.display = 'none';
        trigger.classList.remove('history-vehicle-trigger-open');
    } else {
        dropdown.style.display = 'block';
        trigger.classList.add('history-vehicle-trigger-open');
    }
};

function selectHistoryVehicle(value, text) {
    const hiddenInput = document.getElementById('history-vehicle-filter');
    const triggerText = document.querySelector('.history-vehicle-trigger-text');
    const dropdown = document.getElementById('history-vehicle-dropdown');
    const trigger = document.querySelector('.history-vehicle-trigger');
    if (hiddenInput) hiddenInput.value = value;
    if (triggerText) triggerText.textContent = text;
    if (dropdown) dropdown.style.display = 'none';
    if (trigger) trigger.classList.remove('history-vehicle-trigger-open');
    renderHistoryList();
}

document.addEventListener('click', function(ev) {
    const wrap = document.querySelector('.history-vehicle-dropdown-wrap');
    const dropdown = document.getElementById('history-vehicle-dropdown');
    if (wrap && dropdown && dropdown.style.display !== 'none' && !wrap.contains(ev.target)) {
        dropdown.style.display = 'none';
        const trigger = document.querySelector('.history-vehicle-trigger');
        if (trigger) trigger.classList.remove('history-vehicle-trigger-open');
    }
});

function buildCombinedHistoryList() {
    const vehicleFilter = document.getElementById('history-vehicle-filter').value;
    const hareketler = (allHistoryRecords || []).map(r => ({ ...r, _type: 'hareket' }));
    const eventItems = [];
    (allHistoryVehicles || []).forEach(v => {
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
    const combined = [...hareketFiltered, ...eventItems];
    const sortKey = (item) => {
        if (item._type === 'hareket') return (item.donem || '') + (item.kayit_tarihi || '');
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
    if (item._type === 'hareket') return formatPeriod(item.donem || '');
    const months = ['OCAK', 'ŞUBAT', 'MART', 'NİSAN', 'MAYIS', 'HAZİRAN', 'TEMMUZ', 'AĞUSTOS', 'EYLÜL', 'EKİM', 'KASIM', 'ARALIK'];
    if (item.date) {
        const d = parseHistoryDate(item.date);
        if (d) return `${String(d.getDate()).padStart(2, '0')} ${months[d.getMonth()]} ${d.getFullYear()}`;
        return item.date;
    }
    if (item.timestamp) {
        const d = parseHistoryDate(item.timestamp) || new Date(item.timestamp);
        if (d && !isNaN(d.getTime())) return `${String(d.getDate()).padStart(2, '0')} ${months[d.getMonth()]} ${d.getFullYear()}`;
        return '';
    }
    return '';
}

function capitalizeWords(str) {
    if (!str || typeof str !== 'string') return str;
    return str.split(/\s+/).map(w => w.charAt(0).toLocaleUpperCase('tr-TR') + w.slice(1).toLocaleLowerCase('tr-TR')).join(' ');
}

function renderHistoryList() {
    const sorted = buildCombinedHistoryList();
    const listEl = document.getElementById('history-list');
    listEl.innerHTML = '';
    if (sorted.length === 0) {
        listEl.innerHTML = '<p class="history-empty">Geçmiş kayıt bulunamadı.</p>';
        return;
    }
    window._historyRecordMap = window._historyRecordMap || {};
    sorted.forEach(item => {
        const vehicle = allHistoryVehicles.find(v => String(v.id) === String(item.arac_id));
        const plaka = vehicle ? vehicle.plaka : item.arac_id;
        const periodLabel = formatHistoryPeriod(item);

        let detailsHtml = '';
        let showEditBtn = false;

        if (item._type === 'hareket') {
            window._historyRecordMap[item.id] = item;
            showEditBtn = true;
            if (item.kaza_durumu) {
                detailsHtml = `<p><strong>Kaza:</strong> ${escapeHtmlDriver(item.kaza_aciklama || 'Var')}</p>`;
                if (item.kaza_tarih) detailsHtml += `<p><strong>Tarih:</strong> ${item.kaza_tarih}</p>`;
                if (item.kaza_hasar_tutari) detailsHtml += `<p><strong>Hasar Tutarı:</strong> ${escapeHtmlDriver(item.kaza_hasar_tutari)} TL</p>`;
            } else if (item.bakim_durumu) {
                detailsHtml = `<p>${escapeHtmlDriver(capitalizeWords('Bakım Bildirildi') + ': ')}${escapeHtmlDriver(item.bakim_aciklama || 'Var')}</p>`;
                if (item.bakim_tarih) detailsHtml += `<p><strong>Tarih:</strong> ${item.bakim_tarih}</p>`;
                if (item.guncel_km) detailsHtml += `<p><strong>Bildirilen KM:</strong> ${formatKm(item.guncel_km)}</p>`;
            } else {
                detailsHtml = `<p>${escapeHtmlDriver(capitalizeWords('Bildirilen KM') + ':')} <strong>${formatKm(item.guncel_km) || '0'}</strong></p>`;
            }
        } else {
            const d = item.data || {};
            if (item.eventType === 'anahtar-guncelle') {
                const durum = (d.durum === 'var') ? 'Var' : 'Yok';
                detailsHtml = `<p>${escapeHtmlDriver(capitalizeWords('Yedek anahtar durumu ' + durum + ' olarak güncellendi'))}</p>`;
            } else if (item.eventType === 'lastik-guncelle') {
                const durum = (d.durum === 'var') ? 'Var' : 'Yok';
                detailsHtml = `<p>${escapeHtmlDriver(capitalizeWords('Lastik durumu ' + durum + ' olarak güncellendi'))}</p>`;
            } else if (item.eventType === 'utts-guncelle') {
                const durum = d.durum ? 'Evet' : 'Hayır';
                detailsHtml = `<p>${escapeHtmlDriver(capitalizeWords('UTTS bilgisi ' + durum + ' olarak güncellendi'))}</p>`;
            } else if (item.eventType === 'muayene-guncelle') {
                let txt = 'Muayene Bilgisi Güncellendi';
                if (d.bitisTarihi) txt += ` (Bitiş: ${escapeHtmlDriver(d.bitisTarihi)})`;
                detailsHtml = `<p>${escapeHtmlDriver(txt)}</p>`;
            } else if (item.eventType === 'kasko-guncelle') {
                let txt = 'Kasko Yenilemesi Bildirildi';
                if (d.bitisTarihi) txt += ` (Bitiş: ${escapeHtmlDriver(d.bitisTarihi)})`;
                detailsHtml = `<p>${escapeHtmlDriver(txt)}</p>`;
            } else if (item.eventType === 'sigorta-guncelle') {
                let txt = 'Trafik Sigortası Yenileme Bildirildi';
                if (d.bitisTarihi) txt += ` (Bitiş: ${escapeHtmlDriver(d.bitisTarihi)})`;
                detailsHtml = `<p>${escapeHtmlDriver(txt)}</p>`;
            } else {
                detailsHtml = `<p>${escapeHtmlDriver(item.eventType || 'Güncelleme')}</p>`;
            }
        }

        const card = document.createElement('div');
        card.className = 'history-card';
        card.innerHTML = `
            <div class="history-header">
                <span class="history-period">${escapeHtmlDriver(periodLabel)}</span>
                <span class="history-vehicle">${escapeHtmlDriver(plaka)}</span>
            </div>
            <div class="history-details">${detailsHtml}</div>
            ${showEditBtn ? `<button onclick="showEditRequest(${typeof item.id === 'number' ? item.id : JSON.stringify(String(item.id))})" class="btn-edit-request">Düzeltme Talep Et</button>` : ''}
        `;
        listEl.appendChild(card);
    });
}

window.closeHistory = function() {
    document.getElementById('history-modal').classList.remove('show');
    updateDriverModalBodyClass();
};

// Düzeltme talebi
window.showEditRequest = function(recordId) {
    const record = window._historyRecordMap && window._historyRecordMap[recordId];
    if (!record) return;
    currentRecordId = recordId;
    document.getElementById('current-km').textContent = formatKm(record.guncel_km) || '0';
    document.getElementById('new-km').value = formatKm(record.guncel_km) || '';
    document.getElementById('current-bakim').textContent = record.bakim_durumu ? (record.bakim_aciklama || 'Var') : 'Yok';
    document.getElementById('new-bakim').value = record.bakim_durumu ? (record.bakim_aciklama || '') : '';
    document.getElementById('current-kaza').textContent = record.kaza_durumu ? (record.kaza_aciklama || 'Var') : 'Yok';
    document.getElementById('new-kaza').value = record.kaza_durumu ? (record.kaza_aciklama || '') : '';
    document.getElementById('edit-reason').value = '';
    document.getElementById('edit-request-modal').classList.add('show');
    updateDriverModalBodyClass();
};

window.closeEditRequest = function() {
    document.getElementById('edit-request-modal').classList.remove('show');
    currentRecordId = null;
    updateDriverModalBodyClass();
};

window.submitEditRequest = async function() {
    const record = window._historyRecordMap && window._historyRecordMap[currentRecordId];
    if (!record) return;
    const newKmVal = document.getElementById('new-km').value.trim();
    const newKm = newKmVal ? parseInt(newKmVal.replace(/\./g, ''), 10) : null;
    const newBakim = document.getElementById('new-bakim').value.trim();
    const newKaza = document.getElementById('new-kaza').value.trim();
    const reason = document.getElementById('edit-reason').value.trim();
    const currentBakim = record.bakim_durumu ? (record.bakim_aciklama || '') : '';
    const currentKaza = record.kaza_durumu ? (record.kaza_aciklama || '') : '';
    const kmChanged = newKm !== null && newKm !== (record.guncel_km || 0);
    const bakimChanged = (newBakim || '') !== (currentBakim || '');
    const kazaChanged = (newKaza || '') !== (currentKaza || '');
    if (!kmChanged && !bakimChanged && !kazaChanged) {
        alert('En az bir alanda değişiklik yapmalısınız!');
        return;
    }
    if (!reason) {
        alert('Düzeltme sebebini yazmalısınız!');
        return;
    }
    if (newKm !== null && newKm <= 0) {
        alert('Geçerli bir KM değeri girin!');
        return;
    }
    const payload = { kayit_id: currentRecordId, sebep: reason };
    if (kmChanged && newKm !== null) payload.yeni_km = newKm;
    if (bakimChanged) {
        payload.yeni_bakim_durumu = newBakim ? 1 : 0;
        payload.yeni_bakim_aciklama = newBakim;
    }
    if (kazaChanged) {
        payload.yeni_kaza_durumu = newKaza ? 1 : 0;
        payload.yeni_kaza_aciklama = newKaza;
    }
    try {
        const response = await fetch(API_BASE + 'driver_request.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + currentToken
            },
            body: JSON.stringify(payload)
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert('✅ Düzeltme talebiniz gönderildi. Admin onayı bekleniyor.');
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

// Çıkış
window.logout = function() {
    localStorage.removeItem('driver_token');
    sessionStorage.removeItem('driver_token');
    window.location.href = DRIVER_PAGE_BASE + 'index.html';
};

/* Service Worker (PWA cache) – driver sayfaları doğrudan açıldığında da çalışır */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    var swPaths = ['../sw.js', '/sw.js', '/tasitmedisa/sw.js', '/medisa/sw.js'];
    var currentPathIndex = 0;
    function tryRegisterSW() {
      if (currentPathIndex >= swPaths.length) return;
      var swPath = swPaths[currentPathIndex];
      navigator.serviceWorker.register(swPath, { scope: './' })
        .then(function() {})
        .catch(function(error) {
          if (error.message && (
            error.message.indexOf('404') !== -1 ||
            error.message.indexOf('Failed to fetch') !== -1 ||
            error.message.indexOf('bad HTTP response code') !== -1
          )) {
            currentPathIndex++;
            tryRegisterSW();
          } else if (error.message && (error.message.indexOf('redirect') !== -1 || error.message.indexOf('Redirect') !== -1)) {
            currentPathIndex++;
            tryRegisterSW();
          } else if (error.name === 'SecurityError') {
            currentPathIndex++;
            tryRegisterSW();
          } else {
            currentPathIndex++;
            tryRegisterSW();
          }
        });
    }
    tryRegisterSW();
  });
}