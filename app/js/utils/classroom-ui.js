import { icon, iconLg } from './icons.js';
export { icon, iconLg };

export const G = '#00461B';
export const G2 = '#006428';
export const BORDER = 'transparent';
export const SURFACE_MUTED = '#F3F4F6';

export function esc(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
}

export function initials(first, last) {
    const a = (first || '?')[0] || '?';
    const b = (last || '')[0] || '';
    return (a + b).toUpperCase();
}

export function emptyMsg(msg, href, linkText) {
    return `<div style="padding:60px;text-align:center;color:#6B7280">
        ${esc(msg)} <a href="${href}" style="color:${G}">${esc(linkText)}</a>
    </div>`;
}

/**
 * Unified instructor post card (author + classwork in one card).
 */
export function renderClassworkPostCard(opts) {
    const {
        authorName = '',
        authorInitials = '?',
        posted = '',
        iconName = 'document',
        title = '',
        typeLabel = '',
        rightHtml = '',
        workType = '',
        workId = '',
        disabled = false,
        rowClass = '',
        viewsFooter = '',
        menuHtml = '',
    } = opts;

    const dataAttrs = workType && workId
        ? `data-work="${workType}" data-id="${workId}"`
        : '';

    return `
        <article class="gc-post-card">
            <div class="gc-post-card__row">
                <button type="button" class="gc-post-card__btn ${rowClass}" ${dataAttrs} ${disabled ? 'disabled' : ''}>
                    <header class="gc-post-card__hdr">
                        <div class="sc-avatar sm teacher-av">${esc(authorInitials)}</div>
                        <div class="gc-cw-author-text">
                            <span class="gc-cw-author-name">${esc(authorName)}</span>
                            ${posted ? `<span class="gc-cw-posted-time">${esc(posted)}</span>` : ''}
                        </div>
                    </header>
                    <div class="gc-post-card__work">
                        <span class="gc-cw-icon gc-cw-icon--subj">${icon(iconName, { size: 20 })}</span>
                        <div class="gc-cw-body">
                            <div class="gc-cw-title">${esc(title)}</div>
                            <div class="gc-cw-type">${esc(typeLabel)}</div>
                        </div>
                        ${rightHtml ? `<div class="gc-cw-right">${rightHtml}</div>` : ''}
                    </div>
                </button>
                ${menuHtml}
            </div>
            ${viewsFooter}
        </article>`;
}

/** Curriculum-style table CSS (reuse for grade tables) */
export function curriculumTableCss() {
    return `
        .gc-cur-wrap { border:2px solid #1B4D3E; border-radius:0 0 8px 8px; overflow:hidden; background:#fff; }
        .gc-cur-label {
            font-size:12px; font-weight:700; text-align:center; padding:7px 12px;
            background:#E8F5E9; color:#1B4D3E; border-bottom:1px solid #1B4D3E; letter-spacing:.5px;
        }
        .gc-cur-table { width:100%; border-collapse:collapse; font-size:12px; }
        .gc-cur-table thead tr th {
            background:#f7f7f7; color:#404040; font-weight:700;
            padding:8px 10px; border-bottom:1px solid #ccc; text-align:center; white-space:nowrap;
        }
        .gc-cur-table thead tr th.th-left { text-align:left; }
        .gc-cur-table tbody tr { border-bottom:1px solid #f0f0f0; }
        .gc-cur-table tbody tr:last-child { border-bottom:none; }
        .gc-cur-table tbody tr:hover { background:#f9fffe; }
        .gc-cur-table td { padding:8px 10px; vertical-align:middle; }
        .gc-cur-table .td-rank { text-align:center; font-weight:700; color:#5F6368; width:40px; }
        .gc-cur-table .td-id { font-family:monospace; font-size:11px; font-weight:700; color:#1B4D3E; white-space:nowrap; }
        .gc-cur-table .td-name { font-size:12px; color:#262626; }
        .gc-cur-table .td-num { text-align:center; font-weight:600; color:#202124; white-space:nowrap; }
        .gc-cur-table .td-pass { text-align:center; }
        .gc-cur-badge-pass { font-size:10px; font-weight:700; padding:2px 8px; border-radius:10px; background:#E6F4EA; color:#137333; }
        .gc-cur-badge-fail { font-size:10px; font-weight:700; padding:2px 8px; border-radius:10px; background:#FCE8E6; color:#C5221F; }
        .gc-cur-badge-none { font-size:10px; color:#9AA0A6; }
        .gc-cur-empty { text-align:center; color:#9AA0A6; padding:24px 16px; font-size:13px; font-style:italic; }
    `;
}

/** Single private comment row with optional reply action */
export function renderPrivateCommentRow(c, { instructorMode = false, canReply = true } = {}) {
    const date = c.created_at
        ? new Date(String(c.created_at).replace(' ', 'T')).toLocaleString('en-US', {
            month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
        })
        : '';
    const roleLabel = c.role === 'instructor' ? 'Instructor' : c.role === 'admin' ? 'Admin' : '';
    const authorName = c.author_name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'User';
    const isReply = !!(c.parent_comment_id);
    const showReply = canReply && (
        instructorMode ? c.role !== 'instructor' : c.role === 'instructor'
    );

    return `
        <div class="sc-comment sc-comment--private ${c.is_mine == 1 ? 'mine' : ''} ${isReply ? 'sc-comment--thread-reply' : ''}"
            data-comment-id="${esc(String(c.comment_id))}"
            data-thread-user="${esc(String(c.thread_user_id || c.user_id || ''))}"
            data-author-id="${esc(String(c.user_id || ''))}">
            <div class="sc-comment-swipe-track">
                <div class="sc-comment-swipe-reveal" aria-hidden="true">${icon('reply', { size: 18 })} Reply</div>
                <div class="sc-comment-swipe-content">
                    <div class="sc-avatar sm ${c.role === 'instructor' ? 'teacher-av' : ''}">${initials(c.first_name, c.last_name)}</div>
                    <div class="sc-comment-body">
                        <div class="sc-comment-head">
                            <span class="sc-comment-author">${esc(authorName)}</span>
                            ${roleLabel ? `<span class="sc-comment-role">${roleLabel}</span>` : ''}
                            <span class="sc-comment-date">${esc(date)}</span>
                            ${showReply ? `<button type="button" class="sc-comment-reply-btn" data-reply-id="${esc(String(c.comment_id))}" aria-label="Reply">${icon('reply', { size: 16 })}</button>` : ''}
                        </div>
                        <p class="sc-comment-text">${esc(c.content || '')}</p>
                    </div>
                </div>
            </div>
        </div>`;
}

/** Google Classroom–style private comments panel for the right rail */
export function renderPrivateCommentsRail({
    comments = [],
    userInitials = '?',
    hint = 'Only you and your instructor can see these.',
    listId = 'sc-private-comments',
    inputId = 'sc-private-input',
    postId = 'sc-private-post',
    embedded = false,
    instructorMode = false,
    replyingTo = null,
} = {}) {
    const rows = comments.length
        ? comments.map(c => renderPrivateCommentRow(c, { instructorMode })).join('')
        : '<p class="sc-comment-empty sc-comment-empty--rail">No private comments yet.</p>';

    const replyBanner = replyingTo ? `
        <div class="sc-private-reply-banner" id="sc-private-reply-banner">
            <span>Replying to <strong>${esc(replyingTo.author_name || 'student')}</strong></span>
            <button type="button" class="sc-private-reply-cancel" id="sc-private-reply-cancel" aria-label="Cancel reply">&times;</button>
        </div>` : '';

    const showCompose = !instructorMode || replyingTo;
    const composeFooter = showCompose ? `
                <div class="sc-rail-private-footer">
                    ${replyBanner}
                    <div class="sc-comment-compose sc-comment-compose--rail">
                        <div class="sc-avatar sm">${esc(userInitials)}</div>
                        <div class="sc-comment-input-wrap">
                            <textarea id="${esc(inputId)}" class="sc-comment-input"
                                placeholder="${replyingTo ? 'Write a reply…' : 'Add private comment…'}" rows="1"></textarea>
                            <button type="button" id="${esc(postId)}" class="gc-send-btn" aria-label="Send">${icon('messages', { size: 18 })}</button>
                        </div>
                    </div>
                </div>` : `
                <div class="sc-rail-private-footer sc-rail-private-footer--hint">
                    <p class="sc-rail-private-hint">${icon('reply', { size: 14, className: 'ui-icon-inline' })} Tap Reply or swipe right on a comment to respond privately.</p>
                </div>`;

    const panel = `
            <div class="sc-rail-card sc-rail-private-panel">
                <div class="sc-rail-private-head">
                    <h3 class="sc-rail-private-title">${icon('user', { size: 16, className: 'ui-icon-inline' })} Private comments</h3>
                    <p class="sc-rail-private-hint">${esc(hint)}</p>
                </div>
                <div class="sc-rail-private-body">
                    <div class="sc-comment-list sc-comment-list--private" id="${esc(listId)}">${rows}</div>
                </div>
                ${composeFooter}
            </div>`;

    if (embedded) return panel;

    return `
        <aside class="sc-rail sc-rail--private-focus">
            ${panel}
        </aside>`;
}

/** Bind reply (icon + swipe) on private comment rows */
export function bindPrivateCommentRail(root, { onReply, onCancelReply } = {}) {
    if (!root) return;

    root.querySelector('#sc-private-reply-cancel')?.addEventListener('click', () => {
        if (onCancelReply) onCancelReply();
    });

    root.querySelectorAll('[data-reply-id]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const row = btn.closest('[data-comment-id]');
            if (!row || !onReply) return;
            onReply({
                comment_id: parseInt(row.dataset.commentId, 10),
                thread_user_id: parseInt(row.dataset.threadUser, 10) || null,
                author_name: row.querySelector('.sc-comment-author')?.textContent?.trim() || '',
            });
        });
    });

    root.querySelectorAll('.sc-comment--private').forEach(row => {
        let startX = 0;
        let currentX = 0;
        let swiping = false;
        const track = row.querySelector('.sc-comment-swipe-content');
        const reveal = row.querySelector('.sc-comment-swipe-reveal');
        if (!track) return;

        const resetSwipe = () => {
            track.style.transform = '';
            if (reveal) reveal.style.opacity = '0';
            swiping = false;
        };

        row.addEventListener('touchstart', (e) => {
            if (!e.touches[0]) return;
            startX = e.touches[0].clientX;
            currentX = startX;
            swiping = true;
        }, { passive: true });

        row.addEventListener('touchmove', (e) => {
            if (!swiping || !e.touches[0]) return;
            currentX = e.touches[0].clientX;
            const dx = Math.max(0, Math.min(72, currentX - startX));
            if (dx > 8) {
                track.style.transform = `translateX(${dx}px)`;
                if (reveal) reveal.style.opacity = String(Math.min(1, dx / 56));
            }
        }, { passive: true });

        row.addEventListener('touchend', () => {
            if (!swiping) return;
            const dx = currentX - startX;
            if (dx > 56 && onReply) {
                onReply({
                    comment_id: parseInt(row.dataset.commentId, 10),
                    thread_user_id: parseInt(row.dataset.threadUser, 10) || null,
                    author_name: row.querySelector('.sc-comment-author')?.textContent?.trim() || '',
                });
            }
            resetSwipe();
        });
    });
}

/** Shared classroom modal overlay */
export function openGcModal({ title = '', bodyHtml = '', wide = false, onClose = null } = {}) {
    document.querySelector('.gc-modal-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.className = 'gc-modal-overlay';
    overlay.innerHTML = `
        <div class="gc-modal ${wide ? 'gc-modal--wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="gc-modal-title">
            <div class="gc-modal-hdr">
                <h2 class="gc-modal-title" id="gc-modal-title">${esc(title)}</h2>
                <button type="button" class="gc-modal-close" aria-label="Close">&times;</button>
            </div>
            <div class="gc-modal-body">${bodyHtml}</div>
        </div>`;

    const close = () => {
        overlay.remove();
        document.body.classList.remove('gc-modal-open');
        if (onClose) onClose();
    };

    overlay.querySelector('.gc-modal-close')?.addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.body.classList.add('gc-modal-open');
    document.body.appendChild(overlay);
    return { close, overlay };
}

/** Right rail stack: Your work (top) + private comments (bottom) */
export function renderWorkFocusRailStack(yourWorkHtml, privateCommentsOptions = {}) {
    const privatePanel = renderPrivateCommentsRail({ ...privateCommentsOptions, embedded: true });
    return `
        <aside class="sc-rail sc-rail--work-focus">
            <div class="sc-rail-focus-stack">
                <div class="sc-rail-card sc-rail-work">${yourWorkHtml}</div>
                ${privatePanel}
            </div>
        </aside>`;
}

export function classroomPageFooter() {
    const year = new Date().getFullYear();
    return `
        <footer class="sc-page-footer">
            <div class="sc-page-footer-inner">
                <span class="sc-page-footer-brand">COC-LMS · PHINMA Education</span>
                <span class="sc-page-footer-copy">© ${year}</span>
            </div>
        </footer>`;
}

export function renderViewSummaryFooter(viewCount, enrolledCount, viewKey) {
    const vc = Number(viewCount) || 0;
    const ec = Number(enrolledCount) || 0;
    if (!viewKey) return '';
    return `
        <div class="gc-post-card__views">
            <span class="gc-view-summary">${icon('eye', { size: 14, className: 'ui-icon-inline' })} ${vc} of ${ec} viewed</span>
            <button type="button" class="gc-viewers-toggle" data-viewers-key="${esc(viewKey)}">See who viewed</button>
        </div>`;
}

export function renderViewersPanel(data) {
    const viewed = data?.viewed || [];
    const notViewed = data?.not_viewed || [];
    const fmt = (ts) => {
        if (!ts) return '';
        const d = new Date(String(ts).replace(' ', 'T'));
        if (Number.isNaN(d.getTime())) return '';
        return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    };
    const row = (s, time, viewedFlag) => {
        const name = s.student_name || `${s.first_name || ''} ${s.last_name || ''}`.trim() || 'Student';
        const ini = initials(s.first_name, s.last_name);
        return `
            <div class="gc-viewer-row">
                <div class="sc-avatar sm">${esc(ini)}</div>
                <div class="gc-viewer-meta">
                    <span class="gc-viewer-name">${esc(name)}</span>
                    <span class="gc-viewer-sub">${esc(s.student_id || 'Student')}</span>
                </div>
                ${viewedFlag && time ? `<span class="gc-viewer-time">${esc(fmt(time))}</span>` : ''}
            </div>`;
    };

    return `
        <div class="gc-viewers-panel">
            <h4>Viewed (${viewed.length})</h4>
            <div class="gc-viewers-list">
                ${viewed.length
                    ? viewed.map(v => row(v, v.last_viewed_at || v.first_viewed_at, true)).join('')
                    : '<p class="gc-viewers-empty">No students have opened this yet.</p>'}
            </div>
            ${notViewed.length ? `
                <h4>Not viewed yet (${notViewed.length})</h4>
                <div class="gc-viewers-list">
                    ${notViewed.map(s => row(s, '', false)).join('')}
                </div>` : ''}
        </div>`;
}

export function classroomCss(accent) {
    return `
        .sc-page { width:100%; min-height:calc(100vh - 120px); background:#fff; }
        .sc-page-wide { max-width:100%; }
        .sc-loading { display:flex; justify-content:center; align-items:center; min-height:320px; }
        .sc-spin {
            width:42px; height:42px; border:3px solid #eee; border-top-color:${G};
            border-radius:50%; animation:scSpin .75s linear infinite;
        }
        @keyframes scSpin { to { transform:rotate(360deg); } }

        .sc-back {
            display:inline-flex; align-items:center; gap:6px;
            font-size:13px; font-weight:600; color:#6B7280;
            text-decoration:none; margin-bottom:16px;
            padding:6px 0; transition:color .15s;
        }
        .sc-back:hover { color:${G}; }

        .sc-hero {
            display:flex; align-items:flex-end; justify-content:space-between;
            gap:24px; flex-wrap:wrap;
            padding:28px 32px; border-radius:16px; margin-bottom:20px;
            color:#fff; box-shadow:none; border:none;
            position:relative; overflow:hidden;
        }
        .sc-hero::before {
            content:''; position:absolute; inset:0;
            display:none;
            pointer-events:none;
        }
        .sc-hero-main { position:relative; flex:1; min-width:240px; }
        .sc-hero-code {
            font-size:12px; font-weight:700; font-family:ui-monospace, monospace;
            opacity:.85; letter-spacing:.5px;
        }
        .sc-hero-title {
            font-size:26px; font-weight:800; margin:8px 0 14px;
            letter-spacing:-.4px; line-height:1.25;
        }
        .sc-hero-chips { display:flex; flex-wrap:wrap; gap:8px; }
        .sc-chip {
            font-size:12px; font-weight:600;
            background:rgba(255,255,255,.2); border:none;
            padding:5px 12px; border-radius:20px;
        }
        .sc-hero-stats {
            display:flex; gap:12px; position:relative; flex-shrink:0;
        }
        .sc-stat {
            text-align:center; min-width:72px;
            background:rgba(255,255,255,.18); border:none;
            border-radius:12px; padding:12px 16px;
        }
        .sc-stat strong { display:block; font-size:22px; font-weight:800; line-height:1; margin-bottom:4px; }
        .sc-stat span { font-size:11px; opacity:.85; font-weight:600; text-transform:uppercase; letter-spacing:.5px; }

        .sc-layout {
            display:grid; grid-template-columns:1fr 300px;
            gap:20px; align-items:start;
        }
        .sc-main { min-width:0; }
        .sc-rail {
            display:flex; flex-direction:column; gap:16px;
            position:sticky; top:88px;
        }
        .sc-rail-card {
            background:#fff; border:none;
            border-radius:14px; padding:20px;
            box-shadow:none;
        }
        .sc-rail-icon { font-size:28px; margin-bottom:8px; }
        .sc-rail-title { font-size:15px; font-weight:700; color:#111; margin:0 0 6px; }
        .sc-rail-desc { font-size:12px; color:#6B7280; line-height:1.45; margin:0 0 14px; }
        .sc-rail-muted { font-size:12px; color:#9CA3AF; margin:0; }
        .sc-rail-teacher {
            display:flex; align-items:center; gap:10px;
            padding:10px 12px; background:#F9FAFB;
            border-radius:10px; margin-bottom:12px;
        }
        .sc-rail-teacher-name { font-size:13px; font-weight:600; color:#111; }
        .sc-rail-live {
            display:flex; align-items:center; gap:8px;
            font-size:12px; font-weight:600; color:#15803D;
            background:#F0FDF4; border:1px solid #BBF7D0;
            padding:8px 12px; border-radius:8px; margin-bottom:12px;
        }
        .sc-live-dot {
            width:8px; height:8px; border-radius:50%;
            background:#22C55E; animation:scPulse 1.5s infinite;
        }
        @keyframes scPulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        .sc-rail-btn {
            display:flex; align-items:center; justify-content:center; gap:8px;
            width:100%; padding:11px 16px; border-radius:10px;
            font-size:13px; font-weight:700; cursor:pointer;
            border:none; transition:background .15s, transform .15s;
            text-decoration:none;
        }
        .sc-rail-btn.primary { background:${G}; color:#fff; }
        .sc-rail-btn.primary:hover { background:${G2}; }
        .sc-rail-btn.video { background:#1E40AF; color:#fff; }
        .sc-rail-btn.video:hover { background:#1D4ED8; }
        .sc-rail-btn.outline {
            background:#fff; color:#374151; border:1px solid ${BORDER};
        }
        .sc-rail-btn.outline:hover { background:#F9FAFB; }
        .sc-rail-foot { font-size:10px; color:#9CA3AF; margin:10px 0 0; text-align:center; }
        .sc-rail-work .sc-rail-title {
            display:flex; align-items:center; gap:8px;
            font-size:14px; font-weight:600; color:#202124; margin:0 0 12px;
        }
        .sc-rail-work-submit .gc-work-card-hdr {
            display:flex; justify-content:space-between; align-items:center;
            gap:8px; margin-bottom:8px;
        }
        .sc-rail-work-submit .gc-work-card-hdr .sc-rail-title { margin:0; }
        .sc-rail-grade {
            font-size:12px; color:#5F6368; margin:0 0 12px;
        }
        .gc-rail-note {
            font-size:11px; color:#5F6368; margin:10px 0 0; line-height:1.4;
        }
        .gc-rail-empty {
            font-size:12px; color:#9CA3AF; margin:0; font-style:italic;
        }
        .gc-rail-hint {
            font-size:11px; color:#5F6368; margin:-6px 0 12px; line-height:1.4;
        }
        .gc-work-attach-list { display:flex; flex-direction:column; gap:8px; margin-bottom:10px; }
        .gc-work-attach-row {
            display:flex; align-items:center; gap:4px;
        }
        .gc-work-attach-row .gc-work-attach { flex:1; min-width:0; }
        .gc-attach-remove {
            flex-shrink:0; width:28px; height:28px; border:none; border-radius:50%;
            background:#F1F3F4; color:#5F6368; font-size:18px; line-height:1;
            cursor:pointer; display:flex; align-items:center; justify-content:center;
        }
        .gc-attach-remove:hover { background:#FEE2E2; color:#C5221F; }
        .gc-add-attach-btn {
            display:flex; align-items:center; justify-content:center; gap:6px;
            width:100%; padding:9px 12px; border:1px dashed #DADCE0; border-radius:8px;
            font-size:13px; font-weight:500; color:var(--subj, ${G});
            cursor:pointer; background:#FAFAFA; transition:border-color .15s, background .15s;
        }
        .gc-add-attach-btn:hover {
            border-color:var(--subj, ${G});
            background:var(--subj-soft, #F8F9FA);
        }
        .gc-work-attach {
            display:flex; align-items:center; gap:12px;
            padding:10px 12px; border:1px solid #DADCE0; border-radius:8px;
            text-decoration:none; color:#202124; background:#FAFAFA;
            transition:border-color .15s, background .15s;
        }
        .gc-work-attach:hover {
            border-color:var(--subj, ${G});
            background:var(--subj-soft, #F8F9FA);
        }
        .gc-work-attach-icon {
            flex-shrink:0; color:var(--subj, ${G});
            display:flex; align-items:center; justify-content:center;
        }
        .gc-work-attach-text { min-width:0; flex:1; }
        .gc-work-attach-name {
            display:block; font-size:13px; font-weight:500; line-height:1.35;
            overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
        }
        .gc-work-attach-sub { display:block; font-size:11px; color:#5F6368; margin-top:2px; }
        .sc-rail-work-private .sc-comments--private { margin:0; }
        .sc-rail-work-private .sc-comment-list { max-height:200px; overflow-y:auto; margin-bottom:10px; }
        .sc-rail-work .gc-submit-btn { margin-top:4px; width:100%; }
        .sc-rail-work .gc-focus-card-hdr--actions { flex-direction:row; align-items:flex-start; gap:8px; }
        .sc-rail-work .gc-focus-card-hdr-left { flex:1; min-width:0; }
        .sc-rail-work .gc-work-attach-list { max-height:200px; overflow-y:auto; margin-bottom:10px; }
        .gc-rail-submit-wrap { margin-top:4px; }
        .gc-rail-submit-wrap .gc-submit-btn { width:100%; justify-content:center; }

        /* Work focus rail: your work + private comments */
        .sc-rail--work-focus { position:sticky; top:88px; align-self:start; }
        .sc-rail-focus-stack { display:flex; flex-direction:column; gap:16px; }
        .sc-rail-focus-stack .sc-rail-private-panel {
            min-height:min(360px, calc(100vh - 420px));
            max-height:calc(100vh - 200px);
        }

        .gc-due-editor {
            display:flex; flex-wrap:wrap; align-items:center; gap:10px;
            padding:14px 16px; margin:0 0 16px;
            background:#F8F9FA; border:1px solid #E8EAED; border-radius:12px;
        }
        .gc-due-editor-label { font-size:12px; font-weight:700; color:#374151; text-transform:uppercase; letter-spacing:.3px; }
        .gc-due-editor input[type="date"] {
            padding:8px 10px; border:1px solid #DADCE0; border-radius:8px; font-size:13px;
        }
        .gc-due-editor-save {
            padding:8px 14px; border:none; border-radius:8px;
            background:var(--subj, ${G}); color:#fff; font-size:12px; font-weight:700; cursor:pointer;
        }
        .gc-due-editor-save:hover { background:var(--subj-dark, ${G2}); }
        .gc-due-editor-hint { flex:1 1 100%; font-size:11px; color:#5F6368; margin:0; }

        /* Private comments rail (Google Classroom style) */
        .sc-rail--private-focus { position:sticky; top:88px; align-self:start; }
        .sc-rail-private-panel {
            display:flex; flex-direction:column;
            min-height:min(520px, calc(100vh - 160px));
            max-height:calc(100vh - 120px);
            padding:0; overflow:hidden;
            border:1px solid #E8EAED; border-radius:12px;
            box-shadow:0 1px 3px rgba(0,0,0,.06);
        }
        .sc-rail-private-head {
            padding:16px 16px 10px; border-bottom:1px solid #E8EAED;
            background:#fff; flex-shrink:0;
        }
        .sc-rail-private-title {
            font-size:14px; font-weight:600; color:#202124;
            margin:0 0 4px; display:flex; align-items:center; gap:8px;
        }
        .sc-rail-private-hint {
            font-size:11px; color:#5F6368; margin:0; line-height:1.4;
        }
        .sc-rail-private-body {
            flex:1; overflow-y:auto; padding:12px 14px;
            background:#fff; min-height:120px;
        }
        .sc-rail-private-body .sc-comment-list { display:flex; flex-direction:column; gap:12px; }
        .sc-rail-private-body .sc-comment { margin:0; }
        .sc-comment-empty--rail {
            font-size:12px; color:#9AA0A6; font-style:italic; margin:8px 0;
            text-align:center; padding:16px 8px;
        }
        .sc-rail-private-footer {
            flex-shrink:0; border-top:1px solid #E8EAED;
            padding:12px 14px; background:#F8F9FA;
        }
        .sc-comment-compose--rail { display:flex; gap:10px; align-items:flex-end; margin:0; }
        .sc-comment-compose--rail .sc-comment-input-wrap {
            flex:1; display:flex; align-items:flex-end; gap:6px;
        }
        .sc-comment-compose--rail .sc-comment-input {
            min-height:36px; max-height:120px; border-radius:20px;
            border:1px solid #DADCE0; padding:8px 14px; font-size:13px;
            resize:none; width:100%; font-family:inherit;
        }
        .sc-rail-private-footer--hint { padding:14px 16px; background:#F8F9FA; }
        .sc-private-reply-banner {
            display:flex; align-items:center; justify-content:space-between; gap:8px;
            padding:8px 12px; margin-bottom:8px; background:#E8F5EC; border-radius:8px;
            font-size:12px; color:#00461B;
        }
        .sc-private-reply-cancel {
            background:none; border:none; font-size:18px; line-height:1; cursor:pointer; color:#5F6368;
        }
        .sc-comment--thread-reply { margin-left:20px; }
        .sc-comment--thread-reply .sc-avatar { width:28px; height:28px; font-size:11px; }
        .sc-comment-reply-btn {
            margin-left:auto; background:none; border:none; color:#5F6368; cursor:pointer;
            padding:4px; border-radius:6px; display:inline-flex; align-items:center;
        }
        .sc-comment-reply-btn:hover { color:var(--subj, ${G}); background:#F1F3F4; }
        .sc-comment-swipe-track { position:relative; overflow:hidden; border-radius:8px; }
        .sc-comment-swipe-reveal {
            position:absolute; left:0; top:0; bottom:0; width:72px;
            display:flex; align-items:center; justify-content:center; gap:4px;
            background:#E8F5EC; color:var(--subj, ${G}); font-size:11px; font-weight:600;
            opacity:0; transition:opacity .15s; pointer-events:none;
        }
        .sc-comment-swipe-content {
            display:flex; gap:10px; align-items:flex-start;
            background:#fff; transition:transform .15s ease-out; position:relative; z-index:1;
        }
        @media (hover:hover) {
            .sc-comment-swipe-reveal { display:none; }
        }

        .gc-modal-overlay {
            position:fixed; inset:0; z-index:4000;
            background:rgba(15,23,42,.55); backdrop-filter:blur(4px);
            display:flex; align-items:center; justify-content:center; padding:20px;
        }
        body.gc-modal-open { overflow:hidden; }
        .gc-modal {
            background:#fff; border-radius:16px; width:100%; max-width:520px;
            max-height:min(88vh, 720px); display:flex; flex-direction:column;
            box-shadow:0 24px 48px rgba(0,0,0,.2); overflow:hidden;
        }
        .gc-modal--wide { max-width:860px; }
        .gc-modal-hdr {
            display:flex; align-items:center; justify-content:space-between; gap:12px;
            padding:18px 22px; border-bottom:1px solid #E8EAED; flex-shrink:0;
        }
        .gc-modal-title { font-size:18px; font-weight:700; color:#202124; margin:0; }
        .gc-modal-close {
            background:#F1F3F4; border:none; width:36px; height:36px; border-radius:50%;
            font-size:22px; line-height:1; cursor:pointer; color:#5F6368;
        }
        .gc-modal-close:hover { background:#E8EAED; }
        .gc-modal-body { padding:20px 22px 24px; overflow-y:auto; flex:1; }

        .gc-detail-action-row {
            display:flex; flex-wrap:wrap; gap:10px; margin:0 0 16px;
        }
        .gc-detail-action-btn {
            display:inline-flex; align-items:center; gap:8px;
            padding:10px 16px; border:1px solid #DADCE0; border-radius:10px;
            background:#fff; font-size:13px; font-weight:600; color:#202124; cursor:pointer;
        }
        .gc-detail-action-btn:hover {
            border-color:var(--subj, ${G}); color:var(--subj, ${G}); background:var(--subj-soft, #F8F9FA);
        }
        .gc-modal-section { margin-bottom:20px; }
        .gc-modal-section:last-child { margin-bottom:0; }
        .gc-modal-section-title {
            font-size:14px; font-weight:600; color:#202124; margin:0 0 12px;
            display:flex; align-items:center; gap:8px;
        }

        .sc-layout--work-focus { align-items:stretch; }

        /* Page footer */
        .sc-page-footer {
            margin-top:28px; padding:20px 24px;
            border-top:1px solid #E8EAED; background:#FAFAFA;
            border-radius:0 0 12px 12px;
        }
        .sc-page-footer-inner {
            display:flex; justify-content:space-between; align-items:center;
            flex-wrap:wrap; gap:8px; font-size:12px; color:#5F6368;
        }
        .sc-page-footer-brand { font-weight:600; color:#3C4043; }

        .sc-panel {
            background:#fff; border:1px solid ${BORDER};
            border-radius:16px; overflow:hidden;
            box-shadow:0 1px 4px rgba(0,0,0,.04);
        }
        .sc-tabs {
            display:flex; gap:0; background:#FAFAFA;
            border-bottom:1px solid ${BORDER}; padding:0 8px;
        }
        .sc-tab {
            padding:16px 22px; border:none; background:none;
            font-size:14px; font-weight:600; color:#6B7280; cursor:pointer;
            border-bottom:3px solid transparent; margin-bottom:-1px;
            transition:color .15s, background .15s;
            border-radius:8px 8px 0 0;
        }
        .sc-tab:hover { color:${accent}; background:rgba(0,70,27,.04); }
        .sc-tab.active { color:${accent}; border-bottom-color:${accent}; background:#fff; }

        .sc-body { padding:24px 28px 32px; min-height:280px; }
        .sc-body-focus { padding:20px 24px 28px; }

        /* Google Classroom–style classwork list */
        .gc-cw-list {
            display:flex; flex-direction:column;
            border:1px solid #DADCE0; border-radius:8px; overflow:hidden;
            background:#fff;
        }
        .gc-cw-row {
            display:flex; align-items:center; gap:16px; width:100%;
            padding:14px 18px; background:#fff; border:none;
            border-bottom:1px solid #E8EAED;
            cursor:pointer; text-align:left; font-family:inherit;
            transition:background .12s;
        }
        .gc-cw-row:last-child { border-bottom:none; }
        .gc-cw-row:hover:not(:disabled) { background:var(--subj-row-hover, #F8F9FA); }
        .gc-cw-row.done { background:var(--subj-soft, #F6FEF9); }
        .gc-cw-row.locked { opacity:.65; cursor:not-allowed; }
        .gc-cw-icon {
            width:40px; height:40px; border-radius:50%;
            display:flex; align-items:center; justify-content:center; flex-shrink:0;
        }
        .gc-cw-icon--subj {
            background:var(--subj-icon-bg, #CEEAD6);
            color:var(--subj, ${accent});
        }
        .gc-cw-icon--subj svg { stroke:var(--subj, ${accent}); }
        .gc-cw-body { flex:1; min-width:0; }
        .gc-cw-title { font-size:14px; font-weight:500; color:#202124; margin-bottom:2px; }
        .gc-cw-type { font-size:12px; color:#5F6368; }
        .gc-cw-right {
            display:flex; flex-direction:column; align-items:flex-end; gap:4px;
            flex-shrink:0; font-size:12px; color:#5F6368;
        }
        .gc-cw-points { font-weight:500; color:#202124; white-space:nowrap; }
        .gc-cw-due { white-space:nowrap; }
        .gc-cw-due.late { color:#C5221F; font-weight:500; }
        .gc-cw-status { display:inline-flex; align-items:center; gap:4px; font-weight:500; }
        .gc-cw-status.done { color:#137333; }
        .gc-cw-status.locked { color:#9AA0A6; }

        .gc-cw-stream { display:flex; flex-direction:column; gap:16px; padding-top:4px; }
        .gc-post-card {
            border:1px solid #DADCE0; border-radius:12px; background:#fff;
            overflow:visible; box-shadow:0 1px 3px rgba(0,0,0,.04);
        }
        .gc-post-card__row {
            display:flex; align-items:stretch; position:relative;
        }
        .gc-post-card__row .gc-post-card__btn { flex:1; min-width:0; }
        .gc-cw-kebab-wrap { position:relative; flex-shrink:0; border-left:1px solid #F0F0F0; }
        .gc-cw-kebab {
            display:flex; align-items:center; justify-content:center;
            width:44px; height:100%; min-height:72px; border:none; background:#fff;
            color:#5F6368; cursor:pointer; font-size:18px; line-height:1;
            transition:background .12s, color .12s;
        }
        .gc-cw-kebab:hover { background:#F8F9FA; color:#00461B; }
        .gc-cw-kebab-menu {
            position:absolute; right:0; top:calc(100% + 4px); z-index:300;
            background:#fff; border:1px solid #DADCE0; border-radius:10px;
            box-shadow:0 6px 20px rgba(0,0,0,.12); min-width:180px;
            overflow:hidden; display:none;
        }
        .gc-cw-kebab-menu.open { display:block; }
        .gc-cw-kebab-item {
            display:flex; align-items:center; gap:8px; width:100%;
            padding:10px 14px; border:none; background:#fff; cursor:pointer;
            font-size:13px; font-weight:500; color:#202124; text-align:left;
            font-family:inherit; text-decoration:none;
        }
        .gc-cw-kebab-item:hover { background:#F8FDF9; }
        .gc-cw-kebab-item.danger { color:#C5221F; }
        .gc-cw-kebab-item.danger:hover { background:#FCE8E6; }
        .gc-post-card__btn {
            display:block; width:100%; padding:0; border:none; background:#fff;
            cursor:pointer; text-align:left; font-family:inherit;
            transition:background .12s;
        }
        .gc-post-card__btn:hover:not(:disabled) { background:#F8F9FA; }
        .gc-post-card__btn:disabled { opacity:.65; cursor:not-allowed; }
        .gc-post-card__btn.done { background:#F6FEF9; }
        .gc-post-card__btn.locked { opacity:.65; }
        .gc-post-card__hdr {
            display:flex; align-items:center; gap:10px;
            padding:14px 16px 10px; border-bottom:1px solid #F0F0F0;
        }
        .gc-post-card__work {
            display:flex; align-items:center; gap:16px;
            padding:14px 16px 16px;
        }
        .gc-post-card__views {
            display:flex; align-items:center; justify-content:space-between; gap:10px;
            padding:10px 16px 12px; border-top:1px solid #F0F0F0;
            background:#FAFAFA; font-size:12px; color:#5F6368;
        }
        .gc-view-summary { display:inline-flex; align-items:center; gap:6px; font-weight:500; }
        .gc-viewers-toggle {
            border:none; background:none; color:${accent}; font-size:12px;
            font-weight:600; cursor:pointer; font-family:inherit; padding:0;
        }
        .gc-viewers-toggle:hover { text-decoration:underline; }
        .gc-viewers-panel {
            border-top:1px solid #E8EAED; background:#fff; padding:12px 16px 16px;
        }
        .gc-viewers-panel h4 {
            font-size:11px; font-weight:700; text-transform:uppercase;
            letter-spacing:.04em; color:#9AA0A6; margin:0 0 8px;
        }
        .gc-viewers-list { display:flex; flex-direction:column; gap:6px; margin-bottom:12px; }
        .gc-viewer-row {
            display:flex; align-items:center; gap:10px; font-size:13px; color:#202124;
        }
        .gc-viewer-row .sc-avatar { width:28px; height:28px; font-size:11px; }
        .gc-viewer-meta { flex:1; min-width:0; }
        .gc-viewer-name { font-weight:600; display:block; }
        .gc-viewer-sub { font-size:11px; color:#9AA0A6; }
        .gc-viewer-time { font-size:11px; color:#5F6368; white-space:nowrap; }
        .gc-viewers-empty { font-size:12px; color:#9AA0A6; font-style:italic; margin:0; }

        .sc-detail-back {
            border:none; background:none; font-size:13px; font-weight:600;
            color:#5F6368; cursor:pointer; padding:0; margin-bottom:16px;
        }
        .sc-detail-back:hover { color:${G}; }
        .sc-detail-card {
            background:#fff; border:1px solid #DADCE0; border-radius:8px;
            padding:24px; margin-bottom:20px;
        }
        .sc-detail-type { font-size:12px; color:#5F6368; margin-bottom:8px; }
        .sc-detail-title { font-size:22px; font-weight:400; color:#202124; margin:0 0 16px; }
        .sc-detail-overview h4 { font-size:13px; font-weight:600; color:#202124; margin:0 0 8px; }
        .sc-detail-overview p { font-size:14px; color:#3C4043; line-height:1.6; margin:0 0 16px; white-space:pre-wrap; }
        .sc-detail-meta {
            display:flex; flex-wrap:wrap; gap:12px; font-size:12px; color:#5F6368;
            margin-bottom:16px;
        }
        .sc-detail-badge {
            padding:4px 10px; border-radius:12px; font-weight:600; font-size:11px;
        }
        .sc-detail-badge.done { background:#E6F4EA; color:#137333; }
        .sc-detail-badge.locked { background:#F1F3F4; color:#5F6368; }
        .sc-detail-badge.open { background:#E8F0FE; color:#1967D2; }
        .sc-detail-attachments h4 { font-size:13px; font-weight:600; margin:0 0 8px; }
        .sc-attach { font-size:13px; color:#3C4043; padding:6px 0; }
        .sc-open-btn {
            display:inline-block; padding:10px 20px; background:${G}; color:#fff;
            border-radius:6px; font-size:13px; font-weight:600; text-decoration:none;
            margin-top:8px;
        }
        .sc-open-btn:hover { background:${G2}; }
        .sc-locked-note { font-size:13px; color:#5F6368; font-style:italic; margin:8px 0 0; }

        .sc-people-grid {
            display:grid; grid-template-columns:minmax(260px, 320px) 1fr;
            gap:20px; align-items:start;
        }
        .sc-people-card {
            background:#FAFAFA; border:1px solid ${BORDER};
            border-radius:14px; padding:20px 22px;
        }
        .sc-section-title {
            font-size:13px; font-weight:700; text-transform:uppercase;
            letter-spacing:.6px; color:#6B7280; margin:0 0 16px;
        }
        .sc-badge-count {
            font-weight:700; color:${G}; background:#E8F5EC;
            padding:2px 8px; border-radius:10px; margin-left:4px;
        }
        .sc-person-block {
            display:flex; align-items:center; gap:16px; width:100%;
            text-align:left; background:none; border:none; padding:0;
            font:inherit; color:inherit;
        }
        .sc-person-click, .sc-mate-click {
            cursor:pointer; transition:background .15s, border-color .15s;
            border:1px solid transparent; border-radius:12px; padding:12px 14px;
            width:100%; text-align:left; background:#fff;
            font:inherit; color:inherit;
        }
        .sc-person-click:hover, .sc-mate-click:hover {
            background:#F0FDF4; border-color:#BBF7D0;
        }
        .sc-person-chevron { font-size:20px; color:#9CA3AF; margin-left:auto; flex-shrink:0; }
        .sc-people-hint { font-size:12px; color:#9CA3AF; margin:-8px 0 12px; }
        .sc-avatar {
            width:40px; height:40px; border-radius:50%;
            background:#E5E7EB; color:#374151;
            display:flex; align-items:center; justify-content:center;
            font-size:14px; font-weight:700; flex-shrink:0;
        }
        .sc-avatar.lg { width:56px; height:56px; font-size:18px; }
        .sc-avatar.sm { width:32px; height:32px; font-size:11px; }
        .sc-avatar.teacher-av { background:${G}; color:#fff; }
        .sc-person-name { font-size:16px; font-weight:700; color:#111; }
        .sc-person-role { font-size:13px; color:#6B7280; margin-top:2px; }
        .sc-person-email { font-size:12px; color:#9CA3AF; margin-top:4px; }
        .sc-mates-grid {
            display:grid; grid-template-columns:repeat(auto-fill, minmax(220px, 1fr));
            gap:10px;
        }
        .sc-mate {
            display:flex; align-items:center; gap:12px;
            padding:12px 14px; background:#fff;
            border:1px solid ${BORDER}; border-radius:10px;
        }
        .sc-mate.is-me { border-color:${G}; background:#F0FDF4; cursor:default; }

        .sc-person-overlay, .sc-video-overlay {
            position:fixed; inset:0; background:rgba(0,0,0,.45);
            display:flex; align-items:center; justify-content:center;
            z-index:950; padding:20px;
        }
        .sc-person-modal {
            background:#fff; border-radius:16px; padding:28px 24px 24px;
            width:100%; max-width:360px; text-align:center;
            position:relative; box-shadow:0 20px 50px rgba(0,0,0,.2);
        }
        .sc-person-close {
            position:absolute; top:12px; right:14px;
            background:none; border:none; font-size:24px;
            color:#9CA3AF; cursor:pointer; line-height:1;
        }
        .sc-person-modal-av {
            width:64px; height:64px; border-radius:50%;
            background:#E5E7EB; color:#374151;
            display:flex; align-items:center; justify-content:center;
            font-size:22px; font-weight:700; margin:0 auto 12px;
        }
        .sc-person-modal-name { font-size:18px; font-weight:700; color:#111; margin:0 0 4px; }
        .sc-person-modal-role { font-size:13px; color:#6B7280; margin:0 0 20px; }
        .sc-person-modal-actions { display:flex; flex-direction:column; gap:10px; }

        .sc-video-modal {
            background:#111; border-radius:16px; overflow:hidden;
            width:100%; max-width:1100px; height:min(85vh, 720px);
            display:flex; flex-direction:column;
            box-shadow:0 24px 60px rgba(0,0,0,.35);
        }
        .sc-video-head {
            display:flex; justify-content:space-between; align-items:center;
            padding:14px 20px; background:#1a1a1a; color:#fff; flex-shrink:0;
        }
        .sc-video-head h3 { font-size:15px; font-weight:700; margin:0 0 2px; }
        .sc-video-head p { font-size:12px; opacity:.7; margin:0; }
        .sc-video-close {
            background:#DC2626; color:#fff; border:none;
            padding:8px 16px; border-radius:8px; font-size:13px;
            font-weight:700; cursor:pointer;
        }
        .sc-video-frame { flex:1; width:100%; border:none; background:#000; }
        .sc-mate-info { min-width:0; }
        .sc-mate-name { display:block; font-size:13px; font-weight:600; color:#111; }
        .sc-mate-id { display:block; font-size:11px; color:#9CA3AF; margin-top:2px; }
        .sc-you {
            display:inline-block; font-size:10px; font-weight:700; color:${G};
            background:#DCFCE7; padding:2px 6px; border-radius:4px; margin-left:4px;
        }
        .sc-muted { font-size:13px; color:#9CA3AF; margin:0; }

        .sc-announcements { display:flex; flex-direction:column; gap:16px; }
        .sc-ann-card {
            background:#FAFAFA; border:1px solid ${BORDER};
            border-radius:14px; padding:20px 22px;
        }
        .sc-ann-head { display:flex; gap:12px; margin-bottom:12px; align-items:center; }
        .sc-ann-author { font-size:14px; font-weight:700; color:#111; }
        .sc-ann-date { font-size:12px; color:#9CA3AF; }
        .sc-ann-title { font-size:16px; font-weight:700; color:#111; margin-bottom:8px; }
        .sc-ann-msg { font-size:14px; color:#4B5563; line-height:1.6; margin:0; white-space:pre-wrap; }
        .sc-ann-comments-section {
            margin-top:8px; padding-top:24px;
            border-top:1px solid ${BORDER};
        }
        .sc-ann-comments-hdr { font-size:16px; font-weight:700; color:#111; margin:0 0 4px; }
        .sc-ann-hint { font-size:13px; color:#6B7280; margin:0 0 16px; }

        .sc-lesson-host {
            background:#FAFAFA; border:1px solid ${BORDER};
            border-radius:14px; padding:20px; margin-bottom:0;
        }
        .sc-lesson-loading { text-align:center; padding:48px; color:#9CA3AF; font-size:14px; }
        .sc-lesson-comments {
            margin-top:20px; padding:20px 22px;
            background:#FAFAFA; border:1px solid ${BORDER}; border-radius:14px;
        }
        .sc-comments-hdr { font-size:14px; font-weight:700; color:#111; margin:0 0 12px; }

        .sc-comments { margin-top:8px; }
        .sc-comment-compose {
            display:flex; gap:12px; margin-bottom:16px;
        }
        .sc-comment-input-wrap { flex:1; }
        .sc-comment-input {
            width:100%; padding:10px 12px; border:1px solid #DADCE0;
            border-radius:8px; font-size:13px; font-family:inherit;
            resize:vertical; min-height:44px; outline:none; box-sizing:border-box;
        }
        .sc-comment-input:focus { border-color:${G}; }
        .sc-comment-btn {
            margin-top:8px; padding:8px 18px; background:${G}; color:#fff;
            border:none; border-radius:6px; font-size:13px; font-weight:600; cursor:pointer;
        }
        .sc-comment-btn:hover { background:${G2}; }
        .sc-comment-list { display:flex; flex-direction:column; gap:12px; }
        .sc-comment { display:flex; gap:12px; }
        .sc-comment.mine .sc-comment-body { background:#F8F9FA; }
        .sc-comment-body {
            flex:1; background:#fff; border:1px solid #E8EAED;
            border-radius:8px; padding:10px 14px;
        }
        .sc-comment-head { display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:4px; }
        .sc-comment-author { font-size:13px; font-weight:600; color:#202124; }
        .sc-comment-role { font-size:10px; font-weight:700; color:${G}; background:#E6F4EA; padding:2px 6px; border-radius:4px; }
        .sc-comment-date { font-size:11px; color:#9AA0A6; margin-left:auto; }
        .sc-comment-text { font-size:13px; color:#3C4043; line-height:1.5; margin:0; white-space:pre-wrap; }
        .sc-comment-empty { font-size:13px; color:#9AA0A6; font-style:italic; }

        .sc-empty {
            text-align:center; padding:56px 32px; color:#9CA3AF;
            border:2px dashed ${BORDER}; border-radius:14px; background:#FAFAFA;
        }
        .sc-empty-icon { font-size:44px; margin-bottom:12px; }
        .sc-empty h3 { font-size:17px; font-weight:700; color:#111; margin:0 0 8px; }
        .sc-empty p { font-size:14px; margin:0; color:#6B7280; }

        /* Assignment detail — single stacked column */
        .sc-page-focus {
            min-height:calc(100vh - 80px); max-width:900px;
            margin:0 auto; padding:12px 20px 40px;
            background:#fff; box-sizing:border-box;
        }
        .gc-detail--stack { width:100%; }
        .gc-detail-top {
            display:flex; align-items:center; gap:8px;
            padding:0 0 12px; margin-bottom:4px;
        }
        .gc-back-btn {
            width:40px; height:40px; border:none; background:none; border-radius:50%;
            display:flex; align-items:center; justify-content:center;
            cursor:pointer; color:#5F6368; flex-shrink:0;
        }
        .gc-back-btn:hover { background:var(--subj-soft, #F1F3F4); color:var(--subj, ${accent}); }
        .gc-breadcrumb { font-size:14px; font-weight:500; color:#5F6368; }
        .gc-detail-stack {
            display:flex; flex-direction:column; gap:20px;
            width:100%;
        }
        .gc-assign-head {
            display:flex; gap:18px; align-items:flex-start;
        }
        .gc-assign-icon {
            width:52px; height:52px; border-radius:50%; flex-shrink:0;
            display:flex; align-items:center; justify-content:center;
            background:var(--subj, ${accent}); color:#fff;
        }
        .gc-assign-icon svg { stroke:#fff; }
        .gc-assign-head-text { flex:1; min-width:0; }
        .gc-detail-title {
            font-size:26px; font-weight:400; color:#202124;
            margin:0 0 6px; line-height:1.25;
        }
        .gc-detail-meta { font-size:13px; color:#5F6368; margin:0 0 2px; }
        .gc-detail-type { font-size:13px; color:#5F6368; margin:0; }
        .gc-points-due-row {
            display:flex; justify-content:space-between; align-items:center;
            font-size:13px; color:#5F6368; padding:0 2px;
        }
        .gc-due.late { color:#C5221F; font-weight:500; }
        .gc-divider {
            border:none; border-top:1px solid #DADCE0;
            margin:0;
        }
        .gc-instructions-body {
            font-size:14px; color:#3C4043; line-height:1.65;
            white-space:pre-wrap; margin:0;
        }
        .gc-instructions-extra {
            font-size:13px; color:#5F6368; margin:0; line-height:1.5;
        }
        .gc-lesson-host {
            width:100%; min-height:80px;
            border:none; border-radius:8px;
            padding:0; box-sizing:border-box; background:transparent;
        }
        .gc-focus-card-empty {
            font-size:13px; color:#5F6368; margin:0; font-style:italic;
        }
        .gc-focus-card {
            width:100%; box-sizing:border-box;
            border:1px solid #E8EAED; border-radius:12px;
            padding:18px 20px; background:#fff;
            box-shadow:0 2px 10px rgba(0,0,0,.08);
        }
        .gc-focus-card--comments { margin-top:4px; }
        .gc-focus-card--attach .gc-attach-tiles { margin-top:4px; }
        .gc-focus-card-hdr {
            display:flex; justify-content:space-between; align-items:center;
            gap:10px; margin-bottom:14px;
        }
        .gc-focus-card-title {
            font-size:14px; font-weight:500; color:#202124;
            margin:0 0 14px; display:flex; align-items:center; gap:8px;
        }
        .gc-focus-card-hdr .gc-focus-card-title { margin-bottom:0; }
        .gc-focus-card-note {
            font-size:12px; color:#5F6368; margin:12px 0 0; line-height:1.45;
        }
        .gc-focus-card-note--muted { margin-top:8px; }
        .gc-focus-card-note--warn { color:#C5221F; font-weight:600; margin-top:8px; }
        .gc-work-status { font-size:13px; font-weight:500; color:#5F6368; }
        .gc-work-status.done { color:#137333; }
        .gc-attach-tiles {
            display:flex; flex-wrap:wrap; gap:12px;
        }
        .gc-attach-tile {
            display:flex; flex-direction:column; align-items:center;
            width:112px; padding:12px 8px; border:1px solid #DADCE0;
            border-radius:8px; text-decoration:none; color:#202124;
            background:#FAFAFA; transition:box-shadow .15s, border-color .15s;
        }
        .gc-attach-tile:hover {
            border-color:var(--subj, ${accent});
            box-shadow:0 2px 8px color-mix(in srgb, var(--subj, ${accent}) 18%, transparent);
        }
        .gc-tile-thumb {
            width:64px; height:64px; object-fit:cover; border-radius:4px; margin-bottom:8px;
        }
        .gc-tile-icon {
            width:64px; height:64px; border-radius:4px; margin-bottom:8px;
            display:flex; align-items:center; justify-content:center;
            background:var(--subj-soft, #F1F3F4);
            color:var(--subj, ${accent});
        }
        .gc-tile-name {
            font-size:11px; text-align:center; line-height:1.3;
            overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;
            word-break:break-word; width:100%;
        }
        .gc-submit-btn {
            display:flex; align-items:center; justify-content:center; gap:8px;
            width:100%; padding:11px 20px; border-radius:24px;
            font-size:14px; font-weight:500; font-family:inherit;
            text-decoration:none; cursor:pointer; box-sizing:border-box;
            background:var(--subj, ${accent}); color:#fff;
            border:1px solid var(--subj, ${accent});
            transition:filter .15s;
        }
        .gc-submit-btn:hover:not(:disabled) { color:#fff; filter:brightness(1.08); }
        .gc-submit-btn--outline {
            background:#fff; color:var(--subj, ${accent});
            border-color:#DADCE0;
        }
        .gc-submit-btn--outline:hover { background:var(--subj-soft, #F8F9FA); filter:none; }
        .gc-submit-btn--done {
            background:var(--subj-soft, #E6F4EA); color:#137333;
            border-color:var(--subj-light, #CEEAD6); cursor:default;
        }
        .gc-submit-btn:disabled { opacity:.6; cursor:not-allowed; filter:none; }
        .sc-comments--gc, .sc-comments--private { margin:0; }
        .sc-comment-compose--inline .sc-comment-input-wrap {
            display:flex; align-items:flex-end; gap:8px;
        }
        .sc-comment-compose--inline .sc-comment-input {
            min-height:40px; border-radius:20px;
        }
        .sc-comment-input:focus {
            border-color:var(--subj, ${accent});
            box-shadow:0 0 0 2px color-mix(in srgb, var(--subj, ${accent}) 20%, transparent);
        }
        .gc-send-btn {
            flex-shrink:0; width:40px; height:40px; border-radius:50%;
            border:none; background:transparent; color:#5F6368;
            display:flex; align-items:center; justify-content:center;
            cursor:pointer;
        }
        .gc-send-btn:hover {
            color:var(--subj, ${accent});
            background:var(--subj-soft, #F1F3F4);
        }
        .lv-focus .lesson-layout { display:block; }
        .lv-focus .lesson-main { padding:0; }
        .lv-focus .lesson-sidebar { display:none; }
        .lv-focus .lesson-header h1 { font-size:18px; font-weight:500; }
        .lv-focus .content-card,
        .lv-focus .objectives-card,
        .lv-focus .lv-materials-block { margin-bottom:16px; }
        .lv-focus .lv-focus-card,
        .lv-focus .lv-materials-block {
            background:#fff; border:1px solid #e8e8e8; border-radius:12px;
            padding:20px; box-shadow:0 2px 10px rgba(0,0,0,.08);
        }
        .lv-focus .lv-materials-block { padding:14px; }
        .lv-focus .content-card.lv-focus-card { padding:20px 24px; }
        .sc-body-focus .gc-detail-stack { gap:16px; }
        .sc-body-focus .gc-focus-card {
            box-shadow:0 2px 10px rgba(0,0,0,.08);
            border:1px solid #E8EAED; background:#fff;
        }
        .gc-focus-card-hdr--actions { align-items:flex-start; }
        .gc-focus-card-submit { margin-left:auto; flex-shrink:0; }
        .gc-focus-card-submit .gc-submit-btn { width:auto; min-width:100px; }

        @media (max-width:1100px) {
            .sc-layout { grid-template-columns:1fr; }
            .sc-rail {
                position:static; display:grid;
                grid-template-columns:1fr 1fr; gap:16px;
            }
            .sc-rail--private-focus, .sc-rail--work-focus { position:static; }
            .sc-rail-private-panel { min-height:280px; max-height:none; }
        }
        @media (max-width:900px) {
            .sc-page-focus { padding:8px 14px 32px; }
            .gc-detail-title { font-size:22px; }
            .sc-hero { padding:22px 20px; }
            .sc-hero-title { font-size:22px; }
            .sc-hero-stats { width:100%; justify-content:flex-start; }
            .sc-people-grid { grid-template-columns:1fr; }
            .sc-body { padding:20px 16px 28px; }
            .sc-tabs { overflow-x:auto; }
            .sc-tab { padding:14px 16px; white-space:nowrap; }
            .sc-rail { grid-template-columns:1fr; }
        }
    `;
}
