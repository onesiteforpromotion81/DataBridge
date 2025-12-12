import pool from "../db/connections.js";
import { supplierEnum, buyerEnum, slipFractionEnum, partnerPrintEnum, displayTaxEnum, calcMethodEnum, taxFractionEnum, depositPlanEnum, creditErrorTypeEnum, weekEnum, paymentMethodEnum, cashCollectionMethodEnum, itemTypeEnum, unitPriceTypeEnum, categoryLevels } from "../common/helpers/enumMaps.js";
import { idFrom, idOrDefault } from "../common/helpers/idResolver.js";

export async function processPartner(row){
  const conn = await pool.getConnection();
  await conn.beginTransaction();
  try {
    const [exists] = await conn.query(
      "SELECT id FROM partners WHERE code = ? LIMIT 1",
      [row.T0101]
    );

    if (exists.length > 0) {
      conn.release();
      console.log(`Partner skipped (already exists) - code: ${row.T0101}`);
      return { skipped: true };
    }
    // Insert Partner
    const partnerSQL = `
      INSERT INTO partners
        (code, partner_serial_number, nickname, name_main, kana_name, address1, address2, postal_code, tel, fax, entry_note, start_of_trade_date, end_of_trade_date, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `;
    const [p] = await conn.query(partnerSQL, [
      row.T0101, row.T0510, row.T05103, row.T10, row.T11, row.T13,
      row.T14, `${row.T15}-${row.T1501}`, row.T16, row.T17, row.T23, row.T27, row.T28, row.T29
    ]);
    const partner_id = p.insertId;

    await conn.query(`UPDATE partners SET bill_group_id=?, partner_price_group_id=? WHERE id=?`,
      [partner_id, partner_id, partner_id]);

    const isSupplier = Number(row.T02) <= 9;

    if(isSupplier){
      const [s] = await conn.query(`INSERT INTO suppliers (partner_id, partner_category) VALUES (?,?)`,
        [partner_id, supplierEnum(row.T02)]
      );
      const supplier_id = s.insertId;
      await conn.query(`
        INSERT INTO supplier_details
          (supplier_id, branch_id, department_id, salesman_id, slip_fraction, partner_print_type,
            display_tax_type, calculation_method, tax_fraction, payment_method)
        VALUES (?,?,?,?,?,?,?,?,?,?)
      `,[
        supplier_id,
        await idOrDefault("branches",row.T0401),
        await idFrom("departments",row.T0403),
        await idFrom("users",row.T0405),
        slipFractionEnum[row.T0609],
        partnerPrintEnum[row.T0621],
        displayTaxEnum[row.T0701],
        calcMethodEnum[row.T0703],
        taxFractionEnum[row.T0705],
        paymentMethodEnum[row.T2501]
      ]);
    } else {
      const [b] = await conn.query(`INSERT INTO buyers (partner_id, partner_category, company_id, store_code, business_type_id, location_condition_id, sale_size_id, credit_error_type, credit_max, slip_note)
        VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [
          partner_id,
          buyerEnum(row.T02),
          await idFrom("companies",row.T0511),
          row.T0513,
          await idFrom("business_types",row.T0601),
          await idFrom("location_conditions",row.T0603),
          await idFrom("sale_sizes",row.T0605),
          creditErrorTypeEnum[row.T2101],
          row.T2103,
          row.T24,
        ]
      );
      const buyer_id = b.insertId;
      await conn.query(`
          INSERT INTO buyer_details
            (buyer_id, branch_id, department_id, salesman_id, delivery_course_id,
            holiday_delivery_course_id, delivery_route, delivery_warehouse_id,
            holiday_delivery_warehouse_id, slip_fraction, partner_print_type,
            display_tax_type, calculation_method, tax_fraction, payment_method, cash_collection_method, has_key)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `,[
          buyer_id,
          await idOrDefault("branches",row.T0401),
          await idFrom("departments",row.T0403),
          await idFrom("users",row.T0405),
          await idFrom("delivery_courses",row.T0801),
          await idFrom("delivery_courses",row.T0801),
          row.T0803,
          await idFrom("warehouses",row.T0805),
          await idFrom("warehouses",row.T0805),
          slipFractionEnum[row.T0609],
          partnerPrintEnum[row.T0621],
          displayTaxEnum[row.T0701],
          calcMethodEnum[row.T0703],
          taxFractionEnum[row.T0705],
          paymentMethodEnum[row.T2501],
          cashCollectionMethodEnum[row.T2509],
          row.T2513
      ]);
    }

    // Ledger Closing Pattern
    // Map of closing date suffixes
    const closingDateSuffixes = [7, 9, 11, 13, 15, 17];

    // Deposit plan enum conversion from T1821
    const deposit_plan = depositPlanEnum[row.T1821] ?? null;

    for (let g = 1; g <= 9; g++) {
      const code = row[`T1803_${g}`];

      // Skip if ledger classification code is zero or empty
      if (!code || Number(code) === 0) continue;

      // Get ledger_classification_id (once per group)
      const ledgerClassificationId = await idFrom('ledger_classifications', code);

      // Loop through all closing date fields
      for (const suffix of closingDateSuffixes) {
        const closingDate = row[`T18${suffix.toString().padStart(2, "0")}_${g}`];

        // Insert only if closing date exists and is non-zero
        if (closingDate && Number(closingDate) !== 0) {
          await conn.query(`
            INSERT INTO partner_closing_details (
              partner_id,
              ledger_classification_id,
              closing_date,
              deposit_plan
            )
            VALUES (?, ?, ?, ?)
          `, [
            partner_id,
            ledgerClassificationId,
            closingDate,
            deposit_plan
          ]);
        }
      }
    }

    // Partner Timetables (T2201 + T2203_x fields)
    const timetableMode = Number(row.T2201); // 0, 1, or 2

    // Determine which week rows to insert
    let weeksToInsert = [];
    if (timetableMode === 0) {
      weeksToInsert = [1, 2, 3, 4, 5];
    } else if (timetableMode === 1) {
      weeksToInsert = [1, 3, 5];
    } else if (timetableMode === 2) {
      weeksToInsert = [2, 4];
    }

    // Prepare enum mapping for timetable
    const timetableEnum = {
      0: "SELF",
      1: "HOLIDAY"
    };

    // Convert each T2203 field to enum
    const sunday    = timetableEnum[row.T2203_1] ?? null;
    const monday    = timetableEnum[row.T2203_2] ?? null;
    const tuesday   = timetableEnum[row.T2203_3] ?? null;
    const wednesday = timetableEnum[row.T2203_4] ?? null;
    const thursday  = timetableEnum[row.T2203_5] ?? null;
    const friday    = timetableEnum[row.T2203_6] ?? null;
    const saturday  = timetableEnum[row.T2203_7] ?? null;

    // Insert rows
    for (const week of weeksToInsert) {
      await conn.query(`
        INSERT INTO partner_timetables (
          partner_id, week,
          sunday, monday, tuesday, wednesday, thursday, friday, saturday
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        partner_id,
        week,
        sunday,
        monday,
        tuesday,
        wednesday,
        thursday,
        friday,
        saturday
      ]);
    }

    await conn.commit();
    conn.release();
    return true;

  } catch(err){
    await conn.rollback();
    conn.release();
    console.error("Row failed",row,err.message);
    return false;
  }
}

// export async function importOneItem(row) {

//   const conn = await pool.getConnection();
//   await conn.beginTransaction();
//   const { cat1, cat2, cat3 } = categoryLevels(row.S1201);

//   // get manufacturer & brand
//   const manufacturer_id = await idFrom("manufacturers", row.S1205);
//   const brand_id        = await idFrom("brands", row.S1205);

//   // lookups
//   const container_type_id   = await idFrom("container_types", row.S1207) ?? 1;
//   const place_of_origin_id  = await idFrom("place_of_origins", row.S1701);
//   const main_material_id    = await idFrom("materials", row.S1703);
//   const manufacture_type_id = await idFrom("manufacture_types", row.S1705);
//   const storage_type_id     = await idFrom("storage_types", row.S1706);
//   const cat1_id = await idFrom("item_categories", cat1);
//   const cat2_id = await idFrom("item_categories", cat2) ?? "000";
//   const cat3_id = await idFrom("item_categories", cat3);

//   // ---------------------- INSERT => items -------------------------
//   const [item] = await conn.query(`
//       INSERT INTO items (
//         code,type,nickname,name_main,kana,abbreviation,abbreviation_kana,
//         volume,capacity_case,item_category1_id,item_category2_id,item_category3_id,
//         manufacturer_id,brand_id,is_set_registration,is_manage_container_deposit,
//         container_type_id,is_exclude_rebates,is_different_treatment,unit_price_type,
//         place_of_origin_id,main_material_id,manufacture_type_id,storage_type_id,
//         alcohol_content,sake_meter_value,acidity_level,measurement_case_width,
//         measurement_case_depth,measurement_case_height,measurement_case_weight,
//         measurement_unit_width,measurement_unit_depth,measurement_unit_height,
//         measurement_unit_weight,start_of_sale_date,end_of_sale_date,updated_at
//       ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
//   `,[
//       row.S0101, itemTypeEnum[row.S02], row.S0313, row.S05, row.S06, row.S07, row.S08,
//       row.S09, row.S11, cat1_id, cat2_id, cat3_id,
//       manufacturer_id, brand_id, row.S1213, row.S1215,
//       container_type_id,row.S1223,row.S1225,unitPriceTypeEnum[row.S1226],
//       place_of_origin_id, main_material_id, manufacture_type_id, storage_type_id,
//       row.S1711,row.S1713,row.S1715,row.S1719,
//       row.S1721,row.S1723,row.S1725,
//       row.S1727,row.S1729,row.S1731,row.S1733,
//       row.S20,row.S21,row.S22
//   ]);

//   const item_id = item.insertId;
//   // ---------------------------------------------------------------



//   // ---------------- INSERT item_search_information ---------------
//   const total_value = row.S0307 + row.S0309;

//   const searchEntries = [
//     {code: total_value,   type:"JAN"},
//     {code: row.S0311,     type:"SDP"},
//     {code: row.S0315,     type:"OTHER"}
//   ];

//   for(const s of searchEntries){
//     if(s.code) {
//       await conn.query(
//         `INSERT INTO item_search_information (item_id,search_string,code_type,quantity_type) 
//          VALUES (?,?,?, 'PIECE')`,
//         [item_id,s.code,s.type]
//       );
//     }
//   }
//   // ---------------------------------------------------------------



//   // ---------------------- ITEM PRICE INSERT HELPER ---------------
//   async function insertPrice(seq){
//     const dKey = `S1601_${seq}`;
//     const unitKey = `S1603_${seq}`;
//     const caseKey = `S1605_${seq}`;
//     const altUnitKey = `S1609_${seq}`;
//     const altCaseKey = `S1611_${seq}`;

//     const isDefault = row[dKey] == "99999999";

//     await conn.query(`
//       INSERT INTO item_prices 
//       (item_id,start_date,${priceColumnNames(seq)}) 
//       VALUES (?,?,?,?)
//     `,[
//       item_id,
//       isDefault ? "20250101" : row[dKey],
//       isDefault ? row[unitKey] : row[altUnitKey],
//       isDefault ? row[caseKey] : row[altCaseKey],
//     ]);
//   }

//   function priceColumnNames(seq){
//     return {
//       1:"producer_unit_price, producer_case_price",
//       2:"sale_unit_price, sale_case_price",
//       3:"sub_unit_price, sub_case_price",
//       4:"retail_unit_price, retail_case_price",
//       5:"tax_exempt_unit_price, tax_exempt_case_price"
//     }[seq];
//   }

//   for(let i=1;i<=5;i++) await insertPrice(i);
//   // ---------------------------------------------------------------
//   await conn.commit();
//   conn.release();
//   return true;
// }

export async function importOneItem(row) {
  const conn = await pool.getConnection();
  await conn.beginTransaction();

  try {
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
      return { skipped: true, reason: "ITEM_ALREADY_EXISTS", code: itemCode };
    }

    // ----------------------------------------------------
    // 2) CATEGORY & LOOKUPS
    // ----------------------------------------------------
    const { cat1, cat2, cat3 } = categoryLevels(row.S1201);

    const manufacturer_id = await idOrDefault("manufacturers", row.S1205);
    const brand_id        = await idFrom("brands", row.S1205);

    const container_type_id   = await idFrom("container_types", row.S1207) ?? 1;
    const place_of_origin_id  = await idFrom("place_of_origins", row.S1701);
    const main_material_id    = await idFrom("materials", row.S1703);
    const manufacture_type_id = await idFrom("manufacture_types", row.S1705);
    const storage_type_id     = await idFrom("storage_types", row.S1706);

    const cat1_id = await idFrom("item_categories", cat1);
    const cat2_id = await idFrom("item_categories", cat2) ?? "000";
    const cat3_id = await idFrom("item_categories", cat3);

    // ----------------------------------------------------
    // 3) INSERT ITEMS
    // ----------------------------------------------------
    const [item] = await conn.query(`
      INSERT INTO items (
        code,type,nickname,name_main,kana,abbreviation,abbreviation_kana,
        volume,capacity_case,item_category1_id,item_category2_id,item_category3_id,
        manufacturer_id,brand_id,is_set_registration,is_manage_container_deposit,
        container_type_id,is_exclude_rebates,is_different_treatment,unit_price_type,
        place_of_origin_id,main_material_id,manufacture_type_id,storage_type_id,
        alcohol_content,sake_meter_value,acidity_level,measurement_case_width,
        measurement_case_depth,measurement_case_height,measurement_case_weight,
        measurement_unit_width,measurement_unit_depth,measurement_unit_height,
        measurement_unit_weight,start_of_sale_date,end_of_sale_date,updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `, [
      row.S0101, itemTypeEnum[row.S02], row.S0313, row.S05, row.S06, row.S07, row.S08,
      row.S09, row.S11, cat1_id, cat2_id, cat3_id,
      manufacturer_id, brand_id, row.S1213, row.S1215,
      container_type_id,row.S1223,row.S1225,unitPriceTypeEnum[row.S1226],
      place_of_origin_id, main_material_id, manufacture_type_id, storage_type_id,
      row.S1711,row.S1713,row.S1715,row.S1719,
      row.S1721,row.S1723,row.S1725,
      row.S1727,row.S1729,row.S1731,row.S1733,
      row.S20,row.S21,row.S22
    ]);

    const item_id = item.insertId;

    // ----------------------------------------------------
    // 4) INSERT item_search_information
    // ----------------------------------------------------
    const total_value = row.S0307 + row.S0309;

    const searchEntries = [
      { code: total_value, type: "JAN" },
      { code: row.S0311, type: "SDP" },
      { code: row.S0315, type: "OTHER" }
    ];

    for (const s of searchEntries) {
      if (s.code) {
        await conn.query(
          `INSERT INTO item_search_information (item_id, search_string, code_type, quantity_type) 
           VALUES (?, ?, ?, 'PIECE')`,
          [item_id, s.code, s.type]
        );
      }
    }

    // ----------------------------------------------------
    // 5) INSERT item_prices (helper)
    // ----------------------------------------------------
    async function insertPrice(seq) {
      const dKey       = `S1601_${seq}`;
      const unitKey    = `S1603_${seq}`;
      const caseKey    = `S1605_${seq}`;
      const altUnitKey = `S1609_${seq}`;
      const altCaseKey = `S1611_${seq}`;

      const isDefault = row[dKey] == "99999999";

      await conn.query(`
        INSERT INTO item_prices 
        (item_id, start_date, ${priceColumnNames(seq)}) 
        VALUES (?, ?, ?, ?)
      `, [
        item_id,
        isDefault ? "20250101" : row[dKey],
        isDefault ? row[unitKey] : row[altUnitKey],
        isDefault ? row[caseKey] : row[altCaseKey]
      ]);
    }

    function priceColumnNames(seq) {
      return {
        1: "producer_unit_price, producer_case_price",
        2: "sale_unit_price, sale_case_price",
        3: "sub_unit_price, sub_case_price",
        4: "retail_unit_price, retail_case_price",
        5: "tax_exempt_unit_price, tax_exempt_case_price"
      }[seq];
    }

    for (let i = 1; i <= 5; i++) {
      await insertPrice(i);
    }

    // ----------------------------------------------------
    // 6) COMMIT
    // ----------------------------------------------------
    await conn.commit();
    conn.release();

    return { success: true, item_id };

  } catch (err) {
    await conn.rollback();
    conn.release();
    console.error("Item Import Failed:", row, err);
    return { success: false, error: err.message };
  }
}


