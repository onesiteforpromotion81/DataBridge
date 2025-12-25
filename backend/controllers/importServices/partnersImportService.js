import pool from "../../db/connections.js";
import { truncateTable } from "./genericImportService.js";

/**
 * Import partners CSV data with concurrent or sequential processing
 * @param {Array} data - CSV row data
 * @returns {Promise<Object>} - Result with inserted, failed counts
 */
export async function importPartners(data) {
  // Truncate all partner-related tables before importing
  const partnerTables = [
    "partners",
    "suppliers",
    "supplier_details",
    "buyers",
    "buyer_details",
    "partner_closing_details",
    "partner_timetables"
  ];
  
  console.log("[partners] Truncating partner-related tables before import...");
  for (const table of partnerTables) {
    try {
      await truncateTable(table);
    } catch (err) {
      console.error(`[partners] Failed to truncate ${table}:`, err.message);
      // Continue with other tables even if one fails
    }
  }
  const {
    processPartner,
    buildPartnerImportContext,
  } = await import("../F0PartnerImportService.js");

  const startedAt = Date.now();
  const batchSize = Number(process.env.PARTNERS_BATCH_SIZE || 200);
  const progressEvery = Number(process.env.PARTNERS_PROGRESS_EVERY || 50);
  const concurrency = Number(process.env.PARTNERS_CONCURRENCY || 10);
  let inserted = 0;
  let processed = 0;
  let failed = 0;
  let skipped = 0;
  let totalRowsInserted = 0; // Total database rows inserted across all tables

  try {
    // Build lookup caches + existing partner code set BEFORE the transaction
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
            const result = await processPartner(row, conn, ctx);
            if (result?.success === true) {
              await conn.commit();
              inserted++;
              totalRowsInserted += result.rowsInserted || 0;
            } else {
              await conn.rollback();
              if (result?.success === false) {
                failed++;
              } else if (result?.success === null) {
                skipped++;
              }
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

      return {
        message: "Partner CSV processed successfully",
        inserted,
        skipped,
        failed,
        totalRowsInserted, // Total database rows inserted across all tables
        tableNames: [
          "partners",
          "suppliers",
          "supplier_details",
          "buyers",
          "buyer_details",
          "partner_closing_details",
          "partner_timetables"
        ],
      };
    }

    // Sequential mode (keeps batching/commits)
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      for (const row of data) {
        const result = await processPartner(row, conn, ctx);
        if (result?.success === true) {
          inserted++;
          totalRowsInserted += result.rowsInserted || 0;
        } else if (result?.success === false) {
          failed++;
        } else if (result?.success === null) {
          skipped++;
        }
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
    
    return { 
      message: "Partner CSV processed successfully",
      inserted,
      skipped,
      failed,
      totalRowsInserted, // Total database rows inserted across all tables
      tableNames: [
        "partners",
        "suppliers",
        "supplier_details",
        "buyers",
        "buyer_details",
        "partner_closing_details",
        "partner_timetables"
      ]
    };
  } catch (err) {
    console.error("Partner CSV import failed:", err);
    throw err;
  }
}

