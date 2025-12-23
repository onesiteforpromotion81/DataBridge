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