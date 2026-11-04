// notify.js - in-app notifications (shown under the bell icon).
// A real deployment would also send an email; here the message is printed to the
// server console so the "email" part can be demonstrated without a mail server.
const { query } = require('../db');

async function notify(userId, bookingId, message, conn) {
  await query(
    'INSERT INTO notifications (user_id, booking_id, message) VALUES (?, ?, ?)',
    [userId, bookingId || null, String(message).slice(0, 255)],
    conn
  );
  console.log(`[notification -> user ${userId}] ${message}`);
}

module.exports = { notify };
