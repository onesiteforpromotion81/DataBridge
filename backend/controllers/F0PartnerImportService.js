import pool from "../db/connections.js";
import { supplierEnum, buyerEnum, slipFractionEnum, partnerPrintEnum, displayTaxEnum, calcMethodEnum, taxFractionEnum } from "../common/helpers/enumMaps.js";
import { idFrom } from "../common/helpers/idResolver.js";

export async function processPartner(row){
  const conn = await pool.getConnection();
  await conn.beginTransaction();
  try {
      console.log("code: ", row.T0101);
      // Insert Partner
      const partnerSQL = `
        INSERT INTO partners
          (code, partner_serial_number, nickname, name_main, kana_name, address1, address2, postal_code, tel, fax)
        VALUES (?,?,?,?,?,?,?,?,?,?)
      `;
      const [p] = await conn.query(partnerSQL, [
        row.T0101, row.T0510, row.T05103, row.T10, row.T11, row.T13,
        row.T14, `${row.T15}-${row.T1501}`, row.T16, row.T17
      ]);
      const partner_id = p.insertId;
      console.log("partner_id: ", partner_id);

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
                  display_tax_type, calculation_method, tax_fraction)
              VALUES (?,?,?,?,?,?,?,?,?)
          `,[
              supplier_id,
              await idFrom("branches",row.T0401),
              await idFrom("departments",row.T0403),
              await idFrom("users",row.T0405),
              slipFractionEnum[row.T0609],
              partnerPrintEnum[row.T0621],
              displayTaxEnum[row.T0701],
              calcMethodEnum[row.T0703],
              taxFractionEnum[row.T0705]
          ]);

      } else {
          const [b] = await conn.query(`INSERT INTO buyers (partner_id, partner_category, company_id, store_code, business_type_id, location_condition_id, sale_size_id)
            VALUES (?,?,?,?,?,?,?)`,
            [
              partner_id,
              buyerEnum(row.T02),
              await idFrom("companies",row.T0511),
              row.T0513,
              await idFrom("business_types",row.T0601),
              await idFrom("location_conditions",row.T0603),
              await idFrom("sale_sizes",row.T0605),
            ]
          );
          const buyer_id = b.insertId;
          await conn.query(`
              INSERT INTO buyer_details
                (buyer_id, branch_id, department_id, salesman_id, delivery_course_id,
                holiday_delivery_course_id, delivery_route, delivery_warehouse_id,
                holiday_delivery_warehouse_id, slip_fraction, partner_print_type,
                display_tax_type, calculation_method, tax_fraction)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
          `,[
              buyer_id,
              await idFrom("branches",row.T0401),
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
              taxFractionEnum[row.T0705]
          ]);
      }

      // Ledger Closing Pattern
      for(let g=1; g<=7; g++){
          for(let i=1;i<=6;i+=2){
              const date = row[`T18${String(i+6).padStart(2,'0')}_${g}`];
              const code = row[`T1803_${g}`];
              if(code && date){
                  await conn.query(`
                      INSERT INTO partner_closing_details (partner_id, ledger_classification_id, closing_date)
                      VALUES (?,?,?)
                  `,[ partner_id, await idFrom('ledger_classifications',code), date ]);
              }
          }
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
