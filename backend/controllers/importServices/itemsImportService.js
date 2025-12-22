/**
 * Import items CSV data with concurrent or sequential processing
 * @param {Array} data - CSV row data
 * @returns {Promise<Object>} - Result with inserted, skipped, failed counts
 */
export async function importItems(data) {
  const importOneItem = (await import("../F0PartnerImportService.js")).importOneItem;
  
  const startedAt = Date.now();
  const progressEvery = Number(process.env.ITEMS_PROGRESS_EVERY || 50);
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

    return {
      message: "Items CSV processed successfully",
      inserted,
      skipped,
      failed,
      tableName: "items (multi-table import)",
    };
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

  return { 
    message: "Items CSV processed successfully",
    inserted,
    skipped,
    failed,
    tableName: "items (multi-table import)"
  };
}

