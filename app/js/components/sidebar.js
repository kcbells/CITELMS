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
            { icon: 'dashboard', text: 'Dashboard', page: 'dashboard', permission: null },
        ]},
        { section: 'Organization', items: [
            { icon: 'building', text: 'Departments', page: 'departments', permission: null },
            { icon: 'graduation', text: 'Programs', page: 'programs', permission: null },
        ]},
        { section: 'System', items: [
            { icon: 'settings', text: 'Settings', page: 'settings', permission: null },
        ]},
    ],

    dean: [
        { section: 'Main', items: [
            { icon: 'dashboard', text: 'Dashboard', page: 'dashboard', permission: null },
        ]},
        { section: 'Academic', items: [
            { icon: 'clipboard', text: 'Curriculum', page: 'curriculum', permission: null },
            { icon: 'book', text: 'Subjects', page: 'subjects', permission: null },
            { icon: 'calendar', text: 'Subject Offerings', page: 'subject-offerings', permission: null },
            { icon: 'school', text: 'Sections', page: 'sections', permission: null },
        ]},
        { section: 'Staff', items: [
            { icon: 'instructor', text: 'Instructors', page: 'instructors', permission: null },
            { icon: 'users', text: 'Faculty Assignments', page: 'faculty-assignments', permission: null },
        ]},
        { section: 'Reports', items: [
            { icon: 'chart', text: 'Reports', page: 'reports', permission: null },
        ]},
    ],

    instructor: [
        { section: 'Main', items: [
            { icon: 'dashboard', text: 'Dashboard', page: 'dashboard', permission: null },
        ]},
        { section: 'Teaching', items: [
            { icon: 'book', text: 'My Classes', page: 'my-classes', permission: 'subjects.view' },
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
            { icon: 'dashboard', text: 'Dashboard', page: 'dashboard', permission: null },
        ]},
        { section: 'Learning', items: [
            { icon: 'book', text: 'My Subjects', page: 'my-subjects', permission: 'subjects.view' },
        ]},
        { section: 'Progress', items: [
            { icon: 'gradebook', text: 'My Grades', page: 'grades', permission: 'grades.view' },
        ]},
        { section: 'Communication', items: [
            { icon: 'messages', text: 'Messages', page: 'messages', permission: null, badge: true },
        ]},
    ],
};

export function renderSidebar(container) {
    const role = Auth.user().role;
    const roleMenu = menus[role] || [];

    let currentPage = (window.location.hash.replace('#', '').split('/')[1] || 'dashboard').split('?')[0];
    if (role === 'student' && currentPage === 'quizzes') currentPage = 'my-subjects';
    if (role === 'instructor' && currentPage === 'subject') currentPage = 'my-classes';

    let html = `
        <div class="sidebar-header">
            <a href="#${role}/dashboard" class="logo">
                <img src="${BASE_URL}/assets/images/phinma_logo2.png" alt="PHINMA Education" class="logo-img">
                <span class="logo-text">COC-LMS</span>
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
            const isActive = currentPage === item.page ? 'active' : '';
            const badgeHtml = item.badge
                ? `<span class="nav-badge" id="msg-nav-badge" style="display:none">0</span>`
                : '';

            html += `
                <a href="#${role}/${item.page}" class="nav-item ${isActive}" data-page="${item.page}">
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
                <a href="#${role}/profile" class="nav-item ${currentPage === 'profile' ? 'active' : ''}" data-page="profile">
                    <span class="nav-icon">${icon('user')}</span>
                    <span class="nav-text">My Profile</span>
                </a>
            </div>
        </nav>
    `;

    container.innerHTML = html;

    if (role === 'student' || role === 'instructor') {
        pollUnreadBadge();
        setInterval(pollUnreadBadge, 30000);
    }

    window.addEventListener('hashchange', () => {
        let page = (window.location.hash.replace('#', '').split('/')[1] || 'dashboard').split('?')[0];
        if (role === 'student' && page === 'quizzes') page = 'my-subjects';
        if (role === 'instructor' && page === 'subject') page = 'my-classes';

        container.querySelectorAll('.nav-item').forEach(el => {
            el.classList.toggle('active', el.dataset.page === page);
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
