// utils.js - small formatting helpers used by many pages.

const two = (n) => String(n).padStart(2, '0');

/** Date -> "YYYY-MM-DD" in the user's local time. */
export function dateToStr(d = new Date()) {
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

export const todayStr = () => dateToStr(new Date());

/** "2026-11-05" + 3 -> "2026-11-08" */
export function addDaysStr(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return dateToStr(d);
}

/** "2026-11-05" -> "Thu 5 Nov 2026" */
export function fmtDate(s) {
  if (!s) return '';
  return new Date(`${s.slice(0, 10)}T00:00:00`).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
}

/** "2026-11-05" -> "5 Nov" */
export function fmtShortDate(s) {
  return new Date(`${s.slice(0, 10)}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** "09:00:00" -> "09:00" */
export const fmtTime = (t) => (t ? t.slice(0, 5) : '');

/** "2026-11-05 14:32:10" -> "5 Nov 2026, 14:32" */
export function fmtDateTime(s) {
  if (!s) return '';
  const d = new Date(String(s).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return String(s);
  return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}, ${two(d.getHours())}:${two(d.getMinutes())}`;
}

/** Time options for dropdowns: 07:00, 07:30, ... (uses the booking rules from the server). */
export function timeOptions(openTime = '07:00', closeTime = '21:00', stepMinutes = 30) {
  const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const out = [];
  for (let m = toMin(openTime); m <= toMin(closeTime); m += stepMinutes) out.push(`${two(Math.floor(m / 60))}:${two(m % 60)}`);
  return out;
}

/** Hours between two "HH:MM" times, e.g. ("09:00","11:30") -> 2.5 */
export function hoursBetween(start, end) {
  const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  return (toMin(end) - toMin(start)) / 60;
}

/** Safe text from any thrown value. */
export const errorMessage = (e) => (e && e.message) || 'Something went wrong. Please try again.';

/** Downloads rows as a CSV file (opens in Excel). columns = [{ key, label }] */
export function downloadCsv(filename, columns, rows) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [columns.map((c) => esc(c.label)).join(',')];
  rows.forEach((r) => lines.push(columns.map((c) => esc(r[c.key])).join(',')));
  const blob = new Blob([`﻿${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
