/* =========================================
   TAŞITLAR MODÜLÜ - SABİT HEADER / DİNAMİK TOOLBAR
   ========================================= */

(function() {
  const BRANCHES_KEY = "medisa_branches_v1";
  const VEHICLES_KEY = "medisa_vehicles_v1";
  const USERS_KEY = "medisa_users_v1";

  // Veri okuma: önce data-manager ortak getter, yoksa storage/localStorage
  function readBranches() {
    if (typeof window.getMedisaBranches === 'function') return window.getMedisaBranches();
    if (window.__medisaBranchesStorage) return window.__medisaBranchesStorage.read();
    try { return JSON.parse(localStorage.getItem(BRANCHES_KEY) || '[]'); } catch { return []; }
  }

  function readVehicles() {
    if (typeof window.getMedisaVehicles === 'function') return window.getMedisaVehicles();
    if (window.__medisaVehiclesStorage) return window.__medisaVehiclesStorage.read();
    try { return JSON.parse(localStorage.getItem(VEHICLES_KEY) || '[]'); } catch { return []; }
  }

  function readUsers() {
    if (typeof window.getMedisaUsers === 'function') return window.getMedisaUsers();
    if (window.__medisaUsersStorage) return window.__medisaUsersStorage.read();
    try { return JSON.parse(localStorage.getItem(USERS_KEY) || '[]'); } catch { return []; }
  }

  let kaportaSvgCache = null;
  function getKaportaSvg() {
    if (!kaportaSvgCache) kaportaSvgCache = fetch('icon/kaporta.svg').then(function(r) { return r.text(); });
    return kaportaSvgCache;
  }

  function writeVehicles(arr) {
    if (window.__medisaVehiclesStorage) {
        window.__medisaVehiclesStorage.write(arr);
    } else {
        localStorage.setItem(VEHICLES_KEY, JSON.stringify(arr));
    }
    
    // window.appData'yı güncelle ve sunucuya kaydet
    if (window.appData) {
      window.appData.tasitlar = arr;
      // Sunucuya kaydet (async, hata durumunda sessizce devam et)
      if (window.saveDataToServer) {
        window.saveDataToServer().catch(err => {
          console.error('Sunucuya kaydetme hatası (sessiz):', err);
        });
      }
    }
  }

  // Global State
  let currentView = 'dashboard'; // 'dashboard' | 'list'
  let activeBranchId = null; // null = dashboard, 'all' = tümü, 'id' = şube
  let viewMode = 'card'; 
  let sortColumn = null; // 'year', 'brand', 'km', 'type', 'branch'
  let sortDirection = 'asc'; // 'asc' | 'desc'
  let currentFilter = 'az'; // 'az' | 'newest' | 'oldest' | 'type' (liste filtre dropdown)
  let transmissionFilter = ''; // '' | 'otomatik' | 'manuel' (şanzıman filtresi)
  
  // Sütun Sıralaması State
  let vehicleColumnOrder = ['year', 'plate', 'brand', 'km', 'type', 'user', 'branch']; // Varsayılan sıralama
  
  // Sütun sıralamasını localStorage'dan yükle
  function loadVehicleColumnOrder() {
    try {
      const saved = localStorage.getItem('vehicle_column_order');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Tüm sütunların mevcut olduğunu kontrol et
        const allColumns = ['year', 'plate', 'brand', 'km', 'type', 'user', 'branch'];
        const validOrder = parsed.filter(col => allColumns.includes(col));
        // Eksik sütunları ekle
        allColumns.forEach(col => {
          if (!validOrder.includes(col)) {
            validOrder.push(col);
          }
        });
        vehicleColumnOrder = validOrder;
      }
    } catch (e) {
      vehicleColumnOrder = ['year', 'plate', 'brand', 'km', 'type', 'user', 'branch'];
    }
  }
  
  // Sütun sıralamasını localStorage'a kaydet
  function saveVehicleColumnOrder() {
    try {
      localStorage.setItem('vehicle_column_order', JSON.stringify(vehicleColumnOrder));
    } catch (e) {
      // Sessizce devam et
    }
  }

  // Grid genişlikleri sütun kimliğine göre (sürükle-bırak sonrası genişlik doğru sütunla kalsın)
  function getVehicleColumnWidths(columnOrder) {
    const defaultCols = '32px 70px 3.2fr 60px 65px 1.8fr 2fr';
    try {
      if (!columnOrder || !Array.isArray(columnOrder) || columnOrder.length === 0) return defaultCols;
      const isMobile = typeof window !== 'undefined' && window.innerWidth <= 640;
      const widthMap = isMobile
        ? {
            'year': '30px',
            'plate': '62px',
            'brand': '2.55fr',
            'km': '52px',
            'user': '1.7fr',
            'branch': '2.65fr'
          }
        : {
            'year': '32px',
            'plate': '70px',
            'brand': '3.2fr',
            'km': '60px',
            'type': '65px',
            'user': '1.8fr',
            'branch': '2fr'
          };
      return columnOrder.map(key => widthMap[key] || '1fr').join(' ');
    } catch (e) {
      return defaultCols;
    }
  }

  /**
   * Mobil taşıt listesi: başlıklar tek punto, en fazla 1.5pt küçülebilir (biri sığmazsa hepsi küçülür).
   * listContainer içindeki .list-header-row üzerinde --list-header-font-size ayarlar.
   */
  function applyMobileListHeaderFontSize(listContainer) {
    const headerRow = listContainer && listContainer.querySelector('.list-header-row');
    if (!headerRow) return;
    const baseSize = 15; /* +1pt (14 → 15) */
    const minSize = 13.5; /* 15 - 1.5pt */
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
  }

  // Liste Marka/Model: kelimelerin sadece ilk harfi büyük (title case)
  function toTitleCase(str) {
    if (!str || str === '-') return str;
    return str.split(/\s+/).map(function(w) {
      if (!w) return w;
      return w.charAt(0).toLocaleUpperCase('tr-TR') + w.slice(1).toLocaleLowerCase('tr-TR');
    }).join(' ');
  }

  // Global Detail Vehicle ID (HTML onclick erişimi için)
  window.currentDetailVehicleId = null;

  // DOM Elements
  const modalContent = document.getElementById('vehicles-modal-content');
  
  // Taşıt listesi tıklama delegasyonu (card/list-item tıklanınca detay aç) - tek seferlik
  if (modalContent && !modalContent._vehicleClickBound) {
    modalContent._vehicleClickBound = true;
    function handleVehicleRowClick(e) {
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

  // Mobil: pencere boyutu değişince başlık font-size tekrar hesaplansın
  if (modalContent && !modalContent._headerResizeBound) {
    modalContent._headerResizeBound = true;
    window.addEventListener('resize', function () {
      if (window.innerWidth <= 640 && modalContent.querySelector('.list-header-row')) {
        applyMobileListHeaderFontSize(modalContent);
      }
    });
  }

  // Toolbar Container Oluştur (Eğer yoksa)
  function ensureToolbar() {
    const modalContainer = document.querySelector('#vehicles-modal .modal-container');
    const header = document.querySelector('#vehicles-modal .modal-header');
    
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
    let filterDrop = document.getElementById('filter-dropdown');
    if (!filterDrop && modalContainer) {
        filterDrop = document.createElement('div');
        filterDrop.id = 'filter-dropdown';
        filterDrop.innerHTML = `
            <button type="button" class="filter-dropdown-btn" data-filter="az">A-Z Sıralı</button>
            <button type="button" class="filter-dropdown-btn" data-filter="newest">En Yeni</button>
            <button type="button" class="filter-dropdown-btn" data-filter="oldest">En Eski</button>
            <button type="button" class="filter-dropdown-btn" data-filter="type">Tipe Göre</button>
        `;
        filterDrop.querySelectorAll('.filter-dropdown-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                currentFilter = this.dataset.filter || 'az';
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
                renderVehicles(document.getElementById('v-search-input')?.value || '');
            });
        });
        modalContainer.appendChild(filterDrop);
    }
    
    return { toolbar };
  }

  // --- ANA GİRİŞ ---
  window.openVehiclesView = function() {
    const openView = () => {
      loadVehicleColumnOrder(); // Sütun sıralamasını yükle
      const modal = document.getElementById('vehicles-modal');
      if (modal) {
        modal.style.display = 'flex';
        requestAnimationFrame(() => modal.classList.add('active'));
        ensureToolbar();
        renderBranchDashboard();
      }
    };
    if (typeof window.loadDataFromServer === 'function') {
      window.loadDataFromServer().then(openView).catch(openView);
    } else {
      openView();
    }
  };

  window.closeVehiclesModal = function(event) {
    // Event propagation'ı durdur (overlay click'i engelle)
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    
    const modal = document.getElementById('vehicles-modal');
    if (modal) {
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
                <button class="vt-icon-btn search-toggle-btn" onclick="toggleSearchBox('global')" title="Genel Arama">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.35-4.35"></path></svg>
                </button>
                <button class="vt-icon-btn" onclick="openArchiveView()" title="Arşiv">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="5" rx="1"></rect><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"></path><path d="M10 12h4"></path></svg>
                </button>
            </div>
        `;
    } else {
        // DETAY MODU: Solda Geri+İsim, Sağda Yerel Arama/Filtre/Görünüm
        toolbar.innerHTML = `
            <div class="vt-left">
                <button class="vt-back-btn" onclick="renderBranchDashboard()">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                </button>
                ${title ? `<span class="active-branch-title">${escapeHtml(title)}</span>` : ''}
            </div>
            <div class="vt-right">
                <div id="v-search-container" class="v-search-container">
                    <input type="text" id="v-search-input" class="v-search-input" placeholder="Plaka, marka, kullanıcı ara..." oninput="handleSearch(this.value)">
                </div>
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
                <button class="vt-icon-btn search-toggle-btn" onclick="toggleSearchBox('local')" title="Ara">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.35-4.35"></path></svg>
                </button>
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
      <div class="branch-card all-card" onclick="openBranchList('all', 'Taşıtlar')">
        <div class="branch-name">TÜMÜ</div>
        <div class="branch-count">${activeVehicles.length} Taşıt</div>
      </div>
    `;

    // 2. Şube Kartları — sadece aktif taşıtlar (Map ile O(n) sayım)
    const countByBranch = new Map();
    let unassignedCount = 0;
    activeVehicles.forEach(v => {
        if (!v.branchId) { unassignedCount++; }
        else { countByBranch.set(v.branchId, (countByBranch.get(v.branchId) || 0) + 1); }
    });
    branches.forEach(branch => {
        html += createBranchCard(branch.id, branch.name, countByBranch.get(branch.id) || 0);
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
    // Tam şube adı gösterilir; kutu içinde 2 satır, satır başına 9 karakter sığacak şekilde CSS ile sarılır (kesme/ellipsis yok)
    const unassignedClass = isUnassigned ? ' unassigned-branch-card' : '';
    return `
      <div class="branch-card${unassignedClass}" onclick="openBranchList('${id}', '${escapeHtml(name)}')">
        <div class="branch-name" title="${escapeHtml(name)}">${escapeHtml(name)}</div>
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
      const listContainer = document.getElementById('vehicles-modal-content') || modalContent;
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
            vehicles = vehicles.filter(v => v.branchId === activeBranchId);
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
      const isMobileList = window.innerWidth <= 640;
      // Mobilde Taşıt Tipi sütununu göstermiyoruz (yer kaplamasın)
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
              'user': { label: isMobileList ? 'Kull.' : 'Kullanıcı', class: 'list-user' },
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

    // Şube isimlerini al (Tümü görünümü için)
    const branches = readBranches() || [];
    const getBranchName = (branchId) => {
      if (!branchId) return '';
      const branch = branches.find(b => b.id === branchId);
      return branch ? branch.name : '';
    };

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
          'user': { label: isMobile ? 'Kull.' : 'Kullanıcı', class: 'list-user' },
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
          const branchName = getBranchName(v.branchId);
          thirdLine = branchName || '';
        } else {
          thirdLine = v.tahsisKisi || '';
        }
        const satildiSpan = isArchive ? ' <span style="color:#e1061b;font-size:12px;">(SATILDI)</span>' : '';

        // Tahsis edilmemiş taşıtlar için kırmızı class (liste ve kartta her zaman)
        const isUnassigned = !v.branchId;
        const unassignedClass = isUnassigned ? ' unassigned-vehicle-card' : '';
        
        if (viewMode === 'card') {
            // Üçüncü satır boşsa div'i render etme
            const thirdLineHtml = thirdLine ? `<div class="card-third-line" title="${escapeHtml(thirdLine)}">${escapeHtml(thirdLine)}</div>` : '';
            const vid = v.id != null ? String(v.id).replace(/"/g, '&quot;') : '';
            return `
              <div class="card${unassignedClass}" data-vehicle-id="${vid}" style="cursor:pointer">
                <div class="card-plate">${escapeHtml(plate)}${satildiSpan}</div>
                <div class="card-brand-model" title="${escapeHtml(brandModel)}">${escapeHtml(toTitleCase(brandModel))}</div>
                ${thirdLineHtml}
              </div>
            `;
        } else {
            // Liste görünümü: Sıralamaya göre dinamik
            const kmValue = v.guncelKm || v.km;
            const kmLabel = kmValue ? formatNumber(kmValue) : '-';
            const vehicleTypeLabel = v.vehicleType || '-';
            const branchLabel = getBranchName(v.branchId) || 'Tahsis Edilmemiş';
            
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
                  cellContent = escapeHtml(plate);
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
                  const assignedUser = v.assignedUserId ? users.find(u => u.id === v.assignedUserId) : null;
                  const userName = assignedUser?.isim || v.tahsisKisi || '-';
                  if (isMobile && userName && userName.trim()) {
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
      
      // Mobil: başlıklar tek punto, en fazla 1.5pt küçülebilir (biri sığmazsa hepsi küçülür)
      if (viewMode === 'list' && window.innerWidth <= 640) {
          applyMobileListHeaderFontSize(listContainer);
      }
      
      // Mobil: sütun başlıklarına touch ile sürükle-bırak (yer değiştirme)
      if (viewMode === 'list') {
          attachVehicleColumnTouchListeners(listContainer);
      }
    } catch (error) {
      console.error('renderVehicles hatası:', error);
      const target = document.getElementById('vehicles-modal-content') || modalContent;
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

    const modal = document.getElementById('vehicle-detail-modal');
    if (!modal) return;

    const contentEl = document.getElementById('vehicle-detail-content');
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
        plateEl.innerHTML = `${escapeHtml(vehicle.plate || '-')} <span style="color: #e1061b; font-size: 16px; margin-left: 8px;">SATILDI</span>`;
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
          plateEl.innerHTML = `${escapeHtml(vehicle.plate || '-')} <span style="color: #e1061b; font-size: 16px; margin-left: 8px;">SATILDI</span>`;
        } else {
          plateEl.textContent = vehicle.plate || '-';
        }
      }
    }

    // Marka Model satırına butonları ekle (Olay Ekle solda, Marka/Model ortada, Tarihçe sağda)
    const brandYearRow = contentEl.querySelector('.detail-brand-year-row');
    const brandYearEl = contentEl.querySelector('.detail-brand-year');
    
    if (brandYearRow && brandYearEl) {
      const brandModel = vehicle.brandModel || '-';
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

      // Geri butonu oluştur
      const backBtn = document.createElement('button');
      backBtn.className = 'detail-back-btn vt-back-btn';
      backBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
      `;
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
      toolbarLeft.appendChild(backBtn);

      const backLabelSpan = document.createElement('span');
      backLabelSpan.className = 'active-branch-title';
      backLabelSpan.textContent = backLabel;
      toolbarLeft.appendChild(backLabelSpan);
      
      // Orta taraf (tahsis butonu - sadece tahsis edilmemiş taşıtlar için)
      const toolbarCenter = document.createElement('div');
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
      
      // Sağ taraf (boş - denge için)
      const toolbarRight = document.createElement('div');
      toolbarRight.style.width = '20px'; // Geri butonu ile aynı genişlik (denge için)
      
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
          <div class="assign-buttons">
            <button class="assign-save-btn" onclick="assignVehicleToBranch('${vehicleId}')">Kaydet</button>
            <button class="assign-cancel-btn" onclick="closeVehicleDetailModal()">Vazgeç</button>
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
    });
    };
    if (typeof window.loadDataFromServer === 'function') {
      window.loadDataFromServer().then(runDetail).catch(runDetail);
    } else {
      runDetail();
    }
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
    const eskiSube = branches.find(b => b.id === eskiSubeId);
    const yeniSube = branches.find(b => b.id === branchId);

    if (!vehicle.events) vehicle.events = [];
    vehicle.events.unshift({
      id: Date.now().toString(),
      type: 'sube-degisiklik',
      date: formatDateForDisplay(new Date()),
      timestamp: new Date().toISOString(),
      data: {
        eskiSubeId: eskiSubeId,
        yeniSubeId: branchId,
        eskiSubeAdi: eskiSube?.name || '',
        yeniSubeAdi: yeniSube?.name || ''
      }
    });

    vehicle.branchId = branchId;
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
      'sube-degisiklik-modal',
      'satis-pert-modal'
    ];
    
    modalIds.forEach(id => {
      const modal = document.getElementById(id);
      if (modal) {
        modal.classList.remove('active', 'open');
        modal.style.display = 'none';
      }
    });
  };

  // --- Taşıt Detay Modalını Kapat ---
  window.closeVehicleDetailModal = function() {
    const modal = document.getElementById('vehicle-detail-modal');
    if (modal) {
      modal.classList.remove('active');
      setTimeout(() => modal.style.display = 'none', 300);
    }
  };

  // --- ARAMA İŞLEMLERİ ---
  let searchMode = 'local'; // 'global' or 'local'

  window.toggleSearchBox = function(mode) {
      searchMode = mode;
      const box = document.getElementById('v-search-container');
      const input = document.getElementById('v-search-input');
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
      const box = document.getElementById('v-search-container');
      if (box) box.classList.remove('open');
      const input = document.getElementById('v-search-input');
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
      const box = document.getElementById('v-search-container');
      if (!box || !box.classList.contains('open')) return;
      if (e.target.closest('#v-search-container') || e.target.closest('.search-toggle-btn')) return;
      closeSearchBox();
  });
  // Esc: arama açıkken kapat
  document.addEventListener('keydown', function(e) {
      if (e.key !== 'Escape') return;
      const box = document.getElementById('v-search-container');
      if (!box || !box.classList.contains('open')) return;
      closeSearchBox();
  });

  window.setTransmissionFilter = function(val) {
      transmissionFilter = (val === 'otomatik' || val === 'manuel') ? val : '';
  };

  window.toggleTransmissionMenu = function(ev) {
      if (ev) ev.stopPropagation();
      var dd = document.getElementById('v-transmission-dropdown');
      if (!dd) return;
      var isOpen = dd.classList.contains('open');
      closeTransmissionMenu();
      if (!isOpen) {
          closeSearchBox();
          closeFilterMenu();
          dd.classList.add('open');
          dd.setAttribute('aria-hidden', 'false');
          var opts = dd.querySelectorAll('.v-transmission-option');
          var labels = { '': 'Tümü', 'otomatik': 'Otomatik', 'manuel': 'Manuel' };
          opts.forEach(function(btn) {
              btn.onclick = function() {
                  var val = btn.getAttribute('data-value') || '';
                  setTransmissionFilter(val);
                  opts.forEach(function(b) {
                      var v = b.getAttribute('data-value') || '';
                      b.classList.toggle('active', v === val);
                      b.textContent = (v === val ? '✓ ' : '') + labels[v];
                  });
                  closeTransmissionMenu();
                  if (searchMode === 'local') {
                      renderVehicles(document.getElementById('v-search-input') && document.getElementById('v-search-input').value || '');
                  } else {
                      handleSearch(document.getElementById('v-search-input') && document.getElementById('v-search-input').value || '');
                  }
              };
          });
      }
  };

  window.closeTransmissionMenu = function() {
      var dd = document.getElementById('v-transmission-dropdown');
      if (dd) {
          dd.classList.remove('open');
          dd.setAttribute('aria-hidden', 'true');
      }
  };

  window.handleSearch = function(val) {
      if (searchMode === 'local') {
          // Yerel Arama (Mevcut listeyi filtrele)
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
                  <h4>${escapeHtml(v.brandModel)}</h4>
                  <span>${v.year} • ${v.tahsisKisi || 'Boşta'}</span>
                </div>
              </div>
          `}).join('') + `</div>`;
          
          modalContent.innerHTML = html;
      }
  };

  // --- FİLTRE DROPDOWN ---
  window.closeFilterMenu = function() {
      const fd = document.getElementById('filter-dropdown');
      if (fd) fd.classList.remove('open');
  };

  window.toggleFilterMenu = function(e) {
      if (e) e.stopPropagation();
      const fd = document.getElementById('filter-dropdown');
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
      const fd = document.getElementById('filter-dropdown');
      const filterBtn = document.querySelector('.vt-icon-btn[onclick*="toggleFilterMenu"]');
      const transWrap = e.target.closest('.v-transmission-wrap');
      const transDd = document.getElementById('v-transmission-dropdown');

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
    renderVehicles(document.getElementById('v-search-input')?.value || '');
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
          const branch = branches.find(b => b.id === branchId);
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
      renderVehicles(document.getElementById('v-search-input')?.value || '');
  };

  function formatDateShort(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    return `${parts[2]}.${parts[1]}.${parts[0].substring(2)}`;
  }

  // --- VEHICLE DETAIL - NEW FUNCTIONS ---

  /**
   * Tarih uyarı kontrolü (3 hafta turuncu, 3 gün kırmızı)
   */
  function checkDateWarnings(dateString) {
    if (!dateString) return { class: '', days: null };
    
    // YYYY-MM-DD formatından parse et
    const date = new Date(dateString + 'T00:00:00');
    if (isNaN(date.getTime())) return { class: '', days: null };
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);
    
    const diffTime = date - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) {
      // Geçmiş tarih - kırmızı
      return { class: 'date-warning-red', days: diffDays };
    } else if (diffDays <= 3) {
      // 3 gün veya daha az - kırmızı
      return { class: 'date-warning-red', days: diffDays };
    } else if (diffDays <= 21) {
      // 3 hafta veya daha az - turuncu
      return { class: 'date-warning-orange', days: diffDays };
    }
    
    return { class: '', days: diffDays };
  }

  /**
   * Tarihi gg/aa/yyyy formatına çevirir
   */
  function formatDateForDisplay(dateStr) {
    if (!dateStr) return '';
    
    // Eğer Date objesi ise string'e çevir
    if (dateStr instanceof Date) {
      const day = String(dateStr.getDate()).padStart(2, '0');
      const month = String(dateStr.getMonth() + 1).padStart(2, '0');
      const year = dateStr.getFullYear();
      return `${day}/${month}/${year}`;
    }
    
    // String değilse string'e çevir
    const str = String(dateStr);
    
    // YYYY-MM-DD formatından parse et
    if (str.includes('-')) {
      const parts = str.split('-');
      if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
    }
    
    // Zaten gg/aa/yyyy formatındaysa olduğu gibi döndür
    if (str.includes('/')) {
      return str;
    }
    
    return str;
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

  /**
   * /**
 * Sol kolon render (Taşıt özellikleri + Kaporta Şeması)
 */
function renderVehicleDetailLeft(vehicle) {
  const leftEl = document.querySelector('#vehicle-detail-content .vehicle-detail-left');
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
      (branches.find(b => b.id === branchId)?.name || '') :
      'Tahsis Edilmemiş';
  html += `<div class="detail-row detail-row-inline"><div class="detail-row-header"><span class="detail-row-label">Şube</span><span class="detail-row-colon">:</span></div><span class="detail-row-value"> ${escapeHtml(branchName)}</span></div>`;

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
          html += `${escapeHtml(record.date)} - ${escapeHtml(record.amount)}`;
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
    const rightEl = document.querySelector('#vehicle-detail-content .vehicle-detail-right');
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
    
    // Notlar (kayıt formundan)
    const notes = vehicle.notes || '';
    html += `<div class="detail-row detail-row-block"><div class="detail-row-header"><span class="detail-row-label">Notlar</span><span class="detail-row-colon">:</span></div><span class="detail-row-value">${notes ? escapeHtml(notes) : '-'}</span></div>`;

    // Sürücü notu (kullanıcı panelinden; son kayıt)
    const sonNot = vehicle.sonEkstraNot || '';
    const sonNotDonem = vehicle.sonEkstraNotDonem || '';
    const notDisplay = sonNot ? escapeHtml(sonNot) : '-';
    const notDonemDisplay = sonNotDonem ? ` (${escapeHtml(sonNotDonem)})` : '';
    html += `<div class="detail-row detail-row-block"><div class="detail-row-header"><span class="detail-row-label">Sürücü Notu</span><span class="detail-row-colon">:</span></div><span class="detail-row-value">${notDisplay}${notDonemDisplay}</span></div>`;
    
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

    getKaportaSvg().then(function(svgText) {
        const parser = new DOMParser();
        const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
        const svg = svgDoc.querySelector('svg');

        if (!svg) return;

        container.innerHTML = '';

        // Şema genişliği: sol grid içinde, sol kolon genişliğine göre requestAnimationFrame ile uyarlanır (yatay -4px, dikey -8px küçültme)
        const svgOrgWidth = 148;
        const svgOrgHeight = 220;
        const shrinkX = 4;
        const shrinkY = 8;
        const defaultTargetWidth = 220 - shrinkX;
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

        // SVG'yi hazırla
        const svgClone = svg.cloneNode(true);
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
              part.setAttribute('fill', '#e1061b');
              part.style.fill = '#e1061b';
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
          <div class="boya-legend-item"><span class="boya-legend-dot" style="background:#e1061b;"></span> Değişen</div>
        `;
        container.appendChild(legend);

        // Sol kolon genişliğine göre şema büyüklüğünü uyarla (sol grid içinde; yatay -4px, dikey -8px)
        requestAnimationFrame(function alignSchemaToLeftColumn() {
          const leftCol = document.querySelector('#vehicle-detail-modal .vehicle-detail-left');
          if (leftCol && container.isConnected) {
            const leftRect = leftCol.getBoundingClientRect();
            const padding = 16;
            const availableWidth = Math.max(0, leftRect.width - padding);
            const minW = 160;
            const maxW = 380;
            const clamped = Math.max(minW, Math.min(maxW, Math.round(availableWidth)));
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
        'utts-guncelle-modal', 'takip-cihaz-guncelle-modal', 'sube-degisiklik-modal',
        'kullanici-atama-modal', 'satis-pert-modal'
      ];
      allEventModals.forEach(modalId => {
        const modal = document.getElementById(modalId);
        if (modal && modal.classList.contains('active')) {
          modal.classList.remove('active');
          modal.style.display = 'none';
        }
      });
      
      const modal = document.getElementById('event-menu-modal');
      if (!modal) return;
      
      const menuList = document.getElementById('event-menu-list');
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
        { id: 'sube', label: 'Şube Değişikliği Bilgisi Güncelle' },
        { id: 'kullanici', label: 'Kullanıcı Atama/Değişikliği Bilgisi Güncelle' },
        { id: 'satis', label: 'Satış/Pert Bildirimi Yap' }
      ];
      
      menuList.innerHTML = events.map(event => {
        const isKaza = event.id === 'kaza';
        const isSatis = event.id === 'satis';
        const borderColor = (isKaza || isSatis) ? '#e1061b' : 'rgba(255, 255, 255, 0.3)';
        const textColor = (isKaza || isSatis) ? '#e1061b' : '#ccc';
        const borderWidth = (isKaza || isSatis) ? '0.3px' : '1px';
        return `<button onclick="event.stopPropagation(); event.preventDefault(); openEventModal('${event.id}', '${window.currentDetailVehicleId || vehicleId || ''}');" style="width: 100%; padding: 12px; background: transparent; border: ${borderWidth} solid ${borderColor}; color: ${textColor}; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 14px; text-align: left;">${event.label}</button>`;
      }).join('');
      
      modal.style.display = 'flex';
      requestAnimationFrame(() => modal.classList.add('active'));
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
        const radioBtns = modal.querySelectorAll('.radio-btn');
        const detayWrapper = document.getElementById('anahtar-detay-wrapper');
        const detayInput = document.getElementById('anahtar-detay-event');
        
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
        const radioBtns = modal.querySelectorAll('.radio-btn');
        const detayWrapper = document.getElementById('kredi-detay-wrapper-event');
        const detayInput = document.getElementById('kredi-detay-event');
        
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
        const radioBtns = modal.querySelectorAll('.radio-btn');
        const adresWrapper = document.getElementById('lastik-adres-wrapper-event');
        const adresInput = document.getElementById('lastik-adres-event');
        
        // Mevcut değerleri yükle
        const vehicle = readVehicles().find(v => String(v.id) === String(vehicleId || window.currentDetailVehicleId));
        if (vehicle) {
          if (vehicle.lastikDurumu === 'var') {
            const varBtn = Array.from(radioBtns).find(btn => btn.dataset.value === 'var');
            if (varBtn) {
              varBtn.classList.add('active', 'green');
              if (adresWrapper) adresWrapper.style.display = 'block';
              if (adresInput && vehicle.lastikAdres) adresInput.value = vehicle.lastikAdres;
            }
          } else {
            const yokBtn = Array.from(radioBtns).find(btn => btn.dataset.value === 'yok');
            if (yokBtn) yokBtn.classList.add('active');
          }
        } else {
          // Varsayılan olarak "Yok" seçili
          const yokBtn = Array.from(radioBtns).find(btn => btn.dataset.value === 'yok');
          if (yokBtn) yokBtn.classList.add('active');
        }
        
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
        // UTTS modal'ında mevcut değeri yükle (click handler HTML onclick ile)
        const radioBtns = modal.querySelectorAll('.radio-btn');
        const vehicle = readVehicles().find(v => String(v.id) === String(vehicleId || window.currentDetailVehicleId));
        radioBtns.forEach(b => b.classList.remove('active'));
        if (vehicle) {
          const durum = vehicle.uttsTanimlandi ? 'evet' : 'hayir';
          const btn = Array.from(radioBtns).find(btn => btn.dataset.value === durum);
          if (btn) btn.classList.add('active');
        } else {
          const hayirBtn = Array.from(radioBtns).find(btn => btn.dataset.value === 'hayir');
          if (hayirBtn) hayirBtn.classList.add('active');
        }
      } else if (type === 'takip') {
        // Takip Cihaz modal'ında mevcut değeri yükle (click handler HTML onclick ile)
        const radioBtns = modal.querySelectorAll('.radio-btn');
        const vehicle = readVehicles().find(v => String(v.id) === String(vehicleId || window.currentDetailVehicleId));
        radioBtns.forEach(b => b.classList.remove('active'));
        if (vehicle) {
          const durum = vehicle.takipCihaziMontaj ? 'evet' : 'hayir';
          const btn = Array.from(radioBtns).find(btn => btn.dataset.value === durum);
          if (btn) btn.classList.add('active');
        } else {
          const hayirBtn = Array.from(radioBtns).find(btn => btn.dataset.value === 'hayir');
          if (hayirBtn) hayirBtn.classList.add('active');
        }
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
            const radioBtns = modal.querySelectorAll('.radio-btn');
            if (radioBtns.length > 0) {
              // Mevcut listener'ları kaldır ve yeniden ekle
              radioBtns.forEach(btn => {
                const newBtn = btn.cloneNode(true);
                btn.parentNode.replaceChild(newBtn, btn);
              });
              
              const freshRadioBtns = modal.querySelectorAll('.radio-btn');
              const vehicle = readVehicles().find(v => String(v.id) === String(vehicleId || window.currentDetailVehicleId));
              
              // Mevcut değeri yükle
              if (type === 'utts') {
                if (vehicle) {
                  const durum = vehicle.uttsTanimlandi ? 'evet' : 'hayir';
                  const btn = Array.from(freshRadioBtns).find(btn => btn.dataset.value === durum);
                  if (btn) btn.classList.add('active');
                } else {
                  const hayirBtn = Array.from(freshRadioBtns).find(btn => btn.dataset.value === 'hayir');
                  if (hayirBtn) hayirBtn.classList.add('active');
                }
              } else if (type === 'takip') {
                if (vehicle) {
                  const durum = vehicle.takipCihaziMontaj ? 'evet' : 'hayir';
                  const btn = Array.from(freshRadioBtns).find(btn => btn.dataset.value === durum);
                  if (btn) btn.classList.add('active');
                } else {
                  const hayirBtn = Array.from(freshRadioBtns).find(btn => btn.dataset.value === 'hayir');
                  if (hayirBtn) hayirBtn.classList.add('active');
                }
              }
              
              // Event listener'ları ekle
              freshRadioBtns.forEach(btn => {
                btn.addEventListener('click', function(e) {
                  e.preventDefault();
                  e.stopPropagation();
                  freshRadioBtns.forEach(b => b.classList.remove('active'));
                  this.classList.add('active');
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
                const placeholder = document.createElement('span');
                placeholder.className = 'date-placeholder';
                placeholder.textContent = 'gg.aa.yyyy';
                placeholder.style.cssText = 'position: absolute; left: 8px; top: 50%; transform: translateY(-50%); color: #666 !important; pointer-events: none; font-size: 10px; z-index: 100;';
                
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
                    type === 'sube' ? 'sube-degisiklik-modal' :
                    type === 'kullanici' ? 'kullanici-atama-modal' :
                    type === 'satis' ? 'satis-pert-modal' : null;
    
    if (!modalId) return;
    
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('active');
      setTimeout(() => modal.style.display = 'none', 300);
    }
  };

  /**
   * Event menu modal'ını kapat
   */
  window.closeEventMenuModal = function() {
    const modal = document.getElementById('event-menu-modal');
    if (modal) {
      modal.classList.remove('active');
      setTimeout(() => modal.style.display = 'none', 300);
    }
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
   * Kaza modal'ında boya şemasını render et (readonly mevcut, yeni hasarlar eklenebilir)
   */
  function renderBoyaSchemaKaza(vehicle, container) {
    if (!container) {
      container.innerHTML = '';
      return;
    }

    getKaportaSvg().then(function(svgText) {
        const parser = new DOMParser();
        const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
        const svg = svgDoc.querySelector('svg');
        
        if (!svg) return;
        
        container.innerHTML = '';
        
        // Şema wrapper'ı oluştur
        const schemaWrapper = document.createElement('div');
        schemaWrapper.style.display = 'flex';
        schemaWrapper.style.alignItems = 'flex-start';
        schemaWrapper.style.justifyContent = 'center';
        schemaWrapper.style.gap = '24px';
        schemaWrapper.style.maxHeight = '180px';
        schemaWrapper.style.overflow = 'hidden';
        
        // SVG'yi wrapper'a ekle
        const svgClone = svg.cloneNode(true);
        schemaWrapper.appendChild(svgClone);
        
        svgClone.setAttribute('width', '140');
        svgClone.setAttribute('height', '210');
        svgClone.style.width = '210px';
        svgClone.style.height = '140px';
        svgClone.style.margin = '0';
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
              part.setAttribute('fill', '#e1061b');
              part.style.fill = '#e1061b';
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
                this.setAttribute('fill', '#e1061b');
                this.style.fill = '#e1061b';
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
          <div class="boya-legend-item" style="display: flex; align-items: center; gap: 6px;"><span class="boya-legend-dot" style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #e1061b;"></span> Değişen/Hasar</div>
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
    
    const event = {
      id: Date.now().toString(),
      type: 'bakim',
      date: tarih,
      timestamp: new Date().toISOString(),
      data: {
        islemler: islemler,
        servis: servis,
        kisi: kisi,
        km: km,
        tutar: tutar
      }
    };
    
    vehicle.events.unshift(event);
    writeVehicles(vehicles);
    
    closeEventModal('bakim');
    showVehicleDetail(vehicleId); // Detay ekranını yenile
  };

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
        surucu: surucu,
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
   * Yılları ekle helper fonksiyonu
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
   * Muayene bitiş tarihi hesapla
   */
  function calculateNextMuayene(vehicle, muayeneDate) {
    if (!muayeneDate) return '';
    
    const currentYear = new Date().getFullYear();
    const productionYear = parseInt(vehicle.year) || currentYear;
    const isFirstMuayene = !vehicle.events || !vehicle.events.some(e => e.type === 'muayene-guncelle');
    const vehicleType = vehicle.vehicleType; // 'otomobil' | 'minivan' | 'kamyon'
    
    if (isFirstMuayene) {
      // İlk muayene
      if (vehicleType === 'otomobil') {
        return addYears(muayeneDate, 3);
      } else {
        // minivan veya kamyon (ticari)
        return addYears(muayeneDate, 2);
      }
    } else {
      // Sonraki muayeneler
      if (vehicleType === 'otomobil') {
        return addYears(muayeneDate, 2);
      } else {
        // ticari
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
        bitisTarihi: bitisTarihi
      }
    };
    
    vehicle.events.unshift(event);
    writeVehicles(vehicles);
    
    // Bildirimleri güncelle
    if (window.updateNotifications) window.updateNotifications();
    
    closeEventModal('sigorta');
    showVehicleDetail(vehicleId);
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
        bitisTarihi: bitisTarihi
      }
    };
    
    vehicle.events.unshift(event);
    writeVehicles(vehicles);
    
    // Bildirimleri güncelle
    if (window.updateNotifications) window.updateNotifications();
    
    closeEventModal('kasko');
    showVehicleDetail(vehicleId);
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
        bitisTarihi: bitisTarihi
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
        detay: detay
      }
    };
    
    vehicle.events.unshift(event);
    writeVehicles(vehicles);
    
    closeEventModal('anahtar');
    showVehicleDetail(vehicleId);
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
        detay: detay
      }
    };
    
    vehicle.events.unshift(event);
    writeVehicles(vehicles);
    
    closeEventModal('kredi');
    showVehicleDetail(vehicleId);
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
        yeniKm: yeniKm
      }
    };
    
    vehicle.events.unshift(event);
    writeVehicles(vehicles);
    
    // Modal input'u temizle
    kmInput.value = '';
    
    closeEventModal('km');
    showVehicleDetail(vehicleId);
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
        durum: durum
      }
    };
    
    vehicle.events.unshift(event);
    writeVehicles(vehicles);
    
    closeEventModal('utts');
    showVehicleDetail(vehicleId);
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
        durum: durum
      }
    };
    
    vehicle.events.unshift(event);
    writeVehicles(vehicles);
    
    closeEventModal('takip');
    showVehicleDetail(vehicleId);
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
        adres: adres
      }
    };
    
    vehicle.events.unshift(event);
    writeVehicles(vehicles);
    
    // Bildirimleri güncelle
    if (window.updateNotifications) window.updateNotifications();
    
    closeEventModal('lastik');
    showVehicleDetail(vehicleId);
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
    const eskiSube = branches.find(b => b.id === eskiSubeId);
    const yeniSube = branches.find(b => b.id === yeniSubeId);
    vehicle.branchId = yeniSubeId;
    
    const event = {
      id: Date.now().toString(),
      type: 'sube-degisiklik',
      date: formatDateForDisplay(new Date()),
      timestamp: new Date().toISOString(),
      data: {
        eskiSubeId: eskiSubeId,
        yeniSubeId: yeniSubeId,
        eskiSubeAdi: eskiSube?.name || '',
        yeniSubeAdi: yeniSube?.name || ''
      }
    };
    
    vehicle.events.unshift(event);
    writeVehicles(vehicles);
    
    closeEventModal('sube');
    showVehicleDetail(vehicleId);
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
      writeVehicles(vehicles);
      closeEventModal('kullanici');
      showVehicleDetail(vehicleId);
      return;
    }

    const users = readUsers();
    const user = users.find(u => u.id === yeniKullaniciId);
    const eskiKullaniciId = vehicle.assignedUserId || '';
    const eskiUser = users.find(u => u.id === eskiKullaniciId);

    vehicle.assignedUserId = yeniKullaniciId;
    vehicle.tahsisKisi = user?.name || '';
    vehicle.updatedAt = new Date().toISOString();

    const event = {
      id: Date.now().toString(),
      type: 'kullanici-atama',
      date: formatDateForDisplay(new Date()),
      timestamp: new Date().toISOString(),
      data: {
        kullaniciId: yeniKullaniciId,
        kullaniciAdi: user?.name || '',
        eskiKullaniciAdi: eskiUser?.name || (eskiKullaniciId ? 'Bilinmeyen' : '')
      }
    };

    vehicle.events.unshift(event);
    writeVehicles(vehicles);

    closeEventModal('kullanici');
    showVehicleDetail(vehicleId);
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
        aciklama: aciklama
      }
    };
    
    vehicle.events.unshift(event);
    writeVehicles(vehicles);
    
    closeEventModal('satis');
    closeVehicleDetailModal(); // Detay modal'ını kapat
    alert('Taşıt satış/pert işlemi kaydedildi. Taşıt arşive taşındı.');
  };

  /**
   * Tarihçe modal'ını aç
   */
  window.showVehicleHistory = function(vehicleId) {
    const vid = vehicleId || window.currentDetailVehicleId;
    if (!vid) return;
    
    const modal = document.getElementById('vehicle-history-modal');
    if (!modal) return;
    
    // İlk tab'ı göster
    switchHistoryTab('bakim', vid);
    
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
    document.querySelectorAll('.history-tab').forEach(tab => {
      tab.classList.remove('active');
      if (tab.dataset.tab === tabType) {
        tab.classList.add('active');
        tab.style.borderBottomColor = '#e1061b';
        tab.style.color = '#e1061b';
      } else {
        tab.style.borderBottomColor = 'transparent';
        tab.style.color = '#ccc';
      }
    });
    
    // İçeriği render et
    const contentEl = document.getElementById('history-content');
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
          const kmStr = event.data?.km ? `Km: ${escapeHtml(formatNumber(event.data.km))}` : '';
          const tutarStr = event.data?.tutar ? `Tutar: ${escapeHtml(event.data.tutar)}` : '';
          const ekStr = [kmStr, tutarStr].filter(Boolean).join(' | ');
          const islemler = toTitleCase(event.data?.islemler || '');
          const servis = toTitleCase(event.data?.servis || '-');
          const kisi = toTitleCase(event.data?.kisi || '-');
          html += `<div class="history-item" style="padding: 12px; border-bottom: 1px solid rgba(255, 255, 255, 0.1);">
            <div class="history-item-date" style="font-weight: 600; font-size: 12px; margin-bottom: 4px;">${escapeHtml(event.date)}</div>
            <div class="history-item-body" style="font-size: 12px;">${escapeHtml(islemler)}</div>
            <div class="history-item-body" style="font-size: 12px; margin-top: 4px;">Servis: ${escapeHtml(servis)} | Kişi: ${escapeHtml(kisi)}${ekStr ? ' | ' + ekStr : ''}</div>
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
          const hasarStr = event.data?.hasarTutari ? ` | Hasar Tutarı: ${escapeHtml(event.data.hasarTutari)}` : '';
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
            const parts = [];
            if (boyaliList.length) parts.push('Boyalı: ' + boyaliList.join(', '));
            if (degisenList.length) parts.push('Değişen: ' + degisenList.join(', '));
            if (parts.length) parcalarHtml = `<div class="history-item-body" style="font-size: 12px; margin-top: 4px;">${escapeHtml(parts.join(' | '))}</div>`;
          }
          const surucu = toTitleCase(event.data?.surucu || '-');
          html += `<div class="history-item" style="padding: 12px; border-bottom: 1px solid rgba(255, 255, 255, 0.1);">
            <div class="history-item-date" style="font-weight: 600; font-size: 12px; margin-bottom: 4px;">${escapeHtml(event.date)}</div>
            <div class="history-item-body" style="font-size: 12px;">Kullanıcı: ${escapeHtml(surucu)}${hasarStr}</div>
            ${parcalarHtml}
            ${aciklamaHtml}
          </div>`;
        });
      }
    } else if (tabType === 'km') {
      const kmEvents = events.filter(e => e.type === 'km-revize');
      if (kmEvents.length === 0) {
        html = '<div class="history-empty-msg" style="text-align: center; padding: 20px;">' + escapeHtml(toTitleCase('Km güncelleme kaydı bulunmamaktadır.')) + '</div>';
      } else {
        kmEvents.forEach(event => {
          const eskiKm = event.data?.eskiKm || '-';
          const yeniKm = event.data?.yeniKm || '-';
          const surucuVal = event.data?.surucu;
          const surucuStr = surucuVal ? `Kullanıcı: ${escapeHtml(toTitleCase(surucuVal))}` : '';
          html += `<div class="history-item" style="padding: 12px; border-bottom: 1px solid rgba(255, 255, 255, 0.1);">
            <div class="history-item-date" style="font-weight: 600; font-size: 12px; margin-bottom: 4px;">${escapeHtml(event.date)} - Km Revize</div>
            <div class="history-item-body" style="font-size: 12px; margin-top: 4px;">Önceki Km; ${escapeHtml(formatNumber(eskiKm))} - Güncellenen Km; ${escapeHtml(formatNumber(yeniKm))}</div>
            ${surucuStr ? `<div class="history-item-body" style="font-size: 12px; margin-top: 4px;">${surucuStr}</div>` : ''}
          </div>`;
        });
      }
    } else if (tabType === 'sube') {
      const branches = readBranches();
      const subeEvents = events.filter(e => e.type === 'sube-degisiklik' || e.type === 'kullanici-atama' || e.type === 'sigorta-guncelle' || e.type === 'kasko-guncelle' || e.type === 'muayene-guncelle' || e.type === 'anahtar-guncelle' || e.type === 'kredi-guncelle' || e.type === 'lastik-guncelle' || e.type === 'utts-guncelle' || e.type === 'takip-cihaz-guncelle' || e.type === 'not-guncelle' || e.type === 'satis');
      if (subeEvents.length === 0) {
        html = '<div class="history-empty-msg" style="text-align: center; padding: 20px;">' + escapeHtml(toTitleCase('Şube/Kullanıcı geçmişi bulunmamaktadır.')) + '</div>';
      } else {
        subeEvents.forEach(event => {
          let label = '';
          let detailHtml = '';
          
          if (event.type === 'sube-degisiklik') label = 'Şube Değişikliği';
          else if (event.type === 'kullanici-atama') label = 'Yeni Kullanıcı';
          else if (event.type === 'sigorta-guncelle') label = 'Sigorta Güncelleme';
          else if (event.type === 'kasko-guncelle') label = 'Kasko Güncelleme';
          else if (event.type === 'muayene-guncelle') label = 'Muayene Güncelleme';
          else if (event.type === 'anahtar-guncelle') label = 'Anahtar Güncelleme';
          else if (event.type === 'kredi-guncelle') label = 'Kredi/Rehin Güncelleme';
          else if (event.type === 'lastik-guncelle') label = 'Yazlık/Kışlık Lastik Durumu Güncelleme';
          else if (event.type === 'utts-guncelle') label = 'UTTS Güncelleme';
          else if (event.type === 'takip-cihaz-guncelle') label = 'Taşıt Takip Cihazı Güncelleme';
          else if (event.type === 'not-guncelle') label = 'Sürücü Notu';
          else if (event.type === 'satis') label = 'Satış/Pert';
          
          let descText = escapeHtml(toTitleCase(label));
          if (event.type === 'kullanici-atama') {
            const yeni = toTitleCase(event.data?.kullaniciAdi || '-');
            const eski = event.data?.eskiKullaniciAdi ? toTitleCase(event.data.eskiKullaniciAdi) : '';
            descText += ` - ${escapeHtml(yeni)}${eski ? ` (${escapeHtml(eski)})` : ''}`;
          } else if (event.type === 'sube-degisiklik') {
            const yeniRaw = event.data?.yeniSubeAdi || branches.find(b => b.id === event.data?.yeniSubeId)?.name || '-';
            const eskiRaw = event.data?.eskiSubeAdi || branches.find(b => b.id === event.data?.eskiSubeId)?.name || '';
            const yeni = toTitleCase(yeniRaw);
            const eski = eskiRaw ? toTitleCase(eskiRaw) : '';
            descText += ` - ${escapeHtml(yeni)}${eski ? ` (${escapeHtml(eski)})` : ''}`;
          } else if (event.type === 'not-guncelle' && event.data?.not) {
            const notStr = String(event.data.not);
            const notDisplay = notStr.length > 40 ? notStr.slice(0, 40) + '…' : notStr;
            descText += ' - ' + escapeHtml(toTitleCase(notDisplay));
          }
          html += `<div class="history-item history-item-sube" style="padding: 12px; border-bottom: 1px solid rgba(255, 255, 255, 0.1);">
            <div class="history-item-date" style="font-weight: 600; font-size: 12px; margin-bottom: 4px;">${escapeHtml(event.date)} - ${descText}</div>
            ${detailHtml}
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
    const modal = document.getElementById('vehicle-history-modal');
    if (modal) {
      modal.classList.remove('active');
      setTimeout(() => modal.style.display = 'none', 300);
    }
  };

  /**
   * Bildirimleri güncelle (muayene, sigorta, kasko)
   */
  window.updateNotifications = function() {
    const vehicles = readVehicles();
    const notifications = [];
    let hasRed = false; // Kırmızı bildirim var mı?
    let hasOrange = false; // Turuncu bildirim var mı?

    vehicles.forEach(vehicle => {
      if (vehicle.satildiMi) return; // Satılmış taşıtları atla

      const plate = vehicle.plate || '-';
      const brandModel = vehicle.brandModel || '-';

      // Sigorta kontrolü
      if (vehicle.sigortaDate) {
        const warning = checkDateWarnings(vehicle.sigortaDate);
        if (warning.class) {
          const days = warning.days;
          const status = days < 0 ? 'geçmiş' : days <= 3 ? 'çok yakın' : 'yaklaşıyor';
          notifications.push({
            type: 'sigorta',
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

    // Bildirimleri güncelle
    const notifDropdown = document.getElementById('notifications-dropdown');
    const notifIcon = document.querySelector('.icon-btn[onclick="toggleNotifications(event)"]');
    
    if (notifications.length === 0) {
      if (notifDropdown) {
        notifDropdown.innerHTML = '<button disabled>Bildirim Yok</button>';
      }
      if (notifIcon) {
        notifIcon.classList.remove('notification-red', 'notification-orange', 'notification-pulse');
      }
    } else {
      // Bildirimleri önceliğe göre sırala (kırmızı önce, sonra turuncu)
      notifications.sort((a, b) => {
        if (a.warningClass === 'date-warning-red' && b.warningClass !== 'date-warning-red') return -1;
        if (a.warningClass !== 'date-warning-red' && b.warningClass === 'date-warning-red') return 1;
        return a.days - b.days; // Gün sayısına göre sırala
      });

      let html = '';
      notifications.forEach(notif => {
        const typeLabel = notif.type === 'sigorta' ? 'Sigorta' : notif.type === 'kasko' ? 'Kasko' : 'Muayene';
        const dateDisplay = formatDateForDisplay(notif.date);
        const daysText = notif.days < 0 ? `${Math.abs(notif.days)} gün geçmiş` : 
                        notif.days === 0 ? 'Bugün' : 
                        notif.days === 1 ? 'Yarın' : 
                        `${notif.days} gün kaldı`;
        
        // Çerçeve rengini belirle
        const borderColor = notif.warningClass === 'date-warning-red' 
          ? 'rgba(225, 6, 27, 0.6)' 
          : 'rgba(255, 140, 0, 0.6)';
        
        html += `<button onclick="openVehiclesView(); setTimeout(() => { const vehicles = window.getMedisaVehicles ? window.getMedisaVehicles() : JSON.parse(localStorage.getItem('medisa_vehicles_v1') || '[]'); const v = vehicles.find(v => v.plate === '${escapeHtml(notif.plate)}'); if (v) showVehicleDetail(v.id); }, 100);" style="width: 100%; padding: 12px; background: transparent; border: 1px solid ${borderColor}; color: #ccc; border-radius: 6px; cursor: pointer; font-weight: 500; font-size: 13px; text-align: left; margin-bottom: 4px; transition: all 0.2s ease;" class="notification-item ${notif.warningClass}-border">
          <div style="font-weight: 600; color: #fff; margin-bottom: 4px; text-align: center;">${escapeHtml(notif.plate)}</div>
          <div style="font-size: 11px; color: #999; margin-bottom: 4px; text-align: center;">${escapeHtml(notif.brandModel)}</div>
          <div style="font-size: 11px; text-align: center; margin-bottom: 4px;">
            <span class="${notif.warningClass}">${escapeHtml(typeLabel)}</span> - ${escapeHtml(dateDisplay)}
          </div>
          <div style="text-align: center;">
            <span class="${notif.warningClass}" style="font-size: 11px;">${escapeHtml(daysText)}</span>
          </div>
        </button>`;
      });

      if (notifDropdown) {
        notifDropdown.innerHTML = html;
      }

      // Bildirim simgesine renk ve animasyon ekle
      if (notifIcon) {
        notifIcon.classList.remove('notification-red', 'notification-orange', 'notification-pulse');
        if (hasRed) {
          notifIcon.classList.add('notification-red', 'notification-pulse');
        } else if (hasOrange) {
          notifIcon.classList.add('notification-orange', 'notification-pulse');
        }
      }
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