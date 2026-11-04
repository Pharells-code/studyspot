// bookingService.js - the MAIN TRANSACTION of the system: reserving a room.
//
// All checks and the INSERT/UPDATE happen inside one database transaction.
// The room row is locked first (SELECT ... FOR UPDATE), so if two students try to
// book the same room at the same moment, one waits for the other and then sees the
// slot is taken. A room can therefore never be double-booked.
const { query } = require('../db');
const cfg = require('../config').booking;
const { HttpError } = require('../utils/http');
const { isDate, toTime, toMinutes, localDateString, addDays, toInt, str } = require('../utils/validate');

const ACTIVE = "('pending','confirmed')"; // statuses that occupy a room

/** Checks the raw request body and returns clean values (throws HttpError on problems). */
function parseBookingInput(body) {
  const fields = {};
  const roomId = toInt(body.room_id, 1);
  const date = body.booking_date;
  const start = toTime(body.start_time);
  const end = toTime(body.end_time);
  const attendees = toInt(body.attendees, 1, 500);
  const purpose = str(body.purpose).slice(0, 255);

  if (!roomId) fields.room_id = 'Please choose a room.';
  if (!isDate(date)) fields.booking_date = 'Please choose a valid date.';
  if (!start) fields.start_time = 'Please enter a valid start time.';
  if (!end) fields.end_time = 'Please enter a valid end time.';
  if (!attendees) fields.attendees = 'Number of attendees must be a whole number of 1 or more.';
  if (Object.keys(fields).length) throw new HttpError(400, 'Please correct the highlighted fields.', fields);

  return { roomId, date, start, end, attendees, purpose };
}

/** Business rules about WHEN a booking may happen. Throws HttpError with a clear message. */
function checkTimeRules({ date, start, end }) {
  const startMin = toMinutes(start);
  const endMin = toMinutes(end);
  const duration = endMin - startMin;
  const fail = (field, msg) => { throw new HttpError(400, msg, { [field]: msg }); };

  if (endMin <= startMin) fail('end_time', 'End time must be after the start time.');
  if (startMin < toMinutes(`${cfg.openTime}:00`)) fail('start_time', `Rooms open at ${cfg.openTime}.`);
  if (endMin > toMinutes(`${cfg.closeTime}:00`)) fail('end_time', `Rooms close at ${cfg.closeTime}.`);
  if (startMin % cfg.slotMinutes !== 0 || endMin % cfg.slotMinutes !== 0) {
    fail('start_time', `Times must be on ${cfg.slotMinutes}-minute marks (for example 09:00 or 09:30).`);
  }
  if (duration < cfg.minMinutes) fail('end_time', `A booking must be at least ${cfg.minMinutes} minutes.`);
  if (duration > cfg.maxHours * 60) fail('end_time', `A booking can be at most ${cfg.maxHours} hours.`);

  const today = localDateString();
  if (date < today) fail('booking_date', 'You cannot book a date that has already passed.');
  if (date > addDays(today, cfg.maxAdvanceDays)) {
    fail('booking_date', `Rooms can only be booked up to ${cfg.maxAdvanceDays} days ahead.`);
  }
  if (date === today && new Date(`${date}T${start}`).getTime() <= Date.now()) {
    fail('start_time', 'That start time has already passed. Please choose a later time.');
  }
  return duration;
}

/**
 * Creates (existingId = null) or edits (existingId = id) a booking for `user`.
 * MUST be called with a connection that is inside a transaction (see withTransaction).
 */
async function saveBooking(conn, user, body, existingId = null) {
  const input = parseBookingInput(body);
  const { roomId, date, start, end, attendees, purpose } = input;
  const duration = checkTimeRules(input);

  // 1. Lock the room row: other bookings for this room must wait until we finish.
  const [room] = await query('SELECT * FROM rooms WHERE room_id = ? FOR UPDATE', [roomId], conn);
  if (!room) throw new HttpError(404, 'That room does not exist.');
  if (room.status !== 'available') throw new HttpError(409, 'That room is under maintenance and cannot be booked.');
  if (attendees > room.capacity) {
    throw new HttpError(400, `${room.room_name} holds at most ${room.capacity} people.`, {
      attendees: `Maximum capacity is ${room.capacity}.`,
    });
  }

  // 2. Is the slot free? (an overlap exists when start < other.end AND end > other.start)
  const clash = await query(
    `SELECT booking_id FROM bookings
      WHERE room_id = ? AND booking_date = ? AND status IN ${ACTIVE}
        AND start_time < ? AND end_time > ? AND booking_id <> ?
      FOR UPDATE`,
    [roomId, date, end, start, existingId || 0],
    conn
  );
  if (clash.length) {
    throw new HttpError(409, 'Sorry, that room is already booked for part of the time you chose. Please pick another time or room.');
  }

  // 3. A person cannot be in two rooms at once.
  const myClash = await query(
    `SELECT booking_id FROM bookings
      WHERE user_id = ? AND booking_date = ? AND status IN ${ACTIVE}
        AND start_time < ? AND end_time > ? AND booking_id <> ?`,
    [user.user_id, date, end, start, existingId || 0],
    conn
  );
  if (myClash.length) throw new HttpError(409, 'You already have another booking at that time.');

  // 4. Limit how many upcoming bookings one person can hold (new bookings only).
  if (!existingId) {
    const [{ c }] = await query(
      `SELECT COUNT(*) AS c FROM bookings
        WHERE user_id = ? AND status IN ${ACTIVE} AND TIMESTAMP(booking_date, end_time) > NOW()`,
      [user.user_id],
      conn
    );
    if (c >= cfg.maxActivePerUser) {
      throw new HttpError(409, `You already have ${c} upcoming bookings. Cancel one before making another.`);
    }
  }

  // Long bookings wait for an administrator's approval.
  const status = duration > cfg.approvalAfterHours * 60 ? 'pending' : 'confirmed';

  if (existingId) {
    await query(
      `UPDATE bookings SET room_id = ?, booking_date = ?, start_time = ?, end_time = ?,
              purpose = ?, attendees = ?, status = ? WHERE booking_id = ?`,
      [roomId, date, start, end, purpose || null, attendees, status, existingId],
      conn
    );
    return { booking_id: existingId, status, room };
  }

  const result = await query(
    `INSERT INTO bookings (user_id, room_id, booking_date, start_time, end_time, purpose, attendees, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [user.user_id, roomId, date, start, end, purpose || null, attendees, status],
    conn
  );
  return { booking_id: result.insertId, status, room };
}

/**
 * Housekeeping: bookings whose time has passed become "completed";
 * pending bookings that nobody approved in time are cancelled.
 */
async function sweepFinishedBookings() {
  await query(
    "UPDATE bookings SET status = 'completed' WHERE status = 'confirmed' AND TIMESTAMP(booking_date, end_time) < NOW()"
  );
  await query(
    "UPDATE bookings SET status = 'cancelled' WHERE status = 'pending' AND TIMESTAMP(booking_date, start_time) < NOW()"
  );
}

module.exports = { saveBooking, sweepFinishedBookings, ACTIVE };
