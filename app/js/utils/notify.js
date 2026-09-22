import { esc } from './classroom-ui.js';
/**
 * notify.js — system-wide popup notifications
 *
 * Usage:
 *   import { notify } from '../utils/notify.js';
 *   notify.success('Saved!');
 *   notify.error('Something went wrong.');
 *   notify.warning('Check your input.');
 *   notify.info('Loading data…');
 *
 *   // Confirmation dialog (returns Promise<boolean>)
 *   const ok = await notify.confirm('Delete this item?', { confirmText: 'Delete', danger: true });
 *   if (ok) { ... }
 */

const ICONS = {
    success: `<svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`,
    error:   `<svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2"><path stroke-linecap="round" stroke-linejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`,
    warning: `<svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>`,
    info:    `<svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`,
};

const COLORS = {
    success: { bg: '#f0fdf4', border: '#86efac', icon: '#16a34a', text: '#166534' },
    error:   { bg: '#fef2f2', border: '#fca5a5', icon: '#dc2626', text: '#991b1b' },
    warning: { bg: '#fffbeb', border: '#fcd34d', icon: '#d97706', text: '#92400e' },
    info:    { bg: '#eff6ff', border: '#93c5fd', icon: '#2563eb', text: '#1e40af' },
};

function ensureContainer() {
    let c = document.getElementById('nfy-container');
    if (!c) {
        c = document.createElement('div');
        c.id = 'nfy-container';
        c.style.cssText = [
            'position:fixed', 'top:20px', 'right:20px', 'z-index:99999',
            'display:flex', 'flex-direction:column', 'gap:10px',
            'pointer-events:none', 'max-width:360px', 'width:calc(100vw - 40px)',
        ].join(';');
        document.body.appendChild(c);
    }
    return c;
}

function toast(type, message, duration = 4000) {
    // The "Not allowed" popup (api.js) already told the user — skip the echo.
    const blk = window.__cocBlocked;
    if (blk && blk.msg === message && Date.now() - blk.at < 4000) return;
    const c   = ensureContainer();
    const col = COLORS[type] || COLORS.info;

    const el = document.createElement('div');
    el.style.cssText = [
        'display:flex', 'align-items:flex-start', 'gap:12px',
        `background:${col.bg}`, `border:1px solid ${col.border}`,
        'border-radius:12px', 'padding:14px 16px',
        'box-shadow:0 4px 20px rgba(0,0,0,.12)',
        'pointer-events:all', 'animation:nfyIn .25s ease',
        'min-width:260px',
    ].join(';');

    el.innerHTML = `
        <span style="color:${col.icon};flex-shrink:0;margin-top:1px">${ICONS[type]||ICONS.info}</span>
        <span style="flex:1;font-size:13.5px;font-weight:500;color:${col.text};line-height:1.45;word-break:break-word">${esc(message)}</span>
        <button style="background:none;border:none;cursor:pointer;color:${col.icon};opacity:.6;padding:0;margin-left:4px;flex-shrink:0;line-height:1;font-size:18px" aria-label="Dismiss">&times;</button>
    `;

    if (!document.getElementById('nfy-style')) {
        const s = document.createElement('style');
        s.id = 'nfy-style';
        s.textContent = `@keyframes nfyIn{from{opacity:0;transform:translateX(24px)}to{opacity:1;transform:none}}@keyframes nfyOut{from{opacity:1;transform:none}to{opacity:0;transform:translateX(24px)}}`;
        document.head.appendChild(s);
    }

    const dismiss = () => {
        el.style.animation = 'nfyOut .2s ease forwards';
        setTimeout(() => el.remove(), 200);
    };

    el.querySelector('button').addEventListener('click', dismiss);
    c.appendChild(el);

    if (duration > 0) setTimeout(dismiss, duration);
    return el;
}

/**
 * Show a confirmation dialog. Returns Promise<boolean>.
 *
 * Options:
 *   title        — modal heading (default: "Are you sure?")
 *   confirmText  — confirm button label (default: "Confirm")
 *   cancelText   — cancel button label (default: "Cancel")
 *   danger       — if true, confirm button is red
 */
function confirm(message, {
    title       = 'Are you sure?',
    confirmText = 'Confirm',
    cancelText  = 'Cancel',
    danger      = false,
} = {}) {
    return new Promise(resolve => {
        const backdrop = document.createElement('div');
        backdrop.style.cssText = [
            'position:fixed', 'inset:0', 'background:rgba(0,0,0,.45)',
            'z-index:100000', 'display:flex', 'align-items:center',
            'justify-content:center', 'padding:20px', 'animation:nfyIn .18s ease',
        ].join(';');

        const confirmBg = danger ? '#dc2626' : '#00461B';
        const confirmHv = danger ? '#b91c1c' : '#006428';

        backdrop.innerHTML = `
        <div style="background:#fff;border-radius:16px;width:100%;max-width:420px;box-shadow:0 12px 48px rgba(0,0,0,.2);overflow:hidden;animation:nfyIn .2s ease">
            <div style="padding:22px 24px 0">
                <p style="font-size:16px;font-weight:700;color:#111827;margin:0 0 8px">${esc(title)}</p>
                <p style="font-size:14px;color:#4b5563;margin:0;line-height:1.5">${esc(message)}</p>
            </div>
            <div style="display:flex;justify-content:flex-end;gap:10px;padding:20px 24px">
                <button id="nfy-cancel" style="padding:9px 18px;border:1px solid #e5e7eb;border-radius:8px;background:#fff;font-size:14px;font-weight:600;cursor:pointer;color:#374151">${esc(cancelText)}</button>
                <button id="nfy-ok"     style="padding:9px 20px;border:none;border-radius:8px;background:${confirmBg};color:#fff;font-size:14px;font-weight:700;cursor:pointer">${esc(confirmText)}</button>
            </div>
        </div>`;

        const close = (result) => {
            backdrop.style.animation = 'nfyOut .15s ease forwards';
            setTimeout(() => backdrop.remove(), 150);
            resolve(result);
        };

        backdrop.querySelector('#nfy-cancel').addEventListener('click', () => close(false));
        backdrop.querySelector('#nfy-ok').addEventListener('click',     () => close(true));
        backdrop.addEventListener('click', e => { if (e.target === backdrop) close(false); });

        // Hover effect on confirm button
        const okBtn = backdrop.querySelector('#nfy-ok');
        okBtn.addEventListener('mouseenter', () => okBtn.style.background = confirmHv);
        okBtn.addEventListener('mouseleave', () => okBtn.style.background = confirmBg);

        document.body.appendChild(backdrop);
        setTimeout(() => backdrop.querySelector('#nfy-ok')?.focus(), 50);
    });
}

// ── Centered "big icon" alert modal — success/failure confirmations ────────
// (a circular icon, bold title, description, single OK button) — distinct
// from toast() (corner notification) and confirm() (Yes/No dialog). Returns
// Promise<void>, resolved when the user dismisses it.

const ALERT_ICONS = {
    success: `<svg width="36" height="36" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.4"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>`,
    error:   `<svg width="36" height="36" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.4"><path stroke-linecap="round" stroke-linejoin="round" d="M6 6l12 12M18 6L6 18"/></svg>`,
    warning: `<svg width="36" height="36" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.4"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v5m0 3.5h.01"/></svg>`,
    info:    `<svg width="36" height="36" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.4"><path stroke-linecap="round" stroke-linejoin="round" d="M12 11v5.5m0-9v.01"/></svg>`,
};

const ALERT_COLORS = {
    success: { ring: '#00461B', icon: '#00461B', btn: '#00461B', btnHv: '#006428' }, // dark green — app brand green
    error:   { ring: '#7F1D1D', icon: '#7F1D1D', btn: '#7F1D1D', btnHv: '#5C1414' }, // dark red
    warning: { ring: '#78350F', icon: '#78350F', btn: '#78350F', btnHv: '#57260A' }, // dark amber/brown
    info:    { ring: '#1E3A8A', icon: '#1E3A8A', btn: '#1E3A8A', btnHv: '#152A63' }, // dark blue
};

/**
 * @param {string} message
 * @param {{ title?: string, type?: 'success'|'error'|'warning'|'info', okText?: string }} [opts]
 * @returns {Promise<void>} resolves when dismissed (OK, backdrop click, or Escape)
 */
function alertModal(message, { title = '', type = 'info', okText = 'OK' } = {}) {
    const col  = ALERT_COLORS[type] || ALERT_COLORS.info;
    const icon = ALERT_ICONS[type]  || ALERT_ICONS.info;

    return new Promise(resolve => {
        const backdrop = document.createElement('div');
        backdrop.style.cssText = [
            'position:fixed', 'inset:0', 'background:rgba(0,0,0,.45)',
            'z-index:100000', 'display:flex', 'align-items:center',
            'justify-content:center', 'padding:20px', 'animation:nfyIn .18s ease',
        ].join(';');

        backdrop.innerHTML = `
        <div style="background:#fff;border-radius:18px;width:100%;max-width:380px;padding:34px 28px 26px;
            box-shadow:0 16px 56px rgba(0,0,0,.22);text-align:center;animation:nfyIn .2s ease">
            <div style="width:78px;height:78px;margin:0 auto 20px;border-radius:50%;
                border:2.5px solid ${col.ring};display:flex;align-items:center;justify-content:center">
                <span style="color:${col.icon};display:flex">${icon}</span>
            </div>
            ${title ? `<p style="font-size:19px;font-weight:800;color:#111827;margin:0 0 10px;line-height:1.3">${esc(title)}</p>` : ''}
            <p style="font-size:14px;color:#4b5563;margin:0 0 26px;line-height:1.6">${esc(message)}</p>
            <button id="nfy-alert-ok" style="padding:11px 40px;min-width:130px;border:none;border-radius:9px;
                background:${col.btn};color:#fff;font-size:14.5px;font-weight:700;cursor:pointer;transition:background .15s">${esc(okText)}</button>
        </div>`;

        const close = () => {
            backdrop.style.animation = 'nfyOut .15s ease forwards';
            setTimeout(() => backdrop.remove(), 150);
            document.removeEventListener('keydown', onKey);
            resolve();
        };
        const onKey = (e) => { if (e.key === 'Escape' || e.key === 'Enter') close(); };

        const okBtn = backdrop.querySelector('#nfy-alert-ok');
        okBtn.addEventListener('click', close);
        okBtn.addEventListener('mouseenter', () => okBtn.style.background = col.btnHv);
        okBtn.addEventListener('mouseleave', () => okBtn.style.background = col.btn);
        backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });
        document.addEventListener('keydown', onKey);

        document.body.appendChild(backdrop);
        setTimeout(() => okBtn.focus(), 50);
    });
}

// esc() imported from classroom-ui.js (see import above)


export const notify = {
    success: (msg, ms) => toast('success', msg, ms),
    error:   (msg, ms) => toast('error',   msg, ms),
    warning: (msg, ms) => toast('warning', msg, ms),
    info:    (msg, ms) => toast('info',    msg, ms),
    confirm,
    // Big-icon centered "OK" modal — for a single important confirmation
    // (registration submitted, action succeeded/failed) rather than a
    // passing corner toast. e.g. notify.alert('Your request was submitted.',
    // { title: 'Submitted', type: 'success' })
    alert: alertModal,
};
