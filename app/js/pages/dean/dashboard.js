/**
 * Dean Dashboard — academic overview with at-risk alerts and faculty oversight
 */
import { Api } from '../../api.js';
import { Auth } from '../../auth.js';
import { icon } from '../../utils/icons.js';
import { subjectColor, programPatternSvg } from '../../utils/subject-colors.js';
import { notify } from '../../utils/notify.js';
import { buildStudentJoinUrl, renderQrInto } from '../../utils/qr-utils.js';

import { esc } from '../../utils/classroom-ui.js';
const G      = '#00461B';
const GL     = '#E8F5EC';
const BORDER = '#E5E7EB';

export async function render(container) {
    container.innerHTML = `<div class="dn-loading"><div class="dn-spin"></div></div>`;

    const [res, semRes, myClassesRes] = await Promise.all([
        Api.get('/DashboardAPI.php?action=dean'),
        Api.get('/SemesterAPI.php?action=list'),
        Api.get('/SectionsAPI.php?action=instructor-classes'),
    ]);
    const myClasses = (myClassesRes.success ? (myClassesRes.data || []) : [])
        .filter(c => c.offering_status !== 'archived');

    await Auth.getUser();
    const user  = Auth.user() || {};
    const data  = res.success ? (res.data || {}) : {};
    const stats = data.stats || {};
    const dept  = data.department || {};

    const faculty           = data.faculty            || [];
    const programs          = data.programs           || [];
    const subjectStats      = data.subject_stats      || [];
    const enrollByYear      = data.enrollment_by_year || [];
    const subjectEnrollment = data.subject_enrollment || [];
    const progPerformance   = data.program_performance || [];
    const atRiskStudents    = data.at_risk_students   || [];
    const nonEngaging       = data.non_engaging       || [];

    const semesters = semRes.success ? (semRes.data || []) : [];
    const activeSem = semesters.find(s => s.status === 'active') || null;
    const semName   = activeSem?.semester_name || semesters.find(s => s.status === 'upcoming')?.semester_name || 'No active semester';
    const acadYear  = activeSem?.academic_year || '—';

    const hour     = new Date().getHours();
    const greeting = hour < 12 ? 'Good Morning' : hour < 18 ? 'Good Afternoon' : 'Good Evening';
    const todayStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    const totalAttempts = +(stats.total_attempts || 0);
    const passed        = +(stats.passed || 0);
    const failed        = +(stats.failed || 0);
    const passRate      = totalAttempts > 0 ? Math.round((passed / totalAttempts) * 100) : 0;
    const avgScore      = stats.avg_score ? Math.round(+stats.avg_score) : 0;

    const maxYear   = Math.max(...enrollByYear.map(r => +r.count), 1);
    const maxEnroll = Math.max(...subjectEnrollment.map(r => +r.enrolled_count), 1);
    const topSubjects = subjectStats.filter(s => +s.attempts > 0).slice(0, 8);

    const YEAR_LABELS = { 1: '1st Year', 2: '2nd Year', 3: '3rd Year', 4: '4th Year' };

    const scoreColor = v => v >= 75 ? G : v >= 50 ? '#B45309' : '#b91c1c';
    const scoreBg    = v => v >= 75 ? GL : v >= 50 ? '#FEF3C7' : '#FEE2E2';

    const firstName = user.first_name || user.name?.split(' ')[0] || 'Dean';

    container.innerHTML = `
    <style>
        .dn-loading { display:flex; justify-content:center; padding:80px; }
        .dn-spin { width:40px; height:40px; border:3px solid #eee; border-top-color:${G}; border-radius:50%; animation:dnSpin .8s linear infinite; }
        @keyframes dnSpin { to { transform:rotate(360deg); } }

        /* ── Header ── */
        .dn-header {
            background:#fff; border:1px solid #EBEBEB; border-radius:16px;
            padding:28px 32px; margin-bottom:22px;
            display:flex; justify-content:space-between; align-items:flex-start; gap:24px; flex-wrap:wrap;
            box-shadow:0 2px 12px rgba(0,70,27,.06);
        }
        .dn-header h1 { font-size:26px; font-weight:800; color:#111; margin:0 0 4px; letter-spacing:-.4px; }
        .dn-header-sub { font-size:14px; color:#6B7280; margin:0 0 14px; }
        .dn-chips { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:4px; }
        .dn-chip { font-size:12px; font-weight:600; padding:5px 12px; border-radius:4px; background:#fff; color:${G}; border:1px solid ${G}; }
        .dn-chip--muted { color:#374151; border-color:${BORDER}; }
        .dn-meta { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; padding-top:16px; border-top:1px solid ${BORDER}; margin-top:4px; }
        .dn-meta-item  { background:#fff; border:1px solid ${BORDER}; border-radius:8px; padding:12px 14px; }
        .dn-meta-label { display:block; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.8px; color:#9CA3AF; margin-bottom:4px; }
        .dn-meta-value { display:block; font-size:14px; font-weight:700; color:${G}; line-height:1.35; }
        .dn-empty { text-align:center; padding:28px 20px; color:#9CA3AF; font-size:13px; }

        @media(max-width:800px) { .dn-meta { grid-template-columns:1fr 1fr; } }

        /* ── Google Classroom-style subject cards ── */
        .gc-home-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:22px; }
        .gc-home-card {
            display:flex; flex-direction:column; border-radius:10px; overflow:visible;
            border:1px solid ${BORDER}; text-decoration:none; color:inherit; background:#fff;
            box-shadow:0 1px 3px rgba(0,0,0,.06); transition:box-shadow .15s;
        }
        .gc-home-card:hover { box-shadow:0 4px 16px rgba(0,0,0,.14); }
        .gc-home-banner-link { display:block; text-decoration:none; color:inherit; }
        .gc-home-banner {
            position:relative; border-radius:10px 10px 0 0;
            padding:16px 18px 20px; min-height:96px;
        }
        .gc-home-title {
            font-size:20px; font-weight:700; color:#fff; margin:0 0 4px; line-height:1.25;
            position:relative; text-decoration:underline; text-decoration-color:rgba(255,255,255,.55);
            text-underline-offset:3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
        }
        .gc-home-section {
            font-size:12.5px; font-weight:600; color:rgba(255,255,255,.92); margin:0 0 2px; position:relative;
            text-decoration:underline; text-decoration-color:rgba(255,255,255,.4); text-underline-offset:2px;
        }
        .gc-home-owner { font-size:12.5px; color:rgba(255,255,255,.85); margin:0; position:relative; }
        .gc-home-body { flex:1; min-height:64px; background:#fff; }
        .gc-home-footer {
            display:flex; align-items:center; justify-content:flex-end; padding:6px 8px;
            border-top:1px solid #F0F0F0;
        }
        .gc-home-menu-wrap { position:relative; }
        .gc-home-kebab {
            width:34px; height:34px; border-radius:50%; border:none; background:none; cursor:pointer;
            display:flex; align-items:center; justify-content:center; color:#5F6368; flex-shrink:0;
        }
        .gc-home-kebab:hover { background:#F1F3F4; }
        .gc-home-kebab svg { width:19px; height:19px; }
        .gc-home-menu {
            position:absolute; right:0; bottom:40px; z-index:20; min-width:160px;
            background:#fff; border-radius:10px; box-shadow:0 8px 28px rgba(0,0,0,.18);
            border:1px solid ${BORDER}; overflow:hidden; padding:6px;
        }
        .gc-home-menu button {
            display:flex; align-items:center; gap:10px; width:100%; padding:9px 10px;
            border:none; background:none; border-radius:7px; cursor:pointer;
            font-size:13px; font-weight:600; color:#374151; text-align:left; font-family:inherit;
        }
        .gc-home-menu button:hover { background:${GL}; color:${G}; }
        .gc-home-menu [data-card-action="archive"]:hover { background:#7F1D1D; color:#fff; }
    </style>

    <!-- ── Header ── -->
    <div class="dn-header">
        <div style="flex:1;min-width:0;">
            <h1>${greeting}, ${esc(firstName)}</h1>
            <p class="dn-header-sub">${todayStr}</p>
            <div class="dn-chips">
                <span class="dn-chip dn-chip--muted">${esc(user.employee_id || '—')}</span>
                <span class="dn-chip">${esc(dept.department_name || user.department_name || 'Department')}</span>
                <span class="dn-chip dn-chip--muted">Dean</span>
            </div>
            <div class="dn-meta">
                <div class="dn-meta-item">
                    <span class="dn-meta-label">Department</span>
                    <span class="dn-meta-value">${esc(dept.department_code || '—')}</span>
                </div>
                <div class="dn-meta-item">
                    <span class="dn-meta-label">Academic Year</span>
                    <span class="dn-meta-value">${esc(acadYear)}</span>
                </div>
                <div class="dn-meta-item">
                    <span class="dn-meta-label">Semester</span>
                    <span class="dn-meta-value">${esc(semName)}</span>
                </div>
            </div>
        </div>
    </div>

    <!-- ── Subjects — Google Classroom-style grid, no wrapping card ── -->
    ${myClasses.length === 0
        ? '<div class="dn-empty" style="margin-top:8px;">Not currently assigned to teach any subject.</div>'
        : `<div class="gc-home-grid">${myClasses.map(c => deanSubjCard(c, user)).join('')}</div>`
    }
    `;

    container.style.background = '#fff';
    const pageContent = container.closest('.page-content');
    if (pageContent) pageContent.style.background = '#fff';

    bindHomeCardMenus(container);
}

// esc() imported from classroom-ui.js (see import above)


function deanSubjCard(c, user) {
    const color = subjectColor(c.subject_id);
    const sectionCount = (c.sections || []).filter(s => s.section_name).length;
    const sectionLabel = sectionCount ? `${sectionCount} section${sectionCount !== 1 ? 's' : ''} handled` : '';
    const ownerName = [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.name || 'Dean';

    return `<div class="gc-home-card" data-subject-id="${c.subject_id}" data-offered-id="${c.subject_offered_id || ''}" data-subject-code="${esc(c.subject_code)}">
        <a class="gc-home-banner-link" href="#dean/my-classes?subject_id=${c.subject_id}">
            <div class="gc-home-banner" style="background:${color}">
                ${programPatternSvg(c.program_code, c.subject_id, { width: 320, height: 110, opacity: 0.16 })}
                <h3 class="gc-home-title">${esc(c.subject_name)}</h3>
                ${sectionLabel ? `<p class="gc-home-section">${esc(sectionLabel)}</p>` : ''}
                <p class="gc-home-owner">${esc(ownerName)}</p>
            </div>
        </a>
        <div class="gc-home-body"></div>
        <div class="gc-home-footer">
            <div class="gc-home-menu-wrap">
                <button type="button" class="gc-home-kebab" data-kebab-toggle title="More" aria-label="More">
                    ${icon('moreVertical', { size: 19 })}
                </button>
                <div class="gc-home-menu" data-kebab-menu hidden>
                    <button type="button" data-card-action="archive">${icon('archive', { size: 15 })} Archive</button>
                    <button type="button" data-card-action="invite">${icon('users', { size: 15 })} Invite</button>
                    <button type="button" data-card-action="edit">${icon('edit', { size: 15 })} Edit</button>
                </div>
            </div>
        </div>
    </div>`;
}

/* ── Card kebab menu: Archive / Invite / Edit ─────────────────── */

function bindHomeCardMenus(container) {
    const closeAllMenus = () => {
        container.querySelectorAll('[data-kebab-menu]').forEach(m => m.setAttribute('hidden', ''));
    };

    container.querySelectorAll('[data-kebab-toggle]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const menu = btn.nextElementSibling;
            const isOpen = !menu.hasAttribute('hidden');
            closeAllMenus();
            if (!isOpen) menu.removeAttribute('hidden');
        });
    });

    document.addEventListener('click', closeAllMenus);

    container.querySelectorAll('.gc-home-card').forEach(card => {
        const subjectId  = card.dataset.subjectId;
        const offeredId  = card.dataset.offeredId;
        const subjectCode = card.dataset.subjectCode;
        const title = card.querySelector('.gc-home-title')?.textContent || 'this subject';

        card.querySelector('[data-card-action="archive"]')?.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            closeAllMenus();
            const ok = await notify.confirm(
                `Archive "${title}"? It will move to Archived and stop showing here.`,
                { confirmText: 'Archive' }
            );
            if (!ok || !offeredId) return;
            const res = await Api.post('/SubjectOfferingsAPI.php?action=update', {
                subject_offered_id: parseInt(offeredId, 10),
                status: 'archived',
            });
            if (res.success) {
                notify.success('Subject archived');
                card.remove();
            } else {
                notify.error(res.message || 'Failed to archive subject');
            }
        });

        card.querySelector('[data-card-action="invite"]')?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            closeAllMenus();
            openInviteModal(subjectCode, title);
        });

        card.querySelector('[data-card-action="edit"]')?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            closeAllMenus();
            window.location.hash = `#dean/my-classes?subject_id=${subjectId}`;
        });
    });
}

function openInviteModal(subjectCode, title) {
    const joinUrl = buildStudentJoinUrl(subjectCode);
    const overlay = document.createElement('div');
    overlay.className = 'gc-invite-overlay';
    overlay.innerHTML = `
        <style>
            .gc-invite-overlay { position:fixed; inset:0; background:rgba(0,0,0,.45); z-index:9999;
                display:flex; align-items:center; justify-content:center; padding:20px; }
            .gc-invite-modal { background:#fff; border-radius:16px; width:360px; max-width:100%;
                padding:28px 24px; text-align:center; box-shadow:0 20px 60px rgba(0,0,0,.25); position:relative; }
            .gc-invite-close { position:absolute; top:12px; right:12px; width:30px; height:30px; border-radius:50%;
                border:none; background:#F3F4F6; color:#374151; cursor:pointer; display:flex; align-items:center; justify-content:center; }
            .gc-invite-close:hover { background:#E5E7EB; }
            .gc-invite-title { font-size:16px; font-weight:800; color:#111827; margin:0 0 4px; }
            .gc-invite-sub { font-size:12.5px; color:#6B7280; margin:0 0 18px; }
            .gc-invite-qr { display:flex; justify-content:center; margin-bottom:16px; }
            .gc-invite-code { display:block; width:100%; padding:12px; border-radius:10px; border:1.5px dashed ${G};
                background:${GL}; color:${G}; font-size:20px; font-weight:800; letter-spacing:2px; cursor:pointer; font-family:inherit; }
            .gc-invite-hint { font-size:11.5px; color:#9CA3AF; margin-top:10px; }
        </style>
        <div class="gc-invite-modal">
            <button type="button" class="gc-invite-close" id="gc-invite-close">&times;</button>
            <p class="gc-invite-title">${esc(title)}</p>
            <p class="gc-invite-sub">Students scan the QR code or enter the code below to join</p>
            <div class="gc-invite-qr" id="gc-invite-qr"></div>
            <button type="button" class="gc-invite-code" id="gc-invite-code">${esc(subjectCode)}</button>
            <p class="gc-invite-hint">Tap the code to copy it</p>
        </div>
    `;
    document.body.appendChild(overlay);
    renderQrInto(overlay.querySelector('#gc-invite-qr'), joinUrl, 160).catch(() => {});

    const close = () => overlay.remove();
    overlay.querySelector('#gc-invite-close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.querySelector('#gc-invite-code').addEventListener('click', () => {
        navigator.clipboard.writeText(subjectCode);
        notify.success('Code copied to clipboard');
    });
}
