// routes/adminBookings.js - administrators browse, approve and cancel any booking.
const express = require('express');
const { query, withTransaction } = require('../db');
const { HttpError, asyncHandler } = require('../utils/http');
const { str, toInt, isDate } = require('../utils/validate');
const { audit } = require('../utils/audit');
const { notify } = require('../utils/notify');
const { sweepFinishedBookings } = require('../services/bookingService');

const router = express.Router();

// Columns the table may be sorted by (a fixed list, so user text never reaches the SQL).
const SORTABLE = {
  booking_id: 'b.booking_id', date: 'b.booking_date', user: 'u.full_name',
  room: 'r.room_name', status: 'b.status', created: 'b.created_at',
};

// ---- GET /api/admin/bookings?date=&from=&to=&room_id=&status=&q=&sort=&dir= ----
router.get('/bookings', asyncHandler(async (req, res) => {
  await sweepFinishedBookings();
  const where = [];
  const params = [];

  if (isDate(req.query.date)) { where.push('b.booking_date = ?'); params.push(req.query.date); }
  if (isDate(req.query.from)) { where.push('b.booking_date >= ?'); params.push(req.query.from); }
  if (isDate(req.query.to)) { where.push('b.booking_date <= ?'); params.push(req.query.to); }
  const roomId = toInt(req.query.room_id, 1);
  if (roomId) { where.push('b.room_id = ?'); params.push(roomId); }
  if (['pending', 'confirmed', 'cancelled', 'completed'].includes(req.query.status)) {
    where.push('b.status = ?'); params.push(req.query.status);
  }
  const q = str(req.query.q);
  if (q) {
    where.push('(u.full_name LIKE ? OR u.email LIKE ? OR u.id_number LIKE ? OR b.purpose LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }

  const sortCol = SORTABLE[req.query.sort] || 'b.booking_date';
  const dir = req.query.dir === 'asc' ? 'ASC' : 'DESC';
  const rows = await query(
    `SELECT b.booking_id, b.booking_date, b.start_time, b.end_time, b.purpose, b.attendees, b.status, b.created_at,
            u.user_id, u.full_name AS user_name, u.email AS user_email, u.id_number,
            r.room_id, r.room_name, r.building
       FROM bookings b
       JOIN users u ON u.user_id = b.user_id
       JOIN rooms r ON r.room_id = b.room_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY ${sortCol} ${dir}, b.start_time ${dir}
      LIMIT 500`,
    params
  );
  res.json(rows);
}));

async function loadBooking(id, conn) {
  const [b] = id
    ? await query(
      `SELECT b.*, r.room_name FROM bookings b JOIN rooms r ON r.room_id = b.room_id WHERE b.booking_id = ? FOR UPDATE`,
      [id], conn)
    : [];
  if (!b) throw new HttpError(404, 'Booking not found.');
  return b;
}

// ---- POST /api/admin/bookings/:id/approve ---------------------------------
router.post('/bookings/:id/approve', asyncHandler(async (req, res) => {
  const id = toInt(req.params.id, 1);
  await withTransaction(async (conn) => {
    const b = await loadBooking(id, conn);
    if (b.status !== 'pending') throw new HttpError(409, `Only pending bookings can be approved (this one is ${b.status}).`);
    await query("UPDATE bookings SET status = 'confirmed' WHERE booking_id = ?", [id], conn);
    await notify(b.user_id, id, `Booking #${id} (${b.room_name}, ${b.booking_date}) was approved.`, conn);
    await audit(req.user, req, 'APPROVE_BOOKING', 'bookings', id, b.room_name, conn);
  });
  res.json({ message: `Booking #${id} approved.` });
}));

// ---- POST /api/admin/bookings/:id/cancel ----------------------------------
router.post('/bookings/:id/cancel', asyncHandler(async (req, res) => {
  const id = toInt(req.params.id, 1);
  const reason = str(req.body.reason).slice(0, 120);
  await withTransaction(async (conn) => {
    const b = await loadBooking(id, conn);
    if (!['pending', 'confirmed'].includes(b.status)) throw new HttpError(409, `A ${b.status} booking cannot be cancelled.`);
    await query("UPDATE bookings SET status = 'cancelled' WHERE booking_id = ?", [id], conn);
    await notify(b.user_id, id,
      `Booking #${id} (${b.room_name}, ${b.booking_date}) was cancelled by an administrator${reason ? ': ' + reason : '.'}`, conn);
    await audit(req.user, req, 'ADMIN_CANCEL_BOOKING', 'bookings', id, `${b.room_name}${reason ? ' - ' + reason : ''}`, conn);
  });
  res.json({ message: `Booking #${id} cancelled.` });
}));

module.exports = router;
