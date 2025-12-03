import BaseActiveHandler from "../common/baseActiveHandler_6_15.js";

export default class Warehouses extends BaseActiveHandler {
  activeCode = "2";
  allowedColumns = ["MSM030", "MSM040", "MSM060_1", "MSM110"];
  columnMapping = {
    MSM030: "code",
    MSM040: "name",
    MSM060_1: "branch_id",
    MSM110: "updated_at",
    is_active: "is_active"
  };

  getTableName() {
    return "warehouses";
  }

  getUniqueKey() {
    return "code"; 
  }
}