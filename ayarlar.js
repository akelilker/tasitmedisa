/* =========================================
   AYARLAR MODÜLÜ - ŞUBE & KULLANICI YÖNETİMİ
   ========================================= */

(function () {
  function hydrateMedisaSettingsMarkup() {
    if (document.getElementById('branch-modal')) return;
    var host = document.createElement('div');
    host.setAttribute('data-medisa-surface', 'settings');
    host.innerHTML = `<div id="branch-modal" class="modal-overlay ayarlar-modal-overlay">
            <div class="modal-container">
                <div class="modal-header">
                    <button type="button" class="modal-home" onclick="medisaSettingsGoHome(event)" aria-label="Ana sayfaya dön" title="Ana sayfa">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 10v10h14V10"/></svg>
                    </button>
                    <h2>ŞUBE YÖNETİMİ</h2>
                    <button class="modal-close" onclick="closeBranchManagement()">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
                <div class="universal-back-bar universal-back-bar--standalone user-management-back-bar">
                    <button type="button" class="universal-back-btn" aria-label="Ayarlar" onclick="medisaSettingsHistoryBack(event)">
                        <svg class="back-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                        <span class="universal-back-label">Ayarlar</span>
                    </button>
                    <div id="branch-management-search-wrap" class="user-management-search-wrap">
                        <input
                            type="search"
                            id="branch-management-search-input"
                            class="user-management-search-input"
                            placeholder="Şube Ara"
                            autocomplete="off"
                            inputmode="search"
                            onclick="event.stopPropagation()"
                            oninput="if(window.setBranchManagementSearch) window.setBranchManagementSearch(this.value)">
                        <button
                            type="button"
                            class="user-management-search-toggle"
                            id="branch-management-search-toggle"
                            aria-label="Şube Ara"
                            aria-expanded="false"
                            onclick="event.stopPropagation(); if(window.toggleBranchManagementSearch) window.toggleBranchManagementSearch();">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                <circle cx="11" cy="11" r="7"></circle>
                                <path d="M20 20l-3.5-3.5"></path>
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="modal-body">
                    <div class="u-p-16">
                        <button onclick="openBranchFormModal()" class="settings-add-text-btn user-add-btn">+ Yeni Şube</button>
                        <div id="branch-list"></div>
                    </div>
                </div>
            </div>
        </div>

<div id="branch-form-modal" class="modal-overlay ayarlar-modal-overlay">
            <div class="modal-container">
                <div class="modal-header">
                    <button type="button" class="modal-home" onclick="medisaSettingsGoHome(event)" aria-label="Ana sayfaya dön" title="Ana sayfa">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 10v10h14V10"/></svg>
                    </button>
                    <h2>YENİ ŞUBE EKLE</h2>
                    <button class="modal-close" onclick="closeBranchFormModal()">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
                <div class="universal-back-bar universal-back-bar--standalone">
                    <button type="button" class="universal-back-btn" aria-label="Şube Yönetimi" onclick="medisaSettingsHistoryBack(event)">
                        <svg class="back-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                        <span class="universal-back-label">Şube Yönetimi</span>
                    </button>
                </div>
                <div class="modal-body">
                    <form id="branch-form" class="u-p-16">
                        <input type="hidden" id="branch-id">
                        <div class="form-section">
                            <label class="form-label" for="branch-name">Şube Adı</label>
                            <input type="text" id="branch-name" class="form-input" placeholder="Şube Adı" required>
                        </div>
                        <div class="form-section">
                            <label class="form-label" for="branch-city">Şehir</label>
                            <input type="text" id="branch-city" class="form-input" placeholder="Şehir">
                        </div>
                        <div class="universal-btn-group">
                            <button type="button" class="universal-btn-save" onclick="saveBranch()">Kaydet</button>
                            <button type="button" class="settings-btn-delete u-hidden" onclick="deleteBranch(document.getElementById('branch-id').value)" id="branch-delete-btn">Sil</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>

<div id="user-modal" class="modal-overlay ayarlar-modal-overlay">
            <div class="modal-container">
                <div class="modal-header">
                    <button type="button" class="modal-home" onclick="medisaSettingsGoHome(event)" aria-label="Ana sayfaya dön" title="Ana sayfa">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 10v10h14V10"/></svg>
                    </button>
                    <h2>KULLANICI YÖNETİMİ</h2>
                    <button class="modal-close" onclick="closeUserManagement()">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
                <div class="universal-back-bar universal-back-bar--standalone user-management-back-bar">
                    <button type="button" class="universal-back-btn" aria-label="Ayarlar" onclick="medisaSettingsHistoryBack(event)">
                        <svg class="back-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                        <span class="universal-back-label">Ayarlar</span>
                    </button>
                    <div id="user-management-search-wrap" class="user-management-search-wrap">
                        <input
                            type="search"
                            id="user-management-search-input"
                            class="user-management-search-input"
                            placeholder="Kullanıcı Ara"
                            autocomplete="off"
                            inputmode="search"
                            onclick="event.stopPropagation()"
                            oninput="if(window.setUserManagementSearch) window.setUserManagementSearch(this.value)">
                        <button
                            type="button"
                            class="user-management-search-toggle"
                            id="user-management-search-toggle"
                            aria-label="Kullanıcı Ara"
                            aria-expanded="false"
                            onclick="event.stopPropagation(); if(window.toggleUserManagementSearch) window.toggleUserManagementSearch();">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                <circle cx="11" cy="11" r="7"></circle>
                                <path d="M20 20l-3.5-3.5"></path>
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="modal-body">
                    <div class="user-management-list-inner">
                        <button onclick="openUserFormModal()" class="settings-add-text-btn user-add-btn">+ Yeni Kullanıcı</button>
                        <div id="user-list"></div>
                    </div>
                </div>
            </div>
        </div>

<div id="user-form-modal" class="modal-overlay ayarlar-modal-overlay">
            <div class="modal-container">
                <div class="modal-header">
                    <button type="button" class="modal-home" onclick="medisaSettingsGoHome(event)" aria-label="Ana sayfaya dön" title="Ana sayfa">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 10v10h14V10"/></svg>
                    </button>
                    <h2>YENİ KULLANICI EKLE</h2>
                    <button class="modal-close" onclick="closeUserFormModal()">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
                <div class="universal-back-bar universal-back-bar--standalone">
                    <button type="button" class="universal-back-btn" aria-label="Kullanıcı Yönetimi" onclick="medisaSettingsHistoryBack(event)">
                        <svg class="back-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                        <span class="universal-back-label">Kullanıcı Yönetimi</span>
                    </button>
                </div>
                <div class="modal-body">
                    <form id="user-form" class="user-form-inner">
                        <input type="hidden" id="user-id">
                        <div class="form-section">
                            <label class="form-label" for="user-name">Ad Soyad</label>
                            <input type="text" id="user-name" class="form-input" placeholder="Ad Soyad" required>
                        </div>
                        <div class="form-section" id="user-branch-single-wrap">
                            <label class="form-label" for="user-branch">Şube</label>
                            <select id="user-branch" class="form-input" required>
                                <option value="">Şube Seçin</option>
                            </select>
                        </div>
                        <div class="form-section u-hidden" id="user-branch-readonly-wrap">
                            <label class="form-label" for="user-branch-readonly">Şube</label>
                            <input type="text" id="user-branch-readonly" class="form-input user-form-locked-input" readonly tabindex="-1" aria-readonly="true">
                        </div>
                        <div class="form-section" id="user-role-wrap">
                            <label class="form-label" for="user-role">Kullanıcı Tipi</label>
                            <select id="user-role" class="form-input">
                                <option value="kullanici" selected>Kullanıcı</option>
                                <option value="sube_yonetici">Yönetici</option>
                                <option value="genel_yonetici">Genel Yönetici</option>
                            </select>
                        </div>
                        <div class="form-section">
                            <label class="form-label" for="user-phone">Telefon</label>
                            <input type="text" id="user-phone" class="form-input" placeholder="Telefon" inputmode="tel">
                        </div>
                        <div class="form-section">
                            <label class="form-label" for="user-email">E-posta</label>
                            <input type="email" id="user-email" class="form-input" placeholder="E-posta">
                        </div>
                        <div class="form-section">
                            <label class="form-label" for="user-username">Kullanıcı Adı (portal girişi)</label>
                            <input type="text" id="user-username" class="form-input" placeholder="Plaka veya Kullanıcı Adı" autocomplete="username">
                        </div>
                        <div class="form-section">
                            <label class="form-label" for="user-password">Şifre (portal girişi)</label>
                            <input type="password" id="user-password" class="form-input" placeholder="Şifre" autocomplete="new-password" minlength="6">
                        </div>
                        <div class="form-section form-section-vehicles">
                            <span id="user-vehicles-label" class="form-label">Tahsis Edilecek Taşıt</span>
                            <div class="user-vehicles-wrap">
                                <div id="user-vehicles-trigger" class="user-vehicles-trigger form-input" tabindex="0" role="combobox" aria-labelledby="user-vehicles-label" aria-controls="user-vehicles-dropdown" aria-haspopup="listbox" aria-expanded="false" onclick="if(window.toggleUserVehiclesDropdown) window.toggleUserVehiclesDropdown()">
                                    <span class="user-vehicles-trigger-text">Taşıt Seçin</span>
                                    <svg class="user-vehicles-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
                                </div>
                                <div id="user-vehicles-dropdown" class="user-vehicles-dropdown" style="display:none;" role="listbox" aria-hidden="true">
                                    <div id="user-vehicles-container" class="user-vehicles-checkbox-list" role="group"></div>
                                    <div class="user-vehicles-search-wrap">
                                        <input type="text" id="user-vehicles-search" class="form-input user-vehicles-search-input" placeholder="Plaka İle Ara..." aria-label="Plaka İle Ara" oninput="if(window.handleUserVehiclesSearch) window.handleUserVehiclesSearch(this.value)">
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="universal-btn-group">
                            <button type="button" class="universal-btn-save" onclick="saveUser()">Kaydet</button>
                            <button type="button" class="settings-btn-delete u-hidden" onclick="deleteUser(document.getElementById('user-id').value)" id="user-delete-btn">Sil</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>

<div id="required-documents-modal" class="modal-overlay ayarlar-modal-overlay">
            <div class="modal-container">
                <div class="modal-header">
                    <button type="button" class="modal-home" onclick="medisaSettingsGoHome(event)" aria-label="Ana sayfaya dön" title="Ana sayfa">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 10v10h14V10"/></svg>
                    </button>
                    <h2>ZORUNLU EVRAKLAR</h2>
                    <button class="modal-close" onclick="closeZorunluEvraklar()">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
                <div class="universal-back-bar universal-back-bar--standalone">
                    <button type="button" class="universal-back-btn" aria-label="Ayarlar" onclick="medisaSettingsHistoryBack(event)">
                        <svg class="back-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                        <span class="universal-back-label">Ayarlar</span>
                    </button>
                </div>
                <div class="modal-body">
                    <div id="required-documents-branch-list-view" class="u-p-16">
                        <div id="required-documents-branch-list" class="settings-card-grid"></div>
                    </div>
                    <div id="required-documents-detail-view" class="u-p-16" hidden>
                        <button type="button" class="universal-back-btn" onclick="backToZorunluEvrakBranchList(event)">
                            <span>← Şubeler</span>
                        </button>
                        <h3 class="required-k2-section-title">K2 Taşıt Belgesi</h3>
                        <div id="required-k2-selected-branch" class="settings-card-title"></div>
                        <div class="form-section">
                            <div id="required-k2-document-area" class="required-k2-document-area">
                                <button type="button" id="required-k2-document-picker" class="required-k2-document-picker">
                                    <span class="required-k2-document-picker-icon">+</span>
                                    <span class="required-k2-document-picker-label">Dosya Seç</span>
                                </button>
                            </div>
                            <div id="required-k2-document-status" class="settings-card-count">Yüklü Değil</div>
                            <input type="file" id="required-k2-document-input" accept="application/pdf,.pdf" class="form-input">
                        </div>
                        <div class="form-section required-k2-date-section">
                            <label class="form-label" for="required-k2-expiry-date">Geçerlilik Süresi</label>
                            <input type="text" id="required-k2-expiry-date" class="form-input" placeholder="gg/aa/yyyy" inputmode="numeric">
                        </div>
                        <div class="universal-btn-group">
                            <button type="button" class="universal-btn-save" onclick="saveZorunluEvraklarK2()">Kaydet</button>
                            <button type="button" class="universal-btn-cancel" onclick="closeZorunluEvraklar()">Vazgeç</button>
                        </div>
                        <div id="required-k2-group-members" class="required-k2-group-members"></div>
                    </div>
                </div>
            </div>
        </div>

<div id="data-management-modal" class="modal-overlay ayarlar-modal-overlay">
            <div class="modal-container">
                <div class="modal-header">
                    <button type="button" class="modal-home" onclick="medisaSettingsGoHome(event)" aria-label="Ana sayfaya dön" title="Ana sayfa">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 10v10h14V10"/></svg>
                    </button>
                    <h2>VERİ YEDEKLEME</h2>
                    <button class="modal-close" onclick="closeDataManagement()">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
                <div class="universal-back-bar universal-back-bar--standalone">
                    <button type="button" class="universal-back-btn" aria-label="Ayarlar" onclick="medisaSettingsHistoryBack(event)">
                        <svg class="back-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                        <span class="universal-back-label">Ayarlar</span>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="data-management-actions">
                        <button type="button" onclick="exportData()" class="data-management-text-btn">
                            <img class="data-management-action-icon" src="icon/data-backup.svg?v=20260611.1" alt="" aria-hidden="true">
                            <span>Yedek Al</span>
                        </button>
                        <button type="button" onclick="importData()" class="data-management-text-btn">
                            <img class="data-management-action-icon" src="icon/data-import.svg?v=20260611.1" alt="" aria-hidden="true">
                            <span>Yedekten Geri Yükle</span>
                        </button>
                    </div>
                    <div id="data-management-backup-meta" class="data-management-backup-meta" aria-live="polite">
                        <p class="data-management-backup-meta-line">Sunucudaki Son Yedekleme Dosyası: Yükleniyor…</p>
                        <p class="data-management-backup-meta-hint">Yedek Almak İçin “Yedek Al” Butonunu Kullanınız.</p>
                    </div>
                    <section id="server-restore-panel" class="server-restore-panel" aria-labelledby="server-restore-title" aria-describedby="server-restore-status" hidden>
                        <h3 id="server-restore-title" class="server-restore-title">Sunucu Geri Yükleme</h3>
                        <p id="server-restore-status" class="server-restore-status" role="status">Sunucu geri yükleme kapalı.</p>
                        <div id="server-restore-list" class="server-restore-list" role="list"></div>
                        <div id="server-restore-dryrun" class="server-restore-dryrun" hidden></div>
                        <label class="server-restore-confirm-label" for="server-restore-confirmation">Onay metni</label>
                        <input id="server-restore-confirmation" class="server-restore-confirmation" type="text" autocomplete="off" aria-describedby="server-restore-confirm-hint" disabled>
                        <p id="server-restore-confirm-hint" class="server-restore-hint">Commit için exact onay metnini yazın. Tek tık restore yoktur.</p>
                        <div class="server-restore-actions">
                            <button type="button" id="server-restore-refresh-btn" class="server-restore-btn">Yedek listesini yenile</button>
                            <button type="button" id="server-restore-dryrun-btn" class="server-restore-btn" disabled>Dry-run</button>
                            <button type="button" id="server-restore-commit-btn" class="server-restore-btn server-restore-btn--danger" disabled aria-busy="false">Restore commit</button>
                        </div>
                        <div id="server-restore-error" class="server-restore-error" role="alert" hidden></div>
                    </section>
                </div>
            </div>
        </div>

<div id="dis-veri-panel" class="modal-overlay ayarlar-modal-overlay">
            <div class="modal-container">
                <div class="modal-header">
                    <button type="button" class="modal-home" onclick="medisaSettingsGoHome(event)" aria-label="Ana sayfaya dön" title="Ana sayfa">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 10v10h14V10"/></svg>
                    </button>
                    <h2>Dış Veri Yönetimi</h2>
                    <button class="modal-close" onclick="closeDisVeriPanel()">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
                <div class="universal-back-bar universal-back-bar--standalone">
                    <button type="button" class="universal-back-btn" aria-label="Ayarlar" onclick="medisaSettingsHistoryBack(event)">
                        <svg class="back-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                        <span class="universal-back-label">Ayarlar</span>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="data-management-actions">
                        <button type="button" id="tsb-indir-btn" class="data-management-text-btn" onclick="tsbKaskoListesiIndir()">TSB Kasko Listesi İndir</button>
                        <button type="button" id="kasko-yukle-btn" class="data-management-text-btn" onclick="kaskoExcelYukle()">Kasko Excel Yükle</button>
                        <input type="file" id="kasko-excel-input" accept=".xlsx,.xls" style="display: none;" aria-label="Kasko Excel dosyası seç (.xlsx, .xls)">
                    </div>
                </div>
            </div>
        </div>

<div id="cache-confirm-modal" class="modal-overlay ayarlar-modal-overlay compact-confirm-modal">
            <div class="modal-container" onclick="event.stopPropagation();">
                <div class="modal-header">
                    <h2>ÖNBELLEK TEMİZLEME</h2>
                    <button class="modal-close" onclick="closeCacheConfirmModal()">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
                <div class="modal-body" onclick="event.stopPropagation();">
                    <p id="cache-confirm-message" class="compact-confirm-message"></p>
                    <div class="universal-btn-group">
                        <button type="button" class="universal-btn-save" onclick="event.stopPropagation(); confirmCacheClear();">Evet</button>
                        <button type="button" class="universal-btn-cancel" onclick="event.stopPropagation(); closeCacheConfirmModal();">Hayır</button>
                    </div>
                </div>
            </div>
        </div>`;
    var fragment = document.createDocumentFragment();
    while (host.firstChild) fragment.appendChild(host.firstChild);
    document.body.appendChild(fragment);
  }
  window.__medisaMainSurfaceHydrators = window.__medisaMainSurfaceHydrators || {};
  window.__medisaMainSurfaceHydrators['settings'] = hydrateMedisaSettingsMarkup;
  hydrateMedisaSettingsMarkup();
})();


   (function () {

    function $(sel, root = document) { return root.querySelector(sel); }
    function $all(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

    function shouldAutofocusSettingsForm() {
      const hasMatchMedia = typeof window.matchMedia === 'function';
      const isStandalone = hasMatchMedia
        && (window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: fullscreen)').matches);
      const ua = navigator.userAgent || '';
      const isiOS = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      return !(isiOS && (isStandalone || window.navigator.standalone === true));
    }

    function syncSettingsOpenState() {
      const settingsMenu = document.getElementById('settings-menu');
      document.body.classList.toggle('settings-open', !!(settingsMenu && settingsMenu.classList.contains('open')));
    }

    function closeSettingsDropdown() {
      const settingsMenu = document.getElementById('settings-menu');
      if (settingsMenu) settingsMenu.classList.remove('open');
      syncSettingsOpenState();
    }

    window.reopenSettingsMenu = function reopenSettingsMenu() {
      const settingsMenu = document.getElementById('settings-menu');
      if (settingsMenu) settingsMenu.classList.add('open');
      syncSettingsOpenState();
    };

    let settingsHistorySync = false;
    let medisaSettingsLayers = ['home'];

    function rebuildSettingsLayerStack(layer) {
      medisaSettingsLayers = ['home'];
      if (!layer || layer === 'home') return;
      if (layer === 'settings-menu') {
        medisaSettingsLayers.push('settings-menu');
        return;
      }
      medisaSettingsLayers.push('settings-menu');
      if (layer === 'settings-branch-form') {
        medisaSettingsLayers.push('settings-branch', 'settings-branch-form');
      } else if (layer === 'settings-user-form') {
        medisaSettingsLayers.push('settings-user', 'settings-user-form');
      } else {
        medisaSettingsLayers.push(layer);
      }
    }

    function pushSettingsHistoryLayer(layer) {
      if (settingsHistorySync || !layer || layer === 'home') return;
      const currentHistoryLayer = (history.state && history.state.__medisa) ? history.state.layer : 'home';
      if (
        medisaSettingsLayers.length === 1
        && currentHistoryLayer !== 'home'
        && currentHistoryLayer !== medisaSettingsLayers[medisaSettingsLayers.length - 1]
      ) {
        rebuildSettingsLayerStack(currentHistoryLayer);
      }
      if (medisaSettingsLayers[medisaSettingsLayers.length - 1] === layer) return;
      medisaSettingsLayers.push(layer);
      try {
        history.pushState({ __medisa: true, layer: layer }, '');
      } catch (e) {}
    }

    function resetToHomeFromPanel() {
      const steps = medisaSettingsLayers.length - 1;
      if (steps > 0) {
        try { history.go(-steps); } catch (e) {
          applySettingsHistoryLayer('home');
          try { history.replaceState({ __medisa: true, layer: 'home' }, ''); } catch (err) {}
          rebuildSettingsLayerStack('home');
        }
        return;
      }
      applySettingsHistoryLayer('home');
      try { history.replaceState({ __medisa: true, layer: 'home' }, ''); } catch (e) {}
      rebuildSettingsLayerStack('home');
    }

    function hideAyarlarModal(id) {
      const modal = document.getElementById(id);
      if (!modal) return;
      modal.classList.remove('active');
      modal.style.display = 'none';
    }

    function showAyarlarModal(id) {
      const modal = document.getElementById(id);
      if (!modal) return;
      modal.style.display = 'flex';
      requestAnimationFrame(function() { modal.classList.add('active'); });
    }

    function applySettingsHistoryLayer(layer) {
      settingsHistorySync = true;
      try {
        hideAyarlarModal('branch-form-modal');
        hideAyarlarModal('user-form-modal');
        hideAyarlarModal('branch-modal');
        hideAyarlarModal('user-modal');
        hideAyarlarModal('required-documents-modal');
        hideAyarlarModal('data-management-modal');
        hideAyarlarModal('dis-veri-panel');
        closeSettingsDropdown();

        if (layer === 'settings-menu') {
          reopenSettingsMenu();
        } else if (layer === 'settings-branch') {
          renderBranchList();
          showAyarlarModal('branch-modal');
          syncBranchManagementSearchUi();
          bindBranchManagementKeyboardHandlers();
          clearBranchManagementKeyboardOffset();
        } else if (layer === 'settings-user') {
          renderUserList();
          showAyarlarModal('user-modal');
          syncUserManagementSearchUi();
          bindUserManagementKeyboardHandlers();
          clearUserManagementKeyboardOffset();
        } else if (layer === 'settings-required-docs') {
          refreshZorunluEvraklarK2View();
          setupZorunluEvraklarK2DatePicker();
          setupZorunluEvraklarK2DocumentPicker();
          showAyarlarModal('required-documents-modal');
        } else if (layer === 'settings-data') {
          showAyarlarModal('data-management-modal');
        } else if (layer === 'settings-dis-veri') {
          showAyarlarModal('dis-veri-panel');
        } else if (layer === 'settings-branch-form') {
          renderBranchList();
          showAyarlarModal('branch-modal');
          syncBranchManagementSearchUi();
          bindBranchManagementKeyboardHandlers();
          showAyarlarModal('branch-form-modal');
        } else if (layer === 'settings-user-form') {
          renderUserList();
          showAyarlarModal('user-modal');
          syncUserManagementSearchUi();
          bindUserManagementKeyboardHandlers();
          showAyarlarModal('user-form-modal');
        }

        if (typeof window.updateFooterDim === 'function') window.updateFooterDim();
      } finally {
        settingsHistorySync = false;
      }
    }

    function onSettingsHistoryPopstate(e) {
      if (settingsHistorySync) return;
      const layer = (e.state && e.state.__medisa) ? e.state.layer : 'home';
      rebuildSettingsLayerStack(layer);
      applySettingsHistoryLayer(layer);
    }

    window.medisaSettingsPushLayer = pushSettingsHistoryLayer;

    window.medisaOnSettingsMenuDismissed = function medisaOnSettingsMenuDismissed() {
      if (settingsHistorySync) return;
      if (medisaSettingsLayers[medisaSettingsLayers.length - 1] === 'settings-menu') {
        try { history.back(); } catch (e) {}
      }
    };

    window.medisaSettingsHistoryBack = function medisaSettingsHistoryBack(e) {
      if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
      if (e && typeof e.preventDefault === 'function') e.preventDefault();
      try { history.back(); } catch (err) {}
    };

    window.medisaSettingsGoHome = function medisaSettingsGoHome(e) {
      if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
      if (e && typeof e.preventDefault === 'function') e.preventDefault();
      resetToHomeFromPanel();
    };

    if (!window.__medisaSettingsHistoryReady) {
      window.__medisaSettingsHistoryReady = true;
      const initLayer = (history.state && history.state.__medisa) ? history.state.layer : 'home';
      rebuildSettingsLayerStack(initLayer);
      window.addEventListener('popstate', onSettingsHistoryPopstate);
    }

    let activeUserFormCustomSelect = null;
    let userFormSelectedVehicleIds = [];

    function getUserFormSelectedVehicleIds() {
      return userFormSelectedVehicleIds.slice();
    }

    function setUserFormSelectedVehicleIds(ids) {
      userFormSelectedVehicleIds = Array.from(new Set((Array.isArray(ids) ? ids : []).map(function(id) {
        return String(id || '').trim();
      }).filter(Boolean)));
    }

    function closeUserFormCustomSelect(options) {
      const opts = options || {};
      const shell = activeUserFormCustomSelect;
      if (!shell) return;
      const trigger = shell.querySelector('.medisa-owner-select-trigger');
      const menu = shell.querySelector('.medisa-owner-select-menu');
      shell.classList.remove('is-open');
      if (trigger) {
        trigger.classList.remove('is-open');
        trigger.setAttribute('aria-expanded', 'false');
        if (opts.focusTrigger) trigger.focus();
      }
      if (menu) {
        menu.classList.remove('open');
        menu.setAttribute('aria-hidden', 'true');
        menu.style.position = '';
        menu.style.top = '';
        menu.style.bottom = '';
        menu.style.left = '';
        menu.style.width = '';
        menu.style.maxHeight = '';
      }
      activeUserFormCustomSelect = null;
    }

    function positionUserFormCustomSelectMenu(shell) {
      if (!shell) return;
      const trigger = shell.querySelector('.medisa-owner-select-trigger');
      const menu = shell.querySelector('.medisa-owner-select-menu');
      if (!trigger || !menu) return;

      const rect = trigger.getBoundingClientRect();
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 800;
      const desiredHeight = Math.min(menu.scrollHeight || 240, 260);
      const spaceBelow = Math.max(120, viewportHeight - rect.bottom - 12);
      const spaceAbove = Math.max(120, rect.top - 12);
      const useAbove = spaceBelow < Math.min(180, desiredHeight) && spaceAbove > spaceBelow;
      const maxHeight = Math.max(120, Math.min(260, useAbove ? spaceAbove : spaceBelow));
      const shellHeight = trigger.offsetHeight || rect.height || 44;

      menu.style.position = 'absolute';
      menu.style.left = '0';
      menu.style.width = '100%';
      menu.style.maxHeight = maxHeight + 'px';
      if (useAbove) {
        menu.style.top = 'auto';
        menu.style.bottom = (shellHeight + 6) + 'px';
      } else {
        menu.style.top = (shellHeight + 6) + 'px';
        menu.style.bottom = 'auto';
      }
    }

    function refreshUserFormCustomSelect(shell) {
      if (!shell) return;
      const select = shell.querySelector('select');
      const trigger = shell.querySelector('.medisa-owner-select-trigger');
      const triggerText = shell.querySelector('.medisa-owner-select-trigger-text');
      const menu = shell.querySelector('.medisa-owner-select-menu');
      if (!select || !trigger || !triggerText || !menu) return;

      const options = Array.from(select.options || []);
      const selectedValue = String(select.value || '');
      let selectedOption = options.find(function(option) {
        return String(option.value || '') === String(selectedValue);
      }) || options[select.selectedIndex] || options[0] || null;

      if (!selectedOption && options.length) {
        selectedOption = options[0];
        select.value = selectedOption.value;
      }

      const placeholderText = shell.dataset.placeholderText || (options[0] ? options[0].textContent : 'Seçiniz');
      const selectedText = selectedOption ? String(selectedOption.textContent || '').trim() : '';
      const selectedOptionValue = selectedOption ? String(selectedOption.value || '') : '';

      triggerText.textContent = selectedText || placeholderText;
      trigger.classList.toggle('placeholder', !selectedOptionValue);
      trigger.disabled = !!select.disabled;
      trigger.setAttribute('aria-disabled', select.disabled ? 'true' : 'false');

      menu.innerHTML = '';
      options.forEach(function(option) {
        const value = String(option.value || '');
        const text = String(option.textContent || '').trim();
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'medisa-owner-select-option';
        item.textContent = text;
        item.dataset.value = value;
        item.setAttribute('role', 'option');
        item.setAttribute('aria-selected', value === selectedValue ? 'true' : 'false');

        if (!value) item.classList.add('is-placeholder');
        if (value === selectedValue) item.classList.add('selected');
        if (option.disabled) {
          item.classList.add('is-disabled');
          item.disabled = true;
        }

        menu.appendChild(item);
      });

      if (activeUserFormCustomSelect === shell && menu.classList.contains('open')) {
        positionUserFormCustomSelectMenu(shell);
      }
    }

    function openUserFormCustomSelect(shell) {
      if (!shell) return;
      if (activeUserFormCustomSelect && activeUserFormCustomSelect !== shell) {
        closeUserFormCustomSelect();
      }
      const trigger = shell.querySelector('.medisa-owner-select-trigger');
      const menu = shell.querySelector('.medisa-owner-select-menu');
      if (!trigger || !menu || trigger.disabled) return;

      activeUserFormCustomSelect = shell;
      shell.classList.add('is-open');
      trigger.classList.add('is-open');
      trigger.setAttribute('aria-expanded', 'true');
      menu.classList.add('open');
      menu.setAttribute('aria-hidden', 'false');
      positionUserFormCustomSelectMenu(shell);
    }

    function ensureUserFormCustomSelect(select, options) {
      if (!select) return null;
      let shell = select.closest('.medisa-owner-select');
      if (!shell) {
        shell = document.createElement('div');
        shell.className = 'medisa-owner-select';
        select.parentNode.insertBefore(shell, select);
        shell.appendChild(select);
        select.classList.add('medisa-owner-select-native');

        const trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className = 'form-input medisa-owner-select-trigger';
        trigger.setAttribute('aria-haspopup', 'listbox');
        trigger.setAttribute('aria-expanded', 'false');
        trigger.innerHTML = '<span class="medisa-owner-select-trigger-text"></span><svg class="medisa-owner-select-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';

        const menu = document.createElement('div');
        menu.className = 'medisa-owner-select-menu';
        menu.setAttribute('role', 'listbox');
        menu.setAttribute('aria-hidden', 'true');

        shell.appendChild(trigger);
        shell.appendChild(menu);

        const label = shell.parentNode ? shell.parentNode.querySelector('label[for="' + select.id + '"]') : null;
        if (label && !label.dataset.medisaOwnerSelectBound) {
          label.dataset.medisaOwnerSelectBound = '1';
          label.addEventListener('click', function(e) {
            if (!select.closest('.medisa-owner-select')) return;
            e.preventDefault();
            trigger.focus();
          });
        }

        trigger.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          if (activeUserFormCustomSelect === shell) closeUserFormCustomSelect();
          else openUserFormCustomSelect(shell);
        });

        trigger.addEventListener('keydown', function(e) {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (activeUserFormCustomSelect === shell) closeUserFormCustomSelect();
            else openUserFormCustomSelect(shell);
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            openUserFormCustomSelect(shell);
          } else if (e.key === 'Escape' && activeUserFormCustomSelect === shell) {
            e.preventDefault();
            closeUserFormCustomSelect({ focusTrigger: true });
          }
        });

        menu.addEventListener('click', function(e) {
          const item = e.target.closest('.medisa-owner-select-option');
          if (!item || item.disabled) return;
          select.value = item.dataset.value || '';
          select.dispatchEvent(new Event('change', { bubbles: true }));
          refreshUserFormCustomSelect(shell);
          closeUserFormCustomSelect({ focusTrigger: true });
        });

        select.addEventListener('change', function() {
          refreshUserFormCustomSelect(shell);
        });
      }

      shell.dataset.placeholderText = options && options.placeholderText ? options.placeholderText : '';
      refreshUserFormCustomSelect(shell);
      return shell;
    }

    function syncUserFormCustomSelects(modal) {
      const root = modal || document.getElementById('user-form-modal');
      if (!root) return;
      ensureUserFormCustomSelect($('#user-branch', root), { placeholderText: 'Şube Seçin' });
      ensureUserFormCustomSelect($('#user-role', root), { placeholderText: 'Kullanıcı Tipi' });
    }

    document.addEventListener('click', function(e) {
      if (!activeUserFormCustomSelect) return;
      if (!activeUserFormCustomSelect.contains(e.target)) closeUserFormCustomSelect();
    }, true);

    window.addEventListener('resize', function() {
      if (activeUserFormCustomSelect) closeUserFormCustomSelect();
    });


    // ========================================
    // Şube YÖNETİMİ
    // ========================================

    function readBranches() {
      if (typeof window.getMedisaBranches === 'function') {
        var result = window.getMedisaBranches();
        return Array.isArray(result) ? result.slice() : [];
      }
      if (window.appData && Array.isArray(window.appData.branches)) {
        return window.appData.branches.slice();
      }
      return [];
    }
    function writeBranches(arr) {
      if (typeof window.writeBranches === 'function') {
        return window.writeBranches(arr);
      }
      return Promise.resolve(false);
    }
    function readVehicles() {
      if (typeof window.getMedisaVehicles === 'function') {
        var result = window.getMedisaVehicles();
        return Array.isArray(result) ? result.slice() : [];
      }
      if (window.appData && Array.isArray(window.appData.tasitlar)) {
        return window.appData.tasitlar.slice();
      }
      return [];
    }

    let selectedZorunluEvrakBranchId = '';
    let selectedZorunluEvrakGroupId = '';
    let requiredK2MembersDropdownOpen = false;

    function getZorunluEvrakSession() {
      return window.medisaSession && typeof window.medisaSession === 'object'
        ? window.medisaSession
        : {};
    }

    function getZorunluEvraklarK2Groups() {
      const groups = window.appData && window.appData.ayarlar && window.appData.ayarlar.k2BelgeGruplari;
      return Array.isArray(groups) ? groups : [];
    }

    function getZorunluEvraklarK2State() {
      const group = getZorunluEvraklarK2Groups().find(function(item) {
        return item && item.id === selectedZorunluEvrakGroupId;
      });
      return group || { id: '', branchIds: [selectedZorunluEvrakBranchId], expiryDate: '', documentPath: '', updatedAt: '' };
    }

    function getVisibleRequiredDocumentBranches() {
      return readBranches();
    }

    function renderRequiredDocumentBranchList() {
      const host = document.getElementById('required-documents-branch-list');
      if (!host) return;
      const branches = getVisibleRequiredDocumentBranches();
      if (!branches.length) {
        host.innerHTML = '<div class="settings-empty-state">Görüntülenecek şube bulunamadı.</div>';
        return;
      }
      host.innerHTML = branches.map(function(branch) {
        const title = escapeHtml(branch.name || branch.ad || branch.id || '');
        return '<div class="settings-card" data-branch-id="' + escapeHtml(String(branch.id)) + '" role="button" tabindex="0">' +
          '<div class="settings-card-content"><div class="settings-card-title">' + title + '</div></div></div>';
      }).join('');
    }

    function renderRequiredDocumentGroupMembers() {
      const host = document.getElementById('required-k2-group-members');
      if (!host || !selectedZorunluEvrakBranchId) return;
      closeRequiredK2MembersDropdown();
      const session = getZorunluEvrakSession();
      const isGM = String(session.role || '').toLowerCase() === 'genel_yonetici';
      const group = getZorunluEvraklarK2Groups().find(function(item) {
        return item && Array.isArray(item.branchIds) && item.branchIds.map(String).indexOf(String(selectedZorunluEvrakBranchId)) !== -1;
      });
      if (!isGM) { host.innerHTML = ''; return; }
      const currentIds = group ? group.branchIds.map(String) : [String(selectedZorunluEvrakBranchId)];
      const availableBranches = getVisibleRequiredDocumentBranches().filter(function(branch) {
        return String(branch.id) !== String(selectedZorunluEvrakBranchId);
      });
      host.innerHTML = '<div class="required-k2-members-title">Belge, Başka Şubeler İçin de Geçerliyse Seçiniz.</div>' +
        '<div class="required-k2-members-select">' +
        '<button type="button" class="required-k2-members-trigger" aria-haspopup="listbox" aria-expanded="false" aria-controls="required-k2-members-menu">' +
        '<span class="required-k2-members-summary"></span>' +
        '<svg class="required-k2-members-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>' +
        '</button>' +
        '<div id="required-k2-members-menu" class="required-k2-members-menu" role="listbox" aria-hidden="true"></div>' +
        '</div>';
      const menu = host.querySelector('.required-k2-members-menu');
      if (menu) menu.innerHTML = availableBranches.map(function(branch) {
          const branchId = String(branch.id);
          const checked = currentIds.indexOf(branchId) !== -1;
          const disabled = !checked && getZorunluEvrakGroupsForBranch(branchId);
          const branchName = branch.name || branch.ad || branchId;
          return '<label class="required-k2-members-option' + (disabled ? ' is-disabled' : '') + '">' +
            '<input type="checkbox" data-k2-member-id="' + escapeHtml(branchId) + '"' +
            (checked ? ' checked' : '') + (branchId === String(selectedZorunluEvrakBranchId) || disabled ? ' disabled' : '') + '> ' +
            '<span>' + escapeHtml(branchName) + (disabled ? ' (Başka Yetki Belgesine Bağlı)' : '') + '</span></label>';
        }).join('');
      updateRequiredK2MembersSummary(host);
      if (host.dataset.k2MembersBound !== '1') {
        host.dataset.k2MembersBound = '1';
        host.addEventListener('click', function(event) {
          const trigger = event.target.closest('.required-k2-members-trigger');
          if (!trigger) return;
          event.preventDefault();
          if (requiredK2MembersDropdownOpen) closeRequiredK2MembersDropdown({ focusTrigger: true });
          else openRequiredK2MembersDropdown(host);
        });
        host.addEventListener('change', function(event) {
          if (event.target.matches('[data-k2-member-id]')) updateRequiredK2MembersSummary(host);
        });
      }
    }

    function updateRequiredK2MembersSummary(host) {
      if (!host) return;
      const summary = host.querySelector('.required-k2-members-summary');
      if (!summary) return;
      const count = host.querySelectorAll('[data-k2-member-id]:checked').length;
      summary.textContent = count ? count + ' Şube Seçildi' : 'Başka Şube Seçilmedi';
    }

    function positionRequiredK2MembersDropdown(host) {
      const select = host && host.querySelector('.required-k2-members-select');
      const trigger = host && host.querySelector('.required-k2-members-trigger');
      const menu = host && host.querySelector('.required-k2-members-menu');
      if (!select || !trigger || !menu) return;
      const rect = trigger.getBoundingClientRect();
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 800;
      const spaceBelow = Math.max(120, viewportHeight - rect.bottom - 12);
      const spaceAbove = Math.max(120, rect.top - 12);
      const useAbove = spaceBelow < 180 && spaceAbove > spaceBelow;
      const maxHeight = Math.max(120, Math.min(260, useAbove ? spaceAbove : spaceBelow));
      menu.style.maxHeight = maxHeight + 'px';
      menu.style.top = useAbove ? 'auto' : 'calc(100% + 6px)';
      menu.style.bottom = useAbove ? 'calc(100% + 6px)' : 'auto';
    }

    function openRequiredK2MembersDropdown(host) {
      const trigger = host && host.querySelector('.required-k2-members-trigger');
      const menu = host && host.querySelector('.required-k2-members-menu');
      if (!trigger || !menu) return;
      requiredK2MembersDropdownOpen = true;
      host.querySelector('.required-k2-members-select').classList.add('is-open');
      trigger.setAttribute('aria-expanded', 'true');
      menu.classList.add('open');
      menu.setAttribute('aria-hidden', 'false');
      positionRequiredK2MembersDropdown(host);
    }

    function closeRequiredK2MembersDropdown(options) {
      const host = document.getElementById('required-k2-group-members');
      const opts = options || {};
      requiredK2MembersDropdownOpen = false;
      if (!host) return;
      const select = host.querySelector('.required-k2-members-select');
      const trigger = host.querySelector('.required-k2-members-trigger');
      const menu = host.querySelector('.required-k2-members-menu');
      if (select) select.classList.remove('is-open');
      if (trigger) {
        trigger.setAttribute('aria-expanded', 'false');
        if (opts.focusTrigger) trigger.focus();
      }
      if (menu) {
        menu.classList.remove('open');
        menu.setAttribute('aria-hidden', 'true');
        menu.style.maxHeight = '';
        menu.style.top = '';
        menu.style.bottom = '';
      }
    }

    function getZorunluEvrakGroupsForBranch(branchId) {
      return getZorunluEvraklarK2Groups().find(function(group) {
        return group && Array.isArray(group.branchIds) && group.branchIds.map(String).indexOf(String(branchId)) !== -1;
      }) || null;
    }

    function formatZorunluEvrakDate(isoDate) {
      if (!isoDate) return '';
      if (typeof window.formatDateShort === 'function') return window.formatDateShort(isoDate);
      const parts = String(isoDate).split('-');
      return parts.length === 3 ? (parts[2] + '/' + parts[1] + '/' + parts[0]) : String(isoDate);
    }

    function parseZorunluEvrakDate(rawDate) {
      const value = String(rawDate || '').trim();
      if (!value) return '';
      if (typeof window.parseVehicleDateRawToIso === 'function') return window.parseVehicleDateRawToIso(value) || '';
      const digits = value.replace(/\D/g, '');
      if (digits.length === 8) return digits.slice(4, 8) + '-' + digits.slice(2, 4) + '-' + digits.slice(0, 2);
      return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';
    }

    function zorunluEvrakVehicleNeedsK2(vehicle) {
      const typeKey = String((vehicle && (vehicle.vehicleType || vehicle.tip)) || '').trim().toLowerCase();
      return typeKey === 'minivan' || typeKey === 'kamyon' || typeKey === 'romork';
    }

    function isZorunluEvrakVehicleActive(vehicle) {
      if (!vehicle || typeof vehicle !== 'object') return false;
      return vehicle.satildiMi !== true
        && vehicle.arsiv !== true
        && vehicle.pasif !== true
        && vehicle.aktif !== false
        && vehicle.aktifMi !== false
        && String(vehicle.durum || '').trim().toLowerCase() !== 'pasif';
    }

    function syncActiveVehicleTasitKartiExpiryWithK2(isoDate) {
      if (!window.appData || !Array.isArray(window.appData.tasitlar)) return 0;
      let syncedCount = 0;
      window.appData.tasitlar.forEach(function(vehicle) {
        if (!isZorunluEvrakVehicleActive(vehicle) || !zorunluEvrakVehicleNeedsK2(vehicle)) return;
        if (String(vehicle.tasitKartiExpiryDate || '') === isoDate) return;
        vehicle.tasitKartiExpiryDate = isoDate;
        syncedCount += 1;
      });
      return syncedCount;
    }

    function getZorunluEvraklarAuthToken() {
      if (typeof window.getStoredPortalToken === 'function') {
        const token = window.getStoredPortalToken();
        if (token) return token;
      }
      if (typeof getStoredPortalToken === 'function') {
        const token = getStoredPortalToken();
        if (token) return token;
      }
      const keys = ['medisa_portal_token', 'driver_token'];
      for (let i = 0; i < keys.length; i++) {
        try {
          const token = localStorage.getItem(keys[i]);
          if (token) return token;
        } catch (e) {}
        try {
          const token = sessionStorage.getItem(keys[i]);
          if (token) return token;
        } catch (e) {}
      }
      return '';
    }

    function buildZorunluEvraklarAuthHeaders(extraHeaders) {
      if (typeof window.buildAuthHeaders === 'function') {
        return window.buildAuthHeaders(extraHeaders || {});
      }
      if (typeof buildAuthHeaders === 'function') {
        return buildAuthHeaders(extraHeaders || {});
      }
      const headers = Object.assign({}, extraHeaders || {});
      const token = getZorunluEvraklarAuthToken();
      if (token) headers.Authorization = 'Bearer ' + token;
      return headers;
    }

    function setupZorunluEvraklarK2DatePicker() {
      const input = document.getElementById('required-k2-expiry-date');
      if (!input) return;

      let nativeInput = document.getElementById('required-k2-expiry-native');
      if (!nativeInput) {
        const wrapper = document.createElement('div');
        wrapper.className = 'required-k2-date-picker';
        input.parentNode.insertBefore(wrapper, input);
        wrapper.appendChild(input);

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'required-k2-date-picker-btn';
        btn.setAttribute('aria-label', 'K2 belge tarihini takvimden seç');
        btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>';
        wrapper.appendChild(btn);

        nativeInput = document.createElement('input');
        nativeInput.type = 'date';
        nativeInput.id = 'required-k2-expiry-native';
        nativeInput.className = 'required-k2-expiry-native';
        nativeInput.setAttribute('aria-hidden', 'true');
        nativeInput.tabIndex = -1;
        wrapper.appendChild(nativeInput);

        const syncNativeFromText = function() {
          nativeInput.value = parseZorunluEvrakDate(input.value) || '';
        };
        input.addEventListener('blur', syncNativeFromText);
        input.addEventListener('change', syncNativeFromText);
        nativeInput.addEventListener('change', function() {
          input.value = formatZorunluEvrakDate(nativeInput.value || '');
        });
        btn.addEventListener('click', function() {
          syncNativeFromText();
          if (typeof nativeInput.showPicker === 'function') nativeInput.showPicker();
          else {
            nativeInput.focus();
            nativeInput.click();
          }
        });
      }

      nativeInput.value = parseZorunluEvrakDate(input.value) || '';
    }

    function refreshZorunluEvraklarK2View() {
      const state = getZorunluEvraklarK2State();
      const dateInput = document.getElementById('required-k2-expiry-date');
      const statusEl = document.getElementById('required-k2-document-status');
      const fileInput = document.getElementById('required-k2-document-input');
      const hasDocument = !!String(state.documentPath || '').trim();
      if (dateInput) dateInput.value = formatZorunluEvrakDate(state.expiryDate || '');
      if (statusEl) statusEl.textContent = hasDocument ? 'Yüklü' : 'Yüklü Değil';
      if (hasDocument) renderZorunluEvraklarK2Preview();
      else renderZorunluEvraklarK2Picker();
      if (fileInput) fileInput.value = '';
      hideZorunluEvraklarK2ReplaceConfirm();
    }

    var zorunluEvrakK2DocTokenCache = null;
    var ZORUNLU_EVRAK_K2_DOC_TOKEN_MARGIN_MS = 30000;

    function buildZorunluEvraklarK2BasePreviewUrl() {
      const url = new URL('ruhsat_preview.php', window.location.href);
      url.searchParams.set('documentType', 'k2');
      url.searchParams.set('page', '0');
      return url;
    }

    function buildZorunluEvraklarK2BaseViewUrl() {
      const url = new URL('ruhsat.php', window.location.href);
      url.searchParams.set('documentType', 'k2');
      return url;
    }

    function appendDocTokenToZorunluEvrakUrl(rawUrl, docToken) {
      const base = rawUrl instanceof URL ? rawUrl.href : String(rawUrl || '');
      if (!base) return '';
      try {
        const url = new URL(base, window.location.href);
        url.searchParams.delete('token');
        if (docToken) {
          url.searchParams.set('doc', docToken);
        } else {
          url.searchParams.delete('doc');
        }
        return url.toString();
      } catch (e) {
        return base;
      }
    }

    function mintZorunluEvraklarK2DocumentToken() {
      const now = Date.now();
      if (zorunluEvrakK2DocTokenCache
        && zorunluEvrakK2DocTokenCache.token
        && zorunluEvrakK2DocTokenCache.expiresAtMs > now + ZORUNLU_EVRAK_K2_DOC_TOKEN_MARGIN_MS) {
        return Promise.resolve(zorunluEvrakK2DocTokenCache);
      }

      const sessionToken = getZorunluEvraklarAuthToken();
      if (!sessionToken) {
        return Promise.reject(new Error('Oturum gerekli.'));
      }

      return fetch('document_token.php', {
        method: 'POST',
        cache: 'no-store',
        headers: buildZorunluEvraklarAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ documentType: 'k2', branchId: selectedZorunluEvrakBranchId })
      })
        .then(function(response) {
          return response.json().then(function(data) {
            if (!response.ok || !data || data.ok !== true || !data.token) {
              const err = new Error((data && data.message) ? data.message : 'Belge erişim anahtarı alınamadı.');
              err.httpStatus = response.status;
              throw err;
            }
            zorunluEvrakK2DocTokenCache = {
              token: String(data.token),
              expiresAtMs: Number(data.expiresAt) > 0 ? Number(data.expiresAt) * 1000 : (now + 300000)
            };
            return zorunluEvrakK2DocTokenCache;
          });
        });
    }

    function resolveZorunluEvraklarK2PreviewUrl() {
      const baseUrl = buildZorunluEvraklarK2BasePreviewUrl();
      if (!getZorunluEvraklarAuthToken()) {
        return Promise.resolve(baseUrl.toString());
      }
      return mintZorunluEvraklarK2DocumentToken()
        .then(function(entry) {
          return appendDocTokenToZorunluEvrakUrl(baseUrl, entry.token);
        });
    }

    function resolveZorunluEvraklarK2ViewUrl() {
      const baseUrl = buildZorunluEvraklarK2BaseViewUrl();
      if (!getZorunluEvraklarAuthToken()) {
        return Promise.resolve(baseUrl.toString());
      }
      return mintZorunluEvraklarK2DocumentToken()
        .then(function(entry) {
          return appendDocTokenToZorunluEvrakUrl(baseUrl, entry.token);
        });
    }

    function openZorunluEvrakK2BlankTab() {
      try {
        return window.open('about:blank', '_blank');
      } catch (e) {
        return null;
      }
    }

    function showZorunluEvrakK2TabError(tabWindow, message) {
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

    function loadZorunluEvraklarK2PreviewImage(image) {
      if (!image) return;
      image.removeAttribute('src');
      resolveZorunluEvraklarK2PreviewUrl()
        .then(function(previewUrl) {
          if (!image.isConnected) return;
          image.src = previewUrl;
        })
        .catch(function() {
          if (!image.isConnected) return;
          image.remove();
        });
    }

    function renderZorunluEvraklarK2Picker(fileName) {
      const area = document.getElementById('required-k2-document-area');
      if (!area) return;
      area.innerHTML = '';

      const picker = document.createElement('button');
      picker.type = 'button';
      picker.id = 'required-k2-document-picker';
      picker.className = 'required-k2-document-picker';
      if (fileName) picker.classList.add('has-selected-file');

      const icon = document.createElement('span');
      icon.className = 'required-k2-document-picker-icon';
      icon.textContent = fileName ? '✓' : '+';

      const label = document.createElement('span');
      label.className = 'required-k2-document-picker-label';
      label.textContent = fileName || 'Dosya Seç';

      picker.appendChild(icon);
      picker.appendChild(label);
      area.appendChild(picker);
    }

    function ensureZorunluEvraklarK2ReplaceConfirm() {
      const area = document.getElementById('required-k2-document-area');
      if (!area || !area.parentNode) return null;
      let confirm = document.getElementById('required-k2-replace-confirm');
      if (!confirm) {
        confirm = document.createElement('div');
        confirm.id = 'required-k2-replace-confirm';
        confirm.className = 'required-k2-replace-confirm';
        confirm.hidden = true;
        confirm.innerHTML =
          '<div class="required-k2-replace-message">Yüklü Dosya Silinecektir. Dosyayı Yüklemek İstediğinizden Emin Misiniz?</div>' +
          '<div class="required-k2-replace-actions">' +
          '<button type="button" class="required-k2-confirm-yes">Evet</button>' +
          '<button type="button" class="required-k2-confirm-no">Hayır</button>' +
          '</div>';
        area.parentNode.insertBefore(confirm, area.nextSibling);
      }
      return confirm;
    }

    function hideZorunluEvraklarK2ReplaceConfirm() {
      const confirm = document.getElementById('required-k2-replace-confirm');
      if (confirm) confirm.hidden = true;
    }

    function getZorunluEvraklarK2ExpiryIsoOrAlert() {
      const dateInput = document.getElementById('required-k2-expiry-date');
      const isoDate = parseZorunluEvrakDate(dateInput ? dateInput.value : '');
      if (isoDate) return isoDate;
      alert('K2 Belgesi Geçerlilik tarihi geçerli olmalıdır. Örnek: 17/05/2027');
      if (dateInput) dateInput.focus();
      return '';
    }

    function renderZorunluEvraklarK2Preview() {
      const area = document.getElementById('required-k2-document-area');
      if (!area) return;
      area.innerHTML = '';

      const row = document.createElement('div');
      row.className = 'required-k2-preview-row';

      const preview = document.createElement('button');
      preview.type = 'button';
      preview.className = 'required-k2-preview-link';
      preview.setAttribute('aria-label', 'K2 belgesini ön izle');

      const image = document.createElement('img');
      image.className = 'required-k2-preview-image';
      image.alt = '';
      image.loading = 'lazy';
      image.addEventListener('error', function() {
        image.remove();
      }, { once: true });
      loadZorunluEvraklarK2PreviewImage(image);

      const hint = document.createElement('span');
      hint.className = 'required-k2-preview-hint';
      hint.textContent = 'Ön İzleme';

      preview.appendChild(image);
      preview.appendChild(hint);

      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'required-k2-add-btn';
      addBtn.setAttribute('aria-label', 'K2 belgesini değiştir');
      addBtn.textContent = '+';

      row.appendChild(preview);
      row.appendChild(addBtn);
      area.appendChild(row);
    }

    function setupZorunluEvraklarK2DocumentPicker() {
      const area = document.getElementById('required-k2-document-area');
      const fileInput = document.getElementById('required-k2-document-input');
      if (!area || !fileInput) return;
      const replaceConfirm = ensureZorunluEvraklarK2ReplaceConfirm();

      if (area.dataset.k2PickerBound !== '1') {
        area.dataset.k2PickerBound = '1';
        area.addEventListener('click', function(event) {
          const picker = event.target.closest('#required-k2-document-picker');
          const addBtn = event.target.closest('.required-k2-add-btn');
          const preview = event.target.closest('.required-k2-preview-link');
          if (picker || addBtn) {
            fileInput.click();
            return;
          }
          if (preview) window.viewZorunluEvrakK2();
        });
      }

      if (replaceConfirm && replaceConfirm.dataset.k2ConfirmBound !== '1') {
        replaceConfirm.dataset.k2ConfirmBound = '1';
        const yesBtn = replaceConfirm.querySelector('.required-k2-confirm-yes');
        const noBtn = replaceConfirm.querySelector('.required-k2-confirm-no');
        if (yesBtn) {
          yesBtn.addEventListener('click', function(event) {
            event.stopPropagation();
            hideZorunluEvraklarK2ReplaceConfirm();
            window.saveZorunluEvraklarK2({ confirmedReplace: true });
          });
        }
        if (noBtn) {
          noBtn.addEventListener('click', function(event) {
            event.stopPropagation();
            fileInput.value = '';
            hideZorunluEvraklarK2ReplaceConfirm();
            refreshZorunluEvraklarK2View();
          });
        }
      }

      function isDesktopDragDropContext() {
        return typeof window.matchMedia === 'function'
          && window.matchMedia('(min-width: 641px)').matches;
      }
      if (area.dataset.k2DragBound !== '1' && isDesktopDragDropContext()) {
        var k2DragDepth = 0;
        function clearK2DocumentDragOverState() {
          k2DragDepth = 0;
          area.classList.remove('required-k2-document-area--drag-over');
        }
        function isK2DocumentPdfFile(file) {
          if (!file) return false;
          var name = String(file.name || '').toLowerCase();
          return file.type === 'application/pdf' || name.endsWith('.pdf');
        }
        function assignK2DocumentFileAndDispatchChange(file) {
          if (fileInput.disabled) return;
          if (typeof DataTransfer !== 'function') {
            alert('Bu tarayıcı sürükle-bırak dosya atamasını desteklemiyor. Dosya Seç ile yükleyin.');
            return;
          }
          var dt = new DataTransfer();
          dt.items.add(file);
          fileInput.files = dt.files;
          fileInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
        area.addEventListener('dragenter', function() {
          if (!isDesktopDragDropContext()) {
            clearK2DocumentDragOverState();
            return;
          }
          k2DragDepth += 1;
          area.classList.add('required-k2-document-area--drag-over');
        });
        area.addEventListener('dragover', function(event) {
          event.preventDefault();
          event.stopPropagation();
          if (!isDesktopDragDropContext()) {
            clearK2DocumentDragOverState();
          }
        });
        area.addEventListener('dragleave', function() {
          if (!isDesktopDragDropContext()) {
            clearK2DocumentDragOverState();
            return;
          }
          k2DragDepth -= 1;
          if (k2DragDepth <= 0) clearK2DocumentDragOverState();
        });
        area.addEventListener('drop', function(event) {
          event.preventDefault();
          event.stopPropagation();
          clearK2DocumentDragOverState();
          if (!isDesktopDragDropContext()) return;
          if (fileInput.disabled) return;
          var files = event.dataTransfer && event.dataTransfer.files ? event.dataTransfer.files : null;
          if (!files || !files.length) return;
          if (files.length > 1) {
            alert('Yalnızca tek dosya bırakılabilir.');
            return;
          }
          var droppedFile = files[0];
          if (!isK2DocumentPdfFile(droppedFile)) {
            alert('Yalnızca PDF dosyası yüklenebilir.');
            return;
          }
          assignK2DocumentFileAndDispatchChange(droppedFile);
        });
        area.dataset.k2DragBound = '1';
      }

      if (fileInput.dataset.k2PickerBound === '1') return;
      fileInput.dataset.k2PickerBound = '1';
      fileInput.addEventListener('change', function() {
        const selectedFile = fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
        hideZorunluEvraklarK2ReplaceConfirm();
        if (!selectedFile) {
          refreshZorunluEvraklarK2View();
          return;
        }
        if (!getZorunluEvraklarK2ExpiryIsoOrAlert()) {
          fileInput.value = '';
          refreshZorunluEvraklarK2View();
          return;
        }
        renderZorunluEvraklarK2Picker(selectedFile.name);
        const hasDocument = !!String(getZorunluEvraklarK2State().documentPath || '').trim();
        if (hasDocument && replaceConfirm) {
          replaceConfirm.hidden = false;
        } else {
          window.saveZorunluEvraklarK2();
        }
      });
    }

    async function uploadZorunluEvraklarK2Document(fileInput) {
      if (!fileInput || !fileInput.files || !fileInput.files[0]) return null;
      const formData = new FormData();
      formData.append('document', fileInput.files[0]);
      formData.append('documentType', 'k2');
      formData.append('branchId', selectedZorunluEvrakBranchId);
      formData.append('expiryDate', parseZorunluEvrakDate(document.getElementById('required-k2-expiry-date')?.value || ''));
      const response = await fetch('upload_ruhsat.php', {
        method: 'POST',
        headers: buildZorunluEvraklarAuthHeaders(),
        body: formData
      });
      const data = await response.json().catch(function() { return {}; });
      if (!response.ok || data.success !== true) {
        throw new Error(data.message || data.error || 'K2 belgesi yüklenemedi.');
      }
      return data;
    }

    window.openZorunluEvraklar = function openZorunluEvraklar() {
      closeSettingsDropdown();
      const modal = document.getElementById('required-documents-modal');
      if (!modal) return;
      selectedZorunluEvrakBranchId = '';
      selectedZorunluEvrakGroupId = '';
      document.getElementById('required-documents-branch-list-view').hidden = false;
      document.getElementById('required-documents-detail-view').hidden = true;
      renderRequiredDocumentBranchList();
      const branchList = document.getElementById('required-documents-branch-list');
      if (branchList && branchList.dataset.bound !== '1') {
        branchList.dataset.bound = '1';
        branchList.addEventListener('click', function(event) {
          const card = event.target.closest('.settings-card[data-branch-id]');
          if (!card) return;
          const branchId = card.getAttribute('data-branch-id');
          const group = getZorunluEvrakGroupsForBranch(branchId);
          selectedZorunluEvrakBranchId = branchId;
          selectedZorunluEvrakGroupId = group ? group.id : '';
          document.getElementById('required-documents-branch-list-view').hidden = true;
          document.getElementById('required-documents-detail-view').hidden = false;
          const branch = readBranches().find(function(item) { return String(item.id) === String(branchId); });
          const title = document.getElementById('required-k2-selected-branch');
          if (title) title.textContent = branch ? (branch.name || branch.ad || branchId) : branchId;
          refreshZorunluEvraklarK2View();
          setupZorunluEvraklarK2DatePicker();
          setupZorunluEvraklarK2DocumentPicker();
          renderRequiredDocumentGroupMembers();
          pushSettingsHistoryLayer('settings-required-docs-detail');
        });
      }
      modal.style.display = 'flex';
      requestAnimationFrame(() => modal.classList.add('active'));
      pushSettingsHistoryLayer('settings-required-docs');
    };

    window.backToZorunluEvrakBranchList = function backToZorunluEvrakBranchList(event) {
      if (event) event.preventDefault();
      closeRequiredK2MembersDropdown();
      selectedZorunluEvrakBranchId = '';
      selectedZorunluEvrakGroupId = '';
      document.getElementById('required-documents-branch-list-view').hidden = false;
      document.getElementById('required-documents-detail-view').hidden = true;
      renderRequiredDocumentBranchList();
      pushSettingsHistoryLayer('settings-required-docs');
    };

    window.closeZorunluEvraklar = function closeZorunluEvraklar(options) {
      const modal = document.getElementById('required-documents-modal');
      if (!modal) return;
      closeRequiredK2MembersDropdown();
      modal.classList.remove('active');
      closeSettingsDropdown();
      setTimeout(() => {
        modal.style.display = 'none';
      }, 300);
      if (!settingsHistorySync && !(options && options.skipHistory)) {
        resetToHomeFromPanel();
      }
    };

    document.addEventListener('click', function(event) {
      const host = document.getElementById('required-k2-group-members');
      if (requiredK2MembersDropdownOpen && host && !host.contains(event.target)) {
        closeRequiredK2MembersDropdown();
      }
    }, true);

    window.addEventListener('resize', function() {
      if (requiredK2MembersDropdownOpen) closeRequiredK2MembersDropdown();
    });

    window.viewZorunluEvrakK2 = function viewZorunluEvrakK2() {
      const state = getZorunluEvraklarK2State();
      if (!String(state.documentPath || '').trim()) {
        alert('K2 belgesi henüz yüklenmedi.');
        return;
      }
      const blankTab = openZorunluEvrakK2BlankTab();
      resolveZorunluEvraklarK2ViewUrl()
        .then(function(targetUrl) {
          if (blankTab && !blankTab.closed) {
            try {
              blankTab.location.href = targetUrl;
              blankTab.focus();
              return;
            } catch (e) {}
          }
          window.location.href = targetUrl;
        })
        .catch(function(err) {
          if (blankTab && !blankTab.closed) {
            showZorunluEvrakK2TabError(blankTab, err && err.message ? err.message : 'Belge açılamadı.');
            return;
          }
          alert((err && err.message) ? err.message : 'Belge açılamadı.');
        });
    };

    window.saveZorunluEvraklarK2 = async function saveZorunluEvraklarK2(options) {
      const fileInput = document.getElementById('required-k2-document-input');
      const isoDate = getZorunluEvraklarK2ExpiryIsoOrAlert();
      if (!isoDate) {
        return;
      }
      const hasSelectedFile = !!(fileInput && fileInput.files && fileInput.files[0]);
      const hasExistingDocument = !!String(getZorunluEvraklarK2State().documentPath || '').trim();
      if (hasSelectedFile && hasExistingDocument && !(options && options.confirmedReplace === true)) {
        const confirm = ensureZorunluEvraklarK2ReplaceConfirm();
        if (confirm) confirm.hidden = false;
        return;
      }
      try {
        const state = getZorunluEvraklarK2State();
        const memberIds = Array.from(document.querySelectorAll('[data-k2-member-id]:checked')).map(function(input) {
          return String(input.getAttribute('data-k2-member-id'));
        });
        if (memberIds.indexOf(String(selectedZorunluEvrakBranchId)) === -1) memberIds.push(String(selectedZorunluEvrakBranchId));
        const session = getZorunluEvrakSession();
        const mutationPayload = { documentType: 'k2', branchId: selectedZorunluEvrakBranchId, expiryDate: isoDate };
        if (String(session.role || '').toLowerCase() === 'genel_yonetici') mutationPayload.branchIds = memberIds;
        const response = await fetch('required_documents.php', {
          method: 'POST',
          headers: buildZorunluEvraklarAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify(mutationPayload)
        });
        const metadata = await response.json().catch(function() { return {}; });
        if (!response.ok || metadata.success !== true) throw new Error(metadata.message || 'K2 bilgisi kaydedilemedi.');
        const canonicalGroup = metadata.group;
        const uploadResult = await uploadZorunluEvraklarK2Document(fileInput);
        if (canonicalGroup && Array.isArray(window.appData.ayarlar.k2BelgeGruplari)) {
          const index = window.appData.ayarlar.k2BelgeGruplari.findIndex(function(item) { return item.id === canonicalGroup.id; });
          if (index >= 0) window.appData.ayarlar.k2BelgeGruplari[index] = canonicalGroup;
          else window.appData.ayarlar.k2BelgeGruplari.push(canonicalGroup);
          selectedZorunluEvrakGroupId = canonicalGroup.id;
        }
        if (uploadResult && uploadResult.group && Array.isArray(window.appData.ayarlar.k2BelgeGruplari)) {
          const index = window.appData.ayarlar.k2BelgeGruplari.findIndex(function(item) { return item.id === uploadResult.group.id; });
          if (index >= 0) window.appData.ayarlar.k2BelgeGruplari[index] = uploadResult.group;
        }
        if (typeof window.updateNotifications === 'function') window.updateNotifications();
        refreshZorunluEvraklarK2View();
        alert('K2 belgesi bilgisi kaydedildi.');
      } catch (err) {
        alert((err && err.message) ? err.message : 'K2 belgesi kaydedilemedi.');
      }
    };

    // Modal Kontrolü (Ana Liste)
    window.openBranchManagement = function openBranchManagement() {
      closeSettingsDropdown();
      const modal = document.getElementById('branch-modal');
      if (!modal) return;

      branchManagementSearchQuery = '';
      branchManagementSearchOpen = false;
      renderBranchList();

      modal.style.display = 'flex';
      requestAnimationFrame(() => {
        modal.classList.add('active');
        syncBranchManagementSearchUi();
        bindBranchManagementKeyboardHandlers();
        clearBranchManagementKeyboardOffset();
      });
      pushSettingsHistoryLayer('settings-branch');
    };

    window.closeBranchManagement = function closeBranchManagement(options) {
      const modal = document.getElementById('branch-modal');
      if (!modal) return;
      branchManagementSearchQuery = '';
      branchManagementSearchOpen = false;
      syncBranchManagementSearchUi();
      clearBranchManagementKeyboardOffset();
      modal.classList.remove('active');
      closeSettingsDropdown();
      setTimeout(() => modal.style.display = 'none', 300);
      if (!settingsHistorySync && !(options && options.skipHistory)) {
        resetToHomeFromPanel();
      }
    };

    let branchManagementSearchQuery = '';
    let branchManagementSearchOpen = false;
    let branchManagementKeyboardBound = false;

    function clearBranchManagementKeyboardOffset() {
      const body = document.querySelector('#branch-modal .modal-body');
      if (!body) return;
      body.classList.remove('user-management-keyboard-open');
      body.style.removeProperty('--user-modal-keyboard-offset');
    }

    function applyBranchManagementKeyboardOffset() {
      const modal = document.getElementById('branch-modal');
      const input = document.getElementById('branch-management-search-input');
      const body = modal ? modal.querySelector('.modal-body') : null;
      if (!modal || !body || !input) return;
      if (!modal.classList.contains('active')) {
        clearBranchManagementKeyboardOffset();
        return;
      }
      if (document.activeElement !== input) {
        clearBranchManagementKeyboardOffset();
        return;
      }
      if (!isUserManagementKeyboardAwareContext()) {
        clearBranchManagementKeyboardOffset();
        return;
      }

      const vv = window.visualViewport;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
      const vvHeight = vv && typeof vv.height === 'number' ? vv.height : viewportHeight;
      const keyboardRaw = Math.max(0, Math.round(viewportHeight - vvHeight));
      const keyboardOffset = keyboardRaw > 60 ? Math.max(220, Math.min(420, keyboardRaw + 24)) : 0;

      if (keyboardOffset > 0) {
        body.classList.add('user-management-keyboard-open');
        body.style.setProperty('--user-modal-keyboard-offset', keyboardOffset + 'px');
      } else {
        clearBranchManagementKeyboardOffset();
      }
    }

    function bindBranchManagementKeyboardHandlers() {
      if (branchManagementKeyboardBound) return;
      const input = document.getElementById('branch-management-search-input');
      if (!input) return;
      branchManagementKeyboardBound = true;

      const onFocus = function() {
        requestAnimationFrame(function() {
          applyBranchManagementKeyboardOffset();
        });
      };
      const onBlur = function() {
        clearBranchManagementKeyboardOffset();
      };
      const onViewportResize = function() {
        const modal = document.getElementById('branch-modal');
        if (!modal || !modal.classList.contains('active')) return;
        if (document.activeElement !== input) return;
        applyBranchManagementKeyboardOffset();
      };

      input.addEventListener('focus', onFocus);
      input.addEventListener('blur', onBlur);
      if (window.visualViewport && typeof window.visualViewport.addEventListener === 'function') {
        window.visualViewport.addEventListener('resize', onViewportResize);
      }
      window.addEventListener('resize', onViewportResize);
    }

    function focusBranchManagementSearchInput(input, options) {
      if (!input) return;
      try {
        input.focus({ preventScroll: true });
      } catch (e) {
        input.focus();
      }
      if (options && options.select === true && !isUserManagementKeyboardAwareContext() && typeof input.select === 'function') {
        input.select();
      }
      requestAnimationFrame(function() {
        applyBranchManagementKeyboardOffset();
      });
    }

    function syncBranchManagementSearchUi(options) {
      const wrap = document.getElementById('branch-management-search-wrap');
      const input = document.getElementById('branch-management-search-input');
      const toggle = document.getElementById('branch-management-search-toggle');
      if (!wrap || !input || !toggle) return;

      wrap.classList.toggle('open', !!branchManagementSearchOpen);
      input.value = branchManagementSearchQuery;
      toggle.setAttribute('aria-expanded', branchManagementSearchOpen ? 'true' : 'false');

      if (branchManagementSearchOpen && options && options.focus === true) {
        focusBranchManagementSearchInput(input, { select: true });
        setTimeout(function() {
          if (document.activeElement !== input) {
            focusBranchManagementSearchInput(input, { select: true });
          }
        }, 30);
      } else if (!branchManagementSearchOpen && document.activeElement === input) {
        input.blur();
      }
    }

    window.toggleBranchManagementSearch = function toggleBranchManagementSearch(forceOpen) {
      const nextOpen = typeof forceOpen === 'boolean' ? forceOpen : !branchManagementSearchOpen;

      if (!nextOpen) {
        branchManagementSearchOpen = false;
        branchManagementSearchQuery = '';
        syncBranchManagementSearchUi();
        renderBranchList();
        return;
      }

      branchManagementSearchOpen = true;
      syncBranchManagementSearchUi({ focus: true });
    };

    window.setBranchManagementSearch = function setBranchManagementSearch(value) {
      branchManagementSearchQuery = String(value || '');
      branchManagementSearchOpen = true;
      syncBranchManagementSearchUi();
      renderBranchList();
    };

    function onBranchManagementSearchOutsidePointerDown(e) {
      if (typeof window.innerWidth === 'number' && window.innerWidth > 640) return;
      const modal = document.getElementById('branch-modal');
      if (!modal || !modal.classList.contains('active')) return;
      if (!branchManagementSearchOpen) return;
      const wrap = document.getElementById('branch-management-search-wrap');
      if (!wrap || wrap.contains(e.target)) return;
      if (e.target && e.target.closest && e.target.closest('#branch-list .settings-card')) {
        const input = document.getElementById('branch-management-search-input');
        if (input && document.activeElement === input) input.blur();
        return;
      }
      branchManagementSearchOpen = false;
      branchManagementSearchQuery = '';
      syncBranchManagementSearchUi();
      renderBranchList();
    }

    if (!window.__medisaBranchManagementSearchOutsideCloseBound) {
      window.__medisaBranchManagementSearchOutsideCloseBound = true;
      document.addEventListener('pointerdown', onBranchManagementSearchOutsidePointerDown, true);
    }

    // Modal Kontrolü (Form)
    window.openBranchFormModal = function openBranchFormModal(editId = null) {
      const modal = document.getElementById('branch-form-modal');
      if (!modal) return;

      const form = $('#branch-form', modal);
      const idInput = $('#branch-id', modal);
      const nameInput = $('#branch-name', modal);
      const cityInput = $('#branch-city', modal);
      const title = $('.modal-header h2', modal);
      const deleteBtn = $('#branch-delete-btn', modal);

      // Form temizle
      if (form) form.reset();
      if (idInput) idInput.value = '';

      if (editId) {
        // DÜZENLEME MODU
        const branches = readBranches();
        const branch = branches.find(b => b.id === editId);
        if (branch) {
          if (idInput) idInput.value = branch.id;
          if (nameInput) nameInput.value = branch.name;
          if (cityInput) cityInput.value = branch.city || '';
          if (title) title.textContent = 'Şube Düzenle';
        }
        // Sil butonunu göster
        if (deleteBtn) {
          deleteBtn.classList.remove('u-hidden');
          deleteBtn.style.display = 'flex';
        }
      } else {
        // Yeni EKLEME MODU
        if (title) title.textContent = 'Yeni Şube Ekle';
        // Sil butonunu gizle
        if (deleteBtn) {
          deleteBtn.classList.add('u-hidden');
          deleteBtn.style.display = 'none';
        }
      }

      // Modalı aç
      modal.style.display = 'flex';
      requestAnimationFrame(() => modal.classList.add('active'));
      pushSettingsHistoryLayer('settings-branch-form');

      // Focus
      if (nameInput && shouldAutofocusSettingsForm()) {
        setTimeout(() => nameInput.focus(), 350);
      }
    };

    window.closeBranchFormModal = function closeBranchFormModal(options) {
      const modal = document.getElementById('branch-form-modal');
      if (!modal) return;
      if (typeof window.resetModalInputs === 'function') {
        window.resetModalInputs(modal);
      }
      const form = $('#branch-form', modal);
      if (form) form.reset();
      const deleteBtn = $('#branch-delete-btn', modal);
      if (deleteBtn) {
        deleteBtn.classList.add('u-hidden');
        deleteBtn.style.display = 'none';
      }
      modal.classList.remove('active');
      setTimeout(() => modal.style.display = 'none', 300);
      if (!settingsHistorySync && !(options && options.skipHistory)) {
        try { history.back(); } catch (e) {}
      }
    };

    // CRUD İşlemleri
    /**
     * Şube kaydını formdan okuyup appData üzerinden sunucuya kaydeder (Create/Update)
     *
     * Validasyon + Kaydetme akışı:
     * 1. Form alanlarını oku (id, name, city)
     * 2. Şube Adı validasyonu yap (zorunlu alan)
     * 3. ID varsa güncelleme, yoksa yeni ekleme modu
     * 4. appData'ya yaz ve sunucu kaydını bekle
     * 5. Form modalını kapat ve ana listeyi güncelle
     * 6. Kullanıcıya başarı mesajı göster
     *
     * Sunucu kaydı başarısız olursa modal açık kalır ve başarı mesajı gösterilmez.
     */
    window.saveBranch = async function saveBranch() {
      const modal = document.getElementById('branch-form-modal');
      if (!modal) return;
      const saveBtn = modal.querySelector('.universal-btn-save[onclick*="saveBranch"]') || modal.querySelector('.universal-btn-save');
      if (saveBtn && saveBtn.disabled) return;
      if (saveBtn) saveBtn.disabled = true;
      let previousBranches = null;
      try {
        const idInput = $('#branch-id', modal);
      const nameInput = $('#branch-name', modal);
      const cityInput = $('#branch-city', modal);

      const id = idInput ? idInput.value.trim() : '';
      const name = nameInput ? nameInput.value.trim() : '';
      const city = cityInput ? cityInput.value.trim() : '';

      // Validasyon
      if (!name) {
        alert('Şube Adı Giriniz.');
        if (nameInput) nameInput.focus();
        return;
      }

      previousBranches = cloneStorageState(readBranches());
      const branches = cloneStorageState(previousBranches);

      if (id) {
        // güncelleME
        const idx = branches.findIndex(b => b.id === id);
        if (idx !== -1) {
          branches[idx].name = name;
          branches[idx].city = city;
        }
      } else {
        // Yeni EKLEME
        const newBranch = {
          id: Date.now().toString(),
          name: name,
          city: city,
          createdAt: new Date().toISOString()
        };

        branches.push(newBranch);
      }

        const persisted = await writeBranches(branches);
        if (persisted !== true) {
          if (typeof window.replaceMedisaBranches === 'function') {
            window.replaceMedisaBranches(previousBranches, { reason: 'branch-save-rollback' });
          } else if (window.appData) {
            window.appData.branches = previousBranches;
          }
          renderBranchList();
          alert('Şube sunucuya kaydedilemedi. Lütfen tekrar deneyin.');
          return;
        }

        // Form modalını kapat
        closeBranchFormModal();

        // Ana modalı güncelle
        renderBranchList();

        alert(id ? 'Şube güncellendi.' : 'Şube Eklendi.');
      } catch (error) {
        if (previousBranches) {
          if (typeof window.replaceMedisaBranches === 'function') {
            window.replaceMedisaBranches(previousBranches, { reason: 'branch-save-error-rollback' });
          } else if (window.appData) {
            window.appData.branches = previousBranches;
          }
          renderBranchList();
        }
        alert('Şube kaydı sırasında bir hata Oluştu! Lütfen tekrar deneyin.');
      } finally {
        if (saveBtn) saveBtn.disabled = false;
      }
    };

    window.editBranch = function editBranch(id) {
      openBranchFormModal(id);
    };

    window.deleteBranch = async function deleteBranch(id) {
      if (!id) return; // ID yoksa işlem yapma

      // Taşıt kontrolü
      const vehicles = readVehicles();
      const vehicleCount = vehicles.filter(v => v.branchId === id).length;

      // Kullanıcı kontrolü (ŞUBEye atanmış Kullanıcılar)
      const users = readUsers();
      const userCount = users.filter(u => {
        const ids = (u.branchIds && u.branchIds.length) ? u.branchIds : (u.branchId ? [u.branchId] : []);
        return ids.some(function (bid) { return String(bid) === String(id); });
      }).length;

      if (vehicleCount > 0 || userCount > 0) {
        let msg = 'ŞUBEye ilişkin kayıtlı veri bulunduğundan silme yapılamaz!\n\n';
        if (vehicleCount > 0) msg += `• ${vehicleCount} Adet Taşıt\n`;
        if (userCount > 0) msg += `• ${userCount} Adet Kullanıcı\n`;
        alert(msg);
        return;
      }

      if (!confirm('Bu ŞUBEyi silmek istediğinizden emin misiniz?')) return;

      const branches = readBranches();
      const filtered = branches.filter(b => b.id !== id);
      try {
        const persisted = await writeBranches(filtered);
        if (persisted !== true) {
          if (typeof window.replaceMedisaBranches === 'function') {
            window.replaceMedisaBranches(branches, { reason: 'branch-delete-rollback' });
          } else if (window.appData) {
            window.appData.branches = branches;
          }
          renderBranchList();
          alert('Şube silme işlemi sunucuya kaydedilemedi. Lütfen tekrar deneyin.');
          return;
        }
      } catch (error) {
        if (typeof window.replaceMedisaBranches === 'function') {
          window.replaceMedisaBranches(branches, { reason: 'branch-delete-error-rollback' });
        } else if (window.appData) {
          window.appData.branches = branches;
        }
        renderBranchList();
        alert('Şube silinirken bir hata oluştu! Lütfen tekrar deneyin.');
        return;
      }

      // Form modalını kapat
      closeBranchFormModal();

      // Ana modalı güncelle
      renderBranchList();

      alert('Şube Silindi.');
    };

    // Liste Render
    window.renderBranchList = function renderBranchList() {
      const container = document.getElementById('branch-list');
      if (!container) return;

      const branches = readBranches();
      const vehicles = readVehicles();
      const normalizedQuery = normalizeUserManagementSearchText(branchManagementSearchQuery);

      if (branches.length === 0) {
        container.innerHTML = `
          <div style="text-align:center; padding:20px; color:var(--muted);">
            henüz şube eklenmemiş.
          </div>
        `;
        return;
      }

      const filteredBranches = normalizedQuery
        ? branches.filter(function(branch) {
            const haystack = normalizeUserManagementSearchText([
              branch.name || '',
              branch.city || ''
            ].join(' '));
            return haystack.includes(normalizedQuery);
          })
        : branches;

      if (filteredBranches.length === 0) {
        container.innerHTML = `
          <div style="text-align:center; padding:20px; color:var(--muted);">
            arama sonucu bulunamadı.
          </div>
        `;
        return;
      }

      const rows = filteredBranches.map(branch => {
        const vehicleCount = vehicles.filter(v => v.branchId === branch.id).length;
        const branchName = String(branch.name || '');
        const longestWordLength = branchName.split(/\s+/).reduce((maxLen, part) => Math.max(maxLen, part.length), 0);
        const titleClass = longestWordLength >= 9 ? 'settings-card-title settings-card-title--compact' : 'settings-card-title';
        return `
          <div class="settings-card" onclick="editBranch('${branch.id}')" style="cursor:pointer;">
            <div class="settings-card-content">
              <div class="${titleClass}">${escapeHtml(branch.name)}</div>
              <div class="settings-card-count">${vehicleCount} Taşıt</div>
            </div>
          </div>
        `;
      }).join('');

      container.innerHTML = rows;
    }

    // ========================================
    // KULLANICI YÖNETİMİ
    // ========================================

    function readUsers() {
      if (typeof window.getMedisaUsers === 'function') {
        var result = window.getMedisaUsers();
        return Array.isArray(result) ? result.slice() : [];
      }
      if (window.appData && Array.isArray(window.appData.users)) {
        var users = window.appData.users.slice();
        return (typeof window.normalizeUsers === 'function' ? window.normalizeUsers(users) : users);
      }
      return [];
    }

    function readAllUsers() {
      if (window.appData && Array.isArray(window.appData.users)) {
        const allUsers = window.appData.users.slice();
        return (typeof window.normalizeUsers === 'function' ? window.normalizeUsers(allUsers) : allUsers);
      }
      return [];
    }

    function readAllVehicles() {
      if (window.appData && Array.isArray(window.appData.tasitlar)) {
        return window.appData.tasitlar.slice();
      }
      return [];
    }

    function readAllBranches() {
      if (window.appData && Array.isArray(window.appData.branches)) {
        return window.appData.branches.slice();
      }
      return [];
    }

    /**
     * Kullanıcı listesini appData.users formatına dönüştürüp senkron eder.
     * Portal girişi (`driver_login.php`) ve raporlar tek kaynaktan (appData) okur.
     * zimmetli_araclar: portal kayıt akışı (`driver_save.php`) için atanmış Taşıt ID'leri (assignedUserId eşleşen Taşıtlar)
     */
    function getRoleConfigFromSelection(role) {
      const selectedRole = role || 'kullanici';
      if (selectedRole === 'sube_yonetici' || selectedRole === 'yonetici') {
        return { role: 'sube_yonetici' };
      }
      if (selectedRole === 'genel_yonetici' || selectedRole === 'admin') {
        return { role: 'genel_yonetici' };
      }
      return { role: 'kullanici' };
    }

    function getUiRoleFromUser(user) {
      return window.medisaGetUiRoleFromUser(user);
    }

    function normalizePhoneDigits(value) {
      return String(value == null ? '' : value).replace(/\D/g, '');
    }

    /** Türk GSM: yalnız gösterim (0555 000 00 02) */
    function formatTrGsmDisplay(value) {
      const d = normalizePhoneDigits(value);
      if (d.length === 11 && d.charAt(0) === '0') {
        return d.slice(0, 4) + ' ' + d.slice(4, 7) + ' ' + d.slice(7, 9) + ' ' + d.slice(9, 11);
      }
      if (d.length === 10 && d.charAt(0) === '5') {
        return '0' + d.slice(0, 3) + ' ' + d.slice(3, 6) + ' ' + d.slice(6, 8) + ' ' + d.slice(8, 10);
      }
      return String(value == null ? '' : value).trim() || '';
    }

    function getUserRoleLabel(user) {
      return window.getUserRoleLabelManagement(user);
    }

    function buildUserRoleLabelMarkup(user, branchName) {
      const roleLabel = getUserRoleLabel(user);
      const branchDisplay = branchName != null && String(branchName).trim() !== '' ? String(branchName).trim() : '-';
      return (
        '<div class="settings-card-gorev settings-card-gorev--stacked">' +
        '<span class="settings-card-gorev-line">' + escapeHtml(roleLabel) + '</span>' +
        '<span class="settings-card-gorev-line settings-card-gorev-line--branch">' + escapeHtml(branchDisplay) + '</span>' +
        '</div>'
      );
    }

    const USER_MANAGEMENT_ROLE_SORT_ORDER = {
      genel_yonetici: 0,
      sube_yonetici: 1,
      kullanici: 2
    };

    function getUserManagementRoleSortRank(user) {
      const role = getUiRoleFromUser(user);
      if (Object.prototype.hasOwnProperty.call(USER_MANAGEMENT_ROLE_SORT_ORDER, role)) {
        return USER_MANAGEMENT_ROLE_SORT_ORDER[role];
      }
      return 99;
    }

    function getUserManagementSortableName(user) {
      const rawName = String((user && (user.name || user.isim)) || '').trim();
      const formatted = formatUserFullName(rawName);
      return formatted || rawName || 'İsimsiz';
    }

    function compareUserManagementListOrder(a, b) {
      const roleDiff = getUserManagementRoleSortRank(a) - getUserManagementRoleSortRank(b);
      if (roleDiff !== 0) return roleDiff;

      const nameCompare = getUserManagementSortableName(a).localeCompare(
        getUserManagementSortableName(b),
        'tr',
        { sensitivity: 'base', numeric: true }
      );
      if (nameCompare !== 0) return nameCompare;

      return String((a && a.id) || '').localeCompare(
        String((b && b.id) || ''),
        'tr',
        { sensitivity: 'base', numeric: true }
      );
    }

    const USER_FORM_ROLE_OPTIONS = [
      { value: 'kullanici', label: 'Kullan\u0131c\u0131' },
      { value: 'sube_yonetici', label: 'Y\u00f6netici' },
      { value: 'genel_yonetici', label: 'Genel Y\u00f6netici' }
    ];

    function getUserBranchIdsForManagement(user) {
      const ids = Array.isArray(user && user.branchIds) && user.branchIds.length
        ? user.branchIds
        : ((user && user.branchId) ? [user.branchId] : []);
      return ids.map(function(branchId) { return String(branchId || '').trim(); }).filter(Boolean);
    }

    function getUserPrimaryBranchId(user) {
      const branchIds = getUserBranchIdsForManagement(user);
      return branchIds.length ? branchIds[0] : '';
    }

    function isWithinUserManagementBranch(branchId, scope) {
      const effectiveScope = scope || getUserManagementSessionScope();
      if (!effectiveScope.isBranchManager) return true;
      const allowed = Array.isArray(effectiveScope.branchIds) ? effectiveScope.branchIds : [];
      if (!allowed.length) return false;
      return allowed.some(function(allowedId) { return String(allowedId) === String(branchId || ''); });
    }

    function resolveBranchIdForUserManagementSave(scope, requestedBranchId, existingUser) {
      const effectiveScope = scope || getUserManagementSessionScope();
      if (!effectiveScope.isBranchManager) {
        return String(requestedBranchId || '').trim();
      }
      const requested = String(requestedBranchId || '').trim();
      if (requested && isWithinUserManagementBranch(requested, effectiveScope)) {
        return requested;
      }
      if (existingUser) {
        const existingPrimary = getUserPrimaryBranchId(existingUser);
        if (existingPrimary && isWithinUserManagementBranch(existingPrimary, effectiveScope)) {
          return existingPrimary;
        }
      }
      return String(effectiveScope.primaryBranchId || '').trim();
    }

    function resolveBranchIdsForUserManagementSave(scope, branchId, existingUser) {
      const effectiveScope = scope || getUserManagementSessionScope();
      const nextPrimary = String(branchId || '').trim();
      if (
        existingUser
        && nextPrimary
        && String(getUserPrimaryBranchId(existingUser)) === nextPrimary
      ) {
        const existingIds = getUserBranchIdsForManagement(existingUser);
        if (
          existingIds.length > 1
          && existingIds.every(function(id) {
            return !effectiveScope.isBranchManager || isWithinUserManagementBranch(id, effectiveScope);
          })
        ) {
          return existingIds.slice();
        }
      }
      return nextPrimary ? [nextPrimary] : [];
    }

    function getUserManagementSessionScope() {
      const sessionData = typeof window.getMedisaSession === 'function'
        ? (window.getMedisaSession() || {})
        : (window.medisaSession || {});
      let role = String(sessionData.role || (sessionData.user && sessionData.user.role) || '').trim();
      if (role === 'admin') role = 'genel_yonetici';
      if (role === 'yonetici' || role === 'yonetici_kullanici') role = 'sube_yonetici';
      const branchIds = Array.isArray(sessionData.branch_ids) && sessionData.branch_ids.length
        ? sessionData.branch_ids.map(function(branchId) { return String(branchId || '').trim(); }).filter(Boolean)
        : (
            sessionData.user && Array.isArray(sessionData.user.branch_ids)
              ? sessionData.user.branch_ids.map(function(branchId) { return String(branchId || '').trim(); }).filter(Boolean)
              : []
          );
      const isBranchManager = role === 'sube_yonetici';
      const sessionUserId = String(
        (sessionData.user && sessionData.user.id) || sessionData.user_id || ''
      );
      return {
        session: sessionData,
        role: role,
        branchIds: branchIds,
        primaryBranchId: branchIds[0] || '',
        isBranchManager: isBranchManager,
        isGeneralManager: role === 'genel_yonetici',
        sessionUserId: sessionUserId
      };
    }

    function isUserActiveForManagement(user) {
      if (!user) return false;
      if (user.aktif === false || user.aktif === 0 || user.aktif === '0') return false;
      if (user.isActive === false || user.isActive === 0 || user.isActive === '0') return false;
      const status = String(user.durum || user.status || '').trim().toLocaleLowerCase('tr-TR');
      if (status === 'pasif' || status === 'inactive' || status === 'disabled') return false;
      return true;
    }

    function isActiveGeneralManagerUser(user) {
      return !!user && getUiRoleFromUser(user) === 'genel_yonetici' && isUserActiveForManagement(user);
    }

    function countActiveGeneralManagers(users) {
      const list = Array.isArray(users) ? users : readAllUsers();
      let count = 0;
      for (let i = 0; i < list.length; i++) {
        if (isActiveGeneralManagerUser(list[i])) count++;
      }
      return count;
    }

    function isSessionSelfUser(user, scope) {
      const effectiveScope = scope || getUserManagementSessionScope();
      const sessionUserId = String(effectiveScope.sessionUserId || '');
      return !!(sessionUserId && user && String(user.id || '') === sessionUserId);
    }

    /** Self GM veya sistemdeki tek aktif GM — silme/rol düşürme/pasif UI kilitleri. */
    function isProtectedGeneralManagerTarget(user, scope) {
      if (!isActiveGeneralManagerUser(user)) return false;
      const effectiveScope = scope || getUserManagementSessionScope();
      if (isSessionSelfUser(user, effectiveScope)) return true;
      return countActiveGeneralManagers() <= 1;
    }

    function isUserManageableInUserManagement(user, scope) {
      if (!user) return false;
      const effectiveScope = scope || getUserManagementSessionScope();
      if (!effectiveScope.isBranchManager) return true;
      const sessionUserId = String(effectiveScope.sessionUserId || '');
      if (sessionUserId && String(user.id || '') === sessionUserId) return false;
      if (getUiRoleFromUser(user) !== 'kullanici') return false;
      const branchIds = getUserBranchIdsForManagement(user);
      if (branchIds.length === 0) return false;
      const allowed = Array.isArray(effectiveScope.branchIds) ? effectiveScope.branchIds : [];
      if (!allowed.length) return false;
      return branchIds.every(function(branchId) {
        return allowed.some(function(allowedId) { return String(allowedId) === String(branchId); });
      });
    }

    function getScopedUsersForUserManagement(users, scope) {
      const effectiveScope = scope || getUserManagementSessionScope();
      const list = Array.isArray(users) ? users.slice() : [];
      if (!effectiveScope.isBranchManager) return list;
      return list.filter(function(user) { return isUserManageableInUserManagement(user, effectiveScope); });
    }

    function getManagedBranchForUserManagement(scope) {
      const effectiveScope = scope || getUserManagementSessionScope();
      if (!effectiveScope.primaryBranchId) return null;
      const branches = readAllBranches();
      return branches.find(function(branch) {
        return String(branch && branch.id) === String(effectiveScope.primaryBranchId);
      }) || null;
    }

    function populateUserRoleOptions(scope, selectedValue, options) {
      const roleSelect = document.getElementById('user-role');
      if (!roleSelect) return;
      const effectiveScope = scope || getUserManagementSessionScope();
      const opts = options && typeof options === 'object' ? options : {};
      const lockToGeneralManager = opts.lockToGeneralManager === true;
      let roleOptions = effectiveScope.isBranchManager
        ? USER_FORM_ROLE_OPTIONS.filter(function(option) { return option.value === 'kullanici'; })
        : USER_FORM_ROLE_OPTIONS.slice();
      if (lockToGeneralManager) {
        roleOptions = USER_FORM_ROLE_OPTIONS.filter(function(option) { return option.value === 'genel_yonetici'; });
      }
      roleSelect.innerHTML = roleOptions.map(function(option) {
        return `<option value="${option.value}">${option.label}</option>`;
      }).join('');
      const preferred = lockToGeneralManager ? 'genel_yonetici' : selectedValue;
      const safeValue = roleOptions.some(function(option) { return option.value === preferred; })
        ? preferred
        : roleOptions[0].value;
      roleSelect.value = safeValue;
      if (lockToGeneralManager) {
        roleSelect.setAttribute('disabled', 'disabled');
        roleSelect.setAttribute('aria-disabled', 'true');
        roleSelect.title = 'Sistemde en az bir aktif genel yönetici bulunmalıdır.';
      } else {
        roleSelect.removeAttribute('disabled');
        roleSelect.removeAttribute('aria-disabled');
        roleSelect.removeAttribute('title');
      }
      syncUserFormCustomSelects(document.getElementById('user-form-modal'));
    }

    function syncUsersToAppData(arr, options) {
      if (!window.appData) return;
      const list = arr != null ? arr : readAllUsers();
      const vehicles = readAllVehicles();
      const nextUsers = list.map(u => {
        const zimmetliAraclar = vehicles
          .filter(v => (v.assignedUserId != null && String(v.assignedUserId) === String(u.id)))
          .map(v => (typeof v.id === 'number' ? v.id : Number(v.id)) || v.id);
        const roleConfig = getRoleConfigFromSelection(getUiRoleFromUser(u));
        const rol = roleConfig.role;
        const hasVehicle = zimmetliAraclar.length > 0;
        const kullaniciPaneli = hasVehicle;
        const primaryBranchId = u.branchId != null && u.branchId !== ''
          ? String(u.branchId)
          : (
              Array.isArray(u.branchIds) && u.branchIds.length
                ? String(u.branchIds[0])
                : ''
            );
        const branchIds = primaryBranchId ? [primaryBranchId] : [];
        const subeIds = branchIds.map(function (id) {
          return id !== '' && !isNaN(Number(id)) ? Number(id) : id;
        });
        const firstSube = branchIds[0];
        const sube_id = firstSube !== undefined && firstSube !== ''
          ? (!isNaN(Number(firstSube)) ? Number(firstSube) : firstSube)
          : undefined;
        return {
          id: u.id,
          isim: u.name || u.isim || '',
          kullanici_adi: u.kullanici_adi || '',
          telefon: u.phone || '',
          email: u.email || '',
          sube_id: sube_id,
          sube_ids: subeIds,
          rol: rol,
          tip: rol === 'genel_yonetici' ? 'admin' : (rol === 'sube_yonetici' ? 'yonetici' : 'kullanici'),
          kullanici_paneli: kullaniciPaneli,
          surucu_paneli: kullaniciPaneli,
          zimmetli_araclar: zimmetliAraclar,
          aktif: u.aktif !== false,
          kayit_tarihi: u.createdAt || new Date().toISOString(),
          son_giris: u.son_giris || null,
          portal_sifresi_var: u.portal_sifresi_var === true
        };
      });
      if (typeof window.replaceMedisaUsers === 'function') {
        window.replaceMedisaUsers(nextUsers, { reason: 'ayarlar-sync-users' });
      } else if (typeof window.replaceMedisaCollection === 'function') {
        window.replaceMedisaCollection('users', nextUsers, { reason: 'ayarlar-sync-users' });
      } else {
        window.appData.users = nextUsers;
      }
      if (!(options && options.skipServerSave === true) && window.saveDataToServer) {
        window.saveDataToServer().catch(err => {
          console.error('Sunucuya kaydetme hatası (sessiz):', err);
        });
      }
    }

    function writeUsers(arr) {
      if (!window.appData) return Promise.resolve(false);
      syncUsersToAppData(arr, { skipServerSave: true });
      if (typeof window.writeUsers === 'function') {
        return window.writeUsers(window.appData.users);
      }
      return Promise.resolve(false);
    }

    function cloneStorageState(arr) {
      try {
        return JSON.parse(JSON.stringify(Array.isArray(arr) ? arr : []));
      } catch (e) {
        return Array.isArray(arr) ? arr.slice() : [];
      }
    }

    function setUserManagementLocalState(users, vehicles) {
      if (!window.appData) return;
      if (typeof window.replaceMedisaVehicles === 'function') {
        window.replaceMedisaVehicles(Array.isArray(vehicles) ? vehicles : [], { reason: 'ayarlar-user-mgmt-local' });
      } else if (typeof window.replaceMedisaCollection === 'function') {
        window.replaceMedisaCollection('vehicles', Array.isArray(vehicles) ? vehicles : [], { reason: 'ayarlar-user-mgmt-local' });
      } else {
        window.appData.tasitlar = Array.isArray(vehicles) ? vehicles : [];
      }
      syncUsersToAppData(Array.isArray(users) ? users : [], { skipServerSave: true });
    }

    async function persistUserManagementState(users, vehicles, saveOptions) {
      setUserManagementLocalState(users, vehicles);
      if (typeof window.saveDataToServer === 'function') {
        return await window.saveDataToServer(saveOptions || {});
      }
      return true;
    }

    function isUserManagementSaveConflict(err) {
      return !!(err && (err.conflict === true || String(err.message || '') === 'Conflict'));
    }

    async function refreshUserManagementAfterSaveConflict(previousUsers, previousVehicles) {
      let reloadOk = false;
      if (typeof window.loadDataFromServer === 'function') {
        try {
          await window.loadDataFromServer(true);
          reloadOk = true;
        } catch (reloadErr) {
          console.warn('[Medisa] Çakışma sonrası sunucu yenileme başarısız', reloadErr && reloadErr.message);
        }
      }
      if (reloadOk && window.appData) {
        setUserManagementLocalState(readAllUsers(), readAllVehicles());
      } else {
        setUserManagementLocalState(previousUsers, previousVehicles);
      }
      if (typeof window.renderUserList === 'function') {
        window.renderUserList();
      }
      if (typeof window.onMedisaConflict === 'function') {
        try {
          window.onMedisaConflict();
        } catch (hookErr) {}
      }
      return reloadOk;
    }

    function buildUserSaveConflictAlertMessage(err) {
      const serverMsg = err && err.medisaServerMessage ? String(err.medisaServerMessage).trim() : '';
      const tail = 'Güncel liste yüklendi; aynı işlemi bir kez daha kaydedebilirsiniz.';
      if (serverMsg) return serverMsg + '\n\n' + tail;
      return 'Taşıt veya liste sunucuda güncellenmişti.\n\n' + tail;
    }

    // Modal Kontrolü (Ana Liste)
    window.openUserManagement = function openUserManagement() {
      closeSettingsDropdown();
      const modal = document.getElementById('user-modal');
      if (!modal) return;

      userManagementSearchQuery = '';
      userManagementSearchOpen = false;
      // Listeyi render et
      renderUserList();

      // Modalı aç
      modal.style.display = 'flex';
      requestAnimationFrame(() => {
        modal.classList.add('active');
        syncUserManagementSearchUi();
        bindUserManagementKeyboardHandlers();
        clearUserManagementKeyboardOffset();
      });
      pushSettingsHistoryLayer('settings-user');
    };

    window.closeUserManagement = function closeUserManagement(options) {
      const modal = document.getElementById('user-modal');
      if (!modal) return;
      userManagementSearchQuery = '';
      userManagementSearchOpen = false;
      syncUserManagementSearchUi();
      clearUserManagementKeyboardOffset();
      modal.classList.remove('active');
      closeSettingsDropdown();
      setTimeout(() => modal.style.display = 'none', 300);
      if (!settingsHistorySync && !(options && options.skipHistory)) {
        resetToHomeFromPanel();
      }
    };

    let userManagementSearchQuery = '';
    let userManagementSearchOpen = false;
    let userManagementKeyboardBound = false;

    function isUserManagementKeyboardAwareContext() {
      const hasMatchMedia = typeof window.matchMedia === 'function';
      const isMobile = hasMatchMedia ? window.matchMedia('(max-width: 640px)').matches : (window.innerWidth <= 640);
      if (!isMobile) return false;
      const ua = navigator.userAgent || '';
      const isiOS = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      const isWebKit = /WebKit/i.test(ua);
      const isTouch = (navigator.maxTouchPoints || 0) > 0;
      return !!(isiOS || (isWebKit && isTouch));
    }

    function clearUserManagementKeyboardOffset() {
      const body = document.querySelector('#user-modal .modal-body');
      if (!body) return;
      body.classList.remove('user-management-keyboard-open');
      body.style.removeProperty('--user-modal-keyboard-offset');
    }

    function applyUserManagementKeyboardOffset() {
      const modal = document.getElementById('user-modal');
      const input = document.getElementById('user-management-search-input');
      const body = modal ? modal.querySelector('.modal-body') : null;
      if (!modal || !body || !input) return;
      if (!modal.classList.contains('active')) {
        clearUserManagementKeyboardOffset();
        return;
      }
      if (document.activeElement !== input) {
        clearUserManagementKeyboardOffset();
        return;
      }
      if (!isUserManagementKeyboardAwareContext()) {
        clearUserManagementKeyboardOffset();
        return;
      }

      const vv = window.visualViewport;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
      const vvHeight = vv && typeof vv.height === 'number' ? vv.height : viewportHeight;
      const keyboardRaw = Math.max(0, Math.round(viewportHeight - vvHeight));
      const keyboardOffset = keyboardRaw > 60 ? Math.max(220, Math.min(420, keyboardRaw + 24)) : 0;

      if (keyboardOffset > 0) {
        body.classList.add('user-management-keyboard-open');
        body.style.setProperty('--user-modal-keyboard-offset', keyboardOffset + 'px');
      } else {
        clearUserManagementKeyboardOffset();
      }
    }

    function bindUserManagementKeyboardHandlers() {
      if (userManagementKeyboardBound) return;
      const input = document.getElementById('user-management-search-input');
      if (!input) return;
      userManagementKeyboardBound = true;

      const onFocus = function() {
        requestAnimationFrame(function() {
          applyUserManagementKeyboardOffset();
        });
      };
      const onBlur = function() {
        clearUserManagementKeyboardOffset();
      };
      const onViewportResize = function() {
        const modal = document.getElementById('user-modal');
        if (!modal || !modal.classList.contains('active')) return;
        if (document.activeElement !== input) return;
        applyUserManagementKeyboardOffset();
      };

      input.addEventListener('focus', onFocus);
      input.addEventListener('blur', onBlur);
      if (window.visualViewport && typeof window.visualViewport.addEventListener === 'function') {
        window.visualViewport.addEventListener('resize', onViewportResize);
      }
      window.addEventListener('resize', onViewportResize);
    }

    function normalizeUserManagementSearchText(value) {
      return String(value || '')
        .toLocaleLowerCase('tr-TR')
        .replace(/ı/g, 'i')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
    }

    function focusUserManagementSearchInput(input, options = {}) {
      if (!input) return;
      try {
        input.focus({ preventScroll: true });
      } catch (e) {
        input.focus();
      }
      if (options.select === true && !isUserManagementKeyboardAwareContext() && typeof input.select === 'function') {
        input.select();
      }
      requestAnimationFrame(function() {
        applyUserManagementKeyboardOffset();
      });
    }

    function syncUserManagementSearchUi(options = {}) {
      const wrap = document.getElementById('user-management-search-wrap');
      const input = document.getElementById('user-management-search-input');
      const toggle = document.getElementById('user-management-search-toggle');
      if (!wrap || !input || !toggle) return;

      wrap.classList.toggle('open', !!userManagementSearchOpen);
      input.value = userManagementSearchQuery;
      toggle.setAttribute('aria-expanded', userManagementSearchOpen ? 'true' : 'false');

      if (userManagementSearchOpen && options.focus === true) {
        focusUserManagementSearchInput(input, { select: true });
        setTimeout(() => {
          if (document.activeElement !== input) {
            focusUserManagementSearchInput(input, { select: true });
          }
        }, 30);
      } else if (!userManagementSearchOpen && document.activeElement === input) {
        input.blur();
      }
    }

    window.toggleUserManagementSearch = function toggleUserManagementSearch(forceOpen) {
      const nextOpen = typeof forceOpen === 'boolean' ? forceOpen : !userManagementSearchOpen;

      if (!nextOpen) {
        userManagementSearchOpen = false;
        userManagementSearchQuery = '';
        syncUserManagementSearchUi();
        renderUserList();
        return;
      }

      userManagementSearchOpen = true;
      syncUserManagementSearchUi({ focus: true });
    };

    window.setUserManagementSearch = function setUserManagementSearch(value) {
      userManagementSearchQuery = String(value || '');
      userManagementSearchOpen = true;
      syncUserManagementSearchUi();
      renderUserList();
    };

    function onUserManagementSearchOutsidePointerDown(e) {
      if (typeof window.innerWidth === 'number' && window.innerWidth > 640) return;
      const modal = document.getElementById('user-modal');
      if (!modal || !modal.classList.contains('active')) return;
      if (!userManagementSearchOpen) return;
      const wrap = document.getElementById('user-management-search-wrap');
      if (!wrap || wrap.contains(e.target)) return;
      if (e.target && e.target.closest && e.target.closest('#user-list .settings-card')) {
        const input = document.getElementById('user-management-search-input');
        if (input && document.activeElement === input) input.blur();
        return;
      }
      userManagementSearchOpen = false;
      userManagementSearchQuery = '';
      syncUserManagementSearchUi();
      renderUserList();
    }

    if (!window.__medisaUserManagementSearchOutsideCloseBound) {
      window.__medisaUserManagementSearchOutsideCloseBound = true;
      document.addEventListener('pointerdown', onUserManagementSearchOutsidePointerDown, true);
    }

    /** Plaka/marka araması: tasitlar.js vehicleMatchesSearchQuery ile aynı hizada (NFKC, tire/nokta, formatPlaka). */
    function medisaNormalizeUserVehicleSearchString(str) {
      var s = String(str == null ? '' : str);
      if (typeof s.normalize === 'function') {
        try {
          s = s.normalize('NFKC');
        } catch (e) { /* yoksay */ }
      }
      return s;
    }

    function userFormVehicleMatchesSearch(v, qRaw) {
      var qTrim = String(qRaw || '').trim();
      if (!qTrim) return true;
      var qNorm = medisaNormalizeUserVehicleSearchString(qTrim);
      var qLower = qNorm.toLocaleLowerCase('tr-TR');
      var qCompact = qLower.replace(/[\s\-_.]+/g, '');

      var plakaStr = v.plate || v.plaka || '';
      var pNorm = medisaNormalizeUserVehicleSearchString(plakaStr);
      var pLower = pNorm.toLocaleLowerCase('tr-TR');
      var pCompact = pLower.replace(/[\s\-_.]+/g, '');

      if (qCompact && pCompact.indexOf(qCompact) !== -1) return true;
      if (qLower && pLower.indexOf(qLower) !== -1) return true;

      if (typeof window.formatPlaka === 'function' && qCompact) {
        var fmt = window.formatPlaka(pNorm);
        if (fmt && fmt !== '-') {
          var fCompact = medisaNormalizeUserVehicleSearchString(String(fmt))
            .toLocaleLowerCase('tr-TR')
            .replace(/[\s\-_.]+/g, '');
          if (fCompact.indexOf(qCompact) !== -1) return true;
        }
      }

      var rawMm = (v.brandModel || (v.brand || v.marka || '') + ' ' + (v.model || '')).trim();
      var markaModel = (typeof window.formatBrandModel === 'function' ? window.formatBrandModel(rawMm) : (typeof window.toTitleCase === 'function' ? window.toTitleCase(rawMm) : rawMm));
      var brandHay = String(markaModel || '').toLocaleLowerCase('tr-TR');
      if (qLower && brandHay.indexOf(qLower) !== -1) return true;

      if (v.year != null && String(v.year).indexOf(qLower) !== -1) return true;
      var tks = v.tahsisKisi;
      if (tks && medisaNormalizeUserVehicleSearchString(String(tks)).toLocaleLowerCase('tr-TR').indexOf(qLower) !== -1) return true;

      return false;
    }

    function userVehiclesTypeaheadIsTextualFormInput(el) {
      if (!el || el.tagName !== 'INPUT') return false;
      var type = String(el.type || '').toLowerCase();
      if (el.id === 'user-vehicles-search') return false;
      return type === 'text' || type === 'email' || type === 'tel' || type === 'password' || type === 'search' || type === 'url' || type === 'number';
    }

    function onUserVehiclesGlobalTypeaheadKeydown(ev) {
      if (ev.isComposing) return;
      var dropdown = document.getElementById('user-vehicles-dropdown');
      if (!dropdown || dropdown.style.display === 'none') return;
      var modal = document.getElementById('user-form-modal');
      if (!modal || !modal.classList.contains('active')) return;

      var searchInput = document.getElementById('user-vehicles-search');
      if (!searchInput) return;
      if (document.activeElement === searchInput) return;

      var ae = document.activeElement;
      if (ae && modal.contains(ae)) {
        if (ae.tagName === 'TEXTAREA') return;
        if (ae.tagName === 'SELECT') return;
        if (userVehiclesTypeaheadIsTextualFormInput(ae)) return;
      }

      var trigger = document.getElementById('user-vehicles-trigger');
      var inDropdown = ae && ae.closest && ae.closest('#user-vehicles-dropdown');
      if (!inDropdown && ae !== trigger) return;

      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;

      if (ev.key === 'Backspace') {
        ev.preventDefault();
        searchInput.focus();
        var valBs = searchInput.value;
        var cut = valBs.slice(0, -1);
        searchInput.value = cut;
        if (window.handleUserVehiclesSearch) window.handleUserVehiclesSearch(cut);
        setTimeout(function() {
          try {
            searchInput.setSelectionRange(cut.length, cut.length);
          } catch (e2) { /* yoksay */ }
        }, 0);
        return;
      }

      var k = ev.key;
      if (k.length !== 1) return;
      var code = k.charCodeAt(0);
      if (code < 32 || code === 127) return;

      ev.preventDefault();
      searchInput.focus();
      var val = searchInput.value;
      var next = val + k;
      searchInput.value = next;
      if (window.handleUserVehiclesSearch) window.handleUserVehiclesSearch(next);
      setTimeout(function() {
        try {
          searchInput.setSelectionRange(next.length, next.length);
        } catch (e2) { /* yoksay */ }
      }, 0);
    }

    if (!window.__medisaUserVehiclesTypeaheadKeyBound) {
      window.__medisaUserVehiclesTypeaheadKeyBound = true;
      document.addEventListener('keydown', onUserVehiclesGlobalTypeaheadKeydown, true);
    }

    // Kullanıcı formu: atanmış Taşıtlar checkbox listesi doldur (arama + filtreleme)
    function populateUserVehiclesMulti(searchFilter = '') {
      const container = document.getElementById('user-vehicles-container');
      if (!container) return;
      const scope = getUserManagementSessionScope();
      const assignedIds = getUserFormSelectedVehicleIds();
      const vehicles = readVehicles();
      let activeVehicles = vehicles.filter(v => v.satildiMi !== true);
      if (scope.isBranchManager) {
        activeVehicles = activeVehicles.filter(v => isWithinUserManagementBranch(v && v.branchId, scope));
      }
      const qRaw = (searchFilter || '').trim();
      if (qRaw) {
        activeVehicles = activeVehicles.filter(v => userFormVehicleMatchesSearch(v, qRaw));
      }
      const assignedSet = new Set(assignedIds.map(String));
      function userVehiclePlateSortKey(v) {
        const plakaStr = v.plate || v.plaka || '';
        return String(plakaStr).replace(/\s+/g, '').toLocaleLowerCase('tr-TR');
      }
      activeVehicles.sort(function(a, b) {
        const aid = String(a.id);
        const bid = String(b.id);
        const aSel = assignedSet.has(aid);
        const bSel = assignedSet.has(bid);
        if (aSel !== bSel) return aSel ? -1 : 1;
        return userVehiclePlateSortKey(a).localeCompare(userVehiclePlateSortKey(b), 'tr-TR');
      });
      container.innerHTML = '';
      activeVehicles.forEach(v => {
        const vid = String(v.id);
        const plaka = v.plate || v.plaka || '';
        const raw = (v.brandModel || (v.brand || v.marka || '') + ' ' + (v.model || '')).trim();
        const markaModel = (typeof window.formatBrandModel === 'function' ? window.formatBrandModel(raw) : (typeof window.toTitleCase === 'function' ? window.toTitleCase(raw) : raw));
        const labelEl = document.createElement('label');
        labelEl.className = 'user-vehicle-row';
        labelEl.style.userSelect = 'none';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = vid;
        cb.name = 'user-vehicle';
        cb.checked = assignedIds.indexOf(vid) !== -1;
        cb.addEventListener('change', function() {
          const nextSelectedIds = new Set(getUserFormSelectedVehicleIds());
          if (cb.checked) nextSelectedIds.add(vid);
          else nextSelectedIds.delete(vid);
          setUserFormSelectedVehicleIds(Array.from(nextSelectedIds));
          updateUserVehiclesTriggerText();
        });
        const plateSpan = document.createElement('span');
        plateSpan.className = 'user-vehicle-plate';
        plateSpan.textContent = plaka;
        const sepSpan = document.createElement('span');
        sepSpan.className = 'user-vehicle-sep';
        sepSpan.textContent = markaModel ? ' - ' : '';
        const brandSpan = document.createElement('span');
        brandSpan.className = 'user-vehicle-brand';
        brandSpan.textContent = markaModel || '';
        const labelWrap = document.createElement('span');
        labelWrap.className = 'user-vehicle-label';
        labelWrap.appendChild(plateSpan);
        labelWrap.appendChild(sepSpan);
        labelWrap.appendChild(brandSpan);
        labelEl.appendChild(cb);
        labelEl.appendChild(labelWrap);
        container.appendChild(labelEl);
      });
      updateUserVehiclesTriggerText();
    }

    var handleUserVehiclesSearchImpl = function(value) {
      populateUserVehiclesMulti(value);
    };
    window.handleUserVehiclesSearch = (typeof window.debounce === 'function') ? window.debounce(handleUserVehiclesSearchImpl, 200) : handleUserVehiclesSearchImpl;

    function updateUserVehiclesTriggerText() {
      const trigger = document.getElementById('user-vehicles-trigger');
      if (!trigger) return;
      const n = getUserFormSelectedVehicleIds().length;
      const textEl = trigger.querySelector('.user-vehicles-trigger-text');
      if (textEl) textEl.textContent = n === 0 ? 'Taşıt Seçin' : (n === 1 ? '1 Taşıt Seçildi' : n + ' Taşıt Seçildi');
    }

    function isUserVehiclesDropdownOpen(dropdown) {
      return !!dropdown && dropdown.style.display !== 'none';
    }

    function openUserVehiclesDropdown(options) {
      const opts = options || {};
      const dropdown = document.getElementById('user-vehicles-dropdown');
      const trigger = document.getElementById('user-vehicles-trigger');
      const searchInput = document.getElementById('user-vehicles-search');
      if (!dropdown || !trigger) return;
      dropdown.style.display = 'block';
      dropdown.setAttribute('aria-hidden', 'false');
      trigger.classList.add('user-vehicles-trigger-open');
      trigger.setAttribute('aria-expanded', 'true');
      if (opts.focusSearch !== false && searchInput) searchInput.focus();
    }

    function toggleUserVehiclesDropdown(options) {
      const dropdown = document.getElementById('user-vehicles-dropdown');
      if (!dropdown) return;
      if (isUserVehiclesDropdownOpen(dropdown)) closeUserVehiclesDropdown(options);
      else openUserVehiclesDropdown(options);
    }

    function closeUserVehiclesDropdown(options) {
      const opts = options || {};
      const dropdown = document.getElementById('user-vehicles-dropdown');
      const trigger = document.getElementById('user-vehicles-trigger');
      if (dropdown) {
        dropdown.style.display = 'none';
        dropdown.setAttribute('aria-hidden', 'true');
      }
      if (trigger) {
        trigger.classList.remove('user-vehicles-trigger-open');
        trigger.setAttribute('aria-expanded', 'false');
        if (opts.focusTrigger) trigger.focus();
      }
    }

    function bindUserVehiclesDropdownA11y() {
      const trigger = document.getElementById('user-vehicles-trigger');
      const dropdown = document.getElementById('user-vehicles-dropdown');
      const searchInput = document.getElementById('user-vehicles-search');
      if (!trigger || !dropdown || trigger.dataset.userVehiclesBound === '1') return;

      trigger.dataset.userVehiclesBound = '1';
      trigger.addEventListener('keydown', function(ev) {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          toggleUserVehiclesDropdown({ focusSearch: !isUserVehiclesDropdownOpen(dropdown) });
          return;
        }
        if (ev.key === 'ArrowDown') {
          ev.preventDefault();
          if (!isUserVehiclesDropdownOpen(dropdown)) {
            openUserVehiclesDropdown({ focusSearch: true });
          } else if (searchInput) {
            searchInput.focus();
          }
          return;
        }
        if (ev.key === 'Escape' && isUserVehiclesDropdownOpen(dropdown)) {
          ev.preventDefault();
          closeUserVehiclesDropdown({ focusTrigger: true });
        }
      });

      if (searchInput && !searchInput.dataset.userVehiclesEscapeBound) {
        searchInput.dataset.userVehiclesEscapeBound = '1';
        searchInput.addEventListener('keydown', function(ev) {
          if (ev.key !== 'Escape') return;
          ev.preventDefault();
          closeUserVehiclesDropdown({ focusTrigger: true });
        });
      }

      if (!dropdown.dataset.userVehiclesEscapeBound) {
        dropdown.dataset.userVehiclesEscapeBound = '1';
        dropdown.addEventListener('keydown', function(ev) {
          if (ev.key !== 'Escape') return;
          ev.preventDefault();
          closeUserVehiclesDropdown({ focusTrigger: true });
        });
      }
    }

    window.toggleUserVehiclesDropdown = toggleUserVehiclesDropdown;

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bindUserVehiclesDropdownA11y);
    } else {
      bindUserVehiclesDropdownA11y();
    }

    document.addEventListener('click', function(ev) {
      const wrap = document.querySelector('.user-vehicles-wrap');
      const dropdown = document.getElementById('user-vehicles-dropdown');
      if (wrap && dropdown && isUserVehiclesDropdownOpen(dropdown) && !wrap.contains(ev.target)) {
        closeUserVehiclesDropdown();
      }
    });

    window.openUserFormModal = function openUserFormModal(editId = null, options) {
      const opts = options && typeof options === 'object' ? options : {};
      if (!opts.fromVehicleAssign && typeof window.medisaDismissVehicleAssignUserSavedListener === 'function') {
        window.medisaDismissVehicleAssignUserSavedListener();
      }
      const modal = document.getElementById('user-form-modal');
      if (!modal) return;

      const scope = getUserManagementSessionScope();
      const form = $('#user-form', modal);
      const idInput = $('#user-id', modal);
      const nameInput = $('#user-name', modal);
      const branchSelect = $('#user-branch', modal);
      const branchReadonly = $('#user-branch-readonly', modal);
      const phoneInput = $('#user-phone', modal);
      const emailInput = $('#user-email', modal);
      const roleSelect = $('#user-role', modal);
      const usernameInput = $('#user-username', modal);
      const passwordInput = $('#user-password', modal);
      const title = $('.modal-header h2', modal);
      const deleteBtn = $('#user-delete-btn', modal);

      // Şube dropdown'ını doldur
      populateBranchDropdown(scope);
      // Atanacak Taşıt dropdown'ını kapat, arama temizle ve listeyi doldur
      closeUserVehiclesDropdown();
      const searchInput = document.getElementById('user-vehicles-search');
      if (searchInput) searchInput.value = '';
      populateUserRoleOptions(scope, 'kullanici');
      syncUserFormCustomSelects(modal);

      // Form temizle
      if (form) form.reset();
      if (idInput) idInput.value = '';
      if (branchReadonly) branchReadonly.value = '';
      if (deleteBtn) {
        deleteBtn.classList.add('u-hidden');
        deleteBtn.style.display = 'none';
      }
      setUserFormSelectedVehicleIds([]);
      populateUserVehiclesMulti();
      const managedBranch = getManagedBranchForUserManagement(scope);
      if (scope.isBranchManager && branchSelect) {
        branchSelect.value = scope.primaryBranchId || '';
      }
      if (scope.isBranchManager && branchReadonly) {
        branchReadonly.value = managedBranch ? (managedBranch.name || '') : '';
      }

      let preferredBranchId = scope.isBranchManager ? (scope.primaryBranchId || '') : '';
      if (editId) {
        // DÜZENLEME MODU
        const users = readAllUsers();
        const user = users.find(u => String(u.id) === String(editId));
        if (!user || !isUserManageableInUserManagement(user, scope)) {
          alert('Bu kullanıcıyı düzenleme yetkiniz yok.');
          return;
        }
        preferredBranchId = getUserPrimaryBranchId(user);
        if (idInput) idInput.value = user.id;
        if (nameInput) nameInput.value = user.name || '';
        const currentBranchSelect = $('#user-branch', modal);
        if (currentBranchSelect) currentBranchSelect.value = preferredBranchId;
        const protectGm = isProtectedGeneralManagerTarget(user, scope);
        populateUserRoleOptions(
          scope,
          scope.isBranchManager ? 'kullanici' : getUiRoleFromUser(user),
          { lockToGeneralManager: protectGm }
        );
        if (phoneInput) phoneInput.value = formatTrGsmDisplay(user.phone || '');
        if (emailInput) emailInput.value = user.email || '';
        if (roleSelect) roleSelect.value = protectGm
          ? 'genel_yonetici'
          : (scope.isBranchManager ? 'kullanici' : getUiRoleFromUser(user));
        if (usernameInput) usernameInput.value = user.kullanici_adi || '';
        if (passwordInput) passwordInput.value = '';
        if (branchReadonly) {
          const userBranch = readAllBranches().find(function(branch) {
            return String(branch && branch.id) === String(preferredBranchId);
          });
          branchReadonly.value = userBranch ? (userBranch.name || '') : (managedBranch ? (managedBranch.name || '') : '');
        }
        const vehicles = readVehicles();
        const assignedIds = vehicles
          .filter(v => String(v.assignedUserId || '') === String(user.id))
          .map(v => String(v.id));
        setUserFormSelectedVehicleIds(assignedIds);
        populateUserVehiclesMulti('');
        if (title) title.textContent = 'Kullanıcı Düzenle';
        // Sil butonunu göster — self/son aktif GM korumalıysa gizle
        if (deleteBtn) {
          if (protectGm) {
            deleteBtn.classList.add('u-hidden');
            deleteBtn.style.display = 'none';
            deleteBtn.title = 'Sistemde en az bir aktif genel yönetici bulunmalıdır.';
          } else {
            deleteBtn.classList.remove('u-hidden');
            deleteBtn.style.display = 'flex';
            deleteBtn.removeAttribute('title');
          }
        }
      } else {
        // Yeni EKLEME MODU
        if (title) title.textContent = 'Yeni Kullanıcı Ekle';
        // Sil butonunu gizle
        if (deleteBtn) {
          deleteBtn.classList.add('u-hidden');
          deleteBtn.style.display = 'none';
          deleteBtn.removeAttribute('title');
        }
      }

      syncUserRoleBranchUI({ scope: scope, preferredBranchId: preferredBranchId });
      syncUserFormCustomSelects(modal);

      // Modalı aç
      modal.style.display = 'flex';
      requestAnimationFrame(() => modal.classList.add('active'));
      pushSettingsHistoryLayer('settings-user-form');

      // Focus
      if (nameInput && shouldAutofocusSettingsForm()) {
        setTimeout(() => nameInput.focus(), 350);
      }
    };

    window.closeUserFormModal = function closeUserFormModal(options) {
      if (typeof window.medisaDismissVehicleAssignUserSavedListener === 'function') {
        window.medisaDismissVehicleAssignUserSavedListener();
      }
      const modal = document.getElementById('user-form-modal');
      if (!modal) return;
      if (typeof window.resetModalInputs === 'function') {
        window.resetModalInputs(modal);
      }
      const form = $('#user-form', modal);
      if (form) form.reset();
      setUserFormSelectedVehicleIds([]);
      closeUserVehiclesDropdown();
      closeUserFormCustomSelect();
      const searchInput = document.getElementById('user-vehicles-search');
      if (searchInput) searchInput.value = '';
      const deleteBtn = $('#user-delete-btn', modal);
      if (deleteBtn) {
        deleteBtn.classList.add('u-hidden');
        deleteBtn.style.display = 'none';
      }
      modal.classList.remove('active');
      setTimeout(() => modal.style.display = 'none', 300);
      if (!settingsHistorySync && !(options && options.skipHistory)) {
        try { history.back(); } catch (e) {}
      }
    };

    // Şube Dropdown Doldur
    function populateBranchDropdown(scope) {
      const select = document.getElementById('user-branch');
      if (!select) return;
      const effectiveScope = scope || getUserManagementSessionScope();

      let branches = readBranches();
      if (effectiveScope.isBranchManager) {
        branches = branches.filter(function(branch) {
          return isWithinUserManagementBranch(branch && branch.id, effectiveScope);
        });
      }

      select.innerHTML = '<option value="">Şube Seçin</option>';

      branches.forEach(branch => {
        const option = document.createElement('option');
        option.value = branch.id;
        option.textContent = branch.name;
        select.appendChild(option);
      });
      syncUserFormCustomSelects(document.getElementById('user-form-modal'));
    }

    function syncUserRoleBranchUI(options = {}) {
      const scope = options.scope || getUserManagementSessionScope();
      const singleWrap = document.getElementById('user-branch-single-wrap');
      const readonlyWrap = document.getElementById('user-branch-readonly-wrap');
      const roleWrap = document.getElementById('user-role-wrap');
      const branchSelect = document.getElementById('user-branch');
      const branchReadonly = document.getElementById('user-branch-readonly');
      const roleSelect = document.getElementById('user-role');
      const selectedRole = roleSelect ? roleSelect.value : 'kullanici';
      const preferredBranchId = options.preferredBranchId != null
        ? String(options.preferredBranchId || '').trim()
        : '';
      const managedBranch = getManagedBranchForUserManagement(scope);
      const allowedBranchCount = Array.isArray(scope.branchIds) ? scope.branchIds.length : 0;

      if (scope.isBranchManager) {
        if (roleWrap) roleWrap.classList.add('u-hidden');
        populateBranchDropdown(scope);
        if (allowedBranchCount > 1) {
          if (singleWrap) singleWrap.classList.remove('u-hidden');
          if (readonlyWrap) readonlyWrap.classList.add('u-hidden');
          if (branchSelect) {
            branchSelect.required = true;
            const current = String(branchSelect.value || '').trim();
            const nextValue = preferredBranchId && isWithinUserManagementBranch(preferredBranchId, scope)
              ? preferredBranchId
              : (
                  current && isWithinUserManagementBranch(current, scope)
                    ? current
                    : (scope.primaryBranchId || '')
                );
            branchSelect.value = nextValue;
          }
          if (branchReadonly) branchReadonly.value = '';
        } else {
          if (singleWrap) singleWrap.classList.add('u-hidden');
          if (readonlyWrap) readonlyWrap.classList.remove('u-hidden');
          if (branchSelect) {
            branchSelect.required = false;
            branchSelect.value = preferredBranchId && isWithinUserManagementBranch(preferredBranchId, scope)
              ? preferredBranchId
              : (scope.primaryBranchId || '');
          }
          if (branchReadonly) {
            const selectedId = branchSelect ? String(branchSelect.value || '') : '';
            const selectedBranch = readAllBranches().find(function(branch) {
              return String(branch && branch.id) === selectedId;
            });
            branchReadonly.value = selectedBranch
              ? (selectedBranch.name || '')
              : (managedBranch ? (managedBranch.name || '') : '');
          }
        }
        syncUserFormCustomSelects(document.getElementById('user-form-modal'));
        return;
      }

      if (roleWrap) roleWrap.classList.remove('u-hidden');
      if (singleWrap) singleWrap.classList.remove('u-hidden');
      if (readonlyWrap) readonlyWrap.classList.add('u-hidden');
      if (branchReadonly) branchReadonly.value = '';
      if (branchSelect) branchSelect.required = selectedRole !== 'genel_yonetici';
      syncUserFormCustomSelects(document.getElementById('user-form-modal'));
    }
    window.syncUserRoleBranchUI = syncUserRoleBranchUI;

    document.addEventListener('DOMContentLoaded', function () {
      const rs = document.getElementById('user-role');
      if (rs && !rs.dataset.medisaRoleBound) {
        rs.dataset.medisaRoleBound = '1';
        rs.addEventListener('change', function () { syncUserRoleBranchUI(); });
      }
    });

    // CRUD İşlemleri
    /**
     * Kullanıcı kaydını formdan okuyup appData üzerinden sunucuya kaydeder (Create/Update)
     *
     * Validasyon + Kaydetme akışı:
     * 1. Form alanlarını oku (id, name, branchId, phone, email, role)
     * 2. Ad Soyad ve Şube validasyonu yap (zorunlu alanlar)
     * 3. ID varsa güncelleme, yoksa yeni ekleme modu
     * 4. appData'ya yaz ve sunucu kaydını bekle
     * 5. Form modalını kapat ve ana listeyi güncelle
     * 6. Kullanıcıya başarı mesajı göster
     *
     * Sunucu kaydı başarısız olursa modal açık kalır ve başarı mesajı gösterilmez.
     */
    function formatUserFullName(rawName) {
      const cleaned = (rawName || '').trim().replace(/\s+/g, ' ');
      if (!cleaned) return '';
      if (typeof window.formatAdSoyad === 'function') {
        return window.formatAdSoyad(cleaned);
      }
      const parts = cleaned.split(' ');
      if (parts.length === 1) {
        const namePart = parts[0];
        const lower = namePart.toLocaleLowerCase('tr-TR');
        return lower.charAt(0).toLocaleUpperCase('tr-TR') + lower.slice(1);
      }
      const lastName = parts[parts.length - 1].toLocaleUpperCase('tr-TR');
      const firstParts = parts.slice(0, -1).map(p => {
        const lower = p.toLocaleLowerCase('tr-TR');
        return lower.charAt(0).toLocaleUpperCase('tr-TR') + lower.slice(1);
      });
      return `${firstParts.join(' ')} ${lastName}`;
    }

    window.saveUser = async function saveUser() {
      const modal = document.getElementById('user-form-modal');
      if (!modal) return;
      const saveBtn = modal.querySelector('.universal-btn-save[onclick*="saveUser"]') || modal.querySelector('.universal-btn-save');
      if (saveBtn && saveBtn.disabled) return;
      if (saveBtn) saveBtn.disabled = true;
      try {
        if (!modal) {
          alert('Form modalı bulunamadı!');
          return;
        }

        const idInput = document.getElementById('user-id');
        const nameInput = document.getElementById('user-name');
        const branchSelect = document.getElementById('user-branch');
        const phoneInput = document.getElementById('user-phone');
        const emailInput = document.getElementById('user-email');
        const roleSelect = document.getElementById('user-role');
        const usernameInput = document.getElementById('user-username');
        const passwordInput = document.getElementById('user-password');
        const vehiclesContainer = document.getElementById('user-vehicles-container');
        const scope = getUserManagementSessionScope();

        if (!nameInput) {
          alert('Form alanları bulunamadı!');
          return;
        }

        const id = idInput ? idInput.value.trim() : '';
        const nameRaw = nameInput.value.trim();
        const name = formatUserFullName(nameRaw);
        const phone = phoneInput ? normalizePhoneDigits(phoneInput.value) : '';
        const email = emailInput ? emailInput.value.trim() : '';
        const selectedRole = roleSelect ? roleSelect.value : 'kullanici';
        const existingUserPreview = id
          ? (readAllUsers().find(function(user) { return String(user.id) === String(id); }) || null)
          : null;
        const protectGm = existingUserPreview ? isProtectedGeneralManagerTarget(existingUserPreview, scope) : false;
        if (protectGm && roleSelect) {
          roleSelect.value = 'genel_yonetici';
        }
        const effectiveSelectedRole = protectGm
          ? 'genel_yonetici'
          : (scope.isBranchManager ? 'kullanici' : selectedRole);
        const requestedBranchId = branchSelect ? String(branchSelect.value || '').trim() : '';
        const branchId = resolveBranchIdForUserManagementSave(scope, requestedBranchId, existingUserPreview);
        const branchIds = resolveBranchIdsForUserManagementSave(scope, branchId, existingUserPreview);
        const roleConfig = getRoleConfigFromSelection(effectiveSelectedRole);
        const role = roleConfig.role;
        const selectedVehicleIds = vehiclesContainer
          ? getUserFormSelectedVehicleIds()
          : [];
        const hasAssignedVehicles = selectedVehicleIds.length > 0;
        const kullanici_paneli = hasAssignedVehicles;
        if (protectGm && role !== 'genel_yonetici') {
          alert('Sistemde en az bir aktif genel yönetici bulunmalıdır.');
          return;
        }
        if (scope.isBranchManager && requestedBranchId && !isWithinUserManagementBranch(requestedBranchId, scope)) {
          alert('Yalnızca yetkili şubelerinize kullanıcı kaydedebilirsiniz.');
          return;
        }
        if (role === 'genel_yonetici' && scope.role !== 'genel_yonetici') {
          alert('Genel Yönetici kullanıcıyı yalnızca Genel Yönetici oturumu oluşturabilir.');
          if (roleSelect) roleSelect.focus();
          return;
        }
        if (role !== 'genel_yonetici' && !branchId) {
          alert('Kullanıcı eklemek için şube seçimi zorunludur.');
          if (branchSelect) {
            branchSelect.classList.add('input-error');
            branchSelect.focus();
            branchSelect.addEventListener('change', function onFix() {
              branchSelect.classList.remove('input-error');
              branchSelect.removeEventListener('change', onFix);
            });
          }
          return;
        }
        const kullanici_adi = usernameInput ? usernameInput.value.trim() : '';
        const sifre = passwordInput ? passwordInput.value.trim() : '';

        // Validasyon
        if (!name || !name.trim()) {
          alert('Ad Soyad giriniz.');
          nameInput.focus();
          return;
        }
        if (sifre !== '' && sifre.length < 6) {
          alert('Şifre en az 6 karakter olmalıdır.');
          if (passwordInput) passwordInput.focus();
          return;
        }

        const previousUsers = cloneStorageState(readAllUsers());
        const previousVehicles = cloneStorageState(readAllVehicles());
        const users = cloneStorageState(previousUsers);
        const vehicles = cloneStorageState(previousVehicles);
        const existingUser = id ? users.find(function(user) { return String(user.id) === String(id); }) : null;
        const selectedVehicleSet = new Set(selectedVehicleIds.map(function(vehicleId) { return String(vehicleId); }));

        if (id && !existingUser) {
          alert('Kullanıcı bulunamadı.');
          return;
        }
        if (scope.isBranchManager && !branchId) {
          alert('Yönetilen şube bulunamadı.');
          return;
        }
        if (scope.isBranchManager && existingUser && !isUserManageableInUserManagement(existingUser, scope)) {
          alert('Bu kullanıcıyı kaydetme yetkiniz yok.');
          return;
        }

        // Portal girişi: Kullanıcı veya şube yöneticisine taşıt atanmışsa kullanıcı adı ve şifre zorunlu
        const needsPortalCredentials = hasAssignedVehicles && (role === 'kullanici' || role === 'sube_yonetici');
        const hasExistingPortalPassword = !!(existingUser && existingUser.portal_sifresi_var === true);
        if (needsPortalCredentials && (!kullanici_adi || (!sifre && !hasExistingPortalPassword))) {
          alert('Taşıt atanan kullanıcı veya yönetici için "Kullanıcı Adı (portal girişi)" ve "Şifre (portal girişi)" zorunludur. Bu bilgilerle kullanıcı paneline girilebilir.');
          if (usernameInput) usernameInput.focus();
          return;
        }

        let savedUserId = id;

        const reassignedVehicles = vehicles
          .filter(function(v) {
            if (scope.isBranchManager && !isWithinUserManagementBranch(v && v.branchId, scope)) return false;
            const vehicleId = String(v && v.id != null ? v.id : '');
            const assignedUserId = String(v && v.assignedUserId ? v.assignedUserId : '');
            return selectedVehicleSet.has(vehicleId) && assignedUserId && assignedUserId !== String(savedUserId || '');
          })
          .map(function(v) {
            const assignedUser = users.find(function(u) { return String(u.id) === String(v.assignedUserId || ''); });
            const assignedName = formatUserFullName(
              (assignedUser && assignedUser.name) ||
              (typeof v.tahsisKisi === 'string' ? v.tahsisKisi : '')
            ) || 'Bilinmeyen Kullanıcı';
            return {
              id: String(v.id || ''),
              plaka: String(v.plaka || v.plate || '-'),
              assignedName: assignedName
            };
          });
        if (reassignedVehicles.length > 0) {
          const first = reassignedVehicles[0];
          const isMultiple = reassignedVehicles.length > 1;
          const confirmMessage = isMultiple
            ? 'Seçtiğiniz taşıtlardan en az biri başka kullanıcıya tahsis edilmiş.\n\n'
              + 'Taşıt "' + first.plaka + '" "' + first.assignedName + '" adlı kullanıcıya tahsis edilmiş.\n'
              + 'Bu tahsis silinecektir. Emin misiniz?'
            : 'Taşıt "' + first.plaka + '" "' + first.assignedName + '" adlı kullanıcıya tahsis edilmiş.\n'
              + 'Tahsis silinecektir. Emin misiniz?';
          if (!window.confirm(confirmMessage)) {
            return;
          }
        }

        if (id) {
          // güncelleME
          const idx = users.findIndex(u => String(u.id) === String(id));
          if (idx !== -1) {
            users[idx].name = name;
            users[idx].branchId = branchId;
            users[idx].branchIds = branchIds;
            users[idx].phone = phone;
            users[idx].email = email;
            users[idx].role = protectGm ? 'genel_yonetici' : role;
            users[idx].kullanici_paneli = kullanici_paneli;
            users[idx].surucu_paneli = kullanici_paneli;
            users[idx].kullanici_adi = kullanici_adi;
            if (protectGm) {
              users[idx].aktif = true;
            }
            if (sifre !== '') {
              users[idx].portal_sifresi_var = true;
            }
          }
        } else {
          // Yeni EKLEME
          const newUser = {
            id: 'u' + Date.now().toString(),
            name: name,
            branchId: branchId,
            branchIds: branchIds,
            phone: phone,
            email: email,
            role: role,
            kullanici_paneli: kullanici_paneli,
            surucu_paneli: kullanici_paneli,
            kullanici_adi: kullanici_adi,
            portal_sifresi_var: sifre !== '',
            createdAt: new Date().toISOString()
          };
          users.push(newUser);
          savedUserId = newUser.id;
        }

        // atanmış Taşıtlar: tek kaynak vehicle.assignedUserId
        vehicles.forEach(v => {
          if (scope.isBranchManager && !isWithinUserManagementBranch(v && v.branchId, scope)) return;
          const vid = String(v.id);
          const wasAssigned = String(v.assignedUserId || '') === String(savedUserId);
          const nowSelected = selectedVehicleIds.indexOf(vid) !== -1;
          if (wasAssigned && !nowSelected) {
            v.assignedUserId = undefined;
            if (v.tahsisKisi !== undefined) v.tahsisKisi = '';
          } else if (nowSelected) {
            v.assignedUserId = savedUserId;
            const u = users.find(u => String(u.id) === String(savedUserId));
            if (u && v.tahsisKisi !== undefined) v.tahsisKisi = u.name || '';
            const primarySube = (u.branchIds && u.branchIds[0]) || u.branchId;
            if (u && !v.branchId && primarySube) v.branchId = primarySube;
          }
        });
        const userPasswordChanges = Object.create(null);
        if (sifre !== '' && savedUserId) {
          userPasswordChanges[String(savedUserId)] = sifre;
        }
        if (passwordInput) passwordInput.value = '';
        const persisted = await persistUserManagementState(users, vehicles, {
          userPasswordChanges: userPasswordChanges
        });
        if (persisted !== true) {
          setUserManagementLocalState(previousUsers, previousVehicles);
          renderUserList();
          alert('Kullanıcı sunucuya kaydedilemedi. Bu nedenle portal girişi açılmaz. Lütfen tekrar deneyin.');
          return;
        }

        if (savedUserId) {
          window.dispatchEvent(new CustomEvent('userSaved', { detail: { id: savedUserId } }));
        }

        // Form modalını kapat (userSaved taşıt-detayı dinleyicilerinden sonra; close içinde bekleyen dinleyici temizlenir)
        closeUserFormModal();

        renderUserList();

        alert(id ? 'Kullanıcı güncellendi.' : 'Kullanıcı Eklendi.');
      } catch (error) {
        console.error('Kullanıcı kayıt hatası:', error);
        if (isUserManagementSaveConflict(error)) {
          const reloadOk = await refreshUserManagementAfterSaveConflict(previousUsers, previousVehicles);
          alert(
            reloadOk
              ? buildUserSaveConflictAlertMessage(error)
              : 'Sunucu ile senkron güncellenemedi. Sayfayı yenileyip tekrar deneyin.'
          );
        } else {
          alert('Kullanıcı kaydı sırasında bir hata oluştu! Lütfen tekrar deneyin.');
        }
      } finally {
        if (saveBtn) saveBtn.disabled = false;
      }
    };

    window.editUser = function editUser(id) {
      openUserFormModal(id);
    };

    window.deleteUser = async function deleteUser(id) {
      if (!id) return; // ID yoksa işlem yapma
      const scope = getUserManagementSessionScope();
      const previousUsers = cloneStorageState(readAllUsers());
      const targetUser = previousUsers.find(function(user) { return String(user.id) === String(id); });
      if (!targetUser) return;
      if (scope.isBranchManager && !isUserManageableInUserManagement(targetUser, scope)) {
        alert('Bu kullanıcıyı silme yetkiniz yok.');
        return;
      }
      if (isProtectedGeneralManagerTarget(targetUser, scope)) {
        alert('Sistemde en az bir aktif genel yönetici bulunmalıdır.');
        return;
      }

      // Taşıt kontrolü
      const vehicles = readAllVehicles();
      const count = vehicles.filter(v => String(v.assignedUserId || '') === String(id)).length;

      if (count > 0) {
        alert(`Bu Kullanıcıya ${count} adet Taşıt tahsis edilmiş. Önce Taşıtları başka Kullanıcıya aktarın.`);
        return;
      }

      if (!confirm('Bu Kullanıcıyı silmek istediğinizden emin misiniz?')) return;

      const previousVehicles = cloneStorageState(vehicles);
      const filtered = previousUsers.filter(u => String(u.id) !== String(id));
      let persisted = false;
      try {
        persisted = await persistUserManagementState(filtered, previousVehicles);
      } catch (error) {
        if (isUserManagementSaveConflict(error)) {
          const reloadOk = await refreshUserManagementAfterSaveConflict(previousUsers, previousVehicles);
          alert(
            reloadOk
              ? buildUserSaveConflictAlertMessage(error)
              : 'Sunucu ile senkron güncellenemedi. Sayfayı yenileyip tekrar deneyin.'
          );
          return;
        }
        console.error('Kullanıcı silme hatası:', error);
        alert('Kullanıcı silinirken bir hata oluştu! Lütfen tekrar deneyin.');
        return;
      }
      if (persisted !== true) {
        setUserManagementLocalState(previousUsers, previousVehicles);
        renderUserList();
        alert('Kullanıcı silme işlemi sunucuya kaydedilemedi. Lütfen tekrar deneyin.');
        return;
      }

      // Form modalını kapat
      closeUserFormModal();

      // Ana modalı güncelle
      renderUserList();

      alert('Kullanıcı Silindi.');
    };

    function buildUserCardNameMarkup(rawName) {
      const displayName = formatUserFullName(rawName || 'İsimsiz');
      const tokens = displayName.split(/\s+/).filter(Boolean);
      const safeTitle = escapeHtml(displayName || 'İsimsiz');
      if (!tokens.length) {
        return '<div class="settings-card-title settings-card-title-name" title="' + safeTitle + '"><span class="settings-card-name-part">' + safeTitle + '</span></div>';
      }
      if (tokens.length === 1) {
        return '<div class="settings-card-title settings-card-title-name" title="' + safeTitle + '">' +
          '<span class="settings-card-name-part settings-card-name-single">' + escapeHtml(tokens[0]) + '</span></div>';
      }
      const surname = tokens[tokens.length - 1];
      const given = tokens.slice(0, -1).join(' ');
      return '<div class="settings-card-title settings-card-title-name" title="' + safeTitle + '">' +
        '<span class="settings-card-name-part settings-card-name-given">' + escapeHtml(given) + '</span>' +
        '<span class="settings-card-name-part settings-card-name-surname">' + escapeHtml(surname) + '</span></div>';
    }

    function fitUserManagementCardNames() {
      const container = document.getElementById('user-list');
      if (!container || typeof window.medisaFitTextWithinBox !== 'function') return;
      window.medisaFitTextWithinBox(container, '#user-list .settings-card-title-name .settings-card-name-part', {
        minFontSize: 9.75,
        maxReduction: 3,
        step: 0.5
      });
    }

    if (!window.__medisaUserManagementNameFitResizeBound) {
      window.__medisaUserManagementNameFitResizeBound = true;
      let userNameFitResizeTimer = null;
      window.addEventListener('resize', function() {
        clearTimeout(userNameFitResizeTimer);
        userNameFitResizeTimer = setTimeout(fitUserManagementCardNames, 120);
      });
    }

    // Liste Render
    window.renderUserList = function renderUserList() {
      const container = document.getElementById('user-list');
      if (!container) return;

      const scope = getUserManagementSessionScope();
      const users = getScopedUsersForUserManagement(readUsers(), scope);
      const branches = readBranches();
      const normalizedQuery = normalizeUserManagementSearchText(userManagementSearchQuery);

      if (users.length === 0) {
        container.innerHTML = `
          <div style="text-align:center; padding:20px; color:var(--muted);">
            henüz Kullanıcı eklenmemiş.
          </div>
        `;
        return;
      }

      const filteredUsers = normalizedQuery
        ? users.filter(user => {
            const primaryBranchId = user.branchId || ((user.branchIds && user.branchIds.length) ? user.branchIds[0] : '');
            const branch = branches.find(x => String(x.id) === String(primaryBranchId));
            const branchName = branch ? branch.name : '-';
            const roleLabel = getUserRoleLabel(user);
            const haystack = normalizeUserManagementSearchText([
              user.name || user.isim || '',
              branchName,
              roleLabel,
              user.kullanici_adi || '',
              user.phone || '',
              user.email || ''
            ].join(' '));
            return haystack.includes(normalizedQuery);
          })
        : users;

      if (filteredUsers.length === 0) {
        container.innerHTML = `
          <div style="text-align:center; padding:20px; color:var(--muted);">
            arama sonucu bulunamadı.
          </div>
        `;
        return;
      }

      const sortedUsers = filteredUsers.slice().sort(compareUserManagementListOrder);

      function buildUserManagementCardHtml(user) {
        const primaryBranchId = user.branchId || ((user.branchIds && user.branchIds.length) ? user.branchIds[0] : '');
        const branch = branches.find(x => String(x.id) === String(primaryBranchId));
        const branchName = branch ? branch.name : '-';
        const roleLabelMarkup = buildUserRoleLabelMarkup(user, branchName);
        const phoneLine = formatTrGsmDisplay(user.phone || '') || '';

        if (scope.isBranchManager) {
          return `
          <div class="settings-card" onclick="editUser('${user.id}')" style="cursor:pointer;">
            <div class="settings-card-content">
              ${buildUserCardNameMarkup(user.name || 'İsimsiz')}
              ${roleLabelMarkup}
            </div>
          </div>
        `;
        }

        return `
          <div class="settings-card" onclick="editUser('${user.id}')" style="cursor:pointer;">
            <div class="settings-card-content">
              ${buildUserCardNameMarkup(user.name || 'İsimsiz')}
              ${roleLabelMarkup}
              ${phoneLine ? '<div class="settings-card-phone">' + escapeHtml(phoneLine) + '</div>' : ''}
            </div>
          </div>
        `;
      }

      const roleGroups = [];
      sortedUsers.forEach(function(user) {
        const rank = getUserManagementRoleSortRank(user);
        const prev = roleGroups[roleGroups.length - 1];
        if (!prev || prev.rank !== rank) {
          roleGroups.push({ rank: rank, users: [] });
        }
        roleGroups[roleGroups.length - 1].users.push(user);
      });

      const rows = roleGroups.map(function(g) {
        const cards = g.users.map(buildUserManagementCardHtml).join('');
        return '<div class="user-management-role-group">' + cards + '</div>';
      }).join('');

      container.innerHTML = rows;
      fitUserManagementCardNames();
    }

    // ========================================
    // YARDIMCI FONKSİYONLAR
    // ========================================

    function formatDate(isoString) {
      if (!isoString) return '-';
      const date = new Date(isoString);
      return date.toLocaleDateString('tr-TR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    }

    // ========================================
    // ESC & OVERLAY KAPAT
    // ========================================

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;

      const branchModal = document.getElementById('branch-modal');
      const userModal = document.getElementById('user-modal');
      const branchFormModal = document.getElementById('branch-form-modal');
      const userFormModal = document.getElementById('user-form-modal');
      const dataModal = document.getElementById('data-management-modal');
      const disVeriPanel = document.getElementById('dis-veri-panel');
      const infoModal = document.getElementById('info-modal');
      const cacheConfirmModal = document.getElementById('cache-confirm-modal');
      const centeredInfoBox = document.getElementById('centered-info-box');
      const requiredDocumentsModal = document.getElementById('required-documents-modal');

      if (requiredK2MembersDropdownOpen) {
        e.preventDefault();
        e.stopPropagation();
        closeRequiredK2MembersDropdown({ focusTrigger: true });
        return;
      }

      const isSettingsModalActive =
        (centeredInfoBox && centeredInfoBox.style.display === 'flex') ||
        (infoModal && infoModal.classList.contains('active')) ||
        (cacheConfirmModal && cacheConfirmModal.classList.contains('active')) ||
        (disVeriPanel && disVeriPanel.classList.contains('active')) ||
        (dataModal && dataModal.classList.contains('active')) ||
        (branchFormModal && branchFormModal.classList.contains('active')) ||
        (userFormModal && userFormModal.classList.contains('active')) ||
        (branchModal && branchModal.classList.contains('active')) ||
        (userModal && userModal.classList.contains('active')) ||
        (requiredDocumentsModal && requiredDocumentsModal.classList.contains('active'));

      if (isSettingsModalActive) {
        e.preventDefault();
        e.stopPropagation();
      }
    });

    function isAyarlarOverlayVisiblyOpen(el) {
      if (!el) return false;
      if (el.classList.contains('active') || el.classList.contains('open')) return true;
      const d = el.style && String(el.style.display || '');
      return d === 'flex' || d === 'block';
    }

    document.addEventListener('click', (e) => {
      const branchModal = document.getElementById('branch-modal');
      const userModal = document.getElementById('user-modal');
      const branchFormModal = document.getElementById('branch-form-modal');
      const userFormModal = document.getElementById('user-form-modal');
      const dataModal = document.getElementById('data-management-modal');
      const disVeriPanel = document.getElementById('dis-veri-panel');
      const infoModal = document.getElementById('info-modal');
      const cacheConfirmModal = document.getElementById('cache-confirm-modal');

      if (infoModal && infoModal.classList.contains('active') && e.target === infoModal) {
        closeInfoModal();
      }
      if (cacheConfirmModal && cacheConfirmModal.classList.contains('active') && e.target === cacheConfirmModal) {
        closeCacheConfirmModal();
      }
      if (disVeriPanel && disVeriPanel.classList.contains('active') && e.target === disVeriPanel) {
        closeDisVeriPanel();
      }
      if (branchModal && branchModal.classList.contains('active') && e.target === branchModal) {
        if (!isAyarlarOverlayVisiblyOpen(branchFormModal)) closeBranchManagement();
      }
      if (userModal && userModal.classList.contains('active') && e.target === userModal) {
        /* Üstte kullanıcı ekle/düzenle açıkken tıklama yanlışlıkla alttaki listeye düşerse listeyi kapatma */
        if (!isAyarlarOverlayVisiblyOpen(userFormModal)) closeUserManagement();
      }
      if (dataModal && dataModal.classList.contains('active') && e.target === dataModal) {
        closeDataManagement();
      }
    });

    // ========================================
    // VERİ YÖNETİMİ
    // ========================================

    function canManageBackups() {
      const session = typeof window.getMedisaSession === 'function'
        ? (window.getMedisaSession() || {})
        : (window.medisaSession || {});
      return !!(
        session.authenticated
        && session.permissions
        && session.permissions.manage_backups === true
      );
    }

    function requireBackupPermission() {
      if (canManageBackups()) return true;
      alert('Veri yedekleme işlemleri yalnızca Genel Yönetici tarafından kullanılabilir.');
      return false;
    }

    // Modal Kontrolü
    window.openDataManagement = function openDataManagement(event) {
      if (event && typeof event.stopPropagation === 'function') {
        event.stopPropagation();
        event.preventDefault();
      }

      if (!requireBackupPermission()) return;

      closeSettingsDropdown();
      const dataSubmenu = document.getElementById('data-submenu');
      if (dataSubmenu) {
        dataSubmenu.classList.remove('open');
      }

      const modal = document.getElementById('data-management-modal');
      if (!modal) return;
      if (modal.classList.contains('active') || modal.style.display === 'flex') {
        return;
      }
      modal.style.display = 'flex';
      requestAnimationFrame(() => modal.classList.add('active'));
      pushSettingsHistoryLayer('settings-data');
      refreshDataManagementBackupMeta();
    };

    window.closeDataManagement = function closeDataManagement(options) {
      const modal = document.getElementById('data-management-modal');
      if (!modal) return;
      modal.classList.remove('active');
      closeSettingsDropdown();
      setTimeout(() => modal.style.display = 'none', 300);
      if (!settingsHistorySync && !(options && options.skipHistory)) {
        resetToHomeFromPanel();
      }
    };

    // ========================================
    // DIŞ VERİ YÖNETİMİ
    // ========================================
    function isDisVeriPanelUnavailableOnCurrentDevice() {
      if (typeof window.medisaIsDisVeriPanelUnavailableOnDevice === 'function') {
        return window.medisaIsDisVeriPanelUnavailableOnDevice();
      }
      const hasMatchMedia = typeof window.matchMedia === 'function';
      const isMobileViewport = hasMatchMedia
        ? window.matchMedia('(max-width: 640px)').matches
        : window.innerWidth <= 640;
      const ua = navigator.userAgent || '';
      const isiOS = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      const isStandalone = hasMatchMedia
        && (window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: fullscreen)').matches);

      return isMobileViewport || (isiOS && (isStandalone || window.navigator.standalone === true));
    }

    window.openDisVeriPanel = function openDisVeriPanel() {
      if (isDisVeriPanelUnavailableOnCurrentDevice()) return;
      closeSettingsDropdown();
      const dataSubmenu = document.getElementById('data-submenu');
      if (dataSubmenu) dataSubmenu.classList.remove('open');
      const panel = document.getElementById('dis-veri-panel');
      if (!panel) return;
      if (panel.classList.contains('active') || panel.style.display === 'flex') return;
      panel.style.display = 'flex';
      requestAnimationFrame(() => panel.classList.add('active'));
      pushSettingsHistoryLayer('settings-dis-veri');
    };
    window.closeDisVeriPanel = function closeDisVeriPanel(options) {
      const panel = document.getElementById('dis-veri-panel');
      if (!panel) return;
      panel.classList.remove('active');
      closeSettingsDropdown();
      setTimeout(() => { panel.style.display = 'none'; }, 300);
      if (!settingsHistorySync && !(options && options.skipHistory)) {
        resetToHomeFromPanel();
      }
    };
    window.tsbKaskoListesiIndir = function tsbKaskoListesiIndir() {
      window.open('https://www.tsb.org.tr/tr/kasko-deger-listesi', '_blank');
    };

    // PERFORMANS: Excel kütüphanesi sadece butona tıklandığında (Lazy Load) indirilir.
    window.kaskoExcelYukle = function kaskoExcelYukle() {
      // Zaten yüklüyse direkt pencereyi aç
      if (typeof XLSX !== 'undefined') {
        var input = document.getElementById('kasko-excel-input');
        if (input) input.click();
        return;
      }

      if (typeof window.showCenteredInfoBox === 'function') {
        window.showCenteredInfoBox('Excel modülü yükleniyor, lütfen bekleyin...');
      }

      var xlsxSrc = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      function onXlsxReady() {
        if (typeof window.closeCenteredInfoBox === 'function') window.closeCenteredInfoBox();
        var input = document.getElementById('kasko-excel-input');
        if (input) input.click();
      }
      function onXlsxFail() {
        if (typeof window.closeCenteredInfoBox === 'function') window.closeCenteredInfoBox();
        alert('Excel kütüphanesi yüklenemedi. Lütfen internet bağlantınızı kontrol edin.');
      }

      if (typeof window.__medisaLoadScriptOnce === 'function') {
        window.__medisaLoadScriptOnce(xlsxSrc).then(onXlsxReady).catch(onXlsxFail);
        return;
      }

      var script = document.createElement('script');
      script.src = xlsxSrc;
      script.onload = onXlsxReady;
      script.onerror = onXlsxFail;
      document.head.appendChild(script);
    };

    (function initKaskoExcelInput() {
      var input = document.getElementById('kasko-excel-input');
      if (!input) return;
      input.addEventListener('change', function(e) {
        var file = e.target.files[0];
        if (!file) return;

        if (typeof window.showCenteredInfoBox === 'function') {
          window.showCenteredInfoBox('Excel okunuyor, lütfen bekleyin...');
        } else if (typeof window.showInfoModal === 'function') {
          window.showInfoModal('Excel okunuyor, lütfen bekleyin...');
        }

        function showKaskoError(msg) {
          if (typeof window.showCenteredInfoBox === 'function') {
            window.showCenteredInfoBox(msg);
          } else if (typeof window.showInfoModal === 'function') {
            window.showInfoModal(msg);
          } else {
            alert(msg);
          }
        }

        var reader = new FileReader();
        reader.onerror = function() {
          console.error('Kasko Excel FileReader hatası:', reader.error);
          showKaskoError('Dosya Okunamadı. Mobil Cihazda Dosya Erişim Sorunu Olabilir. Lütfen Masaüstü Bilgisayardan Deneyin.');
          input.value = '';
        };
        reader.onload = function(e) {
          try {
            if (typeof XLSX === 'undefined') {
              showKaskoError('Excel Kütüphanesi Yüklenemedi. İnternet Bağlantınızı Kontrol Edip Sayfayı Yenileyin.');
              input.value = '';
              return;
            }
            var data = new Uint8Array(e.target.result);
            var workbook = XLSX.read(data, { type: 'array' });
            var firstSheetName = workbook.SheetNames[0];
            var worksheet = workbook.Sheets[firstSheetName];
            var jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                /* Sunucuya yazım devam eder; tarayıcı kotası kritik değil */
            var nowIso = new Date().toISOString();
            var periodDate = new Date();
            var period = String(periodDate.getFullYear()) + '-' + String(periodDate.getMonth() + 1).padStart(2, '0');
            var sourceName = (file && file.name) ? String(file.name) : '';

            if (!window.appData || typeof window.appData !== 'object') window.appData = {};
            window.appData.kaskoDegerListesi = {
              updatedAt: nowIso,
              period: period,
              sourceFileName: sourceName,
              rowCount: Array.isArray(jsonData) ? jsonData.length : 0,
              rows: Array.isArray(jsonData) ? jsonData : []
            };

            if (typeof window.clearKaskoCache === 'function') window.clearKaskoCache();

            var afterSave = function() {
              var reloadIndex = (typeof window.loadKaskoListFromServer === 'function')
                ? window.loadKaskoListFromServer()
                : Promise.resolve(false);
              return Promise.resolve(reloadIndex).then(function() {
                if (window.appData && window.appData.kaskoDegerListesi) {
                  window.appData.kaskoDegerListesi.rows = [];
                }
                var updatePromise = (typeof window.guncelleTumKaskoDegerleri === 'function')
                  ? window.guncelleTumKaskoDegerleri()
                  : Promise.resolve(false);
                return Promise.resolve(updatePromise).then(function() {
                  if (typeof window.updateNotifications === 'function') {
                    window.updateNotifications();
                  }
                });
              });
            };

            var saveUrl = window.API_SAVE_KASKO || ((window.MEDISA_API_BASE || '') + 'save_kasko.php');
            var headersFn = typeof window.buildAuthHeaders === 'function' ? window.buildAuthHeaders : null;
            if (!headersFn) {
              showKaskoError('Oturum veya sunucu bağlantısı hazır değil. Sayfayı yenileyip tekrar deneyin.');
              input.value = '';
              return;
            }

            fetch(saveUrl, {
              method: 'POST',
              headers: headersFn({ 'Content-Type': 'application/json' }),
              body: JSON.stringify({
                updatedAt: nowIso,
                period: period,
                sourceFileName: sourceName,
                rows: Array.isArray(jsonData) ? jsonData : []
              })
            }).then(function(res) {
              if (!res.ok) {
                if (typeof window.closeCenteredInfoBox === 'function') window.closeCenteredInfoBox();
                if (typeof window.showCenteredInfoBox === 'function') {
                  window.showCenteredInfoBox('Kasko listesi sunucuya yazılamadı (yetki veya ağ). Yerel önizleme güncellendi.');
                }
                return;
              }
              return res.json().then(function() {
                if (typeof window.closeCenteredInfoBox === 'function') window.closeCenteredInfoBox();
                return afterSave().then(function() {
                if (typeof window.showCenteredInfoBox === 'function') {
                  window.showCenteredInfoBox('Kasko listesi başarıyla güncellendi!', {
                    anchorEl: document.getElementById('kasko-yukle-btn'),
                    offsetAbove: 18,
                    variant: 'bare-text',
                    autoCloseMs: 3000
                  });
                } else if (typeof window.showInfoModal === 'function') {
                  window.showInfoModal('Kasko listesi başarıyla güncellendi!');
                } else {
                  alert('Kasko listesi başarıyla güncellendi!');
                }
                });
              });
            }).catch(function() {
              if (typeof window.closeCenteredInfoBox === 'function') window.closeCenteredInfoBox();
              if (typeof window.showCenteredInfoBox === 'function') {
                window.showCenteredInfoBox('Kasko listesi sunucuya ulaşılamadı. Bağlantıyı kontrol edin.');
              }
            });
          } catch (error) {
            console.error('Excel okuma hatası:', error);
            if (error.name === 'QuotaExceededError' || error.code === 22) {
              showKaskoError('Kasko Listesi Mobil Cihazda Depolama Sınırını Aşıyor. Lütfen Masaüstü Bilgisayardan Excel Yükleyin.');
            } else {
              showKaskoError('Excel Okunurken Hata Oluştu! Dosya Bozuk Veya Yanlış Formatta Olabilir.');
            }
          } finally {
            input.value = '';
          }
        };
        reader.readAsArrayBuffer(file);
      });
    })();

    function getDefaultAyarlarBackup() {
      return { sirketAdi: 'Medisa', yetkiliKisi: '', telefon: '', eposta: '' };
    }

    function normalizeBackupUsers(users) {
      return typeof window.normalizeUsers === 'function'
        ? window.normalizeUsers(Array.isArray(users) ? users : [])
        : [];
    }

    /** PC indirme, önbellek öncesi yedek ve geri yükleme — tek tam yedek formatı (kasko Excel hariç). */
    function buildFullBackupPayload(meta) {
      const opts = meta && typeof meta === 'object' ? meta : {};
      const branches = readBranches();
      const users = readUsers();
      const vehicles = readVehicles();
      const existingApp = window.appData && typeof window.appData === 'object' ? window.appData : {};

      const payload = {
        branches: branches,
        users: users,
        vehicles: vehicles,
        kayitlar: Array.isArray(existingApp.kayitlar) ? existingApp.kayitlar : [],
        ayarlar: existingApp.ayarlar && typeof existingApp.ayarlar === 'object' ? existingApp.ayarlar : getDefaultAyarlarBackup(),
        sifreler: Array.isArray(existingApp.sifreler) ? existingApp.sifreler : [],
        arac_aylik_hareketler: Array.isArray(existingApp.arac_aylik_hareketler) ? existingApp.arac_aylik_hareketler : [],
        duzeltme_talepleri: Array.isArray(existingApp.duzeltme_talepleri) ? existingApp.duzeltme_talepleri : [],
        backup_date: opts.backup_date || new Date().toISOString(),
        version: '2.0'
      };

      if (
        existingApp.notificationReadState
        && typeof existingApp.notificationReadState === 'object'
        && !Array.isArray(existingApp.notificationReadState)
      ) {
        payload.notificationReadState = existingApp.notificationReadState;
      }
      if (
        existingApp.monthlyTodoWhatsAppLogs
        && typeof existingApp.monthlyTodoWhatsAppLogs === 'object'
        && !Array.isArray(existingApp.monthlyTodoWhatsAppLogs)
      ) {
        payload.monthlyTodoWhatsAppLogs = existingApp.monthlyTodoWhatsAppLogs;
      }
      if (opts.source) payload.source = opts.source;
      if (opts.upload_date) payload.upload_date = opts.upload_date;

      return payload;
    }

    function notifyExportDataResult(message, isError) {
      if (typeof window.showCenteredInfoBox === 'function') {
        window.showCenteredInfoBox(message, {
          variant: 'bare-text',
          autoCloseMs: isError ? 3500 : 2200
        });
        return;
      }
      if (!isError && typeof window.showInfoModal === 'function') {
        window.showInfoModal(message);
        return;
      }
      console[isError ? 'error' : 'info'](message);
    }

    function buildLocalBackupDownloadFilename() {
      const now = new Date();
      const pad = function(n) { return String(n).padStart(2, '0'); };
      return 'medisa_yedek_'
        + now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate())
        + '_' + pad(now.getHours()) + '-' + pad(now.getMinutes()) + '-' + pad(now.getSeconds())
        + '.zip';
    }

    function parseBackupDownloadFilename(contentDisposition) {
      if (!contentDisposition || typeof contentDisposition !== 'string') return null;
      const starMatch = /filename\*\s*=\s*(?:UTF-8''|utf-8'')([^;\s]+)/i.exec(contentDisposition);
      if (starMatch && starMatch[1]) {
        try {
          const decoded = decodeURIComponent(starMatch[1].trim().replace(/^"|"$/g, ''));
          const base = decoded.split(/[/\\]/).pop();
          if (base && /^medisa_yedek_[\w.\-]+\.(json|zip)$/i.test(base)) return base;
        } catch (_e) {}
      }
      const plainMatch = /filename\s*=\s*"?([^";]+)"?/i.exec(contentDisposition);
      if (plainMatch && plainMatch[1]) {
        const base = plainMatch[1].trim().split(/[/\\]/).pop();
        if (base && /^medisa_yedek_[\w.\-]+\.(json|zip)$/i.test(base)) return base;
      }
      return null;
    }

    // Veri dışa aktar — canonical sunucu data.json exact download (browser state yok)
    window.exportData = async function exportData() {
      if (!requireBackupPermission()) return;
      try {
        const requestOptions = { method: 'GET', cache: 'no-store' };
        if (typeof window.buildAuthHeaders === 'function') {
          requestOptions.headers = window.buildAuthHeaders();
        } else if (typeof buildAuthHeaders === 'function') {
          requestOptions.headers = buildAuthHeaders();
        }
        const res = await fetch('backup_download.php', requestOptions);
        if (!res.ok) {
          notifyExportDataResult('Yedek alınamadı. Sunucu verisi indirilemedi.', true);
          return;
        }
        const blob = await res.blob();
        if (!blob || blob.size === 0) {
          notifyExportDataResult('Yedek alınamadı. Sunucu verisi indirilemedi.', true);
          return;
        }
        const filename = parseBackupDownloadFilename(res.headers.get('Content-Disposition'))
          || buildLocalBackupDownloadFilename();
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.click();
        URL.revokeObjectURL(link.href);
        setTimeout(function() {
          notifyExportDataResult('Yedek başarıyla indirildi!', false);
        }, 0);
      } catch (error) {
        console.error('[Medisa] Yedekleme hatası:', error);
        notifyExportDataResult('Yedek alınamadı. Sunucu verisi indirilemedi.', true);
      }
    };

    async function fetchServerLastBackupMetadata() {
      try {
        const requestOptions = { cache: "no-store" };
        if (typeof window.buildAuthHeaders === "function") {
          requestOptions.headers = window.buildAuthHeaders();
        } else if (typeof buildAuthHeaders === "function") {
          requestOptions.headers = buildAuthHeaders();
        }
        const res = await fetch("restore.php?source=backup", requestOptions);
        if (!res.ok) return null;
        const payload = await res.json();
        if (!payload || payload.success !== true || payload.available !== true) return null;
        return {
          available: true,
          modified_at: payload.modified_at || null,
          size_bytes: Number(payload.size_bytes) || 0,
          restore_enabled: payload.restore_enabled === true,
          source: payload.source || null,
          source_label: payload.source_label || null,
          message: payload.message || ''
        };
      } catch (_e) {
        return null;
      }
    }

    function formatBackupMetadataDate(iso) {
      if (!iso) return 'Bilinmiyor';
      try {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return 'Bilinmiyor';
        return d.toLocaleString('tr-TR');
      } catch (_e) {
        return 'Bilinmiyor';
      }
    }

    function setDataManagementBackupMetaText(lineText) {
      const wrap = document.getElementById('data-management-backup-meta');
      if (!wrap) return;
      const line = wrap.querySelector('.data-management-backup-meta-line');
      if (line) line.textContent = lineText;
    }

    async function refreshDataManagementBackupMeta() {
      setDataManagementBackupMetaText('Sunucudaki Son Yedekleme Dosyası: Yükleniyor…');
      const metadata = await fetchServerLastBackupMetadata();
      if (!metadata || !metadata.modified_at) {
        setDataManagementBackupMetaText('Sunucudaki Son Yedekleme Dosyası: Bilgi alınamadı.');
        return;
      }
      setDataManagementBackupMetaText(
        'Sunucudaki Son Yedekleme Dosyası: ' + formatBackupMetadataDate(metadata.modified_at)
      );
    }

    /* medisa-import-sot:begin */
    // Aynı sayfa/browser context — ikinci tab / diğer kullanıcı korunmaz.
    var importInFlight = false;

    function isImportTransactionInFlight() {
      return importInFlight === true;
    }

    function tryBeginImportTransaction() {
      if (importInFlight) return false;
      importInFlight = true;
      return true;
    }

    function notifyImportInFlightBlocked() {
      var msg = 'Başka bir geri yükleme işlemi devam ediyor. İşlem tamamlanana kadar bekleyin.';
      if (typeof window.showCenteredInfoBox === 'function') {
        try {
          window.showCenteredInfoBox(msg, { variant: 'bare-text', autoCloseMs: 3500 });
          return;
        } catch (_infoErr) {}
      }
      alert(msg);
    }

    function scheduleImportTerminalReload(options) {
      var opts = options && typeof options === 'object' ? options : {};
      var manualMsg = opts.manualRefreshMessage
        || 'İşlem tamamlandı ancak sayfa yenilenemedi. Lütfen sayfayı manuel yenileyin.';
      try {
        if (!window.location || typeof window.location.reload !== 'function') {
          alert(manualMsg);
          return;
        }
        setTimeout(function() {
          try {
            window.location.reload();
          } catch (_reloadErr) {
            alert(manualMsg);
          }
        }, 500);
      } catch (_schedErr) {
        alert(manualMsg);
      }
    }

    // Dosya yedeği normalize edilir; sunucu endpoint'i yalnız güvenli metadata sağlar.
    function normalizeBackupPayload(raw, source) {
      if (!raw || typeof raw !== "object") return null;
      const vehicles = Array.isArray(raw.vehicles) ? raw.vehicles : (Array.isArray(raw.tasitlar) ? raw.tasitlar : null);
      const branches = Array.isArray(raw.branches) ? raw.branches : null;
      const users = Array.isArray(raw.users) ? normalizeBackupUsers(raw.users) : null;
      if (vehicles == null || branches == null || users == null) return null;
      return {
        source: source || "unknown",
        upload_date: raw.upload_date || raw.backup_date || raw._backup_file_mtime || null,
        branches: branches,
        users: users,
        vehicles: vehicles,
        kayitlar: Array.isArray(raw.kayitlar) ? raw.kayitlar : null,
        ayarlar: raw.ayarlar && typeof raw.ayarlar === "object" ? raw.ayarlar : null,
        sifreler: Array.isArray(raw.sifreler) ? raw.sifreler : null,
        arac_aylik_hareketler: Array.isArray(raw.arac_aylik_hareketler) ? raw.arac_aylik_hareketler : null,
        duzeltme_talepleri: Array.isArray(raw.duzeltme_talepleri) ? raw.duzeltme_talepleri : null,
        notificationReadState: (
          raw.notificationReadState
          && typeof raw.notificationReadState === 'object'
          && !Array.isArray(raw.notificationReadState)
        ) ? raw.notificationReadState : null,
        monthlyTodoWhatsAppLogs: (
          raw.monthlyTodoWhatsAppLogs
          && typeof raw.monthlyTodoWhatsAppLogs === 'object'
          && !Array.isArray(raw.monthlyTodoWhatsAppLogs)
        ) ? raw.monthlyTodoWhatsAppLogs : null
      };
    }

    function captureImportRollbackSnapshot() {
      var appDataClone = null;
      try {
        appDataClone = window.appData ? JSON.parse(JSON.stringify(window.appData)) : null;
      } catch (_cloneErr) {
        appDataClone = null;
      }
      var medisaDataV1 = null;
      var medisaServerBackup = null;
      try { medisaDataV1 = localStorage.getItem('medisa_data_v1'); } catch (_e1) {}
      try { medisaServerBackup = localStorage.getItem('medisa_server_backup'); } catch (_e2) {}
      return {
        appData: appDataClone,
        medisaDataV1: medisaDataV1,
        medisaServerBackup: medisaServerBackup
      };
    }

    function restoreImportRollbackSnapshot(snapshot) {
      if (!snapshot) return;
      if (snapshot.appData != null) {
        if (typeof window.commitMedisaAppDataSnapshot === 'function') {
          window.commitMedisaAppDataSnapshot(snapshot.appData, { reason: 'import-rollback' });
        } else {
          window.appData = snapshot.appData;
        }
      }
      try {
        if (snapshot.medisaDataV1 == null) localStorage.removeItem('medisa_data_v1');
        else localStorage.setItem('medisa_data_v1', snapshot.medisaDataV1);
      } catch (_rollDataErr) {}
      try {
        if (snapshot.medisaServerBackup == null) localStorage.removeItem('medisa_server_backup');
        else localStorage.setItem('medisa_server_backup', snapshot.medisaServerBackup);
      } catch (_rollBackupErr) {}
    }

    function writeImportSuccessMetadataBestEffort(backup, restoredBlob) {
      try {
        localStorage.setItem('medisa_data_v1', JSON.stringify(restoredBlob));
      } catch (_metaDataErr) {}
      try {
        localStorage.setItem('medisa_server_backup', JSON.stringify(Object.assign({}, backup, {
          upload_date: new Date().toISOString()
        })));
      } catch (_metaBackupErr) {}
    }

    function applyRestoredBackup(backup) {
      const existingApp = window.appData || {};
      const restoredBlob = {
        tasitlar: Array.isArray(backup.vehicles) ? backup.vehicles : [],
        kayitlar: backup.kayitlar != null ? backup.kayitlar : (existingApp.kayitlar || []),
        branches: Array.isArray(backup.branches) ? backup.branches : [],
        users: Array.isArray(backup.users) ? backup.users : [],
        ayarlar: backup.ayarlar || existingApp.ayarlar || getDefaultAyarlarBackup(),
        sifreler: backup.sifreler != null ? backup.sifreler : (existingApp.sifreler || []),
        arac_aylik_hareketler: backup.arac_aylik_hareketler != null ? backup.arac_aylik_hareketler : (existingApp.arac_aylik_hareketler || []),
        duzeltme_talepleri: backup.duzeltme_talepleri != null ? backup.duzeltme_talepleri : (existingApp.duzeltme_talepleri || []),
        kaskoDegerListesi: existingApp.kaskoDegerListesi,
        notificationReadState: backup.notificationReadState != null
          ? backup.notificationReadState
          : (
            existingApp.notificationReadState
            && typeof existingApp.notificationReadState === 'object'
            && !Array.isArray(existingApp.notificationReadState)
          ) ? existingApp.notificationReadState : {},
        monthlyTodoWhatsAppLogs: backup.monthlyTodoWhatsAppLogs != null
          ? backup.monthlyTodoWhatsAppLogs
          : (
            existingApp.monthlyTodoWhatsAppLogs
            && typeof existingApp.monthlyTodoWhatsAppLogs === 'object'
            && !Array.isArray(existingApp.monthlyTodoWhatsAppLogs)
          ) ? existingApp.monthlyTodoWhatsAppLogs : {}
      };

      if (typeof window.commitMedisaAppDataSnapshot === 'function') {
        window.commitMedisaAppDataSnapshot(restoredBlob, { reason: 'ayarlar-backup-restore' });
      } else {
        writeBranches(backup.branches);
        writeUsers(backup.users);
        if (typeof window.writeVehicles === 'function') {
          window.writeVehicles(backup.vehicles);
        } else if (window.appData) {
          window.appData.tasitlar = Array.isArray(backup.vehicles) ? backup.vehicles : [];
        }
        window.appData = restoredBlob;
      }

      return restoredBlob;
    }

    async function finishImportedBackupSync(preSnapshot, backup, restoredBlob) {
      var failMsg = 'Yedek sunucuya kaydedilemedi. Mevcut verileriniz korundu.\n\nSayfa Yenilenecek.';
      var successMsg = 'Yedek başarıyla Geri Yüklendi ve Sunucuya Kaydedildi!\n\nSayfa Yenilenecek.';

      function closeInfoBoxSafe() {
        if (typeof window.closeCenteredInfoBox === 'function') {
          try { window.closeCenteredInfoBox(); } catch (_closeErr) {}
        }
      }

      function failAndReload(err) {
        if (err) {
          if (typeof window.__medisaLogError === 'function') window.__medisaLogError('Yedek sunucuya yazılamadı', err);
          else console.error('Yedek sunucuya yazılamadı:', err);
        }
        try { restoreImportRollbackSnapshot(preSnapshot); } catch (_rollErr) {}
        closeInfoBoxSafe();
        alert(failMsg);
        scheduleImportTerminalReload();
      }

      if (typeof window.saveDataToServer !== 'function') {
        failAndReload(new Error('saveDataToServer missing'));
        return false;
      }

      if (typeof window.showCenteredInfoBox === 'function') {
        window.showCenteredInfoBox('Yedek sunucuya yükleniyor, lütfen bekleyin...');
      }

      var ok;
      try {
        ok = await window.saveDataToServer();
      } catch (err) {
        failAndReload(err);
        return false;
      }

      if (ok !== true) {
        failAndReload(new Error('saveDataToServer returned non-true'));
        return false;
      }

      writeImportSuccessMetadataBestEffort(backup, restoredBlob);
      closeInfoBoxSafe();
      alert(successMsg);
      scheduleImportTerminalReload();
      return true;
    }

    /**
     * Confirm sonrası tek transaction: lock → snapshot → apply → save.
     * Lock reload’a kadar açık kalır; ikinci confirmed import reddedilir.
     */
    async function runConfirmedImportTransaction(backup) {
      if (!tryBeginImportTransaction()) {
        notifyImportInFlightBlocked();
        return { started: false, blocked: true, ok: false };
      }

      var preSnapshot = null;
      try {
        preSnapshot = captureImportRollbackSnapshot();
      } catch (snapErr) {
        if (typeof window.__medisaLogError === 'function') window.__medisaLogError('Yedek snapshot', snapErr);
        else console.error('Yedek snapshot hatası:', snapErr);
        alert('Yedek Dosyası Okunamadı!');
        return { started: true, blocked: false, ok: false, reason: 'snapshot' };
      }

      var restoredBlob;
      try {
        restoredBlob = applyRestoredBackup(backup);
      } catch (applyErr) {
        if (typeof window.__medisaLogError === 'function') window.__medisaLogError('Yedek apply', applyErr);
        else console.error('Yedek apply hatası:', applyErr);
        try {
          if (preSnapshot) restoreImportRollbackSnapshot(preSnapshot);
        } catch (_rollErr) {}
        alert('Yedek sunucuya kaydedilemedi. Mevcut verileriniz korundu.\n\nSayfa Yenilenecek.');
        scheduleImportTerminalReload();
        return { started: true, blocked: false, ok: false, reason: 'apply' };
      }

      var ok = await finishImportedBackupSync(preSnapshot, backup, restoredBlob);
      return { started: true, blocked: false, ok: ok === true };
    }

    function processImportedBackupText(fileText, ui) {
      var hooks = ui && typeof ui === 'object' ? ui : {};
      var confirmFn = typeof hooks.confirm === 'function'
        ? hooks.confirm
        : function(msg) { return window.confirm(msg); };

      var parsed;
      try {
        parsed = JSON.parse(fileText);
      } catch (_parseErr) {
        alert('Yedek Dosyası Okunamadı!');
        return Promise.resolve({ outcome: 'parse_error', ok: false });
      }

      var backup = normalizeBackupPayload(parsed, 'file');
      if (!backup) {
        alert('Geçersiz Yedek Dosyası!');
        return Promise.resolve({ outcome: 'validation_error', ok: false });
      }

      var dateRaw = backup.upload_date || parsed.backup_date;
      var dateStr = dateRaw ? new Date(dateRaw).toLocaleString('tr-TR') : 'Bilinmiyor';
      var kayitCount = backup.kayitlar != null ? backup.kayitlar.length : null;
      var kayitLine = kayitCount != null ? ('\nKayıtlar: ' + kayitCount) : '';
      var message = 'Yedek Tarih: ' + dateStr + '\n\n' +
        'Şubeler: ' + backup.branches.length + '\n' +
        'Kullanıcılar: ' + backup.users.length + '\n' +
        'Taşıtlar: ' + backup.vehicles.length +
        kayitLine +
        '\n\nMevcut veriler silinecek! Emin misiniz?';

      if (!confirmFn(message)) {
        return Promise.resolve({ outcome: 'cancelled', ok: false });
      }

      return runConfirmedImportTransaction(backup).then(function(result) {
        if (result && result.blocked) {
          return { outcome: 'blocked', ok: false, result: result };
        }
        return {
          outcome: result && result.ok ? 'success' : 'failed',
          ok: !!(result && result.ok),
          result: result
        };
      });
    }
    /* medisa-import-sot:end */

    window.showLastBackupMetadata = async function showLastBackupMetadata() {
      if (!requireBackupPermission()) return;
      await refreshDataManagementBackupMeta();
    };

    /* medisa-server-restore-ui:begin */
    var serverRestoreUi = {
      inFlight: false,
      selectedBackupId: null,
      intentToken: null,
      intentExpiry: null,
      confirmationText: 'SUNUCU YEDEĞİNİ GERİ YÜKLE',
      restoreEnabled: false,
      maintenanceMode: false,
      canExecute: false,
      lastDryRun: null
    };

    function canExecuteServerRestore() {
      var session = window.medisaSession;
      return !!(
        session
        && session.authenticated
        && session.permissions
        && session.permissions.execute_server_restore === true
      );
    }

    function setServerRestoreError(msg) {
      var el = document.getElementById('server-restore-error');
      if (!el) return;
      if (!msg) {
        el.hidden = true;
        el.textContent = '';
        return;
      }
      el.hidden = false;
      el.textContent = String(msg);
    }

    function updateServerRestoreCommitEnabled() {
      var btn = document.getElementById('server-restore-commit-btn');
      var input = document.getElementById('server-restore-confirmation');
      if (!btn || !input) return;
      var typed = (input.value || '').trim();
      var ok = (
        serverRestoreUi.restoreEnabled === true
        && serverRestoreUi.maintenanceMode === true
        && serverRestoreUi.canExecute === true
        && !!serverRestoreUi.selectedBackupId
        && !!serverRestoreUi.intentToken
        && typed === serverRestoreUi.confirmationText
        && serverRestoreUi.inFlight !== true
        && !(serverRestoreUi.lastDryRun && serverRestoreUi.lastDryRun.eligible === false)
      );
      btn.disabled = !ok;
    }

    async function fetchBackupRegistry() {
      var requestOptions = { cache: 'no-store' };
      if (typeof buildAuthHeaders === 'function') {
        requestOptions.headers = buildAuthHeaders();
      }
      var res = await fetch('backup-registry.php', requestOptions);
      var payload = await res.json().catch(function() { return null; });
      if (!res.ok || !payload || payload.success !== true) {
        throw new Error((payload && (payload.message || payload.error_code)) || ('HTTP ' + res.status));
      }
      return payload;
    }

    function renderServerRestoreList(backups) {
      var list = document.getElementById('server-restore-list');
      if (!list) return;
      list.innerHTML = '';
      if (!Array.isArray(backups) || backups.length === 0) {
        list.textContent = 'Kayıtlı sunucu yedeği yok.';
        return;
      }
      backups.forEach(function(b) {
        var id = b && b.backup_id ? String(b.backup_id) : '';
        if (!id) return;
        var row = document.createElement('button');
        row.type = 'button';
        row.className = 'server-restore-item';
        row.setAttribute('role', 'listitem');
        row.setAttribute('aria-pressed', serverRestoreUi.selectedBackupId === id ? 'true' : 'false');
        if (serverRestoreUi.selectedBackupId === id) row.classList.add('is-selected');
        var when = b.created_at ? new Date(b.created_at).toLocaleString('tr-TR') : '—';
        var counts = b.record_counts && typeof b.record_counts === 'object' ? b.record_counts : {};
        row.innerHTML =
          '<span class="server-restore-item-title">' + when + '</span>' +
          '<span class="server-restore-item-meta">' +
          String(b.source || '') + ' · ' + String(b.size_bytes || 0) + ' B · schema ' + String(b.schema_version || '—') +
          ' · ' + (b.restore_eligible ? 'uygun' : 'uygun değil') +
          ' · ' + String(b.validation_status || '') +
          ' · v' + String(counts.vehicles != null ? counts.vehicles : '—') +
          '/u' + String(counts.users != null ? counts.users : '—') +
          '</span>';
        row.addEventListener('click', function() {
          if (serverRestoreUi.inFlight) return;
          serverRestoreUi.selectedBackupId = id;
          serverRestoreUi.intentToken = null;
          serverRestoreUi.lastDryRun = null;
          var dry = document.getElementById('server-restore-dryrun');
          if (dry) { dry.hidden = true; dry.textContent = ''; }
          renderServerRestoreList(backups);
          var dryBtn = document.getElementById('server-restore-dryrun-btn');
          if (dryBtn) dryBtn.disabled = serverRestoreUi.inFlight;
          updateServerRestoreCommitEnabled();
        });
        list.appendChild(row);
      });
    }

    async function refreshServerRestorePanel() {
      if (!requireBackupPermission()) return;
      var panel = document.getElementById('server-restore-panel');
      var status = document.getElementById('server-restore-status');
      if (!panel || !status) return;
      panel.hidden = false;
      serverRestoreUi.canExecute = canExecuteServerRestore();
      setServerRestoreError('');
      try {
        var payload = await fetchBackupRegistry();
        serverRestoreUi.restoreEnabled = payload.restore_enabled === true;
        serverRestoreUi.maintenanceMode = payload.maintenance_mode === true;
        if (payload.confirmation_text) serverRestoreUi.confirmationText = String(payload.confirmation_text);
        var parts = [];
        parts.push(serverRestoreUi.restoreEnabled ? 'Sunucu geri yükleme açık (feature flag).' : 'Sunucu geri yükleme kapalı.');
        parts.push(serverRestoreUi.maintenanceMode ? 'Bakım/write-freeze açık.' : 'Bakım/write-freeze kapalı.');
        if (!serverRestoreUi.canExecute) parts.push('Commit izni yok veya oturum yetersiz.');
        status.textContent = parts.join(' ');
        renderServerRestoreList(payload.backups || []);
        var confirmInput = document.getElementById('server-restore-confirmation');
        if (confirmInput) {
          confirmInput.disabled = false;
          confirmInput.placeholder = serverRestoreUi.confirmationText;
        }
        var dryBtn = document.getElementById('server-restore-dryrun-btn');
        if (dryBtn) dryBtn.disabled = !serverRestoreUi.selectedBackupId || serverRestoreUi.inFlight;
        updateServerRestoreCommitEnabled();
      } catch (err) {
        status.textContent = 'Yedek listesi alınamadı.';
        setServerRestoreError(err && err.message ? err.message : 'Registry hatası');
      }
    }

    async function runServerRestoreDryRun() {
      if (!requireBackupPermission()) return;
      if (serverRestoreUi.inFlight) return;
      if (!serverRestoreUi.selectedBackupId) {
        setServerRestoreError('Önce bir yedek seçin.');
        return;
      }
      serverRestoreUi.inFlight = true;
      setServerRestoreError('');
      var dryBtn = document.getElementById('server-restore-dryrun-btn');
      var commitBtn = document.getElementById('server-restore-commit-btn');
      if (dryBtn) { dryBtn.disabled = true; dryBtn.setAttribute('aria-busy', 'true'); }
      if (commitBtn) commitBtn.disabled = true;
      try {
        var headers = { 'Content-Type': 'application/json' };
        if (typeof buildAuthHeaders === 'function') {
          var auth = buildAuthHeaders();
          Object.keys(auth || {}).forEach(function(k) { headers[k] = auth[k]; });
        }
        var res = await fetch('backup-restore-dry-run.php', {
          method: 'POST',
          cache: 'no-store',
          headers: headers,
          body: JSON.stringify({ backup_id: serverRestoreUi.selectedBackupId })
        });
        var payload = await res.json().catch(function() { return null; });
        if (!res.ok || !payload || payload.success !== true) {
          throw new Error((payload && (payload.error_code || payload.message)) || ('HTTP ' + res.status));
        }
        serverRestoreUi.lastDryRun = payload;
        serverRestoreUi.intentToken = payload.intent_token || null;
        serverRestoreUi.intentExpiry = payload.intent_expiry || null;
        serverRestoreUi.restoreEnabled = payload.restore_enabled === true;
        serverRestoreUi.maintenanceMode = payload.maintenance_mode === true;
        var box = document.getElementById('server-restore-dryrun');
        if (box) {
          box.hidden = false;
          box.textContent =
            'Dry-run OK. vehicles Δ ' + String(payload.vehicle_count_delta) +
            ', users Δ ' + String(payload.role_user_count_delta && payload.role_user_count_delta.users) +
            ', events Δ ' + String(payload.event_count_delta) +
            '. Uyarılar: ' + ((payload.warning_codes || []).join(', ') || 'yok') +
            '. Intent: ' + (serverRestoreUi.intentToken ? 'üretilmiş' : 'yok (commit kapalı)');
        }
      } catch (err) {
        serverRestoreUi.intentToken = null;
        setServerRestoreError(err && err.message ? err.message : 'Dry-run hatası');
      } finally {
        serverRestoreUi.inFlight = false;
        if (dryBtn) { dryBtn.disabled = !serverRestoreUi.selectedBackupId; dryBtn.setAttribute('aria-busy', 'false'); }
        updateServerRestoreCommitEnabled();
      }
    }

    async function runServerRestoreCommit() {
      if (!requireBackupPermission()) return;
      if (!canExecuteServerRestore()) {
        setServerRestoreError('RESTORE_PERMISSION_DENIED');
        return;
      }
      if (serverRestoreUi.inFlight) return;
      var input = document.getElementById('server-restore-confirmation');
      var typed = input ? String(input.value || '').trim() : '';
      if (
        serverRestoreUi.restoreEnabled !== true
        || serverRestoreUi.maintenanceMode !== true
        || !serverRestoreUi.intentToken
        || !serverRestoreUi.selectedBackupId
        || typed !== serverRestoreUi.confirmationText
      ) {
        setServerRestoreError('Commit koşulları sağlanmadı (flag/maintenance/intent/onay).');
        updateServerRestoreCommitEnabled();
        return;
      }
      if (!window.confirm('Sunucu geri yükleme kritik bir işlemdir. Devam edilsin mi?')) return;

      serverRestoreUi.inFlight = true;
      var commitBtn = document.getElementById('server-restore-commit-btn');
      if (commitBtn) {
        commitBtn.disabled = true;
        commitBtn.setAttribute('aria-busy', 'true');
      }
      setServerRestoreError('');
      try {
        var headers = { 'Content-Type': 'application/json' };
        if (typeof buildAuthHeaders === 'function') {
          var auth = buildAuthHeaders();
          Object.keys(auth || {}).forEach(function(k) { headers[k] = auth[k]; });
        }
        var idem = 'ui-' + Date.now() + '-' + Math.random().toString(16).slice(2);
        var res = await fetch('backup-restore-commit.php', {
          method: 'POST',
          cache: 'no-store',
          headers: headers,
          body: JSON.stringify({
            backup_id: serverRestoreUi.selectedBackupId,
            intent_token: serverRestoreUi.intentToken,
            idempotency_key: idem,
            confirmation: typed
          })
        });
        var payload = await res.json().catch(function() { return null; });
        if (payload && payload.error_code === 'RESTORE_STATE_UNCERTAIN') {
          setServerRestoreError('İşlem durumu belirsiz, teknik kontrol gerekli. Tekrar restore başlatmayın.');
          return;
        }
        if (!res.ok || !payload || payload.success !== true) {
          throw new Error((payload && (payload.error_code || payload.message)) || ('HTTP ' + res.status));
        }
        alert('Sunucu geri yükleme commit edildi. Sayfa yenilenecek.\nİşlem: ' + String(payload.transaction_id || ''));
        scheduleImportTerminalReload({
          manualRefreshMessage: 'Restore tamamlandı ancak sayfa yenilenemedi. Lütfen sayfayı manuel yenileyin.'
        });
      } catch (err) {
        var msg = err && err.message ? String(err.message) : 'Commit hatası';
        if (msg.indexOf('RESTORE_STATE_UNCERTAIN') !== -1) {
          setServerRestoreError('İşlem durumu belirsiz, teknik kontrol gerekli. Tekrar restore başlatmayın.');
        } else {
          setServerRestoreError(msg);
        }
      } finally {
        serverRestoreUi.inFlight = false;
        if (commitBtn) commitBtn.setAttribute('aria-busy', 'false');
        updateServerRestoreCommitEnabled();
      }
    }

    function bindServerRestorePanelOnce() {
      if (window.__medisaServerRestoreUiBound) return;
      window.__medisaServerRestoreUiBound = true;
      var refresh = document.getElementById('server-restore-refresh-btn');
      var dry = document.getElementById('server-restore-dryrun-btn');
      var commit = document.getElementById('server-restore-commit-btn');
      var confirmInput = document.getElementById('server-restore-confirmation');
      if (refresh) refresh.addEventListener('click', function() { refreshServerRestorePanel(); });
      if (dry) dry.addEventListener('click', function() { runServerRestoreDryRun(); });
      if (commit) commit.addEventListener('click', function() { runServerRestoreCommit(); });
      if (confirmInput) confirmInput.addEventListener('input', updateServerRestoreCommitEnabled);
    }
    /* medisa-server-restore-ui:end */

    // Dosyadan içe aktar (legacy JSON veya full-backup ZIP)
    window.importData = function importData() {
      if (!requireBackupPermission()) return;
      try {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,.zip,application/json,application/zip';
        input.setAttribute('aria-label', 'Yedek JSON veya ZIP dosyası seç');
        input.style.position = 'fixed';
        input.style.left = '-9999px';
        input.style.opacity = '0';

        input.onchange = function(e) {
          const file = e.target.files[0];
          if (!file) return;

          const name = String(file.name || '').toLowerCase();
          if (name.endsWith('.zip')) {
            processImportedFullBackupZip(file);
          } else {
            const reader = new FileReader();
            reader.onload = function(event) {
              processImportedBackupText(event.target.result);
            };
            reader.readAsText(file);
          }
          if (input.parentNode) input.parentNode.removeChild(input);
        };

        document.body.appendChild(input);
        input.click();
        setTimeout(function() {
          if (input.parentNode) input.parentNode.removeChild(input);
        }, 30000);
      } catch (err) {
        alert('Dosya seçici açılamadı. Lütfen tekrar deneyin.');
      }
    };

    async function processImportedFullBackupZip(file) {
      if (!tryBeginImportTransaction()) {
        notifyImportInFlightBlocked();
        return;
      }
      try {
        const dateStr = file && file.lastModified
          ? new Date(file.lastModified).toLocaleString('tr-TR')
          : 'Bilinmiyor';
        const sizeKb = file && file.size ? Math.max(1, Math.round(file.size / 1024)) : 0;
        const message = 'Tam sistem yedeği (ZIP)\n\n'
          + 'Dosya: ' + (file && file.name ? file.name : 'yedek.zip') + '\n'
          + 'Boyut: ' + sizeKb + ' KB\n'
          + 'Dosya tarihi: ' + dateStr + '\n\n'
          + 'Mevcut sunucu verileri ve referans belgeler bu yedekle değiştirilecek. Emin misiniz?';
        if (!window.confirm(message)) {
          return;
        }

        const formData = new FormData();
        formData.append('backup', file, file.name || 'medisa_yedek.zip');
        const requestOptions = {
          method: 'POST',
          cache: 'no-store',
          body: formData
        };
        if (typeof window.buildAuthHeaders === 'function') {
          requestOptions.headers = window.buildAuthHeaders();
        } else if (typeof buildAuthHeaders === 'function') {
          requestOptions.headers = buildAuthHeaders();
        }
        // FormData ile Content-Type set etme — boundary browser'a bırakılır
        if (requestOptions.headers && requestOptions.headers['Content-Type']) {
          delete requestOptions.headers['Content-Type'];
        }

        const res = await fetch('full_backup_restore.php', requestOptions);
        const payload = await res.json().catch(function() { return null; });
        if (!res.ok || !payload || payload.success !== true) {
          const msg = (payload && payload.message)
            ? String(payload.message)
            : 'ZIP yedekten geri yükleme başarısız.';
          alert(msg);
          return;
        }
        alert('Tam yedek başarıyla geri yüklendi. Sayfa yenilenecek.');
        scheduleImportTerminalReload({
          manualRefreshMessage: 'Geri yükleme tamamlandı ancak sayfa yenilenemedi. Lütfen sayfayı manuel yenileyin.'
        });
      } catch (err) {
        console.error('[Medisa] ZIP restore hatası:', err);
        alert('ZIP yedekten geri yükleme başarısız.');
      } finally {
        importInFlight = false;
      }
    }

    // Önbellek temizliğinden önce çağrılır: sunucu ve/veya yerel yedek.
    async function uploadToServer() {
      try {
        const backup = buildFullBackupPayload({ upload_date: new Date().toISOString() });
        const branches = backup.branches;
        const users = backup.users;
        const vehicles = backup.vehicles;

        function storeLocalBackup(payload) {
          try {
            localStorage.setItem("medisa_server_backup", JSON.stringify(payload));
            return true;
          } catch (storageError) {
            if (typeof window.__medisaLogError === "function") {
              window.__medisaLogError("Cache clear local backup", storageError);
            } else {
              console.warn("Local backup could not be written:", storageError);
            }
            return false;
          }
        }

        // saveDataToServer yoksa yalnızca yerel kopya
        if (typeof window.saveDataToServer !== "function") {
          const localBackupOnly = storeLocalBackup(backup);
          return {
            success: localBackupOnly,
            localBackup: localBackupOnly,
            serverBackup: false,
            message: "Yerel yedek Oluşturuldu."
          };
        }

        // appData'yı yedek snapshot ile hizala
        if (window.appData && typeof window.appData === "object") {
          const hasAppUsers = Array.isArray(window.appData.users) && window.appData.users.length > 0;
          window.appData = {
            ...window.appData,
            branches: branches,
            tasitlar: vehicles,
            users: hasAppUsers ? window.appData.users : users
          };
        }

        const serverSaved = await window.saveDataToServer();
        if (!serverSaved) {
          const localBackupFallback = storeLocalBackup(backup);
          return {
            success: false,
            localBackup: localBackupFallback,
            serverBackup: false,
            message: "Yerel yedek Oluşturuldu ancak sunucuya Yüklenemedi."
          };
        }

        return {
          success: true,
          localBackup: false,
          serverBackup: true,
          message: "Veriler sunucuya yedeklendi."
        };
      } catch (error) {
        if (typeof window.__medisaLogError === "function") window.__medisaLogError("Yedekleme (uploadToServer)", error);
        else console.error("Yedekleme hatası:", error);
        return {
          success: false,
          localBackup: false,
          serverBackup: false,
          message: "Yedekleme sırasında hata Oluştu. Lütfen tekrar deneyin."
        };
      }
    }

    /** Tarayıcı uygulama verisini temizler: onay modalı → yedek → confirmCacheClear (anahtarlar silinir, sayfa yenilenir). Geri alınamaz. */
    window.clearCache = async function clearCache() {
      try {
        // Onay sonrası yedekleme (sunucu yalnızca kullanıcı akışında)
        const confirmMessage = 'Tarayıcı Belleği Temizlenecektir, Devam Etmek istediğinize Emin Misiniz?';
        window.openCacheConfirmModal(confirmMessage);

      } catch (error) {
        window.showInfoModal('Bir Hata Oluştu!');
      }
    };

    // ÖNBELLEK TEMİZLEME ONAY MODALI
    let cacheClearConfirmed = false;
    let allowCacheClearWithLocalBackupOnly = false;
    let allowCacheClearWithoutBackup = false;

    window.openCacheConfirmModal = function openCacheConfirmModal(message, options = {}) {
      const modal = document.getElementById('cache-confirm-modal');
      const messageEl = document.getElementById('cache-confirm-message');
      if (!modal || !messageEl) return;

      // mesajı güvenli şekilde formatla (önce escape, sonra satır sonlarını <br> ile değiştir)
      var safeMsg = (typeof window.escapeHtml === 'function' ? window.escapeHtml(message) : String(message).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'));
      messageEl.innerHTML = safeMsg.replace(/\n/g, '<br>');
      cacheClearConfirmed = false;
      allowCacheClearWithLocalBackupOnly = options && options.allowLocalBackupOnly === true;
      allowCacheClearWithoutBackup = options && options.allowClearWithoutBackup === true;

      // Body'ye modal-open class'ı ekle
      document.body.classList.add('modal-open');

      modal.style.display = 'flex';
      requestAnimationFrame(() => modal.classList.add('active'));
    };

    window.closeCacheConfirmModal = function closeCacheConfirmModal() {
      const modal = document.getElementById('cache-confirm-modal');
      if (!modal) return;
      modal.classList.remove('active');
      setTimeout(() => {
        modal.style.display = 'none';
        /* Bilgi modalı vb. hâlâ açıksa modal-open kalmalı; script-core.updateFooterDim tüm overlay’lere göre senkronlar */
        if (typeof window.updateFooterDim === 'function') {
          window.updateFooterDim();
        } else {
          document.body.classList.remove('modal-open');
        }
      }, 300);
    };

    window.confirmCacheClear = async function confirmCacheClear() {
      cacheClearConfirmed = true;
      closeCacheConfirmModal();

      try {
        window.showInfoModal('Veriler Yedekleniyor...');
        const result = await uploadToServer();

        if (!result.success && !result.localBackup) {
          if (!allowCacheClearWithoutBackup) {
            const noBackupMessage = 'Yedekleme başarısız oldu!\n\nTarayıcı Belleği Yine De Temizlensin mi?\n(Bu işlem geri alınamaz.)';
            if (typeof window.closeInfoModal === 'function') {
              window.closeInfoModal();
            }
            window.openCacheConfirmModal(noBackupMessage, { allowClearWithoutBackup: true });
            return;
          }
        }

        if (!result.success && !allowCacheClearWithLocalBackupOnly && !allowCacheClearWithoutBackup) {
          // Sunucu yedeği başarısız: Kullanıcıya yerel yedekle devam etme seçeneği ver
          const retryMessage = 'Veriler Sunucuya Yüklenemedi!\nYerel Yedek Oluşturuldu.\n\nYine De Temizlemek İstiyor Musunuz?';
          if (typeof window.closeInfoModal === 'function') {
            window.closeInfoModal();
          }
          window.openCacheConfirmModal(retryMessage, { allowLocalBackupOnly: true });
          return;
        }

        var legacyLocalStorageKeys = [
          'medisa_branches_v1',
          'medisa_users_v1',
          'medisa_vehicles_v1',
          'medisa_notif_read_keys_v1',
          'vehicle_column_order',
          'stok_active_columns',
          'stok_column_order',
          'stok_base_column_order'
        ];
        legacyLocalStorageKeys.forEach(function(k) { localStorage.removeItem(k); });
        try {
          var migrationFlags = [];
          for (var li = 0; li < localStorage.length; li++) {
            var storageKey = localStorage.key(li);
            if (storageKey && storageKey.indexOf('medisa_notif_read_migrated_') === 0) {
              migrationFlags.push(storageKey);
            }
          }
          migrationFlags.forEach(function(k) { localStorage.removeItem(k); });
        } catch (purgeErr) {}
        try {
          sessionStorage.removeItem('notifViewedKeysV2');
        } catch (sessionPurgeErr) {}

        const backupResultMessage = result.serverBackup
          ? 'Veriler sunucuya yedeklendi ve tarayıcı belleği temizlendi.'
          : 'Yerel yedek korunarak tarayıcı belleği temizlendi.';
        window.showInfoModal(backupResultMessage);

        // 3. Sayfayı yenile
        setTimeout(() => {
          window.location.reload();
        }, 2000);

      } catch (error) {
        window.showInfoModal('Bir Hata Oluştu!');
      }
    };

    // BİLGİ MODALI (Alert yerine)
    window.showInfoModal = function showInfoModal(message) {
      const modal = document.getElementById('info-modal');
      const messageEl = document.getElementById('info-message');
      if (!modal || !messageEl) return;

      // mesajı güvenli şekilde formatla (önce escape, sonra satır sonlarını <br> ile değiştir)
      var safeMsg = (typeof window.escapeHtml === 'function' ? window.escapeHtml(message) : String(message).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'));
      messageEl.innerHTML = safeMsg.replace(/\n/g, '<br>');

      // Body'ye modal-open class'ı ekle
      document.body.classList.add('modal-open');

      modal.style.display = 'flex';
      requestAnimationFrame(() => modal.classList.add('active'));
    };

    window.closeInfoModal = function closeInfoModal() {
      const modal = document.getElementById('info-modal');
      if (!modal) return;
      modal.classList.remove('active');
      setTimeout(() => {
        modal.style.display = 'none';
        if (typeof window.updateFooterDim === 'function') {
          window.updateFooterDim();
        } else {
          document.body.classList.remove('modal-open');
        }
      }, 300);
    };

    // Ortada bilgi kutusu - Üstteki modal (dis-veri-panel vb.) kapanmaz
    window.showCenteredInfoBox = function showCenteredInfoBox(message) {
      const overlay = document.getElementById('centered-info-box');
      const msgEl = document.getElementById('centered-info-message');
      if (!overlay || !msgEl) return;
      var safeMsg = (typeof window.escapeHtml === 'function' ? window.escapeHtml(message) : String(message).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'));
      msgEl.innerHTML = safeMsg.replace(/\n/g, '<br>');
      overlay.style.display = 'flex';
    };
    window.closeCenteredInfoBox = function closeCenteredInfoBox() {
      const overlay = document.getElementById('centered-info-box');
      if (!overlay) return;
      overlay.style.display = 'none';
    };

    let centeredInfoBoxTimer = null;

    function clearCenteredInfoBoxTimer() {
      if (centeredInfoBoxTimer) {
        clearTimeout(centeredInfoBoxTimer);
        centeredInfoBoxTimer = null;
      }
    }

    function resetCenteredInfoBoxAnchorState() {
      const overlay = document.getElementById('centered-info-box');
      const inner = overlay ? overlay.querySelector('.centered-info-box-inner') : null;
      clearCenteredInfoBoxTimer();
      if (overlay) {
        overlay.classList.remove('centered-info-box-overlay--anchored');
        overlay.classList.remove('centered-info-box-overlay--bare-text');
      }
      if (!inner) return;
      inner.style.removeProperty('top');
      inner.style.removeProperty('left');
      inner.style.removeProperty('right');
      inner.style.removeProperty('bottom');
    }

    function positionCenteredInfoBoxAboveAnchor(anchorEl, offsetAbove) {
      const overlay = document.getElementById('centered-info-box');
      const inner = overlay ? overlay.querySelector('.centered-info-box-inner') : null;
      if (!overlay || !inner || !anchorEl || typeof anchorEl.getBoundingClientRect !== 'function') return;

      const rect = anchorEl.getBoundingClientRect();
      const innerRect = inner.getBoundingClientRect();
      const gap = Number.isFinite(offsetAbove) ? offsetAbove : 15;
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
      const minMargin = 16;
      const maxLeft = Math.max(minMargin, viewportWidth - innerRect.width - minMargin);
      const desiredLeft = rect.left + (rect.width / 2) - (innerRect.width / 2);
      const desiredTop = rect.top - innerRect.height - gap;
      const left = Math.min(Math.max(minMargin, desiredLeft), maxLeft);
      const top = Math.max(minMargin, Math.min(desiredTop, viewportHeight - innerRect.height - minMargin));

      overlay.classList.add('centered-info-box-overlay--anchored');
      inner.style.left = left + 'px';
      inner.style.top = top + 'px';
    }

    const originalShowCenteredInfoBox = window.showCenteredInfoBox;
    window.showCenteredInfoBox = function showCenteredInfoBox(message, options) {
      if (typeof originalShowCenteredInfoBox !== 'function') return;
      resetCenteredInfoBoxAnchorState();
      originalShowCenteredInfoBox(message);

      const overlay = document.getElementById('centered-info-box');

      let anchorEl = options && options.anchorEl ? options.anchorEl : null;
      let offsetAbove = options && Number.isFinite(options.offsetAbove) ? options.offsetAbove : 15;
      const variant = options && typeof options.variant === 'string' ? options.variant : '';
      const autoCloseMs = options && Number.isFinite(options.autoCloseMs) ? options.autoCloseMs : 0;

      if (overlay && variant === 'bare-text') {
        overlay.classList.add('centered-info-box-overlay--bare-text');
      }

      if (!anchorEl && typeof message === 'string' && message.indexOf('Kasko listesi') !== -1) {
        anchorEl = document.getElementById('tsb-indir-btn');
        offsetAbove = 15;
      }

      if (anchorEl) {
        requestAnimationFrame(function() {
          positionCenteredInfoBoxAboveAnchor(anchorEl, offsetAbove);
        });
      }

      if (autoCloseMs > 0) {
        centeredInfoBoxTimer = setTimeout(function() {
          window.closeCenteredInfoBox();
        }, autoCloseMs);
      }
    };

    const originalCloseCenteredInfoBox = window.closeCenteredInfoBox;
    window.closeCenteredInfoBox = function closeCenteredInfoBox() {
      resetCenteredInfoBoxAnchorState();
      if (typeof originalCloseCenteredInfoBox === 'function') {
        originalCloseCenteredInfoBox();
      }
    };
  })();
