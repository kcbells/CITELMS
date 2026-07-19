/**
 * Sidebar Component
 * Renders navigation based on user role + RBAC permissions.
 * Supports Google Classroom-style dropdowns: static groups (children) and
 * a dynamic "My Subjects" dropdown listing the user's actual classes.
 */

import { Auth } from '../auth.js';
import { Api, BASE_URL } from '../api.js';
import { subjectColor } from '../utils/subject-colors.js';

// Google Material Symbols name per legacy icon key
const MS_ICONS = {
    dashboard: 'home',
    building:  'apartment',
    user:      'person',
    users:     'group',
    settings:  'settings',
    messages:  'chat',
    book:      'menu_book',
    clipboard: 'assignment',
    gradebook: 'grading',
    chart:     'bar_chart',
    bank:      'library_books',
    archive:   'archive',
    school:    'school',
    calendar:  'calendar_month',
};

function msIcon(name) {
    return `<span class="material-symbols-outlined">${MS_ICONS[name] || 'circle'}</span>`;
}

function esc(str) {
    const d = document.createElement('div');
    d.textContent = str ?? '';
    return d.innerHTML;
}

const menus = {
    admin: [
        { items: [
            { icon: 'dashboard', text: 'Home', page: 'dashboard', permission: null },
        ]},
        { items: [
            { icon: 'building', text: 'Departments', page: 'departments', permission: null },
        ]},
        { items: [
            { icon: 'messages', text: 'Messages', page: 'messages', permission: null, badge: true },
        ]},
        { items: [
            { icon: 'settings', text: 'Settings', page: 'settings', permission: null },
        ]},
    ],

    dean: [
        { items: [
            { icon: 'dashboard', text: 'Home', page: 'dashboard', permission: null },
        ]},
        { items: [
            { icon: 'book', text: 'My Subjects', subjects: true, key: 'my-subjects', permission: null },
        ]},
        { items: [
            { icon: 'calendar', text: 'Calendar', page: 'calendar', permission: null },
        ]},
        { items: [
            { icon: 'clipboard', text: 'Curriculum', key: 'curriculum-group', permission: null, children: [
                { icon: 'clipboard', text: 'Curriculum Subjects', page: 'curriculum' },
                { icon: 'book', text: 'Subject Offered', page: 'subject-offered' },
                { icon: 'users', text: 'Faculty Assignments', page: 'faculty' },
                { icon: 'gradebook', text: 'Gradebook', page: 'gradebook' },
            ]},
        ]},
        { items: [
            { icon: 'user', text: 'Manage Faculty', page: 'instructors', permission: null },
        ]},
        { items: [
            { icon: 'chart', text: 'Reports', page: 'reports', permission: null },
        ]},
        { items: [
            { icon: 'messages', text: 'Messages', page: 'messages', permission: null, badge: true },
        ]},
    ],

    program_head: [
        { items: [
            { icon: 'dashboard', text: 'Home', page: 'dashboard', permission: null },
        ]},
        { items: [
            { icon: 'book', text: 'My Subjects', subjects: true, key: 'my-subjects', permission: null },
            { icon: 'bank', text: 'Content Bank', page: 'content-bank', permission: null },
        ]},
        { items: [
            { icon: 'calendar', text: 'Calendar', page: 'calendar', permission: null },
        ]},
        { items: [
            { icon: 'gradebook', text: 'Gradebook', page: 'gradebook', permission: null },
        ]},
        { items: [
            { icon: 'messages', text: 'Messages', page: 'messages', permission: null, badge: true },
        ]},
    ],

    instructor: [
        { items: [
            { icon: 'dashboard', text: 'Home', page: 'dashboard', permission: null },
        ]},
        { items: [
            { icon: 'book', text: 'My Subjects', subjects: true, key: 'my-subjects', permission: 'subjects.view' },
            { icon: 'bank', text: 'Content Bank', page: 'content-bank', permission: 'lessons.view' },
        ]},
        { items: [
            { icon: 'calendar', text: 'Calendar', page: 'calendar', permission: null },
        ]},
        { items: [
            { icon: 'gradebook', text: 'Gradebook', page: 'gradebook', permission: 'grades.view' },
        ]},
        { items: [
            { icon: 'messages', text: 'Messages', page: 'messages', permission: null, badge: true },
        ]},
    ],

    student: [
        { items: [
            { icon: 'dashboard', text: 'Home', page: 'dashboard', permission: null },
        ]},
        { items: [
            { icon: 'book', text: 'My Subjects', subjects: true, key: 'my-subjects', permission: 'subjects.view' },
        ]},
        { items: [
            { icon: 'calendar', text: 'Calendar', page: 'calendar', permission: null },
        ]},
        { items: [
            { icon: 'gradebook', text: 'My Grades', page: 'grades', permission: 'grades.view' },
        ]},
        { items: [
            { icon: 'messages', text: 'Messages', page: 'messages', permission: null, badge: true },
        ]},
    ],
};

const SIDEBAR_COLLAPSED_KEY = 'sidebar_collapsed';

function groupOpenKey(role, key) {
    return `nav_open_${role}_${key}`;
}

function isGroupOpen(role, key) {
    // Default: open (like Google Classroom)
    return localStorage.getItem(groupOpenKey(role, key)) !== '0';
}

function subjectHref(role, subjectId) {
    // Students jump straight into the class; teachers land on the subject's
    // sections list first, then pick a section to open the class.
    return role === 'student'
        ? `#student/subject?subject_id=${subjectId}`
        : `#${role}/my-classes?subject_id=${subjectId}`;
}

function subjectChildHtml(role, s, currentHash) {
    const params = new URLSearchParams((currentHash.split('?')[1] || ''));
    const pagePart = (currentHash.split('?')[0] || '');
    const onSubjectView = pagePart.endsWith('/subject') || pagePart.endsWith('/my-classes');
    const active = onSubjectView && String(params.get('subject_id') || '') === String(s.subject_id);
    const color = subjectColor(s.subject_id);
    const label = s.subject_name || s.subject_code || 'Subject';
    const letter = (s.subject_code || label).trim().charAt(0).toUpperCase();
    return `
        <a href="${subjectHref(role, s.subject_id)}" class="nav-item nav-subitem ${active ? 'active' : ''}"
           data-page="subject" data-subject-id="${s.subject_id}" data-tooltip="${esc(label)}" title="${esc(label)}">
            <span class="nav-subject-dot" style="background:${color}">${esc(letter)}</span>
            <span class="nav-text">${esc(label)}</span>
        </a>`;
}

export function renderSidebar(container) {
    const role = Auth.user().role;
    const roleMenu = menus[role] || [];

    let currentPage = (window.location.hash.replace('#', '').split('/')[1] || 'dashboard').split('?')[0];
    if (role === 'student' && currentPage === 'quizzes') currentPage = 'my-subjects';

    // Restore collapsed state
    const isCollapsed = localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
    if (isCollapsed) {
        container.closest('.sidebar')?.classList.add('sidebar--collapsed');
        document.querySelector('.main-content')?.classList.add('sidebar--collapsed-ml');
    } else {
        container.closest('.sidebar')?.classList.remove('sidebar--collapsed');
        document.querySelector('.main-content')?.classList.remove('sidebar--collapsed-ml');
    }

    const currentHash = window.location.hash.split('#')[1] || '';

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
                <img src="${BASE_URL}/assets/images/app-icon.png" alt="PHINMA Education" class="logo-img">
                <span class="logo-text">PHINMA Cagayan de Oro College - Carmen</span>
            </a>
        </div>
        <nav class="sidebar-nav">
    `;

    for (const section of roleMenu) {
        const visibleItems = section.items.filter(item =>
            item.permission === null || item.permission === undefined || Auth.can(item.permission)
        );
        if (visibleItems.length === 0) continue;

        html += `<div class="nav-section">`;

        for (const item of visibleItems) {
            // ── Dropdown groups (static children or dynamic subjects) ──
            if (item.children || item.subjects) {
                const open = isGroupOpen(role, item.key);
                let subHtml = '';

                if (item.children) {
                    subHtml = item.children.map(child => {
                        const active = currentPage === child.page;
                        return `
                            <a href="#${role}/${child.page}" class="nav-item nav-subitem ${active ? 'active' : ''}"
                               data-page="${child.page}" data-tooltip="${child.text}">
                                <span class="nav-sub-ico material-symbols-outlined">${MS_ICONS[child.icon] || 'circle'}</span>
                                <span class="nav-text">${child.text}</span>
                            </a>`;
                    }).join('');
                } else {
                    // Dynamic subjects: "All Subjects" + async-filled list + "Archived"
                    const listPage = role === 'student' ? 'my-subjects' : 'my-classes';
                    const onArchived = currentHash.includes('view=archived');
                    const onSubjectDetail = currentHash.includes('subject_id=');
                    const listActive = currentPage === listPage && !onArchived && !onSubjectDetail;
                    const archHref = `${role}/${listPage}?view=archived`;
                    const archActive = currentHash === archHref || currentHash.startsWith(archHref + '&');
                    subHtml = `
                        <a href="#${role}/${listPage}" class="nav-item nav-subitem ${listActive ? 'active' : ''}"
                           data-page="${listPage}" data-tooltip="All Subjects">
                            <span class="nav-sub-ico material-symbols-outlined">grid_view</span>
                            <span class="nav-text">All Subjects</span>
                        </a>
                        <div class="nav-sub-dynamic" data-subjects-dropdown></div>
                        <a href="#${archHref}" class="nav-item nav-subitem ${archActive ? 'active' : ''}"
                           data-page="${listPage}" data-tooltip="Archived">
                            <span class="nav-sub-ico material-symbols-outlined">archive</span>
                            <span class="nav-text">Archived</span>
                        </a>`;
                }

                html += `
                    <div class="nav-group ${open ? 'open' : ''}">
                        <button type="button" class="nav-item nav-group-toggle" data-group-key="${item.key}" data-tooltip="${item.text}">
                            <span class="nav-icon">${msIcon(item.icon)}</span>
                            <span class="nav-text">${item.text}</span>
                            <span class="nav-group-caret material-symbols-outlined">expand_more</span>
                        </button>
                        <div class="nav-sub">${subHtml}</div>
                    </div>`;
                continue;
            }

            // ── Regular link items ──
            const hashSuffix = item.hash || '';
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
                    <span class="nav-icon">${msIcon(item.icon)}</span>
                    <span class="nav-text">${item.text}</span>
                    ${badgeHtml}
                </a>
            `;
        }

        html += `</div>`;
    }

    // (My Profile lives in the topbar account menu — no sidebar entry)
    html += `
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

    // Dropdown group toggles
    container.querySelectorAll('.nav-group-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
            const group = btn.closest('.nav-group');
            const open = group.classList.toggle('open');
            localStorage.setItem(groupOpenKey(role, btn.dataset.groupKey), open ? '1' : '0');
        });
    });

    // Fill the dynamic "My Subjects" dropdown with the user's actual classes
    const dropdownHost = container.querySelector('[data-subjects-dropdown]');
    if (dropdownHost) fillSubjectsDropdown(dropdownHost, role);

    if (role === 'student' || role === 'instructor') {
        pollUnreadBadge();
        setInterval(pollUnreadBadge, 30000);
    }

    window.addEventListener('hashchange', () => {
        const hash = window.location.hash.replace('#', '');
        const rawPage = (hash.split('/')[1] || 'dashboard').split('?')[0];
        let page = rawPage;
        if (role === 'student' && page === 'quizzes') page = 'my-subjects';
        const currentHash2 = hash;
        const curSubjectId = new URLSearchParams(hash.split('?')[1] || '').get('subject_id') || '';

        container.querySelectorAll('.nav-item').forEach(el => {
            if (el.classList.contains('nav-group-toggle')) return;

            // Subject dropdown entries: active on that subject's sections list or class page
            if (el.dataset.subjectId) {
                const onSubjectView = rawPage === 'subject' || rawPage === 'my-classes';
                el.classList.toggle('active', onSubjectView && String(el.dataset.subjectId) === curSubjectId);
                return;
            }

            const href = el.getAttribute('href')?.replace('#', '') || '';
            if (href.includes('?')) {
                // Items with query params (e.g. Archived): exact match
                el.classList.toggle('active', currentHash2 === href || currentHash2.startsWith(href + '&'));
            } else {
                // Items without query params: active if page matches.
                // Exceptions: not on the archived variant, and the subject-list
                // pages ("All Subjects") aren't active while inside one subject.
                const isOnArchived = currentHash2.includes('view=archived');
                const isSubjectList = el.dataset.page === 'my-subjects' || el.dataset.page === 'my-classes';
                const onSubjectDetail = !!curSubjectId;
                el.classList.toggle('active',
                    el.dataset.page === page && !(isSubjectList && (isOnArchived || onSubjectDetail)));
            }
        });
    });
}

async function fillSubjectsDropdown(host, role) {
    try {
        let subjects = [];
        if (role === 'student') {
            const r = await Api.get('/EnrollmentAPI.php?action=my-subjects');
            subjects = r.success ? (r.data || []) : [];
        } else {
            const r = await Api.get('/SectionsAPI.php?action=instructor-classes');
            subjects = (r.success ? (r.data || []) : []).filter(s => s.offering_status !== 'archived');
        }

        const currentHash = window.location.hash.split('#')[1] || '';
        host.innerHTML = subjects.length
            ? subjects.map(s => subjectChildHtml(role, s, currentHash)).join('')
            : '<span class="nav-sub-empty">No subjects yet</span>';
    } catch (_) {
        host.innerHTML = '';
    }
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
