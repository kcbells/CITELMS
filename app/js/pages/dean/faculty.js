/**
 * Dean Faculty Page — instructor-centric assignment
 * Left: instructor list  |  Right: subject checklist for the selected instructor
 * Pick a person, check the subjects they teach, save — no per-subject hunting.
 */
import { Api } from '../../api.js';
import { notify } from '../../utils/notify.js';
import { icon } from '../../utils/icons.js';

const inl = { size: 14, className: 'ui-icon-inline' };

let _instructors   = [];
let _semesters     = [];
let _semId         = '';
let _selectedInstr = null;
let _subjects       = [];        // full subject list for the selected instructor
let _original        = new Set(); // "sid:{subject_id}" keys originally assigned
let _pending        = new Set(); // current checked state
let _deptFilter     = '';
let _deanSelf       = null;

export async function render(container) {
    container.innerHTML = `<style>${css()}</style><div class="fc-boot"><div class="fc-spin"></div></div>`;

    const [instRes, semRes, meRes] = await Promise.all([
        Api.get('/UsersAPI.php?action=list&role=instructor,program_head&status=active&export=1'),
        Api.get('/SubjectOfferingsAPI.php?action=semesters'),
        Api.get('/AuthAPI.php?action=me'),
    ]);
    _instructors = instRes.success ? instRes.data.users : [];
    _semesters   = semRes.success  ? semRes.data        : [];
    _deanSelf    = meRes.success   ? meRes.data          : null;

    const active = _semesters.find(s => s.status === 'active') || _semesters[0];
    _semId = active ? String(active.semester_id) : '';

    const programs = [...new Map(_instructors.filter(i => i.program_code).map(i => [i.program_code, i.program_name])).entries()]
        .sort(([a], [b]) => a.localeCompare(b));

    container.innerHTML = `<style>${css()}</style>

    <!-- Banner -->
    <div class="fc-banner">
        <div class="fc-banner-left">
            <div class="fc-banner-icon">
                <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="#111" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
                </svg>
            </div>
            <div>
                <p class="fc-banner-sub">Pick an instructor, then check which subjects they teach this semester. Only subjects Opened for the chosen semester are offered here — see Subject Offered.</p>
            </div>
        </div>
        <div class="fc-banner-right">
            <label class="fc-sem-label">Semester</label>
            <select id="fc-sem-sel" class="fc-sem-sel">
                ${_semesters.map(s => `
                    <option value="${s.semester_id}" ${String(s.semester_id) === _semId ? 'selected' : ''}>
                        ${esc(s.semester_name)} ${esc(s.academic_year)}${s.status === 'active' ? ' (Active)' : ''}
                    </option>`).join('')}
            </select>
        </div>
    </div>

    <!-- Layout -->
    <div class="fc-layout">

        <!-- LEFT: Instructor list -->
        <div class="fc-left">
            <div class="fc-left-head">
                <div class="fc-left-title-row">
                    <span class="fc-left-title">Faculty</span>
                    <span class="fc-count-badge" id="fc-instr-count">${_instructors.length}</span>
                </div>
                <input id="fc-instr-search" class="fc-search-inp" type="text" placeholder="Search name or ID…">
                <select id="fc-prog-filter" class="fc-filter-sel">
                    <option value="">All Programs</option>
                    ${programs.map(([code]) => `<option value="${esc(code)}">${esc(code)}</option>`).join('')}
                </select>
            </div>
            ${_deanSelf ? renderDeanSelfCard() : ''}
            <div id="fc-instr-list" class="fc-subj-list">
                ${renderInstructorList(_instructors)}
            </div>
        </div>

        <!-- RIGHT: Subject assignment panel -->
        <div class="fc-right" id="fc-right">
            <div class="fc-placeholder">
                <svg width="56" height="56" fill="none" viewBox="0 0 24 24" stroke="#d1d5db" stroke-width="1.2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                </svg>
                <p>Select an instructor on the left to manage the subjects they teach</p>
            </div>
        </div>

    </div>`;

    container.querySelector('#fc-sem-sel').addEventListener('change', e => {
        _semId = e.target.value;
        if (_selectedInstr) loadSubjects(_selectedInstr, container);
    });

    container.querySelector('#fc-prog-filter').addEventListener('change', e => {
        _deptFilter = e.target.value;
        applyInstrFilters(container);
    });

    let debounce;
    container.querySelector('#fc-instr-search').addEventListener('input', () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => applyInstrFilters(container), 200);
    });

    bindInstructorClicks(container);
    bindDeanSelfCard(container);
}

// ── Instructor list ─────────────────────────────────────────────────────────

function renderDeanSelfCard() {
    if (!_deanSelf) return '';
    const init = ((_deanSelf.first_name || '?')[0] + (_deanSelf.last_name || '?')[0]).toUpperCase();
    const isActive = _selectedInstr && _selectedInstr.users_id === _deanSelf.users_id;
    return `
    <div class="fc-dean-self-section">
        <div class="fc-dean-self-label">Assign Yourself</div>
        <div class="fc-subj-card fc-dean-self-card ${isActive ? 'active' : ''}" data-id="${_deanSelf.users_id}" data-self="1">
            <div class="fc-subj-card-main" style="display:flex;align-items:center;gap:10px;">
                <div class="fc-instr-av fc-dean-av">${init}</div>
                <div style="min-width:0;">
                    <div class="fc-subj-card-name">${esc(_deanSelf.first_name)} ${esc(_deanSelf.last_name)}</div>
                    <div class="fc-subj-card-meta">${esc(_deanSelf.employee_id || '—')} · Dean (You)</div>
                </div>
            </div>
            <div class="fc-assign-badge" id="asgn-self">—</div>
        </div>
        <div class="fc-dean-self-divider"></div>
    </div>`;
}

function bindDeanSelfCard(container) {
    const card = container.querySelector('[data-self="1"]');
    if (!card || !_deanSelf) return;
    card.addEventListener('click', async () => {
        if (_selectedInstr?.users_id === _deanSelf.users_id) return;
        if (!(await confirmDiscardIfDirty())) return;
        _selectedInstr = _deanSelf;
        container.querySelectorAll('.fc-subj-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        loadSubjects(_deanSelf, container);
    });
}

function applyInstrFilters(container) {
    const q = (container.querySelector('#fc-instr-search')?.value || '').toLowerCase();
    let list = _instructors;
    if (_deptFilter) list = list.filter(i => i.program_code === _deptFilter);
    if (q) list = list.filter(i => (i.first_name + ' ' + i.last_name + ' ' + (i.employee_id || '')).toLowerCase().includes(q));

    const countEl = container.querySelector('#fc-instr-count');
    if (countEl) countEl.textContent = list.length;
    container.querySelector('#fc-instr-list').innerHTML = renderInstructorList(list);
    bindInstructorClicks(container);
}

function renderInstructorList(list) {
    if (!list.length) return `<div class="fc-empty">No faculty found for this program.</div>`;
    return list.map(i => {
        const isActive = _selectedInstr && _selectedInstr.users_id === i.users_id;
        const init = ((i.first_name || '?')[0] + (i.last_name || '?')[0]).toUpperCase();
        const aCount = i._assignedCount ?? '';
        return `
        <div class="fc-subj-card ${isActive ? 'active' : ''}" data-id="${i.users_id}">
            <div class="fc-subj-card-main" style="display:flex;align-items:center;gap:10px;">
                <div class="fc-instr-av">${init}</div>
                <div style="min-width:0;">
                    <div class="fc-subj-card-top">
                        <span class="fc-subj-card-name">${esc(i.first_name)} ${esc(i.last_name)}</span>
                    </div>
                    <div class="fc-subj-card-meta">
                        ${esc(i.employee_id || '—')}
                        ${i.program_code ? ' · ' + esc(i.program_code) : ''}
                        ${i.role === 'program_head' ? ' · <span class="fc-role-tag">Program Head</span>' : ''}
                    </div>
                </div>
            </div>
            <div class="fc-assign-badge ${aCount > 0 ? 'has' : ''}" id="asgn-${i.users_id}">
                ${aCount !== '' ? aCount : '—'}
            </div>
        </div>`;
    }).join('');
}

function bindInstructorClicks(container) {
    container.querySelectorAll('.fc-subj-card:not([data-self])').forEach(card => {
        card.addEventListener('click', async () => {
            const instr = _instructors.find(i => i.users_id == card.dataset.id);
            if (!instr) return;
            if (_selectedInstr?.users_id === instr.users_id) return;
            if (!(await confirmDiscardIfDirty())) return;

            _selectedInstr = instr;
            container.querySelectorAll('.fc-subj-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            loadSubjects(instr, container);
        });
    });
}

async function confirmDiscardIfDirty() {
    const added   = [..._pending].filter(k => !_original.has(k));
    const removed = [..._original].filter(k => !_pending.has(k));
    if ((added.length || removed.length) && _selectedInstr) {
        const name = `${_selectedInstr.first_name} ${_selectedInstr.last_name}`;
        return notify.confirm(`Unsaved changes for "${name}". Discard and continue?`, { confirmText: 'Discard', danger: true });
    }
    return true;
}

// ── Subject panel ─────────────────────────────────────────────────────────

async function loadSubjects(instr, container) {
    const right = container.querySelector('#fc-right');
    right.innerHTML = `<div class="fc-loading"><div class="fc-spin"></div><span>Loading subjects…</span></div>`;

    const res = await Api.get(
        `/SubjectOfferingsAPI.php?action=instructor-subjects&instructor_id=${instr.users_id}&semester_id=${_semId}`
    );
    if (!res.success) {
        right.innerHTML = `<div class="fc-err">Failed to load subjects.</div>`;
        return;
    }

    // Faculty can only be assigned to subjects that have actually been Opened
    // (see "Subject Offered" page) for the selected semester — not every
    // curriculum subject the program happens to carry.
    _subjects = res.data.filter(s => s.has_offering == 1);
    _original = new Set();
    _pending  = new Set();
    _subjects.forEach(s => {
        const key = `sid:${s.subject_id}`;
        if (s.is_assigned == 1) { _original.add(key); _pending.add(key); }
    });

    renderRight(instr, container);
    updateBadge(instr.users_id);
}

/** Groups subjectsList by program → year → semester and returns the checklist markup. */
function buildChecklistHtml(subjectsList, instr) {
    const grouped = {};
    subjectsList.forEach(s => {
        const prog = s.program_code || 'Other';
        const yr   = s.year_level ? `${s.year_level}${ordinal(s.year_level)} Year` : 'Unspecified';
        const sem  = subjSemLabel(s.subject_semester);
        if (!grouped[prog])          grouped[prog]          = {};
        if (!grouped[prog][yr])      grouped[prog][yr]      = {};
        if (!grouped[prog][yr][sem]) grouped[prog][yr][sem] = [];
        grouped[prog][yr][sem].push(s);
    });

    const instrProg = instr.program_code || '';
    const sortedProgEntries = Object.entries(grouped).sort(([a], [b]) => {
        if (a === instrProg && b !== instrProg) return -1;
        if (b === instrProg && a !== instrProg) return 1;
        return a.localeCompare(b);
    });

    if (!sortedProgEntries.length) {
        return `<div class="fc-empty" style="padding:24px;">No subjects offered for this program in the selected semester.</div>`;
    }

    return sortedProgEntries.map(([prog, years]) => {
        const isPrimary = prog === instrProg;
        return `
        <div class="fc-instr-group">
            <div class="fc-instr-group-hdr">
                <span class="fc-prog-tag">${esc(prog)}</span>
                <span class="fc-instr-group-name">${esc(subjectsList.find(s => s.program_code === prog)?.program_name || '')}</span>
                ${isPrimary ? `<span class="fc-prog-primary">${icon('pin', inl)} Primary Program</span>` : ''}
            </div>
            ${Object.entries(years).map(([yr, sems]) => `
            <div class="fc-year-block">
                <div class="fc-year-label">${esc(yr)}</div>
                ${Object.entries(sems).map(([sem, subjects]) => `
                <div class="fc-sem-block">
                    <div class="fc-sem-sublabel">${esc(sem)}</div>
                    ${subjects.map(s => subjRowHtml(s)).join('')}
                </div>`).join('')}
            </div>`).join('')}
        </div>`;
    }).join('');
}

function renderRight(instr, container) {
    const right = container.querySelector('#fc-right');
    const assignedCount = [..._pending].filter(k => k.startsWith('sid:')).length;
    const init = ((instr.first_name || '?')[0] + (instr.last_name || '?')[0]).toUpperCase();
    const isPh = instr.role === 'program_head';

    right.innerHTML = `
    <!-- Instructor header -->
    <div class="fc-subj-hdr">
        <div class="fc-subj-hdr-left" style="display:flex;align-items:center;gap:14px;">
            <div class="fc-instr-av lg ${isPh ? 'fc-dean-av-ph' : ''}">${init}</div>
            <div>
                <div class="fc-subj-hdr-name">${esc(instr.first_name)} ${esc(instr.last_name)}</div>
                <div class="fc-subj-hdr-meta">
                    ${instr.employee_id ? `ID: ${esc(instr.employee_id)}` : ''}
                    ${instr.email ? ' · ' + esc(instr.email) : ''}
                    ${instr.program_code ? ` · <span class="fc-prog-tag">${esc(instr.program_code)}</span>` : ''}
                    ${isPh ? ` · <span class="fc-role-tag">Program Head</span>` : ''}
                </div>
            </div>
        </div>
        <div class="fc-subj-hdr-stat">
            <span class="fc-stat-val" id="fc-assigned-count">${assignedCount}</span>
            <span class="fc-stat-lbl">subject${assignedCount !== 1 ? 's' : ''} assigned</span>
        </div>
    </div>

    ${isPh ? renderPhScope(instr) : ''}

    <!-- Legend -->
    <div class="fc-instr-head" style="flex-wrap:wrap;gap:14px;">
        <div style="display:flex;gap:16px;flex-wrap:wrap;">
            <span class="fc-leg-item"><span class="fc-leg-dot checked"></span> Assigned to them</span>
            <span class="fc-leg-item"><span class="fc-leg-dot other"></span> Taught by someone else</span>
            <span class="fc-leg-item"><span class="fc-leg-dot free"></span> Unassigned</span>
        </div>
        <input id="fc-subj-search" class="fc-search-inp sm" type="text" placeholder="Search subject…">
    </div>

    <!-- Checklist -->
    <div class="fc-instr-checklist" id="fc-checklist">
        ${buildChecklistHtml(_subjects, instr)}
    </div>

    <!-- Cart bar -->
    <div class="fc-cart-bar" id="fc-cart-bar" style="display:none;">
        <div class="fc-cart-info">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#00461B" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            <span id="fc-cart-label"></span>
        </div>
        <div style="display:flex;gap:8px;">
            <button class="fc-btn-discard" id="fc-discard-btn">Discard</button>
            <button class="fc-btn-review" id="fc-save-btn">Save Assignments</button>
        </div>
    </div>`;

    let deb;
    right.querySelector('#fc-subj-search')?.addEventListener('input', e => {
        clearTimeout(deb);
        deb = setTimeout(() => {
            const q = e.target.value.toLowerCase();
            const filtered = q
                ? _subjects.filter(s => (s.subject_code + ' ' + s.subject_name).toLowerCase().includes(q))
                : _subjects;
            const list = right.querySelector('#fc-checklist');
            list.innerHTML = filtered.length
                ? buildChecklistHtml(filtered, instr)
                : `<div class="fc-empty" style="padding:24px;">No subjects match "${esc(e.target.value)}"</div>`;
            bindCheckboxes(right);
        }, 200);
    });

    bindCheckboxes(right);
    bindPhScope(right, instr);

    right.querySelector('#fc-discard-btn')?.addEventListener('click', () => {
        _pending = new Set(_original);
        renderRight(instr, container);
        updateBadge(instr.users_id);
    });
    right.querySelector('#fc-save-btn')?.addEventListener('click', () => saveAssignments(instr, container));
}

function renderPhScope(instr) {
    const yFrom = instr.year_level_from ? Number(instr.year_level_from) : null;
    const yTo   = instr.year_level_to   ? Number(instr.year_level_to)   : null;
    return `
    <div class="fc-ph-scope-panel">
        <span class="fc-extra-lbl">Program Head scope — handles year level(s):</span>
        <div class="fc-ph-years">
            ${[1, 2, 3, 4].map(y => `
            <label class="fc-ph-year-cb">
                <input type="checkbox" class="fc-ph-year" value="${y}"
                    ${yFrom !== null && yTo !== null && y >= yFrom && y <= yTo ? 'checked' : ''}>
                <span>${y}${ordinal(y)}</span>
            </label>`).join('')}
        </div>
        <span class="fc-ph-save-note" id="fc-ph-save-note"></span>
    </div>`;
}

function bindPhScope(right, instr) {
    const group = right.querySelectorAll('.fc-ph-year');
    if (!group.length) return;
    group.forEach(cb => cb.addEventListener('change', async () => {
        const checkedYears = [...group].filter(c => c.checked).map(c => parseInt(c.value));
        const note = right.querySelector('#fc-ph-save-note');
        const yearFrom = checkedYears.length ? Math.min(...checkedYears) : null;
        const yearTo   = checkedYears.length ? Math.max(...checkedYears) : null;

        group.forEach(c => c.disabled = true);
        const res = await Api.post('/SubjectOfferingsAPI.php?action=set-ph-scope', {
            users_id: instr.users_id,
            year_level_from: yearFrom,
            year_level_to: yearTo,
        });
        group.forEach(c => c.disabled = false);

        if (res.success) {
            instr.year_level_from = yearFrom;
            instr.year_level_to   = yearTo;
        }
        if (note) {
            note.textContent = res.success ? (checkedYears.length ? 'Saved' : 'Cleared') : (res.message || 'Failed to save');
            note.className = `fc-ph-save-note ${res.success ? 'ok' : 'err'}`;
            setTimeout(() => { if (note) note.textContent = ''; }, 2500);
        }
        if (!res.success) notify.error(res.message || 'Failed to update program head scope');
    }));
}

function subjRowHtml(s) {
    const key = `sid:${s.subject_id}`;
    const checked = _pending.has(key);
    const takenByOther = s.taken_by_other == 1;
    const dotClass = checked ? 'checked' : (takenByOther ? 'other' : 'free');
    const alsoNote = takenByOther
        ? `<span class="fc-also-note">Also: ${esc(s.other_instructor_names || 'another instructor')}</span>`
        : '';

    return `
    <div class="fc-instr-row-wrap" data-key="${key}">
        <label class="fc-instr-row ${checked ? 'is-assigned' : ''}">
            <input type="checkbox" class="fc-instr-cb" data-key="${key}" ${checked ? 'checked' : ''}>
            <span class="fc-dot ${dotClass}"></span>
            <div class="fc-instr-info">
                <div class="fc-instr-name">
                    <span class="fc-code-chip">${esc(s.subject_code)}</span>
                    ${esc(s.subject_name)}
                </div>
                <div class="fc-instr-meta">${s.units} unit${s.units != 1 ? 's' : ''}${alsoNote ? ' · ' + alsoNote : ''}</div>
            </div>
            <div class="fc-instr-status ${checked ? 'assigned' : 'free'}">
                ${checked
                    ? `<svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg> Assigned`
                    : 'Unassigned'}
            </div>
        </label>
        <div class="fc-row-extra-slot">${subjRowExtraHtml(s, checked)}</div>
    </div>`;
}

/** Grading-type select — only meaningful once the assignment is actually saved server-side. */
function subjRowExtraHtml(s, checked) {
    if (!checked) return '';
    const key = `sid:${s.subject_id}`;
    const isSaved = _original.has(key) && !!s.assigned_offering_id;
    if (!isSaved) {
        return `<div class="fc-instr-extra fc-instr-extra--pending">
            <span class="fc-extra-lbl">Grading options become available after you save this assignment.</span>
        </div>`;
    }
    const gType = s.grading_type || 'raw_score';
    return `
    <div class="fc-instr-extra">
        <div class="fc-grading-toggle">
            <span class="fc-extra-lbl">Grading:</span>
            <select class="fc-grading-sel" data-offering-id="${s.assigned_offering_id || ''}">
                <option value="raw_score" ${gType === 'raw_score' ? 'selected' : ''}>Raw Score</option>
                <option value="global"    ${gType === 'global'    ? 'selected' : ''}>Global (EL/Mastery)</option>
            </select>
            <span class="fc-grading-save-note"></span>
        </div>
    </div>`;
}

function bindCheckboxes(right) {
    right.querySelectorAll('.fc-instr-cb').forEach(cb => {
        cb.addEventListener('change', () => {
            const key = cb.dataset.key;
            if (cb.checked) _pending.add(key); else _pending.delete(key);

            const row = cb.closest('.fc-instr-row');
            row.classList.toggle('is-assigned', cb.checked);
            const dot = row.querySelector('.fc-dot');
            dot.className = `fc-dot ${cb.checked ? 'checked' : 'free'}`;
            const status = row.querySelector('.fc-instr-status');
            status.className = `fc-instr-status ${cb.checked ? 'assigned' : 'free'}`;
            status.innerHTML = cb.checked
                ? `<svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg> Assigned`
                : 'Unassigned';

            const wrap = cb.closest('.fc-instr-row-wrap');
            const subjId = key.slice(4);
            const subj = _subjects.find(s => String(s.subject_id) === subjId);
            const slot = wrap?.querySelector('.fc-row-extra-slot');
            if (slot && subj) {
                slot.innerHTML = subjRowExtraHtml(subj, cb.checked);
                bindRowExtras(slot);
            }

            const countEl = right.querySelector('#fc-assigned-count');
            const count = [..._pending].filter(k => k.startsWith('sid:')).length;
            if (countEl) {
                countEl.textContent = count;
                countEl.nextElementSibling.textContent = `subject${count !== 1 ? 's' : ''} assigned`;
            }

            const added   = [..._pending].filter(k => !_original.has(k));
            const removed = [..._original].filter(k => !_pending.has(k));
            const bar = right.querySelector('#fc-cart-bar');
            if (bar) bar.style.display = (added.length || removed.length) ? 'flex' : 'none';
            const lbl = right.querySelector('#fc-cart-label');
            if (lbl) {
                const parts = [];
                if (added.length)   parts.push(`+${added.length} to assign`);
                if (removed.length) parts.push(`−${removed.length} to remove`);
                lbl.textContent = parts.join('  ·  ');
            }
        });
    });

    bindRowExtras(right);
}

function bindRowExtras(scope) {
    scope.querySelectorAll('.fc-grading-sel').forEach(sel => {
        sel.addEventListener('change', async () => {
            const offeringId = sel.dataset.offeringId;
            const note = sel.parentElement.querySelector('.fc-grading-save-note');
            if (!offeringId) return;
            sel.disabled = true;
            const res = await Api.post('/SubjectOfferingsAPI.php?action=set-grading-type', {
                subject_offered_id: parseInt(offeringId),
                grading_type: sel.value,
            });
            sel.disabled = false;
            if (note) {
                note.textContent = res.success ? 'Saved' : (res.message || 'Failed to save');
                note.className = `fc-grading-save-note ${res.success ? 'ok' : 'err'}`;
                setTimeout(() => { if (note) note.textContent = ''; }, 2500);
            }
            if (!res.success) notify.error(res.message || 'Failed to update grading type');
        });
    });
}

async function saveAssignments(instr, container) {
    const btn = container.querySelector('#fc-save-btn');
    btn.disabled = true; btn.textContent = 'Saving…';

    const assignIds = [..._pending].filter(k => !_original.has(k) && k.startsWith('sid:')).map(k => parseInt(k.slice(4)));
    const unassignIds = [..._original].filter(k => !_pending.has(k) && k.startsWith('sid:')).map(k => parseInt(k.slice(4)));

    const res = await Api.post('/SubjectOfferingsAPI.php?action=dean-assign', {
        instructor_id: instr.users_id,
        semester_id: parseInt(_semId),
        assign_subject_ids: assignIds,
        unassign_subject_ids: unassignIds,
    });

    if (res.success) {
        await loadSubjects(instr, container);
    } else {
        btn.disabled = false; btn.textContent = 'Save Assignments';
        notify.error(res.message || 'Save failed. Please try again.');
    }
}

function updateBadge(instrId) {
    const isDean = _deanSelf && _deanSelf.users_id === instrId;
    const badge = document.getElementById(isDean ? 'asgn-self' : `asgn-${instrId}`);
    const count = [..._pending].filter(k => k.startsWith('sid:')).length;
    if (badge) {
        badge.textContent = count;
        badge.className = `fc-assign-badge ${count > 0 ? 'has' : ''}`;
    }
    const instr = _instructors.find(i => i.users_id == instrId);
    if (instr) instr._assignedCount = count;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function subjSemLabel(sem) {
    if (!sem) return 'Unspecified';
    if (sem == 1) return '1st Semester';
    if (sem == 2) return '2nd Semester';
    if (sem == 3) return 'Summer';
    return `Semester ${sem}`;
}

function ordinal(n) {
    const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return s[(v - 20) % 10] || s[v] || s[0];
}

function esc(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
}

// ── CSS ───────────────────────────────────────────────────────────────────

function css() { return `
    .fc-boot { display:flex;align-items:center;justify-content:center;height:200px; }
    .fc-spin { width:32px;height:32px;border:3px solid #e5e7eb;border-top-color:#00461B;border-radius:50%;animation:fcSpin .7s linear infinite; }
    @keyframes fcSpin { to { transform:rotate(360deg); } }

    .fc-banner { background:#fff;border:1px solid #E5E7EB;border-radius:16px;padding:20px 24px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px; }
    .fc-banner-left { display:flex;align-items:center;gap:14px;flex:1;min-width:220px; }
    .fc-banner-icon { width:46px;height:46px;background:#F3F4F6;border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0; }
    .fc-banner-sub { font-size:12px;color:#6B7280;margin:0; }
    .fc-banner-right { display:flex;flex-direction:column;gap:4px; }
    .fc-sem-label { font-size:11px;color:#6B7280;font-weight:600;letter-spacing:.5px;text-transform:uppercase; }
    .fc-sem-sel { padding:8px 12px;border:1px solid #E5E7EB;border-radius:8px;background:#F3F4F6;color:#111;font-size:13px;font-weight:600;cursor:pointer; }

    .fc-layout { display:grid;grid-template-columns:300px 1fr;gap:16px;align-items:start; }

    .fc-left { background:#fff;border:1px solid #e8e8e8;border-radius:14px;overflow:hidden;position:sticky;top:16px;max-height:calc(100vh - 200px);display:flex;flex-direction:column; }
    .fc-left-head { padding:14px 14px 10px;border-bottom:1px solid #f0f0f0;display:flex;flex-direction:column;gap:8px; }
    .fc-left-title-row { display:flex;align-items:center;gap:8px; }
    .fc-left-title { font-size:13px;font-weight:700;color:#404040; }
    .fc-count-badge { background:#E8F5E9;color:#1B4D3E;padding:1px 7px;border-radius:10px;font-size:11px;font-weight:700; }
    .fc-search-inp { padding:8px 10px;border:1px solid #e0e0e0;border-radius:8px;font-size:13px;width:100%;box-sizing:border-box;outline:none; }
    .fc-search-inp:focus { border-color:#00461B; }
    .fc-search-inp.sm { padding:6px 10px;font-size:12px;width:180px; }
    .fc-filter-sel { padding:6px 8px;border:1px solid #e0e0e0;border-radius:7px;font-size:11px;background:#f9fafb;cursor:pointer;outline:none; }
    .fc-filter-sel:focus { border-color:#00461B; }

    .fc-subj-list { overflow-y:auto;flex:1; }
    .fc-empty { padding:24px;text-align:center;color:#9ca3af;font-size:13px; }
    .fc-loading { display:flex;align-items:center;justify-content:center;gap:10px;padding:60px;color:#737373;font-size:14px; }
    .fc-err { padding:24px;color:#b91c1c;text-align:center;font-size:13px; }

    .fc-subj-card { display:flex;align-items:center;justify-content:space-between;gap:10px;padding:11px 14px;cursor:pointer;border-bottom:1px solid #f5f5f5;transition:background .12s; }
    .fc-subj-card:hover { background:#f9fafb; }
    .fc-subj-card.active { background:#E8F5E9;border-right:3px solid #00461B; }
    .fc-subj-card-top { display:flex;align-items:center;gap:5px;flex-wrap:wrap; }
    .fc-subj-card-name { font-size:12px;font-weight:600;color:#1a1a1a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }
    .fc-subj-card-meta { font-size:11px;color:#9ca3af;margin-top:2px; }
    .fc-code-chip { background:#f3f4f6;color:#374151;padding:2px 6px;border-radius:4px;font-family:monospace;font-size:10px;font-weight:700;white-space:nowrap;flex-shrink:0;margin-right:6px; }
    .fc-prog-tag { background:#1B4D3E;color:#fff;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700;white-space:nowrap;flex-shrink:0; }
    .fc-role-tag { background:#B45309;color:#fff;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700;white-space:nowrap; }
    .fc-assign-badge { min-width:22px;text-align:center;padding:2px 7px;border-radius:10px;font-size:11px;font-weight:700;background:#f3f4f6;color:#9ca3af;flex-shrink:0; }
    .fc-assign-badge.has { background:#E8F5E9;color:#00461B; }

    .fc-instr-av { width:36px;height:36px;border-radius:50%;background:#1e40af;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;flex-shrink:0; }
    .fc-instr-av.lg { width:48px;height:48px;font-size:16px; }
    .fc-dean-av { background:#7C3AED !important; }
    .fc-dean-av-ph { background:#B45309; }

    .fc-dean-self-section { padding:10px 12px 0; }
    .fc-dean-self-label { font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#9ca3af;padding:0 2px 6px; }
    .fc-dean-self-card { border-radius:10px;border:1.5px dashed #00461B; }
    .fc-dean-self-card:hover { background:#E8F5E9; }
    .fc-dean-self-card.active { background:#E8F5E9;border-color:#00461B;border-style:solid; }
    .fc-dean-self-divider { height:1px;background:#f0f0f0;margin:10px 0 2px; }

    .fc-right { background:#fff;border:1px solid #e8e8e8;border-radius:14px;min-height:420px;overflow:hidden; }
    .fc-placeholder { display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:80px 24px;text-align:center;color:#9ca3af; }
    .fc-placeholder p { font-size:14px;max-width:280px; }

    .fc-subj-hdr { display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:18px 22px 14px;border-bottom:1px solid #f0f0f0;background:#fafafa; }
    .fc-subj-hdr-name { font-size:16px;font-weight:700;color:#1a1a1a;margin-bottom:4px; }
    .fc-subj-hdr-meta { font-size:12px;color:#737373; }
    .fc-subj-hdr-stat { text-align:center;flex-shrink:0; }
    .fc-stat-val { display:block;font-size:28px;font-weight:800;color:#00461B;line-height:1; }
    .fc-stat-lbl { font-size:11px;color:#9ca3af; }

    .fc-ph-scope-panel { display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:12px 22px;background:#FFFBEB;border-bottom:1px solid #FDE68A; }

    .fc-instr-head { display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 20px 10px;border-bottom:1px solid #f5f5f5; }
    .fc-leg-item { display:flex;align-items:center;gap:6px;font-size:12px;color:#737373; }
    .fc-leg-dot { width:10px;height:10px;border-radius:50%;flex-shrink:0; }
    .fc-leg-dot.checked { background:#00461B; }
    .fc-leg-dot.other   { background:#f59e0b; }
    .fc-leg-dot.free    { background:#e5e7eb;border:1px solid #d1d5db; }

    .fc-instr-checklist { padding:12px 20px 100px; }
    .fc-instr-group { margin-bottom:20px; }
    .fc-instr-group-hdr { display:flex;align-items:center;gap:8px;margin-bottom:8px; }
    .fc-instr-group-name { font-size:12px;color:#737373; }
    .fc-prog-primary { margin-left:auto;background:#FEF9C3;color:#854D0E;padding:2px 9px;border-radius:20px;font-size:11px;font-weight:700;flex-shrink:0;display:flex;align-items:center;gap:4px; }

    .fc-year-block { margin-bottom:14px; }
    .fc-year-label { font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;padding-left:4px; }
    .fc-sem-block { margin-bottom:10px; }
    .fc-sem-sublabel { font-size:11px;font-weight:600;color:#9ca3af;margin-bottom:4px;padding-left:4px;letter-spacing:.3px; }

    .fc-instr-row { display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:10px;cursor:pointer;border:1px solid transparent;margin-bottom:4px;transition:background .12s; }
    .fc-instr-row:hover { background:#f8fafc; }
    .fc-instr-row.is-assigned { background:#E8F5E9;border-color:#bbf7d0; }
    .fc-instr-cb { display:none; }
    .fc-dot { width:10px;height:10px;border-radius:50%;flex-shrink:0; }
    .fc-dot.checked { background:#00461B; }
    .fc-dot.other   { background:#f59e0b; }
    .fc-dot.free    { background:#e5e7eb;border:1px solid #d1d5db; }
    .fc-instr-info { flex:1;min-width:0; }
    .fc-instr-name { font-size:13px;font-weight:600;color:#1a1a1a;display:flex;align-items:center;flex-wrap:wrap; }
    .fc-instr-meta { font-size:11px;color:#9ca3af;margin-top:2px; }
    .fc-also-note { color:#1d4ed8;font-weight:600; }
    .fc-instr-status { display:flex;align-items:center;gap:4px;font-size:11px;font-weight:700;flex-shrink:0;padding:3px 9px;border-radius:20px; }
    .fc-instr-status.assigned { background:#D1FAE5;color:#065F46; }
    .fc-instr-status.free { background:#f3f4f6;color:#9ca3af; }

    .fc-instr-row-wrap { margin-bottom:4px; }
    .fc-instr-row-wrap .fc-instr-row { margin-bottom:0; }
    .fc-instr-extra { margin:2px 0 8px 22px;padding:10px 12px;background:#F9FAFB;border:1px solid #EEF0F2;border-radius:10px;display:flex;flex-direction:column;gap:10px; }
    .fc-instr-extra--pending { color:#9ca3af;font-size:11.5px;font-style:italic; }
    .fc-extra-lbl { font-size:11.5px;font-weight:600;color:#6B7280; }
    .fc-grading-toggle { display:flex;align-items:center;gap:8px;flex-wrap:wrap; }
    .fc-grading-sel { padding:5px 9px;border:1px solid #e0e0e0;border-radius:7px;font-size:12px;background:#fff;cursor:pointer;outline:none; }
    .fc-grading-sel:focus { border-color:#00461B; }
    .fc-grading-save-note, .fc-ph-save-note { font-size:11px;font-weight:700; }
    .fc-grading-save-note.ok, .fc-ph-save-note.ok { color:#15803d; }
    .fc-grading-save-note.err, .fc-ph-save-note.err { color:#b91c1c; }

    .fc-ph-years { display:flex;gap:6px;flex-wrap:wrap; }
    .fc-ph-year-cb { display:flex;align-items:center;gap:5px;padding:5px 10px;border:1px solid #e0e0e0;border-radius:20px;font-size:11.5px;font-weight:600;color:#374151;cursor:pointer;background:#fff; }
    .fc-ph-year-cb:has(input:checked) { background:#FEF3C7;border-color:#F59E0B;color:#92400E; }
    .fc-ph-year-cb input { accent-color:#B45309;margin:0; }

    .fc-cart-bar { position:sticky;bottom:0;display:flex;align-items:center;justify-content:space-between;gap:12px;background:#fff;border-top:2px solid #00461B;padding:12px 20px;border-radius:0 0 14px 14px;box-shadow:0 -4px 16px rgba(0,0,0,.08);flex-wrap:wrap; }
    .fc-cart-info { display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:#374151; }
    .fc-btn-discard { padding:8px 14px;border:1px solid #e0e0e0;border-radius:8px;background:#fff;font-size:13px;font-weight:600;cursor:pointer;color:#374151; }
    .fc-btn-discard:hover { background:#f5f5f5; }
    .fc-btn-review { display:flex;align-items:center;gap:6px;padding:8px 18px;border:none;border-radius:8px;background:#00461B;color:#fff;font-size:13px;font-weight:700;cursor:pointer; }
    .fc-btn-review:hover { background:#006428; }
    .fc-btn-review:disabled { opacity:.6;cursor:not-allowed; }

    @media(max-width:768px) {
        .fc-layout { grid-template-columns:1fr; }
        .fc-left { position:static;max-height:240px; }
    }
`; }
