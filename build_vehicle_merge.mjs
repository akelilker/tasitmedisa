import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const downloadsDir = "C:/Users/Akel/Downloads";
const files = await fs.readdir(downloadsDir);
const medisaFile = files.find((f) => f.toUpperCase().includes("MEDI"));
const templateFile = files.find((f) => f.toUpperCase().includes("YUKLEME") && f.toUpperCase().includes("SABLON"));

if (!medisaFile) throw new Error("MEDISA dosyasi bulunamadi.");
if (!templateFile) throw new Error("SABLON dosyasi bulunamadi.");

const medisaPath = path.join(downloadsDir, medisaFile);
const templatePath = path.join(downloadsDir, templateFile);

const medisaWb = await SpreadsheetFile.importXlsx(await FileBlob.load(medisaPath));
const templateWb = await SpreadsheetFile.importXlsx(await FileBlob.load(templatePath));

const sheetMap = {};
for (const ws of medisaWb.worksheets.items) sheetMap[ws.name] = ws;

const simplify = (v) =>
  (v ?? "")
    .toString()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();

function findSheetByKeywords(keywords) {
  const wanted = keywords.map(simplify);
  const names = Object.keys(sheetMap);
  return (
    names.find((name) => {
      const current = simplify(name);
      return wanted.every((k) => current.includes(k));
    }) ?? null
  );
}

const normPlate = (v) => (v ?? "").toString().toUpperCase().replace(/\s+/g, "").trim();
const clean = (v) => {
  if (v === null || v === undefined) return "";
  return typeof v === "string" ? v.trim() : v;
};
const excelSerialToDate = (v) => {
  if (typeof v !== "number" || Number.isNaN(v) || v < 30000 || v > 60000) return "";
  const epoch = Date.UTC(1899, 11, 30);
  return new Date(epoch + v * 86400000);
};

const vehicles = new Map();
const ensureVehicle = (plateRaw) => {
  const normalized = normPlate(plateRaw);
  if (!normalized) return null;
  if (!vehicles.has(normalized)) {
    vehicles.set(normalized, {
      plate: clean(plateRaw),
      branch: "",
      brandModel: "",
      modelYear: "",
      user: "",
      arvento: "",
      km: "",
      insuranceAgent: "",
      insuranceCompany: "",
      insuranceEnd: "",
      inspectionDate: "",
      exhaustDate: "",
      width: "",
      length: "",
      height: "",
      dimensionNote: "",
      sourceSheets: new Set(),
    });
  }
  return vehicles.get(normalized);
};

function upsertBaseRows(rows, fieldMap, sourceName) {
  for (const row of rows) {
    const plate = row[fieldMap.plate];
    const item = ensureVehicle(plate);
    if (!item) continue;
    item.sourceSheets.add(sourceName);
    if (!item.branch && fieldMap.branch !== undefined) item.branch = clean(row[fieldMap.branch]);
    if (!item.brandModel && fieldMap.brandModel !== undefined) item.brandModel = clean(row[fieldMap.brandModel]);
    if (!item.modelYear && fieldMap.modelYear !== undefined) item.modelYear = clean(row[fieldMap.modelYear]);
    if (!item.user && fieldMap.user !== undefined) item.user = clean(row[fieldMap.user]);
    if (!item.arvento && fieldMap.arvento !== undefined) item.arvento = clean(row[fieldMap.arvento]);
  }
}

function tableValues(sheetName) {
  const ws = sheetMap[sheetName];
  if (!ws) return [];
  const used = ws.getUsedRange();
  if (!used) return [];
  return used.values || [];
}

const medisaUsersSheet = findSheetByKeywords(["MEDISA", "ARAC", "KULLANAN"]);
const karyapiSheet = findSheetByKeywords(["KARYAPI", "ARAC", "KULLANAN"]);
const senayMobilyaSheet = findSheetByKeywords(["SENAY", "MOBILYA"]);
const senayDayanikliSheet = findSheetByKeywords(["SENAY", "DAYANIKLI"]);
const kmSheet = findSheetByKeywords(["SAVAS", "KM"]);
const insuranceSheet = findSheetByKeywords(["MEDISA", "SIGORTA"]);
const inspectionSheet = findSheetByKeywords(["MUAYENE"]);
const arventoSheet = findSheetByKeywords(["ARVENTO", "YOK"]);
const sizeSheet = findSheetByKeywords(["OLCU"]);

const medisaUsers = tableValues(medisaUsersSheet);
upsertBaseRows(medisaUsers.slice(1), {
  plate: 1,
  brandModel: 2,
  user: 3,
  modelYear: 4,
  branch: 5,
  arvento: 7,
}, medisaUsersSheet ?? "MEDISA_KULLANAN");

const karyapi = tableValues(karyapiSheet);
for (const row of karyapi.slice(1)) {
  const plate = row[1];
  const item = ensureVehicle(plate);
  if (!item) continue;
  item.sourceSheets.add(karyapiSheet ?? "KARYAPI");
  const brand = clean(row[2]);
  const model = clean(row[3]);
  if (!item.brandModel) item.brandModel = [brand, model].filter(Boolean).join(" ");
  if (!item.branch) item.branch = "KARYAPI";
  if (!item.user) item.user = clean(row[4]);
}

const senayM = tableValues(senayMobilyaSheet);
upsertBaseRows(senayM.slice(1), { plate: 1, brandModel: 2, user: 3, branch: 4 }, senayMobilyaSheet ?? "SENAY_MOBILYA");

const senayD = tableValues(senayDayanikliSheet);
upsertBaseRows(senayD.slice(1), { plate: 1, brandModel: 2, user: 3, branch: 4 }, senayDayanikliSheet ?? "SENAY_DAYANIKLI");

const kmRows = tableValues(kmSheet).slice(1);
for (const row of kmRows) {
  const item = ensureVehicle(row[1]);
  if (!item) continue;
  item.sourceSheets.add(kmSheet ?? "KM");
  if (!item.km && row[2] !== null && row[2] !== "") item.km = row[2];
  if (!item.brandModel && row[3]) item.brandModel = clean(row[3]);
  if (!item.user && row[4]) item.user = clean(row[4]);
}

const insuranceRows = tableValues(insuranceSheet).slice(1);
for (const row of insuranceRows) {
  const item = ensureVehicle(row[0]);
  if (!item) continue;
  item.sourceSheets.add(insuranceSheet ?? "SIGORTA");
  if (!item.insuranceAgent) item.insuranceAgent = clean(row[1]);
  if (!item.insuranceCompany) item.insuranceCompany = clean(row[2]);
  if (!item.insuranceEnd) item.insuranceEnd = excelSerialToDate(row[3]);
}

const inspectionRows = tableValues(inspectionSheet).slice(1);
for (const row of inspectionRows) {
  const item = ensureVehicle(row[0]);
  if (!item) continue;
  item.sourceSheets.add(inspectionSheet ?? "MUAYENE");
  if (!item.inspectionDate) item.inspectionDate = excelSerialToDate(row[1]);
  if (!item.exhaustDate) {
    item.exhaustDate = row[2] instanceof Date ? row[2] : excelSerialToDate(row[2]);
  }
}

const arventoYokRows = tableValues(arventoSheet).slice(1);
for (const row of arventoYokRows) {
  const item = ensureVehicle(row[1]);
  if (!item) continue;
  item.sourceSheets.add(arventoSheet ?? "ARVENTO");
  if (!item.user && row[2]) item.user = clean(row[2]);
  item.arvento = "YOK";
}

const sizeRows = tableValues(sizeSheet).slice(1);
for (const row of sizeRows) {
  const item = ensureVehicle(row[0]);
  if (!item) continue;
  item.sourceSheets.add(sizeSheet ?? "OLCU");
  if (!item.brandModel && row[1]) item.brandModel = clean(row[1]);
  if (!item.branch && row[2]) item.branch = clean(row[2]);
  if (!item.user && row[3]) item.user = clean(row[3]);
  if (!item.width) item.width = clean(row[4]);
  if (!item.length) item.length = clean(row[5]);
  if (!item.height) item.height = clean(row[6]);
  if (!item.dimensionNote) item.dimensionNote = clean(row[7]);
}

const outputWb = Workbook.create();
const importSheet = outputWb.worksheets.add("Arac Yukleme");
const modalSheet = outputWb.worksheets.add("Kayit_Modal_Import");
const controlSheet = outputWb.worksheets.add("Tum_Veriler_Kontrol");
const notesSheet = outputWb.worksheets.add("Notlar");

const importHeaders = (templateWb.worksheets.getItem("Arac Yukleme").getRange("A1:I1").values || [[
  "Plaka","Sube","Marka ve Model","Model Yili","Kasa Tipi","Sanziman","Kasko Kodu","Guncel KM","Kullanici"
]])[0];
importSheet.getRange("A1:I1").values = [importHeaders];

const allVehicles = [...vehicles.values()].sort((a, b) => a.plate.localeCompare(b.plate, "tr"));
const importRows = allVehicles.map((v) => [
  v.plate,
  v.branch,
  v.brandModel,
  v.modelYear,
  "",
  "",
  "",
  v.km,
  v.user,
]);
if (importRows.length) importSheet.getRangeByIndexes(1, 0, importRows.length, 9).values = importRows;

const toIso = (d) => {
  if (d instanceof Date && !Number.isNaN(d.valueOf())) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  return "";
};

const modalHeaders = [
  "plate",
  "year",
  "brandModel",
  "km",
  "vehicleType",
  "transmission",
  "tramer",
  "tramerRecords",
  "boya",
  "boyaliParcalar",
  "sigortaDate",
  "kaskoDate",
  "muayeneDate",
  "anahtar",
  "anahtarNerede",
  "kredi",
  "krediDetay",
  "branchName",
  "kaskoKodu",
  "price",
  "notes",
  "tescilTarihi",
  "uttsTanimlandi",
  "takipCihaziMontaj"
];
modalSheet.getRangeByIndexes(0, 0, 1, modalHeaders.length).values = [modalHeaders];

const modalRows = allVehicles.map((v) => [
  v.plate,
  v.modelYear || "",
  v.brandModel || "",
  v.km || "",
  "",
  "",
  "",
  "",
  "",
  "",
  toIso(v.insuranceEnd),
  "",
  toIso(v.inspectionDate),
  "",
  "",
  "",
  "",
  v.branch || "",
  "",
  "",
  "",
  "",
  false,
  false
]);
if (modalRows.length) {
  modalSheet.getRangeByIndexes(1, 0, modalRows.length, modalHeaders.length).values = modalRows;
}

const controlHeaders = [
  "Plaka","Sube/Sirket","Marka-Model","Model Yili","Kullanici","Arvento",
  "Guncel KM","Sigorta Acente","Sigorta Sirket","Sigorta Bitis","Muayene Tarihi",
  "Egzoz Muayene","En","Boy","Yukseklik","Olcu Notu","Kaynak Sekmeler"
];
controlSheet.getRangeByIndexes(0, 0, 1, controlHeaders.length).values = [controlHeaders];

const controlRows = allVehicles.map((v) => [
  v.plate,
  v.branch,
  v.brandModel,
  v.modelYear,
  v.user,
  v.arvento,
  v.km,
  v.insuranceAgent,
  v.insuranceCompany,
  v.insuranceEnd,
  v.inspectionDate,
  v.exhaustDate,
  v.width,
  v.length,
  v.height,
  v.dimensionNote,
  [...v.sourceSheets].join("; "),
]);
if (controlRows.length) controlSheet.getRangeByIndexes(1, 0, controlRows.length, controlHeaders.length).values = controlRows;

notesSheet.getRange("A1:A9").values = [["Notlar"],["1) Arac Yukleme sekmesi, programa aktarim icin duzenlendi."],["2) Bos kalan Kasa Tipi/Sanziman/Kasko Kodu alanlari kaynak dosyada yok."],["3) Tum_Veriler_Kontrol sekmesinde sigorta, muayene, km ve olcu bilgileri birlestirildi."],["4) Tarih hucreleri Excel tarih formatina cevrildi."],["5) Plaka bazinda normalize edilip tekillestirme yapildi."],["6) Aktarimdan once eksik alanlari bu dosyada tamamlayabilirsiniz."],["7) Kaynakta tutarsiz/veri kirik satirlar gorulebilir; kontrol sekmesinden gozden gecirin."],[`8) Toplam arac kaydi: ${allVehicles.length}`]];

const headerFmt = { fill: "#1F4E78", font: { bold: true, color: "#FFFFFF" }, horizontalAlignment: "center" };
importSheet.getRange("A1:I1").format = headerFmt;
modalSheet.getRangeByIndexes(0, 0, 1, modalHeaders.length).format = headerFmt;
controlSheet.getRangeByIndexes(0, 0, 1, controlHeaders.length).format = headerFmt;

importSheet.getRange(`A1:I${Math.max(2, importRows.length + 1)}`).format.wrapText = true;
modalSheet.getRangeByIndexes(0, 0, Math.max(2, modalRows.length + 1), modalHeaders.length).format.wrapText = true;
controlSheet.getRangeByIndexes(0, 0, Math.max(2, controlRows.length + 1), controlHeaders.length).format.wrapText = true;

importSheet.getRange("A:A").format.columnWidthPx = 120;
importSheet.getRange("B:B").format.columnWidthPx = 140;
importSheet.getRange("C:C").format.columnWidthPx = 220;
importSheet.getRange("D:D").format.columnWidthPx = 90;
importSheet.getRange("E:G").format.columnWidthPx = 110;
importSheet.getRange("H:H").format.columnWidthPx = 110;
importSheet.getRange("I:I").format.columnWidthPx = 200;

modalSheet.getRange("A:A").format.columnWidthPx = 110;
modalSheet.getRange("B:B").format.columnWidthPx = 80;
modalSheet.getRange("C:C").format.columnWidthPx = 210;
modalSheet.getRange("D:D").format.columnWidthPx = 95;
modalSheet.getRange("E:J").format.columnWidthPx = 105;
modalSheet.getRange("K:M").format.columnWidthPx = 110;
modalSheet.getRange("N:Q").format.columnWidthPx = 95;
modalSheet.getRange("R:R").format.columnWidthPx = 150;
modalSheet.getRange("S:U").format.columnWidthPx = 120;
modalSheet.getRange("V:X").format.columnWidthPx = 120;

controlSheet.getRange("A:A").format.columnWidthPx = 120;
controlSheet.getRange("B:B").format.columnWidthPx = 140;
controlSheet.getRange("C:C").format.columnWidthPx = 220;
controlSheet.getRange("D:D").format.columnWidthPx = 90;
controlSheet.getRange("E:E").format.columnWidthPx = 200;
controlSheet.getRange("F:G").format.columnWidthPx = 100;
controlSheet.getRange("H:I").format.columnWidthPx = 170;
controlSheet.getRange("J:L").format.columnWidthPx = 120;
controlSheet.getRange("M:O").format.columnWidthPx = 90;
controlSheet.getRange("P:P").format.columnWidthPx = 200;
controlSheet.getRange("Q:Q").format.columnWidthPx = 300;

if (controlRows.length) {
  controlSheet.getRange(`J2:L${controlRows.length + 1}`).setNumberFormat("yyyy-mm-dd");
}

importSheet.freezePanes.freezeRows(1);
modalSheet.freezePanes.freezeRows(1);
controlSheet.freezePanes.freezeRows(1);

const outDir = "c:/Users/Akel/Desktop/tasitmedisa/outputs/vehicle-import";
await fs.mkdir(outDir, { recursive: true });
const outPath = `${outDir}/medisa_arac_birlesik_aktarim_v2.xlsx`;
const outBlob = await SpreadsheetFile.exportXlsx(outputWb);
await outBlob.save(outPath);

console.log(JSON.stringify({ outPath, totalVehicles: allVehicles.length, medisaPath, templatePath }, null, 2));
