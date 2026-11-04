-- =====================================================================
-- StudySpot - queries to SHOW the database during the presentation.
-- Open this file in MySQL Workbench (or paste into the mysql command line)
-- and run the queries one at a time.
-- =====================================================================
USE studyspot_db;

-- 1. The nine tables
SHOW TABLES;

-- 2. Structure of the main tables (columns, data types, keys, defaults)
DESCRIBE users;
DESCRIBE rooms;
DESCRIBE bookings;

-- 3. The full CREATE statement of bookings: shows PRIMARY KEY, FOREIGN KEYs, CHECK and the index
SHOW CREATE TABLE bookings;

-- 4. Every foreign key in the database (relationships between tables)
SELECT table_name  AS child_table,
       column_name AS foreign_key,
       referenced_table_name  AS parent_table,
       referenced_column_name AS parent_key
  FROM information_schema.key_column_usage
 WHERE table_schema = 'studyspot_db' AND referenced_table_name IS NOT NULL
 ORDER BY child_table;

-- 5. How many rows each table holds
SELECT 'roles' AS table_name, COUNT(*) AS row_count FROM roles
UNION ALL SELECT 'users', COUNT(*) FROM users
UNION ALL SELECT 'rooms', COUNT(*) FROM rooms
UNION ALL SELECT 'equipment', COUNT(*) FROM equipment
UNION ALL SELECT 'room_equipment', COUNT(*) FROM room_equipment
UNION ALL SELECT 'bookings', COUNT(*) FROM bookings
UNION ALL SELECT 'notifications', COUNT(*) FROM notifications
UNION ALL SELECT 'password_resets', COUNT(*) FROM password_resets
UNION ALL SELECT 'audit_logs', COUNT(*) FROM audit_logs;

-- 6. Passwords are stored as bcrypt hashes, never as plain text
SELECT full_name, email, LEFT(password_hash, 20) AS password_hash_start FROM users LIMIT 5;

-- 7. A join across three tables: who booked which room, and when
SELECT b.booking_id, u.full_name AS booked_by, r.room_name, b.booking_date, b.start_time, b.end_time, b.status
  FROM bookings b
  JOIN users u ON u.user_id = b.user_id
  JOIN rooms r ON r.room_id = b.room_id
 ORDER BY b.booking_date DESC, b.start_time
 LIMIT 10;

-- 8. Rooms with their equipment (the many-to-many link table room_equipment)
SELECT r.room_name, GROUP_CONCAT(e.equipment_name ORDER BY e.equipment_name SEPARATOR ', ') AS equipment
  FROM rooms r
  LEFT JOIN room_equipment re ON re.room_id = r.room_id
  LEFT JOIN equipment e ON e.equipment_id = re.equipment_id
 GROUP BY r.room_id, r.room_name;

-- 9. Integrity in action: this INSERT must FAIL (end time before start time -> CHECK constraint)
-- INSERT INTO bookings (user_id, room_id, booking_date, start_time, end_time) VALUES (1, 1, '2030-01-01', '10:00', '09:00');

-- 10. Integrity in action: this DELETE must FAIL (the room has bookings -> FOREIGN KEY ... ON DELETE RESTRICT)
-- DELETE FROM rooms WHERE room_id = 1;

-- 11. The audit trail: who did what, and when
SELECT a.created_at, u.full_name, a.action, a.table_name, a.record_id, a.details
  FROM audit_logs a LEFT JOIN users u ON u.user_id = a.user_id
 ORDER BY a.log_id DESC LIMIT 10;
