/**
 * Dean Sections Page
 * View-only sections with enrollment codes
 */
import { Api } from '../../api.js';

export async function render(container) {
    const res = await Api.get('/SectionsAPI.php?action=list');
    const sections = res.success ? res.data : [];

    container.innerHTML = `
        <style>
            .page-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:24px; }
            .page-header h2 { font-size:22px; font-weight:700; color:#262626; }
            .page-header .count { background:#E8F5E9; color:#1B4D3E; padding:4px 12px; border-radius:20px; font-size:13px; font-weight:600; margin-left:8px; }
            .filters { display:flex; gap:12px; margin-bottom:20px; }
            .filters input { padding:9px 14px; border:1px solid #e0e0e0; border-radius:8px; font-size:14px; min-width:240px; }

            .sections-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(310px,1fr)); gap:16px; }
            .section-card { background:#fff; border:1px solid #e8e8e8; border-radius:14px; overflow:hidden; transition:border-color .2s; }
            .section-card:hover { border-color:#1B4D3E; }
            .section-top { padding:16px 20px; display:flex; justify-content:space-between; align-items:center; }
            .enrollment-code { background:#1B4D3E; color:#fff; padding:5px 12px; border-radius:8px; font-family:monospace; font-size:13px; font-weight:700; letter-spacing:1px; cursor:pointer; }
            .enrollment-code:hover { background:#006428; }
            .badge { padding:4px 10px; border-radius:20px; font-size:11px; font-weight:600; }
            .badge-active { background:#E8F5E9; color:#1B4D3E; }
            .badge-inactive { background:#FEE2E2; color:#b91c1c; }

            .section-body { padding:0 20px 16px; }
            .section-name { font-size:16px; font-weight:700; color:#262626; margin-bottom:2px; }
            .section-subject { font-size:13px; color:#737373; margin-bottom:12px; }
            .section-subject .code { background:#E8F5E9; color:#1B4D3E; padding:2px 6px; border-radius:4px; font-family:monospace; font-size:11px; margin-right:4px; }
            .section-details { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:12px; }
            .detail-item { font-size:12px; color:#737373; }
            .detail-item strong { color:#404040; display:block; font-size:11px; text-transform:uppercase; letter-spacing:.5px; margin-bottom:2px; }
            .enrollment-bar { background:#f0f0f0; height:6px; border-radius:3px; overflow:hidden; margin-bottom:4px; }
            .enrollment-fill { height:100%; border-radius:3px; background:#00461B; }
            .enrollment-text { font-size:11px; color:#737373; }

            .copied-toast { position:fixed; bottom:24px; left:50%; transform:translateX(-50%); background:#1B4D3E; color:#fff; padding:10px 20px; border-radius:8px; font-size:14px; z-index:9999; }
            .empty-state-sm { text-align:center; padding:40px; color:#737373; }
            @media(max-width:768px) { .sections-grid { grid-template-columns:1fr; } }
        </style>

        <div class="page-header"><h2>Sections <span class="count">${sections.length}</span></h2></div>
        <div class="filters"><input type="text" id="search" placeholder="Search section, subject, or instructor..."></div>

        <div class="sections-grid" id="grid">
            ${renderCards(sections)}
        </div>
    `;

    container.querySelector('#search').addEventListener('input', (e) => {
        const q = e.target.value.toLowerCase();
        const filtered = sections.filter(s =>
            (s.section_name + ' ' + s.subject_code + ' ' + s.subject_name + ' ' + (s.instructor_name||'')).toLowerCase().includes(q)
        );
        container.querySelector('#grid').innerHTML = renderCards(filtered);
        bindCopy(container);
    });

    bindCopy(container);
}

function bindCopy(container) {
    container.querySelectorAll('[data-copy]').forEach(el => {
        el.addEventListener('click', () => {
            navigator.clipboard.writeText(el.dataset.copy);
            const t = document.createElement('div');
            t.className = 'copied-toast';
            t.textContent = 'Code copied!';
            document.body.appendChild(t);
            setTimeout(() => t.remove(), 2000);
        });
    });
}

function renderCards(list) {
    if (!list.length) return '<div class="empty-state-sm">No sections found</div>';
    return list.map(s => {
        const pct = s.max_students > 0 ? Math.round((s.student_count / s.max_students) * 100) : 0;
        return `
        <div class="section-card">
            <div class="section-top">
                <span class="enrollment-code" data-copy="${esc(s.enrollment_code)}" title="Click to copy">${esc(s.enrollment_code)}</span>
                <span class="badge badge-${s.status}">${s.status}</span>
            </div>
            <div class="section-body">
                <div class="section-name">${esc(s.section_name)}</div>
                <div class="section-subject"><span class="code">${esc(s.subject_code)}</span>${esc(s.subject_name)}</div>
                <div class="section-details">
                    <div class="detail-item"><strong>Schedule</strong>${esc(s.schedule||'TBA')}</div>
                    <div class="detail-item"><strong>Room</strong>${esc(s.room||'TBA')}</div>
                    <div class="detail-item"><strong>Instructor</strong>${esc(s.instructor_name||'Unassigned')}</div>
                    <div class="detail-item"><strong>Semester</strong>${esc(s.semester_name||'—')}</div>
                </div>
                <div class="enrollment-bar"><div class="enrollment-fill" style="width:${pct}%"></div></div>
                <div class="enrollment-text">${s.student_count} / ${s.max_students} students (${pct}%)</div>
            </div>
        </div>`;
    }).join('');
}

function esc(str) { const d = document.createElement('div'); d.textContent = str||''; return d.innerHTML; }
