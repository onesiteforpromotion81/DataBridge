import path from "path";
import pool from "../db/connections.js";
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
    let columnMap;
    if (table === 'notes') {
      columnMap = handler.getColumns_Note();
    } else {
      columnMap = handler.getColumns();
    }    

    const dbColumns = Object.values(columnMap);
    const csvColumns = Object.keys(columnMap); 
    if (filteredData.length === 0) {
      return res.json({ message: "No rows matched the filter", inserted: 0, tableName: table });
    }

    if (table === "areas") {
      filteredData.forEach(row => {
        if (!row["MSM040"] || row["MSM040"].trim() === "") {
          row["MSM040"] = "地区";  // default value
        }
      });
    }
    // Ensure handler provides the unique key
    if (!handler.getUniqueKey) {
      return res.status(500).json({ error: "Handler must implement getUniqueKey()" });
    }

    const uniqueColumn = handler.getUniqueKey();

    // Check if UNIQUE index already exists
    const checkIndexSql = `
      SELECT COUNT(1) AS count 
      FROM information_schema.statistics 
      WHERE table_schema = DATABASE()
        AND table_name = ?
        AND column_name = ?
        AND non_unique = 0;
    `;

    const [indexResult] = await pool.query(checkIndexSql, [table, uniqueColumn]);

    // If no UNIQUE index, create it
    if (indexResult[0].count === 0) {
      const createIndexSql = `ALTER TABLE ${table} ADD UNIQUE (${uniqueColumn})`;
      try {
        await pool.query(createIndexSql);
        console.log(`Created UNIQUE KEY on ${table}.${uniqueColumn}`);
      } catch (err) {
        console.error("Failed to create unique key:", err);
      }
    }

    // BULK INSERT
    const placeholders = filteredData.map(() => `(${dbColumns.map(() => "?").join(",")})`).join(",");
    const values = filteredData.flatMap(row => csvColumns.map(col => row[col] ?? null));
    const sql = `INSERT IGNORE INTO ${table} (${dbColumns.join(",")}) VALUES ${placeholders}`;

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

