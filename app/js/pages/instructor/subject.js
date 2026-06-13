/**
 * Instructor Subject Hub — Classwork, People, Calendar
 */
import { Api, BASE_URL } from '../../api.js';
import { Auth } from '../../auth.js';
import { subjectColor, subjectThemeVars } from '../../utils/subject-colors.js';
import { openFloatingChat } from '../../components/floating-messenger.js';
import { openOnlineClass, preloadOnlineClass } from '../../components/online-class-player.js';
import { getFullName, getLoginId, buildClassRoomSlug } from '../../utils/user-display.js';
import {
    G, G2, BORDER, esc, initials, emptyMsg, classroomCss, icon, iconLg,
    renderClassworkPostCard, renderViewSummaryFooter, renderViewersPanel, curriculumTableCss,
    renderPrivateCommentsRail, bindPrivateCommentRail, openGcModal, classroomPageFooter,
} from '../../utils/classroom-ui.js';
import {
    renderMaterialAttachment, bindMaterialAttachments, materialAttachmentCss, resolveMaterialUrl,
} from '../../utils/material-files.js';
import { openQuizCreatePicker } from '../../components/quiz-create-picker.js';
import { mountClassComposer } from '../../components/class-composer.js';
import { mountInstructorGradebook } from './gradebook.js';
import { buildStudentJoinUrl, renderQrInto } from '../../utils/qr-utils.js';

const inl = { size: 14, className: 'ui-icon-inline' };

export async function render(container, params) {
    const hashParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
    const subjectId = params?.subject_id || hashParams.get('subject_id');
    const urlSectionId = params?.section_id || hashParams.get('section_id');
    const urlTab = params?.tab || hashParams.get('tab') || 'classwork';
    const validTabs = ['classwork', 'people', 'calendar', 'gradebook'];

    if (!subjectId) {
        container.innerHTML = emptyMsg('No class selected.', '#instructor/my-classes', 'Back to My Classes');
        return;
    }

    container.innerHTML = `<div class="sc-loading"><div class="sc-spin"></div></div>`;

    await Auth.getUser();
    const me = Auth.user() || {};
    preloadOnlineClass();

    const initialClassmatesUrl = urlSectionId
        ? `/ClassroomAPI.php?action=classmates&subject_id=${subjectId}&section_id=${urlSectionId}`
        : `/ClassroomAPI.php?action=classmates&subject_id=${subjectId}`;

    const [dashboardRes, classRes, classmatesResInitial, annRes, lessonsRes, quizzesRes, sectionsRes, viewSummaryRes] = await Promise.all([
        Api.get('/DashboardAPI.php?action=instructor'),
        Api.get('/ClassroomAPI.php?action=info&subject_id=' + subjectId),
        Api.get(initialClassmatesUrl),
        Api.get('/AnnouncementsAPI.php?action=instructor-list&subject_id=' + subjectId),
        Api.get('/LessonsAPI.php?action=instructor-lessons&subject_id=' + subjectId),
        Api.get('/QuizzesAPI.php?action=instructor-list&subject_id=' + subjectId),
        Api.get('/SectionsAPI.php?action=instructor-classes'),
        Api.get('/ClassroomAPI.php?action=view-summary&subject_id=' + subjectId),
    ]);

    const classes = dashboardRes.success ? (dashboardRes.data?.classes || []) : [];
    const instructorSubjects = sectionsRes.success ? (sectionsRes.data || []) : [];
    const subjectFromClasses = classes.find(c => String(c.subject_id) === String(subjectId));
    const subjectFromApi = instructorSubjects.find(s => String(s.subject_id) === String(subjectId));
    const availableSections = (subjectFromApi?.sections || []).slice()
        .sort((a, b) => String(a.section_name || '').localeCompare(String(b.section_name || '')));

    let effectiveSectionId = urlSectionId ? parseInt(urlSectionId, 10) : 0;
    if (!effectiveSectionId && availableSections.length) {
        effectiveSectionId = parseInt(availableSections[0].section_id, 10) || 0;
    }

    if (!urlSectionId && effectiveSectionId) {
        const hashBase = window.location.hash.split('?')[0] || '#instructor/subject';
        const syncParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
        syncParams.set('subject_id', String(subjectId));
        syncParams.set('section_id', String(effectiveSectionId));
        if (urlTab && urlTab !== 'classwork') syncParams.set('tab', urlTab);
        const nextHash = `${hashBase}?${syncParams.toString()}`;
        if (window.location.hash !== nextHash) {
            history.replaceState(null, '', nextHash);
        }
    }

    let classmatesRes = classmatesResInitial;
    if (effectiveSectionId && String(effectiveSectionId) !== String(urlSectionId || '')) {
        classmatesRes = await Api.get(
            `/ClassroomAPI.php?action=classmates&subject_id=${subjectId}&section_id=${effectiveSectionId}`
        );
    }

    const activeSection = effectiveSectionId
        ? availableSections.find(s => String(s.section_id) === String(effectiveSectionId))
        : null;
    const subject = subjectFromClasses || (subjectFromApi ? {
        subject_id: subjectFromApi.subject_id,
        subject_code: subjectFromApi.subject_code,
        subject_name: subjectFromApi.subject_name,
        section_name: activeSection?.section_name || '',
        schedule: activeSection?.schedule || '',
        room: activeSection?.room || '',
        student_count: activeSection?.student_count || 0,
    } : null);

    if (!subject) {
        container.innerHTML = emptyMsg('Class not found in your assigned subjects.', '#instructor/my-classes', 'Back to My Classes');
        return;
    }

    const classroom = classRes.success ? (classRes.data || {}) : {};
    const classroomTeacher = classroom.teacher || {};
    const allLessonsForSubject = (lessonsRes.success ? lessonsRes.data : []).filter(l => String(l.subject_id) === String(subjectId));
    const lessons = effectiveSectionId
        ? allLessonsForSubject.filter(l => l.all_sections || (l.section_ids || []).includes(Number(effectiveSectionId)))
        : allLessonsForSubject;
    const allQuizzesForSubject = (quizzesRes.success ? quizzesRes.data : []).filter(q => String(q.subject_id) === String(subjectId));
    const quizzes = effectiveSectionId
        ? allQuizzesForSubject.filter(q => q.all_sections || (q.section_ids || []).includes(Number(effectiveSectionId)))
        : allQuizzesForSubject;
    const allAnnouncements = (annRes.success ? annRes.data : []).filter(a => String(a.subject_id) === String(subjectId));
    const announcements = effectiveSectionId
        ? allAnnouncements.filter(a => a.all_sections || (a.section_ids || []).includes(Number(effectiveSectionId)))
        : allAnnouncements;
    const classmates = classmatesRes.success ? classmatesRes.data : [];

    const students = classmates.filter(c => {
        const isMe = String(c.users_id) === String(me.users_id) || c.is_me == 1;
        const role = String(c.role || '').toLowerCase();
        return !isMe && role !== 'instructor' && role !== 'admin';
    });

    const color = subjectColor(subject.subject_id);
    const themeVars = subjectThemeVars(color);
    const displayName = getFullName(me);
    const loginId = getLoginId(me);
    const roomSlug = buildClassRoomSlug(subject.subject_code, subjectId);

    const myName = (me.name || `${me.first_name || ''} ${me.last_name || ''}`).trim() || 'Instructor';
    const myInitials = initials(me.first_name || myName, me.last_name || '');

    const viewSummary = viewSummaryRes.success ? viewSummaryRes.data : { counts: {}, enrolled_count: students.length };
    const enrolledCount = viewSummary.enrolled_count || students.length;

    const now = new Date();
    const state = {
        tab: validTabs.includes(urlTab) ? urlTab : 'classwork',
        selectedWork: null,
        workComments: [],
        privateComments: [],
        privateReplyTo: null,
        workMaterials: [],
        studentSubmissions: [],
        detailViewers: null,
        quizScores: [],
        expandedViewers: {},
        calYear: now.getFullYear(),
        calMonth: now.getMonth(),
        calSelectedDay: null,
    };

    function getViewCount(contentType, contentId) {
        const bucket = viewSummary.counts?.[contentType] || {};
        return bucket[String(contentId)] || 0;
    }

    function viewersBlock(contentType, contentId) {
        const key = `${contentType}:${contentId}`;
        const footer = renderViewSummaryFooter(getViewCount(contentType, contentId), enrolledCount, key);
        const panel = state.expandedViewers[key]
            ? renderViewersPanel(state.expandedViewers[key])
            : '';
        return footer + panel;
    }

    async function loadContentViews(contentType, contentId) {
        const res = await Api.get(
            `/ClassroomAPI.php?action=content-views&subject_id=${subjectId}&content_type=${contentType}&content_id=${contentId}`
        );
        return res.success ? res.data : { viewed: [], not_viewed: [], view_count: 0, enrolled_count: enrolledCount };
    }

    function renderMainBody() {
        if (state.selectedWork) return renderWorkDetail();
        if (state.tab === 'classwork') return renderClasswork();
        if (state.tab === 'people') return renderPeople();
        if (state.tab === 'calendar') return renderCalendar();
        if (state.tab === 'gradebook') return '<div id="sc-gradebook-host"></div>';
        return '';
    }

    function updateTabs() {
        container.querySelectorAll('.sc-tab').forEach(tab => {
            const on = tab.dataset.tab === state.tab;
            tab.classList.toggle('active', on);
            tab.setAttribute('aria-selected', on ? 'true' : 'false');
        });
    }

    function refreshBody() {
        updateTabs();
        const body = container.querySelector('#sc-body');
        if (!body) return;
        body.className = `sc-body ${state.selectedWork ? 'sc-body-focus' : ''}`;
        try {
            body.innerHTML = renderMainBody();
        } catch (err) {
            console.error('Open class render error:', err);
            body.innerHTML = `<div class="sc-empty"><h3>Could not load this tab</h3><p>Please refresh and try again.</p></div>`;
        }
        bindBodyEvents();
        refreshRail();

        if (state.tab === 'gradebook' && !state.selectedWork) {
            const host = container.querySelector('#sc-gradebook-host');
            if (host) mountInstructorGradebook(host, { subjectId });
        }

        if (state.tab === 'classwork' && !state.selectedWork) {
            const composerMount = container.querySelector('#sc-composer-mount');
            if (composerMount) {
                const allSections = subjectFromApi?.sections || (activeSection ? [activeSection] : []);
                mountClassComposer(composerMount, {
                    subjectId,
                    sectionId: effectiveSectionId || null,
                    sections: allSections,
                    instructorName: myName,
                    instructorInitials: myInitials,
                    onCreateQuiz: openQuizPicker,
                    onSuccess: () => render(container, { subject_id: subjectId, section_id: effectiveSectionId }),
                });
            }
        }
    }

    function renderShell() {
        let styleEl = document.getElementById('sc-instructor-classroom-css');
        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = 'sc-instructor-classroom-css';
            document.head.appendChild(styleEl);
        }
        styleEl.textContent = classroomCss(color) + instructorExtraCss() + materialAttachmentCss() + curriculumTableCss();

        container.innerHTML = `
            <div class="sc-page sc-instructor-class" style="${themeVars}">
                <a href="#instructor/my-classes${effectiveSectionId ? `?subject_id=${subjectId}` : ''}" class="sc-back">
                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                    ${effectiveSectionId ? 'Back to Sections' : 'My Classes'}
                </a>

                <header class="sc-hero" style="background:${color}">
                    <div class="sc-hero-main">
                        <span class="sc-hero-code">${esc(subject.subject_code || '')}</span>
                        <h1 class="sc-hero-title">${esc(subject.subject_name || 'Subject')}</h1>
                        <div class="sc-hero-chips">
                            ${subject.section_name ? `<span class="sc-chip">${esc(subject.section_name)}</span>` : ''}
                            ${subject.schedule ? `<span class="sc-chip">${icon('clock', inl)} ${esc(subject.schedule)}</span>` : ''}
                            ${subject.room ? `<span class="sc-chip">${icon('pin', inl)} ${esc(subject.room)}</span>` : ''}
                            <span class="sc-chip">${icon('user', inl)} Instructor</span>
                        </div>
                    </div>
                    <div class="sc-hero-stats">
                        <div class="sc-stat"><strong>${lessons.length}</strong><span>Lessons</span></div>
                        <div class="sc-stat"><strong>${quizzes.length}</strong><span>Quizzes</span></div>
                        <div class="sc-stat"><strong>${students.length}</strong><span>Students</span></div>
                    </div>
                </header>

                <div class="sc-layout ${state.selectedWork ? 'sc-layout--work-focus' : ''}" id="sc-layout">
                    <div class="sc-main">
                        <div class="sc-panel">
                            <nav class="sc-tabs" id="sc-tabs" role="tablist">
                                <button type="button" role="tab" class="sc-tab ${state.tab === 'classwork' ? 'active' : ''}" data-tab="classwork" aria-selected="${state.tab === 'classwork'}">Classwork</button>
                                <button type="button" role="tab" class="sc-tab ${state.tab === 'people' ? 'active' : ''}" data-tab="people" aria-selected="${state.tab === 'people'}">People</button>
                                <button type="button" role="tab" class="sc-tab ${state.tab === 'calendar' ? 'active' : ''}" data-tab="calendar" aria-selected="${state.tab === 'calendar'}">Calendar</button>
                                <button type="button" role="tab" class="sc-tab ${state.tab === 'gradebook' ? 'active' : ''}" data-tab="gradebook" aria-selected="${state.tab === 'gradebook'}">Gradebook</button>
                            </nav>
                            <div id="sc-body" class="sc-body"></div>
                        </div>
                    </div>
                    <div id="sc-rail-mount">${renderRightRail()}</div>
                </div>
                ${classroomPageFooter()}
            </div>
        `;

        bindShellEvents();
        refreshBody();
    }

    function refreshRail() {
        const mount = container.querySelector('#sc-rail-mount');
        const layout = container.querySelector('#sc-layout');
        if (!mount) return;
        mount.innerHTML = renderRightRail();
        if (layout) {
            layout.classList.toggle('sc-layout--work-focus', !!state.selectedWork);
        }
        if (state.selectedWork) bindPrivateRail();
    }

    function bindPrivateRail() {
        const rail = container.querySelector('#sc-rail-mount');
        bindPrivateCommentRail(rail, {
            onReply: (target) => {
                state.privateReplyTo = target;
                refreshRail();
                container.querySelector('#sc-private-input')?.focus();
            },
            onCancelReply: () => {
                state.privateReplyTo = null;
                refreshRail();
            },
        });
        container.querySelector('#sc-private-post')?.addEventListener('click', () => {
            const text = container.querySelector('#sc-private-input')?.value?.trim();
            if (text) postComment(text, true);
        });
    }

    function renderRightRail() {
        if (state.selectedWork) {
            return renderPrivateCommentsRail({
                comments: state.privateComments,
                userInitials: myInitials,
                hint: 'Replies are only visible to the student you respond to.',
                instructorMode: true,
                replyingTo: state.privateReplyTo,
            });
        }

        return `
            <aside class="sc-rail" id="sc-rail">
                <div class="sc-rail-card sc-rail-video">
                    <div class="sc-rail-icon">${icon('video', { size: 22 })}</div>
                    <h3 class="sc-rail-title">Online Class</h3>
                    <p class="sc-rail-desc">Start the live class — you join instantly as host with full controls.</p>
                    <div class="sc-rail-live">
                        <span class="sc-live-dot"></span> No login required · LMS hosted
                    </div>
                    <button type="button" class="sc-rail-btn video" id="sc-join-video" data-room="${esc(roomSlug)}">
                        Start Online Class
                    </button>
                    <p class="sc-rail-foot">Host as <strong>${esc(displayName)}</strong></p>
                </div>

            </aside>
        `;
    }

    function formatPosted(dateStr) {
        if (!dateStr) return '';
        const d = new Date(String(dateStr).replace(' ', 'T'));
        if (Number.isNaN(d.getTime())) return '';
        return d.toLocaleString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric',
            hour: 'numeric', minute: '2-digit',
        });
    }

    function formatDue(dateStr) {
        if (!dateStr) return null;
        const d = new Date(dateStr + 'T23:59:59');
        if (Number.isNaN(d.getTime())) return null;
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const due = new Date(d);
        due.setHours(0, 0, 0, 0);
        const label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        if (due < now) return { label, late: true };
        if (due.getTime() === now.getTime()) return { label: 'Today', late: false };
        return { label, late: false };
    }

    function renderDueDateEditor(w) {
        const raw = w.data.due_date ? String(w.data.due_date).slice(0, 10) : '';
        const due = formatDue(w.data.due_date);
        return `
            <div class="gc-due-editor">
                <span class="gc-due-editor-label">Due date</span>
                <input type="date" id="gc-instructor-due" value="${esc(raw)}">
                <button type="button" class="gc-due-editor-save" id="gc-save-due">Save</button>
                ${due ? `<span class="gc-due ${due.late ? 'late' : ''}">${due.late ? 'Past due' : 'Due'} ${esc(due.label)}</span>` : '<span class="gc-due">No due date</span>'}
                <p class="gc-due-editor-hint">Students cannot turn in after the due date unless you extend it here.</p>
            </div>`;
    }

    function fileHref(filePath) {
        return resolveMaterialUrl(filePath);
    }

    function groupStudentSubmissions(files) {
        const map = new Map();
        for (const f of files) {
            const key = String(f.user_student_id);
            if (!map.has(key)) {
                map.set(key, {
                    user_student_id: f.user_student_id,
                    student_name: f.student_name || 'Student',
                    student_id: f.student_id || '',
                    submitted_at: f.submitted_at || null,
                    files: [],
                });
            }
            const g = map.get(key);
            g.files.push(f);
            if (f.submitted_at && (!g.submitted_at || f.submitted_at < g.submitted_at)) {
                g.submitted_at = f.submitted_at;
            }
        }
        return [...map.values()].sort((a, b) => {
            const ta = a.submitted_at ? new Date(String(a.submitted_at).replace(' ', 'T')).getTime() : Infinity;
            const tb = b.submitted_at ? new Date(String(b.submitted_at).replace(' ', 'T')).getTime() : Infinity;
            return ta - tb;
        });
    }

    function renderStudentSubmissionRow(group, index) {
        const submittedLbl = group.submitted_at ? formatPosted(group.submitted_at) : '';
        const ini = group.student_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
        const filesHtml = group.files.map(f => {
            const name = f.original_name || f.file_name || 'File';
            const href = fileHref(f.file_path);
            return `
                <a class="gc-work-attach" href="${esc(href)}" target="_blank" rel="noopener">
                    <span class="gc-work-attach-icon">${icon('document', { size: 20 })}</span>
                    <span class="gc-work-attach-text">
                        <span class="gc-work-attach-name">${esc(name)}</span>
                    </span>
                </a>`;
        }).join('');

        return `
            <article class="gc-student-submission">
                <div class="gc-student-submission-hdr">
                    <span class="gc-submission-order">#${index + 1}</span>
                    <div class="sc-avatar sm">${esc(ini)}</div>
                    <div class="gc-student-submission-meta">
                        <span class="gc-student-submission-name">${esc(group.student_name)}</span>
                        ${group.student_id ? `<span class="gc-student-submission-id">${esc(group.student_id)}</span>` : ''}
                        ${submittedLbl ? `<span class="gc-student-submission-time">${icon('clock', { size: 12, className: 'ui-icon-inline' })} ${esc(submittedLbl)}</span>` : ''}
                    </div>
                </div>
                <div class="gc-student-submission-files">${filesHtml}</div>
            </article>`;
    }

    function renderClassCodeAside() {
        const code = subject.subject_code || '';
        const sectionLabel = activeSection?.section_name || subject.section_name || '';
        const qrSectionId = effectiveSectionId || activeSection?.section_id || 0;

        if (!code || !qrSectionId) {
            return `
                <aside class="sc-cw-aside" aria-label="Subject code">
                    <div class="sc-class-code-card sc-class-code-card--empty">
                        <div class="sc-class-code-icon">${icon('school', { size: 28 })}</div>
                        <h3 class="sc-class-code-title">Subject code</h3>
                        <p class="sc-class-code-hint">Create a section in <strong>My Classes</strong> to generate a QR code students can scan to join.</p>
                    </div>
                </aside>`;
        }

        const joinUrl = buildStudentJoinUrl(code, qrSectionId);
        const sectionPicker = availableSections.length > 1
            ? `<label class="sc-class-code-pick-label" for="sc-section-pick">Section</label>
               <select class="sc-class-code-section-pick" id="sc-section-pick" aria-label="Choose section for QR code">
                   ${availableSections.map(sec => `
                       <option value="${sec.section_id}" ${String(sec.section_id) === String(qrSectionId) ? 'selected' : ''}>
                           ${esc(sec.section_name)}
                       </option>`).join('')}
               </select>`
            : (sectionLabel ? `<p class="sc-class-code-section">${esc(sectionLabel)}</p>` : '');

        return `
            <aside class="sc-cw-aside" aria-label="Subject code">
                <div class="sc-class-code-card">
                    <h3 class="sc-class-code-title">Subject code</h3>
                    ${sectionPicker}
                    <p class="sc-class-code-hint">Students scan QR or enter this subject code to join</p>
                    <div class="sc-class-qr-wrap" id="sc-class-qr" data-qr-url="${esc(joinUrl)}"></div>
                    <button type="button" class="sc-class-code-value" data-copy-code="${esc(code)}" title="Click to copy">${esc(code)}</button>
                    <button type="button" class="sc-class-code-copy" data-copy-code="${esc(code)}">
                        ${icon('copy', { size: 14, className: 'ui-icon-inline' })} Copy code
                    </button>
                    <p class="sc-class-code-foot">Instructor only — not shown to students</p>
                </div>
            </aside>`;
    }

    function classworkPostedTime(data) {
        const raw = data?.created_at || data?.updated_at || data?.posted_at || '';
        const t = new Date(String(raw).replace(' ', 'T')).getTime();
        return Number.isNaN(t) ? 0 : t;
    }

    function renderClasswork() {
        const items = [
            ...lessons.map(l => ({ type: 'lesson', id: l.lessons_id, data: l })),
            ...quizzes.map(q => ({ type: 'quiz', id: q.quiz_id, data: q })),
        ].sort((a, b) => classworkPostedTime(b.data) - classworkPostedTime(a.data));

        const feedInner = !items.length
            ? `<div class="sc-empty sc-empty--inline">
                <div class="sc-empty-icon">${iconLg('folderOpen')}</div>
                <h3>No classwork yet</h3>
                <p>Use the box above to upload a lesson, post an announcement, or create a quiz.</p>
            </div>`
            : `<div class="gc-cw-stream">
                ${items.map(classworkRow).join('')}
              </div>`;

        return `
            <div class="sc-cw-layout">
                ${renderClassCodeAside()}
                <div class="sc-cw-feed">
                    <div id="sc-composer-mount"></div>
                    ${feedInner}
                </div>
            </div>`;
    }

    function renderCwKebabMenu(type, id, published, title) {
        const pubLabel = published ? 'Save as draft' : 'Publish';
        const pubStatus = published ? 'draft' : 'published';
        const typeItems = type === 'quiz'
            ? `<button type="button" class="gc-cw-kebab-item" data-cw-action="questions" data-cw-type="quiz" data-cw-id="${id}">${icon('clipboard', inl)} Edit questions</button>`
            : '';
        return `
            <div class="gc-cw-kebab-wrap">
                <button type="button" class="gc-cw-kebab" title="Actions" aria-label="More actions">${icon('menu', { size: 18 })}</button>
                <div class="gc-cw-kebab-menu">
                    <button type="button" class="gc-cw-kebab-item" data-cw-action="status" data-cw-type="${type}" data-cw-id="${id}" data-cw-status="${pubStatus}">${icon(published ? 'folder' : 'check', inl)} ${pubLabel}</button>
                    ${typeItems}
                    <button type="button" class="gc-cw-kebab-item danger" data-cw-action="delete" data-cw-type="${type}" data-cw-id="${id}" data-cw-name="${esc(title)}">${icon('trash', inl)} Delete</button>
                </div>
            </div>`;
    }

    function listQuizSubmissionsInOrder(rows) {
        const map = new Map();
        for (const r of rows || []) {
            const key = r.student_id || `${r.first_name}-${r.last_name}`;
            const pct = parseFloat(r.percentage) || 0;
            const completed = r.completed_at || '';
            const name = `${r.first_name || ''} ${r.last_name || ''}`.trim() || 'Student';
            if (!map.has(key)) {
                map.set(key, {
                    student_id: r.student_id || '',
                    name,
                    score: pct,
                    attempts: 1,
                    passed: Number(r.passed) === 1,
                    first_completed: completed,
                });
            } else {
                const g = map.get(key);
                g.attempts += 1;
                if (completed && (!g.first_completed || completed < g.first_completed)) {
                    g.first_completed = completed;
                    g.score = pct;
                    g.passed = Number(r.passed) === 1;
                }
            }
        }
        return [...map.values()].sort((a, b) => {
            const ta = a.first_completed ? new Date(String(a.first_completed).replace(' ', 'T')).getTime() : Infinity;
            const tb = b.first_completed ? new Date(String(b.first_completed).replace(' ', 'T')).getTime() : Infinity;
            return ta - tb;
        });
    }

    function renderQuizScoresTable(scores) {
        const rows = listQuizSubmissionsInOrder(scores);
        if (!rows.length) {
            return `<div class="gc-cur-empty">No student attempts yet.</div>`;
        }
        const fmtDate = (ts) => {
            if (!ts) return '—';
            const d = new Date(String(ts).replace(' ', 'T'));
            if (Number.isNaN(d.getTime())) return '—';
            return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
        };
        return `
            <div class="gc-cur-wrap">
                <div class="gc-cur-label">Student submissions — first to last turned in</div>
                <table class="gc-cur-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th class="th-left">Student ID</th>
                            <th class="th-left">Name</th>
                            <th>Score</th>
                            <th>Attempts</th>
                            <th>Status</th>
                            <th>Turned in</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.map((s, i) => `
                            <tr>
                                <td class="td-rank">${i + 1}</td>
                                <td class="td-id">${esc(s.student_id || '—')}</td>
                                <td class="td-name">${esc(s.name)}</td>
                                <td class="td-num">${s.score.toFixed(0)}%</td>
                                <td class="td-num">${s.attempts}</td>
                                <td class="td-pass">
                                    <span class="${s.passed ? 'gc-cur-badge-pass' : 'gc-cur-badge-fail'}">${s.passed ? 'Passed' : 'Failed'}</span>
                                </td>
                                <td class="td-num" style="font-weight:400;font-size:11px;color:#5F6368;">${esc(fmtDate(s.first_completed))}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>`;
    }

    async function loadQuizScores(quizId) {
        const res = await Api.get(`/QuizAttemptsAPI.php?action=quiz-scores&quiz_id=${quizId}`);
        return res.success ? (res.data || []) : [];
    }

    function classworkRow(item) {
        const d = item.data;
        const posted = formatPosted(d.created_at || d.updated_at);

        if (item.type === 'lesson') {
            const status = String(d.status || 'draft').toLowerCase();
            const published = status === 'published';
            const submitCount = d.completions != null ? Number(d.completions) : 0;
            const title = d.lesson_title || d.title || 'Untitled lesson';
            const right = `
                ${submitCount > 0 ? `<span class="gc-cw-submissions">${submitCount} turned in</span>` : ''}
                <span class="gc-cw-status ${published ? 'done' : ''}">${published ? 'Published' : 'Draft'}</span>`;
            return renderClassworkPostCard({
                authorName: myName,
                authorInitials: myInitials,
                posted,
                iconName: 'document',
                title,
                typeLabel: 'Ungraded activity',
                rightHtml: right,
                workType: 'lesson',
                workId: d.lessons_id,
                viewsFooter: published ? viewersBlock('lesson', d.lessons_id) : '',
                menuHtml: renderCwKebabMenu('lesson', d.lessons_id, published, title),
            });
        }

        const status = String(d.status || 'draft').toLowerCase();
        const published = status === 'published';
        const pts = d.total_points != null && d.total_points !== '' ? Number(d.total_points) : null;
        const attemptCount = d.attempt_count != null ? Number(d.attempt_count) : 0;
        const title = d.quiz_title || 'Untitled quiz';
        const right = `
            ${attemptCount > 0 ? `<span class="gc-cw-submissions">${attemptCount} turned in</span>` : ''}
            ${pts != null ? `<span class="gc-cw-points">${pts} pts</span>` : ''}
            <span class="gc-cw-status ${published ? 'done' : ''}">${published ? 'Published' : 'Draft'}</span>`;
        return renderClassworkPostCard({
            authorName: myName,
            authorInitials: myInitials,
            posted,
            iconName: 'quiz',
            title,
            typeLabel: `${d.question_count || 0} questions`,
            rightHtml: right,
            workType: 'quiz',
            workId: d.quiz_id,
            viewsFooter: published ? viewersBlock('quiz', d.quiz_id) : '',
            menuHtml: renderCwKebabMenu('quiz', d.quiz_id, published, title),
        });
    }

    function renderWorkDetail() {
        const w = state.selectedWork;
        if (!w) return '';

        const posted = formatPosted(w.data.created_at || w.data.updated_at);
        const title = w.type === 'lesson'
            ? (w.data.lesson_title || w.data.title || 'Untitled lesson')
            : (w.data.quiz_title || 'Untitled quiz');
        const typeLabel = w.type === 'lesson' ? 'Ungraded activity' : 'Quiz assignment';
        const description = w.type === 'quiz' ? (w.data.quiz_description || '') : '';

        const materials = state.workMaterials || [];
        const submissionGroups = groupStudentSubmissions(state.studentSubmissions || []);
        const quizSubmitCount = w.type === 'quiz' ? listQuizSubmissionsInOrder(state.quizScores).length : 0;
        const submissionCount = w.type === 'lesson'
            ? submissionGroups.length
            : quizSubmitCount + submissionGroups.length;

        const materialsBlock = w.type === 'lesson' && materials.length ? `
            <div class="gc-focus-card gc-focus-card--materials">
                <div class="gc-material-list">${materials.map(renderMaterialAttachment).join('')}</div>
            </div>` : '';

        const actionRow = `
            <div class="gc-detail-action-row">
                <button type="button" class="gc-detail-action-btn" id="gc-open-submissions">
                    ${icon('users', inl)} View submissions (${submissionCount})
                </button>
                ${state.detailViewers ? `
                <button type="button" class="gc-detail-action-btn" id="gc-open-viewers">
                    ${icon('eye', inl)} Who viewed this
                </button>` : ''}
            </div>`;

        const quizMeta = w.type === 'quiz' ? `
            <p class="gc-instructions-extra">
                ${w.data.question_count || 0} questions ·
                ${w.data.time_limit ? `${w.data.time_limit} min` : 'No time limit'} ·
                Pass ${w.data.passing_rate || 0}% ·
                ${(w.data.max_attempts || 0) > 0 ? `${w.data.max_attempts} attempt${w.data.max_attempts !== 1 ? 's' : ''}` : 'Unlimited attempts'}
            </p>` : '';

        return `
            <div class="gc-detail gc-detail--stack">
                <div class="gc-detail-top">
                    <button type="button" class="gc-back-btn" id="sc-back-cw" aria-label="Back to classwork">
                        <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                    </button>
                    <span class="gc-breadcrumb">Classwork</span>
                </div>

                <div class="gc-detail-stack">
                    <div class="gc-cw-card-author gc-cw-card-author--detail">
                        <div class="sc-avatar teacher-av">${esc(myInitials)}</div>
                        <div class="gc-cw-author-text">
                            <span class="gc-cw-author-name">${esc(myName)}</span>
                            ${posted ? `<span class="gc-cw-posted-time">${esc(posted)}</span>` : ''}
                        </div>
                    </div>

                    <div class="gc-assign-head">
                        <div class="gc-assign-icon">${icon(w.type === 'lesson' ? 'document' : 'quiz', { size: 28 })}</div>
                        <div class="gc-assign-head-text">
                            <h1 class="gc-detail-title">${esc(title)}</h1>
                            <p class="gc-detail-type">${typeLabel}</p>
                        </div>
                    </div>

                    ${renderDueDateEditor(w)}
                    ${actionRow}

                    ${description ? `<div class="gc-instructions-body">${esc(description)}</div>` : ''}
                    ${quizMeta}

                    ${materialsBlock}

                    <section class="gc-focus-card gc-focus-card--comments">
                        <h3 class="gc-focus-card-title">${icon('messages', inl)} Class comments</h3>
                        ${commentSection()}
                    </section>
                </div>
            </div>`;
    }

    function renderPeople() {
        const myName = (me.name || `${me.first_name || ''} ${me.last_name || ''}`).trim() || 'Instructor';
        const myIdText = loginId || me.email || 'Instructor';
        const myInitials = initials(me.first_name || myName[0], me.last_name || myName.split(' ').slice(1).join(' '));
        const teacherName = classroomTeacher.full_name
            || `${classroomTeacher.first_name || ''} ${classroomTeacher.last_name || ''}`.trim()
            || myName;

        return `
            <div class="sc-people-grid">
                <section class="sc-people-card sc-teacher-card">
                    <h3 class="sc-section-title">You</h3>
                    <div class="sc-person-block">
                        <div class="sc-avatar lg teacher-av">${esc(myInitials)}</div>
                        <div class="sc-person-info">
                            <div class="sc-person-name">${esc(teacherName)}</div>
                            <div class="sc-person-role">Instructor</div>
                            <div class="sc-person-email">${esc(myIdText)}</div>
                        </div>
                    </div>
                </section>

                <section class="sc-people-card sc-classmates-card">
                    <h3 class="sc-section-title">Students <span class="sc-badge-count">${students.length}</span></h3>
                    <p class="sc-people-hint">Tap a student to send a message</p>
                    ${students.length === 0
                        ? `<p class="sc-muted">No students enrolled in this class yet.</p>`
                        : `<div class="sc-mates-grid">
                            ${students.map(s => {
                                const name = (s.full_name || `${s.first_name || ''} ${s.last_name || ''}`).trim() || 'Student';
                                return `<button type="button" class="sc-mate sc-mate-click"
                                    data-person-id="${s.users_id}">
                                    <div class="sc-avatar">${initials(s.first_name, s.last_name)}</div>
                                    <div class="sc-mate-info">
                                        <span class="sc-mate-name">${esc(name)}</span>
                                        <span class="sc-mate-id">${esc(s.student_id || 'Student')}</span>
                                    </div>
                                    <span class="sc-person-chevron">›</span>
                                </button>`;
                            }).join('')}
                        </div>`
                    }
                </section>
            </div>
        `;
    }

    function parseCalDate(str) {
        if (!str) return null;
        const d = new Date(String(str).includes('T') ? str : `${str}T12:00:00`);
        return Number.isNaN(d.getTime()) ? null : d;
    }

    function dateKey(d) {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    function buildCalendarEvents() {
        const events = [];

        lessons.forEach(l => {
            const d = parseCalDate(l.created_at || l.updated_at);
            if (!d) return;
            events.push({
                kind: 'lesson',
                date: d,
                key: dateKey(d),
                id: l.lessons_id,
                title: l.lesson_title || l.title || 'Lesson',
                sub: 'Lesson posted',
                icon: 'document',
                data: l,
            });
        });

        announcements.forEach(a => {
            const d = parseCalDate(a.created_at);
            if (!d) return;
            events.push({
                kind: 'announcement',
                date: d,
                key: dateKey(d),
                id: a.announcement_id,
                title: a.title || 'Announcement',
                sub: 'Announcement',
                icon: 'announce',
                data: a,
            });
        });

        quizzes.forEach(q => {
            const title = q.quiz_title || 'Quiz';
            if (q.due_date) {
                const d = parseCalDate(q.due_date);
                if (d) {
                    events.push({
                        kind: 'quiz-due',
                        date: d,
                        key: dateKey(d),
                        id: q.quiz_id,
                        title,
                        sub: `Quiz due · ${q.total_points != null ? q.total_points + ' pts' : 'Graded'}`,
                        icon: 'quiz',
                        data: q,
                    });
                }
            }
            if (q.availability_start) {
                const d = parseCalDate(q.availability_start);
                if (d) {
                    events.push({
                        kind: 'quiz-opens',
                        date: d,
                        key: dateKey(d),
                        id: q.quiz_id,
                        title,
                        sub: 'Quiz opens',
                        icon: 'clock',
                        data: q,
                    });
                }
            }
            const posted = parseCalDate(q.created_at);
            if (posted && !q.due_date) {
                events.push({
                    kind: 'quiz',
                    date: posted,
                    key: dateKey(posted),
                    id: q.quiz_id,
                    title,
                    sub: 'Quiz posted',
                    icon: 'quiz',
                    data: q,
                });
            }
        });

        return events.sort((a, b) => b.date - a.date);
    }

    function formatCalDay(d) {
        return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    }

    function formatCalTime(d) {
        return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    }

    function renderCalendar() {
        const events = buildCalendarEvents();
        const eventsByDay = {};
        events.forEach(ev => {
            if (!eventsByDay[ev.key]) eventsByDay[ev.key] = [];
            eventsByDay[ev.key].push(ev);
        });

        const year = state.calYear;
        const month = state.calMonth;
        const monthLabel = new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        const firstDow = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const todayKey = dateKey(new Date());

        let cells = '';
        for (let i = 0; i < firstDow; i++) {
            cells += '<div class="sc-cal-cell sc-cal-cell--empty"></div>';
        }
        for (let day = 1; day <= daysInMonth; day++) {
            const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayEvents = eventsByDay[key] || [];
            const isToday = key === todayKey;
            const isSelected = state.calSelectedDay === key;
            cells += `
                <button type="button" class="sc-cal-cell ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''} ${dayEvents.length ? 'has-events' : ''}"
                    data-cal-day="${key}">
                    <span class="sc-cal-day-num">${day}</span>
                    ${dayEvents.length ? `<span class="sc-cal-dots">${dayEvents.slice(0, 3).map(ev => `<i class="sc-cal-dot sc-cal-dot--${ev.kind}"></i>`).join('')}</span>` : ''}
                </button>`;
        }

        const filterKey = state.calSelectedDay;
        const listEvents = (filterKey
            ? (eventsByDay[filterKey] || [])
            : events
        ).slice().sort((a, b) => b.date - a.date);

        const upcoming = events
            .filter(ev => ev.date >= new Date(new Date().setHours(0, 0, 0, 0)))
            .sort((a, b) => a.date - b.date);
        const listTitle = filterKey
            ? formatCalDay(new Date(filterKey + 'T12:00:00'))
            : 'All class activity';

        const eventRow = (ev) => {
            const openable = ev.kind === 'lesson' || ev.kind.startsWith('quiz');
            const dueSoon = ev.kind === 'quiz-due' && ev.date < new Date(Date.now() + 7 * 86400000);
            return `
                <article class="sc-cal-event ${openable ? 'sc-cal-event--click' : ''}" ${openable ? `data-cal-open="${ev.kind.startsWith('quiz') ? 'quiz' : 'lesson'}" data-cal-id="${ev.id}"` : ''}>
                    <div class="sc-cal-event-icon sc-cal-event-icon--${ev.kind}">${icon(ev.icon, { size: 18 })}</div>
                    <div class="sc-cal-event-body">
                        <div class="sc-cal-event-title">${esc(ev.title)}</div>
                        <div class="sc-cal-event-sub">${esc(ev.sub)} · ${formatCalDay(ev.date)}${ev.kind !== 'quiz-due' ? ` · ${formatCalTime(ev.date)}` : ''}</div>
                        ${ev.kind === 'announcement' && ev.data.content ? `<p class="sc-cal-event-msg">${esc(ev.data.content)}</p>` : ''}
                    </div>
                    ${ev.kind === 'quiz-due' ? `<span class="sc-cal-event-badge ${dueSoon ? 'urgent' : ''}">Due</span>` : ''}
                    ${openable ? `<span class="sc-cal-event-chevron">›</span>` : ''}
                </article>`;
        };

        return `
            <div class="sc-calendar">
                <div class="sc-cal-header">
                    <div>
                        <h2 class="sc-cal-title">${esc(subject.subject_name)}</h2>
                        <p class="sc-cal-sub">${esc(subject.subject_code)}${subject.section_name ? ` · ${esc(subject.section_name)}` : ''}</p>
                    </div>
                    <div class="sc-cal-nav">
                        <button type="button" class="sc-cal-nav-btn" id="sc-cal-prev" aria-label="Previous month">‹</button>
                        <span class="sc-cal-month">${esc(monthLabel)}</span>
                        <button type="button" class="sc-cal-nav-btn" id="sc-cal-next" aria-label="Next month">›</button>
                        <button type="button" class="sc-cal-today-btn" id="sc-cal-today">Today</button>
                    </div>
                </div>

                <div class="sc-cal-grid-wrap">
                    <div class="sc-cal-weekdays">
                        ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(w => `<span>${w}</span>`).join('')}
                    </div>
                    <div class="sc-cal-grid">${cells}</div>
                </div>

                <div class="sc-cal-lists">
                    <section class="sc-cal-list-section">
                        <div class="sc-cal-list-hdr">
                            <h3>${icon('clock', inl)} Upcoming</h3>
                            <span class="sc-cal-count">${upcoming.length}</span>
                        </div>
                        ${upcoming.length
                            ? `<div class="sc-cal-events">${upcoming.slice(0, 8).map(eventRow).join('')}</div>`
                            : `<p class="sc-cal-empty">No upcoming tasks or due dates.</p>`
                        }
                    </section>

                    <section class="sc-cal-list-section">
                        <div class="sc-cal-list-hdr">
                            <h3>${filterKey ? icon('calendar', inl) : icon('folderOpen', inl)} ${esc(listTitle)}</h3>
                            ${filterKey ? `<button type="button" class="sc-cal-clear-filter" id="sc-cal-clear">Show all</button>` : `<span class="sc-cal-count">${events.length}</span>`}
                        </div>
                        ${listEvents.length
                            ? `<div class="sc-cal-events">${listEvents.map(eventRow).join('')}</div>`
                            : `<p class="sc-cal-empty">${filterKey ? 'Nothing scheduled on this day.' : 'No lessons, quizzes, or announcements yet.'}</p>`
                        }
                    </section>
                </div>
            </div>`;
    }

    function commentSection() {
        return `
            <div class="sc-comments" data-scope="work">
                <div class="sc-comment-compose">
                    <div class="sc-avatar sm teacher-av">${initials(me.first_name, me.last_name)}</div>
                    <div class="sc-comment-input-wrap">
                        <textarea id="sc-work-input" class="sc-comment-input" placeholder="Add class comment..." rows="2"></textarea>
                        <button type="button" id="sc-work-post" class="sc-comment-btn">Post</button>
                    </div>
                </div>
                <div class="sc-comment-list" id="sc-work-comments">
                    ${state.workComments.length
                        ? state.workComments.map(commentRow).join('')
                        : `<p class="sc-comment-empty">No comments yet. Be the first to comment.</p>`
                    }
                </div>
            </div>
        `;
    }

    function commentRow(c) {
        const date = c.created_at
            ? new Date(c.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
            : '';
        const roleLabel = c.role === 'instructor' ? 'Instructor' : c.role === 'admin' ? 'Admin' : '';
        const authorName = c.author_name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'User';
        return `
            <div class="sc-comment ${c.is_mine == 1 ? 'mine' : ''}">
                <div class="sc-avatar sm ${c.role === 'instructor' ? 'teacher-av' : ''}">${initials(c.first_name, c.last_name)}</div>
                <div class="sc-comment-body">
                    <div class="sc-comment-head">
                        <span class="sc-comment-author">${esc(authorName)}</span>
                        ${roleLabel ? `<span class="sc-comment-role">${roleLabel}</span>` : ''}
                        <span class="sc-comment-date">${esc(date)}</span>
                    </div>
                    <p class="sc-comment-text">${esc(c.content || '')}</p>
                </div>
            </div>
        `;
    }

    async function loadWorkComments(lessonsId, quizId) {
        let base = '/ClassroomAPI.php?action=comments&subject_id=' + subjectId;
        if (lessonsId) base += '&lessons_id=' + lessonsId;
        else if (quizId) base += '&quiz_id=' + quizId;

        const [pubRes, privRes] = await Promise.all([
            Api.get(base + '&visibility=public'),
            Api.get(base + '&visibility=private'),
        ]);
        state.workComments = pubRes.success ? pubRes.data : [];
        state.privateComments = privRes.success ? privRes.data : [];
    }

    async function loadWorkMaterials(lessonsId) {
        const res = await Api.get(`/LessonsAPI.php?action=materials&lessons_id=${lessonsId}`);
        state.workMaterials = res.success ? (res.data || []) : [];
    }

    async function loadStudentSubmissions(lessonsId, quizId) {
        let url = `/ClassroomAPI.php?action=submissions&subject_id=${subjectId}&submitted_only=1`;
        if (lessonsId) url += `&lessons_id=${lessonsId}`;
        else if (quizId) url += `&quiz_id=${quizId}`;
        const res = await Api.get(url);
        state.studentSubmissions = res.success ? (res.data || []) : [];
    }

    async function openWork(type, id) {
        state.workMaterials = [];
        state.studentSubmissions = [];
        state.detailViewers = null;
        state.privateReplyTo = null;

        if (type === 'lesson') {
            const lesson = lessons.find(l => String(l.lessons_id) === String(id));
            if (!lesson) return;
            state.tab = 'classwork';
            state.selectedWork = { type: 'lesson', id, data: lesson };
            const body = container.querySelector('#sc-body');
            if (body) {
                body.className = 'sc-body sc-body-focus';
                body.innerHTML = '<div class="sc-loading"><div class="sc-spin"></div></div>';
            }
            const [, , , viewers] = await Promise.all([
                loadWorkComments(id, null),
                loadWorkMaterials(id),
                loadStudentSubmissions(id, null),
                loadContentViews('lesson', id),
            ]);
            state.detailViewers = viewers;
            refreshBody();
            return;
        }

        const quiz = quizzes.find(q => String(q.quiz_id) === String(id));
        if (!quiz) return;
        state.tab = 'classwork';
        state.selectedWork = { type: 'quiz', id, data: quiz };
        const body = container.querySelector('#sc-body');
        if (body) {
            body.className = 'sc-body sc-body-focus';
            body.innerHTML = '<div class="sc-loading"><div class="sc-spin"></div></div>';
        }
        const [, , viewers, scores] = await Promise.all([
            loadWorkComments(null, id),
            loadStudentSubmissions(null, id),
            loadContentViews('quiz', id),
            loadQuizScores(id),
        ]);
        state.detailViewers = viewers;
        state.quizScores = scores;
        refreshBody();
    }

    function buildSubmissionsModalBody(w) {
        const submissionGroups = groupStudentSubmissions(state.studentSubmissions || []);
        const fileSection = submissionGroups.length ? `
            <div class="gc-modal-section">
                <h3 class="gc-modal-section-title">${icon('document', inl)} File attachments</h3>
                <div class="gc-student-submissions-list">
                    ${submissionGroups.map((g, i) => renderStudentSubmissionRow(g, i)).join('')}
                </div>
            </div>` : '';

        const quizSection = w.type === 'quiz' ? `
            <div class="gc-modal-section">
                ${renderQuizScoresTable(state.quizScores)}
            </div>` : '';

        if (!fileSection && !quizSection) {
            return '<p class="gc-focus-card-empty">No students have turned in work yet.</p>';
        }

        return `${quizSection}${fileSection}
            <p class="gc-focus-card-note gc-focus-card-note--muted">Ordered from first submitted to last.</p>`;
    }

    function openSubmissionsModal() {
        const w = state.selectedWork;
        if (!w) return;
        const title = w.type === 'quiz' ? 'Quiz submissions' : 'Activity submissions';
        openGcModal({ title, bodyHtml: buildSubmissionsModalBody(w), wide: true });
    }

    function openViewersModal() {
        if (!state.detailViewers) return;
        openGcModal({
            title: 'Who viewed this',
            bodyHtml: renderViewersPanel(state.detailViewers),
            wide: true,
        });
    }

    async function postComment(text, isPrivate = false) {
        const payload = {
            subject_id: parseInt(subjectId, 10),
            content: text,
            is_private: isPrivate,
        };
        if (state.selectedWork) {
            if (state.selectedWork.type === 'lesson') payload.lessons_id = state.selectedWork.id;
            if (state.selectedWork.type === 'quiz') payload.quiz_id = state.selectedWork.id;
        }
        if (isPrivate && state.privateReplyTo?.comment_id) {
            payload.parent_comment_id = state.privateReplyTo.comment_id;
        }

        const res = await Api.post('/ClassroomAPI.php?action=add-comment', payload);
        if (!res.success) {
            alert(res.message || 'Failed to post comment');
            return;
        }

        if (isPrivate) {
            state.privateComments.push(res.data);
            state.privateReplyTo = null;
            refreshRail();
        } else {
            state.workComments.push(res.data);
            refreshBody();
        }
    }

    function showPersonModal(person) {
        container.querySelector('.sc-person-overlay')?.remove();
        const ini = person.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
        const overlay = document.createElement('div');
        overlay.className = 'sc-person-overlay';
        overlay.innerHTML = `
            <div class="sc-person-modal">
                <button type="button" class="sc-person-close" aria-label="Close">&times;</button>
                <div class="sc-person-modal-av">${esc(ini)}</div>
                <h3 class="sc-person-modal-name">${esc(person.name)}</h3>
                <p class="sc-person-modal-role">${esc(person.studentId || 'Student')}</p>
                <div class="sc-person-modal-actions">
                    <button type="button" class="sc-rail-btn primary sc-person-msg-btn"><span>${icon('messages', { size: 16 })}</span> Send Message</button>
                    <button type="button" class="sc-rail-btn outline sc-person-close-btn">Cancel</button>
                </div>
            </div>
        `;
        overlay.querySelector('.sc-person-msg-btn').addEventListener('click', () => {
            overlay.remove();
            openFloatingChat(person.id, person.name, 'student');
        });
        overlay.querySelector('.sc-person-close').addEventListener('click', () => overlay.remove());
        overlay.querySelector('.sc-person-close-btn').addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
        container.appendChild(overlay);
    }

    function bindCommentEvents() {
        container.querySelector('#sc-work-post')?.addEventListener('click', () => {
            const text = container.querySelector('#sc-work-input')?.value?.trim();
            if (text) postComment(text, false);
        });
    }

    function bindCwKebabMenus() {
        container.querySelectorAll('.gc-cw-kebab').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const menu = btn.nextElementSibling;
                const wasOpen = menu?.classList.contains('open');
                container.querySelectorAll('.gc-cw-kebab-menu.open').forEach((m) => m.classList.remove('open'));
                if (!wasOpen) menu?.classList.add('open');
            });
        });

        container.querySelectorAll('[data-cw-action]').forEach((btn) => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                container.querySelectorAll('.gc-cw-kebab-menu.open').forEach((m) => m.classList.remove('open'));

                const action = btn.dataset.cwAction;
                const type = btn.dataset.cwType;
                const id = btn.dataset.cwId;
                const name = btn.dataset.cwName || '';

                if (action === 'status') {
                    const status = btn.dataset.cwStatus;
                    const url = type === 'quiz'
                        ? '/QuizzesAPI.php?action=set-status'
                        : '/LessonsAPI.php?action=set-status';
                    const body = type === 'quiz'
                        ? { quiz_id: parseInt(id, 10), status }
                        : { lessons_id: parseInt(id, 10), status };
                    const res = await Api.post(url, body);
                    if (!res.success) {
                        alert(res.message || 'Could not update status');
                        return;
                    }
                    await render(container, { subject_id: subjectId, section_id: effectiveSectionId });
                    return;
                }

                if (action === 'questions') {
                    window.location.hash = `#instructor/quiz-questions?quiz_id=${id}`;
                    return;
                }

                if (action === 'delete') {
                    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
                    const url = type === 'quiz'
                        ? '/QuizzesAPI.php?action=delete'
                        : '/LessonsAPI.php?action=delete';
                    const body = type === 'quiz'
                        ? { quiz_id: parseInt(id, 10) }
                        : { lessons_id: parseInt(id, 10) };
                    const res = await Api.post(url, body);
                    if (!res.success) {
                        alert(res.message || 'Could not delete');
                        return;
                    }
                    if (state.selectedWork && String(state.selectedWork.id) === String(id)) {
                        state.selectedWork = null;
                        state.quizScores = [];
                    }
                    await render(container, { subject_id: subjectId, section_id: effectiveSectionId });
                }
            });
        });
    }

    function subjectSections() {
        return subjectFromApi?.sections || (activeSection ? [activeSection] : []);
    }

    function openQuizPicker() {
        const apiSubject = subjectFromApi || {
            subject_id: subject.subject_id,
            subject_code: subject.subject_code,
            subject_name: subject.subject_name,
            sections: subjectSections(),
        };
        openQuizCreatePicker({
            presetSubjectId: subjectId,
            presetSectionId: effectiveSectionId || null,
            lockSubject: true,
            classesData: [apiSubject],
            backTarget: 'subject',
            onSuccess: (quizId) => {
                render(container, { subject_id: subjectId, section_id: effectiveSectionId });
                if (quizId) window.location.hash = `#instructor/quiz-questions?quiz_id=${quizId}`;
            },
        });
    }

    function bindBodyEvents() {
        container.querySelectorAll('[data-copy-code]').forEach(btn => {
            btn.addEventListener('click', () => {
                const code = btn.dataset.copyCode || '';
                if (!code) return;
                navigator.clipboard.writeText(code).then(() => {
                    const orig = btn.textContent;
                    if (btn.classList.contains('sc-class-code-value')) {
                        btn.classList.add('copied');
                        setTimeout(() => btn.classList.remove('copied'), 1500);
                    } else {
                        btn.innerHTML = `${icon('check', { size: 14, className: 'ui-icon-inline' })} Copied!`;
                        setTimeout(() => {
                            btn.innerHTML = `${icon('copy', { size: 14, className: 'ui-icon-inline' })} Copy code`;
                        }, 1500);
                    }
                }).catch(() => alert('Subject code: ' + code));
            });
        });

        container.querySelector('#sc-section-pick')?.addEventListener('change', (e) => {
            const sid = e.target.value;
            if (!sid || String(sid) === String(effectiveSectionId)) return;
            const hashBase = window.location.hash.split('?')[0] || '#instructor/subject';
            const nextParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
            nextParams.set('subject_id', String(subjectId));
            nextParams.set('section_id', String(sid));
            if (state.tab && state.tab !== 'classwork') nextParams.set('tab', state.tab);
            window.location.hash = `${hashBase}?${nextParams.toString()}`;
        });

        const qrEl = container.querySelector('#sc-class-qr[data-qr-url]');
        if (qrEl?.dataset.qrUrl) {
            renderQrInto(qrEl, qrEl.dataset.qrUrl, 160).catch(() => {});
        }

        container.querySelectorAll('.gc-post-card__btn[data-work]').forEach(btn => {
            btn.addEventListener('click', () => openWork(btn.dataset.work, btn.dataset.id));
        });

        bindCwKebabMenus();

        container.querySelectorAll('.gc-viewers-toggle').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const key = btn.dataset.viewersKey;
                if (!key) return;
                const [contentType, contentId] = key.split(':');
                const data = state.expandedViewers[key] || await loadContentViews(contentType, contentId);
                state.expandedViewers[key] = data;
                openGcModal({
                    title: 'Who viewed this',
                    bodyHtml: renderViewersPanel(data),
                    wide: true,
                });
            });
        });

        container.querySelector('#sc-back-cw')?.addEventListener('click', () => {
            state.selectedWork = null;
            state.workComments = [];
            state.privateComments = [];
            state.privateReplyTo = null;
            state.workMaterials = [];
            state.studentSubmissions = [];
            state.detailViewers = null;
            state.quizScores = [];
            refreshBody();
        });

        container.querySelector('#gc-open-submissions')?.addEventListener('click', openSubmissionsModal);
        container.querySelector('#gc-open-viewers')?.addEventListener('click', openViewersModal);

        container.querySelector('#gc-save-due')?.addEventListener('click', async () => {
            const w = state.selectedWork;
            if (!w) return;
            const dueInput = container.querySelector('#gc-instructor-due');
            const dueDate = dueInput?.value || '';
            const payload = {
                subject_id: parseInt(subjectId, 10),
                due_date: dueDate || null,
            };
            if (w.type === 'lesson') payload.lessons_id = w.id;
            else payload.quiz_id = w.id;

            const btn = container.querySelector('#gc-save-due');
            if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
            const res = await Api.post('/ClassroomAPI.php?action=set-due-date', payload);
            if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
            if (!res.success) {
                alert(res.message || 'Could not update due date');
                return;
            }
            w.data.due_date = res.due_date || null;
            const list = w.type === 'lesson' ? lessons : quizzes;
            const item = list.find(x => String(w.type === 'lesson' ? x.lessons_id : x.quiz_id) === String(w.id));
            if (item) item.due_date = res.due_date || null;
            refreshBody();
        });

        bindCommentEvents();

        container.querySelector('#sc-cal-prev')?.addEventListener('click', () => {
            state.calMonth -= 1;
            if (state.calMonth < 0) { state.calMonth = 11; state.calYear -= 1; }
            refreshBody();
        });
        container.querySelector('#sc-cal-next')?.addEventListener('click', () => {
            state.calMonth += 1;
            if (state.calMonth > 11) { state.calMonth = 0; state.calYear += 1; }
            refreshBody();
        });
        container.querySelector('#sc-cal-today')?.addEventListener('click', () => {
            const t = new Date();
            state.calYear = t.getFullYear();
            state.calMonth = t.getMonth();
            state.calSelectedDay = dateKey(t);
            refreshBody();
        });
        container.querySelector('#sc-cal-clear')?.addEventListener('click', () => {
            state.calSelectedDay = null;
            refreshBody();
        });
        container.querySelectorAll('[data-cal-day]').forEach(btn => {
            btn.addEventListener('click', () => {
                state.calSelectedDay = btn.dataset.calDay;
                refreshBody();
            });
        });
        container.querySelectorAll('[data-cal-open]').forEach(el => {
            el.addEventListener('click', () => {
                state.tab = 'classwork';
                openWork(el.dataset.calOpen, el.dataset.calId);
            });
        });

        container.querySelectorAll('[data-person-id]').forEach(el => {
            el.addEventListener('click', () => {
                const student = students.find(s => String(s.users_id) === String(el.dataset.personId));
                if (!student) return;
                const name = (student.full_name || `${student.first_name || ''} ${student.last_name || ''}`).trim() || 'Student';
                showPersonModal({
                    id: student.users_id,
                    name,
                    role: 'student',
                    studentId: student.student_id || '',
                });
            });
        });

        bindMaterialAttachments(container);
    }

    function bindShellEvents() {
        if (container._scInstructorClick) {
            container.removeEventListener('click', container._scInstructorClick);
        }

        container._scInstructorClick = (e) => {
            if (!e.target.closest('.gc-cw-kebab-wrap')) {
                container.querySelectorAll('.gc-cw-kebab-menu.open').forEach((m) => m.classList.remove('open'));
            }

            const tab = e.target.closest('.sc-tab');
            const gotoTab = e.target.closest('[data-goto-tab]');
            const nextTab = tab?.dataset?.tab || gotoTab?.dataset?.gotoTab;
            if (nextTab && (tab || gotoTab) && container.contains(tab || gotoTab)) {
                if (state.tab === nextTab && !state.selectedWork) return;
                state.tab = nextTab;
                state.selectedWork = null;
                state.workComments = [];
                state.privateComments = [];
                state.workMaterials = [];
                state.studentSubmissions = [];
                if (nextTab === 'calendar') state.calSelectedDay = null;
                refreshBody();
                return;
            }

            const videoBtn = e.target.closest('#sc-join-video');
            if (videoBtn) {
                openOnlineClass({
                    room: videoBtn.dataset.room,
                    subjectId: subject.subject_id,
                    subjectName: subject.subject_name,
                    subjectCode: subject.subject_code,
                    user: me,
                });
                return;
            }

        };

        container.addEventListener('click', container._scInstructorClick);
    }

    renderShell();

    container.style.background = '#fff';
    const pageContent = container.closest('.page-content');
    if (pageContent) pageContent.style.background = '#fff';
}

function instructorExtraCss() {
    return `
        .sc-instructor-class .sc-main { position:relative; z-index:2; min-width:0; }
        .sc-instructor-class .sc-panel { position:relative; z-index:2; }
        .sc-instructor-class .sc-tabs {
            position:relative; z-index:5; background:#FAFAFA;
            flex-shrink:0;
        }
        .sc-instructor-class .sc-tab {
            cursor:pointer; position:relative; z-index:6;
            -webkit-tap-highlight-color:transparent;
        }
        .sc-instructor-class .sc-body { position:relative; z-index:1; }
        .sc-cw-head {
            display:flex; align-items:center; justify-content:space-between;
            margin-bottom:14px; padding-bottom:12px; border-bottom:1px solid #E5E7EB;
        }
        .sc-cw-head .sc-cw-title { font-size:15px; font-weight:700; color:#111827; margin:0; }
        .sc-cw-head .sc-cw-count { font-size:12px; font-weight:600; color:#00461B; background:#E8F5EC; padding:4px 10px; border-radius:20px; }
        .sc-instructor-class .gc-cw-list { margin-top:0; }
        .sc-instructor-class .gc-cw-row { width:100%; box-sizing:border-box; }
        .sc-instructor-class .gc-cw-right {
            flex-direction:row; align-items:center; gap:8px;
            flex-wrap:wrap; justify-content:flex-end;
        }
        .sc-rail-stack { display:flex; flex-direction:column; gap:10px; }
        .sc-action-row { display:flex; flex-wrap:wrap; gap:10px; }
        .sc-open-btn { border:none; cursor:pointer; font-family:inherit; }
        .sc-rail-btn { font-family:inherit; }
        button.sc-rail-btn { appearance:none; }
        .sc-open-btn.secondary { background:#111827; }
        .sc-open-btn.secondary:hover { background:#374151; }
        .sc-detail-title { font-weight:700; }
        .sc-ann-actions { display:flex; justify-content:flex-end; margin-bottom:12px; }
        .sc-ann-target { font-size:11px; font-weight:600; color:#00461B; background:#E8F5EC; display:inline-block; padding:3px 8px; border-radius:6px; margin:4px 0 8px; }
        .sc-person-info { min-width:0; }
        .sc-mate.sc-mate-click {
            display:flex; align-items:center; gap:12px;
            width:100%; cursor:pointer;
        }
        .gc-cw-status:not(.done) { color:#B45309; background:#FEF3C7; padding:2px 8px; border-radius:10px; font-size:11px; }
        .gc-cw-status.done { color:#137333; }
        .sc-cw-layout {
            display:grid; grid-template-columns:220px 1fr; gap:24px; align-items:start;
        }
        .sc-cw-aside { position:sticky; top:16px; }
        .sc-class-code-card {
            background:#fff; border:1px solid #DADCE0; border-radius:12px;
            padding:18px 16px; text-align:center;
        }
        .sc-class-code-card--empty { padding:20px 16px; }
        .sc-class-code-icon {
            width:52px; height:52px; margin:0 auto 12px; border-radius:50%;
            background:#E8F5EC; color:#00461B;
            display:flex; align-items:center; justify-content:center;
        }
        .sc-class-code-title {
            font-size:14px; font-weight:700; color:#202124; margin:0 0 6px;
        }
        .sc-class-code-section {
            font-size:12px; font-weight:600; color:#00461B; margin:0 0 6px;
        }
        .sc-class-code-pick-label {
            display:block; font-size:11px; font-weight:600; color:#5F6368;
            margin:0 0 4px; text-align:left;
        }
        .sc-class-code-section-pick {
            width:100%; margin:0 0 8px; padding:8px 10px;
            border:1px solid #DADCE0; border-radius:8px;
            font-size:13px; font-weight:600; color:#00461B;
            background:#F8FDF9; font-family:inherit;
        }
        .sc-class-code-hint {
            font-size:12px; color:#5F6368; line-height:1.45; margin:0 0 14px;
        }
        .sc-class-code-card--empty .sc-class-code-hint { margin-bottom:0; }
        .sc-class-qr-wrap {
            display:flex; justify-content:center; margin-bottom:14px;
            padding:8px; background:#FAFAFA; border-radius:10px;
        }
        .sc-class-qr-wrap canvas,
        .sc-class-qr-wrap img.enr-qr-canvas { display:block; border-radius:6px; }
        .sc-class-code-value {
            display:block; width:100%; font-family:ui-monospace, monospace;
            font-size:20px; font-weight:800; letter-spacing:2px;
            color:#00461B; background:#E8F5EC; border:2px dashed #A7D4B5;
            border-radius:10px; padding:10px 8px; cursor:pointer;
            margin-bottom:10px; transition:background .15s;
        }
        .sc-class-code-value:hover, .sc-class-code-value.copied { background:#D1FAE5; }
        .sc-class-code-copy {
            width:100%; padding:9px 12px; border-radius:8px;
            border:1px solid #DADCE0; background:#fff;
            font-size:13px; font-weight:600; color:#202124;
            cursor:pointer; font-family:inherit;
            display:inline-flex; align-items:center; justify-content:center; gap:6px;
        }
        .sc-class-code-copy:hover { background:#F8F9FA; border-color:#00461B; color:#00461B; }
        .sc-class-code-foot {
            font-size:10px; color:#9AA0A6; margin:12px 0 0; font-style:italic;
        }
        .sc-cw-feed { min-width:0; }
        .gc-cw-card-author--detail {
            display:flex; align-items:center; gap:12px;
            padding:0 0 8px;
        }
        .gc-cw-card-author--detail .sc-avatar { width:40px; height:40px; font-size:14px; }
        .gc-cw-author-text { display:flex; flex-direction:column; gap:2px; min-width:0; }
        .gc-cw-author-name { font-size:14px; font-weight:600; color:#202124; }
        .gc-cw-posted-time { font-size:12px; color:#5F6368; }
        .sc-empty--inline { padding:40px 20px; }
        .gc-cw-submissions {
            font-size:12px; font-weight:500; color:#137333;
            background:#E6F4EA; padding:2px 8px; border-radius:10px;
        }
        .gc-unified-work-card {
            display:flex; flex-direction:column; gap:16px;
        }
        .gc-work-count {
            font-size:12px; font-weight:600; color:#5F6368;
            background:#F1F3F4; padding:4px 10px; border-radius:12px;
        }
        .gc-student-submissions-list {
            display:flex; flex-direction:column; gap:14px;
        }
        .gc-student-submission {
            border:1px solid #E8EAED; border-radius:10px; padding:12px 14px;
            background:#FAFAFA;
        }
        .gc-student-submission-hdr {
            display:flex; align-items:center; gap:10px; margin-bottom:10px;
        }
        .gc-submission-order {
            font-size:11px; font-weight:700; color:#5F6368;
            background:#E8EAED; width:24px; height:24px; border-radius:50%;
            display:flex; align-items:center; justify-content:center; flex-shrink:0;
        }
        .gc-student-submission-meta {
            display:flex; flex-direction:column; gap:2px; min-width:0;
        }
        .gc-student-submission-name { font-size:14px; font-weight:600; color:#202124; }
        .gc-student-submission-id { font-size:11px; color:#5F6368; font-family:monospace; }
        .gc-student-submission-time { font-size:12px; color:#5F6368; display:flex; align-items:center; gap:4px; }
        .gc-student-submission-files {
            display:flex; flex-direction:column; gap:8px; padding-left:34px;
        }
        .gc-work-attach {
            display:flex; align-items:center; gap:10px; padding:8px 10px;
            border:1px solid #DADCE0; border-radius:8px; background:#fff;
            text-decoration:none; color:#202124;
        }
        .gc-work-attach:hover { border-color:#00461B; background:#F8FDF9; }
        .gc-work-attach-name { font-size:13px; font-weight:500; }
        .gc-tile-ext { font-size:10px; color:#5F6368; margin-top:2px; }

        .sc-calendar { display:flex; flex-direction:column; gap:24px; }
        .sc-cal-header {
            display:flex; flex-wrap:wrap; align-items:flex-start; justify-content:space-between; gap:16px;
        }
        .sc-cal-title { font-size:20px; font-weight:800; color:#202124; margin:0 0 4px; }
        .sc-cal-sub { font-size:13px; color:#5F6368; margin:0; }
        .sc-cal-nav { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
        .sc-cal-nav-btn {
            width:36px; height:36px; border:1px solid #DADCE0; border-radius:8px;
            background:#fff; font-size:20px; cursor:pointer; color:#202124; line-height:1;
        }
        .sc-cal-nav-btn:hover { background:#F8FDF9; border-color:#00461B; color:#00461B; }
        .sc-cal-month { font-size:15px; font-weight:700; color:#202124; min-width:140px; text-align:center; }
        .sc-cal-today-btn {
            padding:8px 14px; border-radius:8px; border:1px solid #DADCE0;
            background:#fff; font-size:12px; font-weight:600; cursor:pointer; font-family:inherit;
        }
        .sc-cal-today-btn:hover { border-color:#00461B; color:#00461B; }
        .sc-cal-grid-wrap {
            border:1px solid #DADCE0; border-radius:12px; overflow:hidden; background:#fff;
        }
        .sc-cal-weekdays {
            display:grid; grid-template-columns:repeat(7,1fr);
            background:#FAFAFA; border-bottom:1px solid #E8EAED;
            font-size:11px; font-weight:700; color:#5F6368; text-transform:uppercase;
        }
        .sc-cal-weekdays span { padding:10px 4px; text-align:center; }
        .sc-cal-grid { display:grid; grid-template-columns:repeat(7,1fr); }
        .sc-cal-cell {
            min-height:72px; padding:8px 6px; border:none; border-right:1px solid #F0F0F0;
            border-bottom:1px solid #F0F0F0; background:#fff; cursor:pointer;
            display:flex; flex-direction:column; align-items:center; gap:4px; font-family:inherit;
        }
        .sc-cal-cell:nth-child(7n) { border-right:none; }
        .sc-cal-cell--empty { background:#FAFAFA; cursor:default; }
        .sc-cal-cell:hover:not(.sc-cal-cell--empty) { background:#F8FDF9; }
        .sc-cal-cell.today .sc-cal-day-num {
            background:#00461B; color:#fff; border-radius:50%;
            width:28px; height:28px; display:flex; align-items:center; justify-content:center;
        }
        .sc-cal-cell.selected { background:#E8F5EC; }
        .sc-cal-day-num { font-size:13px; font-weight:600; color:#202124; }
        .sc-cal-dots { display:flex; gap:3px; flex-wrap:wrap; justify-content:center; }
        .sc-cal-dot { width:6px; height:6px; border-radius:50%; display:block; }
        .sc-cal-dot--lesson { background:#00461B; }
        .sc-cal-dot--announcement { background:#1A73E8; }
        .sc-cal-dot--quiz-due { background:#D93025; }
        .sc-cal-dot--quiz-opens { background:#F9AB00; }
        .sc-cal-dot--quiz { background:#9334E6; }
        .sc-cal-lists { display:grid; grid-template-columns:1fr 1fr; gap:20px; }
        .sc-cal-list-section {
            border:1px solid #DADCE0; border-radius:12px; padding:16px; background:#fff;
        }
        .sc-cal-list-hdr {
            display:flex; align-items:center; justify-content:space-between;
            margin-bottom:12px; gap:8px;
        }
        .sc-cal-list-hdr h3 {
            font-size:14px; font-weight:700; color:#202124; margin:0;
            display:flex; align-items:center; gap:6px;
        }
        .sc-cal-count {
            font-size:11px; font-weight:700; color:#00461B;
            background:#E8F5EC; padding:2px 8px; border-radius:10px;
        }
        .sc-cal-clear-filter {
            border:none; background:none; font-size:12px; font-weight:600;
            color:#00461B; cursor:pointer; font-family:inherit;
        }
        .sc-cal-events { display:flex; flex-direction:column; gap:10px; max-height:420px; overflow-y:auto; }
        .sc-cal-event {
            display:flex; align-items:flex-start; gap:12px; padding:12px;
            border:1px solid #E8EAED; border-radius:10px; background:#FAFAFA;
        }
        .sc-cal-event--click { cursor:pointer; transition:background .12s, border-color .12s; }
        .sc-cal-event--click:hover { background:#F8FDF9; border-color:#00461B; }
        .sc-cal-event-icon {
            width:36px; height:36px; border-radius:50%; flex-shrink:0;
            display:flex; align-items:center; justify-content:center;
        }
        .sc-cal-event-icon--lesson { background:#E8F5EC; color:#00461B; }
        .sc-cal-event-icon--announcement { background:#E8F0FE; color:#1A73E8; }
        .sc-cal-event-icon--quiz-due { background:#FCE8E6; color:#D93025; }
        .sc-cal-event-icon--quiz-opens { background:#FEF7E0; color:#F9AB00; }
        .sc-cal-event-icon--quiz { background:#F3E8FD; color:#9334E6; }
        .sc-cal-event-body { flex:1; min-width:0; }
        .sc-cal-event-title { font-size:14px; font-weight:600; color:#202124; margin-bottom:2px; }
        .sc-cal-event-sub { font-size:12px; color:#5F6368; }
        .sc-cal-event-msg {
            font-size:12px; color:#3C4043; margin:8px 0 0; line-height:1.45;
            display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden;
        }
        .sc-cal-event-badge {
            font-size:10px; font-weight:700; text-transform:uppercase;
            padding:3px 8px; border-radius:10px; background:#E8EAED; color:#5F6368; flex-shrink:0;
        }
        .sc-cal-event-badge.urgent { background:#FCE8E6; color:#D93025; }
        .sc-cal-event-chevron { color:#9AA0A6; font-size:18px; flex-shrink:0; }
        .sc-cal-empty { font-size:13px; color:#9AA0A6; margin:0; font-style:italic; }

        @media (max-width:900px) {
            .sc-cal-lists { grid-template-columns:1fr; }
            .sc-cw-layout { grid-template-columns:1fr; }
            .sc-cw-aside { position:static; }
            .sc-class-code-card { display:grid; grid-template-columns:auto 1fr; gap:12px 16px; text-align:left; align-items:center; }
            .sc-class-code-card h3, .sc-class-code-card .sc-class-code-section,
            .sc-class-code-card .sc-class-code-hint, .sc-class-code-card .sc-class-code-foot { grid-column:2; }
            .sc-class-qr-wrap { grid-row:1 / span 4; margin:0; }
            .sc-class-code-value, .sc-class-code-copy { grid-column:1 / -1; }
        }
    `;
}
