import BaseActiveHandler from "../common/baseActiveHandler_6_15.js";

export default class Partners extends BaseActiveHandler {
  activeCode = null;
  allowedColumns = null;
  columnMapping = null; // use default

  getTableName() {
    return "partners";
  }

  getUniqueKey() {
    return "code"; 
  }
}