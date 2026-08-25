/**
 * Dean Reports — department performance, at-risk students & flags for attention
 */
import { Api } from '../../api.js';
import { icon } from '../../utils/icons.js';

const G  = '#00461B';
const GL = '#E8F5EC';

// Status ramp — shared by every score-driven bar/badge on this page.
// good ≥75%, warn 50–74%, critical <50% (mirrors the pass threshold used app-wide).
const STATUS = {
    good:     { bar: 'linear-gradient(90deg,#22C55E,#16A34A)', text: '#15803D', bg: '#DCFCE7', ring: '#BBF7D0', label: 'On track (≥75%)' },
    warn:     { bar: 'linear-gradient(90deg,#F59E0B,#D97706)', text: '#B45309', bg: '#FEF3C7', ring: '#FDE68A', label: 'Needs support (50–74%)' },
    critical: { bar: 'linear-gradient(90deg,#EF4444,#DC2626)', text: '#B91C1C', bg: '#FEE2E2', ring: '#FECACA', label: 'Critical (<50%)' },
};
const statusFor = v => v >= 75 ? STATUS.good : v >= 50 ? STATUS.warn : STATUS.critical;

export async function render(container) {
    container.innerHTML = `<div class="rp-loading"><div class="rp-spin"></div></div>`;

    const res  = await Api.get('/DashboardAPI.php?action=dean');
    const data = res.success ? (res.data || {}) : {};

    const stats            = data.stats               || {};
    const dept             = data.department           || {};
    const subjectStats     = data.subject_stats        || [];
    const programPerf      = data.program_performance  || [];
    const atRiskStudents   = data.at_risk_students      || [];
    const nonEngaging      = data.non_engaging          || [];

    // Merge into one "needs attention" list, flagged with a reason, worst first.
    const flagged = [
        ...atRiskStudents.map(s => ({ ...s, _reason: 'at_risk' })),
        ...nonEngaging.map(s => ({ ...s, _reason: 'inactive' })),
    ];

    const totalAttempts = +(stats.total_attempts || 0);
    const passed        = +(stats.passed || 0);
    const failed        = +(stats.failed || 0);
    const passRate      = totalAttempts > 0 ? Math.round((passed / totalAttempts) * 100) : 0;
    const avgScore      = stats.avg_score ? Math.round(+stats.avg_score) : 0;

    const worstSubjects = [...subjectStats]
        .filter(s => s.avg_score != null)
        .sort((a, b) => parseFloat(a.avg_score) - parseFloat(b.avg_score))
        .slice(0, 8);

    const programRows = [...programPerf].sort((a, b) => (parseFloat(a.avg_score) || 0) - (parseFloat(b.avg_score) || 0));

    container.innerHTML = `
        <style>${styles()}</style>

        <div class="rp-hero">
            <div class="rp-hero-glow"></div>
            <div class="rp-hero-top">
                <div>
                    <p class="rp-hero-eyebrow">${esc(dept.department_name || 'Department')}</p>
                    <h1>Academic Reports</h1>
                    <p class="rp-hero-sub">Struggling students &amp; performance overview</p>
                </div>
                <button type="button" class="rp-print" id="rp-print">${icon('document', { size: 14 })} Print</button>
            </div>

            <div class="rp-hero-body">
                <div class="rp-hero-stats">
                    <div class="rp-hero-stat">
                        <span class="rp-hero-stat-val">${stats.students ?? 0}</span>
                        <span class="rp-hero-stat-lbl">Students</span>
                    </div>
                    <div class="rp-hero-divider"></div>
                    <div class="rp-hero-stat">
                        <span class="rp-hero-stat-val rp-hero-stat-val--${avgScore >= 75 ? 'good' : avgScore >= 50 ? 'warn' : 'bad'}">${avgScore}%</span>
                        <span class="rp-hero-stat-lbl">Avg Quiz Score</span>
                    </div>
                    <div class="rp-hero-divider"></div>
                    <div class="rp-hero-stat">
                        <span class="rp-hero-stat-val rp-hero-stat-val--${passRate >= 75 ? 'good' : passRate >= 50 ? 'warn' : 'bad'}">${passRate}%</span>
                        <span class="rp-hero-stat-lbl">Pass Rate</span>
                    </div>
                </div>
                <div class="rp-hero-alerts">
                    <span class="rp-hero-alert rp-hero-alert--risk">${icon('alert', { size: 13 })} ${atRiskStudents.length} At Risk</span>
                    <span class="rp-hero-alert rp-hero-alert--warn">${icon('clock', { size: 13 })} ${nonEngaging.length} Not Engaging</span>
                </div>
            </div>
        </div>

        <div class="rp-card">
            <div class="rp-card-hdr">
                <div class="rp-card-title">
                    <div class="rp-card-icon rp-card-icon--critical">${icon('siren', { size: 16 })}</div>
                    <div>
                        <h2>Students Needing Attention</h2>
                        <p class="rp-card-sub">Flagged by low quiz average or zero completed quiz activity</p>
                    </div>
                </div>
                <input type="text" id="rp-search" placeholder="Search name or ID…" class="rp-search">
            </div>
            <div id="rp-flagged-body">
                ${renderFlaggedTable(flagged)}
            </div>
        </div>

        <div class="rp-card">
            <div class="rp-card-hdr">
                <div class="rp-card-title">
                    <div class="rp-card-icon">${icon('chart', { size: 16 })}</div>
                    <div>
                        <h2>Program Performance</h2>
                        <p class="rp-card-sub">Average quiz score by program</p>
                    </div>
                </div>
                ${statusLegend()}
            </div>
            ${programRows.length ? `
            <div class="rp-barlist">
                ${programRows.map(p => barRow({
                    title: `${p.program_code} — ${p.program_name}`,
                    meta: `${p.attempts ?? 0} attempts · ${p.passed ?? 0} passed · ${p.failed ?? 0} failed`,
                    value: p.avg_score != null ? parseFloat(p.avg_score) : null,
                })).join('')}
            </div>` : '<p class="rp-empty">No program data available.</p>'}
        </div>

        <div class="rp-card">
            <div class="rp-card-hdr">
                <div class="rp-card-title">
                    <div class="rp-card-icon rp-card-icon--warn">${icon('warning', { size: 16 })}</div>
                    <div>
                        <h2>Subjects Needing Attention</h2>
                        <p class="rp-card-sub">Lowest average quiz score, worst first</p>
                    </div>
                </div>
                ${statusLegend()}
            </div>
            ${worstSubjects.length ? `
            <div class="rp-barlist">
                ${worstSubjects.map(s => barRow({
                    title: `${s.subject_code} — ${s.subject_name}`,
                    meta: `${s.student_count ?? 0} student${s.student_count == 1 ? '' : 's'} · ${s.attempts ?? 0} attempts`,
                    value: parseFloat(s.avg_score),
                })).join('')}
            </div>` : '<p class="rp-empty">No subject data available.</p>'}
        </div>
    `;

    container.querySelector('#rp-print')?.addEventListener('click', () => window.print());

    let debounce;
    container.querySelector('#rp-search')?.addEventListener('input', (e) => {
        clearTimeout(debounce);
        const q = e.target.value;
        debounce = setTimeout(() => {
            const filtered = q.trim()
                ? flagged.filter(s => `${s.first_name} ${s.last_name} ${s.student_id || ''}`.toLowerCase().includes(q.trim().toLowerCase()))
                : flagged;
            container.querySelector('#rp-flagged-body').innerHTML = renderFlaggedTable(filtered);
        }, 250);
    });
}

function statusLegend() {
    return `
    <div class="rp-legend">
        ${Object.values(STATUS).map(s => `<span class="rp-legend-item"><span class="rp-legend-dot" style="background:${s.bar}"></span>${esc(s.label)}</span>`).join('')}
    </div>`;
}

/**
 * One row of a bar-list: title + meta on top, a thin horizontal bar (colored
 * by status threshold) with the value directly labeled at its tip. Scaled
 * against a fixed 0–100% track since every value here is a percentage.
 */
function barRow({ title, meta, value }) {
    const has = value != null && !Number.isNaN(value);
    const pct = has ? Math.max(0, Math.min(100, value)) : 0;
    const st  = has ? statusFor(value) : null;
    return `
    <div class="rp-bar-row" title="${has ? esc(title) + ': ' + value.toFixed(1) + '%' : esc(title)}">
        <div class="rp-bar-row-top">
            <span class="rp-bar-title">${esc(title)}</span>
            <span class="rp-bar-value" style="color:${has ? st.text : '#9CA3AF'}">${has ? value.toFixed(1) + '%' : 'No data'}</span>
        </div>
        <div class="rp-bar-track">
            ${has ? `<div class="rp-bar-fill" style="width:${pct}%; background:${st.bar}"></div>` : ''}
        </div>
        <span class="rp-bar-meta">${esc(meta)}</span>
    </div>`;
}

function renderFlaggedTable(list) {
    if (!list.length) {
        return `<div class="rp-success">${icon('checkCircle', { size: 20 })} No students currently flagged — everyone is on track.</div>`;
    }
    // At-risk (lowest average first) before inactive.
    const sorted = [...list].sort((a, b) => {
        if (a._reason !== b._reason) return a._reason === 'at_risk' ? -1 : 1;
        return (parseFloat(a.avg_score) || 0) - (parseFloat(b.avg_score) || 0);
    });
    return `
        <div class="rp-flagged-list">
            ${sorted.map(s => `
                <div class="rp-flagged-row">
                    <div class="rp-avatar rp-avatar--${s._reason === 'at_risk' ? 'risk' : 'inactive'}">${esc(((s.first_name||'?')[0] + (s.last_name||'?')[0]).toUpperCase())}</div>
                    <div class="rp-flagged-info">
                        <span class="rp-flagged-name">${esc(s.first_name)} ${esc(s.last_name)} <span class="rp-flagged-prog">${esc(s.program_code || '')}</span></span>
                        <span class="rp-flagged-detail">${s._reason === 'at_risk'
                            ? `Avg score <strong>${parseFloat(s.avg_score).toFixed(1)}%</strong> across ${s.attempts} attempt${s.attempts == 1 ? '' : 's'}`
                            : `No completed quiz activity across ${s.enrolled_subjects} enrolled subject${s.enrolled_subjects == 1 ? '' : 's'}`}
                        </span>
                    </div>
                    <span class="rp-id">${esc(s.student_id || 'N/A')}</span>
                    ${flagBadge(s._reason)}
                </div>`).join('')}
        </div>`;
}

function flagBadge(reason) {
    return reason === 'at_risk'
        ? `<span class="rp-flag rp-flag--danger">${icon('alert', { size: 12 })} At Risk</span>`
        : `<span class="rp-flag rp-flag--warn">${icon('clock', { size: 12 })} Not Engaging</span>`;
}

function styles() {
    return `
        .rp-loading { display:flex; justify-content:center; padding:80px; }
        .rp-spin { width:40px; height:40px; border:3px solid #eee; border-top-color:${G}; border-radius:50%; animation:rpSpin .8s linear infinite; }
        @keyframes rpSpin { to { transform:rotate(360deg); } }

        /* ── Hero banner — clean, white, color used only on the numbers that need it ── */
        .rp-hero {
            position:relative; border-radius:18px; margin-bottom:22px;
            padding:26px 28px 22px;
            background:#fff; border:1px solid #ECECEC;
            box-shadow:0 1px 2px rgba(16,24,40,.04), 0 1px 3px rgba(16,24,40,.06);
        }
        .rp-hero-glow { display:none; }
        .rp-hero-top { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; flex-wrap:wrap; }
        .rp-hero-eyebrow { font-size:11.5px; font-weight:700; text-transform:uppercase; letter-spacing:.6px; color:#9CA3AF; margin:0 0 6px; }
        .rp-hero h1 { font-size:24px; font-weight:800; color:#111; margin:0 0 4px; letter-spacing:-.3px; }
        .rp-hero-sub { font-size:13px; color:#6B7280; margin:0; }
        .rp-print {
            display:inline-flex; align-items:center; gap:6px; padding:9px 16px; border-radius:10px;
            background:#fff; border:1px solid #E5E7EB;
            font-size:13px; font-weight:600; color:#374151; cursor:pointer; transition:background .15s;
        }
        .rp-print:hover { background:#F9FAFB; }

        .rp-hero-body {
            display:flex; align-items:center; justify-content:space-between; gap:20px; flex-wrap:wrap;
            margin-top:22px; padding-top:20px; border-top:1px solid #F3F4F6;
        }
        .rp-hero-stats { display:flex; align-items:center; gap:26px; flex-wrap:wrap; }
        .rp-hero-stat { display:flex; flex-direction:column; gap:2px; }
        .rp-hero-stat-val { font-size:28px; font-weight:800; color:#111; line-height:1; letter-spacing:-.5px; }
        .rp-hero-stat-val--good { color:${G}; }
        .rp-hero-stat-val--warn { color:#B45309; }
        .rp-hero-stat-val--bad  { color:#DC2626; }
        .rp-hero-stat-lbl { font-size:11px; font-weight:600; color:#9CA3AF; text-transform:uppercase; letter-spacing:.4px; }
        .rp-hero-divider { width:1px; height:30px; background:#E5E7EB; }

        .rp-hero-alerts { display:flex; gap:10px; flex-wrap:wrap; }
        .rp-hero-alert {
            display:inline-flex; align-items:center; gap:7px; padding:8px 14px; border-radius:10px;
            font-size:12.5px; font-weight:700; white-space:nowrap; border:1px solid transparent;
        }
        .rp-hero-alert--risk { background:#FEF2F2; color:#DC2626; border-color:#FEE2E2; }
        .rp-hero-alert--warn { background:#FFFBEB; color:#B45309; border-color:#FEF3C7; }

        @media (max-width:720px) {
            .rp-hero-body { flex-direction:column; align-items:flex-start; }
        }

        /* ── Cards ── */
        .rp-card { background:#fff; border:1px solid #ECECEC; border-radius:16px; padding:22px 24px 18px; margin-bottom:20px; box-shadow:0 1px 2px rgba(16,24,40,.04), 0 1px 3px rgba(16,24,40,.06); }
        .rp-card-hdr { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; margin-bottom:16px; flex-wrap:wrap; }
        .rp-card-title { display:flex; align-items:center; gap:12px; }
        .rp-card-icon {
            width:34px; height:34px; border-radius:10px; flex-shrink:0;
            background:linear-gradient(135deg,${G},#0b6b31); color:#fff;
            display:flex; align-items:center; justify-content:center;
            box-shadow:0 4px 10px rgba(0,70,27,.25);
        }
        .rp-card-icon--warn     { background:linear-gradient(135deg,#F59E0B,#B45309); color:#fff; box-shadow:0 4px 10px rgba(180,83,9,.28); }
        .rp-card-icon--critical { background:linear-gradient(135deg,#EF4444,#B91C1C); color:#fff; box-shadow:0 4px 10px rgba(220,38,38,.28); }
        .rp-card-hdr h2 { font-size:14.5px; font-weight:800; color:#111827; margin:0; letter-spacing:-.1px; }
        .rp-card-sub { font-size:11.5px; color:#9CA3AF; margin:2px 0 0; }
        .rp-search { padding:8px 12px; border:1px solid #E5E7EB; border-radius:9px; font-size:13px; min-width:220px; outline:none; transition:border-color .15s; }
        .rp-search:focus { border-color:${G}; }

        /* ── Status legend ── */
        .rp-legend { display:flex; gap:14px; flex-wrap:wrap; }
        .rp-legend-item { display:inline-flex; align-items:center; gap:6px; font-size:11px; font-weight:600; color:#6B7280; white-space:nowrap; }
        .rp-legend-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }

        /* ── Bar list (Program / Subject performance) ── */
        .rp-barlist { display:flex; flex-direction:column; }
        .rp-bar-row { padding:12px 4px; border-radius:10px; transition:background .15s; }
        .rp-bar-row:hover { background:#FAFAFA; }
        .rp-bar-row + .rp-bar-row { border-top:1px solid #F3F4F6; }
        .rp-bar-row-top { display:flex; align-items:baseline; justify-content:space-between; gap:12px; margin-bottom:6px; }
        .rp-bar-title { font-size:13px; font-weight:700; color:#111827; }
        .rp-bar-value { font-size:13px; font-weight:800; white-space:nowrap; }
        .rp-bar-track { height:10px; background:#F3F4F6; border-radius:5px; overflow:hidden; }
        .rp-bar-fill { height:100%; border-radius:4px; transition:width .5s ease; box-shadow:0 1px 3px rgba(0,0,0,.12) inset; }
        .rp-bar-meta { font-size:11.5px; color:#9CA3AF; margin-top:5px; display:block; }

        /* ── Flagged students list ── */
        .rp-flagged-list { display:flex; flex-direction:column; }
        .rp-flagged-row { display:flex; align-items:center; gap:13px; padding:11px 6px; border-radius:10px; transition:background .15s; }
        .rp-flagged-row:hover { background:#FAFAFA; }
        .rp-flagged-row + .rp-flagged-row { border-top:1px solid #F3F4F6; }
        .rp-avatar { width:36px; height:36px; border-radius:50%; flex-shrink:0; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:700; background:${G}; color:#fff; }
        .rp-avatar--risk { color:#FF8A8A; }
        .rp-avatar--inactive { color:#FFCE7A; }
        .rp-flagged-info { flex:1; min-width:0; display:flex; flex-direction:column; }
        .rp-flagged-name { font-size:13px; font-weight:700; color:#111827; }
        .rp-flagged-prog { font-size:11px; font-weight:600; color:#9CA3AF; }
        .rp-flagged-detail { font-size:11.5px; color:#9CA3AF; margin-top:1px; }
        .rp-id { font-size:11.5px; color:#9CA3AF; white-space:nowrap; }

        .rp-flag { display:inline-flex; align-items:center; gap:5px; padding:5px 11px; border-radius:999px; font-size:11.5px; font-weight:700; white-space:nowrap; border:1px solid transparent; }
        .rp-flag--danger { background:#FEF2F2; color:#DC2626; border-color:#FEE2E2; }
        .rp-flag--warn { background:#FFFBEB; color:#B45309; border-color:#FEF3C7; }

        .rp-empty { text-align:center; padding:28px; color:#9CA3AF; font-size:13px; margin:0; }
        .rp-success { display:flex; align-items:center; justify-content:center; gap:8px; text-align:center; padding:24px; color:${G}; background:${GL}; border-radius:10px; font-size:13.5px; font-weight:600; }

        @media print {
            .rp-print, .rp-search { display:none; }
        }
        @media (max-width:640px) {
            .rp-card-hdr { flex-direction:column; align-items:stretch; }
            .rp-search { width:100%; }
        }
    `;
}

function esc(str) {
    const d = document.createElement('div');
    d.textContent = str ?? '';
    return d.innerHTML;
}
