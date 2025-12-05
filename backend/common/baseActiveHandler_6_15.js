import BaseCSVHandler from "../csv-handlers/baseHandler.js";
import { applyFilters } from "./helpers/applyFilters_6_15.js";
import { DEFAULT_ALLOWED_COLUMNS, DEFAULT_COLUMN_MAPPING, DEFAULT_COLUMN_MAPPING_Note, DEFAULT_ALLOWED_COLUMNS_LOCATIONS, DEFAULT_COLUMN_MAPPING_Location } from "./constants_6_15.js";

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

  filterDataLocations(filters = {}) {
    return this.data.filter(row => {
      return applyFilters(row, filters, DEFAULT_ALLOWED_COLUMNS_LOCATIONS);
    });
  }

  filterDataItemPartnerPrices(filters = {}) {
    return this.data.filter(row => {
      return applyFilters(row, filters, this.allowedColumns);
    })
  }

  /**
   * Shared column mapping
   */
  getColumns() {
    return this.columnMapping || DEFAULT_COLUMN_MAPPING;
  }

  getColumns_Note() {
    return this.columnMapping || DEFAULT_COLUMN_MAPPING_Note;
  }

  getColumns_Location() {
    return this.columnMapping || DEFAULT_COLUMN_MAPPING_Location;
  }
}
