/* ====================================================================
   DOSYA 1/3: script-core.js (TAM VE TEMİZ SÜRÜM)
   Açıklama: Uygulamanın çekirdek mantığı, global değişkenleri,
   veri yönetimi ve hesaplama fonksiyonlarını içerir.
   (GÜNCELLEME v35 - MOBİL FIX: Retry + Backup + Timeout)
   ==================================================================== */

/* ====================================================================
   1. GLOBAL DURUM & AYARLAR
   ==================================================================== */
const DB_KEY = "karmotors_mvp_v13_production";

// MOBİL İÇİN AYARLAR
const SAVE_CONFIG = {
    TIMEOUT_MS: 30000,      // Mobil için 30 saniye (masaüstü 5s yerine)
    MAX_RETRIES: 3,         // Maksimum 3 kez dene
    RETRY_DELAY_MS: 2000    // Her deneme arasında 2 saniye bekle
};

// GÖRELİ YOL (Relative Path) kullanarak CORS/Domain sorunlarını aşarız
const API_PATH_SAVE = "api/save.php";
const API_PATH_LOAD = "api/load.php";

const DEBT_ALERT_DAYS = 5;
const VEHICLE_NEW_ALERT_DAYS = 2; 
const VEHICLE_RELATED_CATEGORIES = new Set([
    'akaryakit',
    'noter',
    'ekspertiz',
    'bakim-oto-yikama',
    'mtv',
    'trafik-sigortasi-kasko',
    'komisyon'
]);
let data = {
	transactions: [],
	schedules: [],
	persons: [],
	vehicles: [],
	revisions: [],
	userCategories: { gelir: {}, gider: {} }
};
let nextIds = {
	tx: 1001,
	schedule: 101,
	person: 101,
	vehicle: 101,
	revision: 1001
};
let editing = null;
let scrollPositionBeforeModal = 0;
let currentFinanceDetail = 'cash';
let currentTasitlarDetail = 'taşıtlarımız';
let currentVeriDetail = 'kayit';
let isCategorySelectorOpen = false;
let isArchiveViewActive = false;
let tempLinkedVehicleId = null;
let cariEditingId = null;
let confirmCallback = null;
let categoryManagementMode = null;
let activeDateFilter = 'month';
let currentFilter = null;
let activeCategoryGroup = null;

/* ====================================================================
   2. YARDIMCI FONKSİYONLAR
   ==================================================================== */

function nextId(type) {
    if (!nextIds[type]) nextIds[type] = 1;
    return nextIds[type]++;
}

function fmt(n) {
    if (n === undefined || n === null) return '₺0,00';
    return Number(n).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺';
}

function fmtShort(n) {
    if (n === undefined || n === null) return '₺0';
    const num = Number(n);
    let absNum = Math.abs(num);
    let sign = Math.sign(num);

    if (absNum >= 1e9) {
        return (sign * (absNum / 1e9)).toFixed(1).replace(/\.0$/, '') + ' Mr ₺';
    }
    if (absNum >= 1e6) {
        return (sign * (absNum / 1e6)).toFixed(2).replace(/\.0+$/, '') + ' Mn ₺';
    }
    if (absNum >= 1e3) {
        return (sign * (absNum / 1e3)).toFixed(2).replace(/\.0+$/, '') + ' K ₺';
    }

    return fmt(num);
}

function parseN(s) {
    if (typeof s === 'number') return s;
    if (!s) return 0;
    let cleaned = s.toString().replace(/\./g, '').replace(',', '.');
    return parseFloat(cleaned) || 0;
}

function fdate(d) {
    if (!d) return '';
    try {
        let dateToFormat;
        if (d instanceof Date) {
            dateToFormat = d;
        } else {
            const dateString = d.toString().split('T')[0];
            dateToFormat = new Date(dateString + 'T00:00:00');
        }
        if (isNaN(dateToFormat.getTime())) {
            throw new Error("Invalid Date object created");
        }
        return dateToFormat.toLocaleDateString("tr-TR", { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch (error) {
        console.error("fdate error:", error, "Input:", d);
        if (d instanceof Date && !isNaN(d.getTime())) {
             return d.toLocaleDateString("tr-TR", { day: '2-digit', month: '2-digit', year: 'numeric' });
        }
        return String(d);
    }
}

function getCashFlowType(category) {
    const defaultIn = ['tasit-satisi', 'gelen-tl', 'faiz-geliri', 'kredi-karti-iadesi', 'komisyon', 'asli-ortak-sermaye-giris', 'alinan-borc'];
    const defaultOut = [
        'isyeri-kira', 'isyeri-aidat', 'calisan-maaslari', 'sahibinden-com',
        'akaryakit', 'noter',
        'yemek', 'sair-giderler', 'ekspertiz',
        'bakim-oto-yikama', 'mtv', 'kdv', 'muhtasar-vergisi',
        'gecici-vergi', 'elektrik', 'su', 'gsm-internet',
        'trafik-sigortasi-kasko', 'tasit-alimi', 'verilen-borc',
        'asli-ortak-sermaye-cikis'
    ];

    if (defaultIn.includes(category)) return 'in';
    if (defaultOut.includes(category)) return 'out';
    if (category === 'kasa-banka-virman' || category === 'tasit-satis-kari') return 'neutral';

    const userCategoryGroup = Object.keys(data.userCategories).find(group =>
        Object.keys(data.userCategories[group]).includes(category)
    );
    if (userCategoryGroup === 'gelir') return 'in';
    if (userCategoryGroup === 'gider') return 'out';

    return 'neutral';
}

function getCategoriesByGroup(group) {
    const categories = {
        'gelir': ['gelen-tl', 'faiz-geliri', 'kredi-karti-iadesi', 'komisyon'],
        'gider': ['isyeri-kira', 'isyeri-aidat', 'calisan-maaslari', 'sahibinden-com', 'akaryakit', 'noter', 'yemek', 'sair-giderler', 'ekspertiz', 'bakim-oto-yikama', 'mtv', 'kdv', 'muhtasar-vergisi', 'gecici-vergi', 'elektrik', 'su', 'gsm-internet', 'trafik-sigortasi-kasko'],
        'stok': ['tasit-alimi', 'tasit-satisi'],
        'cari': ['alinan-borc', 'verilen-borc'],
        'transfer': ['kasa-banka-virman'],
        'sermaye': ['asli-ortak-sermaye-giris', 'asli-ortak-sermaye-cikis']
    };
    return categories[group] || [];
}

function showConfirm(message, callback, title = "Onay Gerekiyor") {
    document.getElementById('modal-confirm').classList.add('on');
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-message').textContent = message;
    confirmCallback = callback;
}

function formatNumberInput(e) {
    const input = e.target;
    let value = input.value.replace(/[^0-9,]/g, '');
    let parts = value.split(',');

    if (parts.length > 2) {
        value = parts.shift() + ',' + parts.join('');
    }

    if (parts[0]) {
        let integerPart = parts[0].replace(/\./g, '');
        integerPart = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
        value = integerPart + (parts[1] !== undefined ? ',' + parts[1] : '');
    }

    input.value = value;
}

function isPL(category) {
    const nonPL = new Set([
        "tasit-alimi",
        "tasit-satisi",
        "kasa-banka-virman",
        "alinan-borc",
        "verilen-borc",
        "asli-ortak-sermaye-giris",
        "asli-ortak-sermaye-cikis",
        "tasit-satis-kari"
    ]);
	return !nonPL.has(category);
}

/* ====================================================================
   3. VERİ YÖNETİMİ (MOBİL FIX - V35)
   ==================================================================== */

async function save() {
    Object.keys(nextIds).forEach(key => {
        const maxId = data[`${key}s`]?.reduce((max, item) => Math.max(max, item.id || 0), 0) || 0;
        nextIds[key] = Math.max(nextIds[key], maxId + 1);
    });

    const saveData = JSON.stringify({ data, nextIds });
    
    // === STEP 0: LocalStorage'a HEMEN backup al (Güvenlik Ağı) ===
    try {
        localStorage.setItem('karmotors_emergency_backup', saveData);
        console.log("[MOBİL FIX] ✓ LocalStorage yedeklendi");
    } catch (e) {
        console.warn("[MOBİL FIX] LocalStorage yedek hatası:", e.message);
    }

    // === STEP 1: Sunucuya kaydet (RETRY loop ile) ===
    let lastError = null;
    
    for (let attempt = 1; attempt <= SAVE_CONFIG.MAX_RETRIES; attempt++) {
        try {
            const timestamp = new Date().getTime();
            const url = `${API_PATH_SAVE}?t=${timestamp}`;
            
            // Timeout Mekanizması
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), SAVE_CONFIG.TIMEOUT_MS);

            const res = await fetch(url, {
                method: "POST",
                headers: { 
                    "Content-Type": "application/json",
                    "Cache-Control": "no-cache",
                    "Pragma": "no-cache",
                    "X-Save-Attempt": `${attempt}/${SAVE_CONFIG.MAX_RETRIES}`
                },
                mode: 'cors', // Mobil için önemli
                signal: controller.signal,
                body: saveData
            });

            clearTimeout(timeoutId);

            if (!res.ok) {
                const errorText = await res.text();
                throw new Error(`HTTP ${res.status}: ${errorText}`);
            }

            console.log(`[MOBİL FIX] ✓ Kayıt Başarılı (Deneme ${attempt})`);
            autoBackupVehicles();
            
            // Başarılıysa backup'ı sil
            try {
                localStorage.removeItem('karmotors_emergency_backup');
            } catch (e) {}
            
            return; // Başarılı çıkış
            
        } catch (e) {
            lastError = e;
            console.warn(`[MOBİL FIX] ✗ Hata (Deneme ${attempt}):`, e.message);
            
            // Son deneme değilse bekle
            if (attempt < SAVE_CONFIG.MAX_RETRIES) {
                await new Promise(resolve => setTimeout(resolve, SAVE_CONFIG.RETRY_DELAY_MS));
            }
        }
    }

    // Tüm denemeler başarısızsa
    console.error("[MOBİL FIX] ✗ TÜM KAYIT DENEMELERİ BAŞARISIZ!");
    updateStatusIndicator('error', 'Kaydedilemedi');
    throw lastError;
}

async function load() {
    try {
        const timestamp = new Date().getTime();
        const url = `${API_PATH_LOAD}?t=${timestamp}`;

        const res = await fetch(url, {
             headers: { 
                 "Cache-Control": "no-cache", 
                 "Pragma": "no-cache"
             },
             mode: 'cors'
        });

        if (!res.ok) throw new Error(`HTTP hatası! Durum: ${res.status}`);
        const parsed = await res.json();

        if (parsed.data && parsed.nextIds) {
            data = parsed.data;
            nextIds = parsed.nextIds;
            if (!data.userCategories) data.userCategories = { gelir: {}, gider: {} };
            if (!data.revisions) data.revisions = [];
            return true;
        } else {
             // Veri bozuksa boş başlat
             data = { transactions: [], schedules: [], persons: [], vehicles: [], revisions: [], userCategories: { gelir: {}, gider: {} } };
             nextIds = { tx: 1001, schedule: 101, person: 101, vehicle: 101, revision: 1001 };
             updateStatusIndicator('error', 'Yükleme Hatası');
             toast("Sunucudan veri alınamadı. Boş başlangıç yapıldı.", "err");
             return false;
        }
    } catch (e) {
        console.error("Yükleme hatası:", e);
        
        // Yükleme başarısızsa LocalStorage'dan kurtarmayı dene
        if (attemptRestoreFromLocalBackup()) {
            return true;
        }

        data = { transactions: [], schedules: [], persons: [], vehicles: [], revisions: [], userCategories: { gelir: {}, gider: {} } };
        nextIds = { tx: 1001, schedule: 101, person: 101, vehicle: 101, revision: 1001 };
        updateStatusIndicator('error', 'Yükleme Hatası');
        toast("Sunucuya erişilemedi. Çevrimdışı moddasınız.", "warn");
        return false;
    }
}

// === YENİ FONKSİYON: LocalStorage'dan Geri Yükleme ===
function attemptRestoreFromLocalBackup() {
    try {
        const backup = localStorage.getItem('karmotors_emergency_backup');
        if (!backup) return false;
        
        const parsed = JSON.parse(backup);
        if (parsed && parsed.data && parsed.nextIds) {
            console.log("[MOBİL FIX] LocalStorage yedeği yüklendi.");
            data = parsed.data;
            nextIds = parsed.nextIds;
            toast("⚠️ Veriler cihaz hafızasından yüklendi. Kaydedilmemiş veri olabilir.", "info");
            return true;
        }
    } catch (e) {
        console.warn("Yedek geri yükleme hatası:", e);
    }
    return false;
}

function backupData() {
    try {
        const dataStr = JSON.stringify({ data, nextIds }, null, 2);
        const blob = new Blob([dataStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const date = new Date().toISOString().split('T')[0];
        a.download = `karmotors_yedek_${date}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast("Yedekleme dosyası indirildi.", "ok");
    } catch (e) {
        toast("Yedekleme başarısız.", "err");
    }
}

function restoreData(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const content = e.target.result;
            const parsed = JSON.parse(content);
            if (parsed.data && parsed.nextIds) {
                showConfirm("Bu işlem mevcut yerel verinizin üzerine yazacaktır. Emin misiniz?", async () => {
                    data = parsed.data;
                    nextIds = parsed.nextIds;
                    if (!data.userCategories) data.userCategories = { gelir: {}, gider: {} };
                    if (!data.revisions) data.revisions = [];
                    await save();
                    toast("Veriler başarıyla geri yüklendi. Sayfa yenileniyor...", "ok");
                    setTimeout(() => window.location.reload(), 1500);
                });
            } else {
                toast("Geçersiz yedekleme dosyası formatı.", "err");
            }
        } catch (error) {
            toast("Dosya okuma/ayrıştırma hatası.", "err");
        }
    };
    reader.readAsText(file);
}

/* ====================================================================
   4. HESAPLAMA MANTIĞI
   ==================================================================== */

function calculateBalance(account) {
    let balance = 0;
    const txs = (data.transactions || []).filter(t => t.status !== 'iptal');

    for (const t of txs) {
        if (t.category === 'kasa-banka-virman') {
            if (t.source_account === account) {
                balance -= Number(t.amount || 0);
            } else if (t.destination_account === account) {
                balance += Number(t.amount || 0);
            }
            continue;
        }
        if (t.category === 'alinan-borc' || t.category === 'verilen-borc') {
            if (t.virtual) continue;
        }
        if (t.category === 'tasit-alimi' && t.account === 'not-applicable' && t.person_id) {
            continue;
        }
        if (t.category === 'tasit-satis-kari' || t.virtual) {
            continue;
        }
        const txAccount = t.account || 'kasa';
        if (txAccount === account) {
            const flow = getCashFlowType(t.category);
            if (flow === 'in') {
                balance += Number(t.amount || 0);
            } else if (flow === 'out') {
                balance -= Number(t.amount || 0);
            }
        }
    }
    return balance;
}

function calculateKasaBalance() { return calculateBalance('kasa'); }
function calculateBankaBalance() { return calculateBalance('banka'); }

function calculateVehicleStockValue() {
    return data.vehicles
        .filter(v => v.status === 'stokta' && v.type === 'owned')
        .reduce((sum, v) => sum + Number(v.purchase_price || 0), 0);
}

function calculateExpectedReceivables() {
    return data.schedules
        .filter(s => s.type === 'alacak' && s.status !== 'tamamlandi' && s.status !== 'iptal')
        .reduce((sum, s) => sum + Number(s.remaining || 0), 0);
}

function calculatePayables() {
    return data.persons
        .filter(p => p.type !== 'asli')
        .reduce((sum, p) => {
            const bal = calculateCariBalance(p.id);
            return bal < 0 ? sum + Math.abs(bal) : sum;
        }, 0);
}

function calculatePartnerBalance(personId) {
    const sermaye = calculateSermayeBalance(personId);
    const cari = calculateCariBalance(personId);
    return sermaye + cari;
}

function calculateTotalPartnerBalance() {
    return data.persons
        .filter(p => p.type === 'asli')
        .reduce((sum, p) => sum + calculatePartnerBalance(p.id), 0);
}

function financeNumbers() {
    return {
        totalCash: calculateKasaBalance() + calculateBankaBalance(),
        stockValue: calculateVehicleStockValue(),
        expected: calculateExpectedReceivables(),
        payables: calculatePayables(),
        partnerBalance: calculateTotalPartnerBalance()
    };
}

function getVehicleExpenses(vehicleId) {
    if (!vehicleId) return 0;
    return data.transactions
        .filter(t => t.vehicle_id === vehicleId && t.status !== 'iptal')
        .reduce((sum, t) => {
            const flow = getCashFlowType(t.category);
            if (flow === 'out' && t.category !== 'tasit-alimi') {
                 return sum + Number(t.amount || 0);
            }
            return sum;
        }, 0);
}

function calculateProfit(vehicle) {
    const expenses = getVehicleExpenses(vehicle.id);
    const salePrice = vehicle.sale_price || 0;
    const purchasePrice = vehicle.purchase_price || 0;
    return salePrice - purchasePrice - expenses;
}

function applyPaymentToScheduleNextOnly(schedule, amount) {
    let remainingPayment = amount;
    let appliedAmount = 0;
    const sortedInstallments = schedule.installments.sort((a, b) => new Date(a.due_date) - new Date(b.due_date));

    for (const inst of sortedInstallments) {
        if (inst.status === 'bekleniyor' && remainingPayment > 0) {
            const needed = inst.amount - (inst.paid_amount || 0);
            const payment = Math.min(remainingPayment, needed);
            inst.paid_amount = (inst.paid_amount || 0) + payment;
            schedule.paid_amount = (schedule.paid_amount || 0) + payment;
            appliedAmount += payment;
            remainingPayment -= payment;
            if (Math.abs(inst.paid_amount - inst.amount) < 0.01) {
                inst.status = 'tamamlandi';
            }
             if (remainingPayment <= 0.01) break;
        }
    }
    schedule.remaining = schedule.total_amount - schedule.paid_amount;
    if (schedule.remaining < 0 && Math.abs(schedule.remaining) < 0.01) {
        schedule.remaining = 0;
    }
    const isCompleted = schedule.installments.every(inst => inst.status === 'tamamlandi');
    const isEffectivelyCompleted = Math.abs(schedule.remaining) < 0.01;
    if (isCompleted || isEffectivelyCompleted) {
        schedule.status = 'tamamlandi';
        schedule.remaining = 0;
    }
    return appliedAmount;
}

/* ====================================================================
   5. ORTAK HESAPLAMA MANTIĞI
   ==================================================================== */

function calculateCariBalance(personId) {
    const txs = (data.transactions || []).filter(t => t && t.person_id === personId && t.status !== 'iptal');
    let balance = 0;

    for (const t of txs) {
        if (t.category === 'verilen-borc') { balance += Number(t.amount || 0); continue; }
        if (t.category === 'alinan-borc') { balance -= Number(t.amount || 0); continue; }
        if (t.category === 'asli-ortak-sermaye-giris' || t.category === 'asli-ortak-sermaye-cikis') { continue; }
        if (t.category === 'tasit-alimi' && t.account === 'not-applicable') { balance -= Number(t.amount || 0); continue; }
        if (t.virtual) continue;

        const flow = getCashFlowType(t.category);
        const txAmount = Number(t.amount || 0);
        if (flow === 'out' && (t.account === 'kasa' || t.account === 'banka')) { balance += txAmount; }
        else if (flow === 'in' && (t.account === 'kasa' || t.account === 'banka')) { balance -= txAmount; }
    }

    const scheds = (data.schedules || []).filter(s => s && s.person_id === personId && s.status !== 'iptal' && s.status !== 'tamamlandi');
    for (const s of scheds) {
        const remainingAmount = Number(s.remaining || 0);
        if (s.type === 'alacak') { balance += remainingAmount; } 
        else if (s.type === 'borc') { balance -= remainingAmount; }
    }
    return balance;
}

function calculateSermayeBalance(personId) {
    return data.transactions
        .filter(t => t.person_id === personId && t.status !== 'iptal' && !t.virtual &&
                 ['asli-ortak-sermaye-giris', 'asli-ortak-sermaye-cikis'].includes(t.category))
        .reduce((sum, t) => {
            return t.category === 'asli-ortak-sermaye-giris' ? sum + Number(t.amount || 0) : sum - Number(t.amount || 0);
        }, 0);
}

/* ====================================================================
   6. BİLDİRİM & GÖREV YÖNETİMİ
   ==================================================================== */

function checkAllNotifications() {
    const bell = document.getElementById('notification-bell');
    if (!bell) return;
    bell.classList.remove('alert-danger', 'alert-warning');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const notifications = [];

    const dueDebts = data.schedules.filter(s => s.type === 'borc' && s.status !== 'tamamlandi' && s.status !== 'iptal');
    dueDebts.forEach(debt => {
        const nextPayment = debt.installments.filter(i => i.status === 'bekleniyor').sort((a, b) => new Date(a.due_date) - new Date(b.due_date))[0];
        if (nextPayment) {
            const dueDate = new Date(nextPayment.due_date + 'T00:00:00');
            const timeDiff = dueDate.getTime() - today.getTime();
            const daysDiff = Math.round(timeDiff / (1000 * 3600 * 24));
            if (daysDiff < 0) notifications.push({ type: 'debt', level: 'error', message: `Borç vadesi geçti.`, scheduleId: debt.id });
            else if (daysDiff <= DEBT_ALERT_DAYS) notifications.push({ type: 'debt', level: 'warning', message: `Borç vadesi yaklaşıyor.`, scheduleId: debt.id });
        }
    });

    const datedTxs = data.transactions.filter(t => t.status === 'aktif' && t.due_date && (t.category === 'alinan-borc' || t.category === 'verilen-borc'));
    datedTxs.forEach(tx => {
        const currentBalance = calculateCariBalance(tx.person_id);
        const isRelevant = (tx.category === 'alinan-borc' && currentBalance < -0.01) || (tx.category === 'verilen-borc' && currentBalance > 0.01);
        if (isRelevant) {
             const dueDate = new Date(tx.due_date + 'T00:00:00');
             const timeDiff = dueDate.getTime() - today.getTime();
             const daysDiff = Math.round(timeDiff / (1000 * 3600 * 24));
             const typeText = tx.category === 'alinan-borc' ? 'Borç' : 'Alacak';
             if (daysDiff < 0 && !notifications.some(n => n.personId === tx.person_id && n.level === 'error' && n.message.includes(typeText))) {
                  notifications.push({ type: 'manual_debt', level: 'error', message: `Manuel ${typeText} vadesi geçti.`, personId: tx.person_id });
             } else if (daysDiff <= DEBT_ALERT_DAYS && !notifications.some(n => n.personId === tx.person_id && n.message.includes(typeText))) {
                  notifications.push({ type: 'manual_debt', level: 'warning', message: `Manuel ${typeText} vadesi yaklaşıyor.`, personId: tx.person_id });
             }
        }
    });

    const vehiclesInStock = data.vehicles.filter(v => v.type === 'owned' && v.status === 'stokta');
    vehiclesInStock.forEach(vehicle => {
        const purchaseDate = new Date(vehicle.purchase_date + 'T00:00:00');
        const timeDiffPurchase = today.getTime() - purchaseDate.getTime();
        const daysSincePurchase = Math.round(timeDiffPurchase / (1000 * 3600 * 24));
        if (daysSincePurchase >= 0 && daysSincePurchase <= VEHICLE_NEW_ALERT_DAYS && (!vehicle.insurance_expiry || !vehicle.inspection_expiry)) {
             notifications.push({ type: 'vehicle', level: 'warning', message: `${vehicle.plate} için sigorta/muayene bilgisi girilmedi.`, vehicleId: vehicle.id });
        }
        const checks = [{ date: vehicle.insurance_expiry, type: 'Sigorta' }, { date: vehicle.inspection_expiry, type: 'Muayene' }];
        checks.forEach(check => {
            if (check.date) {
                const expiryDate = new Date(check.date + 'T00:00:00');
                const timeDiffExpiry = expiryDate.getTime() - today.getTime();
                const daysDiff = Math.round(timeDiffExpiry / (1000 * 3600 * 24));
                if (daysDiff < 0 && !notifications.some(n => n.vehicleId === vehicle.id && n.message.includes(check.type) && n.level === 'error')) {
                    notifications.push({ type: 'vehicle', level: 'error', message: `${vehicle.plate} ${check.type} vadesi geçti.`, vehicleId: vehicle.id });
                } else if (daysDiff <= 30 && !notifications.some(n => n.vehicleId === vehicle.id && n.message.includes(check.type))) {
                    notifications.push({ type: 'vehicle', level: 'warning', message: `${vehicle.plate} ${check.type} vadesi yaklaşıyor.`, vehicleId: vehicle.id });
                }
            }
        });
    });

    const hasError = notifications.some(n => n.level === 'error');
    const hasWarning = notifications.some(n => n.level === 'warning');
    if (hasError) { bell.classList.add('alert-danger'); updateStatusIndicator('error', 'Acil Bildirim Var'); } 
    else if (hasWarning) { bell.classList.add('alert-warning'); updateStatusIndicator('busy', 'Önemli Bildirim'); } 
    else { updateStatusIndicator('ready', 'Hazır'); }
}

// === TOAST BİLDİRİMİ DÜZELTİLDİ (Çakışma Önleme) ===
function toast(message, type = 'info') {
    // Varsa eski bildirimleri temizle
    const existingToasts = document.querySelectorAll('.toast');
    existingToasts.forEach(t => t.remove());

    const container = document.body;
    const toastEl = document.createElement('div');
    toastEl.className = `toast ${type}`;
    toastEl.textContent = message;
    container.appendChild(toastEl);
    
    // Animasyon ve silinme
    setTimeout(() => {
        toastEl.style.opacity = '1';
        toastEl.style.top = '20px'; 
    }, 10);

    setTimeout(() => {
        toastEl.style.opacity = '0';
        toastEl.style.top = '-50px';
        setTimeout(() => { 
            if(toastEl.parentNode) toastEl.remove(); 
        }, 300);
    }, 3000); // 3 saniye ekranda kalsın
}

/* ====================================================================
   TAŞITLAR BACKUP & MIGRATION
   ====================================================================*/

function autoBackupVehicles() {
    if (!data.vehicles) return;
    const backup = { timestamp: new Date().toISOString(), count: data.vehicles.length, vehicles: JSON.parse(JSON.stringify(data.vehicles)) };
    localStorage.setItem('vehicles_backup_latest', JSON.stringify(backup));
    console.log(`BACKUP: Taşıtlar yedeklendi (${backup.count} araç)`);
}

function migrateVehicleDetailsFields() {
    if (!data.vehicles || data.vehicles.length === 0) { console.log("INFO: Güncellenecek araç yok"); return false; }
    let migrationCount = 0;
    console.log("MIGRATION: Taşıt migration başladı...");
    data.vehicles.forEach((v) => {
        let needsSave = false;
        if (!v.hasOwnProperty('model_year') || v.model_year === undefined) { v.model_year = null; needsSave = true; }
        if (!v.hasOwnProperty('km') || v.km === undefined) { v.km = null; needsSave = true; }
        if (!v.hasOwnProperty('tramer_record') || v.tramer_record === undefined) { v.tramer_record = null; needsSave = true; }
        if (!v.hasOwnProperty('painted_parts') || !Array.isArray(v.painted_parts)) { v.painted_parts = []; needsSave = true; }
        if (!v.hasOwnProperty('in_garage') || v.in_garage === undefined) { v.in_garage = true; needsSave = true; }
        if (!v.hasOwnProperty('location') || v.location === undefined) { v.location = ""; needsSave = true; }
        if (!v.hasOwnProperty('notes') || v.notes === undefined) { v.notes = ""; needsSave = true; }
        if (needsSave) { migrationCount++; console.log(`  OK: Araç #${v.id} güncellendi`); }
    });
    if (migrationCount > 0) { save(); console.log(`OK: ${migrationCount} taşıtta detay alanları eklendi`); return true; }
    console.log("OK: Tüm taşıtlar zaten güncellenmiş");
    return false;
}

// ============================================================================
// HELPER FONKSİYONLARI
// ============================================================================

function parseBoolean(value) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value === 1;
    if (typeof value === 'string') {
        const lower = value.toLowerCase().trim();
        return lower === '1' || lower === 'true' || lower === 'evet';
    }
    return false;
}

function formatDateTurkish(dateString) {
    if (!dateString) return '';
    try { const [year, month, day] = dateString.split('-'); return `${day}.${month}.${year}`; } catch (e) { return dateString; }
}

function parseTurkishDate(turkishDate) {
    if (!turkishDate) return '';
    try { const [day, month, year] = turkishDate.split('.'); return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`; } catch (e) { return turkishDate; }
}

function formatPrice(price, showCurrency = true) {
    if (!price && price !== 0) return showCurrency ? '0 ₺' : '0';
    const formatted = price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return showCurrency ? `${formatted} ₺` : formatted;
}

function parsePrice(priceString) {
    if (!priceString) return 0;
    return parseInt(priceString.toString().replace(/\./g, '')) || 0;
}

function normalizeVehicleData(vehicleData) {
    const normalized = { ...vehicleData };
    const booleanFields = ['ruhsat', 'trafik_sigortasi', 'kasko', '2el_garanti', 'takas', 'yakit_dolu', 'arac_takip', 'kredi_uygun'];
    booleanFields.forEach(field => { if (normalized.hasOwnProperty(field)) { normalized[field] = parseBoolean(normalized[field]); } });
    const numberFields = ['purchase_price', 'sale_price', 'km', 'year'];
    numberFields.forEach(field => { if (normalized.hasOwnProperty(field)) { normalized[field] = parsePrice(normalized[field]); } });
    const dateFields = ['purchase_date', 'sale_date', 'last_maintenance_date'];
    dateFields.forEach(field => { if (normalized.hasOwnProperty(field) && !normalized[field]) { normalized[field] = null; } });
    return normalized;
}

function getVehicleStatus(vehicle) {
    if (vehicle.sold) { return { status: 'sold', label: 'Satıldı', color: '#4ade80' }; }
    if (!vehicle.in_garage) { return { status: 'outside', label: 'Galeride Değil', color: '#94a3b8' }; }
    return { status: 'available', label: 'Galeride', color: '#60a5fa' };
}

function getMissingDocuments(vehicle) {
    const missing = [];
    if (!parseBoolean(vehicle.ruhsat)) missing.push('Ruhsat');
    if (!parseBoolean(vehicle.trafik_sigortasi)) missing.push('Trafik Sigortası');
    if (!parseBoolean(vehicle.kasko)) missing.push('Kasko');
    return missing;
}

function findVehicleById(vehicleId) {
    const id = parseInt(vehicleId);
    return data.vehicles.find(v => v.id === id) || null;
}

function serializeForm(form) {
    const formData = new FormData(form);
    const obj = {};
    for (let [key, value] of formData.entries()) { obj[key] = value; }
    return obj;
}

function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed; top: 20px; right: 20px; background: ${type === 'error' ? '#ef4444' : '#10b981'}; color: white; padding: 12px 20px;
        border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); z-index: 10000; animation: slideIn 0.3s ease;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => { notification.style.animation = 'slideOut 0.3s ease'; setTimeout(() => notification.remove(), 300); }, 3000);
}

function createYesNoButtons(name, currentValue, onClickFunction, vehicleId) {
    const isYes = currentValue === 'yes' || currentValue === true;
    const isNo = currentValue === 'no' || currentValue === false || !currentValue;
    return `
        <div class="yes-no-group">
            <button type="button" class="yes-no-btn ${isYes ? 'active' : ''}" data-value="yes" onclick="${onClickFunction}(this, ${vehicleId})">Evet</button>
            <button type="button" class="yes-no-btn ${isNo ? 'active' : ''}" data-value="no" onclick="${onClickFunction}(this, ${vehicleId})">Hayır</button>
        </div>
    `;
}

function createStatusBadge(status) {
    const statusMap = {
        'alisbekliyor': { text: 'Alış Bekliyor', class: 'status-pending' },
        'stokta': { text: 'Stokta', class: 'status-stock' },
        'satisbekliyor': { text: 'Satış Bekliyor', class: 'status-sale-pending' },
        'satildi': { text: 'Satıldı', class: 'status-sold' }
    };
    const statusInfo = statusMap[status] || { text: status, class: '' };
    return `<span class="status-badge ${statusInfo.class}">${statusInfo.text}</span>`;
}

function formatCurrency(amount) {
    if (!amount) return '0 ₺';
    const num = parseFloat(amount);
    return num.toLocaleString('tr-TR') + ' ₺';
}

function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('tr-TR');
}

function getInputValue(id) {
    const element = document.getElementById(id);
    return element ? element.value : '';
}

function createCardInput(label, id, value = '', type = 'text') {
    return `
        <div class="card-input-group">
            <label>${label}</label>
            <input type="${type}" id="${id}" value="${value || ''}" onchange="saveVehicleData(${id.split('-').pop()})">
        </div>
    `;
}