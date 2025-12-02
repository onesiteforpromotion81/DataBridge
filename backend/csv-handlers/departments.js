import BaseActiveHandler from "../common/baseActiveHandler_6_15.js";

export default class Departments extends BaseActiveHandler {
  activeCode = "11";
  allowedColumns = ["MSM030", "MSM040", "MSM110"];
  columnMapping = null; // use default

  getTableName() {
    return "departments";
  }

  getUniqueKey() {
    return "code"; 
  }
}