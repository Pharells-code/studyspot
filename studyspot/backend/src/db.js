// db.js - MySQL connection pool shared by the whole application.
// Every query in the project uses pool.execute(), which sends PREPARED STATEMENTS.
// Values are never joined into the SQL text, so SQL injection is not possible.
require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'studyspot_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true, // return DATE/TIME/DATETIME as plain text ("2026-11-05", "09:00:00")
  charset: 'utf8mb4',
});

/**
 * Runs `work(conn)` inside ONE database transaction.
 * If anything throws, every change is rolled back; otherwise it is committed.
 * The booking process uses this so that two people can never book the same slot.
 */
async function withTransaction(work) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await work(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/** Convenience: run a prepared statement and return only the rows. */
async function query(sql, params = [], conn = pool) {
  const [rows] = await conn.execute(sql, params.map((p) => (p === undefined ? null : p)));
  return rows;
}

module.exports = { pool, query, withTransaction };
