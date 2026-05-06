/* =========================================
   TAŞIT KAYIT MODÜLÜ
   Araç kimliği/geçmişi (km, kaza, yedek anahtar, lastik vb.) hem bu formdan
   hem olay modallarından aynı vehicle objesine yazılır; taşıt detayı bu objeden okur.
   ========================================= */

(function () {
  const STORAGE_KEY = "medisa_vehicles_v1";
  const BRANCHES_KEY = "medisa_branches_v1";

  let isEditMode = false;
  let editingVehicleId = null;
  let editingVehicleVersion = 1; // Çakışma kontrolü (Phase 3) – düzenleme açıldığında kaydedilir
  const NOTES_MIN_HEIGHT_PX = 58; // Mobilde ~2.5 satır başlangıç yüksekliği
  const vehicleEgzozPromptState = {
    handledMuayeneDate: '',
    pendingMuayeneDate: '',
    promptOpen: false,
    inputOpen: false,
    resumeSave: false,
    suppressPrompt: false,
    userEditedMuayeneDate: false
  };

  function $(sel, root = document) { return root.querySelector(sel); }
  function $all(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }
  function getModal() { return document.getElementById("vehicle-modal"); }
  function getVehicleTypePickerOverlay() { return document.getElementById('vehicle-type-picker-overlay'); }
  function closeVehicleTypePickerOverlay() {
    const pickerOverlay = getVehicleTypePickerOverlay();
    if (!pickerOverlay) return;
    pickerOverlay.classList.add('u-hidden');
    pickerOverlay.classList.remove('from-detail');
    pickerOverlay.style.display = 'none';
    pickerOverlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('vehicle-type-picker-from-detail-open');
    window.vehicleTypePickerFromDetail = null;
  }
  function openVehicleTypePickerOverlay(options) {
    const pickerOverlay = getVehicleTypePickerOverlay();
    if (!pickerOverlay) return;
    const opts = options || {};
    if (opts.vehicleId) {
      window.vehicleTypePickerFromDetail = String(opts.vehicleId);
      pickerOverlay.classList.add('from-detail');
      document.body.classList.add('vehicle-type-picker-from-detail-open');
    } else {
      pickerOverlay.classList.remove('from-detail');
      document.body.classList.remove('vehicle-type-picker-from-detail-open');
    }
    pickerOverlay.classList.remove('u-hidden');
    pickerOverlay.style.display = 'flex';
    pickerOverlay.setAttribute('aria-hidden', 'false');
  }
  window.openVehicleTypePickerOverlay = openVehicleTypePickerOverlay;
  window.closeVehicleTypePickerOverlay = closeVehicleTypePickerOverlay;

  /** Ana uygulama oturum rolü — data-manager normalizeSessionRole ile aynı sözleşme (export yok, yerel kopya). */
  function getMedisaMainAppSessionRole() {
    const sessionData = typeof window.getMedisaSession === "function"
      ? (window.getMedisaSession() || {})
      : (window.medisaSession || {});
    let role = String(sessionData.role || (sessionData.user && sessionData.user.role) || "").trim();
    if (role === "admin") return "genel_yonetici";
    if (role === "yonetici" || role === "yonetici_kullanici") return "sube_yonetici";
    if (role === "driver" || role === "sales" || role === "surucu") return "kullanici";
    return role;
  }

  /** Şube yöneticisi: yeni kayıtta Tahsis Edilen Şube bölümü gizlenir; düzenlemede görünür. */
  function syncVehicleBranchFormSectionVisibility() {
    const section = document.getElementById("vehicle-branch-form-section");
    if (!section) return;
    const hide = !isEditMode && getMedisaMainAppSessionRole() === "sube_yonetici";
    section.classList.toggle("u-hidden", hide);
  }

  function readBranches() { return (typeof window.getMedisaBranches === 'function' ? window.getMedisaBranches() : null) || []; }
  function readVehicles() { return (typeof window.getMedisaVehicles === 'function' ? window.getMedisaVehicles() : null) || []; }
  const VEHICLE_DATE_INPUT_SELECTOR = 'input.form-input[data-date-input="vehicle"]';

  function getVehicleDateInputs(root) {
    return $all(VEHICLE_DATE_INPUT_SELECTOR, root || document);
  }

  function formatIsoForVehicleDateInput(value) {
    const iso = parseVehicleDateRawToIso(value);
    if (!iso) return '';
    const parts = iso.split('-');
    return parts.length === 3 ? `${parts[2]}.${parts[1]}.${parts[0]}` : '';
  }

  function setVehicleDateInputValue(input, value) {
    if (!input) return;
    input.value = formatIsoForVehicleDateInput(value);
    syncSingleDateInputVisibility(input);
    syncVehicleDatePickerState(input);
  }

  function getVehicleDatePickerNativeInput(input) {
    if (!input) return null;
    var wrap = input.closest('.vehicle-date-picker-wrap');
    return wrap ? wrap.querySelector('.vehicle-date-picker-native') : null;
  }

  function syncVehicleDatePickerState(input) {
    if (!input || !input.matches(VEHICLE_DATE_INPUT_SELECTOR)) return;
    var wrap = input.closest('.vehicle-date-picker-wrap');
    var nativeInput = getVehicleDatePickerNativeInput(input);
    if (!wrap || !nativeInput) return;
    var isoValue = readVehicleDateIso(input) || '';
    if (nativeInput.value !== isoValue) nativeInput.value = isoValue;
    nativeInput.disabled = !!input.disabled;
    wrap.classList.toggle('is-disabled', !!input.disabled);
  }

  function dispatchVehicleDateInputEvents(input) {
    if (!input) return;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  const VEHICLE_CALENDAR_MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  const VEHICLE_CALENDAR_DAYS = ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pa'];
  const vehicleDateCalendarState = {
    panel: null,
    input: null,
    anchor: null,
    year: 0,
    month: 0,
    bound: false
  };

  function getVehicleCalendarIsoFromDate(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function getVehicleCalendarDateFromIso(iso) {
    const normalized = parseVehicleDateRawToIso(iso);
    if (!normalized) return null;
    const parts = normalized.split('-').map(Number);
    const date = new Date(parts[0], parts[1] - 1, parts[2]);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function getVehicleDateCalendarContainer(input) {
    if (input) {
      const egzozOverlay = input.closest('.egzoz-dialog-overlay');
      if (egzozOverlay) return egzozOverlay;
      const ownModalContainer = input.closest('.modal-container');
      if (ownModalContainer) return ownModalContainer;
    }
    const modal = getModal();
    return modal ? modal.querySelector('.modal-container') : null;
  }

  function getVehicleDateCalendarPanel() {
    const container = getVehicleDateCalendarContainer(vehicleDateCalendarState.input);
    if (!container) return null;

    let panel = vehicleDateCalendarState.panel;
    if (!panel) {
      panel = document.createElement('div');
      panel.className = 'vehicle-date-calendar-panel';
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-label', 'Tarih seç');
      panel.addEventListener('click', handleVehicleDateCalendarClick);
      vehicleDateCalendarState.panel = panel;
    }

    if (panel.parentNode !== container) {
      container.appendChild(panel);
    }
    return panel;
  }

  function isVehicleDateCalendarTarget(target) {
    const panel = vehicleDateCalendarState.panel;
    return !!(panel && target && panel.contains(target));
  }

  function closeVehicleDateCalendar() {
    const panel = vehicleDateCalendarState.panel;
    if (panel) {
      panel.classList.remove('open');
      panel.setAttribute('aria-hidden', 'true');
    }
    if (vehicleDateCalendarState.anchor) {
      vehicleDateCalendarState.anchor.setAttribute('aria-expanded', 'false');
    }
    vehicleDateCalendarState.input = null;
    vehicleDateCalendarState.anchor = null;
  }

  function positionVehicleDateCalendarPanel() {
    const panel = vehicleDateCalendarState.panel;
    const anchor = vehicleDateCalendarState.anchor;
    const container = panel ? panel.parentElement : null;
    if (!panel || !anchor || !container) return;

    panel.style.visibility = 'hidden';
    panel.classList.add('open');

    const containerRect = container.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    const panelWidth = Math.min(252, Math.max(216, containerRect.width - 16));
    panel.style.width = `${panelWidth}px`;

    const panelHeight = panel.offsetHeight || 268;
    const gap = 6;
    const pad = 8;
    let left = anchorRect.right - containerRect.left - panelWidth;
    left = Math.max(pad, Math.min(left, containerRect.width - panelWidth - pad));

    let top = anchorRect.bottom - containerRect.top + gap;
    if (top + panelHeight + pad > containerRect.height) {
      top = anchorRect.top - containerRect.top - panelHeight - gap;
    }
    top = Math.max(pad, Math.min(top, containerRect.height - panelHeight - pad));

    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.style.visibility = '';
  }

  function renderVehicleDateCalendarPanel() {
    const panel = getVehicleDateCalendarPanel();
    const input = vehicleDateCalendarState.input;
    if (!panel || !input) return;

    const year = vehicleDateCalendarState.year;
    const month = vehicleDateCalendarState.month;
    const selectedIso = readVehicleDateIso(input);
    const todayIso = getVehicleCalendarIsoFromDate(new Date());
    const firstDay = new Date(year, month, 1);
    const startOffset = (firstDay.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    let html = '<div class="vehicle-date-calendar-head">' +
      '<button type="button" class="vehicle-date-calendar-nav" data-action="prev" aria-label="Önceki ay">‹</button>' +
      '<div class="vehicle-date-calendar-title">' + VEHICLE_CALENDAR_MONTHS[month] + ' ' + year + '</div>' +
      '<button type="button" class="vehicle-date-calendar-nav" data-action="next" aria-label="Sonraki ay">›</button>' +
      '</div><div class="vehicle-date-calendar-weekdays">';

    VEHICLE_CALENDAR_DAYS.forEach(function(day) {
      html += '<span>' + day + '</span>';
    });
    html += '</div><div class="vehicle-date-calendar-grid">';

    for (let cell = 0; cell < 42; cell++) {
      const dayNumber = cell - startOffset + 1;
      if (dayNumber < 1 || dayNumber > daysInMonth) {
        html += '<span class="vehicle-date-calendar-empty"></span>';
        continue;
      }
      const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`;
      const classes = ['vehicle-date-calendar-day'];
      if (iso === selectedIso) classes.push('selected');
      if (iso === todayIso) classes.push('today');
      html += '<button type="button" class="' + classes.join(' ') + '" data-date="' + iso + '">' + dayNumber + '</button>';
    }

    html += '</div><div class="vehicle-date-calendar-actions">' +
      '<button type="button" data-action="clear">Temizle</button>' +
      '<button type="button" data-action="today">Bugün</button>' +
      '</div>';
    panel.innerHTML = html;
    panel.setAttribute('aria-hidden', 'false');
  }

  function openVehicleDateCalendar(input, anchor) {
    if (!input || input.disabled || !anchor) return;
    if (vehicleDateCalendarState.input === input && vehicleDateCalendarState.panel && vehicleDateCalendarState.panel.classList.contains('open')) {
      closeVehicleDateCalendar();
      return;
    }
    const selectedDate = getVehicleCalendarDateFromIso(readVehicleDateIso(input)) || new Date();
    vehicleDateCalendarState.input = input;
    vehicleDateCalendarState.anchor = anchor;
    vehicleDateCalendarState.year = selectedDate.getFullYear();
    vehicleDateCalendarState.month = selectedDate.getMonth();
    anchor.setAttribute('aria-expanded', 'true');
    renderVehicleDateCalendarPanel();
    positionVehicleDateCalendarPanel();
  }

  function setVehicleDateCalendarValue(iso) {
    const input = vehicleDateCalendarState.input;
    if (!input) return;
    const previousValue = input.value;
    setVehicleDateInputValue(input, iso || '');
    if (input.value !== previousValue) {
      dispatchVehicleDateInputEvents(input);
    }
    closeVehicleDateCalendar();
  }

  function handleVehicleDateCalendarClick(event) {
    event.stopPropagation();
    const actionBtn = event.target.closest('[data-action]');
    const dayBtn = event.target.closest('[data-date]');
    if (dayBtn) {
      setVehicleDateCalendarValue(dayBtn.getAttribute('data-date'));
      return;
    }
    if (!actionBtn) return;
    const action = actionBtn.getAttribute('data-action');
    if (action === 'prev') {
      vehicleDateCalendarState.month -= 1;
      if (vehicleDateCalendarState.month < 0) {
        vehicleDateCalendarState.month = 11;
        vehicleDateCalendarState.year -= 1;
      }
      renderVehicleDateCalendarPanel();
      positionVehicleDateCalendarPanel();
    } else if (action === 'next') {
      vehicleDateCalendarState.month += 1;
      if (vehicleDateCalendarState.month > 11) {
        vehicleDateCalendarState.month = 0;
        vehicleDateCalendarState.year += 1;
      }
      renderVehicleDateCalendarPanel();
      positionVehicleDateCalendarPanel();
    } else if (action === 'today') {
      setVehicleDateCalendarValue(getVehicleCalendarIsoFromDate(new Date()));
    } else if (action === 'clear') {
      setVehicleDateCalendarValue('');
    }
  }

  function bindVehicleDateCalendarGlobalEvents() {
    if (vehicleDateCalendarState.bound) return;
    vehicleDateCalendarState.bound = true;
    document.addEventListener('pointerdown', function(event) {
      const panel = vehicleDateCalendarState.panel;
      const anchor = vehicleDateCalendarState.anchor;
      if (!panel || !panel.classList.contains('open')) return;
      if (panel.contains(event.target)) return;
      if (anchor && anchor.closest('.vehicle-date-picker-wrap') && anchor.closest('.vehicle-date-picker-wrap').contains(event.target)) return;
      closeVehicleDateCalendar();
    });
    document.addEventListener('keydown', function(event) {
      if (event.key === 'Escape') closeVehicleDateCalendar();
    });
    window.addEventListener('resize', closeVehicleDateCalendar);
  }

  function setupVehicleDatePickers(root) {
    var calendarSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M8 2v4"/><path d="M16 2v4"/><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18"/></svg>';
    bindVehicleDateCalendarGlobalEvents();
    getVehicleDateInputs(root || document).forEach(function(input) {
      if (!input) return;
      if (input.dataset.vehicleDatePickerBound === 'true') {
        syncVehicleDatePickerState(input);
        return;
      }

      var parent = input.parentNode;
      if (!parent) return;

      input.dataset.vehicleDatePickerBound = 'true';

      var wrap = document.createElement('div');
      wrap.className = 'vehicle-date-picker-wrap';

      var field = document.createElement('div');
      field.className = 'vehicle-date-picker-field';

      parent.insertBefore(wrap, input);
      wrap.appendChild(field);
      field.appendChild(input);
      input.classList.add('vehicle-date-picker-text');

      var slot = document.createElement('div');
      slot.className = 'vehicle-date-picker-slot';

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'vehicle-date-picker-btn';
      btn.tabIndex = -1;
      btn.setAttribute('aria-haspopup', 'dialog');
      btn.setAttribute('aria-expanded', 'false');
      btn.innerHTML = calendarSvg;

      var nativeInput = document.createElement('input');
      nativeInput.type = 'date';
      nativeInput.className = 'vehicle-date-picker-native';

      var label = input.id ? document.querySelector('label[for="' + input.id + '"]') : null;
      var labelText = label ? String(label.textContent || '').trim() : '';
      nativeInput.setAttribute('aria-label', labelText ? (labelText + ' seç') : 'Tarih seç');

      function syncTextFromNative() {
        var previousValue = input.value;
        setVehicleDateInputValue(input, nativeInput.value || '');
        if (input.value !== previousValue) {
          dispatchVehicleDateInputEvents(input);
        }
      }

      input.addEventListener('blur', function() {
        syncVehicleDatePickerState(input);
      });
      input.addEventListener('change', function() {
        syncVehicleDatePickerState(input);
      });
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        openVehicleDateCalendar(input, btn);
      });
      nativeInput.addEventListener('input', syncTextFromNative);
      nativeInput.addEventListener('change', syncTextFromNative);

      slot.appendChild(btn);
      slot.appendChild(nativeInput);
      wrap.appendChild(slot);

      syncVehicleDatePickerState(input);
    });
  }

  function formatVehicleDateMaskValue(value) {
    const digits = String(value == null ? '' : value).replace(/[^\d]/g, '').slice(0, 8);
    if (digits.length <= 2) return digits;
    if (digits.length <= 4) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
    return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`;
  }

  function applyVehicleDateTextMask(input) {
    if (!input || !input.matches(VEHICLE_DATE_INPUT_SELECTOR)) return;
    const masked = formatVehicleDateMaskValue(input.value);
    if (input.value !== masked) {
      input.value = masked;
      try { input.setSelectionRange(input.value.length, input.value.length); } catch (e) {}
    }
    input.classList.remove('field-error');
    syncSingleDateInputVisibility(input);
    syncVehicleDatePickerState(input);
  }

  function finalizeVehicleDateTextInput(input) {
    if (!input || !input.matches(VEHICLE_DATE_INPUT_SELECTOR)) return;
    const iso = readVehicleDateIso(input);
    if (iso) {
      setVehicleDateInputValue(input, iso);
    } else {
      input.value = formatVehicleDateMaskValue(input.value);
      syncSingleDateInputVisibility(input);
      syncVehicleDatePickerState(input);
    }
    if (input.id === 'vehicle-muayene-date') {
      maybeScheduleVehicleMuayeneEgzozPrompt(input, { delayMs: 42, commitAttempt: true });
    }
  }

  function saveVehiclesViaApi(vehicles) {
    if (typeof window.dataApi !== 'undefined' && typeof window.dataApi.saveVehiclesList === 'function') {
      return window.dataApi.saveVehiclesList(vehicles);
    }
    return Promise.reject(new Error('dataApi kullanılamıyor.'));
  }


  // --- Helper Functions ---
  /**
   * Sayısal değerleri binlik ayırıcı (.) ile formatlar
   * 
   * @param {string} value - Formatlanacak metin (örn: "150000" veya "150000 TL")
   * @returns {string} - Formatlanmış metin (örn: "150.000") veya boş string
   * 
   * Örnek:
   * formatNumberWithSeparator("150000") -> "150.000"
   * formatNumberWithSeparator("150000 TL") -> "150.000"
   * formatNumberWithSeparator("abc") -> ""
   */
  function formatNumberWithSeparator(value) {
    if (!value || String(value).trim() === '') return '';
    return window.formatNumber(value);
  }

  function resizeVehicleTextareaArea(textarea) {
    if (!textarea) return;
    textarea.style.setProperty('height', 'auto', 'important');
    const minPx = parseFloat(getComputedStyle(textarea).minHeight) || NOTES_MIN_HEIGHT_PX;
    const maxPx = parseFloat(getComputedStyle(textarea).maxHeight) || 300;
    const targetHeight = Math.min(Math.max(textarea.scrollHeight, minPx), maxPx);
    textarea.style.setProperty('height', `${targetHeight}px`, 'important');
    textarea.style.setProperty('overflow-y', targetHeight >= maxPx ? 'auto' : 'hidden', 'important');
  }

  function resizeVehicleNotesArea(textarea) {
    resizeVehicleTextareaArea(textarea);
  }

  function resizeVehicleConditionalTextArea(textarea) {
    resizeVehicleTextareaArea(textarea);
  }

  // --- Tramer Kayıt Fonksiyonları ---
  function formatDateForDisplay(date) { return (typeof window.formatDateShort === 'function' ? window.formatDateShort(date) : (date ? (date instanceof Date ? (String(date.getDate()).padStart(2, '0') + '/' + String(date.getMonth() + 1).padStart(2, '0') + '/' + date.getFullYear()) : String(date)) : '')); }

  /**
   * gg/aa/yyyy formatındaki string'i parse eder
   * 
   * @param {string} dateStr - gg/aa/yyyy formatında tarih string'i
   * @returns {Date|null} - Parse edilmiş Date objesi veya null
   */
  function parseDateInput(dateStr) {
    if (!dateStr) return null;
    
    const datePattern = /^(\d{2})\/(\d{2})\/(\d{4})$/;
    const match = dateStr.match(datePattern);
    
    if (!match) return null;
    
    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;
    const year = parseInt(match[3], 10);
    
    const date = new Date(year, month, day);
    
    // Tarih geçerliliği kontrolü
    if (date.getDate() !== day || date.getMonth() !== month || date.getFullYear() !== year) {
      return null;
    }
    
    return date;
  }

  /**
   * gg/aa/yyyy formatını validate eder
   * 
   * @param {string} dateStr - Validasyon yapılacak tarih (gg/aa/yyyy formatında)
   * @returns {{valid: boolean, message: string}} - Validasyon sonucu
   */
  function validateDateInput(dateStr) {
    if (!dateStr) {
      return { valid: false, message: 'Tarih boş olamaz!' };
    }
    
    const datePattern = /^(\d{2})\/(\d{2})\/(\d{4})$/;
    const match = dateStr.match(datePattern);
    
    if (!match) {
      return { valid: false, message: 'Geçersiz tarih formatı! (gg/aa/yyyy)' };
    }
    
    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const year = parseInt(match[3], 10);
    
    // Tarih geçerliliği kontrolü
    const date = new Date(year, month - 1, day);
    if (date.getDate() !== day || date.getMonth() !== month - 1 || date.getFullYear() !== year) {
      return { valid: false, message: 'Geçersiz tarih!' };
    }
    
    return { valid: true, message: '' };
  }

  /**
   * Sadece rakamlar veya gg/aa/yyyy — 6 hane ggmmaa (yy pivot), 8 hane ggmmaaaa
   */
  function formatTramerDate(value) {
    if (!value) return '';
    const trimmed = String(value).trim();
    if (trimmed.includes('/')) {
      return trimmed;
    }
    const numericValue = trimmed.replace(/[^\d]/g, '');
    if (numericValue.length === 8) {
      const day = numericValue.substring(0, 2);
      const month = numericValue.substring(2, 4);
      const year = numericValue.substring(4, 8);
      return day + '/' + month + '/' + year;
    }
    if (numericValue.length === 6) {
      const day = numericValue.substring(0, 2);
      const month = numericValue.substring(2, 4);
      const yy = parseInt(numericValue.substring(4, 6), 10);
      const currentYear = new Date().getFullYear();
      let fullYear = 2000 + yy;
      if (fullYear > currentYear) fullYear -= 100;
      return day + '/' + month + '/' + String(fullYear);
    }
    return '';
  }

  /** Tramer tarih alanı: blur/Enter sonrası 6 veya 8 rakamı gg/aa/yyyy yap + doğrula */
  function finalizeTramerDateInput(el) {
    if (!el) return;
    const raw = el.value.replace(/[^\d]/g, '');
    if (raw.length === 6 || raw.length === 8) {
      const formatted = formatTramerDate(el.value);
      if (formatted) el.value = formatted;
    } else if (el.value && el.value.length < 10 && !el.value.includes('/')) {
      const formatted = formatTramerDate(el.value);
      if (formatted) el.value = formatted;
    }
    if (el.value.length === 10) {
      const validation = validateTramerDate(el.value);
      if (!validation.valid) {
        el.classList.add('field-error');
        el.title = validation.message;
      } else {
        el.classList.remove('field-error');
        el.title = '';
      }
    }
  }

  /** Tescil tarih input: 6/8 rakamı gg/aa/yyyy yap + overlay */
  function finalizeTescilDateInput(el) {
    if (!el) return;
    const raw = el.value.replace(/[^\d]/g, '');
    if (raw.length === 6 || raw.length === 8) {
      const formatted = formatTramerDate(el.value);
      if (formatted) el.value = formatted;
    } else if (el.value && el.value.length < 10 && !el.value.includes('/')) {
      const formatted = formatTramerDate(el.value);
      if (formatted) el.value = formatted;
    }
    if (typeof updateTescilTarihDisplay === 'function') updateTescilTarihDisplay();
  }

  /**
   * Tramer tarihini validasyon yapar (bugünden ileriye yasak)
   * 
   * @param {string} dateStr - Validasyon yapılacak tarih (gg/aa/yyyy formatında)
   * @returns {{valid: boolean, message: string}} - Validasyon sonucu
   */
  function validateTramerDate(dateStr) {
    if (!dateStr) {
      return { valid: true, message: '' }; // Boş tarih geçerli (opsiyonel)
    }
    
    // Format kontrolü (gg/aa/yyyy)
    const datePattern = /^(\d{2})\/(\d{2})\/(\d{4})$/;
    const match = dateStr.match(datePattern);
    
    if (!match) {
      return { valid: false, message: 'Geçersiz tarih formatı! (gg/aa/yyyy)' };
    }
    
    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const year = parseInt(match[3], 10);
    
    // Tarih geçerliliği kontrolü
    const date = new Date(year, month - 1, day);
    if (date.getDate() !== day || date.getMonth() !== month - 1 || date.getFullYear() !== year) {
      return { valid: false, message: 'Geçersiz tarih!' };
    }
    
    // Bugünden ileriye kontrolü
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (date > today) {
      return { valid: false, message: 'Gelecek bir tarih girilemez!' };
    }
    
    return { valid: true, message: '' };
  }

  /**
   * Tramer tutarını formatlar (2000 → 2.000,00TL)
   * 
   * @param {string} value - Formatlanacak tutar (örn: "2000" veya "2000,00")
   * @returns {string} - Formatlanmış tutar (örn: "2.000,00TL")
   */
  function formatTramerAmount(value) {
    if (!value) return '';
    
    // TL ve noktalardan temizle
    let numericValue = value.replace(/TL/g, '').replace(/\./g, '').replace(/,/g, '.').trim();
    
    // Sadece rakam ve nokta bırak
    numericValue = numericValue.replace(/[^\d.]/g, '');
    
    if (!numericValue) return '';
    
    // Ondalık kısmı ayır
    const parts = numericValue.split('.');
    const integerPart = parts[0] || '0';
    const decimalPart = parts[1] ? parts[1].substring(0, 2).padEnd(2, '0') : '00';
    
    // Binlik ayırıcı ekle
    const integerFormatted = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    
    return `${integerFormatted},${decimalPart}TL`;
  }

  /**
   * Tramer kayıt satırı ekler
   * 
   * @param {string} [date=''] - Tarih değeri (opsiyonel)
   * @param {string} [amount=''] - Tutar değeri (opsiyonel)
   */
  function addTramerRecordRow(date = '', amount = '') {
    const container = document.getElementById('tramer-records-container');
    if (!container) return;
    
    const rowId = `tramer-row-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const isFirstRow = container.children.length === 0;
    
    const row = document.createElement('div');
    row.className = 'tramer-record-row';
    row.id = rowId;
    
    // Tarih input
    const dateInput = document.createElement('input');
    dateInput.type = 'text';
    dateInput.className = 'form-input tramer-date-input';
    dateInput.placeholder = 'gg/aa/yyyy';
    dateInput.value = date;
    dateInput.maxLength = 10;
    dateInput.setAttribute('inputmode', 'numeric');
    
    // Tarih input event'leri: 8 rakamda anında gg/aa/yyyy; 6 rakam Tab/blur/Enter'da (ggmmaa yy pivot)
    dateInput.addEventListener('input', function() {
      const inputValue = this.value.replace(/[^\d]/g, '');
      if (inputValue.length === 8) {
        const formatted = formatTramerDate(inputValue);
        this.value = formatted;
        this.setSelectionRange(this.value.length, this.value.length);
      }
      if (this.value.length === 10) {
        const validation = validateTramerDate(this.value);
        if (!validation.valid) {
          this.classList.add('field-error');
          this.title = validation.message;
        } else {
          this.classList.remove('field-error');
          this.title = '';
        }
      }
    });

    dateInput.addEventListener('blur', function() {
      finalizeTramerDateInput(this);
    });

    dateInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        finalizeTramerDateInput(this);
        this.blur();
      }
    });
    
    // Tutar input
    const amountInput = document.createElement('input');
    amountInput.type = 'text';
    amountInput.className = 'form-input tramer-amount-input';
    amountInput.placeholder = '2.000,00TL';
    amountInput.value = amount;
    amountInput.setAttribute('inputmode', 'numeric');
    
    // Tutar input event'leri
    amountInput.addEventListener('blur', function() {
      if (this.value) {
        const formatted = formatTramerAmount(this.value);
        this.value = formatted;
      }
    });
    
    // Buton (+ veya X)
    const button = document.createElement('button');
    button.type = 'button';
    button.className = isFirstRow ? 'tramer-add-btn' : 'tramer-remove-btn';
    button.innerHTML = isFirstRow ? '+' : '×';
    button.title = isFirstRow ? 'Yeni satır ekle' : 'Satırı sil';
    
    if (isFirstRow) {
      button.addEventListener('click', function() {
        addTramerRecordRow();
      });
    } else {
      button.addEventListener('click', function() {
        removeTramerRecordRow(this);
      });
    }
    
    row.appendChild(dateInput);
    row.appendChild(amountInput);
    row.appendChild(button);
    container.appendChild(row);
  }

  /**
   * Tramer kayıt satırını siler
   * 
   * @param {HTMLElement} buttonElement - Silme butonu elementi
   */
  function removeTramerRecordRow(buttonElement) {
    const row = buttonElement.closest('.tramer-record-row');
    if (row) {
      row.remove();
      
      // İlk satırda + butonu olması gerekiyor
      const container = document.getElementById('tramer-records-container');
      if (container && container.children.length > 0) {
        const firstRow = container.children[0];
        const firstButton = firstRow.querySelector('button');
        if (firstButton && !firstButton.classList.contains('tramer-add-btn')) {
          firstButton.className = 'tramer-add-btn';
          firstButton.innerHTML = '+';
          firstButton.title = 'Yeni satır ekle';
          firstButton.onclick = function() {
            addTramerRecordRow();
          };
        }
      }
    }
  }

  /**
   * Tüm tramer kayıtlarını toplar
   * 
   * @returns {Array<{date: string, amount: string}>} - Tramer kayıtları array'i
   */
  function getTramerRecords() {
    const container = document.getElementById('tramer-records-container');
    if (!container) return [];
    
    const records = [];
    const rows = container.querySelectorAll('.tramer-record-row');
    
    rows.forEach(row => {
      const dateInput = row.querySelector('.tramer-date-input');
      const amountInput = row.querySelector('.tramer-amount-input');
      
      const date = dateInput ? dateInput.value.trim() : '';
      const amount = amountInput ? amountInput.value.trim() : '';
      
      // Sadece hem tarih hem tutar dolu olan kayıtları ekle
      if (date && amount) {
        records.push({
          date: date,
          amount: amount
        });
      }
    });
    
    return records;
  }

  /**
   * Tramer kayıtlarını yükler (edit modu için)
   * 
   * @param {Array<{date: string, amount: string}>} records - Yüklenecek kayıtlar
   */
  function loadTramerRecords(records) {
    const container = document.getElementById('tramer-records-container');
    if (!container) return;
    
    // Container'ı temizle
    container.innerHTML = '';
    
    if (records && records.length > 0) {
      records.forEach(record => {
        addTramerRecordRow(record.date || '', record.amount || '');
      });
    } else {
      // Boşsa ilk satırı ekle
      addTramerRecordRow();
    }
  }

  /**
   * Boya parçaları SVG'sini yükler ve tıklama event'lerini ekler
   */
  function initBoyaPartsSVG() {
    const container = document.getElementById('boya-parts-container');
    if (!container) return;
    
    // SVG zaten yüklüyse tekrar yükleme
    if (container.querySelector('svg')) return;
    
    // SVG içeriğini ortak cache'den al (script-core.getKaportaSvg)
    window.getKaportaSvg().then(svgText => {
        // SVG'yi kendi sahne alanına ekle
        container.innerHTML = '<div class="boya-svg-stage"></div>';
        const stage = container.querySelector('.boya-svg-stage');
        stage.innerHTML = svgText;
        
        // Her parça path'ine tıklama event'i ekle
        const svg = stage.querySelector('svg');
        if (svg) {
          // Tüm path elementlerini bul (g içinde olsa bile)
          const parts = svg.querySelectorAll('path[id]');
          parts.forEach(part => {
            const partId = part.getAttribute('id');
            if (partId && partId !== 'araba-govde') {
              part.classList.add('car-part');
              part.style.cursor = 'pointer';
              part.style.transition = 'fill 0.2s ease';
              
              // Varsayılan gri rengini hafif griye güncelle (#c0c0c0 → #888888)
              const currentFill = part.getAttribute('fill') || part.style.fill || '#c0c0c0';
              if (currentFill === '#c0c0c0' || !part.getAttribute('fill')) {
                part.setAttribute('fill', '#888888');
              }
              
              // Varsayılan durumu boyasız olarak ayarla
              part.dataset.state = 'boyasiz';
              
              part.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                handlePartClick(partId);
              });
            }
          });
        }
        
        // Renk açıklamalarını (legend) ekle
        const legend = document.createElement('div');
        legend.className = 'boya-legend';
        legend.innerHTML = `
          <div class="boya-legend-item">
            <span class="boya-legend-dot boyasiz"></span>
            <span>Boyasız</span>
          </div>
          <div class="boya-legend-item">
            <span class="boya-legend-dot boyali"></span>
            <span>Boyalı</span>
          </div>
          <div class="boya-legend-item">
            <span class="boya-legend-dot degisen"></span>
            <span>Değişen</span>
          </div>
        `;
        container.appendChild(legend);
      })
      .catch(error => {
        console.error('SVG yükleme hatası:', error);
      });
  }

  /**
   * Parça tıklamasında durumu değiştirir (boyasız → boyalı → değişen → boyasız)
   * 
   * @param {string} partId - Parça ID'si (örn: "on-tampon", "kaput")
   */
  function handlePartClick(partId) {
    // SVG içindeki elementler için querySelector kullan
    const container = document.getElementById('boya-parts-container');
    if (!container) return;
    
    const svg = container.querySelector('svg');
    if (!svg) return;
    
    const part = svg.querySelector(`#${partId}`) || document.getElementById(partId);
    if (!part) {
      console.warn('Parça bulunamadı:', partId);
      return;
    }
    
    const currentState = part.dataset.state || 'boyasiz';
    
    // Durum döngüsü: boyasız → boyalı → değişen → boyasız
    let nextState;
    if (currentState === 'boyasiz') {
      nextState = 'boyali';
    } else if (currentState === 'boyali') {
      nextState = 'degisen';
    } else {
      nextState = 'boyasiz';
    }
    
    // Parça durumunu ve rengini güncelle
    updatePartColor(partId, nextState);
  }

  /**
   * Parça rengini durumuna göre günceller
   * 
   * @param {string} partId - Parça ID'si
   * @param {string} state - Durum: "boyasiz" (gri), "boyali" (yeşil), "degisen" (kırmızı)
   */
  function updatePartColor(partId, state) {
    // SVG içindeki elementler için querySelector kullan
    const container = document.getElementById('boya-parts-container');
    if (!container) return;
    
    const svg = container.querySelector('svg');
    if (!svg) return;
    
    const part = svg.querySelector(`#${partId}`) || document.getElementById(partId);
    if (!part) {
      console.warn('Parça bulunamadı (updatePartColor):', partId);
      return;
    }
    
    // Durumu dataset'e kaydet
    part.dataset.state = state;
    
    // Renk belirle
    let color;
    if (state === 'boyali') {
      color = '#4ade80'; // Yeşil
    } else if (state === 'degisen') {
      color = '#d40000'; // Kırmızı
    } else {
      color = '#888888'; // Hafif gri (boyasız)
    }
    
    // Rengi güncelle (hem attribute hem style)
    part.setAttribute('fill', color);
    part.style.fill = color;
  }

  /**
   * Tüm parça durumlarını object olarak döndürür
   * 
   * @returns {Object} - Parça ID'leri ve durumları (örn: { "on-tampon": "boyali", "kaput": "degisen" })
   */
  function getBoyaPartsState() {
    const container = document.getElementById('boya-parts-container');
    if (!container) return {};
    
    const svg = container.querySelector('svg');
    if (!svg) return {};
    
    const state = {};
    const parts = svg.querySelectorAll('path[id]');
    
    parts.forEach(part => {
      const partId = part.getAttribute('id');
      if (partId && partId !== 'araba-govde') {
        const partState = part.dataset.state;
        // Sadece "boyali" veya "degisen" durumlarındaki parçaları kaydet
        if (partState === 'boyali' || partState === 'degisen') {
          state[partId] = partState;
        }
      }
    });
    
    return state;
  }

  /**
   * Kaydedilmiş parça durumlarını SVG'ye yükler
   * 
   * @param {Object} stateObject - Parça ID'leri ve durumları object'i
   */
  function loadBoyaPartsState(stateObject) {
    if (!stateObject || typeof stateObject !== 'object') return;
    
    // Her parça için durumu yükle
    Object.keys(stateObject).forEach(partId => {
      const state = stateObject[partId];
      if (state === 'boyali' || state === 'degisen') {
        updatePartColor(partId, state);
      }
    });
  }

  function capitalizeFirstLetter(text) {
    // Her kelimenin ilk harfini büyük yap
    return text.split(' ').map(word => 
      word.length > 0 ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : word
    ).join(' ');
  }

  /** Marka/model: formatBrandModel (toTitleCase + BMW vb. tam büyük kısaltmalar) */
  function normalizeBrandModelInput(text) {
    const raw = String(text || '').trim();
    if (!raw) return '';
    if (typeof window.formatBrandModel === 'function') {
      return window.formatBrandModel(raw);
    }
    if (typeof window.toTitleCase === 'function') {
      return window.toTitleCase(raw);
    }
    return capitalizeFirstLetter(raw);
  }

  // --- UI Helpers ---
  function updateModalTitle(title) {
    const modal = getModal();
    const titleElement = $(".modal-header h2", modal);
    if (titleElement) titleElement.textContent = title;
  }

  function getBranchSelectionState() {
    const branches = readBranches();
    return {
      branches: branches,
      singleBranch: branches.length === 1 ? branches[0] : null
    };
  }

  /** Tahsis Edilen Şube: select placeholder sınıfı + custom trigger metni ve placeholder sınıfı */
  function syncBranchSelectPlaceholder() {
    const select = document.getElementById("vehicle-branch-select");
    if (!select) return;
    const trigger = document.getElementById("vehicle-branch-trigger");
    const listEl = document.getElementById("vehicle-branch-list");
    const wrap = document.querySelector(".vehicle-branch-dropdown-wrap");
    const branchState = getBranchSelectionState();

    if (branchState.singleBranch) {
      select.value = branchState.singleBranch.id;
      select.classList.remove("branch-placeholder");
      if (wrap) wrap.classList.add("single-branch");
      if (trigger) {
        trigger.textContent = branchState.singleBranch.name;
        trigger.classList.remove("placeholder");
        trigger.classList.add("readonly");
        trigger.setAttribute("aria-disabled", "true");
        trigger.setAttribute("aria-expanded", "false");
        trigger.tabIndex = -1;
      }
      if (listEl) {
        listEl.classList.remove("open");
        listEl.setAttribute("aria-hidden", "true");
        listEl.style.position = "";
        listEl.style.top = "";
        listEl.style.left = "";
        listEl.style.width = "";
      }
      return;
    }

    if (wrap) wrap.classList.remove("single-branch");
    if (select.value === "") select.classList.add("branch-placeholder");
    else select.classList.remove("branch-placeholder");
    if (trigger) {
      trigger.classList.remove("readonly");
      trigger.removeAttribute("aria-disabled");
      trigger.tabIndex = 0;
      const opt = select.options[select.selectedIndex];
      trigger.textContent = opt ? opt.textContent : "Seçiniz";
      if (select.value === "") trigger.classList.add("placeholder");
      else trigger.classList.remove("placeholder");
    }
  }

  /**
   * Şube dropdown listesini localStorage'dan okunan şubelerle doldurur
   *
   * @param {string} [selectedId=""] - Seçili olarak gösterilecek şube ID'si (opsiyonel)
   * 
   * Mantık:
   * 1. "vehicle-branch-select" elementi bulunur
   * 2. İlk option "Seçiniz" olarak eklenir
   * 3. localStorage'dan şubeler okunur
   * 4. Şube yoksa "Önce Şube Ekleyiniz" mesajı gösterilir
   * 5. Şubeler varsa alfabetik sırayla option olarak eklenir
   * 6. selectedId parametresi varsa o şube seçili olur
   */
  function populateBranchSelect(selectedId = "") {
    try {
      const select = document.getElementById("vehicle-branch-select");
      if (!select) return;

      select.innerHTML = "";
      const branchState = getBranchSelectionState();
      const branches = branchState.branches;

      if (branches.length === 0) {
        const firstOpt = document.createElement("option");
        firstOpt.value = "";
        firstOpt.textContent = "Seçiniz";
        select.appendChild(firstOpt);
        const opt = document.createElement("option");
        opt.disabled = true;
        opt.text = "Önce Şube Ekleyiniz";
        select.add(opt);
        buildVehicleBranchDropdownList();
        syncBranchSelectPlaceholder();
        return;
      }

      if (branchState.singleBranch) {
        const opt = document.createElement("option");
        opt.value = branchState.singleBranch.id;
        opt.textContent = branchState.singleBranch.name;
        opt.selected = true;
        select.appendChild(opt);
        buildVehicleBranchDropdownList();
        syncBranchSelectPlaceholder();
        return;
      }

      const firstOpt = document.createElement("option");
      firstOpt.value = "";
      firstOpt.textContent = "Seçiniz";
      select.appendChild(firstOpt);

      branches.forEach(b => {
        const opt = document.createElement("option");
        opt.value = b.id;
        opt.textContent = b.name;
        if (b.id === selectedId) opt.selected = true;
        select.appendChild(opt);
      });

      buildVehicleBranchDropdownList();
      syncBranchSelectPlaceholder();
    } catch (error) {
      // Hata durumunda sessizce çık, dropdown boş kalabilir
    }
  }

  /** Tahsis Edilen Şube custom liste: select option'larından liste div'ini doldurur */
  function buildVehicleBranchDropdownList() {
    const select = document.getElementById("vehicle-branch-select");
    const listEl = document.getElementById("vehicle-branch-list");
    if (!select || !listEl) return;
    listEl.innerHTML = "";
    if (getBranchSelectionState().singleBranch) return;
    for (let i = 0; i < select.options.length; i++) {
      const opt = select.options[i];
      if (opt.disabled && opt.text === "Önce Şube Ekleyiniz") continue;
      const div = document.createElement("div");
      div.className = "vehicle-branch-option";
      div.textContent = opt.textContent;
      if (!opt.disabled) div.setAttribute("data-value", opt.value);
      if (opt.selected) div.classList.add("selected");
      listEl.appendChild(div);
    }
    var addDiv = document.createElement("div");
    addDiv.className = "vehicle-branch-option vehicle-branch-add-hint";
    addDiv.textContent = "+ Yeni Şube Ekle";
    listEl.appendChild(addDiv);
  }

  function resetVehicleForm() {
    const modal = getModal();
    if (!modal) return;
    resetVehicleEgzozPromptState();

    // Reset Inputs (tarih input'ları hariç - onları ayrı ayarlayacağız)
    $all('input.form-input, textarea.form-input', modal).forEach(input => {
      // Tarih input'larını şimdilik atla
      if (input.type === 'date' || input.matches(VEHICLE_DATE_INPUT_SELECTOR)) return;
      
      input.value = '';
      input.classList.remove('has-value');
      
      if (input.id === 'vehicle-notes') {
          resizeVehicleNotesArea(input);
      }
    });

    // Sigorta ve Kasko bitiş tarihlerini bugün + 1 yıl olarak ayarla
    const dateInputs = getVehicleDateInputs(modal);
    if (dateInputs.length >= 2) {
      const today = new Date();
      const nextYear = new Date(today);
      nextYear.setFullYear(today.getFullYear() + 1);
      
      // Tarihi YYYY-MM-DD formatına çevir
      const formatDate = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };
      
      // Sigorta Bitiş Tarihi (index 0) - bugün + 1 yıl
      if (dateInputs[0]) {
        setVehicleDateInputValue(dateInputs[0], formatDate(nextYear));
      }
      
      // Kasko Bitiş Tarihi (index 1) boş kalacak
      if (dateInputs[1]) {
        setVehicleDateInputValue(dateInputs[1], '');
      }
      
      // Muayene Bitiş Tarihi (index 2) boş kalacak
      if (dateInputs[2]) {
        setVehicleDateInputValue(dateInputs[2], '');
      }
      const egzozDateInput = document.getElementById('vehicle-egzoz-date');
      if (egzozDateInput) {
        setVehicleDateInputValue(egzozDateInput, '');
      }
      syncDateInputVisibility(modal);
    }

    const egzozCheckbox = document.getElementById('vehicle-egzoz-different');
    if (egzozCheckbox) egzozCheckbox.checked = false;
    syncEgzozMuayeneFields(modal);

    // Reset Selects & Buttons
    const branchSelect = document.getElementById("vehicle-branch-select");
    if (branchSelect) {
      branchSelect.value = '';
      syncBranchSelectPlaceholder();
    }
    
    $all(".vehicle-type-btn", modal).forEach(btn => btn.classList.remove("active"));
    $all(".radio-btn", modal).forEach(btn => btn.classList.remove("active", "green"));

    // Hide Conditional Fields
    const tramerContainer = document.getElementById('tramer-records-container');
    if (tramerContainer) {
      tramerContainer.style.display = 'none';
      tramerContainer.innerHTML = ''; // Tüm satırları temizle
      const tramerSection = tramerContainer.closest('.form-section');
      if (tramerSection) tramerSection.classList.remove('tramer-records-visible');
    }
    const boyaContainer = document.getElementById('boya-parts-container');
    if (boyaContainer) {
      boyaContainer.style.display = 'none';
      boyaContainer.innerHTML = ''; // SVG'yi temizle
      const formSection = boyaContainer.closest('.form-section');
      if (formSection) formSection.classList.remove('boya-parts-visible');
    }
    ["anahtar-nerede", "kredi-detay"].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.value = '';
        resizeVehicleConditionalTextArea(el);
        const section = el.closest(".form-section");
        if (section) section.classList.remove("input-visible");
      }
    });

    updateModalTitle("KAYIT İŞLEMLERİ");
    populateBranchSelect();

    closeVehicleTypePickerOverlay();
  }

  /**
   * Tarih inputlarının görünürlük sınıfını/renk durumunu tek noktadan senkronlar.
   * Mobil Safari'de ilk açılışta değerin görünmemesi problemine karşı kullanılır.
   */
  function syncSingleDateInputVisibility(input) {
    if (!input) return;
    const hasValue = !!input.value;
    input.classList.toggle('has-value', hasValue);
    if (input.matches(VEHICLE_DATE_INPUT_SELECTOR)) {
      const visibleDateColor = hasValue || input === document.activeElement ? '#a0aec0' : '#6c757d';
      input.style.color = visibleDateColor;
      input.style.webkitTextFillColor = visibleDateColor;
      return;
    }
    const isVehicleRightDate = !!input.closest('#vehicle-modal .modal-column-right');
    const isDinamikOlayDate = !!input.closest('#dinamik-olay-modal');
    // Sağ kolondaki tarih alanlarında (Sigorta/Kasko/Muayene) değeri gizleme:
    // iOS Safari ilk render'da metni boş gösterebildiği için renk daima görünür tutulur.
    if (isVehicleRightDate) {
      const visibleDateColor = hasValue || input === document.activeElement ? '#a0aec0' : '#6c757d';
      input.style.color = visibleDateColor;
      input.style.webkitTextFillColor = visibleDateColor;
      return;
    }
    // Olay Ekle (Kaza/Bakım/Ceza vb.): boşta şeffaf yerine yerel gg.aa.yyyy okunaklı kalsın
    if (isDinamikOlayDate) {
      input.style.color = (hasValue || input === document.activeElement) ? '#888' : 'rgba(255, 255, 255, 0.42)';
      return;
    }
    input.style.color = (hasValue || input === document.activeElement) ? '#888' : 'transparent';
  }

  function syncDateInputVisibility(modal) {
    if (!modal) return;
    const dateInputs = getVehicleDateInputs(modal).concat(
      $all('input[type="date"].form-input', modal).filter(function(input) {
        return !input.matches(VEHICLE_DATE_INPUT_SELECTOR);
      })
    );
    dateInputs.forEach(syncSingleDateInputVisibility);
    getVehicleDateInputs(modal).forEach(syncVehicleDatePickerState);
  }

  function syncEgzozMuayeneFields(modal) {
    const scope = modal || getModal();
    if (!scope) return;
    const checkbox = document.getElementById('vehicle-egzoz-different');
    const section = document.getElementById('vehicle-egzoz-date-section');
    const input = document.getElementById('vehicle-egzoz-date');
    const visible = !!(checkbox && checkbox.checked);
    if (section) section.classList.toggle('egzoz-date-visible', visible);
    if (input) {
      input.disabled = !visible;
      if (!visible) setVehicleDateInputValue(input, '');
      syncSingleDateInputVisibility(input);
      syncVehicleDatePickerState(input);
    }
  }

  function resetVehicleEgzozPromptState() {
    clearVehicleMuayeneEgzozPromptTimers();
    vehicleEgzozPromptState.handledMuayeneDate = '';
    vehicleEgzozPromptState.pendingMuayeneDate = '';
    vehicleEgzozPromptState.promptOpen = false;
    vehicleEgzozPromptState.inputOpen = false;
    vehicleEgzozPromptState.resumeSave = false;
    vehicleEgzozPromptState.suppressPrompt = false;
    vehicleEgzozPromptState.userEditedMuayeneDate = false;
  }

  function closeVehicleEgzozConfirmModal() {
    const modal = document.getElementById('vehicle-egzoz-confirm-modal');
    if (!modal) return;
    modal.classList.remove('active');
    setTimeout(function() {
      modal.style.display = 'none';
    }, 300);
    vehicleEgzozPromptState.promptOpen = false;
  }

  function closeVehicleEgzozDateInputModal() {
    const modal = document.getElementById('vehicle-egzoz-date-modal');
    if (!modal) return;
    modal.classList.remove('active');
    setTimeout(function() {
      modal.style.display = 'none';
    }, 300);
    vehicleEgzozPromptState.inputOpen = false;
  }

  function maybeResumeVehicleSaveAfterEgzozFlow() {
    if (!vehicleEgzozPromptState.resumeSave) return;
    vehicleEgzozPromptState.resumeSave = false;
    setTimeout(function() {
      if (typeof window.saveVehicleRecord === 'function') {
        window.saveVehicleRecord();
      }
    }, 0);
  }

  function showVehicleEgzozConfirmModal(muayeneDate) {
    const modal = document.getElementById('vehicle-egzoz-confirm-modal');
    const messageEl = document.getElementById('vehicle-egzoz-confirm-message');
    if (!modal) return false;
    vehicleEgzozPromptState.pendingMuayeneDate = muayeneDate || '';
    vehicleEgzozPromptState.promptOpen = true;
    if (messageEl) {
      messageEl.textContent = 'Egzos Muayenesi Aynı Tarihte Mi Bitiyor?';
    }
    modal.style.display = 'flex';
    requestAnimationFrame(function() {
      modal.classList.add('active');
    });
    return true;
  }

  function showVehicleEgzozDateModal(defaultDate) {
    const modal = document.getElementById('vehicle-egzoz-date-modal');
    const input = document.getElementById('vehicle-egzoz-date-modal-input');
    if (!modal || !input) return false;
    vehicleEgzozPromptState.inputOpen = true;
    setVehicleDateInputValue(input, defaultDate || '');
    input.classList.remove('field-error');
    modal.style.display = 'flex';
    requestAnimationFrame(function() {
      modal.classList.add('active');
      if (input.type === 'date' && typeof setupDatePlaceholder === 'function') {
        setupDatePlaceholder(input);
      }
      syncSingleDateInputVisibility(input);
      setTimeout(function() {
        input.focus();
      }, 160);
    });
    return true;
  }

  /** type=date .value: yalnızca tam yyyy-mm-dd iken egzoz sorusu açılır */
  function isCompleteIsoDate(value) {
    if (!value || typeof value !== 'string') return false;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    var parts = value.split('-');
    var y = parseInt(parts[0], 10);
    var m = parseInt(parts[1], 10);
    var d = parseInt(parts[2], 10);
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return false;
    var dt = new Date(y, m - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
  }

  /** Gün/ay/yıl bileşeninden yyyy-mm-dd (geçersiz takvim → null) */
  function normalizeYmdToIso(y, mo, d) {
    if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1000 || y > 9999) return null;
    var dt = new Date(y, mo - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
    var mm = mo < 10 ? '0' + mo : String(mo);
    var dd = d < 10 ? '0' + d : String(d);
    return y + '-' + mm + '-' + dd;
  }

  /**
   * Ham tarih dizgesini yyyy-mm-dd yapar (TR: gg.aa.yyyy / gg/aa/yyyy / gg-aa-yyyy / 8 hane ggmmaaaa).
   * Tek kaynak: window.parseVehicleDateRawToIso (data-manager.js); yoksa bu bloktaki ile aynı mantık.
   */
  function parseVehicleDateRawToIso(raw) {
    if (typeof window.parseVehicleDateRawToIso === 'function') {
      return window.parseVehicleDateRawToIso(raw);
    }
    if (raw === undefined) return null;
    if (raw === null) return null;
    if (typeof raw !== 'string') return null;
    var s = raw.trim();
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      return isCompleteIsoDate(s) ? s : null;
    }
    var dm = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(s);
    if (dm) {
      var d = parseInt(dm[1], 10);
      var mo = parseInt(dm[2], 10);
      var y = parseInt(dm[3], 10);
      var isoDm = normalizeYmdToIso(y, mo, d);
      return isoDm === null ? null : isoDm;
    }
    if (/^\d{8}$/.test(s)) {
      var d8 = parseInt(s.slice(0, 2), 10);
      var m8 = parseInt(s.slice(2, 4), 10);
      var y8 = parseInt(s.slice(4, 8), 10);
      var isoD8 = normalizeYmdToIso(y8, m8, d8);
      return isoD8 === null ? null : isoD8;
    }
    return null;
  }

  /** Kayıt modalı tarih input: value + elle girilen gg.aa.yyyy / ggmmaaaa vb. → normalize ISO */
  function readVehicleDateIso(input) {
    if (!input) return '';
    var iso = parseVehicleDateRawToIso(input.value);
    return iso == null ? '' : iso;
  }

  function isVehicleRegistrationModalVisible() {
    var el = document.getElementById('vehicle-modal');
    if (!el) return false;
    var cs = window.getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    return el.classList.contains('active') || el.classList.contains('open');
  }

  var vehicleMuayeneEgzozPromptTimer = null;
  var vehicleMuayeneEgzozLateTimer = null;
  function clearVehicleMuayeneEgzozPromptTimers() {
    if (vehicleMuayeneEgzozPromptTimer) {
      clearTimeout(vehicleMuayeneEgzozPromptTimer);
      vehicleMuayeneEgzozPromptTimer = null;
    }
    if (vehicleMuayeneEgzozLateTimer) {
      clearTimeout(vehicleMuayeneEgzozLateTimer);
      vehicleMuayeneEgzozLateTimer = null;
    }
  }

  function scheduleMaybePromptVehicleEgzozFlow(delayMs) {
    var delay = Number.isFinite(delayMs) && delayMs >= 0 ? delayMs : 48;
    if (vehicleMuayeneEgzozPromptTimer) clearTimeout(vehicleMuayeneEgzozPromptTimer);
    vehicleMuayeneEgzozPromptTimer = setTimeout(function() {
      vehicleMuayeneEgzozPromptTimer = null;
      requestAnimationFrame(function() {
        var hadResumeSave = vehicleEgzozPromptState.resumeSave;
        var opened = maybePromptVehicleEgzozFlow();
        if (hadResumeSave && !opened && !vehicleEgzozPromptState.promptOpen && !vehicleEgzozPromptState.inputOpen) {
          vehicleEgzozPromptState.resumeSave = false;
          requestAnimationFrame(function() {
            if (typeof window.saveVehicleRecord === 'function') {
              window.saveVehicleRecord();
            }
          });
        }
      });
    }, delay);
  }

  /** type=date elle girildiğinde value commit gecikebilir; ana + gecikmeli ikinci kontrol */
  function scheduleMuayeneEgzozPromptRobust(primaryDelayMs) {
    var d = Number.isFinite(primaryDelayMs) && primaryDelayMs >= 0 ? primaryDelayMs : 64;
    scheduleMaybePromptVehicleEgzozFlow(d);
    if (vehicleMuayeneEgzozLateTimer) clearTimeout(vehicleMuayeneEgzozLateTimer);
    vehicleMuayeneEgzozLateTimer = setTimeout(function() {
      vehicleMuayeneEgzozLateTimer = null;
      requestAnimationFrame(function() {
        maybePromptVehicleEgzozFlow();
      });
    }, 280);
  }

  function maybeScheduleVehicleMuayeneEgzozPrompt(muayeneInput, options) {
    const input = muayeneInput || document.getElementById('vehicle-muayene-date');
    if (!input) return false;
    if (vehicleEgzozPromptState.suppressPrompt || vehicleEgzozPromptState.promptOpen || vehicleEgzozPromptState.inputOpen) {
      return false;
    }
    const opts = options || {};
    const rawValue = String(input.value || '').trim();
    const muayeneDate = readVehicleDateIso(input);
    if (!muayeneDate) {
      if (!rawValue || opts.commitAttempt) {
        const clearDelay = Number.isFinite(opts.clearDelayMs) ? opts.clearDelayMs : (opts.commitAttempt ? 28 : 0);
        scheduleMaybePromptVehicleEgzozFlow(clearDelay);
      }
      return false;
    }
    if (vehicleEgzozPromptState.handledMuayeneDate === muayeneDate || vehicleEgzozPromptState.pendingMuayeneDate === muayeneDate) {
      return false;
    }
    const promptDelay = Number.isFinite(opts.delayMs) ? opts.delayMs : 64;
    scheduleMuayeneEgzozPromptRobust(promptDelay);
    return true;
  }

  function maybePromptVehicleEgzozFlow() {
    const modal = getModal();
    const muayeneInput = document.getElementById('vehicle-muayene-date');
    const egzozCheckbox = document.getElementById('vehicle-egzoz-different');
    const egzozInput = document.getElementById('vehicle-egzoz-date');
    if (!modal || !isVehicleRegistrationModalVisible() || !muayeneInput || vehicleEgzozPromptState.suppressPrompt || vehicleEgzozPromptState.promptOpen || vehicleEgzozPromptState.inputOpen) {
      return false;
    }
    const muayeneDate = readVehicleDateIso(muayeneInput);
    if (!muayeneDate) {
      vehicleEgzozPromptState.handledMuayeneDate = '';
      vehicleEgzozPromptState.pendingMuayeneDate = '';
      if (egzozCheckbox) egzozCheckbox.checked = false;
      if (egzozInput) egzozInput.value = '';
      syncEgzozMuayeneFields(modal);
      return false;
    }
    if (vehicleEgzozPromptState.handledMuayeneDate === muayeneDate) {
      return false;
    }
    return showVehicleEgzozConfirmModal(muayeneDate);
  }

  /**
   * iOS Safari: modal ilk açıldığında type="date" inputlar bazen değeri çizmiyor.
   * Modal göründükten sonra değeri yeniden atayarak repaint tetiklenir.
   */
  function forceDateInputRepaint(modal) {
    if (!modal) return;
    $all('input[type="date"].form-input', modal).forEach(function(input) {
      var val = input.value;
      if (val) {
        input.value = '';
        requestAnimationFrame(function() {
          input.value = val;
          syncSingleDateInputVisibility(input);
          requestAnimationFrame(function() {
            syncSingleDateInputVisibility(input);
          });
        });
      } else {
        syncSingleDateInputVisibility(input);
      }
    });
  }

  // --- Date Placeholder Helper ---
  /**
   * Tarih input'larına özel placeholder ekler (iOS uyumlu)
   * 
   * @param {HTMLInputElement} input - Tarih input elementi (type="date")
   * 
   * Mantık:
   * 1. Eski placeholder'ı temizle (varsa)
   * 2. Mobil/Desktop kontrolü yap (left değeri farklı)
   * 3. Input'un padding ve height değerlerini hesapla
   * 4. Input pozisyonunu parent'a göre hesapla
   * 5. Yeni placeholder span oluştur ve parent'a ekle
   * 6. Focus/blur event'lerini dinle (placeholder görünürlüğü için)
   * 
   * Not: 
   * - Mobil (<640px): left="4px", Desktop: left="8px"
   * - Input değeri varsa veya focus'ta placeholder gizlenir
   * - iOS Safari'de date input placeholder'ı göstermek için gerekli
   */
  window.setupDatePlaceholder = function setupDatePlaceholder(input) {
    // Eğer placeholder zaten varsa, kaldır
    const existing = input.parentElement.querySelector('.date-placeholder');
    if (existing) existing.remove();

    syncSingleDateInputVisibility(input);

    // Dinamik olay modalında yerel tarih placeholder'ı yeterli; ekstra span masaüstünde çift gg.aa.yyyy üretiyor.
    if (input.type === 'date' && input.closest('#dinamik-olay-modal')) {
      return;
    }

    // Mobil kontrolü
    const isMobile = window.innerWidth <= 640;
    const isDynamicEventModalDate = isMobile && !!input.closest('#dinamik-olay-modal');
    const leftValue = isDynamicEventModalDate ? '50%' : (isMobile ? '12px' : '8px');
    
    // Input'un padding ve height değerlerini al
    const inputStyle = window.getComputedStyle(input);
    var paddingTop = parseFloat(inputStyle.paddingTop);
    var paddingBottom = parseFloat(inputStyle.paddingBottom);
    if (!Number.isFinite(paddingTop)) paddingTop = 0;
    if (!Number.isFinite(paddingBottom)) paddingBottom = 0;
    var inputHeight = parseFloat(inputStyle.height);
    if (!Number.isFinite(inputHeight) || inputHeight <= 0) {
      inputHeight = input.getBoundingClientRect().height;
    }
    if (!Number.isFinite(inputHeight) || inputHeight <= 0) {
      inputHeight = 22;
    }
    var fontSizePx = parseFloat(inputStyle.fontSize) || 10;
    var lineHeight = parseFloat(inputStyle.lineHeight);
    /* Birimsiz line-height (örn. 1) parseFloat ile 1 olur; span'e 1px yazılmasın */
    if (!Number.isFinite(lineHeight) || lineHeight <= 0 || lineHeight < 8) {
      lineHeight = fontSizePx * 1.2;
    }
    
    // Placeholder'ın line-height'ını da hesapla
    const placeholderLineHeight = fontSizePx * 1.2;
    
    // Input'un pozisyonunu al (parent'a göre)
    const inputRect = input.getBoundingClientRect();
    const parentRect = input.parentElement.getBoundingClientRect();
    const inputOffsetTop = inputRect.top - parentRect.top;
    
    // Input'un içindeki metin alanının ortasını bul
    const contentHeight = inputHeight - paddingTop - paddingBottom;
    const contentCenter = inputOffsetTop + paddingTop + (contentHeight / 2);
    
    // Placeholder'ın top değerini, placeholder'ın ortası contentCenter'a denk gelecek şekilde ayarla
    const topValue = contentCenter - (placeholderLineHeight / 2);
    const centeredPlaceholderStyles = isDynamicEventModalDate
      ? ' width: calc(100% - 36px); max-width: calc(100% - 36px); display: flex; align-items: center; justify-content: center; text-align: center; transform: translateX(-50%);'
      : '';
    
    // Placeholder span oluştur
    const placeholder = document.createElement('span');
    placeholder.className = 'date-placeholder';
    placeholder.textContent = input.placeholder || 'gg.aa.yyyy';
    placeholder.style.cssText = `position: absolute; left: ${leftValue}; top: ${topValue}px; color: #666 !important; pointer-events: none; font-size: ${fontSizePx}px; z-index: 100; line-height: ${lineHeight}px;${centeredPlaceholderStyles}`;
    
    // Input'un parent'ına ekle (input'un içinde görünmesi için)
    const parent = input.parentElement;
    if (parent) {
      // Parent'ı relative yap ve input'un padding'i ile uyumlu olmasını sağla
      parent.style.position = 'relative';
      parent.appendChild(placeholder);
    }
    
    // Placeholder görünürlüğünü kontrol et
    function updatePlaceholder() {
      syncSingleDateInputVisibility(input);
      if (input.value || input === document.activeElement) {
        placeholder.style.display = 'none';
      } else {
        placeholder.style.display = 'block';
      }
    }
    
      // Event listener'lar
      input.addEventListener('change', updatePlaceholder);
      input.addEventListener('input', updatePlaceholder);
      
      input.addEventListener('focus', () => {
        updatePlaceholder();
      });
      
      input.addEventListener('blur', () => {
        updatePlaceholder();
      });
    
      // İlk durumu kontrol et
      updatePlaceholder();
    }

  /**
   * Kayıt modalından şube ekleme formunu açar.
   * Kayıt modalı geçici gizlenir; şube formu kapandığında geri gelir.
   */
  function openBranchFormFromVehicleModal() {
    var vehicleModal = getModal();

    function ensureAyarlarAndOpen() {
      if (typeof window.openBranchFormModal === 'function') {
        if (vehicleModal) {
          vehicleModal.style.visibility = 'hidden';
          vehicleModal.style.pointerEvents = 'none';
        }

        var origClose = window.closeBranchFormModal;
        window.closeBranchFormModal = function() {
          window.closeBranchFormModal = origClose;
          if (typeof origClose === 'function') origClose();
          populateBranchSelect();
          if (vehicleModal) {
            vehicleModal.style.visibility = '';
            vehicleModal.style.pointerEvents = '';
          }
        };

        window.openBranchFormModal(null);
      }
    }

    if (typeof window.loadAppModule === 'function' &&
        (typeof window._ayarlarLoaded === 'undefined' || !window._ayarlarLoaded)) {
      var _mv = window.MEDISA_MODULE_VERSIONS || {};
      var AYARLAR_JS = 'ayarlar.js?v=' + (_mv.ayarlarJs || '20260328.2');
      var AYARLAR_CSS = 'ayarlar.css?v=' + (_mv.ayarlarCss || '20260405.1');
      window.loadAppModule(AYARLAR_JS, AYARLAR_CSS).then(function() {
        window._ayarlarLoaded = true;
        ensureAyarlarAndOpen();
      }).catch(function() {
        alert('Ayarlar modülü yüklenemedi.');
      });
    } else {
      ensureAyarlarAndOpen();
    }
  }

  // --- Modal Functions ---
  window.openVehicleModal = function() {
    const modal = getModal();
    if (modal) {
      isEditMode = false;
      editingVehicleId = null;
      editingVehicleVersion = 1;
      resetVehicleForm();
      syncVehicleBranchFormSectionVisibility();

      modal.style.display = 'flex';
      requestAnimationFrame(() => {
        modal.classList.add('active');
        if (typeof window.updateFooterDim === 'function') {
          window.updateFooterDim();
        }
        // Modal açıldığında tarih placeholder'larını kur
        getVehicleDateInputs(modal).forEach(input => {
          if (input.type === 'date') setupDatePlaceholder(input);
        });
        syncDateInputVisibility(modal);
        setTimeout(() => syncDateInputVisibility(modal), 0);
        setTimeout(() => syncDateInputVisibility(modal), 80);
        setTimeout(() => syncDateInputVisibility(modal), 180);
        // iOS: tarih inputları ilk açılışta boş görünme – repaint tetikle
        setTimeout(() => forceDateInputRepaint(modal), 120);
        // Hover class'larını ayarla
        updateRadioButtonHover();
      });
    }
  };

  window.closeVehicleModal = function() {
    const modal = getModal();
    if (modal) {
      if (typeof window.resetModalInputs === 'function') {
        window.resetModalInputs(modal);
      }
      modal.classList.remove('active');
      setTimeout(() => modal.style.display = 'none', 300);
      resetVehicleForm();
      isEditMode = false;
      editingVehicleId = null;
      editingVehicleVersion = 1;
    }
  };

  // --- Edit Vehicle Function ---
  window.editVehicle = function(vehicleId) {
    const vehicles = readVehicles();
    const vehicle = vehicles.find(v => String(v.id) === String(vehicleId));
    if (!vehicle) {
      alert("Taşıt bulunamadı!");
      return;
    }

    const modal = getModal();
    if (!modal) return;
    clearVehicleMuayeneEgzozPromptTimers();

    isEditMode = true;
    editingVehicleId = vehicleId;
    editingVehicleVersion = (vehicle.version != null && vehicle.version !== undefined) ? Number(vehicle.version) : 1;

    // Formu doldur
    const plateInput = document.getElementById("vehicle-plate");
    const yearInput = document.getElementById("vehicle-year");
    const brandModelInput = document.getElementById("vehicle-brand-model");
    const kmInput = document.getElementById("vehicle-km");
    
    if (plateInput) plateInput.value = vehicle.plate || '';
    if (yearInput) yearInput.value = vehicle.year || '';
    if (brandModelInput) brandModelInput.value = vehicle.brandModel || '';
    if (kmInput) kmInput.value = vehicle.km || '';
    
    // Hata sınıflarını temizle
    [plateInput, yearInput, brandModelInput, kmInput].forEach(el => {
      if (el) el.classList.remove('field-error');
    });

    // Taşıt tipi
    $all('.vehicle-type-btn', modal).forEach(btn => {
      btn.classList.remove('active');
      if (btn.dataset.type === vehicle.vehicleType) {
        btn.classList.add('active');
      }
    });

    // Şanzıman (seçili = her zaman yeşil)
    const transmissionSection = $(`.form-section-inline[data-section="transmission"]`, modal);
    if (transmissionSection && vehicle.transmission) {
      $all('.radio-btn', transmissionSection).forEach(btn => {
        btn.classList.remove('active', 'green');
        if (btn.dataset.value === vehicle.transmission) {
          btn.classList.add('active', 'green');
        }
      });
    }

      // Tramer (Var=yeşil, Yok=kırmızı)
    const tramerSection = $(`.form-section-inline[data-section="tramer"]`, modal);
    if (tramerSection && vehicle.tramer) {
      $all('.radio-btn', tramerSection).forEach(btn => {
        btn.classList.remove('active', 'green');
        if (btn.dataset.value === vehicle.tramer) {
          btn.classList.add('active');
          if (vehicle.tramer === 'var') btn.classList.add('green');
        }
      });
      if (vehicle.tramer === 'var') {
        const container = document.getElementById('tramer-records-container');
        if (container) {
          container.style.display = 'block';
          const formSection = container.closest('.form-section');
          if (formSection) formSection.classList.add('tramer-records-visible');
          // Yeni format (tramerRecords) varsa onu kullan, yoksa eski format (tramerDetay)
          if (vehicle.tramerRecords && vehicle.tramerRecords.length > 0) {
            loadTramerRecords(vehicle.tramerRecords);
          } else if (vehicle.tramerDetay) {
            // Geriye uyumluluk: Eski format varsa boş array kaydet
            loadTramerRecords([]);
          } else {
            // Boşsa ilk satırı ekle
            loadTramerRecords([]);
          }
        }
      }
    }

    // Boya/Değişen (Var=yeşil, Yok=kırmızı)
    const boyaSection = $(`.form-section-inline[data-section="boya"]`, modal);
    if (boyaSection && vehicle.boya) {
      $all('.radio-btn', boyaSection).forEach(btn => {
        btn.classList.remove('active', 'green');
        if (btn.dataset.value === vehicle.boya) {
          btn.classList.add('active');
          if (vehicle.boya === 'var') btn.classList.add('green');
        }
      });
      if (vehicle.boya === 'var') {
        const container = document.getElementById('boya-parts-container');
        if (container) {
          container.style.display = 'block';
          const formSection = container.closest('.form-section');
          if (formSection) formSection.classList.add('boya-parts-visible');
          initBoyaPartsSVG();
          // SVG yüklendikten sonra durumları yükle (setTimeout ile biraz bekle)
          setTimeout(() => {
            if (vehicle.boyaliParcalar && Object.keys(vehicle.boyaliParcalar).length > 0) {
              loadBoyaPartsState(vehicle.boyaliParcalar);
            }
          }, 300);
        }
      }
    }

    // Tarihler
    const dateInputs = getVehicleDateInputs(modal);
    setVehicleDateInputValue(dateInputs[0], vehicle.sigortaDate || '');
    setVehicleDateInputValue(dateInputs[1], vehicle.kaskoDate || '');
    setVehicleDateInputValue(dateInputs[2], vehicle.muayeneDate || '');
    const egzozDate = vehicle.egzozMuayeneDate || '';
    const egzozDifferent = !!(egzozDate && egzozDate !== (vehicle.muayeneDate || ''));
    const egzozCheckbox = document.getElementById('vehicle-egzoz-different');
    const egzozDateInput = document.getElementById('vehicle-egzoz-date');
    if (egzozCheckbox) egzozCheckbox.checked = egzozDifferent;
    if (egzozDateInput) setVehicleDateInputValue(egzozDateInput, egzozDifferent ? egzozDate : '');
    vehicleEgzozPromptState.handledMuayeneDate = readVehicleDateIso(dateInputs[2]) || '';
    vehicleEgzozPromptState.pendingMuayeneDate = '';
    vehicleEgzozPromptState.userEditedMuayeneDate = false;
    syncEgzozMuayeneFields(modal);
    syncDateInputVisibility(modal);

    // Yedek Anahtar (Var=yeşil, Yok=kırmızı)
    const anahtarSection = $(`.form-section-inline[data-section="anahtar"]`, modal);
    if (anahtarSection && vehicle.anahtar) {
      $all('.radio-btn', anahtarSection).forEach(btn => {
        btn.classList.remove('active', 'green');
        if (btn.dataset.value === vehicle.anahtar) {
          btn.classList.add('active');
          if (vehicle.anahtar === 'var') btn.classList.add('green');
        }
      });
      if (vehicle.anahtar === 'var' && vehicle.anahtarNerede) {
        const detay = document.getElementById('anahtar-nerede');
        if (detay) {
          detay.value = vehicle.anahtarNerede;
          resizeVehicleConditionalTextArea(detay);
          detay.closest('.form-section')?.classList.add('input-visible');
        }
      }
    }

    // Hak Mahrumiyeti (Var=yeşil, Yok=kırmızı)
    const krediSection = $(`.form-section-inline[data-section="kredi"]`, modal);
    if (krediSection && vehicle.kredi) {
      $all('.radio-btn', krediSection).forEach(btn => {
        btn.classList.remove('active', 'green');
        if (btn.dataset.value === vehicle.kredi) {
          btn.classList.add('active');
          if (vehicle.kredi === 'var') btn.classList.add('green');
        }
      });
      if (vehicle.kredi === 'var' && vehicle.krediDetay) {
        const detay = document.getElementById('kredi-detay');
        if (detay) {
          detay.value = vehicle.krediDetay;
          resizeVehicleConditionalTextArea(detay);
          detay.closest('.form-section')?.classList.add('input-visible');
        }
      }
    }

    // Şube
    const branchSelect = document.getElementById("vehicle-branch-select");
    if (branchSelect) {
      if (vehicle.branchId) branchSelect.value = vehicle.branchId;
      syncBranchSelectPlaceholder();
      buildVehicleBranchDropdownList();
    }
    syncVehicleBranchFormSectionVisibility();

    // Fiyat ve Notlar
    const priceInput = document.getElementById("vehicle-price");
    if (priceInput) priceInput.value = vehicle.price || '';
    
    const notesInput = document.getElementById("vehicle-notes");
    if (notesInput) {
      notesInput.value = vehicle.notes || '';
      resizeVehicleNotesArea(notesInput);
    }

    const kaskoKoduInput = document.getElementById("vehicle-kasko-kodu");
    if (kaskoKoduInput) kaskoKoduInput.value = vehicle.kaskoKodu || '';

    // Modal başlığını güncelle
    updateModalTitle("TAŞIT DÜZENLE");

    // Modalı aç
    modal.style.display = 'flex';
    requestAnimationFrame(() => {
      modal.classList.add('active');
      getVehicleDateInputs(modal).forEach(input => {
        if (input.type === 'date') setupDatePlaceholder(input);
      });
      syncDateInputVisibility(modal);
      setTimeout(() => syncDateInputVisibility(modal), 0);
      setTimeout(() => syncDateInputVisibility(modal), 80);
      setTimeout(() => syncDateInputVisibility(modal), 180);
      // iOS: Kasko/Muayene tarih inputları ilk açılışta boş görünme – repaint tetikle
      setTimeout(() => forceDateInputRepaint(modal), 120);
      updateRadioButtonHover();
    });

    // Taşıtlar modalını kapat
    if (window.closeVehiclesModal) {
      window.closeVehiclesModal();
    }
  };

  // --- Delete Vehicle Function (server-first, dataApi) ---
  window.deleteVehicle = function(vehicleId) {
    if (!confirm("Bu taşıtı silmek istediğinize emin misiniz?")) {
      return;
    }
    if (typeof window.dataApi === 'undefined' || typeof window.dataApi.deleteVehicle !== 'function') {
      alert("Veri servisi kullanılamıyor.");
      return;
    }
    window.dataApi.deleteVehicle(vehicleId).then(function() {
      if (window.updateNotifications) window.updateNotifications();
      alert("Taşıt silindi!");
      if (window.renderVehicles) window.renderVehicles();
    }).catch(function() {
      alert("Sunucuya silme kaydedilemedi. Lütfen tekrar deneyin.");
    });
  };

  // --- Save Function ---
  /**
   * Taşıt kaydını formdan okuyup localStorage'a kaydeder
   * 
   * Validasyon + Kaydetme işlemi:
   * 1. Zorunlu alanları kontrol et (plaka, yıl, marka/model, km, şanzıman, tramer)
   * 2. Hata varsa kullanıcıya uyarı göster ve ilk hatalı alana focus yap
   * 3. Tüm form verilerini oku (tarihler, radio button'lar, select'ler, textarea'lar)
   * 4. Kayıt objesi oluştur (id, timestamps ile)
   * 5. Edit modunda mevcut kaydı güncelle, yeni modunda ekle
   * 6. localStorage'a yaz ve kullanıcıya bilgi ver
   * 
   * @throws {Error} localStorage yazma hatası durumunda uygulama crash olabilir
   * (Hata yakalama henüz eklenmedi - rapor önerisi #6)
   */
  window.saveVehicleRecord = async function() {
    const modal = getModal();
    if (!modal) return;
    const saveBtn = modal.querySelector('.universal-btn-save[onclick*="saveVehicleRecord"]') || modal.querySelector('.universal-btn-save');
    if (saveBtn && saveBtn.disabled) return;
    if (saveBtn) saveBtn.disabled = true;
    try {
      // Zorunlu alanları kontrol et ve kırmızı çerçeve ekle
    const plateEl = document.getElementById("vehicle-plate");
    const yearEl = document.getElementById("vehicle-year");
    const brandModelEl = document.getElementById("vehicle-brand-model");
    const kmEl = document.getElementById("vehicle-km");
    const egzozDifferentEl = document.getElementById('vehicle-egzoz-different');
    const egzozDateEl = document.getElementById('vehicle-egzoz-date');
    const transmissionSection = $(`.form-section-inline[data-section="transmission"]`, modal);
    const tramerSection = $(`.form-section-inline[data-section="tramer"]`, modal);
    const transmissionBtn = $('.radio-group button.active', transmissionSection);
    const tramerBtn = $('.radio-group button.active', tramerSection);
    
    // Tüm hata sınıflarını temizle
    [plateEl, yearEl, brandModelEl, kmEl, egzozDateEl].forEach(el => {
      if (el) el.classList.remove('field-error');
    });
    if (transmissionSection) transmissionSection.classList.remove('field-error');
    if (tramerSection) tramerSection.classList.remove('field-error');
    
    // Get form values (validation sonrası)
    const plate = plateEl?.value.trim() || '';
    const year = yearEl?.value || '';
    const brandModel = normalizeBrandModelInput(brandModelEl?.value || '');
    const km = kmEl?.value.trim() || '';
    const muayeneDateEl = document.getElementById('vehicle-muayene-date');
    const muayeneDate = readVehicleDateIso(muayeneDateEl);
    
    const activeTypeBtn = $('.vehicle-type-btn.active', modal);
    const vehicleType = activeTypeBtn?.dataset.type || '';
    
    const transmission = transmissionBtn?.dataset.value || '';
    const tramer = tramerBtn?.dataset.value || '';
    
    // Zorunlu alanları kontrol et
    const errors = [];
    if (!plate) {
      errors.push('Plaka');
      if (plateEl) plateEl.classList.add('field-error');
    }
    if (!year) {
      errors.push('Üretim Yılı');
      if (yearEl) yearEl.classList.add('field-error');
    }
    if (!brandModel) {
      errors.push('Marka / Model');
      if (brandModelEl) brandModelEl.classList.add('field-error');
    }
    if (!km) {
      errors.push('Km (Alındığı Tarih)');
      if (kmEl) kmEl.classList.add('field-error');
    }
    if (!transmission) {
      errors.push('Şanzıman Tipi');
      if (transmissionSection) transmissionSection.classList.add('field-error');
    }
    if (!tramer) {
      errors.push('Tramer Kaydı');
      if (tramerSection) tramerSection.classList.add('field-error');
    }
    const egzozDifferent = !!(egzozDifferentEl && egzozDifferentEl.checked);
    let egzozMuayeneDate = '';
    if (egzozDifferent) {
      egzozMuayeneDate = readVehicleDateIso(egzozDateEl) || '';
    } else if (muayeneDate && vehicleEgzozPromptState.handledMuayeneDate === muayeneDate) {
      egzozMuayeneDate = muayeneDate;
    }
    if (egzozDifferent && !egzozMuayeneDate) {
      errors.push('Egzos Muayenesi Bitiş Tarihi');
      if (egzozDateEl) egzozDateEl.classList.add('field-error');
    }
    
    // Hata varsa uyarı göster ve çık
    if (errors.length > 0) {
      alert(`Lütfen Aşağıdaki Alanları Doldurun:\n\n• ${errors.join('\n• ')}`);
      
      // İlk hatalı alana focus
      if (plateEl && !plate) plateEl.focus();
      else if (yearEl && !year) yearEl.focus();
      else if (brandModelEl && !brandModel) brandModelEl.focus();
      else if (kmEl && !km) kmEl.focus();
      
      return;
    }
    if (muayeneDate && vehicleEgzozPromptState.handledMuayeneDate !== muayeneDate) {
      vehicleEgzozPromptState.resumeSave = true;
      scheduleMaybePromptVehicleEgzozFlow(0);
      return;
    }
    const tramerRecords = getTramerRecords();
    const boya = $('.radio-group button.active', $(`.form-section-inline[data-section="boya"]`, modal))?.dataset.value || '';
    const boyaliParcalar = getBoyaPartsState();
    
    const sigortaDate = readVehicleDateIso(document.getElementById('vehicle-sigorta-date')) || '';
    const kaskoDate = readVehicleDateIso(document.getElementById('vehicle-kasko-date')) || '';
    
    const anahtar = $('.radio-group button.active', $(`.form-section-inline[data-section="anahtar"]`, modal))?.dataset.value || '';
    const anahtarNerede = document.getElementById('anahtar-nerede')?.value.trim() || '';
    const kredi = $('.radio-group button.active', $(`.form-section-inline[data-section="kredi"]`, modal))?.dataset.value || '';
    const krediDetay = document.getElementById('kredi-detay')?.value.trim() || '';
    
    let branchId = document.getElementById("vehicle-branch-select")?.value || '';
    if (!isEditMode && getMedisaMainAppSessionRole() === "sube_yonetici") {
      const sessionData = typeof window.getMedisaSession === "function"
        ? (window.getMedisaSession() || {})
        : (window.medisaSession || {});
      const ids = Array.isArray(sessionData.branch_ids) ? sessionData.branch_ids : [];
      const primary = ids.length ? String(ids[0] || "").trim() : "";
      if (primary) branchId = primary;
    }
    const kaskoKodu = document.getElementById("vehicle-kasko-kodu")?.value.trim() || '';
    const price = document.getElementById("vehicle-price")?.value.trim() || '';
    const notes = document.getElementById("vehicle-notes")?.value.trim() || '';

    // PERFORMANS VE FIX: Kasko kodu değiştiğinde anında fiyatı da yeniden hesapla
    let kaskoDegeri = '';
    let kaskoDegeriYuklemeTarihi = '';
    if (kaskoKodu && typeof window.getKaskoDegeriAsync === 'function') {
        kaskoDegeri = await window.getKaskoDegeriAsync(kaskoKodu, year);
        kaskoDegeriYuklemeTarihi = new Date().toISOString();
    } else if (kaskoKodu && typeof window.getKaskoDegeri === 'function') {
        kaskoDegeri = window.getKaskoDegeri(kaskoKodu, year);
        kaskoDegeriYuklemeTarihi = new Date().toISOString();
    }

    /* UTTS / Takip Cihazı: Formda yok; düzenlemede mevcut değer korunur, yeni kayıtta false */
    let uttsTanimlandi = false;
    let takipCihaziMontaj = false;
    if (isEditMode && editingVehicleId) {
      const existing = readVehicles().find(v => String(v.id) === String(editingVehicleId));
      if (existing) {
        uttsTanimlandi = !!existing.uttsTanimlandi;
        takipCihaziMontaj = !!existing.takipCihaziMontaj;
      }
    }

    const record = {
      id: isEditMode ? editingVehicleId : Date.now().toString(),
      plate: plate,
      year: year,
      brandModel: brandModel,
      km: km,
      vehicleType: vehicleType,
      transmission: transmission,
      tramer: tramer,
      tramerRecords: tramerRecords,
      boya: boya,
      boyaliParcalar: boyaliParcalar,
      sigortaDate: sigortaDate,
      kaskoDate: kaskoDate,
      muayeneDate: muayeneDate,
      egzozMuayeneDate: egzozMuayeneDate,
      anahtar: anahtar,
      anahtarNerede: anahtarNerede,
      kredi: kredi,
      krediDetay: krediDetay,
      branchId: branchId,
      kaskoKodu: kaskoKodu,
      kaskoDegeri: kaskoDegeri,
      kaskoDegeriYuklemeTarihi: kaskoDegeriYuklemeTarihi,
      price: price,
      notes: notes,
      uttsTanimlandi: uttsTanimlandi,
      takipCihaziMontaj: takipCihaziMontaj,
      events: isEditMode ? undefined : [], // Yeni kayıtlarda boş array
      satildiMi: false,
      createdAt: isEditMode ? undefined : new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Tescil tarihi onay modalını aç (kayıt işlemi oradan devam edecek)
    showTescilTarihConfirmModal(record);
    } catch (error) {
      alert('Kayıt sırasında bir hata oluştu! Lütfen tekrar deneyin.');
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  };

  // --- Tescil Tarihi Modal Functions ---
  
  // Global değişken: kayıt işlemi için bekleyen record data
  let pendingRecordData = null;

  /**
   * Tescil tarihi onay modalını açar
   * 
   * @param {Object} recordData - Hazırlanmış record object'i (tescilTarihi hariç)
   */
  function showTescilTarihConfirmModal(recordData) {
    pendingRecordData = recordData;
    
    const modal = document.getElementById('tescil-tarih-confirm-modal');
    if (!modal) return;
    
    const today = new Date();
    const todayFormatted = formatDateForDisplay(today);
    const messageEl = document.getElementById('tescil-confirm-message');
    
    if (messageEl) {
      messageEl.textContent = `Tescil Tarihi ${todayFormatted} olarak kaydedilecektir. Farklı tarih belirlemek ister misiniz?`;
    }
    
    modal.style.display = 'flex';
    requestAnimationFrame(() => {
      modal.classList.add('active');
    });
  }

  /**
   * Onay modalında "Evet" butonuna tıklandığında → Tarih giriş modalını açar
   */
  window.confirmOnay = function() {
    const confirmModal = document.getElementById('tescil-tarih-confirm-modal');
    if (confirmModal) {
      confirmModal.classList.remove('active');
      setTimeout(() => confirmModal.style.display = 'none', 300);
    }
    
    const today = new Date();
    const todayFormatted = formatDateForDisplay(today);
    showTescilTarihInputModal(pendingRecordData, todayFormatted);
  };

  /**
   * Onay modalında "Hayır" butonuna tıklandığında → Bugünün tarihi ile kaydet
   */
  window.cancelOnay = function() {
    const confirmModal = document.getElementById('tescil-tarih-confirm-modal');
    if (confirmModal) {
      confirmModal.classList.remove('active');
      setTimeout(() => confirmModal.style.display = 'none', 300);
    }
    
    const today = new Date();
    const todayFormatted = formatDateForDisplay(today);
    performSave(pendingRecordData, todayFormatted);
  };

  /**
   * Tescil tarihi input overlay'ini günceller (gg kısmını kırmızı gösterir)
   */
  function updateTescilTarihDisplay() {
    const inputEl = document.getElementById('tescil-tarih-input');
    const overlayEl = document.getElementById('tescil-tarih-overlay');
    
    if (!inputEl || !overlayEl) return;
    
    const value = inputEl.value || '';
    
    if (!value) {
      overlayEl.innerHTML = '';
      overlayEl.style.display = 'none';
      return;
    }
    
    // Input'un stilini al
    const inputStyle = window.getComputedStyle(inputEl);
    const inputRect = inputEl.getBoundingClientRect();
    
    // Overlay'i input'un tam üzerine yerleştir (input'un kendisinin üzerine, padding dahil)
    overlayEl.style.position = 'absolute';
    overlayEl.style.left = '0';
    overlayEl.style.top = '0';
    overlayEl.style.width = '100%';
    overlayEl.style.height = '100%';
    overlayEl.style.fontSize = inputStyle.fontSize || '14px';
    overlayEl.style.fontFamily = inputStyle.fontFamily || 'inherit';
    overlayEl.style.lineHeight = inputStyle.lineHeight || '1.4';
    overlayEl.style.textAlign = inputStyle.textAlign || 'center';
    overlayEl.style.display = 'flex';
    overlayEl.style.alignItems = 'center';
    overlayEl.style.justifyContent = 'center';
    overlayEl.style.paddingLeft = inputStyle.paddingLeft || '8px';
    overlayEl.style.paddingRight = inputStyle.paddingRight || '8px';
    overlayEl.style.paddingTop = inputStyle.paddingTop || '4px';
    overlayEl.style.paddingBottom = inputStyle.paddingBottom || '4px';
    overlayEl.style.boxSizing = 'border-box';
    
    // Overlay'in background'unu transparent yap (input'un kendi background'u görünsün)
    overlayEl.style.background = 'transparent';
    
    // gg/aa/yyyy formatını parse et
    const datePattern = /^(\d{2})\/(\d{2})\/(\d{4})$/;
    const match = value.match(datePattern);
    
    if (match) {
      const day = match[1];
      const month = match[2];
      const year = match[3];
      
      // Overlay içeriği: gg kısmı kırmızı, geri kalanı normal renk
      overlayEl.innerHTML = `<span class="tescil-day" style="color: #d40000;">${day}</span>/${month}/${year}`;
    } else if (value) {
      // Format henüz tamamlanmamışsa, başlangıçtaki rakamları kırmızı yap
      const digitsOnly = value.replace(/[^\d]/g, '');
      const remaining = value.substring(digitsOnly.length);
      if (digitsOnly.length >= 1 && digitsOnly.length <= 2) {
        overlayEl.innerHTML = `<span class="tescil-day" style="color: #d40000;">${digitsOnly}</span>${remaining}`;
      } else {
        overlayEl.innerHTML = value;
      }
    }
  }

  /**
   * Tescil tarihi giriş modalını açar
   * 
   * @param {Object} recordData - Hazırlanmış record object'i
   * @param {string} defaultDate - Varsayılan tarih (gg/aa/yyyy formatında)
   */
  function showTescilTarihInputModal(recordData, defaultDate) {
    const modal = document.getElementById('tescil-tarih-input-modal');
    if (!modal) return;
    
    const inputEl = document.getElementById('tescil-tarih-input');
    if (inputEl) {
      // Bugünün tarihini varsayılan olarak set et
      const today = new Date();
      const todayFormatted = formatDateForDisplay(today);
      inputEl.value = defaultDate || todayFormatted;
      inputEl.classList.remove('field-error');
      
      // Overlay'i başlangıçta güncelle
      updateTescilTarihDisplay();
      
      // Event listener zaten varsa ekleme (sadece focus ver)
      if (!inputEl.hasAttribute('data-tescil-listener')) {
        inputEl.setAttribute('data-tescil-listener', 'true');
        
        // 8 rakamda anında gg/aa/yyyy; 6 rakam blur/Enter'da; overlay güncelle
        inputEl.addEventListener('input', function() {
          const inputValue = this.value.replace(/[^\d]/g, '');
          if (inputValue.length === 8) {
            const formatted = formatTramerDate(inputValue);
            this.value = formatted;
            this.setSelectionRange(this.value.length, this.value.length);
          }
          updateTescilTarihDisplay();
        });
        inputEl.addEventListener('blur', function() {
          finalizeTescilDateInput(this);
        });
        inputEl.addEventListener('keydown', function(e) {
          if (e.key === 'Enter') {
            e.preventDefault();
            finalizeTescilDateInput(this);
            this.blur();
          }
        });
      }
      
      // Focus ve cursor'u gg (gün) başına yerleştir
      setTimeout(() => {
        inputEl.focus();
        // Cursor'u başa (gg başına) yerleştir
        inputEl.setSelectionRange(0, 0);
      }, 350);
    }
    
    modal.style.display = 'flex';
    requestAnimationFrame(function() {
      modal.classList.add('active');
      requestAnimationFrame(function() {
        updateTescilTarihDisplay();
        requestAnimationFrame(updateTescilTarihDisplay);
      });
    });
  }

  /**
   * Tarih giriş modalında "Kaydet" butonuna tıklandığında → Girilen tarih ile kaydet
   */
  window.saveTescilTarihi = function() {
    const inputEl = document.getElementById('tescil-tarih-input');
    if (!inputEl || !pendingRecordData) return;
    
    const dateStr = inputEl.value.trim();
    
    // Validasyon
    const validation = validateDateInput(dateStr);
    if (!validation.valid) {
      alert(validation.message);
      inputEl.classList.add('field-error');
      inputEl.focus();
      return;
    }
    
    // Modal kapat
    const inputModal = document.getElementById('tescil-tarih-input-modal');
    if (inputModal) {
      inputModal.classList.remove('active');
      setTimeout(() => inputModal.style.display = 'none', 300);
    }
    
    // Kaydet
    performSave(pendingRecordData, dateStr);
  };

  /**
   * Tarih giriş modalında "Vazgeç" butonuna tıklandığında → Modal kapat, iptal et
   */
  window.cancelTescilTarihi = function() {
    const inputModal = document.getElementById('tescil-tarih-input-modal');
    if (inputModal) {
      inputModal.classList.remove('active');
      setTimeout(() => inputModal.style.display = 'none', 300);
    }
    
    // Temizle
    const inputEl = document.getElementById('tescil-tarih-input');
    if (inputEl) {
      inputEl.value = '';
      inputEl.classList.remove('field-error');
    }
    
    pendingRecordData = null;
  };

  window.confirmVehicleEgzozSameDate = function() {
    const muayeneDate = vehicleEgzozPromptState.pendingMuayeneDate || readVehicleDateIso(document.getElementById('vehicle-muayene-date'));
    const egzozCheckbox = document.getElementById('vehicle-egzoz-different');
    const egzozInput = document.getElementById('vehicle-egzoz-date');
    closeVehicleEgzozConfirmModal();
    vehicleEgzozPromptState.suppressPrompt = true;
    if (egzozCheckbox) egzozCheckbox.checked = false;
    if (egzozInput) egzozInput.value = '';
    syncEgzozMuayeneFields(getModal());
    vehicleEgzozPromptState.suppressPrompt = false;
    vehicleEgzozPromptState.handledMuayeneDate = muayeneDate;
    vehicleEgzozPromptState.pendingMuayeneDate = '';
    maybeResumeVehicleSaveAfterEgzozFlow();
  };

  window.confirmVehicleEgzozDifferentDate = function() {
    const egzozCheckbox = document.getElementById('vehicle-egzoz-different');
    const existingDate = document.getElementById('vehicle-egzoz-date')?.value || '';
    closeVehicleEgzozConfirmModal();
    vehicleEgzozPromptState.suppressPrompt = true;
    if (egzozCheckbox) egzozCheckbox.checked = true;
    syncEgzozMuayeneFields(getModal());
    vehicleEgzozPromptState.suppressPrompt = false;
    showVehicleEgzozDateModal(existingDate);
  };

  window.saveVehicleEgzozDateModal = function() {
    const modalInput = document.getElementById('vehicle-egzoz-date-modal-input');
    const egzozCheckbox = document.getElementById('vehicle-egzoz-different');
    const egzozInput = document.getElementById('vehicle-egzoz-date');
    if (!modalInput || !egzozCheckbox || !egzozInput) return;
    const dateValue = readVehicleDateIso(modalInput) || '';
    if (!dateValue) {
      modalInput.classList.add('field-error');
      modalInput.focus();
      return;
    }
    vehicleEgzozPromptState.suppressPrompt = true;
    egzozCheckbox.checked = true;
    setVehicleDateInputValue(egzozInput, dateValue);
    syncEgzozMuayeneFields(getModal());
    vehicleEgzozPromptState.suppressPrompt = false;
    vehicleEgzozPromptState.handledMuayeneDate = vehicleEgzozPromptState.pendingMuayeneDate || readVehicleDateIso(document.getElementById('vehicle-muayene-date'));
    vehicleEgzozPromptState.pendingMuayeneDate = '';
    closeVehicleEgzozDateInputModal();
    maybeResumeVehicleSaveAfterEgzozFlow();
  };

  window.cancelVehicleEgzozDateModal = function() {
    clearVehicleMuayeneEgzozPromptTimers();
    vehicleEgzozPromptState.resumeSave = false;
    vehicleEgzozPromptState.pendingMuayeneDate = '';
    closeVehicleEgzozDateInputModal();
  };

  window.closeVehicleEgzozQuestionFlow = function() {
    clearVehicleMuayeneEgzozPromptTimers();
    vehicleEgzozPromptState.resumeSave = false;
    vehicleEgzozPromptState.pendingMuayeneDate = '';
    closeVehicleEgzozConfirmModal();
    closeVehicleEgzozDateInputModal();
  };

  /**
   * Kayıt işlemini yapar (tescilTarihi ile)
   * 
   * @param {Object} recordData - Hazırlanmış record object'i (tescilTarihi hariç)
   * @param {string} tescilTarihi - Tescil tarihi (gg/aa/yyyy formatında)
   */
  function performSave(recordData, tescilTarihi) {
    try {
      // Tescil tarihini record'a ekle; düzenlemede versiyon bilgisini ekle (çakışma kontrolü)
      const record = {
        ...recordData,
        tescilTarihi: tescilTarihi || ''
      };
      if (isEditMode) record.version = editingVehicleVersion;

      let vehicles = readVehicles();
      
      if (isEditMode) {
        const index = vehicles.findIndex(v => v.id === editingVehicleId);
        if (index !== -1) {
          vehicles[index] = { ...vehicles[index], ...record };
        }
      } else {
        // Yeni kayıt: İlk km'yi guncelKm olarak ayarla ve tarihçeye ekle
        if (record.km) {
          record.guncelKm = record.km.replace(/\./g, ''); // Noktaları temizle
          
          // İlk km revizyon event'i ekle (eskiKm: '-', yeniKm: ilk km)
          if (!record.events) record.events = [];
          const event = {
            id: Date.now().toString(),
            type: 'km-revize',
            date: formatDateForDisplay(new Date()),
            timestamp: new Date().toISOString(),
            data: {
              eskiKm: '-',
              yeniKm: record.guncelKm,
              isInitialKmEntry: true
            }
          };
          record.events.unshift(event);
        }
        if (!record.events) record.events = [];
        const createdTs = record.createdAt || new Date().toISOString();
        const createdEvent = {
          id: String(record.id || '') + '|vehicle-created',
          type: 'vehicle-created',
          date: formatDateForDisplay(new Date()),
          timestamp: createdTs,
          data: {
            plakaSnapshot: String(record.plate || '').trim(),
            kaydeden: (typeof window.getRecorderDisplayName === 'function')
              ? String(window.getRecorderDisplayName() || '').trim()
              : ''
          }
        };
        record.events.unshift(createdEvent);
        
        vehicles.unshift(record);
      }

      saveVehiclesViaApi(vehicles).then(function() {
        if (window.updateNotifications) window.updateNotifications();
        alert(isEditMode ? "Kayıt Güncellendi!" : "Yeni Kayıt Oluşturuldu!");
        window.closeVehicleModal();
        pendingRecordData = null;
      }).catch(function(err) {
        if (err && err.conflict) {
          alert('Dikkat! Bu araç siz ekranı açtıktan sonra başka biri tarafından güncellenmiş. Veri ezilmesini önlemek için lütfen sayfayı yenileyip güncel durumu kontrol edin.');
          return;
        }
        alert('Sunucuya kayıt yapılamadı. Lütfen tekrar deneyin.');
      });
    } catch (error) {
      alert('Kayıt sırasında bir hata oluştu! Lütfen tekrar deneyin.');
    }
  }

  // --- Radio Button Hover Helper ---
  /**
   * Radio button gruplarına dinamik hover renkleri ekler
   * 
   * Her grup tipine göre farklı hover renkleri:
   * - Şanzıman: Tüm butonlar kırmızı hover
   * - Tramer/Boya: Var=kırmızı, Yok=yeşil hover
   * - Yedek Anahtar: Var=yeşil, Yok=kırmızı hover
   * - Hak Mahrumiyeti: Var=kırmızı, Yok=yeşil hover
   * 
   * Mantık:
   * 1. Tüm radio gruplarını bul
   * 2. Her grubun label'ından grup tipini belirle
   * 3. Aktif olmayan butonlara uygun hover class'ı ekle (hover-red veya hover-green)
   * 
   * Not: Aktif butonlara hover class'ı eklenmez
   */
  function updateRadioButtonHover() {
    $all(".radio-group", getModal()).forEach(group => {
      const sectionLabel = group.closest(".form-section-inline")?.querySelector(".form-label")?.textContent || "";
      const isSanziman = sectionLabel.includes("Şanzıman");
      const isTramer = sectionLabel.includes("Tramer");
      const isBoya = sectionLabel.includes("Boya") || sectionLabel.includes("Değişen");
      const isYedekAnahtar = sectionLabel.includes("Yedek Anahtar");
      const isKrediRehin = sectionLabel.includes("Hak Mahrumiyeti") || sectionLabel.includes("Kredi") || sectionLabel.includes("Rehin");
      
      $all(".radio-btn", group).forEach(btn => {
        // Önce tüm hover class'larını kaldır
        btn.classList.remove("hover-red", "hover-green");
        
        // Aktif buton değilse hover class'ı ekle
        if (!btn.classList.contains("active")) {
          if (isSanziman) {
            // Şanzıman: Her iki buton da yeşil hover
            btn.classList.add("hover-green");
          } else if (isTramer || isBoya) {
            // Tramer ve Boya Değişen: Var=kırmızı, Yok=yeşil
            if (btn.dataset.value === "var") {
              btn.classList.add("hover-red");
            } else if (btn.dataset.value === "yok") {
              btn.classList.add("hover-green");
            }
          } else if (isYedekAnahtar) {
            // Yedek Anahtar: Var=yeşil, Yok=kırmızı
            if (btn.dataset.value === "var") {
              btn.classList.add("hover-green");
            } else if (btn.dataset.value === "yok") {
              btn.classList.add("hover-red");
            }
          } else if (isKrediRehin) {
            // Hak Mahrumiyeti: Var=kırmızı, Yok=yeşil
            if (btn.dataset.value === "var") {
              btn.classList.add("hover-red");
            } else if (btn.dataset.value === "yok") {
              btn.classList.add("hover-green");
            }
          }
        }
      });
    });
  }

  // --- Initialization ---
  function initVehicleModalListeners() {
    // Tarih placeholder'ları modal açıldığında kurulacak (openVehicleModal'da)

    // Radio Button Logic
    $all(".radio-btn", getModal()).forEach(btn => {
      btn.addEventListener("click", () => {
        const group = btn.closest(".radio-group");
        $all(".radio-btn", group).forEach(b => b.classList.remove("active", "green"));
        btn.classList.add("active");
        
        // Hata sınıfını kaldır (Şanzıman veya Tramer için)
        const section = btn.closest(".form-section-inline");
        if (section) {
          section.classList.remove('field-error');
        }
        
        // Renk mantığı: Bölüme göre olumlu/olumsuz renk ataması
        const sectionLabel = section?.querySelector(".form-label")?.textContent || "";
        const isTransmission = section?.dataset?.section === "transmission";
        const isNegativeSection = sectionLabel.includes("Boya") || sectionLabel.includes("Değişen") || sectionLabel.includes("Tramer") || sectionLabel.includes("Kredi") || sectionLabel.includes("Rehin") || sectionLabel.includes("Hak Mahrumiyeti");

        if (isTransmission) {
            // Şanzıman Tipi: Her zaman yeşil
            btn.classList.add("green");
        } else if (isNegativeSection) {
            // Boya, Tramer, Hak Mahrumiyeti: Yok = Yeşil (Olumlu), Var = Kırmızı (Olumsuz)
            if (btn.dataset.value === "yok") btn.classList.add("green");
        } else {
            // Yedek Anahtar vb: Var = Yeşil (Olumlu), Yok = Kırmızı (Olumsuz)
            if (btn.dataset.value === "var") btn.classList.add("green");
        }
        
        // Hover class'larını güncelle
        updateRadioButtonHover();

        // Tramer kaydı için özel mantık (sectionLabel zaten tanımlı)
        const isTramer = sectionLabel.includes("Tramer");
        
        if (isTramer) {
          const container = document.getElementById('tramer-records-container');
          if (container) {
            const formSection = container.closest('.form-section');
            if (btn.dataset.value === "var") {
              container.style.display = "block";
              if (formSection) formSection.classList.add('tramer-records-visible');
              if (container.children.length === 0) addTramerRecordRow();
            } else {
              container.style.display = "none";
              container.innerHTML = '';
              if (formSection) formSection.classList.remove('tramer-records-visible');
            }
          }
          return; // Tramer için özel mantık uygulandı, genel mantığa geçme
        }
        
        // Boya parçaları için özel mantık
        const isBoya = sectionLabel.includes("Boya") || sectionLabel.includes("Değişen");
        
        if (isBoya) {
          const container = document.getElementById('boya-parts-container');
          if (container) {
            const formSection = container.closest('.form-section');
            if (btn.dataset.value === "var") {
              container.style.display = "block";
              if (formSection) formSection.classList.add('boya-parts-visible');
              initBoyaPartsSVG();
            } else {
              container.style.display = "none";
              if (formSection) formSection.classList.remove('boya-parts-visible');
            }
          }
          return; // Boya için özel mantık uygulandı, genel mantığa geçme
        }
        
        const nextElem = section?.nextElementSibling;
        
        if (nextElem) {
            const conditionalInput = nextElem.querySelector("textarea") || nextElem.querySelector("input");
            
            if (conditionalInput) {
                if(btn.dataset.value === "var") {
                    nextElem.classList.add("input-visible");
                    conditionalInput.focus();
                } else {
                    conditionalInput.value = "";
                    nextElem.classList.remove("input-visible");
                }
            }
        }
      });
    });

    getVehicleDateInputs(document).forEach(function(input) {
      if (input.dataset.dateMaskBound === 'true') return;
      input.dataset.dateMaskBound = 'true';
      input.addEventListener('input', function() {
        applyVehicleDateTextMask(this);
      });
      input.addEventListener('blur', function() {
        finalizeVehicleDateTextInput(this);
      });
      input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
          finalizeVehicleDateTextInput(this);
        }
      });
    });

    setupVehicleDatePickers(document);
    
    const egzozCheckbox = document.getElementById('vehicle-egzoz-different');
    if (egzozCheckbox) {
      egzozCheckbox.addEventListener('change', function() {
        syncEgzozMuayeneFields(getModal());
      });
      syncEgzozMuayeneFields(getModal());
    }

    const muayeneInput = document.getElementById('vehicle-muayene-date');
    const vehicleModalEl = getModal();
    if (muayeneInput) {
      muayeneInput.addEventListener('input', function() {
        maybeScheduleVehicleMuayeneEgzozPrompt(muayeneInput, { delayMs: 56, commitAttempt: false });
      });
      muayeneInput.addEventListener('change', function() {
        vehicleEgzozPromptState.userEditedMuayeneDate = true;
        setTimeout(function() {
          maybeScheduleVehicleMuayeneEgzozPrompt(muayeneInput, { delayMs: 48, commitAttempt: true });
        }, 0);
      });
      muayeneInput.addEventListener('blur', function() {
        maybeScheduleVehicleMuayeneEgzozPrompt(muayeneInput, { delayMs: 76, commitAttempt: true });
      });
      muayeneInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === 'Tab') {
          setTimeout(function() {
            maybeScheduleVehicleMuayeneEgzozPrompt(muayeneInput, { delayMs: e.key === 'Tab' ? 96 : 84, commitAttempt: true });
          }, 0);
        }
      });
      muayeneInput.addEventListener('keyup', function(e) {
        if (!e.key || e.key.length !== 1) return;
        vehicleEgzozPromptState.userEditedMuayeneDate = true;
      });
      if (vehicleModalEl) {
        const handleMuayeneCommitOutsideInput = function(ev) {
          if (document.activeElement !== muayeneInput) return;
          if (ev.target === muayeneInput) return;
          const pickerWrap = muayeneInput.closest('.vehicle-date-picker-wrap');
          if (pickerWrap && pickerWrap.contains(ev.target)) return;
          if (isVehicleDateCalendarTarget(ev.target)) return;
          setTimeout(function() {
            maybeScheduleVehicleMuayeneEgzozPrompt(muayeneInput, { delayMs: 72, commitAttempt: true });
          }, 0);
        };
        if (window.PointerEvent) {
          vehicleModalEl.addEventListener('pointerdown', handleMuayeneCommitOutsideInput, true);
        } else {
          vehicleModalEl.addEventListener('touchend', handleMuayeneCommitOutsideInput, true);
          vehicleModalEl.addEventListener('mousedown', handleMuayeneCommitOutsideInput, true);
        }
      }
    }

    // Vehicle Type Selection
    $all(".vehicle-type-btn", getModal()).forEach(btn => {
        btn.addEventListener("click", () => {
             $all(".vehicle-type-btn", getModal()).forEach(b => b.classList.remove("active"));
             btn.classList.add("active");
        });
    });

    // Taşıt tipi picker: detaydan açıldıysa taşıt güncelle ve detayı yenile; yoksa kayıt formundaki butonu güncelle
    const pickerOverlay = document.getElementById('vehicle-type-picker-overlay');
    const pickerBackdrop = pickerOverlay && pickerOverlay.querySelector('.vehicle-type-picker-backdrop');
    const pickerOptions = pickerOverlay && pickerOverlay.querySelectorAll('.vehicle-type-picker-option');
    if (pickerBackdrop) {
      pickerBackdrop.addEventListener('click', function() {
        closeVehicleTypePickerOverlay();
      });
    }
    if (pickerOverlay && pickerOptions && pickerOptions.length) {
      pickerOptions.forEach(opt => {
        opt.addEventListener('click', function() {
          const type = this.getAttribute('data-type');
          const fromDetailId = window.vehicleTypePickerFromDetail;
          if (fromDetailId) {
            const vehicles = readVehicles();
            const vehicle = vehicles.find(v => String(v.id) === String(fromDetailId));
            if (vehicle) {
              vehicle.vehicleType = type;
              if (window.dataApi && window.dataApi.saveVehiclesList) {
                window.dataApi.saveVehiclesList(vehicles).catch(function() {});
              }
              if (typeof window.showVehicleDetail === 'function') window.showVehicleDetail(fromDetailId);
            }
            closeVehicleTypePickerOverlay();
          } else {
            const modal = getModal();
            const formBtn = modal && modal.querySelector('.vehicle-type-btn[data-type="' + type + '"]');
            if (formBtn) {
              $all('.vehicle-type-btn', modal).forEach(b => b.classList.remove('active'));
              formBtn.classList.add('active');
            }
            closeVehicleTypePickerOverlay();
          }
        });
      });
    }

    // Plaka - Büyük harfe çevir ve hata sınıfını kaldır
    const plateInput = document.getElementById("vehicle-plate");
    if (plateInput) {
      plateInput.addEventListener('input', function(e) {
        const cursorPos = this.selectionStart;
        this.value = this.value.toUpperCase();
        this.setSelectionRange(cursorPos, cursorPos);
        // Değer girildiğinde hata sınıfını kaldır
        if (this.value.trim()) {
          this.classList.remove('field-error');
        }
      });
    }
    
    // Üretim Yılı - Hata sınıfını kaldır
    const yearInput = document.getElementById("vehicle-year");
    if (yearInput) {
      yearInput.addEventListener('input', function() {
        if (this.value) {
          this.classList.remove('field-error');
        }
      });
    }
    
    // Marka / Model - Hata sınıfını kaldır ve ilk harf büyük
    const brandModelInputEl = document.getElementById("vehicle-brand-model");
    if (brandModelInputEl) {
      brandModelInputEl.addEventListener('input', function() {
        if (this.value.trim()) {
          this.classList.remove('field-error');
        }
      });
      brandModelInputEl.addEventListener('blur', function(e) {
        if (this.value) {
          const cursorPos = this.selectionStart;
          this.value = normalizeBrandModelInput(this.value);
          this.setSelectionRange(cursorPos, cursorPos);
        }
      });
    }
    
    // Km alanı - Binlik ayırıcı ve hata sınıfını kaldır
    const kmInputEl = document.getElementById("vehicle-km");
    if (kmInputEl) {
      kmInputEl.addEventListener('input', function(e) {
        const cursorPos = this.selectionStart;
        const oldLength = this.value.length;
        this.value = formatNumberWithSeparator(this.value);
        const newLength = this.value.length;
        const diff = newLength - oldLength;
        this.setSelectionRange(cursorPos + diff, cursorPos + diff);
        // Değer girildiğinde hata sınıfını kaldır
        if (this.value.trim()) {
          this.classList.remove('field-error');
        }
      });
    }

    // Alım Fiyatı - Binlik ayırıcı
    const priceInput = document.getElementById("vehicle-price");
    if (priceInput) {
      priceInput.addEventListener('input', function(e) {
        const cursorPos = this.selectionStart;
        const oldLength = this.value.length;
        // " TL" kısmını koru
        const hasTL = this.value.includes(' TL');
        let value = this.value.replace(/ TL/g, '').trim();
        value = formatNumberWithSeparator(value);
        if (value) value += ' TL';
        this.value = value;
        const newLength = this.value.length;
        const diff = newLength - oldLength;
        this.setSelectionRange(cursorPos + diff, cursorPos + diff);
      });
    }


    // Yedek Anahtar - İlk harf büyük
    const anahtarInput = document.getElementById("anahtar-nerede");
    if (anahtarInput) {
      anahtarInput.addEventListener('input', function() {
        resizeVehicleConditionalTextArea(this);
      });
      anahtarInput.addEventListener('blur', function(e) {
        if (this.value) {
          const cursorPos = this.selectionStart;
          this.value = capitalizeFirstLetter(this.value);
          resizeVehicleConditionalTextArea(this);
          this.setSelectionRange(cursorPos, cursorPos);
        }
      });
      resizeVehicleConditionalTextArea(anahtarInput);
    }

    // Hak Mahrumiyeti Detay - İlk harf büyük
    const krediDetayInput = document.getElementById("kredi-detay");
    if (krediDetayInput) {
      krediDetayInput.addEventListener('blur', function(e) {
        if (this.value) {
          const cursorPos = this.selectionStart;
          this.value = capitalizeFirstLetter(this.value);
          resizeVehicleConditionalTextArea(this);
          this.setSelectionRange(cursorPos, cursorPos);
        }
      });
    }

    // Notlar Auto-Expand Logic (3 satırdan başlar, yazdıkça büyür) + İlk harf büyük
    const notesArea = document.getElementById("vehicle-notes");
    if(notesArea) {
        notesArea.addEventListener('input', function() {
            resizeVehicleNotesArea(this);
        });
        resizeVehicleNotesArea(notesArea);
        notesArea.addEventListener('blur', function() {
          if (this.value) {
            const cursorPos = this.selectionStart;
            this.value = capitalizeFirstLetter(this.value);
            this.setSelectionRange(cursorPos, cursorPos);
          }
        });
    }

    // Koşullu kayıt alanları: içerik uzadıkça aşağı genişler
    document.querySelectorAll('#anahtar-nerede, #kredi-detay').forEach(function(area) {
      area.addEventListener('input', function() {
        resizeVehicleConditionalTextArea(this);
      });
      resizeVehicleConditionalTextArea(area);
    });

    // Enter ile input'lar arasında dolaşma (kayıt formu)
    (function setupEnterKeyNavigation() {
      const modal = getModal();
      if (!modal) return;

      function isVisible(el) {
        if (!el || !el.offsetParent) return false;
        const s = window.getComputedStyle(el);
        return s.display !== 'none' && s.visibility !== 'hidden';
      }

      function getFocusables() {
        const raw = $all('input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])', modal);
        return raw.filter(isVisible);
      }

      modal.addEventListener('keydown', function(e) {
        if (e.key !== 'Enter') return;
        const target = e.target;
        if (!target.matches('input, select, textarea')) return;
        if (target.tagName === 'TEXTAREA') return; // textarea'da Enter = yeni satır
        e.preventDefault();
        const list = getFocusables();
        const idx = list.indexOf(target);
        if (idx === -1) return;
        const next = list[idx + 1];
        if (next) next.focus();
      });
    })();

    // Initialize branch select and custom dropdown
    populateBranchSelect();
    const branchSelectEl = document.getElementById("vehicle-branch-select");
    if (branchSelectEl) branchSelectEl.addEventListener("change", syncBranchSelectPlaceholder);

    const branchTrigger = document.getElementById("vehicle-branch-trigger");
    const branchList = document.getElementById("vehicle-branch-list");
    const branchWrap = document.querySelector(".vehicle-branch-dropdown-wrap");
    if (branchTrigger && branchList) {
      function positionBranchList() {
        var vehicleModal = document.getElementById("vehicle-modal");
        var modalBody = vehicleModal && vehicleModal.querySelector(".modal-body");
        var r = branchTrigger.getBoundingClientRect();
        var triggerHeight = branchTrigger.offsetHeight || r.height || 44;
        var gap = 6;
        var edgePad = 10;
        var minListPx = 56;
        var maxListCap = 320;

        var spaceBelow = 240;
        var spaceAbove = 240;
        if (modalBody) {
          var br = modalBody.getBoundingClientRect();
          spaceBelow = Math.max(0, Math.floor(br.bottom - r.bottom - gap - edgePad));
          spaceAbove = Math.max(0, Math.floor(r.top - br.top - gap - edgePad));
        } else {
          var vh = window.innerHeight || document.documentElement.clientHeight || 800;
          spaceBelow = Math.max(0, Math.floor(vh - r.bottom - gap - edgePad));
          spaceAbove = Math.max(0, Math.floor(r.top - gap - edgePad));
        }

        var contentScroll = branchList.scrollHeight || 0;
        var desiredOpen = contentScroll > 0 ? contentScroll : 220;
        var useAbove = spaceBelow < Math.min(120, desiredOpen) && spaceAbove > spaceBelow;
        var rawMax = useAbove ? spaceAbove : spaceBelow;
        var maxList = Math.min(maxListCap, Math.max(0, rawMax));
        var listMaxHeight = Math.min(desiredOpen + 2, maxList > 0 ? maxList : minListPx);

        branchList.style.position = "absolute";
        branchList.style.left = "0";
        branchList.style.right = "0";
        branchList.style.width = "100%";
        branchList.style.maxHeight = listMaxHeight + "px";
        branchList.style.overflowY = "auto";
        branchList.style.marginTop = "0";
        branchList.style.marginBottom = "0";
        if (useAbove) {
          branchList.style.top = "auto";
          branchList.style.bottom = (triggerHeight + 4) + "px";
        } else {
          branchList.style.top = (triggerHeight + 4) + "px";
          branchList.style.bottom = "auto";
        }
      }
      function closeBranchList() {
        branchList.classList.remove("open");
        branchTrigger.setAttribute("aria-expanded", "false");
        branchList.setAttribute("aria-hidden", "true");
        branchList.style.position = "";
        branchList.style.top = "";
        branchList.style.bottom = "";
        branchList.style.left = "";
        branchList.style.right = "";
        branchList.style.width = "";
        branchList.style.maxHeight = "";
        branchList.style.overflowY = "";
        branchList.style.marginTop = "";
        branchList.style.marginBottom = "";
      }
      branchTrigger.addEventListener("click", function () {
        if (branchTrigger.classList.contains("readonly") || branchTrigger.getAttribute("aria-disabled") === "true") return;
        var isOpen = branchList.classList.contains("open");
        if (isOpen) {
          closeBranchList();
        } else {
          branchList.classList.add("open");
          branchTrigger.setAttribute("aria-expanded", "true");
          branchList.setAttribute("aria-hidden", "false");
          positionBranchList();
          requestAnimationFrame(function() {
            positionBranchList();
          });
        }
      });
      document.addEventListener("click", function (ev) {
        if (!branchList.classList.contains("open")) return;
        if (branchWrap && branchWrap.contains(ev.target)) return;
        closeBranchList();
      });
      branchList.addEventListener("click", function (ev) {
        var option = ev.target.closest(".vehicle-branch-option");
        if (!option) return;
        if (option.classList.contains("vehicle-branch-add-hint")) {
          closeBranchList();
          openBranchFormFromVehicleModal();
          return;
        }
        if (!option.hasAttribute("data-value")) return;
        var value = option.getAttribute("data-value");
        branchSelectEl.value = value;
        branchList.querySelectorAll(".vehicle-branch-option").forEach(function (o) { o.classList.remove("selected"); });
        option.classList.add("selected");
        branchTrigger.textContent = option.textContent;
        if (value === "") branchTrigger.classList.add("placeholder"); else branchTrigger.classList.remove("placeholder");
        closeBranchList();
        syncBranchSelectPlaceholder();
        branchSelectEl.dispatchEvent(new Event("change"));
      });
      window.addEventListener("resize", function () {
        if (branchList.classList.contains("open")) closeBranchList();
      });
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initVehicleModalListeners);
  } else {
    initVehicleModalListeners();
  }
})();
