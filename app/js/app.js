/**
 * App.js - Main entry point & Router
 * Handles authentication check, routing, and page loading
 */

import { Auth } from './auth.js';
import { BASE_URL } from './api.js';
import { renderSidebar } from './components/sidebar.js';
import { renderTopbar } from './components/topbar.js';
import { mountStudentEnrollFab, unmountStudentEnrollFab, openJoinPanel, openJoinPanelWithSubject } from './components/student-enroll-fab.js';
import { mountFloatingMessenger, unmountFloatingMessenger, openFloatingChat } from './components/floating-messenger.js';
import { mountFloatingAssistant, unmountFloatingAssistant } from './components/floating-assistant.js';
import {
    isQuizProctored,
    clearQuizProctoring,
    getActiveQuizId,
    isQuizInProgress,
    requestQuizLeaveConfirm,
    runConfirmedQuizExit,
} from './utils/quiz-guard.js';
import { Api } from './api.js';
import { icon, iconLg } from './utils/icons.js';

// ── Permission map: page → required permission slug ───────────
// null = no permission required (always accessible)
const PAGE_PERMISSIONS = {
    // Admin — technical pages
    'admin/users':               'users.view',
    'admin/rbac':                'rbac.view',
    'admin/settings':            'settings.view',
    'admin/departments':         'departments.view',
    'admin/programs':            'programs.view',
    // Admin academic pages still guarded (accessible via direct URL if RBAC granted)
    'admin/subjects':            'subjects.view',
    'admin/curriculum':          'curriculum.view',
    'admin/sections':            'sections.view',
    'admin/subject-offerings':   'subject_offerings.view',
    'admin/faculty-assignments': 'faculty_assignments.view',
    // Dean — academic pages are role-intrinsic (no RBAC gate needed)
    'dean/subjects':             null,
    'dean/curriculum':           null,
    'dean/sections':             null,
    'dean/subject-offerings':    null,
    'dean/faculty-assignments':  null,
    'dean/instructors':          null,
    'dean/reports':              null,
    // Instructor
    'instructor/departments':    'departments.view',
    'instructor/programs':       'programs.view',
    'instructor/curriculum':     'curriculum.view',
    'instructor/sections':       'sections.view',
    'instructor/subject-offerings': 'subject_offerings.view',
    'instructor/my-classes':     'subjects.view',
    'instructor/subject':        'subjects.view',
    'instructor/content-bank':   'lessons.view',
    'instructor/quizzes':        'quizzes.view',
    'instructor/gradebook':      'grades.view',
    'instructor/reports':        'reports.view',
    'instructor/analytics':      'analytics.view',
    // Student
    'student/my-subjects':       'subjects.view',
    'student/subject':           'subjects.view',
    'student/lessons':           'lessons.view',
    'student/quizzes':           'quizzes.view',
    'student/grades':            'grades.view',
    'student/messages':          null,
    'student/announcements':     null,
    // Instructor — messaging
    'instructor/messages':       null,
};

// ── Page aliases: when a role doesn't have its own page file,
//    load an existing one from another role instead.
//    Format: 'role/page' → 'actual-role/actual-page'
const PAGE_ALIASES = {
    // Instructor accessing shared admin/dean modules
    'instructor/departments':       'admin/departments',
    'instructor/programs':          'admin/programs',
    'instructor/curriculum':        'admin/curriculum',
    'instructor/subject-offerings': 'admin/subject-offerings',
    'instructor/faculty-assignments': 'admin/faculty-assignments',
    'instructor/sections':          'instructor/my-classes',
    'instructor/reports':           'dean/reports',
    'instructor/users':             'admin/users',
    'instructor/rbac':              'admin/rbac',
    'instructor/settings':          'admin/settings',
    // Dean accessing shared admin modules
    'dean/departments':             'admin/departments',
    'dean/programs':                'admin/programs',
    'dean/curriculum':              'admin/curriculum',
    'dean/sections':                'admin/curriculum',
    'dean/subject-offerings':       'admin/curriculum',
    'dean/subjects':                'admin/curriculum',
    'dean/instructors':             'dean/faculty-assignments',
    'dean/users':                   'admin/users',
    'dean/rbac':                    'admin/rbac',
    'dean/settings':                'admin/settings',
    // Student accessing shared modules if granted
    // (student/announcements has its own page — no alias needed)
};

// Page registry - maps route names to page modules
const pages = {};

/**
 * Register a page module
 */
export function registerPage(role, name, loadFn) {
    pages[`${role}/${name}`] = loadFn;
}

// Pre-register subject hubs (large modules — avoids dynamic import misses)
import { render as renderStudentSubject } from './pages/student/subject.js';
import { render as renderInstructorSubject } from './pages/instructor/subject.js';
registerPage('student', 'subject', renderStudentSubject);
registerPage('instructor', 'subject', renderInstructorSubject);

/**
 * Navigate to a page
 */
export function navigate(role, page) {
    const hash = `#${role}/${page}`;
    if (window.location.hash !== hash) {
        window.location.hash = hash;
    } else {
        loadCurrentPage();
    }
}

/**
 * Get current route from hash
 */
function getCurrentRoute() {
    const hash = window.location.hash.replace('#', '');
    if (!hash) return null;
    const [pathPart, queryPart] = hash.split('?');
    const [role, ...rest] = pathPart.split('/');
    const params = {};
    if (queryPart) {
        queryPart.split('&').forEach(p => {
            const [k, v] = p.split('=');
            if (k) params[decodeURIComponent(k)] = decodeURIComponent(v || '');
        });
    }
    return { role, page: rest.join('/') || 'dashboard', params };
}

/**
 * Load the current page based on hash
 */
async function loadCurrentPage() {
    const route = getCurrentRoute();
    const user = Auth.user();

    if (!route || !user) {
        // Default: redirect to user's dashboard
        if (user) {
            window.location.hash = `#${user.role}/dashboard`;
        }
        return;
    }

    // Update page title in topbar
    const pageTitle = route.page.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    document.title = `${pageTitle} | CIT-LMS`;

    // Update sidebar active state
    const navPage = route.page === 'subject'
        ? (route.role === 'instructor' ? 'my-classes' : 'my-subjects')
        : route.page;
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.page === navPage) {
            item.classList.add('active');
        }
    });

    // Update topbar title
    const topbarTitle = document.querySelector('.page-title');
    if (topbarTitle) topbarTitle.textContent = pageTitle;

    const pageKey  = `${route.role}/${route.page}`;

    // Confirm before leaving an in-progress quiz (sidebar / hash navigation)
    if (isQuizInProgress()) {
        const hashQuizId = route.params?.quiz_id || '';
        const activeId = String(getActiveQuizId() || '');
        const onWrongPage = pageKey !== 'student/take-quiz'
            || (hashQuizId && activeId && hashQuizId !== activeId);
        if (onWrongPage && activeId) {
            const back = `#student/take-quiz?quiz_id=${activeId}`;
            const confirmed = await requestQuizLeaveConfirm('navigation');
            if (!confirmed) {
                if (window.location.hash !== back) {
                    window.location.hash = back;
                }
                return;
            }
            const wasProctored = isQuizProctored();
            await runConfirmedQuizExit();
            clearQuizProctoring();
            Api.post('/QuizAttemptsAPI.php?action=proctor-unlock', {}).catch(() => {});
            if (wasProctored) return;
        }
    } else if (window.__prevRoute === 'student/take-quiz' && pageKey !== 'student/take-quiz') {
        clearQuizProctoring();
        Api.post('/QuizAttemptsAPI.php?action=proctor-unlock', {}).catch(() => {});
    }
    window.__prevRoute = pageKey;

    // Check permission before loading
    const required = PAGE_PERMISSIONS[pageKey];
    const content  = document.getElementById('page-content');

    if (required && !Auth.can(required)) {
        content.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:80px 24px;text-align:center;">
                <div style="margin-bottom:16px;">${iconLg('eyeOff')}</div>
                <h2 style="font-size:22px;font-weight:700;color:#1B4D3E;margin:0 0 8px;">Access Denied</h2>
                <p style="color:#6b7280;font-size:14px;max-width:360px;margin:0 0 24px;">
                    You don't have permission to view this page.<br>
                    Contact your administrator to request access.
                </p>
                <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px 18px;font-size:13px;color:#166534;">
                    Required permission: <strong>${required}</strong>
                </div>
            </div>`;
        mountRoleWidgets(user.role);
        return;
    }

    // Resolve alias — use shared page if this role has no own page file
    const resolvedKey  = PAGE_ALIASES[pageKey] || pageKey;
    const [resolvedRole, resolvedPage] = resolvedKey.split('/');

    if (pages[resolvedKey]) {
        content.innerHTML = '<div style="display:flex;justify-content:center;padding:60px"><div class="spinner-lg" style="width:36px;height:36px;border:3px solid var(--gray-200);border-top-color:var(--primary);border-radius:50%;animation:spin 0.8s linear infinite"></div></div>';
        try {
            await pages[resolvedKey](content, route.params);
        } catch (err) {
            console.error('Page load error:', err);
            content.innerHTML = `<div class="empty-state"><div class="empty-state-icon">!</div><h3>Error Loading Page</h3><p>${err.message}</p></div>`;
        }
    } else {
        // Try to dynamically import the page module (use resolved role/page)
        try {
            content.innerHTML = '<div style="display:flex;justify-content:center;padding:60px"><div class="spinner-lg" style="width:36px;height:36px;border:3px solid var(--gray-200);border-top-color:var(--primary);border-radius:50%;animation:spin 0.8s linear infinite"></div></div>';
            const module = await import(`./pages/${resolvedRole}/${resolvedPage}.js?v=${Date.now()}`);
            if (!module.render) {
                throw new Error(`Page module has no render export: ${pageKey}`);
            }
            pages[resolvedKey] = module.render;
            try {
                await module.render(content, route.params);
            } catch (renderErr) {
                console.error('Page render error:', pageKey, renderErr);
                content.innerHTML = `<div class="empty-state"><div class="empty-state-icon">!</div><h3>Error Loading Page</h3><p>${renderErr.message}</p></div>`;
            }
        } catch (err) {
            console.error('Module not found:', pageKey, err);
            const detail = String(err?.message || err || '')
                .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const isMissing = /failed to fetch|404|not found/i.test(detail);
            content.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">${iconLg(isMissing ? 'construction' : 'alert')}</div>
                    <h3>${isMissing ? 'Page Not Available Yet' : 'Error Loading Page'}</h3>
                    <p>${isMissing
                        ? `The "${route.page}" page for ${route.role} hasn't been built yet.`
                        : 'This page could not be loaded.'}</p>
                    <p style="margin-top:12px;font-size:13px;color:var(--gray-400)">Route: ${pageKey}</p>
                    ${detail ? `<p style="margin-top:8px;font-size:12px;color:var(--gray-500);max-width:480px;word-break:break-word">${detail}</p>` : ''}
                </div>`;
        }
    }

    mountRoleWidgets(user.role);

    // Deep-link: ?with=USER_ID opens floating chat (stays on current page)
    const withId = route.params?.with;
    if (withId) {
        openFloatingChat(
            parseInt(withId, 10),
            route.params.name || 'Chat',
            route.params.role || ''
        );
    }

    // Deep-link: ?join=1 opens join panel (subject code + optional section)
    if (route.params?.join && user.role === 'student') {
        setTimeout(() => {
            const subjectCode = route.params?.subject_code || route.params?.code || '';
            const sectionId = parseInt(route.params?.section_id || '0', 10) || 0;
            if (subjectCode) openJoinPanelWithSubject(subjectCode, sectionId);
            else openJoinPanel();
        }, 150);
    }
}

function mountRoleWidgets(role) {
    if (isQuizProctored() || isQuizInProgress()) {
        unmountFloatingAssistant();
        unmountFloatingMessenger();
        unmountStudentEnrollFab();
        return;
    }

    mountFloatingAssistant();

    if (role === 'student') {
        mountStudentEnrollFab();
        mountFloatingMessenger();
    } else if (role === 'instructor') {
        unmountStudentEnrollFab();
        mountFloatingMessenger();
    } else {
        unmountStudentEnrollFab();
        unmountFloatingMessenger();
    }
}

/**
 * Boot the application
 */
async function boot() {
    const user = await Auth.requireLogin();
    if (!user) return;

    // Show the shell immediately — don't block on secondary API calls
    document.getElementById('app-loading').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    renderSidebar(document.getElementById('sidebar'));
    renderTopbar(document.getElementById('topbar'));

    await Promise.all([
        Auth.initSingleTabSession(),
        Auth.getUser(),
        Auth.fetchPermissions(),
    ]);

    renderSidebar(document.getElementById('sidebar'));
    mountRoleWidgets(Auth.user()?.role || user.role);

    // Set default route if none
    if (!window.location.hash) {
        window.location.hash = `#${user.role}/dashboard`;
    }

    // Load current page
    await loadCurrentPage();

    // Listen for hash changes (navigation)
    window.addEventListener('hashchange', loadCurrentPage);
}

// Start the app
boot();
