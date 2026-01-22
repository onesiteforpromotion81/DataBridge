import path from "path";
import { loadHandlers } from "../utils/handlerLoader.js";
import { fileURLToPath } from "url";
import { parseCSVShiftJIS } from "../utils/parseCSVShiftJIS.js";
import { parseExcelShiftJIS } from "../utils/parseExcelShiftJIS.js";
import { importPartners } from "./importServices/partnersImportService.js";
import { importItems } from "./importServices/itemsImportService.js";
import { importItemCategories } from "./importServices/itemCategoriesImportService.js";
import { importRealStocks } from "./importServices/realStocksImportService.js";
import { transformData } from "./importServices/dataTransformers.js";
import { importGenericTable } from "./importServices/genericImportService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const uploadCSV = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "File is required" });

    const type = req.body.type;
    if (!type) return res.status(400).json({ error: "File type is required" });

    const filePath = path.join(__dirname, "../../uploads", req.file.filename);
    const fileExtension = path.extname(req.file.originalname).toLowerCase();
    
    // Check if file is Excel (.xlsx)
    const isExcel = fileExtension === '.xlsx' || fileExtension === '.xls';
    
    // Handle Excel files for item_categories (Japanese name: 大中小分類)
    if (isExcel && (type === "大中小分類" || type === "itemCategories")) {
      try {
        const excelData = await parseExcelShiftJIS(filePath);
        const result = await importItemCategories(excelData);
        return res.json(result);
      } catch (err) {
        console.error("Item categories Excel import failed:", err);
        return res.status(500).json({
          message: "Item categories Excel import failed",
          error: err.message
        });
      }
    }
    
    // Handle CSV files (existing logic)
    if (!isExcel) {
      const handlers = await loadHandlers();
      if (!handlers[type]) return res.status(400).json({ error: `No handler found for type "${type}"` });

      const data = await parseCSVShiftJIS(filePath);
      const HandlerClass = handlers[type];
      const handler = new HandlerClass(data);

      // Validation
      if (!handler.getTableName || !handler.getColumns) {
        return res.status(500).json({ error: "Handler must implement getTableName() and getColumns()" });
      }
      const table = handler.getTableName();

      // Route to specialized import services
      if (table === "partners") {
        try {
          const result = await importPartners(data);
          return res.json(result);
        } catch (err) {
          console.error("Partner CSV import failed:", err);
          return res.status(500).json({
            message: "Partner CSV import failed",
            error: err.message
          });
        }
      }

      if (table === "items") {
        const result = await importItems(data);
        return res.json(result);
      }

      if (table === "real_stocks") {
        try {
          const result = await importRealStocks(data);
          return res.json(result);
        } catch (err) {
          console.error("Real stocks CSV import failed:", err);
          return res.status(500).json({
            message: "Real stocks CSV import failed",
            error: err.message
          });
        }
      }

      // Generic table import
      const filteredData = await transformData(handler, table, data);
      const result = await importGenericTable(handler, table, filteredData);
      return res.json(result);
    }
    
    // If Excel but not item_categories, return error
    return res.status(400).json({ 
      error: `Excel files are only supported for item_categories. File type: ${type}` 
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

export const getCSVTypes = async (req, res) => {
  try {
    const handlers = await loadHandlers();
    const types = Object.keys(handlers); // list of handler names
    res.json({ types });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

