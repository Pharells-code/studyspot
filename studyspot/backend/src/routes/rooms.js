// routes/rooms.js - browsing and searching rooms (for all logged-in users).
const express = require('express');
const { query } = require('../db');
const cfg = require('../config');
const { HttpError, asyncHandler } = require('../utils/http');
const { isDate, toTime, toInt, str } = require('../utils/validate');
const { requireAuth } = require('../middleware/auth');
const { ACTIVE } = require('../services/bookingService');

const router = express.Router();
router.use(requireAuth);

// ---- GET /api/rooms/meta : booking rules + list of equipment (for the forms) ----
router.get('/meta', asyncHandler(async (req, res) => {
  const equipment = await query('SELECT equipment_id, equipment_name FROM equipment ORDER BY equipment_name');
  res.json({ rules: cfg.booking, organisation: cfg.organisation, equipment });
}));

// ---- GET /api/rooms : search rooms ---------------------------------------
// Optional filters: q, capacity, equipment (id), date + start + end (checks availability)
router.get('/', asyncHandler(async (req, res) => {
  const where = [];
  const params = [];

  const q = str(req.query.q);
  if (q) { where.push('(r.room_name LIKE ? OR r.building LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }

  const capacity = toInt(req.query.capacity, 1);
  if (capacity) { where.push('r.capacity >= ?'); params.push(capacity); }

  const equipmentId = toInt(req.query.equipment, 1);
  if (equipmentId) {
    where.push('EXISTS (SELECT 1 FROM room_equipment x WHERE x.room_id = r.room_id AND x.equipment_id = ?)');
    params.push(equipmentId);
  }

  const rooms = await query(
    `SELECT r.room_id, r.room_name, r.building, r.floor_no, r.capacity, r.description, r.status,
            (SELECT GROUP_CONCAT(CONCAT(e.equipment_name, IF(re.quantity > 1, CONCAT(' x', re.quantity), ''))
                                 ORDER BY e.equipment_name SEPARATOR '|')
               FROM room_equipment re JOIN equipment e ON e.equipment_id = re.equipment_id
              WHERE re.room_id = r.room_id) AS equipment
       FROM rooms r
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY r.building, r.room_name`,
    params
  );

  // If a date and time window was supplied, find which rooms are booked in that window.
  const date = req.query.date;
  const start = toTime(req.query.start);
  const end = toTime(req.query.end);
  let busy = new Set();
  const windowGiven = isDate(date) && start && end && end > start;
  if (windowGiven) {
    const rows = await query(
      `SELECT DISTINCT room_id FROM bookings
        WHERE booking_date = ? AND status IN ${ACTIVE} AND start_time < ? AND end_time > ?`,
      [date, end, start]
    );
    busy = new Set(rows.map((r) => r.room_id));
  }

  res.json(rooms.map((r) => ({
    ...r,
    equipment: r.equipment ? r.equipment.split('|') : [],
    // 'available' | 'booked' (taken in the chosen window) | 'maintenance'
    availability: r.status !== 'available' ? 'maintenance' : busy.has(r.room_id) ? 'booked' : 'available',
  })));
}));

// ---- GET /api/rooms/:id : one room with equipment ------------------------
router.get('/:id', asyncHandler(async (req, res) => {
  const id = toInt(req.params.id, 1);
  const [room] = id ? await query('SELECT * FROM rooms WHERE room_id = ?', [id]) : [];
  if (!room) throw new HttpError(404, 'Room not found.');
  room.equipment = await query(
    `SELECT e.equipment_id, e.equipment_name, re.quantity
       FROM room_equipment re JOIN equipment e ON e.equipment_id = re.equipment_id
      WHERE re.room_id = ? ORDER BY e.equipment_name`,
    [id]
  );
  res.json(room);
}));

// ---- GET /api/rooms/:id/slots?date=YYYY-MM-DD : times already taken -------
// (no personal details are shown, only the time ranges)
router.get('/:id/slots', asyncHandler(async (req, res) => {
  const id = toInt(req.params.id, 1);
  if (!id || !isDate(req.query.date)) throw new HttpError(400, 'Choose a room and a valid date.');
  const slots = await query(
    `SELECT start_time, end_time, status FROM bookings
      WHERE room_id = ? AND booking_date = ? AND status IN ${ACTIVE} ORDER BY start_time`,
    [id, req.query.date]
  );
  res.json(slots);
}));

module.exports = router;
