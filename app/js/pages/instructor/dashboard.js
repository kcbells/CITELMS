/**
 * Instructor Dashboard — student-uniform shell
 */
import { Api } from '../../api.js';
import { Auth } from '../../auth.js';
import { subjectColor } from '../../utils/subject-colors.js';
import { icon } from '../../utils/icons.js';

const inl = { size: 14, className: 'ui-icon-inline' };
const G = '#00461B';
const G2 = '#006428';
const BORDER = '#E5E7EB';

export async function render(container) {
    container.innerHTML = `<div class="sd-loading"><div class="sd-spin"></div></div>`;

    const [res, semRes, annRes] = await Promise.all([
        Api.get('/DashboardAPI.php?action=instructor'),
        Api.get('/SemesterAPI.php?action=list'),
        Api.get('/AnnouncementsAPI.php?action=instructor-list')
    ]);

    await Auth.getUser();
    const user = Auth.user() || {};
    const data = res.success ? (res.data || {}) : {};
    const stats = data.stats || {};
    const classes = data.classes || [];
    const announcements = annRes.success ? (annRes.data || []) : [];
    const annBySubject = groupAnnouncements(announcements, classes);

    const semesters = semRes.success ? (semRes.data || []) : [];
    const activeSem = semesters.find(s => s.status === 'active') || null;
    const fallbackSem = semesters.find(s => s.status === 'upcoming') || null;
    const semesterName = activeSem?.semester_name || fallbackSem?.semester_name || 'No active semester';
    const academicYear = activeSem?.academic_year || fallbackSem?.academic_year || '—';

    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good Morning' : hour < 18 ? 'Good Afternoon' : 'Good Evening';
    const todayStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    const progressValue = clamp(Math.round(Number(stats.avg_score || stats.completion_rate || 0)));

    container.innerHTML = `
        <style>${styles()}</style>
        <div class="sd-wrap">
            <div class="sd-header">
                <div style="flex:1">
                    <h1>${greeting}, ${esc(user.first_name || 'Instructor')}</h1>
                    <p class="sd-header-sub">${todayStr}</p>
                    <div class="sd-chips">
                        <span class="sd-chip sd-chip--muted">Employee ID: ${esc(user.employee_id || '—')}</span>
                        <span class="sd-chip">${esc(user.department_name || user.department_code || 'Department')}</span>
                    </div>
                    <div class="sd-academic">
                        <div class="sd-academic-item">
                            <span class="sd-academic-label">Department</span>
                            <span class="sd-academic-value">${esc(user.department_name || user.department_code || '—')}</span>
                        </div>
                        <div class="sd-academic-item">
                            <span class="sd-academic-label">Academic Year</span>
                            <span class="sd-academic-value">${esc(academicYear)}</span>
                        </div>
                        <div class="sd-academic-item">
                            <span class="sd-academic-label">Current Semester</span>
                            <span class="sd-academic-value">${esc(semesterName)}</span>
                        </div>
                    </div>
                </div>
                <div class="sd-ring">
                    <svg width="74" height="74" viewBox="0 0 74 74">
                        <circle cx="37" cy="37" r="30" fill="none" stroke="#F0F0F0" stroke-width="6"/>
                        <circle cx="37" cy="37" r="30" fill="none" stroke="${G}" stroke-width="6"
                            stroke-dasharray="${progressValue * 1.885} 188.5" stroke-linecap="round"/>
                    </svg>
                    <div class="sd-ring-val">${progressValue}%</div>
                    <div class="sd-ring-label">${stats.avg_score ? 'Avg Score' : 'Completion'}</div>
                </div>
            </div>

            <div class="sd-panel">
                <div class="sd-panel-hdr">
                    <h3>My Classes</h3>
                    <a href="#instructor/my-classes">View all</a>
                </div>
                ${classes.length === 0
                    ? '<div class="sd-empty">No classes assigned yet.</div>'
                    : `<div class="sd-subj-grid">${classes.map(c => subjCard(c, annBySubject)).join('')}</div>
                       <p style="margin-top:16px;text-align:center;"><a href="#instructor/my-classes" style="font-size:13px;font-weight:700;color:${G};">Manage all subjects & sections →</a></p>`
                }
            </div>
        </div>
    `;

    container.style.background = '#fff';
    const pageContent = container.closest('.page-content');
    if (pageContent) {
        pageContent.style.background = '#fff';
        pageContent.classList.add('sd-page-white');
    }
}

function styles() {
    return `
        .sd-wrap { background:#fff; min-height:100%; }
        .page-content.sd-page-white { background:#fff !important; }
        .sd-loading { display:flex; justify-content:center; padding:80px; background:#fff; }
        .sd-spin {
            width:40px; height:40px; border:3px solid #eee; border-top-color:${G};
            border-radius:50%; animation:sdSpin .8s linear infinite;
        }
        @keyframes sdSpin { to { transform:rotate(360deg); } }

        .sd-header {
            background:#fff; border:1px solid #EBEBEB; border-radius:16px;
            padding:28px 32px; margin-bottom:24px; display:flex; justify-content:space-between;
            align-items:center; gap:24px; flex-wrap:wrap; box-shadow:0 2px 12px rgba(0,70,27,.06);
        }
        .sd-header h1 { font-size:26px; font-weight:800; color:#111; margin:0 0 4px; letter-spacing:-.4px; }
        .sd-header-sub { font-size:14px; color:#6B7280; margin:0 0 16px; }

        .sd-chips { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:4px; }
        .sd-chip {
            font-size:12px; font-weight:600; padding:5px 12px; border-radius:4px;
            background:#fff; color:${G}; border:1px solid ${G};
        }
        .sd-chip--muted { color:#374151; border-color:${BORDER}; }

        .sd-academic { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; padding-top:16px; border-top:1px solid ${BORDER}; margin-top:4px; }
        .sd-academic-item { background:#fff; border:1px solid ${BORDER}; border-radius:8px; padding:12px 14px; }
        .sd-academic-label {
            display:block; font-size:10px; font-weight:700; text-transform:uppercase;
            letter-spacing:.8px; color:#9CA3AF; margin-bottom:4px;
        }
        .sd-academic-value { display:block; font-size:14px; font-weight:700; color:${G}; line-height:1.35; }

        .sd-ring { width:88px; min-width:88px; position:relative; text-align:center; }
        .sd-ring svg { transform:rotate(-90deg); display:block; margin:0 auto; }
        .sd-ring-val {
            position:absolute; top:21px; left:0; right:0;
            font-size:15px; font-weight:800; color:${G};
        }
        .sd-ring-label { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.6px; color:#9CA3AF; margin-top:4px; }

        .sd-panel {
            background:#fff; border:1px solid #EBEBEB; border-radius:14px;
            box-shadow:0 1px 6px rgba(0,0,0,.04); overflow:hidden;
        }
        .sd-panel-hdr {
            padding:16px 20px; border-bottom:1px solid #F0F0F0;
            display:flex; align-items:center; justify-content:space-between;
        }
        .sd-panel-hdr h3 { font-size:15px; font-weight:700; color:#111; margin:0; }
        .sd-panel-hdr a { font-size:12px; font-weight:600; color:${G}; text-decoration:none; }
        .sd-panel-hdr a:hover { text-decoration:underline; }

        .sd-subj-grid {
            display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr));
            gap:16px; padding:16px 20px 20px; align-items:stretch;
        }
        .sd-subj {
            display:flex; flex-direction:column; min-height:260px; height:100%;
            text-decoration:none; color:inherit; border-radius:14px; overflow:hidden; background:#fff;
            border:1px solid #E5E7EB; box-shadow:0 1px 3px rgba(0,0,0,.06);
            transition:transform .2s, box-shadow .2s, border-color .2s;
        }
        .sd-subj:hover {
            transform:translateY(-3px); border-color:#C5D9CB; box-shadow:0 8px 20px rgba(0,70,27,.1);
        }
        .sd-subj-band {
            padding:16px 16px 14px; min-height:96px; display:flex;
            flex-direction:column; justify-content:flex-end; position:relative;
        }
        .sd-subj-band::after {
            content:''; position:absolute; inset:0;
            display:none;
            pointer-events:none;
        }
        .sd-subj-code {
            font-size:10px; font-weight:700; font-family:ui-monospace, monospace;
            color:rgba(255,255,255,.9); margin-bottom:4px; position:relative;
        }
        .sd-subj-name {
            font-size:15px; font-weight:700; color:#fff; line-height:1.3; margin:0;
            display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; position:relative;
        }
        .sd-subj-body { flex:1; padding:12px 14px 14px; display:flex; flex-direction:column; gap:4px; }
        .sd-subj-teacher { font-size:12px; font-weight:600; color:#374151; }
        .sd-subj-meta { font-size:11px; color:#6B7280; line-height:1.35; }
        .sd-subj-ann { margin-top:auto; padding-top:10px; border-top:1px solid #F0F0F0; min-height:48px; }
        .sd-subj-ann-label {
            font-size:9px; font-weight:700; text-transform:uppercase;
            letter-spacing:.6px; color:#9CA3AF; margin-bottom:4px;
        }
        .sd-subj-ann-msg {
            font-size:11px; color:#6B7280; line-height:1.4; margin:0;
            display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;
        }
        .sd-subj-ann-msg strong { color:#111827; font-weight:600; }
        .sd-empty { padding:32px; text-align:center; color:#9CA3AF; font-size:13px; }

        @media(max-width:800px){
            .sd-academic { grid-template-columns:1fr; }
        }
    `;
}

function subjCard(c, annBySubject) {
    const color = subjectColor(c.subject_id);
    const latest = (annBySubject[c.subject_id] || [])[0];
    return `<a class="sd-subj" href="#instructor/my-classes?subject_id=${c.subject_id}">
        <div class="sd-subj-band" style="background:${color}">
            <div class="sd-subj-code">${esc(c.subject_code)}</div>
            <h4 class="sd-subj-name">${esc(c.subject_name)}</h4>
        </div>
        <div class="sd-subj-body">
            <div class="sd-subj-teacher">${icon('users', inl)} ${Number(c.student_count || 0)} student${Number(c.student_count || 0) !== 1 ? 's' : ''}</div>
            ${c.section_name ? `<div class="sd-subj-meta">${icon('clipboard', inl)} ${esc(c.section_name)}</div>` : ''}
            ${c.schedule ? `<div class="sd-subj-meta">${icon('clock', inl)} ${esc(c.schedule)}</div>` : ''}
            ${c.room ? `<div class="sd-subj-meta">${icon('pin', inl)} ${esc(c.room)}</div>` : ''}
            <div class="sd-subj-ann">
                <div class="sd-subj-ann-label">Announcement</div>
                ${latest
                    ? `<p class="sd-subj-ann-msg"><strong>${esc(latest.title)}</strong> — ${esc(truncate(latest.content, 60))}</p>`
                    : '<p class="sd-subj-ann-msg" style="font-style:italic;color:#BDC1C6">No announcements</p>'
                }
            </div>
        </div>
    </a>`;
}

function groupAnnouncements(list, classes) {
    const bySubject = {};
    const offeredToSubject = {};
    const codeToSubject = {};

    classes.forEach(c => {
        if (c.subject_offered_id) offeredToSubject[c.subject_offered_id] = Number(c.subject_id);
        if (c.subject_code) codeToSubject[(c.subject_code || '').toLowerCase()] = Number(c.subject_id);
    });

    list.forEach(a => {
        const sid = Number(a.subject_id)
            || offeredToSubject[a.subject_offered_id]
            || codeToSubject[(a.subject_code || '').toLowerCase()];
        if (!sid) return;
        if (!bySubject[sid]) bySubject[sid] = [];
        bySubject[sid].push(a);
    });

    Object.values(bySubject).forEach(arr => {
        arr.sort((x, y) => new Date(y.created_at || 0).getTime() - new Date(x.created_at || 0).getTime());
    });

    return bySubject;
}

function truncate(s, n) {
    const t = (s || '').replace(/\s+/g, ' ').trim();
    return t.length > n ? t.slice(0, n) + '…' : t;
}

function clamp(n) {
    return Math.max(0, Math.min(100, Number.isFinite(n) ? n : 0));
}

function esc(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
}
