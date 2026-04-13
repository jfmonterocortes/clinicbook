//
// FILE        : auth.js
// PROJECT     : SECU2000 – ClinicBook : Secure Clinic Booking System
// PROGRAMMER  : Juan Felipe Montero Cortes
// FIRST VERSION: 2026-04-11
// DESCRIPTION :
//   Provides Express middleware functions that enforce authentication and
//   role-based authorization on protected API routes. All route handlers that
//   require a logged-in user must use requireAuth. Routes restricted to
//   specific roles additionally use requireRole. Doctor routes also use
//   requireApproved to block accounts pending admin review.
//

//
// FUNCTION    : requireAuth
// DESCRIPTION :
//   Verifies that a valid session exists before allowing the request to
//   proceed. Returns 401 if no session user is present.
// PARAMETERS  :
//   object req  : Express request object (checked for req.session.user)
//   object res  : Express response object (used to send 401 on failure)
//   function next : Express next middleware function
// RETURNS     :
//   void : calls next() on success, sends JSON error response on failure
//
function requireAuth(req, res, next) {
    if (!req.session || !req.session.user) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    next();
}

//
// FUNCTION    : requireRole
// DESCRIPTION :
//   Returns a middleware function that allows the request to proceed only if
//   the session user holds one of the specified roles. Returns 401 when no
//   session exists, and 403 when the user's role is not in the allowed list.
// PARAMETERS  :
//   ...string roles : one or more role strings (e.g. 'admin', 'doctor')
// RETURNS     :
//   function : Express middleware (req, res, next)
//
function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.session || !req.session.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        if (!roles.includes(req.session.user.role)) {
            return res.status(403).json({ error: 'Access denied' });
        }
        next();
    };
}

//
// FUNCTION    : requireApproved
// DESCRIPTION :
//   Verifies that the session user's account has been approved by an admin.
//   Doctors are created with is_approved = 0 and must be approved before
//   they can access any protected endpoint. Returns 403 for unapproved accounts.
// PARAMETERS  :
//   object req  : Express request object (checks req.session.user.is_approved)
//   object res  : Express response object (used to send 403 on failure)
//   function next : Express next middleware function
// RETURNS     :
//   void : calls next() on success, sends JSON error response on failure
//
function requireApproved(req, res, next) {
    if (!req.session.user.is_approved) {
        return res.status(403).json({ error: 'Your account is pending admin approval' });
    }
    next();
}

module.exports = { requireAuth, requireRole, requireApproved };
