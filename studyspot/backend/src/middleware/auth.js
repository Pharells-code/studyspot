// auth.js - login protection and role checks ("levels of access").
const jwt = require('jsonwebtoken');
const { query } = require('../db');
const { HttpError, asyncHandler } = require('../utils/http');
const { roles } = require('../config');

const SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me';

/** Creates the login token sent to the browser. */
function signToken(user, hours) {
  return jwt.sign({ id: user.user_id }, SECRET, { expiresIn: `${hours}h` });
}

/**
 * Requires a valid login token. The user is re-loaded from the database on every
 * request, so a suspended account or a changed role takes effect immediately.
 */
const requireAuth = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new HttpError(401, 'Please log in to continue.');

  let payload;
  try {
    payload = jwt.verify(token, SECRET);
  } catch (e) {
    throw new HttpError(401, 'Your session has expired. Please log in again.');
  }

  const [user] = await query(
    `SELECT u.user_id, u.full_name, u.email, u.id_number, u.phone, u.status, r.role_name AS role
       FROM users u JOIN roles r ON r.role_id = u.role_id
      WHERE u.user_id = ?`,
    [payload.id]
  );
  if (!user) throw new HttpError(401, 'Account not found. Please log in again.');
  if (user.status !== 'active') throw new HttpError(403, 'Your account has been suspended. Contact the administrator.');

  req.user = user;
  next();
});

/** Allows only the listed roles, e.g. requireRole(roles.ADMIN, roles.SUPER). */
const requireRole = (...allowed) => (req, res, next) => {
  if (!req.user || !allowed.includes(req.user.role)) {
    return next(new HttpError(403, 'You do not have permission to do this.'));
  }
  next();
};

const requireAdmin = requireRole(roles.ADMIN, roles.SUPER);
const requireSuper = requireRole(roles.SUPER);

module.exports = { signToken, requireAuth, requireRole, requireAdmin, requireSuper };
