/* =========================================
   TAŞITLAR MODÜLÜ - SABİT HEADER / DİNAMİK TOOLBAR
   ========================================= */

(function() {
  const BRANCHES_KEY = "medisa_branches_v1";
  const VEHICLES_KEY = "medisa_vehicles_v1";
  const USERS_KEY = "medisa_users_v1";

  function parseLocalStorageArray(key) {
    try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; }
  }

  function readBranches() { return (typeof window.getMedisaBranches === 'function' ? window.getMedisaBranches() : null) || []; }
  function readVehicles() { return (typeof window.getMedisaVehicles === 'function' ? window.getMedisaVehicles() : null) || []; }
  function readUsers() { return (typeof window.getMedisaUsers === 'function' ? window.getMedisaUsers() : null) || []; }

  function getEventPerformerName(vehicle) {
    const users = readUsers();
    const assignedId = vehicle.assignedUserId || '';
    const user = assignedId ? users.find(function(u) { return String(u.id) === String(assignedId); }) : null;
    return (user && (user.name || user.isim)) ? toTitleCase(String(user.name || user.isim)) : 'Yönetim';
  }

  var parsedKaportaSvgCache = null;
  function getKaportaSvg() {
    return window.getKaportaSvg();
  }
  function getParsedKaportaSvg() {
    if (parsedKaportaSvgCache) {
      return Promise.resolve(parsedKaportaSvgCache.cloneNode(true));
    }
    return getKaportaSvg().then(function(svgText) {
      var parser = new DOMParser();
      var svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
      parsedKaportaSvgCache = svgDoc.querySelector('svg');
      return parsedKaportaSvgCache ? parsedKaportaSvgCache.cloneNode(true) : null;
    });
  }

  function writeVehicles(arr) {
    if (window.dataApi && typeof window.dataApi.saveVehiclesList === 'function') {
      return window.dataApi.saveVehiclesList(arr).catch(function(err) {
        if (err && err.conflict) {
          alert('Dikkat! Bu araç siz işlem yaparken başka biri tarafından güncellenmiş. Veri ezilmesini önlemek için lütfen sayfayı yenileyip güncel durumu kontrol edin.');
          if (typeof window.loadDataFromServer === 'function') {
            window.loadDataFromServer(true).then(function() {
              if (typeof window.renderBranchDashboard === 'function') window.renderBranchDashboard();
              if (typeof window.renderVehicles === 'function') window.renderVehicles();
            });
          }
          throw err;
        }
        console.warn('[Medisa] Sunucuya kayıt yapılamadı:', err && err.message);
        throw err;
      });
    }
    if (window.appData) window.appData.tasitlar = Array.isArray(arr) ? arr : [];
    return Promise.resolve();
  }

  // Global State
  let currentView = 'dashboard'; // 'dashboard' | 'list'
  let activeBranchId = null; // null = dashboard, 'all' = tümü, 'id' = şube
  let viewMode = 'card'; 
  let sortColumn = null; // 'year', 'brand', 'km', 'type', 'branch'
  let sortDirection = 'asc'; // 'asc' | 'desc'
  let currentFilter = 'az'; // 'az' | 'newest' | 'oldest' | 'type' (liste filtre dropdown)
  let transmissionFilter = ''; // '' | 'otomatik' | 'manuel' (şanzıman filtresi)
  let lastListContext = null; // Son açılan liste bağlamı (geri dönüş hedefi)
  
  // Sütun Sıralaması State
  let vehicleColumnOrder = ['year', 'plate', 'brand', 'km', 'type', 'user', 'branch']; // Varsayılan sıralama
  
  var defaultVehicleColumnOrder = ['year', 'plate', 'brand', 'km', 'type', 'user', 'branch'];
  function loadVehicleColumnOrder() {
    if (typeof window.loadColumnState === 'function') {
      var saved = window.loadColumnState('vehicle_column_order', defaultVehicleColumnOrder);
      if (Array.isArray(saved)) {
        var allColumns = defaultVehicleColumnOrder.slice();
        var validOrder = saved.filter(function(col) { return allColumns.indexOf(col) !== -1; });
        allColumns.forEach(function(col) { if (validOrder.indexOf(col) === -1) validOrder.push(col); });
        vehicleColumnOrder = validOrder;
      } else { vehicleColumnOrder = defaultVehicleColumnOrder.slice(); }
    } else {
      try {
        var raw = localStorage.getItem('vehicle_column_order');
        if (raw) { var p = JSON.parse(raw); if (Array.isArray(p)) vehicleColumnOrder = p; }
      } catch (e) { vehicleColumnOrder = defaultVehicleColumnOrder.slice(); }
    }
  }
  function saveVehicleColumnOrder() {
    if (typeof window.saveColumnState === 'function') window.saveColumnState('vehicle_column_order', vehicleColumnOrder);
    else try { localStorage.setItem('vehicle_column_order', JSON.stringify(vehicleColumnOrder)); } catch (e) {}
  }

  /** Arama/toolbar elementleri (tek getElementById ile tutarlı kullanım) */
  function getVSearchInput() { return document.getElementById('v-search-input'); }
  function getVSearchContainer() { return document.getElementById('v-search-container'); }
  function getVTransmissionDropdown() { return document.getElementById('v-transmission-dropdown'); }
  function getFilterDropdown() { return document.getElementById('filter-dropdown'); }

  // Grid genişlikleri sütun kimliğine göre (sürükle-bırak sonrası genişlik doğru sütunla kalsın)
  function getVehicleColumnWidths(columnOrder) {
    const defaultCols = '32px 70px 3.15fr 60px 65px 1.85fr 2fr'; /* Marka -3px, Kullanıcı +3px */
    try {
      if (!columnOrder || !Array.isArray(columnOrder) || columnOrder.length === 0) return defaultCols;
      const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
      const widthMap = isMobile
        ? {
            'year': '32px',
            'plate': '62px',
            'brand': '2.6fr',   /* mobil+iOS PWA: şubeden 2px marka'ya */
            'km': '52px',
            'user': '1.95fr',   /* mobil+iOS PWA: şubeden 3px kullanıcıya */
            'branch': '2.25fr'   /* mobil+iOS PWA: şubeden bir kademe alan alındı */
          }
        : {
            'year': '32px',
            'plate': '70px',
            'brand': '3.15fr',   /* Marka 3px dar */
            'km': '60px',
            'type': '65px',
            'user': '1.85fr',   /* Kullanıcı 3px geniş */
            'branch': '2fr'
          };
      return columnOrder.map(key => widthMap[key] || '1fr').join(' ');
    } catch (e) {
      return defaultCols;
    }
  }

  /**
   * Mobil taşıt listesi: başlıklar tek punto, en fazla 1pt küçülebilir (biri sığmazsa hepsi küçülür).
   * listContainer içindeki .list-header-row üzerinde --list-header-font-size ayarlar.
   */
  function applyMobileListHeaderFontSize(listContainer) {
    const headerRow = listContainer && listContainer.querySelector('.list-header-row');
    if (!headerRow) return;
    requestAnimationFrame(function() {
      const baseSize = 15;
      const minSize = 14;
      let size = baseSize;
      headerRow.style.setProperty('--list-header-font-size', size + 'px');
      const cells = headerRow.querySelectorAll('.list-cell');
      function hasOverflow() {
        return Array.prototype.some.call(cells, function (cell) {
          return cell.scrollWidth > cell.clientWidth || cell.scrollHeight > cell.clientHeight;
        });
      }
      while (hasOverflow() && size > minSize) {
        size -= 0.5;
        headerRow.style.setProperty('--list-header-font-size', size + 'px');
      }
    });
  }

  function toTitleCase(str) { return (typeof window.toTitleCase === 'function' ? window.toTitleCase(str) : str); }
  function formatPlaka(str) { return (typeof window.formatPlaka === 'function' ? window.formatPlaka(str) : (str == null ? '-' : String(str))); }
  function formatAdSoyad(str) { return (typeof window.formatAdSoyad === 'function' ? window.formatAdSoyad(str) : str); }

  // Global Detail Vehicle ID (HTML onclick erişimi için)
  window.currentDetailVehicleId = null;

  // DOM Cache (statik elementler - init aşamasında bir kere bağlanır)
  const DOM = {};
  function bindDOM() {
    DOM.vehiclesModal = document.getElementById('vehicles-modal');
    DOM.vehiclesModalContent = document.getElementById('vehicles-modal-content');
    DOM.vehiclesModalContainer = document.querySelector('#vehicles-modal .modal-container');
    DOM.vehiclesModalHeader = document.querySelector('#vehicles-modal .modal-header');
    DOM.vehicleDetailModal = document.getElementById('vehicle-detail-modal');
    DOM.vehicleDetailContent = document.getElementById('vehicle-detail-content');
    DOM.vehicleDetailLeft = document.querySelector('#vehicle-detail-content .vehicle-detail-left');
    DOM.vehicleDetailRight = document.querySelector('#vehicle-detail-content .vehicle-detail-right');
    DOM.eventMenuModal = document.getElementById('event-menu-modal');
    DOM.eventMenuList = document.getElementById('event-menu-list');
    DOM.vehicleHistoryModal = document.getElementById('vehicle-history-modal');
    DOM.historyContent = document.getElementById('history-content');
    DOM.notificationsDropdown = document.getElementById('notifications-dropdown');
  }
  bindDOM();

  const EVENT_MODAL_IDS = {
    km: 'km-guncelle-modal',
    bakim: 'bakim-ekle-modal',
    kaza: 'kaza-ekle-modal',
    sigorta: 'sigorta-guncelle-modal',
    kasko: 'kasko-guncelle-modal',
    muayene: 'muayene-guncelle-modal',
    anahtar: 'anahtar-guncelle-modal',
    kredi: 'kredi-guncelle-modal',
    lastik: 'lastik-guncelle-modal',
    utts: 'utts-guncelle-modal',
    takip: 'takip-cihaz-guncelle-modal',
    kaskokodu: 'kasko-kodu-guncelle-modal',
    ruhsat: 'ruhsat-yukleme-modal',
    sube: 'sube-degisiklik-modal',
    kullanici: 'kullanici-atama-modal',
    satis: 'satis-pert-modal'
  };

  function getEventModalId(type) {
    return EVENT_MODAL_IDS[type] || null;
  }

  function refreshModalRadioButtons(modal) {
    if (!modal) return [];
    modal.querySelectorAll('.radio-btn').forEach(function(btn) {
      var fresh = btn.cloneNode(true);
      btn.parentNode.replaceChild(fresh, btn);
    });
    return modal.querySelectorAll('.radio-btn');
  }

  function resetModalState(modal) {
    if (!modal) return;
    if (typeof window.resetModalInputs === 'function') {
      window.resetModalInputs(modal);
    }
    modal.querySelectorAll('.date-placeholder').forEach(function(el) { el.remove(); });
    modal.querySelectorAll('.universal-btn-save').forEach(function(btn) { btn.disabled = false; });
    ['lastik-adres-wrapper-event', 'anahtar-detay-wrapper', 'kredi-detay-wrapper-event'].forEach(function(id) {
      var wrap = modal.querySelector('#' + id);
      if (wrap) wrap.style.display = 'none';
    });
    var kazaKaporta = modal.querySelector('#kaza-kaporta-container');
    if (kazaKaporta) kazaKaporta.innerHTML = '';
  }

  const modalContent = DOM.vehiclesModalContent;
  
  // Taşıt listesi tıklama delegasyonu (card/list-item tıklanınca detay aç) - tek seferlik
  if (modalContent && !modalContent._vehicleClickBound) {
    modalContent._vehicleClickBound = true;
    function handleVehicleRowClick(e) {
      const branchCard = e.target.closest('.branch-card');
      if (branchCard && branchCard.dataset.branchId !== undefined) {
        e.stopPropagation();
        e.preventDefault();
        if (typeof window.openBranchList === 'function') {
          window.openBranchList(branchCard.dataset.branchId, branchCard.dataset.branchName || '');
        }
        return;
      }
      const card = e.target.closest('.card');
      const listItem = e.target.closest('.list-item');
      if (listItem && listItem.classList.contains('list-item-empty')) return;
      const row = card || listItem;
      if (row && row.dataset && row.dataset.vehicleId) {
        e.stopPropagation();
        e.preventDefault();
        if (typeof window.showVehicleDetail === 'function') {
          window.showVehicleDetail(row.dataset.vehicleId);
        }
      }
    }
    modalContent.addEventListener('click', handleVehicleRowClick);
    modalContent.addEventListener('touchend', handleVehicleRowClick, { passive: false });
  }

  // Bildirim listesi: delegation (her bildirime ayrı onclick yerine tek listener)
  if (DOM.notificationsDropdown && !DOM.notificationsDropdown._notifDelegationBound) {
    DOM.notificationsDropdown._notifDelegationBound = true;
    DOM.notificationsDropdown.addEventListener('click', function(e) {
      var btn = e.target.closest('.notification-item[data-plate]');
      if (!btn) return;
      var plate = btn.getAttribute('data-plate') || '';
      var vehicleId = btn.getAttribute('data-vehicle-id') || '';
      var openHistory = btn.getAttribute('data-open-history') === '1';
      var historyTab = btn.getAttribute('data-history-tab') || '';
      var notifKey = (btn.getAttribute('data-notif-key') || '').toString().trim();
      if (notifKey) {
        try {
          var viewed = JSON.parse(sessionStorage.getItem('notifViewedKeysV2') || '[]');
          if (viewed.indexOf(notifKey) === -1) { viewed.push(notifKey); sessionStorage.setItem('notifViewedKeysV2', JSON.stringify(viewed)); }
          if (typeof window.updateNotifications === 'function') window.updateNotifications();
        } catch (err) {}
      }
      if (!plate && !vehicleId) return;
      var vehicles = readVehicles();
      if (!Array.isArray(vehicles) || vehicles.length === 0) {
        vehicles = (window.getMedisaVehicles && window.getMedisaVehicles()) || [];
      }
      var plateNorm = String(plate || '').trim().toUpperCase();
      var v = vehicleId
        ? vehicles.find(function(v) { return String(v.id) === String(vehicleId); })
        : vehicles.find(function(v) { return String(v.plate || '').trim().toUpperCase() === plateNorm; });
      if (!v || typeof window.showVehicleDetail !== 'function') return;
      if (!lastListContext) {
        lastListContext = { mode: 'branch', branchId: 'all', branchName: 'Taşıtlar' };
      }
      window.showVehicleDetail(v.id);
      if (openHistory && typeof window.showVehicleHistory === 'function') {
        var tab = (/^(bakim|kaza|km|diger)$/.test(historyTab)) ? historyTab : null;
        setTimeout(function() { window.showVehicleHistory(v.id, tab); }, 180);
      }
    });
  }

  // Olay menü listesi: delegation (her butona ayrı onclick yerine tek listener)
  if (DOM.eventMenuList && !DOM.eventMenuList._eventDelegationBound) {
    DOM.eventMenuList._eventDelegationBound = true;
    DOM.eventMenuList.addEventListener('click', function(e) {
      var btn = e.target.closest('button[data-event-id]');
      if (!btn) return;
      e.stopPropagation();
      e.preventDefault();
      var eventId = btn.getAttribute('data-event-id');
      var vehicleId = btn.getAttribute('data-vehicle-id') || window.currentDetailVehicleId || '';
      if (eventId && typeof window.openEventModal === 'function') {
        window.openEventModal(eventId, vehicleId);
      }
    });
  }

  // Şanzıman dropdown: delegation (her option'a ayrı listener yerine tek listener)
  if (DOM.vehiclesModalContainer && !DOM.vehiclesModalContainer._transmissionDelegationBound) {
    DOM.vehiclesModalContainer._transmissionDelegationBound = true;
    DOM.vehiclesModalContainer.addEventListener('click', function(e) {
      var btn = e.target.closest('.v-transmission-option');
      if (!btn) return;
      var val = btn.getAttribute('data-value') || '';
      setTransmissionFilter(val);
      var dd = getVTransmissionDropdown();
      if (dd) {
        var opts = dd.querySelectorAll('.v-transmission-option');
        var labels = { '': 'Tümü', 'otomatik': 'Otomatik', 'manuel': 'Manuel' };
        opts.forEach(function(b) {
          var v = b.getAttribute('data-value') || '';
          b.classList.toggle('active', v === val);
          b.textContent = (v === val ? '✓ ' : '') + labels[v];
        });
      }
      closeTransmissionMenu();
      var _inp = getVSearchInput();
      var _val = _inp ? _inp.value : '';
      if (searchMode === 'local') {
        renderVehicles(_val);
      } else {
        handleSearch(_val);
      }
    });
  }

  // Mobil: pencere boyutu değişince başlık font-size tekrar hesaplansın (debounce)
  if (modalContent && !modalContent._headerResizeBound) {
    modalContent._headerResizeBound = true;
    var onResize = window.debounce ? window.debounce(function () {
      if (window.innerWidth <= 640 && modalContent.querySelector('.list-header-row')) {
        applyMobileListHeaderFontSize(modalContent);
      }
    }, 150) : function () {
      if (window.innerWidth <= 640 && modalContent.querySelector('.list-header-row')) {
        applyMobileListHeaderFontSize(modalContent);
      }
    };
    window.addEventListener('resize', onResize);
  }

  // Toolbar Container Oluştur (Eğer yoksa)
  function ensureToolbar() {
    const modalContainer = DOM.vehiclesModalContainer;
    const header = DOM.vehiclesModalHeader;
    
    // Toolbar
    let toolbar = document.querySelector('.vehicles-toolbar');
    if (!toolbar && header) {
        toolbar = document.createElement('div');
        toolbar.className = 'vehicles-toolbar';
        // Header'ın hemen altına ekle
        header.after(toolbar);
    }

    // Arama kutusu artık toolbar içinde (v-search-container)

    // Filtre Dropdown (sadece List modunda kullanılır, modal-container'a eklenir)
    let filterDrop = getFilterDropdown();
    if (!filterDrop && modalContainer) {
        filterDrop = document.createElement('div');
        filterDrop.id = 'filter-dropdown';
        filterDrop.innerHTML = `
            <button type="button" class="filter-dropdown-btn" data-filter="az">A-Z Sıralı</button>
            <button type="button" class="filter-dropdown-btn" data-filter="newest">En Yeni</button>
            <button type="button" class="filter-dropdown-btn" data-filter="oldest">En Eski</button>
            <button type="button" class="filter-dropdown-btn" data-filter="type">Tipe Göre</button>
        `;
        filterDrop.addEventListener('click', function(e) {
            var btn = e.target.closest('.filter-dropdown-btn');
            if (!btn) return;
            currentFilter = btn.dataset.filter || 'az';
                // Filtreye göre sıralama sütunu ve yönü
                if (currentFilter === 'az') {
                    sortColumn = 'plate';
                    sortDirection = 'asc';
                } else if (currentFilter === 'newest') {
                    sortColumn = 'year';
                    sortDirection = 'desc';
                } else if (currentFilter === 'oldest') {
                    sortColumn = 'year';
                    sortDirection = 'asc';
                } else if (currentFilter === 'type') {
                    sortColumn = 'type';
                    sortDirection = 'asc';
                }
                closeFilterMenu();
                renderVehicles(getVSearchInput()?.value || '');
        });
        modalContainer.appendChild(filterDrop);
    }
    
    return { toolbar };
  }

  // --- ANA GİRİŞ ---
  window.openVehiclesView = function() {
    const openView = () => {
      loadVehicleColumnOrder();
      const modal = DOM.vehiclesModal;
      if (modal) {
        modal.style.display = 'flex';
        requestAnimationFrame(() => modal.classList.add('active'));
        ensureToolbar();
        renderBranchDashboard();
      }
    };
    openView();
    if (typeof window.loadDataFromServer === 'function') {
      window.loadDataFromServer().then(function() {
        const m = DOM.vehiclesModal;
        if (m && m.classList.contains('active')) {
          if (currentView === 'dashboard') renderBranchDashboard();
          else renderVehicles(getVSearchInput()?.value || '');
        }
      }).catch(function() {});
    }
  };

  window.closeVehiclesModal = function(event) {
    // Event propagation'ı durdur (overlay click'i engelle)
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    
    const modal = DOM.vehiclesModal;
    if (modal) {
      resetModalState(modal);
      modal.classList.remove('active');
      setTimeout(() => {
        modal.style.display = 'none';
        closeSearchBox();
        closeFilterMenu();
        // X butonu sadece modalı kapatır, geri gitme işlemi yapmaz
        // Geri butonları zaten mevcut
        // renderBranchDashboard() çağrılmaz
      }, 300);
    }
    return false;
  };

  // --- TOOLBAR YÖNETİMİ ---
  /**
   * Toolbar içeriğini mode'a göre dinamik olarak günceller
   * 
   * @param {string} mode - 'dashboard' | 'detail' (görünüm modu)
   * @param {string} [title=''] - Detail modunda gösterilecek şube/başlık adı
   * 
   * Mantık:
   * - Dashboard modu: Sağda Genel Arama + Arşiv butonları
   * - Detail modu: Solda Geri butonu + başlık, Sağda Yerel Arama/Filtre/Görünüm butonları
   * 
   * Toolbar içeriği HTML olarak innerHTML'e set edilir
   */
  function updateToolbar(mode, title = '') {
    const { toolbar } = ensureToolbar();
    if (!toolbar) return;

    if (mode === 'dashboard') {
        // DASHBOARD MODU: Sağda Genel Arama, Şanzıman filtresi ve Arşiv
        toolbar.innerHTML = `
            <div class="vt-left"></div>
            <div class="vt-right">
                <div id="v-search-container" class="v-search-container">
                    <input type="text" id="v-search-input" class="v-search-input" placeholder="Plaka, marka, kullanıcı ara..." oninput="handleSearch(this.value)">
                </div>
                <button class="vt-icon-btn search-toggle-btn" onclick="toggleSearchBox('global')" title="Genel Arama">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.35-4.35"></path></svg>
                </button>
                <div class="v-transmission-wrap">
                    <button type="button" class="vt-icon-btn v-transmission-btn" onclick="toggleTransmissionMenu(event)" title="Şanzıman tipi" aria-label="Şanzıman tipi">
                        <svg width="18" height="18" viewBox="0 0 20.54 21.99" xmlns="http://www.w3.org/2000/svg"><g transform="translate(-107.004,-166.832)"><path fill="currentColor" d="m 112.60032,188.78148 c -0.0256,-0.0273 -0.45199,-0.10191 -0.94757,-0.1658 -1.00413,-0.12944 -1.76325,-0.3714 -2.61428,-0.83327 -0.60697,-0.3294 -1.42327,-0.94066 -1.67886,-1.25715 -0.24607,-0.3047 -0.39492,-0.93627 -0.34676,-1.47131 0.0588,-0.65313 0.40257,-1.18851 1.06416,-1.65727 0.42671,-0.30234 0.53233,-0.43143 0.53275,-0.65118 0.001,-0.58859 0.20829,-1.06067 0.69682,-1.58801 0.2711,-0.29264 0.61074,-0.61367 0.75476,-0.71341 0.22266,-0.15421 0.26185,-0.25085 0.26185,-0.64578 0,-0.6564 0.30408,-1.2505 0.96856,-1.89238 0.6772,-0.65416 1.68052,-1.20789 2.64914,-1.46205 0.74747,-0.19613 0.81479,-0.2606 0.90601,-0.86768 0.0827,-0.55057 0.75544,-1.25924 1.28038,-1.34885 l 0.3852,-0.0658 v -1.04459 -1.0446 l -0.42049,-0.26304 c -0.93193,-0.58298 -1.36919,-1.51394 -1.2684,-2.70047 0.0787,-0.9269 0.75132,-1.85208 1.5617,-2.14823 0.46348,-0.16938 1.40296,-0.17188 1.85909,-0.005 0.45128,0.16516 1.09064,0.8283 1.3212,1.37035 0.20729,0.48735 0.24139,1.41667 0.0739,2.0135 -0.14208,0.5062 -0.64856,1.1355 -1.18295,1.4698 l -0.4205,0.26304 v 0.9986 0.99859 l 0.46673,0.16548 c 0.65969,0.2339 1.03079,0.64915 1.20006,1.34288 0.0767,0.31438 0.15784,0.5912 0.18028,0.61516 0.0224,0.024 0.37581,0.13516 0.78525,0.24713 1.14802,0.31393 2.01316,0.81253 2.71253,1.5633 0.69276,0.74366 0.83412,1.02672 0.84015,1.68222 0.004,0.43648 0.0369,0.49605 0.5042,0.91474 0.89187,0.799 1.1844,1.30079 1.20919,2.0742 0.008,0.24957 0.10008,0.36952 0.50722,0.66068 0.56645,0.40509 0.82954,0.71382 0.99011,1.1619 0.22508,0.62806 0.10975,1.58545 -0.24429,2.02798 -0.25087,0.31357 -1.06736,0.926 -1.67741,1.25818 -0.76119,0.41447 -1.64395,0.7082 -2.57019,0.85522 -0.74795,0.11871 -10.23927,0.24982 -10.33951,0.14282 z m 11.00764,-1.9907 c 1.0103,-0.27582 2.42651,-1.14038 2.42651,-1.48133 0,-0.17965 -0.44457,-0.61412 -0.78029,-0.76256 -0.23328,-0.10315 -0.3055,-0.0863 -0.57638,0.13401 -0.42551,0.34616 -1.39721,0.89061 -1.5895,0.89061 -0.0869,0 -0.19963,0.0445 -0.25052,0.0988 -0.21135,0.2256 -1.64301,0.30377 -5.56354,0.30377 -3.92052,0 -5.35218,-0.0782 -5.56353,-0.30377 -0.0509,-0.0543 -0.16362,-0.0988 -0.25052,-0.0988 -0.19229,0 -1.16399,-0.54445 -1.58951,-0.89061 -0.27087,-0.22036 -0.34309,-0.23716 -0.57637,-0.13401 -0.28526,0.12613 -0.7803,0.57408 -0.7803,0.70609 0,0.37349 1.96466,1.48453 2.95182,1.66928 0.13093,0.0245 2.74857,0.0508 5.81699,0.0584 5.29503,0.0131 5.61691,0.003 6.32514,-0.18988 z m -0.85857,-2.83357 c 0.73983,-0.37625 1.56517,-1.04986 1.56835,-1.28003 0.002,-0.11045 -0.17648,-0.37057 -0.39557,-0.57805 -0.41885,-0.39666 -0.50035,-0.39799 -0.88712,-0.0146 -0.32081,0.31802 -0.92008,0.65579 -1.61161,0.90835 -0.64685,0.23624 -0.72625,0.24083 -4.1655,0.24083 -3.33178,0 -3.53568,-0.0108 -4.10158,-0.21722 -0.69845,-0.25477 -1.30995,-0.61648 -1.72299,-1.01918 -0.1626,-0.15853 -0.31823,-0.28817 -0.34584,-0.2881 -0.13448,3.8e-4 -0.85956,0.78824 -0.85956,0.93399 0,0.29783 1.06234,1.07293 1.92113,1.40168 0.47644,0.18238 0.79667,0.19288 5.31558,0.17425 l 4.80861,-0.0198 z m -1.30853,-2.73338 c 0.58186,-0.33177 1.26092,-1.05572 1.26092,-1.34429 0,-0.50342 -1.42219,-1.60307 -2.30083,-1.77902 l -0.33705,-0.0675 -0.0527,0.54539 c -0.0643,0.66481 -0.33103,1.16688 -0.79931,1.50442 -0.34104,0.24581 -0.40427,0.2541 -1.93878,0.2541 -1.58521,0 -1.5865,-1.9e-4 -1.97402,-0.28685 -0.4415,-0.3266 -0.78619,-1.04961 -0.78619,-1.6491 v -0.37362 l -0.3512,0.0703 c -0.86017,0.17226 -2.31496,1.2742 -2.31496,1.75349 0,0.32344 1.0611,1.31622 1.59831,1.49541 0.36701,0.12242 1.10046,0.14597 4.01966,0.12908 3.51365,-0.0203 3.57723,-0.0244 3.97618,-0.25183 z m -3.04906,-2.58941 c 0.1148,-0.15606 -0.09,-2.57753 -0.23073,-2.72772 -0.0532,-0.0568 -0.46686,-0.0882 -0.94313,-0.0716 l -0.84829,0.0296 -0.0745,1.01642 c -0.041,0.55904 -0.10884,1.1326 -0.15082,1.27459 -0.15194,0.51395 0.0211,0.6058 1.14155,0.6058 0.69663,0 1.0416,-0.0396 1.1059,-0.12706 z m -0.43177,-8.51744 c 0.2573,-0.27466 0.28416,-0.35831 0.23661,-0.73675 -0.14496,-1.15367 -1.6699,-1.20492 -1.84026,-0.0618 -0.0463,0.31044 -0.009,0.42125 0.25113,0.7369 0.25542,0.31053 0.36769,0.37152 0.68392,0.37152 0.29475,0 0.44247,-0.0684 0.6686,-0.30983 z"/></g></svg>
                    </button>
                    <div id="v-transmission-dropdown" class="v-transmission-dropdown" role="menu" aria-hidden="true">
                        <button type="button" class="v-transmission-option${transmissionFilter === '' ? ' active' : ''}" data-value="" role="menuitem">${transmissionFilter === '' ? '✓ ' : ''}Tümü</button>
                        <button type="button" class="v-transmission-option${transmissionFilter === 'otomatik' ? ' active' : ''}" data-value="otomatik" role="menuitem">${transmissionFilter === 'otomatik' ? '✓ ' : ''}Otomatik</button>
                        <button type="button" class="v-transmission-option${transmissionFilter === 'manuel' ? ' active' : ''}" data-value="manuel" role="menuitem">${transmissionFilter === 'manuel' ? '✓ ' : ''}Manuel</button>
                    </div>
                </div>
                <button class="vt-icon-btn" onclick="openArchiveView()" title="Arşiv">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="5" rx="1"></rect><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"></path><path d="M10 12h4"></path></svg>
                </button>
            </div>
        `;
    } else {
        // DETAY MODU: Solda Geri+İsim, Sağda Yerel Arama/Filtre/Görünüm
        toolbar.innerHTML = `
            <div class="vt-left">
                <div class="universal-back-bar">
                    <button type="button" class="universal-back-btn" onclick="renderBranchDashboard()">
                        <svg class="back-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                        ${title ? `<span class="universal-back-label">${escapeHtml(title)}</span>` : ''}
                    </button>
                </div>
            </div>
            <div class="vt-right">
                <div id="v-search-container" class="v-search-container">
                    <input type="text" id="v-search-input" class="v-search-input" placeholder="Plaka, marka, kullanıcı ara..." oninput="handleSearch(this.value)">
                </div>
                <button class="vt-icon-btn search-toggle-btn" onclick="toggleSearchBox('local')" title="Ara">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.35-4.35"></path></svg>
                </button>
                <div class="v-transmission-wrap">
                    <button type="button" class="vt-icon-btn v-transmission-btn" onclick="toggleTransmissionMenu(event)" title="Şanzıman tipi" aria-label="Şanzıman tipi">
                        <svg width="18" height="18" viewBox="0 0 20.54 21.99" xmlns="http://www.w3.org/2000/svg"><g transform="translate(-107.004,-166.832)"><path fill="currentColor" d="m 112.60032,188.78148 c -0.0256,-0.0273 -0.45199,-0.10191 -0.94757,-0.1658 -1.00413,-0.12944 -1.76325,-0.3714 -2.61428,-0.83327 -0.60697,-0.3294 -1.42327,-0.94066 -1.67886,-1.25715 -0.24607,-0.3047 -0.39492,-0.93627 -0.34676,-1.47131 0.0588,-0.65313 0.40257,-1.18851 1.06416,-1.65727 0.42671,-0.30234 0.53233,-0.43143 0.53275,-0.65118 0.001,-0.58859 0.20829,-1.06067 0.69682,-1.58801 0.2711,-0.29264 0.61074,-0.61367 0.75476,-0.71341 0.22266,-0.15421 0.26185,-0.25085 0.26185,-0.64578 0,-0.6564 0.30408,-1.2505 0.96856,-1.89238 0.6772,-0.65416 1.68052,-1.20789 2.64914,-1.46205 0.74747,-0.19613 0.81479,-0.2606 0.90601,-0.86768 0.0827,-0.55057 0.75544,-1.25924 1.28038,-1.34885 l 0.3852,-0.0658 v -1.04459 -1.0446 l -0.42049,-0.26304 c -0.93193,-0.58298 -1.36919,-1.51394 -1.2684,-2.70047 0.0787,-0.9269 0.75132,-1.85208 1.5617,-2.14823 0.46348,-0.16938 1.40296,-0.17188 1.85909,-0.005 0.45128,0.16516 1.09064,0.8283 1.3212,1.37035 0.20729,0.48735 0.24139,1.41667 0.0739,2.0135 -0.14208,0.5062 -0.64856,1.1355 -1.18295,1.4698 l -0.4205,0.26304 v 0.9986 0.99859 l 0.46673,0.16548 c 0.65969,0.2339 1.03079,0.64915 1.20006,1.34288 0.0767,0.31438 0.15784,0.5912 0.18028,0.61516 0.0224,0.024 0.37581,0.13516 0.78525,0.24713 1.14802,0.31393 2.01316,0.81253 2.71253,1.5633 0.69276,0.74366 0.83412,1.02672 0.84015,1.68222 0.004,0.43648 0.0369,0.49605 0.5042,0.91474 0.89187,0.799 1.1844,1.30079 1.20919,2.0742 0.008,0.24957 0.10008,0.36952 0.50722,0.66068 0.56645,0.40509 0.82954,0.71382 0.99011,1.1619 0.22508,0.62806 0.10975,1.58545 -0.24429,2.02798 -0.25087,0.31357 -1.06736,0.926 -1.67741,1.25818 -0.76119,0.41447 -1.64395,0.7082 -2.57019,0.85522 -0.74795,0.11871 -10.23927,0.24982 -10.33951,0.14282 z m 11.00764,-1.9907 c 1.0103,-0.27582 2.42651,-1.14038 2.42651,-1.48133 0,-0.17965 -0.44457,-0.61412 -0.78029,-0.76256 -0.23328,-0.10315 -0.3055,-0.0863 -0.57638,0.13401 -0.42551,0.34616 -1.39721,0.89061 -1.5895,0.89061 -0.0869,0 -0.19963,0.0445 -0.25052,0.0988 -0.21135,0.2256 -1.64301,0.30377 -5.56354,0.30377 -3.92052,0 -5.35218,-0.0782 -5.56353,-0.30377 -0.0509,-0.0543 -0.16362,-0.0988 -0.25052,-0.0988 -0.19229,0 -1.16399,-0.54445 -1.58951,-0.89061 -0.27087,-0.22036 -0.34309,-0.23716 -0.57637,-0.13401 -0.28526,0.12613 -0.7803,0.57408 -0.7803,0.70609 0,0.37349 1.96466,1.48453 2.95182,1.66928 0.13093,0.0245 2.74857,0.0508 5.81699,0.0584 5.29503,0.0131 5.61691,0.003 6.32514,-0.18988 z m -0.85857,-2.83357 c 0.73983,-0.37625 1.56517,-1.04986 1.56835,-1.28003 0.002,-0.11045 -0.17648,-0.37057 -0.39557,-0.57805 -0.41885,-0.39666 -0.50035,-0.39799 -0.88712,-0.0146 -0.32081,0.31802 -0.92008,0.65579 -1.61161,0.90835 -0.64685,0.23624 -0.72625,0.24083 -4.1655,0.24083 -3.33178,0 -3.53568,-0.0108 -4.10158,-0.21722 -0.69845,-0.25477 -1.30995,-0.61648 -1.72299,-1.01918 -0.1626,-0.15853 -0.31823,-0.28817 -0.34584,-0.2881 -0.13448,3.8e-4 -0.85956,0.78824 -0.85956,0.93399 0,0.29783 1.06234,1.07293 1.92113,1.40168 0.47644,0.18238 0.79667,0.19288 5.31558,0.17425 l 4.80861,-0.0198 z m -1.30853,-2.73338 c 0.58186,-0.33177 1.26092,-1.05572 1.26092,-1.34429 0,-0.50342 -1.42219,-1.60307 -2.30083,-1.77902 l -0.33705,-0.0675 -0.0527,0.54539 c -0.0643,0.66481 -0.33103,1.16688 -0.79931,1.50442 -0.34104,0.24581 -0.40427,0.2541 -1.93878,0.2541 -1.58521,0 -1.5865,-1.9e-4 -1.97402,-0.28685 -0.4415,-0.3266 -0.78619,-1.04961 -0.78619,-1.6491 v -0.37362 l -0.3512,0.0703 c -0.86017,0.17226 -2.31496,1.2742 -2.31496,1.75349 0,0.32344 1.0611,1.31622 1.59831,1.49541 0.36701,0.12242 1.10046,0.14597 4.01966,0.12908 3.51365,-0.0203 3.57723,-0.0244 3.97618,-0.25183 z m -3.04906,-2.58941 c 0.1148,-0.15606 -0.09,-2.57753 -0.23073,-2.72772 -0.0532,-0.0568 -0.46686,-0.0882 -0.94313,-0.0716 l -0.84829,0.0296 -0.0745,1.01642 c -0.041,0.55904 -0.10884,1.1326 -0.15082,1.27459 -0.15194,0.51395 0.0211,0.6058 1.14155,0.6058 0.69663,0 1.0416,-0.0396 1.1059,-0.12706 z m -0.43177,-8.51744 c 0.2573,-0.27466 0.28416,-0.35831 0.23661,-0.73675 -0.14496,-1.15367 -1.6699,-1.20492 -1.84026,-0.0618 -0.0463,0.31044 -0.009,0.42125 0.25113,0.7369 0.25542,0.31053 0.36769,0.37152 0.68392,0.37152 0.29475,0 0.44247,-0.0684 0.6686,-0.30983 z"/></g></svg>
                    </button>
                    <div id="v-transmission-dropdown" class="v-transmission-dropdown" role="menu" aria-hidden="true">
                        <button type="button" class="v-transmission-option${transmissionFilter === '' ? ' active' : ''}" data-value="" role="menuitem">${transmissionFilter === '' ? '✓ ' : ''}Tümü</button>
                        <button type="button" class="v-transmission-option${transmissionFilter === 'otomatik' ? ' active' : ''}" data-value="otomatik" role="menuitem">${transmissionFilter === 'otomatik' ? '✓ ' : ''}Otomatik</button>
                        <button type="button" class="v-transmission-option${transmissionFilter === 'manuel' ? ' active' : ''}" data-value="manuel" role="menuitem">${transmissionFilter === 'manuel' ? '✓ ' : ''}Manuel</button>
                    </div>
                </div>
                <button class="vt-icon-btn" onclick="toggleViewMode()" title="Görünüm">
                    ${viewMode === 'card' 
                        ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>'
                        : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>'
                    }
                </button>
            </div>
        `;
    }
  }

  // --- 1. DASHBOARD RENDER ---
  /**
   * Ana şube dashboard grid'ini render eder
   * 
   * Render mantığı:
   * 1. "TÜMÜ" kartı eklenir (tüm taşıtları gösterir)
   * 2. Her şube için kart oluşturulur (şube adı + taşıt sayısı)
   * 3. Tahsis edilmemiş taşıt varsa "Tahsis Edilmemiş" kartı eklenir
   * 4. Grid kolon sayısı dinamik ayarlanır (kart sayısına göre)
   * 
   * Grid kolon stratejisi:
   * - 1 kart: 1 kolon
   * - 2 kart: 2 kolon
   * - 3+ kart: Mobil 4 kolon, Desktop 5 kolon
   */
  window.renderBranchDashboard = function() {
    currentView = 'dashboard';
    activeBranchId = null;
    closeSearchBox();
    closeFilterMenu();
    updateToolbar('dashboard');

    const branches = readBranches();
    const vehicles = readVehicles();
    const activeVehicles = vehicles.filter(v => v.satildiMi !== true);

    // Grid HTML Başlangıcı
    let html = '<div class="branch-grid">';

    // 1. "TÜMÜ" Kartı (Manuel) — sadece aktif (satılmamış) taşıtlar
    html += `
      <div class="branch-card all-card" data-branch-id="all" data-branch-name="Taşıtlar">
        <div class="branch-name">TÜMÜ</div>
        <div class="branch-count">${activeVehicles.length} Taşıt</div>
      </div>
    `;

    // 2. Şube Kartları — sadece aktif taşıtlar (Map ile O(n) sayım)
    const countByBranch = new Map();
    let unassignedCount = 0;
    activeVehicles.forEach(v => {
        if (!v.branchId) { unassignedCount++; }
        else {
            const branchKey = String(v.branchId);
            countByBranch.set(branchKey, (countByBranch.get(branchKey) || 0) + 1);
        }
    });
    branches.forEach(branch => {
        html += createBranchCard(branch.id, branch.name, countByBranch.get(String(branch.id)) || 0);
    });

    // 3. Tahsis Edilmemiş — sadece aktif taşıtlar
    if (unassignedCount > 0) {
        html += createBranchCard('', 'Tahsis Edilmemiş', unassignedCount, true); // true = unassigned flag
    }
    
    html += '</div>';
    modalContent.innerHTML = html;
    
    // Grid'i dinamik yap: kart sayısına göre kolon sayısını ayarla
    const gridEl = modalContent.querySelector('.branch-grid');
    if (gridEl) {
        const totalCards = 1 + branches.length + (unassignedCount > 0 ? 1 : 0);
        const isMobile = window.innerWidth <= 640;
        let cols;
        if (totalCards === 1) {
            cols = 1; // Tek kutu: 1 kolon
        } else if (totalCards === 2) {
            cols = 2; // 2 kutu: 2 kolon
        } else {
            cols = isMobile ? 4 : 5; // 3+ kutu: sabit kolon sayısı
        }
        gridEl.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    }
  };

  function createBranchCard(id, name, count, isUnassigned = false) {
    const unassignedClass = isUnassigned ? ' unassigned-branch-card' : '';
    const safeId = (id || '').replace(/"/g, '&quot;');
    const safeName = escapeHtml(name);
    return `
      <div class="branch-card${unassignedClass}" data-branch-id="${safeId}" data-branch-name="${safeName}">
        <div class="branch-name" title="${safeName}">${safeName}</div>
        <div class="branch-count">${count} Taşıt</div>
      </div>
    `;
  }

  // --- 2. LİSTE RENDER (Şube Detayı) ---
  window.openBranchList = function(branchId, branchName) {
    currentView = 'list';
    viewMode = 'list';
    activeBranchId = branchId; // 'all', '', veya 'id'
    lastListContext = { mode: 'branch', branchId: branchId, branchName: branchName };
    closeSearchBox();
    const displayTitle = branchId === 'all' ? branchName : (branchName + ' Taşıtlar');
    updateToolbar('detail', displayTitle);

    renderVehicles();
  };

  /**
   * Arşiv görünümünü açar (satildiMi === true olan taşıtları listeler).
   * Toolbar'da "Geri" ile dashboard'a dönülür.
   */
  window.openArchiveView = function() {
    currentView = 'list';
    viewMode = 'list';
    activeBranchId = '__archive__';
    lastListContext = { mode: 'archive' };
    closeSearchBox();
    updateToolbar('detail', 'Arşiv');
    renderVehicles();
  };

  /**
   * Taşıt listesini filtreleyip render eder
   * 
   * @param {string} [query=''] - Metin arama sorgusu (opsiyonel)
   * 
   * Render akışı:
   * 1. Şube filtresi uygula (all | '' | branchId)
   * 2. Metin araması yap (marka/model, yıl, tahsis edilen kişi)
   * 3. Sıralama/filtreleme uygula (applyFilter)
   * 4. Card veya List view'da HTML oluştur
   * 5. Grid kolon sayısını dinamik ayarla (card view için)
   * 
   * Görünüm modları:
   * - Card: Plaka, Marka/Model, Şube/Kullanıcı (3 satır)
   * - List: Marka/Model, Yıl/Km, Düzenle/Sil butonları
   */
  function renderVehicles(query = '') {
    try {
      const listContainer = DOM.vehiclesModalContent;
      if (!listContainer) return;
      loadVehicleColumnOrder(); // Sütun sıralamasını yükle
      // Veri Çek
      let vehicles = readVehicles();
      if (!Array.isArray(vehicles)) vehicles = [];

    // 1. Arşiv veya Şube Filtresi
    if (activeBranchId === '__archive__') {
        vehicles = vehicles.filter(v => v.satildiMi === true);
    } else {
        // Şube filtresi
        if (activeBranchId === 'all') {
            // Filtre yok
        } else if (activeBranchId === '') {
            vehicles = vehicles.filter(v => !v.branchId);
        } else {
            vehicles = vehicles.filter(v => String(v.branchId) === String(activeBranchId));
        }
        // Normal listelerde satılanları gösterme
        vehicles = vehicles.filter(v => v.satildiMi !== true);
    }

    // 2. Metin Araması (plaka, marka/model, yıl, kullanıcı)
    if (query) {
        const q = ('' + query).toLowerCase();
        vehicles = vehicles.filter(v => 
            (v.plate && ('' + v.plate).toLowerCase().includes(q)) ||
            (v.brandModel && ('' + v.brandModel).toLowerCase().includes(q)) ||
            (v.year && ('' + v.year).includes(q)) ||
            (v.tahsisKisi && ('' + v.tahsisKisi).toLowerCase().includes(q))
        );
    }

    // 2b. Şanzıman filtresi (Otomatik/Manuel)
    if (transmissionFilter) {
        vehicles = vehicles.filter(v => v.transmission === transmissionFilter);
    }

      // 3. Sıralama
      vehicles = applyFilter(vehicles);

      // Şube seçiliyken liste görünümünde şube sütunu gösterilmez
      const safeColumnOrder = Array.isArray(vehicleColumnOrder) ? vehicleColumnOrder : ['year', 'plate', 'brand', 'km', 'type', 'user', 'branch'];
      const displayColumnOrder = (activeBranchId === 'all' || activeBranchId === '__archive__') ? safeColumnOrder : safeColumnOrder.filter(function(k) { return k !== 'branch'; });
      const isMobileList = window.innerWidth <= 768;
      // Mobil/tablet (≤768px): Taşıt Tipi sütununu göstermiyoruz (yer kaplamasın)
      const listDisplayOrder = isMobileList ? displayColumnOrder.filter(function(k) { return k !== 'type'; }) : displayColumnOrder;

      // 4. HTML – boş liste: liste görünümünde başlıkları koru, tek satırda mesaj göster
      if (vehicles.length === 0) {
          const emptyMsg = (activeBranchId === '__archive__') ? 'Arşivde kayıt bulunamadı.' : 'Kayıt bulunamadı.';
          if (viewMode === 'list') {
            loadVehicleColumnOrder();
            const gridStr = getVehicleColumnWidths(listDisplayOrder);
            const columnDefs = {
              'year': { label: 'Yılı', class: 'list-year' },
              'plate': { label: 'Plaka', class: 'list-plate' },
              'brand': { label: 'Marka / Model', class: 'list-brand' },
              'km': { label: 'Km', class: 'list-km' },
              'type': { label: 'Taşıt Tipi', class: 'list-type' },
              'user': { label: 'Kull.', class: 'list-user' },
              'branch': { label: 'Şube', class: 'list-branch' }
            };
            let emptyHtml = '<div class="list-header-row" style="grid-template-columns: ' + gridStr + '">';
            listDisplayOrder.forEach(columnKey => {
              const def = columnDefs[columnKey];
              if (def) {
                const labelHtml = (isMobileList && columnKey === 'brand') ? '<span class="header-first-line">Marka /</span><span class="header-second-line">Model</span>' : (isMobileList && columnKey === 'type') ? '<span class="header-first-line">Taşıt</span><span class="header-second-line">Tipi</span>' : `<span>${escapeHtml(def.label)}</span>`;
                emptyHtml += `<div class="list-cell ${def.class} sortable-header" data-col="${columnKey}">${labelHtml}</div>`;
              }
            });
            emptyHtml += '</div><div class="vehicles-list-scroll"><div class="view-list view-list-empty"><div class="list-item list-item-empty" style="grid-column: 1 / -1; justify-content: center; padding: 24px;"><span style="color:#666;">' + escapeHtml(emptyMsg) + '</span></div></div></div>';
            listContainer.innerHTML = emptyHtml;
          } else {
            listContainer.innerHTML = `<div style="text-align:center; padding:40px; color:#666">${emptyMsg}</div>`;
          }
          return;
      }

    const branches = readBranches() || [];
    const branchMap = new Map(branches.map(function(b) { return [String(b.id), b.name || '']; }));

    const isAllView = (activeBranchId === 'all');
    const extraClass = (viewMode === 'list' && isAllView) ? ' is-all-view' : '';
    const isMobile = window.innerWidth <= 640;
      let html = '';
      const gridStr = viewMode === 'list' ? getVehicleColumnWidths(listDisplayOrder) : '';
      if (viewMode === 'list') {
        const getSortIcon = (column) => {
          if (sortColumn !== column) {
            return '<svg class="sort-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 9l4-4 4 4M8 15l4 4 4-4"/></svg>';
          }
          return sortDirection === 'asc' 
            ? '<svg class="sort-icon active" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 9l4-4 4 4"/></svg>'
            : '<svg class="sort-icon active" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 15l4 4 4-4"/></svg>';
        };
        
        // Sütun başlık tanımları (mobilde Kullanıcı → Kull.)
        const columnDefs = {
          'year': { label: 'Yılı', class: 'list-year' },
          'plate': { label: 'Plaka', class: 'list-plate' },
          'brand': { label: 'Marka / Model', class: 'list-brand' },
          'km': { label: 'Km', class: 'list-km' },
          'type': { label: 'Taşıt Tipi', class: 'list-type' },
          'user': { label: 'Kull.', class: 'list-user' },
          'branch': { label: 'Şube', class: 'list-branch' }
        };
        html += '<div class="list-header-row" style="grid-template-columns: ' + gridStr + '">';
        // Sıralamaya göre sütun başlıklarını render et (mobilde Marka/Model iki satır; Taşıt Tipi mobilde yok)
        listDisplayOrder.forEach(columnKey => {
          const def = columnDefs[columnKey];
          if (def) {
            let labelHtml;
            if (isMobile && columnKey === 'brand') {
              labelHtml = '<span class="header-first-line">Marka /</span><span class="header-second-line">Model</span>';
            } else if (isMobile && columnKey === 'type') {
              labelHtml = '<span class="header-first-line">Taşıt</span><span class="header-second-line">Tipi</span>';
            } else {
              labelHtml = `<span>${escapeHtml(def.label)}</span>`;
            }
            html += `
              <div class="list-cell ${def.class} sortable-header" 
                   data-col="${columnKey}"
                   draggable="true"
                   ondragstart="handleVehicleColumnDragStart(event, '${columnKey}')"
                   ondragover="handleVehicleColumnDragOver(event)"
                   ondrop="handleVehicleColumnDrop(event, '${columnKey}')"
                   ondragenter="handleVehicleColumnDragEnter(event)"
                   ondragleave="handleVehicleColumnDragLeave(event)"
                   ondragend="handleVehicleColumnDragEnd(event)"
                   onclick="handleColumnSort('${columnKey}')">
                ${labelHtml}${getSortIcon(columnKey)}
              </div>
            `;
          }
        });
        html += '</div>';
        html += '<div class="vehicles-list-scroll">';
      }
      const users = readUsers() || [];
      const userMap = new Map(users.map(function(u) { return [String(u.id), u]; }));
      html += `<div class="view-${viewMode}${extraClass}">` + vehicles.map(v => {
        // Plaka (1. satır - tek satır maksimum)
        const plate = v.plate || '-';
        
        // Marka/Model (2. satır - 2 satıra inebilir)
        const brandModel = v.brandModel || '-';
        
        // 3. satır: Arşivde satış tarihi, Tümü'de şube, şube görünümünde kullanıcı
        const isArchive = (activeBranchId === '__archive__');
        let thirdLine = '';
        if (isArchive) {
          thirdLine = v.satisTarihi ? `Satış: ${v.satisTarihi}` : '';
        } else if (activeBranchId === 'all') {
          thirdLine = branchMap.get(String(v.branchId)) || '';
        } else {
          thirdLine = v.tahsisKisi || '';
        }
        const thirdLineDisplay = thirdLine ? (isArchive ? toTitleCase(thirdLine) : (activeBranchId === 'all' ? toTitleCase(thirdLine) : formatAdSoyad(thirdLine))) : '';
        const satildiSpan = isArchive ? ' <span style="color:#d40000;font-size:12px;">(SATILDI)</span>' : '';

        // Tahsis edilmemiş taşıtlar için kırmızı class (liste ve kartta her zaman)
        const isUnassigned = !v.branchId;
        const unassignedClass = isUnassigned ? ' unassigned-vehicle-card' : '';
        
        if (viewMode === 'card') {
            // Üçüncü satır boşsa div'i render etme
            const thirdLineHtml = thirdLineDisplay ? `<div class="card-third-line" title="${escapeHtml(thirdLineDisplay)}">${escapeHtml(thirdLineDisplay)}</div>` : '';
            const vid = v.id != null ? String(v.id).replace(/"/g, '&quot;') : '';
            return `
              <div class="card${unassignedClass}" data-vehicle-id="${vid}" style="cursor:pointer">
                <div class="card-plate">${escapeHtml(formatPlaka(plate))}${satildiSpan}</div>
                <div class="card-brand-model" title="${escapeHtml(brandModel)}">${escapeHtml(toTitleCase(brandModel))}</div>
                ${thirdLineHtml}
              </div>
            `;
        } else {
            // Liste görünümü: Sıralamaya göre dinamik
            const kmValue = v.guncelKm || v.km;
            const kmLabel = kmValue ? formatNumber(kmValue) : '-';
            const vehicleTypeLabel = toTitleCase(v.vehicleType || '-');
            const branchLabel = toTitleCase(branchMap.get(String(v.branchId)) || 'Tahsis Edilmemiş');
            
            let cellHtml = '';
            listDisplayOrder.forEach(columnKey => {
              let cellContent = '';
              let cellClass = '';
              switch(columnKey) {
                case 'year':
                  cellContent = escapeHtml(v.year || '-');
                  cellClass = 'list-year';
                  break;
                case 'plate':
                  cellContent = escapeHtml(formatPlaka(plate));
                  cellClass = 'list-plate';
                  break;
                case 'brand':
                  cellContent = escapeHtml(toTitleCase(brandModel)) + satildiSpan;
                  cellClass = 'list-brand';
                  break;
                case 'km':
                  cellContent = escapeHtml(kmLabel);
                  cellClass = 'list-km';
                  break;
                case 'type':
                  cellContent = escapeHtml(vehicleTypeLabel);
                  cellClass = 'list-type';
                  break;
                case 'user':
                  const assignedUser = v.assignedUserId ? userMap.get(String(v.assignedUserId)) : null;
                  const userNameRaw = assignedUser?.name || v.tahsisKisi || '-';
                  const userName = formatAdSoyad(userNameRaw);
                  if (isMobile && userName && userName !== '-') {
                    const parts = String(userName).trim().split(/\s+/);
                    const firstLine = parts[0] || '-';
                    const secondLine = parts.slice(1).join(' ') || '';
                    cellContent = secondLine
                      ? '<span class="user-name-line1">' + escapeHtml(firstLine) + '</span><span class="user-name-line2">' + escapeHtml(secondLine) + '</span>'
                      : escapeHtml(firstLine);
                  } else {
                    cellContent = escapeHtml(userName);
                  }
                  cellClass = 'list-user';
                  break;
                case 'branch':
                  cellContent = escapeHtml(branchLabel);
                  cellClass = 'list-branch';
                  break;
              }
              if (cellClass) {
                cellHtml += `<div class="list-cell ${cellClass}">${cellContent}</div>`;
              }
            });
            
            const vid = v.id != null ? String(v.id).replace(/"/g, '&quot;') : '';
            return `
              <div class="list-item${unassignedClass}" data-vehicle-id="${vid}" style="grid-template-columns: ${gridStr}; cursor:pointer">
                ${cellHtml}
              </div>
            `;
        }
    }).join('') + '</div>' + (viewMode === 'list' ? '</div>' : '') + '';

      listContainer.innerHTML = html;
      
      // Taşıt kartları için grid'i dinamik yap (sadece card view'da)
      if (viewMode === 'card') {
          const gridEl = listContainer.querySelector('.view-card');
          if (gridEl) {
              const totalCards = vehicles.length;
              const isMobile = window.innerWidth <= 640;
              let cols;
              if (totalCards === 1) {
                  cols = 1; // Tek kutu: 1 kolon
              } else if (totalCards === 2) {
                  cols = 2; // 2 kutu: 2 kolon
              } else {
                  cols = isMobile ? 3 : 5; // 3+ kutu: sabit kolon sayısı
              }
              gridEl.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
          }
      }
      
      // Mobil: başlıklar tek punto, en fazla 1pt küçülebilir (biri sığmazsa hepsi küçülür)
      if (viewMode === 'list' && window.innerWidth <= 640) {
          applyMobileListHeaderFontSize(listContainer);
      }
      
      // Mobil: sütun başlıklarına touch ile sürükle-bırak (yer değiştirme)
      if (viewMode === 'list') {
          attachVehicleColumnTouchListeners(listContainer);
      }
    } catch (error) {
      console.error('renderVehicles hatası:', error);
      const target = DOM.vehiclesModalContent;
      if (target) {
        target.innerHTML = '<div style="text-align:center; padding:40px; color:#666">Bir hata oluştu. Lütfen sayfayı yenileyin.</div>';
      }
    }
  }

  // --- Taşıt Detay Göster (Kutuya tıklanınca) ---
  /**
   * Taşıt detay modal'ını açar ve seçili taşıtın bilgilerini gösterir
   * 
   * @param {string} vehicleId - Gösterilecek taşıtın ID'si
   * 
   * Mantık:
   * 1. Taşıt ID'si ile localStorage'dan taşıt bilgisini bul
   * 2. Bulunamazsa kullanıcıya uyarı göster
   * 3. vehicle-detail-modal'ı aç
   * 4. Plaka ve Marka/Model + Yıl bilgilerini modal içine yerleştir
   * 
   * Not: Modal açma/kapama animasyonları CSS transition ile yönetilir
   */
  window.showVehicleDetail = function(vehicleId) {
    const runDetail = () => {
      const vehicles = readVehicles();
      const vehicle = vehicles.find(v => String(v.id) === String(vehicleId));
      if (!vehicle) {
        alert("Taşıt bulunamadı!");
        return;
      }

      window.currentDetailVehicleId = vehicleId;

    const modal = DOM.vehicleDetailModal;
    if (!modal) return;

    const contentEl = DOM.vehicleDetailContent;
    if (!contentEl) return;

    // Plaka (üstte yatayda ortalı) - Satıldı durumu için kırmızı yazı ekle
    // Plaka container'ını kontrol et, yoksa oluştur
    let plateRow = contentEl.querySelector('.detail-plate-row');
    if (!plateRow) {
      const existingPlateEl = contentEl.querySelector('.detail-plate');
      plateRow = document.createElement('div');
      plateRow.className = 'detail-plate-row';
      
      // Yeni plaka elementi oluştur
      const plateEl = document.createElement('div');
      plateEl.className = 'detail-plate';
      if (vehicle.satildiMi) {
        plateEl.innerHTML = `${escapeHtml(vehicle.plate || '-')} <span style="color: #d40000; font-size: 16px; margin-left: 8px;">SATILDI</span>`;
      } else {
        plateEl.textContent = vehicle.plate || '-';
      }
      
      plateRow.appendChild(plateEl);
      
      // Mevcut plaka elementini değiştir veya ekle
      if (existingPlateEl && existingPlateEl.parentNode) {
        existingPlateEl.parentNode.replaceChild(plateRow, existingPlateEl);
      } else {
        contentEl.insertBefore(plateRow, contentEl.firstChild);
      }
    } else {
      // Container varsa sadece plakayı güncelle
      const plateEl = plateRow.querySelector('.detail-plate');
      if (plateEl) {
        if (vehicle.satildiMi) {
          plateEl.innerHTML = `${escapeHtml(vehicle.plate || '-')} <span style="color: #d40000; font-size: 16px; margin-left: 8px;">SATILDI</span>`;
        } else {
          plateEl.textContent = vehicle.plate || '-';
        }
      }
    }

    // Marka Model satırına butonları ekle (Olay Ekle solda, Marka/Model ortada, Tarihçe sağda)
    const brandYearRow = contentEl.querySelector('.detail-brand-year-row');
    const brandYearEl = contentEl.querySelector('.detail-brand-year');
    
    if (brandYearRow && brandYearEl) {
      const brandModel = toTitleCase(vehicle.brandModel || '-');
      brandYearEl.textContent = brandModel;
      
      // Mevcut butonları kaldır (eğer varsa)
      const existingHistoryBtn = brandYearRow.querySelector('.history-btn-minimal');
      const existingAddEventBtn = brandYearRow.querySelector('.history-add-event-btn');
      if (existingHistoryBtn) existingHistoryBtn.remove();
      if (existingAddEventBtn) existingAddEventBtn.remove();
      
      // Olay Ekle butonu (solda)
      const addEventBtn = document.createElement('button');
      addEventBtn.className = 'history-add-event-btn';
      addEventBtn.innerHTML = `
        <span>! Olay Ekle</span>
      `;
      addEventBtn.onclick = () => openEventModal('menu', vehicle.id);
      brandYearRow.insertBefore(addEventBtn, brandYearEl);
      
      // Tarihçe butonu (sağda)
      const historyBtn = document.createElement('button');
      historyBtn.className = 'history-btn-minimal';
      historyBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M5 22h14"/>
          <path d="M5 2h14"/>
          <path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"/>
          <path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/>
        </svg>
        <span>Tarihçe</span>
      `;
      historyBtn.title = 'Tarihçe';
      historyBtn.setAttribute('aria-label', 'Tarihçe');
      historyBtn.onclick = () => showVehicleHistory(null);
      brandYearRow.appendChild(historyBtn);
    }

    // İki kolonlu layout'u render et
    renderVehicleDetailLeft(vehicle);
    renderVehicleDetailRight(vehicle);

    // Toolbar oluştur/kontrol et (detay modalında) - Her durumda geri tuşu ekle
    const modalHeader = modal.querySelector('.modal-header');
    let detailToolbar = modal.querySelector('.vehicle-detail-toolbar');
    
    // Toolbar yoksa oluştur
    if (!detailToolbar && modalHeader) {
      detailToolbar = document.createElement('div');
      detailToolbar.className = 'vehicle-detail-toolbar';
      modalHeader.after(detailToolbar);
    }
    
    if (detailToolbar) {
      // Toolbar içeriğini temizle
      detailToolbar.innerHTML = '';

      // Sol taraf (geri butonu + hedef sayfa etiketi)
      const toolbarLeft = document.createElement('div');
      toolbarLeft.style.display = 'flex';
      toolbarLeft.style.alignItems = 'center';
      toolbarLeft.style.gap = '8px';

      // Geri gidilecek hedef: lastListContext (geldiğimiz liste)
      let backLabel = 'Taşıtlar';
      if (lastListContext) {
        if (lastListContext.mode === 'archive') {
          backLabel = 'Arşiv';
        } else if (lastListContext.branchId === 'all') {
          backLabel = 'Taşıtlar';
        } else {
          backLabel = lastListContext.branchName + ' Taşıtlar';
        }
      }

      // Geri butonu (evrensel yapı)
      const backBar = document.createElement('div');
      backBar.className = 'universal-back-bar';
      const backBtn = document.createElement('button');
      backBtn.type = 'button';
      backBtn.className = 'universal-back-btn';
      backBtn.innerHTML = `<svg class="back-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg><span class="universal-back-label">${escapeHtml(backLabel)}</span>`;
      backBtn.onclick = () => {
        closeVehicleDetailModal();
        if (lastListContext && lastListContext.mode === 'archive') {
          openArchiveView();
        } else if (lastListContext && lastListContext.mode === 'branch') {
          openBranchList(lastListContext.branchId, lastListContext.branchName);
        } else {
          renderBranchDashboard();
        }
      };
      backBar.appendChild(backBtn);
      toolbarLeft.appendChild(backBar);
      
      // Orta taraf (tahsis butonu - sadece tahsis edilmemiş taşıtlar için)
      // Yatayda ortalı: sol ok ve Taşıtlar dikkate alınmadan, tam ekran ortası
      const toolbarCenter = document.createElement('div');
      toolbarCenter.className = 'detail-toolbar-center-absolute';
      toolbarCenter.style.display = 'flex';
      toolbarCenter.style.alignItems = 'center';
      toolbarCenter.style.justifyContent = 'center';
      toolbarCenter.style.flex = '1';
      
      if (!vehicle.branchId) {
        const assignBtn = document.createElement('button');
        assignBtn.className = 'detail-assign-button-frameless';
        assignBtn.innerHTML = '<span>Şubeye Tahsis Etmek İçin +</span>';
        assignBtn.onclick = (e) => {
          e.stopPropagation();
          openEventModal('sube', vehicleId);
        };
        toolbarCenter.appendChild(assignBtn);
      }
      
      // Sağ taraf (ruhsat simgesi + yazdır butonu)
      const toolbarRight = document.createElement('div');
      toolbarRight.className = 'toolbar-right';
      const ruhsatBtn = document.createElement('button');
      ruhsatBtn.type = 'button';
      ruhsatBtn.className = 'vehicle-ruhsat-btn';
      ruhsatBtn.title = vehicle.ruhsatPath ? 'Ruhsatı Görüntüle' : 'Ruhsat Yükle';
      ruhsatBtn.setAttribute('aria-label', 'Ruhsat');
      ruhsatBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg>';
      ruhsatBtn.onclick = (e) => { e.stopPropagation(); if (typeof window.openRuhsatModal === 'function') window.openRuhsatModal(vehicleId); };
      toolbarRight.appendChild(ruhsatBtn);
      const printBtn = document.createElement('button');
      printBtn.type = 'button';
      printBtn.className = 'vehicle-print-btn';
      printBtn.title = 'Taşıt Kartı Yazdır';
      printBtn.setAttribute('aria-label', 'Taşıt Kartı Yazdır');
      printBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/></svg>`;
      printBtn.onclick = (e) => {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        window.printVehicleCard(vehicle.id);
      };
      toolbarRight.appendChild(printBtn);
      
      // Toolbar'a bölümleri ekle
      detailToolbar.appendChild(toolbarLeft);
      detailToolbar.appendChild(toolbarCenter);
      detailToolbar.appendChild(toolbarRight);
    }
    
    // Eski buton container'ını kaldır (varsa)
    const oldAssignContainer = modal.querySelector('.detail-assign-button-container');
    if (oldAssignContainer) {
      oldAssignContainer.remove();
    }

    // Tahsis edilmemiş mi kontrol et
    const existingAssign = contentEl.querySelector('.detail-branch-assign');
    if (existingAssign) existingAssign.remove(); // Önceki formu temizle

    if (!vehicle.branchId) {
      // Tahsis edilmemiş - Şube atama formu göster
      const branches = readBranches();
      
      const assignDiv = document.createElement('div');
      assignDiv.className = 'detail-branch-assign';
      
      assignDiv.innerHTML = `
        <div class="assign-toggle" onclick="toggleBranchAssign()">+ Şubeye Tahsis Et</div>
        <div class="assign-form" id="assign-form" style="display: none;">
          <select id="detail-branch-select" class="assign-select">
            <option value="" disabled selected>Şube Seçiniz</option>
          </select>
          <div class="universal-btn-group">
            <button type="button" class="universal-btn-save" onclick="assignVehicleToBranch('${vehicleId}')">Kaydet</button>
            <button type="button" class="universal-btn-cancel" onclick="closeVehicleDetailModal()">Vazgeç</button>
          </div>
        </div>
      `;
      
      contentEl.appendChild(assignDiv);
      
      // Şubeleri dinamik olarak ekle
      const selectEl = document.getElementById('detail-branch-select');
      if (selectEl) {
        // Önce select'i resetle (placeholder'ı garanti görünür yap)
        selectEl.value = '';
        selectEl.selectedIndex = 0;
        selectEl.classList.remove('has-value');
        selectEl.style.color = '#888';
        
        // Şubeleri ekle
        if (branches.length > 0) {
          branches.forEach(b => {
            const opt = document.createElement('option');
            opt.value = b.id;
            opt.textContent = b.name;
            selectEl.appendChild(opt);
          });
        }
        
        // Placeholder'ın seçili kalmasını garanti et
        if (selectEl.options.length > 0) {
          selectEl.selectedIndex = 0;
          selectEl.value = '';
          selectEl.classList.remove('has-value');
          selectEl.style.color = '#888';
        }
        
        // Change event listener - seçim yapıldığında rengi değiştir
        selectEl.addEventListener('change', function() {
          if (this.value === '') {
            this.classList.remove('has-value');
            this.style.color = '#888';
          } else {
            this.classList.add('has-value');
            this.style.color = '#f0f0f0';
          }
        });
      }
    }

    // Modalı aç
    modal.style.display = 'flex';
    requestAnimationFrame(() => {
      modal.classList.add('active');
      requestAnimationFrame(() => { applyVehicleDetailSubeShrink(); });
    });
    };
    if (typeof window.loadDataFromServer === 'function') {
      window.loadDataFromServer().then(runDetail).catch(runDetail);
    } else {
      runDetail();
    }
  };

  /**
   * Mobil (≤768px) Taşıtlar detay modalında şube ismi tek satıra sığmıyorsa 1pt küçült.
   * Satırdaki mevcut alan ile metnin tek satır genişliği karşılaştırılır; taşma varsa -shrink eklenir.
   */
  window.applyVehicleDetailSubeShrink = function() {
    if (window.innerWidth > 768) return;
    const modal = DOM.vehicleDetailModal;
    if (!modal || modal.style.display !== 'flex') return;
    const el = modal.querySelector('.detail-row-value-sube');
    if (!el) return;
    const row = el.closest('.detail-row-inline');
    if (!row) return;
    el.classList.remove('detail-row-value-sube-shrink');
    var prevWhiteSpace = el.style.whiteSpace;
    el.style.whiteSpace = 'nowrap';
    var textWidth = el.scrollWidth;
    el.style.whiteSpace = prevWhiteSpace || '';
    var headerWidth = row.querySelector('.detail-row-header') ? row.querySelector('.detail-row-header').offsetWidth : 0;
    var gap = 5;
    var availableWidth = row.clientWidth - headerWidth - gap;
    if (textWidth > availableWidth) el.classList.add('detail-row-value-sube-shrink');
  };

  // --- Şube Atama Formunu Aç/Kapat ---
  window.toggleBranchAssign = function() {
    const form = document.getElementById('assign-form');
    if (form) {
      form.style.display = form.style.display === 'none' ? 'flex' : 'none';
    }
  };

  // --- Şubeye Tahsis Et ---
  window.assignVehicleToBranch = function(vehicleId) {
    const selectEl = document.getElementById('detail-branch-select');
    if (!selectEl) return;
    
    const branchId = selectEl.value;
    if (!branchId) {
      alert('Lütfen bir şube seçiniz!');
      return;
    }
    
    const vehicles = readVehicles();
    const vehicle = vehicles.find(v => String(v.id) === String(vehicleId));
    if (!vehicle) return;
    
    const branches = readBranches();
    const eskiSubeId = vehicle.branchId || '';
    const eskiSube = branches.find(b => String(b.id) === String(eskiSubeId));
    const yeniSube = branches.find(b => String(b.id) === String(branchId));
    const normalizedBranchId = yeniSube ? yeniSube.id : branchId;

    if (!vehicle.events) vehicle.events = [];
    vehicle.events.unshift({
      id: Date.now().toString(),
      type: 'sube-degisiklik',
      date: formatDateForDisplay(new Date()),
      timestamp: new Date().toISOString(),
      data: {
        eskiSubeId: eskiSubeId,
        yeniSubeId: normalizedBranchId,
        eskiSubeAdi: eskiSube?.name || '',
        yeniSubeAdi: yeniSube?.name || ''
      }
    });

    vehicle.branchId = normalizedBranchId;
    writeVehicles(vehicles);

    closeVehicleDetailModal();
    renderBranchDashboard();
  };

  // --- Tüm Modalları Kapat ---
  window.closeAllModals = function() {
    const modalIds = [
      'vehicles-modal',
      'vehicle-detail-modal', 
      'vehicle-history-modal',
      'event-menu-modal',
      'bakim-ekle-modal',
      'kaza-ekle-modal',
      'sigorta-guncelle-modal',
      'kasko-guncelle-modal',
      'muayene-guncelle-modal',
      'anahtar-guncelle-modal',
      'kredi-guncelle-modal',
      'km-guncelle-modal',
      'lastik-guncelle-modal',
      'utts-guncelle-modal',
      'takip-cihaz-guncelle-modal',
      'kullanici-atama-modal',
      'kasko-kodu-guncelle-modal',
      'sube-degisiklik-modal',
      'satis-pert-modal'
    ];
    
    modalIds.forEach(id => {
      const modal = (id === 'vehicles-modal' ? DOM.vehiclesModal :
                    id === 'vehicle-detail-modal' ? DOM.vehicleDetailModal :
                    id === 'vehicle-history-modal' ? DOM.vehicleHistoryModal :
                    id === 'event-menu-modal' ? DOM.eventMenuModal : null) || document.getElementById(id);
      if (modal) {
        resetModalState(modal);
        modal.classList.remove('active', 'open');
        modal.style.display = 'none';
      }
    });
    window.currentDetailVehicleId = null;
  };

  // --- Taşıt Detay Modalını Kapat ---
  window.closeVehicleDetailModal = function() {
    const modal = DOM.vehicleDetailModal;
    if (modal) {
      resetModalState(modal);
      modal.classList.remove('active');
      setTimeout(() => modal.style.display = 'none', 300);
    }
  };

  // --- ARAMA İŞLEMLERİ ---
  let searchMode = 'local'; // 'global' or 'local'

  window.toggleSearchBox = function(mode) {
      searchMode = mode;
      const box = getVSearchContainer();
      const input = getVSearchInput();
      if (!box || !input) return;
      
      if (box.classList.contains('open')) {
          closeSearchBox();
      } else {
          closeFilterMenu();
          box.classList.add('open');
          input.value = '';
          setTimeout(() => input.focus(), 100);
      }
  };

  window.closeSearchBox = function() {
      const box = getVSearchContainer();
      if (box) box.classList.remove('open');
      const input = getVSearchInput();
      if (input) input.value = '';
      
      // Arama kapanınca listeyi resetle (eğer global aramadaysak dashboarda dön)
      if (currentView === 'dashboard' && modalContent.innerHTML.includes('Arama Sonuçları')) {
          renderBranchDashboard();
      } else if (currentView === 'list') {
          renderVehicles('');
      }
  };

  // Dış tıklama: arama açıkken kutu veya büyüteç dışına tıklanınca kapat
  document.addEventListener('click', function(e) {
      const box = getVSearchContainer();
      if (!box || !box.classList.contains('open')) return;
      if (e.target.closest('#v-search-container') || e.target.closest('.search-toggle-btn')) return;
      closeSearchBox();
  });
  // Esc: arama açıkken kapat
  document.addEventListener('keydown', function(e) {
      if (e.key !== 'Escape') return;
      const box = getVSearchContainer();
      if (!box || !box.classList.contains('open')) return;
      closeSearchBox();
  });

  window.setTransmissionFilter = function(val) {
      transmissionFilter = (val === 'otomatik' || val === 'manuel') ? val : '';
  };

  window.toggleTransmissionMenu = function(ev) {
      if (ev) ev.stopPropagation();
      var dd = getVTransmissionDropdown();
      if (!dd) return;
      var isOpen = dd.classList.contains('open');
      closeTransmissionMenu();
      if (!isOpen) {
          closeSearchBox();
          closeFilterMenu();
          dd.classList.add('open');
          dd.setAttribute('aria-hidden', 'false');
      }
  };

  window.closeTransmissionMenu = function() {
      var dd = getVTransmissionDropdown();
      if (dd) {
          dd.classList.remove('open');
          dd.setAttribute('aria-hidden', 'true');
      }
  };

  var handleSearchImpl = function(val) {
      if (searchMode === 'local') {
          renderVehicles(val);
      } else {
          // Global Arama (Dashboard'ı geçici ez)
          if (!val) {
              renderBranchDashboard();
              return;
          }
          const all = readVehicles();
          const q = val.toLowerCase();
          let filtered = all.filter(v => 
            (v.plate && v.plate.toLowerCase().includes(q)) ||
            (v.brandModel && v.brandModel.toLowerCase().includes(q)) ||
            (v.year && String(v.year).includes(q)) ||
            (v.tahsisKisi && v.tahsisKisi.toLowerCase().includes(q))
          );
          if (transmissionFilter) {
            filtered = filtered.filter(v => v.transmission === transmissionFilter);
          }
          
          // Sonuçları Liste Modunda Göster (tıklanınca detay açılsın - event delegation ile)
          let html = `<div style="padding:10px; color:#aaa; font-size:12px;">GENEL ARAMA SONUÇLARI (${filtered.length})</div>`;
          html += `<div class="view-list">` + filtered.map(v => {
              const vid = v.id != null ? String(v.id).replace(/"/g, '&quot;') : '';
              return `
              <div class="list-item" data-vehicle-id="${vid}" style="cursor:pointer">
                <div class="list-info">
                  <h4>${escapeHtml(toTitleCase(v.brandModel || '-'))}</h4>
                  <span>${v.year} • ${v.tahsisKisi || 'Boşta'}</span>
                </div>
              </div>
          `}).join('') + `</div>`;
          
          modalContent.innerHTML = html;
      }
  };
  window.handleSearch = (typeof window.debounce === 'function') ? window.debounce(handleSearchImpl, 200) : handleSearchImpl;

  // --- FİLTRE DROPDOWN ---
  window.closeFilterMenu = function() {
      const fd = getFilterDropdown();
      if (fd) fd.classList.remove('open');
  };

  window.toggleFilterMenu = function(e) {
      if (e) e.stopPropagation();
      const fd = getFilterDropdown();
      if (!fd) return;
      if (fd.classList.contains('open')) {
          closeFilterMenu();
      } else {
          closeSearchBox();
          fd.classList.add('open');
          fd.querySelectorAll('.filter-dropdown-btn').forEach(function(btn) {
              btn.classList.toggle('active', btn.dataset.filter === currentFilter);
          });
      }
  };
  
  // Filtreleme ve şanzıman menüsü: dışarı tıklandığında kapat
  document.addEventListener('click', function(e) {
      const fd = getFilterDropdown();
      const filterBtn = document.querySelector('.vt-icon-btn[onclick*="toggleFilterMenu"]');
      const transWrap = e.target.closest('.v-transmission-wrap');
      const transDd = getVTransmissionDropdown();

      if (fd && fd.contains(e.target)) return;
      if (filterBtn && filterBtn.contains(e.target)) return;
      if (transWrap) return;

      if (fd && fd.classList.contains('open')) closeFilterMenu();
      if (transDd && transDd.classList.contains('open')) closeTransmissionMenu();
  });

  // Sütun başlığına tıklanınca sıralama yap
  window.handleColumnSort = function(column) {
    if (sortColumn === column) {
      // Aynı sütuna tekrar tıklanınca yön değiştir
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      // Yeni sütuna tıklanınca artan sıralama yap
      sortColumn = column;
      sortDirection = 'asc';
    }
    renderVehicles(getVSearchInput()?.value || '');
  };

  function applyFilter(list) {
      if (!sortColumn) {
          // Varsayılan sıralama yoksa orijinal sırayı koru
          return list;
      }
      
      const sorted = Array.isArray(list) ? [...list] : [];
      const dir = sortDirection === 'asc' ? 1 : -1;
      const branches = sortColumn === 'branch' ? (readBranches() || []) : null;
      const getBranchName = branches && branches.length >= 0 ? (branchId) => {
          if (!branchId) return 'zzz_tahsis_edilmemis';
          const branch = branches.find(b => String(b.id) === String(branchId));
          return branch ? branch.name.toLowerCase() : 'zzz_unknown';
      } : null;

      sorted.sort((a, b) => {
          let aVal, bVal;
          
          switch(sortColumn) {
              case 'year':
                  aVal = parseInt(a.year) || 0;
                  bVal = parseInt(b.year) || 0;
                  return (aVal - bVal) * dir;
                  
              case 'brand':
                  aVal = (a.brandModel || '').toLowerCase();
                  bVal = (b.brandModel || '').toLowerCase();
                  return aVal.localeCompare(bVal) * dir;
                  
              case 'plate':
                  aVal = (a.plate || '').toLowerCase();
                  bVal = (b.plate || '').toLowerCase();
                  return aVal.localeCompare(bVal) * dir;
                  
              case 'km':
                  aVal = parseInt((a.guncelKm || a.km || '0').toString().replace(/\./g, '')) || 0;
                  bVal = parseInt((b.guncelKm || b.km || '0').toString().replace(/\./g, '')) || 0;
                  return (aVal - bVal) * dir;
                  
              case 'type':
                  aVal = (a.vehicleType || '').toLowerCase();
                  bVal = (b.vehicleType || '').toLowerCase();
                  return aVal.localeCompare(bVal) * dir;
                  
              case 'branch':
                  aVal = getBranchName(a.branchId);
                  bVal = getBranchName(b.branchId);
                  return aVal.localeCompare(bVal) * dir;
                  
              default:
                  return 0;
          }
      });
      
      return sorted;
  }

  window.toggleViewMode = function() {
      viewMode = (viewMode === 'card') ? 'list' : 'card';
      updateToolbar('detail', document.querySelector('.active-branch-title')?.textContent || '');
      renderVehicles(getVSearchInput()?.value || '');
  };

  // --- VEHICLE DETAIL - NEW FUNCTIONS ---

  function checkDateWarnings(dateString) { return (typeof window.checkDateWarnings === 'function' ? window.checkDateWarnings(dateString) : { class: '', days: null }); }
  function formatDateForDisplay(dateStr) {
    if (!dateStr) return '';
    if (typeof window.formatDateShort === 'function') {
      const formatted = window.formatDateShort(dateStr);
      if (formatted) return String(formatted);
    }
    const raw = String(dateStr).trim();
    const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
    const dot = raw.match(/^(\d{2})[./-](\d{2})[./-](\d{4})$/);
    if (dot) return `${dot[1]}/${dot[2]}/${dot[3]}`;
    const parsed = new Date(raw);
    if (!isNaN(parsed.getTime())) {
      const d = String(parsed.getDate()).padStart(2, '0');
      const m = String(parsed.getMonth() + 1).padStart(2, '0');
      const y = String(parsed.getFullYear());
      return `${d}/${m}/${y}`;
    }
    return raw;
  }
  function getLatestApprovedKmCorrection(vehicleId, kmEvents) {
    const appData = (window.appData && typeof window.appData === 'object') ? window.appData : {};
    const duzeltmeTalepleri = Array.isArray(appData.duzeltme_talepleri) ? appData.duzeltme_talepleri : [];
    const aylikHareketler = Array.isArray(appData.arac_aylik_hareketler) ? appData.arac_aylik_hareketler : [];
    const kayitAracMap = new Map();
    aylikHareketler.forEach(k => {
      if (k && k.id != null && k.arac_id != null) kayitAracMap.set(String(k.id), String(k.arac_id));
    });
    const aracIdStr = String(vehicleId);
    const onayliKmTalepleri = duzeltmeTalepleri
      .filter(t => t && t.durum === 'onaylandi' && t.yeni_km != null && kayitAracMap.get(String(t.kayit_id)) === aracIdStr)
      .sort((a, b) => String(b.admin_yanit_tarihi || b.talep_tarihi || '').localeCompare(String(a.admin_yanit_tarihi || a.talep_tarihi || '')));
    const duzeltmeEvent = kmEvents.find(e => e && e.data && e.data.duzeltmeTalebi === true);
    if (duzeltmeEvent) {
      return {
        talep_tarihi: duzeltmeEvent.data?.duzeltmeTalepTarihi || duzeltmeEvent.timestamp || duzeltmeEvent.date || '',
        yeni_km: duzeltmeEvent.data?.yeniKm || ''
      };
    }
    return onayliKmTalepleri[0] || null;
  }

  function buildKmCorrectionNoteHtml(talep) {
    if (!talep) return '';
    const talepTarihi = formatDateForDisplay(talep.talep_tarihi || '');
    const talepKm = formatNumber(talep.yeni_km || '');
    const notMetni = `Not; Km Bilgisi, ${talepTarihi || '-'} Tarihli D\u00fczeltme Talebine \u0130stinaden ${talepKm || '-'} Km Olarak G\u00fcncellenmi\u015ftir.`;
    return `<div class="history-item-body" style="font-size: 11px; margin-top: 4px; color: #d40000; line-height: 1.35;">${escapeHtml(notMetni)}</div>`;
  }

  /**
   * Taşıt tipi görünen adını döndürür
   */
  function getVehicleTypeLabel(type) {
    const labels = {
      'otomobil': 'Otomobil / SUV',
      'minivan': 'Küçük Ticari',
      'kamyon': 'Büyük Ticari'
    };
    return labels[type] || type;
  }

  window._kaskoCache = null;
  window.clearKaskoCache = function() {
    window._kaskoCache = null;
  };

  function getKaskoDegeri(kaskoKodu, modelYili) {
    if (!kaskoKodu) return '-';
    try {
      if (!window._kaskoCache) {
        var raw = localStorage.getItem('medisa_kasko_liste');
        if (!raw) return '-';
        window._kaskoCache = JSON.parse(raw);
      }
      var data = window._kaskoCache;
      if (!Array.isArray(data) || data.length < 2) return '-';

      // 1. Başlıkları Bul
      var headerRowIndex = -1;
      for(var i=0; i<10; i++) {
        var rowStr = JSON.stringify(data[i] || []).toLowerCase();
        if(rowStr.includes("marka") && rowStr.includes("kod")) {
          headerRowIndex = i;
          break;
        }
      }
      if (headerRowIndex === -1) headerRowIndex = 1;
      var headers = data[headerRowIndex];

      // 2. Kolonları Bul
      var markaIndex = -1, tipIndex = -1, yearIndex = -1;
      var targetYear = String(modelYili).trim();

      for (var c = 0; c < headers.length; c++) {
        var h = String(headers[c] || '').toLowerCase().trim();
        var hRaw = String(headers[c] || '').trim();
        if (h.includes('marka') && h.includes('kod')) markaIndex = c;
        if ((h.includes('tip') || h.includes('model')) && h.includes('kod')) tipIndex = c;
        if (hRaw === targetYear || hRaw === targetYear + ".0") yearIndex = c;
      }

      if (markaIndex === -1) markaIndex = 0;
      if (tipIndex === -1) tipIndex = 1;
      if (yearIndex === -1) return 'Yıl Bulunamadı (' + targetYear + ')';

      // Hedef kasko kodunu rakam yap ve başındaki sıfırları at (Örn: 03210 -> 3210)
      var targetClean = String(kaskoKodu).replace(/[^0-9]/g, '').replace(/^0+/, '');

      for (var r = headerRowIndex + 1; r < data.length; r++) {
        var row = data[r];
        if (!row || row.length < 2) continue;

        // Excel'deki Marka ve Tip kodunu birleştir, sıfırları at
        var m = String(row[markaIndex] || '').replace(/[^0-9]/g, '').replace(/^0+/, '');
        var t = String(row[tipIndex] || '').replace(/[^0-9]/g, '').replace(/^0+/, '');
        var currentClean = m + t;

        // YALNIZCA TAM EŞLEŞME (İlk bulduğu yanlış markaya atlamaması için targetClean === m KALDIRILDI)
        if (targetClean === currentClean) {
          var rawVal = String(row[yearIndex] || '').trim();

          var cleanVal = rawVal.replace(/[^0-9,.]/g, '');
          if (cleanVal.includes(',') && cleanVal.includes('.')) {
            cleanVal = cleanVal.replace(/\./g, '').replace(',', '.');
          } else if (cleanVal.includes(',')) {
            cleanVal = cleanVal.replace(',', '.');
          } else if (cleanVal.includes('.') && !cleanVal.includes(',')) {
            cleanVal = cleanVal.replace(/\./g, '');
          }

          var numVal = parseFloat(cleanVal) || parseInt(cleanVal.replace(/\D/g, ''), 10);

          if (!isNaN(numVal) && numVal > 0) {
            return numVal.toLocaleString('tr-TR') + ' ₺';
          } else {
            return 'Değer Yok (Excel: 0)';
          }
        }
      }
      return 'Kasko Kodu Bulunamadı';
    } catch (e) {
      console.error("Kasko Hata:", e);
      return '-';
    }
  }

  window.getKaskoDegeri = getKaskoDegeri;

  /**
   * Excel yüklendiğinde tüm taşıtların kasko değerini hesaplayıp kaydeder.
   * Sunucuya yazılır; böylece Excel olmayan cihazlarda da değer görünür.
   */
  window.guncelleTumKaskoDegerleri = function() {
    var vehicles = readVehicles();
    if (!Array.isArray(vehicles) || vehicles.length === 0) return;
    var tarih = new Date().toISOString();
    vehicles.forEach(function(v) {
      const yearForKasko = v.year || v.modelYili || '';
      v.kaskoDegeri = getKaskoDegeri(v.kaskoKodu, yearForKasko);
      v.kaskoDegeriYuklemeTarihi = tarih;
    });
    writeVehicles(vehicles);
  };

  function getVehiclePrintRows(vehicle) {
    const users = readUsers();
    const branches = readBranches();
    const assignedUserId = vehicle.assignedUserId || '';
    const assignedUser = assignedUserId ? users.find(u => u.id === assignedUserId) : null;
    const assignedUserName = (assignedUser && assignedUser.name) ? assignedUser.name : (vehicle.tahsisKisi || '-');
    const branchName = vehicle.branchId
      ? (branches.find(b => String(b.id) === String(vehicle.branchId))?.name || '-')
      : 'Tahsis Edilmemiş';
    const kmValue = vehicle.guncelKm ? formatNumber(vehicle.guncelKm) : (vehicle.km ? formatNumber(vehicle.km) : '-');
    const anahtarLabel = vehicle.anahtar === 'var' ? (vehicle.anahtarNerede || 'Var') : 'Yoktur.';
    const krediLabel = vehicle.kredi === 'var' ? (vehicle.krediDetay || 'Var') : 'Yoktur.';
    const lastikLabel = vehicle.lastikDurumu === 'var' ? (vehicle.lastikAdres || 'Var') : 'Yoktur.';

    let tramerLabel = 'Yoktur.';
    if (vehicle.tramer === 'var' && vehicle.tramerRecords && vehicle.tramerRecords.length > 0) {
      tramerLabel = vehicle.tramerRecords.map(function(r) {
        return (formatDateForDisplay(r.date) || '-') + ' - ' + (r.amount || '');
      }).join(' | ');
      if (vehicle.tramerRecords.length > 1) {
        var total = 0;
        vehicle.tramerRecords.forEach(function(record) {
          var amountStr = (record.amount || '').replace(/\./g, '').replace(',', '.').replace(/TL/gi, '').trim();
          total += parseFloat(amountStr) || 0;
        });
        tramerLabel += ' | Toplam: ' + total.toFixed(2).replace('.', ',') + ' TL';
      }
    }

    var kaskoDegeri = vehicle.kaskoDegeri;
    if (kaskoDegeri == null || kaskoDegeri === '') {
      var yearForKasko = vehicle.year || vehicle.modelYili || '';
      kaskoDegeri = getKaskoDegeri(vehicle.kaskoKodu, yearForKasko);
    }
    var kaskoDegeriDisplay = (kaskoDegeri != null && String(kaskoDegeri).trim() !== '') ? String(kaskoDegeri).trim() : '-';

    return [
      ['Plaka', vehicle.plate || '-'],
      ['Marka / Model', toTitleCase(vehicle.brandModel || '-')],
      ['Kullanıcı', assignedUserName || '-'],
      ['Şube', branchName],
      ['Taşıt Tipi', getVehicleTypeLabel(vehicle.vehicleType || '-')],
      ['Üretim Yılı', vehicle.year || '-'],
      ['Tescil Tarihi', vehicle.tescilTarihi || '-'],
      ['Km', kmValue],
      ['Şanzıman', vehicle.transmission || '-'],
      ['Tramer Kaydı', tramerLabel],
      ['Sigorta Bitiş Tarihi', vehicle.sigorta || '-'],
      ['Kasko Bitiş Tarihi', vehicle.kasko || '-'],
      ['Muayene Bitiş Tarihi', vehicle.muayene || '-'],
      ['Yedek Anahtar', anahtarLabel],
      ['Kredi/Rehin', krediLabel],
      ['Yazlık/Kışlık Lastik', lastikLabel],
      ['UTTS', vehicle.uttsTanimlandi ? 'Evet' : 'Hayır'],
      ['Taşıt Takip', vehicle.takipCihaziMontaj ? 'Evet' : 'Hayır'],
      ['Kasko Kodu', vehicle.kaskoKodu || '-'],
      ['Kasko Değeri', kaskoDegeriDisplay],
      ['Notlar', vehicle.notes || '-']
    ];
  }

  window.printVehicleCard = function(vehicleId) {
    const vehicles = readVehicles();
    const vehicle = vehicles.find(v => String(v.id) === String(vehicleId));
    if (!vehicle) {
      alert('Taşıt bulunamadı!');
      return;
    }
    /* Şema yazdırmada kaybolmasın diye önce SVG yükle */
    getParsedKaportaSvg().then(function() {
      doPrintVehicleCard(vehicle);
    }).catch(function() {
      doPrintVehicleCard(vehicle);
    });
  };

  function doPrintVehicleCard(vehicle) {
    const allRows = getVehiclePrintRows(vehicle);
    const sigortaIdx = allRows.findIndex(([l]) => l === 'Sigorta Bitiş Tarihi');
    const leftRows = sigortaIdx >= 0 ? allRows.slice(0, sigortaIdx) : allRows.slice(0, 9);
    const rightRows = sigortaIdx >= 0 ? allRows.slice(sigortaIdx) : [];
    const leftTable = leftRows.map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(String(value || '-')).replace(/\n/g, '<br>')}</td></tr>`).join('');
    const rightTable = rightRows.map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(String(value || '-')).replace(/\n/g, '<br>')}</td></tr>`).join('');
    const rows = rightTable
      ? `<div class="vehicle-card-print-grid"><table>${leftTable}</table><table>${rightTable}</table></div>`
      : `<table>${leftTable}</table>`;
    const now = new Date();
    const printedAt = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    function renderPrintHistorySection(title, items) {
      const bodyHtml = items.length
        ? `<ul class="history-print-list">${items.map(item => `
            <li class="history-print-item">
              <div class="history-print-date">${escapeHtml(item.date || '-')}</div>
              <div class="history-print-text">${escapeHtml(item.text || '-')}</div>
              ${item.extra ? `<div class="history-print-extra">${escapeHtml(item.extra)}</div>` : ''}
            </li>`).join('')}</ul>`
        : '<div class="history-print-empty">Kayıt bulunmamaktadır.</div>';
      return `<section class="history-print-card"><h2>${escapeHtml(title)}</h2>${bodyHtml}</section>`;
    }

    function summarizeOtherHistoryEvent(event, branches) {
      const eventType = String(event.type || '').trim();
      const d = event.data || {};
      let text = '';
      let extra = '';

      if (eventType === 'anahtar-guncelle') {
        const durum = String(d.durum || 'yok').toLowerCase();
        text = `Yedek Anahtar: ${durum === 'var' ? 'Var' : 'Yok'}`;
        if (d.detay) extra = `Konum: ${toTitleCase(String(d.detay))}`;
      } else if (eventType === 'lastik-guncelle') {
        const durum = String(d.durum || 'yok').toLowerCase();
        text = `Yazlık/Kışlık Lastik: ${durum === 'var' ? 'Var' : 'Yok'}`;
        if (d.adres) extra = `Konum: ${toTitleCase(String(d.adres))}`;
      } else if (eventType === 'kasko-guncelle') {
        text = 'Kasko Güncelleme';
        const details = [];
        if (d.bitisTarihi) details.push(`Bitiş: ${formatDateForDisplay(d.bitisTarihi) || '-'}`);
        if (d.firma) details.push(`Firma: ${toTitleCase(String(d.firma))}`);
        if (d.acente) details.push(`Acente: ${toTitleCase(String(d.acente))}`);
        extra = details.join(' | ');
      } else if (eventType === 'sigorta-guncelle') {
        text = 'Sigorta Güncelleme';
        const details = [];
        if (d.bitisTarihi) details.push(`Bitiş: ${formatDateForDisplay(d.bitisTarihi) || '-'}`);
        if (d.firma) details.push(`Firma: ${toTitleCase(String(d.firma))}`);
        if (d.acente) details.push(`Acente: ${toTitleCase(String(d.acente))}`);
        extra = details.join(' | ');
      } else if (eventType === 'muayene-guncelle') {
        text = 'Muayene Güncelleme';
        if (d.bitisTarihi) extra = `Bitiş: ${formatDateForDisplay(d.bitisTarihi) || '-'}`;
      } else if (eventType === 'kullanici-atama') {
        text = 'Kullanıcı Ataması';
        const details = [];
        if (d.kullaniciAdi) details.push(`Yeni: ${toTitleCase(String(d.kullaniciAdi))}`);
        if (d.eskiKullaniciAdi) details.push(`Önceki: ${toTitleCase(String(d.eskiKullaniciAdi))}`);
        extra = details.join(' | ');
      } else if (eventType === 'sube-degisiklik') {
        text = 'Şube Değişikliği';
        const yeni = d.yeniSubeAdi || branches.find(b => String(b.id) === String(d.yeniSubeId))?.name || '';
        const eski = d.eskiSubeAdi || branches.find(b => String(b.id) === String(d.eskiSubeId))?.name || '';
        const details = [];
        if (yeni) details.push(`Yeni: ${toTitleCase(String(yeni))}`);
        if (eski) details.push(`Önceki: ${toTitleCase(String(eski))}`);
        extra = details.join(' | ');
      } else if (eventType === 'kredi-guncelle') {
        const durum = String(d.durum || 'yok').toLowerCase();
        text = `Kredi/Rehin: ${durum === 'var' ? 'Var' : 'Yok'}`;
        if (d.detay) extra = `Detay: ${toTitleCase(String(d.detay))}`;
      } else if (eventType === 'utts-guncelle') {
        text = `UTTS: ${(d.durum === true || d.durum === 'evet') ? 'Evet' : 'Hayır'}`;
      } else if (eventType === 'takip-cihaz-guncelle') {
        text = `Takip Cihazı: ${(d.durum === true || d.durum === 'var') ? 'Var' : 'Yok'}`;
      } else if (eventType === 'not-guncelle') {
        text = 'Not Güncelleme';
        if (d.not) extra = String(d.not).length > 120 ? String(d.not).slice(0, 120) + '...' : String(d.not);
      } else if (eventType === 'satis') {
        text = 'Satış / Pert';
      } else {
        text = toTitleCase(eventType || 'Diğer İşlem');
      }

      return { text: text || '-', extra: extra || '' };
    }

    function buildPrintHistorySections(vehicleRecord) {
      const sections = { bakim: [], kaza: [], km: [], diger: [] };
      const events = Array.isArray(vehicleRecord.events) ? vehicleRecord.events : [];
      const branches = readBranches();
      const partNames = (typeof getKaportaPartNames === 'function') ? getKaportaPartNames() : {};

      events.forEach(function(event) {
        const dateText = formatDateForDisplay(event.date) || '-';
        const data = event.data || {};

        if (event.type === 'bakim') {
          const details = [
            `Servis: ${toTitleCase(String(data.servis || '-'))}`,
            `Kişi: ${toTitleCase(String(data.kisi || '-'))}`
          ];
          if (data.km) details.push(`Km: ${formatNumber(data.km)}`);
          if (data.tutar) details.push(`Tutar: ${data.tutar}`);
          sections.bakim.push({
            date: dateText,
            text: toTitleCase(String(data.islemler || '-')),
            extra: details.join(' | ')
          });
          return;
        }

        if (event.type === 'kaza') {
          const details = [`Kullanıcı: ${toTitleCase(String(data.surucu || '-'))}`];
          if (data.hasarTutari) details.push(`Hasar Tutarı: ${data.hasarTutari}`);

          const hasarParcalari = data.hasarParcalari;
          if (hasarParcalari && typeof hasarParcalari === 'object') {
            const boyaliList = [];
            const degisenList = [];
            Object.keys(hasarParcalari).forEach(partId => {
              const partName = toTitleCase(String(partNames[partId] || partId));
              if (hasarParcalari[partId] === 'boyali') boyaliList.push(partName);
              if (hasarParcalari[partId] === 'degisen') degisenList.push(partName);
            });
            if (boyaliList.length) details.push(`Boyalı: ${boyaliList.join(', ')}`);
            if (degisenList.length) details.push(`Değişen: ${degisenList.join(', ')}`);
          }

          const aciklama = String(data.aciklama || '').trim();
          sections.kaza.push({
            date: dateText,
            text: details.join(' | '),
            extra: aciklama ? `Açıklama: ${toTitleCase(aciklama)}` : ''
          });
          return;
        }

        if (event.type === 'km-revize') {
          const userRaw = String(data.surucu || data.kullaniciAdi || '').trim();
          const userText = userRaw ? toTitleCase(userRaw) : 'Bilinmiyor';
          const eskiKm = data.eskiKm ? formatNumber(data.eskiKm) : '-';
          const yeniKm = data.yeniKm ? formatNumber(data.yeniKm) : '-';
          sections.km.push({
            date: dateText,
            text: `${userText}: ${eskiKm} → ${yeniKm}`,
            extra: ''
          });
          return;
        }

        const otherSummary = summarizeOtherHistoryEvent(event, branches);
        sections.diger.push({
          date: dateText,
          text: otherSummary.text,
          extra: otherSummary.extra
        });
      });

      return [
        renderPrintHistorySection('Bakım', sections.bakim),
        renderPrintHistorySection('Kaza', sections.kaza),
        renderPrintHistorySection('Km', sections.km),
        renderPrintHistorySection('Diğer', sections.diger)
      ].join('');
    }

    const historySectionsHtml = buildPrintHistorySections(vehicle);

    function buildKaportaPrintSectionHtml(vehicleRecord) {
      const partNames = (typeof getKaportaPartNames === 'function') ? getKaportaPartNames() : {};
      const stateMap = (vehicleRecord && vehicleRecord.boyaliParcalar && typeof vehicleRecord.boyaliParcalar === 'object')
        ? vehicleRecord.boyaliParcalar
        : {};
      const boyaliList = [];
      const degisenList = [];

      Object.keys(stateMap).forEach(function(partId) {
        const partName = toTitleCase(String(partNames[partId] || partId));
        if (stateMap[partId] === 'boyali') boyaliList.push(partName);
        if (stateMap[partId] === 'degisen') degisenList.push(partName);
      });

      boyaliList.sort(function(a, b) { return a.localeCompare(b, 'tr'); });
      degisenList.sort(function(a, b) { return a.localeCompare(b, 'tr'); });

      function listHtml(items) {
        if (!items.length) return '<div class="kaporta-print-empty">Yok</div>';
        return `<ul class="kaporta-print-list">${items.map(function(name) { return `<li>${escapeHtml(name)}</li>`; }).join('')}</ul>`;
      }

      let svgMarkup = '';
      try {
        if (parsedKaportaSvgCache) {
          const svgClone = parsedKaportaSvgCache.cloneNode(true);
          const defaultGray = '#b5b5b5';
          const allParts = svgClone.querySelectorAll('path[id]');
          allParts.forEach(function(part) {
            part.setAttribute('fill', defaultGray);
            part.style.fill = defaultGray;
          });
          Object.keys(stateMap).forEach(function(partId) {
            const part = svgClone.querySelector('#' + partId);
            if (!part) return;
            if (stateMap[partId] === 'boyali') {
              part.setAttribute('fill', '#28a745');
              part.style.fill = '#28a745';
            } else if (stateMap[partId] === 'degisen') {
              part.setAttribute('fill', '#d40000');
              part.style.fill = '#d40000';
            }
          });
          svgClone.style.width = '170px';
          svgClone.style.height = '260px';
          svgClone.style.display = 'block';
          svgClone.style.margin = '0 auto';
          svgClone.style.transform = 'rotate(90deg)';
          svgClone.style.transformOrigin = 'center center';
          svgMarkup = svgClone.outerHTML;
        }
      } catch (e) {
        svgMarkup = '';
      }

      if (!svgMarkup) {
        const fallbackSrc = new URL('icon/kaporta.svg', window.location.href).href;
        svgMarkup = `<img src="${escapeHtml(fallbackSrc)}" alt="Kaporta Şeması" class="kaporta-print-fallback">`;
      }

      return `<section class="kaporta-print-section">
        <h2>Kaporta Şeması</h2>
        <div class="kaporta-print-row">
          <div class="kaporta-print-state-grid">
            <div class="kaporta-print-col">
              <h3>Boyalı Parçalar</h3>
              ${listHtml(boyaliList)}
            </div>
            <div class="kaporta-print-col">
              <h3>Değişen Parçalar</h3>
              ${listHtml(degisenList)}
            </div>
          </div>
          <div class="kaporta-print-schema-wrap">${svgMarkup}</div>
        </div>
      </section>`;
    }

    const kaportaPrintSectionHtml = buildKaportaPrintSectionHtml(vehicle);

    const printHtml = `<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <title>Taşıt Kartı - ${escapeHtml(vehicle.plate || '-')}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; color: #111; }
    h1 { margin: 0 0 4px; font-size: 24px; }
    .subtitle { margin: 0 0 10px; color: #555; font-size: 13px; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; vertical-align: top; font-size: 13px; line-height: 1.3; }
    th { width: 35%; min-width: 100px; max-width: 160px; background: #f4f4f4; }
    td { width: 65%; }
    .vehicle-card-print-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px; }
    .vehicle-card-print-grid table { width: 100%; }
    @media (max-width: 760px) { .vehicle-card-print-grid { grid-template-columns: 1fr; } }
    .kaporta-print-section { margin-top: 4px; border: 1px solid #ddd; border-radius: 8px; padding: 4px; page-break-inside: avoid; break-inside: avoid; }
    .kaporta-print-section h2 { margin: 0 0 4px; font-size: 16px; }
    .kaporta-print-row { display: flex; flex-direction: row; align-items: flex-start; gap: 8px; flex-wrap: nowrap; }
    .kaporta-print-state-grid { flex: 0 0 auto; display: grid; grid-template-columns: auto auto; gap: 4px 6px; }
    .kaporta-print-schema-wrap { flex: 0 0 auto; min-width: 180px; min-height: 180px; display: flex; align-items: center; justify-content: center; overflow: visible; }
    .kaporta-print-fallback { display: block; width: 170px; height: 260px; margin: 0 auto; object-fit: contain; transform: rotate(90deg); transform-origin: center center; }
    .kaporta-print-col h3 { margin: 0 0 4px; font-size: 13px; }
    .kaporta-print-list { margin: 0; padding-left: 18px; }
    .kaporta-print-list li { font-size: 12px; line-height: 1.3; margin-bottom: 2px; }
    .kaporta-print-empty { font-size: 12px; color: #666; }
    .print-page-break { page-break-before: always; break-before: page; margin: 16px 0 0; }
    .history-page { margin-top: 8px; page-break-before: avoid; break-before: avoid-page; page-break-inside: avoid; break-inside: avoid; }
    .history-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; align-items: start; }
    .history-print-card { border: 1px solid #ddd; border-radius: 8px; padding: 8px; break-inside: auto; page-break-inside: auto; }
    .history-print-card h2 { margin: 0 0 5px; font-size: 14px; page-break-after: avoid; break-after: avoid-page; }
    .history-print-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
    .history-print-item { border-top: 1px solid #eee; padding-top: 4px; }
    .history-print-item:first-child { border-top: none; padding-top: 0; }
    .history-print-date { font-size: 11px; color: #666; font-weight: 600; margin-bottom: 1px; }
    .history-print-text { font-size: 12px; line-height: 1.25; }
    .history-print-extra { font-size: 11px; color: #444; margin-top: 1px; line-height: 1.2; }
    .history-print-empty { font-size: 12px; color: #666; }
    @media (max-width: 760px) { .history-grid { grid-template-columns: 1fr; } .kaporta-print-row { flex-wrap: wrap; } .kaporta-print-state-grid { grid-template-columns: 1fr; } }
    @media print { body { margin: 8mm; } .kaporta-print-section { page-break-inside: avoid; break-inside: avoid; } .history-page h1, .history-page .subtitle { page-break-after: avoid; break-after: avoid-page; } .history-page { page-break-before: avoid; break-before: avoid-page; page-break-inside: avoid; break-inside: avoid; } .history-grid { gap: 8px; } }
  </style>
</head>
<body>
  <section class="summary-page">
    <h1>Taşıt Kartı</h1>
    <p class="subtitle">Plaka: ${escapeHtml(vehicle.plate || '-')} • Oluşturma: ${printedAt}</p>
    ${rows}
    ${kaportaPrintSectionHtml}
  </section>

  <section class="history-page">
    <h1>Taşıt Tarihçesi</h1>
    <p class="subtitle">Plaka: ${escapeHtml(vehicle.plate || '-')} • Oluşturma: ${printedAt}</p>
    <div class="history-grid">${historySectionsHtml}</div>
  </section>
</body>
</html>`;

    function printWithIframeFallback(sourceError) {
      var iframe = document.createElement('iframe');
      iframe.setAttribute('aria-hidden', 'true');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.style.opacity = '0';
      iframe.style.pointerEvents = 'none';

      var done = false;
      function cleanup() {
        try { iframe.onload = null; } catch (e) {}
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      }
      function fail(err) {
        if (done) return;
        done = true;
        cleanup();
        alert('Yazdırma başlatılamadı. Lütfen tekrar deneyin.');
      }

      try {
        document.body.appendChild(iframe);
        var frameWindow = iframe.contentWindow;
        var frameDoc = frameWindow ? frameWindow.document : iframe.contentDocument;
        if (!frameWindow || !frameDoc) {
          throw new Error('iframe_unavailable');
        }

        frameDoc.open();
        frameDoc.write(printHtml);
        frameDoc.close();

        setTimeout(function() {
          if (done) return;
          try {
            var cleanupTimer = setTimeout(function() {
              if (done) return;
              done = true;
              cleanup();
            }, 2000);
            var onAfterPrint = function() {
              clearTimeout(cleanupTimer);
              if (done) return;
              done = true;
              cleanup();
              frameWindow.removeEventListener('afterprint', onAfterPrint);
            };
            frameWindow.addEventListener('afterprint', onAfterPrint);
            frameWindow.focus();
            frameWindow.print();
          } catch (printErr) {
            fail(printErr);
          }
        }, 60);
      } catch (iframeErr) {
        fail(iframeErr);
      }
    }

    function tryPopupPrint(printWindow) {
      return new Promise(function(resolve, reject) {
        var settled = false;
        var printTriggered = false;

        function finalizeSuccess() {
          if (settled) return;
          settled = true;
          resolve(true);
        }
        function finalizeFail(err) {
          if (settled) return;
          settled = true;
          reject(err);
        }
        function triggerPrint() {
          if (settled || printTriggered) return;
          printTriggered = true;
          try {
            printWindow.focus();
            printWindow.print();
            finalizeSuccess();
          } catch (printErr) {
            finalizeFail(printErr);
          }
        }

        try {
          printWindow.document.open();
          printWindow.document.write(printHtml);
          printWindow.document.close();
        } catch (writeErr) {
          finalizeFail(writeErr);
          return;
        }

        try {
          printWindow.onload = triggerPrint;
        } catch (e) {}

        setTimeout(triggerPrint, 180);
      });
    }

    let printWindow = null;
    try {
      printWindow = window.open('', '_blank', 'width=900,height=700');
    } catch (popupOpenErr) {}

    if (!printWindow) {
      printWithIframeFallback('popup_blocked_or_null');
      return;
    }

    tryPopupPrint(printWindow).catch(function(popupErr) {
      printWithIframeFallback((popupErr && popupErr.message) ? popupErr.message : 'popup_print_failed');
    });
  }
  /**
   * /**
 * Sol kolon render (Taşıt özellikleri + Kaporta Şeması)
 */
function renderVehicleDetailLeft(vehicle) {
  const leftEl = DOM.vehicleDetailLeft;
  if (!leftEl) return;

  let html = '';

  // Kullanıcı
  const users = readUsers();
  const assignedUserId = vehicle.assignedUserId || '';
  const assignedUser = assignedUserId ? users.find(u => u.id === assignedUserId) : null;
  const assignedUserName = (assignedUser && assignedUser.name) ? assignedUser.name : (vehicle.tahsisKisi || '');

  if (assignedUserId || (assignedUserName && assignedUserName.trim())) {
      const displayName = escapeHtml(assignedUserName).replace(/ /g, '&nbsp;');
      html += `<div class="detail-row detail-row-inline"><div class="detail-row-header"><span class="detail-row-label">Kullanıcı</span><span class="detail-row-colon">:</span></div><span class="detail-row-value detail-user-value"> ${displayName}</span></div>`;
  } else {
      html += `<div class="detail-row detail-row-inline"><div class="detail-row-header"><span class="detail-row-label">Kullanıcı</span><span class="detail-row-colon">:</span></div><span class="detail-row-value detail-user-empty" onclick="event.stopPropagation(); if (window.currentDetailVehicleId) openEventModal('kullanici', window.currentDetailVehicleId);"> Kullanıcı Eklemek İçin +</span></div>`;
  }

  // Şube
  const branches = readBranches();
  const branchId = vehicle.branchId || '';
  const branchName = branchId ?
      (branches.find(b => String(b.id) === String(branchId))?.name || '') :
      'Tahsis Edilmemiş';
  html += `<div class="detail-row detail-row-inline"><div class="detail-row-header"><span class="detail-row-label">Şube</span><span class="detail-row-colon">:</span></div><span class="detail-row-value detail-row-value-sube"> ${escapeHtml(branchName)}</span></div>`;

  // Taşıt Tipi
  const vehicleType = vehicle.vehicleType || '';
  html += `<div class="detail-row detail-row-inline"><div class="detail-row-header"><span class="detail-row-label">Taşıt Tipi</span><span class="detail-row-colon">:</span></div><span class="detail-row-value"> ${escapeHtml(getVehicleTypeLabel(vehicleType))}</span></div>`;

  // Üretim Yılı
  const year = vehicle.year || '';
  html += `<div class="detail-row detail-row-inline"><div class="detail-row-header"><span class="detail-row-label">Üretim Yılı</span><span class="detail-row-colon">:</span></div><span class="detail-row-value"> ${escapeHtml(year)}</span></div>`;

  // Tescil Tarihi
  const tescilTarihi = vehicle.tescilTarihi || '';
  html += `<div class="detail-row detail-row-inline"><div class="detail-row-header"><span class="detail-row-label">Tescil Tarihi</span><span class="detail-row-colon">:</span></div><span class="detail-row-value"> ${escapeHtml(tescilTarihi || '-')}</span></div>`;

  // Km
  if (vehicle.guncelKm) {
      const formattedKm = formatNumber(vehicle.guncelKm);
      html += `<div class="detail-row detail-row-inline"><div class="detail-row-header"><span class="detail-row-label">Km</span><span class="detail-row-colon">:</span></div><span class="detail-row-value"> ${escapeHtml(formattedKm)}</span></div>`;
  } else {
      const km = vehicle.km || '';
      const formattedKm = km ? formatNumber(km) : '';
      html += `<div class="detail-row detail-row-inline"><div class="detail-row-header"><span class="detail-row-label">Km (Alındığı Tarih)</span><span class="detail-row-colon">:</span></div><span class="detail-row-value"> ${escapeHtml(formattedKm || '-')}</span></div>`;
  }

  // Şanzıman
  const transmission = vehicle.transmission || '';
  const transmissionLabel = transmission === 'otomatik' ? 'Otomatik' : transmission === 'manuel' ? 'Manuel' : '';
  html += `<div class="detail-row detail-row-inline"><div class="detail-row-header"><span class="detail-row-label">Şanzıman</span><span class="detail-row-colon">:</span></div><span class="detail-row-value"> ${escapeHtml(transmissionLabel)}</span></div>`;

  // Alım Bedeli
  const price = vehicle.price || '';
  html += `<div class="detail-row detail-row-inline"><div class="detail-row-header"><span class="detail-row-label">Alım Bedeli</span><span class="detail-row-colon">:</span></div><span class="detail-row-value"> ${escapeHtml(price || '-')}</span></div>`;

  // Tramer Kaydı
  if (vehicle.tramer === 'var' && vehicle.tramerRecords && vehicle.tramerRecords.length > 0) {
      html += `<div class="detail-row detail-row-block"><div class="detail-row-header"><span class="detail-row-label">Tramer Kaydı</span><span class="detail-row-colon">:</span></div><span class="detail-row-value"> `;
      vehicle.tramerRecords.forEach((record, index) => {
          if (index > 0) html += '<br>';
          html += `${escapeHtml(formatDateForDisplay(record.date) || '-')} - ${escapeHtml(record.amount)}`;
      });

      let total = 0;
      vehicle.tramerRecords.forEach(record => {
          const amountStr = record.amount.replace(/\./g, '').replace(',', '.').replace('TL', '').trim();
          const amount = parseFloat(amountStr) || 0;
          total += amount;
      });

      if (vehicle.tramerRecords.length > 1) {
          const totalFixed = total.toFixed(2);
          const totalParts = totalFixed.split('.');
          const totalInteger = totalParts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
          const totalFormatted = `${totalInteger},${totalParts[1]}TL`;
          html += `<br><strong>Olmak Üzere Toplam ${totalFormatted}</strong>`;
      }
      html += `</span></div>`;
  } else {
      html += `<div class="detail-row detail-row-inline"><div class="detail-row-header"><span class="detail-row-label">Tramer Kaydı</span><span class="detail-row-colon">:</span></div><span class="detail-row-value"> Yoktur.</span></div>`;
  }

  // Kaporta Durumu (Legend eklendi)
  html += `<div class="detail-row detail-row-inline"><div class="detail-row-header"><span class="detail-row-label">Kaporta Durumu</span><span class="detail-row-colon">:</span></div><span class="detail-row-value"> `;
  if (vehicle.boya === 'var' && vehicle.boyaliParcalar) {
      html += 'Aşağıdaki şemada belirtilmiştir.';
  } else {
      html += 'Yoktur.';
  }
  html += `</span></div>`;

  // HTML'i sol kolona bas
  leftEl.innerHTML = html;

  // --- ŞEMA EKLEME: Sol grid (sol kolon) içinde; büyüklük sol kolona göre uyarlanır ---
  const existingBoyaContainer = document.getElementById('detail-boya-container');
  if (existingBoyaContainer) existingBoyaContainer.remove();

  const boyaContainer = document.createElement('div');
  boyaContainer.id = 'detail-boya-container';
  leftEl.appendChild(boyaContainer);

  // Boya şemasını render et (içinde SVG + tam açıklama Orijinal/Boyalı/Değişen; O/B/D kısaltması yok)
  renderBoyaSchemaDetail(vehicle);
}

  /**
   * Sağ kolon render (Tarihler, Anahtar, Kredi, UTTS, Takip Cihazı)
   */
  function renderVehicleDetailRight(vehicle) {
    const rightEl = DOM.vehicleDetailRight;
    if (!rightEl) return;
    
    let html = '';
    
    // Sigorta bitiş tarihi
    const sigortaDate = vehicle.sigortaDate || '';
    const sigortaWarning = checkDateWarnings(sigortaDate);
    const sigortaDisplay = formatDateForDisplay(sigortaDate);
    html += `<div class="detail-row detail-row-inline"><div class="detail-row-header"><span class="detail-row-label">Sigorta Bitiş Tarihi</span><span class="detail-row-colon">:</span></div><span class="detail-row-value ${sigortaWarning.class}"> ${escapeHtml(sigortaDisplay || '-')}</span></div>`;
    
    // Kasko bitiş tarihi
    const kaskoDate = vehicle.kaskoDate || '';
    const kaskoWarning = checkDateWarnings(kaskoDate);
    const kaskoDisplay = formatDateForDisplay(kaskoDate);
    html += `<div class="detail-row detail-row-inline"><div class="detail-row-header"><span class="detail-row-label">Kasko Bitiş Tarihi</span><span class="detail-row-colon">:</span></div><span class="detail-row-value ${kaskoWarning.class}"> ${escapeHtml(kaskoDisplay || '-')}</span></div>`;
    
    // Muayene bitiş tarihi (taşıt tipi yoksa uyarı + tooltip + Tıklayınız)
    const muayeneDate = vehicle.muayeneDate || '';
    const muayeneWarning = checkDateWarnings(muayeneDate);
    const muayeneDisplay = formatDateForDisplay(muayeneDate);
    const vt = vehicle.vehicleType ?? vehicle.tip ?? '';
    const noVehicleType = vt == null || (typeof vt === 'string' && !String(vt).trim());
    if (noVehicleType) {
      html += `<div class="detail-row detail-row-inline detail-row-muayene-no-type"><div class="detail-row-header"><span class="detail-row-label">Muayene Bitiş Tarihi</span><span class="detail-row-colon">:</span></div><span class="detail-row-value detail-muayene-value-wrap ${muayeneWarning.class}"> ${escapeHtml(muayeneDisplay || '-')} <span class="muayene-detail-exclamation" aria-hidden="true" title="Taşıt tipi seçilmedi">!</span><span class="muayene-detail-tooltip-wrap"><span class="muayene-detail-tooltip" role="tooltip" hidden>Taşıt Tipi Seçilmediğinden, Muayene Bitiş Tarihi Hatalı Gözükebilir. Seçim Yapmak İçin <button type="button" class="muayene-detail-tooltip-link">Tıklayınız</button>.</span></span></span></div>`;
    } else {
      html += `<div class="detail-row detail-row-inline"><div class="detail-row-header"><span class="detail-row-label">Muayene Bitiş Tarihi</span><span class="detail-row-colon">:</span></div><span class="detail-row-value ${muayeneWarning.class}"> ${escapeHtml(muayeneDisplay || '-')}</span></div>`;
    }
    
    // Yedek Anahtar
    const anahtar = vehicle.anahtar || '';
    const anahtarLabel = anahtar === 'var' ? (vehicle.anahtarNerede || 'Var') : 'Yoktur.';
    html += `<div class="detail-row detail-row-inline"><div class="detail-row-header"><span class="detail-row-label">Yedek Anahtar</span><span class="detail-row-colon">:</span></div><span class="detail-row-value"> ${escapeHtml(anahtarLabel)}</span></div>`;
    
    // Kredi/Rehin
    const kredi = vehicle.kredi || '';
    const krediLabel = kredi === 'var' ? (vehicle.krediDetay || 'Var') : 'Yoktur.';
    html += `<div class="detail-row detail-row-inline"><div class="detail-row-header"><span class="detail-row-label">Kredi/Rehin</span><span class="detail-row-colon">:</span></div><span class="detail-row-value"> ${escapeHtml(krediLabel)}</span></div>`;
    
    // Yazlık/ Kışlık Lastik (Yoktur "r" hizası için referans)
    const lastikDurumu = vehicle.lastikDurumu || '';
    const lastikLabel = lastikDurumu === 'var' ? (vehicle.lastikAdres || 'Var') : 'Yoktur.';
    html += `<div class="detail-row detail-row-inline"><div class="detail-row-header"><span class="detail-row-label">Yazlık/ Kışlık Lastik</span><span class="detail-row-colon">:</span></div><span class="detail-row-value detail-yoktur-r-ref"> ${escapeHtml(lastikLabel)}</span></div>`;
    
    // UTTS
    const utts = vehicle.uttsTanimlandi ? 'Evet' : 'Hayır';
    html += `<div class="detail-row detail-row-inline"><div class="detail-row-header"><span class="detail-row-label">UTTS</span><span class="detail-row-colon">:</span></div><span class="detail-row-value"> ${escapeHtml(utts)}</span></div>`;
    
    // Taşıt Takip
    const takipCihazi = vehicle.takipCihaziMontaj ? 'Evet' : 'Hayır';
    html += `<div class="detail-row detail-row-inline"><div class="detail-row-header"><span class="detail-row-label">Taşıt Takip</span><span class="detail-row-colon">:</span></div><span class="detail-row-value"> ${escapeHtml(takipCihazi)}</span></div>`;

    // Kasko Kodu (sadece taşıt detayda bilgi olarak)
    const kaskoKodu = vehicle.kaskoKodu || '';
    html += `<div class="detail-row detail-row-inline"><div class="detail-row-header"><span class="detail-row-label">Kasko Kodu</span><span class="detail-row-colon">:</span></div><span class="detail-row-value"> ${escapeHtml(kaskoKodu || '-')}</span></div>`;

    // Kasko Değeri (önce kayıtlı değer, yoksa Excel'den hesapla)
    let kaskoDegeri = vehicle.kaskoDegeri;
    if (kaskoDegeri == null || kaskoDegeri === '') {
      const yearForKasko = vehicle.year || vehicle.modelYili || '';
      kaskoDegeri = getKaskoDegeri(vehicle.kaskoKodu, yearForKasko);
    }
    if (kaskoDegeri == null || String(kaskoDegeri).trim() === '') {
      kaskoDegeri = '-';
    }
    if (kaskoDegeri === '-' && (!vehicle.kaskoKodu || String(vehicle.kaskoKodu).trim() === '')) {
      kaskoDegeri = 'Kasko kodu girilmedi';
    } else if (kaskoDegeri === '-' && !localStorage.getItem('medisa_kasko_liste')) {
      kaskoDegeri = 'Excel yüklenmedi';
    }
    let isKaskoOutdated = true;
    const kaskoTarihKaynak = vehicle.kaskoDegeriYuklemeTarihi || localStorage.getItem('medisa_kasko_liste_date');
    if (kaskoTarihKaynak) {
      const uploadDate = new Date(kaskoTarihKaynak);
      const now = new Date();
      if (uploadDate.getMonth() === now.getMonth() && uploadDate.getFullYear() === now.getFullYear()) {
        isKaskoOutdated = false;
      }
    }
    const isPlaceholderMsg = (kaskoDegeri === 'Kasko kodu girilmedi' || kaskoDegeri === 'Excel yüklenmedi');
    const kaskoDegeriStyle = isKaskoOutdated && !isPlaceholderMsg ? 'color: var(--red) !important;' : '';
    const kaskoDegeriExtra = (isKaskoOutdated && !isPlaceholderMsg) ? ' <span style="font-size: 0.8em; opacity: 0.8;">(Güncel Değil)</span>' : '';
    const kaskoDegeriDisplay = String(kaskoDegeri).trim() || '-';
    html += `<div class="detail-row detail-row-inline"><div class="detail-row-header"><span class="detail-row-label">Kasko Değeri</span><span class="detail-row-colon">:</span></div><span class="detail-row-value kasko-degeri-text" style="${kaskoDegeriStyle}"> ${escapeHtml(kaskoDegeriDisplay)}${kaskoDegeriExtra}</span></div>`;

    // Notlar (kayıt formundan) + Kullanıcı Notu (varsa, kullanıcı panelinden)
    const notes = vehicle.notes || '';
    const sonNot = vehicle.sonEkstraNot || '';
    const sonNotDonem = vehicle.sonEkstraNotDonem || '';
    let notesValue = notes ? escapeHtml(notes) : '';
    if (sonNot) {
      const kullaniciNotu = 'Kullanıcı Notu: ' + escapeHtml(sonNot) + (sonNotDonem ? ' (' + escapeHtml(sonNotDonem) + ')' : '');
      notesValue = notesValue ? notesValue + '<br><br>' + kullaniciNotu : kullaniciNotu;
    }
    notesValue = notesValue || '-';
    html += `<div class="detail-row detail-row-block"><div class="detail-row-header"><span class="detail-row-label">Notlar</span><span class="detail-row-colon">:</span></div><span class="detail-row-value">${notesValue}</span></div>`;
    
    rightEl.innerHTML = html;
  }

  /**
   * Kaporta SVG parça ID'lerine göre okunabilir isim döndürür (kaporta.svg ile uyumlu)
   */
  function getKaportaPartNames() {
    return {
      'on-tampon': 'Ön Tampon',
      'arka-tampon': 'Arka Tampon',
      'kaput': 'Kaput',
      'bagaj': 'Bagaj Kapağı',
      'sag-on-kapi': 'Sağ Ön Kapı',
      'sol-on-kapi': 'Sol Ön Kapı',
      'sag-arka-kapi': 'Sağ Arka Kapı',
      'sol-arka-kapi': 'Sol Arka Kapı',
      'sag-on-camurluk': 'Sağ Ön Çamurluk',
      'sol-on-camurluk': 'Sol Ön Çamurluk',
      'sag-arka-camurluk': 'Sağ Arka Çamurluk',
      'sol-arka-camurluk': 'Sol Arka Çamurluk',
      'tavan': 'Tavan'
    };
  }

  /**
   * Boya şemasını detay ekranında render et (readonly)
   */
  function renderBoyaSchemaDetail(vehicle) {
    const container = document.getElementById('detail-boya-container');
    if (!container) return;

    getParsedKaportaSvg().then(function(svgClone) {
        if (!svgClone) return;

        container.innerHTML = '';

        // Şema genişliği: sol grid içinde, sol kolon genişliğine göre requestAnimationFrame ile uyarlanır (yatay -4px, dikey -8px küçültme; %20 küçültme)
        const schemaScale = 0.8; /* %20 küçültme */
        const svgOrgWidth = 148;
        const svgOrgHeight = 220;
        const shrinkX = 4;
        const shrinkY = 8;
        const defaultTargetWidth = Math.round((220 - shrinkX) * schemaScale);
        const targetHeight = Math.round(defaultTargetWidth * (148 / 220)) - shrinkY;

        // Wrapper oluştur (Şemayı tutacak kutu); başlangıç değeri, ölçüm sonrası güncellenir
        const svgWrapper = document.createElement('div');
        svgWrapper.className = 'kaporta-schema-wrapper';
        svgWrapper.style.cssText = `
            width: ${defaultTargetWidth}px;
            height: ${targetHeight}px;
            position: relative;
            overflow: visible;
            flex-shrink: 0;
            margin: 0;
            margin-right: auto;
        `;

        // SVG'yi hazırla (zaten clone geldi)
        svgClone.setAttribute('width', String(svgOrgWidth));
        svgClone.setAttribute('height', String(svgOrgHeight));

        // SVG'yi döndür ve wrapper'ın tam ortasına oturt
        const targetWidth = defaultTargetWidth;
        const topOff = (targetHeight - svgOrgHeight) / 2;
        const leftOff = (targetWidth - svgOrgWidth) / 2;

        svgClone.style.cssText = `
            display: block;
            position: absolute;
            top: ${topOff}px;
            left: ${leftOff}px;
            transform-origin: center center;
            transform: rotate(90deg) scale(${targetWidth / svgOrgHeight});
        `;

        svgWrapper.appendChild(svgClone);
        container.appendChild(svgWrapper);

        // --- RENKLENDİRME ---
        const partNames = getKaportaPartNames();
        const defaultGray = '#757575';

        const allParts = svgClone.querySelectorAll('path[id]');
        allParts.forEach(part => {
          part.setAttribute('fill', defaultGray);
          part.style.fill = defaultGray;
        });

        const boyaliParcalar = vehicle.boyaliParcalar || {};
        Object.keys(boyaliParcalar).forEach(partId => {
          const state = boyaliParcalar[partId];
          const part = svgClone.querySelector(`#${partId}`);
          if (part) {
            if (state === 'boyali') {
              part.setAttribute('fill', '#5cb85c');
              part.style.fill = '#5cb85c';
            } else if (state === 'degisen') {
              part.setAttribute('fill', '#d40000');
              part.style.fill = '#d40000';
            }
            const partName = partNames[partId] || partId;
            const stateLabel = state === 'boyali' ? 'Boyalı' : state === 'degisen' ? 'Değişen' : 'Orijinal';
            part.setAttribute('title', `${partName} - ${stateLabel}`);
            part.style.cursor = 'help';
          }
        });

        allParts.forEach(part => {
          const partId = part.getAttribute('id');
          if (!boyaliParcalar[partId]) {
            const partName = partNames[partId] || partId;
            part.setAttribute('title', `${partName} - Orijinal`);
            part.style.cursor = 'help';
          }
        });

        // --- LEGEND ---
        const legend = document.createElement('div');
        legend.className = 'boya-legend';
        legend.innerHTML = `
          <div class="boya-legend-item"><span class="boya-legend-dot" style="background:#757575;"></span> Orijinal</div>
          <div class="boya-legend-item"><span class="boya-legend-dot" style="background:#28a745;"></span> Boyalı</div>
          <div class="boya-legend-item"><span class="boya-legend-dot" style="background:#d40000;"></span> Değişen</div>
        `;
        container.appendChild(legend);

        // Sol kolon genişliğine göre şema büyüklüğünü uyarla (sol grid içinde; yatay -4px, dikey -8px)
        requestAnimationFrame(function alignSchemaToLeftColumn() {
          const leftCol = DOM.vehicleDetailLeft;
          if (leftCol && container.isConnected) {
            const leftRect = leftCol.getBoundingClientRect();
            const padding = 16;
            const availableWidth = Math.max(0, leftRect.width - padding);
            const minW = 128;   /* 160 * 0.8 */
            const maxW = 304;   /* 380 * 0.8 */
            const clamped = Math.max(minW, Math.min(maxW, Math.round(availableWidth * 0.8)));
            const w = clamped - shrinkX;
            const h = Math.round(clamped * (148 / 220)) - shrinkY;
            svgWrapper.style.width = w + 'px';
            svgWrapper.style.height = h + 'px';
            const topOff2 = (h - svgOrgHeight) / 2;
            const leftOff2 = (w - svgOrgWidth) / 2;
            svgClone.style.top = topOff2 + 'px';
            svgClone.style.left = leftOff2 + 'px';
            svgClone.style.transform = 'rotate(90deg) scale(' + (w / svgOrgHeight) + ')';
          }
        });
      })
      .catch(err => {
        console.error('SVG yükleme hatası:', err);
      });
  }

  // --- OLAY MODAL FONKSİYONLARI ---
  
  /**
   * Olay modal menüsünü açar
   */
  window.openEventModal = function(type, vehicleId) {
    if (type === 'menu') {
      // Önce tüm açık alt modalları kapat
      const allEventModals = [
        'bakim-ekle-modal', 'kaza-ekle-modal', 'sigorta-guncelle-modal',
        'kasko-guncelle-modal', 'muayene-guncelle-modal', 'anahtar-guncelle-modal',
        'kredi-guncelle-modal', 'km-guncelle-modal', 'lastik-guncelle-modal',
        'utts-guncelle-modal', 'takip-cihaz-guncelle-modal', 'kasko-kodu-guncelle-modal', 'ruhsat-yukleme-modal', 'sube-degisiklik-modal',
        'kullanici-atama-modal', 'satis-pert-modal'
      ];
      allEventModals.forEach(modalId => {
        const modal = document.getElementById(modalId);
        if (modal && modal.classList.contains('active')) {
          modal.classList.remove('active');
          modal.style.display = 'none';
        }
      });
      
      const modal = DOM.eventMenuModal;
      if (!modal) return;
      
      const menuList = DOM.eventMenuList;
      if (!menuList) return;
      
      // Menü listesini oluştur
      const isMobile = window.innerWidth <= 640;
      const takipLabel = isMobile ? 'Taşıt Takip Cih.Bilg. Günc.' : 'Taşıt Takip Cihaz Bilgisi Güncelle';
      const events = [
        { id: 'km', label: 'Km Güncelle' },
        { id: 'bakim', label: 'Bakım Bilgisi Ekle' },
        { id: 'kaza', label: 'Kaza Bilgisi Ekle' },
        { id: 'sigorta', label: 'Sigorta Bilgisi Güncelle' },
        { id: 'kasko', label: 'Kasko Bilgisi Güncelle' },
        { id: 'muayene', label: 'Muayene Bilgisi Güncelle' },
        { id: 'anahtar', label: 'Yedek Anahtar Bilgisi Güncelle' },
        { id: 'kredi', label: 'Kredi/Rehin Bilgisi Güncelle' },
        { id: 'lastik', label: 'Yazlık/Kışlık Lastik Durumu Güncelle' },
        { id: 'utts', label: 'UTTS Bilgisi Güncelle' },
        { id: 'takip', label: takipLabel },
        { id: 'kaskokodu', label: 'Kasko Kodu Güncelleme' },
        { id: 'sube', label: 'Şube Değişikliği Bilgisi Güncelle' },
        { id: 'kullanici', label: 'Kullanıcı Atama/Değişikliği Bilgisi Güncelle' },
        { id: 'satis', label: 'Satış/Pert Bildirimi Yap' }
      ];
      
      const vid = (window.currentDetailVehicleId || vehicleId || '').toString().replace(/"/g, '&quot;');
      menuList.innerHTML = events.map(event => {
        const isKaza = event.id === 'kaza';
        const isSatis = event.id === 'satis';
        const borderColor = (isKaza || isSatis) ? '#d40000' : 'rgba(255, 255, 255, 0.3)';
        const textColor = (isKaza || isSatis) ? '#d40000' : '#ccc';
        const borderWidth = (isKaza || isSatis) ? '0.3px' : '1px';
        return `<button type="button" data-event-id="${event.id}" data-vehicle-id="${vid}" style="width: 100%; padding: 12px; background: transparent; border: ${borderWidth} solid ${borderColor}; color: ${textColor}; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 14px; text-align: left;">${event.label}</button>`;
      }).join('');
      
      modal.style.display = 'flex';
      requestAnimationFrame(() => {
        modal.classList.add('active');
      });
    } else {
      // Belirli bir olay modal'ını aç
      const modalId = type === 'km' ? 'km-guncelle-modal' :
                      type === 'bakim' ? 'bakim-ekle-modal' :
                      type === 'kaza' ? 'kaza-ekle-modal' :
                      type === 'sigorta' ? 'sigorta-guncelle-modal' :
                      type === 'kasko' ? 'kasko-guncelle-modal' :
                      type === 'muayene' ? 'muayene-guncelle-modal' :
                      type === 'anahtar' ? 'anahtar-guncelle-modal' :
                      type === 'kredi' ? 'kredi-guncelle-modal' :
                      type === 'lastik' ? 'lastik-guncelle-modal' :
                      type === 'utts' ? 'utts-guncelle-modal' :
                      type === 'takip' ? 'takip-cihaz-guncelle-modal' :
                      type === 'kaskokodu' ? 'kasko-kodu-guncelle-modal' :
                      type === 'sube' ? 'sube-degisiklik-modal' :
                      type === 'kullanici' ? 'kullanici-atama-modal' :
                      type === 'satis' ? 'satis-pert-modal' : null;
      
      if (!modalId) return;
      
      const modal = document.getElementById(modalId);
      if (!modal) return;
      
      // Modal'a göre özel işlemler
      if (type === 'kaza') {
        // Kaza modal'ında mevcut boya şemasını göster (readonly) ve varsayılan kullanıcı
        const vehicle = readVehicles().find(v => String(v.id) === String(vehicleId || window.currentDetailVehicleId));
        if (vehicle) {
          const container = document.getElementById('kaza-kaporta-container');
          if (container) {
            // Mevcut şemayı readonly göster
            renderBoyaSchemaKaza(vehicle, container);
          }
          // Varsayılan kullanıcı
          const kazaSurucuInput = document.getElementById('kaza-surucu');
          if (kazaSurucuInput && vehicle.tahsisKisi) {
            kazaSurucuInput.value = vehicle.tahsisKisi;
          }
          // Hasar tutarı input'una format event'i ekle
          const kazaTutarInput = document.getElementById('kaza-tutar');
          if (kazaTutarInput) {
            kazaTutarInput.addEventListener('blur', function() {
              const value = this.value.replace(/[^\d]/g, ''); // Sadece rakamlar
              if (value) {
                this.value = formatNumber(value);
              }
            });
          }
        }
      } else if (type === 'muayene') {
        // Muayene modal'ında varsayılan bugünün tarihi
        const muayeneTarihInput = document.getElementById('muayene-tarih');
        if (muayeneTarihInput) {
          const today = new Date().toISOString().split('T')[0];
          muayeneTarihInput.value = today;
        }
      } else if (type === 'kaskokodu') {
        const vehicle = readVehicles().find(v => String(v.id) === String(vehicleId || window.currentDetailVehicleId));
        const input = document.getElementById('kasko-kodu-guncelle-input');
        if (input && vehicle) {
          input.value = vehicle.kaskoKodu || '';
        }
      } else if (type === 'sube') {
        // Şube değişikliği modal'ında şubeleri doldur
        const selectEl = document.getElementById('sube-select');
        if (selectEl) {
          selectEl.innerHTML = '<option value="">Şube Seçiniz</option>';
          const branches = readBranches();
          branches.forEach(b => {
            const opt = document.createElement('option');
            opt.value = b.id;
            opt.textContent = b.name;
            selectEl.appendChild(opt);
          });
        }
      } else if (type === 'kullanici') {
        // Kullanıcı atama modal'ında kullanıcıları doldur; Henüz Tanımlanmadı + en alta "+ Yeni Kullanıcı Ekle"
        const selectEl = document.getElementById('kullanici-select');
        if (selectEl) {
          selectEl.innerHTML = '<option value="">Kullanıcı Seçiniz</option>';
          const noneOpt = document.createElement('option');
          noneOpt.value = '__none__';
          noneOpt.textContent = 'Henüz Tanımlanmadı';
          selectEl.appendChild(noneOpt);
          const users = readUsers();
          users.forEach(u => {
            const opt = document.createElement('option');
            opt.value = u.id;
            opt.textContent = u.name || u.isim || '-';
            selectEl.appendChild(opt);
          });
          const addOpt = document.createElement('option');
          addOpt.value = '__add_user__';
          addOpt.textContent = '+ Yeni Kullanıcı Ekle';
          selectEl.appendChild(addOpt);
          const vehicle = readVehicles().find(v => String(v.id) === String(vehicleId || window.currentDetailVehicleId));
          if (vehicle?.assignedUserId) {
            selectEl.value = vehicle.assignedUserId;
          } else {
            selectEl.value = '__none__';
          }
          if (!selectEl.dataset.kullaniciAddHandler) {
            selectEl.dataset.kullaniciAddHandler = '1';
            selectEl.addEventListener('change', function() {
              if (selectEl.value === '__add_user__') {
                selectEl.value = '';
                const currentVehicleId = vehicleId || window.currentDetailVehicleId;
                closeEventModal('kullanici');
                setTimeout(function() {
                  if (typeof window.openUserFormModal === 'function') {
                    window.openUserFormModal();
                  }
                }, 350);
                const onUserSaved = function(ev) {
                  const newId = ev.detail && ev.detail.id;
                  window.removeEventListener('userSaved', onUserSaved);
                  if (!newId || !selectEl.parentNode) return;
                  const users = readUsers();
                  selectEl.innerHTML = '<option value="">Kullanıcı Seçiniz</option>';
                  const noneOpt2 = document.createElement('option');
                  noneOpt2.value = '__none__';
                  noneOpt2.textContent = 'Henüz Tanımlanmadı';
                  selectEl.appendChild(noneOpt2);
                  users.forEach(u => {
                    const opt = document.createElement('option');
                    opt.value = u.id;
                    opt.textContent = u.name || u.isim || '-';
                    selectEl.appendChild(opt);
                  });
                  const addOpt2 = document.createElement('option');
                  addOpt2.value = '__add_user__';
                  addOpt2.textContent = '+ Yeni Kullanıcı Ekle';
                  selectEl.appendChild(addOpt2);
                  selectEl.value = newId;
                  if (currentVehicleId) {
                    openEventModal('kullanici', currentVehicleId);
                  }
                };
                window.addEventListener('userSaved', onUserSaved);
              }
            });
          }
        }
      } else if (type === 'anahtar') {
        // Anahtar modal'ında radio button handler'larını ekle
        const radioBtns = refreshModalRadioButtons(modal);
        const detayWrapper = document.getElementById('anahtar-detay-wrapper');
        const detayInput = document.getElementById('anahtar-detay-event');
        radioBtns.forEach(b => b.classList.remove('active', 'green'));
        if (detayWrapper) detayWrapper.style.display = 'none';
        if (detayInput) detayInput.value = '';
        radioBtns.forEach(btn => {
          btn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            radioBtns.forEach(b => { b.classList.remove('active', 'green'); });
            this.classList.add('active');
            if (this.dataset.value === 'var') this.classList.add('green');
            
            if (this.dataset.value === 'var') {
              if (detayWrapper) detayWrapper.style.display = 'block';
              if (detayInput) setTimeout(() => detayInput.focus(), 100);
            } else {
              if (detayWrapper) detayWrapper.style.display = 'none';
              if (detayInput) detayInput.value = '';
            }
          });
        });
      } else if (type === 'kredi') {
        // Kredi modal'ında radio button handler'larını ekle
        const radioBtns = refreshModalRadioButtons(modal);
        const detayWrapper = document.getElementById('kredi-detay-wrapper-event');
        const detayInput = document.getElementById('kredi-detay-event');
        radioBtns.forEach(b => b.classList.remove('active', 'green'));
        if (detayWrapper) detayWrapper.style.display = 'none';
        if (detayInput) detayInput.value = '';
        radioBtns.forEach(btn => {
          btn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            radioBtns.forEach(b => { b.classList.remove('active', 'green'); });
            this.classList.add('active');
            if (this.dataset.value === 'var') this.classList.add('green');
            
            if (this.dataset.value === 'var') {
              if (detayWrapper) detayWrapper.style.display = 'block';
              if (detayInput) setTimeout(() => detayInput.focus(), 100);
            } else {
              if (detayWrapper) detayWrapper.style.display = 'none';
              if (detayInput) detayInput.value = '';
            }
          });
        });
      } else if (type === 'lastik') {
        // Lastik modal'ında radio button handler'larını ekle
        const radioBtns = refreshModalRadioButtons(modal);
        const adresWrapper = document.getElementById('lastik-adres-wrapper-event');
        const adresInput = document.getElementById('lastik-adres-event');
        
        radioBtns.forEach(b => b.classList.remove('active', 'green'));
        if (adresWrapper) adresWrapper.style.display = 'none';
        if (adresInput) adresInput.value = '';
        /* Varsayılan seçim yok: form nötr açılır */
        radioBtns.forEach(btn => {
          btn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            radioBtns.forEach(b => { b.classList.remove('active', 'green'); });
            this.classList.add('active');
            if (this.dataset.value === 'var') this.classList.add('green');
            
            if (this.dataset.value === 'var') {
              if (adresWrapper) adresWrapper.style.display = 'block';
              if (adresInput) setTimeout(() => adresInput.focus(), 100);
            } else {
              if (adresWrapper) adresWrapper.style.display = 'none';
              if (adresInput) adresInput.value = '';
            }
          });
        });
      } else if (type === 'utts') {
        const radioBtns = modal.querySelectorAll('.radio-btn');
        radioBtns.forEach(b => b.classList.remove('active', 'green'));
        /* Varsayılan seçim yok: form nötr açılır */
      } else if (type === 'takip') {
        const radioBtns = modal.querySelectorAll('.radio-btn');
        radioBtns.forEach(b => b.classList.remove('active', 'green'));
        /* Varsayılan seçim yok: form nötr açılır */
      } else if (type === 'bakim') {
        // Bakım modal'ında varsayılan kişi
        const bakimKisiInput = document.getElementById('bakim-kisi');
        if (bakimKisiInput) {
          const vehicle = readVehicles().find(v => String(v.id) === String(vehicleId || window.currentDetailVehicleId));
          if (vehicle?.tahsisKisi) {
            bakimKisiInput.value = vehicle.tahsisKisi;
          }
        }
      } else if (type === 'km') {
        // Km modal'ında input'u temizle ve mevcut km'yi göster (opsiyonel)
        const kmInput = document.getElementById('km-guncelle-input');
        if (kmInput) {
          const vehicle = readVehicles().find(v => String(v.id) === String(vehicleId || window.currentDetailVehicleId));
          // Mevcut güncel km varsa göster, yoksa boş bırak
          const currentKm = vehicle?.guncelKm || '';
          kmInput.value = currentKm ? formatNumber(currentKm) : '';
        }
      }
      
      // Modal'ı aç
      if (modal) {
        // Modal'ı hemen aç
        modal.style.display = 'flex';
        modal.classList.add('active');
        
        // UTTS ve Takip modalları için event listener'ları modal açıldıktan sonra ekle
        if (type === 'utts' || type === 'takip') {
          requestAnimationFrame(() => {
            const radioBtns = refreshModalRadioButtons(modal);
            if (radioBtns.length > 0) {
              radioBtns.forEach(b => b.classList.remove('active', 'green'));
              /* Varsayılan seçim yok: nötr başlar */
              
              // Event listener'ları ekle
              radioBtns.forEach(btn => {
                btn.addEventListener('click', function(e) {
                  e.preventDefault();
                  e.stopPropagation();
                  radioBtns.forEach(b => b.classList.remove('active', 'green'));
                  this.classList.add('active');
                  if (this.dataset.value === 'evet') this.classList.add('green');
                });
              });
            }
          });
        }
        
        // Event menu'yu kapat (modal açıldıktan sonra)
        closeEventMenuModal();
        
        // Tarih inputlarına placeholder ekle
        setTimeout(() => {
          const dateInputs = modal.querySelectorAll('input[type="date"]');
          dateInputs.forEach(input => {
            // Eğer setupDatePlaceholder fonksiyonu varsa kullan
            if (typeof window.setupDatePlaceholder === 'function') {
              window.setupDatePlaceholder(input);
            } else if (typeof setupDatePlaceholder === 'function') {
              setupDatePlaceholder(input);
            } else {
              // Basit placeholder ekleme (kayit.js'teki mantığı kullan)
              const existing = input.parentElement.querySelector('.date-placeholder');
              if (existing) existing.remove();
              
              if (!input.value && input !== document.activeElement) {
                const isMobile = window.innerWidth <= 640;
                const leftPx = isMobile ? '12px' : '8px';
                const placeholder = document.createElement('span');
                placeholder.className = 'date-placeholder';
                placeholder.textContent = 'gg.aa.yyyy';
                placeholder.style.cssText = 'position: absolute; left: ' + leftPx + '; top: 50%; transform: translateY(-50%); color: #666 !important; pointer-events: none; font-size: 10px; z-index: 100;';
                
                const parent = input.parentElement;
                if (parent) {
                  parent.style.position = 'relative';
                  parent.appendChild(placeholder);
                  
                  function updatePlaceholder() {
                    if (input.value || input === document.activeElement) {
                      placeholder.style.display = 'none';
                    } else {
                      placeholder.style.display = 'block';
                    }
                  }
                  
                  input.addEventListener('change', updatePlaceholder);
                  input.addEventListener('focus', () => {
                    placeholder.style.display = 'none';
                  });
                  input.addEventListener('blur', updatePlaceholder);
                  updatePlaceholder();
                }
              }
            }
          });
        }, 100);
      }
    }
  };

  /**
   * Olay modal'ını kapat
   */
  window.closeEventModal = function(type) {
    const modalId = getEventModalId(type);
    
    if (!modalId) return;
    
    const modal = document.getElementById(modalId);
    if (modal) {
      resetModalState(modal);
      modal.classList.remove('active');
      setTimeout(() => modal.style.display = 'none', 300);
    }
  };

  /**
   * Event menu modal'ını kapat
   */
  window.closeEventMenuModal = function() {
    const modal = DOM.eventMenuModal;
    if (modal) {
      resetModalState(modal);
      modal.classList.remove('active');
      setTimeout(() => modal.style.display = 'none', 300);
    }
  };

  /**
   * Ruhsat modalından Taşıt Detay ekranına dön (geri ok ve Vazgeç için)
   */
  window.closeRuhsatAndBackToDetail = function() {
    closeEventModal('ruhsat');
    setTimeout(function() {
      if (window.currentDetailVehicleId) showVehicleDetail(window.currentDetailVehicleId);
    }, 300);
  };

  /**
   * Olay Ekle alt modalından Vazgeç: modalı kapat, Olay Ekle menüsünü tekrar aç (taşıt detaya dönme).
   */
  window.closeEventModalAndShowEventMenu = function(type) {
    window.closeEventModal(type);
    setTimeout(function() {
      openEventModal('menu', window.currentDetailVehicleId);
    }, 350);
  };

  /**
   * Olay menüsünden taşıt detay ekranına dön (event-menu-modal içindeki "Taşıt Detay" butonu)
   */
  window.backToVehicleDetail = function() {
    closeEventMenuModal();
    if (window.currentDetailVehicleId) {
      showVehicleDetail(window.currentDetailVehicleId);
    }
  };

  /**
   * Ruhsat Yükleme modalını açar; vehicle.ruhsatPath varsa görüntüleme/yenileme, yoksa yükleme UI gösterir
   */
  window.openRuhsatModal = function(vehicleId) {
    const vid = (vehicleId || window.currentDetailVehicleId || '').toString();
    if (!vid) return;
    window.currentDetailVehicleId = vid;
    const vehicle = readVehicles().find(v => String(v.id) === vid);
    const modal = document.getElementById('ruhsat-yukleme-modal');
    const content = document.getElementById('ruhsat-modal-content');
    const saveBtn = document.getElementById('ruhsat-save-btn');
    if (!modal || !content || !saveBtn) return;
    content.innerHTML = '';
    saveBtn.style.display = 'none';
    const hasRuhsat = !!(vehicle && vehicle.ruhsatPath);
    if (hasRuhsat) {
      const btnGroup = document.createElement('div');
      btnGroup.className = 'universal-btn-group';
      const viewBtn = document.createElement('button');
      viewBtn.type = 'button';
      viewBtn.className = 'universal-btn-save';
      viewBtn.textContent = 'Ruhsatı Görüntüle';
      viewBtn.onclick = function() { viewRuhsatPdf(vid); };
      btnGroup.appendChild(viewBtn);
      const replaceBtn = document.createElement('button');
      replaceBtn.type = 'button';
      replaceBtn.className = 'universal-btn-cancel';
      replaceBtn.textContent = 'Yeni Ruhsat Yükle';
      replaceBtn.onclick = function() { renderRuhsatUploadForm(content, saveBtn); };
      btnGroup.appendChild(replaceBtn);
      content.appendChild(btnGroup);
    } else {
      renderRuhsatUploadForm(content, saveBtn);
    }
    modal.style.display = 'flex';
    requestAnimationFrame(function() { modal.classList.add('active'); });
  };

  function renderRuhsatUploadForm(content, saveBtn) {
    content.innerHTML = '';
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf';
    input.id = 'ruhsat-file-input';
    input.style.marginBottom = '8px';
    input.onchange = function() { saveBtn.style.display = input.files.length ? 'inline-block' : 'none'; };
    content.appendChild(input);
    saveBtn.style.display = input.files.length ? 'inline-block' : 'none';
  }

  /**
   * Ruhsat dosyasını upload_ruhsat.php'ye POST eder
   */
  window.saveRuhsatUpload = function() {
    const input = document.getElementById('ruhsat-file-input');
    const vehicleId = (window.currentDetailVehicleId || '').toString();
    if (!input || !input.files || !input.files[0] || !vehicleId) {
      alert('Lütfen PDF dosyası seçin.');
      return;
    }
    const formData = new FormData();
    formData.append('vehicleId', vehicleId);
    formData.append('ruhsat', input.files[0]);
    fetch('upload_ruhsat.php', { method: 'POST', body: formData })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.success) {
          closeEventModal('ruhsat');
          showVehicleDetail(vehicleId);
        } else {
          alert(data.error || 'Yükleme başarısız');
        }
      })
      .catch(function(err) {
        console.error(err);
        alert('Yükleme sırasında hata oluştu.');
      });
  };

  /**
   * Ruhsat PDF'ini yeni sekmede açar
   */
  window.viewRuhsatPdf = function(vehicleId) {
    const vid = (vehicleId || window.currentDetailVehicleId || '').toString();
    if (!vid) return;
    const url = 'ruhsat.php?id=' + encodeURIComponent(vid);
    window.open(url, '_blank', 'noopener');
  };

  /**
   * Kaza modal'ında boya şemasını render et (readonly mevcut, yeni hasarlar eklenebilir)
   */
  function renderBoyaSchemaKaza(vehicle, container) {
    if (!container) {
      container.innerHTML = '';
      return;
    }

    getParsedKaportaSvg().then(function(svgClone) {
        if (!svgClone) return;
        
        container.innerHTML = '';
        
        // Şema wrapper'ı oluştur
        const schemaWrapper = document.createElement('div');
        const isMobileKazaSchema = window.innerWidth <= 640;
        schemaWrapper.style.display = 'flex';
        schemaWrapper.style.alignItems = 'flex-start';
        schemaWrapper.style.justifyContent = 'center';
        schemaWrapper.style.gap = '24px';
        schemaWrapper.style.maxHeight = '144px'; /* 180 * 0.8 */
        schemaWrapper.style.overflow = isMobileKazaSchema ? 'visible' : 'hidden';
        
        schemaWrapper.appendChild(svgClone);
        
        svgClone.setAttribute('width', '140');
        svgClone.setAttribute('height', '210');
        if (isMobileKazaSchema) {
          // Mobilde şemayı sola doğru 18px büyüt: sağ kenar sabit kalır.
          svgClone.style.width = '186px';
          svgClone.style.height = '124px';
          svgClone.style.margin = '0';
          svgClone.style.position = 'relative';
          svgClone.style.left = '-18px';
        } else {
          svgClone.style.width = '168px';  /* 210 * 0.8 */
          svgClone.style.height = '112px'; /* 140 * 0.8 */
          svgClone.style.margin = '0';
        }
        svgClone.style.display = 'block';
        svgClone.style.transform = 'rotate(90deg)';
        svgClone.style.transformOrigin = 'center center';
        
        const defaultGrayKaza = '#959595'; /* Araç simgesi gri – çok az daha açık ton */
        const allParts = svgClone.querySelectorAll('path[id]');
        allParts.forEach(part => {
          part.setAttribute('fill', defaultGrayKaza);
          part.style.fill = defaultGrayKaza;
        });
        
        // Mevcut durumları uygula (readonly)
        const boyaliParcalar = vehicle.boyaliParcalar || {};
        Object.keys(boyaliParcalar).forEach(partId => {
          const state = boyaliParcalar[partId];
          const part = svgClone.querySelector(`#${partId}`);
          if (part) {
            if (state === 'boyali') {
              part.setAttribute('fill', '#28a745');
              part.style.fill = '#28a745';
            } else if (state === 'degisen') {
              part.setAttribute('fill', '#d40000');
              part.style.fill = '#d40000';
            } else {
              part.setAttribute('fill', defaultGrayKaza);
              part.style.fill = defaultGrayKaza;
            }
            part.style.pointerEvents = 'none';
            part.style.opacity = '0.7';
          }
        });
        
        // Yeni hasarlar için tıklanabilir yap (sadece boyasız parçalar)
        allParts.forEach(part => {
          const partId = part.getAttribute('id');
          if (!boyaliParcalar[partId]) {
            // Mevcut durumu yok, yeni hasar eklenebilir
            part.style.pointerEvents = 'auto';
            part.style.cursor = 'pointer';
            part.dataset.state = 'boyasiz';
            
            // Tıklama event'i ekle (sadece yeni hasarlar için)
            part.addEventListener('click', function(e) {
              e.preventDefault();
              e.stopPropagation();
              
              // 3 durumlu toggle: boyasiz -> boyali (yeşil) -> degisen (kırmızı) -> boyasiz
              const currentState = this.dataset.state || 'boyasiz';
              if (currentState === 'boyasiz') {
                // İlk tık: Yeşil (boyalı)
                this.dataset.state = 'boyali';
                this.setAttribute('fill', '#28a745');
                this.style.fill = '#28a745';
              } else if (currentState === 'boyali') {
                // İkinci tık: Kırmızı (değişen/hasar)
                this.dataset.state = 'degisen';
                this.setAttribute('fill', '#d40000');
                this.style.fill = '#d40000';
              } else {
                // Üçüncü tık: Geri boyasız (temiz)
                this.dataset.state = 'boyasiz';
                this.setAttribute('fill', defaultGrayKaza);
                this.style.fill = defaultGrayKaza;
              }
            });
          }
        });
        
        // Legend ekle (şemanın sağına, alt alta)
        const legend = document.createElement('div');
        legend.className = 'boya-legend';
        legend.style.display = 'flex';
        legend.style.flexDirection = 'column';
        legend.style.justifyContent = 'flex-start';
        legend.style.alignItems = 'flex-start';
        legend.style.gap = '8px';
        legend.style.fontSize = '12px';
        legend.style.color = '#aaa';
        legend.style.marginTop = '30px';
        legend.innerHTML = `
          <div class="boya-legend-item" style="display: flex; align-items: center; gap: 6px;"><span class="boya-legend-dot" style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #888888;"></span> Boyasız</div>
          <div class="boya-legend-item" style="display: flex; align-items: center; gap: 6px;"><span class="boya-legend-dot" style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #28a745;"></span> Boyalı (Mevcut)</div>
          <div class="boya-legend-item" style="display: flex; align-items: center; gap: 6px;"><span class="boya-legend-dot" style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #d40000;"></span> Değişen/Hasar</div>
        `;
        // Legend'i wrapper'a ekle (şemanın sağına)
        schemaWrapper.appendChild(legend);
        
        // Wrapper'ı container'a ekle
        container.appendChild(schemaWrapper);
      })
      .catch(err => {
        console.error('SVG yükleme hatası:', err);
      });
  }

  /**
   * Bakım olayı kaydet
   */
  window.saveBakimEvent = function() {
    const vehicleId = window.currentDetailVehicleId;
    if (!vehicleId) return;
    
    const tarih = document.getElementById('bakim-tarih')?.value.trim() || '';
    const islemler = document.getElementById('bakim-islemler')?.value.trim() || '';
    const servis = document.getElementById('bakim-servis')?.value.trim() || '';
    const kisi = document.getElementById('bakim-kisi')?.value.trim() || '';
    const km = document.getElementById('bakim-km')?.value.trim() || '';
    const tutar = document.getElementById('bakim-tutar')?.value.trim() || '';
    
    if (!tarih || !islemler) {
      alert('Tarih ve Yapılan İşlemler zorunludur!');
      return;
    }
    
    const vehicles = readVehicles();
    const vehicle = vehicles.find(v => String(v.id) === String(vehicleId));
    if (!vehicle) return;
    
    if (!vehicle.events) vehicle.events = [];
    
    const data = {
      islemler: islemler,
      servis: servis,
      kisi: kisi || getEventPerformerName(vehicle),
      km: km,
      tutar: tutar
    };
    const event = {
      id: Date.now().toString(),
      type: 'bakim',
      date: tarih,
      timestamp: new Date().toISOString(),
      data: data
    };
    
    vehicle.events.unshift(event);
    writeVehicles(vehicles);
    
    closeEventModal('bakim');
    showVehicleDetail(vehicleId); // Detay ekranını yenile
  };

  /** Yapılan İşlemler textarea: 2 satır açık, içerik uzadıkça aşağı açılsın */
  (function initBakimIslemlerExpand() {
    var el = document.getElementById('bakim-islemler');
    if (el) {
      el.addEventListener('input', function() {
        this.style.height = 'auto';
        var lineHeight = 22;
        var minH = lineHeight * 2;
        var maxH = lineHeight * 10;
        var newH = Math.min(Math.max(this.scrollHeight, minH), maxH);
        this.style.height = newH + 'px';
        this.style.overflow = this.scrollHeight > maxH ? 'auto' : 'hidden';
      });
    }
  })();

  /**
   * Kaza olayı kaydet
   */
  window.saveKazaEvent = function() {
    const vehicleId = window.currentDetailVehicleId;
    if (!vehicleId) return;
    
    const tarih = document.getElementById('kaza-tarih')?.value.trim() || '';
    const surucu = document.getElementById('kaza-surucu')?.value.trim() || '';
    const hasarTutari = document.getElementById('kaza-tutar')?.value.trim() || '';
    
    if (!tarih) {
      alert('Tarih zorunludur!');
      return;
    }
    
    // Kaza şemasından yeni hasarları topla
    const container = document.getElementById('kaza-kaporta-container');
    const newDamages = {};
    if (container) {
      const svg = container.querySelector('svg');
      if (svg) {
        const paths = svg.querySelectorAll('path[id]');
        paths.forEach(part => {
          const partId = part.getAttribute('id');
          const state = part.dataset.state;
          if (state === 'boyali' || state === 'degisen') {
            newDamages[partId] = state;
          }
        });
      }
    }
    
    const vehicles = readVehicles();
    const vehicle = vehicles.find(v => String(v.id) === String(vehicleId));
    if (!vehicle) return;
    
    if (!vehicle.events) vehicle.events = [];
    if (!vehicle.boyaliParcalar) vehicle.boyaliParcalar = {};
    
    // Yeni hasarları mevcut boyaliParcalar'a ekle
    Object.keys(newDamages).forEach(partId => {
      vehicle.boyaliParcalar[partId] = newDamages[partId];
    });
    if (Object.keys(newDamages).length > 0) {
      vehicle.boya = 'var';
    }
    
    const event = {
      id: Date.now().toString(),
      type: 'kaza',
      date: tarih,
      timestamp: new Date().toISOString(),
      data: {
        surucu: surucu || getEventPerformerName(vehicle),
        hasarParcalari: newDamages,
        hasarTutari: hasarTutari
      }
    };
    
    vehicle.events.unshift(event);
    writeVehicles(vehicles);
    
    closeEventModal('kaza');
    showVehicleDetail(vehicleId);
  };

  /**
   * Yılları ekle (gg/aa/yyyy → +years → YYYY-MM-DD).
   * Aynı iş kuralı driver_event.php içinde PHP ile kullanılır; değişiklikte her iki tarafı senkron tutun.
   */
  function addYears(dateStr, years) {
    if (!dateStr) return '';
    
    // gg/aa/yyyy formatından parse et
    const datePattern = /^(\d{2})\/(\d{2})\/(\d{4})$/;
    const match = dateStr.match(datePattern);
    
    if (!match) return dateStr;
    
    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const year = parseInt(match[3], 10);
    
    const date = new Date(year, month - 1, day);
    date.setFullYear(date.getFullYear() + years);
    
    // YYYY-MM-DD formatına çevir
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    
    return `${yyyy}-${mm}-${dd}`;
  }

  /**
   * Muayene bitiş tarihi hesapla (otomobil/ticari + sıfır/sonraki muayene kuralları).
   * Aynı algoritma driver_event.php calculateNextMuayene ile paylaşılır; senkron tutulmalı.
   * - Araç sıfır ise (üretim yılı == muayene yılı):
   *     otomobil → +3 yıl, küçük/büyük ticari → +2 yıl
   * - Sonraki muayeneler:
   *     otomobil → +2 yıl, küçük/büyük ticari → +1 yıl
   */
  function calculateNextMuayene(vehicle, muayeneDate) {
    if (!muayeneDate) return '';

    const vehicleType = vehicle.vehicleType; // 'otomobil' | 'minivan' | 'kamyon'
    const productionYear = parseInt(vehicle.year) || new Date().getFullYear();

    // Muayene yılını gg/aa/yyyy formatından çıkar
    const dateMatch = muayeneDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    const muayeneYear = dateMatch ? parseInt(dateMatch[3]) : new Date().getFullYear();

    // Üretim yılı ile muayene yılı aynıysa araç sıfır kabul edilir
    const isSifir = productionYear === muayeneYear;

    if (isSifir) {
      // Sıfır araç - ilk muayene süreleri
      if (vehicleType === 'otomobil') {
        return addYears(muayeneDate, 3);
      } else {
        // küçük veya büyük ticari (minivan / kamyon)
        return addYears(muayeneDate, 2);
      }
    } else {
      // Sonraki muayeneler
      if (vehicleType === 'otomobil') {
        return addYears(muayeneDate, 2);
      } else {
        // küçük veya büyük ticari
        return addYears(muayeneDate, 1);
      }
    }
  }

  /**
   * Sigorta bilgisi güncelle (bitiş tarihi 1 yıl sonrasına ayarlanır)
   */
  window.updateSigortaInfo = function() {
    const vehicleId = window.currentDetailVehicleId;
    if (!vehicleId) return;
    
    const tarih = document.getElementById('sigorta-tarih')?.value.trim() || '';
    const firma = document.getElementById('sigorta-firma')?.value.trim() || '';
    const acente = document.getElementById('sigorta-acente')?.value.trim() || '';
    const iletisim = document.getElementById('sigorta-iletisim')?.value.trim() || '';
    
    if (!tarih) {
      alert('Tarih zorunludur!');
      return;
    }
    
    const vehicles = readVehicles();
    const vehicle = vehicles.find(v => String(v.id) === String(vehicleId));
    if (!vehicle) return;
    
    if (!vehicle.events) vehicle.events = [];
    
    // Bitmiş tarihi 1 yıl sonrasına ayarla
    const bitisTarihi = addYears(tarih, 1);
    
    // gg/aa/yyyy formatından YYYY-MM-DD'ye çevir (tarih input için)
    const dateParts = tarih.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (dateParts) {
      const day = dateParts[1];
      const month = dateParts[2];
      const year = dateParts[3];
      // Bitiş tarihini YYYY-MM-DD formatında sakla
    }
    
    vehicle.sigortaDate = bitisTarihi;
    
    const event = {
      id: Date.now().toString(),
      type: 'sigorta-guncelle',
      date: tarih,
      timestamp: new Date().toISOString(),
      data: {
        firma: firma,
        acente: acente,
        iletisim: iletisim,
        bitisTarihi: bitisTarihi,
        surucu: getEventPerformerName(vehicle)
      }
    };
    
    vehicle.events.unshift(event);
    return writeVehicles(vehicles).then(function() {
      if (window.updateNotifications) window.updateNotifications();
      closeEventModal('sigorta');
      showVehicleDetail(vehicleId);
    });
  };

  /**
   * Kasko bilgisi güncelle (bitiş tarihi 1 yıl sonrasına ayarlanır)
   */
  window.updateKaskoInfo = function() {
    const vehicleId = window.currentDetailVehicleId;
    if (!vehicleId) return;
    
    const tarih = document.getElementById('kasko-tarih')?.value.trim() || '';
    const firma = document.getElementById('kasko-firma')?.value.trim() || '';
    const acente = document.getElementById('kasko-acente')?.value.trim() || '';
    const iletisim = document.getElementById('kasko-iletisim')?.value.trim() || '';
    
    if (!tarih) {
      alert('Tarih zorunludur!');
      return;
    }
    
    const vehicles = readVehicles();
    const vehicle = vehicles.find(v => String(v.id) === String(vehicleId));
    if (!vehicle) return;
    
    if (!vehicle.events) vehicle.events = [];
    
    // Bitiş tarihi 1 yıl sonrasına ayarla
    const bitisTarihi = addYears(tarih, 1);
    
    vehicle.kaskoDate = bitisTarihi;
    
    const event = {
      id: Date.now().toString(),
      type: 'kasko-guncelle',
      date: tarih,
      timestamp: new Date().toISOString(),
      data: {
        firma: firma,
        acente: acente,
        iletisim: iletisim,
        bitisTarihi: bitisTarihi,
        surucu: getEventPerformerName(vehicle)
      }
    };
    
    vehicle.events.unshift(event);
    return writeVehicles(vehicles).then(function() {
      if (window.updateNotifications) window.updateNotifications();
      closeEventModal('kasko');
      showVehicleDetail(vehicleId);
    });
  };

  /**
   * Muayene bilgisi güncelle (bitiş tarihi otomatik hesaplanır)
   */
  window.updateMuayeneInfo = function() {
    const vehicleId = window.currentDetailVehicleId;
    if (!vehicleId) return;
    
    const tarih = document.getElementById('muayene-tarih')?.value.trim() || '';
    
    if (!tarih) {
      alert('Tarih zorunludur!');
      return;
    }
    
    const vehicles = readVehicles();
    const vehicle = vehicles.find(v => String(v.id) === String(vehicleId));
    if (!vehicle) return;
    
    if (!vehicle.events) vehicle.events = [];
    
    // Muayene bitiş tarihi hesapla
    const bitisTarihi = calculateNextMuayene(vehicle, tarih);
    
    vehicle.muayeneDate = bitisTarihi;
    
    const event = {
      id: Date.now().toString(),
      type: 'muayene-guncelle',
      date: tarih,
      timestamp: new Date().toISOString(),
      data: {
        bitisTarihi: bitisTarihi,
        surucu: getEventPerformerName(vehicle)
      }
    };
    
    vehicle.events.unshift(event);
    writeVehicles(vehicles);
    
    // Bildirimleri güncelle
    if (window.updateNotifications) window.updateNotifications();
    
    closeEventModal('muayene');
    showVehicleDetail(vehicleId);
  };

  /**
   * Anahtar bilgisi güncelle
   */
  window.updateAnahtarInfo = function() {
    const vehicleId = window.currentDetailVehicleId;
    if (!vehicleId) return;
    
    const radioBtns = document.querySelectorAll('#anahtar-guncelle-modal .radio-btn');
    const activeBtn = Array.from(radioBtns).find(btn => btn.classList.contains('active'));
    const durum = activeBtn?.dataset.value || 'yok';
    const detay = durum === 'var' ? (document.getElementById('anahtar-detay-event')?.value.trim() || '') : '';
    
    const vehicles = readVehicles();
    const vehicle = vehicles.find(v => String(v.id) === String(vehicleId));
    if (!vehicle) return;
    
    if (!vehicle.events) vehicle.events = [];
    
    vehicle.anahtar = durum;
    vehicle.anahtarNerede = detay;
    
    const event = {
      id: Date.now().toString(),
      type: 'anahtar-guncelle',
      date: formatDateForDisplay(new Date()),
      timestamp: new Date().toISOString(),
      data: {
        durum: durum,
        detay: detay,
        surucu: getEventPerformerName(vehicle)
      }
    };
    
    vehicle.events.unshift(event);
    return writeVehicles(vehicles).then(function() {
      closeEventModal('anahtar');
      showVehicleDetail(vehicleId);
    });
  };

  /**
   * Kredi/Rehin bilgisi güncelle
   */
  window.updateKrediInfo = function() {
    const vehicleId = window.currentDetailVehicleId;
    if (!vehicleId) return;
    
    const radioBtns = document.querySelectorAll('#kredi-guncelle-modal .radio-btn');
    const activeBtn = Array.from(radioBtns).find(btn => btn.classList.contains('active'));
    const durum = activeBtn?.dataset.value || 'yok';
    const detay = durum === 'var' ? (document.getElementById('kredi-detay-event')?.value.trim() || '') : '';
    
    const vehicles = readVehicles();
    const vehicle = vehicles.find(v => String(v.id) === String(vehicleId));
    if (!vehicle) return;
    
    if (!vehicle.events) vehicle.events = [];
    
    vehicle.kredi = durum;
    vehicle.krediDetay = detay;
    
    const event = {
      id: Date.now().toString(),
      type: 'kredi-guncelle',
      date: formatDateForDisplay(new Date()),
      timestamp: new Date().toISOString(),
      data: {
        durum: durum,
        detay: detay,
        surucu: getEventPerformerName(vehicle)
      }
    };
    
    vehicle.events.unshift(event);
    return writeVehicles(vehicles).then(function() {
      closeEventModal('kredi');
      showVehicleDetail(vehicleId);
    });
  };

  /**
   * Kasko Kodu güncelle
   */
  window.updateKaskoKoduInfo = function() {
    const vehicleId = window.currentDetailVehicleId;
    if (!vehicleId) return;

    const inputElement = document.getElementById('kasko-kodu-guncelle-input');
    const yeniKaskoKodu = inputElement ? inputElement.value.trim() : '';

    if (!yeniKaskoKodu) {
      if (typeof showToast === 'function') showToast('Lütfen Kasko Kodunu giriniz.', 'error');
      else alert('Lütfen Kasko Kodunu giriniz.');
      return;
    }

    const vehicles = readVehicles();
    const vehicle = vehicles.find(v => String(v.id) === String(vehicleId));
    if (!vehicle) return;

    vehicle.kaskoKodu = yeniKaskoKodu;
    if (!vehicle.events) vehicle.events = [];
    vehicle.events.push({
      id: Date.now().toString(),
      type: 'kasko-kodu-guncelle',
      date: formatDateForDisplay(new Date()),
      timestamp: new Date().toISOString(),
      data: { kaskoKodu: yeniKaskoKodu, surucu: getEventPerformerName(vehicle) }
    });

    return writeVehicles(vehicles).then(function() {
      if (inputElement) inputElement.value = '';
      closeEventModal('kaskokodu');
      document.querySelectorAll('.modal-overlay.active').forEach(m => {
        m.classList.remove('active');
        m.style.display = 'none';
      });
      if (typeof showToast === 'function') showToast('Kasko Kodu güncellendi', 'success');
      setTimeout(() => showVehicleDetail(vehicleId), 250);
    });
  };

  /**
   * Km bilgisi güncelle
   */
  window.updateKmInfo = function() {
    const vehicleId = window.currentDetailVehicleId;
    if (!vehicleId) return;
    
    const kmInput = document.getElementById('km-guncelle-input');
    if (!kmInput) return;
    
    const yeniKm = kmInput.value.trim().replace(/\./g, ''); // Noktaları temizle
    if (!yeniKm) {
      alert('Lütfen kilometre bilgisi giriniz!');
      return;
    }
    
    // Numeric kontrol
    if (isNaN(yeniKm) || !/^\d+$/.test(yeniKm)) {
      alert('Lütfen geçerli bir kilometre değeri giriniz!');
      return;
    }
    
    const vehicles = readVehicles();
    const vehicle = vehicles.find(v => String(v.id) === String(vehicleId));
    if (!vehicle) return;
    
    if (!vehicle.events) vehicle.events = [];
    
    // Eski km değerini al (guncelKm varsa onu, yoksa vehicle.km'i kullan)
    const eskiKm = vehicle.guncelKm || vehicle.km || '';
    const eskiKmNum = parseInt(String(eskiKm).replace(/\D/g, ''), 10) || 0;
    const yeniKmNum = parseInt(yeniKm, 10) || 0;
    if (eskiKmNum > 0 && yeniKmNum < eskiKmNum) {
      alert('Bildirilmek İstenen Km, Önceki Kayıtlarla Uyuşmamaktadır. Şirket Yetkilisi İle Görüşün');
      return;
    }
    
    // Güncel km'yi güncelle
    vehicle.guncelKm = yeniKm;
    
    // Event kaydı oluştur
    const event = {
      id: Date.now().toString(),
      type: 'km-revize',
      date: formatDateForDisplay(new Date()),
      timestamp: new Date().toISOString(),
      data: {
        eskiKm: eskiKm,
        yeniKm: yeniKm,
        surucu: getEventPerformerName(vehicle)
      }
    };
    
    vehicle.events.unshift(event);
    return writeVehicles(vehicles).then(function() {
      kmInput.value = '';
      closeEventModal('km');
      showVehicleDetail(vehicleId);
    });
  };

  /**
   * UTTS Bilgisi güncelle
   */
  window.updateUTTSInfo = function() {
    const vehicleId = window.currentDetailVehicleId;
    if (!vehicleId) return;
    
    const radioBtns = document.querySelectorAll('#utts-guncelle-modal .radio-btn');
    const activeBtn = Array.from(radioBtns).find(btn => btn.classList.contains('active'));
    const durum = activeBtn?.dataset.value === 'evet' ? true : false;
    
    const vehicles = readVehicles();
    const vehicle = vehicles.find(v => String(v.id) === String(vehicleId));
    if (!vehicle) return;
    
    if (!vehicle.events) vehicle.events = [];
    
    vehicle.uttsTanimlandi = durum;
    
    const event = {
      id: Date.now().toString(),
      type: 'utts-guncelle',
      date: formatDateForDisplay(new Date()),
      timestamp: new Date().toISOString(),
      data: {
        durum: durum,
        surucu: getEventPerformerName(vehicle)
      }
    };
    
    vehicle.events.unshift(event);
    return writeVehicles(vehicles).then(function() {
      closeEventModal('utts');
      showVehicleDetail(vehicleId);
    });
  };

  /**
   * Taşıt Takip Cihaz Bilgisi güncelle
   */
  window.updateTakipCihazInfo = function() {
    const vehicleId = window.currentDetailVehicleId;
    if (!vehicleId) return;
    
    const radioBtns = document.querySelectorAll('#takip-cihaz-guncelle-modal .radio-btn');
    const activeBtn = Array.from(radioBtns).find(btn => btn.classList.contains('active'));
    const durum = activeBtn?.dataset.value === 'evet' ? true : false;
    
    const vehicles = readVehicles();
    const vehicle = vehicles.find(v => String(v.id) === String(vehicleId));
    if (!vehicle) return;
    
    if (!vehicle.events) vehicle.events = [];
    
    vehicle.takipCihaziMontaj = durum;
    
    const event = {
      id: Date.now().toString(),
      type: 'takip-cihaz-guncelle',
      date: formatDateForDisplay(new Date()),
      timestamp: new Date().toISOString(),
      data: {
        durum: durum,
        surucu: getEventPerformerName(vehicle)
      }
    };
    
    vehicle.events.unshift(event);
    return writeVehicles(vehicles).then(function() {
      closeEventModal('takip');
      showVehicleDetail(vehicleId);
    });
  };

  /**
   * Yazlık/Kışlık Lastik Durumu güncelle
   */
  window.updateLastikInfo = function() {
    const vehicleId = window.currentDetailVehicleId;
    if (!vehicleId) return;
    
    const radioBtns = document.querySelectorAll('#lastik-guncelle-modal .radio-btn');
    const activeBtn = Array.from(radioBtns).find(btn => btn.classList.contains('active'));
    const durum = activeBtn?.dataset.value || 'yok';
    const adres = durum === 'var' ? (document.getElementById('lastik-adres-event')?.value.trim() || '') : '';
    
    const vehicles = readVehicles();
    const vehicle = vehicles.find(v => String(v.id) === String(vehicleId));
    if (!vehicle) return;
    
    if (!vehicle.events) vehicle.events = [];
    
    vehicle.lastikDurumu = durum;
    vehicle.lastikAdres = adres;
    
    const event = {
      id: Date.now().toString(),
      type: 'lastik-guncelle',
      date: formatDateForDisplay(new Date()),
      timestamp: new Date().toISOString(),
      data: {
        durum: durum,
        adres: adres,
        surucu: getEventPerformerName(vehicle)
      }
    };
    
    vehicle.events.unshift(event);
    return writeVehicles(vehicles).then(function() {
      if (window.updateNotifications) window.updateNotifications();
      closeEventModal('lastik');
      showVehicleDetail(vehicleId);
    });
  };

  /**
   * Şube değişikliği kaydet
   */
  window.updateSubeDegisiklik = function() {
    const vehicleId = window.currentDetailVehicleId;
    if (!vehicleId) return;
    
    const selectEl = document.getElementById('sube-select');
    if (!selectEl) return;
    
    const yeniSubeId = selectEl.value;
    if (!yeniSubeId) {
      alert('Lütfen bir şube seçiniz!');
      return;
    }
    
    const vehicles = readVehicles();
    const vehicle = vehicles.find(v => String(v.id) === String(vehicleId));
    if (!vehicle) return;
    
    if (!vehicle.events) vehicle.events = [];
    
    const branches = readBranches();
    const eskiSubeId = vehicle.branchId || '';
    const eskiSube = branches.find(b => String(b.id) === String(eskiSubeId));
    const yeniSube = branches.find(b => String(b.id) === String(yeniSubeId));
    const normalizedSubeId = yeniSube ? yeniSube.id : yeniSubeId;
    vehicle.branchId = normalizedSubeId;
    
    const event = {
      id: Date.now().toString(),
      type: 'sube-degisiklik',
      date: formatDateForDisplay(new Date()),
      timestamp: new Date().toISOString(),
      data: {
        eskiSubeId: eskiSubeId,
        yeniSubeId: normalizedSubeId,
        eskiSubeAdi: eskiSube?.name || '',
        yeniSubeAdi: yeniSube?.name || '',
        surucu: getEventPerformerName(vehicle)
      }
    };
    
    vehicle.events.unshift(event);
    return writeVehicles(vehicles).then(function() {
      closeEventModal('sube');
      showVehicleDetail(vehicleId);
    });
  };

  /**
   * Kullanıcı atama/değişiklik kaydet
   */
  window.updateKullaniciAtama = function() {
    const vehicleId = window.currentDetailVehicleId;
    if (!vehicleId) return;

    const selectEl = document.getElementById('kullanici-select');
    if (!selectEl) return;

    const yeniKullaniciId = selectEl.value;
    if (!yeniKullaniciId || yeniKullaniciId === '__add_user__') {
      alert('Lütfen bir kullanıcı seçiniz!');
      return;
    }

    const vehicles = readVehicles();
    const vehicle = vehicles.find(v => String(v.id) === String(vehicleId));
    if (!vehicle) return;

    if (!vehicle.events) vehicle.events = [];

    // Henüz Tanımlanmadı: tahsisi kaldır
    if (yeniKullaniciId === '__none__') {
      vehicle.assignedUserId = undefined;
      vehicle.tahsisKisi = '';
      vehicle.updatedAt = new Date().toISOString();
      const event = {
        id: Date.now().toString(),
        type: 'kullanici-atama',
        date: formatDateForDisplay(new Date()),
        timestamp: new Date().toISOString(),
        data: { kullaniciId: '', kullaniciAdi: 'Henüz Tanımlanmadı' }
      };
      vehicle.events.unshift(event);
      return writeVehicles(vehicles).then(function() {
        closeEventModal('kullanici');
        showVehicleDetail(vehicleId);
      });
    }

    const users = readUsers();
    const user = users.find(u => String(u.id) === String(yeniKullaniciId));
    const eskiKullaniciId = vehicle.assignedUserId || '';
    const eskiUser = users.find(u => String(u.id) === String(eskiKullaniciId));

    const normalizedKullaniciId = user ? user.id : yeniKullaniciId;

    vehicle.assignedUserId = normalizedKullaniciId;
    vehicle.tahsisKisi = user?.name || '';
    var userBranchId = user ? (user.branchId || '') : '';
    if (user && !vehicle.branchId && userBranchId) vehicle.branchId = userBranchId;
    vehicle.updatedAt = new Date().toISOString();

    const event = {
      id: Date.now().toString(),
      type: 'kullanici-atama',
      date: formatDateForDisplay(new Date()),
      timestamp: new Date().toISOString(),
      data: {
        kullaniciId: normalizedKullaniciId,
        kullaniciAdi: user?.name || '',
        eskiKullaniciAdi: eskiUser?.name || (eskiKullaniciId ? 'Bilinmiyor' : '')
      }
    };

    vehicle.events.unshift(event);
    return writeVehicles(vehicles).then(function() {
      closeEventModal('kullanici');
      setTimeout(function() { showVehicleDetail(vehicleId); }, 250);
    });
  };

  /**
   * Satış/Pert kaydet ve arşive taşı
   */
  window.saveSatisPert = function() {
    const vehicleId = window.currentDetailVehicleId;
    if (!vehicleId) return;
    
    const tarih = document.getElementById('satis-tarih')?.value.trim() || '';
    const tutar = document.getElementById('satis-tutar')?.value.trim() || '';
    const aciklama = document.getElementById('satis-aciklama')?.value.trim() || '';
    
    if (!tarih) {
      alert('Satış/Pert tarihi zorunludur!');
      return;
    }
    
    const vehicles = readVehicles();
    const vehicle = vehicles.find(v => String(v.id) === String(vehicleId));
    if (!vehicle) return;
    
    if (!vehicle.events) vehicle.events = [];
    
    vehicle.satildiMi = true;
    vehicle.satisTarihi = tarih;
    vehicle.satisTutari = tutar;
    
    const event = {
      id: Date.now().toString(),
      type: 'satis',
      date: tarih,
      timestamp: new Date().toISOString(),
      data: {
        tutar: tutar,
        aciklama: aciklama,
        surucu: getEventPerformerName(vehicle)
      }
    };
    
    vehicle.events.unshift(event);
    return writeVehicles(vehicles).then(function() {
      closeEventModal('satis');
      closeVehicleDetailModal();
      alert('Taşıt satış/pert işlemi kaydedildi. Taşıt arşive taşındı.');
    });
  };

  /**
   * Tarihçe modal'ını aç (initialTab: bakim | kaza | km | diger; yoksa bakım)
   */
  window.showVehicleHistory = function(vehicleId, initialTab) {
    const vid = vehicleId || window.currentDetailVehicleId;
    if (!vid) return;
    
    const modal = DOM.vehicleHistoryModal;
    if (!modal) return;
    
    const tab = (initialTab && /^(bakim|kaza|km|diger)$/.test(initialTab)) ? initialTab : 'bakim';
    switchHistoryTab(tab, vid);
    
    modal.style.display = 'flex';
    requestAnimationFrame(() => modal.classList.add('active'));
  };

  /**
   * Tarihçe tab değiştir
   */
  window.switchHistoryTab = function(tabType, vehicleId) {
    const vid = vehicleId || window.currentDetailVehicleId;
    if (!vid) return;

    // Tab'ları güncelle
    (DOM.vehicleHistoryModal ? DOM.vehicleHistoryModal.querySelectorAll('.history-tab') : []).forEach(tab => {
      tab.classList.remove('active');
      if (tab.dataset.tab === tabType) {
        tab.classList.add('active');
        tab.style.borderBottomColor = '#d40000';
        tab.style.color = '#ffffff';
      } else {
        tab.style.borderBottomColor = 'transparent';
        tab.style.color = '#ffffff';
      }
    });

    const contentEl = DOM.historyContent;
    if (!contentEl) return;

    const vehicles = readVehicles();
    const vehicle = vehicles.find(v => String(v.id) === String(vid));
    if (!vehicle) return;

    const events = vehicle.events || [];
    let html = '';

    if (tabType === 'bakim') {
      const bakimEvents = events.filter(e => e.type === 'bakim');
      if (bakimEvents.length === 0) {
        html = '<div class="history-empty-msg" style="text-align: center; padding: 20px;">' + escapeHtml(toTitleCase('Bakım kaydı bulunmamaktadır.')) + '</div>';
      } else {
        bakimEvents.forEach(event => {
          const kmStr = event.data?.km ? `<span class="history-label">Km:</span> ${escapeHtml(formatNumber(event.data.km))}` : '';
          const tutarStr = event.data?.tutar ? `<span class="history-label">Tutar:</span> ${escapeHtml(event.data.tutar)}` : '';
          const ekStr = [kmStr, tutarStr].filter(Boolean).join(' | ');
          const islemler = toTitleCase(event.data?.islemler || '');
          const servis = toTitleCase(event.data?.servis || '-');
          const kisi = toTitleCase(event.data?.kisi || '-');
          html += `<div class="history-item">
            <div class="history-item-date" style="font-weight: 600; font-size: 12px; margin-bottom: 4px;">${escapeHtml(formatDateForDisplay(event.date) || '-')}</div>
            <div class="history-item-body" style="font-size: 12px;"><span class="history-label">${escapeHtml(islemler)}</span></div>
            <div class="history-item-body" style="font-size: 12px; margin-top: 4px;"><span class="history-label">Servis:</span> ${escapeHtml(servis)} | <span class="history-label">Kişi:</span> ${escapeHtml(kisi)}${ekStr ? ' | ' + ekStr : ''}</div>
          </div>`;
        });
      }
    } else if (tabType === 'kaza') {
      const kazaEvents = events.filter(e => e.type === 'kaza');
      const partNames = getKaportaPartNames();
      if (kazaEvents.length === 0) {
        html = '<div class="history-empty-msg" style="text-align: center; padding: 20px;">' + escapeHtml(toTitleCase('Kaza kaydı bulunmamaktadır.')) + '</div>';
      } else {
        kazaEvents.forEach(event => {
          const hasarStr = event.data?.hasarTutari ? ` | <span class="history-label">Hasar Tutarı:</span> ${escapeHtml(event.data.hasarTutari)}` : '';
          const aciklamaVal = event.data?.aciklama ? toTitleCase(event.data.aciklama) : '';
          const aciklamaHtml = aciklamaVal ? `<div class="history-item-body" style="font-size: 12px; margin-top: 4px;">${escapeHtml(aciklamaVal)}</div>` : '';
          let parcalarHtml = '';
          const hasarParcalari = event.data?.hasarParcalari;
          if (hasarParcalari && typeof hasarParcalari === 'object' && Object.keys(hasarParcalari).length > 0) {
            const boyaliList = [];
            const degisenList = [];
            Object.keys(hasarParcalari).forEach(partId => {
              const partName = partNames[partId] || partId;
              if (hasarParcalari[partId] === 'boyali') boyaliList.push(toTitleCase(partName));
              else if (hasarParcalari[partId] === 'degisen') degisenList.push(toTitleCase(partName));
            });
            const partParts = [];
            if (boyaliList.length) partParts.push(`<span class="history-label">Boyalı:</span> ${escapeHtml(boyaliList.join(', '))}`);
            if (degisenList.length) partParts.push(`<span class="history-label">Değişen:</span> ${escapeHtml(degisenList.join(', '))}`);
            if (partParts.length) parcalarHtml = `<div class="history-item-body" style="font-size: 12px; margin-top: 4px;">${partParts.join(' | ')}</div>`;
          }
          const kullanici = toTitleCase(event.data?.surucu || '-');
          html += `<div class="history-item">
            <div class="history-item-date" style="font-weight: 600; font-size: 12px; margin-bottom: 4px;">${escapeHtml(formatDateForDisplay(event.date) || '-')}</div>
            <div class="history-item-body" style="font-size: 12px;"><span class="history-label">Kullanıcı:</span> ${escapeHtml(kullanici)}${hasarStr}</div>
            ${parcalarHtml}
            ${aciklamaHtml}
          </div>`;
        });
      }
    } else if (tabType === 'km') {
      const kmEvents = events.filter(e => e.type === 'km-revize');
      const oncelikliTalep = getLatestApprovedKmCorrection(vehicle.id, kmEvents);
      const duzeltmeNotHtml = buildKmCorrectionNoteHtml(oncelikliTalep);

      if (kmEvents.length === 0) {
        if (duzeltmeNotHtml) {
          const sentetikTarih = formatDateForDisplay(oncelikliTalep.talep_tarihi || '') || '-';
          html = `<div class="history-item"><div class="history-item-date" style="font-weight: 600; font-size: 12px; margin-bottom: 4px;">${escapeHtml(sentetikTarih)}</div>${duzeltmeNotHtml}</div>`;
        } else {
          html = '<div class="history-empty-msg" style="text-align: center; padding: 20px;">' + escapeHtml(toTitleCase('Km g\u00fcncelleme kayd\u0131 bulunmamaktad\u0131r.')) + '</div>';
        }
      } else {
        kmEvents.forEach((event, index) => {
          const eskiKm = event.data?.eskiKm || '-';
          const yeniKm = event.data?.yeniKm || '-';
          const kullaniciVal = (event.data?.surucu || '').trim();
          const kullanici = kullaniciVal
            ? toTitleCase(kullaniciVal).toLocaleUpperCase('tr-TR')
            : 'B\u0130L\u0130NM\u0130YOR';
          const kmCumle = `${escapeHtml(kullanici)}, G\u00fcncel Km: ${escapeHtml(formatNumber(yeniKm))} Olarak Bildirdi. (\u00d6nceki Km: ${escapeHtml(formatNumber(eskiKm))})`;
          html += `<div class="history-item">
            <div class="history-item-date" style="font-weight: 600; font-size: 12px; margin-bottom: 4px;">${escapeHtml(formatDateForDisplay(event.date) || '-')}</div>
            <div class="history-item-body" style="font-size: 12px; margin-top: 4px;"><span class="history-label">${kmCumle}</span></div>
            ${index === 0 ? duzeltmeNotHtml : ''}
          </div>`;
        });
      }
    } else if (tabType === 'diger') {
      const branches = readBranches();
      const digerEvents = events.filter(e => e.type !== 'bakim' && e.type !== 'kaza' && e.type !== 'km-revize');
      if (digerEvents.length === 0) {
        html = '<div class="history-empty-msg" style="text-align: center; padding: 20px;">' + escapeHtml(toTitleCase('Diğer kayıt bulunmamaktadır.')) + '</div>';
      } else {
        digerEvents.forEach(event => {
          const eventType = String(event.type || '').trim();
          const dateText = formatDateForDisplay(event.date) || '-';
          const eventData = event.data || {};
          const userRaw = eventData.kullaniciAdi || eventData.surucu || eventData.kisi || '';
          const userText = userRaw ? toTitleCase(String(userRaw)) : 'Bilinmiyor';
          let summaryText = '';
          const details = [];

          if (eventType === 'anahtar-guncelle') {
            const durum = String(eventData.durum || 'yok').toLowerCase();
            summaryText = `Yedek Anahtar\u0131 ${durum === 'var' ? 'Var' : 'Yok'} Olarak Bildirdi.`;
            const konum = (eventData.detay || '').trim();
            if (konum) details.push(`Konum: ${toTitleCase(konum)}`);
          } else if (eventType === 'lastik-guncelle') {
            const durum = String(eventData.durum || 'yok').toLowerCase();
            summaryText = `Yazl\u0131k/K\u0131\u015fl\u0131k Var ${durum === 'var' ? 'Olarak' : 'Olmad\u0131\u011f\u0131n\u0131'} Bildirdi.`;
            const adres = (eventData.adres || '').trim();
            if (adres) details.push(`Konum: ${toTitleCase(adres)}`);
          } else if (eventType === 'kasko-guncelle') {
            summaryText = 'Kasko Yenilemesi Bildirdi.';
            const bitis = formatDateForDisplay(eventData.bitisTarihi || '');
            const firma = (eventData.firma || '').trim();
            const acente = (eventData.acente || '').trim();
            if (bitis) details.push(`Biti\u015f Tarihi: ${bitis}`);
            if (firma) details.push(`Firma: ${toTitleCase(firma)}`);
            if (acente) details.push(`Acente: ${toTitleCase(acente)}`);
          } else if (eventType === 'sigorta-guncelle') {
            summaryText = 'Trafik Sigortas\u0131 Yenilemesi Bildirdi.';
            const bitis = formatDateForDisplay(eventData.bitisTarihi || '');
            const firma = (eventData.firma || '').trim();
            const acente = (eventData.acente || '').trim();
            if (bitis) details.push(`Biti\u015f Tarihi: ${bitis}`);
            if (firma) details.push(`Firma: ${toTitleCase(firma)}`);
            if (acente) details.push(`Acente: ${toTitleCase(acente)}`);
          } else if (eventType === 'muayene-guncelle') {
            summaryText = 'Muayene Yenilemesi Bildirdi.';
            const bitis = formatDateForDisplay(eventData.bitisTarihi || '');
            if (bitis) details.push(`Biti\u015f Tarihi: ${bitis}`);
          } else if (eventType === 'kullanici-atama') {
            summaryText = 'Kullan\u0131c\u0131 Atamas\u0131 Bildirdi.';
            const yeni = (eventData.kullaniciAdi || '').trim();
            const eski = (eventData.eskiKullaniciAdi || '').trim();
            if (yeni) details.push(`Yeni Kullan\u0131c\u0131: ${toTitleCase(yeni)}`);
            if (eski) details.push(`\u00d6nceki Kullan\u0131c\u0131: ${toTitleCase(eski)}`);
          } else if (eventType === 'sube-degisiklik') {
            summaryText = '\u015eube De\u011fi\u015fikli\u011fi Bildirdi.';
            const yeniRaw = eventData.yeniSubeAdi || branches.find(b => b.id === eventData.yeniSubeId)?.name || '';
            const eskiRaw = eventData.eskiSubeAdi || branches.find(b => b.id === eventData.eskiSubeId)?.name || '';
            if (yeniRaw) details.push(`Yeni \u015eube: ${toTitleCase(String(yeniRaw))}`);
            if (eskiRaw) details.push(`\u00d6nceki \u015eube: ${toTitleCase(String(eskiRaw))}`);
          } else if (eventType === 'kredi-guncelle') {
            const durum = String(eventData.durum || 'yok').toLowerCase();
            summaryText = `Kredi/Rehin ${durum === 'var' ? 'Var' : 'Yok'} Olarak Bildirdi.`;
            const detay = (eventData.detay || '').trim();
            if (detay) details.push(`Detay: ${toTitleCase(detay)}`);
          } else if (eventType === 'utts-guncelle') {
            summaryText = `UTTS ${(eventData.durum === true || eventData.durum === 'evet') ? 'Evet' : 'Hay\u0131r'} Olarak Bildirdi.`;
          } else if (eventType === 'takip-cihaz-guncelle') {
            summaryText = `Takip Cihaz\u0131 ${(eventData.durum === true || eventData.durum === 'var') ? 'Var' : 'Yok'} Olarak Bildirdi.`;
          } else if (eventType === 'not-guncelle') {
            summaryText = 'Kullan\u0131c\u0131 Notu Bildirdi.';
            const note = String(eventData.not || '').trim();
            if (note) details.push(`Not: ${note.length > 120 ? note.slice(0, 120) + '...' : note}`);
          } else if (eventType === 'satis') {
            summaryText = 'Sat\u0131\u015f/Pert Bilgisi Bildirdi.';
          } else {
            const fallbackLabel = toTitleCase(eventType || 'Di\u011fer \u0130\u015flem');
            summaryText = `${fallbackLabel} Bildirildi.`;
          }

          const firstLine = `${dateText} - "${userText}" ${summaryText}`;
          const secondLine = details.length ? details.join(' | ') : '';
          html += `<div class="history-item history-item-sube">
            <div class="history-item-date" style="font-weight: 600; font-size: 12px; margin-bottom: 4px;">${escapeHtml(firstLine)}</div>
            ${secondLine ? `<div class="history-item-body" style="font-size: 12px; margin-top: 4px;">${escapeHtml(secondLine)}</div>` : ''}
          </div>`;
        });
      }
    }

    contentEl.innerHTML = html;
  };

  /**
   * Tarihçe modal'ını kapat
   */
  window.closeVehicleHistoryModal = function() {
    const modal = DOM.vehicleHistoryModal;
    if (modal) {
      resetModalState(modal);
      if (DOM.historyContent) DOM.historyContent.innerHTML = '';
      modal.classList.remove('active');
      setTimeout(() => modal.style.display = 'none', 300);
    }
  };

  function withSaveButtonGuard(modalId, handler) {
    return function guardedSaveAction() {
      var modal = document.getElementById(modalId);
      var saveBtn = modal ? modal.querySelector('.universal-btn-save') : null;
      if (saveBtn && saveBtn.disabled) return;
      if (saveBtn) saveBtn.disabled = true;
      try {
        var result = handler.apply(this, arguments);
        if (result && typeof result.finally === 'function') {
          return result.finally(function() {
            if (saveBtn) saveBtn.disabled = false;
          });
        }
        if (saveBtn) saveBtn.disabled = false;
        return result;
      } catch (error) {
        if (saveBtn) saveBtn.disabled = false;
        throw error;
      }
    };
  }

  if (!window.__medisaSaveGuardsApplied) {
    window.assignVehicleToBranch = withSaveButtonGuard('vehicle-detail-modal', window.assignVehicleToBranch);
    window.saveBakimEvent = withSaveButtonGuard('bakim-ekle-modal', window.saveBakimEvent);
    window.saveKazaEvent = withSaveButtonGuard('kaza-ekle-modal', window.saveKazaEvent);
    window.updateSigortaInfo = withSaveButtonGuard('sigorta-guncelle-modal', window.updateSigortaInfo);
    window.updateKaskoInfo = withSaveButtonGuard('kasko-guncelle-modal', window.updateKaskoInfo);
    window.updateMuayeneInfo = withSaveButtonGuard('muayene-guncelle-modal', window.updateMuayeneInfo);
    window.updateAnahtarInfo = withSaveButtonGuard('anahtar-guncelle-modal', window.updateAnahtarInfo);
    window.updateKrediInfo = withSaveButtonGuard('kredi-guncelle-modal', window.updateKrediInfo);
    window.updateKmInfo = withSaveButtonGuard('km-guncelle-modal', window.updateKmInfo);
    window.updateLastikInfo = withSaveButtonGuard('lastik-guncelle-modal', window.updateLastikInfo);
    window.updateUTTSInfo = withSaveButtonGuard('utts-guncelle-modal', window.updateUTTSInfo);
    window.updateTakipCihazInfo = withSaveButtonGuard('takip-cihaz-guncelle-modal', window.updateTakipCihazInfo);
    window.updateKaskoKoduInfo = withSaveButtonGuard('kasko-kodu-guncelle-modal', window.updateKaskoKoduInfo);
    window.updateSubeDegisiklik = withSaveButtonGuard('sube-degisiklik-modal', window.updateSubeDegisiklik);
    window.updateKullaniciAtama = withSaveButtonGuard('kullanici-atama-modal', window.updateKullaniciAtama);
    window.saveSatisPert = withSaveButtonGuard('satis-pert-modal', window.saveSatisPert);
    window.__medisaSaveGuardsApplied = true;
  }

  /** Olay tarihini sıralama için sayıya çevir (dd.mm.yyyy veya timestamp) */
  function getEventSortTime(ev) {
    if (ev.timestamp) {
      const t = new Date(ev.timestamp).getTime();
      if (!isNaN(t)) return t;
    }
    if (!ev.date) return 0;
    const parts = String(ev.date).trim().split('.');
    if (parts.length !== 3) return 0;
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    const d = new Date(year, month, day);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  }

  /** Bildirim listesi için kısa olay tipi etiketi */
  function getNotificationEventTypeLabel(type) {
    const labels = {
      'bakim': 'Bakım',
      'kaza': 'Kaza',
      'km-revize': 'Km güncelleme',
      'anahtar-guncelle': 'Yedek anahtar',
      'lastik-guncelle': 'Lastik',
      'utts-guncelle': 'UTTS',
      'muayene-guncelle': 'Muayene güncelleme',
      'sigorta-guncelle': 'Sigorta güncelleme',
      'kasko-guncelle': 'Kasko güncelleme',
      'sube-degisiklik': 'Şube değişikliği',
      'kullanici-atama': 'Kullanıcı atama',
      'kredi-guncelle': 'Kredi/Rehin',
      'takip-cihaz-guncelle': 'Takip cihazı',
      'not-guncelle': 'Kullanıcı notu',
      'satis': 'Satış/Pert'
    };
    return labels[type] || (type ? toTitleCase(String(type)) : 'Olay');
  }

  /**
   * Bildirim satırı için "{İsim}, {Plaka} Plakalı Taşıt İçin {Olay Mesajı}." formatında metin üretir.
   */
  function getNotificationActivityMessage(ev, plate) {
    const evData = ev.data || {};
    const isim = evData.surucu || evData.kisi || evData.kullaniciAdi;
    const isimStr = isim ? toTitleCase(String(isim)) : 'Bilinmiyor';
    const plateStr = (plate || '-').toString().trim();
    const type = (ev.type || '').toString().trim();
    const typeMessages = {
      'km-revize': 'Km Bildirimi Yaptı',
      'bakim': 'Bakım Bildirimi Yaptı',
      'kaza': 'Kaza Bildirimi Yaptı',
      'sigorta-guncelle': 'Sigorta Bilgisini Güncelledi',
      'kasko-guncelle': 'Kasko Bilgisini Güncelledi',
      'muayene-guncelle': 'Muayene Bilgisini Güncelledi',
      'anahtar-guncelle': 'Yedek Anahtar Bilgisini Güncelledi',
      'lastik-guncelle': 'Lastik Durumunu Güncelledi',
      'utts-guncelle': 'UTTS Bilgisini Güncelledi',
      'kredi-guncelle': 'Kredi/Rehin Bilgisini Güncelledi',
      'takip-cihaz-guncelle': 'Takip Cihazı Bilgisini Güncelledi',
      'not-guncelle': 'Not Bilgisini Güncelledi',
      'sube-degisiklik': 'Şube Bilgisini Güncelledi',
      'kullanici-atama': 'Kullanıcı Ataması Yaptı',
      'satis': 'Satış/Pert Bildirdi'
    };
    const mesaj = typeMessages[type] || 'Bilgi Güncelledi';
    return isimStr + ', ' + plateStr + ' Plakalı Taşıt İçin ' + mesaj + '.';
  }

  /** Olay tipinden tarihçe sekme id'si (bakim, kaza, km, diger) */
  function getHistoryTabForEventType(type) {
    if (type === 'bakim') return 'bakim';
    if (type === 'kaza') return 'kaza';
    if (type === 'km-revize') return 'km';
    return 'diger';
  }

  /**
   * Bildirimleri güncelle (muayene, sigorta, kasko + kullanıcı paneli işlemleri)
   */
  window.updateNotifications = function() {
    const vehicles = readVehicles();
    const notifications = [];
    let hasRed = false; // Kırmızı bildirim var mı?
    let hasOrange = false; // Turuncu bildirim var mı?

    vehicles.forEach(vehicle => {
      if (vehicle.satildiMi) return; // Satılmış taşıtları atla

      const plate = vehicle.plate || '-';
      const brandModel = toTitleCase(vehicle.brandModel || '-');

      // Sigorta kontrolü
      if (vehicle.sigortaDate) {
        const warning = checkDateWarnings(vehicle.sigortaDate);
        if (warning.class) {
          const days = warning.days;
          const status = days < 0 ? 'geçmiş' : days <= 3 ? 'çok yakın' : 'yaklaşıyor';
          notifications.push({
            type: 'sigorta',
            vehicleId: vehicle.id,
            plate: plate,
            brandModel: brandModel,
            date: vehicle.sigortaDate,
            days: days,
            warningClass: warning.class,
            status: status
          });
          if (warning.class === 'date-warning-red') hasRed = true;
          else if (warning.class === 'date-warning-orange') hasOrange = true;
        }
      }

      // Kasko kontrolü
      if (vehicle.kaskoDate) {
        const warning = checkDateWarnings(vehicle.kaskoDate);
        if (warning.class) {
          const days = warning.days;
          const status = days < 0 ? 'geçmiş' : days <= 3 ? 'çok yakın' : 'yaklaşıyor';
          notifications.push({
            type: 'kasko',
            vehicleId: vehicle.id,
            plate: plate,
            brandModel: brandModel,
            date: vehicle.kaskoDate,
            days: days,
            warningClass: warning.class,
            status: status
          });
          if (warning.class === 'date-warning-red') hasRed = true;
          else if (warning.class === 'date-warning-orange') hasOrange = true;
        }
      }

      // Muayene kontrolü
      if (vehicle.muayeneDate) {
        const warning = checkDateWarnings(vehicle.muayeneDate);
        if (warning.class) {
          const days = warning.days;
          const status = days < 0 ? 'geçmiş' : days <= 3 ? 'çok yakın' : 'yaklaşıyor';
          notifications.push({
            type: 'muayene',
            vehicleId: vehicle.id,
            plate: plate,
            brandModel: brandModel,
            date: vehicle.muayeneDate,
            days: days,
            warningClass: warning.class,
            status: status
          });
          if (warning.class === 'date-warning-red') hasRed = true;
          else if (warning.class === 'date-warning-orange') hasOrange = true;
        }
      }
    });

    // Kullanıcı paneli işlemleri: tüm taşıtlardan son olayları topla (en yeni 15)
    const recentEvents = [];
    vehicles.forEach(vehicle => {
      if (vehicle.satildiMi) return;
      const events = vehicle.events || [];
      const plate = vehicle.plate || '-';
      const brandModel = toTitleCase(vehicle.brandModel || '-');
      events.forEach(ev => {
        recentEvents.push({
          vehicleId: vehicle.id,
          plate: plate,
          brandModel: brandModel,
          event: ev
        });
      });
    });
    recentEvents.sort((a, b) => getEventSortTime(b.event) - getEventSortTime(a.event));
    const recentSlice = recentEvents.slice(0, 15);

    // MTV hatırlatması: Ocak (0) veya Temmuz (6), ayın 21'i ve sonrası, ödeme yapılmadıysa
    let mtvHtml = '';
    const today = new Date();
    const m = today.getMonth();
    const d = today.getDate();
    const y = today.getFullYear();
    if ((m === 0 || m === 6) && d >= 21) {
      const mtvKey = 'mtv_paid_' + y + '_' + m;
      if (!localStorage.getItem(mtvKey)) {
        const mtvKeyEsc = (mtvKey || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        mtvHtml = '<div class="notification-item mtv-notification"><div class="mtv-text-container"><span class="mtv-main-text">Ayın Son Gününe Kadar MTV Ödemelerinin Yapılması Gerekmektedir.</span></div><div class="mtv-dismiss-wrapper"><button type="button" class="mtv-dismiss-btn" onclick="dismissMTVNotif(event, \'' + mtvKeyEsc + '\')" aria-label="Bildirimi Kapat"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></button><div class="mtv-tooltip">Ödeme Yapıldıysa Bildirimi Silebilirsiniz.</div></div></div>';
        hasOrange = true;
      }
    }

    // Kasko Excel hatırlatması: Liste bu aya ait değilse (Excel yüklenince veya X ile silinene kadar kırmızı kalır)
    let kaskoExcelHtml = '';
    const kaskoUploadDate = localStorage.getItem('medisa_kasko_liste_date');
    let kaskoListeGuncel = false;
    if (kaskoUploadDate) {
      const uploadDate = new Date(kaskoUploadDate);
      if (uploadDate.getMonth() === m && uploadDate.getFullYear() === y) kaskoListeGuncel = true;
    }
    if (!kaskoListeGuncel) {
      const kaskoKey = 'kasko_excel_dismiss_' + y + '_' + m;
      if (!localStorage.getItem(kaskoKey)) {
        const kaskoKeyEsc = (kaskoKey || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        kaskoExcelHtml = '<div class="notification-item kasko-excel-notification"><div class="mtv-text-container"><span class="mtv-main-text">Güncel Kasko Değer Listesinin Yüklenmesi Gerekmektedir.</span></div><div class="mtv-dismiss-wrapper"><button type="button" class="mtv-dismiss-btn" onclick="dismissKaskoExcelNotif(event, \'' + kaskoKeyEsc + '\')" aria-label="Bildirimi Kapat"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button><div class="mtv-tooltip">Kapat</div></div></div>';
        hasRed = true;
      }
    }

    // Bildirimleri güncelle
    const notifDropdown = DOM.notificationsDropdown;
    const notifIcon = document.querySelector('.icon-btn[onclick="toggleNotifications(event)"]');

    if (notifications.length === 0 && recentSlice.length === 0 && !mtvHtml && !kaskoExcelHtml) {
      if (notifDropdown) {
        notifDropdown.innerHTML = '<button disabled>Bildirim Yok</button>';
      }
      if (notifIcon) {
        notifIcon.classList.remove('notification-red', 'notification-orange', 'notification-pulse');
      }
    } else {
      let html = mtvHtml + kaskoExcelHtml;

      // Tarih uyarıları (sigorta, kasko, muayene)
      if (notifications.length > 0) {
        notifications.sort((a, b) => {
          if (a.warningClass === 'date-warning-red' && b.warningClass !== 'date-warning-red') return -1;
          if (a.warningClass !== 'date-warning-red' && b.warningClass === 'date-warning-red') return 1;
          return a.days - b.days;
        });
        notifications.forEach(notif => {
            const typeLabel = notif.type === 'sigorta' ? 'Sigorta' : notif.type === 'kasko' ? 'Kasko' : 'Muayene';
            const dateDisplay = formatDateForDisplay(notif.date);

            let messageText = '';
            if (notif.days <= 0 && notif.type === 'kasko') {
                messageText = `${notif.plate} Plakalı Taşıtın Kasko Süresi Bitmiştir.`;
            } else if (notif.days <= 0 && notif.type === 'muayene') {
                messageText = `${notif.plate} Plakalı Taşıtın Muayene Süresi Bitmiştir.`;
            } else if (notif.days < 0) {
                messageText = `${notif.plate} Plakalı Taşıtın ${typeLabel} Tarihi ${Math.abs(notif.days)} Gün Geçti.`;
            } else if (notif.days === 0) {
                messageText = `${notif.plate} Plakalı Taşıtın ${typeLabel} Tarihi Bugün Bitiyor.`;
            } else if (notif.days === 1) {
                messageText = `${notif.plate} Plakalı Taşıtın ${typeLabel} Tarihi Yarın Bitiyor.`;
            } else {
                messageText = `${notif.plate} Plakalı Taşıtın ${typeLabel} Tarihi ${notif.days} Gün Sonra Bitecek.`;
            }

            const borderColor = notif.warningClass === 'date-warning-red'
              ? 'rgba(212, 0, 0, 0.6)'
              : 'rgba(255, 140, 0, 0.6)';

            const safePlate = (notif.plate || '').replace(/"/g, '&quot;');
            const safeVid = (notif.vehicleId || '').toString().replace(/"/g, '&quot;');

            html += `<button type="button" data-plate="${safePlate}" data-vehicle-id="${safeVid}" style="width: 100%; padding: 12px; background: transparent; border: 1px solid ${borderColor}; color: #ccc; border-radius: 6px; cursor: pointer; font-weight: 500; font-size: 13px; text-align: left; margin-bottom: 4px; transition: all 0.2s ease; height: auto; white-space: normal;" class="notification-item ${notif.warningClass}-border">
            <div style="font-weight: 500; color: #fff; line-height: 1.4;">
              <span class="${notif.warningClass}">${escapeHtml(messageText)}</span>
            </div>
            <div style="font-size: 11px; color: #999; margin-top: 6px;">Son Tarih: ${escapeHtml(dateDisplay)}</div>
          </button>`;
        });
      }

      // Kullanıcı paneli işlemleri bölümü
      if (recentSlice.length > 0) {
        const viewedRaw = sessionStorage.getItem('notifViewedKeysV2');
        const viewedKeys = viewedRaw ? JSON.parse(viewedRaw) : [];
        recentSlice.forEach(item => {
          const ev = item.event;
          const dateDisplay = formatDateForDisplay(ev.date) || '-';
          const historyTab = getHistoryTabForEventType(ev.type);
          const safePlate = (item.plate || '').replace(/"/g, '&quot;');
          const safeVid = String(item.vehicleId || '').replace(/"/g, '&quot;');
          const plateNorm = (item.plate || '').toString().trim();
          const typeNorm = (ev.type || '').toString().trim();
          const notifKey = plateNorm + '|' + typeNorm + '|' + dateDisplay;
          const safeKey = notifKey.replace(/"/g, '&quot;');
          const isUnread = viewedKeys.indexOf(notifKey) === -1;
          const unreadClass = isUnread ? ' notification-unread' : '';
          const unreadStyle = isUnread ? ' border: 1px solid rgba(212, 0, 0, 0.85) !important;' : '';
          const activityMsg = getNotificationActivityMessage(ev, item.plate);
          html += `<button type="button" data-plate="${safePlate}" data-vehicle-id="${safeVid}" data-open-history="1" data-history-tab="${historyTab}" data-notif-key="${safeKey}" style="width: 100%; padding: 10px 12px; background: transparent; color: #ccc; border-radius: 6px; cursor: pointer; font-weight: 500; font-size: 12px; text-align: left; margin-bottom: 4px; transition: all 0.2s ease;${unreadStyle}" class="notification-item notification-item-activity${unreadClass}">
          <div class="notif-line1" style="font-weight: 600; color: #fff; margin-bottom: 2px;">${escapeHtml(activityMsg)}</div>
          <div class="notif-line2" style="font-size: 11px; color: #999;">${escapeHtml(dateDisplay)}</div>
        </button>`;
        });
      }

      if (notifDropdown) {
        notifDropdown.innerHTML = html;
      }

      if (notifIcon) {
        notifIcon.classList.remove('notification-red', 'notification-orange', 'notification-pulse');
        if (hasRed) {
          notifIcon.classList.add('notification-red', 'notification-pulse');
        } else if (hasOrange) {
          notifIcon.classList.add('notification-orange', 'notification-pulse');
        }
        /* Kırmızı/turuncu sadece gerçek uyarılar için (sigorta/kasko/muayene, MTV, kasko excel).
           Okunmamış aktivite bildirimleri (km, şube güncelleme vb.) simgeyi kırmızı yapmaz. */
      }
    }
  };

  window.dismissMTVNotif = function(event, key) {
    event.stopPropagation();
    event.preventDefault();

    const btn = event.currentTarget;
    const container = btn ? btn.closest('.mtv-notification') : null;
    const textSpan = container ? container.querySelector('.mtv-main-text') : null;

    // Görsel Geri Bildirim: Butonu kilitle ve metni güncelle
    if (btn) {
      btn.style.pointerEvents = 'none';
      btn.style.opacity = '0.5';
    }
    if (container) {
      container.style.cursor = 'wait';
    }
    if (textSpan) {
      textSpan.style.transition = 'all 0.3s ease';
      textSpan.innerText = 'Bildirim işleniyor, lütfen bekleyin...';
      textSpan.style.color = 'var(--txt-muted)';
    }

    localStorage.setItem(key, 'true');
    if (typeof window.updateNotifications === 'function') {
      window.updateNotifications();
    }
  };

  window.dismissKaskoExcelNotif = function(event, key) {
    event.stopPropagation();
    event.preventDefault();

    const btn = event.currentTarget;
    const container = btn ? btn.closest('.kasko-excel-notification') : null;
    const textSpan = container ? container.querySelector('.mtv-main-text') : null;

    if (btn) {
      btn.style.pointerEvents = 'none';
      btn.style.opacity = '0.5';
    }
    if (container) {
      container.style.cursor = 'wait';
    }
    if (textSpan) {
      textSpan.style.transition = 'all 0.3s ease';
      textSpan.innerText = 'Bildirim işleniyor, lütfen bekleyin...';
      textSpan.style.color = 'var(--txt-muted)';
    }

    localStorage.setItem(key, 'true');
    if (typeof window.updateNotifications === 'function') {
      window.updateNotifications();
    }
  };

  // Sayfa yüklendiğinde ve veri değiştiğinde bildirimleri güncelle
  if (typeof window !== 'undefined') {
    // İlk yüklemede
    setTimeout(() => {
      if (window.updateNotifications) window.updateNotifications();
    }, 500);

    // Veri değişikliklerini dinle (storage event)
    window.addEventListener('storage', () => {
      if (window.updateNotifications) window.updateNotifications();
    });
  }

  // === SÜTUN SÜRÜKLE-BIRAK (DRAG & DROP) HANDLER'LARI ===
  let draggedVehicleColumnKey = null;

  // Sütun başlığından sürükle başlatıldığında
  window.handleVehicleColumnDragStart = function(event, columnKey) {
    draggedVehicleColumnKey = columnKey;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', columnKey);
    
    // Tüm satırları vurgula
    const allRows = document.querySelectorAll('.list-item');
    allRows.forEach(row => {
      const cell = row.querySelector(`.list-cell.${getColumnClass(columnKey)}`);
      if (cell) {
        cell.style.opacity = '0.5';
      }
    });
    event.currentTarget.style.opacity = '0.5';
  };

  // Sütun başlığı üzerine geldiğinde
  window.handleVehicleColumnDragOver = function(event) {
    if (draggedVehicleColumnKey) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
    }
  };

  // Sütun başlığına giriş yaptığında
  window.handleVehicleColumnDragEnter = function(event) {
    if (draggedVehicleColumnKey) {
      const targetKey = event.currentTarget.dataset.col;
      if (targetKey && targetKey !== draggedVehicleColumnKey) {
        event.preventDefault();
        event.currentTarget.classList.add('drag-over');
      }
    }
  };

  // Sütun başlığından çıkış yaptığında
  window.handleVehicleColumnDragLeave = function(event) {
    event.currentTarget.classList.remove('drag-over');
  };

  // Sütun başlığına bırakıldığında
  window.handleVehicleColumnDrop = function(event, targetColumnKey) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.classList.remove('drag-over');
    
    if (!draggedVehicleColumnKey || draggedVehicleColumnKey === targetColumnKey) {
      draggedVehicleColumnKey = null;
      return;
    }

    const draggedIndex = vehicleColumnOrder.indexOf(draggedVehicleColumnKey);
    const targetIndex = vehicleColumnOrder.indexOf(targetColumnKey);
    
    if (draggedIndex !== -1 && targetIndex !== -1) {
      vehicleColumnOrder.splice(draggedIndex, 1);
      vehicleColumnOrder.splice(targetIndex, 0, draggedVehicleColumnKey);
      saveVehicleColumnOrder();
      renderVehicles(); // Listeyi yeniden render et
    }
    
    draggedVehicleColumnKey = null;
  };

  // Sütun başlığı drag bitince
  window.handleVehicleColumnDragEnd = function(event) {
    // Tüm satırları normale döndür
    const allRows = document.querySelectorAll('.list-item');
    allRows.forEach(row => {
      const cells = row.querySelectorAll('.list-cell');
      cells.forEach(cell => {
        cell.style.opacity = '1';
      });
    });
    
    // Tüm başlıkları normale döndür
    document.querySelectorAll('.list-header-row .list-cell').forEach(cell => {
      cell.style.opacity = '1';
      cell.classList.remove('drag-over');
    });
    
    draggedVehicleColumnKey = null;
  };

  // Yardımcı fonksiyon: Sütun key'inden CSS class'ını al
  function getColumnClass(columnKey) {
    const classMap = {
      'year': 'list-year',
      'plate': 'list-plate',
      'brand': 'list-brand',
      'km': 'list-km',
      'type': 'list-type',
      'user': 'list-user',
      'branch': 'list-branch'
    };
    return classMap[columnKey] || '';
  }

  // Mobil: sütun başlığı touch ile sürükle-bırak state
  let touchColumnDrag = { active: false, columnKey: null, startX: 0, startY: 0, dragging: false, lastDropTarget: null };

  function attachVehicleColumnTouchListeners(container) {
    const headerCells = container.querySelectorAll('.list-header-row .list-cell[data-col]');
    if (!headerCells.length) return;
    headerCells.forEach(function(cell) {
      const columnKey = cell.getAttribute('data-col');
      if (!columnKey) return;
      cell.addEventListener('touchstart', function(e) {
        if (e.touches.length !== 1) return;
        touchColumnDrag.active = true;
        touchColumnDrag.columnKey = columnKey;
        touchColumnDrag.startX = e.touches[0].clientX;
        touchColumnDrag.startY = e.touches[0].clientY;
        touchColumnDrag.dragging = false;
        touchColumnDrag.lastDropTarget = null;
        const allRows = container.querySelectorAll('.list-item');
        allRows.forEach(function(row) {
          const c = row.querySelector('.list-cell.' + getColumnClass(columnKey));
          if (c) c.style.opacity = '0.5';
        });
        cell.style.opacity = '0.5';
      }, { passive: true });
      cell.addEventListener('touchmove', function(e) {
        if (!touchColumnDrag.active || e.touches.length !== 1) return;
        const x = e.touches[0].clientX;
        const y = e.touches[0].clientY;
        const dx = Math.abs(x - touchColumnDrag.startX);
        const dy = Math.abs(y - touchColumnDrag.startY);
        if (!touchColumnDrag.dragging && (dx > 10 || dy > 10)) {
          touchColumnDrag.dragging = true;
        }
        if (touchColumnDrag.dragging) {
          e.preventDefault();
          const under = document.elementFromPoint(x, y);
          const headerCell = under && under.closest('.list-header-row .list-cell[data-col]');
          const targetKey = headerCell ? headerCell.getAttribute('data-col') : null;
          container.querySelectorAll('.list-header-row .list-cell').forEach(function(c) {
            c.classList.toggle('drag-over', c === headerCell && targetKey && targetKey !== touchColumnDrag.columnKey);
          });
          touchColumnDrag.lastDropTarget = (targetKey && targetKey !== touchColumnDrag.columnKey) ? targetKey : null;
        }
      }, { passive: false });
      function endTouch() {
        if (!touchColumnDrag.active) return;
        const sourceKey = touchColumnDrag.columnKey;
        const targetKey = touchColumnDrag.lastDropTarget;
        container.querySelectorAll('.list-header-row .list-cell').forEach(function(c) {
          c.style.opacity = '1';
          c.classList.remove('drag-over');
        });
        container.querySelectorAll('.list-item .list-cell').forEach(function(c) {
          c.style.opacity = '1';
        });
        touchColumnDrag.active = false;
        touchColumnDrag.columnKey = null;
        touchColumnDrag.dragging = false;
        touchColumnDrag.lastDropTarget = null;
        if (sourceKey && targetKey) {
          const draggedIndex = vehicleColumnOrder.indexOf(sourceKey);
          const targetIndex = vehicleColumnOrder.indexOf(targetKey);
          if (draggedIndex !== -1 && targetIndex !== -1) {
            vehicleColumnOrder.splice(draggedIndex, 1);
            vehicleColumnOrder.splice(targetIndex, 0, sourceKey);
            saveVehicleColumnOrder();
            renderVehicles();
          }
        }
      }
      cell.addEventListener('touchend', endTouch, { passive: true });
      cell.addEventListener('touchcancel', endTouch, { passive: true });
    });
  }

  // kayit.js deleteVehicle sonrası liste yenilemesi için global erişim
  window.renderVehicles = renderVehicles;

  // Taşıt detay: muayene tooltip (hover ile açık kalır, gecikmeli kapatma) + ünlem/link tıklama
  let muayeneTooltipCloseTimeout = null;
  function openVehicleTypePickerFromDetail() {
    const vehicleId = window.currentDetailVehicleId;
    if (vehicleId) {
      window.vehicleTypePickerFromDetail = vehicleId;
      const picker = document.getElementById('vehicle-type-picker-overlay');
      if (picker) {
        picker.style.display = 'flex';
        picker.setAttribute('aria-hidden', 'false');
      }
    }
  }
  document.addEventListener('mouseover', function(e) {
    const wrap = e.target.closest('#vehicle-detail-modal .detail-row-muayene-no-type .detail-muayene-value-wrap');
    if (!wrap) return;
    if (muayeneTooltipCloseTimeout) {
      clearTimeout(muayeneTooltipCloseTimeout);
      muayeneTooltipCloseTimeout = null;
    }
    const tooltip = wrap.querySelector('.muayene-detail-tooltip');
    if (tooltip) {
      tooltip.classList.add('visible');
      tooltip.hidden = false;
    }
  });
  document.addEventListener('mouseout', function(e) {
    const wrap = e.target.closest('#vehicle-detail-modal .detail-row-muayene-no-type .detail-muayene-value-wrap');
    if (!wrap) return;
    if (e.relatedTarget && wrap.contains(e.relatedTarget)) return;
    muayeneTooltipCloseTimeout = setTimeout(function() {
      muayeneTooltipCloseTimeout = null;
      const tooltip = wrap.querySelector('.muayene-detail-tooltip');
      if (tooltip) {
        tooltip.classList.remove('visible');
        tooltip.hidden = true;
      }
    }, 220);
  });
  document.addEventListener('click', function(e) {
    const modal = e.target.closest('#vehicle-detail-modal');
    if (!modal) return;
    const exclamation = e.target.closest('.muayene-detail-exclamation');
    const link = e.target.closest('.muayene-detail-tooltip-link');
    if (exclamation) {
      e.preventDefault();
      e.stopPropagation();
      const wrap = exclamation.closest('.detail-muayene-value-wrap');
      const tooltip = wrap && wrap.querySelector('.muayene-detail-tooltip');
      if (tooltip) {
        tooltip.classList.remove('visible');
        tooltip.hidden = true;
      }
      openVehicleTypePickerFromDetail();
      return;
    }
    if (link) {
      e.preventDefault();
      e.stopPropagation();
      const wrap = link.closest('.detail-muayene-value-wrap');
      const tooltip = wrap && wrap.querySelector('.muayene-detail-tooltip');
      if (tooltip) {
        tooltip.classList.remove('visible');
        tooltip.hidden = true;
      }
      openVehicleTypePickerFromDetail();
      return;
    }
    // Dışarı tıklanınca tooltip kapat
    if (!e.target.closest('.muayene-detail-tooltip-wrap') && !e.target.closest('.muayene-detail-exclamation')) {
      modal.querySelectorAll('.muayene-detail-tooltip.visible').forEach(function(t) {
        t.classList.remove('visible');
        t.hidden = true;
      });
    }
  }, true);

})();
