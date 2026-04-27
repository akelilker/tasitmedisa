import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const workspaceDir = "C:/Users/Akel/Desktop/tasitmedisa";
const defaultXlsxPath = "C:/Users/Akel/Downloads/gpt.xlsx";
const dataPath = `${workspaceDir}/data/data.json`;
const backupDir = `${workspaceDir}/outputs/docx-edevlet`;
const cleanedXlsxPath = `${backupDir}/gpt_import_cleaned.xlsx`;

const xlsxPath = process.argv[2] || defaultXlsxPath;

function normalizePlate(value) {
  return String(value ?? "")
    .toLocaleUpperCase("tr-TR")
    .replace(/[^0-9A-ZÇĞİÖŞÜ]/g, "");
}

/** Dosya adı 233, sistem kaydı 223 — bilinen eşleme */
const plateLookupOverride = new Map([
  [normalizePlate("78ACR233"), normalizePlate("78ACR223")],
]);

function excelSerialToDate(value) {
  if (typeof value !== "number" || Number.isNaN(value) || value < 25000 || value > 80000) return null;
  const epoch = Date.UTC(1899, 11, 30);
  return new Date(epoch + Math.round(value) * 86400000);
}

function cellToIso(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    const d = excelSerialToDate(value);
    return d ? d.toISOString().slice(0, 10) : null;
  }
  const s = String(value).trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return s.slice(0, 10);
  const tr = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (tr) {
    const dd = Number(tr[1]);
    const mm = Number(tr[2]);
    const yyyy = Number(tr[3]);
    return `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  }
  return null;
}

function normalizeKredi(value) {
  if (value === null || value === undefined || value === "") return null;
  const k = String(value).trim().toLocaleLowerCase("tr-TR");
  if (k === "var") return "var";
  if (k === "yok") return "yok";
  return null;
}

function isHeaderRepeatRow(plateCell) {
  const p = String(plateCell ?? "").trim().toLocaleLowerCase("tr-TR");
  return p === "plate";
}

function parseRows(values) {
  const headers = values[0] || [];
  const idx = (name) => headers.findIndex((h) => String(h ?? "").trim().toLowerCase() === name.toLowerCase());
  const pi = idx("plate");
  const cols = {
    sigortaDate: idx("sigortaDate"),
    kaskoDate: idx("kaskoDate"),
    muayeneDate: idx("muayeneDate"),
    egzozMuayeneDate: idx("egzozMuayeneDate"),
    kredi: idx("kredi"),
    krediDetay: idx("krediDetay"),
  };
  const rows = [];
  for (let r = 1; r < values.length; r += 1) {
    const row = values[r] || [];
    const plateRaw = row[pi];
    if (!String(plateRaw ?? "").trim()) continue;
    if (isHeaderRepeatRow(plateRaw)) continue;

    const entry = {
      plateRaw: String(plateRaw).trim(),
      plateKey: normalizePlate(plateRaw),
      sigortaDate: cols.sigortaDate >= 0 ? cellToIso(row[cols.sigortaDate]) : null,
      kaskoDate: cols.kaskoDate >= 0 ? cellToIso(row[cols.kaskoDate]) : null,
      muayeneDate: cols.muayeneDate >= 0 ? cellToIso(row[cols.muayeneDate]) : null,
      egzozMuayeneDate: cols.egzozMuayeneDate >= 0 ? cellToIso(row[cols.egzozMuayeneDate]) : null,
      kredi: cols.kredi >= 0 ? normalizeKredi(row[cols.kredi]) : null,
      krediDetay:
        cols.krediDetay >= 0 && row[cols.krediDetay] !== null && row[cols.krediDetay] !== undefined
          ? String(row[cols.krediDetay]).trim()
          : null,
    };
    rows.push(entry);
  }
  /** Aynı plaka iki kez: son satır geçerli */
  const byKey = new Map();
  for (const e of rows) {
    byKey.set(e.plateKey, e);
  }
  return [...byKey.values()];
}

function resolveLookupKey(plateKey) {
  return plateLookupOverride.get(plateKey) || plateKey;
}

function applyRowToVehicle(vehicle, row, summary) {
  const fields = ["sigortaDate", "kaskoDate", "muayeneDate", "egzozMuayeneDate"];
  const changes = [];
  for (const f of fields) {
    const next = row[f];
    if (next === null || next === undefined) continue;
    const prev = vehicle[f] ?? "";
    if (prev !== next) {
      changes.push({ field: f, before: prev, after: next });
      vehicle[f] = next;
    }
  }
  if (row.kredi !== null && row.kredi !== undefined) {
    const prev = vehicle.kredi ?? "";
    if (prev !== row.kredi) {
      changes.push({ field: "kredi", before: prev, after: row.kredi });
      vehicle.kredi = row.kredi;
    }
  }
  let detayNext = row.krediDetay;
  if (row.kredi === "yok" && (row.krediDetay === null || row.krediDetay === "")) {
    detayNext = "";
  }
  if (detayNext !== null && detayNext !== undefined) {
    const prev = vehicle.krediDetay ?? "";
    const next = detayNext;
    if (prev !== next) {
      changes.push({ field: "krediDetay", before: prev, after: next });
      vehicle.krediDetay = next;
    }
  }
  if (changes.length) {
    vehicle.updatedAt = new Date().toISOString();
    vehicle.version = Number(vehicle.version || 0) + 1;
  }
  summary.push({
    plate: vehicle.plate,
    plateKey: row.plateKey,
    lookupNote:
      resolveLookupKey(row.plateKey) !== row.plateKey
        ? `Excel ${row.plateKey} → sistem ${resolveLookupKey(row.plateKey)}`
        : "",
    changes,
  });
}

async function writeCleanedWorkbook(parsedRows) {
  const workbook = Workbook.create();
  const sheet = workbook.worksheets.add("Sayfa1");
  const headers = ["plate", "sigortaDate", "kaskoDate", "muayeneDate", "egzozMuayeneDate", "kredi", "krediDetay"];
  const rows = parsedRows.map((r) => [
    r.plateRaw,
    r.sigortaDate || "",
    r.kaskoDate || "",
    r.muayeneDate || "",
    r.egzozMuayeneDate || "",
    r.kredi || "",
    r.krediDetay || "",
  ]);
  sheet.getRangeByIndexes(0, 0, 1, headers.length).values = [headers];
  if (rows.length) sheet.getRangeByIndexes(1, 0, rows.length, headers.length).values = rows;
  sheet.freezePanes.freezeRows(1);
  const blob = await SpreadsheetFile.exportXlsx(workbook);
  await fs.mkdir(backupDir, { recursive: true });
  await blob.save(cleanedXlsxPath);
}

async function main() {
  const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(xlsxPath));
  const ws = workbook.worksheets.items[0];
  const values = ws.getUsedRange()?.values || [];
  const parsedRows = parseRows(values);

  const raw = await fs.readFile(dataPath, "utf8");
  const data = JSON.parse(raw);
  const vehicles = data.tasitlar || [];
  const byPlate = new Map(vehicles.map((v) => [normalizePlate(v.plate), v]));

  const summary = [];
  const unmatched = [];

  for (const row of parsedRows) {
    const lookupKey = resolveLookupKey(row.plateKey);
    const vehicle = byPlate.get(lookupKey);
    if (!vehicle) {
      unmatched.push({ plateKey: row.plateKey, plateRaw: row.plateRaw, lookupKey });
      continue;
    }
    applyRowToVehicle(vehicle, row, summary);
  }

  const backupPath = `${backupDir}/data.before_gpt_xlsx_import.json`;
  await fs.mkdir(backupDir, { recursive: true });
  await fs.writeFile(backupPath, raw, "utf8");
  await fs.writeFile(dataPath, `${JSON.stringify(data, null, 4)}\n`, "utf8");

  await writeCleanedWorkbook(parsedRows);

  const updatedCount = summary.filter((s) => s.changes.length > 0).length;
  const reportPath = `${backupDir}/gpt_xlsx_import_report.json`;
  await fs.writeFile(
    reportPath,
    `${JSON.stringify(
      {
        sourceXlsx: xlsxPath,
        backupPath,
        cleanedXlsxPath,
        rowsInExcelAfterDedup: parsedRows.length,
        updatedVehicles: updatedCount,
        unmatched,
        summary,
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  console.log(
    JSON.stringify(
      {
        sourceXlsx: xlsxPath,
        backupPath,
        cleanedXlsxPath,
        reportPath,
        rowsApplied: parsedRows.length,
        updatedVehicles: updatedCount,
        unmatchedCount: unmatched.length,
      },
      null,
      2
    )
  );
}

await main();
