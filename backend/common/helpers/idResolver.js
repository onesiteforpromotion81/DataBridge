import pool from "../../db/connections.js";

export async function idFrom(table, code, field="code"){
  if(!code) return null;
  const [rows] = await pool.query(`SELECT id FROM ${table} WHERE ${field}=? LIMIT 1`, [code]);
  return rows.length? rows[0].id : null;
}

export async function idOrDefault(table, code, defaultValue = 1) {
  if (!code || code === "0") return defaultValue;
  const id = await idFrom(table, code);
  return id ?? defaultValue;
}

