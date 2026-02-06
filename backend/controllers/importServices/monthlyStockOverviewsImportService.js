import pool from "../../db/connections.js";
import { truncateTable } from "./genericImportService.js";
import { idFrom } from "../../common/helpers/idResolver.js";
import { client_id } from "../../common/constants_6_15.js";

/**
 * Parse date string (YYYYMM format) to YYYY-MM format
 * @param {string} dateStr - Date string in YYYYMM format
 * @returns {string|null} - Date string in YYYY-MM format or null if invalid
 */
function parseYearMonth(dateStr) {
  if (!dateStr) return null;
  const str = String(dateStr).trim();
  if (str.length === 6 && /^\d{6}$/.test(str)) {
    const year = str.slice(0, 4);
    const month = str.slice(4, 6);
    return `${year}-${month}`;
  }
  return null;
}

/**
 * Import monthly_stock_overviews CSV data from F1_SZR
 * @param {Array} data - CSV row data
 * @returns {Promise<Object>} - Result with inserted, failed counts
 */
export async function importMonthlyStockOverviews(data) {
  // Truncate monthly_stock_overviews table before importing
  console.log("[monthly_stock_overviews] Truncating monthly_stock_overviews table before import...");
  try {
    await truncateTable("monthly_stock_overviews");
  } catch (err) {
    console.error(`[monthly_stock_overviews] Failed to truncate monthly_stock_overviews:`, err.message);
    throw err;
  }

  const startedAt = Date.now();
  const progressEvery = Number(process.env.MONTHLY_STOCK_OVERVIEWS_PROGRESS_EVERY || 50);
  let inserted = 0;
  let processed = 0;
  let failed = 0;
  let skipped = 0;
  let skippedDuplicates = 0;

  const conn = await pool.getConnection();
  const queryTimeoutMs = Number(process.env.DB_QUERY_TIMEOUT_MS || 120000);
  const q = (sql, params = []) => conn.query({ sql, timeout: queryTimeoutMs }, params);

  try {
    await conn.beginTransaction();

    for (const row of data) {
      try {
        // Get closing_monthly_id from closing_monthlies where yyyy-mm of closing_date matches yyyy-mm of SZR020
        let closing_monthly_id = null;
        const szr020YearMonth = parseYearMonth(row.SZR020);
        if (szr020YearMonth) {
          const [closingRows] = await q(
            `SELECT id FROM closing_monthlies 
             WHERE DATE_FORMAT(closing_date, '%Y-%m') = ? 
             LIMIT 1`,
            [szr020YearMonth]
          );
          closing_monthly_id = closingRows.length ? closingRows[0].id : null;
        }
        if (!closing_monthly_id) {
          console.log(`[monthly_stock_overviews] Skipping row: closing_monthly not found for date ${row.SZR020}`);
          skipped++;
          processed++;
          continue;
        }

        // Get item_id from items where code = SZR030
        const item_id = await idFrom(conn, "items", row.SZR030);
        if (!item_id) {
          console.log(`[monthly_stock_overviews] Skipping row: item with code ${row.SZR030} not found`);
          skipped++;
          processed++;
          continue;
        }

        // Get warehouse_id from warehouses where code = SZR040
        const warehouse_id = await idFrom(conn, "warehouses", row.SZR040);
        if (!warehouse_id) {
          console.log(`[monthly_stock_overviews] Skipping row: warehouse with code ${row.SZR040} not found`);
          skipped++;
          processed++;
          continue;
        }

        // Map SZR050 to stock_allocation_id: 0 -> 1, 1 -> 2
        let stock_allocation_id = null;
        const szr050 = Number(row.SZR050);
        if (szr050 === 0) {
          stock_allocation_id = 1;
        } else if (szr050 === 1) {
          stock_allocation_id = 2;
        }

        console.log("stock_allocation_id: ", stock_allocation_id);

        // Parse numeric values (default to 0 if not provided)
        const szr060 = Number(row.SZR060) || 0; // purchased_quantity
        const szr070 = Number(row.SZR070) || 0; // purchase_returned_quantity
        const szr080 = Number(row.SZR080) || 0; // transferred_to_quantity
        const szr090 = Number(row.SZR090) || 0; // earning_quantity
        const szr100 = Number(row.SZR100) || 0; // earning_returned_quantity
        const szr110 = Number(row.SZR110) || 0; // transferred_from_quantity
        const szr120 = Number(row.SZR120) || 0; // (used in quantity calculation)
        const szr220 = Number(row.SZR220) || 0; // purchased_amount
        const szr230 = Number(row.SZR230) || 0; // purchase_returned_amount
        const szr240 = Number(row.SZR240) || 0; // transferred_to_amount
        const szr250 = Number(row.SZR250) || 0; // earning_amount
        const szr255 = Number(row.SZR255) || 0; // earning_returned_amount
        const szr260 = Number(row.SZR260) || 0; // transferred_from_amount
        const szr310 = Number(row.SZR310) || 0; // previous_quantity
        const szr330 = Number(row.SZR330) || 0; // previous_amount
        const szr340 = Number(row.SZR340) || 0; // amount
        const szr350 = Number(row.SZR350) || 0; // (used in previous_price calculation)
        const szr420 = Number(row.SZR420) || 0; // price and cost

        // Calculate previous_price
        // If both SZR310 and SZR350 are not zero, previous_price = SZR350 / SZR310
        // If either SZR310 or SZR350 is zero, previous_price = SZR420
        let previous_price = szr420;
        if (szr310 !== 0 && szr350 !== 0) {
          previous_price = szr350 / szr310;
        }

        // Calculate quantity: SZR310 + SZR060 - SZR070 + SZR080 - SZR090 + SZR100 - SZR110 - SZR120
        const quantity = szr310 + szr060 - szr070 + szr080 - szr090 + szr100 - szr110 - szr120;

        // Insert into monthly_stock_overviews (using INSERT IGNORE to handle duplicates)
        const [result] = await q(`
          INSERT IGNORE INTO monthly_stock_overviews
            (client_id, closing_monthly_id, item_id, warehouse_id, stock_allocation_id,
             purchased_quantity, purchase_returned_quantity, transferred_to_quantity,
             earning_quantity, earning_returned_quantity, transferred_from_quantity,
             purchased_amount, purchase_returned_amount, transferred_to_amount,
             earning_amount, earning_returned_amount, transferred_from_amount,
             previous_quantity, previous_amount, amount,
             previous_price, price, cost, quantity, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        `, [
          client_id,
          closing_monthly_id,
          item_id,
          warehouse_id,
          stock_allocation_id,
          szr060, // purchased_quantity
          szr070, // purchase_returned_quantity
          szr080, // transferred_to_quantity
          szr090, // earning_quantity
          szr100, // earning_returned_quantity
          szr110, // transferred_from_quantity
          szr220, // purchased_amount
          szr230, // purchase_returned_amount
          szr240, // transferred_to_amount
          szr250, // earning_amount
          szr255, // earning_returned_amount
          szr260, // transferred_from_amount
          szr310, // previous_quantity
          szr330, // previous_amount
          szr340, // amount
          previous_price,
          szr420, // price
          szr420, // cost
          quantity
        ]);

        // Check if row was actually inserted (affectedRows > 0) or skipped due to duplicate
        if (result.affectedRows > 0) {
          inserted++;
        } else {
          skippedDuplicates++;
          skipped++;
        }
      } catch (err) {
        // Check if it's a duplicate key error
        if (err.code === 'ER_DUP_ENTRY' || err.message?.includes('Duplicate entry')) {
          skippedDuplicates++;
          skipped++;
        } else {
          console.error(`[monthly_stock_overviews] Row failed:`, err.message, row);
          failed++;
        }
      }

      processed++;
      if (progressEvery > 0 && processed % progressEvery === 0) {
        console.log(
          `[monthly_stock_overviews] progress: ${processed}/${data.length}, inserted=${inserted}, failed=${failed}, skipped=${skipped} (duplicates: ${skippedDuplicates}), elapsed=${Date.now() - startedAt}ms`
        );
      }
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    console.error("[monthly_stock_overviews] Import failed:", err);
    throw err;
  } finally {
    conn.release();
  }

  // Log summary
  console.log(`[monthly_stock_overviews] Import summary:`);
  console.log(`  - Inserted: ${inserted}`);
  console.log(`  - Skipped: ${skipped} (${skippedDuplicates} duplicates)`);
  console.log(`  - Failed: ${failed}`);

  return {
    message: "Monthly stock overviews CSV processed successfully",
    inserted,
    skipped,
    failed,
    skippedDuplicates,
    tableNames: ["monthly_stock_overviews"]
  };
}
