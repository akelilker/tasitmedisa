/* ====================================================================
   DOSYA: script-ui-modals.js
   Açıklama: Modal açma/kapama ve genel modal yönetimi
   ==================================================================== */

function showModalFooter() {
    const modal = document.getElementById('modal-veri');
    if (modal) {
        modal.classList.add('show-buttons'); // CSS sınıfı ile kontrol
    }
}

function hideModalFooter() {
    const modal = document.getElementById('modal-veri');
    if (modal) {
        modal.classList.remove('show-buttons'); // CSS sınıfı ile kontrol
    }
}

function openModal(id) {
    const modal = document.getElementById("modal-" + id);
    if (!modal) {
        toast("Pencere yüklenemedi.", "err");
        return;
    }
    document.querySelectorAll('#main-menu .menu-btn.active').forEach(btn => btn.classList.remove('active'));
    const menuButton = document.querySelector(`#main-menu .menu-btn.${id}`);
    if (menuButton) {
        menuButton.classList.add('active');
    }
    modal.classList.add("on");
    setTimeout(() => {
        if (id === "fin") {
            renderFinance();
            showFinanceDetail('cash');
        }
        if (id === "tasitlar") {
            isArchiveViewActive = false;
            document.getElementById('tasitlar-search-input').value = '';
            document.getElementById('tasitlar-search-wrapper').classList.remove('active');
            document.getElementById('tasitlar-search-toggle-btn').classList.remove('active');

            currentTasitlarDetail = 'taşıtlarımız';
            renderTasitlarData(currentTasitlarDetail);
            showTasitlarDetail('taşıtlarımız');
        }
        if (id === "veri") {
            resetForm(); // Formu sıfırla (bu hideModalFooter'ı da çağıracak)
            fillVehicles();
            updateAllPersonDropdowns();
            renderTxList();
            showVeriDetail('kayit');
        }
        if (id === "rapor") {
            initReports();
        }
    }, 100);
}

function closeModal(id) {
    const modal = document.getElementById("modal-" + id);
    if (modal) {
        modal.classList.remove("on");
        const menuButton = document.querySelector(`#main-menu .menu-btn.${id}`);
        if (menuButton) {
            menuButton.classList.remove('active');
        }
        if (id === 'veri') {
            if (isCategorySelectorOpen) toggleCategorySelector(false);
            const vehicleModal = document.getElementById('modal-vehicle-select');
            if (vehicleModal && vehicleModal.classList.contains('on')) closeVehicleLinkModal();
        }
        if (id === 'data-management') {
            closeDataManagementModal();
        }
        if (id === 'category') { }
        // YENİ EKLENEN: Taşıtlar modalı kapanırken detay görünümünü de gizle
        if (id === 'tasitlar') {
             closeVehicleDetailView(); // Yeni eklenen fonksiyonu çağır
        }
    }
}

function openDataManagementModal() {
    closeSettingsMenu();
    document.getElementById('modal-data-management').classList.add('on');
}

function closeDataManagementModal() {
    document.getElementById('modal-data-management').classList.remove('on');
}

function toggleSettingsMenu()
{
    closeNotificationsDropdown();
    document.getElementById('settings-menu').classList.toggle('on');
    document.getElementById('settings-btn').classList.toggle('active');
}

function closeSettingsMenu() {
    document.getElementById('settings-menu').classList.remove('on');
    document.getElementById('settings-btn').classList.remove('active');
}

function openCariModal() {
    renderCariList();
    document.getElementById('modal-cari').classList.add('on');
    closeSettingsMenu();
}

function closeCariModal() { document.getElementById('modal-cari').classList.remove('on'); }

function openCategoryManagementModal() {
    closeSettingsMenu();
    document.getElementById('modal-category').classList.add('on');
    document.getElementById('add-category-panel').classList.add('hidden');
    document.getElementById('delete-category-flow').classList.add('hidden');
    document.getElementById('category-item-list').innerHTML = '';
    document.querySelectorAll('.category-action-btn').forEach(btn => {
        btn.classList.remove('selected-add', 'selected-delete');
    });
    categoryManagementMode = null;
}

function closeCategoryManagementModal() {
    document.getElementById('modal-category').classList.remove('on');
}

function toggleCategoryActionPanel(mode) {
    const addPanel = document.getElementById('add-category-panel');
    const deleteFlow = document.getElementById('delete-category-flow');
    const addBtn = document.getElementById('add-category-btn');
    const deleteBtn = document.getElementById('delete-category-btn');
    const itemList = document.getElementById('category-item-list');
    const addGroupSelection = document.getElementById('add-category-group-selection');
    const addNameWrapper = document.getElementById('add-category-name-wrapper');

    if (categoryManagementMode === mode) {
        addPanel.classList.add('hidden');
        deleteFlow.classList.add('hidden');
        addBtn.classList.remove('selected-add');
        deleteBtn.classList.remove('selected-delete');
        categoryManagementMode = null;
        return;
    }

    categoryManagementMode = mode;
    itemList.innerHTML = '';
    if (addNameWrapper) addNameWrapper.classList.add('hidden');
    if (addGroupSelection) addGroupSelection.style.display = 'none';
    const newCatName = document.getElementById('new-category-name');
    if(newCatName) newCatName.value = '';
    const newCatGroup = document.getElementById('new-category-group');
    if(newCatGroup) newCatGroup.value = '';

    if (mode === 'add') {
        addPanel.classList.remove('hidden');
        deleteFlow.classList.add('hidden');
        addBtn.classList.add('selected-add');
        deleteBtn.classList.remove('selected-delete');
        addGroupSelection.style.display = 'grid';

    } else if (mode === 'delete') {
        deleteFlow.classList.remove('hidden');
        addPanel.classList.add('hidden');
        deleteBtn.classList.add('selected-delete');
        addBtn.classList.remove('selected-add');
    }
}

function showCategoryNameInput(group) {
    document.getElementById('new-category-group').value = group;
    document.getElementById('add-category-group-selection').style.display = 'none';
    document.getElementById('add-category-name-wrapper').classList.remove('hidden');
    document.getElementById('new-category-name').focus();
}

function showDeletableSubcategories(group) {
    const itemList = document.getElementById('category-item-list');
    itemList.innerHTML = '';
    const userCategoriesInGroup = data.userCategories[group];
    let itemsHtml = '';
    for (const key in userCategoriesInGroup) {
        itemsHtml += `
            <div class="deletable-item">
                <span>${userCategoriesInGroup[key]}</span>
                <button onclick="confirmCategoryDeletion('${key}')">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                         <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
               </button>
            </div>
        `;
    }

    if (itemsHtml === '') {
        itemList.innerHTML = `<p style="text-align:center; font-size:14px; color:var(--muted); margin-top:10px;">Bu grupta silinecek özel kategori bulunmuyor.</p>`;
    } else {
        itemList.innerHTML = itemsHtml;
    }
}

function displayCategory(c) {
    const systemButton = document.querySelector(`#category-modal .cat-btn[data-value="${c}"]`);
    if (systemButton) return systemButton.textContent;
    return data.userCategories.gelir[c] || data.userCategories.gider[c] || c;
}

function openCariEditModal(id = null) {
    cariEditingId = id;
	const form = document.getElementById('cari-edit-form');
    form.reset();
    document.getElementById('cari-edit-id').value = '';
    if(id){
        const p = data.persons.find(p => p.id === id);
		document.getElementById('cari-edit-title').textContent = "Cari Düzenle";
        document.getElementById('cari-edit-id').value = id;
        document.getElementById('cari-edit-name').value = p.name;
        document.getElementById('cari-edit-type').checked = p.type === 'asli';
    } else {
        document.getElementById('cari-edit-title').textContent = "Yeni Cari Ekle";
    }
    document.getElementById('modal-cari-edit').classList.add('on');
}

function closeCariEditModal() { document.getElementById('modal-cari-edit').classList.remove('on'); }

function openKonsinyeModal() {
    fillPersons('konsinye-person-id');
    document.getElementById('modal-konsinye-add').classList.add('on');
    const tasitlarModal = document.getElementById('modal-tasitlar');
    if(tasitlarModal) tasitlarModal.style.zIndex = 49;
}

function closeKonsinyeModal() {
    document.getElementById('konsinye-add-form').reset();
    document.getElementById('modal-konsinye-add').classList.remove('on');
    const tasitlarModal = document.getElementById('modal-tasitlar');
    if(tasitlarModal) tasitlarModal.style.zIndex = '';
}

function openAuditModal() {
    renderAudit();
    document.getElementById('modal-audit').classList.add('on');
    closeSettingsMenu();
}

function applyBodyLock(){
    const anyOpen = Array.from(document.querySelectorAll('.modal')).some(m => m.classList.contains('on'));
    document.body.style.overflow = anyOpen ? 'hidden' : '';
}

function toggleNotificationsDropdown() {
    const dropdown = document.getElementById('notifications-dropdown');
    if (!dropdown) return;
    const isVisible = dropdown.classList.toggle('on');
    if (isVisible) {
        closeSettingsMenu();
        renderNotifications();
    }
}

function closeNotificationsDropdown() {
    const dropdown = document.getElementById('notifications-dropdown');
    if(dropdown) dropdown.classList.remove('on');
}

function renderNotifications() {
    const listEl = document.getElementById('notifications-dropdown');
    if (!listEl) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let notificationsHtml = '';
    let notificationCount = 0;

    // 1. Borç Bildirimleri
    const dueDebts = data.schedules.filter(s =>
        s.type === 'borc' && s.status !== 'tamamlandi' && s.status !== 'iptal'
    );
    dueDebts.forEach(debt => {
        const nextPayment = debt.installments.find(i => i.status === 'bekleniyor');
        if (nextPayment) {
            const dueDate = new Date(nextPayment.due_date);
            const timeDiff = dueDate.getTime() - today.getTime();
            const daysDiff = Math.round(timeDiff / (1000 * 3600 * 24));

             if (daysDiff <= DEBT_ALERT_DAYS) {
                notificationCount++;
                const person = data.persons.find(p => p.id === debt.person_id);
                let statusClass = daysDiff < 0 ? 'danger' : 'warn';
                let statusText = daysDiff < 0 ? `Vadesi ${-daysDiff} gün geçti` : (daysDiff === 0 ? 'Son ödeme günü bugün' : `Vadeye ${daysDiff} gün kaldı`);

                notificationsHtml += `
                    <div class="cari-item ${statusClass}" onclick="openModal('fin'); showFinanceDetail('payables'); closeNotificationsDropdown();">
                        <div>
                            <span class="cari-item-name">${person ? person.name : 'Bilinmiyor'} (Borç)</span>
                            <div style="font-size:12px; color: var(--muted); margin-top: 4px;">Ödeme Tarihi: ${fdate(nextPayment.due_date)}</div>
                        </div>
                        <div style="text-align: right;">
                             <div class="cari-item-balance neg">${fmt(nextPayment.amount)}</div>
                             <div style="font-size:11px; font-weight: bold; margin-top: 4px;">${statusText}</div>
                        </div>
                    </div>`;
            }
        }
    });

    // 2. Araç Bildirimleri
    const vehiclesInStock = data.vehicles.filter(v => v.type === 'owned' && v.status === 'stokta');
    vehiclesInStock.forEach(vehicle => {
        let notification = { level: null, text: '' };

        const checks = [
            { date: vehicle.insurance_expiry, type: 'Sigorta' },
            { date: vehicle.inspection_expiry, type: 'Muayene' }
        ];
        checks.forEach(check => {
            if (check.date) {
                const expiryDate = new Date(check.date);
                const timeDiff = expiryDate.getTime() - today.getTime();
                const daysDiff = Math.round(timeDiff / (1000 * 3600 * 24));

                if (daysDiff < 0) {
                    notification = { level: 'danger', text: `${check.type} vadesi ${-daysDiff} gün geçti` };
                } else if (daysDiff <= 30 && notification.level !== 'danger') {
                    notification = { level: 'warn', text: `${check.type} vadesine ${daysDiff} gün kaldı` };
                }
            }
        });

        const purchaseDate = new Date(vehicle.purchase_date);
        const timeDiffPurchase = today.getTime() - purchaseDate.getTime();
        const daysSincePurchase = Math.round(timeDiffPurchase / (1000 * 3600 * 24));
        if (daysSincePurchase >= 0 && daysSincePurchase <= VEHICLE_NEW_ALERT_DAYS && (!vehicle.insurance_expiry || !vehicle.inspection_expiry) && !notification.level) {
            notification = { level: 'warn', text: 'Sigorta/muayene bilgisi eksik' };
        }

        if (notification.level) {
            notificationCount++;
            notificationsHtml += `
                <div class="cari-item ${notification.level}" onclick="openModal('tasitlar'); showTasitlarDetail('taşıtlarımız'); showVehicleDetailInTasitlar(${vehicle.id}); closeNotificationsDropdown();">
                    <div>
                        <span class="cari-item-name">${vehicle.plate}</span>
                        <div style="font-size:12px; color: var(--muted); margin-top: 4px;">${vehicle.name}</div>
                    </div>
                    <div style="text-align: right;">
                         <div style="font-size:11px; font-weight: bold; margin-top: 4px;">${notification.text}</div>
                    </div>
                </div>`;
        }
    });


    if (notificationCount === 0) {
        listEl.innerHTML = '<p>Okunmamış bildiriminiz bulunmuyor.</p>';
    } else {
        listEl.innerHTML = notificationsHtml;
    }

}

