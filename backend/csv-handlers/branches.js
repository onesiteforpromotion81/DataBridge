import BaseActiveHandler from "../common/baseActiveHandler_6_15.js";

export default class Branches extends BaseActiveHandler {
  activeCode = "10";
  allowedColumns = ["MSM030", "MSM040", "MSM110"];
  columnMapping = null; // use default

  getTableName() {
    return "branches";
  }

  getUniqueKey() {
    return "code"; 
  }
}