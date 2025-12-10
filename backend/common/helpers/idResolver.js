import pool from "../../db/connections.js";

export async function idFrom(table, code, field="code"){
  if(!code) return null;
  const [rows] = await pool.query(`SELECT id FROM ${table} WHERE ${field}=? LIMIT 1`, [code]);
  return rows.length? rows[0].id : null;
}
