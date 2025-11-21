import BaseCSVHandler from "../csv-handlers/baseHandler.js";
import { applyFilters } from "./helpers/applyFilters_6_15.js";
import { DEFAULT_ALLOWED_COLUMNS, DEFAULT_COLUMN_MAPPING } from "./constants_6_15.js";

export default class BaseActiveHandler extends BaseCSVHandler {
  constructor(...args) {
    super(...args);
  }

  /**
   * Each subclass must define:
   *   this.activeCode — example: "18" or "12"
   */
  activeCode = null;

  /**
   * Shared filtering behavior
   */
  filterData(filters = {}) {
    return this.data.filter(row => {
      if (row.MSM020 !== this.activeCode) return false;
      return applyFilters(row, filters, this.allowedColumns || DEFAULT_ALLOWED_COLUMNS);
    });
  }

  /**
   * Shared column mapping
   */
  getColumns() {
    return this.columnMapping || DEFAULT_COLUMN_MAPPING;
  }
}
