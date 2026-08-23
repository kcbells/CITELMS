/**
 * Onboarding Tour — first-login spotlight walkthrough of the real interface.
 * Shown once ever per account (tracked server-side via AuthAPI's
 * tutorial_seen column, not localStorage, so it follows the account across
 * devices/browsers) right after boot() finishes rendering the sidebar,
 * topbar, and the user's first page.
 *
 * How the spotlight works: rather than a full-screen dark <div>, a single
 * transparent box is positioned exactly over the current target element and
 * given a huge `box-shadow: 0 0 0 9999px rgba(...)`. The shadow fills
 * everything OUTSIDE the box with the dark overlay color, while the box's
 * own interior stays transparent — so the real, live element shows through
 * untouched. No canvas/SVG masking needed.
 */
import { Api } from '../api.js';

const STORAGE_FALLBACK_KEY = 'lms_tour_seen_fallback'; // only used if the server check itself fails

let root = null;
let steps = [];
let stepIndex = 0;
let wasSidebarCollapsed = false;
let repositionHandler = null;

function esc(str) {
    const d = document.createElement('div');
    d.textContent = str ?? '';
    return d.innerHTML;
}

/** Role → ordered list of {selector, title, body}. Steps whose selector
 *  isn't found in the live DOM are skipped automatically (defensive —
 *  covers a permission-gated item being hidden for a particular account). */
function stepsFor(role) {
    const shellIntro = [
        { selector: '#sidebar-collapse-btn', title: 'Your sidebar', body: 'Everything you can do lives here. Click this anytime to collapse it down to icons and get more room.' },
        { selector: '.nav-item[data-page="dashboard"]', title: 'Home', body: 'Your dashboard — a quick overview of what needs your attention.' },
    ];
    const shellOutro = [
        { selector: '#search-btn', title: 'Search everything', body: 'Look up a person, subject, or section instantly. Press Ctrl+K from anywhere to jump straight here.' },
        { selector: '#fm-topbar-btn', title: 'Messages', body: 'Message people directly — instructors, students, or staff — without leaving whatever page you’re on.' },
        { selector: '#notification-toggle', title: 'Notifications', body: 'New activity relevant to you shows up here — replies, new lessons, and more.' },
        { selector: '#user-toggle', title: 'Your account', body: 'Update your profile, change settings, or log out from here.' },
        { selector: '#fa-bubble', title: 'Meet Ali', body: 'Stuck on something? Ali is your built-in AI helper — click this anytime to ask a question.' },
    ];

    const roleMiddle = {
        student: [
            { selector: '.nav-group-toggle[data-group-key="my-subjects"]', title: 'My Subjects', body: 'Every class you’re enrolled in lives here — lessons, quizzes, and announcements.' },
            { selector: '.nav-item[data-page="grades"]', title: 'My Grades', body: 'Track how you’re doing in every subject, period by period.' },
        ],
        instructor: [
            { selector: '.nav-group-toggle[data-group-key="my-subjects"]', title: 'My Classes', body: 'Manage the sections you teach — post lessons, create quizzes, and grade from here.' },
            { selector: '.nav-item[data-page="gradebook"]', title: 'Gradebook', body: 'Enter and review grades for every class you teach.' },
        ],
        program_head: [
            { selector: '.nav-group-toggle[data-group-key="my-subjects"]', title: 'My Subjects', body: 'The subjects and sections under your program.' },
            { selector: '.nav-item[data-page="sections"]', title: 'Reports', body: 'A live report of struggling students in your program — which students, and exactly which subjects.' },
        ],
        dean: [
            { selector: '.nav-item[data-page="instructors"]', title: 'Manage Faculty', body: 'Add, edit, and oversee the instructors and program heads in your department.' },
            { selector: '.nav-item[data-page="reports"]', title: 'Reports', body: 'Department-wide performance, at-risk students, and quiz results.' },
        ],
        admin: [
            { selector: '.nav-item[data-page="departments"]', title: 'Departments', body: 'Manage campuses, departments, and programs across the whole system.' },
            { selector: '.nav-item[data-page="class-density"]', title: 'Uploads', body: 'Bulk-import class lists and faculty rosters here.' },
        ],
    };

    return [...shellIntro, ...(roleMiddle[role] || []), ...shellOutro];
}

export async function maybeStartTour() {
    let alreadySeen = false;
    try {
        const res = await Api.get('/AuthAPI.php?action=tutorial-status');
        alreadySeen = !!res?.data?.tutorial_seen;
    } catch (_) {
        // Server check failed (offline blip, etc.) — fall back to a local
        // flag so a real error doesn't force the tour on every load, but
        // don't let a failed check silently skip a genuine first-time user.
        alreadySeen = localStorage.getItem(STORAGE_FALLBACK_KEY) === '1';
    }
    if (alreadySeen) return;

    const { Auth } = await import('../auth.js');
    const role = Auth.user()?.role;
    if (!role) return;

    steps = stepsFor(role).filter(s => document.querySelector(s.selector));
    if (steps.length === 0) return; // nothing on screen matched — nothing to show

    stepIndex = 0;
    start();
}

function start() {
    const sidebar = document.querySelector('.sidebar');
    wasSidebarCollapsed = !!sidebar?.classList.contains('sidebar--collapsed');
    if (wasSidebarCollapsed) {
        sidebar.classList.remove('sidebar--collapsed');
        document.querySelector('.main-content')?.classList.remove('sidebar--collapsed-ml');
    }

    injectStyles();
    root = document.createElement('div');
    root.id = 'tour-root';
    root.innerHTML = `
        <div class="tour-catcher" id="tour-catcher"></div>
        <div class="tour-highlight" id="tour-highlight"></div>
        <div class="tour-card" id="tour-card" role="dialog" aria-live="polite"></div>
    `;
    document.body.appendChild(root);

    document.getElementById('tour-catcher').addEventListener('click', (e) => e.stopPropagation());
    document.addEventListener('keydown', onKeyDown);

    renderStep();
}

function onKeyDown(e) {
    if (e.key === 'Escape') { finish(true); return; }
    if (e.key === 'ArrowRight' || e.key === 'Enter') next();
    if (e.key === 'ArrowLeft') back();
}

async function renderStep() {
    const step = steps[stepIndex];
    if (!step) { finish(false); return; }

    const target = document.querySelector(step.selector);
    if (!target) { stepIndex++; renderStep(); return; } // vanished since filtering (e.g. a live re-render) — skip gracefully

    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    await new Promise(r => setTimeout(r, 260)); // let the smooth scroll settle before measuring

    positionOn(target);
    renderCard(step);

    if (repositionHandler) window.removeEventListener('resize', repositionHandler);
    repositionHandler = () => positionOn(target);
    window.addEventListener('resize', repositionHandler);
}

function positionOn(target) {
    const rect = target.getBoundingClientRect();
    const pad = 6;
    const hi = document.getElementById('tour-highlight');
    if (!hi) return;
    hi.style.top = `${rect.top - pad}px`;
    hi.style.left = `${rect.left - pad}px`;
    hi.style.width = `${rect.width + pad * 2}px`;
    hi.style.height = `${rect.height + pad * 2}px`;

    const card = document.getElementById('tour-card');
    if (!card) return;
    const cardW = 300;
    const margin = 14;
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;

    // Prefer to the right of the target (matches a left sidebar/topbar icon
    // most of the time); fall back to below, then above, then left —
    // whichever keeps the card fully on-screen. Reset transform first since
    // this same card element is reused (innerHTML-replaced, not recreated)
    // across steps — leaving a previous step's "flip above" transform in
    // place would silently misposition every step after it.
    let top, left;
    let flipAbove = false;
    const spaceRight = viewportW - rect.right;
    const spaceBelow = viewportH - rect.bottom;
    if (spaceRight > cardW + margin * 2) {
        left = rect.right + margin;
        top = Math.min(Math.max(rect.top, margin), viewportH - 180 - margin);
    } else if (spaceBelow > 160) {
        top = rect.bottom + margin;
        left = Math.min(Math.max(rect.left, margin), viewportW - cardW - margin);
    } else if (rect.top > 180) {
        top = rect.top - margin;
        left = Math.min(Math.max(rect.left, margin), viewportW - cardW - margin);
        flipAbove = true;
    } else {
        left = Math.max(rect.left - cardW - margin, margin);
        top = Math.min(Math.max(rect.top, margin), viewportH - 180 - margin);
    }
    card.style.transform = flipAbove ? 'translateY(-100%)' : 'none';
    card.style.top = `${top}px`;
    card.style.left = `${left}px`;
}

function renderCard(step) {
    const card = document.getElementById('tour-card');
    if (!card) return;
    const isFirst = stepIndex === 0;
    const isLast = stepIndex === steps.length - 1;

    card.innerHTML = `
        <div class="tour-card-dots">
            ${steps.map((_, i) => `<span class="tour-dot ${i === stepIndex ? 'active' : ''}"></span>`).join('')}
        </div>
        <h4 class="tour-card-title">${esc(step.title)}</h4>
        <p class="tour-card-body">${esc(step.body)}</p>
        <div class="tour-card-actions">
            <button type="button" class="tour-btn tour-btn-skip" id="tour-skip">Skip tour</button>
            <div class="tour-card-actions-right">
                ${!isFirst ? '<button type="button" class="tour-btn tour-btn-ghost" id="tour-back">Back</button>' : ''}
                <button type="button" class="tour-btn tour-btn-primary" id="tour-next">${isLast ? 'Finish' : 'Next'}</button>
            </div>
        </div>
    `;
    card.querySelector('#tour-skip')?.addEventListener('click', () => finish(true));
    card.querySelector('#tour-back')?.addEventListener('click', back);
    card.querySelector('#tour-next')?.addEventListener('click', next);
}

function next() {
    if (stepIndex >= steps.length - 1) { finish(false); return; }
    stepIndex++;
    renderStep();
}

function back() {
    if (stepIndex <= 0) return;
    stepIndex--;
    renderStep();
}

function finish(skipped) {
    if (repositionHandler) { window.removeEventListener('resize', repositionHandler); repositionHandler = null; }
    document.removeEventListener('keydown', onKeyDown);
    root?.remove();
    root = null;

    if (wasSidebarCollapsed) {
        const sidebar = document.querySelector('.sidebar');
        sidebar?.classList.add('sidebar--collapsed');
        document.querySelector('.main-content')?.classList.add('sidebar--collapsed-ml');
    }

    try { localStorage.setItem(STORAGE_FALLBACK_KEY, '1'); } catch (_) {}
    Api.post('/AuthAPI.php?action=mark-tutorial-seen', {}).catch(() => {});
}

let stylesInjected = false;
function injectStyles() {
    if (stylesInjected) return;
    stylesInjected = true;
    const style = document.createElement('style');
    style.id = 'tour-styles';
    style.textContent = `
        #tour-root { position:fixed; inset:0; z-index:99900; }
        .tour-catcher { position:fixed; inset:0; z-index:99901; cursor:default; }
        .tour-highlight {
            position:fixed; z-index:99902; border-radius:10px; pointer-events:none;
            box-shadow:0 0 0 9999px rgba(6,20,10,.68), 0 0 0 3px #C8941A;
            transition:top .25s ease, left .25s ease, width .25s ease, height .25s ease;
        }
        .tour-card {
            position:fixed; z-index:99903; width:300px; background:#fff; border-radius:14px;
            padding:18px 18px 16px; box-shadow:0 20px 56px rgba(0,0,0,.35);
            transition:top .25s ease, left .25s ease; font-family:inherit;
            animation:tourPop .18s ease;
        }
        @keyframes tourPop { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        .tour-card-dots { display:flex; gap:5px; margin-bottom:12px; }
        .tour-dot { width:6px; height:6px; border-radius:50%; background:#E5E7EB; transition:background .15s,width .15s; }
        .tour-dot.active { background:#00461B; width:16px; border-radius:4px; }
        .tour-card-title { margin:0 0 6px; font-size:15px; font-weight:800; color:#111827; }
        .tour-card-body { margin:0 0 16px; font-size:13px; line-height:1.55; color:#4B5563; }
        .tour-card-actions { display:flex; align-items:center; justify-content:space-between; gap:10px; }
        .tour-card-actions-right { display:flex; gap:8px; }
        .tour-btn { font-family:inherit; font-size:12.5px; font-weight:700; border-radius:8px; padding:8px 14px; cursor:pointer; border:none; }
        .tour-btn-skip { background:none; color:#9CA3AF; padding:8px 4px; }
        .tour-btn-skip:hover { color:#6B7280; }
        .tour-btn-ghost { background:#F3F4F6; color:#374151; }
        .tour-btn-ghost:hover { background:#E5E7EB; }
        .tour-btn-primary { background:#00461B; color:#fff; }
        .tour-btn-primary:hover { background:#006428; }
        @media(max-width:480px) {
            .tour-card { width:calc(100vw - 32px); }
        }
        @media (prefers-reduced-motion:reduce) {
            .tour-highlight, .tour-card { transition:none; }
            .tour-card { animation:none; }
        }
    `;
    document.head.appendChild(style);
}
