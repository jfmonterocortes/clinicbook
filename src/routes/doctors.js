//
// FILE        : doctors.js
// PROJECT     : SECU2000 – ClinicBook : Secure Clinic Booking System
// PROGRAMMER  : Juan Felipe Montero Cortes
// FIRST VERSION: 2026-04-11
// DESCRIPTION :
//   Defines the doctor search API routes used by the patient search page.
//   All queries use parameterized prepared statements to prevent SQL injection.
//   Both endpoints require an authenticated, approved session.
//

const express = require('express');
const { query } = require('express-validator');
const db = require('../db');
const { requireAuth, requireApproved } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const router = express.Router();

//
// FUNCTION    : GET /api/doctors
// DESCRIPTION :
//   Returns a list of approved doctors, optionally filtered by name and/or
//   specialty. Both filter parameters are optional; omitting them returns all
//   approved doctors. LIKE wildcards are added by the server so that partial
//   matches work correctly. Input is validated and escaped before use.
// PARAMETERS  :
//   string query.name      : optional partial name filter (max 100 chars)
//   string query.specialty : optional exact specialty filter (max 100 chars)
// RETURNS     :
//   200 JSON : { doctors: [ { id, specialty, bio, license_number, full_name, email } ] }
//   400 JSON : validation error
//   401 JSON : not authenticated
//   403 JSON : account not approved
//
router.get(
    '/',
    requireAuth,
    requireApproved,
    [
        query('name').optional().trim().isLength({ max: 100 }).escape(),
        query('specialty').optional().trim().isLength({ max: 100 }).escape(),
    ],
    validate,
    (req, res) => {
        const { name, specialty } = req.query;

        /* Build the WHERE clause incrementally using parameterized placeholders.
         * No string concatenation is used for user-supplied values. */
        let sql = `
            SELECT d.id, d.specialty, d.bio, d.license_number,
                   u.full_name, u.email
            FROM doctors d
            JOIN users u ON u.id = d.user_id
            WHERE u.is_approved = 1
        `;
        const params = [];

        if (name) {
            sql += ` AND u.full_name LIKE ?`;
            params.push(`%${name}%`);
        }
        if (specialty) {
            sql += ` AND d.specialty LIKE ?`;
            params.push(`%${specialty}%`);
        }

        sql += ` ORDER BY u.full_name ASC`;

        const doctors = db.prepare(sql).all(...params);
        res.json({ doctors });
    }
);

//
// FUNCTION    : GET /api/doctors/specialties
// DESCRIPTION :
//   Returns the distinct list of specialties for all approved doctors.
//   Used to populate the specialty dropdown on the patient search page
//   so that patients can filter by specialties that actually exist.
// PARAMETERS  :
//   none
// RETURNS     :
//   200 JSON : { specialties: [ string, ... ] }
//   401 JSON : not authenticated
//
router.get('/specialties', requireAuth, (req, res) => {
    const rows = db.prepare(
        `SELECT DISTINCT specialty FROM doctors
         JOIN users ON users.id = doctors.user_id
         WHERE users.is_approved = 1
         ORDER BY specialty`
    ).all();
    res.json({ specialties: rows.map(r => r.specialty) });
});

module.exports = router;
