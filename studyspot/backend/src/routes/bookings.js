// routes/bookings.js - a user's own bookings: create, list, edit, cancel.
const express = require('express');
const { query, withTransaction } = require('../db');
const { HttpError, asyncHandler } = require('../utils/http');
const { toInt } = require('../utils/validate');
const { audit } = require('../utils/audit');
const { notify } = require('../utils/notify');
const { requireAuth } = require('../middleware/auth');
const { saveBooking, sweepFinishedBookings, ACTIVE } = require('../services/bookingService');

const router = express.Router();
router.use(requireAuth);

const SELECT_BOOKING = `
  SELECT b.booking_id, b.room_id, b.booking_date, b.start_time, b.end_time, b.purpose,
         b.attendees, b.status, b.created_at, r.room_name, r.building, r.floor_no
    FROM bookings b JOIN rooms r ON r.room_id = b.room_id`;

const describe = (b) => `${b.room_name} on ${b.booking_date} ${b.start_time.slice(0, 5)}-${b.end_time.slice(0, 5)}`;

// ---- POST /api/bookings : make a booking (the main transaction) -----------
router.post('/', asyncHandler(async (req, res) => {
  const saved = await withTransaction(async (conn) => {
    const result = await saveBooking(conn, req.user, req.body);
    const when = `${req.body.booking_date} ${String(req.body.start_time).slice(0, 5)}-${String(req.body.end_time).slice(0, 5)}`;
    const msg = result.status === 'pending'
      ? `Booking #${result.booking_id} for ${result.room.room_name} (${when}) was received and is waiting for administrator approval.`
      : `Booking #${result.booking_id} confirmed: ${result.room.room_name}, ${when}.`;
    await notify(req.user.user_id, result.booking_id, msg, conn);
    await audit(req.user, req, 'CREATE_BOOKING', 'bookings', result.booking_id, `${result.room.room_name} ${when}`, conn);
    return result;
  });
  res.status(201).json({
    booking_id: saved.booking_id,
    status: saved.status,
    message: saved.status === 'pending'
      ? 'Booking received. Because it is longer than 2 hours it must be approved by an administrator.'
      : `Booking #${saved.booking_id} confirmed. A confirmation has been sent.`,
  });
}));

// ---- GET /api/bookings/mine?tab=upcoming|past|cancelled -------------------
router.get('/mine', asyncHandler(async (req, res) => {
  await sweepFinishedBookings();
  const tab = req.query.tab || 'upcoming';
  let condition;
  let order = 'b.booking_date, b.start_time';
  if (tab === 'past') { condition = "b.status = 'completed'"; order = 'b.booking_date DESC, b.start_time DESC'; }
  else if (tab === 'cancelled') { condition = "b.status = 'cancelled'"; order = 'b.booking_date DESC, b.start_time DESC'; }
  else condition = `b.status IN ${ACTIVE}`;

  const rows = await query(`${SELECT_BOOKING} WHERE b.user_id = ? AND ${condition} ORDER BY ${order}`, [req.user.user_id]);
  res.json(rows);
}));

// ---- GET /api/bookings/:id -----------------------------------------------
router.get('/:id', asyncHandler(async (req, res) => {
  const id = toInt(req.params.id, 1);
  const [row] = id ? await query(`${SELECT_BOOKING} WHERE b.booking_id = ? AND b.user_id = ?`, [id, req.user.user_id]) : [];
  if (!row) throw new HttpError(404, 'Booking not found.');
  res.json(row);
}));

/** Loads one of the user's own bookings that can still be changed. */
async function loadEditable(id, user, conn) {
  const [b] = id ? await query(`${SELECT_BOOKING} WHERE b.booking_id = ? AND b.user_id = ? FOR UPDATE`, [id, user.user_id], conn) : [];
  if (!b) throw new HttpError(404, 'Booking not found.');
  if (!['pending', 'confirmed'].includes(b.status)) throw new HttpError(409, `A ${b.status} booking cannot be changed.`);
  if (new Date(`${b.booking_date}T${b.start_time}`).getTime() <= Date.now()) {
    throw new HttpError(409, 'This booking has already started, so it can no longer be changed.');
  }
  return b;
}

// ---- PUT /api/bookings/:id : edit ----------------------------------------
router.put('/:id', asyncHandler(async (req, res) => {
  const id = toInt(req.params.id, 1);
  const saved = await withTransaction(async (conn) => {
    const old = await loadEditable(id, req.user, conn);
    const result = await saveBooking(conn, req.user, { ...req.body, room_id: req.body.room_id || old.room_id }, id);
    await notify(req.user.user_id, id, `Booking #${id} was updated (${result.status}).`, conn);
    await audit(req.user, req, 'UPDATE_BOOKING', 'bookings', id, describe(old), conn);
    return result;
  });
  res.json({ booking_id: id, status: saved.status, message: `Booking #${id} updated.` });
}));

// ---- POST /api/bookings/:id/cancel ---------------------------------------
router.post('/:id/cancel', asyncHandler(async (req, res) => {
  const id = toInt(req.params.id, 1);
  await withTransaction(async (conn) => {
    const b = await loadEditable(id, req.user, conn);
    await query("UPDATE bookings SET status = 'cancelled' WHERE booking_id = ?", [id], conn);
    await notify(req.user.user_id, id, `Booking #${id} (${describe(b)}) was cancelled.`, conn);
    await audit(req.user, req, 'CANCEL_BOOKING', 'bookings', id, describe(b), conn);
  });
  res.json({ message: `Booking #${id} cancelled.` });
}));

module.exports = router;
