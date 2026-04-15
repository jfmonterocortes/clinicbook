//
// FILE        : appointments.js
// PROJECT     : SECU2000 – ClinicBook : Secure Clinic Booking System
// PROGRAMMER  : Juan Felipe Montero Cortes
// FIRST VERSION: 2026-04-11
// DESCRIPTION :
//   Defines the appointment management API routes. Patients can list, book,
//   and cancel their own appointments. Doctors and admins can update
//   appointment status. All routes enforce authentication, approval status,
//   and role-based access. Ownership checks ensure users can only interact
//   with appointments that belong to them.
//

const express = require('express');
const { body, param } = require('express-validator');
const db = require('../db');
const { requireAuth, requireRole, requireApproved } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { log } = require('../middleware/audit');

const router = express.Router();

//
// FUNCTION    : GET /api/appointments
// DESCRIPTION :
//   Returns appointments scoped to the current user's role. Patients see only
//   their own appointments. Doctors see only appointments where they are the
//   assigned doctor. Admins see all appointments across the system.
// PARAMETERS  :
//   none (role and user ID are read from req.session.user)
// RETURNS     :
//   200 JSON : { appointments: [ { id, scheduled_at, status, notes, ... } ] }
//   401 JSON : not authenticated
//   403 JSON : account not approved
//
router.get('/', requireAuth, requireApproved, (req, res) => {
    const { id, role } = req.session.user;

    let rows;

    if (role === 'patient') {
        // Patients see only their own appointments with doctor details
        rows = db.prepare(`
            SELECT a.id, a.scheduled_at, a.status, a.notes, a.created_at,
                   u.full_name AS doctor_name, d.specialty
            FROM appointments a
            JOIN doctors d ON d.id = a.doctor_id
            JOIN users u ON u.id = d.user_id
            WHERE a.patient_id = ?
            ORDER BY a.scheduled_at DESC
        `).all(id);
    } else if (role === 'doctor') {
        // Look up the doctor profile row for this user account
        const doctor = db.prepare('SELECT id FROM doctors WHERE user_id = ?').get(id);
        if (!doctor) {
            return res.json({ appointments: [] });
        }

        // Doctors see only the appointments assigned to them with patient details
        rows = db.prepare(`
            SELECT a.id, a.scheduled_at, a.status, a.notes, a.created_at,
                   u.full_name AS patient_name, u.email AS patient_email
            FROM appointments a
            JOIN users u ON u.id = a.patient_id
            WHERE a.doctor_id = ?
            ORDER BY a.scheduled_at DESC
        `).all(doctor.id);
    } else {
        // Admins see all appointments across the system
        rows = db.prepare(`
            SELECT a.id, a.scheduled_at, a.status, a.notes, a.created_at,
                   pu.full_name AS patient_name,
                   du.full_name AS doctor_name, d.specialty
            FROM appointments a
            JOIN users pu ON pu.id = a.patient_id
            JOIN doctors d ON d.id = a.doctor_id
            JOIN users du ON du.id = d.user_id
            ORDER BY a.scheduled_at DESC
        `).all();
    }

    res.json({ appointments: rows });
});

//
// FUNCTION    : POST /api/appointments
// DESCRIPTION :
//   Books a new appointment. Patients book for themselves by supplying a
//   doctor_id. Doctors book on behalf of a patient (patient_id required) and
//   are automatically assigned as the doctor. Admins may supply both patient_id
//   and doctor_id to book any combination. Validates that the scheduled date is
//   in the future and that the target doctor is approved.
// PARAMETERS  :
//   number body.doctor_id    : doctor to book with (required for patients and admins)
//   number body.patient_id   : patient to book for (required for doctors and admins)
//   string body.scheduled_at : ISO 8601 datetime string (must be in the future)
//   string body.notes        : optional appointment notes (max 500 chars)
// RETURNS     :
//   201 JSON : success message and new appointment ID
//   400 JSON : validation error or past date
//   401 JSON : not authenticated
//   403 JSON : account not approved
//   404 JSON : doctor or patient not found
//
router.post(
    '/',
    requireAuth,
    requireApproved,
    requireRole('patient', 'doctor', 'admin'),
    [
        body('doctor_id').optional().isInt({ min: 1 }).withMessage('Valid doctor required'),
        body('patient_id').optional().isInt({ min: 1 }).withMessage('Valid patient required'),
        body('scheduled_at')
            .isISO8601().withMessage('Invalid date format')
            .custom(val => {
                if (new Date(val) <= new Date()) {
                    throw new Error('Appointment must be in the future');
                }
                return true;
            }),
        body('notes').optional().trim().isLength({ max: 500 }),
    ],
    validate,
    (req, res) => {
        const { scheduled_at, notes } = req.body;
        const { id: userId, role } = req.session.user;

        let patientId, doctorRecord;

        if (role === 'patient') {
            patientId = userId;
            doctorRecord = db.prepare(`
                SELECT d.id FROM doctors d
                JOIN users u ON u.id = d.user_id
                WHERE d.id = ? AND u.is_approved = 1
            `).get(req.body.doctor_id);
            if (!doctorRecord) {
                return res.status(404).json({ error: 'Doctor not found' });
            }
        } else if (role === 'doctor') {
            if (!req.body.patient_id) {
                return res.status(400).json({ error: 'patient_id is required' });
            }
            patientId = parseInt(req.body.patient_id);
            const patient = db.prepare('SELECT id FROM users WHERE id = ? AND role = ?').get(patientId, 'patient');
            if (!patient) {
                return res.status(404).json({ error: 'Patient not found' });
            }
            doctorRecord = db.prepare('SELECT id FROM doctors WHERE user_id = ?').get(userId);
            if (!doctorRecord) {
                return res.status(404).json({ error: 'Doctor profile not found' });
            }
        } else {
            // Admin: must supply both patient_id and doctor_id
            if (!req.body.patient_id || !req.body.doctor_id) {
                return res.status(400).json({ error: 'patient_id and doctor_id are required' });
            }
            patientId = parseInt(req.body.patient_id);
            const patient = db.prepare('SELECT id FROM users WHERE id = ? AND role = ?').get(patientId, 'patient');
            if (!patient) {
                return res.status(404).json({ error: 'Patient not found' });
            }
            doctorRecord = db.prepare(`
                SELECT d.id FROM doctors d
                JOIN users u ON u.id = d.user_id
                WHERE d.id = ? AND u.is_approved = 1
            `).get(req.body.doctor_id);
            if (!doctorRecord) {
                return res.status(404).json({ error: 'Doctor not found' });
            }
        }

        const result = db.prepare(`
            INSERT INTO appointments (patient_id, doctor_id, scheduled_at, notes)
            VALUES (?, ?, ?, ?)
        `).run(patientId, doctorRecord.id, scheduled_at, notes || null);

        log(userId, 'APPOINTMENT_BOOKED', req.ip, req.headers['user-agent'],
            `appointment_id=${result.lastInsertRowid} booked_by=${role}`);

        res.status(201).json({ message: 'Appointment booked successfully', id: result.lastInsertRowid });
    }
);

//
// FUNCTION    : PATCH /api/appointments/:id/status
// DESCRIPTION :
//   Updates the status of an appointment. Doctors may only update appointments
//   assigned to them; admins may update any appointment. The patient role
//   cannot call this endpoint (patients use DELETE to cancel their own).
//   Writes an APPOINTMENT_STATUS_UPDATED entry to the audit log on success.
// PARAMETERS  :
//   number params.id   : appointment ID (must be a positive integer)
//   string body.status : new status value ('confirmed', 'cancelled', or 'completed')
// RETURNS     :
//   200 JSON : success message
//   400 JSON : validation error or invalid status value
//   401 JSON : not authenticated
//   403 JSON : not a doctor/admin, account not approved, or ownership check failed
//
router.patch(
    '/:id/status',
    requireAuth,
    requireApproved,
    requireRole('doctor', 'admin'),
    [
        param('id').isInt({ min: 1 }),
        body('status').isIn(['confirmed', 'cancelled', 'completed']).withMessage('Invalid status'),
    ],
    validate,
    (req, res) => {
        const apptId = parseInt(req.params.id);
        const { status } = req.body;
        const { id: userId, role } = req.session.user;

        /* Doctors are restricted to appointments where they are the assigned
         * doctor. Admins bypass this check and may update any appointment. */
        if (role === 'doctor') {
            const doctor = db.prepare('SELECT id FROM doctors WHERE user_id = ?').get(userId);
            const appt = db.prepare('SELECT id FROM appointments WHERE id = ? AND doctor_id = ?')
                .get(apptId, doctor ? doctor.id : -1);
            if (!appt) {
                return res.status(403).json({ error: 'Access denied' });
            }
        }

        db.prepare('UPDATE appointments SET status = ? WHERE id = ?').run(status, apptId);

        log(userId, 'APPOINTMENT_STATUS_UPDATED', req.ip, req.headers['user-agent'],
            `appointment_id=${apptId} status=${status}`);

        res.json({ message: 'Status updated' });
    }
);

//
// FUNCTION    : DELETE /api/appointments/:id
// DESCRIPTION :
//   Allows a patient to cancel one of their own appointments by setting its
//   status to 'cancelled'. An ownership check ensures patients cannot cancel
//   appointments belonging to other patients. Writes an APPOINTMENT_CANCELLED
//   entry to the audit log on success.
// PARAMETERS  :
//   number params.id : appointment ID (must be a positive integer)
// RETURNS     :
//   200 JSON : success message
//   400 JSON : invalid ID format
//   401 JSON : not authenticated
//   403 JSON : not a patient or account not approved
//   404 JSON : appointment not found or does not belong to this patient
//
router.delete(
    '/:id',
    requireAuth,
    requireApproved,
    requireRole('patient'),
    [param('id').isInt({ min: 1 })],
    validate,
    (req, res) => {
        const apptId = parseInt(req.params.id);
        const patientId = req.session.user.id;

        /* Ownership check: only the patient who booked this appointment
         * can cancel it. Using both id and patient_id prevents IDOR attacks. */
        const appt = db.prepare(
            'SELECT id FROM appointments WHERE id = ? AND patient_id = ?'
        ).get(apptId, patientId);

        if (!appt) {
            return res.status(404).json({ error: 'Appointment not found' });
        }

        db.prepare("UPDATE appointments SET status = 'cancelled' WHERE id = ?").run(apptId);

        log(patientId, 'APPOINTMENT_CANCELLED', req.ip, req.headers['user-agent'],
            `appointment_id=${apptId}`);

        res.json({ message: 'Appointment cancelled' });
    }
);

module.exports = router;
