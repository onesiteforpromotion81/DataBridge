import pool from "../../db/connections.js";
import { filterUniqueLocations } from "../../common/helpers/filterUniqueLocations.js";

/**
 * Transform and filter data based on table type
 * @param {Object} handler - CSV handler instance
 * @param {string} table - Table name
 * @param {Array} data - Raw CSV data
 * @returns {Promise<Array>} - Transformed and filtered data
 */
export async function transformData(handler, table, data) {
  // Initial filtering
  let filteredData =
    table === "locations"
      ? handler.filterDataLocations(data)
      : table === "item_partner_prices" || table === "item_connections" 
      ? handler.filterDataItemPartnerPrices(data)
      : handler.filterData(data);
  
  if (!Array.isArray(filteredData)) {
    throw new Error("filterData() must return an array");
  }
  
  if (table === "locations") {
    filteredData = filterUniqueLocations(filteredData);
  }

  // Apply default values and transformations
  filteredData = applyDefaultValues(filteredData, table);
  
  // Resolve foreign keys
  filteredData = await resolveForeignKeys(filteredData, table);
  
  // Special transformations
  filteredData = await applySpecialTransformations(filteredData, table);

  return filteredData;
}

/**
 * Apply default values to rows
 */
function applyDefaultValues(filteredData, table) {
  filteredData.forEach(row => {
    if (table !== "locations" && (!("is_active" in row) || row["is_active"] === "" || row["is_active"] == null)) {
      row["is_active"] = 1;
    }

    if (table === "users") {
      row.permission_ship_rare_item ??= 0;
      row.default_branch_id ??= 90;
      row.default_warehouse_id ??= 90;
      row.password ??= row.MSM030;
      row.email ??= `${row.MSM030}@test.com`;
    }

    if (table === "item_partner_prices") {
      if (row.TKM060 !== "99999999") {
        row.TKM070 = row.TKM090;
        row.TKM080 = row.TKM100;
      } else {
        row.TKM060 = "20250101";
      }
    }
  });

  filteredData.forEach(row => {
    if (table === "delivery_courses" && (!("warehouse_id" in row) || row["warehouse_id"] === "" || row["warehouse_id"] == null)) {
      row["warehouse_id"] = 90;
    }
  });

  if (table === "areas") {
    filteredData.forEach(row => {
      if (!row["MSM040"] || row["MSM040"].trim() === "") {
        row["MSM040"] = "地区";
      }
    });
  }

  if (table === "departments") {
    filteredData.forEach(row => {
      if (!row["MSM040"] || row["MSM040"].trim() === "") {
        row["MSM040"] = "部門";
      }
    });
  }

  return filteredData;
}

/**
 * Resolve foreign key relationships
 */
async function resolveForeignKeys(filteredData, table) {
  // Resolve partner_id and item_id for item_partner_prices
  if (table === "item_partner_prices") {
    for (const row of filteredData) {
      const [partnerRows] = await pool.query(
        `SELECT id FROM partners WHERE code = ? LIMIT 1`,
        [row.TKM030]
      );
      row.partner_id = partnerRows.length ? partnerRows[0].id : null;

      const [itemRows] = await pool.query(
        `SELECT id FROM items WHERE code = ? LIMIT 1`,
        [row.TKM040]
      );
      row.item_id = itemRows.length ? itemRows[0].id : null;

      if (!row.partner_id || !row.item_id) {
        console.log(`Skipping row due to missing partner/item:`, row);
        row.__skip = true;
      }
    }
    filteredData = filteredData.filter(r => !r.__skip);
  }

  // Resolve partner_id and item_id for item_connections
  if (table === "item_connections") {
    for (const row of filteredData) {
      const [partnerRows] = await pool.query(
        `SELECT id FROM partners WHERE code = ? LIMIT 1`,
        [row.S0101]
      );
      row.partner_id = partnerRows.length ? partnerRows[0].id : null;

      const [itemRows] = await pool.query(
        `SELECT id FROM items WHERE code = ? LIMIT 1`,
        [row.S02]
      );
      row.item_id = itemRows.length ? itemRows[0].id : null;

      if (!row.partner_id || !row.item_id) {
        console.log("Skipping item_connections row:", {
          partner_id: row.partner_id,
          item_id: row.item_id
        });
        row.__skip = true;
      }
    }
    filteredData = filteredData.filter(r => !r.__skip);
  }

  return filteredData;
}

/**
 * Apply special transformations (e.g., item_categories expansion)
 */
async function applySpecialTransformations(filteredData, table) {
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

      // PASS 1 — depth = 1
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

      // PASS 2 — depth = 2
      let combination_code_2;
      if (len === 5) {
        combination_code_2 = "00" + code[0] + "0" + code[1] + code[2];
      } else if (len === 4) {
        combination_code_2 = "0000" + code[0] + code[1];
      }

      if (combination_code_2) {
        finalRows.push({
          MSM030: combination_code_2,
          MSM040: name,
          MSM110: updatedAt,
          depth: 2,
          alcohol_tax_category_id,
          is_active: 1,
        });
      }

      // PASS 3 — depth = 3
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

      if (combination_code_3) {
        finalRows.push({
          MSM030: combination_code_3,
          MSM040: name,
          MSM110: updatedAt,
          depth: 3,
          alcohol_tax_category_id,
          is_active: 1,
        });
      }
    }

    return finalRows;
  }

  return filteredData;
}

