import BaseCSVHandler from "./baseHandler.js";

export default class RealStocks extends BaseCSVHandler {
  allowedColumns = ["S0102", "S0104", "S0106", "S0202", "S0204", "S0206", "S0502"];
  columnMapping = null; // Not used for this handler - custom import service handles mapping

  getTableName() {
    return "real_stocks";
  }

  getColumns() {
    // This won't be used since we have a custom import service
    return {};
  }

  getUniqueKey() {
    // Real stocks might have a composite unique key, but the import service will handle this
    return null;
  }
}
