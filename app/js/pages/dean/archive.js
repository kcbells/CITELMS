/**
 * Archive — past semesters, read-only.
 *
 * Shared by dean and program head (see app.js's program_head/archive alias).
 * ArchiveAPI.php decides what each of them can see; this page never filters
 * by role itself.
 *
 * Three levels: semesters -> subjects in one -> one subject's contents.
 *
 * Two tabs, because "archive" means two different things in this app and only
 * one of them used to be visible here:
 *   - Past semesters: captured automatically when the active semester changes.
 *   - Archived subjects: retired by hand from the curriculum. These used to
 *     vanish entirely - archiving a subject sent it nowhere at all.
 */
import { Api } from '../../api.js';
import { icon } from '../../utils/icons.js';
import { esc } from '../../utils/classroom-ui.js';
import { notify } from '../../utils/notify.js';

const G = '#00461B';

export async function render(container) {
    container.innerHTML = `<style>${css()}</style><div class="ar-loading"><div class="ar-spin"></div></div>`;

    const res = await Api.get('/ArchiveAPI.php?action=semesters', { ttl: 0 });
    if (!res.success) {
        container.innerHTML = `<style>${css()}</style>
            <div class="ar-empty">${esc(res.message || 'Could not load the archive.')}</div>`;
        return;
    }

    const semesters = res.semesters || [];

    // Fetched up front so the tab can carry a count -- an empty tab nobody
    // opens is how the archived subjects stayed invisible in the first place.
    const subjRes = await Api.get('/ArchiveAPI.php?action=archived-subjects', { ttl: 0 });
    const archivedSubjects = subjRes?.success ? (subjRes.subjects || []) : [];
    const canRestore = !!subjRes?.can_restore;

    container.innerHTML = `
        <style>${css()}</style>
        <div class="ar-page">
            <header class="ar-hero">
                <span class="ar-pill">${icon('archive', { size: 13, className: 'ui-icon-inline' })} Archive</span>
                <h1>Archive</h1>
                <p class="ar-hero-sub">Semesters that have closed, and subjects retired from the curriculum.
                    Semester contents are read-only; an archived subject can be put back.</p>
            </header>
            <div class="ar-tabs" role="tablist">
                <button type="button" class="ar-tab active" data-tab="semesters" role="tab">
                    Past Semesters <span class="ar-tab-n">${semesters.length}</span>
                </button>
                <button type="button" class="ar-tab" data-tab="subjects" role="tab">
                    Archived Subjects <span class="ar-tab-n">${archivedSubjects.length}</span>
                </button>
            </div>
            <div id="ar-body"></div>
        </div>`;

    const body = container.querySelector('#ar-body');
    const tabs = container.querySelectorAll('.ar-tab');
    const show = (which) => {
        tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === which));
        if (which === 'semesters') renderSemesters(body, semesters);
        else renderArchivedSubjects(container, body, archivedSubjects, canRestore);
    };
    tabs.forEach(t => t.addEventListener('click', () => show(t.dataset.tab)));
    show('semesters');
}

/**
 * Subjects pulled out of the curriculum by hand. Restoring is offered only
 * when the API said this account may edit the curriculum.
 */
function renderArchivedSubjects(container, body, subjects, canRestore) {
    if (!subjects.length) {
        body.innerHTML = `<div class="ar-empty">
            <p><strong>No archived subjects.</strong></p>
            <p>Archiving a subject from the curriculum retires it from all views and lists it here,
               where it can be restored.</p>
        </div>`;
        return;
    }

    body.innerHTML = `
        <div class="ar-sub-list">
            ${subjects.map(s => `
                <article class="ar-sub" data-subject="${s.subject_id}">
                    <div class="ar-sub-main">
                        <div class="ar-sub-top">
                            <span class="ar-sub-code">${esc(s.subject_code || '')}</span>
                            ${s.program_code ? `<span class="ar-sub-prog">${esc(s.program_code)}</span>` : ''}
                        </div>
                        <h3>${esc(s.subject_name || '')}</h3>
                        <div class="ar-sub-meta">
                            ${s.units != null ? `<span>${s.units} unit${s.units === 1 ? '' : 's'}</span>` : ''}
                            ${s.year_level ? `<span>Year ${s.year_level}</span>` : ''}
                            ${s.semester ? `<span>Sem ${s.semester}</span>` : ''}
                            <span>Archived ${fmtDate(s.archived_at)}</span>
                        </div>
                    </div>
                    ${canRestore ? `
                        <button type="button" class="ar-restore" data-restore="${s.subject_id}"
                                data-name="${esc(s.subject_name || '')}">Restore</button>` : ''}
                </article>`).join('')}
        </div>`;

    body.querySelectorAll('[data-restore]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const ok = await notify.confirm(
                `Restore "${btn.dataset.name}"?\n\nIt goes back into the curriculum as an active subject.`,
                { confirmText: 'Restore' }
            );
            if (!ok) return;
            btn.disabled = true;
            btn.textContent = 'Restoring\u2026';
            const res = await Api.post('/CurriculumAPI.php?action=restore', {
                subject_id: parseInt(btn.dataset.restore, 10),
            });
            if (res.success) {
                notify.success(res.message || 'Subject restored');
                render(container);   // counts on both tabs move, so reload the page
            } else {
                btn.disabled = false;
                btn.textContent = 'Restore';
                notify.error(res.message || 'Failed to restore subject');
            }
        });
    });
}

function renderSemesters(body, semesters) {
    if (!semesters.length) {
        body.innerHTML = `<div class="ar-empty">
            <p><strong>Nothing archived yet.</strong></p>
            <p>A semester is archived automatically when an admin switches which semester is active.
               Once that happens, its materials and quizzes will appear here.</p>
        </div>`;
        return;
    }

    body.innerHTML = `
        <div class="ar-grid">
            ${semesters.map(s => `
                <button type="button" class="ar-card" data-archive="${s.archive_id}">
                    <div class="ar-card-top">
                        <span class="ar-year">${esc(s.academic_year || '')}</span>
                        ${s.grades_locked ? `<span class="ar-lock">${icon('lock', { size: 11, className: 'ui-icon-inline' })} Grades locked</span>` : ''}
                    </div>
                    <h3>${esc(s.semester_name || 'Semester')}</h3>
                    <div class="ar-stats">
                        <span><strong>${s.subject_count}</strong> subject${s.subject_count === 1 ? '' : 's'}</span>
                        <span><strong>${s.docs_count}</strong> document${s.docs_count === 1 ? '' : 's'}</span>
                        <span><strong>${s.quizzes_count}</strong> quiz${s.quizzes_count === 1 ? '' : 'zes'}</span>
                    </div>
                    <p class="ar-archived">Archived ${fmtDate(s.archived_at)}</p>
                </button>`).join('')}
        </div>`;

    body.querySelectorAll('[data-archive]').forEach(btn => {
        btn.addEventListener('click', () => openSemester(body, semesters, parseInt(btn.dataset.archive, 10)));
    });
}

async function openSemester(body, semesters, archiveId) {
    const sem = semesters.find(s => s.archive_id === archiveId);
    body.innerHTML = `<div class="ar-loading"><div class="ar-spin"></div></div>`;

    const res = await Api.get(`/ArchiveAPI.php?action=subjects&archive_id=${archiveId}`, { ttl: 0 });
    if (!res.success) {
        body.innerHTML = `<div class="ar-empty">${esc(res.message || 'Could not load that semester.')}</div>`;
        return;
    }
    const subjects = res.subjects || [];

    body.innerHTML = `
        <button type="button" class="ar-back" id="ar-back">${icon('arrowLeft', { size: 13, className: 'ui-icon-inline' })} All semesters</button>
        <h2 class="ar-h2">${esc(sem?.semester_name || 'Semester')} <span>${esc(sem?.academic_year || '')}</span></h2>
        ${subjects.length ? `
        <div class="ar-table-wrap"><table class="ar-table">
            <thead><tr><th>Subject</th><th>Documents</th><th>Quizzes</th><th></th></tr></thead>
            <tbody>
                ${subjects.map(s => `
                    <tr>
                        <td><strong>${esc(s.subject_code)}</strong><span class="ar-subj-name">${esc(s.subject_name)}</span></td>
                        <td>${s.docs}</td>
                        <td>${s.quizzes}</td>
                        <td><button type="button" class="ar-view" data-subject="${s.subject_id}">View</button></td>
                    </tr>`).join('')}
            </tbody>
        </table></div>` : `<div class="ar-empty">No subjects from this semester are in your scope.</div>`}`;

    body.querySelector('#ar-back').addEventListener('click', () => renderSemesters(body, semesters));
    body.querySelectorAll('[data-subject]').forEach(btn => {
        btn.addEventListener('click', () =>
            openSubject(body, semesters, archiveId, parseInt(btn.dataset.subject, 10)));
    });
}

async function openSubject(body, semesters, archiveId, subjectId) {
    body.innerHTML = `<div class="ar-loading"><div class="ar-spin"></div></div>`;

    const res = await Api.get(`/ArchiveAPI.php?action=subject&archive_id=${archiveId}&subject_id=${subjectId}`, { ttl: 0 });
    if (!res.success) {
        body.innerHTML = `<div class="ar-empty">${esc(res.message || 'Could not load that subject.')}</div>`;
        return;
    }
    const d = res.data;
    const docs = d.documents || [], quizzes = d.quizzes || [], anns = d.announcements || [];

    body.innerHTML = `
        <button type="button" class="ar-back" id="ar-back">${icon('arrowLeft', { size: 13, className: 'ui-icon-inline' })} Back to subjects</button>
        <h2 class="ar-h2">${esc(d.subject_code)} <span>${esc(d.subject_name)}</span></h2>

        <section class="ar-sec">
            <h3>${icon('document', { size: 13, className: 'ui-icon-inline' })} Lesson Materials (${docs.length})</h3>
            ${docs.length ? `
            <div class="ar-table-wrap"><table class="ar-table">
                <thead><tr><th>Module</th><th>Type</th><th>File</th><th>Size</th></tr></thead>
                <tbody>${docs.map(x => `
                    <tr>
                        <td>Module ${x.module_number}</td>
                        <td>${x.doc_type === 'sas' ? 'Student Activity Sheet' : 'Teaching Guide'}</td>
                        <td>${esc(x.original_name || '—')}</td>
                        <td>${fmtSize(x.file_size)}</td>
                    </tr>`).join('')}</tbody>
            </table></div>` : `<p class="ar-none">No materials were captured for this subject.</p>`}
        </section>

        <section class="ar-sec">
            <h3>${icon('quiz', { size: 13, className: 'ui-icon-inline' })} Quizzes (${quizzes.length})</h3>
            ${quizzes.length ? `
            <div class="ar-table-wrap"><table class="ar-table">
                <thead><tr><th>Quiz</th><th>Module</th><th>Component</th><th>Questions</th><th>Points</th></tr></thead>
                <tbody>${quizzes.map(q => `
                    <tr>
                        <td>${esc(q.quiz_title || '—')}</td>
                        <td>${q.module_number ? `Module ${q.module_number}` : '—'}</td>
                        <td>${esc(componentLabel(q.gradebook_component))}</td>
                        <td>${q.question_count}</td>
                        <td>${q.total_points}</td>
                    </tr>`).join('')}</tbody>
            </table></div>` : `<p class="ar-none">No quizzes were captured for this subject.</p>`}
        </section>

        <section class="ar-sec">
            <h3>${icon('announce', { size: 13, className: 'ui-icon-inline' })} Announcements (${anns.length})</h3>
            ${anns.length ? `
            <div class="ar-anns">${anns.map(a => `
                <article class="ar-ann">
                    <div class="ar-ann-h">${esc(a.title || 'Announcement')}<span>${fmtDate(a.created_at)}</span></div>
                    <p>${esc(a.content || '')}</p>
                </article>`).join('')}</div>` : `<p class="ar-none">No announcements were captured for this subject.</p>`}
        </section>`;

    body.querySelector('#ar-back').addEventListener('click', () => openSemester(body, semesters, archiveId));
}

function componentLabel(c) {
    return {
        lets_practice: "Let's Practice",
        lets_practice_optional: "Let's Practice (Optional)",
        reflection: 'Reflection',
        wrap_up_quiz: 'Wrap Up Quiz',
    }[c] || '—';
}

function fmtDate(v) {
    if (!v) return '—';
    const d = new Date(String(v).replace(' ', 'T'));
    return isNaN(d) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtSize(bytes) {
    if (!bytes) return '—';
    return bytes < 1024 * 1024
        ? `${Math.round(bytes / 1024)} KB`
        : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function css() {
    return `
        .ar-page { max-width:1000px; }
        .ar-loading { display:flex; justify-content:center; padding:60px; }
        .ar-spin { width:34px; height:34px; border:3px solid #E5E7EB; border-top-color:${G};
            border-radius:50%; animation:arSpin .8s linear infinite; }
        @keyframes arSpin { to { transform:rotate(360deg); } }

        .ar-hero { background:#fff; border:2px solid #111; border-radius:16px; padding:22px 24px; margin-bottom:22px; }
        .ar-pill { display:inline-flex; align-items:center; gap:6px; background:${G}; color:#fff;
            font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:.5px;
            padding:5px 12px; border-radius:20px; }
        .ar-hero h1 { margin:12px 0 4px; font-size:26px; font-weight:900; color:#111; }
        .ar-hero-sub { margin:0; font-size:13px; color:#6B7280; line-height:1.6; max-width:640px; }

        .ar-tabs { display:flex; gap:8px; margin-bottom:18px; }
        .ar-tab { display:inline-flex; align-items:center; gap:7px; background:#fff; border:2px solid #111;
            border-radius:10px; padding:8px 15px; font-family:inherit; font-size:13px; font-weight:800;
            color:#111; cursor:pointer; transition:background .15s, color .15s; }
        .ar-tab:hover { background:#F3F4F6; }
        .ar-tab.active { background:${G}; border-color:${G}; color:#fff; }
        .ar-tab-n { background:rgba(0,0,0,.12); border-radius:20px; padding:1px 8px; font-size:11px; }
        .ar-tab.active .ar-tab-n { background:rgba(255,255,255,.25); }

        .ar-sub-list { display:flex; flex-direction:column; gap:10px; }
        .ar-sub { display:flex; align-items:center; gap:14px; background:#fff; border:2px solid #111;
            border-radius:14px; padding:14px 18px; }
        .ar-sub-main { min-width:0; flex:1; }
        .ar-sub-top { display:flex; align-items:center; gap:8px; }
        .ar-sub-code { font-size:11px; font-weight:800; color:${G}; letter-spacing:.4px; }
        .ar-sub-prog { font-size:10px; font-weight:700; background:#E8F5EC; color:${G};
            padding:2px 8px; border-radius:20px; }
        .ar-sub h3 { margin:5px 0 6px; font-size:16px; font-weight:800; color:#111; }
        .ar-sub-meta { display:flex; flex-wrap:wrap; gap:12px; font-size:12px; color:#6B7280; }
        .ar-restore { flex-shrink:0; background:${G}; color:#fff; border:none; border-radius:9px;
            padding:9px 18px; font-family:inherit; font-size:12.5px; font-weight:800; cursor:pointer; }
        .ar-restore:hover { background:#006428; }
        .ar-restore:disabled { opacity:.55; cursor:not-allowed; }
        @media(max-width:560px) {
            .ar-sub { flex-direction:column; align-items:stretch; }
            .ar-restore { width:100%; }
        }

        .ar-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:14px; }
        .ar-card { text-align:left; background:#fff; border:2px solid #111; border-radius:14px;
            padding:16px 18px; cursor:pointer; font-family:inherit; transition:background .15s; }
        .ar-card:hover { background:#F3F4F6; }
        .ar-card-top { display:flex; justify-content:space-between; align-items:center; gap:8px; }
        .ar-year { font-size:11px; font-weight:800; color:#6B7280; text-transform:uppercase; letter-spacing:.4px; }
        .ar-lock { display:inline-flex; align-items:center; gap:4px; background:${G}; color:#fff;
            font-size:10px; font-weight:700; padding:3px 8px; border-radius:20px; }
        .ar-card h3 { margin:8px 0 10px; font-size:17px; font-weight:800; color:#111; }
        .ar-stats { display:flex; flex-wrap:wrap; gap:10px; font-size:12px; color:#374151; }
        .ar-stats strong { color:${G}; }
        .ar-archived { margin:10px 0 0; font-size:11px; color:#9CA3AF; }

        .ar-back { background:none; border:none; color:${G}; font-weight:700; font-size:13px;
            cursor:pointer; padding:0; margin-bottom:14px; display:inline-flex; align-items:center; gap:6px; font-family:inherit; }
        .ar-h2 { font-size:20px; font-weight:900; color:#111; margin:0 0 18px; }
        .ar-h2 span { font-size:14px; font-weight:600; color:#6B7280; margin-left:8px; }

        .ar-sec { margin-bottom:26px; }
        .ar-sec h3 { display:flex; align-items:center; gap:7px; font-size:12px; font-weight:800; color:${G};
            text-transform:uppercase; letter-spacing:.5px; margin:0 0 10px; padding-bottom:7px; border-bottom:1.5px solid ${G}; }
        .ar-none { font-size:13px; color:#9CA3AF; margin:0; }

        .ar-table { width:100%; border-collapse:collapse; background:#fff;
            border:2px solid #111; border-radius:12px; overflow:hidden; font-size:13px; }
        .ar-table th { background:${G}; color:#fff; text-align:left; padding:10px 14px;
            font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.4px; }
        .ar-table td { padding:10px 14px; border-bottom:1px solid #F3F4F6; color:#374151; vertical-align:middle; }
        .ar-table tbody tr:last-child td { border-bottom:none; }
        .ar-table tbody tr:hover td { background:#F9FAFB; }
        .ar-subj-name { display:block; font-size:11.5px; color:#6B7280; font-weight:400; }
        .ar-view { background:#fff; border:1.5px solid ${G}; color:${G}; border-radius:7px;
            padding:5px 14px; font-size:12px; font-weight:700; cursor:pointer; font-family:inherit; }
        .ar-view:hover { background:${G}; color:#fff; }

        .ar-anns { display:flex; flex-direction:column; gap:10px; }
        .ar-ann { background:#fff; border:1.5px solid #E5E7EB; border-radius:10px; padding:12px 14px; }
        .ar-ann-h { display:flex; justify-content:space-between; gap:10px; font-size:13.5px;
            font-weight:800; color:#111; margin-bottom:5px; }
        .ar-ann-h span { font-size:11px; font-weight:600; color:#9CA3AF; flex-shrink:0; }
        .ar-ann p { margin:0; font-size:12.5px; color:#374151; line-height:1.6; white-space:pre-wrap; }

        .ar-empty { text-align:center; padding:48px 24px; color:#6B7280; font-size:13.5px; line-height:1.7;
            background:#fff; border:2px dashed #111; border-radius:14px; }

        /* ── Phone ──────────────────────────────────────────────────────
           Most students and a fair number of staff open this on a phone.
           Boxed cards in a grid read as heavy clutter at that width, so the
           cards flatten into a plain divided list, and the tables scroll
           sideways instead of squashing their columns. */
        @media (max-width: 640px) {
            .ar-hero { padding:16px; border-radius:12px; margin-bottom:16px; }
            .ar-hero h1 { font-size:20px; }
            .ar-hero-sub { font-size:12.5px; }

            .ar-grid { display:block; border:1.5px solid #111; border-radius:12px; overflow:hidden; background:#fff; }
            .ar-card { border:none; border-bottom:1px solid #E5E7EB; border-radius:0; padding:14px 16px; width:100%; }
            .ar-card:last-child { border-bottom:none; }
            .ar-card h3 { font-size:15px; margin:6px 0 8px; }
            .ar-stats { gap:8px; font-size:11.5px; }

            .ar-table-wrap { overflow-x:auto; -webkit-overflow-scrolling:touch; }
            .ar-table { font-size:12.5px; min-width:420px; }
            .ar-table th, .ar-table td { padding:8px 10px; }

            .ar-h2 { font-size:17px; }
            .ar-h2 span { display:block; margin:2px 0 0; font-size:12.5px; }
            .ar-sec { margin-bottom:20px; }
        }
    `;
}
