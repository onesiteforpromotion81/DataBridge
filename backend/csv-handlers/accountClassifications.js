import BaseActiveHandler from "../common/baseActiveHandler_6_15.js";

export default class AccountClassifications extends BaseActiveHandler {
  activeCode = "30"; // Only include rows with MSM020 = 30
  allowedColumns = ["MSM030", "MSM040", "MSM110"];
  columnMapping = {
    MSM030: "code",
    MSM040: "name",
    MSM110: "updated_at",
    is_active: "is_active",
    client_id: "client_id" // Added for default client_id
  };

  getTableName() {
    return "account_classifications";
  }

  getUniqueKey() {
    return "code"; 
  }
}