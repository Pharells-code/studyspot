// validate.js - input validation helpers (server-side form validation).

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Returns a trimmed string, or '' when the value is not text. */
const str = (v) => (typeof v === 'string' ? v.trim() : '');

const isEmail = (v) => EMAIL_RE.test(v) && v.length <= 100;

/** Returns an error message when the password is weak, otherwise null. */
function passwordError(pw) {
  if (typeof pw !== 'string' || pw.length < 8) return 'Password must be at least 8 characters long.';
  if (pw.length > 72) return 'Password must be 72 characters or fewer.';
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'Password must contain at least one letter and one number.';
  return null;
}

/** "2026-11-05" -> true when it is a real calendar date. */
function isDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00`);
  return !Number.isNaN(d.getTime()) && localDateString(d) === s;
}

/** "9:00", "09:00" or "09:00:00" -> "09:00:00", or null when invalid. */
function toTime(s) {
  if (typeof s !== 'string') return null;
  const m = /^([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/.exec(s.trim());
  return m ? `${m[1].padStart(2, '0')}:${m[2]}:00` : null;
}

/** "09:30:00" -> 570 (minutes since midnight). */
const toMinutes = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** Date -> "YYYY-MM-DD" using the computer's local time (not UTC). */
function localDateString(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Adds days to a "YYYY-MM-DD" string. */
function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return localDateString(d);
}

/** Whole number between min and max, or null. */
function toInt(v, min = -Infinity, max = Infinity) {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

module.exports = { str, isEmail, passwordError, isDate, toTime, toMinutes, localDateString, addDays, toInt };
