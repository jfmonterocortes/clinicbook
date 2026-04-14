//
// FILE        : auth.js
// PROJECT     : SECU2000 – ClinicBook : Secure Clinic Booking System
// PROGRAMMER  : Juan Felipe Montero Cortes
// FIRST VERSION: 2026-04-11
// DESCRIPTION :
//   Defines the authentication API routes: user registration, login, logout,
//   and the /me endpoint used by the front-end to retrieve the current
//   session user. Passwords are hashed with bcrypt before storage and are
//   never returned by any endpoint. Session fixation is prevented by
//   regenerating the session ID on every successful login.
//

const express = require('express');
const bcrypt = require('bcrypt');
const { body } = require('express-validator');
const db = require('../db');
const { validate } = require('../middleware/validate');
const { log } = require('../middleware/audit');

const router = express.Router();

// Number of bcrypt salt rounds – cost factor 12 balances security and response time
const SALT_ROUNDS = 12;

// Pre-computed bcrypt hash used to equalize response time when a login email is not found.
// Always calling bcrypt.compare (even on unknown emails) prevents timing-based user enumeration.
// Using a valid pre-computed hash avoids the risk of an invalid hash string throwing or
// resolving unpredictably across bcrypt versions.
const DUMMY_HASH = '$2b$12$YzxfI4d1a/5QWrRE34G44e4Hf2mgXEFuHS0hWraPjGoqmiOsIeWDy';

//
// FUNCTION    : POST /api/register
// DESCRIPTION :
//   Registers a new patient or doctor account. Validates all input fields,
//   checks for duplicate emails, hashes the password with bcrypt, and
//   inserts the new user. Doctor accounts are created with is_approved = 0
//   and require admin approval before they can log in. Writes a REGISTER
//   entry to the audit log on success.
// PARAMETERS  :
//   string body.email         : user's email address (validated, normalized)
//   string body.password      : plaintext password (min 8 chars, 1 uppercase, 1 digit)
//   string body.full_name     : user's display name (2–100 chars)
//   string body.role          : 'patient' or 'doctor'
//   string body.specialty     : required when role is 'doctor'
//   string body.license_number: required when role is 'doctor'
//   string body.bio           : optional doctor biography (max 300 chars)
// RETURNS     :
//   201 JSON : success message on registration
//   400 JSON : validation error or missing doctor fields
//   409 JSON : email already registered
//   500 JSON : unexpected server error
//
router.post(
    '/register',
    [
        body('email').isEmail().normalizeEmail({ gmail_remove_dots: false }).withMessage('Valid email required'),
        body('password')
            .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
            .matches(/[A-Z]/).withMessage('Password must contain an uppercase letter')
            .matches(/[0-9]/).withMessage('Password must contain a number'),
        body('full_name').trim().isLength({ min: 2, max: 100 }).withMessage('Full name required (2-100 chars)'),
        body('role').isIn(['patient', 'doctor']).withMessage('Role must be patient or doctor'),
        body('specialty').optional().trim().isLength({ max: 100 }),
        body('license_number').optional().trim().isLength({ max: 50 }),
        body('bio').optional().trim().isLength({ max: 300 }),
    ],
    validate,
    async (req, res) => {
        const { email, password, full_name, role, specialty, license_number, bio } = req.body;

        // Doctors must supply specialty and license number for the doctors table
        if (role === 'doctor' && (!specialty || !license_number)) {
            return res.status(400).json({ error: 'Doctors must provide specialty and license number' });
        }

        // Reject duplicate email addresses before attempting insertion
        const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
        if (existing) {
            return res.status(409).json({ error: 'Email already registered' });
        }

        try {
            const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

            // Doctors require admin approval; patients are auto-approved
            const is_approved = role === 'patient' ? 1 : 0;

            const result = db.prepare(
                `INSERT INTO users (email, password_hash, role, full_name, is_approved)
                 VALUES (?, ?, ?, ?, ?)`
            ).run(email, password_hash, role, full_name, is_approved);

            /* Insert the doctor profile row when the role is 'doctor'.
             * The doctors table extends users with specialty and license data. */
            if (role === 'doctor') {
                db.prepare(
                    `INSERT INTO doctors (user_id, specialty, bio, license_number)
                     VALUES (?, ?, ?, ?)`
                ).run(result.lastInsertRowid, specialty, bio || null, license_number);
            }

            const ip = req.ip;
            const ua = req.headers['user-agent'];
            log(result.lastInsertRowid, 'REGISTER', ip, ua, `role=${role}`);

            res.status(201).json({
                message: role === 'doctor'
                    ? 'Registration successful. Your account is pending admin approval.'
                    : 'Registration successful. You can now log in.',
            });
        } catch (err) {
            console.error('[auth] Register error:', err.message);
            res.status(500).json({ error: 'Registration failed. Please try again.' });
        }
    }
);

//
// FUNCTION    : POST /api/login
// DESCRIPTION :
//   Authenticates a user by email and password. bcrypt.compare is always
//   called regardless of whether the email exists, preventing timing-based
//   user enumeration. Issues a new session ID on success to prevent session
//   fixation. Writes LOGIN_SUCCESS or LOGIN_FAIL to the audit log.
// PARAMETERS  :
//   string body.email    : user's email address
//   string body.password : plaintext password to verify
// RETURNS     :
//   200 JSON : user object on successful login
//   401 JSON : invalid credentials
//   403 JSON : account pending approval
//   500 JSON : session regeneration failure
//
router.post(
    '/login',
    [
        body('email').isEmail().normalizeEmail({ gmail_remove_dots: false }).withMessage('Valid email required'),
        body('password').notEmpty().withMessage('Password required'),
    ],
    validate,
    async (req, res) => {
        const { email, password } = req.body;
        const ip = req.ip;
        const ua = req.headers['user-agent'];

        const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

        /* Always run bcrypt to prevent timing attacks that reveal whether an
         * email is registered. The comma operator runs the compare for its
         * timing side-effect and discards the result, returning false. */
        const match = user
            ? await bcrypt.compare(password, user.password_hash)
            : (await bcrypt.compare(password, DUMMY_HASH), false);

        if (!user || !match) {
            log(user ? user.id : null, 'LOGIN_FAIL', ip, ua, `email=${email}`);
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        if (!user.is_approved) {
            log(user.id, 'LOGIN_BLOCKED', ip, ua, 'account not approved');
            return res.status(403).json({ error: 'Your account is pending admin approval' });
        }

        /* Clear any existing session data before writing new user data to
         * prevent session fixation. With cookie-session there is no server-side
         * session ID to regenerate, so wiping the object achieves the same goal. */
        req.session = {};
        req.session.user = {
            id: user.id,
            email: user.email,
            role: user.role,
            full_name: user.full_name,
            is_approved: user.is_approved,
        };

        log(user.id, 'LOGIN_SUCCESS', ip, ua);

        res.json({
            message: 'Login successful',
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
                full_name: user.full_name,
            },
        });
    }
);

//
// FUNCTION    : POST /api/logout
// DESCRIPTION :
//   Destroys the current session, clears the session cookie, and writes a
//   LOGOUT entry to the audit log. Safe to call even when no session exists.
// PARAMETERS  :
//   none (session data read from req.session)
// RETURNS     :
//   200 JSON : logout confirmation message
//
router.post('/logout', (req, res) => {
    const userId = req.session && req.session.user ? req.session.user.id : null;
    const ip = req.ip;
    const ua = req.headers['user-agent'];

    req.session = null; // clears the cookie-session
    if (userId) {
        log(userId, 'LOGOUT', ip, ua);
    }
    res.json({ message: 'Logged out successfully' });
});

//
// FUNCTION    : GET /api/me
// DESCRIPTION :
//   Returns the current session user object. Used by every front-end page on
//   load to determine whether the user is logged in and which role-specific
//   UI to display. Returns 401 if no active session exists.
// PARAMETERS  :
//   none (session data read from req.session)
// RETURNS     :
//   200 JSON : { user: { id, email, role, full_name, is_approved } }
//   401 JSON : not authenticated error
//
router.get('/me', (req, res) => {
    if (!req.session || !req.session.user) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    res.json({ user: req.session.user });
});

module.exports = router;
