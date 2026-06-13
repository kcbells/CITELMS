/**
 * Admin Faculty Assignments — Option A
 *
 * Two views:
 *   "By Instructor" (default) — instructor cards grid + unassigned panel
 *   "By Subject"              — hierarchical tree (original view)
 *
 * Bulk-assign uses the existing SubjectOfferingsAPI bulk-assign endpoint.
 */
import { Api }    from '../../api.js';
import { render as renderSections } from './sections.js';
import { L, icon } from '../../utils/action-labels.js';

const inl = { size: 14, className: 'ui-icon-inline' };

// ── Helpers ────────────────────────────────────────────────────────────────

function esc(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
}

function initials(name) {
    return (name || '?').split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

const YEAR_LBL = { 0:'Unclassified', 1:'First Year', 2:'Second Year', 3:'Third Year', 4:'Fourth Year' };
const SEM_LBL  = { 0:'Unclassified', 1:'1st Semester', 2:'2nd Semester', 3:'Summer' };

// ── Main render ────────────────────────────────────────────────────────────

export async function render(container) {
    const [semRes, instrRes, deptRes] = await Promise.all([
        Api.get('/SubjectOfferingsAPI.php?action=semesters'),
        Api.get('/SubjectOfferingsAPI.php?action=instructors'),
        Api.get('/SubjectOfferingsAPI.php?action=departments'),
    ]);

    const semesters   = semRes.success   ? semRes.data   : [];
    const instructors = instrRes.success ? instrRes.data : [];
    const departments = deptRes.success  ? deptRes.data  : [];
    const activeSem   = semesters.find(s => s.status === 'active');

    container.innerHTML = `
        <style>
            /* ── Page header ── */
            .fa-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; flex-wrap:wrap; gap:12px; }
            .fa-header h2 { font-size:22px; font-weight:800; color:#111827; margin:0; }
            .fa-sections-btn { display:inline-flex; align-items:center; gap:7px; padding:9px 18px; border-radius:9px; font-size:13px; font-weight:600; cursor:pointer; border:1.5px solid #1B4D3E; color:#1B4D3E; background:#fff; transition:all .15s; white-space:nowrap; }
            .fa-sections-btn:hover { background:#E8F5E9; }
            .fa-sections-btn.active { background:#1B4D3E; color:#fff; }

            /* ── Toolbar ── */
            .fa-toolbar { display:flex; gap:14px; flex-wrap:wrap; align-items:flex-end; margin-bottom:16px; padding:14px 16px; background:#fff; border:1px solid #e8e8e8; border-radius:12px; }
            .fa-tf { display:flex; flex-direction:column; gap:5px; }
            .fa-tf label { font-size:11px; font-weight:700; color:#6b7280; text-transform:uppercase; letter-spacing:.5px; }
            .fa-tf select { padding:8px 12px; border:1px solid #e0e0e0; border-radius:8px; font-size:14px; background:#fff; cursor:pointer; min-width:200px; }
            .fa-tf select:disabled { background:#f5f5f5; color:#b0b0b0; cursor:not-allowed; border-color:#e8e8e8; }

            /* ── Tabs ── */
            .fa-tabs { display:flex; gap:4px; margin-bottom:20px; border-bottom:2px solid #e8e8e8; }
            .fa-tab { padding:10px 20px; font-size:14px; font-weight:600; color:#6b7280; cursor:pointer; border-bottom:2px solid transparent; margin-bottom:-2px; transition:all .15s; border-radius:8px 8px 0 0; }
            .fa-tab:hover { color:#1B4D3E; background:#f0fdf4; }
            .fa-tab.active { color:#1B4D3E; border-bottom-color:#1B4D3E; background:#f0fdf4; }

            /* ── Instructor cards grid ── */
            .instr-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:16px; margin-bottom:28px; }
            .instr-card { background:#fff; border:1.5px solid #e8e8e8; border-radius:14px; overflow:hidden; transition:all .2s; }
            .instr-card:hover { border-color:#1B4D3E; box-shadow:0 4px 16px rgba(27,77,62,.08); }
            .instr-card-top { background:#00461B; padding:18px 20px; display:flex; align-items:center; gap:14px; }
            .instr-avatar { width:46px; height:46px; border-radius:50%; background:rgba(255,255,255,.2); color:#fff; font-size:17px; font-weight:800; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
            .instr-name  { font-size:15px; font-weight:700; color:#fff; line-height:1.3; }
            .instr-role  { font-size:11px; color:rgba(255,255,255,.7); margin-top:1px; }
            .instr-load-badge { margin-left:auto; background:rgba(255,255,255,.2); color:#fff; padding:3px 9px; border-radius:20px; font-size:12px; font-weight:700; white-space:nowrap; flex-shrink:0; }
            .instr-load-badge.zero { background:rgba(255,255,255,.1); opacity:.6; }

            .instr-card-body { padding:14px 20px 16px; }
            .instr-subj-list { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:14px; min-height:28px; }
            .instr-subj-tag { background:#E8F5E9; color:#1B4D3E; padding:3px 9px; border-radius:20px; font-size:12px; font-weight:700; font-family:monospace; }
            .instr-no-subj { font-size:12px; color:#9ca3af; font-style:italic; }

            .instr-manage-btn { width:100%; padding:9px; border-radius:9px; font-size:13px; font-weight:600; cursor:pointer; border:1.5px solid #1B4D3E; color:#1B4D3E; background:#fff; transition:all .15s; }
            .instr-manage-btn:hover { background:#1B4D3E; color:#fff; }

            /* ── Unassigned panel ── */
            .unassigned-panel { background:#fff; border:1.5px solid #FEF3C7; border-radius:14px; overflow:hidden; margin-bottom:20px; }
            .unassigned-header { display:flex; align-items:center; justify-content:space-between; padding:14px 20px; background:#FFFBEB; border-bottom:1px solid #FEF3C7; flex-wrap:wrap; gap:10px; }
            .unassigned-title { display:flex; align-items:center; gap:10px; }
            .unassigned-title h3 { font-size:15px; font-weight:700; color:#92400E; margin:0; }
            .unassigned-count { background:#FCD34D; color:#92400E; padding:2px 9px; border-radius:20px; font-size:12px; font-weight:700; }
            .bulk-bar { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
            .bulk-bar select { padding:7px 12px; border:1px solid #e0e0e0; border-radius:8px; font-size:13px; min-width:180px; }
            .bulk-apply-btn { padding:7px 14px; border-radius:8px; font-size:13px; font-weight:600; background:#1B4D3E; color:#fff; border:none; cursor:pointer; transition:background .15s; }
            .bulk-apply-btn:hover { background:#2D6A4F; }
            .bulk-apply-btn:disabled { opacity:.5; cursor:default; }

            .unassigned-item { display:flex; align-items:center; gap:12px; padding:11px 20px; border-bottom:1px solid #fef9e7; transition:background .12s; }
            .unassigned-item:last-child { border-bottom:none; }
            .unassigned-item:hover { background:#fffbf0; }
            .ua-check { width:16px; height:16px; cursor:pointer; accent-color:#1B4D3E; flex-shrink:0; }
            .ua-code { background:#FEF3C7; color:#B45309; padding:3px 8px; border-radius:5px; font-family:monospace; font-size:12px; font-weight:700; flex-shrink:0; min-width:60px; text-align:center; }
            .ua-name { flex:1; font-size:14px; font-weight:600; color:#262626; min-width:0; }
            .ua-prog { font-size:11px; color:#9ca3af; }
            .ua-sel  { padding:6px 10px; border:1px solid #e0e0e0; border-radius:7px; font-size:13px; min-width:180px; }

            /* ── Subject view (tree) ── */
            .fa-panel { background:#fff; border:1px solid #e8e8e8; border-radius:12px; overflow:hidden; }
            .fa-prog-header { padding:14px 20px; background:#00461B; color:#fff; font-size:15px; font-weight:700; }
            .fa-year-header { padding:10px 20px 6px; font-size:12px; font-weight:700; color:#737373; text-transform:uppercase; letter-spacing:.7px; background:#fafafa; border-bottom:1px solid #f0f0f0; }
            .fa-sem-header  { padding:8px 20px 6px; font-size:12px; font-weight:600; color:#6b7280; background:#fff; border-bottom:1px solid #f5f5f5; display:flex; align-items:center; gap:10px; }
            .fa-sem-badge   { background:#DBEAFE; color:#1E40AF; padding:2px 8px; border-radius:20px; font-size:11px; font-weight:600; }
            .fa-item { display:flex; align-items:center; gap:12px; padding:12px 20px; border-bottom:1px solid #f5f5f5; transition:background .12s; flex-wrap:wrap; }
            .fa-item:last-child { border-bottom:none; }
            .fa-item:hover { background:#fafafa; }
            .fa-item.saving { opacity:.5; pointer-events:none; }
            .fa-code-tag { background:#E8F5E9; color:#1B4D3E; padding:3px 8px; border-radius:5px; font-family:monospace; font-size:12px; font-weight:700; flex-shrink:0; min-width:64px; text-align:center; }
            .fa-subj-name { flex:1; font-size:14px; font-weight:600; color:#262626; min-width:0; }
            .fa-sec-pill  { background:#f0f0f0; color:#555; padding:2px 7px; border-radius:20px; font-size:11px; flex-shrink:0; }
            .fa-instr-sel { padding:6px 10px; border:1px solid #e0e0e0; border-radius:7px; font-size:13px; background:#fff; min-width:190px; cursor:pointer; }
            .fa-instr-sel:focus { outline:none; border-color:#1B4D3E; }
            .fa-status-pill { padding:2px 9px; border-radius:20px; font-size:11px; font-weight:600; flex-shrink:0; white-space:nowrap; }
            .fa-ok   { background:#E8F5E9; color:#1B4D3E; }
            .fa-warn { background:#FEF3C7; color:#B45309; }

            /* ── Multi-instructor chips (By Subject view) ── */
            .fa-instr-tags { display:flex; flex-wrap:wrap; align-items:center; gap:6px; flex:1; min-width:200px; }
            .fa-instr-chip { display:inline-flex; align-items:center; gap:5px; background:#E8F5E9; color:#1B4D3E; padding:3px 6px 3px 10px; border-radius:20px; font-size:12px; font-weight:600; white-space:nowrap; }
            .fa-chip-remove { background:none; border:none; cursor:pointer; color:#1B4D3E; padding:0 2px; line-height:1; font-size:12px; opacity:.55; transition:opacity .12s, color .12s; border-radius:50%; }
            .fa-chip-remove:hover { opacity:1; color:#b91c1c; }
            .fa-chip-remove:disabled { opacity:.3; cursor:default; }
            .fa-add-instr { padding:3px 10px; border:1.5px dashed #1B4D3E; border-radius:20px; font-size:12px; color:#1B4D3E; background:#fff; cursor:pointer; max-width:200px; }
            .fa-add-instr:focus { outline:none; border-style:solid; }
            .fa-add-instr:disabled { opacity:.4; cursor:default; }

            /* ── Manage modal ── */
            .mm-overlay { position:fixed; inset:0; background:rgba(0,0,0,.45); display:flex; align-items:center; justify-content:center; z-index:900; }
            .mm-modal { background:#fff; border-radius:16px; width:560px; max-width:95vw; max-height:85vh; display:flex; flex-direction:column; box-shadow:0 24px 60px rgba(0,0,0,.2); }
            .mm-header { padding:20px 24px 16px; border-bottom:1px solid #f0f0f0; display:flex; align-items:flex-start; justify-content:space-between; }
            .mm-header-info h3 { font-size:17px; font-weight:800; color:#111827; margin:0 0 4px; }
            .mm-header-info p  { font-size:13px; color:#6b7280; margin:0; }
            .mm-close { background:none; border:none; font-size:22px; cursor:pointer; color:#9ca3af; padding:0 4px; line-height:1; }
            .mm-close:hover { color:#374151; }

            .mm-search { padding:12px 24px; border-bottom:1px solid #f0f0f0; }
            .mm-search input { width:100%; padding:9px 12px; border:1px solid #e0e0e0; border-radius:9px; font-size:14px; outline:none; box-sizing:border-box; }
            .mm-search input:focus { border-color:#1B4D3E; }

            .mm-body { flex:1; overflow-y:auto; padding:8px 8px; }
            .mm-group-label { font-size:10px; font-weight:800; color:#9ca3af; text-transform:uppercase; letter-spacing:.7px; padding:10px 16px 6px; }
            .mm-subj-item { display:flex; align-items:center; gap:12px; padding:9px 16px; border-radius:9px; cursor:pointer; transition:background .12s; }
            .mm-subj-item:hover { background:#f0f7f5; }
            .mm-subj-item input[type=checkbox] { width:16px; height:16px; accent-color:#1B4D3E; flex-shrink:0; cursor:pointer; }
            .mm-subj-code { background:#E8F5E9; color:#1B4D3E; padding:3px 8px; border-radius:5px; font-family:monospace; font-size:12px; font-weight:700; flex-shrink:0; min-width:64px; text-align:center; }
            .mm-subj-code.other { background:#FEE2E2; color:#b91c1c; }
            .mm-subj-name { flex:1; font-size:14px; font-weight:600; color:#111827; }
            .mm-subj-meta { font-size:11px; color:#9ca3af; }
            .mm-other-note { font-size:11px; color:#b91c1c; margin-left:4px; }

            .mm-footer { padding:16px 24px; border-top:1px solid #f0f0f0; display:flex; justify-content:space-between; align-items:center; gap:12px; }
            .mm-footer-info { font-size:13px; color:#6b7280; }
            .mm-footer-btns { display:flex; gap:10px; }
            .mm-cancel-btn { padding:9px 20px; border-radius:9px; border:1.5px solid #e0e0e0; background:#fff; color:#374151; font-size:13px; font-weight:600; cursor:pointer; }
            .mm-cancel-btn:hover { background:#f9fafb; }
            .mm-save-btn { padding:9px 20px; border-radius:9px; border:none; background:#1B4D3E; color:#fff; font-size:13px; font-weight:600; cursor:pointer; transition:background .15s; }
            .mm-save-btn:hover { background:#2D6A4F; }
            .mm-save-btn:disabled { opacity:.5; cursor:default; }

            .fa-empty { text-align:center; padding:48px 20px; color:#9ca3af; }
            .fa-empty strong { display:block; font-size:16px; color:#6b7280; margin-bottom:6px; }
            @media(max-width:768px) { .instr-grid { grid-template-columns:1fr; } .fa-item { flex-wrap:wrap; } .fa-instr-sel { min-width:100%; } }
        </style>

        <!-- Header -->
        <div class="fa-header">
            <h2>Faculty Assignments</h2>
            <button class="fa-sections-btn" id="fa-sec-btn">${L.manageSections}</button>
        </div>

        <!-- Toolbar -->
        <div id="fa-toolbar-wrap"><div class="fa-toolbar">
            <div class="fa-tf">
                <label>Semester</label>
                <select id="fa-sem">
                    <option value="">Select Semester…</option>
                    ${semesters.map(s => `
                        <option value="${s.semester_id}" ${activeSem?.semester_id == s.semester_id ? 'selected' : ''}>
                            ${esc(s.semester_name)} – ${esc(s.academic_year)}${s.status === 'active' ? ' (Current)' : ''}
                        </option>`).join('')}
                </select>
            </div>
            <div class="fa-tf">
                <label>Department</label>
                <select id="fa-dept">
                    <option value="">All Departments</option>
                    ${departments.map(d => `<option value="${d.department_id}">${esc(d.department_name)}</option>`).join('')}
                </select>
            </div>
            <div class="fa-tf">
                <label>Program</label>
                <select id="fa-prog" disabled>
                    <option value="">— Select Department first —</option>
                </select>
            </div>
            <div class="fa-tf" id="fa-instr-wrap" style="display:none;">
                <label>Instructor</label>
                <select id="fa-instr" style="min-width:220px;" disabled>
                    <option value="">— Select Program first —</option>
                </select>
            </div>
        </div></div>

        <!-- Tabs -->
        <div class="fa-tabs" id="fa-tabs-bar">
            <div class="fa-tab active" data-tab="instructor">${L.byInstructor}</div>
            <div class="fa-tab"        data-tab="subject">${L.bySubject}</div>
        </div>

        <div id="fa-content"></div>
    `;

    // ── Elements ─────────────────────────────────────────────────────────
    const semSel      = container.querySelector('#fa-sem');
    const deptSel     = container.querySelector('#fa-dept');
    const progSel     = container.querySelector('#fa-prog');
    const instrSel    = container.querySelector('#fa-instr');
    const instrWrap   = container.querySelector('#fa-instr-wrap');
    const toolbarWrap = container.querySelector('#fa-toolbar-wrap');
    const tabsBar     = container.querySelector('#fa-tabs-bar');
    const secBtn      = container.querySelector('#fa-sec-btn');
    const content     = container.querySelector('#fa-content');
    let   activeTab   = 'instructor';
    let   sectionsMode = false;

    // ── Sections button toggle ────────────────────────────────────────────
    secBtn.addEventListener('click', () => {
        sectionsMode = !sectionsMode;
        secBtn.classList.toggle('active', sectionsMode);
        secBtn.innerHTML = sectionsMode ? '← Faculty Assignments' : L.manageSections;
        toolbarWrap.style.display = sectionsMode ? 'none' : '';
        tabsBar.style.display     = sectionsMode ? 'none' : '';
        if (sectionsMode) {
            renderSections(content);
        } else {
            loadContent();
        }
    });

    // ── Tab switching ─────────────────────────────────────────────────────
    container.querySelectorAll('.fa-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            container.querySelectorAll('.fa-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            activeTab = tab.dataset.tab;
            instrWrap.style.display = activeTab === 'instructor' ? '' : 'none';
            loadContent();
        });
    });

    // ── Populate instructor dropdown (filtered by dept/prog) ──────────────
    function populateInstructorSel() {
        const dId = deptSel.value;
        const pId = progSel.value;
        const prev = instrSel.value;
        const filtered = instructors.filter(i => {
            if (pId && String(i.program_id)    !== String(pId)) return false;
            if (dId && String(i.department_id) !== String(dId)) return false;
            return true;
        });
        instrSel.innerHTML = '<option value="">— Select Instructor —</option>' +
            filtered.map(i =>
                `<option value="${i.users_id}">${esc(i.last_name + ', ' + i.first_name)}${i.program_code ? ' · ' + i.program_code : ''}</option>`
            ).join('');
        // Restore previous selection if still in filtered list
        if (prev && filtered.some(i => String(i.users_id) === prev)) instrSel.value = prev;
    }

    // ── Department → Program cascade ──────────────────────────────────────
    async function loadPrograms(deptId) {
        if (!deptId) {
            progSel.innerHTML = '<option value="">— Select Department first —</option>';
            progSel.disabled  = true;
            instrSel.innerHTML = '<option value="">— Select Program first —</option>';
            instrSel.disabled  = true;
            instrSel.value = '';
            return;
        }
        const res = await Api.get('/SubjectOfferingsAPI.php?action=programs&department_id=' + deptId);
        progSel.innerHTML = '<option value="">— Select Program —</option>';
        if (res.success) res.data.forEach(p => {
            const o = document.createElement('option');
            o.value = p.program_id;
            o.textContent = `${p.program_code} – ${p.program_name}`;
            progSel.appendChild(o);
        });
        progSel.disabled = false;
        // Reset instructor when dept changes
        instrSel.innerHTML = '<option value="">— Select Program first —</option>';
        instrSel.disabled  = true;
        instrSel.value = '';
    }

    deptSel.addEventListener('change', async () => {
        await loadPrograms(deptSel.value);
        loadContent();
    });

    progSel.addEventListener('change', () => {
        if (progSel.value) {
            populateInstructorSel();
            instrSel.disabled = false;
        } else {
            instrSel.innerHTML = '<option value="">— Select Program first —</option>';
            instrSel.disabled  = true;
            instrSel.value = '';
        }
        loadContent();
    });

    semSel.addEventListener('change',  loadContent);
    instrSel.addEventListener('change', loadContent);

    // Show instructor selector only on By Instructor tab (default)
    instrWrap.style.display = '';

    // ── Load content ──────────────────────────────────────────────────────
    async function loadContent() {
        const semId   = semSel.value;
        const progId  = progSel.value;
        const instrId = instrSel.value;

        if (!semId) {
            content.innerHTML = '<div class="fa-empty"><strong>Select a semester</strong><p>Choose a semester above to get started.</p></div>';
            return;
        }

        // By Instructor tab requires an instructor to be selected
        if (activeTab === 'instructor' && !instrId) {
            content.innerHTML = `<div class="fa-empty">
                <strong>Select an instructor</strong>
                <p>Use the filters above to narrow by department and program, then pick an instructor to view and manage their subject assignments.</p>
            </div>`;
            return;
        }

        content.innerHTML = '<div class="fa-empty"><p>Loading…</p></div>';

        // ── By Subject tab — uses list-multi (all instructors per subject) ──
        if (activeTab === 'subject') {
            let url = `/SubjectOfferingsAPI.php?action=list-multi&semester_id=${semId}`;
            if (progId) url += `&program_id=${progId}`;
            const res = await Api.get(url);
            const subjects = res.success ? res.data : [];
            if (!subjects.length) {
                content.innerHTML = `<div class="fa-empty">
                    <strong>No subjects found</strong>
                    <p>No curriculum subjects found for this semester and program.</p>
                </div>`;
                return;
            }
            renderSubjectView(content, subjects, instructors, parseInt(semId));
            return;
        }

        // ── By Instructor tab — uses list (LIMIT 1, with is_assigned_to_instructor) ──
        const selectedInstr = instructors.find(i => String(i.users_id) === String(instrId));
        const loadProgId    = selectedInstr?.program_id || progId || '';

        let url = `/SubjectOfferingsAPI.php?action=list&semester_id=${semId}`;
        if (loadProgId) url += `&program_id=${loadProgId}`;
        url += `&instructor_id=${instrId}`;

        let res = await Api.get(url);
        let offerings = res.success ? res.data : [];

        // Auto-generate offerings silently for any curriculum subject that lacks one
        const hasUnoffered = offerings.some(o => !o.subject_offered_id);
        if (hasUnoffered) {
            await Api.post('/SubjectOfferingsAPI.php?action=generate-offerings', {
                semester_id: parseInt(semId),
                program_id:  loadProgId ? parseInt(loadProgId) : null
            });
            res = await Api.get(url);
            offerings = res.success ? res.data : [];
        }

        if (!offerings.length) {
            content.innerHTML = `<div class="fa-empty">
                <strong>No subjects found</strong>
                <p>No curriculum subjects found for this semester and program.</p>
            </div>`;
            return;
        }

        renderSingleInstructorView(content, selectedInstr, offerings, parseInt(semId));
    }

    if (activeSem) loadContent();

    // ═══════════════════════════════════════════════════════════════════════
    // VIEW A — SINGLE INSTRUCTOR DETAIL
    // ═══════════════════════════════════════════════════════════════════════

    function renderSingleInstructorView(wrap, instr, offerings, semId) {
        if (!instr) {
            wrap.innerHTML = '<div class="fa-empty"><strong>Instructor not found</strong></div>';
            return;
        }

        // Group offerings by year → curriculum semester
        const byYear = new Map();
        offerings.forEach(o => {
            const yk = Number(o.year_level)       || 0;
            const sk = Number(o.subject_semester) || 0;
            if (!byYear.has(yk)) byYear.set(yk, new Map());
            const bySem = byYear.get(yk);
            if (!bySem.has(sk)) bySem.set(sk, []);
            bySem.get(sk).push(o);
        });

        const myCount = offerings.filter(o => o.is_assigned_to_instructor == 1 || String(o.user_teacher_id) === String(instr.users_id)).length;
        const total   = offerings.length;

        const deptTag = instr.department_code
            ? `<span style="background:rgba(255,255,255,.2);color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;">${esc(instr.department_code)}</span>` : '';
        const progTag = instr.program_code
            ? `<span style="background:rgba(255,255,255,.2);color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;">${esc(instr.program_code)}</span>` : '';

        // ── Instructor banner ──
        let html = `
        <div style="background:#00461B;border-radius:14px;padding:20px 24px;margin-bottom:20px;display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
            <div style="width:54px;height:54px;border-radius:50%;background:rgba(255,255,255,.2);color:#fff;font-size:20px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                ${initials(instr.first_name + ' ' + instr.last_name)}
            </div>
            <div style="flex:1;min-width:0;">
                <div style="font-size:18px;font-weight:800;color:#fff;margin-bottom:6px;">${esc(instr.first_name + ' ' + instr.last_name)}</div>
                <div style="display:flex;gap:6px;flex-wrap:wrap;">${deptTag}${progTag}</div>
            </div>
            <div style="text-align:right;flex-shrink:0;">
                <div style="font-size:26px;font-weight:800;color:#fff;">${myCount}<span style="font-size:14px;color:rgba(255,255,255,.6);">/${total}</span></div>
                <div style="font-size:12px;color:rgba(255,255,255,.7);">subjects assigned</div>
                <div style="font-size:11px;color:rgba(255,255,255,.5);margin-top:4px;">Multiple instructors can share a subject</div>
            </div>
        </div>`;

        // ── Subject checklist (grouped by year + sem) ──
        html += `<div class="fa-panel">`;
        for (const yearKey of [...byYear.keys()].sort((a, b) => a - b)) {
            html += `<div class="fa-year-header">${YEAR_LBL[yearKey] || 'Year ' + yearKey}</div>`;
            const bySem = byYear.get(yearKey);
            for (const semKey of [...bySem.keys()].sort((a, b) => a - b)) {
                const items = bySem.get(semKey);
                html += `<div class="fa-sem-header">${SEM_LBL[semKey] || 'Semester ' + semKey}</div>`;
                items.forEach(o => {
                    const isMe    = o.is_assigned_to_instructor == 1 || String(o.user_teacher_id) === String(instr.users_id);
                    const isOther = !!o.user_teacher_id && !isMe;
                    const secCount = parseInt(o.section_count) || 0;
                    html += `
                    <div class="fa-item si-row" data-subject-id="${o.subject_id}" data-offered-id="${o.subject_offered_id || ''}" data-orig="${isMe ? '1' : '0'}">
                        <input type="checkbox" class="si-check"
                            style="width:16px;height:16px;accent-color:#1B4D3E;flex-shrink:0;cursor:pointer;"
                            data-subject-id="${o.subject_id}"
                            data-offered-id="${o.subject_offered_id || ''}"
                            ${isMe ? 'checked' : ''}>
                        <span class="fa-code-tag">${esc(o.subject_code)}</span>
                        <span class="fa-subj-name">${esc(o.subject_name)}</span>
                        ${secCount > 0 ? `<span class="fa-sec-pill">${secCount} sec</span>` : ''}
                        ${isMe
                            ? `<span class="fa-status-pill fa-ok">${icon('check', inl)} Assigned</span>`
                            : isOther
                                ? `<span class="fa-status-pill" style="background:#DBEAFE;color:#1E40AF;" title="You can still assign this instructor — they will get their own section">Also: ${esc(o.instructor_name)}</span>`
                                : `<span class="fa-status-pill" style="background:#f3f4f6;color:#9ca3af;">Unassigned</span>`}
                    </div>`;
                });
            }
        }
        html += `</div>`;

        // ── Save bar ──
        html += `
        <div style="display:flex;justify-content:flex-end;align-items:center;gap:14px;margin-top:16px;padding:14px 16px;background:#fff;border:1px solid #e8e8e8;border-radius:12px;">
            <span id="si-change-info" style="font-size:13px;color:#6b7280;">No changes</span>
            <button id="si-save" class="mm-save-btn" disabled>Save Assignments</button>
        </div>`;

        wrap.innerHTML = html;

        // ── Change counter ──
        function updateInfo() {
            const checks    = [...wrap.querySelectorAll('.si-check')];
            const toAssign  = checks.filter(c => c.checked  && c.closest('.si-row').dataset.orig === '0').length;
            const toRemove  = checks.filter(c => !c.checked && c.closest('.si-row').dataset.orig === '1').length;
            const parts = [];
            if (toAssign > 0) parts.push(`+${toAssign} to assign`);
            if (toRemove > 0) parts.push(`−${toRemove} to remove`);
            wrap.querySelector('#si-change-info').textContent = parts.length ? parts.join(', ') : 'No changes';
            wrap.querySelector('#si-save').disabled = parts.length === 0;
        }

        wrap.querySelectorAll('.si-check').forEach(c => c.addEventListener('change', updateInfo));

        // ── Save ──
        wrap.querySelector('#si-save').addEventListener('click', async () => {
            const checks      = [...wrap.querySelectorAll('.si-check')];
            const assignIds   = checks.filter(c => c.checked  && c.closest('.si-row').dataset.orig === '0').map(c => parseInt(c.dataset.subjectId));
            const unassignIds = checks.filter(c => !c.checked && c.closest('.si-row').dataset.orig === '1').map(c => parseInt(c.dataset.subjectId));
            const btn = wrap.querySelector('#si-save');
            btn.disabled = true; btn.textContent = 'Saving…';
            const r = await Api.post('/SubjectOfferingsAPI.php?action=bulk-assign', {
                instructor_id:        instr.users_id,
                semester_id:          semId,
                assign_subject_ids:   assignIds,
                unassign_subject_ids: unassignIds
            });
            btn.textContent = 'Save Assignments';
            if (r.success) loadContent();
            else { btn.disabled = false; alert(r.message || 'Failed'); }
        });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // MANAGE MODAL — checkbox subject picker
    // ═══════════════════════════════════════════════════════════════════════

    function openManageModal(instr, offerings, semId) {
        document.getElementById('fa-manage-modal')?.remove();

        // Original subject IDs for this instructor
        const originalIds = new Set(instr.subjects.map(s => parseInt(s.subject_id)));

        // Collect unique programs for the filter dropdown
        const progMap = new Map(); // program_code → program_name
        offerings.forEach(o => {
            if (o.program_code) progMap.set(o.program_code, o.program_name || o.program_code);
        });
        const progOpts = [...progMap.entries()].map(([code, name]) =>
            `<option value="${esc(code)}">${esc(code)} – ${esc(name)}</option>`
        ).join('');
        // Pre-select whatever program is chosen in the toolbar
        const defaultProg = progSel.value
            ? (offerings.find(o => String(o.program_id) === progSel.value)?.program_code || '')
            : (progMap.size === 1 ? [...progMap.keys()][0] : '');

        // Group all offerings by program
        const byProg = new Map();
        offerings.forEach(o => {
            const pk = o.program_code || 'No Program';
            if (!byProg.has(pk)) byProg.set(pk, []);
            byProg.get(pk).push(o);
        });

        let subjectsHtml = '';
        for (const [prog, items] of byProg) {
            subjectsHtml += `<div class="mm-group-label" data-prog="${esc(prog)}">${esc(prog)}</div>`;
            items.forEach(o => {
                const isMine    = originalIds.has(parseInt(o.subject_id));
                const isOther   = !isMine && !!o.user_teacher_id;
                const otherName = isOther ? esc(o.instructor_name || '') : '';
                subjectsHtml += `
                <div class="mm-subj-item"
                    data-name="${esc((o.subject_code + ' ' + o.subject_name).toLowerCase())}"
                    data-prog="${esc(o.program_code || '')}">
                    <input type="checkbox" class="mm-check"
                        data-subject-id="${o.subject_id}"
                        data-offered-id="${o.subject_offered_id || ''}"
                        data-was-mine="${isMine ? '1' : '0'}"
                        ${isMine ? 'checked' : ''}>
                    <span class="mm-subj-code ${isOther ? 'other' : ''}">${esc(o.subject_code)}</span>
                    <div style="flex:1;min-width:0;">
                        <div class="mm-subj-name">${esc(o.subject_name)}</div>
                        <div class="mm-subj-meta">${YEAR_LBL[o.year_level] || ''} · ${SEM_LBL[o.subject_semester] || ''}</div>
                    </div>
                    ${isOther ? `<span class="mm-other-note">${icon('warning', { size: 12, className: 'ui-icon-inline' })} ${otherName}</span>` : ''}
                </div>`;
            });
        }

        const overlay = document.createElement('div');
        overlay.className = 'mm-overlay';
        overlay.id = 'fa-manage-modal';
        overlay.innerHTML = `
            <div class="mm-modal">
                <div class="mm-header">
                    <div class="mm-header-info">
                        <h3>${esc(instr.name)}</h3>
                        <p>Check subjects to assign · Uncheck to remove</p>
                    </div>
                    <button class="mm-close" id="mm-close">${icon('close', inl)}</button>
                </div>
                <div class="mm-search" style="display:flex;gap:8px;align-items:center;">
                    <select id="mm-prog-filter" style="padding:8px 10px;border:1px solid #e0e0e0;border-radius:9px;font-size:13px;flex-shrink:0;max-width:180px;">
                        <option value="">All Programs</option>
                        ${progOpts}
                    </select>
                    <input type="text" id="mm-search" placeholder="Search subjects…" style="flex:1;">
                </div>
                <div class="mm-body" id="mm-body">${subjectsHtml}</div>
                <div class="mm-footer">
                    <div class="mm-footer-info" id="mm-change-info">No changes</div>
                    <div class="mm-footer-btns">
                        <button class="mm-cancel-btn" id="mm-cancel">Cancel</button>
                        <button class="mm-save-btn"   id="mm-save">Save Changes</button>
                    </div>
                </div>
            </div>`;

        document.body.appendChild(overlay);

        // Pre-select program if applicable
        if (defaultProg) overlay.querySelector('#mm-prog-filter').value = defaultProg;

        // Close handlers
        document.getElementById('mm-close').addEventListener('click',  () => overlay.remove());
        document.getElementById('mm-cancel').addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

        // Combined filter: program + text search
        function applyFilters() {
            const q    = overlay.querySelector('#mm-search').value.toLowerCase();
            const prog = overlay.querySelector('#mm-prog-filter').value;
            overlay.querySelectorAll('.mm-subj-item').forEach(el => {
                const matchProg = !prog || el.dataset.prog === prog;
                const matchText = !q    || el.dataset.name.includes(q);
                el.style.display = (matchProg && matchText) ? '' : 'none';
            });
            // Hide group labels when all their items are hidden
            overlay.querySelectorAll('.mm-group-label').forEach(lbl => {
                const grp = lbl.dataset.prog;
                const anyVisible = [...overlay.querySelectorAll(`.mm-subj-item[data-prog="${grp}"]`)]
                    .some(el => el.style.display !== 'none');
                lbl.style.display = anyVisible ? '' : 'none';
            });
        }

        overlay.querySelector('#mm-search').addEventListener('input', applyFilters);
        overlay.querySelector('#mm-prog-filter').addEventListener('change', applyFilters);
        applyFilters(); // apply default program filter on open

        // Change counter
        function updateChangeInfo() {
            const checks    = [...document.querySelectorAll('.mm-check')];
            const toAssign  = checks.filter(c => c.checked  && c.dataset.wasMine === '0').length;
            const toRemove  = checks.filter(c => !c.checked && c.dataset.wasMine === '1').length;
            const info      = document.getElementById('mm-change-info');
            const saveBtn   = document.getElementById('mm-save');
            const parts     = [];
            if (toAssign > 0) parts.push(`+${toAssign} to assign`);
            if (toRemove > 0) parts.push(`−${toRemove} to remove`);
            info.textContent = parts.length ? parts.join(', ') : 'No changes';
            saveBtn.disabled = parts.length === 0;
        }

        document.querySelectorAll('.mm-check').forEach(c =>
            c.addEventListener('change', updateChangeInfo));
        updateChangeInfo();

        // Save
        document.getElementById('mm-save').addEventListener('click', async () => {
            const checks       = [...document.querySelectorAll('.mm-check')];
            const assignIds    = checks.filter(c => c.checked  && c.dataset.wasMine === '0').map(c => parseInt(c.dataset.subjectId));
            const unassignIds  = checks.filter(c => !c.checked && c.dataset.wasMine === '1').map(c => parseInt(c.dataset.subjectId));

            const saveBtn = document.getElementById('mm-save');
            saveBtn.disabled = true; saveBtn.textContent = 'Saving…';

            const r = await Api.post('/SubjectOfferingsAPI.php?action=bulk-assign', {
                instructor_id:       instr.id,
                semester_id:         semId,
                assign_subject_ids:  assignIds,
                unassign_subject_ids: unassignIds
            });

            saveBtn.textContent = 'Save Changes';
            if (r.success) { overlay.remove(); loadContent(); }
            else { saveBtn.disabled = false; alert(r.message || 'Failed to save'); }
        });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // VIEW B — BY SUBJECT (multi-instructor chips)
    // subjects = list-multi format: each item has .instructors[] array
    // ═══════════════════════════════════════════════════════════════════════

    function renderSubjectView(wrap, subjects, instructors, semId) {

        // Group: Program → Year → Curriculum Semester
        const byProg = new Map();
        subjects.forEach(s => {
            const pk = s.program_code || 'No Program';
            const yk = Number(s.year_level)       || 0;
            const sk = Number(s.subject_semester) || 0;
            if (!byProg.has(pk)) byProg.set(pk, new Map());
            const byYear = byProg.get(pk);
            if (!byYear.has(yk)) byYear.set(yk, new Map());
            const bySem = byYear.get(yk);
            if (!bySem.has(sk)) bySem.set(sk, []);
            bySem.get(sk).push(s);
        });

        let html = '<div class="fa-panel">';
        for (const [progCode, byYear] of byProg) {
            html += `<div class="fa-prog-header">${esc(progCode)}</div>`;
            for (const yearKey of [...byYear.keys()].sort((a, b) => a - b)) {
                html += `<div class="fa-year-header">${YEAR_LBL[yearKey] || 'Year ' + yearKey}</div>`;
                const bySem = byYear.get(yearKey);
                for (const semKey of [...bySem.keys()].sort((a, b) => a - b)) {
                    html += `<div class="fa-sem-header">${SEM_LBL[semKey] || 'Semester ' + semKey}</div>`;
                    bySem.get(semKey).forEach(s => {
                        const assignedIds   = new Set(s.instructors.map(i => String(i.user_teacher_id)));
                        const totalSections = s.instructors.reduce((n, i) => n + (i.section_count || 0), 0);
                        const count         = s.instructors.length;

                        // Instructor chips (one per assigned instructor)
                        const chips = s.instructors.map(i => `
                            <span class="fa-instr-chip">
                                ${esc(i.instructor_name)}
                                <button class="fa-chip-remove"
                                    data-subject-id="${s.subject_id}"
                                    data-instructor-id="${i.user_teacher_id}"
                                    data-instructor-name="${esc(i.instructor_name)}"
                                    title="Remove ${esc(i.instructor_name)}">${icon('close', inl)}</button>
                            </span>`).join('');

                        // "Add instructor" dropdown — only lists instructors not yet assigned
                        const availOpts = instructors
                            .filter(i => !assignedIds.has(String(i.users_id)))
                            .map(i => `<option value="${i.users_id}">${esc(i.last_name + ', ' + i.first_name)}</option>`)
                            .join('');
                        const addCtrl = availOpts
                            ? `<select class="fa-add-instr" data-subject-id="${s.subject_id}">
                                   <option value="">+ Add instructor…</option>
                                   ${availOpts}
                               </select>`
                            : `<span style="font-size:12px;color:#9ca3af;font-style:italic;">All instructors assigned</span>`;

                        const statusPill = count > 0
                            ? `<span class="fa-status-pill fa-ok" style="align-self:flex-start;margin-top:2px;">${icon('check', inl)} ${count} Instructor${count > 1 ? 's' : ''}</span>`
                            : `<span class="fa-status-pill fa-warn" style="align-self:flex-start;margin-top:2px;">${L.unassigned}</span>`;

                        html += `
                        <div class="fa-item" data-subject-id="${s.subject_id}">
                            <span class="fa-code-tag">${esc(s.subject_code)}</span>
                            <span class="fa-subj-name">${esc(s.subject_name)}</span>
                            ${totalSections > 0 ? `<span class="fa-sec-pill">${totalSections} sec</span>` : ''}
                            <div class="fa-instr-tags">
                                ${chips}
                                ${addCtrl}
                            </div>
                            ${statusPill}
                        </div>`;
                    });
                }
            }
        }
        html += '</div>';
        wrap.innerHTML = html;

        // ── Add instructor ──────────────────────────────────────────────────
        wrap.querySelectorAll('.fa-add-instr').forEach(sel => {
            sel.addEventListener('change', async function () {
                if (!this.value) return;
                const subjectId    = parseInt(this.dataset.subjectId);
                const instructorId = parseInt(this.value);
                this.disabled = true;
                const r = await Api.post('/SubjectOfferingsAPI.php?action=bulk-assign', {
                    instructor_id:        instructorId,
                    semester_id:          semId,
                    assign_subject_ids:   [subjectId],
                    unassign_subject_ids: []
                });
                if (r.success) {
                    loadContent();
                } else {
                    this.disabled = false;
                    this.value    = '';
                    alert(r.message || 'Failed to assign instructor');
                }
            });
        });

        // ── Remove instructor ───────────────────────────────────────────────
        wrap.querySelectorAll('.fa-chip-remove').forEach(btn => {
            btn.addEventListener('click', async function () {
                const subjectId    = parseInt(this.dataset.subjectId);
                const instructorId = parseInt(this.dataset.instructorId);
                const name         = this.dataset.instructorName || 'this instructor';
                if (!confirm(`Remove ${name} from this subject?`)) return;
                this.disabled = true;
                const r = await Api.post('/SubjectOfferingsAPI.php?action=bulk-assign', {
                    instructor_id:        instructorId,
                    semester_id:          semId,
                    assign_subject_ids:   [],
                    unassign_subject_ids: [subjectId]
                });
                if (r.success) {
                    loadContent();
                } else {
                    this.disabled = false;
                    alert(r.message || 'Failed to remove instructor');
                }
            });
        });
    }
}
