/* ====================================================================
   DOSYA: script-ui-utilities.js
   Açıklama: Form yardımcıları, dropdown doldurma ve kategori selector
   ==================================================================== */

function clearFormErrors() {
    document.getElementById('amount').classList.remove('input-error');
    document.getElementById('purchase_down_payment').classList.remove('input-error');
    const purchaseAmountEl = document.getElementById('purchase_amount');
    if(purchaseAmountEl) purchaseAmountEl.classList.remove('input-error');
    const companyShareEl = document.getElementById('company_share_amount');
    if (companyShareEl) { companyShareEl.classList.remove('input-error'); }
}

function resetForm() {
    document.getElementById("tx-form").reset();
    clearFormErrors(); // Hata göstergelerini temizle

    document.getElementById('selected-category').value = '';

    const valueSpan = document.getElementById('category-trigger-value');
    valueSpan.textContent = "İşlem Türü Seç";
    valueSpan.classList.add('placeholder'); // Vurgu için placeholder sınıfı eklendi
    valueSpan.classList.remove('selected');
    valueSpan.style.color = ''; // CSS belirlesin (placeholder sınıfı rengi belirleyecek)

    editing = null;
	document.getElementById("submit-btn").textContent = "Kaydet";
    document.getElementById("cancel-edit").style.display = "none";
    document.getElementById("date").valueAsDate = new Date();
    tempLinkedVehicleId = null;
    updateLinkedVehicleInfo();

    categoryChanged(); // Alanları gizle/göster (ve buton durumunu ayarla)

    document.getElementById("submit-btn").disabled = false;
    const virmanToggle = document.getElementById('virman-direction-toggle');
    if(virmanToggle){
        virmanToggle.dataset.direction = 'banka-to-kasa';
        virmanToggle.textContent = 'Bankadan Kasaya Aktar';
    }
    const accountKasa = document.getElementById('account_kasa');
    if(accountKasa) accountKasa.checked = true;

    const titleEl = document.querySelector("#modal-veri .m-title");
    if (titleEl) titleEl.textContent = "İşlem Girişi";

    document.querySelectorAll('#category-modal .cat-btn.selected').forEach(b => b.classList.remove('selected'));

    // === YENİ: Butonları gizle ===
    hideModalFooter();
    // =============================
}

function categoryChanged() {
    const commonFieldIds = ['amount-wrap', 'note-wrap', 'date-wrap'];
    const specificFieldIds = [
        'person-wrap', 'vehicle-wrap', 'new-vehicle-wrap',
        'purchase-method-wrap', 'purchase-installments-wrap', 'joint-purchase-wrap',
        'sale-type-wrap', 'buyer-info-wrap', 'installments-wrap',
        'pending-schedules-row', 'virman-direction-wrap', 'vehicle-expense-link-wrap'
    ];

    const cat = document.getElementById("selected-category").value;
    const categoryTrigger = document.getElementById('category-trigger');
    const form = document.getElementById('tx-form');
    const valueSpan = document.getElementById('category-trigger-value');
    const purchaseAmountRowWrap = document.getElementById('purchase-amount-row-wrap'); // YENİ

    // === YENİ: Butonları göster/gizle ve Placeholder sınıfını yönet ===
    if (!cat) {
        hideModalFooter(); // Kategori yoksa gizle
        valueSpan.classList.add('placeholder'); // Vurgu için
    } else {
        showModalFooter(); // Kategori varsa göster
        valueSpan.classList.remove('placeholder'); // Vurguyu kaldır
    }
    // ================================================================

    const showCommonFields = (show) => {
        commonFieldIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = show ? (id === 'date-wrap' ? 'flex' : 'block') : 'none';
        });
        const amountLabel = document.querySelector('#amount-wrap label');
         if (amountLabel) amountLabel.textContent = 'Tutar *';
    };

    const hideSpecificFields = () => {
         specificFieldIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
        // DÜZELTME: Kategori seçilmediğinde Alış Fiyatı satırını da gizle
        if (purchaseAmountRowWrap) purchaseAmountRowWrap.style.display = 'none';
        if (form) form.classList.remove('show-vehicle-expense');
        fillPersons('person', false);
    };

    if (cat) {
        showCommonFields(true);
        hideSpecificFields();
        document.getElementById('account-selector-wrap').style.display = 'flex';

        const amountInput = document.getElementById('amount');
        amountInput.removeEventListener('input', updateJointPurchaseCalculations);
        const purchaseAmountInput = document.getElementById('purchase_amount');
        if(purchaseAmountInput) purchaseAmountInput.removeEventListener('input', updateJointPurchaseCalculations);

        const catBtn = document.querySelector(`.cat-btn[data-value="${cat}"]`);
        const catGroup = catBtn ? catBtn.closest('.cat-sub-group-new')?.id.replace('cat-group-new-', '') : null;
        const isCapitalTx = ['asli-ortak-sermaye-giris', 'asli-ortak-sermaye-cikis'].includes(cat);

        if (isCapitalTx) {
            document.getElementById('person-wrap').style.display = 'block';
            document.querySelector('#person-wrap label').textContent = 'Asli Ortak *';
            fillPersons('person', true);
        } else {
            switch(cat) {
                case 'kasa-banka-virman':
                    document.getElementById('virman-direction-wrap').style.display = 'block';
                    document.getElementById('account-selector-wrap').style.display = 'none';
                    break;
                case 'tasit-alimi':
                    document.getElementById('new-vehicle-wrap').style.display = 'grid';
                    // GÜNCELLEME: purchase-amount-row-wrap'ı göster
                    if (purchaseAmountRowWrap) purchaseAmountRowWrap.style.display = 'grid';
                    document.getElementById('purchase-amount-wrap').style.display = 'block';
                    document.getElementById('purchase-method-wrap').style.display = 'block';
                    if(purchaseAmountInput) purchaseAmountInput.addEventListener('input', updateJointPurchaseCalculations);
                    handlePurchaseMethodChange();
                    showCommonFields(false);
                    document.getElementById('date-wrap').style.display = 'flex';
                    document.getElementById('note-wrap').style.display = 'block';
                    break;
                case 'tasit-satisi':
                    document.getElementById('vehicle-wrap').style.display = 'block';
                    document.getElementById('sale-type-wrap').style.display = 'block';
                    document.getElementById('buyer-info-wrap').style.display = 'block';
                    const amountLabel = document.querySelector('#amount-wrap label');
                    if(amountLabel) amountLabel.textContent = 'Satış Fiyatı *';
                    handleSaleTypeChange();
                    // Ensure purchase amount fields are hidden for sales
                    if (purchaseAmountRowWrap) purchaseAmountRowWrap.style.display = 'none';
                    const purWrap = document.getElementById('purchase-amount-wrap');
                    if (purWrap) purWrap.style.display = 'none';
                    break;
                case 'alinan-borc':
                case 'verilen-borc':
                    document.getElementById('person-wrap').style.display = 'block';
                    document.querySelector('#person-wrap label').textContent = 'Cari Kişi *';
                    document.getElementById('account-selector-wrap').style.display = 'none';
                    break;
                case 'gelen-tl':
                    document.getElementById('person-wrap').style.display = 'block';
                    document.querySelector('#person-wrap label').textContent = 'Ödemeyi Yapan *';
                    document.getElementById('pending-schedules-row').style.display = 'block';
                    fillPendingSchedulesSelect();
                    break;
                default:
                    break;
            }
        }

        if (typeof VEHICLE_RELATED_CATEGORIES !== 'undefined' && VEHICLE_RELATED_CATEGORIES.has(cat)) {
             if (form) form.classList.add('show-vehicle-expense');
             document.getElementById('vehicle-expense-link-wrap').style.display = 'flex';
        } else {
             if (form) form.classList.remove('show-vehicle-expense');
              document.getElementById('vehicle-expense-link-wrap').style.display = 'none';
        }

    } else {
        showCommonFields(false);
        hideSpecificFields();
        document.getElementById('account-selector-wrap').style.display = 'flex';
    }
}

function updateActiveFilterButtons() {
    document.querySelectorAll('.list-controls .filter-btn').forEach(btn => {
        const period = btn.dataset.period;
        if (period) {
            btn.classList.toggle('active', activeDateFilter === period);
        }
    });
}

function generateJointPartnerInputs() {
    const container = document.getElementById('joint-partners-inputs');
    if (!container) return;
    container.innerHTML = '';
    const companyDiv = document.createElement('div');
    companyDiv.className = 'partner-row company-row';
    // Style özellikleri CSS'e taşındı (masaüstü için)
    companyDiv.innerHTML = `
        <div>
            <label for="company_share_amount">Şirket Payı</label>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
            <div class="input-with-adornment" style="flex: 1;">
                <input type="text" inputmode="decimal" class="joint-partner-amount" id="company_share_amount" placeholder="Ödenen TL" data-is-auto-filled="true">
            </div>
            <span class="partner-percentage" style="flex-shrink: 0; font-size: 12px; color: var(--muted); white-space: nowrap;">% 0.00</span>
        </div>
        <div></div> <div></div> `;
    container.appendChild(companyDiv);

    const companyShareInput = companyDiv.querySelector('#company_share_amount');
    companyShareInput.addEventListener('blur', formatNumberInput);
    companyShareInput.addEventListener('input', (e) => {
        e.target.dataset.isAutoFilled = 'false';
		e.target.classList.remove('input-error');
        updateJointPurchaseCalculations();
    });
    addPartnerRow(true); // İlk ortak satırını '+' butonuyla ekle

    // GÜNCELLEME: Ayrı '+' butonunu kaldırıldı
    const separateAddBtn = document.getElementById('add-partner-btn');
    if (separateAddBtn) {
        // separateAddBtn.remove();
    }
}

function addPartnerRow(isInitial = false) {
    const container = document.getElementById('joint-partners-inputs');
    if (!container) return;
    const partnerRows = container.querySelectorAll('.partner-row:not(.company-row)');

    if (partnerRows.length >= 4 && !isInitial) { // Max 4 ortak + 1 şirket = 5
        toast("Maksimum ortak sayısı aşıldı (4 Ortak).", "warn");
        return;
    }

    // --- Yeni Satır Eklemeden Önce ---
    if (!isInitial && partnerRows.length > 0) {
        // Mevcut son satırdaki '+' butonunu 'x' butonu ile değiştir
        const lastRow = partnerRows[partnerRows.length - 1];
        const lastButtonContainer = lastRow.querySelector('.add-button-container'); // 4. div'e class ekledik
        if (lastButtonContainer) {
            lastButtonContainer.innerHTML = `
                <button type="button" class="remove-partner-btn btn-text" style="padding:0; height:100%; width:100%; font-size: 20px; line-height: 1; color: var(--danger-red); transition: none;">
                    <span style="display:block; transform: scale(0.8); transition: none;">&times;</span>
                </button>
            `;
            // Silme butonuna event listener ekle
            lastButtonContainer.querySelector('.remove-partner-btn').addEventListener('click', (e) => {
                e.target.closest('.partner-row').remove();
                updateJointPurchaseCalculations();
            });
        }
    }

    // --- Yeni Satırı Oluştur ---
    const partnerDiv = document.createElement('div');
    partnerDiv.className = 'partner-row';
    // Style özellikleri CSS'e taşındı
    partnerDiv.innerHTML = `
        <div>
            <label>Ortak</label>
            <select class="joint-partner-id"></select>
        </div>
        <div>
            <label>Ödenen Tutar</label>
            <div style="display: flex; align-items: center; gap: 8px;">
                <div class="input-with-adornment" style="flex: 1;">
                    <input type="text" inputmode="decimal" class="joint-partner-amount" placeholder="Ödenen TL" data-is-auto-filled="true">
                </div>
                <span class="partner-percentage" style="flex-shrink: 0; font-size: 12px; color: var(--muted); white-space: nowrap;">% 0.00</span>
                <div class="add-button-container">
                    <button type="button" class="add-partner-btn btn-text" onclick="addPartnerRow(false)" style="padding: 0; font-size: 20px; line-height: 1; width: 32px; height: 32px; flex-shrink: 0;">+</button>
                </div>
            </div>
        </div>
        <div></div>
        <div class="remove-button-container"></div>
    `;

    const amountInput = partnerDiv.querySelector('.joint-partner-amount');
    container.appendChild(partnerDiv);
    const selectElement = partnerDiv.querySelector('.joint-partner-id');
    populatePartnerSelect(selectElement);
    amountInput.addEventListener('blur', formatNumberInput);
    amountInput.addEventListener('input', (e) => {
        e.target.dataset.isAutoFilled = 'false';
        updateJointPurchaseCalculations();
    });

    // Eğer bu ilk eklenen satır DEĞİLSE, data-is-auto-filled'ı true bırak
    if (!isInitial) amountInput.dataset.isAutoFilled = 'true';
    else amountInput.dataset.isAutoFilled = 'false'; // İlk satır manuel doldurulmalı

    updateJointPurchaseCalculations();
}

function populatePartnerSelect(selectElement) {
    if (!selectElement) return;
    let optionsHTML = '<option value="">Ortak Seçiniz...</option>';
    optionsHTML += '<option value="new_person">+ Yeni Kişi Ekle</option>';
    data.persons.sort((a,b)=>a.name.localeCompare(b.name)).forEach(p => {
        optionsHTML += `<option value="${p.id}">${p.name}${p.type === 'asli' ? ' (Ortak)' : ''}</option>`;
    });
    selectElement.innerHTML = optionsHTML;
}

function fillVehicles(includeSold = false) {
    const sel = document.getElementById("vehicle");
    if(!sel) return;
    sel.innerHTML = '<option value="">Araç seçin...</option>';
	let vehicles = data.vehicles;
    if (!includeSold) {
        vehicles = vehicles.filter(v => v.status === 'stokta' && v.type === 'owned');
    }
    vehicles.forEach(v => sel.innerHTML += `<option value="${v.id}">${v.plate} - ${v.name}</option>`);
}

function fillPersons(elementId, filterToPrimary = false) {
    const sel = document.getElementById(elementId);
    if (!sel) return;
    sel.innerHTML = '<option value="">Kişi seçin...</option><option value="new_person" style="font-weight:bold; color:var(--green);">+ Yeni Kişi Ekle</option>';
    let personsToDisplay = data.persons;

    if (filterToPrimary) {
        personsToDisplay = data.persons.filter(p => p.type === 'asli');
    }

	personsToDisplay.sort((a,b)=>a.name.localeCompare(b.name)).forEach(p => sel.innerHTML += `<option value="${p.id}">${p.name}</option>`);
}

function updateAllPersonDropdowns() {
    fillPersons('person');
    fillPersons('buyer_person_id');
    fillPersons('konsinye-person-id');
    document.querySelectorAll('#joint-partners-inputs .joint-partner-id').forEach(selectEl => {
        const currentVal = selectEl.value;
        populatePartnerSelect(selectEl);
        if (currentVal && selectEl.querySelector(`option[value="${currentVal}"]`)) {
            selectEl.value = currentVal;
        }
    });
}

function fillPendingSchedulesSelect(){
    const sel = document.getElementById('pending-schedule-select');
    if(!sel) return;
    sel.innerHTML = '<option value="">Bekleyen bir alacak seçiniz...</option>';
    const personId = Number(document.getElementById('person').value);
    if(!personId) return;
    const schedules = data.schedules.filter(s => s.person_id === personId && s.type === 'alacak' && s.status !== 'tamamlandi' && s.status !== 'iptal');
    schedules.forEach(s => sel.innerHTML += `<option value="${s.id}">ID ${s.id} - Kalan: ${fmt(s.remaining)}</option>`);
}

function toggleCategorySelector(show) {
    const overlay = document.getElementById('category-overlay');
    const formContainer = document.querySelector('#modal-veri .m-wrap');
    const trigger = document.getElementById('category-trigger');
    isCategorySelectorOpen = show;

    if (show) {
        document.querySelectorAll('.cat-group-btn-new').forEach(btn => btn.classList.remove('dimmed'));
        document.querySelectorAll('.cat-sub-group-new').forEach(group => group.classList.remove('active'));
    }

    overlay.classList.toggle('active', show);
    if (formContainer) {
        formContainer.classList.toggle('blurred', show);
        formContainer.style.transition = 'filter 0.3s ease, transform 0.3s ease';
    }

    if(trigger) trigger.classList.toggle('active', show);

    if (!show) {
        document.querySelectorAll('.cat-group-btn-new').forEach(btn => btn.classList.remove('dimmed'));
        document.querySelectorAll('.cat-sub-group-new').forEach(group => group.classList.remove('active'));
    }
}

function rebuildMainCategorySelector() {
    const groups = {
        gelir: document.getElementById('cat-group-new-gelir'),
        gider: document.getElementById('cat-group-new-gider')
    };
    document.querySelectorAll('.cat-btn.user-added').forEach(btn => btn.remove());
    if (groups.gelir) {
        for (const key in data.userCategories.gelir) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'cat-btn user-added';
            btn.dataset.value = key;
            btn.dataset.type = 'gelir';
            btn.textContent = data.userCategories.gelir[key];
            groups.gelir.appendChild(btn);
        }
    }

    if (groups.gider) {
        for (const key in data.userCategories.gider) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'cat-btn user-added';
            btn.dataset.value = key;
            btn.dataset.type = 'gider';
            btn.textContent = data.userCategories.gider[key];
            groups.gider.appendChild(btn);
        }
    }

    setupCategorySelectorV2();
}

function setupCategorySelectorV2() {
    const closeBtn = document.getElementById('category-close-btn');
    if(closeBtn) closeBtn.onclick = () => toggleCategorySelector(false);

    document.querySelectorAll('.cat-group-btn-new').forEach(btn => {
        const handler = (e) => {
            e.stopPropagation();
            const group = btn.dataset.group;
            // Düzeltme: Alt grup ID'sini doğru oluşturduğundan emin ol
            const subGroupId = `cat-group-new-${group}`;
            const subGroup = document.getElementById(subGroupId);

            // Eğer tıklanan gruba ait bir alt grup yoksa (örn. 'sermaye' için ayrı buton yoktu), işlemi durdurma.
            // if (!subGroup) return; // Bu satırı kaldırdım, çünkü bazı grupların butonu olsa da ayrı sub-group div'i olmayabilir.

            const isActive = subGroup ? subGroup.classList.contains('active') : false; // Alt grup varsa durumunu kontrol et

            // Önce tüm alt grupları kapat
            document.querySelectorAll('.cat-sub-group-new').forEach(el => el.classList.remove('active'));
            // Tüm ana butonları soluklaştır
            document.querySelectorAll('.cat-group-btn-new').forEach(el => el.classList.add('dimmed'));

            // Eğer tıklanan grup aktif değilse VE bir alt grubu varsa, onu aç
            if (!isActive && subGroup) {
                subGroup.classList.add('active');
                btn.classList.remove('dimmed'); // Tıklanan butonu netleştir
            } else {
                // Eğer zaten aktifti (tekrar tıklandı) veya alt grup yoksa, tüm ana butonları netleştir
                 document.querySelectorAll('.cat-group-btn-new').forEach(el => el.classList.remove('dimmed'));
            }
        };

        // Mevcut olay dinleyici varsa kaldırıp yenisini ekle (önemli!)
        if (btn._clickHandler) btn.removeEventListener('click', btn._clickHandler);
        btn._clickHandler = handler;
        btn.addEventListener('click', handler);
    });

	// Alt kategori butonlarının olay dinleyicilerini tekrar ata (rebuild sonrası için de önemli)
	document.querySelectorAll('.cat-btn').forEach(btn => {
        if (btn._clickHandler) btn.removeEventListener('click', btn._clickHandler);
        // handleCategoryButtonClick fonksiyonu script-main.js'de tanımlı olmalı
        if (typeof handleCategoryButtonClick === 'function') {
            btn._clickHandler = handleCategoryButtonClick;
            btn.addEventListener('click', handleCategoryButtonClick);
        } else {
            console.error("Hata: handleCategoryButtonClick fonksiyonu bulunamadı!");
        }
    });
}

// --- SİLİNDİ: getPrefilledNotes() ---
// Bu fonksiyon araçlara özeldir ve script-ui-vehicle.js dosyasına taşınmıştır.