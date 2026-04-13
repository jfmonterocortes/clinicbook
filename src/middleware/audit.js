//
// FILE        : audit.js
// PROJECT     : SECU2000 – ClinicBook : Secure Clinic Booking System
// PROGRAMMER  : Juan Felipe Montero Cortes
// FIRST VERSION: 2026-04-11
// DESCRIPTION :
//   Provides two audit logging helpers used throughout the application to
//   record sensitive user actions in the audit_logs database table. Every
//   log entry captures the user ID, action type, client IP address, user
//   agent string, and an optional detail payload. Logging failures are
//   caught and printed server-side so they never crash the request.
//

const db = require('../db');

//
// FUNCTION    : logAction
// DESCRIPTION :
//   Returns an Express middleware function that writes an audit log entry
//   after the response has been sent (on the 'finish' event). Using the
//   finish event avoids adding latency to the HTTP response.
// PARAMETERS  :
//   string action  : action label to record (e.g. 'LOGIN_SUCCESS')
//   string detail  : optional extra context string (default null)
// RETURNS     :
//   function : Express middleware (req, res, next)
//
function logAction(action, detail = null) {
    return (req, res, next) => {
        /* Log after the response is sent to avoid adding latency.
         * The finish event fires once the response has been flushed. */
        res.on('finish', () => {
            try {
                const userId = req.session && req.session.user ? req.session.user.id : null;
                const ip = req.ip || req.connection.remoteAddress;
                const userAgent = req.headers['user-agent'] || null;

                db.prepare(
                    `INSERT INTO audit_logs (user_id, action, ip, user_agent, detail)
                     VALUES (?, ?, ?, ?, ?)`
                ).run(userId, action, ip, userAgent, detail);
            } catch (err) {
                // Logging must never crash the application
                console.error('[audit] Failed to write log:', err.message);
            }
        });
        next();
    };
}

//
// FUNCTION    : log
// DESCRIPTION :
//   Writes an audit log entry synchronously. Used directly inside route
//   handlers where the caller already has all required values (user ID,
//   IP, user agent) and wants to log immediately rather than on response
//   finish. Errors are caught to prevent log failures from crashing routes.
// PARAMETERS  :
//   number userId     : ID of the user performing the action (or null)
//   string action     : action label to record (e.g. 'DOCUMENT_UPLOADED')
//   string ip         : client IP address string
//   string userAgent  : value of the User-Agent request header
//   string detail     : optional extra context string (default null)
// RETURNS     :
//   void
//
function log(userId, action, ip, userAgent, detail = null) {
    try {
        db.prepare(
            `INSERT INTO audit_logs (user_id, action, ip, user_agent, detail)
             VALUES (?, ?, ?, ?, ?)`
        ).run(userId, action, ip, userAgent, detail);
    } catch (err) {
        console.error('[audit] Failed to write log:', err.message);
    }
}

module.exports = { logAction, log };
