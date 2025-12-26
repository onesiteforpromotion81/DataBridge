import BaseActiveHandler from "../common/baseActiveHandler_6_15.js";

export default class SaleSizes extends BaseActiveHandler {
  activeCode = "21";
  allowedColumns = ["MSM030", "MSM040", "MSM110"];
  columnMapping = {
    MSM030: "code",
    MSM040: "name",
    MSM110: "updated_at",
    is_active: "is_active",
    client_id: "client_id"
  };

  getTableName() {
    return "manufacturers";
  }

  getUniqueKey() {
    return "code"; 
  }
}