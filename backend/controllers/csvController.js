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

      const {
        processPartner,
        buildPartnerImportContext,
      } = await import("./F0PartnerImportService.js");

      const startedAt = Date.now();
      const batchSize = Number(process.env.PARTNERS_BATCH_SIZE || 200);
      const progressEvery = Number(process.env.PARTNERS_PROGRESS_EVERY || 50);
      // Default to 5 concurrent workers for remote DBs (can override with env var)
      // For local DB, 1 is fine, but for 500ms+ latency, 5-10x speedup is typical
      const concurrency = Number(process.env.PARTNERS_CONCURRENCY || 10);
      let inserted = 0;
      let processed = 0;
      let failed = 0;

      try {
        // Build lookup caches + existing partner code set BEFORE the transaction
        // (build uses a single connection, but ctx is safe to reuse across many connections)
        const buildConn = await pool.getConnection();
        const ctx = await buildPartnerImportContext(buildConn, data);
        buildConn.release();

        // Concurrency mode: best for high-latency remote DB connections
        if (concurrency > 1) {
          console.log(`[partners] Using ${concurrency} concurrent workers (set PARTNERS_CONCURRENCY to change)`);
          let nextIndex = 0;
          const workerCount = Math.min(concurrency, data.length);

          const workers = Array.from({ length: workerCount }, async () => {
            while (true) {
              const idx = nextIndex++;
              if (idx >= data.length) break;
              const row = data[idx];

              const conn = await pool.getConnection();
              try {
                await conn.beginTransaction();
                const success = await processPartner(row, conn, ctx);
                if (success) {
                  await conn.commit();
                  inserted++;
                } else {
                  // null => skipped, false => failed row
                  await conn.rollback();
                  if (success === false) failed++;
                }
              } catch (e) {
                try { await conn.rollback(); } catch {}
                failed++;
                console.error(`[partners] row failed at idx=${idx}:`, e?.message || e);
              } finally {
                conn.release();
              }

              processed++;
              if (progressEvery > 0 && processed % progressEvery === 0) {
                console.log(
                  `[partners] progress: ${processed}/${data.length}, inserted=${inserted}, failed=${failed}, elapsed=${Date.now() - startedAt}ms`
                );
              }
            }
          });

          await Promise.all(workers);

          return res.json({
            message: "Partner CSV processed successfully",
            inserted,
            failed,
            tableName: "partners (multi-table import)",
          });
        }

        // Sequential mode (keeps batching/commits)
        const conn = await pool.getConnection();
        try {
          await conn.beginTransaction();

          for (const row of data) {
            const success = await processPartner(row, conn, ctx);
            if (success) inserted++;
            else if (success === false) failed++;
            processed++;

            if (progressEvery > 0 && processed % progressEvery === 0) {
              console.log(
                `[partners] progress: ${processed}/${data.length}, inserted=${inserted}, failed=${failed}, elapsed=${Date.now() - startedAt}ms`
              );
            }

            if (batchSize > 0 && processed % batchSize === 0) {
              await conn.commit();
              console.log(
                `[partners] committed batch: ${processed}/${data.length}, inserted=${inserted}, failed=${failed}, elapsed=${Date.now() - startedAt}ms`
              );
              await conn.beginTransaction();
            }
          }

          await conn.commit();
        } finally {
          conn.release();
        }
        
        return res.json({ 
          message: "Partner CSV processed successfully",
          inserted,
          failed,
          tableName: "partners (multi-table import)"
        });
      } catch (err) {
        console.error("Partner CSV import failed:", err);

        return res.status(500).json({
          message: "Partner CSV import failed",
          error: err.message
        });
      }
    }
    if (table === "items") {
      const importOneItem = (await import("./F0PartnerImportService.js")).importOneItem;
      
      const startedAt = Date.now();
      const progressEvery = Number(process.env.ITEMS_PROGRESS_EVERY || 50);
      // Default to 5 concurrent workers for remote DBs (can override with env var)
      const concurrency = Number(process.env.ITEMS_CONCURRENCY || 10);
      let inserted = 0;
      let processed = 0;
      let failed = 0;
      let skipped = 0;

      // Concurrency mode: best for high-latency remote DB connections
      if (concurrency > 1) {
        console.log(`[items] Using ${concurrency} concurrent workers (set ITEMS_CONCURRENCY to change)`);
        let nextIndex = 0;
        const workerCount = Math.min(concurrency, data.length);

        const workers = Array.from({ length: workerCount }, async () => {
          while (true) {
            const idx = nextIndex++;
            if (idx >= data.length) break;
            const row = data[idx];

            try {
              const result = await importOneItem(row);
              if (result?.success) {
                inserted++;
              } else if (result?.skipped) {
                skipped++;
              } else {
                failed++;
              }
            } catch (e) {
              failed++;
              console.error(`[items] row failed at idx=${idx}:`, e?.message || e);
            }

            processed++;
            if (progressEvery > 0 && processed % progressEvery === 0) {
              console.log(
                `[items] progress: ${processed}/${data.length}, inserted=${inserted}, skipped=${skipped}, failed=${failed}, elapsed=${Date.now() - startedAt}ms`
              );
            }
          }
        });

        await Promise.all(workers);

        return res.json({
          message: "Items CSV processed successfully",
          inserted,
          skipped,
          failed,
          tableName: "items (multi-table import)",
        });
      }

      // Sequential mode (fallback)
      for (const row of data) {
        try {
          const result = await importOneItem(row);
          if (result?.success) {
            inserted++;
          } else if (result?.skipped) {
            skipped++;
          } else {
            failed++;
          }
        } catch (e) {
          failed++;
          console.error(`[items] row failed:`, e?.message || e);
        }
        
        processed++;
        if (progressEvery > 0 && processed % progressEvery === 0) {
          console.log(
            `[items] progress: ${processed}/${data.length}, inserted=${inserted}, skipped=${skipped}, failed=${failed}, elapsed=${Date.now() - startedAt}ms`
          );
        }
      }

      return res.json({ 
        message: "Items CSV processed successfully",
        inserted,
        skipped,
        failed,
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

        // ★ Attach item_id to row
        row.item_id = match ? match.id : null;     // <──	assign here

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
    if (table === "item_categories") {
      const finalRows = [];

      for (const row of filteredData) {
        const code = row.MSM030;
        const name = row.MSM040;
        const updatedAt = row.MSM110;
        const taxCode = row.MSM060_1;

        // Get alcohol tax category
        const [taxRows] = await pool.query(
          `SELECT id FROM alcohol_tax_categories WHERE code = ? LIMIT 1`,
          [taxCode]
        );
        const alcohol_tax_category_id = taxRows.length ? taxRows[0].id : null;

        const len = code?.length ?? 0;

        //
        // PASS 1 — depth = 1
        //
        let combination_code_1;
        if (len === 5) {
          combination_code_1 = "00" + code[0];
        } else {
          combination_code_1 = "000";
        }

        finalRows.push({
          MSM030: combination_code_1,
          MSM040: name,
          MSM110: updatedAt,
          depth: 1,
          alcohol_tax_category_id,
          is_active: 1,
        });

        //
        // PASS 2 — depth = 2
        //
        let combination_code_2;
        if (len === 5) {
          combination_code_2 = "00" + code[0] + "0" + code[1] + code[2];
        } else if (len === 4) {
          combination_code_2 = "0000" + code[0] + code[1];
        }

        finalRows.push({
          MSM030: combination_code_2,
          MSM040: name,
          MSM110: updatedAt,
          depth: 2,
          alcohol_tax_category_id,
          is_active: 1,
        });

        //
        // PASS 3 — depth = 3
        //
        let combination_code_3;
        if (len === 5) {
          combination_code_3 =
            "00" +
            code[0] +
            "0" +
            code[1] +
            code[2] +
            "0" +
            code[3] +
            code[4];
        } else if (len === 4) {
          combination_code_3 =
            "0000" + code[0] + code[1] + "0" + code[2] + code[3];
        }

        finalRows.push({
          MSM030: combination_code_3,
          MSM040: name,
          MSM110: updatedAt,
          depth: 3,      
          alcohol_tax_category_id,
          is_active: 1,
        });
      }

      // Now overwrite filteredData with the 3× expanded rows
      filteredData = finalRows;
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

