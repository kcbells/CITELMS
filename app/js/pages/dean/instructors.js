/**
 * Dean Instructors Page
 * View and filter instructors in dean's department
 */
import { Api } from '../../api.js';
import { icon, iconLg } from '../../utils/icons.js';

const inl = { size: 14, className: 'ui-icon-inline' };

let allInstructors = [];
let programsList = [];

export async function render(container) {
    // Fetch instructors (API scopes to dean's department) and programs
    const [res, progRes] = await Promise.all([
        Api.get('/UsersAPI.php?action=list&role=instructor'),
        Api.get('/UsersAPI.php?action=programs')
    ]);
    allInstructors = res.success ? res.data.users : [];
    programsList = progRes.success ? progRes.data : [];

    // Use programs from API (already scoped to dean's department)
    const instructorPrograms = programsList.map(p => ({
        id: p.program_id, code: p.program_code, name: p.program_name
    }));

    container.innerHTML = `
        <style>
            .di-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:24px; flex-wrap:wrap; gap:12px; }
            .di-header h2 { font-size:22px; font-weight:700; color:#262626; margin:0; }
            .di-count { background:#E8F5E9; color:#1B4D3E; padding:4px 12px; border-radius:20px; font-size:13px; font-weight:600; margin-left:8px; }

            .di-filters { display:flex; gap:12px; margin-bottom:20px; flex-wrap:wrap; align-items:center; }
            .di-filters input, .di-filters select { padding:9px 14px; border:1px solid #e0e0e0; border-radius:8px; font-size:14px; background:#fff; }
            .di-filters input:focus, .di-filters select:focus { outline:none; border-color:#1B4D3E; }
            .di-filters input { min-width:260px; }
            .di-filters select { min-width:180px; }

            .di-stats { display:grid; grid-template-columns:repeat(auto-fit, minmax(160px, 1fr)); gap:14px; margin-bottom:24px; }
            .di-stat { background:#fff; border:1px solid #e8e8e8; border-radius:12px; padding:16px; display:flex; align-items:center; gap:12px; }
            .di-stat-icon { width:40px; height:40px; border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:18px; flex-shrink:0; }
            .di-stat-icon.blue { background:#DBEAFE; }
            .di-stat-icon.green { background:#E8F5E9; }
            .di-stat-icon.amber { background:#FEF3C7; }
            .di-stat-val { font-size:22px; font-weight:800; color:#262626; line-height:1.1; }
            .di-stat-label { font-size:12px; color:#737373; margin-top:2px; }

            .di-table { width:100%; border-collapse:collapse; background:#fff; border-radius:12px; overflow:hidden; border:2px solid #1B4D3E; }
            .di-table th { text-align:left; padding:10px 14px; font-size:12px; font-weight:700; color:#404040; background:#f7f7f7; border-bottom:1px solid #ccc; }
            .di-table td { padding:10px 14px; border-bottom:1px solid #f0f0f0; font-size:13px; }
            .di-table tr:last-child td { border-bottom:none; }
            .di-table tr:hover td { background:#f9fffe; }

            .di-user { display:flex; align-items:center; gap:12px; }
            .di-av { width:40px; height:40px; border-radius:50%; background:#1e40af; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:13px; flex-shrink:0; }
            .di-name { font-weight:600; color:#262626; display:block; }
            .di-email { font-size:12px; color:#a0a0a0; display:block; margin-top:1px; }
            .di-empid { font-family:monospace; font-size:13px; color:#404040; }
            .di-prog { display:inline-block; padding:3px 10px; border-radius:8px; font-size:11px; font-weight:600; background:#EDE9FE; color:#5B21B6; }
            .di-prog.none { background:#f5f5f5; color:#a0a0a0; }

            .badge { padding:4px 10px; border-radius:20px; font-size:11px; font-weight:600; text-transform:capitalize; }
            .badge-active { background:#E8F5E9; color:#1B4D3E; }
            .badge-inactive { background:#FEE2E2; color:#b91c1c; }
            .badge-pending { background:#FEF3C7; color:#B45309; }

            .di-empty { text-align:center; padding:48px 20px; color:#a0a0a0; }
            .di-empty-icon { font-size:36px; margin-bottom:10px; }
            .di-empty-text { font-size:15px; font-weight:500; }

            @media(max-width:768px) {
                .di-filters { flex-direction:column; }
                .di-filters input, .di-filters select { min-width:100%; }
                .di-stats { grid-template-columns:1fr 1fr; }
            }
        </style>

        <div class="di-header">
            <h2>Instructors <span class="di-count" id="di-total">${allInstructors.length}</span></h2>
        </div>

        <div class="di-stats">
            <div class="di-stat">
                <div class="di-stat-icon blue">${icon('instructor', { size: 22 })}</div>
                <div>
                    <div class="di-stat-val">${allInstructors.length}</div>
                    <div class="di-stat-label">Total Instructors</div>
                </div>
            </div>
            <div class="di-stat">
                <div class="di-stat-icon green">${icon('check', { size: 22 })}</div>
                <div>
                    <div class="di-stat-val">${allInstructors.filter(i => i.status === 'active').length}</div>
                    <div class="di-stat-label">Active</div>
                </div>
            </div>
            <div class="di-stat">
                <div class="di-stat-icon amber">${icon('book', { size: 22 })}</div>
                <div>
                    <div class="di-stat-val">${instructorPrograms.length}</div>
                    <div class="di-stat-label">Programs</div>
                </div>
            </div>
        </div>

        <div class="di-filters">
            <input type="text" id="di-search" placeholder="Search name, email, or ID...">
            <select id="di-filter-program">
                <option value="">All Programs</option>
                ${instructorPrograms.map(p => `<option value="${p.id}">${esc(p.code)}${p.name ? ' — ' + esc(p.name) : ''}</option>`).join('')}
            </select>
            <select id="di-filter-status">
                <option value="">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
            </select>
        </div>

        <table class="di-table">
            <thead>
                <tr>
                    <th>Instructor</th>
                    <th>Employee ID</th>
                    <th>Program</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody id="di-tbody">
                ${renderRows(allInstructors)}
            </tbody>
        </table>
    `;

    // Filter logic
    let debounce;
    function filterAndRender() {
        const search = container.querySelector('#di-search').value.toLowerCase();
        const progFilter = container.querySelector('#di-filter-program').value;
        const statusFilter = container.querySelector('#di-filter-status').value;

        const filtered = allInstructors.filter(i => {
            const matchSearch = !search ||
                (i.first_name + ' ' + i.last_name).toLowerCase().includes(search) ||
                (i.email || '').toLowerCase().includes(search) ||
                (i.employee_id || '').toLowerCase().includes(search);
            const matchProg = !progFilter || String(i.program_id) === progFilter;
            const matchStatus = !statusFilter || i.status === statusFilter;
            return matchSearch && matchProg && matchStatus;
        });

        container.querySelector('#di-tbody').innerHTML = renderRows(filtered);
        container.querySelector('#di-total').textContent = filtered.length;
    }

    container.querySelector('#di-search').addEventListener('input', () => {
        clearTimeout(debounce);
        debounce = setTimeout(filterAndRender, 300);
    });
    container.querySelector('#di-filter-program').addEventListener('change', filterAndRender);
    container.querySelector('#di-filter-status').addEventListener('change', filterAndRender);
}

function renderRows(list) {
    if (list.length === 0) {
        return `<tr><td colspan="4">
            <div class="di-empty">
                <div class="di-empty-icon">${iconLg('instructor')}</div>
                <div class="di-empty-text">No instructors found</div>
            </div>
        </td></tr>`;
    }
    return list.map(i => {
        const initials = ((i.first_name || '?')[0] + (i.last_name || '?')[0]).toUpperCase();
        const progLabel = i.program_code
            ? `<span class="di-prog">${esc(i.program_code)}</span>`
            : `<span class="di-prog none">Not assigned</span>`;
        return `<tr>
            <td>
                <div class="di-user">
                    <div class="di-av">${initials}</div>
                    <div>
                        <span class="di-name">${esc(i.first_name)} ${esc(i.last_name)}</span>
                        <span class="di-email">${esc(i.email)}</span>
                    </div>
                </div>
            </td>
            <td><span class="di-empid">${esc(i.employee_id || '—')}</span></td>
            <td>${progLabel}</td>
            <td><span class="badge badge-${i.status}">${i.status}</span></td>
        </tr>`;
    }).join('');
}

function esc(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
}
