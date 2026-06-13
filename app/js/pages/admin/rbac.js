/**
 * Admin – Roles & Permissions (RBAC)
 * Simple: pick a role → check/uncheck permissions → Save.
 */
import { Api } from '../../api.js';
import { Auth } from '../../auth.js';
import { renderSidebar } from '../../components/sidebar.js';
import { icon } from '../../utils/icons.js';

const inl = { size: 14, className: 'ui-icon-inline' };

const ROLES = ['admin', 'dean', 'instructor', 'student'];
const ROLE_META = {
    admin:      { label: 'Administrator', color: '#7c3aed', bg: '#f5f3ff', icon: 'shield' },
    dean:       { label: 'Dean',          color: '#0891b2', bg: '#f0f9ff', icon: 'graduation' },
    instructor: { label: 'Instructor',    color: '#059669', bg: '#f0fdf4', icon: 'instructor' },
    student:    { label: 'Student',       color: '#d97706', bg: '#fffbeb', icon: 'user' },
};
const MODULE_ICONS = {
    users:'users', departments:'building', programs:'graduation', subjects:'book',
    curriculum:'clipboard', sections:'school', subject_offerings:'calendar',
    faculty_assignments:'instructor', quizzes:'quiz', lessons:'lessons',
    question_bank:'bank', grades:'dashboard', reports:'chart',
    analytics:'chart', settings:'settings', rbac:'lock'
};
const MODULE_LABELS = {
    users: 'User Management',
    departments: 'Departments',
    programs: 'Programs',
    subjects: 'Subjects',
    curriculum: 'Curriculum',
    sections: 'Sections',
    subject_offerings: 'Subject Offerings',
    faculty_assignments: 'Faculty Assignments',
    quizzes: 'Quizzes',
    lessons: 'Lessons',
    question_bank: 'Question Bank',
    grades: 'Grades',
    reports: 'Reports',
    analytics: 'Analytics',
    settings: 'System Settings',
    rbac: 'Access Control',
};

export async function render(container) {
    container.innerHTML = `
    <style>
        .rp-wrap { max-width: 100%; }

        /* ── Banner ── */
        .rp-banner {
            background: #00461B;
            border-radius: 16px; padding: 28px 32px; margin-bottom: 24px;
            display: flex; align-items: center; justify-content: space-between;
            box-shadow: 0 2px 10px rgba(0,70,27,.1);
        }
        .rp-banner-left { display:flex; align-items:center; gap:16px; }
        .rp-banner-icon {
            width:52px; height:52px; border-radius:14px;
            background:rgba(255,255,255,.18); border:none;
            display:flex; align-items:center; justify-content:center; font-size:24px;
            flex-shrink:0;
        }
        .rp-banner h1 { font-size:22px; font-weight:800; color:#fff; margin:0 0 4px; }
        .rp-banner p  { color:rgba(255,255,255,.72); font-size:13px; margin:0; }
        .rp-banner-stat {
            background:rgba(255,255,255,.15); border:none;
            border-radius:12px; padding:10px 20px; text-align:center; flex-shrink:0;
        }
        .rp-banner-stat-num { font-size:22px; font-weight:800; color:#fff; }
        .rp-banner-stat-lbl { font-size:11px; color:rgba(255,255,255,.7); margin-top:1px; }

        /* ── Role cards ── */
        .rp-roles { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:20px; }
        .rp-role-card {
            padding:16px; border-radius:14px; border:none;
            background:#fff; cursor:pointer; transition:background .15s;
            box-shadow:none;
        }
        .rp-role-card:hover { transform:translateY(-2px); box-shadow:0 6px 20px rgba(0,0,0,.1); }
        .rp-role-card.active { box-shadow:none; }
        .rp-role-top { display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; }
        .rp-role-icon {
            width:38px; height:38px; border-radius:10px;
            display:flex; align-items:center; justify-content:center; font-size:18px;
        }
        .rp-role-dot {
            width:8px; height:8px; border-radius:50%;
        }
        .rp-role-name { font-size:14px; font-weight:700; margin-bottom:2px; }
        .rp-role-count { font-size:12px; color:#6b7280; }
        .rp-role-bar-wrap {
            height:4px; background:#f1f5f9; border-radius:4px; margin-top:10px; overflow:hidden;
        }
        .rp-role-bar { height:100%; border-radius:4px; transition:width .4s ease; }

        /* ── Toolbar ── */
        .rp-toolbar {
            display:flex; align-items:center; gap:8px; margin-bottom:16px; flex-wrap:wrap;
            background:#F3F4F6; border:none; border-radius:12px;
            padding:10px 14px; box-shadow:none;
        }
        .rp-search-wrap { flex:1; min-width:180px; display:flex; align-items:center; gap:8px; }
        .rp-search-icon { color:#9ca3af; font-size:15px; flex-shrink:0; }
        .rp-search {
            flex:1; border:none; outline:none; font-size:13px; color:#1e293b;
            background:transparent;
        }
        .rp-search::placeholder { color:#adb5bd; }
        .rp-divider { width:1px; height:24px; background:#e5e7eb; flex-shrink:0; }
        .rp-btn {
            padding:7px 14px; border-radius:8px; font-size:12.5px;
            font-weight:600; cursor:pointer; border:none;
            background:#E5E7EB; color:#374151; transition:background .15s; white-space:nowrap;
        }
        .rp-btn:hover { background:#D1D5DB; }
        .rp-btn-save {
            background:#1B4D3E; color:#fff; border:none; padding:7px 18px;
        }
        .rp-btn-save:hover { background:#163d31; }
        .rp-btn-save:disabled { opacity:.55; cursor:not-allowed; }

        /* ── Module group ── */
        .rp-module {
            margin-bottom:10px; border:none; border-radius:14px;
            overflow:hidden; background:#fff;
            transition:background .15s;
        }
        .rp-module:hover { background:#FAFAFA; }
        .rp-module-head {
            display:flex; align-items:center; gap:10px;
            padding:13px 18px; background:#F3F4F6; cursor:pointer;
            user-select:none; border-bottom:none; transition:background .12s;
        }
        .rp-module-head:hover { background:#f1f5f9; }
        .rp-mod-icon-wrap {
            width:30px; height:30px; border-radius:8px; flex-shrink:0;
            display:flex; align-items:center; justify-content:center; font-size:14px;
            background:#e8f5e9;
        }
        .rp-mod-title {
            flex:1; font-size:13px; font-weight:700; color:#1e293b;
            text-transform:capitalize; letter-spacing:.01em;
        }
        .rp-mod-badge {
            font-size:11px; padding:3px 9px; border-radius:20px;
            font-weight:700; transition:all .2s;
        }
        .rp-mod-check-all {
            font-size:11px; padding:4px 10px; border-radius:7px;
            border:none; background:#E5E7EB; cursor:pointer;
            color:#6b7280; transition:all .15s; font-weight:500;
        }
        .rp-mod-check-all:hover { background:#f3f4f6; color:#374151; }
        .rp-chevron { color:#9ca3af; font-size:11px; transition:transform .2s; margin-right:2px; }
        .rp-chevron.open { transform:rotate(90deg); }

        /* ── Permission rows ── */
        .rp-perm-list { padding:4px 0; }
        .rp-perm-list.collapsed { display:none; }
        .rp-perm-row {
            display:flex; align-items:center; gap:14px;
            padding:10px 18px; transition:background .12s; cursor:pointer;
            border-bottom:1px solid #f8fafc;
        }
        .rp-perm-row:last-child { border-bottom:none; }
        .rp-perm-row:hover { background:#f8fafc; }
        .rp-perm-row.hidden { display:none; }

        /* Custom checkbox */
        .rp-cb-wrap {
            width:18px; height:18px; flex-shrink:0; position:relative;
        }
        .rp-cb {
            width:18px; height:18px; flex-shrink:0;
            accent-color:#1B4D3E; cursor:pointer; border-radius:5px;
        }
        .rp-perm-info { flex:1; min-width:0; }
        .rp-perm-name {
            font-size:12px; font-weight:600; color:#1e293b;
            font-family:'Courier New',monospace;
            background:#f1f5f9; display:inline-block;
            padding:1px 7px; border-radius:5px; margin-bottom:2px;
            border:none;
        }
        .rp-perm-desc { font-size:12px; color:#6b7280; }

        /* ── Toast ── */
        .rp-toast {
            position:fixed; bottom:24px; left:50%; transform:translateX(-50%) translateY(8px);
            background:#1e293b; color:#fff; border-radius:12px;
            padding:11px 22px; font-size:13px; font-weight:500;
            box-shadow:0 8px 32px rgba(0,0,0,.22); z-index:9999;
            opacity:0; transition:all .25s; pointer-events:none;
        }
        .rp-toast.show { opacity:1; pointer-events:auto; transform:translateX(-50%) translateY(0); }
        .rp-toast.error { background:#7f1d1d; }
    </style>

    <div class="rp-wrap">
        <div class="rp-banner">
            <div class="rp-banner-left">
                <div class="rp-banner-icon">${icon('lock', { size: 28 })}</div>
                <div>
                    <h1>Roles &amp; Permissions</h1>
                    <p>Control what each role can access. Select a role, review permissions by module, then save your changes.</p>
                </div>
            </div>
            <div class="rp-banner-stat">
                <div class="rp-banner-stat-num" id="rpTotalPerms">—</div>
                <div class="rp-banner-stat-lbl">Total Permissions</div>
            </div>
        </div>

        <div class="rp-roles" id="rpRoles"></div>

        <div class="rp-toolbar">
            <div class="rp-search-wrap">
                <span class="rp-search-icon">${icon('search', inl)}</span>
                <input class="rp-search" id="rpSearch" type="text" placeholder="Search permissions…">
            </div>
            <div class="rp-divider"></div>
            <button class="rp-btn" id="rpCheckAll">Grant All</button>
            <button class="rp-btn" id="rpUncheckAll">Revoke All</button>
            <button class="rp-btn rp-btn-save" id="rpSave">Save Changes</button>
        </div>

        <div id="rpMatrix">
            <div style="padding:48px;text-align:center;color:#9ca3af;font-size:13px;">Loading permissions…</div>
        </div>
    </div>

    <div class="rp-toast" id="rpToast"></div>
    `;

    // ── State ──────────────────────────────────────────────────────
    let allPerms = {};    // { module: [{id,name,description},...] }
    let dirty    = {};    // { role: Set<id> }
    let active   = 'admin';

    // ── Load ───────────────────────────────────────────────────────
    const res = await Api.get('/RBACApi.php?action=matrix');
    if (!res.success) {
        container.querySelector('#rpMatrix').innerHTML =
            `<div style="padding:24px;color:#ef4444">Failed to load: ${res.message}</div>`;
        return;
    }

    // Group permissions by module
    res.data.permissions.forEach(p => {
        (allPerms[p.module] = allPerms[p.module] || []).push(p);
    });

    // Build dirty state
    ROLES.forEach(r => {
        const granted = new Set(res.data.matrix[r] || []);
        dirty[r] = new Set(
            res.data.permissions.filter(p => granted.has(p.name)).map(p => p.id)
        );
    });

    const totalPerms = res.data.permissions.length;
    container.querySelector('#rpTotalPerms').textContent = totalPerms;

    renderRoles();
    renderMatrix();

    // ── Render role cards ──────────────────────────────────────────
    function renderRoles() {
        const el = container.querySelector('#rpRoles');
        el.innerHTML = ROLES.map(r => {
            const m = ROLE_META[r];
            const isActive = r === active;
            const count = dirty[r].size;
            const pct = totalPerms > 0 ? Math.round((count / totalPerms) * 100) : 0;
            return `
            <div class="rp-role-card ${isActive ? 'active' : ''}" data-role="${r}"
                 style="${isActive ? `background:${m.bg};` : ''}">
                <div class="rp-role-top">
                    <div class="rp-role-icon" style="background:${m.bg}">${icon(m.icon, { size: 20 })}</div>
                    <div class="rp-role-dot" style="background:${isActive ? m.color : '#e5e7eb'}"></div>
                </div>
                <div class="rp-role-name" style="color:${isActive ? m.color : '#1e293b'}">${m.label}</div>
                <div class="rp-role-count" id="rc-${r}">${count} of ${totalPerms} granted</div>
                <div class="rp-role-bar-wrap">
                    <div class="rp-role-bar" id="rb-${r}" style="width:${pct}%;background:${m.color}"></div>
                </div>
            </div>`;
        }).join('');

        el.querySelectorAll('.rp-role-card').forEach(card => {
            card.addEventListener('click', () => {
                active = card.dataset.role;
                renderRoles();
                renderMatrix();
            });
        });
    }

    function updateRoleCount(role) {
        const el = container.querySelector(`#rc-${role}`);
        const bar = container.querySelector(`#rb-${role}`);
        const count = dirty[role].size;
        const pct = totalPerms > 0 ? Math.round((count / totalPerms) * 100) : 0;
        if (el) el.textContent = `${count} of ${totalPerms} granted`;
        if (bar) bar.style.width = `${pct}%`;
    }

    // ── Render permission matrix ───────────────────────────────────
    function renderMatrix() {
        const color = ROLE_META[active].color;
        const matEl = container.querySelector('#rpMatrix');

        matEl.innerHTML = Object.entries(allPerms).map(([mod, perms]) => {
            const grantedCount = perms.filter(p => dirty[active].has(p.id)).length;
            const allGranted   = grantedCount === perms.length;
            const badgeBg      = grantedCount ? color + '22' : '#f1f5f9';
            const badgeColor   = grantedCount ? color : '#9ca3af';

            return `
            <div class="rp-module">
                <div class="rp-module-head" data-mod="${mod}">
                    <span class="rp-chevron open">&#9654;</span>
                    <div class="rp-mod-icon-wrap">${icon(MODULE_ICONS[mod] || 'pin', { size: 18 })}</div>
                    <span class="rp-mod-title">${MODULE_LABELS[mod] || mod.replace(/_/g,' ')}</span>
                    <span class="rp-mod-badge" style="background:${badgeBg};color:${badgeColor}"
                          id="badge-${mod}">${grantedCount}/${perms.length}</span>
                    <button class="rp-mod-check-all" data-mod-all="${mod}"
                            data-action="${allGranted ? 'off' : 'on'}">
                        ${allGranted ? 'Revoke all' : 'Grant all'}
                    </button>
                </div>
                <div class="rp-perm-list" data-mod-list="${mod}">
                    ${perms.map(p => `
                    <label class="rp-perm-row" data-perm="${p.name}">
                        <input class="rp-cb" type="checkbox" data-id="${p.id}"
                            ${dirty[active].has(p.id) ? 'checked' : ''}>
                        <div class="rp-perm-info">
                            <div class="rp-perm-name">${p.name}</div>
                            <div class="rp-perm-desc">${p.description || 'No description provided for this permission.'}</div>
                        </div>
                    </label>`).join('')}
                </div>
            </div>`;
        }).join('');

        // Checkbox change
        matEl.querySelectorAll('.rp-cb').forEach(cb => {
            cb.addEventListener('change', () => {
                const id = parseInt(cb.dataset.id);
                cb.checked ? dirty[active].add(id) : dirty[active].delete(id);
                updateRoleCount(active);
                updateModBadge(cb.closest('.rp-module').querySelector('.rp-module-head').dataset.mod);
            });
        });

        // Module collapse
        matEl.querySelectorAll('.rp-module-head').forEach(head => {
            head.addEventListener('click', e => {
                if (e.target.closest('.rp-mod-check-all')) return;
                const mod  = head.dataset.mod;
                const list = matEl.querySelector(`[data-mod-list="${mod}"]`);
                const chev = head.querySelector('.rp-chevron');
                list.classList.toggle('collapsed');
                chev.classList.toggle('open', !list.classList.contains('collapsed'));
            });
        });

        // Check/uncheck all in module
        matEl.querySelectorAll('.rp-mod-check-all').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                const mod    = btn.dataset.modAll;
                const on     = btn.dataset.action === 'on';
                allPerms[mod].forEach(p => on ? dirty[active].add(p.id) : dirty[active].delete(p.id));
                updateRoleCount(active);
                // re-render just this module's checkboxes
                const list = matEl.querySelector(`[data-mod-list="${mod}"]`);
                list.querySelectorAll('.rp-cb').forEach(cb => {
                    cb.checked = on;
                });
                btn.dataset.action = on ? 'off' : 'on';
                btn.textContent    = on ? 'Revoke all' : 'Grant all';
                updateModBadge(mod);
            });
        });
    }

    function updateModBadge(mod) {
        const color  = ROLE_META[active].color;
        const perms  = allPerms[mod] || [];
        const count  = perms.filter(p => dirty[active].has(p.id)).length;
        const badge  = container.querySelector(`#badge-${mod}`);
        if (!badge) return;
        badge.textContent = `${count}/${perms.length}`;
        badge.style.background = count ? color + '22' : '#f1f5f9';
        badge.style.color      = count ? color        : '#9ca3af';
    }

    // ── Toolbar ────────────────────────────────────────────────────
    container.querySelector('#rpCheckAll').addEventListener('click', () => {
        Object.values(allPerms).flat().forEach(p => dirty[active].add(p.id));
        updateRoleCount(active);
        renderMatrix();
    });

    container.querySelector('#rpUncheckAll').addEventListener('click', () => {
        dirty[active].clear();
        updateRoleCount(active);
        renderMatrix();
    });

    container.querySelector('#rpSearch').addEventListener('input', e => {
        const q = e.target.value.toLowerCase();
        container.querySelectorAll('.rp-perm-row').forEach(row => {
            row.classList.toggle('hidden', !!q && !row.dataset.perm.includes(q));
        });
    });

    // ── Save ───────────────────────────────────────────────────────
    container.querySelector('#rpSave').addEventListener('click', async () => {
        const btn = container.querySelector('#rpSave');
        btn.disabled = true;
        btn.textContent = 'Saving…';
        try {
            const r = await Api.post('/RBACApi.php?action=update-role', {
                role: active,
                permission_ids: [...dirty[active]]
            });

            if (r.success) {
                toast(`${icon('check', inl)} ${ROLE_META[active].label} permissions saved`);

                // If the saved role matches the current logged-in user's role,
                // refresh their permissions and re-render the sidebar instantly
                const currentUser = Auth.user();
                if (currentUser && currentUser.role === active) {
                    await Auth.fetchPermissions();
                    const sidebar = document.getElementById('sidebar');
                    if (sidebar) renderSidebar(sidebar);
                }
            } else {
                toast(`Error: ${r.message}`, true);
            }
        } catch (_) {
            toast('Save failed', true);
        } finally {
            btn.disabled = false;
            btn.textContent = 'Save Changes';
        }
    });

    function toast(msg, isError = false) {
        const el = container.querySelector('#rpToast');
        el.textContent = msg;
        el.className = 'rp-toast show' + (isError ? ' error' : '');
        setTimeout(() => el.classList.remove('show'), 3000);
    }
}
