/**
 * Dean Subject Offerings Page
 * View-only subject offerings
 */
import { Api } from '../../api.js';

import { esc } from '../../utils/classroom-ui.js';
export async function render(container) {
    const [offRes, semRes] = await Promise.all([
        Api.get('/SubjectOfferingsAPI.php?action=list'),
        Api.get('/SubjectOfferingsAPI.php?action=semesters')
    ]);
    const offerings = offRes.success ? offRes.data : [];
    const semesters = semRes.success ? semRes.data : [];

    let filtered = [...offerings];

    renderView(container, filtered, semesters);
}

function renderView(container, offerings, semesters, semFilter = '') {
    container.innerHTML = `
        <style>
            .page-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:24px; }
            .page-header h2 { font-size:22px; font-weight:700; color:#262626; }
            .page-header .count { background:#00461B; color:#fff; padding:4px 12px; border-radius:20px; font-size:13px; font-weight:600; margin-left:8px; }
            .stats-row { display:grid; grid-template-columns:repeat(4,1fr); gap:16px; margin-bottom:24px; }
            .stat-card { background:#fff; border:1px solid #e8e8e8; border-radius:12px; padding:16px; text-align:center; }
            .stat-card .num { font-size:24px; font-weight:800; color:#1B4D3E; }
            .stat-card .label { font-size:12px; color:#737373; margin-top:2px; }
            .filters { margin-bottom:20px; }
            .filters select { padding:9px 14px; border:1px solid #e0e0e0; border-radius:8px; font-size:14px; min-width:240px; }
            .data-table { width:100%; border-collapse:collapse; font-size:12.5px; background:#fff; border:1.5px solid #374151; }
            .data-table th { background:#00461B; color:#fff; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.4px; padding:8px 14px; border:1px solid #155534; text-align:left; }
            .data-table tbody tr:nth-child(even) { background:#f9fafb; }
            .data-table tbody tr:hover { background:#f0fdf4; }
            .data-table td { border:1px solid #d1d5db; padding:8px 12px; vertical-align:middle; font-size:13px; color:#374151; }
            .subj-code { background:#00461B; color:#fff; padding:3px 8px; border-radius:4px; font-family:monospace; font-size:12px; font-weight:600; margin-right:8px; }
            .meta-badge { background:#f3f4f6; color:#404040; padding:3px 10px; border-radius:20px; font-size:12px; font-weight:500; }
            .badge { padding:4px 10px; border-radius:20px; font-size:11px; font-weight:600; text-transform:capitalize; }
            .badge-open { background:#00461B; color:#fff; }
            .badge-closed { background:#7F1D1D; color:#fff; }
            .badge-cancelled { background:#f3f4f6; color:#737373; }
            .batch-badge { background:#DBEAFE; color:#1E40AF; padding:3px 10px; border-radius:20px; font-size:12px; font-weight:600; }
            .empty-state-sm { text-align:center; padding:40px; color:#737373; }
            .filters { display:flex; gap:12px; margin-bottom:20px; flex-wrap:wrap; }
            .filters select { padding:9px 14px; border:1px solid #e0e0e0; border-radius:8px; font-size:14px; min-width:220px; }
            @media(max-width:768px) { .stats-row { grid-template-columns:1fr 1fr; } }
        </style>

        <div class="stats-row">
            <div class="stat-card"><div class="num">${offerings.length}</div><div class="label">Total Offerings</div></div>
            <div class="stat-card"><div class="num">${offerings.filter(o => o.status==='open').length}</div><div class="label">Active</div></div>
            <div class="stat-card"><div class="num">${offerings.reduce((s,o) => s + (parseInt(o.section_count)||0), 0)}</div><div class="label">Total Sections</div></div>
            <div class="stat-card"><div class="num">${offerings.reduce((s,o) => s + (parseInt(o.student_count)||0), 0)}</div><div class="label">Total Enrollments</div></div>
        </div>

        <div class="filters">
            <select id="filter-sem">
                <option value="">All Semesters</option>
                ${semesters.map(s => `<option value="${s.semester_id}" ${semFilter==s.semester_id?'selected':''}>${esc(s.semester_name)} - ${esc(s.academic_year)}</option>`).join('')}
            </select>
            <select id="filter-batch">
                <option value="">All Batches</option>
                <option value="1st Year">1st Year</option>
                <option value="2nd Year">2nd Year</option>
                <option value="3rd Year">3rd Year</option>
                <option value="4th Year">4th Year</option>
            </select>
        </div>

        <table class="data-table">
            <thead><tr><th>Subject</th><th>Semester</th><th>Batch</th><th>Units</th><th>Sections</th><th>Students</th><th>Status</th></tr></thead>
            <tbody>
                ${offerings.length === 0 ? '<tr><td colspan="7"><div class="empty-state-sm">No offerings found</div></td></tr>' :
                  offerings.map(o => `<tr>
                    <td><span class="subj-code">${esc(o.subject_code)}</span>${esc(o.subject_name)}</td>
                    <td>${esc(o.semester_name||'—')} <span style="color:#737373;font-size:12px">${esc(o.academic_year||'')}</span></td>
                    <td>${o.batch ? `<span class="batch-badge">${esc(o.batch)}</span>` : '<span style="color:#aaa;font-size:12px">—</span>'}</td>
                    <td><span class="meta-badge">${o.units}</span></td>
                    <td><span class="meta-badge">${o.section_count}</span></td>
                    <td><span class="meta-badge">${o.student_count}</span></td>
                    <td><span class="badge badge-${o.status}">${o.status}</span></td>
                  </tr>`).join('')}
            </tbody>
        </table>
    `;

    async function applyFilters() {
        const semId = container.querySelector('#filter-sem').value;
        const batch = container.querySelector('#filter-batch').value;
        let params = semId ? '&semester_id=' + semId : '';
        if (batch) params += '&batch=' + encodeURIComponent(batch);
        const res = await Api.get('/SubjectOfferingsAPI.php?action=list' + params);
        const filtered = res.success ? res.data : [];
        renderView(container, filtered, semesters, semId);
    }
    container.querySelector('#filter-sem').addEventListener('change', applyFilters);
    container.querySelector('#filter-batch').addEventListener('change', applyFilters);
}

// esc() imported from classroom-ui.js (see import above)

