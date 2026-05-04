/* =========================================
   MEDISA CUSTOM SELECT BİLEŞENİ
   =========================================
   Dinamik modal select özelleştirmesi: arama, ikincil seçenekler, sessiz seçimler
   ========================================= */

(function() {
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

  // Global export
  window.ensureDynamicModalCustomSelect = ensureDynamicModalCustomSelect;
  window.closeDynamicModalCustomSelect = closeDynamicModalCustomSelect;
  window.openDynamicModalCustomSelect = openDynamicModalCustomSelect;
  window.refreshDynamicModalCustomSelect = refreshDynamicModalCustomSelect;
  window.filterDynamicModalCustomSelect = filterDynamicModalCustomSelect;
  window.focusDynamicModalCustomSelectSearch = focusDynamicModalCustomSelectSearch;
  window.positionDynamicModalCustomSelectMenu = positionDynamicModalCustomSelectMenu;
  window.normalizeDynamicModalSelectSearch = normalizeDynamicModalSelectSearch;
  window.isDynamicModalSelectTouchDevice = isDynamicModalSelectTouchDevice;
})();
