/**
 * Student Messages — split-panel chat (student ↔ instructor)
 * Polling every 3 s keeps messages "real-time".
 */
import { Api } from '../../api.js';
import { Auth } from '../../auth.js';
import { renderMessageBody, validateMessageFile, bindImagePreview } from '../../utils/message-ui.js';
import {
    messagePageStyles, messagePageHeader, messageSidebarShell,
    messagePlaceholder, applyMessagePageBg,
} from '../../utils/message-page-ui.js';
import { L, icon } from '../../utils/action-labels.js';

const inl = { size: 14, className: 'ui-icon-inline' };

let pollTimer  = null;
let badgeTimer = null;
let activeOtherId = null;
let pendingFile = null;
let allThreads = [];

// ── Helpers ────────────────────────────────────────────────────────────────

function esc(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function relativeTime(ts) {
    if (!ts) return '';
    const d = new Date(ts.replace(' ', 'T'));
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60)  return 'Just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    return d.toLocaleDateString();
}

function fmtTime(ts) {
    if (!ts) return '';
    const d = new Date(ts.replace(' ', 'T'));
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ── Main render ────────────────────────────────────────────────────────────

export async function render(container) {
    // Stop previous polling on page leave
    clearInterval(pollTimer);
    clearInterval(badgeTimer);
    activeOtherId = null;

    container.innerHTML = `
        <style>${messagePageStyles()}</style>
        <div class="msg-page">
            ${messagePageHeader('Chat with your instructors about classwork, lessons, and school updates.')}
            <div class="msg-layout">
                ${messageSidebarShell(L.newMessage)}
                <div class="msg-main" id="msg-main">
                    ${messagePlaceholder(
                        'Select a conversation',
                        'Pick someone from the list on the left, or tap New Message to start chatting.'
                    )}
                </div>
            </div>
        </div>
    `;

    applyMessagePageBg(container);
    await loadThreads();
    startBadgePolling();

    document.getElementById('btn-new-chat').addEventListener('click', openNewChatModal);
    document.getElementById('msg-thread-search')?.addEventListener('input', (e) => {
        renderThreadList(e.target.value);
    });

    // If URL has ?with=ID open that thread immediately
    const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
    if (params.get('with')) {
        openThread(
            parseInt(params.get('with'), 10),
            params.get('name') || 'Chat',
            params.get('role') || ''
        );
    }
}

// ── Thread list ────────────────────────────────────────────────────────────

async function loadThreads() {
    const res = await Api.get('/MessagingAPI.php?action=threads');
    allThreads = res.success ? res.data : [];
    const q = document.getElementById('msg-thread-search')?.value || '';
    renderThreadList(q);
}

function renderThreadList(query = '') {
    const list = document.getElementById('thread-list');
    if (!list) return;

    const q = query.toLowerCase().trim();
    const threads = q
        ? allThreads.filter(t =>
            (t.name || '').toLowerCase().includes(q)
            || (t.last_message || '').toLowerCase().includes(q))
        : allThreads;

    if (!allThreads.length) {
        list.innerHTML = '<div class="thread-empty">No conversations yet.<br>Tap <strong>New Message</strong> to start.</div>';
        return;
    }

    if (!threads.length) {
        list.innerHTML = '<div class="thread-empty">No matches for your search.</div>';
        return;
    }

    list.innerHTML = threads.map(t => {
        const initials = (t.name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
        const unread = parseInt(t.unread || 0);
        const active = activeOtherId === parseInt(t.other_id) ? 'active' : '';
        return `
            <div class="thread-item ${active}" data-id="${t.other_id}" data-name="${esc(t.name)}" onclick="window._openThread(${t.other_id}, '${esc(t.name)}')">
                <div class="thread-avatar">${initials}</div>
                <div class="thread-info">
                    <div class="thread-name">${esc(t.name)}</div>
                    <div class="thread-preview">${esc((t.last_message || '').slice(0, 50))}</div>
                </div>
                <div class="thread-meta">
                    <span class="thread-time">${relativeTime(t.last_at)}</span>
                    ${unread > 0 ? `<span class="thread-badge">${unread}</span>` : ''}
                </div>
            </div>`;
    }).join('');
}

// ── Open a thread (chat window) ────────────────────────────────────────────

window._openThread = function(otherId, name) { openThread(otherId, name); };

async function openThread(otherId, name, otherRole = '') {
    clearInterval(pollTimer);
    activeOtherId = otherId;
    pendingFile = null;

    // Mark active in thread list
    document.querySelectorAll('.thread-item').forEach(el => {
        el.classList.toggle('active', parseInt(el.dataset.id) === otherId);
    });

    const main = document.getElementById('msg-main');
    if (!main) return;

    const initials = (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

    main.innerHTML = `
        <div class="msg-topbar">
            <div class="msg-topbar-avatar">${initials}</div>
            <div>
                <div class="msg-topbar-name">${esc(name)}</div>
                <div class="msg-topbar-role">${esc(otherRole === 'instructor' ? 'Instructor' : otherRole === 'student' ? 'Classmate' : 'Contact')}</div>
            </div>
        </div>
        <div class="msg-body" id="chat-body">
            <div style="text-align:center;padding:20px;color:#9ca3af;font-size:13px">Loading messages...</div>
        </div>
        <div class="msg-att-preview" id="msg-att-preview"></div>
        <div class="msg-footer">
            <div class="msg-compose">
                <button type="button" class="msg-attach-btn" id="msg-attach" title="Attach file (max 2MB)">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                </button>
                <input type="file" id="msg-file" accept="image/jpeg,image/png,image/gif,image/webp,application/pdf" hidden>
                <textarea class="msg-input" id="msg-input" rows="1" placeholder="Write a message…" maxlength="2000"></textarea>
            </div>
            <button type="button" class="msg-send-btn" id="msg-send" title="Send">${L.send}</button>
        </div>
    `;

    // Auto-resize textarea
    const input = document.getElementById('msg-input');
    input.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    });
    // Send on Enter (Shift+Enter = newline)
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });
    document.getElementById('msg-send').addEventListener('click', sendMessage);
    bindAttachmentInput();

    await loadMessages(otherId);
    markRead(otherId);

    // Poll every 3 seconds for new messages
    pollTimer = setInterval(async () => {
        if (activeOtherId === otherId) {
            await loadMessages(otherId, true);
        }
    }, 3000);
}

// ── Load messages ─────────────────────────────────────────────────────────

let lastMessageCount = 0;

async function loadMessages(otherId, isPolling = false) {
    const res = await Api.get(`/MessagingAPI.php?action=messages&with=${otherId}`);
    const msgs = res.success ? res.data : [];
    const body = document.getElementById('chat-body');
    if (!body) return;

    // On polling: only re-render if new messages arrived
    if (isPolling && msgs.length === lastMessageCount) return;
    lastMessageCount = msgs.length;

    const me = Auth.user()?.users_id;
    const wasAtBottom = body.scrollTop + body.clientHeight >= body.scrollHeight - 40;

    if (!msgs.length) {
        body.innerHTML = '<div style="text-align:center;padding:40px;color:#9ca3af;font-size:13px">No messages yet. Say hello!</div>';
        return;
    }

    let html = '';
    let lastDate = '';
    for (const m of msgs) {
        const d = new Date((m.created_at || '').replace(' ', 'T'));
        const dateStr = d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
        if (dateStr !== lastDate) {
            html += `<div class="msg-date-divider"><span>${dateStr}</span></div>`;
            lastDate = dateStr;
        }
        const mine = parseInt(m.sender_id) === parseInt(me);
        html += `
            <div class="msg-bubble-row msg-row ${mine ? 'mine' : 'theirs'}">
                <div class="msg-bubble">
                    ${renderMessageBody(m, me, esc)}
                    <span class="msg-time">${fmtTime(m.created_at)}</span>
                </div>
            </div>`;
    }
    body.innerHTML = html;
    bindImagePreview(body);

    // Auto-scroll to bottom if user was already at bottom (or initial load)
    if (!isPolling || wasAtBottom) {
        body.scrollTop = body.scrollHeight;
    }

    // Refresh thread list to update previews
    if (!isPolling) loadThreads();
    markRead(otherId);
}

// ── Send message ───────────────────────────────────────────────────────────

function clearPendingFile() {
    pendingFile = null;
    const preview = document.getElementById('msg-att-preview');
    const fileInput = document.getElementById('msg-file');
    if (preview) {
        preview.classList.remove('visible');
        preview.innerHTML = '';
    }
    if (fileInput) fileInput.value = '';
}

function bindAttachmentInput() {
    document.getElementById('msg-attach')?.addEventListener('click', () => {
        document.getElementById('msg-file')?.click();
    });
    document.getElementById('msg-file')?.addEventListener('change', () => {
        const file = document.getElementById('msg-file')?.files?.[0];
        if (!file) return;
        const check = validateMessageFile(file);
        if (!check.ok) {
            alert(check.message);
            clearPendingFile();
            return;
        }
        pendingFile = file;
        const preview = document.getElementById('msg-att-preview');
        if (preview) {
            preview.classList.add('visible');
            preview.innerHTML = `
                <span>${esc(file.name)} (${(file.size / 1024).toFixed(0)} KB)</span>
                <button type="button" id="msg-att-remove" style="border:none;background:#e5e7eb;border-radius:50%;width:24px;height:24px;cursor:pointer">&times;</button>`;
            preview.querySelector('#msg-att-remove')?.addEventListener('click', clearPendingFile);
        }
    });
}

async function sendMessage() {
    const input = document.getElementById('msg-input');
    const btn   = document.getElementById('msg-send');
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
        await loadMessages(activeOtherId);
        loadThreads();
    } else {
        alert(res.message || 'Failed to send message');
    }
    input.focus();
}

// ── Mark read ─────────────────────────────────────────────────────────────

async function markRead(otherId) {
    await Api.post('/MessagingAPI.php?action=mark_read', { other_user_id: otherId });
    updateSidebarBadge();
}

// ── Sidebar badge ─────────────────────────────────────────────────────────

async function updateSidebarBadge() {
    const res = await Api.get('/MessagingAPI.php?action=unread_count');
    const count = res.success ? res.count : 0;
    const badge = document.getElementById('msg-nav-badge');
    if (badge) {
        badge.textContent = count > 0 ? (count > 99 ? '99+' : count) : '';
        badge.style.display = count > 0 ? 'inline-flex' : 'none';
    }
}

function startBadgePolling() {
    updateSidebarBadge();
    clearInterval(badgeTimer);
    badgeTimer = setInterval(updateSidebarBadge, 30000);
}

// ── New chat modal ─────────────────────────────────────────────────────────

async function openNewChatModal() {
    const res = await Api.get('/MessagingAPI.php?action=contacts');
    const contacts = res.success ? res.data : [];

    const overlay = document.createElement('div');
    overlay.className = 'nc-overlay';
    overlay.innerHTML = `
        <div class="nc-modal">
            <div class="nc-header">
                <h3>New Message</h3>
                <button class="nc-close" id="nc-close">${icon('close', inl)}</button>
            </div>
            <div class="nc-body">
                ${!contacts.length
                    ? '<div style="padding:20px;text-align:center;color:#9ca3af;font-size:13px">No instructors found yet.<br>Enroll in a section first.</div>'
                    : contacts.map(c => {
                        const initials = (c.name || '?').split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
                        return `
                        <div class="nc-contact" onclick="window._startNewChat(${c.users_id}, '${esc(c.name)}')">
                            <div class="nc-avatar">${initials}</div>
                            <div>
                                <div class="nc-name">${esc(c.name)}</div>
                                <div class="nc-sub">${esc(c.subject_code ? c.subject_code + ' · ' + c.subject_name : 'Instructor')}</div>
                            </div>
                        </div>`;
                    }).join('')
                }
            </div>
        </div>
    `;

    document.body.appendChild(overlay);
    document.getElementById('nc-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    window._startNewChat = (id, name) => {
        overlay.remove();
        openThread(id, name);
    };
}
