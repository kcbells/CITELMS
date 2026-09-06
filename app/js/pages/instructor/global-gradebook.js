/**
 * Instructor — Global Gradebook
 * 14-module Effortful Learning / Mastery model.
 * Layout: horizontal scrollable table (all modules side-by-side) matching the reference sheet.
 */
import { Api } from '../../api.js';
import { subjectColor } from '../../utils/subject-colors.js';
import { icon } from '../../utils/icons.js';
import { curriculumTableCss, rotateOverlayHtml, rotateOverlayCss } from '../../utils/classroom-ui.js';
import { gradingPeriodTableCss } from '../../utils/gradebook-periods.js';
import {
    rubricToPercent, socGrade, letsPracticeGrade, projectOverallGrade, checkinAverage,
    computeStudentReport, formatGrade, PERIOD_MODULES, PERIODS,
} from '../../utils/grading-engine.js';
import { openModuleDocumentsModal } from '../../components/module-documents-modal.js';
import { Auth } from '../../auth.js';
import { openGradingWorkbookExport } from './gradebook-xlsx-export.js';

const G      = '#00461B';
const G2     = '#006428';
const GL     = '#E8F5EC';
const BORDER = '#E5E7EB';
const VIOLET = '#7C3AED';
const VL     = '#EDE9FE';

// ── WUQ dropdown values (7-question quiz scale) ────────────────────────────
const WUQ_OPTS = [
    { label: '—',      value: '' },
    { label: '100.00', value: '100'   },
    { label: '85.71',  value: '85.71' },
    { label: '71.43',  value: '71.43' },
    { label: '57.14',  value: '57.14' },
    { label: '42.86',  value: '42.86' },
    { label: '28.57',  value: '28.57' },
    { label: '14.29',  value: '14.29' },
    { label: '0.00',   value: '0'     },
];

// ── Grading computation engine ────────────────────────────────────────────
// rubricToPercent / socGrade / letsPracticeGrade / projectOverallGrade /
// computeStudentReport / PERIOD_MODULES / PERIODS all come from
// ../../utils/grading-engine.js — the single source of truth for the
// EL/Mastery formulas. See that file for the exact spec.

function fmt(v, dec = 2) {
    return formatGrade(v, dec);
}

// ── Main entry point ───────────────────────────────────────────────────────

let _classesData = [];

export async function render(container) {
    const hashParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
    await renderGlobalGradebook(container, {
        subjectId: hashParams.get('subject_id') || '',
        sectionId: hashParams.get('section_id') || '',
        view:      hashParams.get('view')        || 'modules',
        embedded:  false,
    });
}

/** Called from subject.js Gradebook tab when subject.grading_type === 'global' */
export async function mountInstructorGlobalGradebook(host, { subjectId } = {}) {
    await renderGlobalGradebook(host, {
        subjectId: subjectId || '',
        sectionId: '',
        view:      'modules',
        embedded:  true,
    });
}

async function renderGlobalGradebook(container, opts) {
    container.innerHTML = `<div class="ggb-loading"><div class="ggb-spin"></div></div><style>${css()}</style>`;
    const res    = await Api.get('/SectionsAPI.php?action=instructor-classes');
    _classesData = res.success ? (res.data || []) : [];

    bindRowSelect(container);

    const { subjectId, sectionId } = opts;
    if (sectionId && subjectId) await renderClassRecord(container, opts);
    else if (subjectId)          renderSectionsView(container, opts);
    else                         renderSubjectsView(container, opts);
}

/**
 * Clicking a student's row (or focusing any input/select inside it) selects
 * and highlights it (see .gb-row-selected in classroom-ui.js's shared
 * curriculumTableCss). Delegated once on the outer container rather than
 * re-bound per table — every gradebook table here (module records,
 * quick-grade popup, project grades, retries, SIS view, summary view) gets
 * it for free even though their HTML is swapped in and out independently as
 * the instructor navigates/opens modals. Guarded so container re-renders
 * (this function runs again on every nav) never double-bind the same
 * listener.
 *
 * Always SETS the highlight, never toggles it off — a toggle looked right
 * for a single click, but a second click on the same already-selected row
 * (e.g. opening its dropdown to actually grade it) flipped the highlight
 * back off right as the instructor started inputting, which is exactly the
 * "highlight disappears while I'm entering a grade" bug this fixes.
 * 'focusin' (not 'click' alone) is what makes the highlight follow
 * auto-advance too (see focusNextRowDown()) — that moves focus
 * programmatically without a click, so 'focusin' is the only thing that
 * both a manual click AND an auto-advance jump have in common.
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

function nav(container, opts, patch = {}) {
    const next = { ...opts, ...patch };
    if (!opts.embedded) {
        const p = new URLSearchParams();
        if (next.subjectId) p.set('subject_id', next.subjectId);
        if (next.sectionId) p.set('section_id', next.sectionId);
        if (next.view && next.view !== 'modules') p.set('view', next.view);
        const hash = `#instructor/global-gradebook${p.toString() ? '?' + p : ''}`;
        if (window.location.hash !== hash) history.replaceState(null, '', hash);
    }
    return renderGlobalGradebook(container, next);
}

function esc(s) {
    const d = document.createElement('div');
    d.textContent = s ?? '';
    return d.innerHTML;
}

// ── Level 1: Subjects ─────────────────────────────────────────────────────

function renderSubjectsView(container, opts) {
    const subjects = _classesData.filter(s => s.grading_type === 'global');
    container.innerHTML = `<style>${css()}</style>
    <div class="ggb-page">
        <header class="ggb-hero">
            <span class="ggb-pill">${icon('gradebook', { size: 13, className: 'ui-icon-inline' })} Global Gradebook</span>
            <p class="ggb-hero-sub">14-module Effortful Learning / Mastery grading</p>
        </header>
        ${subjects.length === 0
            ? emptyBox('No subjects assigned with the Global grading type. The dean must set a subject to "Global" in Manage Subjects.')
            : `<div class="ggb-toolbar">
                <div class="ggb-search-wrap">
                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                    <input type="search" id="ggb-search" class="ggb-search" placeholder="Search subjects…" autocomplete="off">
                </div>
                <span class="ggb-count">${subjects.length} subject${subjects.length !== 1 ? 's' : ''}</span>
               </div>
               <div class="ggb-subj-grid" id="ggb-subj-grid">
                   ${subjects.map(s => subjectCard(s)).join('')}
               </div>
               <p class="ggb-no-results" id="ggb-no-results" hidden>No subjects match.</p>`}
    </div>`;

    container.querySelectorAll('[data-ggb-subject]').forEach(el =>
        el.addEventListener('click', e => { e.preventDefault(); nav(container, opts, { subjectId: el.dataset.ggbSubject, sectionId: '' }); })
    );
    const search = container.querySelector('#ggb-search');
    const cards  = [...(container.querySelectorAll('.ggb-subj-card') || [])];
    search?.addEventListener('input', () => {
        const q = search.value.toLowerCase().trim();
        let n   = 0;
        cards.forEach(c => { const show = !q || c.dataset.search.includes(q); c.hidden = !show; if (show) n++; });
        const noRes = container.querySelector('#ggb-no-results');
        const grid  = container.querySelector('#ggb-subj-grid');
        if (noRes) noRes.hidden = n > 0;
        if (grid)  grid.style.display = n === 0 ? 'none' : '';
    });
}

function subjectCard(s) {
    const color    = subjectColor(s.subject_id);
    const sections = s.sections || [];
    const total    = sections.reduce((n, x) => n + Number(x.student_count || 0), 0);
    const search   = [s.subject_code, s.subject_name, s.program_code].filter(Boolean).join(' ').toLowerCase();
    return `
    <a href="#" class="ggb-subj-card" data-ggb-subject="${s.subject_id}" data-search="${esc(search)}">
        <div class="ggb-subj-top" style="background:${color}">
            <span class="ggb-subj-code">${esc(s.subject_code)}</span>
            <h3>${esc(s.subject_name)}</h3>
        </div>
        <div class="ggb-subj-body">
            <div class="ggb-stat">${icon('school', { size: 13, className: 'ui-icon-inline' })} <strong>${sections.length}</strong> section${sections.length !== 1 ? 's' : ''}</div>
            <div class="ggb-stat">${icon('users',  { size: 13, className: 'ui-icon-inline' })} <strong>${total}</strong> student${total !== 1 ? 's' : ''}</div>
            <span class="ggb-subj-link">View global gradebook →</span>
        </div>
    </a>`;
}

// ── Level 2: Sections ─────────────────────────────────────────────────────

function renderSectionsView(container, opts) {
    const subject  = _classesData.find(s => String(s.subject_id) === String(opts.subjectId));
    if (!subject) {
        container.innerHTML = `<style>${css()}</style><div class="ggb-page">${emptyBox('Subject not found.')}</div>`;
        return;
    }
    const sections = subject.sections || [];
    const color    = subjectColor(subject.subject_id);

    container.innerHTML = `<style>${css()}</style>
    <div class="ggb-page">
        <button class="ggb-back" id="ggb-back">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            All Subjects
        </button>
        <header class="ggb-subj-hero">
            <div class="ggb-subj-band" style="background:${color}">
                <span class="ggb-subj-code-sm">${esc(subject.subject_code)}</span>
                <h1>${esc(subject.subject_name)}</h1>
                ${subject.program_code ? `<span class="ggb-subj-prog">${esc(subject.program_code)}</span>` : ''}
            </div>
            <div class="ggb-subj-meta">
                <p>${sections.length} section${sections.length !== 1 ? 's' : ''} · Select a section to open its global gradebook</p>
                <span class="ggb-pill">${icon('gradebook', { size: 13, className: 'ui-icon-inline' })} Global Gradebook</span>
            </div>
        </header>
        ${sections.length === 0
            ? emptyBox('No sections assigned to this subject yet.')
            : `<div class="ggb-sec-grid">${sections.map(sec => sectionCard(sec)).join('')}</div>`}
    </div>`;

    container.querySelector('#ggb-back').addEventListener('click', () => nav(container, opts, { subjectId: '', sectionId: '' }));
    container.querySelectorAll('[data-ggb-section]').forEach(el =>
        el.addEventListener('click', e => {
            e.preventDefault();
            nav(container, opts, { subjectId: subject.subject_id, sectionId: el.dataset.ggbSection, view: 'modules' });
        })
    );
}

function sectionCard(sec) {
    const pct = sec.max_students > 0 ? Math.round((Number(sec.student_count) / Number(sec.max_students)) * 100) : 0;
    return `
    <article class="ggb-sec-card">
        <a href="#" class="ggb-sec-link" data-ggb-section="${sec.section_id}">
            <div class="ggb-sec-head">
                <div>
                    <h3>${esc(sec.section_name)}</h3>
                    <span class="ggb-sec-hint">Open global gradebook</span>
                </div>
                <span class="ggb-sec-badge">${esc(sec.status || 'active')}</span>
            </div>
            <div class="ggb-sec-meta">
                ${sec.schedule ? `<div>${icon('clock', { size: 12, className: 'ui-icon-inline' })} ${esc(sec.schedule)}</div>` : ''}
                ${sec.room     ? `<div>${icon('pin',   { size: 12, className: 'ui-icon-inline' })} ${esc(sec.room)}</div>`     : ''}
                <div>${icon('users', { size: 12, className: 'ui-icon-inline' })} ${Number(sec.student_count || 0)} enrolled</div>
            </div>
            <div class="ggb-bar"><div class="ggb-bar-fill" style="width:${pct}%"></div></div>
            <span class="ggb-subj-link">View grades →</span>
        </a>
    </article>`;
}

// ── Level 3: Class record ─────────────────────────────────────────────────

async function renderClassRecord(container, opts) {
    const subject = _classesData.find(s => String(s.subject_id) === String(opts.subjectId));
    const section = subject?.sections?.find(sec => String(sec.section_id) === String(opts.sectionId));
    if (!subject || !section) {
        container.innerHTML = `<style>${css()}</style><div class="ggb-page">${emptyBox('Section not found.')}</div>`;
        return;
    }

    container.innerHTML = `<style>${css()}</style>
    <div class="ggb-page">
        <button class="ggb-back" id="ggb-back-sec">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            ${esc(subject.subject_code)} — ${esc(section.section_name)}
        </button>
        <div id="ggb-record-host">
            <div class="ggb-loading"><div class="ggb-spin"></div><p>Loading gradebook…</p></div>
        </div>
    </div>`;

    container.querySelector('#ggb-back-sec').addEventListener('click', () =>
        nav(container, opts, { subjectId: subject.subject_id, sectionId: '' })
    );

    const host = container.querySelector('#ggb-record-host');
    await mountGlobalClassRecord(host, subject, section, opts);
}

/**
 * Fetches and mounts the module-based (EL/Mastery) class record directly
 * into `host`, given a subject + section object. Used both by this page's
 * own navigation and by the raw-score gradebook (gradebook.js) when a
 * subject's grading_type is 'global', so both entry points share one
 * implementation instead of duplicating the fetch/render logic.
 */
export async function mountGlobalClassRecord(host, subject, section, opts = {}) {
    const offeredId = String(section.subject_offered_id || subject.subject_offered_id || '');
    host.innerHTML = `<style>${css()}</style><div class="ggb-loading"><div class="ggb-spin"></div><p>Loading gradebook…</p></div>`;

    try {
        const [mgRes, pgRes, studRes, rtRes] = await Promise.all([
            Api.get(`/GlobalGradebookAPI.php?action=module-grades&subject_offered_id=${offeredId}&section_id=${section.section_id}`),
            Api.get(`/GlobalGradebookAPI.php?action=project-grades&subject_offered_id=${offeredId}&section_id=${section.section_id}`),
            Api.get(`/SectionsAPI.php?action=students&section_id=${section.section_id}`),
            Api.get(`/GlobalGradebookAPI.php?action=get-retry&subject_offered_id=${offeredId}&section_id=${section.section_id}`),
        ]);

        const students = buildStudentList(studRes, offeredId, subject.subject_id);

        // Fallback: use students from module-grades API response
        if (!students.length && mgRes.students) {
            for (const r of (mgRes.students || [])) {
                students.push({
                    user_student_id: r.user_student_id,
                    student_id: r.student_id || '',
                    name: `${r.last_name || ''}, ${r.first_name || ''}`.replace(/^,\s*/, '').trim() || 'Student',
                });
            }
        }

        const grades  = mgRes.success ? (mgRes.data?.grades  || mgRes.grades  || {}) : {};
        const project = pgRes.success ? (pgRes.data?.project || pgRes.project || {}) : {};
        const retries = rtRes.success ? (rtRes.data          || {})                  : {};

        mountRecord(host, host, subject, section, offeredId, students, grades, project, retries, { view: opts.view || 'modules', embedded: true });
    } catch (err) {
        console.error(err);
        host.innerHTML = `<style>${css()}</style>` + emptyBox('Could not load gradebook data. ' + err.message);
    }
}

function buildStudentList(studRes, offeredId, subjectId) {
    const rows     = studRes.success ? (studRes.data || []) : [];
    const enrolled = offeredId
        ? rows.filter(r => String(r.subject_offered_id) === String(offeredId))
        : rows.filter(r => String(r.subject_id) === String(subjectId));
    const seen = new Set(), students = [];
    for (const r of enrolled) {
        if (seen.has(r.user_student_id)) continue;
        seen.add(r.user_student_id);
        students.push({
            user_student_id: r.user_student_id,
            student_id: r.student_id || '',
            name: `${r.last_name || ''}, ${r.first_name || ''}`.replace(/^,\s*/, '').trim() || 'Student',
            program_code: r.program_code || '',
            program_name: r.program_name || '',
            campus_name: r.campus_name || '',
            department_code: r.department_code || '',
        });
    }
    students.sort((a, b) => a.name.localeCompare(b.name));
    return students;
}

// ── Mount record with view switcher ───────────────────────────────────────

const VIEWS = ['modules', 'project', 'summary', 'sis', 'retries'];
const VIEW_LABELS = { modules: 'Module Records', project: 'Project Grades', summary: 'Summary & Remarks', sis: 'For SIS', retries: 'Students for Retry' };

function mountRecord(host, container, subject, section, offeredId, students, grades, project, retries, opts) {
    let activeView = opts.view || 'modules';

    function renderShell() {
        const schedule = [section.schedule, section.room].filter(Boolean).join(' · ');
        host.innerHTML = `
        <style>${css()}${curriculumTableCss()}${gradingPeriodTableCss()}${tableCss()}${rotateOverlayCss()}</style>
        ${rotateOverlayHtml()}
        <div class="gb-record-head">
            <div class="gb-record-titlerow">
                <div>
                    <h2 class="gb-record-title">${esc(subject.subject_code)} <span class="gb-record-section">&middot; ${esc(section.section_name)}</span></h2>
                    ${schedule ? `<p class="gb-record-meta">${esc(schedule)}</p>` : ''}
                </div>
                <div class="gb-record-actions">
                    <span class="gb-record-count">${students.length} student${students.length !== 1 ? 's' : ''}</span>
                    <button class="ggb-grade-btn" id="ggb-grade-btn">
                        ${icon('edit', { size: 13, className: 'ui-icon-inline' })} GRADE
                    </button>
                    <button class="gb-export-btn" id="ggb-docs-btn">
                        ${icon('document', { size: 13, className: 'ui-icon-inline' })} Documents
                    </button>
                    <button class="gb-export-btn" id="ggb-export">
                        ${icon('download', { size: 13, className: 'ui-icon-inline' })} Export
                    </button>
                    <button class="gb-export-btn" id="ggb-export-sis" title="Downloads 6 files: P1/P2/P3 x Effortful (CS) + Mastery (PE), named for SIS upload">
                        ${icon('download', { size: 13, className: 'ui-icon-inline' })} Export for SIS
                    </button>
                    <button class="ggb-guide-btn" id="ggb-guide-btn">
                        ${icon('info', { size: 13, className: 'ui-icon-inline' })} Guide
                    </button>
                </div>
            </div>
        </div>
        <div class="ggb-view-tabs">
            ${VIEWS.map(v => `<button class="ggb-vtab${v === activeView ? ' active' : ''}" data-view="${v}">${VIEW_LABELS[v]}</button>`).join('')}
        </div>
        <div id="ggb-view-area"></div>
        ${guideModalHtml()}`;

        host.querySelectorAll('.ggb-vtab').forEach(btn => {
            btn.addEventListener('click', () => {
                activeView = btn.dataset.view;
                host.querySelectorAll('.ggb-vtab').forEach(b => b.classList.toggle('active', b.dataset.view === activeView));
                renderView();
                // Update URL only — do NOT call nav()/renderGlobalGradebook() which would
                // re-fetch and re-mount the record, discarding unsaved in-memory edits.
                if (!opts.embedded) {
                    const p = new URLSearchParams();
                    if (opts.subjectId) p.set('subject_id', opts.subjectId);
                    if (opts.sectionId) p.set('section_id', opts.sectionId);
                    if (activeView !== 'modules') p.set('view', activeView);
                    const hash = `#instructor/global-gradebook${p.toString() ? '?' + p : ''}`;
                    if (window.location.hash !== hash) history.replaceState(null, '', hash);
                }
            });
        });

        host.querySelector('#ggb-export').addEventListener('click', () => {
            const me = Auth.user() || {};
            openGradingWorkbookExport(subject, section, students, grades, project, retries, {
                teacherName: me.name || '',
                campusLabel: students[0]?.campus_name || '',
                departmentLabel: students[0]?.department_code || '',
            });
        });
        host.querySelector('#ggb-export-sis').addEventListener('click', () =>
            exportSisCsvs(subject, section, students, grades, project)
        );

        host.querySelector('#ggb-docs-btn').addEventListener('click', () =>
            openModuleDocumentsModal(subject.subject_id)
        );

        host.querySelector('#ggb-grade-btn').addEventListener('click', () =>
            openGradeModal(offeredId, students, grades, () => renderView())
        );

        const guideOverlay = host.querySelector('#ggb-guide-overlay');
        // Mount the fixed-position overlay on <body> — nesting it inside the
        // classroom page's tabs (which sit in a sibling z-index stacking
        // context) traps its z-index and lets those tabs render on top of it.
        document.querySelectorAll('#ggb-guide-overlay').forEach(el => { if (el !== guideOverlay) el.remove(); });
        document.body.appendChild(guideOverlay);
        host.querySelector('#ggb-guide-btn').addEventListener('click', () => guideOverlay.removeAttribute('hidden'));
        guideOverlay.querySelector('#ggb-guide-close').addEventListener('click', () => guideOverlay.setAttribute('hidden', ''));
        guideOverlay.addEventListener('click', e => { if (e.target === guideOverlay) guideOverlay.setAttribute('hidden', ''); });

        guideOverlay.querySelectorAll('.ggb-gtab').forEach(tab => {
            tab.addEventListener('click', () => {
                const t = tab.dataset.gtab;
                guideOverlay.querySelectorAll('.ggb-gtab').forEach(b => b.classList.toggle('active', b.dataset.gtab === t));
                guideOverlay.querySelectorAll('.ggb-guide-body').forEach(b => b.classList.toggle('ggb-gtab-hidden', b.id !== `ggb-gtab-${t}`));
            });
        });

        renderView();
    }

    function renderView() {
        const area = host.querySelector('#ggb-view-area');
        if (!area) return;
        if      (activeView === 'modules') area.innerHTML = renderModuleTable(students, grades, project, subject.subject_code, section.section_name);
        else if (activeView === 'project') area.innerHTML = renderProjectTable(students, project, subject.subject_code, section.section_name);
        else if (activeView === 'sis')     area.innerHTML = renderSisTable(students, grades, project, subject, section);
        else if (activeView === 'retries') area.innerHTML = renderRetriesTable(students, grades, project, retries, subject.subject_code, section.section_name);
        else                               area.innerHTML = renderSummaryTable(students, grades, project, subject.subject_code, section.section_name);

        if (activeView === 'modules') attachModuleEvents(area, offeredId, grades, project);
        if (activeView === 'project') attachProjectEvents(area, offeredId, project);
        if (activeView === 'retries') attachRetriesEvents(area, offeredId, retries);
    }

    renderShell();
}

// ── Horizontal module table (all 14 modules side-by-side) ─────────────────
// Uses the SAME CSS classes as the raw-score gradebook for visual consistency.

function renderModuleTable(students, grades, project, subjectCode = '', sectionName = '') {
    const modules = Array.from({ length: 14 }, (_, i) => i + 1);

    // Row 1: Module N (dark green, period-coloured)
    let hdr1 = `<th rowspan="3">#</th>
                <th rowspan="3" class="th-left">Student ID</th>
                <th rowspan="3" class="gc-th-info th-left">Name of Student</th>`;
    modules.forEach(m => {
        hdr1 += `<th colspan="6" class="gb-period-th">Module ${m}<span class="gb-period-sub">${m <= 4 ? 'P1' : m <= 9 ? 'P2' : 'Final'}</span></th>`;
    });

    // Row 2: SOC (2) | EL (3) | Mastery (1) per module — each group colored
    // via gb-group-th (see tableCss() below), not the plain gb-item-th look
    let hdr2 = '';
    modules.forEach(() => {
        hdr2 += `<th colspan="2" class="gb-group-th gb-group-th--soc">Start of Class (5%)</th>
                 <th colspan="3" class="gb-group-th gb-group-th--el">Effortful Learning</th>
                 <th colspan="1" class="gb-group-th gb-group-th--mastery">Mastery (15%)</th>`;
    });

    // Row 3: individual fields
    let hdr3 = '';
    modules.forEach(() => {
        hdr3 += `
        <th class="gb-item-th"><span class="gb-item-type activity">SOC</span><span class="gb-item-name">SOC 1</span></th>
        <th class="gb-item-th"><span class="gb-item-type activity">SOC</span><span class="gb-item-name">SOC 2</span></th>
        <th class="gb-item-th"><span class="gb-item-type quiz">LP (35%)</span><span class="gb-item-name">Let's Practice</span></th>
        <th class="gb-item-th"><span class="gb-item-type quiz">LP Opt</span><span class="gb-item-name">Optional</span></th>
        <th class="gb-item-th"><span class="gb-item-type quiz">Refl (15%)</span><span class="gb-item-name"><em>Reflection</em></span></th>
        <th class="gb-item-th"><span class="gb-item-type quiz">WUQ (15%)</span><span class="gb-item-name">Wrap Up Quiz</span></th>`;
    });

    const rows = students.map((st, i) => {
        const sid = st.user_student_id;
        let cells = '';
        modules.forEach(m => {
            const mg = grades[sid]?.[m] || {};
            cells += `
            <td class="td-num td-soc-cell">${socSel('soc1', sid, m, mg.soc1 ?? '')}</td>
            <td class="td-num td-soc-cell">${socSel('soc2', sid, m, mg.soc2 ?? '')}</td>
            <td class="td-num">${rubricSel('lets_practice',          sid, m, mg.lets_practice          ?? '')}</td>
            <td class="td-num">${rubricSel('lets_practice_optional', sid, m, mg.lets_practice_optional ?? '')}</td>
            <td class="td-num">${rubricSel('reflection',             sid, m, mg.reflection             ?? '')}</td>
            <td class="td-num">${wuqSel(   'wrap_up_quiz',           sid, m, mg.wrap_up_quiz           ?? '')}</td>`;
        });
        return `<tr data-stu="${sid}">
            <td class="td-rank">${i + 1}</td>
            <td class="td-id">${esc(st.student_id || '—')}</td>
            <td class="td-name">${esc(st.name)}</td>
            ${cells}
        </tr>`;
    }).join('');

    const label = subjectCode && sectionName ? `CLASS RECORD — ${subjectCode} / ${sectionName}` : 'MODULE GRADES';

    return `
    <div class="gc-cur-wrap">
        <div class="gc-cur-label">${esc(label)}</div>
        <div class="gb-table-scroll">
            <table class="gc-cur-table ggb-module-table">
                <thead>
                    <tr>${hdr1}</tr>
                    <tr>${hdr2}</tr>
                    <tr>${hdr3}</tr>
                </thead>
                <tbody>
                    ${rows || '<tr><td colspan="87" class="gc-cur-empty">No students enrolled in this section.</td></tr>'}
                </tbody>
            </table>
        </div>
    </div>`;
}

/**
 * SOC dropdown + an Excel-style fill handle — set the first student's value,
 * then press-drag that little square down through the rows below it in the
 * SAME column (same field + same module) to copy the value onto all of
 * them in one motion, instead of opening each dropdown individually.
 * See attachFillHandles() for the drag mechanics.
 */
function socSel(field, sid, mod, val) {
    const colorClass = val === 'P' ? ' ggb-soc-p' : val === 'A' ? ' ggb-soc-a' : '';
    return `<span class="ggb-fillwrap">
        <select class="ggb-sel ggb-soc${colorClass}" data-field="${field}" data-sid="${sid}" data-mod="${mod}">
            <option value="" ${val === '' || val === null ? 'selected' : ''}>—</option>
            <option value="P" ${val === 'P' ? 'selected' : ''}>P</option>
            <option value="A" ${val === 'A' ? 'selected' : ''}>A</option>
        </select>
        <span class="ggb-fill-handle" title="Drag down to fill this value into the rows below"></span>
    </span>`;
}

function rubricSel(field, sid, mod, val) {
    const v = (val === '' || val === null || val === undefined) ? '' : String(val);
    return `<select class="ggb-sel ggb-rubric" data-field="${field}" data-sid="${sid}" data-mod="${mod}">
        <option value="" ${v === '' ? 'selected' : ''}>—</option>
        <option value="0" ${v === '0' ? 'selected' : ''}>0</option>
        <option value="1" ${v === '1' ? 'selected' : ''}>1</option>
        <option value="2" ${v === '2' ? 'selected' : ''}>2</option>
        <option value="3" ${v === '3' ? 'selected' : ''}>3</option>
    </select>`;
}

function wuqSel(field, sid, mod, val) {
    const display = (val === '' || val === null || val === undefined) ? '' : parseFloat(val).toFixed(2);
    return `<select class="ggb-sel ggb-wuq" data-field="${field}" data-sid="${sid}" data-mod="${mod}">
        ${WUQ_OPTS.map(o => {
            const sel = o.value === ''
                ? (display === '' ? 'selected' : '')
                : (o.value !== '' && parseFloat(o.value).toFixed(2) === display ? 'selected' : '');
            return `<option value="${o.value}" ${sel}>${o.label}</option>`;
        }).join('')}
    </select>`;
}

function showSaveError(row, msg) {
    const id = 'ggb-save-err';
    let toast = document.getElementById(id);
    if (!toast) {
        toast = document.createElement('div');
        toast.id = id;
        toast.style.cssText = 'position:fixed;bottom:24px;right:24px;background:#dc2626;color:#fff;padding:10px 16px;border-radius:8px;font-size:13px;font-weight:600;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,.25)';
        document.body.appendChild(toast);
    }
    toast.textContent = '⚠ ' + msg;
    toast.style.display = 'block';
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { toast.style.display = 'none'; }, 4000);
    if (row) { row.classList.add('ggb-row-err'); setTimeout(() => row.classList.remove('ggb-row-err'), 3000); }
}

function attachModuleEvents(area, offeredId, grades) {
    area.querySelectorAll('.ggb-sel').forEach(sel => {
        sel.addEventListener('change', async () => {
            const sid   = parseInt(sel.dataset.sid, 10);
            const mod   = parseInt(sel.dataset.mod, 10);
            const field = sel.dataset.field;
            const raw   = sel.value;
            const value = raw === '' ? null
                : (field === 'soc1' || field === 'soc2') ? raw
                : field === 'wrap_up_quiz' ? parseFloat(raw)
                : parseInt(raw, 10);

            if (!grades[sid]) grades[sid] = {};
            if (!grades[sid][mod]) grades[sid][mod] = {};
            grades[sid][mod][field] = value;

            // P/A color — updated immediately (before the save round-trip)
            // so the dropdown reflects the new value right away, same as the
            // color it's rendered with on initial load (see socSel()).
            if (field === 'soc1' || field === 'soc2') {
                sel.classList.remove('ggb-soc-p', 'ggb-soc-a');
                if (raw === 'P') sel.classList.add('ggb-soc-p');
                else if (raw === 'A') sel.classList.add('ggb-soc-a');
            }

            // Auto-advance to the same field one row down — same "finished
            // this cell, move to the next" flow as the Excel-style fill
            // handle uses to find a column (same field+module, in row
            // order), so grading a whole column top-to-bottom never needs
            // the mouse. Doesn't fire on the last row — nothing below it.
            focusNextRowDown(area, sel);

            try {
                const res = await Api.post('/GlobalGradebookAPI.php?action=save-field', {
                    subject_offered_id: parseInt(offeredId, 10),
                    student_id: sid, module_number: mod, field, value,
                });
                if (!res?.success) {
                    showSaveError(sel.closest('tr'), res?.message || 'Save failed');
                }
            } catch (err) {
                showSaveError(sel.closest('tr'), 'Network error — grade not saved');
                console.error('save-field:', err);
            }
        });
    });
    attachFillHandles(area);
}

// ── Excel-style fill handle — drag a SOC value down through the rows below
// it (same column: same field + same module) to copy it onto all of them,
// same gesture as Excel's autofill handle. Reuses the existing per-select
// `change` listener from attachModuleEvents() to actually persist each
// filled cell (via a synthetic 'change' event) instead of duplicating the
// save logic here.
//
// The mousemove/mouseup listeners are attached to `document` (need to keep
// tracking the drag even if the cursor leaves the table), so — same
// gotcha as the Users page dropdown-closer earlier — they must be attached
// ONCE for the page's lifetime, not once per table re-render, or repeated
// re-renders (switching modules, tabs, etc.) would stack up duplicate
// listeners indefinitely.
let fillDragGloballyAttached = false;
let fillDrag = null; // { cells: HTMLSelectElement[], startIndex, sourceValue, currentEnd }

/**
 * Moves focus to the same field (+ module, if this table has one) input/
 * select one row down from `el`, inside `area` — the same "column" the SOC
 * fill handle drags a value through (see attachFillHandles() below), just
 * walked one step at a time instead of dragged. Works for both <select>s
 * (module grading) and <input>s (project grades, retry tracker), and for
 * tables with no module dimension at all (data-mod simply isn't part of the
 * selector then). A no-op past the last row.
 *
 * Also carries `el`'s value forward as the next row's starting value —
 * a class list often repeats the same answer down a column (everyone
 * Present, the same rubric score, etc.), so the instructor doesn't have to
 * re-pick it for every student; they only need to act on the rows that are
 * actually different. It's a real change, not just a visual copy: setting
 * `.value` and dispatching a genuine 'change' event reuses whichever
 * attach*Events listener owns that field to actually save it, the same way
 * the fill handle already persists each cell it drags over. The instructor
 * can always override it — picking something else on the now-focused next
 * cell fires its own ordinary change event, which simply saves their choice
 * over the carried one.
 *
 * Only carries into a next row that's genuinely BLANK — a student who
 * already has their own value saved there (from a previous session, or
 * because grading didn't happen in row order) must never have it silently
 * overwritten just because the row above happened to get a new value.
 *
 * `dataset.gbCarrying` guards against this carried-forward change cascading
 * further down the column — without it, saving the carried value on the
 * next row would trigger ITS change handler, which would carry a value
 * forward AGAIN onto the row after that, and so on for the rest of the
 * column in one shot. Only the row immediately after a real, user-driven
 * change should ever receive a carried value.
 */
function focusNextRowDown(area, el) {
    if (el.dataset.gbCarrying) return;

    const field = el.dataset.field;
    if (!field) return;
    const mod = el.dataset.mod;
    const selector = mod !== undefined
        ? `[data-field="${CSS.escape(field)}"][data-mod="${CSS.escape(mod)}"]`
        : `[data-field="${CSS.escape(field)}"]`;
    const cells = Array.from(area.querySelectorAll(selector));
    const idx = cells.indexOf(el);
    if (idx === -1 || idx === cells.length - 1) return;
    const next = cells[idx + 1];
    next.focus();

    if (next.value === '' && el.value !== '') {
        next.value = el.value;
        next.dataset.gbCarrying = '1';
        next.dispatchEvent(new Event('change', { bubbles: true }));
        delete next.dataset.gbCarrying;
    }
}

function attachFillHandles(area) {
    area.querySelectorAll('.ggb-fill-handle').forEach(handle => {
        handle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            const sourceSelect = handle.previousElementSibling;
            const field = sourceSelect.dataset.field;
            const mod   = sourceSelect.dataset.mod;
            // Every SOC select for this exact field+module, in row order —
            // "the column" the fill drags down through.
            const cells = Array.from(area.querySelectorAll(
                `select.ggb-soc[data-field="${CSS.escape(field)}"][data-mod="${CSS.escape(mod)}"]`
            ));
            fillDrag = {
                cells,
                startIndex: cells.indexOf(sourceSelect),
                sourceValue: sourceSelect.value,
                currentEnd: cells.indexOf(sourceSelect),
            };
        });
    });

    if (fillDragGloballyAttached) return;
    fillDragGloballyAttached = true;

    document.addEventListener('mousemove', (e) => {
        if (!fillDrag) return;
        const { cells, startIndex } = fillDrag;
        let endIndex = startIndex;
        for (let i = 0; i < cells.length; i++) {
            const rect = cells[i].getBoundingClientRect();
            const mid = rect.top + rect.height / 2;
            if (e.clientY >= mid) endIndex = i;
        }
        fillDrag.currentEnd = endIndex;

        const lo = Math.min(startIndex, endIndex);
        const hi = Math.max(startIndex, endIndex);
        cells.forEach((c, i) => {
            c.closest('td')?.classList.toggle('ggb-fill-preview', i >= lo && i <= hi);
        });
    });

    document.addEventListener('mouseup', () => {
        if (!fillDrag) return;
        const { cells, startIndex, sourceValue, currentEnd } = fillDrag;
        // Clear every cell's preview highlight, not just the final [lo,hi]
        // range — if the drag went past a row and back, that row could
        // still be marked from earlier in the gesture otherwise.
        cells.forEach(c => c.closest('td')?.classList.remove('ggb-fill-preview'));

        const lo = Math.min(startIndex, currentEnd);
        const hi = Math.max(startIndex, currentEnd);
        for (let i = lo; i <= hi; i++) {
            if (i === startIndex) continue;
            const sel = cells[i];
            if (sel.value !== sourceValue) {
                sel.value = sourceValue;
                sel.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }
        fillDrag = null;
    });
}

// ── GRADE modal — pick a module, grade every student in a focused form ─────
// Reads/writes the SAME `grades` object (and the SAME save endpoint) as the
// inline Module Records table, so this is just an alternate entry point —
// nothing about the underlying data model changes. Project grading (one
// shared project per student, not per module) lives only on the dedicated
// Project Grades tab now, not duplicated here.

function openGradeModal(offeredId, students, grades, onClose) {
    document.querySelectorAll('#ggb-grade-overlay').forEach(el => el.remove());

    const overlay = document.createElement('div');
    overlay.id = 'ggb-grade-overlay';
    overlay.innerHTML = `<style>${gradeModalCss()}</style>
        <div class="ggm-modal" role="dialog" aria-label="Grade a Module">
            <div class="ggm-hdr">
                <div>
                    <h3>GRADE</h3>
                    <p class="ggm-sub">Pick a module, then fill in Start of Class, Effortful Learning and Mastery for every student.</p>
                </div>
                <button class="ggm-close" id="ggm-close" aria-label="Close">&#x2715;</button>
            </div>
            <div class="ggm-toolbar">
                <label for="ggm-mod-select">Module</label>
                <select id="ggm-mod-select">
                    ${Array.from({ length: 14 }, (_, i) => i + 1).map(m => `<option value="${m}">Module ${m}</option>`).join('')}
                </select>
            </div>
            <div class="ggm-body" id="ggm-body"></div>
        </div>`;
    document.body.appendChild(overlay);

    const close = () => { overlay.remove(); if (onClose) onClose(); };
    overlay.querySelector('#ggm-close').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    const sel = overlay.querySelector('#ggm-mod-select');
    const renderModule = () => {
        const mod  = parseInt(sel.value, 10);
        const body = overlay.querySelector('#ggm-body');
        // Project Check-in used to also live here, but it's redundant with —
        // and was actually out of sync with — the dedicated Project Grades
        // tab, which is the single source of truth for the one shared
        // project grade now. This popup only handles per-module grading.
        body.innerHTML = renderGradeModuleTable(students, grades, mod);
        attachModuleEvents(body, offeredId, grades);
    };
    sel.addEventListener('change', renderModule);
    renderModule();
}

function renderGradeModuleTable(students, grades, mod) {
    const rows = students.map((st, i) => {
        const sid = st.user_student_id;
        const mg  = grades[sid]?.[mod] || {};
        return `<tr data-stu="${sid}">
            <td class="td-rank">${i + 1}</td>
            <td class="td-id">${esc(st.student_id || '—')}</td>
            <td class="td-name">${esc(st.name)}</td>
            <td class="td-num td-soc-cell">${socSel('soc1', sid, mod, mg.soc1 ?? '')}</td>
            <td class="td-num td-soc-cell">${socSel('soc2', sid, mod, mg.soc2 ?? '')}</td>
            <td class="td-num">${rubricSel('lets_practice',          sid, mod, mg.lets_practice          ?? '')}</td>
            <td class="td-num">${rubricSel('lets_practice_optional', sid, mod, mg.lets_practice_optional ?? '')}</td>
            <td class="td-num">${rubricSel('reflection',             sid, mod, mg.reflection             ?? '')}</td>
            <td class="td-num">${wuqSel(   'wrap_up_quiz',           sid, mod, mg.wrap_up_quiz           ?? '')}</td>
        </tr>`;
    }).join('');

    return `
    <div class="gc-cur-wrap">
        <div class="gc-cur-label">MODULE ${mod} — GRADING</div>
        <div class="gb-table-scroll">
            <table class="gc-cur-table ggm-table">
                <thead>
                    <tr>
                        <th rowspan="2">#</th>
                        <th rowspan="2" class="th-left">Student ID</th>
                        <th rowspan="2" class="gc-th-info th-left">Name</th>
                        <th colspan="2" class="gb-group-th gb-group-th--soc">Start of Class (5%)</th>
                        <th colspan="3" class="gb-group-th gb-group-th--el">Effortful Learning</th>
                        <th colspan="1" class="gb-group-th gb-group-th--mastery">Mastery (15%)</th>
                    </tr>
                    <tr>
                        <th class="gb-item-th">SOC 1</th>
                        <th class="gb-item-th">SOC 2</th>
                        <th class="gb-item-th">LP (35%)</th>
                        <th class="gb-item-th">LP Opt</th>
                        <th class="gb-item-th">Refl (15%)</th>
                        <th class="gb-item-th">WUQ (15%)</th>
                    </tr>
                </thead>
                <tbody>${rows || '<tr><td colspan="9" class="gc-cur-empty">No students enrolled.</td></tr>'}</tbody>
            </table>
        </div>
    </div>`;
}

function gradeModalCss() {
    return `
    #ggb-grade-overlay { position:fixed; inset:0; background:rgba(0,0,0,.45); z-index:9999;
        display:flex; align-items:center; justify-content:center; padding:20px; }
    .ggm-modal { background:#fff; border-radius:16px; width:100%; max-width:920px; max-height:88vh;
        display:flex; flex-direction:column; box-shadow:0 20px 60px rgba(0,0,0,.3); overflow:hidden; }
    .ggm-hdr { display:flex; align-items:center; justify-content:space-between; padding:18px 22px;
        border-bottom:1px solid ${BORDER}; background:${GL}; }
    .ggm-hdr h3 { margin:0; font-size:16px; font-weight:800; color:${G}; letter-spacing:.5px; }
    .ggm-sub { margin:2px 0 0; font-size:12px; color:#4b7a5a; max-width:560px; }
    .ggm-close { background:none; border:none; font-size:16px; cursor:pointer; color:#6b7280; padding:4px 8px; }
    .ggm-close:hover { color:#111; }
    .ggm-toolbar { display:flex; align-items:center; gap:10px; padding:14px 22px; border-bottom:1px solid ${BORDER}; }
    .ggm-toolbar label { font-size:12px; font-weight:700; color:${G}; }
    .ggm-toolbar select { padding:7px 12px; border:1.5px solid ${BORDER}; border-radius:8px; font-size:13px; font-family:inherit; }
    .ggm-body { padding:16px 22px 22px; overflow-y:auto; }
    `;
}

// ── Project tab ────────────────────────────────────────────────────────────
// ONE project for the whole term — not three separate per-period projects.
// Check-ins are spread across the term (P1's, P2's, and two during the
// Final period — P3.1 required, P3.2 optional) but all feed into a single
// Check-in Average, a single Final Output/Presentation Grade, and a single
// Project Overall Grade, matching the reference SAS spreadsheet exactly.

const PROJECT_CHECKIN_LABELS = ['P1 Check-in Grade', 'P2 Check-in Grade', 'P3.1 Check-in Grade', 'P3.2 Check-in Grade'];

function renderProjectTable(students, project, subjectCode = '', sectionName = '') {
    const rows = students.map((st, i) => {
        const sid = st.user_student_id;
        const pg  = project[sid] || {};
        const checkins = [pg.checkin1 ?? null, pg.checkin2 ?? null, pg.checkin3 ?? null, pg.checkin4 ?? null];
        const avg     = checkinAverage(checkins);
        const overall = projectOverallGrade(checkins, pg.final_output ?? null);
        return `<tr data-stu="${sid}">
            <td class="td-rank">${i + 1}</td>
            <td class="td-id">${esc(st.student_id || '—')}</td>
            <td class="td-name">${esc(st.name)}</td>
            <td class="td-num">${projInput(sid, 'checkin1',     pg.checkin1)}</td>
            <td class="td-num">${projInput(sid, 'checkin2',     pg.checkin2)}</td>
            <td class="td-num">${projInput(sid, 'checkin3',     pg.checkin3)}</td>
            <td class="td-num">${projInput(sid, 'checkin4',     pg.checkin4)}</td>
            <td class="td-num td-computed" data-proj-avg="${sid}">${fmt(avg)}</td>
            <td class="td-num">${projInput(sid, 'final_output', pg.final_output)}</td>
            <td class="td-num td-proj-overall${overall !== null && overall < 80 ? ' td-low' : ''}" data-proj-overall="${sid}">${fmt(overall)}</td>
        </tr>`;
    }).join('');

    const label = subjectCode && sectionName ? `PROJECT GRADES — ${subjectCode} / ${sectionName}` : 'PROJECT GRADES';

    return `
    <div class="gc-cur-wrap">
        <div class="gc-cur-label">${esc(label)}</div>
        <div class="gb-table-scroll">
            <table class="gc-cur-table ggb-proj-table">
                <thead>
                    <tr>
                        <th rowspan="3">#</th>
                        <th rowspan="3" class="th-left">Student ID</th>
                        <th rowspan="3" class="gc-th-info th-left">Name</th>
                        <th colspan="7" class="gb-period-th">Final Project/Output/Task (30%)</th>
                    </tr>
                    <tr>
                        <th colspan="4" class="gb-weight-th">Check-in Grades (minimum of 1, max of 4)</th>
                        <th class="gb-weight-th">65%</th>
                        <th class="gb-weight-th">35%</th>
                        <th class="gb-weight-th gb-weight-th--note">*if there's only one check-in, weightage becomes 50-50</th>
                    </tr>
                    <tr>
                        ${PROJECT_CHECKIN_LABELS.map(lbl => `<th class="gb-group-th gb-group-th--el"><span class="gb-item-type activity">CI</span><span class="gb-item-name">${lbl}</span></th>`).join('')}
                        <th class="gb-group-th gb-group-th--el"><span class="gb-item-type quiz">Avg</span><span class="gb-item-name">Check-in Grades Average</span></th>
                        <th class="gb-group-th gb-group-th--mastery"><span class="gb-item-type quiz">Final</span><span class="gb-item-name">Final Output/Presentation Grade</span></th>
                        <th class="gb-group-th gb-group-th--mastery"><span class="gb-item-type quiz">Overall</span><span class="gb-item-name">Project Overall Grade</span></th>
                    </tr>
                </thead>
                <tbody>${rows || '<tr><td colspan="10" class="gc-cur-empty">No students enrolled.</td></tr>'}</tbody>
            </table>
        </div>
    </div>
    <p class="ggb-proj-note">One project for the whole term. Check-in Grades (minimum of 1, max of 4) + Final Output/Presentation Grade (0–100).
        Project Overall Grade = Check-in Grades Average × 65% + Final Output/Presentation Grade × 35%
        (50/50 if there's only one check-in). This same grade is shared by every period's Mastery calculation.</p>`;
}

function projInput(sid, field, val) {
    const display = (val === null || val === undefined) ? '' : String(val);
    return `<input type="number" class="ggb-num-input" min="0" max="100" step="0.01"
        data-sid="${sid}" data-field="${field}"
        value="${esc(display)}" placeholder="—">`;
}

function attachProjectEvents(area, offeredId, project) {
    area.querySelectorAll('.ggb-num-input').forEach(inp => {
        inp.addEventListener('change', async () => {
            const sid   = parseInt(inp.dataset.sid, 10);
            const field = inp.dataset.field;
            const value = inp.value !== '' ? parseFloat(inp.value) : null;

            if (!project[sid]) project[sid] = {};
            project[sid][field] = value;

            focusNextRowDown(area, inp);

            const pg       = project[sid];
            const checkins = [pg.checkin1 ?? null, pg.checkin2 ?? null, pg.checkin3 ?? null, pg.checkin4 ?? null];
            const avg      = checkinAverage(checkins);
            const overall  = projectOverallGrade(checkins, pg.final_output ?? null);

            const avgCell = area.querySelector(`[data-proj-avg="${sid}"]`);
            if (avgCell) avgCell.textContent = fmt(avg);

            const cell = area.querySelector(`[data-proj-overall="${sid}"]`);
            if (cell) {
                cell.textContent = fmt(overall);
                cell.className   = `td-num td-proj-overall td-computed${overall !== null && overall < 80 ? ' td-low' : ''}`;
            }

            try {
                const res = await Api.post('/GlobalGradebookAPI.php?action=save-project', {
                    subject_offered_id: parseInt(offeredId, 10),
                    student_id: sid, field, value,
                });
                if (!res?.success) {
                    showSaveError(inp.closest('tr'), res?.message || 'Save failed');
                }
            } catch (err) {
                showSaveError(inp.closest('tr'), 'Network error — grade not saved');
                console.error('save-project:', err);
            }
        });
    });
}

// ── Summary table ─────────────────────────────────────────────────────────

function renderSummaryTable(students, grades, project, subjectCode = '', sectionName = '') {
    const rows = students.map((st, i) => {
        const sid = st.user_student_id;
        const { p1, p2, final, masteryStatus, remarks } = computeStudentGrades(sid, grades, project);
        const passClass = remarks === 'Passed' ? 'gc-cur-badge-pass' : remarks?.startsWith('INC') ? 'gc-cur-badge-fail' : 'gc-cur-badge-none';
        return `<tr>
            <td class="td-rank">${i + 1}</td>
            <td class="td-id">${esc(st.student_id || '—')}</td>
            <td class="td-name">${esc(st.name)}</td>
            <td class="td-num${p1.el    !== null && p1.el    < 60 ? ' td-low' : ''}">${fmt(p1.el)}</td>
            <td class="td-num${p1.mastery!==null && p1.mastery<80 ? ' td-low' : ''}">${fmt(p1.mastery)}</td>
            <td class="td-num td-grade${p1.grade!==null && p1.grade<75 ? ' td-low' : ''}">${fmt(p1.grade)}</td>
            <td class="td-num${p2.el    !== null && p2.el    < 60 ? ' td-low' : ''}">${fmt(p2.el)}</td>
            <td class="td-num${p2.mastery!==null && p2.mastery<80 ? ' td-low' : ''}">${fmt(p2.mastery)}</td>
            <td class="td-num td-grade${p2.grade!==null && p2.grade<75 ? ' td-low' : ''}">${fmt(p2.grade)}</td>
            <td class="td-num${final.el  !== null && final.el  < 60 ? ' td-low' : ''}">${fmt(final.el)}</td>
            <td class="td-num${final.mastery!==null&&final.mastery<80?' td-low':''}">${fmt(final.mastery)}</td>
            <td class="td-num td-grade${final.grade!==null&&final.grade<75?' td-low':''}">${fmt(final.grade)}</td>
            <td class="td-num">${masteryStatus
                ? `<span class="ggb-mastery-badge ${masteryStatus === 'Met Mastery' ? 'met' : 'retry'}">${esc(masteryStatus)}</span>`
                : '—'}</td>
            <td class="td-num ${passClass}">${remarks
                ? `<span class="ggb-remark-badge">${esc(remarks)}</span>`
                : '—'}</td>
        </tr>`;
    }).join('');

    const label = subjectCode && sectionName ? `SUMMARY & REMARKS — ${subjectCode} / ${sectionName}` : 'SUMMARY & REMARKS';

    return `
    <div class="gc-cur-wrap">
        <div class="gc-cur-label">${esc(label)}</div>
        <div class="gb-table-scroll">
            <table class="gc-cur-table ggb-summary-table">
                <thead>
                    <tr>
                        <th rowspan="2">#</th>
                        <th rowspan="2" class="th-left">Student ID</th>
                        <th rowspan="2" class="gc-th-info th-left">Name</th>
                        <th colspan="3" class="gb-period-th">Period 1 — Modules 1–4</th>
                        <th colspan="3" class="gb-period-th gb-period-th--p2">Period 2 — Modules 1–9</th>
                        <th colspan="3" class="gb-period-th gb-period-th--p3">Final — Modules 1–14</th>
                        <th rowspan="2" class="gb-item-th">Mastery Status</th>
                        <th rowspan="2" class="gb-item-th">Remarks</th>
                    </tr>
                    <tr>
                        <th class="gb-group-th gb-group-th--el"><span class="gb-item-type quiz">EL (55%)</span><span class="gb-item-name">Effortful<br>Learning</span></th>
                        <th class="gb-group-th gb-group-th--mastery"><span class="gb-item-type quiz">Mastery (45%)</span><span class="gb-item-name">WUQ +<br>Project</span></th>
                        <th class="gb-group-th gb-group-th--soc"><span class="gb-item-type quiz">Grade</span><span class="gb-item-name">P1 Final</span></th>
                        <th class="gb-group-th gb-group-th--el"><span class="gb-item-type quiz">EL (55%)</span><span class="gb-item-name">Effortful<br>Learning</span></th>
                        <th class="gb-group-th gb-group-th--mastery"><span class="gb-item-type quiz">Mastery (45%)</span><span class="gb-item-name">WUQ +<br>Project</span></th>
                        <th class="gb-group-th gb-group-th--soc"><span class="gb-item-type quiz">Grade</span><span class="gb-item-name">P2 Final</span></th>
                        <th class="gb-group-th gb-group-th--el"><span class="gb-item-type quiz">EL (55%)</span><span class="gb-item-name">Effortful<br>Learning</span></th>
                        <th class="gb-group-th gb-group-th--mastery"><span class="gb-item-type quiz">Mastery (45%)</span><span class="gb-item-name">WUQ +<br>Project</span></th>
                        <th class="gb-group-th gb-group-th--soc"><span class="gb-item-type quiz">Grade</span><span class="gb-item-name">Final<br>Grade</span></th>
                    </tr>
                </thead>
                <tbody>${rows || '<tr><td colspan="14" class="gc-cur-empty">No students enrolled.</td></tr>'}</tbody>
            </table>
        </div>
    </div>
    <p class="ggb-proj-note">EL = Effortful Learning (SOC 5% + LP 35% + Reflection 15%). Mastery = WUQ 15% + Project 30%. Grade = EL × 55% + Mastery × 45%. Mastery threshold: 80.</p>`;
}

export function computeStudentGrades(sid, grades, project) {
    const report = computeStudentReport({
        getModuleInput: (m) => {
            const mg = grades[sid]?.[m] || {};
            return {
                soc1: mg.soc1 ?? null,
                soc2: mg.soc2 ?? null,
                letsPractice: mg.lets_practice ?? null,
                letsPracticeOptional: mg.lets_practice_optional ?? null,
                reflection: mg.reflection ?? null,
                wrapUpQuiz: mg.wrap_up_quiz ?? null,
            };
        },
        // One shared project for the whole term (not one per period) —
        // every period's Mastery calc reads the same values here.
        getPeriodProject: () => {
            const pg = project[sid] || {};
            return {
                checkins: [pg.checkin1 ?? null, pg.checkin2 ?? null, pg.checkin3 ?? null, pg.checkin4 ?? null],
                finalOutput: pg.final_output ?? null,
            };
        },
    });

    const toLegacy = (p) => ({
        el: report.periods[p].effortfulLearningGrade,
        mastery: report.periods[p].masteryGrade,
        grade: report.periods[p].periodGrade,
    });

    return {
        p1: toLegacy('P1'),
        p2: toLegacy('P2'),
        final: toLegacy('Final'),
        masteryStatus: report.masteryStatus,
        remarks: report.remarks,
    };
}

// ── For SIS Table ─────────────────────────────────────────────────────────
// Columns match the exact SIS submission format agreed on for the CSV
// export (see exportSisCsvs()): CS (Effortful) / PE (Mastery) broken out for
// each of P1, P2, P3, instead of the single blended period grade the old
// version of this table showed. Student ID/Name only — the Gender, Course,
// Campus, Section, Semester columns are exported-file-only (see
// exportSisCsvs()), not shown on this on-screen table.

function renderSisTable(students, grades, project, subject, section) {
    const subjectCode = subject?.subject_code || '';
    const sectionName = section?.section_name || '';
    const label = subjectCode && sectionName ? `FOR SIS — ${subjectCode} / ${sectionName}` : 'FOR SIS';
    const low = v => v !== null && v < 80 ? ' td-low' : '';

    const rows = students.map((st, i) => {
        const sid = st.user_student_id;
        const { p1, p2, final } = computeStudentGrades(sid, grades, project);
        return `<tr data-stu="${sid}">
            <td class="td-rank">${i + 1}</td>
            <td class="td-id">${esc(st.student_id || '—')}</td>
            <td class="td-name">${esc(st.name)}</td>
            <td class="td-num td-grade${low(p1.el)}">${fmt(p1.el)}</td>
            <td class="td-num td-grade">${fmt(p1.mastery)}</td>
            <td class="td-num td-grade${low(p2.el)}">${fmt(p2.el)}</td>
            <td class="td-num td-grade">${fmt(p2.mastery)}</td>
            <td class="td-num td-grade${low(final.el)}">${fmt(final.el)}</td>
            <td class="td-num td-grade ggb-sis-final">${fmt(final.mastery)}</td>
        </tr>`;
    }).join('');

    return `
    <div class="gc-cur-wrap">
        <div class="gc-cur-label">${esc(label)}</div>
        <div class="gb-table-scroll">
            <table class="gc-cur-table ggb-sis-table">
                <thead>
                    <tr>
                        <th rowspan="2">#</th>
                        <th rowspan="2" class="th-left">Student ID</th>
                        <th rowspan="2" class="gc-th-info th-left">Student Name</th>
                        <th colspan="2" class="gb-period-th">P1</th>
                        <th colspan="2" class="gb-period-th gb-period-th--p2">P2</th>
                        <th colspan="2" class="gb-period-th gb-period-th--p3 ggb-sis-th-final">P3 — Final</th>
                    </tr>
                    <tr>
                        <th class="gb-group-th gb-group-th--el">CS</th>
                        <th class="gb-group-th gb-group-th--mastery">PE</th>
                        <th class="gb-group-th gb-group-th--el">CS</th>
                        <th class="gb-group-th gb-group-th--mastery">PE</th>
                        <th class="gb-group-th gb-group-th--el">CS</th>
                        <th class="gb-group-th gb-group-th--mastery">PE</th>
                    </tr>
                </thead>
                <tbody>${rows || '<tr><td colspan="9" class="gc-cur-empty">No students enrolled.</td></tr>'}</tbody>
            </table>
        </div>
    </div>
    <p class="ggb-proj-note">CS = Effortful Learning grade, PE = Mastery grade, for each period. Low Effortful grades (below 80) are highlighted; low Mastery values are the shared project grade and aren't flagged here individually.</p>`;
}

// ── Students for Retry Table ──────────────────────────────────────────────
// Shows only INC students. Editable fields: Modules, Activities, Schedule, Status, Notes.

const RETRY_STATUS_OPTS = ['', 'Ongoing', 'Completed', 'Not Yet Started'];
const RETRY_REMARK_MAP = {
    'INC - Retry Mastery':               { label: 'Mastery Retry',          cls: 'ggb-retry-mastery' },
    'INC - Retry Effortful':             { label: 'Effortful Learning Pack', cls: 'ggb-retry-el'      },
    'INC - Retry Effortful and Mastery': { label: 'Both Mastery and EL',    cls: 'ggb-retry-both'    },
};

function renderRetriesTable(students, grades, project, retries, subjectCode = '', sectionName = '') {
    const label = subjectCode && sectionName ? `STUDENTS FOR RETRY — ${subjectCode} / ${sectionName}` : 'STUDENTS FOR RETRY';

    const incStudents = students.filter(st => {
        const { remarks } = computeStudentGrades(st.user_student_id, grades, project);
        return remarks && remarks.startsWith('INC');
    });

    const rows = incStudents.map((st, i) => {
        const sid = st.user_student_id;
        const { remarks } = computeStudentGrades(sid, grades, project);
        const map = RETRY_REMARK_MAP[remarks] || { label: remarks, cls: '' };
        const r = retries[sid] || {};
        const statusSel = RETRY_STATUS_OPTS.map(s =>
            `<option value="${s}" ${(r.status || '') === s ? 'selected' : ''}>${s || '—'}</option>`
        ).join('');
        return `<tr data-stu="${sid}">
            <td class="td-rank">${i + 1}</td>
            <td class="td-id">${esc(st.student_id || '—')}</td>
            <td class="td-name">${esc(st.name)}</td>
            <td class="td-num"><span class="ggb-retry-badge ${map.cls}">${esc(map.label)}</span></td>
            <td class="td-num"><input class="ggb-retry-inp" data-field="modules_for_retry" data-sid="${sid}" value="${esc(r.modules_for_retry || '')}" placeholder="e.g. 1, 2 and 3"></td>
            <td class="td-num"><input class="ggb-retry-inp" data-field="specific_activities" data-sid="${sid}" value="${esc(r.specific_activities || '')}" placeholder="e.g. Wrap Up Quizzes"></td>
            <td class="td-num"><input class="ggb-retry-inp" data-field="schedule_of_retry" data-sid="${sid}" value="${esc(r.schedule_of_retry || '')}" placeholder="e.g. April 6, whole day"></td>
            <td class="td-num"><select class="ggb-sel ggb-retry-status" data-field="status" data-sid="${sid}">${statusSel}</select></td>
            <td class="td-num"><input class="ggb-retry-inp ggb-retry-notes" data-field="notes" data-sid="${sid}" value="${esc(r.notes || '')}" placeholder="Additional notes…"></td>
        </tr>`;
    }).join('');

    const empty = incStudents.length === 0
        ? '<tr><td colspan="9" class="gc-cur-empty">No students with INC remarks — all passed or no grades entered yet.</td></tr>'
        : '';

    return `
    <div class="gc-cur-wrap">
        <div class="gc-cur-label">${esc(label)}</div>
        <p class="ggb-proj-note" style="margin-bottom:10px;">Showing <strong>${incStudents.length}</strong> student${incStudents.length !== 1 ? 's' : ''} with INC remarks. Fields auto-save on change.</p>
        <div class="gb-table-scroll">
            <table class="gc-cur-table ggb-retries-table">
                <thead>
                    <tr>
                        <th>#</th>
                        <th class="th-left">Student Number</th>
                        <th class="gc-th-info th-left">Name of Student</th>
                        <th class="gb-item-th">Remarks</th>
                        <th class="gb-item-th">Modules with<br>Components for Retry</th>
                        <th class="gb-item-th">Specific Activities</th>
                        <th class="gb-item-th">Schedule of Retry</th>
                        <th class="gb-item-th">Status</th>
                        <th class="gb-item-th">Remarks / Notes</th>
                    </tr>
                </thead>
                <tbody>${rows || empty}</tbody>
            </table>
        </div>
    </div>`;
}

function attachRetriesEvents(area, offeredId, retries) {
    const save = async (sid, field, value) => {
        if (!retries[sid]) retries[sid] = {};
        retries[sid][field] = value;
        await Api.post('/GlobalGradebookAPI.php?action=save-retry', {
            subject_offered_id: parseInt(offeredId, 10),
            student_id: sid, field, value,
        }).catch(err => console.error('save-retry:', err));
    };
    area.querySelectorAll('.ggb-retry-inp').forEach(inp => {
        inp.addEventListener('change', () => {
            save(parseInt(inp.dataset.sid, 10), inp.dataset.field, inp.value);
            focusNextRowDown(area, inp);
        });
    });
    area.querySelectorAll('.ggb-retry-status').forEach(sel => {
        sel.addEventListener('change', () => {
            save(parseInt(sel.dataset.sid, 10), sel.dataset.field, sel.value);
            focusNextRowDown(area, sel);
        });
    });
}

/** "2026-2027" + "First Semester" -> "SY26-27SEMI" (SEM + roman numeral). */
function schoolYearSemCode(academicYear, semesterName) {
    const yrs = String(academicYear || '').split(/[^0-9]+/).filter(Boolean).map(y => y.slice(-2));
    const yy  = yrs.length >= 2 ? `${yrs[0]}-${yrs[1]}` : (yrs[0] || '');
    const sem = /first|1st/i.test(semesterName)  ? 'I'
              : /second|2nd/i.test(semesterName) ? 'II'
              : /sum/i.test(semesterName)        ? 'III' : 'I';
    return `SY${yy}SEM${sem}`;
}

/**
 * SIS submission format — one file per grading period per score type:
 *   {SY+SEM code}-{DEPARTMENT}-{PERIOD}-{CS|PE}.csv
 *   e.g. SY26-27SEMI-CIT-P1-CS.csv, SY26-27SEMI-CIT-P1-PE.csv
 * CS = Effortful Learning grade, PE = Mastery grade, for that period — NOT
 * the single blended period grade the regular Export button produces.
 * Six files total (P1/P2/P3 × CS/PE), all downloaded from one click.
 *
 * Gender is left blank in every row on purpose — there's no gender column
 * anywhere in this system's users table, so it genuinely isn't tracked
 * data, not an oversight. Leave the column so the file still matches the
 * expected header shape, and fill it in manually if the SIS import needs it.
 */
async function exportSisCsvs(subject, section, students, grades, project) {
    const semRes     = await Api.get('/SubjectOfferingsAPI.php?action=semesters');
    const semesters   = semRes.success ? (semRes.data || []) : [];
    const activeSem   = semesters.find(s => s.status === 'active') || semesters[0] || {};
    const syCode      = schoolYearSemCode(activeSem.academic_year, activeSem.semester_name);
    const deptCode    = students.find(s => s.department_code)?.department_code || subject.program_code || 'DEPT';

    const HEADERS = ['Student ID', 'Student Name', 'Gender', 'Course', 'Campus', 'Section', 'Semester', 'Obtained'];
    // Effortful is always "CS" and Mastery is always "PE", the same for
    // every period — P1, P2, and P3/Final all use the same two suffixes.
    const PERIODS = [
        { key: 'p1',    label: 'P1', masterySuffix: 'PE' },
        { key: 'p2',    label: 'P2', masterySuffix: 'PE' },
        { key: 'final', label: 'P3', masterySuffix: 'PE' },
    ];

    function buildRows(periodKey, field) {
        return students.map(st => {
            const g   = computeStudentGrades(st.user_student_id, grades, project);
            const val = g[periodKey]?.[field];
            return [
                st.student_id || '',
                st.name || '',
                '',
                st.program_code || subject.program_code || '',
                st.campus_name || '',
                section.section_name || '',
                activeSem.semester_name || '',
                fmt(val),
            ];
        });
    }

    function downloadCsv(filename, rows) {
        const csv  = [HEADERS, ...rows].map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    for (const p of PERIODS) {
        downloadCsv(`${syCode}-${deptCode}-${p.label}-CS.csv`, buildRows(p.key, 'el'));
        downloadCsv(`${syCode}-${deptCode}-${p.label}-${p.masterySuffix}.csv`, buildRows(p.key, 'mastery'));
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────

function emptyBox(msg) {
    return `<div class="ggb-empty">
        <div class="ggb-empty-icon">
            <svg width="48" height="48" fill="none" viewBox="0 0 24 24" stroke="#d1d5db" stroke-width="1.2">
                <path stroke-linecap="round" stroke-linejoin="round"
                      d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
        </div>
        <p>${esc(msg)}</p>
    </div>`;
}

// ── Global-specific table CSS (supplements shared curriculumTableCss / gradingPeriodTableCss) ──

function guideModalHtml() {
    return `
    <div class="ggb-guide-overlay" id="ggb-guide-overlay" hidden>
        <div class="ggb-guide-modal" role="dialog" aria-label="Grading Guide">

            <div class="ggb-guide-hdr">
                <div>
                    <h3 class="ggb-guide-title">Grading Guide</h3>
                    <p class="ggb-guide-sub">EL / Mastery Model &middot; 14 Modules</p>
                </div>
                <button class="ggb-guide-close" id="ggb-guide-close" aria-label="Close">&#x2715;</button>
            </div>

            <div class="ggb-guide-tabs">
                <button class="ggb-gtab active" data-gtab="overview">Overview</button>
                <button class="ggb-gtab" data-gtab="lp">Let&rsquo;s Practice</button>
                <button class="ggb-gtab" data-gtab="refl">Reflection</button>
            </div>

            <!-- ── Overview (compact landscape 2-col) ── -->
            <div class="ggb-guide-body ggb-ov-body" id="ggb-gtab-overview">
                <div class="ggb-ov-grid">

                    <!-- LEFT: Rubric · SOC · Formulas -->
                    <div class="ggb-ov-col">
                        <div class="ggb-ov-sec">
                            <div class="ggb-ov-sh">Rubric <span class="ggb-ov-dim">LP &middot; LP Opt &middot; Reflection</span></div>
                            <div class="ggb-ov-rub-strip">
                                <div class="ggb-ov-rub ggb-rub-0"><strong>0</strong><span>0%</span><span class="ggb-ov-dim">No Effort</span></div>
                                <div class="ggb-ov-rub ggb-rub-1"><strong>1</strong><span>60%</span><span class="ggb-ov-dim">Little</span></div>
                                <div class="ggb-ov-rub ggb-rub-2"><strong>2</strong><span>80%</span><span class="ggb-ov-dim">Good</span></div>
                                <div class="ggb-ov-rub ggb-rub-3"><strong>3</strong><span>100%</span><span class="ggb-ov-dim">Stronger</span></div>
                            </div>
                        </div>
                        <div class="ggb-ov-sec">
                            <div class="ggb-ov-sh">SOC</div>
                            <div class="ggb-ov-soc-line">
                                <span class="ggb-soc-p">P = Present</span>
                                <span class="ggb-soc-a">A = Absent</span>
                                <span class="ggb-ov-dim">Grade = (# P &divide; # entries) &times; 100%</span>
                            </div>
                        </div>
                        <div class="ggb-ov-sec" style="flex:1">
                            <div class="ggb-ov-sh">Formulas</div>
                            <div class="ggb-ov-flist">
                                <div class="ggb-ov-f ggb-f-el">
                                    <span class="ggb-ov-flabel">EL</span>
                                    <span>SOC <em>5%</em> + LP <em>35%</em> + Refl <em>15%</em></span>
                                </div>
                                <div class="ggb-ov-f ggb-f-mastery">
                                    <span class="ggb-ov-flabel">Mastery</span>
                                    <span>WUQ <em>15%</em> + Project <em>30%</em></span>
                                </div>
                                <div class="ggb-ov-f ggb-f-proj">
                                    <span class="ggb-ov-flabel">Project</span>
                                    <span>CI Avg &times; <em>65%</em> + Final &times; <em>35%</em></span>
                                </div>
                                <div class="ggb-ov-f ggb-f-final">
                                    <span class="ggb-ov-flabel">Final</span>
                                    <span>EL &times; <em>55%</em> + Mastery &times; <em>45%</em></span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- RIGHT: WUQ · Periods · Thresholds -->
                    <div class="ggb-ov-col">
                        <div class="ggb-ov-sec">
                            <div class="ggb-ov-sh">Wrap Up Quiz <span class="ggb-ov-dim">7-question scale</span></div>
                            <table class="ggb-guide-table">
                                <thead><tr><th>Correct</th><th>Score</th><th>Correct</th><th>Score</th></tr></thead>
                                <tbody>
                                    <tr><td>7 / 7</td><td class="ggb-td-pct">100%</td><td>3 / 7</td><td class="ggb-td-pct">42.86%</td></tr>
                                    <tr><td>6 / 7</td><td class="ggb-td-pct">85.71%</td><td>2 / 7</td><td class="ggb-td-pct">28.57%</td></tr>
                                    <tr><td>5 / 7</td><td class="ggb-td-pct">71.43%</td><td>1 / 7</td><td class="ggb-td-pct">14.29%</td></tr>
                                    <tr><td>4 / 7</td><td class="ggb-td-pct">57.14%</td><td>0 / 7</td><td class="ggb-td-pct">0%</td></tr>
                                </tbody>
                            </table>
                        </div>
                        <div class="ggb-ov-sec">
                            <div class="ggb-ov-sh">Periods <span class="ggb-ov-dim">cumulative</span></div>
                            <div class="ggb-period-row">
                                <div class="ggb-p-card"><span class="ggb-p-name">P1</span><span class="ggb-p-mods">Mod 1&ndash;4</span></div>
                                <div class="ggb-p-card"><span class="ggb-p-name">P2</span><span class="ggb-p-mods">Mod 1&ndash;9</span></div>
                                <div class="ggb-p-card"><span class="ggb-p-name">Final</span><span class="ggb-p-mods">Mod 1&ndash;14</span></div>
                            </div>
                        </div>
                        <div class="ggb-ov-sec" style="flex:1;margin-bottom:0">
                            <div class="ggb-ov-sh">Remarks</div>
                            <div class="ggb-thresh-grid">
                                <div class="ggb-thresh-row ggb-thresh-pass"><span>Met Mastery <strong>and</strong> Final Grade &ge;80</span><span class="ggb-thresh-tag">Passed</span></div>
                                <div class="ggb-thresh-row ggb-thresh-inc"><span>Met Mastery, Final Grade &lt;80</span><span class="ggb-thresh-tag">INC &ndash; Retry Effortful</span></div>
                                <div class="ggb-thresh-row ggb-thresh-inc"><span>Retry Mastery, Final Grade &ge;80</span><span class="ggb-thresh-tag">INC &ndash; Retry Mastery</span></div>
                                <div class="ggb-thresh-row ggb-thresh-fail"><span>Retry Mastery, Final Grade &lt;80</span><span class="ggb-thresh-tag">INC &ndash; Retry Both</span></div>
                                <div class="ggb-ov-dim" style="margin-top:6px;">Mastery Status: Final Mastery grade &ge;80 &rarr; &ldquo;Met Mastery&rdquo;, else &ldquo;Retry Mastery components&rdquo;.</div>
                            </div>
                        </div>
                    </div>

                </div>
            </div>

            <!-- ── Let's Practice Rubric ── -->
            <div class="ggb-guide-body ggb-gtab-hidden" id="ggb-gtab-lp">
                <p class="ggb-doc-eyebrow">Let&rsquo;s Learn: How Assessment Design Impacts Learning</p>
                <h2 class="ggb-doc-title">0-3 Rubrics for Grading Let&rsquo;s Practice Tasks</h2>
                <div style="overflow-x:auto;">
                    <table class="ggb-rub-tbl">
                        <thead>
                            <tr>
                                <th class="ggb-rth-sc">Score</th>
                                <th class="ggb-rth-ef">Effort Level</th>
                                <th>Individual Work</th>
                                <th>Group Work <span class="ggb-th-sub">(3&ndash;5 students)</span></th>
                                <th>Submitted Task <span class="ggb-th-sub">(digital work, drafts, prototypes)</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td class="ggb-sc ggb-sc0"><strong>0</strong><span>(0%)</span></td>
                                <td class="ggb-ef ggb-ef0">No Effort</td>
                                <td>No visible attempt or engagement.</td>
                                <td>Leaves task blank; no work or explanation.</td>
                                <td>No file submitted, or blank/off-task file.</td>
                            </tr>
                            <tr>
                                <td class="ggb-sc ggb-sc1"><strong>1</strong><span>(60%)</span></td>
                                <td class="ggb-ef ggb-ef1">Little Effort</td>
                                <td>Minimal or superficial attempt.</td>
                                <td>Writes vague or incomplete answers.</td>
                                <td>Mostly copied; major parts of instructions missing.</td>
                            </tr>
                            <tr class="ggb-row-hl">
                                <td class="ggb-sc ggb-sc2"><strong>2</strong><span>(80%)</span></td>
                                <td class="ggb-ef ggb-ef2">Good Effort</td>
                                <td>Reasonable attempt with engagement, even with errors.</td>
                                <td>Attempts task; contributes ideas and records feedback.</td>
                                <td>Addresses most parts; visible thinking or process shown.</td>
                            </tr>
                            <tr>
                                <td class="ggb-sc ggb-sc3"><strong>3</strong><span>(100%)</span></td>
                                <td class="ggb-ef ggb-ef3">Stronger Effort</td>
                                <td>Shows revision, improvement, or deep engagement.</td>
                                <td>Leads ideas; builds on feedback; improves group output.</td>
                                <td>Clearly incorporates feedback; revised beyond first attempt.</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- ── Reflection Rubric ── -->
            <div class="ggb-guide-body ggb-gtab-hidden" id="ggb-gtab-refl">
                <p class="ggb-doc-eyebrow">Let&rsquo;s Learn: How Assessment Design Impacts Learning</p>
                <h2 class="ggb-doc-title">0-3 Rubrics for Grading Reflection</h2>
                <div style="overflow-x:auto;">
                    <table class="ggb-rub-tbl">
                        <thead>
                            <tr>
                                <th class="ggb-rth-sc">Score</th>
                                <th class="ggb-rth-ef">Effort Level</th>
                                <th>Description</th>
                                <th>Examples of Student Responses / Behaviors</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td class="ggb-sc ggb-sc0"><strong>0</strong><span>(0%)</span></td>
                                <td class="ggb-ef ggb-ef0">No Effort</td>
                                <td>No response or off-topic.</td>
                                <td>Blank, off-topic, or &ldquo;I don&rsquo;t know.&rdquo;</td>
                            </tr>
                            <tr>
                                <td class="ggb-sc ggb-sc1"><strong>1</strong><span>(60%)</span></td>
                                <td class="ggb-ef ggb-ef1">Little Effort</td>
                                <td>Minimal or vague response; generic statement.</td>
                                <td>&ldquo;It was hard.&rdquo; / &ldquo;We answered the questions.&rdquo;</td>
                            </tr>
                            <tr class="ggb-row-hl">
                                <td class="ggb-sc ggb-sc2"><strong>2</strong><span>(80%)</span></td>
                                <td class="ggb-ef ggb-ef2">Good Effort</td>
                                <td>Specific recall and explanation in own words.</td>
                                <td>&ldquo;I learned how to identify context clues&hellip;&rdquo;</td>
                            </tr>
                            <tr>
                                <td class="ggb-sc ggb-sc3"><strong>3</strong><span>(100%)</span></td>
                                <td class="ggb-ef ggb-ef3">Stronger Effort</td>
                                <td>Connects to prior knowledge or real-world use.</td>
                                <td>&ldquo;I realized context clues are like how we analyzed tone last week&hellip;&rdquo;</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

        </div>
    </div>`;
}

function tableCss() { return `
/* Scrollable table wrapper */
.gb-table-scroll { overflow-x:auto; }
/* Override curriculumTableCss's overflow:hidden — clip doesn't create a scroll
   context, so the frozen Name column (see classroom-ui.js's curriculumTableCss,
   the shared source for this — .gc-th-info / .td-name) needs this wrapper
   left at overflow:visible so position:sticky reads against .gb-table-scroll
   instead of .gc-cur-wrap. */
.gc-cur-wrap { overflow:visible !important; }
.th-left { text-align:left !important; }

/* Group header row above the per-module quick-grade table's individual SOC/
   LP/Reflection/WUQ columns — each group gets its own distinct color instead
   of sharing the plain grey .gb-item-th look every sub-column already uses,
   so the three scoring groups (Start of Class, Effortful Learning, Mastery)
   are visually distinguishable from each other and from the columns beneath
   them at a glance. */
.gb-group-th {
    color:#fff !important; text-align:center !important;
    font-size:11px !important; font-weight:800 !important; letter-spacing:.3px;
}
.gb-group-th--soc      { background:#1D4ED8 !important; }
.gb-group-th--el       { background:#7C3AED !important; }
.gb-group-th--mastery  { background:#B45309 !important; }
/* .gb-item-type/.gb-item-name (see gradingPeriodTableCss() in
   gradebook-periods.js) each carry their own dark color meant for the
   plain grey .gb-item-th background — Project Grades' header row reuses
   those same spans inside colored .gb-group-th cells now, so without this
   override they'd render dark-on-purple/dark-on-amber, the same low-
   contrast mistake the P3 pink header had. Force white here too. */
.gb-group-th .gb-item-type, .gb-group-th .gb-item-name { color:#fff !important; }

/* Project Grades header text was overlapping between columns — the shared
   base rule for .gc-cur-table thead tr th sets white-space:nowrap (see
   classroom-ui.js) and has higher specificity than .gb-item-th, so it was
   silently winning and refusing to let long labels like "Check-in Grades
   Average" wrap inside their ~90px-wide column, spilling the un-wrapped
   text straight into the neighboring header cell instead. Re-declared here
   with matching specificity (.gc-cur-table + a class) so it actually wins. */
.gc-cur-table .gb-item-th { white-space:normal; line-height:1.25; }

/* Weight/explanation row — "Check-in Grades (min 1, max 4)" / 65% / 35% /
   the 50-50 footnote, matching the reference SAS spreadsheet's row above
   the column headers. */
.gc-cur-table .gb-weight-th {
    background:#FBEAEA; color:#7A1F1F; font-size:10px; font-weight:700;
    text-align:center; padding:6px 8px; white-space:normal; line-height:1.3;
}
.gc-cur-table .gb-weight-th--note { font-weight:600; font-style:italic; font-size:9.5px; }

/* Select inputs — appearance:none strips the OS/browser's own native control
   chrome (Windows in particular can paint an unstyled <select> with the
   user's system accent color, which can land anywhere from blue to pink/red
   depending on their theme — completely unrelated to any value the field
   actually holds, but easy to mistake for an error state). A custom chevron
   replaces the native dropdown arrow that appearance:none also removes. */
.ggb-sel {
    appearance:none; -webkit-appearance:none; -moz-appearance:none;
    padding:2px 16px 2px 4px; border:1px solid #d1d5db; border-radius:3px; font-size:10.5px;
    background:#fff; box-shadow:none; outline:none; cursor:pointer; width:100%;
    background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath fill='%236b7280' d='M2.5 4.5l3.5 3.5 3.5-3.5z'/%3E%3C/svg%3E");
    background-repeat:no-repeat; background-position:right 3px center; background-size:9px;
}
.ggb-sel:focus { outline:none; border-color:#00461B; box-shadow:0 0 0 2px rgba(0,70,27,.15); }

/* SOC 1 / SOC 2 attendance dropdowns — P (present) green, A (absent) red,
   colored the moment a value is picked (see socSel() for initial render and
   the change handler in attachModuleEvents() for live updates) so a glance
   down the column shows attendance at a glance instead of reading each "P"
   or "A" letter individually. Explicitly forced back to neutral white/grey
   when blank — no value picked yet is not the same as "Absent" and must
   never render red. */
select.ggb-soc:not(.ggb-soc-p):not(.ggb-soc-a) { background-color:#fff; border-color:#d1d5db; color:inherit; font-weight:400; }
select.ggb-soc.ggb-soc-p { background-color:${GL}; border-color:${G}; color:${G}; font-weight:700; }
select.ggb-soc.ggb-soc-a { background-color:#FEF2F2; border-color:#991B1B; color:#991B1B; font-weight:700; }

/* Excel-style fill handle on SOC cells — the small square only shows up on
   hover so it doesn't clutter every cell all the time; dragging it copies
   that cell's P/A value down through the rows below in the same column. */
.ggb-fillwrap { position:relative; display:block; }
.ggb-fill-handle {
    position:absolute; right:-1px; bottom:-1px; width:7px; height:7px;
    background:#00461B; border:1px solid #fff; cursor:crosshair;
    opacity:0; transition:opacity .1s; z-index:3;
}
.ggb-fillwrap:hover .ggb-fill-handle { opacity:1; }
.td-soc-cell.ggb-fill-preview {
    background:#E8F5EC !important; outline:1.5px dashed #00461B; outline-offset:-1px;
}
.ggb-wuq { min-width:64px; }
.ggb-num-input { width:62px; padding:3px 4px; border:1.5px solid #d1d5db; border-radius:4px;
    font-size:11px; text-align:center; font-family:inherit; }
.ggb-num-input:focus { outline:none; border-color:#00461B; }

/* Computed / grade cells — use table-qualified selector to beat shared .gc-cur-table .td-num */
/* Project Overall Grade — highlighted like the reference SAS spreadsheet's
   shaded "final answer" column, so it visually stands apart from the raw
   inputs that feed into it, instead of blending in as a plain number. */
.gc-cur-table .td-proj-overall { background:#E8F5EC !important; color:#00461B !important; font-weight:800; }
/* Check-in Grades Average — a computed, read-only value (not an input like
   its neighbors), so it gets a plain grey "this isn't editable" tint. */
.gc-cur-table .td-computed { background:#F3F4F6 !important; color:#374151; font-weight:700; }
.gc-cur-table .td-grade { background:#E8F5EC !important; color:#00461B !important; font-weight:800; }
.gc-cur-table .td-low   { color:#B91C1C !important; background:#FEF2F2 !important; }

/* Remarks cell pass/fail backgrounds */
.gc-cur-table td.gc-cur-badge-pass { background:#E8F5E9 !important; }
.gc-cur-table td.gc-cur-badge-fail { background:#FEF3C7 !important; }

/* Table min-widths */
.ggb-module-table { min-width:1400px; }
.ggb-proj-table   { min-width:700px;  }

/* Summary table: override shared gb-item-th max-width so labels don't bleed into adjacent cells */
.ggb-summary-table .gb-item-th {
    min-width:110px !important;
    max-width:none !important;
    white-space:normal !important;
    word-break:normal !important;
    overflow-wrap:break-word !important;
}
/* Mastery Status / Remarks columns need more room */
.ggb-summary-table .gb-item-th[rowspan] {
    min-width:120px !important;
}

/* Note below project / summary tables */
.ggb-proj-note { font-size:11.5px; color:#6B7280; margin:8px 0 0; padding:6px 10px;
    background:#F9FAFB; border:1px solid #E5E7EB; border-radius:8px; }

/* Summary badges */
.ggb-mastery-badge { display:inline-block; padding:3px 9px; border-radius:20px; font-size:10px; font-weight:700; white-space:nowrap; }
.ggb-mastery-badge.met   { background:#E8F5E9; color:#00461B; }
.ggb-mastery-badge.retry { background:#FEE2E2; color:#B91C1C; }
.ggb-remark-badge { display:inline-block; padding:3px 9px; border-radius:20px; font-size:10px; font-weight:700; white-space:nowrap; }
/* Parent is a td with the pass/fail class, child span gets the badge color */
td.gc-cur-badge-pass .ggb-remark-badge { background:#E8F5E9; color:#00461B; }
td.gc-cur-badge-fail .ggb-remark-badge { background:#FEF3C7; color:#92400E; }

/* ── SIS colour bands (sticky covered above) ── */
/* Was a light pink (#FCE7F3) fighting .gb-period-th's white text — nearly
   unreadable. Match the same dark-green "Final" shade every other period
   header in the gradebook already uses (.gb-period-th--p3) instead of a
   one-off color here, for both readability and consistency. */
.ggb-sis-th-final { background:#1B5E20 !important; }
.ggb-sis-final    { background:#FDF2F8; }
/* ── Retries table ── */
.ggb-retries-table { min-width:900px; }
.ggb-retry-badge { display:inline-block; padding:3px 9px; border-radius:20px; font-size:11px; font-weight:700; white-space:nowrap; }
.ggb-retry-mastery { background:#CFFAFE; color:#0E7490; }
.ggb-retry-el      { background:#FEF9C3; color:#854D0E; }
.ggb-retry-both    { background:#FECDD3; color:#9F1239; }
.ggb-retry-inp { width:100%; padding:4px 6px; border:1.5px solid #E5E7EB; border-radius:5px; font-size:11.5px; font-family:inherit; }
.ggb-retry-inp:focus { outline:none; border-color:${G}; }
.ggb-retry-notes { min-width:130px; }
.ggb-retry-status { width:100%; padding:3px 4px; border:1px solid #E5E7EB; border-radius:5px; font-size:11.5px; font-family:inherit; cursor:pointer; }
.ggb-row-err td { background:#FEF2F2 !important; }

/* ── Guide tabs ── */
.ggb-guide-tabs { display:flex; gap:0; padding:0 18px; border-bottom:1px solid #E5E7EB; flex-shrink:0; }
.ggb-gtab { padding:8px 14px; border:none; background:transparent; font-family:inherit;
    font-size:12px; font-weight:600; color:#9CA3AF; cursor:pointer;
    border-bottom:2px solid transparent; margin-bottom:-1px; white-space:nowrap; }
.ggb-gtab:hover { color:#374151; }
.ggb-gtab.active { color:${G}; border-bottom-color:${G}; }
.ggb-gtab-hidden { display:none !important; }
/* ── Compact rubric tables ── */
.ggb-doc-eyebrow { font-size:10.5px; color:#9CA3AF; font-style:italic; margin:0 0 3px; }
.ggb-doc-title { font-size:14px; font-weight:800; color:${G}; margin:0 0 10px; }
.ggb-rub-tbl { width:100%; border-collapse:collapse; font-size:11.5px; min-width:460px; }
.ggb-rub-tbl th { background:#F9FAFB; color:#374151; padding:6px 9px;
    font-size:10.5px; font-weight:700; text-align:left; vertical-align:top;
    border:1px solid #E5E7EB; }
.ggb-th-sub { display:block; font-weight:400; color:#9CA3AF; font-size:9.5px; }
.ggb-rth-sc { width:44px; text-align:center !important; }
.ggb-rth-ef { width:80px; }
.ggb-rub-tbl td { padding:6px 9px; vertical-align:top; border:1px solid #E5E7EB; line-height:1.45; color:#374151; }
.ggb-sc { text-align:center; white-space:nowrap; display:flex; flex-direction:column; align-items:center; gap:1px; }
.ggb-sc strong { font-size:15px; line-height:1; }
.ggb-sc span { font-size:9.5px; color:#9CA3AF; }
.ggb-sc0 strong { color:#991B1B; }
.ggb-sc1 strong { color:#92400E; }
.ggb-sc2 strong { color:#166534; }
.ggb-sc3 strong { color:${G}; }
.ggb-ef { font-weight:700; font-size:11px; white-space:nowrap; }
.ggb-ef0 { color:#991B1B; }
.ggb-ef1 { color:#92400E; }
.ggb-ef2 { color:#166534; }
.ggb-ef3 { color:${G}; }
.ggb-row-hl td { background:#FFFBEB; }

/* ── Guide button ── */
.ggb-guide-btn { display:inline-flex; align-items:center; gap:5px; padding:6px 10px;
    border-radius:8px; border:1.5px solid #E5E7EB; background:#fff; color:#374151;
    font-size:12px; font-weight:600; cursor:pointer; white-space:nowrap; }
.ggb-guide-btn:hover { border-color:${G}; color:${G}; background:${GL}; }

.ggb-grade-btn { display:inline-flex; align-items:center; gap:5px; padding:6px 12px;
    border-radius:8px; border:1.5px solid ${G}; background:${G}; color:#fff;
    font-size:12px; font-weight:700; cursor:pointer; letter-spacing:.3px; }
.ggb-grade-btn:hover { background:${G2}; border-color:${G2}; }

/* ── Grading Guide Modal ── */
.ggb-guide-overlay {
    position:fixed; inset:0; z-index:900;
    background:rgba(0,0,0,.45); display:flex;
    align-items:center; justify-content:center; padding:16px;
}
.ggb-guide-overlay[hidden] { display:none; }
.ggb-guide-modal {
    background:#fff; border-radius:14px;
    width:100%; max-width:760px;
    max-height:90vh; display:flex; flex-direction:column;
    box-shadow:0 20px 60px rgba(0,0,0,.25);
}
.ggb-guide-hdr {
    display:flex; justify-content:space-between; align-items:flex-start;
    padding:20px 22px 14px; border-bottom:1px solid #E5E7EB; flex-shrink:0;
}
.ggb-guide-title { font-size:17px; font-weight:800; color:#111; margin:0 0 3px; }
.ggb-guide-sub { font-size:12px; color:#6B7280; margin:0; }
.ggb-guide-close {
    width:28px; height:28px; border-radius:50%;
    border:none; background:#F3F4F6; color:#6B7280;
    font-size:14px; cursor:pointer; flex-shrink:0;
    display:flex; align-items:center; justify-content:center;
}
.ggb-guide-close:hover { background:#E5E7EB; color:#111; }
.ggb-guide-body { overflow-y:auto; padding:18px 22px 22px; flex:1; }
.ggb-guide-section { margin-bottom:18px; }
.ggb-guide-sh { font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:.6px; color:${G}; margin:0 0 6px; }
.ggb-guide-note { font-size:12px; color:#6B7280; margin:0 0 8px; }
/* Rubric */
.ggb-rubric-row { display:flex; gap:7px; }
.ggb-rubric-cell { flex:1; border-radius:8px; padding:9px 5px; text-align:center; border:1.5px solid; display:flex; flex-direction:column; gap:2px; }
.ggb-rub-0 { border-color:#FECACA; background:#FEF2F2; }
.ggb-rub-1 { border-color:#FDE68A; background:#FFFBEB; }
.ggb-rub-2 { border-color:#BBF7D0; background:#F0FDF4; }
.ggb-rub-3 { border-color:${GL}; background:${GL}; }
.ggb-rub-score { font-size:18px; font-weight:900; line-height:1; }
.ggb-rub-0 .ggb-rub-score { color:#991B1B; }
.ggb-rub-1 .ggb-rub-score { color:#92400E; }
.ggb-rub-2 .ggb-rub-score { color:#166534; }
.ggb-rub-3 .ggb-rub-score { color:${G}; }
.ggb-rub-pct { font-size:12px; font-weight:700; color:#374151; }
.ggb-rub-desc { font-size:10px; color:#9CA3AF; }
/* SOC */
.ggb-soc-row { display:flex; gap:10px; margin:6px 0; }
.ggb-soc-p { padding:6px 14px; border-radius:6px; font-size:12.5px; font-weight:700; background:${GL}; color:${G}; }
.ggb-soc-a { padding:6px 14px; border-radius:6px; font-size:12.5px; font-weight:700; background:#FEF2F2; color:#991B1B; }
/* WUQ table */
.ggb-guide-table { width:100%; border-collapse:collapse; font-size:12px; }
.ggb-guide-table th { background:${G}; color:#fff; padding:6px 10px; text-align:left; font-size:10.5px; font-weight:700; text-transform:uppercase; letter-spacing:.4px; }
.ggb-guide-table td { padding:6px 10px; border-bottom:1px solid #F3F4F6; }
.ggb-td-pct { font-weight:700; color:${G}; }
.ggb-guide-table tbody tr:nth-child(even) td { background:#F9FAFB; }
/* Formulas */
.ggb-guide-formula { display:flex; flex-direction:column; gap:2px; padding:9px 12px; border-radius:7px; margin-bottom:5px; border-left:3px solid ${G}; background:#F9FAFB; }
.ggb-f-mastery { border-left-color:#F59E0B; }
.ggb-f-proj    { border-left-color:#166534; }
.ggb-f-final   { border-left-color:#1D4ED8; background:#EFF6FF; }
.ggb-f-label { font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:.5px; color:#9CA3AF; }
.ggb-f-eq { font-size:12.5px; color:#111; }
.ggb-f-el    .ggb-f-eq em { font-style:normal; font-weight:700; color:${G}; }
.ggb-f-mastery .ggb-f-eq em { font-style:normal; font-weight:700; color:#B45309; }
.ggb-f-proj  .ggb-f-eq em { font-style:normal; font-weight:700; color:#166534; }
.ggb-f-final .ggb-f-eq em { font-style:normal; font-weight:700; color:#1D4ED8; }
.ggb-f-note { font-size:10.5px; color:#9CA3AF; }
/* Periods */
.ggb-period-row { display:flex; gap:7px; }
.ggb-p-card { flex:1; background:#F9FAFB; border:1px solid #E5E7EB; border-radius:7px; padding:9px; text-align:center; display:flex; flex-direction:column; gap:3px; }
.ggb-p-name { font-size:12.5px; font-weight:800; color:${G}; }
.ggb-p-mods { font-size:11px; color:#6B7280; }
/* Thresholds */
.ggb-thresh-grid { display:flex; flex-direction:column; gap:5px; }
.ggb-thresh-row { display:flex; justify-content:space-between; align-items:center; padding:8px 11px; border-radius:7px; font-size:12px; gap:12px; flex-wrap:wrap; }
.ggb-thresh-pass { background:${GL}; color:${G}; }
.ggb-thresh-inc  { background:#FEF3C7; color:#92400E; }
.ggb-thresh-fail { background:#FEF2F2; color:#991B1B; }
.ggb-thresh-tag { font-weight:800; font-size:10.5px; white-space:nowrap; }
/* ── Overview landscape layout ── */
.ggb-ov-body { padding:12px 16px 14px; }
.ggb-ov-grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
.ggb-ov-col { display:flex; flex-direction:column; gap:10px; }
.ggb-ov-sec { }
.ggb-ov-sh { font-size:9.5px; font-weight:800; text-transform:uppercase; letter-spacing:.6px; color:${G}; margin-bottom:5px; }
.ggb-ov-dim { font-size:9px; font-weight:400; text-transform:none; letter-spacing:0; color:#9CA3AF; }
/* Rubric strip — white/green only, no red or yellow */
.ggb-ov-rub-strip { display:flex; gap:4px; }
.ggb-ov-rub { flex:1; border-radius:6px; padding:5px 3px; text-align:center; border:1.5px solid #D1D5DB; background:#fff; display:flex; flex-direction:column; gap:1px; }
.ggb-ov-rub.ggb-rub-2, .ggb-ov-rub.ggb-rub-3 { border-color:#A7D4B5; background:${GL}; }
.ggb-ov-rub strong { font-size:14px; font-weight:900; line-height:1; color:#6B7280; }
.ggb-ov-rub span:nth-child(2) { font-size:10px; font-weight:700; color:#6B7280; }
.ggb-ov-rub.ggb-rub-2 strong, .ggb-ov-rub.ggb-rub-3 strong { color:${G}; }
.ggb-ov-rub.ggb-rub-2 span:nth-child(2), .ggb-ov-rub.ggb-rub-3 span:nth-child(2) { color:${G}; }
/* SOC line — P green, A dark red (clear present/absent contrast) */
.ggb-ov-soc-line { display:flex; gap:6px; align-items:center; flex-wrap:wrap; }
.ggb-ov-soc-line .ggb-soc-p { padding:3px 8px; font-size:11px; }
.ggb-ov-soc-line .ggb-soc-a { padding:3px 8px; font-size:11px; background:#FEE2E2; color:#7F1D1D; border:1px solid #FCA5A5; font-weight:800; }
.ggb-ov-soc-line .ggb-ov-dim { font-size:10.5px; }
/* Formula list — all green bars, no amber/blue */
.ggb-ov-flist { display:flex; flex-direction:column; gap:3px; }
.ggb-ov-f { display:flex; align-items:baseline; gap:6px; padding:4px 8px; border-radius:5px; background:#F9FAFB; border-left:2.5px solid ${G}; font-size:11px; color:#374151; }
.ggb-ov-f.ggb-f-final { background:${GL}; }
.ggb-ov-flabel { font-size:9.5px; font-weight:800; text-transform:uppercase; letter-spacing:.4px; color:${G}; white-space:nowrap; min-width:52px; }
.ggb-ov-f em { font-style:normal; font-weight:700; color:${G}; }
/* Compact period cards */
.ggb-ov-body .ggb-period-row { gap:5px; }
.ggb-ov-body .ggb-p-card { padding:5px 6px; }
.ggb-ov-body .ggb-p-name { font-size:11px; }
.ggb-ov-body .ggb-p-mods { font-size:9.5px; }
/* Threshold rows — colour-coded by severity: green (pass) → amber (single retry) → red (both) */
.ggb-ov-body .ggb-thresh-grid { gap:4px; }
.ggb-ov-body .ggb-thresh-row { padding:6px 10px; font-size:10.5px; border:1px solid transparent; font-weight:600; }
.ggb-ov-body .ggb-thresh-pass { background:${GL}; color:${G}; border-color:#A7D4B5; }
.ggb-ov-body .ggb-thresh-inc  { background:#FEF3C7; color:#92400E; border-color:#FDE68A; }
.ggb-ov-body .ggb-thresh-fail { background:#FEE2E2; color:#7F1D1D; border-color:#FCA5A5; }
.ggb-ov-body .ggb-thresh-tag  { padding:2px 8px; border-radius:20px; background:rgba(255,255,255,.6); }
/* Compact WUQ table */
.ggb-ov-body .ggb-guide-table th { padding:4px 7px; font-size:9.5px; }
.ggb-ov-body .ggb-guide-table td { padding:3px 7px; font-size:11px; }


`; }

// ── CSS ───────────────────────────────────────────────────────────────────

function css() { return `
/* ── Base ── */
.ggb-page { width:100%; }
.ggb-loading { display:flex; flex-direction:column; align-items:center; justify-content:center;
    gap:12px; min-height:260px; color:#9CA3AF; font-size:13px; }
.ggb-spin { width:36px; height:36px; border:3px solid #eee; border-top-color:${G};
    border-radius:50%; animation:ggbSpin .75s linear infinite; }
@keyframes ggbSpin { to { transform:rotate(360deg); } }

/* ── Hero ── */
.ggb-hero { padding:22px 26px; margin-bottom:20px; border-radius:16px; color:#111;
    background:#fff; border:1px solid ${BORDER}; }
.ggb-hero-title { font-size:24px; font-weight:800; margin:8px 0 4px; color:#111; }
.ggb-hero-sub { font-size:13px; color:#6B7280; margin:0; }
.ggb-pill { display:inline-flex; align-items:center; gap:5px; padding:4px 10px; border-radius:20px;
    font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.5px;
    background:${GL}; color:${G}; }
.ggb-hero .ggb-pill { background:${GL}; color:${G}; }

/* ── Back ── */
.ggb-back { display:inline-flex; align-items:center; gap:6px; font-size:13px; font-weight:600;
    color:${G}; background:none; border:none; cursor:pointer; margin-bottom:16px; padding:0; }
.ggb-back:hover { text-decoration:underline; }
/* Global accent badge (keeps violet) */
.ggb-global-badge { display:inline-block; padding:2px 8px; border-radius:20px;
    background:${VL}; color:${VIOLET}; font-size:10px; font-weight:800; margin-left:6px; vertical-align:middle; }
.ggb-global-chip { display:inline-block; padding:2px 8px; border-radius:20px;
    background:rgba(255,255,255,.2); color:#fff; font-size:10px; font-weight:700; margin-left:6px; }

/* ── Toolbar ── */
.ggb-toolbar { display:flex; align-items:center; gap:12px; margin-bottom:18px; padding:12px 14px;
    background:#F3F4F6; border-radius:12px; }
.ggb-search-wrap { flex:1; position:relative; }
.ggb-search-wrap svg { position:absolute; left:11px; top:50%; transform:translateY(-50%); color:#9CA3AF; }
.ggb-search { width:100%; padding:9px 14px 9px 36px; border:none; background:#fff;
    border-radius:8px; font-size:13px; box-sizing:border-box; }
.ggb-count { font-size:12px; font-weight:700; color:${G}; background:${GL};
    padding:7px 14px; border-radius:20px; white-space:nowrap; }

/* ── Subject cards ── */
.ggb-subj-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(270px,1fr)); gap:18px; }
.ggb-subj-card { text-decoration:none; color:inherit; border-radius:14px; overflow:hidden;
    background:#fff; border:1px solid ${BORDER}; display:flex; flex-direction:column;
    transition:box-shadow .15s,transform .15s; }
.ggb-subj-card:hover { box-shadow:0 4px 14px rgba(0,0,0,.1); transform:translateY(-2px); }
.ggb-subj-top { padding:18px 16px; min-height:76px; display:flex; flex-direction:column; justify-content:flex-end; }
.ggb-subj-code { font-size:10px; font-weight:700; font-family:monospace; color:rgba(255,255,255,.9); }
.ggb-subj-top h3 { font-size:16px; font-weight:700; color:#fff; margin:5px 0 0; line-height:1.3; }
.ggb-subj-body { padding:14px 16px; flex:1; display:flex; flex-direction:column; gap:7px; }
.ggb-stat { font-size:13px; color:#374151; display:flex; align-items:center; gap:7px; }
.ggb-subj-link { margin-top:auto; font-size:12px; font-weight:700; color:${G}; padding-top:8px; }
.ggb-no-results { text-align:center; color:#9CA3AF; padding:20px; }

/* ── Subject hero (sections view) ── */
.ggb-subj-hero { display:flex; border-radius:14px; overflow:hidden; margin-bottom:22px;
    background:#fff; border:1px solid ${BORDER}; }
.ggb-subj-band { padding:20px 24px; color:#fff; min-width:170px; }
.ggb-subj-code-sm { font-size:10px; font-weight:700; font-family:monospace; opacity:.9; }
.ggb-subj-band h1 { font-size:19px; font-weight:800; margin:5px 0 3px; }
.ggb-subj-prog { font-size:12px; opacity:.85; }
.ggb-subj-meta { flex:1; padding:20px 24px; display:flex; flex-direction:column; justify-content:center; gap:10px; }
.ggb-subj-meta p { margin:0; color:#6B7280; font-size:13px; }
@media(max-width:600px) { .ggb-subj-hero { flex-direction:column; } .ggb-subj-band { min-width:0; } }

/* ── Section cards ── */
.ggb-sec-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(290px,1fr)); gap:16px; }
.ggb-sec-card { border:1px solid ${BORDER}; border-radius:14px; background:#fff;
    transition:box-shadow .15s,transform .15s; }
.ggb-sec-card:hover { box-shadow:0 4px 12px rgba(0,0,0,.08); transform:translateY(-2px); }
.ggb-sec-link { display:block; padding:16px; text-decoration:none; color:inherit; }
.ggb-sec-head { display:flex; justify-content:space-between; align-items:flex-start; gap:8px; margin-bottom:10px; }
.ggb-sec-head h3 { font-size:16px; font-weight:700; color:#111; margin:0 0 3px; }
.ggb-sec-hint { font-size:11px; color:#9CA3AF; }
.ggb-sec-badge { font-size:10px; font-weight:700; text-transform:uppercase; padding:3px 8px;
    border-radius:6px; background:${GL}; color:${G}; white-space:nowrap; }
.ggb-sec-meta { font-size:12.5px; color:#6B7280; display:flex; flex-direction:column; gap:5px; margin-bottom:10px; }
.ggb-sec-meta div { display:flex; align-items:center; gap:5px; }
.ggb-bar { height:4px; background:#f0f0f0; border-radius:3px; overflow:hidden; margin-bottom:10px; }
.ggb-bar-fill { height:100%; background:${G}; }

/* ── Record head ── */
.ggb-record-head { margin-bottom:14px; }
.gb-record-titlerow { display:flex; align-items:center; justify-content:flex-start; gap:14px; flex-wrap:wrap; }
.gb-record-title { font-size:17px; font-weight:800; color:#111; margin:0 0 3px; }
.gb-record-section { font-weight:500; color:#6B7280; }
.gb-record-meta { font-size:12px; color:#9CA3AF; margin:0; }
.gb-record-actions { display:flex; align-items:center; gap:6px; flex-shrink:0; }
.gb-record-count { font-size:12px; color:#9CA3AF; }
.gb-export-btn { display:inline-flex; align-items:center; gap:5px; padding:6px 10px;
    border-radius:8px; border:1.5px solid ${G}; background:#fff; color:${G};
    font-size:12px; font-weight:700; cursor:pointer; white-space:nowrap; }
.gb-export-btn:hover { background:${GL}; }

/* ── View tabs ── */
.ggb-view-tabs { display:flex; gap:4px; margin-bottom:14px; padding:5px;
    background:#F3F4F6; border-radius:10px; width:fit-content; }
.ggb-vtab { padding:7px 16px; border:none; border-radius:7px; background:transparent;
    color:#6B7280; font-size:13px; font-weight:600; cursor:pointer; }
.ggb-vtab:hover { background:#fff; color:#111; }
.ggb-vtab.active { background:${G}; color:#fff; box-shadow:0 2px 6px rgba(0,70,27,.2); }

/* Empty state */
.ggb-empty { text-align:center; padding:48px 24px; border:2px dashed ${BORDER}; border-radius:16px; background:#FAFAFA; }
.ggb-empty-icon { margin-bottom:12px; }
.ggb-empty p { color:#6B7280; margin:0; font-size:14px; }
`; }
