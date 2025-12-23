import BaseActiveHandler from "../common/baseActiveHandler_6_15.js";

export default class ItemConnections extends BaseActiveHandler {
  allowedColumns = ["S0101", "S0103", "S02", "S03"];
  // Note: S0101 and S02 are used for foreign key resolution in resolveForeignKeys
  // but are not included in columnMapping since the table uses partner_id and item_id
  columnMapping = {
    S0103: "partner_item_code",
    S03: "updated_at",
    partner_id: "partner_id",  // Resolved field (set by resolveForeignKeys from S0101)
    item_id: "item_id",         // Resolved field (set by resolveForeignKeys from S02)
    // Default values (set by applyDefaultValues)
    client_id: "client_id",
    is_supplier: "is_supplier",
    is_active: "is_active",
    creator_id: "creator_id",
    last_updater_id: "last_updater_id",
    created_at: "created_at",
    is_created_from_data_transfer: "is_created_from_data_transfer"
  }

  getTableName() {
    return "item_connections";
  }

  getUniqueKey() {
    return ["partner_id", "item_id", "partner_item_code", "updated_at"]; 
  }
}