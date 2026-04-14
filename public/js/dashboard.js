/*
  FILE        : dashboard.js
  PROJECT     : SECU2000 – ClinicBook : Secure Clinic Booking System
  PROGRAMMER  : Juan Felipe Montero Cortes
  FIRST VERSION: 2026-04-11
  DESCRIPTION :
    Handles the patient dashboard page. Verifies the session belongs to a
    patient on load, then fetches and renders the patient's appointments and
    uploaded documents. Provides cancel functionality for pending or confirmed
    appointments and a file upload form for medical documents.
*/

let currentUser = null;

//
// FUNCTION    : init
// DESCRIPTION :
//   Verifies the session belongs to a patient. Redirects to login if not.
//   Stores the current user object and triggers the initial data load for
//   both the appointments list and the documents list.
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
    currentUser = me.user;
    document.getElementById('userName').textContent = me.user.full_name;
    loadAppointments();
    loadDocuments();
}

//
// FUNCTION    : loadAppointments
// DESCRIPTION :
//   Fetches the current patient's appointments from the API and renders them
//   as Bootstrap cards. Populates the appointment selector dropdown used in
//   the document upload form. Attaches cancel button listeners after render.
// PARAMETERS  :
//   none
// RETURNS     :
//   void (async)
//
async function loadAppointments() {
    const res = await fetch('/api/appointments');
    const data = await res.json();
    const container = document.getElementById('appointmentsContainer');
    const select = document.getElementById('apptSelect');

    select.innerHTML = '<option value="">— None —</option>';

    if (!data.appointments || data.appointments.length === 0) {
        container.innerHTML = '<p class="text-muted">No appointments yet. <a href="/search.html">Book one!</a></p>';
        return;
    }

    let html = '<div class="row g-3">';
    data.appointments.forEach(a => {
        const date = new Date(a.scheduled_at.replace(' ', 'T') + 'Z').toLocaleString();
        const badgeClass = `badge-${a.status}`;

        html += `
            <div class="col-md-6">
                <div class="card p-3">
                    <div class="d-flex justify-content-between align-items-start">
                        <div>
                            <div class="fw-semibold">Dr. ${esc(a.doctor_name)}</div>
                            <div class="text-muted small">${esc(a.specialty)}</div>
                            <div class="small mt-1">${date}</div>
                            ${a.notes ? `<div class="small text-muted mt-1">${esc(a.notes)}</div>` : ''}
                        </div>
                        <span class="badge ${badgeClass}">${a.status}</span>
                    </div>
                    ${a.status === 'pending' || a.status === 'confirmed' ? `
                    <button class="btn btn-outline-danger btn-sm mt-2 cancel-btn" data-id="${a.id}">Cancel</button>
                    ` : ''}
                </div>
            </div>`;

        /* Only non-cancelled appointments are offered in the document link dropdown */
        if (a.status !== 'cancelled') {
            select.innerHTML += `<option value="${a.id}">${esc(a.doctor_name)} – ${date}</option>`;
        }
    });
    html += '</div>';
    container.innerHTML = html;

    container.querySelectorAll('.cancel-btn').forEach(btn => {
        btn.addEventListener('click', () => cancelAppt(btn.dataset.id));
    });
}

//
// FUNCTION    : loadDocuments
// DESCRIPTION :
//   Fetches the list of documents uploaded by the current patient and renders
//   them as a list group with download links. Each download link goes to the
//   authenticated download endpoint which re-verifies ownership before serving.
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
        container.innerHTML = '<p class="text-muted">No documents uploaded yet.</p>';
        return;
    }

    let html = '<div class="list-group">';
    data.documents.forEach(d => {
        html += `
            <div class="list-group-item d-flex justify-content-between align-items-center">
                <span>${esc(d.original_name)} <span class="text-muted small">(${formatSize(d.size)})</span></span>
                <a href="/api/uploads/${d.id}/download" class="btn btn-sm btn-outline-primary">Download</a>
            </div>`;
    });
    html += '</div>';
    container.innerHTML = html;
}

//
// FUNCTION    : cancelAppt
// DESCRIPTION :
//   Prompts the user for confirmation, then sends a DELETE request to cancel
//   the specified appointment. Reloads the appointments list on success or
//   displays an error alert on failure.
// PARAMETERS  :
//   string id : the appointment ID to cancel (from data-id attribute)
// RETURNS     :
//   void (async)
//
async function cancelAppt(id) {
    if (!confirm('Cancel this appointment?')) {
        return;
    }
    const res = await fetch(`/api/appointments/${id}`, {
        method: 'DELETE',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
    });
    const data = await res.json();

    if (res.ok) {
        loadAppointments();
    } else {
        showAlert(data.error, 'danger');
    }
}

//
// FUNCTION    : upload form submit handler
// DESCRIPTION :
//   Reads the selected file and optional appointment link from the upload form,
//   submits them as multipart/form-data to the upload API, and reloads the
//   documents list on success. Displays server error messages on failure.
// PARAMETERS  :
//   Event e : the form submit event (preventDefault stops page reload)
// RETURNS     :
//   void (async)
//
document.getElementById('uploadForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const file = document.getElementById('fileInput').files[0];
    if (!file) {
        return showAlert('Please select a file', 'warning');
    }

    const fd = new FormData();
    fd.append('document', file);

    const apptId = document.getElementById('apptSelect').value;
    if (apptId) {
        fd.append('appointment_id', apptId);
    }

    const res = await fetch('/api/uploads', {
        method: 'POST',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
        body: fd,
    });
    const data = await res.json();

    if (res.ok) {
        showAlert('File uploaded successfully', 'success');
        document.getElementById('fileInput').value = '';
        loadDocuments();
    } else {
        showAlert(data.error || 'Upload failed', 'danger');
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

//
// FUNCTION    : formatSize
// DESCRIPTION :
//   Converts a raw byte count into a human-readable size string with the
//   appropriate unit (B, KB, or MB) for display in the documents list.
// PARAMETERS  :
//   number bytes : file size in bytes
// RETURNS     :
//   string : formatted size string (e.g. '1.4 MB', '340.0 KB', '512 B')
//
function formatSize(bytes) {
    if (bytes < 1024) {
        return bytes + ' B';
    }
    if (bytes < 1048576) {
        return (bytes / 1024).toFixed(1) + ' KB';
    }
    return (bytes / 1048576).toFixed(1) + ' MB';
}

init();
