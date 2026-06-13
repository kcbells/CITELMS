/**
 * Dean Faculty Assignments — Instructor-Centric Redesign
 * Dean picks an instructor → checks which subjects to assign → saves
 */
import { Api } from '../../api.js';
import { icon } from '../../utils/icons.js';

const inl = { size: 14, className: 'ui-icon-inline' };

let _instructors   = [];
let _semesters     = [];
let _selectedInstr = null;
let _semId         = '';
let _subjects      = [];        // full list from API
let _original      = new Set(); // subject_offered_ids originally assigned
let _pending       = new Set(); // current checked state
let _deptFilter    = '';        // currently selected department/program filter

export async function render(container) {
    container.innerHTML = `<style>${css()}</style><div class="fa-boot"><div class="spinner"></div></div>`;

    const [instRes, semRes] = await Promise.all([
        Api.get('/UsersAPI.php?action=list&role=instructor'),
        Api.get('/SubjectOfferingsAPI.php?action=semesters'),
    ]);
    _instructors = instRes.success ? instRes.data.users : [];
    _semesters   = semRes.success  ? semRes.data        : [];

    // Default to active semester
    const active = _semesters.find(s => s.status === 'active') || _semesters[0];
    _semId = active ? String(active.semester_id) : '';

    container.innerHTML = `<style>${css()}</style>

    <!-- Banner -->
    <div class="fa-banner">
        <div class="fa-banner-left">
            <div class="fa-banner-icon">
                <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="#fff" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
                </svg>
            </div>
            <div>
                <h2 class="fa-banner-title">Faculty</h2>
                <p class="fa-banner-sub">View instructors and assign subjects they handle each semester</p>
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

        <!-- LEFT: Instructor list -->
        <div class="fa-left">
            <div class="fa-left-head">
                <div style="display:flex;align-items:center;justify-content:space-between;">
                    <span class="fa-left-title">Faculty <span class="fa-instr-count" id="fa-instr-count">${_instructors.length}</span></span>
                </div>
                <div class="fa-dept-wrap">
                    <select id="fa-dept-filter" class="fa-dept-sel">
                        <option value="">All Programs</option>
                        ${buildDeptOptions(_instructors)}
                    </select>
                </div>
                <input id="fa-instr-search" class="fa-instr-search" type="text" placeholder="Search by name or ID...">
            </div>
            <div id="fa-instr-list" class="fa-instr-list">
                ${renderInstructorList(_instructors)}
            </div>
        </div>

        <!-- RIGHT: Subject assignment panel -->
        <div class="fa-right" id="fa-right">
            <div class="fa-placeholder">
                <svg width="56" height="56" fill="none" viewBox="0 0 24 24" stroke="#d1d5db" stroke-width="1.2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                </svg>
                <p>Select an instructor to manage their subject assignments</p>
            </div>
        </div>

    </div>`;

    // Semester change → reload right panel
    container.querySelector('#fa-sem-sel').addEventListener('change', e => {
        _semId = e.target.value;
        if (_selectedInstr) loadSubjects(_selectedInstr);
    });

    // Department filter
    container.querySelector('#fa-dept-filter').addEventListener('change', e => {
        _deptFilter = e.target.value;
        applyFilters(container);
    });

    // Instructor search
    container.querySelector('#fa-instr-search').addEventListener('input', () => applyFilters(container));

    bindInstructorClicks();
}

/** Build unique sorted program options from instructor list */
function buildDeptOptions(instructors) {
    // Group by program_code (e.g. BSIT, BSCS) — this is what the dean wants to separate
    const programs = new Map(); // program_code → display label
    instructors.forEach(i => {
        const code  = i.program_code || '';
        const label = code
            ? (i.program_name ? `${code} — ${i.program_name}` : code)
            : '';
        if (code) programs.set(code, label);
    });
    return [...programs.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([code, label]) => `<option value="${esc(code)}">${esc(label)}</option>`)
        .join('');
}

/** Apply both program filter and text search, refresh the list */
function applyFilters(container) {
    const q = (container.querySelector('#fa-instr-search')?.value || '').toLowerCase();

    let filtered = _instructors;

    // Program filter (by program_code)
    if (_deptFilter) {
        filtered = filtered.filter(i => (i.program_code || '') === _deptFilter);
    }

    // Text search
    if (q) {
        filtered = filtered.filter(i =>
            (i.first_name + ' ' + i.last_name + ' ' + (i.employee_id || '')).toLowerCase().includes(q)
        );
    }

    const countEl = container.querySelector('#fa-instr-count');
    if (countEl) countEl.textContent = filtered.length;

    container.querySelector('#fa-instr-list').innerHTML = renderInstructorList(filtered);
    bindInstructorClicks();
}

function renderInstructorList(list) {
    if (!list.length) return `<div class="fa-no-inst">No instructors found</div>`;
    return list.map(i => {
        const init = ((i.first_name||'?')[0] + (i.last_name||'?')[0]).toUpperCase();
        const isActive = _selectedInstr && _selectedInstr.users_id === i.users_id;
        return `
        <div class="fa-instr-card ${isActive ? 'active' : ''}" data-id="${i.users_id}">
            <div class="fa-instr-av">${init}</div>
            <div class="fa-instr-info">
                <div class="fa-instr-name">${esc(i.first_name)} ${esc(i.last_name)}</div>
                <div class="fa-instr-meta">${esc(i.employee_id||'—')}</div>
                ${i.program_code ? `<div class="fa-instr-dept">${esc(i.program_code)}</div>` : ''}
            </div>
            <div class="fa-instr-badge" id="badge-${i.users_id}">—</div>
        </div>`;
    }).join('');
}

function bindInstructorClicks() {
    document.querySelectorAll('.fa-instr-card').forEach(card => {
        card.addEventListener('click', () => {
            const instr = _instructors.find(i => i.users_id == card.dataset.id);
            if (!instr) return;
            _selectedInstr = instr;
            document.querySelectorAll('.fa-instr-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            loadSubjects(instr);
        });
    });
}

async function loadSubjects(instr) {
    const right = document.getElementById('fa-right');
    right.innerHTML = `<div class="fa-loading"><div class="spinner"></div><span>Loading subjects...</span></div>`;

    const res = await Api.get(`/SubjectOfferingsAPI.php?action=instructor-subjects&instructor_id=${instr.users_id}&semester_id=${_semId}`);
    if (!res.success) {
        right.innerHTML = `<div class="fa-err">Failed to load subjects. Please try again.</div>`;
        return;
    }

    _subjects = res.data;
    _original = new Set();
    _pending  = new Set();

    // Keys are always "sid:{subject_id}" — one key per subject regardless of how
    // many subject_offered rows exist (multi-instructor aware).
    _subjects.forEach(s => {
        const key = `sid:${s.subject_id}`;
        if (s.is_assigned == 1) {
            _original.add(key);
            _pending.add(key);
        }
    });

    renderRight(instr, right);
    updateBadge(instr.users_id);
}

function renderRight(instr, right) {
    const semLabel = _semesters.find(s => String(s.semester_id) === _semId);
    const semText  = semLabel ? `${semLabel.semester_name} ${semLabel.academic_year}` : '';

    const init = ((instr.first_name||'?')[0] + (instr.last_name||'?')[0]).toUpperCase();
    const assignedCount = _subjects.filter(s => s.is_assigned == 1).length;

    // Group: program → year_level → semester
    const grouped = {};
    _subjects.forEach(s => {
        const prog = s.program_code || 'Other';
        const yr   = s.year_level   ? `${s.year_level}${ordinal(s.year_level)} Year` : 'Unspecified';
        const sem  = semLabel_subj(s.subject_semester);
        if (!grouped[prog])      grouped[prog]      = {};
        if (!grouped[prog][yr])  grouped[prog][yr]  = {};
        if (!grouped[prog][yr][sem]) grouped[prog][yr][sem] = [];
        grouped[prog][yr][sem].push(s);
    });

    // Sort program blocks: instructor's own program first, then alphabetically
    const instrProg = instr.program_code || '';
    const sortedProgEntries = Object.entries(grouped).sort(([a], [b]) => {
        if (a === instrProg && b !== instrProg) return -1;
        if (b === instrProg && a !== instrProg) return  1;
        return a.localeCompare(b);
    });

    right.innerHTML = `
    <!-- Instructor profile -->
    <div class="fa-prof-card">
        <div class="fa-prof-av">${init}</div>
        <div class="fa-prof-info">
            <div class="fa-prof-name">${esc(instr.first_name)} ${esc(instr.last_name)}</div>
            <div class="fa-prof-meta">
                ${instr.employee_id ? `<span>ID: ${esc(instr.employee_id)}</span>` : ''}
                ${instr.email ? `<span>${esc(instr.email)}</span>` : ''}
                ${instr.department_name ? `<span>${esc(instr.department_name)}</span>` : ''}
                ${instr.program_code ? `<span style="color:#1B4D3E;font-weight:700;">${esc(instr.program_code)}${instr.program_name ? ' – ' + esc(instr.program_name) : ''}</span>` : ''}
            </div>
        </div>
        <div class="fa-prof-stat">
            <span class="fa-prof-stat-val" id="assigned-count">${assignedCount}</span>
            <span class="fa-prof-stat-lbl">subjects assigned</span>
        </div>
    </div>

    <!-- Legend -->
    <div class="fa-legend">
        <span class="fa-leg-item"><span class="fa-leg-dot checked"></span> Assigned to this instructor</span>
        <span class="fa-leg-item"><span class="fa-leg-dot other"></span> Also assigned to others (shared)</span>
        <span class="fa-leg-item"><span class="fa-leg-dot free"></span> Unassigned</span>
    </div>

    <!-- Subject checklist -->
    <div id="fa-checklist" class="fa-checklist">
        ${sortedProgEntries.map(([prog, years]) => {
            const isPrimary = prog === instrProg;
            return `
            <div class="fa-prog-block">
                <div class="fa-prog-header">
                    <span class="fa-prog-code">${esc(prog)}</span>
                    <span class="fa-prog-name">${esc(_subjects.find(s=>s.program_code===prog)?.program_name||'')}</span>
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
        }).join('')}
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
    bindSaveBar(instr);
}

function renderSubjectRow(s) {
    // Key is always "sid:{subject_id}" — multi-instructor aware
    const key          = `sid:${s.subject_id}`;
    const checked      = _pending.has(key);
    const takenByOther = s.taken_by_other == 1;
    const otherNames   = s.other_instructor_names || '';

    const dotClass = checked ? 'checked' : (takenByOther ? 'other' : 'free');

    // "Also assigned to" note — informational only, does NOT disable the row
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

            // Update row style
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

    // Update assigned count in profile
    const ac = document.getElementById('assigned-count');
    if (ac) ac.textContent = _pending.size;
}

function bindSaveBar(instr) {
    const saveBtn    = document.getElementById('fa-save');
    const discardBtn = document.getElementById('fa-discard');
    if (!saveBtn) return;

    discardBtn.addEventListener('click', () => {
        _pending = new Set(_original);
        const right = document.getElementById('fa-right');
        renderRight(instr, right);
        updateBadge(instr.users_id);
    });

    saveBtn.addEventListener('click', async () => {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';

        // Keys are "sid:{subject_id}" — extract IDs for added/removed subjects
        const assignIds   = [..._pending]
            .filter(k => !_original.has(k) && k.startsWith('sid:'))
            .map(k => parseInt(k.slice(4)));
        const unassignIds = [..._original]
            .filter(k => !_pending.has(k)  && k.startsWith('sid:'))
            .map(k => parseInt(k.slice(4)));

        const res = await Api.post('/SubjectOfferingsAPI.php?action=dean-assign', {
            instructor_id:        instr.users_id,
            semester_id:          parseInt(_semId),
            assign_subject_ids:   assignIds,
            unassign_subject_ids: unassignIds
        });

        if (res.success) {
            // Reload fresh data
            await loadSubjects(instr);
        } else {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save Assignments';
            const lbl = document.getElementById('fa-change-label');
            if (lbl) lbl.innerHTML = `${icon('warning', inl)} ${res.message || 'Save failed'}`;
        }
    });
}

function updateBadge(instrId) {
    const badge = document.getElementById(`badge-${instrId}`);
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
    .fa-banner { background:#00461B;border-radius:16px;padding:20px 24px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px; }
    .fa-banner-left { display:flex;align-items:center;gap:14px; }
    .fa-banner-icon { width:46px;height:46px;background:rgba(255,255,255,.15);border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0; }
    .fa-banner-title { font-size:19px;font-weight:800;color:#fff;margin:0 0 2px; }
    .fa-banner-sub { font-size:12px;color:rgba(255,255,255,.7);margin:0; }
    .fa-banner-right { display:flex;flex-direction:column;gap:4px; }
    .fa-sem-label { font-size:11px;color:rgba(255,255,255,.65);font-weight:600;letter-spacing:.5px; }
    .fa-sem-sel { padding:8px 12px;border:1px solid rgba(255,255,255,.3);border-radius:8px;background:rgba(255,255,255,.1);color:#fff;font-size:13px;font-weight:600;cursor:pointer; }
    .fa-sem-sel option { background:#1B4D3E;color:#fff; }

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
    .fa-dept-divider { height:1px;background:#f0f0f0;margin:0 0 4px; }

    .fa-instr-search { padding:8px 12px;border:1px solid #e0e0e0;border-radius:8px;font-size:13px;width:100%;box-sizing:border-box; }
    .fa-instr-search:focus { outline:none;border-color:#00461B; }
    .fa-instr-list { overflow-y:auto;flex:1; }

    .fa-instr-card { display:flex;align-items:center;gap:10px;padding:12px 14px;cursor:pointer;border-bottom:1px solid #f5f5f5;transition:background .15s; }
    .fa-instr-card:hover { background:#f9fafb; }
    .fa-instr-card.active { background:#E8F5E9;border-right:3px solid #00461B; }
    .fa-instr-av { width:36px;height:36px;border-radius:50%;background:#1e40af;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;flex-shrink:0; }
    .fa-instr-name { font-size:13px;font-weight:600;color:#1a1a1a; }
    .fa-instr-meta { font-size:11px;color:#9ca3af;margin-top:1px; }
    .fa-instr-dept { display:inline-block;margin-top:3px;font-size:10px;font-weight:700;background:#E8F5E9;color:#1B4D3E;padding:1px 6px;border-radius:8px; }
    .fa-instr-badge { margin-left:auto;min-width:22px;text-align:center;padding:2px 7px;border-radius:10px;font-size:11px;font-weight:700;background:#f3f4f6;color:#9ca3af;flex-shrink:0; }
    .fa-instr-badge.has { background:#E8F5E9;color:#1B4D3E; }
    .fa-no-inst { padding:24px;text-align:center;color:#9ca3af;font-size:13px; }

    /* RIGHT panel */
    .fa-right { background:#fff;border:1px solid #e8e8e8;border-radius:14px;min-height:400px;position:relative; }
    .fa-placeholder { display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:80px 24px;text-align:center;color:#9ca3af; }
    .fa-placeholder p { font-size:14px;max-width:280px; }
    .fa-loading { display:flex;align-items:center;justify-content:center;gap:10px;padding:60px;color:#737373;font-size:14px; }
    .fa-err { padding:24px;color:#b91c1c;text-align:center; }

    /* Instructor profile */
    .fa-prof-card { display:flex;align-items:center;gap:14px;padding:18px 20px;border-bottom:1px solid #f0f0f0;background:#fafafa;border-radius:14px 14px 0 0; }
    .fa-prof-av { width:48px;height:48px;border-radius:50%;background:#00461B;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:16px;flex-shrink:0; }
    .fa-prof-name { font-size:16px;font-weight:700;color:#1a1a1a;margin-bottom:4px; }
    .fa-prof-meta { display:flex;gap:12px;flex-wrap:wrap;font-size:12px;color:#737373; }
    .fa-prof-meta span::before { content:'·';margin-right:12px; }
    .fa-prof-meta span:first-child::before { content:''; margin-right:0; }
    .fa-prof-stat { margin-left:auto;text-align:center;flex-shrink:0; }
    .fa-prof-stat-val { display:block;font-size:28px;font-weight:800;color:#00461B;line-height:1; }
    .fa-prof-stat-lbl { font-size:11px;color:#9ca3af; }

    /* Legend */
    .fa-legend { display:flex;gap:16px;padding:10px 20px;background:#f8fafc;border-bottom:1px solid #f0f0f0;flex-wrap:wrap; }
    .fa-leg-item { display:flex;align-items:center;gap:6px;font-size:12px;color:#737373; }
    .fa-leg-dot { width:10px;height:10px;border-radius:50%;flex-shrink:0; }
    .fa-leg-dot.checked { background:#00461B; }
    .fa-leg-dot.other   { background:#f59e0b; }
    .fa-leg-dot.free    { background:#e5e7eb;border:1px solid #d1d5db; }

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
    .fa-subj-row.taken { opacity:.6;cursor:not-allowed; }
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
    .fa-no-offer { color:#6366f1;font-style:italic; }

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

    @media (max-width:768px) {
        .fa-layout { grid-template-columns:1fr; }
        .fa-left { position:static;max-height:240px; }
    }
`; }
