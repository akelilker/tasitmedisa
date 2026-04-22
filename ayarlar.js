/* =========================================
   AYARLAR MODÜLÜ - ŞUBE & KULLANICI YÖNETİMİ
   ========================================= */

   (function () {
    const BRANCHES_KEY = "medisa_branches_v1";
    const USERS_KEY = "medisa_users_v1";
    const VEHICLES_KEY = "medisa_vehicles_v1";
  
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

    let activeUserFormCustomSelect = null;

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
  
    function readBranches() { return (typeof window.getMedisaBranches === 'function' ? window.getMedisaBranches() : null) || (function() { try { var r = localStorage.getItem(BRANCHES_KEY); return r ? JSON.parse(r) : []; } catch (e) { return []; } })(); }
    function writeBranches(arr) { if (typeof window.writeBranches === 'function') { window.writeBranches(arr); return; } localStorage.setItem(BRANCHES_KEY, JSON.stringify(arr)); if (window.appData) { window.appData.branches = arr; if (window.saveDataToServer) window.saveDataToServer().catch(function(err) { console.error('Sunucuya kaydetme hatası (sessiz):', err); }); } }
    function readVehicles() { return (typeof window.getMedisaVehicles === 'function' ? window.getMedisaVehicles() : null) || (function() { try { var r = localStorage.getItem(VEHICLES_KEY); return r ? JSON.parse(r) : []; } catch (e) { return []; } })(); }
  
    // Modal Kontrolü (Ana Liste)
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
        if (deleteBtn) deleteBtn.style.display = 'flex';
      } else {
        // Yeni EKLEME MODU
        if (title) title.textContent = 'Yeni Şube Ekle';
        // Sil butonunu gizle
        if (deleteBtn) deleteBtn.style.display = 'none';
      }
  
      // Modalı aç
      modal.style.display = 'flex';
      requestAnimationFrame(() => modal.classList.add('active'));
  
      // Focus
      if (nameInput && shouldAutofocusSettingsForm()) {
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
  
    // CRUD İşlemleri
    /**
     * Şube kaydını formdan okuyup localStorage'a kaydeder (Create/Update)
     * 
     * Validasyon + Kaydetme akışı:
     * 1. Form alanlarını oku (id, name, city)
     * 2. Şube Adı validasyonu yap (zorunlu alan)
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
  
        writeBranches(branches);
  
        // Form modalını kapat
        closeBranchFormModal();
  
        // Ana modalı güncelle
        renderBranchList();
  
        alert(id ? 'Şube güncellendi.' : 'Şube Eklendi.');
      } catch (error) {
        alert('Şube kaydı sırasında bir hata Oluştu! Lütfen tekrar deneyin.');
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
      writeBranches(filtered);
      
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
  
      if (branches.length === 0) {
        container.innerHTML = `
          <div style="text-align:center; padding:20px; color:var(--muted);">
            henüz şube eklenmemiş.
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
      try {
        var raw = localStorage.getItem(USERS_KEY);
        var arr = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(arr)) return [];
        return (typeof window.normalizeUsers === 'function' ? window.normalizeUsers(arr) : arr);
      } catch (e) { return []; }
    }

    function readAllUsers() {
      if (window.appData && Array.isArray(window.appData.users)) {
        const allUsers = window.appData.users.slice();
        return (typeof window.normalizeUsers === 'function' ? window.normalizeUsers(allUsers) : allUsers);
      }
      try {
        var raw = localStorage.getItem(USERS_KEY);
        var arr = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(arr)) return [];
        return (typeof window.normalizeUsers === 'function' ? window.normalizeUsers(arr) : arr);
      } catch (e) { return []; }
    }

    function readAllVehicles() {
      if (window.appData && Array.isArray(window.appData.tasitlar)) {
        return window.appData.tasitlar.slice();
      }
      try {
        var raw = localStorage.getItem(VEHICLES_KEY);
        var arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr : [];
      } catch (e) { return []; }
    }

    function readAllBranches() {
      if (window.appData && Array.isArray(window.appData.branches)) {
        return window.appData.branches.slice();
      }
      try {
        var raw = localStorage.getItem(BRANCHES_KEY);
        var arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr : [];
      } catch (e) { return []; }
    }

    function writeVehicles(arr) { if (typeof window.writeVehicles === 'function') { window.writeVehicles(arr); return; } localStorage.setItem(VEHICLES_KEY, JSON.stringify(arr)); if (window.appData) { window.appData.tasitlar = arr; if (window.saveDataToServer) window.saveDataToServer().catch(function(err) { console.error('Sunucuya kaydetme hatası (sessiz):', err); }); } }
  
    /**
     * localStorage Kullanıcı listesini appData.users formatına dönüştürüp senkron eder.
     * Portal girişi (`driver_login.php`) ve raporlar tek kaynaktan (appData) okur.
     * zimmetli_araclar: portal kayıt akışı (`driver_save.php`) için atanmış Taşıt ID'leri (assignedUserId eşleşen Taşıtlar)
     */
    function mapUiRoleToRol(role) {
      return window.medisaMapUiRoleToRol(role);
    }

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

    function buildUserRoleLabelMarkup(user) {
      const roleLabel = getUserRoleLabel(user);
      return `<div class="settings-card-gorev">${escapeHtml(roleLabel)}</div>`;
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
      if (!effectiveScope.primaryBranchId) return false;
      return String(branchId || '') === String(effectiveScope.primaryBranchId);
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
      return {
        session: sessionData,
        role: role,
        branchIds: branchIds,
        primaryBranchId: branchIds[0] || '',
        isBranchManager: isBranchManager
      };
    }

    function isUserManageableInUserManagement(user, scope) {
      if (!user) return false;
      const effectiveScope = scope || getUserManagementSessionScope();
      if (!effectiveScope.isBranchManager) return true;
      if (getUiRoleFromUser(user) !== 'kullanici') return false;
      const branchIds = getUserBranchIdsForManagement(user);
      if (branchIds.length === 0) return false;
      return branchIds.every(function(branchId) { return isWithinUserManagementBranch(branchId, effectiveScope); });
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

    function populateUserRoleOptions(scope, selectedValue) {
      const roleSelect = document.getElementById('user-role');
      if (!roleSelect) return;
      const effectiveScope = scope || getUserManagementSessionScope();
      const options = effectiveScope.isBranchManager
        ? USER_FORM_ROLE_OPTIONS.filter(function(option) { return option.value === 'kullanici'; })
        : USER_FORM_ROLE_OPTIONS.slice();
      roleSelect.innerHTML = options.map(function(option) {
        return `<option value="${option.value}">${option.label}</option>`;
      }).join('');
      const safeValue = options.some(function(option) { return option.value === selectedValue; })
        ? selectedValue
        : options[0].value;
      roleSelect.value = safeValue;
      roleSelect.removeAttribute('disabled');
      roleSelect.removeAttribute('aria-disabled');
      syncUserFormCustomSelects(document.getElementById('user-form-modal'));
    }

    function syncUsersToAppData(arr, options) {
      if (!window.appData) return;
      const list = arr != null ? arr : readAllUsers();
      const vehicles = readAllVehicles();
      window.appData.users = list.map(u => {
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
          sifre: u.sifre || '',
          sifre_hash: u.sifre_hash || '',
          sifre_guncellendi_at: u.sifre_guncellendi_at || '',
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
          son_giris: u.son_giris || null
        };
      });
      if (!(options && options.skipServerSave === true) && window.saveDataToServer) {
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

    function cloneStorageState(arr) {
      try {
        return JSON.parse(JSON.stringify(Array.isArray(arr) ? arr : []));
      } catch (e) {
        return Array.isArray(arr) ? arr.slice() : [];
      }
    }

    function setUserManagementLocalState(users, vehicles) {
      localStorage.setItem(USERS_KEY, JSON.stringify(Array.isArray(users) ? users : []));
      localStorage.setItem(VEHICLES_KEY, JSON.stringify(Array.isArray(vehicles) ? vehicles : []));
      if (window.appData) {
        window.appData.tasitlar = Array.isArray(vehicles) ? vehicles : [];
        syncUsersToAppData(Array.isArray(users) ? users : [], { skipServerSave: true });
      }
    }

    async function persistUserManagementState(users, vehicles) {
      setUserManagementLocalState(users, vehicles);
      if (typeof window.saveDataToServer === 'function') {
        return await window.saveDataToServer();
      }
      return true;
    }
  
    // Modal Kontrolü (Ana Liste)
    window.openUserManagement = function openUserManagement() {
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
      });
    };
  
    window.closeUserManagement = function closeUserManagement() {
      const modal = document.getElementById('user-modal');
      if (!modal) return;
      userManagementSearchQuery = '';
      userManagementSearchOpen = false;
      syncUserManagementSearchUi();
      modal.classList.remove('active');
      setTimeout(() => modal.style.display = 'none', 300);
    };

    let userManagementSearchQuery = '';
    let userManagementSearchOpen = false;

    function normalizeUserManagementSearchText(value) {
      return String(value || '')
        .toLocaleLowerCase('tr-TR')
        .replace(/ı/g, 'i')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
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
        setTimeout(() => {
          input.focus();
          input.select();
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
  
    // Kullanıcı formu: atanmış Taşıtlar checkbox listesi doldur (arama + filtreleme)
    function populateUserVehiclesMulti(searchFilter = '') {
      const container = document.getElementById('user-vehicles-container');
      if (!container) return;
      const scope = getUserManagementSessionScope();
      // Mevcut seçimleri koru (filtre değişince kaybolmasın)
      const assignedIds = Array.from(container.querySelectorAll('input[name=user-vehicle]:checked')).map(cb => cb.value);
      const vehicles = readVehicles();
      let activeVehicles = vehicles.filter(v => v.satildiMi !== true);
      if (scope.isBranchManager) {
        activeVehicles = activeVehicles.filter(v => isWithinUserManagementBranch(v && v.branchId, scope));
      }
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
        const markaModel = (typeof window.formatBrandModel === 'function' ? window.formatBrandModel(raw) : (typeof window.toTitleCase === 'function' ? window.toTitleCase(raw) : raw));
        const labelEl = document.createElement('label');
        labelEl.className = 'user-vehicle-row';
        labelEl.style.userSelect = 'none';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = vid;
        cb.name = 'user-vehicle';
        cb.checked = assignedIds.indexOf(vid) !== -1;
        cb.addEventListener('change', updateUserVehiclesTriggerText);
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
      const container = document.getElementById('user-vehicles-container');
      if (!trigger || !container) return;
      const checked = container.querySelectorAll('input[name=user-vehicle]:checked');
      const n = checked.length;
      const textEl = trigger.querySelector('.user-vehicles-trigger-text');
      if (textEl) textEl.textContent = n === 0 ? 'Taşıt seçin' : (n === 1 ? '1 Taşıt Seçildi' : n + ' Taşıt Seçildi');
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
      if (opts.focusSearch && searchInput) searchInput.focus();
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
  
    // Modal Kontrolü (Form)
    function bindUserBranchSelectDropdown(modal) {
      setTimeout(() => {
        const updatedBranchSelect = $('#user-branch', modal);
        if (updatedBranchSelect && !updatedBranchSelect.dataset.dropdownHandler) {
          updatedBranchSelect.dataset.dropdownHandler = 'true';

          let isMouseClick = false;
          updatedBranchSelect.addEventListener('mousedown', function() {
            isMouseClick = true;
            setTimeout(() => { isMouseClick = false; }, 200);
          });

          updatedBranchSelect.addEventListener('focus', function() {
            if (isMouseClick) return;

            setTimeout(() => {
              const rect = this.getBoundingClientRect();
              const clickX = rect.right - 20;
              const clickY = rect.top + rect.height / 2;

              const mouseDownEvent = new MouseEvent('mousedown', {
                bubbles: true,
                cancelable: true,
                view: window,
                button: 0,
                clientX: clickX,
                clientY: clickY
              });
              this.dispatchEvent(mouseDownEvent);

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

          updatedBranchSelect.addEventListener('click', function() {
            if (document.activeElement !== this) {
              this.focus();
            }
          });
        }
      }, 100);
    }

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
      populateBranchDropdown();
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
      if (deleteBtn) deleteBtn.style.display = 'none';
      populateUserVehiclesMulti();
      const managedBranch = getManagedBranchForUserManagement(scope);
      if (scope.isBranchManager && branchSelect) {
        branchSelect.value = scope.primaryBranchId || '';
      }
      if (scope.isBranchManager && branchReadonly) {
        branchReadonly.value = managedBranch ? (managedBranch.name || '') : '';
      }
  
      if (editId) {
        // DÜZENLEME MODU
        const users = readAllUsers();
        const user = users.find(u => String(u.id) === String(editId));
        if (!user || !isUserManageableInUserManagement(user, scope)) {
          alert('Bu kullanıcıyı düzenleme yetkiniz yok.');
          return;
        }
        if (idInput) idInput.value = user.id;
        if (nameInput) nameInput.value = user.name || '';
        const currentBranchSelect = $('#user-branch', modal);
        if (currentBranchSelect) currentBranchSelect.value = getUserPrimaryBranchId(user);
        populateUserRoleOptions(scope, scope.isBranchManager ? 'kullanici' : getUiRoleFromUser(user));
        if (phoneInput) phoneInput.value = formatTrGsmDisplay(user.phone || '');
        if (emailInput) emailInput.value = user.email || '';
        if (roleSelect) roleSelect.value = scope.isBranchManager ? 'kullanici' : getUiRoleFromUser(user);
        if (usernameInput) usernameInput.value = user.kullanici_adi || '';
        if (passwordInput) passwordInput.value = user.sifre || '';
        if (branchReadonly) {
          const userBranch = readAllBranches().find(function(branch) {
            return String(branch && branch.id) === String(getUserPrimaryBranchId(user));
          });
          branchReadonly.value = userBranch ? (userBranch.name || '') : (managedBranch ? (managedBranch.name || '') : '');
        }
        const vehiclesContainer = document.getElementById('user-vehicles-container');
        if (vehiclesContainer) {
          const vehicles = readVehicles();
          const assignedIds = vehicles
            .filter(v => String(v.assignedUserId || '') === String(user.id))
            .map(v => String(v.id));
          vehiclesContainer.querySelectorAll('input[name=user-vehicle]').forEach(cb => {
            cb.checked = assignedIds.indexOf(cb.value) !== -1;
          });
          updateUserVehiclesTriggerText();
        }
        if (title) title.textContent = 'Kullanıcı Düzenle';
        // Sil butonunu göster
        if (deleteBtn) deleteBtn.style.display = 'flex';
      } else {
        // Yeni EKLEME MODU
        if (title) title.textContent = 'Yeni Kullanıcı Ekle';
        // Sil butonunu gizle
        if (deleteBtn) deleteBtn.style.display = 'none';
      }
  
      syncUserRoleBranchUI({ scope: scope });
      syncUserFormCustomSelects(modal);

      // Modalı aç
      modal.style.display = 'flex';
      requestAnimationFrame(() => modal.classList.add('active'));
  
      // Focus
      if (nameInput && shouldAutofocusSettingsForm()) {
        setTimeout(() => nameInput.focus(), 350);
      }
    };
  
    window.closeUserFormModal = function closeUserFormModal() {
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
      closeUserVehiclesDropdown();
      closeUserFormCustomSelect();
      const searchInput = document.getElementById('user-vehicles-search');
      if (searchInput) searchInput.value = '';
      const deleteBtn = $('#user-delete-btn', modal);
      if (deleteBtn) deleteBtn.style.display = 'none';
      modal.classList.remove('active');
      setTimeout(() => modal.style.display = 'none', 300);
    };
  
    // Şube Dropdown Doldur
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
      const managedBranch = getManagedBranchForUserManagement(scope);

      if (scope.isBranchManager) {
        if (singleWrap) singleWrap.classList.add('u-hidden');
        if (readonlyWrap) readonlyWrap.classList.add('u-hidden');
        if (roleWrap) roleWrap.classList.add('u-hidden');
        if (branchSelect) {
          branchSelect.required = false;
          branchSelect.value = scope.primaryBranchId || '';
        }
        if (branchReadonly) {
          branchReadonly.value = managedBranch ? (managedBranch.name || '') : '';
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
        const effectiveSelectedRole = scope.isBranchManager ? 'kullanici' : selectedRole;
        const requestedBranchId = branchSelect ? String(branchSelect.value || '').trim() : '';
        const branchId = scope.isBranchManager ? String(scope.primaryBranchId || '') : requestedBranchId;
        const branchIds = branchId ? [branchId] : [];
        const roleConfig = getRoleConfigFromSelection(effectiveSelectedRole);
        const role = roleConfig.role;
        const selectedVehicleIds = vehiclesContainer
          ? Array.from(vehiclesContainer.querySelectorAll('input[name=user-vehicle]:checked')).map(cb => cb.value)
          : [];
        const hasAssignedVehicles = selectedVehicleIds.length > 0;
        const kullanici_paneli = hasAssignedVehicles;
        if (scope.isBranchManager && requestedBranchId && requestedBranchId !== branchId) {
          alert('Yalnızca kendi şubenize kullanıcı kaydedebilirsiniz.');
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
  
        const previousUsers = cloneStorageState(readAllUsers());
        const previousVehicles = cloneStorageState(readAllVehicles());
        const users = cloneStorageState(previousUsers);
        const vehicles = cloneStorageState(previousVehicles);
        const existingUser = id ? users.find(function(user) { return String(user.id) === String(id); }) : null;

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
        const hasExistingPortalPassword = !!(existingUser && (
          (existingUser.sifre && String(existingUser.sifre).trim() !== '') ||
          (existingUser.sifre_hash && String(existingUser.sifre_hash).trim() !== '')
        ));
        if (needsPortalCredentials && (!kullanici_adi || (!sifre && !hasExistingPortalPassword))) {
          alert('Taşıt atanan kullanıcı veya yönetici için "Kullanıcı Adı (portal girişi)" ve "Şifre (portal girişi)" zorunludur. Bu bilgilerle kullanıcı paneline girilebilir.');
          if (usernameInput) usernameInput.focus();
          return;
        }
  
        let savedUserId = id;
        if (id) {
          // güncelleME
          const idx = users.findIndex(u => String(u.id) === String(id));
          if (idx !== -1) {
            users[idx].name = name;
            users[idx].branchId = branchId;
            users[idx].branchIds = branchIds;
            users[idx].phone = phone;
            users[idx].email = email;
            users[idx].role = role;
            users[idx].kullanici_paneli = kullanici_paneli;
            users[idx].surucu_paneli = kullanici_paneli;
            users[idx].kullanici_adi = kullanici_adi;
            // Şifre: boş bırakılırsa eskisini koru (yanlışlıkla silinmesin)
            if (sifre !== '') {
              users[idx].sifre = sifre;
              delete users[idx].sifre_hash;
              delete users[idx].sifre_guncellendi_at;
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
            sifre: sifre,
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
        const persisted = await persistUserManagementState(users, vehicles);
        if (persisted !== true) {
          setUserManagementLocalState(previousUsers, previousVehicles);
          renderUserList();
          alert('Kullanici sunucuya kaydedilemedi. Bu nedenle portal girisi acilmaz. Lutfen tekrar deneyin.');
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
        alert('Kullanıcı kaydı sırasında bir hata Oluştu! Lütfen tekrar deneyin.');
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
      const persisted = await persistUserManagementState(filtered, previousVehicles);
      if (persisted !== true) {
        setUserManagementLocalState(previousUsers, previousVehicles);
        renderUserList();
        alert('Kullanici silme islemi sunucuya kaydedilemedi. Lutfen tekrar deneyin.');
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

      const rows = filteredUsers.map(user => {
        const primaryBranchId = user.branchId || ((user.branchIds && user.branchIds.length) ? user.branchIds[0] : '');
        const branch = branches.find(x => String(x.id) === String(primaryBranchId));
        const branchName = branch ? branch.name : '-';
        const roleLabelMarkup = buildUserRoleLabelMarkup(user);

        if (scope.isBranchManager) {
          return `
          <div class="settings-card" onclick="editUser('${user.id}')" style="cursor:pointer;">
            <div class="settings-card-content">
              ${buildUserCardNameMarkup(user.name || 'İsimsiz')}
            </div>
          </div>
        `;
        }

        const phoneLine = formatTrGsmDisplay(user.phone || '');
        return `
          <div class="settings-card" onclick="editUser('${user.id}')" style="cursor:pointer;">
            <div class="settings-card-content">
              ${buildUserCardNameMarkup(user.name || 'İsimsiz')}
              <div class="settings-card-subtitle">${escapeHtml(branchName)}${phoneLine ? '<br>' + escapeHtml(phoneLine) : ''}</div>
              ${roleLabelMarkup}
            </div>
          </div>
        `;
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

      const isSettingsModalActive =
        (centeredInfoBox && centeredInfoBox.style.display === 'flex') ||
        (infoModal && infoModal.classList.contains('active')) ||
        (cacheConfirmModal && cacheConfirmModal.classList.contains('active')) ||
        (disVeriPanel && disVeriPanel.classList.contains('active')) ||
        (dataModal && dataModal.classList.contains('active')) ||
        (branchFormModal && branchFormModal.classList.contains('active')) ||
        (userFormModal && userFormModal.classList.contains('active')) ||
        (branchModal && branchModal.classList.contains('active')) ||
        (userModal && userModal.classList.contains('active'));

      if (isSettingsModalActive) {
        e.preventDefault();
        e.stopPropagation();
      }
    });
  
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
  
    // Modal Kontrolü
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
      const settingsMenu = document.getElementById('settings-menu');
      if (settingsMenu) settingsMenu.classList.remove('open');
      const dataSubmenu = document.getElementById('data-submenu');
      if (dataSubmenu) dataSubmenu.classList.remove('open');
      const panel = document.getElementById('dis-veri-panel');
      if (!panel) return;
      if (panel.classList.contains('active') || panel.style.display === 'flex') return;
      panel.style.display = 'flex';
      requestAnimationFrame(() => panel.classList.add('active'));
    };
    window.closeDisVeriPanel = function closeDisVeriPanel() {
      const panel = document.getElementById('dis-veri-panel');
      if (!panel) return;
      panel.classList.remove('active');
      setTimeout(() => { panel.style.display = 'none'; }, 300);
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

      var script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      script.onload = function() {
        if (typeof window.closeCenteredInfoBox === 'function') window.closeCenteredInfoBox();
        var input = document.getElementById('kasko-excel-input');
        if (input) input.click();
      };
      script.onerror = function() {
        if (typeof window.closeCenteredInfoBox === 'function') window.closeCenteredInfoBox();
        alert('Excel kütüphanesi yüklenemedi. Lütfen internet bağlantınızı kontrol edin.');
      };
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
          } else if (typeof window.showErrorModal === 'function') {
            window.showErrorModal(msg);
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

            var jsonStr = JSON.stringify(jsonData);
            try {
              localStorage.setItem('medisa_kasko_liste', jsonStr);
            } catch (storageErr) {
              if (storageErr.name === 'QuotaExceededError' || storageErr.code === 22) {
                showKaskoError('Kasko Listesi Mobil Cihazda Depolama Sınırını Aşıyor. Lütfen Masaüstü Bilgisayardan Excel Yükleyin.');
                input.value = '';
                return;
              }
              throw storageErr;
            }
            localStorage.setItem('medisa_kasko_liste_date', new Date().toISOString());

            if (typeof window.clearKaskoCache === 'function') window.clearKaskoCache();

            if (typeof window.guncelleTumKaskoDegerleri === 'function') {
              window.guncelleTumKaskoDegerleri();
            }
            if (typeof window.updateNotifications === 'function') {
              window.updateNotifications();
            }

            if (typeof window.showCenteredInfoBox === 'function') {
              window.showCenteredInfoBox('Kasko listesi başarıyla güncellendi!', {
                anchorEl: document.getElementById('kasko-yukle-btn'),
                offsetAbove: 18,
                variant: 'bare-text',
                autoCloseMs: 3000
              });
            } else if (typeof window.showSuccessModal === 'function') {
              window.showSuccessModal('Kasko listesi başarıyla güncellendi!');
            } else if (typeof window.showInfoModal === 'function') {
              window.showInfoModal('Kasko listesi başarıyla güncellendi!');
            } else {
              alert('Kasko listesi başarıyla güncellendi!');
            }
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

    // Veri dışa aktar (JSON indir)
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
  
        alert('Yedek başarıyla indirildi!');
      } catch (error) {
        alert('Yedekleme sırasında hata Oluştu!');
      }
    };
  
    // Son yedekten geri yükle: önce sunucu (restore.php), yoksa yerel medisa_server_backup.
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
        const requestOptions = { cache: "no-store" };
        if (typeof buildAuthHeaders === "function") {
          requestOptions.headers = buildAuthHeaders();
        }
        const res = await fetch("restore.php?source=backup", requestOptions);
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
        ayarlar: backup.ayarlar || existingApp.ayarlar || { sirketAdi: 'Medisa', yetkiliKisi: '', telefon: '', eposta: '' },
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
          alert("Son yedek bulunamadı.");
          return;
        }

        const dateStr = backup.upload_date ? new Date(backup.upload_date).toLocaleString("tr-TR") : "Bilinmiyor";
        const sourceLabel = backup.source === "server" ? "Sunucu yedeği" : "Yerel yedek";
        const message = `Kaynak: ${sourceLabel}\nYedek Tarihi: ${dateStr}\n\n` +
          `Şubeler: ${backup.branches.length}\n` +
          `Kullanıcılar: ${backup.users.length}\n` +
          `Taşıtlar: ${backup.vehicles.length}\n\n` +
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

        alert("Yedek başarıyla geri yüklendi!\n\nSayfa yenilenecek.");
        setTimeout(function() { window.location.reload(); }, 500);
      } catch (err) {
        if (typeof window.__medisaLogError === "function") window.__medisaLogError("Yedek geri yükle (restoreFromLastBackup)", err);
        else console.error("Yedek geri yükle hatası:", err);
        alert("Yedek okunamadı. Lütfen geçerli bir yedek dosyası ile tekrar deneyin.");
      }
    };

    // Dosyadan içe aktar (JSON seç)
    window.importData = function importData() {
      try {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.setAttribute('aria-label', 'Yedek JSON dosyası seç');
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
                            `ŞUBEler: ${backup.branches.length}\n` +
                            `Kullanıcılar: ${backup.users.length}\n` +
                            `Taşıtlar: ${backup.vehicles.length}\n\n` +
                            `Mevcut veriler silinecek! Emin misiniz?`;
  
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
  
              if (typeof window.saveDataToServer === 'function') {
                window.showCenteredInfoBox('Yedek sunucuya yükleniyor, lütfen bekleyin...'); // Kullanıcıyı tut
                window.saveDataToServer().then(function() {
                  window.closeCenteredInfoBox();
                  alert('Yedek başarıyla Geri Yüklendi ve Sunucuya Kaydedildi!\n\nSayfa Yenilenecek.');
                  setTimeout(function() { window.location.reload(); }, 500);
                }).catch(function(err) {
                  window.closeCenteredInfoBox();
                  console.error("Yedek sunucuya yazılamadı:", err);
                  alert('Uyarı: Yedek cihazınıza yüklendi ancak sunucuya gönderilirken bir hata oluştu. İnternet bağlantınızı kontrol edin.\n\nSayfa Yenilenecek.');
                  setTimeout(function() { window.location.reload(); }, 500);
                });
              } else {
                alert('Yedek başarıyla Geri Yüklendi!\n\nSayfa Yenilenecek.');
                setTimeout(function() { window.location.reload(); }, 500);
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
  
    // Önbellek temizliğinden önce çağrılır: sunucu ve/veya yerel yedek.
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
          ayarlar: existingApp.ayarlar || { sirketAdi: 'Medisa', yetkiliKisi: '', telefon: '', eposta: '' },
          sifreler: Array.isArray(existingApp.sifreler) ? existingApp.sifreler : [],
          arac_aylik_hareketler: Array.isArray(existingApp.arac_aylik_hareketler) ? existingApp.arac_aylik_hareketler : [],
          duzeltme_talepleri: Array.isArray(existingApp.duzeltme_talepleri) ? existingApp.duzeltme_talepleri : [],
          upload_date: new Date().toISOString(),
          version: "1.1"
        };

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
  
    window.openCacheConfirmModal = function openCacheConfirmModal(message, options = {}) {
      const modal = document.getElementById('cache-confirm-modal');
      const messageEl = document.getElementById('cache-confirm-message');
      if (!modal || !messageEl) return;

      // mesajı güvenli şekilde formatla (önce escape, sonra satır sonlarını <br> ile değiştir)
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
          window.showInfoModal('Yedekleme başarısız! Tarayıcı Belleği Temizlenmedi.');
          return;
        }

        if (!result.success && !allowCacheClearWithLocalBackupOnly) {
          // Sunucu yedeği başarısız: Kullanıcıya yerel yedekle devam etme seçeneği ver
          const retryMessage = 'Veriler Sunucuya Yüklenemedi!\nYerel Yedek Oluşturuldu.\n\nYine De Temizlemek İstiyor Musunuz?';
          if (typeof window.closeInfoModal === 'function') {
            window.closeInfoModal();
          }
          window.openCacheConfirmModal(retryMessage, { allowLocalBackupOnly: true });
          return;
        }
  
        // Uygulama anahtarları silinir; medisa_server_backup kalır
        [BRANCHES_KEY, USERS_KEY, VEHICLES_KEY].forEach(k => localStorage.removeItem(k));
        // Diğer uygulama state anahtarlarını da temizle
        ['vehicle_column_order', 'stok_active_columns', 'stok_column_order', 'stok_base_column_order'].forEach(k => localStorage.removeItem(k));
        
        const backupResultMessage = result.serverBackup
          ? 'Veriler Sunucuya Yedeklendi Ve Tarayıcı Belleği Temizlendi!\n\nYedek korundu. Geri yüklemek için Ayarlar > Veri Yedekleme > Son Yedekten Geri Yükle kullanın.\n\nSayfa Yenilenecek.'
          : 'Sunucuya Yedekleme Yapılamadı Ancak Yerel Yedek Korunarak Tarayıcı Belleği Temizlendi!\n\nGeri yüklemek için Ayarlar > Veri Yedekleme > Son Yedekten Geri Yükle kullanın.\n\nSayfa Yenilenecek.';
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
