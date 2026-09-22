/**
 * Instructor Gradebook — class record navigation
 * Subjects → Sections → Class record table (flat items, original design)
 */
import { Api } from '../../api.js';
import { icon, iconLg } from '../../utils/icons.js';
import { subjectColor } from '../../utils/subject-colors.js';
import { curriculumTableCss, esc, rotateOverlayHtml, rotateOverlayCss } from '../../utils/classroom-ui.js';
import {
    buildPeriodGroups, isItemMissing, gradingPeriodTableCss, GRADING_PERIODS,
} from '../../utils/gradebook-periods.js';
import { notify } from '../../utils/notify.js';
import { mountGlobalClassRecord } from './global-gradebook.js';
import { watchLive, versionFetcher } from '../../utils/live-refresh.js';

const inl    = { size: 14, className: 'ui-icon-inline' };
// Same palette as instructor/global-gradebook.js — the raw-score class
// record uses the exact same colors/severity tiers, not a separate scheme.
const G      = '#00461B';
const G2     = '#006428';
const GL     = '#E8F5EC';
const BORDER = '#E5E7EB';
const AMBER_BG = '#FEF3C7';
const AMBER_FG = '#92400E';
const RED_BG   = '#FEE2E2';
const RED_FG   = '#7F1D1D';

let classesData = [];

export async function render(container) {
    const hashParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
    await renderGradebook(container, {
        subjectId: hashParams.get('subject_id') || '',
        sectionId: hashParams.get('section_id') || '',
        embedded: false,
    });
}

export async function mountInstructorGradebook(host, { subjectId, sectionId } = {}) {
    await renderGradebook(host, {
        subjectId: subjectId || '',
        sectionId: sectionId || '',
        embedded: true,
        lockSubject: !!subjectId,
    });
}

/** Stops the previous live watcher; one page, one watcher. */
let _stopLive = null;

async function renderGradebook(container, opts = {}) {
    // Marks land here from several directions at once - a student finishing a
    // quiz, a co-teacher saving an override, the same person on another
    // device. Poll a cheap fingerprint (GradebookAPI action=version) and
    // re-render only when something really changed, so the table updates
    // itself instead of quietly going stale until someone reloads.
    _stopLive?.();
    _stopLive = null;
    if (opts?.subjectId) {
        _stopLive = watchLive({
            container,
            version: versionFetcher(Api, `/GradebookAPI.php?action=version&subject_id=${opts.subjectId}`),
            render:  () => renderGradebook(container, opts),
        });
    }

    container.innerHTML = `<div class="gb-loading"><div class="gb-spin"></div></div><style>${pageCss()}</style>`;

    // ttl:0 — this drives whether raw-score or Global Gradebook renders
    // (subject.grading_type). A dean can flip that mid-session from Subject
    // Offered; a cached instructor-classes response here would keep showing
    // the OLD table shape for up to 45s (Api.get's default cache), which
    // reads as the wrong grade table, not just stale counts — always fetch
    // fresh so a just-changed grading type takes effect the next time this
    // page loads, not on some delay.
    const res = await Api.get('/SectionsAPI.php?action=instructor-classes', { ttl: 0 });
    classesData = res.success ? (res.data || []) : [];

    bindRowSelect(container);

    const { subjectId = '', sectionId = '' } = opts;
    if (sectionId && subjectId)  await renderClassRecord(container, opts);
    else if (subjectId)          renderSectionsView(container, opts);
    else                         renderSubjectsView(container, opts);
}

/**
 * Clicking a student's row (or focusing anything inside it) selects and
 * highlights it (see .gb-row-selected in classroom-ui.js's shared
 * curriculumTableCss — same behavior as Global Gradebook). Delegated once on
 * the outer container instead of re-bound per table, guarded so re-renders
 * (this function runs again on every nav) never double-bind the same
 * listener.
 *
 * Always SETS the highlight rather than toggling it — see the matching
 * comment in global-gradebook.js's bindRowSelect() for why a toggle was the
 * actual bug (a second click on an already-selected row, e.g. to start
 * editing something in it, flipped the highlight back off).
 */
function bindRowSelect(container) {
    if (container.dataset.gbRowSelectBound) return;
    container.dataset.gbRowSelectBound = '1';
    const select = e => {
        const row = e.target.closest('tr[data-stu]');
        if (!row) return;
        const table = row.closest('table');
        table?.querySelectorAll('tr.gb-row-selected').forEach(r => { if (r !== row) r.classList.remove('gb-row-selected'); });
        row.classList.add('gb-row-selected');
    };
    container.addEventListener('click', select);
    container.addEventListener('focusin', select);
}

function navigate(container, opts, { subjectId = '', sectionId = '' } = {}) {
    const next = { ...opts, subjectId, sectionId };
    if (!opts.embedded) {
        const p = new URLSearchParams();
        if (subjectId) p.set('subject_id', subjectId);
        if (sectionId) p.set('section_id', sectionId);
        const hash = p.toString() ? `#instructor/gradebook?${p}` : '#instructor/gradebook';
        if (window.location.hash !== hash) history.replaceState(null, '', hash);
    }
    return renderGradebook(container, next);
}

/* ─── Level 1: Subjects ──────────────────────────────────────── */

function renderSubjectsView(container, opts) {
    const subjects = classesData;
    container.innerHTML = `
        <style>${pageCss()}${curriculumTableCss()}</style>
        <div class="gb-page ${opts.embedded ? 'gb-embedded' : ''}">
            ${opts.embedded ? '' : renderBanner('Class Record', 'Select a subject to view section grade records')}
            <div class="gb-toolbar">
                <div class="gb-search-wrap">
                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                    <input type="search" id="gb-search" class="gb-search" placeholder="Search subjects…" autocomplete="off">
                </div>
                <span class="gb-count">${subjects.length} subject${subjects.length !== 1 ? 's' : ''}</span>
            </div>
            ${subjects.length === 0 ? emptyBox('No subjects assigned yet.') : `
                <div class="gb-subj-grid" id="gb-subj-grid">
                    ${subjects.map(s => subjectCard(s)).join('')}
                </div>
                <p class="gb-no-results" id="gb-no-results" hidden>No subjects match your search.</p>
            `}
        </div>`;

    container.querySelectorAll('[data-gb-subject]').forEach(el =>
        el.addEventListener('click', e => { e.preventDefault(); navigate(container, opts, { subjectId: el.dataset.gbSubject }); })
    );
    const search = container.querySelector('#gb-search');
    const cards  = [...container.querySelectorAll('.gb-subj-card')];
    search?.addEventListener('input', () => {
        const q = search.value.toLowerCase().trim();
        let n = 0;
        cards.forEach(c => { const show = !q || c.dataset.search.includes(q); c.hidden = !show; if (show) n++; });
        container.querySelector('#gb-no-results').hidden = n > 0;
        container.querySelector('#gb-subj-grid').style.display = n === 0 ? 'none' : '';
    });
}

function subjectCard(s) {
    const color   = subjectColor(s.subject_id);
    const sections = s.sections || [];
    const total   = sections.reduce((n, x) => n + Number(x.student_count || 0), 0);
    const search  = [s.subject_code, s.subject_name, s.program_code].filter(Boolean).join(' ').toLowerCase();
    return `
        <a href="#" class="gb-subj-card" data-gb-subject="${s.subject_id}" data-search="${esc(search)}">
            <div class="gb-subj-top" style="background:${color}">
                <span class="gb-subj-card-code">${esc(s.subject_code)}</span>
                <h3>${esc(s.subject_name)}</h3>
            </div>
            <div class="gb-subj-body">
                <div class="gb-stat-row">${icon('school', inl)} <strong>${sections.length}</strong> section${sections.length !== 1 ? 's' : ''}</div>
                <div class="gb-stat-row">${icon('users', inl)} <strong>${total}</strong> student${total !== 1 ? 's' : ''}</div>
                <span class="gb-subj-link">View class records →</span>
            </div>
        </a>`;
}

/* ─── Level 2: Sections ─────────────────────────────────────── */

function renderSectionsView(container, opts) {
    const subject = classesData.find(s => String(s.subject_id) === String(opts.subjectId));
    if (!subject) {
        container.innerHTML = `<style>${pageCss()}</style><div class="gb-page">${emptyBox('Subject not found.', true)}</div>`;
        container.querySelector('#gb-empty-back')?.addEventListener('click', () => navigate(container, opts));
        return;
    }
    const sections   = subject.sections || [];
    const color      = subjectColor(subject.subject_id);
    const backAction = opts.lockSubject && opts.embedded ? null : () => navigate(container, opts, { subjectId: '' });

    container.innerHTML = `
        <style>${pageCss()}${curriculumTableCss()}</style>
        <div class="gb-page ${opts.embedded ? 'gb-embedded' : ''}">
            ${backAction ? `<button type="button" class="gb-back" id="gb-back-subjects">
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                All Subjects</button>` : ''}
            <header class="gb-subj-hero">
                <div class="gb-subj-hero-band" style="background:${color}">
                    <span class="gb-subj-code">${esc(subject.subject_code)}</span>
                    <h1>${esc(subject.subject_name)}</h1>
                    ${subject.program_code ? `<span class="gb-subj-prog">${esc(subject.program_code)}</span>` : ''}
                </div>
                <div class="gb-subj-hero-meta">
                    <p>${sections.length} section${sections.length !== 1 ? 's' : ''} · Select a section to open its class record</p>
                    <span class="gb-role-pill">${icon('gradebook', inl)} Class Record</span>
                </div>
            </header>
            ${sections.length === 0
                ? emptyBox('No sections for this subject yet.')
                : `<div class="gb-sec-grid">${sections.map(sec => sectionCard(subject, sec)).join('')}</div>`}
        </div>`;

    container.querySelector('#gb-back-subjects')?.addEventListener('click', backAction);
    container.querySelectorAll('[data-gb-section]').forEach(el =>
        el.addEventListener('click', e => {
            e.preventDefault();
            navigate(container, opts, { subjectId: subject.subject_id, sectionId: el.dataset.gbSection });
        })
    );
}

function sectionCard(subject, sec) {
    const pct = sec.max_students > 0
        ? Math.round((Number(sec.student_count) / Number(sec.max_students)) * 100) : 0;
    return `
        <article class="gb-sec-card">
            <a href="#" class="gb-sec-card-link" data-gb-section="${sec.section_id}">
                <div class="gb-sec-head">
                    <div>
                        <h3 class="gb-sec-name">${esc(sec.section_name)}</h3>
                        <span class="gb-sec-hint">Open class record</span>
                    </div>
                    <span class="gb-sec-badge">${esc(sec.status || 'active')}</span>
                </div>
                <div class="gb-sec-meta">
                    ${sec.schedule ? `<div>${icon('clock', inl)} ${esc(sec.schedule)}</div>` : ''}
                    ${sec.room     ? `<div>${icon('pin',   inl)} ${esc(sec.room)}</div>`     : ''}
                    <div>${icon('users', inl)} ${Number(sec.student_count || 0)} enrolled</div>
                </div>
                <div class="gb-sec-bar"><div class="gb-sec-fill" style="width:${pct}%"></div></div>
                <span class="gb-subj-link">View grades table →</span>
            </a>
        </article>`;
}

/* ─── Level 3: Class record table ───────────────────────────── */

async function renderClassRecord(container, opts) {
    const subject = classesData.find(s => String(s.subject_id) === String(opts.subjectId));
    const section = subject?.sections?.find(sec => String(sec.section_id) === String(opts.sectionId));
    if (!subject || !section) {
        container.innerHTML = `<style>${pageCss()}</style><div class="gb-page">${emptyBox('Section not found.', true)}</div>`;
        container.querySelector('#gb-empty-back')?.addEventListener('click', () =>
            navigate(container, opts, { subjectId: opts.subjectId, sectionId: '' })
        );
        return;
    }

    container.innerHTML = `
        <style>${pageCss()}${curriculumTableCss()}${rotateOverlayCss()}</style>
        ${rotateOverlayHtml()}
        <div class="gb-page ${opts.embedded ? 'gb-embedded' : ''}">
            <button type="button" class="gb-back" id="gb-back-sections">
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                ${opts.lockSubject && opts.embedded ? 'All Sections' : esc(subject.subject_code)}
            </button>
            <div id="gb-record-host">
                <div class="gb-loading inline"><div class="gb-spin"></div><p>Loading class record…</p></div>
            </div>
        </div>`;

    container.querySelector('#gb-back-sections')?.addEventListener('click', () =>
        navigate(container, opts, { subjectId: subject.subject_id, sectionId: '' })
    );

    const host = container.querySelector('#gb-record-host');

    // Subjects the dean has marked "Global" use the 14-module Effortful
    // Learning / Mastery class record instead of the raw quiz-score table —
    // same Subjects → Sections → Class Record flow, different table.
    //
    // Read grading_type off THIS SECTION, not subject.grading_type — a
    // subject can have several subject_offered rows (e.g. sections opened
    // under separate offerings), each with its own independently-set
    // grading_type. subject.grading_type is SectionsAPI's own "whichever
    // open offering it saw last" pick across ALL of them, which doesn't
    // necessarily match the specific offering backing the section actually
    // being viewed — the dean switching one offering's grading mode could
    // then appear to do nothing for a section really backed by another.
    // section.grading_type is scoped to this section's own subject_offered
    // row, so it's always correct for what's on screen; the subject-level
    // value is only a fallback for a shape this section object doesn't have it in.
    const effectiveGradingType = section.grading_type ?? subject.grading_type;
    if (effectiveGradingType === 'global') {
        await mountGlobalClassRecord(host, subject, section);
        return;
    }

    try {
        const record = await loadClassRecord(subject, section);
        host.innerHTML = renderClassRecordTable(subject, section, record);
        host.querySelector('#gb-export-csv')?.addEventListener('click', () =>
            exportClassRecordCsv(subject, section, record)
        );
        wireScoreOverrideEditing(host, () => renderClassRecord(container, opts));
    } catch (err) {
        console.error('Class record load error:', err);
        host.innerHTML = emptyBox('Could not load class record. Please try again.');
    }
}

/**
 * Click-to-edit for quiz score cells — same directly-editable-cell spirit as
 * the Global Gradebook's dropdowns, but a free-entry number here since a raw
 * quiz score isn't a fixed 0-3/percentage domain. Saves via
 * GradebookAPI.php's score-override actions, which layer on top of the
 * computed best-attempt score without touching attempt data.
 */
function wireScoreOverrideEditing(host, onSaved) {
    host.querySelectorAll('.gb-editable-td').forEach(td => {
        td.addEventListener('click', () => {
            if (td.querySelector('input')) return; // already editing
            const target = td.querySelector('.gb-edit-target');
            const current = td.dataset.earned || '';
            const total = td.dataset.total || '';
            td.innerHTML = `<input type="number" class="gb-score-input" min="0" ${total ? `max="${total}"` : ''} step="0.5" value="${esc(current)}" placeholder="${total ? `/ ${total}` : ''}">`;
            const input = td.querySelector('input');
            input.focus();
            input.select();

            let cancelled = false;
            const commit = async () => {
                if (cancelled) return;
                const raw = input.value.trim();
                const quizId = parseInt(td.dataset.quizId, 10);
                const studentId = parseInt(td.dataset.studentId, 10);
                const res = await Api.post('/GradebookAPI.php?action=save-score-override', {
                    quiz_id: quizId,
                    user_student_id: studentId,
                    earned_points: raw === '' ? null : parseFloat(raw),
                });
                if (res.success) {
                    onSaved();
                } else {
                    notify.error(res.message || 'Could not save score.');
                    if (target) td.replaceChildren(target);
                }
            };

            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
                if (e.key === 'Escape') { e.preventDefault(); cancelled = true; if (target) td.replaceChildren(target); }
            });
            input.addEventListener('blur', commit, { once: true });
            input.addEventListener('click', (e) => e.stopPropagation());
        });
    });
}

async function loadClassRecord(subject, section) {
    const offeredId = String(section.subject_offered_id || subject.subject_offered_id || '');

    const [quizRes, studRes, lessonRes, progressRes] = await Promise.all([
        Api.get(`/QuizzesAPI.php?action=instructor-list&subject_id=${subject.subject_id}`),
        Api.get(`/SectionsAPI.php?action=students&section_id=${section.section_id}`),
        Api.get(`/LessonsAPI.php?action=instructor-lessons&subject_id=${subject.subject_id}`),
        Api.get(`/GradebookAPI.php?action=lesson-progress&subject_id=${subject.subject_id}&section_id=${section.section_id}`),
    ]);

    let quizzes = (quizRes.success ? quizRes.data : [])
        .filter(q => quizAppliesToSection(q, section.section_id) && q.status === 'published')
        .sort((a, b) => String(a.quiz_title).localeCompare(String(b.quiz_title)));

    const lessons        = (lessonRes.success ? lessonRes.data : []).filter(l => quizAppliesToSection(l, section.section_id));
    const lessonProgress = progressRes.success ? (progressRes.data?.progress || {}) : {};
    const periodGroups   = buildPeriodGroups(quizzes, lessons, section.section_id);

    const studRows = studRes.success ? studRes.data : [];
    const enrolled = offeredId
        ? studRows.filter(r => String(r.subject_offered_id) === offeredId)
        : studRows.filter(r => String(r.subject_id) === String(subject.subject_id));

    const students = [];
    const seen = new Set();
    for (const r of enrolled) {
        const uid = r.user_student_id;
        if (seen.has(uid)) continue;
        seen.add(uid);
        students.push({
            user_student_id: uid,
            student_id:  r.student_id  || '',
            first_name:  r.first_name  || '',
            last_name:   r.last_name   || '',
            name: `${r.last_name || ''}, ${r.first_name || ''}`.replace(/^,\s*|,\s*$/g, '').trim() || 'Student',
        });
    }
    students.sort((a, b) => {
        const ln = (a.last_name || '').localeCompare(b.last_name || '');
        return ln !== 0 ? ln : (a.first_name || '').localeCompare(b.first_name || '');
    });

    const scoreResults = await Promise.all(
        quizzes.map(q =>
            Api.get(`/QuizAttemptsAPI.php?action=quiz-scores&quiz_id=${q.quiz_id}`)
                .then(r => ({ quiz: q, scores: r.success ? (r.data || []) : [] }))
                .catch(() => ({ quiz: q, scores: [] }))
        )
    );

    const matrix = new Map();
    students.forEach(st => matrix.set(
        st.student_id || `u${st.user_student_id}`,
        { ...st, quizScores: {}, lessonStatus: {} }
    ));

    scoreResults.forEach(({ quiz, scores }) => {
        const byStudent = new Map();
        scores.forEach(sc => {
            const key = sc.student_id || `${sc.first_name}_${sc.last_name}`;
            if (!byStudent.has(key)) byStudent.set(key, []);
            byStudent.get(key).push(sc);
        });
        for (const [, st] of matrix) {
            const attempts = st.student_id
                ? (byStudent.get(st.student_id) || [])
                : [...byStudent.values()].flat().filter(a => a.first_name === st.first_name && a.last_name === st.last_name);
            if (!attempts.length) { st.quizScores[quiz.quiz_id] = null; continue; }
            const best   = attempts.reduce((a, b) => parseFloat(a.earned_points || 0) >= parseFloat(b.earned_points || 0) ? a : b);
            const earned = parseFloat(best.earned_points || 0);
            const total  = parseFloat(best.total_points  || 0);
            const passed = attempts.some(a => a.passed == 1);
            st.quizScores[quiz.quiz_id] = { earned, total, passed };
        }
    });

    for (const [, st] of matrix) st.lessonStatus = lessonProgress[st.user_student_id] || {};

    // Manual score overrides — same spirit as the Global Gradebook's directly
    // editable cells, applied on top of the computed best-attempt score
    // without touching the underlying attempt data.
    if (quizzes.length) {
        const quizIds = quizzes.map(q => q.quiz_id).join(',');
        const ovRes = await Api.get(`/GradebookAPI.php?action=get-score-overrides&quiz_ids=${quizIds}`, { ttl: 0 }).catch(() => null);
        const overrides = ovRes?.success ? (ovRes.data || {}) : {};
        for (const quiz of quizzes) {
            const byStudent = overrides[quiz.quiz_id];
            if (!byStudent) continue;
            for (const [, st] of matrix) {
                if (!(st.user_student_id in byStudent)) continue;
                const total = st.quizScores[quiz.quiz_id]?.total || parseFloat(quiz.total_points) || 0;
                const earned = byStudent[st.user_student_id];
                st.quizScores[quiz.quiz_id] = { earned, total, passed: total > 0 && earned / total >= 0.6, overridden: true };
            }
        }
    }

    return { quizzes, lessons, periodGroups, students: [...matrix.values()], lessonProgress };
}

/* ─── Table rendering ───────────────────────────────────────── */

/**
 * Two header rows. The top one names the grading period (P1 Midterms,
 * P2 Prefinals, P3 Finals) spanning that period's items; the second names
 * each activity or quiz. A period with nothing in it yet still gets a column,
 * so the three periods are always visible in the same place.
 */
function renderTableHeaders(periodGroups) {
    let periodRow = `<th rowspan="2">#</th><th rowspan="2" class="th-left">Student ID</th><th rowspan="2" class="gc-th-info th-left">Name</th>`;
    let itemRow = '';

    for (const p of GRADING_PERIODS) {
        const items = periodGroups.groups[p.code] || [];
        periodRow += `<th colspan="${Math.max(items.length, 1)}" class="gb-period-th gb-period-th--${p.code.toLowerCase()}">
            ${p.label}<span class="gb-period-sub">${esc(p.title)}</span>
        </th>`;

        if (!items.length) {
            itemRow += `<th class="gb-item-th gb-item-th--empty">No items yet</th>`;
            continue;
        }
        for (const item of items) {
            const typeLabel = item.kind === 'quiz' ? 'Quiz' : 'Activity';
            const short     = item.title.length > 16 ? `${item.title.slice(0, 14)}…` : item.title;
            const pts       = item.kind === 'quiz' && item.totalPoints ? ` · ${item.totalPoints}pts` : '';
            itemRow += `<th class="gb-item-th" title="${esc(item.title)} (${typeLabel})${pts}">
                <span class="gb-item-type ${item.kind === 'quiz' ? 'quiz' : 'activity'}">${typeLabel}</span>
                <span class="gb-item-name">${esc(short)}</span>
            </th>`;
        }
    }

    return { periodRow, itemRow };
}

/**
 * What one cell says. No adding up across items: each activity or quiz just
 * shows its own state.
 *   quiz  → the score (e.g. 7/10), with "At risk" under it when below passing
 *   quiz  → "Missing" once the due date passes with no attempt
 *   activity → "Done", or "Missing" once past due
 *   anything not due yet and not done → "—"
 */
function cellStatus(st, item) {
    if (item.kind === 'quiz') {
        const c = st.quizScores[item.id];
        if (c) {
            const score = c.total ? `${c.earned}/${c.total}` : String(c.earned);
            return { kind: 'score', score, atRisk: c.passed === false, overridden: !!c.overridden };
        }
        return isItemMissing(item) ? { kind: 'missing' } : { kind: 'pending' };
    }
    if (st.lessonStatus?.[item.id] === 'completed') return { kind: 'done' };
    return isItemMissing(item) ? { kind: 'missing' } : { kind: 'pending' };
}

function renderStudentItemCell(st, item) {
    const s = cellStatus(st, item);

    if (item.kind === 'quiz') {
        const cell = st.quizScores[item.id];
        const editAttrs = `data-edit-cell data-quiz-id="${item.id}" data-student-id="${st.user_student_id}" data-total="${item.totalPoints || cell?.total || 0}"`;
        // Everything shown sits inside the one .gb-edit-target, so cancelling an
        // edit (Escape) puts the whole cell back, status tag included.
        const inner = s.kind === 'score'
            ? `<span class="gb-cell-score${s.overridden ? ' gb-overridden' : ''}">${s.score}</span>${s.atRisk ? '<span class="gb-cell-risk">At risk</span>' : ''}`
            : s.kind === 'missing'
                ? '<span class="gc-cur-badge-missing">Missing</span>'
                : '<span class="gc-cur-badge-none">—</span>';
        return `<td class="td-num gb-editable-td${s.atRisk ? ' gb-td-risk' : ''}" ${editAttrs} data-earned="${cell ? cell.earned : ''}">
            <span class="gb-edit-target gb-cell">${inner}</span>
        </td>`;
    }

    if (s.kind === 'done')    return `<td class="td-num"><span class="gc-cur-badge-pass">Done</span></td>`;
    if (s.kind === 'missing') return `<td class="td-num"><span class="gc-cur-badge-missing">Missing</span></td>`;
    return `<td class="td-num"><span class="gc-cur-badge-none">—</span></td>`;
}

function renderClassRecordTable(subject, section, { periodGroups, students }) {
    const meta = [
        esc(subject.subject_code), esc(section.section_name),
        section.schedule ? esc(section.schedule) : '',
        section.room     ? esc(section.room)     : '',
    ].filter(Boolean).join(' · ');

    const allItems   = periodGroups.flat;
    const totalItems = allItems.length;

    const headHtml = `
        <div class="gb-record-head">
            <span class="gb-role-pill">${icon('gradebook', inl)} Instructor view</span>
            <h2>Class Record</h2>
            <p>${meta}</p>
            <p class="gb-period-legend">Grouped by grading period — P1 Midterms · P2 Prefinals · P3 Finals. Each cell shows its own result: the score, <strong>At risk</strong> when below passing, <strong>Missing</strong> once the due date passes, or <strong>Done</strong>. Scores are not added together.</p>
            <div class="gb-record-stats">
                <span><strong>${students.length}</strong> student${students.length !== 1 ? 's' : ''}</span>
                <span><strong>${totalItems}</strong> item${totalItems !== 1 ? 's' : ''}</span>
                <button type="button" class="gb-export-btn" id="gb-export-csv">${icon('download', inl)} Export CSV</button>
            </div>
        </div>`;

    // Previously this whole view got replaced by a plain "no students or
    // assessments" message whenever a section had zero of both — but the
    // class record itself (header, stats, and an empty-but-structured
    // table) should stay visible regardless, not disappear just because no
    // one has enrolled or no quiz/lesson has been published yet.
    // renderTableHeaders() and the empty `students` map below already
    // degrade gracefully to a placeholder "—" column / zero rows.

    const { periodRow, itemRow } = renderTableHeaders(periodGroups);

    // Every column in header order, with a placeholder where a period is empty,
    // so body and footer line up with the two header rows.
    const columns = GRADING_PERIODS.flatMap(p => {
        const items = periodGroups.groups[p.code] || [];
        return items.length ? items : [null];
    });

    const rows = students.map((st, i) => {
        const itemCells = columns.map(item => item
            ? renderStudentItemCell(st, item)
            : '<td class="td-num gb-td-empty"></td>').join('');
        return `
            <tr data-stu="${st.user_student_id}">
                <td class="td-rank">${i + 1}</td>
                <td class="td-id">${esc(st.student_id || '—')}</td>
                <td class="td-name">${esc(st.name)}</td>
                ${itemCells}
            </tr>`;
    }).join('');

    const footerCells = columns.map(item => {
        if (!item) return '<td class="td-num gb-td-empty"></td>';
        if (item.kind === 'quiz') {
            const vals = students.map(st => st.quizScores[item.id]?.earned).filter(v => v != null);
            return `<td class="td-num" style="font-weight:700;background:#f7f7f7;">${vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : '—'}</td>`;
        }
        const done = students.filter(st => st.lessonStatus?.[item.id] === 'completed').length;
        return `<td class="td-num" style="font-weight:700;background:#f7f7f7;">${done ? `${done}/${students.length}` : '—'}</td>`;
    }).join('');

    return `
        ${headHtml}
        <div class="gc-cur-wrap">
            <div class="gc-cur-label">CLASS RECORD — ${esc(subject.subject_code)} / ${esc(section.section_name)}</div>
            <div class="gb-table-scroll">
                <table class="gc-cur-table gb-record-table gb-period-table">
                    <thead>
                        <tr>${periodRow}</tr>
                        <tr>${itemRow}</tr>
                    </thead>
                    <tbody>${rows || `<tr><td colspan="${3 + columns.length}" class="gc-cur-empty">No students enrolled in this section yet.</td></tr>`}</tbody>
                    ${allItems.length ? `
                    <tfoot>
                        <tr class="gb-record-avg-row">
                            <td colspan="3" style="position:static;width:auto;font-size:12px;color:#262626;font-weight:700;text-align:right;padding-right:12px;">Class avg / completion</td>
                            ${footerCells}
                            <td colspan="2"></td>
                        </tr>
                    </tfoot>` : ''}
                </table>
            </div>
        </div>`;
}

function quizAppliesToSection(quiz, sectionId) {
    if (quiz.all_sections == 1 || quiz.all_sections === true) return true;
    const ids = (quiz.section_ids || []).map(Number);
    if (!ids.length) return true;
    return ids.includes(Number(sectionId));
}

function exportClassRecordCsv(subject, section, { periodGroups, students }) {
    const headers = ['#', 'Student ID', 'Name'];
    const ordered = GRADING_PERIODS.flatMap(p => (periodGroups.groups[p.code] || []).map(item => ({ item, period: p })));
    for (const { item, period } of ordered) {
        const prefix = item.kind === 'quiz' ? 'Quiz' : 'Activity';
        headers.push(`${period.label} · ${prefix}: ${item.title}${item.kind === 'quiz' && item.totalPoints ? ` (/${item.totalPoints})` : ''}`);
    }

    const body = students.map((st, i) => {
        const row = [i + 1, st.student_id || '', st.name];
        for (const { item } of ordered) {
            const s = cellStatus(st, item);
            row.push(s.kind === 'score' ? (s.atRisk ? `${s.score} (At risk)` : s.score)
                : s.kind === 'missing' ? 'Missing'
                : s.kind === 'done' ? 'Done' : '');
        }
        return row;
    });

    const csv = [headers, ...body]
        .map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
        .join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `class-record_${subject.subject_code}_${section.section_name}.csv`.replace(/[^\w.-]+/g, '_');
    a.click();
    URL.revokeObjectURL(url);
}

/* ─── Shared UI ─────────────────────────────────────────────── */

function renderBanner(title, sub) {
    return `
        <header class="gb-hero">
            <div>
                <span class="gb-role-pill light">${icon('instructor', inl)} Instructor view</span>
                <h1 class="gb-hero-title">${esc(title)}</h1>
                <p class="gb-hero-sub">${esc(sub)}</p>
            </div>
            <!-- The subjective-grading workspace had no entry point anywhere in
                 the app: it was only reachable by typing its hash by hand, even
                 though it carries a "Back to Gradebook" link implying it should
                 be opened from here. -->
            <a href="#instructor/essay-grading" class="gb-grade-link">
                ${icon('edit', inl)} Grade submissions
            </a>
        </header>`;
}

function emptyBox(msg, showBack = false) {
    return `
        <div class="gb-empty-state">
            <div class="gb-empty-icon">${iconLg('clipboard')}</div>
            <p>${esc(msg)}</p>
            ${showBack ? '<button type="button" class="gb-btn-primary" id="gb-empty-back">Go back</button>' : ''}
        </div>`;
}

function pageCss() {
    return `
        ${gradingPeriodTableCss()}
        .gb-page { width:100%; min-height:''; background:transparent; }
        .gb-embedded { padding:0; }
        .gb-loading { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px; min-height:280px; color:#9CA3AF; font-size:13px; }
        .gb-loading.inline { min-height:200px; }
        .gb-spin { width:40px; height:40px; border:3px solid #eee; border-top-color:${G}; border-radius:50%; animation:gbSpin .75s linear infinite; }
        @keyframes gbSpin { to { transform:rotate(360deg); } }

        .gb-hero { padding:24px 28px; margin-bottom:20px; border-radius:16px; color:#111; background:#fff; border:1px solid ${BORDER}; }
        .gb-hero-title { font-size:24px; font-weight:800; margin:8px 0 4px; color:#111; }
        .gb-hero-sub { font-size:13px; color:#6B7280; margin:0; }

        .gb-role-pill { display:inline-flex; align-items:center; gap:5px; padding:4px 10px; border-radius:20px;
            font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.5px; background:${GL}; color:${G}; }
        .gb-role-pill.light { background:${GL}; color:${G}; }

        .gb-back { display:inline-flex; align-items:center; gap:6px; font-size:13px; font-weight:600;
            color:${G}; background:none; border:none; cursor:pointer; margin-bottom:16px; padding:0; }
        .gb-back:hover { text-decoration:underline; }

        .gb-toolbar { display:flex; align-items:center; gap:12px; margin-bottom:20px; padding:14px 16px; background:#F3F4F6; border-radius:12px; }
        .gb-search-wrap { flex:1; position:relative; }
        .gb-search-wrap svg { position:absolute; left:12px; top:50%; transform:translateY(-50%); color:#9CA3AF; }
        .gb-search { width:100%; padding:10px 14px 10px 38px; border:none; background:#ECEFF1; border-radius:8px; font-size:14px; }
        .gb-count { font-size:12px; font-weight:700; color:${G}; background:${GL}; padding:8px 14px; border-radius:20px; }

        .gb-subj-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:20px; }
        .gb-subj-card { text-decoration:none; color:inherit; border-radius:14px; overflow:hidden; background:#fff;
            border:1px solid ${BORDER}; display:flex; flex-direction:column; transition:box-shadow .15s, transform .15s; cursor:pointer; }
        .gb-subj-card:hover { box-shadow:0 4px 14px rgba(0,0,0,.08); transform:translateY(-1px); }
        .gb-subj-top { padding:20px 18px; min-height:100px; display:flex; flex-direction:column; justify-content:flex-end; }
        .gb-subj-card-code { font-size:11px; font-weight:700; font-family:monospace; color:rgba(255,255,255,.9); }
        .gb-subj-top h3 { font-size:17px; font-weight:700; color:#fff; margin:6px 0 0; line-height:1.3; }
        .gb-subj-body { padding:16px 18px; flex:1; display:flex; flex-direction:column; gap:8px; }
        .gb-stat-row { font-size:13px; color:#374151; display:flex; align-items:center; gap:8px; }
        .gb-subj-link { margin-top:auto; font-size:12px; font-weight:700; color:${G}; padding-top:10px; }

        .gb-subj-hero { display:flex; border-radius:14px; overflow:hidden; margin-bottom:24px; background:#fff; border:1px solid ${BORDER}; }
        .gb-subj-hero-band { padding:24px 28px; color:#fff; min-width:220px; }
        .gb-subj-code { font-size:11px; font-weight:700; font-family:monospace; opacity:.9; }
        .gb-subj-hero-band h1 { font-size:22px; font-weight:800; margin:6px 0 4px; }
        .gb-subj-prog { font-size:12px; opacity:.85; }
        .gb-subj-hero-meta { flex:1; padding:24px 28px; display:flex; flex-direction:column; justify-content:center; gap:10px; }
        .gb-subj-hero-meta p { margin:0; color:#6B7280; font-size:14px; }

        .gb-sec-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:18px; }
        .gb-sec-card { border:1px solid ${BORDER}; border-radius:14px; background:#fff; overflow:hidden; transition:box-shadow .15s, transform .15s; }
        .gb-sec-card:hover { box-shadow:0 4px 14px rgba(0,0,0,.08); transform:translateY(-1px); }
        .gb-sec-card-link { display:block; padding:18px; text-decoration:none; color:inherit; }
        .gb-sec-head { display:flex; justify-content:space-between; align-items:flex-start; gap:10px; margin-bottom:12px; }
        .gb-sec-name { font-size:17px; font-weight:700; color:#111; margin:0 0 4px; }
        .gb-sec-hint { font-size:11px; color:#9CA3AF; }
        .gb-sec-badge { font-size:10px; font-weight:700; text-transform:uppercase; padding:4px 8px; border-radius:6px; background:${GL}; color:${G}; }
        .gb-sec-meta { font-size:13px; color:#6B7280; display:flex; flex-direction:column; gap:6px; margin-bottom:10px; }
        .gb-sec-meta div { display:flex; align-items:center; gap:6px; }
        .gb-sec-bar { height:5px; background:#f0f0f0; border-radius:3px; overflow:hidden; margin-bottom:12px; }
        .gb-sec-fill { height:100%; background:${G}; }

        .gb-record-head { margin-bottom:16px; }
        .gb-record-head h2 { font-size:20px; font-weight:800; color:#111; margin:8px 0 4px; }
        .gb-record-head p { font-size:13px; color:#6B7280; margin:0 0 10px; }
        .gb-period-legend { font-size:12px !important; color:#00461B !important; background:#E8F5EC;
            padding:8px 12px; border-radius:8px; margin-bottom:10px !important; }
        .gb-period-subtotal-cell { background:#f8fdf9 !important; }
        .gb-record-stats { display:flex; flex-wrap:wrap; gap:16px; align-items:center; font-size:13px; color:#374151; }
        .gb-record-stats strong { color:${G}; }
        .gb-export-btn { margin-left:auto; display:inline-flex; align-items:center; gap:6px; padding:8px 16px;
            border-radius:8px; border:1.5px solid ${G}; background:#fff; color:${G}; font-size:12px; font-weight:700; cursor:pointer; }
        .gb-export-btn:hover { background:${GL}; }

        /* Severity tiers — same cutoffs (60% / 40%) and exact colors as the
           Global Gradebook's amber/red convention and the Reports page.
           One standard across the app: green (good) -> amber (at risk) ->
           red (critical), plus a neutral gray for "lacking" (no submissions
           at all yet), matching ReportsAPI.php's status classification. */
        .gb-row-at-risk  { background:${AMBER_BG}55 !important; }
        .gb-row-at-risk:hover  { background:${AMBER_BG} !important; }
        .gb-row-critical { background:${RED_BG}55 !important; }
        .gb-row-critical:hover { background:${RED_BG} !important; }
        .gb-row-lacking  { background:#F9FAFB !important; }
        .gb-risk-tag { display:inline-flex; align-items:center; justify-content:center; width:16px; height:16px;
            border-radius:50%; background:${RED_BG}; color:${RED_FG}; font-size:10px; font-weight:800; margin-left:4px; }

        /* classroom-ui.js's shared curriculumTableCss() defines its own
           .gc-cur-badge-pass (Google-style green/red) and loads AFTER this
           stylesheet in every render call here — same specificity, later
           source wins, so these need !important to actually take effect
           (the same fix Global Gradebook itself already applies). */
        .gc-cur-badge-pass     { background:${GL} !important; color:${G} !important; }
        .gc-cur-badge-atrisk, .gc-cur-badge-missing { background:${AMBER_BG} !important; color:${AMBER_FG} !important; }
        .gc-cur-badge-critical { background:${RED_BG} !important; color:${RED_FG} !important; }
        .gc-cur-badge-lacking  { background:#F3F4F6 !important; color:#4B5563 !important; }
        .gc-cur-badge-atrisk, .gc-cur-badge-critical, .gc-cur-badge-lacking, .gc-cur-badge-missing {
            display:inline-block; padding:3px 8px; border-radius:6px; font-size:11px; font-weight:700;
        }
        .gc-cur-badge-raw { font-size:12px; font-weight:700; color:#111827; }

        /* One cell = one result: the score, with a small "At risk" tag under it
           when it is below passing. Nothing is added up across the row. */
        .gb-cell { display:inline-flex; flex-direction:column; align-items:center; gap:3px; }
        .gb-cell-score { font-size:12px; font-weight:700; color:#111827; white-space:nowrap; }
        .gb-cell-risk { display:inline-block; padding:1px 6px; border-radius:5px; font-size:9.5px; font-weight:800;
            color:${AMBER_FG}; border:1px solid ${AMBER_FG}; background:#fff; white-space:nowrap; }
        .gb-td-risk .gb-cell-score { color:${AMBER_FG}; }
        .gb-td-empty { background:#FAFAFA; }

        /* Click-to-edit quiz score cells — same directly-editable-cell spirit
           and focus treatment as the Global Gradebook's dropdowns. */
        .gb-editable-td { cursor:pointer; position:relative; transition:background .12s; }
        .gb-editable-td:hover { background:${GL}; }
        .gb-editable-td:hover .gb-edit-target { text-decoration:underline; text-decoration-style:dotted; text-decoration-color:${G}; }
        .gb-overridden { color:${G2} !important; }
        .gb-overridden::after { content:'✎'; font-size:9px; margin-left:3px; opacity:.7; }
        .gb-score-input {
            width:56px; padding:2px 4px; border:1px solid ${G}; border-radius:4px; font-size:12px;
            font-family:inherit; text-align:center; outline:none; box-shadow:0 0 0 2px rgba(0,70,27,.15);
        }

        .gb-table-scroll { overflow-x:auto; }
        /* Override curriculumTableCss's overflow:hidden — clip doesn't create a
           scroll context, so the frozen Name column (see classroom-ui.js's
           curriculumTableCss, the shared source — .gc-th-info / .td-name)
           needs this wrapper left at overflow:visible so position:sticky reads
           against .gb-table-scroll instead of .gc-cur-wrap. */
        .gc-cur-wrap { overflow:visible !important; }
        .gb-record-table { min-width:640px; }
        .gb-record-table tfoot .gb-record-avg-row td { border-top:2px solid #1B4D3E; font-size:11px; }

        .gb-empty-state { text-align:center; padding:48px 24px; border:2px dashed ${BORDER}; border-radius:16px; background:#FAFAFA; }
        .gb-empty-icon { margin-bottom:12px; color:#9CA3AF; }
        .gb-empty-state p { color:#6B7280; margin:0 0 16px; }
        .gb-no-results { text-align:center; color:#9CA3AF; padding:24px; }
        .gb-btn-primary { background:${G}; color:#fff; border:none; padding:10px 18px; border-radius:10px;
            font-size:13px; font-weight:700; cursor:pointer; }
        .gb-btn-primary:hover { background:${G2}; }
        .gb-hero { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; flex-wrap:wrap; }
        .gb-grade-link { display:inline-flex; align-items:center; gap:7px; padding:9px 15px; background:#fff;
            border:1.5px solid ${G}; color:${G}; border-radius:9px; font-size:13px; font-weight:700;
            text-decoration:none; white-space:nowrap; transition:background .15s, color .15s; }
        .gb-grade-link:hover { background:${G}; color:#fff; }

        @media(max-width:640px) {
            .gb-subj-hero { flex-direction:column; }
            .gb-subj-hero-band { min-width:0; }
        }
    `;
}
