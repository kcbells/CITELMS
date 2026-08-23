/**
 * Dean — Subject Offered
 * Same two-column (First/Second Semester) curriculum checklist layout as
 * Curriculum Subjects, plus a Status + Action column per side so the dean
 * can Open a subject as an offering for the currently active school
 * semester. Faculty Assignments only shows subjects opened here.
 */
import { Api } from '../../api.js';
import { notify } from '../../utils/notify.js';

let _programs       = [];
let _activeProg      = null;
let _subjects        = [];  // curriculum subjects for active program
let _offeredBySubId  = {};  // subject_id -> { subject_offered_id, offering_status }
let _activeSemester  = null; // the school semester_id offerings get created against

export async function render(container) {
    container.innerHTML = `<style>${css()}</style><div class="ps-boot"><div class="ps-spin"></div></div>`;

    const [progRes, semRes] = await Promise.all([
        Api.get('/CurriculumAPI.php?action=programs'),
        Api.get('/SubjectOfferingsAPI.php?action=semesters'),
    ]);
    _programs = progRes.success ? progRes.data : [];
    const semesters = semRes.success ? semRes.data : [];
    _activeSemester = semesters.find(s => s.status === 'active') || semesters[0] || null;

    if (!_programs.length) {
        container.innerHTML = `<style>${css()}</style>
        <div class="ps-empty-full">
            <h3>No programs assigned</h3>
            <p>Your department has no programs yet.</p>
        </div>`;
        return;
    }

    _activeProg = _programs[0];

    container.innerHTML = `<style>${css()}</style>
    <div class="ps-page">

        <div class="ps-header">
            <div>
                <p class="ps-subtitle">
                    ${_activeSemester
                        ? `Opening subjects for <strong>${esc(_activeSemester.semester_name)} ${esc(_activeSemester.academic_year)}</strong> — only Opened subjects appear in Faculty Assignments.`
                        : 'No active school semester found — ask an admin to activate one.'}
                </p>
            </div>
        </div>

        <div class="ps-prog-grid" id="ps-prog-grid">
            ${_programs.map((p, i) => programCardHtml(p, i === 0)).join('')}
        </div>

        <div class="ps-prog-view">
            <div class="ps-view-header" id="ps-view-header"></div>
            <div id="ps-table-area"></div>
        </div>

    </div>`;

    container.querySelectorAll('.ps-prog-card').forEach(card => {
        card.addEventListener('click', async () => {
            container.querySelectorAll('.ps-prog-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            _activeProg = _programs.find(p => String(p.program_id) === card.dataset.pid);
            if (_activeProg) await loadSubjects(container);
        });
    });

    await loadSubjects(container);
}

function programCardHtml(p, active) {
    return `
    <button class="ps-prog-card ${active ? 'active' : ''}" data-pid="${p.program_id}">
        <span class="ps-card-code">${esc(p.program_code)}</span>
        <span class="ps-card-name">${esc(p.program_name)}</span>
    </button>`;
}

async function loadSubjects(container) {
    const area  = container.querySelector('#ps-table-area');
    const hdrEl = container.querySelector('#ps-view-header');
    if (!_activeProg) return;

    hdrEl.innerHTML = `
        <div class="ps-view-header-row">
            <h3 class="ps-view-title">${esc(_activeProg.program_code)} — ${esc(_activeProg.program_name)}</h3>
            ${_activeSemester ? `<button type="button" class="ps-open-all-btn" id="ps-open-all">
                Open All — ${esc(_activeSemester.semester_name)}
            </button>` : ''}
        </div>`;
    hdrEl.querySelector('#ps-open-all')?.addEventListener('click', () => openAllForTerm(container));
    area.innerHTML = `<div class="ps-boot"><div class="ps-spin"></div></div>`;

    const [subRes, offRes] = await Promise.all([
        Api.get(`/CurriculumAPI.php?action=view&program_id=${_activeProg.program_id}`),
        Api.get(`/SubjectOfferingsAPI.php?action=offered-list${_activeSemester ? `&semester_id=${_activeSemester.semester_id}` : ''}`),
    ]);
    _subjects = subRes.success ? subRes.data : [];

    _offeredBySubId = {};
    if (offRes.success) {
        for (const row of offRes.data) {
            _offeredBySubId[row.subject_id] = {
                subject_offered_id: row.subject_offered_id,
                offering_status: row.offering_status,
                grading_type: row.grading_type || 'raw_score',
            };
        }
    }

    renderChecklist(area, container);
}

function statusCell(subjectId, semNum) {
    const offered = _offeredBySubId[subjectId];
    const status  = offered ? offered.offering_status : null;

    const badge = !status
        ? `<span class="so-badge so-badge-none">Not Offered</span>`
        : status === 'open'
            ? `<span class="so-badge so-badge-open">Open</span>`
            : `<span class="so-badge so-badge-closed">${esc(status[0].toUpperCase() + status.slice(1))}</span>`;

    // A subject's own curriculum term (1st/2nd/Summer) may not match the currently
    // active school semester's term — e.g. opening a 2nd-sem subject as an elective
    // while 1st semester is active. That's still allowed (the dean has final say),
    // but the button is flagged off-term so a confirm prompt catches mis-clicks.
    const offTerm = !!_activeSemester && _activeSemester.sem_level != null
        && semNum != null && Number(semNum) !== Number(_activeSemester.sem_level);
    const offTermAttr = offTerm ? ' data-offterm="1"' : '';
    const offTermTag = offTerm ? `<span class="so-offterm-tag" title="This subject's curriculum term doesn't match the active semester (${esc(_activeSemester.semester_name)})">Off-term</span>` : '';

    let action;
    if (!status) {
        action = `<button class="so-btn-open" data-open="${subjectId}"${offTermAttr}>Open</button>`;
    } else if (status === 'open') {
        action = `<button class="so-btn-close" data-close="${offered.subject_offered_id}">Close</button>`;
    } else {
        action = `<button class="so-btn-open" data-reopen="${offered.subject_offered_id}"${offTermAttr}>Reopen</button>`;
    }

    // Raw Score <-> Global Gradebook — only meaningful once a subject is
    // actually offered (there's no grading mode to speak of for one that
    // isn't). A click flips it and re-sends the offering's own current
    // status right alongside grading_type, since the update endpoint always
    // expects a status — omitting it would default to 'open' and could
    // silently reopen a subject the dean deliberately closed.
    const gradingToggle = offered ? `
        <label class="so-grading-toggle" title="Check for Global Gradebook, uncheck for Raw Score grading">
            <input type="checkbox" data-grading-toggle="${offered.subject_offered_id}"
                   data-current-status="${esc(status)}"
                   data-current-grading="${offered.grading_type}"
                   ${offered.grading_type === 'global' ? 'checked' : ''}>
            Global
        </label>` : '';

    return `<td class="so-status">${badge}</td><td class="so-action">${action}${offTermTag}${gradingToggle}</td>`;
}

function emptyStatusCells() {
    return `<td class="so-status"></td><td class="so-action"></td>`;
}

function renderChecklist(area, container) {
    if (!_subjects.length) {
        area.innerHTML = `
        <div class="ps-empty">
            <p>No subjects in this program's curriculum yet.</p>
        </div>`;
        return;
    }

    const byYear = {};
    _subjects.forEach(s => {
        const yr  = parseInt(s.year_level) || 0;
        const sem = parseInt(s.semester)   || 1;
        if (!byYear[yr]) byYear[yr] = { 1: [], 2: [], 3: [] };
        byYear[yr][sem] = byYear[yr][sem] || [];
        byYear[yr][sem].push(s);
    });

    const YEAR_LABELS = { 0: 'General', 1: 'First Year', 2: 'Second Year', 3: 'Third Year', 4: 'Fourth Year' };

    const blocks = Object.keys(byYear).filter(yr => parseInt(yr) > 0).sort((a, b) => a - b).map(yr => {
        const sem1 = byYear[yr][1] || [];
        const sem2 = byYear[yr][2] || [];
        const summer = byYear[yr][3] || [];

        const rowCount = Math.max(sem1.length, sem2.length);
        const bodyRows = [];
        for (let i = 0; i < rowCount; i++) {
            const L = sem1[i] || null;
            const R = sem2[i] || null;
            bodyRows.push(`
            <tr>
                ${L ? `<td class="cr-code">${esc(L.subject_code)}</td>
                        <td class="cr-title">${esc(L.subject_name)}</td>
                        <td class="cr-num">${L.lecture_hours ?? 0}</td>
                        <td class="cr-num">${L.lab_hours ?? 0}</td>
                        <td class="cr-num cr-bold">${L.units ?? 0}</td>
                        <td class="cr-pre">${esc(L.pre_requisite || 'None')}</td>
                        ${statusCell(L.subject_id, 1)}`
                      : `<td></td><td></td><td class="cr-num"></td><td class="cr-num"></td><td class="cr-num"></td><td></td>${emptyStatusCells()}`}
                <td class="cr-divider"></td>
                ${R ? `<td class="cr-code">${esc(R.subject_code)}</td>
                        <td class="cr-title">${esc(R.subject_name)}</td>
                        <td class="cr-num">${R.lecture_hours ?? 0}</td>
                        <td class="cr-num">${R.lab_hours ?? 0}</td>
                        <td class="cr-num cr-bold">${R.units ?? 0}</td>
                        <td class="cr-pre">${esc(R.pre_requisite || 'None')}</td>
                        ${statusCell(R.subject_id, 2)}`
                      : `<td></td><td></td><td class="cr-num"></td><td class="cr-num"></td><td class="cr-num"></td><td></td>${emptyStatusCells()}`}
            </tr>`);
        }

        let summerHtml = '';
        if (summer.length) {
            summerHtml = `
            <table class="cr-table cr-summer-table">
                <thead>
                    <tr><th colspan="8" class="cr-sem-hd">Summer</th></tr>
                    <tr>
                        <th rowspan="2" class="cr-th-code">Course Code</th>
                        <th rowspan="2" class="cr-th-title">Course Title</th>
                        <th colspan="3" class="cr-th-units">Units</th>
                        <th rowspan="2" class="cr-th-pre">Pre-requisite</th>
                        <th rowspan="2" class="cr-th-status">Status</th>
                        <th rowspan="2" class="cr-th-status">Action</th>
                    </tr>
                    <tr><th class="cr-th-num">Lec</th><th class="cr-th-num">Lab</th><th class="cr-th-num">Total</th></tr>
                </thead>
                <tbody>
                    ${summer.map(s => `
                    <tr>
                        <td class="cr-code">${esc(s.subject_code)}</td>
                        <td class="cr-title">${esc(s.subject_name)}</td>
                        <td class="cr-num">${s.lecture_hours ?? 0}</td>
                        <td class="cr-num">${s.lab_hours ?? 0}</td>
                        <td class="cr-num cr-bold">${s.units ?? 0}</td>
                        <td class="cr-pre">${esc(s.pre_requisite || 'None')}</td>
                        ${statusCell(s.subject_id, 3)}
                    </tr>`).join('')}
                </tbody>
            </table>`;
        }

        return `
        <div class="cr-year-block">
            <table class="cr-table">
                <thead>
                    <tr>
                        <th colspan="17" class="cr-year-hd"><span>${YEAR_LABELS[yr] || `Year ${yr}`}</span></th>
                    </tr>
                    <tr>
                        <th colspan="8" class="cr-sem-hd">First Semester</th>
                        <td class="cr-divider-hd"></td>
                        <th colspan="8" class="cr-sem-hd">Second Semester</th>
                    </tr>
                    <tr>
                        <th rowspan="2" class="cr-th-code">Course Code</th>
                        <th rowspan="2" class="cr-th-title">Course Title</th>
                        <th colspan="3" class="cr-th-units">Units</th>
                        <th rowspan="2" class="cr-th-pre">Pre-requisite</th>
                        <th rowspan="2" class="cr-th-status">Status</th>
                        <th rowspan="2" class="cr-th-status">Action</th>
                        <td class="cr-divider-hd" rowspan="2"></td>
                        <th rowspan="2" class="cr-th-code">Course Code</th>
                        <th rowspan="2" class="cr-th-title">Course Title</th>
                        <th colspan="3" class="cr-th-units">Units</th>
                        <th rowspan="2" class="cr-th-pre">Pre-requisite</th>
                        <th rowspan="2" class="cr-th-status">Status</th>
                        <th rowspan="2" class="cr-th-status">Action</th>
                    </tr>
                    <tr>
                        <th class="cr-th-num">Lec</th><th class="cr-th-num">Lab</th><th class="cr-th-num">Total</th>
                        <th class="cr-th-num">Lec</th><th class="cr-th-num">Lab</th><th class="cr-th-num">Total</th>
                    </tr>
                </thead>
                <tbody>
                    ${bodyRows.join('') || `<tr>
                        <td colspan="8" class="cr-empty-cell">No subjects</td>
                        <td class="cr-divider"></td>
                        <td colspan="8" class="cr-empty-cell">No subjects</td>
                    </tr>`}
                </tbody>
            </table>
            ${summerHtml}
        </div>`;
    }).join('');

    area.innerHTML = `<div class="cr-wrap">${blocks}</div>`;

    area.querySelectorAll('[data-open]').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (btn.dataset.offterm && !(await confirmOffTerm())) return;
            openSubject(container, parseInt(btn.dataset.open));
        });
    });
    area.querySelectorAll('[data-close]').forEach(btn => {
        btn.addEventListener('click', () => toggleOffering(container, parseInt(btn.dataset.close), 'closed'));
    });
    area.querySelectorAll('[data-reopen]').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (btn.dataset.offterm && !(await confirmOffTerm())) return;
            toggleOffering(container, parseInt(btn.dataset.reopen), 'open');
        });
    });
    area.querySelectorAll('[data-grading-toggle]').forEach(box => {
        box.addEventListener('change', () => {
            const newType = box.checked ? 'global' : 'raw_score';
            toggleGradingType(container, parseInt(box.dataset.gradingToggle), box.dataset.currentStatus, newType, box);
        });
    });
}

async function openAllForTerm(container) {
    if (!_activeProg || !_activeSemester) return;
    const confirmed = await notify.confirm(
        `Open every ${_activeSemester.semester_name} subject in ${_activeProg.program_code}'s curriculum that isn't already open? Subjects already open are left as-is.`,
        { confirmText: 'Open All' }
    );
    if (!confirmed) return;

    const res = await Api.post('/SubjectOfferingsAPI.php?action=open-all-term', {
        program_id: _activeProg.program_id,
    });
    if (res.success) {
        notify.success(res.message || 'Subjects opened');
        await loadSubjects(container);
    } else {
        notify.error(res.message || 'Failed to open subjects');
    }
}

function confirmOffTerm() {
    const term = _activeSemester ? _activeSemester.semester_name : 'the active semester';
    return notify.confirm(
        `This subject's curriculum term doesn't match ${term}. Open it anyway?`,
        { confirmText: 'Open Anyway' }
    );
}

async function openSubject(container, subjectId) {
    if (!_activeSemester) {
        notify.error('No active school semester. Ask an admin to activate one first.');
        return;
    }
    const res = await Api.post('/SubjectOfferingsAPI.php?action=create', {
        subject_id: subjectId,
        semester_id: _activeSemester.semester_id,
        status: 'open',
    });
    if (res.success) await loadSubjects(container);
    else notify.error(res.message || 'Failed to open subject');
}

async function toggleOffering(container, subjectOfferedId, status) {
    const res = await Api.post('/SubjectOfferingsAPI.php?action=update', {
        subject_offered_id: subjectOfferedId,
        status,
    });
    if (res.success) await loadSubjects(container);
    else notify.error(res.message || 'Failed to update subject status');
}

async function toggleGradingType(container, subjectOfferedId, currentStatus, gradingType, box) {
    const label = gradingType === 'global' ? 'Global Gradebook' : 'Raw Score';
    const confirmed = await notify.confirm(
        `Switch this class to ${label} grading? This changes how grades are recorded and shown for every student already enrolled.`,
        { confirmText: 'Switch' }
    );
    if (!confirmed) {
        if (box) box.checked = !box.checked; // undo the checkbox's own state flip
        return;
    }

    const res = await Api.post('/SubjectOfferingsAPI.php?action=update', {
        subject_offered_id: subjectOfferedId,
        status: currentStatus,   // resend current status — the endpoint requires one and defaults to 'open' if omitted
        grading_type: gradingType,
    });
    if (res.success) {
        notify.success(`Switched to ${label}`);
        await loadSubjects(container);
    } else {
        notify.error(res.message || 'Failed to change grading type');
        if (box) box.checked = !box.checked;
    }
}

function esc(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
}

// ── CSS — mirrors dean/curriculum.js's ps-*/cr-* checklist styling exactly,
// plus so-* additions for the Status/Action columns this page adds. ──
function css() { return `
.ps-boot { display:flex; justify-content:center; padding:60px; }
.ps-spin { width:32px; height:32px; border:3px solid #E5E7EB; border-top-color:#00461B; border-radius:50%; animation:psSpin .8s linear infinite; }
@keyframes psSpin { to { transform:rotate(360deg); } }

.ps-page { padding:0 0 60px; }
.ps-header { display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap; margin-bottom:24px; }
.ps-title  { font-size:22px; font-weight:800; color:#111827; margin:0 0 4px; }
.ps-subtitle { font-size:13px; color:#6B7280; margin:0; }
.ps-subtitle strong { color:#1B4D3E; }

.ps-prog-grid { display:flex; flex-wrap:wrap; gap:14px; margin-bottom:28px; }
.ps-prog-card {
    display:flex; flex-direction:column; align-items:flex-start;
    padding:16px 20px; min-width:160px; max-width:240px;
    border-radius:12px; border:2px solid #E5E7EB;
    background:#fff; cursor:pointer; text-align:left; font-family:inherit;
    transition:all .18s; box-shadow:0 1px 3px rgba(0,0,0,.06);
}
.ps-prog-card:hover { border-color:#00461B; box-shadow:0 4px 12px rgba(0,70,27,.14); transform:translateY(-1px); }
.ps-prog-card.active { background:#00461B; border-color:#00461B; box-shadow:0 4px 14px rgba(0,70,27,.3); transform:translateY(-1px); }
.ps-card-code { font-size:20px; font-weight:800; color:#1B4D3E; line-height:1.1; margin-bottom:6px; }
.ps-card-name { font-size:11.5px; font-weight:500; color:#6B7280; line-height:1.35; }
.ps-prog-card.active .ps-card-code,
.ps-prog-card.active .ps-card-name { color:#fff; opacity:1; }
.ps-prog-card.active .ps-card-name { opacity:.82; }

.ps-prog-view { }
.ps-view-header { margin-bottom:14px; }
.ps-view-header-row { display:flex; align-items:center; justify-content:space-between; gap:14px; flex-wrap:wrap; }
.ps-view-title  { font-size:17px; font-weight:700; color:#111827; margin:0; }
.ps-open-all-btn { background:#00461B; color:#fff; border:none; border-radius:8px; padding:9px 16px;
    font-size:12.5px; font-weight:700; cursor:pointer; white-space:nowrap; }
.ps-open-all-btn:hover { background:#006428; }

.cr-wrap { display:flex; flex-direction:column; gap:32px; }
.cr-year-block { overflow-x:auto; }
.cr-table { width:100%; border-collapse:collapse; font-size:12.5px; font-family:inherit; background:#fff; border:1.5px solid #374151; }
.cr-year-hd { background:#00461B; color:#fff; font-size:13px; font-weight:800; letter-spacing:1px; text-transform:uppercase; text-align:center; padding:7px 12px; border:1px solid #00461B; position:relative; }
.cr-sem-hd { background:#1B4D3E; color:#fff; font-size:12px; font-weight:700; letter-spacing:.5px; text-transform:uppercase; text-align:center; padding:7px 10px; border:1px solid #155534; }
.cr-th-code  { width:110px; text-align:center; vertical-align:middle; font-size:11px; font-weight:700; background:#2d6a4f; color:#fff; padding:6px 8px; border:1px solid #155534; }
.cr-th-title { text-align:center; vertical-align:middle; font-size:11px; font-weight:700; background:#2d6a4f; color:#fff; padding:6px 8px; border:1px solid #155534; }
.cr-th-units { width:130px; text-align:center; font-size:11px; font-weight:700; background:#2d6a4f; color:#fff; padding:6px 8px; border:1px solid #155534; }
.cr-th-num   { width:44px; text-align:center; font-size:11px; font-weight:700; background:#2d6a4f; color:#fff; padding:6px 4px; border:1px solid #155534; }
.cr-th-pre   { width:110px; text-align:center; vertical-align:middle; font-size:11px; font-weight:700; background:#2d6a4f; color:#fff; padding:6px 8px; border:1px solid #155534; }
.cr-th-status { width:96px; text-align:center; vertical-align:middle; font-size:11px; font-weight:700; background:#2d6a4f; color:#fff; padding:6px 8px; border:1px solid #155534; }
.cr-divider-hd { width:6px; background:#374151; padding:0; border:none; }
.cr-divider    { width:6px; background:#e5e7eb; padding:0; border:none; }
.cr-table tbody tr:nth-child(even) td:not(.cr-divider) { background:#f9fafb; }
.cr-table tbody tr:hover td:not(.cr-divider) { background:#f0fdf4; }
.cr-table td { border:1px solid #d1d5db; padding:7px 8px; vertical-align:middle; }
.cr-code  { font-family:monospace; font-size:12px; font-weight:700; color:#1B4D3E; white-space:nowrap; text-align:center; }
.cr-title { color:#111827; font-size:12.5px; }
.cr-num   { text-align:center; color:#374151; white-space:nowrap; }
.cr-bold  { font-weight:700; color:#00461B; }
.cr-pre   { font-size:11.5px; color:#6b7280; text-align:center; }
.cr-empty-cell { text-align:center; color:#9ca3af; font-size:12px; padding:14px; }
.cr-summer-table { width:70%; border:1.5px solid #374151; margin-top:0; border-top:2px solid #374151; }

.ps-empty { text-align:center; padding:48px 24px; color:#6B7280; background:#fff; border:1px dashed #E5E7EB; border-radius:10px; margin-top:8px; }
.ps-empty p { margin:0; }
.ps-empty-full { text-align:center; padding:80px 24px; color:#6B7280; }

.so-status, .so-action { text-align:center; white-space:nowrap; }
.so-badge { display:inline-block; padding:3px 9px; border-radius:20px; font-size:10.5px; font-weight:700; white-space:nowrap; }
.so-badge-none { background:#f3f4f6; color:#9ca3af; }
.so-badge-open { background:#dcfce7; color:#15803d; }
.so-badge-closed { background:#fef3c7; color:#b45309; }
.so-btn-open, .so-btn-close { border:none; border-radius:6px; padding:5px 11px; font-size:11px; font-weight:700; cursor:pointer; white-space:nowrap; }
.so-btn-open { background:#00461B; color:#fff; }
.so-btn-open:hover { background:#006428; }
.so-btn-close { background:#FEE2E2; color:#b91c1c; }
.so-btn-close:hover { background:#FECACA; }
.so-offterm-tag { display:block; margin-top:3px; font-size:9.5px; font-weight:700; text-transform:uppercase; letter-spacing:.3px; color:#b45309; cursor:help; }
.so-grading-toggle { display:flex; align-items:center; justify-content:center; gap:5px; margin:5px auto 0;
    font-size:10.5px; font-weight:700; letter-spacing:.2px; color:#4B5563; cursor:pointer; white-space:nowrap;
    font-family:inherit; user-select:none; }
.so-grading-toggle input { width:14px; height:14px; margin:0; accent-color:#6D28D9; cursor:pointer; }

@media(max-width:900px) {
    .cr-summer-table { width:100%; }
    .ps-prog-card { min-width:130px; }
}
@media(max-width:600px) {
    .ps-prog-grid { gap:10px; }
    .ps-prog-card { padding:12px 14px; min-width:110px; }
    .ps-card-code { font-size:16px; }
}
`; }
