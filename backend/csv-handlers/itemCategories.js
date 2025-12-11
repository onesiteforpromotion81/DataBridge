import BaseActiveHandler from "../common/baseActiveHandler_6_15.js";

export default class ItemCategories extends BaseActiveHandler {
  activeCode = "20";
  allowedColumns = ["MSM030", "MSM040", "MSM110"];
  columnMapping = {
    MSM030: "code",
    MSM040: "name",
    MSM110: "updated_at",
    combination_code: "combination_code",
    depth: "depth",
    alcohol_tax_category_id: "alcohol_tax_category_id"    
  }

  getTableName() {
    return "item_categories";
  }

  getUniqueKey() {
    return ["combination_code", "name", "depth", "updated_at"]; 
  }
}