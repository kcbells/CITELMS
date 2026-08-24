/**
 * Instructor — Global Gradebook
 * 14-module Effortful Learning / Mastery model.
 * Layout: horizontal scrollable table (all modules side-by-side) matching the reference sheet.
 */
import { Api } from '../../api.js';
import { subjectColor } from '../../utils/subject-colors.js';
import { icon } from '../../utils/icons.js';
import { curriculumTableCss } from '../../utils/classroom-ui.js';
import { gradingPeriodTableCss } from '../../utils/gradebook-periods.js';
import {
    rubricToPercent, socGrade, letsPracticeGrade, projectOverallGrade,
    computeStudentReport, formatGrade, PERIOD_MODULES, PERIODS,
} from '../../utils/grading-engine.js';

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

    const { subjectId, sectionId } = opts;
    if (sectionId && subjectId) await renderClassRecord(container, opts);
    else if (subjectId)          renderSectionsView(container, opts);
    else                         renderSubjectsView(container, opts);
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
        });
    }
    students.sort((a, b) => a.name.localeCompare(b.name));
    return students;
}

// ── Mount record with view switcher ───────────────────────────────────────

const VIEWS = ['modules', 'project', 'summary', 'sis', 'retries'];
const VIEW_LABELS = { modules: 'Module Records', project: 'Project Grades', summary: 'Summary & Remarks', sis: 'For SIS', retries: 'Students for Retry' };

function mountRecord(host, container, subject, section, offeredId, students, grades, project, retries, opts) {
    let activeView   = opts.view || 'modules';
    let activeModule = 'all'; // 'all' or 1-14 — filters the Module Records table so it doesn't force a 14-module-wide scroll

    function renderShell() {
        const schedule = [section.schedule, section.room].filter(Boolean).join(' · ');
        host.innerHTML = `
        <style>${css()}${curriculumTableCss()}${gradingPeriodTableCss()}${tableCss()}</style>
        <div class="gb-record-head">
            <div class="gb-record-titlerow">
                <div>
                    <h2 class="gb-record-title">${esc(subject.subject_code)} <span class="gb-record-section">&middot; ${esc(section.section_name)}</span></h2>
                    ${schedule ? `<p class="gb-record-meta">${esc(schedule)}</p>` : ''}
                </div>
                <div class="gb-record-actions">
                    <span class="gb-record-count">${students.length} student${students.length !== 1 ? 's' : ''}</span>
                    <button class="gb-export-btn" id="ggb-export">
                        ${icon('download', { size: 13, className: 'ui-icon-inline' })} Export
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

        host.querySelector('#ggb-export').addEventListener('click', () =>
            openExportPreview(subject, section, students, grades, project, retries)
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
        if      (activeView === 'modules') area.innerHTML = renderModuleTable(students, grades, project, subject.subject_code, section.section_name, activeModule);
        else if (activeView === 'project') area.innerHTML = renderProjectTable(students, project, subject.subject_code, section.section_name);
        else if (activeView === 'sis')     area.innerHTML = renderSisTable(students, grades, project, subject.subject_code, section.section_name);
        else if (activeView === 'retries') area.innerHTML = renderRetriesTable(students, grades, project, retries, subject.subject_code, section.section_name);
        else                               area.innerHTML = renderSummaryTable(students, grades, project, subject.subject_code, section.section_name);

        if (activeView === 'modules') {
            attachModuleEvents(area, offeredId, grades, project);
            attachDefaultsBar(area);
            const filterSel = area.querySelector('#ggb-module-filter');
            filterSel?.addEventListener('change', () => {
                activeModule = filterSel.value === 'all' ? 'all' : parseInt(filterSel.value, 10);
                renderView();
            });
        }
        if (activeView === 'project') attachProjectEvents(area, offeredId, project);
        if (activeView === 'retries') attachRetriesEvents(area, offeredId, retries);
    }

    renderShell();
}

// ── Horizontal module table (all 14 modules side-by-side) ─────────────────
// Uses the SAME CSS classes as the raw-score gradebook for visual consistency.

// Rubric columns that use the 0–3 "3,2,1,0" scale — Let's Practice, its
// optional variant, and Reflection. WUQ uses a different (percentage) scale
// so it's intentionally left out of the quick-fill bar.
const RUBRIC_DEFAULT_FIELDS = [
    { field: 'lets_practice',          label: 'LP'     },
    { field: 'lets_practice_optional', label: 'LP Opt' },
    { field: 'reflection',             label: 'Refl'   },
];

function defaultsBarHtml(moduleFilter) {
    const scopeLabel = moduleFilter === 'all' ? 'all modules' : `Module ${moduleFilter}`;
    return `
    <div class="ggb-default-bar">
        <span class="ggb-default-label">${icon('gradebook', { size: 13, className: 'ui-icon-inline' })} Quick-fill defaults</span>
        ${RUBRIC_DEFAULT_FIELDS.map(f => `
        <label class="ggb-default-field">
            <span>${f.label}</span>
            <select class="ggb-default-sel" data-field="${f.field}">
                <option value="">—</option>
                <option value="3">3</option>
                <option value="2">2</option>
                <option value="1">1</option>
                <option value="0">0</option>
            </select>
        </label>`).join('')}
        <button type="button" class="ggb-default-apply" id="ggb-default-apply">Apply to blanks — ${scopeLabel}</button>
        <span class="ggb-default-hint">Fills only cells still showing “—”. Grades already entered are never overwritten.</span>
    </div>`;
}

function attachDefaultsBar(area) {
    const btn = area.querySelector('#ggb-default-apply');
    if (!btn) return;
    const baseLabel = btn.textContent;
    btn.addEventListener('click', () => {
        const defaults = {};
        area.querySelectorAll('.ggb-default-sel').forEach(sel => {
            if (sel.value !== '') defaults[sel.dataset.field] = sel.value;
        });
        if (!Object.keys(defaults).length) {
            btn.textContent = 'Pick a default value first';
            setTimeout(() => { btn.textContent = baseLabel; }, 2000);
            return;
        }
        let filled = 0;
        area.querySelectorAll('.ggb-rubric').forEach(sel => {
            const def = defaults[sel.dataset.field];
            if (def !== undefined && sel.value === '') {
                sel.value = def;
                // Reuse the existing per-cell save listener (attachModuleEvents)
                // instead of duplicating the save-field API call here.
                sel.dispatchEvent(new Event('change', { bubbles: true }));
                filled++;
            }
        });
        btn.textContent = filled ? `Filled ${filled} cell${filled !== 1 ? 's' : ''}` : 'No blank cells to fill';
        setTimeout(() => { btn.textContent = baseLabel; }, 2500);
    });
}

function renderModuleTable(students, grades, project, subjectCode = '', sectionName = '', moduleFilter = 'all') {
    const allModules = Array.from({ length: 14 }, (_, i) => i + 1);
    const modules     = moduleFilter === 'all' ? allModules : allModules.filter(m => m === moduleFilter);
    const periodOf     = m => (m <= 4 ? 'P1' : m <= 9 ? 'P2' : 'Final');
    const filterBar     = `
    <div class="ggb-module-filter-bar">
        <label for="ggb-module-filter">${icon('gradebook', { size: 13, className: 'ui-icon-inline' })} Module</label>
        <select id="ggb-module-filter" class="ggb-module-filter">
            <option value="all" ${moduleFilter === 'all' ? 'selected' : ''}>All modules (1–14)</option>
            ${allModules.map(m => `<option value="${m}" ${moduleFilter === m ? 'selected' : ''}>Module ${m} — ${periodOf(m)}</option>`).join('')}
        </select>
        ${moduleFilter !== 'all' ? `<span class="ggb-module-filter-hint"><span class="ggb-module-filter-dot"></span>Showing Module ${moduleFilter} only</span>` : ''}
    </div>`;

    // Row 1: Module N (dark green, period-coloured)
    let hdr1 = `<th rowspan="3" class="gc-th-info">#</th>
                <th rowspan="3" class="gc-th-info th-left">Student ID</th>
                <th rowspan="3" class="gc-th-info th-left">Name of Student</th>`;
    modules.forEach(m => {
        hdr1 += `<th colspan="6" class="gb-period-th">Module ${m}<span class="gb-period-sub">${m <= 4 ? 'P1' : m <= 9 ? 'P2' : 'Final'}</span></th>`;
    });

    // Row 2: SOC (2) | EL (3) | Mastery (1) per module — white bg via gb-item-th
    let hdr2 = '';
    modules.forEach(() => {
        hdr2 += `<th colspan="2" class="gb-item-th">Start of Class (5%)</th>
                 <th colspan="3" class="gb-item-th">Effortful Learning</th>
                 <th colspan="1" class="gb-item-th">Mastery (15%)</th>`;
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
    const emptyColspan = 3 + modules.length * 6;

    return `
    ${filterBar}
    ${defaultsBarHtml(moduleFilter)}
    <div class="gc-cur-wrap">
        <div class="gc-cur-label">${esc(label)}</div>
        <div class="gb-table-scroll">
            <table class="gc-cur-table ggb-module-table${moduleFilter !== 'all' ? ' ggb-module-table--single' : ''}">
                <thead>
                    <tr>${hdr1}</tr>
                    <tr>${hdr2}</tr>
                    <tr>${hdr3}</tr>
                </thead>
                <tbody>
                    ${rows || `<tr><td colspan="${emptyColspan}" class="gc-cur-empty">No students enrolled in this section.</td></tr>`}
                </tbody>
            </table>
        </div>
    </div>`;
}

// Present is the assumed default — a class is naturally more present than
// absent, so an untouched cell (no saved value yet) reads as "P" and the
// instructor only has to act (pick "A") for the exception, an absence.
function socSel(field, sid, mod, val) {
    const v = val === 'A' ? 'A' : 'P';
    // NOTE: class is "ggb-soc-sel-p/-a", NOT "ggb-soc-p/-a" — those names are
    // already used by the grading-guide modal's legend pills (padding:6px 14px),
    // and reusing them here let that rule win the cascade and crush this select
    // down to a sliver. Keep the two namespaces separate.
    return `<select class="ggb-sel ggb-soc ggb-soc-sel-${v.toLowerCase()}" data-field="${field}" data-sid="${sid}" data-mod="${mod}">
        <option value="P" ${v === 'P' ? 'selected' : ''}>P</option>
        <option value="A" ${v === 'A' ? 'selected' : ''}>A</option>
    </select>`;
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

            if (field === 'soc1' || field === 'soc2') {
                sel.classList.toggle('ggb-soc-sel-a', value === 'A');
                sel.classList.toggle('ggb-soc-sel-p', value !== 'A');
            }

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
}

// ── Project tab ────────────────────────────────────────────────────────────

function renderProjectTable(students, project, subjectCode = '', sectionName = '') {
    const rows = students.map((st, i) => {
        const sid = st.user_student_id;
        let cells = '';
        PERIODS.forEach(per => {
            const pg      = project[sid]?.[per] || {};
            const overall = projectOverallGrade(
                [pg.checkin1 ?? null, pg.checkin2 ?? null, pg.checkin3 ?? null, pg.checkin4 ?? null],
                pg.final_output ?? null
            );
            cells += `
            <td class="td-num">${projInput(sid, per, 'checkin1',    pg.checkin1)}</td>
            <td class="td-num">${projInput(sid, per, 'checkin2',    pg.checkin2)}</td>
            <td class="td-num">${projInput(sid, per, 'checkin3',    pg.checkin3)}</td>
            <td class="td-num">${projInput(sid, per, 'checkin4',    pg.checkin4)}</td>
            <td class="td-num">${projInput(sid, per, 'final_output',pg.final_output)}</td>
            <td class="td-num td-proj-overall${overall !== null && overall < 80 ? ' td-low' : ''}" data-proj-overall="${sid}-${per}">${fmt(overall)}</td>`;
        });
        return `<tr data-stu="${sid}">
            <td class="td-rank">${i + 1}</td>
            <td class="td-id">${esc(st.student_id || '—')}</td>
            <td class="td-name">${esc(st.name)}</td>
            ${cells}
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
                        <th rowspan="2" class="gc-th-info">#</th>
                        <th rowspan="2" class="gc-th-info th-left">Student ID</th>
                        <th rowspan="2" class="gc-th-info th-left">Name</th>
                        <th colspan="6" class="gb-period-th">P1 Project</th>
                        <th colspan="6" class="gb-period-th gb-period-th--p2">P2 Project</th>
                        <th colspan="6" class="gb-period-th gb-period-th--p3">Final Project</th>
                    </tr>
                    <tr>
                        ${PERIODS.map(() => `
                        <th class="gb-item-th"><span class="gb-item-type activity">CI</span><span class="gb-item-name">Check-in 1</span></th>
                        <th class="gb-item-th"><span class="gb-item-type activity">CI</span><span class="gb-item-name">Check-in 2</span></th>
                        <th class="gb-item-th"><span class="gb-item-type activity">CI</span><span class="gb-item-name">Check-in 3</span></th>
                        <th class="gb-item-th"><span class="gb-item-type activity">CI</span><span class="gb-item-name">Check-in 4</span></th>
                        <th class="gb-item-th"><span class="gb-item-type quiz">Final</span><span class="gb-item-name">Final Output</span></th>
                        <th class="gb-item-th"><span class="gb-item-type quiz">Overall</span><span class="gb-item-name">Project %</span></th>`).join('')}
                    </tr>
                </thead>
                <tbody>${rows || '<tr><td colspan="21" class="gc-cur-empty">No students enrolled.</td></tr>'}</tbody>
            </table>
        </div>
    </div>
    <p class="ggb-proj-note">Up to 4 check-ins + final output per period (0–100). Overall = CI avg × 65% + Final × 35% (50/50 if only 1 CI).</p>`;
}

function projInput(sid, period, field, val) {
    const display = (val === null || val === undefined) ? '' : String(val);
    return `<input type="number" class="ggb-num-input" min="0" max="100" step="0.01"
        data-sid="${sid}" data-period="${period}" data-field="${field}"
        value="${esc(display)}" placeholder="—">`;
}

function attachProjectEvents(area, offeredId, project) {
    area.querySelectorAll('.ggb-num-input').forEach(inp => {
        inp.addEventListener('change', async () => {
            const sid    = parseInt(inp.dataset.sid, 10);
            const period = inp.dataset.period;
            const field  = inp.dataset.field;
            const value  = inp.value !== '' ? parseFloat(inp.value) : null;

            if (!project[sid]) project[sid] = {};
            if (!project[sid][period]) project[sid][period] = {};
            project[sid][period][field] = value;

            const pg      = project[sid][period];
            const overall = projectOverallGrade(
                [pg.checkin1 ?? null, pg.checkin2 ?? null, pg.checkin3 ?? null, pg.checkin4 ?? null],
                pg.final_output ?? null
            );
            const cell = area.querySelector(`[data-proj-overall="${sid}-${period}"]`);
            if (cell) {
                cell.textContent = fmt(overall);
                cell.className   = `td-computed${overall !== null && overall < 80 ? ' td-low' : ''}`;
            }

            try {
                const res = await Api.post('/GlobalGradebookAPI.php?action=save-project', {
                    subject_offered_id: parseInt(offeredId, 10),
                    student_id: sid, period, field, value,
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
                        <th rowspan="2" class="gc-th-info">#</th>
                        <th rowspan="2" class="gc-th-info th-left">Student ID</th>
                        <th rowspan="2" class="gc-th-info th-left">Name</th>
                        <th colspan="3" class="gb-period-th">Period 1 — Modules 1–4</th>
                        <th colspan="3" class="gb-period-th gb-period-th--p2">Period 2 — Modules 1–9</th>
                        <th colspan="3" class="gb-period-th gb-period-th--p3">Final — Modules 1–14</th>
                        <th rowspan="2" class="gb-item-th">Mastery Status</th>
                        <th rowspan="2" class="gb-item-th">Remarks</th>
                    </tr>
                    <tr>
                        <th class="gb-item-th"><span class="gb-item-type quiz">EL (55%)</span><span class="gb-item-name">Effortful<br>Learning</span></th>
                        <th class="gb-item-th"><span class="gb-item-type quiz">Mastery (45%)</span><span class="gb-item-name">WUQ +<br>Project</span></th>
                        <th class="gb-item-th"><span class="gb-item-type quiz">Grade</span><span class="gb-item-name">P1 Final</span></th>
                        <th class="gb-item-th"><span class="gb-item-type quiz">EL (55%)</span><span class="gb-item-name">Effortful<br>Learning</span></th>
                        <th class="gb-item-th"><span class="gb-item-type quiz">Mastery (45%)</span><span class="gb-item-name">WUQ +<br>Project</span></th>
                        <th class="gb-item-th"><span class="gb-item-type quiz">Grade</span><span class="gb-item-name">P2 Final</span></th>
                        <th class="gb-item-th"><span class="gb-item-type quiz">EL (55%)</span><span class="gb-item-name">Effortful<br>Learning</span></th>
                        <th class="gb-item-th"><span class="gb-item-type quiz">Mastery (45%)</span><span class="gb-item-name">WUQ +<br>Project</span></th>
                        <th class="gb-item-th"><span class="gb-item-type quiz">Grade</span><span class="gb-item-name">Final<br>Grade</span></th>
                    </tr>
                </thead>
                <tbody>${rows || '<tr><td colspan="14" class="gc-cur-empty">No students enrolled.</td></tr>'}</tbody>
            </table>
        </div>
    </div>
    <p class="ggb-proj-note">EL = Effortful Learning (SOC 5% + LP 35% + Reflection 15%). Mastery = WUQ 15% + Project 30%. Grade = EL × 55% + Mastery × 45%. Mastery threshold: 80.</p>`;
}

function computeStudentGrades(sid, grades, project) {
    const report = computeStudentReport({
        getModuleInput: (m) => {
            const mg = grades[sid]?.[m] || {};
            // Unset SOC defaults to "P" (present) — matches the module table's
            // dropdown default, so Summary/SIS/Retries agree with what's on screen.
            return {
                soc1: mg.soc1 === 'A' ? 'A' : 'P',
                soc2: mg.soc2 === 'A' ? 'A' : 'P',
                letsPractice: mg.lets_practice ?? null,
                letsPracticeOptional: mg.lets_practice_optional ?? null,
                reflection: mg.reflection ?? null,
                wrapUpQuiz: mg.wrap_up_quiz ?? null,
            };
        },
        getPeriodProject: (periodKey) => {
            const pg = project[sid]?.[periodKey] || {};
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
        modules: report.modules, // per-module {soc, letsPractice, reflection, wrapUpQuiz} percentages — used by the Grading Summary Sheet export
    };
}

/** Average of the non-null values only — mirrors grading-engine.js's private averageNonNull(), needed here for the per-module component averages the export sheets show but computeStudentReport() doesn't expose directly. */
function avgNonNull(values) {
    const v = values.filter(x => x !== null && x !== undefined);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

// ── For SIS Table ─────────────────────────────────────────────────────────
// Columns: # | Student Number | Name | P1 Grade | P2 Grade | P3/Final Grade
// One blended total per period (EL 55% + Mastery 45% already combined by
// periodGrade() in grading-engine.js) — the SIS record only wants a single
// final number per period, not the internal Effortful/Mastery breakdown.

function renderSisTable(students, grades, project, subjectCode = '', sectionName = '') {
    const label = subjectCode && sectionName ? `FOR SIS — ${subjectCode} / ${sectionName}` : 'FOR SIS';

    const rows = students.map((st, i) => {
        const sid = st.user_student_id;
        const { p1, p2, final } = computeStudentGrades(sid, grades, project);
        const low = (v) => v !== null && v < 80 ? ' td-low' : '';
        return `<tr>
            <td class="td-rank">${i + 1}</td>
            <td class="td-id">${esc(st.student_id || '—')}</td>
            <td class="td-name">${esc(st.name)}</td>
            <td class="td-num td-grade${low(p1.grade)}">${fmt(p1.grade)}</td>
            <td class="td-num td-grade${low(p2.grade)}">${fmt(p2.grade)}</td>
            <td class="td-num td-grade ggb-sis-final${low(final.grade)}">${fmt(final.grade)}</td>
        </tr>`;
    }).join('');

    return `
    <div class="gc-cur-wrap">
        <div class="gc-cur-label">${esc(label)}</div>
        <div class="gb-table-scroll">
            <table class="gc-cur-table ggb-sis-table">
                <thead>
                    <tr>
                        <th class="gc-th-info">#</th>
                        <th class="gc-th-info th-left">Student Number</th>
                        <th class="gc-th-info th-left">Name of Student</th>
                        <th class="gb-period-th">P1 Grade</th>
                        <th class="gb-period-th gb-period-th--p2">P2 Grade</th>
                        <th class="gb-period-th gb-period-th--p3 ggb-sis-th-final">P3 — Final Grade</th>
                    </tr>
                </thead>
                <tbody>${rows || '<tr><td colspan="6" class="gc-cur-empty">No students enrolled.</td></tr>'}</tbody>
            </table>
        </div>
    </div>
    <p class="ggb-proj-note">Each period's grade already blends Effortful Learning (55%) and Mastery (45%) into one total, as required for the SIS record. Low grades (below 80) are highlighted. See the Overview tab for the Effortful/Mastery breakdown and Mastery Status per student.</p>`;
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
                        <th class="gc-th-info">#</th>
                        <th class="gc-th-info th-left">Student Number</th>
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
        inp.addEventListener('change', () => save(parseInt(inp.dataset.sid, 10), inp.dataset.field, inp.value));
    });
    area.querySelectorAll('.ggb-retry-status').forEach(sel => {
        sel.addEventListener('change', () => save(parseInt(sel.dataset.sid, 10), sel.dataset.field, sel.value));
    });
}

// ── XLSX Export (multi-sheet workbook + preview) ────────────────────────────
// Mirrors the "global excel" reference file's own 6 tabs — Guide, Grading
// Input Sheet, Grading Summary Sheet, FOR END OF SEM RETRIES Grading,
// For-SIS, Tab for Retries — column-for-column. Clicking Export opens a
// preview modal built from the exact same sheet data first; the modal's
// Download button is what actually writes the .xlsx file, so what's
// previewed is what gets downloaded.
//
// Uses xlsx-js-style (a community fork of SheetJS) instead of stock SheetJS
// Community Edition — stock SheetJS silently drops cell fill/font colors on
// write (that's a Pro-only feature there); this fork restores it for free,
// which is what lets buildFills()/applyFills() below actually color the
// downloaded file instead of just the in-app preview.

let _sheetJsLoaded = false;

async function loadSheetJS() {
    if (_sheetJsLoaded || window.XLSX) { _sheetJsLoaded = true; return; }
    await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.min.js';
        s.onload  = () => { _sheetJsLoaded = true; res(); };
        s.onerror = () => rej(new Error('Failed to load the Excel export library. Check your internet connection.'));
        document.head.appendChild(s);
    });
}

// Real numbers (not the "—" display string) so the exported columns stay
// sortable/summable in Excel; blank cell for anything unset.
function xNum(v) {
    return (v === null || v === undefined || Number.isNaN(Number(v))) ? '' : Math.round(Number(v) * 100) / 100;
}

// ── Header color palette ────────────────────────────────────────────────
// Same green/blue logic as the reference file: green for anything under
// Effortful Learning, blue for anything under Mastery, with darker green
// "title" bands per period — reusing this app's own dark-green brand shade
// (G/G2 above) so P1/P2/Final read as progressively distinct, matching the
// same period-shading already used on-screen (gradebook-periods.js).
const X_TITLE    = { bg: '00461B', fg: 'FFFFFF', bold: true };  // P1 / Module N / block titles
const X_TITLE_P2 = { bg: '006428', fg: 'FFFFFF', bold: true };
const X_TITLE_P3 = { bg: '1B5E20', fg: 'FFFFFF', bold: true };  // P3 / Final
const X_EL       = { bg: 'E2EFDA', fg: '1B5E20', bold: false }; // Effortful Learning band
const X_MASTERY  = { bg: 'DDEBF7', fg: '1F4E78', bold: false }; // Mastery band
const X_FIELD    = { bg: 'FFFFFF', fg: '000000', bold: true };  // field-name row (matches the reference's plain white leaf-header row)
const X_INFO     = { bg: 'FFFFFF', fg: '000000', bold: true };  // #, Student ID/Number, Name
const X_TITLE_MASTERY = { bg: '1F4E78', fg: 'FFFFFF', bold: true }; // dark-blue title, for Mastery-themed block titles (e.g. Wrap Up)
const X_SUBTITLE = { bg: 'F2F2F2', fg: '595959', bold: false };     // "Weighted per Component Grade" sub-label row

/** Pushes one colored rectangle (same {s,e} shape as an XLSX merge) onto a sheet's `fills` list. */
function fill(fills, r0, c0, r1, c1, style) {
    fills.push({ s: { r: r0, c: c0 }, e: { r: r1, c: c1 }, style });
}

/** The style (or null) covering cell (r,c) — later-pushed rectangles win over earlier/broader ones, so a single-cell override always beats the block-level fill it sits inside. Used by both the .xlsx writer and the HTML preview so they stay visually identical. */
function styleAt(fills, r, c) {
    for (let i = fills.length - 1; i >= 0; i--) {
        const f = fills[i];
        if (r >= f.s.r && r <= f.e.r && c >= f.s.c && c <= f.e.c) return f.style;
    }
    return null;
}

// A student's Project data is entered per-period (P1/P2/Final each with up
// to 4 check-ins + a final output) — but the reference workbook's "Final
// Project/Output/Task" block treats the whole course as ONE project with 4
// check-in slots labelled P1 / P2 / P3.1 / P3.2 feeding a single Overall
// Grade (this matches projectOverallGrade()'s own doc-comment: "up to 4
// check-in grades (P1, P2, P3.1, P3.2)"). We map our per-period data onto
// that single-block shape using each period's first check-in (P3 gets two,
// since Final is the longer period) and the Final period's output as "the"
// course output — this is ONLY for that one display block. The Grading
// Summary Sheet's actual per-period Mastery/Grade columns keep using each
// period's OWN project data, exactly as computeStudentGrades() already
// computes it, so the exported grades never disagree with what's on screen.
function courseProjectSlots(sid, project) {
    const p1  = project[sid]?.P1    || {};
    const p2  = project[sid]?.P2    || {};
    const fin = project[sid]?.Final || {};
    const checkins = [p1.checkin1 ?? null, p2.checkin1 ?? null, fin.checkin1 ?? null, fin.checkin2 ?? null];
    const finalOutput = fin.final_output ?? null;
    return {
        checkins,
        finalOutput,
        checkinAvg: avgNonNull(checkins),
        overall: projectOverallGrade(checkins, finalOutput),
    };
}

/** Average of a period's per-module component values (0–100 %), e.g. periodComponentAvg(modules, PERIOD_MODULES.P1, 'soc'). */
function periodComponentAvg(modules, range, key) {
    return avgNonNull(range.map(m => modules[m]?.[key] ?? null));
}

// ── 1. Guide ─────────────────────────────────────────────────────────────
// The reference "Guide" sheet's rubric tables are embedded pictures, not
// cell data — the only real data in it is the File Information block and
// the Recommended Timeline, which is a fixed 17-week template shared across
// sections (not derived from any one class's data), so it's reproduced verbatim.
const RECOMMENDED_TIMELINE = [
    ['Week 1',  'July 6 – July 12',   'Introduction to the Course. Expectations, etc. Can already start with Module 1'],
    ['Week 2',  'July 13 – July 19',  'Module 1'],
    ['Week 3',  'July 20 – July 26',  'Module 2'],
    ['Week 4',  'July 27 – Aug 2',    'Module 3'],
    ['Week 5',  'Aug 3 – Aug 9',      'Module 4'],
    ['Week 6',  'Aug 10 – Aug 16',    'P1 Closing Week - Module 5 / P1 covers Modules 1-4'],
    ['Week 7',  'Aug 17 – Aug 23',    'Module 6'],
    ['Week 8',  'Aug 24 – Aug 30',    'Module 7'],
    ['Week 9',  'Aug 31 – Sept 6',    'Module 8'],
    ['Week 10', 'Sept 7 – Sept 13',   'Module 9'],
    ['Week 11', 'Sept 14 – Sept 20',  'P2 Closing Week - Module 10 / P2 covers Modules 5-9'],
    ['Week 12', 'Sept 21 – Sept 27',  'Module 11'],
    ['Week 13', 'Sept 28 – Oct 4',    'Module 12'],
    ['Week 14', 'Oct 5 – Oct 11',     'Module 13'],
    ['Week 15', 'Oct 12 – Oct 18',    'Module 14'],
    ['Week 16', 'Oct 19 – Oct 25',    'Catch up week'],
    ['Week 17', 'Oct 26 – Nov 1',     'Retries — P3 covers Modules 10-14'],
];

function buildGuideSheet(subject, section) {
    return {
        name: 'Guide',
        headerRows: 1,
        cols: [{ wch: 22 }, { wch: 44 }, { wch: 2 }, { wch: 8 }, { wch: 20 }, { wch: 56 }],
        merges: [],
        fills: [
            { s: { r: 0, c: 0 }, e: { r: 0, c: 1 }, style: X_TITLE },
            { s: { r: 0, c: 3 }, e: { r: 0, c: 5 }, style: X_TITLE_P2 },
            { s: { r: 1, c: 3 }, e: { r: 1, c: 5 }, style: X_FIELD },
        ],
        aoa: [
            ['File Information', '', '', 'Recommended Timeline', '', ''],
            ['Name of Teacher', '', '', 'Week', 'Dates', 'Note / Activity'],
            ['School and Campus', '', '', ...RECOMMENDED_TIMELINE[0]],
            ['Department', '', '', ...RECOMMENDED_TIMELINE[1]],
            ['Subject Name', subject.subject_name || '', '', ...RECOMMENDED_TIMELINE[2]],
            ['Modality or Class Set-up', section.schedule || '', '', ...RECOMMENDED_TIMELINE[3]],
            ['', '', '', ...RECOMMENDED_TIMELINE[4]],
            ...RECOMMENDED_TIMELINE.slice(5).map(row => ['', '', '', ...row]),
        ],
    };
}

// ── 2. Grading Input Sheet ──────────────────────────────────────────────
// Module 1–14 raw entry columns, plus the course-wide Project block at the
// end (see courseProjectSlots() above for how that block is derived).
function buildGradingInputSheet(students, grades, project) {
    // 4 header rows, matching the reference exactly: Module N | Effortful
    // Learning / Mastery | Start of Class / Let's Practice / Reflection /
    // Wrap Up Quiz | individual field names.
    const HR = 4;
    const hdr = Array.from({ length: HR }, () => []);
    const merges = [];
    const fills = [];

    const infoCol = (label) => {
        const c = hdr[0].length;
        merges.push({ s: { r: 0, c }, e: { r: HR - 1, c } });
        fill(fills, 0, c, HR - 1, c, X_INFO);
        hdr[0].push(label);
        for (let r = 1; r < HR; r++) hdr[r].push('');
    };
    infoCol('#');
    infoCol('Student ID');
    infoCol('Name of Student');

    for (let m = 1; m <= 14; m++) {
        const c = hdr[0].length;
        merges.push({ s: { r: 0, c }, e: { r: 0, c: c + 5 } });
        fill(fills, 0, c, 0, c + 5, X_TITLE);
        hdr[0].push(`Module ${m}`, '', '', '', '', '');
        merges.push({ s: { r: 1, c }, e: { r: 1, c: c + 4 } });
        fill(fills, 1, c, 1, c + 4, X_EL);
        fill(fills, 1, c + 5, 1, c + 5, X_MASTERY);
        hdr[1].push('Effortful Learning', '', '', '', '', 'Mastery');
        merges.push({ s: { r: 2, c }, e: { r: 2, c: c + 1 } });
        merges.push({ s: { r: 2, c: c + 2 }, e: { r: 2, c: c + 3 } });
        merges.push({ s: { r: 2, c: c + 4 }, e: { r: 3, c: c + 4 } });
        merges.push({ s: { r: 2, c: c + 5 }, e: { r: 3, c: c + 5 } });
        fill(fills, 2, c, 3, c + 4, X_EL);
        fill(fills, 2, c + 5, 3, c + 5, X_MASTERY);
        hdr[2].push('Start of Class (5%)', '', "Let's Practice (35%)", '', 'Reflection (15%)', 'Wrap Up Quiz (15%)');
        hdr[3].push('SOC 1', 'SOC 2', "Let's Practice", "Let's Practice (optional)", '', '');
        fill(fills, 3, c, 3, c + 3, X_FIELD);
    }

    {
        const c = hdr[0].length;
        merges.push({ s: { r: 0, c }, e: { r: 1, c: c + 6 } });
        fill(fills, 0, c, 1, c + 6, X_TITLE_P3);
        hdr[0].push('Final Project/Output/Task (30%)', '', '', '', '', '', '');
        hdr[1].push('', '', '', '', '', '', '');
        merges.push({ s: { r: 2, c }, e: { r: 2, c: c + 3 } });
        fill(fills, 2, c, 3, c + 6, X_MASTERY);
        hdr[2].push('Check-in Grades (minimum of 1, max of 4)', '', '', '', '', '', '');
        hdr[3].push('P1 Check-in Grade', 'P2 Check-in Grade', 'P3.1 Check-in Grade', 'P3.2 Check-in Grade', 'Check-in Grades Average', 'Final Output/Presentation Grade', 'Project Overall Grade');
    }

    const rows = students.map((st, i) => {
        const sid = st.user_student_id;
        const row = [i + 1, st.student_id || '', st.name];
        for (let m = 1; m <= 14; m++) {
            const mg = grades[sid]?.[m] || {};
            row.push(
                mg.soc1 === 'A' ? 'A' : 'P', mg.soc2 === 'A' ? 'A' : 'P',
                xNum(mg.lets_practice), xNum(mg.lets_practice_optional),
                xNum(mg.reflection), xNum(mg.wrap_up_quiz),
            );
        }
        const proj = courseProjectSlots(sid, project);
        row.push(xNum(proj.checkins[0]), xNum(proj.checkins[1]), xNum(proj.checkins[2]), xNum(proj.checkins[3]), xNum(proj.checkinAvg), xNum(proj.finalOutput), xNum(proj.overall));
        return row;
    });

    return {
        name: 'Grading Input Sheet',
        headerRows: HR,
        cols: [{ wch: 4 }, { wch: 12 }, { wch: 22 }, ...Array(84).fill({ wch: 10 }), ...Array(7).fill({ wch: 12 })],
        merges,
        fills,
        aoa: [...hdr, ...rows],
    };
}

// ── 3 & 4. Grading Summary Sheet / FOR END OF SEM RETRIES Grading ────────
// Same structure in the reference file (the retries sheet is a second copy
// used during the retry period) — built by the same function under both names.
function buildGradingSummarySheet(sheetName, students, grades, project) {
    // 4 header rows, matching the reference: row0 = block title, rows1-2 =
    // "Weighted per Component Grade" sub-label (Grade Computation blocks) or
    // blank (the per-module component blocks merge their title across all 3
    // top rows instead), row3 = the individual field names.
    const HR = 4;
    const hdr = Array.from({ length: HR }, () => []);
    const merges = [];
    const fills = [];

    const infoCol = (label) => {
        const c = hdr[0].length;
        merges.push({ s: { r: 0, c }, e: { r: HR - 1, c } });
        fill(fills, 0, c, HR - 1, c, X_INFO);
        hdr[0].push(label);
        for (let r = 1; r < HR; r++) hdr[r].push('');
    };
    infoCol('#');
    infoCol('Student Number');
    infoCol('Name of Student');

    // "Grade Computation" blocks (P1/P2/P3): title on row0, "Weighted per
    // Component Grade" spanning rows1-2, field names on row3 — each field
    // colored by what it feeds into (EL green / Mastery blue / final grade).
    const gradeCompBlock = (title, titleStyle, fields, kinds) => {
        const c = hdr[0].length;
        const span = fields.length;
        merges.push({ s: { r: 0, c }, e: { r: 0, c: c + span - 1 } });
        fill(fills, 0, c, 0, c + span - 1, titleStyle);
        hdr[0].push(title, ...Array(span - 1).fill(''));
        merges.push({ s: { r: 1, c }, e: { r: 2, c: c + span - 1 } });
        fill(fills, 1, c, 2, c + span - 1, X_SUBTITLE);
        hdr[1].push('Weighted per Component Grade', ...Array(span - 1).fill(''));
        hdr[2].push(...Array(span).fill(''));
        hdr[3].push(...fields);
        kinds.forEach((k, i) => {
            const style = k === 'el' ? X_EL : k === 'mastery' ? X_MASTERY : X_FIELD;
            fill(fills, 3, c + i, 3, c + i, style);
        });
    };
    gradeCompBlock('P1 Grade Computation', X_TITLE,
        ['SOC (5%)', "Let's Practice (35%)", 'Reflection (15%)', 'EL Grade (CS 55%)', 'Wrap Up (15%)', 'Project (30%)', 'Mastery Grade (PE 45%)', 'P1 Grade (Modules 1-4)'],
        ['el', 'el', 'el', 'el', 'mastery', 'mastery', 'mastery', 'grade']);
    gradeCompBlock('P2 Grade Computation', X_TITLE_P2,
        ['SOC (5%)', "Let's Practice (35%)", 'Reflection (15%)', 'EL Grade (CS 55%)', 'Wrap Up (15%)', 'Project (30%)', 'Mastery Grade (PE 45%)', 'P2 Grade (Modules 1-9)'],
        ['el', 'el', 'el', 'el', 'mastery', 'mastery', 'mastery', 'grade']);
    gradeCompBlock('P3 Grade Computation', X_TITLE_P3,
        ['SOC (5%)', "Let's Practice (35%)", 'Reflection (15%)', 'EL Grade (CS 55%)', 'Wrap Up (15%)', 'Project (30%)', 'Mastery Grade (CFE 45%)', 'MASTERY Passing check', 'P3/Final Grade (Modules 1-14)', 'Remarks'],
        ['el', 'el', 'el', 'el', 'mastery', 'mastery', 'mastery', 'mastery', 'grade', 'grade']);

    // Per-module component blocks (SOC/LP/Reflection/WrapUp): title spans
    // all 3 top rows, row3 = Module 1-14 + the 3 period averages (17 cols).
    // SOC/LP/Reflection are Effortful Learning components (green); Wrap Up
    // feeds Mastery (blue).
    const componentBlock = (title, theme) => {
        const c = hdr[0].length;
        const span = 17;
        merges.push({ s: { r: 0, c }, e: { r: 2, c: c + span - 1 } });
        fill(fills, 0, c, 2, c + span - 1, theme === 'mastery' ? X_TITLE_MASTERY : X_TITLE);
        hdr[0].push(title, ...Array(span - 1).fill(''));
        hdr[1].push(...Array(span).fill(''));
        hdr[2].push(...Array(span).fill(''));
        const fields = [];
        for (let m = 1; m <= 14; m++) fields.push(`Module ${m}`);
        fields.push('P1 Component Grade (M1-4)', 'P2 Component Grade (M1-9)', 'Final Component Grade (M1-14)');
        hdr[3].push(...fields);
        fill(fills, 3, c, 3, c + span - 1, theme === 'mastery' ? X_MASTERY : X_EL);
    };
    componentBlock('SOC 1 and 2', 'el');
    componentBlock("Let's Practice", 'el');
    componentBlock('Reflection', 'el');
    componentBlock('Wrap Up', 'mastery');

    // Final Project/Output/Task block (7 cols) — same shape as Grading Input Sheet's.
    {
        const c = hdr[0].length;
        merges.push({ s: { r: 0, c }, e: { r: 1, c: c + 6 } });
        fill(fills, 0, c, 1, c + 6, X_TITLE_P3);
        hdr[0].push('Final Project/Output/Task (30%)', '', '', '', '', '', '');
        hdr[1].push('', '', '', '', '', '', '');
        merges.push({ s: { r: 2, c }, e: { r: 2, c: c + 3 } });
        fill(fills, 2, c, 3, c + 6, X_MASTERY);
        hdr[2].push('Check-in Grades (minimum of 1, max of 4)', '', '', '', '', '', '');
        hdr[3].push('P1 Check-in Grade', 'P2 Check-in Grade', 'P3.1 Check-in Grade', 'P3.2 Check-in Grade', 'Check-in Grades Average', 'Final Output/Presentation Grade', 'Overall Grade');
    }

    const rows = students.map((st, i) => {
        const sid = st.user_student_id;
        const { p1, p2, final, masteryStatus, remarks, modules } = computeStudentGrades(sid, grades, project);
        const row = [i + 1, st.student_id || '', st.name];

        // Weighted-points breakdown per period — computeStudentGrades() only
        // exposes the already-blended EL/Mastery/Grade, not each raw
        // component's contribution, so those are recomputed here from the
        // same per-module percentages (modules[m].soc / .letsPractice / etc).
        const compRow = (per, periodResult) => {
            const range   = PERIOD_MODULES[per];
            const socAvg  = periodComponentAvg(modules, range, 'soc');
            const lpAvg   = periodComponentAvg(modules, range, 'letsPractice');
            const reflAvg = periodComponentAvg(modules, range, 'reflection');
            const pg      = project[sid]?.[per] || {};
            const projOverall = projectOverallGrade(
                [pg.checkin1 ?? null, pg.checkin2 ?? null, pg.checkin3 ?? null, pg.checkin4 ?? null],
                pg.final_output ?? null
            );
            const wuqAvg = periodComponentAvg(modules, range, 'wrapUpQuiz');
            return [
                xNum(socAvg  !== null ? socAvg  / 100 * 5  : null),
                xNum(lpAvg   !== null ? lpAvg   / 100 * 35 : null),
                xNum(reflAvg !== null ? reflAvg / 100 * 15 : null),
                xNum(periodResult.el),
                xNum(wuqAvg  !== null ? wuqAvg  / 100 * 15 : null),
                xNum(projOverall !== null ? projOverall / 100 * 30 : null),
                xNum(periodResult.mastery),
                xNum(periodResult.grade),
            ];
        };
        row.push(...compRow('P1', p1));
        row.push(...compRow('P2', p2));
        row.push(...compRow('Final', final));
        row.push(masteryStatus || '', remarks || '');

        const moduleBlock = (key) => {
            for (let m = 1; m <= 14; m++) row.push(xNum(modules[m]?.[key] ?? null));
            row.push(
                xNum(periodComponentAvg(modules, PERIOD_MODULES.P1, key)),
                xNum(periodComponentAvg(modules, PERIOD_MODULES.P2, key)),
                xNum(periodComponentAvg(modules, PERIOD_MODULES.Final, key)),
            );
        };
        moduleBlock('soc');
        moduleBlock('letsPractice');
        moduleBlock('reflection');
        moduleBlock('wrapUpQuiz');

        const proj = courseProjectSlots(sid, project);
        row.push(xNum(proj.checkins[0]), xNum(proj.checkins[1]), xNum(proj.checkins[2]), xNum(proj.checkins[3]), xNum(proj.checkinAvg), xNum(proj.finalOutput), xNum(proj.overall));
        return row;
    });

    return {
        name: sheetName,
        headerRows: HR,
        cols: [{ wch: 4 }, { wch: 14 }, { wch: 22 }, ...Array(101).fill({ wch: 10 })],
        merges,
        fills,
        aoa: [...hdr, ...rows],
    };
}

// ── 5. For-SIS ─────────────────────────────────────────────────────────
// CS (Effortful/EL) and PE (Mastery) reported SEPARATELY per period — the
// SIS record wants the breakdown, not one blended number.
function buildForSisSheet(students, grades, project) {
    // 4 header rows, matching the reference: "Student Information"/"P1"/"P2"/
    // "P3" each span rows0-2, then row3 has the real per-column field names.
    const HR = 4;
    const hdr = Array.from({ length: HR }, () => []);
    const merges = [];
    const fills = [];
    const block = (title, fields, titleStyle, leafStyle) => {
        const c = hdr[0].length;
        const span = fields.length;
        merges.push({ s: { r: 0, c }, e: { r: 2, c: c + span - 1 } });
        fill(fills, 0, c, 2, c + span - 1, titleStyle);
        hdr[0].push(title, ...Array(span - 1).fill(''));
        hdr[1].push(...Array(span).fill(''));
        hdr[2].push(...Array(span).fill(''));
        hdr[3].push(...fields);
        fill(fills, 3, c, 3, c + span - 1, leafStyle);
    };
    block('Student Information', ['#', 'Student Number', 'Name of Student'], X_INFO, X_FIELD);
    block('P1', ['CS (Effortful)', 'PE (Mastery)'], X_TITLE, X_EL);
    block('P2', ['CS (Effortful)', 'PE (Mastery)'], X_TITLE_P2, X_EL);
    block('P3', ['CS (Final Effortful Grade)', 'CFE (Final Mastery Grade)'], X_TITLE_P3, X_EL);
    // "PE (Mastery)" leaf cells get the blue Mastery treatment even though
    // their block title stays period-green — recolor just those 2 cells.
    fill(fills, 3, 4, 3, 4, X_MASTERY);
    fill(fills, 3, 6, 3, 6, X_MASTERY);

    const rows = students.map((st, i) => {
        const sid = st.user_student_id;
        const { p1, p2, final } = computeStudentGrades(sid, grades, project);
        return [i + 1, st.student_id || '', st.name, xNum(p1.el), xNum(p1.mastery), xNum(p2.el), xNum(p2.mastery), xNum(final.el), xNum(final.mastery)];
    });
    return {
        name: 'For-SIS',
        headerRows: HR,
        cols: [{ wch: 4 }, { wch: 14 }, { wch: 24 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 18 }, { wch: 18 }],
        merges,
        fills,
        aoa: [...hdr, ...rows],
    };
}

// ── 6. Tab for Retries ────────────────────────────────────────────────
function buildTabForRetriesSheet(students, grades, project, retries) {
    const incStudents = students.filter(st => {
        const { remarks } = computeStudentGrades(st.user_student_id, grades, project);
        return remarks && remarks.startsWith('INC');
    });
    const rows = incStudents.map((st, i) => {
        const sid = st.user_student_id;
        const { remarks } = computeStudentGrades(sid, grades, project);
        const map = RETRY_REMARK_MAP[remarks] || { label: remarks || '' };
        const r = retries[sid] || {};
        return [
            i + 1, st.student_id || '', st.name, map.label || '',
            r.modules_for_retry || '', r.specific_activities || '',
            r.schedule_of_retry || '', r.status || '', r.notes || '',
        ];
    });
    return {
        name: 'Tab for Retries',
        headerRows: 1,
        cols: [{ wch: 4 }, { wch: 14 }, { wch: 24 }, { wch: 18 }, { wch: 24 }, { wch: 22 }, { wch: 20 }, { wch: 14 }, { wch: 24 }],
        merges: [],
        fills: [{ s: { r: 0, c: 0 }, e: { r: 0, c: 8 }, style: X_TITLE }],
        aoa: [
            ['#', 'Student Number', 'Name of Student', 'Remarks', 'Modules with Components for Retry', 'Specific Activities', 'Schedule of Retry', 'Status', 'Remarks/Notes'],
            ...rows,
        ],
    };
}

/** Builds the 6 sheets (as {name, aoa, merges, cols, headerRows}) shared by both the preview modal and the actual .xlsx download — matching the "global excel" reference file's own 6 tabs (Guide, Grading Input Sheet, Grading Summary Sheet, FOR END OF SEM RETRIES Grading, For-SIS, Tab for Retries). */
function buildExportSheets(subject, section, students, grades, project, retries) {
    return [
        buildGuideSheet(subject, section),
        buildGradingInputSheet(students, grades, project),
        buildGradingSummarySheet('Grading Summary Sheet', students, grades, project),
        buildGradingSummarySheet('FOR END OF SEM RETRIES Grading', students, grades, project),
        buildForSisSheet(students, grades, project),
        buildTabForRetriesSheet(students, grades, project, retries),
    ];
}

/** Renders one sheet's {aoa, merges, headerRows} as a read-only HTML table, respecting merged cells (rowspan/colspan) — used by the preview modal. */
function xlsxAoaToHtml({ aoa, merges = [], headerRows = 1, fills = [] }) {
    const covered = new Set();
    const spanAt  = new Map();
    merges.forEach(m => {
        const rs = m.e.r - m.s.r + 1, cs = m.e.c - m.s.c + 1;
        if (rs > 1 || cs > 1) spanAt.set(`${m.s.r},${m.s.c}`, { rowSpan: rs, colSpan: cs });
        for (let r = m.s.r; r <= m.e.r; r++) {
            for (let c = m.s.c; c <= m.e.c; c++) {
                if (r === m.s.r && c === m.s.c) continue;
                covered.add(`${r},${c}`);
            }
        }
    });
    const rowsHtml = aoa.map((row, r) => {
        const tag   = r < headerRows ? 'th' : 'td';
        const cells = row.map((cell, c) => {
            const key = `${r},${c}`;
            if (covered.has(key)) return '';
            const span  = spanAt.get(key);
            const attrs = span ? ` rowspan="${span.rowSpan}" colspan="${span.colSpan}"` : '';
            const st    = styleAt(fills, r, c);
            const style = st ? ` style="background:#${st.bg};color:#${st.fg};${st.bold ? 'font-weight:700' : ''}"` : '';
            return `<${tag}${attrs}${style}>${esc(cell ?? '')}</${tag}>`;
        }).join('');
        return `<tr>${cells}</tr>`;
    }).join('');
    return `<table class="ggb-xprev-table">${rowsHtml}</table>`;
}

function exportPreviewModalHtml(sheets) {
    return `
    <div class="ggb-xprev-overlay" id="ggb-xprev-overlay">
        <div class="ggb-xprev-modal" role="dialog" aria-label="Export Preview">
            <div class="ggb-xprev-hdr">
                <div>
                    <h3 class="ggb-xprev-title">Export Preview</h3>
                    <p class="ggb-xprev-sub">${sheets.length} sheets — review before downloading</p>
                </div>
                <button class="ggb-guide-close" id="ggb-xprev-close" aria-label="Close">${icon('close', { size: 14 })}</button>
            </div>
            <div class="ggb-xprev-tabs">
                ${sheets.map((s, i) => `<button class="ggb-xprev-tab${i === 0 ? ' active' : ''}" data-xtab="${i}">${esc(s.name)}</button>`).join('')}
            </div>
            <div class="ggb-xprev-body">
                ${sheets.map((s, i) => `<div class="ggb-xprev-pane${i === 0 ? '' : ' ggb-xprev-hidden'}" id="ggb-xprev-pane-${i}">${xlsxAoaToHtml(s)}</div>`).join('')}
            </div>
            <div class="ggb-xprev-ftr">
                <span class="ggb-xprev-hint">This matches exactly what will be in the downloaded .xlsx file.</span>
                <button class="gb-export-btn" id="ggb-xprev-download">${icon('download', { size: 13, className: 'ui-icon-inline' })} Download .xlsx</button>
            </div>
        </div>
    </div>`;
}

function openExportPreview(subject, section, students, grades, project, retries) {
    const sheets = buildExportSheets(subject, section, students, grades, project, retries);

    // Mount on <body> for the same z-index-stacking reason as the guide modal above.
    document.querySelectorAll('#ggb-xprev-overlay').forEach(el => el.remove());
    document.body.insertAdjacentHTML('beforeend', exportPreviewModalHtml(sheets));
    const overlay = document.getElementById('ggb-xprev-overlay');

    const close = () => overlay.remove();
    overlay.querySelector('#ggb-xprev-close').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    overlay.querySelectorAll('.ggb-xprev-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const i = tab.dataset.xtab;
            overlay.querySelectorAll('.ggb-xprev-tab').forEach(b => b.classList.toggle('active', b === tab));
            overlay.querySelectorAll('.ggb-xprev-pane').forEach(p => p.classList.toggle('ggb-xprev-hidden', p.id !== `ggb-xprev-pane-${i}`));
        });
    });

    const dlBtn = overlay.querySelector('#ggb-xprev-download');
    dlBtn.addEventListener('click', async () => {
        const orig = dlBtn.innerHTML;
        dlBtn.disabled = true;
        dlBtn.innerHTML = 'Preparing…';
        try {
            await downloadWorkbook(sheets, subject, section);
            close();
        } catch (err) {
            console.error('export xlsx:', err);
            dlBtn.disabled  = false;
            dlBtn.innerHTML = orig;
            showSaveError(null, err.message || 'Export failed');
        }
    });
}

/** Paints a sheet's `fills` rectangles onto its worksheet cells — needs xlsx-js-style (loadSheetJS()), stock SheetJS drops `.s` on write. */
function applyFills(ws, fills) {
    (fills || []).forEach(f => {
        for (let r = f.s.r; r <= f.e.r; r++) {
            for (let c = f.s.c; c <= f.e.c; c++) {
                const ref = window.XLSX.utils.encode_cell({ r, c });
                if (!ws[ref]) ws[ref] = { t: 's', v: '' };
                ws[ref].s = {
                    fill: { patternType: 'solid', fgColor: { rgb: f.style.bg } },
                    font: { bold: !!f.style.bold, color: { rgb: f.style.fg } },
                    alignment: { vertical: 'center', horizontal: 'center', wrapText: true },
                };
            }
        }
    });
}

async function downloadWorkbook(sheets, subject, section) {
    await loadSheetJS();
    const wb = window.XLSX.utils.book_new();
    sheets.forEach(s => {
        const ws = window.XLSX.utils.aoa_to_sheet(s.aoa);
        if (s.merges?.length) ws['!merges'] = s.merges;
        if (s.cols)           ws['!cols']   = s.cols;
        applyFills(ws, s.fills);
        // Excel sheet names: max 31 chars, no : \ / ? * [ ]
        const safeName = s.name.replace(/[:\\/?*[\]]/g, '').slice(0, 31);
        window.XLSX.utils.book_append_sheet(wb, ws, safeName);
    });
    const filename = `global-gradebook_${subject.subject_code}_${section.section_name}.xlsx`.replace(/[^\w.-]+/g, '_');
    window.XLSX.writeFile(wb, filename);
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
/* Override curriculumTableCss overflow:hidden — clip doesn't create a scroll context
   so position:sticky on td-id / td-name works against gb-table-scroll, not gc-cur-wrap */
.gc-cur-wrap { overflow:visible !important; }

/* ── Sticky freeze: # + Student ID + Name of Student (3 columns) ── */
/* # = 36px at 0 | ID = 110px at 36px | Name = 160px at 146px        */
.gc-th-info {
    position:sticky; z-index:4;
    background:#f7f7f7;
}
.gc-th-info:nth-child(1) { left:0;    min-width:36px; }
.gc-th-info:nth-child(2) { left:36px; min-width:110px; }
.gc-th-info:nth-child(3) { left:146px; min-width:160px; box-shadow:2px 0 8px rgba(0,0,0,.14); }
.th-left { text-align:left !important; }

/* Sticky body cells: #, Student ID, Name */
.ggb-module-table .td-rank,
.ggb-proj-table   .td-rank,
.ggb-summary-table .td-rank,
.ggb-sis-table    .td-rank,
.ggb-retries-table .td-rank {
    position:sticky; left:0; z-index:2;
    min-width:36px; background:#fff; text-align:center;
}
.ggb-module-table .td-id,
.ggb-proj-table   .td-id,
.ggb-summary-table .td-id,
.ggb-sis-table    .td-id,
.ggb-retries-table .td-id {
    position:sticky; left:36px; z-index:2;
    min-width:110px; background:#fff; white-space:nowrap;
}
.ggb-module-table .td-name,
.ggb-proj-table   .td-name,
.ggb-summary-table .td-name,
.ggb-sis-table    .td-name,
.ggb-retries-table .td-name {
    position:sticky; left:146px; z-index:2;
    min-width:160px; background:#fff; white-space:nowrap;
    box-shadow:2px 0 8px rgba(0,0,0,.10);
}

/* Zebra rows keep bg on sticky cells */
.gc-cur-table tbody tr:nth-child(even) .td-rank,
.gc-cur-table tbody tr:nth-child(even) .td-id,
.gc-cur-table tbody tr:nth-child(even) .td-name { background:#f9fafb; }
.gc-cur-table tbody tr:hover .td-rank,
.gc-cur-table tbody tr:hover .td-id,
.gc-cur-table tbody tr:hover .td-name { background:#f0fdf4; }

/* Select inputs */
.ggb-sel { padding:2px 1px; border:1px solid #d1d5db; border-radius:3px; font-size:10.5px;
    background:#fff; cursor:pointer; width:100%; }
.ggb-sel:focus { outline:none; border-color:#00461B; }
.ggb-wuq { min-width:64px; }
/* SOC (attendance) dropdown: show the actual letter — big, bold, centred —
   instead of a barely-visible sliver. Present stays neutral (it's the
   assumed default); Absent is flagged red so exceptions jump out while
   scanning a row. Class names are "ggb-soc-sel-*", kept apart from the
   unrelated "ggb-soc-p/-a" legend pills used in the grading guide modal. */
.ggb-soc { min-width:34px; padding:3px 2px; font-size:13px; font-weight:800;
    text-align:center; text-align-last:center; -moz-text-align-last:center; }
.ggb-soc-sel-p { color:${G}; background:${GL}; border-color:#A7D4B5; }
.ggb-soc-sel-a { color:#B91C1C; background:#FEF2F2; border-color:#FCA5A5; }
.ggb-num-input { width:62px; padding:3px 4px; border:1.5px solid #d1d5db; border-radius:4px;
    font-size:11px; text-align:center; font-family:inherit; }
.ggb-num-input:focus { outline:none; border-color:#00461B; }

/* Computed / grade cells — use table-qualified selector to beat shared .gc-cur-table .td-num */
.gc-cur-table .td-proj-overall { font-weight:700; color:#1B4D3E; }
.gc-cur-table .td-grade { background:#E8F5EC !important; color:#00461B !important; font-weight:800; }
.gc-cur-table .td-low   { color:#B91C1C !important; background:#FEF2F2 !important; }

/* Remarks cell pass/fail backgrounds */
.gc-cur-table td.gc-cur-badge-pass { background:#E8F5E9 !important; }
.gc-cur-table td.gc-cur-badge-fail { background:#FEF3C7 !important; }

/* Table min-widths */
.ggb-module-table { min-width:1400px; }
.ggb-module-table--single { min-width:0; }
.ggb-proj-table   { min-width:700px;  }

/* ── Module filter bar (Module Records tab) ── */
.ggb-module-filter-bar { display:flex; align-items:center; gap:12px; margin-bottom:14px; padding:11px 16px;
    background:#fff; border:1.5px solid ${BORDER}; border-radius:12px; flex-wrap:wrap;
    box-shadow:0 1px 2px rgba(16,24,40,.04); }
.ggb-module-filter-bar label { display:inline-flex; align-items:center; gap:6px; font-size:11px;
    font-weight:800; text-transform:uppercase; letter-spacing:.5px; color:${G}; white-space:nowrap; }
.ggb-module-filter-bar label svg { flex-shrink:0; }
.ggb-module-filter { appearance:none; -webkit-appearance:none; padding:8px 34px 8px 14px;
    border:1.5px solid #E5E7EB; border-radius:9px; background:#fff no-repeat right 12px center/11px;
    background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2300461B' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
    font-size:12.5px; font-weight:700; color:#111; cursor:pointer;
    font-family:inherit; min-width:200px; transition:border-color .15s, box-shadow .15s; }
.ggb-module-filter:hover  { border-color:#B9C1CC; }
.ggb-module-filter:focus  { outline:none; border-color:${G}; box-shadow:0 0 0 3px ${GL}; }
.ggb-module-filter-hint { display:inline-flex; align-items:center; gap:6px; font-size:11px; font-weight:700;
    color:${G}; background:${GL}; padding:5px 12px; border-radius:20px; margin-left:auto; white-space:nowrap; }
.ggb-module-filter-dot { width:6px; height:6px; border-radius:50%; background:${G}; flex-shrink:0; }

/* ── Quick-fill defaults bar (Module Records tab) ── */
.ggb-default-bar { display:flex; align-items:center; gap:10px; margin-bottom:14px; padding:10px 16px;
    background:${GL}; border:1.5px dashed ${G}; border-radius:12px; flex-wrap:wrap; }
.ggb-default-label { display:inline-flex; align-items:center; gap:6px; font-size:11px;
    font-weight:800; text-transform:uppercase; letter-spacing:.5px; color:${G}; white-space:nowrap; }
.ggb-default-field { display:inline-flex; align-items:center; gap:5px; font-size:11px; font-weight:700; color:#374151; }
.ggb-default-sel { appearance:none; -webkit-appearance:none; padding:5px 24px 5px 10px;
    border:1.5px solid #E5E7EB; border-radius:7px; background:#fff no-repeat right 8px center/9px;
    background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2300461B' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
    font-size:12px; font-weight:700; color:#111; cursor:pointer; font-family:inherit; }
.ggb-default-sel:focus { outline:none; border-color:${G}; box-shadow:0 0 0 3px #fff; }
.ggb-default-apply { padding:6px 14px; border-radius:8px; border:none; background:${G}; color:#fff;
    font-size:11.5px; font-weight:700; cursor:pointer; white-space:nowrap; }
.ggb-default-apply:hover { background:${G2}; }
.ggb-default-hint { font-size:10.5px; color:#3f6b52; flex-basis:100%; }

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
.ggb-sis-th-final { background:#FCE7F3 !important; }
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
.ggb-guide-btn { display:inline-flex; align-items:center; gap:5px; padding:6px 12px;
    border-radius:8px; border:1.5px solid #E5E7EB; background:#fff; color:#374151;
    font-size:12px; font-weight:600; cursor:pointer; }
.ggb-guide-btn:hover { border-color:${G}; color:${G}; background:${GL}; }

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

/* ── Export Preview Modal ── */
.ggb-xprev-overlay {
    position:fixed; inset:0; z-index:950;
    background:rgba(0,0,0,.5); display:flex;
    align-items:center; justify-content:center; padding:16px;
}
.ggb-xprev-modal {
    background:#fff; border-radius:14px;
    width:100%; max-width:1180px; height:88vh;
    display:flex; flex-direction:column;
    box-shadow:0 20px 60px rgba(0,0,0,.3);
    overflow:hidden;
}
.ggb-xprev-hdr {
    display:flex; justify-content:space-between; align-items:flex-start;
    padding:18px 22px 12px; border-bottom:1px solid ${BORDER}; flex-shrink:0;
}
.ggb-xprev-title { font-size:16px; font-weight:800; color:#111; margin:0 0 3px; }
.ggb-xprev-sub { font-size:12px; color:#6B7280; margin:0; }
.ggb-xprev-tabs {
    display:flex; gap:4px; padding:0 22px; border-bottom:1px solid ${BORDER};
    overflow-x:auto; flex-shrink:0;
}
.ggb-xprev-tab {
    padding:9px 14px; border:none; background:none; cursor:pointer;
    font-size:12.5px; font-weight:600; color:#6B7280; white-space:nowrap;
    border-bottom:2.5px solid transparent;
}
.ggb-xprev-tab:hover { color:${G}; }
.ggb-xprev-tab.active { color:${G}; border-bottom-color:${G}; }
.ggb-xprev-body { flex:1; overflow:auto; padding:16px 22px; }
.ggb-xprev-pane.ggb-xprev-hidden { display:none; }
.ggb-xprev-table { border-collapse:collapse; font-size:11.5px; white-space:nowrap; }
.ggb-xprev-table th, .ggb-xprev-table td { border:1px solid ${BORDER}; padding:5px 8px; text-align:center; }
.ggb-xprev-table th { background:${GL}; color:${G}; font-weight:700; }
.ggb-xprev-table td:nth-child(3) { text-align:left; }
.ggb-xprev-ftr {
    display:flex; justify-content:space-between; align-items:center;
    padding:14px 22px; border-top:1px solid ${BORDER}; flex-shrink:0; gap:12px;
}
.ggb-xprev-hint { font-size:11.5px; color:#9CA3AF; }
.ggb-xprev-ftr .gb-export-btn:disabled { opacity:.6; cursor:default; }

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
.gb-record-titlerow { display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap; }
.gb-record-title { font-size:17px; font-weight:800; color:#111; margin:0 0 3px; }
.gb-record-section { font-weight:500; color:#6B7280; }
.gb-record-meta { font-size:12px; color:#9CA3AF; margin:0; }
.gb-record-actions { display:flex; align-items:center; gap:8px; flex-shrink:0; }
.gb-record-count { font-size:12px; color:#9CA3AF; }
.ggb-export-btn { display:inline-flex; align-items:center; gap:5px; padding:6px 12px;
    border-radius:8px; border:1.5px solid ${G}; background:#fff; color:${G};
    font-size:12px; font-weight:700; cursor:pointer; }
.ggb-export-btn:hover { background:${GL}; }

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
