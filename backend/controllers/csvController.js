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
    if (table === "partners") {
      const processPartner = (await import("./F0PartnerImportService.js")).processPartner;

      let inserted = 0;
      for (const row of data) {
        const success = await processPartner(row);
        if (success) inserted++;
      }

      return res.json({ 
        message: "Partner CSV processed successfully",
        inserted,
        tableName: "partners (multi-table import)"
      });
    }
    if (table === "items") {
      const importOneItem = (await import("./F0PartnerImportService.js")).importOneItem;

      let inserted = 0;
      for (const row of data) {
        const success = await importOneItem(row);
        if (success) inserted++;
      }

      return res.json({ 
        message: "Partner CSV processed successfully",
        inserted,
        tableName: "items (multi-table import)"
      });
    }
    let filteredData =
      table === "locations"
        ? handler.filterDataLocations(data)
        : table === "item_partner_prices" || table === "item_connections" 
        ? handler.filterDataItemPartnerPrices(data)
        : handler.filterData(data);
    if (!Array.isArray(filteredData)) return res.status(500).json({ error: "filterData() must return an array" });
    if (table === "locations") {
      filteredData = filterUniqueLocations(filteredData);
    }

    let items = [];

    // Fetch item list only once when needed
    if (table === "item_partner_prices") {
      const result = await pool.query("SELECT id, code FROM items");
      items = result[0];      
    }       

    filteredData.forEach(row => {
      if (table !== "locations" && (!("is_active" in row) || row["is_active"] === "" || row["is_active"] == null)) {
        row["is_active"] = 1;
      }

      if (table === "users") {
        row.permission_ship_rare_item ??= 0;
        row.default_branch_id ??= 90;
        row.default_warehouse_id ??= 90;
        row.password ??= row.MSM030; // optionally hash here
        row.email ??= `${row.MSM030}@test.com`;
      }

      if (table === "item_partner_prices") {
        if (row.TKM060 !== "99999999") {
          row.TKM070 = row.TKM090;
          row.TKM080 = row.TKM100;
        } else {
          row.TKM060 = "20250101";
        }     
         // ★ Find item id where code matches TKM040
        const match = items.find(item => item.code === Number(row.TKM040));
        console.log("match: ", match);

        // ★ Attach item_id to row
        row.item_id = match ? match.id : null;     // <──	assign here
        console.log("item_id: ", row.item_id);

        // (optional) Log if missing
        if (!match) console.log(`[WARNING] Item not found → ${row.TKM040}`);
      }
    });
    filteredData.forEach(row => {
      if (table === "delivery_courses" && (!("warehouse_id" in row) || row["warehouse_id"] === "" || row["warehouse_id"] == null)) {
        row["warehouse_id"] = 90;
      }
    });
    if (table === "item_partner_prices") {
      for (const row of filteredData) {

        // 1. Resolve partner_id using partners.code = TKM030
        const [partnerRows] = await pool.query(
          `SELECT id FROM partners WHERE code = ? LIMIT 1`,
          [row.TKM030]
        );
        row.partner_id = partnerRows.length ? partnerRows[0].id : null;

        // 2. Resolve item_id using items.code = TKM040
        const [itemRows] = await pool.query(
          `SELECT id FROM items WHERE code = ? LIMIT 1`,
          [row.TKM040]
        );
        row.item_id = itemRows.length ? itemRows[0].id : null;

        // Optional: block rows that failed lookup
        if (!row.partner_id || !row.item_id) {
          console.log(`Skipping row due to missing partner/item:`, row);
          row.__skip = true;
        }
      }

      // Remove skipped rows
      filteredData = filteredData.filter(r => !r.__skip);
    }
    if (table === "item_connections") {
      for (const row of filteredData) {
        // 1. Resolve partner_id
        const [partnerRows] = await pool.query(
          `SELECT id FROM partners WHERE code = ? LIMIT 1`,
          [row.S0101]
        );
        row.partner_id = partnerRows.length ? partnerRows[0].id : null;

        // 2. Resolve item_id
        const [itemRows] = await pool.query(
          `SELECT id FROM items WHERE code = ? LIMIT 1`,
          [row.S02]
        );
        row.item_id = itemRows.length ? itemRows[0].id : null;

        // Skip rows missing required IDs
        if (!row.partner_id || !row.item_id) {
          console.log("Skipping item_connections row:", {
            partner_id: row.partner_id,
            item_id: row.item_id
          });
          row.__skip = true;
        }
      }

      // Remove skipped rows
      filteredData = filteredData.filter(r => !r.__skip);
    }

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

    if (table === "users") {
      // ↓ Retrieve ONLY the users inserted
      const [users] = await pool.query(`SELECT id FROM users ORDER BY id DESC LIMIT ?`, [filteredData.length]);

      if (users.length) {
        const roleInsertValues = users
          .map(u => `(1,'App\\\\Models\\\\User',${u.id})`)
          .join(",");

        const roleSQL = `
          INSERT IGNORE INTO model_has_roles (role_id, model_type, model_id)
          VALUES ${roleInsertValues}
        `;

        await pool.query(roleSQL);
        console.log(`Assigned role_id=1 to ${users.length} users`);
      }
    }

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

