import BaseActiveHandler from "../common/baseActiveHandler_6_15.js";

export default class BusinessTypes extends BaseActiveHandler {
  activeCode = "12";
  allowedColumns = ["MSM030", "MSM040", "MSM110"];
  columnMapping = null; // use default

  getTableName() {
    return "business_types";
  }

  getUniqueKey() {
    return "code"; 
  }
}
