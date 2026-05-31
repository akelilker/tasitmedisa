/* ====================================================================
   DOSYA: script-ui-reports.js
   Açıklama: Raporlar ve analizler
   (GÜNCELLEME v35: Ortak bakiye renk mantığı düzeltildi)
   ==================================================================== */

function initReports() {
    document.querySelectorAll('#tabbar .tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('#tabbar .tab').forEach(t => t.classList.remove('on'));
            tab.classList.add('on');
            document.querySelectorAll('.report').forEach(r => r.classList.remove('on'));
            document.getElementById('report-' + tab.dataset.t).classList.add('on');
            switch(tab.dataset.t){
				case 'tasit-karlilik': renderTasitKarlilik(); break;
				case 'ciro': renderCiro(); break;
                case 'tasitlar': renderTasitlar(); break;
                case 'ortaklar': renderOrtaklar(); break;
                case 'net': renderNetReport(); break;
            }
        });
    });
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const plStart = document.getElementById('pl-start');
    const plEnd = document.getElementById('pl-end');
    plStart.valueAsDate = firstDay;
    plEnd.valueAsDate = today;
    document.getElementById('report-start-date-text').textContent = fdate(firstDay);
    document.getElementById('report-end-date-text').textContent = fdate(today);

    document.getElementById('report-start-date-text').onclick = () => plStart.showPicker?.();
    document.getElementById('report-end-date-text').onclick = () => plEnd.showPicker?.();

    plStart.onchange = () => document.getElementById('report-start-date-text').textContent = fdate(plStart.value);
    plEnd.onchange = () => document.getElementById('report-end-date-text').textContent = fdate(plEnd.value);

    renderAylikDurum();
}

function renderAylikDurum() {
    const start = new Date(document.getElementById('pl-start').value);
    const end = new Date(document.getElementById('pl-end').value);
    end.setHours(23, 59, 59, 999);
    const txs = data.transactions.filter(t => {
        const d = new Date(t.date);
        return t.status !== 'iptal' && d >= start && d <= end && isPL(t.category);
    });
    const income = txs.filter(t => getCashFlowType(t.category) === 'in').reduce((sum, t) => sum + t.amount, 0);
    const expense = txs.filter(t => getCashFlowType(t.category) === 'out').reduce((sum, t) => sum + t.amount, 0);
    const profit = income - expense;
    document.getElementById('pl-result').innerHTML = `
        <div class="stats" style="flex-direction:column; gap:8px;">
            <div class="stat"><div>Gelirler</div><div class="sv">${fmt(income)}</div></div>
            <div class="stat"><div>Giderler</div><div class="sv neg">${fmt(expense)}</div></div>
            <div class="stat"><div>Net Kâr/Zarar</div><div class="sv ${profit < 0 ? 'neg' : ''}">${fmt(profit)}</div></div>
        </div>`;
}

function renderTasitKarlilik() {
    const reportEl = document.getElementById('tasit-karlilik-result');
    const vehiclesToReport = data.vehicles.filter(v => v.type === 'owned' && ['stokta', 'satildi'].includes(v.status));

    if (vehiclesToReport.length === 0) {
        reportEl.innerHTML = '<p style="text-align:center; color: var(--muted);">Raporlanacak araç bulunmuyor.</p>';
        return;
    }

    let html = '<table><thead><tr><th>Plaka</th><th>Alış</th><th>Masraf</th><th>Satış</th><th>Net Kâr</th></tr></thead><tbody>';
    vehiclesToReport.sort((a, b) => new Date(b.purchase_date) - new Date(a.purchase_date)).forEach(v => {
        const totalExpenses = getVehicleExpenses(v.id);
        if (v.status === 'satildi') {
            const netProfit = (v.sale_price || 0) - v.purchase_price - totalExpenses;
            html += `
                <tr class="sold-vehicle-row">
                    <td>${v.plate}</td>
                    <td>${fmt(v.purchase_price)}</td>
                    <td>${fmt(totalExpenses)}</td>
                    <td>${fmt(v.sale_price || 0)}</td>
                    <td class="${netProfit >= 0 ? 'amount-positive' : 'amount-negative'}">${fmt(netProfit)}</td>
                </tr>`;
        } else {
            const currentCost = v.purchase_price + totalExpenses;
            html += `
                <tr>
                    <td>${v.plate}</td>
                    <td>${fmt(v.purchase_price)}</td>
                    <td>${fmt(totalExpenses)}</td>
                    <td>-</td>
                    <td class="${currentCost > 0 ? 'amount-negative' : ''}">${fmt(-currentCost)} (Maliyet)</td>
                </tr>`;
        }
    });
    html += '</tbody></table>';
    reportEl.innerHTML = html;
}

function renderCiro() {
    const sales = data.transactions.filter(t => t.category === 'tasit-satisi' && t.status !== 'iptal');
    const totalSales = sales.reduce((sum, t) => sum + t.amount, 0);
    const commissions = data.transactions.filter(t => t.category === 'komisyon' && t.status !== 'iptal');
    const totalCommissions = commissions.reduce((sum, t) => sum + t.amount, 0);
    const totalCiro = totalSales + totalCommissions;
    document.getElementById('ciro-result').innerHTML = `
        <p>Toplam Brüt Satış: <strong>${fmt(totalSales)}</strong></p>
        <p>Toplam Komisyon: <strong>${fmt(totalCommissions)}</strong></p>
        <hr style="margin:8px 0; border-color: var(--br);">
        <p><strong>Toplam Ciro: ${fmt(totalCiro)}</strong></p>`;
}

function renderTasitlar() {
    const inStock = data.vehicles.filter(v => v.status === 'stokta');
    let stockHtml = '<h3>Stoktaki Araçlar</h3><table><thead><tr><th>Plaka</th><th>Model</th><th>Değer / Not</th><th>İşlem</th></tr></thead><tbody>';
    if (inStock.length === 0) {
        stockHtml += '<tr><td colspan="4" style="text-align:center;">Stokta araç bulunmuyor.</td></tr>';
    } else {
        inStock.forEach(v => {
            const valueOrNote = v.type === 'owned' ? fmt(v.purchase_price) : `Sahibi: ${data.persons.find(p => p.id === v.person_id)?.name || 'Bilinmiyor'}`;
            const typeLabel = v.type === 'consigned' ? '<span class="vehicle-type-label">KONSİNYE</span>' : '';
            const actionButton = v.type === 'consigned' ?
            `<button class="btn small sec" onclick="returnKonsinyeVehicle(${v.id})">İade Et</button>` : '';
            stockHtml += `<tr><td>${v.plate} ${typeLabel}</td><td>${v.name}</td><td>${valueOrNote}</td><td>${actionButton}</td></tr>`;
        });
    }
    stockHtml += '</tbody></table>';

    const sold = data.vehicles.filter(v => v.status === 'satildi' && v.type === 'owned');
    let soldHtml = '<h3 style="margin-top:20px;">Satış Karlılığı Analizi</h3><table><thead><tr><th>Plaka</th><th>Alış</th><th>Satış</th><th>Kâr/Zarar</th></tr></thead><tbody>';
    if(sold.length === 0){
        soldHtml += '<tr><td colspan="4" style="text-align:center;">Satılmış araç bulunmuyor.</td></tr>';
    } else {
        sold.forEach(v => {
            const profit = (v.sale_price || 0) - v.purchase_price;
            soldHtml += `<tr><td>${v.plate}</td><td>${fmt(v.purchase_price)}</td><td>${fmt(v.sale_price || 0)}</td><td class="${profit < 0 ? 'neg' : ''}">${fmt(profit)}</td></tr>`;
        });
    }
    soldHtml += '</tbody></table>';

    document.getElementById('stok-result').innerHTML = stockHtml + soldHtml;
}

function renderOrtaklar() {
    const partners = data.persons.filter(p => p.type === 'asli');
    let html = partners.map(p => {
        const sermaye = calculateSermayeBalance(p.id);
        const cari = calculateCariBalance(p.id);
        const total = sermaye + cari;

        // === GÖRSEL DÜZELTME (Bakiye Rengi) ===
        // Cari: < 0 (Biz borçluyuz) -> 'pos' (Yeşil)
        // Cari: > 0 (O borçlu) -> 'neg' (Kırmızı)
        return `<div class="cari-item">
            <div class="cari-item-name">${p.name} ${p.type === 'asli' ? ' (Ortak)' : ''}</div>
            <div class="p-bal-group">
                <div class="p-bal-sermaye">Sermaye: ${fmt(sermaye)}</div>
                <div class="p-bal-cari ${cari < 0 ? 'pos' : cari > 0 ? 'neg' : ''}">Cari: ${fmt(cari)}</div>
                <div class="p-bal-total" style="font-size:11px;">Toplam: ${fmt(total)}</div>
            </div>
        </div>`}).join('');
    // === GÖRSEL DÜZELTME SONU ===
    
    document.getElementById('cari-result').innerHTML = `<div class="cari-list">${html}</div>`;
}

function renderNetReport() {
    const { totalCash, stockValue, expected, payables, partnerBalance } = financeNumbers();
    const totalReceivables = expected;
    const totalPayables = payables;
    const assets = totalCash + stockValue + totalReceivables;
    const liabilities = totalPayables;
    const netWorth = assets - liabilities;
    document.getElementById('net-result').innerHTML = `
        <p>Kasa & Banka Toplamı: ${fmt(totalCash)}</p> 
        <p>Stok Değeri (Alış): ${fmt(stockValue)}</p>
        <p>Alacaklar: ${fmt(totalReceivables)}</p>
        <hr style="margin:8px 0; border-color: var(--br);">
        <p><strong>Toplam Varlıklar: ${fmt(assets)}</strong></p>
        <p>Borçlar: ${fmt(liabilities)}</p>
        <hr style="margin:8px 0; border-color: var(--br);">
        <p><strong>Net Sermaye: ${fmt(netWorth)}</strong></p>`;
}

function renderAudit() {
    const auditEl = document.getElementById('audit-result');
    if (!data.revisions || data.revisions.length === 0) {
        auditEl.innerHTML = '<p>Düzenleme geçmişi boş.</p>';
        return;
    }

    let html = data.revisions.sort((a,b) => b.id - a.id).map(r => {
        let categoryName = r.before?.category ? displayCategory(r.before.category) : 'Bilinmiyor';
        let action = r.action === 'iptal' ? 'İPTAL EDİLDİ' : (r.action === 'güncelleme' ? 'GÜNCELLENDİ' : r.action.toUpperCase());
        let actionClass = r.action === 'iptal' ? 'danger' : 'warn';
        const beforeJson = JSON.stringify(r.before, null, 2);
        const afterJson = JSON.stringify(r.after, null, 2);

        return `<div class="card" style="margin-bottom:8px; border-left: 4px solid var(--${actionClass}-red);">
            <p><strong>İşlem ID: ${r.tx_id}</strong> - ${fdate(r.timestamp)}</p>
            <p><strong>Eylem:</strong> <span style="color: var(--${actionClass}-red); font-weight: bold;">${action}</span> (${categoryName})</p>

            <details style="margin-top:5px; font-size:12px;"><summary>Detaylar</summary>
                <p><strong>Önceki Durum:</strong><br><pre>${beforeJson}</pre></p>
                <p><strong>Sonraki Durum:</strong><br><pre>${afterJson}</pre></p>
            </details>
        </div>`;
    }).join('');

    auditEl.innerHTML = html;
}