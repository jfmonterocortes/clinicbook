<!--
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
-->

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
    loadUsers();
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
            <td>${u.specialty ? esc(u.specialty) : '—'}</td>
            <td><span class="badge bg-${badgeClass}">${approved}</span></td>
            <td>
                ${u.role !== 'admin' ? `
                <button class="btn btn-sm ${u.is_approved ? 'btn-outline-danger' : 'btn-outline-success'}"
                        data-user-id="${u.id}" data-approve="${u.is_approved ? 'false' : 'true'}">
                    ${u.is_approved ? 'Suspend' : 'Approve'}
                </button>` : '—'}
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
// FUNCTION    : loadAppointments
// DESCRIPTION :
//   Fetches all appointments in the system from the admin API and renders
//   them in the appointments table with patient name, doctor name, specialty,
//   scheduled time, and current status.
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

    (data.appointments || []).forEach(a => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${esc(a.patient_name)}</td>
            <td>Dr. ${esc(a.doctor_name)}</td>
            <td>${esc(a.specialty)}</td>
            <td>${new Date(a.scheduled_at).toLocaleString()}</td>
            <td><span class="badge bg-secondary">${a.status}</span></td>`;
        tbody.appendChild(row);
    });
}

//
// FUNCTION    : loadAudit
// DESCRIPTION :
//   Fetches the 200 most recent audit log entries from the admin API and
//   renders them in the audit table. Each row shows the timestamp, user,
//   action code, IP address, and detail string.
// PARAMETERS  :
//   none
// RETURNS     :
//   void (async)
//
async function loadAudit() {
    const res = await fetch('/api/admin/audit');
    const data = await res.json();
    const tbody = document.getElementById('auditTable');
    tbody.innerHTML = '';

    (data.logs || []).forEach(l => {
        const row = document.createElement('tr');
        row.className = 'log-row';
        row.innerHTML = `
            <td>${new Date(l.created_at).toLocaleString()}</td>
            <td>${l.full_name ? esc(l.full_name) : '<em class="text-muted">unknown</em>'}</td>
            <td><code>${esc(l.action)}</code></td>
            <td>${l.ip || '—'}</td>
            <td>${l.detail ? esc(l.detail) : '—'}</td>`;
        tbody.appendChild(row);
    });
}

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
