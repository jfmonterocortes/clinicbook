//
// FILE        : uploads.js
// PROJECT     : SECU2000 – ClinicBook : Secure Clinic Booking System
// PROGRAMMER  : Juan Felipe Montero Cortes
// FIRST VERSION: 2026-04-11
// DESCRIPTION :
//   Defines the file upload and download API routes for medical documents.
//   Patients may upload PDF, PNG, and JPG files up to 2 MB. Files are stored
//   under UUID names outside the web root to prevent direct access. Each
//   upload is validated by MIME type, file extension, and magic bytes (file
//   signature). Downloads require authentication and ownership verification
//   to prevent unauthorized access to other patients' documents.
//

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { param } = require('express-validator');
const { fileTypeFromBuffer } = require('file-type');
const db = require('../db');
const { requireAuth, requireApproved, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { log } = require('../middleware/audit');

const router = express.Router();

// Directory where uploaded files are stored (outside public/ – not web-accessible)
// On Vercel, /tmp is the only writable directory
const UPLOAD_DIR = process.env.VERCEL
    ? '/tmp/uploads'
    : path.join(__dirname, '..', '..', 'uploads');

// Ensure the upload directory exists (important on Vercel where /tmp is empty on cold start)
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Whitelist of allowed MIME types and file extensions checked independently
const ALLOWED_MIMES = ['application/pdf', 'image/png', 'image/jpeg'];
const ALLOWED_EXTS = ['.pdf', '.png', '.jpg', '.jpeg'];

// Maximum upload size in bytes (2 MB)
const MAX_SIZE_BYTES = 2 * 1024 * 1024;

/* Configure multer disk storage. Files are saved with a UUID filename so
 * that the original (untrusted) filename is never used on disk. The original
 * name is stored in the database for display purposes only. */
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `${uuidv4()}${ext}`);
    },
});

//
// FUNCTION    : fileFilter
// DESCRIPTION :
//   Multer file filter callback that rejects uploads whose MIME type or file
//   extension is not in the allowed lists. Both are checked independently to
//   prevent MIME-spoofing (e.g. renaming a PHP file to .jpg).
// PARAMETERS  :
//   object req      : Express request object
//   object file     : multer file descriptor (has mimetype and originalname)
//   function cb     : multer callback – cb(null, true) to accept, cb(error) to reject
// RETURNS     :
//   void : invokes cb with an error to reject, or cb(null, true) to accept
//
function fileFilter(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_MIMES.includes(file.mimetype) || !ALLOWED_EXTS.includes(ext)) {
        return cb(new Error('Only PDF, PNG, and JPG files are allowed'));
    }
    cb(null, true);
}

// Multer instance with storage, filter, and size limit configured
const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: MAX_SIZE_BYTES },
});

//
// FUNCTION    : POST /api/uploads
// DESCRIPTION :
//   Accepts a single file upload from an authenticated patient. Runs the
//   file through three validation layers: (1) MIME type and extension
//   whitelist via multer fileFilter, (2) file size limit enforced by multer,
//   and (3) magic bytes check to verify the actual file signature matches the
//   declared type. If an appointment_id is provided, verifies that the patient
//   owns that appointment before linking the document to it. Writes a
//   DOCUMENT_UPLOADED entry to the audit log on success.
// PARAMETERS  :
//   File   body.document       : uploaded file (multipart/form-data field name 'document')
//   number body.appointment_id : optional appointment ID to link the document to
// RETURNS     :
//   201 JSON : { message, id, name } on success
//   400 JSON : file too large, invalid type, or magic bytes mismatch
//   401 JSON : not authenticated
//   403 JSON : not a patient, not approved, or appointment ownership check failed
//   500 JSON : file integrity check failure
//
router.post(
    '/',
    requireAuth,
    requireApproved,
    requireRole('patient'),
    (req, res, next) => {
        /* Wrap multer so that its errors can be caught and formatted as JSON.
         * Without this wrapper, multer sends its own plain-text error response. */
        upload.single('document')(req, res, (err) => {
            if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ error: 'File too large. Maximum size is 2 MB.' });
            }
            if (err) {
                return res.status(400).json({ error: err.message });
            }
            next();
        });
    },
    async (req, res) => {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        /* Magic bytes validation – read the first 4100 bytes and confirm the file
         * signature matches the declared type. This catches polyglot files and
         * MIME-spoofing attacks that pass extension and MIME-type checks alone. */
        try {
            const fd = fs.openSync(req.file.path, 'r');
            const buf = Buffer.alloc(4100);
            fs.readSync(fd, buf, 0, 4100, 0);
            fs.closeSync(fd);

            const detected = await fileTypeFromBuffer(buf);
            if (!detected || !ALLOWED_MIMES.includes(detected.mime)) {
                fs.unlinkSync(req.file.path); // remove the rejected file from disk
                return res.status(400).json({ error: 'File content does not match its declared type' });
            }
        } catch (err) {
            // Clean up the file before returning if the integrity check itself fails
            if (req.file && fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }
            return res.status(500).json({ error: 'Could not verify file integrity' });
        }

        const uploaderId = req.session.user.id;
        const appointmentId = req.body.appointment_id ? parseInt(req.body.appointment_id) : null;

        /* If an appointment ID was provided, verify the authenticated patient owns
         * that appointment before linking the document to it. */
        if (appointmentId) {
            const appt = db.prepare(
                'SELECT id FROM appointments WHERE id = ? AND patient_id = ?'
            ).get(appointmentId, uploaderId);
            if (!appt) {
                fs.unlinkSync(req.file.path);
                return res.status(403).json({ error: 'Appointment not found or access denied' });
            }
        }

        const result = db.prepare(`
            INSERT INTO documents (appointment_id, uploader_id, original_name, stored_name, mime_type, size)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(
            appointmentId,
            uploaderId,
            req.file.originalname,
            req.file.filename,
            req.file.mimetype,
            req.file.size,
        );

        log(uploaderId, 'DOCUMENT_UPLOADED', req.ip, req.headers['user-agent'],
            `doc_id=${result.lastInsertRowid} name=${req.file.originalname}`);

        res.status(201).json({
            message: 'File uploaded successfully',
            id: result.lastInsertRowid,
            name: req.file.originalname,
        });
    }
);

//
// FUNCTION    : GET /api/uploads
// DESCRIPTION :
//   Returns the list of documents accessible to the current user based on
//   their role. Patients see only their own uploads. Doctors see documents
//   linked to appointments assigned to them. Admins see all documents.
// PARAMETERS  :
//   none (role and user ID are read from req.session.user)
// RETURNS     :
//   200 JSON : { documents: [ { id, original_name, mime_type, size, uploaded_at, ... } ] }
//   401 JSON : not authenticated
//   403 JSON : account not approved
//
router.get('/', requireAuth, requireApproved, (req, res) => {
    const { id, role } = req.session.user;

    let rows;

    if (role === 'patient') {
        // Patients see only documents they uploaded
        rows = db.prepare(`
            SELECT d.id, d.original_name, d.mime_type, d.size, d.uploaded_at, d.appointment_id
            FROM documents d
            WHERE d.uploader_id = ?
            ORDER BY d.uploaded_at DESC
        `).all(id);
    } else if (role === 'doctor') {
        const doctor = db.prepare('SELECT id FROM doctors WHERE user_id = ?').get(id);
        if (!doctor) {
            return res.json({ documents: [] });
        }

        // Doctors see all documents uploaded by patients who have an appointment with them
        rows = db.prepare(`
            SELECT DISTINCT d.id, d.original_name, d.mime_type, d.size, d.uploaded_at,
                   d.appointment_id, u.full_name AS patient_name
            FROM documents d
            JOIN users u ON u.id = d.uploader_id
            WHERE d.uploader_id IN (
                SELECT a.patient_id FROM appointments a WHERE a.doctor_id = ?
            )
            ORDER BY d.uploaded_at DESC
        `).all(doctor.id);
    } else {
        // Admins see all documents with uploader name
        rows = db.prepare(`
            SELECT d.id, d.original_name, d.mime_type, d.size, d.uploaded_at,
                   d.appointment_id, u.full_name AS uploader_name
            FROM documents d
            JOIN users u ON u.id = d.uploader_id
            ORDER BY d.uploaded_at DESC
        `).all();
    }

    res.json({ documents: rows });
});

//
// FUNCTION    : GET /api/uploads/:id/download
// DESCRIPTION :
//   Serves a stored document file after verifying the requester has permission
//   to access it. Patients may only download their own documents. Doctors may
//   only download documents linked to their appointments. Admins may download
//   any document. A path traversal guard ensures the resolved file path stays
//   within the uploads directory before the file is served.
// PARAMETERS  :
//   number params.id : document ID (positive integer)
// RETURNS     :
//   200 File : binary file download with original filename as Content-Disposition
//   400 JSON  : invalid ID format or path traversal attempt
//   401 JSON  : not authenticated
//   403 JSON  : access denied (ownership check failed)
//   404 JSON  : document record or file not found on disk
//
router.get(
    '/:id/download',
    requireAuth,
    requireApproved,
    [param('id').isInt({ min: 1 })],
    validate,
    (req, res) => {
        const docId = parseInt(req.params.id);
        const { id: userId, role } = req.session.user;

        const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(docId);
        if (!doc) {
            return res.status(404).json({ error: 'Document not found' });
        }

        /* Ownership check – determine whether the requesting user is allowed to
         * access this document based on their role and relationship to it. */
        let allowed = false;

        if (role === 'admin') {
            allowed = true; // admins have unrestricted document access
        } else if (role === 'patient' && doc.uploader_id === userId) {
            allowed = true; // patients can only access their own uploads
        } else if (role === 'doctor') {
            const doctor = db.prepare('SELECT id FROM doctors WHERE user_id = ?').get(userId);
            if (doctor) {
                // doctors can access documents uploaded by any of their patients
                const isPatient = db.prepare(
                    'SELECT id FROM appointments WHERE patient_id = ? AND doctor_id = ? LIMIT 1'
                ).get(doc.uploader_id, doctor.id);
                if (isPatient) {
                    allowed = true;
                }
            }
        }

        if (!allowed) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const filePath = path.join(UPLOAD_DIR, doc.stored_name);

        /* Path traversal guard – ensure the resolved path remains inside the
         * uploads directory. A stored_name containing '..' could otherwise
         * escape the intended directory boundary. */
        if (!filePath.startsWith(UPLOAD_DIR + path.sep)) {
            return res.status(400).json({ error: 'Invalid file path' });
        }

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'File not found on disk' });
        }

        log(userId, 'DOCUMENT_DOWNLOADED', req.ip, req.headers['user-agent'],
            `doc_id=${docId}`);

        // Serve the file using the original filename for the Content-Disposition header
        res.download(filePath, doc.original_name);
    }
);

module.exports = router;
