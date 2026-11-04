// routes/auth.js - registration, login, logout support, forgot/reset password, profile.
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const express = require('express');
const rateLimit = require('express-rate-limit');
const { query } = require('../db');
const cfg = require('../config');
const { HttpError, asyncHandler } = require('../utils/http');
const { str, isEmail, passwordError } = require('../utils/validate');
const { audit } = require('../utils/audit');
const { signToken, requireAuth } = require('../middleware/auth');

const router = express.Router();

// Slow down password guessing: at most 30 attempts per 15 minutes from one computer.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait a few minutes and try again.' },
});

const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');
const publicUser = (u) => ({
  user_id: u.user_id, full_name: u.full_name, email: u.email,
  id_number: u.id_number, phone: u.phone, role: u.role,
});

/** Validates the fields shared by registration and "create user" in the admin panel. */
function validateProfile(body, { needPassword }) {
  const fields = {};
  const id_number = str(body.id_number);
  const full_name = str(body.full_name);
  const email = str(body.email).toLowerCase();
  const phone = str(body.phone);

  if (!/^[A-Za-z0-9/\-]{3,20}$/.test(id_number)) fields.id_number = 'Enter your student/staff number (3-20 letters, numbers, - or /).';
  if (full_name.length < 3 || full_name.length > 100) fields.full_name = 'Enter your full name (at least 3 characters).';
  if (!isEmail(email)) fields.email = 'Enter a valid email address.';
  if (phone && !/^\+?[0-9 ]{7,15}$/.test(phone)) fields.phone = 'Enter a valid phone number (7-15 digits).';
  if (needPassword) {
    const pe = passwordError(body.password);
    if (pe) fields.password = pe;
  }
  if (Object.keys(fields).length) throw new HttpError(400, 'Please correct the highlighted fields.', fields);
  return { id_number, full_name, email, phone: phone || null };
}

/** Turns a MySQL "duplicate entry" error into a friendly message. */
function duplicateError(err) {
  if (err.code !== 'ER_DUP_ENTRY') return err;
  const m = String(err.sqlMessage || '');
  if (m.includes('email')) return new HttpError(409, 'That email address is already registered.', { email: 'Already registered.' });
  if (m.includes('id_number')) return new HttpError(409, 'That student/staff number is already registered.', { id_number: 'Already registered.' });
  return new HttpError(409, 'That record already exists.');
}

// ---- POST /api/auth/register ---------------------------------------------
router.post('/register', authLimiter, asyncHandler(async (req, res) => {
  const profile = validateProfile(req.body, { needPassword: true });
  if (req.body.password !== req.body.confirm_password) {
    throw new HttpError(400, 'Passwords do not match.', { confirm_password: 'Passwords do not match.' });
  }
  const [role] = await query('SELECT role_id FROM roles WHERE role_name = ?', [cfg.roles.USER]);
  const hash = await bcrypt.hash(req.body.password, cfg.auth.bcryptRounds);
  try {
    const r = await query(
      `INSERT INTO users (role_id, id_number, full_name, email, phone, password_hash)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [role.role_id, profile.id_number, profile.full_name, profile.email, profile.phone, hash]
    );
    await audit({ user_id: r.insertId }, req, 'REGISTER', 'users', r.insertId, profile.email);
    res.status(201).json({ message: 'Account created. You can now log in.' });
  } catch (err) {
    throw duplicateError(err);
  }
}));

// ---- POST /api/auth/login ------------------------------------------------
router.post('/login', authLimiter, asyncHandler(async (req, res) => {
  const email = str(req.body.email).toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (!email || !password) throw new HttpError(400, 'Enter your email and password.');

  const [user] = await query(
    `SELECT u.*, r.role_name AS role FROM users u JOIN roles r ON r.role_id = u.role_id WHERE u.email = ?`,
    [email]
  );
  const ok = user && (await bcrypt.compare(password, user.password_hash));
  if (!ok) {
    await audit(user || null, req, 'LOGIN_FAILED', 'users', user ? user.user_id : null, email);
    throw new HttpError(401, 'Incorrect email or password.');
  }
  if (user.status !== 'active') throw new HttpError(403, 'Your account has been suspended. Contact the administrator.');

  await query('UPDATE users SET last_login = NOW() WHERE user_id = ?', [user.user_id]);
  await audit(user, req, 'LOGIN', 'users', user.user_id);
  res.json({ token: signToken(user, cfg.auth.tokenHours), user: publicUser(user) });
}));

// ---- POST /api/auth/logout (the token is deleted by the browser; we record it) ----
router.post('/logout', requireAuth, asyncHandler(async (req, res) => {
  await audit(req.user, req, 'LOGOUT', 'users', req.user.user_id);
  res.json({ message: 'Logged out.' });
}));

// ---- POST /api/auth/forgot-password --------------------------------------
router.post('/forgot-password', authLimiter, asyncHandler(async (req, res) => {
  const email = str(req.body.email).toLowerCase();
  if (!isEmail(email)) throw new HttpError(400, 'Enter a valid email address.', { email: 'Enter a valid email address.' });

  const reply = { message: 'If that email is registered, a password reset link has been sent.' };
  const [user] = await query('SELECT user_id, status FROM users WHERE email = ?', [email]);
  if (user && user.status === 'active') {
    const token = crypto.randomBytes(32).toString('hex');
    await query(
      `INSERT INTO password_resets (user_id, token_hash, expires_at)
       VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))`,
      [user.user_id, sha256(token), cfg.auth.resetMinutes]
    );
    const link = `${process.env.APP_URL || 'http://localhost:5173'}/reset-password?token=${token}`;
    console.log(`[password reset link for ${email}] ${link}`);
    await audit({ user_id: user.user_id }, req, 'FORGOT_PASSWORD', 'users', user.user_id);
    // Demo mode: show the link on screen because no email server is connected.
    if (process.env.SHOW_RESET_LINK === 'true') reply.reset_link = link;
  }
  res.json(reply);
}));

// ---- POST /api/auth/reset-password ---------------------------------------
router.post('/reset-password', authLimiter, asyncHandler(async (req, res) => {
  const token = str(req.body.token);
  const pe = passwordError(req.body.password);
  if (pe) throw new HttpError(400, pe, { password: pe });
  if (req.body.password !== req.body.confirm_password) {
    throw new HttpError(400, 'Passwords do not match.', { confirm_password: 'Passwords do not match.' });
  }
  const [row] = await query(
    'SELECT reset_id, user_id FROM password_resets WHERE token_hash = ? AND used = FALSE AND expires_at > NOW()',
    [sha256(token)]
  );
  if (!row) throw new HttpError(400, 'This reset link is invalid or has expired. Please request a new one.');

  const hash = await bcrypt.hash(req.body.password, cfg.auth.bcryptRounds);
  await query('UPDATE users SET password_hash = ? WHERE user_id = ?', [hash, row.user_id]);
  await query('UPDATE password_resets SET used = TRUE WHERE user_id = ?', [row.user_id]);
  await audit({ user_id: row.user_id }, req, 'RESET_PASSWORD', 'users', row.user_id);
  res.json({ message: 'Password changed. You can now log in.' });
}));

// ---- GET /api/auth/me ----------------------------------------------------
router.get('/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));

// ---- PUT /api/auth/profile -----------------------------------------------
router.put('/profile', requireAuth, asyncHandler(async (req, res) => {
  const full_name = str(req.body.full_name);
  const phone = str(req.body.phone);
  const fields = {};
  if (full_name.length < 3 || full_name.length > 100) fields.full_name = 'Enter your full name (at least 3 characters).';
  if (phone && !/^\+?[0-9 ]{7,15}$/.test(phone)) fields.phone = 'Enter a valid phone number (7-15 digits).';
  if (Object.keys(fields).length) throw new HttpError(400, 'Please correct the highlighted fields.', fields);

  await query('UPDATE users SET full_name = ?, phone = ? WHERE user_id = ?', [full_name, phone || null, req.user.user_id]);
  await audit(req.user, req, 'UPDATE_PROFILE', 'users', req.user.user_id);
  res.json({ user: publicUser({ ...req.user, full_name, phone: phone || null }) });
}));

// ---- PUT /api/auth/password (change own password) ------------------------
router.put('/password', requireAuth, asyncHandler(async (req, res) => {
  const [row] = await query('SELECT password_hash FROM users WHERE user_id = ?', [req.user.user_id]);
  if (!(await bcrypt.compare(String(req.body.current_password || ''), row.password_hash))) {
    throw new HttpError(400, 'Your current password is incorrect.', { current_password: 'Incorrect password.' });
  }
  const pe = passwordError(req.body.new_password);
  if (pe) throw new HttpError(400, pe, { new_password: pe });
  const hash = await bcrypt.hash(req.body.new_password, cfg.auth.bcryptRounds);
  await query('UPDATE users SET password_hash = ? WHERE user_id = ?', [hash, req.user.user_id]);
  await audit(req.user, req, 'CHANGE_PASSWORD', 'users', req.user.user_id);
  res.json({ message: 'Password updated.' });
}));

module.exports = router;
module.exports.validateProfile = validateProfile;
module.exports.duplicateError = duplicateError;
