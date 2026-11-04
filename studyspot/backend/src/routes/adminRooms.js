// routes/adminRooms.js - administrators add, edit, delete and search rooms and equipment.
const express = require('express');
const { query, withTransaction } = require('../db');
const { HttpError, asyncHandler } = require('../utils/http');
const { str, toInt } = require('../utils/validate');
const { audit } = require('../utils/audit');

const router = express.Router();

/** Validates the room form and returns clean values. */
function parseRoom(body) {
  const fields = {};
  const room_name = str(body.room_name);
  const building = str(body.building);
  const floor_no = toInt(body.floor_no, -5, 50);
  const capacity = toInt(body.capacity, 1, 500);
  const description = str(body.description).slice(0, 255);
  const status = body.status === 'maintenance' ? 'maintenance' : 'available';

  if (room_name.length < 2 || room_name.length > 50) fields.room_name = 'Room name must be 2-50 characters.';
  if (!building || building.length > 50) fields.building = 'Enter the building (up to 50 characters).';
  if (floor_no === null) fields.floor_no = 'Floor must be a whole number (0 = ground floor).';
  if (capacity === null) fields.capacity = 'Capacity must be a whole number between 1 and 500.';

  // equipment: [{ equipment_id, quantity }]
  const equipment = [];
  for (const item of Array.isArray(body.equipment) ? body.equipment : []) {
    const equipment_id = toInt(item.equipment_id, 1);
    const quantity = toInt(item.quantity ?? 1, 1, 100);
    if (equipment_id && quantity) equipment.push({ equipment_id, quantity });
  }
  if (Object.keys(fields).length) throw new HttpError(400, 'Please correct the highlighted fields.', fields);
  return { room_name, building, floor_no, capacity, description: description || null, status, equipment };
}

const duplicateRoom = (err) =>
  err.code === 'ER_DUP_ENTRY'
    ? new HttpError(409, 'A room with that name already exists.', { room_name: 'Already exists.' })
    : err;

async function writeEquipment(conn, roomId, equipment) {
  await query('DELETE FROM room_equipment WHERE room_id = ?', [roomId], conn);
  for (const e of equipment) {
    await query('INSERT INTO room_equipment (room_id, equipment_id, quantity) VALUES (?, ?, ?)',
      [roomId, e.equipment_id, e.quantity], conn);
  }
}

// ---- GET /api/admin/rooms?q= ---------------------------------------------
router.get('/rooms', asyncHandler(async (req, res) => {
  const q = str(req.query.q);
  const rooms = await query(
    `SELECT r.*, (SELECT COUNT(*) FROM bookings b WHERE b.room_id = r.room_id) AS booking_count
       FROM rooms r
      ${q ? 'WHERE r.room_name LIKE ? OR r.building LIKE ?' : ''}
      ORDER BY r.building, r.room_name`,
    q ? [`%${q}%`, `%${q}%`] : []
  );
  const links = await query(
    `SELECT re.room_id, re.equipment_id, re.quantity, e.equipment_name
       FROM room_equipment re JOIN equipment e ON e.equipment_id = re.equipment_id`
  );
  res.json(rooms.map((r) => ({ ...r, equipment: links.filter((l) => l.room_id === r.room_id) })));
}));

// ---- POST /api/admin/rooms -----------------------------------------------
router.post('/rooms', asyncHandler(async (req, res) => {
  const room = parseRoom(req.body);
  try {
    const id = await withTransaction(async (conn) => {
      const r = await query(
        `INSERT INTO rooms (room_name, building, floor_no, capacity, description, status) VALUES (?, ?, ?, ?, ?, ?)`,
        [room.room_name, room.building, room.floor_no, room.capacity, room.description, room.status], conn);
      await writeEquipment(conn, r.insertId, room.equipment);
      await audit(req.user, req, 'CREATE_ROOM', 'rooms', r.insertId, room.room_name, conn);
      return r.insertId;
    });
    res.status(201).json({ room_id: id, message: `Room "${room.room_name}" added.` });
  } catch (err) { throw duplicateRoom(err); }
}));

// ---- PUT /api/admin/rooms/:id --------------------------------------------
router.put('/rooms/:id', asyncHandler(async (req, res) => {
  const id = toInt(req.params.id, 1);
  const room = parseRoom(req.body);
  try {
    await withTransaction(async (conn) => {
      const [existing] = id ? await query('SELECT room_id FROM rooms WHERE room_id = ? FOR UPDATE', [id], conn) : [];
      if (!existing) throw new HttpError(404, 'Room not found.');
      await query(
        `UPDATE rooms SET room_name = ?, building = ?, floor_no = ?, capacity = ?, description = ?, status = ? WHERE room_id = ?`,
        [room.room_name, room.building, room.floor_no, room.capacity, room.description, room.status, id], conn);
      await writeEquipment(conn, id, room.equipment);
      await audit(req.user, req, 'UPDATE_ROOM', 'rooms', id, room.room_name, conn);
    });
    res.json({ message: `Room "${room.room_name}" updated.` });
  } catch (err) { throw duplicateRoom(err); }
}));

// ---- DELETE /api/admin/rooms/:id -----------------------------------------
router.delete('/rooms/:id', asyncHandler(async (req, res) => {
  const id = toInt(req.params.id, 1);
  const [room] = id ? await query('SELECT room_name FROM rooms WHERE room_id = ?', [id]) : [];
  if (!room) throw new HttpError(404, 'Room not found.');
  const [{ c }] = await query('SELECT COUNT(*) AS c FROM bookings WHERE room_id = ?', [id]);
  if (c > 0) {
    throw new HttpError(409, `"${room.room_name}" has ${c} booking(s) in its history and cannot be deleted. Set its status to "maintenance" instead.`);
  }
  await query('DELETE FROM rooms WHERE room_id = ?', [id]);
  await audit(req.user, req, 'DELETE_ROOM', 'rooms', id, room.room_name);
  res.json({ message: `Room "${room.room_name}" deleted.` });
}));

// ---- Equipment ------------------------------------------------------------
router.get('/equipment', asyncHandler(async (req, res) => {
  res.json(await query(
    `SELECT e.equipment_id, e.equipment_name,
            (SELECT COUNT(*) FROM room_equipment re WHERE re.equipment_id = e.equipment_id) AS rooms_using
       FROM equipment e ORDER BY e.equipment_name`));
}));

router.post('/equipment', asyncHandler(async (req, res) => {
  const name = str(req.body.equipment_name);
  if (name.length < 2 || name.length > 50) {
    throw new HttpError(400, 'Equipment name must be 2-50 characters.', { equipment_name: 'Enter 2-50 characters.' });
  }
  try {
    const r = await query('INSERT INTO equipment (equipment_name) VALUES (?)', [name]);
    await audit(req.user, req, 'CREATE_EQUIPMENT', 'equipment', r.insertId, name);
    res.status(201).json({ equipment_id: r.insertId, message: `"${name}" added.` });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'That equipment already exists.', { equipment_name: 'Already exists.' });
    throw err;
  }
}));

router.delete('/equipment/:id', asyncHandler(async (req, res) => {
  const id = toInt(req.params.id, 1);
  const [e] = id ? await query('SELECT equipment_name FROM equipment WHERE equipment_id = ?', [id]) : [];
  if (!e) throw new HttpError(404, 'Equipment not found.');
  await query('DELETE FROM equipment WHERE equipment_id = ?', [id]); // links are removed by ON DELETE CASCADE
  await audit(req.user, req, 'DELETE_EQUIPMENT', 'equipment', id, e.equipment_name);
  res.json({ message: `"${e.equipment_name}" deleted.` });
}));

module.exports = router;
