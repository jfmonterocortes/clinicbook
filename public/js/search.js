/*
  FILE        : search.js
  PROJECT     : SECU2000 – ClinicBook : Secure Clinic Booking System
  PROGRAMMER  : Juan Felipe Montero Cortes
  FIRST VERSION: 2026-04-11
  DESCRIPTION :
    Handles the patient doctor-search page. On load, verifies the session is
    a patient and populates the specialty dropdown from the API. Supports
    filtering by name and specialty, renders doctor cards, and opens a booking
    modal when the patient selects a doctor. On booking confirmation, posts
    the appointment to the API and redirects to the dashboard on success.
*/

let selectedDoctorId = null;
let bookModal = null;

// Keyed by doctor ID – avoids storing untrusted names in HTML attributes where
// quote characters could escape the attribute boundary and inject event handlers.
const doctorNames = {};

//
// FUNCTION    : init
// DESCRIPTION :
//   Checks that the current session belongs to a patient. Redirects to the
//   login page if not. Sets the minimum selectable date on the booking date
//   picker to the current time, then loads specialties and runs the initial
//   doctor search.
// PARAMETERS  :
//   none
// RETURNS     :
//   void (async)
//
async function init() {
    const me = await fetch('/api/me').then(r => r.json()).catch(() => null);
    if (!me || !me.user || me.user.role !== 'patient') {
        location.href = '/index.html';
        return;
    }

    bookModal = new bootstrap.Modal(document.getElementById('bookModal'));

    /* Set the datetime picker minimum to now so patients cannot book
     * appointments in the past (server also validates this independently). */
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    document.getElementById('scheduledAt').min = now.toISOString().slice(0, 16);

    loadSpecialties();
    searchDoctors();
}

//
// FUNCTION    : loadSpecialties
// DESCRIPTION :
//   Fetches the list of distinct specialties from the API and populates the
//   specialty filter dropdown. Options are appended after the default blank
//   option so the user can still choose 'all specialties'.
// PARAMETERS  :
//   none
// RETURNS     :
//   void (async)
//
async function loadSpecialties() {
    const res = await fetch('/api/doctors/specialties');
    const data = await res.json();
    const sel = document.getElementById('searchSpecialty');

    (data.specialties || []).forEach(specialtyName => {
        const opt = document.createElement('option');
        opt.value = specialtyName;
        opt.textContent = specialtyName;
        sel.appendChild(opt);
    });
}

//
// FUNCTION    : searchDoctors
// DESCRIPTION :
//   Reads the current name and specialty filter values, builds a query string,
//   fetches matching doctors from the API, and passes the results to
//   renderDoctors for display.
// PARAMETERS  :
//   none
// RETURNS     :
//   void (async)
//
async function searchDoctors() {
    const name = document.getElementById('searchName').value.trim();
    const specialty = document.getElementById('searchSpecialty').value;

    const params = new URLSearchParams();
    if (name) {
        params.set('name', name);
    }
    if (specialty) {
        params.set('specialty', specialty);
    }

    const res = await fetch(`/api/doctors?${params}`);
    const data = await res.json();
    renderDoctors(data.doctors || []);
}

//
// FUNCTION    : renderDoctors
// DESCRIPTION :
//   Builds and inserts the doctor card grid into the results container.
//   Doctor names are stored in the doctorNames map keyed by integer ID so
//   that untrusted name strings are never placed inside HTML attribute values
//   where quote characters could be used to inject event handlers.
//   All user-supplied strings are escaped through esc() before insertion.
// PARAMETERS  :
//   Array doctors : array of doctor objects from the API response
// RETURNS     :
//   void
//
function renderDoctors(doctors) {
    const container = document.getElementById('results');

    if (doctors.length === 0) {
        container.innerHTML = '<p class="text-muted">No doctors found. Try a different search.</p>';
        return;
    }

    let html = '<div class="row g-3">';
    doctors.forEach(doctor => {
        /* Store the doctor name in a JS map keyed by ID. Only the integer ID
         * goes into the data-id attribute – safe because integers cannot
         * contain quote characters or HTML-injectable content. */
        doctorNames[doctor.id] = doctor.full_name;

        html += `
            <div class="col-md-6">
                <div class="card doctor-card p-3">
                    <div class="d-flex justify-content-between align-items-start">
                        <div>
                            <div class="fw-semibold">Dr. ${esc(doctor.full_name)}</div>
                            <span class="badge bg-secondary">${esc(doctor.specialty)}</span>
                            ${doctor.bio ? `<p class="small text-muted mt-2 mb-1">${esc(doctor.bio)}</p>` : ''}
                        </div>
                        <button class="btn btn-primary btn-sm book-btn" data-id="${doctor.id}">Book</button>
                    </div>
                </div>
            </div>`;
    });
    html += '</div>';
    container.innerHTML = html;

    container.querySelectorAll('.book-btn').forEach(btn => {
        btn.addEventListener('click', () => openBooking(btn.dataset.id, doctorNames[btn.dataset.id]));
    });
}

//
// FUNCTION    : openBooking
// DESCRIPTION :
//   Stores the selected doctor's ID, sets the doctor name in the modal heading
//   using textContent (XSS-safe), and displays the booking modal.
// PARAMETERS  :
//   string doctorId   : the selected doctor's integer ID (from data-id attribute)
//   string doctorName : the doctor's display name (looked up from doctorNames map)
// RETURNS     :
//   void
//
function openBooking(doctorId, doctorName) {
    selectedDoctorId = doctorId;
    document.getElementById('modalDoctorName').textContent = doctorName;
    bookModal.show();
}

//
// FUNCTION    : confirm booking handler
// DESCRIPTION :
//   Reads the selected date/time and optional notes from the booking modal,
//   then posts a new appointment to the API. On success, hides the modal and
//   redirects to the patient dashboard. On failure, displays the error message.
// PARAMETERS  :
//   none (reads form values from the DOM)
// RETURNS     :
//   void (async)
//
document.getElementById('confirmBookBtn').addEventListener('click', async () => {
    const scheduledAt = document.getElementById('scheduledAt').value;
    const notes = document.getElementById('bookNotes').value;

    if (!scheduledAt) {
        return showAlert('Please select a date and time', 'warning');
    }

    const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ doctor_id: selectedDoctorId, scheduled_at: scheduledAt, notes }),
    });
    const data = await res.json();

    if (res.ok) {
        bookModal.hide();
        showAlert('Appointment booked! Redirecting to your dashboard...', 'success');
        setTimeout(() => location.href = '/dashboard.html', 1500);
    } else {
        showAlert(data.error || 'Booking failed', 'danger');
    }
});

document.getElementById('searchBtn').addEventListener('click', searchDoctors);
document.getElementById('searchName').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        searchDoctors();
    }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
    await fetch('/api/logout', { method: 'POST', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
    location.href = '/index.html';
});

//
// FUNCTION    : showAlert
// DESCRIPTION :
//   Displays a Bootstrap alert message in the page's alert container.
//   Uses textContent to prevent XSS – the message is never inserted as HTML.
//   The alert disappears automatically after 4 seconds.
// PARAMETERS  :
//   string msg  : the message text to display
//   string type : Bootstrap alert variant ('danger', 'success', 'warning', etc.)
// RETURNS     :
//   void
//
function showAlert(msg, type) {
    const el = document.getElementById('alert');
    el.className = `alert alert-${type}`;
    el.textContent = msg;
    el.classList.remove('d-none');
    setTimeout(() => el.classList.add('d-none'), 4000);
}

//
// FUNCTION    : esc
// DESCRIPTION :
//   HTML-encodes a string by setting it as the textContent of a temporary div
//   and reading back the innerHTML. Encodes < > & into their HTML entities,
//   making the result safe to inject into innerHTML between tags.
//   NOTE: this function does NOT encode double-quotes, so the output must
//   never be placed inside an HTML attribute value (use the doctorNames map
//   pattern instead – see renderDoctors).
// PARAMETERS  :
//   string str : the raw string to encode
// RETURNS     :
//   string : HTML-encoded string safe for innerHTML text-node insertion
//
function esc(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
}

init();
