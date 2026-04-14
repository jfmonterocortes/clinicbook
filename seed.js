// Seed script — run once: npm run seed
require('dotenv').config();
const bcrypt = require('bcrypt');
const db = require('./src/db');

const SALT_ROUNDS = 12;

async function seed() {
    console.log('Seeding database...');

    // ---- Admin ----
    const adminHash = await bcrypt.hash('Clinic#2024', SALT_ROUNDS);
    db.prepare(`
        INSERT OR IGNORE INTO users (email, password_hash, role, full_name, is_approved)
        VALUES (?, ?, 'admin', 'Carlos Rivera', 1)
    `).run('c.rivera@westside-clinic.com', adminHash);

    // ---- Doctors ----
    const doctors = [
        {
            email: 'l.chen@westside-clinic.com',
            name: 'Laura Chen',
            specialty: 'General Practice',
            license: 'GP-4821',
            bio: 'Board-certified family physician with 12 years of experience in preventive care and chronic disease management.',
            password: 'DrChen#2024',
        },
        {
            email: 'm.okonkwo@westside-clinic.com',
            name: 'Michael Okonkwo',
            specialty: 'Cardiology',
            license: 'CA-3305',
            bio: 'Interventional cardiologist specializing in hypertension, arrhythmia, and heart failure. Fellow of the American College of Cardiology.',
            password: 'DrOkonkwo#2024',
        },
        {
            email: 's.patel@westside-clinic.com',
            name: 'Sunita Patel',
            specialty: 'Pediatrics',
            license: 'PE-7762',
            bio: 'Dedicated to children\'s health from newborns to adolescents. Special interest in developmental milestones and vaccinations.',
            password: 'DrPatel#2024',
        },
        {
            email: 'r.morales@westside-clinic.com',
            name: 'Rafael Morales',
            specialty: 'Orthopedics',
            license: 'OR-1194',
            bio: 'Sports medicine and orthopedic surgery specialist. Experienced in joint replacement and minimally invasive procedures.',
            password: 'DrMorales#2024',
        },
    ];

    const doctorIds = [];
    for (const doc of doctors) {
        const hash = await bcrypt.hash(doc.password, SALT_ROUNDS);
        const res = db.prepare(`
            INSERT OR IGNORE INTO users (email, password_hash, role, full_name, is_approved)
            VALUES (?, ?, 'doctor', ?, 1)
        `).run(doc.email, hash, doc.name);

        if (res.changes > 0) {
            const docRes = db.prepare(`
                INSERT OR IGNORE INTO doctors (user_id, specialty, bio, license_number)
                VALUES (?, ?, ?, ?)
            `).run(res.lastInsertRowid, doc.specialty, doc.bio, doc.license);
            doctorIds.push(docRes.lastInsertRowid);
        } else {
            const existing = db.prepare(`
                SELECT d.id FROM doctors d JOIN users u ON u.id = d.user_id WHERE u.email = ?
            `).get(doc.email);
            if (existing) doctorIds.push(existing.id);
        }
    }

    // ---- Patients ----
    const patients = [
        { email: 'james.whitfield@gmail.com',   name: 'James Whitfield',   password: 'Whitfield#99' },
        { email: 'ana.gutierrez@hotmail.com',    name: 'Ana Gutierrez',     password: 'Gutierrez#44' },
        { email: 'tom.brennan@outlook.com',      name: 'Thomas Brennan',    password: 'Brennan#77' },
    ];

    const patientIds = [];
    for (const p of patients) {
        const hash = await bcrypt.hash(p.password, SALT_ROUNDS);
        const res = db.prepare(`
            INSERT OR IGNORE INTO users (email, password_hash, role, full_name, is_approved)
            VALUES (?, ?, 'patient', ?, 1)
        `).run(p.email, hash, p.name);
        patientIds.push(res.lastInsertRowid || db.prepare('SELECT id FROM users WHERE email = ?').get(p.email).id);
    }

    // ---- Sample appointments (only insert if appointments table is empty) ----
    const existing = db.prepare('SELECT COUNT(*) as n FROM appointments').get();
    if (existing.n === 0 && doctorIds.length >= 3 && patientIds.length >= 3) {
        const appts = [
            { patient: patientIds[0], doctor: doctorIds[0], date: '2026-04-15 09:00', status: 'confirmed', notes: 'Annual check-up and blood pressure review.' },
            { patient: patientIds[0], doctor: doctorIds[1], date: '2026-04-22 14:30', status: 'pending',   notes: 'Follow-up on recent ECG results.' },
            { patient: patientIds[1], doctor: doctorIds[2], date: '2026-04-17 10:00', status: 'confirmed', notes: 'Routine vaccination for 8-year-old.' },
            { patient: patientIds[1], doctor: doctorIds[0], date: '2026-03-10 08:30', status: 'completed', notes: 'Seasonal flu symptoms.' },
            { patient: patientIds[2], doctor: doctorIds[3], date: '2026-04-18 11:00', status: 'pending',   notes: 'Left knee pain after running injury.' },
            { patient: patientIds[2], doctor: doctorIds[0], date: '2026-03-28 15:00', status: 'cancelled', notes: null },
        ];

        for (const a of appts) {
            db.prepare(`
                INSERT INTO appointments (patient_id, doctor_id, scheduled_at, status, notes)
                VALUES (?, ?, ?, ?, ?)
            `).run(a.patient, a.doctor, a.date, a.status, a.notes);
        }
        console.log(`Inserted ${appts.length} sample appointments.`);
    }

    console.log('\nDemo accounts:');
    console.log('  Admin   — c.rivera@westside-clinic.com    / Clinic#2024');
    console.log('  Doctor  — l.chen@westside-clinic.com      / DrChen#2024');
    console.log('  Doctor  — m.okonkwo@westside-clinic.com   / DrOkonkwo#2024');
    console.log('  Doctor  — s.patel@westside-clinic.com     / DrPatel#2024');
    console.log('  Doctor  — r.morales@westside-clinic.com   / DrMorales#2024');
    console.log('  Patient — james.whitfield@gmail.com       / Whitfield#99');
    console.log('  Patient — ana.gutierrez@hotmail.com       / Gutierrez#44');
    console.log('  Patient — tom.brennan@outlook.com         / Brennan#77');
}

// Run directly via `npm run seed`, or export for auto-seeding on Vercel
if (require.main === module) {
    seed().catch(err => { console.error(err); process.exit(1); });
}

module.exports = seed;
