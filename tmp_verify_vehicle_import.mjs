import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const filePath = "c:/Users/Akel/Desktop/tasitmedisa/outputs/vehicle-import/medisa_arac_aktarim_kontrol_guncel.xlsx";
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(filePath));

const sheets = await workbook.inspect({ kind: "sheet", include: "id,name" });
console.log("===SHEETS===");
console.log(sheets.ndjson);

const summary = await workbook.inspect({
  kind: "table",
  range: "Ozet!A1:B18",
  include: "values,formulas",
  tableMaxRows: 18,
  tableMaxCols: 2,
  maxChars: 5000,
});
console.log("===OZET===");
console.log(summary.ndjson);

const ready = await workbook.inspect({
  kind: "table",
  range: "Aktarim_Hazir!A1:AP12",
  include: "values,formulas",
  tableMaxRows: 12,
  tableMaxCols: 42,
  tableMaxCellChars: 120,
  maxChars: 16000,
});
console.log("===AKTARIM_SAMPLE===");
console.log(ready.ndjson);

const carry = await workbook.inspect({
  kind: "table",
  range: "Sistemden_Tasinacak!A1:I18",
  include: "values,formulas",
  tableMaxRows: 18,
  tableMaxCols: 9,
  tableMaxCellChars: 160,
  maxChars: 12000,
});
console.log("===SISTEMDEN_TASINACAK===");
console.log(carry.ndjson);

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 300 },
  summary: "formula error scan",
});
console.log("===ERROR_SCAN===");
console.log(errors.ndjson);

const renderDir = "c:/Users/Akel/Desktop/tasitmedisa/outputs/vehicle-import/previews";
await fs.mkdir(renderDir, { recursive: true });
for (const [sheetName, range] of [["Ozet", "A1:B18"], ["Aktarim_Hazir", "A1:L18"], ["Sistemden_Tasinacak", "A1:I18"]]) {
  const blob = await workbook.render({ sheetName, range, scale: 1.5 });
  const buffer = Buffer.from(await blob.arrayBuffer());
  await fs.writeFile(`${renderDir}/${sheetName}.png`, buffer);
}
