import BaseActiveHandler from "../common/baseActiveHandler_6_15.js";

export default class SlipTypes extends BaseActiveHandler {
  activeCode = "18";
  allowedColumns = ["MSM030", "MSM040", "MSM110"];
  columnMapping = null; // use default

  getTableName() {
    return "slip_types";
  }

  getUniqueKey() {
    return "code"; 
  }
}
