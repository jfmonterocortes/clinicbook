<!--
  FILE        : doctor.js
  PROJECT     : SECU2000 – ClinicBook : Secure Clinic Booking System
  PROGRAMMER  : Juan Felipe Montero Cortes
  FIRST VERSION: 2026-04-11
  DESCRIPTION :
    Handles the doctor dashboard page. Verifies the session belongs to an
    approved doctor on load, then fetches and renders the doctor's appointments
    and patient documents. Provides appointment status update controls
    (confirm, cancel, complete) and a status filter dropdown.
-->

let allAppointments = [];

//
// FUNCTION    : init
// DESCRIPTION :
//   Verifies the session belongs to a doctor. Redirects to login if not.
//   Sets the page heading with the doctor's name, then loads appointments
//   and patient documents.
// PARAMETERS  :
//   none
// RETURNS     :
//   void (async)
//
async function init() {
    const me = await fetch('/api/me').then(r => r.json()).catch(() => null);
    if (!me || !me.user || me.user.role !== 'doctor') {
        location.href = '/index.html';
        return;
    }
    document.getElementById('userName').textContent = 'Dr. ' + me.user.full_name;
    loadAppointments();
    loadDocuments();
}

//
// FUNCTION    : loadAppointments
// DESCRIPTION :
//   Fetches all appointments assigned to the current doctor from the API,
//   stores them in the allAppointments array, and calls renderAppointments
//   to display them. The full list is stored so the status filter can
//   re-render without making a new API request.
// PARAMETERS  :
//   none
// RETURNS     :
//   void (async)
//
async function loadAppointments() {
    const res = await fetch('/api/appointments');
    const data = await res.json();
    allAppointments = data.appointments || [];
    renderAppointments();
}

//
// FUNCTION    : renderAppointments
// DESCRIPTION :
//   Filters allAppointments by the current status filter value and renders
//   the matching appointments as Bootstrap cards. Attaches status update
//   button listeners after rendering so they reference the correct DOM nodes.
// PARAMETERS  :
//   none (reads filter value from the DOM)
// RETURNS     :
//   void
//
function renderAppointments() {
    const filter = document.getElementById('statusFilter').value;
    const appts = filter ? allAppointments.filter(a => a.status === filter) : allAppointments;
    const container = document.getElementById('appointmentsContainer');

    if (appts.length === 0) {
        container.innerHTML = '<p class="text-muted">No appointments found.</p>';
        return;
    }

    let html = '<div class="row g-3">';
    appts.forEach(a => {
        const date = new Date(a.scheduled_at).toLocaleString();

        html += `
            <div class="col-md-6">
                <div class="card p-3">
                    <div class="d-flex justify-content-between align-items-start">
                        <div>
                            <div class="fw-semibold">${esc(a.patient_name)}</div>
                            <div class="text-muted small">${esc(a.patient_email)}</div>
                            <div class="small mt-1">${date}</div>
                            ${a.notes ? `<div class="small text-muted mt-1">"${esc(a.notes)}"</div>` : ''}
                        </div>
                        <span class="badge bg-${statusColor(a.status)}">${a.status}</span>
                    </div>
                    ${a.status === 'pending' ? `
                    <div class="d-flex gap-2 mt-2">
                        <button class="btn btn-success btn-sm status-btn" data-id="${a.id}" data-status="confirmed">Confirm</button>
                        <button class="btn btn-danger btn-sm status-btn" data-id="${a.id}" data-status="cancelled">Cancel</button>
                    </div>` : ''}
                    ${a.status === 'confirmed' ? `
                    <button class="btn btn-primary btn-sm mt-2 status-btn" data-id="${a.id}" data-status="completed">Mark Completed</button>
                    ` : ''}
                </div>
            </div>`;
    });
    html += '</div>';
    container.innerHTML = html;

    container.querySelectorAll('.status-btn').forEach(btn => {
        btn.addEventListener('click', () => updateStatus(btn.dataset.id, btn.dataset.status));
    });
}

//
// FUNCTION    : updateStatus
// DESCRIPTION :
//   Sends a PATCH request to update the status of the specified appointment.
//   Reloads the appointments list on success or displays an error on failure.
// PARAMETERS  :
//   string id     : appointment ID (from data-id attribute)
//   string status : the new status value ('confirmed', 'cancelled', or 'completed')
// RETURNS     :
//   void (async)
//
async function updateStatus(id, status) {
    const res = await fetch(`/api/appointments/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ status }),
    });
    const data = await res.json();

    if (res.ok) {
        loadAppointments();
    } else {
        showAlert(data.error, 'danger');
    }
}

//
// FUNCTION    : loadDocuments
// DESCRIPTION :
//   Fetches documents linked to the current doctor's appointments and renders
//   them as a list group with download links. Each download link points to the
//   authenticated endpoint that verifies ownership before serving the file.
// PARAMETERS  :
//   none
// RETURNS     :
//   void (async)
//
async function loadDocuments() {
    const res = await fetch('/api/uploads');
    const data = await res.json();
    const container = document.getElementById('documentsContainer');

    if (!data.documents || data.documents.length === 0) {
        container.innerHTML = '<p class="text-muted">No documents available.</p>';
        return;
    }

    let html = '<div class="list-group">';
    data.documents.forEach(d => {
        html += `
            <div class="list-group-item d-flex justify-content-between align-items-center">
                <div>
                    <div>${esc(d.original_name)}</div>
                    <div class="text-muted small">Patient: ${esc(d.patient_name)} &nbsp;|&nbsp; ${new Date(d.uploaded_at).toLocaleDateString()}</div>
                </div>
                <a href="/api/uploads/${d.id}/download" class="btn btn-sm btn-outline-primary">Download</a>
            </div>`;
    });
    html += '</div>';
    container.innerHTML = html;
}

document.getElementById('statusFilter').addEventListener('change', renderAppointments);

document.getElementById('logoutBtn').addEventListener('click', async () => {
    await fetch('/api/logout', { method: 'POST', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
    location.href = '/index.html';
});

//
// FUNCTION    : statusColor
// DESCRIPTION :
//   Maps an appointment status string to a Bootstrap background colour class
//   used to style the status badge on each appointment card.
// PARAMETERS  :
//   string s : appointment status ('pending', 'confirmed', 'cancelled', 'completed')
// RETURNS     :
//   string : Bootstrap colour class suffix (e.g. 'warning text-dark', 'success')
//
function statusColor(s) {
    return {
        pending: 'warning text-dark',
        confirmed: 'success',
        cancelled: 'danger',
        completed: 'primary'
    }[s] || 'secondary';
}

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
//   HTML-encodes a string for safe insertion into innerHTML between tags.
//   Sets the value as textContent on a temporary div and reads back innerHTML
//   so that < > and & are converted to their HTML entities.
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
