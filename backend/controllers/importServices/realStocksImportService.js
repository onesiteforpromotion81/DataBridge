import pool from "../../db/connections.js";
import { truncateTable } from "./genericImportService.js";
import { idFrom } from "../../common/helpers/idResolver.js";
import { client_id } from "../../common/constants_6_15.js";

/**
 * Import real_stocks CSV data from F0_SZM
 * @param {Array} data - CSV row data
 * @returns {Promise<Object>} - Result with inserted, failed counts
 */
export async function importRealStocks(data) {
  // Truncate real_stocks table before importing
  console.log("[real_stocks] Truncating real_stocks table before import...");
  try {
    await truncateTable("real_stocks");
  } catch (err) {
    console.error(`[real_stocks] Failed to truncate real_stocks:`, err.message);
    throw err;
  }

  const startedAt = Date.now();
  const progressEvery = Number(process.env.REAL_STOCKS_PROGRESS_EVERY || 50);
  let inserted = 0;
  let processed = 0;
  let failed = 0;
  let skipped = 0;

  const conn = await pool.getConnection();
  const queryTimeoutMs = Number(process.env.DB_QUERY_TIMEOUT_MS || 120000);
  const q = (sql, params = []) => conn.query({ sql, timeout: queryTimeoutMs }, params);

  try {
    await conn.beginTransaction();

    for (const row of data) {
      try {
        // Get item_id from items where code = S0102
        const item_id = await idFrom(conn, "items", row.S0102);
        if (!item_id) {
          console.log(`[real_stocks] Skipping row: item with code ${row.S0102} not found`);
          skipped++;
          processed++;
          continue;
        }

        // Get warehouse_id from warehouses where code = S0104
        const warehouse_id = await idFrom(conn, "warehouses", row.S0104);
        if (!warehouse_id) {
          console.log(`[real_stocks] Skipping row: warehouse with code ${row.S0104} not found`);
          skipped++;
          processed++;
          continue;
        }

        // Map S0106 to stock_allocation_id: 0 -> 1, 1 -> 2
        let stock_allocation_id = null;
        const s0106 = Number(row.S0106);
        if (s0106 === 0) {
          stock_allocation_id = 1;
        } else if (s0106 === 1) {
          stock_allocation_id = 2;
        }

        // Get location_id from locations where code1 = S0202, code2 = S0204, code3 = S0206
        let location_id = null;
        if (row.S0202 && row.S0204 && row.S0206) {
          const [locationRows] = await q(
            `SELECT id FROM locations WHERE code1 = ? AND code2 = ? AND code3 = ? LIMIT 1`,
            [row.S0202, row.S0204, row.S0206]
          );
          location_id = locationRows.length ? locationRows[0].id : null;
        }

        // Get S0502 for current_quantity and available_quantity
        const quantity = row.S0502 ? Number(row.S0502) : 0;

        // Insert into real_stocks
        await q(`
          INSERT INTO real_stocks
            (client_id, item_id, warehouse_id, stock_allocation_id, location_id,
             current_quantity, available_quantity, item_management_type)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          client_id,
          item_id,
          warehouse_id,
          stock_allocation_id,
          location_id,
          quantity,
          quantity,
          "STANDARD"
        ]);

        inserted++;
      } catch (err) {
        console.error(`[real_stocks] Row failed:`, err.message, row);
        failed++;
      }

      processed++;
      if (progressEvery > 0 && processed % progressEvery === 0) {
        console.log(
          `[real_stocks] progress: ${processed}/${data.length}, inserted=${inserted}, failed=${failed}, skipped=${skipped}, elapsed=${Date.now() - startedAt}ms`
        );
      }
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    console.error("[real_stocks] Import failed:", err);
    throw err;
  } finally {
    conn.release();
  }

  return {
    message: "Real stocks CSV processed successfully",
    inserted,
    skipped,
    failed,
    tableNames: ["real_stocks"]
  };
}
