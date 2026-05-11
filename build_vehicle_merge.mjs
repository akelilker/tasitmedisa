import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const workspaceDir = "C:/Users/Akel/Desktop/tasitmedisa";
const downloadsDir = "C:/Users/Akel/Downloads";
const medisaDocsDir = "C:/Users/Akel/Desktop/Medisa Belgeler";
const outputDir = `${workspaceDir}/outputs/vehicle-import`;
const outputPath = `${outputDir}/medisa_arac_aktarim_kontrol.xlsx`;
const fallbackOutputPath = `${outputDir}/medisa_arac_aktarim_kontrol_guncel.xlsx`;

const branchReference = [
  { id: "1769175216952", name: "Karyapı", city: "Konya" },
  { id: "1769175230543", name: "Karmotors", city: "Silivri" },
  { id: "1769175251066", name: "Medisa", city: "Karabük" },
  { id: "1769175273226", name: "Şenay Mobilya", city: "Karabük" },
];

const branchIdByName = new Map(branchReference.map((b) => [asciiKey(b.name), b.id]));

function asciiKey(value) {
  return String(value ?? "")
    .replace(/ı/g, "i")
    .replace(/İ/g, "I")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ç/g, "c")
    .replace(/Ç/g, "C")
    .replace(/ğ/g, "g")
    .replace(/Ğ/g, "G")
    .replace(/ö/g, "o")
    .replace(/Ö/g, "O")
    .replace(/ş/g, "s")
    .replace(/Ş/g, "S")
    .replace(/ü/g, "u")
    .replace(/Ü/g, "U")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function clean(value) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value;
  return typeof value === "string" ? value.trim() : value;
}

function compactText(value) {
  return String(clean(value) ?? "").replace(/\s+/g, " ").trim();
}

function normPlate(value) {
  return compactText(value)
    .toLocaleUpperCase("tr-TR")
    .replace(/[^0-9A-ZÇĞİÖŞÜ]/g, "");
}

function displayPlate(value) {
  const raw = normPlate(value);
  const match = raw.match(/^(\d{2})([A-ZÇĞİÖŞÜ]{1,3})(\d{2,5})$/);
  return match ? `${match[1]} ${match[2]} ${match[3]}` : compactText(value).toLocaleUpperCase("tr-TR");
}

function isLikelyPlate(value) {
  return /^\d{2}[A-ZÇĞİÖŞÜ]{1,3}\d{2,5}$/u.test(normPlate(value));
}

function truthyVarYok(value) {
  const key = asciiKey(value);
  if (!key) return "";
  if (["var", "x", "evet", "yes", "true", "1"].includes(key)) return true;
  if (["yok", "hayir", "hayır", "no", "false", "0"].includes(key)) return false;
  return "";
}

function varYokValue(value) {
  const resolved = truthyVarYok(value);
  if (resolved === true) return "var";
  if (resolved === false) return "yok";
  return "";
}

function excelSerialToDate(value) {
  if (typeof value !== "number" || Number.isNaN(value) || value < 25000 || value > 80000) return null;
  const epoch = Date.UTC(1899, 11, 30);
  return new Date(epoch + Math.round(value) * 86400000);
}

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value;
  if (typeof value === "number") return excelSerialToDate(value);
  const text = compactText(value);
  if (!text) return null;
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return new Date(Date.UTC(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3])));
  const trMatch = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (trMatch) return new Date(Date.UTC(Number(trMatch[3]), Number(trMatch[2]) - 1, Number(trMatch[1])));
  return null;
}

function isoDate(value) {
  const date = parseDate(value);
  if (!date) return "";
  return date.toISOString().slice(0, 10);
}

function sameValue(a, b) {
  if (!a && !b) return true;
  if (parseDate(a) || parseDate(b)) return isoDate(a) === isoDate(b);
  return asciiKey(a) === asciiKey(b);
}

function parseMoney(value) {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "number") return Math.round(value);
  let text = compactText(value).replace(/tl/ig, "").replace(/\s+/g, "");
  if (!text) return "";
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(text)) {
    text = text.replace(/\./g, "").replace(",", ".");
  } else {
    text = text.replace(/,/g, ".");
  }
  const n = Number(text.replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(n)) return compactText(value);
  return Math.round(n);
}

function normalizeBranchName(value, fallback = "") {
  const key = asciiKey(value || fallback);
  if (!key) return "";
  if (key.includes("karyapi")) return "Karyapı";
  if (key.includes("karmotors")) return "Karmotors";
  if (key.includes("senay")) return "Şenay Mobilya";
  if (key.includes("medisa") || key.includes("giresun")) return "Medisa";
  return compactText(value || fallback);
}

function inferVehicleType(value, brandModel = "") {
  const key = asciiKey(`${value} ${brandModel}`);
  if (!key) return "";
  if (key.includes("kamyon") && !key.includes("kamyonet")) return "kamyon";
  if (key.includes("romork")) return "kamyon";
  if (key.includes("minibus") || key.includes("kamyonet") || key.includes("van") || key.includes("transit") || key.includes("ducato") || key.includes("courier") || key.includes("ranger")) return "minivan";
  if (
    key.includes("otomobil") ||
    key.includes("sedan") ||
    key.includes("suv") ||
    key.includes("limousine") ||
    key.includes("hecbek") ||
    key.includes("hatchback") ||
    key.includes("focus") ||
    key.includes("city") ||
    key.includes("clio") ||
    key.includes("megane") ||
    key.includes("egea") ||
    key.includes("q2") ||
    key.includes("peugeot 301") ||
    key.includes("peugeot 508") ||
    key.includes("audi") ||
    key.includes("bmw") ||
    key.includes("jaguar") ||
    key.includes("mercedes e") ||
    key.includes("mercedes cls")
  ) return "otomobil";
  return "";
}

function normalizeTransmission(value) {
  const key = asciiKey(value);
  if (key.includes("otomatik")) return "otomatik";
  if (key.includes("manuel") || key.includes("manual")) return "manuel";
  return "";
}

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...await walk(full));
    else result.push(full);
  }
  return result;
}

async function findWorkbookPaths() {
  const downloads = (await fs.readdir(downloadsDir)).map((name) => path.join(downloadsDir, name));
  const docs = await walk(medisaDocsDir);
  const all = [...downloads, ...docs].filter((p) => /\.xlsx?$/i.test(p));
  const findOne = (predicate, label) => {
    const found = all.find((p) => predicate(asciiKey(path.basename(p)), asciiKey(p)));
    if (!found) throw new Error(`${label} bulunamadı.`);
    return found;
  };

  return {
    araclarMedisa: findOne((name, full) => name === "araclar medisa.xlsx" && full.includes("downloads"), "ARAÇLAR MEDİSA.xlsx"),
    aracSablon: findOne((name, full) => name === "arac sablon.xlsx" && full.includes("downloads"), "ARAÇ ŞABLON.xlsx"),
    v2Template: findOne((name, full) => name === "arac_yukleme_excel_sablonu_v2.xlsx" && full.includes("downloads"), "arac_yukleme_excel_sablonu_v2.xlsx"),
    policyList: findOne((name, full) => name === "medisa -karyapi-senay arac listesi.xlsx" && full.includes("tasitlar") && full.includes("web"), "MEDİSA -KARYAPI-ŞENAY ARAÇ LİSTESİ.XLSX"),
  };
}

async function importWorkbook(filePath) {
  return SpreadsheetFile.importXlsx(await FileBlob.load(filePath));
}

function worksheetMap(workbook) {
  const result = {};
  for (const ws of workbook.worksheets.items) {
    result[ws.name] = ws;
  }
  return result;
}

function findSheet(map, keywords) {
  const wanted = keywords.map(asciiKey);
  return Object.keys(map).find((name) => wanted.every((keyword) => asciiKey(name).includes(keyword))) || "";
}

function usedValues(ws) {
  if (!ws) return [];
  const used = ws.getUsedRange();
  return used?.values || [];
}

function buildHeaderIndex(headers) {
  const index = {};
  headers.forEach((header, i) => {
    const key = asciiKey(header).replace(/\n/g, " ");
    if (key) index[key] = i;
  });
  return index;
}

function readByHeader(row, headerIndex, candidates) {
  for (const candidate of candidates) {
    const key = asciiKey(candidate);
    if (Object.prototype.hasOwnProperty.call(headerIndex, key)) return row[headerIndex[key]];
  }
  return "";
}

function newVehicle(plateRaw) {
  return {
    plate: displayPlate(plateRaw),
    key: normPlate(plateRaw),
    branchName: "",
    branchId: "",
    sourceBranch: "",
    vehicleType: "",
    year: "",
    brandModel: "",
    km: "",
    price: "",
    transmission: "",
    tramer: "",
    tramerRecords: "",
    boya: "",
    boyaliParcalar: "",
    sigortaDate: "",
    kaskoDate: "",
    muayeneDate: "",
    anahtar: "",
    anahtarNerede: "",
    kredi: "",
    krediDetay: "",
    kaskoKodu: "",
    notes: "",
    tescilTarihi: "",
    uttsTanimlandi: "",
    takipCihaziMontaj: "",
    satildiMi: false,
    userName: "",
    userPhone: "",
    userMail: "",
    chassis: "",
    insuranceAgent: "",
    insuranceCompany: "",
    policyNo: "",
    renewalOffer: "",
    premium: "",
    exhaustDate: "",
    sourceRefs: new Set(),
    conflictNotes: [],
  };
}

const vehicles = new Map();
const excludedImportPlateKeys = new Set([
  normPlate("42 APZ 329"),
  normPlate("42 FKA 76"),
  normPlate("07 BDF 315"),
  normPlate("78 AAC 583"),
]);

const manualVehicleCorrections = new Map([
  [normPlate("42 ALS 78"), {
    year: "2024",
    brandModel: "BMW iX1 e-Drive",
    userName: "Ali Şenay",
  }],
  [normPlate("06 ACJ 578"), {
    year: "2023",
    brandModel: "Ford Focus",
  }],
  [normPlate("34 EGT 491"), {
    userName: "Doğu Bey",
  }],
  [normPlate("42 BAE 374"), {
    userName: "Alper Sungur",
  }],
]);

function ensureVehicle(plateRaw, sourceRef) {
  const key = normPlate(plateRaw);
  if (!key || !isLikelyPlate(plateRaw)) return null;
  if (!vehicles.has(key)) vehicles.set(key, newVehicle(plateRaw));
  const vehicle = vehicles.get(key);
  if (sourceRef) vehicle.sourceRefs.add(sourceRef);
  return vehicle;
}

function setField(vehicle, field, value, sourceRef, options = {}) {
  if (!vehicle) return;
  const next = clean(value);
  if (next === "" || next === null || next === undefined) return;
  const current = vehicle[field];
  if (current === "" || current === null || current === undefined) {
    vehicle[field] = next;
    return;
  }
  if (!sameValue(current, next)) {
    const currentText = current instanceof Date ? isoDate(current) : compactText(current);
    const nextText = next instanceof Date ? isoDate(next) : compactText(next);
    vehicle.conflictNotes.push(`${field}: "${currentText}" / "${nextText}" (${sourceRef})`);
    if (options.preferNew) vehicle[field] = next;
    if (options.preferLatestDate && parseDate(current) && parseDate(next)) {
      vehicle[field] = parseDate(next) > parseDate(current) ? next : current;
    }
  }
}

function setBranch(vehicle, branchRaw, sourceRef) {
  if (!vehicle) return;
  const sourceBranch = compactText(branchRaw);
  if (sourceBranch) setField(vehicle, "sourceBranch", sourceBranch, sourceRef);
  const branchName = normalizeBranchName(branchRaw);
  if (branchName) {
    setField(vehicle, "branchName", branchName, sourceRef, { preferNew: !vehicle.branchName });
    vehicle.branchId = branchIdByName.get(asciiKey(vehicle.branchName)) || "";
  }
}

function appendNote(vehicle, text) {
  const note = compactText(text);
  if (!vehicle || !note) return;
  const current = compactText(vehicle.notes);
  if (!current.includes(note)) vehicle.notes = current ? `${current} | ${note}` : note;
}

function mergeTemplateRows(rows, sourceRef) {
  if (!rows.length) return;
  const headers = rows[0] || [];
  const h = buildHeaderIndex(headers);
  for (const row of rows.slice(1)) {
    const plate = readByHeader(row, h, ["Plaka"]);
    const vehicle = ensureVehicle(plate, sourceRef);
    if (!vehicle) continue;
    setBranch(vehicle, readByHeader(row, h, ["Şube", "Sube"]), sourceRef);
    const brandModel = readByHeader(row, h, ["Marka ve Model"]);
    setField(vehicle, "brandModel", brandModel, sourceRef);
    setField(vehicle, "year", readByHeader(row, h, ["Model Yılı", "Model Yili"]), sourceRef);
    setField(vehicle, "vehicleType", inferVehicleType(readByHeader(row, h, ["Kasa Tipi"]), brandModel), sourceRef);
    setField(vehicle, "transmission", normalizeTransmission(readByHeader(row, h, ["Şanzıman", "Sanziman"])), sourceRef);
    setField(vehicle, "kaskoKodu", readByHeader(row, h, ["Kasko Kodu"]), sourceRef);
    setField(vehicle, "km", readByHeader(row, h, ["Güncel KM", "Guncel KM"]), sourceRef);
    setField(vehicle, "userName", readByHeader(row, h, ["Kullanıcı", "Kullanici"]), sourceRef);
    setField(vehicle, "userPhone", readByHeader(row, h, ["Kullanıcı Telefon", "Kullanici Telefon"]), sourceRef);
    setField(vehicle, "userMail", readByHeader(row, h, ["Kullanıcı Mail", "Kullanici Mail"]), sourceRef);
    setField(vehicle, "price", parseMoney(readByHeader(row, h, ["Araç Alış Bedeli", "Arac Alis Bedeli"])), sourceRef);
    setField(vehicle, "sigortaDate", parseDate(readByHeader(row, h, ["Sigorta Bitiş", "Sigorta Bitis"])), sourceRef);
    setField(vehicle, "kaskoDate", parseDate(readByHeader(row, h, ["Kasko Bitiş", "Kasko Bitis"])), sourceRef);
    setField(vehicle, "muayeneDate", parseDate(readByHeader(row, h, ["Muayne Bitiş", "Muayene Bitiş", "Muayne Bitis"])), sourceRef, { preferLatestDate: true });
    const kredi = varYokValue(readByHeader(row, h, ["Kredi Rehin"]));
    setField(vehicle, "kredi", kredi, sourceRef);
    setField(vehicle, "krediDetay", readByHeader(row, h, ["Kredi Rehin Bankası", "Kredi Rehin Bankasi"]), sourceRef);
    setField(vehicle, "uttsTanimlandi", truthyVarYok(readByHeader(row, h, ["UTTS(Var/Yok)", "UTTS"])), sourceRef);
    setField(vehicle, "takipCihaziMontaj", truthyVarYok(readByHeader(row, h, ["Taşıt Takip(Var/Yok)", "Tasit Takip(Var/Yok)"])), sourceRef);
    setField(vehicle, "boya", varYokValue(readByHeader(row, h, ["Boya/Değişen", "Boya/Degisen"])), sourceRef);
    setField(vehicle, "tramer", varYokValue(readByHeader(row, h, ["Tramer Kaydı", "Tramer Kaydi"])), sourceRef);
    const tire = readByHeader(row, h, ["Yazlık-Kışlık Lastik", "Yazlik-Kislik Lastik"]);
    if (tire) appendNote(vehicle, `Lastik: ${tire}`);
  }
}

function mergeAraclarMedisa(workbook, fileName) {
  const map = worksheetMap(workbook);

  const usersSheet = findSheet(map, ["MEDISA", "ARAC", "KULLANAN"]);
  for (const row of usedValues(map[usersSheet]).slice(1)) {
    const vehicle = ensureVehicle(row[1], `${fileName} > ${usersSheet}`);
    if (!vehicle) continue;
    setField(vehicle, "brandModel", row[2], usersSheet);
    setField(vehicle, "userName", row[3], usersSheet);
    setField(vehicle, "year", row[4], usersSheet);
    setBranch(vehicle, row[5], usersSheet);
    const rehin = compactText(row[6]);
    if (rehin) {
      setField(vehicle, "kredi", asciiKey(rehin) === "yok" ? "yok" : "var", usersSheet);
      if (asciiKey(rehin) !== "yok") setField(vehicle, "krediDetay", rehin, usersSheet);
    }
    const arvento = compactText(row[7]);
    if (arvento) appendNote(vehicle, `Arvento: ${arvento}`);
  }

  const kmSheet = findSheet(map, ["SAVAS", "KM"]);
  for (const row of usedValues(map[kmSheet]).slice(1)) {
    const vehicle = ensureVehicle(row[1], `${fileName} > ${kmSheet}`);
    if (!vehicle) continue;
    setField(vehicle, "km", row[2], kmSheet, { preferNew: !vehicle.km });
    setField(vehicle, "brandModel", row[3], kmSheet);
    setField(vehicle, "userName", row[4], kmSheet);
  }

  const sigortaSheet = findSheet(map, ["MEDISA", "SIGORTA"]);
  for (const row of usedValues(map[sigortaSheet]).slice(1)) {
    const vehicle = ensureVehicle(row[0], `${fileName} > ${sigortaSheet}`);
    if (!vehicle) continue;
    setField(vehicle, "insuranceAgent", row[1], sigortaSheet);
    setField(vehicle, "insuranceCompany", row[2], sigortaSheet);
    setField(vehicle, "sigortaDate", parseDate(row[3]), sigortaSheet);
  }

  const muayeneSheet = findSheet(map, ["MUAYENE"]);
  for (const row of usedValues(map[muayeneSheet]).slice(1)) {
    const vehicle = ensureVehicle(row[0], `${fileName} > ${muayeneSheet}`);
    if (!vehicle) continue;
    setField(vehicle, "muayeneDate", parseDate(row[1]), muayeneSheet, { preferLatestDate: true });
    setField(vehicle, "exhaustDate", parseDate(row[2]), muayeneSheet, { preferLatestDate: true });
  }

  const arventoSheet = findSheet(map, ["ARVENTO", "YOK"]);
  for (const row of usedValues(map[arventoSheet]).slice(1)) {
    const vehicle = ensureVehicle(row[1], `${fileName} > ${arventoSheet}`);
    if (!vehicle) continue;
    setField(vehicle, "userName", row[2], arventoSheet);
    setField(vehicle, "takipCihaziMontaj", false, arventoSheet);
    appendNote(vehicle, "Arvento yok");
  }

  const measureSheet = findSheet(map, ["OLCU"]);
  for (const row of usedValues(map[measureSheet]).slice(1)) {
    const vehicle = ensureVehicle(row[0], `${fileName} > ${measureSheet}`);
    if (!vehicle) continue;
    setField(vehicle, "brandModel", row[1], measureSheet);
    setBranch(vehicle, row[2], measureSheet);
    setField(vehicle, "userName", row[3], measureSheet);
    const dims = [
      row[4] ? `En: ${row[4]}` : "",
      row[5] ? `Boy: ${row[5]}` : "",
      row[6] ? `Yükseklik: ${row[6]}` : "",
      row[7] ? `Ölçü notu: ${row[7]}` : "",
    ].filter(Boolean).join(", ");
    appendNote(vehicle, dims);
  }

  const karyapiSheet = findSheet(map, ["KARYAPI", "ARAC", "KULLANAN"]);
  for (const row of usedValues(map[karyapiSheet]).slice(1)) {
    const vehicle = ensureVehicle(row[1], `${fileName} > ${karyapiSheet}`);
    if (!vehicle) continue;
    setBranch(vehicle, "Karyapı", karyapiSheet);
    setField(vehicle, "brandModel", [row[2], row[3]].filter(Boolean).join(" "), karyapiSheet);
    setField(vehicle, "userName", row[4], karyapiSheet);
  }

  const senayMobilyaSheet = findSheet(map, ["SENAY", "MOBILYA"]);
  for (const row of usedValues(map[senayMobilyaSheet]).slice(1)) {
    const vehicle = ensureVehicle(row[1], `${fileName} > ${senayMobilyaSheet}`);
    if (!vehicle) continue;
    setBranch(vehicle, row[4], senayMobilyaSheet);
    setField(vehicle, "brandModel", row[2], senayMobilyaSheet);
    setField(vehicle, "userName", row[3], senayMobilyaSheet);
  }

  const senayDayanikliSheet = findSheet(map, ["SENAY", "DAYANIKLI"]);
  for (const row of usedValues(map[senayDayanikliSheet]).slice(1)) {
    const vehicle = ensureVehicle(row[1], `${fileName} > ${senayDayanikliSheet}`);
    if (!vehicle) continue;
    setBranch(vehicle, row[4], senayDayanikliSheet);
    setField(vehicle, "brandModel", row[2], senayDayanikliSheet);
    setField(vehicle, "userName", row[3], senayDayanikliSheet);
  }
}

function mergePolicyList(workbook, fileName) {
  const map = worksheetMap(workbook);
  const sheetName = Object.keys(map)[0];
  const rows = usedValues(map[sheetName]);
  const headers = rows[0] || [];
  const h = buildHeaderIndex(headers);
  for (const row of rows.slice(1)) {
    const plate = readByHeader(row, h, ["PLAKA"]);
    const vehicle = ensureVehicle(plate, `${fileName} > ${sheetName}`);
    if (!vehicle) continue;
    const unvan = readByHeader(row, h, ["UNVAN"]);
    setBranch(vehicle, unvan, sheetName);
    setField(vehicle, "sourceBranch", compactText(unvan), sheetName);
    const kullanimTarzi = readByHeader(row, h, ["ARACIN KULLANIM TARZI"]);
    const marka = readByHeader(row, h, ["ARACIN MARKASI"]);
    const tipi = readByHeader(row, h, ["ARACIN TİPİ", "ARACIN TIPI"]);
    setField(vehicle, "vehicleType", inferVehicleType(kullanimTarzi, `${marka} ${tipi}`), sheetName, { preferNew: !vehicle.vehicleType });
    setField(vehicle, "year", readByHeader(row, h, ["ARACIN MODEL YILI"]), sheetName);
    setField(vehicle, "brandModel", [marka, tipi].filter(Boolean).join(" "), sheetName, { preferNew: true });
    setField(vehicle, "chassis", readByHeader(row, h, ["ŞASE", "SASE"]), sheetName);
    setField(vehicle, "price", parseMoney(readByHeader(row, h, ["ARAÇ BEDELİ", "ARAC BEDELI"])), sheetName, { preferNew: !vehicle.price });
    setField(vehicle, "policyNo", readByHeader(row, h, ["POLİÇE NO", "POLICE NO"]), sheetName);
    setField(vehicle, "renewalOffer", readByHeader(row, h, ["YENİLEME TEKLİFİ", "YENILEME TEKLIFI"]), sheetName);
    setField(vehicle, "premium", parseMoney(readByHeader(row, h, ["PRİM", "PRIM"])), sheetName);
    setField(vehicle, "muayeneDate", parseDate(readByHeader(row, h, ["Muayene Tarihi"])), sheetName, { preferLatestDate: true });
    setField(vehicle, "exhaustDate", parseDate(readByHeader(row, h, ["Egzoz Muayene"])), sheetName, { preferLatestDate: true });
    const markaKodu = readByHeader(row, h, ["MARKA KDU"]);
    const tipKodu = readByHeader(row, h, ["TİP KODU", "TIP KODU"]);
    if (markaKodu || tipKodu) appendNote(vehicle, `Kaynak kodlar: marka ${markaKodu || "-"} / tip ${tipKodu || "-"}`);

    // Dosyada başlıksız kalan rehin/banka alanları 18-19. indekslerde duruyor.
    const rehinBank = row[18];
    const rehinNo = row[19];
    if (compactText(rehinBank)) {
      const key = asciiKey(rehinBank);
      setField(vehicle, "kredi", key === "yok" ? "yok" : "var", sheetName);
      if (key !== "yok") setField(vehicle, "krediDetay", [rehinBank, rehinNo].filter(Boolean).join(" | "), sheetName);
    }
  }
}

async function readExistingSystem() {
  const raw = await fs.readFile(`${workspaceDir}/data/data.json`, "utf8");
  const data = JSON.parse(raw);
  const existing = new Map();
  for (const vehicle of data.tasitlar || []) {
    existing.set(normPlate(vehicle.plate), vehicle);
  }
  return existing;
}

function statusFor(vehicle) {
  const missing = [];
  if (!vehicle.plate) missing.push("Plaka");
  if (!vehicle.branchId) missing.push("Şube");
  if (!vehicle.vehicleType) missing.push("Taşıt Tipi");
  if (!vehicle.year) missing.push("Üretim Yılı");
  if (!vehicle.brandModel) missing.push("Marka / Model");
  if (!vehicle.km) missing.push("Km");
  if (!vehicle.transmission) missing.push("Şanzıman");
  if (missing.length) return { status: "EKSİK", note: `Eksik: ${missing.join(", ")}` };
  if (vehicle.conflictNotes.length) return { status: "KONTROL", note: `Çelişki: ${vehicle.conflictNotes.slice(0, 4).join(" | ")}` };
  return { status: "HAZIR", note: "" };
}

function makeRows(existingMap) {
  const all = [...vehicles.values()]
    .filter((vehicle) => !excludedImportPlateKeys.has(vehicle.key))
    .sort((a, b) => a.plate.localeCompare(b.plate, "tr"));
  return all.map((vehicle) => {
    vehicle.branchId = vehicle.branchId || branchIdByName.get(asciiKey(vehicle.branchName)) || "";
    const existing = existingMap.get(vehicle.key);
    const status = statusFor(vehicle);
    const conflict = [status.note, ...vehicle.conflictNotes].filter(Boolean).join(" | ");
    return {
      vehicle,
      existing,
      status,
      conflict,
    };
  });
}

function boolText(value) {
  if (value === true) return "Evet";
  if (value === false) return "Hayır";
  return "";
}

function excelText(value) {
  const text = compactText(value);
  return text ? `'${text}` : "";
}

function valuePresent(value, options = {}) {
  if (value === null || value === undefined || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object" && !(value instanceof Date)) return Object.keys(value).length > 0;
  if (typeof value === "boolean") return options.includeFalse ? true : value === true;
  return compactText(value) !== "";
}

function displayValue(value, key = "") {
  if (!valuePresent(value, { includeFalse: true })) return "";
  if (key === "branchId") {
    const branch = branchReference.find((item) => String(item.id) === String(value));
    return branch ? `${branch.name} (${branch.id})` : compactText(value);
  }
  if (value instanceof Date) return isoDate(value);
  if (typeof value === "boolean") return boolText(value);
  if (Array.isArray(value) || typeof value === "object") return JSON.stringify(value, null, 0);
  return compactText(value);
}

function sourceValueFor(vehicle, key) {
  if (key === "branchId") return vehicle.branchId;
  return vehicle[key];
}

function existingValueFor(existing, key) {
  if (!existing) return "";
  return existing[key];
}

function branchNameFromId(branchId) {
  const branch = branchReference.find((item) => String(item.id) === String(branchId));
  return branch?.name || "";
}

const carryOverFields = [
  ["branchId", "Tahsis Edilen Şube"],
  ["vehicleType", "Taşıt Tipi"],
  ["year", "Üretim Yılı"],
  ["brandModel", "Marka / Model"],
  ["km", "Km"],
  ["price", "Taşıtın Alım Bedeli"],
  ["transmission", "Şanzıman Tipi"],
  ["tramer", "Tramer Kaydı"],
  ["tramerRecords", "Tramer Kayıtları"],
  ["boya", "Boya / Değişen"],
  ["boyaliParcalar", "Boyalı/Değişen Parçalar"],
  ["sigortaDate", "Sigorta Bitiş Tarihi"],
  ["kaskoDate", "Kasko Bitiş Tarihi"],
  ["muayeneDate", "Muayene Bitiş Tarihi"],
  ["anahtar", "Yedek Anahtar"],
  ["anahtarNerede", "Anahtar Nerede"],
  ["kredi", "Kredi / Rehin Var mı?"],
  ["krediDetay", "Kredi / Rehin Detay"],
  ["kaskoKodu", "Kasko Kodu"],
  ["notes", "Notlar"],
  ["tescilTarihi", "Tescil Tarihi"],
  ["uttsTanimlandi", "UTTS Tanımlandı"],
  ["takipCihaziMontaj", "Taşıt Takip Montaj"],
];

function buildCarryOverRows(rows) {
  const result = [];
  for (const { vehicle, existing } of rows) {
    if (!existing) continue;
    for (const [key, label] of carryOverFields) {
      const systemValue = existingValueFor(existing, key);
      const sourceValue = sourceValueFor(vehicle, key);
      if (!valuePresent(systemValue)) continue;
      if (valuePresent(sourceValue)) continue;
      result.push([
        vehicle.plate,
        label,
        key,
        displayValue(systemValue, key),
        displayValue(sourceValue, key),
        existing.id || "",
        vehicle.branchName || displayValue(existing.branchId, "branchId"),
        [...vehicle.sourceRefs].join("; "),
        "Kaynak Excel'de boş; silmeden önce istenirse yeni aktarım tablosuna taşınmalı.",
      ]);
    }
  }
  return result.sort((a, b) => a[0].localeCompare(b[0], "tr") || a[1].localeCompare(b[1], "tr"));
}

function applyCarryOverFromExisting(existingMap) {
  const skipKeys = new Set(["tramer", "anahtar", "anahtarNerede"]);
  for (const vehicle of vehicles.values()) {
    const existing = existingMap.get(vehicle.key);
    if (!existing) continue;
    for (const [key] of carryOverFields) {
      if (skipKeys.has(key)) continue;
      const systemValue = existingValueFor(existing, key);
      if (!valuePresent(systemValue, { includeFalse: true })) continue;
      if (valuePresent(sourceValueFor(vehicle, key), { includeFalse: true })) continue;
      vehicle[key] = systemValue;
      if (key === "branchId") vehicle.branchName = branchNameFromId(systemValue) || vehicle.branchName;
      vehicle.sourceRefs.add("Mevcut sistemden taşındı");
    }
  }
}

function shouldUseManualTransmission(vehicle) {
  const key = asciiKey([vehicle.vehicleType, vehicle.brandModel, vehicle.notes].filter(Boolean).join(" "));
  return (
    vehicle.vehicleType === "kamyon" ||
    vehicle.vehicleType === "romork" ||
    vehicle.vehicleType === "minivan" ||
    key.includes("kamyon") ||
    key.includes("minibus") ||
    key.includes("minivan") ||
    key.includes("egea") ||
    key.includes("c max") ||
    key.includes("c-max") ||
    key.includes("cmax")
  );
}

function applyVehicleTypeRules() {
  for (const vehicle of vehicles.values()) {
    if (vehicle.vehicleType) continue;
    const inferredType = inferVehicleType("", vehicle.brandModel);
    if (!inferredType) continue;
    vehicle.vehicleType = inferredType;
    vehicle.sourceRefs.add("Marka/model tip kuralı");
  }
}

function applyManualVehicleCorrections() {
  for (const [plateKey, corrections] of manualVehicleCorrections) {
    const vehicle = vehicles.get(plateKey);
    if (!vehicle) continue;
    for (const [field, value] of Object.entries(corrections)) {
      vehicle[field] = value;
    }
    vehicle.sourceRefs.add("Kullanıcı manuel düzeltmesi");
  }
}

function applyTransmissionRules() {
  for (const vehicle of vehicles.values()) {
    if (vehicle.transmission || !shouldUseManualTransmission(vehicle)) continue;
    vehicle.transmission = "manuel";
    vehicle.sourceRefs.add("Kullanıcı vites kuralı");
  }
}

function buildWorkbook(rows, sourceInventory) {
  const workbook = Workbook.create();
  const summarySheet = workbook.worksheets.add("Ozet");
  const readySheet = workbook.worksheets.add("Aktarim_Hazir");
  const technicalSheet = workbook.worksheets.add("Teknik_Import");
  const sourceSheet = workbook.worksheets.add("Kaynak_Envanteri");
  const dictionarySheet = workbook.worksheets.add("Alan_Sozlugu");
  const carryOverSheet = workbook.worksheets.add("Sistemden_Tasinacak");
  const existingSheet = workbook.worksheets.add("Mevcut_Sistem");

  const total = rows.length;
  const ready = rows.filter((r) => r.status.status === "HAZIR").length;
  const missing = rows.filter((r) => r.status.status === "EKSİK").length;
  const control = rows.filter((r) => r.status.status === "KONTROL").length;
  const existingCount = rows.filter((r) => r.existing).length;
  const carryOverRows = buildCarryOverRows(rows);
  const carryOverVehicleCount = new Set(carryOverRows.map((row) => row[0])).size;
  const byBranch = branchReference.map((branch) => [branch.name, rows.filter((r) => r.vehicle.branchName === branch.name).length]);

  const summaryRows = [
    ["MEDISA Taşıt Aktarım Kontrol Dosyası", ""],
    ["Toplam tekil plaka", total],
    ["Hazır kayıt", ready],
    ["Eksik tamamlanacak", missing],
    ["Çelişki kontrolü isteyen", control],
    ["Sistemde zaten bulunan", existingCount],
    ["Sistemden taşınabilecek eksik alan", carryOverRows.length],
    ["Sistemden taşınabilecek araç", carryOverVehicleCount],
    ["Oluşturma zamanı", new Date().toLocaleString("tr-TR")],
    ["Not", "Bu dosya programa import yapmaz; önce Eksik/Çelişki Notu kolonları kontrol edilmeli."],
    ["Kritik Eksik", "Tramer ve yedek anahtar bilgisi kullanıcı kararıyla boş bırakıldı; şanzıman için verilen manuel vites kuralı uygulandı."],
    ["", ""],
    ["Şube dağılımı", "Adet"],
    ...byBranch,
  ];
  writeSheet(summarySheet, ["Konu", "Değer"], summaryRows, [260, 520]);

  const readyHeaders = [
    "Aktar?",
    "Kontrol Durumu",
    "Sistemde Var mı?",
    "Plaka",
    "Tahsis Edilen Şube",
    "Taşıt Tipi",
    "Üretim Yılı",
    "Marka / Model",
    "Km (Alındığı Tarih)",
    "Taşıtın Alım Bedeli",
    "Şanzıman Tipi",
    "Tramer Kaydı",
    "Tramer Kayıtları",
    "Boya / Değişen",
    "Boyalı/Değişen Parçalar",
    "Sigorta Bitiş Tarihi",
    "Kasko Bitiş Tarihi",
    "Muayene Bitiş Tarihi",
    "Yedek Anahtar",
    "Anahtar Nerede",
    "Kredi / Rehin Var mı?",
    "Kredi / Rehin Detay",
    "Kasko Kodu",
    "Notlar",
    "Tescil Tarihi",
    "UTTS Tanımlandı",
    "Taşıt Takip Montaj",
    "Kaynak Kullanıcı",
    "Kullanıcı Telefon",
    "Kullanıcı Mail",
    "Kaynak Şirket/Şube",
    "Şase",
    "Sigorta Acente",
    "Sigorta Şirket",
    "Poliçe No",
    "Yenileme Teklifi",
    "Prim",
    "Egzoz Muayene",
    "Kaynaklar",
    "Eksik/Çelişki Notu",
  ];

  const readyRows = rows.map(({ vehicle, existing, status, conflict }) => [
    status.status === "HAZIR" ? "Evet" : "Hayır",
    status.status,
    existing ? "Evet" : "Hayır",
    vehicle.plate,
    vehicle.branchName,
    vehicle.vehicleType,
    vehicle.year,
    vehicle.brandModel,
    vehicle.km,
    vehicle.price,
    vehicle.transmission,
    vehicle.tramer,
    vehicle.tramerRecords,
    vehicle.boya,
    vehicle.boyaliParcalar,
    parseDate(vehicle.sigortaDate),
    parseDate(vehicle.kaskoDate),
    parseDate(vehicle.muayeneDate),
    vehicle.anahtar,
    vehicle.anahtarNerede,
    vehicle.kredi,
    vehicle.krediDetay,
    vehicle.kaskoKodu,
    vehicle.notes,
    parseDate(vehicle.tescilTarihi),
    boolText(vehicle.uttsTanimlandi),
    boolText(vehicle.takipCihaziMontaj),
    vehicle.userName,
    vehicle.userPhone,
    vehicle.userMail,
    vehicle.sourceBranch,
    vehicle.chassis,
    vehicle.insuranceAgent,
    vehicle.insuranceCompany,
    vehicle.policyNo,
    vehicle.renewalOffer,
    vehicle.premium,
    parseDate(vehicle.exhaustDate),
    [...vehicle.sourceRefs].join("; "),
    conflict,
  ]);
  writeSheet(readySheet, readyHeaders, readyRows, [
    72, 110, 110, 120, 140, 105, 85, 280, 110, 150, 105, 95, 130, 105, 150, 120, 120, 120, 110, 150, 120, 260, 115, 340, 110, 110, 120, 190, 145, 180, 180, 220, 170, 170, 140, 140, 95, 120, 360, 520,
  ]);
  setDateColumns(readySheet, readyHeaders, readyRows.length, ["Sigorta Bitiş Tarihi", "Kasko Bitiş Tarihi", "Muayene Bitiş Tarihi", "Tescil Tarihi", "Egzoz Muayene"]);
  setTextColumns(readySheet, readyHeaders, readyRows.length, ["Poliçe No", "Yenileme Teklifi"]);
  setNumberColumns(readySheet, readyHeaders, readyRows.length, ["Km (Alındığı Tarih)", "Taşıtın Alım Bedeli", "Prim"]);

  const technicalHeaders = [
    "plate", "branchId", "vehicleType", "year", "brandModel", "km", "price", "transmission",
    "tramer", "tramerRecords", "boya", "boyaliParcalar", "sigortaDate", "kaskoDate", "muayeneDate",
    "anahtar", "anahtarNerede", "kredi", "krediDetay", "kaskoKodu", "notes", "tescilTarihi",
    "uttsTanimlandi", "takipCihaziMontaj", "satildiMi",
  ];
  const technicalRows = rows.map(({ vehicle }) => [
    vehicle.plate,
    vehicle.branchId,
    vehicle.vehicleType,
    vehicle.year,
    vehicle.brandModel,
    vehicle.km,
    vehicle.price,
    vehicle.transmission,
    vehicle.tramer,
    vehicle.tramerRecords,
    vehicle.boya,
    vehicle.boyaliParcalar,
    isoDate(vehicle.sigortaDate),
    isoDate(vehicle.kaskoDate),
    isoDate(vehicle.muayeneDate),
    vehicle.anahtar,
    vehicle.anahtarNerede,
    vehicle.kredi,
    vehicle.krediDetay,
    vehicle.kaskoKodu,
    vehicle.notes,
    isoDate(vehicle.tescilTarihi),
    vehicle.uttsTanimlandi === "" ? "" : Boolean(vehicle.uttsTanimlandi),
    vehicle.takipCihaziMontaj === "" ? "" : Boolean(vehicle.takipCihaziMontaj),
    false,
  ]);
  writeSheet(technicalSheet, technicalHeaders, technicalRows, [120, 150, 105, 80, 280, 105, 120, 105, 90, 140, 90, 150, 120, 120, 120, 95, 150, 95, 280, 115, 360, 120, 120, 130, 95]);
  setTextColumns(technicalSheet, technicalHeaders, technicalRows.length, ["branchId"]);
  setNumberColumns(technicalSheet, technicalHeaders, technicalRows.length, ["km", "price"]);

  writeSheet(sourceSheet, ["Kaynak Dosya", "Sekme", "Dolu Satır", "Kolon", "Not"], sourceInventory, [360, 220, 90, 70, 360]);

  const dictionaryRows = [
    ["Plaka", "plate", "Zorunlu", "Kaynaklarda plaka bazında tekilleştirildi."],
    ["Tahsis Edilen Şube", "branchId", "Zorunlu", "Şube adları uygulamadaki ID değerlerine eşlendi."],
    ["Taşıt Tipi", "vehicleType", "Zorunlu", "otomobil / minivan / kamyon / romork"],
    ["Üretim Yılı", "year", "Zorunlu", "Model yılı kaynaklarından alındı."],
    ["Marka / Model", "brandModel", "Zorunlu", "Resmi liste varsa marka + tip birleştirildi."],
    ["Km", "km", "Zorunlu", "Savaş bey-km veya import şablonu kaynak alındı."],
    ["Şanzıman", "transmission", "Zorunlu", "manuel / otomatik; kamyon, Egea, Ford C-Max, minibüs ve minivanlar manuel kabul edildi."],
    ["Tramer", "tramer", "Opsiyonel/sonra tamamlanacak", "Kaynakta net bilgi yoksa boş bırakıldı."],
    ["Sigorta/Kasko/Muayene", "sigortaDate/kaskoDate/muayeneDate", "Opsiyonel", "Tarihler Excel tarih hücresi ve Teknik_Import'ta ISO metin."],
    ["Kredi/Rehin", "kredi/krediDetay", "Opsiyonel", "Hak mahrumiyeti veya banka alanlarından üretildi."],
    ["UTTS/Taşıt Takip", "uttsTanimlandi/takipCihaziMontaj", "Opsiyonel", "Kaynakta net VAR/YOK varsa işaretlendi."],
  ];
  writeSheet(dictionarySheet, ["Excel Alanı", "Program Alanı", "Durum", "Açıklama"], dictionaryRows, [180, 220, 110, 560]);

  writeSheet(carryOverSheet, [
    "Plaka",
    "Alan",
    "Program Alanı",
    "Sistemdeki Değer",
    "Kaynak Excel Değeri",
    "Mevcut Sistem ID",
    "Tahsis Edilen Şube",
    "Kaynaklar",
    "Öneri",
  ], carryOverRows, [120, 180, 170, 420, 180, 140, 180, 420, 420]);

  const existingRows = rows.filter((r) => r.existing).map(({ existing }) => [
    existing.id || "",
    existing.plate || "",
    existing.branchId || "",
    existing.vehicleType || "",
    existing.year || "",
    existing.brandModel || "",
    existing.km || "",
    existing.price || "",
    existing.transmission || "",
    existing.tramer || "",
    existing.boya || "",
    existing.sigortaDate || "",
    existing.kaskoDate || "",
    existing.muayeneDate || "",
    existing.kredi || "",
    existing.notes || "",
  ]);
  writeSheet(existingSheet, ["ID", "Plaka", "Şube ID", "Taşıt Tipi", "Yıl", "Marka/Model", "Km", "Bedel", "Şanzıman", "Tramer", "Boya", "Sigorta", "Kasko", "Muayene", "Kredi", "Notlar"], existingRows, [140, 120, 150, 105, 80, 260, 105, 120, 105, 90, 90, 115, 115, 115, 90, 360]);
  setTextColumns(existingSheet, ["ID", "Plaka", "Şube ID", "Taşıt Tipi", "Yıl", "Marka/Model", "Km", "Bedel", "Şanzıman", "Tramer", "Boya", "Sigorta", "Kasko", "Muayene", "Kredi", "Notlar"], existingRows.length, ["ID", "Şube ID"]);

  styleWorkbook([summarySheet, readySheet, technicalSheet, sourceSheet, dictionarySheet, carryOverSheet, existingSheet]);
  return workbook;
}

function writeSheet(sheet, headers, rows, widths) {
  sheet.getRangeByIndexes(0, 0, 1, headers.length).values = [headers];
  if (rows.length) sheet.getRangeByIndexes(1, 0, rows.length, headers.length).values = rows;
  const rowCount = Math.max(2, rows.length + 1);
  const range = sheet.getRangeByIndexes(0, 0, rowCount, headers.length);
  range.format.wrapText = true;
  headers.forEach((_, i) => {
    sheet.getRange(`${columnName(i)}:${columnName(i)}`).format.columnWidthPx = widths[i] || 120;
  });
  sheet.freezePanes.freezeRows(1);
}

function columnName(index) {
  let n = index + 1;
  let name = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

function setDateColumns(sheet, headers, rowCount, dateHeaders) {
  for (const header of dateHeaders) {
    const idx = headers.indexOf(header);
    if (idx >= 0 && rowCount) {
      sheet.getRange(`${columnName(idx)}2:${columnName(idx)}${rowCount + 1}`).setNumberFormat("yyyy-mm-dd");
    }
  }
}

function setTextColumns(sheet, headers, rowCount, textHeaders) {
  for (const header of textHeaders) {
    const idx = headers.indexOf(header);
    if (idx >= 0 && rowCount) {
      sheet.getRange(`${columnName(idx)}2:${columnName(idx)}${rowCount + 1}`).setNumberFormat("@");
    }
  }
}

function setNumberColumns(sheet, headers, rowCount, numberHeaders) {
  for (const header of numberHeaders) {
    const idx = headers.indexOf(header);
    if (idx >= 0 && rowCount) {
      sheet.getRange(`${columnName(idx)}2:${columnName(idx)}${rowCount + 1}`).setNumberFormat("#,##0");
    }
  }
}

function styleWorkbook(sheets) {
  const headerFormat = {
    fill: "#7a0012",
    font: { bold: true, color: "#FFFFFF" },
    horizontalAlignment: "center",
    verticalAlignment: "middle",
  };
  for (const sheet of sheets) {
    const used = sheet.getUsedRange();
    if (!used) continue;
    const colCount = used.values?.[0]?.length || 1;
    sheet.getRangeByIndexes(0, 0, 1, colCount).format = headerFormat;
    sheet.getRangeByIndexes(0, 0, used.values.length || 1, colCount).format.verticalAlignment = "top";
  }
}

function sourceInventoryFromWorkbook(fileName, workbook) {
  return workbook.worksheets.items.map((ws) => {
    const rows = usedValues(ws);
    const nonEmptyRows = rows.filter((row) => row.some((cell) => cell !== null && cell !== undefined && cell !== "")).length;
    const cols = rows.reduce((max, row) => Math.max(max, row.length), 0);
    return [fileName, ws.name, nonEmptyRows, cols, ""];
  });
}

async function saveWorkbookBlob(blob) {
  try {
    await blob.save(outputPath);
    return outputPath;
  } catch (error) {
    if (error?.code !== "EBUSY") throw error;
    await blob.save(fallbackOutputPath);
    return fallbackOutputPath;
  }
}

async function main() {
  const paths = await findWorkbookPaths();
  const existingMap = await readExistingSystem();
  const sourceInventory = [];

  const araclarMedisa = await importWorkbook(paths.araclarMedisa);
  const aracSablon = await importWorkbook(paths.aracSablon);
  const v2Template = await importWorkbook(paths.v2Template);
  const policyList = await importWorkbook(paths.policyList);

  sourceInventory.push(...sourceInventoryFromWorkbook(path.basename(paths.araclarMedisa), araclarMedisa));
  sourceInventory.push(...sourceInventoryFromWorkbook(path.basename(paths.aracSablon), aracSablon));
  sourceInventory.push(...sourceInventoryFromWorkbook(path.basename(paths.v2Template), v2Template));
  sourceInventory.push(...sourceInventoryFromWorkbook(path.basename(paths.policyList), policyList));

  mergeTemplateRows(usedValues(worksheetMap(aracSablon)["Arac Yukleme"]), `${path.basename(paths.aracSablon)} > Arac Yukleme`);
  mergeAraclarMedisa(araclarMedisa, path.basename(paths.araclarMedisa));
  mergePolicyList(policyList, path.basename(paths.policyList));

  applyCarryOverFromExisting(existingMap);
  applyManualVehicleCorrections();
  applyVehicleTypeRules();
  applyTransmissionRules();

  const rows = makeRows(existingMap);
  const workbook = buildWorkbook(rows, sourceInventory);

  await fs.mkdir(outputDir, { recursive: true });
  const outBlob = await SpreadsheetFile.exportXlsx(workbook);
  const savedPath = await saveWorkbookBlob(outBlob);

  console.log(JSON.stringify({
    outputPath: savedPath,
    requestedOutputPath: outputPath,
    totalVehicles: rows.length,
    ready: rows.filter((r) => r.status.status === "HAZIR").length,
    missing: rows.filter((r) => r.status.status === "EKSİK").length,
    control: rows.filter((r) => r.status.status === "KONTROL").length,
    sourceFiles: Object.values(paths),
  }, null, 2));
}

await main();
