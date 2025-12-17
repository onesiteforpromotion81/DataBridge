import dotenv from "dotenv";
dotenv.config();

import mysql from "mysql2/promise";

// Create MySQL pool with optimized settings for remote connections
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,  // default to 3306 if undefined
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
  connectTimeout: 10000,
  // Optimize for remote connections (reduce round-trips)
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  // Reduce connection overhead
  queueLimit: 0,  // Unlimited queue (default)
  // TCP keepalive settings (helps maintain connections)
  socketTimeout: Number(process.env.DB_SOCKET_TIMEOUT || 60000),  // 60s default
});

// Export pool for use in other modules
export default pool;

// Test connection function with latency measurement
export const testConnection = async () => {
  try {
    const startTime = Date.now();
    const connection = await pool.getConnection();
    const connectTime = Date.now() - startTime;
    
    // Test query latency
    const queryStart = Date.now();
    await connection.query("SELECT 1");
    const queryTime = Date.now() - queryStart;
    
    console.log(`✅ MySQL connected successfully!`);
    console.log(`   Connection time: ${connectTime}ms`);
    console.log(`   Query latency: ${queryTime}ms`);
    console.log(`   Host: ${process.env.DB_HOST || 'not set'}`);
    
    connection.release();
    
    // Warn if latency is high
    if (queryTime > 100) {
      console.warn(`⚠️  High query latency detected (${queryTime}ms). Consider deploying backend closer to database.`);
    }
  } catch (err) {
    console.error("❌ MySQL connection failed:", err);
  }
};
