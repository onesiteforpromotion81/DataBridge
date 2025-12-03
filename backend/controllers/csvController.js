import path from "path";
import pool from "../db/connections.js";
import { loadHandlers } from "../utils/handlerLoader.js";
import { fileURLToPath } from "url";
import { parseCSVShiftJIS } from "../utils/parseCSVShiftJIS.js";
import { filterUniqueLocations } from "../common/helpers/filterUniqueLocations.js";

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
    const table = handler.getTableName();
    let filteredData =
      table === "locations"
        ? handler.filterDataLocations(data)
        : handler.filterData(data);
    if (!Array.isArray(filteredData)) return res.status(500).json({ error: "filterData() must return an array" });

    if (table === "locations") {
      filteredData = filterUniqueLocations(filteredData);
    }
    filteredData.forEach(row => {
      if (table !== "locations" && (!("is_active" in row) || row["is_active"] === "" || row["is_active"] == null)) {
        row["is_active"] = 1;
      }
    });
    filteredData.forEach(row => {
      if (table === "delivery_courses" && (!("warehouse_id" in row) || row["warehouse_id"] === "" || row["warehouse_id"] == null)) {
        row["warehouse_id"] = 90;
      }
    });
    let columnMap;
    if (table === 'notes') {
      columnMap = handler.getColumns_Note();
    } else if (table === 'locations') {
      columnMap = handler.getColumns_Location();
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
    if (table === "departments") {
      filteredData.forEach(row => {
        if (!row["MSM040"] || row["MSM040"].trim() === "") {
          row["MSM040"] = "部門";  // default value
        }
      });
    }
    // Ensure handler provides the unique key
    if (!handler.getUniqueKey) {
      return res.status(500).json({ error: "Handler must implement getUniqueKey()" });
    }

    const uniqueColumn = handler.getUniqueKey();  

    // Normalize to array
    const uniqueColumns = Array.isArray(uniqueColumn)
      ? uniqueColumn
      : [uniqueColumn];

    // Name of the unique index (you can change it)
    const uniqueIndexName = "uniq_auto_index";

    // STEP 1: Check if UNIQUE index already exists
    const checkIndexSql = `
      SELECT COUNT(1) AS count
      FROM information_schema.statistics
      WHERE table_schema = DATABASE()
        AND table_name = ?
        AND index_name = ?
    `;
    const [indexResult] = await pool.query(checkIndexSql, [table, uniqueIndexName]);

    // STEP 2: Create UNIQUE INDEX if not exists
    if (indexResult[0].count === 0) {
      const columnsSql = uniqueColumns.map(col => `\`${col}\``).join(", ");

      const createIndexSql = `
        ALTER TABLE \`${table}\`
        ADD UNIQUE \`${uniqueIndexName}\` (${columnsSql})
      `;

      try {
        await pool.query(createIndexSql);
        console.log(
          `Created UNIQUE INDEX '${uniqueIndexName}' on ${table} (${columnsSql})`
        );
      } catch (err) {
        console.error("Failed to create UNIQUE index:", err);
      }
    }

    // STEP 3: BULK INSERT
    const placeholders = filteredData
      .map(() => `(${dbColumns.map(() => "?").join(",")})`)
      .join(",");

    const values = filteredData.flatMap(row =>
      csvColumns.map(col => row[col] ?? null)
    );

    const sql = `
      INSERT IGNORE INTO ${table} (${dbColumns.join(",")})
      VALUES ${placeholders}
    `;

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

