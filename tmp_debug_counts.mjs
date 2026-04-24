import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";
const dir = "C:/Users/Akel/Downloads";
const files = await fs.readdir(dir);
const file = files.find(f => f.toUpperCase().includes("MEDI"));
const wb = await SpreadsheetFile.importXlsx(await FileBlob.load(path.join(dir, file)));
for (const ws of wb.worksheets.items) {
  const used = ws.getUsedRange();
  const vals = used?.values || [];
  console.log(`${ws.name} | rows=${vals.length} cols=${vals[0]?.length || 0}`);
}
