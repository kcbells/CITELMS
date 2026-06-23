/**
 * Sidebar Component
 * Renders navigation based on user role + RBAC permissions.
 */

import { Auth } from '../auth.js';
import { Api, BASE_URL } from '../api.js';
import { icon } from '../utils/icons.js';

const menus = {
    admin: [
        { section: 'Main', items: [
            { icon: 'dashboard', text: 'Home', page: 'dashboard', permission: null },
        ]},
        { section: 'Organization', items: [
            { icon: 'building', text: 'Departments', page: 'departments', permission: null },
            { icon: 'graduation', text: 'Curriculum', page: 'programs', permission: null },
        ]},
        { section: 'System', items: [
            { icon: 'settings', text: 'Settings', page: 'settings', permission: null },
        ]},
        { section: 'Communication', items: [
            { icon: 'messages', text: 'Messages', page: 'messages', permission: null, badge: true },
        ]},
    ],

    dean: [
        { section: 'Main', items: [
            { icon: 'dashboard', text: 'Home', page: 'dashboard', permission: null },
        ]},
        { section: 'Academic', items: [
            { icon: 'clipboard', text: 'Program Subjects', page: 'curriculum', permission: null },
            { icon: 'users', text: 'Faculty Assignments', page: 'faculty', permission: null },
        ]},
        { section: 'Management', items: [
            { icon: 'user', text: 'Manage Instructors', page: 'instructors', permission: null },
        ]},
        { section: 'Monitoring', items: [
            { icon: 'chart', text: 'Reports', page: 'reports', permission: null },
        ]},
        { section: 'Communication', items: [
            { icon: 'messages', text: 'Messages', page: 'messages', permission: null, badge: true },
        ]},
    ],

    instructor: [
        { section: 'Main', items: [
            { icon: 'dashboard', text: 'Home', page: 'dashboard', permission: null },
        ]},
        { section: 'Teaching', items: [
            { icon: 'book', text: 'My Subjects', page: 'my-classes', permission: 'subjects.view' },
            { icon: 'bank', text: 'Content Bank', page: 'content-bank', permission: 'lessons.view' },
        ]},
        { section: 'Assessment', items: [
            { icon: 'gradebook', text: 'Gradebook', page: 'gradebook', permission: 'grades.view' },
        ]},
        { section: 'Communication', items: [
            { icon: 'messages', text: 'Messages', page: 'messages', permission: null, badge: true },
        ]},
    ],

    student: [
        { section: 'Main', items: [
            { icon: 'dashboard', text: 'Home', page: 'dashboard', permission: null },
        ]},
        { section: 'Learning', items: [
            { icon: 'book', text: 'My Subjects', page: 'my-subjects', permission: 'subjects.view' },
            { icon: 'archive', text: 'Archived Classes', page: 'my-subjects', hash: '?view=archived', permission: 'subjects.view' },
        ]},
        { section: 'Progress', items: [
            { icon: 'gradebook', text: 'My Grades', page: 'grades', permission: 'grades.view' },
        ]},
        { section: 'Communication', items: [
            { icon: 'messages', text: 'Messages', page: 'messages', permission: null, badge: true },
        ]},
    ],
};

const SIDEBAR_COLLAPSED_KEY = 'sidebar_collapsed';

export function renderSidebar(container) {
    const role = Auth.user().role;
    const roleMenu = menus[role] || [];

    let currentPage = (window.location.hash.replace('#', '').split('/')[1] || 'dashboard').split('?')[0];
    if (role === 'student' && currentPage === 'quizzes') currentPage = 'my-subjects';
    if (role === 'instructor' && currentPage === 'subject') currentPage = 'my-classes';

    // Restore collapsed state
    const isCollapsed = localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
    if (isCollapsed) {
        container.closest('.sidebar')?.classList.add('sidebar--collapsed');
        document.querySelector('.main-content')?.classList.add('sidebar--collapsed-ml');
    } else {
        container.closest('.sidebar')?.classList.remove('sidebar--collapsed');
        document.querySelector('.main-content')?.classList.remove('sidebar--collapsed-ml');
    }

    let html = `
        <div class="sidebar-header">
            <button type="button" class="sidebar-collapse-btn" id="sidebar-collapse-btn" title="Toggle sidebar" aria-label="Toggle sidebar">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20">
                    <line x1="3" y1="12" x2="21" y2="12"/>
                    <line x1="3" y1="6"  x2="21" y2="6"/>
                    <line x1="3" y1="18" x2="21" y2="18"/>
                </svg>
            </button>
            <a href="#${role}/dashboard" class="logo">
                <img src="${BASE_URL}/assets/images/phinma_logo2.png" alt="PHINMA Education" class="logo-img">
                <span class="logo-text">PHINMA Cagayan de Oro College</span>
            </a>
        </div>
        <nav class="sidebar-nav">
    `;

    for (const section of roleMenu) {
        const visibleItems = section.items.filter(item =>
            item.permission === null || Auth.can(item.permission)
        );
        if (visibleItems.length === 0) continue;

        html += `<div class="nav-section"><span class="nav-section-title">${section.section}</span>`;

        for (const item of visibleItems) {
            const hashSuffix = item.hash || '';
            const currentHash = window.location.hash.split('#')[1] || '';
            const fullPage = `${role}/${item.page}${hashSuffix}`;
            let isActive = false;
            if (hashSuffix) {
                isActive = currentHash === fullPage || currentHash.startsWith(fullPage + '&');
            } else {
                const onArchived = currentHash.includes('?view=archived');
                const hasArchiveVariant = item.page === 'my-subjects' && role === 'student';
                isActive = currentPage === item.page && !(hasArchiveVariant && onArchived);
            }
            const badgeHtml = item.badge
                ? `<span class="nav-badge" id="msg-nav-badge" style="display:none">0</span>`
                : '';

            html += `
                <a href="#${fullPage}" class="nav-item ${isActive ? 'active' : ''}" data-page="${item.page}" data-tooltip="${item.text}">
                    <span class="nav-icon">${icon(item.icon)}</span>
                    <span class="nav-text">${item.text}</span>
                    ${badgeHtml}
                </a>
            `;
        }

        html += `</div>`;
    }

    html += `
            <div class="nav-section">
                <span class="nav-section-title">Account</span>
                <a href="#${role}/profile" class="nav-item ${currentPage === 'profile' ? 'active' : ''}" data-page="profile" data-tooltip="My Profile">
                    <span class="nav-icon">${icon('user')}</span>
                    <span class="nav-text">My Profile</span>
                </a>
            </div>
        </nav>
    `;

    container.innerHTML = html;

    // Sidebar collapse toggle
    document.getElementById('sidebar-collapse-btn')?.addEventListener('click', () => {
        const sidebar = container.closest('.sidebar');
        const mainContent = document.querySelector('.main-content');
        const collapsed = sidebar?.classList.toggle('sidebar--collapsed');
        mainContent?.classList.toggle('sidebar--collapsed-ml', collapsed);
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0');
    });

    if (role === 'student' || role === 'instructor') {
        pollUnreadBadge();
        setInterval(pollUnreadBadge, 30000);
    }

    window.addEventListener('hashchange', () => {
        let page = (window.location.hash.replace('#', '').split('/')[1] || 'dashboard').split('?')[0];
        if (role === 'student' && page === 'quizzes') page = 'my-subjects';
        if (role === 'instructor' && page === 'subject') page = 'my-classes';
        const currentHash = window.location.hash.split('#')[1] || '';

        container.querySelectorAll('.nav-item').forEach(el => {
            const href = el.getAttribute('href')?.replace('#', '') || '';
            if (href.includes('?')) {
                // Items with query params (e.g. Archived Classes): exact match
                el.classList.toggle('active', currentHash === href || currentHash.startsWith(href + '&'));
            } else {
                // Items without query params: active if page matches
                // Exception: student "My Subjects" should NOT be active when on ?view=archived
                // (the "Archived Classes" item handles that)
                const hasArchiveVariant = el.dataset.page === 'my-subjects' && role === 'student';
                const isOnArchived = currentHash.includes('?view=archived');
                el.classList.toggle('active', el.dataset.page === page && !(hasArchiveVariant && isOnArchived));
            }
        });
    });
}

async function pollUnreadBadge() {
    try {
        const res = await Api.get('/MessagingAPI.php?action=unread_count');
        const count = res.success ? (res.count || 0) : 0;
        const badge = document.getElementById('msg-nav-badge');
        if (badge) {
            badge.textContent = count > 99 ? '99+' : count;
            badge.style.display = count > 0 ? 'inline-flex' : 'none';
        }
    } catch (_) { /* silent */ }
}
