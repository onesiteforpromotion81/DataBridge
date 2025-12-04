import BaseActiveHandler from "../common/baseActiveHandler_6_15.js";

export default class Users extends BaseActiveHandler {
  activeCode = "1";
  allowedColumns = ["MSM030", "MSM040", "MSM110"];
  columnMapping = {
    MSM030: "code",
    MSM040: "name",
    MSM110: "updated_at",
    is_active: "is_active",
    permission_ship_rare_item: "permission_ship_rare_item",
    default_branch_id: "default_branch_id",
    default_warehouse_id: "default_warehouse_id",
    password: "password" ,
    email: "email"
  }

  getTableName() {
    return "users";
  }

  getUniqueKey() {
    return ["code", "name", "updated_at"]; 
  }
}