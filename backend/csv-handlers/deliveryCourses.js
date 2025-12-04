import BaseActiveHandler from "../common/baseActiveHandler_6_15.js";

export default class DeliveryCourses extends BaseActiveHandler {
  activeCode = "4";
  allowedColumns = ["MSM030", "MSM040", "MSM110"];
  columnMapping = {
    MSM030: "code",
    MSM040: "name",
    MSM110: "updated_at",
    is_active: "is_active",
    warehouse_id: "warehouse_id"
  };

  getTableName() {
    return "delivery_courses";
  }

  getUniqueKey() {
    return "code"; 
  }
}