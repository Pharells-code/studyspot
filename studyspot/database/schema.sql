-- =====================================================================
-- StudySpot - Campus Study Room Booking System
-- Database schema (MySQL 8 / MariaDB 10.5+)
-- Run this file once:  mysql -u root -p < database/schema.sql
-- It matches the schema designed in Deliverable 2 (9 tables, 3NF).
-- =====================================================================

CREATE DATABASE IF NOT EXISTS studyspot_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
USE studyspot_db;

-- Table 1: roles - access levels of the system
CREATE TABLE IF NOT EXISTS roles (
  role_id   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  role_name VARCHAR(30) NOT NULL UNIQUE
) ENGINE=InnoDB;

-- Table 2: users - students, staff and administrators
CREATE TABLE IF NOT EXISTS users (
  user_id       INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  role_id       INT UNSIGNED NOT NULL,
  id_number     VARCHAR(20)  NOT NULL UNIQUE,
  full_name     VARCHAR(100) NOT NULL,
  email         VARCHAR(100) NOT NULL UNIQUE,
  phone         VARCHAR(15),
  password_hash VARCHAR(255) NOT NULL,            -- bcrypt hash, never plain text
  status        ENUM('active','suspended') NOT NULL DEFAULT 'active',
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login    DATETIME,
  FOREIGN KEY (role_id) REFERENCES roles(role_id) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- Table 3: rooms - study rooms that can be booked
CREATE TABLE IF NOT EXISTS rooms (
  room_id     INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  room_name   VARCHAR(50) NOT NULL UNIQUE,
  building    VARCHAR(50) NOT NULL,
  floor_no    TINYINT NOT NULL DEFAULT 0,
  capacity    SMALLINT NOT NULL CHECK (capacity > 0),
  description VARCHAR(255),
  status      ENUM('available','maintenance') NOT NULL DEFAULT 'available',
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Table 4: equipment - facilities a room can have
CREATE TABLE IF NOT EXISTS equipment (
  equipment_id   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  equipment_name VARCHAR(50) NOT NULL UNIQUE
) ENGINE=InnoDB;

-- Table 5: room_equipment - many-to-many link between rooms and equipment
CREATE TABLE IF NOT EXISTS room_equipment (
  room_id      INT UNSIGNED NOT NULL,
  equipment_id INT UNSIGNED NOT NULL,
  quantity     SMALLINT NOT NULL DEFAULT 1,
  PRIMARY KEY (room_id, equipment_id),
  FOREIGN KEY (room_id)      REFERENCES rooms(room_id)         ON DELETE CASCADE,
  FOREIGN KEY (equipment_id) REFERENCES equipment(equipment_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Table 6: bookings - the main transaction
CREATE TABLE IF NOT EXISTS bookings (
  booking_id   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id      INT UNSIGNED NOT NULL,
  room_id      INT UNSIGNED NOT NULL,
  booking_date DATE NOT NULL,
  start_time   TIME NOT NULL,
  end_time     TIME NOT NULL CHECK (end_time > start_time),
  purpose      VARCHAR(255),
  attendees    SMALLINT NOT NULL DEFAULT 1 CHECK (attendees > 0),
  status       ENUM('pending','confirmed','cancelled','completed') NOT NULL DEFAULT 'confirmed',
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE RESTRICT,
  FOREIGN KEY (room_id) REFERENCES rooms(room_id) ON DELETE RESTRICT,
  -- speeds up the availability check used for every booking
  INDEX idx_bookings_room_date (room_id, booking_date, start_time),
  INDEX idx_bookings_user (user_id, booking_date)
) ENGINE=InnoDB;

-- Table 7: notifications - confirmation / cancellation messages
CREATE TABLE IF NOT EXISTS notifications (
  notification_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id         INT UNSIGNED NOT NULL,
  booking_id      INT UNSIGNED,
  message         VARCHAR(255) NOT NULL,
  sent_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_read         BOOLEAN NOT NULL DEFAULT FALSE,
  FOREIGN KEY (user_id)    REFERENCES users(user_id)       ON DELETE RESTRICT,
  FOREIGN KEY (booking_id) REFERENCES bookings(booking_id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Table 8: password_resets - tokens for the forgot-password process
CREATE TABLE IF NOT EXISTS password_resets (
  reset_id   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id    INT UNSIGNED NOT NULL,
  token_hash VARCHAR(255) NOT NULL,               -- only a hash of the token is stored
  expires_at DATETIME NOT NULL,
  used       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Table 9: audit_logs - who did what and when
CREATE TABLE IF NOT EXISTS audit_logs (
  log_id     BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id    INT UNSIGNED,
  action     VARCHAR(50) NOT NULL,
  table_name VARCHAR(50),
  record_id  INT UNSIGNED,
  details    VARCHAR(255),
  ip_address VARCHAR(45),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL,
  INDEX idx_audit_created (created_at)
) ENGINE=InnoDB;

-- Default roles (the application depends on these exact names)
INSERT IGNORE INTO roles (role_name) VALUES ('User'), ('Administrator'), ('Super Administrator');
