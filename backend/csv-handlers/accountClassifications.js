import BaseCSVHandler from "./baseHandler.js";

export default class AccountClassifications extends BaseCSVHandler {
  filterData(filters = {}) {
    const allowedColumns = ["MSM030", "MSM040", "MSM110"];
    return this.data.filter((row) => {
      // Only include active users
      if (row.MSM020 !== "30") return false;

      // Check dynamic column filters
      return allowedColumns.every((col) => {
        if (filters[col] !== undefined) {
          return row[col] === filters[col];
        }
        return true; // no filter for this column
      });
    });
  }

  getTableName() {
    return "account_classifications";
  }

  getColumns() {
    // Map CSV columns to DB columns
    return {
      MSM030: "code",
      MSM040: "name",
      MSM110: "updated_at",
    };
  }
}
