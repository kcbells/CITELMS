/**
 * Floating Messenger — Facebook desktop style, anchored to topbar button.
 * Uses MessagingAPI.php for threads, send, and polling.
 */
import { Api } from '../api.js';
import { Auth } from '../auth.js';
import {
    renderMessageBody,
    validateMessageFile,
    bindImagePreview,
} from '../utils/message-ui.js';
import { icon } from '../utils/icons.js';
import { notify } from '../utils/notify.js';
import { esc } from '../utils/classroom-ui.js';

const G  = '#00461B';
const G2 = '#006428';
const POLL_MS = 5000;

let rootEl        = null;
let pollTimer     = null;
let badgeTimer    = null;
let activeOtherId = null;
let lastPollAt    = null;
let pendingFile   = null;
let isOpen        = false;
let view          = 'threads'; // 'threads' | 'chat' | 'contacts'

// esc() now imported from classroom-ui.js — the DOM-based version there also
// correctly escapes single quotes, which this file's old regex-based copy did not.

function initials(name) {
    return (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function relativeTime(ts) {
    if (!ts) return '';
    const d = new Date(ts.replace(' ', 'T'));
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return 'now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h';
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function fmtTime(ts) {
    if (!ts) return '';
    return new Date(ts.replace(' ', 'T')).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function roleLabel(role) {
    if (role === 'instructor') return 'Instructor';
    if (role === 'student') return 'Classmate';
    return 'Contact';
}

function getEl(id) {
    return rootEl?.querySelector('#' + id) ?? null;
}

function stopPolling() {
    clearInterval(pollTimer);
    pollTimer = null;
}

function updateTopbarBadge(count) {
    const badge = document.getElementById('fm-topbar-badge');
    if (!badge) return;
    if (count > 0) {
        badge.textContent = count > 99 ? '99+' : String(count);
        badge.style.display = 'flex';
    } else {
        badge.style.display = 'none';
    }
}

async function refreshUnreadBadge() {
    const res = await Api.get('/MessagingAPI.php?action=unread_count');
    const count = res.success ? res.count : 0;
    updateTopbarBadge(count);
}

function startBadgePolling() {
    refreshUnreadBadge();
    clearInterval(badgeTimer);
    badgeTimer = setInterval(refreshUnreadBadge, 30000);
}

function setView(next) {
    view = next;
    if (rootEl) rootEl.dataset.view = next;
}

function expand() {
    // Only one topbar popover open at a time. The messenger's own button calls
    // stopPropagation(), so topbar.js's document-level "close dropdowns" handler
    // never fires for it — close the notification / profile dropdowns here.
    document.querySelectorAll('.dropdown.active').forEach(d => d.classList.remove('active'));

    isOpen = true;
    rootEl?.classList.add('fm-open');
    document.getElementById('fm-topbar-btn')?.classList.add('active');
}

function minimize() {
    isOpen = false;
    rootEl?.classList.remove('fm-open');
    document.getElementById('fm-topbar-btn')?.classList.remove('active');
    stopPolling();
}

function toggle() {
    if (isOpen) minimize();
    else {
        expand();
        if (view === 'threads') loadThreads();
    }
}

async function loadThreads() {
    const list = getEl('fm-thread-list');
    if (!list) return;

    list.innerHTML = '<div class="fm-empty">Loading...</div>';
    const res = await Api.get('/MessagingAPI.php?action=threads');
    const threads = res.success ? res.data : [];

    if (!threads.length) {
        list.innerHTML = '<div class="fm-empty">No chats yet.<br>Tap <strong>+</strong> to start.</div>';
        return;
    }

    list.innerHTML = threads.map(t => {
        const unread = parseInt(t.unread || 0);
        const active = activeOtherId === parseInt(t.other_id) ? 'active' : '';
        return `
            <button type="button" class="fm-thread ${active}" data-id="${t.other_id}" data-name="${esc(t.name)}">
                <div class="fm-av">${initials(t.name)}</div>
                <div class="fm-thread-body">
                    <div class="fm-thread-top">
                        <span class="fm-thread-name ${unread > 0 ? 'unread' : ''}">${esc(t.name)}</span>
                        <span class="fm-thread-time">${relativeTime(t.last_at)}</span>
                    </div>
                    <div class="fm-thread-preview ${unread > 0 ? 'unread' : ''}">${esc((t.last_message || '').slice(0, 42))}</div>
                </div>
                ${unread > 0 ? `<span class="fm-thread-dot"></span>` : ''}
            </button>`;
    }).join('');

    list.querySelectorAll('.fm-thread').forEach(btn => {
        btn.addEventListener('click', () => {
            openChat(parseInt(btn.dataset.id, 10), btn.dataset.name);
        });
    });
}

function renderMessageHtml(m, meId) {
    const mine = parseInt(m.sender_id) === parseInt(meId);
    const inner = renderMessageBody(m, meId, esc, { imgClass: 'fm-att-img msg-att-img' });
    return `
        <div class="fm-row msg-row ${mine ? 'mine' : 'theirs'}" data-mid="${m.message_id}">
            <div class="fm-msg">${inner}<span class="fm-msg-time">${fmtTime(m.created_at)}</span></div>
        </div>`;
}

function appendMessages(msgs, body, meId) {
    const wasAtBottom = body.scrollTop + body.clientHeight >= body.scrollHeight - 40;
    const frag = document.createDocumentFragment();
    let lastDate = '';
    const existing = new Set([...body.querySelectorAll('[data-mid]')].map(el => el.dataset.mid));

    for (const m of msgs) {
        if (existing.has(String(m.message_id))) continue;
        const d = new Date((m.created_at || '').replace(' ', 'T'));
        const dateStr = d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
        if (dateStr !== lastDate) {
            const div = document.createElement('div');
            div.className = 'fm-date';
            div.innerHTML = `<span>${dateStr}</span>`;
            frag.appendChild(div);
            lastDate = dateStr;
        }
        const wrap = document.createElement('div');
        wrap.innerHTML = renderMessageHtml(m, meId);
        frag.appendChild(wrap.firstElementChild);
    }
    body.appendChild(frag);
    bindImagePreview(body);
    if (wasAtBottom) body.scrollTop = body.scrollHeight;
}

async function loadMessages(otherId, isPolling = false) {
    const body = getEl('fm-chat-body');
    if (!body) return;

    const sinceQ = isPolling && lastPollAt ? `&since=${encodeURIComponent(lastPollAt)}` : '';
    const res = await Api.get(`/MessagingAPI.php?action=messages&with=${otherId}${sinceQ}`);
    const msgs = res.success ? res.data : [];
    const me = Auth.user()?.users_id;

    if (isPolling) {
        if (!msgs.length) return;
        if (body.querySelector('.fm-empty')) body.innerHTML = '';
        appendMessages(msgs, body, me);
        lastPollAt = msgs[msgs.length - 1].created_at;
        await Api.post('/MessagingAPI.php?action=mark_read', { other_user_id: otherId });
        refreshUnreadBadge();
        return;
    }

    lastPollAt = msgs.length ? msgs[msgs.length - 1].created_at : null;

    if (!msgs.length) {
        body.innerHTML = '<div class="fm-empty">No messages yet. Say hello!</div>';
    } else {
        let html = '';
        let lastDate = '';
        for (const m of msgs) {
            const d = new Date((m.created_at || '').replace(' ', 'T'));
            const dateStr = d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
            if (dateStr !== lastDate) {
                html += `<div class="fm-date"><span>${dateStr}</span></div>`;
                lastDate = dateStr;
            }
            html += renderMessageHtml(m, me);
        }
        body.innerHTML = html;
        bindImagePreview(body);
        body.scrollTop = body.scrollHeight;
    }

    await Api.post('/MessagingAPI.php?action=mark_read', { other_user_id: otherId });
    refreshUnreadBadge();
    loadThreads();
}

function clearPendingFile() {
    pendingFile = null;
    const preview = getEl('fm-attach-preview');
    const input = getEl('fm-file');
    if (preview) { preview.classList.remove('fm-visible'); preview.innerHTML = ''; }
    if (input) input.value = '';
}

function showPendingFile(file) {
    const preview = getEl('fm-attach-preview');
    if (!preview) return;
    preview.classList.add('fm-visible');
    preview.innerHTML = `
        <span class="fm-att-pending">${icon('attach', { size: 14, className: 'ui-icon-inline' })} ${esc(file.name)} (${(file.size / 1024).toFixed(0)} KB)</span>
        <button type="button" class="fm-att-remove" id="fm-att-remove" title="Remove">&times;</button>`;
    preview.querySelector('#fm-att-remove')?.addEventListener('click', clearPendingFile);
}

async function sendMessage() {
    const input = getEl('fm-input');
    const btn = getEl('fm-send');
    if (!input || !activeOtherId) return;

    const content = input.value.trim();
    if (!content && !pendingFile) return;

    btn.disabled = true;
    input.disabled = true;

    let res;
    if (pendingFile) {
        const fd = new FormData();
        fd.append('receiver_id', String(activeOtherId));
        fd.append('content', content);
        fd.append('attachment', pendingFile);
        res = await Api.postForm('/MessagingAPI.php?action=send', fd);
    } else {
        res = await Api.post('/MessagingAPI.php?action=send', { receiver_id: activeOtherId, content });
    }

    input.disabled = false;
    btn.disabled = false;

    if (res.success) {
        input.value = '';
        input.style.height = 'auto';
        clearPendingFile();
        lastPollAt = null;
        await loadMessages(activeOtherId);
        loadThreads();
    } else {
        notify.error(res.message || 'Failed to send message');
    }
    input.focus();
}

function bindChatInput() {
    const input = getEl('fm-input');
    const send  = getEl('fm-send');
    const attach = getEl('fm-attach');
    const fileInput = getEl('fm-file');
    if (!input || !send) return;

    input.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 96) + 'px';
    });
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });
    send.addEventListener('click', sendMessage);
    attach?.addEventListener('click', () => getEl('fm-file')?.click());
    fileInput?.addEventListener('change', () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        const check = validateMessageFile(file);
        if (!check.ok) { notify.error(check.message); fileInput.value = ''; return; }
        pendingFile = file;
        showPendingFile(file);
    });
}

async function openContacts() {
    setView('contacts');
    const list = getEl('fm-contact-list');
    if (!list) return;

    list.innerHTML = '<div class="fm-empty">Loading...</div>';
    const res = await Api.get('/MessagingAPI.php?action=contacts');
    const contacts = res.success ? res.data : [];

    if (!contacts.length) {
        list.innerHTML = '<div class="fm-empty">No contacts yet.<br>Enroll in a class first.</div>';
        return;
    }

    list.innerHTML = contacts.map(c => `
        <button type="button" class="fm-thread" data-id="${c.users_id}" data-name="${esc(c.name)}" data-role="${esc(c.role || '')}">
            <div class="fm-av">${initials(c.name)}</div>
            <div class="fm-thread-body">
                <div class="fm-thread-name">${esc(c.name)}</div>
                <div class="fm-thread-preview">${esc(c.subject_code ? c.subject_code + ' · ' + c.subject_name : roleLabel(c.role))}</div>
            </div>
        </button>
    `).join('');

    list.querySelectorAll('.fm-thread').forEach(btn => {
        btn.addEventListener('click', () => {
            openChat(parseInt(btn.dataset.id, 10), btn.dataset.name, btn.dataset.role);
        });
    });
}

async function openChat(otherId, name, role = '') {
    if (!otherId) return;
    activeOtherId = otherId;
    lastPollAt = null;
    clearPendingFile();
    expand();
    setView('chat');

    const av    = getEl('fm-chat-av');
    const title = getEl('fm-chat-name');
    const sub   = getEl('fm-chat-role');
    if (av)    av.textContent    = initials(name);
    if (title) title.textContent = name || 'Chat';
    if (sub)   sub.textContent   = roleLabel(role);

    const body = getEl('fm-chat-body');
    if (body) body.innerHTML = '<div class="fm-empty">Loading...</div>';

    await loadMessages(otherId);
    stopPolling();
    pollTimer = setInterval(() => {
        if (activeOtherId === otherId && isOpen) loadMessages(otherId, true);
    }, POLL_MS);
}

function injectStyles() {
    if (document.getElementById('fm-styles')) return;
    const style = document.createElement('style');
    style.id = 'fm-styles';
    style.textContent = `
        /* ── Topbar messenger button badge ──────────────────────────── */
        #fm-topbar-btn { position: relative; }
        #fm-topbar-btn.active { background: rgba(0,70,27,.10); }
        #fm-topbar-badge {
            position: absolute; top: 2px; right: 2px;
            min-width: 18px; height: 18px; padding: 0 4px;
            background: #EF4444; color: #fff; border-radius: 20px;
            font-size: 10px; font-weight: 700;
            display: none; align-items: center; justify-content: center;
            border: 2px solid #fff; pointer-events: none;
        }

        /* ── Root container ─────────────────────────────────────────── */
        #fm-root {
            position: fixed;
            top: 0; right: 0;
            z-index: 1200;
            font-family: inherit;
        }
        #fm-root * { box-sizing: border-box; }

        /* ── Panel ──────────────────────────────────────────────────── */
        .fm-panel {
            position: fixed;
            top: 58px;
            right: 58px;
            width: 360px;
            max-width: calc(100vw - 24px);
            height: 540px;
            max-height: calc(100vh - 72px);
            background: #fff;
            border-radius: 12px;
            box-shadow: 0 8px 40px rgba(0,0,0,.22), 0 0 0 1px rgba(0,0,0,.07);
            display: none;
            flex-direction: column;
            overflow: hidden;
            transform-origin: top right;
            animation: fm-pop .18s ease;
        }
        #fm-root.fm-open .fm-panel { display: flex; }
        @keyframes fm-pop {
            from { opacity: 0; transform: scale(.94) translateY(-6px); }
            to   { opacity: 1; transform: scale(1) translateY(0); }
        }

        /* ── Panel header ───────────────────────────────────────────── */
        .fm-head {
            padding: 14px 16px 10px;
            display: flex; align-items: center; justify-content: space-between;
            flex-shrink: 0; border-bottom: 1px solid #F0F0F0;
        }
        .fm-head-left { display: flex; align-items: center; gap: 10px; min-width: 0; }
        .fm-head-title { font-size: 20px; font-weight: 800; color: #111827; margin: 0; }
        .fm-head-sub   { font-size: 12px; color: #6B7280; margin: 0; }
        .fm-head-actions { display: flex; gap: 4px; flex-shrink: 0; }
        .fm-icon-btn {
            width: 34px; height: 34px; border-radius: 50%; border: none;
            background: #F3F4F6; color: #374151; cursor: pointer;
            display: flex; align-items: center; justify-content: center;
            font-size: 16px; transition: background .13s;
        }
        .fm-icon-btn:hover { background: #E5E7EB; }

        /* view switching */
        .fm-chat-head     { display: none; }
        .fm-contacts-head { display: none; }
        #fm-root[data-view="chat"]     .fm-threads-head  { display: none; }
        #fm-root[data-view="chat"]     .fm-chat-head     { display: flex; }
        #fm-root[data-view="contacts"] .fm-threads-head  { display: none; }
        #fm-root[data-view="contacts"] .fm-contacts-head { display: flex; }

        /* ── Thread / contact list ──────────────────────────────────── */
        .fm-body { flex: 1; overflow: hidden; display: flex; flex-direction: column; }

        .fm-search-wrap {
            padding: 8px 12px 6px; border-bottom: 1px solid #F3F4F6;
        }
        .fm-search {
            width: 100%; padding: 8px 14px; border: none; border-radius: 20px;
            background: #F0F2F5; font-size: 13px; font-family: inherit; outline: none;
            color: #111827;
        }
        .fm-search::placeholder { color: #9CA3AF; }

        .fm-thread-list, .fm-contact-list {
            flex: 1; overflow-y: auto; padding: 4px 0;
        }
        .fm-contact-list { display: none; }

        .fm-thread {
            width: 100%; display: flex; align-items: center; gap: 12px;
            padding: 8px 12px; border: none; background: transparent;
            cursor: pointer; text-align: left; transition: background .12s;
            border-radius: 8px; margin: 0 4px; width: calc(100% - 8px);
        }
        .fm-thread:hover  { background: #F0F2F5; }
        .fm-thread.active { background: #E8F5EC; }

        .fm-av {
            width: 44px; height: 44px; border-radius: 50%; flex-shrink: 0;
            background: ${G}; color: #fff; font-size: 15px; font-weight: 700;
            display: flex; align-items: center; justify-content: center;
        }
        .fm-thread-body  { flex: 1; min-width: 0; }
        .fm-thread-top   { display: flex; justify-content: space-between; align-items: baseline; gap: 6px; }
        .fm-thread-name  { font-size: 14px; font-weight: 500; color: #111827; }
        .fm-thread-name.unread { font-weight: 700; }
        .fm-thread-time  { font-size: 11px; color: #9CA3AF; flex-shrink: 0; }
        .fm-thread-preview { font-size: 12.5px; color: #6B7280; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 1px; }
        .fm-thread-preview.unread { color: #111827; font-weight: 700; }
        .fm-thread-dot {
            width: 10px; height: 10px; border-radius: 50%; background: ${G};
            flex-shrink: 0; margin-left: 4px;
        }

        /* view switching */
        #fm-root[data-view="chat"]     .fm-thread-list,
        #fm-root[data-view="chat"]     .fm-contact-list,
        #fm-root[data-view="contacts"] .fm-thread-list { display: none; }
        #fm-root[data-view="threads"]  .fm-thread-list { display: block; }
        #fm-root[data-view="chat"]     .fm-chat-wrap   { display: flex; }
        #fm-root[data-view="contacts"] .fm-contact-list { display: block; }

        /* ── Chat view ──────────────────────────────────────────────── */
        .fm-chat-wrap {
            display: none; flex: 1; flex-direction: column; min-height: 0;
        }
        .fm-chat-body {
            flex: 1; overflow-y: auto; padding: 12px 14px;
            background: #F0F2F5; display: flex; flex-direction: column; gap: 6px;
        }
        .fm-row { display: flex; }
        .fm-row.mine   { justify-content: flex-end; }
        .fm-row.theirs { justify-content: flex-start; }
        .fm-msg {
            max-width: 75%; padding: 8px 12px; border-radius: 18px;
            font-size: 13.5px; line-height: 1.45; word-break: break-word;
            position: relative;
        }
        .fm-row.mine   .fm-msg { background: ${G}; color: #fff; border-bottom-right-radius: 4px; }
        .fm-row.theirs .fm-msg { background: #fff; color: #111; border-bottom-left-radius: 4px; box-shadow: 0 1px 2px rgba(0,0,0,.08); }
        .fm-msg-time {
            display: block; font-size: 10px; opacity: .55; margin-top: 3px; text-align: right;
        }
        .fm-date { text-align: center; margin: 8px 0; }
        .fm-date span {
            font-size: 11px; color: #6B7280; background: rgba(255,255,255,.7);
            padding: 3px 10px; border-radius: 20px;
        }

        /* ── Attach preview ─────────────────────────────────────────── */
        .fm-attach-preview {
            display: none; padding: 8px 12px; background: #F9FAFB;
            border-top: 1px solid #F0F0F0; font-size: 12px;
            align-items: center; justify-content: space-between; gap: 8px;
        }
        .fm-attach-preview.fm-visible { display: flex; }
        .fm-att-pending { color: #374151; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .fm-att-remove {
            border: none; background: #E5E7EB; width: 24px; height: 24px;
            border-radius: 50%; cursor: pointer; font-size: 16px; line-height: 1; flex-shrink: 0;
        }
        .fm-att-img { max-width: min(220px, 100%); max-height: 160px; border-radius: 8px; }
        .fm-row.mine .msg-att-file,
        .fm-row.mine .msg-att-pdf { color: #fff; }

        /* ── Footer / input ─────────────────────────────────────────── */
        .fm-footer {
            padding: 10px 12px; border-top: 1px solid #F0F0F0;
            display: flex; gap: 8px; align-items: flex-end; background: #fff;
        }
        .fm-attach-btn {
            width: 36px; height: 36px; border-radius: 50%; border: 1px solid #E5E7EB;
            background: #fff; cursor: pointer; flex-shrink: 0;
            display: flex; align-items: center; justify-content: center;
            color: ${G}; transition: background .12s;
        }
        .fm-attach-btn:hover { background: #F3F4F6; }
        .fm-input {
            flex: 1; resize: none; border: none; border-radius: 20px;
            background: #F0F2F5; padding: 9px 14px; font-size: 13.5px;
            font-family: inherit; max-height: 96px; outline: none;
        }
        .fm-input:focus { background: #E8EAED; }
        .fm-send {
            width: 36px; height: 36px; border-radius: 50%; border: none;
            background: ${G}; color: #fff; cursor: pointer; flex-shrink: 0;
            display: flex; align-items: center; justify-content: center;
            transition: background .12s;
        }
        .fm-send:hover { background: ${G2}; }
        .fm-send:disabled { opacity: .5; cursor: not-allowed; }

        .fm-empty {
            padding: 32px 20px; text-align: center; color: #9CA3AF; font-size: 13px; line-height: 1.6;
        }

        /* chat avatar in header */
        .fm-chat-av {
            width: 36px; height: 36px; border-radius: 50%; background: ${G};
            color: #fff; font-size: 13px; font-weight: 700;
            display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }

        /* ── New chat button row under title ───────────────────────── */
        .fm-action-row {
            display: flex; gap: 8px; padding: 8px 12px 6px; border-bottom: 1px solid #F3F4F6;
        }
        .fm-action-pill {
            display: inline-flex; align-items: center; gap: 6px;
            padding: 7px 14px; border-radius: 20px; border: none;
            background: #F0F2F5; color: #374151; font-size: 13px; font-weight: 600;
            cursor: pointer; font-family: inherit; transition: background .12s;
        }
        .fm-action-pill:hover { background: #E5E7EB; }

        /* ── Mobile ─────────────────────────────────────────────────── */
        @media (max-width: 640px) {
            .fm-panel {
                top: 56px; right: 8px; left: 8px; width: auto;
                height: calc(100dvh - 72px); max-height: none; border-radius: 12px;
            }
        }
    `;
    document.head.appendChild(style);
}

function bindRootEvents() {
    rootEl?.querySelectorAll('.fm-minimize-btn').forEach(btn => btn.addEventListener('click', minimize));

    getEl('fm-new')?.addEventListener('click', openContacts);

    getEl('fm-back')?.addEventListener('click', () => {
        stopPolling();
        activeOtherId = null;
        setView('threads');
        loadThreads();
    });

    getEl('fm-back-contacts')?.addEventListener('click', () => {
        setView('threads');
        loadThreads();
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
        if (!isOpen) return;
        const btn = document.getElementById('fm-topbar-btn');
        if (rootEl && !rootEl.contains(e.target) && btn && !btn.contains(e.target)) {
            minimize();
        }
    }, true);

    // Topbar button
    document.getElementById('fm-topbar-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        toggle();
    });
}

export function mountFloatingMessenger() {
    if (rootEl) return;
    injectStyles();

    rootEl = document.createElement('div');
    rootEl.id = 'fm-root';
    rootEl.dataset.view = 'threads';

    rootEl.innerHTML = `
        <div class="fm-panel" id="fm-panel" aria-hidden="true">

            <!-- Threads header -->
            <div class="fm-head fm-threads-head">
                <p class="fm-head-title">Chats</p>
                <div class="fm-head-actions">
                    <button type="button" class="fm-icon-btn" id="fm-new" title="New message">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                    </button>
                </div>
            </div>
            <div class="fm-search-wrap fm-threads-head">
                <input type="search" class="fm-search" placeholder="Search Messenger" autocomplete="off">
            </div>

            <!-- Chat header -->
            <div class="fm-head fm-chat-head">
                <div class="fm-head-left">
                    <button type="button" class="fm-icon-btn" id="fm-back" title="Back">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                    </button>
                    <div class="fm-chat-av" id="fm-chat-av">?</div>
                    <div style="min-width:0">
                        <p class="fm-head-title" id="fm-chat-name" style="font-size:15px;font-weight:700">Chat</p>
                        <p class="fm-head-sub" id="fm-chat-role">Contact</p>
                    </div>
                </div>
            </div>

            <!-- Contacts header -->
            <div class="fm-head fm-contacts-head">
                <div class="fm-head-left">
                    <button type="button" class="fm-icon-btn" id="fm-back-contacts" title="Back">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                    </button>
                    <p class="fm-head-title" style="font-size:16px">New message</p>
                </div>
            </div>

            <!-- Body -->
            <div class="fm-body">
                <div class="fm-thread-list" id="fm-thread-list"></div>
                <div class="fm-contact-list" id="fm-contact-list"></div>
                <div class="fm-chat-wrap">
                    <div class="fm-chat-body" id="fm-chat-body"></div>
                    <div class="fm-attach-preview" id="fm-attach-preview" style="display:none"></div>
                    <div class="fm-footer">
                        <button type="button" class="fm-attach-btn" id="fm-attach" title="Attach file (max 2MB)">${icon('attach')}</button>
                        <input type="file" id="fm-file" accept="image/jpeg,image/png,image/gif,image/webp,application/pdf" hidden>
                        <textarea class="fm-input" id="fm-input" rows="1" placeholder="Aa" maxlength="2000"></textarea>
                        <button type="button" class="fm-send" id="fm-send" title="Send">${icon('send')}</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(rootEl);
    bindRootEvents();
    bindChatInput();
    startBadgePolling();
}

export function unmountFloatingMessenger() {
    stopPolling();
    clearInterval(badgeTimer);
    badgeTimer = null;
    rootEl?.remove();
    rootEl = null;
    activeOtherId = null;
    isOpen = false;
}

/** Open floating chat with a specific person (from subject People tab, etc.) */
export function openFloatingChat(userId, name, role = '') {
    if (!rootEl) mountFloatingMessenger();
    openChat(userId, name, role);
}

export const FloatingMessenger = {
    mount: mountFloatingMessenger,
    unmount: unmountFloatingMessenger,
    open: openFloatingChat,
    toggle,
    minimize,
};
