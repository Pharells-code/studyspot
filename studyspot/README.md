# StudySpot - Campus Study Room Booking System

A web-based information system that lets students and staff search for and book campus study rooms,
while administrators manage rooms, users, bookings and reports from an admin panel.

**Group members:** Pharell Njonjo (221746), Timothy Konya (221658), Joy Nyathira (221755)

| Part | Technology |
|------|------------|
| Front-end (user portal + admin panel) | React 18, Vite, React Router, Bootstrap 5, Font Awesome |
| Back-end (REST API) | Node.js, Express |
| Database | MySQL 8 (also works on MariaDB 10.5+) - database name `studyspot_db`, 9 tables, 3NF |
| Security | bcrypt password hashing, JWT login tokens, prepared statements (no SQL injection), role checks, login rate-limit, Helmet security headers, audit trail |

---

## 1. What you need to install (once)

1. **Node.js** (LTS version) - https://nodejs.org
2. **MySQL Server** (and MySQL Workbench) - https://dev.mysql.com/downloads/ - or **XAMPP** (which includes MariaDB/MySQL).
   Remember the password of the MySQL `root` user (XAMPP's default is an empty password).

## 2. Create the database

Open MySQL Workbench, connect, choose **File -> Open SQL Script**, open `database/schema.sql` and press the lightning-bolt **Run** button.
(Command line alternative: `mysql -u root -p < database/schema.sql`)

This creates the database `studyspot_db` with its 9 tables and the three default roles.

## 3. Start the back-end

```bash
cd backend
copy .env.example .env        # on Mac/Linux: cp .env.example .env
```
Open `backend/.env` in a text editor and put your MySQL password in `DB_PASSWORD=` (leave it empty for XAMPP).

```bash
npm install
npm run seed                  # inserts demo rooms, users and bookings
npm start                     # API on http://localhost:5000
```
You should see: `Connected to the StudySpot MySQL database successfully.`

## 4. Open the website

**Option A - one server (simplest, also used for the live demo).** The folder `frontend/dist` already contains the built website,
so after step 3 just open **http://localhost:5000**.

**Option B - development mode** (for changing the pages; the page refreshes when you save a file):
```bash
cd frontend
npm install
npm run dev                   # http://localhost:5173  (keep the back-end running in another terminal)
```
To rebuild the website after changes: `cd frontend && npm run build`.

## 5. Demo accounts

| Role | Email | Password |
|------|-------|----------|
| Student (user) | amina@studyspot.test | User@123 |
| Administrator | admin@studyspot.test | Admin@123 |
| Super Administrator | super@studyspot.test | Super@123 |

(More students: brian@, cynthia@, david@, esther@, faith@ `studyspot.test`, all with password `User@123`.)
`npm run seed:reset` in `backend` wipes the data and inserts the demo data again.

---

## 6. Features

**Front-end (students / staff):** register, log in / out, forgot & reset password, search rooms by date, time, capacity and equipment,
see availability, book a room (with live availability strip), view / edit / cancel bookings, notifications (bell), profile & password change, help centre.

**Admin panel:** dashboard (statistics, chart, pending approvals), manage rooms and equipment (add / edit / delete / search),
manage users (register, edit, suspend, reset password, delete), manage bookings (filter, sort, approve, cancel with reason),
reports (room usage and bookings list: filter, sort, print / save as PDF, export CSV, with university name, logo and date), audit logs.

**Levels of access:** *User* (front-end), *Administrator* (admin panel, ordinary users), *Super Administrator* (also manages administrator accounts).

**Business rules** (change them in `backend/src/config.js`): open 07:00-21:00, 30-minute steps, 30 minutes to 4 hours,
up to 14 days ahead, max 5 upcoming bookings per person, bookings longer than 2 hours wait for administrator approval.

**The main transaction (booking)** runs in one database transaction: the room row is locked, the slot is re-checked,
and the booking and its notification are saved together. Two people booking the same room at the same moment can never both succeed
(proved by `backend/tests/api.test.js`).

## 7. Project structure

```
studyspot/
  database/
    schema.sql          creates studyspot_db and its 9 tables
    demo_queries.sql    queries to show the database in a presentation
  backend/
    src/server.js       starts the server
    src/db.js           MySQL connection pool + transaction helper
    src/config.js       business rules in one place
    src/middleware/     login and role checks
    src/routes/         auth, rooms, bookings, notifications, admin*
    src/services/       bookingService.js - the booking transaction
    src/utils/          validation, audit log, notifications, error handling
    src/seed.js         demo data
    tests/api.test.js   automatic test of the whole API (npm test)
  frontend/
    src/pages/          student pages (login, rooms, booking, my bookings, profile, help)
    src/admin/          admin pages (dashboard, rooms, users, bookings, reports, audit logs)
    src/components/     layouts and shared pieces (forms, modals, toasts)
    src/api.js          the only place that calls the server
    dist/               the built website (served by the back-end)
  docs/USER_MANUAL.md   how to use the system
```

## 8. Testing

With the server running and demo data loaded: `cd backend && npm test` runs 59 automatic checks
(registration, login, levels of access, booking rules, double-booking, simultaneous bookings, admin actions, reports, SQL-injection attempts).

## 9. Putting it on the internet (live system on a web server)

1. Create a MySQL database on the host (many free/cheap hosts offer one) and run `database/schema.sql` on it.
2. Upload the project, run `npm install` inside `backend`, create `backend/.env` with the host's database details,
   a long random `JWT_SECRET`, `APP_URL` set to your public address and `SHOW_RESET_LINK=false`.
3. Run `npm start` (or let the host run it). Because the back-end also serves `frontend/dist`, **one** Node.js application is the whole website.

## 10. Known limits (honest notes)

- Emails are not actually sent: notifications appear under the bell and are printed in the server console, and the password-reset link
  is shown on screen when `SHOW_RESET_LINK=true` (demo mode). Connecting a mail service (e.g. Nodemailer) is the next step.
- Two-factor authentication is not implemented.
- Tested on MariaDB 10.11 (MySQL-compatible) and Node 22.
