/**
 * Password change with email OTP verification (1-minute code expiry)
 */
import { Api } from '../api.js';

import { esc } from './classroom-ui.js';
// ── Password security rules (mirrors Auth::validatePasswordStrength in PHP) ──
const PW_RULES = [
    { id: 'len',   label: 'At least 8 characters',          test: p => p.length >= 8 },
    { id: 'upper', label: 'One uppercase letter (A–Z)',      test: p => /[A-Z]/.test(p) },
    { id: 'lower', label: 'One lowercase letter (a–z)',      test: p => /[a-z]/.test(p) },
    { id: 'digit', label: 'One number (0–9)',                test: p => /[0-9]/.test(p) },
    { id: 'spec',  label: 'One special character (!@#$%…)',  test: p => /[^A-Za-z0-9]/.test(p) },
];

/**
 * Returns null if password is valid, or an error string for the first failed rule.
 * @param {string} pw
 * @returns {string|null}
 */
export function validatePassword(pw) {
    if (!pw || pw.length < 8)      return 'Password must be at least 8 characters.';
    if (pw.length > 128)           return 'Password must not exceed 128 characters.';
    if (!/[A-Z]/.test(pw))         return 'Password must contain at least one uppercase letter.';
    if (!/[a-z]/.test(pw))         return 'Password must contain at least one lowercase letter.';
    if (!/[0-9]/.test(pw))         return 'Password must contain at least one number.';
    if (!/[^A-Za-z0-9]/.test(pw))  return 'Password must contain at least one special character (e.g. !@#$%).';
    return null;
}

/**
 * Wrap a password input with a show/hide eye toggle button.
 * Call AFTER attachStrengthMeter so the strength meter stays outside the wrapper.
 * @param {HTMLInputElement} inputEl
 */
export function attachEyeToggle(inputEl) {
    if (!inputEl || inputEl.dataset.eyeAttached) return;
    inputEl.dataset.eyeAttached = '1';

    // Wrap just the input (meter, if already inserted, stays as a sibling outside)
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:relative;display:block;';
    inputEl.insertAdjacentElement('beforebegin', wrap);
    wrap.appendChild(inputEl);
    inputEl.style.paddingRight = '40px';
    inputEl.style.width = '100%';
    inputEl.style.boxSizing = 'border-box';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.tabIndex = -1;
    btn.setAttribute('aria-label', 'Show/hide password');
    btn.style.cssText = 'position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:#9CA3AF;padding:0;display:flex;align-items:center;transition:color .15s;';
    btn.innerHTML = `
        <svg data-eye-show width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
        </svg>
        <svg data-eye-hide width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>
        </svg>`;
    wrap.appendChild(btn);

    btn.addEventListener('mouseenter', () => btn.style.color = '#1B4D3E');
    btn.addEventListener('mouseleave', () => btn.style.color = '#9CA3AF');
    btn.addEventListener('click', () => {
        const visible = inputEl.type === 'text';
        inputEl.type = visible ? 'password' : 'text';
        btn.querySelector('[data-eye-show]').style.display = visible ? '' : 'none';
        btn.querySelector('[data-eye-hide]').style.display = visible ? 'none' : '';
    });
}

/**
 * Attach a live strength checklist below a password input.
 * @param {HTMLInputElement} inputEl
 */
export function attachStrengthMeter(inputEl) {
    if (!inputEl || inputEl.dataset.strengthAttached) return;
    inputEl.dataset.strengthAttached = '1';

    const meter = document.createElement('div');
    meter.className = 'pw-strength-meter';
    meter.style.cssText = 'margin-top:8px;font-size:12px;line-height:1.8';
    inputEl.insertAdjacentElement('afterend', meter);

    function update() {
        const pw    = inputEl.value;
        const passed = PW_RULES.filter(r => r.test(pw)).length;
        const pct    = Math.round((passed / PW_RULES.length) * 100);
        const color  = pct < 40 ? '#dc2626' : pct < 80 ? '#d97706' : '#16a34a';
        const lbl    = pct === 0 ? '' : pct < 40 ? 'Weak' : pct < 80 ? 'Fair' : pct < 100 ? 'Good' : 'Strong';
        meter.innerHTML = `
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
                <div style="flex:1;height:4px;background:#e5e7eb;border-radius:2px;overflow:hidden">
                    <div style="width:${pct}%;height:100%;background:${color};transition:width .2s,background .2s"></div>
                </div>
                ${lbl ? `<span style="font-size:11px;font-weight:700;color:${color};min-width:42px">${lbl}</span>` : ''}
            </div>
            ${PW_RULES.map(r => {
                const ok = pw.length > 0 && r.test(pw);
                return `<div style="color:${ok ? '#16a34a' : '#9ca3af'}">${ok ? '✓' : '○'} ${r.label}</div>`;
            }).join('')}`;
    }

    inputEl.addEventListener('input', update);
    update();
}

// esc() imported from classroom-ui.js (see import above)


/**
 * @param {HTMLElement} root
 * @param {{ alertSelector: string, curSelector: string, newSelector: string, confirmSelector: string, btnSelector: string, okClass?: string, errClass?: string }} cfg
 */
export function bindPasswordChangeOtp(root, cfg) {
    const alertEl = root.querySelector(cfg.alertSelector);
    const curEl = root.querySelector(cfg.curSelector);
    const newEl = root.querySelector(cfg.newSelector);
    const confirmEl = root.querySelector(cfg.confirmSelector);
    const btnEl = root.querySelector(cfg.btnSelector);
    const okClass = cfg.okClass || 'alert-success';
    const errClass = cfg.errClass || 'alert-error';

    let otpStep = false;
    let otpWrap = null;
    let expiryTimer = null;
    let expiresAtMs = 0;

    function showAlert(msg, ok = false) {
        if (!alertEl) return;
        const cls = ok ? okClass : errClass;
        alertEl.innerHTML = `<div class="${cls}">${esc(msg)}</div>`;
    }

    function clearExpiryTimer() {
        if (expiryTimer) {
            clearInterval(expiryTimer);
            expiryTimer = null;
        }
    }

    function formatRemaining(ms) {
        const total = Math.max(0, Math.ceil(ms / 1000));
        const m = Math.floor(total / 60);
        const s = total % 60;
        return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
    }

    function updateExpiryUi() {
        const timerEl = otpWrap?.querySelector('.pw-otp-timer');
        const verifyBtn = otpWrap?.querySelector('.pw-otp-verify');
        const inputEl = otpWrap?.querySelector('#pw-otp-code');
        if (!timerEl || !expiresAtMs) return;

        const left = expiresAtMs - Date.now();
        if (left <= 0) {
            timerEl.textContent = 'Code expired — click Resend code';
            timerEl.style.color = '#b91c1c';
            if (verifyBtn) verifyBtn.disabled = true;
            if (inputEl) inputEl.disabled = true;
            clearExpiryTimer();
            showAlert('Verification code expired. Click Resend code to get a new one.');
            return;
        }

        timerEl.textContent = `Code expires in ${formatRemaining(left)}`;
        timerEl.style.color = left <= 15000 ? '#b45309' : '#737373';
        if (verifyBtn) verifyBtn.disabled = false;
        if (inputEl) inputEl.disabled = false;
    }

    function startExpiryCountdown(expiresAt, expiresInSec) {
        clearExpiryTimer();
        if (expiresAt) {
            expiresAtMs = new Date(expiresAt.replace(' ', 'T')).getTime();
            if (Number.isNaN(expiresAtMs)) {
                expiresAtMs = Date.now() + (expiresInSec || 60) * 1000;
            }
        } else {
            expiresAtMs = Date.now() + (expiresInSec || 60) * 1000;
        }
        updateExpiryUi();
        expiryTimer = setInterval(updateExpiryUi, 1000);
    }

    function ensureOtpUi() {
        if (otpWrap) return otpWrap;
        otpWrap = document.createElement('div');
        otpWrap.className = 'pw-otp-step';
        otpWrap.innerHTML = `
            <div class="form-group" style="margin-top:16px">
                <label class="form-label" style="display:block;font-size:13px;font-weight:600;margin-bottom:6px">Email verification code</label>
                <input type="text" class="form-input pw-otp-input" id="pw-otp-code" placeholder="6-digit code" maxlength="6" inputmode="numeric" autocomplete="one-time-code"
                    style="width:100%;padding:10px 14px;border:1px solid #e0e0e0;border-radius:8px;font-size:18px;letter-spacing:6px;text-align:center;font-family:monospace;box-sizing:border-box">
                <p class="pw-otp-timer" style="font-size:12px;color:#737373;margin:8px 0 0;font-weight:600">Check your registered email for the code.</p>
            </div>
            <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
                <button type="button" class="btn-primary pw-otp-verify" style="flex:1;min-width:140px;background:#00461B;color:#fff;border:none;padding:10px 16px;border-radius:8px;font-weight:600;cursor:pointer">Verify &amp; Set Password</button>
                <button type="button" class="pw-otp-resend" style="background:#f5f5f5;border:1px solid #e0e0e0;padding:10px 14px;border-radius:8px;font-weight:600;cursor:pointer">Resend code</button>
            </div>
        `;
        confirmEl?.closest('.form-group, .pr-fg, .pr-form-full')?.parentElement?.appendChild(otpWrap)
            || newEl?.parentElement?.parentElement?.appendChild(otpWrap);

        otpWrap.querySelector('.pw-otp-verify')?.addEventListener('click', verifyOtp);
        otpWrap.querySelector('.pw-otp-resend')?.addEventListener('click', requestOtp);
        return otpWrap;
    }

    function readPasswords() {
        const curPw = curEl?.value || '';
        const newPw = newEl?.value || '';
        const confirmPw = confirmEl?.value || '';
        return { curPw, newPw, confirmPw };
    }

    function validatePasswords() {
        const { curPw, newPw, confirmPw } = readPasswords();
        if (!curPw || !newPw) {
            showAlert('Fill in all password fields.');
            return null;
        }
        const pwErr = validatePassword(newPw);
        if (pwErr) {
            showAlert(pwErr);
            return null;
        }
        if (newPw !== confirmPw) {
            showAlert('New password and confirmation do not match.');
            return null;
        }
        return { curPw, newPw, confirmPw };
    }

    async function requestOtp() {
        const data = validatePasswords();
        if (!data) return;

        if (btnEl) {
            btnEl.disabled = true;
            btnEl.textContent = 'Sending code...';
        }
        showAlert('Sending verification code to your email...', true);

        const res = await Api.post('/AuthAPI.php?action=request-password-otp', {
            current_password: data.curPw,
            new_password: data.newPw,
        });

        if (btnEl) {
            btnEl.disabled = false;
            btnEl.textContent = otpStep ? 'Code sent' : (btnEl.dataset.defaultLabel || 'Send verification code');
        }

        if (!res.success) {
            showAlert(res.message || 'Could not send verification code.');
            return;
        }

        otpStep = true;
        ensureOtpUi();
        otpWrap.style.display = 'block';
        const inputEl = otpWrap.querySelector('#pw-otp-code');
        if (inputEl) {
            inputEl.value = '';
            inputEl.disabled = false;
        }
        otpWrap.querySelector('.pw-otp-verify').disabled = false;

        if (btnEl) btnEl.textContent = 'Code sent — check email';
        showAlert(res.message || 'Verification code sent to your email.', true);
        startExpiryCountdown(res.data?.expires_at, res.data?.expires_in || 60);
        inputEl?.focus();
    }

    async function verifyOtp() {
        if (expiresAtMs && Date.now() >= expiresAtMs) {
            showAlert('Verification code expired. Click Resend code.');
            return;
        }

        const otp = otpWrap?.querySelector('#pw-otp-code')?.value?.trim() || '';
        if (!/^\d{6}$/.test(otp)) {
            showAlert('Enter the 6-digit code from your email.');
            return;
        }

        const verifyBtn = otpWrap?.querySelector('.pw-otp-verify');
        if (verifyBtn) {
            verifyBtn.disabled = true;
            verifyBtn.textContent = 'Verifying...';
        }

        const res = await Api.post('/AuthAPI.php?action=verify-password-otp', { otp });

        if (verifyBtn) {
            verifyBtn.disabled = false;
            verifyBtn.textContent = 'Verify & Set Password';
        }

        if (res.success) {
            clearExpiryTimer();
            showAlert(res.message || 'Password changed successfully!', true);
            if (curEl) curEl.value = '';
            if (newEl) newEl.value = '';
            if (confirmEl) confirmEl.value = '';
            if (otpWrap) {
                otpWrap.querySelector('#pw-otp-code').value = '';
                otpWrap.style.display = 'none';
            }
            otpStep = false;
            if (btnEl) btnEl.textContent = btnEl.dataset.defaultLabel || 'Send verification code';
        } else {
            showAlert(res.message || 'Invalid verification code.');
        }
    }

    if (btnEl) {
        btnEl.dataset.defaultLabel = btnEl.textContent.trim();
        btnEl.textContent = 'Send verification code';
        btnEl.addEventListener('click', requestOtp);
    }
}

/**
 * Client-side ID format helpers (login / signup)
 */
export function hasLetters(id) {
    return /[A-Za-z]/.test(String(id || ''));
}

export function isValidStudentId(id) {
    const v = String(id || '').trim();
    if (v.length < 3 || hasLetters(v)) return false;
    return /^[0-9.\-]+$/.test(v);
}

export function isValidStaffId(id) {
    const v = String(id || '').trim();
    return v.length >= 3 && hasLetters(v) && /^[A-Za-z0-9.\-]+$/.test(v);
}

export function loginIdError(id) {
    if (hasLetters(id)) {
        return isValidStaffId(id)
            ? null
            : 'Employee IDs must contain letters (instructor/staff only).';
    }
    return isValidStudentId(id)
        ? null
        : 'Student IDs must be numbers only — no letters.';
}

