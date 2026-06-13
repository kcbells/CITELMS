/**
 * Password change with email OTP verification (1-minute code expiry)
 */
import { Api } from '../api.js';

function esc(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
}

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
        if (newPw.length < 6) {
            showAlert('New password must be at least 6 characters.');
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
