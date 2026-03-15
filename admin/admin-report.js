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

  // Admin sekme geçişi (container mevcutsa analitik sekmesini yükler)
  window.switchAdminTab = function (tabId) {
    var tabButtons = document.querySelectorAll('[data-admin-tab]');
    var tabPanels = document.querySelectorAll('[data-admin-panel]');
    if (tabButtons.length && tabPanels.length) {
      tabButtons.forEach(function (btn) {
        btn.classList.toggle('active', btn.getAttribute('data-admin-tab') === tabId);
      });
      tabPanels.forEach(function (panel) {
        panel.style.display = panel.getAttribute('data-admin-panel') === tabId ? '' : 'none';
      });
    }

    if (tabId === 'user-analytics') {
      window.loadUserAnalytics();
    }
  };

  window.loadUserAnalytics = function() {
    var container = document.getElementById('user-analytics-container');
    if (!container) return;

    // Sadece ilk açılışta yükle
    if (container.dataset.loaded === 'true') return;

    container.innerHTML = '<div style="text-align:center; padding:40px;"><div class="loading-spinner" style="display:inline-block; width:30px; height:30px; border:3px solid rgba(255,255,255,0.1); border-top-color:var(--theme-color); border-radius:50%; animation:spin 1s linear infinite;"></div><p style="color:var(--muted); margin-top:15px;">Sürücü istatistikleri hesaplanıyor...</p></div>';

    fetch(API_BASE + 'admin_report.php?action=user_analytics')
      .then(function(res) { return res.json(); })
      .then(function(data) {
        if (!data.success) {
          container.innerHTML = '<p style="color:#ef4444; text-align:center; padding:20px;">Veriler çekilemedi.</p>';
          return;
        }
        container.dataset.loaded = 'true';
        window.renderUserAnalytics(data.users || [], data.tasitlar || []);
      })
      .catch(function() {
        container.innerHTML = '<p style="color:#ef4444; text-align:center; padding:20px;">Bağlantı hatası.</p>';
      });
  };

  window.renderUserAnalytics = function(users, tasitlar) {
    var html = '<div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 15px; padding: 5px;">';
    var hasActiveUser = false;

    users.forEach(function(u) {
      if (u.aktif === false) return; // Pasif kullanıcıları atla
      var isim = u.isim || u.name || '';
      if (!isim.trim()) return;

      hasActiveUser = true;
      var cezaCount = 0, cezaTutar = 0;
      var kazaCount = 0, kazaTutar = 0;
      var bakimCount = 0;

      tasitlar.forEach(function(t) {
        if (t.events && Array.isArray(t.events)) {
          t.events.forEach(function(e) {
            var eSurucu = (e.data && e.data.surucu) ? String(e.data.surucu).toLowerCase() : '';
            var eTahsis = (e.data && e.data.tahsisKisi) ? String(e.data.tahsisKisi).toLowerCase() : '';
            var uIsim = String(isim).toLowerCase();

            // Event sürücüyle eşleşiyor mu?
            var matched = false;
            if (eSurucu && eSurucu.includes(uIsim)) matched = true;
            else if (eTahsis && eTahsis.includes(uIsim)) matched = true;
            else if (!eSurucu && !eTahsis && String(t.assignedUserId) === String(u.id)) matched = true;

            if (matched) {
              if (e.type === 'ceza') {
                cezaCount++;
                var cTutar = parseFloat(String((e.data && e.data.tutar) || '0').replace(/\./g, '').replace(/,/g, '.')) || 0;
                cezaTutar += cTutar;
              } else if (e.type === 'kaza') {
                kazaCount++;
                var kTutar = parseFloat(String((e.data && e.data.hasarTutari) || '0').replace(/\./g, '').replace(/,/g, '.')) || 0;
                kazaTutar += kTutar;
              } else if (e.type === 'bakim') {
                bakimCount++;
              }
            }
          });
        }
      });

      // Güncel Aracı Bul
      var aktifArac = tasitlar.find(function(t) { return String(t.assignedUserId) === String(u.id); });
      var aracDisplay = aktifArac ? ((aktifArac.plaka || aktifArac.plate || '').toString().toUpperCase()) : 'Zimmetli Araç Yok';
      var aracColor = aktifArac ? '#fff' : 'var(--muted)';

      html += '<div style="background:rgba(0,0,0,0.2); border:1px solid #3d3d3d; border-radius:10px; padding:16px; position:relative; overflow:hidden;">';
      html += '<div style="position:absolute; top:0; left:0; width:4px; height:100%; background:var(--theme-color); opacity:0.8;"></div>';
      html += '<h3 style="margin:0 0 4px 0; color:#fff; font-size:1.1rem; padding-left:8px;">' + (typeof window.capitalizeWords === 'function' ? window.capitalizeWords(isim) : isim) + '</h3>';
      html += '<div style="font-size:0.8rem; color:var(--muted); margin-bottom:15px; padding-left:8px;">Plaka: <span style="color:' + aracColor + '; font-weight:600;">' + escapeHtml(aracDisplay) + '</span></div>';

      html += '<div style="display:flex; justify-content:space-between; align-items:center; padding:6px 8px; background:rgba(251,146,60,0.1); border-radius:6px; margin-bottom:6px;">';
      html += '<span style="color:#fb923c; font-size:0.85rem; display:flex; align-items:center; gap:6px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg> Cezalar (' + cezaCount + ')</span>';
      html += '<span style="color:#fb923c; font-weight:700; font-size:0.9rem;">' + (typeof window.formatNumber === 'function' ? window.formatNumber(cezaTutar) : cezaTutar.toLocaleString('tr-TR')) + ' TL</span>';
      html += '</div>';

      html += '<div style="display:flex; justify-content:space-between; align-items:center; padding:6px 8px; background:rgba(239,68,68,0.1); border-radius:6px; margin-bottom:6px;">';
      html += '<span style="color:#ef4444; font-size:0.85rem; display:flex; align-items:center; gap:6px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg> Kazalar (' + kazaCount + ')</span>';
      html += '<span style="color:#ef4444; font-weight:700; font-size:0.9rem;">' + (typeof window.formatNumber === 'function' ? window.formatNumber(kazaTutar) : kazaTutar.toLocaleString('tr-TR')) + ' TL</span>';
      html += '</div>';

      html += '<div style="display:flex; justify-content:space-between; align-items:center; padding:6px 8px; background:rgba(74,222,128,0.05); border-radius:6px;">';
      html += '<span style="color:#4ade80; font-size:0.85rem; display:flex; align-items:center; gap:6px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg> Bakımlar</span>';
      html += '<span style="color:#4ade80; font-weight:700; font-size:0.9rem;">' + bakimCount + ' Adet</span>';
      html += '</div>';

      html += '</div>';
    });

    if (!hasActiveUser) {
      html = '<p style="text-align:center; color:var(--muted); padding:20px;">Aktif kullanıcı bulunamadı.</p>';
    } else {
      html += '</div>';
    }

    var target = document.getElementById('user-analytics-container');
    if (target) target.innerHTML = html;
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
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.success) {
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
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
