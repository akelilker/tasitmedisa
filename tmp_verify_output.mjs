import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";
const wb = await SpreadsheetFile.importXlsx(await FileBlob.load("c:/Users/Akel/Desktop/tasitmedisa/outputs/vehicle-import/medisa_arac_birlesik_aktarim.xlsx"));
const summary = await wb.inspect({ kind: "sheet", include: "id,name" });
const importView = await wb.inspect({ kind: "table", sheetId: "Arac Yukleme", range: "A1:I12", tableMaxRows: 12, tableMaxCols: 9, maxChars: 5000 });
console.log(summary.ndjson);
console.log(importView.ndjson);
