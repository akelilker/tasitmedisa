/* ====================================================================
   DOSYA 1/3: script-core.js (TAM VE EKSİKSİZ + Migration v2 & Backup Entegre)
   Açıklama: Uygulamanın çeklek mantığı, global değişkenleri,
   veri yönetimi ve hesaplama fonksiyonlarını içerir.
   ==================================================================== */

/* ====================================================================
   1. GLOBAL DURUM & AYARLAR
   ==================================================================== */
// DB_KEY sunucu adresine geçişe uygun olarak güncellendi.
const DB_KEY = "karmotors_mvp_v13_production";
// YENİ SUNUCU ADRESİ TANIMI (Simülasyon amaçlı)
const SERVER_URL = "https://karmotors.com.tr/karmotors";
const DEBT_ALERT_DAYS = 5;
const VEHICLE_NEW_ALERT_DAYS = 2; // Yeni araç bilgi girişi için uyarı süresi (gün)
// Sadece bu kategorilerde "Araçla ilgili mi?
// " sorusu görünecek
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
	userCategories: { gelir: {}, gider: {} } // Kullanıcı kategorileri için eklendi
};
let nextIds = {
	tx: 1001,
	schedule: 101,
	person: 101,
	vehicle: 101,
	revision: 1001
};
let editing = null;
let currentFinanceDetail = 'cash';
let currentTasitlarDetail = 'taşıtlarımız';
let currentVeriDetail = 'kayit';
let isCategorySelectorOpen = false;
let isArchiveViewActive = false; // Arşiv görünümü için yeni durum değişkeni
let tempLinkedVehicleId = null;
let cariEditingId = null;
let confirmCallback = null;
let categoryManagementMode = null;
let activeDateFilter = 'month';
let currentFilter = null;
let activeCategoryGroup = null;
// let currentAlertState = 'ready'; // KALDIRILDI (temiz_cozum.md geri alma)


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

/* ====================================================================
   Madde 7 GÜNCELLEMESİ (fmtShort):
   Rapor isteğine uygun olarak Milyon (Mn) ve Bin (K)
   gösterimleri .toFixed(1)'den .toFixed(2)'ye güncellendi.
   Regex de .0+ olarak düzeltildi.
   ====================================================================
*/
function fmtShort(n) {
    if (n === undefined || n === null) return '₺0';
    const num = Number(n);
    let absNum = Math.abs(num);
    let sign = Math.sign(num);

    if (absNum >= 1e9) {
        return (sign * (absNum / 1e9)).toFixed(1).replace(/\.0$/, '') + ' Mr ₺';
    }
    if (absNum >= 1e6) {
        // GÜNCELLENDİ: .toFixed(1) -> .toFixed(2)
        return (sign * (absNum / 1e6)).toFixed(2).replace(/\.0+$/, '') + ' Mn ₺';
    }
    if (absNum >= 1e3) {
        // GÜNCELLENDİ: .toFixed(1) -> .toFixed(2)
        return (sign * (absNum / 1e3)).toFixed(2).replace(/\.0+$/, '') + ' K ₺';
    }

    return fmt(num);
}

function parseN(s) {
    if (typeof s === 'number') return s;
    if (!s) return 0;
    // Türkiye formatını (virgülü ondalık ayırıcı) standart JS formatına çevir
    let cleaned = s.toString().replace(/\./g, '').replace(',', '.');
    return parseFloat(cleaned) || 0;
}

// --- GÜNCELLENMİŞ fdate FONKSİYONU ---
function fdate(d) {
    if (!d) return '';
    try {
        let dateToFormat;
        if (d instanceof Date) {
            // Eğer zaten bir Date nesnesiyse, doğrudan kullan
            dateToFormat = d;
        } else {
            // String ise, 'T' ve timezone kısımlarını temizleyip Date nesnesine çevir
            // Sadece YYYY-MM-DD kısmını alıp local time'da yorumla
            const dateString = d.toString().split('T')[0];
            dateToFormat = new Date(dateString + 'T00:00:00'); // Saat ekleyerek local kabul edilmesini sağla
        }
        // Geçerli bir tarih mi diye kontrol et
        if (isNaN(dateToFormat.getTime())) {
            throw new Error("Invalid Date object created");
        }
        // Türkçe formatında GG.AA.YYYY olarak formatla
        return dateToFormat.toLocaleDateString("tr-TR", { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch (error) {
        console.error("fdate error:", error, "Input:", d);
        // Hata durumunda, eğer girdi Date nesnesi ise onu formatlamayı dene
        if (d instanceof Date && !isNaN(d.getTime())) {
             return d.toLocaleDateString("tr-TR", { day: '2-digit', month: '2-digit', year: 'numeric' });
        }
        // Son çare olarak girdiyi string'e çevirip dön
        return String(d);
    }
}
// --- GÜNCELLEŞMİŞ fdate FONKSİYONU SONU ---

function getCashFlowType(category) {
    const defaultIn = ['tasit-satisi', 'gelen-tl', 'faiz-geliri', 'kredi-karti-iadesi', 'komisyon', 'asli-ortak-sermaye-giris'];
    const defaultOut = [
        'isyeri-kira', 'isyeri-aidat', 'calisan-maaslari', 'sahibinden-com',
        'akaryakit', 'noter',
        'yemek', 'sair-giderler', 'ekspertiz',
        'bakim-oto-yikama', 'mtv', 'kdv', 'muhtasar-vergisi',
        'gecici-vergi', 'elektrik', 'su', 'gsm-internet',
        'trafik-sigortasi-kasko', 'tasit-alimi', 'verilen-borc', 'alinan-borc',
        'asli-ortak-sermaye-cikis'
    ];

    if (defaultIn.includes(category)) return 'in';
    if (defaultOut.includes(category)) return 'out';
    if (category === 'kasa-banka-virman' || category === 'tasit-satis-kari') return 'neutral';

    // Kullanıcı tanımlı kategoriler
    const userCategoryGroup = Object.keys(data.userCategories).find(group =>
        Object.keys(data.userCategories[group]).includes(category)
    );
    if (userCategoryGroup === 'gelir') return 'in';
    if (userCategoryGroup === 'gider') return 'out';

    return 'neutral'; // Tanınmayan veya net olmayan işlemler
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
        // Birden fazla virgül varsa sadece ilkini koru
        value = parts.shift() + ',' + parts.join('');
    }

    // Tamsayı kısmına binlik ayıracı ekle
    if (parts[0]) {
        let integerPart = parts[0].replace(/\./g, '');
        integerPart = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
        value = integerPart + (parts[1] !== undefined ? ',' + parts[1] : '');
    }

    input.value = value;
}

// ✅ EKLENDİ: Kâr/Zarar (PL) Raporuna Dahil Edilecek İşlemleri Kontrol Eder
function isPL(category) {
    // Sermaye hareketleri, alım/satım, virman, borç/alacak işlemleri K/Z (PL) raporuna dahil edilmez.
    const nonPL = new Set([
        "tasit-alimi",
        "tasit-satisi",
        "kasa-banka-virman",
        "alinan-borc",
        "verilen-borc",
        "asli-ortak-sermaye-giris",
        "asli-ortak-sermaye-cikis",
        "tasit-satis-kari" // Sanal işlem
    ]);
	return !nonPL.has(category);
}

// clearCacheAndReload Fonksiyonu (Hata veren fonksiyon geri taşındı)
function clearCacheAndReload() {
    showConfirm("Tarayıcı Ön Belleği Temizlenecektir, Kaydedilmemiş Bilgiler Silinebilir. Emin misiniz?", () => {
        window.location.reload(true);
    }, 'Ön Bellek Temizleme Onayı');
}

// updateAlertState fonksiyonu KALDIRILDI (temiz_cozum.md geri alma)


/* ====================================================================
   3. VERİ YÖNETİMİ
   ==================================================================== */

// 🔄 GÜNCELLENDİ: Veri LocalStorage yerine doğrudan sunucuya kaydedilecek.
async function save() {
    // ID güncellemelerini yerel olarak yapmaya devam et
    Object.keys(nextIds).forEach(key => {
        const maxId = data[`${key}s`]?.reduce((max, item) => Math.max(max, item.id || 0), 0) || 0;
        nextIds[key] = Math.max(nextIds[key], maxId + 1);
    });

    try {
        const saveData = JSON.stringify({ data, nextIds });
        // LocalStorage kaydı kaldırıldı.

        // Gerçek Sunucuya gönderme
        await fetch("https://karmotors.com.tr/karmotors/api/save.php", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: saveData
        });

        // BURAYA EKLE: Otomatik yedekleme
        autoBackupVehicles(); //

    } catch (e) {
        console.error("Sunucuya kaydetme hatası:", e);
        updateStatusIndicator('error', 'Kaydedilemedi');
        toast("Sunucuya veri kaydedilemedi.", "err");
    }
}

// 🔄 GÜNCELLENDİ: Veri LocalStorage yerine doğrudan sunucudan yüklenecek.
async function load() {
    try {
        // Gerçek Sunucudan veri çekme
        const res = await fetch("https://karmotors.com.tr/karmotors/api/load.php");
        // Hata kontrolü, HTTP 200 haricinde hata fırlatabiliriz (örneğin 404/500)
        if (!res.ok) {
            throw new Error(`HTTP hatası! Durum: ${res.status}`);
        }

        const parsed = await res.json();

        if (parsed.data && parsed.nextIds) {
            data = parsed.data;
            nextIds = parsed.nextIds;
            // Geri yüklenen veride eksik olabilecek yeni alanlar için varsayılan ata
            if (!data.userCategories) data.userCategories = { gelir: {}, gider: {} };
            if (!data.revisions) data.revisions = [];
            return true;
        } else {
             // Sunucudan veri yapısı gelmediyse, boş veri setleri ile devam et
             data = { transactions: [], schedules: [], persons: [], vehicles: [], revisions: [], userCategories: { gelir: {}, gider: {} } };
             nextIds = { tx: 1001, schedule: 101, person: 101, vehicle: 101, revision: 1001 };
             updateStatusIndicator('error', 'Yükleme Hatası');
             toast("Sunucudan geçerli veri yapısı yüklenemedi. Boş başlangıç yapıldı.", "err");
             return false;
        }
    } catch (e) {
        console.error("Sunucudan veri yükleme hatası:", e);
        // Hata durumunda boş veri setleri ile devam et
        data = { transactions: [], schedules: [], persons: [], vehicles: [], revisions: [], userCategories: { gelir: {}, gider: {} } };
        nextIds = { tx: 1001, schedule: 101, person: 101, vehicle: 101, revision: 1001 };
        updateStatusIndicator('error', 'Yükleme Hatası');
        toast("Sunucudan veri yüklenemedi. Boş başlangıç yapıldı.", "err");
        return false;
    }
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
                     // Geri yüklenen veride eksik olabilecek yeni alanlar için varsayılan ata
                    if (!data.userCategories) data.userCategories = { gelir: {}, gider: {} };
                    if (!data.revisions) data.revisions = [];

                    // Geri yüklenen veriyi sunucuya da kaydet
                    await save();

                    toast("Veriler başarıyla geri yüklendi ve sunucuya kaydedildi. Sayfa yenileniyor...", "ok");
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
        // Virman işlemleri
        if (t.category === 'kasa-banka-virman') {
            if (t.source_account === account) {
                balance -= Number(t.amount || 0);
            } else if (t.destination_account === account) {
                balance += Number(t.amount || 0);
            }
            continue;
        }

        // Cari hesapla ilgili işlemler (kasaya veya bankaya etki etmez)
        if (t.category === 'alinan-borc' || t.category === 'verilen-borc') {
            continue;
        }

        // Taşıt alımında ortak payı (kasaya veya bankaya etki etmez)
        if (t.category === 'tasit-alimi' && t.account === 'not-applicable' && t.person_id) { // Daha kesin kontrol
            continue;
        }

        // Sanal satış karı işlemi (kasaya veya bankaya etki etmez)
        if (t.category === 'tasit-satis-kari' || t.virtual) { // Sanal işlemleri genel kontrol
            continue;
        }

        const txAccount = t.account || 'kasa'; // Hesap belirtilmediyse Kasa varsayılır

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


function calculateKasaBalance() {
    return calculateBalance('kasa');
}

function calculateBankaBalance() {
    return calculateBalance('banka');
}

function calculateVehicleStockValue() {
    // Sadece 'stokta' ve 'owned' tipindeki araçların alış fiyatlarını toplar
    return data.vehicles
        .filter(v => v.status === 'stokta' && v.type === 'owned')
        .reduce((sum, v) => sum + Number(v.purchase_price || 0), 0);
}

function calculateExpectedReceivables() {
    // Tamamlanmamış alacak planlarının kalan tutarını toplar
    return data.schedules
        .filter(s => s.type === 'alacak' && s.status !== 'tamamlandi' && s.status !== 'iptal')
        .reduce((sum, s) => sum + Number(s.remaining || 0), 0);
}

function calculatePayables() {
    // Tamamlanmamış borç planlarının kalan tutarını toplar
    return data.schedules
        .filter(s => s.type === 'borc' && s.status !== 'tamamlandi' && s.status !== 'iptal')
        .reduce((sum, s) => sum + Number(s.remaining || 0), 0);
}

function calculatePartnerBalance(personId) {
    const sermaye = calculateSermayeBalance(personId);
    const cari = calculateCariBalance(personId);
    return sermaye + cari;
}

function calculateTotalPartnerBalance() {
    // Sadece asli ortakların bakiyesini toplar
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
    // Taşıt alımı ve satışı hariç, araç ID'si ile ilişkilendirilmiş tüm giderleri toplar
    return data.transactions
        .filter(t => t.vehicle_id === vehicleId && t.status !== 'iptal')
        .reduce((sum, t) => {
            const flow = getCashFlowType(t.category);
            // Taşıt alımı hariç tüm 'out' akışlarını ve 'komisyon' (gelir ama masraf sayılabilir) ekle
            if (flow === 'out' && t.category !== 'tasit-alimi') {
                 return sum + Number(t.amount || 0);
            }
             // Komisyonları da masraf olarak ekleyebiliriz (opsiyonel)
            // if (t.category === 'komisyon') {
            //     return sum + Number(t.amount || 0);
            // }
            return sum;
        }, 0);
}

// +++ TAŞINDI: script-ui-vehicle.js'den buraya taşındı +++
// Bu bir hesaplama fonksiyonudur ve core'da olmalıdır.
function calculateProfit(vehicle) {
    const expenses = getVehicleExpenses(vehicle.id);
    const salePrice = vehicle.sale_price || 0;
    const purchasePrice = vehicle.purchase_price || 0;
    return salePrice - purchasePrice - expenses;
}
// +++ TAŞIMA SONU +++

function applyPaymentToScheduleNextOnly(schedule, amount) {
    let remainingPayment = amount;
    let appliedAmount = 0;

    // Taksitleri vade tarihine göre sırala
    const sortedInstallments = schedule.installments.sort((a, b) => new Date(a.due_date) - new Date(b.due_date));

    for (const inst of sortedInstallments) {
        if (inst.status === 'bekleniyor' && remainingPayment > 0) {
            const needed = inst.amount - (inst.paid_amount || 0);
            const payment = Math.min(remainingPayment, needed);

            inst.paid_amount = (inst.paid_amount || 0) + payment;
            schedule.paid_amount = (schedule.paid_amount || 0) + payment;
            appliedAmount += payment;
            remainingPayment -= payment;

            // Küsürat hatalarını önlemek için küçük bir toleransla kontrol et
            if (Math.abs(inst.paid_amount - inst.amount) < 0.01) {
                inst.status = 'tamamlandi';
            }
             // Ödeme bittiyse döngüden çık
             if (remainingPayment <= 0.01) break;
        }
    }

    schedule.remaining = schedule.total_amount - schedule.paid_amount;
     // Kalan tutar negatif olamaz veya çok küçük bir negatif değer olabilir (küsürat)
    if (schedule.remaining < 0 && Math.abs(schedule.remaining) < 0.01) {
        schedule.remaining = 0;
    }


    // Planın tamamlanıp tamamlanmadığını kontrol et
    const isCompleted = schedule.installments.every(inst => inst.status === 'tamamlandi');
    // Veya kalan tutar sıfıra çok yakınsa tamamlanmış say
    const isEffectivelyCompleted = Math.abs(schedule.remaining) < 0.01;

    if (isCompleted || isEffectivelyCompleted) {
        schedule.status = 'tamamlandi';
        schedule.remaining = 0; // Kalanı sıfırla
    }

    return appliedAmount;
}

/* ====================================================================
   5. ORTAK HESAPLAMA MANTIĞI
   ==================================================================== */

function calculateCariBalance(personId) {
    const txs = (data.transactions || []).filter(t => t && t.person_id === personId && t.status !== 'iptal' && !t.virtual); // Sanal işlemleri hariç tut
    let balance = 0; // Pozitif: Alacaklıyız, Negatif: Borçluyuz

    for (const t of txs) {
        // Cari Borç/Alacak işlemleri (Bizim açımızdan)
        if (t.category === 'verilen-borc') {
            balance += Number(t.amount || 0); // Biz verdik -> Alacak (+)
            continue;
        }
        if (t.category === 'alinan-borc') {
            balance -= Number(t.amount || 0); // Biz aldık -> Borç (-)
            continue;
        }

        // Sermaye işlemleri cari bakiyeyi etkilemez
        if (t.category === 'asli-ortak-sermaye-giris' || t.category === 'asli-ortak-sermaye-cikis') {
            continue;
        }

        // Taşıt Alımı Ortak Payı (Ortak ödedi, biz ona borçlandık)
        if (t.category === 'tasit-alimi' && t.account === 'not-applicable') {
             balance -= Number(t.amount || 0); // Ortak ödedi -> Borç (-)
             continue;
        }

        // Normal nakit akışları (Cari kişiyle ilişkili)
        const flow = getCashFlowType(t.category);
        const txAmount = Number(t.amount || 0);

        // Kasa/Bankadan kişiye ödeme (örn: maaş, sair gider ödemesi)
        if (flow === 'out' && (t.account === 'kasa' || t.account === 'banka')) {
            balance += txAmount; // Para bizden çıktı -> Alacak (+)
        }
        // Kişiden Kasa/Bankaya ödeme (örn: gelen-tl tahsilat)
        else if (flow === 'in' && (t.account === 'kasa' || t.account === 'banka')) {
            balance -= txAmount; // Para bize geldi -> Borç (-)
        }
    }

    // Ödeme planlarını dahil et
    const scheds = (data.schedules || []).filter(s => s && s.person_id === personId && s.status !== 'iptal' && s.status !== 'tamamlandi');
    for (const s of scheds) {
        const remainingAmount = Number(s.remaining || 0);
        if (s.type === 'alacak') {
            balance += remainingAmount; // Alacak Planı -> Alacak (+)
        } else if (s.type === 'borc') {
            balance -= remainingAmount; // Borç Planı -> Borç (-)
        }
    }

    return balance;
}


function calculateSermayeBalance(personId) {
    // Sermaye hareketlerini hesaplar (Sadece asli ortaklar için anlamlı)
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

// DÜZENLENDİ: Hem borçları hem de araç bildirimlerini kontrol eder
function checkAllNotifications() {
    const bell = document.getElementById('notification-bell');
    if (!bell) return;

    // Önceki uyarıları temizle
    bell.classList.remove('alert-danger', 'alert-warning');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const notifications = []; // { level: 'error' | 'warning', message: '...' }

    // 1. Vadesi Gelen Borçları Kontrol Et
    const dueDebts = data.schedules.filter(s =>
        s.type === 'borc' && s.status !== 'tamamlandi' && s.status !== 'iptal'
    );
    dueDebts.forEach(debt => {
        // Sadece durumu 'bekleniyor' olan ilk taksidi bul
        const nextPayment = debt.installments
                              .filter(i => i.status === 'bekleniyor')
                              .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))[0];
        if (nextPayment) {
            const dueDate = new Date(nextPayment.due_date + 'T00:00:00'); // Local time olarak ayarla
            const timeDiff = dueDate.getTime() - today.getTime();
            // DÜZELTME: Math.ceil -> Math.round olarak değiştirildi. Saat farkları sıfırlandığı için en doğru yöntem budur.
            const daysDiff = Math.round(timeDiff / (1000 * 3600 * 24));

            if (daysDiff < 0) {
                notifications.push({ type: 'debt', level: 'error', message: `Borç vadesi geçti.`, scheduleId: debt.id });
            } else if (daysDiff <= DEBT_ALERT_DAYS) {
                notifications.push({ type: 'debt', level: 'warning', message: `Borç vadesi yaklaşıyor.`, scheduleId: debt.id });
            }
        }
    });

    // 2. Araç Bildirimlerini Kontrol Et
    const vehiclesInStock = data.vehicles.filter(v => v.type === 'owned' && v.status === 'stokta');
    vehiclesInStock.forEach(vehicle => {
        // Yeni araç uyarısı (Sigorta/Muayene Eksik)
        const purchaseDate = new Date(vehicle.purchase_date + 'T00:00:00');
        const timeDiffPurchase = today.getTime() - purchaseDate.getTime();
        // DÜZELTME: Math.ceil -> Math.round olarak değiştirildi.
        const daysSincePurchase = Math.round(timeDiffPurchase / (1000 * 3600 * 24));
        if (daysSincePurchase >= 0 && daysSincePurchase <= VEHICLE_NEW_ALERT_DAYS && (!vehicle.insurance_expiry || !vehicle.inspection_expiry)) {
             notifications.push({ type: 'vehicle', level: 'warning', message: `${vehicle.plate} için sigorta/muayene bilgisi girilmedi.`, vehicleId: vehicle.id });
        }

        // Vade uyarıları (Sigorta/Muayene)
        const checks = [
            { date: vehicle.insurance_expiry, type: 'Sigorta' },
            { date: vehicle.inspection_expiry, type: 'Muayene' }
        ];
        checks.forEach(check => {
            if (check.date) {
                const expiryDate = new Date(check.date + 'T00:00:00');
                const timeDiffExpiry = expiryDate.getTime() - today.getTime();
                // DÜZELTME: Math.ceil -> Math.round olarak değiştirildi.
                const daysDiff = Math.round(timeDiffExpiry / (1000 * 3600 * 24));

                if (daysDiff < 0) {
                    // Sadece daha önce aynı araç için aynı tipte error yoksa ekle
                    if (!notifications.some(n => n.vehicleId === vehicle.id && n.message.includes(check.type) && n.level === 'error')) {
                        notifications.push({ type: 'vehicle', level: 'error', message: `${vehicle.plate} ${check.type} vadesi geçti.`, vehicleId: vehicle.id });
                    }
                } else if (daysDiff <= 30) {
                     // Sadece daha önce aynı araç için aynı tipte error veya warning yoksa ekle
                    if (!notifications.some(n => n.vehicleId === vehicle.id && n.message.includes(check.type))) {
                        notifications.push({ type: 'vehicle', level: 'warning', message: `${vehicle.plate} ${check.type} vadesi yaklaşıyor.`, vehicleId: vehicle.id });
                    }
                }
            }
        });
    });

    // 3. En yüksek uyarı seviyesini bul ve uygula
    const hasError = notifications.some(n => n.level === 'error');
    const hasWarning = notifications.some(n => n.level === 'warning');

    if (hasError) {
        bell.classList.add('alert-danger');
        updateStatusIndicator('error', 'Acil Bildirim Var');
        // updateAlertState('danger');  // ← KALDIRILDI (temiz_cozum.md geri alma)
    } else if (hasWarning) {
        bell.classList.add('alert-warning');
        updateStatusIndicator('busy', 'Önemli Bildirim');
        // updateAlertState('warning');  // ← KALDIRILDI (temiz_cozum.md geri alma)
    } else {
        // Eğer önceki durumda indicator'da hata/uyarı varsa ve şimdi yoksa 'Hazır'a dön
        const currentStatus = document.getElementById('status-indicator')?.dataset.status;
        if (currentStatus === 'error' || currentStatus === 'busy') {
            updateStatusIndicator('ready', 'Hazır');
        } else if (!currentStatus) { // İlk yükleme durumu
             updateStatusIndicator('ready', 'Hazır');
        }
        // updateAlertState('ready');  // ← KALDIRILDI (temiz_cozum.md geri alma)
    }
}


function toast(message, type = 'info') {
    const container = document.body;
    // Aynı anda çok fazla toast oluşmasını engelle
    if (container.querySelectorAll('.toast').length > 2) return;

    const toastEl = document.createElement('div');
    toastEl.className = `toast ${type}`;
    toastEl.textContent = message;
    container.appendChild(toastEl);

    // Animasyonla kaldır
    setTimeout(() => {
        toastEl.style.opacity = '0';
        toastEl.style.top = '0px';
        setTimeout(() => {
             toastEl.remove();
        }, 300); // CSS animasyon süresiyle eşleşmeli
    }, 2500);
}

/* ====================================================================
   TAŞITLAR BACKUP FONKSIYONU - script-core.js'deki save() sonuna EKLE
   ====================================================================*/

/**
 * Taşıtları otomatik yedekle
 * (Her save() yapıldığında çağrılacak)
 */
function autoBackupVehicles() {
    if (!data.vehicles) return; //

    const backup = { //
        timestamp: new Date().toISOString(), //
        count: data.vehicles.length, //
        vehicles: JSON.parse(JSON.stringify(data.vehicles)) //
    };

    localStorage.setItem('vehicles_backup_latest', JSON.stringify(backup)); //
    console.log(`💾 Taşıtlar yedeklendi (${backup.count} araç)`); //
}

/* ====================================================================
   MIGRATION FONKSIYONU - script-core.js'e ÇOK SONUNA EKLE (AGRESİF VERSİYON)
   ====================================================================*/

/**
 * Taşıtlara yeni detay alanlarını ekle (Agresif Versiyon)
 */
function migrateVehicleDetailsFields() {
    if (!data.vehicles || data.vehicles.length === 0) {
        console.log("ℹ️ Güncellenecek araç yok");
        return false;
    }

    let migrationCount = 0;
    console.log("🔄 Taşıt migration başladı...");

    data.vehicles.forEach((v, index) => {
        let needsSave = false;

        // Model Yılı - Yoksa/boşsa ekle
        if (!v.hasOwnProperty('model_year') || v.model_year === undefined || v.model_year === null) {
            v.model_year = null;
            needsSave = true;
        }

        // Kilometre - Yoksa/boşsa ekle
        if (!v.hasOwnProperty('km') || v.km === undefined || v.km === null) {
            v.km = null;
            needsSave = true;
        }

        // Tramer Kaydı - Yoksa/boşsa ekle
        if (!v.hasOwnProperty('tramer_record') || v.tramer_record === undefined) {
            v.tramer_record = null;
            needsSave = true;
        }

        // Boyalı Parçalar - Yoksa/boşsa ekle
        if (!v.hasOwnProperty('painted_parts') || !Array.isArray(v.painted_parts)) {
            v.painted_parts = [];
            needsSave = true;
        }

        // Galeride mi? - Yoksa ekle
        if (!v.hasOwnProperty('in_garage') || v.in_garage === undefined) {
            v.in_garage = true;
            needsSave = true;
        }

        // Konum - Yoksa ekle
        if (!v.hasOwnProperty('location') || v.location === undefined) {
            v.location = "";
            needsSave = true;
        }

        // Notlar - Yoksa ekle
        if (!v.hasOwnProperty('notes') || v.notes === undefined) {
            v.notes = "";
            needsSave = true;
        }

        if (needsSave) {
            migrationCount++;
            console.log(`  ✓ Araç #${v.id} güncellendi`);
        }
    });

    // Kaydet
    if (migrationCount > 0) {
        save();
        console.log(`✅ ${migrationCount} taşıtta detay alanları eklendi`);
        return true;
    }

    console.log("✅ Tüm taşıtlar zaten güncellenmiş");
    return false;
}
// ============================================================================
// TAŞIT KARTI HELPER FONKSİYONLAR
// ============================================================================

/**
 * Boolean değeri parse et (1/0, true/false, "1"/"0" değerlerini destekler)
 * @param {*} value - Parse edilecek değer
 * @returns {boolean} Boolean değer
 */
function parseBoolean(value) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value === 1;
    if (typeof value === 'string') {
        const lower = value.toLowerCase().trim();
        return lower === '1' || lower === 'true' || lower === 'evet';
    }
    return false;
}

/**
 * Tarihi Türkçe formatla (GG.AA.YYYY)
 * @param {string} dateString - ISO tarih string (YYYY-MM-DD)
 * @returns {string} Formatlanmış tarih veya boş string
 */
function formatDateTurkish(dateString) {
    if (!dateString) return '';
    try {
        const [year, month, day] = dateString.split('-');
        return `${day}.${month}.${year}`;
    } catch (e) {
        return dateString;
    }
}

/**
 * Türkçe tarih formatından ISO formatına çevir (GG.AA.YYYY → YYYY-MM-DD)
 * @param {string} turkishDate - Türkçe tarih (GG.AA.YYYY)
 * @returns {string} ISO tarih veya boş string
 */
function parseTurkishDate(turkishDate) {
    if (!turkishDate) return '';
    try {
        const [day, month, year] = turkishDate.split('.');
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    } catch (e) {
        return turkishDate;
    }
}

/**
 * Fiyatı formatla (1234567 → 1.234.567 ₺)
 * @param {number} price - Fiyat
 * @param {boolean} showCurrency - Para birimi gösterilsin mi?
 * @returns {string} Formatlanmış fiyat
 */
function formatPrice(price, showCurrency = true) {
    if (!price && price !== 0) return showCurrency ? '0 ₺' : '0';
    const formatted = price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return showCurrency ? `${formatted} ₺` : formatted;
}

/**
 * String fiyatı sayıya çevir (1.234.567 → 1234567)
 * @param {string} priceString - Fiyat string
 * @returns {number} Sayı değer
 */
function parsePrice(priceString) {
    if (!priceString) return 0;
    return parseInt(priceString.toString().replace(/\./g, '')) || 0;
}

/**
 * Taşıt bilgilerini temizle ve normalize et
 * @param {Object} vehicleData - Form'dan gelen taşıt verisi
 * @returns {Object} Temizlenmiş taşıt verisi
 */
function normalizeVehicleData(vehicleData) {
    const normalized = { ...vehicleData };
    
    // Boolean alanları parse et
    const booleanFields = [
        'ruhsat', 'trafik_sigortasi', 'kasko', '2el_garanti',
        'takas', 'yakit_dolu', 'arac_takip', 'kredi_uygun'
    ];
    
    booleanFields.forEach(field => {
        if (normalized.hasOwnProperty(field)) {
            normalized[field] = parseBoolean(normalized[field]);
        }
    });
    
    // Sayısal alanları parse et
    const numberFields = ['purchase_price', 'sale_price', 'km', 'year'];
    numberFields.forEach(field => {
        if (normalized.hasOwnProperty(field)) {
            normalized[field] = parsePrice(normalized[field]);
        }
    });
    
    // Tarih alanlarını kontrol et (zaten ISO formatında olmalı)
    const dateFields = ['purchase_date', 'sale_date', 'last_maintenance_date'];
    dateFields.forEach(field => {
        if (normalized.hasOwnProperty(field) && !normalized[field]) {
            normalized[field] = null;
        }
    });
    
    return normalized;
}

/**
 * Taşıt durumunu kontrol et ve label döndür
 * @param {Object} vehicle - Taşıt objesi
 * @returns {Object} {status: 'string', label: 'string', color: 'string'}
 */
function getVehicleStatus(vehicle) {
    if (vehicle.sold) {
        return {
            status: 'sold',
            label: 'Satıldı',
            color: '#4ade80'
        };
    }
    
    if (!vehicle.in_garage) {
        return {
            status: 'outside',
            label: 'Galeride Değil',
            color: '#94a3b8'
        };
    }
    
    return {
        status: 'available',
        label: 'Galeride',
        color: '#60a5fa'
    };
}

/**
 * Taşıt için eksik belge listesini döndür
 * @param {Object} vehicle - Taşıt objesi
 * @returns {Array} Eksik belgelerin listesi
 */
function getMissingDocuments(vehicle) {
    const missing = [];
    
    if (!parseBoolean(vehicle.ruhsat)) {
        missing.push('Ruhsat');
    }
    if (!parseBoolean(vehicle.trafik_sigortasi)) {
        missing.push('Trafik Sigortası');
    }
    if (!parseBoolean(vehicle.kasko)) {
        missing.push('Kasko');
    }
    
    return missing;
}

/**
 * Taşıt ID'sinden taşıtı bul
 * @param {number|string} vehicleId - Taşıt ID
 * @returns {Object|null} Taşıt objesi veya null
 */
function findVehicleById(vehicleId) {
    const id = parseInt(vehicleId);
    return data.vehicles.find(v => v.id === id) || null;
}

/**
 * Form verilerini object'e çevir
 * @param {HTMLFormElement} form - Form elementi
 * @returns {Object} Form verileri
 */
function serializeForm(form) {
    const formData = new FormData(form);
    const obj = {};
    
    for (let [key, value] of formData.entries()) {
        obj[key] = value;
    }
    
    return obj;
}

// ===== TAŞIT KARTI HELPER FONKSİYONLARI =====

/**
 * Bildirim göster
 * @param {string} message - Gösterilecek mesaj
 * @param {string} type - Bildirim tipi (success, error, warning)
 */
function showNotification(message, type = 'success') {
    // Basit bir bildirim sistemi
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'error' ? '#ef4444' : '#10b981'};
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 10000;
        animation: slideIn 0.3s ease;
    `;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

/**
 * Yes/No buton grubu oluştur
 * @param {string} name - Input adı
 * @param {string} currentValue - Mevcut değer
 * @param {string} onClickFunction - Tıklama fonksiyonu
 * @param {number} vehicleId - Taşıt ID
 * @returns {string} HTML string
 */
function createYesNoButtons(name, currentValue, onClickFunction, vehicleId) {
    const isYes = currentValue === 'yes' || currentValue === true;
    const isNo = currentValue === 'no' || currentValue === false || !currentValue;
    
    return `
        <div class="yes-no-group">
            <button type="button" 
                    class="yes-no-btn ${isYes ? 'active' : ''}" 
                    data-value="yes"
                    onclick="${onClickFunction}(this, ${vehicleId})">
                Evet
            </button>
            <button type="button" 
                    class="yes-no-btn ${isNo ? 'active' : ''}" 
                    data-value="no"
                    onclick="${onClickFunction}(this, ${vehicleId})">
                Hayır
            </button>
        </div>
    `;
}

/**
 * Taşıt durum badge'i oluştur
 * @param {string} status - Taşıt durumu
 * @returns {string} HTML string
 */
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

/**
 * Para formatla
 * @param {number|string} amount - Tutar
 * @returns {string} Formatlanmış tutar
 */
function formatCurrency(amount) {
    if (!amount) return '0 ₺';
    const num = parseFloat(amount);
    return num.toLocaleString('tr-TR') + ' ₺';
}

/**
 * Tarih formatla
 * @param {string} dateString - Tarih string
 * @returns {string} Formatlanmış tarih
 */
function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('tr-TR');
}

/**
 * Input değeri güvenli şekilde al
 * @param {string} id - Element ID
 * @returns {string} Input değeri
 */
function getInputValue(id) {
    const element = document.getElementById(id);
    return element ? element.value : '';
}

// --- SİLİNDİ: Yinelenen parseBoolean fonksiyonu ---
// Bu fonksiyon dosyanın başında zaten tanımlı.

/**
 * Taşıt kartı için input field oluştur
 * @param {string} label - Label metni
 * @param {string} id - Input ID
 * @param {string} value - Mevcut değer
 * @param {string} type - Input tipi
 * @returns {string} HTML string
 */
function createCardInput(label, id, value = '', type = 'text') {
    return `
        <div class="card-input-group">
            <label>${label}</label>
            <input type="${type}" 
                   id="${id}" 
                   value="${value || ''}" 
                   onchange="saveVehicleData(${id.split('-').pop()})">
        </div>
    `;
}

/**
 * Taşıt verilerini kaydet (genel)
 * @param {number} vehicleId - Taşıt ID
 */
function saveVehicleData(vehicleId) {
    const vehicle = findVehicleById(vehicleId);
    if (!vehicle) return;
    
    // Tüm input'ları topla ve kaydet
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