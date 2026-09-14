/**
 * Dean — Program Curriculum
 * Program cards · curriculum version tabs · add program · upload curriculum docs
 */
import { Api } from '../../api.js';
import { notify } from '../../utils/notify.js';

import { esc } from '../../utils/classroom-ui.js';
let _programs   = [];
let _activeProg = null;
let _versions   = [];
let _activeVer  = null; // null = "All" (no version filter)
let _subjects   = [];

export async function render(container) {
    container.innerHTML = `<style>${css()}</style><div class="ps-boot"><div class="ps-spin"></div></div>`;

    const progRes = await Api.get('/CurriculumAPI.php?action=programs');
    _programs = progRes.success ? progRes.data : [];

    if (!_programs.length) {
        container.innerHTML = `<style>${css()}</style>
        <div class="ps-empty-full">
            <h3>No programs assigned</h3>
            <p>Your department has no programs yet.</p>
            <button class="ps-btn-add" id="ps-add-prog-empty">+ Add Program</button>
        </div>`;
        container.querySelector('#ps-add-prog-empty')?.addEventListener('click', () => openAddProgramModal(container));
        return;
    }

    _activeProg = _programs[0];
    _activeVer  = null;

    container.innerHTML = `<style>${css()}</style>
    <div class="ps-page">

        <div class="ps-header" style="justify-content:flex-end">
            <button class="ps-btn-add" id="ps-add-prog-btn">+ Add Program</button>
        </div>

        <!-- Program cards -->
        <div class="ps-prog-grid" id="ps-prog-grid">
            ${_programs.map((p, i) => programCardHtml(p, i === 0)).join('')}
        </div>

        <!-- Selected program view -->
        <div class="ps-prog-view" id="ps-prog-view">
            <div class="ps-view-header" id="ps-view-header"></div>
            <div class="ps-ver-bar" id="ps-ver-bar"></div>
            <div id="ps-table-area"></div>
        </div>

    </div>
    `;

    container.querySelector('#ps-add-prog-btn').addEventListener('click', () => openAddProgramModal(container));

    container.querySelectorAll('.ps-prog-card').forEach(card => {
        card.addEventListener('click', async () => {
            container.querySelectorAll('.ps-prog-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            _activeProg = _programs.find(p => String(p.program_id) === card.dataset.pid);
            _activeVer  = null;
            _versions   = [];
            if (_activeProg) {
                await loadVersionsAndSubjects(container);
            }
        });
    });

    await loadVersionsAndSubjects(container);
}

// ── Program card HTML ──────────────────────────────────────────────────────

function programCardHtml(p, active = false) {
    return `
    <button class="ps-prog-card ${active ? 'active' : ''}" data-pid="${p.program_id}">
        <span class="ps-card-code">${esc(p.program_code)}</span>
        <span class="ps-card-name">${esc(p.program_name)}</span>
    </button>`;
}

// ── Load versions then subjects ────────────────────────────────────────────

async function loadVersionsAndSubjects(container) {
    const area    = container.querySelector('#ps-table-area');
    const verBar  = container.querySelector('#ps-ver-bar');
    const hdrEl   = container.querySelector('#ps-view-header');

    if (!_activeProg) return;

    hdrEl.innerHTML = `
        <h3 class="ps-view-title">${esc(_activeProg.program_code)} — ${esc(_activeProg.program_name)}</h3>`;

    area.innerHTML = `<div class="ps-boot"><div class="ps-spin"></div></div>`;
    verBar.innerHTML = '';

    // Load versions
    const verRes = await Api.get(`/CurriculumAPI.php?action=list_versions&program_id=${_activeProg.program_id}`);
    _versions = verRes.success ? verRes.data : [];

    renderVersionBar(container);

    // Load subjects (filtered by active version if any)
    await reloadSubjects(container);
}

// ── Render version tabs bar ────────────────────────────────────────────────

function renderVersionBar(container) {
    const verBar = container.querySelector('#ps-ver-bar');

    const allBtn = `<button class="ps-ver-tab ${!_activeVer ? 'active' : ''}" data-vid="all">All Subjects</button>`;
    const verBtns = _versions.map(v => {
        const fileDot = v.file_name
            ? `<span class="ps-ver-file-dot" title="${esc(v.file_name)}">&#128196;</span>`
            : '';
        return `
        <span class="ps-ver-item">
            <button class="ps-ver-tab ${_activeVer?.version_id === v.version_id ? 'active' : ''}" data-vid="${v.version_id}">
                ${esc(v.version_label)} ${fileDot}
            </button>
            <button class="ps-ver-import" data-vid="${v.version_id}" title="Import subjects from file into this version">&#8679;</button>
            <button class="ps-ver-del" data-vid="${v.version_id}" title="Delete this version">&times;</button>
        </span>`;
    }).join('');

    verBar.innerHTML = `
        <div class="ps-ver-tabs">
            ${allBtn}
            ${verBtns}
            <button class="ps-ver-add-btn" id="ps-ver-add-btn">+ New Curriculum Version</button>
        </div>`;

    verBar.querySelector('#ps-ver-add-btn').addEventListener('click', () => openAddVersionModal(container));

    verBar.querySelectorAll('.ps-ver-tab').forEach(tab => {
        tab.addEventListener('click', async () => {
            verBar.querySelectorAll('.ps-ver-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            _activeVer = tab.dataset.vid === 'all'
                ? null
                : (_versions.find(v => String(v.version_id) === tab.dataset.vid) || null);
            await reloadSubjects(container);
        });
    });

    verBar.querySelectorAll('.ps-ver-del').forEach(btn => {
        btn.addEventListener('click', async () => {
            const ver = _versions.find(v => String(v.version_id) === btn.dataset.vid);
            if (!ver) return;
            if (!confirm(`Delete the version "${ver.version_label}"?\n\nThis only removes the version label and its file. Subjects already in the curriculum are not deleted.`)) return;

            btn.disabled = true;
            const r = await Api.post('/CurriculumAPI.php?action=delete_version', { version_id: ver.version_id });
            if (r.success) {
                _versions = _versions.filter(v => v.version_id !== ver.version_id);
                if (_activeVer?.version_id === ver.version_id) _activeVer = null;
                renderVersionBar(container);
                await reloadSubjects(container);
            } else {
                await notify.alert(r.message || 'Failed to delete version', { title: 'Delete Failed', type: 'error' });
                btn.disabled = false;
            }
        });
    });

    verBar.querySelectorAll('.ps-ver-import').forEach(btn => {
        btn.addEventListener('click', () => {
            const ver = _versions.find(v => String(v.version_id) === btn.dataset.vid);
            if (!ver) return;
            _activeVer = ver;
            renderVersionBar(container);
            openImportModal(container);
        });
    });
}

// ── Load subjects ──────────────────────────────────────────────────────────

async function reloadSubjects(container) {
    const area = container.querySelector('#ps-table-area');
    area.innerHTML = `<div class="ps-boot"><div class="ps-spin"></div></div>`;

    let url = `/CurriculumAPI.php?action=view&program_id=${_activeProg.program_id}`;
    if (_activeVer) url += `&version_id=${_activeVer.version_id}`;

    const res = await Api.get(url);
    _subjects = res.success ? res.data : [];
    renderChecklist(area, container);
}

// ── Render checklist table ─────────────────────────────────────────────────

function renderChecklist(area, container) {
    if (!_subjects.length) {
        const vMsg = _activeVer ? ` in the <strong>${esc(_activeVer.version_label)}</strong> curriculum` : '';
        area.innerHTML = `
        <div class="ps-empty">
            <svg width="40" height="40" fill="none" viewBox="0 0 24 24" stroke="#9CA3AF" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
            </svg>
            <p>No subjects${vMsg} yet.</p>
            <p class="ps-empty-hint">Upload a curriculum file above to add subjects — see the version tabs.</p>
        </div>`;
        return;
    }

    const byYear = {};
    _subjects.forEach(s => {
        const yr  = parseInt(s.year_level) || 0;
        const sem = parseInt(s.semester)   || 1;
        if (!byYear[yr]) byYear[yr] = { 1:[], 2:[], 3:[] };
        byYear[yr][sem] = byYear[yr][sem] || [];
        byYear[yr][sem].push(s);
    });

    const YEAR_LABELS = {0:'General',1:'First Year',2:'Second Year',3:'Third Year',4:'Fourth Year'};

    const blocks = Object.keys(byYear).filter(yr => parseInt(yr) > 0).sort((a,b)=>a-b).map(yr => {
        const sem1   = byYear[yr][1] || [];
        const sem2   = byYear[yr][2] || [];
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
                        <td class="cr-pre">${esc(L.pre_requisite || 'None')}</td>`
                      : `<td></td><td></td><td class="cr-num"></td><td class="cr-num"></td><td class="cr-num"></td><td></td>`}
                <td class="cr-divider"></td>
                ${R ? `<td class="cr-code">${esc(R.subject_code)}</td>
                        <td class="cr-title">${esc(R.subject_name)}</td>
                        <td class="cr-num">${R.lecture_hours ?? 0}</td>
                        <td class="cr-num">${R.lab_hours ?? 0}</td>
                        <td class="cr-num cr-bold">${R.units ?? 0}</td>
                        <td class="cr-pre">${esc(R.pre_requisite || 'None')}</td>`
                      : `<td></td><td></td><td class="cr-num"></td><td class="cr-num"></td><td class="cr-num"></td><td></td>`}
            </tr>`);
        }

        const sumL1 = s => sem => sem.reduce((n,x)=>n+(parseInt(x[s])||0),0);
        const tot1L  = sumL1('lecture_hours')(sem1), tot1B = sumL1('lab_hours')(sem1), tot1U = sumL1('units')(sem1);
        const tot2L  = sumL1('lecture_hours')(sem2), tot2B = sumL1('lab_hours')(sem2), tot2U = sumL1('units')(sem2);

        let summerHtml = '';
        if (summer.length) {
            const sumSL = summer.reduce((n,x)=>n+(parseInt(x.lecture_hours)||0),0);
            const sumSB = summer.reduce((n,x)=>n+(parseInt(x.lab_hours)||0),0);
            const sumSU = summer.reduce((n,x)=>n+(parseInt(x.units)||0),0);
            summerHtml = `
            <table class="cr-table cr-summer-table">
                <thead>
                    <tr><th colspan="6" class="cr-sem-hd">Summer</th></tr>
                    <tr>
                        <th rowspan="2" class="cr-th-code">Course Code</th>
                        <th rowspan="2" class="cr-th-title">Course Title</th>
                        <th colspan="3" class="cr-th-units">Units</th>
                        <th rowspan="2" class="cr-th-pre">Pre-requisite</th>
                    </tr>
                    <tr><th class="cr-th-num">Lec</th><th class="cr-th-num">Lab</th><th class="cr-th-num">Total</th></tr>
                </thead>
                <tbody>
                    ${summer.map(s=>`
                    <tr>
                        <td class="cr-code">${esc(s.subject_code)}</td>
                        <td class="cr-title">${esc(s.subject_name)}</td>
                        <td class="cr-num">${s.lecture_hours??0}</td>
                        <td class="cr-num">${s.lab_hours??0}</td>
                        <td class="cr-num cr-bold">${s.units??0}</td>
                        <td class="cr-pre">${esc(s.pre_requisite||'None')}</td>
                    </tr>`).join('')}
                </tbody>
                <tfoot>
                    <tr class="cr-total-row">
                        <td colspan="2" class="cr-total-lbl">TOTAL</td>
                        <td class="cr-num">${sumSL}</td><td class="cr-num">${sumSB}</td>
                        <td class="cr-num cr-bold">${sumSU}</td><td></td>
                    </tr>
                </tfoot>
            </table>`;
        }

        return `
        <div class="cr-year-block">
            <table class="cr-table">
                <thead>
                    <tr>
                        <th colspan="13" class="cr-year-hd">
                            <span>${YEAR_LABELS[yr] || `Year ${yr}`}</span>
                        </th>
                    </tr>
                    <tr>
                        <th colspan="6" class="cr-sem-hd">First Semester</th>
                        <td class="cr-divider-hd"></td>
                        <th colspan="6" class="cr-sem-hd">Second Semester</th>
                    </tr>
                    <tr>
                        <th rowspan="2" class="cr-th-code">Course Code</th>
                        <th rowspan="2" class="cr-th-title">Course Title</th>
                        <th colspan="3" class="cr-th-units">Units</th>
                        <th rowspan="2" class="cr-th-pre">Pre-requisite</th>
                        <td class="cr-divider-hd" rowspan="2"></td>
                        <th rowspan="2" class="cr-th-code">Course Code</th>
                        <th rowspan="2" class="cr-th-title">Course Title</th>
                        <th colspan="3" class="cr-th-units">Units</th>
                        <th rowspan="2" class="cr-th-pre">Pre-requisite</th>
                    </tr>
                    <tr>
                        <th class="cr-th-num">Lec</th><th class="cr-th-num">Lab</th><th class="cr-th-num">Total</th>
                        <th class="cr-th-num">Lec</th><th class="cr-th-num">Lab</th><th class="cr-th-num">Total</th>
                    </tr>
                </thead>
                <tbody>
                    ${bodyRows.join('') || `<tr>
                        <td colspan="6" class="cr-empty-cell">No subjects</td>
                        <td class="cr-divider"></td>
                        <td colspan="6" class="cr-empty-cell">No subjects</td>
                    </tr>`}
                </tbody>
                <tfoot>
                    <tr class="cr-total-row">
                        <td colspan="2" class="cr-total-lbl">TOTAL</td>
                        <td class="cr-num">${tot1L}</td><td class="cr-num">${tot1B}</td>
                        <td class="cr-num cr-bold">${tot1U}</td><td></td>
                        <td class="cr-divider"></td>
                        <td colspan="2" class="cr-total-lbl">TOTAL</td>
                        <td class="cr-num">${tot2L}</td><td class="cr-num">${tot2B}</td>
                        <td class="cr-num cr-bold">${tot2U}</td><td></td>
                    </tr>
                </tfoot>
            </table>
            ${summerHtml}
        </div>`;
    }).join('');

    area.innerHTML = `<div class="cr-wrap">${blocks}</div><div id="ps-elective-area"></div>`;

    loadElectives(null, area.querySelector('#ps-elective-area'));
}

// ── Elective Tracks ───────────────────────────────────────────────────────

async function loadElectives(_container, el) {
    if (!_activeProg) return;
    el.innerHTML = `<div class="ps-boot"><div class="ps-spin"></div></div>`;
    const res = await Api.get(`/ElectiveAPI.php?action=list&program_id=${_activeProg.program_id}`);
    renderElectives(el, res.success ? res.data : []);
}

function renderElectives(el, tracks) {
    const rows = tracks.map(t => {
        const chips = t.subjects.map(s => `
            <span class="el-chip">
                <span class="el-chip-code">${esc(s.subject_code)}</span>
                <span class="el-chip-name">${esc(s.subject_name)}</span>
                <button class="el-chip-remove" data-id="${s.id}" title="Remove">&#x2715;</button>
            </span>`).join('');
        return `<tr>
            <td class="el-td-track">
                <span class="el-track-label">${esc(t.track_name)}</span>
                <button class="el-del-track" data-track="${t.track_id}" title="Remove track">&#x2715;</button>
            </td>
            <td class="el-td-subjects">
                ${chips}
                <button class="el-add-subj-btn" data-track="${t.track_id}" data-name="${esc(t.track_name)}">+ Add Subject</button>
            </td>
        </tr>`;
    }).join('');

    el.innerHTML = `
    <div class="el-section">
        <div class="el-header">
            <div>
                <h3 class="el-title">Elective Tracks</h3>
                <p class="el-sub">${esc(_activeProg?.program_code || '')} elective specializations</p>
            </div>
            <button class="el-add-track-btn" id="el-add-track-btn">+ Add Track</button>
        </div>
        <div class="el-table-wrap">
            <table class="el-table">
                <thead>
                    <tr>
                        <th class="el-th" style="width:220px;">Track</th>
                        <th class="el-th" style="text-align:left;">Elective Subjects</th>
                    </tr>
                </thead>
                <tbody>${rows || `<tr><td colspan="2" class="el-none">No elective tracks yet.</td></tr>`}</tbody>
            </table>
        </div>
        <div class="el-add-form" id="el-add-form" style="display:none;">
            <input class="el-input" id="el-track-name" placeholder="Track name — e.g. Business Informatics" maxlength="120">
            <button class="el-save-btn" id="el-save-track">Save</button>
            <button class="el-cancel-btn" id="el-cancel-track">Cancel</button>
        </div>
    </div>`;

    bindElectiveEvents(el);
}

function bindElectiveEvents(el) {
    el.querySelector('#el-add-track-btn')?.addEventListener('click', () => {
        el.querySelector('#el-add-form').style.display = 'flex';
        el.querySelector('#el-track-name').focus();
    });
    el.querySelector('#el-cancel-track')?.addEventListener('click', () => {
        el.querySelector('#el-add-form').style.display = 'none';
        el.querySelector('#el-track-name').value = '';
    });
    el.querySelector('#el-save-track')?.addEventListener('click', async () => {
        const name = el.querySelector('#el-track-name').value.trim();
        if (!name) return;
        const res = await Api.post('/ElectiveAPI.php?action=add_track', {
            track_name: name, program_id: _activeProg.program_id, department_id: _activeProg.department_id,
        });
        if (res.success) await loadElectives(null, el);
        else await notify.alert(res.message || 'Failed to add track', { title: 'Add Failed', type: 'error' });
    });
    el.querySelectorAll('.el-del-track').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!confirm('Remove this elective track and all its subjects?')) return;
            await Api.post('/ElectiveAPI.php?action=delete_track', { track_id: parseInt(btn.dataset.track) });
            await loadElectives(null, el);
        });
    });
    el.querySelectorAll('.el-add-subj-btn').forEach(btn => {
        btn.addEventListener('click', () => openAddSubjectModal(el, parseInt(btn.dataset.track), btn.dataset.name));
    });
    el.querySelectorAll('.el-chip-remove').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!confirm('Remove this subject from the track?')) return;
            await Api.post('/ElectiveAPI.php?action=remove_subject', { id: parseInt(btn.dataset.id) });
            await loadElectives(null, el);
        });
    });
}

async function openAddSubjectModal(el, trackId, trackName) {
    const overlay = document.createElement('div');
    overlay.className = 'ps-backdrop';
    overlay.style.zIndex = '1100';
    overlay.innerHTML = `
    <div class="ps-modal" style="max-width:520px;">
        <div class="ps-modal-hdr">
            <h3>Add subject to <em>${esc(trackName)}</em></h3>
            <button class="ps-modal-close" id="el-modal-close">&times;</button>
        </div>
        <div class="ps-modal-body">
            <div class="ps-modal-msg" id="el-modal-msg" style="display:none;"></div>
            <input type="text" class="ps-modal-search" id="el-modal-search" placeholder="Search subjects…" autocomplete="off">
            <div class="ps-modal-list" id="el-modal-list"></div>
        </div>
    </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#el-modal-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    const listEl   = overlay.querySelector('#el-modal-list');
    const searchEl = overlay.querySelector('#el-modal-search');
    listEl.innerHTML = `<div class="ps-boot"><div class="ps-spin"></div></div>`;

    const res   = await Api.get('/CurriculumAPI.php?action=available&program_id=' + _activeProg.program_id);
    const avail = res.success ? res.data : [];

    function renderList(q) {
        const filtered = avail.filter(s => !q || (s.subject_code + ' ' + s.subject_name).toLowerCase().includes(q));
        if (!filtered.length) { listEl.innerHTML = `<div class="ps-modal-empty">No subjects found</div>`; return; }
        listEl.innerHTML = filtered.map(s => `
            <div class="ps-modal-item">
                <div class="ps-modal-item-info">
                    <span class="ps-code">${esc(s.subject_code)}</span>
                    <span class="ps-modal-item-name">${esc(s.subject_name)}</span>
                    <span class="ps-units">${s.units}u</span>
                </div>
                <button class="ps-modal-item-btn" data-sid="${s.subject_id}">Add</button>
            </div>`).join('');
        listEl.querySelectorAll('[data-sid]').forEach(btn => {
            btn.addEventListener('click', async () => {
                btn.disabled = true; btn.textContent = '…';
                const r = await Api.post('/ElectiveAPI.php?action=add_subject', {
                    track_id: trackId, subject_id: parseInt(btn.dataset.sid),
                });
                if (r.success) { overlay.remove(); await loadElectives(null, el); }
                else {
                    showMsg(overlay.querySelector('#el-modal-msg'), r.message || 'Failed', 'err');
                    btn.disabled = false; btn.textContent = 'Add';
                }
            });
        });
    }

    renderList('');
    searchEl.addEventListener('input', () => renderList(searchEl.value.toLowerCase()));
}

// ── Add Program modal ──────────────────────────────────────────────────────

function openAddProgramModal(container) {
    const bd = document.createElement('div');
    bd.className = 'ps-backdrop';
    bd.style.zIndex = '1100';
    bd.innerHTML = `
    <div class="ps-modal" style="max-width:480px;">
        <div class="ps-modal-hdr">
            <h3>Add New Program</h3>
            <button class="ps-modal-close" id="ap-close">&times;</button>
        </div>
        <div class="ps-modal-body">
            <div class="ps-modal-msg" id="ap-msg" style="display:none;"></div>
            <form class="am-form" id="ap-form" autocomplete="off">
                <div class="am-field">
                    <label class="am-label">Program Code</label>
                    <input class="am-input" id="ap-code" placeholder="e.g. BSIT, BSN, BSCPE" maxlength="20" style="text-transform:uppercase;">
                </div>
                <div class="am-field">
                    <label class="am-label">Program Name</label>
                    <input class="am-input" id="ap-name" placeholder="e.g. Bachelor of Science in Information Technology" maxlength="200">
                </div>
                <div class="am-actions">
                    <button type="button" class="am-cancel-btn" id="ap-cancel">Cancel</button>
                    <button type="submit" class="am-save-btn">Add Program</button>
                </div>
            </form>
        </div>
    </div>`;
    document.body.appendChild(bd);

    const close = () => bd.remove();
    bd.addEventListener('click', e => { if (e.target === bd) close(); });
    bd.querySelector('#ap-close').addEventListener('click', close);
    bd.querySelector('#ap-cancel').addEventListener('click', close);
    bd.querySelector('#ap-code').addEventListener('input', e => {
        e.target.value = e.target.value.toUpperCase();
    });

    const msgEl = bd.querySelector('#ap-msg');

    bd.querySelector('#ap-form').addEventListener('submit', async e => {
        e.preventDefault();
        const btn  = bd.querySelector('.am-save-btn');
        const code = bd.querySelector('#ap-code').value.trim().toUpperCase();
        const name = bd.querySelector('#ap-name').value.trim();
        if (!code || !name) { showMsg(msgEl, 'Both fields are required.', 'err'); return; }

        btn.disabled = true; btn.textContent = 'Adding…';

        const r = await Api.post('/CurriculumAPI.php?action=add_program', { program_code: code, program_name: name });
        if (r.success) {
            const newProg = { program_id: r.program_id, program_code: r.program_code, program_name: r.program_name, department_id: r.department_id };
            _programs.push(newProg);

            // Add card to grid
            const grid = container.querySelector('#ps-prog-grid');
            if (grid) {
                grid.insertAdjacentHTML('beforeend', programCardHtml(newProg, false));
                grid.querySelectorAll('.ps-prog-card').forEach(card => {
                    card.addEventListener('click', async () => {
                        container.querySelectorAll('.ps-prog-card').forEach(c => c.classList.remove('active'));
                        card.classList.add('active');
                        _activeProg = _programs.find(p => String(p.program_id) === card.dataset.pid);
                        _activeVer  = null; _versions = [];
                        if (_activeProg) await loadVersionsAndSubjects(container);
                    });
                });
            }

            close();
        } else {
            showMsg(msgEl, r.message || 'Failed to add program', 'err');
            btn.disabled = false; btn.textContent = 'Add Program';
        }
    });

    setTimeout(() => bd.querySelector('#ap-code')?.focus(), 60);
}

// ── Add Curriculum Version modal ───────────────────────────────────────────

function openAddVersionModal(container) {
    const bd = document.createElement('div');
    bd.className = 'ps-backdrop';
    bd.style.zIndex = '1100';
    bd.innerHTML = `
    <div class="ps-modal" style="max-width:540px;">
        <div class="ps-modal-hdr">
            <h3>New Curriculum Version — <em>${esc(_activeProg?.program_code || '')}</em></h3>
            <button class="ps-modal-close" id="av-close">&times;</button>
        </div>
        <div class="ps-modal-body">
            <div class="ps-modal-msg" id="av-msg" style="display:none;"></div>
            <form class="am-form" id="av-form" autocomplete="off">
                <div class="am-field">
                    <label class="am-label">Version Label</label>
                    <input class="am-input" id="av-label" placeholder="e.g. 2018-2019, CMO No. 25 s. 2023" maxlength="120">
                </div>
                <div class="am-field">
                    <label class="am-label">Description <span style="font-weight:400;color:#9AA0A6">(optional)</span></label>
                    <textarea class="am-input am-textarea" id="av-desc" rows="2"
                        placeholder="e.g. CHED Memorandum Order No. 25 series 2023 revised curriculum"></textarea>
                </div>
                <div class="am-field">
                    <label class="am-label" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                        Curriculum Document
                        <span style="font-weight:400;color:#9AA0A6;font-size:12px;">(optional)</span>
                        <button type="button" class="av-tpl-btn" id="av-tpl-btn">Download blank template</button>
                    </label>
                    <p style="font-size:11px;color:#6B7280;margin:0 0 8px;">
                        Upload your existing CHED curriculum Excel file, or download the blank template to fill in. PDF is also accepted.
                    </p>
                    <div class="av-drop-zone" id="av-drop">
                        <input type="file" id="av-file" accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.csv,.xls,.xlsx,.doc,.docx" style="display:none;">
                        <div class="av-drop-icon">📄</div>
                        <p class="av-drop-hint">Drag & drop or <button type="button" class="av-browse-btn" id="av-browse">click to browse</button></p>
                        <p class="av-drop-types">CSV / Excel (.xlsx) for easy import &middot; PDF also accepted &middot; max 20 MB</p>
                    </div>
                    <div class="av-file-info" id="av-file-info" style="display:none;"></div>
                </div>
                <div class="am-actions">
                    <button type="button" class="am-cancel-btn" id="av-cancel">Cancel</button>
                    <button type="submit" class="am-save-btn">Save Version</button>
                </div>
            </form>
        </div>
    </div>`;
    document.body.appendChild(bd);

    const close = () => bd.remove();
    bd.addEventListener('click', e => { if (e.target === bd) close(); });
    bd.querySelector('#av-close').addEventListener('click', close);
    bd.querySelector('#av-cancel').addEventListener('click', close);

    const dropZone = bd.querySelector('#av-drop');
    const fileInput = bd.querySelector('#av-file');
    const fileInfo  = bd.querySelector('#av-file-info');
    let pickedFile  = null;

    bd.querySelector('#av-browse').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => { if (fileInput.files[0]) setFile(fileInput.files[0]); });
    ['dragenter','dragover'].forEach(ev => dropZone.addEventListener(ev, e => { e.preventDefault(); dropZone.classList.add('drag-over'); }));
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', e => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
    });

    function setFile(f) {
        pickedFile = f;
        dropZone.style.display = 'none';
        fileInfo.style.display = 'flex';
        fileInfo.innerHTML = `
            <span class="av-fi-icon">${fileTypeIcon(f.name)}</span>
            <span class="av-fi-name">${esc(f.name)}</span>
            <button type="button" class="av-fi-remove" id="av-fi-remove">✕</button>`;
        fileInfo.querySelector('#av-fi-remove').addEventListener('click', () => {
            pickedFile = null;
            fileInput.value = '';
            fileInfo.style.display = 'none';
            dropZone.style.display = '';
        });
    }

    const msgEl = bd.querySelector('#av-msg');

    bd.querySelector('#av-form').addEventListener('submit', async e => {
        e.preventDefault();
        const btn   = bd.querySelector('.am-save-btn');
        const label = bd.querySelector('#av-label').value.trim();
        const desc  = bd.querySelector('#av-desc').value.trim();
        if (!label) { showMsg(msgEl, 'Version label is required.', 'err'); return; }

        btn.disabled = true; btn.textContent = 'Saving…';

        const r = await Api.post('/CurriculumAPI.php?action=add_version', {
            program_id: _activeProg.program_id, version_label: label, description: desc,
        });
        if (!r.success) {
            showMsg(msgEl, r.message || 'Failed to add version', 'err');
            btn.disabled = false; btn.textContent = 'Save Version';
            return;
        }

        const newVer = { version_id: r.version_id, program_id: _activeProg.program_id,
                         version_label: label, description: desc, file_name: null, file_type: null };

        // Upload file if picked
        if (pickedFile) {
            btn.textContent = 'Uploading...';
            const fd = new FormData();
            fd.append('version_id', r.version_id);
            fd.append('file', pickedFile);
            const up = await Api.postForm('/CurriculumAPI.php?action=upload_version_file', fd);
            if (up.success) {
                newVer.file_name = up.file_name;
                newVer.file_type = up.file_type;
                newVer.file_path = up.file_path;
            }
        }

        _versions.push(newVer);
        _activeVer = newVer;
        renderVersionBar(container);
        close();

        // If an importable file was uploaded, open the import modal automatically
        const isImportUpload = pickedFile && /\.(pdf|csv|xlsx|xls)$/i.test(pickedFile.name);
        if (isImportUpload) {
            openImportModal(container, { preloadFile: pickedFile });
        } else {
            await reloadSubjects(container);
        }
    });

    setTimeout(() => bd.querySelector('#av-label')?.focus(), 60);
    bd.querySelector('#av-tpl-btn').addEventListener('click', () => downloadCurriculumTemplate().catch(e => notify.alert('Could not generate template: ' + e.message, { title: 'Template Error', type: 'error' })));
}

// ── Curriculum template download (CHED two-column XLSX format) ────────────

async function downloadCurriculumTemplate() {
    await loadSheetJS();

    const progCode = _activeProg?.program_code || 'PROGRAM';
    const YEARS    = ['FIRST','SECOND','THIRD','FOURTH'];
    const data     = [];
    const merges   = [];

    // Program name header
    data.push([`${progCode} Curriculum`, ...Array(12).fill('')]);
    merges.push({ s:{r:0,c:0}, e:{r:0,c:12} });

    let row = 1;

    for (let y = 0; y < 4; y++) {
        // ── Year header ──────────────────────────────────────────────────
        data.push([`${YEARS[y]} YEAR`, ...Array(12).fill('')]);
        merges.push({ s:{r:row,c:0}, e:{r:row,c:12} });
        row++;

        // ── First + Second Semester header ───────────────────────────────
        data.push(['FIRST SEMESTER','','','','','','','SECOND SEMESTER','','','','','']);
        merges.push({ s:{r:row,c:0}, e:{r:row,c:5} });
        merges.push({ s:{r:row,c:7}, e:{r:row,c:12} });
        row++;

        // ── Column label row 1 ───────────────────────────────────────────
        data.push(['Course Code','Course Title','Units','','','Pre-requisite','','Course Code','Course Title','Units','','','Pre-requisite']);
        merges.push({ s:{r:row,c:0}, e:{r:row+1,c:0} }); // Course Code spans 2 rows
        merges.push({ s:{r:row,c:1}, e:{r:row+1,c:1} }); // Course Title spans 2 rows
        merges.push({ s:{r:row,c:2}, e:{r:row,  c:4} }); // Units spans 3 cols
        merges.push({ s:{r:row,c:5}, e:{r:row+1,c:5} }); // Pre-req spans 2 rows
        merges.push({ s:{r:row,c:7}, e:{r:row+1,c:7} });
        merges.push({ s:{r:row,c:8}, e:{r:row+1,c:8} });
        merges.push({ s:{r:row,c:9}, e:{r:row,  c:11} });
        merges.push({ s:{r:row,c:12},e:{r:row+1,c:12} });
        row++;

        // ── Sub-header row (Lec / Lab / Total) ──────────────────────────
        data.push(['','','Lec','Lab','Total','','','','','Lec','Lab','Total','']);
        row++;

        // ── 8 empty subject rows ─────────────────────────────────────────
        for (let i = 0; i < 8; i++) {
            data.push(['','','','','','','','','','','','','']);
            row++;
        }

        // ── Summer ───────────────────────────────────────────────────────
        data.push(['SUMMER','','','','','','','','','','','','']);
        merges.push({ s:{r:row,c:0}, e:{r:row,c:5} });
        row++;

        data.push(['Course Code','Course Title','Units','','','Pre-requisite','','','','','','','']);
        merges.push({ s:{r:row,c:0}, e:{r:row+1,c:0} });
        merges.push({ s:{r:row,c:1}, e:{r:row+1,c:1} });
        merges.push({ s:{r:row,c:2}, e:{r:row,  c:4} });
        merges.push({ s:{r:row,c:5}, e:{r:row+1,c:5} });
        row++;

        data.push(['','','Lec','Lab','Total','','','','','','','','']);
        row++;

        for (let i = 0; i < 3; i++) {
            data.push(['','','','','','','','','','','','','']);
            row++;
        }

        // gap between years
        data.push(Array(13).fill(''));
        row++;
    }

    const ws = window.XLSX.utils.aoa_to_sheet(data);
    ws['!merges'] = merges;
    ws['!cols']   = [
        {wch:13},{wch:38},{wch:6},{wch:6},{wch:6},{wch:16},{wch:3},
        {wch:13},{wch:38},{wch:6},{wch:6},{wch:6},{wch:16},
    ];

    const wb2 = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb2, ws, 'Curriculum');
    window.XLSX.writeFile(wb2, `curriculum_template_${progCode}.xlsx`);
}

// ── CSV parser ─────────────────────────────────────────────────────────────

function parseCSVLine(line) {
    const result = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
            else inQ = !inQ;
        } else if (ch === ',' && !inQ) {
            result.push(cur); cur = '';
        } else {
            cur += ch;
        }
    }
    result.push(cur);
    return result;
}

function parseCsvToSubjects(text) {
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    const subjects = [];
    let dataStart = 0;
    for (let i = 0; i < Math.min(lines.length, 4); i++) {
        if (/subject\s*code|course\s*code/i.test(lines[i])) { dataStart = i + 1; break; }
    }
    for (let i = dataStart; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i]).map(c => c.trim());
        const code = cols[0]?.toUpperCase();
        const name = cols[1];
        if (!code || !name || /^subject\s*code|^course\s*code/i.test(code)) continue;
        const lec    = parseInt(cols[2]) || 0;
        const lab    = parseInt(cols[3]) || 0;
        const units  = parseInt(cols[4]) || (lec + lab || 3);
        const year   = parseInt(cols[5]) || null;
        const sem    = parseInt(cols[6]) || 1;
        const prereq = (cols[7] || '').replace(/^none$/i, '').trim();
        if (code && name) subjects.push({ code, name, lec, lab, units, year, sem, prereq });
    }
    return subjects;
}

// ── SheetJS (xlsx/xls) ─────────────────────────────────────────────────────

let _sheetJsLoaded = false;

async function loadSheetJS() {
    if (_sheetJsLoaded || window.XLSX) { _sheetJsLoaded = true; return; }
    await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
        s.onload  = () => { _sheetJsLoaded = true; res(); };
        s.onerror = () => rej(new Error('Failed to load the Excel parser. Check your internet connection.'));
        document.head.appendChild(s);
    });
}

async function parseXlsxToSubjects(file, onProgress) {
    await loadSheetJS();
    if (onProgress) onProgress('Parsing Excel file...');
    const buf  = await file.arrayBuffer();
    const wb   = window.XLSX.read(buf, { type: 'array' });
    const ws   = wb.Sheets[wb.SheetNames[0]];
    const rows = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    // Auto-detect CHED two-column format (has year/semester row headers)
    const isChed = rows.slice(0, 20).some(r => {
        const cells = r.map(c => String(c).trim());
        return cells.some(c => /^(FIRST|SECOND|THIRD|FOURTH)\s+YEAR$/i.test(c))
            || (cells.some(c => /FIRST\s*SEMESTER/i.test(c)) && cells.some(c => /SECOND\s*SEMESTER/i.test(c)));
    });

    if (isChed) {
        if (onProgress) onProgress('Reading CHED curriculum format...');
        return { subjects: parseChedExcelRows(rows), isChed: true };
    }

    // Flat template format (Subject Code | Subject Name | Lec | Lab | Units | Year | Sem | Prereq)
    const subjects = [];
    let dataStart = 0;
    for (let i = 0; i < Math.min(rows.length, 4); i++) {
        if (rows[i].some(c => /subject\s*code|course\s*code/i.test(String(c)))) {
            dataStart = i + 1; break;
        }
    }
    for (let i = dataStart; i < rows.length; i++) {
        const cols = rows[i].map(c => String(c ?? '').trim());
        const code = cols[0]?.toUpperCase();
        const name = cols[1];
        if (!code || !name || /^(subject|course)\s*code/i.test(code)) continue;
        const lec    = parseInt(cols[2]) || 0;
        const lab    = parseInt(cols[3]) || 0;
        const units  = parseInt(cols[4]) || (lec + lab || 3);
        const year   = parseInt(cols[5]) || null;
        const sem    = parseInt(cols[6]) || 1;
        const prereq = (cols[7] || '').replace(/^none$/i, '').trim();
        subjects.push({ code, name, lec, lab, units, year, sem, prereq });
    }
    return { subjects, isChed: false };
}

// Parse the standard CHED two-column curriculum Excel layout:
// Year header row → FIRST SEMESTER (left cols) | SECOND SEMESTER (right cols) → data rows
function parseChedExcelRows(rows) {
    const subjects  = [];
    const YEAR_MAP  = { first:1, second:2, third:3, fourth:4, '1st':1, '2nd':2, '3rd':3, '4th':4 };
    // Tolerant of "CRIM 101", "CRIM101", "CRIM-101" — real-world sheets rarely
    // use a consistent separator (or any separator at all) between the prefix and number.
    const CODE_RE   = /^[A-Z]{2,10}[\s-]*\d{1,4}[A-Z]?$/;
    const SKIP_CELL = /^(course\s*code|subject\s*code|course\s*title|subject\s*title|lec|lab|total|units|pre.?req|semester|year|hrs|hours|summer|first|second|third|fourth)$/i;

    let curYear    = null;
    let isSummer   = false;
    let rightStart = -1; // column where the 2nd-semester section begins

    // Detect rightStart from the row that contains both "FIRST SEMESTER" and "SECOND SEMESTER"
    for (const r of rows.slice(0, 25)) {
        const cells = r.map(c => String(c ?? '').trim());
        const idx   = cells.findIndex(c => /second\s*semester|2nd\s*semester/i.test(c));
        if (idx > 0) { rightStart = idx; break; }
        // Fallback: two "Course Code" occurrences in same header row
        const ccIdx = cells.map((c,i) => /course\s*code|subject\s*code/i.test(c) ? i : -1).filter(i => i >= 0);
        if (ccIdx.length >= 2) { rightStart = ccIdx[1]; break; }
    }
    if (rightStart < 0) rightStart = 7; // safe default

    function extractSubject(cells, col, year, sem) {
        const code = String(cells[col] ?? '').trim().toUpperCase();
        const name = String(cells[col + 1] ?? '').trim();
        if (!code || !name || !CODE_RE.test(code) || SKIP_CELL.test(name)) return null;
        const lec    = parseInt(cells[col + 2]) || 0;
        const lab    = parseInt(cells[col + 3]) || 0;
        const units  = parseInt(cells[col + 4]) || (lec + lab || 3);
        const prereq = String(cells[col + 5] ?? '').replace(/^none$/i, '').trim();
        return { code, name, lec, lab, units, year, sem, prereq };
    }

    for (const row of rows) {
        const cells  = row.map(c => String(c ?? '').trim());
        const joined = cells.join(' ');

        // Year header
        const yrM = joined.match(/\b(first|second|third|fourth|1st|2nd|3rd|4th)\s+year\b/i);
        if (yrM) { curYear = YEAR_MAP[yrM[1].toLowerCase()] ?? null; isSummer = false; continue; }

        // Summer section header
        if (/\bsummer\b/i.test(joined) && !yrM) { isSummer = true; continue; }

        // Skip header/label rows (any cell matches a known header keyword)
        if (cells.some(c => SKIP_CELL.test(c))) continue;
        if (!cells.some(c => c.length > 0)) continue; // blank row

        // Left column → 1st semester (or summer)
        const left = extractSubject(cells, 0, curYear, isSummer ? 3 : 1);
        if (left) subjects.push(left);

        // Right column → 2nd semester (not applicable during summer)
        if (!isSummer) {
            const right = extractSubject(cells, rightStart, curYear, 2);
            if (right) subjects.push(right);
        }
    }

    return subjects;
}

// ── Import Modal (CSV / Excel / PDF) ──────────────────────────────────────

async function openImportModal(container, opts = {}) {
    const bd = document.createElement('div');
    bd.className = 'ps-backdrop';
    bd.style.zIndex = '1200';
    bd.innerHTML = `
    <div class="ps-modal pim-modal">
        <div class="ps-modal-hdr">
            <h3>Import Curriculum &mdash; ${esc(_activeProg?.program_code || '')}${_activeVer ? ' &rsaquo; ' + esc(_activeVer.version_label) : ''}</h3>
            <button class="ps-modal-close" id="pim-close">&times;</button>
        </div>
        <div class="ps-modal-body">
            <div class="ps-modal-msg" id="pim-msg" style="display:none;"></div>

            <div id="pim-step1">
                <div class="pim-tpl-row">
                    <span class="pim-tpl-lbl">Tip:</span>
                    <span class="pim-tpl-sep">Upload your existing CHED curriculum Excel file directly &mdash; the standard two-column format is supported.</span>
                </div>
                <div class="pim-tpl-row" style="margin-top:-6px;">
                    <span class="pim-tpl-lbl">No file yet?</span>
                    <button type="button" class="pim-tpl-btn" id="pim-tpl-btn">Download blank template</button>
                    <span class="pim-tpl-sep">&mdash; fill it in Excel, then upload below.</span>
                </div>
                <div class="av-drop-zone" id="pim-drop">
                    <input type="file" id="pim-file" accept=".csv,.xlsx,.xls,.pdf" style="display:none;">
                    <div class="av-drop-icon" style="font-size:28px;margin-bottom:6px;">&#128196;</div>
                    <p class="av-drop-hint">Drag and drop a file or <button type="button" class="av-browse-btn" id="pim-browse">click to browse</button></p>
                    <p class="av-drop-types">Excel (.xlsx) &middot; CSV &middot; PDF &mdash; max 20 MB</p>
                </div>
                <div id="pim-progress" style="display:none;text-align:center;padding:28px 0;color:#6B7280;">
                    <div class="ps-spin" style="margin:0 auto 12px;"></div>
                    <span id="pim-progress-text">Reading PDF...</span>
                </div>
            </div>

            <div id="pim-step2" style="display:none;">
                <div class="pim-preview-hdr">
                    <div>
                        <p class="pim-found-lbl" id="pim-found-lbl"></p>
                        <p class="pim-found-sub">Review and edit below. Uncheck rows to skip.</p>
                    </div>
                    <div class="pim-btns">
                        <button class="am-cancel-btn" id="pim-back">Change File</button>
                        <button class="am-save-btn" id="pim-import-btn">Import Checked</button>
                    </div>
                </div>
                <div id="pim-tbl-wrap"></div>
                <p id="pim-import-result" style="display:none;font-size:13px;font-weight:600;color:#00461B;margin-top:10px;"></p>
            </div>
        </div>
    </div>`;
    document.body.appendChild(bd);

    const close   = () => bd.remove();
    const msgEl   = bd.querySelector('#pim-msg');
    const step1   = bd.querySelector('#pim-step1');
    const step2   = bd.querySelector('#pim-step2');
    const progEl  = bd.querySelector('#pim-progress');
    const dropEl  = bd.querySelector('#pim-drop');
    const fileInp = bd.querySelector('#pim-file');

    bd.addEventListener('click', e => { if (e.target === bd) close(); });
    bd.querySelector('#pim-close').addEventListener('click', close);
    bd.querySelector('#pim-browse').addEventListener('click', () => fileInp.click());
    fileInp.addEventListener('change', () => { if (fileInp.files[0]) processFile(fileInp.files[0]); });

    ['dragenter','dragover'].forEach(ev => dropEl.addEventListener(ev, e => { e.preventDefault(); dropEl.classList.add('drag-over'); }));
    dropEl.addEventListener('dragleave', () => dropEl.classList.remove('drag-over'));
    dropEl.addEventListener('drop', e => {
        e.preventDefault(); dropEl.classList.remove('drag-over');
        if (e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]);
    });

    bd.querySelector('#pim-back').addEventListener('click', () => {
        step2.style.display = 'none';
        step1.style.display = '';
        fileInp.value = '';
        msgEl.style.display = 'none';
        dropEl.style.display = '';
        progEl.style.display = 'none';
    });

    bd.querySelector('#pim-tpl-btn').addEventListener('click', () => downloadCurriculumTemplate().catch(e => notify.alert('Could not generate template: ' + e.message, { title: 'Template Error', type: 'error' })));

    const setProgress = msg => {
        const el = bd.querySelector('#pim-progress-text');
        if (el) el.textContent = msg;
    };

    async function processFile(file) {
        dropEl.style.display = 'none';
        progEl.style.display = '';
        msgEl.style.display  = 'none';

        try {
            const ext = file.name.split('.').pop().toLowerCase();
            let subjects = [];
            let isChed = false;

            if (ext === 'pdf') {
                await loadPdfJs();
                setProgress('Reading PDF...');
                const text = await extractPdfText(file, setProgress);
                setProgress('Parsing subjects...');
                subjects = parseCurriculumText(text);
            } else if (ext === 'csv') {
                setProgress('Reading CSV...');
                const text = await file.text();
                subjects = parseCsvToSubjects(text);
            } else if (ext === 'xlsx' || ext === 'xls') {
                setProgress('Loading Excel parser...');
                ({ subjects, isChed } = await parseXlsxToSubjects(file, setProgress));
            } else {
                throw new Error('Unsupported file type. Please upload a CSV, Excel (.xlsx), or PDF file.');
            }

            progEl.style.display = 'none';

            if (!subjects.length) {
                dropEl.style.display = '';
                let hint;
                if (ext === 'pdf') {
                    hint = 'No subjects detected. The PDF may use an unusual layout — try the CSV/Excel template instead.';
                } else if (isChed) {
                    hint = 'No subjects found. Detected the CHED two-column layout, but no rows under "Course Code / Course Title" matched a code like "CRIM 101". Check that the code and title columns are filled in on the same row.';
                } else {
                    hint = 'No subjects found. Make sure the file uses the template column order (Subject Code, Subject Name, Lec, Lab, Units, Year, Semester, Pre-req).';
                }
                showMsg(msgEl, hint, 'err');
                return;
            }

            step1.style.display = 'none';
            step2.style.display = '';
            bd.querySelector('#pim-found-lbl').textContent = `Found ${subjects.length} subject(s) — review before importing`;
            renderPreview(subjects);
        } catch (err) {
            progEl.style.display = 'none';
            dropEl.style.display = '';
            showMsg(msgEl, 'Error reading file: ' + (err.message || 'Unknown error'), 'err');
        }
    }

    function renderPreview(subjects) {
        const wrap = bd.querySelector('#pim-tbl-wrap');
        const yOpts = v => [['','--'],['1','Year 1'],['2','Year 2'],['3','Year 3'],['4','Year 4']]
            .map(([val,lbl]) => `<option value="${val}"${String(v ?? '')===val?' selected':''}>${lbl}</option>`).join('');
        const sOpts = v => [['1','1st Sem'],['2','2nd Sem'],['3','Summer']]
            .map(([val,lbl]) => `<option value="${val}"${String(v ?? 1)===val?' selected':''}>${lbl}</option>`).join('');

        wrap.innerHTML = `
        <table class="pim-tbl">
            <thead><tr>
                <th><input type="checkbox" id="pim-chk-all" checked title="Select all"></th>
                <th>Code</th><th>Subject Name</th><th>Lec</th><th>Lab</th><th>Units</th><th>Year</th><th>Sem</th><th>Pre-req</th>
            </tr></thead>
            <tbody>
            ${subjects.map((s, i) => `
            <tr data-idx="${i}">
                <td style="text-align:center;"><input type="checkbox" class="pim-row-chk" checked></td>
                <td><input class="pim-cell" data-f="code" value="${esc(s.code)}" maxlength="30" style="width:76px;"></td>
                <td><input class="pim-cell" data-f="name" value="${esc(s.name)}" maxlength="150" style="width:190px;"></td>
                <td><input class="pim-cell pim-num" data-f="lec"   type="number" value="${s.lec}"   min="0" max="10" style="width:40px;"></td>
                <td><input class="pim-cell pim-num" data-f="lab"   type="number" value="${s.lab}"   min="0" max="10" style="width:40px;"></td>
                <td><input class="pim-cell pim-num" data-f="units" type="number" value="${s.units}" min="0" max="20" style="width:44px;"></td>
                <td><select class="pim-cell" data-f="year"   style="width:70px;">${yOpts(s.year)}</select></td>
                <td><select class="pim-cell" data-f="sem"    style="width:80px;">${sOpts(s.sem)}</select></td>
                <td><input class="pim-cell" data-f="prereq" value="${esc(s.prereq)}" maxlength="50" style="width:70px;"></td>
            </tr>`).join('')}
            </tbody>
        </table>`;

        wrap.querySelector('#pim-chk-all').addEventListener('change', e =>
            wrap.querySelectorAll('.pim-row-chk').forEach(cb => cb.checked = e.target.checked));
    }

    bd.querySelector('#pim-import-btn').addEventListener('click', async () => {
        const wrap = bd.querySelector('#pim-tbl-wrap');
        if (!wrap) return;
        const toImport = [];

        wrap.querySelectorAll('tbody tr').forEach(row => {
            if (!row.querySelector('.pim-row-chk').checked) return;
            const get = f => row.querySelector(`[data-f="${f}"]`).value.trim();
            const code = get('code'), name = get('name');
            if (!code || !name) return;
            toImport.push({
                code, name,
                lec:    parseInt(get('lec'))   || 0,
                lab:    parseInt(get('lab'))   || 0,
                units:  parseInt(get('units')) || 3,
                year:   parseInt(get('year'))  || null,
                sem:    parseInt(get('sem'))   || 1,
                prereq: get('prereq'),
            });
        });

        if (!toImport.length) { showMsg(msgEl, 'No subjects selected to import.', 'err'); return; }

        const btn = bd.querySelector('#pim-import-btn');
        btn.disabled = true; btn.textContent = 'Importing...';

        const r = await Api.post('/CurriculumAPI.php?action=import_pdf_curriculum', {
            program_id: _activeProg.program_id,
            version_id: _activeVer?.version_id || null,
            subjects:   toImport,
        });

        if (r.success) {
            const res = bd.querySelector('#pim-import-result');
            res.textContent = r.message;
            res.style.display = '';
            btn.textContent = 'Done';
            setTimeout(async () => { close(); await reloadSubjects(container); }, 1400);
        } else {
            showMsg(msgEl, r.message || 'Import failed', 'err');
            btn.disabled = false; btn.textContent = 'Import Checked';
        }
    });

    // If called with a preloaded file (from New Curriculum Version modal), auto-process it
    if (opts.preloadFile) {
        processFile(opts.preloadFile);
    }
}

// ── PDF.js + Tesseract helpers ─────────────────────────────────────────────

let _pdfJsLoaded = false;
let _tessLoaded  = false;

function loadPdfJs() {
    if (_pdfJsLoaded || window.pdfjsLib) { _pdfJsLoaded = true; return Promise.resolve(); }
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
        s.onload = () => {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc =
                'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            _pdfJsLoaded = true;
            resolve();
        };
        s.onerror = () => reject(new Error('Failed to load PDF.js. Check internet connection.'));
        document.head.appendChild(s);
    });
}

function loadTesseract() {
    if (_tessLoaded || window.Tesseract) { _tessLoaded = true; return Promise.resolve(); }
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
        s.onload = () => { _tessLoaded = true; resolve(); };
        s.onerror = () => reject(new Error('Failed to load OCR library. Check internet connection.'));
        document.head.appendChild(s);
    });
}

async function extractPdfText(file, onProgress) {
    const buf = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
    let full = '';
    let tessWorker = null;

    const buildLine = items => {
        if (!items.length) return '';
        const sorted = items.sort((a, b) => a.x - b.x);
        let line = '', prevEnd = null;
        sorted.forEach(it => {
            if (prevEnd !== null) {
                const gap = it.x - prevEnd;
                line += gap > 12 ? '\t' : gap > 1 ? ' ' : '';
            }
            line += it.t;
            prevEnd = it.x + it.w;
        });
        return line.trim();
    };

    for (let p = 1; p <= pdf.numPages; p++) {
        if (onProgress) onProgress(`Reading page ${p} of ${pdf.numPages}...`);
        const page     = await pdf.getPage(p);
        const viewport = page.getViewport({ scale: 1 });
        const content  = await page.getTextContent();
        const items    = content.items.filter(i => i.str.trim());

        if (items.length < 5) {
            // Scanned page — use OCR
            if (!tessWorker) {
                if (onProgress) onProgress('Scanned PDF detected. Loading OCR engine...');
                await loadTesseract();
                tessWorker = await Tesseract.createWorker('eng', 1, {
                    logger: m => {
                        if (!onProgress) return;
                        if (m.status === 'loading language traineddata') onProgress('Downloading OCR data (first time only)...');
                        if (m.status === 'recognizing text') onProgress(`OCR: ${Math.round((m.progress || 0) * 100)}%`);
                    },
                });
            }
            if (onProgress) onProgress(`Scanning page ${p} of ${pdf.numPages}...`);
            const vs = page.getViewport({ scale: 2 });
            const cv = document.createElement('canvas');
            cv.width  = Math.round(vs.width);
            cv.height = Math.round(vs.height);
            await page.render({ canvasContext: cv.getContext('2d'), viewport: vs }).promise;
            const { data: { text } } = await tessWorker.recognize(cv);
            full += text + '\n\n';
        } else {
            // Text-based page — split by page midpoint to handle two-column layout
            // IMPORTANT: emit ALL left-column lines first, then ALL right-column lines.
            // Interleaving by Y row causes year/semester context to be overwritten prematurely.
            const midX   = viewport.width / 2;
            const rowMap = {};

            items.forEach(item => {
                const y = Math.round(item.transform[5] / 5) * 5;
                if (!rowMap[y]) rowMap[y] = { L: [], R: [] };
                const x = item.transform[4];
                const w = item.width > 0 ? item.width : item.str.length * 5;
                rowMap[y][x < midX ? 'L' : 'R'].push({ x, t: item.str, w });
            });

            const leftLines  = [];
            const rightLines = [];
            Object.keys(rowMap).map(Number).sort((a, b) => b - a).forEach(y => {
                const lLine = buildLine(rowMap[y].L);
                const rLine = buildLine(rowMap[y].R);
                if (lLine) leftLines.push(lLine);
                if (rLine) rightLines.push(rLine);
            });

            // Left column first — parser reads First Semester subjects correctly,
            // then Right column — parser reads Second Semester subjects with curYear intact
            leftLines.forEach(l => { full += l + '\n'; });
            rightLines.forEach(l => { full += l + '\n'; });
            full += '\n';
        }
    }

    if (tessWorker) await tessWorker.terminate();
    return full;
}

// ── Curriculum text parser ─────────────────────────────────────────────────

const SKIP_RE = /^(course\s*code|subject\s*title|course\s*title|description|lec|lab|unit|total|sub.?total|pre.?req|hrs|hours|semester|effective|based|cagayan|bachelor|master|doctor)/i;

// Parse one subject row that arrived without tab separators (OCR or dense text)
function tryParseLine(line, curYear, curSem) {
    // Pattern: CODE digits  name...  lec  lab  units  [prereq]
    const m = line.match(/^([A-Z]{2,6})\s+(\d{1,4}[A-Z]?)\s+(.+?)\s+(\d+)\s+(\d+)\s+(\d+)(?:\s+(.+))?$/);
    if (m) {
        const name = m[3].trim(), lec = +m[4], lab = +m[5], units = +m[6];
        const prereq = (m[7] || '').replace(/^none$/i, '').trim();
        if (!SKIP_RE.test(name) && units >= 0 && units <= 20)
            return { code: `${m[1]} ${m[2]}`, name, lec, lab, units, year: curYear, sem: curSem ?? 1, prereq };
    }
    // Pattern: CODE digits  name...  units  (no lec/lab columns)
    const m2 = line.match(/^([A-Z]{2,6})\s+(\d{1,4}[A-Z]?)\s+(.+?)\s+(\d+)$/);
    if (m2 && curYear) {
        const name = m2[3].trim(), units = +m2[4];
        if (!SKIP_RE.test(name) && units >= 0 && units <= 20)
            return { code: `${m2[1]} ${m2[2]}`, name, lec: units, lab: 0, units, year: curYear, sem: curSem ?? 1, prereq: '' };
    }
    return null;
}

function parseCurriculumText(text) {
    const subjects = [];
    const lines    = text.split('\n').map(l => l.trim()).filter(Boolean);
    let curYear = null, curSem = null;

    const YEAR_MAP = { first:1,'1st':1, second:2,'2nd':2, third:3,'3rd':3, fourth:4,'4th':4 };
    const SEM_MAP  = { first:1,'1st':1, second:2,'2nd':2 };
    // Subject code: 2-6 uppercase letters + optional space + 1-4 digits + optional letter suffix
    const CODE_RE  = /^([A-Z]{2,6})\s+(\d{1,4}[A-Z]?)$/;

    for (const rawLine of lines) {
        // ── Context detection ──────────────────────────────────────────────
        const yrA = rawLine.match(/\b(first|second|third|fourth|1st|2nd|3rd|4th)\s+year\b/i);
        const yrB = rawLine.match(/\byear\s+(1|2|3|4)\b/i);
        if (yrA)      curYear = YEAR_MAP[yrA[1].toLowerCase()] ?? null;
        else if (yrB) curYear = parseInt(yrB[1]);

        const smA = rawLine.match(/\b(first|second|1st|2nd)\s+semester\b/i);
        if (smA)                                               curSem = SEM_MAP[smA[1].toLowerCase()] ?? 1;
        else if (/\bsummer\b/i.test(rawLine) && !yrA && !yrB) curSem = 3;

        // ── Skip header / total rows ───────────────────────────────────────
        if (SKIP_RE.test(rawLine)) continue;
        if (/^(total|sub.?total|total\s+hours)/i.test(rawLine)) continue;

        // ── Tab-separated (from text-based PDF extraction) ─────────────────
        const cols  = rawLine.split('\t').map(c => c.trim()).filter(Boolean);
        const first = cols[0] || '';

        const codeM = first.match(CODE_RE);

        if (!codeM) {
            // No tab columns — try whole-line regex (OCR output or compact PDFs)
            const s = tryParseLine(rawLine, curYear, curSem);
            if (s) subjects.push(s);
            continue;
        }

        const code = `${codeM[1]} ${codeM[2]}`;
        if (cols.length < 2) continue;

        // ── Detect prereq: last column that is NOT a pure number ───────────
        // e.g. ["GEN 001", "Purposive Communication", "3", "0", "3", "None"]
        //       cols[-1]="None" → prereq, then remaining numbers are lec/lab/units
        const lastCol     = cols[cols.length - 1];
        const lastIsNum   = /^\d+$/.test(lastCol);
        const prereq      = lastIsNum ? '' : lastCol.replace(/^none$/i, '').trim();
        // Columns to search for numbers = all middle cols (skip code and prereq)
        const midCols     = lastIsNum ? cols.slice(1) : cols.slice(1, -1);

        // Walk backwards through midCols to peel off trailing number columns (lec, lab, units)
        const nums = [];
        let nameEnd = midCols.length;
        for (let i = midCols.length - 1; i >= 0; i--) {
            if (/^\d+$/.test(midCols[i])) { nums.unshift(+midCols[i]); nameEnd = i; }
            else break;
        }

        const name = midCols.slice(0, nameEnd).join(' ').trim();
        if (!name || SKIP_RE.test(name)) continue;

        let lec = 0, lab = 0, units = 3;
        if (nums.length >= 3)       { lec = nums[0]; lab = nums[1]; units = nums[2]; }
        else if (nums.length === 2) { lec = nums[0]; units = nums[1]; }
        else if (nums.length === 1) { units = nums[0]; lec = nums[0]; }

        if (units >= 0 && units <= 20) {
            subjects.push({ code, name, lec, lab, units, year: curYear, sem: curSem ?? 1, prereq });
        }
    }

    return subjects;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fileTypeIcon(name) {
    const ext = (name.split('.').pop() || '').toLowerCase();
    if (['jpg','jpeg','png','gif','webp'].includes(ext)) return '[IMG]';
    if (ext === 'pdf') return '[PDF]';
    if (['xls','xlsx'].includes(ext)) return '[XLS]';
    if (['doc','docx'].includes(ext)) return '[DOC]';
    return '[FILE]';
}

function showMsg(el, text, type) {
    el.textContent = text;
    el.className = `ps-modal-msg ps-modal-msg--${type}`;
    el.style.display = 'block';
}

// esc() imported from classroom-ui.js (see import above)

// ── CSS ────────────────────────────────────────────────────────────────────

function css() { return `
.ps-boot { display:flex; justify-content:center; padding:60px; }
.ps-spin { width:32px; height:32px; border:3px solid #E5E7EB; border-top-color:#00461B; border-radius:50%; animation:psSpin .8s linear infinite; }
@keyframes psSpin { to { transform:rotate(360deg); } }

.ps-page { padding:0 0 60px; }
.ps-header { display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap; margin-bottom:24px; }
.ps-title  { font-size:22px; font-weight:800; color:#111827; margin:0 0 4px; }
.ps-subtitle { font-size:13px; color:#6B7280; margin:0; }

.ps-btn-add {
    padding:9px 18px; background:#00461B; color:#fff; border:none;
    border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; white-space:nowrap;
    transition:background .15s; display:inline-flex; align-items:center; gap:6px;
}
.ps-btn-add:hover { background:#003515; }

/* ── Program cards grid ── */
.ps-prog-grid {
    display:flex; flex-wrap:wrap; gap:14px; margin-bottom:28px;
}
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

/* ── Program view ── */
.ps-prog-view { }
.ps-view-header { margin-bottom:14px; }
.ps-view-title  { font-size:17px; font-weight:700; color:#111827; margin:0; }

/* ── Version bar ── */
.ps-ver-bar { margin-bottom:20px; }
.ps-ver-tabs { display:flex; flex-wrap:wrap; gap:6px; align-items:center; }
.ps-ver-tab {
    padding:7px 16px; border-radius:20px; border:1.5px solid #E5E7EB;
    background:#fff; font-size:13px; font-weight:600; color:#5F6368;
    cursor:pointer; font-family:inherit; transition:all .15s;
    display:inline-flex; align-items:center; gap:5px;
}
.ps-ver-tab:hover { border-color:#00461B; color:#00461B; background:#F8FDF9; }
.ps-ver-tab.active { background:#00461B; border-color:#00461B; color:#fff; }
.ps-ver-file-dot { font-size:13px; }
.ps-ver-item { display:inline-flex; align-items:center; gap:2px; }
.ps-ver-del {
    display:inline-flex; align-items:center; justify-content:center;
    width:18px; height:18px; border-radius:50%; border:none;
    background:transparent; color:#9CA3AF; font-size:14px; line-height:1;
    cursor:pointer; padding:0; transition:all .15s; flex-shrink:0;
}
.ps-ver-del:hover { background:#FEE2E2; color:#b91c1c; }
.ps-ver-import {
    display:inline-flex; align-items:center; justify-content:center;
    width:18px; height:18px; border-radius:50%; border:none;
    background:transparent; color:#9CA3AF; font-size:14px; line-height:1;
    cursor:pointer; padding:0; transition:all .15s; flex-shrink:0;
}
.ps-ver-import:hover { background:#DBEAFE; color:#1d4ed8; }
.ps-ver-add-btn {
    padding:7px 14px; border-radius:20px; border:1.5px dashed #C5D9CB;
    background:#F8FDF9; font-size:12px; font-weight:600; color:#00461B;
    cursor:pointer; font-family:inherit; transition:all .15s;
}
.ps-ver-add-btn:hover { border-color:#00461B; background:#E8F5EC; }

/* ── Checklist layout ── */
.cr-wrap { display:flex; flex-direction:column; gap:32px; }
.cr-year-block { overflow-x:auto; }
.cr-table {
    width:100%; border-collapse:collapse; font-size:12.5px;
    font-family:inherit; background:#fff; border:1.5px solid #374151;
}
.cr-year-hd {
    background:#00461B; color:#fff; font-size:13px; font-weight:800;
    letter-spacing:1px; text-transform:uppercase; text-align:center;
    padding:7px 12px; border:1px solid #00461B; position:relative;
}
.cr-sem-hd {
    background:#1B4D3E; color:#fff; font-size:12px; font-weight:700;
    letter-spacing:.5px; text-transform:uppercase; text-align:center;
    padding:7px 10px; border:1px solid #155534;
}
.cr-th-code  { width:110px; text-align:center; vertical-align:middle; font-size:11px; font-weight:700; background:#2d6a4f; color:#fff; padding:6px 8px; border:1px solid #155534; }
.cr-th-title { text-align:center; vertical-align:middle; font-size:11px; font-weight:700; background:#2d6a4f; color:#fff; padding:6px 8px; border:1px solid #155534; }
.cr-th-units { width:130px; text-align:center; font-size:11px; font-weight:700; background:#2d6a4f; color:#fff; padding:6px 8px; border:1px solid #155534; }
.cr-th-num   { width:44px; text-align:center; font-size:11px; font-weight:700; background:#2d6a4f; color:#fff; padding:6px 4px; border:1px solid #155534; }
.cr-th-pre   { width:120px; text-align:center; vertical-align:middle; font-size:11px; font-weight:700; background:#2d6a4f; color:#fff; padding:6px 8px; border:1px solid #155534; }
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
.cr-total-row td { background:#E8F5E9; border:1px solid #d1d5db; padding:7px 8px; }
.cr-total-lbl { text-align:right; font-size:12px; font-weight:800; color:#1B4D3E; letter-spacing:.5px; }
.cr-summer-table { width:50%; border:1.5px solid #374151; margin-top:0; border-top:2px solid #374151; }

/* ── Empty / full empty states ── */
.ps-empty {
    text-align:center; padding:48px 24px; color:#6B7280;
    background:#fff; border:1px dashed #E5E7EB; border-radius:10px; margin-top:8px;
}
.ps-empty p { margin:12px 0 16px; }
.ps-empty-hint { font-size:12.5px; color:#9CA3AF; }
.ps-empty-full { text-align:center; padding:80px 24px; color:#6B7280; }

/* ── Modal ── */
.ps-backdrop {
    position:fixed; inset:0; background:rgba(0,0,0,.45); z-index:1000;
    display:flex; align-items:center; justify-content:center; padding:20px;
}
.ps-modal {
    background:#fff; border-radius:14px; width:100%; max-width:560px;
    box-shadow:0 8px 40px rgba(0,0,0,.2); overflow:hidden;
    max-height:90vh; display:flex; flex-direction:column;
}
.ps-modal-hdr {
    background:#00461B; padding:16px 20px;
    display:flex; align-items:center; justify-content:space-between; flex-shrink:0;
}
.ps-modal-hdr h3 { color:#fff; font-size:15px; font-weight:700; margin:0; }
.ps-modal-hdr h3 em { font-style:normal; opacity:.82; }
.ps-modal-close { background:none; border:none; color:#fff; font-size:22px; cursor:pointer; line-height:1; opacity:.8; }
.ps-modal-close:hover { opacity:1; }
.ps-modal-body { padding:18px 20px; overflow-y:auto; flex:1; }
.ps-modal-search {
    width:100%; padding:9px 12px; border:1px solid #E5E7EB; border-radius:8px;
    font-size:13px; font-family:inherit; outline:none; box-sizing:border-box; margin-bottom:12px;
}
.ps-modal-search:focus { border-color:#00461B; }
.ps-modal-list { display:flex; flex-direction:column; gap:6px; }
.ps-modal-item {
    display:flex; align-items:center; justify-content:space-between; gap:10px;
    padding:10px 12px; border:1px solid #E5E7EB; border-radius:8px; background:#fff;
}
.ps-modal-item-info { display:flex; align-items:center; gap:8px; flex:1; min-width:0; flex-wrap:wrap; }
.ps-modal-item-name { font-size:13px; color:#111827; font-weight:500; }
.ps-modal-item-btn {
    padding:5px 14px; background:#00461B; color:#fff; border:none;
    border-radius:6px; font-size:12px; font-weight:600; cursor:pointer; white-space:nowrap; flex-shrink:0;
}
.ps-modal-item-btn:hover { background:#003515; }
.ps-modal-item-btn:disabled { opacity:.5; cursor:not-allowed; }
.ps-modal-empty { text-align:center; padding:24px; color:#9CA3AF; font-size:13px; }
.ps-code  { background:#E8F5E9; color:#1B4D3E; padding:2px 7px; border-radius:4px; font-family:monospace; font-size:12px; font-weight:700; }
.ps-units { background:#F3F4F6; color:#374151; padding:2px 8px; border-radius:10px; font-size:12px; font-weight:600; }
.ps-modal-msg { padding:9px 12px; border-radius:7px; font-size:13px; margin-bottom:12px; }
.ps-modal-msg--ok  { background:#E8F5E9; color:#1B4D3E; }
.ps-modal-msg--err { background:#FEE2E2; color:#b91c1c; }

/* ── Add-subject form ── */
.am-form { display:flex; flex-direction:column; gap:14px; }
.am-field { display:flex; flex-direction:column; gap:5px; }
.am-label { font-size:13px; font-weight:600; color:#374151; }
.am-input {
    padding:9px 12px; border:1.5px solid #e5e7eb; border-radius:8px;
    font-size:13px; font-family:inherit; outline:none; width:100%; box-sizing:border-box;
    transition:border-color .15s;
}
.am-input:focus { border-color:#00461B; box-shadow:0 0 0 3px rgba(0,70,27,.08); }
.am-textarea { resize:vertical; min-height:72px; }
.am-actions { display:flex; justify-content:flex-end; gap:10px; padding-top:4px; }
.am-cancel-btn {
    padding:8px 18px; background:#f3f4f6; color:#374151;
    border:1.5px solid #e5e7eb; border-radius:8px; font-size:13px; cursor:pointer;
}
.am-cancel-btn:hover { background:#e5e7eb; }
.am-save-btn {
    padding:8px 22px; background:#00461B; color:#fff;
    border:none; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer;
}
.am-save-btn:hover { background:#003515; }
.am-save-btn:disabled { opacity:.5; cursor:not-allowed; }

/* ── Curriculum version file upload ── */
.av-drop-zone {
    border:2px dashed #C5D9CB; border-radius:10px; padding:20px 16px;
    text-align:center; background:#F8FDF9; transition:border-color .15s, background .15s;
    cursor:default;
}
.av-drop-zone.drag-over { border-color:#00461B; background:#EEF7F0; }
.av-drop-icon { font-size:28px; margin-bottom:6px; }
.av-drop-hint { font-size:13px; color:#5F6368; margin:0 0 4px; }
.av-browse-btn {
    background:none; border:none; color:#00461B; font-size:13px; font-weight:700;
    cursor:pointer; text-decoration:underline; padding:0;
}
.av-drop-types { font-size:11px; color:#9AA0A6; margin:0; }
.av-file-info {
    display:flex; align-items:center; gap:10px; padding:10px 14px;
    border:1px solid #C5D9CB; border-radius:10px; background:#F8FDF9; margin-top:8px;
}
.av-fi-icon { font-size:22px; flex-shrink:0; }
.av-fi-name { font-size:13px; color:#202124; font-weight:500; flex:1; word-break:break-all; }
.av-fi-remove {
    background:none; border:none; color:#9AA0A6; cursor:pointer;
    font-size:16px; flex-shrink:0; padding:2px 5px; border-radius:4px;
}
.av-fi-remove:hover { color:#b91c1c; background:#FEE2E2; }

/* ── Elective Tracks Section ── */
.el-section { margin-top:36px; border:1.5px solid #374151; background:#fff; }
.el-header {
    display:flex; align-items:center; justify-content:space-between;
    padding:12px 16px; background:#00461B; gap:12px; flex-wrap:wrap;
}
.el-title { font-size:14px; font-weight:800; color:#fff; margin:0 0 2px; letter-spacing:.5px; text-transform:uppercase; }
.el-sub   { font-size:12px; color:rgba(255,255,255,.75); margin:0; }
.el-add-track-btn {
    padding:7px 16px; background:#fff; color:#00461B;
    border:none; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer;
}
.el-add-track-btn:hover { background:#f0fdf4; }
.el-table-wrap { overflow-x:auto; }
.el-table { width:100%; border-collapse:collapse; font-size:12.5px; background:#fff; }
.el-th {
    background:#2d6a4f; color:#fff; font-size:11px; font-weight:700;
    text-transform:uppercase; letter-spacing:.4px; padding:8px 14px; border:1px solid #155534;
}
.el-table tbody tr:nth-child(even) { background:#f9fafb; }
.el-table tbody tr:hover { background:#f0fdf4; }
.el-table td { border:1px solid #d1d5db; padding:10px 14px; vertical-align:middle; }
.el-td-track { width:220px; white-space:nowrap; }
.el-track-label { font-weight:700; color:#1B4D3E; font-size:13px; margin-right:8px; }
.el-del-track { background:none; border:none; color:#d1d5db; cursor:pointer; font-size:12px; padding:2px 5px; border-radius:4px; }
.el-del-track:hover { background:#FEE2E2; color:#b91c1c; }
.el-td-subjects { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
.el-chip { display:inline-flex; align-items:center; gap:6px; background:#E8F5E9; border:1px solid #a7f3d0; border-radius:8px; padding:5px 10px; font-size:12px; }
.el-chip-code { font-family:monospace; font-weight:700; color:#1B4D3E; }
.el-chip-name { color:#374151; }
.el-chip-remove { background:none; border:none; color:#9ca3af; cursor:pointer; font-size:12px; padding:0 2px; line-height:1; }
.el-chip-remove:hover { color:#b91c1c; }
.el-add-subj-btn { background:none; border:1.5px dashed #d1d5db; color:#9ca3af; border-radius:7px; padding:4px 12px; font-size:12px; cursor:pointer; }
.el-add-subj-btn:hover { border-color:#00461B; color:#00461B; background:#f0fdf4; }
.el-none { text-align:center; color:#9ca3af; font-size:13px; padding:20px; font-style:italic; }
.el-add-form {
    display:none; align-items:center; gap:10px; flex-wrap:wrap;
    padding:12px 16px; border-top:1px solid #e5e7eb; background:#f9fafb;
}
.el-input { flex:1; min-width:220px; padding:8px 12px; border:1px solid #d1d5db; border-radius:8px; font-size:13px; font-family:inherit; outline:none; }
.el-input:focus { border-color:#00461B; }
.el-save-btn { padding:8px 18px; background:#00461B; color:#fff; border:none; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; }
.el-save-btn:hover { background:#003515; }
.el-cancel-btn { padding:8px 14px; background:#f3f4f6; color:#374151; border:1px solid #d1d5db; border-radius:8px; font-size:13px; cursor:pointer; }

/* ── Template download button (in Add Version + Import modals) ── */
.av-tpl-btn, .pim-tpl-btn {
    background:none; border:1px solid #C5D9CB; border-radius:6px;
    color:#00461B; font-size:11px; font-weight:600; cursor:pointer;
    padding:3px 10px; font-family:inherit; transition:all .15s;
    white-space:nowrap;
}
.av-tpl-btn:hover, .pim-tpl-btn:hover { background:#EEF7F0; border-color:#00461B; }
.pim-tpl-row {
    display:flex; align-items:center; gap:8px; flex-wrap:wrap;
    font-size:12px; color:#6B7280; margin:0 0 12px;
}
.pim-tpl-lbl { font-weight:600; color:#374151; white-space:nowrap; }
.pim-tpl-sep { color:#9AA0A6; }

/* ── Import modal (was PDF Import) ── */
.pim-modal { max-width:800px; max-height:90vh; }
.pim-hint { font-size:13px; color:#6B7280; line-height:1.55; margin:0 0 14px; }
.pim-preview-hdr {
    display:flex; align-items:flex-start; justify-content:space-between;
    gap:12px; flex-wrap:wrap; padding-bottom:12px; border-bottom:1px solid #e5e7eb; margin-bottom:10px;
}
.pim-found-lbl { font-size:14px; font-weight:700; color:#111827; margin:0 0 3px; }
.pim-found-sub { font-size:12px; color:#9CA3AF; margin:0; }
.pim-btns { display:flex; gap:8px; flex-shrink:0; }
.pim-tbl {
    width:100%; border-collapse:collapse; font-size:12px;
    font-family:inherit; background:#fff; border:1.5px solid #e5e7eb;
}
.pim-tbl thead th {
    background:#1B4D3E; color:#fff; padding:7px 5px;
    font-size:11px; font-weight:700; text-align:center;
    border:1px solid #155534; white-space:nowrap;
}
.pim-tbl tbody tr:nth-child(even) { background:#f9fafb; }
.pim-tbl tbody tr:hover { background:#f0fdf4; }
.pim-tbl td { border:1px solid #e5e7eb; padding:4px 4px; vertical-align:middle; }
#pim-tbl-wrap { max-height:400px; overflow:auto; border:1px solid #e5e7eb; border-radius:6px; }
.pim-cell {
    border:1px solid transparent; border-radius:4px; padding:3px 5px;
    font-size:12px; font-family:inherit; background:transparent;
    outline:none; width:100%; box-sizing:border-box;
}
.pim-cell:focus { border-color:#00461B; background:#fff; box-shadow:0 0 0 2px rgba(0,70,27,.08); }
.pim-num { text-align:center; }
select.pim-cell { cursor:pointer; }

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
