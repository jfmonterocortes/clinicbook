//
// FILE        : admin.js
// PROJECT     : SECU2000 – ClinicBook : Secure Clinic Booking System
// PROGRAMMER  : Juan Felipe Montero Cortes
// FIRST VERSION: 2026-04-11
// DESCRIPTION :
//   Defines the admin-only API routes used by the admin panel. All routes
//   require both authentication and the 'admin' role; non-admin sessions
//   receive a 403 response before any handler logic executes. Provides
//   endpoints for listing users, approving or suspending accounts, viewing
//   all appointments, and reading the audit log.
//

const express = require('express');
const { param, body } = require('express-validator');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { log } = require('../middleware/audit');

const router = express.Router();

// Apply authentication and admin role check to every route in this file
router.use(requireAuth, requireRole('admin'));

//
// FUNCTION    : GET /api/admin/users
// DESCRIPTION :
//   Returns all user accounts with their role, approval status, and doctor
//   profile fields where applicable. Used by the admin panel to display the
//   user management table.
// PARAMETERS  :
//   none
// RETURNS     :
//   200 JSON : { users: [ { id, email, full_name, role, is_approved, specialty, ... } ] }
//   401 JSON : not authenticated
//   403 JSON : not an admin
//
router.get('/users', (req, res) => {
    const users = db.prepare(`
        SELECT u.id, u.email, u.full_name, u.role, u.is_approved, u.created_at,
               d.specialty, d.license_number
        FROM users u
        LEFT JOIN doctors d ON d.user_id = u.id
        ORDER BY u.created_at DESC
    `).all();
    res.json({ users });
});

//
// FUNCTION    : PATCH /api/admin/users/:id/approve
// DESCRIPTION :
//   Approves or suspends a user account by setting their is_approved flag.
//   Admin accounts are protected and cannot be modified through this endpoint.
//   Writes a USER_APPROVED or USER_SUSPENDED entry to the audit log.
// PARAMETERS  :
//   number params.id      : ID of the target user (positive integer)
//   boolean body.approved : true to approve the account, false to suspend it
// RETURNS     :
//   200 JSON : success message
//   400 JSON : validation error or attempt to modify an admin account
//   401 JSON : not authenticated
//   403 JSON : not an admin
//   404 JSON : user not found
//
router.patch(
    '/users/:id/approve',
    [
        param('id').isInt({ min: 1 }),
        body('approved').isBoolean().withMessage('approved must be true or false'),
    ],
    validate,
    (req, res) => {
        const targetId = parseInt(req.params.id);
        const approved = req.body.approved ? 1 : 0;

        const user = db.prepare('SELECT id, role FROM users WHERE id = ?').get(targetId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Prevent admins from locking themselves or other admins out of the system
        if (user.role === 'admin') {
            return res.status(400).json({ error: 'Cannot modify admin accounts' });
        }

        db.prepare('UPDATE users SET is_approved = ? WHERE id = ?').run(approved, targetId);

        log(req.session.user.id, approved ? 'USER_APPROVED' : 'USER_SUSPENDED',
            req.ip, req.headers['user-agent'], `target_user_id=${targetId}`);

        res.json({ message: approved ? 'User approved' : 'User suspended' });
    }
);

//
// FUNCTION    : GET /api/admin/appointments
// DESCRIPTION :
//   Returns all appointments in the system with patient and doctor details.
//   Used by the admin panel to give the administrator a full overview of
//   scheduled, confirmed, cancelled, and completed appointments.
// PARAMETERS  :
//   none
// RETURNS     :
//   200 JSON : { appointments: [ { id, scheduled_at, status, patient_name, doctor_name, ... } ] }
//   401 JSON : not authenticated
//   403 JSON : not an admin
//
router.get('/appointments', (req, res) => {
    const rows = db.prepare(`
        SELECT a.id, a.scheduled_at, a.status, a.notes, a.created_at,
               pu.full_name AS patient_name, pu.email AS patient_email,
               du.full_name AS doctor_name, d.specialty
        FROM appointments a
        JOIN users pu ON pu.id = a.patient_id
        JOIN doctors d ON d.id = a.doctor_id
        JOIN users du ON du.id = d.user_id
        ORDER BY a.scheduled_at DESC
    `).all();
    res.json({ appointments: rows });
});

//
// FUNCTION    : GET /api/admin/audit
// DESCRIPTION :
//   Returns the 200 most recent audit log entries with associated user details.
//   Used by the admin panel to monitor system activity, detect suspicious
//   patterns, and support incident investigation.
// PARAMETERS  :
//   none
// RETURNS     :
//   200 JSON : { logs: [ { id, action, ip, detail, created_at, full_name, email } ] }
//   401 JSON : not authenticated
//   403 JSON : not an admin
//
router.get('/audit', (req, res) => {
    const rows = db.prepare(`
        SELECT al.id, al.action, al.ip, al.detail, al.created_at,
               u.full_name, u.email
        FROM audit_logs al
        LEFT JOIN users u ON u.id = al.user_id
        ORDER BY al.created_at DESC
        LIMIT 200
    `).all();
    res.json({ logs: rows });
});

module.exports = router;
