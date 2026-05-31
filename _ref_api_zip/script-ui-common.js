/* ====================================================================
   DOSYA: script-ui-common.js
   Açıklama: Finansal durum render ve genel UI fonksiyonları
   (GÜNCELLEME v48 - Tıklayınca Açılan Arama)
   ==================================================================== */

function renderFinance() {
    // Yeni 5 değeri çek
    const { totalCash, stockValue, expected, payables, partnerBalance } = financeNumbers();

    // HTML'deki yeni ID'lere verileri bas
    document.getElementById("total-cash-balance").textContent = fmtShort(totalCash);
    document.getElementById("stock-value").textContent = fmtShort(stockValue);
    document.getElementById("expected").textContent = fmtShort(expected);
    document.getElementById("payables").textContent = fmtShort(payables);
    document.getElementById("payables").classList.toggle("neg", payables > 0);
    document.getElementById("partner-balance").textContent = fmtShort(partnerBalance);
    document.getElementById("partner-balance").classList.toggle("neg", partnerBalance < 0);

	if (currentFinanceDetail) {
        showFinanceDetail(currentFinanceDetail);
    }
}

function showFinanceDetail(view) {
    currentFinanceDetail = view;
    document.querySelectorAll('#modal-fin .detail-tabs .tab').forEach(t => t.classList.toggle('on', t.dataset.view === view));
    const detailEl = document.getElementById('fin-detail');
    detailEl.innerHTML = '';
        switch (view) {
        case 'cash':
            // Bu fonksiyon script-ui-transactions.js dosyasındadır
            if (typeof renderCashDetail === 'function') renderCashDetail();
            break;
        case 'tasitlar':
            // Bu fonksiyon artık bu dosyanın en altında
            renderOwnedVehiclesForFinance();
            break;
        case 'receivables':
            // Bu fonksiyon script-ui-transactions.js dosyasındadır
            if (typeof renderReceivablesGrid === 'function') renderReceivablesGrid();
            break;
        case 'payables':
            // Bu fonksiyon script-ui-transactions.js dosyasındadır
            if (typeof renderPayablesGrid === 'function') renderPayablesGrid();
            break;
        case 'cari':
            // Bu fonksiyon script-ui-transactions.js dosyasındadır
            if (typeof renderPersonsGrid === 'function') renderPersonsGrid();
            break;
    }
}

function updateStatusIndicator(status, text) {
    const el = document.getElementById('status-indicator');
    if(el){
        el.dataset.status = status;
        el.textContent = text;
    }
}

function updateStatusMessage(message, type = 'info', duration = 4000) {
    if (message && message.trim()) {
        toast(message, type === 'success' ? 'ok' : type);
    }
}

// === YENİ FONKSİYON: Finansal Tablo Arama ===
function filterFinanceVehicles(searchText) {
    const filter = searchText.toLowerCase();
    const rows = document.querySelectorAll('#fin-detail table tbody tr');
    
    rows.forEach(row => {
        const plate = row.cells[0]?.textContent.toLowerCase() || '';
        const model = row.cells[1]?.textContent.toLowerCase() || '';
        
        if (plate.includes(filter) || model.includes(filter)) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    });
}

// === YENİ FONKSİYON: Arama Çubuğunu Aç/Kapa ===
function toggleFinanceSearch() {
    const input = document.getElementById('fin-search-input');
    if (input) {
        input.classList.toggle('active');
        if (input.classList.contains('active')) {
            input.focus();
        } else {
            input.value = ''; // Kapatınca temizle
            filterFinanceVehicles(''); // Listeyi sıfırla
        }
    }
}

// === KURAL 2 (MEVCUT KODU DÜZELTME + EKLEME) ===
// Finansal Durum > Taşıtlar sekmesini dolduran fonksiyon
function renderOwnedVehiclesForFinance() { 
    const detailEl = document.getElementById('fin-detail');
    
    // Konsinye hariç (owned) ve stokta olan araçlar
    const vehicles = data.vehicles.filter(v => v.type === 'owned' && v.status === 'stokta');
    
    // Stoktaki araçların toplam alış fiyatını hesapla
    const totalStockValue = vehicles.reduce((sum, v) => sum + (v.purchase_price || 0), 0);
    
    // Özet Bilgi + Arama Çubuğu (EKLEME BURADA)
    // onclick="toggleFinanceSearch()" eklendi
    let summaryHtml = `
        <div class="cash-detail-container" style="padding-bottom: 0; margin-bottom: 12px;">
            <div class="cash-summary" style="justify-content: center;">
                <div class="cash-summary-item total" style="border-left: none; padding-left: 0; text-align: center; flex-basis: 100%; font-size: 13px;">
                    TOPLAM DEĞER<br><strong style="font-size: 15px;">${fmt(totalStockValue)}</strong>
                </div>
            </div>
        </div>
        
        <div class="fin-search-wrapper">
            <div class="fin-search-icon" onclick="toggleFinanceSearch()">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
            </div>
            <input type="text" id="fin-search-input" class="fin-search-input" placeholder="Plaka veya Model Ara..." onkeyup="filterFinanceVehicles(this.value)">
        </div>
    `;
    
    if (vehicles.length === 0) {
        detailEl.innerHTML = summaryHtml + '<p style="text-align:center; padding: 20px;">Stokta (Konsinye Hariç) taşıt bulunmuyor.</p>';
        return;
    }

    let tableHtml = '<table><thead><tr><th>Plaka</th><th>Model</th><th>Alış Fiyatı</th></tr></thead><tbody>';
    vehicles.forEach(v => {
        tableHtml += `
            <tr style="cursor:pointer;" onclick="openModal('tasitlar'); showVehicleDetailInTasitlar(${v.id});">
                <td>${v.plate}</td>
                <td>${v.name}</td>
                <td class="no-wrap" style="text-align: right; padding-right: 8px;">${fmt(v.purchase_price)}</td>
            </tr>`;
    });
    tableHtml += '</tbody></table>';
    
    // Özeti ve tabloyu birleştir
    detailEl.innerHTML = summaryHtml + tableHtml;
}
// === GÜNCELLEME SONU ===