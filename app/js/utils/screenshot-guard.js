/**
 * Screenshot deterrent for sensitive read-only screens (quiz review / "where
 * I went wrong"). Content displays normally — this only blocks the
 * interceptable capture methods and marks anything that gets through:
 *
 * 1. Same-device capture (Print Screen, Win+Shift+S, Cmd+Shift+3/4/5) can
 *    actually be intercepted and blocked in the browser — we do that here,
 *    same technique take-quiz.js already uses during a proctored attempt.
 * 2. A second physical device (e.g. a phone camera pointed at the screen)
 *    CANNOT be blocked or even detected by any website — nothing running in
 *    the browser has visibility into a photo taken of the monitor. For that
 *    case the only real deterrent is a visible watermark identifying the
 *    student, so a leaked photo is traceable back to whoever took it.
 */
import { Auth } from '../auth.js';
import { notify } from './notify.js';

let armed = false;
let target = null;
let watermarkEl = null;
let blurTimer = null;

function isScreenshotKey(e) {
    const key = (e.key || '').toLowerCase();
    if (key === 'printscreen') return true;
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && ['3', '4', '5', 's'].includes(key)) return true;
    return false;
}

function flashBlur() {
    if (!target) return;
    target.classList.add('ssg-blurred');
    clearTimeout(blurTimer);
    blurTimer = setTimeout(() => target?.classList.remove('ssg-blurred'), 1500);
}

const onKeyDown = (e) => {
    if (!isScreenshotKey(e)) return;
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard?.writeText('').catch(() => {});
    flashBlur();
    notify.warning('Screenshots are disabled on this page.', 2500);
};

const onWindowBlur = () => {
    // A Snipping Tool / screenshot overlay steals window focus even though
    // the tab itself stays "visible" — blur the content while it's up so
    // nothing readable ends up in the capture.
    flashBlur();
};

let stylesInjected = false;
function injectStyles() {
    if (stylesInjected) return;
    stylesInjected = true;
    const style = document.createElement('style');
    style.textContent = `
        .ssg-guarded { position:relative; }
        .ssg-blurred { filter:blur(16px); transition:filter .15s ease; pointer-events:none; user-select:none; }
        .ssg-watermark { position:absolute; inset:0; pointer-events:none; z-index:5; overflow:hidden;
            display:flex; flex-wrap:wrap; align-content:space-around; justify-content:space-around;
            opacity:.07; transform:rotate(-28deg) scale(1.3); }
        .ssg-watermark span { font-size:13px; font-weight:800; color:#000; white-space:nowrap; padding:18px 26px; }
    `;
    document.head.appendChild(style);
}

/**
 * Arm screenshot deterrents on `container` — blocks the interceptable
 * keyboard shortcuts and overlays an identity watermark. Call
 * disarmScreenshotGuard() when the screen closes.
 */
export function armScreenshotGuard(container) {
    if (!container) return;
    injectStyles();
    disarmScreenshotGuard();

    target = container;
    target.classList.add('ssg-guarded');

    const me = Auth.user() || {};
    const label = `${me.name || `${me.first_name || ''} ${me.last_name || ''}`.trim() || 'Student'} · ${me.student_id || me.users_id || ''} · ${new Date().toLocaleString()}`;
    watermarkEl = document.createElement('div');
    watermarkEl.className = 'ssg-watermark';
    watermarkEl.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 24; i++) {
        const span = document.createElement('span');
        span.textContent = label;
        watermarkEl.appendChild(span);
    }
    target.appendChild(watermarkEl);

    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('blur', onWindowBlur);
    armed = true;
}

export function disarmScreenshotGuard() {
    if (!armed) return;
    document.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('blur', onWindowBlur);
    clearTimeout(blurTimer);
    target?.classList.remove('ssg-guarded', 'ssg-blurred');
    watermarkEl?.remove();
    watermarkEl = null;
    target = null;
    armed = false;
}
