/* ====================================================================
   DOSYA: script-ui-vehicle.js
   Açıklama: Taşıt detay, kart, galeri, tramer ve masraf yönetimi
   (GÜNCELLEME v81 - ACİL GERİ DÖNÜŞ - SADE VE ÇALIŞAN SÜRÜM)
   ==================================================================== */

// Yeni Dinamik Fonksiyonlar
function updateGalerideMi(val) {
    const textEl = document.getElementById("galeride-mi-text");
    const konumWrap = document.getElementById("galeride-mi-konum-wrap");

    if (val === "evet") {
        textEl.textContent = "Evet";
        konumWrap.style.display = "none";
    } else {
        textEl.textContent = "Hayır";
        konumWrap.style.display = "block";
    }
}

function updateGalerideKonum() {
    const konum = document.getElementById("galeride-konum")?.value.trim() || '';
    const textEl = document.getElementById("galeride-konum-text");
    if(textEl) textEl.textContent = konum;
}

function toggleArchiveView() {
    isArchiveViewActive = !isArchiveViewActive;
    const searchInput = document.getElementById('tasitlar-search-input');
    if (searchInput) searchInput.value = '';
    showTasitlarDetail(currentTasitlarDetail, true);
    updateKonsinyeButtonVisibility();
}

function toggleTasitlarSearch() {
    const wrapper = document.getElementById('tasitlar-search-wrapper');
    const input = document.getElementById('tasitlar-search-input');
    const searchBtn = document.getElementById('tasitlar-search-toggle-btn');
    if (!wrapper || !input || !searchBtn) return;
    
    const isVisible = wrapper.classList.toggle('active');
    searchBtn.classList.toggle('active', isVisible);

    if (isVisible) {
        input.focus();
    } else {
        if (input.value) {
            input.value = '';
            renderTasitlarData(currentTasitlarDetail, '');
        }
    }
    updateKonsinyeButtonVisibility();
}

function updateKonsinyeButtonVisibility() {
    const btn = document.getElementById('btn-add-konsinye');
    const searchWrapper = document.getElementById('tasitlar-search-wrapper');
    const isSearchActive = searchWrapper ? searchWrapper.classList.contains('active') : false;

    if (btn) {
        if (currentTasitlarDetail === 'konsinye' && !isArchiveViewActive && !isSearchActive) {
            btn.style.display = 'block';
        } else {
            btn.style.display = 'none';
        }
    }
}

function renderTasitlarData(view, searchText = '') {
    const searchInput = document.getElementById('tasitlar-search-input');
    const archiveBtn = document.getElementById('tasitlar-archive-btn');
    if (archiveBtn) {
        archiveBtn.classList.toggle('active', isArchiveViewActive);
    }

    if (searchInput) {
        if (isArchiveViewActive) {
            searchInput.placeholder = "Arşivde plaka, model veya sahip ara...";
        } else {
            searchInput.placeholder = "Stokta plaka, marka veya model ara...";
        }
    }

    updateKonsinyeButtonVisibility();

    if(view === 'taşıtlarımız') {
        renderOwnedVehiclesGrid(searchText);
    } else if (view === 'konsinye') {
        renderConsignedVehiclesGrid(searchText);
    }
}

function showTasitlarDetail(view, isAction = false) {
    if (!isAction) {
        isArchiveViewActive = false;
        const searchWrapper = document.getElementById('tasitlar-search-wrapper');
        if (searchWrapper && searchWrapper.classList.contains('active')) {
             searchWrapper.classList.remove('active');
             const searchBtn = document.getElementById('tasitlar-search-toggle-btn');
             if(searchBtn) searchBtn.classList.remove('active');
        }
    }
    
    const controls = document.querySelector('#modal-tasitlar .tasitlar-controls');
    if (controls) controls.style.display = 'flex';

    currentTasitlarDetail = view;
    document.querySelectorAll('#modal-tasitlar .detail-tabs .tab').forEach(t => t.classList.toggle('on', t.dataset.view === view));

    const detailEl = document.getElementById('tasitlar-detail');
    const vehicleDetailView = document.getElementById('vehicle-detail-view');
    
    if (vehicleDetailView && !isAction) vehicleDetailView.style.display = 'none';
    if (detailEl) detailEl.style.display = 'block';
    
    const searchInput = document.getElementById('tasitlar-search-input');
    const searchText = searchInput ? searchInput.value : '';
    renderTasitlarData(view, searchText);
}

function renderOwnedVehiclesGrid(searchText = '') {
    const detailEl = document.getElementById('tasitlar-detail');
    if (!detailEl) return;

    let vehicles;
    if (isArchiveViewActive) {
        vehicles = data.vehicles.filter(v => v.type === 'owned' && ['satildi', 'iptal-edildi'].includes(v.status));
    } else {
        vehicles = data.vehicles.filter(v => v.status === 'stokta' && v.type === 'owned');
    }

    if (searchText) {
        const lowerSearchText = searchText.toLowerCase().trim();
        vehicles = vehicles.filter(v =>
            v.plate.toLowerCase().includes(lowerSearchText) ||
            v.name.toLowerCase().includes(lowerSearchText)
        );
    }

    if (vehicles.length === 0) {
        const viewName = isArchiveViewActive ? 'Arşivde' : 'Stokta';
        const reason = searchText ? 'arama kriterlerine uygun' : '';
        detailEl.innerHTML = `<p style="text-align:center; padding: 20px;">${viewName} ${reason} sahip olunan taşıt bulunmuyor.</p>`;
        return;
    }

    let tableHtml = '<table><thead><tr><th style="text-align:center;">Giriş T.</th><th style="text-align:center;">Plaka</th><th style="text-align:center;">Model</th><th style="width:24px;"></th></tr></thead><tbody>';
    
    vehicles.sort((a,b) => new Date(b.purchase_date) - new Date(a.purchase_date)).forEach(v => {
        let rowClass = '';
        
        const debtSchedule = data.schedules.find(s => s.vehicle_id === v.id && s.type === 'borc' && s.status !== 'tamamlandi' && s.status !== 'iptal');
        
        // BASİT SPAN - CSS GEREKTİRMEZ
        let debtIndicator = '';
        if(debtSchedule) {
             debtIndicator = ' <span style="color:var(--danger-red); font-size:13px;" title="Ödeme Bekliyor">🕒</span>';
        }

        let dangerIndicator = '';

        if (!isArchiveViewActive) {
             const today = new Date(); today.setHours(0, 0, 0, 0);
             let notificationLevel = null;
             const checks = [ { date: v.insurance_expiry }, { date: v.inspection_expiry } ];
             checks.forEach(check => {
                 if (check.date) {
                     const daysDiff = Math.round((new Date(check.date) - today) / (1000 * 3600 * 24));
                     if (daysDiff < 0) notificationLevel = 'danger';
                     else if (daysDiff <= 30 && notificationLevel !== 'danger') notificationLevel = 'warning';
                 }
             });
             
             if (notificationLevel) {
                 rowClass = `class="vehicle-row-${notificationLevel}"`;
                 // BASİT SPAN - CSS GEREKTİRMEZ
                 if (notificationLevel === 'danger') {
                     dangerIndicator = ' <span style="color:var(--danger-red); font-size:16px; font-weight:900;">!</span>';
                 }
             }
        }

        const date = v.purchase_date ? fdate(v.purchase_date) : '-';
        
        const iconHtml = `<div style="display:flex; align-items:center; justify-content:center;">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#cccccc" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 0 2px rgba(255,255,255,0.3));"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                          </div>`;

        // ESKİ SAĞLAM HTML YAPISI
        tableHtml += `<tr ${rowClass} style="cursor:pointer; ${isArchiveViewActive ? 'opacity:0.8;' : ''}" onclick="showVehicleDetailInTasitlar(${v.id})">
            <td style="text-align:center;">${date}</td> 
            <td style="text-align:center; white-space:nowrap;">${v.plate}${debtIndicator}${dangerIndicator}</td>
            <td style="text-align:left; padding-left:8px;">${v.name}</td>
            <td class="action-cell" style="padding: 0; text-align:center;">${iconHtml}</td>
        </tr>`;
    });
    tableHtml += '</tbody></table>';
    detailEl.innerHTML = tableHtml;
}

function renderConsignedVehiclesGrid(searchText = '') {
    const detailEl = document.getElementById('tasitlar-detail');
    if (!detailEl) return;

    let consignedVehicles;
    if (isArchiveViewActive) {
        consignedVehicles = data.vehicles.filter(v => v.type === 'consigned' && v.status === 'iade-edildi');
    } else {
        consignedVehicles = data.vehicles.filter(v => v.status === 'stokta' && v.type === 'consigned');
    }

    if (searchText) {
        const lowerSearchText = searchText.toLowerCase().trim();
        const personMap = new Map(data.persons.map(p => [p.id, p.name.toLowerCase()]));
        consignedVehicles = consignedVehicles.filter(v => {
            const ownerName = personMap.get(v.person_id) || '';
            return v.plate.toLowerCase().includes(lowerSearchText) ||
                   v.name.toLowerCase().includes(lowerSearchText) ||
                   ownerName.includes(lowerSearchText);
        });
    }

    if (consignedVehicles.length === 0) {
        const viewName = isArchiveViewActive ? 'Arşivde' : 'Stokta';
        const reason = searchText ? 'arama kriterlerine uygun' : '';
        detailEl.innerHTML = `<p style="text-align:center; padding: 20px;">${viewName} ${reason} konsinye taşıt bulunmuyor.</p>`;
        return;
    }

    let tableHtml = '<table style="font-size:12px;"><thead><tr><th style="text-align:center;">Giriş T.</th><th style="text-align:center;">Plaka</th><th style="text-align:center;">Model</th><th style="text-align:center;">Sahibi</th><th style="width:24px;"></th></tr></thead><tbody>';
    
    consignedVehicles.forEach(v => {
        const owner = data.persons.find(p => p.id === v.person_id);
        
        const iconHtml = `<div style="display:flex; align-items:center; justify-content:center;">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#cccccc" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 0 2px rgba(255,255,255,0.3));"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                          </div>`;
        
        tableHtml += `<tr style="cursor:pointer; ${isArchiveViewActive ? 'opacity:0.8;' : ''}" onclick="showVehicleDetailInTasitlar(${v.id})">
            <td style="text-align:center;">${v.entry_date ? fdate(v.entry_date) : '-'}</td> 
            <td style="text-align:center; white-space:nowrap;">${v.plate}</td>
            <td style="text-align:left; padding-left:8px;">${v.name}</td>
            <td style="text-align:center;">${owner ? owner.name : 'Bilinmiyor'}</td>
            <td class="action-cell" style="padding: 0; text-align:center;">${iconHtml}</td>
        </tr>`;
    });
    tableHtml += '</tbody></table>';
    detailEl.innerHTML = tableHtml; 
}

function showVehicleDetailInTasitlar(vehicleId) {
    showVehicleDetailViewAdvanced(vehicleId);
}

function showVehicleDetailViewAdvanced(vehicleId) {
    const v = data.vehicles.find(v => v.id === vehicleId);
    if (!v) return;

    const controls = document.querySelector('#modal-tasitlar .tasitlar-controls');
    if (controls) controls.style.display = 'none';

    toggleVehicleEditMode(false); 
    editingVehicleDetailId = vehicleId;
    vehicleDetailOriginalData = { ...v };
    if (!Array.isArray(v.tramer_records)) v.tramer_records = [];
    tempTramerRecords = JSON.parse(JSON.stringify(v.tramer_records));

    const viewEl = document.getElementById('vehicle-detail-view');
    if (!viewEl) return;

    const isReadOnly = ['satildi', 'iptal-edildi', 'iade-edildi'].includes(v.status);
    const editBtn = document.getElementById('vehicle-detail-btn-edit');
    if (editBtn) {
        editBtn.style.display = isReadOnly ? 'none' : 'block';
    }

    document.getElementById('vehicle-detail-plate').textContent = (v.plate || '').toUpperCase();
    
    // DETAY KARTINDAKİ İYİLEŞTİRMELER KORUNDU (MODEL ORTADA, BORÇ SAĞDA)
    const debtSchedule = data.schedules.find(s => s.vehicle_id === v.id && s.type === 'borc' && s.status !== 'tamamlandi' && s.status !== 'iptal');
    let debtHtml = '';
    if(debtSchedule) {
        debtHtml = `<span class="debt-text-animated">KALAN: ${fmt(debtSchedule.remaining)}</span>`;
    }
    const oldWarning = document.getElementById('vehicle-debt-warning');
    if(oldWarning) oldWarning.remove();
    const modelEl = document.getElementById('vehicle-detail-brand-model');
    const modelName = v.name ? v.name.toUpperCase() : 'BİLİNMİYOR';
    modelEl.innerHTML = `<span>${modelName}</span>${debtHtml}`;
    // -------------------------------------------

    const yearInput = document.getElementById('vehicle-detail-year-input');
    if (yearInput) yearInput.value = v.model_year || '';
    const kmInput = document.getElementById('vehicle-detail-km-input');
    if (kmInput) kmInput.value = v.km ? v.km.toLocaleString('tr-TR') : '';

    if (v.tramer_record === 'Yok' && (!v.tramer_records || v.tramer_records.length === 0)) v.has_tramer = false;
    else if (v.tramer_record === 'Var' || (v.tramer_records && v.tramer_records.length > 0)) v.has_tramer = true;
    else v.has_tramer = null;
    setupTramerView(v);

    const paintedPartsInputEl = document.getElementById('vehicle-detail-painted-parts-input');
    if (paintedPartsInputEl) paintedPartsInputEl.value = (v.painted_parts && Array.isArray(v.painted_parts)) ? v.painted_parts.join('\n') : '';

    const insuranceEl = document.getElementById('vehicle-detail-insurance');
    const insuranceInputEl = document.getElementById('vehicle-detail-insurance-input');
    if (insuranceEl && insuranceInputEl) {
        const val = v.insurance_expiry;
        let displayVal = val ? fdate(val) : '-';
        const today = new Date(); today.setHours(0,0,0,0);
        if (val) {
            const dateObj = new Date(val);
            if (dateObj < today) {
                displayVal += ' <span style="color:var(--danger-red); font-weight:800; margin-left:4px;">!</span>';
                insuranceEl.style.color = 'var(--danger-red)';
                insuranceEl.style.fontWeight = '700';
            } else {
                insuranceEl.style.color = ''; 
                insuranceEl.style.fontWeight = '';
            }
        } else {
             insuranceEl.style.color = '';
             insuranceEl.style.fontWeight = '';
        }
        insuranceEl.innerHTML = displayVal; 
        insuranceInputEl.value = val || '';
        insuranceInputEl.onchange = () => { 
            insuranceEl.textContent = insuranceInputEl.value ? fdate(insuranceInputEl.value) : '-';
            insuranceEl.style.color = ''; 
            insuranceEl.style.fontWeight = '';
        };
    }

    const inspectionEl = document.getElementById('vehicle-detail-inspection');
    const inspectionInputEl = document.getElementById('vehicle-detail-inspection-input');
    if (inspectionEl && inspectionInputEl) {
        const val = v.inspection_expiry;
        let displayVal = val ? fdate(val) : '-';
        const today = new Date(); today.setHours(0,0,0,0);
        if (val) {
            const dateObj = new Date(val);
            if (dateObj < today) {
                displayVal += ' <span style="color:var(--danger-red); font-weight:800; margin-left:4px;">!</span>';
                inspectionEl.style.color = 'var(--danger-red)';
                inspectionEl.style.fontWeight = '700';
            } else {
                inspectionEl.style.color = '';
                inspectionEl.style.fontWeight = '';
            }
        } else {
             inspectionEl.style.color = '';
             inspectionEl.style.fontWeight = '';
        }
        inspectionEl.innerHTML = displayVal;
        inspectionInputEl.value = val || '';
        inspectionInputEl.onchange = () => { 
            inspectionEl.textContent = inspectionInputEl.value ? fdate(inspectionInputEl.value) : '-'; 
            inspectionEl.style.color = '';
            inspectionEl.style.fontWeight = '';
        };
    }

    const inGarageSelect = document.getElementById('galeride-mi');
    const locationInput = document.getElementById('galeride-konum');
    if (inGarageSelect) {
        const isInGarage = v.in_garage !== false;
        const selectValue = isInGarage ? 'evet' : 'hayir';
        inGarageSelect.value = selectValue;
        updateGalerideMi(selectValue);
        if (locationInput) {
            locationInput.value = v.location || '';
            updateGalerideKonum(); 
        }
    }

    // === YAN YANA SATICI/ALICI KARTI (Korundu) ===
    const infoSection = document.querySelector('.vehicle-detail-info-section');
    const oldContainers = infoSection.querySelectorAll('.dynamic-person-container');
    const oldInfos = infoSection.querySelectorAll('.dynamic-person-card'); 
    oldContainers.forEach(el => el.remove());
    oldInfos.forEach(el => el.remove());

    let sellerName = 'Bilinmiyor';
    const debtSch = data.schedules.find(s => s.vehicle_id === v.id && s.type === 'borc');
    if(debtSch) {
        sellerName = data.persons.find(p => p.id === debtSch.person_id)?.name || 'Bilinmiyor';
    } else {
        const purchaseTx = data.transactions.find(t => t.vehicle_id === v.id && t.category === 'tasit-alimi');
        if(purchaseTx && purchaseTx.person_id) {
             sellerName = data.persons.find(p => p.id === purchaseTx.person_id)?.name || 'Bilinmiyor';
        }
    }
    
    let buyerName = null;
    if(['satildi', 'iade-edildi'].includes(v.status)) {
        buyerName = 'Bilinmiyor';
        const saleTx = data.transactions.find(t => t.vehicle_id === v.id && t.category === 'tasit-satisi');
        if(saleTx && saleTx.person_id) { 
             buyerName = data.persons.find(p => p.id === saleTx.person_id)?.name || 'Bilinmiyor';
        }
        if(buyerName === 'Bilinmiyor') {
             const creditSch = data.schedules.find(s => s.vehicle_id === v.id && s.type === 'alacak');
             if(creditSch) {
                 buyerName = data.persons.find(p => p.id === creditSch.person_id)?.name || 'Bilinmiyor';
             }
        }
    }

    let combinedHtml = `<div class="dynamic-person-container" style="display: flex; gap: 12px; width: 100%; margin-bottom: 1px; margin-top: 1px;">`;
    combinedHtml += `
        <div class="vehicle-detail-info-item dynamic-person-card" style="flex: 1; background: transparent; border: none; padding: 0; display: flex; align-items: center; gap: 10px; overflow: hidden;">
            <div style="background: rgba(255, 255, 255, 0.08); padding: 8px; border-radius: 50%; flex-shrink: 0; display: flex; align-items: center; justify-content: center;">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ccc" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
            </div>
            <div style="display:flex; flex-direction:column; min-width: 0;">
                <span style="font-size:10px; color:var(--muted); text-transform:uppercase; font-weight:600; letter-spacing: 0.5px; white-space: nowrap;">SATICI</span>
                <span style="font-size:15px; font-weight:700; color:#fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${sellerName}</span>
            </div>
        </div>`;
    if (buyerName) {
        combinedHtml += `
        <div class="vehicle-detail-info-item dynamic-person-card" style="flex: 1; background: transparent; border: none; padding: 0; display: flex; align-items: center; gap: 10px; overflow: hidden;">
            <div style="background: rgba(76, 250, 117, 0.15); padding: 8px; border-radius: 50%; flex-shrink: 0; display: flex; align-items: center; justify-content: center;">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
            </div>
            <div style="display:flex; flex-direction:column; min-width: 0;">
                <span style="font-size:10px; color:var(--green); text-transform:uppercase; font-weight:600; letter-spacing: 0.5px; white-space: nowrap;">ALICI</span>
                <span style="font-size:15px; font-weight:700; color:#fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${buyerName}</span>
            </div>
        </div>`;
    }
    combinedHtml += `</div>`;
    infoSection.insertAdjacentHTML('afterbegin', combinedHtml);
    // -------------------------------------------

    const notesTextarea = document.getElementById('vehicle-detail-notes');
    if (notesTextarea) {
        const autoNotes = getPrefilledNotes(v);
        let savedUserNotes = v.notes || '';
        const separator = '\n----------------------------------\n';
        if (savedUserNotes.includes(separator)) {
             savedUserNotes = savedUserNotes.split(separator).slice(1).join(separator).trim();
        } else if (autoNotes && savedUserNotes.startsWith(autoNotes.trim())) {
             savedUserNotes = savedUserNotes.substring(autoNotes.length).trim();
        }
        notesTextarea.value = autoNotes ? (savedUserNotes ? autoNotes + separator + savedUserNotes : autoNotes) : savedUserNotes;
    }
    
    updateVehicleCostInfo(vehicleId);

    const costSection = document.querySelector('.vehicle-detail-cost-section');
    let returnActionEl = document.getElementById('consigned-return-action');
    
    if (!returnActionEl && costSection) {
        returnActionEl = document.createElement('div');
        returnActionEl.id = 'consigned-return-action';
        returnActionEl.style.cssText = 'text-align: right; margin-top: 8px; color: var(--danger-red); font-size: 14px; font-weight: 500; cursor: pointer; opacity: 0.8; transition: all 0.2s ease;';
        returnActionEl.textContent = 'Taşıtı İade Et';
        returnActionEl.onmouseover = () => { returnActionEl.style.opacity = '1'; returnActionEl.style.textShadow = '0 0 8px rgba(255, 42, 42, 0.5)'; };
        returnActionEl.onmouseout = () => { returnActionEl.style.opacity = '0.8'; returnActionEl.style.textShadow = 'none'; };
        costSection.appendChild(returnActionEl);
    }

    if (returnActionEl) {
        if (v.type === 'consigned' && v.status === 'stokta') {
            returnActionEl.style.display = 'block';
            returnActionEl.onclick = (e) => {
                e.stopPropagation();
                if (typeof returnKonsinyeVehicle === 'function') {
                     returnKonsinyeVehicle(v.id, () => { closeVehicleDetailView(); });
                }
            };
        } else {
            returnActionEl.style.display = 'none';
        }
    }

    viewEl.style.display = 'block';
    const detailEl = document.getElementById('tasitlar-detail');
    if (detailEl) detailEl.style.display = 'none';

    setTimeout(() => {
        autoResizeTextarea(paintedPartsInputEl);
        autoResizeTextarea(locationInput);
        autoResizeTextarea(notesTextarea);
    }, 0);
}

function autoResizeTextarea(el) {
    if (!el) return;
    if (document.getElementById('vehicle-detail-view').classList.contains('view-mode')) {
        el.style.setProperty('height', 'auto', 'important');
        el.style.setProperty('height', el.scrollHeight + 'px', 'important');
    } else {
        el.style.removeProperty('height');
    }
}

function getPrefilledNotes(vehicle) {
    let notes = [];
    const personMap = new Map(data.persons.map(p => [p.id, p.name]));

    if (vehicle.ownership && Array.isArray(vehicle.ownership) && vehicle.ownership.length > 0) {
        let partnershipNotes = [`Taşıt Bedeli: ${fmt(vehicle.purchase_price)}`];
        vehicle.ownership.forEach(o => {
            const amount = fmt(o.amount);
            const percentage = o.percentage.toFixed(2);
            partnershipNotes.push(o.type === 'company' ? `Karmotors: ${amount} (%${percentage})` : `${personMap.get(o.person_id) || 'Bilinmeyen Ortak'}: ${amount} (%${percentage})`);
        });
        notes.push(partnershipNotes.join('\n'));
    }

    const debtSchedule = data.schedules.find(s => s.vehicle_id === vehicle.id && s.type === 'borc' && s.status !== 'iptal');
    if (debtSchedule) {
        let scheduleNotes = [];
        if (debtSchedule.installments.length === 1) {
            scheduleNotes.push(`Vadeli Alış (Tek Taksit):`, `${fdate(debtSchedule.installments[0].due_date)} tarihinde ${fmt(debtSchedule.installments[0].amount)} ödeme.`);
        } else {
            const paidCount = debtSchedule.installments.filter(i => i.status === 'tamamlandi').length;
            scheduleNotes.push(`Vadeli Alış (${debtSchedule.installments.length} Taksit):`, `Alış Tutarı: ${fmt(debtSchedule.total_amount)}`, `Ödenen: ${fmt(debtSchedule.paid_amount)} (${paidCount}/${debtSchedule.installments.length})`, `Kalan: ${fmt(debtSchedule.remaining)}`);
        }
        notes.push(scheduleNotes.join('\n'));
    }
    return notes.join('\n\n');
}

function setupTramerView(v) {
    const passiveContent = document.getElementById('tramer-passive-content');
    const dynamicContent = document.getElementById('tramer-dynamic-content');
    const editContainer = document.getElementById('tramer-edit-container');
    if (!editContainer) return;
    
    const noBtn = editContainer.querySelector('.btn-no');
    const yesBtn = editContainer.querySelector('.btn-yes');
    
    if (noBtn) noBtn.classList.remove('active');
    if (yesBtn) yesBtn.classList.remove('active');

    if (v.tramer_record === 'Yok' && (!v.tramer_records || v.tramer_records.length === 0)) v.has_tramer = false;
    else if (v.tramer_record === 'Var' || (v.tramer_records && v.tramer_records.length > 0)) v.has_tramer = true;
    else v.has_tramer = null;

    if (v.has_tramer === true) {
        if (yesBtn) yesBtn.classList.add('active');
        if (dynamicContent) dynamicContent.style.display = 'block';
        renderTramerRecordsList();
        if (passiveContent) passiveContent.textContent = tempTramerRecords.length > 0 ? tempTramerRecords.map(rec => `${fdate(rec.date)} - ${fmt(rec.amount)}`).join('\n') : 'Var (Kayıt Eklenmemiş)';
    } else if (v.has_tramer === false) {
        if (noBtn) noBtn.classList.add('active');
        if (dynamicContent) dynamicContent.style.display = 'none';
        if (passiveContent) passiveContent.textContent = 'Yoktur';
    } else {
        if (dynamicContent) dynamicContent.style.display = 'none';
        if (passiveContent) passiveContent.textContent = 'Bilgi Yok';
    }
}

function toggleDynamicTramer(btn, hasTramer) {
    const v = data.vehicles.find(v => v.id === editingVehicleDetailId);
    if (!v) return;
    v.has_tramer = hasTramer;
    const container = btn.closest('.vehicle-yesno-container');
    if (container) {
        container.querySelectorAll('.vehicle-yesno-btn').forEach(b => b.classList.remove('active'));
    }
    btn.classList.add('active');
    
    const dynamicContent = document.getElementById('tramer-dynamic-content');
    if (hasTramer) {
        if (dynamicContent) dynamicContent.style.display = 'block';
        if (tempTramerRecords.length === 0) addTramerRecordRow(true);
        renderTramerRecordsList();
    } else {
        if (dynamicContent) dynamicContent.style.display = 'none';
        tempTramerRecords = [];
        renderTramerRecordsList();
    }
}

function renderTramerRecordsList() {
    const listDiv = document.getElementById('tramer-records-list');
    if (!listDiv) return;
    listDiv.innerHTML = '';
    if (tempTramerRecords.length === 0) return;
    
    tempTramerRecords.forEach((record, index) => {
        const row = document.createElement('div');
        row.className = 'vehicle-tramer-item';
        const formattedAmount = record.amount ? record.amount.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : '';
        row.innerHTML = `<input type="date" value="${record.date || ''}" onchange="updateTramerRecord(${index}, 'date', this.value)">
                         <input type="text" inputmode="decimal" placeholder="Tutar (TL)" value="${formattedAmount}" oninput="formatNumberInput(event); updateTramerRecord(${index}, 'amount', this.value)">
                         <button class="vehicle-part-remove" onclick="removeTramerRecordRow(${index})">x</button>`;
        listDiv.appendChild(row);
    });
}

function addTramerRecordRow(suppressRender = false) {
    tempTramerRecords.push({ date: '', amount: 0 });
    if (!suppressRender) renderTramerRecordsList();
}

function updateTramerRecord(index, field, value) {
    if (!tempTramerRecords[index]) return;
    tempTramerRecords[index][field] = field === 'amount' ? parseN(value) : value;
}

function removeTramerRecordRow(index) {
    tempTramerRecords.splice(index, 1);
    renderTramerRecordsList();
}

function closeVehicleDetailView() {
    const listEl = document.getElementById('vehicle-detail-expenses-list');
    const arrowEl = document.getElementById('vehicle-detail-expenses-arrow');
    if (listEl) listEl.style.display = 'none';
    if (arrowEl) arrowEl.classList.remove('rotated');
    
    toggleVehicleEditMode(false);
    const viewEl = document.getElementById('vehicle-detail-view');
    if (viewEl) viewEl.style.display = 'none';
    
    const detailEl = document.getElementById('tasitlar-detail');
    if (detailEl) detailEl.style.display = 'block';

    if (typeof showTasitlarDetail === 'function') {
        showTasitlarDetail(currentTasitlarDetail || 'taşıtlarımız', isArchiveViewActive || false);
    }
    editingVehicleDetailId = null;
    vehicleDetailOriginalData = {};
    tempTramerRecords = [];
}

function toggleVehicleEditMode(isEditMode) {
    const viewEl = document.getElementById('vehicle-detail-view');
    if (viewEl) {
        isEditMode ? viewEl.classList.remove('view-mode') : viewEl.classList.add('view-mode');
        
        const inGarageSelectEl = document.getElementById('galeride-mi');
        const inGarageTextEl = document.getElementById('galeride-mi-text');
        
        if (inGarageSelectEl && inGarageTextEl) {
            inGarageSelectEl.style.display = isEditMode ? 'block' : 'none';
            inGarageTextEl.style.display = isEditMode ? 'none' : 'block';
        }
        
        const locationInput = document.getElementById('galeride-konum');
        const locationTextEl = document.getElementById('galeride-konum-text');
        const konumWrap = document.getElementById("galeride-mi-konum-wrap");
        
        if (locationInput && locationTextEl && konumWrap) {
            locationInput.style.display = isEditMode ? 'block' : 'none';
            locationTextEl.style.display = isEditMode ? 'none' : 'block';
            
            if (isEditMode && inGarageSelectEl?.value === 'hayir') {
                konumWrap.style.display = 'block';
            } else if (!isEditMode && inGarageSelectEl?.value === 'hayir') {
                 konumWrap.style.display = locationTextEl.textContent.trim() ? 'block' : 'none';
            } else {
                 konumWrap.style.display = 'none';
            }
        }
        
        if (!isEditMode) {
             setTimeout(() => {
                autoResizeTextarea(document.getElementById('vehicle-detail-painted-parts-input'));
                autoResizeTextarea(document.getElementById('galeride-konum'));
                autoResizeTextarea(document.getElementById('vehicle-detail-notes'));
            }, 0);
        }
    }
}

async function updateVehicleDetailAdvanced() {
    const v = data.vehicles.find(v => v.id === editingVehicleDetailId);
    if (!v) { toast("Araç bulunamadı.", "err"); return; }

    const yearInput = document.getElementById('vehicle-detail-year-input');
    v.model_year = (yearInput && yearInput.value && parseInt(yearInput.value) >= 1900) ? parseInt(yearInput.value) : null;

    const kmInput = document.getElementById('vehicle-detail-km-input');
    v.km = (kmInput && kmInput.value) ? parseN(kmInput.value) : null;

    v.tramer_records = tempTramerRecords.filter(rec => rec.date || rec.amount > 0);
    v.has_tramer = v.tramer_records.length > 0 ? true : (v.has_tramer === false ? false : null);

    const paintedPartsInput = document.getElementById('vehicle-detail-painted-parts-input');
    v.painted_parts = paintedPartsInput ? paintedPartsInput.value.split('\n').map(p => p.trim()).filter(p => p.length > 0) : [];

    const insuranceInput = document.getElementById('vehicle-detail-insurance-input');
    v.insurance_expiry = (insuranceInput && insuranceInput.value) ? insuranceInput.value : null;

    const inspectionInput = document.getElementById('vehicle-detail-inspection-input');
    v.inspection_expiry = (inspectionInput && inspectionInput.value) ? inspectionInput.value : null;

    const inGarageSelect = document.getElementById('galeride-mi');
    v.in_garage = inGarageSelect?.value === 'evet';

    const locationInput = document.getElementById('galeride-konum');
    v.location = (!v.in_garage && locationInput) ? locationInput.value.trim() : '';

    const notesTextarea = document.getElementById('vehicle-detail-notes');
    if (notesTextarea) {
        const autoNotes = getPrefilledNotes(v);
        let userNotes = notesTextarea.value || '';
        const separator = '\n----------------------------------\n';

        if (autoNotes && userNotes.startsWith(autoNotes)) {
             if (userNotes.includes(separator)) {
                 userNotes = userNotes.split(separator).slice(1).join(separator).trim();
             } else {
                 userNotes = userNotes.substring(autoNotes.length).trim();
             }
        }
        v.notes = userNotes; 
        notesTextarea.value = autoNotes ? (userNotes ? autoNotes + separator + userNotes : autoNotes) : userNotes;
    }
    
    await save();
    checkAllNotifications();
    toast("Araç detayları başarıyla güncellendi.", "ok");
    updateVehicleCostInfo(editingVehicleDetailId); 
    toggleVehicleEditMode(false);
}


function updateVehicleCostInfo(vehicleId) {
    const v = data.vehicles.find(v => v.id === vehicleId);
    if (!v) return;
    
    const isConsigned = v.type === 'consigned';
    const purchasePrice = v.purchase_price || 0; 
    const purchasePriceEl = document.getElementById('vehicle-detail-purchase-price');
    
    if (purchasePriceEl) {
        purchasePriceEl.textContent = fmt(purchasePrice);
        purchasePriceEl.closest('.vehicle-detail-cost-item').style.display = isConsigned ? 'none' : 'flex';
    }
    
    const totalExpenses = getVehicleExpenses(vehicleId);
    const expensesTotalEl = document.getElementById('vehicle-detail-expenses-total');
    if (expensesTotalEl) expensesTotalEl.textContent = fmt(totalExpenses);
    
    const totalCost = isConsigned ? totalExpenses : (purchasePrice + totalExpenses);
    const totalCostEl = document.getElementById('vehicle-detail-total-cost');
    if (totalCostEl) totalCostEl.textContent = fmt(totalCost);
    
    // === SATIŞ VE KÂR BİLGİSİ EKLEME (YENİ - v63) ===
    const costSection = document.querySelector('.vehicle-detail-cost-section');
    
    // Eski eklenen satırları temizle
    const oldSalesRows = costSection.querySelectorAll('.dynamic-sales-info');
    oldSalesRows.forEach(row => row.remove());

    if (['satildi', 'iade-edildi'].includes(v.status)) {
        const salePrice = v.sale_price || 0;
        let netProfit = salePrice - totalCost;
        let profitColor = netProfit >= 0 ? 'var(--green)' : 'var(--danger-red)';
        let profitLabel = netProfit >= 0 ? 'Net Kâr' : 'Net Zarar';

        const salesHtml = `
            <div class="vehicle-detail-cost-item dynamic-sales-info" style="padding-top: 8px; border-top: 1px solid var(--br); margin-top: 4px;">
                <div class="vehicle-detail-cost-label">Satış Fiyatı</div>
                <div class="vehicle-detail-cost-value">${fmt(salePrice)}</div>
            </div>
            <div class="vehicle-detail-cost-item dynamic-sales-info" style="margin-top: 2px;">
                <div class="vehicle-detail-cost-label" style="color: ${profitColor} !important;">${profitLabel}</div>
                <div class="vehicle-detail-cost-value" style="color: ${profitColor} !important; font-weight: bold;">${fmt(netProfit)}</div>
            </div>
        `;
        costSection.insertAdjacentHTML('beforeend', salesHtml);
    }
    // ================================================
    
    prepareExpensesList(vehicleId);
}

function prepareExpensesList(vehicleId) {
    const expenses = data.transactions
        .filter(t => t && t.vehicle_id === vehicleId && t.status !== 'iptal' && getCashFlowType(t.category) === 'out' && t.category !== 'tasit-alimi')
        .map(t => ({ date: t.date, description: t.note || displayCategory(t.category), amount: Number(t.amount || 0) }))
        .sort((a, b) => new Date(a.date) - new Date(b.date));
    
    const tbodyEl = document.getElementById('vehicle-detail-expenses-tbody');
    const tableTotal = document.getElementById('vehicle-detail-expenses-table-total');
    const emptyEl = document.getElementById('vehicle-detail-expenses-empty');
    const tableEl = tbodyEl?.closest('table');
    
    if (!tbodyEl || !tableTotal || !emptyEl || !tableEl) return;
    
    tbodyEl.innerHTML = '';
    if (expenses.length === 0) {
        tableEl.style.display = 'none';
        emptyEl.style.display = 'block';
        tableTotal.textContent = fmt(0);
        return;
    }
    
    tableEl.style.display = 'table';
    emptyEl.style.display = 'none';
    let total = 0;
    expenses.forEach(exp => {
        total += exp.amount;
        const tr = document.createElement('tr');
        tr.innerHTML = `<td style="padding: 4px 8px 4px 0; color: var(--text-color);">${fdate(exp.date)}</td>
                        <td style="padding: 4px 8px 4px 0; color: var(--text-color);">${exp.description}</td>
                        <td style="padding: 4px 0 4px 8px; text-align: right; font-weight: 600; color: var(--text-color);">${fmt(exp.amount)}</td>`;
        tbodyEl.appendChild(tr);
    });
    tableTotal.textContent = fmt(total);
}

function toggleExpensesList() {
    const listEl = document.getElementById('vehicle-detail-expenses-list');
    const arrowEl = document.getElementById('vehicle-detail-expenses-arrow');
    if (!listEl) return;
    const isExpanded = listEl.style.display === 'block';
    listEl.style.display = isExpanded ? 'none' : 'block';
    if (arrowEl) arrowEl.classList.toggle('rotated', !isExpanded);
}