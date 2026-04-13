//
// FILE        : validate.js
// PROJECT     : SECU2000 – ClinicBook : Secure Clinic Booking System
// PROGRAMMER  : Juan Felipe Montero Cortes
// FIRST VERSION: 2026-04-11
// DESCRIPTION :
//   Provides a single Express middleware function that reads the result of
//   an express-validator chain and short-circuits the request with a 400
//   response if any validation rule failed. Placed after validator chains
//   and before the actual route handler in each route definition.
//

const { validationResult } = require('express-validator');

//
// FUNCTION    : validate
// DESCRIPTION :
//   Reads the express-validator result set for the current request. If any
//   validation errors are present, responds with HTTP 400 and the first
//   error message. Otherwise passes control to the next handler.
// PARAMETERS  :
//   object req  : Express request object (holds validation results)
//   object res  : Express response object (used to send 400 on failure)
//   function next : Express next middleware function
// RETURNS     :
//   void : calls next() when valid, sends JSON error response when invalid
//
function validate(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg });
    }
    next();
}

module.exports = { validate };
