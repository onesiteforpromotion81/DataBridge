import BaseActiveHandler from "../common/baseActiveHandler_6_15.js";

export default class Areas extends BaseActiveHandler {
  activeCode = "11";
  allowedColumns = ["MSM030", "MSM040", "MSM110"];
  columnMapping = null; // use default

  getTableName() {
    return "areas";
  }

  getUniqueKey() {
    return "code"; 
  }
}