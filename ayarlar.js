/* =========================================
   AYARLAR MODÜLÜ - ŞUBE & KULLANICI YÖNETİMİ
   ========================================= */

   (function () {
    const BRANCHES_KEY = "medisa_branches_v1";
    const USERS_KEY = "medisa_users_v1";
    const VEHICLES_KEY = "medisa_vehicles_v1";
  
    function $(sel, root = document) { return root.querySelector(sel); }
    function $all(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }
  
    // ========================================
    // ŞUBE YÖNETİMİ
    // ========================================
  
    function readBranches() { return (typeof window.getMedisaBranches === 'function' ? window.getMedisaBranches() : null) || (function() { try { var r = localStorage.getItem(BRANCHES_KEY); return r ? JSON.parse(r) : []; } catch (e) { return []; } })(); }
    function writeBranches(arr) { if (typeof window.writeBranches === 'function') { window.writeBranches(arr); return; } localStorage.setItem(BRANCHES_KEY, JSON.stringify(arr)); if (window.appData) { window.appData.branches = arr; if (window.saveDataToServer) window.saveDataToServer().catch(function(err) { console.error('Sunucuya kaydetme hatası (sessiz):', err); }); } }
    function readVehicles() { return (typeof window.getMedisaVehicles === 'function' ? window.getMedisaVehicles() : null) || (function() { try { var r = localStorage.getItem(VEHICLES_KEY); return r ? JSON.parse(r) : []; } catch (e) { return []; } })(); }
  
    // — Modal Kontrolü (Ana Liste) —
    window.openBranchManagement = function openBranchManagement() {
      const modal = document.getElementById('branch-modal');
      if (!modal) return;
  
      // Listeyi render et
      renderBranchList();
  
      // Modalı aç
      modal.style.display = 'flex';
      requestAnimationFrame(() => modal.classList.add('active'));
    };
  
    window.closeBranchManagement = function closeBranchManagement() {
      const modal = document.getElementById('branch-modal');
      if (!modal) return;
      modal.classList.remove('active');
      setTimeout(() => modal.style.display = 'none', 300);
    };

    // — Modal Kontrolü (Form) —
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
          if (title) title.textContent = 'ŞUBE DÜZENLE';
        }
        // Sil butonunu göster
        if (deleteBtn) deleteBtn.style.display = 'flex';
      } else {
        // YENİ EKLEME MODU
        if (title) title.textContent = 'YENİ ŞUBE EKLE';
        // Sil butonunu gizle
        if (deleteBtn) deleteBtn.style.display = 'none';
      }
  
      // Modalı aç
      modal.style.display = 'flex';
      requestAnimationFrame(() => modal.classList.add('active'));
  
      // Focus
      if (nameInput) {
        setTimeout(() => nameInput.focus(), 350);
      }
    };
  
    window.closeBranchFormModal = function closeBranchFormModal() {
      const modal = document.getElementById('branch-form-modal');
      if (!modal) return;
      if (typeof window.resetModalInputs === 'function') {
        window.resetModalInputs(modal);
      }
      const form = $('#branch-form', modal);
      if (form) form.reset();
      const deleteBtn = $('#branch-delete-btn', modal);
      if (deleteBtn) deleteBtn.style.display = 'none';
      modal.classList.remove('active');
      setTimeout(() => modal.style.display = 'none', 300);
    };
  
    // — CRUD İşlemleri —
    /**
     * Şube kaydını formdan okuyup localStorage'a kaydeder (Create/Update)
     * 
     * Validasyon + Kaydetme akışı:
     * 1. Form alanlarını oku (id, name, city)
     * 2. Şube adı validasyonu yap (zorunlu alan)
     * 3. ID varsa güncelleme, yoksa yeni ekleme modu
     * 4. localStorage'a yaz
     * 5. Form modalını kapat ve ana listeyi güncelle
     * 6. Kullanıcıya başarı mesajı göster
     * 
     * @throws {Error} localStorage yazma hatası durumunda uygulama crash olabilir
     * (Hata yakalama henüz eklenmedi - rapor önerisi #6)
     */
    window.saveBranch = function saveBranch() {
      const modal = document.getElementById('branch-form-modal');
      if (!modal) return;
      const saveBtn = modal.querySelector('.universal-btn-save[onclick*="saveBranch"]') || modal.querySelector('.universal-btn-save');
      if (saveBtn && saveBtn.disabled) return;
      if (saveBtn) saveBtn.disabled = true;
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
  
      const branches = readBranches();
  
      if (id) {
        // GÜNCELLEME
        const idx = branches.findIndex(b => b.id === id);
        if (idx !== -1) {
          branches[idx].name = name;
          branches[idx].city = city;
        }
      } else {
        // YENİ EKLEME
        const newBranch = {
          id: Date.now().toString(),
          name: name,
          city: city,
          createdAt: new Date().toISOString()
        };
        branches.push(newBranch);
      }
  
        writeBranches(branches);
  
        // Form modalını kapat
        closeBranchFormModal();
  
        // Ana modalı güncelle
        renderBranchList();
  
        alert(id ? 'Şube Güncellendi.' : 'Şube Eklendi.');
      } catch (error) {
        alert('Şube kaydı sırasında bir hata oluştu! Lütfen tekrar deneyin.');
      } finally {
        if (saveBtn) saveBtn.disabled = false;
      }
    };
  
    window.editBranch = function editBranch(id) {
      openBranchFormModal(id);
    };
  
    window.deleteBranch = function deleteBranch(id) {
      if (!id) return; // ID yoksa işlem yapma
      
      // Taşıt kontrolü
      const vehicles = readVehicles();
      const vehicleCount = vehicles.filter(v => v.branchId === id).length;
  
      // Kullanıcı kontrolü (şubeye atanmış kullanıcılar)
      const users = readUsers();
      const userCount = users.filter(u => u.branchId === id).length;
  
      if (vehicleCount > 0 || userCount > 0) {
        let msg = 'Şubeye İlişkin Kayıtlı Veri Bulunduğundan Silme Yapılamaz!\n\n';
        if (vehicleCount > 0) msg += `• ${vehicleCount} Adet Taşıt\n`;
        if (userCount > 0) msg += `• ${userCount} Adet Kullanıcı\n`;
        alert(msg);
        return;
      }
  
      if (!confirm('Bu Şubeyi Silmek İstediğinizden Emin Misiniz?')) return;
  
      const branches = readBranches();
      const filtered = branches.filter(b => b.id !== id);
      writeBranches(filtered);
      
      // Form modalını kapat
      closeBranchFormModal();
      
      // Ana modalı güncelle
      renderBranchList();
  
      alert('Şube Silindi.');
    };

    // — Liste Render —
    window.renderBranchList = function renderBranchList() {
      const container = document.getElementById('branch-list');
      if (!container) return;
  
      const branches = readBranches();
      const vehicles = readVehicles();
  
      if (branches.length === 0) {
        container.innerHTML = `
          <div style="text-align:center; padding:20px; color:var(--muted);">
            Henüz şube eklenmemiş.
          </div>
        `;
        return;
      }
  
      const rows = branches.map(branch => {
        const vehicleCount = vehicles.filter(v => v.branchId === branch.id).length;
        return `
          <div class="settings-card" onclick="editBranch('${branch.id}')" style="cursor:pointer;">
            <div class="settings-card-content">
              <div class="settings-card-title">${escapeHtml(branch.name)}</div>
              <div class="settings-card-subtitle">${escapeHtml(branch.city || '')}</div>
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
      if (typeof window.getMedisaUsers === 'function') return window.getMedisaUsers();
      try {
        var raw = localStorage.getItem(USERS_KEY);
        var arr = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(arr)) return [];
        return arr.map(function(u) {
          if (!u.name && u.isim) u.name = u.isim;
          if (!u.name && (u.firstName || u.lastName)) u.name = ((u.firstName || '') + ' ' + (u.lastName || '')).trim();
          if (!u.name) u.name = '';
          if (!u.phone && u.telefon) u.phone = u.telefon;
          if (!u.branchId && u.sube_id) u.branchId = String(u.sube_id);
          if (!u.role && u.tip) u.role = u.tip === 'admin' ? 'admin' : 'driver';
          return u;
        });
      } catch (e) { return []; }
    }
  
    function writeVehicles(arr) { if (typeof window.writeVehicles === 'function') { window.writeVehicles(arr); return; } localStorage.setItem(VEHICLES_KEY, JSON.stringify(arr)); if (window.appData) { window.appData.tasitlar = arr; if (window.saveDataToServer) window.saveDataToServer().catch(function(err) { console.error('Sunucuya kaydetme hatası (sessiz):', err); }); } }
  
    /**
     * localStorage kullanıcı listesini appData.users formatına dönüştürüp senkron eder.
     * Portal (driver_login) ve raporlar tek kaynaktan (appData) okur.
     * zimmetli_araclar: driver_save.php için atanmış taşıt ID'leri (assignedUserId eşleşen taşıtlar)
     */
    function syncUsersToAppData(arr) {
      if (!window.appData) return;
      const list = arr != null ? arr : readUsers();
      const vehicles = readVehicles();
      window.appData.users = list.map(u => {
        const zimmetliAraclar = vehicles
          .filter(v => (v.assignedUserId != null && String(v.assignedUserId) === String(u.id)))
          .map(v => (typeof v.id === 'number' ? v.id : Number(v.id)) || v.id);
        return {
          id: u.id,
          isim: u.name || u.isim || '',
          kullanici_adi: u.kullanici_adi || '',
          sifre: u.sifre || '',
          telefon: u.phone || '',
          email: u.email || '',
          sube_id: u.branchId != null && u.branchId !== '' ? (isNaN(Number(u.branchId)) ? u.branchId : Number(u.branchId)) : undefined,
          tip: u.role === 'admin' ? 'admin' : (u.role === 'driver' ? 'surucu' : 'kullanici'),
          zimmetli_araclar: zimmetliAraclar,
          aktif: u.aktif !== false,
          kayit_tarihi: u.createdAt || new Date().toISOString(),
          son_giris: u.son_giris || null
        };
      });
      if (window.saveDataToServer) {
        window.saveDataToServer().catch(err => {
          console.error('Sunucuya kaydetme hatası (sessiz):', err);
        });
      }
    }
  
    function writeUsers(arr) {
      localStorage.setItem(USERS_KEY, JSON.stringify(arr));
      if (window.appData) {
        syncUsersToAppData(arr);
      }
    }
  
    // — Modal Kontrolü (Ana Liste) —
    window.openUserManagement = function openUserManagement() {
      const modal = document.getElementById('user-modal');
      if (!modal) return;
  
      // Listeyi render et
      renderUserList();
  
      // Modalı aç
      modal.style.display = 'flex';
      requestAnimationFrame(() => modal.classList.add('active'));
    };
  
    window.closeUserManagement = function closeUserManagement() {
      const modal = document.getElementById('user-modal');
      if (!modal) return;
      modal.classList.remove('active');
      setTimeout(() => modal.style.display = 'none', 300);
    };
  
    // — Kullanıcı formu: Atanmış taşıtlar checkbox listesi doldur (arama + filtreleme) —
    function populateUserVehiclesMulti(searchFilter = '') {
      const container = document.getElementById('user-vehicles-container');
      if (!container) return;
      // Mevcut seçimleri koru (filtre değişince kaybolmasın)
      const assignedIds = Array.from(container.querySelectorAll('input[name=user-vehicle]:checked')).map(cb => cb.value);
      const vehicles = readVehicles();
      let activeVehicles = vehicles.filter(v => v.satildiMi !== true);
      const q = (searchFilter || '').trim().toLowerCase();
      if (q) {
        activeVehicles = activeVehicles.filter(v => {
          const plaka = (v.plate || v.plaka || '').toLowerCase();
          return plaka.includes(q);
        });
      }
      container.innerHTML = '';
      activeVehicles.forEach(v => {
        const vid = String(v.id);
        const plaka = v.plate || v.plaka || '';
        const raw = (v.brandModel || (v.brand || v.marka || '') + ' ' + (v.model || '')).trim();
        const markaModel = (typeof window.toTitleCase === 'function' ? window.toTitleCase(raw) : raw);
        const label = plaka + (markaModel ? ' (' + markaModel + ')' : '');
        const labelEl = document.createElement('label');
        labelEl.style.display = 'block';
        labelEl.style.padding = '6px 8px';
        labelEl.style.cursor = 'pointer';
        labelEl.style.borderRadius = '4px';
        labelEl.style.marginBottom = '2px';
        labelEl.style.userSelect = 'none';
        labelEl.addEventListener('mouseenter', function() { this.style.background = 'rgba(255,255,255,0.06)'; });
        labelEl.addEventListener('mouseleave', function() { this.style.background = 'transparent'; });
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = vid;
        cb.name = 'user-vehicle';
        cb.checked = assignedIds.indexOf(vid) !== -1;
        cb.style.marginRight = '8px';
        cb.style.verticalAlign = 'middle';
        labelEl.appendChild(cb);
        labelEl.appendChild(document.createTextNode(' ' + label));
        cb.addEventListener('change', updateUserVehiclesTriggerText);
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
      const container = document.getElementById('user-vehicles-container');
      if (!trigger || !container) return;
      const checked = container.querySelectorAll('input[name=user-vehicle]:checked');
      const n = checked.length;
      trigger.textContent = n === 0 ? 'Taşıt Seçin' : (n === 1 ? '1 Taşıt Seçildi' : n + ' Taşıt Seçildi');
    }
  
    function toggleUserVehiclesDropdown() {
      const dropdown = document.getElementById('user-vehicles-dropdown');
      const trigger = document.getElementById('user-vehicles-trigger');
      if (!dropdown || !trigger) return;
      const isOpen = dropdown.style.display !== 'none';
      if (isOpen) {
        dropdown.style.display = 'none';
        trigger.classList.remove('user-vehicles-trigger-open');
      } else {
        dropdown.style.display = 'block';
        trigger.classList.add('user-vehicles-trigger-open');
      }
    }
  
    function closeUserVehiclesDropdown() {
      const dropdown = document.getElementById('user-vehicles-dropdown');
      const trigger = document.getElementById('user-vehicles-trigger');
      if (dropdown) dropdown.style.display = 'none';
      if (trigger) trigger.classList.remove('user-vehicles-trigger-open');
    }
  
    window.toggleUserVehiclesDropdown = toggleUserVehiclesDropdown;
  
    document.addEventListener('click', function(ev) {
      const wrap = document.querySelector('.user-vehicles-dropdown-wrap');
      const dropdown = document.getElementById('user-vehicles-dropdown');
      if (wrap && dropdown && dropdown.style.display !== 'none' && !wrap.contains(ev.target)) {
        closeUserVehiclesDropdown();
      }
    });
  
    // — Modal Kontrolü (Form) —
    window.openUserFormModal = function openUserFormModal(editId = null) {
      const modal = document.getElementById('user-form-modal');
      if (!modal) return;
  
      const form = $('#user-form', modal);
      const idInput = $('#user-id', modal);
      const nameInput = $('#user-name', modal);
      const branchSelect = $('#user-branch', modal);
      const phoneInput = $('#user-phone', modal);
      const emailInput = $('#user-email', modal);
      const roleSelect = $('#user-role', modal);
      const usernameInput = $('#user-username', modal);
      const passwordInput = $('#user-password', modal);
      const title = $('.modal-header h2', modal);
      const deleteBtn = $('#user-delete-btn', modal);
  
      // Şube dropdown'ını doldur
      populateBranchDropdown();
      // Atanacak taşıt dropdown'ını kapat, arama temizle ve listeyi doldur
      closeUserVehiclesDropdown();
      const searchInput = document.getElementById('user-vehicles-search');
      if (searchInput) searchInput.value = '';
      populateUserVehiclesMulti();
  
      // Şube select'e tıklanınca veya focus alındığında otomatik açılması için event listener ekle
      setTimeout(() => {
        const updatedBranchSelect = $('#user-branch', modal);
        if (updatedBranchSelect && !updatedBranchSelect.dataset.dropdownHandler) {
          updatedBranchSelect.dataset.dropdownHandler = 'true';
          
          // Focus event'i - Tab ile geldiğinde otomatik aç
          let isMouseClick = false;
          updatedBranchSelect.addEventListener('mousedown', function() {
            isMouseClick = true;
            setTimeout(() => { isMouseClick = false; }, 200);
          });
          
          updatedBranchSelect.addEventListener('focus', function(e) {
            // Eğer mouse ile tıklandıysa, zaten açılacak, bir şey yapma
            if (isMouseClick) return;
            
            // Klavye ile focus alındıysa (Tab ile), programatik click yap
            setTimeout(() => {
              // Select elementinin bounding box'ını al
              const rect = this.getBoundingClientRect();
              
              // Select elementinin sağ tarafına (dropdown okuna) tıklamış gibi yap
              const clickX = rect.right - 20; // Sağdan 20px içeri
              const clickY = rect.top + rect.height / 2; // Dikeyde ortada
              
              // Programatik mousedown event'i gönder
              const mouseDownEvent = new MouseEvent('mousedown', {
                bubbles: true,
                cancelable: true,
                view: window,
                button: 0,
                clientX: clickX,
                clientY: clickY
              });
              this.dispatchEvent(mouseDownEvent);
              
              // Mouseup event'i gönder
              setTimeout(() => {
                const mouseUpEvent = new MouseEvent('mouseup', {
                  bubbles: true,
                  cancelable: true,
                  view: window,
                  button: 0,
                  clientX: clickX,
                  clientY: clickY
                });
                this.dispatchEvent(mouseUpEvent);
                
                // Click event'i gönder
                setTimeout(() => {
                  const clickEvent = new MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                    view: window,
                    button: 0,
                    clientX: clickX,
                    clientY: clickY
                  });
                  this.dispatchEvent(clickEvent);
                }, 10);
              }, 10);
            }, 200);
          });
          
          // Click event'i - Fare ile tıklandığında da aç (zaten açılıyor ama garantilemek için)
          updatedBranchSelect.addEventListener('click', function(e) {
            // Native dropdown zaten açılacak, sadece focus ver
            if (document.activeElement !== this) {
              this.focus();
            }
          });
        }
      }, 100);
  
      // Form temizle
      if (form) form.reset();
      if (idInput) idInput.value = '';
  
      if (editId) {
        // DÜZENLEME MODU
        const users = readUsers();
        const user = users.find(u => u.id === editId);
        if (user) {
          if (idInput) idInput.value = user.id;
          if (nameInput) nameInput.value = user.name;
          const currentBranchSelect = $('#user-branch', modal);
          if (currentBranchSelect) currentBranchSelect.value = user.branchId || '';
          if (phoneInput) phoneInput.value = user.phone || '';
          if (emailInput) emailInput.value = user.email || '';
          if (roleSelect) roleSelect.value = user.role || 'driver';
          if (usernameInput) usernameInput.value = user.kullanici_adi || '';
          if (passwordInput) passwordInput.value = user.sifre || '';
          const vehiclesContainer = document.getElementById('user-vehicles-container');
          if (vehiclesContainer) {
            const vehicles = readVehicles();
            const assignedIds = vehicles.filter(v => v.assignedUserId === user.id).map(v => String(v.id));
            vehiclesContainer.querySelectorAll('input[name=user-vehicle]').forEach(cb => {
              cb.checked = assignedIds.indexOf(cb.value) !== -1;
            });
            updateUserVehiclesTriggerText();
          }
          if (title) title.textContent = 'KULLANICI DÜZENLE';
        }
        // Sil butonunu göster
        if (deleteBtn) deleteBtn.style.display = 'flex';
      } else {
        // YENİ EKLEME MODU
        if (title) title.textContent = 'YENİ KULLANICI EKLE';
        // Sil butonunu gizle
        if (deleteBtn) deleteBtn.style.display = 'none';
      }
  
      // Modalı aç
      modal.style.display = 'flex';
      requestAnimationFrame(() => modal.classList.add('active'));
  
      // Focus
      if (nameInput) {
        setTimeout(() => nameInput.focus(), 350);
      }
    };
  
    window.closeUserFormModal = function closeUserFormModal() {
      const modal = document.getElementById('user-form-modal');
      if (!modal) return;
      if (typeof window.resetModalInputs === 'function') {
        window.resetModalInputs(modal);
      }
      const form = $('#user-form', modal);
      if (form) form.reset();
      closeUserVehiclesDropdown();
      const searchInput = document.getElementById('user-vehicles-search');
      if (searchInput) searchInput.value = '';
      const deleteBtn = $('#user-delete-btn', modal);
      if (deleteBtn) deleteBtn.style.display = 'none';
      modal.classList.remove('active');
      setTimeout(() => modal.style.display = 'none', 300);
    };
  
    // — Şube Dropdown Doldur —
    function populateBranchDropdown() {
      const select = document.getElementById('user-branch');
      if (!select) return;
  
      const branches = readBranches();
  
      select.innerHTML = '<option value="">Şube Seçin</option>';
  
      branches.forEach(branch => {
        const option = document.createElement('option');
        option.value = branch.id;
        option.textContent = branch.name;
        select.appendChild(option);
      });
    }
  
    // — CRUD İşlemleri —
    /**
     * Kullanıcı kaydını formdan okuyup localStorage'a kaydeder (Create/Update)
     * 
     * Validasyon + Kaydetme akışı:
     * 1. Form alanlarını oku (id, name, branchId, phone, email, role)
     * 2. Ad Soyad ve Şube validasyonu yap (zorunlu alanlar)
     * 3. ID varsa güncelleme, yoksa yeni ekleme modu
     * 4. localStorage'a yaz
     * 5. Form modalını kapat ve ana listeyi güncelle
     * 6. Kullanıcıya başarı mesajı göster
     * 
     * @throws {Error} localStorage yazma hatası durumunda uygulama crash olabilir
     * (Hata yakalama henüz eklenmedi - rapor önerisi #6)
     */
    function formatUserFullName(rawName) {
      const cleaned = (rawName || '').trim().replace(/\s+/g, ' ');
      if (!cleaned) return '';
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
  
    window.saveUser = function saveUser() {
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
  
        if (!nameInput || !branchSelect) {
          alert('Form alanları bulunamadı!');
          return;
        }
  
        const id = idInput ? idInput.value.trim() : '';
        const nameRaw = nameInput.value.trim();
        const name = formatUserFullName(nameRaw);
        const branchId = branchSelect.value;
        const phone = phoneInput ? phoneInput.value.trim() : '';
        const email = emailInput ? emailInput.value.trim() : '';
        const role = roleSelect ? roleSelect.value : 'driver';
        const kullanici_adi = usernameInput ? usernameInput.value.trim() : '';
        const sifre = passwordInput ? passwordInput.value : '';
        const selectedVehicleIds = vehiclesContainer
          ? Array.from(vehiclesContainer.querySelectorAll('input[name=user-vehicle]:checked')).map(cb => cb.value)
          : [];
  
        // Validasyon
        if (!name || !name.trim()) {
          alert('Ad Soyad giriniz.');
          nameInput.focus();
          return;
        }
        if (!branchId) {
          alert('Şube Seçiniz.');
          branchSelect.focus();
          return;
        }
  
        const users = readUsers();
        const vehicles = readVehicles();
        const hasAssignedVehicles = selectedVehicleIds.length > 0;
  
        // Şoför portal girişi: Taşıt atanmışsa Kullanıcı Adı ve Şifre zorunlu
        if (hasAssignedVehicles && (!kullanici_adi || !sifre)) {
          alert('Portal Girişi İçin Taşıt Atadığınız Kullanıcıların "Kullanıcı Adı (portal girişi)" ve "Şifre (portal girişi)" alanlarını doldurmanız gerekir. Kullanıcı bu bilgilerle driver sayfasında giriş yapacaktır.');
          if (usernameInput) usernameInput.focus();
          return;
        }
  
        let savedUserId = id;
        if (id) {
          // GÜNCELLEME
          const idx = users.findIndex(u => u.id === id);
          if (idx !== -1) {
            users[idx].name = name;
            users[idx].branchId = branchId;
            users[idx].phone = phone;
            users[idx].email = email;
            users[idx].role = role;
            users[idx].kullanici_adi = kullanici_adi;
            users[idx].sifre = sifre;
          }
        } else {
          // YENİ EKLEME
          const newUser = {
            id: 'u' + Date.now().toString(),
            name: name,
            branchId: branchId,
            phone: phone,
            email: email,
            role: role,
            kullanici_adi: kullanici_adi,
            sifre: sifre,
            createdAt: new Date().toISOString()
          };
          users.push(newUser);
          savedUserId = newUser.id;
        }
  
        // Atanmış taşıtlar: tek kaynak vehicle.assignedUserId
        vehicles.forEach(v => {
          const vid = String(v.id);
          const wasAssigned = v.assignedUserId === savedUserId;
          const nowSelected = selectedVehicleIds.indexOf(vid) !== -1;
          if (wasAssigned && !nowSelected) {
            v.assignedUserId = undefined;
            if (v.tahsisKisi !== undefined) v.tahsisKisi = '';
          } else if (nowSelected) {
            v.assignedUserId = savedUserId;
            const u = users.find(u => u.id === savedUserId);
            if (u && v.tahsisKisi !== undefined) v.tahsisKisi = u.name || '';
            // Taşıtta şube yoksa, kullanıcının şubesini otomatik ata (şube kullanıcıda zorunlu)
            if (u && !v.branchId && u.branchId) v.branchId = u.branchId;
          }
        });
        writeVehicles(vehicles);
  
        writeUsers(users);
  
        // Form modalını kapat
        closeUserFormModal();
  
        // Ana modalı güncelle
        renderUserList();
  
        alert(id ? 'Kullanıcı Güncellendi.' : 'Kullanıcı Eklendi.');
  
        if (savedUserId) {
          window.dispatchEvent(new CustomEvent('userSaved', { detail: { id: savedUserId } }));
        }
      } catch (error) {
        console.error('Kullanıcı kayıt hatası:', error);
        alert('Kullanıcı kaydı sırasında bir hata oluştu! Lütfen tekrar deneyin.');
      } finally {
        if (saveBtn) saveBtn.disabled = false;
      }
    };
  
    window.editUser = function editUser(id) {
      openUserFormModal(id);
    };
  
    window.deleteUser = function deleteUser(id) {
      if (!id) return; // ID yoksa işlem yapma
      
      // Taşıt kontrolü
      const vehicles = readVehicles();
      const count = vehicles.filter(v => v.assignedUserId === id).length;
  
      if (count > 0) {
        alert(`Bu Kullanıcıya ${count} Adet Taşıt Tahsis Edilmiş. Önce Taşıtları Başka Kullanıcıya Aktarın.`);
        return;
      }
  
      if (!confirm('Bu Kullanıcıyı Silmek İstediğinizden Emin Misiniz?')) return;
  
      const users = readUsers();
      const filtered = users.filter(u => u.id !== id);
      writeUsers(filtered);
      
      // Form modalını kapat
      closeUserFormModal();
      
      // Ana modalı güncelle
      renderUserList();
  
      alert('Kullanıcı Silindi.');
    };

    // — Liste Render —
    window.renderUserList = function renderUserList() {
      const container = document.getElementById('user-list');
      if (!container) return;
  
      const users = readUsers();
      const branches = readBranches();
  
      if (users.length === 0) {
        container.innerHTML = `
          <div style="text-align:center; padding:20px; color:var(--muted);">
            Henüz kullanıcı eklenmemiş.
          </div>
        `;
        return;
      }
  
      const rows = users.map(user => {
        const branch = branches.find(b => b.id === user.branchId);
        const branchName = branch ? branch.name : '-';
        
        const roleLabels = {
          'admin': 'Yönetici',
          'sales': 'Satış Temsilcisi',
          'driver': 'Kullanıcı'
        };
        const roleLabel = roleLabels[user.role] || 'Kullanıcı';
        
        return `
          <div class="settings-card" onclick="editUser('${user.id}')" style="cursor:pointer;">
            <div class="settings-card-content">
              <div class="settings-card-title">${escapeHtml(user.name || 'İsimsiz')}</div>
              <div class="settings-card-subtitle">${escapeHtml(branchName)}</div>
              <div class="settings-card-gorev">${escapeHtml(roleLabel)}</div>
            </div>
          </div>
        `;
      }).join('');
  
      container.innerHTML = rows;
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
  
      if (dataModal && dataModal.classList.contains('active')) {
        closeDataManagement();
      } else if (branchFormModal && branchFormModal.classList.contains('active')) {
        closeBranchFormModal();
      } else if (userFormModal && userFormModal.classList.contains('active')) {
        closeUserFormModal();
      } else if (branchModal && branchModal.classList.contains('active')) {
        closeBranchManagement();
      } else if (userModal && userModal.classList.contains('active')) {
        closeUserManagement();
      }
    });
  
    document.addEventListener('click', (e) => {
      const branchModal = document.getElementById('branch-modal');
      const userModal = document.getElementById('user-modal');
      const branchFormModal = document.getElementById('branch-form-modal');
      const userFormModal = document.getElementById('user-form-modal');
      const dataModal = document.getElementById('data-management-modal');
  
      if (branchModal && branchModal.classList.contains('active') && e.target === branchModal) {
        closeBranchManagement();
      }
      if (userModal && userModal.classList.contains('active') && e.target === userModal) {
        closeUserManagement();
      }
      if (branchFormModal && branchFormModal.classList.contains('active') && e.target === branchFormModal) {
        closeBranchFormModal();
      }
      if (userFormModal && userFormModal.classList.contains('active') && e.target === userFormModal) {
        closeUserFormModal();
      }
      if (dataModal && dataModal.classList.contains('active') && e.target === dataModal) {
        closeDataManagement();
      }
    });
  
    // ========================================
    // VERİ YÖNETİMİ
    // ========================================
  
    // — Modal Kontrolü —
    window.openDataManagement = function openDataManagement(event) {
      if (event && typeof event.stopPropagation === 'function') {
        event.stopPropagation();
        event.preventDefault();
      }
  
      const settingsMenu = document.getElementById('settings-menu');
      if (settingsMenu) {
        settingsMenu.classList.remove('open');
      }
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
    };
  
    window.closeDataManagement = function closeDataManagement() {
      const modal = document.getElementById('data-management-modal');
      if (!modal) return;
      modal.classList.remove('active');
      setTimeout(() => modal.style.display = 'none', 300);
    };
  
    // — YEDEKLE (Export) —
    window.exportData = function exportData() {
      try {
        const branches = readBranches();
        const users = readUsers();
        const vehicles = readVehicles();
  
        const backup = {
          branches: branches,
          users: users,
          vehicles: vehicles,
          backup_date: new Date().toISOString(),
          version: "1.0"
        };
  
        const dataStr = JSON.stringify(backup, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = `medisa_yedek_${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        
        URL.revokeObjectURL(link.href);
  
        alert('Yedek Başarıyla İndirildi!');
      } catch (error) {
        alert('Yedekleme sırasında hata oluştu!');
      }
    };
  
    // — SON YEDEKTEN GERİ YÜKLE (medisa_server_backup - önbellek temizleme sonrası) —
    // � SON YEDEKTEN GERI YUKLE (once sunucu yedegi, sonra local fallback) �
    function normalizeBackupPayload(raw, source) {
      if (!raw || typeof raw !== "object") return null;
      const vehicles = Array.isArray(raw.vehicles) ? raw.vehicles : (Array.isArray(raw.tasitlar) ? raw.tasitlar : []);
      const branches = Array.isArray(raw.branches) ? raw.branches : [];
      const users = Array.isArray(raw.users) ? raw.users : [];
      if (!Array.isArray(vehicles) || !Array.isArray(branches) || !Array.isArray(users)) return null;
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
        duzeltme_talepleri: Array.isArray(raw.duzeltme_talepleri) ? raw.duzeltme_talepleri : null
      };
    }

    async function fetchServerLastBackup() {
      try {
        const res = await fetch("restore.php?source=backup", { cache: "no-store" });
        if (!res.ok) return null;
        const payload = await res.json();
        return normalizeBackupPayload(payload, "server");
      } catch (_e) {
        return null;
      }
    }

    function applyRestoredBackup(backup) {
      writeBranches(backup.branches);
      writeUsers(backup.users);
      localStorage.setItem(VEHICLES_KEY, JSON.stringify(backup.vehicles));

      const existingApp = window.appData || {};
      const normalizedUsers = (window.appData && Array.isArray(window.appData.users)) ? window.appData.users : backup.users;
      const restoredBlob = {
        tasitlar: backup.vehicles,
        kayitlar: backup.kayitlar != null ? backup.kayitlar : (existingApp.kayitlar || []),
        branches: backup.branches,
        users: normalizedUsers,
        ayarlar: backup.ayarlar || existingApp.ayarlar || { sirketAdi: "Medisa", yetkiliKisi: "", telefon: "", eposta: "" },
        sifreler: backup.sifreler != null ? backup.sifreler : (existingApp.sifreler || []),
        arac_aylik_hareketler: backup.arac_aylik_hareketler != null ? backup.arac_aylik_hareketler : (existingApp.arac_aylik_hareketler || []),
        duzeltme_talepleri: backup.duzeltme_talepleri != null ? backup.duzeltme_talepleri : (existingApp.duzeltme_talepleri || [])
      };

      localStorage.setItem("medisa_data_v1", JSON.stringify(restoredBlob));
      localStorage.setItem("medisa_server_backup", JSON.stringify({
        ...backup,
        upload_date: new Date().toISOString()
      }));
      sessionStorage.setItem("medisa_just_restored", "1");
      window.appData = restoredBlob;
    }

    window.restoreFromLastBackup = async function restoreFromLastBackup() {
      try {
        let backup = await fetchServerLastBackup();
        if (!backup) {
          const raw = localStorage.getItem("medisa_server_backup");
          if (raw) backup = normalizeBackupPayload(JSON.parse(raw), "local");
        }

        if (!backup) {
          alert("Son yedek bulunamadi.");
          return;
        }

        const dateStr = backup.upload_date ? new Date(backup.upload_date).toLocaleString("tr-TR") : "Bilinmiyor";
        const sourceLabel = backup.source === "server" ? "Sunucu yedegi" : "Yerel yedek";
        const message = `Kaynak: ${sourceLabel}\nYedek Tarihi: ${dateStr}\n\n` +
          `Subeler: ${backup.branches.length}\n` +
          `Kullanicilar: ${backup.users.length}\n` +
          `Tasitlar: ${backup.vehicles.length}\n\n` +
          `Mevcut veriler silinecek. Emin misiniz?`;
        if (!confirm(message)) return;

        applyRestoredBackup(backup);

        if (typeof window.saveDataToServer === "function") {
          try {
            await Promise.race([
              window.saveDataToServer(),
              new Promise(function(resolve) { setTimeout(resolve, 8000); })
            ]);
          } catch (_syncErr) {
            // Sync hatasi restore islemini kesmesin
          }
        }

        alert("Yedek basariyla geri yuklendi!\n\nSayfa yenilenecek.");
        setTimeout(function() { window.location.reload(); }, 500);
      } catch (err) {
        if (typeof window.__medisaLogError === "function") window.__medisaLogError("Yedek geri yukle (restoreFromLastBackup)", err);
        else console.error("Yedek geri yukle hatasi:", err);
        alert("Yedek okunamadi. Lutfen gecerli bir yedek dosyasi ile tekrar deneyin.");
      }
    };

    // � YEDEKTEN GERI YUKLE (Import - dosyadan) �
    window.importData = function importData() {
      try {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.style.position = 'fixed';
        input.style.left = '-9999px';
        input.style.opacity = '0';
  
        input.onchange = function(e) {
          const file = e.target.files[0];
          if (!file) return;
  
          const reader = new FileReader();
          reader.onload = function(event) {
            try {
              const backup = JSON.parse(event.target.result);
  
              if (!backup.branches || !backup.users || !backup.vehicles) {
                alert('Geçersiz Yedek Dosyası!');
                return;
              }
  
              const message = `Yedek Tarih: ${new Date(backup.backup_date).toLocaleString('tr-TR')}\n\n` +
                            `Şubeler: ${backup.branches.length}\n` +
                            `Kullanıcılar: ${backup.users.length}\n` +
                            `Taşıtlar: ${backup.vehicles.length}\n\n` +
                            `Mevcut Veriler Silinecek! Emin Misiniz?`;
  
              if (!confirm(message)) return;
  
              writeBranches(backup.branches);
              writeUsers(backup.users);
              localStorage.setItem(VEHICLES_KEY, JSON.stringify(backup.vehicles));
  
              const existingApp = window.appData || {};
              const restoredBlob = {
                tasitlar: backup.vehicles,
                kayitlar: backup.kayitlar != null ? backup.kayitlar : (existingApp.kayitlar || []),
                branches: backup.branches,
                users: backup.users,
                ayarlar: backup.ayarlar || existingApp.ayarlar || { sirketAdi: 'Medisa', yetkiliKisi: '', telefon: '', eposta: '' },
                sifreler: backup.sifreler != null ? backup.sifreler : (existingApp.sifreler || [])
              };
              localStorage.setItem('medisa_data_v1', JSON.stringify(restoredBlob));
              sessionStorage.setItem('medisa_just_restored', '1');
  
              window.appData = restoredBlob;
  
              var doReload = function() {
                alert('Yedek Başarıyla Geri Yüklendi!\n\nSayfa Yenilenecek.');
                setTimeout(function() { window.location.reload(); }, 500);
              };
  
              if (typeof window.saveDataToServer === 'function') {
                var saveDone = false;
                var done = function() {
                  if (saveDone) return;
                  saveDone = true;
                  doReload();
                };
                window.saveDataToServer().then(done).catch(done);
                setTimeout(done, 8000);
              } else {
                doReload();
              }
            } catch (error) {
              alert('Yedek Dosyası Okunamadı!');
            }
          };
  
          reader.readAsText(file);
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
  
    // — YEDEKLEME (Önbellek temizlemeden önce kesinlikle yapılır) —
    async function uploadToServer() {
      try {
        const branches = readBranches();
        const users = readUsers();
        const vehicles = readVehicles();
        const existingApp = window.appData || {};

        const backup = {
          branches: branches,
          users: users,
          vehicles: vehicles,
          kayitlar: Array.isArray(existingApp.kayitlar) ? existingApp.kayitlar : [],
          ayarlar: existingApp.ayarlar || { sirketAdi: "Medisa", yetkiliKisi: "", telefon: "", eposta: "" },
          sifreler: Array.isArray(existingApp.sifreler) ? existingApp.sifreler : [],
          arac_aylik_hareketler: Array.isArray(existingApp.arac_aylik_hareketler) ? existingApp.arac_aylik_hareketler : [],
          duzeltme_talepleri: Array.isArray(existingApp.duzeltme_talepleri) ? existingApp.duzeltme_talepleri : [],
          upload_date: new Date().toISOString(),
          version: "1.1"
        };

        // 1) Yedek localStorage'a kaydedilir (clear sonrasi korunacak)
        localStorage.setItem("medisa_server_backup", JSON.stringify(backup));

        // 2) Sunucu kayit fonksiyonu yoksa yerel yedek ile devam et
        if (typeof window.saveDataToServer !== "function") {
          return {
            success: true,
            localBackup: true,
            serverBackup: false,
            message: "Yerel yedek olusturuldu."
          };
        }

        // 3) Sunucuya gonderilecek appData'yi guncel verilerle hizala
        if (window.appData && typeof window.appData === "object") {
          const hasAppUsers = Array.isArray(window.appData.users) && window.appData.users.length > 0;
          window.appData = {
            ...window.appData,
            branches: branches,
            tasitlar: vehicles,
            users: hasAppUsers ? window.appData.users : users
          };
        }

        // 4) Sunucuya kaydet
        const serverSaved = await window.saveDataToServer();
        if (!serverSaved) {
          return {
            success: false,
            localBackup: true,
            serverBackup: false,
            message: "Yerel yedek olusturuldu ancak sunucuya yuklenemedi."
          };
        }

        return {
          success: true,
          localBackup: true,
          serverBackup: true,
          message: "Veriler sunucuya yedeklendi."
        };
      } catch (error) {
        if (typeof window.__medisaLogError === "function") window.__medisaLogError("Yedekleme (uploadToServer)", error);
        else console.error("Yedekleme hatasi:", error);
        return {
          success: false,
          localBackup: false,
          serverBackup: false,
          message: "Yedekleme sirasinda hata olustu. Lutfen tekrar deneyin."
        };
      }
    }
  
    // — ÖNBELLEK TEMİZLE —
    /**
     * Tarayıcı önbelleğini (cache) temizler
     * 
     * İşlem akışı:
     * 1. Kullanıcıya onay modal'ı göster (cache-confirm-modal)
     * 2. Onaylandığında confirmCacheClear() fonksiyonu çağrılır
     * 3. confirmCacheClear içinde:
     *    - Tüm localStorage verileri silinir (vehicles, branches, users)
     *    - Sayfa yenilenir (temiz başlangıç)
     * 
     * Not: Bu işlem geri alınamaz! Tüm veriler silinir.
     * 
     * @async
     * @throws {Error} Modal açma hatası durumunda info modal gösterilir
     */
    window.clearCache = async function clearCache() {
      try {
        // Modal ile kullanıcıya sor (sunucu yedekleme yalnızca onaydan sonra yapılır)
        const confirmMessage = 'Tarayıcı Belleği Temizlenecektir, Devam Etmek İstediğinize Emin Misiniz?';
        window.openCacheConfirmModal(confirmMessage);
   
      } catch (error) {
        window.showInfoModal('Bir Hata Oluştu!');
      }
    };
  
    // — ÖNBELLEK TEMİZLEME ONAY MODALI —
    let cacheClearConfirmed = false;
    let allowCacheClearWithLocalBackupOnly = false;
  
    window.openCacheConfirmModal = function openCacheConfirmModal(message, options = {}) {
      const modal = document.getElementById('cache-confirm-modal');
      const messageEl = document.getElementById('cache-confirm-message');
      if (!modal || !messageEl) return;

      // Mesajı güvenli şekilde formatla (önce escape, sonra satır sonlarını <br> ile değiştir)
      var safeMsg = (typeof window.escapeHtml === 'function' ? window.escapeHtml(message) : String(message).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'));
      messageEl.innerHTML = safeMsg.replace(/\n/g, '<br>');
      cacheClearConfirmed = false;
      allowCacheClearWithLocalBackupOnly = options && options.allowLocalBackupOnly === true;
  
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
        // Body'den modal-open class'ını kaldır
        document.body.classList.remove('modal-open');
        if (!cacheClearConfirmed) {
          // İptal edildi, bir şey yapma
        }
      }, 300);
    };
  
    window.confirmCacheClear = async function confirmCacheClear() {
      cacheClearConfirmed = true;
      closeCacheConfirmModal();
  
      try {
        // 1. ÖNCE YEDEKLEME YAP (yerel + mümkünse sunucu)
        window.showInfoModal('Veriler Yedekleniyor...');
        const result = await uploadToServer();

        // Yerel yedek bile oluşturulamadıysa işlem iptal
        if (!result.localBackup) {
          window.showInfoModal('Yedekleme Başarısız! Tarayıcı Belleği Temizlenmedi.');
          return;
        }

        if (!result.success && !allowCacheClearWithLocalBackupOnly) {
          // Sunucu yedeği başarısız: kullanıcıya yerel yedekle devam etme seçeneği ver
          const retryMessage = 'Veriler Sunucuya Yüklenemedi!\nYerel Yedek Oluşturuldu.\n\nYine De Temizlemek İstiyor Musunuz?';
          if (typeof window.closeInfoModal === 'function') {
            window.closeInfoModal();
          }
          window.openCacheConfirmModal(retryMessage, { allowLocalBackupOnly: true });
          return;
        }
  
        // 2. YEDEKLEME BAŞARILI - Sadece uygulama verilerini temizle (medisa_server_backup korunur)
        [BRANCHES_KEY, USERS_KEY, VEHICLES_KEY].forEach(k => localStorage.removeItem(k));
        // Diğer uygulama state anahtarlarını da temizle
        ['vehicle_column_order', 'stok_active_columns', 'stok_column_order', 'stok_base_column_order'].forEach(k => localStorage.removeItem(k));
        
        const backupResultMessage = result.serverBackup
          ? 'Veriler Sunucuya Yedeklendi Ve Tarayıcı Belleği Temizlendi!\n\nYedek korundu. Geri yüklemek için Ayarlar > Veri Yönetimi > Son Yedekten Geri Yükle kullanın.\n\nSayfa Yenilenecek.'
          : 'Sunucuya Yedekleme Yapılamadı Ancak Yerel Yedek Korunarak Tarayıcı Belleği Temizlendi!\n\nGeri yüklemek için Ayarlar > Veri Yönetimi > Son Yedekten Geri Yükle kullanın.\n\nSayfa Yenilenecek.';
        window.showInfoModal(backupResultMessage);
        
        // 3. Sayfayı yenile
        setTimeout(() => {
          window.location.reload();
        }, 2000);
  
      } catch (error) {
        window.showInfoModal('Bir Hata Oluştu!');
      }
    };
  
    // — BİLGİ MODALI (Alert yerine) —
    window.showInfoModal = function showInfoModal(message) {
      const modal = document.getElementById('info-modal');
      const messageEl = document.getElementById('info-message');
      if (!modal || !messageEl) return;

      // Mesajı güvenli şekilde formatla (önce escape, sonra satır sonlarını <br> ile değiştir)
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
        // Body'den modal-open class'ını kaldır
        document.body.classList.remove('modal-open');
      }, 300);
    };
  
    // ========================================
    // EXPORT STORAGE ACCESS
    // ========================================
  
    window.__medisaBranchesStorage = {
      key: BRANCHES_KEY,
      read: readBranches,
      write: writeBranches
    };
  
    window.__medisaUsersStorage = {
      key: USERS_KEY,
      read: readUsers,
      write: writeUsers
    };

    window.__medisaVehiclesStorage = {
      key: VEHICLES_KEY,
      read: readVehicles,
      write: writeVehicles
    };
  })();
