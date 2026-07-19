/**
 * Instructor Messages — split-panel chat (instructor ↔ student)
 * Polling every 3 s keeps messages "real-time".
 */
import { Api } from '../../api.js';
import { Auth } from '../../auth.js';
import { renderMessageBody, validateMessageFile, bindImagePreview } from '../../utils/message-ui.js';
import {
    messagePageStyles, messageSidebarShell,
    messagePlaceholder, applyMessagePageBg, enterMobileChat, exitMobileChat,
} from '../../utils/message-page-ui.js';
import { L, icon } from '../../utils/action-labels.js';
import { notify } from '../../utils/notify.js';

const inl = { size: 14, className: 'ui-icon-inline' };

let pollTimer     = null;
let badgeTimer    = null;
let activeOtherId = null;
let activeGroupId = null;
let pendingFile   = null;
let allThreads    = [];
let allGroups     = [];
let activeTab     = 'direct';

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
    clearInterval(pollTimer);
    clearInterval(badgeTimer);
    activeOtherId = null;

    container.innerHTML = `
        <style>${messagePageStyles()}</style>
        <div class="msg-page">
            <div class="msg-layout">
                ${messageSidebarShell(L.newMessage)}
                <div class="msg-main" id="msg-main">
                    ${messagePlaceholder(
                        'Select a conversation',
                        'Pick a student from the list on the left, or tap New Message to start chatting.'
                    )}
                </div>
            </div>
        </div>
    `;

    applyMessagePageBg(container);
    await Promise.all([loadThreads(), loadGroups()]);
    startBadgePolling();

    document.getElementById('btn-new-chat')?.addEventListener('click', openNewChatModal);
    document.getElementById('btn-new-group')?.addEventListener('click', openNewGroupModal);
    document.getElementById('msg-thread-search')?.addEventListener('input', (e) => {
        if (activeTab === 'direct') renderThreadList(e.target.value);
        else renderGroupList(e.target.value);
    });
    document.querySelectorAll('.msg-type-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            activeTab = tab.dataset.type;
            document.querySelectorAll('.msg-type-tab').forEach(t => t.classList.toggle('active', t === tab));
            if (activeTab === 'direct') renderThreadList('');
            else renderGroupList('');
        });
    });

    const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
    if (params.get('with')) openThread(parseInt(params.get('with'), 10), params.get('name') || 'Student');
}

// ── Thread list ────────────────────────────────────────────────────────────

async function loadThreads() {
    const res = await Api.get('/MessagingAPI.php?action=threads');
    allThreads = res.success ? res.data : [];
    if (activeTab === 'direct') {
        const q = document.getElementById('msg-thread-search')?.value || '';
        renderThreadList(q);
    }
}

async function loadGroups() {
    const res = await Api.get('/GroupChatAPI.php?action=my_groups');
    allGroups = res.success ? res.data : [];
    if (activeTab === 'group') {
        const q = document.getElementById('msg-thread-search')?.value || '';
        renderGroupList(q);
    }
}

function renderGroupList(query = '') {
    const list = document.getElementById('thread-list');
    if (!list) return;
    const q = query.toLowerCase().trim();
    const groups = q ? allGroups.filter(g => (g.group_name || '').toLowerCase().includes(q)) : allGroups;

    if (!allGroups.length) {
        list.innerHTML = '<div class="thread-empty">No groups yet.<br>Tap <strong>New Group</strong> to create one.</div>';
        return;
    }
    if (!groups.length) {
        list.innerHTML = '<div class="thread-empty">No groups match your search.</div>';
        return;
    }

    list.innerHTML = groups.map(g => {
        const initials = (g.group_name || 'G').slice(0, 2).toUpperCase();
        const unread   = parseInt(g.unread || 0);
        const active   = activeGroupId === parseInt(g.group_id) ? 'active' : '';
        return `
            <div class="thread-item ${active}" data-gid="${g.group_id}"
                 onclick="window._openGroup(${g.group_id}, '${esc(g.group_name)}', ${g.member_count || 0})">
                <div class="thread-avatar thread-avatar--group">${initials}</div>
                <div class="thread-info">
                    <div class="thread-name">${esc(g.group_name)} <span class="thread-group-badge">Group</span></div>
                    <div class="thread-preview">${esc((g.last_message || 'No messages yet').slice(0, 50))}</div>
                </div>
                <div class="thread-meta">
                    <span class="thread-time">${g.last_at ? relativeTime(g.last_at) : ''}</span>
                    ${unread > 0 ? `<span class="thread-badge">${unread}</span>` : ''}
                </div>
            </div>`;
    }).join('');
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
        const initials = (t.name || '?').split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
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

window._openThread = function(otherId, name) { openThread(otherId, name); };
window._openGroup  = function(groupId, name, memberCount) { openGroupThread(groupId, name, memberCount); };

async function openGroupThread(groupId, name, memberCount) {
    clearInterval(pollTimer);
    activeGroupId = groupId;
    activeOtherId = null;
    pendingFile   = null;

    document.querySelectorAll('.thread-item').forEach(el => {
        el.classList.toggle('active', parseInt(el.dataset.gid) === groupId);
    });

    const main = document.getElementById('msg-main');
    if (!main) return;

    const initials = (name || 'G').slice(0, 2).toUpperCase();

    main.innerHTML = `
        <div class="msg-topbar">
            <button type="button" class="msg-mobile-back" title="Back to conversations">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            </button>
            <div class="msg-topbar-avatar" style="border-radius:10px;background:#0369A1">${initials}</div>
            <div>
                <div class="msg-topbar-name">${esc(name)}</div>
                <div class="msg-topbar-role">${memberCount} member${memberCount !== 1 ? 's' : ''} · Group chat</div>
            </div>
        </div>
        <div class="msg-body" id="chat-body">
            <div style="text-align:center;padding:20px;color:#9ca3af;font-size:13px">Loading messages...</div>
        </div>
        <div class="msg-footer">
            <div class="msg-compose">
                <textarea class="msg-input" id="msg-input" rows="1" placeholder="Write a message to the group…" maxlength="2000"></textarea>
            </div>
            <button type="button" class="msg-send-btn" id="msg-send" title="Send">${L.send}</button>
        </div>`;

    const input = document.getElementById('msg-input');
    input.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    });
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendGroupMessage(groupId); }
    });
    document.getElementById('msg-send').addEventListener('click', () => sendGroupMessage(groupId));

    enterMobileChat(() => {
        clearInterval(pollTimer);
        activeGroupId = null;
        document.querySelectorAll('.thread-item').forEach(el => el.classList.remove('active'));
    });

    await loadGroupMessages(groupId);
    await Api.post('/GroupChatAPI.php?action=mark_group_read', { group_id: groupId });

    pollTimer = setInterval(async () => {
        if (activeGroupId === groupId) await loadGroupMessages(groupId, true);
    }, 3000);
}

let lastGroupMsgCount = 0;

async function loadGroupMessages(groupId, isPolling = false) {
    const res  = await Api.get(`/GroupChatAPI.php?action=group_messages&group_id=${groupId}`);
    const msgs = res.success ? res.data : [];
    const body = document.getElementById('chat-body');
    if (!body) return;

    if (isPolling && msgs.length === lastGroupMsgCount) return;
    lastGroupMsgCount = msgs.length;

    const me = Auth.user()?.users_id;
    const wasAtBottom = body.scrollTop + body.clientHeight >= body.scrollHeight - 40;

    if (!msgs.length) {
        body.innerHTML = '<div style="text-align:center;padding:40px;color:#9ca3af;font-size:13px">No messages yet. Say something!</div>';
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
                ${!mine ? `<div style="font-size:11px;font-weight:700;color:#0369A1;margin-bottom:2px;padding-left:4px">${esc(m.sender_name)}</div>` : ''}
                <div class="msg-bubble">
                    <span>${esc(m.content)}</span>
                    <span class="msg-time">${fmtTime(m.created_at)}</span>
                </div>
            </div>`;
    }
    body.innerHTML = html;
    if (!isPolling || wasAtBottom) body.scrollTop = body.scrollHeight;
    if (!isPolling) loadGroups();
}

async function sendGroupMessage(groupId) {
    const input = document.getElementById('msg-input');
    const btn   = document.getElementById('msg-send');
    if (!input) return;
    const content = input.value.trim();
    if (!content) return;

    btn.disabled   = true;
    input.disabled = true;

    const res = await Api.post('/GroupChatAPI.php?action=send_group_message', { group_id: groupId, content });

    input.disabled = false;
    btn.disabled   = false;

    if (res.success) {
        input.value = '';
        input.style.height = 'auto';
        await loadGroupMessages(groupId);
        loadGroups();
    } else {
        notify.error(res.message || 'Failed to send message');
    }
    input.focus();
}

async function openNewGroupModal() {
    const res = await Api.get('/MessagingAPI.php?action=contacts');
    const contacts = res.success ? res.data : [];

    const overlay = document.createElement('div');
    overlay.className = 'nc-overlay';
    overlay.innerHTML = `
        <div class="nc-modal" style="width:440px">
            <div class="nc-header">
                <h3>New Group Chat</h3>
                <button class="nc-close" id="nc-close">${icon('close', inl)}</button>
            </div>
            <div class="nc-body" style="padding:16px">
                <div style="margin-bottom:14px">
                    <label style="display:block;font-size:12px;font-weight:700;color:#374151;margin-bottom:6px">Group Name</label>
                    <input id="ng-name" type="text" maxlength="80" placeholder="e.g. CC101 — Section A"
                        style="width:100%;padding:10px 12px;border:1px solid #E5E7EB;border-radius:10px;font-size:13px;outline:none;font-family:inherit">
                </div>
                <div>
                    <label style="display:block;font-size:12px;font-weight:700;color:#374151;margin-bottom:6px">Add Members</label>
                    ${!contacts.length
                        ? '<div style="color:#9ca3af;font-size:13px">No contacts available.</div>'
                        : `<div id="ng-contacts" style="max-height:220px;overflow-y:auto;display:flex;flex-direction:column;gap:4px">
                            ${contacts.map(c => {
                                const initials = (c.name||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
                                return `<label class="ng-contact-row" style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;cursor:pointer;border:1px solid transparent;transition:background .12s">
                                    <input type="checkbox" value="${c.users_id}" style="width:16px;height:16px;accent-color:#00461B;flex-shrink:0">
                                    <div class="nc-avatar" style="flex-shrink:0">${initials}</div>
                                    <div>
                                        <div class="nc-name">${esc(c.name)}</div>
                                        <div class="nc-sub">${esc(c.subject_code ? c.subject_code + ' · ' + c.subject_name : c.role || '')}</div>
                                    </div>
                                </label>`;
                            }).join('')}
                           </div>`
                    }
                </div>
                <button id="ng-create" style="margin-top:16px;width:100%;padding:12px;border-radius:10px;background:#00461B;color:#fff;border:none;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit">
                    Create Group
                </button>
            </div>
        </div>`;

    document.body.appendChild(overlay);
    document.getElementById('nc-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelectorAll('.ng-contact-row').forEach(row => {
        row.addEventListener('mouseenter', () => row.style.background = '#F0FDF4');
        row.addEventListener('mouseleave', () => row.style.background = '');
    });

    document.getElementById('ng-create').addEventListener('click', async () => {
        const name = document.getElementById('ng-name')?.value.trim();
        if (!name) { alert('Please enter a group name.'); return; }
        const memberIds = [...overlay.querySelectorAll('#ng-contacts input[type=checkbox]:checked')]
            .map(cb => parseInt(cb.value));
        if (!memberIds.length) { alert('Select at least one member.'); return; }

        const btn = document.getElementById('ng-create');
        btn.disabled = true; btn.textContent = 'Creating…';

        const res = await Api.post('/GroupChatAPI.php?action=create_group', { name, member_ids: memberIds });
        if (res.success) {
            overlay.remove();
            await loadGroups();
            activeTab = 'group';
            document.querySelectorAll('.msg-type-tab').forEach(t => t.classList.toggle('active', t.dataset.type === 'group'));
            renderGroupList('');
            openGroupThread(res.group_id, name, memberIds.length + 1);
        } else {
            notify.error(res.message || 'Failed to create group');
            btn.disabled = false; btn.textContent = 'Create Group';
        }
    });
}

async function openThread(otherId, name) {
    clearInterval(pollTimer);
    activeOtherId = otherId;
    pendingFile = null;

    document.querySelectorAll('.thread-item').forEach(el => {
        el.classList.toggle('active', parseInt(el.dataset.id) === otherId);
    });

    const main = document.getElementById('msg-main');
    if (!main) return;

    const initials = (name || '?').split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();

    main.innerHTML = `
        <div class="msg-topbar">
            <button type="button" class="msg-mobile-back" title="Back to conversations">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            </button>
            <div class="msg-topbar-avatar">${initials}</div>
            <div>
                <div class="msg-topbar-name">${esc(name)}</div>
                <div class="msg-topbar-role">Student</div>
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

    const input = document.getElementById('msg-input');
    input.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    });
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });
    document.getElementById('msg-send').addEventListener('click', sendMessage);
    bindAttachmentInput();

    enterMobileChat(() => {
        clearInterval(pollTimer);
        activeOtherId = null;
        document.querySelectorAll('.thread-item').forEach(el => el.classList.remove('active'));
    });

    await loadMessages(otherId);
    markRead(otherId);

    pollTimer = setInterval(async () => {
        if (activeOtherId === otherId) {
            await loadMessages(otherId, true);
        }
    }, 3000);
}

let lastMessageCount = 0;

async function loadMessages(otherId, isPolling = false) {
    const res = await Api.get(`/MessagingAPI.php?action=messages&with=${otherId}`);
    const msgs = res.success ? res.data : [];
    const body = document.getElementById('chat-body');
    if (!body) return;

    if (isPolling && msgs.length === lastMessageCount) return;
    lastMessageCount = msgs.length;

    const me = Auth.user()?.users_id;
    const wasAtBottom = body.scrollTop + body.clientHeight >= body.scrollHeight - 40;

    if (!msgs.length) {
        body.innerHTML = '<div style="text-align:center;padding:40px;color:#9ca3af;font-size:13px">No messages yet. Start the conversation!</div>';
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

    if (!isPolling || wasAtBottom) {
        body.scrollTop = body.scrollHeight;
    }

    if (!isPolling) loadThreads();
    markRead(otherId);
}

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
            notify.error(check.message);
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
        notify.error(res.message || 'Failed to send message');
    }
    input.focus();
}

async function markRead(otherId) {
    await Api.post('/MessagingAPI.php?action=mark_read', { other_user_id: otherId });
    updateSidebarBadge();
}

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
            <div class="nc-search">
                <input type="text" id="nc-search-input" placeholder="Search students..." />
            </div>
            <div class="nc-body" id="nc-contact-list">
                ${!contacts.length
                    ? '<div style="padding:20px;text-align:center;color:#9ca3af;font-size:13px">No students enrolled in your classes yet.</div>'
                    : contacts.map(c => {
                        const initials = (c.name || '?').split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
                        return `
                        <div class="nc-contact" data-name="${esc(c.name).toLowerCase()}" onclick="window._startNewChat(${c.users_id}, '${esc(c.name)}')">
                            <div class="nc-avatar">${initials}</div>
                            <div>
                                <div class="nc-name">${esc(c.name)}</div>
                                <div class="nc-sub">${esc(c.subject_code ? c.subject_code + ' — ' + c.subject_name : 'Student')}</div>
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

    // Live search filter
    const searchInput = document.getElementById('nc-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            const q = searchInput.value.toLowerCase();
            document.querySelectorAll('.nc-contact').forEach(el => {
                el.style.display = el.dataset.name.includes(q) ? '' : 'none';
            });
        });
        searchInput.focus();
    }

    window._startNewChat = (id, name) => {
        overlay.remove();
        openThread(id, name);
    };
}
