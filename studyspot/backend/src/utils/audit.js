// audit.js - writes the audit trail (who did what, and when).
const { query } = require('../db');

/**
 * Records one action in the audit_logs table.
 * @param {object|null} user   the logged-in user (req.user) or null
 * @param {object} req         the Express request (used for the IP address)
 * @param {string} action      e.g. LOGIN, CREATE_BOOKING, DELETE_ROOM
 * @param {string} tableName   table affected (optional)
 * @param {number} recordId    id of the affected record (optional)
 * @param {string} details     short human-readable detail (optional)
 * @param {object} conn        use the same transaction connection when inside one
 */
async function audit(user, req, action, tableName = null, recordId = null, details = null, conn) {
  try {
    await query(
      `INSERT INTO audit_logs (user_id, action, table_name, record_id, details, ip_address)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [user ? user.user_id : null, action, tableName, recordId, details ? String(details).slice(0, 255) : null,
        req && req.ip ? String(req.ip).slice(0, 45) : null],
      conn
    );
  } catch (err) {
    // Auditing must never break the real action; just report it in the log.
    console.error('Audit log failed:', err.message);
  }
}

module.exports = { audit };
