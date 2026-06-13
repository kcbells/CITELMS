/**
 * Student Analytics — subjects you struggle with, quiz & lesson performance
 */
import { Api } from '../../api.js';
import { icon, iconLg } from '../../utils/icons.js';
const G = '#00461B';
const M = '#6B0F1A';
const Y = '#F59E0B';

export async function render(container) {
    container.innerHTML = '<div style="padding:48px;text-align:center;color:#737373">Loading analytics…</div>';

    const res = await Api.get('/ProgressAPI.php?action=grades');
    const subjects = res.success ? (res.data || []) : [];

    const analyzed = subjects.map(s => {
        const avg = s.avg_score != null ? parseFloat(s.avg_score) : null;
        const lessonPct = parseInt(s.lesson_progress || 0, 10);
        const attempted = parseInt(s.quizzes_attempted || 0, 10);
        const total = parseInt(s.total_quizzes || 0, 10);
        const passed = parseInt(s.quizzes_passed || 0, 10);
        let struggleScore = 0;
        if (avg != null && avg < 75) struggleScore += (75 - avg);
        if (lessonPct < 60) struggleScore += (60 - lessonPct) * 0.5;
        if (total > 0 && attempted < total) struggleScore += (total - attempted) * 8;
        if (attempted > 0 && passed < attempted) struggleScore += (attempted - passed) * 12;
        let level = 'good';
        if (struggleScore >= 40) level = 'high';
        else if (struggleScore >= 18) level = 'medium';
        return { ...s, avg, lessonPct, struggleScore, level };
    }).sort((a, b) => b.struggleScore - a.struggleScore);

    const struggling = analyzed.filter(s => s.level !== 'good');
    const overallAvg = analyzed.filter(s => s.avg != null).length
        ? (analyzed.reduce((sum, s) => sum + (s.avg || 0), 0) / analyzed.filter(s => s.avg != null).length).toFixed(1)
        : '—';

    container.innerHTML = `
        <style>
            .sa-wrap { max-width:100%; }
            .sa-hero { background:${G}; color:#fff; border-radius:16px; padding:28px 32px; margin-bottom:24px; }
            .sa-hero h1 { font-size:24px; font-weight:800; margin:0 0 6px; }
            .sa-hero p { margin:0; opacity:.88; font-size:14px; }
            .sa-stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:14px; margin-bottom:24px; }
            .sa-stat { background:#fff; border-radius:14px; padding:18px; }
            .sa-stat-val { font-size:26px; font-weight:800; color:#111; }
            .sa-stat-lbl { font-size:12px; color:#6B7280; margin-top:4px; font-weight:600; }
            .sa-section { background:#fff; border-radius:14px; padding:22px 24px; margin-bottom:20px; }
            .sa-section h2 { font-size:16px; font-weight:800; color:#111; margin:0 0 16px; display:flex; align-items:center; gap:8px; }
            .sa-row { display:grid; grid-template-columns:1fr 100px 100px 100px 90px; gap:12px; align-items:center; padding:14px 0; border-bottom:1px solid #F3F4F6; }
            .sa-row:last-child { border-bottom:none; }
            .sa-th { font-size:11px; font-weight:700; color:#9CA3AF; text-transform:uppercase; padding-bottom:10px; border-bottom:1px solid #E5E7EB; }
            .sa-code { font-family:monospace; font-size:11px; font-weight:700; color:${G}; }
            .sa-name { font-size:14px; font-weight:600; color:#111; }
            .sa-sub { font-size:12px; color:#6B7280; }
            .sa-pill { display:inline-block; padding:4px 10px; border-radius:20px; font-size:11px; font-weight:700; }
            .sa-pill.high { background:#FDF2F4; color:${M}; }
            .sa-pill.medium { background:#FEF9C3; color:#92400E; }
            .sa-pill.good { background:#E8F5EC; color:${G}; }
            .sa-bar { height:8px; background:#F3F4F6; border-radius:4px; overflow:hidden; margin-top:6px; }
            .sa-bar-fill { height:100%; border-radius:4px; }
            .sa-link { font-size:12px; font-weight:700; color:${G}; text-decoration:none; }
            .sa-empty { text-align:center; padding:40px 20px; color:#9CA3AF; }
            @media(max-width:800px) { .sa-row, .sa-th { grid-template-columns:1fr; gap:6px; } }
        </style>
        <div class="sa-wrap">
            <div class="sa-hero">
                <h1>My Analytics</h1>
                <p>See where you are doing well and which subjects need more focus.</p>
            </div>
            <div class="sa-stats">
                <div class="sa-stat"><div class="sa-stat-val">${subjects.length}</div><div class="sa-stat-lbl">Enrolled Subjects</div></div>
                <div class="sa-stat"><div class="sa-stat-val">${overallAvg}${overallAvg !== '—' ? '%' : ''}</div><div class="sa-stat-lbl">Average Quiz Score</div></div>
                <div class="sa-stat"><div class="sa-stat-val" style="color:${M}">${struggling.length}</div><div class="sa-stat-lbl">Needs Attention</div></div>
            </div>
            <div class="sa-section">
                <h2>${icon('chart', { size: 18 })} Subject Performance</h2>
                ${analyzed.length === 0 ? '<div class="sa-empty">No enrolled subjects yet.</div>' : `
                <div class="sa-row sa-th"><span>Subject</span><span>Quiz Avg</span><span>Lessons</span><span>Quizzes</span><span>Status</span></div>
                ${analyzed.map(s => {
                    const avg = s.avg != null ? s.avg + '%' : '—';
                    const barW = s.avg != null ? s.avg : s.lessonPct;
                    const barColor = s.level === 'high' ? M : s.level === 'medium' ? Y : G;
                    const pill = s.level === 'high' ? 'Needs work' : s.level === 'medium' ? 'Improving' : 'On track';
                    const href = `#student/subject?subject_id=${s.subject_id}`;
                    return `<div class="sa-row">
                        <div>
                            <div class="sa-code">${esc(s.subject_code)}</div>
                            <div class="sa-name">${esc(s.subject_name)}</div>
                            <div class="sa-bar"><div class="sa-bar-fill" style="width:${Math.min(100, barW)}%;background:${barColor}"></div></div>
                            <a href="${href}" class="sa-link">Open subject →</a>
                        </div>
                        <div><strong>${avg}</strong></div>
                        <div>${s.lessonPct}%</div>
                        <div>${s.quizzes_passed}/${s.total_quizzes} passed</div>
                        <div><span class="sa-pill ${s.level}">${pill}</span></div>
                    </div>`;
                }).join('')}
                `}
            </div>
            ${struggling.length ? `
            <div class="sa-section" style="background:#FDF2F4">
                <h2 style="color:${M}">${icon('warning', { size: 18 })} Subjects to Focus On</h2>
                <ul style="margin:0;padding-left:20px;color:#404040;line-height:1.7;font-size:14px">
                    ${struggling.slice(0, 5).map(s => `<li><strong>${esc(s.subject_code)}</strong> — ${esc(s.subject_name)}: review lessons and retake quizzes where allowed.</li>`).join('')}
                </ul>
            </div>` : ''}
        </div>`;
}

function esc(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
}
