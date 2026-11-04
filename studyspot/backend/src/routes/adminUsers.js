// routes/adminUsers.js - register users, reset passwords, suspend, change roles, delete.
// Administrators manage ordinary users; only the Super Administrator manages admin accounts.
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const express = require('express');
const { query } = require('../db');
const cfg = require('../config');
const { HttpError, asyncHandler } = require('../utils/http');
const { str, toInt, passwordError } = require('../utils/validate');
const { audit } = require('../utils/audit');
const { validateProfile, duplicateError } = require('./auth');

const router = express.Router();
const ROLE_NAMES = Object.values(cfg.roles);

/** A readable one-time password such as "Spot-4821-xQ". */
function tempPassword() {
  const n = crypto.randomInt(1000, 9999);
  const tail = crypto.randomBytes(2).toString('hex');
  return `Spot-${n}-${tail}`;
}

/** Only the Super Administrator may create, edit or delete admin-level accounts. */
function checkCanManage(actor, targetRole) {
  if (targetRole !== cfg.roles.USER && actor.role !== cfg.roles.SUPER) {
    throw new HttpError(403, 'Only a Super Administrator can manage administrator accounts.');
  }
}

async function loadUser(id) {
  const [u] = id
    ? await query(`SELECT u.user_id, u.full_name, u.email, u.status, r.role_name AS role
                     FROM users u JOIN roles r ON r.role_id = u.role_id WHERE u.user_id = ?`, [id])
    : [];
  if (!u) throw new HttpError(404, 'User not found.');
  return u;
}

// ---- GET /api/admin/users?q=&role=&status= --------------------------------
router.get('/users', asyncHandler(async (req, res) => {
  const where = [];
  const params = [];
  const q = str(req.query.q);
  if (q) {
    where.push('(u.full_name LIKE ? OR u.email LIKE ? OR u.id_number LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (ROLE_NAMES.includes(req.query.role)) { where.push('r.role_name = ?'); params.push(req.query.role); }
  if (['active', 'suspended'].includes(req.query.status)) { where.push('u.status = ?'); params.push(req.query.status); }

  const rows = await query(
    `SELECT u.user_id, u.id_number, u.full_name, u.email, u.phone, u.status, u.created_at, u.last_login,
            r.role_name AS role,
            (SELECT COUNT(*) FROM bookings b WHERE b.user_id = u.user_id) AS booking_count
       FROM users u JOIN roles r ON r.role_id = u.role_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY u.created_at DESC LIMIT 500`,
    params
  );
  res.json(rows);
}));

// ---- POST /api/admin/users : register a user ------------------------------
router.post('/users', asyncHandler(async (req, res) => {
  const role = ROLE_NAMES.includes(req.body.role) ? req.body.role : cfg.roles.USER;
  checkCanManage(req.user, role);

  const given = typeof req.body.password === 'string' && req.body.password !== '';
  const profile = validateProfile(req.body, { needPassword: given });
  const password = given ? req.body.password : tempPassword();
  const hash = await bcrypt.hash(password, cfg.auth.bcryptRounds);
  const [r] = await query('SELECT role_id FROM roles WHERE role_name = ?', [role]);
  try {
    const result = await query(
      `INSERT INTO users (role_id, id_number, full_name, email, phone, password_hash) VALUES (?, ?, ?, ?, ?, ?)`,
      [r.role_id, profile.id_number, profile.full_name, profile.email, profile.phone, hash]
    );
    await audit(req.user, req, 'CREATE_USER', 'users', result.insertId, `${profile.email} (${role})`);
    res.status(201).json({
      user_id: result.insertId,
      message: `${profile.full_name} registered as ${role}.`,
      temporary_password: given ? undefined : password, // shown once to the administrator
    });
  } catch (err) { throw duplicateError(err); }
}));

// ---- PUT /api/admin/users/:id : edit details, suspend/activate, change role -
router.put('/users/:id', asyncHandler(async (req, res) => {
  const id = toInt(req.params.id, 1);
  const target = await loadUser(id);
  checkCanManage(req.user, target.role);

  const fields = {};
  const full_name = str(req.body.full_name) || target.full_name;
  const phone = str(req.body.phone);
  const status = req.body.status || target.status;
  const role = req.body.role || target.role;

  if (full_name.length < 3 || full_name.length > 100) fields.full_name = 'Enter a full name (at least 3 characters).';
  if (phone && !/^\+?[0-9 ]{7,15}$/.test(phone)) fields.phone = 'Enter a valid phone number.';
  if (!['active', 'suspended'].includes(status)) fields.status = 'Invalid status.';
  if (!ROLE_NAMES.includes(role)) fields.role = 'Invalid role.';
  if (Object.keys(fields).length) throw new HttpError(400, 'Please correct the highlighted fields.', fields);

  if (role !== target.role) checkCanManage(req.user, role);          // promoting to admin needs Super Admin
  if (id === req.user.user_id && (status !== 'active' || role !== target.role)) {
    throw new HttpError(409, 'You cannot suspend your own account or change your own role.');
  }

  const [r] = await query('SELECT role_id FROM roles WHERE role_name = ?', [role]);
  await query('UPDATE users SET full_name = ?, phone = ?, status = ?, role_id = ? WHERE user_id = ?',
    [full_name, phone || null, status, r.role_id, id]);
  const changes = [];
  if (status !== target.status) changes.push(`status ${target.status}->${status}`);
  if (role !== target.role) changes.push(`role ${target.role}->${role}`);
  await audit(req.user, req, 'UPDATE_USER', 'users', id, `${target.email}${changes.length ? ': ' + changes.join(', ') : ''}`);
  res.json({ message: `${full_name} updated.` });
}));

// ---- POST /api/admin/users/:id/reset-password -----------------------------
router.post('/users/:id/reset-password', asyncHandler(async (req, res) => {
  const id = toInt(req.params.id, 1);
  const target = await loadUser(id);
  checkCanManage(req.user, target.role);

  let password = tempPassword();
  if (req.body.password) {
    const pe = passwordError(req.body.password);
    if (pe) throw new HttpError(400, pe, { password: pe });
    password = req.body.password;
  }
  await query('UPDATE users SET password_hash = ? WHERE user_id = ?', [await bcrypt.hash(password, cfg.auth.bcryptRounds), id]);
  await audit(req.user, req, 'ADMIN_RESET_PASSWORD', 'users', id, target.email);
  res.json({ message: `Password reset for ${target.full_name}.`, temporary_password: req.body.password ? undefined : password });
}));

// ---- DELETE /api/admin/users/:id ------------------------------------------
router.delete('/users/:id', asyncHandler(async (req, res) => {
  const id = toInt(req.params.id, 1);
  const target = await loadUser(id);
  checkCanManage(req.user, target.role);
  if (id === req.user.user_id) throw new HttpError(409, 'You cannot delete your own account.');

  const [{ c }] = await query('SELECT COUNT(*) AS c FROM bookings WHERE user_id = ?', [id]);
  if (c > 0) {
    throw new HttpError(409, `${target.full_name} has ${c} booking(s) in the system, so the account cannot be deleted. Suspend it instead.`);
  }
  await query('DELETE FROM notifications WHERE user_id = ?', [id]);
  await query('DELETE FROM users WHERE user_id = ?', [id]); // password_resets removed by CASCADE, audit_logs set to NULL
  await audit(req.user, req, 'DELETE_USER', 'users', id, target.email);
  res.json({ message: `${target.full_name} deleted.` });
}));

module.exports = router;
