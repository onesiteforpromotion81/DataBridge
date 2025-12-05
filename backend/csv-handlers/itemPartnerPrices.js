import BaseActiveHandler from "../common/baseActiveHandler_6_15.js";

export default class ItemPartnerPrices extends BaseActiveHandler {
  allowedColumns = ["TKM030", "TKM040", "TKM060", "TKM070", "TKM080", "TKM090", "TKM100", "TKM120"];
  columnMapping = {
    TKM030: "partner_code",
    TKM040: "item_code",
    TKM060: "start_date",
    TKM070: "unit_price",
    TKM080: "case_price",
    TKM120: "updated_at"
  }

  getTableName() {
    return "item_partner_prices";
  }

  getUniqueKey() {
    return ["partner_code", "item_code", "start_date", "unit_price", "case_price", "updated_at"]; 
  }
}