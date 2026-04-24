import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const downloadsDir = "C:/Users/Akel/Downloads";
const files = await fs.readdir(downloadsDir);

function pickFile(keywordA, keywordB = "") {
  return files.find((f) => {
    const u = f.toUpperCase();
    return u.includes(keywordA) && (!keywordB || u.includes(keywordB));
  });
}

const medisaName = pickFile("MEDI");
const sablonName = pickFile("SABLON") ?? pickFile("SABLON", "ARAC") ?? pickFile("ABLON");

const selected = [medisaName, sablonName].filter(Boolean).map((name) => path.join(downloadsDir, name));

for (const p of selected) {
  const blob = await FileBlob.load(p);
  const wb = await SpreadsheetFile.importXlsx(blob);
  const sheetInfo = await wb.inspect({ kind: "sheet", include: "id,name" });
  const tableInfo = await wb.inspect({
    kind: "table",
    maxChars: 12000,
    tableMaxRows: 8,
    tableMaxCols: 16,
    tableMaxCellChars: 100,
  });

  console.log("===FILE===");
  console.log(p);
  console.log("===SHEETS===");
  console.log(sheetInfo.ndjson);
  console.log("===TABLES===");
  console.log(tableInfo.ndjson);
}
