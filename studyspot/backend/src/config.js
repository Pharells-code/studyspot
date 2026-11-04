// config.js - business rules of the system in ONE place.
// Change a value here and the whole system (API and web pages) follows it.
module.exports = {
  organisation: 'Strathmore University',
  systemName: 'StudySpot',

  booking: {
    openTime: '07:00',       // earliest start of a booking
    closeTime: '21:00',      // latest end of a booking
    slotMinutes: 30,         // bookings must start/end on 30-minute marks
    minMinutes: 30,          // shortest booking
    maxHours: 4,             // longest booking
    approvalAfterHours: 2,   // bookings longer than this wait for admin approval ("pending")
    maxAdvanceDays: 14,      // how far ahead a room can be booked
    maxActivePerUser: 5,     // upcoming bookings one user may hold at the same time
  },

  auth: {
    tokenHours: 8,           // how long a login lasts
    resetMinutes: 30,        // how long a password-reset link is valid
    bcryptRounds: 10,
  },

  roles: {
    USER: 'User',
    ADMIN: 'Administrator',
    SUPER: 'Super Administrator',
  },
};
