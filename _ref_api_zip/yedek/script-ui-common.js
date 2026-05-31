/* ====================================================================
   DOSYA: script-ui-common.js
   Açıklama: Finansal durum render ve genel UI fonksiyonları
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
            renderCashDetail();
            break;
        case 'tasitlar':
            renderOwnedVehiclesForFinance();
            break;
        case 'receivables':
            renderReceivablesGrid();
            break;
        case 'payables':
            renderPayablesGrid();
            break;
        case 'cari':
            renderPersonsGrid();
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

