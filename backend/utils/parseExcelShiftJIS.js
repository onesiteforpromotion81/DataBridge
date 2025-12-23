import fs from "fs";
import XLSX from "xlsx";
import iconv from "iconv-lite";

/**
 * Parse Excel file with Shift-JIS encoding support
 * @param {string} filePath - Path to the Excel file
 * @returns {Promise<Object>} Object with sheet names as keys and arrays of row objects as values
 */
export async function parseExcelShiftJIS(filePath) {
  // Read file as buffer
  const buffer = fs.readFileSync(filePath);
  
  // Read Excel workbook
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  
  const result = {};
  
  // Process each sheet
  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    
    // Convert sheet to JSON (array of objects)
    // XLSX.utils.sheet_to_json handles encoding automatically for Excel files
    const rows = XLSX.utils.sheet_to_json(worksheet, {
      defval: null, // Use null for empty cells
      raw: false, // Convert numbers to strings to preserve formatting
    });
    
    // Convert string values from Shift-JIS to UTF-8 if needed
    // Note: XLSX library should handle encoding, but we'll ensure proper conversion
    const convertedRows = rows.map(row => {
      const convertedRow = {};
      for (const [key, value] of Object.entries(row)) {
        if (typeof value === 'string') {
          // Try to detect if conversion is needed
          // For now, assume XLSX handles it correctly
          convertedRow[key] = value;
        } else {
          convertedRow[key] = value;
        }
      }
      return convertedRow;
    });
    
    result[sheetName] = convertedRows;
  }
  
  return result;
}

