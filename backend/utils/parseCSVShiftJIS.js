import fs from "fs";
import iconv from "iconv-lite";
import Papa from "papaparse";

export async function parseCSVShiftJIS(filePath) {
  // Read file as buffer (binary)
  const buffer = fs.readFileSync(filePath);

  // Convert Shift-JIS → UTF-8
  const utf8Content = iconv.decode(buffer, "Shift_JIS");

  // Parse CSV normally as UTF-8
  return Papa.parse(utf8Content, {
    header: true,
    skipEmptyLines: true,
  }).data;
}
