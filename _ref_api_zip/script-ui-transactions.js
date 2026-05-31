/* ====================================================================
   DOSYA: script-ui-transactions.js
   Açıklama: İşlem listesi, filtreleme ve işlem detayları
   (GÜNCELLEME v64 - Ekstreye Planlı Borçları Dahil Etme)
   ==================================================================== */

function renderCashDetail() {
    const detailEl = document.getElementById('fin-detail');
    const kasaBalance = calculateKasaBalance();
    const bankaBalance = calculateBankaBalance();
    const totalCash = kasaBalance + bankaBalance;

    let html = `
        <div class="cash-detail-container">
            <div class="cash-summary">
                <div class="cash-summary-item ${kasaBalance < 0 ? 'neg' : ''}">
                    KASA<br><strong>${fmt(kasaBalance)}</strong>
                </div>
                <div class="cash-summary-item ${bankaBalance < 0 ? 'neg' : ''}">
                    BANKA<br><strong>${fmt(bankaBalance)}</strong>
                </div>
                <div class="cash-summary-item total ${totalCash < 0 ? 'neg' : ''}">
                    TOPLAM<br><strong>${fmt(totalCash)}</strong>
                </div>
            </div>

            <div class="cash-filter-wrap">
                <div class="cash-filter">
                    <button class="cash-filter-btn active" data-filter="all" onclick="filterCashTransactions('all')">Tümü</button>
                    <button class="cash-filter-btn" data-filter="banka" onclick="filterCashTransactions('banka')">Banka</button>
                    <button class="cash-filter-btn" data-filter="kasa" onclick="filterCashTransactions('kasa')">Kasa</button>
                </div>
            </div>
        </div>

        <div id="cash-transactions-table"></div>
    `;

    detailEl.innerHTML = html;
    filterCashTransactions('all');
}

function filterCashTransactions(filter) {
    document.querySelectorAll('.cash-filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === filter);
    });

    let cashTxs = data.transactions.filter(t => {
        if (t.status === 'iptal') return false;
        const flowType = getCashFlowType(t.category);
        if (flowType === 'neutral' && t.category !== 'kasa-banka-virman') return false;

        if (t.category === 'kasa-banka-virman') {
             if (filter === 'banka') return t.source_account === 'banka' || t.destination_account === 'banka';
             if (filter === 'kasa') return t.source_account === 'kasa' || t.destination_account === 'kasa';
             return true;
        }

        if (filter === 'all') return true;
        if (filter === 'banka') return t.account === 'banka';
        if (filter === 'kasa') return (!t.account || t.account === 'kasa');
        return false;
    }).sort((a, b) => {
        if (b.date > a.date) return 1;
        if (b.date < a.date) return -1;
        return (b.id || 0) - (a.id || 0);
    });

    let tableHTML = '<table><thead><tr><th>Tarih</th><th>Açıklama</th><th>Tutar</th></tr></thead><tbody>';

    if (cashTxs.length === 0) {
        tableHTML += '<tr><td colspan="3" style="text-align:center;">İşlem bulunamadı.</td></tr>';
    } else {
        cashTxs.forEach(t => {
            const flow = getCashFlowType(t.category);
            let amount = t.amount;
            
            if (t.category === 'kasa-banka-virman') {
                amount = t.amount;
            } else {
                if (flow === 'out') amount = -amount;
            }
            
            let description = displayCategory(t.category);
            if (t.note) description += ` - ${t.note}`;

            tableHTML += `
                <tr>
                    <td>${fdate(t.date)}</td>
                    <td>${description}</td>
                    <td class="${amount > 0 ? 'amount-positive' : amount < 0 ? 'amount-negative' : ''}">${fmt(amount)}</td>
                </tr>
            `;
        });
    }
    tableHTML += '</tbody></table>';
    document.getElementById('cash-transactions-table').innerHTML = tableHTML;
}

function showVeriDetail(view) {
    currentVeriDetail = view;
    document.querySelectorAll('#modal-veri .detail-tabs .tab').forEach(t => t.classList.toggle('on', t.dataset.view === view));
    document.getElementById('veri-kayit-view').style.display = view === 'kayit' ? 'flex' : 'none';
    document.getElementById('veri-hareketler-view').style.display = view === 'hareketler' ? 'flex' : 'none';

    const titleEl = document.querySelector("#modal-veri .m-title");
    if (!titleEl) return;

    if(view === 'hareketler') {
        renderTxList();
        titleEl.textContent = "İşlem Geçmişi";
    } else {
        titleEl.textContent = "İşlem Girişi";
    }
}

function renderPersonsGrid() {
    const detailEl = document.getElementById('fin-detail');
    detailEl.innerHTML = '';

    const partners = data.persons.filter(p => p.type === 'asli');
    if (partners.length > 0) {
         const partnersTitle = document.createElement('h3');
         partnersTitle.textContent = 'Ortaklar';
         partnersTitle.style.color = 'var(--theme-color)';
         partnersTitle.style.marginBottom = '10px';
         detailEl.appendChild(partnersTitle);

         const statsContainer = document.createElement('div');
         statsContainer.className = 'stats stats-5col';

         partners.forEach(p => {
             const totalBal = calculatePartnerBalance(p.id);
             const stat = document.createElement('div');
             stat.className = 'stat';
             stat.onclick = () => showPersonDetail(p.id, true);
             
             stat.innerHTML = `
                <div class="sl">${p.name}</div>
                <div class="sv ${totalBal < 0 ? 'neg' : totalBal > 0 ? 'pos' : ''}">${fmt(totalBal)}</div>
             `;
             statsContainer.appendChild(stat);
         });
         detailEl.appendChild(statsContainer);
    }

    const inlineDetailContainer = document.createElement('div');
    inlineDetailContainer.id = 'person-inline-detail';
    inlineDetailContainer.style.marginTop = '20px';
    inlineDetailContainer.style.marginBottom = '20px';
    inlineDetailContainer.style.display = 'none';
    inlineDetailContainer.style.borderTop = '1px solid var(--br)';
    inlineDetailContainer.style.paddingTop = '15px';
    detailEl.appendChild(inlineDetailContainer);

    const others = data.persons.filter(p => p.type !== 'asli').filter(p => Math.abs(calculateCariBalance(p.id)) > 0.01);
     if (others.length > 0) {
         const othersTitle = document.createElement('h3');
         othersTitle.textContent = 'Diğer Hesaplar';
         othersTitle.style.color = 'var(--muted)';
         othersTitle.style.fontSize = '15px';
         othersTitle.style.marginTop = '25px';
         othersTitle.style.marginBottom = '10px';
         othersTitle.style.borderBottom = '1px solid var(--br)';
         detailEl.appendChild(othersTitle);

         const statsContainer = document.createElement('div');
         statsContainer.className = 'stats stats-5col';

         others.sort((a, b) => a.name.localeCompare(b.name)).forEach(p => {
             const bal = calculateCariBalance(p.id);
             const stat = document.createElement('div');
             stat.className = 'stat';
             stat.onclick = () => showPersonDetail(p.id, true);
             
             stat.innerHTML = `
                <div class="sl">${p.name}</div>
                <div class="sv ${bal < 0 ? 'neg' : bal > 0 ? 'pos' : ''}">${fmt(bal)}</div>
             `;
             statsContainer.appendChild(stat);
         });
         detailEl.appendChild(statsContainer);
     } else if (partners.length === 0) {
         detailEl.innerHTML = '<p style="text-align:center; padding: 20px; color:var(--muted);">Kayıtlı cari hesap bulunmuyor.</p>';
     }
}

function renderReceivablesGrid() {
    const detailEl = document.getElementById('fin-detail');
    const receivablePersons = [];

    data.persons.forEach(p => {
        if (p.type === 'asli') return;

        const bal = calculateCariBalance(p.id);
        if (bal > 0.01) {
             let nearestDueDate = null;
             const personSchedules = data.schedules.filter(s => s.person_id === p.id && s.type === 'alacak' && s.status !== 'tamamlandi' && s.status !== 'iptal');
             personSchedules.forEach(s => {
                 const next = s.installments.find(i => i.status === 'bekleniyor');
                 if (next) {
                     if (!nearestDueDate || new Date(next.due_date) < new Date(nearestDueDate)) {
                         nearestDueDate = next.due_date;
                     }
                 }
             });

             receivablePersons.push({
                 person: p,
                 balance: bal,
                 dueDate: nearestDueDate,
                 hasSchedule: personSchedules.length > 0,
                 mainScheduleId: personSchedules.length > 0 ? personSchedules[0].id : null
             });
        }
    });

    if (receivablePersons.length === 0) {
        detailEl.innerHTML = '<p style="text-align:center; padding: 20px;">Bekleyen alacak bulunmuyor.</p>';
        return;
    }

    receivablePersons.sort((a, b) => b.balance - a.balance);

    let html = '<div class="stats stats-5col">';

    receivablePersons.forEach(item => {
        const clickAction = item.hasSchedule && item.mainScheduleId ? 
                            `showReceivableDetail(${item.mainScheduleId})` : 
                            `showPersonDetail(${item.person.id}, true)`;
        
        html += `
           <div class="stat" onclick="${clickAction}" style="cursor:pointer;">
               <div class="sl">${item.person.name}</div>
               <div class="sv pos">${fmt(item.balance)}</div>
           </div>`;
    });
    html += '</div>';
    
    html += '<div id="person-inline-detail" style="margin-top:20px; display:none; border-top:1px solid var(--br); padding-top:15px;"></div>';
    
    detailEl.innerHTML = html;
}

function renderPayablesGrid() {
    const detailEl = document.getElementById('fin-detail');
    const payablePersons = [];

    data.persons.forEach(p => {
        if (p.type === 'asli') return;

        const bal = calculateCariBalance(p.id);
        if (bal < -0.01) {
             let nearestDueDate = null;
             const personSchedules = data.schedules.filter(s => s.person_id === p.id && s.type === 'borc' && s.status !== 'tamamlandi' && s.status !== 'iptal');
             personSchedules.forEach(s => {
                 const next = s.installments.find(i => i.status === 'bekleniyor');
                 if (next) {
                     if (!nearestDueDate || new Date(next.due_date) < new Date(nearestDueDate)) {
                         nearestDueDate = next.due_date;
                     }
                 }
             });

             payablePersons.push({
                 person: p,
                 balance: Math.abs(bal), 
                 dueDate: nearestDueDate,
                 hasSchedule: personSchedules.length > 0,
                 mainScheduleId: personSchedules.length > 0 ? personSchedules[0].id : null
             });
        }
    });

    if (payablePersons.length === 0) {
        detailEl.innerHTML = '<p style="text-align:center; padding: 20px;">Ödenecek borç bulunmuyor.</p>';
        return;
    }

    payablePersons.sort((a, b) => b.balance - a.balance);

    let html = '<div class="stats stats-5col">';

    payablePersons.forEach(item => {
        const clickAction = item.hasSchedule && item.mainScheduleId ? 
                            `showReceivableDetail(${item.mainScheduleId})` : 
                            `showPersonDetail(${item.person.id}, true)`;

        html += `
           <div class="stat" onclick="${clickAction}" style="cursor:pointer;">
               <div class="sl">${item.person.name}</div>
               <div class="sv neg">${fmt(item.balance)}</div>
           </div>`;
    });
    html += '</div>';
    
    html += '<div id="person-inline-detail" style="margin-top:20px; display:none; border-top:1px solid var(--br); padding-top:15px;"></div>';

    detailEl.innerHTML = html;
}

function showPersonDetail(personId, isInline = false) {
    const p = data.persons.find(p => p.id === personId);
    if (!p) return;

    const sermaye = p.type === 'asli' ? calculateSermayeBalance(p.id) : 0;
    const cari = calculateCariBalance(p.id);
    const total = sermaye + cari;

	let html = `<h3 style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <span>${p.name} - Hesap Ekstresi</span>
                    ${isInline ? '<span onclick="this.closest(\'#person-inline-detail\').style.display=\'none\'" style="cursor: pointer; font-size: 16px; color: var(--muted); line-height: 1; transition: color 0.2s ease, transform 0.2s ease; display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 50%; background: rgba(255,255,255,0.05);">x</span>' : ''}
                </h3>`;
                
    if (p.type === 'asli') {
        html += `<div style="display: flex; gap: 15px; margin-bottom: 15px; flex-wrap: wrap;">
                    <div><span style="color:var(--muted); font-size:13px;">Sermaye:</span> <span class="${sermaye > 0 ? 'pos' : 'neg'}">${fmt(sermaye)}</span></div>
                    <div><span style="color:var(--muted); font-size:13px;">Cari:</span> <span class="${cari < 0 ? 'neg' : cari > 0 ? 'pos' : ''}">${fmt(cari)}</span></div>
                    <div><span style="color:var(--text-color); font-weight:bold;">Toplam:</span> <span class="${total < 0 ? 'neg' : total > 0 ? 'pos' : ''}" style="font-weight:bold;">${fmt(total)}</span></div>
                 </div>`;
    } else {
        html += `<p style="margin-bottom: 15px;"><strong>Güncel Bakiye: </strong><span class="${cari < 0 ? 'neg' : cari > 0 ? 'pos' : ''}">${fmt(cari)}</span></p>`;
    }

    html += `<table><thead><tr><th>Tarih</th><th>İşlem</th><th>Tutar</th></tr></thead><tbody>`;
	
    // 1. NORMAl İŞLEMLERİ ÇEK
    const txs = data.transactions.filter(t => t.person_id === personId && t.status !== 'iptal');
    
    // 2. PLANLI BORÇLARI (SCHEDULES) ÇEK
    // Bu bölüm EKLENDİ: Artık veritabanındaki 'schedules' da listede görünecek
    const personSchedules = data.schedules.filter(s => s.person_id === personId && s.status !== 'tamamlandi' && s.status !== 'iptal');

    // Listeyi oluşturmak için geçici bir dizi yapalım
    let combinedList = [];

    // İşlemleri ekle
    txs.forEach(tx => {
        let amount = 0;
        if (tx.category === 'asli-ortak-sermaye-giris') amount = tx.amount;
        else if (tx.category === 'asli-ortak-sermaye-cikis') amount = -tx.amount;
        else if (tx.category === 'verilen-borc') amount = tx.amount;
        else if (tx.category === 'alinan-borc') amount = -tx.amount;
        else if (tx.category === 'tasit-alimi' && tx.account === 'not-applicable') amount = -tx.amount;
        else {
             const flow = getCashFlowType(tx.category);
             if (flow === 'in') amount = -tx.amount;
             else if (flow === 'out') amount = tx.amount;
        }
        combinedList.push({
            date: tx.date,
            desc: `${displayCategory(tx.category)} ${tx.note ? '('+tx.note+')' : ''}`,
            amount: amount,
            isSchedule: false
        });
    });

    // Planlı Borçları ekle
    personSchedules.forEach(s => {
        let amount = 0;
        // Alacak (Bize borçlu) -> Positive, Borç (Biz borçluyuz) -> Negative
        if (s.type === 'alacak') amount = s.remaining;
        else if (s.type === 'borc') amount = -s.remaining;

        // Eğer kalan miktar 0 değilse listeye ekle
        if (Math.abs(amount) > 0.01) {
            combinedList.push({
                date: s.created_at || new Date().toISOString().split('T')[0], // Eğer oluşturma tarihi yoksa bugünü al
                desc: `Planlı ${s.type === 'alacak' ? 'Alacak' : 'Borç'} (Kalan)`,
                amount: amount,
                isSchedule: true
            });
        }
    });

    // Tarihe göre sırala (Yeniden eskiye)
    combinedList.sort((a, b) => new Date(b.date) - new Date(a.date));

    let sumTotal = 0;
    
    combinedList.forEach(item => {
        sumTotal += item.amount;
        let rowStyle = item.isSchedule ? 'background: rgba(255,255,255,0.02); font-style: italic;' : '';
        
        html += `<tr style="${rowStyle}">
                    <td>${fdate(item.date)}</td>
                    <td>${item.desc}</td>
                    <td class="${item.amount > 0 ? 'amount-positive' : item.amount < 0 ? 'amount-negative' : ''}">${fmt(item.amount)}</td>
                 </tr>`;
    });

    // Fark Kontrolü (Eğer hala eski verilerden kaynaklı bir fark varsa)
    const targetBalance = (p.type === 'asli') ? total : cari;
    const difference = targetBalance - sumTotal;

    if (Math.abs(difference) > 0.01) {
        const devirRow = `<tr style="background: rgba(255,255,255,0.05);">
                            <td>-</td>
                            <td style="font-style:italic; color:var(--muted);">Devir / Önceki Dönem Farkı</td>
                            <td class="${difference > 0 ? 'amount-positive' : difference < 0 ? 'amount-negative' : ''}">${fmt(difference)}</td>
                          </tr>`;
        // Farkı listenin en başına eklemek için HTML string manipülasyonu veya array logic'i gerekebilir
        // Ancak basitlik için en alta değil, tablonun başına (tbody açılışından hemen sonraya) eklemek görsel olarak daha doğru
        // Bu yüzden yukarıdaki döngüden önce html stringine müdahale etmek yerine, farkı da toplama ekleyip en alta devir satırı olarak ekliyorum.
        // Veya daha temiz: Listede görünmeyen farkı "Devir" olarak en üste ekleyelim.
        
        // Yukarıdaki `html` stringi `tbody` ile bitiyor. Oraya ekleme yapamayız kolayca.
        // O yüzden `combinedList` mantığına geri dönelim.
        // Ama şu anki yapı karışık olmasın diye, fark satırını tablonun en altına (toplamdan önce) ekliyorum.
        
        html += `<tr style="background: rgba(255,255,255,0.05);">
                    <td>-</td>
                    <td style="font-style:italic; color:var(--muted);">Devir / Açılış Bakiyesi</td>
                    <td class="${difference > 0 ? 'amount-positive' : difference < 0 ? 'amount-negative' : ''}">${fmt(difference)}</td>
                 </tr>`;
    }

    if (combinedList.length === 0 && Math.abs(difference) < 0.01) {
        html += '<tr><td colspan="3" style="text-align:center;">Henüz işlem yok.</td></tr>';
    }

    html += '</tbody>';

    html += `<tfoot style="border-top: 2px solid var(--br); font-weight: bold;">
                <tr>
                    <td colspan="2" style="text-align: right;">GENEL TOPLAM:</td>
                    <td class="${targetBalance < 0 ? 'neg' : targetBalance > 0 ? 'pos' : ''}">${fmt(targetBalance)}</td>
                </tr>
             </tfoot>`;
    
    html += `</table>`;

    if (isInline) {
        const container = document.getElementById('person-inline-detail');
        if (container) {
            container.innerHTML = html;
            container.style.display = 'block';
            container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            return;
        }
    }
    document.getElementById('fin-detail').innerHTML = html;
}

function renderTxList(filteredData = null) {
	const listEl = document.getElementById("tx-list");
    if (!listEl) return;
	let txsToRender = filteredData || data.transactions;

    txsToRender = txsToRender.filter(tx => tx.category !== 'tasit-satis-kari' && tx.status === 'aktif' && !tx.virtual)
                            .sort((a, b) => {
                                if (b.date > a.date) return 1;
                                if (b.date < a.date) return -1;
                                return (b.id || 0) - (a.id || 0);
                            });

    if (txsToRender.length === 0) {
		listEl.innerHTML = '<p style="text-align:center; color: var(--muted);">Gösterilecek işlem bulunamadı.</p>';
		return;
    }

    const NON_EDITABLE_CATEGORIES = new Set([]);
	listEl.innerHTML = txsToRender.map(tx => {
		const p = tx.person_id ? data.persons.find(p => p.id === tx.person_id) : null;
		const v = tx.vehicle_id ? data.vehicles.find(v => v.id === tx.vehicle_id) : null;
		const isOut = getCashFlowType(tx.category) === 'out';
		
		const title = displayCategory(tx.category);
		
		let description = '';
		if (p) description += p.name;
		if (v) description += (description ? ' - ' : '') + v.plate;
		if (tx.note && tx.category !== 'tasit-alimi') {
			description += (description ? ' - ' : '') + tx.note;
		}
		
        const canEdit = !NON_EDITABLE_CATEGORIES.has(tx.category);

		return `<div class="record-card">
                    <div class="record-card-row-1">
                        <div class="info-title">${fdate(tx.date)} - ${title}</div>
                        <div class="amount ${isOut ? 'amount-negative' : 'amount-positive'}">${fmt(tx.amount)}</div>
                    </div>
                    <div class="record-card-row-2">
                        <div class="description-text">${description}</div>
                        <div class="action-icons">
                            ${canEdit ? `<button class="icon-btn edit" onclick="editTx(${tx.id})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>` : ''}
                            <button class="icon-btn del" onclick="cancelTx(${tx.id})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg></button>
                        </div>
                    </div>
                </div>`;
	}).join('');
}

function renderCariList() {
    const cariContainer = document.getElementById('cari-list-container');
    if (!cariContainer) return;
    cariContainer.innerHTML = data.persons.map(p => {
        return `<div class="cari-item">
            <span class="cari-item-name">${p.name} ${p.type === 'asli' ? ' (Ortak)' : ''}</span>
            <div class="action-icons">
                <button class="icon-btn edit" onclick="openCariEditModal(${p.id})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>
                <button class="icon-btn del" onclick="deleteCari(${p.id})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
            </div>
        </div>`}).join('');
}

function openVehicleLinkModal() {
    if (typeof fillVehicles === 'function') {
        fillVehicles(false);
    }
    const sel = document.getElementById('vehicle-expense-select');
    if(tempLinkedVehicleId && sel) {
        sel.value = tempLinkedVehicleId;
    }
    document.getElementById('modal-vehicle-select').classList.add('on');
    const wrap = document.getElementById('modal-veri')?.querySelector('.m-wrap');
    if(wrap) wrap.classList.add('modal-blurred');
}

function closeVehicleLinkModal() {
    document.getElementById('modal-vehicle-select').classList.remove('on');
    const wrap = document.getElementById('modal-veri')?.querySelector('.m-wrap');
    if(wrap) wrap.classList.remove('modal-blurred');
}

function updateLinkedVehicleInfo() {
    const infoEl = document.getElementById('linked-vehicle-info');
    if (tempLinkedVehicleId) {
        const v = data.vehicles.find(v => v.id === tempLinkedVehicleId);
        infoEl.textContent = v ? `Bağlantı: ${v.plate}` : '';
        const check = document.getElementById('is-vehicle-expense-check');
        if(check) check.checked = true;
    } else {
        infoEl.textContent = '';
        const check = document.getElementById('is-vehicle-expense-check');
        if(check) check.checked = false;
    }
}

function toggleFilterMenu() {
    document.getElementById('filter-container')?.classList.toggle('on');
    const container = document.getElementById('filter-container');
    if (!container) return;
    
    if (container.classList.contains('on')) {
        const startDateInput = document.getElementById('filter-start-date');
        const endDateInput = document.getElementById('filter-end-date');
        const startDateText = document.getElementById('filter-start-date-text');
        const endDateText = document.getElementById('filter-end-date-text');

        if (!startDateInput || !endDateInput || !startDateText || !endDateText) {
            console.error("Filtre menüsü için gerekli HTML elementleri bulunamadı. Lütfen index.html dosyanızı kontrol edin.");
            return;
        }

        const startDateDisplay = startDateText.closest('.filter-date-display');
        const endDateDisplay = endDateText.closest('.filter-date-display');
        if (!startDateInput.value) {
			const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
			startDateInput.valueAsDate = firstDayOfMonth;
        }
        if (!endDateInput.value) {
            endDateInput.valueAsDate = new Date();
        }

        startDateText.textContent = new Date(startDateInput.value).toLocaleDateString("tr-TR");
        endDateText.textContent = new Date(endDateInput.value).toLocaleDateString("tr-TR");
        if (startDateDisplay) startDateDisplay.onclick = () => startDateInput.showPicker?.();
        if (endDateDisplay) endDateDisplay.onclick = () => endDateInput.showPicker?.();
        startDateInput.onchange = () => {
            startDateText.textContent = new Date(startDateInput.value).toLocaleDateString("tr-TR");
        };
        endDateInput.onchange = () => {
            endDateText.textContent = new Date(endDateInput.value).toLocaleDateString("tr-TR");
        };
    }
}

function closeFilterMenu() {
    document.getElementById('filter-container')?.classList.remove('on');
}

function setupNewFilterCategorySelector() {
    const trigger = document.getElementById('filter-category-trigger');
    const list = document.getElementById('filter-category-list');
    const menu = document.getElementById('filter-menu');
    if (!trigger || !list || !menu) return;

    const categories = {
        'Tümü': null,
        'Gelirler': 'gelir',
        'Giderler': 'gider',
        'Taşıtlar': 'stok',
        'Cariler': 'cari',
        'Kasa/Banka': 'transfer',
        'Sermaye': 'sermaye'
    };
    list.innerHTML = '';

    for (const name in categories) {
        const groupName = categories[name];
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'filter-category-item';
        button.textContent = name;
        button.dataset.group = groupName === null ? 'null' : groupName;
        button.addEventListener('click', () => {
            activeCategoryGroup = button.dataset.group === 'null' ? null : button.dataset.group;
            list.querySelectorAll('.filter-category-item').forEach(btn => {
                btn.classList.toggle('selected', btn.dataset.group === button.dataset.group);
            });
            list.classList.remove('show');
            menu.classList.remove('is-blurred');
            trigger.querySelector('span').textContent = name;
            
            if (typeof applyFilter === 'function') applyFilter();
        });
        if (groupName === null) button.classList.add('selected');
        list.appendChild(button);
    }
    trigger.querySelector('span').textContent = 'Tümü';

    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isShown = list.classList.toggle('show');
        menu.classList.toggle('is-blurred', isShown);
    });
    document.addEventListener('click', (e) => {
        if (menu && list && !menu.contains(e.target) && list.classList.contains('show')) {
            list.classList.remove('show');
            menu.classList.remove('is-blurred');
        }
    });
}

function showReceivableDetail(scheduleId) {
    const s = data.schedules.find(item => item.id === scheduleId);
    if (!s) {
        toast("Kayıt bulunamadı.", "err");
        return;
    }
    const p = data.persons.find(person => person.id === s.person_id);
    const typeText = s.type === 'alacak' ? 'Alacak' : 'Borç';

    let html = `
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 15px;">
            <h3 style="margin-bottom: 0;">${p ? p.name : 'Bilinmiyor'} - ${typeText} Planı</h3>
            <button class="btn small sec" onclick="showFinanceDetail('${s.type === 'alacak' ? 'receivables' : 'payables'}')">← Geri</button>
        </div>
        <div style="background: rgba(255,255,255,0.05); padding: 10px; border-radius: 8px; margin-bottom: 15px; display: flex; justify-content: space-around;">
            <div style="text-align: center;">
                <div style="font-size: 12px; color: var(--muted);">Toplam</div>
                <div style="font-weight: bold; font-size: 16px;">${fmt(s.total_amount)}</div>
            </div>
            <div style="text-align: center;">
                <div style="font-size: 12px; color: var(--muted);">Ödenen</div>
                <div style="font-weight: bold; font-size: 16px; color: var(--green);">${fmt(s.paid_amount)}</div>
            </div>
            <div style="text-align: center;">
                <div style="font-size: 12px; color: var(--muted);">Kalan</div>
                <div style="font-weight: bold; font-size: 16px; color: var(--danger-red);">${fmt(s.remaining)}</div>
            </div>
        </div>
        <h4>Taksitler</h4>
        <table>
            <thead>
                <tr>
                    <th>Vade Tarihi</th>
                    <th>Tutar</th>
                    <th>Durum</th>
                </tr>
            </thead>
            <tbody>`;

    s.installments.forEach(inst => {
        let statusText = inst.status === 'tamamlandi' ? 'Ödendi' : 'Bekliyor';
        let statusColor = inst.status === 'tamamlandi' ? 'var(--green)' : (new Date(inst.due_date) < new Date() ? 'var(--danger-red)' : 'var(--orange)');
        
        const today = new Date(); today.setHours(0,0,0,0);
        const dueDate = new Date(inst.due_date); dueDate.setHours(0,0,0,0);
        if (inst.status !== 'tamamlandi' && dueDate.getTime() === today.getTime()) {
             statusColor = 'var(--orange)';
             statusText = 'Bugün';
        }

        html += `
            <tr>
                <td>${fdate(inst.due_date)}</td>
                <td>${fmt(inst.amount)}</td>
                <td style="color: ${statusColor}; font-weight: 500;">${statusText}</td>
            </tr>`;
    });

    html += `</tbody></table>`;

    document.getElementById('fin-detail').innerHTML = html;
}