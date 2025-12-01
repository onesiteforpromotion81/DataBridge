import BaseActiveHandler from "../common/baseActiveHandler_6_15.js";

export default class Materials extends BaseActiveHandler {
  activeCode = "0";
  allowedColumns = ["MSM030", "MSM040", "MSM110"];
  columnMapping = null; // use default

  getTableName() {
    return "notes";
  }

  getUniqueKey() {
    return "code"; 
  }
}