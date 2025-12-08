import BaseActiveHandler from "../common/baseActiveHandler_6_15.js";

export default class ManufactureTypes extends BaseActiveHandler {
  activeCode = "25";
  allowedColumns = ["MSM030", "MSM040", "MSM110"];
  columnMapping = null; // use default

  getTableName() {
    return "manufacture_types";
  }

  getUniqueKey() {
    return "code"; 
  }
}