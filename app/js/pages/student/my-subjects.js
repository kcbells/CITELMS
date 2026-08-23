/**
 * Student My Subjects — polished full-width classroom grid
 */
import { Api } from '../../api.js';
import { subjectColor, programPatternSvg } from '../../utils/subject-colors.js';
import { icon, iconLg } from '../../utils/icons.js';
import { openJoinPanel } from '../../components/student-enroll-fab.js';
import { subjectHash } from './quizzes.js';
import { notify } from '../../utils/notify.js';

const inl = { size: 14, className: 'ui-icon-inline' };
const G  = '#00461B';
const G2 = '#006428';
const GL = '#E8F5EC';
const BORDER = '#E5E7EB';
const MUTED = '#6B7280';

let refreshHandler = null;

export async function render(container) {
    const params = new URLSearchParams(window.location.hash.split('?')[1] || '');

    if (params.get('tab') === 'quizzes') {
        const sid = params.get('subject_id') || '';
        const qid = params.get('quiz_id') || '';
        window.location.hash = sid
            ? subjectHash(sid, 'classwork', qid ? { type: 'quiz', id: qid } : null)
            : '#student/my-subjects';
        return;
    }

    if (params.get('tab') === 'grades') {
        window.location.hash = '#student/my-subjects';
        return;
    }

    const view = params.get('view') === 'archived' ? 'archived' : 'active';

    container.innerHTML = `<div class="ms-loading"><div class="ms-spin"></div></div>`;

    const [res, annRes, pendingRes] = await Promise.all([
        Api.get('/EnrollmentAPI.php?action=my-subjects'),
        Api.get('/AnnouncementsAPI.php?action=student-list'),
        Api.get('/EnrollmentAPI.php?action=my-pending'),
    ]);

    const allSubjects = res.success ? res.data : [];
    const pendingJoins = pendingRes.success ? (pendingRes.data || []) : [];
    const activeSubjects   = allSubjects.filter(s => s.offering_status !== 'archived');
    const archivedSubjects = allSubjects.filter(s => s.offering_status === 'archived');
    const subjects = view === 'archived' ? archivedSubjects : activeSubjects;

    const annBySubject = groupAnnouncements(annRes.success ? annRes.data : []);

    const emptyArchivedHtml = `
        <div class="ms-empty-state">
            <div class="ms-empty-icon">${iconLg('book')}</div>
            <h2>No archived classes</h2>
            <p>When an instructor archives a subject, it will appear here.</p>
            <a href="#student/my-subjects" class="ms-join-btn ms-join-btn-lg">Back to Active Subjects</a>
        </div>
    `;

    const emptyActiveHtml = `
        <div class="ms-empty-state">
            <div class="ms-empty-icon">${iconLg('book')}</div>
            <h2>No subjects enrolled</h2>
            <p>Join a class with your subject code to see your subjects here.</p>
            <button type="button" class="ms-join-btn ms-join-btn-lg" id="ms-join-btn-empty">Join Class</button>
        </div>
    `;

    container.innerHTML = `
        <style>${styles()}</style>
        <div class="ms-page" id="ms-page-root">
            ${buildShell(activeSubjects.length, archivedSubjects.length, view)}
            ${view === 'active' && pendingJoins.length > 0 ? renderPendingBanner(pendingJoins) : ''}
            <div id="ms-panel-subjects">
        ${subjects.length === 0 ? (view === 'archived' ? emptyArchivedHtml : emptyActiveHtml) : `
                <div class="ms-grid" id="ms-grid">
                    ${subjects.map(s => renderCard(s, annBySubject)).join('')}
                </div>
            `}
            </div>
        </div>
    `;

    applyPageBg(container);

    const pageRoot = container.querySelector('#ms-page-root');
    pageRoot.querySelectorAll('#ms-join-btn, #ms-join-btn-empty').forEach((btn) => {
        btn.addEventListener('click', () => openJoinPanel());
    });

    if (refreshHandler) window.removeEventListener('student-subjects-refresh', refreshHandler);
    refreshHandler = () => render(container);
    window.addEventListener('student-subjects-refresh', refreshHandler);

    bindPendingBanner(container);

    if (subjects.length === 0) return;

    bindCardMenus(container);
}

/* ── Pending join requests — waiting on instructor approval ────── */

function renderPendingBanner(pendingJoins) {
    return `
    <div class="ms-pending-banner">
        <div class="ms-pending-hdr">
            ${icon('clock', inl)}
            <span>Waiting for instructor approval (${pendingJoins.length})</span>
        </div>
        <div class="ms-pending-list">
            ${pendingJoins.map(p => `
                <div class="ms-pending-row" data-pending-id="${p.request_id}">
                    <div>
                        <strong>${esc(p.subject_code)}</strong> — ${esc(p.subject_name)}
                        <span class="ms-pending-sub">${esc(p.section_name)}</span>
                    </div>
                    <button type="button" class="ms-pending-cancel" data-cancel-pending="${p.request_id}">Cancel</button>
                </div>
            `).join('')}
        </div>
    </div>`;
}

function bindPendingBanner(container) {
    container.querySelectorAll('[data-cancel-pending]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const requestId = parseInt(btn.dataset.cancelPending, 10);
            const ok = await notify.confirm('Cancel this join request? You can request to join again later if you change your mind.', { confirmText: 'Cancel Request' });
            if (!ok) return;
            const res = await Api.post('/EnrollmentAPI.php?action=cancel-pending', { request_id: requestId });
            if (res.success) {
                container.querySelector(`[data-pending-id="${requestId}"]`)?.remove();
                const remaining = container.querySelectorAll('[data-pending-id]').length;
                if (remaining === 0) container.querySelector('.ms-pending-banner')?.remove();
                else container.querySelector('.ms-pending-hdr span').textContent = `Waiting for instructor approval (${remaining})`;
                notify.success('Join request cancelled');
            } else {
                notify.error(res.message || 'Failed to cancel request');
            }
        });
    });
}

/* ── Card kebab menu: Unenroll ────────────────────────────────── */

function bindCardMenus(container) {
    const closeAllMenus = () => {
        container.querySelectorAll('[data-kebab-menu]').forEach(m => m.setAttribute('hidden', ''));
    };

    container.querySelectorAll('[data-kebab-toggle]').forEach(toggle => {
        toggle.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const menu = toggle.nextElementSibling;
            const isOpen = !menu.hasAttribute('hidden');
            closeAllMenus();
            if (!isOpen) menu.removeAttribute('hidden');
        });
    });

    document.addEventListener('click', closeAllMenus);

    container.querySelectorAll('.ms-card').forEach(card => {
        const ssId = card.dataset.studentSubjectId;
        const title = card.querySelector('.ms-card-title')?.textContent || 'this subject';

        card.querySelector('[data-card-action="unenroll"]')?.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            closeAllMenus();
            if (!ssId) return;
            const ok = await notify.confirm(
                `Unenroll from "${title}"? You'll lose access to its lessons, quizzes, and grades.`,
                { confirmText: 'Unenroll', danger: true }
            );
            if (!ok) return;
            const res = await Api.post('/EnrollmentAPI.php?action=drop', { student_subject_id: parseInt(ssId, 10) });
            if (res.success) {
                notify.success('Unenrolled from subject');
                card.remove();
            } else {
                notify.error(res.message || 'Failed to unenroll');
            }
        });
    });
}

function buildShell(activeCount, archivedCount, view) {
    return `
        <header class="ms-hero">
            <div class="ms-tabs">
                <a href="#student/my-subjects" class="ms-tab${view !== 'archived' ? ' active' : ''}">
                    Active${activeCount > 0 ? ` (${activeCount})` : ''}
                </a>
                <a href="#student/my-subjects?view=archived" class="ms-tab${view === 'archived' ? ' active' : ''}">
                    Archived${archivedCount > 0 ? ` (${archivedCount})` : ''}
                </a>
            </div>
        </header>
    `;
}

function renderCard(s, annBySubject) {
    const color = subjectColor(s.subject_id);
    const anns = annBySubject[s.subject_id] || [];
    const latest = anns[0];

    return `
    <a class="ms-card" href="#student/subject?subject_id=${s.subject_id}"
       data-search="${esc((s.subject_code + ' ' + s.subject_name + ' ' + (s.instructor_name || '')).toLowerCase())}"
       data-section="${esc(s.section_name || '')}"
       data-student-subject-id="${s.student_subject_id || ''}">
        <div class="ms-card-top" style="background:${color}">
            ${programPatternSvg(s.program_code, s.subject_id)}
            <span class="ms-card-kebab" data-kebab-toggle title="More">
                <span class="material-symbols-outlined">more_vert</span>
            </span>
            <div class="ms-card-menu" data-kebab-menu hidden>
                <span data-card-action="unenroll">${icon('logout', inl)} Unenroll</span>
            </div>
            <span class="ms-card-code">${esc(s.subject_code)}</span>
            <h3 class="ms-card-title">${esc(s.subject_name)}</h3>
            ${s.section_name ? `<span class="ms-card-section">${esc(s.section_name)}</span>` : ''}
        </div>
        <div class="ms-card-bottom">
            <div class="ms-card-row">
                <span class="ms-card-row-icon">${icon('user', inl)}</span>
                <span class="ms-card-row-text">${esc(s.instructor_name || 'Instructor TBA')}</span>
            </div>
            ${s.schedule ? `
            <div class="ms-card-row">
                <span class="ms-card-row-icon">${icon('clock', inl)}</span>
                <span class="ms-card-row-text">${esc(s.schedule)}</span>
            </div>` : ''}
            ${s.room ? `
            <div class="ms-card-row">
                <span class="ms-card-row-icon">${icon('pin', inl)}</span>
                <span class="ms-card-row-text">${esc(s.room)}</span>
            </div>` : ''}
            <div class="ms-card-row">
                <span class="ms-card-row-icon">${icon('quiz', inl)}</span>
                <span class="ms-card-row-text">${Number(s.total_quizzes) || 0} quiz${Number(s.total_quizzes) !== 1 ? 'zes' : ''}${Number(s.completed_quizzes) > 0 ? ` · ${s.completed_quizzes} passed` : ''}</span>
            </div>
            <div class="ms-card-ann">
                <span class="ms-card-ann-label">Announcement</span>
                ${latest
                    ? `<p class="ms-card-ann-text"><strong>${esc(latest.title)}</strong> ${esc(truncate(latest.content, 85))}</p>`
                    : `<p class="ms-card-ann-none">No new announcements</p>`
                }
            </div>
            <span class="ms-card-cta">Open class →</span>
        </div>
    </a>`;
}

function styles() {
    return `
        .ms-page {
            width: 100%;
            min-height: calc(100vh - 120px);
            background: #fff;
        }
        .ms-loading { display:flex; justify-content:center; align-items:center; min-height:320px; background:#fff; }
        .ms-spin {
            width:42px; height:42px; border:3px solid #eee; border-top-color:${G};
            border-radius:50%; animation:msSpin .75s linear infinite;
        }
        @keyframes msSpin { to { transform:rotate(360deg); } }

        .ms-hero {
            display:flex; align-items:center; justify-content:flex-end;
            gap:20px; flex-wrap:wrap;
            margin:0 0 20px;
        }
        .ms-join-btn {
            display:inline-flex; align-items:center; gap:8px;
            padding:11px 20px; background:#fff; color:${G};
            border:1px solid #111; border-radius:10px; font-size:14px; font-weight:700;
            font-family:inherit; cursor:pointer; white-space:nowrap;
            transition:background .15s;
        }
        .ms-join-btn:hover { background:#F3F4F6; }
        .ms-join-icon {
            width:22px; height:22px; border-radius:50%; background:#fff; color:#111;
            display:flex; align-items:center; justify-content:center;
        }
        .ms-join-icon svg { stroke:#111; }
        .ms-join-btn-lg { margin-top:8px; }

        .ms-tabs {
            display:flex; gap:4px; flex-wrap:wrap;
            padding:4px; background:#F3F4F6; border-radius:12px;
        }
        .ms-tab {
            display:inline-flex; align-items:center; gap:6px;
            padding:8px 16px; border-radius:8px;
            font-size:13px; font-weight:700; color:#6B7280;
            text-decoration:none; transition:all .15s;
        }
        .ms-tab:hover { color:#111; background:#E5E7EB; }
        .ms-tab.active { background:#fff; color:${G}; border:1px solid #111; }
        .ms-tab-icon { display:flex; align-items:center; }
        .ms-tab.active .ms-tab-icon svg { stroke:${G}; }


        .ms-pending-banner { background:#FFFBEB; border:1px solid #FDE68A; border-radius:14px; padding:14px 18px; margin-bottom:20px; }
        .ms-pending-hdr { display:flex; align-items:center; gap:8px; font-size:13px; font-weight:700; color:#92400E; margin-bottom:10px; }
        .ms-pending-list { display:flex; flex-direction:column; gap:8px; }
        .ms-pending-row { display:flex; align-items:center; justify-content:space-between; gap:12px;
            background:#fff; border:1px solid #FDE68A; border-radius:10px; padding:10px 14px; }
        .ms-pending-row strong { color:#111; font-size:13px; }
        .ms-pending-row > div { font-size:13px; color:#374151; }
        .ms-pending-sub { display:block; font-size:11.5px; color:#9CA3AF; margin-top:2px; }
        .ms-pending-cancel { background:#fff; color:#B45309; border:1px solid #FDE68A; padding:6px 12px;
            border-radius:8px; font-size:12px; font-weight:700; cursor:pointer; flex-shrink:0; }
        .ms-pending-cancel:hover { background:#FEF3C7; }

        .ms-grid {
            display:grid;
            grid-template-columns:repeat(auto-fill, minmax(300px, 1fr));
            gap:20px;
            align-items:stretch;
            width:100%;
        }

        .ms-card {
            display:flex; flex-direction:column;
            min-height:320px; height:100%;
            border-radius:14px; overflow:hidden;
            text-decoration:none; color:inherit;
            border:none;
            background:#fff;
            box-shadow:none;
            transition:background .15s;
        }
        .ms-card:hover {
            background:#F9FAFB;
        }
        .ms-card-top {
            padding:22px 20px 18px;
            min-height:118px;
            display:flex; flex-direction:column; justify-content:flex-end;
            position:relative;
        }
        .ms-card-kebab {
            position:absolute; top:8px; right:8px; z-index:2;
            width:32px; height:32px; border-radius:50%;
            display:flex; align-items:center; justify-content:center;
            color:#fff; cursor:pointer;
        }
        .ms-card-kebab:hover { background:rgba(255,255,255,.2); }
        .ms-card-kebab .material-symbols-outlined { font-size:19px; }
        .ms-card-menu {
            position:absolute; top:40px; right:8px; z-index:20; min-width:160px;
            background:#fff; border-radius:10px; box-shadow:0 8px 28px rgba(0,0,0,.2);
            border:1px solid ${BORDER}; overflow:hidden; padding:6px;
        }
        .ms-card-menu span {
            display:flex; align-items:center; gap:10px; padding:9px 10px;
            border-radius:7px; cursor:pointer; font-size:13px; font-weight:600; color:#B91C1C;
        }
        .ms-card-menu span:hover { background:#FEE2E2; }
        .ms-card-code {
            font-size:11px; font-weight:700; font-family:ui-monospace, monospace;
            color:rgba(255,255,255,.9); letter-spacing:.6px;
            margin-bottom:6px; position:relative;
        }
        .ms-card-title {
            font-size:17px; font-weight:700; color:#fff; line-height:1.35;
            margin:0; position:relative;
            display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;
        }
        .ms-card-section {
            font-size:11px; font-weight:600; color:rgba(255,255,255,.8);
            margin-top:8px; position:relative;
        }
        .ms-card-bottom {
            flex:1; display:flex; flex-direction:column;
            padding:16px 18px 18px; gap:8px;
        }
        .ms-card-row {
            display:flex; align-items:flex-start; gap:8px;
            font-size:13px; color:#374151; line-height:1.4;
        }
        .ms-card-row-icon { flex-shrink:0; width:18px; text-align:center; font-size:12px; opacity:.85; }
        .ms-card-row-text { flex:1; min-width:0; }
        .ms-card-ann {
            margin-top:auto; padding-top:12px;
            border-top:none; padding-top:12px; background:#F9FAFB; margin:0 -18px -18px; padding-left:18px; padding-right:18px; min-height:56px;
        }
        .ms-card-ann-label {
            display:block; font-size:10px; font-weight:700;
            text-transform:uppercase; letter-spacing:.7px;
            color:#9CA3AF; margin-bottom:5px;
        }
        .ms-card-ann-text {
            font-size:12px; color:${MUTED}; line-height:1.45; margin:0;
            display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;
        }
        .ms-card-ann-text strong { color:#111827; font-weight:600; }
        .ms-card-ann-none { font-size:12px; color:#D1D5DB; margin:0; font-style:italic; }
        .ms-card-cta {
            display:block; margin-top:10px; font-size:12px; font-weight:700;
            color:${G}; text-align:right;
        }

        .ms-empty-state {
            text-align:center; padding:64px 32px;
            border:none; border-radius:16px;
            background:#F3F4F6; max-width:480px; margin:0 auto;
        }
        .ms-empty-icon { font-size:48px; margin-bottom:12px; }
        .ms-empty-state h2 { font-size:20px; font-weight:700; color:#111; margin:0 0 8px; }
        .ms-empty-state p { font-size:14px; color:${MUTED}; margin:0 0 20px; line-height:1.5; }
        @media (max-width:768px) {
            .ms-hero { padding:22px 20px; }
            .ms-grid { grid-template-columns:1fr; }
        }
        @media (min-width:1400px) {
            .ms-grid { grid-template-columns:repeat(auto-fill, minmax(320px, 1fr)); }
        }
    `;
}

function applyPageBg(container) {
    container.style.background = '#fff';
    const pageContent = container.closest('.page-content');
    if (pageContent) {
        pageContent.style.background = '#fff';
        pageContent.classList.add('ms-page-white');
    }
}

function groupAnnouncements(list) {
    const bySubject = {};
    for (const a of list) {
        const sid = a.subject_id;
        if (!sid) continue;
        if (!bySubject[sid]) bySubject[sid] = [];
        bySubject[sid].push(a);
    }
    return bySubject;
}

function truncate(s, n) {
    const t = (s || '').replace(/\s+/g, ' ').trim();
    return t.length > n ? t.slice(0, n) + '…' : t;
}

function esc(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
}
