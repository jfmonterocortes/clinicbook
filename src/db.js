//
// FILE        : db.js
// PROJECT     : SECU2000 – ClinicBook : Secure Clinic Booking System
// PROGRAMMER  : Juan Felipe Montero Cortes
// FIRST VERSION: 2026-04-11
// DESCRIPTION :
//   Opens the SQLite database connection, enables foreign-key enforcement and
//   WAL journal mode, and runs the schema SQL on first start to create all
//   required tables. Exports the single shared database instance used by all
//   route handlers and middleware.
//

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', 'db', 'clinic.db');
const SCHEMA_PATH = path.join(__dirname, '..', 'db', 'schema.sql');

const db = new Database(DB_PATH);

// Enable foreign keys and WAL mode for better performance/safety
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

// Run schema on first start
const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
db.exec(schema);

module.exports = db;
