/**
 * COC-LMS Login page — single-step form with first-login detection
 */

const API = '../api/AuthAPI.php';

// ── Password validation (mirrors Auth::validatePasswordStrength in PHP) ──
const PW_RULES = [
    { label: 'At least 8 characters',          test: p => p.length >= 8 },
    { label: 'One uppercase letter (A–Z)',      test: p => /[A-Z]/.test(p) },
    { label: 'One lowercase letter (a–z)',      test: p => /[a-z]/.test(p) },
    { label: 'One number (0–9)',                test: p => /[0-9]/.test(p) },
    { label: 'One special character (!@#$%…)',  test: p => /[^A-Za-z0-9]/.test(p) },
];
function validatePassword(pw) {
    if (!pw || pw.length < 8)     return 'Password must be at least 8 characters.';
    if (pw.length > 128)          return 'Password must not exceed 128 characters.';
    if (!/[A-Z]/.test(pw))        return 'Password must contain at least one uppercase letter.';
    if (!/[a-z]/.test(pw))        return 'Password must contain at least one lowercase letter.';
    if (!/[0-9]/.test(pw))        return 'Password must contain at least one number.';
    if (!/[^A-Za-z0-9]/.test(pw)) return 'Password must contain at least one special character (e.g. !@#$%).';
    return null;
}
function attachStrengthMeter(inputEl) {
    if (!inputEl || inputEl.dataset.strengthAttached) return;
    inputEl.dataset.strengthAttached = '1';
    const meter = document.createElement('div');
    meter.style.cssText = 'margin-top:8px;font-size:12px;line-height:1.8';
    inputEl.insertAdjacentElement('afterend', meter);
    function update() {
        const pw = inputEl.value;
        const passed = PW_RULES.filter(r => r.test(pw)).length;
        const pct   = Math.round((passed / PW_RULES.length) * 100);
        const color = pct < 40 ? '#dc2626' : pct < 80 ? '#d97706' : '#16a34a';
        const lbl   = pct === 0 ? '' : pct < 40 ? 'Weak' : pct < 80 ? 'Fair' : pct < 100 ? 'Good' : 'Strong';
        meter.innerHTML = `
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">
                <div style="flex:1;height:4px;background:#e5e7eb;border-radius:2px;overflow:hidden">
                    <div style="width:${pct}%;height:100%;background:${color};transition:width .2s,background .2s"></div>
                </div>
                ${lbl ? `<span style="font-size:11px;font-weight:700;color:${color}">${lbl}</span>` : ''}
            </div>
            ${PW_RULES.map(r => {
                const ok = pw.length > 0 && r.test(pw);
                return `<div style="color:${ok ? '#16a34a' : '#9ca3af'}">${ok ? '✓' : '○'} ${r.label}</div>`;
            }).join('')}`;
    }
    inputEl.addEventListener('input', update);
    update();
}

// ── Captcha ────────────────────────────────────────────────────────────
let captchaAnswer = 0;
let signupCaptchaAnswer = 0;
let loginCaptchaRequired = false;

function requireLoginCaptcha() {
    if (!loginCaptchaRequired) {
        loginCaptchaRequired = true;
        document.getElementById('login-captcha-wrap').style.display = '';
        refreshLoginCaptcha();
    }
}

function genCaptcha(displayId, inputId, answerSetter) {
    const a = Math.floor(Math.random() * 10) + 1;
    const b = Math.floor(Math.random() * 10) + 1;
    const ans = a + b;
    answerSetter(ans);
    document.getElementById(displayId).textContent = `${a} + ${b} = ?`;
    const input = document.getElementById(inputId);
    if (input) {
        input.value = '';
        input.classList.remove('correct', 'error');
        restrictToDigits(input);
    }
}

/**
 * Keeps a captcha box numeric. The answer is always two positive numbers
 * added together, so a letter or symbol can only ever be a typo — strip it as
 * it's typed instead of letting it sit there and fail on submit.
 *
 * inputmode="numeric" alone isn't enough: it only hints which keyboard a
 * phone should show, and does nothing about typing on a desktop or pasting.
 */
function restrictToDigits(input) {
    if (input.dataset.digitsOnly) return; // don't stack listeners on refresh
    input.dataset.digitsOnly = '1';
    input.setAttribute('inputmode', 'numeric');
    input.setAttribute('pattern', '[0-9]*');
    input.addEventListener('input', () => {
        const digits = input.value.replace(/\D/g, '');
        if (digits !== input.value) {
            const atEnd = input.selectionStart === input.value.length;
            input.value = digits;
            // Keep the caret where it was, unless they were typing at the end.
            if (!atEnd) {
                const pos = Math.min(input.selectionStart ?? digits.length, digits.length);
                input.setSelectionRange(pos, pos);
            }
        }
    });
}

function refreshLoginCaptcha() {
    genCaptcha('captcha-challenge', 'captcha-input', v => { captchaAnswer = v; });
}
function refreshSignupCaptcha() {
    genCaptcha('signup-captcha-challenge', 'signup-captcha-input', v => { signupCaptchaAnswer = v; });
}

refreshLoginCaptcha();
refreshSignupCaptcha();

document.getElementById('captcha-refresh').addEventListener('click', refreshLoginCaptcha);
document.getElementById('signup-captcha-refresh').addEventListener('click', refreshSignupCaptcha);

const captchaInput = document.getElementById('captcha-input');
captchaInput.addEventListener('input', () => {
    const val = parseInt(captchaInput.value, 10);
    captchaInput.classList.toggle('correct', val === captchaAnswer);
    captchaInput.classList.toggle('error', captchaInput.value.length > 0 && val !== captchaAnswer);
});

const signupCaptchaInput = document.getElementById('signup-captcha-input');
signupCaptchaInput.addEventListener('input', () => {
    const val = parseInt(signupCaptchaInput.value, 10);
    signupCaptchaInput.classList.toggle('correct', val === signupCaptchaAnswer);
    signupCaptchaInput.classList.toggle('error', signupCaptchaInput.value.length > 0 && val !== signupCaptchaAnswer);
});

// ── UI helpers ─────────────────────────────────────────────────────────
function showError(containerId, msg) {
    const el = document.getElementById(containerId);
    el.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>${escHtml(msg)}`;
    el.className = 'auth-error';
    el.style.display = 'flex';
}

function showSuccess(containerId, msg) {
    const el = document.getElementById(containerId);
    el.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg><span>${escHtml(msg)}</span>`;
    el.className = 'auth-success';
    el.style.display = 'flex';
}

function clearMsg(containerId) {
    const el = document.getElementById(containerId);
    el.style.display = 'none';
    el.innerHTML = '';
}

function setBtn(btnId, textId, loading, text) {
    const btn = document.getElementById(btnId);
    const span = document.getElementById(textId);
    btn.disabled = loading;
    span.innerHTML = loading
        ? '<span class="spinner"></span>'
        : escHtml(text);
}

function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function openModal(id) {
    const el = document.getElementById(id);
    el.removeAttribute('hidden');
    el.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
}

function closeModal(id) {
    const el = document.getElementById(id);
    el.setAttribute('hidden', '');
    el.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
}

// ── Password toggle ─────────────────────────────────────────────────────
function setupPwToggle(btnId, inputId) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    const input = document.getElementById(inputId);
    btn.addEventListener('click', () => {
        const showing = input.type === 'text';
        input.type = showing ? 'password' : 'text';
        btn.setAttribute('aria-pressed', String(!showing));
        btn.querySelector('svg').innerHTML = showing
            ? '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>'
            : '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>';
    });
}

setupPwToggle('password-toggle', 'password');
setupPwToggle('new-pw-toggle', 'new-password');
setupPwToggle('confirm-pw-toggle', 'confirm-password');
setupPwToggle('signup-pw-toggle', 'signup-password');
setupPwToggle('signup-cpw-toggle', 'signup-confirm-password');

// ── Login form ─────────────────────────────────────────────────────────
const loginForm = document.getElementById('login-form');
loginForm.addEventListener('submit', async e => {
    e.preventDefault();
    clearMsg('error-container');

    const userId = document.getElementById('user_id').value.trim();
    const password = document.getElementById('password').value;
    const captchaVal = parseInt(captchaInput.value, 10);

    if (!userId) {
        showError('error-container', 'Please enter your School ID.');
        return;
    }
    if (captchaVal !== captchaAnswer) {
        showError('error-container', 'Incorrect captcha answer. Please try again.');
        refreshLoginCaptcha();
        return;
    }

    setBtn('submit-btn', 'btn-text', true, 'Sign In');

    try {
        if (!password) {
            // No password — check if this is a first-time login
            const checkRes = await fetch(`${API}?action=check-id`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
                body: JSON.stringify({ student_id: userId })
            }).then(r => r.json());

            if (!checkRes.success) {
                showError('error-container', checkRes.message || 'Account not found or not active.');
                requireLoginCaptcha();
                return;
            }

            if (checkRes.first_login) {
                // Establish session via login endpoint then prompt for new password
                const loginRes = await fetch(`${API}?action=login`, {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
                    body: JSON.stringify({ user_id: userId, password: '' })
                }).then(r => r.json());

                if (loginRes.data?.token) localStorage.setItem('jwt_token', loginRes.data.token);

                if (loginRes.success && loginRes.data?.first_login) {
                    openModal('set-password-modal');
                    attachStrengthMeter(document.getElementById('new-password'));
                } else {
                    showError('error-container', loginRes.message || 'Login failed. Please try again.');
                    requireLoginCaptcha();
                }
            } else {
                showError('error-container', 'Please enter your password to sign in.');
                document.getElementById('password').focus();
                requireLoginCaptcha();
            }
            return;
        }

        // Normal login with password
        const loginRes = await fetch(`${API}?action=login`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
            body: JSON.stringify({ user_id: userId, password })
        }).then(r => r.json());

        if (!loginRes.success) {
            showError('error-container', loginRes.message || 'Invalid ID or password.');
            requireLoginCaptcha();
            document.getElementById('password').value = '';
            return;
        }

        // Store JWT so dashboard API calls are authenticated
        if (loginRes.data?.token) {
            localStorage.setItem('jwt_token', loginRes.data.token);
        }

        if (loginRes.data?.first_login || loginRes.data?.must_change_password) {
            openModal('set-password-modal');
            attachStrengthMeter(document.getElementById('new-password'));
            return;
        }

        const dest = loginRes.data?.redirect
            || (loginRes.data?.user?.role === 'admin'      ? './pages/admin/dashboard.html'
            :  (loginRes.data?.user?.role === 'instructor' ? './pages/instructor/dashboard.html'
            :  (loginRes.data?.user?.role === 'dean'       ? './pages/dean/dashboard.html'
            :                                                './pages/student/dashboard.html')));

        document.getElementById('btn-text').innerHTML = '<span class="check-icon">✓</span> Redirecting…';
        document.getElementById('submit-btn').classList.add('success');
        setTimeout(() => { window.location.href = dest; }, 800);

    } catch (err) {
        console.error('Login error:', err);
        showError('error-container', 'Connection error. Please try again.');
        requireLoginCaptcha();
    } finally {
        const btn = document.getElementById('submit-btn');
        if (!btn.classList.contains('success')) {
            setBtn('submit-btn', 'btn-text', false, 'Sign In');
        }
    }
});

// ── Set Password (first login) ─────────────────────────────────────────
document.getElementById('set-pw-submit').addEventListener('click', async () => {
    clearMsg('set-pw-error');
    const newPw = document.getElementById('new-password').value;
    const confirmPw = document.getElementById('confirm-password').value;

    const pwErr = validatePassword(newPw);
    if (pwErr) {
        showError('set-pw-error', pwErr);
        return;
    }
    if (newPw !== confirmPw) {
        showError('set-pw-error', 'Passwords do not match.');
        return;
    }

    setBtn('set-pw-submit', 'set-pw-btn-text', true, 'Set Password & Continue');

    try {
        const res = await fetch(`${API}?action=set-first-password`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
            body: JSON.stringify({ new_password: newPw, confirm_password: confirmPw })
        }).then(r => r.json());

        if (!res.success) {
            showError('set-pw-error', res.message || 'Failed to set password. Please refresh and try again.');
            return;
        }

        if (res.data?.token) localStorage.setItem('jwt_token', res.data.token);

        document.getElementById('set-pw-btn-text').textContent = '✓ Password set! Redirecting…';
        const dest = res.data?.redirect
            || (res.data?.role === 'admin'      ? './pages/admin/dashboard.html'
            :  (res.data?.role === 'instructor' ? './pages/instructor/dashboard.html'
            :  (res.data?.role === 'dean'       ? './pages/dean/dashboard.html'
            :                                     './pages/student/dashboard.html')));
        setTimeout(() => { window.location.href = dest; }, 900);
    } catch {
        showError('set-pw-error', 'Connection error. Please try again.');
    } finally {
        const span = document.getElementById('set-pw-btn-text');
        if (!span.textContent.includes('Redirecting')) {
            document.getElementById('set-pw-submit').disabled = false;
            span.textContent = 'Set Password & Continue';
        }
    }
});

// ── Sign-up modal ──────────────────────────────────────────────────────
document.getElementById('open-signup-modal').addEventListener('click', () => {
    openModal('signup-modal');
    loadSignupCatalog();
    attachStrengthMeter(document.getElementById('signup-password'));
});
document.getElementById('close-signup-modal').addEventListener('click', () => closeModal('signup-modal'));
document.getElementById('cancel-signup').addEventListener('click', () => closeModal('signup-modal'));

document.getElementById('signup-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal('signup-modal');
});

// ── Signup catalog ─────────────────────────────────────────────────────
let catalogLoaded = false;

async function loadSignupCatalog() {
    if (catalogLoaded) return;
    try {
        const res = await fetch('../api/AuthAPI.php?action=signup-catalog').then(r => r.json());
        if (!res.success) return;
        const departments = res.data?.departments || [];
        catalogLoaded = true;

        const select = document.getElementById('signup-course');
        select.innerHTML = '<option value="">— Select your course —</option>';

        departments.forEach(dept => {
            (dept.programs || []).forEach(prog => {
                const opt = document.createElement('option');
                opt.value = prog.program_code;
                opt.textContent = `${prog.program_code} — ${prog.program_name}`;
                opt.dataset.hasMajors = prog.majors && prog.majors.length > 0 ? '1' : '0';
                opt.dataset.majors = JSON.stringify(prog.majors || []);
                opt.dataset.dept = dept.department_name || '';
                select.appendChild(opt);
            });
        });
    } catch {
        document.getElementById('signup-course').innerHTML = '<option value="">Failed to load courses</option>';
    }
}

document.getElementById('signup-course').addEventListener('change', function () {
    const opt = this.options[this.selectedIndex];
    const majorWrap = document.getElementById('signup-major-wrap');
    const majorSelect = document.getElementById('signup-major');
    const deptHint = document.getElementById('signup-dept-hint');

    deptHint.textContent = opt && opt.dataset.dept
        ? `College/Dept: ${opt.dataset.dept}`
        : 'Your college/department is assigned automatically from your course.';

    if (opt && opt.dataset.hasMajors === '1') {
        const majors = JSON.parse(opt.dataset.majors || '[]');
        majorSelect.innerHTML = '<option value="">— Select major —</option>';
        majors.forEach(m => {
            const o = document.createElement('option');
            o.value = m; o.textContent = m;
            majorSelect.appendChild(o);
        });
        majorWrap.style.display = '';
    } else {
        majorWrap.style.display = 'none';
        majorSelect.innerHTML = '';
    }
});

// ── Signup submit ──────────────────────────────────────────────────────
document.getElementById('signup-submit-btn').addEventListener('click', async () => {
    clearMsg('signup-error-container');
    clearMsg('signup-success-container');

    const studentId  = document.getElementById('signup-student-id').value.trim();
    const fullName   = document.getElementById('signup-full-name').value.trim();
    const email      = document.getElementById('signup-email').value.trim();
    const programCode = document.getElementById('signup-course').value;
    const major      = document.getElementById('signup-major').value;
    const password   = document.getElementById('signup-password').value;
    const confirmPw  = document.getElementById('signup-confirm-password').value;
    const captchaVal = parseInt(signupCaptchaInput.value, 10);

    if (!studentId || !fullName || !email || !programCode) {
        showError('signup-error-container', 'Please fill in all required fields.');
        return;
    }
    if (!email.toLowerCase().endsWith('@phinmaed.com')) {
        showError('signup-error-container', 'Please use your PHINMAed email address (e.g. username.coc@phinmaed.com).');
        return;
    }
    const pwErr = validatePassword(password);
    if (pwErr) {
        showError('signup-error-container', pwErr);
        return;
    }
    if (password !== confirmPw) {
        showError('signup-error-container', 'Passwords do not match.');
        return;
    }
    if (captchaVal !== signupCaptchaAnswer) {
        showError('signup-error-container', 'Incorrect captcha answer. Please try again.');
        refreshSignupCaptcha();
        return;
    }

    setBtn('signup-submit-btn', 'signup-btn-text', true, 'Creating Account…');

    try {
        const res = await fetch(`${API}?action=register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ student_id: studentId, full_name: fullName, email, program_code: programCode, major, password, confirm_password: confirmPw })
        }).then(r => r.json());

        if (!res.success) {
            showError('signup-error-container', res.message || 'Registration failed.');
            refreshSignupCaptcha();
            return;
        }

        showSuccess('signup-success-container', 'Account created! You can now log in with your Student ID and password.');
        document.getElementById('signup-form').reset();
        document.getElementById('signup-major-wrap').style.display = 'none';
        catalogLoaded = false;
        refreshSignupCaptcha();
        // Pre-fill the login ID for convenience
        document.getElementById('user_id').value = studentId;
        setTimeout(() => closeModal('signup-modal'), 2200);
    } catch {
        showError('signup-error-container', 'Connection error. Please try again.');
    } finally {
        setBtn('signup-submit-btn', 'signup-btn-text', false, 'Create Account');
    }
});

// ── ESC closes signup modal ────────────────────────────────────────────
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        if (!document.getElementById('signup-modal').hasAttribute('hidden')) closeModal('signup-modal');
    }
});
