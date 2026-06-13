/**
 * Login page
 */
import { Api, BASE_URL } from './api.js';
import { Auth } from './auth.js';

let captchaAnswer = '';

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
}

function showError(message) {
    const errorContainer = document.getElementById('error-container');
    errorContainer.innerHTML = `<div class="auth-error" role="alert"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg><span>${escapeHtml(message)}</span></div>`;
    errorContainer.style.display = 'block';
}

function hideError() {
    const errorContainer = document.getElementById('error-container');
    errorContainer.style.display = 'none';
    errorContainer.innerHTML = '';
}

function generateCaptcha() {
    const a = Math.floor(Math.random() * 20) + 1;
    const b = Math.floor(Math.random() * 20) + 1;
    captchaAnswer = String(a + b);
    const challengeEl = document.getElementById('captcha-challenge');
    const input = document.getElementById('captcha-input');
    if (challengeEl) challengeEl.textContent = `${a}  +  ${b}  =  ?`;
    if (input) {
        input.value = '';
        input.classList.remove('error', 'correct');
    }
}

async function initLoginPage() {
    const user = await Auth.check();
    if (user) {
        window.location.href = BASE_URL + '/app/dashboard.html';
        return;
    }

    generateCaptcha();
    document.getElementById('captcha-refresh')?.addEventListener('click', generateCaptcha);

    document.getElementById('captcha-input')?.addEventListener('input', (e) => {
        const input = e.target;
        const val = input.value.trim();
        input.classList.remove('error', 'correct');
        if (val === '') return;
        if (val === captchaAnswer) {
            input.classList.add('correct');
        } else if (val.length >= captchaAnswer.length) {
            input.classList.add('error');
        }
    });

    document.getElementById('password-toggle')?.addEventListener('click', () => {
        const input = document.getElementById('password');
        const isHidden = input.type === 'password';
        input.type = isHidden ? 'text' : 'password';
        document.getElementById('password-toggle').setAttribute('aria-pressed', isHidden ? 'true' : 'false');
    });

    const btn = document.getElementById('submit-btn');
    btn?.addEventListener('mousedown', (e) => {
        if (btn.disabled) return;
        const rect = btn.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height) * 2;
        const ripple = document.createElement('span');
        ripple.className = 'ripple';
        ripple.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - rect.left - size / 2}px;top:${e.clientY - rect.top - size / 2}px`;
        btn.appendChild(ripple);
        ripple.addEventListener('animationend', () => ripple.remove());
    });

    document.getElementById('login-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();

        const btnText = document.getElementById('btn-text');
        const captchaInput = document.getElementById('captcha-input');

        const userId = document.getElementById('user_id').value.trim();
        const password = document.getElementById('password').value;

        if (!userId || !password) {
            showError('Please enter your User ID and password.');
            return;
        }

        if (captchaInput.value.trim() !== captchaAnswer) {
            captchaInput.classList.add('error');
            captchaInput.value = '';
            captchaInput.focus();
            generateCaptcha();
            showError('Incorrect captcha answer. A new question has been generated.');
            return;
        }

        btn.disabled = true;
        btnText.innerHTML = '<div class="spinner"></div> Signing in...';
        hideError();

        try {
            const result = await Api.post('/AuthAPI.php?action=login', {
                user_id: userId,
                password
            });

            if (result.success) {
                if (result.data?.token) localStorage.setItem('jwt_token', result.data.token);
                btn.classList.add('success');
                btnText.innerHTML = '<svg class="check-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Welcome!';
                setTimeout(() => { window.location.href = BASE_URL + '/app/dashboard.html'; }, 600);
            } else {
                generateCaptcha();
                const msg = result._parseError
                    ? (result.message || 'Server returned an invalid response. Please refresh and try again.')
                    : (result.message || 'Invalid credentials. Please try again.');
                showError(msg);
                btn.disabled = false;
                btnText.textContent = 'Sign In';
            }
        } catch (_) {
            generateCaptcha();
            showError('An error occurred. Please try again.');
            btn.disabled = false;
            btnText.textContent = 'Sign In';
        }
    });
}

initLoginPage();
