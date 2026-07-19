/**
 * Dean Subjects Page
 * View subjects in dean's department (read-only)
 */
import { Api } from '../../api.js';
import { Auth } from '../../auth.js';

export async function render(container) {
    const res = await Api.get('/SubjectsAPI.php?action=all');
    const allSubjects = res.success ? res.data : [];

    container.innerHTML = `
        <style>
            .page-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:24px; }
            .page-header h2 { font-size:22px; font-weight:700; color:#262626; }
            .page-header .count { background:#E8F5E9; color:#1B4D3E; padding:4px 12px; border-radius:20px; font-size:13px; font-weight:600; margin-left:8px; }
            .filters { display:flex; gap:12px; margin-bottom:20px; flex-wrap:wrap; align-items:center; }
            .filters input { padding:9px 14px; border:1px solid #e0e0e0; border-radius:8px; font-size:14px; min-width:220px; flex:1; }
            .filters select { padding:9px 14px; border:1px solid #e0e0e0; border-radius:8px; font-size:14px; background:#fff; cursor:pointer; }
            .filter-count { font-size:13px; color:#737373; margin-left:4px; white-space:nowrap; }
            .btn-clear { background:none; border:none; color:#1B4D3E; font-size:13px; cursor:pointer; text-decoration:underline; padding:0; white-space:nowrap; }
            .btn-clear:hover { color:#006428; }
            .data-table { width:100%; border-collapse:collapse; font-size:12.5px; background:#fff; border:1.5px solid #374151; }
            .data-table th { background:#2d6a4f; color:#fff; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.4px; padding:8px 14px; border:1px solid #155534; text-align:left; }
            .data-table tbody tr:nth-child(even) { background:#f9fafb; }
            .data-table tbody tr:hover { background:#f0fdf4; }
            .data-table td { border:1px solid #d1d5db; padding:8px 12px; vertical-align:middle; font-size:13px; color:#374151; }
            .subj-code { background:#E8F5E9; color:#1B4D3E; padding:3px 8px; border-radius:4px; font-family:monospace; font-size:12px; font-weight:600; }
            .badge { padding:3px 10px; border-radius:20px; font-size:11px; font-weight:700; text-transform:capitalize; }
            .badge-active { background:#dcfce7; color:#15803d; padding:3px 10px; border-radius:20px; font-size:11px; font-weight:700; }
            .badge-inactive { background:#fee2e2; color:#b91c1c; padding:3px 10px; border-radius:20px; font-size:11px; font-weight:700; }
            .units-badge { background:#f3f4f6; color:#404040; padding:3px 10px; border-radius:20px; font-size:12px; font-weight:600; }
            .empty-state-sm { text-align:center; padding:40px; color:#737373; }
        </style>

        <div class="filters">
            <input type="text" id="search" placeholder="Search subject code or name...">
            <select id="filter-program">
                <option value="">All Programs</option>
                ${[...new Set(allSubjects.map(s => s.program_code).filter(Boolean))].sort()
                    .map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('')}
            </select>
            <select id="filter-status">
                <option value="">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
            </select>
            <span class="filter-count" id="filter-count"></span>
            <button class="btn-clear" id="btn-clear" style="display:none;">Clear filters</button>
        </div>
        <table class="data-table">
            <thead><tr><th>Code</th><th>Subject Name</th><th>Program</th><th>Units</th><th>Status</th></tr></thead>
            <tbody id="table-body">${renderRows(allSubjects)}</tbody>
        </table>
    `;

    const searchEl  = container.querySelector('#search');
    const progEl    = container.querySelector('#filter-program');
    const statusEl  = container.querySelector('#filter-status');
    const countEl   = container.querySelector('#filter-count');
    const clearBtn  = container.querySelector('#btn-clear');

    function applyFilters() {
        const q    = searchEl.value.toLowerCase();
        const prog = progEl.value.toLowerCase();
        const stat = statusEl.value.toLowerCase();
        const isFiltered = q || prog || stat;

        const filtered = allSubjects.filter(s => {
            const matchSearch = !q || (s.subject_code + ' ' + s.subject_name).toLowerCase().includes(q);
            const matchProg   = !prog || (s.program_code || '').toLowerCase() === prog;
            const matchStat   = !stat || (s.status || '').toLowerCase() === stat;
            return matchSearch && matchProg && matchStat;
        });

        container.querySelector('#table-body').innerHTML = renderRows(filtered);
        countEl.textContent  = isFiltered ? `Showing ${filtered.length} of ${allSubjects.length}` : '';
        clearBtn.style.display = isFiltered ? '' : 'none';
    }

    let debounce;
    searchEl.addEventListener('input', () => { clearTimeout(debounce); debounce = setTimeout(applyFilters, 250); });
    progEl.addEventListener('change', applyFilters);
    statusEl.addEventListener('change', applyFilters);
    clearBtn.addEventListener('click', () => {
        searchEl.value = '';
        progEl.value   = '';
        statusEl.value = '';
        applyFilters();
    });
}

function renderRows(list) {
    if (!list.length) return '<tr><td colspan="5"><div class="empty-state-sm">No subjects found</div></td></tr>';
    return list.map(s => `
        <tr>
            <td><span class="subj-code">${esc(s.subject_code)}</span></td>
            <td>${esc(s.subject_name)}</td>
            <td style="color:#737373">${esc(s.program_code || 'General')}</td>
            <td><span class="units-badge">${s.units}</span></td>
            <td><span class="badge badge-${s.status}">${s.status}</span></td>
        </tr>`).join('');
}

function esc(str) { const d = document.createElement('div'); d.textContent = str||''; return d.innerHTML; }
