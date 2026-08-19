/**
 * Student Grades — report card overview with expandable class record detail
 */
import { Api } from '../../api.js';
import { Auth } from '../../auth.js';
import { icon, iconLg } from '../../utils/icons.js';
import { curriculumTableCss, esc } from '../../utils/classroom-ui.js';
import { getFullName } from '../../utils/user-display.js';
import {
    buildPeriodGroups, isItemMissing, gradingPeriodTableCss,
} from '../../utils/gradebook-periods.js';
import { bindQuizReviewTriggers } from '../../components/student-quiz-review-modal.js';
import { computeStudentReport, formatGrade, PERIODS } from '../../utils/grading-engine.js';

const inl = { size: 14, className: 'ui-icon-inline' };
const G = '#00461B';
const GL = '#E8F5EC';
const BORDER = '#E5E7EB';

export async function render(container) {
    const hashParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
    const subjectId = hashParams.get('subject_id') || '';
    try {
        await renderGradesView(container, { subjectId, embedded: false });
    } catch (err) {
        console.error('Grades render error:', err);
        container.innerHTML = `<style>${pageCss()}</style><div class="rc-page-wrap">${emptyBox('Something went wrong loading your grades. Please refresh and try again.')}</div>`;
    }
}

/** Embed student grades inside a subject tab */
export async function mountStudentGrades(host, { subjectId } = {}) {
    try {
        await renderGradesView(host, { subjectId, embedded: true, lockSubject: true });
    } catch (err) {
        console.error('Grades mount error:', err);
        host.innerHTML = `<style>${pageCss()}</style>${emptyBox('Could not load class record. Please refresh.')}`;
    }
}

async function renderGradesView(container, { subjectId = '', embedded = false, lockSubject = false } = {}) {
    container.innerHTML = `<div class="sg-loading"><div class="sg-spin"></div></div><style>${pageCss()}</style>`;

    await Auth.getUser?.();
    const me = Auth.user?.() || {};
    const myName = getFullName(me) || 'Student';
    const myStudentId = me.student_id || me.user_id || '';

    const res = await Api.get('/ProgressAPI.php?action=grades');
    const subjects = res.success ? (res.data || []) : [];

    if (!res.success) {
        container.innerHTML = `<style>${pageCss()}</style><div class="rc-page-wrap">${emptyBox('Could not load grades. Please try again.')}</div>`;
        return;
    }

    if (subjects.length === 0) {
        container.innerHTML = `<style>${pageCss()}</style><div class="rc-page-wrap ${embedded ? 'sg-embedded' : ''}">
            ${emptyBox(lockSubject ? 'No scores recorded for this subject yet.' : 'Enroll in subjects and complete classwork to see your report card here.')}
        </div>`;
        return;
    }

    await attachGlobalReports(subjects);

    if (embedded && lockSubject) {
        const activeId = subjectId || String(subjects[0]?.subject_id || '');
        const subject = subjects.find(s => String(s.subject_id) === String(activeId)) || subjects[0];
        if (subject) renderClassRecordOnly(container, { subject, myName, myStudentId });
        return;
    }

    renderReportCardPage(container, { subjects, myName, myStudentId, me });
}

/**
 * For subjects the dean set to Global grading, fetch the student's own
 * module/project grades and compute the same EL/Mastery report used in the
 * instructor's Summary & Remarks tab — attached as subject._globalReport so
 * the report card reflects the actual grading standard for that subject
 * instead of a generic raw quiz-score average.
 */
async function attachGlobalReports(subjects) {
    const globalSubjects = subjects.filter(s => s.grading_type === 'global' && s.subject_offered_id);
    if (!globalSubjects.length) return;

    await Promise.all(globalSubjects.map(async (subject) => {
        try {
            const res = await Api.get(`/GlobalGradebookAPI.php?action=student-summary&subject_offered_id=${subject.subject_offered_id}`);
            if (!res.success) return;
            const { modules = {}, project = {} } = res.data || {};
            subject._globalReport = computeStudentReport({
                getModuleInput: (m) => {
                    const mg = modules[m] || {};
                    return {
                        soc1: mg.soc1 ?? null,
                        soc2: mg.soc2 ?? null,
                        letsPractice: mg.lets_practice ?? null,
                        letsPracticeOptional: mg.lets_practice_optional ?? null,
                        reflection: mg.reflection ?? null,
                        wrapUpQuiz: mg.wrap_up_quiz ?? null,
                    };
                },
                getPeriodProject: (period) => {
                    const pg = project[period] || {};
                    return {
                        checkins: [pg.checkin1 ?? null, pg.checkin2 ?? null, pg.checkin3 ?? null, pg.checkin4 ?? null],
                        finalOutput: pg.final_output ?? null,
                    };
                },
            });
        } catch (err) {
            console.error('Global report fetch failed:', subject.subject_id, err);
        }
    }));
}

/* ─── Report Card page ──────────────────────────────────────── */

function buildSubjectSummary(subject) {
    if (subject._globalReport) {
        const { periods, masteryStatus, remarks } = subject._globalReport;
        const pct = periods.Final.periodGrade;
        const hasGrade = pct !== null && pct !== undefined;
        const statusCls = remarks === 'Passed' ? 'pass' : remarks?.startsWith('INC') ? 'fail' : 'none';
        return {
            earned: hasGrade ? Number(pct.toFixed(1)) : 0,
            possible: hasGrade ? 100 : 0,
            pct: hasGrade ? pct : null,
            passedQuizzes: 0, totalQuizzes: 0, completedLessons: 0, totalLessons: 0,
            status: remarks || (masteryStatus ? masteryStatus : 'No scores yet'),
            statusCls, hasGrade, isGlobal: true,
        };
    }
    const quizzes = subject.quizzes || [];
    const lessons = subject.lessons || [];

    let earned = 0, possible = 0;
    for (const q of quizzes) {
        if (q.earned_points != null && q.earned_points !== '') earned += parseFloat(q.earned_points) || 0;
        if (q.total_points) possible += parseFloat(q.total_points) || 0;
    }

    const pct = possible > 0 ? earned / possible * 100 : null;
    const passedQuizzes = quizzes.filter(q => q.passed == 1).length;
    const totalQuizzes = quizzes.length;
    const completedLessons = lessons.filter(l => l.progress_status === 'completed').length;
    const totalLessons = lessons.length;

    let status, statusCls;
    if (pct === null) {
        status = totalQuizzes > 0 || totalLessons > 0 ? 'No scores yet' : 'No content';
        statusCls = 'none';
    } else if (pct >= 75) {
        status = 'Passing';
        statusCls = 'pass';
    } else if (pct >= 60) {
        status = 'Borderline';
        statusCls = 'warn';
    } else {
        status = 'Below passing';
        statusCls = 'fail';
    }

    return { earned, possible, pct, passedQuizzes, totalQuizzes, completedLessons, totalLessons, status, statusCls, hasGrade: pct !== null };
}

function renderReportCardPage(container, { subjects, myName, myStudentId, me }) {
    const summaries = subjects.map(s => buildSubjectSummary(s));

    let overallEarned = 0, overallPossible = 0;
    let totalPassedQ = 0, totalQ = 0, totalDone = 0, totalLessons = 0;
    for (const s of summaries) {
        overallEarned   += s.earned;
        overallPossible += s.possible;
        totalPassedQ    += s.passedQuizzes;
        totalQ          += s.totalQuizzes;
        totalDone       += s.completedLessons;
        totalLessons    += s.totalLessons;
    }
    const overallPct = overallPossible > 0 ? overallEarned / overallPossible * 100 : null;
    const overallStatusCls = overallPct === null ? 'none' : overallPct >= 75 ? 'pass' : overallPct >= 60 ? 'warn' : 'fail';
    const overallStatus    = overallPct === null ? 'No scores yet' : overallPct >= 75 ? 'Passing' : overallPct >= 60 ? 'Borderline' : 'Below passing';

    const firstSub = subjects[0] || {};
    const semLabel   = firstSub.semester_name || firstSub.semester || '';
    const schoolYear = firstSub.school_year || firstSub.academic_year || '';
    const campus     = me.campus_name || '';

    const rows = subjects.map((s, i) => {
        const sm = summaries[i];
        const scoreStr = sm.hasGrade ? `${sm.earned} / ${sm.possible}` : '—';
        const pctStr   = sm.pct !== null ? `${sm.pct.toFixed(1)}%` : '—';
        const barW     = sm.pct !== null ? Math.min(100, sm.pct).toFixed(1) : 0;

        return `
        <tr class="rc-row">
            <td class="rc-td rc-num">${i + 1}</td>
            <td class="rc-td"><strong>${esc(s.subject_code)}</strong></td>
            <td class="rc-td rc-subj-name">${esc(s.subject_name)}${s.section_name ? `<div class="rc-section-lbl">${esc(s.section_name)}</div>` : ''}</td>
            <td class="rc-td rc-inst">${esc(s.instructor_name || '—')}</td>
            <td class="rc-td rc-score-td">
                <div class="rc-grade-val">${scoreStr}</div>
                <div class="rc-bar-wrap"><div class="rc-bar ${sm.statusCls}" style="width:${barW}%"></div></div>
            </td>
            <td class="rc-td rc-pct-td"><strong>${pctStr}</strong></td>
            <td class="rc-td rc-center">${sm.totalQuizzes > 0 ? `${sm.passedQuizzes}/${sm.totalQuizzes}` : '—'}</td>
            <td class="rc-td rc-center">${sm.totalLessons > 0 ? `${sm.completedLessons}/${sm.totalLessons}` : '—'}</td>
            <td class="rc-td"><span class="rc-status ${sm.statusCls}">${sm.status}</span></td>
            <td class="rc-td rc-action-td">
                <button type="button" class="rc-detail-btn" data-rc-toggle="${i}">Details</button>
            </td>
        </tr>
        <tr class="rc-expand-row" data-detail="${i}" style="display:none">
            <td colspan="10" style="padding:0;border-bottom:2px solid ${G}">
                <div class="rc-detail-panel" id="rc-detail-${i}"></div>
            </td>
        </tr>`;
    }).join('');

    const infoRows = [
        ['Student Name', myName],
        ['Student ID', myStudentId || '—'],
        schoolYear ? ['School Year', schoolYear] : null,
        semLabel   ? ['Semester',    semLabel]   : null,
        campus     ? ['Campus',      campus]     : null,
        ['Overall Standing', `<span class="rc-status ${overallStatusCls}">${overallStatus}</span>`],
    ].filter(Boolean);

    container.innerHTML = `
        <style>${pageCss()}${curriculumTableCss()}</style>
        <div class="rc-page-wrap">
            <div class="rc-doc">

                <!-- School header -->
                <div class="rc-school-hdr">
                    <img class="rc-logo" src="../assets/images/app-icon.png" alt="PHINMA COC">
                    <div class="rc-school-text">
                        <div class="rc-school-name">PHINMA — CAGAYAN DE ORO COLLEGE</div>
                        <div class="rc-doc-title">STUDENT REPORT CARD</div>
                    </div>
                    <button type="button" class="rc-print-btn" onclick="window.print()">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                        Print
                    </button>
                </div>

                <!-- Student info -->
                <div class="rc-student-info">
                    ${infoRows.map(([label, val]) => `
                    <div class="rc-info-row">
                        <span class="rc-label">${label}</span>
                        <strong>${val}</strong>
                    </div>`).join('')}
                </div>

                <!-- Table -->
                <div class="rc-body">
                    <div class="rc-section-title">ACADEMIC PERFORMANCE</div>
                    <div class="rc-table-wrap">
                        <table class="rc-table">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Code</th>
                                    <th>Subject</th>
                                    <th>Instructor</th>
                                    <th>Score</th>
                                    <th>%</th>
                                    <th>Quizzes</th>
                                    <th>Activities</th>
                                    <th>Remarks</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>${rows}</tbody>
                        </table>
                    </div>
                </div>

                <!-- Summary bar -->
                <div class="rc-summary-bar">
                    <div class="rc-summary-item">
                        <div class="rc-summary-label">Total Score</div>
                        <div class="rc-summary-value">${overallPossible > 0 ? `${overallEarned}/${overallPossible}` : '—'}</div>
                    </div>
                    <div class="rc-summary-item">
                        <div class="rc-summary-label">Average</div>
                        <div class="rc-summary-value">${overallPct !== null ? `${overallPct.toFixed(1)}%` : '—'}</div>
                    </div>
                    <div class="rc-summary-item">
                        <div class="rc-summary-label">Quizzes Passed</div>
                        <div class="rc-summary-value">${totalPassedQ} / ${totalQ}</div>
                    </div>
                    <div class="rc-summary-item">
                        <div class="rc-summary-label">Activities Done</div>
                        <div class="rc-summary-value">${totalDone} / ${totalLessons}</div>
                    </div>
                    <div class="rc-summary-item">
                        <div class="rc-summary-label">Subjects</div>
                        <div class="rc-summary-value">${subjects.length}</div>
                    </div>
                </div>

            </div>
        </div>
    `;

    container.querySelectorAll('[data-rc-toggle]').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.rcToggle, 10);
            const expandRow = container.querySelector(`[data-detail="${idx}"]`);
            const panel = container.querySelector(`#rc-detail-${idx}`);
            const isOpen = btn.classList.toggle('open');
            btn.textContent = isOpen ? 'Hide' : 'Details';
            if (expandRow) expandRow.style.display = isOpen ? '' : 'none';

            if (isOpen && panel && !panel.dataset.loaded) {
                panel.dataset.loaded = '1';
                const subject = subjects[idx];
                if (subject._globalReport) {
                    panel.innerHTML = renderGlobalSummaryTable(subject, myName, myStudentId);
                } else {
                    const record = buildStudentRecord(subject, myName, myStudentId);
                    panel.innerHTML = renderClassRecordTable(subject, record, { embedded: true });
                    bindQuizReviewTriggers(panel);
                }
            }
        });
    });
}

/* ─── Embedded class record (subject tab) ───────────────────── */

function renderClassRecordOnly(container, { subject, myName, myStudentId }) {
    if (subject._globalReport) {
        container.innerHTML = `
            <style>${pageCss()}${curriculumTableCss()}</style>
            <div class="sg-page sg-embedded">
                <div id="sg-record-host">${renderGlobalSummaryTable(subject, myName, myStudentId)}</div>
            </div>
        `;
        return;
    }
    const record = buildStudentRecord(subject, myName, myStudentId);
    container.innerHTML = `
        <style>${pageCss()}${curriculumTableCss()}</style>
        <div class="sg-page sg-embedded">
            <div id="sg-record-host">${renderClassRecordTable(subject, record, { embedded: true })}</div>
        </div>
    `;
    bindQuizReviewTriggers(container);
}

/* ─── Build student record (all items, no period filter) ────── */

function buildStudentRecord(subject, myName, myStudentId) {
    const quizzes = subject.quizzes || [];
    const lessons = subject.lessons || [];
    const periodGroups = buildPeriodGroups(quizzes, lessons, 0);
    const allItems = periodGroups.flat;

    const quizScoreMap = {};
    for (const q of quizzes) {
        const hasAttempt = Number(q.attempts) > 0 || q.best_attempt_id != null || q.best_score != null;
        if (!hasAttempt) continue;
        const earned = q.earned_points != null && q.earned_points !== '' ? parseFloat(q.earned_points) : 0;
        let total = parseFloat(q.total_points);
        if (!Number.isFinite(total) || total < 0) total = 0;
        quizScoreMap[q.quiz_id] = {
            earned, total,
            passed: q.passed == 1,
            best_attempt_id: q.best_attempt_id,
            pending: q.has_pending_grades == 1,
        };
    }

    const lessonStatusMap = {};
    for (const l of lessons) {
        lessonStatusMap[l.lessons_id] = l.progress_status;
    }

    let totalEarned = 0, totalPossible = 0, missingCount = 0;
    for (const item of allItems) {
        if (item.kind === 'quiz') {
            const cell = quizScoreMap[item.id];
            if (cell) {
                totalEarned   += parseFloat(cell.earned) || 0;
                totalPossible += parseFloat(cell.total)  || 0;
            } else if (isItemMissing(item)) {
                missingCount++;
            }
        } else if (lessonStatusMap[item.id] !== 'completed' && isItemMissing(item)) {
            missingCount++;
        }
    }

    const quizItems = allItems.filter(i => i.kind === 'quiz');
    const anyScore  = totalPossible > 0;
    const allPassed = quizItems.length > 0 && quizItems.every(q => quizScoreMap[q.id]?.passed);
    const belowPass = anyScore && totalEarned / totalPossible < 0.6;
    const atRisk    = belowPass || missingCount >= 2;
    const remark    = !anyScore && missingCount > 0 ? 'At risk'
        : !anyScore ? '—'
        : allPassed ? 'Passed'
        : atRisk ? 'At risk' : 'In progress';

    const completedLessons = lessons.filter(l => l.progress_status === 'completed').length;

    return {
        allItems, quizScoreMap, lessonStatusMap, quizzes,
        totalEarned, totalPossible, missingCount, atRisk, remark, anyScore,
        myName, myStudentId, completedLessons, totalLessons: lessons.length,
        passedQuizzes: quizzes.filter(q => q.passed == 1).length,
        totalQuizzes: quizzes.length,
    };
}

/* ─── Table headers ─────────────────────────────────────────── */

function renderTableHeaders(allItems) {
    const colCount = Math.max(allItems.length, 1);
    let periodRow = `<th rowspan="2">#</th><th rowspan="2" class="th-left">Student ID</th><th rowspan="2" class="th-left">Name</th>`;
    periodRow += `<th colspan="${colCount}" class="gb-period-th gb-period-th--p1">Activities &amp; Quizzes</th>`;
    periodRow += `<th rowspan="2">Total</th><th rowspan="2">Remarks</th>`;

    let itemRow = '';
    if (allItems.length) {
        for (const item of allItems) {
            const typeLabel = item.kind === 'quiz' ? 'Quiz' : 'Activity';
            const short     = item.title.length > 16 ? `${item.title.slice(0, 14)}…` : item.title;
            const pts       = item.kind === 'quiz' && item.totalPoints ? ` · ${item.totalPoints}pts` : '';
            itemRow += `<th class="gb-item-th" title="${esc(item.title)} (${typeLabel})${pts}">
                <span class="gb-item-type ${item.kind === 'quiz' ? 'quiz' : 'activity'}">${typeLabel}</span>
                <span class="gb-item-name">${esc(short)}</span>
            </th>`;
        }
    } else {
        itemRow += `<th class="gb-item-th gb-item-th--empty">—</th>`;
    }

    return { periodRow, itemRow };
}

function renderStudentItemCell(record, item) {
    const { quizScoreMap, lessonStatusMap, quizzes } = record;

    if (item.kind === 'quiz') {
        const cell = quizScoreMap[item.id];
        if (!cell) {
            const missing = isItemMissing(item);
            return `<td class="td-num"><span class="${missing ? 'gc-cur-badge-missing' : 'gc-cur-badge-none'}">${missing ? 'Missing' : '—'}</span></td>`;
        }
        const scoreHtml = cell.pending && cell.earned === 0 ? 'Submitted' : `${cell.earned}`;
        const q = quizzes.find(x => String(x.quiz_id) === String(item.id));
        const inner = q?.best_attempt_id
            ? `<button type="button" class="sg-cell-link sg-review-btn" data-quiz-review="${q.best_attempt_id}" title="See your answers">${scoreHtml}</button>`
            : scoreHtml;
        return `<td class="td-num"><span class="gc-cur-badge-raw">${inner}</span></td>`;
    }

    const done = lessonStatusMap[item.id] === 'completed';
    if (done) return `<td class="td-num"><span class="gc-cur-badge-pass">Done</span></td>`;
    if (isItemMissing(item)) return `<td class="td-num"><span class="gc-cur-badge-missing">Missing</span></td>`;
    return `<td class="td-num"><span class="gc-cur-badge-none">—</span></td>`;
}

/* ─── Class record table (expandable detail / embedded) ─────── */

function renderClassRecordTable(subject, record, { embedded = false } = {}) {
    const {
        allItems, totalEarned, totalPossible, atRisk, remark, anyScore,
        myName, myStudentId, completedLessons, totalLessons,
        passedQuizzes, totalQuizzes,
    } = record;

    const meta = [
        esc(subject.subject_code),
        esc(subject.subject_name),
        subject.section_name ? esc(subject.section_name) : '',
        subject.instructor_name ? `Instructor: ${esc(subject.instructor_name)}` : '',
    ].filter(Boolean).join(' · ');

    const totalLabel = totalPossible > 0
        ? `<strong>${totalEarned} / ${totalPossible}</strong>`
        : '<span class="gc-cur-badge-none">—</span>';

    const totalItems = allItems.length;
    const headHtml = `
        <div class="gb-record-head">
            <span class="gb-role-pill">${icon('gradebook', inl)} Student view</span>
            <h2>Class Record</h2>
            <p>${meta}</p>
            <p class="gb-period-legend">All published activities and quizzes. Activities show completion status; quizzes show your raw score.</p>
            <div class="gb-record-stats">
                <span><strong>1</strong> student (you)</span>
                <span><strong>${totalItems}</strong> item${totalItems !== 1 ? 's' : ''}</span>
                <span><strong>${passedQuizzes}/${totalQuizzes}</strong> quizzes passed</span>
                <span><strong>${completedLessons}/${totalLessons}</strong> activities done</span>
                ${totalPossible > 0 ? `<span class="gb-total-pill"><strong>${totalEarned} / ${totalPossible}</strong> total</span>` : ''}
            </div>
        </div>`;

    if (!allItems.length) {
        return `${headHtml}${emptyBox('No activities or quizzes published for this subject yet.')}`;
    }

    const { periodRow, itemRow } = renderTableHeaders(allItems);

    let itemCells = '';
    for (const item of allItems) itemCells += renderStudentItemCell(record, item);

    const studentRow = `
        <tr class="${atRisk ? 'gb-at-risk' : ''}">
            <td class="td-rank">1</td>
            <td class="td-id">${esc(myStudentId || '—')}</td>
            <td class="td-name">${esc(myName)}${atRisk ? ' <span class="gb-risk-tag">!</span>' : ''}</td>
            ${itemCells}
            <td class="td-num">${totalLabel}</td>
            <td class="td-pass"><span class="${atRisk && anyScore ? 'gc-cur-badge-fail' : 'gc-cur-badge-pass'}">${remark}</span></td>
        </tr>`;

    return `
        ${headHtml}
        <div class="gc-cur-wrap">
            <div class="gc-cur-label">CLASS RECORD — ${esc(subject.subject_code)}${subject.section_name ? ` / ${esc(subject.section_name)}` : ''}</div>
            <div class="gb-table-scroll">
                <table class="gc-cur-table gb-record-table gb-period-table">
                    <thead>
                        <tr>${periodRow}</tr>
                        <tr>${itemRow}</tr>
                    </thead>
                    <tbody>${studentRow}</tbody>
                </table>
            </div>
        </div>
        ${embedded ? '' : `
        <p class="sg-footnote">
            ${icon('info', { size: 14, className: 'ui-icon-inline' })}
            Quizzes show your raw score. Activities show completion status.
        </p>`}
    `;
}

/* ─── Global (EL/Mastery) grading summary ────────────────────── */
/* Mirrors the instructor's Summary & Remarks tab in global-gradebook.js —
   same periods, same formulas — just for this one student. */

function renderGlobalSummaryTable(subject, myName, myStudentId) {
    const { periods, masteryStatus, remarks } = subject._globalReport;
    const toRow = (p) => periods[p];
    const p1 = toRow('P1'), p2 = toRow('P2'), final = toRow('Final');
    const passClass = remarks === 'Passed' ? 'gc-cur-badge-pass' : remarks?.startsWith('INC') ? 'gc-cur-badge-fail' : 'gc-cur-badge-none';
    const fmt = formatGrade;

    const meta = [
        esc(subject.subject_code), esc(subject.subject_name),
        subject.section_name ? esc(subject.section_name) : '',
        subject.instructor_name ? `Instructor: ${esc(subject.instructor_name)}` : '',
    ].filter(Boolean).join(' · ');

    return `
        <div class="gb-record-head">
            <span class="gb-role-pill">${icon('gradebook', inl)} Student view</span>
            <h2>Global Grading Summary</h2>
            <p>${meta}</p>
            <p class="gb-period-legend">Effortful Learning / Mastery model — the same standard shown on your instructor's Summary &amp; Remarks sheet.</p>
        </div>
        <div class="gc-cur-wrap">
            <div class="gc-cur-label">SUMMARY &amp; REMARKS — ${esc(subject.subject_code)}${subject.section_name ? ` / ${esc(subject.section_name)}` : ''}</div>
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
                    <tbody>
                        <tr>
                            <td class="td-rank">1</td>
                            <td class="td-id">${esc(myStudentId || '—')}</td>
                            <td class="td-name">${esc(myName)}</td>
                            <td class="td-num${p1.effortfulLearningGrade !== null && p1.effortfulLearningGrade < 60 ? ' td-low' : ''}">${fmt(p1.effortfulLearningGrade)}</td>
                            <td class="td-num${p1.masteryGrade !== null && p1.masteryGrade < 80 ? ' td-low' : ''}">${fmt(p1.masteryGrade)}</td>
                            <td class="td-num td-grade${p1.periodGrade !== null && p1.periodGrade < 75 ? ' td-low' : ''}">${fmt(p1.periodGrade)}</td>
                            <td class="td-num${p2.effortfulLearningGrade !== null && p2.effortfulLearningGrade < 60 ? ' td-low' : ''}">${fmt(p2.effortfulLearningGrade)}</td>
                            <td class="td-num${p2.masteryGrade !== null && p2.masteryGrade < 80 ? ' td-low' : ''}">${fmt(p2.masteryGrade)}</td>
                            <td class="td-num td-grade${p2.periodGrade !== null && p2.periodGrade < 75 ? ' td-low' : ''}">${fmt(p2.periodGrade)}</td>
                            <td class="td-num${final.effortfulLearningGrade !== null && final.effortfulLearningGrade < 60 ? ' td-low' : ''}">${fmt(final.effortfulLearningGrade)}</td>
                            <td class="td-num${final.masteryGrade !== null && final.masteryGrade < 80 ? ' td-low' : ''}">${fmt(final.masteryGrade)}</td>
                            <td class="td-num td-grade${final.periodGrade !== null && final.periodGrade < 75 ? ' td-low' : ''}">${fmt(final.periodGrade)}</td>
                            <td class="td-num">${masteryStatus
                                ? `<span class="ggb-mastery-badge ${masteryStatus === 'Met Mastery' ? 'met' : 'retry'}">${esc(masteryStatus)}</span>`
                                : '—'}</td>
                            <td class="td-num ${passClass}">${remarks
                                ? `<span class="ggb-remark-badge">${esc(remarks)}</span>`
                                : '—'}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
        <p class="sg-footnote">
            ${icon('info', { size: 14, className: 'ui-icon-inline' })}
            EL = Effortful Learning (SOC 5% + Let's Practice 35% + Reflection 15%). Mastery = Wrap Up Quiz 15% + Project 30%. Grade = EL × 55% + Mastery × 45%. Mastery threshold: 80.
        </p>
    `;
}

/* ─── Shared UI helpers ─────────────────────────────────────── */

function emptyBox(msg) {
    return `
        <div class="sg-empty-state">
            <div class="sg-empty-icon">${iconLg('clipboard')}</div>
            <p>${esc(msg)}</p>
        </div>
    `;
}

/* ─── CSS ───────────────────────────────────────────────────── */

function pageCss() {
    return `
        ${gradingPeriodTableCss()}

        /* ── Shared ── */
        .sg-loading { display:flex; align-items:center; justify-content:center; min-height:200px; }
        .sg-spin { width:36px; height:36px; border:3px solid #eee; border-top-color:${G}; border-radius:50%; animation:sgSpin .75s linear infinite; }
        @keyframes sgSpin { to { transform:rotate(360deg); } }
        .sg-page { width:100%; }
        .sg-embedded { padding:0; }
        .sg-empty-state { text-align:center; padding:48px 24px; border:2px dashed ${BORDER}; border-radius:16px; background:#FAFAFA; }
        .sg-empty-icon { margin-bottom:12px; color:#9CA3AF; }
        .sg-empty-state p { color:#6B7280; margin:0; }
        .sg-footnote { display:flex; align-items:flex-start; gap:8px; margin-top:16px; padding:12px 14px;
            background:#F8FDF9; border:1px solid #C5D9CB; border-radius:10px; font-size:12px; color:#374151; line-height:1.5; }

        /* ── Report Card page ── */
        .rc-page-wrap { padding:20px; max-width:100%; margin:0; }
        .rc-doc { background:#fff; border:1px solid #d1d5db; border-radius:16px;
            box-shadow:0 6px 32px rgba(0,0,0,.10); overflow:hidden; }

        /* School header */
        .rc-school-hdr { background:${G}; padding:22px 28px; display:flex; align-items:center; gap:18px; }
        .rc-logo { width:54px; height:54px; object-fit:contain; border-radius:50%; background:rgba(255,255,255,.12); padding:5px; flex-shrink:0; }
        .rc-school-text { flex:1; }
        .rc-school-name { font-size:10px; font-weight:700; color:rgba(255,255,255,.6); text-transform:uppercase; letter-spacing:1.5px; margin-bottom:3px; }
        .rc-doc-title { font-size:22px; font-weight:900; color:#fff; letter-spacing:.5px; }
        .rc-print-btn { display:flex; align-items:center; gap:7px; background:rgba(255,255,255,.14);
            border:1px solid rgba(255,255,255,.3); color:#fff; padding:9px 18px; border-radius:9px;
            font-size:13px; font-weight:700; cursor:pointer; font-family:inherit; flex-shrink:0; }
        .rc-print-btn:hover { background:rgba(255,255,255,.24); }

        /* Student info strip */
        .rc-student-info { display:grid; grid-template-columns:1fr 1fr; gap:6px 28px;
            padding:16px 28px; background:#f8fdf9; border-bottom:2px solid ${G}; }
        .rc-info-row { display:flex; align-items:center; gap:10px; font-size:13px; }
        .rc-label { color:#6b7280; font-size:11px; font-weight:700; text-transform:uppercase;
            letter-spacing:.4px; min-width:110px; flex-shrink:0; }
        .rc-info-row strong { color:#111827; }

        /* Body */
        .rc-body { padding:20px 28px 24px; }
        .rc-section-title { font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:1px;
            color:${G}; padding-bottom:8px; border-bottom:2px solid ${G}; margin-bottom:14px; }

        /* Table */
        .rc-table-wrap { overflow-x:auto; }
        .rc-table { width:100%; border-collapse:collapse; font-size:13px; }
        .rc-table th { background:${G}; color:#fff; padding:10px 12px; text-align:left;
            font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:.5px; white-space:nowrap; }
        .rc-table th:first-child { border-radius:8px 0 0 0; }
        .rc-table th:last-child  { border-radius:0 8px 0 0; }
        .rc-td { padding:12px 12px; border-bottom:1px solid #f0f0f0; color:#111827; vertical-align:middle; }
        .rc-row:nth-child(4n+3) .rc-td, .rc-row:nth-child(4n+4) .rc-td { background:#fafafa; }
        .rc-row:hover .rc-td { background:#f0fdf4; transition:background .15s; }
        .rc-num { font-size:12px; color:#9ca3af; font-weight:700; text-align:center; width:32px; }
        .rc-subj-name { max-width:200px; }
        .rc-section-lbl { font-size:11px; color:#6b7280; margin-top:2px; }
        .rc-inst { font-size:12px; color:#6b7280; }
        .rc-score-td { min-width:130px; }
        .rc-pct-td { font-size:15px; font-weight:800; color:${G}; white-space:nowrap; min-width:60px; }
        .rc-center { text-align:center; }
        .rc-grade-val { font-size:13px; font-weight:700; color:#111827; }
        .rc-bar-wrap { background:#e5e7eb; border-radius:4px; height:5px; margin-top:6px; overflow:hidden; }
        .rc-bar { height:100%; border-radius:4px; background:${G}; }
        .rc-bar.warn { background:#f59e0b; }
        .rc-bar.fail { background:#ef4444; }
        .rc-bar.none { background:#d1d5db; }
        .rc-action-td { width:88px; text-align:right; white-space:nowrap; }

        /* Badges */
        .rc-status { display:inline-block; padding:3px 9px; border-radius:20px;
            font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.3px; white-space:nowrap; }
        .rc-status.pass { background:#dcfce7; color:#15803d; }
        .rc-status.warn { background:#fef3c7; color:#b45309; }
        .rc-status.fail { background:#fee2e2; color:#b91c1c; }
        .rc-status.none { background:#f3f4f6; color:#6b7280; }

        /* Expand detail button */
        .rc-detail-btn { background:none; border:1.5px solid ${G}; color:${G}; padding:5px 13px;
            border-radius:8px; font-size:12px; font-weight:700; cursor:pointer; font-family:inherit; white-space:nowrap; }
        .rc-detail-btn:hover, .rc-detail-btn.open { background:${G}; color:#fff; }

        /* Expand panel */
        .rc-expand-row td { padding:0 !important; }
        .rc-detail-panel { padding:20px 0 4px; background:#fafafa; border-top:1px solid ${G}; }

        /* Summary bar */
        .rc-summary-bar { background:#fff; border-top:1px solid #E5E7EB; padding:16px 28px; display:flex; flex-wrap:wrap; gap:0; }
        .rc-summary-item { flex:1; text-align:center; padding:4px 12px; border-right:1px solid #E5E7EB; min-width:100px; }
        .rc-summary-item:last-child { border-right:none; }
        .rc-summary-label { font-size:10px; text-transform:uppercase; letter-spacing:.5px; color:#6B7280; margin-bottom:4px; }
        .rc-summary-value { font-size:20px; font-weight:900; color:#111; }

        /* Class record (embedded in expand panel) */
        .gb-role-pill { display:inline-flex; align-items:center; gap:5px; padding:4px 10px; border-radius:20px;
            font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.5px; background:${GL}; color:${G}; }
        .gb-record-head { margin-bottom:16px; padding:0 20px; }
        .gb-record-head h2 { font-size:18px; font-weight:800; color:#111; margin:8px 0 4px; }
        .gb-record-head > p { font-size:13px; color:#6B7280; margin:0 0 10px; }
        .gb-period-legend { font-size:12px !important; color:#00461B !important; background:#E8F5EC;
            padding:8px 12px; border-radius:8px; margin-bottom:10px !important; }
        .gb-record-stats { display:flex; flex-wrap:wrap; gap:16px; align-items:center; font-size:13px; color:#374151; }
        .gb-record-stats strong { color:${G}; }
        .gb-total-pill { margin-left:auto; padding:6px 14px; border-radius:20px; background:${GL}; font-weight:700; color:${G}; }
        .gb-at-risk { background:#FEF2F2 !important; }
        .gb-risk-tag { display:inline-flex; align-items:center; justify-content:center; width:16px; height:16px;
            border-radius:50%; background:#FEE2E2; color:#B91C1C; font-size:10px; font-weight:800; margin-left:4px; }
        .gc-cur-badge-missing { display:inline-block; padding:3px 8px; border-radius:6px; font-size:11px; font-weight:700; background:#FEF3C7; color:#B45309; }
        .gc-cur-badge-raw { font-size:12px; font-weight:700; color:#111827; }
        .sg-cell-link { color:${G}; text-decoration:none; font-weight:700; background:none; border:none;
            padding:0; cursor:pointer; font:inherit; font-size:inherit; }
        .sg-cell-link:hover { text-decoration:underline; }
        .gb-table-scroll { overflow-x:auto; padding:0 20px; }
        .gb-record-table { min-width:640px; }

        /* Global (EL/Mastery) summary table */
        .ggb-summary-table { min-width:900px; }
        .ggb-summary-table .gb-item-th { min-width:110px !important; max-width:none !important; white-space:normal !important; }
        .gc-cur-table .td-grade { background:${GL} !important; color:${G} !important; font-weight:800; }
        .gc-cur-table .td-low   { color:#B91C1C !important; background:#FEF2F2 !important; }
        .ggb-mastery-badge { display:inline-block; padding:3px 9px; border-radius:20px; font-size:10px; font-weight:700; white-space:nowrap; }
        .ggb-mastery-badge.met   { background:#E8F5E9; color:${G}; }
        .ggb-mastery-badge.retry { background:#FEE2E2; color:#B91C1C; }
        .ggb-remark-badge { display:inline-block; padding:3px 9px; border-radius:20px; font-size:10px; font-weight:700; white-space:nowrap; }
        td.gc-cur-badge-pass .ggb-remark-badge { background:#E8F5E9; color:${G}; }
        td.gc-cur-badge-fail .ggb-remark-badge { background:#FEF3C7; color:#92400E; }

        /* Print styles */
        @media print {
            .rc-print-btn, .rc-detail-btn, .rc-expand-row { display:none !important; }
            .rc-page-wrap { padding:0; }
            .rc-doc { box-shadow:none; border:none; }
            body { background:#fff; }

            /* Hide the app shell so only the report card prints */
            #sidebar, .topbar, #nav-spinner,
            #fa-root, #fm-root { display:none !important; }
            .app-container { display:block !important; }
            .main-content { margin:0 !important; padding:0 !important; }
            .page-content { padding:0 !important; }
        }

        @media(max-width:640px) {
            .rc-student-info { grid-template-columns:1fr; }
            .rc-summary-item { min-width:80px; }
            .rc-summary-value { font-size:16px; }
            .rc-school-hdr { flex-wrap:wrap; }
            .rc-print-btn { order:3; width:100%; justify-content:center; }
        }
    `;
}
