import pool from "../../db/connections.js";
import { client_id } from "../../common/constants_6_15.js";

/**
 * Import item_categories from Excel file (F9_CATE.xlsx) with 3 sheets
 * Sheet 1 (CATE): code, name, depth=1
 * Sheet 2 (SUBC): code, name, tax_category_code, depth=2
 * Sheet 3 (SUBS): code, name, depth=3
 * 
 * @param {Object} excelData - Object with sheet names as keys and arrays of row objects
 * @returns {Promise<Object>} Result with inserted, skipped, failed counts
 */
export async function importItemCategories(excelData) {
  const startedAt = Date.now();
  let inserted = 0;
  let skipped = 0;
  let failed = 0;
  const errorDetails = [];
  
  const conn = await pool.getConnection();
  await conn.beginTransaction();
  
  try {
    // Build a map of alcohol_tax_category codes to IDs for quick lookup
    const [taxCategories] = await conn.query(
      `SELECT id, code FROM alcohol_tax_categories`
    );
    const taxCategoryMap = new Map();
    for (const tax of taxCategories) {
      taxCategoryMap.set(String(tax.code).trim(), tax.id);
    }
    
    // Process Sheet 1 (CATE) - depth = 1
    const cateSheet = excelData["CATE"] || excelData["cate"] || excelData["Cate"] || [];
    console.log(`[item_categories] Processing CATE sheet: ${cateSheet.length} rows`);
    
    for (const row of cateSheet) {
      try {
        const code = String(row["コード"] || row["code"] || "").trim();
        const name = String(row["名称"] || row["name"] || "").trim();
        
        if (!code || !name) {
          skipped++;
          continue;
        }
        
        // Check if already exists
        const [existing] = await conn.query(
          `SELECT id FROM item_categories WHERE code = ? AND depth = 1 LIMIT 1`,
          [code]
        );
        
        if (existing.length > 0) {
          skipped++;
          continue;
        }
        
        // Insert row with depth = 1
        await conn.query(
          `INSERT INTO item_categories 
           (client_id, code, combination_code, name, depth, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, 1, 1, NOW(), NOW())`,
          [client_id, code, code, name]
        );
        
        inserted++;
      } catch (err) {
        failed++;
        const errorMsg = err.message || String(err);
        console.error(`[item_categories] CATE row failed:`, errorMsg);
        if (errorDetails.length < 10) {
          errorDetails.push({
            sheet: "CATE",
            row,
            error: errorMsg
          });
        }
      }
    }
    
    // Process Sheet 2 (SUBC) - depth = 2
    const subcSheet = excelData["SUBC"] || excelData["subc"] || excelData["Subc"] || [];
    console.log(`[item_categories] Processing SUBC sheet: ${subcSheet.length} rows`);
    
    for (const row of subcSheet) {
      try {
        const code = String(row["コード"] || row["code"] || "").trim();
        const name = String(row["名称"] || row["name"] || "").trim();
        const taxCode = row["税務分類"] || row["tax_category"] || null;
        
        if (!code || !name) {
          skipped++;
          continue;
        }
        
        // Resolve alcohol_tax_category_id if tax code exists
        let alcohol_tax_category_id = null;
        if (taxCode) {
          const taxCodeStr = String(taxCode).trim();
          alcohol_tax_category_id = taxCategoryMap.get(taxCodeStr) || null;
          if (!alcohol_tax_category_id && taxCodeStr) {
            console.warn(`[item_categories] Tax category code "${taxCodeStr}" not found in alcohol_tax_categories`);
          }
        }
        
        // Check if already exists
        const [existing] = await conn.query(
          `SELECT id FROM item_categories WHERE code = ? AND depth = 2 LIMIT 1`,
          [code]
        );
        
        if (existing.length > 0) {
          skipped++;
          continue;
        }
        
        // Insert row with depth = 2
        await conn.query(
          `INSERT INTO item_categories 
           (client_id, code, combination_code, name, depth, alcohol_tax_category_id, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, 2, ?, 1, NOW(), NOW())`,
          [client_id, code, code, name, alcohol_tax_category_id]
        );
        
        inserted++;
      } catch (err) {
        failed++;
        const errorMsg = err.message || String(err);
        console.error(`[item_categories] SUBC row failed:`, errorMsg);
        if (errorDetails.length < 10) {
          errorDetails.push({
            sheet: "SUBC",
            row,
            error: errorMsg
          });
        }
      }
    }
    
    // Process Sheet 3 (SUBS) - depth = 3
    const subsSheet = excelData["SUBS"] || excelData["subs"] || excelData["Subs"] || [];
    console.log(`[item_categories] Processing SUBS sheet: ${subsSheet.length} rows`);
    
    for (const row of subsSheet) {
      try {
        const code = String(row["コード"] || row["code"] || "").trim();
        const name = String(row["名称"] || row["name"] || "").trim();
        
        if (!code || !name) {
          skipped++;
          continue;
        }
        
        // Check if already exists
        const [existing] = await conn.query(
          `SELECT id FROM item_categories WHERE code = ? AND depth = 3 LIMIT 1`,
          [code]
        );
        
        if (existing.length > 0) {
          skipped++;
          continue;
        }
        
        // Insert row with depth = 3
        await conn.query(
          `INSERT INTO item_categories 
           (client_id, code, combination_code, name, depth, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, 3, 1, NOW(), NOW())`,
          [client_id, code, code, name]
        );
        
        inserted++;
      } catch (err) {
        failed++;
        const errorMsg = err.message || String(err);
        console.error(`[item_categories] SUBS row failed:`, errorMsg);
        if (errorDetails.length < 10) {
          errorDetails.push({
            sheet: "SUBS",
            row,
            error: errorMsg
          });
        }
      }
    }
    
    await conn.commit();
    conn.release();
    
    const elapsed = Date.now() - startedAt;
    console.log(
      `[item_categories] Import completed: inserted=${inserted}, skipped=${skipped}, failed=${failed}, elapsed=${elapsed}ms`
    );
    
    return {
      message: "Item categories Excel processed successfully",
      inserted,
      skipped,
      failed,
      totalRowsInserted: inserted, // Only count item_categories table rows
      tableNames: ["item_categories"],
      tableStats: {
        item_categories: {
          inserted,
          skipped,
          failed
        }
      },
      errorDetails: errorDetails.length > 0 ? errorDetails : undefined,
      errorSummary: errorDetails.length > 0 
        ? `${errorDetails.length} error(s) occurred. See errorDetails for details.`
        : undefined
    };
    
  } catch (err) {
    await conn.rollback();
    conn.release();
    console.error("[item_categories] Import failed:", err);
    throw err;
  }
}

