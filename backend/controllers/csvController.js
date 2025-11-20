import path from "path";
import pool from "../db/connections.js";
import { parseCSV } from "../utils/csvParser.js";
import { loadHandlers } from "../utils/handlerLoader.js";
import { fileURLToPath } from "url";
import { parseCSVShiftJIS } from "../utils/parseCSVShiftJIS.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const uploadCSV = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "CSV file is required" });

    const type = req.body.type;
    if (!type) return res.status(400).json({ error: "CSV type is required" });
  
    const handlers = await loadHandlers();
    if (!handlers[type]) return res.status(400).json({ error: `No handler found for type "${type}"` });

    const filePath = path.join(__dirname, "../../uploads", req.file.filename);
    const data = await parseCSVShiftJIS(filePath);
    const HandlerClass = handlers[type];
    const handler = new HandlerClass(data);

    // Validation
    if (!handler.getTableName || !handler.getColumns) {
      return res.status(500).json({ error: "Handler must implement getTableName() and getColumns()" });
    }

    const filteredData = handler.filterData();
    if (!Array.isArray(filteredData)) return res.status(500).json({ error: "filterData() must return an array" });

    const table = handler.getTableName();
    const columnMap = handler.getColumns();

    const dbColumns = Object.values(columnMap);
    const csvColumns = Object.keys(columnMap); 
    if (filteredData.length === 0) {
      return res.json({ message: "No rows matched the filter", inserted: 0 });
    }

    // BULK INSERT
    const placeholders = filteredData.map(() => `(${dbColumns.map(() => "?").join(",")})`).join(",");
    const values = filteredData.flatMap(row => csvColumns.map(col => row[col] ?? null));
    const sql = `INSERT INTO ${table} (${dbColumns.join(",")}) VALUES ${placeholders}`;

    await pool.query(sql, values);

    res.json({ message: "CSV processed successfully", inserted: filteredData.length, tableName: table });

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

