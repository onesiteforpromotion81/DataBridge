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
  
  // Apply special transformations (e.g., item_partner_prices expansion)
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

    // item_partner_prices logic is now handled in applySpecialTransformations

    if (table === "item_connections") {
      // Set default values for item_connections
      row.client_id = 1;
      row.is_supplier = 0;
      row.is_active = 1;
      row.creator_id = 0;
      row.last_updater_id = 0;
      row.created_at = null;
      row.is_created_from_data_transfer = 0;
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
  // Note: item_partner_prices now handles this in applySpecialTransformations
  // to also get tax_exempt prices from item_prices

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

  // Resolve warehouse_id for locations
  if (table === "locations") {
    for (const row of filteredData) {
      if (row.S0104) {
        const [warehouseRows] = await pool.query(
          `SELECT id FROM warehouses WHERE code = ? LIMIT 1`,
          [row.S0104]
        );
        row.warehouse_id = warehouseRows.length ? warehouseRows[0].id : null;
      } else {
        row.warehouse_id = null;
      }
    }
  }

  // Resolve warehouse_id for delivery_courses
  if (table === "delivery_courses") {
    for (const row of filteredData) {
      const [warehouseRows] = await pool.query(
        `SELECT id FROM warehouses WHERE code = ? LIMIT 1`,
        ["60"]
      );
      row.warehouse_id = warehouseRows.length ? warehouseRows[0].id : null;
    }
  }

  // Resolve branch_id for warehouses
  if (table === "warehouses") {
    for (const row of filteredData) {
      if (row.MSM060_1) {
        const [branchRows] = await pool.query(
          `SELECT id FROM branches WHERE code = ? LIMIT 1`,
          [row.MSM060_1]
        );
        row.branch_id = branchRows.length ? branchRows[0].id : null;
      } else {
        row.branch_id = null;
      }
    }
  }

  return filteredData;
}

/**
 * Apply special transformations (e.g., item_partner_prices expansion)
 */
async function applySpecialTransformations(filteredData, table) {
  if (table === "item_partner_prices") {
    // Filter out rows where TKM050 is 1
    filteredData = filteredData.filter(row => row.TKM050 !== "1" && row.TKM050 !== 1);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Helper function to parse date string (YYYYMMDD) to Date object
    function parseDateString(dateStr) {
      if (!dateStr || dateStr === "99999999" || dateStr === "20260101") {
        return null; // Special values
      }
      if (/^\d{8}$/.test(dateStr)) {
        const year = parseInt(dateStr.slice(0, 4));
        const month = parseInt(dateStr.slice(4, 6)) - 1;
        const day = parseInt(dateStr.slice(6, 8));
        return new Date(year, month, day);
      }
      return null;
    }

    const finalRows = [];

    for (const row of filteredData) {
      // Resolve partner_id and item_id
      const [partnerRows] = await pool.query(
        `SELECT id FROM partners WHERE code = ? LIMIT 1`,
        [row.TKM030]
      );
      const partner_id = partnerRows.length ? partnerRows[0].id : null;

      const [itemRows] = await pool.query(
        `SELECT id FROM items WHERE code = ? LIMIT 1`,
        [row.TKM040]
      );
      const item_id = itemRows.length ? itemRows[0].id : null;

      if (!partner_id || !item_id) {
        console.log(`Skipping row due to missing partner/item:`, row);
        continue;
      }

      // Get tax_exempt prices from item_prices
      const [priceRows] = await pool.query(
        `SELECT tax_exempt_unit_price, tax_exempt_case_price 
         FROM item_prices 
         WHERE item_id = ? 
         ORDER BY start_date DESC 
         LIMIT 1`,
        [item_id]
      );
      const tax_exempt_unit_price = priceRows.length ? priceRows[0].tax_exempt_unit_price : null;
      const tax_exempt_case_price = priceRows.length ? priceRows[0].tax_exempt_case_price : null;

      const tkm060 = row.TKM060;
      const isSpecial = tkm060 === "99999999" || tkm060 === "20260101";
      const date = parseDateString(tkm060);
      const isGreaterThanToday = date && date > today;
      const isLessThanToday = date && date < today;

      if (isSpecial) {
        // Scenario 1: TKM060 is 99999999 or 20260101
        finalRows.push({
          TKM030: row.TKM030,
          TKM040: row.TKM040,
          TKM060: "20260101",
          TKM070: row.TKM070,
          TKM080: row.TKM080,
          TKM120: row.TKM120,
          partner_id: partner_id,
          item_id: item_id,
          tax_exempt_unit_price: tax_exempt_unit_price,
          tax_exempt_case_price: tax_exempt_case_price
        });
      } else if (isLessThanToday) {
        // Scenario 2: TKM060 is less than today
        finalRows.push({
          TKM030: row.TKM030,
          TKM040: row.TKM040,
          TKM060: tkm060,
          TKM070: row.TKM090,
          TKM080: row.TKM100,
          TKM120: row.TKM120,
          partner_id: partner_id,
          item_id: item_id,
          tax_exempt_unit_price: tax_exempt_unit_price,
          tax_exempt_case_price: tax_exempt_case_price
        });
      } else if (isGreaterThanToday) {
        // Scenario 3: TKM060 is greater than today - insert TWO rows
        // First row: TKM060 is start_date, TKM090 is unit_price, TKM100 is case_price
        finalRows.push({
          TKM030: row.TKM030,
          TKM040: row.TKM040,
          TKM060: tkm060,
          TKM070: row.TKM090,
          TKM080: row.TKM100,
          TKM120: row.TKM120,
          partner_id: partner_id,
          item_id: item_id,
          tax_exempt_unit_price: tax_exempt_unit_price,
          tax_exempt_case_price: tax_exempt_case_price
        });

        // Second row: 20260101 is start_date, TKM070 is unit_price, TKM080 is case_price
        finalRows.push({
          TKM030: row.TKM030,
          TKM040: row.TKM040,
          TKM060: "20260101",
          TKM070: row.TKM070,
          TKM080: row.TKM080,
          TKM120: row.TKM120,
          partner_id: partner_id,
          item_id: item_id,
          tax_exempt_unit_price: tax_exempt_unit_price,
          tax_exempt_case_price: tax_exempt_case_price
        });
      } else {
        // TKM060 is today or invalid - treat as less than today
        finalRows.push({
          TKM030: row.TKM030,
          TKM040: row.TKM040,
          TKM060: tkm060,
          TKM070: row.TKM090,
          TKM080: row.TKM100,
          TKM120: row.TKM120,
          partner_id: partner_id,
          item_id: item_id,
          tax_exempt_unit_price: tax_exempt_unit_price,
          tax_exempt_case_price: tax_exempt_case_price
        });
      }
    }

    return finalRows;
  }

  return filteredData;
}