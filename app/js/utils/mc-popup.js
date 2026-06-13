/**
 * In-app modal popups (replaces browser alert/confirm in instructor flows).
 */

let stylesInjected = false;

function injectStyles() {
    if (stylesInjected) return;
    stylesInjected = true;
    const style = document.createElement('style');
    style.textContent = `
        .mc-popup-overlay { position:fixed; inset:0; background:rgba(15,23,42,.55); backdrop-filter:blur(4px);
            display:flex; align-items:center; justify-content:center; z-index:4000; padding:20px; animation:mcFadeIn .2s ease; }
        .mc-popup { background:#fff; border-radius:16px; padding:28px 24px 22px; max-width:400px; width:100%;
            text-align:center; box-shadow:0 20px 50px rgba(0,0,0,.2); animation:mcSlideUp .25s ease; }
        .mc-popup-icon { margin-bottom:12px; display:flex; justify-content:center; }
        .mc-popup-title { font-size:18px; font-weight:800; color:#111; margin:0 0 8px; }
        .mc-popup-msg { font-size:14px; color:#4B5563; margin:0 0 20px; line-height:1.5; }
        .mc-popup-ok { width:100%; justify-content:center; padding:10px 20px; border:none; border-radius:8px;
            background:#00461B; color:#fff; font-weight:600; cursor:pointer; font-size:14px; }
        .mc-popup-ok:hover { background:#003515; }
        @keyframes mcFadeIn { from { opacity:0; } to { opacity:1; } }
        @keyframes mcSlideUp { from { transform:translateY(12px); opacity:0; } to { transform:none; opacity:1; } }
    `;
    document.head.appendChild(style);
}

function esc(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
}

export function showMcPopup(message, { title = 'Notice', type = 'info', onClose } = {}) {
    injectStyles();
    const iconMap = {
        success: '<svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="#059669" stroke-width="2"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="10"/></svg>',
        error: '<svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="#DC2626" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>',
        info: '<svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="#00461B" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>',
    };
    const overlay = document.createElement('div');
    overlay.className = 'mc-popup-overlay';
    overlay.innerHTML = `
        <div class="mc-popup mc-popup-${type}" role="dialog" aria-modal="true">
            <div class="mc-popup-icon">${iconMap[type] || iconMap.info}</div>
            <h4 class="mc-popup-title">${esc(title)}</h4>
            <p class="mc-popup-msg">${esc(message)}</p>
            <button type="button" class="mc-popup-ok">OK</button>
        </div>
    `;
    const close = () => {
        overlay.remove();
        onClose?.();
    };
    overlay.querySelector('.mc-popup-ok').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    document.body.appendChild(overlay);
    return close;
}
