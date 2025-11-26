import BaseActiveHandler from "../common/baseActiveHandler_6_15.js";

export default class Brands extends BaseActiveHandler {
  activeCode = "21";
  allowedColumns = ["MSM030", "MSM040", "MSM110"];
  columnMapping = null; // use default

  getTableName() {
    return "brands";
  }

  getUniqueKey() {
    return "code"; 
  }
}