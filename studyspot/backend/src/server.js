// server.js - starts the StudySpot web server (REST API + the built web pages).
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const { pool } = require('./db');
const { errorHandler, HttpError } = require('./utils/http');
const { requireAuth, requireAdmin } = require('./middleware/auth');
const { sweepFinishedBookings } = require('./services/bookingService');

const app = express();
app.set('trust proxy', 1);       // correct client IP when hosted behind a proxy
app.use(helmet());               // safe HTTP headers (security)
app.use(cors());                 // lets the React dev server (port 5173) call this API
app.use(express.json({ limit: '100kb' }));

// ---- API routes ----------------------------------------------------------
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/rooms', require('./routes/rooms'));
app.use('/api/bookings', require('./routes/bookings'));
app.use('/api/notifications', require('./routes/notifications'));

// Admin panel API: every route below needs a logged-in Administrator / Super Administrator.
app.use('/api/admin', requireAuth, requireAdmin,
  require('./routes/adminRooms'),
  require('./routes/adminUsers'),
  require('./routes/adminBookings'),
  require('./routes/adminReports'));

app.use('/api', (req, res, next) => next(new HttpError(404, 'That API address does not exist.')));

// ---- Serve the built front-end (after `npm run build` in /frontend) -------
const dist = path.join(__dirname, '..', '..', 'frontend', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use(errorHandler);

// ---- Start ---------------------------------------------------------------
const PORT = process.env.PORT || 5000;

async function start() {
  try {
    const conn = await pool.getConnection();
    conn.release();
    console.log('Connected to the StudySpot MySQL database successfully.');
  } catch (err) {
    console.error('Database connection failed:', err.message);
    console.error('Check the DB_* values in backend/.env and that MySQL is running.');
    process.exit(1);
  }
  await sweepFinishedBookings();
  setInterval(() => sweepFinishedBookings().catch((e) => console.error(e.message)), 60 * 1000);
  if (require.main === module) {
    app.listen(PORT, () => console.log(`StudySpot server running on http://localhost:${PORT}`));
  }
}

if (require.main === module) start();
module.exports = { app, start };
