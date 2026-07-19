/**
 * Dean Faculty Page — subject-centric assignment
 * Left: subject list  |  Right: instructor checklist for selected subject
 * Cart → Review → Confirm flow
 */
import { Api } from '../../api.js';
import { notify } from '../../utils/notify.js';

let _subjects     = [];
let _instructors  = [];
let _selectedSubj = null;
let _original     = new Set();
let _cart         = new Set();
let _progFilter   = '';
let _yrFilter     = '';

export async function render(container) {
    container.innerHTML = `<style>${css()}</style><div class="fc-boot"><div class="fc-spin"></div></div>`;

    // Faculty can only be assigned to subjects that have actually been
    // Opened (see "Subject Offered" page) for the currently active school
    // semester — not every curriculum subject.
    const semRes = await Api.get('/SubjectOfferingsAPI.php?action=semesters');
    const semesters = semRes.success ? semRes.data : [];
    const activeSemester = semesters.find(s => s.status === 'active') || semesters[0] || null;

    const offRes = await Api.get(
        `/SubjectOfferingsAPI.php?action=offered-list${activeSemester ? `&semester_id=${activeSemester.semester_id}` : ''}`
    );
    const offered = offRes.success ? offRes.data : [];

    _subjects = offered
        .filter(s => s.offering_status === 'open' && s.status === 'active')
        .map(s => ({ ...s, subject_offered_id: s.subject_offered_id }));

    const programs = [...new Map(_subjects.filter(s => s.program_code).map(s => [s.program_code, s.program_name])).entries()]
        .sort(([a],[b]) => a.localeCompare(b));

    container.innerHTML = `<style>${css()}</style>

    <!-- Banner -->
    <div class="fc-banner">
        <div class="fc-banner-left">
            <div class="fc-banner-icon">
                <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="#111" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z"/>
                </svg>
            </div>
            <div>
                <p class="fc-banner-sub">Only subjects Opened for the active semester appear here — see Subject Offered. Select a subject then check which instructors teach it.</p>
            </div>
        </div>
    </div>

    <!-- Layout -->
    <div class="fc-layout">

        <!-- LEFT: Subject list -->
        <div class="fc-left">
            <div class="fc-left-head">
                <div class="fc-left-title-row">
                    <span class="fc-left-title">Subjects</span>
                    <span class="fc-count-badge" id="fc-subj-count">${_subjects.length}</span>
                </div>
                <input id="fc-subj-search" class="fc-search-inp" type="text" placeholder="Search code or name…">
                <div class="fc-filter-row">
                    <select id="fc-prog-filter" class="fc-filter-sel">
                        <option value="">All Programs</option>
                        ${programs.map(([code]) => `<option value="${esc(code)}">${esc(code)}</option>`).join('')}
                    </select>
                    <select id="fc-yr-filter" class="fc-filter-sel">
                        <option value="">All Years</option>
                        <option value="1">1st</option>
                        <option value="2">2nd</option>
                        <option value="3">3rd</option>
                        <option value="4">4th</option>
                    </select>
                </div>
            </div>
            <div id="fc-subj-list" class="fc-subj-list">
                ${renderSubjList(_subjects)}
            </div>
        </div>

        <!-- RIGHT: Instructor assignment panel -->
        <div class="fc-right" id="fc-right">
            <div class="fc-placeholder">
                <svg width="56" height="56" fill="none" viewBox="0 0 24 24" stroke="#d1d5db" stroke-width="1.2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 14l9-5-9-5-9 5 9 5zm0 7v-7"/>
                </svg>
                <p>Select a subject on the left to assign instructors to it</p>
            </div>
        </div>

    </div>

    <!-- Review modal -->
    <div id="fc-review-modal" class="fc-modal-backdrop" style="display:none;">
        <div class="fc-modal">
            <div class="fc-modal-hdr">
                <div>
                    <h3 class="fc-modal-title">Review Assignment</h3>
                    <p class="fc-modal-sub" id="fc-review-sub"></p>
                </div>
                <button class="fc-modal-close" id="fc-close-review">&times;</button>
            </div>
            <div class="fc-modal-body" id="fc-review-body"></div>
            <div class="fc-modal-foot">
                <button class="fc-btn-cancel" id="fc-cancel-review">Back to Edit</button>
                <button class="fc-btn-confirm" id="fc-confirm-btn">Confirm</button>
            </div>
        </div>
    </div>`;

    container.querySelector('#fc-prog-filter').addEventListener('change', e => { _progFilter = e.target.value; applySubjFilters(container); });
    container.querySelector('#fc-yr-filter').addEventListener('change',   e => { _yrFilter   = e.target.value; applySubjFilters(container); });

    let debounce;
    container.querySelector('#fc-subj-search').addEventListener('input', () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => applySubjFilters(container), 200);
    });

    container.querySelector('#fc-close-review').addEventListener('click',  () => closeReview(container));
    container.querySelector('#fc-cancel-review').addEventListener('click', () => closeReview(container));
    container.querySelector('#fc-review-modal').addEventListener('click', e => {
        if (e.target === e.currentTarget) closeReview(container);
    });
    container.querySelector('#fc-confirm-btn').addEventListener('click', () => confirmAssignment(container));

    bindSubjClicks(container);
}

// ── Subject list ──────────────────────────────────────────────────────────────

function applySubjFilters(container) {
    const q = (container.querySelector('#fc-subj-search')?.value || '').toLowerCase();
    let list = _subjects;
    if (_progFilter) list = list.filter(s => s.program_code === _progFilter);
    if (_yrFilter)   list = list.filter(s => String(s.year_level) === _yrFilter);
    if (q) list = list.filter(s => (s.subject_code + ' ' + s.subject_name).toLowerCase().includes(q));

    const countEl = container.querySelector('#fc-subj-count');
    if (countEl) countEl.textContent = list.length;
    container.querySelector('#fc-subj-list').innerHTML = renderSubjList(list);
    bindSubjClicks(container);
}

function renderSubjList(list) {
    if (!list.length) return `<div class="fc-empty">No subjects offered for the active semester yet.<br>Open subjects first from the "Subject Offered" page.</div>`;
    return list.map(s => {
        const isActive = _selectedSubj && _selectedSubj.subject_id === s.subject_id;
        const aCount   = s._assignedCount ?? '';
        return `
        <div class="fc-subj-card ${isActive?'active':''}" data-id="${s.subject_id}">
            <div class="fc-subj-card-main">
                <div class="fc-subj-card-top">
                    <span class="fc-code-chip">${esc(s.subject_code)}</span>
                    ${s.program_code?`<span class="fc-prog-tag">${esc(s.program_code)}</span>`:''}
                </div>
                <div class="fc-subj-card-name">${esc(s.subject_name)}</div>
                <div class="fc-subj-card-meta">
                    ${s.units} units${s.year_level?' · '+s.year_level+ordinal(s.year_level)+' Year':''}
                </div>
            </div>
            <div class="fc-assign-badge ${aCount>0?'has':''}" id="asgn-${s.subject_id}">
                ${aCount !== '' ? aCount : '—'}
            </div>
        </div>`;
    }).join('');
}

function bindSubjClicks(container) {
    container.querySelectorAll('.fc-subj-card').forEach(card => {
        card.addEventListener('click', async () => {
            const subj = _subjects.find(s => s.subject_id == card.dataset.id);
            if (!subj) return;
            if (_selectedSubj?.subject_id === subj.subject_id) return;

            const added   = [..._cart].filter(k => !_original.has(k));
            const removed = [..._original].filter(k => !_cart.has(k));
            if ((added.length || removed.length) && _selectedSubj) {
                if (!await notify.confirm(`Unsaved changes for "${_selectedSubj.subject_name}". Discard and continue?`, { confirmText: 'Discard', danger: true })) return;
            }

            _selectedSubj = subj;
            container.querySelectorAll('.fc-subj-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            loadInstructors(subj, container);
        });
    });
}

// ── Instructor panel ──────────────────────────────────────────────────────────

async function loadInstructors(subj, container) {
    const right = container.querySelector('#fc-right');
    right.innerHTML = `<div class="fc-loading"><div class="fc-spin"></div><span>Loading instructors…</span></div>`;

    const res = await Api.get(
        `/SubjectOfferingsAPI.php?action=subject-instructors&subject_id=${subj.subject_id}`
    );
    if (!res.success) {
        right.innerHTML = `<div class="fc-err">Failed to load instructors.</div>`;
        return;
    }

    _instructors = res.data;
    _original    = new Set(_instructors.filter(i => i.is_assigned == 1).map(i => String(i.users_id)));
    _cart        = new Set(_original);

    renderRight(subj, container);
    updateAssignBadge(subj.subject_id);
}

function renderRight(subj, container) {
    const right    = container.querySelector('#fc-right');

    right.innerHTML = `
    <!-- Subject header -->
    <div class="fc-subj-hdr">
        <div class="fc-subj-hdr-left">
            <div class="fc-subj-hdr-top">
                <span class="fc-code-chip lg">${esc(subj.subject_code)}</span>
                ${subj.program_code?`<span class="fc-prog-tag">${esc(subj.program_code)}</span>`:''}
            </div>
            <div class="fc-subj-hdr-name">${esc(subj.subject_name)}</div>
            <div class="fc-subj-hdr-meta">
                ${subj.units} units${subj.year_level?' · '+subj.year_level+ordinal(subj.year_level)+' Year':''}
            </div>
        </div>
        <div class="fc-subj-hdr-stat">
            <span class="fc-stat-val" id="fc-instr-count">${_cart.size}</span>
            <span class="fc-stat-lbl">instructor${_cart.size !== 1 ? 's' : ''}</span>
        </div>
    </div>

    <!-- Instructor search -->
    <div class="fc-instr-head">
        <span class="fc-instr-title">Instructors — check to assign, uncheck to remove</span>
        <input id="fc-instr-search" class="fc-search-inp sm" type="text" placeholder="Search…">
    </div>

    <!-- Checklist -->
    <div class="fc-instr-checklist" id="fc-instr-checklist">
        ${renderInstrChecklist(_instructors)}
    </div>

    <!-- Cart bar -->
    <div class="fc-cart-bar" id="fc-cart-bar" style="display:none;">
        <div class="fc-cart-info">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#00461B" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
            </svg>
            <span id="fc-cart-label"></span>
        </div>
        <div style="display:flex;gap:8px;">
            <button class="fc-btn-discard" id="fc-discard-btn">Discard</button>
            <button class="fc-btn-review" id="fc-review-btn">
                Review &amp; Confirm
                <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>
            </button>
        </div>
    </div>`;

    let deb;
    right.querySelector('#fc-instr-search')?.addEventListener('input', e => {
        clearTimeout(deb);
        deb = setTimeout(() => {
            const q = e.target.value.toLowerCase();
            const filtered = q
                ? _instructors.filter(i => (i.first_name+' '+i.last_name+' '+(i.employee_id||'')).toLowerCase().includes(q))
                : _instructors;
            right.querySelector('#fc-instr-checklist').innerHTML = renderInstrChecklist(filtered);
            bindCheckboxes(right);
        }, 200);
    });

    bindCheckboxes(right);

    right.querySelector('#fc-discard-btn')?.addEventListener('click', () => {
        _cart = new Set(_original);
        renderRight(subj, container);
    });
    right.querySelector('#fc-review-btn')?.addEventListener('click', () => openReview(subj, container));
}

const ROLE_LABELS = { dean: 'Dean (Self)', program_head: 'Program Heads', instructor: 'Instructors' };
const ROLE_ORDER  = ['dean', 'program_head', 'instructor'];

function renderInstrChecklist(list) {
    if (!list.length) return `<div class="fc-empty" style="padding:24px;">No instructors found</div>`;

    const groups = {};
    list.forEach(i => {
        const g = i.role || 'instructor';
        if (!groups[g]) groups[g] = [];
        groups[g].push(i);
    });

    return ROLE_ORDER.filter(r => groups[r]?.length).map(role => `
    <div class="fc-instr-group">
        <div class="fc-instr-group-hdr">
            <span class="fc-prog-tag fc-role-${role}">${esc(ROLE_LABELS[role] || role)}</span>
        </div>
        ${groups[role].map(i => instrRowHtml(i)).join('')}
    </div>`).join('');
}

function instrRowHtml(i) {
    const id      = String(i.users_id);
    const checked = _cart.has(id);
    const init    = ((i.first_name||'?')[0]+(i.last_name||'?')[0]).toUpperCase();

    return `
    <div class="fc-instr-row-wrap" data-id="${id}">
        <label class="fc-instr-row ${checked?'is-assigned':''}">
            <input type="checkbox" class="fc-instr-cb" data-id="${id}" ${checked?'checked':''}>
            <div class="fc-instr-av">${init}</div>
            <div class="fc-instr-info">
                <div class="fc-instr-name">${esc(i.first_name)} ${esc(i.last_name)}</div>
                <div class="fc-instr-meta">${esc(i.employee_id||'—')}${i.program_code?' · '+esc(i.program_code):''}</div>
            </div>
            <div class="fc-instr-status ${checked?'assigned':'free'}">
                ${checked
                    ? `<svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg> Assigned`
                    : 'Unassigned'}
            </div>
        </label>
        <div class="fc-row-extra-slot">${instrRowExtraHtml(i, checked)}</div>
    </div>`;
}

/** The variable part of a row: grading-type select + Program Head year-scope. */
function instrRowExtraHtml(i, checked) {
    const id      = String(i.users_id);
    // Extras need a real subject_offered_id, which only exists once the
    // assignment is actually saved server-side — not for a row that's
    // merely checked in the pending cart (not yet confirmed).
    const isSaved = _original.has(id) && !!i.assigned_offering_id;
    if (!checked) return '';
    if (!isSaved) {
        return `<div class="fc-instr-extra fc-instr-extra--pending">
            <span class="fc-extra-lbl">Grading options &amp; scope become available after you confirm this assignment.</span>
        </div>`;
    }

    const gType = i.grading_type || 'raw_score';
    const isPh  = i.role === 'program_head';
    const yFrom = i.year_level_from ? Number(i.year_level_from) : null;
    const yTo   = i.year_level_to   ? Number(i.year_level_to)   : null;

    return `
    <div class="fc-instr-extra">
        <div class="fc-grading-toggle">
            <span class="fc-extra-lbl">Grading:</span>
            <select class="fc-grading-sel" data-offering-id="${i.assigned_offering_id||''}">
                <option value="raw_score" ${gType==='raw_score'?'selected':''}>Raw Score</option>
                <option value="global"    ${gType==='global'   ?'selected':''}>Global (EL/Mastery)</option>
            </select>
            <span class="fc-grading-save-note" data-grading-note="${id}"></span>
        </div>
        ${isPh ? `
        <div class="fc-ph-scope">
            <span class="fc-extra-lbl">Handles year level(s):</span>
            <div class="fc-ph-years">
                ${[1,2,3,4].map(y => `
                <label class="fc-ph-year-cb">
                    <input type="checkbox" class="fc-ph-year" data-users-id="${id}" value="${y}"
                        ${yFrom !== null && yTo !== null && y >= yFrom && y <= yTo ? 'checked' : ''}>
                    <span>${y}${ordinal(y)}</span>
                </label>`).join('')}
            </div>
            <span class="fc-ph-save-note" data-ph-note="${id}"></span>
        </div>` : ''}
    </div>`;
}

function bindCheckboxes(right) {
    right.querySelectorAll('.fc-instr-cb').forEach(cb => {
        cb.addEventListener('change', () => {
            const id = cb.dataset.id;
            if (cb.checked) _cart.add(id); else _cart.delete(id);

            const row = cb.closest('.fc-instr-row');
            row.classList.toggle('is-assigned', cb.checked);
            const status = row.querySelector('.fc-instr-status');
            status.className = `fc-instr-status ${cb.checked?'assigned':'free'}`;
            status.innerHTML = cb.checked
                ? `<svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg> Assigned`
                : 'Unassigned';

            // Re-render just this row's extra slot (grading type / PH scope)
            const wrap = cb.closest('.fc-instr-row-wrap');
            const person = _instructors.find(x => String(x.users_id) === id);
            const slot = wrap?.querySelector('.fc-row-extra-slot');
            if (slot && person) {
                slot.innerHTML = instrRowExtraHtml(person, cb.checked);
                bindRowExtras(slot);
            }

            const countEl = right.querySelector('#fc-instr-count');
            if (countEl) {
                countEl.textContent = _cart.size;
                countEl.nextElementSibling.textContent = `instructor${_cart.size!==1?'s':''}`;
            }

            const added   = [..._cart].filter(k => !_original.has(k));
            const removed = [..._original].filter(k => !_cart.has(k));
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

/** Binds the grading-type <select> and Program Head year-scope checkboxes within `scope`. */
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

    scope.querySelectorAll('.fc-ph-year').forEach(cb => {
        cb.addEventListener('change', async () => {
            const usersId = cb.dataset.usersId;
            const group = scope.querySelectorAll(`.fc-ph-year[data-users-id="${usersId}"]`);
            const checkedYears = [...group].filter(c => c.checked).map(c => parseInt(c.value));
            const note = scope.querySelector(`[data-ph-note="${usersId}"]`);

            const yearFrom = checkedYears.length ? Math.min(...checkedYears) : null;
            const yearTo   = checkedYears.length ? Math.max(...checkedYears) : null;

            group.forEach(c => c.disabled = true);
            const res = await Api.post('/SubjectOfferingsAPI.php?action=set-ph-scope', {
                users_id: parseInt(usersId),
                year_level_from: yearFrom,
                year_level_to: yearTo,
            });
            group.forEach(c => c.disabled = false);

            if (note) {
                note.textContent = res.success
                    ? (checkedYears.length ? 'Saved' : 'Cleared')
                    : (res.message || 'Failed to save');
                note.className = `fc-ph-save-note ${res.success ? 'ok' : 'err'}`;
                setTimeout(() => { if (note) note.textContent = ''; }, 2500);
            }
            if (!res.success) notify.error(res.message || 'Failed to update program head scope');
        });
    });
}

// ── Review modal ──────────────────────────────────────────────────────────────

function openReview(subj, container) {
    const byId = id => _instructors.find(i => String(i.users_id) === id);

    const added   = [..._cart].filter(k => !_original.has(k)).map(byId).filter(Boolean);
    const removed = [..._original].filter(k => !_cart.has(k)).map(byId).filter(Boolean);
    const kept    = [..._cart].filter(k =>  _original.has(k)).map(byId).filter(Boolean);

    container.querySelector('#fc-review-sub').textContent =
        `${subj.subject_code} — ${subj.subject_name}`;

    container.querySelector('#fc-review-body').innerHTML = `
        ${added.length ? `
        <div class="fc-rv-section">
            <div class="fc-rv-section-hdr add">
                <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
                Adding ${added.length} instructor${added.length>1?'s':''}
            </div>
            ${added.map(i => instrRow(i,'add')).join('')}
        </div>` : ''}
        ${removed.length ? `
        <div class="fc-rv-section">
            <div class="fc-rv-section-hdr remove">
                <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M20 12H4"/></svg>
                Removing ${removed.length} instructor${removed.length>1?'s':''}
            </div>
            ${removed.map(i => instrRow(i,'remove')).join('')}
        </div>` : ''}
        ${kept.length ? `
        <div class="fc-rv-section">
            <div class="fc-rv-section-hdr keep">
                <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
                Keeping ${kept.length} existing
            </div>
            ${kept.map(i => instrRow(i,'keep')).join('')}
        </div>` : ''}`;

    container.querySelector('#fc-review-modal').style.display = 'flex';
}

function instrRow(i, cls) {
    const init = ((i.first_name||'?')[0]+(i.last_name||'?')[0]).toUpperCase();
    return `
    <div class="fc-rv-row ${cls}">
        <div class="fc-rv-av">${init}</div>
        <div class="fc-rv-info">
            <div class="fc-rv-name">${esc(i.first_name)} ${esc(i.last_name)}</div>
            <div class="fc-rv-meta">${esc(i.employee_id||'—')}${i.program_code?' · '+esc(i.program_code):''}</div>
        </div>
    </div>`;
}

function closeReview(container) {
    container.querySelector('#fc-review-modal').style.display = 'none';
}

async function confirmAssignment(container) {
    const btn = container.querySelector('#fc-confirm-btn');
    btn.disabled = true; btn.textContent = 'Saving…';

    const assignIds   = [..._cart].filter(k => !_original.has(k)).map(Number);
    const unassignIds = [..._original].filter(k => !_cart.has(k)).map(Number);

    const res = await Api.post('/SubjectOfferingsAPI.php?action=subject-assign', {
        subject_id:              _selectedSubj.subject_id,
        assign_instructor_ids:   assignIds,
        unassign_instructor_ids: unassignIds,
    });

    btn.disabled = false; btn.textContent = 'Confirm';

    if (res.success) {
        closeReview(container);
        await loadInstructors(_selectedSubj, container);
        updateAssignBadge(_selectedSubj.subject_id);
    } else {
        const body = container.querySelector('#fc-review-body');
        // Clear any previous error before prepending a fresh one
        body.querySelectorAll('.fc-err-inline').forEach(el => el.remove());
        const err  = document.createElement('div');
        err.className   = 'fc-err-inline';
        err.textContent = res.message || 'Save failed. Please try again.';
        body.prepend(err);
    }
}

function updateAssignBadge(subjectId) {
    const count = _cart.size;
    const badge = document.getElementById(`asgn-${subjectId}`);
    if (badge) {
        badge.textContent = count;
        badge.className   = `fc-assign-badge ${count > 0 ? 'has' : ''}`;
    }
    const subj = _subjects.find(s => s.subject_id == subjectId);
    if (subj) subj._assignedCount = count;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function subjSemLabel(sem) {
    if (sem == 1) return '1st Sem';
    if (sem == 2) return '2nd Sem';
    if (sem == 3) return 'Summer';
    return sem ? `Sem ${sem}` : '—';
}

function ordinal(n) {
    const s = ['th','st','nd','rd'], v = n % 100;
    return s[(v-20)%10] || s[v] || s[0];
}

function esc(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
}

// ── CSS ───────────────────────────────────────────────────────────────────────

function css() { return `
    .fc-boot { display:flex;align-items:center;justify-content:center;height:200px; }
    .fc-spin { width:32px;height:32px;border:3px solid #e5e7eb;border-top-color:#00461B;border-radius:50%;animation:fcSpin .7s linear infinite; }
    @keyframes fcSpin { to { transform:rotate(360deg); } }

    .fc-banner { background:#fff;border:1px solid #E5E7EB;border-radius:16px;padding:20px 24px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px; }
    .fc-banner-left { display:flex;align-items:center;gap:14px; }
    .fc-banner-icon { width:46px;height:46px;background:#F3F4F6;border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0; }
    .fc-banner-title { font-size:19px;font-weight:800;color:#111;margin:0 0 2px; }
    .fc-banner-sub { font-size:12px;color:#6B7280;margin:0; }
    .fc-banner-right { display:flex;flex-direction:column;gap:4px; }
    .fc-sem-label { font-size:11px;color:rgba(255,255,255,.65);font-weight:600;letter-spacing:.5px;text-transform:uppercase; }
    .fc-sem-sel { padding:8px 12px;border:1px solid rgba(255,255,255,.3);border-radius:8px;background:rgba(255,255,255,.1);color:#fff;font-size:13px;font-weight:600;cursor:pointer; }
    .fc-sem-sel option { background:#1B4D3E;color:#fff; }

    .fc-layout { display:grid;grid-template-columns:300px 1fr;gap:16px;align-items:start; }

    .fc-left { background:#fff;border:1px solid #e8e8e8;border-radius:14px;overflow:hidden;position:sticky;top:16px;max-height:calc(100vh - 200px);display:flex;flex-direction:column; }
    .fc-left-head { padding:14px 14px 10px;border-bottom:1px solid #f0f0f0;display:flex;flex-direction:column;gap:8px; }
    .fc-left-title-row { display:flex;align-items:center;gap:8px; }
    .fc-left-title { font-size:13px;font-weight:700;color:#404040; }
    .fc-count-badge { background:#E8F5E9;color:#1B4D3E;padding:1px 7px;border-radius:10px;font-size:11px;font-weight:700; }
    .fc-search-inp { padding:8px 10px;border:1px solid #e0e0e0;border-radius:8px;font-size:13px;width:100%;box-sizing:border-box;outline:none; }
    .fc-search-inp:focus { border-color:#00461B; }
    .fc-search-inp.sm { padding:6px 10px;font-size:12px;width:160px; }
    .fc-filter-row { display:flex;gap:5px; }
    .fc-filter-sel { flex:1;min-width:0;padding:6px 4px;border:1px solid #e0e0e0;border-radius:7px;font-size:11px;background:#f9fafb;cursor:pointer;outline:none; }
    .fc-filter-sel:focus { border-color:#00461B; }

    .fc-subj-list { overflow-y:auto;flex:1; }
    .fc-empty { padding:24px;text-align:center;color:#9ca3af;font-size:13px; }
    .fc-loading { display:flex;align-items:center;justify-content:center;gap:10px;padding:60px;color:#737373;font-size:14px; }
    .fc-err { padding:24px;color:#b91c1c;text-align:center;font-size:13px; }

    .fc-subj-card { display:flex;align-items:center;gap:10px;padding:11px 14px;cursor:pointer;border-bottom:1px solid #f5f5f5;transition:background .12s; }
    .fc-subj-card:hover { background:#f9fafb; }
    .fc-subj-card.active { background:#E8F5E9;border-right:3px solid #00461B; }
    .fc-subj-card-main { flex:1;min-width:0; }
    .fc-subj-card-top { display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-bottom:3px; }
    .fc-subj-card-name { font-size:12px;font-weight:600;color:#1a1a1a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }
    .fc-subj-card-meta { font-size:11px;color:#9ca3af;margin-top:2px; }
    .fc-code-chip { background:#f3f4f6;color:#374151;padding:2px 6px;border-radius:4px;font-family:monospace;font-size:10px;font-weight:700;white-space:nowrap;flex-shrink:0; }
    .fc-code-chip.lg { font-size:12px;padding:3px 9px; }
    .fc-subj-card.active .fc-code-chip { background:#D1FAE5;color:#065F46; }
    .fc-prog-tag { background:#1B4D3E;color:#fff;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700;white-space:nowrap;flex-shrink:0; }
    .fc-sem-tag { background:#e0e7ff;color:#3730a3;padding:2px 7px;border-radius:4px;font-size:10px;font-weight:600;white-space:nowrap; }
    .fc-assign-badge { min-width:22px;text-align:center;padding:2px 7px;border-radius:10px;font-size:11px;font-weight:700;background:#f3f4f6;color:#9ca3af;flex-shrink:0; }
    .fc-assign-badge.has { background:#E8F5E9;color:#00461B; }

    .fc-right { background:#fff;border:1px solid #e8e8e8;border-radius:14px;min-height:420px;overflow:hidden; }
    .fc-placeholder { display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:80px 24px;text-align:center;color:#9ca3af; }
    .fc-placeholder p { font-size:14px;max-width:280px; }

    .fc-subj-hdr { display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:18px 22px 14px;border-bottom:1px solid #f0f0f0;background:#fafafa; }
    .fc-subj-hdr-left { flex:1;min-width:0; }
    .fc-subj-hdr-top { display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:4px; }
    .fc-subj-hdr-name { font-size:16px;font-weight:700;color:#1a1a1a;margin-bottom:4px; }
    .fc-subj-hdr-meta { font-size:12px;color:#737373; }
    .fc-subj-hdr-stat { text-align:center;flex-shrink:0; }
    .fc-stat-val { display:block;font-size:28px;font-weight:800;color:#00461B;line-height:1; }
    .fc-stat-lbl { font-size:11px;color:#9ca3af; }

    .fc-instr-head { display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 20px 10px;border-bottom:1px solid #f5f5f5; }
    .fc-instr-title { font-size:12px;font-weight:600;color:#737373; }
    .fc-instr-checklist { padding:12px 20px 100px; }
    .fc-instr-group { margin-bottom:16px; }
    .fc-instr-group-hdr { display:flex;align-items:center;gap:8px;margin-bottom:8px; }
    .fc-instr-group-name { font-size:12px;color:#737373; }

    .fc-instr-row { display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:10px;cursor:pointer;border:1px solid transparent;margin-bottom:4px;transition:background .12s; }
    .fc-instr-row:hover { background:#f8fafc; }
    .fc-instr-row.is-assigned { background:#E8F5E9;border-color:#bbf7d0; }
    .fc-instr-cb { display:none; }
    .fc-instr-av { width:36px;height:36px;border-radius:50%;background:#1e40af;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;flex-shrink:0; }
    .fc-instr-row.is-assigned .fc-instr-av { background:#00461B; }
    .fc-instr-info { flex:1;min-width:0; }
    .fc-instr-name { font-size:13px;font-weight:600;color:#1a1a1a; }
    .fc-instr-meta { font-size:11px;color:#9ca3af;margin-top:1px; }
    .fc-instr-status { display:flex;align-items:center;gap:4px;font-size:11px;font-weight:700;flex-shrink:0;padding:3px 9px;border-radius:20px; }
    .fc-instr-status.assigned { background:#D1FAE5;color:#065F46; }
    .fc-instr-status.free { background:#f3f4f6;color:#9ca3af; }

    .fc-role-dean { background:#7C3AED; }
    .fc-role-program_head { background:#B45309; }
    .fc-role-instructor { background:#1B4D3E; }

    .fc-instr-row-wrap { margin-bottom:4px; }
    .fc-instr-row-wrap .fc-instr-row { margin-bottom:0; }
    .fc-instr-extra { margin:2px 0 8px 48px;padding:10px 12px;background:#F9FAFB;border:1px solid #EEF0F2;border-radius:10px;display:flex;flex-direction:column;gap:10px; }
    .fc-instr-extra--pending { color:#9ca3af;font-size:11.5px;font-style:italic; }
    .fc-extra-lbl { font-size:11.5px;font-weight:600;color:#6B7280; }
    .fc-grading-toggle { display:flex;align-items:center;gap:8px;flex-wrap:wrap; }
    .fc-grading-sel { padding:5px 9px;border:1px solid #e0e0e0;border-radius:7px;font-size:12px;background:#fff;cursor:pointer;outline:none; }
    .fc-grading-sel:focus { border-color:#00461B; }
    .fc-grading-save-note, .fc-ph-save-note { font-size:11px;font-weight:700; }
    .fc-grading-save-note.ok, .fc-ph-save-note.ok { color:#15803d; }
    .fc-grading-save-note.err, .fc-ph-save-note.err { color:#b91c1c; }
    .fc-ph-scope { display:flex;flex-direction:column;gap:6px;padding-top:8px;border-top:1px dashed #E5E7EB; }
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

    .fc-modal-backdrop { position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px; }
    .fc-modal { background:#fff;border-radius:16px;width:100%;max-width:500px;max-height:85vh;display:flex;flex-direction:column;box-shadow:0 12px 48px rgba(0,0,0,.2);overflow:hidden; }
    .fc-modal-hdr { background:#fff;border-bottom:1px solid #E5E7EB;padding:18px 22px;display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-shrink:0; }
    .fc-modal-title { font-size:17px;font-weight:800;color:#111;margin:0 0 3px; }
    .fc-modal-sub { font-size:12px;color:#6B7280;margin:0; }
    .fc-modal-close { background:none;border:none;color:#374151;font-size:24px;cursor:pointer;line-height:1;opacity:.8;border-radius:6px; }
    .fc-modal-close:hover { opacity:1;background:#F3F4F6; }
    .fc-modal-body { overflow-y:auto;flex:1;padding:20px; }
    .fc-modal-foot { display:flex;justify-content:flex-end;gap:10px;padding:14px 20px;border-top:1px solid #f0f0f0;flex-shrink:0; }
    .fc-btn-cancel { padding:9px 18px;border:1px solid #e0e0e0;border-radius:8px;background:#fff;font-size:14px;font-weight:600;cursor:pointer;color:#374151; }
    .fc-btn-cancel:hover { background:#f5f5f5; }
    .fc-btn-confirm { padding:9px 22px;border:none;border-radius:8px;background:#00461B;color:#fff;font-size:14px;font-weight:700;cursor:pointer; }
    .fc-btn-confirm:hover { background:#006428; }
    .fc-btn-confirm:disabled { opacity:.6;cursor:not-allowed; }

    .fc-rv-section { margin-bottom:16px; }
    .fc-rv-section-hdr { display:flex;align-items:center;gap:7px;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;padding:6px 10px;border-radius:7px;margin-bottom:8px; }
    .fc-rv-section-hdr.add    { background:#D1FAE5;color:#065F46; }
    .fc-rv-section-hdr.remove { background:#FEE2E2;color:#b91c1c; }
    .fc-rv-section-hdr.keep   { background:#F0F2F5;color:#374151; }
    .fc-rv-row { display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:8px;margin-bottom:3px;border:1px solid transparent; }
    .fc-rv-row.add    { background:#F0FDF4;border-color:#bbf7d0; }
    .fc-rv-row.remove { background:#FFF1F2;border-color:#fecdd3; }
    .fc-rv-row.keep   { background:#FAFAFA;border-color:#f0f0f0; }
    .fc-rv-av { width:32px;height:32px;border-radius:50%;background:#6b7280;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;flex-shrink:0; }
    .fc-rv-row.add    .fc-rv-av { background:#00461B; }
    .fc-rv-row.remove .fc-rv-av { background:#b91c1c; }
    .fc-rv-info { flex:1; }
    .fc-rv-name { font-size:13px;font-weight:600;color:#1a1a1a; }
    .fc-rv-meta { font-size:11px;color:#9ca3af; }
    .fc-err-inline { background:#FEE2E2;color:#b91c1c;border-radius:8px;padding:10px 14px;font-size:13px;font-weight:600;margin-bottom:12px; }

    @media(max-width:768px) {
        .fc-layout { grid-template-columns:1fr; }
        .fc-left { position:static;max-height:240px; }
    }
`; }
