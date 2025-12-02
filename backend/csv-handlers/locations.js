import BaseActiveHandler from "../common/baseActiveHandler_6_15.js";

export default class Locations extends BaseActiveHandler {
  allowedColumns = ["S0104", "S0202", "S0204", "S0206"];
  columnMapping = null; // use default

  getTableName() {
    return "locations";
  }

  getUniqueKey() {
    return ["code1", "code2", "code3"]; 
  }
}