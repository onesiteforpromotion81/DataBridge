import BaseActiveHandler from "../common/baseActiveHandler_6_15.js";

export default class ItemConnections extends BaseActiveHandler {
  allowedColumns = ["S0101", "S0103", "S02", "S03"];
  columnMapping = {
    S0101: "partner_id",
    S0103: "partner_item_code",
    S02: "item_id",
    S03: "updated_at",
  }

  getTableName() {
    return "item_connections";
  }

  getUniqueKey() {
    return ["partner_id", "item_id", "partner_item_code", "updated_at"]; 
  }
}