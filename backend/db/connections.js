import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();
console.log(process.env.DB_HOST);
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
});

export default pool;

export const testConnection = async () => {
  try {
    const connection = await pool.getConnection();
    console.log("✅ MySQL connected successfully!");
    connection.release();
  } catch (err) {
    console.error("❌ MySQL connection failed:", err);
  }
};
