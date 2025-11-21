import { DEFAULT_ALLOWED_COLUMNS } from "../constants_6_15.js";

export function applyFilters(row, filters, allowedColumns = DEFAULT_ALLOWED_COLUMNS) {
  return allowedColumns.every((col) => {
    if (filters[col] !== undefined) {
      return row[col] === filters[col];
    }
    return true;
  });
}
