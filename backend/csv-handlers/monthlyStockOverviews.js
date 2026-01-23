import BaseCSVHandler from "./baseHandler.js";

export default class MonthlyStockOverviews extends BaseCSVHandler {
  allowedColumns = [
    "SZR020", "SZR030", "SZR040", "SZR050", "SZR060", "SZR070", "SZR080",
    "SZR090", "SZR100", "SZR110", "SZR120", "SZR220", "SZR230", "SZR240",
    "SZR250", "SZR255", "SZR260", "SZR310", "SZR330", "SZR340", "SZR350", "SZR420"
  ];
  columnMapping = null; // Not used for this handler - custom import service handles mapping

  getTableName() {
    return "monthly_stock_overviews";
  }

  getColumns() {
    // This won't be used since we have a custom import service
    return {};
  }

  getUniqueKey() {
    // Monthly stock overviews might have a composite unique key, but the import service will handle this
    return null;
  }
}
