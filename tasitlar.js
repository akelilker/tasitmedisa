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
        // DASHBOARD MODU: Sağda Genel Arama ve Arşiv
        toolbar.innerHTML = `
            <div class="vt-left"></div>
            <div class="vt-right">
                <div id="v-search-container" class="v-search-container">
                    <input type="text" id="v-search-input" class="v-search-input" placeholder="Plaka, marka, kullanıcı ara..." oninput="handleSearch(this.value)">
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
      loadVehicleColumnOrder(); // Sütun sıralamasını yükle
      const listContainer = modalContent; // Direkt content'e basıyoruz
      // Veri Çek
      let vehicles = readVehicles();

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
        const q = query.toLowerCase();
        vehicles = vehicles.filter(v => 
            (v.plate && v.plate.toLowerCase().includes(q)) ||
            (v.brandModel && v.brandModel.toLowerCase().includes(q)) ||
            (v.year && v.year.includes(q)) ||
            (v.tahsisKisi && v.tahsisKisi.toLowerCase().includes(q))
        );
    }

      // 3. Sıralama
      vehicles = applyFilter(vehicles);

      // 4. HTML
      if (vehicles.length === 0) {
          const emptyMsg = (activeBranchId === '__archive__') ? 'Arşivde kayıt bulunamadı.' : 'Kayıt bulunamadı.';
          listContainer.innerHTML = `<div style="text-align:center; padding:40px; color:#666">${emptyMsg}</div>`;
          return;
      }

    // Şube isimlerini al (Tümü görünümü için)
    const branches = readBranches();
    const getBranchName = (branchId) => {
      if (!branchId) return '';
      const branch = branches.find(b => b.id === branchId);
      return branch ? branch.name : '';
    };

    const isAllView = (activeBranchId === 'all');
    const extraClass = (viewMode === 'list' && isAllView) ? ' is-all-view' : '';
      let html = '';
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
        const isMobile = window.innerWidth <= 640;
        const columnDefs = {
          'year': { label: 'Yılı', class: 'list-year' },
          'plate': { label: 'Plaka', class: 'list-plate' },
          'brand': { label: 'Marka / Model', class: 'list-brand' },
          'km': { label: 'Km', class: 'list-km' },
          'type': { label: 'Taşıt Tipi', class: 'list-type' },
          'user': { label: isMobile ? 'Kull.' : 'Kullanıcı', class: 'list-user' },
          'branch': { label: 'Şube', class: 'list-branch' }
        };
        
        html += '<div class="list-header-row">';
        // Sıralamaya göre sütun başlıklarını render et
        vehicleColumnOrder.forEach(columnKey => {
          const def = columnDefs[columnKey];
          if (def) {
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
                <span>${def.label}</span>${getSortIcon(columnKey)}
              </div>
            `;
          }
        });
        html += '</div>';
      }
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
            return `
              <div class="card${unassignedClass}" onclick="event.stopPropagation(); showVehicleDetail('${v.id}');">
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
            vehicleColumnOrder.forEach(columnKey => {
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
                  const users = readUsers();
                  const assignedUser = v.assignedUserId ? users.find(u => u.id === v.assignedUserId) : null;
                  const userName = assignedUser?.isim || v.tahsisKisi || '-';
                  cellContent = escapeHtml(userName);
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
            
            return `
              <div class="list-item${unassignedClass}" onclick="event.stopPropagation(); showVehicleDetail('${v.id}');">
                ${cellHtml}
              </div>
            `;
        }
    }).join('') + '</div>';

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
      
      // Mobil görünüm için font boyutu ayarlama
      if (viewMode === 'list' && window.innerWidth <= 640) {
          const brandCells = listContainer.querySelectorAll('.view-list .list-cell.list-brand');
          brandCells.forEach(cell => {
              let fontSize = 13; // Standart 13px
              const minFontSize = 11; // Minimum 11px
              
              cell.style.fontSize = fontSize + 'px';
              
              // Taşma kontrolü ve küçültme mantığı
              while (cell.scrollWidth > cell.offsetWidth && fontSize > minFontSize) {
                  fontSize--;
                  cell.style.fontSize = fontSize + 'px';
              }
          });
      }
    } catch (error) {
      if (modalContent) {
        modalContent.innerHTML = '<div style="text-align:center; padding:40px; color:#666">Bir hata oluştu. Lütfen sayfayı yenileyin.</div>';
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
      const vehicle = vehicles.find(v => v.id === vehicleId);
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
      
      // GÜNCELLENDİ: Dropdown'a disabled selected ve placeholder metni eklendi
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
    
    // Taşıtı güncelle
    const vehicles = readVehicles();
    const vehicle = vehicles.find(v => v.id === vehicleId);
    if (!vehicle) return;
    
    vehicle.branchId = branchId;
    writeVehicles(vehicles);
    
    // Modalı kapat ve listeyi yenile
    closeVehicleDetailModal();
    renderBranchDashboard(); // Ana ekrana dön
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
          const filtered = all.filter(v => 
            (v.plate && v.plate.toLowerCase().includes(q)) ||
            (v.brandModel && v.brandModel.toLowerCase().includes(q)) ||
            (v.tahsisKisi && v.tahsisKisi.toLowerCase().includes(q))
          );
          
          // Sonuçları Liste Modunda Göster
          let html = `<div style="padding:10px; color:#aaa; font-size:12px;">GENEL ARAMA SONUÇLARI (${filtered.length})</div>`;
          html += `<div class="view-list">` + filtered.map(v => `
              <div class="list-item">
                <div class="list-info">
                  <h4>${escapeHtml(v.brandModel)}</h4>
                  <span>${v.year} • ${v.tahsisKisi || 'Boşta'}</span>
                </div>
              </div>
          `).join('') + `</div>`;
          
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
  
  // Filtreleme dropdown dışarı tıklandığında kapat
  document.addEventListener('click', function(e) {
      const fd = document.getElementById('filter-dropdown');
      const filterBtn = document.querySelector('.vt-icon-btn[onclick*="toggleFilterMenu"]');
      
      // Dropdown veya filtre butonu içindeki tıklamaları ignore et
      if (fd && fd.contains(e.target)) return;
      if (filterBtn && filterBtn.contains(e.target)) return;
      
      // Dışarı tıklandığında kapat
      if (fd && fd.classList.contains('open')) {
          closeFilterMenu();
      }
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
      
      const sorted = [...list];
      const dir = sortDirection === 'asc' ? 1 : -1;
      
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
                  const branches = readBranches();
                  const getBranchName = (branchId) => {
                      if (!branchId) return 'zzz_tahsis_edilmemis';
                      const branch = branches.find(b => b.id === branchId);
                      return branch ? branch.name.toLowerCase() : 'zzz_unknown';
                  };
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
   * Sol kolon render (Taşıt özellikleri)
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
    
    // Kullanıcı varsa (assignedUserId var veya tahsisKisi var) normal göster, yoksa kırmızı link göster
    if (assignedUserId || (assignedUserName && assignedUserName.trim())) {
      const displayName = escapeHtml(assignedUserName).replace(/ /g, '&nbsp;');
      html += `<div class="detail-row detail-row-inline"><div class="detail-row-header"><span class="detail-row-label">Kullanıcı</span><span class="detail-row-colon">:</span></div><span class="detail-row-value detail-user-value"> ${displayName}</span></div>`;
    } else {
      html += `<div class="detail-row detail-row-inline"><div class="detail-row-header"><span class="detail-row-label">Kullanıcı</span><span class="detail-row-colon">:</span></div><span class="detail-row-value detail-user-empty" onclick="event.stopPropagation(); if (window.currentDetailVehicleId) openEventModal('kullanici', window.currentDetailVehicleId);"> Kullanıcı Eklemek İçin +</span></div>`;
    }

    // Şube
    const branches = readBranches();
    const branchId = vehicle.branchId || '';
    const branchName = branchId
      ? (branches.find(b => b.id === branchId)?.name || '')
      : 'Tahsis Edilmemiş';
    html += `<div class="detail-row detail-row-inline"><div class="detail-row-header"><span class="detail-row-label">Şube</span><span class="detail-row-colon">:</span></div><span class="detail-row-value"> ${escapeHtml(branchName)}</span></div>`;

    // Taşıt Tipi
    const vehicleType = vehicle.vehicleType || '';
    html += `<div class="detail-row detail-row-inline"><div class="detail-row-header"><span class="detail-row-label">Taşıt Tipi</span><span class="detail-row-colon">:</span></div><span class="detail-row-value"> ${escapeHtml(getVehicleTypeLabel(vehicleType))}</span></div>`;
    
    // Üretim Yılı
    const year = vehicle.year || '';
    html += `<div class="detail-row detail-row-inline"><div class="detail-row-header"><span class="detail-row-label">Üretim Yılı</span><span class="detail-row-colon">:</span></div><span class="detail-row-value"> ${escapeHtml(year)}</span></div>`;
    
    // Km gösterimi - guncelKm varsa "Km: ***", yoksa "Km (Alındığı Tarih): ***"
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
    
    // Tramer Kaydı
    if (vehicle.tramer === 'var' && vehicle.tramerRecords && vehicle.tramerRecords.length > 0) {
      // Tramer "var" ise alt satırda kayıtlar (label+colon üstte, value altta)
      html += `<div class="detail-row detail-row-block"><div class="detail-row-header"><span class="detail-row-label">Tramer Kaydı</span><span class="detail-row-colon">:</span></div><span class="detail-row-value"> `;
      vehicle.tramerRecords.forEach((record, index) => {
        if (index > 0) html += '<br>';
        html += `${escapeHtml(record.date)} - ${escapeHtml(record.amount)}`;
      });
      
      // Toplam hesapla
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
      // Tramer "yok" ise aynı satırda "Yoktur" göster
      html += `<div class="detail-row detail-row-inline"><div class="detail-row-header"><span class="detail-row-label">Tramer Kaydı</span><span class="detail-row-colon">:</span></div><span class="detail-row-value"> Yoktur.</span></div>`;
    }
    
    // Kaporta Durumu
    html += `<div class="detail-row detail-row-inline"><div class="detail-row-header"><span class="detail-row-label">Kaporta Durumu</span><span class="detail-row-colon">:</span></div><span class="detail-row-value"> `;
    if (vehicle.boya === 'var' && vehicle.boyaliParcalar) {
      html += 'Aşağıdaki şemada belirtilmiştir.';
    } else {
      html += 'Yoktur.';
    }
    html += `</span></div>`;
    
    // Boya şeması (her zaman göster)
    html += `<div id="detail-boya-container"></div>`;
    
    leftEl.innerHTML = html;
    
    // Boya şemasını render et (her zaman, boya/değişen olmasa bile)
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
    
    // Muayene bitiş tarihi
    const muayeneDate = vehicle.muayeneDate || '';
    const muayeneWarning = checkDateWarnings(muayeneDate);
    const muayeneDisplay = formatDateForDisplay(muayeneDate);
    html += `<div class="detail-row detail-row-inline"><div class="detail-row-header"><span class="detail-row-label">Muayene Bitiş Tarihi</span><span class="detail-row-colon">:</span></div><span class="detail-row-value ${muayeneWarning.class}"> ${escapeHtml(muayeneDisplay || '-')}</span></div>`;
    
    // Yedek Anahtar
    const anahtar = vehicle.anahtar || '';
    const anahtarLabel = anahtar === 'var' ? (vehicle.anahtarNerede || 'Var') : 'Yoktur.';
    html += `<div class="detail-row detail-row-inline"><div class="detail-row-header"><span class="detail-row-label">Yedek Anahtar</span><span class="detail-row-colon">:</span></div><span class="detail-row-value"> ${escapeHtml(anahtarLabel)}</span></div>`;
    
    // Kredi/Rehin
    const kredi = vehicle.kredi || '';
    const krediLabel = kredi === 'var' ? (vehicle.krediDetay || 'Var') : 'Yoktur.';
    html += `<div class="detail-row detail-row-inline"><div class="detail-row-header"><span class="detail-row-label">Kredi/Rehin</span><span class="detail-row-colon">:</span></div><span class="detail-row-value"> ${escapeHtml(krediLabel)}</span></div>`;
    
    // Yazlık/ Kışlık Lastik
    const lastikDurumu = vehicle.lastikDurumu || '';
    const lastikLabel = lastikDurumu === 'var' ? (vehicle.lastikAdres || 'Var') : 'Yoktur.';
    html += `<div class="detail-row detail-row-inline"><div class="detail-row-header"><span class="detail-row-label">Yazlık/ Kışlık Lastik</span><span class="detail-row-colon">:</span></div><span class="detail-row-value"> ${escapeHtml(lastikLabel)}</span></div>`;
    
    // UTTS
    const utts = vehicle.uttsTanimlandi ? 'Evet' : 'Hayır';
    html += `<div class="detail-row detail-row-inline"><div class="detail-row-header"><span class="detail-row-label">UTTS</span><span class="detail-row-colon">:</span></div><span class="detail-row-value"> ${escapeHtml(utts)}</span></div>`;
    
    // Taşıt Takip
    const takipCihazi = vehicle.takipCihaziMontaj ? 'Evet' : 'Hayır';
    html += `<div class="detail-row detail-row-inline"><div class="detail-row-header"><span class="detail-row-label">Taşıt Takip</span><span class="detail-row-colon">:</span></div><span class="detail-row-value"> ${escapeHtml(takipCihazi)}</span></div>`;
    
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
    
    // SVG'yi yükle ve mevcut durumları göster
    fetch('icon/kaporta.svg')
      .then(res => res.text())
      .then(svgText => {
        const parser = new DOMParser();
        const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
        const svg = svgDoc.querySelector('svg');
        
        if (!svg) return;
        
        // Container'ı flex yap (legend sola, SVG sağa)
        container.innerHTML = '';
        container.style.display = 'flex';
        container.style.alignItems = 'center'; /* Dikeyde şema yüksekliğine ortalı */
        container.style.gap = '20px'; /* Legend ile SVG arası boşluk artırıldı (12px → 20px) */
        const isMobile = window.innerWidth <= 640;
        container.style.justifyContent = isMobile ? 'center' : 'flex-start'; /* Mobilde yatay ortala */
        
        // Renk açıklaması ekle (sola, dikey - sadece kısaltma harfler, küçük)
        const legend = document.createElement('div');
        legend.className = 'boya-legend';
        legend.style.display = 'flex';
        legend.style.flexDirection = 'column'; /* Alt alta */
        legend.style.gap = '4px'; /* Daha az boşluk */
        legend.style.fontSize = '2px'; /* Harfler 2px */
        legend.style.color = '#aaa';
        legend.style.transform = 'translateY(-8px)'; /* Tüm legend'i yukarı kaydır (gap'i etkilemez) */
        legend.innerHTML = `
          <div class="boya-legend-item" style="display: flex; align-items: center; gap: 4px;"><span class="boya-legend-dot" style="background: #666666; width: 4px; height: 4px; border-radius: 50%; display: inline-block; flex-shrink: 0;"></span> O</div>
          <div class="boya-legend-item" style="display: flex; align-items: center; gap: 4px;"><span class="boya-legend-dot" style="background: #28a745; width: 4px; height: 4px; border-radius: 50%; display: inline-block; flex-shrink: 0;"></span> B</div>
          <div class="boya-legend-item" style="display: flex; align-items: center; gap: 4px;"><span class="boya-legend-dot" style="background: #e1061b; width: 4px; height: 4px; border-radius: 50%; display: inline-block; flex-shrink: 0;"></span> D</div>
        `;
        container.appendChild(legend);
        
        // SVG'yi container'a ekle (sağa)
        const svgClone = svg.cloneNode(true);
        container.appendChild(svgClone);
        
        // Boyutları ayarla ve 90 derece döndür (yatay genişlik 8px artırıldı)
        svgClone.setAttribute('width', '100');
        svgClone.setAttribute('height', '158'); /* 150px + 8px = 158px (döndürülmüş yatay genişlik) */
        svgClone.style.width = '100px';
        svgClone.style.height = '158px';
        svgClone.style.display = 'block';
        svgClone.style.transform = 'rotate(90deg)'; /* 90 derece yan çevir */
        svgClone.style.transformOrigin = 'center center'; /* Dönme merkezi */
        svgClone.style.flexShrink = '0'; /* Legend ile çakışmasını önle */
        svgClone.style.marginLeft = isMobile ? '0' : '10px'; /* Mobilde ortada kalsın */
        svgClone.style.position = 'relative'; /* Görünürlük için */
        
        const partNames = getKaportaPartNames();
        
        // Önce TÜM parçaları koyu gri yap (varsayılan orijinal renk)
        const allParts = svgClone.querySelectorAll('path[id]');
        allParts.forEach(part => {
          part.setAttribute('fill', '#666666');
          part.style.fill = '#666666';
        });
        
        // Mevcut durumları uygula ve hover tooltip ekle
        const boyaliParcalar = vehicle.boyaliParcalar || {};
        Object.keys(boyaliParcalar).forEach(partId => {
          const state = boyaliParcalar[partId];
          const part = svgClone.querySelector(`#${partId}`);
          if (part) {
            // Renk uygula
            if (state === 'boyali') {
              part.setAttribute('fill', '#28a745');
              part.style.fill = '#28a745';
            } else if (state === 'degisen') {
              part.setAttribute('fill', '#e1061b');
              part.style.fill = '#e1061b';
            } else {
              part.setAttribute('fill', '#666666');
              part.style.fill = '#666666';
            }
            
            // Hover tooltip ekle (parça ismi ve durumu)
            const partName = partNames[partId] || partId;
            const stateLabel = state === 'boyali' ? 'Boyalı' : state === 'degisen' ? 'Değişen' : 'Orijinal';
            part.setAttribute('title', `${partName} - ${stateLabel}`);
            part.style.cursor = 'pointer';
          }
        });
        
        // boyaliParcalar'da olmayan parçalara da tooltip ekle
        allParts.forEach(part => {
          const partId = part.getAttribute('id');
          if (partId && !boyaliParcalar[partId]) {
            const partName = partNames[partId] || partId;
            part.setAttribute('title', `${partName} - Orijinal`);
            part.style.cursor = 'pointer';
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
        const vehicle = readVehicles().find(v => v.id === (vehicleId || window.currentDetailVehicleId));
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
            opt.textContent = u.name;
            selectEl.appendChild(opt);
          });
          const addOpt = document.createElement('option');
          addOpt.value = '__add_user__';
          addOpt.textContent = '+ Yeni Kullanıcı Ekle';
          selectEl.appendChild(addOpt);
          const vehicle = readVehicles().find(v => v.id === (vehicleId || window.currentDetailVehicleId));
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
                    opt.textContent = u.name;
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
            
            radioBtns.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
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
            
            radioBtns.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
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
        const vehicle = readVehicles().find(v => v.id === (vehicleId || window.currentDetailVehicleId));
        if (vehicle) {
          if (vehicle.lastikDurumu === 'var') {
            const varBtn = Array.from(radioBtns).find(btn => btn.dataset.value === 'var');
            if (varBtn) {
              varBtn.classList.add('active');
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
            
            radioBtns.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
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
        const vehicle = readVehicles().find(v => v.id === (vehicleId || window.currentDetailVehicleId));
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
        const vehicle = readVehicles().find(v => v.id === (vehicleId || window.currentDetailVehicleId));
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
          const vehicle = readVehicles().find(v => v.id === (vehicleId || window.currentDetailVehicleId));
          if (vehicle?.tahsisKisi) {
            bakimKisiInput.value = vehicle.tahsisKisi;
          }
        }
      } else if (type === 'km') {
        // Km modal'ında input'u temizle ve mevcut km'yi göster (opsiyonel)
        const kmInput = document.getElementById('km-guncelle-input');
        if (kmInput) {
          const vehicle = readVehicles().find(v => v.id === (vehicleId || window.currentDetailVehicleId));
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
              const vehicle = readVehicles().find(v => v.id === (vehicleId || window.currentDetailVehicleId));
              
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
   * Kaza modal'ında boya şemasını render et (readonly mevcut, yeni hasarlar eklenebilir)
   */
  function renderBoyaSchemaKaza(vehicle, container) {
    if (!container) {
      container.innerHTML = '';
      return;
    }
    
    fetch('icon/kaporta.svg')
      .then(res => res.text())
      .then(svgText => {
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
        
        const allParts = svgClone.querySelectorAll('path[id]');
        allParts.forEach(part => {
          part.setAttribute('fill', '#888888');
          part.style.fill = '#888888';
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
              part.setAttribute('fill', '#888888');
              part.style.fill = '#888888';
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
                this.setAttribute('fill', '#888888');
                this.style.fill = '#888888';
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
    const vehicle = vehicles.find(v => v.id === vehicleId);
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
    const vehicle = vehicles.find(v => v.id === vehicleId);
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
    const vehicle = vehicles.find(v => v.id === vehicleId);
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
    const vehicle = vehicles.find(v => v.id === vehicleId);
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
    const vehicle = vehicles.find(v => v.id === vehicleId);
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
    const vehicle = vehicles.find(v => v.id === vehicleId);
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
    const vehicle = vehicles.find(v => v.id === vehicleId);
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
    const vehicle = vehicles.find(v => v.id === vehicleId);
    if (!vehicle) return;
    
    if (!vehicle.events) vehicle.events = [];
    
    // Eski km değerini al (guncelKm varsa onu, yoksa vehicle.km'i kullan)
    const eskiKm = vehicle.guncelKm || vehicle.km || '';
    
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
    const vehicle = vehicles.find(v => v.id === vehicleId);
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
    const vehicle = vehicles.find(v => v.id === vehicleId);
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
    const vehicle = vehicles.find(v => v.id === vehicleId);
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
    const vehicle = vehicles.find(v => v.id === vehicleId);
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
    const vehicle = vehicles.find(v => v.id === vehicleId);
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
    const vehicle = vehicles.find(v => v.id === vehicleId);
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
    const vehicle = vehicles.find(v => v.id === vid);
    if (!vehicle) return;
    
    const events = vehicle.events || [];
    
    let html = '';
    
    if (tabType === 'bakim') {
      const bakimEvents = events.filter(e => e.type === 'bakim');
      if (bakimEvents.length === 0) {
        html = '<div style="text-align: center; color: #888; padding: 20px;">Bakım kaydı bulunmamaktadır.</div>';
      } else {
        bakimEvents.forEach(event => {
          const kmStr = event.data?.km ? `Km: ${escapeHtml(formatNumber(event.data.km))}` : '';
          const tutarStr = event.data?.tutar ? `Tutar: ${escapeHtml(event.data.tutar)}` : '';
          const ekStr = [kmStr, tutarStr].filter(Boolean).join(' | ');
          html += `<div class="history-item" style="padding: 12px; border-bottom: 1px solid rgba(255, 255, 255, 0.1);">
            <div style="font-weight: 600; color: #e0e0e0; margin-bottom: 4px;">${escapeHtml(event.date)}</div>
            <div style="color: #aaa; font-size: 13px;">${escapeHtml(event.data?.islemler || '')}</div>
            <div style="color: #888; font-size: 12px; margin-top: 4px;">Servis: ${escapeHtml(event.data?.servis || '-')} | Kişi: ${escapeHtml(event.data?.kisi || '-')}${ekStr ? ' | ' + ekStr : ''}</div>
          </div>`;
        });
      }
    } else if (tabType === 'kaza') {
      const kazaEvents = events.filter(e => e.type === 'kaza');
      const partNames = getKaportaPartNames();
      if (kazaEvents.length === 0) {
        html = '<div style="text-align: center; color: #888; padding: 20px;">Kaza kaydı bulunmamaktadır.</div>';
      } else {
        kazaEvents.forEach(event => {
          const hasarStr = event.data?.hasarTutari ? ` | Hasar Tutarı: ${escapeHtml(event.data.hasarTutari)}` : '';
          const aciklamaHtml = event.data?.aciklama ? `<div style="color: #aaa; font-size: 13px; margin-top: 4px;">${escapeHtml(event.data.aciklama)}</div>` : '';
          let parcalarHtml = '';
          const hasarParcalari = event.data?.hasarParcalari;
          if (hasarParcalari && typeof hasarParcalari === 'object' && Object.keys(hasarParcalari).length > 0) {
            const boyaliList = [];
            const degisenList = [];
            Object.keys(hasarParcalari).forEach(partId => {
              const partName = partNames[partId] || partId;
              if (hasarParcalari[partId] === 'boyali') boyaliList.push(partName);
              else if (hasarParcalari[partId] === 'degisen') degisenList.push(partName);
            });
            const parts = [];
            if (boyaliList.length) parts.push(`Boyalı: ${boyaliList.join(', ')}`);
            if (degisenList.length) parts.push(`Değişen: ${degisenList.join(', ')}`);
            if (parts.length) parcalarHtml = `<div style="color: #aaa; font-size: 13px; margin-top: 4px;">${escapeHtml(parts.join(' | '))}</div>`;
          }
          html += `<div class="history-item" style="padding: 12px; border-bottom: 1px solid rgba(255, 255, 255, 0.1);">
            <div style="font-weight: 600; color: #e0e0e0; margin-bottom: 4px;">${escapeHtml(event.date)}</div>
            <div style="color: #aaa; font-size: 13px;">Kullanıcı: ${escapeHtml(event.data?.surucu || '-')}${hasarStr}</div>
            ${parcalarHtml}
            ${aciklamaHtml}
          </div>`;
        });
      }
    } else if (tabType === 'km') {
      const kmEvents = events.filter(e => e.type === 'km-revize');
      if (kmEvents.length === 0) {
        html = '<div style="text-align: center; color: #888; padding: 20px;">Km güncelleme kaydı bulunmamaktadır.</div>';
      } else {
        kmEvents.forEach(event => {
          // Km revizyon formatı: gg/aa/yyyy - Km Revize
          const eskiKm = event.data?.eskiKm || '-';
          const yeniKm = event.data?.yeniKm || '-';
          const surucuStr = event.data?.surucu ? `Kullanıcı: ${escapeHtml(event.data.surucu)}` : '';
          html += `<div class="history-item" style="padding: 12px; border-bottom: 1px solid rgba(255, 255, 255, 0.1);">
            <div style="font-weight: 600; color: #e0e0e0; font-size: 12px; margin-bottom: 4px;">${escapeHtml(event.date)} - Km Revize</div>
            <div style="color: #aaa; font-size: 12px; margin-top: 4px;">Önceki Km; ${escapeHtml(formatNumber(eskiKm))} - Güncellenen Km; ${escapeHtml(formatNumber(yeniKm))}</div>
            ${surucuStr ? `<div style="color: #888; font-size: 12px; margin-top: 4px;">${surucuStr}</div>` : ''}
          </div>`;
        });
      }
    } else if (tabType === 'sube') {
      const branches = readBranches();
      const subeEvents = events.filter(e => e.type === 'sube-degisiklik' || e.type === 'kullanici-atama' || e.type === 'sigorta-guncelle' || e.type === 'kasko-guncelle' || e.type === 'muayene-guncelle' || e.type === 'anahtar-guncelle' || e.type === 'kredi-guncelle' || e.type === 'lastik-guncelle' || e.type === 'satis');
      if (subeEvents.length === 0) {
        html = '<div style="text-align: center; color: #888; padding: 20px;">Şube/Kullanıcı geçmişi bulunmamaktadır.</div>';
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
          else if (event.type === 'satis') label = 'Satış/Pert';
          
          let descText = escapeHtml(label);
          if (event.type === 'kullanici-atama') {
            const yeni = event.data?.kullaniciAdi || '-';
            const eski = event.data?.eskiKullaniciAdi;
            descText += ` - ${escapeHtml(yeni)}${eski ? ` (${escapeHtml(eski)})` : ''}`;
          } else if (event.type === 'sube-degisiklik') {
            const yeni = event.data?.yeniSubeAdi || branches.find(b => b.id === event.data?.yeniSubeId)?.name || '-';
            const eski = event.data?.eskiSubeAdi || branches.find(b => b.id === event.data?.eskiSubeId)?.name || '';
            descText += ` - ${escapeHtml(yeni)}${eski ? ` (${escapeHtml(eski)})` : ''}`;
          }
          html += `<div class="history-item history-item-sube" style="padding: 12px; border-bottom: 1px solid rgba(255, 255, 255, 0.1);">
            <div style="margin-bottom: 4px;"><span class="history-date">${escapeHtml(event.date)}</span> - <span class="history-desc">${descText}</span></div>
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

  // kayit.js deleteVehicle sonrası liste yenilemesi için global erişim
  window.renderVehicles = renderVehicles;

})();