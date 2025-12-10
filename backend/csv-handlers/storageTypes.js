import BaseActiveHandler from "../common/baseActiveHandler_6_15.js";

export default class StorageTypes extends BaseActiveHandler {
  activeCode = "26";
  allowedColumns = ["MSM030", "MSM040", "MSM110"];
  columnMapping = null; // use default

  getTableName() {
    return "storage_types";
  }

  getUniqueKey() {
    return "code"; 
  }
}