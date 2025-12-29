import pool from "../db/connections.js";
import { supplierEnum, buyerEnum, slipFractionEnum, partnerPrintEnum, displayTaxEnum, calcMethodEnum, taxFractionEnum, depositPlanEnum, creditErrorTypeEnum, weekEnum, paymentMethodEnum, cashCollectionMethodEnum, itemTypeEnum, unitPriceTypeEnum, categoryLevels } from "../common/helpers/enumMaps.js";
import { idFrom, idOrDefault } from "../common/helpers/idResolver.js";
import { client_id, default_date } from "../common/constants_6_15.js";
// import { lookup } from "dns";

function parseCsvDate(value) {
  if (value == null || value === undefined) return null;
  const v = String(value).trim();
  // Special case: "99999999" represents a default future date
  if (v === "99999999") return "2025-01-01";
  // Explicitly handle '0', empty strings, and invalid values
  if (!v || v === "0" || v === "00000000") return null;
  // Expect YYYYMMDD format (8 digits)Whe
  if (/^\d{8}$/.test(v)) {
    const year = v.slice(0,4);
    const month = v.slice(4,6);
    const day = v.slice(6,8);
    // Validate the date components are reasonable
    if (year === "0000" || month === "00" || day === "00") return null;
    return `${year}-${month}-${day}`;
  }

  return null;
}

function normalizeInt(value) {
  if (value == null) return null;

  const v = String(value).trim();
  if (v === '') return null;
  if (v === '0') return null;

  return Number(v);
}

function key(code) {
  if (code == null) return null;
  const v = String(code).trim();
  return v === "" ? null : v;
}

export async function buildPartnerImportContext(conn, rows = []) {
  const queryTimeoutMs = Number(process.env.DB_QUERY_TIMEOUT_MS || 120000);
  const startedAt = Date.now();

  const q = async (sql, params = []) =>
    conn.query({ sql, timeout: queryTimeoutMs }, params);

  const mapByCode = (rows) => {
    const m = new Map();
    for (const r of rows) {
      const k = key(r.code);
      if (k) m.set(k, r.id);
    }
    return m;
  };

  const tablesToPrefetch = [
    "branches",
    "departments",
    "users",
    "companies",
    "business_types",
    "location_conditions",
    "sale_sizes",
    "delivery_courses",
    "warehouses",
    "ledger_classifications",
  ];

  const ids = {};
  for (const t of tablesToPrefetch) {
    try {
      const t0 = Date.now();
      const [result] = await q(`SELECT id, code FROM \`${t}\``);
      ids[t] = mapByCode(result);
      console.log(
        `[partners] prefetch ${t}: ${result.length} rows in ${Date.now() - t0}ms`
      );
    } catch (e) {
      // If a table doesn't exist in some environment, keep going (processPartner will fallback)
      ids[t] = new Map();
      console.warn(`[partners] prefetch failed for ${t}: ${e.message}`);
    }
  }

  // Bulk check existing partner codes to avoid per-row SELECT on high-latency DBs
  const allCodes = Array.from(
    new Set(
      rows
        .map((r) => key(r?.T0101))
        .filter(Boolean)
    )
  );
  const existingPartnerCodes = new Set();
  const chunkSize = 1000;
  for (let i = 0; i < allCodes.length; i += chunkSize) {
    const chunk = allCodes.slice(i, i + chunkSize);
    const placeholders = chunk.map(() => "?").join(",");
    try {
      const t0 = Date.now();
      const [found] = await q(
        `SELECT code FROM partners WHERE code IN (${placeholders})`,
        chunk
      );
      for (const r of found) {
        const k = key(r.code);
        if (k) existingPartnerCodes.add(k);
      }
      console.log(
        `[partners] existing-code chunk ${Math.floor(i / chunkSize) + 1}/${Math.ceil(allCodes.length / chunkSize)}: ` +
          `checked=${chunk.length}, found=${found.length} in ${Date.now() - t0}ms`
      );
    } catch (e) {
      // If this fails (e.g., missing column/index), we'll just fall back to per-row behavior.
      console.warn(`[partners] bulk existing-code check failed: ${e.message}`);
      break;
    }
  }

  console.log(
    `[partners] context built: csvCodes=${allCodes.length}, existing=${existingPartnerCodes.size}, elapsed=${Date.now() - startedAt}ms`
  );
  return { ids, existingPartnerCodes, queryTimeoutMs };
}

function cachedId(ctx, table, code) {
  const k = key(code);
  if (!k) return null;
  const m = ctx?.ids?.[table];
  if (m && m.has(k)) return m.get(k);
  return null;
}

function cachedIdOrDefault(ctx, table, code, defaultValue = 1) {
  const k = key(code);
  if (!k || k === "0") return defaultValue;
  return cachedId(ctx, table, k) ?? defaultValue;
}

export async function processPartner(row, conn, ctx) {
  // const conn = await pool.getConnection();
  // await conn.beginTransaction();
  try {
    const code = key(row.T0101);
    if (!code) return { success: false, rowsInserted: 0 };
    if (ctx?.existingPartnerCodes?.has(code)) return { success: null, rowsInserted: 0 };

    // Insert Partner
    const timeout = Number(ctx?.queryTimeoutMs || process.env.DB_QUERY_TIMEOUT_MS || 120000);
    const q = (sql, params = []) => conn.query({ sql, timeout }, params);
    
    // Calculate isSupplier before INSERT so we can include it
    const t02Num = Number(row.T02) || 0;
    const isSupplier = t02Num <= 9;
    
    const [p] = await q(`
      INSERT INTO partners
        (client_id, creator_id, last_updater_id, code,
        partner_serial_number, nickname, name_main, kana_name,
        address1, address2, postal_code, tel, fax, entry_note,
        start_of_trade_date, end_of_trade_date, updated_at, is_supplier)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `, [
      client_id, client_id, client_id,
      code, row.T0510, row.T05103,
      row.T10, row.T11, row.T13, row.T14,
      `${row.T15}-${row.T1501}`,
      row.T16, row.T17, row.T23,
      parseCsvDate(row.T27),
      parseCsvDate(row.T28),
      row.T29,
      isSupplier ? 1 : 0
    ]);
    const partner_id = p.insertId;
    let totalRowsInserted = 1; // Only count partners table rows (1 per partner)

    await q(`UPDATE partners SET bill_group_id=?, partner_price_group_id=? WHERE id=?`,
      [partner_id, partner_id, partner_id]);

    if(isSupplier){
      const partnerCategory = supplierEnum(t02Num);
      if (!partnerCategory) {
        throw new Error(`Invalid supplier category code: ${row.T02}`);
      }
      const [s] = await q(`INSERT INTO suppliers (client_id, partner_id, partner_category) VALUES (?,?,?)`,
        [client_id, partner_id, partnerCategory]
      );
      const supplier_id = s.insertId;
      // Not counting suppliers table rows
      
      await q(`
        INSERT INTO supplier_details
          (code, start_date, supplier_id, branch_id, department_id, salesman_id, slip_fraction, partner_print_type,
            display_tax_type, calculation_method, tax_fraction, payment_method)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
      `,[
        client_id,
        parseCsvDate(default_date),
        supplier_id,
        cachedIdOrDefault(ctx, "branches", row.T0401, 1),
        cachedId(ctx, "departments", row.T0403),
        cachedId(ctx, "users", row.T0405),
        slipFractionEnum[row.T0609],
        partnerPrintEnum[row.T0621],
        displayTaxEnum[row.T0701],
        calcMethodEnum[row.T0703],
        taxFractionEnum[row.T0705],
        paymentMethodEnum[row.T2501]
      ]);
      // Not counting supplier_details table rows
    } else {
      const partnerCategory = buyerEnum(t02Num);
      if (!partnerCategory) {
        throw new Error(`Invalid buyer category code: ${row.T02} (must be 10-19, 20-29, or 90-99)`);
      }
      // Log the category being inserted for debugging
      if (partnerCategory.length > 50) {
        console.warn(`[partners] WARNING: partner_category value "${partnerCategory}" is ${partnerCategory.length} chars (may exceed DB column size)`);
      }
      
      // Try to insert, but catch and provide helpful error if partner_category is rejected
      let b;
      try {
        [b] = await q(`INSERT INTO buyers (client_id, partner_id, partner_category, company_id, store_code, business_type_id, location_condition_id, sale_size_id, credit_error_type, credit_max, slip_note)
          VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [
          client_id,
          partner_id,
          partnerCategory,
          cachedId(ctx, "companies", row.T0511),
          normalizeInt(row.T0513),
          cachedId(ctx, "business_types", row.T0601),
          cachedId(ctx, "location_conditions", row.T0603),
          cachedId(ctx, "sale_sizes", row.T0605),
          creditErrorTypeEnum[row.T2101],
          row.T2103,
          row.T24,
        ]
      );
      } catch (insertErr) {
        if (insertErr.message?.includes('partner_category') || insertErr.message?.includes('Data truncated')) {
          // Provide helpful error message
          throw new Error(
            `partner_category value "${partnerCategory}" rejected by database. ` +
            `The column may be an ENUM that doesn't include this value. ` +
            `Please check: SHOW COLUMNS FROM buyers LIKE 'partner_category'; ` +
            `Original error: ${insertErr.message}`
          );
        }
        throw insertErr;
      }
      const buyer_id = b.insertId;
      // Not counting buyers table rows
      
      await q(`
          INSERT INTO buyer_details
            (code, start_date, bill_collector_id, slip_type_id, buyer_id, branch_id, department_id, salesman_id, delivery_course_id,
            holiday_delivery_course_id, delivery_route, delivery_warehouse_id,
            holiday_delivery_warehouse_id, slip_fraction, partner_print_type,
            display_tax_type, calculation_method, tax_fraction, payment_method, cash_collection_method, has_key, container_trade_type)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `,[
          client_id,
          parseCsvDate(default_date),
          client_id,
          client_id,
          buyer_id,
          cachedIdOrDefault(ctx, "branches", row.T0401, 1),
          cachedId(ctx, "departments", row.T0403),
          cachedId(ctx, "users", row.T0405),
          cachedId(ctx, "delivery_courses", row.T0801),
          cachedId(ctx, "delivery_courses", row.T0801),
          row.T0803,
          cachedId(ctx, "warehouses", row.T0805),
          cachedId(ctx, "warehouses", row.T0805),
          slipFractionEnum[row.T0609],
          partnerPrintEnum[row.T0621],
          displayTaxEnum[row.T0701],
          calcMethodEnum[row.T0703],
          taxFractionEnum[row.T0705],
          paymentMethodEnum[row.T2501],
          cashCollectionMethodEnum[row.T2509],
          row.T2513,
          "NORMAL"
      ]);
      // Not counting buyer_details table rows
    }

    // Ledger Closing Pattern
    // Map of closing date suffixes
    const closingRows = [];
    const closingDateSuffixes = [7, 9, 11, 13, 15, 17];

    // Deposit plan enum conversion from T1821
    const deposit_plan = depositPlanEnum[row.T1821] ?? null;

    for (let g = 1; g <= 9; g++) {
      const code = row[`T1803_${g}`];

      // Skip if ledger classification code is zero or empty
      if (!code || Number(code) === 0) continue;

      // Get ledger_classification_id (once per group)
      const ledgerClassificationId = cachedId(ctx, "ledger_classifications", code);

      // Loop through all closing date fields
      for (const suffix of closingDateSuffixes) {
        const closingDate = row[`T18${suffix.toString().padStart(2, "0")}_${g}`];

        // Insert only if closing date exists and is non-zero
        if (closingDate && Number(closingDate) !== 0) {
          closingRows.push([
            partner_id, client_id, ledgerClassificationId,
            closingDate, deposit_plan, Number(default_date), client_id,
            row.T29 || default_date  // updated_at from CSV, or default_date if not provided
          ]);
        }
      }      
    }

    if (closingRows.length) {
      await q(`
        INSERT INTO partner_closing_details
          (partner_id, client_id, ledger_classification_id,
          closing_date, deposit_plan, deposit_date, updated_by, updated_at)
        VALUES ?
      `, [closingRows]);
      // Not counting partner_closing_details table rows
    }

    // Partner Timetables (T2201 + T2203_x fields)
    const timetableMode = Number(row.T2201); // 0, 1, or 2

    // Determine which week rows to insert
    const weeks =
      timetableMode === 0 ? [1,2,3,4,5] :
      timetableMode === 1 ? [1,3,5] :
      timetableMode === 2 ? [2,4] : [];

    const map = { 0: "SELF", 1: "HOLIDAY" };
    const days = [
      map[row.T2203_1] ?? null,
      map[row.T2203_2] ?? null,
      map[row.T2203_3] ?? null,
      map[row.T2203_4] ?? null,
      map[row.T2203_5] ?? null,
      map[row.T2203_6] ?? null,
      map[row.T2203_7] ?? null
    ];

    // Insert rows
    if (weeks.length) {
      await q(`
        INSERT INTO partner_timetables
          (partner_id, week, partner_timetable_plan_id,
          sunday, monday, tuesday, wednesday,
          thursday, friday, saturday, updated_at)
        VALUES ?
      `, [weeks.map(w => [partner_id, w, client_id, ...days, row.T29 || default_date])]);
      // Not counting partner_timetables table rows
    }
    ctx?.existingPartnerCodes?.add(code);
    return { success: true, rowsInserted: totalRowsInserted };

  } catch(err){
    // await conn.rollback();
    const code = key(row?.T0101);
    const t02 = row?.T02;
    const t02Num = Number(t02) || 0;
    const isSupplier = t02Num <= 9;
    const category = isSupplier ? supplierEnum(t02Num) : buyerEnum(t02Num);
    
    // Enhanced error logging for partner_category issues
    if (err.message?.includes('partner_category') || err.message?.includes('Data truncated')) {
      console.error(`[partners] partner_category error for code=${code}, T02=${t02}:`, {
        t02Num,
        isSupplier,
        category,
        categoryLength: category?.length,
        error: err.message
      });
    } else {
      console.error(`[partners] Row failed (code=${code}):`, err.message);
    }
    
    if (
      err.code === 'PROTOCOL_CONNECTION_LOST' ||
      err.code === 'ECONNRESET' ||
      err.code === 'ETIMEDOUT' ||
      err.fatal
    ) {
      throw err; // 🔥 VERY IMPORTANT
    }
    return { success: false, rowsInserted: 0 };
  } finally {
    // conn.release();
  }
}

export async function importOneItem(row) {
  const conn = await pool.getConnection();
  await conn.beginTransaction();

  try {
    let totalRowsInserted = 0; // Track total rows inserted across all tables
    const itemCode = row.S0101;

    // ----------------------------------------------------
    // 1) OVERWRITE PREVENTION — CHECK IF ITEM ALREADY EXISTS
    // ----------------------------------------------------
    const [existing] = await conn.query(
      `SELECT id FROM items WHERE code = ? LIMIT 1`,
      [itemCode]
    );

    if (existing.length > 0) {
      // Item already exists → skip importing
      await conn.rollback();
      conn.release();
      return { skipped: true, reason: "ITEM_ALREADY_EXISTS", code: itemCode, rowsInserted: 0 };
    }

    // ----------------------------------------------------
    // 2) CATEGORY & LOOKUPS
    // ----------------------------------------------------
    const { cat1, cat2, cat3 } = categoryLevels(row.S1201);

    // Use S1203 for manufacturer_id and brand_id (not S1205)
    const manufacturer_id = await idOrDefault(conn, "manufacturers", row.S1203);
    const brand_id        = await idFrom(conn, "brands", row.S1203);

    const container_type_id   = await idFrom(conn, "container_types", row.S1207) ?? 1;
    const place_of_origin_id  = await idFrom(conn, "place_of_origins", row.S1701);
    const main_material_id    = await idFrom(conn, "materials", row.S1703);
    const manufacture_type_id = await idFrom(conn, "manufacture_types", row.S1705);
    const storage_type_id     = await idFrom(conn, "storage_types", row.S1706);

    const cat1_id = await idFrom(conn, "item_categories", cat1);
    const cat2_id = await idFrom(conn, "item_categories", cat2) ?? "000";
    const cat3_id = await idFrom(conn, "item_categories", cat3);

    // Calculate middle category value from S1201
    let middleCategoryValue = null;
    let alcohol_tax_category_id = null;
    let itemType = itemTypeEnum[row.S02];
    
    // Convert S1201 to 6-digit middle category value
    // S1201 is always 5 digits. Ignore 4th and 5th digits, add two zeros in front of 1st digit,
    // and one zero in front of 2nd digit. Result: 00x0xx (6 digits)
    const s1201 = String(row.S1201 || "").padStart(5, "0");
    if (s1201.length >= 5) {
      // S1201 is 5 digits: positions 0,1,2,3,4
      // Ignore 4th and 5th digits (indices 3 and 4)
      const firstDigit = s1201.charAt(0) || "0";
      const secondDigit = s1201.charAt(1) || "0";
      const thirdDigit = s1201.charAt(2) || "0";
      // Construct: 00 + 1st digit + 0 + 2nd digit + 3rd digit = 00x0xx
      middleCategoryValue = `00${firstDigit}0${secondDigit}${thirdDigit}`;
      
      // Get alcohol_tax_category_id from alcohol_tax_categories where combination_code = middleCategoryValue
      const [alcoholTaxRows] = await conn.query(
        `SELECT alcohol_tax_category_id FROM item_categories WHERE combination_code = ? LIMIT 1`,
        [middleCategoryValue]
      );
      alcohol_tax_category_id = alcoholTaxRows.length ? alcoholTaxRows[0].id : null;
    }
    
    // When S02 = 1, also check item_categories to determine item type
    if (row.S02 == "1" || row.S02 == 1) {
      if (middleCategoryValue) {
        // Get alcohol_tax_category_id from item_categories where combination_code = middleCategoryValue
        const [categoryRows] = await conn.query(
          `SELECT alcohol_tax_category_id FROM item_categories WHERE combination_code = ? LIMIT 1`,
          [middleCategoryValue]
        );
        const categoryAlcoholTaxId = categoryRows.length && categoryRows[0].alcohol_tax_category_id 
          ? categoryRows[0].alcohol_tax_category_id 
          : null;
        
        // Set items.type based on alcohol_tax_category_id from item_categories
        // "酒以外" maps to "NOT_ALCOHOL", "酒類" maps to "ALCOHOL"
        if (categoryAlcoholTaxId == null) {
          itemType = "NOT_ALCOHOL";
        } else {
          itemType = "ALCOHOL";
        }
      }
    }

    // Get slip_classification_id and ledger_classification_id from 1st digit of S1201
    let slip_classification_id = null;
    let ledger_classification_id = null;
    if (row.S1201) {
      const firstDigit = String(row.S1201).charAt(0);
      if (firstDigit) {
        // const [slipRows] = await conn.query(
        //   `SELECT id FROM slip_types WHERE code = ? LIMIT 1`,
        //   [firstDigit]
        // );
        // slip_classification_id = slipRows.length ? slipRows[0].id : null;
        slip_classification_id = firstDigit;
        
        // const [ledgerRows] = await conn.query(
        //   `SELECT id FROM ledger_classifications WHERE code = ? LIMIT 1`,
        //   [firstDigit]
        // );
        // ledger_classification_id = ledgerRows.length ? ledgerRows[0].id : null;
        ledger_classification_id = firstDigit;
      }
    }

    // ----------------------------------------------------
    // 3) INSERT ITEMS
    // ----------------------------------------------------
    // Handle nickname fallback: if S0313 is null or "", use S0101
    const nickname = (row.S0313 && String(row.S0313).trim() !== "") ? row.S0313 : row.S0101;
    
    // Handle name_main fallback: if S05 is null or "", use S06
    const name_main = (row.S05 && String(row.S05).trim() !== "") ? row.S05 : row.S06;
    
    // Handle packaging: concatenate S09 + "X" + S11
    const packaging = `${row.S09 || ""}X${row.S11 || ""}`;

    const [item] = await conn.query(`
      INSERT INTO items (
        client_id, creator_id, last_updater_id,
        code,type,nickname,name_main,kana,abbreviation,abbreviation_kana,
        volume,capacity_case,item_category1_id,item_category2_id,item_category3_id,
        manufacturer_id,brand_id,is_set_registration,is_manage_container_deposit,
        container_type_id,is_exclude_rebates,is_different_treatment,unit_price_type,
        place_of_origin_id,main_material_id,manufacture_type_id,storage_type_id,
        alcohol_content,sake_meter_value,acidity_level,measurement_case_width,
        measurement_case_depth,measurement_case_height,measurement_case_weight,
        measurement_unit_width,measurement_unit_depth,measurement_unit_height,
        measurement_unit_weight,start_of_sale_date,end_of_sale_date,updated_at,packaging,
        alcohol_tax_category_id,slip_classification_id,ledger_classification_id
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `, [
      client_id, client_id, client_id,
      row.S0101, itemType, nickname, name_main, row.S06, row.S07, row.S08,
      row.S09, row.S11, cat1_id, cat2_id, cat3_id,
      manufacturer_id, brand_id, row.S1213, row.S1215,
      container_type_id,row.S1223,row.S1225,unitPriceTypeEnum[row.S1226],
      place_of_origin_id, main_material_id, manufacture_type_id, storage_type_id,
      row.S1711,row.S1713,row.S1715,row.S1719,
      row.S1721,row.S1723,row.S1725,
      row.S1727,row.S1729,row.S1731,row.S1733,
      parseCsvDate(row.S20),
      parseCsvDate(row.S21),
      parseCsvDate(row.S22),
      packaging,
      alcohol_tax_category_id,
      slip_classification_id,
      ledger_classification_id
    ]);

    const item_id = item.insertId;
    totalRowsInserted = 1; // Only count items table rows (1 per item)

    // ----------------------------------------------------
    // 4) INSERT item_search_information
    // ----------------------------------------------------
    const total_value = row.S0307 + row.S0309;

    const searchEntries = [
      { code: total_value, type: "JAN", priority: 1 },
      { code: row.S0311, type: "SDP", priority: 2 },
      { code: row.S0315, type: "OTHER", priority: 3 }
    ];

    for (const s of searchEntries) {
      if (s.code) {
        await conn.query(
          `INSERT INTO item_search_information (client_id, item_id, search_string, code_type, quantity_type, priority) 
           VALUES (?, ?, ?, ?, 'PIECE', ?)`,
          [client_id, item_id, s.code, s.type, s.priority]
        );
        // Not counting item_search_information rows
      }
    }

    // ----------------------------------------------------
    // 5) INSERT item_prices
    // ----------------------------------------------------
    // Helper function to parse date string (YYYYMMDD) to Date object
    function parseDateString(dateStr) {
      if (!dateStr || dateStr === "99999999" || dateStr === "20260101") {
        return null; // Special values
      }
      if (/^\d{8}$/.test(dateStr)) {
        const year = parseInt(dateStr.slice(0, 4));
        const month = parseInt(dateStr.slice(4, 6)) - 1; // Month is 0-indexed
        const day = parseInt(dateStr.slice(6, 8));
        return new Date(year, month, day);
      }
      return null;
    }

    // Helper function to format date back to YYYYMMDD string
    function formatDateString(date) {
      if (!date) return null;
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}${month}${day}`;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0); // Set to start of day for comparison

    // Collect all date values
    const dateKeys = ["S1601_1", "S1601_2", "S1601_3", "S1601_4", "S1601_5"];
    const dates = dateKeys.map(key => {
      const val = row[key];
      return {
        key,
        value: val,
        isSpecial: val === "99999999" || val === "20260101",
        date: parseDateString(val),
        seq: parseInt(key.split('_')[1])
      };
    });

    // Check if all dates are special (99999999 or 20260101)
    const allSpecial = dates.every(d => d.isSpecial);

    // Get dates that are not special
    const nonSpecialDates = dates.filter(d => !d.isSpecial && d.date !== null);
    
    // Separate dates by comparison to today
    const datesLessThanToday = nonSpecialDates.filter(d => d.date < today);
    const datesGreaterThanToday = nonSpecialDates.filter(d => d.date > today);

    // Determine start_date values
    let startDate1 = null;
    let startDate2 = null;

    if (allSpecial) {
      // Scenario 1: All dates are 99999999 or 20260101
      startDate1 = "20260101";
    } else if (datesGreaterThanToday.length === 0) {
      // Scenario 2: All dates are special or less than today
      const maxDate = datesLessThanToday.length > 0 
        ? datesLessThanToday.reduce((max, d) => d.date > max ? d.date : max, datesLessThanToday[0].date)
        : null;
      startDate1 = maxDate ? formatDateString(maxDate) : "20260101";
    } else {
      // Scenario 3: At least one date is greater than today
      const maxDateLessThanOrEqualToday = datesLessThanToday.length > 0
        ? datesLessThanToday.reduce((max, d) => d.date > max ? d.date : max, datesLessThanToday[0].date)
        : null;
      const maxDateGreaterThanToday = datesGreaterThanToday.reduce((max, d) => d.date > max ? d.date : max, datesGreaterThanToday[0].date);
      
      // startDate1 = future date (greater than today) - will be inserted FIRST
      startDate1 = formatDateString(maxDateGreaterThanToday);
      // startDate2 = current/past date (less than or equal to today) - will be inserted SECOND
      startDate2 = maxDateLessThanOrEqualToday ? formatDateString(maxDateLessThanOrEqualToday) : "20260101";
    }

    // Helper function to get price values for a row
    // For future date row (first): special dates → S1603_X/S1605_X, all others → S1609_X/S1611_X
    // For current/past date row (second): special OR > today → S1603_X/S1605_X, <= today → S1609_X/S1611_X
    function getPriceValues(isFutureDateRow) {
      const prices = [];
      for (let seq = 1; seq <= 5; seq++) {
        const dateKey = `S1601_${seq}`;
        const unitKey = `S1603_${seq}`;
        const caseKey = `S1605_${seq}`;
        const altUnitKey = `S1609_${seq}`;
        const altCaseKey = `S1611_${seq}`;

        const dateVal = row[dateKey];
        const isSpecial = dateVal === "99999999" || dateVal === "20260101";
        const date = parseDateString(dateVal);

        let unitPrice, casePrice;

        if (isFutureDateRow) {
          // Future date row (first): special dates → S1603_X/S1605_X, all others (≤ today OR > today) → S1609_X/S1611_X
          if (isSpecial) {
            unitPrice = row[unitKey];
            casePrice = row[caseKey];
          } else {
            unitPrice = row[altUnitKey];
            casePrice = row[altCaseKey];
          }
        } else {
          // Current/past date row (second): special OR > today → S1603_X/S1605_X, ≤ today → S1609_X/S1611_X
          if (isSpecial || (date && date > today)) {
            unitPrice = row[unitKey];
            casePrice = row[caseKey];
          } else {
            unitPrice = row[altUnitKey];
            casePrice = row[altCaseKey];
          }
        }

        prices.push(unitPrice ?? null, casePrice ?? null);
      }
      return prices;
    }

    // Determine item_prices.type based on S1750 and S1209/S1751
    let priceType = null;
    if (row.S1750 == "99999999" || row.S1750 == 99999999) {
      // If S1750 is 99999999, use S1209
      if (row.S1209 == "2" || row.S1209 == 2) {
        priceType = "POST_TAX_PERCENT_10";
      } else if (row.S1209 == "4" || row.S1209 == 4) {
        priceType = "POST_TAX_PERCENT_8";
      } else {
        priceType = "EXEMPT";
      }
    } else {
      // If S1750 is not 99999999, use S1751
      if (row.S1751 == "2" || row.S1751 == 2) {
        priceType = "POST_TAX_PERCENT_10";
      } else if (row.S1751 == "4" || row.S1751 == 4) {
        priceType = "POST_TAX_PERCENT_8";
      } else {
        priceType = "EXEMPT";
      }
    }

    // Insert first row: future date (greater than today)
    if (startDate1) {
      const prices1 = getPriceValues(true); // true = future date row

      await conn.query(`
        INSERT INTO item_prices 
        (client_id, creator_id, last_updater_id, item_id, start_date,
         producer_unit_price, producer_case_price,
         sale_unit_price, sale_case_price,
         sub_unit_price, sub_case_price,
         retail_unit_price, retail_case_price,
         tax_exempt_unit_price, tax_exempt_case_price, type) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        client_id,
        client_id,
        client_id,
        item_id,
        startDate1,
        ...prices1,
        priceType
      ]);
    }

    // Insert second row: current/past date (less than or equal to today) - only in Scenario 3
    if (startDate2) {
      const prices2 = getPriceValues(false); // false = current/past date row

      await conn.query(`
        INSERT INTO item_prices 
        (client_id, creator_id, last_updater_id, item_id, start_date,
         producer_unit_price, producer_case_price,
         sale_unit_price, sale_case_price,
         sub_unit_price, sub_case_price,
         retail_unit_price, retail_case_price,
         tax_exempt_unit_price, tax_exempt_case_price, type) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        client_id,
        client_id,
        client_id,
        item_id,
        startDate2,
        ...prices2,
        priceType
      ]);
    }

    // ----------------------------------------------------
    // 6) COMMIT
    // ----------------------------------------------------
    await conn.commit();
    conn.release();

    return { success: true, item_id, rowsInserted: totalRowsInserted };

  } catch (err) {
    await conn.rollback();
    conn.release();
    console.error("Item Import Failed:", row, err);
    return { success: false, error: err.message, rowsInserted: 0 };
  }
}


