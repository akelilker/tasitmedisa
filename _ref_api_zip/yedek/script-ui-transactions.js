/* ====================================================================
   DOSYA: script-ui-transactions.js
   Açıklama: İşlem listesi, filtreleme ve işlem detayları
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
        const dateA = new Date(a.date);
        const dateB = new Date(b.date);
        if (dateB - dateA !== 0) return dateB - dateA;
        return (b.id || 0) - (a.id || 0);
    });

    let tableHTML = '<table><thead><tr><th>Tarih</th><th>Hesap</th><th>Açıklama</th><th>Tutar</th></tr></thead><tbody>';

    if (cashTxs.length === 0) {
        tableHTML += '<tr><td colspan="4" style="text-align:center;">İşlem bulunamadı.</td></tr>';
    } else {
        cashTxs.forEach(t => {
            const flow = getCashFlowType(t.category);
            let amount = t.amount;
            let accountName = 'Kasa';
            if (t.category === 'kasa-banka-virman') {
                accountName = `${t.source_account === 'banka' ? 'Banka' : 'Kasa'} → ${t.destination_account === 'banka' ? 'Banka' : 'Kasa'}`;
                amount = t.amount;
            } else {
                if (t.account === 'banka') accountName = 'Banka';
                if (flow === 'out') amount = -amount;
            }
            tableHTML += `
                <tr>
                    <td>${fdate(t.date)}</td>
                    <td>${accountName}</td>
                    <td>${displayCategory(t.category)} ${t.note ? `- ${t.note}` : ''}</td>
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
    detailEl.innerHTML = '<div class="persons"></div>';
    const container = detailEl.querySelector('.persons');
    if (data.persons.length === 0) {
		container.innerHTML = "<p>Kayıtlı cari bulunmuyor.</p>";
		return;
    }
	container.innerHTML = data.persons.map(p => {
        let balanceHtml;
        if (p.type === 'asli') {
            const sermaye = calculateSermayeBalance(p.id);
            const cari = calculateCariBalance(p.id);
            balanceHtml = `
                <div class="p-bal-group">
                    <div class="p-bal-sermaye">Sermaye: ${fmt(sermaye)}</div>
                    <div class="p-bal-cari ${cari > 0 ? 'pos' : cari < 0 ? 'neg' : ''}">Cari: ${fmt(cari)}</div>
                </div>
            `;
        } else {
            const balance = calculateCariBalance(p.id);
            balanceHtml = `<div class="p-bal ${balance > 0 ? 'pos' : balance < 0 ? 'neg' : ''}">${fmt(balance)}</div>`;
        }
		return `<div class="person" onclick="showPersonDetail(${p.id})">
            <div class="p-name">${p.name}</div>
            <div>${balanceHtml}</div>
        </div>`;
	}).join('');
}

function renderReceivablesGrid() {
    const detailEl = document.getElementById('fin-detail');
    const schedules = data.schedules.filter(s => s.type === 'alacak' && s.status !== 'tamamlandi' && s.status !== 'iptal');
    if(schedules.length === 0){
        detailEl.innerHTML = '<p>Bekleyen alacak bulunmuyor.</p>';
        return;
    }
    let html = '<table><thead><tr><th>Kişi</th><th>Kalan Tutar</th><th>Sonraki Ödeme</th></tr></thead><tbody>';
    schedules.forEach(s => {
        const p = data.persons.find(p => p.id === s.person_id);
        const nextPayment = s.installments.find(i => i.status === 'bekleniyor');
        html += `<tr style="cursor:pointer;" onclick="showReceivableDetail(${s.id})">
            <td>${p ? p.name : 'Bilinmiyor'}</td>
            <td>${fmt(s.remaining)}</td>
            <td>${nextPayment ? fdate(nextPayment.due_date) : 'YOK'}</td>
        </tr>`;
	});
    html += '</tbody></table>';
    document.getElementById('fin-detail').innerHTML = html;
}

function renderPayablesGrid() {
     const detailEl = document.getElementById('fin-detail');
    const schedules = data.schedules.filter(s => s.type === 'borc' && s.status !== 'tamamlandi' && s.status !== 'iptal');
    if(schedules.length === 0){
        detailEl.innerHTML = '<p>Vadesi gelmemiş borç bulunmuyor.</p>';
        return;
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let html = '<div class="cari-list">';
    schedules.forEach(s => {
        const p = data.persons.find(p => p.id === s.person_id);
        const nextPayment = s.installments.find(i => i.status === 'bekleniyor');
        let cardClass = '';
        if (nextPayment) {
            const dueDate = new Date(nextPayment.due_date);
            const timeDiff = dueDate.getTime() - today.getTime();
            const daysDiff = Math.round(timeDiff / (1000 * 3600 * 24));
            if (daysDiff <= 0) cardClass = 'danger';
            else if (daysDiff <= DEBT_ALERT_DAYS) cardClass = 'warn';
        }
        html += `
           <div class="cari-item ${cardClass}" onclick="showReceivableDetail(${s.id})">
               <div>
                   <span class="cari-item-name">${p ? p.name : 'Bilinmiyor'} (Borç)</span>
                   <div style="font-size:12px; color: var(--muted);">Sonraki Ödeme: ${nextPayment ? fdate(nextPayment.due_date) : 'YOK'}</div>
               </div>
               <div class="cari-item-balance neg">${fmt(s.remaining)}</div>
           </div>`;
    });
    html += '</div>';
    detailEl.innerHTML = html;
}

function showReceivableDetail(scheduleId) {
    const s = data.schedules.find(sch => sch.id === scheduleId);
    if(!s) return;
    const p = data.persons.find(p => p.id === s.person_id);
    let html = `<h3>${p.name} - Ödeme Planı</h3>
                <p><strong>Toplam:</strong> ${fmt(s.total_amount)} |
<strong>Ödenen:</strong> ${fmt(s.paid_amount)} | <strong>Kalan:</strong> ${fmt(s.remaining)}</p>
                <table style="margin-top:10px;"><thead><tr><th>#</th><th>Vade Tarihi</th><th>Tutar</th><th>Durum</th></tr></thead><tbody>`;
    s.installments.forEach((inst, index) => {
        html += `<tr><td>${index+1}</td><td>${fdate(inst.due_date)}</td><td>${fmt(inst.amount)}</td><td>${inst.status}</td></tr>`;
    });
    html += '</tbody></table>';
    document.getElementById('fin-detail').innerHTML = html;
}

function showPersonDetail(personId) {
    const p = data.persons.find(p => p.id === personId);
    if (!p) return;

    const sermaye = p.type === 'asli' ? calculateSermayeBalance(p.id) : 0;
    const cari = p.type === 'asli' ? calculateCariBalance(p.id) : calculateCariBalance(p.id);
    const total = sermaye + cari;

	let html = `<h3>${p.name} - Hesap Ekstresi</h3>`;
    if (p.type === 'asli') {
        html += `<p style="margin-bottom:6px;"><strong>Sermaye Bakiyesi: </strong><span class="${sermaye > 0 ? 'pos' : 'neg'}">${fmt(sermaye)}</span></p>`;
        html += `<p><strong>Cari Bakiye: </strong><span class="${cari > 0 ? 'pos' : 'neg'}">${fmt(cari)}</span></p>`;
        html += `<p style="margin-top:10px;"><strong>Toplam Bakiye: </strong><span class="${total > 0 ? 'pos' : 'neg'}">${fmt(total)}</span></p>`;
    } else {
        html += `<p><strong>Güncel Bakiye: </strong><span class="${cari > 0 ? 'pos' : 'neg'}">${fmt(cari)}</span></p>`;
    }

    html += `<table style="margin-top:10px;"><thead><tr><th>Tarih</th><th>İşlem</th><th>Tutar</th></tr></thead><tbody>`;
	const txs = data.transactions.filter(t => t.person_id === personId && t.status !== 'iptal').sort((a,b) => new Date(a.date) - new Date(b.date));
    txs.forEach(tx => {
        let amount = 0;
        if (tx.category === 'asli-ortak-sermaye-giris') { amount = tx.amount; }
        else if (tx.category === 'asli-ortak-sermaye-cikis') { amount = -tx.amount; }
        else if (tx.category === 'verilen-borc') { amount = tx.amount; }
        else if (tx.category === 'alinan-borc') { amount = -tx.amount; }
        else if (tx.category === 'tasit-alimi' && tx.note?.includes('Ortak Payı')) { amount = tx.amount; }
        else {
             const flow = getCashFlowType(tx.category);
             if (flow === 'in') { amount = -tx.amount; }
             else if (flow === 'out') { amount = tx.amount; }
             else { amount = 0; }
        }
        html += `<tr><td>${fdate(tx.date)}</td><td>${displayCategory(tx.category)}</td><td class="${amount > 0 ? 'amount-positive' : amount < 0 ? 'amount-negative' : ''}">${fmt(amount)}</td></tr>`;
    });
    if (txs.length === 0) {
        html += '<tr><td colspan="3" style="text-align:center;">İşlem bulunamadı.</td></tr>';
    }
    html += '</tbody></table>';
    document.getElementById('fin-detail').innerHTML = html;
}

function renderTxList(filteredData = null) {
	const listEl = document.getElementById("tx-list");
    if (!listEl) return;
	let txsToRender = filteredData || data.transactions;

    txsToRender = txsToRender.filter(tx => tx.category !== 'tasit-satis-kari' && tx.status === 'aktif' && !tx.virtual)
                            .sort((a, b) => {
                                const dateA = new Date(a.date);
                                const dateB = new Date(b.date);
                                if (dateB - dateA !== 0) return dateB - dateA;
                                return (b.id || 0) - (a.id || 0);
                            });

    if (txsToRender.length === 0) {
		listEl.innerHTML = '<p style="text-align:center; color: var(--muted);">Gösterilecek işlem bulunamadı.</p>';
		return;
    }

    const NON_EDITABLE_CATEGORIES = new Set(['tasit-alimi', 'tasit-satisi', 'kasa-banka-virman']);
	listEl.innerHTML = txsToRender.map(tx => {
		const p = tx.person_id ? data.persons.find(p => p.id === tx.person_id) : null;
		const v = tx.vehicle_id ? data.vehicles.find(v => v.id === tx.vehicle_id) : null;
		const isOut = getCashFlowType(tx.category) === 'out';
		let title = displayCategory(tx.category);
		if (p) title += ` - ${p.name}`;
		if (v) title += ` - ${v.plate}`;
        const canEdit = !NON_EDITABLE_CATEGORIES.has(tx.category);

		return `<div class="record-card">
                    <div class="record-card-left">
                        <div class="info-line-1">${fdate(tx.date)}</div>
                        <div class="info-line-2">${title}</div>
                        ${tx.note ? `<div class="description-text">${tx.note}</div>` : ''}
                    </div>
                    <div class="record-card-right">
                        <div class="amount ${isOut ? 'amount-negative' : 'amount-positive'}">${fmt(tx.amount)}</div>
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
    const sel = document.getElementById('vehicle-expense-select');
    sel.innerHTML = '<option value="">Taşıt seçiniz...</option>';
    data.vehicles.filter(v => v.status === 'stokta').forEach(v => {
        const typeLabel = v.type === 'consigned' ? ' (Konsinye)' : '';
        sel.innerHTML += `<option value="${v.id}">${v.plate} - ${v.name}${typeLabel}</option>`;
    });
    if(tempLinkedVehicleId) sel.value = tempLinkedVehicleId;
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
    const container = document.getElementById('filter-container');
    if (!container) return;
    container.classList.toggle('on');
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
        'Kasa/Banka': 'transfer'
    };
    list.innerHTML = '';

    for (const name in categories) {
        const groupName = categories[name];
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'filter-category-item';
        button.textContent = name;
        // data-group için null değerini string 'null' olarak ata
        button.dataset.group = groupName === null ? 'null' : groupName;
        button.addEventListener('click', () => {
             // Tıklanan butonun groupName'ini al (string 'null' ise null yap)
            activeCategoryGroup = button.dataset.group === 'null' ? null : button.dataset.group;
            list.querySelectorAll('.filter-category-item').forEach(btn => {
                // Karşılaştırmayı dataset.group üzerinden yap
                btn.classList.toggle('selected', btn.dataset.group === button.dataset.group);
            });
            list.classList.remove('show');
            menu.classList.remove('is-blurred');
             // Seçimi tetikleyiciye yaz (opsiyonel)
            trigger.querySelector('span').textContent = name;
        });
        // Başlangıçta "Tümü" seçili olsun
        if (groupName === null) button.classList.add('selected');

        list.appendChild(button);
    }
    // Başlangıçta trigger'a "Tümü" yaz
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

