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
  var userAnalyticsUsers = [];
  var userAnalyticsTasitlar = [];
  var userAnalyticsView = 'list';
  var userAnalyticsQuery = '';
  var userAnalyticsBranchId = null;
  var userAnalyticsSelectedUserId = null;

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
    return fetch(API_BASE + 'admin_report.php?action=branches')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.success && data.branches) {
          branches = data.branches;
          var sel = document.getElementById('report-branch');
          if (!sel) return;
          sel.innerHTML = '<option value="">Tüm Şubeler</option>';
          branches.forEach(function (b) {
            var opt = document.createElement('option');
            opt.value = b.id;
            opt.textContent = b.name || b.code || b.id;
            sel.appendChild(opt);
          });
          if (userAnalyticsUsers.length && typeof window.renderUserAnalytics === 'function') {
            window.renderUserAnalytics();
          }
        }
      })
      .catch(function () {});
  }

  function loadReport() {
    reportPeriod = document.getElementById('report-period') ? document.getElementById('report-period').value : new Date().toISOString().slice(0, 7);
    reportBranch = document.getElementById('report-branch') ? document.getElementById('report-branch').value : '';
    reportStatus = document.getElementById('report-status') ? document.getElementById('report-status').value : '';

    var url = API_BASE + 'admin_report.php?period=' + encodeURIComponent(reportPeriod) + '&branch=' + encodeURIComponent(reportBranch) + '&status=' + encodeURIComponent(reportStatus);

    fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.success) {
          if (document.getElementById('report-error')) {
            document.getElementById('report-error').textContent = data.message || 'Rapor yüklenemedi.';
            document.getElementById('report-error').style.display = 'block';
          }
          return;
        }
        if (document.getElementById('report-error')) {
          document.getElementById('report-error').style.display = 'none';
        }
        renderStats(data.stats || {});
        renderTable(data.records || []);
      })
      .catch(function () {
        if (document.getElementById('report-error')) {
          document.getElementById('report-error').textContent = 'Rapor yüklenemedi.';
          document.getElementById('report-error').style.display = 'block';
        }
      });
  }

  function renderStats(stats) {
    var totalEl = document.getElementById('stat-total');
    var enteredEl = document.getElementById('stat-entered');
    var pendingEl = document.getElementById('stat-pending');
    var pctEl = document.getElementById('stat-percentage');
    if (totalEl) totalEl.textContent = stats.total != null ? stats.total : '0';
    if (enteredEl) enteredEl.textContent = stats.entered != null ? stats.entered : '0';
    if (pendingEl) pendingEl.textContent = stats.pending != null ? stats.pending : '0';
    // Tamamlanan % = (yapılan bildirim / toplam beklenen iş) * 100 (araç/bildirim bazlı, kullanıcı sayısına bölünmez)
    var toplamYapilan = stats.entered != null ? Number(stats.entered) : 0;
    var toplamBekleyen = stats.pending != null ? Number(stats.pending) : 0;
    var toplamArac = toplamYapilan + toplamBekleyen;
    var tamamlananYuzde = toplamArac > 0 ? Math.round((toplamYapilan / toplamArac) * 100) : 0;
    if (pctEl) pctEl.textContent = tamamlananYuzde + '%';
    var pendingBox = pendingEl ? pendingEl.closest('.report-stat-box-pending') : null;
    if (pendingBox) {
      var hasPending = (stats.pending != null && Number(stats.pending) > 0);
      pendingBox.classList.toggle('has-data', !!hasPending);
    }
  }

  function capitalizeWords(str) { return (typeof window.capitalizeWords === 'function' ? window.capitalizeWords(str) : str); }
  function normalizeForSearch(v) {
    return String(v || '')
      .toLocaleLowerCase('tr-TR')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  var svgClock = '<svg class="durum-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>';
  var svgCheck = '<svg class="durum-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';

  function createReportRow(record) {
    var tr = document.createElement('tr');
    var dayOfMonth = new Date().getDate();
    var kmOverdue = !record.girdi && dayOfMonth >= 3;
    var kmWarning = !record.girdi && dayOfMonth >= 1 && !kmOverdue;
    var rowClass = 'row-success';
    if (kmOverdue) {
      rowClass = 'row-km-overdue';
    } else if (kmWarning) {
      rowClass = 'row-km-warning';
    } else if (record.girdi) {
      rowClass = record.kaza_var ? 'row-warning' : (record.bakim_var ? 'row-warning' : 'row-success');
    }

    tr.className = rowClass;

    var durum = record.girdi ? 'Bildirildi' : 'Bildirilmedi';
    if (record.girdi && record.kaza_var) durum = 'Kaza';
    else if (record.girdi && record.bakim_var) durum = 'Bakım';

    var aracText = (record.arac_marka || '') + (record.arac_model ? ' ' + record.arac_model : '');
    var kmText = record.km != null ? (typeof window.formatKm === 'function' ? window.formatKm(record.km) : String(record.km)) : '–';

    var durumCell;
    if (durum === 'Bildirilmedi') {
      durumCell = '<span class="durum-icon durum-bildirilmedi" title="Bildirilmedi">' + svgClock + '</span>';
    } else if (durum === 'Bildirildi') {
      durumCell = '<span class="durum-icon durum-bildirildi" title="Bildirildi">' + svgCheck + '</span>';
    } else {
      durumCell = escapeHtml(durum);
    }

    var surucuAdi = capitalizeWords(record.surucu_adi || '');
    var aracDisplay = capitalizeWords(aracText.trim() || '');
    var plakaDisplay = (record.plaka || '').toString().trim().toLocaleUpperCase('tr-TR');

    var escapeAttrFn = typeof window.escapeAttr === 'function' ? window.escapeAttr : function(s) { return (s == null ? '' : String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;')); };
    tr.innerHTML =
      '<td>' + escapeHtml(surucuAdi || '–') + '</td>' +
      '<td>' + escapeHtml(aracDisplay || '–') + '</td>' +
      '<td>' + escapeHtml(plakaDisplay || '–') + '</td>' +
      '<td>' + escapeHtml(kmText) + '</td>' +
      '<td class="durum-cell">' + durumCell + '</td>' +
      '<td class="action-cell">' +
        (record.telefon ? '<button type="button" class="whatsapp-btn" title="WhatsApp" aria-label="WhatsApp" data-phone="' + escapeAttrFn(record.telefon) + '" data-name="' + escapeAttrFn(record.surucu_adi) + '" data-plaka="' + escapeAttrFn(record.plaka) + '"><svg class="whatsapp-icon" width="25" height="25" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg></button>' : '') +
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

  function sendWhatsApp(phone, name, plaka, donem) {
    phone = (phone || '').replace(/\D/g, '');
    if (phone.indexOf('90') !== 0) phone = '90' + phone;
    var driverLink = (typeof window !== 'undefined' && window.location && window.location.origin)
      ? window.location.origin + '/driver/'
      : 'https://karmotors.com.tr/driver/';
    var text = 'Sn. ' + (name || '') + ', ' + (donem || '') + ' Dönemi İçin; Kullanımınıza Tahsis Edilen (' + (plaka || '') + ') Plakalı Taşıt İle İlgili; Uygulamamız Üzerinden Bilgi Güncellemesi Yapmanızı Rica Ederiz. Bildirmek için tıklayın: ' + driverLink;
    var url = 'https://wa.me/' + phone + '?text=' + encodeURIComponent(text);
    window.open(url, '_blank');
  }

  function loadPendingRequests() {
    fetch(API_BASE + 'admin_report.php?action=pending_requests')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.success) return;
        var container = document.getElementById('pending-requests-list');
        var titleEl = document.getElementById('pending-section-title');
        if (!container) return;
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
          var parts = ['<strong><span class="pending-name">' + escapeHtml(req.surucu_adi) + '</span><span class="pending-muted"> – ' + escapeHtml((req.plaka || '').toString().trim().toLocaleUpperCase('tr-TR')) + ' (' + escapeHtml(req.donem) + ')</span></strong>'];
          if (req.yeni_km != null) parts.push('<span class="pending-km-label">KM: </span><span class="pending-muted">' + escapeHtml(formatKm(req.eski_km)) + ' → ' + escapeHtml(formatKm(req.yeni_km)) + '</span>');
          if (req.yeni_bakim != null) parts.push('<span class="pending-muted">Bakım: ' + escapeHtml(String(req.eski_bakim || 'Yok')) + ' → ' + escapeHtml(req.yeni_bakim || 'Yok') + '</span>');
          if (req.yeni_kaza != null) parts.push('<span class="pending-kaza-label">Kaza: </span><span class="pending-muted">' + escapeHtml(String(req.eski_kaza || 'Yok')) + ' → ' + escapeHtml(req.yeni_kaza || 'Yok') + '</span>');
          if (req.sebep) parts.push('<span class="pending-sebep-label">Sebep: </span><span class="pending-muted">' + escapeHtml(req.sebep) + '</span>');
          card.innerHTML =
            '<div class="info">' + parts.join(' ') + '</div>' +
            '<div class="actions">' +
              '<button type="button" class="approve-btn" data-id="' + escapeAttr(String(req.id)) + '">Onayla</button>' +
              '<button type="button" class="reject-btn" data-id="' + escapeAttr(String(req.id)) + '">Reddet</button>' +
            '</div>';
          card.querySelector('.approve-btn').addEventListener('click', function () { approveRequest(req.id); });
          card.querySelector('.reject-btn').addEventListener('click', function () { rejectRequest(req.id); });
          container.appendChild(card);
        });
      })
      .catch(function () {});
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

  function getUserDisplayName(user) {
    return String((user && (user.isim || user.name)) || '').trim();
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
    var roleLabels = {
      genel_yonetici: 'Genel Yönetici',
      sube_yonetici: 'Yönetici',
      yonetici_kullanici: 'Yönetici+Kullanıcı',
      kullanici: 'Kullanıcı',
      admin: 'Genel Yönetici',
      sales: 'Satış Temsilcisi',
      driver: 'Kullanıcı'
    };
    var role = user && user.role ? user.role : '';
    var isManagerWithPanel = role === 'sube_yonetici' && user && (user.kullanici_paneli === true || user.surucu_paneli === true);
    var displayRole = isManagerWithPanel ? 'yonetici_kullanici' : role;
    return toTitleCase(roleLabels[displayRole] || displayRole || 'Kullanıcı');
  }

  function eventMatchesUser(event, vehicle, user) {
    var eventData = event && event.data ? event.data : {};
    var eventSurucu = normalizeForSearch(eventData.surucu || event.surucu || '');
    var eventTahsis = normalizeForSearch(eventData.tahsisKisi || event.tahsisKisi || '');
    var userName = normalizeForSearch(getUserDisplayName(user));
    if (userName && ((eventSurucu && eventSurucu.indexOf(userName) !== -1) || (eventTahsis && eventTahsis.indexOf(userName) !== -1))) {
      return true;
    }
    return !eventSurucu && !eventTahsis && String(vehicle.assignedUserId || '') === String(user.id);
  }

  function buildUserAnalyticsRecord(user) {
    var tasitlar = userAnalyticsTasitlar || [];
    var cezaCount = 0;
    var cezaTutar = 0;
    var kazaCount = 0;
    var kazaTutar = 0;
    var bakimCount = 0;
    var assignedVehicles = [];

    tasitlar.forEach(function(tasit) {
      if (String(tasit.assignedUserId || '') === String(user.id)) {
        assignedVehicles.push(tasit);
      }
      if (!tasit.events || !Array.isArray(tasit.events)) return;
      tasit.events.forEach(function(event) {
        if (!eventMatchesUser(event, tasit, user)) return;
        if (event.type === 'ceza') {
          cezaCount++;
          cezaTutar += parseFloat(String(((event.data && event.data.tutar) || event.tutar || '0')).replace(/\./g, '').replace(/,/g, '.')) || 0;
        } else if (event.type === 'kaza') {
          kazaCount++;
          kazaTutar += parseFloat(String(((event.data && event.data.hasarTutari) || event.tutar || '0')).replace(/\./g, '').replace(/,/g, '.')) || 0;
        } else if (event.type === 'bakim') {
          bakimCount++;
        }
      });
    });

    var activeVehicle = assignedVehicles[0] || null;
    var vehiclePlate = activeVehicle ? formatPlaka(activeVehicle.plaka || activeVehicle.plate || '-') : 'Zimmetli Araç Yok';
    var vehicleBrandSource = activeVehicle ? (activeVehicle.brandModel || [activeVehicle.arac_marka, activeVehicle.arac_model].filter(Boolean).join(' ') || '-') : '';
    var vehicleBrand = activeVehicle ? toTitleCase(vehicleBrandSource) : 'Araç ataması yok';
    var branchNames = getUserBranchNames(user);
    var phone = getUserPhone(user);
    var email = getUserEmail(user);
    var searchHaystack = [
      getUserDisplayName(user),
      phone,
      email,
      vehiclePlate,
      vehicleBrand,
      branchNames.join(' ')
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
    var users = (userAnalyticsUsers || []).filter(function(user) {
      return user.aktif !== false && !!getUserDisplayName(user);
    });
    var items = [{
      id: 'all',
      name: 'Tümü',
      count: users.length,
      allCard: true
    }];

    (branches || []).forEach(function(branch) {
      var count = users.filter(function(user) {
        return getUserBranchIds(user).some(function(branchId) { return String(branchId) === String(branch.id); });
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
    (userAnalyticsTasitlar || []).forEach(function(tasit) {
      if (!tasit.events || !Array.isArray(tasit.events)) return;
      tasit.events.forEach(function(event) {
        if (!eventMatchesUser(event, tasit, user)) return;
        events.push({
          type: String(event.type || '').toLowerCase(),
          date: event.date || '',
          vehiclePlate: formatPlaka(tasit.plaka || tasit.plate || '-'),
          vehicleBrand: toTitleCase(tasit.brandModel || [tasit.arac_marka, tasit.arac_model].filter(Boolean).join(' ') || '-'),
          detail: buildUserEventDetail(event)
        });
      });
    });
    events.sort(function(a, b) {
      var dateA = a.date ? new Date(a.date) : new Date(0);
      var dateB = b.date ? new Date(b.date) : new Date(0);
      return dateB - dateA;
    });
    return events;
  }

  function buildUserEventDetail(event) {
    var eventData = event && event.data ? event.data : {};
    if (event.type === 'ceza') {
      var cezaTutar = (eventData.tutar || event.tutar) ? formatMoney(parseFloat(String(eventData.tutar || event.tutar || '0').replace(/\./g, '').replace(/,/g, '.')) || 0) + ' TL' : '-';
      var cezaDetay = toTitleCase(eventData.aciklama || event.aciklama || 'Ceza bildirimi');
      return 'Ceza: ' + cezaTutar + ' | ' + cezaDetay;
    }
    if (event.type === 'kaza') {
      var hasarTutar = (eventData.hasarTutari || event.tutar) ? formatMoney(parseFloat(String(eventData.hasarTutari || event.tutar || '0').replace(/\./g, '').replace(/,/g, '.')) || 0) + ' TL' : '-';
      var kazaDetay = toTitleCase(eventData.aciklama || event.aciklama || 'Kaza bildirimi');
      return 'Hasar: ' + hasarTutar + ' | ' + kazaDetay;
    }
    if (event.type === 'bakim') {
      return toTitleCase(eventData.islemler || event.islemler || event.aciklama || 'Bakım bildirimi');
    }
    if (event.type === 'km') {
      return 'KM: ' + String(eventData.km || event.km || '-');
    }
    return toTitleCase(eventData.aciklama || event.aciklama || 'Kayıt mevcut');
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
      searchInput.placeholder = 'İsim, telefon, e-posta, plaka, marka ara';
    }
  }

  function renderUserAnalyticsBranchGrid() {
    var target = document.getElementById('user-analytics-container');
    if (!target) return;
    var items = collectUserAnalyticsBranchItems();
    if (!items.length) {
      target.innerHTML = '<p class="user-analytics-empty">Gösterilecek kullanıcı bulunamadı.</p>';
      return;
    }

    var html = '<div class="user-analytics-branch-grid">';
    items.forEach(function(item) {
      html += '<button type="button" class="user-analytics-branch-card' + (item.allCard ? ' all-card' : '') + '" data-user-branch-id="' + escapeHtmlLocal(item.id) + '">';
      html += '<span class="user-analytics-branch-name">' + escapeHtmlLocal(toTitleCase(item.name)) + '</span>';
      html += '<span class="user-analytics-branch-count">' + escapeHtmlLocal(item.count) + ' Kullanıcı</span>';
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
    html += '<div class="metric-row metric-ceza"><span>Cezalar (' + record.cezaCount + ')</span><strong>' + formatMoney(record.cezaTutar) + ' TL</strong></div>';
    html += '<div class="metric-row metric-kaza"><span>Kazalar (' + record.kazaCount + ')</span><strong>' + formatMoney(record.kazaTutar) + ' TL</strong></div>';
    html += '<div class="metric-row metric-bakim"><span>Bakımlar</span><strong>' + record.bakimCount + ' Adet</strong></div>';
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
      html += '<div class="user-analytics-list">';
      records.forEach(function(record) {
        html += '<button type="button" class="user-analytics-item user-analytics-clickable" data-user-id="' + escapeHtmlLocal(record.id) + '">';
        html += '<div class="user-analytics-head"><h3>' + escapeHtmlLocal(capitalizeWords(record.adSoyad)) + '</h3><span class="user-analytics-plate">' + escapeHtmlLocal(record.plaka) + '</span></div>';
        html += '<div class="user-analytics-submeta"><span>' + escapeHtmlLocal(record.marka) + '</span><span>' + escapeHtmlLocal(record.branchLabel) + '</span></div>';
        html += '<div class="user-analytics-contact-row"><span>' + escapeHtmlLocal(record.telefon) + '</span><span>' + escapeHtmlLocal(record.email) + '</span></div>';
        html += buildMetricRows(record);
        html += '</button>';
      });
      html += '</div>';
    } else {
      html += '<div class="user-analytics-cards">';
      records.forEach(function(record) {
        html += '<button type="button" class="user-analytics-card user-analytics-clickable" data-user-id="' + escapeHtmlLocal(record.id) + '">';
        html += '<div class="card-accent"></div>';
        html += '<h3>' + escapeHtmlLocal(capitalizeWords(record.adSoyad)) + '</h3>';
        html += '<div class="user-analytics-plate">Plaka: <span>' + escapeHtmlLocal(record.plaka) + '</span></div>';
        html += '<div class="user-analytics-submeta"><span>' + escapeHtmlLocal(record.marka) + '</span><span>' + escapeHtmlLocal(record.branchLabel) + '</span></div>';
        html += '<div class="user-analytics-contact-row"><span>' + escapeHtmlLocal(record.telefon) + '</span><span>' + escapeHtmlLocal(record.roleLabel) + '</span></div>';
        html += buildMetricRows(record);
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
    var html = '<div class="user-analytics-detail-shell">';
    html += '<div class="universal-back-bar"><button type="button" class="universal-back-btn" id="user-analytics-back-to-list" title="Geri Dön"><svg class="back-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg><span class="universal-back-label">Listeye Dön</span></button></div>';
    html += '<div class="user-analytics-detail-grid">';
    html += '<section class="user-analytics-detail-section">';
    html += '<h3 class="user-analytics-detail-title">Kullanıcı Bilgileri</h3>';
    html += '<div class="user-analytics-detail-row"><span class="user-analytics-detail-label">Ad Soyad</span><span class="user-analytics-detail-value">' + escapeHtmlLocal(record.adSoyad) + '</span></div>';
    html += '<div class="user-analytics-detail-row"><span class="user-analytics-detail-label">Şube</span><span class="user-analytics-detail-value">' + escapeHtmlLocal(record.branchLabel) + '</span></div>';
    html += '<div class="user-analytics-detail-row"><span class="user-analytics-detail-label">Telefon</span><span class="user-analytics-detail-value">' + escapeHtmlLocal(record.telefon) + '</span></div>';
    html += '<div class="user-analytics-detail-row"><span class="user-analytics-detail-label">E-posta</span><span class="user-analytics-detail-value">' + escapeHtmlLocal(record.email) + '</span></div>';
    html += '<div class="user-analytics-detail-row"><span class="user-analytics-detail-label">Kullanıcı Tipi</span><span class="user-analytics-detail-value">' + escapeHtmlLocal(record.roleLabel) + '</span></div>';
    html += '<div class="user-analytics-detail-row"><span class="user-analytics-detail-label">Zimmetli Araç</span><span class="user-analytics-detail-value">' + escapeHtmlLocal(record.plaka) + ' - ' + escapeHtmlLocal(record.marka) + '</span></div>';
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

    fetch(API_BASE + 'admin_report.php?action=user_analytics')
      .then(function(res) { return res.json(); })
      .then(function(data) {
        if (!data.success) {
          container.innerHTML = '<p style="color:#ef4444; text-align:center; padding:20px;">Veriler çekilemedi.</p>';
          return;
        }
        container.dataset.loaded = 'true';
        userAnalyticsUsers = data.users || [];
        userAnalyticsTasitlar = data.tasitlar || [];
        window.renderUserAnalytics();
      })
      .catch(function() {
        container.innerHTML = '<p style="color:#ef4444; text-align:center; padding:20px;">Bağlantı hatası.</p>';
      });
  };

  window.renderUserAnalytics = function() {
    var target = document.getElementById('user-analytics-container');
    if (!target) return;

    syncUserAnalyticsToolbar();

    if (!(userAnalyticsUsers || []).length) {
      target.innerHTML = '<p class="user-analytics-empty">Gösterilecek kullanıcı bulunamadı.</p>';
      return;
    }

    if (userAnalyticsSelectedUserId) {
      renderUserAnalyticsDetail();
      return;
    }

    if (userAnalyticsBranchId === null) {
      renderUserAnalyticsBranchGrid();
      return;
    }

    renderUserAnalyticsList();
  };

  function approveRequest(id) {
    requestAction(id, 'approve');
  }

  function rejectRequest(id) {
    requestAction(id, 'reject');
  }

  function requestAction(id, action) {
    fetch(API_BASE + 'admin_approve.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request_id: id, action: action, admin_note: '' })
    })
      .then(function (r) {
        return r.json().then(function(data) {
          data = data && typeof data === 'object' ? data : {};
          data.__httpStatus = r.status;
          return data;
        });
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
      .catch(function () {
        alert('İşlem gönderilemedi.');
      });
  }

  function exportExcel() {
    var period = document.getElementById('report-period') ? document.getElementById('report-period').value : new Date().toISOString().slice(0, 7);
    window.location.href = API_BASE + 'admin_export.php?period=' + encodeURIComponent(period);
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
    initPeriodSelect();
    initVersionDisplay();
    initFooterDim();
    loadBranches().then(function () {
      loadReport();
    });
    loadPendingRequests();
    window.loadUserAnalytics();

    var btnRefresh = document.getElementById('report-refresh');
    if (btnRefresh) btnRefresh.addEventListener('click', loadReport);

    var btnExport = document.getElementById('report-export');
    if (btnExport) btnExport.addEventListener('click', exportExcel);

    var searchInput = document.getElementById('user-analytics-search');
    if (searchInput) {
      searchInput.addEventListener('input', function(e) {
        userAnalyticsQuery = e.target.value || '';
        window.renderUserAnalytics();
      });
    }

    var viewListBtn = document.getElementById('user-analytics-view-list');
    var viewCardBtn = document.getElementById('user-analytics-view-card');
    function syncUserAnalyticsViewButtons() {
      if (viewListBtn) viewListBtn.classList.toggle('active', userAnalyticsView === 'list');
      if (viewCardBtn) viewCardBtn.classList.toggle('active', userAnalyticsView === 'card');
      var container = document.getElementById('user-analytics-container');
      if (container) {
        container.classList.toggle('view-list', userAnalyticsView === 'list');
        container.classList.toggle('view-card', userAnalyticsView === 'card');
      }
    }
    if (viewListBtn) {
      viewListBtn.addEventListener('click', function() {
        userAnalyticsView = 'list';
        syncUserAnalyticsViewButtons();
        window.renderUserAnalytics();
      });
    }
    if (viewCardBtn) {
      viewCardBtn.addEventListener('click', function() {
        userAnalyticsView = 'card';
        syncUserAnalyticsViewButtons();
        window.renderUserAnalytics();
      });
    }
    syncUserAnalyticsViewButtons();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
