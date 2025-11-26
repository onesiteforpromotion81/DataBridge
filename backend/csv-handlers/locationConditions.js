import BaseActiveHandler from "../common/baseActiveHandler_6_15.js";

export default class LocationConditions extends BaseActiveHandler {
  activeCode = "13";
  allowedColumns = ["MSM030", "MSM040", "MSM110"];
  columnMapping = null; // use default

  getTableName() {
    return "location_conditions";
  }

  getUniqueKey() {
    return "code"; 
  }
}