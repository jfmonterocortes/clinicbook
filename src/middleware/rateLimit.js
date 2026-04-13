//
// FILE        : rateLimit.js
// PROJECT     : SECU2000 – ClinicBook : Secure Clinic Booking System
// PROGRAMMER  : Juan Felipe Montero Cortes
// FIRST VERSION: 2026-04-11
// DESCRIPTION :
//   Configures and exports three express-rate-limit instances used to protect
//   the API against brute-force and credential-stuffing attacks. The login
//   limiter is the strictest; the general API limiter applies to all other
//   routes as a baseline.
//

const rateLimit = require('express-rate-limit');

// Login: 10 attempts per 5 minutes per IP
const loginLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 10,
    message: { error: 'Too many login attempts. Please try again in 5 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Register: 5 accounts per hour per IP
const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    message: { error: 'Too many registration attempts. Please try again in an hour.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// General API limiter: 100 requests per 15 minutes
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: 'Too many requests. Please slow down.' },
    standardHeaders: true,
    legacyHeaders: false,
});

module.exports = { loginLimiter, registerLimiter, apiLimiter };
