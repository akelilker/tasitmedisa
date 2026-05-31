/* ====================================================================
   DOSYA: script-ui-vehicle.js
   Açıklama: Taşıt detay, kart, galeri, tramer ve masraf yönetimi
   (Hata Düzeltmeleri Uygulandı)
   ==================================================================== */

function renderOwnedVehiclesForFinance() {
    const detailEl = document.getElementById('fin-detail');
    const vehiclesInStock = data.vehicles.filter(v => v.status === 'stokta' && v.type === 'owned');

    if (vehiclesInStock.length === 0) {
        detailEl.innerHTML = '<p style="text-align:center; color: var(--muted);">Stokta galeriye ait taşıt bulunmuyor.</p>';
        return;
    }

    let html = '<div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(250px,1fr)); gap:12px;">';
    vehiclesInStock.forEach(v => {
        const totalExpenses = getVehicleExpenses(v.id);
        const currentCost = v.purchase_price + totalExpenses;

        html += `<div style="background:rgba(255,255,255,0.03); border:1px solid var(--br); border-radius:10px; padding:14px;" onclick="openModal('tasitlar'); showVehicleDetailInTasitlar(${v.id});">
            <div style="font-size:18px; font-weight:700; color:var(--theme-color); margin-bottom:6px;">${v.plate}</div>
            <div style="font-size:14px; color:var(--muted); margin-bottom:10px;">${v.name}</div>
            <div style="border-top:1px solid rgba(255,255,255,0.1); padding-top:8px;">
                <div style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:4px;">
                    <span>Alış:</span><span>${fmt(v.purchase_price)}</span>
                </div>
                <div style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:4px;">
                    <span>Masraf:</span><span>${fmt(totalExpenses)}</span>
                </div>
                <div style="display:flex; justify-content:space-between; font-size:13px; font-weight:600; margin-top:6px; padding-top:6px; border-top:1px solid rgba(255,255,255,0.1);">
                    <span>Değer:</span><span>${fmt(currentCost)}</span>
                </div>
            </div>
        </div>`;
    });
    html += '</div>';
    detailEl.innerHTML = html;
}

function toggleArchiveView() {
    isArchiveViewActive = !isArchiveViewActive;
    document.getElementById('tasitlar-search-input').value = '';
    showTasitlarDetail(currentTasitlarDetail, true);
}

function toggleTasitlarSearch() {
    const wrapper = document.getElementById('tasitlar-search-wrapper');
    const input = document.getElementById('tasitlar-search-input');
    const searchBtn = document.getElementById('tasitlar-search-toggle-btn');
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
}

function renderTasitlarData(view, searchText = '') {
    const searchInput = document.getElementById('tasitlar-search-input');
    const archiveBtn = document.getElementById('tasitlar-archive-btn');
    if (archiveBtn) {
        archiveBtn.classList.toggle('active', isArchiveViewActive);
    }

    if (isArchiveViewActive) {
        searchInput.placeholder = "Arşivde plaka, model veya sahip ara...";
    } else {
        searchInput.placeholder = "Stokta plaka, marka veya model ara...";
    }

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
            toggleTasitlarSearch();
        }
    }
    currentTasitlarDetail = view;
    document.querySelectorAll('#modal-tasitlar .detail-tabs .tab').forEach(t => t.classList.toggle('on', t.dataset.view === view));

    const detailEl = document.getElementById('tasitlar-detail');
    detailEl.innerHTML = '';
    
    // --- BURASI DEĞİŞTİ ---
    const vehicleDetailView = document.getElementById('vehicle-detail-view');
    if (vehicleDetailView && !isAction) vehicleDetailView.style.display = 'none'; // Eski listeyi göster
    if (detailEl) detailEl.style.display = 'block'; // Eski listeyi göster
    
    const searchText = document.getElementById('tasitlar-search-input').value;
    renderTasitlarData(view, searchText);
}

function renderOwnedVehiclesGrid(searchText = '') {
    const detailEl = document.getElementById('tasitlar-detail');
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

    let tableHtml;
    if (isArchiveViewActive) {
        tableHtml = '<table><thead><tr><th>Plaka</th><th>Model</th><th>Durum</th><th>Çıkış Tarihi</th></tr></thead><tbody>';
        vehicles.sort((a,b) => new Date(b.sale_date || b.purchase_date) - new Date(a.sale_date || a.purchase_date)).forEach(v => {
            const statusText = v.status === 'satildi' ? 'Satıldı' : 'Alım İptal';
            tableHtml += `<tr style="cursor:pointer; opacity: 0.7;" onclick="showVehicleDetailInTasitlar(${v.id})">
                <td>${v.plate}</td><td>${v.name}</td><td>${statusText}</td><td>${fdate(v.sale_date || v.purchase_date)}</td>
            </tr>`;
        });
    } else {
        tableHtml = '<table><thead><tr><th>Plaka</th><th>Model</th><th>Alış Fiyatı</th><th>İşlem</th></tr></thead><tbody>';
        vehicles.forEach(v => {
            const today = new Date(); today.setHours(0, 0, 0, 0);
            let notificationLevel = null;
            const purchaseDate = new Date(v.purchase_date);
            const daysSincePurchase = Math.round((today - purchaseDate) / (1000 * 3600 * 24));
            if (daysSincePurchase >= 0 && daysSincePurchase <= VEHICLE_NEW_ALERT_DAYS && (!v.insurance_expiry || !v.inspection_expiry)) {
                notificationLevel = 'warning';
            }
            const checks = [ { date: v.insurance_expiry }, { date: v.inspection_expiry } ];
            checks.forEach(check => {
                if (check.date) {
                    const daysDiff = Math.round((new Date(check.date) - today) / (1000 * 3600 * 24));
                    if (daysDiff < 0) notificationLevel = 'danger';
                    else if (daysDiff <= 30 && notificationLevel !== 'danger') notificationLevel = 'warning';
                }
            });
            const rowClass = notificationLevel ? `class="vehicle-row-${notificationLevel}"` : '';
            tableHtml += `<tr ${rowClass} style="cursor:pointer;" onclick="showVehicleDetailInTasitlar(${v.id})">
                <td>${v.plate}</td><td>${v.name}</td><td>${fmt(v.purchase_price)}</td><td><button class="btn small sec" onclick="event.stopPropagation(); showVehicleDetailInTasitlar(${v.id})">Detay</button></td>
            </tr>`;
        });
    }
    tableHtml += '</tbody></table>';
    detailEl.innerHTML = tableHtml;
}

function renderConsignedVehiclesGrid(searchText = '') {
    const detailEl = document.getElementById('tasitlar-detail');
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

    let headerHtml = ``;
    if (!isArchiveViewActive) {
        headerHtml = `<div style="display: flex; justify-content: flex-end; align-items: center; margin-bottom: 10px;"><button class="btn small sec" onclick="openKonsinyeModal()">+ Konsinye Araç Ekle</button></div>`;
    }

    if (consignedVehicles.length === 0) {
        const viewName = isArchiveViewActive ? 'Arşivde' : 'Stokta';
        const reason = searchText ? 'arama kriterlerine uygun' : '';
        detailEl.innerHTML = headerHtml + `<p style="text-align:center; padding: 20px;">${viewName} ${reason} konsinye taşıt bulunmuyor.</p>`;
        return;
    }

    let tableHtml;
    if (isArchiveViewActive) {
        tableHtml = '<table><thead><tr><th>Plaka</th><th>Model</th><th>Sahibi</th><th>Durum</th></tr></thead><tbody>';
        consignedVehicles.forEach(v => {
            const owner = data.persons.find(p => p.id === v.person_id);
            tableHtml += `<tr style="opacity: 0.7;"><td>${v.plate}</td><td>${v.name}</td><td>${owner ? owner.name : 'Bilinmiyor'}</td><td>İade Edildi</td></tr>`;
        });
    } else {
        tableHtml = '<table><thead><tr><th>Plaka</th><th>Model</th><th>Sahibi</th><th>İşlem</th></tr></thead><tbody>';
        consignedVehicles.forEach(v => {
            const owner = data.persons.find(p => p.id === v.person_id);
            tableHtml += `<tr style="cursor:pointer;" onclick="showVehicleDetailInTasitlar(${v.id})">
                <td>${v.plate}</td><td>${v.name}</td><td>${owner ? owner.name : 'Bilinmiyor'}</td><td><button class="btn small sec" onclick="event.stopPropagation(); returnKonsinyeVehicle(${v.id})">İade Et</button></td>
            </tr>`;
        });
    }
    tableHtml += '</tbody></table>';
    detailEl.innerHTML = headerHtml + tableHtml;
}

function showVehicleDetailInTasitlar(vehicleId) {
    const v = data.vehicles.find(v => v.id === vehicleId);
    if (!v) return;

    // Arşivdeki araçlar için eski basit görünümü koru
    if (isArchiveViewActive) {
        let statusText = '';
        switch(v.status) {
            case 'satildi': statusText = 'Satıldı'; break;
            case 'iade-edildi': statusText = 'İade Edildi'; break;
            case 'iptal-edildi': statusText = 'Alım İptal Edildi'; break;
        }
        let profitHtml = '';
        if (v.status === 'satildi' && v.type === 'owned') {
            const totalExpenses = getVehicleExpenses(vehicleId);
            const netProfit = (v.sale_price || 0) - v.purchase_price - totalExpenses;
            profitHtml = `<p><strong>Net Kâr/Zarar:</strong> <span class="${netProfit >= 0 ? 'amount-positive' : 'amount-negative'}">${fmt(netProfit)}</span></p>`;
        }
        let html = `<h3>${v.plate} - ${v.name} (Arşiv)</h3>
                    <p><strong>Durum:</strong> ${statusText}</p>
                    <p><strong>Alış Tarihi:</strong> ${fdate(v.purchase_date)}</p>
                    ${v.sale_date ? `<p><strong>Satış Tarihi:</strong> ${fdate(v.sale_date)}</p>` : ''}
                    ${v.sale_price ? `<p><strong>Satış Fiyatı:</strong> ${fmt(v.sale_price)}</p>` : ''}
                    ${profitHtml}
                    <div class="detail-actions">
                         <button class="btn sec" onclick="showTasitlarDetail(currentTasitlarDetail, true)">Geri Dön</button>
                    </div>`;
        document.getElementById('tasitlar-detail').innerHTML = html;
        return;
    }

    // Hem galeri araçları hem konsinye araçlar için detaylı görünüm
    showVehicleDetailViewAdvanced(vehicleId);
    return;
}

function showVehicleDetailViewAdvanced(vehicleId) {
    const v = data.vehicles.find(v => v.id === vehicleId);
    if (!v) {
        console.error("Araç bulunamadı:", vehicleId);
        return;
    }

    // --- YENİ EKLENDİ (1. Madde) ---
    // Modu "Görüntü Modu" olarak ayarla
    toggleVehicleEditMode(false); 
    // ------------------------------

    editingVehicleDetailId = vehicleId;
    vehicleDetailOriginalData = { ...v }; // Orijinal veriyi komple klonla

    // ★ GÖREV 2: Tramer kayıtlarını geçici diziye al
    // 'tramer_record' (eski 'Var'/'Yok' alanı) artık kullanılmıyor.
    // 'has_tramer' (boolean) ve 'tramer_records' (dizi) kullanılacak.
    // Eski veriden migration:
    if (v.tramer_record === 'Yok' && (!v.tramer_records || v.tramer_records.length === 0)) {
        v.has_tramer = false;
    } else if (v.tramer_record === 'Var' || (v.tramer_records && v.tramer_records.length > 0)) {
        v.has_tramer = true;
    } else {
        v.has_tramer = null; // 'Seçiniz' durumu
    }
    
    // Tramer kayıtları dizi değilse veya yoksa boş dizi ata
    if (!Array.isArray(v.tramer_records)) {
        v.tramer_records = [];
    }
    tempTramerRecords = JSON.parse(JSON.stringify(v.tramer_records)); // Deep copy


    const viewEl = document.getElementById('vehicle-detail-view');
    if (!viewEl) {
        console.error("vehicle-detail-view element bulunamadı");
        return;
    }

    // PLAKA
    const plateEl = document.getElementById('vehicle-detail-plate');
    if (plateEl) plateEl.textContent = (v.plate || '').toUpperCase();

    // MARKA VE MODEL
    const brandModelEl = document.getElementById('vehicle-detail-brand-model');
    if (brandModelEl) {
        const brandModel = v.name ? v.name.toUpperCase() : 'BİLİNMİYOR';
        brandModelEl.textContent = brandModel;
    }

    // Model Yılı - INPUT
    const yearInputEl = document.getElementById('vehicle-detail-year-input');
    if (yearInputEl) yearInputEl.value = v.model_year || '';
    
    // Km - INPUT
    const kmInputEl = document.getElementById('vehicle-detail-km-input');
    if (kmInputEl) kmInputEl.value = v.km || '';

    // ★ GÖREV 2: Tramer Kaydı - YENİ YAPI
    setupTramerView(v);

    // Boyalı Parçalar - TEXTAREA
    const paintedPartsInputEl = document.getElementById('vehicle-detail-painted-parts-input');
    if (paintedPartsInputEl) {
        if (v.painted_parts && Array.isArray(v.painted_parts)) {
            paintedPartsInputEl.value = v.painted_parts.join('\n'); // Her elemanı yeni satıra yaz
        } else {
            paintedPartsInputEl.value = '';
        }
    }

    // Sigorta Bitiş Tarihi
    const insuranceEl = document.getElementById('vehicle-detail-insurance');
    const insuranceInputEl = document.getElementById('vehicle-detail-insurance-input');
    if (insuranceEl && insuranceInputEl) {
        const insuranceDate = v.insurance_expiry || '';
        insuranceEl.textContent = insuranceDate ? fdate(insuranceDate) : '-';
        insuranceInputEl.value = insuranceDate;

        // Input değiştiğinde görünen değeri güncelle
        insuranceInputEl.onchange = () => {
            insuranceEl.textContent = insuranceInputEl.value ? fdate(insuranceInputEl.value) : '-';
        };
    }

    // Muayene Bitiş Tarihi
    const inspectionEl = document.getElementById('vehicle-detail-inspection');
    const inspectionInputEl = document.getElementById('vehicle-detail-inspection-input');
    if (inspectionEl && inspectionInputEl) {
        const inspectionDate = v.inspection_expiry || '';
        inspectionEl.textContent = inspectionDate ? fdate(inspectionDate) : '-';
        inspectionInputEl.value = inspectionDate;

        // Input değiştiğinde görünen değeri güncelle
        inspectionInputEl.onchange = () => {
            inspectionEl.textContent = inspectionInputEl.value ? fdate(inspectionInputEl.value) : '-';
        };
    }

    // Galeride mi? - Buton durumlarını ve Konum alanını ayarla
    const locationSection = document.getElementById('vehicle-detail-location-section');
    const locationTextarea = document.getElementById('vehicle-detail-location');
    const garagePassiveText = document.getElementById('vehicle-detail-garage-passive-text');

    if (locationSection && garagePassiveText) {
        const isInGarage = v.in_garage !== false; // Varsayılan true
        toggleGarageStatus(isInGarage); // Butonları ve konumu ayarla
        
        // ★ GÖREV 6: Pasif mod metnini ayarla
        garagePassiveText.textContent = isInGarage ? 'Evet' : 'Hayır';

        if (!isInGarage && locationTextarea) {
            locationTextarea.value = v.location || ''; // Konumdaysa değeri doldur
        }
    }

    // ★ GÖREV 7: Notlar
    const notesTextarea = document.getElementById('vehicle-detail-notes');
    if (notesTextarea) {
        const autoNotes = getPrefilledNotes(v); // Otomatik notları al
        let savedUserNotes = v.notes || ''; // Kullanıcının elle girdiği notlar
        
        // Eğer savedUserNotes'ta önceki otomatik notlar varsa, temizle (duplikasyonu önle)
        const separator = '\n----------------------------------\n';
        if (autoNotes && savedUserNotes.includes(separator)) {
            const parts = savedUserNotes.split(separator);
            if (parts.length >= 2) {
                savedUserNotes = parts.slice(1).join(separator).trim();
            }
        }
        
        let combinedNotes = savedUserNotes;
        if (autoNotes) {
            // Eğer elle girilmiş not varsa, otomatik notları ayırıcı ile üste ekle
            if (savedUserNotes) {
                 combinedNotes = autoNotes + '\n----------------------------------\n' + savedUserNotes;
            } else {
                 combinedNotes = autoNotes;
            }
        }
        
        notesTextarea.value = combinedNotes.trim();
    }

    // Görünümü göster
    viewEl.style.display = 'block';
    const detailEl = document.getElementById('tasitlar-detail');
    if (detailEl) detailEl.style.display = 'none'; // Eski listeyi gizle
}

// +++ TAŞINDI: script-ui-utilities.js'den buraya taşındı +++
function getPrefilledNotes(vehicle) {
    let notes = [];
    const personMap = new Map(data.persons.map(p => [p.id, p.name]));

    // 1. Ortaklık Bilgisi
    if (vehicle.ownership && Array.isArray(vehicle.ownership) && vehicle.ownership.length > 0) {
        let partnershipNotes = [];
        partnershipNotes.push(`Taşıt Bedeli: ${fmt(vehicle.purchase_price)}`);
        
        vehicle.ownership.forEach(o => {
            const amount = fmt(o.amount);
            const percentage = o.percentage.toFixed(2); // Virgülden sonra 2 basamak
            
            if (o.type === 'company') {
                partnershipNotes.push(`Karmotors: ${amount} (%${percentage})`);
            } else {
                const personName = personMap.get(o.person_id) || 'Bilinmeyen Ortak';
                partnershipNotes.push(`${personName}: ${amount} (%${percentage})`);
            }
        });
        notes.push(partnershipNotes.join('\n'));
    }

    // 2. Vadeli Alış Bilgisi
    // Bu araca bağlı "borç" planını bul
    const debtSchedule = data.schedules.find(s => 
        s.vehicle_id === vehicle.id && 
        s.type === 'borc' && 
        s.status !== 'iptal'
    );
    
    if (debtSchedule) {
        let scheduleNotes = [];
        
        if (debtSchedule.installments.length === 1) {
            const inst = debtSchedule.installments[0];
            scheduleNotes.push(`Vadeli Alış (Tek Taksit):`);
            scheduleNotes.push(`${fdate(inst.due_date)} tarihinde ${fmt(inst.amount)} ödeme.`);
        } else {
            const total = fmt(debtSchedule.total_amount);
            const paid = fmt(debtSchedule.paid_amount);
            const remaining = fmt(debtSchedule.remaining);
            const paidCount = debtSchedule.installments.filter(i => i.status === 'tamamlandi').length;
            const totalCount = debtSchedule.installments.length;
            
            scheduleNotes.push(`Vadeli Alış (${totalCount} Taksit):`);
            scheduleNotes.push(`Alış Tutarı: ${total}`);
            scheduleNotes.push(`Ödenen: ${paid} (${paidCount}/${totalCount})`);
            scheduleNotes.push(`Kalan: ${remaining}`);
        }
        notes.push(scheduleNotes.join('\n'));
    }

    return notes.join('\n\n'); // Farklı not grupları arasına boşluk koy
}
// +++ TAŞIMA SONU +++


function setupTramerView(v) {
    const passiveContent = document.getElementById('tramer-passive-content');
    const dynamicContent = document.getElementById('tramer-dynamic-content');
    const editContainer = document.getElementById('tramer-edit-container');

    // Butonları ayarla
    const noBtn = editContainer.querySelector('.btn-no');
    const yesBtn = editContainer.querySelector('.btn-yes');
    
    noBtn.classList.remove('active');
    yesBtn.classList.remove('active');

    if (v.has_tramer === true) {
        yesBtn.classList.add('active');
        dynamicContent.style.display = 'block';
        renderTramerRecordsList(); // Kayıt listesini render et
        
        // Pasif mod metnini ayarla
        if (tempTramerRecords.length > 0) {
            passiveContent.textContent = tempTramerRecords.map(rec => 
                `${fdate(rec.date)} - ${fmt(rec.amount)}`
            ).join('\n');
        } else {
            passiveContent.textContent = 'Var (Kayıt Eklenmemiş)';
        }

    } else if (v.has_tramer === false) {
        noBtn.classList.add('active');
        dynamicContent.style.display = 'none';
        passiveContent.textContent = 'Yoktur';
    } else {
        // null durumu (Seçilmemiş)
        dynamicContent.style.display = 'none';
        passiveContent.textContent = '-- Seçiniz --';
    }
}

function toggleDynamicTramer(btn, hasTramer) {
    const v = data.vehicles.find(v => v.id === editingVehicleDetailId);
    if (!v) return;

    v.has_tramer = hasTramer; // Ana veriyi (geçici olarak) güncelle
    
    // Butonların aktifliğini ayarla
    const container = btn.closest('.vehicle-yesno-container');
    container.querySelectorAll('.vehicle-yesno-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    const dynamicContent = document.getElementById('tramer-dynamic-content');
    
    if (hasTramer) {
        // Evet
        dynamicContent.style.display = 'block';
        if (tempTramerRecords.length === 0) {
            // Hiç kayıt yoksa, varsayılan 1 boş satır ekle
            addTramerRecordRow(true); // 'true' = render etme
        }
        renderTramerRecordsList(); // Mevcut kayıtları listele
    } else {
        // Hayır
        dynamicContent.style.display = 'none';
        tempTramerRecords = []; // Tramer kayıtlarını temizle
        renderTramerRecordsList(); // Listeyi (boşaltmak için) render et
    }
}

function renderTramerRecordsList() {
    const listDiv = document.getElementById('tramer-records-list');
    listDiv.innerHTML = ''; // Listeyi temizle

    if (tempTramerRecords.length === 0) {
        // Listede kayıt yoksa (Hayır dendiğinde veya Evet denip kayıt eklenmediyse)
        // Hiçbir şey gösterme. Ekleme butonu zaten dışarıda.
        return;
    }
    
    tempTramerRecords.forEach((record, index) => {
        const row = document.createElement('div');
        row.className = 'vehicle-tramer-item';
        
        // Formatlanmış tutar
        const formattedAmount = record.amount ? record.amount.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : '';

        row.innerHTML = `
            <input type="date" 
                   value="${record.date || ''}" 
                   onchange="updateTramerRecord(${index}, 'date', this.value)">
                   
            <input type="text" 
                   inputmode="decimal" 
                   placeholder="Tutar (TL)" 
                   value="${formattedAmount}"
                   oninput="formatNumberInput(event); updateTramerRecord(${index}, 'amount', this.value)">
                   
            <button class="vehicle-part-remove" onclick="removeTramerRecordRow(${index})">×</button>
        `;
        listDiv.appendChild(row);
    });
}

function addTramerRecordRow(suppressRender = false) {
    tempTramerRecords.push({ date: '', amount: 0 });
    if (!suppressRender) {
        renderTramerRecordsList();
    }
}

function updateTramerRecord(index, field, value) {
    if (!tempTramerRecords[index]) return;
    
    if (field === 'amount') {
        tempTramerRecords[index][field] = parseN(value);
    } else {
        tempTramerRecords[index][field] = value;
    }
}

function removeTramerRecordRow(index) {
    tempTramerRecords.splice(index, 1);
    renderTramerRecordsList();
}

function toggleGarageStatus(inGarage) {
    const garageYesBtn = document.getElementById('vehicle-detail-garage-yes');
    const garageNoBtn = document.getElementById('vehicle-detail-garage-no');
    const locationSection = document.getElementById('vehicle-detail-location-section');
    const garagePassiveText = document.getElementById('vehicle-detail-garage-passive-text');

    if (garageYesBtn && garageNoBtn && locationSection && garagePassiveText) {
        garagePassiveText.textContent = inGarage ? 'Evet' : 'Hayır';

        if (inGarage) {
            garageYesBtn.dataset.selected = 'true';
            garageNoBtn.dataset.selected = 'false';
            locationSection.style.display = 'none';
        } else {
            garageYesBtn.dataset.selected = 'false';
            garageNoBtn.dataset.selected = 'true';
            locationSection.style.display = 'block';
        }
    }
}

function closeVehicleDetailView() {
    // Kapatırken modu sıfırla
    toggleVehicleEditMode(false);
    
    const viewEl = document.getElementById('vehicle-detail-view');
    const detailEl = document.getElementById('tasitlar-detail');

    if (viewEl) viewEl.style.display = 'none';
    if (detailEl) detailEl.style.display = 'block'; // Eski listeyi göster

    // Taşıtlar listesini yenile (eğer fonksiyon varsa)
    if (typeof showTasitlarDetail === 'function') {
        // currentTasitlarDetail ve isArchiveViewActive global değişkenlerini kullanarak listeyi doğru göster
        showTasitlarDetail(currentTasitlarDetail || 'taşıtlarımız', isArchiveViewActive || false);
    }

    editingVehicleDetailId = null;
    vehicleDetailOriginalData = {};
    tempTramerRecords = []; // ★ GÖREV 2: Tramer geçici dizisini temizle
}

function toggleVehicleEditMode(isEditMode) {
    const viewEl = document.getElementById('vehicle-detail-view');
    if (viewEl) {
        if (isEditMode) {
            // Düzenleme Modu: Sınıfı kaldır
            viewEl.classList.remove('view-mode');
        } else {
            // Görüntü Modu: Sınıfı ekle
            viewEl.classList.add('view-mode');
        }
    }
}

function renderVehicleDetailModal(vehicleId) {
    const vehicle = data.vehicles.find(v => v.id === vehicleId);
    if (!vehicle) return '<p>Araç bulunamadı</p>';
    
    const expenses = getVehicleExpenses(vehicleId);
    const profit = calculateProfit(vehicle);
    
    let html = `<div class="vehicle-detail-modal">`;
    
    // ===== TEMELSİ BİLGİLER =====
    html += `
    <div class="vehicle-section">
        <h4 class="vehicle-section-title">Temel Bilgiler</h4>
        <div class="vehicle-section-content">
            <div class="vehicle-detail-info">
                <label>Plaka</label>
                <div class="value">${vehicle.plate}</div>
                
                <label>Model</label>
                <div class="value">${vehicle.name || '-'}</div>
                
                <label>Model Yılı</label>
                <div class="value">${vehicle.model_year || '-'}</div>
                
                <label>Kilometre</label>
                <div class="value">${vehicle.km || '-'}</div>
                
                <label>Renk</label>
                <div class="value">${vehicle.color || '-'}</div>
            </div>
        </div>
    </div>
    `;
    
    // ===== TRAMER KAYDI =====
    html += `
    <div class="vehicle-section">
        <h4 class="vehicle-section-title">Tramer Kaydı</h4>
        <div class="vehicle-section-content">
            <div class="button-toggle">
                <button class="tramer-btn" data-value="yes" onclick="toggleTramerInfo(this, ${vehicleId})">Var</button>
                <button class="tramer-btn" data-value="no" onclick="toggleTramerInfo(this, ${vehicleId})">Yok</button>
            </div>
            <div id="tramer-info-${vehicleId}" style="display:none; margin-top: 8px;">
                <div class="vehicle-detail-info">
                    ${vehicle.tramerRecords && vehicle.tramerRecords.length > 0 ? 
                        vehicle.tramerRecords.map((rec, idx) => `
                        <div style="margin-bottom: 8px; padding: 8px; background: rgba(255,255,255,0.02); border-radius: 4px;">
                            <label>Kayıt ${idx + 1}</label>
                            <div class="value">Tarih: ${rec.date || '-'}</div>
                            <div class="value">Tutar: ${rec.amount || '-'} ₺</div>
                        </div>
                        `).join('') 
                        : '<div class="value">Kayıt yok</div>'
                    }
                </div>
            </div>
        </div>
    </div>
    `;
    
    // ===== GALERİDE Mİ (SADECE EVET/HAYIR) =====
    html += `
    <div class="vehicle-section">
        <h4 class="vehicle-section-title">Galeride Mi?</h4>
        <div class="vehicle-section-content">
            <div class="gallery-toggle">
                <button class="gallery-btn" data-value="yes" onclick="toggleGalleryInfo(this, ${vehicleId})">Evet</button>
                <button class="gallery-btn" data-value="no" onclick="toggleGalleryInfo(this, ${vehicleId})">Hayır</button>
            </div>
            <div id="gallery-info-${vehicleId}" style="display:none; margin-top: 8px;">
                <div class="vehicle-detail-info">
                    ${vehicle.galeri_kullanici ? `
                        <label>Kullanıcı</label>
                        <div class="value">${vehicle.galeri_kullanici}</div>
                        <label>Konum</label>
                        <div class="value">${vehicle.galeri_konum || '-'}</div>
                    ` : '<div class="value">Bilgi yok</div>'}
                </div>
            </div>
        </div>
    </div>
    `;
    
    // ===== ORTAKLIK BİLGİSİ (varsa) =====
    if (vehicle.ownership && vehicle.ownership.length > 0) {
        html += `
        <div class="vehicle-section">
            <h4 class="vehicle-section-title">Ortaklık Bilgisi</h4>
            <div class="vehicle-section-content">
                <div class="vehicle-detail-info">
                    <label>Taşıt Bedeli</label>
                    <div class="value">${vehicle.purchase_price} ₺</div>
                    ${vehicle.ownership.map(o => {
                        if (o.type === 'company') {
                            return `
                            <label>Şirket</label>
                            <div class="value">${o.amount} ₺ (%${o.percentage})</div>
                            `;
                        } else {
                            const person = data.persons.find(p => p.id === o.person_id);
                            return `
                            <label>${person ? person.name : 'Ortak'}</label>
                            <div class="value">${o.amount} ₺ (%${o.percentage})</div>
                            `;
                        }
                    }).join('')}
                </div>
            </div>
        </div>
        `;
    }
    
    // ===== NOTLAR KISMI =====
    html += `
    <div class="vehicle-section">
        <h4 class="vehicle-section-title">Bilgiler</h4>
        <div class="vehicle-section-content">
            <div class="vehicle-detail-info">
                <label>Alım Bedeli</label>
                <div class="value">${vehicle.purchase_price || 0} ₺</div>
                
                <label>Masraflar</label>
                <div class="value" style="cursor: pointer; color: var(--theme-color);" onclick="showVehicleExpensesPopup(${vehicleId})">
                    ${expenses} ₺ (tıkla)
                </div>
                
                <label>Satış Bedeli</label>
                <div class="value">${vehicle.sale_price || '-'} ₺</div>
                
                <label>Kar/Zarar</label>
                <div class="value" style="color: ${profit >= 0 ? 'var(--success)' : 'var(--danger)'};">
                    ${profit} ₺
                </div>
            </div>
        </div>
    </div>
    `;
    
    html += `</div>`;
    return html;
}

function toggleTramerInfo(btn, vehicleId) {
    const infoDiv = document.getElementById('tramer-info-' + vehicleId);
    if (btn.dataset.value === 'yes') {
        infoDiv.style.display = 'block';
    } else {
        infoDiv.style.display = 'none';
    }
}

function toggleGalleryInfo(btn, vehicleId) {
    const infoDiv = document.getElementById('gallery-info-' + vehicleId);
    if (btn.dataset.value === 'yes') {
        infoDiv.style.display = 'block';
    } else {
        infoDiv.style.display = 'none';
    }
}

function showVehicleExpensesPopup(vehicleId) {
    const expenses = data.transactions.filter(t => t.vehicle_id === vehicleId && t.category === 'akaryakit');
    
    let popup = '<table style="width:100%; border-collapse: collapse;">';
    popup += '<tr style="background: rgba(255,255,255,0.05); border-bottom: 1px solid var(--border-color);">';
    popup += '<th style="padding: 8px; text-align: left;">Tarih</th>';
    popup += '<th style="padding: 8px; text-align: left;">Açıklama</th>';
    popup += '<th style="padding: 8px; text-align: right;">Tutar</th>';
    popup += '</tr>';
    
    expenses.forEach(e => {
        popup += '<tr style="border-bottom: 1px solid rgba(255,255,255,0.02);">';
        popup += '<td style="padding: 8px;">' + (e.date || '-') + '</td>';
        popup += '<td style="padding: 8px;">' + (e.note || '-') + '</td>';
        popup += '<td style="padding: 8px; text-align: right;">' + e.amount + ' ₺</td>';
        popup += '</tr>';
    });
    
    popup += '</table>';
    
    // Popup göster (alert yerine modal kullanılabilir)
    console.log('Masraflar:', popup);
}

// --- SİLİNDİ: getVehicleExpenses() ---
// (script-core.js içinde zaten mevcut)

// --- SİLİNDİ: calculateProfit() ---
// (script-core.js içine taşındı)

function toggleLock(btn, vehicleId) {
    const vehicle = data.vehicles.find(v => v.id === vehicleId);
    if (!vehicle) return;
    
    const lockDiv = document.getElementById('lock-info-' + vehicleId);
    if (btn.dataset.value === 'yes') {
        lockDiv.style.display = 'block';
        vehicle.lock_status = 'yes';
    } else {
        lockDiv.style.display = 'none';
        vehicle.lock_status = 'no';
        vehicle.lock_reason = '';
        vehicle.lock_date = '';
    }
    saveLockStatus(vehicleId);
}

function toggleNewVehicle(btn, vehicleId) {
    const vehicle = data.vehicles.find(v => v.id === vehicleId);
    if (!vehicle) return;
    
    const newDiv = document.getElementById('new-vehicle-info-' + vehicleId);
    if (btn.dataset.value === 'yes') {
        newDiv.style.display = 'block';
        vehicle.is_new = true;
    } else {
        newDiv.style.display = 'none';
        vehicle.is_new = false;
        vehicle.new_purchase_price = '';
    }
    saveNewVehicleStatus(vehicleId);
}

function toggleZeroVehicle(btn, vehicleId) {
    const vehicle = data.vehicles.find(v => v.id === vehicleId);
    if (!vehicle) return;
    
    const zeroDiv = document.getElementById('zero-vehicle-info-' + vehicleId);
    if (btn.dataset.value === 'yes') {
        zeroDiv.style.display = 'block';
        vehicle.is_zero = true;
    } else {
        zeroDiv.style.display = 'none';
        vehicle.is_zero = false;
        vehicle.zero_purchase_price = '';
    }
    saveZeroVehicleStatus(vehicleId);
}

function toggleSecondHand(btn, vehicleId) {
    const vehicle = data.vehicles.find(v => v.id === vehicleId);
    if (!vehicle) return;
    
    const secondHandDiv = document.getElementById('second-hand-info-' + vehicleId);
    if (btn.dataset.value === 'yes') {
        secondHandDiv.style.display = 'block';
        vehicle.is_second_hand = true;
    } else {
        secondHandDiv.style.display = 'none';
        vehicle.is_second_hand = false;
        vehicle.trade_in_vehicle = '';
        vehicle.trade_in_value = '';
        vehicle.cash_payment = '';
    }
    saveSecondHandStatus(vehicleId);
}

function toggleConsignment(btn, vehicleId) {
    const vehicle = data.vehicles.find(v => v.id === vehicleId);
    if (!vehicle) return;
    
    const consignmentDiv = document.getElementById('consignment-info-' + vehicleId);
    if (btn.dataset.value === 'yes') {
        consignmentDiv.style.display = 'block';
        vehicle.is_consignment = true;
    } else {
        consignmentDiv.style.display = 'none';
        vehicle.is_consignment = false;
        vehicle.consignment_owner = '';
        vehicle.consignment_phone = '';
        vehicle.consignment_commission = '';
    }
    saveConsignmentStatus(vehicleId);
}

function saveVehicleStatus(vehicleId) {
    const vehicle = data.vehicles.find(v => v.id === vehicleId);
    if (!vehicle) return;
    
    const statusSelect = document.querySelector(`#vehicle-card-${vehicleId} select[name="status"]`);
    if (statusSelect) {
        vehicle.status = statusSelect.value;
    }
    
    // API'ye kaydet
    fetch('save.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicles: data.vehicles })
    }).then(() => {
        showNotification('Taşıt durumu kaydedildi');
        renderVehicles();
    });
}

function saveLockStatus(vehicleId) {
    const vehicle = data.vehicles.find(v => v.id === vehicleId);
    if (!vehicle) return;
    
    const lockReason = document.getElementById('lock-reason-' + vehicleId);
    const lockDate = document.getElementById('lock-date-' + vehicleId);
    
    if (lockReason) vehicle.lock_reason = lockReason.value;
    if (lockDate) vehicle.lock_date = lockDate.value;
    
    fetch('save.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicles: data.vehicles })
    }).then(() => {
        showNotification('Kilit durumu kaydedildi');
    });
}

function saveNewVehicleStatus(vehicleId) {
    const vehicle = data.vehicles.find(v => v.id === vehicleId);
    if (!vehicle) return;
    
    const newPriceInput = document.getElementById('new-purchase-price-' + vehicleId);
    if (newPriceInput) vehicle.new_purchase_price = newPriceInput.value;
    
    fetch('save.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicles: data.vehicles })
    }).then(() => {
        showNotification('Yeni taşıt durumu kaydedildi');
    });
}

function saveZeroVehicleStatus(vehicleId) {
    const vehicle = data.vehicles.find(v => v.id === vehicleId);
    if (!vehicle) return;
    
    // *** DÜZELTME BAŞLANGICI ***
    const zeroPriceInput = document.getElementById('zero-purchase-price-' + vehicleId);
    // *** DÜZELTME SONU ***
    
    if (zeroPriceInput) vehicle.zero_purchase_price = zeroPriceInput.value;
    
    fetch('save.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicles: data.vehicles })
    }).then(() => {
        showNotification('Sıfır araç durumu kaydedildi');
    });
}

function saveSecondHandStatus(vehicleId) {
    const vehicle = data.vehicles.find(v => v.id === vehicleId);
    if (!vehicle) return;
    
    // *** DÜZELTME BAŞLANGICI ***
    const tradeInVehicle = document.getElementById('trade-in-vehicle-' + vehicleId);
    // *** DÜZELTME SONU ***
    
    const tradeInValue = document.getElementById('trade-in-value-' + vehicleId);
    const cashPayment = document.getElementById('cash-payment-' + vehicleId);
    
    if (tradeInVehicle) vehicle.trade_in_vehicle = tradeInVehicle.value;
    if (tradeInValue) vehicle.trade_in_value = tradeInValue.value;
    if (cashPayment) vehicle.cash_payment = cashPayment.value;
    
    fetch('save.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicles: data.vehicles })
    }).then(() => {
        showNotification('İkinci el araç durumu kaydedildi');
    });
}

function saveConsignmentStatus(vehicleId) {
    const vehicle = data.vehicles.find(v => v.id === vehicleId);
    if (!vehicle) return;
    
    const owner = document.getElementById('consignment-owner-' + vehicleId);
    const phone = document.getElementById('consignment-phone-' + vehicleId);
    const commission = document.getElementById('consignment-commission-' + vehicleId);
    
    if (owner) vehicle.consignment_owner = owner.value;
    if (phone) vehicle.consignment_phone = phone.value;
    if (commission) vehicle.consignment_commission = commission.value;
    
    fetch('save.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicles: data.vehicles })
    }).then(() => {
        showNotification('Consignment durumu kaydedildi');
    });
}

function renderVehicleCardModal(vehicleId) {
    const vehicle = findVehicleById(vehicleId);
    if (!vehicle) return;
    
    // Tramer durumu - varsayılan "seçiniz"
    const tramerStatus = vehicle.tramer_status || 'choose';
    const hasPaintedParts = vehicle.has_painted_parts === true || vehicle.has_painted_parts === 'yes';
    const paintedParts = vehicle.painted_parts || [];
    const inGallery = vehicle.in_gallery === true || vehicle.in_gallery === 'yes';
    
    const modalHTML = `
        <div class="vehicle-card-header">
            <div class="vehicle-card-plate">${vehicle.plate || 'PLAKA YOK'}</div>
            <div class="vehicle-card-brand">${vehicle.brand || 'MARKA YOK'}</div>
        </div>
        
        <div class="vehicle-card-columns">
            <div class="vehicle-card-left">
                <div class="vehicle-field-group">
                    <div class="vehicle-field-label">Model Yılı</div>
                    <div class="vehicle-field-value">Örn: ${vehicle.year || '2019'}</div>
                </div>
                
                <div class="vehicle-field-group">
                    <div class="vehicle-field-label">Km</div>
                    <div class="vehicle-field-value">Örn: ${vehicle.km || '45000'}</div>
                </div>
                
                <div class="vehicle-field-group">
                    <div class="vehicle-field-label">Tramer Kaydı</div>
                    <div class="vehicle-yesno-container" id="tramer-container-${vehicleId}">
                        ${tramerStatus === 'choose' ? `
                            <button class="vehicle-yesno-btn btn-select" onclick="selectTramerOption(${vehicleId})">
                                -- Seçiniz --
                            </button>
                        ` : `
                            <button class="vehicle-yesno-btn btn-no ${tramerStatus === 'no' ? 'active' : ''}" 
                                    onclick="toggleTramerYesNo(${vehicleId}, 'no')">
                                Hayır
                            </button>
                            <button class="vehicle-yesno-btn btn-yes ${tramerStatus === 'yes' ? 'active' : ''}" 
                                    onclick="toggleTramerYesNo(${vehicleId}, 'yes')">
                                Evet
                            </button>
                        `}
                    </div>
                    ${tramerStatus === 'yes' ? `
                        <div class="vehicle-tramer-amount">
                            <input type="number" 
                                   class="vehicle-field-input" 
                                   placeholder="Tramer tutarı girin..."
                                   value="${vehicle.tramer_amount || ''}"
                                   onchange="saveTramerAmount(${vehicleId}, this.value)">
                        </div>
                    ` : ''}
                </div>
                
                <div class="vehicle-field-group">
                    <div class="vehicle-field-label">Boyalı ve Değişen Parçalar</div>
                    <div class="vehicle-yesno-container">
                        <button class="vehicle-yesno-btn btn-no ${!hasPaintedParts ? 'active' : ''}" 
                                data-field="boyali"
                                onclick="togglePaintedPartsYesNo(${vehicleId}, false)">
                            Hayır
                        </button>
                        <button class="vehicle-yesno-btn btn-yes ${hasPaintedParts ? 'active' : ''}" 
                                data-field="boyali"
                                onclick="togglePaintedPartsYesNo(${vehicleId}, true)">
                            Evet
                        </button>
                    </div>
                    
                    <div id="painted-parts-content-${vehicleId}">
                        ${!hasPaintedParts ? `
                            <div class="vehicle-no-parts">yoktur</div>
                        ` : `
                            <div class="vehicle-parts-list" id="parts-list-${vehicleId}">
                                ${paintedParts.length === 0 ? `
                                    <div class="vehicle-part-item">
                                        <input type="text" 
                                               class="vehicle-part-input" 
                                               placeholder="Örn: Ön kapı, Sol taraf"
                                               onchange="savePaintedPart(${vehicleId}, 0, this.value)">
                                        <button class="vehicle-part-remove" onclick="removePaintedPartRow(${vehicleId}, 0)" style="visibility: hidden;">×</button>
                                    </div>
                                ` : paintedParts.map((part, index) => `
                                    <div class="vehicle-part-item">
                                        <input type="text" 
                                               class="vehicle-part-input" 
                                               value="${part}"
                                               onchange="savePaintedPart(${vehicleId}, ${index}, this.value)">
                                        <button class="vehicle-part-remove" onclick="removePaintedPartRow(${vehicleId}, ${index})">×</button>
                                    </div>
                                `).join('')}
                            </div>
                            <button class="vehicle-add-part-btn" onclick="addPaintedPartRow(${vehicleId})">
                                <span class="icon">+</span>
                                <span>Yeni Satır Ekle</span>
                            </button>
                        `}
                    </div>
                </div>
                
                <div class="vehicle-field-group">
                    <div class="vehicle-field-label">Sigorta Bitiş Tarihi</div>
                    <input type="date" 
                           class="vehicle-date-input" 
                           value="${vehicle.insurance_end_date || ''}"
                           onchange="saveInsuranceDate(${vehicleId}, this.value)">
                </div>
            </div>
            
            <div class="vehicle-card-divider"></div>
            
            <div class="vehicle-card-right">
                <div class="vehicle-field-group">
                    <div class="vehicle-field-label">Taşıt Galeride mi?</div>
                    <div class="vehicle-gallery-btns">
                        <button class="vehicle-gallery-btn ${inGallery ? 'active' : ''}"
                                onclick="toggleGalleryStatus(this, ${vehicleId}, true)">
                            Evet
                        </button>
                        <button class="vehicle-gallery-btn ${!inGallery ? 'active' : ''}"
                                onclick="toggleGalleryStatus(this, ${vehicleId}, false)">
                            Hayır
                        </button>
                    </div>
                    
                    <div id="gallery-detail-${vehicleId}">
                        ${inGallery ? `
                            <div class="vehicle-gallery-detail">evet</div>
                        ` : `
                            <div class="vehicle-gallery-detail">
                                <input type="text" 
                                       class="vehicle-gallery-location-input" 
                                       placeholder="Kullanıcı konumu girin..."
                                       value="${vehicle.user_location || ''}"
                                       onchange="saveUserLocation(${vehicleId}, this.value)">
                            </div>
                        `}
                    </div>
                </div>
                
                <div class="vehicle-field-group">
                    <div class="vehicle-field-label">Notlar</div>
                    <textarea class="vehicle-notes-textarea" 
                              placeholder="Araç hakkında notlar yazınız..."
                              onchange="saveVehicleNotes(${vehicleId}, this.value)">${vehicle.notes || ''}</textarea>
                </div>
                
                <div class="vehicle-field-group">
                    <div class="vehicle-field-label">Muayene Bitiş Tarihi</div>
                    <input type="date" 
                           class="vehicle-date-input" 
                           value="${vehicle.inspection_end_date || ''}"
                           onchange="saveInspectionDate(${vehicleId}, this.value)">
                </div>
            </div>
        </div>
        
        <div class="vehicle-modal-footer">
            <button class="vehicle-modal-btn vehicle-modal-btn-cancel" onclick="closeVehicleCardModal()">
                İptal
            </button>
            <button class="vehicle-modal-btn vehicle-modal-btn-save" onclick="saveAndCloseVehicleCard(${vehicleId})">
                Güncelle
            </button>
        </div>
    `;
    
    return modalHTML;
}

function selectTramerOption(vehicleId) {
    const container = document.getElementById(`tramer-container-${vehicleId}`);
    container.innerHTML = `
        <button class="vehicle-yesno-btn btn-no" onclick="toggleTramerYesNo(${vehicleId}, 'no')">
            Hayır
        </button>
        <button class="vehicle-yesno-btn btn-yes" onclick="toggleTramerYesNo(${vehicleId}, 'yes')">
            Evet
        </button>
    `;
}

function toggleTramerYesNo(vehicleId, value) {
    const vehicle = findVehicleById(vehicleId);
    if (!vehicle) return;
    
    vehicle.tramer_status = value;
    
    // Butonu aktif yap
    const container = document.getElementById(`tramer-container-${vehicleId}`);
    container.querySelectorAll('.vehicle-yesno-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    container.querySelector(`.btn-${value}`).classList.add('active');
    
    // Evet seçildiyse tutar input'u göster
    if (value === 'yes') {
        const existingAmount = container.querySelector('.vehicle-tramer-amount');
        if (!existingAmount) {
            const amountDiv = document.createElement('div');
            amountDiv.className = 'vehicle-tramer-amount';
            amountDiv.innerHTML = `
                <input type="number" 
                       class="vehicle-field-input" 
                       placeholder="Tramer tutarı girin..."
                       value="${vehicle.tramer_amount || ''}"
                       onchange="saveTramerAmount(${vehicleId}, this.value)">
            `;
            container.parentElement.appendChild(amountDiv);
        }
    } else {
        // Hayır seçildiyse tutar input'unu kaldır
        const amountDiv = container.parentElement.querySelector('.vehicle-tramer-amount');
        if (amountDiv) {
            amountDiv.remove();
        }
        vehicle.tramer_amount = null;
    }
    
    saveVehicleCardData(vehicleId);
}

function saveTramerAmount(vehicleId, amount) {
    const vehicle = findVehicleById(vehicleId);
    if (!vehicle) return;
    
    vehicle.tramer_amount = amount;
    saveVehicleCardData(vehicleId);
}

function togglePaintedPartsYesNo(vehicleId, hasparts) {
    const vehicle = findVehicleById(vehicleId);
    if (!vehicle) return;
    
    vehicle.has_painted_parts = hasparts;
    
    const contentDiv = document.getElementById(`painted-parts-content-${vehicleId}`);
    
    if (!hasparts) {
        // Hayır - "yoktur" göster
        contentDiv.innerHTML = '<div class="vehicle-no-parts">yoktur</div>';
        vehicle.painted_parts = [];
    } else {
        // Evet - Boş satır göster
        contentDiv.innerHTML = `
            <div class="vehicle-parts-list" id="parts-list-${vehicleId}">
                <div class="vehicle-part-item">
                    <input type="text" 
                           class="vehicle-part-input" 
                           placeholder="Örn: Ön kapı, Sol taraf"
                           onchange="savePaintedPart(${vehicleId}, 0, this.value)">
                    <button class="vehicle-part-remove" onclick="removePaintedPartRow(${vehicleId}, 0)" style="visibility: hidden;">×</button>
                </div>
            </div>
            <button class="vehicle-add-part-btn" onclick="addPaintedPartRow(${vehicleId})">
                <span class="icon">+</span>
                <span>Yeni Satır Ekle</span>
            </button>
        `;
        vehicle.painted_parts = [''];
    }
    
    saveVehicleCardData(vehicleId);
}

function addPaintedPartRow(vehicleId) {
    const vehicle = findVehicleById(vehicleId);
    if (!vehicle) return;
    
    if (!vehicle.painted_parts) vehicle.painted_parts = [];
    vehicle.painted_parts.push('');
    
    const listDiv = document.getElementById(`parts-list-${vehicleId}`);
    const index = vehicle.painted_parts.length - 1;
    
    const newRow = document.createElement('div');
    newRow.className = 'vehicle-part-item';
    newRow.innerHTML = `
        <input type="text" 
               class="vehicle-part-input" 
               placeholder="Örn: Ön kapı, Sol taraf"
               onchange="savePaintedPart(${vehicleId}, ${index}, this.value)">
        <button class="vehicle-part-remove" onclick="removePaintedPartRow(${vehicleId}, ${index})">×</button>
    `;
    
    listDiv.appendChild(newRow);
}

function removePaintedPartRow(vehicleId, index) {
    const vehicle = findVehicleById(vehicleId);
    if (!vehicle) return;
    
    vehicle.painted_parts.splice(index, 1);
    
    // Listeyi yeniden render et
    const contentDiv = document.getElementById(`painted-parts-content-${vehicleId}`);
    const hasParts = vehicle.painted_parts.length > 0;
    
    if (!hasParts) {
        vehicle.has_painted_parts = false;
        contentDiv.innerHTML = '<div class="vehicle-no-parts">yoktur</div>';
    } else {
        contentDiv.innerHTML = `
            <div class="vehicle-parts-list" id="parts-list-${vehicleId}">
                ${vehicle.painted_parts.map((part, idx) => `
                    <div class="vehicle-part-item">
                        <input type="text" 
                               class="vehicle-part-input" 
                               value="${part}"
                               placeholder="Örn: Ön kapı, Sol taraf"
                               onchange="savePaintedPart(${vehicleId}, ${idx}, this.value)">
                        <button class="vehicle-part-remove" onclick="removePaintedPartRow(${vehicleId}, ${idx})">×</button>
                    </div>
                `).join('')}
            </div>
            <button class="vehicle-add-part-btn" onclick="addPaintedPartRow(${vehicleId})">
                <span class="icon">+</span>
                <span>Yeni Satır Ekle</span>
            </button>
        `;
    }
    
    saveVehicleCardData(vehicleId);
}

function savePaintedPart(vehicleId, index, value) {
    const vehicle = findVehicleById(vehicleId);
    if (!vehicle) return;
    
    if (!vehicle.painted_parts) vehicle.painted_parts = [];
    vehicle.painted_parts[index] = value;
    
    saveVehicleCardData(vehicleId);
}

function toggleGalleryStatus(buttonElement, vehicleId, inGallery) {
    const vehicle = findVehicleById(vehicleId);
    if (!vehicle) return;
    
    vehicle.in_gallery = inGallery;
    
    // Butonları güncelle
    const btns = document.querySelectorAll(`#gallery-detail-${vehicleId}`).parentElement.querySelectorAll('.vehicle-gallery-btn');
    btns.forEach(btn => btn.classList.remove('active'));
    buttonElement.classList.add('active'); // DÜZELTİLMİŞ SATIR
    
    // Dinamik alanı güncelle
    const detailDiv = document.getElementById(`gallery-detail-${vehicleId}`);
    if (inGallery) {
        // Evet seçildi - "evet" yazısı göster
        detailDiv.innerHTML = '<div class="vehicle-gallery-detail">evet</div>';
    } else {
        // Hayır seçildi - Konum input göster
        detailDiv.innerHTML = `
            <div class="vehicle-gallery-detail">
                <input type="text" 
                       class="vehicle-gallery-location-input" 
                       placeholder="Kullanıcı konumu girin..."
                       value="${vehicle.user_location || ''}"
                       onchange="saveUserLocation(${vehicleId}, this.value)">
            </div>
        `;
    }
    
    saveVehicleCardData(vehicleId);
}

function saveUserLocation(vehicleId, location) {
    const vehicle = findVehicleById(vehicleId);
    if (!vehicle) return;
    
    vehicle.user_location = location;
    saveVehicleCardData(vehicleId);
}

function saveVehicleNotes(vehicleId, notes) {
    const vehicle = findVehicleById(vehicleId);
    if (!vehicle) return;
    
    vehicle.notes = notes;
    saveVehicleCardData(vehicleId);
}

function saveInsuranceDate(vehicleId, date) {
    const vehicle = findVehicleById(vehicleId);
    if (!vehicle) return;
    
    vehicle.insurance_end_date = date;
    saveVehicleCardData(vehicleId);
}

function saveInspectionDate(vehicleId, date) {
    const vehicle = findVehicleById(vehicleId);
    if (!vehicle) return;
    
    vehicle.inspection_end_date = date;
    saveVehicleCardData(vehicleId);
}

function saveVehicleCardData(vehicleId) {
    fetch('save.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicles: data.vehicles })
    }).then(() => {
        showNotification('Değişiklikler kaydedildi');
    }).catch(err => {
        showNotification('Kayıt hatası: ' + err.message, 'error');
    });
}

function showVehicleCardModal(vehicleId) {
    const modalContent = renderVehicleCardModal(vehicleId);
    
    // Modal container'ı bul veya oluştur
    let modal = document.getElementById('vehicle-card-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'vehicle-card-modal';
        modal.className = 'modal';
        document.body.appendChild(modal);
    } 
    
    modal.innerHTML = `
        <div class="modal-bg" onclick="closeVehicleCardModal()"></div>
        <div class="modal-content" style="max-width: 900px;">
            <button class="modal-close" onclick="closeVehicleCardModal()">×</button>
            ${modalContent}
        </div>
    `;
    
    modal.classList.add('on');
}

function closeVehicleCardModal() {
    const modal = document.getElementById('vehicle-card-modal');
    if (modal) {
        modal.classList.remove('on');
    }
}

function saveAndCloseVehicleCard(vehicleId) {
    saveVehicleCardData(vehicleId);
    setTimeout(() => {
        closeVehicleCardModal();
        showNotification('Taşıt bilgileri güncellendi');
    }, 300);
}