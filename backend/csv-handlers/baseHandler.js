export default class BaseCSVHandler {
  constructor(data) {
    this.data = data;
  }

  filterData() {
    // Default: return all rows
    return this.data;
  }

  getTableName() {
    throw new Error("getTableName() must be implemented in the subclass");
  }

  getColumns() {
    throw new Error("getColumns() must be implemented in the subclass");
  }
}
