/**
 * Floating Messenger — Meta Messenger-style chat bubble (bottom-right)
 * Uses MessagingAPI.php for threads, send, and polling.
 */
import { Api } from '../api.js';
import { Auth } from '../auth.js';
import {
    renderMessageBody,
    validateMessageFile,
    bindImagePreview,
    MSG_MAX_ATTACH,
} from '../utils/message-ui.js';
import { icon } from '../utils/icons.js';

const G  = '#00461B';
const G2 = '#006428';
const POLL_MS = 5000;

let rootEl      = null;
let pollTimer   = null;
let badgeTimer  = null;
let activeOtherId = null;
let lastMsgCount  = 0;
let lastPollAt    = null;
let pendingFile   = null;
let isOpen        = false;
let view          = 'threads'; // 'threads' | 'chat' | 'contacts'

function esc(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

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

function updateBubbleBadge(count) {
    const badge = getEl('fm-fab-badge');
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
    updateBubbleBadge(count);
    const navBadge = document.getElementById('msg-nav-badge');
    if (navBadge) {
        navBadge.textContent = count > 0 ? (count > 99 ? '99+' : count) : '';
        navBadge.style.display = count > 0 ? 'inline-flex' : 'none';
    }
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
    isOpen = true;
    rootEl?.classList.add('fm-open');
    getEl('fm-panel')?.setAttribute('aria-hidden', 'false');
}

function minimize() {
    isOpen = false;
    rootEl?.classList.remove('fm-open');
    getEl('fm-panel')?.setAttribute('aria-hidden', 'true');
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
                <div class="fm-thread-av">${initials(t.name)}</div>
                <div class="fm-thread-body">
                    <div class="fm-thread-top">
                        <span class="fm-thread-name">${esc(t.name)}</span>
                        <span class="fm-thread-time">${relativeTime(t.last_at)}</span>
                    </div>
                    <div class="fm-thread-preview">${esc((t.last_message || '').slice(0, 42))}</div>
                </div>
                ${unread > 0 ? `<span class="fm-thread-badge">${unread}</span>` : ''}
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
        lastMsgCount += msgs.length;
        await Api.post('/MessagingAPI.php?action=mark_read', { other_user_id: otherId });
        refreshUnreadBadge();
        return;
    }

    lastMsgCount = msgs.length;
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
    if (preview) {
        preview.classList.remove('fm-visible');
        preview.innerHTML = '';
    }
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

function pickAttachment() {
    getEl('fm-file')?.click();
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
        res = await Api.post('/MessagingAPI.php?action=send', {
            receiver_id: activeOtherId,
            content,
        });
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
        alert(res.message || 'Failed to send message');
    }
    input.focus();
}

function bindChatInput() {
    const input = getEl('fm-input');
    const send = getEl('fm-send');
    const attach = getEl('fm-attach');
    const fileInput = getEl('fm-file');
    if (!input || !send) return;

    input.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 96) + 'px';
    });
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    send.addEventListener('click', sendMessage);
    attach?.addEventListener('click', pickAttachment);
    fileInput?.addEventListener('change', () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        const check = validateMessageFile(file);
        if (!check.ok) {
            alert(check.message);
            fileInput.value = '';
            return;
        }
        pendingFile = file;
        showPendingFile(file);
    });
}

async function openChat(otherId, name, role = '') {
    if (!otherId) return;

    activeOtherId = otherId;
    lastMsgCount = 0;
    lastPollAt = null;
    clearPendingFile();
    expand();
    setView('chat');

    const av = getEl('fm-chat-av');
    const title = getEl('fm-chat-name');
    const sub = getEl('fm-chat-role');
    if (av) av.textContent = initials(name);
    if (title) title.textContent = name || 'Chat';
    if (sub) sub.textContent = roleLabel(role);

    const body = getEl('fm-chat-body');
    if (body) body.innerHTML = '<div class="fm-empty">Loading...</div>';

    await loadMessages(otherId);
    stopPolling();
    pollTimer = setInterval(() => {
        if (activeOtherId === otherId && isOpen) loadMessages(otherId, true);
    }, POLL_MS);
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
        <button type="button" class="fm-contact" data-id="${c.users_id}" data-name="${esc(c.name)}" data-role="${esc(c.role || '')}">
            <div class="fm-thread-av">${initials(c.name)}</div>
            <div class="fm-thread-body">
                <div class="fm-thread-name">${esc(c.name)}</div>
                <div class="fm-thread-preview">${esc(c.subject_code ? c.subject_code + ' · ' + c.subject_name : roleLabel(c.role))}</div>
            </div>
        </button>
    `).join('');

    list.querySelectorAll('.fm-contact').forEach(btn => {
        btn.addEventListener('click', () => {
            openChat(parseInt(btn.dataset.id, 10), btn.dataset.name, btn.dataset.role);
        });
    });
}

function injectStyles() {
    if (document.getElementById('fm-styles')) return;
    const style = document.createElement('style');
    style.id = 'fm-styles';
    style.textContent = `
        body.fm-mounted #sef-root { right: 100px; }
        @media(max-width:640px) {
            body.fm-mounted #sef-root { right: 84px; bottom: 16px; }
        }

        #fm-root {
            position: fixed; bottom: 24px; right: 24px; z-index: 960;
            font-family: inherit;
        }
        #fm-root * { box-sizing: border-box; }

        .fm-fab {
            width: 58px; height: 58px; border-radius: 50%;
            background: ${G};
            color: #fff; border: none; cursor: pointer;
            box-shadow: 0 6px 28px rgba(0,70,27,.4);
            display: flex; align-items: center; justify-content: center;
            transition: transform .2s, box-shadow .2s;
            position: relative;
        }
        .fm-fab:hover { transform: scale(1.05); box-shadow: 0 8px 32px rgba(0,70,27,.5); }
        .fm-fab svg { width: 28px; height: 28px; }
        .fm-fab-badge {
            position: absolute; top: -2px; right: -2px;
            min-width: 20px; height: 20px; padding: 0 5px;
            background: #EF4444; color: #fff; border-radius: 20px;
            font-size: 11px; font-weight: 700;
            display: none; align-items: center; justify-content: center;
            border: 2px solid #fff;
        }

        .fm-panel {
            position: absolute; bottom: 72px; right: 0;
            width: 360px; max-width: calc(100vw - 32px);
            height: 520px; max-height: calc(100vh - 120px);
            background: #fff; border-radius: 16px;
            box-shadow: 0 12px 48px rgba(0,0,0,.18), 0 0 0 1px rgba(0,0,0,.06);
            display: none; flex-direction: column; overflow: hidden;
            transform-origin: bottom right;
            animation: fm-pop .22s ease;
        }
        #fm-root.fm-open .fm-panel { display: flex; }
        @keyframes fm-pop {
            from { opacity: 0; transform: scale(.92) translateY(8px); }
            to   { opacity: 1; transform: scale(1) translateY(0); }
        }

        .fm-head {
            background: ${G};
            color: #fff; padding: 14px 16px;
            display: flex; align-items: center; justify-content: space-between;
            flex-shrink: 0;
        }
        .fm-head-left { display: flex; align-items: center; gap: 10px; min-width: 0; }
        .fm-head-title { font-size: 15px; font-weight: 700; margin: 0; }
        .fm-head-sub { font-size: 11px; opacity: .85; margin: 0; }
        .fm-head-actions { display: flex; gap: 4px; }
        .fm-icon-btn {
            width: 32px; height: 32px; border-radius: 50%; border: none;
            background: rgba(255,255,255,.15); color: #fff; cursor: pointer;
            display: flex; align-items: center; justify-content: center;
            font-size: 16px; transition: background .15s;
        }
        .fm-icon-btn:hover { background: rgba(255,255,255,.28); }

        .fm-chat-head { display: none; }
        #fm-root[data-view="chat"] .fm-threads-head { display: none; }
        #fm-root[data-view="chat"] .fm-chat-head { display: flex; }
        #fm-root[data-view="contacts"] .fm-threads-head { display: none; }
        #fm-root[data-view="contacts"] .fm-contacts-head { display: flex; }
        .fm-contacts-head { display: none; }

        .fm-body { flex: 1; overflow: hidden; display: flex; flex-direction: column; }
        .fm-thread-list {
            flex: 1; overflow-y: auto; padding: 6px 0;
        }
        .fm-contact-list {
            display: none; flex: 1; overflow-y: auto; padding: 6px 0;
        }
        .fm-thread, .fm-contact {
            width: 100%; display: flex; align-items: center; gap: 10px;
            padding: 10px 14px; border: none; background: transparent;
            cursor: pointer; text-align: left; transition: background .12s;
        }
        .fm-thread:hover, .fm-contact:hover { background: #F3F4F6; }
        .fm-thread.active { background: #ECFDF5; }
        .fm-thread-av {
            width: 40px; height: 40px; border-radius: 50%; flex-shrink: 0;
            background: ${G};
            color: #fff; font-size: 14px; font-weight: 700;
            display: flex; align-items: center; justify-content: center;
        }
        .fm-thread-body { flex: 1; min-width: 0; }
        .fm-thread-top { display: flex; justify-content: space-between; gap: 8px; }
        .fm-thread-name { font-size: 13px; font-weight: 700; color: #111; }
        .fm-thread-time { font-size: 11px; color: #9CA3AF; flex-shrink: 0; }
        .fm-thread-preview { font-size: 12px; color: #6B7280; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px; }
        .fm-thread-badge {
            background: ${G}; color: #fff; font-size: 10px; font-weight: 700;
            min-width: 18px; height: 18px; border-radius: 20px;
            display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }

        #fm-root[data-view="chat"] .fm-thread-list,
        #fm-root[data-view="chat"] .fm-contact-list,
        #fm-root[data-view="contacts"] .fm-thread-list { display: none; }
        #fm-root[data-view="threads"] .fm-contact-list { display: none; }
        #fm-root[data-view="threads"] .fm-thread-list { display: block; }
        #fm-root[data-view="chat"] .fm-chat-wrap { display: flex; }
        #fm-root[data-view="contacts"] .fm-contact-list { display: block; }
        .fm-chat-wrap {
            display: none; flex: 1; flex-direction: column; min-height: 0;
        }
        .fm-chat-body {
            flex: 1; overflow-y: auto; padding: 14px;
            background: #F9FAFB; display: flex; flex-direction: column; gap: 8px;
        }
        .fm-row { display: flex; }
        .fm-row.mine { justify-content: flex-end; }
        .fm-row.theirs { justify-content: flex-start; }
        .fm-msg {
            max-width: 78%; padding: 8px 12px; border-radius: 18px;
            font-size: 13px; line-height: 1.45; word-break: break-word;
            position: relative;
        }
        .fm-row.mine .fm-msg {
            background: ${G}; color: #fff;
            border-bottom-right-radius: 4px;
        }
        .fm-row.theirs .fm-msg {
            background: #fff; color: #111; border: 1px solid #E5E7EB;
            border-bottom-left-radius: 4px;
        }
        .fm-msg-time {
            display: block; font-size: 10px; opacity: .65; margin-top: 4px; text-align: right;
        }
        .fm-date { text-align: center; margin: 6px 0; }
        .fm-date span {
            font-size: 11px; color: #6B7280; background: #E5E7EB;
            padding: 3px 10px; border-radius: 20px;
        }

        .fm-attach-preview {
            display:none; padding:8px 12px; background:#F9FAFB;
            border-top:1px solid #F0F0F0; font-size:12px;
            align-items:center; justify-content:space-between; gap:8px;
        }
        .fm-attach-preview.fm-visible { display:flex; }
        .fm-att-pending { color:#374151; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .fm-att-remove {
            border:none; background:#E5E7EB; width:24px; height:24px;
            border-radius:50%; cursor:pointer; font-size:16px; line-height:1; flex-shrink:0;
        }
        .fm-att-img { max-width:min(220px, 100%); max-height:160px; }
        .fm-row.mine .msg-att-file, .fm-row.mine .msg-att-pdf { color:#fff; }
        .fm-footer {
            padding: 10px 12px; border-top: 1px solid #F0F0F0;
            display: flex; gap: 8px; align-items: flex-end; background: #fff;
        }
        .fm-attach-btn {
            width:36px; height:36px; border-radius:50%; border:1px solid #E5E7EB;
            background:#fff; cursor:pointer; flex-shrink:0; font-size:16px;
            display:flex; align-items:center; justify-content:center;
        }
        .fm-attach-btn:hover { background:#F3F4F6; }
        .fm-input {
            flex: 1; resize: none; border: 1px solid #E5E7EB;
            border-radius: 20px; padding: 9px 14px; font-size: 13px;
            font-family: inherit; max-height: 96px; outline: none;
        }
        .fm-input:focus { border-color: ${G}; }
        .fm-send {
            width: 36px; height: 36px; border-radius: 50%; border: none;
            background: ${G}; color: #fff; cursor: pointer; flex-shrink: 0;
            font-size: 15px; display: flex; align-items: center; justify-content: center;
        }
        .fm-send:disabled { opacity: .5; cursor: not-allowed; }

        .fm-empty {
            padding: 32px 20px; text-align: center; color: #9CA3AF; font-size: 13px; line-height: 1.5;
        }

        @media(max-width:768px) {
            .fm-panel {
                width:min(100vw - 24px, 360px);
                height:min(100vh - 88px, 520px);
                bottom:68px;
            }
            .fm-att-img { max-width:100%; max-height:140px; }
        }
        @media(max-width:480px) {
            #fm-root { bottom: 16px; right: 16px; }
            .fm-panel {
                width:calc(100vw - 20px); right:-4px;
                height:calc(100dvh - 80px); max-height:none;
            }
            body.fm-mounted #sef-root { right: 76px; bottom: 16px; }
        }
    `;
    document.head.appendChild(style);
}

function bindRootEvents() {
    getEl('fm-bubble')?.addEventListener('click', toggle);
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
}

export function mountFloatingMessenger() {
    if (rootEl) return;
    injectStyles();
    document.body.classList.add('fm-mounted');

    rootEl = document.createElement('div');
    rootEl.id = 'fm-root';
    rootEl.dataset.view = 'threads';
    rootEl.innerHTML = `
        <div class="fm-panel" id="fm-panel" aria-hidden="true">
            <div class="fm-head fm-threads-head">
                <div class="fm-head-left">
                    <div>
                        <p class="fm-head-title">Chats</p>
                        <p class="fm-head-sub">Messages</p>
                    </div>
                </div>
                <div class="fm-head-actions">
                    <button type="button" class="fm-icon-btn" id="fm-new" title="New message">+</button>
                    <button type="button" class="fm-icon-btn fm-minimize-btn" title="Minimize">&minus;</button>
                </div>
            </div>
            <div class="fm-head fm-chat-head">
                <div class="fm-head-left">
                    <button type="button" class="fm-icon-btn" id="fm-back" title="Back">&#8592;</button>
                    <div class="fm-thread-av" id="fm-chat-av">?</div>
                    <div style="min-width:0">
                        <p class="fm-head-title" id="fm-chat-name">Chat</p>
                        <p class="fm-head-sub" id="fm-chat-role">Contact</p>
                    </div>
                </div>
                <div class="fm-head-actions">
                    <button type="button" class="fm-icon-btn fm-minimize-btn" title="Minimize">&minus;</button>
                </div>
            </div>
            <div class="fm-head fm-contacts-head">
                <div class="fm-head-left">
                    <button type="button" class="fm-icon-btn" id="fm-back-contacts" title="Back">&#8592;</button>
                    <div>
                        <p class="fm-head-title">New message</p>
                        <p class="fm-head-sub">Pick a contact</p>
                    </div>
                </div>
                <div class="fm-head-actions">
                    <button type="button" class="fm-icon-btn fm-minimize-btn" title="Minimize">&minus;</button>
                </div>
            </div>
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
        <button type="button" class="fm-fab" id="fm-bubble" aria-label="Open messages">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.15 2 11.25c0 2.91 1.45 5.54 3.78 7.26L4.5 21.5l3.2-1.68c1.12.31 2.31.48 3.55.48 5.52 0 10-4.15 10-9.25S17.52 2 12 2z"/></svg>
            <span class="fm-fab-badge" id="fm-fab-badge"></span>
        </button>
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
    document.body.classList.remove('fm-mounted');
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
