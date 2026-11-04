// seed.js - fills the database with demo data so every page has something to show.
//   npm run seed          -> only if the database is empty
//   npm run seed:reset    -> wipes everything first, then inserts the demo data again
//
// Demo logins (also listed in the README):
//   super@studyspot.test / Super@123   (Super Administrator)
//   admin@studyspot.test / Admin@123   (Administrator)
//   amina@studyspot.test / User@123    (ordinary student)
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool, query } = require('./db');
const cfg = require('./config');
const { localDateString, addDays } = require('./utils/validate');

const RESET = process.argv.includes('--reset');

// small repeatable "random" generator so the demo data is the same every time
let seedValue = 20261103;
const rand = () => { seedValue = (seedValue * 1664525 + 1013904223) % 4294967296; return seedValue / 4294967296; };
const pick = (list) => list[Math.floor(rand() * list.length)];
const two = (n) => String(n).padStart(2, '0');
const hhmm = (min) => `${two(Math.floor(min / 60))}:${two(min % 60)}:00`;

const EQUIPMENT = ['Projector', 'Whiteboard', 'TV screen', 'Wi-Fi', 'Microphone', 'Air conditioning', 'Power sockets'];

const ROOMS = [
  ['Room B-204', 'Madaraka Building', 2, 8, 'Quiet group room with a large table.', 'available', ['Projector', 'Whiteboard', 'Wi-Fi', 'Power sockets']],
  ['Room A-101', 'Library', 1, 4, 'Small discussion room next to the reading hall.', 'available', ['Whiteboard', 'Wi-Fi']],
  ['Room A-105', 'Library', 1, 6, 'Bright room facing the garden.', 'available', ['Whiteboard', 'Wi-Fi', 'Power sockets']],
  ['Room A-110', 'Library', 1, 4, 'Currently being repainted.', 'maintenance', ['Whiteboard']],
  ['Quiet Pod Q-1', 'Library', 2, 2, 'Silent single-desk pod for two people.', 'available', ['Wi-Fi', 'Power sockets']],
  ['iLab Pod 3', 'iLab Africa', 3, 10, 'Tech-ready room for project teams.', 'available', ['Projector', 'TV screen', 'Wi-Fi', 'Air conditioning', 'Power sockets']],
  ['Seminar C-12', 'Business School', 1, 20, 'Seminar room for presentations and large groups.', 'available', ['Projector', 'Microphone', 'Air conditioning', 'Wi-Fi']],
  ['Room D-301', 'Student Centre', 3, 6, 'Casual study space with a view.', 'available', ['Whiteboard', 'Air conditioning', 'Wi-Fi']],
  ['Collab Hub 2', 'Student Centre', 1, 12, 'Open collaboration room with movable tables.', 'available', ['TV screen', 'Whiteboard', 'Wi-Fi', 'Power sockets']],
];

const STAFF = [
  ['SUPER001', 'Joseph Omondi', 'super@studyspot.test', '0700000001', cfg.roles.SUPER, 'Super@123'],
  ['ADMIN001', 'Wanjiru Kamau', 'admin@studyspot.test', '0700000002', cfg.roles.ADMIN, 'Admin@123'],
];
const STUDENTS = [
  ['221001', 'Amina Hassan', 'amina@studyspot.test', '0711000001'],
  ['221002', 'Brian Otieno', 'brian@studyspot.test', '0711000002'],
  ['221003', 'Cynthia Wambui', 'cynthia@studyspot.test', '0711000003'],
  ['221004', 'David Mutua', 'david@studyspot.test', '0711000004'],
  ['221005', 'Esther Njeri', 'esther@studyspot.test', '0711000005'],
  ['221006', 'Faith Achieng', 'faith@studyspot.test', '0711000006'],
];

const PURPOSES = ['Group project meeting', 'Exam revision', 'CAT preparation', 'Assignment discussion', 'Presentation practice',
  'Study group', 'Software engineering project', 'Database lab revision'];

async function main() {
  const [{ n }] = await query('SELECT COUNT(*) AS n FROM users');
  if (n > 0 && !RESET) {
    console.log('The database already has data. Run "npm run seed:reset" to wipe it and insert the demo data again.');
    return;
  }
  if (RESET) {
    console.log('Clearing existing data...');
    await query('SET FOREIGN_KEY_CHECKS = 0');
    for (const t of ['audit_logs', 'password_resets', 'notifications', 'bookings', 'room_equipment', 'equipment', 'rooms', 'users']) {
      await query(`TRUNCATE TABLE ${t}`);
    }
    await query('SET FOREIGN_KEY_CHECKS = 1');
  }

  // roles are created by schema.sql; make sure they exist
  for (const r of Object.values(cfg.roles)) await query('INSERT IGNORE INTO roles (role_name) VALUES (?)', [r]);
  const roleRows = await query('SELECT role_id, role_name FROM roles');
  const roleId = (name) => roleRows.find((r) => r.role_name === name).role_id;

  // equipment + rooms
  const equipmentId = {};
  for (const name of EQUIPMENT) equipmentId[name] = (await query('INSERT INTO equipment (equipment_name) VALUES (?)', [name])).insertId;
  const roomIds = [];
  for (const [name, building, floor, capacity, description, status, items] of ROOMS) {
    const id = (await query(
      'INSERT INTO rooms (room_name, building, floor_no, capacity, description, status) VALUES (?, ?, ?, ?, ?, ?)',
      [name, building, floor, capacity, description, status])).insertId;
    roomIds.push({ id, capacity, status });
    for (const item of items) await query('INSERT INTO room_equipment (room_id, equipment_id, quantity) VALUES (?, ?, 1)', [id, equipmentId[item]]);
  }

  // users (passwords are stored as bcrypt hashes)
  const userIds = [];
  for (const [idNo, name, email, phone, role, pw] of STAFF) {
    await query('INSERT INTO users (role_id, id_number, full_name, email, phone, password_hash) VALUES (?, ?, ?, ?, ?, ?)',
      [roleId(role), idNo, name, email, phone, await bcrypt.hash(pw, cfg.auth.bcryptRounds)]);
  }
  const studentHash = await bcrypt.hash('User@123', cfg.auth.bcryptRounds);
  for (const [idNo, name, email, phone] of STUDENTS) {
    const r = await query('INSERT INTO users (role_id, id_number, full_name, email, phone, password_hash) VALUES (?, ?, ?, ?, ?, ?)',
      [roleId(cfg.roles.USER), idNo, name, email, phone, studentHash]);
    userIds.push(r.insertId);
  }

  // bookings: the last 21 days (completed / some cancelled) and the next 7 days
  const today = localDateString();
  const bookable = roomIds.filter((r) => r.status === 'available');
  const taken = {};                       // "room|date" -> list of [start,end]
  const busyUser = {};                    // "user|date" -> list of [start,end]
  const overlaps = (list, s, e) => (list || []).some(([a, b]) => s < b && e > a);
  let made = 0;

  for (let offset = -21; offset <= 7; offset += 1) {
    const date = addDays(today, offset);
    if (new Date(`${date}T00:00:00`).getDay() === 0) continue;   // quiet Sundays
    const perDay = offset < 0 ? 3 + Math.floor(rand() * 4) : 2 + Math.floor(rand() * 3);
    for (let i = 0; i < perDay; i += 1) {
      const room = pick(bookable);
      const user = pick(userIds);
      const hours = offset > 0 && rand() < 0.15 ? 3 : pick([1, 1, 2]);      // 3-hour bookings need approval
      const start = (8 + Math.floor(rand() * (19 - 8 - hours + 1))) * 60 + (rand() < 0.3 ? 30 : 0);
      const end = start + hours * 60;
      if (end > 21 * 60) continue;
      if (overlaps(taken[`${room.id}|${date}`], start, end) || overlaps(busyUser[`${user}|${date}`], start, end)) continue;
      (taken[`${room.id}|${date}`] ||= []).push([start, end]);
      (busyUser[`${user}|${date}`] ||= []).push([start, end]);

      let status = 'confirmed';
      if (offset < 0) status = rand() < 0.12 ? 'cancelled' : 'completed';
      else if (hours === 3) status = 'pending';
      const attendees = 1 + Math.floor(rand() * room.capacity);
      await query(
        `INSERT INTO bookings (user_id, room_id, booking_date, start_time, end_time, purpose, attendees, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [user, room.id, date, hhmm(start), hhmm(end), pick(PURPOSES), attendees, status, `${addDays(date, -2)} 10:00:00`]);
      made += 1;
    }
  }

  // a few notifications and audit entries so those screens are not empty
  await query('INSERT INTO notifications (user_id, message) VALUES (?, ?)', [userIds[0], 'Welcome to StudySpot! You can now search for and book study rooms.']);
  const [admin] = await query("SELECT user_id FROM users WHERE email = 'admin@studyspot.test'");
  const [sup] = await query("SELECT user_id FROM users WHERE email = 'super@studyspot.test'");
  const log = [
    [sup.user_id, 'LOGIN', 'users', sup.user_id, 'super@studyspot.test'],
    [admin.user_id, 'LOGIN', 'users', admin.user_id, 'admin@studyspot.test'],
    [admin.user_id, 'CREATE_ROOM', 'rooms', roomIds[0].id, 'Room B-204'],
    [admin.user_id, 'UPDATE_ROOM', 'rooms', roomIds[3].id, 'Room A-110: set to maintenance'],
    [sup.user_id, 'CREATE_USER', 'users', admin.user_id, 'admin@studyspot.test (Administrator)'],
  ];
  for (const [u, action, table, rec, details] of log) {
    await query('INSERT INTO audit_logs (user_id, action, table_name, record_id, details, ip_address) VALUES (?, ?, ?, ?, ?, ?)',
      [u, action, table, rec, details, '127.0.0.1']);
  }

  console.log(`Demo data inserted: ${ROOMS.length} rooms, ${EQUIPMENT.length} equipment items, ${STAFF.length + STUDENTS.length} users, ${made} bookings.`);
  console.log('Log in with:  admin@studyspot.test / Admin@123   |   super@studyspot.test / Super@123   |   amina@studyspot.test / User@123');
}

main()
  .catch((err) => { console.error('Seeding failed:', err.message); process.exitCode = 1; })
  .finally(() => pool.end());
