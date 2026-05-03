/* =========================================
   RAPORLAR MODÜLÜ - SEKME YAPILI
   ========================================= */

(function() {
    // Taşıt listesi: getMedisaVehicles (oturum kapsamı); arşiv satildiMi === true hariç — taşıtlar şube kartları ile aynı kural.
    function getVehicles() {
        var raw = (typeof window.getMedisaVehicles === 'function' ? window.getMedisaVehicles() : null) || [];
        return raw.filter(function(v) {
            return v && v.satildiMi !== true;
        });
    }
    function getBranches() { return (typeof window.getMedisaBranches === 'function' ? window.getMedisaBranches() : null) || []; }
    function getUsers() { return (typeof window.getMedisaUsers === 'function' ? window.getMedisaUsers() : null) || []; }

    /** Stok/Excel/yazdır: KM sütunu — taşıtlar listesiyle aynı kaynak (güncel km öncelikli). */
    function getVehicleReportKmRaw(vehicle) {
        if (!vehicle) return '';
        var g = vehicle.guncelKm;
        if (g != null && String(g).trim() !== '') return g;
        var k = vehicle.km;
        return k != null && String(k).trim() !== '' ? k : '';
    }

    function toTitleCase(str) { return (typeof window.toTitleCase === 'function' ? window.toTitleCase(str) : str); }
    function formatBrandModel(str) { return (typeof window.formatBrandModel === 'function' ? window.formatBrandModel(str) : toTitleCase(str)); }
    function formatPlaka(str) { return (typeof window.formatPlaka === 'function' ? window.formatPlaka(str) : (str == null ? '-' : String(str))); }
    function formatAdSoyad(str) { return (typeof window.formatAdSoyad === 'function' ? window.formatAdSoyad(str) : str); }

    // Stok görünümü state (null: şube grid; 'all' / id: liste)
    let stokCurrentBranchId = null;
    let stokSortState = {}; // { columnKey: 'asc' | 'desc' | null }
    let stokAutoSingleBranchView = false;
    
    // --- Rapor Sekmesi State ---
    
    // Kullanıcı görünümü state (aynı null / all / id anlamı)
    let kullaniciCurrentBranchId = null;
    let kullaniciSearchTerm = ''; // Arama terimi
    let kullaniciCurrentUserId = null; // Seçili kullanıcı ID'si (detay görünümü için)
    let stokActiveColumns = {
        sigorta: false,
        kasko: false,
        kaskoDegeri: false,
        muayene: false,
        kredi: false,
        lastik: false,
        utts: false,
        takip: false,
        tramer: false,
        boya: false,
        kullanici: false,
        tescil: false
    };
    let stokColumnOrder = []; // Aktif detay sütunların sırası
    let stokBaseColumnOrder = ['sira', 'sube', 'yil', 'marka', 'plaka', 'sanziman', 'km']; // Temel sütunların sırası
    let stokDetailMenuOpen = false; // Detay Ekleme menüsü açık mı (toggle için tek kaynak)

    const STOK_BASE_COLUMNS = ['sira', 'sube', 'yil', 'marka', 'plaka', 'sanziman', 'km'];
    const STOK_DETAIL_COLUMNS = ['sigorta', 'kasko', 'kaskoDegeri', 'muayene', 'kredi', 'lastik', 'utts', 'takip', 'tramer', 'boya', 'kullanici', 'tescil'];
    let stokTouchColumnDrag = {
        active: false,
        dragging: false,
        columnKey: null,
        startX: 0,
        startY: 0,
        lastDropTarget: null,
        longPressTimer: null,
        sourceCell: null,
        ghostEl: null,
        suppressClickUntil: 0
    };

    function loadStokColumnState() {
        var load = typeof window.loadColumnState === 'function' ? window.loadColumnState : function(k, def) { try { var r = localStorage.getItem(k); return r ? JSON.parse(r) : def; } catch (e) { return def; } };
        /* Her oturumda detay sütunları kapalı başlasın (mobil + masaüstü); sıra tercihleri yüklenir */
        stokActiveColumns = {
            sigorta: false,
            kasko: false,
            kaskoDegeri: false,
            muayene: false,
            kredi: false,
            lastik: false,
            utts: false,
            takip: false,
            tramer: false,
            boya: false,
            kullanici: false,
            tescil: false
        };
        var savedOrder = load('stok_column_order', []);
        if (Array.isArray(savedOrder)) stokColumnOrder = savedOrder;
        var savedBaseOrder = load('stok_base_column_order', ['sira', 'sube', 'yil', 'marka', 'plaka', 'sanziman', 'km']);
        if (Array.isArray(savedBaseOrder)) {
            if (savedBaseOrder.indexOf('plaka') === -1) {
                stokBaseColumnOrder = ['sira', 'sube', 'yil', 'marka', 'plaka', 'sanziman', 'km'];
                saveStokColumnState();
            } else stokBaseColumnOrder = savedBaseOrder;
        }
    }
    function saveStokColumnState() {
        var save = typeof window.saveColumnState === 'function' ? window.saveColumnState : function(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
        save('stok_active_columns', stokActiveColumns);
        save('stok_column_order', stokColumnOrder);
        save('stok_base_column_order', stokBaseColumnOrder);
    }

    function isMobileStokViewport() {
        return (typeof window.matchMedia === 'function')
            ? window.matchMedia('(max-width: 640px)').matches
            : window.innerWidth <= 640;
    }

    function getSingleVisibleStokBranch() {
        const branches = getBranches();
        return branches.length === 1 ? branches[0] : null;
    }

    // --- Modal ve Sekme Yönetimi ---
    window.openReportsView = function() {
        const modal = document.getElementById('reports-modal');
        if (modal) {
            loadStokColumnState(); // Aktif sütunları yükle
            stokCurrentBranchId = null; // Grid görünümüne dön
            stokAutoSingleBranchView = false;
            switchReportTab({ allowSingleBranchBypass: true }); // Sekme UI + içerik render
            modal.style.display = 'flex';
            requestAnimationFrame(() => modal.classList.add('active'));
            document.body.classList.add('modal-open');
        }
    };

    window.switchReportTab = function(options) {
        const viewStok = document.getElementById('view-stok');
        if (viewStok) { viewStok.classList.add('active'); }
        renderStokView(options);
    };

    window.closeReportsModal = function() {
        const modal = document.getElementById('reports-modal');
        if (modal) {
            if (stokDetailMenuOpen) stokDetailMenuOpen = false;
            modal.classList.remove('active');
            setTimeout(() => {
                modal.style.display = 'none';
                document.body.classList.remove('modal-open');
            }, 300);
        }
    };


    // --- 1. SEKME: STOK GÖRÜNÜMÜ ---
    
    // Sütun başlık metinleri (responsive)
    function getColumnHeaderText(colKey) {
        const isMobile = window.innerWidth <= 640;
        const isVerySmall = window.innerWidth <= 480;
        const isTiny = window.innerWidth <= 360;
        const isDesktop = window.innerWidth >= 641;
        
        const headers = {
            'sira': 'No.',
            'sube': 'Şube',
            'yil': 'Yıl',
            'marka': isTiny ? 'Mrk' : isVerySmall ? 'Marka' : isDesktop ? 'Marka / Model' : 'Marka/Model',
            'plaka': 'Plaka',
            'sanziman': isTiny ? 'Ş.' : isVerySmall ? 'Şanz.' : isDesktop ? 'Şanz.' : 'Şanzıman',
            'km': 'KM',
            'sigorta': isVerySmall ? 'Sig.' : isMobile ? 'Sigorta' : 'Sigorta Bitiş',
            'kasko': isVerySmall ? 'Kas.' : isMobile ? 'Kasko' : 'Kasko Bitiş',
            'muayene': isVerySmall ? 'Muay.' : isMobile ? 'Muayene' : 'Muayene T.',
            'egzozMuayene': isTiny ? 'Egz.' : 'Egzoz',
            'kredi': isTiny ? 'Hak' : isVerySmall ? 'Hak M.' : isMobile ? 'Hak M.' : 'Hak Mahr.',
            'lastik': isTiny ? 'Y/K' : isVerySmall ? 'Yaz/Kış' : isMobile ? 'Yazlık/Kışlık' : 'Lastikler',
            'utts': 'UTTS',
            'takip': isVerySmall ? 'Tkp' : isMobile ? 'Takip' : 'Takip Cihazı',
            'tramer': 'Tramer',
            'boya': isVerySmall ? 'Boy.' : isMobile ? 'Boya' : 'Boya Değişen',
            'kullanici': isVerySmall ? 'Kull.' : isMobile ? 'Kullanıcı' : 'Kullanıcı',
            'tescil': isVerySmall ? 'Tescil' : isMobile ? 'Tescil T.' : 'Tescil Tarihi',
            'kaskoDegeri': isVerySmall ? 'Kas.' : isMobile ? 'Kasko Değeri' : 'Kasko Değeri'
        };
        
        return headers[colKey] || colKey;
    }

    // Şube Grid Render
    function renderStokBranchGrid() {
        const gridContainer = document.getElementById('stok-branch-grid');
        const listContainer = document.getElementById('stok-list-container');
        const headerActions = document.getElementById('reports-list-header-actions');
        stokAutoSingleBranchView = false;
        if (headerActions) {
            headerActions.innerHTML = '';
            headerActions.setAttribute('aria-hidden', 'true');
            headerActions.classList.remove('has-stok-actions');
        }
        if (!gridContainer) return;
        
        const branches = getBranches();
        const vehicles = getVehicles();
        
        // Grid görünümünü göster, liste görünümünü gizle
        if (gridContainer) gridContainer.style.display = 'flex';
        if (listContainer) {
            listContainer.style.display = 'none';
            listContainer.innerHTML = '';
        }
        
        // "Tümü" kartı
        const totalCount = vehicles.length;
        let html = `
            <div class="stok-branch-card all-card ${stokCurrentBranchId === 'all' ? 'active' : ''}" 
                 onclick="selectStokBranch('all')">
                <div class="stok-branch-name">TÜMÜ</div>
                <div class="stok-branch-count">${totalCount} Taşıt</div>
            </div>
        `;

        // Şube kartları
        branches.forEach(branch => {
            const branchVehicles = vehicles.filter(v => v.branchId === branch.id);
            const count = branchVehicles.length;
            const isActive = stokCurrentBranchId === branch.id;
            
            html += `
                <div class="stok-branch-card ${isActive ? 'active' : ''}" 
                     onclick="selectStokBranch('${escapeHtml(branch.id)}')">
                    <div class="stok-branch-name">${escapeHtml(String(branch.name || '').toLocaleUpperCase('tr-TR'))}</div>
                    <div class="stok-branch-count">${count} Taşıt</div>
                </div>
            `;
        });
        
        gridContainer.innerHTML = html;
    }

    // Şube Seçimi
    window.selectStokBranch = function(branchId) {
        stokCurrentBranchId = branchId;
        stokAutoSingleBranchView = false;
        renderStokView();
    };

    function getStokListScrollContainer(listRoot) {
        if (!listRoot) return null;
        const directChild = Array.from(listRoot.children || []).find(function(child) {
            return child && child.classList && child.classList.contains('stok-list-container');
        });
        return directChild || listRoot.querySelector('.stok-list-container');
    }

    function captureStokListScrollState(listRoot) {
        const scrollEl = getStokListScrollContainer(listRoot);
        if (!scrollEl) return null;
        return {
            left: scrollEl.scrollLeft || 0,
            top: scrollEl.scrollTop || 0
        };
    }

    function restoreStokListScrollState(listRoot, scrollState) {
        if (!scrollState) return;
        requestAnimationFrame(function() {
            const scrollEl = getStokListScrollContainer(listRoot);
            if (!scrollEl) return;
            const maxLeft = Math.max(0, scrollEl.scrollWidth - scrollEl.clientWidth);
            const maxTop = Math.max(0, scrollEl.scrollHeight - scrollEl.clientHeight);
            scrollEl.scrollLeft = Math.min(scrollState.left || 0, maxLeft);
            scrollEl.scrollTop = Math.min(scrollState.top || 0, maxTop);
        });
    }

    // Liste Görünümü Render
    function renderStokList() {
        const gridContainer = document.getElementById('stok-branch-grid');
        const listContainer = document.getElementById('stok-list-container');
        
        if (!listContainer) return;
        const previousScrollState = captureStokListScrollState(listContainer);
        cleanupStokTouchColumnDrag();
        
        // Detay menü açık/kapalı tek kaynak: stokDetailMenuOpen (liste yeniden render'da korunur)
        
        // Grid görünümünü gizle, liste görünümünü göster
        if (gridContainer) gridContainer.style.display = 'none';
        if (listContainer) listContainer.style.display = 'block';
        
        let vehicles = getVehicles();
        const branches = getBranches();
        
        // Filtreleme
        if (stokCurrentBranchId === 'all') {
            // Tüm taşıtlar
        } else if (stokCurrentBranchId) {
            vehicles = vehicles.filter(v => v.branchId === stokCurrentBranchId);
            } else {
            // Grid görünümünde, liste render edilmemeli
            return;
        }
        
        // Arama filtresi
        const searchTerm = window.stokSearchTerm || '';
        if (searchTerm) {
            vehicles = vehicles.filter(v => {
                const year = String(v.year || '').toLowerCase();
                const brandModel = (v.brandModel || '').toLowerCase();
                const user = getVehicleUser(v).toLowerCase();
                const branch = v.branchId ? (branches.find(b => b.id === v.branchId)?.name || '').toLowerCase() : '';
                
                return year.includes(searchTerm) || 
                       brandModel.includes(searchTerm) || 
                       user.includes(searchTerm) || 
                       branch.includes(searchTerm);
            });
        }
        
        // Sıralama uygula
        vehicles = applyStokSorting(vehicles);
        
        // Sütun başlıklarını oluştur
        const headerRow = createStokHeaderRow();
        const rows = vehicles.map((v, index) => createStokDataRow(v, index + 1, branches));
        
        // Bugünün tarihini formatla (gg/aa/yyyy)
        const today = new Date();
        const todayStr = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
        const todayInputValue = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        const hasDetailColumns = Object.values(stokActiveColumns).some(Boolean);
        const backNavigationHtml = stokAutoSingleBranchView ? '' : `
                    <div class="universal-back-bar">
                        <button type="button" class="universal-back-btn" onclick="goBackToStokGrid()" title="Raporlar">
                            <svg class="back-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                            <span class="universal-back-label">Raporlar</span>
                        </button>
                    </div>
        `;

        listContainer.innerHTML = `
            <div class="stok-list-top-controls">
                <div class="stok-controls-row-1">
                    ${backNavigationHtml}
                    <button class="stok-detail-add-btn ${stokDetailMenuOpen ? 'active' : ''}" onclick="toggleStokDetailMenu()">+ Detay Ekleme</button>
                </div>
                <div class="stok-controls-row-2">
                    <div class="stok-export-controls">
                        <div class="stok-export-left">
                            <div class="stok-search-wrap">
                                <button class="stok-search-btn" onclick="toggleStokSearch(this, event)" title="Ara">
                                    🔍
                                </button>
                                <div id="stok-search-container" class="stok-search-container">
                                    <input type="text" id="stok-search-input" class="stok-search-input" placeholder="Üretim yılı, marka/model, kullanıcı, şube ara..." oninput="handleStokSearch(this.value)">
                                </div>
                            </div>
                            <button class="stok-export-btn" onclick="exportStokToExcel()" title="Excel'e Aktar">
                                <span class="excel-icon">X</span>
                            </button>
                            <button class="stok-print-btn" onclick="printStokReport()" title="Yazdır">
                                🖨️
                            </button>
                        </div>
                    </div>
                    <div id="stok-detail-menu" class="stok-detail-menu ${stokDetailMenuOpen ? 'stok-detail-menu-open' : ''}"></div>
                    <div class="stok-date-range-controls">
                        <div class="stok-date-input-group">
                            <label for="stok-date-start">Başlangıç T.</label>
                            <input type="date" id="stok-date-start" class="stok-date-input" placeholder="">
                        </div>
                        <div class="stok-date-input-group">
                            <label for="stok-date-end">Bitiş T.</label>
                            <input type="date" id="stok-date-end" class="stok-date-input stok-date-has-value" value="${todayInputValue}">
                        </div>
                    </div>
                </div>
            </div>
            <div class="stok-list-container" ${hasDetailColumns ? 'data-has-detail-columns="true"' : ''}>
                <table class="stok-list-table">
                    <thead class="stok-list-header">
                        ${headerRow}
                    </thead>
                    <tbody>
                        ${rows.join('')}
                    </tbody>
                </table>
            </div>
        `;

        // Sol ok + Detay Ekleme satırını ve menüyü header slotuna taşı (menü butonun hemen altında açılsın)
        const headerActions = document.getElementById('reports-list-header-actions');
        if (headerActions) {
            const firstRow = listContainer.querySelector('.stok-controls-row-1');
            const secondRow = listContainer.querySelector('.stok-controls-row-2');
            const menu = document.getElementById('stok-detail-menu');
            headerActions.innerHTML = '';
            const wrap = document.createElement('div');
            wrap.className = 'stok-detail-add-wrap';
            if (firstRow) {
                wrap.appendChild(firstRow.cloneNode(true));
            } else {
                // Fallback: clone yoksa satırı elle oluştur (Detay Ekleme butonu kaybolmasın)
                const row = document.createElement('div');
                row.className = 'stok-controls-row-1';
                row.innerHTML = `
                    ${backNavigationHtml}
                    <button class="stok-detail-add-btn ${stokDetailMenuOpen ? 'active' : ''}" onclick="toggleStokDetailMenu()">+ Detay Ekleme</button>
                `;
                wrap.appendChild(row);
            }
            const row1 = wrap.querySelector('.stok-controls-row-1');
            const addBtn = row1.querySelector('.stok-detail-add-btn');
            const backBar = row1.querySelector('.universal-back-bar');
            /* Masaüstü: leftBlock oluşturma – backBar ve addBtn row1'de yan yana kalır (CSS ile ortalı) */
            if (menu) {
                if (!window.matchMedia('(min-width: 641px)').matches) {
                    wrap.appendChild(menu);
                }
            }
            const topControls = listContainer.querySelector('.stok-list-top-controls');
            /* Masaüstü: row-2 (export + tarihler) header'a taşı; menü row1 ile row2 arasında */
            if (secondRow && window.matchMedia('(min-width: 641px)').matches) {
                wrap.appendChild(secondRow);
                if (menu) {
                    wrap.insertBefore(menu, wrap.querySelector('.stok-controls-row-2'));
                }
                wrap.classList.add('desktop-single-row');
            }
            /* Resize: mobilde row-2 body'ye geri taşı; menü row-1 ↔ wrap arasında senkronize et */
            const mq = window.matchMedia('(min-width: 641px)');
            if (secondRow && topControls) {
                const syncRow2 = function() {
                    const r2 = wrap.querySelector('.stok-controls-row-2') || topControls.querySelector('.stok-controls-row-2');
                    if (!r2) return;
                    if (mq.matches) {
                        if (r2.parentElement === topControls) {
                            wrap.appendChild(r2);
                            wrap.classList.add('desktop-single-row');
                        }
                    } else {
                        if (r2.parentElement === wrap) {
                            topControls.appendChild(r2);
                            wrap.classList.remove('desktop-single-row');
                        }
                    }
                };
                mq.addEventListener('change', syncRow2);
            }
            if (menu && row1) {
                const syncMenu = function() {
                    const r2 = wrap.querySelector('.stok-controls-row-2') || topControls.querySelector('.stok-controls-row-2');
                    if (mq.matches) {
                        /* Masaüstü: menü wrap içinde row1 ile row2 arasında */
                        if (r2 && menu.parentElement === r2) {
                            wrap.insertBefore(menu, r2);
                        } else if (!r2 && wrap.contains(menu) && menu.parentElement !== wrap) {
                            wrap.appendChild(menu);
                        }
                    } else {
                        /* Mobil: menü row2 içinde (export ile tarih arasında) */
                        if (r2 && menu.parentElement !== r2) {
                            const dateControls = r2.querySelector('.stok-date-range-controls');
                            r2.insertBefore(menu, dateControls || null);
                        }
                    }
                };
                mq.addEventListener('change', syncMenu);
            }
            headerActions.appendChild(wrap);
            headerActions.setAttribute('aria-hidden', 'false');
            headerActions.classList.add('has-stok-actions');
        }

        // Detay menüsünü render et
        renderStokDetailMenu();
        
        // Tarih inputlarına placeholder ekle
        setTimeout(() => {
            const startInput = document.getElementById('stok-date-start');
            const endInput = document.getElementById('stok-date-end');
            const mutedDateColor = '#a0aec0';
            
            // Başlangıç tarihi: boş <input type="date"> WebKit bazen tema CSS’ini beyaza basar — bitiş ile aynı satır içi gri
            if (startInput) {
                const existingPlaceholder = startInput.parentElement.querySelector('.date-placeholder');
                if (existingPlaceholder) {
                    existingPlaceholder.remove();
                }
                const keepStartMuted = function() {
                    startInput.style.setProperty('color', mutedDateColor, 'important');
                    startInput.style.setProperty('-webkit-text-fill-color', mutedDateColor, 'important');
                };
                keepStartMuted();
                startInput.addEventListener('change', keepStartMuted);
                startInput.addEventListener('input', keepStartMuted);
                startInput.addEventListener('focus', keepStartMuted);
                startInput.addEventListener('blur', keepStartMuted);
                requestAnimationFrame(function() {
                    keepStartMuted();
                    requestAnimationFrame(keepStartMuted);
                });
            }
            
            // Bitiş tarihi için value zaten var, placeholder ekleme
            // setupDatePlaceholder HİÇ çağrılmasın çünkü rengi transparent yapıyor
            if (endInput) {
                // Value'nun doğru set edildiğinden emin ol
                const today = new Date();
                const todayValue = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
                endInput.value = todayValue;
                
                // Input'un rengini gri tut
                endInput.style.setProperty('color', mutedDateColor, 'important');
                endInput.style.setProperty('-webkit-text-fill-color', mutedDateColor, 'important');
                endInput.style.color = mutedDateColor;
                
                // Eğer bir şekilde placeholder oluşturulmuşsa kaldır
                const existingPlaceholder = endInput.parentElement.querySelector('.date-placeholder');
                if (existingPlaceholder) {
                    existingPlaceholder.remove();
                }
                
                // Input'un rengini koru - herhangi bir değişiklikte tekrar set et
                const keepColorMuted = () => {
                    if (endInput.value) {
                        endInput.style.setProperty('color', mutedDateColor, 'important');
                        endInput.style.setProperty('-webkit-text-fill-color', mutedDateColor, 'important');
                    }
                };
                
                // Input değiştiğinde rengi koru
                endInput.addEventListener('change', keepColorMuted);
                endInput.addEventListener('input', keepColorMuted);
                endInput.addEventListener('focus', keepColorMuted);
                endInput.addEventListener('blur', keepColorMuted);
                
                // İlk yüklemede de rengi set et
                keepColorMuted();
            }
        }, 50);
        
        // Mobil: liste tek hamlede ya yatay ya dikey kaysın (eksen kilidi)
        attachStokColumnTouchListeners(listContainer);
        setupStokListTouchAxisLock();
        // Marka ve şube hücreleri: sütun daraldıkça font kontrollü küçülsün
        adjustStokResponsiveCellFontSizes();
        restoreStokListScrollState(listContainer, previousScrollState);
    }

    // Marka ve şube hücreleri: önce satır kır, yine taşarsa fontu kontrollü küçült.
    function adjustStokResponsiveCellFontSizes() {
        const listContainer = document.getElementById('stok-list-container');
        if (!listContainer) return;
        const responsiveCells = listContainer.querySelectorAll('.stok-list-cell[data-col="marka"], .stok-list-cell[data-col="sube"]');
        requestAnimationFrame(function() {
            responsiveCells.forEach(function(cell) {
                if (cell.offsetHeight === 0) return;
                cell.style.fontSize = '';
                var baseFontSize = parseFloat(window.getComputedStyle(cell).fontSize) || 12;
                var minFontSize = Math.max(baseFontSize - 1.5, cell.dataset.col === 'sube' ? 10.5 : 11);
                var current = baseFontSize;
                while ((cell.scrollHeight > cell.offsetHeight || cell.scrollWidth > cell.clientWidth) && current > minFontSize) {
                    current = Math.max(minFontSize, current - 0.5);
                    cell.style.fontSize = current + 'px';
                    if (current === minFontSize) break;
                }
            });
        });
        // Resize'da tekrar hesapla (debounce)
        if (!window._stokResponsiveCellResize) {
            window._stokResponsiveCellResize = true;
            var onResize = window.debounce ? window.debounce(function () {
                const container = document.getElementById('stok-list-container');
                if (container && container.querySelector('.stok-list-cell[data-col="marka"], .stok-list-cell[data-col="sube"]')) {
                    adjustStokResponsiveCellFontSizes();
                }
            }, 100) : function () {
                const container = document.getElementById('stok-list-container');
                if (container && container.querySelector('.stok-list-cell[data-col="marka"], .stok-list-cell[data-col="sube"]')) {
                    adjustStokResponsiveCellFontSizes();
                }
            };
            window.addEventListener('resize', onResize);
        }
    }

    // Sütun genişliklerini hesapla (key bazlı: sürükle-bırak sonrası genişlik doğru sütunla kalır)
    // Masaüstü dengeleme: No dar, Marka/Model kontrollü, KM daha geniş
    // 7 sütun: fr ile sığar; 8+ sütun: sabit px
    function getColumnWidths(allColumns) {
        const hasDetail = allColumns.length > 7;
        const isMobile = window.innerWidth <= 640;

        if (hasDetail) {
            // 8+ sütun: sabit px. Masaüstünde Şube 4px genişler; denge için Marka 4px daralır.
            const basePx = isMobile
                ? {
                    'sira': 26, 'sube': 81, 'yil': 41, 'marka': 134,
                    'plaka': 68, 'sanziman': 64, 'km': 60
                }
                : {
                    'sira': 24, 'sube': 84, 'yil': 41, 'marka': 116,
                    'plaka': 68, 'sanziman': 67, 'km': 76
                };
            const detailPx = {
                'sigorta': 72, 'kasko': 72, 'kaskoDegeri': 72, 'muayene': 72, 'kredi': 56,
                'lastik': 56, 'utts': 52, 'takip': 56, 'tramer': 52,
                'boya': 56, 'kullanici': 72, 'tescil': 72
            };
            return allColumns.map(col => {
                const w = basePx[col.key] ?? detailPx[col.key] ?? 64;
                return w + 'px';
            }).join(' ');
        }

        // Sadece temel: mobil/masaüstü için ayrı orantı seti
        const columnWidths = isMobile
            ? {
                'sira': 'minmax(26px, 0.3fr)', 'sube': 'minmax(47px, 1.2fr)',
                'yil': 'minmax(40px, 0.6fr)', 'marka': 'minmax(58px, 1.8fr)',
                'plaka': 'minmax(56px, 1fr)', 'sanziman': 'minmax(59px, 0.95fr)',
                'km': 'minmax(48px, 1fr)'
            }
            : {
                'sira': 'minmax(22px, 0.2fr)', 'sube': 'minmax(64px, 1.02fr)',
                'yil': 'minmax(40px, 0.55fr)', 'marka': 'minmax(72px, 1.81fr)',
                'plaka': 'minmax(60px, 1fr)', 'sanziman': 'minmax(60px, 0.9fr)',
                'km': 'minmax(64px, 1.22fr)'
            };
        return allColumns.map(col => columnWidths[col.key] || '80px').join(' ');
    }

    // Sütun başlık satırı oluştur
    function createStokHeaderRow() {
        const baseColumns = [
            { key: 'sira', sortable: false },
            { key: 'sube', sortable: true },
            { key: 'yil', sortable: true },
            { key: 'marka', sortable: true },
            { key: 'plaka', sortable: true },
            { key: 'sanziman', sortable: true },
            { key: 'km', sortable: true }
        ];

        const detailColumns = [
            { key: 'sigorta', sortable: true },
            { key: 'kasko', sortable: true },
            { key: 'kaskoDegeri', sortable: true },
            { key: 'muayene', sortable: true },
            { key: 'kredi', sortable: true },
            { key: 'lastik', sortable: true },
            { key: 'utts', sortable: true },
            { key: 'takip', sortable: true },
            { key: 'tramer', sortable: true },
            { key: 'boya', sortable: true },
            { key: 'kullanici', sortable: true },
            { key: 'tescil', sortable: true }
        ];

        // Tüm sütunları birleştir (temel + aktif detay)
        const allColumns = [];

        // Temel sütunları sıraya göre ekle
        stokBaseColumnOrder.forEach(colKey => {
            const col = baseColumns.find(c => c.key === colKey);
            if (col) allColumns.push(col);
        });

        // Aktif detay sütunlarını sıraya göre ekle
        if (stokColumnOrder.length > 0) {
            stokColumnOrder.forEach(colKey => {
                if (stokActiveColumns[colKey]) {
                    const col = detailColumns.find(c => c.key === colKey);
                    if (col) allColumns.push(col);
                }
            });
            // Sırada olmayan ama aktif olan sütunları sona ekle
            detailColumns.forEach(col => {
                if (stokActiveColumns[col.key] && !stokColumnOrder.includes(col.key)) {
                    allColumns.push(col);
                }
            });
        } else {
            // İlk kez - varsayılan sıraya göre ekle
            detailColumns.forEach(col => {
                if (stokActiveColumns[col.key]) {
                    allColumns.push(col);
                }
            });
        }

        let columns = allColumns;

        // Grid sütun genişliklerini hesapla
        const gridTemplateColumns = getColumnWidths(columns);

        return `<tr class="stok-list-header-row" style="grid-template-columns: ${gridTemplateColumns}">${columns.map(col => {
            const sortState = stokSortState[col.key] || null;
            const sortIcon = sortState === 'asc' ? '↑' : sortState === 'desc' ? '↓' : '↕';
            const sortClass = sortState ? 'active' : '';
            
            const draggableAttr = isMobileStokViewport() ? '' : 'draggable="true"';
            
            if (col.sortable) {
                return `
                    <th class="stok-list-header-cell stok-sortable-header" 
                        data-col="${col.key}"
                        ${draggableAttr}
                        ondragstart="handleColumnHeaderDragStart(event, '${col.key}')"
                        ondragover="handleColumnHeaderDragOver(event)"
                        ondrop="handleColumnHeaderDrop(event, '${col.key}')"
                        ondragenter="handleColumnHeaderDragEnter(event)"
                        ondragleave="handleColumnHeaderDragLeave(event)"
                        ondragend="handleColumnHeaderDragEnd(event)"
                        onclick="sortStokList('${col.key}')">
                        <span class="stok-header-text">${getColumnHeaderText(col.key)}</span>
                        <span class="stok-sort-icon ${sortClass}">${sortIcon}</span>
                    </th>
                `;
            } else {
                const headerText = getColumnHeaderText(col.key);
                return `
                    <th class="stok-list-header-cell" 
                        data-col="${col.key}"
                        ${draggableAttr}
                        ondragstart="handleColumnHeaderDragStart(event, '${col.key}')"
                        ondragover="handleColumnHeaderDragOver(event)"
                        ondrop="handleColumnHeaderDrop(event, '${col.key}')"
                        ondragenter="handleColumnHeaderDragEnter(event)"
                        ondragleave="handleColumnHeaderDragLeave(event)"
                        ondragend="handleColumnHeaderDragEnd(event)">
                        ${headerText ? `<span class="stok-header-text">${headerText}</span>` : ''}
                    </th>
                `;
            }
        }).join('')}</tr>`;
    }

    function getStokDateWarningClass(dateValue) {
        if (!dateValue || typeof window.checkDateWarnings !== 'function') return '';
        const warning = window.checkDateWarnings(dateValue);
        if (!warning || typeof warning.class !== 'string') return '';
        return warning.class;
    }

    function getStokMuayeneCombinedWarningClass(vehicle) {
        if (!vehicle) return '';
        var wM = getStokDateWarningClass(vehicle.muayeneDate);
        var wE = getStokDateWarningClass(vehicle.egzozMuayeneDate);
        if (wM === 'date-warning-red' || wE === 'date-warning-red') return 'date-warning-red';
        if (wM === 'date-warning-orange' || wE === 'date-warning-orange') return 'date-warning-orange';
        return '';
    }

    // Veri satırı oluştur
    function createStokDataRow(vehicle, rowNum, branches) {
        const branch = vehicle.branchId ? branches.find(b => b.id === vehicle.branchId) : null;
        const branchName = branch ? branch.name : '-';

        // Base cell'leri stokBaseColumnOrder sırasına göre oluştur (format: şube/marka title case, plaka büyük harf)
        const baseCellData = {
            'sira': rowNum,
            'sube': toTitleCase(branchName),
            'yil': vehicle.year || '-',
            'marka': formatBrandModel(vehicle.brandModel || '-'),
            'plaka': formatPlaka(vehicle.plate || '-'),
            'sanziman': vehicle.transmission === 'manuel' ? 'Manuel' : vehicle.transmission === 'otomatik' ? 'Otomatik' : '-',
            'km': (function() {
                var kmRaw = getVehicleReportKmRaw(vehicle);
                return kmRaw !== '' ? formatNumber(kmRaw) : '-';
            })()
        };

        const baseCells = stokBaseColumnOrder.map(key => ({
            key: key,
            value: baseCellData[key] || '-'
        }));

        const detailCells = [
            {
                key: 'sigorta',
                value: vehicle.sigortaDate ? formatDate(vehicle.sigortaDate) : '-',
                warningClass: getStokDateWarningClass(vehicle.sigortaDate)
            },
            {
                key: 'kasko',
                value: vehicle.kaskoDate ? formatDate(vehicle.kaskoDate) : '-',
                warningClass: getStokDateWarningClass(vehicle.kaskoDate)
            },
            { key: 'kaskoDegeri', value: (function() {
                var yearForKasko = vehicle.year || vehicle.modelYili || '';
                var kaskoDegeri = vehicle.kaskoDegeri;
                if (kaskoDegeri == null || kaskoDegeri === '') {
                    kaskoDegeri = (typeof window.getKaskoDegeri === 'function') ? window.getKaskoDegeri(vehicle.kaskoKodu, yearForKasko) : '-';
                }
                if (kaskoDegeri == null || String(kaskoDegeri).trim() === '') kaskoDegeri = '-';
                if (kaskoDegeri === '-' && (!vehicle.kaskoKodu || String(vehicle.kaskoKodu).trim() === '')) {
                    kaskoDegeri = 'Kasko kodu girilmedi';
                } else if (kaskoDegeri === '-' && !(typeof window.hasAnyKaskoListData === 'function' ? window.hasAnyKaskoListData() : !!localStorage.getItem('medisa_kasko_liste'))) {
                    kaskoDegeri = 'Excel yüklenmedi';
                }
                return String(kaskoDegeri).trim() || '-';
            })() },
            {
                key: 'muayene',
                value: formatStokMuayeneCell(vehicle),
                warningClass: getStokMuayeneCombinedWarningClass(vehicle)
            },
            { key: 'kredi', value: vehicle.kredi === 'var' ? 'Var' : vehicle.kredi === 'yok' ? 'Yok' : '-' },
            { key: 'lastik', value: vehicle.lastikDurumu === 'var' ? 'Var' : vehicle.lastikDurumu === 'yok' ? 'Yok' : '-' },
            { key: 'utts', value: vehicle.uttsTanimlandi ? 'Evet' : 'Hayır' },
            { key: 'takip', value: vehicle.takipCihaziMontaj ? 'Evet' : 'Hayır' },
            { key: 'tramer', value: vehicle.tramer === 'var' ? 'Var' : vehicle.tramer === 'yok' ? 'Yok' : '-' },
            { key: 'boya', value: vehicle.boya === 'var' ? 'Var' : vehicle.boya === 'yok' ? 'Yok' : '-' },
            { key: 'kullanici', value: formatAdSoyad(getVehicleUser(vehicle)) },
            { key: 'tescil', value: vehicle.tescilTarihi ? formatDate(vehicle.tescilTarihi) : '-' }
        ];

        let cells = [...baseCells];

        // Aktif detay sütunlarını sıraya göre ekle
        if (stokColumnOrder.length > 0) {
            // Kaydedilmiş sıraya göre ekle
            stokColumnOrder.forEach(cellKey => {
                if (stokActiveColumns[cellKey]) {
                    const cell = detailCells.find(c => c.key === cellKey);
                    if (cell) cells.push(cell);
                }
            });
            // Sırada olmayan ama aktif olan sütunları sona ekle
            detailCells.forEach(cell => {
                if (stokActiveColumns[cell.key] && !stokColumnOrder.includes(cell.key)) {
                    cells.push(cell);
                }
            });
        } else {
            // İlk kez - varsayılan sıraya göre ekle
            detailCells.forEach(cell => {
                if (stokActiveColumns[cell.key]) {
                    cells.push(cell);
                }
            });
        }

        // Grid sütun genişliklerini hesapla (header ile aynı sütun yapısı)
        const columnKeys = cells.map(c => ({ key: c.key }));
        const gridTemplateColumns = getColumnWidths(columnKeys);

        return `<tr class="stok-list-row" style="grid-template-columns: ${gridTemplateColumns}">${cells.map(cell => {
            const cellClass = ['stok-list-cell', cell.warningClass || ''].filter(Boolean).join(' ');
            return `<td class="${cellClass}" data-col="${cell.key}">${escapeHtml(cell.value)}</td>`;
        }).join('')}</tr>`;
    }

    // Sıralama uygula
    function applyStokSorting(vehicles) {
        const sortedVehicles = [...vehicles];
        const branches = getBranches();
        
        // Aktif sıralama var mı kontrol et
        const activeSort = Object.entries(stokSortState).find(([key, dir]) => dir !== null);
        if (!activeSort) return sortedVehicles;
        
        const [columnKey, direction] = activeSort;
        
        sortedVehicles.sort((a, b) => {
            if (columnKey === 'sanziman') {
                // Manuel → Otomatik (asc), Otomatik → Manuel (desc)
                const aVal = a.transmission === 'manuel' ? 0 : a.transmission === 'otomatik' ? 1 : 2;
                const bVal = b.transmission === 'manuel' ? 0 : b.transmission === 'otomatik' ? 1 : 2;
                return direction === 'asc' ? aVal - bVal : bVal - aVal;
            } else if (columnKey === 'km') {
                // Düşük → Yüksek (asc), Yüksek → Düşük (desc)
                const aVal = parseInt(String(getVehicleReportKmRaw(a) || '0').replace(/\./g, ''), 10) || 0;
                const bVal = parseInt(String(getVehicleReportKmRaw(b) || '0').replace(/\./g, ''), 10) || 0;
                return direction === 'asc' ? aVal - bVal : bVal - aVal;
            } else if (columnKey === 'yil') {
                // Eski → Yeni (asc), Yeni → Eski (desc)
                const aVal = parseInt(a.year) || 0;
                const bVal = parseInt(b.year) || 0;
                return direction === 'asc' ? aVal - bVal : bVal - aVal;
            } else if (columnKey === 'sube') {
                // A-Z (asc), Z-A (desc)
                const aBranch = a.branchId ? branches.find(b => b.id === a.branchId) : null;
                const bBranch = b.branchId ? branches.find(b => b.id === b.branchId) : null;
                const aVal = (aBranch ? aBranch.name : '-').toLowerCase();
                const bVal = (bBranch ? bBranch.name : '-').toLowerCase();
                return direction === 'asc' ? aVal.localeCompare(bVal, 'tr') : bVal.localeCompare(aVal, 'tr');
            } else if (columnKey === 'marka') {
                // A-Z (asc), Z-A (desc)
                const aVal = (a.brandModel || '').toLowerCase();
                const bVal = (b.brandModel || '').toLowerCase();
                return direction === 'asc' ? aVal.localeCompare(bVal, 'tr') : bVal.localeCompare(aVal, 'tr');
            } else if (columnKey === 'plaka') {
                // A-Z (asc), Z-A (desc)
                const aVal = (a.plate || '').toLowerCase();
                const bVal = (b.plate || '').toLowerCase();
                return direction === 'asc' ? aVal.localeCompare(bVal, 'tr') : bVal.localeCompare(aVal, 'tr');
            } else {
                // Diğer sütunlar için alfabetik/sayısal sıralama
                const aVal = String(a[columnKey] || '').toLowerCase();
                const bVal = String(b[columnKey] || '').toLowerCase();
                return direction === 'asc' ? aVal.localeCompare(bVal, 'tr') : bVal.localeCompare(aVal, 'tr');
            }
        });
        
        return sortedVehicles;
    }

    // Sıralama fonksiyonu
    window.sortStokList = function(columnKey) {
        if (stokTouchColumnDrag.suppressClickUntil > Date.now()) return;
        const currentState = stokSortState[columnKey];
        
        // Sıralama durumunu değiştir: null → asc → desc → null
        if (!currentState || currentState === null) {
            // Tüm sütunları sıfırla, sadece bu sütunu asc yap
            stokSortState = {};
            stokSortState[columnKey] = 'asc';
        } else if (currentState === 'asc') {
            stokSortState[columnKey] = 'desc';
        } else {
            stokSortState[columnKey] = null;
        }
        
        renderStokList();
    };

    /** Mobil: Liste scroll container'da tek hamlede sadece yatay veya sadece dikey kayma (eksen kilidi) */
    function setupStokListTouchAxisLock() {
        if (!window.matchMedia || !window.matchMedia('(max-width: 640px)').matches) return;
        const listContainer = document.getElementById('stok-list-container');
        const scrollEl = listContainer && listContainer.querySelector(':scope > .stok-list-container');
        if (!scrollEl) return;

        let startX = 0, startY = 0, startScrollLeft = 0, startScrollTop = 0, lockedAxis = null;

        const onStart = (e) => {
            if (stokTouchColumnDrag.active || stokTouchColumnDrag.dragging) return;
            if (e.target && e.target.closest && e.target.closest('.stok-list-header-row .stok-list-header-cell[data-col]')) return;
            if (e.touches.length !== 1) return;
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            startScrollLeft = scrollEl.scrollLeft;
            startScrollTop = scrollEl.scrollTop;
            lockedAxis = null;
        };
        const onMove = (e) => {
            if (stokTouchColumnDrag.active || stokTouchColumnDrag.dragging) return;
            if (e.touches.length !== 1) return;
            const x = e.touches[0].clientX;
            const y = e.touches[0].clientY;
            const dx = x - startX;
            const dy = y - startY;
            if (lockedAxis === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
                lockedAxis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
            }
            if (lockedAxis === 'x') {
                const next = Math.max(0, Math.min(scrollEl.scrollWidth - scrollEl.clientWidth, startScrollLeft - dx));
                scrollEl.scrollLeft = next;
                scrollEl.scrollTop = startScrollTop;
                e.preventDefault();
            } else if (lockedAxis === 'y') {
                const next = Math.max(0, Math.min(scrollEl.scrollHeight - scrollEl.clientHeight, startScrollTop - dy));
                scrollEl.scrollTop = next;
                scrollEl.scrollLeft = startScrollLeft;
                e.preventDefault();
            }
        };
        const onEnd = () => {
            if (stokTouchColumnDrag.active || stokTouchColumnDrag.dragging) return;
            lockedAxis = null;
        };

        scrollEl.addEventListener('touchstart', onStart, { passive: true });
        scrollEl.addEventListener('touchmove', onMove, { passive: false });
        scrollEl.addEventListener('touchend', onEnd, { passive: true });
        scrollEl.addEventListener('touchcancel', onEnd, { passive: true });
    }

    // Detay menüsünü render et
    function renderStokDetailMenu() {
        const menu = document.getElementById('stok-detail-menu');
        if (!menu) return;
        
        const detailOptions = [
            { key: 'sigorta', label: 'Sigorta T.' },
            { key: 'kasko', label: 'Kasko T.' },
            { key: 'kaskoDegeri', label: 'Kasko Değeri' },
            { key: 'muayene', label: 'Muayene' },
            { key: 'kredi', label: 'Hak Mahr.' },
            { key: 'lastik', label: 'Lastik D.' },
            { key: 'utts', label: 'UTTS' },
            { key: 'takip', label: 'Taşıt Tkp.' },
            { key: 'tramer', label: 'Tramer' },
            { key: 'boya', label: 'Kaporta' },
            { key: 'kullanici', label: 'Kullanıcı' },
            { key: 'tescil', label: 'Tescil Tarihi' }
        ];

        menu.innerHTML = detailOptions.map((opt) => {
            const isActive = stokActiveColumns[opt.key];
            
        return `
                <div class="stok-detail-menu-item ${isActive ? 'draggable' : ''}" 
                     data-column-key="${opt.key}">
                    <button class="stok-detail-menu-btn ${isActive ? 'active' : ''}" 
                            onclick="toggleStokDetailColumn('${opt.key}')"
                            title="${escapeHtml(opt.label)}">
                        <span>${escapeHtml(opt.label)}</span>
                    </button>
            </div>
        `;
        }).join('');
    }

    // Detay menü toggle (tek tıkla aç, tek tıkla kapat)
    window.toggleStokDetailMenu = function() {
        stokDetailMenuOpen = !stokDetailMenuOpen;
        const menu = document.getElementById('stok-detail-menu');
        const buttons = document.querySelectorAll('.stok-detail-add-btn');
        if (menu) {
            menu.classList.toggle('stok-detail-menu-open', stokDetailMenuOpen);
            /* Masaüstü: menü normal akışta (wrap içinde row1 ile row2 arası), portal gerekmez */
        }
        buttons.forEach(function(btn) {
            if (stokDetailMenuOpen) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    };

    // Detay sütun ekleme/çıkarma
    window.toggleStokDetailColumn = function(columnKey) {
        const wasActive = stokActiveColumns[columnKey];
        stokActiveColumns[columnKey] = !stokActiveColumns[columnKey];
        
        if (stokActiveColumns[columnKey] && !stokColumnOrder.includes(columnKey)) {
            // Yeni aktif olan sütunu sıranın sonuna ekle
            stokColumnOrder.push(columnKey);
        } else if (!stokActiveColumns[columnKey]) {
            // Pasif olan sütunu sıradan çıkar
            stokColumnOrder = stokColumnOrder.filter(key => key !== columnKey);
        }
        
        saveStokColumnState();
        // Buton seçimi yapıldığında menü açık kalsın - renderStokList'te durum korunacak
        renderStokList();
    };

    // Sürükle-bırak için değişkenler
    let draggedColumnKey = null;

    // Sütun başlığından sürükle başlatıldığında
    window.handleColumnHeaderDragStart = function(event, columnKey) {
        const detailColumns = ['sigorta', 'kasko', 'kaskoDegeri', 'muayene', 'kredi', 'lastik', 'utts', 'takip', 'tramer', 'boya', 'kullanici', 'tescil'];
        const baseColumns = ['sira', 'sube', 'yil', 'marka', 'plaka', 'sanziman', 'km'];
        
        // Detay sütunları için aktif kontrolü
        if (detailColumns.includes(columnKey) && !stokActiveColumns[columnKey]) {
            event.preventDefault();
            return;
        }
        
        draggedColumnKey = columnKey;
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', columnKey);
        
        // Tüm satırı vurgula
        const allRows = document.querySelectorAll('.stok-list-row');
        allRows.forEach(row => {
            const cell = row.querySelector(`[data-col="${columnKey}"]`);
            if (cell) {
                cell.style.opacity = '0.5';
            }
        });
        event.currentTarget.style.opacity = '0.5';
    };

    // Sütun başlığı üzerine geldiğinde
    window.handleColumnHeaderDragOver = function(event) {
        if (draggedColumnKey) {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
        }
    };

    // Sütun başlığına giriş yaptığında
    window.handleColumnHeaderDragEnter = function(event) {
        if (draggedColumnKey) {
            const targetKey = event.currentTarget.dataset.col;
            const detailColumns = ['sigorta', 'kasko', 'kaskoDegeri', 'muayene', 'kredi', 'lastik', 'utts', 'takip', 'tramer', 'boya', 'kullanici', 'tescil'];
            const baseColumns = ['sira', 'sube', 'yil', 'marka', 'plaka', 'sanziman', 'km'];
            
            if (targetKey && targetKey !== draggedColumnKey) {
                // Temel sütunlar her zaman kabul edilir
                if (baseColumns.includes(targetKey)) {
                    event.preventDefault();
                    event.currentTarget.classList.add('drag-over');
                }
                // Detay sütunlar sadece aktifse kabul edilir
                else if (detailColumns.includes(targetKey) && stokActiveColumns[targetKey]) {
                    event.preventDefault();
                    event.currentTarget.classList.add('drag-over');
                }
            }
        }
    };

    // Sütun başlığından çıkış yaptığında
    window.handleColumnHeaderDragLeave = function(event) {
        event.currentTarget.classList.remove('drag-over');
    };

    // Sütun başlığına bırakıldığında
    window.handleColumnHeaderDrop = function(event, targetColumnKey) {
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.classList.remove('drag-over');
        
        if (!draggedColumnKey || draggedColumnKey === targetColumnKey) {
            draggedColumnKey = null;
            return;
        }

        const detailColumns = ['sigorta', 'kasko', 'kaskoDegeri', 'muayene', 'kredi', 'lastik', 'utts', 'takip', 'tramer', 'boya', 'kullanici', 'tescil'];
        const baseColumns = ['sira', 'sube', 'yil', 'marka', 'plaka', 'sanziman', 'km'];
        
        const isDraggedBase = baseColumns.includes(draggedColumnKey);
        const isTargetBase = baseColumns.includes(targetColumnKey);
        const isDraggedDetail = detailColumns.includes(draggedColumnKey);
        const isTargetDetail = detailColumns.includes(targetColumnKey);

        // Temel sütunlar arasında yer değiştirme
        if (isDraggedBase && isTargetBase) {
            const draggedIndex = stokBaseColumnOrder.indexOf(draggedColumnKey);
            const targetIndex = stokBaseColumnOrder.indexOf(targetColumnKey);
            
            if (draggedIndex !== -1 && targetIndex !== -1) {
                stokBaseColumnOrder.splice(draggedIndex, 1);
                stokBaseColumnOrder.splice(targetIndex, 0, draggedColumnKey);
                saveStokColumnState();
                renderStokList();
            }
        }
        // Detay sütunlar arasında yer değiştirme
        else if (isDraggedDetail && isTargetDetail) {
            if (!stokActiveColumns[draggedColumnKey] || !stokActiveColumns[targetColumnKey]) {
                draggedColumnKey = null;
                return;
            }
            
            const draggedIndex = stokColumnOrder.indexOf(draggedColumnKey);
            const targetIndex = stokColumnOrder.indexOf(targetColumnKey);
            
            if (draggedIndex !== -1 && targetIndex !== -1) {
                stokColumnOrder.splice(draggedIndex, 1);
                stokColumnOrder.splice(targetIndex, 0, draggedColumnKey);
                saveStokColumnState();
                renderStokList();
            }
        }
        // Temel ve detay sütunlar arasında yer değiştirme (temel sütunların sonuna veya detay sütunların başına)
        else if (isDraggedBase && isTargetDetail && stokActiveColumns[targetColumnKey]) {
            // Temel sütunu, detay sütununun yerine koy (detay sütununu temel sütunların sonuna al)
            const draggedIndex = stokBaseColumnOrder.indexOf(draggedColumnKey);
            const targetDetailIndex = stokColumnOrder.indexOf(targetColumnKey);
            
            if (draggedIndex !== -1 && targetDetailIndex !== -1) {
                // Temel sütunu listeden çıkar
                stokBaseColumnOrder.splice(draggedIndex, 1);
                // Detay sütununu temel sütunların sonuna ekle
                stokBaseColumnOrder.push(targetColumnKey);
                // Detay sütununu detay listesinden çıkar
                stokColumnOrder.splice(targetDetailIndex, 1);
                // Temel sütunu detay listesine ekle
                stokColumnOrder.splice(targetDetailIndex, 0, draggedColumnKey);
                saveStokColumnState();
                renderStokList();
            }
        }
        else if (isDraggedDetail && isTargetBase && stokActiveColumns[draggedColumnKey]) {
            // Detay sütununu, temel sütununun yerine koy (temel sütununu detay sütunların başına al)
            const draggedDetailIndex = stokColumnOrder.indexOf(draggedColumnKey);
            const targetIndex = stokBaseColumnOrder.indexOf(targetColumnKey);
            
            if (draggedDetailIndex !== -1 && targetIndex !== -1) {
                // Detay sütununu listeden çıkar
                stokColumnOrder.splice(draggedDetailIndex, 1);
                // Temel sütununu detay listesinin başına ekle
                stokColumnOrder.unshift(targetColumnKey);
                // Temel sütununu temel listesinden çıkar
                stokBaseColumnOrder.splice(targetIndex, 1);
                // Detay sütununu temel listesine ekle
                stokBaseColumnOrder.splice(targetIndex, 0, draggedColumnKey);
                saveStokColumnState();
                renderStokList();
            }
        }
        
        draggedColumnKey = null;
    };

    // Sütun başlığı drag bitince
    window.handleColumnHeaderDragEnd = function(event) {
        // Tüm satırları normale döndür
        const allRows = document.querySelectorAll('.stok-list-row');
        allRows.forEach(row => {
            const cells = row.querySelectorAll('.stok-list-cell');
            cells.forEach(cell => {
                cell.style.opacity = '1';
            });
        });
        
        // Tüm başlıkları normale döndür
        document.querySelectorAll('.stok-list-header-cell').forEach(cell => {
            cell.style.opacity = '1';
            cell.classList.remove('drag-over', 'touch-drag-source');
        });
        
        draggedColumnKey = null;
    };

    function setStokColumnCellsOpacity(columnKey, opacity) {
        document.querySelectorAll(`.stok-list-row .stok-list-cell[data-col="${columnKey}"]`).forEach(function(cell) {
            cell.style.opacity = opacity;
        });
    }

    function removeStokTouchGhost() {
        if (stokTouchColumnDrag.ghostEl && stokTouchColumnDrag.ghostEl.parentNode) {
            stokTouchColumnDrag.ghostEl.parentNode.removeChild(stokTouchColumnDrag.ghostEl);
        }
        stokTouchColumnDrag.ghostEl = null;
    }

    function cleanupStokTouchColumnDrag() {
        clearTimeout(stokTouchColumnDrag.longPressTimer);
        document.querySelectorAll('.stok-list-header-cell').forEach(function(cell) {
            cell.style.opacity = '1';
            cell.classList.remove('drag-over', 'touch-drag-source');
        });
        document.querySelectorAll('.stok-list-row .stok-list-cell').forEach(function(cell) {
            cell.style.opacity = '1';
        });
        const listContainer = document.getElementById('stok-list-container');
        if (listContainer) listContainer.classList.remove('touch-reorder-mode');
        removeStokTouchGhost();
        stokTouchColumnDrag.active = false;
        stokTouchColumnDrag.dragging = false;
        stokTouchColumnDrag.columnKey = null;
        stokTouchColumnDrag.startX = 0;
        stokTouchColumnDrag.startY = 0;
        stokTouchColumnDrag.lastDropTarget = null;
        stokTouchColumnDrag.longPressTimer = null;
        stokTouchColumnDrag.sourceCell = null;
    }

    function canReorderStokColumn(sourceKey, targetKey) {
        if (!sourceKey || !targetKey || sourceKey === targetKey) return false;
        const isDraggedBase = STOK_BASE_COLUMNS.includes(sourceKey);
        const isTargetBase = STOK_BASE_COLUMNS.includes(targetKey);
        const isDraggedDetail = STOK_DETAIL_COLUMNS.includes(sourceKey);
        const isTargetDetail = STOK_DETAIL_COLUMNS.includes(targetKey);
        if (isDraggedBase && isTargetBase) return true;
        if (isDraggedDetail && isTargetDetail) return !!(stokActiveColumns[sourceKey] && stokActiveColumns[targetKey]);
        if (isDraggedBase && isTargetDetail) return !!stokActiveColumns[targetKey];
        if (isDraggedDetail && isTargetBase) return !!stokActiveColumns[sourceKey];
        return false;
    }

    function reorderStokColumns(sourceKey, targetKey) {
        if (!canReorderStokColumn(sourceKey, targetKey)) return false;

        const isDraggedBase = STOK_BASE_COLUMNS.includes(sourceKey);
        const isTargetBase = STOK_BASE_COLUMNS.includes(targetKey);
        const isDraggedDetail = STOK_DETAIL_COLUMNS.includes(sourceKey);
        const isTargetDetail = STOK_DETAIL_COLUMNS.includes(targetKey);

        if (isDraggedBase && isTargetBase) {
            const draggedIndex = stokBaseColumnOrder.indexOf(sourceKey);
            const targetIndex = stokBaseColumnOrder.indexOf(targetKey);
            if (draggedIndex === -1 || targetIndex === -1) return false;
            stokBaseColumnOrder.splice(draggedIndex, 1);
            stokBaseColumnOrder.splice(targetIndex, 0, sourceKey);
        } else if (isDraggedDetail && isTargetDetail) {
            const draggedIndex = stokColumnOrder.indexOf(sourceKey);
            const targetIndex = stokColumnOrder.indexOf(targetKey);
            if (draggedIndex === -1 || targetIndex === -1) return false;
            stokColumnOrder.splice(draggedIndex, 1);
            stokColumnOrder.splice(targetIndex, 0, sourceKey);
        } else if (isDraggedBase && isTargetDetail) {
            const draggedIndex = stokBaseColumnOrder.indexOf(sourceKey);
            const targetDetailIndex = stokColumnOrder.indexOf(targetKey);
            if (draggedIndex === -1 || targetDetailIndex === -1) return false;
            stokBaseColumnOrder.splice(draggedIndex, 1);
            stokBaseColumnOrder.push(targetKey);
            stokColumnOrder.splice(targetDetailIndex, 1);
            stokColumnOrder.splice(targetDetailIndex, 0, sourceKey);
        } else if (isDraggedDetail && isTargetBase) {
            const draggedDetailIndex = stokColumnOrder.indexOf(sourceKey);
            const targetIndex = stokBaseColumnOrder.indexOf(targetKey);
            if (draggedDetailIndex === -1 || targetIndex === -1) return false;
            stokColumnOrder.splice(draggedDetailIndex, 1);
            stokColumnOrder.unshift(targetKey);
            stokBaseColumnOrder.splice(targetIndex, 1);
            stokBaseColumnOrder.splice(targetIndex, 0, sourceKey);
        } else {
            return false;
        }

        saveStokColumnState();
        return true;
    }

    function createStokTouchGhost(sourceCell) {
        removeStokTouchGhost();
        const ghost = document.createElement('div');
        ghost.className = 'stok-column-touch-ghost';
        const sourceText = sourceCell.querySelector('.stok-header-text')
            ? sourceCell.querySelector('.stok-header-text').textContent
            : sourceCell.textContent;
        ghost.textContent = String(sourceText || '').replace(/[↕↑↓]/g, ' ').replace(/\s+/g, ' ').trim();
        document.body.appendChild(ghost);
        stokTouchColumnDrag.ghostEl = ghost;
    }

    function updateStokTouchGhostPosition(x, y) {
        if (!stokTouchColumnDrag.ghostEl) return;
        stokTouchColumnDrag.ghostEl.style.left = `${x}px`;
        stokTouchColumnDrag.ghostEl.style.top = `${y}px`;
    }

    function getStokTouchTargetCell(pointerX, sourceKey) {
        const headerCells = Array.from(document.querySelectorAll('#stok-list-container .stok-list-header-row .stok-list-header-cell[data-col]'))
            .filter(function(cell) { return canReorderStokColumn(sourceKey, cell.getAttribute('data-col')); });
        if (!headerCells.length) return null;

        const exactMatch = headerCells.find(function(cell) {
            const rect = cell.getBoundingClientRect();
            return pointerX >= rect.left && pointerX <= rect.right;
        });
        if (exactMatch) return exactMatch;

        let nearestCell = null;
        let nearestDistance = Infinity;
        headerCells.forEach(function(cell) {
            const rect = cell.getBoundingClientRect();
            const centerX = rect.left + (rect.width / 2);
            const distance = Math.abs(pointerX - centerX);
            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearestCell = cell;
            }
        });
        return nearestCell;
    }

    function beginStokTouchColumnDrag(sourceCell, columnKey, touchPoint) {
        stokTouchColumnDrag.dragging = true;
        stokTouchColumnDrag.suppressClickUntil = Date.now() + 500;
        stokTouchColumnDrag.sourceCell = sourceCell;
        const listContainer = document.getElementById('stok-list-container');
        if (listContainer) listContainer.classList.add('touch-reorder-mode');
        sourceCell.classList.add('touch-drag-source');
        sourceCell.style.opacity = '0.35';
        setStokColumnCellsOpacity(columnKey, '0.35');
        createStokTouchGhost(sourceCell);
        updateStokTouchGhostPosition(touchPoint.clientX, touchPoint.clientY);
    }

    function attachStokColumnTouchListeners(listContainer) {
        if (!isMobileStokViewport()) return;
        const headerCells = listContainer.querySelectorAll('.stok-list-header-row .stok-list-header-cell[data-col]');
        if (!headerCells.length) return;

        headerCells.forEach(function(cell) {
            const columnKey = cell.getAttribute('data-col');
            if (!columnKey) return;

            cell.addEventListener('touchstart', function(e) {
                if (e.touches.length !== 1) return;
                const startTouch = {
                    clientX: e.touches[0].clientX,
                    clientY: e.touches[0].clientY
                };
                cleanupStokTouchColumnDrag();
                stokTouchColumnDrag.active = true;
                stokTouchColumnDrag.columnKey = columnKey;
                stokTouchColumnDrag.startX = startTouch.clientX;
                stokTouchColumnDrag.startY = startTouch.clientY;
                stokTouchColumnDrag.lastDropTarget = null;
                stokTouchColumnDrag.sourceCell = cell;
                stokTouchColumnDrag.longPressTimer = setTimeout(function() {
                    if (!stokTouchColumnDrag.active || stokTouchColumnDrag.columnKey !== columnKey) return;
                    beginStokTouchColumnDrag(cell, columnKey, startTouch);
                }, 180);
            }, { passive: true });

            cell.addEventListener('touchmove', function(e) {
                if (!stokTouchColumnDrag.active || stokTouchColumnDrag.columnKey !== columnKey || e.touches.length !== 1) return;
                const touch = e.touches[0];
                const dx = Math.abs(touch.clientX - stokTouchColumnDrag.startX);
                const dy = Math.abs(touch.clientY - stokTouchColumnDrag.startY);

                if (!stokTouchColumnDrag.dragging) {
                    if (dx > 8 || dy > 8) {
                        clearTimeout(stokTouchColumnDrag.longPressTimer);
                        if (dx > 14 || dy > 14) {
                            cleanupStokTouchColumnDrag();
                        }
                    }
                    return;
                }

                e.preventDefault();
                updateStokTouchGhostPosition(touch.clientX, touch.clientY);
                const targetCell = getStokTouchTargetCell(touch.clientX, columnKey);
                const targetKey = targetCell ? targetCell.getAttribute('data-col') : null;
                listContainer.querySelectorAll('.stok-list-header-cell').forEach(function(headerCell) {
                    headerCell.classList.toggle('drag-over', headerCell === targetCell && canReorderStokColumn(columnKey, targetKey));
                });
                stokTouchColumnDrag.lastDropTarget = (targetKey && canReorderStokColumn(columnKey, targetKey)) ? targetKey : null;
            }, { passive: false });

            function endTouch(e) {
                if (!stokTouchColumnDrag.active && !stokTouchColumnDrag.dragging) return;
                clearTimeout(stokTouchColumnDrag.longPressTimer);
                const sourceKey = stokTouchColumnDrag.columnKey;
                const targetKey = stokTouchColumnDrag.lastDropTarget;
                const wasDragging = stokTouchColumnDrag.dragging;
                if (wasDragging) {
                    stokTouchColumnDrag.suppressClickUntil = Date.now() + 500;
                    if (e && typeof e.preventDefault === 'function') e.preventDefault();
                }
                cleanupStokTouchColumnDrag();
                if (wasDragging && sourceKey && targetKey && reorderStokColumns(sourceKey, targetKey)) {
                    renderStokList();
                }
            }

            cell.addEventListener('touchend', endTouch, { passive: false });
            cell.addEventListener('touchcancel', endTouch, { passive: false });
        });
    }

    function formatDate(dateStr) { return (typeof window.formatDateShort === 'function' ? window.formatDateShort(dateStr) : (dateStr ? String(dateStr) : '-')) || '-'; }

    /** Yazdırma: gg/aa/yyyy → gg/aa/yy */
    function compactStokPrintDateDisplay(displayStr) {
        if (!displayStr || displayStr === '-') return displayStr;
        var m = String(displayStr).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (!m) return displayStr;
        var d = m[1].length === 1 ? '0' + m[1] : m[1];
        var mo = m[2].length === 1 ? '0' + m[2] : m[2];
        return d + '/' + mo + '/' + m[3].slice(2);
    }
    /** Yazdırma: 2012 → '12 */
    function formatStokYearPrintCompact(year) {
        if (year == null || year === '') return '-';
        var s = String(year).trim();
        if (s === '' || s === '-') return '-';
        var n = parseInt(s, 10);
        if (!isNaN(n) && n >= 1900 && n <= 2099) return "'" + String(n % 100).padStart(2, '0');
        if (!isNaN(n) && n >= 0 && n <= 99) return "'" + String(n).padStart(2, '0');
        return s;
    }
    function formatStokTransmissionPrintCompact(transmission) {
        if (transmission === 'manuel') return 'Man.';
        if (transmission === 'otomatik') return 'Otm.';
        return '-';
    }
    function stokNormalizeIsoDateKey(raw) {
        if (!raw) return '';
        var s = String(raw).trim();
        var m = s.match(/^(\d{4}-\d{2}-\d{2})/);
        return m ? m[1] : s;
    }
    function formatStokMuayeneCell(vehicle, options) {
        options = options || {};
        var compact = options.compact === true;
        var muayeneRaw = vehicle && vehicle.muayeneDate ? String(vehicle.muayeneDate).trim() : '';
        var egzozRaw = vehicle && vehicle.egzozMuayeneDate ? String(vehicle.egzozMuayeneDate).trim() : '';
        var muayeneText = muayeneRaw ? formatDate(muayeneRaw) : '';
        var egzozText = egzozRaw ? formatDate(egzozRaw) : '';

        if (compact) {
            if (muayeneText) muayeneText = compactStokPrintDateDisplay(muayeneText);
            if (egzozText) egzozText = compactStokPrintDateDisplay(egzozText);
        }

        if (!muayeneText && !egzozText) return '-';
        if (!egzozText || stokNormalizeIsoDateKey(egzozRaw) === stokNormalizeIsoDateKey(muayeneRaw)) return muayeneText || '-';
        if (!muayeneText) return 'Egz: ' + egzozText;
        return compact
            ? (muayeneText + ' | Egz: ' + egzozText)
            : ('Muayene: ' + muayeneText + ' | Egzoz: ' + egzozText);
    }
    /** Yazdırma tablosu: muayene tarihi tek hücre (Excel / birleşik hücre kullanmaya devam) */
    function formatStokMuayeneDateOnlyForPrint(vehicle) {
        var muRaw = vehicle && vehicle.muayeneDate ? String(vehicle.muayeneDate).trim() : '';
        if (!muRaw) return '-';
        var t = formatDate(muRaw);
        return t || '-';
    }
    /** Yazdırma: araç muayenesi ile aynı gün ise '-' (birleşik hücre davranışıyla uyumlu) */
    function formatStokEgzozDateOnlyForPrint(vehicle) {
        var muRaw = vehicle && vehicle.muayeneDate ? String(vehicle.muayeneDate).trim() : '';
        var egRaw = vehicle && vehicle.egzozMuayeneDate ? String(vehicle.egzozMuayeneDate).trim() : '';
        if (!egRaw) return '-';
        if (stokNormalizeIsoDateKey(egRaw) === stokNormalizeIsoDateKey(muRaw)) return '-';
        var t = formatDate(egRaw);
        return t || '-';
    }
    /** Yazdır + Excel: muayene sütununun sağına egzoz muayenesi sütunu ekler */
    function expandStokMuayeneEgzozColumns(activeColumns) {
        var out = [];
        activeColumns.forEach(function(col) {
            out.push(col);
            if (!col.isBase && col.key === 'muayene') {
                out.push({ key: 'egzozMuayene', isBase: false });
            }
        });
        return out;
    }
    /** Yazdır: compact kısaltmaları; fullPrintDates=true iken tarih/yıl tam metin */
    function applyStokPrintCompact(vehicle, col, value, opts) {
        opts = opts || {};
        var k = col.key;
        var fd = opts.fullPrintDates === true;
        function printDateDisp(isoRaw) {
            if (!isoRaw) return '-';
            var d = formatDate(isoRaw);
            return fd ? d : compactStokPrintDateDisplay(d);
        }
        if (k === 'yil') {
            if (fd) {
                var yy = vehicle.year != null ? String(vehicle.year).trim() : '';
                return yy || '-';
            }
            return formatStokYearPrintCompact(vehicle.year);
        }
        if (k === 'sanziman') return formatStokTransmissionPrintCompact(vehicle.transmission);
        if (k === 'sigorta') return vehicle.sigortaDate ? printDateDisp(vehicle.sigortaDate) : '-';
        if (k === 'kasko') return vehicle.kaskoDate ? printDateDisp(vehicle.kaskoDate) : '-';
        if (k === 'muayene') {
            if (opts.printSeparateMuayeneColumns) {
                return value === '-' ? '-' : (fd ? value : compactStokPrintDateDisplay(value));
            }
            return formatStokMuayeneCell(vehicle, { compact: !fd });
        }
        if (k === 'egzozMuayene') {
            return value === '-' ? '-' : (fd ? value : compactStokPrintDateDisplay(value));
        }
        if (k === 'tescil') return vehicle.tescilTarihi ? printDateDisp(vehicle.tescilTarihi) : '-';
        if (k === 'kaskoDegeri') {
            var v = String(value);
            if (v === 'Kasko kodu girilmedi') return 'Kod yok';
            if (v === 'Excel yüklenmedi') return 'Liste yok';
            return value;
        }
        if (k === 'utts') { if (value === 'Evet') return 'E'; if (value === 'Hayır') return 'H'; }
        if (k === 'takip') { if (value === 'Evet') return 'E'; if (value === 'Hayır') return 'H'; }
        return value;
    }

    function getVehicleUser(vehicle) {
        if (!vehicle.assignedUserId) return '-';
        const users = getUsers();
        const user = users.find(u => u.id === vehicle.assignedUserId);
        return user ? user.name : '-';
    }

    // Grid görünümüne geri dön
    window.goBackToStokGrid = function() {
        stokCurrentBranchId = null;
        stokDetailMenuOpen = false;
        stokAutoSingleBranchView = false;
        const headerActions = document.getElementById('reports-list-header-actions');
        if (headerActions) {
            headerActions.innerHTML = '';
            headerActions.setAttribute('aria-hidden', 'true');
            headerActions.classList.remove('has-stok-actions');
        }
        renderStokView({ allowSingleBranchBypass: false });
    };

    // Ana render fonksiyonu
    window.renderStokView = function(options) {
        const allowSingleBranchBypass = !options || options.allowSingleBranchBypass !== false;
        if (stokCurrentBranchId === null) {
            const singleVisibleBranch = allowSingleBranchBypass ? getSingleVisibleStokBranch() : null;
            if (singleVisibleBranch) {
                stokAutoSingleBranchView = true;
                stokCurrentBranchId = singleVisibleBranch.id;
                renderStokList();
                return;
            }
            // Grid görünümü
            renderStokBranchGrid();
        } else {
            // Liste görünümü
            renderStokList();
        }
    };

    // Excel / Yazdır için ortak veri hazırlama (aynı filtre, sütun, tarih)
    function getStokReportExportData() {
        if (stokCurrentBranchId === null) return null;
        let vehicles = getVehicles();
        const branches = getBranches();

        if (stokCurrentBranchId === 'all') { /* tüm taşıtlar */ } else if (stokCurrentBranchId) {
            vehicles = vehicles.filter(v => v.branchId === stokCurrentBranchId);
        }
        const searchTerm = window.stokSearchTerm || '';
        if (searchTerm) {
            vehicles = vehicles.filter(v => {
                const year = String(v.year || '').toLowerCase();
                const brandModel = (v.brandModel || '').toLowerCase();
                const user = getVehicleUser(v).toLowerCase();
                const branch = v.branchId ? (branches.find(b => b.id === v.branchId)?.name || '').toLowerCase() : '';
                return year.includes(searchTerm) || brandModel.includes(searchTerm) || user.includes(searchTerm) || branch.includes(searchTerm);
            });
        }
        vehicles = applyStokSorting(vehicles);
        if (vehicles.length === 0) return null;

        const activeColumns = [];
        stokBaseColumnOrder.forEach(key => { activeColumns.push({ key, isBase: true }); });
        stokColumnOrder.forEach(key => { if (stokActiveColumns[key]) activeColumns.push({ key, isBase: false }); });

        const startDate = document.getElementById('stok-date-start')?.value || '';
        const endDate = document.getElementById('stok-date-end')?.value || '';
        let dateRangeText = '';
        if (endDate) {
            const fmt = (d) => { if (!d) return ''; const x = new Date(d); return `${String(x.getDate()).padStart(2,'0')}/${String(x.getMonth()+1).padStart(2,'0')}/${x.getFullYear()}`; };
            dateRangeText = startDate ? `${fmt(startDate)} - ${fmt(endDate)}` : fmt(endDate);
        } else {
            const t = new Date();
            dateRangeText = `${String(t.getDate()).padStart(2,'0')}/${String(t.getMonth()+1).padStart(2,'0')}/${t.getFullYear()}`;
        }
        let titleText = 'MEDİSA - TAŞIT STOK DURUM RAPORU';
        if (stokCurrentBranchId !== 'all' && stokCurrentBranchId) {
            const b = branches.find(b => b.id === stokCurrentBranchId);
            if (b) titleText = `${b.name} - TAŞIT STOK DURUM RAPORU`;
        }
        return { vehicles, activeColumns, titleText, dateRangeText, branches };
    }

    function getStokCellValue(vehicle, col, index, opts) {
        opts = opts || {};
        let value = '-';
        if (col.isBase) {
            switch (col.key) {
                case 'sira': value = index + 1; break;
                case 'sube': value = toTitleCase(vehicle.branchId ? (getBranches().find(b => b.id === vehicle.branchId)?.name || '-') : '-'); break;
                case 'yil': value = vehicle.year || '-'; break;
                case 'marka': value = formatBrandModel(vehicle.brandModel || '-'); break;
                case 'plaka': value = formatPlaka(vehicle.plate || '-'); break;
                case 'sanziman': value = vehicle.transmission === 'manuel' ? 'Manuel' : vehicle.transmission === 'otomatik' ? 'Otomatik' : '-'; break;
                case 'km': {
                    var kmRaw = getVehicleReportKmRaw(vehicle);
                    value = kmRaw !== '' ? formatNumber(kmRaw) : '-';
                    break;
                }
            }
        } else {
            switch (col.key) {
                case 'sigorta': value = vehicle.sigortaDate ? formatDate(vehicle.sigortaDate) : '-'; break;
                case 'kasko': value = vehicle.kaskoDate ? formatDate(vehicle.kaskoDate) : '-'; break;
                case 'kaskoDegeri': value = (function() {
                    var yearForKasko = vehicle.year || vehicle.modelYili || '';
                    var kaskoDegeri = vehicle.kaskoDegeri;
                    if (kaskoDegeri == null || kaskoDegeri === '') {
                        kaskoDegeri = (typeof window.getKaskoDegeri === 'function') ? window.getKaskoDegeri(vehicle.kaskoKodu, yearForKasko) : '-';
                    }
                    if (kaskoDegeri == null || String(kaskoDegeri).trim() === '') kaskoDegeri = '-';
                    if (kaskoDegeri === '-' && (!vehicle.kaskoKodu || String(vehicle.kaskoKodu).trim() === '')) {
                        kaskoDegeri = 'Kasko kodu girilmedi';
                    } else if (kaskoDegeri === '-' && !(typeof window.hasAnyKaskoListData === 'function' ? window.hasAnyKaskoListData() : !!localStorage.getItem('medisa_kasko_liste'))) {
                        kaskoDegeri = 'Excel yüklenmedi';
                    }
                    return String(kaskoDegeri).trim() || '-';
                })(); break;
                case 'muayene':
                    value = opts.printSeparateMuayeneColumns
                        ? formatStokMuayeneDateOnlyForPrint(vehicle)
                        : formatStokMuayeneCell(vehicle);
                    break;
                case 'egzozMuayene': value = formatStokEgzozDateOnlyForPrint(vehicle); break;
                case 'kredi': value = vehicle.kredi === 'var' ? 'Var' : vehicle.kredi === 'yok' ? 'Yok' : '-'; break;
                case 'lastik': value = vehicle.lastikDurumu === 'var' ? 'Var' : vehicle.lastikDurumu === 'yok' ? 'Yok' : '-'; break;
                case 'utts': value = vehicle.uttsTanimlandi ? 'Evet' : 'Hayır'; break;
                case 'takip': value = vehicle.takipCihaziMontaj ? 'Evet' : 'Hayır'; break;
                case 'tramer': value = vehicle.tramer === 'var' ? 'Var' : vehicle.tramer === 'yok' ? 'Yok' : '-'; break;
                case 'boya': value = vehicle.boya === 'var' ? 'Var' : vehicle.boya === 'yok' ? 'Yok' : '-'; break;
                case 'kullanici': value = formatAdSoyad(getVehicleUser(vehicle)); break;
                case 'tescil': value = vehicle.tescilTarihi ? formatDate(vehicle.tescilTarihi) : '-'; break;
            }
        }
        if (opts.compact) return applyStokPrintCompact(vehicle, col, value, opts);
        return value;
    }

    // Excel'e aktar
    window.exportStokToExcel = async function() {
        try {
            await window.loadExcelJS();
            const Excel = ExcelJS || window.ExcelJS;
        const data = getStokReportExportData();
        if (!data) {
            alert('Lütfen önce bir şube seçin veya "Tümü" seçeneğini kullanın.');
            return;
        }
        const { vehicles, titleText, dateRangeText, branches } = data;
        const excelColumns = expandStokMuayeneEgzozColumns(data.activeColumns);
        const excelSplitMuayeneOpts = { printSeparateMuayeneColumns: true };
        if (vehicles.length === 0) {
            alert('Export Edilecek Taşıt Bulunamadı.');
            return;
        }

        // ExcelJS ile Excel oluştur
        const workbook = new Excel.Workbook();
        const worksheet = workbook.addWorksheet('Stok Raporu');
        
        // Başlık satırı
        const titleRow = worksheet.addRow([titleText]);
        worksheet.mergeCells(1, 1, 1, excelColumns.length);
        const titleCell = titleRow.getCell(1);
        titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
        titleCell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE5E5E5' }
        };
        titleCell.font = { bold: true, color: { argb: 'FF000000' } };
        titleCell.border = {
            top: { style: 'thin', color: { argb: 'FF333333' } },
            left: { style: 'thin', color: { argb: 'FF333333' } },
            bottom: { style: 'thin', color: { argb: 'FF333333' } },
            right: { style: 'thin', color: { argb: 'FF333333' } }
        };
        titleRow.height = 25;
        
        // Tarih satırı
        const dateRow = worksheet.addRow([dateRangeText]);
        worksheet.mergeCells(2, 1, 2, excelColumns.length);
        const dateCell = dateRow.getCell(1);
        dateCell.alignment = { horizontal: 'center', vertical: 'middle' };
        dateCell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE5E5E5' }
        };
        dateCell.font = { color: { argb: 'FF000000' } };
        dateCell.border = {
            top: { style: 'thin', color: { argb: 'FF333333' } },
            left: { style: 'thin', color: { argb: 'FF333333' } },
            bottom: { style: 'thin', color: { argb: 'FF333333' } },
            right: { style: 'thin', color: { argb: 'FF333333' } }
        };
        dateRow.height = 20;
        
        // Boş satır
        worksheet.addRow([]);
        
        // Sütun başlıkları
        const headerRow = worksheet.addRow(excelColumns.map(col => getColumnHeaderText(col.key)));
        headerRow.eachCell((cell, colNumber) => {
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF404040' }
            };
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.border = {
                top: { style: 'thin', color: { argb: 'FF333333' } },
                left: { style: 'thin', color: { argb: 'FF333333' } },
                bottom: { style: 'thin', color: { argb: 'FF333333' } },
                right: { style: 'thin', color: { argb: 'FF333333' } }
            };
        });
        headerRow.height = 20;
        
        // Veri satırları
        vehicles.forEach((vehicle, index) => {
            const row = excelColumns.map(col => getStokCellValue(vehicle, col, index, excelSplitMuayeneOpts));
            const isEven = index % 2 === 0;
            const dataRow = worksheet.addRow(row);
            dataRow.eachCell((cell) => {
                cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: isEven ? 'FFFFFFFF' : 'FFE5E5E5' }
                };
                cell.font = { color: { argb: 'FF000000' } };
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
                cell.border = {
                    top: { style: 'thin', color: { argb: 'FF333333' } },
                    left: { style: 'thin', color: { argb: 'FF333333' } },
                    bottom: { style: 'thin', color: { argb: 'FF333333' } },
                    right: { style: 'thin', color: { argb: 'FF333333' } }
                };
            });
        });
        
        // Sütun genişliklerini içeriğe göre otomatik ayarla
        excelColumns.forEach((col, colIndex) => {
            let maxLength = getColumnHeaderText(col.key).length;
            vehicles.forEach(function(vehicle, vIdx) {
                const sv = String(getStokCellValue(vehicle, col, vIdx, excelSplitMuayeneOpts));
                if (sv.length > maxLength) maxLength = sv.length;
            });
            let widthChars = Math.max(maxLength + 2, 8);
            const cap = stokExcelColumnWidthCeilChars[col.key];
            if (typeof cap === 'number') widthChars = Math.min(widthChars, cap);
            worksheet.getColumn(colIndex + 1).width = widthChars;
        });
        
        // Dosya adı
        let branchName = 'Tumu';
        if (stokCurrentBranchId !== 'all' && stokCurrentBranchId) {
            branchName = branches.find(b => b.id === stokCurrentBranchId)?.name || 'Stok';
        }
        const fileName = `MEDISA_Stok_Raporu_${branchName}_${new Date().toISOString().split('T')[0]}.xlsx`;

        // İndir
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        link.click();
        window.URL.revokeObjectURL(url);
        } catch (error) {
            if (typeof window.__medisaLogError === 'function') window.__medisaLogError('Excel export', error);
            else console.error('Excel export hatası:', error);
            alert('Excel dosyası oluşturulurken bir hata oluştu. Lütfen tekrar deneyin.');
        }
    };

    function removeStokSearchOutsideListener() {
        document.removeEventListener('pointerdown', stokSearchOutsidePointerDown, true);
    }

    function getStokSearchElements(triggerButton) {
        const modal = document.getElementById('reports-modal');
        if (!modal) return { wrap: null, container: null, input: null };

        const directWrap = triggerButton && typeof triggerButton.closest === 'function'
            ? triggerButton.closest('.stok-search-wrap')
            : null;

        const wrap = directWrap || Array.from(modal.querySelectorAll('.stok-search-wrap')).find(function(candidate) {
            const candidateContainer = candidate.querySelector('.stok-search-container');
            return candidateContainer && candidateContainer.classList.contains('open');
        }) || modal.querySelector('.stok-search-wrap');

        if (!wrap) return { wrap: null, container: null, input: null };

        return {
            wrap: wrap,
            container: wrap.querySelector('.stok-search-container'),
            input: wrap.querySelector('.stok-search-input')
        };
    }

    function closeStokSearch(container, input, shouldClear) {
        if (!container) return;
        container.classList.remove('open');
        if (shouldClear && input) {
            input.value = '';
            handleStokSearch('');
        }
    }

    function stokSearchOutsidePointerDown(e) {
        const modal = document.getElementById('reports-modal');
        const container = modal ? modal.querySelector('.stok-search-wrap .stok-search-container.open') : null;
        if (!container || !container.classList.contains('open')) {
            removeStokSearchOutsideListener();
            return;
        }
        const wrap = container.closest('.stok-search-wrap');
        if (wrap && e.target && typeof e.target.closest === 'function' && wrap.contains(e.target)) {
            return;
        }
        const input = wrap ? wrap.querySelector('.stok-search-input') : null;
        closeStokSearch(container, input, true);
        removeStokSearchOutsideListener();
    }

    function bindStokSearchOutsideClose() {
        removeStokSearchOutsideListener();
        setTimeout(function() {
            document.addEventListener('pointerdown', stokSearchOutsidePointerDown, true);
        }, 0);
    }

    // Arama kutusunu aç/kapat (tek büyüteç, mobil+masaüstü)
    window.toggleStokSearch = function(triggerButton, event) {
        if (event) {
            if (typeof event.preventDefault === 'function') event.preventDefault();
            if (typeof event.stopPropagation === 'function') event.stopPropagation();
        }

        const { container, input } = getStokSearchElements(triggerButton);
        if (!container) return;

        const modal = document.getElementById('reports-modal');
        if (modal) {
            modal.querySelectorAll('.stok-search-wrap .stok-search-container.open').forEach(function(openContainer) {
                if (openContainer === container) return;
                closeStokSearch(openContainer, openContainer.querySelector('.stok-search-input'), false);
            });
        }

        if (container.classList.contains('open')) {
            removeStokSearchOutsideListener();
            closeStokSearch(container, input, true);
            return;
        }

        container.classList.add('open');
        if (input) {
            const syncVal = window.stokSearchTerm || '';
            if (input.value !== syncVal) input.value = syncVal;
        }
        bindStokSearchOutsideClose();
        setTimeout(function() {
            if (input) input.focus();
        }, 100);
    };

    var handleStokSearchImpl = function(searchTerm) {
        var searchValue = ('' + searchTerm).toLowerCase().trim();
        window.stokSearchTerm = searchValue;
        if (stokCurrentBranchId !== null) renderStokList();
    };
    window.handleStokSearch = (typeof window.debounce === 'function') ? window.debounce(handleStokSearchImpl, 200) : handleStokSearchImpl;

    // Yazdır – Excel ile aynı veriyi tablo olarak yazdırır (ekran görüntüsü değil)
    const stokPrintHeaders = { sira:'No.', sube:'Şube', yil:'Yıl', marka:'Marka/Mod.', plaka:'Plaka', sanziman:'Şanz', km:'KM', sigorta:'Sig. bit.', kasko:'Kas. bit.', kaskoDegeri:'Kas. değ.', muayene:'Muay.', egzozMuayene:'Egzoz', kredi:'Hak M.', lastik:'Lastik', utts:'UTTS', takip:'Takip', tramer:'Tramer', boya:'Boya', kullanici:'Kull.', tescil:'Tescil' };
    /* Yazdır: marka daha geniş (tek satıra yakın); plaka/egz. kısa içerik */
    const stokPrintColumnWeights = {
        sira: 3,
        yil: 5,
        plaka: 5,
        marka: 19,
        sanziman: 4,
        km: 5,
        sube: 6,
        sigorta: 9,
        kasko: 9,
        kaskoDegeri: 10,
        muayene: 8,
        egzozMuayene: 5,
        kredi: 8,
        lastik: 8,
        utts: 6,
        takip: 7,
        tramer: 9,
        boya: 7,
        kullanici: 11,
        tescil: 9
    };

    /* Excel: bazı kolonların otomatik genişlik tavanı (şube/Otm./KM taşması) */
    const stokExcelColumnWidthCeilChars = {
        sira: 7,
        sube: 22,
        yil: 9,
        marka: 40,
        plaka: 12,
        sanziman: 12,
        km: 14,
        muayene: 12,
        egzozMuayene: 11,
        sigorta: 12,
        kasko: 12,
        tescil: 12
    };

    function buildStokPrintColgroup(activeColumns) {
        const totalWeight = activeColumns.reduce((sum, col) => sum + (stokPrintColumnWeights[col.key] || 10), 0) || 1;
        return `<colgroup>${activeColumns.map(col => {
            const widthPercent = ((stokPrintColumnWeights[col.key] || 10) / totalWeight) * 100;
            return `<col data-col="${col.key}" style="width:${widthPercent.toFixed(2)}%">`;
        }).join('')}</colgroup>`;
    }

    window.printStokReport = function() {
        const data = getStokReportExportData();
        if (!data) {
            alert('Lütfen önce bir şube seçin veya "Tümü" seçeneğini kullanın.');
            return;
        }
        if (data.vehicles.length === 0) {
            alert('Yazdırılacak Taşıt Bulunamadı.');
            return;
        }
        const { vehicles, titleText, dateRangeText } = data;
        const activeColumns = expandStokMuayeneEgzozColumns(data.activeColumns);
        const printOpts = { compact: true, printSeparateMuayeneColumns: true, fullPrintDates: true };
        const colgroup = buildStokPrintColgroup(activeColumns);
        const thead = activeColumns.map(col => `<th data-col="${col.key}">${escapeHtml(stokPrintHeaders[col.key] || col.key)}</th>`).join('');
        const rows = vehicles.map((vehicle, index) => {
            const cells = activeColumns.map(col => `<td data-col="${col.key}">${escapeHtml(String(getStokCellValue(vehicle, col, index, printOpts)))}</td>`).join('');
            return `<tr class="${index % 2 === 0 ? 'even' : 'odd'}">${cells}</tr>`;
        }).join('');
        const el = document.createElement('div');
        el.id = 'stok-print-area';
        const printTableClass = 'stok-print-table' + (activeColumns.length >= 11 ? ' stok-print-dense' : '');
        el.innerHTML = `<h1 class="stok-print-title">${escapeHtml(titleText)}</h1><p class="stok-print-date">${escapeHtml(dateRangeText)}</p><table class="${printTableClass}">${colgroup}<thead><tr>${thead}</tr></thead><tbody>${rows}</tbody></table>`;
        document.body.appendChild(el);
        /* Detay çoksa yatay sayfa: masaüstü 9+ sütun; mobilde daha erken (7+) */
        const useLandscape = activeColumns.length >= 9
            || (isMobileStokViewport() && activeColumns.length >= 7);
        let landscapeStyle = null;
        if (useLandscape) {
            landscapeStyle = document.createElement('style');
            landscapeStyle.id = 'stok-print-landscape';
            landscapeStyle.textContent = '@media print { @page { size: landscape; } }';
            document.head.appendChild(landscapeStyle);
        }
        const cleanup = () => {
            el.remove();
            if (landscapeStyle && landscapeStyle.parentNode) landscapeStyle.remove();
            window.removeEventListener('afterprint', cleanup);
        };
        window.addEventListener('afterprint', cleanup);
        window.print();
    };

    // --- 2. SEKME: KULLANICI GÖRÜNÜMÜ ---
    
    // Kullanıcı Grid Render
    function renderKullaniciBranchGrid() {
        const gridContainer = document.getElementById('kullanici-branch-grid');
        const listContainer = document.getElementById('kullanici-list-container');
        
        if (!gridContainer) return;
        
        const branches = getBranches();
        const users = getUsers();
        
        // Grid görünümünü göster, liste görünümünü gizle
        if (gridContainer) gridContainer.style.display = 'flex';
        if (listContainer) listContainer.style.display = 'none';
        
        // "Tümü" kartı
        const totalCount = users.length;
        let html = `
            <div class="stok-branch-card all-card ${kullaniciCurrentBranchId === 'all' ? 'active' : ''}" 
                 onclick="selectKullaniciBranch('all')">
                <div class="stok-branch-name">TÜMÜ</div>
                <div class="stok-branch-count">${totalCount} Kullanıcı</div>
            </div>
        `;

        // Şube kartları
        branches.forEach(branch => {
            const branchUsers = users.filter(function(u) {
                return getUserBranchIds(u).some(function(bid) { return String(bid) === String(branch.id); });
            });
            const count = branchUsers.length;
            const isActive = kullaniciCurrentBranchId === branch.id;
            
            html += `
                <div class="stok-branch-card ${isActive ? 'active' : ''}" 
                     onclick="selectKullaniciBranch('${escapeHtml(branch.id)}')">
                    <div class="stok-branch-name">${escapeHtml(String(branch.name || '').toLocaleUpperCase('tr-TR'))}</div>
                    <div class="stok-branch-count">${count} Kullanıcı</div>
                </div>
            `;
        });
        
        gridContainer.innerHTML = html;
    }
    
    // Şube Seçimi
    window.selectKullaniciBranch = function(branchId) {
        kullaniciCurrentBranchId = branchId;
        renderKullaniciView();
    };
    
    // Liste Görünümü Render
    function renderKullaniciList() {
        const gridContainer = document.getElementById('kullanici-branch-grid');
        const listContainer = document.getElementById('kullanici-list-container');
        
        if (!listContainer) return;
        
        // Grid görünümünü gizle, liste görünümünü göster
        if (gridContainer) gridContainer.style.display = 'none';
        if (listContainer) listContainer.style.display = 'block';
        
        let users = getUsers();
        const vehicles = getVehicles();
        const branches = getBranches();
        
        // Filtreleme
        if (kullaniciCurrentBranchId === 'all') {
            // Tüm kullanıcılar
        } else if (kullaniciCurrentBranchId) {
            users = users.filter(function (u) {
                const ids = (u.branchIds && u.branchIds.length) ? u.branchIds : (u.branchId ? [u.branchId] : []);
                return ids.some(function (bid) { return String(bid) === String(kullaniciCurrentBranchId); });
            });
        } else {
            // Grid görünümünde, liste render edilmemeli
            return;
        }
        
        // Arama filtresi
        if (kullaniciSearchTerm) {
            users = users.filter(u => {
                const userName = (u.name || '').toLowerCase();
                const userPhone = (u.phone || '').toLowerCase();
                const userEmail = (u.email || '').toLowerCase();
                const assignedVehicle = vehicles.find(v => String(v.assignedUserId || '') === String(u.id));
                const vehiclePlate = assignedVehicle ? (assignedVehicle.plate || '').toLowerCase() : '';
                const vehicleBrand = assignedVehicle ? (assignedVehicle.brandModel || '').toLowerCase() : '';
                
                return userName.includes(kullaniciSearchTerm) || 
                       userPhone.includes(kullaniciSearchTerm) || 
                       userEmail.includes(kullaniciSearchTerm) ||
                       vehiclePlate.includes(kullaniciSearchTerm) ||
                       vehicleBrand.includes(kullaniciSearchTerm);
            });
        }
        
        // Alfabetik sıralama
        users.sort((a, b) => {
            const nameA = (a.name || '').toLowerCase();
            const nameB = (b.name || '').toLowerCase();
            return nameA.localeCompare(nameB, 'tr');
        });
        
        if (users.length === 0) {
            listContainer.innerHTML = '<div style="text-align:center; padding:40px; color:#666;">Kullanıcı bulunamadı.</div>';
            return;
        }
        
        let html = `
            <div class="kullanici-list-top-controls">
                <div class="universal-back-bar">
                    <button type="button" class="universal-back-btn" onclick="goBackToKullaniciGrid()" title="Geri Dön">
                        <svg class="back-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                        <span class="universal-back-label">Geri Dön</span>
                    </button>
                </div>
                <div class="kullanici-export-controls">
                    <div class="kullanici-export-right">
                        <div id="kullanici-search-container" class="stok-search-container">
                            <input type="text" id="kullanici-search-input" class="stok-search-input" placeholder="İsim, telefon, e-posta, plaka, marka ara..." oninput="handleKullaniciSearch(this.value)">
                        </div>
                        <button class="stok-search-btn" onclick="toggleKullaniciSearch()" title="Ara">
                            🔍
                        </button>
                    </div>
                </div>
            </div>
            <div class="kullanici-list-items">
        `;
        
        users.forEach(u => {
            const assignedVehicle = vehicles.find(v => String(v.assignedUserId || '') === String(u.id));
            const vehiclePlate = formatPlaka(assignedVehicle ? (assignedVehicle.plate || '-') : '-');
            const vehicleBrand = formatBrandModel(assignedVehicle ? (assignedVehicle.brandModel || '-') : '-');
            
            html += `
                <div class="kullanici-list-item" onclick="showKullaniciDetail('${u.id}')">
                    <div class="kullanici-list-item-left">
                        <div class="kullanici-list-item-name">${escapeHtml(formatAdSoyad(u.name || '-'))}</div>
                    </div>
                    <div class="kullanici-list-item-right">
                        <div class="kullanici-list-item-plate">${escapeHtml(vehiclePlate)}</div>
                        <div class="kullanici-list-item-brand">${escapeHtml(vehicleBrand)}</div>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        listContainer.innerHTML = html;
    }
    
    // Grid'e Dönüş
    window.goBackToKullaniciGrid = function() {
        kullaniciCurrentBranchId = null;
        kullaniciSearchTerm = '';
        renderKullaniciView();
    };
    
    function removeKullaniciSearchOutsideListener() {
        document.removeEventListener('pointerdown', kullaniciSearchOutsidePointerDown, true);
    }

    function kullaniciSearchOutsidePointerDown(e) {
        const container = document.getElementById('kullanici-search-container');
        if (!container || !container.classList.contains('open')) {
            removeKullaniciSearchOutsideListener();
            return;
        }
        const shell = container.closest('.kullanici-export-right');
        if (shell && e.target && typeof shell.contains === 'function' && shell.contains(e.target)) {
            return;
        }
        container.classList.remove('open');
        const input = document.getElementById('kullanici-search-input');
        if (input) {
            input.value = '';
            window.handleKullaniciSearch('');
        }
        removeKullaniciSearchOutsideListener();
    }

    function bindKullaniciSearchOutsideClose() {
        removeKullaniciSearchOutsideListener();
        setTimeout(function() {
            document.addEventListener('pointerdown', kullaniciSearchOutsidePointerDown, true);
        }, 0);
    }

    // Arama kutusunu aç/kapat
    window.toggleKullaniciSearch = function() {
        const container = document.getElementById('kullanici-search-container');
        const input = document.getElementById('kullanici-search-input');
        
        if (container) {
            if (container.classList.contains('open')) {
                removeKullaniciSearchOutsideListener();
                container.classList.remove('open');
                if (input) {
                    input.value = '';
                    handleKullaniciSearch('');
                }
            } else {
                container.classList.add('open');
                bindKullaniciSearchOutsideClose();
                setTimeout(() => {
                    if (input) input.focus();
                }, 100);
            }
        }
    };
    
    var handleKullaniciSearchImpl = function(searchTerm) {
        kullaniciSearchTerm = ('' + searchTerm).toLowerCase().trim();
        if (kullaniciCurrentBranchId !== null) renderKullaniciList();
    };
    window.handleKullaniciSearch = (typeof window.debounce === 'function') ? window.debounce(handleKullaniciSearchImpl, 200) : handleKullaniciSearchImpl;
    
    // Kullanıcı Detay Göster
    window.showKullaniciDetail = function(userId) {
        kullaniciCurrentUserId = userId;
        const users = getUsers();
        const vehicles = getVehicles();
        const branches = getBranches();
        
        const user = users.find(u => u.id === userId);
        if (!user) {
            alert('Kullanıcı bulunamadı!');
            return;
        }
        
        const listContainer = document.getElementById('kullanici-list-container');
        if (!listContainer) return;
        
        // Kullanıcıya atanmış tüm taşıtları bul
        const assignedVehicles = vehicles.filter(v => String(v.assignedUserId || '') === String(userId));
        
        // Kullanıcıya atanmış taşıtların events'lerini topla
        const userEvents = [];
        assignedVehicles.forEach(vehicle => {
            if (vehicle.events && Array.isArray(vehicle.events)) {
                vehicle.events.forEach(event => {
                    userEvents.push({
                        ...event,
                        vehiclePlate: formatPlaka(vehicle.plate || '-'),
                        vehicleBrand: formatBrandModel(vehicle.brandModel || '-')
                    });
                });
            }
        });
        
        // Tarihe göre sırala (en yeni üstte)
        userEvents.sort((a, b) => {
            const dateA = a.date ? new Date(a.date) : new Date(0);
            const dateB = b.date ? new Date(b.date) : new Date(0);
            return dateB - dateA;
        });
        
        // Kullanıcı tipi etiketi: önce script-core helper, yoksa eski rapor dili
        let roleLabel;
        if (typeof window.getUserRoleLabelAnalytics === 'function') {
          roleLabel = window.getUserRoleLabelAnalytics(user);
        } else {
          const roleLabels = {
            genel_yonetici: 'Genel Yönetici',
            sube_yonetici: 'Yönetici',
            kullanici: 'Kullanıcı',
            admin: 'Genel Yönetici',
            sales: 'Satış Temsilcisi',
            driver: 'Kullanıcı'
          };
          const displayRole = user.role === 'yonetici_kullanici' ? 'sube_yonetici' : user.role;
          roleLabel = toTitleCase(roleLabels[displayRole] || displayRole || 'Kullanıcı');
        }
        
        const bidList = (user.branchIds && user.branchIds.length) ? user.branchIds : (user.branchId ? [user.branchId] : []);
        const branchNames = bidList.map(function (bid) {
            const b = branches.find(function (x) { return String(x.id) === String(bid); });
            return b ? b.name : '';
        }).filter(Boolean);
        const branchName = branchNames.length ? branchNames.map(function (n) { return toTitleCase(n); }).join(', ') : '-';
        
        let html = `
            <div class="kullanici-detail-header">
                <div class="universal-back-bar">
                    <button type="button" class="universal-back-btn" onclick="goBackToKullaniciList()" title="Geri Dön">
                        <svg class="back-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                        <span class="universal-back-label">Geri Dön</span>
                    </button>
                </div>
            </div>
            <div class="kullanici-detail-grid">
                <div class="kullanici-detail-left">
                    <div class="kullanici-detail-section">
                        <div class="kullanici-detail-row">
                            <span class="kullanici-detail-label">Ad Soyad:</span>
                            <span class="kullanici-detail-value">${escapeHtml(formatAdSoyad(user.name || '-'))}</span>
                        </div>
                        <div class="kullanici-detail-row">
                            <span class="kullanici-detail-label">Şube:</span>
                            <span class="kullanici-detail-value">${escapeHtml(branchName)}</span>
                        </div>
                        <div class="kullanici-detail-row">
                            <span class="kullanici-detail-label">Telefon:</span>
                            <span class="kullanici-detail-value">${escapeHtml(user.phone || '-')}</span>
                        </div>
                        <div class="kullanici-detail-row">
                            <span class="kullanici-detail-label">E-posta:</span>
                            <span class="kullanici-detail-value">${escapeHtml(user.email || '-')}</span>
                        </div>
                        <div class="kullanici-detail-row">
                            <span class="kullanici-detail-label">Kullanıcı Tipi:</span>
                            <span class="kullanici-detail-value">${escapeHtml(roleLabel)}</span>
                        </div>
                    </div>
                </div>
                <div class="kullanici-detail-right">
                    <div class="kullanici-detail-section">
                        <div class="kullanici-detail-section-title">Kullanıcı Hareketleri</div>
                        <div class="kullanici-events-list">
        `;
        
        if (userEvents.length === 0) {
            html += '<div style="text-align:center; padding:20px; color:#666;">Henüz hareket kaydı bulunmamaktadır.</div>';
        } else {
            userEvents.forEach(event => {
                const eventDate = event.date ? formatDateForDisplay(event.date) : '-';
                let eventText = '';
                let eventTypeLabel = '';
                
                if (event.type === 'kaza') {
                    eventTypeLabel = 'KAZA';
                    const d = event.data || {};
                    const surucu = formatAdSoyad(d.surucu || event.surucu || '-');
                    const tutar = (d.hasarTutari || event.tutar) ? formatNumber(String(d.hasarTutari || event.tutar || '')) + ' TL' : '-';
                    const aciklama = d.aciklama ? ` | ${escapeHtml(toTitleCase(d.aciklama))}` : '';
                    eventText = `Kullanıcı: ${escapeHtml(surucu)} | Hasar: ${escapeHtml(tutar)}${aciklama}`;
                } else if (event.type === 'bakim') {
                    eventTypeLabel = 'BAKIM';
                    const d = event.data || {};
                    const islemler = toTitleCase(d.islemler || event.islemler || '-');
                    const tutar = (d.tutar || event.tutar) ? formatNumber(String(d.tutar || event.tutar || '')) + ' TL' : '-';
                    eventText = `${escapeHtml(islemler)} | Tutar: ${escapeHtml(tutar)}`;
                } else if (event.type === 'km-revize') {
                    eventTypeLabel = 'KM GÜNCELLEME';
                    const d = event.data || {};
                    const eski = d.eskiKm != null && String(d.eskiKm).trim() !== '' ? formatNumber(String(d.eskiKm)) : '-';
                    const yeni = d.yeniKm != null && String(d.yeniKm).trim() !== '' ? formatNumber(String(d.yeniKm)) : '-';
                    const surucu = formatAdSoyad(d.surucu || '-');
                    eventText = `Önceki: ${escapeHtml(eski)} | Yeni: ${escapeHtml(yeni)} | Kaydeden: ${escapeHtml(surucu)}`;
                } else {
                    eventTypeLabel = event.type ? event.type.toUpperCase() : 'OLAY';
                    eventText = JSON.stringify(event);
                }
                
                html += `
                    <div class="kullanici-event-item">
                        <div class="kullanici-event-header">
                            <span class="kullanici-event-type">${escapeHtml(eventTypeLabel)}</span>
                            <span class="kullanici-event-date">${escapeHtml(eventDate)}</span>
                        </div>
                        <div class="kullanici-event-vehicle">${escapeHtml(event.vehiclePlate)} - ${escapeHtml(event.vehicleBrand)}</div>
                        <div class="kullanici-event-details">${escapeHtml(eventText)}</div>
                    </div>
                `;
            });
        }
        
        html += `
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        listContainer.innerHTML = html;
    };
    
    // Liste görünümüne dönüş
    window.goBackToKullaniciList = function() {
        kullaniciCurrentUserId = null;
        renderKullaniciList();
    };
    
    // Ana render fonksiyonu
    window.renderKullaniciView = function() {
        if (kullaniciCurrentBranchId === null) {
            renderKullaniciBranchGrid();
        } else {
            renderKullaniciList();
        }
    };
    
    function formatDateForDisplay(dateStr) { return !dateStr ? '' : (typeof window.formatDateShort === 'function' ? window.formatDateShort(dateStr) : formatDate(dateStr)); }

    // Global Event Listeners (ESC ve Overlay click)
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const modal = document.getElementById('reports-modal');
            if (modal && modal.classList.contains('active')) {
                closeReportsModal();
            }
        }
    });

    document.addEventListener('click', (e) => {
        const modal = document.getElementById('reports-modal');
        if (modal && modal.classList.contains('active') && e.target === modal) {
            closeReportsModal();
        }
    });


})();
