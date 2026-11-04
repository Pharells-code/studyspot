// routes/notifications.js - the bell icon: a user's own messages.
const express = require('express');
const { query } = require('../db');
const { asyncHandler } = require('../utils/http');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// ---- GET /api/notifications : latest 20 + unread count -------------------
router.get('/', asyncHandler(async (req, res) => {
  const items = await query(
    'SELECT notification_id, booking_id, message, sent_at, is_read FROM notifications WHERE user_id = ? ORDER BY notification_id DESC LIMIT 20',
    [req.user.user_id]
  );
  const [{ unread }] = await query(
    'SELECT COUNT(*) AS unread FROM notifications WHERE user_id = ? AND is_read = FALSE',
    [req.user.user_id]
  );
  res.json({ unread, items });
}));

// ---- POST /api/notifications/read : mark all as read ---------------------
router.post('/read', asyncHandler(async (req, res) => {
  await query('UPDATE notifications SET is_read = TRUE WHERE user_id = ?', [req.user.user_id]);
  res.json({ message: 'Marked as read.' });
}));

module.exports = router;
