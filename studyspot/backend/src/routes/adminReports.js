// routes/adminReports.js - dashboard numbers, reports (filter + sort) and the audit trail.
const express = require('express');
const { query } = require('../db');
const cfg = require('../config');
const { HttpError, asyncHandler } = require('../utils/http');
const { str, toInt, isDate, localDateString, addDays, toMinutes } = require('../utils/validate');
const { sweepFinishedBookings } = require('../services/bookingService');

const router = express.Router();

// ---- GET /api/admin/stats : numbers for the dashboard ----------------------
router.get('/stats', asyncHandler(async (req, res) => {
  await sweepFinishedBookings();
  const today = localDateString();

  const [{ rooms }] = await query('SELECT COUNT(*) AS rooms FROM rooms');
  const [{ bookingsToday }] = await query(
    "SELECT COUNT(*) AS bookingsToday FROM bookings WHERE booking_date = ? AND status <> 'cancelled'", [today]);
  const [{ activeUsers }] = await query(
    `SELECT COUNT(*) AS activeUsers FROM users u JOIN roles r ON r.role_id = u.role_id
      WHERE u.status = 'active' AND r.role_name = ?`, [cfg.roles.USER]);
  const [{ cancelledWeek }] = await query(
    "SELECT COUNT(*) AS cancelledWeek FROM bookings WHERE status = 'cancelled' AND booking_date >= ?", [addDays(today, -6)]);
  const [{ pending }] = await query("SELECT COUNT(*) AS pending FROM bookings WHERE status = 'pending'");

  // bookings per day for the last 7 days (today included), with zeros filled in
  const first = addDays(today, -6);
  const perDayRows = await query(
    `SELECT booking_date AS d, COUNT(*) AS c FROM bookings
      WHERE booking_date BETWEEN ? AND ? AND status <> 'cancelled' GROUP BY booking_date`, [first, today]);
  const perDay = [];
  for (let i = 0; i < 7; i += 1) {
    const d = addDays(first, i);
    const hit = perDayRows.find((r) => r.d === d);
    perDay.push({ date: d, count: hit ? Number(hit.c) : 0 });
  }

  const latest = await query(
    `SELECT b.booking_id, b.booking_date, b.start_time, b.end_time, b.status,
            u.full_name AS user_name, r.room_name
       FROM bookings b JOIN users u ON u.user_id = b.user_id JOIN rooms r ON r.room_id = b.room_id
      ORDER BY b.created_at DESC, b.booking_id DESC LIMIT 5`);

  res.json({ rooms, bookingsToday, activeUsers, cancelledWeek, pending, perDay, latest });
}));

/** Reads from/to dates (default: the last 30 days) and the optional room filter. */
function readFilters(req) {
  const today = localDateString();
  const from = isDate(req.query.from) ? req.query.from : addDays(today, -29);
  const to = isDate(req.query.to) ? req.query.to : today;
  if (from > to) throw new HttpError(400, 'The "from" date must not be after the "to" date.');
  return { from, to, roomId: toInt(req.query.room_id, 1) };
}

/** Details printed at the top of every report (organisation name, date generated...). */
function header(title, filters) {
  return { title, organisation: cfg.organisation, system: cfg.systemName, generated_at: new Date().toISOString(), filters };
}

// ---- GET /api/admin/reports/usage : room usage ----------------------------
// Filter: from, to, room_id.   Sort: sort = room|bookings|hours|utilisation|cancelled, dir = asc|desc
router.get('/reports/usage', asyncHandler(async (req, res) => {
  await sweepFinishedBookings();
  const { from, to, roomId } = readFilters(req);

  const rows = await query(
    `SELECT r.room_id, r.room_name, r.building, r.capacity,
            COALESCE(SUM(b.status IN ('confirmed','completed')), 0) AS bookings,
            COALESCE(SUM(b.status = 'cancelled'), 0) AS cancelled,
            COALESCE(SUM(CASE WHEN b.status IN ('confirmed','completed')
                         THEN TIME_TO_SEC(TIMEDIFF(b.end_time, b.start_time)) END), 0) / 3600 AS hours
       FROM rooms r
       LEFT JOIN bookings b ON b.room_id = r.room_id AND b.booking_date BETWEEN ? AND ?
      ${roomId ? 'WHERE r.room_id = ?' : ''}
      GROUP BY r.room_id, r.room_name, r.building, r.capacity`,
    roomId ? [from, to, roomId] : [from, to]
  );

  const days = Math.round((new Date(`${to}T00:00:00`) - new Date(`${from}T00:00:00`)) / 86400000) + 1;
  const openHours = (toMinutes(`${cfg.booking.closeTime}:00`) - toMinutes(`${cfg.booking.openTime}:00`)) / 60;
  const data = rows.map((r) => ({
    room_id: r.room_id, room: r.room_name, building: r.building, capacity: r.capacity,
    bookings: Number(r.bookings), cancelled: Number(r.cancelled),
    hours: Math.round(Number(r.hours) * 10) / 10,
    utilisation: Math.round((Number(r.hours) / (days * openHours)) * 1000) / 10, // percent
  }));

  const sortKey = ['room', 'bookings', 'hours', 'utilisation', 'cancelled'].includes(req.query.sort) ? req.query.sort : 'room';
  const factor = req.query.dir === 'desc' ? -1 : 1;
  data.sort((a, b) => (typeof a[sortKey] === 'string'
    ? a[sortKey].localeCompare(b[sortKey])
    : a[sortKey] - b[sortKey]) * factor);

  res.json({
    ...header('Room Usage Report', { from, to, room_id: roomId || null, sort: sortKey, dir: factor === 1 ? 'asc' : 'desc' }),
    columns: ['room', 'building', 'capacity', 'bookings', 'cancelled', 'hours', 'utilisation'],
    rows: data,
    totals: {
      bookings: data.reduce((s, r) => s + r.bookings, 0),
      cancelled: data.reduce((s, r) => s + r.cancelled, 0),
      hours: Math.round(data.reduce((s, r) => s + r.hours, 0) * 10) / 10,
    },
  });
}));

// ---- GET /api/admin/reports/bookings : list of bookings -------------------
// Filter: from, to, room_id, status.   Sort: sort = date|user|room|status, dir = asc|desc
router.get('/reports/bookings', asyncHandler(async (req, res) => {
  await sweepFinishedBookings();
  const { from, to, roomId } = readFilters(req);
  const where = ['b.booking_date BETWEEN ? AND ?'];
  const params = [from, to];
  if (roomId) { where.push('b.room_id = ?'); params.push(roomId); }
  const status = ['pending', 'confirmed', 'cancelled', 'completed'].includes(req.query.status) ? req.query.status : null;
  if (status) { where.push('b.status = ?'); params.push(status); }

  const sortMap = { date: 'b.booking_date', user: 'u.full_name', room: 'r.room_name', status: 'b.status' };
  const sortKey = sortMap[req.query.sort] ? req.query.sort : 'date';
  const dir = req.query.dir === 'desc' ? 'DESC' : 'ASC';

  const rows = await query(
    `SELECT b.booking_id, b.booking_date AS date, b.start_time, b.end_time, b.attendees, b.status,
            u.full_name AS user, u.id_number, r.room_name AS room
       FROM bookings b JOIN users u ON u.user_id = b.user_id JOIN rooms r ON r.room_id = b.room_id
      WHERE ${where.join(' AND ')}
      ORDER BY ${sortMap[sortKey]} ${dir}, b.start_time`,
    params
  );
  res.json({
    ...header('Bookings Report', { from, to, room_id: roomId || null, status, sort: sortKey, dir: dir.toLowerCase() }),
    columns: ['booking_id', 'date', 'start_time', 'end_time', 'room', 'user', 'id_number', 'attendees', 'status'],
    rows,
    totals: { bookings: rows.length },
  });
}));

// ---- GET /api/admin/audit?q=&from=&to=&limit= : the audit trail -----------
router.get('/audit', asyncHandler(async (req, res) => {
  const where = [];
  const params = [];
  const q = str(req.query.q);
  if (q) {
    where.push('(a.action LIKE ? OR a.details LIKE ? OR u.full_name LIKE ? OR u.email LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (isDate(req.query.from)) { where.push('a.created_at >= ?'); params.push(`${req.query.from} 00:00:00`); }
  if (isDate(req.query.to)) { where.push('a.created_at <= ?'); params.push(`${req.query.to} 23:59:59`); }
  const limit = toInt(req.query.limit, 1, 500) || 200;

  const rows = await query(
    `SELECT a.log_id, a.created_at, a.action, a.table_name, a.record_id, a.details, a.ip_address,
            u.full_name AS user_name, u.email AS user_email
       FROM audit_logs a LEFT JOIN users u ON u.user_id = a.user_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY a.log_id DESC LIMIT ${limit}`,
    params
  );
  res.json(rows);
}));

module.exports = router;
