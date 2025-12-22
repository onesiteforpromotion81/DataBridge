import pool from "../../db/connections.js";

/**
 * Import generic table data using bulk insert
 * @param {Object} handler - CSV handler instance
 * @param {string} table - Table name
 * @param {Array} filteredData - Transformed and filtered data
 * @returns {Promise<Object>} - Result with inserted count
 */
export async function importGenericTable(handler, table, filteredData) {
  if (filteredData.length === 0) {
    return {
      message: "No rows matched the filter",
      inserted: 0,
      tableName: table
    };
  }

  // Get column mapping
  let columnMap;
  if (table === 'notes') {
    columnMap = handler.getColumns_Note();
  } else if (table === 'locations') {
    columnMap = handler.getColumns_Location();
  } else {
    columnMap = handler.getColumns();
  }

  const dbColumns = Object.values(columnMap);
  const csvColumns = Object.keys(columnMap);

  // Ensure handler provides the unique key
  if (!handler.getUniqueKey) {
    throw new Error("Handler must implement getUniqueKey()");
  }

  const uniqueColumn = handler.getUniqueKey();
  const uniqueColumns = Array.isArray(uniqueColumn)
    ? uniqueColumn
    : [uniqueColumn];

  // Create unique index if needed
  await ensureUniqueIndex(table, uniqueColumns);

  // Bulk insert
  await bulkInsert(table, dbColumns, csvColumns, filteredData);

  // Handle special post-insert logic
  await handlePostInsert(table, filteredData);

  return {
    message: "CSVの処理が正常に完了しました",
    inserted: filteredData.length,
    tableName: table
  };
}

/**
 * Ensure unique index exists on the table
 */
async function ensureUniqueIndex(table, uniqueColumns) {
  const uniqueIndexName = "uniq_auto_index";

  const checkIndexSql = `
    SELECT COUNT(1) AS count
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = ?
      AND index_name = ?
  `;
  const [indexResult] = await pool.query(checkIndexSql, [table, uniqueIndexName]);

  if (indexResult[0].count === 0) {
    const columnsSql = uniqueColumns.map(col => `\`${col}\``).join(", ");

    const createIndexSql = `
      ALTER TABLE \`${table}\`
      ADD UNIQUE \`${uniqueIndexName}\` (${columnsSql})
    `;

    try {
      await pool.query(createIndexSql);
      console.log(
        `Created UNIQUE INDEX '${uniqueIndexName}' on ${table} (${columnsSql})`
      );
    } catch (err) {
      console.error("Failed to create UNIQUE index:", err);
    }
  }
}

/**
 * Perform bulk insert
 */
async function bulkInsert(table, dbColumns, csvColumns, filteredData) {
  const placeholders = filteredData
    .map(() => `(${dbColumns.map(() => "?").join(",")})`)
    .join(",");
  const values = filteredData.flatMap(row =>
    csvColumns.map(col => row[col] ?? null)
  );
  const sql = `
    INSERT IGNORE INTO ${table} (${dbColumns.join(",")})
    VALUES ${placeholders}
  `;

  await pool.query(sql, values);
}

/**
 * Handle post-insert operations (e.g., role assignment for users)
 */
async function handlePostInsert(table, filteredData) {
  if (table === "users") {
    const [users] = await pool.query(
      `SELECT id FROM users ORDER BY id DESC LIMIT ?`,
      [filteredData.length]
    );

    if (users.length) {
      const roleInsertValues = users
        .map(u => `(1,'App\\\\Models\\\\User',${u.id})`)
        .join(",");

      const roleSQL = `
        INSERT IGNORE INTO model_has_roles (role_id, model_type, model_id)
        VALUES ${roleInsertValues}
      `;

      await pool.query(roleSQL);
      console.log(`Assigned role_id=1 to ${users.length} users`);
    }
  }
}

