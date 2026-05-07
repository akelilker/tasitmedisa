/* =========================================
   TAŞITLAR MODÜLÜ - SABİT HEADER / DİNAMİK TOOLBAR
   =========================================
   Ana bloklar (tek dosya; loadAppModule tek giriş):
   • Lazy script — veri okuma (şube/taşıt/kullanıcı) — DOM/bind
   • Liste / ara / şube kartları — detay modal doldurma
   • Bildirim state — araç tarihçesi
   • Olay menüsü + dinamik formlar (kaydet / güncelle)
   ========================================= */

(function() {
  const BRANCHES_KEY = "medisa_branches_v1";
  const VEHICLES_KEY = "medisa_vehicles_v1";
  const USERS_KEY = "medisa_users_v1";

  // --- DİNAMİK DOSYA YÜKLEYİCİ: ortak kural script-core (__medisaLoadScriptOnce) ---
  function loadScript(src) {
    if (typeof window.__medisaLoadScriptOnce === 'function') {
      return window.__medisaLoadScriptOnce(src);
    }
    return new Promise(function(resolve, reject) {
      var script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

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

  /** Taşıt detayından "+ Yeni Kullanıcı" ile eklenen bekleyen userSaved dinleyicisini kaldırır (iptal / ayarlar akışı). */
  function dismissVehicleAssignUserSavedListener() {
    const fn = window._medisaVehicleAssignOnUserSaved;
    if (typeof fn === 'function') {
      window.removeEventListener('userSaved', fn);
      window._medisaVehicleAssignOnUserSaved = null;
    }
  }
  window.medisaDismissVehicleAssignUserSavedListener = dismissVehicleAssignUserSavedListener;

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
      triggerText.textContent = selectedUserName || 'Kullanıcı Seçiniz';
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

  let activeDynamicModalCustomSelect = null;

  function normalizeDynamicModalSelectSearch(value) {
    return String(value || '')
      .toLocaleLowerCase('tr-TR')
      .replace(/ı/g, 'i')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  function isDynamicModalSelectTouchDevice() {
    return window.matchMedia && window.matchMedia('(hover: none)').matches;
  }

  function isDynamicModalSelectPrintableKey(e) {
    return e.key && e.key.length === 1 && !e.altKey && !e.ctrlKey && !e.metaKey;
  }

  function filterDynamicModalCustomSelect(shell) {
    if (!shell || shell.dataset.searchable !== '1') return;
    const menu = shell.querySelector('.medisa-owner-select-menu');
    const searchInput = shell.querySelector('.medisa-owner-select-search-input');
    const optionsHost = shell.querySelector('.medisa-owner-select-options') || menu;
    if (!menu || !searchInput || !optionsHost) return;

    const query = normalizeDynamicModalSelectSearch(searchInput.value || '');
    const secondaryValues = (shell.dataset.secondaryValues || '').split('|').filter(Boolean);
    const mutedValues = (shell.dataset.mutedValues || '').split('|').filter(Boolean);
    const optionItems = Array.from(optionsHost.querySelectorAll('.medisa-owner-select-option'));
    let visibleRegularCount = 0;
    let regularCount = 0;

    optionItems.forEach(function(item) {
      const value = String(item.dataset.value || '');
      const text = String(item.textContent || '');
      const isPlaceholder = !value || item.classList.contains('is-placeholder');
      const isPinned = secondaryValues.indexOf(value) !== -1 || mutedValues.indexOf(value) !== -1;
      const isRegular = !isPlaceholder && !isPinned && !item.classList.contains('is-secondary-action');
      let shouldShow = true;

      if (isRegular) {
        regularCount += 1;
        shouldShow = !query || normalizeDynamicModalSelectSearch(text).indexOf(query) !== -1;
        if (shouldShow) visibleRegularCount += 1;
      } else if (isPlaceholder) {
        shouldShow = !query;
      }

      item.hidden = !shouldShow;
      item.classList.toggle('is-filter-hidden', !shouldShow);
    });

    let emptyItem = optionsHost.querySelector('.medisa-owner-select-empty');
    const shouldShowEmpty = !!query && regularCount > 0 && visibleRegularCount === 0;
    if (shouldShowEmpty) {
      if (!emptyItem) {
        emptyItem = document.createElement('div');
        emptyItem.className = 'medisa-owner-select-empty';
        emptyItem.setAttribute('aria-live', 'polite');
        const firstSecondary = optionsHost.querySelector('.medisa-owner-select-option.is-secondary-action');
        optionsHost.insertBefore(emptyItem, firstSecondary || null);
      }
      emptyItem.textContent = shell.dataset.noResultsText || 'Sonuç bulunamadı';
    } else if (emptyItem) {
      emptyItem.remove();
    }
  }

  function focusDynamicModalCustomSelectSearch(shell, initialValue) {
    if (!shell || shell.dataset.searchable !== '1') return false;
    const searchInput = shell.querySelector('.medisa-owner-select-search-input');
    if (!searchInput) return false;
    if (typeof initialValue === 'string') {
      searchInput.value = initialValue;
      filterDynamicModalCustomSelect(shell);
      positionDynamicModalCustomSelectMenu(shell);
    }
    requestAnimationFrame(function() {
      searchInput.focus();
      if (typeof initialValue === 'string') {
        const cursorPosition = searchInput.value.length;
        searchInput.setSelectionRange(cursorPosition, cursorPosition);
      } else {
        searchInput.select();
      }
    });
    return true;
  }

  function closeDynamicModalCustomSelect(options) {
    const opts = options || {};
    const shell = activeDynamicModalCustomSelect;
    if (!shell) return;
    const trigger = shell.querySelector('.medisa-owner-select-trigger');
    const menu = shell.querySelector('.medisa-owner-select-menu');
    const searchInput = shell.querySelector('.medisa-owner-select-search-input');
    shell.classList.remove('is-open');
    if (trigger) {
      trigger.classList.remove('is-open');
      trigger.setAttribute('aria-expanded', 'false');
      if (opts.focusTrigger) trigger.focus();
    }
    if (searchInput) searchInput.value = '';
    if (menu) {
      menu.classList.remove('open');
      menu.setAttribute('aria-hidden', 'true');
      menu.style.position = '';
      menu.style.top = '';
      menu.style.bottom = '';
      menu.style.left = '';
      menu.style.right = '';
      menu.style.width = '';
      menu.style.maxHeight = '';
    }
    refreshDynamicModalCustomSelect(shell);
    activeDynamicModalCustomSelect = null;
  }

  function positionDynamicModalCustomSelectMenu(shell) {
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
    const triggerHeight = trigger.offsetHeight || rect.height || 44;

    menu.style.position = 'absolute';
    menu.style.left = '0';
    menu.style.right = '0';
    menu.style.width = '100%';
    menu.style.maxHeight = maxHeight + 'px';
    if (useAbove) {
      menu.style.top = 'auto';
      menu.style.bottom = (triggerHeight + 6) + 'px';
    } else {
      menu.style.top = (triggerHeight + 6) + 'px';
      menu.style.bottom = 'auto';
    }
  }

  function refreshDynamicModalCustomSelect(shell) {
    if (!shell) return;
    const select = shell.querySelector('select');
    const trigger = shell.querySelector('.medisa-owner-select-trigger');
    const triggerText = shell.querySelector('.medisa-owner-select-trigger-text');
    const menu = shell.querySelector('.medisa-owner-select-menu');
    if (!select || !trigger || !triggerText || !menu) return;

    const options = Array.from(select.options || []);
    const selectedValue = String(select.value || '');
    let selectedOption = options.find(function(option) {
      return String(option.value || '') === selectedValue;
    }) || options[select.selectedIndex] || options[0] || null;

    if (!selectedOption && options.length) {
      selectedOption = options[0];
      select.value = selectedOption.value;
    }

    const placeholderText = shell.dataset.placeholderText || (options[0] ? options[0].textContent : 'Seçiniz');
    const selectedText = selectedOption ? String(selectedOption.textContent || '').trim() : '';
    const selectedOptionValue = selectedOption ? String(selectedOption.value || '') : '';
    const secondaryValues = (shell.dataset.secondaryValues || '').split('|').filter(Boolean);
    const mutedValues = (shell.dataset.mutedValues || '').split('|').filter(Boolean);
    const isSearchable = shell.dataset.searchable === '1';
    const existingSearchInput = shell.querySelector('.medisa-owner-select-search-input');
    const searchValue = existingSearchInput ? existingSearchInput.value : '';

    triggerText.textContent = selectedText || placeholderText;
    trigger.classList.toggle('placeholder', !selectedOptionValue);
    trigger.disabled = !!select.disabled;
    trigger.setAttribute('aria-disabled', select.disabled ? 'true' : 'false');

    menu.innerHTML = '';
    let optionsHost = menu;
    if (isSearchable) {
      const searchWrap = document.createElement('div');
      searchWrap.className = 'medisa-owner-select-search-wrap';

      const searchInput = document.createElement('input');
      searchInput.type = 'text';
      searchInput.className = 'form-input medisa-owner-select-search-input';
      searchInput.placeholder = shell.dataset.searchPlaceholder || 'Ara';
      searchInput.value = searchValue;
      searchInput.setAttribute('autocomplete', 'off');
      searchInput.setAttribute('aria-label', shell.dataset.searchPlaceholder || 'Ara');

      const list = document.createElement('div');
      list.className = 'medisa-owner-select-options';

      searchWrap.appendChild(searchInput);
      menu.appendChild(searchWrap);
      menu.appendChild(list);
      optionsHost = list;

      searchInput.addEventListener('click', function(e) {
        e.stopPropagation();
      });
      searchInput.addEventListener('input', function() {
        filterDynamicModalCustomSelect(shell);
        positionDynamicModalCustomSelectMenu(shell);
      });
      searchInput.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
          e.preventDefault();
          if (searchInput.value) {
            searchInput.value = '';
            filterDynamicModalCustomSelect(shell);
            positionDynamicModalCustomSelectMenu(shell);
          } else {
            closeDynamicModalCustomSelect({ focusTrigger: true });
          }
        }
      });
    }

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
      if (secondaryValues.indexOf(value) !== -1 || /^\+/.test(text)) item.classList.add('is-secondary-action');
      if (mutedValues.indexOf(value) !== -1) item.classList.add('is-muted-choice');
      if (option.disabled) {
        item.classList.add('is-disabled');
        item.disabled = true;
      }

      optionsHost.appendChild(item);
    });

    filterDynamicModalCustomSelect(shell);

    if (activeDynamicModalCustomSelect === shell && menu.classList.contains('open')) {
      positionDynamicModalCustomSelectMenu(shell);
    }
  }

  function openDynamicModalCustomSelect(shell) {
    if (!shell) return;
    if (activeDynamicModalCustomSelect && activeDynamicModalCustomSelect !== shell) {
      closeDynamicModalCustomSelect();
    }
    const trigger = shell.querySelector('.medisa-owner-select-trigger');
    const menu = shell.querySelector('.medisa-owner-select-menu');
    if (!trigger || !menu || trigger.disabled) return;

    activeDynamicModalCustomSelect = shell;
    shell.classList.add('is-open');
    trigger.classList.add('is-open');
    trigger.setAttribute('aria-expanded', 'true');
    menu.classList.add('open');
    menu.setAttribute('aria-hidden', 'false');
    positionDynamicModalCustomSelectMenu(shell);
    if (shell.dataset.searchable === '1' && !isDynamicModalSelectTouchDevice()) {
      focusDynamicModalCustomSelectSearch(shell);
    }
  }

  function ensureDynamicModalCustomSelect(select, options) {
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
        if (activeDynamicModalCustomSelect === shell) closeDynamicModalCustomSelect();
        else openDynamicModalCustomSelect(shell);
      });

      trigger.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (activeDynamicModalCustomSelect === shell) closeDynamicModalCustomSelect();
          else openDynamicModalCustomSelect(shell);
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          openDynamicModalCustomSelect(shell);
        } else if (e.key === 'Escape' && activeDynamicModalCustomSelect === shell) {
          e.preventDefault();
          closeDynamicModalCustomSelect({ focusTrigger: true });
        } else if (shell.dataset.searchable === '1' && isDynamicModalSelectPrintableKey(e)) {
          e.preventDefault();
          openDynamicModalCustomSelect(shell);
          focusDynamicModalCustomSelectSearch(shell, e.key);
        }
      });

      menu.addEventListener('click', function(e) {
        const item = e.target.closest('.medisa-owner-select-option');
        if (!item || item.disabled) return;
        select.value = item.dataset.value || '';
        select.dispatchEvent(new Event('change', { bubbles: true }));
        refreshDynamicModalCustomSelect(shell);
        closeDynamicModalCustomSelect({ focusTrigger: true });
      });

      select.addEventListener('change', function() {
        refreshDynamicModalCustomSelect(shell);
      });
    }

    shell.dataset.placeholderText = options && options.placeholderText ? options.placeholderText : '';
    shell.dataset.secondaryValues = options && Array.isArray(options.secondaryValues) ? options.secondaryValues.join('|') : '';
    shell.dataset.mutedValues = options && Array.isArray(options.mutedValues) ? options.mutedValues.join('|') : '';
    shell.dataset.searchable = options && options.searchable ? '1' : '';
    shell.dataset.searchPlaceholder = options && options.searchPlaceholder ? options.searchPlaceholder : '';
    shell.dataset.noResultsText = options && options.noResultsText ? options.noResultsText : '';
    refreshDynamicModalCustomSelect(shell);
    return shell;
  }

  document.addEventListener('click', function(e) {
    if (!activeDynamicModalCustomSelect) return;
    if (!activeDynamicModalCustomSelect.contains(e.target)) closeDynamicModalCustomSelect();
  }, true);

  window.addEventListener('resize', function() {
    if (activeDynamicModalCustomSelect) closeDynamicModalCustomSelect();
  });


  /** Ana uygulamada olay satırında görünen sürücü adı: genel yönetici kendi adıyla; aksi halde atanmış kullanıcı / tahsis. */
  function isMainAppSessionGenelYonetici() {
    try {
      var sess = typeof window.medisaSession === 'object' && window.medisaSession ? window.medisaSession : null;
      var sr = sess && (sess.role || (sess.user && sess.user.role));
      return !!(sess && sess.authenticated && String(sr || '').trim() === 'genel_yonetici');
    } catch (e) {
      return false;
    }
  }

  function getEventSurucuFromVehicleAssignment(vehicle) {
    const safeVehicle = vehicle || {};
    const users = readUsers();
    const assignedId = safeVehicle.assignedUserId || '';
    const user = assignedId ? users.find(function(u) { return String(u.id) === String(assignedId); }) : null;
    if (user && (user.name || user.isim)) return formatAdSoyad(String(user.name || user.isim));

    const tahsisliKisi = String(safeVehicle.tahsisKisi || '').trim();
    if (tahsisliKisi) return formatAdSoyad(tahsisliKisi);

    return getRecorderDisplayName();
  }

  function resolveMainAppEventSurucuName(vehicle) {
    if (isMainAppSessionGenelYonetici()) return getRecorderDisplayName();
    return getEventSurucuFromVehicleAssignment(vehicle);
  }

  function getEventPerformerName(vehicle) {
    return resolveMainAppEventSurucuName(vehicle);
  }

  /** Ana panelde kayıt yapan görünen ad (ceza/satış tarihçesi); önce oturumdaki kullanıcı, sonra ayar, son çare Yönetim */
  function getRecorderDisplayName() {
    try {
      var sess = typeof window.medisaSession === 'object' && window.medisaSession ? window.medisaSession : null;
      if (sess && sess.authenticated) {
        var u = sess.user || {};
        var sessionName = String(u.name || u.isim || '').trim();
        if (!sessionName && u.id) {
          var users = readUsers();
          var found = Array.isArray(users) ? users.find(function(x) { return String(x && x.id) === String(u.id); }) : null;
          if (found) sessionName = String(found.name || found.isim || '').trim();
        }
        if (sessionName) return formatAdSoyad(sessionName);
      }
    } catch (e0) { /* ignore */ }
    try {
      var ad = window.appData && (window.appData.recorderDisplayName || window.appData.fleetOperatorName || window.appData.operatorName);
      if (ad && String(ad).trim()) return toTitleCase(String(ad).trim());
    } catch (e) { /* ignore */ }
    try {
      var ls = typeof localStorage !== 'undefined' ? localStorage.getItem('medisa_recorder_display_name') : '';
      if (ls && String(ls).trim()) return toTitleCase(String(ls).trim());
    } catch (e2) { /* ignore */ }
    return 'Y\u00F6netim';
  }

  function formatHistoryPerformerUpper(raw) {
    var s = (raw || '').trim();
    if (!s) return 'B\u0130L\u0130NM\u0130YOR';
    var out = formatAdSoyad(s);
    return out != null && String(out).trim() !== '' ? String(out).trim() : 'B\u0130L\u0130NM\u0130YOR';
  }

  function historyDetailPartsHtml(parts) {
    if (!parts || !parts.length) return '';
    return parts.map(function(p) {
      var lbl = String(p.label || '').replace(/:\s*$/, '');
      return '<span class="history-label">' + escapeHtml(lbl) + ':</span> ' + escapeHtml(p.value);
    }).join(' <span class="history-detail-sep">|</span> ');
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
    function notifyIfAvailable() {
      if (typeof window.updateNotifications === 'function') {
        window.updateNotifications();
      }
    }
    if (window.dataApi && typeof window.dataApi.saveVehiclesList === 'function') {
      return window.dataApi.saveVehiclesList(arr)
        .then(function(result) {
          invalidateVehicleDateTasksCache();
          notifyIfAvailable();
          return result;
        })
        .catch(function(err) {
          if (err && err.conflict) {
            if (typeof window.onMedisaConflict === 'function') {
              window.onMedisaConflict();
            } else {
              alert('Dikkat! Veri siz işlem yaparken başka biri tarafından güncellenmiş. Güncel veriler yüklendi.');
            }
            if (typeof window.loadDataFromServer === 'function') {
              return window.loadDataFromServer(true).then(function() {
                if (typeof window.renderBranchDashboard === 'function') window.renderBranchDashboard();
                if (typeof window.renderVehicles === 'function') window.renderVehicles();
                notifyIfAvailable();
              }).catch(function() { return Promise.resolve(); });
            }
            return Promise.resolve();
          }
          console.warn('[Medisa] Sunucuya kayıt yapılamadı:', err && err.message);
          return Promise.reject(err);
        });
    }
    if (window.appData) window.appData.tasitlar = Array.isArray(arr) ? arr : [];
    invalidateVehicleDateTasksCache();
    notifyIfAvailable();
    return Promise.resolve();
  }

  // Global State
  let currentView = 'dashboard'; // 'dashboard' | 'list'
  let activeBranchId = null; // null = dashboard, 'all' = tümü, 'id' = şube
  let viewMode = 'card'; 
  let sortColumn = null; // 'year', 'brand', 'plate', 'km', 'type', 'transmission', 'user', 'branch', ...
  let sortDirection = 'asc'; // 'asc' | 'desc'
  let currentFilter = 'az'; // 'az' | 'newest' | 'oldest' | 'type' (liste filtre dropdown)
  let transmissionFilter = ''; // '' | 'otomatik' | 'manuel' (şanzıman filtresi)
  let lastListContext = null; // Son açılan liste bağlamı (geri dönüş hedefi)
  let isAutoSingleBranchVehiclesView = false;

  let lastVehiclesRenderSignature = '';
  let lastDashboardRenderSignature = '';

  function syncVehiclesListModeClass(forceHasList) {
    const modal = DOM && DOM.vehiclesModal;
    const content = DOM && DOM.vehiclesModalContent;
    if (!modal || !content) return;

    const hasListScroll = (typeof forceHasList === 'boolean')
      ? forceHasList
      : !!content.querySelector('.vehicles-list-scroll');

    modal.classList.toggle('has-vehicles-list-scroll', hasListScroll);
    content.classList.toggle('has-vehicles-list-scroll', hasListScroll);
  }

  function invalidateVehicleListRenderCache() {
    lastVehiclesRenderSignature = '';
    lastDashboardRenderSignature = '';
    if (DOM && DOM.vehiclesModalContent) {
      delete DOM.vehiclesModalContent.dataset.renderScope;
      delete DOM.vehiclesModalContent.dataset.renderSignature;
      DOM.vehiclesModalContent.classList.remove('has-vehicles-list-scroll');
    }
    if (DOM && DOM.vehiclesModal) {
      DOM.vehiclesModal.classList.remove('has-vehicles-list-scroll');
    }
  }

  function buildVehicleRenderSignature(vehicles, query, listDisplayOrder) {
    const branches = window.appData?.branches || [];
    const users = window.appData?.users || [];

    const branchNameMap = {};
    for (let i = 0; i < branches.length; i++) {
      const b = branches[i];
      branchNameMap[String(b.id)] = String(b.name || '');
    }

    const userNameMap = {};
    for (let i = 0; i < users.length; i++) {
      const u = users[i];
      userNameMap[String(u.id)] = String(u.name || u.isim || u.fullName || '');
    }

    const compactVehicleState = vehicles.map(function(v) {
      const branchName = branchNameMap[String(v.branchId)] || '';
      const userName = userNameMap[String(v.assignedUserId)] || '';

      return [
        String(v.id ?? ''),
        String(v.version ?? ''),
        String(v.guncelKm ?? v.km ?? ''),
        String(v.branchId ?? ''),
        branchName,
        String(v.assignedUserId ?? ''),
        userName,
        String(v.tahsisKisi ?? ''),
        String(v.transmission ?? ''),
        String(v.satildiMi === true ? 1 : 0)
      ].join(':');
    }).join('|');

    return [
      String(currentView),
      String(viewMode),
      String(activeBranchId),
      String(query || ''),
      String(transmissionFilter || ''),
      String(sortColumn || ''),
      String(sortDirection || ''),
      String(currentFilter || ''),
      window.innerWidth <= 768 ? 'mobile' : 'desktop',
      Array.isArray(listDisplayOrder) ? listDisplayOrder.join(',') : '',
      compactVehicleState
    ].join('__');
  }
  
  // Sütun Sıralaması State
  let vehicleColumnOrder = ['year', 'plate', 'brand', 'km', 'type', 'transmission', 'user', 'branch']; // Varsayılan sıralama
  
  var defaultVehicleColumnOrder = ['year', 'plate', 'brand', 'km', 'type', 'transmission', 'user', 'branch'];
  function normalizeVehicleColumnOrder(order) {
    var validOrder = Array.isArray(order)
      ? order.filter(function(col) { return defaultVehicleColumnOrder.indexOf(col) !== -1; })
      : [];
    defaultVehicleColumnOrder.forEach(function(col) {
      if (validOrder.indexOf(col) !== -1) return;
      var inserted = false;
      for (var i = defaultVehicleColumnOrder.indexOf(col) + 1; i < defaultVehicleColumnOrder.length; i++) {
        var nextCol = defaultVehicleColumnOrder[i];
        var nextIndex = validOrder.indexOf(nextCol);
        if (nextIndex !== -1) {
          validOrder.splice(nextIndex, 0, col);
          inserted = true;
          break;
        }
      }
      if (!inserted) validOrder.push(col);
    });
    return validOrder;
  }
  function loadVehicleColumnOrder() {
    if (typeof window.loadColumnState === 'function') {
      var saved = window.loadColumnState('vehicle_column_order', defaultVehicleColumnOrder);
      if (Array.isArray(saved)) {
        vehicleColumnOrder = normalizeVehicleColumnOrder(saved);
      } else { vehicleColumnOrder = defaultVehicleColumnOrder.slice(); }
    } else {
      try {
        var raw = localStorage.getItem('vehicle_column_order');
        if (raw) {
          var p = JSON.parse(raw);
          if (Array.isArray(p)) vehicleColumnOrder = normalizeVehicleColumnOrder(p);
        }
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
  function getVehiclesListViewportWidth() {
    var modalBody = document.querySelector('#vehicles-modal .modal-body');
    var scrollWrap = document.querySelector('#vehicles-modal .vehicles-list-scroll');
    return (modalBody && modalBody.clientWidth) || (scrollWrap && scrollWrap.clientWidth) || 0;
  }
  function shouldUseCompactVehicleHeader() {
    var listWidth = getVehiclesListViewportWidth();
    return listWidth > 0 && listWidth <= 760;
  }

  // Grid genişlikleri sütun kimliğine göre (sürükle-bırak sonrası genişlik doğru sütunla kalsın)
  function getVehicleColumnWidths(columnOrder) {
    const defaultCols = '44px 77px minmax(0, 1.25fr) 56px minmax(0, 0.95fr) minmax(0, 0.7fr) minmax(0, 1.05fr) minmax(0, 1.05fr)';
    try {
      if (!columnOrder || !Array.isArray(columnOrder) || columnOrder.length === 0) return defaultCols;
      const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
      const isCompactDesktop = !isMobile && shouldUseCompactVehicleHeader();
      const widthMap = isMobile
        ? {
            'year': '32px',
            'plate': '70px',
            'brand': '2.8fr',
            'km': '52px',
            'transmission': '60px',
            'user': '1.95fr',
            'branch': '1.68fr'
          }
        : isCompactDesktop
          ? {
              'year': '36px',
              'plate': '61px',
              'brand': 'minmax(0, 1.52fr)',
              'km': '49px',
              'type': 'minmax(0, 0.88fr)',
              'transmission': 'minmax(0, 0.6fr)',
              'user': 'minmax(0, 0.9fr)',
              'branch': 'minmax(0, 0.86fr)'
            }
        : {
            'year': '44px',
            'plate': '77px',
            'brand': 'minmax(0, 1.72fr)',
            'km': '56px',
            'type': 'minmax(0, 0.82fr)',
            'transmission': 'minmax(0, 0.6fr)',
            'user': 'minmax(0, 0.92fr)',
            'branch': 'minmax(0, 0.82fr)'
          };
      return columnOrder.map(key => widthMap[key] || '1fr').join(' ');
    } catch (e) {
      return defaultCols;
    }
  }

  function getVehicleListColumnDefs(isCompactHeader) {
    const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
    return {
      'year': { label: 'Yıl', class: 'list-year' },
      'plate': { label: 'Plaka', class: 'list-plate' },
      'brand': { label: ['Marka /', 'Model'], class: 'list-brand' },
      'km': { label: 'Km', class: 'list-km' },
      'type': { label: ['Taşıt', 'Tipi'], class: 'list-type' },
      'transmission': { label: 'Şanz.', class: 'list-transmission' },
      'user': { label: (!isMobile || isCompactHeader) ? 'Kull.' : 'Kullanıcı', class: 'list-user' },
      'branch': { label: 'Şube', class: 'list-branch' }
    };
  }

  /** En fazla iki satır: iki kelimede ikinci kelime ikinci satıra iner; tek kelime tek satır görünür */
  function buildVehicleHeaderLabelStackHtml(rawLabel) {
    var firstLine = '';
    var secondLine = '';
    var stackClass = 'header-label-stack';

    if (Array.isArray(rawLabel)) {
      firstLine = String(rawLabel[0] == null ? '' : rawLabel[0]).trim();
      secondLine = String(rawLabel[1] == null ? '' : rawLabel[1]).trim();
    } else {
      var t = (rawLabel == null ? '' : String(rawLabel)).trim();
      if (!t) {
        return '<span class="header-label-stack"><span class="header-r1"></span><span class="header-r2">-</span></span>';
      }
      var parts = t.split(/\s+/).filter(Boolean);
      if (parts.length <= 1) {
        firstLine = t;
        stackClass += ' header-label-single';
      } else {
        firstLine = parts[0];
        secondLine = parts.slice(1).join(' ');
      }
    }

    if (!firstLine && !secondLine) {
      return '<span class="header-label-stack"><span class="header-r1"></span><span class="header-r2">-</span></span>';
    }
    return '<span class="' + stackClass + '"><span class="header-r1">' + escapeHtml(firstLine) + '</span><span class="header-r2">' + escapeHtml(secondLine) + '</span></span>';
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

  function fitVehicleTextBoxes(root) {
    if (typeof window.medisaFitTextWithinBox !== 'function') return;
    const scope = root || document;
    window.medisaFitTextWithinBox(scope, [
      '.branch-name',
      '.view-card .card-brand-model',
      '.view-card .card-third-line',
      '.view-list .list-cell.list-branch',
      '#vehicle-detail-modal .detail-row-value'
    ].join(', '), {
      minFontSize: window.innerWidth <= 640 ? 8.5 : 9,
      maxReduction: 7,
      step: 0.5
    });

    window.medisaFitTextWithinBox(scope, '.view-list .list-cell.list-brand', {
      minFontSize: window.innerWidth <= 640 ? 11.5 : 12,
      maxReduction: 2.5,
      step: 0.5
    });

    // Kullanıcı adında genel shrink agresif görünüyordu; burada sadece isim satırlarına
    // daha yumuşak küçültme uygula ki kısa isimler normal boyutta kalsın.
    window.medisaFitTextWithinBox(scope, [
      '.view-list .list-cell.list-user .user-name-line1',
      '.view-list .list-cell.list-user .user-name-line2'
    ].join(', '), {
      minFontSize: window.innerWidth <= 640 ? 8.5 : 9,
      maxReduction: window.innerWidth <= 640 ? 4 : 4,
      step: 0.5
    });
  }

  let vehicleFitResizeTimer = null;
  window.addEventListener('resize', function() {
    clearTimeout(vehicleFitResizeTimer);
    vehicleFitResizeTimer = setTimeout(function() {
      fitVehicleTextBoxes(document.getElementById('vehicles-modal'));
      fitVehicleTextBoxes(document.getElementById('vehicle-detail-modal'));
    }, 120);
  });

  function toTitleCase(str) { return (typeof window.toTitleCase === 'function' ? window.toTitleCase(str) : str); }
  function formatBrandModel(str) { return (typeof window.formatBrandModel === 'function' ? window.formatBrandModel(str) : toTitleCase(str)); }
  function formatPlaka(str) { return (typeof window.formatPlaka === 'function' ? window.formatPlaka(str) : (str == null ? '-' : String(str))); }
  function formatAdSoyad(str) { return (typeof window.formatAdSoyad === 'function' ? window.formatAdSoyad(str) : str); }
  function buildVehicleUserNameHtml(rawName) {
    const userName = formatAdSoyad(rawName || '-');
    const cleanName = String(userName || '-').trim();
    if (!cleanName || cleanName === '-') return escapeHtml(cleanName || '-');

    const parts = cleanName.split(/\s+/);
    if (parts.length <= 1) {
      return '<span class="user-name-line1 user-name-single" title="' + escapeHtml(cleanName) + '">' + escapeHtml(cleanName) + '</span>';
    }

    const surname = parts.pop();
    const givenNames = parts.join(' ');
    return '<span class="user-name-line1" title="' + escapeHtml(givenNames) + '">' + escapeHtml(givenNames) + '</span>' +
      '<span class="user-name-line2" title="' + escapeHtml(surname) + '">' + escapeHtml(surname) + '</span>';
  }
  function normalizeVehicleSearchText(value) {
    return String(value == null ? '' : value).toLocaleLowerCase('tr-TR').trim();
  }
  function normalizePlateSearchText(value) {
    return normalizeVehicleSearchText(value).replace(/[\s-]+/g, '');
  }
  function vehicleMatchesSearchQuery(vehicle, query) {
    const q = normalizeVehicleSearchText(query);
    if (!q) return true;

    const source = vehicle || {};
    const plate = String(source.plate != null ? source.plate : '');
    const compactQuery = normalizePlateSearchText(q);
    const rawPlate = normalizeVehicleSearchText(plate);
    const compactPlate = normalizePlateSearchText(plate);
    const formattedPlate = normalizePlateSearchText(formatPlaka(plate));

    return (rawPlate && rawPlate.includes(q)) ||
      (compactQuery && (compactPlate.includes(compactQuery) || formattedPlate.includes(compactQuery))) ||
      (source.brandModel && normalizeVehicleSearchText(source.brandModel).includes(q)) ||
      (source.year && String(source.year).includes(q)) ||
      (source.tahsisKisi && normalizeVehicleSearchText(source.tahsisKisi).includes(q));
  }
  function getTransmissionLabel(transmission) {
    var value = String(transmission || '').trim().toLowerCase();
    if (value === 'otomatik') return 'Otomatik';
    if (value === 'manuel') return 'Manuel';
    return '-';
  }
  function getTransmissionShortLabel(transmission) {
    var value = String(transmission || '').trim().toLowerCase();
    if (value === 'otomatik') return 'Otm.';
    if (value === 'manuel' || value === 'düz' || value === 'duz') return 'Düz';
    return '-';
  }

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
    DOM.notificationsToggleBtn = document.getElementById('notifications-toggle-btn');
    DOM.dinamikOlayModal = document.getElementById('dinamik-olay-modal');
    DOM.dinamikOlayBaslik = document.getElementById('dinamik-olay-baslik');
    DOM.dinamikOlayFormIcerik = document.getElementById('dinamik-olay-form-icerik');
    DOM.dinamikOlayKaydetBtn = document.getElementById('dinamik-olay-kaydet-btn');
  }
  bindDOM();

  const NOTIF_READ_STORAGE_KEY = 'medisa_notif_read_keys_v1';
  const LEGACY_NOTIF_READ_SESSION_KEY = 'notifViewedKeysV2';
  const NOTIF_LOCAL_MIGRATION_FLAG_PREFIX = 'medisa_notif_read_migrated_';
  const NOTIF_STATE_MAX_KEYS = 500;
  const NOTIF_STATE_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;
  const NOTIF_FIRST_SEEN_STORAGE_KEY = 'medisa_notif_first_seen_dates_v1';
  let notifReadStateMigrationAttempted = false;
  let notifReadStateSaveInFlight = false;
  let notifFirstSeenBatchContext = null;

  function getCurrentNotifScopeKey() {
    const session = (window.medisaSession && typeof window.medisaSession === 'object') ? window.medisaSession : {};
    const user = (session.user && typeof session.user === 'object') ? session.user : {};
    const userId = String(user.id != null ? user.id : '').trim();
    const role = String(session.role || user.role || session.raw_role || '').trim().toLowerCase();
    let branchIds = Array.isArray(session.branch_ids)
      ? session.branch_ids.map(function(id) { return String(id).trim(); }).filter(Boolean)
      : [];
    branchIds = Array.from(new Set(branchIds)).sort();
    const branchScope = branchIds.length ? branchIds.join(',') : (role === 'genel_yonetici' || String(session.branch_scope || '').toLowerCase() === 'all' ? 'all' : 'none');
    return 'user:' + (userId || 'anonymous') + '|role:' + (role || 'unknown') + '|branches:' + branchScope;
  }

  function ensureNotificationReadStateObject() {
    if (!window.appData || typeof window.appData !== 'object') window.appData = {};
    if (!window.appData.notificationReadState || typeof window.appData.notificationReadState !== 'object' || Array.isArray(window.appData.notificationReadState)) {
      window.appData.notificationReadState = {};
    }
    return window.appData.notificationReadState;
  }

  function uniqNotificationKeys(keys) {
    const seen = {};
    const out = [];
    (Array.isArray(keys) ? keys : []).forEach(function(key) {
      const normalized = String(key || '').trim();
      if (!normalized || seen[normalized]) return;
      seen[normalized] = true;
      out.push(normalized);
    });
    return out;
  }

  function parseNotificationKeyMs(key) {
    const parts = String(key || '').split('|');
    const dateText = parts[0] === 'date' ? parts[3]
      : parts[0] === 'event' && /[T:.-]/.test(String(parts[3] || '')) ? parts[3]
      : parts[0] === 'special' && parts.length >= 4 ? (parts[2] + '-' + parts[3] + '-01')
      : '';
    if (!dateText) return 0;
    if (/^\d{2}\.\d{2}\.\d{4}$/.test(dateText)) {
      const bits = dateText.split('.');
      return new Date(Number(bits[2]), Number(bits[1]) - 1, Number(bits[0])).getTime() || 0;
    }
    const ms = new Date(dateText).getTime();
    return isNaN(ms) ? 0 : ms;
  }

  function pruneNotificationKeys(keys) {
    const now = Date.now();
    const list = uniqNotificationKeys(keys).map(function(key, index) {
      return { key: key, index: index, ms: parseNotificationKeyMs(key) };
    }).filter(function(item) {
      return !item.ms || (now - item.ms) <= NOTIF_STATE_MAX_AGE_MS;
    });
    if (list.length <= NOTIF_STATE_MAX_KEYS) return list.map(function(item) { return item.key; });
    list.sort(function(a, b) {
      const am = a.ms || Number.MAX_SAFE_INTEGER;
      const bm = b.ms || Number.MAX_SAFE_INTEGER;
      if (am !== bm) return bm - am;
      return b.index - a.index;
    });
    return list.slice(0, NOTIF_STATE_MAX_KEYS).map(function(item) { return item.key; });
  }

  function normalizeFirstSeenDatesMap(rawMap) {
    const out = {};
    if (!rawMap || typeof rawMap !== 'object' || Array.isArray(rawMap)) return out;
    Object.keys(rawMap).forEach(function(key) {
      const normalizedKey = String(key || '').trim();
      const normalizedDate = String(rawMap[key] || '').trim();
      if (!normalizedKey || !normalizedDate) return;
      out[normalizedKey] = normalizedDate;
    });
    return out;
  }

  function normalizeNotificationScopeState(scopeState) {
    const legacyArray = Array.isArray(scopeState) ? scopeState : null;
    const raw = (!legacyArray && scopeState && typeof scopeState === 'object') ? scopeState : {};
    const dismissedKeys = pruneNotificationKeys(raw.dismissedKeys || []);
    const readKeys = pruneNotificationKeys((legacyArray || raw.readKeys || []).concat(dismissedKeys));
    return {
      readKeys: readKeys,
      dismissedKeys: dismissedKeys,
      firstSeenDates: normalizeFirstSeenDatesMap(raw.firstSeenDates),
      migratedFromLocalStorage: raw.migratedFromLocalStorage === true,
      updatedAt: String(raw.updatedAt || '')
    };
  }

  function getNotificationScopeState(scopeKey) {
    const state = ensureNotificationReadStateObject();
    const normalized = normalizeNotificationScopeState(state[scopeKey]);
    state[scopeKey] = normalized;
    return normalized;
  }

  function cloneNotificationScopeState(scopeState) {
    const normalized = normalizeNotificationScopeState(scopeState);
    return {
      readKeys: normalized.readKeys.slice(),
      dismissedKeys: normalized.dismissedKeys.slice(),
      firstSeenDates: Object.assign({}, normalized.firstSeenDates),
      migratedFromLocalStorage: normalized.migratedFromLocalStorage,
      updatedAt: normalized.updatedAt
    };
  }

  function migrateLegacyNotificationReadStateForScope(scopeKey) {
    if (notifReadStateMigrationAttempted || !scopeKey) return;
    notifReadStateMigrationAttempted = true;
    const state = ensureNotificationReadStateObject();
    const scoped = getNotificationScopeState(scopeKey);
    const hasCentralForScope = scoped.readKeys.length > 0 || scoped.dismissedKeys.length > 0 || Object.keys(scoped.firstSeenDates || {}).length > 0 || scoped.migratedFromLocalStorage === true;
    if (hasCentralForScope) return;
    try {
      if (localStorage.getItem(NOTIF_LOCAL_MIGRATION_FLAG_PREFIX + scopeKey) === 'true') return;
    } catch (err) {}
    let legacy = [];
    try {
      const localRaw = localStorage.getItem(NOTIF_READ_STORAGE_KEY);
      const localParsed = localRaw ? JSON.parse(localRaw) : [];
      if (Array.isArray(localParsed)) legacy = legacy.concat(localParsed);
    } catch (err) {}
    try {
      const sessionRaw = sessionStorage.getItem(LEGACY_NOTIF_READ_SESSION_KEY);
      const sessionParsed = sessionRaw ? JSON.parse(sessionRaw) : [];
      if (Array.isArray(sessionParsed)) legacy = legacy.concat(sessionParsed);
    } catch (err) {}
    const unique = pruneNotificationKeys(legacy);
    scoped.migratedFromLocalStorage = true;
    scoped.updatedAt = new Date().toISOString();
    if (unique.length) scoped.readKeys = unique;
    state[scopeKey] = scoped;
    if (typeof window.saveDataToServer !== 'function' || notifReadStateSaveInFlight) return;
    notifReadStateSaveInFlight = true;
    window.saveDataToServer()
      .then(function(ok) {
        if (ok !== false) {
          try {
            localStorage.setItem(NOTIF_LOCAL_MIGRATION_FLAG_PREFIX + scopeKey, 'true');
          } catch (err) {}
        }
      })
      .catch(function() {})
      .finally(function() { notifReadStateSaveInFlight = false; });
  }

  function getKaskoState() {
    if (!window.appData || typeof window.appData !== 'object') window.appData = {};
    if (!window.appData.kaskoDegerListesi || typeof window.appData.kaskoDegerListesi !== 'object') {
      window.appData.kaskoDegerListesi = { updatedAt: '', period: '', sourceFileName: '', rows: [] };
    }
    if (!Array.isArray(window.appData.kaskoDegerListesi.rows)) window.appData.kaskoDegerListesi.rows = [];
    return window.appData.kaskoDegerListesi;
  }

  function hasAnyKaskoListData() {
    const state = getKaskoState();
    if (Array.isArray(state.rows) && state.rows.length > 0) return true;
    return false;
  }
  window.hasAnyKaskoListData = hasAnyKaskoListData;

  function getViewedNotificationKeys() {
    const scopeKey = getCurrentNotifScopeKey();
    if (scopeKey) {
      migrateLegacyNotificationReadStateForScope(scopeKey);
      return getNotificationScopeState(scopeKey).readKeys;
    }
    try {
      const raw = localStorage.getItem(NOTIF_READ_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) return parsed;
    } catch (err) {}
    try {
      const legacyRaw = sessionStorage.getItem(LEGACY_NOTIF_READ_SESSION_KEY);
      const legacyParsed = legacyRaw ? JSON.parse(legacyRaw) : [];
      return Array.isArray(legacyParsed) ? legacyParsed : [];
    } catch (err) {
      return [];
    }
  }

  function getDismissedNotificationKeys() {
    const scopeKey = getCurrentNotifScopeKey();
    if (scopeKey) {
      migrateLegacyNotificationReadStateForScope(scopeKey);
      return getNotificationScopeState(scopeKey).dismissedKeys;
    }
    return [];
  }

  function saveNotificationScopeStateWithRollback(scopeKey, previousScoped) {
    if (typeof window.updateNotifications === 'function') window.updateNotifications();
    if (typeof window.saveDataToServer !== 'function') return;
    window.saveDataToServer()
      .then(function(ok) {
        if (ok === false) throw new Error('Bildirim state kaydedilemedi');
      })
      .catch(function() {
        const state = ensureNotificationReadStateObject();
        state[scopeKey] = cloneNotificationScopeState(previousScoped);
        if (typeof window.updateNotifications === 'function') window.updateNotifications();
      });
  }

  function getTodayNotificationDisplayDate() {
    return formatDateForDisplay(new Date()) || '-';
  }

  function beginNotificationFirstSeenBatch(scopeKey) {
    notifFirstSeenBatchContext = scopeKey ? { scopeKey: scopeKey, previousScoped: null, changed: false } : null;
  }

  function flushNotificationFirstSeenBatch() {
    const batch = notifFirstSeenBatchContext;
    notifFirstSeenBatchContext = null;
    if (!batch || !batch.changed || !batch.previousScoped) return;
    saveNotificationScopeStateWithRollback(batch.scopeKey, batch.previousScoped);
  }

  function getOrCreateNotificationFirstSeen(notifKey) {
    const normalizedKey = String(notifKey || '').trim();
    if (!normalizedKey) return '-';
    const scopeKey = getCurrentNotifScopeKey();
    if (scopeKey) {
      const state = ensureNotificationReadStateObject();
      const scoped = getNotificationScopeState(scopeKey);
      const existing = scoped.firstSeenDates && scoped.firstSeenDates[normalizedKey];
      if (existing) return existing;
      const firstSeenDisplay = getTodayNotificationDisplayDate();
      if (!scoped.firstSeenDates || typeof scoped.firstSeenDates !== 'object' || Array.isArray(scoped.firstSeenDates)) {
        scoped.firstSeenDates = {};
      }
      if (notifFirstSeenBatchContext && notifFirstSeenBatchContext.scopeKey === scopeKey) {
        if (!notifFirstSeenBatchContext.previousScoped) notifFirstSeenBatchContext.previousScoped = cloneNotificationScopeState(scoped);
        notifFirstSeenBatchContext.changed = true;
      } else {
        const previousScoped = cloneNotificationScopeState(scoped);
        scoped.firstSeenDates[normalizedKey] = firstSeenDisplay;
        scoped.updatedAt = new Date().toISOString();
        state[scopeKey] = scoped;
        saveNotificationScopeStateWithRollback(scopeKey, previousScoped);
        return firstSeenDisplay;
      }
      scoped.firstSeenDates[normalizedKey] = firstSeenDisplay;
      scoped.updatedAt = new Date().toISOString();
      state[scopeKey] = scoped;
      return firstSeenDisplay;
    }
    let localMap = {};
    try {
      const raw = localStorage.getItem(NOTIF_FIRST_SEEN_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      localMap = normalizeFirstSeenDatesMap(parsed);
    } catch (err) {}
    if (localMap[normalizedKey]) return localMap[normalizedKey];
    const firstSeenDisplay = getTodayNotificationDisplayDate();
    localMap[normalizedKey] = firstSeenDisplay;
    try {
      localStorage.setItem(NOTIF_FIRST_SEEN_STORAGE_KEY, JSON.stringify(localMap));
    } catch (err) {}
    return firstSeenDisplay;
  }

  function updateNotificationKeys(keys, mode) {
    const incoming = Array.isArray(keys) ? keys : [];
    if (!incoming.length) return;
    const scopeKey = getCurrentNotifScopeKey();
    if (scopeKey) {
      const state = ensureNotificationReadStateObject();
      const scoped = getNotificationScopeState(scopeKey);
      const previousScoped = cloneNotificationScopeState(scoped);
      const readSet = {};
      const dismissedSet = {};
      scoped.readKeys.forEach(function(key) { readSet[key] = true; });
      scoped.dismissedKeys.forEach(function(key) { dismissedSet[key] = true; readSet[key] = true; });
      let changed = false;
      incoming.forEach(function(key) {
        const normalizedKey = String(key || '').trim();
        if (!normalizedKey) return;
        if (!readSet[normalizedKey]) {
          readSet[normalizedKey] = true;
          changed = true;
        }
        if (mode === 'dismiss' && !dismissedSet[normalizedKey]) {
          dismissedSet[normalizedKey] = true;
          changed = true;
        }
      });
      if (!changed) return;
      scoped.readKeys = pruneNotificationKeys(Object.keys(readSet));
      scoped.dismissedKeys = pruneNotificationKeys(Object.keys(dismissedSet));
      scoped.dismissedKeys.forEach(function(key) {
        if (scoped.readKeys.indexOf(key) === -1) scoped.readKeys.push(key);
      });
      scoped.readKeys = pruneNotificationKeys(scoped.readKeys);
      scoped.updatedAt = new Date().toISOString();
      state[scopeKey] = scoped;
      saveNotificationScopeStateWithRollback(scopeKey, previousScoped);
      return;
    }
    try {
      const viewed = getViewedNotificationKeys();
      incoming.forEach(function(key) {
        const normalizedKey = String(key || '').trim();
        if (normalizedKey && viewed.indexOf(normalizedKey) === -1) viewed.push(normalizedKey);
      });
      localStorage.setItem(NOTIF_READ_STORAGE_KEY, JSON.stringify(viewed));
      sessionStorage.removeItem(LEGACY_NOTIF_READ_SESSION_KEY);
    } catch (err) { return; }
    if (typeof window.updateNotifications === 'function') window.updateNotifications();
  }

  function markNotificationKeysAsViewed(keys) {
    updateNotificationKeys(keys, 'read');
  }

  function dismissNotificationKeys(keys) {
    updateNotificationKeys(keys, 'dismiss');
  }

  function getUnreadNotificationKeys() {
    return (DOM.notificationsDropdown ? Array.from(DOM.notificationsDropdown.querySelectorAll('.notification-item.notification-unread[data-notif-key]')) : [])
      .map(function(el) { return (el.getAttribute('data-notif-key') || '').toString().trim(); })
      .filter(Boolean);
  }

  function getDismissibleNotificationKeys() {
    return (DOM.notificationsDropdown ? Array.from(DOM.notificationsDropdown.querySelectorAll('.notification-item[data-dismiss-key]')) : [])
      .map(function(el) { return (el.getAttribute('data-dismiss-key') || '').toString().trim(); })
      .filter(Boolean);
  }

  function buildDateNotificationKey(notif) {
    return ['date', String(notif.vehicleId || ''), String(notif.type || ''), String(notif.date || ''), String(notif.type || '')].join('|');
  }

  function buildEventNotificationKey(item) {
    const ev = item && item.event ? item.event : {};
    const vehicleId = String((item && item.vehicleId) || '');
    const eventType = String(ev.type || '');
    const eventId = String(ev.id || '').trim();
    if (eventId) return ['event', vehicleId, eventType, eventId].join('|');
    const timestamp = String(ev.timestamp || '').trim();
    if (timestamp) return ['event', vehicleId, eventType, timestamp].join('|');
    return ['event', vehicleId, eventType, String(ev.date || '')].join('|');
  }

  const DINAMIK_OLAY_MODAL_ID = 'dinamik-olay-modal';
  function setVehiclesDetailUnderlay(active) {
    const vehiclesModal = DOM.vehiclesModal || document.getElementById('vehicles-modal');
    if (!vehiclesModal) return;
    vehiclesModal.classList.toggle('detail-underlay', !!active);
  }

  function getEventModalId(type) {
    return DINAMIK_OLAY_MODAL_ID;
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
    if (modal._cezaUserOutsideHandler) {
      document.removeEventListener('click', modal._cezaUserOutsideHandler, true);
      modal._cezaUserOutsideHandler = null;
    }
    if (typeof window.resetModalInputs === 'function') {
      window.resetModalInputs(modal);
    }
    modal.querySelectorAll('.date-placeholder').forEach(function(el) { el.remove(); });
    modal.querySelectorAll('.dynamic-event-save-message').forEach(function(el) { el.remove(); });
    modal.querySelectorAll('.universal-btn-save').forEach(function(btn) { btn.disabled = false; });
    ['lastik-adres-wrapper-event', 'anahtar-detay-wrapper', 'kredi-detay-wrapper-event'].forEach(function(id) {
      var wrap = modal.querySelector('#' + id);
      if (wrap) wrap.style.display = 'none';
    });
    var kazaKaporta = modal.querySelector('#kaza-kaporta-container');
    if (kazaKaporta) kazaKaporta.innerHTML = '';
  }

  function showDynamicEventSaveMessage(modal, text) {
    if (!modal) return null;
    const modalBody = modal.querySelector('.modal-body');
    if (!modalBody) return null;

    let messageEl = modalBody.querySelector('.dynamic-event-save-message');
    if (!messageEl) {
      messageEl = document.createElement('div');
      messageEl.className = 'dynamic-event-save-message';
      modalBody.insertBefore(messageEl, modalBody.firstChild);
    }
    messageEl.textContent = String(text || 'İşlem başarıyla kaydedildi.');
    return messageEl;
  }

  function completeDynamicEventSave(options) {
    const opts = options || {};
    const modalType = String(opts.modalType || '');
    const vehicleId = String(opts.vehicleId || window.currentDetailVehicleId || '');
    const message = String(opts.message || 'İşlem başarıyla kaydedildi.');
    const waitMs = typeof opts.waitMs === 'number' ? opts.waitMs : 800;
    const afterSuccess = typeof opts.afterSuccess === 'function' ? opts.afterSuccess : null;
    const modal = document.getElementById(getEventModalId(modalType)) || DOM.dinamikOlayModal;

    showDynamicEventSaveMessage(modal, message);

    return new Promise(function(resolve) {
      setTimeout(function() {
        if (modalType) closeEventModal(modalType);
        try {
          if (afterSuccess) {
            afterSuccess(vehicleId);
          } else if (vehicleId && typeof window.showVehicleDetail === 'function') {
            window.showVehicleDetail(vehicleId);
          }
        } catch (err) {
          console.error('Dinamik olay başarı kapanışı sırasında hata:', err);
        }
        resolve();
      }, waitMs);
    });
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
    // Mobilde yalnızca click: touchend kaydırmada hayalet tıklama üretiyordu.
    modalContent.addEventListener('click', handleVehicleRowClick);
  }

  /**
   * Kasko değer listesi bildirimi → Dış Veri / Excel yolu.
   * Bildirim kısayolu, Ayarlar > Dış Veri paneliyle aynı availability kuralını kullanır.
   */
  function isKaskoDegerListesiUploadUnavailableForNotifClick() {
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

  function showKaskoExcelMobileWarning() {
    const msg = 'Kasko değer listesi yükleme işlemi yalnızca masaüstü görünümde yapılabilir.';
    if (typeof window.showCenteredInfoBox === 'function') {
      window.showCenteredInfoBox(msg);
      return;
    }
    const overlay = document.getElementById('centered-info-box');
    const msgEl = document.getElementById('centered-info-message');
    if (!overlay || !msgEl) {
      alert(msg);
      return;
    }
    window.closeCenteredInfoBox = window.closeCenteredInfoBox || function closeCenteredInfoBox() {
      overlay.classList.remove('active');
      setTimeout(function() {
        overlay.style.display = 'none';
      }, 300);
    };
    msgEl.textContent = msg;
    overlay.style.display = 'flex';
    requestAnimationFrame(function() { overlay.classList.add('active'); });
  }

  /**
   * Mobil/PWA: document-level capture, script-core dışarı-tıklama (bubble) kapanışından ÖNCE çalışır;
   * stopImmediatePropagation ile panel kapanmadan uyarı gösterilir, sonra panel kapatılır.
   */
  if (!document._medisaKaskoNotifMobileCaptureBound) {
    document._medisaKaskoNotifMobileCaptureBound = true;
    document.addEventListener('click', function(e) {
      var notif = DOM.notificationsDropdown || document.getElementById('notifications-dropdown');
      if (!notif || !notif.classList.contains('open')) return;
      if (!notif.contains(e.target)) return;
      var item = e.target.closest && e.target.closest('.notification-item.kasko-excel-notification');
      if (!item) return;
      if (e.target.closest && e.target.closest('.mtv-dismiss-btn')) return;
      var action = (item.getAttribute('data-action') || '').toString().trim();
      if (action !== 'open-dis-veri') return;
      if (!isKaskoDegerListesiUploadUnavailableForNotifClick()) return;
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
      showKaskoExcelMobileWarning();
      setTimeout(function() {
        if (typeof window.setNotificationsOpenState === 'function') {
          window.setNotificationsOpenState(false);
        }
      }, 0);
    }, true);
  }

  // Bildirim listesi: delegation (her bildirime ayrı onclick yerine tek listener)
  if (DOM.notificationsDropdown && !DOM.notificationsDropdown._notifDelegationBound) {
    DOM.notificationsDropdown._notifDelegationBound = true;
    DOM.notificationsDropdown.addEventListener('click', function(e) {
      var rawTarget = e.target;
      var targetEl = rawTarget && rawTarget.nodeType === 1
        ? rawTarget
        : (rawTarget && rawTarget.parentElement ? rawTarget.parentElement : null);
      if (!targetEl || typeof targetEl.closest !== 'function') return;

      var actionBtn = targetEl.closest('[data-notification-action]');
      if (actionBtn) {
        var toolbarAction = (actionBtn.getAttribute('data-notification-action') || '').toString().trim();
        if (toolbarAction === 'mark-all-read') {
          e.preventDefault();
          e.stopPropagation();
          markNotificationKeysAsViewed(getUnreadNotificationKeys().concat(getDismissibleNotificationKeys()));
          return;
        }
      }
      var btn = targetEl.closest('.notification-item');
      if (!btn) return;
      var action = (btn.getAttribute('data-action') || '').toString().trim();
      var notifKey = (btn.getAttribute('data-notif-key') || '').toString().trim();
      if (notifKey && !targetEl.closest('.mtv-dismiss-btn')) {
        markNotificationKeysAsViewed([notifKey]);
      }
      if (action === 'open-dis-veri') {
        e.preventDefault();
        e.stopPropagation();
        if (typeof window.setNotificationsOpenState === 'function') {
          window.setNotificationsOpenState(false);
        }
        if (isKaskoDegerListesiUploadUnavailableForNotifClick()) {
          showKaskoExcelMobileWarning();
          if (typeof window.setNotificationsOpenState === 'function') {
            window.setNotificationsOpenState(false);
          }
          return;
        }
        if (typeof window.setNotificationsOpenState === 'function') {
          window.setNotificationsOpenState(false);
        }
        if (typeof window.openDisVeriPanel === 'function') window.openDisVeriPanel();
        return;
      }
      if (action === 'open-driver-report') {
        e.preventDefault();
        e.stopPropagation();
        if (typeof window.setNotificationsOpenState === 'function') {
          window.setNotificationsOpenState(false);
        }
        window.location.href = 'admin/driver-report.html?from=notifications';
        return;
      }
      var plate = btn.getAttribute('data-plate') || '';
      var vehicleId = btn.getAttribute('data-vehicle-id') || '';
      var openHistory = btn.getAttribute('data-open-history') === '1';
      var historyTab = btn.getAttribute('data-history-tab') || '';
      if (!plate && !vehicleId) return;
      if (typeof window.setNotificationsOpenState === 'function') {
        window.setNotificationsOpenState(false);
      }
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
        setTimeout(function() {
          window.__vehicleHistoryOpenedFromNotifications = true;
          window.showVehicleHistory(v.id, tab);
        }, 180);
      } else {
        window.__vehicleHistoryOpenedFromNotifications = false;
      }
    });
  }

  function syncMobileNotificationsDropdownHeight() {
    var dropdown = DOM.notificationsDropdown || document.getElementById('notifications-dropdown');
    if (!dropdown) return;
    if (!dropdown.classList.contains('open')) {
      dropdown.style.removeProperty('max-height');
      dropdown.style.removeProperty('padding-bottom');
      dropdown.style.removeProperty('scroll-padding-bottom');
      dropdown.style.removeProperty('--mobile-notifications-max-height');
      dropdown.style.removeProperty('position');
      dropdown.style.removeProperty('top');
      dropdown.style.removeProperty('left');
      dropdown.style.removeProperty('right');
      dropdown.style.removeProperty('transform');
      dropdown.style.removeProperty('width');
      dropdown.style.removeProperty('max-width');
      return;
    }

    var toggleBtn = DOM.notificationsToggleBtn || document.getElementById('notifications-toggle-btn');
    function clearNotifDropdownMobileLayout() {
      dropdown.style.removeProperty('position');
      dropdown.style.removeProperty('top');
      dropdown.style.removeProperty('left');
      dropdown.style.removeProperty('right');
      dropdown.style.removeProperty('transform');
      dropdown.style.removeProperty('width');
      dropdown.style.removeProperty('max-width');
    }
    if (window.innerWidth > 640) {
      clearNotifDropdownMobileLayout();
    } else if (toggleBtn) {
      var tr = toggleBtn.getBoundingClientRect();
      dropdown.style.setProperty('position', 'fixed', 'important');
      dropdown.style.setProperty('top', Math.round(tr.bottom + 4) + 'px', 'important');
      dropdown.style.setProperty('left', 'auto', 'important');
      dropdown.style.setProperty('right', 'max(8px, env(safe-area-inset-right, 0px))', 'important');
      dropdown.style.setProperty('transform', 'none', 'important');
      dropdown.style.setProperty('width', 'min(82vw, 420px)', 'important');
      dropdown.style.setProperty('max-width', 'calc(100vw - 28px)', 'important');
    } else {
      clearNotifDropdownMobileLayout();
    }

    var dropdownRect = dropdown.getBoundingClientRect();
    if (!dropdownRect || dropdownRect.top <= 0) return;
    var footer = document.getElementById('app-footer');
    var footerTop = footer ? (footer.getBoundingClientRect().top - 3) : (window.innerHeight - 45);
    var available = Math.floor(footerTop - dropdownRect.top);
    if (available <= 0) return;

    var dropdownStyles = window.getComputedStyle(dropdown);
    var paddingTop = parseFloat(dropdownStyles.paddingTop) || 0;
    var paddingBottom = parseFloat(dropdownStyles.paddingBottom) || 0;
    /* Mobil ve masaüstünde 6 tam kart; son border klibini önlemek için alt güvenlik payı */
    var isMobile = window.innerWidth <= 640;
    var safetyBottom = isMobile ? 10 : 14;
    var visibleLimit = 6;
    var innerBudget = Math.max(0, available - paddingTop - paddingBottom - safetyBottom);

    var toolbarHeight = 0;
    var cardHeights = [];
    var children = dropdown.children;
    for (var i = 0; i < children.length; i += 1) {
      var child = children[i];
      if (!child || child.nodeType !== 1) continue;
      var rect = child.getBoundingClientRect();
      if (!rect || rect.height <= 0) continue;
      var childStyles = window.getComputedStyle(child);
      var outerHeight = Math.ceil(
        rect.height +
        (parseFloat(childStyles.marginTop) || 0) +
        (parseFloat(childStyles.marginBottom) || 0)
      );
      if (!outerHeight) continue;
      if (child.classList.contains('notifications-toolbar')) {
        toolbarHeight += outerHeight;
        continue;
      }
      cardHeights.push(outerHeight);
    }

    var contentAfterToolbar = Math.max(0, innerBudget - toolbarHeight);
    var sumCards = 0;
    var fullCardCount = 0;
    for (var j = 0; j < cardHeights.length && fullCardCount < visibleLimit; j += 1) {
      var h = cardHeights[j];
      if (sumCards + h <= contentAfterToolbar) {
        sumCards += h;
        fullCardCount += 1;
      } else {
        break;
      }
    }

    /* safetyBottom yalnızca innerBudget'ta ayrılır; target'a eklenmez — eklenince viewport kartların altında uzar, 7. kart yarım görünür */
    var preferredContent = toolbarHeight + sumCards;
    var target = Math.ceil(paddingTop + paddingBottom + preferredContent);
    /* Hiçbir kart dikey bütçeye tam sığmıyorsa: kaydırma alanı için footer üstünü kullan (yarım satır yerine tam viewport) */
    if (cardHeights.length > 0 && fullCardCount === 0 && target < available) {
      target = available;
    } else {
      target = Math.min(available, target);
    }

    dropdown.style.setProperty('max-height', Math.max(0, target) + 'px', 'important');
    dropdown.style.setProperty('padding-bottom', safetyBottom + 'px', 'important');
    dropdown.style.setProperty('scroll-padding-bottom', safetyBottom + 'px');
    dropdown.style.setProperty('--mobile-notifications-max-height', Math.max(0, target) + 'px');
  }

  window.syncMobileNotificationsDropdownHeight = syncMobileNotificationsDropdownHeight;

  function resetNotificationsDropdownLayoutState() {
    var dropdown = DOM.notificationsDropdown || document.getElementById('notifications-dropdown');
    if (!dropdown) return;
    dropdown.style.removeProperty('max-height');
    dropdown.style.removeProperty('height');
    dropdown.style.removeProperty('min-height');
    dropdown.style.removeProperty('padding-bottom');
    dropdown.style.removeProperty('scroll-padding-bottom');
    dropdown.style.removeProperty('overflow');
    dropdown.style.removeProperty('transform');
    dropdown.style.removeProperty('--mobile-notifications-max-height');
    dropdown.style.removeProperty('position');
    dropdown.style.removeProperty('top');
    dropdown.style.removeProperty('left');
    dropdown.style.removeProperty('right');
    dropdown.style.removeProperty('width');
    dropdown.style.removeProperty('max-width');
  }

  window.resetNotificationsDropdownLayoutState = resetNotificationsDropdownLayoutState;

  if (!window.__medisaNotifDropdownResizeBound) {
    window.__medisaNotifDropdownResizeBound = true;
    window.addEventListener('resize', function() {
      if (typeof window.syncMobileNotificationsDropdownHeight === 'function') {
        requestAnimationFrame(window.syncMobileNotificationsDropdownHeight);
      }
    }, { passive: true });
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

    return { toolbar };
  }

  function getSingleVisibleVehicleBranch() {
    const branches = readBranches();
    return branches.length === 1 ? branches[0] : null;
  }

  window.goBackToVehiclesDashboard = function() {
    isAutoSingleBranchVehiclesView = false;
    renderBranchDashboard(false, { allowSingleBranchBypass: false });
  };

  // --- ANA GİRİŞ ---
  window.openVehiclesView = function() {
    loadVehicleColumnOrder();

    const modal = DOM.vehiclesModal;
    const content = DOM.vehiclesModalContent;
    if (modal) {
      setVehiclesDetailUnderlay(false);
      modal.style.display = 'flex';
      requestAnimationFrame(() => modal.classList.add('active'));
      ensureToolbar();
      currentView = 'dashboard';
      isAutoSingleBranchVehiclesView = false;
      updateToolbar('dashboard');
    }

    const isDataLoaded = !!window.__medisaDataLoaded;
    const localVehicles = readVehicles();
    const hasLocalData = Array.isArray(localVehicles) && localVehicles.length > 0;

    // SADECE HİÇ VERİ YOKSA (Sıfır Kurulum) YÜKLEME EKRANI GÖSTER
    if (!isDataLoaded && !hasLocalData && typeof window.loadDataFromServer === 'function') {
      if (content) {
        content.innerHTML = `
          <div class="vehicles-loading-state" style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:200px; color:#888;">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin-animation" style="margin-bottom:12px; animation: spin 1s linear infinite;"><circle cx="12" cy="12" r="10" stroke-dasharray="31.4 31.4" stroke-linecap="round"></circle></svg>
            <span>Veriler sunucudan alınıyor...</span>
          </div>`;
        content.dataset.renderScope = 'loading';
        content.dataset.renderSignature = 'loading';
        syncVehiclesListModeClass(false);
      }

      // Varsa arkaplandaki logoyu loading sırasında gizle (görsel iyileştirme)
      if (DOM.vehiclesModalContainer) DOM.vehiclesModalContainer.classList.add('hide-marker');

      window.loadDataFromServer(false).then(function() {
        if (DOM.vehiclesModalContainer) DOM.vehiclesModalContainer.classList.remove('hide-marker');
        const m = DOM.vehiclesModal;
        if (m && m.classList.contains('active')) {
          if (currentView === 'dashboard') renderBranchDashboard(true);
          else renderVehicles(getVSearchInput()?.value || '');
        }
        if (typeof window.updateNotifications === 'function') {
          window.updateNotifications();
        }
      }).catch(function() {
        if (DOM.vehiclesModalContainer) DOM.vehiclesModalContainer.classList.remove('hide-marker');
        if (content) {
          content.innerHTML = '<div style="text-align:center; padding:24px; color:#d40000">Veri yüklenemedi. Lütfen internet bağlantınızı kontrol edin.</div>';
          content.dataset.renderScope = 'loading-error';
          content.dataset.renderSignature = 'loading-error';
          syncVehiclesListModeClass(false);
        }
      });
      return;
    }

    // LOCAL VERİ VARSA VE SUNUCU GÜNCELLENİYORSA ARKA PLANDA SESSİZCE ÇALIŞTIR
    if ((!isDataLoaded || window.__medisaDataLoading) && typeof window.loadDataFromServer === 'function' && !window.__medisaBackgroundSyncing) {
      window.__medisaBackgroundSyncing = true; // Çifte isteği engelle

      window.loadDataFromServer(false).then(function() {
        window.__medisaBackgroundSyncing = false;
        const m = DOM.vehiclesModal;
        if (m && m.classList.contains('active')) {
          // Yeni taze veri inince ekranı hissettirmeden yenile
          if (currentView === 'dashboard') renderBranchDashboard(true);
          else renderVehicles(getVSearchInput()?.value || '');
        }
        if (typeof window.updateNotifications === 'function') {
          window.updateNotifications();
        }
      }).catch(function() {
        window.__medisaBackgroundSyncing = false;
      });
    }

    // BEKLEMEDEN ANINDA MEVCUT VERİYLE EKRANI ÇİZ!
    // Modal her açıldığında önce şube seçim ekranı (dashboard) gösterilsin; filtre butonu sadece şube seçildikten sonra görünsün.
    renderBranchDashboard(true);
  };

  window.closeVehiclesModal = function(event) {
    // Event propagation'ı durdur (overlay click'i engelle)
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    
    const modal = DOM.vehiclesModal;
    if (modal) {
      setVehiclesDetailUnderlay(false);
      resetModalState(modal);
      modal.classList.remove('active');
      setTimeout(() => {
        modal.style.display = 'none';
        closeSearchBox(true);
        syncVehiclesListModeClass(false);
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
        // DASHBOARD MODU: Sağda Genel Arama, Şanzıman filtresi ve Arşiv (filtre butonu yok)
        toolbar.innerHTML = `
            <div class="vt-left"></div>
            <div class="vt-right">
                <div id="v-search-container" class="v-search-container">
                    <input type="text" id="v-search-input" class="v-search-input" placeholder="Plaka, marka, kullan\u0131c\u0131 ara..." oninput="handleSearch(this.value)">
                </div>
                <button class="vt-icon-btn search-toggle-btn" onclick="toggleSearchBox('global')" title="Genel Arama">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.35-4.35"></path></svg>
                </button>
                <div class="v-transmission-wrap">
                    <button type="button" class="vt-icon-btn v-transmission-btn" onclick="toggleTransmissionMenu(event)" title="\u015Eanz\u0131man tipi" aria-label="\u015Eanz\u0131man tipi">
                        <svg width="18" height="18" viewBox="0 0 20.54 21.99" xmlns="http://www.w3.org/2000/svg"><g transform="translate(-107.004,-166.832)"><path fill="currentColor" d="m 112.60032,188.78148 c -0.0256,-0.0273 -0.45199,-0.10191 -0.94757,-0.1658 -1.00413,-0.12944 -1.76325,-0.3714 -2.61428,-0.83327 -0.60697,-0.3294 -1.42327,-0.94066 -1.67886,-1.25715 -0.24607,-0.3047 -0.39492,-0.93627 -0.34676,-1.47131 0.0588,-0.65313 0.40257,-1.18851 1.06416,-1.65727 0.42671,-0.30234 0.53233,-0.43143 0.53275,-0.65118 0.001,-0.58859 0.20829,-1.06067 0.69682,-1.58801 0.2711,-0.29264 0.61074,-0.61367 0.75476,-0.71341 0.22266,-0.15421 0.26185,-0.25085 0.26185,-0.64578 0,-0.6564 0.30408,-1.2505 0.96856,-1.89238 0.6772,-0.65416 1.68052,-1.20789 2.64914,-1.46205 0.74747,-0.19613 0.81479,-0.2606 0.90601,-0.86768 0.0827,-0.55057 0.75544,-1.25924 1.28038,-1.34885 l 0.3852,-0.0658 v -1.04459 -1.0446 l -0.42049,-0.26304 c -0.93193,-0.58298 -1.36919,-1.51394 -1.2684,-2.70047 0.0787,-0.9269 0.75132,-1.85208 1.5617,-2.14823 0.46348,-0.16938 1.40296,-0.17188 1.85909,-0.005 0.45128,0.16516 1.09064,0.8283 1.3212,1.37035 0.20729,0.48735 0.24139,1.41667 0.0739,2.0135 -0.14208,0.5062 -0.64856,1.1355 -1.18295,1.4698 l -0.4205,0.26304 v 0.9986 0.99859 l 0.46673,0.16548 c 0.65969,0.2339 1.03079,0.64915 1.20006,1.34288 0.0767,0.31438 0.15784,0.5912 0.18028,0.61516 0.0224,0.024 0.37581,0.13516 0.78525,0.24713 1.14802,0.31393 2.01316,0.81253 2.71253,1.5633 0.69276,0.74366 0.83412,1.02672 0.84015,1.68222 0.004,0.43648 0.0369,0.49605 0.5042,0.91474 0.89187,0.799 1.1844,1.30079 1.20919,2.0742 0.008,0.24957 0.10008,0.36952 0.50722,0.66068 0.56645,0.40509 0.82954,0.71382 0.99011,1.1619 0.22508,0.62806 0.10975,1.58545 -0.24429,2.02798 -0.25087,0.31357 -1.06736,0.926 -1.67741,1.25818 -0.76119,0.41447 -1.64395,0.7082 -2.57019,0.85522 -0.74795,0.11871 -10.23927,0.24982 -10.33951,0.14282 z m 11.00764,-1.9907 c 1.0103,-0.27582 2.42651,-1.14038 2.42651,-1.48133 0,-0.17965 -0.44457,-0.61412 -0.78029,-0.76256 -0.23328,-0.10315 -0.3055,-0.0863 -0.57638,0.13401 -0.42551,0.34616 -1.39721,0.89061 -1.5895,0.89061 -0.0869,0 -0.19963,0.0445 -0.25052,0.0988 -0.21135,0.2256 -1.64301,0.30377 -5.56354,0.30377 -3.92052,0 -5.35218,-0.0782 -5.56353,-0.30377 -0.0509,-0.0543 -0.16362,-0.0988 -0.25052,-0.0988 -0.19229,0 -1.16399,-0.54445 -1.58951,-0.89061 -0.27087,-0.22036 -0.34309,-0.23716 -0.57637,-0.13401 -0.28526,0.12613 -0.7803,0.57408 -0.7803,0.70609 0,0.37349 1.96466,1.48453 2.95182,1.66928 0.13093,0.0245 2.74857,0.0508 5.81699,0.0584 5.29503,0.0131 5.61691,0.003 6.32514,-0.18988 z m -0.85857,-2.83357 c 0.73983,-0.37625 1.56517,-1.04986 1.56835,-1.28003 0.002,-0.11045 -0.17648,-0.37057 -0.39557,-0.57805 -0.41885,-0.39666 -0.50035,-0.39799 -0.88712,-0.0146 -0.32081,0.31802 -0.92008,0.65579 -1.61161,0.90835 -0.64685,0.23624 -0.72625,0.24083 -4.1655,0.24083 -3.33178,0 -3.53568,-0.0108 -4.10158,-0.21722 -0.69845,-0.25477 -1.30995,-0.61648 -1.72299,-1.01918 -0.1626,-0.15853 -0.31823,-0.28817 -0.34584,-0.2881 -0.13448,3.8e-4 -0.85956,0.78824 -0.85956,0.93399 0,0.29783 1.06234,1.07293 1.92113,1.40168 0.47644,0.18238 0.79667,0.19288 5.31558,0.17425 l 4.80861,-0.0198 z m -1.30853,-2.73338 c 0.58186,-0.33177 1.26092,-1.05572 1.26092,-1.34429 0,-0.50342 -1.42219,-1.60307 -2.30083,-1.77902 l -0.33705,-0.0675 -0.0527,0.54539 c -0.0643,0.66481 -0.33103,1.16688 -0.79931,1.50442 -0.34104,0.24581 -0.40427,0.2541 -1.93878,0.2541 -1.58521,0 -1.5865,-1.9e-4 -1.97402,-0.28685 -0.4415,-0.3266 -0.78619,-1.04961 -0.78619,-1.6491 v -0.37362 l -0.3512,0.0703 c -0.86017,0.17226 -2.31496,1.2742 -2.31496,1.75349 0,0.32344 1.0611,1.31622 1.59831,1.49541 0.36701,0.12242 1.10046,0.14597 4.01966,0.12908 3.51365,-0.0203 3.57723,-0.0244 3.97618,-0.25183 z m -3.04906,-2.58941 c 0.1148,-0.15606 -0.09,-2.57753 -0.23073,-2.72772 -0.0532,-0.0568 -0.46686,-0.0882 -0.94313,-0.0716 l -0.84829,0.0296 -0.0745,1.01642 c -0.041,0.55904 -0.10884,1.1326 -0.15082,1.27459 -0.15194,0.51395 0.0211,0.6058 1.14155,0.6058 0.69663,0 1.0416,-0.0396 1.1059,-0.12706 z m -0.43177,-8.51744 c 0.2573,-0.27466 0.28416,-0.35831 0.23661,-0.73675 -0.14496,-1.15367 -1.6699,-1.20492 -1.84026,-0.0618 -0.0463,0.31044 -0.009,0.42125 0.25113,0.7369 0.25542,0.31053 0.36769,0.37152 0.68392,0.37152 0.29475,0 0.44247,-0.0684 0.6686,-0.30983 z"/></g></svg>
                    </button>
                    <div id="v-transmission-dropdown" class="v-transmission-dropdown" role="menu" aria-hidden="true">
                        <button type="button" class="v-transmission-option${transmissionFilter === '' ? ' active' : ''}" data-value="" role="menuitem">${transmissionFilter === '' ? '\u2713 ' : ''}T\u00FCm\u00FC</button>
                        <button type="button" class="v-transmission-option${transmissionFilter === 'otomatik' ? ' active' : ''}" data-value="otomatik" role="menuitem">${transmissionFilter === 'otomatik' ? '✓ ' : ''}Otomatik</button>
                        <button type="button" class="v-transmission-option${transmissionFilter === 'manuel' ? ' active' : ''}" data-value="manuel" role="menuitem">${transmissionFilter === 'manuel' ? '✓ ' : ''}Manuel</button>
                    </div>
                </div>
                <button class="vt-icon-btn" onclick="openArchiveView()" title="Ar\u015Fiv">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="5" rx="1"></rect><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"></path><path d="M10 12h4"></path></svg>
                </button>
            </div>
        `;
    } else {
        // DETAY MODU: Solda Geri+İsim, Sağda Yerel Arama/Filtre/Görünüm
        const leftContent = isAutoSingleBranchVehiclesView ? '' : `
                <div class="universal-back-bar">
                    <button type="button" class="universal-back-btn" onclick="goBackToVehiclesDashboard()">
                        <svg class="back-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                        ${title ? `<span class="universal-back-label">${escapeHtml(title)}</span>` : ''}
                    </button>
                </div>
        `;
        toolbar.innerHTML = `
            <div class="vt-left">
                ${leftContent}
            </div>
            <div class="vt-right">
                <div id="v-search-container" class="v-search-container">
                    <input type="text" id="v-search-input" class="v-search-input" placeholder="Plaka, marka, kullan\u0131c\u0131 ara..." oninput="handleSearch(this.value)">
                </div>
                <button class="vt-icon-btn search-toggle-btn" onclick="toggleSearchBox('local')" title="Ara">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.35-4.35"></path></svg>
                </button>
                <div class="v-transmission-wrap">
                    <button type="button" class="vt-icon-btn v-transmission-btn" onclick="toggleTransmissionMenu(event)" title="\u015Eanz\u0131man tipi" aria-label="\u015Eanz\u0131man tipi">
                        <svg width="18" height="18" viewBox="0 0 20.54 21.99" xmlns="http://www.w3.org/2000/svg"><g transform="translate(-107.004,-166.832)"><path fill="currentColor" d="m 112.60032,188.78148 c -0.0256,-0.0273 -0.45199,-0.10191 -0.94757,-0.1658 -1.00413,-0.12944 -1.76325,-0.3714 -2.61428,-0.83327 -0.60697,-0.3294 -1.42327,-0.94066 -1.67886,-1.25715 -0.24607,-0.3047 -0.39492,-0.93627 -0.34676,-1.47131 0.0588,-0.65313 0.40257,-1.18851 1.06416,-1.65727 0.42671,-0.30234 0.53233,-0.43143 0.53275,-0.65118 0.001,-0.58859 0.20829,-1.06067 0.69682,-1.58801 0.2711,-0.29264 0.61074,-0.61367 0.75476,-0.71341 0.22266,-0.15421 0.26185,-0.25085 0.26185,-0.64578 0,-0.6564 0.30408,-1.2505 0.96856,-1.89238 0.6772,-0.65416 1.68052,-1.20789 2.64914,-1.46205 0.74747,-0.19613 0.81479,-0.2606 0.90601,-0.86768 0.0827,-0.55057 0.75544,-1.25924 1.28038,-1.34885 l 0.3852,-0.0658 v -1.04459 -1.0446 l -0.42049,-0.26304 c -0.93193,-0.58298 -1.36919,-1.51394 -1.2684,-2.70047 0.0787,-0.9269 0.75132,-1.85208 1.5617,-2.14823 0.46348,-0.16938 1.40296,-0.17188 1.85909,-0.005 0.45128,0.16516 1.09064,0.8283 1.3212,1.37035 0.20729,0.48735 0.24139,1.41667 0.0739,2.0135 -0.14208,0.5062 -0.64856,1.1355 -1.18295,1.4698 l -0.4205,0.26304 v 0.9986 0.99859 l 0.46673,0.16548 c 0.65969,0.2339 1.03079,0.64915 1.20006,1.34288 0.0767,0.31438 0.15784,0.5912 0.18028,0.61516 0.0224,0.024 0.37581,0.13516 0.78525,0.24713 1.14802,0.31393 2.01316,0.81253 2.71253,1.5633 0.69276,0.74366 0.83412,1.02672 0.84015,1.68222 0.004,0.43648 0.0369,0.49605 0.5042,0.91474 0.89187,0.799 1.1844,1.30079 1.20919,2.0742 0.008,0.24957 0.10008,0.36952 0.50722,0.66068 0.56645,0.40509 0.82954,0.71382 0.99011,1.1619 0.22508,0.62806 0.10975,1.58545 -0.24429,2.02798 -0.25087,0.31357 -1.06736,0.926 -1.67741,1.25818 -0.76119,0.41447 -1.64395,0.7082 -2.57019,0.85522 -0.74795,0.11871 -10.23927,0.24982 -10.33951,0.14282 z m 11.00764,-1.9907 c 1.0103,-0.27582 2.42651,-1.14038 2.42651,-1.48133 0,-0.17965 -0.44457,-0.61412 -0.78029,-0.76256 -0.23328,-0.10315 -0.3055,-0.0863 -0.57638,0.13401 -0.42551,0.34616 -1.39721,0.89061 -1.5895,0.89061 -0.0869,0 -0.19963,0.0445 -0.25052,0.0988 -0.21135,0.2256 -1.64301,0.30377 -5.56354,0.30377 -3.92052,0 -5.35218,-0.0782 -5.56353,-0.30377 -0.0509,-0.0543 -0.16362,-0.0988 -0.25052,-0.0988 -0.19229,0 -1.16399,-0.54445 -1.58951,-0.89061 -0.27087,-0.22036 -0.34309,-0.23716 -0.57637,-0.13401 -0.28526,0.12613 -0.7803,0.57408 -0.7803,0.70609 0,0.37349 1.96466,1.48453 2.95182,1.66928 0.13093,0.0245 2.74857,0.0508 5.81699,0.0584 5.29503,0.0131 5.61691,0.003 6.32514,-0.18988 z m -0.85857,-2.83357 c 0.73983,-0.37625 1.56517,-1.04986 1.56835,-1.28003 0.002,-0.11045 -0.17648,-0.37057 -0.39557,-0.57805 -0.41885,-0.39666 -0.50035,-0.39799 -0.88712,-0.0146 -0.32081,0.31802 -0.92008,0.65579 -1.61161,0.90835 -0.64685,0.23624 -0.72625,0.24083 -4.1655,0.24083 -3.33178,0 -3.53568,-0.0108 -4.10158,-0.21722 -0.69845,-0.25477 -1.30995,-0.61648 -1.72299,-1.01918 -0.1626,-0.15853 -0.31823,-0.28817 -0.34584,-0.2881 -0.13448,3.8e-4 -0.85956,0.78824 -0.85956,0.93399 0,0.29783 1.06234,1.07293 1.92113,1.40168 0.47644,0.18238 0.79667,0.19288 5.31558,0.17425 l 4.80861,-0.0198 z m -1.30853,-2.73338 c 0.58186,-0.33177 1.26092,-1.05572 1.26092,-1.34429 0,-0.50342 -1.42219,-1.60307 -2.30083,-1.77902 l -0.33705,-0.0675 -0.0527,0.54539 c -0.0643,0.66481 -0.33103,1.16688 -0.79931,1.50442 -0.34104,0.24581 -0.40427,0.2541 -1.93878,0.2541 -1.58521,0 -1.5865,-1.9e-4 -1.97402,-0.28685 -0.4415,-0.3266 -0.78619,-1.04961 -0.78619,-1.6491 v -0.37362 l -0.3512,0.0703 c -0.86017,0.17226 -2.31496,1.2742 -2.31496,1.75349 0,0.32344 1.0611,1.31622 1.59831,1.49541 0.36701,0.12242 1.10046,0.14597 4.01966,0.12908 3.51365,-0.0203 3.57723,-0.0244 3.97618,-0.25183 z m -3.04906,-2.58941 c 0.1148,-0.15606 -0.09,-2.57753 -0.23073,-2.72772 -0.0532,-0.0568 -0.46686,-0.0882 -0.94313,-0.0716 l -0.84829,0.0296 -0.0745,1.01642 c -0.041,0.55904 -0.10884,1.1326 -0.15082,1.27459 -0.15194,0.51395 0.0211,0.6058 1.14155,0.6058 0.69663,0 1.0416,-0.0396 1.1059,-0.12706 z m -0.43177,-8.51744 c 0.2573,-0.27466 0.28416,-0.35831 0.23661,-0.73675 -0.14496,-1.15367 -1.6699,-1.20492 -1.84026,-0.0618 -0.0463,0.31044 -0.009,0.42125 0.25113,0.7369 0.25542,0.31053 0.36769,0.37152 0.68392,0.37152 0.29475,0 0.44247,-0.0684 0.6686,-0.30983 z"/></g></svg>
                    </button>
                    <div id="v-transmission-dropdown" class="v-transmission-dropdown" role="menu" aria-hidden="true">
                        <button type="button" class="v-transmission-option${transmissionFilter === '' ? ' active' : ''}" data-value="" role="menuitem">${transmissionFilter === '' ? '\u2713 ' : ''}T\u00FCm\u00FC</button>
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
  window.renderBranchDashboard = function(forceRender = false, options = {}) {
    currentView = 'dashboard';
    activeBranchId = null;
    closeSearchBox(true);
    updateToolbar('dashboard');

    const branches = readBranches();
    const allowSingleBranchBypass = options.allowSingleBranchBypass !== false;
    const singleVisibleBranch = allowSingleBranchBypass ? getSingleVisibleVehicleBranch() : null;
    if (singleVisibleBranch) {
      openBranchList(singleVisibleBranch.id, singleVisibleBranch.name, { autoSingleBranch: true });
      return;
    }
    isAutoSingleBranchVehiclesView = false;

    const vehicles = readVehicles();
    const activeVehicles = vehicles.filter(v => v.satildiMi !== true);

    // Şube kartları için sayımlar (Map ile O(n))
    const countByBranch = new Map();
    let unassignedCount = 0;
    activeVehicles.forEach(v => {
      if (!v.branchId) {
        unassignedCount++;
      } else {
        const branchKey = String(v.branchId);
        countByBranch.set(branchKey, (countByBranch.get(branchKey) || 0) + 1);
      }
    });

    const isMobile = window.innerWidth <= 640;
    const branchSig = branches.map(function(branch) {
      const id = String(branch.id || '');
      const name = String(branch.name || '');
      const count = String(countByBranch.get(id) || 0);
      return id + ':' + name + ':' + count;
    }).join('|');
    const renderSignature = [
      'dashboard',
      isMobile ? 'mobile' : 'desktop',
      String(activeVehicles.length),
      String(unassignedCount),
      branchSig
    ].join('__');

    if (
      !forceRender &&
      modalContent &&
      modalContent.dataset.renderScope === 'dashboard' &&
      lastDashboardRenderSignature === renderSignature
    ) {
      syncVehiclesListModeClass(false);
      fitVehicleTextBoxes(modalContent);
      return;
    }

    // Grid HTML başlangıcı
    let html = '<div class="branch-grid">';

    // 1. "TÜMÜ" Kartı (Manuel) — sadece aktif (satılmamış) taşıtlar
    html += `
      <div class="branch-card all-card" data-branch-id="all" data-branch-name="TAŞITLAR">
        <div class="branch-name">TÜMÜ</div>
        <div class="branch-count">${activeVehicles.length} Taşıt</div>
      </div>
    `;

    // 2. Şube kartları
    branches.forEach(branch => {
      html += createBranchCard(branch.id, branch.name, countByBranch.get(String(branch.id)) || 0);
    });

    // 3. Tahsis edilmemiş
    if (unassignedCount > 0) {
      html += createBranchCard('', 'Tahsis Edilmemiş', unassignedCount, true);
    }

    html += '</div>';
    modalContent.innerHTML = html;
    modalContent.dataset.renderScope = 'dashboard';
    modalContent.dataset.renderSignature = renderSignature;
    lastDashboardRenderSignature = renderSignature;
    syncVehiclesListModeClass(false);
    fitVehicleTextBoxes(modalContent);

    /* Layout flex ile; kolon sayısı .branch-card width/flex ile belirlenir */
  };
  function createBranchCard(id, name, count, isUnassigned = false) {
    const unassignedClass = isUnassigned ? ' unassigned-branch-card' : '';
    const safeId = (id || '').replace(/"/g, '&quot;');
    const safeName = escapeHtml(String(name || '').toLocaleUpperCase('tr-TR'));
    return `
      <div class="branch-card${unassignedClass}" data-branch-id="${safeId}" data-branch-name="${safeName}">
        <div class="branch-name" title="${safeName}">${safeName}</div>
        <div class="branch-count">${count} Taşıt</div>
      </div>
    `;
  }

  // --- 2. LİSTE RENDER (Şube Detayı) ---
  window.openBranchList = function(branchId, branchName, options = {}) {
    currentView = 'list';
    viewMode = 'list';
    activeBranchId = branchId; // 'all', '', veya 'id'
    lastListContext = { mode: 'branch', branchId: branchId, branchName: branchName };
    isAutoSingleBranchVehiclesView = options.autoSingleBranch === true;
    invalidateVehicleListRenderCache();
    closeSearchBox(true);
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
    isAutoSingleBranchVehiclesView = false;
    invalidateVehicleListRenderCache();
    closeSearchBox(true);
    updateToolbar('detail', 'Arşiv');
    renderVehicles();
  };

  /** Taşıt listesini şube/arama/filtre/sıralamadan sonra kart veya liste olarak render eder. @param {string} [query] Opsiyonel metin araması */
  function renderVehicles(query = '') {
    try {
      const listContainer = DOM.vehiclesModalContent;
      if (!listContainer) return;
      loadVehicleColumnOrder(); // Sütun sıralamasını yükle
      // Veri Çek
      let vehicles = readVehicles();
      if (!Array.isArray(vehicles)) return;
      const branches = window.appData?.branches || [];
      const users = window.appData?.users || [];

      const branchMap = {};
      for (let i = 0; i < branches.length; i++) {
        const b = branches[i];
        branchMap[String(b.id)] = b;
      }

      const userMap = {};
      for (let i = 0; i < users.length; i++) {
        const u = users[i];
        userMap[String(u.id)] = u;
      }

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
        vehicles = vehicles.filter(v => vehicleMatchesSearchQuery(v, query));
    }

    // 2b. Şanzıman filtresi (Otomatik/Manuel)
    if (transmissionFilter) {
        vehicles = vehicles.filter(v => v.transmission === transmissionFilter);
    }

      // 3. Sıralama
      vehicles = applyFilter(vehicles);

      // Kırmızı tarih uyarısı olan satırlar (sigorta/kasko/muayene/egzoz) listenin üstünde sabit
      (function pinCriticalDateWarningsFirst(list) {
        if (!Array.isArray(list) || list.length < 2) return;
        function warnRank(v) {
          var c = getVehicleDateSeverityClass(v);
          if (c.indexOf('vehicle-date-warning-red') !== -1) return 0;
          if (c.indexOf('vehicle-date-warning-orange') !== -1) return 1;
          return 2;
        }
        var tagged = list.map(function(v, i) { return { v: v, i: i }; });
        tagged.sort(function(A, B) {
          var ra = warnRank(A.v);
          var rb = warnRank(B.v);
          if (ra !== rb) return ra - rb;
          return A.i - B.i;
        });
        for (var ti = 0; ti < tagged.length; ti++) {
          list[ti] = tagged[ti].v;
        }
      })(vehicles);

      // Şube seçiliyken liste görünümünde şube sütunu gösterilmez
      const safeColumnOrder = Array.isArray(vehicleColumnOrder) ? vehicleColumnOrder : ['year', 'plate', 'brand', 'km', 'type', 'transmission', 'user', 'branch'];
      const displayColumnOrder = (activeBranchId === 'all' || activeBranchId === '__archive__') ? safeColumnOrder : safeColumnOrder.filter(function(k) { return k !== 'branch'; });
      const isMobileList = window.innerWidth <= 768;
      const isCompactHeader = window.innerWidth <= 640; /* dar ekranda kısa başlık etiketleri */
      // Mobil/tablet (≤768px): Taşıt Tipi + Şanzıman sütunlarını göstermiyoruz (yer kaplamasın)
      const listDisplayOrder = isMobileList ? displayColumnOrder.filter(function(k) { return k !== 'type' && k !== 'transmission'; }) : displayColumnOrder;

      const renderSignature = buildVehicleRenderSignature(vehicles, query, listDisplayOrder);
      if (
        listContainer.dataset.renderScope === 'vehicles' &&
        lastVehiclesRenderSignature === renderSignature
      ) {
        syncVehiclesListModeClass(viewMode === 'list');
        return;
      }

      cleanupVehicleColumnTouchDrag(listContainer);

      // 4. HTML – boş liste: liste görünümünde başlıkları koru, tek satırda mesaj göster
      if (vehicles.length === 0) {
          const emptyMsg = (activeBranchId === '__archive__') ? 'Arşivde kayıt bulunamadı.' : 'Kayıt bulunamadı.';
          if (viewMode === 'list') {
            loadVehicleColumnOrder();
            const gridStr = getVehicleColumnWidths(listDisplayOrder);
            const columnDefs = getVehicleListColumnDefs(isCompactHeader);
            let emptyHtml = '<div class="list-header-row" style="grid-template-columns: ' + gridStr + '">';
            listDisplayOrder.forEach(columnKey => {
              const def = columnDefs[columnKey];
              if (def) {
                let labelHtml = buildVehicleHeaderLabelStackHtml(def.label);
                emptyHtml += `<div class="list-cell ${def.class} sortable-header" data-col="${columnKey}">${labelHtml}</div>`;
              }
            });
            emptyHtml += '</div><div class="vehicles-list-scroll"><div class="view-list view-list-empty"><div class="list-item list-item-empty" style="grid-column: 1 / -1; justify-content: center; padding: 24px;"><span style="color:#666;">' + escapeHtml(emptyMsg) + '</span></div></div></div>';
            listContainer.innerHTML = emptyHtml;
            listContainer.dataset.renderScope = 'vehicles';
            listContainer.dataset.renderSignature = renderSignature;
            lastVehiclesRenderSignature = renderSignature;
            syncVehiclesListModeClass(true);
          } else {
            listContainer.innerHTML = `<div style="text-align:center; padding:40px; color:#666">${emptyMsg}</div>`;
            listContainer.dataset.renderScope = 'vehicles';
            listContainer.dataset.renderSignature = renderSignature;
            lastVehiclesRenderSignature = renderSignature;
            syncVehiclesListModeClass(false);
          }
          return;
      }

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
        
        // Sütun başlık tanımları (≤640px: kısa etiket; masaüstü: tam kelime + CSS satır kırılması)
        const columnDefs = getVehicleListColumnDefs(isCompactHeader);
        html += '<div class="list-header-row" style="grid-template-columns: ' + gridStr + '">';
        // Sıralamaya göre sütun başlıklarını render et
        listDisplayOrder.forEach(columnKey => {
          const def = columnDefs[columnKey];
          if (def) {
            let labelHtml = buildVehicleHeaderLabelStackHtml(def.label);
            html += `
              <div class="list-cell ${def.class} sortable-header" 
                   data-col="${columnKey}"
                   ${isMobile ? '' : 'draggable="true"'}
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
          thirdLine = branchMap[String(v.branchId)]?.name || '';
        } else {
          thirdLine = v.tahsisKisi || '';
        }
        const thirdLineDisplay = thirdLine ? (isArchive ? toTitleCase(thirdLine) : (activeBranchId === 'all' ? toTitleCase(thirdLine) : formatAdSoyad(thirdLine))) : '';
        const satildiCardSpan = isArchive ? ' <span style="color:#d40000;font-size:12px;">(SATILDI)</span>' : '';
        const satildiBrandLine = isArchive ? '<span class="archive-satildi-line">(SATILDI)</span>' : '';

        // Tahsis edilmemiş taşıtlar için kırmızı class (liste ve kartta her zaman)
        const isUnassigned = !v.branchId;
        const unassignedClass = isUnassigned ? ' unassigned-vehicle-card' : '';
        const vehicleDateSeverityClass = getVehicleDateSeverityClass(v);

        if (viewMode === 'card') {
            // Üçüncü satır boşsa div'i render etme
            const thirdLineHtml = thirdLineDisplay ? `<div class="card-third-line" title="${escapeHtml(thirdLineDisplay)}">${escapeHtml(thirdLineDisplay)}</div>` : '';
            const vid = v.id != null ? String(v.id).replace(/"/g, '&quot;') : '';
            return `
              <div class="card${unassignedClass}${vehicleDateSeverityClass}" data-vehicle-id="${vid}" style="cursor:pointer">
                <div class="card-plate">${escapeHtml(formatPlaka(plate))}${satildiCardSpan}</div>
                <div class="card-brand-model" title="${escapeHtml(brandModel)}">${escapeHtml(formatBrandModel(brandModel))}</div>
                ${thirdLineHtml}
              </div>
            `;
        } else {
            // Liste görünümü: Sıralamaya göre dinamik
            const kmValue = v.guncelKm || v.km;
            const kmLabel = kmValue ? formatNumber(kmValue) : '-';
            const vehicleTypeLabel = toTitleCase(v.vehicleType || '-');
            const transmissionLabel = getTransmissionShortLabel(v.transmission);
            const branchLabel = toTitleCase(branchMap[String(v.branchId)]?.name || 'Tahsis Edilmemiş');
            
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
                  if (isArchive) {
                    cellContent = '<span class="archive-brand-main" title="' + escapeHtml(formatBrandModel(brandModel)) + '">' + escapeHtml(formatBrandModel(brandModel)) + '</span>' + satildiBrandLine;
                  } else {
                    cellContent = escapeHtml(formatBrandModel(brandModel));
                  }
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
                case 'transmission':
                  cellContent = escapeHtml(transmissionLabel);
                  cellClass = 'list-transmission';
                  break;
                case 'user':
                  const assignedUser = v.assignedUserId ? userMap[String(v.assignedUserId)] : null;
                  const userNameRaw = assignedUser?.name || assignedUser?.isim || assignedUser?.fullName || v.tahsisKisi || '-';
                  cellContent = buildVehicleUserNameHtml(userNameRaw);
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
            const archiveRowClass = isArchive ? ' archive-vehicle-row' : '';
            return `
              <div class="list-item${unassignedClass}${archiveRowClass}${vehicleDateSeverityClass}" data-vehicle-id="${vid}" style="grid-template-columns: ${gridStr}; cursor:pointer">
                ${cellHtml}
              </div>
            `;
        }
    }).join('') + '</div>' + (viewMode === 'list' ? '</div>' : '') + '';

      // PERFORMANS: Browser'ın yerleşik C++ HTML parser'ını doğrudan kullanıyoruz.
      // Fragment ve tek tek node taşıma işlemi (Layout Thrashing) iptal edildi.
      listContainer.innerHTML = html;
      listContainer.dataset.renderScope = 'vehicles';
      listContainer.dataset.renderSignature = renderSignature;
      lastVehiclesRenderSignature = renderSignature;
      syncVehiclesListModeClass(viewMode === 'list');

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
      fitVehicleTextBoxes(listContainer);
      
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
      syncVehiclesListModeClass(false);
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

      // iOS yazıcı izin prompt'unu azaltmak için yazdırma script'ini önceden yükle
      if (!window._printScriptPromise) {
        window._printScriptPromise = loadScript('tasitlar-yazici.js?v=20260506.11');
      }

    const modal = DOM.vehicleDetailModal || document.getElementById('vehicle-detail-modal');
    if (!modal) {
      return;
    }

    const contentEl = DOM.vehicleDetailContent || document.getElementById('vehicle-detail-content');
    if (!contentEl) {
      return;
    }

    const detailSignature = [
      String(vehicle.id ?? ''),
      String(vehicle.version ?? ''),
      String(vehicle.guncelKm ?? vehicle.km ?? ''),
      String(vehicle.branchId ?? ''),
      String(vehicle.assignedUserId ?? ''),
      String(vehicle.tahsisKisi ?? ''),
      String(vehicle.ruhsatPath ?? ''),
      String(vehicle.satildiMi === true ? 1 : 0),
      String(Array.isArray(vehicle.events) ? vehicle.events.length : 0)
    ].join('|');
    const isArchiveSoldDetail = vehicle.satildiMi === true && lastListContext && lastListContext.mode === 'archive';

    if (
      modal.classList.contains('active') &&
      String(window.currentDetailVehicleId) === String(vehicleId) &&
      modal.dataset.detailSignature === detailSignature
    ) {
      return;
    }

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
      if (vehicle.satildiMi && !isArchiveSoldDetail) {
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
        if (vehicle.satildiMi && !isArchiveSoldDetail) {
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
      const brandModel = formatBrandModel(vehicle.brandModel || '-');
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
        backFromVehicleDetailToListContext();
      };
      backBar.appendChild(backBtn);
      toolbarLeft.appendChild(backBar);
      
      // Orta taraf (tahsis butonu - sadece tahsis edilmemiş taşıtlar için)
      // Yatayda ortalı: sol ok ve Taşıtlar dikkate alınmadan, tam ekran ortası
      const toolbarCenter = document.createElement('div');
      toolbarCenter.className = 'detail-toolbar-center-absolute';
      
      if (isArchiveSoldDetail) {
        const soldBadge = document.createElement('span');
        soldBadge.className = 'detail-sold-badge';
        soldBadge.textContent = 'SATILDI';
        toolbarCenter.appendChild(soldBadge);
      }
      if (!vehicle.branchId && !isArchivedVehicleAssignmentLocked(vehicle)) {
        const assignBtn = document.createElement('button');
        assignBtn.className = 'detail-assign-button-frameless';
        assignBtn.innerHTML = '<span>\u015Eubeye Tahsis Etmek \u0130\u00E7in +</span>';
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
      ruhsatBtn.title = 'Belgeler';
      ruhsatBtn.setAttribute('aria-label', 'Belgeler');
      ruhsatBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg>';
      ruhsatBtn.onclick = (e) => { e.stopPropagation(); if (typeof window.openVehicleDocumentsModal === 'function') window.openVehicleDocumentsModal(vehicleId); };
      toolbarRight.appendChild(ruhsatBtn);
      const printBtn = document.createElement('button');
      printBtn.type = 'button';
      printBtn.className = 'vehicle-print-btn';
      printBtn.title = 'Ta\u015F\u0131t Kart\u0131 Yazd\u0131r';
      printBtn.setAttribute('aria-label', 'Ta\u015F\u0131t Kart\u0131 Yazd\u0131r');
      printBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/></svg>`;
      printBtn.onclick = (e) => {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        if (isAndroidDevice() && typeof window.printVehicleCard !== 'function' && !window.__androidVehiclePrintWindow) {
          try {
            window.__androidVehiclePrintWindow = window.open('', '_blank');
          } catch (popupErr) {
            window.__androidVehiclePrintWindow = null;
          }
        }
        if (typeof window.printVehicleCard === 'function') {
          window.printVehicleCard(vehicle.id);
          return;
        }
        const originalText = printBtn.innerHTML;
        printBtn.innerHTML = '<span class="spin-animation" style="display:inline-block; width:16px; height:16px; border:2px solid currentColor; border-right-color:transparent; border-radius:50%; margin-right:4px;"></span> Yükleniyor...';
        printBtn.disabled = true;
        (window._printScriptPromise || loadScript('tasitlar-yazici.js?v=20260506.11')).then(function() {
          printBtn.innerHTML = originalText;
          printBtn.disabled = false;
          if (typeof window.printVehicleCard === 'function') {
            window.printVehicleCard(vehicle.id);
          } else {
            alert('Yazdırma modülü yüklenemedi!');
          }
        }).catch(function() {
          printBtn.innerHTML = originalText;
          printBtn.disabled = false;
          alert('Bağlantı hatası: Yazdırma modülü indirilemedi.');
        });
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

    const existingAssign = contentEl.querySelector('.detail-branch-assign');
    if (existingAssign) existingAssign.remove();

    // Modalı aç
    setVehiclesDetailUnderlay(true);
    modal.dataset.detailSignature = detailSignature;
    modal.style.display = 'flex';
    requestAnimationFrame(() => {
      modal.classList.add('active');
      requestAnimationFrame(() => {
        applyVehicleDetailSubeShrink();
        fitVehicleTextBoxes(modal);
      });
    });
    };
    var flushBeforeDetail = flushVehicleDetailNotesInlineSave();
    if (flushBeforeDetail && typeof flushBeforeDetail.then === 'function') {
      flushBeforeDetail.then(function() { runDetail(); }, function() { runDetail(); });
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
    if (isArchivedVehicleAssignmentLocked(vehicle)) {
      if (typeof showToast === 'function') showToast('Arşivdeki taşıtlarda kullanıcı/şube ataması yapılamaz.', 'error');
      else alert('Arşivdeki taşıtlarda kullanıcı/şube ataması yapılamaz.');
      return;
    }
    
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
        yeniSubeAdi: yeniSube?.name || '',
        surucu: getRecorderDisplayName()
      }
    });

    vehicle.branchId = normalizedBranchId;
    writeVehicles(vehicles);

    closeVehicleDetailModal();
    renderBranchDashboard();
  };

  // --- Tüm Modalları Kapat ---
  window.closeAllModals = function() {
    function doCloseAllModals() {
    const modalIds = [
      'vehicles-modal',
      'vehicle-detail-modal',
      'vehicle-history-modal',
      'event-menu-modal',
      DINAMIK_OLAY_MODAL_ID,
      'monthly-todo-modal'
    ];

    modalIds.forEach(id => {
      const modal = (id === 'vehicles-modal' ? DOM.vehiclesModal :
                    id === 'vehicle-detail-modal' ? DOM.vehicleDetailModal :
                    id === 'vehicle-history-modal' ? DOM.vehicleHistoryModal :
                    id === 'event-menu-modal' ? DOM.eventMenuModal :
                    id === DINAMIK_OLAY_MODAL_ID ? DOM.dinamikOlayModal :
                    id === 'monthly-todo-modal' ? document.getElementById('monthly-todo-modal') : null) || document.getElementById(id);
      if (modal) {
        resetModalState(modal);
        modal.classList.remove('active', 'open');
        modal.style.display = 'none';
      }
    });
    setVehiclesDetailUnderlay(false);
    window.currentDetailVehicleId = null;
    // iOS: print() çağrısı iframe.onload/setTimeout ile geç tetiklenebiliyor.
    // Kullanıcı başka ekrana giderken bekleyen print'in çalışmaması için token iptal ediyoruz.
    window.__ruhsatPrintToken = null;
    }
    var flushAllP = flushVehicleDetailNotesInlineSave();
    if (flushAllP && typeof flushAllP.then === 'function') {
      flushAllP.then(doCloseAllModals, doCloseAllModals);
    } else {
      doCloseAllModals();
    }
  };

  // --- Taşıt Detay Modalını Kapat ---
  window.closeVehicleDetailModal = function() {
    function doCloseVehicleDetailModal() {
      const modal = DOM.vehicleDetailModal;
      if (modal) {
        setVehiclesDetailUnderlay(false);
        resetModalState(modal);
        modal.classList.remove('active');
        delete modal.dataset.detailSignature;
        setTimeout(() => modal.style.display = 'none', 300);
      }
    }
    var flushP = flushVehicleDetailNotesInlineSave();
    if (flushP && typeof flushP.then === 'function') {
      flushP.then(doCloseVehicleDetailModal, doCloseVehicleDetailModal);
    } else {
      doCloseVehicleDetailModal();
    }
  };

  /** Taşıt detaydan çıkınca son liste bağlamına dön (araçtaki geri ok ile aynı). */
  function backFromVehicleDetailToListContext() {
    if (lastListContext && lastListContext.mode === 'archive') {
      openArchiveView();
    } else if (lastListContext && lastListContext.mode === 'branch') {
      openBranchList(lastListContext.branchId, lastListContext.branchName);
    } else {
      renderBranchDashboard();
    }
  }

  /** Üst X: tüm Taşıtlar modalını değil, sadece detayı kapatıp listeye döner. */
  window.backFromVehicleDetailModal = function() {
    closeVehicleDetailModal();
    backFromVehicleDetailToListContext();
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
          box.classList.add('open');
          input.value = '';
          /* iOS: odak aynı kullanıcı hareketinde (büyüteç tıkı) verilmeli; gecikme klavyeyi kaçırabiliyor */
          try { input.focus({ preventScroll: true }); } catch (e) { try { input.focus(); } catch (e2) {} }
          setTimeout(function() {
            try { input.focus({ preventScroll: true }); } catch (e) { try { input.focus(); } catch (e2) {} }
          }, 100);
      }
  };

  window.closeSearchBox = function(silent) {
      const box = getVSearchContainer();
      if (box) box.classList.remove('open');
      const input = getVSearchInput();
      if (input) input.value = '';

      if (silent === true) return;
      
      // Arama kapanınca listeyi resetle (eğer global aramadaysak dashboarda dön)
      if (currentView === 'dashboard' && modalContent && modalContent.dataset.renderScope === 'search-global') {
          renderBranchDashboard();
      } else if (currentView === 'list') {
          renderVehicles('');
      }
  };

  // Dış tıklama: arama açıkken kutu veya büyüteç dışına tıklanınca kapat
  document.addEventListener('click', function(e) {
      const box = getVSearchContainer();
      if (!box || !box.classList.contains('open')) return;
      const t = e.target;
      if (!t || typeof t.closest !== 'function') return;
      if (t.closest('#v-search-container') || t.closest('.search-toggle-btn')) return;
      if (
          t.closest('.list-item') ||
          t.closest('.card') ||
          t.closest('.branch-card') ||
          t.closest('[data-vehicle-id]')
      ) return;
      closeSearchBox();
  });
  // Mobil (iOS): capture fazında pointer — liste/boş alana dokununca click güvenilir olmayabiliyor
  function isMobileVSearchViewport() {
      return (typeof window.matchMedia === 'function')
          ? window.matchMedia('(max-width: 640px)').matches
          : window.innerWidth <= 640;
  }
  function onVSearchOutsidePointer(e) {
      if (!isMobileVSearchViewport()) return;
      const box = getVSearchContainer();
      if (!box || !box.classList.contains('open')) return;
      const t = e.target;
      if (!t || typeof t.closest !== 'function') return;
      if (t.closest('#v-search-container') || t.closest('.search-toggle-btn')) return;
      // Mobilde sonuç satırına dokunurken pointerdown capture aramayı erken kapatıp
      // click ile araç açmayı bozmasın.
      if (
          t.closest('.list-item') ||
          t.closest('.card') ||
          t.closest('.branch-card') ||
          t.closest('[data-vehicle-id]')
      ) return;
      closeSearchBox();
  }
  document.addEventListener('pointerdown', onVSearchOutsidePointer, true);
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
          closeSearchBox(true);
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
          // Genel arama: sonuç listesi gösterilir (dashboard yerine).
          if (!val) {
              renderBranchDashboard();
              return;
          }
          const all = readVehicles();
          const q = normalizeVehicleSearchText(val);
          let filtered = all.filter(v => vehicleMatchesSearchQuery(v, q));
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
                  <h4>${escapeHtml(formatBrandModel(v.brandModel || '-'))}</h4>
                  <span>${v.year} • ${v.tahsisKisi || 'Boşta'}</span>
                </div>
              </div>
          `}).join('') + `</div>`;
          
          modalContent.innerHTML = html;
          modalContent.dataset.renderScope = 'search-global';
          modalContent.dataset.renderSignature = q + '__' + filtered.length;
          syncVehiclesListModeClass(false);
      }
  };
  window.handleSearch = (typeof window.debounce === 'function') ? window.debounce(handleSearchImpl, 200) : handleSearchImpl;


  // Şanzıman menüsünü dış tıklamada kapat – modal içi stopPropagation’ı aşmak için
  function onTransmissionCloseCheck(e) {
      var transDd = getVTransmissionDropdown();
      if (!transDd || !transDd.classList.contains('open')) return;
      var transWrap = e.target.closest('.v-transmission-wrap');
      if (transWrap && transWrap.contains(e.target)) return;
      if (transDd.contains(e.target)) return;
      closeTransmissionMenu();
  }
  document.addEventListener('mousedown', onTransmissionCloseCheck, true);
  document.addEventListener('click', onTransmissionCloseCheck, true);
  if (DOM.vehiclesModal && !DOM.vehiclesModal._transmissionCloseBound) {
      DOM.vehiclesModal._transmissionCloseBound = true;
      DOM.vehiclesModal.addEventListener('mousedown', onTransmissionCloseCheck, true);
      DOM.vehiclesModal.addEventListener('click', onTransmissionCloseCheck, true);
  }

  // Sütun başlığına tıklanınca sıralama yap
  window.handleColumnSort = function(column) {
    if (touchColumnDrag.suppressClickUntil > Date.now()) return;
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
      // PERFORMANS: Sort döngüsü içinde find() (O(N log N * M)) yapmak yerine
      // şubeleri önden tek seferlik bir objeye (O(M)) mapliyoruz.
      const branchNameCache = {};
      if (sortColumn === 'branch') {
          const branches = readBranches() || [];
          for (let i = 0; i < branches.length; i++) {
              branchNameCache[String(branches[i].id)] = (branches[i].name || '').toLowerCase();
          }
      }
      const userMapForSort = {};
      if (sortColumn === 'user') {
          const users = window.appData && Array.isArray(window.appData.users) ? window.appData.users : [];
          for (let ui = 0; ui < users.length; ui++) {
              const u = users[ui];
              userMapForSort[String(u.id)] = u;
          }
      }
      const getBranchName = (branchId) => {
          if (!branchId) return 'zzz_tahsis_edilmemis';
          return branchNameCache[String(branchId)] || 'zzz_unknown';
      };
      const getUserNameRawForSort = function(v) {
          const assignedUser = v.assignedUserId ? userMapForSort[String(v.assignedUserId)] : null;
          return (assignedUser && (assignedUser.name || assignedUser.isim || assignedUser.fullName)) || v.tahsisKisi || '-';
      };

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

              case 'transmission':
                  aVal = getTransmissionLabel(a.transmission).toLowerCase();
                  bVal = getTransmissionLabel(b.transmission).toLowerCase();
                  return aVal.localeCompare(bVal) * dir;
                  
              case 'branch':
                  aVal = getBranchName(a.branchId);
                  bVal = getBranchName(b.branchId);
                  return aVal.localeCompare(bVal) * dir;

              case 'user': {
                  const rawA = getUserNameRawForSort(a);
                  const rawB = getUserNameRawForSort(b);
                  const emptyA = !String(rawA).trim() || String(rawA).trim() === '-';
                  const emptyB = !String(rawB).trim() || String(rawB).trim() === '-';
                  if (emptyA && emptyB) return 0;
                  if (emptyA) return 1;
                  if (emptyB) return -1;
                  const sortA = String(formatAdSoyad(rawA)).trim();
                  const sortB = String(formatAdSoyad(rawB)).trim();
                  return sortA.localeCompare(sortB, 'tr', { sensitivity: 'base' }) * dir;
              }
                  
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

  function isArchivedVehicleAssignmentLocked(vehicle) {
    return !!(vehicle && (vehicle.satildiMi === true || vehicle.arsiv === true));
  }

  function getEgzozMuayeneState(vehicle) {
    const rawDate = vehicle && vehicle.egzozMuayeneDate != null ? String(vehicle.egzozMuayeneDate).trim() : '';
    if (!rawDate) {
      return {
        state: 'missing',
        date: '',
        days: null,
        warningClass: 'date-warning-red'
      };
    }

    const warning = checkDateWarnings(rawDate);
    if (warning.class === 'date-warning-red') {
      return {
        state: 'expired',
        date: rawDate,
        days: warning.days,
        warningClass: 'date-warning-red'
      };
    }

    if (warning.class === 'date-warning-orange') {
      return {
        state: 'approaching',
        date: rawDate,
        days: warning.days,
        warningClass: 'date-warning-orange'
      };
    }

    return {
      state: 'valid',
      date: rawDate,
      days: warning.days,
      warningClass: ''
    };
  }

  function isEgzozMuayeneCritical(vehicle) {
    const egzozState = getEgzozMuayeneState(vehicle);
    return egzozState.warningClass === 'date-warning-red';
  }

  /**
   * Taşıtlar modalı liste/kart — kalıcı tarih uyarısı (bildirim okundu ile ilgisiz).
   * Yalnızca araçtaki tarih alanları + window.checkDateWarnings (script-core ile aynı eşikler).
   * Okundu/okunmadı, notification-read, medisa_notif_read_keys_v1 vb. kullanılmaz.
   * Öncelik: kırmızı > turuncu > normal. Bir tarih düzeltilince diğerleri hâlâ riskteyse en yüksek severity kalır.
   * @returns {string} '' | ' vehicle-date-warning-red' | ' vehicle-date-warning-orange'
   */
  function getVehicleDateSeverityClass(vehicle) {
    if (!vehicle || typeof vehicle !== 'object') return '';
    const dates = [
      vehicle.sigortaDate,
      vehicle.kaskoDate,
      vehicle.muayeneDate
    ].filter(function(d) { return d != null && String(d).trim() !== ''; });

    let hasRed = false;
    let hasOrange = false;

    for (let i = 0; i < dates.length; i++) {
      const w = checkDateWarnings(dates[i]);
      if (w.class === 'date-warning-red') hasRed = true;
      else if (w.class === 'date-warning-orange') hasOrange = true;
    }

    const egzozState = getEgzozMuayeneState(vehicle);
    if (egzozState.warningClass === 'date-warning-red') hasRed = true;
    else if (egzozState.warningClass === 'date-warning-orange') hasOrange = true;

    if (hasRed) return ' vehicle-date-warning-red';
    if (hasOrange) return ' vehicle-date-warning-orange';
    return '';
  }

  /**
   * Vade tarihinin düştüğü ay: ham alan → window.parseVehicleDateRawToIso (data-manager/kayıt ile aynı kurallar).
   */
  function rawVehicleDateExpiryInCurrentCalendarMonth(rawDate) {
    if (rawDate == null || String(rawDate).trim() === '') return false;
    if (typeof window.parseVehicleDateRawToIso !== 'function') return false;
    var iso = window.parseVehicleDateRawToIso(rawDate);
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
    var p = iso.split('-');
    var y = parseInt(p[0], 10);
    var moZero = parseInt(p[1], 10) - 1;
    var now = new Date();
    return moZero === now.getMonth() && y === now.getFullYear();
  }

  /** Geçmiş (checkDateWarnings.days < 0) veya vade tarihi bu takvim ayı içinde. */
  function monthlyOperationalDateTaskFilterPasses(rawDate, warning) {
    if (rawDate == null || String(rawDate).trim() === '') return false;
    if (!warning || typeof warning !== 'object') return false;
    if (typeof warning.days === 'number' && warning.days < 0) return true;
    if (typeof warning.days === 'number' && warning.days >= 0 && rawVehicleDateExpiryInCurrentCalendarMonth(rawDate)) return true;
    return false;
  }

  var _vehicleDateTasksCache = null;
  /** Aylık modal: ana iş parçacığında tam tarama yapmadan önbelleği okumak için (null = henüz doldurulmadı). */
  function peekVehicleDateTasksCache() {
    return _vehicleDateTasksCache;
  }
  var _monthlyTodoModalBodyFillScheduled = false;

  function invalidateVehicleDateTasksCache() {
    _vehicleDateTasksCache = null;
  }
  window.invalidateVehicleDateTasksCache = invalidateVehicleDateTasksCache;

  function computeMuayeneWarningForOperationalScan(vehicle) {
    if (!vehicle || !vehicle.muayeneDate) return null;
    var warning = checkDateWarnings(vehicle.muayeneDate);
    if (isEgzozMuayeneCritical(vehicle)) {
      warning.class = 'date-warning-red';
      if (typeof warning.days !== 'number') warning.days = -1;
    }
    return warning;
  }

  /**
   * Tek tarama ile tarih bildirimleri ve/veya aylık önbellek.
   * @param {Array|null} notificationsArray — bildirim kuyruğu (full bildirimi senaryosu).
   * @param {'full'|'monthly-cache-only'} scanMode — `full`: bildirim + önbellek (updateNotifications ile birebir); `monthly-cache-only`: yalnız önbellek, bildirime dokunma.
   */
  function runVehicleDateOperationalScan(notificationsArray, scanMode) {
    var mode = scanMode === 'monthly-cache-only' ? 'monthly-cache-only' : 'full';
    var attachNotif = mode === 'full' && Array.isArray(notificationsArray);

    var monthly = [];
    var vehicles = readVehicles();

    vehicles.forEach(function(vehicle) {
      if (!vehicle || vehicle.satildiMi) return;
      if (vehicle.arsiv === true) return;

      var plate = vehicle.plate || '-';
      var brandModel = formatBrandModel(vehicle.brandModel || '-');

      if (vehicle.sigortaDate) {
        var wSig = checkDateWarnings(vehicle.sigortaDate);
        if (monthlyOperationalDateTaskFilterPasses(vehicle.sigortaDate, wSig)) {
          monthly.push({
            vehicle: vehicle,
            type: 'Sigorta',
            field: 'sigortaDate',
            date: vehicle.sigortaDate,
            days: wSig.days,
            status: (typeof wSig.days === 'number' && wSig.days < 0) ? 'past' : 'upcoming',
            warningClass: wSig.class
          });
        }
        if (attachNotif && wSig.class) {
          var ds = wSig.days;
          notificationsArray.push({
            type: 'sigorta',
            vehicleId: vehicle.id,
            plate: plate,
            brandModel: brandModel,
            date: vehicle.sigortaDate,
            days: ds,
            warningClass: wSig.class,
            status: ds < 0 ? 'geçmiş' : ds <= 3 ? 'çok yakın' : 'yaklaşıyor'
          });
        }
      }

      if (vehicle.kaskoDate) {
        var wKas = checkDateWarnings(vehicle.kaskoDate);
        if (monthlyOperationalDateTaskFilterPasses(vehicle.kaskoDate, wKas)) {
          monthly.push({
            vehicle: vehicle,
            type: 'Kasko',
            field: 'kaskoDate',
            date: vehicle.kaskoDate,
            days: wKas.days,
            status: (typeof wKas.days === 'number' && wKas.days < 0) ? 'past' : 'upcoming',
            warningClass: wKas.class
          });
        }
        if (attachNotif && wKas.class) {
          var dk = wKas.days;
          notificationsArray.push({
            type: 'kasko',
            vehicleId: vehicle.id,
            plate: plate,
            brandModel: brandModel,
            date: vehicle.kaskoDate,
            days: dk,
            warningClass: wKas.class,
            status: dk < 0 ? 'geçmiş' : dk <= 3 ? 'çok yakın' : 'yaklaşıyor'
          });
        }
      }

      if (vehicle.muayeneDate) {
        var wM = computeMuayeneWarningForOperationalScan(vehicle);
        if (wM && monthlyOperationalDateTaskFilterPasses(vehicle.muayeneDate, wM)) {
          monthly.push({
            vehicle: vehicle,
            type: 'Muayene',
            field: 'muayeneDate',
            date: vehicle.muayeneDate,
            days: wM.days,
            status: (typeof wM.days === 'number' && wM.days < 0) ? 'past' : 'upcoming',
            warningClass: wM.class
          });
        }
        if (attachNotif && wM && wM.class) {
          var dm = wM.days;
          notificationsArray.push({
            type: 'muayene',
            vehicleId: vehicle.id,
            plate: plate,
            brandModel: brandModel,
            date: vehicle.muayeneDate,
            days: dm,
            warningClass: wM.class,
            status: dm < 0 ? 'geçmiş' : dm <= 3 ? 'çok yakın' : 'yaklaşıyor'
          });
        }
      }

      var egzozState = getEgzozMuayeneState(vehicle);
      if (egzozState.state === 'missing') {
        monthly.push({
          vehicle: vehicle,
          type: 'Egzoz Muayene',
          field: 'egzozMuayeneDate',
          date: '',
          days: -1,
          status: 'past',
          warningClass: 'date-warning-red'
        });
      } else if (egzozState.date) {
        var wEgz = checkDateWarnings(egzozState.date);
        if (monthlyOperationalDateTaskFilterPasses(egzozState.date, wEgz)) {
          monthly.push({
            vehicle: vehicle,
            type: 'Egzoz Muayene',
            field: 'egzozMuayeneDate',
            date: egzozState.date,
            days: wEgz.days,
            status: (typeof wEgz.days === 'number' && wEgz.days < 0) ? 'past' : 'upcoming',
            warningClass: wEgz.class
          });
        }
      }

      if (attachNotif && egzozState.warningClass) {
        var egDays = typeof egzozState.days === 'number' ? egzozState.days : -1;
        var egStatus = egzozState.state === 'missing'
          ? 'eksik'
          : (egDays < 0 ? 'geçmiş' : egDays <= 3 ? 'çok yakın' : 'yaklaşıyor');
        notificationsArray.push({
          type: 'egzoz',
          vehicleId: vehicle.id,
          plate: plate,
          brandModel: brandModel,
          date: egzozState.date || 'missing',
          days: egDays,
          warningClass: egzozState.warningClass,
          status: egStatus,
          missing: egzozState.state === 'missing'
        });
      }
    });

    monthly.sort(function(a, b) {
      var da = typeof a.days === 'number' ? a.days : 9999;
      var db = typeof b.days === 'number' ? b.days : 9999;
      var aPast = da < 0;
      var bPast = db < 0;
      if (aPast !== bPast) return aPast ? -1 : 1;
      return da - db;
    });

    _vehicleDateTasksCache = monthly;
  }

  window.getVehicleDateTasks = function() {
    if (_vehicleDateTasksCache === null) {
      runVehicleDateOperationalScan(null, 'monthly-cache-only');
    }
    return _vehicleDateTasksCache || [];
  };

  function updateMonthlyTodoHeaderBadge() {
    var btn = document.getElementById('monthly-todo-header-btn');
    var badge = btn ? btn.querySelector('.monthly-todo-header-badge') : null;
    if (!btn || !badge) return;
    var list = (typeof window.getVehicleDateTasks === 'function') ? window.getVehicleDateTasks() : [];
    var n = list.length;
    if (n <= 0) {
      badge.textContent = '';
      badge.setAttribute('hidden', 'hidden');
      badge.setAttribute('aria-hidden', 'true');
      btn.setAttribute('aria-label', 'Bu ay yapılacaklar');
      return;
    }
    badge.textContent = String(n);
    badge.removeAttribute('hidden');
    badge.setAttribute('aria-hidden', 'false');
    btn.setAttribute('aria-label', 'Bu ay yapılacaklar, ' + String(n) + ' işlem');
  }

  function getMonthlyTodoKullaniciLabel(vehicle, userMapById) {
    if (!vehicle) return '-';
    var assignedUser = vehicle.assignedUserId ? userMapById[String(vehicle.assignedUserId)] : null;
    var raw = (assignedUser && (assignedUser.name || assignedUser.isim || assignedUser.fullName))
      || vehicle.tahsisKisi
      || '';
    if (!String(raw).trim()) return '-';
    return formatAdSoyad(String(raw));
  }

  function monthlyTodoTaskIsoNormalized(task) {
    if (!task || task.date == null || String(task.date).trim() === '') return null;
    if (typeof window.parseVehicleDateRawToIso !== 'function') return null;
    return window.parseVehicleDateRawToIso(task.date);
  }

  function monthlyTodoMuayeneEgzozSameDatePair(a, b) {
    var idA = a.vehicle && a.vehicle.id != null ? String(a.vehicle.id) : '';
    var idB = b.vehicle && b.vehicle.id != null ? String(b.vehicle.id) : '';
    if (!idA || idA !== idB) return false;
    var isoA = monthlyTodoTaskIsoNormalized(a);
    var isoB = monthlyTodoTaskIsoNormalized(b);
    if (!isoA || !isoB || isoA !== isoB) return false;
    var ta = String(a.type || '').trim();
    var tb = String(b.type || '').trim();
    return (ta === 'Muayene' && tb === 'Egzoz Muayene') || (ta === 'Egzoz Muayene' && tb === 'Muayene');
  }

  function monthlyTodoMergeMuayeneEgzoz(a, b) {
    var da = typeof a.days === 'number' ? a.days : null;
    var db = typeof b.days === 'number' ? b.days : null;
    var days = da != null && db != null ? Math.min(da, db) : (da != null ? da : db);
    var past = String(a.status) === 'past' || String(b.status) === 'past' || (typeof days === 'number' && days < 0);
    var warningClass = '';
    if (a.warningClass === 'date-warning-red' || b.warningClass === 'date-warning-red') warningClass = 'date-warning-red';
    else if (a.warningClass === 'date-warning-orange' || b.warningClass === 'date-warning-orange') warningClass = 'date-warning-orange';
    else warningClass = a.warningClass || b.warningClass || '';
    var dateRaw = a.date != null && String(a.date).trim() ? a.date : b.date;
    return {
      vehicle: a.vehicle,
      type: 'Muayene + Egzoz',
      field: 'muayeneDate+egzozMuayeneDate',
      date: dateRaw,
      days: days,
      status: past ? 'past' : 'upcoming',
      warningClass: warningClass
    };
  }

  function buildMonthlyTodoMergedDisplayTasks(tasks) {
    var used = tasks.map(function() { return false; });
    var out = [];
    for (var i = 0; i < tasks.length; i++) {
      if (used[i]) continue;
      var pairIdx = -1;
      for (var j = i + 1; j < tasks.length; j++) {
        if (used[j]) continue;
        if (monthlyTodoMuayeneEgzozSameDatePair(tasks[i], tasks[j])) {
          pairIdx = j;
          break;
        }
      }
      if (pairIdx >= 0) {
        used[pairIdx] = true;
        out.push(monthlyTodoMergeMuayeneEgzoz(tasks[i], tasks[pairIdx]));
      } else {
        out.push(tasks[i]);
      }
    }
    return out;
  }

  function fillMonthlyTodoModalBody(bodyEl, tasksArray) {
    var typeDescriptionMap = {
      'Sigorta': 'Trafik Sigortasının',
      'Kasko': 'Kasko Poliçesinin',
      'Muayene': 'Taşıt Muayenesinin',
      'Egzoz Muayene': 'Egzoz Muayenesinin',
      'Muayene + Egzoz': 'Taşıt Muayenesi ve Egzoz Muayenesinin'
    };
    var users = readUsers();
    var userMap = {};
    users.forEach(function(u) {
      if (u && u.id != null) userMap[String(u.id)] = u;
    });
    var displayTasks = buildMonthlyTodoMergedDisplayTasks(tasksArray);
    if (!displayTasks.length) {
      bodyEl.innerHTML = '<div class="monthly-todo-empty">Bu dönem için listelenecek tarih işlemi yok.</div>';
      return;
    }
    var html = '<div class="monthly-todo-sheet">';
    html += '<div class="monthly-todo-table-outer">';
    html += '<div class="monthly-todo-table-inner">';
    html += '<div class="monthly-todo-col-header" aria-hidden="true">';
    html += '<span class="monthly-todo-col-h">PLAKA</span>';
    html += '<span class="monthly-todo-col-h">TAŞIT / KULLANICI</span>';
    html += '<span class="monthly-todo-col-h">İŞLEM</span>';
    html += '</div>';
    html += '<div class="monthly-todo-list-scroll" role="list">';
    displayTasks.forEach(function(t) {
      var v = t.vehicle || {};
      var vid = v.id != null ? String(v.id) : '';
      var plate = escapeHtml(v.plate || '-');
      var bm = escapeHtml(formatBrandModel(v.brandModel || '-'));
      var kul = escapeHtml(getMonthlyTodoKullaniciLabel(v, userMap));
      var typeText = String(t.type || '').trim();
      var dateRaw = t.date != null ? String(t.date).trim() : '';
      var dateShown = '—';
      if (dateRaw) {
        if (typeof window.formatDateShort === 'function') dateShown = escapeHtml(window.formatDateShort(dateRaw));
        else dateShown = escapeHtml(dateRaw);
      }
      var warningClass = String(t.warningClass || '');
      var past = String(t.status) === 'past' || (typeof t.days === 'number' && t.days < 0);
      var daysVal = typeof t.days === 'number' ? t.days : null;
      var descriptionPrefix = typeDescriptionMap[typeText] || typeText || 'İlgili İşlemin';
      var descriptionText = '';
      var lineMain = '';
      var hasDateLine = false;
      if (!dateRaw || daysVal === null) {
        descriptionText = descriptionPrefix + ' Geçerlilik Süresi Eksiktir.';
      } else if (daysVal < 0) {
        lineMain = descriptionPrefix + ' Geçerlilik Süresi ' + Math.abs(daysVal) + ' Gün Önce Bitmiştir.';
        hasDateLine = true;
      } else if (daysVal === 0) {
        lineMain = descriptionPrefix + ' Geçerlilik Süresi Bugün Bitecektir.';
        hasDateLine = true;
      } else {
        lineMain = descriptionPrefix + ' Geçerlilik Süresi ' + daysVal + ' Gün Sonra Bitecektir.';
        hasDateLine = true;
      }
      var rowTone = '';
      if (past || warningClass === 'date-warning-red') {
        rowTone = ' monthly-todo-task-row--past';
      } else if (warningClass === 'date-warning-orange') {
        rowTone = ' monthly-todo-task-row--upcoming';
      }
      html += '<button type="button" class="monthly-todo-task-row' + rowTone + '" data-vehicle-id="' + escapeAttr(vid) + '" role="listitem">';
      html += '<span class="monthly-todo-cell monthly-todo-plate">' + plate + '</span>';
      html += '<span class="monthly-todo-middle">';
      html += '<span class="monthly-todo-brand">' + bm + '</span>';
      html += '<span class="monthly-todo-user">' + kul + '</span>';
      html += '</span>';
      html += '<span class="monthly-todo-right">';
      if (hasDateLine) {
        html += '<span class="monthly-todo-type">' + escapeHtml(lineMain) + '<br>Bitiş Tarihi: <span class="monthly-todo-description-date">' + dateShown + '</span></span>';
      } else {
        html += '<span class="monthly-todo-type">' + escapeHtml(descriptionText) + '</span>';
      }
      html += '</span>';
      html += '</button>';
    });
    html += '</div>';
    html += '</div></div></div>';
    bodyEl.innerHTML = html;
  }

  function renderMonthlyTodoModalContent() {
    var root = document.getElementById('monthly-todo-modal');
    var bodyEl = root ? root.querySelector('.monthly-todo-modal-body') : null;
    if (!bodyEl) return;
    var cached = peekVehicleDateTasksCache();
    if (cached !== null) {
      fillMonthlyTodoModalBody(bodyEl, cached);
      return;
    }
    bodyEl.innerHTML = '<div class="monthly-todo-empty">Yükleniyor…</div>';
    if (_monthlyTodoModalBodyFillScheduled) return;
    _monthlyTodoModalBodyFillScheduled = true;
    requestAnimationFrame(function() {
      _monthlyTodoModalBodyFillScheduled = false;
      var modal = document.getElementById('monthly-todo-modal');
      if (!modal || modal.style.display === 'none') return;
      var be = modal.querySelector('.monthly-todo-modal-body');
      if (!be) return;
      var tasks = window.getVehicleDateTasks();
      fillMonthlyTodoModalBody(be, tasks);
    });
  }

  function bindMonthlyTodoModalDelegatedInteraction(modalEl) {
    if (!modalEl || modalEl._medisaMonthlyTodoModalDelegatedBound) return;
    modalEl._medisaMonthlyTodoModalDelegatedBound = true;
    function onModalPointerDown(ev) {
      var target = ev.target;
      if (!target || typeof target.closest !== 'function') return;
      var insidePanel = target.closest('.monthly-todo-modal-container');
      if (!insidePanel || !modalEl.contains(insidePanel)) {
        closeMonthlyTodoModal();
        return;
      }
      var row = target.closest('.monthly-todo-task-row');
      if (!row || !modalEl.contains(row)) return;
      var vid = row.getAttribute('data-vehicle-id');
      if (!vid) return;
      ev.preventDefault();
      closeMonthlyTodoModal();
      if (typeof window.showVehicleDetail === 'function') {
        if (!lastListContext) {
          lastListContext = { mode: 'branch', branchId: 'all', branchName: 'Taşıtlar' };
        }
        window.showVehicleDetail(vid);
      }
    }
    modalEl.addEventListener('click', onModalPointerDown);
  }

  function wireMonthlyTodoModalCloseUiOnce(modalEl) {
    if (!modalEl || modalEl._medisaMonthlyTodoCloseUiBound) return;
    var closeBtn = modalEl.querySelector('button.modal-close.monthly-todo-modal-close');
    if (!closeBtn) return;
    modalEl._medisaMonthlyTodoCloseUiBound = true;
    closeBtn.addEventListener('click', function(ev) {
      ev.preventDefault();
      closeMonthlyTodoModal();
    });
  }

  function initMonthlyTodoHeaderButtonOnce() {
    var btn = document.getElementById('monthly-todo-header-btn');
    if (!btn || btn._medisaMonthlyTodoHeaderBound) return;
    btn._medisaMonthlyTodoHeaderBound = true;
    btn.addEventListener('click', function(ev) {
      ev.preventDefault();
      ev.stopPropagation();
      openMonthlyTodoModal();
    });
  }

  initMonthlyTodoHeaderButtonOnce();

  function getMonthlyTodoTitleText() {
    var monthName = new Date().toLocaleDateString('tr-TR', { month: 'long' });
    monthName = monthName ? monthName.charAt(0).toUpperCase() + monthName.slice(1) : '';
    return (monthName || 'Bu Ay') + ' Ayı Hatırlatmaları';
  }

  function ensureMonthlyTodoModalMounted() {
    var el = document.getElementById('monthly-todo-modal');
    if (!el) {
      el = document.createElement('div');
      el.id = 'monthly-todo-modal';
      el.className = 'modal-overlay tasitlar-modal-overlay';
      el.setAttribute('data-monthly-todo-overlay', '1');
      el.innerHTML =
        '<div class="modal-container monthly-todo-modal-container">' +
          '<div class="modal-header">' +
            '<h2>' + escapeHtml(getMonthlyTodoTitleText()) + '</h2>' +
            '<button type="button" class="modal-close monthly-todo-modal-close" aria-label="Kapat">' +
              '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>' +
            '</button>' +
          '</div>' +
          '<div class="modal-body monthly-todo-modal-body">' +
            '<div class="monthly-todo-empty">Yükleniyor…</div>' +
          '</div>' +
        '</div>';
      document.body.appendChild(el);
    }
    bindMonthlyTodoModalDelegatedInteraction(el);
    wireMonthlyTodoModalCloseUiOnce(el);
    return el;
  }

  function openMonthlyTodoModal() {
    var modal = ensureMonthlyTodoModalMounted();
    modal.style.display = 'flex';
    modal.classList.add('active');
    modal.classList.add('open');
    if (typeof window.updateFooterDim === 'function') window.updateFooterDim();
    renderMonthlyTodoModalContent();
    requestAnimationFrame(function() {
      if (typeof window.updateFooterDim === 'function') window.updateFooterDim();
    });
  }

  function closeMonthlyTodoModal() {
    var modal = document.getElementById('monthly-todo-modal');
    if (!modal) return;
    modal.classList.remove('active', 'open');
    setTimeout(function() {
      modal.style.display = 'none';
      if (typeof window.updateFooterDim === 'function') window.updateFooterDim();
    }, 300);
  }
  window.addEventListener('dataLoaded', function() {
    invalidateVehicleDateTasksCache();
  });

  function formatDateForDisplay(dateStr) {
    if (!dateStr) return '';
    const raw = String(dateStr).trim();
    if (/\d{4}-\d{2}-\d{2}[T ]\d{2}/.test(raw)) {
      const parsedIso = new Date(raw);
      if (!isNaN(parsedIso.getTime())) {
        const d = String(parsedIso.getDate()).padStart(2, '0');
        const m = String(parsedIso.getMonth() + 1).padStart(2, '0');
        const y = String(parsedIso.getFullYear());
        const hh = String(parsedIso.getHours()).padStart(2, '0');
        const min = String(parsedIso.getMinutes()).padStart(2, '0');
        return d + '/' + m + '/' + y + ' ' + hh + ':' + min;
      }
    }
    if (typeof window.formatDateShort === 'function') {
      const formatted = window.formatDateShort(dateStr);
      if (formatted) {
        const formattedStr = String(formatted).trim();
        if (formattedStr && (formattedStr !== raw || /[./-]/.test(formattedStr))) {
          return formattedStr;
        }
      }
    }
    const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
    const compactIso = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (compactIso) return `${compactIso[3]}/${compactIso[2]}/${compactIso[1]}`;
    const compactTr = raw.match(/^(\d{2})(\d{2})(\d{4})$/);
    if (compactTr) return `${compactTr[1]}/${compactTr[2]}/${compactTr[3]}`;
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

  /** Taşıt detay modalı: tarihler gg.aa.yyyy (nokta ayırıcı) */
  function formatDateForDetailModal(dateStr) {
    const s = formatDateForDisplay(dateStr);
    if (!s) return '';
    return s.replace(/\//g, '.');
  }

  function medisaNotificationTalepSortMs(str) {
    const t = Date.parse(String(str || '').trim());
    if (!isNaN(t)) return t;
    const d = new Date(str);
    if (!isNaN(d.getTime())) return d.getTime();
    return 0;
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
      'otomobil': 'Otomobil',
      'minivan': 'Küçük Ticari',
      'kamyon': 'Büyük Ticari'
    };
    return labels[type] || type;
  }

  window.getVehicleTypeLabel = getVehicleTypeLabel;

  // NOT: Kasko Excel işlemleri "data-service.js" dosyasına taşınmıştır.
  // NOT: Yazdırma (Taşıt Kartı Print) işlemleri "tasitlar-yazici.js" dosyasına taşınmıştır.

  /**
   * Sol kolon render (Taşıt özellikleri + Kaporta Şeması)
   */
  function renderVehicleDetailLeft(vehicle) {
  const leftEl = DOM.vehicleDetailLeft;
  if (!leftEl) return;

  let html = '';

  // Kullanıcı
  const users = readUsers();
  const assignmentLocked = isArchivedVehicleAssignmentLocked(vehicle);
  const assignedUserId = vehicle.assignedUserId || '';
  const assignedUser = assignedUserId ? users.find(u => u.id === assignedUserId) : null;
  const assignedUserName = (assignedUser && assignedUser.name) ? assignedUser.name : (vehicle.tahsisKisi || '');
  if (assignedUserId || (assignedUserName && assignedUserName.trim())) {
      const displayName = escapeHtml(formatAdSoyad(assignedUserName)).replace(/ /g, '&nbsp;');
      html += `<div class="detail-row detail-row-inline"><div class="detail-row-header"><span class="detail-row-label">Kullanıcı</span><span class="detail-row-colon">:</span></div><span class="detail-row-value detail-user-value"> ${displayName}</span></div>`;
  } else if (assignmentLocked) {
      html += `<div class="detail-row detail-row-inline"><div class="detail-row-header"><span class="detail-row-label">Kullanıcı</span><span class="detail-row-colon">:</span></div><span class="detail-row-value detail-user-value"> -</span></div>`;
  } else {
      html += `<div class="detail-row detail-row-inline"><div class="detail-row-header"><span class="detail-row-label">Kullanıcı</span><span class="detail-row-colon">:</span></div><span class="detail-row-value detail-user-empty" onclick="event.stopPropagation(); window.medisaOpenEventModalFromVehicleDetailUi('kullanici');"> Kullanıcı Eklemek İçin +</span></div>`;
  }

  // Şube
  const branches = readBranches();
  const branchId = vehicle.branchId || '';
  const branchName = branchId ?
      (branches.find(b => String(b.id) === String(branchId))?.name || '') :
      'Tahsis Edilmemi\u015F';
  const subeValueClass = branchId ? 'detail-row-value detail-row-value-sube' : 'detail-row-value detail-row-value-sube detail-sube-unassigned';
  html += `<div class="detail-row detail-row-inline"><div class="detail-row-header"><span class="detail-row-label">\u015Eube</span><span class="detail-row-colon">:</span></div><span class="${subeValueClass}"> ${escapeHtml(branchName)}</span></div>`;

  // Taşıt Tipi
  const vehicleType = vehicle.vehicleType || '';
  html += `<div class="detail-row detail-row-inline"><div class="detail-row-header"><span class="detail-row-label">Ta\u015F\u0131t Tipi</span><span class="detail-row-colon">:</span></div><span class="detail-row-value"> ${escapeHtml(getVehicleTypeLabel(vehicleType))}</span></div>`;

  // Üretim Yılı
  const year = vehicle.year || '';
  html += `<div class="detail-row detail-row-inline"><div class="detail-row-header"><span class="detail-row-label">\u00DCretim Y\u0131l\u0131</span><span class="detail-row-colon">:</span></div><span class="detail-row-value"> ${escapeHtml(year)}</span></div>`;

  // Tescil Tarihi
  const tescilTarihi = vehicle.tescilTarihi || '';
  const tescilDisplay = tescilTarihi ? formatDateForDetailModal(tescilTarihi) : '';
  html += `<div class="detail-row detail-row-inline"><div class="detail-row-header"><span class="detail-row-label">Tescil Tarihi</span><span class="detail-row-colon">:</span></div><span class="detail-row-value"> ${escapeHtml(tescilDisplay || '-')}</span></div>`;

  // Km
  if (vehicle.guncelKm) {
      const formattedKm = formatNumber(vehicle.guncelKm);
      html += `<div class="detail-row detail-row-inline"><div class="detail-row-header"><span class="detail-row-label">Km</span><span class="detail-row-colon">:</span></div><span class="detail-row-value"> ${escapeHtml(formattedKm)}</span></div>`;
  } else {
      const km = vehicle.km || '';
      const formattedKm = km ? formatNumber(km) : '';
      html += `<div class="detail-row detail-row-inline"><div class="detail-row-header"><span class="detail-row-label">Km (Al\u0131nd\u0131\u011F\u0131 Tarih)</span><span class="detail-row-colon">:</span></div><span class="detail-row-value"> ${escapeHtml(formattedKm || '-')}</span></div>`;
  }

  // Şanzıman
  const transmissionLabel = getTransmissionLabel(vehicle.transmission);
  html += `<div class="detail-row detail-row-inline"><div class="detail-row-header"><span class="detail-row-label">\u015Eanz\u0131man</span><span class="detail-row-colon">:</span></div><span class="detail-row-value"> ${escapeHtml(transmissionLabel)}</span></div>`;

  // Alım Bedeli
  const price = vehicle.price || '';
  html += `<div class="detail-row detail-row-inline"><div class="detail-row-header"><span class="detail-row-label">Al\u0131m Bedeli</span><span class="detail-row-colon">:</span></div><span class="detail-row-value"> ${escapeHtml(price || '-')}</span></div>`;

  // Tramer Kaydı
  if (vehicle.tramer === 'var' && vehicle.tramerRecords && vehicle.tramerRecords.length > 0) {
      html += `<div class="detail-row detail-row-block"><div class="detail-row-header"><span class="detail-row-label">Tramer Kaydı</span><span class="detail-row-colon">:</span></div><span class="detail-row-value"> `;
      vehicle.tramerRecords.forEach((record, index) => {
          if (index > 0) html += '<br>';
          html += `${escapeHtml(formatDateForDetailModal(record.date) || '-')} - ${escapeHtml(record.amount)}`;
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

  // Kaporta Durumu (Legend eklendi; açıklama metni 1.5pt küçük – CSS .detail-row-kaporta)
  const boyaliParcalar = (vehicle && vehicle.boyaliParcalar && typeof vehicle.boyaliParcalar === 'object')
    ? vehicle.boyaliParcalar
    : null;
  const hasKaportaIsaretleri = !!(boyaliParcalar && Object.keys(boyaliParcalar).some(function(partId) {
    return !!boyaliParcalar[partId];
  }));
  html += `<div class="detail-row detail-row-inline detail-row-kaporta"><div class="detail-row-header"><span class="detail-row-label">Kaporta Durumu</span><span class="detail-row-colon">:</span></div><span class="detail-row-value"> `;
  if (hasKaportaIsaretleri) {
      html += 'Aşağıdaki şemada belirtilmiştir.';
  } else {
      html += 'Boya/Değişen yoktur.';
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

  /** Taşıt detay — Notlar satırı inline düzenleme (ayrı modal yok) */
  var detailNotesEditBuffer = null;
  var detailNotesSavePromise = null;

  function formatAdminNotesCellHtml(notesRaw, hasUserSuffix) {
    var n = notesRaw != null ? String(notesRaw) : '';
    if (n) return escapeHtml(n);
    if (hasUserSuffix) return '';
    return '-';
  }

  function fitDetailNotesTextarea(ta) {
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 'px';
  }

  function revertVehicleDetailNotesInlineEdit(ta) {
    if (!ta) return;
    var buf = detailNotesEditBuffer;
    detailNotesEditBuffer = null;
    var cell = ta.closest('.detail-notes-admin-cell');
    if (!cell || !buf) return;
    cell.innerHTML = formatAdminNotesCellHtml(buf.originalNotes != null ? buf.originalNotes : '', buf.hasUserSuffix);
  }

  function updateDetailModalSignatureFromVehicle(vehicle) {
    var modal = DOM.vehicleDetailModal || document.getElementById('vehicle-detail-modal');
    if (!modal || !vehicle) return;
    modal.dataset.detailSignature = [
      String(vehicle.id ?? ''),
      String(vehicle.version ?? ''),
      String(vehicle.guncelKm ?? vehicle.km ?? ''),
      String(vehicle.branchId ?? ''),
      String(vehicle.assignedUserId ?? ''),
      String(vehicle.tahsisKisi ?? ''),
      String(vehicle.ruhsatPath ?? ''),
      String(vehicle.satildiMi === true ? 1 : 0),
      String(Array.isArray(vehicle.events) ? vehicle.events.length : 0)
    ].join('|');
  }

  function commitVehicleDetailNotesInlineFromTextarea(ta) {
    if (!ta || !ta.classList.contains('detail-notes-inline-textarea')) return Promise.resolve();
    var cell = ta.closest('.detail-notes-admin-cell');
    if (!cell) return Promise.resolve();
    var buf = detailNotesEditBuffer;
    if (!buf || !buf.vehicleId) return Promise.resolve();
    var savedBuf = buf;
    detailNotesEditBuffer = null;

    var origTrim = String(savedBuf.originalNotes != null ? savedBuf.originalNotes : '').trim();
    var newTrim = String(ta.value != null ? ta.value : '').trim();

    function setCellFromNotesString(notesStr) {
      cell.innerHTML = formatAdminNotesCellHtml(notesStr != null ? notesStr : '', savedBuf.hasUserSuffix);
    }

    if (newTrim === origTrim) {
      setCellFromNotesString(savedBuf.originalNotes != null ? savedBuf.originalNotes : '');
      return Promise.resolve();
    }

    var vehicles = readVehicles();
    var idx = vehicles.findIndex(function(v) { return String(v.id) === String(savedBuf.vehicleId); });
    if (idx === -1) {
      setCellFromNotesString(savedBuf.originalNotes != null ? savedBuf.originalNotes : '');
      return Promise.resolve();
    }

    var v = vehicles[idx];
    var curVer = (v.version != null && v.version !== undefined) ? Number(v.version) : 0;
    v.notes = newTrim;
    v.version = curVer + 1;
    v.updatedAt = new Date().toISOString();

    return writeVehicles(vehicles).then(function() {
      var fresh = readVehicles().find(function(x) { return String(x.id) === String(savedBuf.vehicleId); });
      var disp = fresh && fresh.notes != null ? String(fresh.notes) : newTrim;
      setCellFromNotesString(disp);
      if (fresh && String(window.currentDetailVehicleId) === String(savedBuf.vehicleId)) {
        updateDetailModalSignatureFromVehicle(fresh);
      }
      if (typeof window.renderVehicles === 'function') window.renderVehicles();
    }).catch(function() {
      setCellFromNotesString(savedBuf.originalNotes != null ? savedBuf.originalNotes : '');
      alert('Notlar kaydedilemedi. Tekrar deneyin.');
    });
  }

  function flushVehicleDetailNotesInlineSave() {
    var ta = document.querySelector('#vehicle-detail-modal .detail-notes-inline-textarea');
    if (!ta) return Promise.resolve();
    if (detailNotesSavePromise) return detailNotesSavePromise;
    detailNotesSavePromise = Promise.resolve(commitVehicleDetailNotesInlineFromTextarea(ta)).finally(function() {
      detailNotesSavePromise = null;
    });
    return detailNotesSavePromise;
  }

  function startVehicleDetailNotesInlineEdit(vehicle) {
    var rightEl = DOM.vehicleDetailRight;
    if (!rightEl || !vehicle) return;
    var cell = rightEl.querySelector('.detail-notes-admin-cell');
    if (!cell) return;
    var existingTa = cell.querySelector('.detail-notes-inline-textarea');
    if (existingTa) {
      existingTa.focus();
      return;
    }
    var hasUserSuffix = !!(vehicle.sonEkstraNot);
    detailNotesEditBuffer = {
      vehicleId: vehicle.id,
      originalNotes: vehicle.notes != null ? String(vehicle.notes) : '',
      hasUserSuffix: hasUserSuffix
    };
    var ta = document.createElement('textarea');
    ta.className = 'detail-notes-inline-textarea form-input';
    ta.setAttribute('rows', '1');
    ta.setAttribute('aria-label', 'Ta\u015F\u0131t notlar\u0131');
    ta.value = detailNotesEditBuffer.originalNotes;
    ta.addEventListener('input', function() { fitDetailNotesTextarea(ta); });
    ta.addEventListener('keydown', function(ev) {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        ev.stopPropagation();
        ta.dataset.skipCommitOnBlur = '1';
        revertVehicleDetailNotesInlineEdit(ta);
      }
    });
    ta.addEventListener('blur', () => {
      flushVehicleDetailNotesInlineSave();
    });
    cell.innerHTML = '';
    cell.appendChild(ta);
    fitDetailNotesTextarea(ta);
    ta.focus();
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
    const sigortaDisplay = formatDateForDetailModal(sigortaDate);
    html += `<div class="detail-row detail-row-inline"><div class="detail-row-header"><span class="detail-row-label">Sigorta Bitiş Tarihi</span><span class="detail-row-colon">:</span></div><span class="detail-row-value ${sigortaWarning.class}"> ${escapeHtml(sigortaDisplay || '-')}</span></div>`;
    
    // Kasko bitiş tarihi
    const kaskoDate = vehicle.kaskoDate || '';
    const kaskoWarning = checkDateWarnings(kaskoDate);
    const kaskoDisplay = formatDateForDetailModal(kaskoDate);
    html += `<div class="detail-row detail-row-inline"><div class="detail-row-header"><span class="detail-row-label">Kasko Bitiş Tarihi</span><span class="detail-row-colon">:</span></div><span class="detail-row-value ${kaskoWarning.class}"> ${escapeHtml(kaskoDisplay || '-')}</span></div>`;
    
    // Muayene bitiş tarihi (taşıt tipi yoksa uyarı + tooltip + Tıklayınız)
    const muayeneDate = vehicle.muayeneDate || '';
    const muayeneWarning = checkDateWarnings(muayeneDate);
    if (isEgzozMuayeneCritical(vehicle)) {
      muayeneWarning.class = 'date-warning-red';
    }
    const muayeneDisplay = formatDateForDetailModal(muayeneDate);
    const vt = vehicle.vehicleType ?? vehicle.tip ?? '';
    const noVehicleType = vt == null || (typeof vt === 'string' && !String(vt).trim());
    if (noVehicleType) {
      html += `<div class="detail-row detail-row-inline detail-row-muayene-no-type"><div class="detail-row-header"><span class="detail-row-label">Muayene Bitiş Tarihi</span><span class="detail-row-colon">:</span></div><span class="detail-row-value detail-muayene-value-wrap ${muayeneWarning.class}"> ${escapeHtml(muayeneDisplay || '-')} <span class="muayene-detail-exclamation" aria-hidden="true" title="Taşıt tipi seçilmedi">!</span><span class="muayene-detail-tooltip-wrap"><span class="muayene-detail-tooltip" role="tooltip" hidden>Taşıt Tipi Seçilmediğinden, Muayene Bitiş Tarihi Hatalı Gözükebilir. Seçim Yapmak İçin <button type="button" class="muayene-detail-tooltip-link">Tıklayınız</button>.</span></span></span></div>`;
    } else {
      html += `<div class="detail-row detail-row-inline"><div class="detail-row-header"><span class="detail-row-label">Muayene Bitiş Tarihi</span><span class="detail-row-colon">:</span></div><span class="detail-row-value ${muayeneWarning.class}"> ${escapeHtml(muayeneDisplay || '-')}</span></div>`;
    }

    const egzozRaw = vehicle && vehicle.egzozMuayeneDate != null ? String(vehicle.egzozMuayeneDate).trim() : '';
    if (egzozRaw) {
      const egzozState = getEgzozMuayeneState(vehicle);
      const egzozDisplay = formatDateForDetailModal(egzozState.date);
      html += `<div class="detail-row detail-row-inline"><div class="detail-row-header"><span class="detail-row-label">Egzoz Muayene Bitiş</span><span class="detail-row-colon">:</span></div><span class="detail-row-value ${egzozState.warningClass}"> ${escapeHtml(egzozDisplay || '-')}</span></div>`;
    }
    
    // var/yok alanları: boş = Belirtilmedi (kesin Yoktur./Hayır gösterilmez)
    const detailVarYokLabel = function(raw, detailVal) {
      if (raw == null || String(raw).trim() === '') return 'Belirtilmedi';
      if (raw === 'var') {
        const d = detailVal != null ? String(detailVal).trim() : '';
        return d !== '' ? d : 'Var';
      }
      if (raw === 'yok') return 'Yoktur.';
      return 'Belirtilmedi';
    };
    const detailBoolEvetHayir = function(val) {
      if (val === true) return 'Evet';
      if (val === false) return 'Hayır';
      return 'Belirtilmedi';
    };

    // Detay: yedek anahtar durumu
    const anahtarLabel = detailVarYokLabel(vehicle.anahtar, vehicle.anahtarNerede);
    html += `<div class="detail-row detail-row-inline"><div class="detail-row-header"><span class="detail-row-label">Yedek Anahtar</span><span class="detail-row-colon">:</span></div><span class="detail-row-value"> ${escapeHtml(anahtarLabel)}</span></div>`;
    
    // Hak Mahrumiyeti
    const krediLabel = detailVarYokLabel(vehicle.kredi, vehicle.krediDetay);
    html += `<div class="detail-row detail-row-inline"><div class="detail-row-header"><span class="detail-row-label">Hak Mahrumiyeti</span><span class="detail-row-colon">:</span></div><span class="detail-row-value"> ${escapeHtml(krediLabel)}</span></div>`;
    
    // Yazlık/ Kışlık Lastik (Yoktur "r" hizası için referans)
    const lastikLabel = detailVarYokLabel(vehicle.lastikDurumu, vehicle.lastikAdres);
    html += `<div class="detail-row detail-row-inline"><div class="detail-row-header"><span class="detail-row-label">Yazlık/ Kışlık Lastik</span><span class="detail-row-colon">:</span></div><span class="detail-row-value detail-yoktur-r-ref"> ${escapeHtml(lastikLabel)}</span></div>`;
    
    // UTTS
    const utts = detailBoolEvetHayir(vehicle.uttsTanimlandi);
    html += `<div class="detail-row detail-row-inline"><div class="detail-row-header"><span class="detail-row-label">UTTS</span><span class="detail-row-colon">:</span></div><span class="detail-row-value"> ${escapeHtml(utts)}</span></div>`;
    
    // Taşıt Takip
    const takipCihazi = detailBoolEvetHayir(vehicle.takipCihaziMontaj);
    html += `<div class="detail-row detail-row-inline"><div class="detail-row-header"><span class="detail-row-label">Taşıt Takip</span><span class="detail-row-colon">:</span></div><span class="detail-row-value"> ${escapeHtml(takipCihazi)}</span></div>`;

    // Kasko Kodu (sadece taşıt detayda bilgi olarak)
    const kaskoKodu = vehicle.kaskoKodu || '';
    html += `<div class="detail-row detail-row-inline"><div class="detail-row-header"><span class="detail-row-label">Kasko Kodu</span><span class="detail-row-colon">:</span></div><span class="detail-row-value"> ${escapeHtml(kaskoKodu || '-')}</span></div>`;

    // Kasko Değeri (önce kayıtlı değer, yoksa Excel'den hesapla)
    let kaskoDegeri = vehicle.kaskoDegeri;
    if (kaskoDegeri == null || kaskoDegeri === '') {
      const yearForKasko = vehicle.year || vehicle.modelYili || '';
      kaskoDegeri = (typeof window.getKaskoDegeri === 'function') ? window.getKaskoDegeri(vehicle.kaskoKodu, yearForKasko) : '-';
    }
    if (kaskoDegeri == null || String(kaskoDegeri).trim() === '') {
      kaskoDegeri = '-';
    }
    if (kaskoDegeri === '-' && (!vehicle.kaskoKodu || String(vehicle.kaskoKodu).trim() === '')) {
      kaskoDegeri = 'Kasko kodu girilmedi';
    } else if (kaskoDegeri === '-' && !hasAnyKaskoListData()) {
      kaskoDegeri = 'Excel yüklenmedi';
    }
    let isKaskoOutdated = true;
    const kaskoState = getKaskoState();
    const kaskoTarihKaynak = vehicle.kaskoDegeriYuklemeTarihi || kaskoState.updatedAt || '';
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
    const hasUserSuffix = !!sonNot;
    const adminNotesHtml = formatAdminNotesCellHtml(notes, hasUserSuffix);
    let userNoteSuffixHtml = '';
    if (sonNot) {
      const kullaniciNotu = 'Kullanıcı Notu: ' + escapeHtml(sonNot) + (sonNotDonem ? ' (' + escapeHtml(sonNotDonem) + ')' : '');
      userNoteSuffixHtml = '<span class="detail-notes-user-suffix"><br><br>' + kullaniciNotu + '</span>';
    }
    const notesPencil = (!vehicle.satildiMi)
      ? '<button type="button" class="detail-notes-edit-btn" title="Notlar\u0131 d\u00fczenle" aria-label="Notlar\u0131 d\u00fczenle"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>'
      : '';
    html += `<div class="detail-row detail-row-block detail-row-notes"><div class="detail-row-header detail-row-header-notes"><span class="detail-row-label">Notlar</span>${notesPencil}<span class="detail-row-colon">:</span></div><span class="detail-row-value detail-row-value-notes"><span class="detail-notes-admin-cell">${adminNotesHtml}</span>${userNoteSuffixHtml}</span></div>`;
    
    rightEl.innerHTML = html;

    const notesBtn = rightEl.querySelector('.detail-notes-edit-btn');
    if (notesBtn) {
      notesBtn.addEventListener('click', function(ev) {
        ev.stopPropagation();
        ev.preventDefault();
        var vid = vehicle.id;
        var fresh = readVehicles().find(function(v) { return String(v.id) === String(vid); });
        startVehicleDetailNotesInlineEdit(fresh || vehicle);
      });
    }
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
        const shrinkY = 18; // Dikeyde toplam 10px daha küçük görünüm
        const defaultTargetWidth = Math.round((220 - shrinkX) * schemaScale);
        const targetHeight = Math.round(defaultTargetWidth * (148 / 220)) - shrinkY - 5; /* 5px daha kısa */

        // Wrapper oluştur (Şemayı tutacak kutu); yatayda ortalı, üstte 6px boşluk (üst metinle overlap önlenir)
        const svgWrapper = document.createElement('div');
        svgWrapper.className = 'kaporta-schema-wrapper';
        svgWrapper.style.cssText = `
            width: ${defaultTargetWidth}px;
            height: ${targetHeight}px;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: visible;
            flex-shrink: 0;
            margin: 6px auto 20px auto;
        `;

        // SVG'yi hazırla (zaten clone geldi)
        svgClone.setAttribute('width', String(svgOrgWidth));
        svgClone.setAttribute('height', String(svgOrgHeight));

        svgClone.style.cssText = `
            display: block;
            margin: 0;
            transform: rotate(90deg); /* Kilit nokta: Arabayı yatay yaptık */
            transform-origin: center center;
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

        // Sol kolon genişliğine göre şema büyüklüğünü uyarla (sol grid içinde)
        requestAnimationFrame(function alignSchemaToLeftColumn() {
          const leftCol = DOM.vehicleDetailLeft;
          if (leftCol && container.isConnected) {
            const leftRect = leftCol.getBoundingClientRect();
            const padding = 16;
            const availableWidth = Math.max(0, leftRect.width - padding);
            const minW = 128;
            const maxW = 304;
            const clamped = Math.max(minW, Math.min(maxW, Math.round(availableWidth * 0.8)));
            const w = clamped - shrinkX;
            const h = Math.round(clamped * (148 / 220)) - shrinkY - 5; /* 5px daha kısa */
            svgWrapper.style.width = w + 'px';
            svgWrapper.style.height = h + 'px';

            // EKLENEN KISIM: Arabayı yatırdığımızda genişliği 220 oluyor.
            // Konteynera (w) sığması için dinamik scale uyguluyoruz.
            const scaleRatio = w / 220;
            svgClone.style.transform = `rotate(90deg) scale(${scaleRatio})`;
          }
        });
      })
      .catch(err => {
        console.error('SVG yükleme hatası:', err);
      });
  }

  // --- OLAY MODAL FONKSİYONLARI (tek #dinamik-olay-modal) ---

  const EVENT_TITLES = {
    bakim: 'BAKIM BİLGİSİ EKLE',
    kaza: 'KAZA BİLGİSİ EKLE',
    ceza: 'TRAFİK CEZASI EKLE',
    sigorta: 'SİGORTA BİLGİSİ GÜNCELLE',
    kasko: 'KASKO BİLGİSİ GÜNCELLE',
    muayene: 'MUAYENE BİLGİSİ GÜNCELLE',
    anahtar: 'YEDEK ANAHTAR BİLGİSİ GÜNCELLE',
    kredi: 'HAK MAHRUMİYETİ BİLGİSİ GÜNCELLE',
    km: 'KM GÜNCELLE',
    lastik: 'LASTİK DURUMU GÜNCELLE',
    utts: 'UTTS BİLGİSİ GÜNCELLE',
    takip: 'TAŞIT TAKİP CİHAZ BİLGİSİ GÜNCELLE',
    kaskokodu: 'KASKO KODU GÜNCELLEME',
    sube: 'ŞUBE DEĞİŞİKLİĞİ',
    kullanici: 'KULLANICI ATAMA/DEĞİŞİKLİĞİ',
    satis: 'SATIŞ/PERT BİLDİRİMİ'
  };

  function padDatePart(value) {
    return String(value || '').padStart(2, '0');
  }

  function isValidGgAaYyyyParts(day, month, year) {
    const d = parseInt(day, 10);
    const m = parseInt(month, 10);
    const y = parseInt(year, 10);
    if (!d || !m || !y || m < 1 || m > 12) return false;
    const dt = new Date(y, m - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === (m - 1) && dt.getDate() === d;
  }

  function normalizeGgAaYyyyInput(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const separated = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
    if (separated && isValidGgAaYyyyParts(separated[1], separated[2], separated[3])) {
      return padDatePart(separated[1]) + '/' + padDatePart(separated[2]) + '/' + separated[3];
    }

    const digits = raw.replace(/[^\d]/g, '');
    if (digits.length === 8) {
      const dd = digits.slice(0, 2);
      const mm = digits.slice(2, 4);
      const yyyy = digits.slice(4, 8);
      if (isValidGgAaYyyyParts(dd, mm, yyyy)) return dd + '/' + mm + '/' + yyyy;

      const yyyyAlt = digits.slice(0, 4);
      const mmAlt = digits.slice(4, 6);
      const ddAlt = digits.slice(6, 8);
      if (isValidGgAaYyyyParts(ddAlt, mmAlt, yyyyAlt)) return ddAlt + '/' + mmAlt + '/' + yyyyAlt;
    }

    return raw;
  }

  function normalizeGgAaYyyyInputElement(input) {
    if (!input) return '';
    const normalized = normalizeGgAaYyyyInput(input.value);
    if (normalized) input.value = normalized;
    return normalized;
  }

  function parseGgAaYyyyToIso(tr) {
    const normalized = normalizeGgAaYyyyInput(tr);
    const m = normalized.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return m ? (m[3] + '-' + m[2] + '-' + m[1]) : '';
  }

  function formatIsoToGgAaYyyy(iso) {
    const m = String(iso || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? (m[3] + '/' + m[2] + '/' + m[1]) : '';
  }

  /**
   * Olay Ekle (#dinamik-olay-modal) type=date: mobil WebKit .has-value + iOS ilk çizim.
   * Taşıtlar modülü kayit.js olmadan yüklenebildiği için burada bağlanır (tek nokta).
   */
  function syncDinamikOlayDateInputVisual(input) {
    if (!input || input.type !== 'date' || !input.closest('#dinamik-olay-modal')) return;
    const hasValue = !!input.value;
    input.classList.toggle('has-value', hasValue);
    /* Boşta şeffaf yapma: mobilde yerel tarih metni baştan görünsün */
    if (hasValue || input === document.activeElement) {
      input.style.color = '#888';
    } else {
      input.style.color = 'rgba(255, 255, 255, 0.42)';
    }
  }
  function repaintDinamikOlayDateInput(input) {
    if (!input || input.type !== 'date') return;
    var val = input.value;
    if (val) {
      input.value = '';
      requestAnimationFrame(function() {
        input.value = val;
        syncDinamikOlayDateInputVisual(input);
      });
    } else {
      syncDinamikOlayDateInputVisual(input);
    }
  }
  function bindDinamikOlayDateInputsForIos(modal) {
    if (!modal) return;
    modal.querySelectorAll('input[type="date"].form-input').forEach(function(input) {
      if (!input.closest('#dinamik-olay-modal')) return;
      if (!input.dataset.olayDateIosBound) {
        input.dataset.olayDateIosBound = '1';
        function onUpd() { syncDinamikOlayDateInputVisual(input); }
        input.addEventListener('change', onUpd);
        input.addEventListener('input', onUpd);
        input.addEventListener('blur', onUpd);
        input.addEventListener('focus', onUpd);
      }
      repaintDinamikOlayDateInput(input);
    });
  }

  /** sigorta/kasko/muayene gg/aa/yyyy metin alanlarını kayıttan önce normalize et */
  function bindGgAaYyyyTextInputs(modal) {
    if (!modal) return;
    ['sigorta-tarih', 'kasko-tarih', 'muayene-tarih', 'muayene-egzoz-yapilma-tarih'].forEach(function(id) {
      const input = modal.querySelector('#' + id);
      if (!input || input.dataset.ggaaNormalizeBound) return;
      input.dataset.ggaaNormalizeBound = '1';
      const normalize = function() { normalizeGgAaYyyyInputElement(input); };
      input.addEventListener('blur', normalize);
      input.addEventListener('change', normalize);
    });
  }

  /** Sigorta/kasko/muayene gg/aa/yyyy metin alanına yerel tarih seçici + simge */
  function setupOlayGgAaYyyyPickers(modal) {
    if (!modal) return;
    const ids = ['sigorta-tarih', 'kasko-tarih', 'muayene-tarih', 'muayene-egzoz-yapilma-tarih'];
    const calendarSvg = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>';
    ids.forEach(function(id) {
      const textEl = document.getElementById(id);
      if (!textEl || textEl.closest('.olay-date-mobile-wrap')) return;
      const par = textEl.parentNode;
      if (!par) return;
      const wrap = document.createElement('div');
      wrap.className = 'olay-date-mobile-wrap';
      par.insertBefore(wrap, textEl);
      wrap.appendChild(textEl);
      textEl.classList.add('olay-date-mobile-text');

      const pickerSlot = document.createElement('div');
      pickerSlot.className = 'olay-date-mobile-picker-slot';

      const nativeInp = document.createElement('input');
      nativeInp.type = 'date';
      nativeInp.className = 'olay-date-mobile-native';
      nativeInp.setAttribute('aria-label', 'Tarih se\u00e7');
      const iso0 = parseGgAaYyyyToIso(textEl.value);
      if (iso0) nativeInp.value = iso0;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'olay-date-mobile-btn';
      btn.setAttribute('aria-hidden', 'true');
      btn.tabIndex = -1;
      btn.innerHTML = calendarSvg;

      function syncNativeFromText() {
        const normalized = normalizeGgAaYyyyInputElement(textEl);
        const v = parseGgAaYyyyToIso(normalized);
        nativeInp.value = v || '';
      }
      function syncTextFromNative() {
        if (nativeInp.value) textEl.value = formatIsoToGgAaYyyy(nativeInp.value);
      }

      textEl.addEventListener('blur', syncNativeFromText);
      textEl.addEventListener('change', syncNativeFromText);
      nativeInp.addEventListener('change', syncTextFromNative);

      /* iOS Safari: ekran dışındaki type=date üzerinde showPicker/click genelde çalışmaz; dokunuş doğrudan görünür alandaki inputa gitmeli */
      pickerSlot.appendChild(btn);
      pickerSlot.appendChild(nativeInp);
      wrap.appendChild(pickerSlot);
    });
  }

  function syncOlayEgzozMuayeneFields() {
    const checkbox = document.getElementById('muayene-egzoz-different');
    const wrapper = document.getElementById('muayene-egzoz-date-wrapper');
    const input = document.getElementById('muayene-egzoz-yapilma-tarih');
    const visible = !!(checkbox && checkbox.checked);
    if (wrapper) wrapper.classList.toggle('egzoz-date-visible', visible);
    if (input) {
      input.disabled = !visible;
      if (!visible) input.value = '';
      const nativeInput = input.closest('.olay-date-mobile-wrap')?.querySelector('.olay-date-mobile-native');
      if (nativeInput) {
        nativeInput.disabled = !visible;
        if (!visible) nativeInput.value = '';
      }
    }
  }

  /** Olay Ekle: Var/Yok detay textarea’ları içerik kadar dikey büyür (tek satır input yok). */
  function bindOlayDetayTextareaAutogrow(el) {
    if (!el) return function() {};
    function sync() {
      el.style.height = 'auto';
      var lh = parseFloat(window.getComputedStyle(el).lineHeight) || 22;
      var minH = Math.round(lh * 2);
      var maxH = Math.round(lh * 22);
      var sh = el.scrollHeight;
      var h = Math.min(Math.max(sh, minH), maxH);
      el.style.height = h + 'px';
      el.style.overflowY = sh > maxH ? 'auto' : 'hidden';
    }
    if (el.dataset.olayDetayAutogrowBound !== '1') {
      el.dataset.olayDetayAutogrowBound = '1';
      el.style.resize = 'none';
      el.style.boxSizing = 'border-box';
      el.addEventListener('input', sync);
      el.addEventListener('focus', sync);
    }
    return sync;
  }

  function getEventFormHtml(type) {
    const labelCls = 'form-label';
    const inputCls = 'form-input';
    const section = (labelText, id, tag, attrs, inner) => {
      const list = attrs || [];
      let attrClass = null;
      const rest = [];
      for (let i = 0; i < list.length; i++) {
        const a = list[i];
        if (a[0] === 'class') attrClass = String(a[1] || '');
        else rest.push(a);
      }
      const escAttr = function (v) { return String(v || '').replace(/"/g, '&quot;'); };
      const joinRest = function () {
        return rest.map(function (a) { return a[0] + '="' + escAttr(a[1]) + '"'; }).join(' ');
      };
      const mergeClass = function (base, extra) {
        if (!extra || !String(extra).trim()) return base;
        var set = {};
        base.split(/\s+/).filter(Boolean).forEach(function (t) { set[t] = true; });
        String(extra).trim().split(/\s+/).forEach(function (t) { if (t) set[t] = true; });
        return Object.keys(set).join(' ');
      };
      var open;
      if (tag === 'input') {
        open = '<input id="' + id + '" class="' + escAttr(mergeClass(inputCls, attrClass)) + '" ' + joinRest() + '>';
      } else if (tag === 'textarea') {
        open = '<textarea id="' + id + '" class="' + escAttr(mergeClass(inputCls, attrClass)) + '" ' + joinRest() + '>' + (inner || '') + '</textarea>';
      } else if (tag === 'select') {
        open = '<select id="' + id + '" class="' + escAttr(mergeClass(inputCls, attrClass)) + '" ' + joinRest() + '>' + (inner || '') + '</select>';
      } else {
        open = '<div id="' + id + '" ' + list.map(function (a) { return a[0] + '="' + escAttr(a[1]) + '"'; }).join(' ') + '>' + (inner || '') + '</div>';
      }
      return '<div><label class="' + labelCls + '" for="' + id + '">' + labelText + '</label>' + open + '</div>';
    };
    /** Etiket + butonlar yan yana, 4px gap; Var/Evet=yeşil (hover-green), Yok/Hayır=kırmızı (hover-red) */
    const radioRow = (labelText, varVal, yokVal, varLbl, yokLbl) => {
      return '<div class="form-section-inline event-radio-row"><span class="' + labelCls + ' event-radio-label">' + labelText + '</span><div class="event-radio-actions"><button type="button" class="radio-btn hover-green" data-value="' + varVal + '">' + varLbl + '</button><button type="button" class="radio-btn hover-red" data-value="' + yokVal + '">' + yokLbl + '</button></div></div>';
    };
    const egzozMuayeneSection = () => {
      return '<label class="egzoz-olay-toggle" for="muayene-egzoz-different">' +
        '<input type="checkbox" id="muayene-egzoz-different">' +
        '<span>Egzoz Muayenesi Farklı Tarih İse İşaretleyin..</span>' +
        '</label>' +
        '<div id="muayene-egzoz-date-wrapper" class="egzoz-olay-date-wrapper">' +
        '<label class="' + labelCls + '" for="muayene-egzoz-yapilma-tarih">Egzoz Muayene Tarihi</label>' +
        '<input id="muayene-egzoz-yapilma-tarih" class="' + inputCls + '" type="text" placeholder="gg/aa/yyyy" disabled>' +
        '</div>';
    };
    switch (type) {
      case 'bakim':
        return '<div style="display:flex;flex-direction:column;gap:12px;">' +
          section('Tarih (gg.aa.yyyy)', 'bakim-tarih', 'input', [['type', 'date'], ['class', 'olay-tarih-input']]) +
          section('Servis', 'bakim-servis', 'input', [['type', 'text'], ['placeholder', 'Servis adı']]) +
          section('Km', 'bakim-km', 'input', [['type', 'text'], ['placeholder', 'Km'], ['inputmode', 'numeric']]) +
          section('Tutar', 'bakim-tutar', 'input', [['type', 'text'], ['placeholder', 'Tutar']]) +
          section('Yapılan İşlemler', 'bakim-islemler', 'textarea', [['rows', '2'], ['placeholder', 'Yapılan işlemler']]) + '</div>';
      case 'kaza':
        return '<div style="display:flex;flex-direction:column;gap:12px;">' +
          section('Tarih', 'kaza-tarih', 'input', [['type', 'date'], ['class', 'olay-tarih-input']]) +
          section('Kullanıcı', 'kaza-surucu', 'input', [['type', 'text'], ['placeholder', 'Kullanıcı']]) +
          section('Hasar Tutarı', 'kaza-tutar', 'input', [['type', 'text'], ['placeholder', 'Tutar']]) +
          '<div class="form-section-inline kaza-tramer-row"><span class="' + labelCls + ' kaza-tramer-label">Tramer Kaydı Oluştu mu?</span><div class="kaza-tramer-actions"><button type="button" class="radio-btn tramer-evet hover-red" data-value="evet" data-tramer-group="kaza">Evet</button><button type="button" class="radio-btn tramer-hayir hover-green" data-value="hayir" data-tramer-group="kaza">Hayır</button></div></div>' +
          '<div id="kaza-tramer-fields-wrap" style="display:none;">' +
          section('Tramer Tarih', 'kaza-tramer-tarih', 'input', [['type', 'date'], ['class', 'olay-tarih-input']]) +
          section('Tramer Tutar', 'kaza-tramer-tutar', 'input', [['type', 'text'], ['placeholder', 'Tutar']]) +
          '</div>' +
          '<div class="kaza-kaporta-block"><span class="' + labelCls + ' kaza-kaporta-section-label">Kaporta / Hasar</span><div id="kaza-kaporta-container"></div></div></div>';
      case 'ceza':
        return '<div style="display:flex;flex-direction:column;gap:12px;">' +
          section('Tarih', 'ceza-tarih', 'input', [['type', 'date'], ['class', 'olay-tarih-input']]) +
          '<div>' +
            '<label class="' + labelCls + '" id="ceza-user-label" for="ceza-user-trigger">Kullanıcı</label>' +
            '<input type="hidden" id="ceza-surucu">' +
            '<div id="ceza-user-wrap" class="ceza-user-dropdown-wrap">' +
              '<button type="button" id="ceza-user-trigger" class="form-input ceza-user-trigger placeholder" role="combobox" aria-haspopup="listbox" aria-expanded="false" aria-controls="ceza-user-dropdown" aria-labelledby="ceza-user-label ceza-user-trigger-text">' +
                '<span id="ceza-user-trigger-text">Kullanıcı Seçiniz</span>' +
                '<svg class="ceza-user-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>' +
              '</button>' +
              '<div id="ceza-user-dropdown" class="ceza-user-dropdown" role="listbox" aria-hidden="true">' +
                '<div class="ceza-user-search-wrap">' +
                  '<input type="text" id="ceza-user-search" class="form-input ceza-user-search-input" placeholder="Kullanıcı Ara..." autocomplete="off" aria-label="Kullanıcı Ara">' +
                '</div>' +
                '<div id="ceza-user-list" class="ceza-user-list"></div>' +
              '</div>' +
            '</div>' +
          '</div>' +
          section('Ceza Tutarı', 'ceza-tutar', 'input', [['type', 'text'], ['placeholder', 'Ör. 2.140TL']]) +
          section('Açıklama', 'ceza-aciklama', 'textarea', [['rows', '2'], ['placeholder', 'Açıklama']]) + '</div>';
      case 'sigorta':
        return '<div style="display:flex;flex-direction:column;gap:12px;">' +
          section('Yenileme/Başlangıç (gg/aa/yyyy)', 'sigorta-tarih', 'input', [['type', 'text'], ['placeholder', 'gg/aa/yyyy']]) +
          section('Firma', 'sigorta-firma', 'input', [['type', 'text'], ['placeholder', 'ör. Anadolu']]) +
          section('Acente', 'sigorta-acente', 'input', [['type', 'text'], ['placeholder', 'ör. Hayri Çetin']]) +
          section('İletişim', 'sigorta-iletisim', 'input', [['type', 'text'], ['placeholder', '05** *******']]) + '</div>';
      case 'kasko':
        return '<div style="display:flex;flex-direction:column;gap:12px;">' +
          section('Yenileme/Başlangıç (gg/aa/yyyy)', 'kasko-tarih', 'input', [['type', 'text'], ['placeholder', 'gg/aa/yyyy']]) +
          section('Firma', 'kasko-firma', 'input', [['type', 'text'], ['placeholder', 'ör. Anadolu']]) +
          section('Acente', 'kasko-acente', 'input', [['type', 'text'], ['placeholder', 'ör. Hayri Çetin']]) +
          section('İletişim', 'kasko-iletisim', 'input', [['type', 'text'], ['placeholder', '05** *******']]) + '</div>';
      case 'muayene':
        return '<div style="display:flex;flex-direction:column;gap:12px;">' +
          section('Muayene Tarihi', 'muayene-tarih', 'input', [['type', 'text'], ['placeholder', 'gg/aa/yyyy']]) +
          egzozMuayeneSection() + '</div>';
      case 'anahtar':
        return '<div style="display:flex;flex-direction:column;gap:12px;">' +
          radioRow('Yedek Anahtar Var mı?', 'var', 'yok', 'Var', 'Yok') +
          '<div id="anahtar-detay-wrapper" style="display:none;"><label class="' + labelCls + '" for="anahtar-detay-event">Detay (nerede)</label><textarea id="anahtar-detay-event" class="' + inputCls + '" rows="2" placeholder="Nerede?"></textarea></div></div>';
      case 'kredi':
        return '<div style="display:flex;flex-direction:column;gap:12px;">' +
          radioRow('Hak Mahrumiyeti Var mı?', 'var', 'yok', 'Var', 'Yok') +
          '<div id="kredi-detay-wrapper-event" style="display:none;"><label class="' + labelCls + '" for="kredi-detay-event">Hak mahrumiyeti detay</label><textarea id="kredi-detay-event" class="' + inputCls + '" rows="2"></textarea></div></div>';
      case 'km':
        return '<div style="display:flex;flex-direction:column;gap:12px;">' +
          section('Güncel KM', 'km-guncelle-input', 'input', [['type', 'text'], ['placeholder', 'Km'], ['inputmode', 'numeric']]) + '</div>';
      case 'lastik':
        return '<div style="display:flex;flex-direction:column;gap:12px;">' +
          radioRow('Yazlık/ Kışlık Lastik Var mı?', 'var', 'yok', 'Var', 'Yok') +
          '<div id="lastik-adres-wrapper-event" style="display:none;"><label class="' + labelCls + '" for="lastik-adres-event">Adres</label><textarea id="lastik-adres-event" class="' + inputCls + '" rows="2"></textarea></div></div>';
      case 'utts':
        return '<div style="display:flex;flex-direction:column;gap:12px;">' +
          radioRow('UTTS Cihazı Var mı?', 'evet', 'hayir', 'Evet', 'Hayır') + '</div>';
      case 'takip':
        return '<div style="display:flex;flex-direction:column;gap:12px;">' +
          radioRow('Taşıt Takip Cihazı Var mı?', 'evet', 'hayir', 'Evet', 'Hayır') + '</div>';
      case 'kaskokodu':
        return '<div style="display:flex;flex-direction:column;gap:12px;">' +
          section('Kasko Kodu', 'kasko-kodu-guncelle-input', 'input', [['type', 'text'], ['placeholder', 'Kod']]) + '</div>';
      case 'sube':
        return '<div style="display:flex;flex-direction:column;gap:12px;">' +
          section('Yeni Şube', 'sube-select', 'select', [], '<option value="">Şube Seçiniz</option>') + '</div>';
      case 'kullanici':
        return '<div style="display:flex;flex-direction:column;gap:12px;">' +
          section('Kullanıcı', 'kullanici-select', 'select', [], '<option value="">Kullanıcı Seçiniz</option>') + '</div>';
      case 'satis':
        return '<div style="display:flex;flex-direction:column;gap:12px;">' +
          section('Satış/Pert Tarihi', 'satis-tarih', 'input', [['type', 'date'], ['class', 'olay-tarih-input']]) +
          section('Tutar', 'satis-tutar', 'input', [['type', 'text'], ['placeholder', 'Tutar']]) +
          section('Açıklama', 'satis-aciklama', 'textarea', [['rows', '2'], ['placeholder', 'Açıklama']]) + '</div>';
      default:
        return '';
    }
  }

  /**
   * Olay modal menüsünü veya tek dinamik olay form modal'ını açar
   */
  function openEventModalBody(type, vehicleId) {
    closeDynamicModalCustomSelect();

    var effectiveVid = '';
    try {
      if (vehicleId != null && vehicleId !== '') effectiveVid = String(vehicleId).trim();
      if (!effectiveVid && window.currentDetailVehicleId != null) {
        effectiveVid = String(window.currentDetailVehicleId).trim();
      }
    } catch (eVid) {
      effectiveVid = '';
    }

    if (!effectiveVid && type !== 'ruhsat') {
      if (typeof window.__medisaLogError === 'function') {
        window.__medisaLogError('openEventModal', new Error('taşıt kimliği yok'), { type: type });
      }
      return;
    }

    if (type === 'menu') {
      if (DOM.dinamikOlayModal && DOM.dinamikOlayModal.classList.contains('active')) {
        DOM.dinamikOlayModal.classList.remove('active');
        DOM.dinamikOlayModal.style.display = 'none';
      }
      const modal = DOM.eventMenuModal;
      if (!modal) return;
      
      const menuList = DOM.eventMenuList;
      if (!menuList) return;
      
      // Menü listesini oluştur
      const isMobile = window.innerWidth <= 640;
      const takipLabel = isMobile ? 'Taşıt Takip Cih.Bilg. Günc.' : 'Taşıt Takip Cihaz Bilgisi Güncelle';
      const currentMenuVehicle = readVehicles().find(v => String(v.id) === String(effectiveVid));
      const assignmentLocked = isArchivedVehicleAssignmentLocked(currentMenuVehicle);
      let events = [
        { id: 'ceza', label: 'Trafik Cezası Ekle' },
        { id: 'km', label: 'Km Güncelle' },
        { id: 'bakim', label: 'Bakım Bilgisi Ekle' },
        { id: 'kaza', label: 'Kaza Bilgisi Ekle' },
        { id: 'sigorta', label: 'Sigorta Bilgisi Güncelle' },
        { id: 'kasko', label: 'Kasko Bilgisi Güncelle' },
        { id: 'muayene', label: 'Muayene Bilgisi G\u00FCncelle' },
        { id: 'anahtar', label: 'Yedek Anahtar Bilgisi G\u00FCncelle' },
        { id: 'kredi', label: 'Hak Mahrumiyeti Bilgisi G\u00FCncelle' },
        { id: 'lastik', label: 'Yazl\u0131k/K\u0131\u015Fl\u0131k Lastik Durumu G\u00FCncelle' },
        { id: 'utts', label: 'UTTS Bilgisi G\u00FCncelle' },
        { id: 'takip', label: takipLabel },
        { id: 'kaskokodu', label: 'Kasko Kodu G\u00FCncelleme' },
        { id: 'sube', label: '\u015Eube De\u011Fi\u015Fikli\u011Fi Bilgisi G\u00FCncelle' },
        { id: 'kullanici', label: 'Kullan\u0131c\u0131 Atama/De\u011Fi\u015Fikli\u011Fi Bilgisi G\u00FCncelle' },
        { id: 'satis', label: 'Sat\u0131\u015F/Pert Bildirimi Yap' }
      ];
      if (assignmentLocked) {
        events = events.filter(function(event) {
          return event.id !== 'sube' && event.id !== 'kullanici';
        });
      }
      
      const vid = (window.currentDetailVehicleId || vehicleId || '').toString().replace(/"/g, '&quot;');
      menuList.innerHTML = events.map(event => {
        const isKaza = event.id === 'kaza';
        const isSatis = event.id === 'satis';
        const isCeza = event.id === 'ceza';
        const isDanger = isKaza || isSatis || isCeza;
        const dangerClass = isDanger ? ' class="event-menu-btn--danger"' : '';
        const borderColor = isDanger ? '#d40000' : 'rgba(255, 255, 255, 0.3)';
        const textColor = isDanger ? '#d40000' : '#ccc';
        const borderWidth = isDanger ? '0.3px' : '1px';
        return `<button type="button"${dangerClass} data-event-id="${event.id}" data-vehicle-id="${vid}" style="width: 100%; padding: 12px; background: transparent; border: ${borderWidth} solid ${borderColor}; color: ${textColor}; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 14px; text-align: left;">${event.label}</button>`;
      }).join('');
      
      modal.style.display = 'flex';
      requestAnimationFrame(() => {
        modal.classList.add('active');
      });
    } else {
      if (type === 'ruhsat') {
        window.currentDetailVehicleId = (vehicleId || window.currentDetailVehicleId || '').toString();
        if (typeof window.openRuhsatModal === 'function') window.openRuhsatModal(vehicleId || window.currentDetailVehicleId);
        return;
      }
      if (type === 'sube' || type === 'kullanici') {
        const lockedVehicle = readVehicles().find(v => String(v.id) === String(effectiveVid));
        if (isArchivedVehicleAssignmentLocked(lockedVehicle)) {
          if (typeof showToast === 'function') showToast('Arşivdeki taşıtlarda kullanıcı/şube ataması yapılamaz.', 'error');
          else alert('Arşivdeki taşıtlarda kullanıcı/şube ataması yapılamaz.');
          return;
        }
      }
      const modal = DOM.dinamikOlayModal;
      const formIcerik = DOM.dinamikOlayFormIcerik;
      const baslikEl = DOM.dinamikOlayBaslik;
      const kaydetBtn = DOM.dinamikOlayKaydetBtn;
      if (!modal || !formIcerik || !kaydetBtn) return;

      const getDynamicEventCloseTarget = function() {
        const currentVehicleId = (window.currentDetailVehicleId || vehicleId || '').toString();
        if (!currentVehicleId) return 'all';
        if (type !== 'sube') return 'menu';
        const vehicle = readVehicles().find(v => String(v.id) === String(currentVehicleId));
        return (vehicle && !vehicle.branchId) ? 'detail' : 'menu';
      };

      const closeDynamicEventByOrigin = function() {
        const currentVehicleId = (window.currentDetailVehicleId || vehicleId || '').toString();
        const closeTarget = getDynamicEventCloseTarget();

        if (closeTarget === 'detail') {
          if (typeof window.closeEventModal === 'function') {
            window.closeEventModal(type);
          }
          setTimeout(function() {
            if (currentVehicleId && typeof window.showVehicleDetail === 'function') {
              window.showVehicleDetail(currentVehicleId);
            }
          }, 300);
          return;
        }

        if (currentVehicleId && typeof window.closeEventModalAndShowEventMenu === 'function') {
          window.closeEventModalAndShowEventMenu(type);
        } else {
          closeAllModals();
        }
      };

      var backBarBtn = modal.querySelector('.universal-back-btn');
      if (backBarBtn) {
        var labelSpan = backBarBtn.querySelector('.universal-back-label');
        if (labelSpan) labelSpan.textContent = getDynamicEventCloseTarget() === 'detail' ? 'Taşıt Detay' : 'Olay Ekle';
        backBarBtn.onclick = function(e) {
          e.stopPropagation();
          closeDynamicEventByOrigin();
        };
      }
      var modalCloseBtn = modal.querySelector('.modal-close');
      if (modalCloseBtn) modalCloseBtn.onclick = function(e) {
        e.stopPropagation();
        closeDynamicEventByOrigin();
      };
      var ruhsatBtnGroup = document.getElementById('ruhsat-btn-group');
      var cancelBtn = ruhsatBtnGroup ? ruhsatBtnGroup.querySelector('.universal-btn-cancel') : null;
      if (cancelBtn) cancelBtn.onclick = function(e) {
        e.stopPropagation();
        closeDynamicEventByOrigin();
      };

      formIcerik.id = 'dinamik-olay-form-icerik';
      window.currentDetailVehicleId = (vehicleId || window.currentDetailVehicleId || '').toString();
      const title = EVENT_TITLES[type] || 'OLAY EKLE';
      baslikEl.textContent = title;
      formIcerik.innerHTML = getEventFormHtml(type);
      if (!formIcerik.innerHTML.trim()) return;

      kaydetBtn.onclick = null;
      kaydetBtn.style.display = '';
      kaydetBtn.textContent = 'Kaydet';
      const saveHandlers = {
        bakim: window.saveBakimEvent,
        kaza: window.saveKazaEvent,
        ceza: window.saveCezaEvent,
        sigorta: window.updateSigortaInfo,
        kasko: window.updateKaskoInfo,
        muayene: window.updateMuayeneInfo,
        anahtar: window.updateAnahtarInfo,
        kredi: window.updateKrediInfo,
        km: window.updateKmInfo,
        lastik: window.updateLastikInfo,
        utts: window.updateUTTSInfo,
        takip: window.updateTakipCihazInfo,
        kaskokodu: window.updateKaskoKoduInfo,
        sube: window.updateSubeDegisiklik,
        kullanici: window.updateKullaniciAtama,
        satis: window.saveSatisPert
      };
      const handler = saveHandlers[type];
      if (handler) kaydetBtn.onclick = function() { handler(); };

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
        // Tramer Kaydı Evet/Hayır: seçime göre Tarih/Tutar alanlarını göster/gizle
        const tramerWrap = document.getElementById('kaza-tramer-fields-wrap');
        const tramerEvet = document.querySelector('#dinamik-olay-modal .tramer-evet');
        const tramerHayir = document.querySelector('#dinamik-olay-modal .tramer-hayir');
        if (tramerWrap && tramerEvet && tramerHayir) {
          tramerEvet.addEventListener('click', function() {
            tramerEvet.classList.add('active');
            tramerEvet.classList.remove('green');
            tramerHayir.classList.remove('active', 'green');
            // Inline style `display:none` başlangıçta verildiği için `''` her cihazda aynı davranmayabilir.
            // Evet seçilince alanların kesin açılması için platformlarda sağlam display değeri.
            tramerWrap.style.display = 'flex';
            tramerWrap.style.flexDirection = 'column';
          });
          tramerHayir.addEventListener('click', function() {
            tramerHayir.classList.add('active', 'green');
            tramerEvet.classList.remove('active');
            tramerWrap.style.display = 'none';
          });
          const tramerTutarInput = document.getElementById('kaza-tramer-tutar');
          if (tramerTutarInput) {
            tramerTutarInput.addEventListener('blur', function() {
              const value = this.value.replace(/[^\d]/g, '');
              if (value) this.value = formatNumber(value);
            });
          }
        }
      } else if (type === 'ceza') {
        const vehicle = readVehicles().find(v => String(v.id) === String(vehicleId || window.currentDetailVehicleId));
        bindCezaUserDropdown(modal, vehicle);
        const cezaTutarInput = document.getElementById('ceza-tutar');
        if (cezaTutarInput) {
          cezaTutarInput.addEventListener('blur', function() {
            const value = this.value.replace(/[^\d]/g, '');
            if (value) this.value = formatNumber(value);
          });
        }
      } else if (type === 'muayene') {
        const vid = vehicleId || window.currentDetailVehicleId;
        const vehicleMuayenePref = vid ? readVehicles().find(v => String(v.id) === String(vid)) : null;
        var muayeneDefaultGgAa = '';
        if (vehicleMuayenePref && Array.isArray(vehicleMuayenePref.events)) {
          for (var _mi = 0; _mi < vehicleMuayenePref.events.length; _mi++) {
            var _ev = vehicleMuayenePref.events[_mi];
            var _tp = String(_ev && _ev.type ? _ev.type : '').trim();
            if (_tp === 'muayene-guncelle' || _tp === 'muayene' || _tp === 'muayene-yenileme') {
              if (_ev.date != null && String(_ev.date).trim() !== '') {
                muayeneDefaultGgAa = formatDateForDisplay(_ev.date);
                if (/\s\d{2}:\d{2}$/.test(muayeneDefaultGgAa)) muayeneDefaultGgAa = muayeneDefaultGgAa.replace(/\s+\d{2}:\d{2}$/, '');
                break;
              }
            }
          }
        }
        if (!muayeneDefaultGgAa && vehicleMuayenePref && vehicleMuayenePref.muayeneDate) {
          var _vtMu = ((vehicleMuayenePref.vehicleType || vehicleMuayenePref.tip) || 'otomobil').toLowerCase();
          var _subYears = (_vtMu !== 'otomobil') ? -1 : -2;
          var _isoBack = addYears(String(vehicleMuayenePref.muayeneDate).trim(), _subYears);
          if (_isoBack) muayeneDefaultGgAa = formatDateForDisplay(_isoBack);
        }
        const muayeneTarihInput = document.getElementById('muayene-tarih');
        if (muayeneTarihInput) muayeneTarihInput.value = muayeneDefaultGgAa || formatDateForDisplay(new Date());
        const egzozCheckbox = document.getElementById('muayene-egzoz-different');
        if (egzozCheckbox) {
          egzozCheckbox.checked = false;
          egzozCheckbox.addEventListener('change', syncOlayEgzozMuayeneFields);
        }
        syncOlayEgzozMuayeneFields();
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
          selectEl.innerHTML = '<option value="">\u015Eube Se\u00E7iniz</option>';
          const branches = readBranches();
          branches.forEach(b => {
            const opt = document.createElement('option');
            opt.value = b.id;
            opt.textContent = b.name;
            selectEl.appendChild(opt);
          });
          ensureDynamicModalCustomSelect(selectEl, {
            placeholderText: 'Şube Seçiniz'
          });
        }
      } else if (type === 'kullanici') {
        // Kullanıcı atama modal'ında kullanıcıları doldur; Henüz Tanımlanmadı + en alta "+ Yeni Kullanıcı Ekle"
        const selectEl = document.getElementById('kullanici-select');
        if (selectEl) {
          const vehicle = readVehicles().find(v => String(v.id) === String(vehicleId || window.currentDetailVehicleId));
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
          if (vehicle?.assignedUserId) {
            selectEl.value = vehicle.assignedUserId;
          } else {
            selectEl.value = '__none__';
          }
          ensureDynamicModalCustomSelect(selectEl, {
            placeholderText: 'Kullanıcı Seçiniz',
            secondaryValues: ['__add_user__'],
            mutedValues: ['__none__'],
            searchable: true,
            searchPlaceholder: 'Kullanıcı Ara',
            noResultsText: 'Kullanıcı bulunamadı'
          });
          if (!selectEl.dataset.kullaniciAddHandler) {
            selectEl.dataset.kullaniciAddHandler = '1';
            selectEl.addEventListener('change', function() {
              if (selectEl.value === '__add_user__') {
                selectEl.value = '';
                dismissVehicleAssignUserSavedListener();
                const currentVehicleId = vehicleId || window.currentDetailVehicleId;
                closeEventModal('kullanici');
                setTimeout(function() {
                  if (typeof window.openUserFormModal === 'function') {
                    window.openUserFormModal(null, { fromVehicleAssign: true });
                  }
                }, 350);
                const onUserSaved = function(ev) {
                  const newId = ev.detail && ev.detail.id;
                  dismissVehicleAssignUserSavedListener();
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
                window._medisaVehicleAssignOnUserSaved = onUserSaved;
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
        const syncDetayGrow = bindOlayDetayTextareaAutogrow(detayInput);
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
              if (detayInput) setTimeout(function() { detayInput.focus(); requestAnimationFrame(syncDetayGrow); }, 100);
            } else {
              if (detayWrapper) detayWrapper.style.display = 'none';
              if (detayInput) detayInput.value = '';
              requestAnimationFrame(syncDetayGrow);
            }
          });
        });
        (function prefillAnahtarOlayFromVehicle() {
          const vPref = readVehicles().find(v => String(v.id) === String(vehicleId || window.currentDetailVehicleId));
          if (!vPref) return;
          if (vPref.anahtar === 'var') {
            const vBtn = Array.from(radioBtns).find(b => b.dataset.value === 'var');
            if (vBtn) vBtn.click();
            if (detayInput) detayInput.value = vPref.anahtarNerede != null ? String(vPref.anahtarNerede) : '';
          } else if (vPref.anahtar === 'yok') {
            const yBtn = Array.from(radioBtns).find(b => b.dataset.value === 'yok');
            if (yBtn) yBtn.click();
          }
        })();
        requestAnimationFrame(syncDetayGrow);
      } else if (type === 'kredi') {
        // Kredi modal'ında radio button handler'larını ekle
        const radioBtns = refreshModalRadioButtons(modal);
        const detayWrapper = document.getElementById('kredi-detay-wrapper-event');
        const detayInput = document.getElementById('kredi-detay-event');
        const syncDetayGrow = bindOlayDetayTextareaAutogrow(detayInput);
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
              if (detayInput) setTimeout(function() { detayInput.focus(); requestAnimationFrame(syncDetayGrow); }, 100);
            } else {
              if (detayWrapper) detayWrapper.style.display = 'none';
              if (detayInput) detayInput.value = '';
              requestAnimationFrame(syncDetayGrow);
            }
          });
        });
        (function prefillKrediOlayFromVehicle() {
          const vPref = readVehicles().find(v => String(v.id) === String(vehicleId || window.currentDetailVehicleId));
          if (!vPref) return;
          if (vPref.kredi === 'var') {
            const vBtn = Array.from(radioBtns).find(b => b.dataset.value === 'var');
            if (vBtn) vBtn.click();
            if (detayInput) detayInput.value = vPref.krediDetay != null ? String(vPref.krediDetay) : '';
          } else if (vPref.kredi === 'yok') {
            const yBtn = Array.from(radioBtns).find(b => b.dataset.value === 'yok');
            if (yBtn) yBtn.click();
          }
        })();
        requestAnimationFrame(syncDetayGrow);
      } else if (type === 'lastik') {
        // Lastik modal'ında radio button handler'larını ekle
        const radioBtns = refreshModalRadioButtons(modal);
        const adresWrapper = document.getElementById('lastik-adres-wrapper-event');
        const adresInput = document.getElementById('lastik-adres-event');
        const syncAdresGrow = bindOlayDetayTextareaAutogrow(adresInput);
        
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
              if (adresInput) setTimeout(function() { adresInput.focus(); requestAnimationFrame(syncAdresGrow); }, 100);
            } else {
              if (adresWrapper) adresWrapper.style.display = 'none';
              if (adresInput) adresInput.value = '';
              requestAnimationFrame(syncAdresGrow);
            }
          });
        });
        (function prefillLastikOlayFromVehicle() {
          const vPref = readVehicles().find(v => String(v.id) === String(vehicleId || window.currentDetailVehicleId));
          if (!vPref) return;
          if (vPref.lastikDurumu === 'var') {
            const vBtn = Array.from(radioBtns).find(b => b.dataset.value === 'var');
            if (vBtn) vBtn.click();
            if (adresInput) adresInput.value = vPref.lastikAdres != null ? String(vPref.lastikAdres) : '';
          } else if (vPref.lastikDurumu === 'yok') {
            const yBtn = Array.from(radioBtns).find(b => b.dataset.value === 'yok');
            if (yBtn) yBtn.click();
          }
        })();
        requestAnimationFrame(syncAdresGrow);
      } else if (type === 'bakim') {
        const bakimKisiInput = document.getElementById('bakim-kisi');
        if (bakimKisiInput) {
          const vehicle = readVehicles().find(v => String(v.id) === String(vehicleId || window.currentDetailVehicleId));
          if (vehicle && vehicle.tahsisKisi) bakimKisiInput.value = vehicle.tahsisKisi;
        }
        const bakimIslemler = document.getElementById('bakim-islemler');
        if (bakimIslemler && !bakimIslemler.dataset.expandBound) {
          bakimIslemler.dataset.expandBound = '1';
          bakimIslemler.addEventListener('input', function() {
            this.style.height = 'auto';
            var lineHeight = 22, minH = lineHeight * 2, maxH = lineHeight * 10;
            var newH = Math.min(Math.max(this.scrollHeight, minH), maxH);
            this.style.height = newH + 'px';
            this.style.overflow = this.scrollHeight > maxH ? 'auto' : 'hidden';
          });
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

      /* Ruhsat ekranından dönünce buton metni "Ruhsat Yükle" kalıyor; olay formlarında her zaman "Kaydet" olsun */
      var saveBtnEl = document.getElementById('dinamik-olay-kaydet-btn');
      if (saveBtnEl) saveBtnEl.textContent = 'Kaydet';
      var grp = document.getElementById('ruhsat-btn-group');
      if (grp) {
        grp.classList.remove('ruhsat-inline-view-mode', 'ruhsat-single-visible');
        grp.classList.add('olay-form-buttons');
      }

      // Modal'ı aç
      if (modal) {
        // Modal'ı hemen aç
        modal.style.display = 'flex';
        modal.classList.add('active');
        requestAnimationFrame(function() {
          var btn = document.getElementById('dinamik-olay-kaydet-btn');
          if (btn) btn.textContent = 'Kaydet';
          var g = document.getElementById('ruhsat-btn-group');
          if (g) {
            g.classList.remove('ruhsat-inline-view-mode', 'ruhsat-single-visible');
            g.classList.add('olay-form-buttons');
          }
        });
        // UTTS ve Takip modalları için event listener'ları modal açıldıktan sonra ekle
        if (type === 'utts' || type === 'takip') {
          requestAnimationFrame(() => {
            const radioBtns = refreshModalRadioButtons(modal);
            if (radioBtns.length > 0) {
              radioBtns.forEach(b => b.classList.remove('active', 'green'));
              
              radioBtns.forEach(btn => {
                btn.addEventListener('click', function(e) {
                  e.preventDefault();
                  e.stopPropagation();
                  radioBtns.forEach(b => b.classList.remove('active', 'green'));
                  this.classList.add('active');
                  if (this.dataset.value === 'evet') this.classList.add('green');
                });
              });

              const vPref = readVehicles().find(v => String(v.id) === String(vehicleId || window.currentDetailVehicleId));
              if (vPref) {
                if (type === 'utts') {
                  if (vPref.uttsTanimlandi === true) {
                    const eBtn = Array.from(radioBtns).find(b => b.dataset.value === 'evet');
                    if (eBtn) eBtn.click();
                  } else if (vPref.uttsTanimlandi === false) {
                    const hBtn = Array.from(radioBtns).find(b => b.dataset.value === 'hayir');
                    if (hBtn) hBtn.click();
                  }
                } else if (type === 'takip') {
                  if (vPref.takipCihaziMontaj === true) {
                    const eBtn = Array.from(radioBtns).find(b => b.dataset.value === 'evet');
                    if (eBtn) eBtn.click();
                  } else if (vPref.takipCihaziMontaj === false) {
                    const hBtn = Array.from(radioBtns).find(b => b.dataset.value === 'hayir');
                    if (hBtn) hBtn.click();
                  }
                }
              }
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
              
              const isMobileFallback = window.innerWidth <= 640;
              const skipDinamikDatePh = !!input.closest('#dinamik-olay-modal');
              if (!input.value && input !== document.activeElement && !skipDinamikDatePh) {
                const leftPx = isMobileFallback ? '12px' : '8px';
                const st = window.getComputedStyle(input);
                var pt = parseFloat(st.paddingTop); if (!Number.isFinite(pt)) pt = 0;
                var pb = parseFloat(st.paddingBottom); if (!Number.isFinite(pb)) pb = 0;
                var ih = parseFloat(st.height);
                if (!Number.isFinite(ih) || ih <= 0) ih = input.getBoundingClientRect().height;
                if (!Number.isFinite(ih) || ih <= 0) ih = 22;
                const parent = input.parentElement;
                const inputRect = input.getBoundingClientRect();
                const parentRect = parent ? parent.getBoundingClientRect() : inputRect;
                const inputOffsetTop = inputRect.top - parentRect.top;
                const fs = parseFloat(st.fontSize) || 10;
                const ph = fs * 1.2;
                const contentCenter = inputOffsetTop + pt + (ih - pt - pb) / 2;
                const topPx = contentCenter - ph / 2;
                const placeholder = document.createElement('span');
                placeholder.className = 'date-placeholder';
                placeholder.textContent = 'gg.aa.yyyy';
                placeholder.style.cssText = 'position: absolute; left: ' + leftPx + '; top: ' + topPx + 'px; color: #666 !important; pointer-events: none; font-size: 10px; z-index: 100; line-height: ' + ph + 'px;';
                
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
          bindGgAaYyyyTextInputs(modal);
          setupOlayGgAaYyyyPickers(modal);
          bindDinamikOlayDateInputsForIos(modal);
        }, 100);
      }
    }

    if (typeof window.syncMobileNotificationsDropdownHeight === 'function') {
      requestAnimationFrame(window.syncMobileNotificationsDropdownHeight);
    }
  }

  window.openEventModal = function(type, vehicleId) {
    var flushP = flushVehicleDetailNotesInlineSave();
    function proceed() {
      openEventModalBody(type, vehicleId);
    }
    if (flushP && typeof flushP.then === 'function') {
      flushP.then(proceed, proceed);
    } else {
      proceed();
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
    // iOS print() çağrısı geç tetiklenirse kullanıcı başka ekrana giderken prompt çıkmasını engelle.
    window.__ruhsatPrintToken = null;
    closeEventModal('ruhsat');
    setTimeout(function() {
      if (window.currentDetailVehicleId) showVehicleDetail(window.currentDetailVehicleId);
    }, 300);
  };

  /**
   * Olay Ekle alt modalından Vazgeç: modalı kapat, Olay Ekle menüsünü tekrar aç (taşıt detaya dönme).
   */
  window.closeEventModalAndShowEventMenu = function(type) {
    const vehicleId = window.currentDetailVehicleId;
    const dynamicModal = DOM.dinamikOlayModal || document.getElementById(DINAMIK_OLAY_MODAL_ID);

    // Önce menüyü aç, sonra dinamik modalı kapat:
    // böylece iki modal arasında boş frame kalmaz ve Taşıt Detay "flash" etmez.
    openEventModal('menu', vehicleId);

    requestAnimationFrame(function() {
      if (dynamicModal && dynamicModal.classList.contains('active')) {
        resetModalState(dynamicModal);
        dynamicModal.classList.remove('active');
        dynamicModal.style.display = 'none';
      } else {
        window.closeEventModal(type);
      }
    });
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

  const VEHICLE_DOCUMENT_TYPES = {
    ruhsat: {
      key: 'ruhsat',
      label: 'Ruhsat',
      title: 'RUHSAT',
      pathField: 'ruhsatPath',
      uploadButton: 'Ruhsat Yükle',
      changeLabel: 'Ruhsatı Değiştir',
      missingAlert: 'Lütfen ruhsat dosyası seçin.',
      successMessage: 'Ruhsat Başarıyla Yüklendi',
      icon: 'document'
    },
    sigorta: {
      key: 'sigorta',
      label: 'Sigorta Poliçesi',
      title: 'SİGORTA POLİÇESİ',
      pathField: 'sigortaPolicePath',
      uploadButton: 'Poliçe Yükle',
      changeLabel: 'Sigorta Poliçesini Değiştir',
      missingAlert: 'Lütfen sigorta poliçesi dosyası seçin.',
      successMessage: 'Sigorta Poliçesi Başarıyla Yüklendi',
      icon: 'shield'
    },
    kasko: {
      key: 'kasko',
      label: 'Kasko Poliçesi',
      title: 'KASKO POLİÇESİ',
      pathField: 'kaskoPolicePath',
      uploadButton: 'Poliçe Yükle',
      changeLabel: 'Kasko Poliçesini Değiştir',
      missingAlert: 'Lütfen kasko poliçesi dosyası seçin.',
      successMessage: 'Kasko Poliçesi Başarıyla Yüklendi',
      icon: 'shield'
    }
  };

  function getVehicleDocumentConfig(documentType) {
    return VEHICLE_DOCUMENT_TYPES[String(documentType || 'ruhsat').trim()] || VEHICLE_DOCUMENT_TYPES.ruhsat;
  }

  function getVehicleDocumentPath(vehicle, documentType) {
    const config = getVehicleDocumentConfig(documentType);
    return vehicle ? String(vehicle[config.pathField] || '') : '';
  }

  /**
   * Ruhsat Yükleme modalını açar; vehicle.ruhsatPath varsa görüntüleme/yenileme, yoksa yükleme UI gösterir
   */
  function setRuhsatSaveBtnVisibility(saveBtn, visible) {
    if (!saveBtn) return;
    saveBtn.style.setProperty('display', visible ? 'inline-flex' : 'none', 'important');
    const actionGroup = document.getElementById('ruhsat-btn-group') || (saveBtn.id === 'dinamik-olay-kaydet-btn' && saveBtn.closest && saveBtn.closest('.universal-btn-group'));
    if (actionGroup) actionGroup.classList.toggle('ruhsat-single-visible', !visible);
  }

  function setRuhsatInlineViewerMode(active) {
    const content = document.getElementById('ruhsat-modal-content') || (DOM.dinamikOlayFormIcerik && DOM.dinamikOlayModal && DOM.dinamikOlayModal.classList.contains('active') ? DOM.dinamikOlayFormIcerik : null);
    const actionGroup = document.getElementById('ruhsat-btn-group') || (DOM.dinamikOlayKaydetBtn && DOM.dinamikOlayKaydetBtn.closest && DOM.dinamikOlayKaydetBtn.closest('.universal-btn-group'));
    if (actionGroup) actionGroup.classList.toggle('ruhsat-inline-view-mode', !!active);
    if (content) content.classList.toggle('ruhsat-inline-view-mode', !!active);
  }

  function shouldUseInlineRuhsatViewer() {
    const hasMatchMedia = typeof window.matchMedia === 'function';
    const isMobileViewport = hasMatchMedia ? window.matchMedia('(max-width: 768px)').matches : window.innerWidth <= 768;
    const isStandalone = hasMatchMedia && (window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: fullscreen)').matches);
    const ua = navigator.userAgent || '';
    const isiOS = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    return isMobileViewport || isStandalone || isiOS;
  }

  function isAndroidDevice() {
    return /Android/i.test(navigator.userAgent || '');
  }

  function openUrlInNewTab(url, targetWindow) {
    const targetUrl = String(url || '').trim();
    if (!targetUrl) return false;

    const existingWindow = targetWindow && !targetWindow.closed ? targetWindow : null;
    if (existingWindow) {
      try {
        existingWindow.location.href = targetUrl;
        existingWindow.focus();
        return true;
      } catch (e) {}
    }

    try {
      const a = document.createElement('a');
      a.href = targetUrl;
      a.target = '_blank';
      a.rel = 'noopener';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      if (a.parentNode) a.parentNode.removeChild(a);
      return true;
    } catch (e) {
      try {
        window.open(targetUrl, '_blank', 'noopener');
        return true;
      } catch (ignored) {}
    }

    return false;
  }

  function buildPdfViewerUrl(baseUrl, fragment) {
    const cleanBase = String(baseUrl || '').split('#')[0];
    const cleanFragment = String(fragment || '').replace(/^#/, '');
    if (!cleanBase) return '';
    return cleanFragment ? (cleanBase + '#' + cleanFragment) : cleanBase;
  }

  /** ruhsat.php GET ile açılırken Bearer yerine ?token= (core.php allowQueryToken) — sekme/PDF başlığında dosya adı için blob yerine HTTP yanıtı kullanılır. */
  function appendMedisaDocumentAuthToUrl(rawUrl) {
    const base = String(rawUrl || '').trim();
    if (!base) return '';
    const token = getMedisaPortalToken();
    if (!token) return toAbsoluteRuhsatUrl(base);
    try {
      const u = new URL(base, window.location.href);
      u.searchParams.set('token', token);
      return u.toString();
    } catch (e) {
      return toAbsoluteRuhsatUrl(base);
    }
  }

  /**
   * Belgeyi yeni sekmede açar. Oturum token'ı varsa doğrudan ruhsat.php (+token) ile açılır (doğru sekme/dosya adı).
   * Token yoksa mevcut fetch + blob yedeği.
   */
  function openVehicleDocumentInNewTab(vehicleId, documentUrl, documentType, pdfViewerFragment) {
    const dt = documentType || 'ruhsat';
    const vid = String(vehicleId || window.currentDetailVehicleId || '').trim();
    let docUrl = String(documentUrl || '').trim();
    if (!docUrl) {
      docUrl = buildRuhsatDocumentUrl(vid, dt);
    }
    if (!docUrl) {
      return Promise.reject(new Error('document-url-missing'));
    }
    const fragment = typeof pdfViewerFragment === 'string' ? pdfViewerFragment : '';

    if (getMedisaPortalToken()) {
      const authed = appendMedisaDocumentAuthToUrl(docUrl);
      const target = fragment !== '' ? buildPdfViewerUrl(authed, fragment) : authed;
      openUrlInNewTab(target);
      return Promise.resolve();
    }

    return fetchRuhsatDocumentObjectUrl(vid, docUrl, dt).then(function(objectUrl) {
      const target = fragment !== '' ? buildPdfViewerUrl(objectUrl, fragment) : objectUrl;
      openUrlInNewTab(target);
    });
  }

  function getMedisaPortalToken() {
    try {
      if (typeof getStoredPortalToken === 'function') {
        return getStoredPortalToken() || '';
      }
      return localStorage.getItem('medisa_portal_token')
        || sessionStorage.getItem('medisa_portal_token')
        || localStorage.getItem('driver_token')
        || sessionStorage.getItem('driver_token')
        || '';
    } catch (e) {
      return '';
    }
  }

  function buildMedisaAuthHeaders(extraHeaders) {
    if (typeof buildAuthHeaders === 'function') {
      return buildAuthHeaders(extraHeaders || {});
    }
    const headers = Object.assign({}, extraHeaders || {});
    const token = getMedisaPortalToken();
    if (token) {
      headers.Authorization = 'Bearer ' + token;
    }
    return headers;
  }

  function buildVehicleDocumentEndpointUrl(endpoint, vehicleId, documentType) {
    const rawId = String(vehicleId || window.currentDetailVehicleId || '').trim();
    if (!rawId) return '';
    const dt = String(documentType || 'ruhsat').trim() || 'ruhsat';
    var verParam = '';
    var appTasitlar = window.appData && Array.isArray(window.appData.tasitlar) ? window.appData.tasitlar : [];
    var appV = appTasitlar.find(function(x) { return String(x.id) === rawId; });
    if (appV && appV.version != null) {
      verParam = String(Number(appV.version) || 1);
    }
    try {
      const targetUrl = new URL(endpoint, window.location.href);
      targetUrl.searchParams.set('id', rawId);
      if (verParam !== '') {
        targetUrl.searchParams.set('v', verParam);
      }
      if (dt !== 'ruhsat') {
        targetUrl.searchParams.set('documentType', dt);
      }
      return targetUrl.toString();
    } catch (e) {
      const encodedId = encodeURIComponent(rawId);
      var q = endpoint + '?id=' + encodedId;
      if (verParam !== '') {
        q += '&v=' + encodeURIComponent(verParam);
      }
      if (dt !== 'ruhsat') {
        q += '&documentType=' + encodeURIComponent(dt);
      }
      return q;
    }
  }

  function buildRuhsatPreviewUrl(vehicleId, documentType) {
    return buildVehicleDocumentEndpointUrl('ruhsat_preview.php', vehicleId, documentType || 'ruhsat');
  }

  function buildRuhsatDocumentUrl(vehicleId, documentType) {
    return buildVehicleDocumentEndpointUrl('ruhsat.php', vehicleId, documentType || 'ruhsat');
  }

  function isRuhsatImagePath(path) {
    return /\.(jpeg|jpg|png|gif|webp)(\?.*)?$/i.test(String(path || ''));
  }

  function getVehicleRuhsatPath(vehicleId) {
    const rawId = String(vehicleId || window.currentDetailVehicleId || '').trim();
    if (!rawId) return '';
    var appTasitlar = window.appData && Array.isArray(window.appData.tasitlar) ? window.appData.tasitlar : [];
    var vehicle = appTasitlar.find(function(item) { return String(item.id) === rawId; });
    if (!vehicle) {
      const vehicles = readVehicles();
      vehicle = Array.isArray(vehicles)
        ? vehicles.find(function(item) { return String(item.id) === rawId; })
        : null;
    }
    return vehicle ? String(vehicle.ruhsatPath || '') : '';
  }

  function isRuhsatImageForVehicle(vehicleId, fallbackPath) {
    const rawPath = String(fallbackPath || getVehicleRuhsatPath(vehicleId) || '');
    return isRuhsatImagePath(rawPath);
  }

  /** Ruhsat URL'ini yazdırma penceresinde kullanmak için mutlak yap. Alt dizinde (örn. /medisa/) çalışır. */
  function toAbsoluteRuhsatUrl(url) {
    const u = String(url || '').trim();
    if (!u) return '';
    if (/^https?:\/\//i.test(u)) return u;
    try {
      return new URL(u, window.location.href).href;
    } catch (e) {
      return u;
    }
  }

  var ruhsatPreviewCache = new Map();

  function getRuhsatPreviewCacheKey(vehicleId, ruhsatUrl, documentType) {
    const rawId = String(vehicleId || window.currentDetailVehicleId || '').trim();
    const absoluteUrl = toAbsoluteRuhsatUrl(ruhsatUrl);
    const dt = String(documentType || 'ruhsat').trim() || 'ruhsat';
    if (!rawId || !absoluteUrl) return '';
    var appTasitlar = window.appData && Array.isArray(window.appData.tasitlar) ? window.appData.tasitlar : [];
    var fv = appTasitlar.find(function(x) { return String(x.id) === rawId; });
    var verSeg = fv && fv.version != null ? String(Number(fv.version) || 1) : '1';
    return rawId + '::' + dt + '::' + verSeg + '::' + absoluteUrl;
  }

  function revokeRuhsatPreviewEntry(entry) {
    if (!entry || !entry.objectUrl) return;
    try {
      URL.revokeObjectURL(entry.objectUrl);
    } catch (e) {}
    entry.objectUrl = '';
  }

  function invalidateRuhsatPreviewCache(vehicleId, documentType) {
    const rawId = String(vehicleId || '').trim();
    if (!rawId || !ruhsatPreviewCache.size) return;
    const wantAll = documentType === undefined || documentType === null || documentType === '';
    const wantedType = String(documentType || 'ruhsat').trim();
    ruhsatPreviewCache.forEach(function(entry, cacheKey) {
      if (cacheKey.indexOf(rawId + '::') !== 0) return;
      const rest = cacheKey.slice((rawId + '::').length);
      const firstSeg = rest.split('::')[0];
      var keyDocType = null;
      if (firstSeg === 'ruhsat' || firstSeg === 'sigorta' || firstSeg === 'kasko') {
        keyDocType = firstSeg;
      } else if (/^\d+$/.test(firstSeg)) {
        keyDocType = 'ruhsat';
      } else {
        return;
      }
      if (!wantAll && keyDocType !== wantedType) return;
      revokeRuhsatPreviewEntry(entry);
      ruhsatPreviewCache.delete(cacheKey);
    });
  }

  var ruhsatPreviewEndpointMissing = false;

  function fetchRuhsatPreviewObjectUrl(vehicleId, ruhsatUrl, documentType) {
    const dt = documentType || 'ruhsat';
    const cacheKey = getRuhsatPreviewCacheKey(vehicleId, ruhsatUrl, dt);
    const previewUrl = buildRuhsatPreviewUrl(vehicleId, dt);
    if (!cacheKey || !previewUrl) {
      return Promise.reject(new Error('preview-key-missing'));
    }
    if (ruhsatPreviewEndpointMissing) {
      return Promise.reject(new Error('preview-endpoint-missing'));
    }

    const now = Date.now();
    const existingEntry = ruhsatPreviewCache.get(cacheKey);
    if (existingEntry) {
      if (existingEntry.objectUrl) {
        return Promise.resolve(existingEntry.objectUrl);
      }
      if (existingEntry.promise) {
        return existingEntry.promise;
      }
      if (existingEntry.cooldownUntil && existingEntry.cooldownUntil > now) {
        return Promise.reject(new Error('preview-cooldown'));
      }
    }

    const entry = existingEntry || {
      objectUrl: '',
      promise: null,
      cooldownUntil: 0
    };

    entry.promise = fetch(previewUrl, {
      method: 'GET',
      cache: 'no-store',
      headers: buildMedisaAuthHeaders()
    })
      .then(function(response) {
        var contentType = (response.headers.get('Content-Type') || '').toLowerCase();
        if (response.status === 404) {
          if (contentType.indexOf('application/json') === -1) {
            ruhsatPreviewEndpointMissing = true;
            throw Object.assign(new Error('preview-endpoint-missing'), { httpStatus: 404 });
          }
          throw Object.assign(new Error('preview-unavailable'), { httpStatus: 404 });
        }
        if (!response.ok || contentType.indexOf('image/') !== 0) {
          var pe = new Error('preview-unavailable');
          pe.httpStatus = response.status;
          throw pe;
        }
        return response.blob();
      })
      .then(function(blob) {
        revokeRuhsatPreviewEntry(entry);
        entry.objectUrl = URL.createObjectURL(blob);
        entry.promise = null;
        entry.cooldownUntil = 0;
        ruhsatPreviewCache.set(cacheKey, entry);
        return entry.objectUrl;
      })
      .catch(function(err) {
        entry.promise = null;
        entry.cooldownUntil = Date.now() + 30000;
        ruhsatPreviewCache.set(cacheKey, entry);
        throw err;
      });

    ruhsatPreviewCache.set(cacheKey, entry);
    return entry.promise;
  }

  var ruhsatDocumentCache = new Map();

  function getRuhsatDocumentCacheKey(vehicleId, ruhsatUrl, documentType) {
    const rawId = String(vehicleId || window.currentDetailVehicleId || '').trim();
    const absoluteUrl = toAbsoluteRuhsatUrl(ruhsatUrl);
    const dt = String(documentType || 'ruhsat').trim() || 'ruhsat';
    if (!rawId || !absoluteUrl) return '';
    var appTasitlar = window.appData && Array.isArray(window.appData.tasitlar) ? window.appData.tasitlar : [];
    var fv = appTasitlar.find(function(x) { return String(x.id) === rawId; });
    var verSeg = fv && fv.version != null ? String(Number(fv.version) || 1) : '1';
    return rawId + '::' + dt + '::' + verSeg + '::' + absoluteUrl;
  }

  function revokeRuhsatDocumentEntry(entry) {
    if (!entry || !entry.objectUrl) return;
    try {
      URL.revokeObjectURL(entry.objectUrl);
    } catch (e) {}
    entry.objectUrl = '';
  }

  function invalidateRuhsatDocumentCache(vehicleId, documentType) {
    const rawId = String(vehicleId || '').trim();
    if (!rawId || !ruhsatDocumentCache.size) return;
    const wantAll = documentType === undefined || documentType === null || documentType === '';
    const wantedType = String(documentType || 'ruhsat').trim();
    ruhsatDocumentCache.forEach(function(entry, cacheKey) {
      if (cacheKey.indexOf(rawId + '::') !== 0) return;
      const rest = cacheKey.slice((rawId + '::').length);
      const firstSeg = rest.split('::')[0];
      var keyDocType = null;
      if (firstSeg === 'ruhsat' || firstSeg === 'sigorta' || firstSeg === 'kasko') {
        keyDocType = firstSeg;
      } else if (/^\d+$/.test(firstSeg)) {
        keyDocType = 'ruhsat';
      } else {
        return;
      }
      if (!wantAll && keyDocType !== wantedType) return;
      revokeRuhsatDocumentEntry(entry);
      ruhsatDocumentCache.delete(cacheKey);
    });
  }

  function fetchRuhsatDocumentObjectUrl(vehicleId, ruhsatUrl, documentType) {
    const dt = documentType || 'ruhsat';
    const cacheKey = getRuhsatDocumentCacheKey(vehicleId, ruhsatUrl, dt);
    const documentUrl = buildRuhsatDocumentUrl(vehicleId, dt);
    if (!cacheKey || !documentUrl) {
      return Promise.reject(new Error('document-key-missing'));
    }

    const now = Date.now();
    const existingEntry = ruhsatDocumentCache.get(cacheKey);
    if (existingEntry) {
      if (existingEntry.objectUrl) {
        return Promise.resolve(existingEntry.objectUrl);
      }
      if (existingEntry.promise) {
        return existingEntry.promise;
      }
      if (existingEntry.cooldownUntil && existingEntry.cooldownUntil > now) {
        return Promise.reject(new Error('document-cooldown'));
      }
    }

    const entry = existingEntry || {
      objectUrl: '',
      promise: null,
      cooldownUntil: 0
    };

    entry.promise = fetch(documentUrl, {
      method: 'GET',
      cache: 'no-store',
      headers: buildMedisaAuthHeaders()
    })
      .then(function(response) {
        if (!response.ok) {
          var de = new Error(
            response.status === 404 ? 'document-not-found' : 'document-unavailable'
          );
          de.httpStatus = response.status;
          throw de;
        }
        return response.blob();
      })
      .then(function(blob) {
        revokeRuhsatDocumentEntry(entry);
        entry.objectUrl = URL.createObjectURL(blob);
        entry.promise = null;
        entry.cooldownUntil = 0;
        ruhsatDocumentCache.set(cacheKey, entry);
        return entry.objectUrl;
      })
      .catch(function(err) {
        entry.promise = null;
        entry.cooldownUntil = Date.now() + 30000;
        ruhsatDocumentCache.set(cacheKey, entry);
        throw err;
      });

    ruhsatDocumentCache.set(cacheKey, entry);
    return entry.promise;
  }

  function warmRuhsatPreview(vehicleId, ruhsatUrl, documentType) {
    const dt = documentType || 'ruhsat';
    const url = toAbsoluteRuhsatUrl(ruhsatUrl);
    var appTasitlar = window.appData && Array.isArray(window.appData.tasitlar) ? window.appData.tasitlar : [];
    var v = appTasitlar.find(function(x) { return String(x.id) === String(vehicleId); });
    if (!v) {
      v = readVehicles().find(function(x) { return String(x.id) === String(vehicleId); });
    }
    const pathForType = v ? getVehicleDocumentPath(v, dt) : '';
    if (!url || isRuhsatImageForVehicle(vehicleId, pathForType)) {
      return Promise.resolve('');
    }
    return fetchRuhsatPreviewObjectUrl(vehicleId, url, dt).catch(function() {
      return '';
    });
  }

  function hydrateRuhsatPreviewButton(previewBtn, vehicleId, ruhsatUrl, isImage, documentType) {
    if (!previewBtn) return;
    const cfg = getVehicleDocumentConfig(documentType);
    const altPreview = cfg.label + ' ön izleme';
    previewBtn.innerHTML = '<span class="ruhsat-preview-hint">Ön İzleme</span>';

    const dt = documentType || 'ruhsat';
    const loadPreview = isImage
      ? fetchRuhsatDocumentObjectUrl(vehicleId, ruhsatUrl, dt)
      : fetchRuhsatPreviewObjectUrl(vehicleId, ruhsatUrl, dt);

    loadPreview
      .then(function(objectUrl) {
        if (!previewBtn.isConnected) return;
        previewBtn.innerHTML = `<img src="${escapeHtml(objectUrl)}" alt="${escapeHtml(altPreview)}" class="ruhsat-preview-image" loading="lazy"><span class="ruhsat-preview-hint">Ön İzleme</span>`;
      })
      .catch(function() {
        if (!previewBtn.isConnected) return;
        previewBtn.innerHTML = '<span class="ruhsat-preview-hint">Ön İzleme</span>';
      });
  }

  /**
   * Mobil / iOS PWA: ön izleme ve yeni sekme açmadan doğrudan sistem yazdırma (Seçenekler) ekranını açar.
   * Aynı sayfada gizli iframe kullanır; iOS PWA'da yeni sekme açılmadığı için geri dönüş mümkün olur.
   * Masaüstü bu fonksiyonu kullanmaz (ön izleme + inline viewer kalır).
   */
  function openRuhsatPrintDialog(ruhsatUrl, vehicleId, documentType) {
    const dt = documentType || 'ruhsat';
    const url = toAbsoluteRuhsatUrl(ruhsatUrl);
    if (!url) return;
    var appTasitlar = window.appData && Array.isArray(window.appData.tasitlar) ? window.appData.tasitlar : [];
    var vehicle = appTasitlar.find(function(v) { return String(v.id) === String(vehicleId || window.currentDetailVehicleId); });
    if (!vehicle) {
      vehicle = readVehicles().find(function(v) { return String(v.id) === String(vehicleId || window.currentDetailVehicleId); });
    }
    const documentPath = vehicle ? getVehicleDocumentPath(vehicle, dt) : '';
    const isImage = isRuhsatImageForVehicle(vehicleId, documentPath);
    const documentUrl = buildRuhsatDocumentUrl(vehicleId, dt) || url;
    if (isAndroidDevice()) {
      if (isImage) {
        openVehicleDocumentInNewTab(vehicleId, documentUrl, dt, '')
          .catch(function() {
            if (typeof window.viewRuhsatPdf === 'function') window.viewRuhsatPdf(vehicleId, dt);
          });
        return;
      }

      openVehicleDocumentInNewTab(vehicleId, documentUrl, dt, 'toolbar=0&navpanes=0&zoom=page-width&view=FitH')
        .catch(function() {
          if (typeof window.viewRuhsatPdf === 'function') window.viewRuhsatPdf(vehicleId, dt);
        });
      return;
    }

    // iOS: print() geç tetiklenirse kullanıcı gesture dışına çıkıp prompt üretebilir.
    // Token geçersizleşince iframe.onload/setTimeout içinden gelen print çağrısını iptal ediyoruz.
    var printToken = 'ruhsatPrint_' + Date.now();
    window.__ruhsatPrintToken = printToken;

    var iframe = document.getElementById('ruhsat-print-frame');
    var fallbackOpenUrl = '';

    var iframeJustCreated = false;
    if (!iframe) {
      iframe = document.createElement('iframe');
      iframe.id = 'ruhsat-print-frame';
      iframe.setAttribute('aria-hidden', 'true');
      document.body.appendChild(iframe);
      iframeJustCreated = true;
    }
    // iOS basıma uygun: tam viewport, ekranda görünmez (opacity:0), tam sayfa baskı için 100vw/100vh
    iframe.style.cssText = window.MEDISA_PRINT_IFRAME_CSS_TEXT || 'position:fixed;left:0;top:0;width:100vw;height:100vh;border:0;opacity:0.01;pointer-events:none;visibility:visible;transform:translateX(-200vw);background:#fff;z-index:-1;';
    var lastOnloadAt = 0;
    var printTimer = null;
    function clearPrintTimer() {
      if (printTimer) {
        clearTimeout(printTimer);
        printTimer = null;
      }
    }
    function schedulePrint(delayMs) {
      clearPrintTimer();
      printTimer = setTimeout(function() {
        printTimer = null;
        doPrint();
      }, delayMs);
    }
    function loadImageForPrint(imageUrl) {
      fallbackOpenUrl = imageUrl;
      var printCss = '<style>@media print{ body{margin:0;} img{width:100% !important;height:auto !important;max-width:100%;display:block;} }</style>';
      var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' + printCss + '<title>Ruhsat</title></head><body style="margin:0;"><img src="' + escapeHtml(imageUrl) + '" style="width:100%;height:auto;max-width:100%;display:block;"></body></html>';
      try { iframe.removeAttribute('src'); } catch (removeSrcErr) {}
      iframe.srcdoc = html;
      iframe.onload = function() {
        iframe.onload = null;
        try {
          var doc = iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document);
          var img = doc ? doc.querySelector('img') : null;
          if (img && !img.complete) {
            img.onload = function() {
              img.onload = null;
              img.onerror = null;
              schedulePrint(120);
            };
            img.onerror = function() {
              img.onload = null;
              img.onerror = null;
              schedulePrint(240);
            };
            return;
          }
        } catch (imageLoadErr) {}
        schedulePrint(120);
      };
    }
    function loadPdfForPrint(pdfUrl) {
      fallbackOpenUrl = pdfUrl;
      try { iframe.removeAttribute('srcdoc'); } catch (removeSrcdocErr) {}
      iframe.onload = function() {
        lastOnloadAt = Date.now();
        iframe.onload = null;
        schedulePrint(900);
      };
      iframe.src = pdfUrl;
    }
    function doPrint() {
      try {
        if (window.__ruhsatPrintToken !== printToken) {
          return;
        }

        if (iframe.contentWindow && typeof iframe.contentWindow.print === 'function') {
          try { iframe.contentWindow.focus(); } catch (focusErr) {}
          iframe.contentWindow.print();
        }
      } catch (e) {
        if (typeof console !== 'undefined' && console.warn) console.warn('Ruhsat print failed', e);
        if (fallbackOpenUrl) {
          if (getMedisaPortalToken()) {
            const authedFb = appendMedisaDocumentAuthToUrl(documentUrl);
            const fbTarget = isImage
              ? authedFb
              : buildPdfViewerUrl(authedFb, 'toolbar=0&navpanes=0&zoom=page-width&view=FitH');
            openUrlInNewTab(fbTarget);
          } else {
            openUrlInNewTab(fallbackOpenUrl);
          }
        } else if (typeof window.viewRuhsatPdf === 'function') {
          window.viewRuhsatPdf(vehicleId, dt);
        }
      }
    }

    if (isImage) {
      if (getMedisaPortalToken()) {
        loadImageForPrint(appendMedisaDocumentAuthToUrl(documentUrl));
        return;
      }
      fetchRuhsatDocumentObjectUrl(vehicleId, documentUrl, dt)
        .then(function(documentObjectUrl) {
          if (window.__ruhsatPrintToken !== printToken) {
            return;
          }
          loadImageForPrint(documentObjectUrl);
        })
        .catch(function() {
          if (window.__ruhsatPrintToken !== printToken) {
            return;
          }
          if (typeof window.viewRuhsatPdf === 'function') window.viewRuhsatPdf(vehicleId, dt);
        });
      return;
    }

    if (getMedisaPortalToken()) {
      loadPdfForPrint(
        buildPdfViewerUrl(
          appendMedisaDocumentAuthToUrl(documentUrl),
          'toolbar=0&navpanes=0&zoom=page-width&view=FitH'
        )
      );
      return;
    }
    fetchRuhsatDocumentObjectUrl(vehicleId, documentUrl, dt)
      .then(function(documentObjectUrl) {
        if (window.__ruhsatPrintToken !== printToken) {
          return;
        }
        loadPdfForPrint(buildPdfViewerUrl(documentObjectUrl, 'toolbar=0&navpanes=0&zoom=page-width&view=FitH'));
      })
      .catch(function() {
        if (window.__ruhsatPrintToken !== printToken) {
          return;
        }
        if (typeof window.viewRuhsatPdf === 'function') window.viewRuhsatPdf(vehicleId, dt);
      });
  }

  function resolveRuhsatUrl(path, vehicleId, documentType) {
    const dt = String(documentType || 'ruhsat').trim() || 'ruhsat';
    const rawId = String(vehicleId || window.currentDetailVehicleId || '').trim();
    if (rawId) {
      return buildRuhsatDocumentUrl(rawId, dt);
    }
    const raw = String(path || '').trim();
    if (!raw) return '';
    try {
      const u = new URL(raw, window.location.href);
      if (String(u.pathname || '').replace(/\\/g, '/').indexOf('ruhsat.php') !== -1 && u.searchParams.get('id')) {
        const idQ = u.searchParams.get('id');
        const dtc = u.searchParams.get('documentType') || dt;
        return buildRuhsatDocumentUrl(idQ, dtc);
      }
    } catch (e2) {}
    return raw;
  }

  function renderInlineRuhsatViewer(vehicleId, url, options, documentType) {
    const dt = documentType || 'ruhsat';
    const cfg = getVehicleDocumentConfig(dt);
    const content = document.getElementById('ruhsat-modal-content') || DOM.dinamikOlayFormIcerik;
    const saveBtn = document.getElementById('ruhsat-save-btn') || DOM.dinamikOlayKaydetBtn;
    if (!content || !saveBtn) return false;
    const viewerOptions = options || {};
    var appTasitlar = window.appData && Array.isArray(window.appData.tasitlar) ? window.appData.tasitlar : [];
    var vehicle = appTasitlar.find(function(v) { return String(v.id) === String(vehicleId || window.currentDetailVehicleId); });
    if (!vehicle) {
      vehicle = readVehicles().find(function(v) { return String(v.id) === String(vehicleId || window.currentDetailVehicleId); });
    }
    const documentPath = vehicle ? getVehicleDocumentPath(vehicle, dt) : '';
    const isImage = isRuhsatImageForVehicle(vehicleId, documentPath);
    const documentUrl = buildRuhsatDocumentUrl(vehicleId, dt) || toAbsoluteRuhsatUrl(url);
    let loadedPrintUrl = '';

    setRuhsatInlineViewerMode(true);
    setRuhsatSaveBtnVisibility(saveBtn, false);
    content.innerHTML = '';

    const frameWrap = document.createElement('div');
    frameWrap.className = 'ruhsat-inline-frame-wrap';
    const frame = document.createElement('iframe');
    frame.className = 'ruhsat-inline-frame';
    frame.src = 'about:blank';
    frame.setAttribute('title', isImage ? (cfg.label + ' Görsel') : (cfg.label + ' PDF'));
    frameWrap.appendChild(frame);

    const actionsWrap = document.createElement('div');
    actionsWrap.className = 'ruhsat-inline-actions';

    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'ruhsat-inline-back-btn';
    backBtn.textContent = '\u2190 Geri D\u00F6n';
    backBtn.onclick = function() {
      setRuhsatInlineViewerMode(false);
      if (typeof window.openVehicleDocumentModal === 'function') {
        window.openVehicleDocumentModal(vehicleId, dt);
      }
    };
    actionsWrap.appendChild(backBtn);

    if (viewerOptions.showPrintButton) {
      const printBtn = document.createElement('button');
      printBtn.type = 'button';
      printBtn.className = 'ruhsat-inline-print-btn';
      printBtn.textContent = '\u2399 Yazd\u0131r / Payla\u015F';
      printBtn.onclick = function() {
        const fallbackUrl = loadedPrintUrl || '';
        if (viewerOptions.forceExternalPrint) {
          if (getMedisaPortalToken()) {
            const op = appendMedisaDocumentAuthToUrl(documentUrl);
            openUrlInNewTab(
              isImage ? op : buildPdfViewerUrl(op, 'toolbar=1&navpanes=0&zoom=page-width&view=FitH')
            );
          } else if (fallbackUrl) {
            openUrlInNewTab(fallbackUrl);
          } else if (typeof window.viewRuhsatPdf === 'function') {
            window.viewRuhsatPdf(vehicleId, dt);
          }
          return;
        }
        try {
          if (frame && frame.contentWindow && typeof frame.contentWindow.print === 'function') {
            frame.contentWindow.focus();
            frame.contentWindow.print();
            return;
          }
        } catch (e) {
          console.warn('Inline print failed, fallback to new tab', e);
        }
        if (getMedisaPortalToken()) {
          const op2 = appendMedisaDocumentAuthToUrl(documentUrl);
          openUrlInNewTab(
            isImage ? op2 : buildPdfViewerUrl(op2, 'toolbar=1&navpanes=0&zoom=page-width&view=FitH')
          );
        } else if (fallbackUrl) {
          openUrlInNewTab(fallbackUrl);
        } else if (typeof window.viewRuhsatPdf === 'function') {
          window.viewRuhsatPdf(vehicleId, dt);
        }
      };
      actionsWrap.appendChild(printBtn);
    }

    content.appendChild(actionsWrap);
    content.appendChild(frameWrap);
    if (getMedisaPortalToken()) {
      const authedInline = appendMedisaDocumentAuthToUrl(documentUrl);
      loadedPrintUrl = isImage
        ? authedInline
        : buildPdfViewerUrl(authedInline, 'toolbar=1&navpanes=0&zoom=page-fit&view=FitH');
      frame.src = loadedPrintUrl;
    } else {
      fetchRuhsatDocumentObjectUrl(vehicleId, documentUrl, dt)
      .then(function(objectUrl) {
        if (!frame.isConnected) return;
        loadedPrintUrl = isImage
          ? objectUrl
          : buildPdfViewerUrl(objectUrl, 'toolbar=1&navpanes=0&zoom=page-fit&view=FitH');
        frame.src = loadedPrintUrl;
      })
      .catch(function(err) {
        console.error(cfg.label + ' görüntüleme hazırlanamadı', err);
        var st = err && err.httpStatus;
        if (st === 404) {
          alert(cfg.label + ' veya taşıt kaydı sunucuda bulunamadı (dosya eksik veya veri senkron değil). Sayfayı yenileyip tekrar deneyin.');
        } else if (st === 401 || st === 403) {
          alert('Bu belge için oturum veya yetki yetersiz. Tekrar giriş yapmayı deneyin.');
        }
      });
    }
    return true;
  }

  window.openVehicleDocumentsModal = function(vehicleId) {
    const vid = (vehicleId || window.currentDetailVehicleId || '').toString();
    if (!vid) return;
    window.currentDetailVehicleId = vid;
    var appTasitlar = window.appData && Array.isArray(window.appData.tasitlar) ? window.appData.tasitlar : [];
    var vehicle = appTasitlar.find(function(v) { return String(v.id) === vid; });
    if (!vehicle) {
      vehicle = readVehicles().find(function(v) { return String(v.id) === vid; });
    }
    const modal = DOM.dinamikOlayModal;
    const content = DOM.dinamikOlayFormIcerik;
    const saveBtn = DOM.dinamikOlayKaydetBtn;
    if (!modal || !content || !saveBtn) return;
    if (DOM.dinamikOlayBaslik) DOM.dinamikOlayBaslik.textContent = 'BELGELER';
    content.id = 'ruhsat-modal-content';
    content.classList.add('vehicle-documents-picker-mode');
    var backBarBtn = modal ? modal.querySelector('.universal-back-btn') : null;
    if (backBarBtn) {
      var labelSpan = backBarBtn.querySelector('.universal-back-label');
      if (labelSpan) labelSpan.textContent = 'Taşıt Detay';
      backBarBtn.onclick = function(e) { e.stopPropagation(); if (typeof window.closeRuhsatAndBackToDetail === 'function') window.closeRuhsatAndBackToDetail(); };
    }
    var modalCloseBtn = modal ? modal.querySelector('.modal-close') : null;
    if (modalCloseBtn) modalCloseBtn.onclick = function(e) { e.stopPropagation(); if (typeof window.closeRuhsatAndBackToDetail === 'function') window.closeRuhsatAndBackToDetail(); };
    var cancelBtn = document.getElementById('ruhsat-btn-group') ? document.getElementById('ruhsat-btn-group').querySelector('.universal-btn-cancel') : null;
    if (cancelBtn) cancelBtn.onclick = function(e) { e.stopPropagation(); if (typeof window.closeRuhsatAndBackToDetail === 'function') window.closeRuhsatAndBackToDetail(); };
    saveBtn.onclick = null;
    setRuhsatInlineViewerMode(false);
    content.innerHTML = '';
    var ruhsatGrp = document.getElementById('ruhsat-btn-group');
    if (ruhsatGrp) ruhsatGrp.classList.remove('olay-form-buttons');
    setRuhsatSaveBtnVisibility(saveBtn, false);

    const picker = document.createElement('div');
    picker.className = 'vehicle-document-picker';
    ['ruhsat', 'sigorta', 'kasko'].forEach(function(docKey) {
      const cfg = VEHICLE_DOCUMENT_TYPES[docKey];
      const hasDoc = !!getVehicleDocumentPath(vehicle, docKey);
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'vehicle-document-card';
      card.setAttribute('aria-label', cfg.label);
      const iconWrap = document.createElement('div');
      iconWrap.className = 'vehicle-document-icon-wrap';
      iconWrap.innerHTML = cfg.icon === 'shield'
        ? '<svg class="vehicle-document-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>'
        : '<svg class="vehicle-document-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg>';
      const labelEl = document.createElement('div');
      labelEl.className = 'vehicle-document-label';
      labelEl.textContent = cfg.label;
      const statusEl = document.createElement('div');
      statusEl.className = 'vehicle-document-status';
      statusEl.textContent = hasDoc ? 'Görüntüle / Değiştir' : 'Yükle';
      card.appendChild(iconWrap);
      card.appendChild(labelEl);
      card.appendChild(statusEl);
      card.onclick = function(e) {
        e.preventDefault();
        e.stopPropagation();
        window.openVehicleDocumentModal(vid, docKey);
      };
      picker.appendChild(card);
    });
    content.appendChild(picker);

    modal.style.display = 'flex';
    requestAnimationFrame(function() { modal.classList.add('active'); });
  };

  window.openVehicleDocumentModal = function(vehicleId, documentType) {
    const dt = String(documentType || 'ruhsat').trim() || 'ruhsat';
    const cfg = getVehicleDocumentConfig(dt);
    const vid = (vehicleId || window.currentDetailVehicleId || '').toString();
    if (!vid) return;
    window.currentDetailVehicleId = vid;
    var appTasitlar = window.appData && Array.isArray(window.appData.tasitlar) ? window.appData.tasitlar : [];
    var vehicle = appTasitlar.find(function(v) { return String(v.id) === vid; });
    if (!vehicle) {
      vehicle = readVehicles().find(function(v) { return String(v.id) === vid; });
    }
    const modal = DOM.dinamikOlayModal;
    const content = DOM.dinamikOlayFormIcerik;
    const saveBtn = DOM.dinamikOlayKaydetBtn;
    if (!modal || !content || !saveBtn) return;
    if (DOM.dinamikOlayBaslik) DOM.dinamikOlayBaslik.textContent = cfg.title + ' YÜKLEME';
    content.id = 'ruhsat-modal-content';
    content.classList.remove('vehicle-documents-picker-mode');
    var backBarBtn = modal ? modal.querySelector('.universal-back-btn') : null;
    if (backBarBtn) {
      var labelSpan = backBarBtn.querySelector('.universal-back-label');
      if (labelSpan) labelSpan.textContent = 'Belgeler';
      backBarBtn.onclick = function(e) { e.stopPropagation(); window.openVehicleDocumentsModal(vid); };
    }
    var modalCloseBtn = modal ? modal.querySelector('.modal-close') : null;
    if (modalCloseBtn) modalCloseBtn.onclick = function(e) { e.stopPropagation(); if (typeof window.closeRuhsatAndBackToDetail === 'function') window.closeRuhsatAndBackToDetail(); };
    var cancelBtn = document.getElementById('ruhsat-btn-group') ? document.getElementById('ruhsat-btn-group').querySelector('.universal-btn-cancel') : null;
    if (cancelBtn) cancelBtn.onclick = function(e) { e.stopPropagation(); window.openVehicleDocumentsModal(vid); };
    saveBtn.onclick = function() { if (typeof window.saveRuhsatUpload === 'function') window.saveRuhsatUpload(dt); };
    setRuhsatInlineViewerMode(false);
    content.innerHTML = '';
    var ruhsatGrp = document.getElementById('ruhsat-btn-group');
    if (ruhsatGrp) ruhsatGrp.classList.remove('olay-form-buttons');
    setRuhsatSaveBtnVisibility(saveBtn, false);
    saveBtn.textContent = cfg.uploadButton;
    const pathVal = getVehicleDocumentPath(vehicle, dt);
    const hasDoc = !!pathVal;
    if (hasDoc) {
      const ruhsatUrl = resolveRuhsatUrl(pathVal, vid, dt);
      const ruhsatIsImage = isRuhsatImagePath(pathVal);
      const isMobileViewport = (typeof window.matchMedia === 'function')
        ? window.matchMedia('(max-width: 640px)').matches
        : (window.innerWidth <= 640);
      if (isMobileViewport && !ruhsatIsImage) {
        warmRuhsatPreview(vid, ruhsatUrl, dt);
      }
      const btnGroup = document.createElement('div');
      btnGroup.className = 'universal-btn-group ruhsat-preview-row';

      const previewBtn = document.createElement('button');
      previewBtn.type = 'button';
      previewBtn.className = 'ruhsat-preview-link';
      previewBtn.setAttribute('aria-label', cfg.label + ' Yazdır / Görüntüle');
      if (isMobileViewport) {
        previewBtn.classList.add('ruhsat-preview-mobile-btn');
        previewBtn.style.cssText = 'background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.2); cursor: pointer; display: flex; flex-direction: row; align-items: center; justify-content: center; gap: 8px; width: auto; min-width: 140px; height: 48px; border-radius: 8px; padding: 0 16px;';
        previewBtn.innerHTML = `
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0; color:#d40000;">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
            <polyline points="10 9 9 9 8 9"></polyline>
          </svg>
          <span style="font-size:15px; font-weight:600; color:#fff; letter-spacing:0.5px;">Yazdır</span>
        `;
        previewBtn.onclick = function(e) {
          e.preventDefault();
          e.stopPropagation();
          openRuhsatPrintDialog(ruhsatUrl, vid, dt);
        };
      } else {
        const previewSrc = 'about:blank';
        const prevAlt = cfg.label + ' Ön İzleme';
        previewBtn.innerHTML = ruhsatIsImage
          ? `<img src="${escapeHtml(previewSrc)}" alt="${escapeHtml(prevAlt)}" class="ruhsat-preview-image" loading="lazy"><span class="ruhsat-preview-hint">Ön İzleme</span>`
          : `<iframe src="${escapeHtml(previewSrc)}" title="${escapeHtml(prevAlt)}" loading="lazy" tabindex="-1" aria-hidden="true"></iframe><span class="ruhsat-preview-hint">Ön İzleme</span>`;
        previewBtn.onclick = function(e) {
          e.preventDefault();
          e.stopPropagation();
          if (shouldUseInlineRuhsatViewer()) {
            renderInlineRuhsatViewer(vid, ruhsatUrl, { showPrintButton: true, forceExternalPrint: true }, dt);
          } else {
            window.viewRuhsatPdf(vid, dt);
          }
        };
      }
      if (!isMobileViewport) {
        hydrateRuhsatPreviewButton(previewBtn, vid, ruhsatUrl, ruhsatIsImage, dt);
      }
      btnGroup.appendChild(previewBtn);

      const replaceBtn = document.createElement('button');
      replaceBtn.type = 'button';
      replaceBtn.className = 'ruhsat-add-btn';
      replaceBtn.setAttribute('aria-label', cfg.changeLabel);
      replaceBtn.innerHTML = '+';
      replaceBtn.onclick = function() {
        renderRuhsatUploadForm(content, saveBtn, true, dt);
      };
      btnGroup.appendChild(replaceBtn);
      content.appendChild(btnGroup);
    } else {
      renderRuhsatUploadForm(content, saveBtn, false, dt);
    }
    modal.style.display = 'flex';
    requestAnimationFrame(function() { modal.classList.add('active'); });
  };

  window.openRuhsatModal = function(vehicleId) {
    return window.openVehicleDocumentsModal(vehicleId);
  };

  function renderRuhsatUploadForm(content, saveBtn, hasExistingRuhsat, documentType) {
    const cfg = getVehicleDocumentConfig(documentType);
    content.innerHTML = '';
    const uploadBox = document.createElement('div');
    uploadBox.className = 'ruhsat-upload-box';
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf,.pdf';
    input.id = 'ruhsat-file-input';
    input.setAttribute('aria-label', cfg.label + ' dosyası seç');
    input.style.display = 'none';
    const selectBox = document.createElement('button');
    selectBox.type = 'button';
    selectBox.className = 'ruhsat-select-box';
    selectBox.setAttribute('aria-label', cfg.label + ' dosyası seç');
    selectBox.innerHTML = '<span class="ruhsat-select-box-icon" aria-hidden="true">+</span><span class="ruhsat-select-box-label">Dosya Seç</span>';
    selectBox.onclick = function() { input.click(); };
    uploadBox.appendChild(selectBox);
    uploadBox.appendChild(input);
    content.appendChild(uploadBox);
    var hintEl = document.createElement('p');
    hintEl.className = 'ruhsat-upload-hint';
    hintEl.id = 'ruhsat-upload-hint';
    hintEl.textContent = 'Dosyayı seçtikten sonra alttaki «' + cfg.uploadButton + '» ile sunucuya gönderilir.';
    content.appendChild(hintEl);
    var progressWrap = document.createElement('div');
    progressWrap.className = 'ruhsat-upload-progress';
    progressWrap.id = 'ruhsat-upload-progress';
    progressWrap.setAttribute('hidden', '');
    progressWrap.setAttribute('aria-hidden', 'true');
    progressWrap.innerHTML =
      '<div class="ruhsat-upload-progress-label" id="ruhsat-upload-progress-label">Gönderiliyor</div>' +
      '<div class="ruhsat-upload-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" id="ruhsat-upload-progress-track">' +
      '<div class="ruhsat-upload-progress-bar" id="ruhsat-upload-progress-bar" style="width:0%"></div>' +
      '</div>' +
      '<div class="ruhsat-upload-progress-pct" id="ruhsat-upload-progress-pct">0%</div>';
    content.appendChild(progressWrap);
    input.onchange = function() {
      const hasFile = input.files.length > 0;
      setRuhsatSaveBtnVisibility(saveBtn, hasFile);
      if (selectBox) {
        if (hasFile) {
          selectBox.classList.add('upload-success');
          selectBox.classList.remove('has-file');
          selectBox.innerHTML = '<span class="ruhsat-select-box-icon" aria-hidden="true">\u2713</span><span class="ruhsat-select-box-label">' + (input.files[0].name || 'Seçildi') + '</span>';
        } else {
          selectBox.classList.remove('upload-success');
          selectBox.classList.remove('has-file');
          selectBox.innerHTML = '<span class="ruhsat-select-box-icon" aria-hidden="true">+</span><span class="ruhsat-select-box-label">Dosya Seç</span>';
        }
      }
    };
    setRuhsatSaveBtnVisibility(saveBtn, input.files.length > 0);
  }

  function setRuhsatUploadProgressVisible(visible, percent, indeterminate) {
    var wrap = document.getElementById('ruhsat-upload-progress');
    var bar = document.getElementById('ruhsat-upload-progress-bar');
    var pctEl = document.getElementById('ruhsat-upload-progress-pct');
    var labelEl = document.getElementById('ruhsat-upload-progress-label');
    var track = document.getElementById('ruhsat-upload-progress-track');
    if (!wrap) return;
    if (visible) {
      wrap.removeAttribute('hidden');
      wrap.setAttribute('aria-hidden', 'false');
    } else {
      wrap.setAttribute('hidden', '');
      wrap.setAttribute('aria-hidden', 'true');
    }
    var p = typeof percent === 'number' ? Math.max(0, Math.min(100, Math.round(percent))) : 0;
    if (bar) {
      bar.classList.toggle('ruhsat-upload-progress-bar--indeterminate', !!indeterminate);
      if (indeterminate) {
        bar.style.width = '';
      } else {
        bar.style.width = p + '%';
      }
    }
    if (pctEl) {
      pctEl.textContent = indeterminate ? '…' : (p + '%');
      pctEl.classList.toggle('ruhsat-upload-progress-pct--indeterminate', !!indeterminate);
    }
    if (labelEl) {
      labelEl.textContent = indeterminate ? 'Bağlanıyor…' : 'Sunucuya gönderiliyor';
    }
    if (track) {
      track.setAttribute('aria-valuenow', indeterminate ? '0' : String(p));
    }
  }

  function uploadVehicleDocumentXHR(formData, onProgress) {
    return new Promise(function(resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', 'upload_ruhsat.php');
      var headers = buildMedisaAuthHeaders();
      Object.keys(headers).forEach(function(k) {
        var v = headers[k];
        if (v == null || String(k).toLowerCase() === 'content-type') return;
        xhr.setRequestHeader(k, v);
      });
      xhr.upload.onprogress = function(ev) {
        if (typeof onProgress !== 'function') return;
        if (ev.lengthComputable) {
          onProgress({ loaded: ev.loaded, total: ev.total, lengthComputable: true });
        } else {
          onProgress({ lengthComputable: false });
        }
      };
      xhr.onload = function() {
        var raw = xhr.responseText || '';
        var data = {};
        try {
          data = raw ? JSON.parse(raw) : {};
        } catch (e) {
          data = {};
        }
        var st = xhr.status;
        if (st < 200 || st >= 300 || !data.success) {
          var err = new Error((data && (data.error || data.message)) ? (data.error || data.message) : ('Yükleme başarısız (HTTP ' + st + ')'));
          err.status = st;
          err.conflict = !!(data && data.conflict) || st === 409;
          reject(err);
          return;
        }
        resolve(data);
      };
      xhr.onerror = function() {
        reject(new Error('Ağ hatası'));
      };
      xhr.send(formData);
    });
  }

  function setRuhsatUploadUiLocked(locked) {
    var saveBtn = document.getElementById('dinamik-olay-kaydet-btn') || DOM.dinamikOlayKaydetBtn;
    var grp = document.getElementById('ruhsat-btn-group');
    var cancelBtn = grp ? grp.querySelector('.universal-btn-cancel') : null;
    var selectBox = document.querySelector('#ruhsat-modal-content .ruhsat-select-box');
    if (saveBtn) saveBtn.disabled = !!locked;
    if (cancelBtn) cancelBtn.disabled = !!locked;
    if (selectBox) selectBox.classList.toggle('ruhsat-select-box--uploading', !!locked);
    var inputEl = document.getElementById('ruhsat-file-input');
    if (inputEl) inputEl.disabled = !!locked;
  }

  /**
   * Ruhsat dosyasını upload_ruhsat.php'ye POST eder
   */
  window.saveRuhsatUpload = function(documentType) {
    const cfg = getVehicleDocumentConfig(documentType);
    const input = document.getElementById('ruhsat-file-input');
    const vehicleId = (window.currentDetailVehicleId || '').toString();
    const vehicles = window.appData?.tasitlar || [];
    const vehicle = vehicles.find(function(x) { return String(x.id) === String(vehicleId); });
    if (!input || !input.files || !input.files[0] || !vehicleId || !vehicle) {
      alert(cfg.missingAlert);
      return;
    }
    const formData = new FormData();
    formData.append('vehicleId', vehicleId);
    formData.append('vehicleVersion', String(Number(vehicle.version) || 1));
    formData.append('documentType', cfg.key);
    formData.append('document', input.files[0]);
    setRuhsatUploadProgressVisible(true, 0, true);
    setRuhsatUploadUiLocked(true);
    uploadVehicleDocumentXHR(formData, function(info) {
      if (!info || info.lengthComputable === false) {
        setRuhsatUploadProgressVisible(true, 0, true);
      } else {
        var pct = info.total ? Math.round(100 * info.loaded / info.total) : 0;
        setRuhsatUploadProgressVisible(true, pct, false);
      }
    })
      .then(function(data) {
        setRuhsatUploadProgressVisible(false, 0, false);
        setRuhsatUploadUiLocked(false);
        invalidateRuhsatPreviewCache(vehicleId, cfg.key);
        invalidateRuhsatDocumentCache(vehicleId, cfg.key);
        const currentVehicles = window.appData?.tasitlar || [];
        const v = currentVehicles.find(function(x) { return String(x.id) === String(vehicleId); });
        if (v) {
          var newPath = data.documentPath || data.ruhsatPath;
          if (newPath) {
            v[cfg.pathField] = newPath;
          }
          if (data.vehicleVersion != null) {
            v.version = Number(data.vehicleVersion) || v.version;
          }
        }

        const selectBox = document.querySelector('#ruhsat-modal-content .ruhsat-select-box');
        if (selectBox && input.files && input.files[0]) {
          selectBox.classList.remove('has-file');
          selectBox.classList.add('upload-success');
          selectBox.textContent = '\u2713 ' + cfg.successMessage;
        }

        setRuhsatSaveBtnVisibility(document.getElementById('ruhsat-save-btn') || DOM.dinamikOlayKaydetBtn, false);
        if (typeof showToast === 'function') {
          showToast(cfg.successMessage, 'success');
        }

        const modal = DOM.dinamikOlayModal;
        const isStillOpen = !!(modal && modal.style.display !== 'none');
        if (isStillOpen && String(window.currentDetailVehicleId || '') === String(vehicleId)) {
          window.openVehicleDocumentModal(vehicleId, cfg.key);
        }
        if (typeof window.showVehicleDetail === 'function') {
          try {
            window.showVehicleDetail(vehicleId);
          } catch (e) {}
        }
      })
      .catch(function(err) {
        setRuhsatUploadProgressVisible(false, 0, false);
        setRuhsatUploadUiLocked(false);
        console.error(err);
        const msg = String((err && err.message) || '').toLowerCase();
        const isConflict = !!(err && (err.conflict || msg.indexOf('guncel veriler y') !== -1 || msg.indexOf('güncel veriler y') !== -1));
        if (isConflict) {
          const afterRefresh = function() {
            if (String(window.currentDetailVehicleId || '') === String(vehicleId)) {
              window.openVehicleDocumentModal(vehicleId, cfg.key);
            }
          };
          if (typeof window.loadDataFromServer === 'function') {
            window.loadDataFromServer(false).then(afterRefresh).catch(afterRefresh);
          } else {
            afterRefresh();
          }
          alert('Bu taşıt başka biri tarafından güncellenmiş. Güncel veriler yüklendi, lütfen dosyayı yeniden seçip tekrar kaydedin.');
          return;
        }
        alert((err && err.message) ? err.message : 'Y\u00fckleme s\u0131ras\u0131nda hata olu\u015ftu.');
      });
  };

  /**
   * Ruhsat PDF'ini görüntüler / yazdırır
   */
  window.viewRuhsatPdf = function(vehicleId, documentType) {
    const dt = documentType || 'ruhsat';
    const cfg = getVehicleDocumentConfig(dt);
    const vid = (vehicleId || window.currentDetailVehicleId || '').toString();
    if (!vid) return;

    var appTasitlar = window.appData && Array.isArray(window.appData.tasitlar) ? window.appData.tasitlar : [];
    var vehicle = appTasitlar.find(function(v) { return String(v.id) === vid; });
    if (!vehicle) {
      vehicle = readVehicles().find(function(v) { return String(v.id) === vid; });
    }
    const docPath = vehicle ? getVehicleDocumentPath(vehicle, dt) : '';
    if (!vehicle || !docPath) return;

    const url = buildRuhsatDocumentUrl(vid, dt) || resolveRuhsatUrl(docPath, vid, dt);
    const isImage = isRuhsatImagePath(docPath);
    openVehicleDocumentInNewTab(vid, url, dt,
      isImage ? '' : 'toolbar=1&navpanes=0&zoom=page-width&view=FitH'
    ).catch(function(err) {
      console.error(cfg.label + ' açılamadı', err);
      var st = err && err.httpStatus;
      var msg = cfg.label + ' görüntülenemedi.';
      if (st === 404) {
        msg = cfg.label + ' veya taşıt kaydı sunucuda bulunamadı (dosya eksik veya veri senkron değil). Sayfayı yenileyip tekrar deneyin.';
      } else if (st === 401 || st === 403) {
        msg = 'Bu belge için oturum veya yetki yetersiz. Tekrar giriş yapmayı deneyin.';
      }
      alert(msg);
    });
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
        
        // Şema wrapper'ı oluştur (kaporta-schema-wrapper: masaüstü +10px CSS ile uyumlu)
        const schemaWrapper = document.createElement('div');
        schemaWrapper.className = 'kaza-kaporta-schema-inner';
        schemaWrapper.style.display = 'flex';
        schemaWrapper.style.alignItems = 'center';
        schemaWrapper.style.justifyContent = 'center';
        schemaWrapper.style.gap = '24px';
        schemaWrapper.style.maxHeight = '156px';
        schemaWrapper.style.width = '100%';
        schemaWrapper.style.overflow = 'hidden';
        schemaWrapper.style.paddingTop = '0';

        schemaWrapper.appendChild(svgClone);

        svgClone.setAttribute('width', '140');
        svgClone.setAttribute('height', '210');
        svgClone.style.width = '188px';  /* +20px yatay */
        svgClone.style.height = '124px'; /* +12px dikey */
        svgClone.style.margin = '0';
        svgClone.style.position = 'static';
        svgClone.style.left = '0';
        svgClone.style.top = '0';
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
        legend.style.lineHeight = '1.2';
        legend.style.color = '#aaa';
        legend.style.marginTop = '0';
        legend.innerHTML = `
          <div class="boya-legend-item" style="display: flex; align-items: center; gap: 6px; line-height: 1.2;"><span class="boya-legend-dot" style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #888888; flex: 0 0 8px;"></span> Boyasız</div>
          <div class="boya-legend-item" style="display: flex; align-items: center; gap: 6px; line-height: 1.2;"><span class="boya-legend-dot" style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #28a745; flex: 0 0 8px;"></span> Boyalı (Mevcut)</div>
          <div class="boya-legend-item" style="display: flex; align-items: center; gap: 6px; line-height: 1.2;"><span class="boya-legend-dot" style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #d40000; flex: 0 0 8px;"></span> Değişen/Hasar</div>
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
   * Dinamik olay "Kaydet" handler'ları için: currentDetailVehicleId + veri setinde araç.
   */
  function resolveVehicleContextForDynamicSave() {
    var vid = window.currentDetailVehicleId;
    if (vid == null || String(vid).trim() === '') return null;
    var vehicles = readVehicles();
    var vehicle = vehicles.find(function(v) { return String(v.id) === String(vid); });
    if (!vehicle) return null;
    return { vehicleId: vid, vehicle: vehicle, vehicles: vehicles };
  }

  /**
   * Bakım olayı kaydet
   */
  window.saveBakimEvent = function() {
    const svc = resolveVehicleContextForDynamicSave();
    if (!svc) return;
    const vehicleId = svc.vehicleId;
    const vehicle = svc.vehicle;
    const vehicles = svc.vehicles;
    
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
    return writeVehicles(vehicles).then(function() {
      return completeDynamicEventSave({
        modalType: 'bakim',
        vehicleId: vehicleId,
        message: 'Bakım kaydı kaydedildi.'
      });
    });
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
    const svc = resolveVehicleContextForDynamicSave();
    if (!svc) return;
    const vehicleId = svc.vehicleId;
    const vehicle = svc.vehicle;
    const vehicles = svc.vehicles;
    
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
    
    if (!vehicle.events) vehicle.events = [];
    if (!vehicle.boyaliParcalar) vehicle.boyaliParcalar = {};
    
    // Yeni hasarları mevcut boyaliParcalar'a ekle
    Object.keys(newDamages).forEach(partId => {
      vehicle.boyaliParcalar[partId] = newDamages[partId];
    });
    if (Object.keys(newDamages).length > 0) {
      vehicle.boya = 'var';
    }
    
    const tramerEvetEl = document.querySelector('#dinamik-olay-modal .tramer-evet');
    const tramerHayirEl = document.querySelector('#dinamik-olay-modal .tramer-hayir');
    const tramerKaydi = (tramerEvetEl && tramerEvetEl.classList.contains('active') && !tramerEvetEl.classList.contains('green')) ? 'evet'
      : (tramerHayirEl && tramerHayirEl.classList.contains('active')) ? 'hayir' : '';
    const tramerTarih = document.getElementById('kaza-tramer-tarih')?.value.trim() || '';
    const tramerTutar = document.getElementById('kaza-tramer-tutar')?.value.trim() || '';
    const event = {
      id: Date.now().toString(),
      type: 'kaza',
      date: tarih,
      timestamp: new Date().toISOString(),
      data: {
        surucu: surucu || getEventPerformerName(vehicle),
        hasarParcalari: newDamages,
        hasarTutari: hasarTutari,
        tramerKaydi: tramerKaydi || undefined,
        tramerTarih: tramerKaydi === 'evet' ? tramerTarih : undefined,
        tramerTutar: tramerKaydi === 'evet' ? tramerTutar : undefined
      }
    };
    
    vehicle.events.unshift(event);
    return writeVehicles(vehicles).then(function() {
      return completeDynamicEventSave({
        modalType: 'kaza',
        vehicleId: vehicleId,
        message: 'Kaza kaydı kaydedildi.'
      });
    });
  };

  window.saveCezaEvent = function() {
    const svc = resolveVehicleContextForDynamicSave();
    if (!svc) return;
    const vehicleId = svc.vehicleId;
    const vehicle = svc.vehicle;
    const vehicles = svc.vehicles;

    const tarih = document.getElementById('ceza-tarih')?.value.trim() || '';
    const surucu = document.getElementById('ceza-surucu')?.value.trim() || '';
    const tutar = document.getElementById('ceza-tutar')?.value.trim() || '';
    const aciklama = document.getElementById('ceza-aciklama')?.value.trim() || '';

    if (!tarih || !tutar) {
      alert('Tarih ve Ceza Tutarı zorunludur!');
      return;
    }

    if (!vehicle.events) vehicle.events = [];

    const event = {
      id: Date.now().toString(),
      type: 'ceza',
      date: tarih,
      timestamp: new Date().toISOString(),
      data: {
        surucu: surucu || getEventPerformerName(vehicle),
        kaydeden: getRecorderDisplayName(),
        tutar: tutar,
        aciklama: aciklama
      }
    };

    vehicle.events.unshift(event);
    return writeVehicles(vehicles).then(function() {
      return completeDynamicEventSave({
        modalType: 'ceza',
        vehicleId: vehicleId,
        message: 'Trafik cezası kaydedildi.'
      });
    });
  };

  /**
   * Yılları ekle (gg/aa/yyyy → +years → YYYY-MM-DD).
   * Aynı iş kuralı driver_event.php içinde PHP ile kullanılır; değişiklikte her iki tarafı senkron tutun.
   */
  function addYears(dateStr, years) {
    if (!dateStr) return '';

    let date = null;
    const normalizedDateStr = normalizeGgAaYyyyInput(dateStr);
    const trPattern = /^(\d{2})\/(\d{2})\/(\d{4})$/;
    const trMatch = String(normalizedDateStr).match(trPattern);
    if (trMatch) {
      const day = parseInt(trMatch[1], 10);
      const month = parseInt(trMatch[2], 10);
      const year = parseInt(trMatch[3], 10);
      date = new Date(year, month - 1, day);
    } else {
      const isoPattern = /^(\d{4})-(\d{2})-(\d{2})$/;
      const isoMatch = String(dateStr).trim().match(isoPattern);
      if (isoMatch) {
        const year = parseInt(isoMatch[1], 10);
        const month = parseInt(isoMatch[2], 10);
        const day = parseInt(isoMatch[3], 10);
        date = new Date(year, month - 1, day);
      }
    }

    if (!date || isNaN(date.getTime())) return String(dateStr);
    date.setFullYear(date.getFullYear() + years);

    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');

    return `${yyyy}-${mm}-${dd}`;
  }

  /**
   * Muayene bitiş tarihi hesapla (üretim yılına göre ilk/sürekli periyot).
   * Kural:
   * - İlk muayene sadece araç bu yıl üretilmişse uygulanır:
   *   otomobil +3 yıl, ticari +2 yıl
   * - Sonraki tüm muayeneler:
   *   otomobil +2 yıl, ticari +1 yıl
   * Egzos muayenesi yaptırılan tarihi ayrı girildiğinde bitiş hesabı için de bu fonksiyon kullanılır (aynı periyot varsayımı).
   */
  function calculateNextMuayene(vehicle, muayeneDate) {
    if (!muayeneDate) return '';

    const vehicleType = (vehicle && (vehicle.vehicleType || vehicle.tip) ? (vehicle.vehicleType || vehicle.tip) : 'otomobil').toLowerCase();
    const isCommercial = vehicleType !== 'otomobil';
    const yearsToAdd = isCommercial ? 1 : 2;
    return addYears(muayeneDate, yearsToAdd);
  }

  /**
   * Sigorta bilgisi güncelle (bitiş tarihi 1 yıl sonrasına ayarlanır)
   */
  window.updateSigortaInfo = function() {
    const tarihInput = document.getElementById('sigorta-tarih');
    const tarih = normalizeGgAaYyyyInputElement(tarihInput);
    const firma = document.getElementById('sigorta-firma')?.value.trim() || '';
    const acente = document.getElementById('sigorta-acente')?.value.trim() || '';
    const iletisim = document.getElementById('sigorta-iletisim')?.value.trim() || '';
    
    if (!tarih) {
      alert('Tarih zorunludur!');
      return;
    }

    const svc = resolveVehicleContextForDynamicSave();
    if (!svc) return;
    const vehicleId = svc.vehicleId;
    const vehicle = svc.vehicle;
    const vehicles = svc.vehicles;
    
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
      return completeDynamicEventSave({
        modalType: 'sigorta',
        vehicleId: vehicleId,
        message: 'Sigorta bilgisi güncellendi.'
      });
    });
  };

  /**
   * Kasko bilgisi güncelle (bitiş tarihi 1 yıl sonrasına ayarlanır)
   */
  window.updateKaskoInfo = function() {
    const tarihInput = document.getElementById('kasko-tarih');
    const tarih = normalizeGgAaYyyyInputElement(tarihInput);
    const firma = document.getElementById('kasko-firma')?.value.trim() || '';
    const acente = document.getElementById('kasko-acente')?.value.trim() || '';
    const iletisim = document.getElementById('kasko-iletisim')?.value.trim() || '';
    
    if (!tarih) {
      alert('Tarih zorunludur!');
      return;
    }

    const svc = resolveVehicleContextForDynamicSave();
    if (!svc) return;
    const vehicleId = svc.vehicleId;
    const vehicle = svc.vehicle;
    const vehicles = svc.vehicles;

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
      return completeDynamicEventSave({
        modalType: 'kasko',
        vehicleId: vehicleId,
        message: 'Kasko bilgisi güncellendi.'
      });
    });
  };

  /**
   * Muayene bilgisi güncelle (bitiş tarihi otomatik hesaplanır)
   */
  window.updateMuayeneInfo = function() {
    const tarihInput = document.getElementById('muayene-tarih');
    const tarih = normalizeGgAaYyyyInputElement(tarihInput);
    const egzozCheckbox = document.getElementById('muayene-egzoz-different');
    const egzozInput = document.getElementById('muayene-egzoz-yapilma-tarih');
    const egzozDifferent = !!(egzozCheckbox && egzozCheckbox.checked);
    const egzozYapilmaGgAa = egzozDifferent ? normalizeGgAaYyyyInputElement(egzozInput) : '';
    const egzozYapilmaIso = egzozDifferent ? parseGgAaYyyyToIso(egzozYapilmaGgAa) : '';
    
    if (!tarih) {
      alert('Tarih zorunludur!');
      return;
    }
    if (egzozDifferent && !egzozYapilmaIso) {
      alert('Egzoz Muayene Tarihi zorunludur!');
      if (egzozInput) egzozInput.focus();
      return;
    }

    const svc = resolveVehicleContextForDynamicSave();
    if (!svc) return;
    const vehicleId = svc.vehicleId;
    const vehicle = svc.vehicle;
    const vehicles = svc.vehicles;
    
    if (!vehicle.events) vehicle.events = [];
    
    // Muayene bitiş tarihi hesapla
    const bitisTarihi = calculateNextMuayene(vehicle, tarih);
    let egzozMuayeneDate = '';
    let egzozMuayeneYapilmaIso = '';
    if (egzozDifferent) {
      egzozMuayeneDate = calculateNextMuayene(vehicle, egzozYapilmaGgAa);
      egzozMuayeneYapilmaIso = egzozYapilmaIso;
    } else {
      egzozMuayeneDate = bitisTarihi;
    }
    
    vehicle.muayeneDate = bitisTarihi;
    vehicle.egzozMuayeneDate = egzozMuayeneDate;
    
    const event = {
      id: Date.now().toString(),
      type: 'muayene-guncelle',
      date: tarih,
      timestamp: new Date().toISOString(),
      data: {
        bitisTarihi: bitisTarihi,
        egzozMuayeneDate: egzozDifferent ? egzozMuayeneDate : '',
        egzozMuayeneYapilmaDate: egzozMuayeneYapilmaIso,
        surucu: getEventPerformerName(vehicle)
      }
    };
    
    vehicle.events.unshift(event);
    return writeVehicles(vehicles).then(function() {
      // Bildirimleri güncelle
      if (window.updateNotifications) window.updateNotifications();
      return completeDynamicEventSave({
        modalType: 'muayene',
        vehicleId: vehicleId,
        message: 'Muayene bilgisi güncellendi.'
      });
    });
  };

  /**
   * Anahtar bilgisi güncelle
   */
  window.updateAnahtarInfo = function() {
    const svc = resolveVehicleContextForDynamicSave();
    if (!svc) return;
    const vehicleId = svc.vehicleId;
    const vehicle = svc.vehicle;
    const vehicles = svc.vehicles;
    
    const radioBtns = document.querySelectorAll('#dinamik-olay-modal .radio-btn');
    const activeBtn = Array.from(radioBtns).find(btn => btn.classList.contains('active'));
    const durum = activeBtn?.dataset.value || 'yok';
    const detay = durum === 'var' ? (document.getElementById('anahtar-detay-event')?.value.trim() || '') : '';
    
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
      return completeDynamicEventSave({
        modalType: 'anahtar',
        vehicleId: vehicleId,
        message: 'Yedek anahtar bilgisi güncellendi.'
      });
    });
  };

  /**
   * Hak Mahrumiyeti bilgisi güncelle
   */
  window.updateKrediInfo = function() {
    const svc = resolveVehicleContextForDynamicSave();
    if (!svc) return;
    const vehicleId = svc.vehicleId;
    const vehicle = svc.vehicle;
    const vehicles = svc.vehicles;
    
    const radioBtns = document.querySelectorAll('#dinamik-olay-modal .radio-btn');
    const activeBtn = Array.from(radioBtns).find(btn => btn.classList.contains('active'));
    const durum = activeBtn?.dataset.value || 'yok';
    const detay = durum === 'var' ? (document.getElementById('kredi-detay-event')?.value.trim() || '') : '';
    
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
      return completeDynamicEventSave({
        modalType: 'kredi',
        vehicleId: vehicleId,
        message: 'Hak Mahrumiyeti bilgisi güncellendi.'
      });
    });
  };

  /**
   * Kasko Kodu güncelle
   */
  window.updateKaskoKoduInfo = async function() {
    const inputElement = document.getElementById('kasko-kodu-guncelle-input');
    const yeniKaskoKodu = inputElement ? inputElement.value.trim() : '';

    if (!yeniKaskoKodu) {
      if (typeof showToast === 'function') showToast('Lütfen Kasko Kodunu giriniz.', 'error');
      else alert('Lütfen Kasko Kodunu giriniz.');
      return;
    }

    const svc = resolveVehicleContextForDynamicSave();
    if (!svc) return;
    const vehicleId = svc.vehicleId;
    const vehicle = svc.vehicle;
    const vehicles = svc.vehicles;

    vehicle.kaskoKodu = yeniKaskoKodu;

    // Kasko tutarı: Excel listesinden güncel kod+yıla göre yeniden hesaplanır.
    const yearForKasko = vehicle.year || vehicle.modelYili || '';
    if (typeof window.getKaskoDegeriAsync === 'function') {
      vehicle.kaskoDegeri = await window.getKaskoDegeriAsync(yeniKaskoKodu, yearForKasko);
      vehicle.kaskoDegeriYuklemeTarihi = new Date().toISOString();
    } else if (typeof window.getKaskoDegeri === 'function') {
      vehicle.kaskoDegeri = window.getKaskoDegeri(yeniKaskoKodu, yearForKasko);
      vehicle.kaskoDegeriYuklemeTarihi = new Date().toISOString();
    }

    if (!vehicle.events) vehicle.events = [];
    // Tarihçede en yeni kayıt üstte (unshift).
    vehicle.events.unshift({
      id: Date.now().toString(),
      type: 'kasko-kodu-guncelle',
      date: formatDateForDisplay(new Date()),
      timestamp: new Date().toISOString(),
      data: {
        kaskoKodu: yeniKaskoKodu,
        surucu: getEventPerformerName(vehicle),
        kaydeden: getRecorderDisplayName()
      }
    });

    return writeVehicles(vehicles).then(function() {
      if (inputElement) inputElement.value = '';
      return completeDynamicEventSave({
        modalType: 'kaskokodu',
        vehicleId: vehicleId,
        message: 'Kasko kodu güncellendi.'
      });
    });
  };

  /**
   * Km bilgisi güncelle
   */
  window.updateKmInfo = function() {
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

    const svc = resolveVehicleContextForDynamicSave();
    if (!svc) return;
    const vehicleId = svc.vehicleId;
    const vehicle = svc.vehicle;
    const vehicles = svc.vehicles;
    
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
      return completeDynamicEventSave({
        modalType: 'km',
        vehicleId: vehicleId,
        message: 'Km bilgisi güncellendi.'
      });
    });
  };

  /**
   * UTTS Bilgisi güncelle
   */
  window.updateUTTSInfo = function() {
    const svc = resolveVehicleContextForDynamicSave();
    if (!svc) return;
    const vehicleId = svc.vehicleId;
    const vehicle = svc.vehicle;
    const vehicles = svc.vehicles;
    
    const radioBtns = document.querySelectorAll('#dinamik-olay-modal .radio-btn');
    const activeBtn = Array.from(radioBtns).find(btn => btn.classList.contains('active'));
    const durum = activeBtn?.dataset.value === 'evet' ? true : false;
    
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
      return completeDynamicEventSave({
        modalType: 'utts',
        vehicleId: vehicleId,
        message: 'UTTS bilgisi güncellendi.'
      });
    });
  };

  /**
   * Taşıt Takip Cihaz Bilgisi güncelle
   */
  window.updateTakipCihazInfo = function() {
    const svc = resolveVehicleContextForDynamicSave();
    if (!svc) return;
    const vehicleId = svc.vehicleId;
    const vehicle = svc.vehicle;
    const vehicles = svc.vehicles;
    
    const radioBtns = document.querySelectorAll('#dinamik-olay-modal .radio-btn');
    const activeBtn = Array.from(radioBtns).find(btn => btn.classList.contains('active'));
    const durum = activeBtn?.dataset.value === 'evet' ? true : false;
    
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
      return completeDynamicEventSave({
        modalType: 'takip',
        vehicleId: vehicleId,
        message: 'Taşıt takip cihaz bilgisi güncellendi.'
      });
    });
  };

  /**
   * Yazlık/Kışlık Lastik Durumu güncelle
   */
  window.updateLastikInfo = function() {
    const svc = resolveVehicleContextForDynamicSave();
    if (!svc) return;
    const vehicleId = svc.vehicleId;
    const vehicle = svc.vehicle;
    const vehicles = svc.vehicles;
    
    const radioBtns = document.querySelectorAll('#dinamik-olay-modal .radio-btn');
    const activeBtn = Array.from(radioBtns).find(btn => btn.classList.contains('active'));
    const durum = activeBtn?.dataset.value || 'yok';
    const adres = durum === 'var' ? (document.getElementById('lastik-adres-event')?.value.trim() || '') : '';
    
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
        surucu: getEventPerformerName(vehicle),
        kaydeden: getRecorderDisplayName()
      }
    };
    
    vehicle.events.unshift(event);
    return writeVehicles(vehicles).then(function() {
      if (window.updateNotifications) window.updateNotifications();
      return completeDynamicEventSave({
        modalType: 'lastik',
        vehicleId: vehicleId,
        message: 'Lastik durumu güncellendi.'
      });
    });
  };

  /**
   * Şube değişikliği kaydet
   */
  window.updateSubeDegisiklik = function() {
    const selectEl = document.getElementById('sube-select');
    if (!selectEl) return;
    
    const yeniSubeId = selectEl.value;
    if (!yeniSubeId) {
      alert('Lütfen bir şube seçiniz!');
      return;
    }

    const svc = resolveVehicleContextForDynamicSave();
    if (!svc) return;
    const vehicleId = svc.vehicleId;
    const vehicle = svc.vehicle;
    const vehicles = svc.vehicles;
    if (isArchivedVehicleAssignmentLocked(vehicle)) {
      if (typeof showToast === 'function') showToast('Arşivdeki taşıtlarda kullanıcı/şube ataması yapılamaz.', 'error');
      else alert('Arşivdeki taşıtlarda kullanıcı/şube ataması yapılamaz.');
      return;
    }
    
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
        surucu: getEventPerformerName(vehicle),
        kaydeden: getRecorderDisplayName()
      }
    };
    
    vehicle.events.unshift(event);
    return writeVehicles(vehicles).then(function() {
      return completeDynamicEventSave({
        modalType: 'sube',
        vehicleId: vehicleId,
        message: 'Şube değişikliği kaydedildi.'
      });
    });
  };

  /**
   * Kullanıcı atama/değişiklik kaydet
   */
  window.updateKullaniciAtama = function() {
    const selectEl = document.getElementById('kullanici-select');
    if (!selectEl) return;

    const yeniKullaniciId = selectEl.value;
    if (!yeniKullaniciId || yeniKullaniciId === '__add_user__') {
      alert('Lütfen bir kullanıcı seçiniz!');
      return;
    }

    const svc = resolveVehicleContextForDynamicSave();
    if (!svc) return;
    const vehicleId = svc.vehicleId;
    const vehicle = svc.vehicle;
    const vehicles = svc.vehicles;
    if (isArchivedVehicleAssignmentLocked(vehicle)) {
      if (typeof showToast === 'function') showToast('Arşivdeki taşıtlarda kullanıcı/şube ataması yapılamaz.', 'error');
      else alert('Arşivdeki taşıtlarda kullanıcı/şube ataması yapılamaz.');
      return;
    }

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
        data: {
          kullaniciId: '',
          kullaniciAdi: '',
          atamaKaldirildi: true,
          kaydeden: getRecorderDisplayName()
        }
      };
      vehicle.events.unshift(event);
      return writeVehicles(vehicles).then(function() {
        return completeDynamicEventSave({
          modalType: 'kullanici',
          vehicleId: vehicleId,
          message: 'Kullanıcı ataması güncellendi.'
        });
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
        eskiKullaniciAdi: eskiUser?.name || (eskiKullaniciId ? 'Bilinmiyor' : ''),
        kaydeden: getRecorderDisplayName()
      }
    };

    vehicle.events.unshift(event);
    return writeVehicles(vehicles).then(function() {
      return completeDynamicEventSave({
        modalType: 'kullanici',
        vehicleId: vehicleId,
        message: 'Kullanıcı ataması güncellendi.'
      });
    });
  };

  /**
   * Satış/Pert kaydet ve arşive taşı
   */
  window.saveSatisPert = function() {
    const tarih = document.getElementById('satis-tarih')?.value.trim() || '';
    const tutar = document.getElementById('satis-tutar')?.value.trim() || '';
    const aciklama = document.getElementById('satis-aciklama')?.value.trim() || '';
    
    if (!tarih) {
      alert('Satış/Pert tarihi zorunludur!');
      return;
    }

    const svc = resolveVehicleContextForDynamicSave();
    if (!svc) return;
    const vehicleId = svc.vehicleId;
    const vehicle = svc.vehicle;
    const vehicles = svc.vehicles;
    
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
        surucu: getEventPerformerName(vehicle),
        kaydeden: getRecorderDisplayName(),
        plakaSnapshot: String(vehicle.plate || '').trim(),
        pertIsaret: /\bpert\b/i.test(aciklama)
      }
    };
    
    vehicle.events.unshift(event);
    return writeVehicles(vehicles).then(function() {
      return completeDynamicEventSave({
        modalType: 'satis',
        vehicleId: vehicleId,
        message: 'Taşıt satış/pert işlemi kaydedildi. Taşıt arşive taşındı.',
        afterSuccess: function() {
          closeVehicleDetailModal();
          if (typeof window.renderBranchDashboard === 'function') window.renderBranchDashboard();
          if (typeof window.renderVehicles === 'function') window.renderVehicles();
        }
      });
    });
  };

  /**
   * Tarihçe modal'ını aç (initialTab: bakim | kaza | km | diger; yoksa bakım)
   */
  window.showVehicleHistory = function(vehicleId, initialTab) {
    function doShowVehicleHistory() {
    const vid = vehicleId || window.currentDetailVehicleId;
    if (!vid) return;
    
    const modal = DOM.vehicleHistoryModal;
    if (!modal) return;
    
    const tab = (initialTab && /^(bakim|kaza|km|diger)$/.test(initialTab)) ? initialTab : 'bakim';
    switchHistoryTab(tab, vid);
    
    modal.style.display = 'flex';
    requestAnimationFrame(() => modal.classList.add('active'));
    }
    var flushHist = flushVehicleDetailNotesInlineSave();
    if (flushHist && typeof flushHist.then === 'function') {
      flushHist.then(doShowVehicleHistory, doShowVehicleHistory);
    } else {
      doShowVehicleHistory();
    }
  };

  /**
   * Taşıt tarihçesi — Diğer sekmesi tek kayıt HTML (tarih ayrı; özet performer + eylem; detay satırı etiketli)
   */
  function renderHistoryDigerEventHtml(event, vehicle, branches) {
    const eventType = String(event.type || '').trim();
    const isDateRenewalEvent = eventType === 'kasko-guncelle' || eventType === 'sigorta-guncelle' || eventType === 'muayene-guncelle' || eventType === 'muayene' || eventType === 'muayene-yenileme';
    function formatHistoryActionDate(ev) {
      const stamp = ev && ev.timestamp ? String(ev.timestamp).trim() : '';
      if (stamp) {
        const parsed = new Date(stamp);
        if (!isNaN(parsed.getTime())) {
          const d = String(parsed.getDate()).padStart(2, '0');
          const m = String(parsed.getMonth() + 1).padStart(2, '0');
          const y = String(parsed.getFullYear());
          return `${d}/${m}/${y}`;
        }
      }
      return formatDateForDisplay(ev && ev.date ? ev.date : '');
    }
    const actionDateText = formatHistoryActionDate(event);
    const dateText = escapeHtml((isDateRenewalEvent ? actionDateText : formatDateForDisplay(event.date)) || '-');
    const eventData = event.data || {};
    const legacyAciklama = String(eventData.aciklama || eventData.description || '').trim();
    const performerRaw = eventData.kaydeden || eventData.surucu || eventData.kisi || '';
    const performerUpper = formatHistoryPerformerUpper(performerRaw || getRecorderDisplayName());
    const details = [];

    function pushDetail(label, value) {
      const v = (value != null && String(value).trim() !== '') ? String(value).trim() : '';
      if (v) details.push({ label: label, value: v });
    }

    let summaryInner = '';

    if (eventType === 'anahtar-guncelle') {
      const durum = String(eventData.durum || 'yok').toLowerCase();
      const durumTxt = durum === 'var' ? 'Var' : 'Yok';
      summaryInner = '<span class="history-user-name">' + escapeHtml(performerUpper) + '</span><span class="history-action-text">, Yedek Anahtar Durumunu </span><span class="history-detail-inline">' + escapeHtml(durumTxt) + '</span><span class="history-action-text"> Olarak G\u00FCncelledi.</span>';
      const konum = (eventData.detay || '').trim();
      if (konum) pushDetail('Konum', toTitleCase(konum));
    } else if (eventType === 'lastik-guncelle') {
      const durum = String(eventData.durum || 'yok').toLowerCase();
      const durumTxt = durum === 'var' ? 'Var' : 'Yok';
      summaryInner = '<span class="history-user-name">' + escapeHtml(performerUpper) + '</span><span class="history-action-text"> Yazl\u0131k/ K\u0131\u015Fl\u0131k Lastik Durumunu </span><span class="history-detail-inline">' + escapeHtml(durumTxt) + '</span><span class="history-action-text"> olarak Bildirdi.</span>';
      const adres = (eventData.adres || '').trim();
      if (adres) pushDetail('Konum', toTitleCase(adres));
    } else if (eventType === 'kasko-guncelle') {
      summaryInner = '<span class="history-user-name">' + escapeHtml(performerUpper) + '</span><span class="history-action-text">, Kasko Biti\u015F Tarihini G\u00FCncelledi.</span>';
      const bitis = formatDateForDisplay(eventData.bitisTarihi || '');
      const firma = (eventData.firma || '').trim();
      const acente = (eventData.acente || '').trim();
      const iletisim = (eventData.iletisim || '').trim();
      if (bitis) pushDetail('Biti\u015F Tarihi', bitis);
      if (firma) pushDetail('Firma', toTitleCase(firma));
      if (acente) pushDetail('Acente', toTitleCase(acente));
      if (iletisim) pushDetail('\u0130leti\u015Fim', iletisim);
    } else if (eventType === 'sigorta-guncelle') {
      summaryInner = '<span class="history-user-name">' + escapeHtml(performerUpper) + '</span><span class="history-action-text">, Trafik Sigortas\u0131 Biti\u015F Tarihini G\u00FCncelledi.</span>';
      const bitis = formatDateForDisplay(eventData.bitisTarihi || '');
      const firma = (eventData.firma || '').trim();
      const acente = (eventData.acente || '').trim();
      const iletisim = (eventData.iletisim || '').trim();
      if (bitis) pushDetail('Biti\u015F Tarihi', bitis);
      if (firma) pushDetail('Firma', toTitleCase(firma));
      if (acente) pushDetail('Acente', toTitleCase(acente));
      if (iletisim) pushDetail('\u0130leti\u015Fim', iletisim);
    } else if (eventType === 'muayene-guncelle' || eventType === 'muayene' || eventType === 'muayene-yenileme') {
      summaryInner = '<span class="history-user-name">' + escapeHtml(performerUpper) + '</span><span class="history-action-text">, Muayene Biti\u015F Tarihini G\u00FCncelledi.</span>';
      let bitis = formatDateForDisplay(eventData.bitisTarihi || '');
      if (!bitis && legacyAciklama) {
        const m = legacyAciklama.match(/(\d{2}[./-]\d{2}[./-]\d{4})/);
        if (m && m[1]) {
          const raw = m[1].replace(/\./g, '/').replace(/-/g, '/');
          bitis = raw;
        }
      }
      if (bitis) pushDetail('Biti\u015F Tarihi', bitis);
      const egzozYapForm = formatDateForDisplay(eventData.egzozMuayeneYapilmaDate || '');
      if (egzozYapForm) pushDetail('Egzoz Muayene — Yapt\u0131r\u0131lan', egzozYapForm);
      const egzozBitis = formatDateForDisplay(eventData.egzozMuayeneDate || '');
      if (egzozBitis) pushDetail('Egzoz Muayene — Biti\u015F', egzozBitis);
    } else if (eventType === 'kullanici-atama') {
      const yeni = (eventData.kullaniciAdi || '').trim();
      const eski = (eventData.eskiKullaniciAdi || '').trim();
      const kaldirdi = eventData.atamaKaldirildi === true || yeni === 'Hen\u00fcz Tan\u0131mlanmad\u0131';
      if (kaldirdi) {
        summaryInner = '<span class="history-user-name">' + escapeHtml(performerUpper) + '</span><span class="history-action-text">, Kullan\u0131c\u0131 Atamas\u0131n\u0131 Kald\u0131rd\u0131.</span>';
      } else {
        const yeniDisp = yeni ? formatAdSoyad(yeni) : '';
        if (yeniDisp) {
          summaryInner = '<span class="history-user-name">' + escapeHtml(performerUpper) + '</span><span class="history-action-text">, Kullan\u0131c\u0131 Atamas\u0131n\u0131 </span><span class="history-detail-inline">"' + escapeHtml(yeniDisp) + '"</span><span class="history-action-text"> Olarak G\u00FCncelledi.</span>';
        } else {
          summaryInner = '<span class="history-user-name">' + escapeHtml(performerUpper) + '</span><span class="history-action-text">, Kullan\u0131c\u0131 Atamas\u0131n\u0131 G\u00FCncelledi.</span>';
        }
      }
      if (eski) pushDetail('\u00d6nceki Kullan\u0131c\u0131', formatAdSoyad(eski));
    } else if (eventType === 'sube-degisiklik') {
      const yeniRaw = eventData.yeniSubeAdi || branches.find(b => String(b.id) === String(eventData.yeniSubeId))?.name || '';
      const eskiRaw = eventData.eskiSubeAdi || branches.find(b => String(b.id) === String(eventData.eskiSubeId))?.name || '';
      const yeniName = yeniRaw ? toTitleCase(String(yeniRaw)) : '';
      if (yeniName) {
        summaryInner = '<span class="history-user-name">' + escapeHtml(performerUpper) + '</span><span class="history-action-text">, \u015Eube Tahsisini </span><span class="history-detail-inline">"' + escapeHtml(yeniName) + '"</span><span class="history-action-text"> Olarak G\u00FCncelledi.</span>';
      } else {
        summaryInner = '<span class="history-user-name">' + escapeHtml(performerUpper) + '</span><span class="history-action-text">, \u015Eube Tahsisini G\u00FCncelledi.</span>';
      }
      if (eskiRaw) pushDetail('\u00d6nceki \u015Eube', toTitleCase(String(eskiRaw)));
    } else if (eventType === 'kredi-guncelle') {
      const durum = String(eventData.durum || 'yok').toLowerCase();
      const durumTxt = durum === 'var' ? 'Var' : 'Yok';
      summaryInner = '<span class="history-user-name">' + escapeHtml(performerUpper) + '</span><span class="history-action-text">, Hak Mahrumiyeti Durumunu </span><span class="history-detail-inline">' + escapeHtml(durumTxt) + '</span><span class="history-action-text"> Olarak G\u00FCncelledi.</span>';
      const detay = (eventData.detay || '').trim();
      if (detay) pushDetail('Detay', toTitleCase(detay));
    } else if (eventType === 'utts-guncelle') {
      const ev = (eventData.durum === true || eventData.durum === 'evet') ? 'Evet' : 'Hay\u0131r';
      summaryInner = '<span class="history-user-name">' + escapeHtml(performerUpper) + '</span><span class="history-action-text">, UTTS Bilgisini </span><span class="history-detail-inline">' + escapeHtml(ev) + '</span><span class="history-action-text"> Olarak G\u00FCncelledi.</span>';
    } else if (eventType === 'takip-cihaz-guncelle') {
      const dur = (eventData.durum === true || eventData.durum === 'var') ? 'Var' : 'Yok';
      summaryInner = '<span class="history-user-name">' + escapeHtml(performerUpper) + '</span><span class="history-action-text">, Ta\u015F\u0131t Takip Cihaz\u0131 Bilgisini </span><span class="history-detail-inline">' + escapeHtml(dur) + '</span><span class="history-action-text"> Olarak G\u00FCncelledi.</span>';
    } else if (eventType === 'ceza') {
      const recorder = formatHistoryPerformerUpper(eventData.kaydeden || getRecorderDisplayName());
      const fined = formatHistoryPerformerUpper(eventData.surucu || '');
      const finedEsc = escapeHtml(fined);
      summaryInner = '<span class="history-user-name">' + escapeHtml(recorder) + '</span><span class="history-action-text">, </span><span class="history-user-name history-user-name-secondary">' + finedEsc + '</span><span class="history-action-text">\u2019\u0131n Trafik Cezas\u0131n\u0131 Sisteme Kaydetti.</span>';
      const tutar = (eventData.tutar || '').trim();
      const aciklama = (eventData.aciklama || '').trim();
      if (tutar) pushDetail('Tutar', tutar + ' TL');
      if (aciklama) pushDetail('A\u00e7\u0131klama', toTitleCase(aciklama));
    } else if (eventType === 'not-guncelle') {
      summaryInner = '<span class="history-user-name">' + escapeHtml(performerUpper) + '</span><span class="history-action-text">, Ta\u015F\u0131t Notunu G\u00FCncelledi.</span>';
      const note = String(eventData.not || '').trim();
      if (note) pushDetail('Not', note.length > 120 ? note.slice(0, 120) + '...' : note);
    } else if (eventType === 'satis') {
      const rec = formatHistoryPerformerUpper(eventData.kaydeden || eventData.surucu || getRecorderDisplayName());
      const plate = String(eventData.plakaSnapshot || vehicle.plate || '-').trim();
      const plateEsc = escapeHtml(plate);
      const pert = eventData.pertIsaret === true || (eventData.aciklama && /\bpert\b/i.test(String(eventData.aciklama)));
      const tail = pert
        ? ' Plakal\u0131 Ta\u015F\u0131t\u0131n Pert Oldu\u011funu Sisteme Kaydetti.'
        : ' Plakal\u0131 Ta\u015F\u0131t\u0131n Sat\u0131ld\u0131\u011f\u0131n\u0131 Sisteme Kaydetti.';
      summaryInner = '<span class="history-user-name">' + escapeHtml(rec) + '</span><span class="history-action-text">, </span><span class="history-detail-inline">' + plateEsc + '</span><span class="history-action-text">' + tail + '</span>';
      const tutar = (eventData.tutar || '').trim();
      const aciklama = (eventData.aciklama || '').trim();
      if (tutar) pushDetail('Tutar', tutar + ' TL');
      if (aciklama) pushDetail('A\u00e7\u0131klama', toTitleCase(aciklama));
    } else if (eventType === 'kasko-kodu-guncelle') {
      summaryInner = '<span class="history-user-name">' + escapeHtml(performerUpper) + '</span><span class="history-action-text"> Kasko Kodunu G\u00FCncelledi.</span>';
      const yeniKod = (eventData.kaskoKodu || '').trim();
      if (yeniKod) pushDetail('Yeni Kod', yeniKod);
    } else if (eventType === 'ruhsat-yukle') {
      summaryInner = '<span class="history-user-name">' + escapeHtml(performerUpper) + '</span><span class="history-action-text">, Ruhsat Belgesi Y\u00fckledi.</span>';
    } else if (legacyAciklama) {
      // Eski serbest metin kayıtlarını yeni özet/detay formatında göster
      const fallback = toTitleCase(eventType || 'Di\u011fer i\u015flem');
      summaryInner = '<span class="history-user-name">' + escapeHtml(performerUpper) + '</span><span class="history-action-text">, ' + escapeHtml(fallback) + ' kayd\u0131n\u0131 g\u00FCncelledi.</span>';
      pushDetail('A\u00e7\u0131klama', toTitleCase(legacyAciklama));
    } else {
      const fallback = toTitleCase(eventType || 'Di\u011fer i\u015flem');
      summaryInner = '<span class="history-user-name">' + escapeHtml(performerUpper) + '</span><span class="history-action-text">, ' + escapeHtml(fallback) + ' kayd\u0131n\u0131 sisteme iletti.</span>';
    }

    const detailsHtml = details.length
      ? '<div class="history-item-body history-item-details" style="font-size: 12px; margin-top: 4px;">' + historyDetailPartsHtml(details) + '</div>'
      : '';

    return '<div class="history-item history-item-diger">' +
      '<div class="history-item-date" style="font-weight: 600; font-size: 12px; margin-bottom: 4px;">' + dateText + '</div>' +
      '<div class="history-item-body history-item-summary" style="font-size: 12px; margin-top: 2px;">' + summaryInner + '</div>' +
      detailsHtml +
      '</div>';
  }

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
          const ekStr = [kmStr, tutarStr].filter(Boolean).join(' <span class="history-detail-sep">|</span> ');
          const islemler = toTitleCase(event.data?.islemler || '');
          const servis = toTitleCase(event.data?.servis || '-');
          const kisi = formatAdSoyad(event.data?.kisi || '-');
          html += `<div class="history-item">
            <div class="history-item-date" style="font-weight: 600; font-size: 12px; margin-bottom: 4px;">${escapeHtml(formatDateForDisplay(event.date) || '-')}</div>
            <div class="history-item-body" style="font-size: 12px;"><span class="history-label">\u0130\u015flem:</span> ${escapeHtml(islemler)}</div>
            <div class="history-item-body" style="font-size: 12px; margin-top: 4px;"><span class="history-label">Servis:</span> ${escapeHtml(servis)} <span class="history-detail-sep">|</span> <span class="history-label">Ki\u015Fi:</span> ${escapeHtml(kisi)}${ekStr ? ' <span class="history-detail-sep">|</span> ' + ekStr : ''}</div>
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
          const aciklamaHtml = aciklamaVal ? `<div class="history-item-body" style="font-size: 12px; margin-top: 4px;"><span class="history-label">A\u00e7\u0131klama:</span> ${escapeHtml(aciklamaVal)}</div>` : '';
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
            if (partParts.length) parcalarHtml = `<div class="history-item-body" style="font-size: 12px; margin-top: 4px;">${partParts.join(' <span class="history-detail-sep">|</span> ')}</div>`;
          }
          const kullanici = formatAdSoyad(event.data?.surucu || '-');
          let tramerHtml = '';
          if (event.data?.tramerKaydi === 'evet') {
            const tramerTarihStr = event.data.tramerTarih ? formatDateForDisplay(event.data.tramerTarih) : '';
            const tramerTutarStr = event.data.tramerTutar ? escapeHtml(event.data.tramerTutar) : '';
            const tramerParts = ['<span class="history-label">Tramer:</span> Evet'];
            if (tramerTarihStr) tramerParts.push(`<span class="history-label">Tarih:</span> ${escapeHtml(tramerTarihStr)}`);
            if (tramerTutarStr) tramerParts.push(`<span class="history-label">Tutar:</span> ${tramerTutarStr}`);
            tramerHtml = `<div class="history-item-body" style="font-size: 12px; margin-top: 4px;">${tramerParts.join(' <span class="history-detail-sep">|</span> ')}</div>`;
          }
          html += `<div class="history-item">
            <div class="history-item-date" style="font-weight: 600; font-size: 12px; margin-bottom: 4px;">${escapeHtml(formatDateForDisplay(event.date) || '-')}</div>
            <div class="history-item-body" style="font-size: 12px;"><span class="history-label">Kullanıcı:</span> ${escapeHtml(kullanici)}${hasarStr}</div>
            ${parcalarHtml}
            ${tramerHtml}
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
          const eskiKmRaw = String(eskiKm == null ? '' : eskiKm).trim();
          const isInitialKmEntry = event.data?.isInitialKmEntry === true || !eskiKmRaw || eskiKmRaw === '-';
          const yeniKmFormatli = yeniKm && yeniKm !== '-'
            ? escapeHtml(formatNumber(yeniKm)) + ' km'
            : '-';
          const kayitliKullanici = (event.data?.surucu || '').trim();
          const tahsisliKisi = String(vehicle?.tahsisKisi || '').trim();
          const yonetimEtiketiMi = /^y(?:o|\u00F6)netim$/i.test(kayitliKullanici);
          const kullaniciVal = (!kayitliKullanici || yonetimEtiketiMi) && tahsisliKisi
            ? tahsisliKisi
            : kayitliKullanici;
          const kullanici = kullaniciVal
            ? formatAdSoyad(kullaniciVal)
            : 'B\u0130L\u0130NM\u0130YOR';
          const kmSummary = isInitialKmEntry
            ? '<span class="history-user-name">Yeni Taşıt</span><span class="history-action-text"> • </span><span class="history-detail-inline">' + yeniKmFormatli + '</span>'
            : '<span class="history-user-name">' + escapeHtml(kullanici) + '</span><span class="history-action-text">, G\u00fcncel Km bilgisini </span><span class="history-detail-inline">' + escapeHtml(formatNumber(yeniKm)) + '</span><span class="history-action-text"> olarak g\u00FCncelledi.</span> <span class="history-label">\u00d6nceki Km:</span> ' + escapeHtml(formatNumber(eskiKm));
          html += `<div class="history-item">
            <div class="history-item-date" style="font-weight: 600; font-size: 12px; margin-bottom: 4px;">${escapeHtml(formatDateForDisplay(event.date) || '-')}</div>
            <div class="history-item-body history-item-summary" style="font-size: 12px; margin-top: 4px;">${kmSummary}</div>
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
          html += renderHistoryDigerEventHtml(event, vehicle, branches);
        });
      }
    }

    contentEl.innerHTML = html;
  };

  /**
   * Tarihçe modal'ını kapat
   */
  window.closeVehicleHistoryModal = function() {
    if (window.__vehicleHistoryOpenedFromNotifications === true) {
      window.__vehicleHistoryOpenedFromNotifications = false;
      if (typeof window.closeHistoryToHomeAndOpenNotifications === 'function') {
        window.closeHistoryToHomeAndOpenNotifications();
      } else {
        if (typeof window.closeAllModals === 'function') window.closeAllModals();
        if (typeof window.setNotificationsOpenState === 'function') window.setNotificationsOpenState(true);
        if (typeof window.syncMobileNotificationsDropdownHeight === 'function') {
          requestAnimationFrame(function() {
            window.syncMobileNotificationsDropdownHeight();
            requestAnimationFrame(window.syncMobileNotificationsDropdownHeight);
          });
        }
      }
      if (DOM.historyContent) DOM.historyContent.innerHTML = '';
      return;
    }
    const modal = DOM.vehicleHistoryModal;
    if (modal) {
      resetModalState(modal);
      if (DOM.historyContent) DOM.historyContent.innerHTML = '';
      modal.classList.remove('active');
      setTimeout(() => modal.style.display = 'none', 300);
    }
  };

  /**
   * Tarihçe ekranından Taşıt detay ekranına geri dön (sol ok + "Taşıt detay" tıklanınca)
   */
  window.backFromHistoryToVehicleDetail = function() {
    window.__vehicleHistoryOpenedFromNotifications = false;
    const historyModal = DOM.vehicleHistoryModal;
    const detailModal = DOM.vehicleDetailModal;
    if (historyModal) {
      historyModal.classList.remove('active');
      historyModal.style.display = 'none';
      if (DOM.historyContent) DOM.historyContent.innerHTML = '';
    }
    if (detailModal && window.currentDetailVehicleId) {
      detailModal.style.display = 'flex';
      requestAnimationFrame(function() { detailModal.classList.add('active'); });
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
    window.saveBakimEvent = withSaveButtonGuard(DINAMIK_OLAY_MODAL_ID, window.saveBakimEvent);
    window.saveKazaEvent = withSaveButtonGuard(DINAMIK_OLAY_MODAL_ID, window.saveKazaEvent);
    window.saveCezaEvent = withSaveButtonGuard(DINAMIK_OLAY_MODAL_ID, window.saveCezaEvent);
    window.updateSigortaInfo = withSaveButtonGuard(DINAMIK_OLAY_MODAL_ID, window.updateSigortaInfo);
    window.updateKaskoInfo = withSaveButtonGuard(DINAMIK_OLAY_MODAL_ID, window.updateKaskoInfo);
    window.updateMuayeneInfo = withSaveButtonGuard(DINAMIK_OLAY_MODAL_ID, window.updateMuayeneInfo);
    window.updateAnahtarInfo = withSaveButtonGuard(DINAMIK_OLAY_MODAL_ID, window.updateAnahtarInfo);
    window.updateKrediInfo = withSaveButtonGuard(DINAMIK_OLAY_MODAL_ID, window.updateKrediInfo);
    window.updateKmInfo = withSaveButtonGuard(DINAMIK_OLAY_MODAL_ID, window.updateKmInfo);
    window.updateLastikInfo = withSaveButtonGuard(DINAMIK_OLAY_MODAL_ID, window.updateLastikInfo);
    window.updateUTTSInfo = withSaveButtonGuard(DINAMIK_OLAY_MODAL_ID, window.updateUTTSInfo);
    window.updateTakipCihazInfo = withSaveButtonGuard(DINAMIK_OLAY_MODAL_ID, window.updateTakipCihazInfo);
    window.updateKaskoKoduInfo = withSaveButtonGuard(DINAMIK_OLAY_MODAL_ID, window.updateKaskoKoduInfo);
    window.updateSubeDegisiklik = withSaveButtonGuard(DINAMIK_OLAY_MODAL_ID, window.updateSubeDegisiklik);
    window.updateKullaniciAtama = withSaveButtonGuard(DINAMIK_OLAY_MODAL_ID, window.updateKullaniciAtama);
    window.saveSatisPert = withSaveButtonGuard(DINAMIK_OLAY_MODAL_ID, window.saveSatisPert);
    window.__medisaSaveGuardsApplied = true;
  }

  /** Olay tarihini sıralama için sayıya çevir (dd.mm.yyyy veya timestamp) */
  function getEventSortTime(ev) {
    if (ev.timestamp) {
      const t = new Date(ev.timestamp).getTime();
      if (!isNaN(t)) return t;
    }
    var idTie = 0;
    if (ev.id != null && String(ev.id).trim() !== '') {
      var idNum = parseInt(String(ev.id).replace(/\D/g, ''), 10);
      if (!isNaN(idNum) && idNum > 0) {
        idTie = idNum / 1e13;
      }
    }
    if (!ev.date) return idTie;
    const parts = String(ev.date).trim().split('.');
    if (parts.length !== 3) return idTie;
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    const d = new Date(year, month, day);
    if (isNaN(d.getTime())) return idTie;
    return d.getTime() + idTie;
  }

  /**
   * Bildirim satırı için "{İsim}, {Plaka} Plakalı Taşıt İçin {Olay Mesajı}." formatında metin üretir.
   */
  function getNotificationActivityMessage(ev, plate) {
    const evData = ev.data || {};
    const isim = evData.surucu || evData.kisi || evData.kullaniciAdi;
    const isimStr = isim ? formatAdSoyad(String(isim)) : 'Bilinmiyor';
    const plateStr = (plate || '-').toString().trim();
    const type = (ev.type || '').toString().trim();
    if (type === 'vehicle-created') {
      const createdPlate = (ev.data && ev.data.plakaSnapshot) || plate || '-';
      return 'Yeni Taşıt Bilgisi Kaydedildi. (' + String(createdPlate).trim() + ')';
    }
    if (type === 'satis') {
      const soldPlate = (ev.data && ev.data.plakaSnapshot) || plate || '-';
      return String(soldPlate).trim() + ' Plakalı Taşıt, Satış/Pert Nedeniyle Arşive Kaldırıldı.';
    }
    if (type === 'lastik-guncelle') {
      const durum = String(evData.durum || 'yok').toLowerCase();
      const durumTxt = durum === 'var' ? 'Var' : 'Yok';
      const whoL = evData.kaydeden || evData.surucu || evData.kisi || evData.kullaniciAdi;
      const whoLStr = whoL ? formatAdSoyad(String(whoL)) : 'Bilinmiyor';
      return whoLStr + ', ' + plateStr + ' Plakal\u0131 Ta\u015F\u0131t \u0130\u00E7in Yazl\u0131k/ K\u0131\u015Fl\u0131k Lastik Durumunu ' + durumTxt + ' olarak Bildirdi.';
    }
    if (type === 'kasko-kodu-guncelle') {
      const who = evData.kaydeden || evData.surucu || evData.kisi || evData.kullaniciAdi;
      const whoU = who ? formatHistoryPerformerUpper(who) : 'B\u0130L\u0130NM\u0130YOR';
      return whoU + ', ' + plateStr + ' Plakal\u0131 Ta\u015F\u0131t \u0130\u00E7in Kasko Kodunu G\u00FCncelledi.';
    }
    if (type === 'kullanici-atama') {
      const kaldir = evData.atamaKaldirildi === true || String(evData.kullaniciAdi || '').trim() === 'Hen\u00fcz Tan\u0131mlanmad\u0131';
      if (kaldir) {
        const who = evData.kaydeden || evData.surucu || evData.kisi;
        const whoStr = who ? formatAdSoyad(String(who)) : 'Bilinmiyor';
        return whoStr + ', ' + plateStr + ' Plakal\u0131 Ta\u015F\u0131t \u0130\u00E7in Kullan\u0131c\u0131 Atamas\u0131n\u0131 Kald\u0131rd\u0131.';
      }
    }
    const typeMessages = {
      'km-revize': 'Km Bildirimi Yapt\u0131',
      'bakim': 'Bak\u0131m Bildirimi Yapt\u0131',
      'kaza': 'Kaza Bildirimi Yapt\u0131',
      'ceza': 'Trafik Cezas\u0131 \u0130\u015Fledi',
      'sigorta-guncelle': 'Sigorta Bilgisini G\u00FCncelledi',
      'kasko-guncelle': 'Kasko Bilgisini G\u00FCncelledi',
      'muayene-guncelle': 'Muayene Bilgisini G\u00FCncelledi',
      'anahtar-guncelle': 'Yedek Anahtar Bilgisini G\u00FCncelledi',
      'utts-guncelle': 'UTTS Bilgisini G\u00FCncelledi',
      'kredi-guncelle': 'Hak Mahrumiyeti Bilgisini G\u00FCncelledi',
      'takip-cihaz-guncelle': 'Takip Cihaz\u0131 Bilgisini G\u00FCncelledi',
      'not-guncelle': 'Not Bilgisini G\u00FCncelledi',
      'sube-degisiklik': '\u015Eube Bilgisini G\u00FCncelledi',
      'kullanici-atama': 'Kullan\u0131c\u0131 Atamas\u0131 Yapt\u0131',
      'satis': 'Sat\u0131\u015F/Pert Bildirdi',
      'ruhsat-yukle': 'Ruhsat Belgesi Y\u00fckledi'
    };
    const mesaj = typeMessages[type] || 'Bilgi G\u00FCncelledi';
    return isimStr + ', ' + plateStr + ' Plakalı Taşıt İçin ' + mesaj + '.';
  }

  /** Olay tipinden tarihçe sekme id'si (bakim, kaza, km, diger) */
  function getHistoryTabForEventType(type) {
    if (type === 'bakim') return 'bakim';
    if (type === 'kaza') return 'kaza';
    if (type === 'km-revize') return 'km';
    return 'diger';
  }

  function shouldOpenNotificationsFromUrl() {
    try {
      const params = new URLSearchParams(window.location.search || '');
      return params.get('openNotifications') === '1';
    } catch (e) {
      return false;
    }
  }

  function openNotificationsFromReturnParam() {
    if (window._medisaOpenNotificationsHandled || !shouldOpenNotificationsFromUrl()) return;
    window._medisaOpenNotificationsHandled = true;
    if (typeof window.setNotificationsOpenState === 'function' && window.setNotificationsOpenState(true)) {
      if (typeof window.syncMobileNotificationsDropdownHeight === 'function') {
        requestAnimationFrame(function() {
          window.syncMobileNotificationsDropdownHeight();
          requestAnimationFrame(window.syncMobileNotificationsDropdownHeight);
        });
      }
    }
    try {
      const cleanUrl = window.location.pathname + (window.location.hash || '');
      window.history.replaceState({}, document.title, cleanUrl);
    } catch (e) {}
  }

  /**
   * Bildirimleri güncelle (muayene, sigorta, kasko + kullanıcı paneli işlemleri)
   */
  window.updateNotifications = function() {
    if (!window.appData || !Array.isArray(window.appData.tasitlar)) {
      invalidateVehicleDateTasksCache();
      updateMonthlyTodoHeaderBadge();
      return;
    }
    const notifScopeKey = getCurrentNotifScopeKey();
    beginNotificationFirstSeenBatch(notifScopeKey);
    try {
    const vehicles = readVehicles();
    const notifications = [];
    const pendingGeneralRequests = [];
    const viewedKeys = getViewedNotificationKeys();
    const dismissedKeys = getDismissedNotificationKeys();
    const feedKeys = {};
    let hasUnreadMarkableNotification = false;
    const showDesktopSpecialNotifDate = window.innerWidth >= 641;
    let hasRed = false; // Okunmamış kırmızı bildirim var mı?
    let hasOrange = false; // Okunmamış turuncu bildirim var mı?

    function parseNotificationDisplayDateMs(displayDate) {
      const raw = String(displayDate || '').trim();
      if (!raw) return 0;
      const trMatch = raw.match(/^(\d{2})[./-](\d{2})[./-](\d{4})$/);
      if (trMatch) {
        const day = Number(trMatch[1]);
        const month = Number(trMatch[2]);
        const year = Number(trMatch[3]);
        const dt = new Date(year, month - 1, day, 0, 0, 0, 0);
        if (!isNaN(dt.getTime())) return dt.getTime();
      }
      const parsed = Date.parse(raw);
      if (!isNaN(parsed)) return parsed;
      return 0;
    }

    runVehicleDateOperationalScan(notifications, 'full');
    updateMonthlyTodoHeaderBadge();

    const usersById = {};
    readUsers().forEach(function(user) {
      if (user && user.id != null) usersById[String(user.id)] = user;
    });
    const vehiclesById = {};
    vehicles.forEach(function(vehicle) {
      if (vehicle && vehicle.id != null) vehiclesById[String(vehicle.id)] = vehicle;
    });
    const requests = Array.isArray(window.appData.duzeltme_talepleri) ? window.appData.duzeltme_talepleri : [];
    requests.forEach(function(request) {
      if (!request || request.talep_tipi !== 'genel' || request.durum !== 'beklemede') return;
      const vehicle = vehiclesById[String(request.arac_id || '')];
      const user = usersById[String(request.surucu_id || '')];
      pendingGeneralRequests.push({
        id: request.id,
        type: String(request.konu_turu || 'talep'),
        message: String(request.mesaj || request.sebep || '').trim(),
        date: request.talep_tarihi || '',
        plate: vehicle ? (vehicle.plate || vehicle.plaka || '-') : '-',
        userName: user ? (user.isim || user.name || user.ad_soyad || 'Bilinmiyor') : 'Bilinmiyor'
      });
    });
    pendingGeneralRequests.sort(function(a, b) {
      return new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime();
    });

    const aylikHareketler = Array.isArray(window.appData.arac_aylik_hareketler) ? window.appData.arac_aylik_hareketler : [];
    const kayitIdToAracId = {};
    aylikHareketler.forEach(function(k) {
      if (k && k.id != null && k.arac_id != null) {
        kayitIdToAracId[String(k.id)] = String(k.arac_id);
      }
    });
    const pendingDuzeltmeRequests = [];
    requests.forEach(function(request) {
      if (!request || request.durum !== 'beklemede') return;
      if (request.talep_tipi === 'genel') return;
      const kid = request.kayit_id != null ? String(request.kayit_id) : '';
      if (!kid) return;
      const aracId = kayitIdToAracId[kid];
      if (!aracId) return;
      const vehicle = vehiclesById[aracId];
      const user = usersById[String(request.surucu_id || '')];
      const sebep = String(request.sebep || '').trim();
      const topicBits = [];
      if (request.yeni_km != null) topicBits.push('KM');
      if (request.yeni_bakim_aciklama != null) topicBits.push('Bakım');
      if (request.yeni_kaza_aciklama != null) topicBits.push('Kaza');
      const topic = topicBits.length ? topicBits.join(' · ') + ' düzeltmesi' : 'Düzeltme talebi';
      pendingDuzeltmeRequests.push({
        id: request.id,
        topic: topic,
        message: sebep,
        date: request.talep_tarihi || '',
        plate: vehicle ? (vehicle.plate || vehicle.plaka || '-') : '-',
        userName: user ? (user.isim || user.name || user.ad_soyad || 'Bilinmiyor') : 'Bilinmiyor'
      });
    });
    pendingDuzeltmeRequests.sort(function(a, b) {
      return new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime();
    });

    // Kullanıcı paneli işlemleri: tüm taşıtlardan son olayları topla (en yeni 15)
    const recentEvents = [];
    vehicles.forEach(vehicle => {
      const events = Array.isArray(vehicle.events) ? vehicle.events : [];
      const plate = vehicle.plate || '-';
      const brandModel = formatBrandModel(vehicle.brandModel || '-');
      const isArchivedVehicle = vehicle.satildiMi === true;
      events.forEach(ev => {
        if (isArchivedVehicle && (!ev || ev.type !== 'satis')) return;
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
    let mtvSortMs = 0;
    const today = new Date();
    const m = today.getMonth();
    const d = today.getDate();
    const y = today.getFullYear();
    if ((m === 0 || m === 6) && d >= 21) {
      const mtvLegacyKey = 'mtv_paid_' + y + '_' + m;
      const mtvKey = 'special|mtv|' + y + '|' + String(m + 1).padStart(2, '0');
      if (localStorage.getItem(mtvLegacyKey) && dismissedKeys.indexOf(mtvKey) === -1) {
        dismissNotificationKeys([mtvKey]);
      }
      if (dismissedKeys.indexOf(mtvKey) === -1) {
        const mtvKeyEsc = (mtvKey || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const mtvRead = viewedKeys.indexOf(mtvKey) !== -1;
        const mtvStateClass = mtvRead ? ' notification-read' : ' notification-unread date-warning-orange-border';
        const mtvStyle = mtvRead
          ? '--notif-border: rgba(130, 130, 130, 0.55); --notif-fg: #9a9a9a;'
          : '--notif-border: rgba(255, 140, 0, 0.6); --notif-fg: #fff;';
        const mtvFirstSeenDisplay = getOrCreateNotificationFirstSeen(mtvKey);
        mtvSortMs = parseNotificationDisplayDateMs(mtvFirstSeenDisplay);
        const mtvDateHtml = showDesktopSpecialNotifDate ? '<div class="notif-line2 notif-meta-date">' + escapeHtml(mtvFirstSeenDisplay) + '</div>' : '';
        mtvHtml = '<div class="notification-item mtv-notification' + mtvStateClass + '" data-notif-key="' + escapeHtml(mtvKey) + '" data-dismiss-key="' + escapeHtml(mtvKey) + '" style="' + mtvStyle + '"><div class="mtv-text-container"><div class="mtv-main-text notif-line1">Ay\u0131n Son G\u00fcn\u00fcne Kadar MTV \u00d6demelerinin Yap\u0131lmas\u0131 Gerekmektedir.</div>' + mtvDateHtml + '</div><div class="mtv-dismiss-wrapper"><button type="button" class="mtv-dismiss-btn" onclick="dismissMTVNotif(event, \'' + mtvKeyEsc + '\')" aria-label="Bildirimi Kapat"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></button><div class="mtv-tooltip">\u00d6deme Yap\u0131ld\u0131ysa Bildirimi Silebilirsiniz.</div></div></div>';
        if (!mtvRead) hasUnreadMarkableNotification = true;
        if (!mtvRead) hasOrange = true;
      }
    }

    // Kasko Excel hatırlatması: Liste bu aya ait değilse (Excel yüklenince veya X ile silinene kadar kırmızı kalır)
    let kaskoExcelHtml = '';
    let kaskoExcelSortMs = 0;
    const kaskoState = getKaskoState();
    const kaskoListeGuncel = String(kaskoState.period || '') === (String(y) + '-' + String(m + 1).padStart(2, '0'));
    if (!kaskoListeGuncel) {
      const kaskoLegacyKey = 'kasko_excel_dismiss_' + y + '_' + m;
      const kaskoKey = 'special|kaskoExcel|' + y + '|' + String(m + 1).padStart(2, '0');
      if (localStorage.getItem(kaskoLegacyKey) && dismissedKeys.indexOf(kaskoKey) === -1) {
        dismissNotificationKeys([kaskoKey]);
      }
      if (dismissedKeys.indexOf(kaskoKey) === -1) {
        const kaskoKeyEsc = (kaskoKey || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const kaskoRead = viewedKeys.indexOf(kaskoKey) !== -1;
        const kaskoStateClass = kaskoRead ? ' notification-read' : ' notification-unread date-warning-red-border';
        const kaskoStyle = kaskoRead
          ? '--notif-border: rgba(130, 130, 130, 0.55); --notif-fg: #9a9a9a;'
          : '--notif-border: rgba(212, 0, 0, 0.6); --notif-fg: #fff;';
        const kaskoFirstSeenDisplay = getOrCreateNotificationFirstSeen(kaskoKey);
        kaskoExcelSortMs = parseNotificationDisplayDateMs(kaskoFirstSeenDisplay);
        const kaskoDateHtml = showDesktopSpecialNotifDate ? '<div class="notif-line2 notif-meta-date">' + escapeHtml(kaskoFirstSeenDisplay) + '</div>' : '';
        kaskoExcelHtml = '<div class="notification-item kasko-excel-notification' + kaskoStateClass + '" data-action="open-dis-veri" data-notif-key="' + escapeHtml(kaskoKey) + '" data-dismiss-key="' + escapeHtml(kaskoKey) + '" style="' + kaskoStyle + '"><div class="mtv-text-container"><div class="mtv-main-text notif-line1">G\u00fcncel Kasko De\u011fer Listesinin Y\u00fcklenmesi Gerekmektedir.</div>' + kaskoDateHtml + '</div><div class="mtv-dismiss-wrapper"><button type="button" class="mtv-dismiss-btn" onclick="dismissKaskoExcelNotif(event, \'' + kaskoKeyEsc + '\')" aria-label="Bildirimi Kapat"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button><div class="mtv-tooltip">Kapat</div></div></div>';
        if (!kaskoRead) hasUnreadMarkableNotification = true;
        if (!kaskoRead) hasRed = true;
      }
    }

    // Bildirimleri güncelle
    const notifDropdown = DOM.notificationsDropdown;
    const notifIcon = DOM.notificationsToggleBtn || document.getElementById('notifications-toggle-btn');

    if (notifications.length === 0 && recentSlice.length === 0 && pendingGeneralRequests.length === 0 && pendingDuzeltmeRequests.length === 0 && !mtvHtml && !kaskoExcelHtml) {
      if (notifDropdown) {
        notifDropdown.innerHTML = '<button disabled>Bildirim Yok</button>';
        if (notifDropdown.classList.contains('open') && typeof window.syncMobileNotificationsDropdownHeight === 'function') {
          requestAnimationFrame(function() {
            window.syncMobileNotificationsDropdownHeight();
            requestAnimationFrame(window.syncMobileNotificationsDropdownHeight);
          });
        }
      }
      if (notifIcon) {
        notifIcon.classList.remove('notification-red', 'notification-orange', 'notification-pulse');
      }
    } else {
      const tStart = (function() {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        return d.getTime();
      })();
      const notifFeed = [];
      function pushNotifFeedOnce(notifKey, t, h) {
        const normalizedKey = String(notifKey || '').trim();
        if (!normalizedKey || feedKeys[normalizedKey]) return false;
        feedKeys[normalizedKey] = true;
        notifFeed.push({ t: t, h: h });
        return true;
      }
      if (mtvHtml) {
        pushNotifFeedOnce('special|mtv|' + y + '|' + String(m + 1).padStart(2, '0'), mtvSortMs || tStart, mtvHtml);
      }
      if (kaskoExcelHtml) {
        pushNotifFeedOnce('special|kaskoExcel|' + y + '|' + String(m + 1).padStart(2, '0'), kaskoExcelSortMs || tStart, kaskoExcelHtml);
      }

      if (pendingGeneralRequests.length > 0) {
        function notificationFeedbackTopicLabel(typeRaw) {
          var s = String(typeRaw || 'talep').toLocaleLowerCase('tr-TR');
          if (s === 'sikayet' || s === 'şikayet') return '\u015Eikayet';
          if (s === 'oneri' || s === '\u00f6neri') return '\u00d6neri';
          if (s === 'diger' || s === 'di\u011fer') return 'Di\u011fer';
          if (s === 'gorus' || s === 'g\u00f6r\u00fc\u015f') return 'G\u00f6r\u00fc\u015f';
          return 'Talep';
        }
        function notificationFeedbackIsRedSeverity(typeRaw) {
          var s = String(typeRaw || '').toLocaleLowerCase('tr-TR');
          return s === 'sikayet' || s === 'şikayet';
        }
        pendingGeneralRequests.forEach(function(request, reqIdx) {
          var topic = notificationFeedbackTopicLabel(request.type);
          var messageText = request.userName + ', ' + request.plate + ' Plakal\u0131 Ta\u015f\u0131t \u0130\u00e7in ' + topic + ' G\u00f6nderdi.';
          var notifKey = 'request|general|' + String(request.id || reqIdx);
          var dateDisplay = getOrCreateNotificationFirstSeen(notifKey);
          var isRead = viewedKeys.indexOf(notifKey) !== -1;
          var borderClass = !isRead && notificationFeedbackIsRedSeverity(request.type)
            ? 'date-warning-red-border'
            : (!isRead ? 'date-warning-orange-border' : '');
          var titleClass = !isRead && notificationFeedbackIsRedSeverity(request.type)
            ? 'date-warning-red'
            : (!isRead ? 'date-warning-orange' : 'notif-read-text');
          var stateClass = isRead ? ' notification-read' : ' notification-unread';
          var notifStyle = isRead ? '--notif-border: rgba(130, 130, 130, 0.55); --notif-fg: #9a9a9a;' : '';
          var h = '<button type="button" data-action="open-driver-report" data-notif-key="' + escapeHtml(notifKey) + '" style="' + notifStyle + '" class="notification-item notification-item-feedback' + stateClass + (borderClass ? ' ' + borderClass : '') + '">' +
          '<div class="notif-line1 notif-title"><span class="' + titleClass + '">' + escapeHtml(messageText) + '</span></div>' +
          '<div class="notif-line2 notif-meta-date">' + escapeHtml(dateDisplay) + '</div>' +
        '</button>';
          var baseMs = medisaNotificationTalepSortMs(request.date);
          if (baseMs <= 0) {
            baseMs = parseNotificationDisplayDateMs(dateDisplay);
          }
          if (baseMs <= 0) {
            baseMs = tStart;
          }
          var t = baseMs - reqIdx * 1e-6;
          pushNotifFeedOnce(notifKey, t, h);
          if (!isRead) hasUnreadMarkableNotification = true;
          if (!isRead && notificationFeedbackIsRedSeverity(request.type)) {
            hasRed = true;
          } else if (!isRead) {
            hasOrange = true;
          }
        });
      }

      if (pendingDuzeltmeRequests.length > 0) {
        pendingDuzeltmeRequests.forEach(function(request, dreqIdx) {
          const messageText = `${request.userName}, ${request.plate} plakalı taşıt için ${request.topic} (onay bekliyor).`;
          const notifKey = 'request|correction|' + String(request.id || dreqIdx);
          const dateDisplay = getOrCreateNotificationFirstSeen(notifKey);
          const isRead = viewedKeys.indexOf(notifKey) !== -1;
          const stateClass = isRead ? ' notification-read' : ' notification-unread';
          const borderClass = isRead ? '' : ' date-warning-red-border';
          const notifStyle = isRead ? '--notif-border: rgba(130, 130, 130, 0.55); --notif-fg: #9a9a9a;' : '';
          const titleClass = isRead ? 'notif-read-text' : 'date-warning-red';
          const h = `<button type="button" data-action="open-driver-report" data-notif-key="${escapeHtml(notifKey)}" style="${notifStyle}" class="notification-item notification-item-feedback${stateClass}${borderClass}">
          <div class="notif-line1 notif-title"><span class="${titleClass}">${escapeHtml(messageText)}</span></div>
          <div class="notif-line2 notif-meta-date">${escapeHtml(dateDisplay)}</div>
        </button>`;
          var dbaseMs = medisaNotificationTalepSortMs(request.date);
          if (dbaseMs <= 0) {
            dbaseMs = parseNotificationDisplayDateMs(dateDisplay);
          }
          if (dbaseMs <= 0) {
            dbaseMs = tStart;
          }
          const t = dbaseMs - dreqIdx * 1e-6;
          pushNotifFeedOnce(notifKey, t, h);
          if (!isRead) hasUnreadMarkableNotification = true;
          if (!isRead) hasRed = true;
        });
      }

      if (notifications.length > 0) {
        notifications.sort((a, b) => {
          if (a.warningClass === 'date-warning-red' && b.warningClass !== 'date-warning-red') return -1;
          if (a.warningClass !== 'date-warning-red' && b.warningClass === 'date-warning-red') return 1;
          return a.days - b.days;
        });
        notifications.forEach((notif, dIdx) => {
            const typeLabel = notif.type === 'sigorta' ? 'Sigorta' : notif.type === 'kasko' ? 'Kasko' : notif.type === 'egzoz' ? 'Egzoz Muayenesi' : 'Muayene';
            const notifKey = buildDateNotificationKey(notif);
            const activeDateDisplay = getOrCreateNotificationFirstSeen(notifKey);
            const isRead = viewedKeys.indexOf(notifKey) !== -1;
            const isUnread = !isRead;
            const isDateSeverity = notif.warningClass === 'date-warning-red' || notif.warningClass === 'date-warning-orange';
            const shouldKeepSeverity = isDateSeverity;

            let messageText = '';
            if (notif.days <= 0 && notif.type === 'kasko') {
                messageText = `${notif.plate} Plakalı Taşıtın Kasko Süresi Bitmiştir.`;
            } else if (notif.type === 'egzoz' && notif.missing) {
                messageText = `${notif.plate} Plakalı Taşıtın Egzoz Muayenesi Tarihi Eksiktir.`;
            } else if (notif.days <= 0 && notif.type === 'egzoz') {
                messageText = `${notif.plate} Plakalı Taşıtın Egzoz Muayenesi Süresi Bitmiştir.`;
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
            const readBorderColor = 'rgba(130, 130, 130, 0.55)';

            const safePlate = (notif.plate || '').replace(/"/g, '&quot;');
            const safeVid = (notif.vehicleId || '').toString().replace(/"/g, '&quot;');
            const safeKey = notifKey.replace(/"/g, '&quot;');
            const stateClass = isUnread ? ' notification-unread' : ' notification-read';
            const borderClass = (shouldKeepSeverity || isUnread) ? (notif.warningClass + '-border') : '';
            const titleClass = (shouldKeepSeverity || isUnread) ? notif.warningClass : 'notif-read-text';
            const notifStyle = shouldKeepSeverity
              ? `--notif-border: ${borderColor}; --notif-fg: var(--theme-color);`
              : (isUnread
                ? `--notif-border: ${borderColor}; --notif-fg: #ccc;`
                : `--notif-border: ${readBorderColor}; --notif-fg: #9a9a9a;`);
            if (isUnread) hasUnreadMarkableNotification = true;
            if (notif.warningClass === 'date-warning-red') {
              hasRed = true;
            } else if (notif.warningClass === 'date-warning-orange') {
              hasOrange = true;
            }

            const h = `<button type="button" data-plate="${safePlate}" data-vehicle-id="${safeVid}" data-notif-key="${safeKey}" style="${notifStyle}" class="notification-item ${borderClass}${stateClass}">
            <div class="notif-line1 notif-title">
              <span class="${titleClass}">${escapeHtml(messageText)}</span>
            </div>
            <div class="notif-line2 notif-meta-date">${escapeHtml(activeDateDisplay)}</div>
          </button>`;
            const firstSeenMs = parseNotificationDisplayDateMs(activeDateDisplay);
            const t = (firstSeenMs || tStart) - dIdx * 1e-6;
            pushNotifFeedOnce(notifKey, t, h);
        });
      }

      if (recentSlice.length > 0) {
        recentSlice.forEach((item, aIdx) => {
          const ev = item.event;
          const historyTab = getHistoryTabForEventType(ev.type);
          const safePlate = (item.plate || '').replace(/"/g, '&quot;');
          const safeVid = String(item.vehicleId || '').replace(/"/g, '&quot;');
          const notifKey = buildEventNotificationKey(item);
          const dateDisplay = getOrCreateNotificationFirstSeen(notifKey);
          const safeKey = notifKey.replace(/"/g, '&quot;');
          const isUnread = viewedKeys.indexOf(notifKey) === -1;
          if (isUnread) {
            hasUnreadMarkableNotification = true;
          }
          const unreadClass = isUnread ? ' notification-unread' : ' notification-read';
          const unreadStyle = isUnread
            ? '--notif-border: rgba(255, 255, 255, 0.55); --notif-fg: #a0aec0;'
            : '--notif-border: rgba(130, 130, 130, 0.55); --notif-fg: #9a9a9a;';
          const activityMsg = getNotificationActivityMessage(ev, item.plate);
          const h = `<button type="button" data-plate="${safePlate}" data-vehicle-id="${safeVid}" data-open-history="1" data-history-tab="${historyTab}" data-notif-key="${safeKey}" style="${unreadStyle}" class="notification-item notification-item-activity${unreadClass}">
          <div class="notif-line1 notif-title">${escapeHtml(activityMsg)}</div>
          <div class="notif-line2 notif-meta-date">${escapeHtml(dateDisplay)}</div>
        </button>`;
          const t = getEventSortTime(ev) - aIdx * 1e-6;
          pushNotifFeedOnce(notifKey, t, h);
        });
      }

      notifFeed.sort(function(a, b) { return b.t - a.t; });
      let html = notifFeed.map(function(x) { return x.h; }).join('');
      const hasUnreadInRenderedList = html.indexOf('notification-unread') !== -1;

      if (notifDropdown) {
        if (hasUnreadMarkableNotification || hasUnreadInRenderedList) {
          html = `<div class="notifications-toolbar"><button type="button" class="notifications-mark-all-read-btn" data-notification-action="mark-all-read">Tümünü Okundu Olarak İşaretle</button></div>` + html;
        }
        notifDropdown.innerHTML = html;
        if (notifDropdown.classList.contains('open') && typeof window.syncMobileNotificationsDropdownHeight === 'function') {
          requestAnimationFrame(function() {
            window.syncMobileNotificationsDropdownHeight();
            requestAnimationFrame(window.syncMobileNotificationsDropdownHeight);
          });
        }
      }

      if (notifIcon) {
        notifIcon.classList.remove('notification-red', 'notification-orange', 'notification-pulse');
        if (hasRed) {
          notifIcon.classList.add('notification-red', 'notification-pulse');
        } else if (hasOrange) {
          notifIcon.classList.add('notification-orange', 'notification-pulse');
        } else if (hasUnreadMarkableNotification) {
          /* Sadece nütr (faaliyet vb.) okunmamış: renk tema varsayılanı, dikkat için pulse */
          notifIcon.classList.add('notification-pulse');
        }
        /* Zil rengi: kırmızı = kritik/süresi bitmiş uyarılar; turuncu = yaklaşan tarih ve benzeri; pulse = başka okunmamış. */
      }
    }
    } catch (err) {
      if (typeof window.__medisaLogError === 'function') window.__medisaLogError('updateNotifications', err);
      else console.error('[Medisa] Bildirimler güncellenemedi:', err);
    } finally {
      updateMonthlyTodoHeaderBadge();
      flushNotificationFirstSeenBatch();
    }
    openNotificationsFromReturnParam();
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

    dismissNotificationKeys([key]);
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

    dismissNotificationKeys([key]);
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
      cell.classList.remove('drag-over', 'touch-drag-source');
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

  function isMobileVehicleColumnViewport() {
    return (typeof window.matchMedia === 'function')
      ? window.matchMedia('(max-width: 640px)').matches
      : window.innerWidth <= 640;
  }

  // Mobil: sütun başlığı touch ile sürükle-bırak state
  let touchColumnDrag = {
    active: false,
    columnKey: null,
    startX: 0,
    startY: 0,
    dragging: false,
    lastDropTarget: null,
    longPressTimer: null,
    sourceCell: null,
    ghostEl: null,
    suppressClickUntil: 0
  };

  function removeVehicleColumnTouchGhost() {
    if (touchColumnDrag.ghostEl && touchColumnDrag.ghostEl.parentNode) {
      touchColumnDrag.ghostEl.parentNode.removeChild(touchColumnDrag.ghostEl);
    }
    touchColumnDrag.ghostEl = null;
  }

  function setVehicleColumnCellsOpacity(container, columnKey, opacity) {
    const columnClass = getColumnClass(columnKey);
    if (!columnClass) return;
    container.querySelectorAll('.list-item').forEach(function(row) {
      const cell = row.querySelector('.list-cell.' + columnClass);
      if (cell) cell.style.opacity = opacity;
    });
  }

  function cleanupVehicleColumnTouchDrag(container) {
    clearTimeout(touchColumnDrag.longPressTimer);
    if (container) {
      container.classList.remove('touch-reorder-mode');
      container.querySelectorAll('.list-header-row .list-cell').forEach(function(cell) {
        cell.style.opacity = '1';
        cell.classList.remove('drag-over', 'touch-drag-source');
      });
      container.querySelectorAll('.list-item .list-cell').forEach(function(cell) {
        cell.style.opacity = '1';
      });
    }
    removeVehicleColumnTouchGhost();
    touchColumnDrag.active = false;
    touchColumnDrag.columnKey = null;
    touchColumnDrag.startX = 0;
    touchColumnDrag.startY = 0;
    touchColumnDrag.dragging = false;
    touchColumnDrag.lastDropTarget = null;
    touchColumnDrag.longPressTimer = null;
    touchColumnDrag.sourceCell = null;
  }

  function reorderVehicleColumns(sourceKey, targetKey) {
    if (!sourceKey || !targetKey || sourceKey === targetKey) return false;
    const draggedIndex = vehicleColumnOrder.indexOf(sourceKey);
    const targetIndex = vehicleColumnOrder.indexOf(targetKey);
    if (draggedIndex === -1 || targetIndex === -1) return false;
    vehicleColumnOrder.splice(draggedIndex, 1);
    vehicleColumnOrder.splice(targetIndex, 0, sourceKey);
    saveVehicleColumnOrder();
    return true;
  }

  function createVehicleColumnTouchGhost(sourceCell) {
    removeVehicleColumnTouchGhost();
    const ghost = document.createElement('div');
    ghost.className = 'vehicle-column-touch-ghost';
    ghost.textContent = String(sourceCell.textContent || '').replace(/\s+/g, ' ').trim();
    document.body.appendChild(ghost);
    touchColumnDrag.ghostEl = ghost;
  }

  function updateVehicleColumnTouchGhost(x, y) {
    if (!touchColumnDrag.ghostEl) return;
    touchColumnDrag.ghostEl.style.left = `${x}px`;
    touchColumnDrag.ghostEl.style.top = `${y}px`;
  }

  function getVehicleTouchTargetCell(container, pointerX, sourceKey) {
    const headerCells = Array.from(container.querySelectorAll('.list-header-row .list-cell[data-col]'))
      .filter(function(cell) { return cell.getAttribute('data-col') !== sourceKey; });
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

  function beginVehicleColumnTouchDrag(container, sourceCell, columnKey, touchPoint) {
    touchColumnDrag.dragging = true;
    touchColumnDrag.suppressClickUntil = Date.now() + 500;
    touchColumnDrag.sourceCell = sourceCell;
    container.classList.add('touch-reorder-mode');
    sourceCell.classList.add('touch-drag-source');
    sourceCell.style.opacity = '0.35';
    setVehicleColumnCellsOpacity(container, columnKey, '0.35');
    createVehicleColumnTouchGhost(sourceCell);
    updateVehicleColumnTouchGhost(touchPoint.clientX, touchPoint.clientY);
  }

  function attachVehicleColumnTouchListeners(container) {
    if (!isMobileVehicleColumnViewport()) return;
    const headerCells = container.querySelectorAll('.list-header-row .list-cell[data-col]');
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
        cleanupVehicleColumnTouchDrag(container);
        touchColumnDrag.active = true;
        touchColumnDrag.columnKey = columnKey;
        touchColumnDrag.startX = startTouch.clientX;
        touchColumnDrag.startY = startTouch.clientY;
        touchColumnDrag.lastDropTarget = null;
        touchColumnDrag.sourceCell = cell;
        touchColumnDrag.longPressTimer = setTimeout(function() {
          if (!touchColumnDrag.active || touchColumnDrag.columnKey !== columnKey) return;
          beginVehicleColumnTouchDrag(container, cell, columnKey, startTouch);
        }, 180);
      }, { passive: true });

      cell.addEventListener('touchmove', function(e) {
        if (!touchColumnDrag.active || touchColumnDrag.columnKey !== columnKey || e.touches.length !== 1) return;
        const touch = e.touches[0];
        const dx = Math.abs(touch.clientX - touchColumnDrag.startX);
        const dy = Math.abs(touch.clientY - touchColumnDrag.startY);

        if (!touchColumnDrag.dragging) {
          if (dx > 8 || dy > 8) {
            clearTimeout(touchColumnDrag.longPressTimer);
            if (dx > 14 || dy > 14) {
              cleanupVehicleColumnTouchDrag(container);
            }
          }
          return;
        }

        e.preventDefault();
        updateVehicleColumnTouchGhost(touch.clientX, touch.clientY);
        const targetCell = getVehicleTouchTargetCell(container, touch.clientX, columnKey);
        const targetKey = targetCell ? targetCell.getAttribute('data-col') : null;
        container.querySelectorAll('.list-header-row .list-cell').forEach(function(headerCell) {
          headerCell.classList.toggle('drag-over', headerCell === targetCell && targetKey && targetKey !== columnKey);
        });
        touchColumnDrag.lastDropTarget = (targetKey && targetKey !== columnKey) ? targetKey : null;
      }, { passive: false });

      function endTouch(e) {
        if (!touchColumnDrag.active && !touchColumnDrag.dragging) return;
        clearTimeout(touchColumnDrag.longPressTimer);
        const sourceKey = touchColumnDrag.columnKey;
        const targetKey = touchColumnDrag.lastDropTarget;
        const wasDragging = touchColumnDrag.dragging;
        if (wasDragging) {
          touchColumnDrag.suppressClickUntil = Date.now() + 500;
          if (e && typeof e.preventDefault === 'function') e.preventDefault();
        }
        cleanupVehicleColumnTouchDrag(container);
        if (wasDragging && sourceKey && targetKey && reorderVehicleColumns(sourceKey, targetKey)) {
          renderVehicles();
        }
      }

      cell.addEventListener('touchend', endTouch, { passive: false });
      cell.addEventListener('touchcancel', endTouch, { passive: false });
    });
  }

  // kayit.js deleteVehicle sonrası liste yenilemesi için global erişim
  window.renderVehicles = renderVehicles;

  // Taşıt detay: muayene tooltip (hover ile açık kalır, gecikmeli kapatma) + ünlem/link tıklama
  let muayeneTooltipCloseTimeout = null;
  let muayenePickerPointerHandledAt = 0;
  let vehicleTypePickerModulePromise = null;
  function ensureVehicleTypePickerModule() {
    if (typeof window.openVehicleTypePickerOverlay === 'function') {
      return Promise.resolve();
    }
    if (vehicleTypePickerModulePromise) {
      return vehicleTypePickerModulePromise;
    }
    const versions = window.MEDISA_MODULE_VERSIONS || {};
    const kayitJs = 'kayit.js?v=' + (versions.kayitJs || '20260406.1');
    const kayitCss = 'kayit.css?v=' + (versions.kayitCss || '20260421.2');
    if (typeof window.loadAppModule === 'function') {
      vehicleTypePickerModulePromise = window.loadAppModule(kayitJs, kayitCss).catch(function(err) {
        vehicleTypePickerModulePromise = null;
        throw err;
      });
      return vehicleTypePickerModulePromise;
    }
    return Promise.resolve();
  }

  function openVehicleTypePickerOverlayFallback(vehicleId) {
    window.vehicleTypePickerFromDetail = vehicleId;
    const picker = document.getElementById('vehicle-type-picker-overlay');
    if (!picker) return;
    picker.classList.add('from-detail');
    picker.classList.remove('u-hidden');
    picker.style.display = 'flex';
    picker.setAttribute('aria-hidden', 'false');
    document.body.classList.add('vehicle-type-picker-from-detail-open');
  }

  function ensureVehicleDetailContext(vehicleId) {
    const detailModal = document.getElementById('vehicle-detail-modal');
    const isDetailVisible = !!(
      detailModal &&
      detailModal.style.display !== 'none' &&
      (detailModal.classList.contains('active') || detailModal.classList.contains('open'))
    );
    if (!isDetailVisible && typeof window.showVehicleDetail === 'function') {
      window.showVehicleDetail(vehicleId);
    }
  }

  function openVehicleTypePickerFromDetail() {
    const vehicleId = String(window.currentDetailVehicleId || '').trim();
    if (!vehicleId) return;
    ensureVehicleDetailContext(vehicleId);
    if (typeof window.openVehicleTypePickerOverlay === 'function') {
      window.openVehicleTypePickerOverlay({ vehicleId: vehicleId });
      return;
    }
    // Kayıt modülü ilk kez yüklenirken gecikme olsa bile picker anında görünsün.
    openVehicleTypePickerOverlayFallback(vehicleId);
    ensureVehicleTypePickerModule().then(function() {
      if (typeof window.openVehicleTypePickerOverlay === 'function') {
        window.openVehicleTypePickerOverlay({ vehicleId: vehicleId });
        return;
      }
      openVehicleTypePickerOverlayFallback(vehicleId);
    }).catch(function(err) {
      console.error('Taşıt tipi seçim ekranı yüklenemedi:', err);
    });
  }

  function hideMuayeneTooltipByTrigger(triggerEl) {
    const wrap = triggerEl && triggerEl.closest('.detail-muayene-value-wrap');
    const tooltip = wrap && wrap.querySelector('.muayene-detail-tooltip');
    if (tooltip) {
      tooltip.classList.remove('visible');
      tooltip.hidden = true;
    }
  }

  function handleMuayenePickerTrigger(e, triggerEl) {
    if (!triggerEl) return false;
    if (e && e.cancelable) e.preventDefault();
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
    if (e && typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
    hideMuayeneTooltipByTrigger(triggerEl);
    openVehicleTypePickerFromDetail();
    return true;
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
  // Mobilde link/ünlem dokunuşunda ghost click oluşup detaydan düşme riskine karşı
  // picker tetiklemeyi pointer/touch başlangıcında tekilleştiriyoruz.
  function onMuayenePickerPointerLikeDown(e) {
    if (e.type === 'touchstart' && typeof window.PointerEvent === 'function') return;
    const modal = e.target.closest('#vehicle-detail-modal');
    if (!modal) return;
    const trigger = e.target.closest('.muayene-detail-exclamation, .muayene-detail-tooltip-link, .muayene-detail-tooltip, .muayene-detail-tooltip-wrap');
    if (!trigger) return;
    muayenePickerPointerHandledAt = Date.now();
    handleMuayenePickerTrigger(e, trigger);
  }
  document.addEventListener('pointerdown', onMuayenePickerPointerLikeDown, true);
  document.addEventListener('touchstart', onMuayenePickerPointerLikeDown, { capture: true, passive: false });
  document.addEventListener('click', function(e) {
    const modal = e.target.closest('#vehicle-detail-modal');
    if (!modal) return;
    const exclamation = e.target.closest('.muayene-detail-exclamation');
    const link = e.target.closest('.muayene-detail-tooltip-link');
    const tooltipBox = e.target.closest('.muayene-detail-tooltip');
    const tooltipWrap = e.target.closest('.muayene-detail-tooltip-wrap');
    const trigger = exclamation || link || tooltipBox || tooltipWrap;
    if (trigger) {
      if (Date.now() - muayenePickerPointerHandledAt < 700) {
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
        if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
        return;
      }
      handleMuayenePickerTrigger(e, trigger);
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
