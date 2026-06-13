/**
 * Online Class — LMS WebRTC live classroom
 */
import { Auth } from '../auth.js';
import { Api } from '../api.js';
import { getFullName } from '../utils/user-display.js';

const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
];

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
    video: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>',
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
        #ocp-root { position:fixed; z-index:980; pointer-events:none; }
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
        #ocp-root.ocp-minimized .ocp-shell {
            bottom:96px; left:24px; right:auto; top:auto; transform:none;
            width:min(320px, calc(100vw - 48px)); height:200px;
            border-radius:12px; border:2px solid #00461B;
        }
        @media(max-width:640px) {
            #ocp-root.ocp-minimized .ocp-shell {
                bottom:80px; left:16px; width:min(280px, calc(100vw - 32px)); height:168px;
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
        .ocp-pip-bar {
            display:none; position:fixed; bottom:96px; left:24px; z-index:979;
            background:#00461B; color:#fff; border-radius:50px;
            padding:10px 16px; font-size:12px; font-weight:700;
            box-shadow:0 4px 20px rgba(0,70,27,.4); cursor:pointer; border:none;
        }
        .ocp-pip-bar.visible { display:flex; align-items:center; gap:8px; }
        .ocp-pip-bar svg { width:16px; height:16px; flex-shrink:0; }
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
    `;
    document.head.appendChild(s);
}

function bindTrackVisibility(tile, video, track) {
    if (!tile) return;
    const update = () => {
        const show = track && track.readyState === 'live' && track.enabled && !track.muted;
        tile.classList.toggle('has-video', !!show);
    };
    if (track) {
        track.onmute = update;
        track.onunmute = update;
        track.onended = update;
    }
    video?.addEventListener('loadedmetadata', update);
    update();
    return update;
}

function buildTileHtml(displayName, extraBadge = '') {
    const name = nameOnly(displayName);
    return `
        <div class="ocp-tile-avatar">${escapeHtml(nameInitials(name))}</div>
        <video autoplay playsinline></video>
        ${extraBadge}
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
    }

    async start() {
        this.active = true;
        this.localStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
            audio: true,
        });
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
        this.joinSignalFloor = Number(joinData.signal_since) || 0;
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

        this.pollTimer = setInterval(() => this.poll().catch(() => {}), 1200);
        await this.poll();
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

    async connectToPeer(peerId, displayName) {
        if (this.peers.has(peerId)) return;

        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        const entry = {
            pc, displayName, tile: null, makingOffer: false,
            trackUpdate: null, pendingIce: [],
        };
        this.peers.set(peerId, entry);

        this.localStream.getTracks().forEach(track => pc.addTrack(track, this.localStream));

        pc.ontrack = (event) => {
            const stream = event.streams[0] || new MediaStream([event.track]);
            this.ensureRemoteTile(peerId, displayName, stream, event.track);
        };

        pc.onicecandidate = (event) => {
            if (!event.candidate) return;
            this.sendSignal(peerId, 'ice', { candidate: event.candidate.toJSON() });
        };

        pc.onconnectionstatechange = () => {
            if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
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
                await this.sendSignal(peerId, 'offer', { sdp: pc.localDescription });
            } catch (_) { /* ignore */ }
            entry.makingOffer = false;
        };

        if (!polite) {
            entry.makingOffer = true;
            try {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                await this.sendSignal(peerId, 'offer', { sdp: pc.localDescription });
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
        if (video && video.srcObject !== stream) video.srcObject = stream;
        const vTrack = track || stream.getVideoTracks()[0];
        entry.trackUpdate = bindTrackVisibility(entry.tile, video, vTrack);
    }

    async handleSignal(sig) {
        const from = Number(sig.from);
        if (from === this.userId) return;

        if (sig.type === 'host-end') {
            if (Number(sig.id) <= this.joinSignalFloor) return;
            this.setClassEnded(true);
            await this.stop(false);
            closePlayer();
            return;
        }

        let entry = this.peers.get(from);
        if (!entry && (sig.type === 'offer' || sig.type === 'answer' || sig.type === 'ice')) {
            const peerName = this.participantNames.get(from) || 'Participant';
            await this.connectToPeer(from, peerName);
            entry = this.peers.get(from);
        }
        if (!entry) return;

        const { pc } = entry;
        try {
            if (sig.type === 'offer') {
                const offerCollision = entry.makingOffer || pc.signalingState !== 'stable';
                const polite = this.userId > from;
                if (offerCollision && !polite) return;
                await pc.setRemoteDescription(new RTCSessionDescription(sig.payload.sdp));
                await this.flushPendingIce(entry);
                await pc.setLocalDescription(await pc.createAnswer());
                await this.sendSignal(from, 'answer', { sdp: pc.localDescription });
            } else if (sig.type === 'answer') {
                if (pc.signalingState === 'have-local-offer') {
                    await pc.setRemoteDescription(new RTCSessionDescription(sig.payload.sdp));
                    await this.flushPendingIce(entry);
                }
            } else if (sig.type === 'ice' && sig.payload?.candidate) {
                await this.addIceCandidate(entry, sig.payload.candidate);
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
        await Api.post('/VideoAPI.php?action=signal', {
            room_key: this.roomKey,
            to_user_id: toUserId,
            type,
            payload,
        });
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
                await this.sendSignal(peerId, 'offer', { sdp: entry.pc.localDescription });
            } catch (_) { /* ignore */ }
            entry.makingOffer = false;
        }
    }

    async replaceVideoTrack(newTrack) {
        this.updateLocalVideoTrack(newTrack);

        for (const entry of this.peers.values()) {
            let sender = entry.pc.getSenders().find(s => s.track?.kind === 'video');
            if (!sender) {
                sender = entry.pc.addTrack(newTrack, this.localStream);
            } else {
                await sender.replaceTrack(newTrack);
            }
        }

        await this.renegotiateAllPeers();
    }

    removePeer(peerId) {
        const entry = this.peers.get(peerId);
        if (!entry) return;
        try { entry.pc.close(); } catch (_) { /* ignore */ }
        entry.tile?.remove();
        this.peers.delete(peerId);
    }

    toggleAudio() {
        this.audioEnabled = !this.audioEnabled;
        this.localStream?.getAudioTracks().forEach(t => { t.enabled = this.audioEnabled; });
        return this.audioEnabled;
    }

    toggleVideo() {
        if (this.sharingScreen) return this.videoEnabled;
        this.videoEnabled = !this.videoEnabled;
        const track = this.cameraTrack || this.localStream?.getVideoTracks()[0];
        if (track) track.enabled = this.videoEnabled;
        this.localTileUpdate?.();
        return this.videoEnabled;
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
        }

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
            clearInterval(this.pollTimer);
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
    document.getElementById('ocp-pip-restore')?.classList.toggle('visible', mode === 'minimized');
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
    document.getElementById('ocp-pip-restore')?.remove();
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
                <div class="ocp-head-text">
                    <h3 id="ocp-title">Online Class</h3>
                    <p id="ocp-sub">Live class</p>
                    <span class="ocp-id-badge" id="ocp-id-badge" hidden></span>
                </div>
                <div class="ocp-actions">
                    <button type="button" class="ocp-btn ocp-icon-btn on" id="ocp-mic" title="Microphone">${ICONS.mic}</button>
                    <button type="button" class="ocp-btn ocp-icon-btn on" id="ocp-cam" title="Camera">${ICONS.cam}</button>
                    <button type="button" class="ocp-btn ocp-icon-btn" id="ocp-share" title="Share screen">${ICONS.screen}</button>
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
                        <div class="ocp-video-grid" id="ocp-video-grid">
                            <div class="ocp-tile ocp-tile--local" id="ocp-local-tile">
                                <div class="ocp-tile-avatar" id="ocp-local-avatar">?</div>
                                <video id="ocp-local-video" autoplay muted playsinline></video>
                                <span class="ocp-tile-label" id="ocp-local-label">You</span>
                            </div>
                        </div>
                    </div>
                </div>
                <aside class="ocp-chat" id="ocp-chat">
                    <div class="ocp-chat-head">
                        <span>Class comments</span>
                    </div>
                    <div class="ocp-chat-msgs" id="ocp-chat-msgs"></div>
                    <form class="ocp-chat-form" id="ocp-chat-form">
                        <input type="text" id="ocp-chat-input" placeholder="Write a comment…" maxlength="500" autocomplete="off">
                        <button type="submit" id="ocp-chat-send" title="Send comment">${ICONS.send}</button>
                    </form>
                    <div class="ocp-chat-closed" id="ocp-chat-closed" hidden>Class ended — comments are closed.</div>
                </aside>
            </div>
        </div>
    `;
    document.body.appendChild(rootEl);

    if (!document.getElementById('ocp-pip-restore')) {
        const pip = document.createElement('button');
        pip.type = 'button';
        pip.id = 'ocp-pip-restore';
        pip.className = 'ocp-pip-bar';
        pip.innerHTML = `${ICONS.video}<span>Online class — tap to expand</span>`;
        pip.addEventListener('click', restore);
        document.body.appendChild(pip);
    }

    rootEl.querySelector('#ocp-min')?.addEventListener('click', minimize);
    rootEl.querySelector('#ocp-fs')?.addEventListener('click', toggleFullscreen);
    rootEl.querySelector('#ocp-leave')?.addEventListener('click', () => closePlayer());
    rootEl.querySelector('.ocp-backdrop')?.addEventListener('click', minimize);
    rootEl.querySelector('#ocp-chat-toggle')?.addEventListener('click', () => {
        rootEl.classList.toggle('ocp-chat-open');
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

    if (!navigator.mediaDevices?.getUserMedia) {
        showError('Your browser does not support camera/microphone access.');
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
