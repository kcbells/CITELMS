/**
 * Dean Faculty Page — Instructor-Centric
 * Left: pick an instructor / program head (or assign yourself as dean)
 * Right: check which subjects they teach, save
 *
 * (This used to be subject-centric — pick a subject, check which instructors
 * teach it. Rebuilt the other way around per direct request: pick the person
 * first, then check subjects for them.)
 */
import { Api } from '../../api.js';
import { icon } from '../../utils/icons.js';
import { notify } from '../../utils/notify.js';

const inl = { size: 14, className: 'ui-icon-inline' };

let _people       = [];        // instructors + program heads (from UsersAPI)
let _semesters    = [];
let _selectedPerson = null;
let _semId        = '';
let _subjects     = [];        // full curriculum list from API, with is_assigned/taken_by_other
let _original     = new Set(); // subject_ids originally assigned to the selected person
let _pending      = new Set(); // current checked state
let _deptFilter   = '';
let _roleFilter   = '';        // '', 'instructor', 'program_head'
let _deanSelf     = null;

export async function render(container) {
    container.innerHTML = `<style>${css()}</style><div class="fa-boot"><div class="spinner"></div></div>`;

    // Program Heads can hold subject assignments too, not just instructors —
    // UsersAPI supports a comma-separated role filter, and the assignment
    // endpoint (dean-assign) has been fixed to allow either role as a target.
    const [peopleRes, semRes, meRes] = await Promise.all([
        Api.get('/UsersAPI.php?action=list&role=instructor,program_head'),
        Api.get('/SubjectOfferingsAPI.php?action=semesters'),
        Api.get('/AuthAPI.php?action=me'),
    ]);
    _people   = peopleRes.success ? peopleRes.data.users : [];
    _semesters = semRes.success   ? semRes.data          : [];
    // AuthAPI's "me" action nests the actual user one level deeper
    // (data.user, not data) — using meRes.data directly left every field
    // (name, users_id, ...) undefined, which is exactly why the self-assign
    // card showed "??" for initials and "—" for the name.
    _deanSelf  = meRes.success    ? meRes.data?.user      : null;

    const active = _semesters.find(s => s.status === 'active') || _semesters[0];
    _semId = active ? String(active.semester_id) : '';

    container.innerHTML = `<style>${css()}</style>

    <!-- Banner -->
    <div class="fa-banner">
        <div class="fa-banner-left">
            <div class="fa-banner-icon">
                <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="#111" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
                </svg>
            </div>
            <div>
                <h2 class="fa-banner-title">Faculty</h2>
                <p class="fa-banner-sub">Select an instructor or program head, then check which subjects they handle each semester</p>
            </div>
        </div>
        <div class="fa-banner-right">
            <label class="fa-sem-label">Semester</label>
            <select id="fa-sem-sel" class="fa-sem-sel">
                ${_semesters.map(s => `
                    <option value="${s.semester_id}" ${String(s.semester_id)===_semId?'selected':''}>
                        ${esc(s.semester_name)} ${esc(s.academic_year)}${s.status==='active'?' (Active)':''}
                    </option>`).join('')}
            </select>
        </div>
    </div>

    <!-- Two-column layout -->
    <div class="fa-layout">

        <!-- LEFT: Instructor / Program Head list -->
        <div class="fa-left">
            <div class="fa-left-head">
                <div style="display:flex;align-items:center;justify-content:space-between;">
                    <span class="fa-left-title">Faculty <span class="fa-instr-count" id="fa-instr-count">${_people.length}</span></span>
                </div>
                <div class="fa-dept-wrap">
                    <select id="fa-role-filter" class="fa-dept-sel">
                        <option value="">All Roles</option>
                        <option value="instructor">Instructors</option>
                        <option value="program_head">Program Heads</option>
                    </select>
                </div>
                <div class="fa-dept-wrap">
                    <select id="fa-dept-filter" class="fa-dept-sel">
                        <option value="">All Programs</option>
                        ${buildDeptOptions(_people)}
                    </select>
                </div>
                <input id="fa-instr-search" class="fa-instr-search" type="text" placeholder="Search by name or ID...">
            </div>
            ${_deanSelf ? renderDeanSelfCard() : ''}
            <div id="fa-instr-list" class="fa-instr-list">
                ${renderPeopleList(_people)}
            </div>
        </div>

        <!-- RIGHT: Subject assignment panel -->
        <div class="fa-right" id="fa-right">
            <div class="fa-placeholder">
                <svg width="56" height="56" fill="none" viewBox="0 0 24 24" stroke="#d1d5db" stroke-width="1.2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                </svg>
                <p>Select someone on the left to manage their subject assignments</p>
            </div>
        </div>

    </div>`;

    container.querySelector('#fa-sem-sel').addEventListener('change', e => {
        _semId = e.target.value;
        if (_selectedPerson) loadSubjects(_selectedPerson);
    });

    container.querySelector('#fa-role-filter').addEventListener('change', e => {
        _roleFilter = e.target.value;
        applyFilters(container);
    });
    container.querySelector('#fa-dept-filter').addEventListener('change', e => {
        _deptFilter = e.target.value;
        applyFilters(container);
    });
    container.querySelector('#fa-instr-search').addEventListener('input', () => applyFilters(container));

    bindPersonClicks();
    bindDeanSelfCard();
}

function renderDeanSelfCard() {
    if (!_deanSelf) return '';
    const init = (((_deanSelf.first_name||'?')[0]) + ((_deanSelf.last_name||'?')[0])).toUpperCase();
    const isActive = _selectedPerson && _selectedPerson.users_id === _deanSelf.users_id;
    return `
    <div class="fa-dean-self-section">
        <div class="fa-dean-self-label">Assign Yourself</div>
        <div class="fa-instr-card fa-dean-self-card ${isActive ? 'active' : ''}" id="fa-dean-self-card">
            <div class="fa-instr-av fa-dean-av">${init}</div>
            <div class="fa-instr-info">
                <div class="fa-instr-name">${esc(_deanSelf.first_name)} ${esc(_deanSelf.last_name)}</div>
                <div class="fa-instr-meta">${esc(_deanSelf.employee_id||'—')}</div>
                <div class="fa-instr-tags"><span class="fa-instr-role fa-dean-badge">Dean (You)</span></div>
            </div>
            <div class="fa-instr-badge" id="badge-self">—</div>
        </div>
        <div class="fa-dean-self-divider"></div>
    </div>`;
}

function bindDeanSelfCard() {
    const card = document.getElementById('fa-dean-self-card');
    if (!card || !_deanSelf) return;
    card.addEventListener('click', () => {
        _selectedPerson = _deanSelf;
        document.querySelectorAll('.fa-instr-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        loadSubjects(_deanSelf);
    });
}

/** Build unique sorted program options from the people list */
function buildDeptOptions(people) {
    const programs = new Map();
    people.forEach(i => {
        const code  = i.program_code || '';
        const label = code ? (i.program_name ? `${code} — ${i.program_name}` : code) : '';
        if (code) programs.set(code, label);
    });
    return [...programs.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([code, label]) => `<option value="${esc(code)}">${esc(label)}</option>`)
        .join('');
}

function applyFilters(container) {
    const q = (container.querySelector('#fa-instr-search')?.value || '').toLowerCase();

    let filtered = _people;
    if (_roleFilter) filtered = filtered.filter(i => i.role === _roleFilter);
    if (_deptFilter) filtered = filtered.filter(i => (i.program_code || '') === _deptFilter);
    if (q) {
        filtered = filtered.filter(i =>
            (i.first_name + ' ' + i.last_name + ' ' + (i.employee_id || '')).toLowerCase().includes(q)
        );
    }

    const countEl = container.querySelector('#fa-instr-count');
    if (countEl) countEl.textContent = filtered.length;

    container.querySelector('#fa-instr-list').innerHTML = renderPeopleList(filtered);
    bindPersonClicks();
}

function renderPeopleList(list) {
    if (!list.length) return `<div class="fa-no-inst">No instructors or program heads found</div>`;
    return list.map(i => {
        const init = ((i.first_name||'?')[0] + (i.last_name||'?')[0]).toUpperCase();
        const isActive = _selectedPerson && _selectedPerson.users_id === i.users_id;
        const isPH = i.role === 'program_head';
        return `
        <div class="fa-instr-card ${isActive ? 'active' : ''}" data-id="${i.users_id}">
            <div class="fa-instr-av ${isPH ? 'fa-ph-av' : ''}">${init}</div>
            <div class="fa-instr-info">
                <div class="fa-instr-name">${esc(i.first_name)} ${esc(i.last_name)}</div>
                <div class="fa-instr-meta">${esc(i.employee_id||'—')}</div>
                <div class="fa-instr-tags">
                    ${isPH ? `<span class="fa-instr-role fa-ph-badge">Program Head</span>` : ''}
                    ${i.program_code ? `<span class="fa-instr-dept">${esc(i.program_code)}</span>` : ''}
                </div>
            </div>
            <div class="fa-instr-badge" id="badge-${i.users_id}">—</div>
        </div>`;
    }).join('');
}

function bindPersonClicks() {
    document.querySelectorAll('.fa-instr-card').forEach(card => {
        card.addEventListener('click', () => {
            const person = _people.find(i => i.users_id == card.dataset.id);
            if (!person) return;
            _selectedPerson = person;
            document.querySelectorAll('.fa-instr-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            loadSubjects(person);
        });
    });
}

async function loadSubjects(person) {
    const right = document.getElementById('fa-right');
    right.innerHTML = `<div class="fa-loading"><div class="spinner"></div><span>Loading subjects...</span></div>`;

    const res = await Api.get(`/SubjectOfferingsAPI.php?action=instructor-subjects&instructor_id=${person.users_id}&semester_id=${_semId}`);
    if (!res.success) {
        right.innerHTML = `<div class="fa-err">Failed to load subjects. Please try again.</div>`;
        return;
    }

    _subjects = res.data;
    _original = new Set();
    _pending  = new Set();

    _subjects.forEach(s => {
        const key = `sid:${s.subject_id}`;
        if (s.is_assigned == 1) {
            _original.add(key);
            _pending.add(key);
        }
    });

    renderRight(person, right);
    updateBadge(person.users_id);
}

/** Groups a (possibly search-filtered) subject list into program → year → semester and renders the checklist markup. */
function buildChecklistHtml(list, personProg) {
    if (!list.length) return `<div class="fa-no-inst">No subjects match your search</div>`;

    const grouped = {};
    list.forEach(s => {
        const prog = s.program_code || 'Other';
        const yr   = s.year_level   ? `${s.year_level}${ordinal(s.year_level)} Year` : 'Unspecified';
        const sem  = semLabel_subj(s.subject_semester);
        if (!grouped[prog])      grouped[prog]      = {};
        if (!grouped[prog][yr])  grouped[prog][yr]  = {};
        if (!grouped[prog][yr][sem]) grouped[prog][yr][sem] = [];
        grouped[prog][yr][sem].push(s);
    });

    const sortedProgEntries = Object.entries(grouped).sort(([a], [b]) => {
        if (a === personProg && b !== personProg) return -1;
        if (b === personProg && a !== personProg) return  1;
        return a.localeCompare(b);
    });

    return sortedProgEntries.map(([prog, years]) => {
        const isPrimary = prog === personProg;
        return `
        <div class="fa-prog-block">
            <div class="fa-prog-header">
                <span class="fa-prog-code">${esc(prog)}</span>
                <span class="fa-prog-name">${esc(list.find(s=>s.program_code===prog)?.program_name||'')}</span>
                ${isPrimary ? `<span class="fa-prog-primary">${icon('pin', inl)} Primary Program</span>` : ''}
            </div>
            ${Object.entries(years).map(([yr, sems]) => `
            <div class="fa-year-block">
                <div class="fa-year-label">${esc(yr)}</div>
                ${Object.entries(sems).map(([sem, subjects]) => `
                <div class="fa-sem-block">
                    <div class="fa-sem-label">${esc(sem)}</div>
                    ${subjects.map(s => renderSubjectRow(s)).join('')}
                </div>`).join('')}
            </div>`).join('')}
        </div>`;
    }).join('');
}

function applySubjSearch(right, personProg) {
    const q = (right.querySelector('#fa-subj-search')?.value || '').toLowerCase();
    const list = q
        ? _subjects.filter(s => (s.subject_code + ' ' + s.subject_name).toLowerCase().includes(q))
        : _subjects;
    right.querySelector('#fa-checklist').innerHTML = buildChecklistHtml(list, personProg);
    bindCheckboxes();
}

function renderRight(person, right) {
    const init = ((person.first_name||'?')[0] + (person.last_name||'?')[0]).toUpperCase();
    const assignedCount = _subjects.filter(s => s.is_assigned == 1).length;
    const isPH = person.role === 'program_head';
    const isDean = _deanSelf && _deanSelf.users_id === person.users_id;
    const personProg = person.program_code || '';

    right.innerHTML = `
    <!-- Person profile -->
    <div class="fa-prof-card">
        <div class="fa-prof-av ${isPH ? 'fa-ph-av' : ''}">${init}</div>
        <div class="fa-prof-info">
            <div class="fa-prof-name">${esc(person.first_name)} ${esc(person.last_name)}
                ${isPH ? `<span class="fa-instr-role fa-ph-badge">Program Head</span>` : ''}
                ${isDean ? `<span class="fa-instr-role fa-dean-badge">Dean</span>` : ''}
            </div>
            <div class="fa-prof-meta">
                ${person.employee_id ? `<span>ID: ${esc(person.employee_id)}</span>` : ''}
                ${person.email ? `<span>${esc(person.email)}</span>` : ''}
                ${person.department_name ? `<span>${esc(person.department_name)}</span>` : ''}
                ${person.program_code ? `<span style="color:#1B4D3E;font-weight:700;">${esc(person.program_code)}${person.program_name ? ' – ' + esc(person.program_name) : ''}</span>` : ''}
            </div>
        </div>
        <div class="fa-prof-stat">
            <span class="fa-prof-stat-val" id="assigned-count">${assignedCount}</span>
            <span class="fa-prof-stat-lbl">subjects assigned</span>
        </div>
    </div>

    ${isPH ? renderPhScope(person) : ''}

    <!-- Legend -->
    <div class="fa-legend">
        <span class="fa-leg-item"><span class="fa-leg-dot checked"></span> Assigned to this person</span>
        <span class="fa-leg-item"><span class="fa-leg-dot other"></span> Also assigned to others (shared)</span>
        <span class="fa-leg-item"><span class="fa-leg-dot free"></span> Unassigned</span>
    </div>

    <!-- Subject search -->
    <div class="fa-subj-search-wrap">
        <input id="fa-subj-search" class="fa-instr-search" type="text" placeholder="Search subject code or name...">
    </div>

    <!-- Subject checklist -->
    <div id="fa-checklist" class="fa-checklist">
        ${buildChecklistHtml(_subjects, personProg)}
    </div>

    <!-- Sticky save bar -->
    <div class="fa-save-bar" id="fa-save-bar" style="display:none">
        <div class="fa-save-info">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            <span id="fa-change-label">You have unsaved changes</span>
        </div>
        <div class="fa-save-btns">
            <button id="fa-discard" class="fa-btn-discard">Discard</button>
            <button id="fa-save" class="fa-btn-save">Save Assignments</button>
        </div>
    </div>`;

    bindCheckboxes();
    bindSaveBar(person);
    bindPhScope(person);

    let subjDeb;
    right.querySelector('#fa-subj-search')?.addEventListener('input', () => {
        clearTimeout(subjDeb);
        subjDeb = setTimeout(() => applySubjSearch(right, personProg), 150);
    });
}

/** Program Head year-level scope — one control per person (not per subject), shown once near the top. */
function renderPhScope(person) {
    const yFrom = person.year_level_from ? Number(person.year_level_from) : null;
    const yTo   = person.year_level_to   ? Number(person.year_level_to)   : null;
    return `
    <div class="fa-ph-scope-card">
        <span class="fa-extra-lbl">Handles year level(s):</span>
        <div class="fa-ph-years">
            ${[1,2,3,4].map(y => `
            <label class="fa-ph-year-cb">
                <input type="checkbox" class="fa-ph-year" value="${y}"
                    ${yFrom !== null && yTo !== null && y >= yFrom && y <= yTo ? 'checked' : ''}>
                <span>${y}${ordinal(y)}</span>
            </label>`).join('')}
        </div>
        <span class="fa-ph-save-note" id="fa-ph-save-note"></span>
    </div>`;
}

function bindPhScope(person) {
    const group = document.querySelectorAll('.fa-ph-year');
    if (!group.length) return;
    group.forEach(cb => {
        cb.addEventListener('change', async () => {
            const checkedYears = [...group].filter(c => c.checked).map(c => parseInt(c.value));
            const note = document.getElementById('fa-ph-save-note');
            const yearFrom = checkedYears.length ? Math.min(...checkedYears) : null;
            const yearTo   = checkedYears.length ? Math.max(...checkedYears) : null;

            group.forEach(c => c.disabled = true);
            const res = await Api.post('/SubjectOfferingsAPI.php?action=set-ph-scope', {
                users_id: person.users_id,
                year_level_from: yearFrom,
                year_level_to: yearTo,
            });
            group.forEach(c => c.disabled = false);

            if (note) {
                note.textContent = res.success ? (checkedYears.length ? 'Saved' : 'Cleared') : (res.message || 'Failed to save');
                note.className = `fa-ph-save-note ${res.success ? 'ok' : 'err'}`;
                setTimeout(() => { if (note) note.textContent = ''; }, 2500);
            }
            if (res.success) { person.year_level_from = yearFrom; person.year_level_to = yearTo; }
            else notify.error(res.message || 'Failed to update program head scope');
        });
    });
}

function renderSubjectRow(s) {
    const key          = `sid:${s.subject_id}`;
    const checked      = _pending.has(key);
    const takenByOther = s.taken_by_other == 1;
    const otherNames   = s.other_instructor_names || '';

    const dotClass = checked ? 'checked' : (takenByOther ? 'other' : 'free');

    const alsoNote = takenByOther
        ? `<span class="fa-also-note">Also: ${esc(otherNames || 'another instructor')}</span>`
        : '';

    return `
    <label class="fa-subj-row ${checked ? 'assigned' : ''}" data-key="${key}">
        <input type="checkbox" class="fa-cb" data-key="${key}" ${checked ? 'checked' : ''}>
        <span class="fa-dot ${dotClass}"></span>
        <div class="fa-subj-body">
            <div class="fa-subj-top">
                <span class="fa-subj-code">${esc(s.subject_code)}</span>
                <span class="fa-subj-name">${esc(s.subject_name)}</span>
            </div>
            <div class="fa-subj-meta">
                <span>${s.units} unit${s.units != 1 ? 's' : ''}</span>
                ${alsoNote}
            </div>
        </div>
    </label>`;
}

function bindCheckboxes() {
    document.querySelectorAll('.fa-cb').forEach(cb => {
        cb.addEventListener('change', () => {
            const key = cb.dataset.key;
            if (cb.checked) _pending.add(key);
            else            _pending.delete(key);

            const row = cb.closest('.fa-subj-row');
            row.classList.toggle('assigned', cb.checked);
            const dot = row.querySelector('.fa-dot');
            dot.className = `fa-dot ${cb.checked ? 'checked' : 'free'}`;

            updateChangeState();
        });
    });
}

function updateChangeState() {
    const added   = [..._pending].filter(k => !_original.has(k) && k.startsWith('sid:'));
    const removed = [..._original].filter(k => !_pending.has(k)  && k.startsWith('sid:'));
    const hasChanges = added.length > 0 || removed.length > 0;

    const bar = document.getElementById('fa-save-bar');
    if (bar) bar.style.display = hasChanges ? 'flex' : 'none';

    const lbl = document.getElementById('fa-change-label');
    if (lbl) {
        const parts = [];
        if (added.length)   parts.push(`+${added.length} to assign`);
        if (removed.length) parts.push(`−${removed.length} to remove`);
        lbl.textContent = parts.join('  ·  ');
    }

    const ac = document.getElementById('assigned-count');
    if (ac) ac.textContent = _pending.size;
}

function bindSaveBar(person) {
    const saveBtn    = document.getElementById('fa-save');
    const discardBtn = document.getElementById('fa-discard');
    if (!saveBtn) return;

    discardBtn.addEventListener('click', () => {
        _pending = new Set(_original);
        const right = document.getElementById('fa-right');
        renderRight(person, right);
        updateBadge(person.users_id);
    });

    saveBtn.addEventListener('click', async () => {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';

        const assignIds   = [..._pending]
            .filter(k => !_original.has(k) && k.startsWith('sid:'))
            .map(k => parseInt(k.slice(4)));
        const unassignIds = [..._original]
            .filter(k => !_pending.has(k)  && k.startsWith('sid:'))
            .map(k => parseInt(k.slice(4)));

        const res = await Api.post('/SubjectOfferingsAPI.php?action=dean-assign', {
            instructor_id:        person.users_id,
            semester_id:          parseInt(_semId),
            assign_subject_ids:   assignIds,
            unassign_subject_ids: unassignIds
        });

        if (res.success) {
            await loadSubjects(person);
            notify.success('Assignments saved.');
        } else {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save Assignments';
            const lbl = document.getElementById('fa-change-label');
            if (lbl) lbl.innerHTML = `${icon('warning', inl)} ${res.message || 'Save failed'}`;
        }
    });
}

function updateBadge(personId) {
    const isDean = _deanSelf && _deanSelf.users_id === personId;
    const badge = document.getElementById(isDean ? 'badge-self' : `badge-${personId}`);
    if (!badge) return;
    const count = _subjects.filter(s => s.is_assigned == 1).length;
    badge.textContent = count;
    badge.className   = `fa-instr-badge ${count > 0 ? 'has' : ''}`;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function semLabel_subj(sem) {
    if (!sem) return 'Unspecified';
    if (sem == 1) return '1st Semester';
    if (sem == 2) return '2nd Semester';
    if (sem == 3) return 'Summer';
    return `Semester ${sem}`;
}

function ordinal(n) {
    const s = ['th','st','nd','rd'];
    const v = n % 100;
    return s[(v-20)%10] || s[v] || s[0];
}

function esc(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
}

// ── CSS ───────────────────────────────────────────────────────────────────────

function css() { return `
    .fa-boot { display:flex;align-items:center;justify-content:center;height:200px; }
    .spinner { width:32px;height:32px;border:3px solid #e5e7eb;border-top-color:#00461B;border-radius:50%;animation:spin .7s linear infinite; }
    @keyframes spin { to { transform:rotate(360deg); } }

    /* Banner */
    .fa-banner { background:#fff;border:1px solid #E5E7EB;border-radius:16px;padding:20px 24px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px; }
    .fa-banner-left { display:flex;align-items:center;gap:14px; }
    .fa-banner-icon { width:46px;height:46px;background:#F3F4F6;border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0; }
    .fa-banner-title { font-size:19px;font-weight:800;color:#111;margin:0 0 2px; }
    .fa-banner-sub { font-size:12px;color:#6B7280;margin:0; }
    .fa-banner-right { display:flex;flex-direction:column;gap:4px; }
    .fa-sem-label { font-size:11px;color:#6B7280;font-weight:600;letter-spacing:.5px; }
    .fa-sem-sel { padding:8px 12px;border:1px solid #E5E7EB;border-radius:8px;background:#F3F4F6;color:#111;font-size:13px;font-weight:600;cursor:pointer; }
    .fa-sem-sel option { background:#fff;color:#111; }

    /* Two-column layout */
    .fa-layout { display:grid;grid-template-columns:280px 1fr;gap:16px;align-items:start; }

    /* LEFT panel */
    .fa-left { background:#fff;border:1px solid #e8e8e8;border-radius:14px;overflow:hidden;position:sticky;top:16px;max-height:calc(100vh - 200px);display:flex;flex-direction:column; }
    .fa-left-head { padding:14px 16px;border-bottom:1px solid #f0f0f0;display:flex;flex-direction:column;gap:8px; }
    .fa-left-title { font-size:13px;font-weight:700;color:#404040;display:flex;align-items:center;gap:6px; }
    .fa-instr-count { background:#E8F5E9;color:#1B4D3E;padding:1px 7px;border-radius:10px;font-size:11px;font-weight:700; }
    .fa-dept-wrap { position:relative; }
    .fa-dept-sel { width:100%;padding:8px 30px 8px 12px;border:1.5px solid #e0e0e0;border-radius:8px;font-size:12px;font-weight:600;color:#374151;background:#f9fafb;appearance:none;-webkit-appearance:none;cursor:pointer;box-sizing:border-box;outline:none;transition:border-color .15s; }
    .fa-dept-sel:focus { border-color:#00461B;background:#fff; }
    .fa-dept-wrap::after { content:'▾';position:absolute;right:10px;top:50%;transform:translateY(-50%);pointer-events:none;font-size:11px;color:#9ca3af; }

    .fa-instr-search { padding:8px 12px;border:1px solid #e0e0e0;border-radius:8px;font-size:13px;width:100%;box-sizing:border-box; }
    .fa-instr-search:focus { outline:none;border-color:#00461B; }
    .fa-instr-list { overflow-y:auto;flex:1; }

    .fa-instr-card { display:flex;align-items:center;gap:10px;padding:12px 14px;cursor:pointer;border-bottom:1px solid #f5f5f5;transition:background .15s; }
    .fa-instr-card:hover { background:#f9fafb; }
    .fa-instr-card.active { background:#E8F5E9;border-right:3px solid #00461B; }
    .fa-instr-av { width:36px;height:36px;border-radius:50%;background:#1e40af;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;flex-shrink:0; }
    .fa-ph-av { background:#B45309 !important; }
    .fa-instr-name { font-size:13px;font-weight:600;color:#1a1a1a; }
    .fa-instr-meta { font-size:11px;color:#9ca3af;margin-top:1px; }
    .fa-instr-tags { display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-top:3px; }
    .fa-instr-dept { display:inline-block;font-size:10px;font-weight:700;background:#E8F5E9;color:#1B4D3E;padding:1px 6px;border-radius:8px; }
    .fa-instr-role { display:inline-block;font-size:10px;font-weight:700;padding:1px 6px;border-radius:8px;margin-left:6px;vertical-align:middle; }
    .fa-ph-badge { background:#FEF3C7;color:#92400E; }
    .fa-dean-badge { background:#EDE9FE;color:#6D28D9; }
    .fa-instr-badge { margin-left:auto;min-width:22px;text-align:center;padding:2px 7px;border-radius:10px;font-size:11px;font-weight:700;background:#f3f4f6;color:#9ca3af;flex-shrink:0; }
    .fa-instr-badge.has { background:#E8F5E9;color:#1B4D3E; }
    .fa-no-inst { padding:24px;text-align:center;color:#9ca3af;font-size:13px; }

    /* RIGHT panel */
    .fa-right { background:#fff;border:1px solid #e8e8e8;border-radius:14px;min-height:400px;position:relative; }
    .fa-placeholder { display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:80px 24px;text-align:center;color:#9ca3af; }
    .fa-placeholder p { font-size:14px;max-width:280px; }
    .fa-loading { display:flex;align-items:center;justify-content:center;gap:10px;padding:60px;color:#737373;font-size:14px; }
    .fa-err { padding:24px;color:#b91c1c;text-align:center; }

    /* Person profile */
    .fa-prof-card { display:flex;align-items:center;gap:14px;padding:18px 20px;border-bottom:1px solid #f0f0f0;background:#fafafa;border-radius:14px 14px 0 0; }
    .fa-prof-av { width:48px;height:48px;border-radius:50%;background:#00461B;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:16px;flex-shrink:0; }
    .fa-prof-name { font-size:16px;font-weight:700;color:#1a1a1a;margin-bottom:4px; }
    .fa-prof-meta { display:flex;gap:12px;flex-wrap:wrap;font-size:12px;color:#737373; }
    .fa-prof-meta span::before { content:'·';margin-right:12px; }
    .fa-prof-meta span:first-child::before { content:''; margin-right:0; }
    .fa-prof-stat { margin-left:auto;text-align:center;flex-shrink:0; }
    .fa-prof-stat-val { display:block;font-size:28px;font-weight:800;color:#00461B;line-height:1; }
    .fa-prof-stat-lbl { font-size:11px;color:#9ca3af; }

    /* Program Head scope card */
    .fa-ph-scope-card { display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 20px;background:#FFFBEB;border-bottom:1px solid #FDE68A; }
    .fa-extra-lbl { font-size:11.5px;font-weight:600;color:#92400E; }
    .fa-ph-years { display:flex;gap:6px;flex-wrap:wrap; }
    .fa-ph-year-cb { display:flex;align-items:center;gap:5px;padding:4px 10px;border:1px solid #F59E0B;border-radius:20px;font-size:11.5px;font-weight:600;color:#92400E;cursor:pointer;background:#fff; }
    .fa-ph-year-cb:has(input:checked) { background:#FEF3C7;border-color:#B45309; }
    .fa-ph-year-cb input { accent-color:#B45309;margin:0; }
    .fa-ph-save-note { font-size:11px;font-weight:700; }
    .fa-ph-save-note.ok  { color:#15803d; }
    .fa-ph-save-note.err { color:#b91c1c; }

    /* Legend */
    .fa-legend { display:flex;gap:16px;padding:10px 20px;background:#f8fafc;border-bottom:1px solid #f0f0f0;flex-wrap:wrap; }
    .fa-leg-item { display:flex;align-items:center;gap:6px;font-size:12px;color:#737373; }
    .fa-leg-dot { width:10px;height:10px;border-radius:50%;flex-shrink:0; }
    .fa-leg-dot.checked { background:#00461B; }
    .fa-leg-dot.other   { background:#f59e0b; }
    .fa-leg-dot.free    { background:#e5e7eb;border:1px solid #d1d5db; }

    /* Subject search */
    .fa-subj-search-wrap { padding:12px 20px 0; }
    .fa-subj-search-wrap .fa-instr-search { max-width:320px; }

    /* Checklist */
    .fa-checklist { padding:16px 20px;padding-bottom:80px; }

    .fa-prog-block { margin-bottom:24px; }
    .fa-prog-header { display:flex;align-items:center;gap:8px;margin-bottom:10px; }
    .fa-prog-code { background:#1B4D3E;color:#fff;padding:3px 10px;border-radius:5px;font-family:monospace;font-size:12px;font-weight:700; }
    .fa-prog-name { font-size:13px;font-weight:600;color:#404040; }
    .fa-prog-primary { margin-left:auto;background:#FEF9C3;color:#854D0E;padding:2px 9px;border-radius:20px;font-size:11px;font-weight:700;flex-shrink:0; }

    .fa-year-block { margin-bottom:14px; }
    .fa-year-label { font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;padding-left:4px; }

    .fa-sem-block { margin-bottom:10px; }
    .fa-sem-label { font-size:11px;font-weight:600;color:#9ca3af;margin-bottom:4px;padding-left:4px;letter-spacing:.3px; }

    .fa-subj-row { display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border-radius:10px;cursor:pointer;transition:background .15s;border:1px solid transparent;margin-bottom:4px; }
    .fa-subj-row:hover { background:#f8fafc; }
    .fa-subj-row.assigned { background:#E8F5E9;border-color:#bbf7d0; }
    .fa-cb { display:none; }

    .fa-dot { width:10px;height:10px;border-radius:50%;flex-shrink:0;margin-top:4px;transition:background .2s; }
    .fa-dot.checked { background:#00461B; }
    .fa-dot.other   { background:#f59e0b; }
    .fa-dot.free    { background:#e5e7eb;border:1px solid #d1d5db; }

    .fa-subj-body { flex:1;min-width:0; }
    .fa-subj-top { display:flex;align-items:center;gap:8px;flex-wrap:wrap; }
    .fa-subj-code { background:#f3f4f6;color:#374151;padding:2px 7px;border-radius:4px;font-family:monospace;font-size:11px;font-weight:700;flex-shrink:0; }
    .fa-subj-row.assigned .fa-subj-code { background:#E8F5E9;color:#166534; }
    .fa-subj-name { font-size:13px;font-weight:600;color:#1a1a1a; }
    .fa-subj-meta { display:flex;gap:10px;font-size:11px;color:#9ca3af;margin-top:3px;flex-wrap:wrap; }
    .fa-also-note { color:#1d4ed8;font-weight:600; }

    /* Save bar */
    .fa-save-bar { position:sticky;bottom:0;left:0;right:0;display:flex;align-items:center;justify-content:space-between;gap:12px;background:#fff;border-top:2px solid #00461B;padding:12px 20px;border-radius:0 0 14px 14px;box-shadow:0 -4px 16px rgba(0,0,0,.08);flex-wrap:wrap; }
    .fa-save-info { display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:#374151; }
    .fa-save-info svg { color:#00461B; }
    .fa-save-btns { display:flex;gap:8px; }
    .fa-btn-discard { padding:8px 16px;border:1px solid #e0e0e0;border-radius:8px;background:#fff;font-size:13px;font-weight:600;cursor:pointer;color:#374151; }
    .fa-btn-discard:hover { background:#f5f5f5; }
    .fa-btn-save { padding:8px 20px;border:none;border-radius:8px;background:#00461B;color:#fff;font-size:13px;font-weight:700;cursor:pointer; }
    .fa-btn-save:hover { background:#006428; }
    .fa-btn-save:disabled { opacity:.6;cursor:not-allowed; }

    /* Dean self-assign card */
    .fa-dean-self-section { padding:10px 12px 0; }
    .fa-dean-self-label { font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#9ca3af;padding:0 2px 6px; }
    .fa-dean-self-card { border-radius:10px;border:1.5px dashed #00461B;margin-bottom:0; }
    .fa-dean-self-card:hover { background:#E8F5E9; }
    .fa-dean-self-card.active { background:#E8F5E9;border-color:#00461B;border-style:solid; }
    .fa-dean-av { background:#7C3AED !important; }
    .fa-dean-self-divider { height:1px;background:#f0f0f0;margin:10px 0 2px; }

    @media (max-width:768px) {
        .fa-layout { grid-template-columns:1fr; }
        .fa-left { position:static;max-height:240px; }
    }
`; }
