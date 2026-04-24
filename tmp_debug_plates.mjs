import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";
const dir = "C:/Users/Akel/Downloads";
const files = await fs.readdir(dir);
const file = files.find(f => f.toUpperCase().includes("MEDI"));
const wb = await SpreadsheetFile.importXlsx(await FileBlob.load(path.join(dir, file)));
const norm=(v)=> (v??"").toString().toUpperCase().replace(/\s+/g,"").trim();
for (const name of ["MEDÝSA ARAÇ KULLANAN KÝÞÝLER","savaþ bey-km","MEDÝSA SÝGORTA GÜNLERÝ","ARAÇ MUAYENE GÜNLERÝ"]) {
 const vals = wb.worksheets.getItem(name).getUsedRange().values.slice(1);
 const set = new Set(vals.map(r=>norm(name==="ARAÇ MUAYENE GÜNLERÝ"?r[0]: name==="MEDÝSA SÝGORTA GÜNLERÝ"?r[0]:r[1])).filter(Boolean));
 console.log(name, set.size, [...set].slice(0,8));
}
