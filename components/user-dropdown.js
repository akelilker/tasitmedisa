/* =========================================
   MEDISA USER DROPDOWN BİLEŞENİ
   =========================================
   Ceza ve ilgili modal için kullanıcı seçimi dropdown
   ========================================= */

(function() {
  function readBranches() { return (typeof window.getMedisaBranches === 'function' ? window.getMedisaBranches() : null) || []; }
  function readVehicles() { return (typeof window.getMedisaVehicles === 'function' ? window.getMedisaVehicles() : null) || []; }
  function readUsers() { return (typeof window.getMedisaUsers === 'function' ? window.getMedisaUsers() : null) || []; }

  function getUserBranchIdsForVehicleAssignment(user) {
    if (!user || typeof user !== 'object') return [];

    let branchIds = [];
    if (Array.isArray(user.branchIds)) {
      branchIds = user.branchIds;
    } else if (Array.isArray(user.sube_ids)) {
      branchIds = user.sube_ids;
    } else if (user.branchId !== undefined && user.branchId !== null && user.branchId !== '') {
      branchIds = [user.branchId];
    } else if (user.sube_id !== undefined && user.sube_id !== null && user.sube_id !== '') {
      branchIds = [user.sube_id];
    }

    const normalized = [];
    branchIds.forEach(function(branchId) {
      const value = String(branchId || '').trim();
      if (value && normalized.indexOf(value) === -1) normalized.push(value);
    });
    return normalized;
  }

  function getAssignableUsersForVehicle(vehicle) {
    const users = readUsers();
    const vehicleBranchId = vehicle && vehicle.branchId !== undefined && vehicle.branchId !== null
      ? String(vehicle.branchId).trim()
      : '';

    if (!vehicleBranchId) return users;

    return users.filter(function(user) {
      return getUserBranchIdsForVehicleAssignment(user).indexOf(vehicleBranchId) !== -1;
    });
  }

  function normalizeUserDisplayName(rawName) {
    const plain = String(rawName || '').trim();
    if (!plain) return '';
    return (typeof window.formatAdSoyad === 'function')
      ? formatAdSoyad(plain)
      : plain;
  }

  function getAssignableUserDisplayNamesForVehicle(vehicle) {
    const users = getAssignableUsersForVehicle(vehicle);
    const names = [];
    const seen = Object.create(null);
    users.forEach(function(user) {
      const raw = user && (user.name || user.isim || user.fullName || '');
      const displayName = normalizeUserDisplayName(raw);
      if (!displayName) return;
      const key = displayName.toLocaleLowerCase('tr-TR');
      if (seen[key]) return;
      seen[key] = true;
      names.push(displayName);
    });
    names.sort(function(a, b) { return a.localeCompare(b, 'tr', { sensitivity: 'base' }); });
    return names;
  }

  function bindCezaUserDropdown(modal, vehicle) {
    if (!modal) return;
    const hiddenInput = modal.querySelector('#ceza-surucu');
    const wrap = modal.querySelector('#ceza-user-wrap');
    const trigger = modal.querySelector('#ceza-user-trigger');
    const triggerText = modal.querySelector('#ceza-user-trigger-text');
    const dropdown = modal.querySelector('#ceza-user-dropdown');
    const searchInput = modal.querySelector('#ceza-user-search');
    const listEl = modal.querySelector('#ceza-user-list');
    if (!hiddenInput || !wrap || !trigger || !triggerText || !dropdown || !searchInput || !listEl) return;

    if (modal._cezaUserOutsideHandler) {
      document.removeEventListener('click', modal._cezaUserOutsideHandler, true);
      modal._cezaUserOutsideHandler = null;
    }

    const escapeHtmlLocal = function(text) {
      return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    };
    const normalizeForSearch = function(value) {
      return String(value || '')
        .toLocaleLowerCase('tr-TR')
        .replace(/ı/g, 'i')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
    };

    let userNames = getAssignableUserDisplayNamesForVehicle(vehicle);
    const defaultUserName = normalizeUserDisplayName(vehicle && vehicle.tahsisKisi ? vehicle.tahsisKisi : '');
    if (defaultUserName && userNames.indexOf(defaultUserName) === -1) {
      userNames = [defaultUserName].concat(userNames);
    }

    let selectedUserName = '';
    let lastTouchToggleAt = 0;
    let lastTouchOptionAt = 0;
    const isTouchDevice = window.matchMedia && window.matchMedia('(hover: none)').matches;

    const closeDropdown = function() {
      dropdown.classList.remove('open');
      dropdown.setAttribute('aria-hidden', 'true');
      trigger.classList.remove('is-open');
      trigger.setAttribute('aria-expanded', 'false');
    };

    const openDropdown = function() {
      dropdown.classList.add('open');
      dropdown.setAttribute('aria-hidden', 'false');
      trigger.classList.add('is-open');
      trigger.setAttribute('aria-expanded', 'true');
      if (!isTouchDevice) {
        searchInput.focus();
        searchInput.select();
      }
    };

    const updateTrigger = function() {
      triggerText.textContent = selectedUserName || 'Kullanıcı seçiniz';
      trigger.classList.toggle('placeholder', !selectedUserName);
      hiddenInput.value = selectedUserName;
    };

    const renderUserList = function() {
      const query = normalizeForSearch(searchInput.value || '');
      const filtered = userNames.filter(function(name) {
        return normalizeForSearch(name).indexOf(query) !== -1;
      });

      if (!filtered.length) {
        listEl.innerHTML = '<div class="ceza-user-empty">Kullanıcı bulunamadı</div>';
        return;
      }

      listEl.innerHTML = filtered.map(function(name) {
        const isSelected = selectedUserName === name;
        return '<button type="button" class="ceza-user-option' + (isSelected ? ' selected' : '') + '" data-user-name="' + escapeHtmlLocal(name) + '" role="option" aria-selected="' + (isSelected ? 'true' : 'false') + '">' + escapeHtmlLocal(name) + '</button>';
      }).join('');
    };

    const setSelectedUser = function(name) {
      selectedUserName = String(name || '').trim();
      updateTrigger();
      renderUserList();
    };

    const handleTriggerActivate = function(e) {
      if (e.type === 'touchend') {
        lastTouchToggleAt = Date.now();
        if (e.cancelable) e.preventDefault();
      } else if (e.type === 'click' && Date.now() - lastTouchToggleAt < 500) {
        return;
      }
      e.stopPropagation();
      if (dropdown.classList.contains('open')) closeDropdown();
      else openDropdown();
    };

    trigger.addEventListener('click', handleTriggerActivate);
    trigger.addEventListener('touchend', handleTriggerActivate, { passive: false });

    trigger.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (dropdown.classList.contains('open')) closeDropdown();
        else openDropdown();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!dropdown.classList.contains('open')) openDropdown();
      } else if (e.key === 'Escape') {
        closeDropdown();
      }
    });

    searchInput.addEventListener('input', renderUserList);
    searchInput.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeDropdown();
        trigger.focus();
      }
    });

    const handleOptionSelect = function(e) {
      if (e.type === 'touchend') {
        lastTouchOptionAt = Date.now();
        if (e.cancelable) e.preventDefault();
      } else if (e.type === 'click' && Date.now() - lastTouchOptionAt < 500) {
        return;
      }
      const option = e.target.closest('.ceza-user-option');
      if (!option) return;
      const userName = option.getAttribute('data-user-name') || '';
      setSelectedUser(userName);
      closeDropdown();
      trigger.focus();
    };

    listEl.addEventListener('click', handleOptionSelect);
    listEl.addEventListener('touchend', handleOptionSelect, { passive: false });

    modal._cezaUserOutsideHandler = function(e) {
      if (!wrap.contains(e.target)) closeDropdown();
    };
    document.addEventListener('click', modal._cezaUserOutsideHandler, true);

    renderUserList();
    setSelectedUser(defaultUserName);
  }

  // Global exports
  window.bindCezaUserDropdown = bindCezaUserDropdown;
  window.getAssignableUserDisplayNamesForVehicle = getAssignableUserDisplayNamesForVehicle;
  window.getAssignableUsersForVehicle = getAssignableUsersForVehicle;
  window.getUserBranchIdsForVehicleAssignment = getUserBranchIdsForVehicleAssignment;
  window.normalizeUserDisplayName = normalizeUserDisplayName;
})();
