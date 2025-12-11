import BaseActiveHandler from "../common/baseActiveHandler_6_15.js";

export default class Items extends BaseActiveHandler {
  activeCode = null;
  allowedColumns = null;
  columnMapping = null; // use default

  getTableName() {
    return "items";
  }

  getUniqueKey() {
    return "code"; 
  }
}