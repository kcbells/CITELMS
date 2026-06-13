/**
 * Instructor Gradebook — class record navigation
 * Subjects (boxes) → Sections (boxes) → Class record table (curriculum style)
 */
import { Api } from '../../api.js';
import { icon, iconLg } from '../../utils/icons.js';
import { subjectColor } from '../../utils/subject-colors.js';
import { curriculumTableCss, esc } from '../../utils/classroom-ui.js';
import {
    GRADING_PERIODS, buildPeriodGroups, periodQuizSubtotal, isItemMissing,
    gradingPeriodTableCss, periodMeta,
} from '../../utils/gradebook-periods.js';

const inl = { size: 14, className: 'ui-icon-inline' };
const G = '#00461B';
const G2 = '#006428';
const GL = '#E8F5EC';
const BORDER = '#E5E7EB';

let classesData = [];

export async function render(container) {
    const hashParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
    await renderGradebook(container, {
        subjectId: hashParams.get('subject_id') || '',
        sectionId: hashParams.get('section_id') || '',
        embedded: false,
    });
}

/** Embed inside open class Gradebook tab */
export async function mountInstructorGradebook(host, { subjectId } = {}) {
    await renderGradebook(host, {
        subjectId: subjectId || '',
        sectionId: '',
        embedded: true,
        lockSubject: !!subjectId,
    });
}

async function renderGradebook(container, opts = {}) {
    container.innerHTML = `
        <div class="gb-loading"><div class="gb-spin"></div></div>
        <style>${pageCss()}</style>
    `;

    const res = await Api.get('/SectionsAPI.php?action=instructor-classes');
    classesData = res.success ? (res.data || []) : [];

    const subjectId = opts.subjectId || '';
    const sectionId = opts.sectionId || '';

    if (sectionId && subjectId) {
        await renderClassRecord(container, opts);
    } else if (subjectId) {
        renderSectionsView(container, opts);
    } else {
        renderSubjectsView(container, opts);
    }
}

function navigate(container, opts, { subjectId = '', sectionId = '' } = {}) {
    const next = { ...opts, subjectId, sectionId };
    if (!opts.embedded) {
        const p = new URLSearchParams();
        if (subjectId) p.set('subject_id', subjectId);
        if (sectionId) p.set('section_id', sectionId);
        const hash = p.toString() ? `#instructor/gradebook?${p}` : '#instructor/gradebook';
        if (window.location.hash !== hash) {
            history.replaceState(null, '', hash);
        }
    }
    return renderGradebook(container, next);
}

/* ─── Level 1: Subject boxes ───────────────────────────────── */

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
                    ${subjects.map(s => subjectCard(s, opts)).join('')}
                </div>
                <p class="gb-no-results" id="gb-no-results" hidden>No subjects match your search.</p>
            `}
        </div>
    `;

    container.querySelectorAll('[data-gb-subject]').forEach(el => {
        el.addEventListener('click', (e) => {
            e.preventDefault();
            navigate(container, opts, { subjectId: el.dataset.gbSubject });
        });
    });

    const search = container.querySelector('#gb-search');
    const cards = [...container.querySelectorAll('.gb-subj-card')];
    search?.addEventListener('input', () => {
        const q = search.value.toLowerCase().trim();
        let n = 0;
        cards.forEach(c => {
            const show = !q || c.dataset.search.includes(q);
            c.hidden = !show;
            if (show) n++;
        });
        const nr = container.querySelector('#gb-no-results');
        const grid = container.querySelector('#gb-subj-grid');
        if (nr) nr.hidden = n > 0;
        if (grid) grid.style.display = n === 0 ? 'none' : '';
    });
}

function subjectCard(s, opts) {
    const color = subjectColor(s.subject_id);
    const sections = s.sections || [];
    const studentTotal = sections.reduce((n, x) => n + Number(x.student_count || 0), 0);
    const search = [s.subject_code, s.subject_name, s.program_code].filter(Boolean).join(' ').toLowerCase();

    return `
        <a href="#" class="gb-subj-card" data-gb-subject="${s.subject_id}" data-search="${esc(search)}">
            <div class="gb-subj-top" style="background:${color}">
                <span class="gb-subj-card-code">${esc(s.subject_code)}</span>
                <h3>${esc(s.subject_name)}</h3>
            </div>
            <div class="gb-subj-body">
                <div class="gb-stat-row">${icon('school', inl)} <strong>${sections.length}</strong> section${sections.length !== 1 ? 's' : ''}</div>
                <div class="gb-stat-row">${icon('users', inl)} <strong>${studentTotal}</strong> student${studentTotal !== 1 ? 's' : ''}</div>
                <span class="gb-subj-link">View class records →</span>
            </div>
        </a>
    `;
}

/* ─── Level 2: Section boxes ───────────────────────────────── */

function renderSectionsView(container, opts) {
    const subject = classesData.find(s => String(s.subject_id) === String(opts.subjectId));
    if (!subject) {
        container.innerHTML = `<style>${pageCss()}</style><div class="gb-page">${emptyBox('Subject not found.', true)}</div>`;
        container.querySelector('#gb-empty-back')?.addEventListener('click', () => navigate(container, opts));
        return;
    }

    const sections = subject.sections || [];
    const color = subjectColor(subject.subject_id);
    const backAction = opts.lockSubject && opts.embedded
        ? null
        : () => navigate(container, opts, { subjectId: '' });

    container.innerHTML = `
        <style>${pageCss()}${curriculumTableCss()}</style>
        <div class="gb-page ${opts.embedded ? 'gb-embedded' : ''}">
            ${backAction ? `<button type="button" class="gb-back" id="gb-back-subjects">
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                All Subjects
            </button>` : ''}
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
                : `<div class="gb-sec-grid">${sections.map(sec => sectionCard(subject, sec, opts)).join('')}</div>`
            }
        </div>
    `;

    container.querySelector('#gb-back-subjects')?.addEventListener('click', backAction);
    container.querySelectorAll('[data-gb-section]').forEach(el => {
        el.addEventListener('click', (e) => {
            e.preventDefault();
            navigate(container, opts, {
                subjectId: subject.subject_id,
                sectionId: el.dataset.gbSection,
            });
        });
    });
}

function sectionCard(subject, sec, opts) {
    const pct = sec.max_students > 0
        ? Math.round((Number(sec.student_count) / Number(sec.max_students)) * 100)
        : 0;

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
                    ${sec.room ? `<div>${icon('pin', inl)} ${esc(sec.room)}</div>` : ''}
                    <div>${icon('users', inl)} ${Number(sec.student_count || 0)} enrolled</div>
        </div>
                <div class="gb-sec-bar"><div class="gb-sec-fill" style="width:${pct}%"></div></div>
                <span class="gb-subj-link">View grades table →</span>
            </a>
        </article>
    `;
}

/* ─── Level 3: Class record table ──────────────────────────── */

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
        <style>${pageCss()}${curriculumTableCss()}</style>
        <div class="gb-page ${opts.embedded ? 'gb-embedded' : ''}">
            <button type="button" class="gb-back" id="gb-back-sections">
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                ${opts.lockSubject && opts.embedded ? 'All Sections' : esc(subject.subject_code)}
            </button>
            <div id="gb-record-host">
                <div class="gb-loading inline"><div class="gb-spin"></div><p>Loading class record…</p></div>
            </div>
        </div>
    `;

    container.querySelector('#gb-back-sections')?.addEventListener('click', () => {
        navigate(container, opts, { subjectId: subject.subject_id, sectionId: '' });
    });

    const host = container.querySelector('#gb-record-host');
    try {
        const record = await loadClassRecord(subject, section);
        const paint = () => {
            host.innerHTML = renderClassRecordTable(subject, section, record);
            host.querySelector('#gb-export-csv')?.addEventListener('click', () =>
                exportClassRecordCsv(subject, section, record)
            );
            host.querySelector('#gb-period-select')?.addEventListener('change', async (e) => {
                const sel = e.target;
                const period = sel.value;
                sel.disabled = true;
                const res = await Api.post('/GradebookAPI.php?action=set-current-period', {
                    subject_id: subject.subject_id,
                    section_id: section.section_id,
                    period,
                });
                sel.disabled = false;
                if (res.success) {
                    record.currentPeriod = res.data?.current_period || period;
                    paint();
                } else {
                    sel.value = record.currentPeriod;
                    alert(res.message || 'Could not update the current term.');
                }
            });
        };
        paint();
    } catch (err) {
        console.error('Class record load error:', err);
        host.innerHTML = emptyBox('Could not load class record. Please try again.');
    }
}

async function loadClassRecord(subject, section) {
    const offeredId = String(section.subject_offered_id || subject.subject_offered_id || '');

    const [quizRes, studRes, lessonRes, progressRes] = await Promise.all([
        Api.get(`/QuizzesAPI.php?action=instructor-list&subject_id=${subject.subject_id}`),
        Api.get(`/SectionsAPI.php?action=students&section_id=${section.section_id}`),
        Api.get(`/LessonsAPI.php?action=instructor-lessons&subject_id=${subject.subject_id}`),
        Api.get(`/GradebookAPI.php?action=lesson-progress&subject_id=${subject.subject_id}&section_id=${section.section_id}`),
    ]);

    let quizzes = (quizRes.success ? quizRes.data : []).filter(q => quizAppliesToSection(q, section.section_id));
    quizzes = quizzes.filter(q => q.status === 'published');
    quizzes = quizzes.sort((a, b) => String(a.quiz_title).localeCompare(String(b.quiz_title)));

    const lessons = (lessonRes.success ? lessonRes.data : []).filter(l => quizAppliesToSection(l, section.section_id));
    const lessonProgress = progressRes.success ? (progressRes.data?.progress || {}) : {};
    const currentPeriod = progressRes.success ? (progressRes.data?.current_period || 'P1') : 'P1';
    const periodGroups = buildPeriodGroups(quizzes, lessons, section.section_id);

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
            student_id: r.student_id || '',
            first_name: r.first_name || '',
            last_name: r.last_name || '',
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
    students.forEach(st => {
        matrix.set(st.student_id || `u${st.user_student_id}`, {
            ...st,
            quizScores: {},
            lessonStatus: {},
            rawEarned: 0,
            rawPossible: 0,
            periodTotals: {},
        });
    });

    scoreResults.forEach(({ quiz, scores }) => {
        const byStudent = new Map();
        scores.forEach(sc => {
            const key = sc.student_id || `${sc.first_name}_${sc.last_name}`;
            if (!byStudent.has(key)) byStudent.set(key, []);
            byStudent.get(key).push(sc);
        });

        for (const [, st] of matrix) {
            const schoolId = st.student_id;
            const attempts = schoolId
                ? (byStudent.get(schoolId) || [])
                : [...byStudent.values()].flat().filter(a =>
                    a.first_name === st.first_name && a.last_name === st.last_name
                );
            if (!attempts.length) {
                st.quizScores[quiz.quiz_id] = null;
                continue;
            }
            const best = attempts.reduce((a, b) =>
                parseFloat(a.earned_points || 0) >= parseFloat(b.earned_points || 0) ? a : b
            );
            const earned = parseFloat(best.earned_points || 0);
            const total = parseFloat(best.total_points || 0);
            const passed = attempts.some(a => a.passed == 1);
            st.quizScores[quiz.quiz_id] = { earned, total, passed };
        }
    });

    for (const [, st] of matrix) {
        st.lessonStatus = lessonProgress[st.user_student_id] || {};
        let rawEarned = 0;
        let rawPossible = 0;
        const periodTotals = {};
        for (const period of GRADING_PERIODS) {
            const sub = periodQuizSubtotal(st.quizScores, periodGroups.groups[period.code]);
            periodTotals[period.code] = sub;
            rawEarned += sub.earned;
            rawPossible += sub.possible;
        }
        st.rawEarned = rawEarned;
        st.rawPossible = rawPossible;
        st.periodTotals = periodTotals;
    }

    return { quizzes, lessons, periodGroups, currentPeriod, students: [...matrix.values()], lessonProgress, scoreResults };
}

function renderStudentItemCell(st, item) {
    if (item.kind === 'quiz') {
        const cell = st.quizScores[item.id];
        if (cell === null || cell === undefined) {
            const missing = isItemMissing(item);
            const label = missing ? 'Missing' : '—';
            const cls = missing ? 'gc-cur-badge-missing' : 'gc-cur-badge-none';
            return `<td class="td-num"><span class="${cls}">${label}</span></td>`;
        }
        return `<td class="td-num"><span class="gc-cur-badge-raw">${cell.earned}${cell.total ? ` / ${cell.total}` : ''}</span></td>`;
    }
    const status = st.lessonStatus?.[item.id];
    if (status === 'completed') {
        return `<td class="td-num"><span class="gc-cur-badge-pass">Done</span></td>`;
    }
    if (isItemMissing(item)) {
        return `<td class="td-num"><span class="gc-cur-badge-missing">Missing</span></td>`;
    }
    return `<td class="td-num"><span class="gc-cur-badge-none">—</span></td>`;
}

function renderPeriodTableHeaders(periodGroups, periods) {
    let periodRow = '<th rowspan="2">#</th><th rowspan="2" class="th-left">Student ID</th><th rowspan="2" class="th-left">Name</th>';
    let itemRow = '';

    for (const period of periods) {
        const items = periodGroups.groups[period.code];
        const colCount = Math.max(items.length, 1);
        periodRow += `<th colspan="${colCount}" class="gb-period-th gb-period-th--${period.code.toLowerCase()}">${period.label}<span class="gb-period-sub">${period.title}</span></th>`;
        periodRow += `<th rowspan="2" class="gb-period-subtotal-th">${period.label} Σ</th>`;
        if (items.length) {
            for (const item of items) {
                const typeLabel = item.kind === 'quiz' ? 'Quiz' : 'Activity';
                const short = item.title.length > 16 ? `${item.title.slice(0, 14)}…` : item.title;
                const pts = item.kind === 'quiz' && item.totalPoints ? ` · ${item.totalPoints}pts` : '';
                itemRow += `<th class="gb-item-th" title="${esc(item.title)} (${typeLabel})${pts}">
                    <span class="gb-item-type ${item.kind === 'quiz' ? 'quiz' : 'activity'}">${typeLabel}</span>
                    <span class="gb-item-name">${esc(short)}</span>
                </th>`;
            }
        } else {
            itemRow += `<th class="gb-item-th gb-item-th--empty">—</th>`;
        }
    }

    periodRow += '<th rowspan="2">Total</th><th rowspan="2">Remarks</th>';
    return { periodRow, itemRow };
}

function periodSelectorHtml(currentPeriod) {
    const meta = periodMeta(currentPeriod);
    return `
        <div class="gb-term-picker">
            <label class="gb-term-label" for="gb-period-select">Current term (released to students)</label>
            <select class="gb-term-select" id="gb-period-select">
                ${GRADING_PERIODS.map(p => `<option value="${p.code}" ${p.code === meta.code ? 'selected' : ''}>${p.label} — ${p.title}</option>`).join('')}
            </select>
        </div>`;
}

function renderClassRecordTable(subject, section, { periodGroups, students, currentPeriod = 'P1' }) {
    const meta = [
        esc(subject.subject_code),
        esc(section.section_name),
        section.schedule ? esc(section.schedule) : '',
        section.room ? esc(section.room) : '',
    ].filter(Boolean).join(' · ');

    const current = periodMeta(currentPeriod);
    const periods = GRADING_PERIODS.filter(p => p.code === current.code);
    const dispItems = periods.flatMap(p => periodGroups.groups[p.code]);
    const totalItems = dispItems.length;

    const headHtml = `
        <div class="gb-record-head">
            <span class="gb-role-pill">${icon('gradebook', inl)} Instructor view</span>
            <h2>Class Record</h2>
            <p>${meta}</p>
            ${periodSelectorHtml(current.code)}
            <p class="gb-period-legend">Showing <strong>${current.label} — ${current.title}</strong> only (current term). Switch the term above to release the next period. Activities show completion; quizzes show raw points.</p>
            <div class="gb-record-stats">
                <span><strong>${students.length}</strong> students</span>
                <span><strong>${totalItems}</strong> item${totalItems !== 1 ? 's' : ''} in ${current.label}</span>
                <button type="button" class="gb-export-btn" id="gb-export-csv">${icon('download', inl)} Export CSV</button>
            </div>
        </div>`;

    if (!students.length && !periodGroups.flat.length) {
        return `${headHtml}${emptyBox('No students or assessments yet for this section.')}`;
    }

    const { periodRow, itemRow } = renderPeriodTableHeaders(periodGroups, periods);

    const rows = students.map((st, i) => {
        const missingCount = countMissingItems(st, dispItems);
        let itemCells = '';
        let dispEarned = 0;
        let dispPossible = 0;
        for (const period of periods) {
            const items = periodGroups.groups[period.code];
            if (items.length) {
                itemCells += items.map(item => renderStudentItemCell(st, item)).join('');
            } else {
                itemCells += '<td class="td-num"><span class="gc-cur-badge-none">—</span></td>';
            }
            const sub = st.periodTotals?.[period.code] || { earned: 0, possible: 0 };
            dispEarned += sub.earned;
            dispPossible += sub.possible;
            const subLabel = sub.possible > 0
                ? `<strong>${sub.earned} / ${sub.possible}</strong>`
                : '<span class="gc-cur-badge-none">—</span>';
            itemCells += `<td class="td-num gb-period-subtotal-cell">${subLabel}</td>`;
        }

        const totalLabel = dispPossible > 0
            ? `<strong>${dispEarned} / ${dispPossible}</strong>`
            : '<span class="gc-cur-badge-none">—</span>';
        const quizItems = dispItems.filter(x => x.kind === 'quiz');
        const allPassed = quizItems.length > 0 && quizItems.every(q => {
            const c = st.quizScores[q.id];
            return c && c.passed;
        });
        const anyScore = dispPossible > 0;
        const belowPass = anyScore && dispEarned / dispPossible < 0.6;
        const atRisk = belowPass || missingCount >= 2;
        const remark = !anyScore && missingCount > 0 ? 'At risk'
            : !anyScore ? '—'
            : allPassed ? 'Passed'
            : atRisk ? 'At risk' : 'In progress';

        return `
            <tr class="${atRisk ? 'gb-at-risk' : ''}">
                <td class="td-rank">${i + 1}</td>
                <td class="td-id">${esc(st.student_id || '—')}</td>
                <td class="td-name">${esc(st.name)}${atRisk ? ' <span class="gb-risk-tag">!</span>' : ''}</td>
                ${itemCells}
                <td class="td-num">${totalLabel}</td>
                <td class="td-pass"><span class="${atRisk && anyScore ? 'gc-cur-badge-fail' : 'gc-cur-badge-pass'}">${remark}</span></td>
            </tr>
        `;
    }).join('');

    const footerCells = [];
    for (const period of periods) {
        const items = periodGroups.groups[period.code];
        if (items.length) {
            for (const item of items) {
                if (item.kind === 'quiz') {
                    const vals = students
                        .map(st => st.quizScores[item.id]?.earned)
                        .filter(v => v !== null && v !== undefined);
                    footerCells.push(vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : '—');
                } else {
                    const done = students.filter(st => st.lessonStatus?.[item.id] === 'completed').length;
                    footerCells.push(done ? `${done}/${students.length}` : '—');
                }
            }
        } else {
            footerCells.push('—');
        }
        footerCells.push('');
    }

    const footerItemCells = footerCells.map(a => `<td class="td-num" style="font-weight:700;background:#f7f7f7;">${a}</td>`).join('');

    return `
        ${headHtml}
        <div class="gc-cur-wrap">
            <div class="gc-cur-label">CLASS RECORD — ${esc(subject.subject_code)} / ${esc(section.section_name)} · ${current.label} ${current.title}</div>
            <div class="gb-table-scroll">
                <table class="gc-cur-table gb-record-table gb-period-table">
                    <thead>
                        <tr>${periodRow}</tr>
                        <tr>${itemRow}</tr>
                    </thead>
                    <tbody>${rows}</tbody>
                    ${totalItems ? `
                    <tfoot>
                        <tr class="gb-record-avg-row">
                            <td colspan="3" class="td-name" style="font-weight:700;text-align:right;padding-right:12px;">Class avg / completion</td>
                            ${footerItemCells}
                            <td colspan="2"></td>
                        </tr>
                    </tfoot>` : ''}
                </table>
            </div>
        </div>
    `;
}

function quizAppliesToSection(quiz, sectionId) {
    if (quiz.all_sections == 1 || quiz.all_sections === true) return true;
    const ids = (quiz.section_ids || []).map(Number);
    if (!ids.length) return true;
    return ids.includes(Number(sectionId));
}

function countMissingItems(student, items) {
    return items.filter(item => {
        if (item.kind === 'quiz') {
            return isItemMissing(item) && !student.quizScores[item.id];
        }
        const done = student.lessonStatus?.[item.id] === 'completed';
        return isItemMissing(item) && !done;
    }).length;
}

function exportClassRecordCsv(subject, section, { periodGroups, students, currentPeriod = 'P1' }) {
    const current = periodMeta(currentPeriod);
    const periods = GRADING_PERIODS.filter(p => p.code === current.code);
    const dispItems = periods.flatMap(p => periodGroups.groups[p.code]);

    const headers = ['#', 'Student ID', 'Name'];
    for (const period of periods) {
        const items = periodGroups.groups[period.code];
        for (const item of items) {
            const prefix = item.kind === 'quiz' ? 'Quiz' : 'Activity';
            headers.push(`${period.code} ${prefix}: ${item.title}`);
        }
        if (!items.length) headers.push(`${period.code} (empty)`);
        headers.push(`${period.code} Subtotal`);
    }
    headers.push('Total Score', 'Remarks');

    const body = students.map((st, i) => {
        const missingCount = countMissingItems(st, dispItems);
        let dispEarned = 0;
        let dispPossible = 0;
        for (const period of periods) {
            const sub = st.periodTotals?.[period.code] || { earned: 0, possible: 0 };
            dispEarned += sub.earned;
            dispPossible += sub.possible;
        }
        const belowPass = dispPossible > 0 && dispEarned / dispPossible < 0.6;
        const atRisk = belowPass || missingCount >= 2;
        const quizItems = dispItems.filter(x => x.kind === 'quiz');
        const allPassed = quizItems.length > 0 && quizItems.every(q => st.quizScores[q.id]?.passed);
        const remark = !dispPossible && missingCount > 0 ? 'At risk'
            : !dispPossible ? ''
            : allPassed ? 'Passed'
            : atRisk ? 'At risk' : 'In progress';

        const row = [i + 1, st.student_id || '', st.name];
        for (const period of periods) {
            const items = periodGroups.groups[period.code];
            if (items.length) {
                for (const item of items) {
                    if (item.kind === 'quiz') {
                        const c = st.quizScores[item.id];
                        if (c) row.push(c.total ? `${c.earned}/${c.total}` : String(c.earned));
                        else row.push(isItemMissing(item) ? 'Missing' : '');
                    } else {
                        const done = st.lessonStatus?.[item.id] === 'completed';
                        row.push(done ? 'Done' : (isItemMissing(item) ? 'Missing' : ''));
                    }
                }
            } else {
                row.push('');
            }
            const sub = st.periodTotals?.[period.code];
            row.push(sub?.possible > 0 ? `${sub.earned}/${sub.possible}` : '');
        }
        row.push(dispPossible > 0 ? `${dispEarned}/${dispPossible}` : '', remark);
        return row;
    });

    const csv = [headers, ...body]
        .map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
        .join('\r\n');

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `class-record_${subject.subject_code}_${section.section_name}.csv`.replace(/[^\w.-]+/g, '_');
    a.click();
    URL.revokeObjectURL(url);
}

/* ─── Shared UI ────────────────────────────────────────────── */

function renderBanner(title, sub) {
    return `
        <header class="gb-hero">
                        <div>
                <span class="gb-role-pill light">${icon('instructor', inl)} Instructor view</span>
                <h1 class="gb-hero-title">${esc(title)}</h1>
                <p class="gb-hero-sub">${esc(sub)}</p>
                            </div>
        </header>
    `;
}

function emptyBox(msg, showBack = false) {
    return `
        <div class="gb-empty-state">
            <div class="gb-empty-icon">${iconLg('clipboard')}</div>
            <p>${esc(msg)}</p>
            ${showBack ? '<button type="button" class="gb-btn-primary" id="gb-empty-back">Go back</button>' : ''}
                        </div>
    `;
}

function pageCss() {
    return `
        ${gradingPeriodTableCss()}
        .gb-page { width:100%; min-height:${''}; background:transparent; }
        .gb-embedded { padding:0; }
        .gb-loading { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px; min-height:280px; color:#9CA3AF; font-size:13px; }
        .gb-loading.inline { min-height:200px; }
        .gb-spin { width:40px; height:40px; border:3px solid #eee; border-top-color:${G}; border-radius:50%; animation:gbSpin .75s linear infinite; }
        @keyframes gbSpin { to { transform:rotate(360deg); } }

        .gb-hero { padding:24px 28px; margin-bottom:20px; border-radius:16px; color:#fff; background:${G};
            box-shadow:0 4px 16px rgba(0,70,27,.15); }
        .gb-hero-title { font-size:24px; font-weight:800; margin:8px 0 4px; }
        .gb-hero-sub { font-size:13px; opacity:.85; margin:0; }

        .gb-role-pill {
            display:inline-flex; align-items:center; gap:5px; padding:4px 10px; border-radius:20px;
            font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.5px;
            background:${GL}; color:${G};
        }
        .gb-role-pill.light { background:rgba(255,255,255,.18); color:#fff; }

        .gb-back { display:inline-flex; align-items:center; gap:6px; font-size:13px; font-weight:600;
            color:${G}; background:none; border:none; cursor:pointer; margin-bottom:16px; padding:0; }
        .gb-back:hover { text-decoration:underline; }

        .gb-toolbar { display:flex; align-items:center; gap:12px; margin-bottom:20px; padding:14px 16px;
            background:#F3F4F6; border-radius:12px; }
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

        .gb-subj-hero { display:flex; gap:0; border-radius:14px; overflow:hidden; margin-bottom:24px; background:#fff; border:1px solid ${BORDER}; }
        .gb-subj-hero-band { padding:24px 28px; color:#fff; min-width:220px; }
        .gb-subj-code { font-size:11px; font-weight:700; font-family:monospace; opacity:.9; }
        .gb-subj-hero-band h1 { font-size:22px; font-weight:800; margin:6px 0 4px; }
        .gb-subj-prog { font-size:12px; opacity:.85; }
        .gb-subj-hero-meta { flex:1; padding:24px 28px; display:flex; flex-direction:column; justify-content:center; gap:10px; }
        .gb-subj-hero-meta p { margin:0; color:#6B7280; font-size:14px; }

        .gb-sec-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:18px; }
        .gb-sec-card { border:1px solid ${BORDER}; border-radius:14px; background:#fff; overflow:hidden;
            transition:box-shadow .15s, transform .15s; }
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
        .gb-term-picker { display:flex; flex-direction:column; gap:6px; margin:10px 0; max-width:320px; }
        .gb-term-label { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.4px; color:#00461B; }
        .gb-term-select { padding:10px 14px; border:1.5px solid #00461B; border-radius:10px; font-size:14px;
            font-weight:700; color:#00461B; background:#F8FDF9; font-family:inherit; cursor:pointer; }
        .gb-term-select:disabled { opacity:.6; cursor:wait; }
        .gb-record-stats { display:flex; flex-wrap:wrap; gap:16px; align-items:center; font-size:13px; color:#374151; }
        .gb-record-stats strong { color:${G}; }
        .gb-export-btn { margin-left:auto; display:inline-flex; align-items:center; gap:6px; padding:8px 16px;
            border-radius:8px; border:1.5px solid ${G}; background:#fff; color:${G}; font-size:12px; font-weight:700; cursor:pointer; }
        .gb-export-btn:hover { background:${GL}; }

        .gb-at-risk { background:#FEF2F2 !important; }
        .gb-at-risk:hover { background:#FEE2E2 !important; }
        .gb-risk-tag { display:inline-flex; align-items:center; justify-content:center; width:16px; height:16px;
            border-radius:50%; background:#FEE2E2; color:#B91C1C; font-size:10px; font-weight:800; margin-left:4px; }
        .gc-cur-badge-missing { display:inline-block; padding:3px 8px; border-radius:6px; font-size:11px; font-weight:700;
            background:#FEF3C7; color:#B45309; }
        .gc-cur-badge-raw { font-size:12px; font-weight:700; color:#111827; }

        .gb-table-scroll { overflow-x:auto; }
        .gb-record-table { min-width:640px; }
        .gb-record-table tfoot .gb-record-avg-row td { border-top:2px solid #1B4D3E; font-size:11px; }

        .gb-empty-state { text-align:center; padding:48px 24px; border:2px dashed ${BORDER}; border-radius:16px; background:#FAFAFA; }
        .gb-empty-icon { margin-bottom:12px; color:#9CA3AF; }
        .gb-empty-state p { color:#6B7280; margin:0 0 16px; }
        .gb-no-results { text-align:center; color:#9CA3AF; padding:24px; }
        .gb-btn-primary { background:${G}; color:#fff; border:none; padding:10px 18px; border-radius:10px;
            font-size:13px; font-weight:700; cursor:pointer; }
        .gb-btn-primary:hover { background:${G2}; }

        @media(max-width:640px) {
            .gb-subj-hero { flex-direction:column; }
            .gb-subj-hero-band { min-width:0; }
        }
    `;
}
