import pool from "../../db/connections.js";

/**
 * Safely truncate a table, handling foreign key constraints
 * @param {string} table - Table name to truncate
 * @param {Object} conn - Database connection (optional, uses pool if not provided)
 */
export async function truncateTable(table, conn = null) {
  const query = conn ? conn.query.bind(conn) : pool.query.bind(pool);
  
  try {
    // Try TRUNCATE first (fastest)
    await query(`TRUNCATE TABLE \`${table}\``);
    console.log(`[truncate] Successfully truncated table: ${table}`);
  } catch (err) {
    // If TRUNCATE fails (usually due to foreign key constraints), use DELETE
    if (err.code === 'ER_TRUNCATE_ILLEGAL_FK' || err.message?.includes('foreign key')) {
      console.log(`[truncate] TRUNCATE failed for ${table} due to foreign keys, using DELETE instead`);
      try {
        // Disable foreign key checks temporarily
        await query(`SET FOREIGN_KEY_CHECKS = 0`);
        await query(`TRUNCATE TABLE \`${table}\``);
        await query(`SET FOREIGN_KEY_CHECKS = 1`);
        console.log(`[truncate] Successfully truncated table (with FK disabled): ${table}`);
      } catch (err2) {
        // If TRUNCATE still fails, use DELETE FROM
        console.log(`[truncate] TRUNCATE still failed, using DELETE FROM for ${table}`);
        await query(`SET FOREIGN_KEY_CHECKS = 0`);
        await query(`DELETE FROM \`${table}\``);
        await query(`SET FOREIGN_KEY_CHECKS = 1`);
        console.log(`[truncate] Successfully deleted all rows from table: ${table}`);
      }
    } else {
      // Re-throw if it's a different error
      throw err;
    }
  }
}

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
      skipped: 0,
      failed: 0,
      tableNames: [table],
      tableStats: {
        [table]: { inserted: 0, skipped: 0, failed: 0 }
      }
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

  // Special handling for users table: delete all rows except where code = "0"
  if (table === "users") {
    const query = pool.query.bind(pool);
    try {
      // Delete all users except the one with code = "0" (handles NULL and both string/numeric types)
      await query(`DELETE FROM \`users\` WHERE code IS NULL OR code != ? OR code != ?`, ["0", 0]);
      console.log(`[users] Deleted all users except where code = "0"`);
      
      // Delete model_has_roles rows except where model_id = 445
      await query(`DELETE FROM \`model_has_roles\` WHERE model_id != ?`, [445]);
      console.log(`[model_has_roles] Deleted all rows except where model_id = 445`);
    } catch (err) {
      console.error(`[users] Error deleting users:`, err);
      throw err;
    }
  } else {
    // Truncate table before inserting (for all other tables)
    await truncateTable(table);
  }

  // Bulk insert and get statistics
  const mainTableStats = await bulkInsert(table, dbColumns, csvColumns, filteredData);
  
  // Handle special post-insert logic and get statistics for additional tables
  const additionalTableStats = await handlePostInsert(table, filteredData);
  
  const tableNames = [table];
  if (additionalTableStats && Object.keys(additionalTableStats).length > 0) {
    tableNames.push(...Object.keys(additionalTableStats));
  }

  // Build table statistics
  const tableStats = {
    [table]: mainTableStats
  };
  
  // Add statistics for additional tables
  Object.keys(additionalTableStats).forEach(additionalTable => {
    tableStats[additionalTable] = additionalTableStats[additionalTable];
  });

  return {
    message: "CSVの処理が正常に完了しました",
    inserted: mainTableStats.inserted,
    skipped: mainTableStats.skipped,
    failed: mainTableStats.failed,
    tableNames,
    tableStats
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
 * Perform bulk insert and return statistics
 * @returns {Promise<Object>} Statistics with inserted, skipped, failed counts
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

  const [result] = await pool.query(sql, values);
  
  // With INSERT IGNORE, affectedRows tells us how many rows were actually inserted
  // Rows that were skipped due to duplicates don't count as affected
  const inserted = result.affectedRows || 0;
  const skipped = filteredData.length - inserted;
  const failed = 0; // Bulk inserts either succeed or throw an error
  
  return {
    inserted,
    skipped,
    failed
  };
}

/**
 * Handle post-insert operations (e.g., role assignment for users)
 * @returns {Promise<Object>} Statistics for additional tables that were inserted into
 */
async function handlePostInsert(table, filteredData) {
  const additionalTableStats = {};
  
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

      const [result] = await pool.query(roleSQL);
      const inserted = result.affectedRows || 0;
      const skipped = users.length - inserted;
      
      additionalTableStats.model_has_roles = {
        inserted,
        skipped,
        failed: 0
      };
      
      console.log(`Assigned role_id=1 to ${users.length} users (inserted: ${inserted}, skipped: ${skipped})`);
    }
  }
  
  return additionalTableStats;
}

