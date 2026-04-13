--
-- FILE        : schema.sql
-- PROJECT     : SECU2000 – ClinicBook : Secure Clinic Booking System
-- PROGRAMMER  : Juan Felipe Montero Cortes
-- FIRST VERSION: 2026-04-11
-- DESCRIPTION :
--   Defines the complete database schema for ClinicBook. Creates five tables
--   with foreign key constraints and ON DELETE behaviour to maintain referential
--   integrity. Indexes are added on all foreign key columns to support the JOIN
--   patterns used by the application routes. The schema is idempotent (all
--   statements use IF NOT EXISTS) so it can be run safely on every server start.
--

-- ============================================================
-- TABLE : users
-- Stores all user accounts regardless of role. The role column
-- is constrained to the three valid values. is_approved defaults
-- to 1 for patients and admins; doctor accounts are created with
-- is_approved = 0 and must be approved by an admin before login.
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,
    role          TEXT    NOT NULL CHECK(role IN ('patient', 'doctor', 'admin')),
    full_name     TEXT    NOT NULL,
    is_approved   INTEGER NOT NULL DEFAULT 1,  -- default 1; overridden to 0 for doctors at registration time
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- TABLE : doctors
-- Extends users with doctor-specific profile data. One-to-one
-- relationship with users (enforced by UNIQUE on user_id).
-- Cascades deletion so removing a user also removes their doctor
-- profile.
-- ============================================================
CREATE TABLE IF NOT EXISTS doctors (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id        INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    specialty      TEXT    NOT NULL,
    bio            TEXT,
    license_number TEXT    NOT NULL UNIQUE
);

-- ============================================================
-- TABLE : appointments
-- Links a patient (users.role = 'patient') to a doctor record.
-- Status is constrained to the four valid lifecycle values.
-- Cascades deletion from both parent tables.
-- ============================================================
CREATE TABLE IF NOT EXISTS appointments (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id   INTEGER NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
    doctor_id    INTEGER NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
    scheduled_at TEXT    NOT NULL,
    status       TEXT    NOT NULL DEFAULT 'pending'
                         CHECK(status IN ('pending', 'confirmed', 'cancelled', 'completed')),
    notes        TEXT,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- TABLE : documents
-- Stores metadata for uploaded medical files. The stored_name
-- column holds the UUID-based filename used on disk; original_name
-- holds the user-supplied name for display only. appointment_id
-- is nullable – documents may exist without being linked to an
-- appointment. SET NULL on appointment deletion preserves the
-- document record even if the appointment is removed.
-- ============================================================
CREATE TABLE IF NOT EXISTS documents (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    appointment_id INTEGER REFERENCES appointments(id) ON DELETE SET NULL,
    uploader_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    original_name  TEXT    NOT NULL,
    stored_name    TEXT    NOT NULL UNIQUE,
    mime_type      TEXT    NOT NULL,
    size           INTEGER NOT NULL,
    uploaded_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- TABLE : audit_logs
-- Records all sensitive user actions for security monitoring
-- and incident investigation. user_id is nullable so that
-- unauthenticated actions (e.g. failed login attempts with an
-- unknown email) can still be logged. SET NULL on user deletion
-- preserves the log entry for forensic purposes.
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action     TEXT    NOT NULL,
    ip         TEXT,
    user_agent TEXT,
    detail     TEXT,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- INDEXES
-- Created on all foreign key columns used in JOIN and WHERE
-- clauses by the application routes to avoid full table scans.
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_appointments_patient ON appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_doctor  ON appointments(doctor_id);
CREATE INDEX IF NOT EXISTS idx_documents_uploader   ON documents(uploader_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user      ON audit_logs(user_id);
