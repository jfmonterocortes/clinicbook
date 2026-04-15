/*
  FILE        : admin.js
  PROJECT     : SECU2000 – ClinicBook : Secure Clinic Booking System
  PROGRAMMER  : Juan Felipe Montero Cortes
  FIRST VERSION: 2026-04-11
  DESCRIPTION :
    Handles the admin dashboard page. Verifies the session belongs to an admin
    on load, then provides tab-based navigation between three panels: user
    management (approve / suspend accounts), appointments overview, and the
    audit log viewer. All data rendered into the page is HTML-escaped through
    esc() to prevent stored XSS attacks.
*/

//
// FUNCTION    : init
// DESCRIPTION :
//   Verifies the session belongs to an admin. Redirects to login if not.
//   Sets the page heading with the admin's name and triggers the initial
//   load of the users panel (the default visible tab).
// PARAMETERS  :
//   none
// RETURNS     :
//   void (async)
//
async function init() {
    const me = await fetch('/api/me').then(r => r.json()).catch(() => null);
    if (!me || !me.user || me.user.role !== 'admin') {
        location.href = '/index.html';
        return;
    }
    document.getElementById('userName').textContent = me.user.full_name;
    loadStats();
    loadUsers();
    loadBookingDropdowns();
}

/* Tab switching – show the selected panel and hide all others,
 * then load the data for the newly visible tab. */
document.querySelectorAll('[data-tab]').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        document.querySelectorAll('[data-tab]').forEach(l => l.classList.remove('active'));
        link.classList.add('active');

        const tab = link.dataset.tab;
        document.querySelectorAll('.tab-content').forEach(el => el.classList.add('d-none'));
        document.getElementById(`tab-${tab}`).classList.remove('d-none');

        if (tab === 'users') {
            loadUsers();
        } else if (tab === 'appointments') {
            loadAppointments();
        } else if (tab === 'documents') {
            loadDocuments();
        } else if (tab === 'audit') {
            loadAudit();
        }
    });
});

//
// FUNCTION    : loadUsers
// DESCRIPTION :
//   Fetches all user accounts from the admin API and renders them in the
//   users table. Non-admin accounts include an Approve or Suspend button.
//   Button listeners are attached after the table is built so they reference
//   live DOM nodes.
// PARAMETERS  :
//   none
// RETURNS     :
//   void (async)
//
async function loadUsers() {
    const res = await fetch('/api/admin/users');
    const data = await res.json();
    const tbody = document.getElementById('usersTable');
    tbody.innerHTML = '';

    (data.users || []).forEach(u => {
        const approved = u.is_approved ? 'Active' : 'Pending';
        const badgeClass = u.is_approved ? 'success' : 'warning text-dark';
        const row = document.createElement('tr');

        /* All user-supplied strings pass through esc() before being placed
         * in innerHTML to prevent stored XSS attacks. */
        row.innerHTML = `
            <td>${esc(u.full_name)}</td>
            <td>${esc(u.email)}</td>
            <td><span class="badge bg-secondary">${u.role}</span></td>
            <td>${u.specialty ? esc(u.specialty) : '-'}</td>
            <td><span class="badge bg-${badgeClass}">${approved}</span></td>
            <td>
                ${u.role !== 'admin' ? `
                <button class="btn btn-sm ${u.is_approved ? 'btn-outline-danger' : 'btn-outline-success'}"
                        data-user-id="${u.id}" data-approve="${u.is_approved ? 'false' : 'true'}">
                    ${u.is_approved ? 'Suspend' : 'Approve'}
                </button>` : '-'}
            </td>`;
        tbody.appendChild(row);
    });

    // Attach approval button listeners after the table has been rendered
    tbody.querySelectorAll('button[data-user-id]').forEach(btn => {
        btn.addEventListener('click', () => {
            toggleApproval(btn.dataset.userId, btn.dataset.approve === 'true');
        });
    });
}

//
// FUNCTION    : toggleApproval
// DESCRIPTION :
//   Sends a PATCH request to approve or suspend the specified user account.
//   Reloads the users table on success or displays an error alert on failure.
// PARAMETERS  :
//   string userId  : the target user's ID (from data-user-id attribute)
//   boolean approve: true to approve the account, false to suspend it
// RETURNS     :
//   void (async)
//
async function toggleApproval(userId, approve) {
    const res = await fetch(`/api/admin/users/${userId}/approve`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ approved: approve }),
    });
    const data = await res.json();

    if (res.ok) {
        showAlert(data.message, 'success');
        loadUsers();
    } else {
        showAlert(data.error, 'danger');
    }
}

//
// FUNCTION    : loadStats
// DESCRIPTION :
//   Fetches the summary statistics from the admin API and updates the four
//   stat cards at the top of the page: total patients, pending doctors,
//   total appointments, and total uploaded documents.
// PARAMETERS  :
//   none
// RETURNS     :
//   void (async)
//
async function loadStats() {
    const data = await fetch('/api/admin/stats').then(r => r.json()).catch(() => null);
    if (!data) return;
    document.getElementById('statPatients').textContent = data.patients;
    document.getElementById('statPending').textContent = data.pending_doctors;
    document.getElementById('statAppointments').textContent = data.appointments;
    document.getElementById('statDocuments').textContent = data.documents;
}

//
// FUNCTION    : loadAppointments
// DESCRIPTION :
//   Fetches all appointments in the system from the admin API and renders
//   them in the appointments table. Each row includes a status dropdown that
//   lets the admin change the appointment status directly from the table.
// PARAMETERS  :
//   none
// RETURNS     :
//   void (async)
//
async function loadAppointments() {
    const res = await fetch('/api/admin/appointments');
    const data = await res.json();
    const tbody = document.getElementById('appointmentsTable');
    tbody.innerHTML = '';

    const statusColors = { confirmed: 'success', pending: 'warning text-dark', completed: 'secondary', cancelled: 'danger' };

    (data.appointments || []).forEach(appointment => {
        const row = document.createElement('tr');
        const badgeColor = statusColors[appointment.status] || 'secondary';
        row.innerHTML = `
            <td>${esc(appointment.patient_name)}</td>
            <td>Dr. ${esc(appointment.doctor_name)}</td>
            <td>${esc(appointment.specialty)}</td>
            <td>${new Date(appointment.scheduled_at.replace(' ', 'T') + 'Z').toLocaleString()}</td>
            <td><span class="badge bg-${badgeColor}">${appointment.status}</span></td>
            <td>
                <select class="form-select form-select-sm d-inline-block w-auto" data-appt-id="${appointment.id}">
                    <option value="">Change...</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="cancelled">Cancelled</option>
                    <option value="completed">Completed</option>
                </select>
            </td>`;
        tbody.appendChild(row);
    });

    tbody.querySelectorAll('select[data-appt-id]').forEach(statusSelect => {
        statusSelect.addEventListener('change', async () => {
            if (!statusSelect.value) return;
            const response = await fetch(`/api/appointments/${statusSelect.dataset.apptId}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: statusSelect.value }),
            });
            const result = await response.json();
            if (response.ok) {
                showAlert('Status updated', 'success');
                loadAppointments();
                loadStats();
            } else {
                showAlert(result.error, 'danger');
                statusSelect.value = '';
            }
        });
    });
}

//
// FUNCTION    : loadDocuments
// DESCRIPTION :
//   Fetches all uploaded documents from the admin API and renders them
//   in the documents table. Each row shows the filename, uploader name and
//   email, MIME type, file size, upload timestamp, and a download link.
// PARAMETERS  :
//   none
// RETURNS     :
//   void (async)
//
async function loadDocuments() {
    const res = await fetch('/api/admin/documents');
    const data = await res.json();
    const tbody = document.getElementById('documentsTable');
    tbody.innerHTML = '';

    if (!data.documents || data.documents.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No documents uploaded yet</td></tr>';
        return;
    }

    data.documents.forEach(uploadedFile => {
        const fileSize = uploadedFile.size < 1024 * 1024
            ? (uploadedFile.size / 1024).toFixed(1) + ' KB'
            : (uploadedFile.size / 1024 / 1024).toFixed(1) + ' MB';
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${esc(uploadedFile.original_name)}</td>
            <td>${esc(uploadedFile.uploader_name)}</td>
            <td>${esc(uploadedFile.uploader_email)}</td>
            <td><span class="badge bg-light text-dark">${esc(uploadedFile.mime_type)}</span></td>
            <td>${fileSize}</td>
            <td>${new Date(uploadedFile.uploaded_at.replace(' ', 'T') + 'Z').toLocaleString()}</td>
            <td><a href="/api/uploads/${uploadedFile.id}/download" class="btn btn-sm btn-outline-primary">Download</a></td>`;
        tbody.appendChild(row);
    });
}

let allLogs = [];

//
// FUNCTION    : loadAudit
// DESCRIPTION :
//   Fetches the 200 most recent audit log entries from the admin API,
//   stores them in allLogs so the filter can re-render without a new
//   request, and calls renderAudit to display the full list.
// PARAMETERS  :
//   none
// RETURNS     :
//   void (async)
//
async function loadAudit() {
    const res = await fetch('/api/admin/audit');
    const data = await res.json();
    allLogs = data.logs || [];
    renderAudit(allLogs);
}

//
// FUNCTION    : renderAudit
// DESCRIPTION :
//   Renders the provided audit log entries into the audit table. Receives
//   either the full allLogs array or a pre-filtered subset from the
//   auditFilter input handler. All user-supplied strings pass through esc()
//   to prevent stored XSS attacks.
// PARAMETERS  :
//   Array logs : array of audit log entry objects to render
// RETURNS     :
//   void
//
function renderAudit(logs) {
    const tbody = document.getElementById('auditTable');
    tbody.innerHTML = '';
    logs.forEach(logEntry => {
        const row = document.createElement('tr');
        row.className = 'log-row';
        row.innerHTML = `
            <td>${new Date(logEntry.created_at.replace(' ', 'T') + 'Z').toLocaleString()}</td>
            <td>${logEntry.full_name ? esc(logEntry.full_name) : '<em class="text-muted">unknown</em>'}</td>
            <td><code>${esc(logEntry.action)}</code></td>
            <td>${logEntry.ip || '-'}</td>
            <td>${logEntry.detail ? esc(logEntry.detail) : '-'}</td>`;
        tbody.appendChild(row);
    });
}

//
// FUNCTION    : auditFilter input handler
// DESCRIPTION :
//   Filters the cached allLogs array as the admin types in the filter
//   input. Matches against the action code, user name, detail string, and
//   IP address. Calls renderAudit with the filtered subset so only matching
//   rows are shown without making a new network request.
// PARAMETERS  :
//   none (reads this.value from the input event target)
// RETURNS     :
//   void
//
document.getElementById('auditFilter').addEventListener('input', function () {
    const filterText = this.value.toLowerCase();
    if (!filterText) { renderAudit(allLogs); return; }
    renderAudit(allLogs.filter(logEntry =>
        (logEntry.action && logEntry.action.toLowerCase().includes(filterText)) ||
        (logEntry.full_name && logEntry.full_name.toLowerCase().includes(filterText)) ||
        (logEntry.detail && logEntry.detail.toLowerCase().includes(filterText)) ||
        (logEntry.ip && logEntry.ip.includes(filterText))
    ));
});

//
// FUNCTION    : loadBookingDropdowns
// DESCRIPTION :
//   Fetches the list of approved patients and approved doctors from the API
//   in parallel and populates the patient and doctor dropdowns in the Book
//   Appointment modal. Called once on page load so the dropdowns are ready
//   before the admin opens the modal.
// PARAMETERS  :
//   none
// RETURNS     :
//   void (async)
//
async function loadBookingDropdowns() {
    const [patientsResponse, doctorsResponse] = await Promise.all([
        fetch('/api/admin/patients').then(r => r.json()).catch(() => null),
        fetch('/api/doctors').then(r => r.json()).catch(() => null),
    ]);

    const patientSelect = document.getElementById('bookPatient');
    (patientsResponse?.patients || []).forEach(patient => {
        const option = document.createElement('option');
        option.value = patient.id;
        option.textContent = `${patient.full_name} (${patient.email})`;
        patientSelect.appendChild(option);
    });

    const doctorSelect = document.getElementById('bookDoctor');
    (doctorsResponse?.doctors || []).forEach(doctor => {
        const option = document.createElement('option');
        option.value = doctor.id;
        option.textContent = `Dr. ${doctor.full_name} - ${doctor.specialty}`;
        doctorSelect.appendChild(option);
    });
}

//
// FUNCTION    : bookSubmitBtn click handler
// DESCRIPTION :
//   Reads the patient, doctor, date, and notes fields from the Book
//   Appointment modal and posts a new appointment to the API. On success,
//   closes the modal, clears the form, shows a success alert, and reloads
//   both the appointments table and the stat cards. On failure, shows the
//   server error message inside the modal.
// PARAMETERS  :
//   none (reads form values from the DOM)
// RETURNS     :
//   void (async)
//
document.getElementById('bookSubmitBtn').addEventListener('click', async () => {
    const patientId = document.getElementById('bookPatient').value;
    const doctorId = document.getElementById('bookDoctor').value;
    const scheduledAt = document.getElementById('bookDate').value;
    const notes = document.getElementById('bookNotes').value.trim();
    const alertEl = document.getElementById('bookAlert');

    if (!patientId || !doctorId || !scheduledAt) {
        alertEl.className = 'alert alert-danger';
        alertEl.textContent = 'Please fill in all required fields.';
        alertEl.classList.remove('d-none');
        return;
    }

    const response = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            patient_id: parseInt(patientId),
            doctor_id: parseInt(doctorId),
            scheduled_at: scheduledAt,
            notes: notes || undefined,
        }),
    });
    const result = await response.json();

    if (response.ok) {
        bootstrap.Modal.getInstance(document.getElementById('bookModal')).hide();
        document.getElementById('bookPatient').value = '';
        document.getElementById('bookDoctor').value = '';
        document.getElementById('bookDate').value = '';
        document.getElementById('bookNotes').value = '';
        alertEl.classList.add('d-none');
        showAlert('Appointment booked successfully', 'success');
        loadAppointments();
        loadStats();
    } else {
        alertEl.className = 'alert alert-danger';
        alertEl.textContent = result.error || 'Booking failed';
        alertEl.classList.remove('d-none');
    }
});

//
// FUNCTION    : logoutBtn click handler
// DESCRIPTION :
//   Sends a POST request to the logout API endpoint to destroy the server
//   session, then redirects the browser to the login page.
// PARAMETERS  :
//   none
// RETURNS     :
//   void (async)
//
document.getElementById('logoutBtn').addEventListener('click', async () => {
    await fetch('/api/logout', { method: 'POST', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
    location.href = '/index.html';
});

//
// FUNCTION    : showAlert
// DESCRIPTION :
//   Displays a Bootstrap alert message in the page's alert container.
//   Uses textContent to prevent XSS – the message is never inserted as HTML.
//   The alert disappears automatically after 3 seconds.
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
    setTimeout(() => el.classList.add('d-none'), 3000);
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
