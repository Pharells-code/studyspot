require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const PDFDocument = require('pdfkit'); // Added PDFKit here at the top

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
  require('./routes/adminReports')
);

// ---- PDF Report Route ----------------------------------------------------
app.get('/api/reports/bookings', async (req, res) => {
    // 1. Capture filtering/sorting parameters from the frontend
    const { status, sortOrder = 'DESC' } = req.query; 
    
    // 2. Query the database using prepared statements for security
    let sql = 'SELECT * FROM bookings';
    const queryParams = [];
    
    if (status) {
        sql += ' WHERE status = ?';
        queryParams.push(status);
    }
    sql += ` ORDER BY booking_date ${sortOrder === 'ASC' ? 'ASC' : 'DESC'}`;

    try {
        // Use the existing 'pool' import to query the database
        const [bookings] = await pool.query(sql, queryParams);
        
        // 3. Initialize the PDF Document
        const doc = new PDFDocument();
        
        // Set the response headers to trigger a file download in the browser
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=StudySpot_Report.pdf');
        doc.pipe(res);

        // 4. Add Company Logo & Name (Ensure logo.png is in your backend folder!)
        doc.image('logo.jpg', 50, 45, { width: 50 });
        doc.fontSize(20).text('StudySpot Inc.', 110, 57);
        
        // 5. Add the Current Date
        const currentDate = new Date().toLocaleDateString();
        doc.fontSize(12).text(`Generated on: ${currentDate}`, 110, 80);
        
        doc.moveDown(3);
        doc.fontSize(16).text('Booking Report', { underline: true });
        doc.moveDown();

        // 6. Output the filtered data
        if (bookings.length === 0) {
            doc.fontSize(12).text('No bookings found for the selected filters.');
        } else {
            bookings.forEach(b => {
                doc.fontSize(10).text(`Booking ID: ${b.booking_id} | Date: ${b.booking_date} | Status: ${b.status}`);
                doc.moveDown(0.5);
            });
        }

        // Finalize the PDF
        doc.end();

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to generate report' });
    }
});

// 404 Catch-all handler must come AFTER the reporting route
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