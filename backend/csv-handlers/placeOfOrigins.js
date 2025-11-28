import BaseActiveHandler from "../common/baseActiveHandler_6_15.js";

export default class PlaceOfOrigins extends BaseActiveHandler {
  activeCode = "23";
  allowedColumns = ["MSM030", "MSM040", "MSM110"];
  columnMapping = null; // use default

  getTableName() {
    return "place_of_origins";
  }

  getUniqueKey() {
    return "code"; 
  }
}