import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";
const wb = await SpreadsheetFile.importXlsx(await FileBlob.load("c:/Users/Akel/Desktop/tasitmedisa/outputs/vehicle-import/medisa_arac_birlesik_aktarim_v2.xlsx"));
const sheets = await wb.inspect({ kind: "sheet", include: "id,name" });
const modalPreview = await wb.inspect({ kind: "table", sheetId: "Kayit_Modal_Import", range: "A1:X8", tableMaxRows: 8, tableMaxCols: 24, maxChars: 7000 });
console.log(sheets.ndjson);
console.log(modalPreview.ndjson);
