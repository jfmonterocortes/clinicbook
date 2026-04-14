//
// FILE        : server.js
// PROJECT     : SECU2000 – ClinicBook : Secure Clinic Booking System
// PROGRAMMER  : Juan Felipe Montero Cortes
// FIRST VERSION: 2026-04-11
// DESCRIPTION :
//   Entry point for the ClinicBook Express application. Configures and mounts
//   all security middleware (helmet, session, rate limiting, content-type
//   enforcement), registers API route handlers, and starts the HTTP server.
//

require('dotenv').config();
const express = require('express');
const cookieSession = require('cookie-session');
const helmet = require('helmet');
const path = require('path');

const db = require('./db');
const authRoutes = require('./routes/auth');
const doctorRoutes = require('./routes/doctors');
const appointmentRoutes = require('./routes/appointments');
const uploadRoutes = require('./routes/uploads');
const adminRoutes = require('./routes/admin');
const { loginLimiter, registerLimiter, apiLimiter } = require('./middleware/rateLimit');

const app = express();
const PORT = process.env.PORT || 3000;

// On Vercel, seed the database at module load time (before any request arrives).
// app.listen() callbacks are not reliable in serverless environments.
let seedReady = Promise.resolve();
if (process.env.VERCEL) {
    const count = db.prepare('SELECT COUNT(*) as n FROM users').get();
    if (count.n === 0) {
        console.log('Empty database detected - running auto-seed...');
        seedReady = require('../seed')().then(() => console.log('Auto-seed complete.'));
    }
}

// Block all requests until seeding is done (only relevant on cold start)
app.use((req, res, next) => seedReady.then(next).catch(next));

// ---------- Security headers ----------
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "https://cdn.jsdelivr.net"],
            styleSrc: ["'self'", "https://cdn.jsdelivr.net", "'unsafe-inline'"],
            fontSrc: ["'self'", "https://cdn.jsdelivr.net"],
            imgSrc: ["'self'", "data:"],
        },
    },
}));

// ---------- Body parsers ----------
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false, limit: '10kb' }));

// ---------- Content-Type enforcement on mutating JSON routes ----------
// Rejects requests that claim to send JSON but supply a different Content-Type,
// preventing content-type confusion attacks on the API.
app.use('/api', (req, res, next) => {
    const hasBody = req.headers['content-length'] > 0 || req.headers['transfer-encoding'];
    if (['POST', 'PUT', 'PATCH'].includes(req.method) &&
        hasBody &&
        !req.is('application/json') &&
        !req.is('multipart/form-data')) {
        return res.status(415).json({ error: 'Unsupported Media Type' });
    }
    next();
});

// ---------- Session ----------
// Cookie-based sessions: signed client-side cookie, no server storage needed.
// This works correctly across multiple Vercel serverless instances.
app.use(cookieSession({
    name: 'clinicsid',
    keys: [process.env.SESSION_SECRET || 'dev-secret-change-in-production'],
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 2 * 60 * 60 * 1000, // 2 hours
}));

// ---------- Trust proxy (needed for accurate IP behind nginx/etc) ----------
app.set('trust proxy', 1);

// ---------- Static files (front-end) ----------
app.use(express.static(path.join(__dirname, '..', 'public')));

// ---------- API routes ----------
app.use('/api', apiLimiter);
app.use('/api/login', loginLimiter);         // stricter limiter must be before the route handler
app.use('/api/register', registerLimiter);
app.use('/api', authRoutes);             // /api/login, /api/register, /api/logout, /api/me
app.use('/api/doctors', doctorRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/admin', adminRoutes);

// ---------- Presentation slide deck ----------
// The presentation is a self-contained HTML file with inline JS — override
// the default strict CSP so the slide navigation scripts are allowed to run.
app.get('/presentation', (req, res) => {
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:");
    res.sendFile(path.join(__dirname, '..', 'docs', 'presentation.html'));
});

// ---------- SPA fallback: serve index.html for any non-API route ----------
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ---------- Global error handler ----------
app.use((err, req, res, next) => {
    console.error('[error]', err.message);
    // Never expose stack traces to the client
    res.status(500).json({ error: 'An unexpected error occurred' });
});

app.listen(PORT, () => {
    console.log(`Clinic Booking System running on http://localhost:${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
