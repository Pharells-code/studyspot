// tests/api.test.js - automatic end-to-end test of the StudySpot API.
// 1) load schema + demo data   2) start the server (npm start)   3) run:  npm test
// It uses the demo accounts from the seed script and creates its own temporary data.
const BASE = process.env.API_URL || 'http://localhost:5000/api';
let passed = 0;
let failed = 0;

async function call(method, path, { token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch (e) { /* no body */ }
  return { status: res.status, data };
}

function check(name, condition, extra = '') {
  if (condition) { passed += 1; console.log(`  PASS  ${name}`); }
  else { failed += 1; console.log(`  FAIL  ${name} ${extra}`); }
}

const two = (n) => String(n).padStart(2, '0');
const dateOf = (offset) => {
  const d = new Date(); d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
};

async function login(email, password) {
  const r = await call('POST', '/auth/login', { body: { email, password } });
  return r.data && r.data.token;
}

(async () => {
  const stamp = Date.now().toString().slice(-7);

  console.log('\nAuthentication');
  let r = await call('POST', '/auth/register', { body: { id_number: 'T' + stamp, full_name: 'Test Student', email: `t${stamp}@studyspot.test`, phone: '0712345678', password: 'weak', confirm_password: 'weak' } });
  check('weak password is rejected with a message', r.status === 400 && r.data.fields && r.data.fields.password);
  r = await call('POST', '/auth/register', { body: { id_number: 'T' + stamp, full_name: 'Test Student', email: `t${stamp}@studyspot.test`, phone: '0712345678', password: 'Passw0rd1', confirm_password: 'Passw0rd1' } });
  check('valid registration works', r.status === 201, JSON.stringify(r.data));
  r = await call('POST', '/auth/register', { body: { id_number: 'X' + stamp, full_name: 'Dup Email', email: `t${stamp}@studyspot.test`, password: 'Passw0rd1', confirm_password: 'Passw0rd1' } });
  check('duplicate email is rejected', r.status === 409);
  r = await call('POST', '/auth/login', { body: { email: `t${stamp}@studyspot.test`, password: 'wrongpass1' } });
  check('wrong password is rejected', r.status === 401);
  const student = await login(`t${stamp}@studyspot.test`, 'Passw0rd1');
  const amina = await login('amina@studyspot.test', 'User@123');
  const admin = await login('admin@studyspot.test', 'Admin@123');
  const superAdmin = await login('super@studyspot.test', 'Super@123');
  check('student, admin and super admin can log in', student && amina && admin && superAdmin);
  r = await call('GET', '/rooms');
  check('rooms need a login (401 without token)', r.status === 401);

  console.log('\nRoom search');
  r = await call('GET', '/rooms', { token: student });
  check('rooms list returned', r.status === 200 && r.data.length >= 5);
  const rooms = r.data;
  const room = rooms.find((x) => x.room_name === 'Room B-204');
  const tiny = rooms.find((x) => x.room_name === 'Quiet Pod Q-1');
  const maint = rooms.find((x) => x.status === 'maintenance');
  r = await call('GET', '/rooms?capacity=10', { token: student });
  check('capacity filter works', r.data.every((x) => x.capacity >= 10) && r.data.length > 0);

  console.log('\nBooking (main transaction)');
  const day = dateOf(5);
  const slot = (s, e) => ({ room_id: room.room_id, booking_date: day, start_time: s, end_time: e, purpose: 'API test', attendees: 3 });
  r = await call('POST', '/bookings', { token: student, body: slot('13:00', '14:00') });
  check('valid booking is confirmed', r.status === 201 && r.data.status === 'confirmed', JSON.stringify(r.data));
  const bookingId = r.data.booking_id;
  r = await call('POST', '/bookings', { token: amina, body: slot('13:30', '14:30') });
  check('overlapping booking by another user is blocked (409)', r.status === 409, JSON.stringify(r.data));
  r = await call('POST', '/bookings', { token: student, body: { ...slot('13:00', '14:00'), room_id: tiny.room_id, attendees: 2 } });
  check('same person cannot be in two rooms at once (409)', r.status === 409);
  r = await call('POST', '/bookings', { token: amina, body: { ...slot('15:00', '16:00'), attendees: 99 } });
  check('more attendees than capacity is rejected', r.status === 400);
  r = await call('POST', '/bookings', { token: amina, body: { ...slot('15:00', '16:00'), booking_date: dateOf(-1) } });
  check('booking in the past is rejected', r.status === 400);
  r = await call('POST', '/bookings', { token: amina, body: slot('16:00', '15:00') });
  check('end before start is rejected', r.status === 400);
  r = await call('POST', '/bookings', { token: amina, body: slot('06:00', '07:00') });
  check('outside opening hours is rejected', r.status === 400);
  r = await call('POST', '/bookings', { token: amina, body: { ...slot('09:00', '10:00'), room_id: maint.room_id } });
  check('room under maintenance cannot be booked', r.status === 409);
  r = await call('POST', '/bookings', { token: amina, body: slot('08:00', '13:00') });
  check('booking longer than 4 hours is rejected', r.status === 400);
  r = await call('POST', '/bookings', { token: amina, body: slot('17:00', '20:00') });
  check('3-hour booking becomes pending (needs approval)', r.status === 201 && r.data.status === 'pending', JSON.stringify(r.data));
  const pendingId = r.data && r.data.booking_id;

  // Two people try to book the SAME free slot at the same moment: exactly one must win.
  const raceDay = dateOf(6);
  const raceBody = { room_id: room.room_id, booking_date: raceDay, start_time: '09:00', end_time: '10:00', purpose: 'race', attendees: 2 };
  const [a, b] = await Promise.all([
    call('POST', '/bookings', { token: student, body: raceBody }),
    call('POST', '/bookings', { token: amina, body: raceBody }),
  ]);
  check('simultaneous bookings: exactly one succeeds, one gets 409',
    [a.status, b.status].sort().join() === '201,409', `${a.status}, ${b.status}`);

  r = await call('GET', `/rooms?date=${day}&start=13:00&end=14:00`, { token: amina });
  check('search shows the booked room as "booked" for that time', r.data.find((x) => x.room_id === room.room_id).availability === 'booked');
  r = await call('GET', `/rooms/${room.room_id}/slots?date=${day}`, { token: amina });
  check('slot list returns taken times', r.status === 200 && r.data.length >= 1);

  console.log('\nMy bookings: edit and cancel');
  r = await call('GET', '/bookings/mine?tab=upcoming', { token: student });
  check('my upcoming bookings list contains the booking', r.data.some((x) => x.booking_id === bookingId));
  r = await call('PUT', `/bookings/${bookingId}`, { token: student, body: slot('13:00', '15:00') });
  check('editing own booking works', r.status === 200, JSON.stringify(r.data));
  r = await call('PUT', `/bookings/${bookingId}`, { token: amina, body: slot('13:00', '15:00') });
  check("cannot edit someone else's booking (404)", r.status === 404);
  r = await call('POST', `/bookings/${bookingId}/cancel`, { token: student });
  check('cancelling own booking works', r.status === 200);
  r = await call('POST', `/bookings/${bookingId}/cancel`, { token: student });
  check('cancelling twice is refused', r.status === 409);
  r = await call('POST', '/bookings', { token: amina, body: slot('13:30', '14:30') });
  check('slot is free again after cancellation', r.status === 201, JSON.stringify(r.data));
  r = await call('GET', '/notifications', { token: student });
  check('student received notifications', r.data.unread >= 1 && r.data.items.length >= 1);

  console.log('\nLevels of access');
  r = await call('GET', '/admin/users', { token: student });
  check('student is blocked from the admin API (403)', r.status === 403);
  r = await call('GET', '/admin/users', { token: admin });
  check('administrator can list users', r.status === 200 && r.data.length >= 8);

  console.log('\nAdmin: rooms');
  r = await call('POST', '/admin/rooms', { token: admin, body: { room_name: '', building: '', capacity: 0 } });
  check('invalid room form is rejected', r.status === 400 && r.data.fields);
  r = await call('POST', '/admin/rooms', { token: admin, body: { room_name: 'Test Room ' + stamp, building: 'Test Block', floor_no: 1, capacity: 5, status: 'available', equipment: [{ equipment_id: 1, quantity: 1 }] } });
  check('administrator can add a room', r.status === 201, JSON.stringify(r.data));
  const newRoom = r.data.room_id;
  r = await call('PUT', `/admin/rooms/${newRoom}`, { token: admin, body: { room_name: 'Test Room ' + stamp, building: 'Test Block', floor_no: 2, capacity: 6, status: 'maintenance', equipment: [] } });
  check('administrator can edit a room', r.status === 200);
  r = await call('DELETE', `/admin/rooms/${room.room_id}`, { token: admin });
  check('room with booking history cannot be deleted (409)', r.status === 409);
  r = await call('DELETE', `/admin/rooms/${newRoom}`, { token: admin });
  check('unused room can be deleted', r.status === 200);

  console.log('\nAdmin: bookings');
  r = await call('GET', `/admin/bookings?status=pending`, { token: admin });
  check('admin can filter bookings by status', r.status === 200 && r.data.every((x) => x.status === 'pending'));
  r = await call('POST', `/admin/bookings/${pendingId}/approve`, { token: admin });
  check('admin can approve a pending booking', r.status === 200, JSON.stringify(r.data));
  r = await call('POST', `/admin/bookings/${pendingId}/cancel`, { token: admin, body: { reason: 'Room needed for an event' } });
  check('admin can cancel a booking', r.status === 200);

  console.log('\nAdmin: users');
  r = await call('POST', '/admin/users', { token: admin, body: { id_number: 'U' + stamp, full_name: 'Created By Admin', email: `u${stamp}@studyspot.test`, phone: '' } });
  check('admin can register a user (temporary password returned)', r.status === 201 && r.data.temporary_password, JSON.stringify(r.data));
  const createdId = r.data.user_id;
  const tempLogin = await login(`u${stamp}@studyspot.test`, r.data.temporary_password);
  check('new user can log in with the temporary password', !!tempLogin);
  r = await call('POST', `/admin/users/${createdId}/reset-password`, { token: admin, body: {} });
  check('admin can reset a password', r.status === 200 && r.data.temporary_password);
  r = await call('PUT', `/admin/users/${createdId}`, { token: admin, body: { status: 'suspended' } });
  check('admin can suspend a user', r.status === 200);
  r = await call('GET', '/auth/me', { token: tempLogin });
  check('a suspended user is locked out immediately (403)', r.status === 403);
  r = await call('POST', '/admin/users', { token: admin, body: { id_number: 'A' + stamp, full_name: 'Sneaky Admin', email: `a${stamp}@studyspot.test`, role: 'Administrator' } });
  check('plain administrator cannot create another administrator (403)', r.status === 403);
  r = await call('POST', '/admin/users', { token: superAdmin, body: { id_number: 'A' + stamp, full_name: 'New Administrator', email: `a${stamp}@studyspot.test`, role: 'Administrator' } });
  check('super administrator can create an administrator', r.status === 201, JSON.stringify(r.data));
  r = await call('DELETE', `/admin/users/${createdId}`, { token: admin });
  check('user without bookings can be deleted', r.status === 200, JSON.stringify(r.data));

  console.log('\nDashboard, reports and audit trail');
  r = await call('GET', '/admin/stats', { token: admin });
  check('dashboard statistics returned', r.status === 200 && r.data.perDay.length === 7 && r.data.rooms >= 5);
  r = await call('GET', '/admin/reports/usage?sort=bookings&dir=desc', { token: admin });
  check('usage report is sorted descending', r.status === 200 && r.data.rows.length >= 5 &&
    r.data.rows.every((x, i, arr) => i === 0 || arr[i - 1].bookings >= x.bookings));
  check('report carries organisation name and generated date', r.data.organisation && r.data.generated_at);
  r = await call('GET', `/admin/reports/usage?room_id=${room.room_id}`, { token: admin });
  check('usage report can be filtered by room', r.data.rows.length === 1);
  r = await call('GET', '/admin/reports/bookings?status=completed&sort=user&dir=asc', { token: admin });
  check('bookings report filters by status', r.status === 200 && r.data.rows.every((x) => x.status === 'completed'));
  r = await call('GET', '/admin/reports/usage?from=2026-12-31&to=2026-01-01', { token: admin });
  check('report with from-date after to-date gives an error message', r.status === 400);
  r = await call('GET', '/admin/audit?q=CREATE_BOOKING', { token: admin });
  check('audit trail records booking actions', r.status === 200 && r.data.length >= 1 && r.data[0].user_name);

  console.log('\nForgot / reset password');
  r = await call('POST', '/auth/forgot-password', { body: { email: `t${stamp}@studyspot.test` } });
  check('forgot-password returns a reset link in demo mode', r.status === 200 && r.data.reset_link);
  const token = r.data.reset_link && new URL(r.data.reset_link).searchParams.get('token');
  r = await call('POST', '/auth/reset-password', { body: { token, password: 'NewPassw0rd2', confirm_password: 'NewPassw0rd2' } });
  check('password can be reset with the link', r.status === 200, JSON.stringify(r.data));
  r = await call('POST', '/auth/reset-password', { body: { token, password: 'Another0ne9', confirm_password: 'Another0ne9' } });
  check('the same link cannot be used twice', r.status === 400);
  check('login works with the new password', !!(await login(`t${stamp}@studyspot.test`, 'NewPassw0rd2')));

  console.log('\nSQL injection attempt');
  r = await call('POST', '/auth/login', { body: { email: "' OR '1'='1", password: "' OR '1'='1" } });
  check('SQL injection in login does not log in', r.status === 401 || r.status === 400);
  r = await call('GET', "/admin/users?q=%27%20OR%201%3D1%20--", { token: admin });
  check('SQL injection in search returns normally (treated as text)', r.status === 200 && r.data.length === 0);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
