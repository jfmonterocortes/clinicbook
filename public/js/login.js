<!--
  FILE        : login.js
  PROJECT     : SECU2000 – ClinicBook : Secure Clinic Booking System
  PROGRAMMER  : Juan Felipe Montero Cortes
  FIRST VERSION: 2026-04-11
  DESCRIPTION :
    Handles the login page logic. On load, redirects already-authenticated
    users to their role-appropriate dashboard. On form submission, posts
    credentials to the API and either redirects on success or displays the
    error message returned by the server.
-->

// Redirect to the correct dashboard if a session is already active
fetch('/api/me').then(r => {
    if (r.ok) {
        return r.json();
    }
}).then(data => {
    if (data && data.user) {
        redirectByRole(data.user.role);
    }
});

document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const btn = document.getElementById('submitBtn');
    btn.disabled = true;
    btn.textContent = 'Signing in...';

    const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({
            email: document.getElementById('email').value,
            password: document.getElementById('password').value,
        }),
    });
    const data = await res.json();

    if (res.ok) {
        redirectByRole(data.user.role);
    } else {
        showAlert(data.error || 'Login failed', 'danger');
        btn.disabled = false;
        btn.textContent = 'Sign In';
    }
});

//
// FUNCTION    : redirectByRole
// DESCRIPTION :
//   Sends the browser to the role-appropriate dashboard page based on the
//   role string returned by the server after a successful login or session check.
// PARAMETERS  :
//   string role : the user's role ('admin', 'doctor', or 'patient')
// RETURNS     :
//   void : sets window.location.href to the target page
//
function redirectByRole(role) {
    if (role === 'admin') {
        location.href = '/admin.html';
    } else if (role === 'doctor') {
        location.href = '/doctor.html';
    } else {
        location.href = '/dashboard.html';
    }
}

//
// FUNCTION    : showAlert
// DESCRIPTION :
//   Displays a Bootstrap alert message in the page's alert container.
//   Uses textContent to prevent XSS – the message is never inserted as HTML.
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
}
