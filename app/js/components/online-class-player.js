/**
 * Online Class — LMS WebRTC live classroom
 */
import { Auth } from '../auth.js';
import { Api } from '../api.js';
import { getFullName } from '../utils/user-display.js';

// Fallback only — the join response carries the real list, including a TURN
// relay when one is set in .env (needed for phones on mobile data).
const DEFAULT_ICE_SERVERS = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] },
];

const REACTIONS = ['👍', '❤️', '😂', '😮', '👏', '🎉', '🙏', '🤔'];

/** Short random id for one RTCPeerConnection, so signals meant for an old,
 *  replaced connection can be told apart from the current one. */
function newCid() {
    return Math.random().toString(36).slice(2, 10);
}

const ICONS = {
    mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>',
    micOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>',
    cam: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>',
    camOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10"/><line x1="1" y1="1" x2="23" y2="23"/></svg>',
    screen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>',
    screenStop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/><line x1="4" y1="4" x2="20" y2="16"/></svg>',
    chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    minimize: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    fullscreen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>',
    shrink: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/></svg>',
    // Distinct from `fullscreen` on purpose: this one means "back to the
    // normal window", not "take over the whole display".
    expand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M15 3h6v6M10 14L21 3M9 21H3v-6M3 21l7-7"/></svg>',
    grip: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="5" r="1.7"/><circle cx="15" cy="5" r="1.7"/><circle cx="9" cy="12" r="1.7"/><circle cx="15" cy="12" r="1.7"/><circle cx="9" cy="19" r="1.7"/><circle cx="15" cy="19" r="1.7"/></svg>',
    video: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>',
    hand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 11V6a2 2 0 0 0-4 0v5"/><path d="M14 10V4a2 2 0 0 0-4 0v6"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>',
    people: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    smile: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>',
};

function setBtnIcon(btn, iconHtml) {
    if (btn) btn.innerHTML = iconHtml;
}

let rootEl = null;
let session = null;
let state = { mode: 'closed', room: '', title: '', subtitle: '', role: 'student', classActive: true };

function isHostRole(role) {
    return role === 'instructor' || role === 'admin' || role === 'dean';
}

function nameOnly(name) {
    const s = String(name || '').trim();
    const m = s.match(/^(.+?)\s*\([^)]+\)\s*$/);
    return (m ? m[1] : s).trim() || 'User';
}

function nameInitials(name) {
    const parts = nameOnly(name).split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return (parts[0]?.[0] || '?').toUpperCase();
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatTime(ts) {
    try {
        return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
        return '';
    }
}

function showToast(message, type = 'info') {
    let host = document.getElementById('ocp-toast-host');
    if (!host) {
        host = document.createElement('div');
        host.id = 'ocp-toast-host';
        host.className = 'ocp-toast-host';
        document.body.appendChild(host);
    }
    const toast = document.createElement('div');
    toast.className = `ocp-toast ocp-toast--${type}`;
    toast.innerHTML = `<span>${escapeHtml(message)}</span>`;
    host.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('ocp-toast--show'));
    setTimeout(() => {
        toast.classList.remove('ocp-toast--show');
        setTimeout(() => toast.remove(), 300);
    }, 4200);
}

function showConfirmModal({ title, message, confirmText = 'Confirm', onConfirm }) {
    const overlay = document.createElement('div');
    overlay.className = 'ocp-modal-overlay';
    overlay.innerHTML = `
        <div class="ocp-modal" role="dialog">
            <h4>${escapeHtml(title)}</h4>
            <p>${escapeHtml(message)}</p>
            <div class="ocp-modal-actions">
                <button type="button" class="ocp-btn" data-cancel>Cancel</button>
                <button type="button" class="ocp-btn end" data-confirm>${escapeHtml(confirmText)}</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector('[data-cancel]')?.addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.querySelector('[data-confirm]')?.addEventListener('click', () => {
        close();
        onConfirm?.();
    });
}

function injectStyles() {
    if (document.getElementById('ocp-styles')) return;
    const s = document.createElement('style');
    s.id = 'ocp-styles';
    s.textContent = `
        /* Must clear the app sidebar (z-index 1000, pinned to the left edge)
           while staying under .modal-overlay (2000). Parked at 980, the
           minimized player sat UNDERNEATH the nav drawer with its header
           sliced off. */
        #ocp-root { position:fixed; z-index:1200; pointer-events:none; }
        #ocp-root.ocp-active { pointer-events:auto; }
        .ocp-backdrop {
            position:fixed; inset:0; background:rgba(0,0,0,.5);
            opacity:0; visibility:hidden; transition:opacity .2s;
        }
        #ocp-root.ocp-normal .ocp-backdrop,
        #ocp-root.ocp-fullscreen .ocp-backdrop { opacity:1; visibility:visible; }
        .ocp-shell {
            position:fixed; background:#111; color:#fff;
            display:flex; flex-direction:column; overflow:hidden;
            box-shadow:0 24px 60px rgba(0,0,0,.4);
            transition:width .25s, height .25s, bottom .25s, right .25s, border-radius .25s;
        }
        #ocp-root.ocp-normal .ocp-shell {
            left:50%; top:50%; transform:translate(-50%,-50%);
            width:min(96vw, 1200px); height:min(88vh, 760px); border-radius:16px;
        }
        #ocp-root.ocp-fullscreen .ocp-shell {
            inset:0; width:100%; height:100%; border-radius:0; transform:none;
        }
        /* Bottom-RIGHT by default: the left edge belongs to the sidebar, and
           parking here meant the mini player opened on top of the nav every
           time. Drag moves it via inline left/top, which override these. */
        #ocp-root.ocp-minimized .ocp-shell {
            bottom:24px; right:24px; left:auto; top:auto; transform:none;
            width:min(340px, calc(100vw - 32px)); height:212px;
            border-radius:14px; border:2px solid #00461B;
            box-shadow:0 14px 36px rgba(0,0,0,.45);
        }
        /* The header is the drag handle. At 340px the full toolbar does not
           fit -- it used to wrap and shear the window apart (End Class spilling
           out mid-word), so the controls that need room are hidden until the
           player is expanded again. */
        #ocp-root.ocp-minimized .ocp-head {
            padding:6px 8px; min-height:34px; cursor:grab; touch-action:none;
            transition:background .15s;
        }
        /* Nothing about a plain title bar says "you can drag me", so the grip
           dots and a lift in the background do the telling on hover. */
        #ocp-root.ocp-minimized .ocp-head:hover { background:#252525; }
        #ocp-root.ocp-minimized.ocp-dragging .ocp-head { cursor:grabbing; background:#2d2d2d; }
        .ocp-grip { display:none; }
        #ocp-root.ocp-minimized .ocp-grip {
            display:inline-flex; align-items:center; justify-content:center;
            flex-shrink:0; width:13px; height:20px; margin-right:1px;
            color:rgba(255,255,255,.3); transition:color .15s;
        }
        #ocp-root.ocp-minimized .ocp-grip svg { width:13px; height:20px; }
        #ocp-root.ocp-minimized .ocp-head:hover .ocp-grip,
        #ocp-root.ocp-minimized.ocp-dragging .ocp-grip { color:rgba(255,255,255,.85); }
        #ocp-root.ocp-minimized .ocp-head-text h3 { font-size:11.5px; }
        #ocp-root.ocp-minimized .ocp-head-text p,
        #ocp-root.ocp-minimized .ocp-id-badge { display:none; }
        #ocp-root.ocp-minimized .ocp-actions { flex-wrap:nowrap; gap:3px; }
        #ocp-root.ocp-minimized .ocp-btn { padding:5px 7px; font-size:11px; }
        #ocp-root.ocp-minimized #ocp-share,
        #ocp-root.ocp-minimized #ocp-chat-toggle,
        #ocp-root.ocp-minimized #ocp-fs,
        #ocp-root.ocp-minimized #ocp-end { display:none; }
        #ocp-root.ocp-minimized .ocp-chat { display:none; }
        /* Dragging must track the pointer exactly, not ease behind it. */
        #ocp-root.ocp-dragging .ocp-shell { transition:none; }
        @media(max-width:640px) {
            #ocp-root.ocp-minimized .ocp-shell {
                bottom:16px; right:16px; width:min(280px, calc(100vw - 32px)); height:176px;
            }
            #ocp-root.ocp-normal .ocp-shell { width:100vw; height:100vh; border-radius:0; }
        }
        .ocp-head {
            display:flex; align-items:center; justify-content:space-between; gap:8px;
            padding:10px 12px; background:#1a1a1a; flex-shrink:0; min-height:48px;
        }
        .ocp-head-text { min-width:0; flex:1; }
        .ocp-head-text h3 {
            font-size:13px; font-weight:700; margin:0 0 2px;
            white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
        }
        .ocp-head-text p { font-size:11px; opacity:.75; margin:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .ocp-id-badge {
            display:inline-block; margin-top:4px; font-size:10px; font-weight:700;
            background:rgba(34,197,94,.2); color:#86EFAC; padding:2px 8px; border-radius:20px;
        }
        .ocp-id-badge.mod { background:rgba(0,70,27,.55); color:#BBF7D0; }
        .ocp-actions { display:flex; gap:6px; flex-shrink:0; flex-wrap:wrap; justify-content:flex-end; }
        .ocp-btn {
            border:none; cursor:pointer; border-radius:8px;
            font-size:12px; font-weight:700; padding:7px 10px;
            color:#fff; background:rgba(255,255,255,.12);
        }
        .ocp-btn:hover { background:rgba(255,255,255,.22); }
        .ocp-btn.on { background:#00461B; }
        .ocp-btn.share.on { background:#1D4ED8; }
        .ocp-btn.off { background:rgba(220,38,38,.35); }
        .ocp-icon-btn {
            display:inline-flex; align-items:center; justify-content:center;
            width:36px; height:36px; padding:0;
        }
        .ocp-icon-btn svg { width:18px; height:18px; display:block; }
        .ocp-chat-form button {
            display:inline-flex; align-items:center; justify-content:center;
            min-width:40px; padding:8px;
        }
        .ocp-chat-form button svg { width:16px; height:16px; }
        .ocp-btn.leave { background:#DC2626; }
        .ocp-btn.leave:hover { background:#B91C1C; }
        .ocp-btn.end { background:#B45309; }
        .ocp-body { flex:1; min-height:0; display:flex; overflow:hidden; }
        .ocp-main { flex:1; min-width:0; display:flex; flex-direction:column; min-height:0; }
        .ocp-frame-wrap { flex:1; min-height:0; background:#000; position:relative; overflow:hidden; }
        .ocp-video-grid {
            /* border-box: width 100% + 6px padding used to push the last
               tile past the right edge on phones */
            box-sizing:border-box;
            width:100%; height:100%; display:grid; gap:6px; padding:6px;
            grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));
            align-content:center; overflow:auto;
        }
        .ocp-tile {
            position:relative; background:#1f2937; border-radius:10px;
            overflow:hidden; aspect-ratio:16/10; min-height:120px;
        }
        .ocp-tile video {
            width:100%; height:100%; object-fit:cover; background:transparent;
        }
        .ocp-tile-avatar {
            position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
            background:#00461B;
            font-size:clamp(24px, 5vw, 42px); font-weight:800; color:#fff; letter-spacing:.04em;
        }
        .ocp-tile.has-video .ocp-tile-avatar { display:none; }
        /* the person switched their camera off — show initials, not a frozen frame */
        .ocp-tile.cam-off .ocp-tile-avatar { display:flex !important; }
        .ocp-tile.cam-off video { visibility:hidden; }
        .ocp-tile-label {
            position:absolute; left:8px; bottom:8px; font-size:11px; font-weight:700;
            background:rgba(0,0,0,.55); padding:3px 8px; border-radius:20px;
            max-width:calc(100% - 16px); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
        }
        .ocp-tile-badge {
            position:absolute; top:8px; left:8px; font-size:10px; font-weight:700;
            background:rgba(29,78,216,.85); padding:2px 8px; border-radius:20px;
        }
        .ocp-tile--local { outline:2px solid #00461B; }
        .ocp-tile-hand {
            position:absolute; top:8px; right:8px; z-index:2; display:none;
            align-items:center; gap:4px; background:#F59E0B; color:#111;
            font-size:12px; font-weight:800; padding:4px 9px; border-radius:20px;
            border:0; cursor:default; line-height:1;
        }
        .ocp-tile.hand-up .ocp-tile-hand { display:inline-flex; animation:ocp-hand .5s ease 2; }
        .ocp-tile.hand-up { outline:3px solid #F59E0B; }
        .ocp-tile-hand.can-lower { cursor:pointer; }
        @keyframes ocp-hand { 0%,100% { transform:rotate(0) } 30% { transform:rotate(-14deg) } 70% { transform:rotate(14deg) } }
        .ocp-btn.hand-on { background:#F59E0B; color:#111; }
        .ocp-react-layer { position:absolute; inset:0; pointer-events:none; overflow:hidden; z-index:6; }
        .ocp-react {
            position:absolute; bottom:12px; display:flex; flex-direction:column; align-items:center;
            animation:ocp-float 3.2s ease-out forwards;
        }
        .ocp-react span.e { font-size:38px; line-height:1; }
        .ocp-react span.n {
            margin-top:4px; font-size:11px; font-weight:700; color:#fff;
            background:rgba(0,0,0,.6); padding:2px 8px; border-radius:20px; white-space:nowrap;
        }
        @keyframes ocp-float {
            0% { transform:translateY(0) scale(.6); opacity:0 }
            12% { transform:translateY(-20px) scale(1.1); opacity:1 }
            80% { opacity:1 }
            100% { transform:translateY(-260px) scale(1); opacity:0 }
        }
        .ocp-emoji-pop {
            position:absolute; z-index:20; display:none; gap:4px; padding:6px;
            background:#fff; border:2px solid #111; border-radius:30px; box-shadow:0 10px 30px rgba(0,0,0,.35);
        }
        .ocp-emoji-pop.open { display:flex; }
        .ocp-emoji-pop { flex-wrap:wrap; justify-content:center; max-width:calc(100% - 16px); border-radius:22px; }
        .ocp-emoji-pop button {
            border:0; background:transparent; font-size:24px; width:40px; height:40px;
            border-radius:50%; cursor:pointer; line-height:1;
        }
        .ocp-emoji-pop button:hover { background:#F3F4F6; transform:scale(1.15); }
        .ocp-hands-bar {
            position:absolute; left:50%; top:12px; transform:translateX(-50%); z-index:5;
            background:#F59E0B; color:#111; font-size:12px; font-weight:800;
            padding:6px 12px; border-radius:20px; display:none; max-width:90%;
            white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
        }
        .ocp-hands-bar.visible { display:block; }
        .ocp-sound-tip {
            position:absolute; left:50%; bottom:14px; transform:translateX(-50%); z-index:7;
            background:#fff; color:#111; border:2px solid #111; border-radius:20px;
            font-size:12px; font-weight:700; padding:7px 14px; cursor:pointer; display:none;
        }
        .ocp-sound-tip.visible { display:block; }
        .ocp-btn-count {
            position:absolute; top:-5px; right:-5px; min-width:17px; height:17px; padding:0 4px;
            border-radius:9px; background:#fff; color:#111; font-size:10px; font-weight:800;
            display:flex; align-items:center; justify-content:center; border:1px solid #111;
        }
        #ocp-people { position:relative; }
        .ocp-tabs { display:flex; border-bottom:1px solid #2a2a2a; flex-shrink:0; }
        .ocp-tab {
            flex:1; border:0; background:transparent; color:#9CA3AF; font-size:12px; font-weight:700;
            padding:11px 8px; cursor:pointer; border-bottom:2px solid transparent;
        }
        .ocp-tab.active { color:#fff; border-bottom-color:#22C55E; }
        .ocp-pane { flex:1; min-height:0; display:flex; flex-direction:column; }
        .ocp-pane[hidden] { display:none; }
        .ocp-people { flex:1; overflow-y:auto; padding:6px 10px 12px; }
        .ocp-people-head {
            display:flex; align-items:center; justify-content:space-between; gap:8px;
            margin:12px 0 6px; font-size:11px; font-weight:800; color:#9CA3AF; text-transform:uppercase; letter-spacing:.04em;
        }
        .ocp-people-head .ocp-mini { text-transform:none; letter-spacing:0; }
        .ocp-person { display:flex; align-items:center; gap:9px; padding:7px 0; border-bottom:1px solid #222; }
        .ocp-person-av {
            width:30px; height:30px; flex-shrink:0; border-radius:50%; background:#00461B; color:#fff;
            display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:800;
        }
        .ocp-person.absent .ocp-person-av { background:#374151; }
        .ocp-person-info { flex:1; min-width:0; }
        .ocp-person-name { font-size:12.5px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .ocp-person-sub { font-size:10.5px; color:#9CA3AF; margin-top:1px; }
        .ocp-person-icons { display:flex; gap:4px; flex-shrink:0; align-items:center; }
        .ocp-person-icons svg { width:15px; height:15px; color:#F87171; }
        .ocp-person-icons .hand { font-size:14px; }
        .ocp-person-actions { display:flex; gap:4px; flex-shrink:0; }
        .ocp-mini {
            border:1px solid #4B5563; background:transparent; color:#fff; border-radius:6px;
            font-size:10.5px; font-weight:700; padding:4px 7px; cursor:pointer; white-space:nowrap;
        }
        .ocp-mini:hover { background:#262626; }
        .ocp-mini:disabled { opacity:.4; cursor:default; }
        .ocp-mini.primary { background:#00461B; border-color:#00461B; }
        .ocp-people-empty { font-size:11.5px; color:#6B7280; padding:6px 0; }
        #ocp-root.ocp-minimized #ocp-people,
        #ocp-root.ocp-minimized #ocp-hand,
        #ocp-root.ocp-minimized #ocp-emoji,
        #ocp-root.ocp-minimized .ocp-emoji-pop,
        #ocp-root.ocp-minimized .ocp-hands-bar { display:none; }
        .ocp-chat {
            width:300px; flex-shrink:0; background:#161616; border-left:1px solid #2a2a2a;
            display:flex; flex-direction:column; min-height:0;
        }
        .ocp-chat-head {
            padding:10px 12px; font-size:12px; font-weight:700; border-bottom:1px solid #2a2a2a;
            display:flex; align-items:center; justify-content:space-between;
        }
        .ocp-chat-msgs { flex:1; overflow-y:auto; padding:10px; display:flex; flex-direction:column; gap:8px; }
        .ocp-chat-msg { font-size:12px; line-height:1.45; }
        .ocp-chat-msg strong { color:#BBF7D0; font-weight:700; }
        .ocp-chat-msg time { display:block; font-size:10px; opacity:.5; margin-top:2px; }
        .ocp-chat-form {
            padding:10px; border-top:1px solid #2a2a2a; display:flex; gap:6px;
        }
        .ocp-chat-form input {
            flex:1; border:1px solid #333; background:#222; color:#fff; border-radius:8px;
            padding:8px 10px; font-size:12px; outline:none;
        }
        .ocp-chat-form input:focus { border-color:#00461B; }
        .ocp-chat-form input:disabled { opacity:.5; cursor:not-allowed; }
        .ocp-chat-form button {
            border:none; background:#00461B; color:#fff; border-radius:8px;
            padding:8px 12px; font-size:12px; font-weight:700; cursor:pointer;
        }
        .ocp-chat-form button:disabled { opacity:.45; cursor:not-allowed; }
        .ocp-chat-closed { padding:8px 12px; font-size:11px; color:#FCA5A5; border-top:1px solid #2a2a2a; }
        .ocp-loading {
            position:absolute; inset:0; display:flex; flex-direction:column;
            align-items:center; justify-content:center; background:#000;
            color:#9CA3AF; font-size:13px; gap:10px; z-index:2;
        }
        .ocp-loading-spinner {
            width:22px; height:22px; border:2px solid rgba(255,255,255,.15);
            border-top-color:#86EFAC; border-radius:50%; animation:ocp-spin .6s linear infinite;
        }
        @keyframes ocp-spin { to { transform:rotate(360deg); } }
        .ocp-error { color:#FCA5A5; text-align:center; padding:0 20px; max-width:360px; line-height:1.5; }
        .ocp-waiting {
            position:absolute; top:12px; left:50%; transform:translateX(-50%); z-index:4;
            background:rgba(0,70,27,.92); color:#fff; padding:8px 14px; border-radius:20px;
            font-size:12px; font-weight:700; display:none; align-items:center; gap:8px;
        }
        .ocp-waiting.visible { display:flex; }
        .ocp-toast-host {
            position:fixed; top:20px; right:20px; z-index:10001;
            display:flex; flex-direction:column; gap:8px; pointer-events:none;
        }
        .ocp-toast {
            background:#00461B; color:#fff; padding:12px 16px; border-radius:10px;
            font-size:13px; font-weight:600; box-shadow:0 8px 24px rgba(0,0,0,.25);
            opacity:0; transform:translateX(20px); transition:opacity .25s, transform .25s;
            max-width:320px;
        }
        .ocp-toast--show { opacity:1; transform:translateX(0); }
        .ocp-toast--warn { background:#B45309; }
        .ocp-toast--error { background:#991B1B; }
        .ocp-modal-overlay {
            position:fixed; inset:0; background:rgba(0,0,0,.55); z-index:10002;
            display:flex; align-items:center; justify-content:center; padding:20px;
        }
        .ocp-modal {
            background:#fff; color:#111; border-radius:14px; padding:22px;
            width:min(100%, 380px); box-shadow:0 20px 50px rgba(0,0,0,.3);
        }
        .ocp-modal h4 { margin:0 0 8px; font-size:16px; }
        .ocp-modal p { margin:0 0 18px; font-size:14px; color:#4B5563; line-height:1.5; }
        .ocp-modal-actions { display:flex; justify-content:flex-end; gap:8px; }
        .ocp-modal-actions .ocp-btn { color:#111; background:#E5E7EB; }
        @media(max-width:800px) {
            .ocp-chat { width:100%; position:absolute; right:0; top:0; bottom:0; z-index:3;
                transform:translateX(100%); transition:transform .25s; }
            #ocp-root.ocp-chat-open .ocp-chat { transform:translateX(0); }
        }
        @media(max-width:640px) {
            #ocp-root:not(.ocp-minimized) .ocp-actions {
                position:absolute; left:0; right:0; bottom:0; z-index:8;
                justify-content:center; flex-wrap:wrap; gap:6px;
                padding:8px 8px calc(8px + env(safe-area-inset-bottom));
                background:#1a1a1a; border-top:1px solid #2a2a2a;
            }
            #ocp-root:not(.ocp-minimized) .ocp-actions { gap:5px; }
            #ocp-root:not(.ocp-minimized) .ocp-icon-btn { width:38px; height:40px; }
            #ocp-root:not(.ocp-minimized) .ocp-btn.leave,
            #ocp-root:not(.ocp-minimized) .ocp-btn.end { height:40px; padding:0 10px; }
            /* toasts sit above the bottom bar instead of over the title */
            .ocp-toast-host { top:auto; bottom:78px; left:16px; right:16px; align-items:center; }
            #ocp-root:not(.ocp-minimized) .ocp-body { padding-bottom:62px; }
            #ocp-root:not(.ocp-minimized) .ocp-chat { top:0; bottom:62px; }
            #ocp-root:not(.ocp-minimized) #ocp-fs { display:none; }
            .ocp-video-grid { grid-template-columns:repeat(auto-fit, minmax(140px, 1fr)); }
        }
    `;
    document.head.appendChild(s);
}

function bindTrackVisibility(tile, video, track) {
    if (!tile) return;
    // Only a VIDEO track can decide this. ontrack fires for the audio track
    // too, and binding to it was one reason a live camera showed as initials.
    if (track && track.kind !== 'video') track = null;
    const update = () => {
        const live = track && track.readyState === 'live' && track.enabled && !track.muted;
        // Some phones leave a remote track flagged "muted" even while frames
        // arrive, so decoded frames on the <video> count as live too — but
        // only frames that came AFTER the last mute, otherwise a camera that
        // was switched off would keep showing its last frozen picture.
        const frames = !!(video && video.videoWidth > 0 && !video.paused
            && track && track.readyState === 'live' && track.enabled
            && (video._ocpFrameAt || 0) > (video._ocpMutedAt || 0));
        tile.classList.toggle('has-video', !!(live || frames));
    };
    if (track) {
        track.onmute = () => { if (video) video._ocpMutedAt = performance.now(); update(); };
        track.onunmute = update;
        track.onended = update;
    }
    if (video && !video._ocpBound) {
        video._ocpBound = true;
        ['loadedmetadata', 'playing', 'resize'].forEach(ev => video.addEventListener(ev, () => {
            video._ocpFrameAt = performance.now();
            video._ocpUpdate?.();
        }));
        video.addEventListener('pause', () => video._ocpUpdate?.());
    }
    if (video) video._ocpUpdate = update;
    update();
    return update;
}

/**
 * Remote <video> elements carry sound, and browsers (iPhone Safari most of
 * all) refuse to autoplay media with sound. A blocked play() left the video
 * frozen on its first black frame. Fall back to muted playback so the face
 * shows, and offer one tap to turn the sound on.
 */
function playRemoteVideo(video) {
    if (!video) return;
    const p = video.play?.();
    if (!p || !p.catch) return;
    p.catch((err) => {
        if (err?.name !== 'NotAllowedError') return;
        video.muted = true;
        video.play?.().catch(() => {});
        rootEl?.querySelector('#ocp-sound-tip')?.classList.add('visible');
    });
}

function buildTileHtml(displayName, extraBadge = '') {
    const name = nameOnly(displayName);
    return `
        <div class="ocp-tile-avatar">${escapeHtml(nameInitials(name))}</div>
        <video autoplay playsinline></video>
        ${extraBadge}
        <button type="button" class="ocp-tile-hand" title="Hand raised">✋ <span>Hand</span></button>
        <span class="ocp-tile-label">${escapeHtml(name)}</span>
    `;
}

class WebRtcSession {
    constructor({ roomKey, subjectId, user, role, displayName, onClassEnded }) {
        this.roomKey = roomKey;
        this.subjectId = subjectId;
        this.userId = Number(user.users_id || user.id);
        this.role = role;
        this.displayName = displayName;
        this.isHost = isHostRole(role);
        this.onClassEnded = onClassEnded;
        this.localStream = null;
        this.cameraTrack = null;
        this.screenStream = null;
        this.screenTrack = null;
        this.sharingScreen = false;
        this.peers = new Map();
        this.signalSince = 0;
        this.commentSince = 0;
        this.pollTimer = null;
        this.active = false;
        this.classActive = true;
        this.audioEnabled = true;
        this.videoEnabled = true;
        this.localTileUpdate = null;
        this.joinedAt = 0;
        this.joinSignalFloor = 0;
        this.participantNames = new Map();
        this.iceServers = DEFAULT_ICE_SERVERS;
        this.handRaised = false;
        this.handsUp = new Map();        // userId -> raised (last poll)
        this.pollInFlight = false;
        this.participants = [];          // last poll, for the People list
        this.roster = null;              // host: enrolled students (in class or not)
        this.rosterAt = 0;
    }

    async start() {
        this.active = true;

        // ONE permission request for both devices, and we keep the stream it
        // returns. The previous flow asked for video, then audio, then both --
        // three getUserMedia calls, so up to three prompts and three camera
        // activations before the first frame. It also swallowed its own
        // "permissions are required" error in the very catch below it, so the
        // check could never actually stop a join; it always fell through.
        const { acquireClassMedia, showMediaHelpDialog } = await import('../utils/media-permissions.js');
        const media = await acquireClassMedia();

        if (!media.stream) {
            this.active = false;
            showMediaHelpDialog(media.reason, media.message);
            throw new Error(media.message || 'Camera and microphone are unavailable.');
        }

        // A missing or busy webcam drops us to audio-only rather than failing
        // the join -- being heard in class matters more than being seen.
        if (!media.video) {
            this.videoEnabled = false;
            showToast(media.message || 'Joining with audio only - your camera is unavailable.', 'warn');
        }

        this.localStream = media.stream;
        this.cameraTrack = this.localStream.getVideoTracks()[0] || null;
        this.attachLocalVideo();

        const joinRes = await Api.post('/VideoAPI.php?action=join', {
            room_key: this.roomKey,
            subject_id: this.subjectId,
        });
        if (!joinRes.success) {
            throw new Error(joinRes.message || 'Could not join class room');
        }

        const joinData = joinRes.data || {};
        if (Array.isArray(joinData.ice_servers) && joinData.ice_servers.length) {
            this.iceServers = joinData.ice_servers;
        }
        this.joinSignalFloor = Number(joinData.signal_since) || 0;
        if (!this.videoEnabled) this.sendMediaState();   // joined without a camera
        this.signalSince = this.joinSignalFloor;
        this.joinedAt = Date.now();

        const hostPresent = !!joinData.host_present;
        const classActive = joinData.class_active !== false;
        this.classActive = classActive;

        if (!this.isHost && !hostPresent) {
            showToast('Waiting for instructor to start class…', 'info');
            setWaitingBanner(true);
            this.closeCommentsOnly();
        } else if (!classActive) {
            this.closeCommentsOnly();
        }

        // One poll at a time. setInterval fired a new poll every 1.2s even
        // when the last one had not come back (slow hosting, weak signal),
        // so offers/answers were handled twice or out of order and the
        // connection between two devices broke — faces never showed.
        const loop = async () => {
            if (!this.active) return;
            try { await this.poll(); } catch (_) { /* next round retries */ }
            if (this.active) this.pollTimer = setTimeout(loop, 1200);
        };
        await loop();
    }

    attachLocalVideo() {
        const video = rootEl?.querySelector('#ocp-local-video');
        const tile = rootEl?.querySelector('#ocp-local-tile');
        if (video) video.srcObject = this.localStream;
        const track = this.localStream?.getVideoTracks()[0];
        this.localTileUpdate = bindTrackVisibility(tile, video, track);
    }

    async poll() {
        if (!this.active) return;

        const res = await Api.get(
            `/VideoAPI.php?action=poll&room_key=${encodeURIComponent(this.roomKey)}`
            + `&since=${this.signalSince}&comment_since=${this.commentSince}`
        );
        if (!res.success) return;

        const data = res.data || {};
        this.signalSince = data.since ?? this.signalSince;
        if (data.class_active === false) {
            this.commentSince = 0;
        } else {
            this.commentSince = data.comment_since ?? this.commentSince;
        }

        const hostNow = (data.participants || []).some(p => p.is_host);
        if (hostNow) setWaitingBanner(false);
        if (hostNow && data.class_active !== false && !this.classActive) {
            this.classActive = true;
            state.classActive = true;
            const input = rootEl?.querySelector('#ocp-chat-input');
            const sendBtn = rootEl?.querySelector('#ocp-chat-send');
            const closed = rootEl?.querySelector('#ocp-chat-closed');
            const form = rootEl?.querySelector('#ocp-chat-form');
            if (input) { input.disabled = false; input.placeholder = 'Write a comment…'; }
            if (sendBtn) sendBtn.disabled = false;
            if (form) form.hidden = false;
            if (closed) closed.hidden = true;
        }

        if (data.class_active === false) {
            this.closeCommentsOnly();
        } else if (data.comments?.length) {
            this.appendComments(data.comments);
        }

        const remoteIds = new Set();
        for (const p of data.participants || []) {
            const id = Number(p.user_id);
            this.participantNames.set(id, nameOnly(p.display_name));
            if (id === this.userId) continue;
            remoteIds.add(id);
            const name = nameOnly(p.display_name);
            if (!this.peers.has(id)) {
                await this.connectToPeer(id, name);
            } else {
                const entry = this.peers.get(id);
                if (entry && entry.displayName !== name) {
                    entry.displayName = name;
                    entry.tile?.querySelector('.ocp-tile-label')?.replaceChildren(document.createTextNode(name));
                    entry.tile?.querySelector('.ocp-tile-avatar')?.replaceChildren(document.createTextNode(nameInitials(name)));
                }
            }
        }

        for (const [peerId] of this.peers) {
            if (!remoteIds.has(peerId)) this.removePeer(peerId);
        }

        this.syncHands(data.participants || []);
        this.participants = data.participants || [];
        this.renderPeople();

        for (const sig of data.signals || []) {
            await this.handleSignal(sig);
        }
    }

    appendComments(comments) {
        const box = rootEl?.querySelector('#ocp-chat-msgs');
        if (!box) return;
        for (const c of comments) {
            if (box.querySelector(`[data-comment-id="${c.id}"]`)) continue;
            const el = document.createElement('div');
            el.className = 'ocp-chat-msg';
            el.dataset.commentId = String(c.id);
            el.innerHTML = `<strong>${escapeHtml(nameOnly(c.display_name))}</strong> ${escapeHtml(c.content)}<time>${escapeHtml(formatTime(c.created_at))}</time>`;
            box.appendChild(el);
        }
        box.scrollTop = box.scrollHeight;
    }

    clearCommentsUI() {
        const box = rootEl?.querySelector('#ocp-chat-msgs');
        if (box) box.innerHTML = '';
        this.commentSince = 0;
    }

    closeCommentsOnly() {
        this.classActive = false;
        state.classActive = false;
        this.clearCommentsUI();
        const input = rootEl?.querySelector('#ocp-chat-input');
        const sendBtn = rootEl?.querySelector('#ocp-chat-send');
        const closed = rootEl?.querySelector('#ocp-chat-closed');
        const form = rootEl?.querySelector('#ocp-chat-form');
        if (input) { input.disabled = true; input.value = ''; input.placeholder = 'Class ended — comments closed'; }
        if (sendBtn) sendBtn.disabled = true;
        if (form) form.hidden = true;
        if (closed) closed.hidden = false;
    }

    setClassEnded(fromHost = true) {
        this.closeCommentsOnly();
        if (fromHost) this.onClassEnded?.();
    }

    async connectToPeer(peerId, displayName, { autoOffer = true } = {}) {
        if (this.peers.has(peerId)) return;

        const pc = new RTCPeerConnection({ iceServers: this.iceServers });
        const entry = {
            pc, displayName, tile: null, makingOffer: false,
            trackUpdate: null, pendingIce: [],
            cid: newCid(),        // this connection
            remoteCid: null,      // the other side's current connection
            iceQueue: [], iceTimer: null, downTimer: null,
        };
        this.peers.set(peerId, entry);

        this.localStream.getTracks().forEach(track => {
            // camera switched off before this person joined: send no video
            const sendTrack = (track.kind === 'video' && !this.videoEnabled && !this.sharingScreen) ? null : track;
            if (sendTrack) pc.addTrack(sendTrack, this.localStream);
            else pc.addTransceiver('video', { direction: 'sendrecv', streams: [this.localStream] });
        });

        pc.ontrack = (event) => {
            const stream = event.streams[0] || new MediaStream([event.track]);
            this.ensureRemoteTile(peerId, entry.displayName, stream, event.track);
        };

        // Candidates are collected for a moment and sent together: one
        // request instead of 10–20. Each lost request used to be a lost
        // path between the two devices.
        pc.onicecandidate = (event) => {
            if (event.candidate) entry.iceQueue.push(event.candidate.toJSON());
            if (entry.iceTimer) return;
            entry.iceTimer = setTimeout(() => {
                entry.iceTimer = null;
                const batch = entry.iceQueue.splice(0);
                if (batch.length) this.sendSignal(peerId, 'ice', { candidates: batch, cid: entry.cid, to_cid: entry.remoteCid });
            }, event.candidate ? 250 : 0);
        };

        pc.onconnectionstatechange = () => {
            const st = pc.connectionState;
            if (st === 'connected') {
                clearTimeout(entry.downTimer);
                entry.downTimer = null;
                entry.trackUpdate?.();
            } else if (st === 'disconnected') {
                // brief drops recover by themselves; a long one gets rebuilt
                clearTimeout(entry.downTimer);
                entry.downTimer = setTimeout(() => {
                    if (pc.connectionState !== 'connected') this.removePeer(peerId);
                }, 8000);
            } else if (st === 'failed' || st === 'closed') {
                // Removed here; the next poll still sees this person and
                // builds a fresh connection (new cid), which the other side
                // recognises and rebuilds too.
                this.removePeer(peerId);
            }
        };

        const polite = this.userId > peerId;
        pc.onnegotiationneeded = async () => {
            if (!polite || entry.makingOffer) return;
            try {
                entry.makingOffer = true;
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                await this.sendSignal(peerId, 'offer', { sdp: pc.localDescription, cid: entry.cid, to_cid: entry.remoteCid });
            } catch (_) { /* ignore */ }
            entry.makingOffer = false;
        };

        if (!polite && autoOffer) {
            entry.makingOffer = true;
            try {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                await this.sendSignal(peerId, 'offer', { sdp: pc.localDescription, cid: entry.cid, to_cid: entry.remoteCid });
            } catch (_) { /* ignore */ }
            entry.makingOffer = false;
        }
    }

    ensureRemoteTile(peerId, displayName, stream, track) {
        const entry = this.peers.get(peerId);
        if (!entry) return;

        if (!entry.tile) {
            const grid = rootEl?.querySelector('#ocp-video-grid');
            if (!grid) return;
            const tile = document.createElement('div');
            tile.className = 'ocp-tile';
            tile.dataset.peerId = String(peerId);
            tile.innerHTML = buildTileHtml(displayName);
            grid.appendChild(tile);
            entry.tile = tile;
        }

        const video = entry.tile.querySelector('video');
        if (video && video.srcObject !== stream) {
            video.srcObject = stream;
            playRemoteVideo(video);
        }
        const vTrack = (track && track.kind === 'video') ? track : stream.getVideoTracks()[0];
        if (vTrack) entry.trackUpdate = bindTrackVisibility(entry.tile, video, vTrack);
        this.applyHandToTile(peerId);
    }

    async handleSignal(sig) {
        const from = Number(sig.from);
        if (from === this.userId) return;   // own reactions are shown instantly on click

        if (sig.type === 'cmd') {
            if (Number(sig.id) > this.joinSignalFloor && !this.isHost) this.handleHostCommand(sig.payload || {});
            return;
        }

        if (sig.type === 'react') {
            if (Number(sig.id) > this.joinSignalFloor) {
                this.showReaction(from, sig.payload?.emoji);
            }
            return;
        }

        if (sig.type === 'host-end') {
            if (Number(sig.id) <= this.joinSignalFloor) return;
            this.setClassEnded(true);
            await this.stop(false);
            closePlayer();
            return;
        }

        const payload = sig.payload || {};
        let entry = this.peers.get(from);

        // The other device rebuilt its connection (reload, network change,
        // failure). Answering its new offer on our OLD connection is what
        // left faces stuck on initials — rebuild ours to match.
        if (entry && sig.type === 'offer' && payload.cid && entry.remoteCid && payload.cid !== entry.remoteCid) {
            this.removePeer(from);
            entry = null;
        }

        if (!entry && (sig.type === 'offer' || sig.type === 'answer' || sig.type === 'ice')) {
            // a stray answer/ice for a connection we no longer have is useless
            if (sig.type !== 'offer') return;
            const peerName = this.participantNames.get(from) || 'Participant';
            await this.connectToPeer(from, peerName, { autoOffer: false });
            entry = this.peers.get(from);
        }
        if (!entry) return;

        // Replies addressed to a connection of ours that has been replaced.
        if (payload.to_cid && payload.to_cid !== entry.cid && sig.type !== 'offer') return;

        const { pc } = entry;
        try {
            if (sig.type === 'offer') {
                const offerCollision = entry.makingOffer || pc.signalingState !== 'stable';
                const polite = this.userId > from;
                if (offerCollision && !polite) return;
                if (payload.cid) entry.remoteCid = payload.cid;
                await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
                await this.flushPendingIce(entry);
                await pc.setLocalDescription(await pc.createAnswer());
                await this.sendSignal(from, 'answer', { sdp: pc.localDescription, cid: entry.cid, to_cid: entry.remoteCid });
            } else if (sig.type === 'answer') {
                if (pc.signalingState === 'have-local-offer') {
                    if (payload.cid) entry.remoteCid = payload.cid;
                    await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
                    await this.flushPendingIce(entry);
                }
            } else if (sig.type === 'ice') {
                if (payload.cid && entry.remoteCid && payload.cid !== entry.remoteCid) return;
                const list = Array.isArray(payload.candidates) ? payload.candidates
                    : (payload.candidate ? [payload.candidate] : []);
                for (const c of list) {
                    try { await this.addIceCandidate(entry, c); } catch (_) { /* one bad candidate is fine */ }
                }
            }
        } catch (err) {
            console.warn('[OnlineClass] signal error', sig.type, err);
        }
    }

    async addIceCandidate(entry, candidate) {
        const { pc } = entry;
        const ice = new RTCIceCandidate(candidate);
        if (!pc.remoteDescription || !pc.remoteDescription.type) {
            entry.pendingIce.push(candidate);
            return;
        }
        await pc.addIceCandidate(ice);
    }

    async flushPendingIce(entry) {
        if (!entry.pendingIce?.length) return;
        const { pc } = entry;
        const pending = [...entry.pendingIce];
        entry.pendingIce = [];
        for (const candidate of pending) {
            try {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (_) { /* ignore */ }
        }
    }

    async sendSignal(toUserId, type, payload) {
        const body = { room_key: this.roomKey, to_user_id: toUserId, type, payload };
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const res = await Api.post('/VideoAPI.php?action=signal', body);
                if (res?.success) return true;
            } catch (_) { /* retry */ }
            await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
        }
        return false;
    }

    updateLocalVideoTrack(newTrack) {
        const video = rootEl?.querySelector('#ocp-local-video');
        const tile = rootEl?.querySelector('#ocp-local-tile');
        if (!this.localStream || !newTrack) return;

        const current = this.localStream.getVideoTracks()[0];
        if (current && current !== newTrack) {
            this.localStream.removeTrack(current);
        }
        if (!this.localStream.getVideoTracks().includes(newTrack)) {
            this.localStream.addTrack(newTrack);
        }
        if (video) video.srcObject = this.localStream;
        this.localTileUpdate = bindTrackVisibility(tile, video, newTrack);
        this.localTileUpdate?.();
    }

    async renegotiateAllPeers() {
        for (const [peerId, entry] of this.peers) {
            try {
                entry.makingOffer = true;
                await entry.pc.setLocalDescription(await entry.pc.createOffer());
                await this.sendSignal(peerId, 'offer', { sdp: entry.pc.localDescription, cid: entry.cid, to_cid: entry.remoteCid });
            } catch (_) { /* ignore */ }
            entry.makingOffer = false;
        }
    }

    /** The video sender of a connection, even while it is sending nothing. */
    videoSender(pc) {
        return pc.getSenders().find(s => s.track?.kind === 'video')
            || pc.getTransceivers().find(t => t.receiver?.track?.kind === 'video')?.sender
            || null;
    }

    async replaceVideoTrack(newTrack) {
        this.updateLocalVideoTrack(newTrack);

        let needsOffer = false;
        for (const entry of this.peers.values()) {
            const sender = this.videoSender(entry.pc);
            if (!sender) {
                entry.pc.addTrack(newTrack, this.localStream);
                needsOffer = true;
            } else {
                await sender.replaceTrack(newTrack);
            }
        }
        // replaceTrack needs no renegotiation; only a brand-new sender does
        if (needsOffer) await this.renegotiateAllPeers();
    }

    removePeer(peerId) {
        const entry = this.peers.get(peerId);
        if (!entry) return;
        clearTimeout(entry.iceTimer);
        clearTimeout(entry.downTimer);
        try { entry.pc.close(); } catch (_) { /* ignore */ }
        entry.tile?.remove();
        this.peers.delete(peerId);
    }

    toggleAudio() {
        this.audioEnabled = !this.audioEnabled;
        this.localStream?.getAudioTracks().forEach(t => { t.enabled = this.audioEnabled; });
        this.sendMediaState();
        return this.audioEnabled;
    }

    toggleVideo() {
        if (this.sharingScreen) return this.videoEnabled;
        this.videoEnabled = !this.videoEnabled;
        const track = this.cameraTrack || this.localStream?.getVideoTracks()[0];
        if (track) track.enabled = this.videoEnabled;
        // A disabled track still sends black frames, which the others saw as
        // a black tile. Sending nothing lets their side show your initials.
        for (const entry of this.peers.values()) {
            const sender = this.videoSender(entry.pc);
            sender?.replaceTrack(this.videoEnabled ? track : null).catch(() => {});
        }
        this.localTileUpdate?.();
        this.sendMediaState();
        return this.videoEnabled;
    }

    sendMediaState() {
        Api.post('/VideoAPI.php?action=media', {
            room_key: this.roomKey,
            cam_off: !this.videoEnabled && !this.sharingScreen,
            mic_off: !this.audioEnabled,
        }).catch(() => {});
    }

    // ── Raise hand ──────────────────────────────────────────────
    async setHand(raised, userId = this.userId) {
        const res = await Api.post('/VideoAPI.php?action=hand', { room_key: this.roomKey, raised, user_id: userId });
        if (!res?.success) {
            showToast(res?.message || 'Could not update the hand.', 'warn');
            return false;
        }
        if (userId === this.userId) this.handRaised = raised;
        this.handsUp.set(userId, raised);
        this.applyHandToTile(userId);
        this.renderHandsBar();
        return true;
    }

    syncHands(participants) {
        const before = this.handsUp;
        this.handsUp = new Map();
        for (const p of participants) {
            const id = Number(p.user_id);
            const up = !!p.hand_raised;
            this.handsUp.set(id, up);
            if (up && !before.get(id) && id !== this.userId && before.size) {
                showToast(`✋ ${nameOnly(p.display_name)} raised their hand`, 'warn');
            }
            if (id === this.userId && this.handRaised !== up) {
                this.handRaised = up;            // the host lowered it
                syncHandButton(up);
            }
        }
        for (const id of new Set([...before.keys(), ...this.handsUp.keys()])) this.applyHandToTile(id);
        for (const p of participants) {
            const id = Number(p.user_id);
            if (id === this.userId) continue;
            this.peers.get(id)?.tile?.classList.toggle('cam-off', !!p.cam_off);
        }
        this.renderHandsBar();
    }

    applyHandToTile(userId) {
        const tile = userId === this.userId
            ? rootEl?.querySelector('#ocp-local-tile')
            : this.peers.get(userId)?.tile;
        if (!tile) return;
        const up = !!this.handsUp.get(userId);
        tile.classList.toggle('hand-up', up);
        const badge = tile.querySelector('.ocp-tile-hand');
        if (badge) {
            const canLower = this.isHost || userId === this.userId;
            badge.classList.toggle('can-lower', canLower);
            badge.title = canLower ? 'Lower hand' : 'Hand raised';
            badge.onclick = canLower ? () => this.setHand(false, userId) : null;
        }
    }

    /** Hands in the order they went up — the host answers them in turn. */
    renderHandsBar() {
        const bar = rootEl?.querySelector('#ocp-hands-bar');
        if (!bar) return;
        const up = [...this.handsUp.entries()].filter(([, v]) => v).map(([id]) => id);
        if (!up.length) { bar.classList.remove('visible'); return; }
        const names = up.map(id => id === this.userId ? 'You' : (this.participantNames.get(id) || 'Someone'));
        bar.textContent = `✋ ${up.length} hand${up.length > 1 ? 's' : ''} raised: ${names.join(', ')}`;
        bar.classList.add('visible');
    }

    // ── Instructor controls (received) ─────────────────────────
    handleHostCommand({ cmd, by }) {
        const who = nameOnly(by || 'The instructor');
        if (cmd === 'mute' || cmd === 'mute_all') {
            if (this.audioEnabled) {
                this.toggleAudio();
                syncMicButton(false);
            }
            showToast(`${who} muted your microphone. Tap the mic button to talk again.`, 'warn');
        } else if (cmd === 'cam_request') {
            if (this.videoEnabled || this.sharingScreen) return;
            // Only a request: the camera never turns on without the student.
            showConfirmModal({
                title: 'Turn on your camera?',
                message: `${who} is asking you to turn on your camera.`,
                confirmText: 'Turn on camera',
                onConfirm: () => rootEl?.querySelector('#ocp-cam')?.click(),
            });
        }
    }

    // ── Instructor controls (sent) ─────────────────────────────
    async hostCommand(cmd, userId = 0) {
        const res = await Api.post('/VideoAPI.php?action=host_cmd', { room_key: this.roomKey, cmd, user_id: userId });
        if (!res?.success) { showToast(res?.message || 'Could not send.', 'warn'); return; }
        const name = this.participantNames.get(userId) || 'the student';
        if (cmd === 'mute') showToast(`Muted ${name}.`, 'info');
        if (cmd === 'mute_all') showToast('Muted everyone.', 'info');
        if (cmd === 'cam_request') showToast(`Asked ${name} to turn on the camera.`, 'info');
        // show the new mic state right away instead of waiting for the next poll
        this.participants = this.participants.map(p =>
            (cmd === 'mute_all' && !p.is_host) || Number(p.user_id) === userId && cmd === 'mute' ? { ...p, mic_off: true } : p);
        this.renderPeople();
    }

    async loadRoster(force = false) {
        if (!this.isHost) return;
        if (!force && Date.now() - this.rosterAt < 10000) return;
        this.rosterAt = Date.now();
        const res = await Api.get(`/VideoAPI.php?action=roster&room_key=${encodeURIComponent(this.roomKey)}`);
        if (res?.success) {
            this.roster = res.data.students || [];
            this.renderPeople();
        }
    }

    async notifyAbsent(userIds = []) {
        const res = await Api.post('/VideoAPI.php?action=notify_absent', { room_key: this.roomKey, user_ids: userIds });
        showToast(res?.message || (res?.success ? 'Notified.' : 'Could not notify.'), res?.success ? 'info' : 'warn');
    }

    renderPeople() {
        const count = this.participants.length || 1;
        const c1 = rootEl?.querySelector('#ocp-people-count');
        const c2 = rootEl?.querySelector('#ocp-people-tab-count');
        if (c1) c1.textContent = String(count);
        if (c2) c2.textContent = String(count);

        const box = rootEl?.querySelector('#ocp-people-list');
        const pane = rootEl?.querySelector('#ocp-pane-people');
        if (!box || !pane || pane.hidden) return;
        if (this.isHost) this.loadRoster();

        const micOff = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/></svg>';
        const camOff = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

        // hands first (in the order they went up), then host, then by name
        const inClass = [...this.participants].sort((a, b) => {
            if (!!b.hand_raised - !!a.hand_raised) return !!b.hand_raised - !!a.hand_raised;
            if (a.hand_raised && b.hand_raised) return String(a.hand_at).localeCompare(String(b.hand_at));
            if (!!b.is_host - !!a.is_host) return !!b.is_host - !!a.is_host;
            return nameOnly(a.display_name).localeCompare(nameOnly(b.display_name));
        });
        const anyStudentMic = inClass.some(p => !p.is_host && !p.mic_off);

        let html = `<div class="ocp-people-head"><span>In class (${inClass.length})</span>${
            this.isHost && inClass.length > 1 ? `<button type="button" class="ocp-mini" data-act="mute_all" ${anyStudentMic ? '' : 'disabled'}>Mute all</button>` : ''}</div>`;
        html += inClass.map(p => {
            const id = Number(p.user_id);
            const me = id === this.userId;
            const name = nameOnly(p.display_name);
            const icons = `${p.hand_raised ? '<span class="hand" title="Hand raised">✋</span>' : ''}${p.mic_off ? `<span title="Mic off">${micOff}</span>` : ''}${p.cam_off ? `<span title="Camera off">${camOff}</span>` : ''}`;
            const actions = this.isHost && !me && !p.is_host ? `
                <button type="button" class="ocp-mini" data-act="mute" data-id="${id}" ${p.mic_off ? 'disabled' : ''}>${p.mic_off ? 'Muted' : 'Mute'}</button>
                ${p.cam_off ? `<button type="button" class="ocp-mini" data-act="cam_request" data-id="${id}">Ask cam</button>` : ''}` : '';
            return `<div class="ocp-person">
                <div class="ocp-person-av">${escapeHtml(nameInitials(name))}</div>
                <div class="ocp-person-info">
                    <div class="ocp-person-name">${escapeHtml(name)}${me ? ' (You)' : ''}</div>
                    <div class="ocp-person-sub">${p.is_host ? 'Instructor' : 'Student'}</div>
                </div>
                <div class="ocp-person-icons">${icons}</div>
                <div class="ocp-person-actions">${actions}</div>
            </div>`;
        }).join('');

        if (this.isHost) {
            const presentIds = new Set(this.participants.map(p => Number(p.user_id)));
            const absent = (this.roster || []).filter(r => !presentIds.has(Number(r.user_id)));
            html += `<div class="ocp-people-head"><span>Not in class (${this.roster ? absent.length : '…'})</span>${
                absent.length ? '<button type="button" class="ocp-mini primary" data-act="notify_all">Notify all</button>' : ''}</div>`;
            if (!this.roster) html += '<div class="ocp-people-empty">Loading class list…</div>';
            else if (!absent.length) html += '<div class="ocp-people-empty">Everyone enrolled is in class.</div>';
            else html += absent.map(r => `<div class="ocp-person absent">
                <div class="ocp-person-av">${escapeHtml(nameInitials(r.name))}</div>
                <div class="ocp-person-info">
                    <div class="ocp-person-name">${escapeHtml(r.name)}</div>
                    <div class="ocp-person-sub">${escapeHtml(r.section || 'Student')}</div>
                </div>
                <div class="ocp-person-actions"><button type="button" class="ocp-mini" data-act="notify" data-id="${r.user_id}">Notify</button></div>
            </div>`).join('');
        }

        // keep the scroll position while the list refreshes every poll
        const top = box.scrollTop;
        box.innerHTML = html;
        box.scrollTop = top;
    }

    // ── Reactions ───────────────────────────────────────────────
    async react(emoji) {
        this.showReaction(this.userId, emoji);
        await Api.post('/VideoAPI.php?action=react', { room_key: this.roomKey, emoji }).catch(() => {});
    }

    showReaction(userId, emoji) {
        if (!REACTIONS.includes(emoji)) return;
        const layer = rootEl?.querySelector('#ocp-react-layer');
        if (!layer) return;
        const name = userId === this.userId ? 'You' : (this.participantNames.get(userId) || '');
        const el = document.createElement('div');
        el.className = 'ocp-react';
        el.style.left = `${8 + Math.random() * 70}%`;
        el.innerHTML = `<span class="e">${emoji}</span>${name ? `<span class="n">${escapeHtml(name)}</span>` : ''}`;
        layer.appendChild(el);
        setTimeout(() => el.remove(), 3300);
    }

    async toggleScreenShare() {
        if (this.sharingScreen) {
            await this.stopScreenShare();
            return false;
        }
        try {
            this.screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: { displaySurface: 'monitor', cursor: 'always' },
                audio: false,
            });
            this.screenTrack = this.screenStream.getVideoTracks()[0];
            if (!this.screenTrack) throw new Error('No screen track');

            this.sharingScreen = true;
            await this.replaceVideoTrack(this.screenTrack);
            this.sendMediaState();

            const tile = rootEl?.querySelector('#ocp-local-tile');
            let badge = tile?.querySelector('.ocp-tile-badge');
            if (tile && !badge) {
                badge = document.createElement('span');
                badge.className = 'ocp-tile-badge';
                badge.textContent = 'Presenting';
                tile.appendChild(badge);
            }
            tile?.classList.add('has-video');

            const shareBtn = rootEl?.querySelector('#ocp-share');
            setBtnIcon(shareBtn, ICONS.screenStop);
            shareBtn?.classList.add('on', 'share');

            this.screenTrack.onended = () => {
                this.stopScreenShare().then((active) => {
                    const btn = rootEl?.querySelector('#ocp-share');
                    if (btn) {
                        btn.classList.toggle('on', active);
                        btn.classList.toggle('share', active);
                        setBtnIcon(btn, active ? ICONS.screenStop : ICONS.screen);
                    }
                });
            };
            return true;
        } catch (err) {
            if (err?.name !== 'NotAllowedError') {
                showToast('Could not start screen sharing.', 'error');
            }
            return false;
        }
    }

    async stopScreenShare() {
        if (!this.sharingScreen) return false;
        this.sharingScreen = false;
        this.screenStream?.getTracks().forEach(t => t.stop());
        this.screenStream = null;
        this.screenTrack = null;

        let track = this.cameraTrack;
        if (!track || track.readyState === 'ended') {
            try {
                const camStream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
                    audio: false,
                });
                track = camStream.getVideoTracks()[0];
                this.cameraTrack = track;
            } catch (_) { /* camera unavailable */ }
        }

        if (track) {
            track.enabled = this.videoEnabled;
            await this.replaceVideoTrack(track);
            // back to the camera: send nothing if it is switched off
            if (!this.videoEnabled) {
                for (const entry of this.peers.values()) this.videoSender(entry.pc)?.replaceTrack(null).catch(() => {});
            }
        }
        this.sendMediaState();

        const tile = rootEl?.querySelector('#ocp-local-tile');
        tile?.querySelector('.ocp-tile-badge')?.remove();
        this.localTileUpdate?.();
        return false;
    }

    async sendComment(content) {
        if (!this.classActive) {
            showToast('Class has ended. Comments are closed.', 'warn');
            return false;
        }
        const res = await Api.post('/VideoAPI.php?action=comment', {
            room_key: this.roomKey,
            content,
        });
        if (!res.success) {
            if (res._blocked) return false;   // "Not allowed" popup already shown
            showToast(res.message || 'Could not send comment.', 'warn');
            if (res.message?.includes('ended')) this.setClassEnded(false);
            return false;
        }
        return true;
    }

    async endClassForAll() {
        await Api.post('/VideoAPI.php?action=end', { room_key: this.roomKey });
        this.setClassEnded(true);
        await this.stop(false);
    }

    async stop(notifyServer = true) {
        this.active = false;
        if (this.pollTimer) {
            clearTimeout(this.pollTimer);
            this.pollTimer = null;
        }
        await this.stopScreenShare().catch(() => {});
        for (const peerId of [...this.peers.keys()]) this.removePeer(peerId);
        this.localStream?.getTracks().forEach(t => t.stop());
        this.localStream = null;
        this.cameraTrack = null;
        if (notifyServer) {
            await Api.post('/VideoAPI.php?action=leave', { room_key: this.roomKey }).catch(() => {});
        }
    }
}

function setMode(mode) {
    state.mode = mode;
    if (!rootEl) return;
    rootEl.className = '';
    if (mode !== 'closed') rootEl.classList.add('ocp-active', `ocp-${mode}`);
    // The minimize button doubles as "expand" once we are already small --
    // at 340px wide there is no room for a separate restore control.
    const minBtn = rootEl.querySelector('#ocp-min');
    if (minBtn) {
        setBtnIcon(minBtn, mode === 'minimized' ? ICONS.expand : ICONS.minimize);
        minBtn.title = mode === 'minimized' ? 'Expand to full window' : 'Minimize';
    }
    const head = rootEl.querySelector('.ocp-head');
    if (head) head.title = mode === 'minimized' ? 'Drag to move · double-click to expand' : '';
    applyMiniPos();
}

// ── Minimized window: drag to reposition ────────────────────────────────
// Where the instructor wants the mini player depends on what is underneath
// it, which we cannot guess -- so it starts in the bottom-right corner and
// they can put it wherever they like from there. The position survives
// minimize/expand cycles but is deliberately not persisted across a rejoin.
let miniPos = null;   // {left, top} in px; null = the CSS default corner

/** Keep the window fully on screen -- a resize or rotate must not strand it. */
function clampMiniPos(pos, shell) {
    const m = 8;
    const w = shell.offsetWidth  || 340;
    const h = shell.offsetHeight || 212;
    return {
        left: Math.min(Math.max(pos.left, m), Math.max(m, window.innerWidth  - w - m)),
        top:  Math.min(Math.max(pos.top,  m), Math.max(m, window.innerHeight - h - m)),
    };
}

function applyMiniPos() {
    const shell = rootEl?.querySelector('.ocp-shell');
    if (!shell) return;
    if (state.mode !== 'minimized' || !miniPos) {
        // Hand the geometry back to the stylesheet in every other mode,
        // otherwise a dragged position would pin the expanded window too.
        shell.style.left = shell.style.top = shell.style.right = shell.style.bottom = '';
        return;
    }
    miniPos = clampMiniPos(miniPos, shell);
    shell.style.left   = `${miniPos.left}px`;
    shell.style.top    = `${miniPos.top}px`;
    shell.style.right  = 'auto';
    shell.style.bottom = 'auto';
}

function enableMiniDrag(shell) {
    const head = shell?.querySelector('.ocp-head');
    if (!head) return;
    let drag = null;

    head.addEventListener('pointerdown', (e) => {
        if (state.mode !== 'minimized') return;
        // Buttons stay buttons; only the bare strip of header drags.
        if (e.target.closest('.ocp-btn')) return;
        const r = shell.getBoundingClientRect();
        drag = { x: e.clientX, y: e.clientY, left: r.left, top: r.top };
        head.setPointerCapture?.(e.pointerId);
        rootEl.classList.add('ocp-dragging');
        e.preventDefault();
    });

    head.addEventListener('pointermove', (e) => {
        if (!drag) return;
        miniPos = { left: drag.left + (e.clientX - drag.x), top: drag.top + (e.clientY - drag.y) };
        applyMiniPos();
    });

    const endDrag = (e) => {
        if (!drag) return;
        head.releasePointerCapture?.(e.pointerId);
        drag = null;
        rootEl.classList.remove('ocp-dragging');
    };
    head.addEventListener('pointerup', endDrag);
    head.addEventListener('pointercancel', endDrag);

    // Double-clicking a title bar to restore the window is the convention
    // everywhere else, so honour it here too.
    head.addEventListener('dblclick', (e) => {
        if (state.mode !== 'minimized' || e.target.closest('.ocp-btn')) return;
        restore();
    });

    window.addEventListener('resize', () => {
        if (state.mode === 'minimized') applyMiniPos();
    });
}

function toggleFullscreen() {
    const shell = rootEl?.querySelector('.ocp-shell');
    const fsBtn = rootEl?.querySelector('#ocp-fs');
    if (!shell) return;
    if (state.mode === 'fullscreen') {
        setMode('normal');
        setBtnIcon(fsBtn, ICONS.fullscreen);
        fsBtn.title = 'Fullscreen';
        document.exitFullscreen?.().catch(() => {});
        return;
    }
    setMode('fullscreen');
    setBtnIcon(fsBtn, ICONS.shrink);
    fsBtn.title = 'Exit fullscreen';
    shell.requestFullscreen?.().catch(() => {});
}

function minimize() { setMode('minimized'); document.exitFullscreen?.().catch(() => {}); }
function restore() { setMode('normal'); }

function closePlayer() {
    session?.stop().catch(() => {});
    session = null;
    state.classActive = true;
    setMode('closed');
    document.exitFullscreen?.().catch(() => {});
    rootEl?.remove();
    rootEl = null;
    miniPos = null;
}

function showLoading(msg = 'Joining class…') {
    const loading = rootEl?.querySelector('#ocp-loading');
    if (!loading) return;
    loading.style.display = 'flex';
    loading.innerHTML = `<span class="ocp-loading-spinner"></span><span>${escapeHtml(msg)}</span>`;
}

function showError(msg) {
    const loading = rootEl?.querySelector('#ocp-loading');
    if (!loading) return;
    loading.style.display = 'flex';
    loading.innerHTML = `<p class="ocp-error">${escapeHtml(msg)}</p>`;
}

function hideLoading() {
    const loading = rootEl?.querySelector('#ocp-loading');
    if (loading) loading.style.display = 'none';
}

function setWaitingBanner(visible) {
    const el = rootEl?.querySelector('#ocp-waiting');
    if (el) el.classList.toggle('visible', !!visible);
}

function ensureDom(isHost) {
    if (rootEl) return;
    injectStyles();

    rootEl = document.createElement('div');
    rootEl.id = 'ocp-root';
    rootEl.innerHTML = `
        <div class="ocp-backdrop" aria-hidden="true"></div>
        <div class="ocp-shell" role="dialog" aria-label="Online class">
            <div class="ocp-head">
                <span class="ocp-grip" aria-hidden="true">${ICONS.grip}</span>
                <div class="ocp-head-text">
                    <h3 id="ocp-title">Online Class</h3>
                    <p id="ocp-sub">Live class</p>
                    <span class="ocp-id-badge" id="ocp-id-badge" hidden></span>
                </div>
                <div class="ocp-actions">
                    <button type="button" class="ocp-btn ocp-icon-btn on" id="ocp-mic" title="Microphone">${ICONS.mic}</button>
                    <button type="button" class="ocp-btn ocp-icon-btn on" id="ocp-cam" title="Camera">${ICONS.cam}</button>
                    <button type="button" class="ocp-btn ocp-icon-btn" id="ocp-hand" title="Raise hand">${ICONS.hand}</button>
                    <button type="button" class="ocp-btn ocp-icon-btn" id="ocp-emoji" title="Send a reaction">${ICONS.smile}</button>
                    <button type="button" class="ocp-btn ocp-icon-btn" id="ocp-share" title="Share screen">${ICONS.screen}</button>
                    <button type="button" class="ocp-btn ocp-icon-btn" id="ocp-people" title="People">${ICONS.people}<span class="ocp-btn-count" id="ocp-people-count">1</span></button>
                    <button type="button" class="ocp-btn ocp-icon-btn" id="ocp-chat-toggle" title="Class comments">${ICONS.chat}</button>
                    <button type="button" class="ocp-btn ocp-icon-btn" id="ocp-min" title="Minimize">${ICONS.minimize}</button>
                    <button type="button" class="ocp-btn ocp-icon-btn" id="ocp-fs" title="Fullscreen">${ICONS.fullscreen}</button>
                    ${isHost ? '<button type="button" class="ocp-btn end" id="ocp-end">End Class</button>' : ''}
                    <button type="button" class="ocp-btn leave" id="ocp-leave">Leave</button>
                </div>
            </div>
            <div class="ocp-body">
                <div class="ocp-main">
                    <div class="ocp-frame-wrap">
                        <div class="ocp-loading" id="ocp-loading">
                            <span class="ocp-loading-spinner"></span>
                            <span>Joining class…</span>
                        </div>
                        <div class="ocp-waiting" id="ocp-waiting">Waiting for instructor to join…</div>
                        <div class="ocp-hands-bar" id="ocp-hands-bar"></div>
                        <div class="ocp-react-layer" id="ocp-react-layer"></div>
                        <button type="button" class="ocp-sound-tip" id="ocp-sound-tip">🔊 Tap to turn on sound</button>
                        <div class="ocp-emoji-pop" id="ocp-emoji-pop" role="menu">
                            ${REACTIONS.map(e => `<button type="button" data-emoji="${e}" aria-label="React ${e}">${e}</button>`).join('')}
                        </div>
                        <div class="ocp-video-grid" id="ocp-video-grid">
                            <div class="ocp-tile ocp-tile--local" id="ocp-local-tile">
                                <div class="ocp-tile-avatar" id="ocp-local-avatar">?</div>
                                <video id="ocp-local-video" autoplay muted playsinline></video>
                                <button type="button" class="ocp-tile-hand" title="Lower hand">✋ <span>Hand</span></button>
                                <span class="ocp-tile-label" id="ocp-local-label">You</span>
                            </div>
                        </div>
                    </div>
                </div>
                <aside class="ocp-chat" id="ocp-chat">
                    <div class="ocp-tabs" role="tablist">
                        <button type="button" class="ocp-tab active" data-tab="comments">Comments</button>
                        <button type="button" class="ocp-tab" data-tab="people">People (<span id="ocp-people-tab-count">1</span>)</button>
                    </div>
                    <div class="ocp-pane" id="ocp-pane-people" hidden>
                        <div class="ocp-people" id="ocp-people-list"></div>
                    </div>
                    <div class="ocp-pane" id="ocp-pane-comments">
                    <div class="ocp-chat-msgs" id="ocp-chat-msgs"></div>
                    <form class="ocp-chat-form" id="ocp-chat-form">
                        <input type="text" id="ocp-chat-input" placeholder="Write a comment…" maxlength="500" autocomplete="off">
                        <button type="submit" id="ocp-chat-send" title="Send comment">${ICONS.send}</button>
                    </form>
                    <div class="ocp-chat-closed" id="ocp-chat-closed" hidden>Class ended — comments are closed.</div>
                    </div>
                </aside>
            </div>
        </div>
    `;
    document.body.appendChild(rootEl);
    // Phone browsers (Android Chrome, iPhone Safari) cannot share the screen;
    // a button that can only fail just crowds the bottom bar.
    if (!navigator.mediaDevices?.getDisplayMedia) rootEl.querySelector('#ocp-share')?.remove();

    rootEl.querySelector('#ocp-min')?.addEventListener('click', () => {
        if (state.mode === 'minimized') restore(); else minimize();
    });
    enableMiniDrag(rootEl.querySelector('.ocp-shell'));
    rootEl.querySelector('#ocp-fs')?.addEventListener('click', toggleFullscreen);
    rootEl.querySelector('#ocp-leave')?.addEventListener('click', () => closePlayer());
    rootEl.querySelector('.ocp-backdrop')?.addEventListener('click', minimize);
    const showTab = (tab) => {
        rootEl.querySelectorAll('.ocp-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
        rootEl.querySelector('#ocp-pane-people').hidden = tab !== 'people';
        rootEl.querySelector('#ocp-pane-comments').hidden = tab !== 'comments';
        if (tab === 'people' && session) { session.loadRoster(true); session.renderPeople(); }
    };
    const currentTab = () => rootEl.querySelector('.ocp-tab.active')?.dataset.tab;
    rootEl.querySelectorAll('.ocp-tab').forEach(t => t.addEventListener('click', () => showTab(t.dataset.tab)));
    // On phones the side panel slides in; pressing the same button again closes it.
    const openPanel = (tab) => {
        const open = rootEl.classList.contains('ocp-chat-open');
        if (open && currentTab() === tab) rootEl.classList.remove('ocp-chat-open');
        else { showTab(tab); rootEl.classList.add('ocp-chat-open'); }
    };
    rootEl.querySelector('#ocp-chat-toggle')?.addEventListener('click', () => openPanel('comments'));
    rootEl.querySelector('#ocp-people')?.addEventListener('click', () => openPanel('people'));
    rootEl.querySelector('#ocp-people-list')?.addEventListener('click', (e) => {
        const b = e.target.closest('[data-act]');
        if (!b || !session) return;
        const id = Number(b.dataset.id || 0);
        const act = b.dataset.act;
        if (act === 'mute' || act === 'cam_request') session.hostCommand(act, id);
        else if (act === 'mute_all') {
            showConfirmModal({ title: 'Mute everyone?', message: 'All students\' microphones will turn off. They can turn them back on.', confirmText: 'Mute all', onConfirm: () => session.hostCommand('mute_all') });
        } else if (act === 'notify') session.notifyAbsent([id]);
        else if (act === 'notify_all') session.notifyAbsent([]);
    });
    rootEl.querySelector('#ocp-mic')?.addEventListener('click', (e) => {
        if (!session) return;
        const btn = e.currentTarget;
        const on = session.toggleAudio();
        btn.classList.toggle('on', on);
        btn.classList.toggle('off', !on);
        setBtnIcon(btn, on ? ICONS.mic : ICONS.micOff);
        btn.title = on ? 'Microphone on' : 'Microphone muted';
    });
    rootEl.querySelector('#ocp-cam')?.addEventListener('click', (e) => {
        if (!session) return;
        const btn = e.currentTarget;
        const on = session.toggleVideo();
        btn.classList.toggle('on', on);
        btn.classList.toggle('off', !on);
        setBtnIcon(btn, on ? ICONS.cam : ICONS.camOff);
        btn.title = on ? 'Camera on' : 'Camera off';
    });
    rootEl.querySelector('#ocp-hand')?.addEventListener('click', async () => {
        if (!session) return;
        const want = !session.handRaised;
        if (await session.setHand(want)) {
            syncHandButton(want);
            if (want) showToast('Your hand is raised. The instructor can see it.', 'info');
        }
    });
    const emojiPop = rootEl.querySelector('#ocp-emoji-pop');
    rootEl.querySelector('#ocp-emoji')?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!emojiPop) return;
        const open = !emojiPop.classList.contains('open');
        emojiPop.classList.toggle('open', open);
        if (open) {
            // sit just under (or, on phones, just above) the smiley button
            const btn = e.currentTarget.getBoundingClientRect();
            const wrap = rootEl.querySelector('.ocp-frame-wrap').getBoundingClientRect();
            const w = emojiPop.offsetWidth || 340;
            const left = Math.min(Math.max(8, btn.left + btn.width / 2 - w / 2 - wrap.left), Math.max(8, wrap.width - w - 8));
            emojiPop.style.left = `${left}px`;
            const below = btn.bottom - wrap.top + 6;
            emojiPop.style.top = below < 0 || below > wrap.height - 60 ? '' : `${Math.max(8, below)}px`;
            emojiPop.style.bottom = below < 0 || below > wrap.height - 60 ? '12px' : '';
        }
    });
    emojiPop?.addEventListener('click', (e) => {
        const b = e.target.closest('[data-emoji]');
        if (!b || !session) return;
        session.react(b.dataset.emoji);
        emojiPop.classList.remove('open');
    });
    rootEl.addEventListener('click', (e) => {
        if (emojiPop?.classList.contains('open') && !e.target.closest('#ocp-emoji-pop, #ocp-emoji')) {
            emojiPop.classList.remove('open');
        }
    });
    rootEl.querySelector('#ocp-sound-tip')?.addEventListener('click', (e) => {
        rootEl.querySelectorAll('.ocp-tile:not(.ocp-tile--local) video').forEach(v => {
            v.muted = false;
            v.play?.().catch(() => {});
        });
        e.currentTarget.classList.remove('visible');
    });

    rootEl.querySelector('#ocp-share')?.addEventListener('click', async (e) => {
        if (!session) return;
        const btn = e.currentTarget;
        const on = await session.toggleScreenShare();
        btn.classList.toggle('on', on);
        btn.classList.toggle('share', on);
        setBtnIcon(btn, on ? ICONS.screenStop : ICONS.screen);
        btn.title = on ? 'Stop sharing' : 'Share screen';
    });
    rootEl.querySelector('#ocp-end')?.addEventListener('click', () => {
        if (!session?.isHost) return;
        showConfirmModal({
            title: 'End class for everyone?',
            message: 'All students will be disconnected and class comments will close.',
            confirmText: 'End Class',
            onConfirm: async () => {
                await session.endClassForAll();
                showToast('Class ended for everyone.', 'warn');
                closePlayer();
            },
        });
    });
    rootEl.querySelector('#ocp-chat-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = rootEl.querySelector('#ocp-chat-input');
        const text = input?.value?.trim();
        if (!text || !session) return;
        const ok = await session.sendComment(text);
        if (ok) input.value = '';
    });
    document.addEventListener('fullscreenchange', () => {
        if (!document.fullscreenElement && state.mode === 'fullscreen') setMode('normal');
    });
}

function syncMicButton(on) {
    const btn = rootEl?.querySelector('#ocp-mic');
    if (!btn) return;
    btn.classList.toggle('on', on);
    btn.classList.toggle('off', !on);
    setBtnIcon(btn, on ? ICONS.mic : ICONS.micOff);
    btn.title = on ? 'Microphone on' : 'Microphone muted';
}

function syncHandButton(up) {
    const btn = rootEl?.querySelector('#ocp-hand');
    if (!btn) return;
    btn.classList.toggle('hand-on', !!up);
    btn.title = up ? 'Lower hand' : 'Raise hand';
}

function updateShellHeader(subjectName, subjectCode, displayName, role) {
    const host = isHostRole(role);
    const name = nameOnly(displayName);
    rootEl.querySelector('#ocp-title').textContent = `Online Class — ${subjectName}`;
    rootEl.querySelector('#ocp-sub').textContent = `${subjectCode ? subjectCode + ' · ' : ''}${name}`;
    rootEl.querySelector('#ocp-local-label').textContent = name;
    rootEl.querySelector('#ocp-local-avatar').textContent = nameInitials(name);

    const badge = rootEl.querySelector('#ocp-id-badge');
    if (badge) {
        badge.hidden = false;
        badge.classList.toggle('mod', host);
        badge.textContent = host ? 'Instructor · Host' : 'Student';
    }
}

function parseSubjectId(room, subjectId) {
    if (subjectId) return Number(subjectId);
    const m = String(room).match(/_(\d+)$/);
    return m ? Number(m[1]) : 0;
}

export async function openOnlineClass(opts) {
    const {
        room,
        subjectName = 'Online Class',
        subjectCode = '',
        subjectId: passedSubjectId,
        user: passedUser,
    } = opts || {};
    if (!room) return;

    const user = passedUser || Auth.user() || await Auth.getUser();
    if (!user) {
        showToast('Please log in again to join the online class.', 'error');
        return;
    }

    const role = user.role || 'student';
    const displayName = getFullName(user);
    const subjectId = parseSubjectId(room, passedSubjectId);

    ensureDom(isHostRole(role));
    setMode('normal');
    updateShellHeader(subjectName, subjectCode, displayName, role);
    showLoading(isHostRole(role) ? 'Starting class…' : 'Joining class…');

    /* getUserMedia is gated on a SECURE CONTEXT: over plain http:// from a LAN
       or hotspot address navigator.mediaDevices is simply undefined, however
       capable the browser is. The old wording blamed the browser and sent
       people hunting for a different one, when the thing that has to change is
       the URL. Same restriction that shaped randomLease() in
       utils/tab-lease-store.js. */
    if (!navigator.mediaDevices?.getUserMedia) {
        showError(window.isSecureContext
            ? 'Your browser does not support camera/microphone access.'
            : 'Camera and microphone need a secure connection. This page is open '
              + 'over ' + location.protocol + '//' + location.host + ' - reopen it '
              + 'using https:// (or on localhost) and join again.');
        return;
    }

    try {
        session = new WebRtcSession({
            roomKey: room,
            subjectId,
            user,
            role,
            displayName,
            onClassEnded: () => showToast('Class ended by instructor.', 'warn'),
        });
        await session.start();
        hideLoading();
    } catch (err) {
        console.error('[OnlineClass]', err);
        const msg = err?.name === 'NotAllowedError'
            ? 'Camera/microphone permission denied. Allow access and try again.'
            : (err?.message || 'Could not join the online class.');
        showError(msg);
    }
}

export function preloadOnlineClass() {}

export function previewOnlineClassName(user) {
    return getFullName(user);
}

export function closeOnlineClass() {
    closePlayer();
}

export const OnlineClassPlayer = {
    open: openOnlineClass,
    close: closeOnlineClass,
    previewName: previewOnlineClassName,
    preload: preloadOnlineClass,
};
