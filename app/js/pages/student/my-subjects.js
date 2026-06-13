/**
 * Student My Subjects — polished full-width classroom grid
 */
import { Api } from '../../api.js';
import { subjectColor } from '../../utils/subject-colors.js';
import { icon, iconLg } from '../../utils/icons.js';
import { openJoinPanel } from '../../components/student-enroll-fab.js';
import { subjectHash } from './quizzes.js';

const inl = { size: 14, className: 'ui-icon-inline' };
const G  = '#00461B';
const G2 = '#006428';
const GL = '#E8F5EC';
const BORDER = '#E5E7EB';
const MUTED = '#6B7280';

let refreshHandler = null;

export async function render(container) {
    const params = new URLSearchParams(window.location.hash.split('?')[1] || '');

    if (params.get('tab') === 'quizzes') {
        const sid = params.get('subject_id') || '';
        const qid = params.get('quiz_id') || '';
        window.location.hash = sid
            ? subjectHash(sid, 'classwork', qid ? { type: 'quiz', id: qid } : null)
            : '#student/my-subjects';
        return;
    }

    if (params.get('tab') === 'grades') {
        window.location.hash = '#student/my-subjects';
        return;
    }

    container.innerHTML = `<div class="ms-loading"><div class="ms-spin"></div></div>`;

    const [res, annRes, semRes] = await Promise.all([
        Api.get('/EnrollmentAPI.php?action=my-subjects'),
        Api.get('/AnnouncementsAPI.php?action=student-list'),
        Api.get('/SemesterAPI.php?action=list')
    ]);

    const subjects = res.success ? res.data : [];
    const annBySubject = groupAnnouncements(annRes.success ? annRes.data : []);
    const activeSem = (semRes.success ? semRes.data : []).find(s => s.status === 'active');
    const sectionNames = [...new Set(subjects.map(s => s.section_name).filter(Boolean))];

    container.innerHTML = `
        <style>${styles()}</style>
        <div class="ms-page" id="ms-page-root">
            ${buildShell(activeSem ? `${esc(activeSem.semester_name)} · AY ${esc(activeSem.academic_year)}` : '')}
            <div id="ms-panel-subjects">
        ${subjects.length === 0 ? `
                <div class="ms-empty-state">
                    <div class="ms-empty-icon">${iconLg('book')}</div>
                    <h2>No subjects enrolled</h2>
                    <p>Join a class with your subject code to see your subjects here.</p>
                    <button type="button" class="ms-join-btn ms-join-btn-lg" id="ms-join-btn-empty">Join Class</button>
            </div>
        ` : `
                <div class="ms-toolbar">
                    <div class="ms-search-box">
                        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                        <input class="ms-search" id="ms-search" type="search" placeholder="Search by name, code, or instructor…" autocomplete="off">
                </div>
                ${sectionNames.length > 1 ? `
                    <select class="ms-select" id="ms-sec-filter" aria-label="Filter by section">
                        <option value="">All sections</option>
                    ${sectionNames.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('')}
                </select>` : ''}
                    <span class="ms-count" id="ms-result-info">${subjects.length} subject${subjects.length !== 1 ? 's' : ''}</span>
            </div>

            <div class="ms-grid" id="ms-grid">
                    ${subjects.map(s => renderCard(s, annBySubject)).join('')}
                </div>
                <p class="ms-no-results" id="ms-no-results" hidden>No subjects match your search.</p>
            `}
            </div>
        </div>
    `;

    applyPageBg(container);

    const pageRoot = container.querySelector('#ms-page-root');
    pageRoot.querySelectorAll('#ms-join-btn, #ms-join-btn-empty').forEach((btn) => {
        btn.addEventListener('click', () => openJoinPanel());
    });

    if (refreshHandler) window.removeEventListener('student-subjects-refresh', refreshHandler);
    refreshHandler = () => render(container);
    window.addEventListener('student-subjects-refresh', refreshHandler);

    if (subjects.length === 0) return;

    const searchEl   = container.querySelector('#ms-search');
    const secFilter  = container.querySelector('#ms-sec-filter');
    const resultInfo = container.querySelector('#ms-result-info');
    const cards      = [...container.querySelectorAll('.ms-card')];
    const noResults  = container.querySelector('#ms-no-results');

    function applyFilters() {
        const q   = searchEl.value.toLowerCase().trim();
        const sec = secFilter?.value || '';
        let visible = 0;
        cards.forEach(card => {
            const show = (!q || card.dataset.search.includes(q)) && (!sec || card.dataset.section === sec);
            card.hidden = !show;
            if (show) visible++;
        });
        resultInfo.textContent = visible === subjects.length
            ? `${subjects.length} subject${subjects.length !== 1 ? 's' : ''}`
            : `${visible} of ${subjects.length}`;
        noResults.hidden = visible > 0;
        const grid = container.querySelector('#ms-grid');
        if (grid) grid.style.display = visible === 0 ? 'none' : '';
    }

    searchEl.addEventListener('input', applyFilters);
    secFilter?.addEventListener('change', applyFilters);
}

function buildShell(semBadge) {
    return `
        <header class="ms-hero">
            <div class="ms-hero-text">
                <p class="ms-hero-label">Learning</p>
                <h1 class="ms-hero-title">My Subjects</h1>
                <p class="ms-hero-sub">Open a class to view classwork, quizzes, classmates, and announcements</p>
                ${semBadge ? `<span class="ms-hero-badge">${semBadge}</span>` : ''}
            </div>
            <button type="button" class="ms-join-btn" id="ms-join-btn">
                <span class="ms-join-icon">${icon('plus', { size: 18 })}</span>
                Join Class
            </button>
        </header>
    `;
}

function renderCard(s, annBySubject) {
    const color = subjectColor(s.subject_id);
    const anns = annBySubject[s.subject_id] || [];
    const latest = anns[0];

    return `
    <a class="ms-card" href="#student/subject?subject_id=${s.subject_id}"
       data-search="${esc((s.subject_code + ' ' + s.subject_name + ' ' + (s.instructor_name || '')).toLowerCase())}"
       data-section="${esc(s.section_name || '')}">
        <div class="ms-card-top" style="background:${color}">
            <span class="ms-card-code">${esc(s.subject_code)}</span>
            <h3 class="ms-card-title">${esc(s.subject_name)}</h3>
            ${s.section_name ? `<span class="ms-card-section">${esc(s.section_name)}</span>` : ''}
        </div>
        <div class="ms-card-bottom">
            <div class="ms-card-row">
                <span class="ms-card-row-icon">${icon('user', inl)}</span>
                <span class="ms-card-row-text">${esc(s.instructor_name || 'Instructor TBA')}</span>
            </div>
            ${s.schedule ? `
            <div class="ms-card-row">
                <span class="ms-card-row-icon">${icon('clock', inl)}</span>
                <span class="ms-card-row-text">${esc(s.schedule)}</span>
            </div>` : ''}
            ${s.room ? `
            <div class="ms-card-row">
                <span class="ms-card-row-icon">${icon('pin', inl)}</span>
                <span class="ms-card-row-text">${esc(s.room)}</span>
            </div>` : ''}
            <div class="ms-card-row">
                <span class="ms-card-row-icon">${icon('quiz', inl)}</span>
                <span class="ms-card-row-text">${Number(s.total_quizzes) || 0} quiz${Number(s.total_quizzes) !== 1 ? 'zes' : ''}${Number(s.completed_quizzes) > 0 ? ` · ${s.completed_quizzes} passed` : ''}</span>
            </div>
            <div class="ms-card-ann">
                <span class="ms-card-ann-label">Announcement</span>
                ${latest
                    ? `<p class="ms-card-ann-text"><strong>${esc(latest.title)}</strong> ${esc(truncate(latest.content, 85))}</p>`
                    : `<p class="ms-card-ann-none">No new announcements</p>`
                }
            </div>
            <span class="ms-card-cta">Open class →</span>
        </div>
    </a>`;
}

function styles() {
    return `
        .ms-page {
            width: 100%;
            min-height: calc(100vh - 120px);
            background: #fff;
        }
        .ms-loading { display:flex; justify-content:center; align-items:center; min-height:320px; background:#fff; }
        .ms-spin {
            width:42px; height:42px; border:3px solid #eee; border-top-color:${G};
            border-radius:50%; animation:msSpin .75s linear infinite;
        }
        @keyframes msSpin { to { transform:rotate(360deg); } }

        .ms-hero {
            display:flex; align-items:flex-start; justify-content:space-between;
            gap:20px; flex-wrap:wrap;
            padding:28px 32px; margin:0 0 24px;
            background: ${G};
            border-radius:16px; color:#fff;
            box-shadow: 0 2px 10px rgba(0,70,27,.1);
        }
        .ms-hero-label {
            font-size:11px; font-weight:700; text-transform:uppercase;
            letter-spacing:1.2px; opacity:.75; margin:0 0 6px;
        }
        .ms-hero-title { font-size:28px; font-weight:800; margin:0 0 6px; letter-spacing:-.5px; }
        .ms-hero-sub { font-size:14px; opacity:.88; margin:0 0 12px; max-width:480px; line-height:1.5; }
        .ms-hero-badge {
            display:inline-block; font-size:12px; font-weight:600;
            background:rgba(255,255,255,.2); border:none;
            padding:5px 12px; border-radius:20px;
        }
        .ms-join-btn {
            display:inline-flex; align-items:center; gap:8px;
            padding:11px 20px; background:#fff; color:${G};
            border:none; border-radius:10px; font-size:14px; font-weight:700;
            font-family:inherit; cursor:pointer; white-space:nowrap;
            box-shadow:0 2px 8px rgba(0,0,0,.12);
            transition:transform .15s, box-shadow .15s;
        }
        .ms-join-btn:hover { transform:translateY(-1px); box-shadow:0 4px 14px rgba(0,0,0,.16); }
        .ms-join-icon {
            width:22px; height:22px; border-radius:50%; background:${G}; color:#fff;
            display:flex; align-items:center; justify-content:center;
        }
        .ms-join-icon svg { stroke:#fff; }
        .ms-join-btn-lg { margin-top:8px; }

        .ms-tabs {
            display:flex; gap:8px; flex-wrap:wrap;
            margin-bottom:22px; padding:4px;
            background:#F3F4F6; border-radius:12px; width:fit-content; max-width:100%;
        }
        .ms-tab {
            display:inline-flex; align-items:center; gap:8px;
            padding:10px 18px; border-radius:9px;
            font-size:13px; font-weight:700; color:#6B7280;
            text-decoration:none; transition:all .15s;
            border:1px solid transparent;
        }
        .ms-tab:hover { color:${G}; background:rgba(255,255,255,.7); }
        .ms-tab.active {
            background:#fff; color:${G};
            border:none;
            box-shadow:none;
        }
        .ms-tab-icon { display:flex; align-items:center; }
        .ms-tab.active .ms-tab-icon svg { stroke:${G}; }

        .ms-toolbar {
            display:flex; align-items:center; gap:12px; flex-wrap:wrap;
            margin-bottom:20px; padding:14px 16px;
            background:#F3F4F6; border:none; border-radius:12px;
        }
        .ms-search-box {
            flex:1; min-width:200px; position:relative;
            display:flex; align-items:center;
        }
        .ms-search-box svg {
            position:absolute; left:12px; color:#9CA3AF; pointer-events:none;
        }
        .ms-search {
            width:100%; padding:10px 14px 10px 38px;
            border:none; border-radius:8px;
            font-size:14px; background:#ECEFF1; outline:none;
            transition:outline .15s;
        }
        .ms-search:focus { outline:2px solid ${G}; }
        .ms-select {
            padding:10px 14px; border:none; border-radius:8px;
            font-size:13px; background:#ECEFF1; color:#374151; min-width:140px;
        }
        .ms-count {
            font-size:12px; font-weight:700; color:${G};
            background:${GL}; padding:8px 14px; border-radius:20px; white-space:nowrap;
        }

        .ms-grid {
            display:grid;
            grid-template-columns:repeat(auto-fill, minmax(300px, 1fr));
            gap:20px;
            align-items:stretch;
            width:100%;
        }

        .ms-card {
            display:flex; flex-direction:column;
            min-height:320px; height:100%;
            border-radius:14px; overflow:hidden;
            text-decoration:none; color:inherit;
            border:none;
            background:#fff;
            box-shadow:none;
            transition:background .15s;
        }
        .ms-card:hover {
            background:#F9FAFB;
        }
        .ms-card-top {
            padding:22px 20px 18px;
            min-height:118px;
            display:flex; flex-direction:column; justify-content:flex-end;
            position:relative;
        }
        .ms-card-code {
            font-size:11px; font-weight:700; font-family:ui-monospace, monospace;
            color:rgba(255,255,255,.9); letter-spacing:.6px;
            margin-bottom:6px; position:relative;
        }
        .ms-card-title {
            font-size:17px; font-weight:700; color:#fff; line-height:1.35;
            margin:0; position:relative;
            display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;
        }
        .ms-card-section {
            font-size:11px; font-weight:600; color:rgba(255,255,255,.8);
            margin-top:8px; position:relative;
        }
        .ms-card-bottom {
            flex:1; display:flex; flex-direction:column;
            padding:16px 18px 18px; gap:8px;
        }
        .ms-card-row {
            display:flex; align-items:flex-start; gap:8px;
            font-size:13px; color:#374151; line-height:1.4;
        }
        .ms-card-row-icon { flex-shrink:0; width:18px; text-align:center; font-size:12px; opacity:.85; }
        .ms-card-row-text { flex:1; min-width:0; }
        .ms-card-ann {
            margin-top:auto; padding-top:12px;
            border-top:none; padding-top:12px; background:#F9FAFB; margin:0 -18px -18px; padding-left:18px; padding-right:18px; min-height:56px;
        }
        .ms-card-ann-label {
            display:block; font-size:10px; font-weight:700;
            text-transform:uppercase; letter-spacing:.7px;
            color:#9CA3AF; margin-bottom:5px;
        }
        .ms-card-ann-text {
            font-size:12px; color:${MUTED}; line-height:1.45; margin:0;
            display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;
        }
        .ms-card-ann-text strong { color:#111827; font-weight:600; }
        .ms-card-ann-none { font-size:12px; color:#D1D5DB; margin:0; font-style:italic; }
        .ms-card-cta {
            display:block; margin-top:10px; font-size:12px; font-weight:700;
            color:${G}; text-align:right;
        }

        .ms-empty-state {
            text-align:center; padding:64px 32px;
            border:none; border-radius:16px;
            background:#F3F4F6; max-width:480px; margin:0 auto;
        }
        .ms-empty-icon { font-size:48px; margin-bottom:12px; }
        .ms-empty-state h2 { font-size:20px; font-weight:700; color:#111; margin:0 0 8px; }
        .ms-empty-state p { font-size:14px; color:${MUTED}; margin:0 0 20px; line-height:1.5; }
        .ms-no-results {
            text-align:center; padding:32px; color:#9CA3AF; font-size:14px; margin:0;
        }

        @media (max-width:768px) {
            .ms-hero { padding:22px 20px; }
            .ms-hero-title { font-size:24px; }
            .ms-grid { grid-template-columns:1fr; }
            .ms-toolbar { flex-direction:column; align-items:stretch; }
            .ms-count { text-align:center; }
        }
        @media (min-width:1400px) {
            .ms-grid { grid-template-columns:repeat(auto-fill, minmax(320px, 1fr)); }
        }
    `;
}

function applyPageBg(container) {
    container.style.background = '#fff';
    const pageContent = container.closest('.page-content');
    if (pageContent) {
        pageContent.style.background = '#fff';
        pageContent.classList.add('ms-page-white');
    }
}

function groupAnnouncements(list) {
    const bySubject = {};
    for (const a of list) {
        const sid = a.subject_id;
        if (!sid) continue;
        if (!bySubject[sid]) bySubject[sid] = [];
        bySubject[sid].push(a);
    }
    return bySubject;
}

function truncate(s, n) {
    const t = (s || '').replace(/\s+/g, ' ').trim();
    return t.length > n ? t.slice(0, n) + '…' : t;
}

function esc(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
}
