import BaseActiveHandler from "../common/baseActiveHandler_6_15.js";

export default class AccountClassifications extends BaseActiveHandler {
  activeCode = "30"; // Only include rows with MSM020 = 30
  allowedColumns = ["MSM030", "MSM040", "MSM110"];
  columnMapping = null; // Uses default mapping from constants.js

  getTableName() {
    return "account_classifications";
  }

  getUniqueKey() {
    return "code"; 
  }
}