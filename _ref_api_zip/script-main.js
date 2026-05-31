/* ====================================================================
   DOSYA 3/3: script-main.js
   Açıklama: Form gönderme mantığı, olay dinleyiciler ve 
   ÖNBELLEK YÖNETİMİ (Güvenli Akış - v49 Vadeli Alım Kayıt Fix)
   ==================================================================== */

/* ====================================================================
   7. İŞLEM MANTIĞI MODÜLLERİ (Modüler Fonksiyonlar)
   ==================================================================== */

// --- Modül 7.1: Virman İşlemi ---
async function handleVirman(txData) {
    const amount = txData.amount;
    const toggle = document.getElementById('virman-direction-toggle');
    const direction = toggle.dataset.direction || 'banka-to-kasa';
    const source = direction === 'banka-to-kasa' ? 'banka' : 'kasa';
    const destination = direction === 'banka-to-kasa' ? 'kasa' : 'banka';
    const sourceBalance = source === 'banka' ? calculateBankaBalance() : calculateKasaBalance();

    if (!editing || (editing && editing.source_account !== source)) {
         const submitBtn = document.getElementById('submit-btn');
         if (sourceBalance < amount) {
            toast(`Yetersiz bakiye! ${source.charAt(0).toUpperCase() + source.slice(1)} hesabında ${fmt(sourceBalance)} var.`, "err");
            updateStatusIndicator('error', 'Yetersiz Bakiye');
            submitBtn.disabled = false;
            return false;
        }
    }

    const virmanTx = {
        ...txData,
        category: 'kasa-banka-virman',
        source_account: source,
        destination_account: destination
    };

    if (editing) {
        const index = data.transactions.findIndex(t => t.id === editing.id);
        if (index !== -1) {
            if (!data.revisions) data.revisions = [];
            data.revisions.push({
                id: nextId('revision'),
                tx_id: editing.id,
                action: 'güncelleme',
                before: { ...data.transactions[index] },
                after: { ...virmanTx },
                timestamp: new Date().toISOString()
            });
            data.transactions[index] = virmanTx;
        }
    } else {
        data.transactions.push(virmanTx);
    }
    return true;
}

// --- Modül 7.2: Taşıt Alımı İşlemi ---
async function handleTasitAlimi(txData, amount) {
    if (editing) {
        const index = data.transactions.findIndex(t => t.id === editing.id);
        if (index !== -1) {
            const vehicle = data.vehicles.find(v => v.id === editing.vehicle_id);
            if (vehicle) {
                vehicle.purchase_price = amount;
            }
            const updatedTx = { ...txData, vehicle_id: editing.vehicle_id };
            if (!data.revisions) data.revisions = [];
            data.revisions.push({
                id: nextId('revision'),
                tx_id: editing.id,
                action: 'güncelleme',
                before: { ...data.transactions[index] },
                after: { ...updatedTx },
                timestamp: new Date().toISOString()
            });
            data.transactions[index] = updatedTx;
            return true;
        }
    }

    const purchaseMethod = document.querySelector('input[name="purchase_method"]:checked').value;
    const newVehiclePlate = document.getElementById('new_vehicle_plate').value.toUpperCase();
    const newVehicleName = document.getElementById('new_vehicle_name').value;
    const submitBtn = document.getElementById('submit-btn');

    if (!newVehiclePlate || !newVehicleName) {
        toast('Yeni taşıt için plaka ve model girilmelidir.', "err");
        updateStatusIndicator('error', 'Eksik Bilgi');
        submitBtn.disabled = false;
        return false;
    }

    const newVehicle = { id: nextId('vehicle'), plate: newVehiclePlate, name: newVehicleName, purchase_price: amount, purchase_date: txData.date, status: 'stokta', type: 'owned' };

    if (data.vehicles.some(v => v.plate === newVehiclePlate && v.status !== 'satildi')) {
        toast('Bu plakaya sahip stokta araç zaten var.', "err");
        updateStatusIndicator('error', 'Plaka Tekrarı');
        submitBtn.disabled = false;
        return false;
    }

    if (purchaseMethod === 'pesin') {
        data.vehicles.push(newVehicle);
        data.transactions.push({ ...txData, vehicle_id: newVehicle.id });
    } else if (purchaseMethod === 'vadeli') {
        data.vehicles.push(newVehicle);
        const downPayment = parseN(document.getElementById('purchase_down_payment').value);
        const instCount = parseInt(document.getElementById('purchase_installments_count').value);
        const sellerId = txData.person_id;

        if (isNaN(instCount) || instCount <= 0) { toast("Geçerli taksit sayısı girin.", "err"); submitBtn.disabled = false; return false; }
        if (!sellerId) { toast("Vadeli alım için satıcı seçimi zorunludur.", "err"); submitBtn.disabled = false; return false; }

        // GÜNCELLEME: Peşinat 0 olsa bile işlem kaydı oluştur (İşlem Geçmişinde gözüksün diye)
        let txNote = txData.note;
        if (downPayment === 0 && !txNote) {
            txNote = "Vadeli Alış (Peşinatsız)";
        }
        
        data.transactions.push({ 
            ...txData, 
            amount: downPayment, 
            vehicle_id: newVehicle.id,
            note: txNote
        });

        const remaining = amount - downPayment;

        if (remaining > 0) {
            const installmentAmount = remaining / instCount;
            const newSchedule = { id: nextId('schedule'), type: 'borc', person_id: sellerId, vehicle_id: newVehicle.id, total_amount: remaining, paid_amount: 0, remaining, status: 'devam-ediyor', installments: [] };
            let currentDueDate = document.getElementById('purchase_first_payment_date').value ? new Date(document.getElementById('purchase_first_payment_date').value) : new Date(txData.date);
            if (!document.getElementById('purchase_first_payment_date').value) currentDueDate.setMonth(currentDueDate.getMonth() + 1);

            for (let i = 0; i < instCount; i++) {
                newSchedule.installments.push({ amount: installmentAmount, due_date: currentDueDate.toISOString().split('T')[0], status: 'bekleniyor' });
                currentDueDate.setMonth(currentDueDate.getMonth() + 1);
            }
            data.schedules.push(newSchedule);
        }
    } else if (purchaseMethod === 'ortakli') {
        const newVehicleOwnership = [];
        const companyShareInput = document.getElementById('company_share_amount');
        const companyShare = parseN(companyShareInput.value);
        const companyPercentageEl = companyShareInput.closest('.partner-row')?.querySelector('.partner-percentage');
        const companyPercentage = parseFloat(companyPercentageEl ? companyPercentageEl.textContent.replace('%', '') : 0);

        if (companyShare > 0) {
            newVehicleOwnership.push({ type: 'company', amount: companyShare, percentage: companyPercentage });
        }

        document.querySelectorAll('#joint-partners-inputs .partner-row:not(.company-row)').forEach(row => {
            const id = Number(row.querySelector('.joint-partner-id').value);
            const amountInput = row.querySelector('.joint-partner-amount');
            const p_amount = parseN(amountInput.value);
            const p_percentageEl = row.querySelector('.partner-percentage');
            const p_percentage = parseFloat(p_percentageEl ? p_percentageEl.textContent.replace('%', '') : 0);

            if (id && p_amount > 0) {
                newVehicleOwnership.push({ type: 'partner', person_id: id, amount: p_amount, percentage: p_percentage });
            }
        });

        const totalPaid = newVehicleOwnership.reduce((sum, p) => sum + p.amount, 0);
        if (Math.abs(totalPaid - amount) > 0.01) {
            toast(`Ödenen toplam tutar (${fmt(totalPaid)}), araç fiyatına (${fmt(amount)}) eşit olmalıdır.`, "err");
            updateStatusIndicator('error', 'Tutar Eşleşmiyor');
            submitBtn.disabled = false;
            return false;
        }

        newVehicle.ownership = newVehicleOwnership; 
        data.vehicles.push(newVehicle);

        newVehicleOwnership.forEach(p => {
            if (p.type === 'company') {
                data.transactions.push({ id: nextId('tx'), date: txData.date, category: 'tasit-alimi', amount: p.amount, note: `${newVehicle.plate} alımı - Şirket Payı`, person_id: null, vehicle_id: newVehicle.id, status: 'aktif', account: txData.account });
            } else {
                data.transactions.push({ id: nextId('tx'), date: txData.date, category: 'tasit-alimi', amount: p.amount, note: `${newVehicle.plate} alımı - Ortak Payı`, person_id: p.person_id, vehicle_id: newVehicle.id, status: 'aktif', account: 'not-applicable' });
            }
        });
    }
    
    // YENİ EKLENEN: Konsinye Araçlar için 0 TL'lik kayıt at (İşlem Geçmişinde görünmesi için)
    // Bu kısım zaten Konsinye Modalından yapılıyor, burası Normal Alım için.
    // Konsinye Ekleme işlemi handleKonsinyeSave içinde yapılıyor, oraya da ekleme yapıldı.

    return true;
}

// --- Modül 7.3: Taşıt Satışı İşlemi ---
async function handleTasitSatisi(txData, amount) {
    
    // === GÜVENLİ ID ALIMI ===
    const vehicleId = txData.vehicle_id;
    const v = data.vehicles.find(v => v.id === vehicleId);
    const submitBtn = document.getElementById('submit-btn');

    if(!v) { 
        toast('Satılacak taşıt seçilmelidir.', "err"); 
        updateStatusIndicator('error', 'Eksik Bilgi'); 
        submitBtn.disabled = false; 
        return false; 
    }
    
    // === TARİH KONTROLÜ ===
    const purchaseDate = v.purchase_date;
    const saleDate = txData.date;

    if (purchaseDate && saleDate < purchaseDate) {
        toast("Seçilen Tarihte, Stokta Olmayan Taşıtı Satmaya Çalışıyorsunuz.!", "err");
        updateStatusIndicator('error', 'Geçersiz Tarih');
        submitBtn.disabled = false;
        return false;
    }

    if (editing) {
         const index = data.transactions.findIndex(t => t.id === editing.id);
         if (index !== -1) {
             if (v) {
                 v.sale_price = amount;
                 v.sale_date = txData.date;
             }
             const updatedTx = { ...txData, vehicle_id: editing.vehicle_id };
             if (!data.revisions) data.revisions = [];
             data.revisions.push({
                 id: nextId('revision'),
                 tx_id: editing.id,
                 action: 'güncelleme',
                 before: { ...data.transactions[index] },
                 after: { ...updatedTx },
                 timestamp: new Date().toISOString()
             });
             data.transactions[index] = updatedTx;

             // === KÂR DAĞITIMI GÜNCELLEMESİ (EDIT MODE) ===
             const oldProfitTxs = data.transactions.filter(t => 
                t.vehicle_id === editing.vehicle_id &&
                t.virtual === true &&
                (t.category === 'tasit-satis-kari' || (t.category === 'alinan-borc' && t.note.includes('satış kâr payı')))
             );
             oldProfitTxs.forEach(tx => { tx.status = 'iptal'; });

             const totalExpenses = getVehicleExpenses(v.id);
             const profit = (v.sale_price || 0) - (v.purchase_price || 0) - totalExpenses;
             const vehicleOwnership = v.ownership || v.partnerships;

             if (vehicleOwnership && Array.isArray(vehicleOwnership) && vehicleOwnership.length > 0) {
                 let companyProfitShare = 0;
                 vehicleOwnership.forEach(p => {
                     const sharePercentage = p.percentage || 0;
                     const profitShare = profit * (sharePercentage / 100);

                     if (p.type === 'company') {
                         companyProfitShare += profitShare;
                     } else if (p.type === 'partner' && p.person_id) {
                         data.transactions.push({
                             id: nextId('tx'),
                             date: txData.date,
                             category: 'alinan-borc', 
                             amount: profitShare,
                             note: `${v.plate} satış kâr payı (%${sharePercentage.toFixed(2)})`,
                             person_id: p.person_id,
                             vehicle_id: v.id,
                             status: 'aktif',
                             account: 'not-applicable',
                             virtual: true
                         });
                     }
                 });
                 data.transactions.push({
                     id: nextId('tx'),
                     date: txData.date,
                     category: 'tasit-satis-kari',
                     amount: companyProfitShare,
                     note: 'Şirket kâr payı',
                     vehicle_id: v.id,
                     status: 'aktif',
                     virtual: true
                 });
             } else {
                 data.transactions.push({
                     id: nextId('tx'),
                     date: txData.date,
                     category: 'tasit-satis-kari',
                     amount: profit,
                     vehicle_id: v.id,
                     status: 'aktif',
                     virtual: true
                 });
             }
             return true;
         }
    }

    // === YENİ SATIŞ İŞLEMİ ===
    if(v.type === 'consigned'){ toast("Konsinye araç satışı bu menüden yapılamaz.", "err"); submitBtn.disabled = false; return false; }

    const saleType = document.querySelector('input[name="sale_type"]:checked').value;
    const buyerPersonId = Number(document.getElementById('buyer_person_id').value) || null;

    v.status = 'satildi';
    v.sale_price = amount;
    v.sale_date = txData.date;

    if (saleType === 'pesin') {
        data.transactions.push(txData);
    } else if (saleType === 'vadeli') {
        const downPayment = parseN(document.getElementById('down_payment').value);
        const instCount = parseInt(document.getElementById('installments_count').value);

        if (!buyerPersonId) { toast("Vadeli satış için alıcı seçimi zorunludur.", "err"); submitBtn.disabled = false; return false; }
        if (isNaN(instCount) || instCount <= 0) { toast("Geçerli taksit sayısı girin.", "err"); submitBtn.disabled = false; return false; }
        if (downPayment < 0 || downPayment > amount) { toast("Peşinat tutarı negatif veya satış tutarından büyük olamaz.", "err"); submitBtn.disabled = false; return false; }

        const remaining = amount - downPayment;
        const fixedRemaining = parseFloat(remaining.toFixed(2));
        let newSchedule = null;

        if (fixedRemaining > 0) {
            const installmentAmount = fixedRemaining / instCount;
            newSchedule = { id: nextId('schedule'), type: 'alacak', person_id: buyerPersonId, vehicle_id: v.id, total_amount: fixedRemaining, paid_amount: 0, remaining: fixedRemaining, status: 'devam-ediyor', installments: [] };
            let currentDueDate = document.getElementById('sale_first_payment_date').value ? new Date(document.getElementById('sale_first_payment_date').value) : new Date(txData.date);
            if (!document.getElementById('sale_first_payment_date').value) { currentDueDate.setMonth(currentDueDate.getMonth() + 1); }

            for (let i = 0; i < instCount; i++) {
                newSchedule.installments.push({ amount: installmentAmount, due_date: currentDueDate.toISOString().split('T')[0], status: 'bekleniyor' });
                currentDueDate.setMonth(currentDueDate.getMonth() + 1);
            }
            data.schedules.push(newSchedule);
        }

        if (downPayment >= 0) {
             const dpTx = {...txData, amount: downPayment, person_id: buyerPersonId,
                           links: [{ type: 'schedule', id: newSchedule?.id ?? null, role: 'down_payment' }]};
             data.transactions.push(dpTx);
        }
    }

    // === KÂR DAĞITIMI (YENİ SATIŞ) ===
    const totalExpenses = getVehicleExpenses(v.id);
    const profit = (v.sale_price || 0) - (v.purchase_price || 0) - totalExpenses;
    const vehicleOwnership = v.ownership || v.partnerships; 

    if (vehicleOwnership && Array.isArray(vehicleOwnership) && vehicleOwnership.length > 0) {
        let companyProfitShare = 0;
        vehicleOwnership.forEach(p => {
            const sharePercentage = p.percentage || 0;
            const profitShare = profit * (sharePercentage / 100);

            if (p.type === 'company') {
                companyProfitShare += profitShare;
            } else if (p.type === 'partner' && p.person_id) {
                data.transactions.push({
                    id: nextId('tx'),
                    date: txData.date,
                    category: 'alinan-borc', 
                    amount: profitShare,
                    note: `${v.plate} satış kâr payı (%${sharePercentage.toFixed(2)})`,
                    person_id: p.person_id,
                    vehicle_id: v.id,
                    status: 'aktif',
                    account: 'not-applicable', 
                    virtual: true
                });
            }
        });

        data.transactions.push({
            id: nextId('tx'),
            date: txData.date,
            category: 'tasit-satis-kari',
            amount: companyProfitShare,
            note: 'Şirket kâr payı',
            vehicle_id: v.id,
            status: 'aktif',
            virtual: true
        });

    } else {
        data.transactions.push({
            id: nextId('tx'),
            date: txData.date,
            category: 'tasit-satis-kari',
            amount: profit,
            vehicle_id: v.id,
            status: 'aktif',
            virtual: true
        });
    }

    return true;
}

// --- Modül 7.4: Gelen Ödeme (Alacak Tahsilatı) İşlemi ---
async function handleGelenTL(txData, amount) {
    const personId = Number(document.getElementById('person').value) || null;
    const scheduleId = Number(document.getElementById('pending-schedule-select').value);
    const submitBtn = document.getElementById('submit-btn');
    
    if (!personId) { toast("Ödemeyi yapan kişi seçilmelidir.", "err"); submitBtn.disabled = false; return false; }

    const schedulesForSelectedPerson = data.schedules.filter(s => s.person_id === personId && s.type === 'alacak' && s.status !== 'tamamlandi' && s.status !== 'iptal');
    const hasPendingSchedules = schedulesForSelectedPerson.length > 0;
    
    if (!editing && !hasPendingSchedules) {
        toast("Kişinin kayıtlı alacak planı bulunamadı. İşlemi Cariler bölümünden devam edin.", "err");
        updateStatusIndicator('error', 'Borç Kaydı Yok');
        submitBtn.disabled = false;
        return false;
    }
    
    if (!editing && hasPendingSchedules && !scheduleId) {
        toast("Kayıtlı Alacak Seçimi Yapılmadam Devam Edilemez!", "err");
        updateStatusIndicator('error', 'Plan Seçimi Gerekli');
        submitBtn.disabled = false;
        return false;
    }
    
    let tx = {...txData};

    if (scheduleId) {
        const schedule = data.schedules.find(s => s.id === scheduleId);
        if (schedule) {
            const borcluPersonId = schedule.person_id;
            if (personId !== borcluPersonId && !editing) {
                const odeyen = data.persons.find(p => p.id === personId)?.name || 'Bilinmeyen Kişi';
                const borclu = data.persons.find(p => p.id === borcluPersonId)?.name || 'Bilinmeyen Borçlu';

                const shouldContinue = await new Promise((resolve) => {
                    showConfirm(
                        `${borclu}'nun Borcunu, ${odeyen} Kişisi Ödeyecektir, Emin misiniz?`, 
                        () => resolve(true),
                        () => resolve(false)
                    );
                });
                
                if (!shouldContinue) {
                    submitBtn.disabled = false;
                    updateStatusIndicator('ready', 'Hazır');
                    return false;
                }
            }
            const applied = applyPaymentToScheduleNextOnly(schedule, amount);
            tx.links = [{ type: 'schedule', id: scheduleId, role: 'payment', amount: applied }];
        }
    } 
    
    if (editing) {
        const index = data.transactions.findIndex(t => t.id === editing.id);
        if (index !== -1) {
            if(!data.revisions) data.revisions = [];
            data.revisions.push({
                id: nextId('revision'),
                tx_id: editing.id,
                action: 'güncelleme',
                before: { ...data.transactions[index] },
                after: { ...tx },
                timestamp: new Date().toISOString()
            });
            data.transactions[index] = tx;
        }
    } else {
         data.transactions.push(tx);
    }
    return true;
}

/* ====================================================================
   7.5 FORM İŞLEMLERİ VE OLAY YÖNETİCİLERİ (ANA FONKSİYONLAR)
   ==================================================================== */
async function submitTx(e) {
	e.preventDefault();
	clearFormErrors();

    const cat = document.getElementById("selected-category").value;
    const amountInput = document.getElementById("amount");
    const purchaseAmountInput = document.getElementById("purchase_amount");

    if (cat === 'tasit-alimi') {
        amountInput.required = false;
        if (purchaseAmountInput) purchaseAmountInput.required = true;
    } else {
        amountInput.required = true;
        if (purchaseAmountInput) purchaseAmountInput.required = false;
    }

    document.getElementById('tx-form').querySelectorAll('[required]').forEach(input => {
        if (input.offsetParent === null) input.required = false;
    });

	const submitBtn = document.getElementById('submit-btn');
    submitBtn.disabled = true;
	updateStatusIndicator('busy', 'Kaydediliyor...');

    let amount;
    if (cat === 'tasit-alimi') {
        amount = parseN(document.getElementById("purchase_amount").value);
    } else {
        amount = parseN(document.getElementById("amount").value);
    }

    if (!cat) {
        toast("Lütfen bir işlem türü seçin.", "warn");
        updateStatusIndicator('error', 'İşlem Türü Seçilmedi');
        submitBtn.disabled = false;
        return;
	}
    if (amount <= 0 && cat !== 'tasit-satis-kari' && cat !== 'tasit-alimi' && cat !== 'tasit-satisi') {
        let errorInputEl = (cat === 'tasit-alimi') ? document.getElementById('purchase_amount') : document.getElementById('amount');
        if(errorInputEl) errorInputEl.classList.add('input-error');
        toast("Lütfen geçerli bir tutar girin.", "warn");
        updateStatusIndicator('error', 'Geçersiz Tutar');
        submitBtn.disabled = false;
        return;
    }

    // DÜZELTME: vehicleId'yi güvenli al
    const formVehicleId = Number(document.getElementById('vehicle').value);

	const txData = {
		id: editing ? editing.id : nextId('tx'),
		date: document.getElementById("date").value,
		category: cat,
		amount: amount,
		note: document.getElementById("note").value.trim(),
        person_id: Number(document.getElementById("person").value) || null,
        // DÜZELTME: vehicle_id ataması
        vehicle_id: editing ? editing.vehicle_id : (formVehicleId || null),
		status: "aktif",
        account: document.querySelector('input[name="account_type"]:checked') ? document.querySelector('input[name="account_type"]:checked').value : 'kasa',
        due_date: document.getElementById('due-date').value || null
	};

    const flowType = getCashFlowType(cat);
    if (flowType === 'out' && !editing) {
        const currentBalance = txData.account === 'banka' ? calculateBankaBalance() : calculateKasaBalance();
        let amountToCheck = amount;
        let errorInputEl = (cat === 'tasit-alimi') ? document.getElementById('purchase_amount') : document.getElementById('amount');

        if (cat === 'tasit-alimi') {
            const purchaseMethod = document.querySelector('input[name="purchase_method"]:checked').value;
            if (purchaseMethod === 'vadeli') {
                amountToCheck = parseN(document.getElementById('purchase_down_payment').value);
				errorInputEl = document.getElementById('purchase_down_payment');
            } else if (purchaseMethod === 'ortakli') {
                const companyShareInput = document.getElementById('company_share_amount');
                amountToCheck = companyShareInput ? parseN(companyShareInput.value) : 0;
                errorInputEl = companyShareInput;
            }
        }

        if (amountToCheck > 0 && currentBalance < amountToCheck) {
			if(errorInputEl) errorInputEl.classList.add('input-error');
            toast('Yetersiz bakiye! Bu işlem için ' + fmt(amountToCheck) + ' gerekli.', "err");
            updateStatusIndicator('error', 'Yetersiz Bakiye');
            submitBtn.disabled = false;
            return;
        }
    }

    const isPotentiallyVehicleRelated = (typeof VEHICLE_RELATED_CATEGORIES !== 'undefined') && VEHICLE_RELATED_CATEGORIES.has(cat);
    if (isPotentiallyVehicleRelated && !tempLinkedVehicleId && !txData.note) {
        toast("Bu tür giderler için araç seçimi yapılmadıysa açıklama zorunludur.", "warn");
        updateStatusIndicator('error', 'Eksik Açıklama/Araç');
        submitBtn.disabled = false;
        return;
    }

    let success = false;
	switch(cat) {
        case 'kasa-banka-virman':
            success = await handleVirman(txData);
            break;
        case 'tasit-alimi':
            success = await handleTasitAlimi(txData, amount);
            break;
        case 'tasit-satisi':
            // txData.vehicle_id artık dolu
            success = await handleTasitSatisi(txData, amount);
            if (!success) return; 
            break;
        case 'gelen-tl':
            success = await handleGelenTL(txData, amount);
            if (!success) return;
            break;
        case 'asli-ortak-sermaye-giris':
        case 'asli-ortak-sermaye-cikis':
            if (!txData.person_id) { toast("Sermaye işlemi için Asli Ortak seçimi zorunludur.", "err"); submitBtn.disabled = false; return; }
            if (editing) {
                const index = data.transactions.findIndex(t => t.id === editing.id);
                if (index !== -1) {
                    if(!data.revisions) data.revisions = [];
                    data.revisions.push({ id: nextId('revision'), tx_id: editing.id, action: 'güncelleme', before: {...data.transactions[index]}, after: {...txData}, timestamp: new Date().toISOString() });
                    data.transactions[index] = txData;
                }
            } else {
                data.transactions.push(txData);
            }
            success = true;
            break;
        case 'alinan-borc':
        case 'verilen-borc':
            if (!txData.person_id) { toast("Cari seçimi zorunludur.", "err"); submitBtn.disabled = false; return; }
            if (editing) {
                const index = data.transactions.findIndex(t => t.id === editing.id);
                if (index !== -1) {
                    if(!data.revisions) data.revisions = [];
                    data.revisions.push({
                        id: nextId('revision'),
                        tx_id: editing.id,
                        action: 'güncelleme',
                        before: { ...data.transactions[index] },
                        after: { ...txData },
                        timestamp: new Date().toISOString()
                    });
                    data.transactions[index] = txData;
                }
            } else {
                data.transactions.push(txData);
            }
            success = true;
            break;
        default:
            if (editing) {
                const index = data.transactions.findIndex(t => t.id === editing.id);
                if (index !== -1) {
                    const originalTx = {...data.transactions[index]};
                    if(!data.revisions) data.revisions = [];
                    txData.vehicle_id = tempLinkedVehicleId || editing.vehicle_id || null;
                    data.revisions.push({ id: nextId('revision'), tx_id: editing.id, action: 'güncelleme', before: originalTx, after: {...txData}, timestamp: new Date().toISOString() });
                    data.transactions[index] = txData;
                }
            } else if (tempLinkedVehicleId && getCashFlowType(cat) === 'out') {
                txData.vehicle_id = tempLinkedVehicleId;
                data.transactions.push(txData);
            } else {
                data.transactions.push(txData);
            }
            success = true;
            break;
    }

    if (success) {
        await save();
        checkAllNotifications();
        toast(editing ? "İşlem güncellendi" : "✓ İşlem kaydedildi", "ok");
        const savedVehicleId = txData.vehicle_id || tempLinkedVehicleId || (editing ? editing.vehicle_id : null);
        resetForm();
        showVeriDetail('hareketler');
        renderTxList();
        if(document.getElementById('modal-fin').classList.contains('on')) renderFinance();
        if(document.getElementById('modal-tasitlar').classList.contains('on')) renderTasitlarData(currentTasitlarDetail);
        if (savedVehicleId && document.getElementById('vehicle-detail-view')?.style.display === 'block' && typeof editingVehicleDetailId !== 'undefined' && editingVehicleDetailId === savedVehicleId) {
            if (typeof showVehicleDetailViewAdvanced === 'function') showVehicleDetailViewAdvanced(savedVehicleId);
        }
        editing = null;
        updateStatusIndicator('ready', 'Hazır');
    }
    submitBtn.disabled = false;
}

function editTx(id) {
    const tx = data.transactions.find(t => t.id === id);
    if (!tx) { toast("İşlem bulunamadı.", "err"); return; }

    editing = { ...tx };
    tempLinkedVehicleId = tx.vehicle_id || null;

    showVeriDetail('kayit');

	const text = displayCategory(tx.category);
	document.getElementById('selected-category').value = tx.category;
    document.getElementById('category-trigger-value').textContent = text;
	document.getElementById('category-trigger-value').classList.add('selected');
	document.getElementById('category-trigger-value').classList.remove('placeholder');
	categoryChanged();

    if (tx.category === 'tasit-alimi') {
         const purchaseInput = document.getElementById("purchase_amount");
         if (purchaseInput) {
             purchaseInput.value = tx.amount;
             formatNumberInput({target: purchaseInput});
         }
    } else {
        const amountInput = document.getElementById("amount");
        if (amountInput) {
            amountInput.value = tx.amount;
            formatNumberInput({target: amountInput});
        }
    }

    document.getElementById("date").value = tx.date;
	document.getElementById("note").value = tx.note || '';
    if (tx.person_id) document.getElementById("person").value = tx.person_id;
    if (tx.vehicle_id) document.getElementById("vehicle").value = tx.vehicle_id;

    if (document.getElementById('due-date')) {
        document.getElementById('due-date').value = tx.due_date || '';
    }

    if (tx.category === 'kasa-banka-virman') {
         const toggle = document.getElementById('virman-direction-toggle');
         if (toggle) {
             if (tx.source_account === 'kasa') {
                 toggle.dataset.direction = 'kasa-to-banka';
                 toggle.textContent = 'Kasadan Bankaya Aktar';
             } else {
                 toggle.dataset.direction = 'banka-to-kasa';
                 toggle.textContent = 'Bankadan Kasaya Aktar';
             }
         }
    } else {
        if (tx.account === 'banka') {
            document.getElementById('account_banka').checked = true;
        } else {
            document.getElementById('account_kasa').checked = true;
        }
    }

    updateLinkedVehicleInfo();
    document.getElementById("submit-btn").textContent = "Güncelle";
	document.getElementById("cancel-edit").style.display = "inline-block";
}

async function cancelTx(txId) {
    const tx = data.transactions.find(t => t.id === txId);
    if (!tx) { toast("İşlem bulunamadı.", "err"); return; }

    if (tx.category === 'tasit-alimi' && tx.vehicle_id) {
        const vehicleId = tx.vehicle_id;
        const hasRelatedTx = data.transactions.some(t =>
            t.vehicle_id === vehicleId &&
            t.id !== txId &&
            t.status === 'aktif'
        );

        if (hasRelatedTx) {
            toast("HATA: Bu alım işlemine bağlı masraf veya satış kaydı bulunmaktadır. Önce o işlemleri iptal etmelisiniz.", "err");
            return;
        }
    }

    if (tx.category === 'tasit-satisi' && tx.vehicle_id) {
        const schedule = data.schedules.find(s => s.vehicle_id === tx.vehicle_id && s.type === 'alacak');
        if (schedule) {
            const hasPayments = data.transactions.some(t =>
                t.links?.some(l => l.type === 'schedule' && l.id === schedule.id) &&
                t.status === 'aktif' &&
                t.category === 'gelen-tl'
            );
            if (hasPayments) {
                toast("HATA: Bu satış işlemine bağlı tahsilat(lar) yapılmış. Önce tahsilatları iptal etmelisiniz.", "err");
                return;
            }
        }
    }

    showConfirm("Bu işlemi iptal etmek istediğinizden emin misiniz? Bu işlem geri alınamaz.", async () => {

        const originalTx = {...tx};
        tx.status = 'iptal';
        const afterTx = {...tx};

		if(!data.revisions) data.revisions = [];
        data.revisions.push({ id: nextId('revision'), tx_id: txId, action: 'iptal', before: originalTx, after: afterTx, timestamp: new Date().toISOString() });

        if (tx.category === 'tasit-alimi' && tx.vehicle_id) {
            const v = data.vehicles.find(v => v.id === tx.vehicle_id);
            if(v) v.status = 'iptal-edildi';
             const relatedSchedule = data.schedules.find(s => s.vehicle_id === tx.vehicle_id && s.type === 'borc');

            if (relatedSchedule) {
                relatedSchedule.status = 'iptal';
                toast("İlişkili borç planı da iptal edildi.", "info");
            }
        }

        if (tx.category === 'tasit-satisi' && tx.vehicle_id) {
            const v = data.vehicles.find(v => v.id === tx.vehicle_id);
            if(v) v.status = 'stokta';
            
            const profitTxs = data.transactions.filter(t => 
                t.vehicle_id === v.id &&
                t.virtual === true &&
                (t.category === 'tasit-satis-kari' || (t.category === 'alinan-borc' && t.note.includes('satış kâr payı')))
            );
			profitTxs.forEach(ptx => ptx.status = 'iptal');

            const relatedSchedule = data.schedules.find(s => s.vehicle_id === tx.vehicle_id && s.type === 'alacak');
            if (relatedSchedule) {
                relatedSchedule.status = 'iptal';
                toast("İlişkili ödeme planı da iptal edildi.", "info");
            }
        }

        await save();
        checkAllNotifications();
        toast("İşlem iptal edildi.", "info");
        renderTxList();
        if(document.getElementById('modal-fin').classList.contains('on')) renderFinance();
        if(document.getElementById('modal-tasitlar').classList.contains('on')) renderTasitlarData(currentTasitlarDetail);

        const canceledVehicleId = originalTx.vehicle_id;
        if (canceledVehicleId &&
            document.getElementById('vehicle-detail-view')?.style.display === 'block' &&
            editingVehicleDetailId === canceledVehicleId) 
        {
            if (typeof showVehicleDetailViewAdvanced === 'function') {
                showVehicleDetailViewAdvanced(canceledVehicleId);
            }
        }
	});
}

function cancelEdit() {
	editing = null;
	resetForm();
}

function filterByDate(period) {
    activeDateFilter = period;
    updateActiveFilterButtons();
    const today = new Date();
    let start;
    const end = new Date();
    switch (period) {
        case 'month':
            start = new Date(today.getFullYear(), today.getMonth(), 1);
            break;
    }
    const filtered = data.transactions.filter(t => new Date(t.date) >= start && new Date(t.date) <= end);
    renderTxList(filtered);
}

function handleCariSave(e) {
    e.preventDefault();
    const name = document.getElementById('cari-edit-name').value.trim();
	if (!name) { toast("Cari adı boş olamaz.", "err"); return; }
    const type = document.getElementById('cari-edit-type').checked ? 'asli' : 'normal';
    if (cariEditingId) {
        const person = data.persons.find(p => p.id === cariEditingId);
        person.name = name;
        person.type = type;
    } else {
        data.persons.push({ id: nextId('person'), name, type });
    }
    save();
    renderCariList();
    updateAllPersonDropdowns();
    closeCariEditModal();
}

function handleKonsinyeSave(e) {
    e.preventDefault();
    const plate = document.getElementById('konsinye-plate').value.trim().toUpperCase();
    const name = document.getElementById('konsinye-name').value.trim();
    const person_id = Number(document.getElementById('konsinye-person-id').value);

    if(!plate || !name || !person_id) {
        toast("Tüm alanlar zorunludur.", "err");
        return;
    }

    if (data.vehicles.some(v => v.plate === plate && v.status !== 'satildi')) {
        toast('Bu plakaya sahip stokta araç zaten var.', "err");
        return;
    }

    const newVehicle = {
        id: nextId('vehicle'),
        plate: plate,
        name: name,
        person_id: person_id,
        entry_date: new Date().toISOString().split('T')[0],
        status: 'stokta',
        type: 'consigned',
        purchase_price: 0
    };
    data.vehicles.push(newVehicle);

    // GÜNCELLEME: Konsinye için 0 TL'lik işlem kaydı ekle
    data.transactions.push({
        id: nextId('tx'),
        date: new Date().toISOString().split('T')[0],
        category: 'tasit-alimi',
        amount: 0,
        note: `${plate} - Konsinye Giriş`,
        person_id: person_id,
        vehicle_id: newVehicle.id,
        status: 'aktif',
        account: 'not-applicable'
    });

    save();
    toast("Konsinye araç eklendi.", "ok");
    closeKonsinyeModal();
    
    if (typeof renderTxList === 'function') renderTxList(); // İşlem listesini güncelle
    if(document.getElementById('modal-tasitlar').classList.contains('on')) renderTasitlarData('konsinye');
}

async function saveVehicleDetails(vehicleId) {
    const v = data.vehicles.find(v => v.id === vehicleId);
    if (!v) {
        toast("Araç bulunamadı.", "err");
        return;
    }

    v.insurance_expiry = document.getElementById('vehicle-insurance-expiry').value || null;
    v.inspection_expiry = document.getElementById('vehicle-inspection-expiry').value || null;
    v.in_use = document.getElementById('vehicle-in-use').checked;
    v.user_name = v.in_use ? document.getElementById('vehicle-user-name').value.trim() : null;

    await save();
    checkAllNotifications();
    toast("Araç detayları başarıyla kaydedildi.", "ok");

    showTasitlarDetail(currentTasitlarDetail, isArchiveViewActive);
}

/* ====================================================================
   YENİ ÖNBELLEK TEMİZLEME AKIŞI (Rapor Doğrultusunda)
   ==================================================================== */

async function clearCacheRequest() {
    // Adım 1: Kullanıcıya işlem başladığını bildir
    updateStatusIndicator('busy', 'Veriler Sunucuya Kaydediliyor...');
    
    try {
        // Adım 2: Önce kaydetmeyi dene (Await ile bekle)
        await save();
        
        // Adım 3: Kayıt başarılıysa güvenli onay iste
        updateStatusIndicator('ready', 'Kayıt Başarılı');
        showConfirm(
            "Veriler başarıyla sunucuya kaydedildi ve güvende.\nÖnbelleği temizleyip sayfayı yenilemek istiyor musunuz?", 
            handleClearCache, 
            "Güvenli Temizleme Onayı"
        );
        
    } catch (e) {
        // Adım 4: Kayıt başarısızsa risk uyarısı ver
        console.error("Önbellek öncesi kayıt hatası:", e);
        updateStatusIndicator('error', 'Kayıt Başarısız');
        
        // === KULLANICI İSTEĞİ ÜZERİNE GÜNCELLENMİŞ METİN ===
        showConfirm(
            "Veriler Sunucuya Kaydedilemedi.\nDevam Ederseniz Güncel Çalışmalarınız Kayıp Olabilir !\nDevam Etmek İstiyor musunuz?", 
            handleClearCache, 
            "RİSKLİ İŞLEM UYARISI"
        );
    }
}

function handleClearCache() {
    // Adım 5: Onay alındıysa temizle ve yenile
    toast("Önbellek temizleniyor...", "info");
    setTimeout(() => {
        window.location.reload(true); // Zorla yenileme
    }, 500);
}


/* ====================================================================
   8. OLAY DİNLEYİCİLERİ VE BAŞLATMA
   ==================================================================== */
document.addEventListener("DOMContentLoaded", () => {
	load().then(() => {
        if (typeof rebuildMainCategorySelector === 'function') rebuildMainCategorySelector();
        if (typeof setupNewFilterCategorySelector === 'function') setupNewFilterCategorySelector();
        if (typeof migrateVehicleDetailsFields === 'function') migrateVehicleDetailsFields();

        checkAllNotifications();
        updateStatusIndicator('ready', 'Sistem Hazır');
        updateStatusMessage('Veriler sunucudan yüklendi', 'success');
    });

	document.getElementById("tx-form")?.addEventListener("submit", submitTx);
	document.getElementById('filter-form')?.addEventListener('submit', applyFilter);
	document.getElementById('cari-edit-form')?.addEventListener('submit', handleCariSave);
    document.getElementById('konsinye-add-form')?.addEventListener("submit", handleKonsinyeSave);

    document.getElementById('notifications-dropdown')?.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    const tasitlarSearchInput = document.getElementById('tasitlar-search-input');
    if (tasitlarSearchInput) {
        tasitlarSearchInput.addEventListener('input', (e) => {
            if (typeof renderTasitlarData === 'function') renderTasitlarData(currentTasitlarDetail, e.target.value);
        });
    }

    const archiveBtn = document.getElementById('tasitlar-archive-btn');
    if (archiveBtn) {
        archiveBtn.addEventListener('click', () => {
             if (typeof toggleArchiveView === 'function') toggleArchiveView();
        });
    }

    const tasitlarSearchBtn = document.getElementById('tasitlar-search-toggle-btn');
    if (tasitlarSearchBtn) {
        tasitlarSearchBtn.addEventListener('click', () => {
             if (typeof toggleTasitlarSearch === 'function') toggleTasitlarSearch();
        });
    }

    document.getElementById('konsinye-person-id')?.addEventListener('change', (e) => {
        if (e.target.value === 'new_person') {
            const selectElement = e.target;
            quickAddPerson((newPersonId) => {
                selectElement.value = newPersonId;
            });
        }
    });

    document.getElementById('person')?.addEventListener('change', (e) => {
        if (e.target.value === 'new_person') {
            const selectElement = e.target;
            quickAddPerson((newPersonId) => {
                selectElement.value = newPersonId;
                if (document.getElementById('selected-category').value === 'gelen-tl') {
                    if (typeof fillPendingSchedulesSelect === 'function') fillPendingSchedulesSelect();
                }
            });
        } else {
            if (document.getElementById('selected-category').value === 'gelen-tl') {
                 if (typeof fillPendingSchedulesSelect === 'function') fillPendingSchedulesSelect();
            }
        }
    });
    
    document.getElementById('buyer_person_id')?.addEventListener('change', (e) => { 
        if (e.target.value === 'new_person') {
            const selectElement = e.target;
            quickAddPerson((newPersonId) => {
                selectElement.value = newPersonId;
            });
        }
    });

    document.getElementById('virman-direction-toggle')?.addEventListener('click', (e) => {
        const button = e.target;
        const currentDirection = button.dataset.direction || 'banka-to-kasa';
        if (currentDirection === 'banka-to-kasa') {
            button.dataset.direction = 'kasa-to-banka';
            button.textContent = 'Kasadan Bankaya Aktar';
        } else {
            button.dataset.direction = 'banka-to-kasa';
            button.textContent = 'Bankadan Kasaya Aktar';
        }
    });

	document.getElementById('confirm-yes')?.addEventListener('click', () => {
		if (confirmCallback) confirmCallback();
		document.getElementById('modal-confirm').classList.remove('on');
        confirmCallback = null;
	});
	document.getElementById('confirm-no')?.addEventListener('click', () => {
		document.getElementById('modal-confirm').classList.remove('on');
		confirmCallback = null;
	});

    document.querySelectorAll('input[name="purchase_method"]').forEach(radio => radio.addEventListener('change', handlePurchaseMethodChange));
	document.querySelectorAll('input[name="sale_type"]').forEach(radio => radio.addEventListener('change', handleSaleTypeChange));

    document.getElementById('joint-partners-inputs')?.addEventListener('click', (e) => {
        const removeButton = e.target.closest('.remove-partner-btn');
        if (removeButton) {
            removeButton.closest('.partner-row').remove();
            if (typeof updateJointPurchaseCalculations === 'function') updateJointPurchaseCalculations();
        }
    });
    document.getElementById('joint-partners-inputs')?.addEventListener('change', (e) => {
        if (e.target.classList.contains('joint-partner-id') && e.target.value === 'new_person') {
            const selectElement = e.target;
            quickAddPerson((newPersonId) => {
                selectElement.value = newPersonId;
            });
        }
    });

    const fieldsToClearError = ['amount', 'purchase_down_payment', 'purchase_amount'];
    fieldsToClearError.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', () => el.classList.remove('input-error'));
        }
    });

    ['amount', 'down_payment', 'purchase_down_payment', 'purchase_amount'].forEach(id => {
        const el = document.getElementById(id);
        if(el) {
            el.addEventListener('input', formatNumberInput);
        }
    });
    
    ['profit-purchase-input', 'profit-sales-input', 'tramer-amount-input'].forEach(id => {
         const el = document.getElementById(id);
         if(el) {
            el.addEventListener('input', formatNumberInput);
         }
    });

	document.getElementById("pending-schedule-select")?.addEventListener("change", onPendingScheduleChange);
    const vehExpenseCheck = document.getElementById('is-vehicle-expense-check');
	if (vehExpenseCheck) {
		vehExpenseCheck.addEventListener('change', (e) => {
			if (e.target.checked) { if (typeof openVehicleLinkModal === 'function') openVehicleLinkModal(); }
			else { tempLinkedVehicleId = null; if (typeof updateLinkedVehicleInfo === 'function') updateLinkedVehicleInfo(); }
		});
    }
	document.getElementById('confirm-vehicle-link')?.addEventListener('click', () => {
		const selectedId = document.getElementById('vehicle-expense-select').value;
		if (selectedId) {
			tempLinkedVehicleId = Number(selectedId);
			if (typeof updateLinkedVehicleInfo === 'function') updateLinkedVehicleInfo();
			if (typeof closeVehicleLinkModal === 'function') closeVehicleLinkModal();
		} else { toast('Lütfen bir taşıt seçin.', "warn"); }
	});
    document.getElementById('cancel-vehicle-link')?.addEventListener('click', () => {
		if (vehExpenseCheck) vehExpenseCheck.checked = false;
		tempLinkedVehicleId = null;
		if (typeof updateLinkedVehicleInfo === 'function') updateLinkedVehicleInfo();
		if (typeof closeVehicleLinkModal === 'function') closeVehicleLinkModal();
	});

    document.addEventListener('click', function(event) {
		const settingsMenu = document.getElementById('settings-menu');
        const notificationsMenu = document.getElementById('notifications-dropdown');
        const filterContainer = document.getElementById('filter-container');
        const filterMenu = document.getElementById('filter-menu');
        const filterCategoryList = document.getElementById('filter-category-list');

		if (settingsMenu && settingsMenu.classList.contains('on') &&
            !settingsMenu.contains(event.target) &&
            !event.target.closest('#settings-btn')) {
                if (typeof closeSettingsMenu === 'function') closeSettingsMenu();
        }

        if (notificationsMenu && notificationsMenu.classList.contains('on') &&
            !notificationsMenu.contains(event.target) &&
            !event.target.closest('#notification-bell')) {
                if (typeof closeNotificationsDropdown === 'function') closeNotificationsDropdown();
        }

        if (filterContainer && filterMenu && filterContainer.classList.contains('on') &&
            !filterContainer.contains(event.target) &&
             !event.target.closest('#filter-category-list')) {

            if (filterCategoryList && filterCategoryList.classList.contains('show')) {
                 filterCategoryList.classList.remove('show');
                 filterMenu.classList.remove('is-blurred');
            }
            if (typeof closeFilterMenu === 'function') closeFilterMenu();
        }
        
        setTimeout(applyBodyLock, 0);
	});

    document.addEventListener('keydown', function(event) {
		if (event.key === "Escape" && isCategorySelectorOpen) {
			if (typeof toggleCategorySelector === 'function') toggleCategorySelector(false);
		}
	});

    const obs = new MutationObserver(applyBodyLock);
    document.querySelectorAll('.modal').forEach(m => obs.observe(m, { attributes: true, attributeFilter: ['class'] }));
    applyBodyLock();
});
function handlePurchaseMethodChange() {
    const method = document.querySelector('input[name="purchase_method"]:checked').value;
    const purchaseInstallmentsWrap = document.getElementById('purchase-installments-wrap');
    const jointPurchaseWrap = document.getElementById('joint-purchase-wrap');
    const personWrap = document.getElementById('person-wrap');

    const firstPaymentDateInput = document.getElementById('purchase_first_payment_date');

	if(purchaseInstallmentsWrap) purchaseInstallmentsWrap.style.display = method === 'vadeli' ? 'grid' : 'none';
    if(jointPurchaseWrap) jointPurchaseWrap.style.display = method === 'ortakli' ? 'flex' : 'none';
    if(personWrap) personWrap.style.display = method === 'vadeli' ? 'block' : 'none';

	if(method === 'ortakli') {
        if (typeof generateJointPartnerInputs === 'function') generateJointPartnerInputs();
        if (typeof updateJointPurchaseCalculations === 'function') updateJointPurchaseCalculations();
    } else if (method === 'vadeli' && firstPaymentDateInput && !firstPaymentDateInput.value) {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        firstPaymentDateInput.value = `${yyyy}-${mm}-${dd}`;
    }
}

function handleSaleTypeChange() {
    const type = document.querySelector('input[name="sale_type"]:checked').value;
    const installmentsWrap = document.getElementById('installments-wrap');
    if (installmentsWrap) installmentsWrap.style.display = type === 'vadeli' ? 'grid' : 'none';
}

function updateJointPurchaseCalculations() {
    const totalAmount = parseN(document.getElementById('purchase_amount').value);
    const allAmountInputs = Array.from(document.querySelectorAll('#joint-partners-inputs .joint-partner-amount'));
    const jointTotalCheckEl = document.getElementById('joint-total-check');

    if (totalAmount <= 0) {
        allAmountInputs.forEach(input => {
            const percentageSpan = input.closest('.partner-row').querySelector('.partner-percentage');
            if (percentageSpan) percentageSpan.textContent = '% 0.00';
        });
        if(jointTotalCheckEl) {
            jointTotalCheckEl.style.color = 'var(--muted)';
            jointTotalCheckEl.innerHTML = `Toplam Kontrol<br>(${fmt(0)} / ${fmt(totalAmount)})`;
        }
        return;
    }

    let manuallyEnteredSum = 0;
    let autoFillFields = [];

    allAmountInputs.forEach(input => {
        if (input.dataset.isAutoFilled === 'true') {
            autoFillFields.push(input);
        } else {
            manuallyEnteredSum += parseN(input.value);
        }
    });
    if (autoFillFields.length === 1) {
        const fieldToAutoFill = autoFillFields[0];
        const remaining = totalAmount - manuallyEnteredSum;

        if (remaining >= 0) {
            fieldToAutoFill.value = remaining.toLocaleString('tr-TR', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            });
        } else {
            fieldToAutoFill.value = '0,00';
        }
    }

    let currentTotal = 0;
    allAmountInputs.forEach(input => {
        const amount = parseN(input.value);
        currentTotal += amount;
        const percentageSpan = input.closest('.partner-row').querySelector('.partner-percentage');
        if (percentageSpan) {
            const percentage = totalAmount > 0 ? (amount / totalAmount) * 100 : 0;
            percentageSpan.textContent = `% ${percentage.toFixed(2)}`;
        }
    });
    const isTotalCorrect = Math.abs(currentTotal - totalAmount) < 0.01;

    if (jointTotalCheckEl) {
        jointTotalCheckEl.style.color = isTotalCorrect ? 'var(--green)' : 'var(--danger-red)';
        jointTotalCheckEl.innerHTML = `Toplam: ${fmt(currentTotal)} / ${fmt(totalAmount)} <br> ${isTotalCorrect ? '(Eşleşti)' : '(Eşleşmedi)'}`;
    }
}

function onPendingScheduleChange(){
    const hint = document.getElementById('pending-sel-hint');
    if(!hint) return;
    const schId = Number(document.getElementById('pending-schedule-select').value);
    const sch = data.schedules.find(s=>s.id === schId);
    if(sch){
        const nextInst = sch.installments.find(i=>i.status === 'bekleniyor');
        hint.textContent = nextInst ? `Sonraki taksit: ${fmt(nextInst.amount)} - ${fdate(nextInst.due_date)}` : '';
    } else {
        hint.textContent = '';
    }
}

function quickAddPerson(callback) {
    const name = prompt("Yeni cari adını girin:");
    if (name && name.trim()) {
        const newPerson = { id: nextId('person'), name: name.trim(), type: 'normal' };
        data.persons.push(newPerson);
		save();
        if (typeof updateAllPersonDropdowns === 'function') updateAllPersonDropdowns();
        toast(`${name} eklendi.`);

        if (callback) {
            callback(newPerson.id);
        }
    }
}

function sanitizeCategoryKey(name) {
    return name.trim().toLowerCase()
        .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ı/g, 'i')
        .replace(/ö/g, 'o').replace(/ç/g, 'c')
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');
}

async function saveNewCategory() {
    const nameInput = document.getElementById('new-category-name');
    const groupSelect = document.getElementById('new-category-group');
    const name = nameInput.value.trim();
    const group = groupSelect.value;

    if (!name) {
        toast("Kategori adı boş olamaz.", "err");
        return;
    }

    const key = sanitizeCategoryKey(name);
    if (!key) {
        toast("Geçerli bir kategori adı girin.", "err");
        return;
    }

    const systemCategories = [...getCategoriesByGroup('gelir'), ...getCategoriesByGroup('gider')];
    if (systemCategories.includes(key)) {
        toast("Bu kategori sistemde zaten mevcut.", "err");
        return;
    }

    if (data.userCategories.gelir[key] || data.userCategories.gider[key]) {
        toast("Bu kategoriyidaha önce eklediniz.", "err");
        return;
    }

    data.userCategories[group][key] = name;
    await save();
    toast(`'${name}' kategorisi eklendi.`, "ok");
    nameInput.value = '';
    if (typeof rebuildMainCategorySelector === 'function') rebuildMainCategorySelector();
}

function confirmCategoryDeletion(keyToDelete) {
    if (!keyToDelete) return;

    const isCategoryInUse = data.transactions.some(tx => tx.category === keyToDelete);
    if (isCategoryInUse) {
        toast("Seçilen İşlem Türünde Değer Bulunmaktadır, Silinemez", "err");
        return;
    }

    const categoryName = data.userCategories.gelir[keyToDelete] || data.userCategories.gider[keyToDelete];
    if (typeof showConfirm === 'function') showConfirm(`'${categoryName}' kategorisini silmek istediğinizden emin misiniz?`, () => {
        deleteUserCategory(keyToDelete);
    });
}

async function deleteUserCategory(key) {
    let group = null;
    if (data.userCategories.gelir[key]) {
        delete data.userCategories.gelir[key];
        group = 'gelir';
    } else if (data.userCategories.gider[key]) {
        delete data.userCategories.gider[key];
        group = 'gider';
    }

    if (group) {
        await save();
        toast("Kategori başarıyla silindi.", "ok");
        if (typeof rebuildMainCategorySelector === 'function') rebuildMainCategorySelector();
        if (typeof showDeletableSubcategories === 'function') showDeletableSubcategories(group);
    }
}

function deleteCari(id) {
    const hasTransactions = data.transactions.some(tx => tx.person_id === id && tx.status !== 'iptal');
    if (hasTransactions) {
        toast("Bu kişiye ait işlem kayıtları bulunduğu için silinemez.", "err");
        return;
    }

    if (typeof showConfirm === 'function') showConfirm("Bu cariyi silmek istediğinizden emin misiniz?", () => {
        data.persons = data.persons.filter(p => p.id !== id);
        save();
        if (typeof renderCariList === 'function') renderCariList();
        if (typeof updateAllPersonDropdowns === 'function') updateAllPersonDropdowns();
        toast("Cari başarıyla silindi.", "ok");
    });
}


function handleCategoryButtonClick(e) {
    e.stopPropagation();
    const btn = e.currentTarget;
    const value = btn.dataset.value;
    const text = btn.textContent;
    document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    document.getElementById('selected-category').value = value;
    document.getElementById('category-trigger-value').textContent = text;
    document.getElementById('category-trigger-value').classList.add('selected');
    document.getElementById('category-trigger-value').classList.remove('placeholder');
    if (typeof categoryChanged === 'function') categoryChanged();

    setTimeout(() => { if (typeof toggleCategorySelector === 'function') toggleCategorySelector(false); }, 200);
}

function applyFilter(e) {
    if (e) e.preventDefault();
    const start = document.getElementById('filter-start-date').value;
    const end = document.getElementById('filter-end-date').value;

    currentFilter = { start, end, group: activeCategoryGroup };
    if(document.activeElement.id !== 'filter-start-date' && document.activeElement.id !== 'filter-end-date'){
        activeDateFilter = null;
    }

    if (typeof updateActiveFilterButtons === 'function') updateActiveFilterButtons();

    let filtered = data.transactions.filter(t => {
        if (activeCategoryGroup) {
            const groupCategories = getCategoriesByGroup(activeCategoryGroup);
            const userGroupCategories = Object.keys(data.userCategories[activeCategoryGroup] || {});
            const allCategories = [...groupCategories, ...userGroupCategories]; 
            if (!allCategories.includes(t.category)) {
                 return false;
            }
        }

        if (start && t.date < start) return false;
        if (end && t.date > end) return false;

        return true;
    });
    if (typeof renderTxList === 'function') renderTxList(filtered);
    if (typeof closeFilterMenu === 'function') closeFilterMenu();
}

function clearFilter() {
    currentFilter = null;
    activeDateFilter = null;
    activeCategoryGroup = null;

    if (typeof updateActiveFilterButtons === 'function') updateActiveFilterButtons();
    const filterForm = document.getElementById('filter-form');
    if (filterForm) filterForm.reset();
    if (typeof renderTxList === 'function') renderTxList();
    if (typeof closeFilterMenu === 'function') closeFilterMenu();
}