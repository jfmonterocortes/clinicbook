<!--
  FILE        : register.js
  PROJECT     : SECU2000 – ClinicBook : Secure Clinic Booking System
  PROGRAMMER  : Juan Felipe Montero Cortes
  FIRST VERSION: 2026-04-11
  DESCRIPTION :
    Handles the registration form logic. Toggles the doctor-specific field
    group based on the selected role, then submits the registration request
    to the API. On success, displays a confirmation message and redirects to
    the login page. On failure, displays the server-returned error message.
-->

//
// FUNCTION    : role change handler
// DESCRIPTION :
//   Shows or hides the doctor-specific input fields (specialty, license number,
//   bio) based on the currently selected role in the role dropdown.
// PARAMETERS  :
//   none (reads this.value from the change event target)
// RETURNS     :
//   void
//
document.getElementById('role').addEventListener('change', function () {
    document.getElementById('doctorFields').style.display =
        this.value === 'doctor' ? 'block' : 'none';
});

//
// FUNCTION    : form submit handler
// DESCRIPTION :
//   Collects all registration form values, builds the request body (including
//   doctor-specific fields when the role is 'doctor'), and posts to the
//   registration API. Displays a success message and redirects to login on
//   success, or shows the error message on failure.
// PARAMETERS  :
//   Event e : the form submit event (preventDefault called to stop page reload)
// RETURNS     :
//   void
//
document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const btn = document.getElementById('submitBtn');
    btn.disabled = true;
    btn.textContent = 'Creating account...';

    const role = document.getElementById('role').value;
    const body = {
        full_name: document.getElementById('full_name').value,
        email: document.getElementById('email').value,
        password: document.getElementById('password').value,
        role,
    };

    // Include doctor profile fields only when registering as a doctor
    if (role === 'doctor') {
        body.specialty = document.getElementById('specialty').value;
        body.license_number = document.getElementById('license_number').value;
        body.bio = document.getElementById('bio').value;
    }

    const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify(body),
    });
    const data = await res.json();

    if (res.ok) {
        showAlert(data.message, 'success');
        setTimeout(() => location.href = '/index.html', 2000);
    } else {
        showAlert(data.error || 'Registration failed', 'danger');
        btn.disabled = false;
        btn.textContent = 'Create Account';
    }
});

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
