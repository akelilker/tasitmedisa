/**
 * Admin Aylık Kullanıcı Raporu – loadReport, tablo, WhatsApp, bekleyen talepler
 */

(function () {
  var API_BASE = './';
  var APP_VERSION = 'v78.3';
  var reportPeriod = '';
  var reportBranch = '';
  var reportStatus = '';
  var branches = [];
  var dimTimeout = null;
  var monthlyReportRecords = [];
  var monthlyReportBranchCards = [];
  var monthlyReportView = 'list';
  var monthlyReportQuery = '';
  var monthlyMobileSortState = { key: '', direction: 'asc' };
  var monthlyBranchSelectionMade = false;
  var userAnalyticsUsers = [];
  var userAnalyticsTasitlar = [];
  var userAnalyticsMonthlyRecords = [];
  var userAnalyticsView = 'list';
  var userAnalyticsQuery = '';
  var userAnalyticsBranchId = null;
  var userAnalyticsSelectedUserId = null;

  function getStoredPortalToken() {
    try {
      return localStorage.getItem('medisa_portal_token')
        || sessionStorage.getItem('medisa_portal_token')
        || localStorage.getItem('driver_token')
        || sessionStorage.getItem('driver_token')
        || '';
    } catch (e) {
      return '';
    }
  }

  function buildAuthHeaders(extraHeaders) {
    var headers = Object.assign({}, extraHeaders || {});
    var token = getStoredPortalToken();
    if (token) {
      headers.Authorization = 'Bearer ' + token;
    }
    return headers;
  }

  function syncAdminHeaderUserName(user) {
    var nameEl = document.getElementById('main-header-user-name');
    if (!nameEl) return;
    var displayName = String((user && (user.isim || user.name || user.ad_soyad)) || '').trim();
    nameEl.textContent = displayName;
    nameEl.classList.toggle('is-empty', displayName === '');
  }

  function bindExpandableSearch(toggleId, containerId, inputId) {
    var toggle = document.getElementById(toggleId);
    var container = document.getElementById(containerId);
    var input = document.getElementById(inputId);
    if (!toggle || !container || toggle.dataset.expandableBound === '1') return;

    function removeOutsideListener() {
      document.removeEventListener('pointerdown', handleOutsidePointerDown, true);
    }

    function handleOutsidePointerDown(event) {
      if (!container.classList.contains('open')) {
        removeOutsideListener();
        return;
      }
      if ((toggle.contains && toggle.contains(event.target)) || (container.contains && container.contains(event.target))) {
        return;
      }
      container.classList.remove('open');
      removeOutsideListener();
    }

    toggle.addEventListener('click', function(event) {
      event.preventDefault();
      event.stopPropagation();
      var shouldOpen = !container.classList.contains('open');
      container.classList.toggle('open', shouldOpen);
      removeOutsideListener();
      if (shouldOpen) {
        setTimeout(function() {
          document.addEventListener('pointerdown', handleOutsidePointerDown, true);
          if (input) input.focus();
        }, 0);
      }
    });

    if (input) {
      input.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') {
          container.classList.remove('open');
          removeOutsideListener();
          toggle.focus();
        }
      });
    }

    toggle.dataset.expandableBound = '1';
  }

  function redirectToPortalLogin() {
    if (typeof window === 'undefined') return;
    var nextPath = '';
    try {
      nextPath = (window.location.pathname || '') + (window.location.search || '') + (window.location.hash || '');
    } catch (e) {
      nextPath = '';
    }
    window.location.href = '../driver/' + (nextPath ? ('?next=' + encodeURIComponent(nextPath)) : '');
  }

  function isOpenedFromNotifications() {
    try {
      var params = new URLSearchParams(window.location.search || '');
      return params.get('from') === 'notifications';
    } catch (e) {
      return false;
    }
  }

  function initNotificationsBackButton() {
    var backBtn = document.getElementById('admin-notifications-back-btn');
    var fromNotifications = isOpenedFromNotifications();
    document.body.classList.toggle('report-from-notifications', fromNotifications);
    if (!backBtn) return;
    backBtn.hidden = !fromNotifications;
    if (backBtn.dataset.bound === '1') return;
    backBtn.addEventListener('click', function() {
      window.location.href = '../index.html?openNotifications=1';
    });
    backBtn.dataset.bound = '1';
  }

  function fetchJson(url, options) {
    var requestOptions = Object.assign({ cache: 'no-store' }, options || {});
    requestOptions.headers = buildAuthHeaders(requestOptions.headers || {});
    return fetch(url, requestOptions).then(function (response) {
      return response.text().then(function (raw) {
        var data = {};
        try {
          data = raw ? JSON.parse(raw) : {};
        } catch (e) {
          data = {};
        }
        if (!data || typeof data !== 'object') {
          data = {};
        }
        data.__httpStatus = response.status;
        data.__raw = raw;
        if (response.status === 401 || response.status === 403 || data.auth_required === true || data.permission_denied === true) {
          redirectToPortalLogin();
          throw new Error('auth');
        }
        return data;
      });
    });
  }

  // CSS Spinner Animasyonu için (eğer yoksa ekle)
  if (!document.getElementById('spinner-style')) {
    var style = document.createElement('style');
    style.id = 'spinner-style';
    style.innerHTML = '@keyframes spin { 100% { transform:rotate(360deg); } }';
    document.head.appendChild(style);
  }

  function getMonthOptions() {
    var opts = [];
    var d = new Date();
    for (var i = 0; i < 12; i++) {
      var y = d.getFullYear();
      var m = d.getMonth() - i;
      if (m < 0) {
        m += 12;
        y -= 1;
      }
      var val = y + '-' + String(m + 1).padStart(2, '0');
      opts.push({ value: val, label: val });
    }
    return opts;
  }

  function loadBranches() {
    return fetchJson(API_BASE + 'admin_report.php?action=branches')
      .then(function (data) {
        syncAdminHeaderUserName(data.current_user || null);
        if (data.success && data.branches) {
          branches = data.branches;
          if (userAnalyticsUsers.length && typeof window.renderUserAnalytics === 'function') {
            window.renderUserAnalytics();
          }
        }
      })
      .catch(function () {});
  }

  function loadReport() {
    var periodSelect = document.getElementById('report-period');
    reportPeriod = periodSelect ? periodSelect.value : new Date().toISOString().slice(0, 7);

    var url = API_BASE + 'admin_report.php?period=' + encodeURIComponent(reportPeriod)
      + '&branch=' + encodeURIComponent(reportBranch || '')
      + '&status=' + encodeURIComponent(reportStatus || '');

    fetchJson(url)
      .then(function (data) {
        syncAdminHeaderUserName(data.current_user || null);
        if (!data.success) {
          if (document.getElementById('report-error')) {
            document.getElementById('report-error').textContent = data.message || 'Rapor yüklenemedi.';
            document.getElementById('report-error').style.display = 'block';
          }
          monthlyReportRecords = [];
          monthlyReportBranchCards = [];
          renderMonthlyBranchGrid();
          renderMonthlySelectionBar({});
          syncMonthlyDetailStage();
          renderMonthlyResults([]);
          return;
        }
        if (document.getElementById('report-error')) {
          document.getElementById('report-error').style.display = 'none';
        }
        monthlyReportRecords = Array.isArray(data.records) ? data.records : [];
        monthlyReportBranchCards = Array.isArray(data.branch_cards) ? data.branch_cards : [];
        reportBranch = data.selected_branch && data.selected_branch !== 'all' ? String(data.selected_branch) : '';

        renderMonthlyBranchGrid();
        renderStats(data.stats || {});
        renderMonthlySelectionBar(data.stats || {});
        syncMonthlyDetailStage();
        syncReportStatusPills();
        syncMonthlyViewToggle();
        renderMonthlyResults(monthlyReportRecords);
      })
      .catch(function (err) {
        if (err && err.message === 'auth') {
          return;
        }
        if (document.getElementById('report-error')) {
          document.getElementById('report-error').textContent = 'Rapor yüklenemedi.';
          document.getElementById('report-error').style.display = 'block';
        }
        monthlyReportRecords = [];
        syncMonthlyDetailStage();
        renderMonthlyResults([]);
      });
  }

  function renderStats(stats) {
    var totalEl = document.getElementById('stat-total');
    var trackedEl = document.getElementById('stat-tracked');
    var enteredEl = document.getElementById('stat-entered');
    var pendingEl = document.getElementById('stat-pending');
    var unassignedEl = document.getElementById('stat-unassigned');

    var toplamTasit = stats.total != null ? Number(stats.total) : 0;
    var takiptekiTasit = stats.tracked_total != null ? Number(stats.tracked_total) : 0;
    var toplamYapilan = stats.entered != null ? Number(stats.entered) : 0;
    var toplamBekleyen = stats.pending != null ? Number(stats.pending) : Math.max(0, takiptekiTasit - toplamYapilan);
    var atamasiYok = stats.unassigned != null ? Number(stats.unassigned) : Math.max(0, toplamTasit - takiptekiTasit);

    if (totalEl) totalEl.textContent = String(toplamTasit || 0);
    if (trackedEl) trackedEl.textContent = String(takiptekiTasit || 0);
    if (enteredEl) enteredEl.textContent = String(toplamYapilan || 0);
    if (pendingEl) pendingEl.textContent = String(toplamBekleyen || 0);
    if (unassignedEl) unassignedEl.textContent = String(atamasiYok || 0);

    var pendingBox = pendingEl ? pendingEl.closest('.report-stat-box-pending') : null;
    if (pendingBox) {
      pendingBox.classList.toggle('has-data', toplamBekleyen > 0);
    }

    var mutedBox = unassignedEl ? unassignedEl.closest('.report-stat-box-muted') : null;
    if (mutedBox) {
      mutedBox.classList.toggle('has-data', atamasiYok > 0);
    }
  }
  function capitalizeWords(str) { return (typeof window.capitalizeWords === 'function' ? window.capitalizeWords(str) : str); }
  function normalizeDisplayName(rawValue) {
    var text = String(rawValue == null ? '' : rawValue).trim();
    if (!text) return '';
    text = text.replace(/\s+/g, ' ');
    var repeatSplit = function(source, pattern) {
      var t = source;
      var prev;
      do {
        prev = t;
        t = t.replace(pattern, '$1 $2');
      } while (t !== prev);
      return t;
    };
    try {
      text = repeatSplit(text, /(\p{Ll})(\p{Lu})/gu);
    } catch (e) {
      text = repeatSplit(text, /([a-zçğıöşü\u0131])([A-ZÇĞİÖŞÜ\u0130])/g);
    }
    return text.replace(/\s+/g, ' ').trim();
  }
  function getDriverDisplayName(rawName, fallbackLabel) {
    var normalized = normalizeDisplayName(rawName);
    if (!normalized) return fallbackLabel || '';
    return capitalizeWords(normalized);
  }
  function normalizeForSearch(v) {
    return String(v || '')
      .toLocaleLowerCase('tr-TR')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  var svgClock = '<svg class="durum-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>';
  var svgCheck = '<svg class="durum-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';

  function getKmStateMeta(record) {
    if (record && record.atama_var === false) {
      return {
        kmState: 'UNASSIGNED',
        isWarning: false,
        rowClass: 'row-unassigned',
        statusText: 'Tahsisi Olmayan',
        statusIcon: ''
      };
    }

    var kmState = String(record && record.km_state ? record.km_state : 'OK');
    var isWarning = kmState === 'FIRST_ENTRY_REQUIRED' || kmState === 'MONTHLY_UPDATE_DUE_SOFT' || kmState === 'MONTHLY_UPDATE_DUE_HARD';
    var rowClass = 'row-success';
    if (kmState === 'FIRST_ENTRY_REQUIRED' || kmState === 'MONTHLY_UPDATE_DUE_HARD') {
      rowClass = 'row-km-overdue';
    } else if (kmState === 'MONTHLY_UPDATE_DUE_SOFT') {
      rowClass = 'row-km-warning';
    } else if (record && (record.kaza_var || record.bakim_var)) {
      rowClass = 'row-warning';
    }

    var statusTextMap = {
      FIRST_ENTRY_REQUIRED: 'İlk KM Zorunlu',
      MONTHLY_UPDATE_DUE_SOFT: 'KM Güncellensin',
      MONTHLY_UPDATE_DUE_HARD: 'KM Girişi Zorunlu',
      TELAFI_CLOSED: 'Telafi Edildi',
      OK: 'KM Tamam'
    };
    var statusText = statusTextMap[kmState] || 'KM Tamam';
    var statusIcon = isWarning ? svgClock : svgCheck;
    return {
      kmState: kmState,
      isWarning: isWarning,
      rowClass: rowClass,
      statusText: statusText,
      statusIcon: statusIcon
    };
  }

  function createReportRow(record) {
    var tr = document.createElement('tr');
    var kmMeta = getKmStateMeta(record);
    tr.className = kmMeta.rowClass;

    var aracText = (record.arac_marka || '') + (record.arac_model ? ' ' + record.arac_model : '');
    var formattedKm = record.km != null ? (typeof window.formatKm === 'function' ? window.formatKm(record.km) : String(record.km)) : '–';
    // Bildirim girilmemişse ve eski bir KM varsa yanına soluk renkle (Eski) yazıyoruz
    var kmText = (!record.girdi && record.km != null) ? '<span style="color: var(--muted); font-size: 0.85em;">(Eski)</span> ' + formattedKm : formattedKm;

    var durumCell = '<span class="durum-icon ' + (kmMeta.isWarning ? 'durum-bildirilmedi' : 'durum-bildirildi') + '" title="' + escapeHtml(kmMeta.statusText) + '">' + kmMeta.statusIcon + '</span><span class="durum-text">' + escapeHtml(kmMeta.statusText) + '</span>';

    var surucuAdi = getDriverDisplayName(record.surucu_adi || '', '');
    var aracDisplay = formatBrandModel(aracText.trim() || '');
    var plakaDisplay = (record.plaka || '').toString().trim().toLocaleUpperCase('tr-TR');

    var escapeAttrFn = typeof window.escapeAttr === 'function' ? window.escapeAttr : function(s) { return (s == null ? '' : String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;')); };
    tr.innerHTML =
      '<td>' + escapeHtml(surucuAdi || '–') + '</td>' +
      '<td>' + escapeHtml(aracDisplay || '–') + '</td>' +
      '<td>' + escapeHtml(plakaDisplay || '–') + '</td>' +
      '<td>' + escapeHtml(kmText) + '</td>' +
      '<td class="durum-cell">' + durumCell + '</td>' +
      '<td class="action-cell">' +
        (record.telefon && kmMeta.isWarning ? '<button type="button" class="whatsapp-btn" title="WhatsApp" aria-label="WhatsApp" data-phone="' + escapeAttrFn(record.telefon) + '" data-name="' + escapeAttrFn(surucuAdi || 'Sürücü') + '" data-plaka="' + escapeAttrFn(record.plaka) + '"><svg class="whatsapp-icon" width="25" height="25" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg></button>' : '') +
      '</td>';

    var btn = tr.querySelector('.whatsapp-btn');
    if (btn) {
      btn.addEventListener('click', function () {
        sendWhatsApp(btn.dataset.phone, btn.dataset.name, btn.dataset.plaka, reportPeriod);
      });
    }
    return tr;
  }

  function renderTable(records) {
    var tbody = document.getElementById('report-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    records.forEach(function (r) {
      tbody.appendChild(createReportRow(r));
    });
  }

  function resolveAdminDriverLink() {
    try {
      var pathname = (typeof window !== 'undefined' && window.location && window.location.pathname) ? window.location.pathname : '/';
      var parts = String(pathname || '/').split('/').filter(Boolean);
      if (!parts.length) return '/driver/';
      var lastPart = parts[parts.length - 1] || '';
      if (lastPart.indexOf('.') !== -1) parts.pop();
      var lastDir = (parts[parts.length - 1] || '').toLowerCase();
      if (lastDir === 'admin' || lastDir === 'driver') parts.pop();
      var appRoot = parts.length ? ('/' + parts.join('/') + '/') : '/';
      if (typeof window !== 'undefined' && window.location && window.location.origin) {
        return window.location.origin + appRoot + 'driver/';
      }
      return appRoot + 'driver/';
    } catch (e) {
      return '/driver/';
    }
  }

  function sendWhatsApp(phone, name, plaka, donem) {
    phone = (phone || '').replace(/\D/g, '');
    if (phone.indexOf('90') !== 0) phone = '90' + phone;
    var driverLink = resolveAdminDriverLink();
    var text = 'Sn. ' + (name || '') + ', ' + (donem || '') + ' Dönemi İçin; Kullanımınıza Tahsis Edilen (' + (plaka || '') + ') Plakalı Taşıt İle İlgili; Uygulamamız Üzerinden Bilgi Güncellemesi Yapmanızı Rica Ederiz. Bildirmek için tıklayın: ' + driverLink;
    var url = 'https://wa.me/' + phone + '?text=' + encodeURIComponent(text);
    window.open(url, '_blank');
  }

  function sendReportEmail(email, name, plaka, donem) {
    var address = String(email || '').trim();
    if (!address) return;
    var driverLink = resolveAdminDriverLink();
    var subject = (donem || '') + ' dönem kilometre bildirimi';
    var body = 'Merhaba ' + (name || '') + ',\n\n'
      + (donem || '') + ' dönemi için kullanımınıza tahsis edilen '
      + (plaka || '') + ' plakalı taşıta ait bilgi güncellemesini uygulama üzerinden tamamlamanızı rica ederiz.\n\n'
      + 'Bağlantı: ' + driverLink;
    window.location.href = 'mailto:' + encodeURIComponent(address) + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
  }

  function getSelectedMonthlyBranchLabel() {
    var selectedId = String(reportBranch || 'all');
    var match = (monthlyReportBranchCards || []).find(function(item) {
      return String(item.id) === selectedId;
    });
    return match ? toTitleCase(match.name || match.id || 'Tümü') : 'Tümü';
  }

  function syncMonthlyDetailStage() {
    var branchGrid = document.getElementById('report-branch-grid');
    var emptyState = document.getElementById('monthly-stage-empty');
    var detailState = document.getElementById('monthly-stage-detail');
    var shouldShowDetail = monthlyBranchSelectionMade === true;

    if (branchGrid) branchGrid.hidden = shouldShowDetail;
    if (emptyState) emptyState.hidden = shouldShowDetail;
    if (detailState) detailState.hidden = !shouldShowDetail;
  }

  function getMonthlyFilteredRecords(records) {
    var query = normalizeForSearch(monthlyReportQuery);
    if (!query) return (records || []).slice();

    return (records || []).filter(function(record) {
      var haystack = [
        record.plaka,
        record.surucu_adi,
        record.arac_marka,
        record.arac_model,
        record.brand_model,
        record.branch_name,
        record.telefon,
        record.email
      ].map(normalizeForSearch).join(' ');
      return haystack.indexOf(query) !== -1;
    });
  }

  function renderMonthlySelectionBar(stats) {
    var bar = document.getElementById('report-selection-bar');
    if (!bar) return;
    if (!monthlyBranchSelectionMade) {
      bar.innerHTML = '';
      return;
    }

    bar.innerHTML =
      '<div class="universal-back-bar report-selection-backbar">' +
        '<button type="button" class="universal-back-btn monthly-reset-selection" id="monthly-reset-selection" title="Şubelere dön">' +
          '<svg class="back-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>' +
          '<span class="universal-back-label">Şubeler</span>' +
        '</button>' +
      '</div>';

    var resetBtn = document.getElementById('monthly-reset-selection');
    if (resetBtn) {
      resetBtn.addEventListener('click', function() {
        monthlyBranchSelectionMade = false;
        reportBranch = '';
        reportStatus = '';
        monthlyReportQuery = '';
        var searchInput = document.getElementById('report-search');
        var searchContainer = document.getElementById('report-search-container');
        if (searchInput) searchInput.value = '';
        if (searchContainer) searchContainer.classList.remove('open');
        syncReportStatusPills();
        renderMonthlyBranchGrid();
        renderMonthlySelectionBar({});
        syncMonthlyDetailStage();
      });
    }
  }

  function renderMonthlyBranchGrid() {
    var container = document.getElementById('report-branch-grid');
    if (!container) return;
    var cards = monthlyReportBranchCards || [];
    if (!cards.length) {
      container.innerHTML = '';
      return;
    }

    var selectedId = String(reportBranch || 'all');
    var html = '';
    cards.forEach(function(card) {
      var cardId = String(card.id || '');
      var activeClass = monthlyBranchSelectionMade && cardId === selectedId ? ' active' : '';
      var allClass = cardId === 'all' ? ' all-card' : '';
      html += '<button type="button" class="branch-card' + allClass + activeClass + '" data-report-branch="' + escapeHtmlLocal(cardId) + '">';
      html += '<span class="branch-name">' + escapeHtmlLocal(String(card.name || '').toLocaleUpperCase('tr-TR')) + '</span>';
      html += '<span class="branch-count">' + escapeHtmlLocal(card.count || 0) + ' Taşıt</span>';
      html += '</button>';
    });
    container.innerHTML = html;

    Array.prototype.forEach.call(container.querySelectorAll('[data-report-branch]'), function(button) {
      button.addEventListener('click', function() {
        var selectedBranch = button.getAttribute('data-report-branch');
        var searchInput = document.getElementById('report-search');
        var searchContainer = document.getElementById('report-search-container');
        monthlyBranchSelectionMade = true;
        reportBranch = selectedBranch === 'all' ? '' : selectedBranch;
        reportStatus = '';
        monthlyReportQuery = '';
        if (searchInput) searchInput.value = '';
        if (searchContainer) searchContainer.classList.remove('open');
        syncMonthlyDetailStage();
        loadReport();
      });
    });
  }

  function syncReportStatusPills() {
    Array.prototype.forEach.call(document.querySelectorAll('.report-status-pill'), function(button) {
      button.classList.toggle('active', String(button.getAttribute('data-status') || '') === String(reportStatus || ''));
    });
  }

  var SVG_MONTHLY_LIST_ICON =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
    '<line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line>' +
    '<line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>';
  var SVG_MONTHLY_CARD_ICON =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
    '<rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect>' +
    '<rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>';

  function syncMonthlyViewToggle() {
    var btn = document.getElementById('monthly-view-toggle');
    if (!btn) return;
    if (monthlyReportView === 'card') {
      btn.innerHTML = SVG_MONTHLY_LIST_ICON;
      btn.title = 'Liste görünümü';
      btn.setAttribute('aria-label', 'Liste görünümü');
    } else {
      btn.innerHTML = SVG_MONTHLY_CARD_ICON;
      btn.title = 'Kutu görünümü';
      btn.setAttribute('aria-label', 'Kutu görünümü');
    }
  }

  function syncUserAnalyticsViewToggle() {
    var btn = document.getElementById('user-analytics-view-toggle');
    if (!btn) return;
    if (userAnalyticsView === 'card') {
      btn.innerHTML = SVG_MONTHLY_LIST_ICON;
      btn.title = 'Liste görünümü';
      btn.setAttribute('aria-label', 'Liste görünümü');
    } else {
      btn.innerHTML = SVG_MONTHLY_CARD_ICON;
      btn.title = 'Kutu görünümü';
      btn.setAttribute('aria-label', 'Kutu görünümü');
    }
  }

  function applyUserAnalyticsViewClasses() {
    var container = document.getElementById('user-analytics-container');
    if (container) {
      container.classList.toggle('view-list', userAnalyticsView === 'list');
      container.classList.toggle('view-card', userAnalyticsView === 'card');
    }
  }

  function buildMonthlyStatusBadge(record, kmMeta, iconOnly) {
    iconOnly = !!iconOnly;
    function iconWrap(cssClass, ariaLabel, svgInner, titleText) {
      var tip = titleText != null && String(titleText).length ? String(titleText) : String(ariaLabel);
      return '<span class="monthly-status-badge monthly-status-icon ' + cssClass + '" role="img" aria-label="' + escapeHtmlLocal(ariaLabel) + '" title="' + escapeHtmlLocal(tip) + '">' + svgInner + '</span>';
    }
    var svgXNotReported = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
    if (record && record.atama_var === false) {
      if (iconOnly) {
        return iconWrap(
          'is-unassigned',
          'Tahsisi olmayan',
          '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
          'Sürücü atanmamış. Bu taşıt için kullanıcı tanımlı değil.'
        );
      }
      return '<span class="monthly-status-badge is-unassigned">Tahsisi Olmayan</span>';
    }
    if (kmMeta.isWarning) {
      if (iconOnly) {
        var warnTip = (kmMeta.statusText ? kmMeta.statusText + ' — ' : '') + 'Bu dönem için kilometre bildirimi yapılmadı veya eksik.';
        return iconWrap(
          'is-not-reported',
          kmMeta.statusText || 'Bildirilmedi',
          svgXNotReported,
          warnTip
        );
      }
      return '<span class="monthly-status-badge is-not-reported">' + escapeHtmlLocal(kmMeta.statusText) + '</span>';
    }
    if (record && record.kaza_var) {
      if (iconOnly) {
        return iconWrap(
          'is-alert',
          'KM tamam, kaza bildirimi var',
          '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
          'Kilometre güncel; bu taşıt için kaza bildirimi kaydı var.'
        );
      }
      return '<span class="monthly-status-badge is-alert">KM Tamam · Kaza</span>';
    }
    if (record && record.bakim_var) {
      if (iconOnly) {
        return iconWrap(
          'is-info',
          'KM tamam, bakım bildirimi var',
          '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
          'Kilometre güncel; bakım bildirimi kaydı var.'
        );
      }
      return '<span class="monthly-status-badge is-info">KM Tamam · Bakım</span>';
    }
    if (record && record.telafi) {
      if (iconOnly) {
        return iconWrap(
          'is-info',
          'Telafi edildi',
          '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
          'Kilometre telafi ile kapatıldı.'
        );
      }
      return '<span class="monthly-status-badge is-info">Telafi Edildi</span>';
    }
    if (iconOnly) {
      return iconWrap(
        'is-success',
        'KM tamam',
        '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>',
        'Bu dönem için kilometre bildirimi tamamlandı.'
      );
    }
    return '<span class="monthly-status-badge is-success">KM Tamam</span>';
  }

  function buildMonthlyActions(record, kmMeta) {
    var escapeAttrFn = typeof window.escapeAttr === 'function'
      ? window.escapeAttr
      : function(value) {
          return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        };

    if (!record || record.atama_var === false || !kmMeta.isWarning) return '';

    var html = '<div class="monthly-report-actions">';
    if (record.telefon) {
      var waDriverName = getDriverDisplayName(record.surucu_adi || '', 'Sürücü');
      html += '<button type="button" class="report-action-btn report-action-whatsapp"'
        + ' data-phone="' + escapeAttrFn(record.telefon) + '"'
        + ' data-name="' + escapeAttrFn(waDriverName) + '"'
        + ' data-plaka="' + escapeAttrFn(record.plaka) + '"'
        + ' title="WhatsApp bildirimi" aria-label="WhatsApp bildirimi">'
        + '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>'
        + '</button>';
    }
    if (record.email) {
      var mailDriverName = getDriverDisplayName(record.surucu_adi || '', 'Sürücü');
      html += '<button type="button" class="report-action-btn report-action-email"'
        + ' data-email="' + escapeAttrFn(record.email) + '"'
        + ' data-name="' + escapeAttrFn(mailDriverName) + '"'
        + ' data-plaka="' + escapeAttrFn(record.plaka) + '"'
        + ' title="E-posta bildirimi" aria-label="E-posta bildirimi">'
        + '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16v16H4z"></path><path d="m4 7 8 6 8-6"></path></svg>'
        + '</button>';
    }
    html += '</div>';
    return html;
  }

  function bindMonthlyResultActions(container) {
    if (!container) return;

    Array.prototype.forEach.call(container.querySelectorAll('.report-action-whatsapp'), function(button) {
      button.addEventListener('click', function(event) {
        event.stopPropagation();
        sendWhatsApp(button.getAttribute('data-phone'), button.getAttribute('data-name'), button.getAttribute('data-plaka'), reportPeriod);
      });
    });

    Array.prototype.forEach.call(container.querySelectorAll('.report-action-email'), function(button) {
      button.addEventListener('click', function(event) {
        event.stopPropagation();
        sendReportEmail(button.getAttribute('data-email'), button.getAttribute('data-name'), button.getAttribute('data-plaka'), reportPeriod);
      });
    });
  }

  /*
  function isMonthlyMobileViewport() {
    return window.matchMedia('(max-width: 640px)').matches;
  }

  function getMonthlySortableValue(record, key) {
    if (key === 'plate') return formatPlaka(record.plaka || '-').toLocaleUpperCase('tr-TR');
    if (key === 'brand') return capitalizeWords((record.brand_model || ((record.arac_marka || '') + ' ' + (record.arac_model || ''))).trim() || '-');
    if (key === 'driver') return record.atama_var === false ? 'Atama bulunmuyor' : getDriverDisplayName(record.surucu_adi, 'Sürücü tanımsız');
    if (key === 'km') return Number(record.km || 0);
    if (key === 'branch') return toTitleCase(record.branch_name || 'Şubesiz');
    if (key === 'status') return (getKmStateMeta(record).statusLabel || '').toLocaleLowerCase('tr-TR');
    return '';
  }

  function applyMonthlyMobileSorting(records) {
    if (!isMonthlyMobileViewport() || !monthlyMobileSortState.key) return records;

    var sortKey = monthlyMobileSortState.key;
    var sortDirection = monthlyMobileSortState.direction === 'desc' ? -1 : 1;

    return records.slice().sort(function(a, b) {
      var valueA = getMonthlySortableValue(a, sortKey);
      var valueB = getMonthlySortableValue(b, sortKey);

      if (sortKey === 'km') {
        return (valueA - valueB) * sortDirection;
      }
      return String(valueA).localeCompare(String(valueB), 'tr', { sensitivity: 'base' }) * sortDirection;
    });
  }

  function shouldShowMobileStatusWhatsapp(record, kmMeta) {
    if (!isMonthlyMobileViewport()) return false;
    if (!record || !record.telefon) return false;
    return kmMeta.statusClass === 'is-not-reported' || kmMeta.statusClass === 'is-unassigned' || kmMeta.statusClass === 'is-alert';
  }

  function bindMonthlyMobileSorting(container) {
    if (!container || !isMonthlyMobileViewport()) return;

    Array.prototype.forEach.call(container.querySelectorAll('.monthly-sortable-header'), function(button) {
      button.addEventListener('click', function() {
        var sortKey = button.getAttribute('data-sort-key');
        if (!sortKey) return;
        if (monthlyMobileSortState.key === sortKey) {
          monthlyMobileSortState.direction = monthlyMobileSortState.direction === 'asc' ? 'desc' : 'asc';
        } else {
          monthlyMobileSortState.key = sortKey;
          monthlyMobileSortState.direction = 'asc';
        }
        renderMonthlyResults(monthlyReportRecords || []);
      });
    });
  }
  */

  function isMonthlyMobileViewport() {
    return window.matchMedia('(max-width: 640px)').matches;
  }

  var MONTHLY_UNASSIGNED_DRIVER_SORT = 'tahsis edilmemiş';

  function getMonthlyUnassignedDriverDisplayText() {
    return isMonthlyMobileViewport() ? '-' : 'Tahsis edilmemiş';
  }

  function formatMonthlyListDriverCellHtml(driverName) {
    var s = String(driverName == null ? '' : driverName).trim();
    if (!s) {
      return '<span>' + escapeHtmlLocal('-') + '</span>';
    }
    var idx = s.indexOf(' ');
    if (idx === -1) {
      return '<span>' + escapeHtmlLocal(s) + '</span>';
    }
    var first = s.slice(0, idx);
    var rest = s.slice(idx + 1).trim();
    if (!rest) {
      return '<span>' + escapeHtmlLocal(first) + '</span>';
    }
    return '<span>' + escapeHtmlLocal(first) + '</span> <span>' + escapeHtmlLocal(rest) + '</span>';
  }

  function getMonthlySortableValue(record, key) {
    if (key === 'plate') return formatPlaka(record.plaka || '-').toLocaleUpperCase('tr-TR');
    if (key === 'brand') return formatBrandModel((record.brand_model || ((record.arac_marka || '') + ' ' + (record.arac_model || ''))).trim() || '-');
    if (key === 'driver') return record.atama_var === false ? MONTHLY_UNASSIGNED_DRIVER_SORT : getDriverDisplayName(record.surucu_adi, 'Sürücü tanımsız');
    if (key === 'km') return Number(record.km || 0);
    if (key === 'branch') return toTitleCase(record.branch_name || 'Şubesiz');
    if (key === 'status') return String(getKmStateMeta(record).statusText || '').toLocaleLowerCase('tr-TR');
    return '';
  }

  function applyMonthlyMobileSorting(records) {
    if (!monthlyMobileSortState.key) return records;

    var sortKey = monthlyMobileSortState.key;
    var sortDirection = monthlyMobileSortState.direction === 'desc' ? -1 : 1;

    return records.slice().sort(function(a, b) {
      var valueA = getMonthlySortableValue(a, sortKey);
      var valueB = getMonthlySortableValue(b, sortKey);

      if (sortKey === 'km') {
        return (valueA - valueB) * sortDirection;
      }
      return String(valueA).localeCompare(String(valueB), 'tr', { sensitivity: 'base' }) * sortDirection;
    });
  }

  function shouldShowMobileStatusWhatsapp(record, kmMeta) {
    if (!isMonthlyMobileViewport()) return false;
    if (!record || record.atama_var === false || !kmMeta.isWarning || !record.telefon) return false;
    return true;
  }

  function bindMonthlyMobileSorting(container) {
    if (!container) return;

    Array.prototype.forEach.call(container.querySelectorAll('.monthly-sortable-header'), function(button) {
      button.addEventListener('click', function() {
        var sortKey = button.getAttribute('data-sort-key');
        if (!sortKey) return;
        if (monthlyMobileSortState.key === sortKey) {
          monthlyMobileSortState.direction = monthlyMobileSortState.direction === 'asc' ? 'desc' : 'asc';
        } else {
          monthlyMobileSortState.key = sortKey;
          monthlyMobileSortState.direction = 'asc';
        }
        renderMonthlyResults(monthlyReportRecords || []);
      });
    });
  }

  function renderMonthlyResults(records) {
    var container = document.getElementById('monthly-report-content');
    if (!container) return;
    if (!monthlyBranchSelectionMade) {
      container.innerHTML = '';
      return;
    }

    var filteredRecords = getMonthlyFilteredRecords(records);

    if (!filteredRecords || !filteredRecords.length) {
      container.innerHTML = '<p class="user-analytics-empty">Seçilen filtreye uygun taşıt bulunamadı.</p>';
      return;
    }
    filteredRecords = applyMonthlyMobileSorting(filteredRecords);

    var html = '';
    if (monthlyReportView === 'card') {
      html += '<div class="view-card monthly-report-cards">';
      filteredRecords.forEach(function(record) {
        var kmMeta = getKmStateMeta(record);
        var vehicleTitle = formatBrandModel((record.brand_model || ((record.arac_marka || '') + ' ' + (record.arac_model || ''))).trim() || '-');
        var driverName = record.atama_var === false ? getMonthlyUnassignedDriverDisplayText() : getDriverDisplayName(record.surucu_adi, 'Sürücü tanımsız');
        html += '<article class="card monthly-report-card ' + kmMeta.rowClass + '">';
        html += '<div class="card-plate">' + escapeHtmlLocal(formatPlaka(record.plaka || '-')) + '</div>';
        html += '<div class="card-brand-model">' + escapeHtmlLocal(vehicleTitle) + '</div>';
        html += '<div class="card-third-line">' + escapeHtmlLocal(driverName) + ' · ' + escapeHtmlLocal(toTitleCase(record.branch_name || 'Şubesiz')) + '</div>';
        html += '<div class="monthly-report-card-km">' + escapeHtmlLocal(formatKmValue(record.km)) + ' KM</div>';
        html += buildMonthlyStatusBadge(record, kmMeta, true);
        html += buildMonthlyActions(record, kmMeta);
        html += '</article>';
      });
      html += '</div>';
    } else {
      html += '<div class="monthly-report-list-table">';
      html += '<div class="monthly-report-list-header">';
      html += '<div class="monthly-report-list-cell cell-plate"><button type="button" class="monthly-sortable-header" data-sort-key="plate">PLAKA' + (monthlyMobileSortState.key === 'plate' ? ' ' + (monthlyMobileSortState.direction === 'asc' ? '▲' : '▼') : '') + '</button></div>';
      html += '<div class="monthly-report-list-cell cell-brand"><button type="button" class="monthly-sortable-header" data-sort-key="brand">MARKA / MODEL' + (monthlyMobileSortState.key === 'brand' ? ' ' + (monthlyMobileSortState.direction === 'asc' ? '▲' : '▼') : '') + '</button></div>';
      html += '<div class="monthly-report-list-cell cell-driver"><button type="button" class="monthly-sortable-header" data-sort-key="driver">KULLANICI' + (monthlyMobileSortState.key === 'driver' ? ' ' + (monthlyMobileSortState.direction === 'asc' ? '▲' : '▼') : '') + '</button></div>';
      html += '<div class="monthly-report-list-cell cell-km"><button type="button" class="monthly-sortable-header" data-sort-key="km">KM' + (monthlyMobileSortState.key === 'km' ? ' ' + (monthlyMobileSortState.direction === 'asc' ? '▲' : '▼') : '') + '</button></div>';
      html += '<div class="monthly-report-list-cell cell-branch"><button type="button" class="monthly-sortable-header" data-sort-key="branch">ŞUBE' + (monthlyMobileSortState.key === 'branch' ? ' ' + (monthlyMobileSortState.direction === 'asc' ? '▲' : '▼') : '') + '</button></div>';
      html += '<div class="monthly-report-list-cell cell-status"><button type="button" class="monthly-sortable-header" data-sort-key="status">DURUM' + (monthlyMobileSortState.key === 'status' ? ' ' + (monthlyMobileSortState.direction === 'asc' ? '▲' : '▼') : '') + '</button></div>';
      html += '<div class="monthly-report-list-cell cell-action">İŞLEM</div>';
      html += '</div>';
      html += '<div class="monthly-report-list">';
      filteredRecords.forEach(function(record) {
        var kmMeta = getKmStateMeta(record);
        var vehicleTitle = formatBrandModel((record.brand_model || ((record.arac_marka || '') + ' ' + (record.arac_model || ''))).trim() || '-');
        var driverName = record.atama_var === false ? getMonthlyUnassignedDriverDisplayText() : getDriverDisplayName(record.surucu_adi, 'Sürücü tanımsız');
        var actionHtml = buildMonthlyActions(record, kmMeta) || '<span class="monthly-action-placeholder">-</span>';
        html += '<article class="monthly-report-list-row ' + kmMeta.rowClass + '">';
        html += '<div class="monthly-report-list-cell cell-plate">' + escapeHtmlLocal(formatPlaka(record.plaka || '-')) + '</div>';
        html += '<div class="monthly-report-list-cell cell-brand"><strong>' + escapeHtmlLocal(vehicleTitle) + '</strong></div>';
        html += '<div class="monthly-report-list-cell cell-driver' + (record.atama_var === false ? ' is-unassigned-driver' : '') + '">' + formatMonthlyListDriverCellHtml(driverName) + '</div>';
        html += '<div class="monthly-report-list-cell cell-km">' + escapeHtmlLocal(formatKmValue(record.km)) + '</div>';
        html += '<div class="monthly-report-list-cell cell-branch">' + escapeHtmlLocal(toTitleCase(record.branch_name || 'Şubesiz')) + '</div>';
        html += '<div class="monthly-report-list-cell cell-status">' + buildMonthlyStatusBadge(record, kmMeta, true);
        if (shouldShowMobileStatusWhatsapp(record, kmMeta)) {
          html += '<div class="monthly-mobile-status-actions">' + buildMonthlyActions(record, kmMeta) + '</div>';
        }
        html += '</div>';
        html += '<div class="monthly-report-list-cell cell-action">' + actionHtml + '</div>';
        html += '</article>';
      });
      html += '</div>';
      html += '</div>';
    }

    container.innerHTML = html;
    bindMonthlyResultActions(container);
    bindMonthlyMobileSorting(container);
  }

  function resetPendingAlertUi() {
    var badge = document.getElementById('pending-alert-count');
    var alertBtn = document.getElementById('pending-alert-btn');
    var titleEl = document.getElementById('pending-section-title');

    if (badge) {
      badge.textContent = '';
      badge.setAttribute('hidden', '');
      badge.setAttribute('aria-hidden', 'true');
    }

    if (alertBtn) {
      alertBtn.classList.remove('has-alert');
    }

    if (titleEl) {
      titleEl.classList.remove('has-pending');
    }
  }

  function loadPendingRequests() {
    fetchJson(API_BASE + 'admin_report.php?action=pending_requests')
      .then(function (data) {
        syncAdminHeaderUserName(data.current_user || null);
        if (!data.success) {
          resetPendingAlertUi();
          return;
        }
        var container = document.getElementById('pending-requests-list');
        var titleEl = document.getElementById('pending-section-title');
        if (!container) {
          resetPendingAlertUi();
          return;
        }
        container.innerHTML = '';
        var requests = data.requests || [];
        // Talep varsa başlık kırmızı olsun
        if (titleEl) {
          if (requests.length > 0) {
            titleEl.classList.add('has-pending');
          } else {
            titleEl.classList.remove('has-pending');
          }
        }
        requests.forEach(function (req) {
          var card = document.createElement('div');
          card.className = 'pending-card';
          var isGeneralRequest = req.talep_tipi === 'genel';
          var plateText = (req.plaka || '').toString().trim().toLocaleUpperCase('tr-TR');
          var vehicleText = plateText + (req.donem ? ' (' + req.donem + ')' : '');
          var pendingDriverShown = escapeHtml(getDriverDisplayName(req.surucu_adi || '', '') || req.surucu_adi || '–');
          var parts = ['<strong><span class="pending-name">' + pendingDriverShown + '</span><span class="pending-muted"> – ' + escapeHtml(vehicleText) + '</span></strong>'];
          if (isGeneralRequest) {
            var topicMap = { talep: 'Talep', sikayet: 'Şikayet', oneri: 'Öneri', diger: 'Diğer' };
            var topic = topicMap[req.konu_turu] || 'Talep';
            parts.push('<span class="pending-sebep-label">Konu: </span><span class="pending-muted">' + escapeHtml(topic) + '</span>');
            if (req.mesaj) parts.push('<span class="pending-sebep-label">Mesaj: </span><span class="pending-muted">' + escapeHtml(req.mesaj) + '</span>');
          } else {
            if (req.yeni_km != null) parts.push('<span class="pending-km-label">KM: </span><span class="pending-muted">' + escapeHtml(formatKm(req.eski_km)) + ' → ' + escapeHtml(formatKm(req.yeni_km)) + '</span>');
            if (req.yeni_bakim != null) parts.push('<span class="pending-muted">Bakım: ' + escapeHtml(String(req.eski_bakim || 'Yok')) + ' → ' + escapeHtml(req.yeni_bakim || 'Yok') + '</span>');
            if (req.yeni_kaza != null) parts.push('<span class="pending-kaza-label">Kaza: </span><span class="pending-muted">' + escapeHtml(String(req.eski_kaza || 'Yok')) + ' → ' + escapeHtml(req.yeni_kaza || 'Yok') + '</span>');
            if (req.sebep) parts.push('<span class="pending-sebep-label">Sebep: </span><span class="pending-muted">' + escapeHtml(req.sebep) + '</span>');
          }
          card.innerHTML =
            '<div class="info">' + parts.join(' ') + '</div>' +
            '<div class="actions">' +
              '<button type="button" class="approve-btn" data-id="' + escapeAttr(String(req.id)) + '">' + (isGeneralRequest ? 'Kapat' : 'Onayla') + '</button>' +
              '<button type="button" class="reject-btn" data-id="' + escapeAttr(String(req.id)) + '">Reddet</button>' +
            '</div>';
          card.querySelector('.approve-btn').addEventListener('click', function () { approveRequest(req.id); });
          card.querySelector('.reject-btn').addEventListener('click', function () { rejectRequest(req.id); });
          container.appendChild(card);
        });
        var n = requests.length;
        var badge = document.getElementById('pending-alert-count');
        var alertBtn = document.getElementById('pending-alert-btn');
        if (n === 0) {
          resetPendingAlertUi();
        } else {
          if (badge) {
            badge.textContent = n > 99 ? '99+' : String(n);
            badge.removeAttribute('hidden');
            badge.removeAttribute('aria-hidden');
          }
          if (alertBtn) alertBtn.classList.add('has-alert');
        }
      })
      .catch(function (err) {
        resetPendingAlertUi();
        if (err && err.message === 'auth') {
          return;
        }
      });
  }

  window.switchAdminTab = function(tabId) {
    // 1. Tüm butonları pasife çek
    document.querySelectorAll('.admin-tab-btn').forEach(function(btn) {
      btn.classList.remove('active');
    });
    
    // 2. Tüm panelleri gizle
    document.querySelectorAll('.admin-tab-panel').forEach(function(panel) {
      panel.classList.remove('active');
      panel.style.display = 'none';
    });

    // 3. Seçilen butonu aktif et (data-admin-tab veya onclick ile bulur)
    var activeBtn = document.querySelector('.admin-tab-btn[data-admin-tab="' + tabId + '"]') || 
                    document.querySelector('.admin-tab-btn[onclick*="' + tabId + '"]');
    if (activeBtn) {
      activeBtn.classList.add('active');
    }

    // 4. Seçilen paneli aktif et (id veya data-admin-panel ile bulur)
    var activePanel = document.getElementById('tab-' + tabId) || 
                      document.querySelector('.admin-tab-panel[data-admin-panel="' + tabId + '"]');
    if (activePanel) {
      activePanel.classList.add('active');
      activePanel.style.display = 'block';
    }

    // 5. Kullanıcı Raporları sekmesi açıldıysa verileri yükle
    if (tabId === 'kullanici' && typeof window.loadUserAnalytics === 'function') {
      window.loadUserAnalytics();
    }
  };

  // Eğer HTML tarafındaki onclick özellikleri tamamen silindiyse, butonların çalışması için global dinleyici:
  document.addEventListener('click', function(e) {
    var tabBtn = e.target.closest('.admin-tab-btn[data-admin-tab]');
    if (tabBtn && !tabBtn.hasAttribute('onclick')) {
      var tabId = tabBtn.getAttribute('data-admin-tab');
      if (tabId) window.switchAdminTab(tabId);
    }
  });

  function toTitleCase(str) {
    return (typeof window.toTitleCase === 'function' ? window.toTitleCase(str) : String(str || ''));
  }

  function formatBrandModel(str) {
    return (typeof window.formatBrandModel === 'function' ? window.formatBrandModel(str) : toTitleCase(str));
  }

  function formatAdSoyad(str) {
    return (typeof window.formatAdSoyad === 'function' ? window.formatAdSoyad(str) : String(str || ''));
  }

  function formatPlaka(str) {
    return (typeof window.formatPlaka === 'function' ? window.formatPlaka(str) : String(str || '-'));
  }

  function formatDateForDisplay(dateStr) {
    if (!dateStr) return '-';
    return (typeof window.formatDateShort === 'function' ? window.formatDateShort(dateStr) : String(dateStr));
  }

  function escapeHtmlLocal(value) {
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(value == null ? '' : String(value));
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatMoney(value) {
    var amount = Number(value || 0);
    if (typeof window.formatNumber === 'function') return window.formatNumber(amount);
    return amount.toLocaleString('tr-TR');
  }

  function parseLocalizedNumberValue(value) {
    if (value == null) return 0;
    if (typeof value === 'number') return isNaN(value) ? 0 : value;
    var normalized = String(value)
      .replace(/\s+/g, '')
      .replace(/\./g, '')
      .replace(/,/g, '.')
      .replace(/[^\d.-]/g, '');
    var parsed = parseFloat(normalized);
    return isNaN(parsed) ? 0 : parsed;
  }

  function formatKmValue(value) {
    if (value == null || String(value).trim() === '') return '-';
    if (typeof window.formatKm === 'function') return window.formatKm(value);
    return formatMoney(parseLocalizedNumberValue(value));
  }

  function formatDistanceKm(value) {
    var amount = Math.max(0, Math.round(parseLocalizedNumberValue(value)));
    return formatKmValue(amount) + ' KM';
  }

  function getPeriodSortValue(period) {
    var raw = String(period || '').trim();
    if (!/^\d{4}-\d{2}$/.test(raw)) return 0;
    return parseInt(raw.replace('-', ''), 10) || 0;
  }

  function collectUserMonthlyRecords(user) {
    var latestByKey = {};
    var userId = String((user && user.id) || '').trim();

    (userAnalyticsMonthlyRecords || []).forEach(function(record) {
      if (String((record && record.surucu_id) || '').trim() !== userId) return;

      var vehicleId = String((record && record.arac_id) || '').trim();
      var period = String((record && record.donem) || '').trim();
      if (!vehicleId || !period) return;

      var key = vehicleId + '|' + period;
      var candidateDate = String((record && (record.guncelleme_tarihi || record.kayit_tarihi)) || '').trim();
      var current = latestByKey[key];
      var currentDate = current ? String((current.guncelleme_tarihi || current.kayit_tarihi) || '').trim() : '';
      if (!current || candidateDate >= currentDate) {
        latestByKey[key] = record;
      }
    });

    return Object.keys(latestByKey).map(function(key) {
      return latestByKey[key];
    });
  }

  function summarizeUserMonthlyRecords(records) {
    var grouped = {};
    var totalDistanceKm = 0;
    var kmReportCount = 0;
    var lastReportPeriod = '';

    (records || []).forEach(function(record) {
      var vehicleId = String((record && record.arac_id) || '').trim();
      if (!vehicleId) return;

      var period = String((record && record.donem) || '').trim();
      var kmValue = parseLocalizedNumberValue(record && record.guncel_km);
      if (!kmValue && String((record && record.guncel_km) || '').trim() === '') return;

      if (!grouped[vehicleId]) grouped[vehicleId] = [];
      grouped[vehicleId].push({
        donem: period,
        sortValue: getPeriodSortValue(period),
        km: kmValue
      });

      kmReportCount++;
      if (!lastReportPeriod || getPeriodSortValue(period) > getPeriodSortValue(lastReportPeriod)) {
        lastReportPeriod = period;
      }
    });

    Object.keys(grouped).forEach(function(vehicleId) {
      var items = grouped[vehicleId];
      items.sort(function(a, b) {
        return a.sortValue - b.sortValue;
      });

      var previousKm = null;
      items.forEach(function(item) {
        if (previousKm !== null && item.km >= previousKm) {
          totalDistanceKm += (item.km - previousKm);
        }
        previousKm = item.km;
      });
    });

    return {
      totalDistanceKm: totalDistanceKm,
      kmReportCount: kmReportCount,
      lastReportPeriod: lastReportPeriod
    };
  }

  function getUserDisplayName(user) {
    return normalizeDisplayName((user && (user.isim || user.name)) || '');
  }

  function getUserPhone(user) {
    return String((user && (user.telefon || user.phone)) || '').trim();
  }

  function getUserEmail(user) {
    return String((user && (user.eposta || user.email)) || '').trim();
  }

  function getUserBranchIds(user) {
    if (!user) return [];
    if (Array.isArray(user.branchIds) && user.branchIds.length) return user.branchIds;
    if (Array.isArray(user.subeIds) && user.subeIds.length) return user.subeIds;
    if (user.branchId != null && user.branchId !== '') return [user.branchId];
    if (user.subeId != null && user.subeId !== '') return [user.subeId];
    return [];
  }

  function getBranchNameById(branchId) {
    var branch = (branches || []).find(function(b) { return String(b.id) === String(branchId); });
    return branch ? String(branch.name || branch.code || branch.id || '') : '';
  }

  function getUserBranchNames(user) {
    return getUserBranchIds(user)
      .map(getBranchNameById)
      .filter(function(name) { return !!String(name || '').trim(); });
  }

  function getUserRoleLabel(user) {
    if (typeof window.getUserRoleLabelAnalytics === 'function') {
      return window.getUserRoleLabelAnalytics(user);
    }
    var roleLabels = {
      genel_yonetici: 'Genel Yönetici',
      sube_yonetici: 'Yönetici',
      kullanici: 'Kullanıcı',
      admin: 'Genel Yönetici',
      sales: 'Satış Temsilcisi',
      driver: 'Kullanıcı'
    };
    var role = user && user.role ? user.role : '';
    var displayRole = role === 'yonetici_kullanici' ? 'sube_yonetici' : role;
    return toTitleCase(roleLabels[displayRole] || displayRole || 'Kullanıcı');
  }

  function getEventSortValue(event) {
    if (!event || typeof event !== 'object') return 0;

    var timestamp = String(event.timestamp || '').trim();
    if (timestamp) {
      var parsedTimestamp = Date.parse(timestamp);
      if (!isNaN(parsedTimestamp)) return parsedTimestamp;
    }

    var dateStr = String(event.date || '').trim();
    if (!dateStr) return 0;

    if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
      var parts = dateStr.split('/');
      var trParsed = Date.parse(parts[2] + '-' + parts[1] + '-' + parts[0] + 'T00:00:00');
      return isNaN(trParsed) ? 0 : trParsed;
    }

    var parsedDate = Date.parse(dateStr);
    return isNaN(parsedDate) ? 0 : parsedDate;
  }

  function eventMatchesUser(event, vehicle, user) {
    var eventData = event && event.data ? event.data : {};
    var userId = String((user && user.id) || '').trim();
    var userName = normalizeForSearch(getUserDisplayName(user));

    var idCandidates = [
      eventData.kullaniciId,
      event.kullaniciId
    ].map(function(value) {
      return String(value == null ? '' : value).trim();
    }).filter(function(value) {
      return value !== '';
    });

    if (idCandidates.length) {
      return idCandidates.some(function(value) {
        return value === userId;
      });
    }

    var nameCandidates = [
      eventData.surucu,
      eventData.tahsisKisi,
      eventData.kullaniciAdi,
      eventData.eskiKullaniciAdi,
      eventData.kisi,
      event.surucu,
      event.tahsisKisi,
      event.kisi
    ].map(function(value) {
      return normalizeForSearch(value);
    }).filter(function(value) {
      return value !== '';
    });

    if (nameCandidates.length) {
      return !!userName && nameCandidates.some(function(value) {
        return value === userName;
      });
    }

    return String((vehicle && vehicle.assignedUserId) || '') === userId;
  }
  function buildUserAnalyticsRecord(user) {
    var tasitlar = userAnalyticsTasitlar || [];
    var monthlyRecords = collectUserMonthlyRecords(user);
    var cezaCount = 0;
    var cezaTutar = 0;
    var kazaCount = 0;
    var kazaTutar = 0;
    var bakimCount = 0;
    var assignedVehicles = [];
    var relatedVehicleMap = {};

    function parseLocalizedNumber(value) {
      return parseFloat(String(value == null ? '' : value).replace(/\./g, '').replace(/,/g, '.')) || 0;
    }

    function findVehicleById(vehicleId) {
      return tasitlar.find(function(tasit) {
        return String((tasit && tasit.id) || '') === String(vehicleId || '');
      }) || null;
    }

    function registerRelatedVehicle(tasit, sortValue, isActiveAssigned) {
      if (!tasit) return;
      var vehicleId = String(tasit.id != null ? tasit.id : (tasit.plaka || tasit.plate || ''));
      if (!vehicleId) return;

      var plate = formatPlaka(tasit.plaka || tasit.plate || '-');
      var brand = formatBrandModel(tasit.brandModel || [tasit.arac_marka, tasit.arac_model].filter(Boolean).join(' ') || '-');
      var existing = relatedVehicleMap[vehicleId];

      if (!existing) {
        relatedVehicleMap[vehicleId] = {
          id: vehicleId,
          plate: plate,
          brand: brand,
          sortValue: sortValue || 0,
          isActive: !!isActiveAssigned
        };
        return;
      }

      if ((sortValue || 0) > (existing.sortValue || 0)) {
        existing.sortValue = sortValue || 0;
      }
      if (isActiveAssigned) {
        existing.isActive = true;
      }
    }

    tasitlar.forEach(function(tasit) {
      var isActiveAssigned = String(tasit.assignedUserId || '') === String(user.id);

      if (isActiveAssigned) {
        assignedVehicles.push(tasit);
        registerRelatedVehicle(tasit, Number.MAX_SAFE_INTEGER, true);
      }

      if (!tasit.events || !Array.isArray(tasit.events)) return;

      tasit.events.forEach(function(event) {
        if (!eventMatchesUser(event, tasit, user)) return;

        var type = String(event.type || '').toLowerCase();
        if (type === 'ceza') {
          cezaCount++;
          cezaTutar += parseLocalizedNumber((event.data && event.data.tutar) || event.tutar || '0');
        } else if (type === 'kaza') {
          kazaCount++;
          kazaTutar += parseLocalizedNumber((event.data && event.data.hasarTutari) || event.tutar || '0');
        } else if (type === 'bakim') {
          bakimCount++;
        }

        registerRelatedVehicle(tasit, getEventSortValue(event), isActiveAssigned);
      });
    });

    monthlyRecords.forEach(function(monthlyRecord) {
      var tasit = findVehicleById(monthlyRecord && monthlyRecord.arac_id);
      registerRelatedVehicle(tasit, getPeriodSortValue(monthlyRecord && monthlyRecord.donem), false);
    });

    var relatedVehicles = Object.keys(relatedVehicleMap).map(function(key) {
      return relatedVehicleMap[key];
    });

    relatedVehicles.sort(function(a, b) {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      return (b.sortValue || 0) - (a.sortValue || 0);
    });

    var monthlySummary = summarizeUserMonthlyRecords(monthlyRecords);
    var activeVehicle = assignedVehicles[0] || null;
    var fallbackVehicle = !activeVehicle && relatedVehicles.length ? relatedVehicles[0] : null;
    var vehiclePlate = activeVehicle
      ? formatPlaka(activeVehicle.plaka || activeVehicle.plate || '-')
      : (fallbackVehicle ? fallbackVehicle.plate : 'Araç Geçmişi Yok');
    var vehicleBrandSource = activeVehicle
      ? (activeVehicle.brandModel || [activeVehicle.arac_marka, activeVehicle.arac_model].filter(Boolean).join(' ') || '-')
      : (fallbackVehicle ? fallbackVehicle.brand : '');
    var vehicleBrand = activeVehicle
      ? formatBrandModel(vehicleBrandSource)
      : (fallbackVehicle ? formatBrandModel(vehicleBrandSource) : 'Araç ataması yok');
    var branchNames = getUserBranchNames(user);
    var phone = getUserPhone(user);
    var email = getUserEmail(user);
    var relatedVehicleText = relatedVehicles.map(function(item) {
      return item.plate + ' ' + item.brand;
    }).join(' ');

    var searchHaystack = [
      getUserDisplayName(user),
      phone,
      email,
      vehiclePlate,
      vehicleBrand,
      relatedVehicleText,
      branchNames.join(' '),
      monthlySummary.lastReportPeriod
    ].map(normalizeForSearch).join(' ');

    return {
      id: user.id,
      raw: user,
      isim: getUserDisplayName(user),
      adSoyad: formatAdSoyad(getUserDisplayName(user) || '-'),
      telefon: phone || '-',
      email: email || '-',
      branchIds: getUserBranchIds(user),
      branchNames: branchNames,
      branchLabel: branchNames.length ? branchNames.map(function(name) { return toTitleCase(name); }).join(', ') : '-',
      roleLabel: getUserRoleLabel(user),
      plaka: vehiclePlate,
      marka: vehicleBrand,
      assignedVehicles: assignedVehicles,
      relatedVehicles: relatedVehicles,
      relatedVehicleCount: relatedVehicles.length,
      activeVehicleCount: assignedVehicles.length,
      monthlyRecords: monthlyRecords,
      totalDistanceKm: monthlySummary.totalDistanceKm,
      kmReportCount: monthlySummary.kmReportCount,
      lastReportPeriod: monthlySummary.lastReportPeriod || '-',
      cezaCount: cezaCount,
      cezaTutar: cezaTutar,
      kazaCount: kazaCount,
      kazaTutar: kazaTutar,
      bakimCount: bakimCount,
      searchHaystack: searchHaystack
    };
  }
  function getFilteredUserAnalyticsRecords(options) {
    var query = normalizeForSearch(userAnalyticsQuery);
    var branchId = options && options.ignoreBranch ? null : userAnalyticsBranchId;
    var records = [];

    (userAnalyticsUsers || []).forEach(function(user) {
      if (user.aktif === false) return;
      if (!getUserDisplayName(user)) return;
      var record = buildUserAnalyticsRecord(user);
      if (branchId && branchId !== 'all') {
        var inBranch = record.branchIds.some(function(id) { return String(id) === String(branchId); });
        if (!inBranch) return;
      }
      if (!options || !options.ignoreQuery) {
        if (query && record.searchHaystack.indexOf(query) === -1) return;
      }
      records.push(record);
    });

    records.sort(function(a, b) {
      return a.isim.localeCompare(b.isim, 'tr');
    });
    return records;
  }

  function collectUserAnalyticsBranchItems() {
    var users = getFilteredUserAnalyticsRecords({ ignoreBranch: true, ignoreQuery: true });
    var items = [{
      id: 'all',
      name: 'Tümü',
      count: users.length,
      allCard: true
    }];

    (branches || []).forEach(function(branch) {
      var count = users.filter(function(record) {
        return (record.branchIds || []).some(function(branchId) { return String(branchId) === String(branch.id); });
      }).length;
      items.push({
        id: branch.id,
        name: branch.name || branch.code || branch.id,
        count: count,
        allCard: false
      });
    });

    return items;
  }

  function collectUserAnalyticsEvents(user) {
    var events = [];
    var uniqueMap = {};

    (userAnalyticsTasitlar || []).forEach(function(tasit) {
      if (!tasit.events || !Array.isArray(tasit.events)) return;

      tasit.events.forEach(function(event) {
        if (!eventMatchesUser(event, tasit, user)) return;

        var type = String(event.type || '').toLowerCase();
        var uniqueKey = event && event.id
          ? ('id:' + String(event.id))
          : [
              type,
              String(event.timestamp || ''),
              String(event.date || ''),
              String(tasit.id || ''),
              JSON.stringify(event.data || {})
            ].join('|');

        if (uniqueMap[uniqueKey]) return;
        uniqueMap[uniqueKey] = true;

        events.push({
          type: type,
          date: event.date || '',
          sortValue: getEventSortValue(event),
          vehiclePlate: formatPlaka(tasit.plaka || tasit.plate || '-'),
          vehicleBrand: formatBrandModel(tasit.brandModel || [tasit.arac_marka, tasit.arac_model].filter(Boolean).join(' ') || '-'),
          detail: buildUserEventDetail(event, tasit)
        });
      });
    });

    events.sort(function(a, b) {
      return (b.sortValue || 0) - (a.sortValue || 0);
    });

    return events;
  }
  function buildUserEventDetail(event, vehicle) {
    var eventData = event && event.data ? event.data : {};
    var type = String((event && event.type) || '').toLowerCase();

    function parseLocalizedNumber(value) {
      return parseFloat(String(value == null ? '' : value).replace(/\./g, '').replace(/,/g, '.')) || 0;
    }

    if (type === 'ceza') {
      var cezaAmount = parseLocalizedNumber(eventData.tutar || event.tutar || 0);
      var cezaTutar = cezaAmount > 0 ? (formatMoney(cezaAmount) + ' TL') : '-';
      var cezaDetay = toTitleCase(eventData.aciklama || event.aciklama || 'Açıklama yok');
      return 'Tutar: ' + cezaTutar + ' | Açıklama: ' + cezaDetay;
    }

    if (type === 'kaza') {
      var hasarAmount = parseLocalizedNumber(eventData.hasarTutari || event.tutar || 0);
      var hasarTutar = hasarAmount > 0 ? (formatMoney(hasarAmount) + ' TL') : '-';
      var kazaDetay = toTitleCase(eventData.aciklama || event.aciklama || 'Açıklama yok');
      return 'Hasar: ' + hasarTutar + ' | Açıklama: ' + kazaDetay;
    }

    if (type === 'bakim') {
      var bakimDetay = toTitleCase(eventData.islemler || event.islemler || eventData.aciklama || event.aciklama || '');
      return bakimDetay || 'Bakım kaydı mevcut';
    }

    if (type === 'km') {
      var kmValue = eventData.km || event.km || eventData.yeniKm || event.yeniKm || '-';
      return 'KM: ' + String(kmValue);
    }

    if (type === 'km-revize') {
      var eskiKm = eventData.eskiKm || event.eskiKm || eventData.km || event.km || '-';
      var yeniKm = eventData.yeniKm || event.yeniKm || eventData.km || event.km || '-';
      return 'Eski KM: ' + String(eskiKm) + ' | Yeni KM: ' + String(yeniKm);
    }

    if (type === 'kullanici-atama') {
      var kullaniciAdi = toTitleCase(eventData.kullaniciAdi || eventData.surucu || event.surucu || 'Kullanıcı');
      var plaka = formatPlaka((vehicle && (vehicle.plaka || vehicle.plate)) || '-');
      var marka = formatBrandModel((vehicle && (vehicle.brandModel || [vehicle.arac_marka, vehicle.arac_model].filter(Boolean).join(' '))) || '-');
      return kullaniciAdi + ' kullanıcısına atandı | Araç: ' + plaka + ' - ' + marka;
    }

    if (type === 'sube-degisiklik') {
      var eskiSube = toTitleCase(eventData.eskiSubeAdi || eventData.eskiSubeId || 'Belirtilmedi');
      var yeniSube = toTitleCase(eventData.yeniSubeAdi || eventData.yeniSubeId || 'Belirtilmedi');
      return 'Şube değişikliği: ' + eskiSube + ' -> ' + yeniSube;
    }

    var fallback = toTitleCase(eventData.aciklama || event.aciklama || '');
    return fallback || 'Kayıt mevcut';
  }
  function getSelectedBranchLabel() {
    if (!userAnalyticsBranchId || userAnalyticsBranchId === 'all') return 'Tümü';
    return toTitleCase(getBranchNameById(userAnalyticsBranchId) || userAnalyticsBranchId);
  }

  function syncUserAnalyticsToolbar() {
    var toolbar = document.querySelector('#tab-kullanici .user-analytics-toolbar');
    var searchInput = document.getElementById('user-analytics-search');
    var listModeActive = userAnalyticsBranchId !== null && !userAnalyticsSelectedUserId;
    if (toolbar) toolbar.classList.toggle('is-hidden', !listModeActive);
    if (searchInput) {
      searchInput.disabled = !listModeActive;
      searchInput.value = userAnalyticsQuery;
      searchInput.placeholder = 'İsim, Telefon, E-posta, Plaka, Marka Ara';
    }
  }

  function formatLastReportPeriod(period) {
    return period && period !== '-' ? period : 'KM kaydı yok';
  }

  function buildMetricBadges(record) {
    var html = '<div class="user-analytics-metric-badges">';
    html += '<span class="metric-pill metric-road">' + escapeHtmlLocal(formatDistanceKm(record.totalDistanceKm)) + '</span>';
    html += '<span class="metric-pill metric-report">' + escapeHtmlLocal(record.kmReportCount) + ' dönem</span>';
    html += '<span class="metric-pill metric-ceza">' + escapeHtmlLocal(record.cezaCount) + ' ceza</span>';
    html += '<span class="metric-pill metric-kaza">' + escapeHtmlLocal(record.kazaCount) + ' kaza</span>';
    html += '<span class="metric-pill metric-bakim">' + escapeHtmlLocal(record.bakimCount) + ' bakım</span>';
    html += '</div>';
    return html;
  }

  function renderUserAnalyticsBranchGrid() {
    var target = document.getElementById('user-analytics-container');
    if (!target) return;
    var items = collectUserAnalyticsBranchItems();
    if (!items.length) {
      target.innerHTML = '<p class="user-analytics-empty">Gösterilecek kullanıcı bulunamadı.</p>';
      return;
    }

    var html = '<div class="branch-grid user-analytics-branch-grid">';
    items.forEach(function(item) {
      html += '<button type="button" class="branch-card' + (item.allCard ? ' all-card' : '') + '" data-user-branch-id="' + escapeHtmlLocal(item.id) + '">';
      html += '<span class="branch-name">' + escapeHtmlLocal(String(item.name || '').toLocaleUpperCase('tr-TR')) + '</span>';
      html += '<span class="branch-count">' + escapeHtmlLocal(item.count) + ' Kullanıcı</span>';
      html += '</button>';
    });
    html += '</div>';
    target.innerHTML = html;

    Array.prototype.forEach.call(target.querySelectorAll('[data-user-branch-id]'), function(button) {
      button.addEventListener('click', function() {
        userAnalyticsBranchId = button.getAttribute('data-user-branch-id');
        userAnalyticsSelectedUserId = null;
        window.renderUserAnalytics();
      });
    });
  }

  function buildMetricRows(record) {
    var html = '<div class="user-analytics-metrics">';
    html += '<div class="metric-row metric-road"><span>Toplam Yol</span><strong>' + escapeHtmlLocal(formatDistanceKm(record.totalDistanceKm)) + '</strong></div>';
    html += '<div class="metric-row metric-report"><span>KM Bildirimi</span><strong>' + escapeHtmlLocal(record.kmReportCount) + ' Dönem</strong></div>';
    html += '<div class="metric-row metric-period"><span>Son Bildirim</span><strong>' + escapeHtmlLocal(formatLastReportPeriod(record.lastReportPeriod)) + '</strong></div>';
    html += '<div class="metric-row metric-ceza"><span>Cezalar (' + record.cezaCount + ')</span><strong>' + escapeHtmlLocal(formatMoney(record.cezaTutar)) + ' TL</strong></div>';
    html += '<div class="metric-row metric-kaza"><span>Kazalar (' + record.kazaCount + ')</span><strong>' + escapeHtmlLocal(formatMoney(record.kazaTutar)) + ' TL</strong></div>';
    html += '<div class="metric-row metric-bakim"><span>Bakımlar</span><strong>' + escapeHtmlLocal(record.bakimCount) + ' Adet</strong></div>';
    html += '</div>';
    return html;
  }

  function renderUserAnalyticsList() {
    var target = document.getElementById('user-analytics-container');
    if (!target) return;
    var records = getFilteredUserAnalyticsRecords();

    var html = '<div class="user-analytics-list-shell">';
    html += '<div class="universal-back-bar"><button type="button" class="universal-back-btn" id="user-analytics-back-to-branches" title="Geri Dön"><svg class="back-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg><span class="universal-back-label">Şubelere Dön</span></button></div>';
    html += '<div class="user-analytics-statebar"><span class="user-analytics-state-label">' + escapeHtmlLocal(getSelectedBranchLabel()) + '</span><strong>' + records.length + ' Kullanıcı</strong></div>';

    if (!records.length) {
      html += '<p class="user-analytics-empty">Aramaya veya şubeye uygun kullanıcı bulunamadı.</p></div>';
      target.innerHTML = html;
      var emptyBackBtn = document.getElementById('user-analytics-back-to-branches');
      if (emptyBackBtn) {
        emptyBackBtn.addEventListener('click', function() {
          userAnalyticsBranchId = null;
          userAnalyticsSelectedUserId = null;
          userAnalyticsQuery = '';
          window.renderUserAnalytics();
        });
      }
      return;
    }

    if (userAnalyticsView === 'list') {
      html += '<div class="user-analytics-list modern-user-list">';
      records.forEach(function(record) {
        html += '<button type="button" class="kullanici-list-item user-analytics-list-item user-analytics-clickable" data-user-id="' + escapeHtmlLocal(record.id) + '">';
        html += '<div class="kullanici-list-item-left">';
        html += '<div class="kullanici-list-item-name">' + escapeHtmlLocal(capitalizeWords(record.adSoyad)) + '</div>';
        html += '<div class="user-analytics-list-item-subtitle">' + escapeHtmlLocal(record.marka) + '</div>';
        html += '<div class="user-analytics-list-item-meta"><span>' + escapeHtmlLocal(record.branchLabel) + '</span><span>' + escapeHtmlLocal(formatLastReportPeriod(record.lastReportPeriod)) + '</span></div>';
        html += buildMetricBadges(record);
        html += '</div>';
        html += '<div class="kullanici-list-item-right">';
        html += '<div class="kullanici-list-item-plate">' + escapeHtmlLocal(record.plaka) + '</div>';
        html += '<div class="kullanici-list-item-brand">' + escapeHtmlLocal(formatDistanceKm(record.totalDistanceKm)) + '</div>';
        html += '<div class="user-analytics-list-item-mini">' + escapeHtmlLocal(record.kmReportCount) + ' dönem</div>';
        html += '</div>';
        html += '</button>';
      });
      html += '</div>';
    } else {
      html += '<div class="view-card user-analytics-cards">';
      records.forEach(function(record) {
        html += '<button type="button" class="card user-analytics-card user-analytics-clickable" data-user-id="' + escapeHtmlLocal(record.id) + '">';
        html += '<div class="card-plate">' + escapeHtmlLocal(capitalizeWords(record.adSoyad)) + '</div>';
        html += '<div class="card-brand-model">' + escapeHtmlLocal(record.marka) + '</div>';
        html += '<div class="card-third-line">' + escapeHtmlLocal(record.plaka + ' · ' + record.branchLabel) + '</div>';
        html += '<div class="user-analytics-card-summary"><span>' + escapeHtmlLocal(formatDistanceKm(record.totalDistanceKm)) + '</span><span>' + escapeHtmlLocal(record.kmReportCount) + ' dönem</span></div>';
        html += buildMetricBadges(record);
        html += '</button>';
      });
      html += '</div>';
    }

    html += '</div>';
    target.innerHTML = html;

    var backBtn = document.getElementById('user-analytics-back-to-branches');
    if (backBtn) {
      backBtn.addEventListener('click', function() {
        userAnalyticsBranchId = null;
        userAnalyticsSelectedUserId = null;
        userAnalyticsQuery = '';
        window.renderUserAnalytics();
      });
    }

    Array.prototype.forEach.call(target.querySelectorAll('[data-user-id]'), function(element) {
      element.addEventListener('click', function() {
        userAnalyticsSelectedUserId = element.getAttribute('data-user-id');
        window.renderUserAnalytics();
      });
    });
  }

  function renderUserAnalyticsDetail() {
    var target = document.getElementById('user-analytics-container');
    if (!target) return;
    var record = getFilteredUserAnalyticsRecords({ ignoreQuery: true }).find(function(item) {
      return String(item.id) === String(userAnalyticsSelectedUserId);
    });

    if (!record) {
      userAnalyticsSelectedUserId = null;
      window.renderUserAnalytics();
      return;
    }

    var userEvents = collectUserAnalyticsEvents(record.raw);
    var relatedVehicles = record.relatedVehicles || [];
    var relatedVehicleHtml = relatedVehicles.length
      ? '<div class="user-analytics-related-list">' + relatedVehicles.map(function(item) {
          return '<span class="user-analytics-related-pill">' + escapeHtmlLocal((item.plate || '-') + ' · ' + (item.brand || '-')) + '</span>';
        }).join('') + '</div>'
      : '<span class="user-analytics-detail-value">Araç geçmişi bulunamadı.</span>';

    var html = '<div class="user-analytics-detail-shell">';
    html += '<div class="universal-back-bar"><button type="button" class="universal-back-btn" id="user-analytics-back-to-list" title="Geri Dön"><svg class="back-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg><span class="universal-back-label">Listeye Dön</span></button></div>';
    html += '<div class="user-analytics-detail-grid">';
    html += '<section class="user-analytics-detail-section">';
    html += '<h3 class="user-analytics-detail-title">Kullanıcı Özeti</h3>';
    html += '<div class="user-analytics-detail-row"><span class="user-analytics-detail-label">Ad Soyad</span><span class="user-analytics-detail-value">' + escapeHtmlLocal(record.adSoyad) + '</span></div>';
    html += '<div class="user-analytics-detail-row"><span class="user-analytics-detail-label">Şube</span><span class="user-analytics-detail-value">' + escapeHtmlLocal(record.branchLabel) + '</span></div>';
    html += '<div class="user-analytics-detail-row"><span class="user-analytics-detail-label">Telefon</span><span class="user-analytics-detail-value">' + escapeHtmlLocal(record.telefon) + '</span></div>';
    html += '<div class="user-analytics-detail-row"><span class="user-analytics-detail-label">E-posta</span><span class="user-analytics-detail-value">' + escapeHtmlLocal(record.email) + '</span></div>';
    html += '<div class="user-analytics-detail-row"><span class="user-analytics-detail-label">Kullanıcı Tipi</span><span class="user-analytics-detail-value">' + escapeHtmlLocal(record.roleLabel) + '</span></div>';
    html += '<div class="user-analytics-detail-row"><span class="user-analytics-detail-label">Aktif/Zimmetli Araç</span><span class="user-analytics-detail-value">' + escapeHtmlLocal(record.plaka) + ' · ' + escapeHtmlLocal(record.marka) + '</span></div>';
    html += '<div class="user-analytics-detail-row"><span class="user-analytics-detail-label">Araç Geçmişi</span>' + relatedVehicleHtml + '</div>';
    html += buildMetricRows(record);
    html += '</section>';
    html += '<section class="user-analytics-detail-section">';
    html += '<h3 class="user-analytics-detail-title">Kullanıcı Hareketleri</h3>';
    if (!userEvents.length) {
      html += '<p class="user-analytics-empty user-analytics-empty-left">Henüz hareket kaydı bulunmamaktadır.</p>';
    } else {
      html += '<div class="user-analytics-events-list">';
      userEvents.forEach(function(event) {
        html += '<article class="user-analytics-event-item">';
        html += '<div class="user-analytics-event-head"><span class="user-analytics-event-type">' + escapeHtmlLocal((event.type || 'olay').toUpperCase()) + '</span><span class="user-analytics-event-date">' + escapeHtmlLocal(formatDateForDisplay(event.date)) + '</span></div>';
        html += '<div class="user-analytics-event-vehicle">' + escapeHtmlLocal(event.vehiclePlate) + ' - ' + escapeHtmlLocal(event.vehicleBrand) + '</div>';
        html += '<div class="user-analytics-event-detail">' + escapeHtmlLocal(event.detail) + '</div>';
        html += '</article>';
      });
      html += '</div>';
    }
    html += '</section>';
    html += '</div></div>';
    target.innerHTML = html;

    var backBtn = document.getElementById('user-analytics-back-to-list');
    if (backBtn) {
      backBtn.addEventListener('click', function() {
        userAnalyticsSelectedUserId = null;
        window.renderUserAnalytics();
      });
    }
  }

  window.loadUserAnalytics = function() {
    var container = document.getElementById('user-analytics-container');
    if (!container) return;

    if (container.dataset.loaded === 'true') {
      window.renderUserAnalytics();
      return;
    }

    container.innerHTML = '<div style="text-align:center; padding:40px;"><div class="loading-spinner" style="display:inline-block; width:30px; height:30px; border:3px solid rgba(255,255,255,0.1); border-top-color:var(--theme-color); border-radius:50%; animation:spin 1s linear infinite;"></div><p style="color:var(--muted); margin-top:15px;">Kullanıcı istatistikleri hesaplanıyor...</p></div>';

    fetchJson(API_BASE + 'admin_report.php?action=user_analytics')
      .then(function(data) {
        syncAdminHeaderUserName(data.current_user || null);
        if (!data.success) {
          container.innerHTML = '<p style="color:#ef4444; text-align:center; padding:20px;">Veriler çekilemedi.</p>';
          return;
        }
        container.dataset.loaded = 'true';
        userAnalyticsUsers = data.users || [];
        userAnalyticsTasitlar = data.tasitlar || [];
        userAnalyticsMonthlyRecords = data.monthly_records || [];
        window.renderUserAnalytics();
      })
      .catch(function(err) {
        if (err && err.message === 'auth') {
          return;
        }
        container.innerHTML = '<p style="color:#ef4444; text-align:center; padding:20px;">Bağlantı hatası.</p>';
      });
  };

  window.renderUserAnalytics = function() {
    var target = document.getElementById('user-analytics-container');
    if (!target) return;

    syncUserAnalyticsToolbar();

    if (!(userAnalyticsUsers || []).length) {
      target.innerHTML = '<p class="user-analytics-empty">Gösterilecek kullanıcı bulunamadı.</p>';
      syncUserAnalyticsViewToggle();
      applyUserAnalyticsViewClasses();
      return;
    }

    if (userAnalyticsSelectedUserId) {
      renderUserAnalyticsDetail();
      syncUserAnalyticsViewToggle();
      applyUserAnalyticsViewClasses();
      return;
    }

    if (userAnalyticsBranchId === null) {
      renderUserAnalyticsBranchGrid();
    } else {
      renderUserAnalyticsList();
    }
    syncUserAnalyticsViewToggle();
    applyUserAnalyticsViewClasses();
  };

  function approveRequest(id) {
    requestAction(id, 'approve');
  }

  function rejectRequest(id) {
    requestAction(id, 'reject');
  }

  function requestAction(id, action) {
    fetchJson(API_BASE + 'admin_approve.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request_id: id, action: action, admin_note: '' })
    })
      .then(function (data) {
        if (data.success) {
          loadPendingRequests();
          loadReport();
        } else if (data.conflict === true || data.__httpStatus === 409) {
          loadPendingRequests();
          loadReport();
        }
        alert(data.message || (action === 'approve' ? 'Onaylandı.' : 'Reddedildi.'));
      })
      .catch(function (err) {
        alert('İşlem gönderilemedi.');
      });
  }

  function exportExcel() {
    var period = document.getElementById('report-period') ? document.getElementById('report-period').value : new Date().toISOString().slice(0, 7);
    var url = API_BASE + 'admin_export.php?period=' + encodeURIComponent(period)
      + '&branch=' + encodeURIComponent(reportBranch || '')
      + '&status=' + encodeURIComponent(reportStatus || '');
    fetch(url, {
      method: 'GET',
      cache: 'no-store',
      headers: buildAuthHeaders()
    })
      .then(function (response) {
        if (response.status === 401 || response.status === 403) {
          redirectToPortalLogin();
          throw new Error('auth');
        }
        if (!response.ok) {
          return response.text().then(function (text) {
            throw new Error(text || 'Excel indirilemedi.');
          });
        }
        return Promise.all([response.blob(), Promise.resolve(response.headers.get('Content-Disposition') || '')]);
      })
      .then(function (result) {
        var blob = result[0];
        var disposition = result[1];
        var match = disposition.match(/filename=\"?([^\";]+)\"?/i);
        var filename = match && match[1] ? match[1] : ('kullanici_raporu_' + period + '.csv');
        var objectUrl = URL.createObjectURL(blob);
        var link = document.createElement('a');
        link.href = objectUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(function () {
          URL.revokeObjectURL(objectUrl);
        }, 1000);
      })
      .catch(function (err) {
        if (err && err.message === 'auth') {
          return;
        }
        alert((err && err.message) ? err.message : 'Excel indirilemedi.');
      });
  }

  function initPeriodSelect() {
    var sel = document.getElementById('report-period');
    if (!sel) return;
    sel.innerHTML = '';
    getMonthOptions().forEach(function (o) {
      var opt = document.createElement('option');
      opt.value = o.value;
      opt.textContent = o.label;
      if (o.value === new Date().toISOString().slice(0, 7)) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  function initFooterDim() {
    var footer = document.getElementById('app-footer');
    if (!footer) return;
    if (dimTimeout) {
      clearTimeout(dimTimeout);
      dimTimeout = null;
    }
    footer.classList.add('dimmed');
    footer.classList.remove('delayed');
    dimTimeout = setTimeout(function () {
      if (footer) footer.classList.add('delayed');
    }, 4000);
  }

  function initVersionDisplay() {
    var versionEl = document.getElementById('version-display');
    if (versionEl) versionEl.textContent = APP_VERSION;
  }

  function init() {
    if (!getStoredPortalToken()) {
      redirectToPortalLogin();
      return;
    }

    initPeriodSelect();
    initVersionDisplay();
    initFooterDim();
    initNotificationsBackButton();
    loadBranches().then(function () {
      loadReport();
    });
    loadPendingRequests();
    window.loadUserAnalytics();

    var reportPeriodSelect = document.getElementById('report-period');
    if (reportPeriodSelect && reportPeriodSelect.dataset.reportAutoReloadBound !== '1') {
      reportPeriodSelect.addEventListener('change', loadReport);
      reportPeriodSelect.dataset.reportAutoReloadBound = '1';
    }

    var reportSearchInput = document.getElementById('report-search');
    if (reportSearchInput) {
      reportSearchInput.addEventListener('input', function(e) {
        monthlyReportQuery = e.target.value || '';
        renderMonthlyResults(monthlyReportRecords);
      });
    }
    bindExpandableSearch('report-search-toggle', 'report-search-container', 'report-search');

    Array.prototype.forEach.call(document.querySelectorAll('.report-status-pill'), function(button) {
      if (button.dataset.reportStatusBound === '1') return;
      button.addEventListener('click', function() {
        reportStatus = button.getAttribute('data-status') || '';
        syncReportStatusPills();
        loadReport();
      });
      button.dataset.reportStatusBound = '1';
    });

    var monthlyViewToggle = document.getElementById('monthly-view-toggle');
    if (monthlyViewToggle) {
      monthlyViewToggle.addEventListener('click', function() {
        monthlyReportView = monthlyReportView === 'card' ? 'list' : 'card';
        syncMonthlyViewToggle();
        renderMonthlyResults(monthlyReportRecords);
      });
    }
    syncMonthlyViewToggle();

    var btnExport = document.getElementById('report-export');
    if (btnExport) btnExport.addEventListener('click', exportExcel);

    var searchInput = document.getElementById('user-analytics-search');
    if (searchInput) {
      searchInput.addEventListener('input', function(e) {
        userAnalyticsQuery = e.target.value || '';
        window.renderUserAnalytics();
      });
    }
    bindExpandableSearch('user-analytics-search-toggle', 'user-analytics-search-container', 'user-analytics-search');

    var userAnalyticsViewToggle = document.getElementById('user-analytics-view-toggle');
    if (userAnalyticsViewToggle) {
      userAnalyticsViewToggle.addEventListener('click', function() {
        userAnalyticsView = userAnalyticsView === 'card' ? 'list' : 'card';
        window.renderUserAnalytics();
      });
    }
    syncUserAnalyticsViewToggle();
    applyUserAnalyticsViewClasses();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
