/**
 * Instructor Subject Hub — Classwork, People, Calendar
 */
import { Api, BASE_URL } from '../../api.js';
import { Auth } from '../../auth.js';
import { subjectColor, subjectThemeVars, programPatternSvg } from '../../utils/subject-colors.js';
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
import { openQuizModal } from '../../components/quiz-modal.js';
import { mountClassComposer } from '../../components/class-composer.js';
import { mountInstructorGradebook } from './gradebook.js';
import { mountQuizIntegrityTab } from './subject-integrity.js';
import { buildStudentJoinUrlByEnrollmentCode, renderQrInto } from '../../utils/qr-utils.js';
import { notify } from '../../utils/notify.js';

const inl = { size: 14, className: 'ui-icon-inline' };

export async function render(container, params) {
    const hashParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
    const subjectId = params?.subject_id || hashParams.get('subject_id');
    const urlSectionId = params?.section_id || hashParams.get('section_id');
    const urlTab = params?.tab || hashParams.get('tab') || 'classwork';
    const validTabs = ['classwork', 'people', 'gradebook', 'integrity'];

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

    // `subjectFromClasses` (DashboardAPI's per-subject summary) reports
    // section_name/schedule/room as a GROUP_CONCAT of every section under
    // this subject — correct for a "My Classes" card that has no single
    // section selected, but wrong here once a specific section IS selected
    // (effectiveSectionId): without this override the breadcrumb and info
    // chips showed every section's code strung together instead of just
    // the one the user actually clicked into. activeSection is always the
    // one true source for a single selected section's own details.
    if (activeSection) {
        subject.section_name = activeSection.section_name || '';
        subject.schedule = activeSection.schedule || '';
        subject.room = activeSection.room || '';
        subject.student_count = activeSection.student_count ?? subject.student_count;
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
        ? allAnnouncements.filter(a =>
            a.all_sections ||
            (a.section_ids || []).includes(Number(effectiveSectionId)) ||
            (a.section_ids || []).map(String).includes(String(effectiveSectionId))
          )
        : allAnnouncements;
    console.debug('[Subject] ann API:', annRes.success, 'raw:', annRes.data?.length ?? 0, 'filtered by subject:', allAnnouncements.length, 'filtered by section ('+effectiveSectionId+'):', announcements.length);
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
        quizQuestionStats: [],
        expandedViewers: {},
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

    function submissionsBlock(workType, workId, count) {
        const label = count > 0 ? `${count} turned in` : 'No submissions yet';
        const btnLabel = workType === 'quiz' ? 'View & Grade Submissions' : 'View Submissions';
        return `
            <div class="gc-post-card__subs">
                <span class="gc-subs-count">${icon('users', { size: 13, className: 'ui-icon-inline' })} ${esc(label)}</span>
                <button type="button" class="gc-subs-btn" data-sub-type="${workType}" data-sub-id="${workId}">
                    ${icon('eye', { size: 13, className: 'ui-icon-inline' })} ${btnLabel}
                </button>
            </div>`;
    }

    async function openInlineSubmissions(workType, workId) {
        const btn = container.querySelector(`.gc-subs-btn[data-sub-type="${workType}"][data-sub-id="${workId}"]`);
        if (btn) { btn.disabled = true; btn.textContent = 'Loading…'; }
        try {
            let quizScores = [];
            let fileGroups = [];
            if (workType === 'quiz') {
                const [scoresRes, filesRes] = await Promise.all([
                    Api.get(`/QuizAttemptsAPI.php?action=quiz-scores&quiz_id=${workId}`),
                    Api.get(`/ClassroomAPI.php?action=submissions&subject_id=${subjectId}&quiz_id=${workId}&submitted_only=1`),
                ]);
                quizScores = scoresRes.success ? (scoresRes.data || []) : [];
                const files = filesRes.success ? (filesRes.data || []) : [];
                fileGroups = groupStudentSubmissions(files);
            } else {
                const filesRes = await Api.get(`/ClassroomAPI.php?action=submissions&subject_id=${subjectId}&lessons_id=${workId}&submitted_only=1`);
                const files = filesRes.success ? (filesRes.data || []) : [];
                fileGroups = groupStudentSubmissions(files);
            }

            const quizSection = workType === 'quiz' ? `
                <div class="gc-modal-section">
                    ${renderQuizScoresTable(quizScores)}
                </div>` : '';
            const fileSection = fileGroups.length ? `
                <div class="gc-modal-section">
                    <h3 class="gc-modal-section-title">${icon('document', inl)} File attachments</h3>
                    <div class="gc-student-submissions-list">
                        ${fileGroups.map((g, i) => renderStudentSubmissionRow(g, i)).join('')}
                    </div>
                </div>` : '';
            const body = (quizSection || fileSection)
                ? `${quizSection}${fileSection}<p class="gc-focus-card-note gc-focus-card-note--muted">Ordered from first submitted to last.</p>`
                : '<p class="gc-focus-card-empty">No students have turned in work yet.</p>';

            const title = workType === 'quiz' ? 'Quiz submissions' : 'Activity submissions';
            openGcModal({ title, bodyHtml: body, wide: true });

            setTimeout(() => {
                document.querySelectorAll('.gc-grade-btn').forEach(b => {
                    b.addEventListener('click', () => openGradingPanel(b.dataset.attempt));
                });
            }, 50);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = `${icon('eye', { size: 13, className: 'ui-icon-inline' })} ${workType === 'quiz' ? 'View & Grade Submissions' : 'View Submissions'}`;
            }
        }
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
        if (state.tab === 'gradebook') return '<div id="sc-gradebook-host"></div>';
        if (state.tab === 'integrity') return '<div id="sc-integrity-host"></div>';
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
            // Pass the section already selected on this page through, so the
            // Gradebook tab jumps straight to that section's class record
            // instead of showing the full pick-a-section list again — the
            // user already picked their section via the breadcrumb/card.
            if (host) mountInstructorGradebook(host, { subjectId, sectionId: effectiveSectionId });
        }

        if (state.tab === 'integrity' && !state.selectedWork) {
            const host = container.querySelector('#sc-integrity-host');
            if (host) mountQuizIntegrityTab(host, subjectId);
        }

        if (state.tab === 'classwork' && !state.selectedWork) {
            const composerMount = container.querySelector('#sc-composer-mount');
            if (composerMount) {
                const allSections = subjectFromApi?.sections || (activeSection ? [activeSection] : []);
                mountClassComposer(composerMount, {
                    subjectId,
                    subjectCode: subject.subject_code || '',
                    subjectName: subject.subject_name || '',
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
                <div class="sc-crumb">
                    <a href="#instructor/my-classes">My Classes</a>
                    ${effectiveSectionId ? `<span class="sc-crumb-sep">&rsaquo;</span><a href="#instructor/my-classes?subject_id=${subjectId}">${esc(subject.subject_name || '')}</a>` : ''}
                    <span class="sc-crumb-sep">&rsaquo;</span>
                    <span class="sc-crumb-current">${effectiveSectionId ? (subject.section_name ? esc(subject.section_name) : 'Section') : esc(subject.subject_name || '')}</span>
                </div>

                <header class="sc-hero" style="background:${color}">
                    ${programPatternSvg(subjectFromApi?.program_code || subject.program_code, subject.subject_id, { width: 900, height: 180, opacity: 0.13 })}
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
                </header>

                <div class="sc-layout ${state.selectedWork ? 'sc-layout--work-focus' : ''}" id="sc-layout">
                    <div class="sc-main">
                        <div class="sc-panel">
                            <nav class="sc-tabs" id="sc-tabs" role="tablist">
                                <button type="button" role="tab" class="sc-tab ${state.tab === 'classwork' ? 'active' : ''}" data-tab="classwork" aria-selected="${state.tab === 'classwork'}">Classwork</button>
                                <button type="button" role="tab" class="sc-tab ${state.tab === 'people' ? 'active' : ''}" data-tab="people" aria-selected="${state.tab === 'people'}">People</button>
                                <button type="button" role="tab" class="sc-tab ${state.tab === 'gradebook' ? 'active' : ''}" data-tab="gradebook" aria-selected="${state.tab === 'gradebook'}">Gradebook</button>
                                <button type="button" role="tab" class="sc-tab ${state.tab === 'integrity' ? 'active' : ''}" data-tab="integrity" aria-selected="${state.tab === 'integrity'}">Integrity</button>
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
        if (state.selectedWork) {
            bindPrivateRail();
            bindRailGradeButtons();
        }
    }

    function bindRailGradeButtons() {
        const rail = container.querySelector('#sc-rail-mount');
        if (!rail) return;
        rail.querySelectorAll('.gc-sub-grade-save').forEach(btn => {
            btn.addEventListener('click', () => gradeStudentSubmission(btn.dataset.studentId, btn));
        });
        rail.querySelectorAll('.gc-grade-btn').forEach(btn => {
            btn.addEventListener('click', () => openGradingPanel(btn.dataset.attempt));
        });
        rail.querySelector('#gc-open-due-modal')?.addEventListener('click', openDueDateModal);
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
            const w = state.selectedWork;
            const privatePanel = renderPrivateCommentsRail({
                comments: state.privateComments,
                userInitials: myInitials,
                hint: 'Replies are only visible to the student you respond to.',
                instructorMode: true,
                replyingTo: state.privateReplyTo,
                embedded: true,
            });

            if (w.type === 'announcement') {
                const viewersHtml = state.detailViewers
                    ? `<div class="sc-rail-card gc-sub-panel" style="overflow:hidden;">
                        <div class="gc-sub-panel-hdr">
                            <h3 class="gc-sub-panel-title">${icon('eye', { size: 14, className: 'ui-icon-inline' })} Viewed by <span class="gc-sub-panel-count">${state.detailViewers.view_count ?? (state.detailViewers.viewed?.length ?? 0)}</span></h3>
                        </div>
                        <div class="gc-sub-panel-body">${renderViewersPanel(state.detailViewers)}</div>
                       </div>`
                    : '';
                return `
                    <aside class="sc-rail sc-rail--work-focus">
                        <div class="sc-rail-focus-stack">
                            ${viewersHtml}
                            ${privatePanel}
                        </div>
                    </aside>`;
            }

            const subsPanel = renderDetailSubmissionsPanel(w);
            return `
                <aside class="sc-rail sc-rail--work-focus">
                    <div class="sc-rail-focus-stack">
                        <div class="sc-rail-card sc-rail-subs">${subsPanel}</div>
                        ${privatePanel}
                    </div>
                </aside>`;
        }

        return `
            <aside class="sc-rail" id="sc-rail">
                <div class="sc-rail-card sc-rail-video">
                    <div class="sc-rail-video-hdr">
                        <div class="sc-rail-icon">${icon('video', { size: 22 })}</div>
                        <h3 class="sc-rail-title">Online Class</h3>
                    </div>
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
                    points_earned: f.points_earned != null ? f.points_earned : null,
                    files: [],
                });
            }
            const g = map.get(key);
            g.files.push(f);
            if (f.submitted_at && (!g.submitted_at || f.submitted_at < g.submitted_at)) {
                g.submitted_at = f.submitted_at;
            }
            if (f.points_earned != null) g.points_earned = f.points_earned;
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

    function renderDetailSubmissionRow(group, index, totalPoints) {
        const submittedLbl = group.submitted_at ? formatPosted(group.submitted_at) : '';
        const ini = group.student_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
        const pointsEarned = group.points_earned != null ? group.points_earned : '';
        const filesHtml = group.files.map(f => {
            const name = f.original_name || f.file_name || 'File';
            const href = fileHref(f.file_path);
            return `<a class="gc-work-attach" href="${esc(href)}" target="_blank" rel="noopener">
                <span class="gc-work-attach-icon">${icon('document', { size: 16 })}</span>
                <span class="gc-work-attach-name gc-work-attach-text">${esc(name)}</span>
            </a>`;
        }).join('');

        return `
            <article class="gc-sub-row" data-student-id="${group.user_student_id}">
                <div class="gc-sub-row-hdr">
                    <div class="sc-avatar sm">${esc(ini)}</div>
                    <div class="gc-sub-row-meta">
                        <span class="gc-sub-row-name">${esc(group.student_name)}</span>
                        ${submittedLbl ? `<span class="gc-sub-row-time">${esc(submittedLbl)}</span>` : ''}
                    </div>
                    ${pointsEarned !== '' ? `<span class="gc-sub-row-grade-badge">${pointsEarned}${totalPoints != null ? '/' + totalPoints : ''} pts</span>` : ''}
                </div>
                ${filesHtml ? `<div class="gc-sub-row-files">${filesHtml}</div>` : ''}
                <div class="gc-sub-row-grade-row">
                    <input type="number" class="gc-sub-grade-input" min="0"
                        ${totalPoints != null ? `max="${totalPoints}"` : ''}
                        step="0.5" placeholder="${totalPoints != null ? `/ ${totalPoints} pts` : 'Points'}"
                        value="${esc(String(pointsEarned))}">
                    <button type="button" class="gc-sub-grade-save" data-student-id="${group.user_student_id}">Save Grade</button>
                </div>
            </article>`;
    }

    function renderDetailSubmissionsPanel(w) {
        const submissionGroups = groupStudentSubmissions(state.studentSubmissions || []);
        const quizRows = w.type === 'quiz' ? listQuizSubmissionsInOrder(state.quizScores) : [];
        const totalPoints = w.type === 'lesson'
            ? (w.data.total_points != null && w.data.total_points !== '' ? Number(w.data.total_points) : null)
            : null;

        const totalCount = w.type === 'quiz'
            ? quizRows.length + submissionGroups.length
            : submissionGroups.length;

        const lessonSubmissionsHtml = w.type === 'lesson'
            ? (submissionGroups.length === 0
                ? `<p class="gc-sub-panel-empty">No students have turned in work yet.</p>`
                : submissionGroups.map((g, i) => renderDetailSubmissionRow(g, i, totalPoints)).join(''))
            : '';

        const quizSubmissionsHtml = w.type === 'quiz' ? `
            <div class="gc-sub-panel-quiz">
                ${renderQuizScoresTable(state.quizScores)}
                ${submissionGroups.length ? `
                    <h4 class="gc-sub-panel-subtitle">${icon('document', inl)} File attachments</h4>
                    ${submissionGroups.map((g, i) => renderStudentSubmissionRow(g, i)).join('')}` : ''}
            </div>` : '';

        const showDueDate = w.type === 'quiz' || totalPoints != null;

        const dueRaw = w.data.due_date ? String(w.data.due_date).slice(0, 10) : '';
        const dueDisplay = (() => {
            if (!dueRaw) return null;
            const d = new Date(dueRaw + 'T00:00:00');
            if (isNaN(d)) return null;
            const late = d.getTime() < Date.now();
            return {
                label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
                late,
            };
        })();

        const calIcon = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;
        const dueBtnHtml = !showDueDate ? '' : dueDisplay
            ? `<button type="button" class="gc-sub-due-btn gc-sub-due-btn--set ${dueDisplay.late ? 'late' : ''}" id="gc-open-due-modal">
                   ${calIcon} ${dueDisplay.late ? 'Past due · ' : 'Due · '}${esc(dueDisplay.label)}
               </button>`
            : `<button type="button" class="gc-sub-due-btn" id="gc-open-due-modal">
                   ${calIcon} Set due date
               </button>`;

        return `
            <div class="gc-sub-panel">
                <div class="gc-sub-panel-hdr">
                    <h3 class="gc-sub-panel-title">${icon('users', { size: 16, className: 'ui-icon-inline' })} Student Submissions <span class="gc-sub-panel-count">${totalCount}</span></h3>
                    ${dueBtnHtml}
                </div>
                <div class="gc-sub-panel-body" id="gc-sub-panel-body">
                    ${lessonSubmissionsHtml}
                    ${quizSubmissionsHtml}
                </div>
            </div>`;
    }

    function renderClassCodeAside() {
        const sectionLabel = activeSection?.section_name || subject.section_name || '';
        const qrSectionId = effectiveSectionId || activeSection?.section_id || 0;
        const resolvedSection = qrSectionId
            ? availableSections.find(s => String(s.section_id) === String(qrSectionId))
            : null;
        const code = resolvedSection?.enrollment_code || activeSection?.enrollment_code || '';

        if (!code || !qrSectionId) {
        return `
                <aside class="sc-cw-aside" aria-label="Class code">
                    <div class="sc-class-code-card sc-class-code-card--empty">
                        <div class="sc-class-code-icon">${icon('school', { size: 28 })}</div>
                        <h3 class="sc-class-code-title">Class code</h3>
                        <p class="sc-class-code-hint">Create a section in <strong>My Classes</strong> to generate a QR code students can scan to join.</p>
                </div>
                </aside>`;
        }

        const joinUrl = buildStudentJoinUrlByEnrollmentCode(code);
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
            <aside class="sc-cw-aside" aria-label="Class code">
                <div class="sc-class-code-card">
                    <h3 class="sc-class-code-title">Class code</h3>
                    ${sectionPicker}
                    <p class="sc-class-code-hint">Students scan QR or enter this code to join this specific section</p>
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
            ...announcements.map(a => ({ type: 'announcement', id: a.announcement_id, data: a })),
        ].sort((a, b) => classworkPostedTime(b.data) - classworkPostedTime(a.data));
        console.debug('[Classwork] lessons:', lessons.length, 'quizzes:', quizzes.length, 'announcements:', announcements.length, 'total items:', items.length);

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
            ? `<button type="button" class="gc-cw-kebab-item" data-cw-action="edit" data-cw-type="quiz" data-cw-id="${id}">${icon('edit', inl)} Edit quiz</button>
               <button type="button" class="gc-cw-kebab-item" data-cw-action="questions" data-cw-type="quiz" data-cw-id="${id}">${icon('clipboard', inl)} Edit questions</button>`
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
            const earned = parseFloat(r.earned_points) || 0;
            const total = parseFloat(r.total_points) || 0;
            const completed = r.completed_at || '';
            const name = `${r.first_name || ''} ${r.last_name || ''}`.trim() || 'Student';
            if (!map.has(key)) {
                map.set(key, {
                    student_id: r.student_id || '',
                    name,
                    score: pct,
                    earned,
                    total,
                    attempts: 1,
                    passed: Number(r.passed) === 1,
                    first_completed: completed,
                    attempt_id: r.attempt_id,
                });
            } else {
                const g = map.get(key);
                g.attempts += 1;
                if (completed && (!g.first_completed || completed < g.first_completed)) {
                    g.first_completed = completed;
                    g.score = pct;
                    g.earned = earned;
                    g.total = total;
                    g.passed = Number(r.passed) === 1;
                    g.attempt_id = r.attempt_id;
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
                            <th>%</th>
                            <th>Attempts</th>
                            <th>Status</th>
                            <th>Turned in</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.map((s, i) => `
                            <tr>
                                <td class="td-rank">${i + 1}</td>
                                <td class="td-id">${esc(s.student_id || '—')}</td>
                                <td class="td-name">${esc(s.name)}</td>
                                <td class="td-num"><strong>${s.earned}/${s.total || '—'}</strong></td>
                                <td class="td-num">${s.score.toFixed(0)}%</td>
                                <td class="td-num">${s.attempts}</td>
                                <td class="td-pass">
                                    <span class="${s.passed ? 'gc-cur-badge-pass' : 'gc-cur-badge-fail'}">${s.passed ? 'Passed' : 'Failed'}</span>
                                </td>
                                <td class="td-num" style="font-weight:400;font-size:11px;color:#5F6368;">${esc(fmtDate(s.first_completed))}</td>
                                <td><button class="gc-grade-btn" data-attempt="${s.attempt_id}" style="padding:5px 12px;background:#00461B;color:#fff;border:none;border-radius:7px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;">Check / Grade</button></td>
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

    async function loadQuizQuestionStats(quizId) {
        const res = await Api.get(`/QuizAttemptsAPI.php?action=quiz-question-stats&quiz_id=${quizId}`);
        return res.success ? (res.data || []) : [];
    }

    function renderQuestionDifficultyPanel(stats) {
        const rows = (stats || []).filter(s => Number(s.responses) > 0);
        if (!rows.length) {
            return `<div class="gc-focus-card gc-focus-card--analysis">
                <h3 class="gc-focus-card-title">${icon('chart', inl)} Where students struggle</h3>
                <p class="gc-focus-card-note gc-focus-card-note--muted">No completed attempts yet — stats appear after students submit.</p>
            </div>`;
        }
        const top = rows.slice(0, 8);
        return `
            <div class="gc-focus-card gc-focus-card--analysis">
                <h3 class="gc-focus-card-title">${icon('chart', inl)} Where students struggle</h3>
                <p class="gc-focus-card-note gc-focus-card-note--muted">Questions ranked by how often students miss full points.</p>
                <div class="gc-qstats-list">
                    ${top.map((q, i) => {
                        const miss = Number(q.miss_count) || 0;
                        const resp = Number(q.responses) || 0;
                        const pct = resp > 0 ? Math.round((miss / resp) * 100) : 0;
                        const preview = String(q.question_text || '').replace(/<[^>]+>/g, '').slice(0, 120);
                        return `
                            <div class="gc-qstat-row">
                                <div class="gc-qstat-rank">${i + 1}</div>
                                <div class="gc-qstat-body">
                                    <div class="gc-qstat-text">${esc(preview)}${preview.length >= 120 ? '…' : ''}</div>
                                    <div class="gc-qstat-meta">${esc(q.question_type || 'question')} · ${q.max_points || 0} pts · avg ${q.avg_earned ?? 0}/${q.max_points || 0}</div>
                    </div>
                                <div class="gc-qstat-bar-wrap">
                                    <div class="gc-qstat-bar" style="width:${pct}%"></div>
                                    <span class="gc-qstat-pct">${miss}/${resp} missed</span>
                </div>
                            </div>`;
                    }).join('')}
                </div>
            </div>`;
    }

    function renderAnnAttachments(atts) {
        if (!atts || !atts.length) return '';
        return `<div class="gc-material-list" onclick="event.stopPropagation()">${atts.map(renderMaterialAttachment).join('')}</div>`;
    }

    function classworkRow(item) {
        const d = item.data;
        const posted = formatPosted(d.created_at || d.updated_at);

        if (item.type === 'announcement') {
            const title = d.title || 'Announcement';
            const rawContent = (d.content || '').replace(/<[^>]+>/g, '');
            const preview = rawContent.length > 200 ? rawContent.slice(0, 200) + '…' : rawContent;
            const sectionLabel = d.section_names
                ? `To: ${d.section_names}`
                : (d.all_sections !== false ? 'All sections' : '');
            return `
                <article class="gc-post-card gc-post-card--ann gc-post-card--ann-click" data-ann-id="${d.announcement_id}" style="cursor:pointer;">
                    <div class="gc-post-card__row">
                        <div class="gc-post-card__ann-body">
                            <header class="gc-post-card__hdr">
                                <div class="sc-avatar sm teacher-av">${esc(myInitials)}</div>
                                <div class="gc-cw-author-text">
                                    <span class="gc-cw-author-name">${esc(myName)}</span>
                                    ${posted ? `<span class="gc-cw-posted-time">${esc(posted)}</span>` : ''}
                                </div>
                                <span class="gc-ann-badge">${icon('announce', { size: 13, className: 'ui-icon-inline' })} Announcement</span>
                            </header>
                            <div class="gc-ann-content">
                                <div class="gc-ann-title">${esc(title)}</div>
                                ${preview ? `<p class="gc-ann-preview">${esc(preview)}</p>` : ''}
                                ${renderAnnAttachments(d.attachments)}
                                ${sectionLabel ? `<div class="gc-ann-section">${esc(sectionLabel)}</div>` : ''}
                            </div>
                        </div>
                        <div class="gc-cw-kebab-wrap">
                            <button type="button" class="gc-cw-kebab" title="Actions" aria-label="More actions">${icon('menu', { size: 18 })}</button>
                            <div class="gc-cw-kebab-menu">
                                <button type="button" class="gc-cw-kebab-item danger" data-cw-action="delete" data-cw-type="announcement" data-cw-id="${d.announcement_id}" data-cw-name="${esc(title)}">${icon('trash', inl)} Delete</button>
                            </div>
                        </div>
                    </div>
                    ${viewersBlock('announcement', d.announcement_id)}
                </article>`;
        }

        if (item.type === 'lesson') {
            const status = String(d.status || 'draft').toLowerCase();
            const published = status === 'published';
            const submitCount = d.completions != null ? Number(d.completions) : 0;
            const title = d.lesson_title || d.title || 'Untitled lesson';
            const lessonPts = d.total_points != null && d.total_points !== '' ? Number(d.total_points) : null;
            const right = `
                ${submitCount > 0 ? `<span class="gc-cw-submissions">${submitCount} turned in</span>` : ''}
                ${lessonPts != null ? `<span class="gc-cw-points">${lessonPts} pts</span>` : ''}
                <span class="gc-cw-status ${published ? 'done' : ''}">${published ? 'Published' : 'Draft'}</span>`;
            const lessonDue = formatDue(d.due_date);
            return renderClassworkPostCard({
                authorName: myName,
                authorInitials: myInitials,
                posted,
                iconName: 'document',
                title,
                typeLabel: lessonPts != null ? `Activity · ${lessonPts} pts` : 'Activity',
                rightHtml: right,
                workType: 'lesson',
                workId: d.lessons_id,
                viewsFooter: published ? viewersBlock('lesson', d.lessons_id) + submissionsBlock('lesson', d.lessons_id, submitCount) : '',
                menuHtml: renderCwKebabMenu('lesson', d.lessons_id, published, title),
                dueLabel: lessonDue?.label || '',
                dueLate:  lessonDue?.late  || false,
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
        const quizDue = formatDue(d.due_date);
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
            viewsFooter: published ? viewersBlock('quiz', d.quiz_id) + submissionsBlock('quiz', d.quiz_id, attemptCount) : '',
            menuHtml: renderCwKebabMenu('quiz', d.quiz_id, published, title),
            dueLabel: quizDue?.label || '',
            dueLate:  quizDue?.late  || false,
        });
    }

    function renderAnnouncementDetail() {
        const w = state.selectedWork;
        const d = w.data;
        const posted = formatPosted(d.created_at || d.updated_at);
        const sectionLabel = d.section_names ? `To: ${d.section_names}` : (d.all_sections !== false ? 'All sections' : '');

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
                        <div class="gc-assign-icon">${icon('announce', { size: 28 })}</div>
                        <div class="gc-assign-head-text">
                            <h1 class="gc-detail-title">${esc(d.title || 'Announcement')}</h1>
                            <p class="gc-detail-type">Announcement${sectionLabel ? ` · ${sectionLabel}` : ''}</p>
                        </div>
                    </div>
                    <div class="gc-ann-full-body">${esc(d.content || '')}</div>
                    ${renderAnnAttachments(d.attachments)}
                    <section class="gc-focus-card gc-focus-card--comments">
                        <h3 class="gc-focus-card-title">${icon('messages', inl)} Class comments</h3>
                        ${commentSection()}
                    </section>
                </div>
            </div>`;
    }

    function renderWorkDetail() {
        const w = state.selectedWork;
        if (!w) return '';
        if (w.type === 'announcement') return renderAnnouncementDetail();

        const posted = formatPosted(w.data.created_at || w.data.updated_at);
        const title = w.type === 'lesson'
            ? (w.data.lesson_title || w.data.title || 'Untitled lesson')
            : (w.data.quiz_title || 'Untitled quiz');
        const detailLessonPts = w.type === 'lesson' && w.data.total_points != null && w.data.total_points !== ''
            ? Number(w.data.total_points) : null;
        const typeLabel = w.type === 'lesson'
            ? (detailLessonPts != null ? `Activity · ${detailLessonPts} pts` : 'Activity')
            : 'Quiz assignment';
        const description = w.type === 'lesson'
            ? (w.data.lesson_description || w.data.description || '')
            : (w.data.quiz_description || '');

        const materials = state.workMaterials || [];
        const materialsBlock = materials.length ? `
            <div class="gc-focus-card gc-focus-card--materials">
                <h3 class="gc-focus-card-title">Attached files</h3>
                <div class="gc-material-list">${materials.map(renderMaterialAttachment).join('')}</div>
            </div>` : '';

        const quizMeta = w.type === 'quiz' ? `
            <p class="gc-instructions-extra">
                ${w.data.question_count || 0} questions ·
                ${w.data.time_limit ? `${w.data.time_limit} min` : 'No time limit'} ·
                Pass ${w.data.passing_rate || 0}% ·
                ${(w.data.max_attempts || 0) > 0 ? `${w.data.max_attempts} attempt${w.data.max_attempts !== 1 ? 's' : ''}` : 'Unlimited attempts'}
            </p>` : '';

        const due = w.data.due_date ? (() => {
            const ts = new Date(String(w.data.due_date).replace(' ', 'T')).getTime();
            if (isNaN(ts)) return null;
            const late = ts < Date.now();
            return { label: new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }), late };
        })() : null;

        const aiCheckerRow = w.type === 'quiz' ? `
            <div class="gc-detail-action-row">
                <button type="button" class="gc-detail-action-btn gc-detail-action-btn--ai" id="gc-run-ai-checker">${icon('robot', inl)} AI Checker</button>
            </div>` : '';

        const viewersSection = state.detailViewers ? `
            <div class="gc-detail-viewers-row">
                <button type="button" class="gc-detail-action-btn" id="gc-open-viewers">${icon('eye', inl)} Who viewed this (${state.detailViewers.view_count ?? state.detailViewers.viewed?.length ?? 0})</button>
            </div>` : '';

        const pointsEl = detailLessonPts != null
            ? `${detailLessonPts} pts`
            : (w.type === 'quiz' && w.data.total_points != null ? `${Number(w.data.total_points)} pts` : null);

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
                            <p class="gc-detail-type">${pointsEl ? `${typeLabel} · <strong>${pointsEl}</strong>` : typeLabel}</p>
                        </div>
                    </div>

                    ${aiCheckerRow}
                    ${description ? `<div class="gc-instructions-body">${esc(description)}</div>` : ''}
                    ${quizMeta}
                    ${w.type === 'quiz' ? renderQuestionDifficultyPanel(state.quizQuestionStats) : ''}
                    ${materialsBlock}

                    ${viewersSection}
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
        const [, , viewers, scores, qStats] = await Promise.all([
            loadWorkComments(null, id),
            loadStudentSubmissions(null, id),
            loadContentViews('quiz', id),
            loadQuizScores(id),
            loadQuizQuestionStats(id),
        ]);
        state.detailViewers = viewers;
        state.quizScores = scores;
        state.quizQuestionStats = qStats;
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

    async function openAnnouncement(annId) {
        const d = announcements.find(a => String(a.announcement_id) === String(annId));
        if (!d) return;
        state.tab = 'classwork';
        state.selectedWork = { type: 'announcement', id: annId, data: d };
        state.workComments = [];
        state.privateComments = [];
        state.privateReplyTo = null;
        state.detailViewers = null;
        const body = container.querySelector('#sc-body');
        if (body) {
            body.className = 'sc-body sc-body-focus';
            body.innerHTML = '<div class="sc-loading"><div class="sc-spin"></div></div>';
        }
        const [, viewers] = await Promise.all([
            loadWorkComments(null, null),
            loadContentViews('announcement', annId),
        ]);
        state.detailViewers = viewers;
        refreshBody();
    }

    async function gradeStudentSubmission(studentId, btn) {
        const w = state.selectedWork;
        if (!w || w.type !== 'lesson') return;
        const row = btn.closest('[data-student-id]');
        const input = row?.querySelector('.gc-sub-grade-input');
        if (!input) return;
        const pts = input.value === '' ? null : parseFloat(input.value);
        btn.disabled = true;
        btn.textContent = 'Saving…';
        try {
            const res = await Api.post('/ClassroomAPI.php?action=grade-submission', {
                subject_id: parseInt(subjectId, 10),
                lessons_id: parseInt(w.id, 10),
                student_id: parseInt(studentId, 10),
                points_earned: pts,
            });
            if (!res.success) throw new Error(res.message || 'Failed');
            btn.textContent = 'Saved ✓';
            btn.style.background = '#00461B';
            btn.style.color = '#fff';
            const badge = row.querySelector('.gc-sub-row-grade-badge');
            const totalPts = w.data.total_points != null ? Number(w.data.total_points) : null;
            const badgeText = pts != null ? `${pts}${totalPts != null ? '/' + totalPts : ''} pts` : '';
            if (badge) { badge.textContent = badgeText; }
            else if (badgeText) { row.querySelector('.gc-sub-row-hdr')?.insertAdjacentHTML('beforeend', `<span class="gc-sub-row-grade-badge">${esc(badgeText)}</span>`); }
            setTimeout(() => { btn.disabled = false; btn.textContent = 'Save Grade'; btn.style.background = ''; btn.style.color = ''; }, 2000);
        } catch (err) {
            btn.disabled = false;
            btn.textContent = 'Save Grade';
            notify.error(err.message || 'Failed to save grade');
        }
    }

    function openSubmissionsModal() {
        const w = state.selectedWork;
        if (!w) return;
        const title = w.type === 'quiz' ? 'Quiz submissions' : 'Activity submissions';
        openGcModal({ title, bodyHtml: buildSubmissionsModalBody(w), wide: true });

        // Wire up "Check / Grade" buttons inside the modal
        setTimeout(() => {
            document.querySelectorAll('.gc-grade-btn').forEach(btn => {
                btn.addEventListener('click', () => openGradingPanel(btn.dataset.attempt));
            });
        }, 50);
    }

    function openViewersModal() {
        if (!state.detailViewers) return;
        openGcModal({
            title: 'Who viewed this',
            bodyHtml: renderViewersPanel(state.detailViewers),
            wide: true,
        });
    }

    function openDueDateModal() {
        const w = state.selectedWork;
        if (!w) return;
        const pts = w.type === 'lesson' && (w.data.total_points != null && w.data.total_points !== '')
            ? Number(w.data.total_points) : (w.type === 'lesson' ? null : 1);
        if (w.type === 'lesson' && pts == null) return;
        const raw = w.data.due_date ? String(w.data.due_date).slice(0, 10) : '';
        const dueDisplay = (() => {
            if (!raw) return null;
            const d = new Date(raw + 'T00:00:00');
            if (isNaN(d)) return null;
            return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
        })();

        const bodyHtml = `
            <div class="gc-due-modal-body">
                <div class="gc-due-modal-current">
                    <div class="gc-due-modal-cal ${raw ? '' : 'empty'}">
                        ${raw ? (() => {
                            const d = new Date(raw + 'T00:00:00');
                            return `<span class="gc-due-cal-month">${d.toLocaleString('en-US',{month:'short'}).toUpperCase()}</span>
                                    <span class="gc-due-cal-day">${d.getDate()}</span>`;
                        })() : `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.7)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`}
                    </div>
                    <div class="gc-due-modal-info">
                        <span class="gc-due-modal-info-label">Current due date</span>
                        <span class="gc-due-modal-info-date">${dueDisplay ? esc(dueDisplay) : '<em style="color:#9CA3AF;font-style:italic;font-weight:400">Not set</em>'}</span>
                    </div>
                </div>
                <div class="gc-due-modal-form">
                    <label class="gc-due-modal-label" for="gc-due-modal-input">Pick a new date</label>
                    <input type="date" id="gc-due-modal-input" class="gc-due-modal-input" value="${esc(raw)}">
                    <p class="gc-due-modal-hint">Students cannot submit after the due date unless you extend it.</p>
                </div>
                <div class="gc-due-modal-actions">
                    <button type="button" class="gc-due-modal-save" id="gc-due-modal-save">${raw ? 'Update due date' : 'Set due date'}</button>
                    ${raw ? `<button type="button" class="gc-due-modal-remove" id="gc-due-modal-remove">Remove due date</button>` : ''}
                </div>
            </div>`;

        const title = w.type === 'quiz' ? 'Quiz due date' : 'Activity due date';
        const { close } = openGcModal({ title, bodyHtml });

        const doSave = async (newDate) => {
            const payload = {
                subject_id: parseInt(subjectId, 10),
                due_date: newDate || null,
            };
            if (w.type === 'lesson') payload.lessons_id = w.id;
            else payload.quiz_id = w.id;

            const saveBtn = document.querySelector('#gc-due-modal-save');
            const remBtn  = document.querySelector('#gc-due-modal-remove');
            if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }
            if (remBtn)  { remBtn.disabled = true; }

            const res = await Api.post('/ClassroomAPI.php?action=set-due-date', payload);
            if (!res.success) {
                if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = newDate ? 'Update due date' : 'Set due date'; }
                if (remBtn)  { remBtn.disabled = false; }
                notify.error(res.message || 'Could not update due date');
                return;
            }
            w.data.due_date = res.due_date || null;
            const list = w.type === 'lesson' ? lessons : quizzes;
            const item = list.find(x => String(w.type === 'lesson' ? x.lessons_id : x.quiz_id) === String(w.id));
            if (item) item.due_date = res.due_date || null;
            close();
            refreshBody();
        };

        setTimeout(() => {
            document.querySelector('#gc-due-modal-save')?.addEventListener('click', () => {
                const val = document.querySelector('#gc-due-modal-input')?.value || '';
                doSave(val);
            });
            document.querySelector('#gc-due-modal-remove')?.addEventListener('click', () => doSave(''));
        }, 30);
    }

    // ─── Submission Grading Panel ──────────────────────────────────
    async function openGradingPanel(attemptId) {
        const resolveUrl = u => (!u || /^https?:\/\//i.test(u) || u.startsWith('/')) ? u : BASE_URL + '/' + u;

        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:2000;display:flex;justify-content:flex-end;';
        overlay.innerHTML = `
            <style>
                .gp-panel { background:#fff;width:720px;max-width:100vw;height:100%;display:flex;flex-direction:column;box-shadow:-4px 0 40px rgba(0,0,0,.18);animation:gpSlide .22s ease-out; }
                @keyframes gpSlide { from { transform:translateX(60px);opacity:0; } to { transform:translateX(0);opacity:1; } }
                .gp-hdr { background:#fff;border-bottom:1px solid #E5E7EB;color:#111;padding:18px 24px;display:flex;justify-content:space-between;align-items:flex-start;flex-shrink:0; }
                .gp-hdr h3 { margin:0;font-size:17px;font-weight:700;color:#111; }
                .gp-hdr p { margin:4px 0 0;font-size:12px;color:#6B7280; }
                .gp-close { background:none;border:none;color:#374151;width:30px;height:30px;border-radius:7px;font-size:20px;cursor:pointer;line-height:1; }
                .gp-close:hover { background:#F3F4F6; }
                .gp-toolbar { display:flex;align-items:center;gap:10px;padding:12px 20px;border-bottom:1px solid #e8e8e8;background:#fafafa;flex-shrink:0;flex-wrap:wrap; }
                .gp-score-pill { background:#E8F5E9;color:#1B4D3E;padding:5px 12px;border-radius:20px;font-size:12px;font-weight:700;white-space:nowrap; }
                .gp-ai-btn { display:flex;align-items:center;gap:6px;padding:7px 14px;background:#7C3AED;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer; }
                .gp-ai-btn:hover { background:#6D28D9; }
                .gp-ai-btn:disabled { opacity:.5;cursor:not-allowed; }
                .gp-confirm-all-btn { display:none;align-items:center;gap:6px;padding:7px 14px;background:#00461B;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer; }
                .gp-confirm-all-btn.show { display:flex; }
                .gp-body { flex:1;overflow-y:auto;padding:20px; }
                .gp-foot { padding:14px 20px;border-top:1px solid #e8e8e8;display:flex;justify-content:flex-end;gap:10px;background:#fff;flex-shrink:0; }
                .gp-btn-cancel { padding:9px 18px;background:#fff;border:1.5px solid #dadce0;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer; }
                .gp-finalize { padding:9px 20px;background:#00461B;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer; }
                .gp-finalize:disabled { opacity:.5;cursor:not-allowed; }
                .gp-spin { animation:gpSpin 1s linear infinite; }
                @keyframes gpSpin { to { transform:rotate(360deg); } }

                .gp-qblock { border:1px solid #e5e7eb;border-radius:12px;margin-bottom:14px;overflow:hidden; }
                .gp-qblock.confirmed { border-color:#bbf7d0; }
                .gp-qblock.overridden { border-color:#fde68a; }
                .gp-qhead { background:#f8f9fa;padding:10px 16px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #e5e7eb; }
                .gp-qnum { font-size:11px;font-weight:700;color:#1B4D3E;text-transform:uppercase; }
                .gp-qbody { padding:14px 16px; }
                .gp-q-text { font-size:14px;font-weight:600;color:#111827;margin-bottom:10px;line-height:1.5; }
                .gp-badge { padding:3px 8px;border-radius:10px;font-size:10px;font-weight:700; }
                .gp-badge-ok { background:#E8F5E9;color:#1B4D3E; }
                .gp-badge-wrong { background:#FEE2E2;color:#b91c1c; }
                .gp-badge-ai { background:#EDE9FE;color:#7C3AED; }
                .gp-badge-pending { background:#FEF3C7;color:#B45309; }
                .gp-badge-confirmed { background:#E8F5E9;color:#1B4D3E; }
                .gp-student-ans { background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px 13px;font-size:13px;color:#1a1a1a;margin-bottom:10px;white-space:pre-wrap;line-height:1.6; }
                .gp-student-ans.empty { background:#fef9f0;border-color:#fde68a;color:#92400e;font-style:italic; }
                .gp-ai-result { background:#EDE9FE;border:1px solid #C4B5FD;border-radius:8px;padding:10px 13px;margin-bottom:10px;font-size:12px;color:#5B21B6; }
                .gp-grade-row { display:flex;gap:10px;align-items:flex-start;margin-bottom:10px; }
                .gp-pts-wrap { flex-shrink:0; }
                .gp-pts-lbl { font-size:10px;font-weight:700;text-transform:uppercase;color:#6B7280;display:block;margin-bottom:3px; }
                .gp-pts-inp { width:68px;padding:7px 9px;border:1.5px solid #dadce0;border-radius:8px;font-size:14px;font-weight:700;text-align:center;font-family:inherit; }
                .gp-pts-inp:focus { outline:none;border-color:#00461B; }
                .gp-pts-max { font-size:10px;color:#9ca3af;text-align:center;margin-top:3px; }
                .gp-fb-wrap { flex:1; }
                .gp-fb-inp { width:100%;padding:7px 10px;border:1.5px solid #dadce0;border-radius:8px;font-size:12px;resize:vertical;min-height:52px;font-family:inherit;box-sizing:border-box; }
                .gp-fb-inp:focus { outline:none;border-color:#00461B; }
                .gp-save-btn { padding:6px 14px;background:#00461B;color:#fff;border:none;border-radius:7px;font-size:12px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:5px; }
                .gp-save-btn:hover { background:#006428; }
                .gp-save-btn:disabled { opacity:.5;cursor:not-allowed; }
                .gp-confirm-btn { padding:6px 14px;background:#7C3AED;color:#fff;border:none;border-radius:7px;font-size:12px;font-weight:700;cursor:pointer; }
                .gp-confirm-btn:hover { background:#6D28D9; }
                .gp-opt-list { display:flex;flex-direction:column;gap:5px;margin-bottom:10px; }
                .gp-opt { padding:7px 12px;border-radius:7px;font-size:13px;display:flex;align-items:center;gap:8px; }
                .gp-opt.selected-correct { background:#E8F5E9;border:1px solid #2D6A4F;color:#1B4D3E; }
                .gp-opt.selected-wrong { background:#FEE2E2;border:1px solid #fca5a5;color:#b91c1c; }
                .gp-opt.correct-answer { background:#f0fdf4;border:1px solid #bbf7d0;color:#1B4D3E; }
                .gp-opt.neutral { background:#f9f9f9;border:1px solid #e8e8e8;color:#374151; }
                .gp-override-row { display:flex;gap:8px;align-items:center;margin-top:8px;padding-top:8px;border-top:1px dashed #e5e7eb; }
                .gp-override-toggle { padding:5px 12px;border:1.5px solid #dadce0;border-radius:7px;font-size:11px;font-weight:700;cursor:pointer;background:#fff;color:#374151; }
                .gp-override-toggle:hover { border-color:#00461B;color:#00461B; }
                .gp-override-form { display:none;margin-top:10px;padding:10px 12px;background:#fffbf0;border:1px solid #fde68a;border-radius:8px; }
                .gp-override-form.show { display:block; }
                .gp-correct-toggle { display:flex;gap:8px; }
                .gp-correct-toggle label { display:flex;align-items:center;gap:5px;font-size:12px;font-weight:600;cursor:pointer;padding:5px 10px;border:1.5px solid #dadce0;border-radius:7px; }
                .gp-correct-toggle input[type=radio] { accent-color:#00461B; }
                .gp-integrity { background:#FEE2E2;border:1px solid #FCA5A5;border-radius:10px;padding:12px 16px;margin-bottom:14px;font-size:12px;color:#991B1B; }
            </style>
            <div class="gp-panel">
                <div class="gp-hdr">
                    <div><h3 id="gp-title">Loading…</h3><p id="gp-sub"></p></div>
                    <button class="gp-close" id="gp-close">&times;</button>
                </div>
                <div class="gp-toolbar">
                    <span class="gp-score-pill" id="gp-score">— pts</span>
                    <button class="gp-ai-btn" id="gp-ai-btn">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/></svg>
                        AI Check Subjective
                    </button>
                    <button class="gp-confirm-all-btn" id="gp-confirm-all">✓ Confirm All AI Grades</button>
                </div>
                <div class="gp-body" id="gp-body">
                    <div style="display:flex;align-items:center;justify-content:center;height:200px;gap:12px;color:#888;flex-direction:column;">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#1B4D3E" stroke-width="2" class="gp-spin"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
                        Loading submission…
                    </div>
                </div>
                <div class="gp-foot">
                    <button class="gp-btn-cancel" id="gp-cancel">Close</button>
                    <button class="gp-finalize" id="gp-finalize" disabled>✓ Finalize & Save</button>
                </div>
            </div>`;

        document.body.appendChild(overlay);

        const closeFn = () => overlay.remove();
        overlay.querySelector('#gp-close').addEventListener('click', closeFn);
        overlay.querySelector('#gp-cancel').addEventListener('click', closeFn);
        overlay.addEventListener('click', e => { if (e.target === overlay) closeFn(); });

        const res = await Api.get('/QuizAttemptsAPI.php?action=attempt-answers&attempt_id=' + attemptId);
        if (!res.success) {
            overlay.querySelector('#gp-body').innerHTML = `<div style="color:#b91c1c;text-align:center;padding:40px;">${esc(res.message || 'Failed to load')}</div>`;
            return;
        }

        const { attempt, answers } = res.data;
        overlay.querySelector('#gp-title').textContent = attempt.quiz_title || 'Submission Review';
        overlay.querySelector('#gp-sub').textContent = `${attempt.first_name || ''} ${attempt.last_name || ''}${attempt.student_id ? ' (' + attempt.student_id + ')' : ''} — ${attempt.subject_code || ''}`;
        overlay.querySelector('#gp-score').textContent = `${attempt.earned_points || 0} / ${attempt.total_points || 0} pts (${parseFloat(attempt.percentage || 0).toFixed(1)}%)`;

        const switches = parseInt(attempt.tab_switch_count || 0);
        const integrityHtml = switches > 0 ? `<div class="gp-integrity"><strong>⚠ Integrity Flag — ${switches} tab switch${switches > 1 ? 'es' : ''} detected</strong><br>Student left the quiz tab ${switches} time${switches > 1 ? 's' : ''} while taking this quiz.${switches >= 3 ? ' <strong>Multiple violations detected.</strong>' : ''}</div>` : '';

        renderGradingBody(overlay, answers, integrityHtml, attempt, attemptId, resolveUrl, closeFn);
    }

    function renderGradingBody(overlay, answers, integrityHtml, attempt, attemptId, resolveUrl, closeFn) {
        const body = overlay.querySelector('#gp-body');
        const SUBJ_TYPES = ['essay', 'short_answer', 'fill_blank', 'fill_in_the_blank'];
        const OBJ_TYPES  = ['multiple_choice', 'true_false', 'checkboxes', 'dropdown', 'fill_blank'];

        let html = integrityHtml;
        answers.forEach((a, idx) => {
            const qn = idx + 1;
            const qType   = (a.question_type || '').toLowerCase();
            const isSubj  = SUBJ_TYPES.includes(qType) && !['fill_blank'].includes(qType);
            const isObj   = !isSubj;
            const isPend  = a.grading_status === 'pending';
            const isAI    = a.grading_status === 'auto_graded';
            const isDone  = a.grading_status === 'graded';
            const studentText = (a.answer_text || '').trim();

            // Badge
            const badge = isPend
                ? `<span class="gp-badge gp-badge-pending">Pending</span>`
                : isAI
                    ? `<span class="gp-badge gp-badge-ai">AI Graded — Confirm Required</span>`
                    : isDone
                        ? `<span class="gp-badge gp-badge-confirmed">✓ Graded</span>`
                        : `<span class="gp-badge ${a.is_correct == 1 ? 'gp-badge-ok' : 'gp-badge-wrong'}">${a.is_correct == 1 ? '✓ Correct' : '✗ Incorrect'}</span>`;

            // Media
            const mUrl = resolveUrl(a.media_url || '');
            const mediaHtml = (a.media_type && a.media_type !== 'none' && mUrl)
                ? (a.media_type === 'image' ? `<img src="${esc(mUrl)}" style="max-width:100%;max-height:160px;border-radius:8px;margin-bottom:10px;display:block;">` :
                   a.media_type === 'audio' ? `<audio controls src="${esc(mUrl)}" style="width:100%;max-width:380px;margin-bottom:10px;"></audio>` :
                   `<a href="${esc(mUrl)}" target="_blank" style="font-size:12px;color:#1B4D3E;display:inline-flex;align-items:center;gap:4px;"><svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244"/></svg>${esc(a.media_name || mUrl)}</a>`)
                : '';

            let content = '';
            if (isObj || qType === 'fill_blank') {
                // Objective / fill_blank — show options or answer, then allow override
                if ((a.options || []).length) {
                    const selId = String(a.selected_option_id || '');
                    content += `<div class="gp-opt-list">${(a.options).map(o => {
                        const isSel  = String(o.option_id) === selId;
                        const isCorr = o.is_correct == 1;
                        let cls = 'neutral';
                        let label = '';
                        if (isSel && isCorr)  { cls = 'selected-correct'; label = '✓ Your answer'; }
                        else if (isSel)        { cls = 'selected-wrong';   label = '✗ Your answer'; }
                        else if (isCorr)       { cls = 'correct-answer';   label = 'Correct'; }
                        return `<div class="gp-opt ${cls}">${esc(o.option_text)}${label ? ` <span style="margin-left:auto;font-size:10px;font-weight:700;">${label}</span>` : ''}</div>`;
                    }).join('')}</div>`;
                } else if (studentText) {
                    content += `<div class="gp-student-ans">${esc(studentText)}</div>`;
                    if (a.correct_answer_text) content += `<div style="font-size:11px;color:#1B4D3E;margin-bottom:8px;">Expected: <strong>${esc(a.correct_answer_text)}</strong></div>`;
                }
                // Override form (collapsed by default)
                content += `
                    <div class="gp-override-row">
                        <span style="font-size:11px;color:#6B7280;font-weight:600;">${a.points_earned != null ? a.points_earned : '—'} / ${a.max_points} pts</span>
                        <button class="gp-override-toggle" data-aid="${a.answer_id}">Override Grade</button>
                    </div>
                    <div class="gp-override-form" id="gp-ovf-${a.answer_id}">
                        <div style="font-size:11px;font-weight:700;color:#B45309;margin-bottom:8px;">Override — changing this will flag as manually graded</div>
                        <div class="gp-correct-toggle" style="margin-bottom:8px;">
                            <label><input type="radio" name="gp-corr-${a.answer_id}" value="1" ${a.is_correct == 1 ? 'checked' : ''}> Correct</label>
                            <label><input type="radio" name="gp-corr-${a.answer_id}" value="0" ${a.is_correct != 1 ? 'checked' : ''}> Incorrect</label>
                        </div>
                        <div class="gp-grade-row">
                            <div class="gp-pts-wrap">
                                <span class="gp-pts-lbl">Points</span>
                                <input type="number" class="gp-pts-inp" id="gp-pts-${a.answer_id}" min="0" max="${a.max_points}" step="0.5" value="${a.points_earned != null ? a.points_earned : 0}">
                                <div class="gp-pts-max">/ ${a.max_points}</div>
                            </div>
                            <div class="gp-fb-wrap">
                                <span class="gp-pts-lbl">Feedback (optional)</span>
                                <textarea class="gp-fb-inp" id="gp-fb-${a.answer_id}" placeholder="Add feedback…">${esc(a.grader_feedback || '')}</textarea>
                            </div>
                        </div>
                        <button class="gp-save-btn" data-aid="${a.answer_id}" data-max="${a.max_points}" data-override="1">Save Override</button>
                    </div>`;
            } else {
                // Subjective — show student text and grade form
                content += `<div class="gp-student-ans${!studentText ? ' empty' : ''}">${studentText ? esc(studentText) : '(No answer provided)'}</div>`;
                if (isAI) {
                    content += `<div class="gp-ai-result" style="display:flex;align-items:flex-start;gap:8px;"><svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="flex-shrink:0;margin-top:2px;"><path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/></svg><div><strong>AI Score: ${a.points_earned} / ${a.max_points} pts</strong>${a.grader_feedback ? ` — <em>${esc(a.grader_feedback)}</em>` : ''}<br><span style="opacity:.8;">Review the AI grade and confirm or adjust below.</span></div></div>`;
                }
                if (isDone && !isAI) {
                    content += `<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;font-size:12px;font-weight:600;color:#1B4D3E;">
                        ✓ Graded: ${a.points_earned} / ${a.max_points} pts${a.grader_feedback ? ` &mdash; <em style="font-weight:400">${esc(a.grader_feedback)}</em>` : ''}
                        <button class="gp-override-toggle" data-aid="${a.answer_id}" style="margin-left:auto;">Edit</button>
                    </div>
                    <div class="gp-override-form" id="gp-ovf-${a.answer_id}">`;
                } else {
                    content += `<div class="gp-override-form show" id="gp-ovf-${a.answer_id}">`;
                }
                content += `
                        <div class="gp-grade-row">
                            <div class="gp-pts-wrap">
                                <span class="gp-pts-lbl">Points</span>
                                <input type="number" class="gp-pts-inp" id="gp-pts-${a.answer_id}" min="0" max="${a.max_points}" step="0.5" value="${a.points_earned != null ? a.points_earned : 0}">
                                <div class="gp-pts-max">/ ${a.max_points}</div>
                            </div>
                            <div class="gp-fb-wrap">
                                <span class="gp-pts-lbl">Feedback (optional)</span>
                                <textarea class="gp-fb-inp" id="gp-fb-${a.answer_id}" placeholder="Add feedback…">${esc(a.grader_feedback || '')}</textarea>
                            </div>
                        </div>
                        <div style="display:flex;gap:8px;align-items:center;">
                            <button class="gp-save-btn" data-aid="${a.answer_id}" data-max="${a.max_points}">${isAI ? 'Confirm & Save Grade' : 'Save Grade'}</button>
                            ${isAI ? `<span style="font-size:11px;color:#7C3AED;">AI suggested — confirm to finalize</span>` : ''}
                        </div>
                    </div>`;
            }

            html += `<div class="gp-qblock${isDone && !isAI ? ' confirmed' : ''}" id="gp-qb-${a.answer_id}">
                <div class="gp-qhead">
                    <span class="gp-qnum">Q${qn} — ${formatQType(qType)}</span>
                    <div style="display:flex;gap:6px;align-items:center;">${badge}<span style="font-size:10px;color:#9CA3AF;">${a.max_points} pt${a.max_points != 1 ? 's' : ''}</span></div>
                </div>
                <div class="gp-qbody">
                    <div class="gp-q-text">${esc(a.question_text)}</div>
                    ${mediaHtml}
                    ${content}
                </div>
            </div>`;
        });

        body.innerHTML = html;

        // Wire override toggles
        body.querySelectorAll('.gp-override-toggle').forEach(btn => {
            btn.addEventListener('click', () => {
                const form = body.querySelector(`#gp-ovf-${btn.dataset.aid}`);
                if (form) form.classList.toggle('show');
            });
        });

        // Wire save buttons
        body.querySelectorAll('.gp-save-btn').forEach(btn => {
            btn.addEventListener('click', () => saveGradePanelAnswer(overlay, btn, attempt, attemptId));
        });

        // Wire AI Check button
        const aiBtn = overlay.querySelector('#gp-ai-btn');
        aiBtn.addEventListener('click', async () => {
            const hasSubj = answers.some(a => ['essay','short_answer'].includes((a.question_type||'').toLowerCase()) && a.grading_status === 'pending');
            if (!hasSubj) {
                alert('No pending subjective answers to grade in this submission.');
                return;
            }
            if (!confirm('AI will grade all pending essay/short answer questions for this student.\n\nYou will still need to confirm each grade before finalizing. Continue?')) return;
            aiBtn.disabled = true;
            aiBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="gp-spin"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg> Checking…`;
            try {
                const aiRes = await Api.post('/QuizAttemptsAPI.php?action=ai-grade-attempt', { attempt_id: parseInt(attemptId) });
                if (aiRes.success && aiRes.graded > 0) {
                    // Reload the panel with fresh data
                    const fresh = await Api.get('/QuizAttemptsAPI.php?action=attempt-answers&attempt_id=' + attemptId);
                    if (fresh.success) {
                        renderGradingBody(overlay, fresh.data.answers, integrityHtml, fresh.data.attempt, attemptId, resolveUrl, closeFn);
                        return;
                    }
                } else {
                    alert(aiRes.message || 'AI grading failed. Check Groq API key in Settings.');
                }
            } catch (_) {
                alert('AI grading failed. Check Groq API key in Settings.');
            } finally {
                aiBtn.disabled = false;
                aiBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/></svg> AI Check Subjective`;
            }
        });

        // Wire "Confirm All AI Grades" — appears when any AI-graded answers exist
        const hasAI = answers.some(a => a.grading_status === 'auto_graded');
        const confirmAllBtn = overlay.querySelector('#gp-confirm-all');
        if (hasAI) confirmAllBtn.classList.add('show');
        confirmAllBtn.addEventListener('click', async () => {
            if (!confirm('Confirm all AI-graded answers as-is? You can still adjust individual scores before finalizing.')) return;
            const aiAnswers = answers.filter(a => a.grading_status === 'auto_graded');
            confirmAllBtn.disabled = true;
            for (const a of aiAnswers) {
                const pts = parseFloat(overlay.querySelector(`#gp-pts-${a.answer_id}`)?.value ?? a.points_earned ?? 0);
                const fb  = overlay.querySelector(`#gp-fb-${a.answer_id}`)?.value?.trim() ?? a.grader_feedback ?? '';
                await Api.post('/QuizAttemptsAPI.php?action=grade-answer', { answer_id: parseInt(a.answer_id), points_earned: pts, feedback: fb });
                const block = overlay.querySelector(`#gp-qb-${a.answer_id}`);
                if (block) block.classList.add('confirmed');
            }
            // Reload fresh
            const fresh = await Api.get('/QuizAttemptsAPI.php?action=attempt-answers&attempt_id=' + attemptId);
            if (fresh.success) renderGradingBody(overlay, fresh.data.answers, integrityHtml, fresh.data.attempt, attemptId, resolveUrl, closeFn);
        });

        // Wire Finalize button
        checkFinalizeState(overlay, answers, attemptId, closeFn);
    }

    async function saveGradePanelAnswer(overlay, btn, attempt, attemptId) {
        const aid    = btn.dataset.aid;
        const isOverride = !!btn.dataset.override;
        const ptsEl  = overlay.querySelector(`#gp-pts-${aid}`);
        const fbEl   = overlay.querySelector(`#gp-fb-${aid}`);
        const pts    = parseFloat(ptsEl?.value ?? 0);
        const fb     = fbEl?.value?.trim() ?? '';
        const max    = parseFloat(btn.dataset.max ?? 1);

        if (isNaN(pts) || pts < 0 || pts > max) {
            alert(`Points must be between 0 and ${max}`); return;
        }

        btn.disabled = true;
        btn.textContent = 'Saving…';

        const payload = { answer_id: parseInt(aid), points_earned: pts, feedback: fb };
        if (isOverride) {
            const corrEl = overlay.querySelector(`input[name="gp-corr-${aid}"]:checked`);
            payload.is_correct = corrEl ? parseInt(corrEl.value) : 0;
        }

        const res = await Api.post('/QuizAttemptsAPI.php?action=grade-answer', payload);
        btn.disabled = false;
        btn.textContent = isOverride ? 'Save Override' : 'Save Grade';

        if (res.success) {
            const block = overlay.querySelector(`#gp-qb-${aid}`);
            if (block) block.classList.add('confirmed');
            // Update score pill
            if (res.new_score != null) {
                overlay.querySelector('#gp-score').textContent = `${res.new_score} / ${attempt.total_points || 0} pts (${parseFloat(res.new_pct || 0).toFixed(1)}%)`;
            }
            // Re-check finalize
            const fresh = await Api.get('/QuizAttemptsAPI.php?action=attempt-answers&attempt_id=' + attemptId);
            if (fresh.success) checkFinalizeState(overlay, fresh.data.answers, attemptId, () => overlay.remove());
        } else {
            alert(res.message || 'Failed to save grade');
        }
    }

    function checkFinalizeState(overlay, answers, attemptId, closeFn) {
        const finBtn = overlay.querySelector('#gp-finalize');
        const SUBJ = ['essay','short_answer','fill_blank','fill_in_the_blank'];
        // Only subjective answers need manual confirmation; objective are already graded
        const unconfirmed = answers.filter(a => SUBJ.includes((a.question_type||'').toLowerCase()) && a.grading_status !== 'graded');
        const hasUnconfirmed = unconfirmed.length > 0;
        finBtn.disabled = hasUnconfirmed;
        finBtn.title = hasUnconfirmed ? `${unconfirmed.length} answer(s) still need your confirmation` : '';

        finBtn.onclick = async () => {
            finBtn.disabled = true;
            finBtn.textContent = 'Finalizing…';
            const res = await Api.post('/QuizAttemptsAPI.php?action=finalize-grading', { attempt_id: parseInt(attemptId) });
            if (res.success) {
                closeFn();
                // Refresh submissions if they're open
                const w = state.selectedWork;
                if (w?.type === 'quiz') {
                    loadQuizScores(w.id).then(scores => {
                        state.quizScores = scores;
                        refreshBody();
                    });
                }
            } else {
                finBtn.disabled = false;
                finBtn.textContent = '✓ Finalize & Save';
                alert(res.message || 'Failed to finalize');
            }
        };
    }

    function formatQType(t) {
        const m = { multiple_choice:'Multiple Choice', true_false:'True/False', fill_blank:'Fill in Blank', fill_in_the_blank:'Fill in Blank', short_answer:'Short Answer', essay:'Essay', checkboxes:'Checkboxes', dropdown:'Dropdown' };
        return m[t] || t;
    }
    // ─────────────────────────────────────────────────────────────

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
            notify.error(res.message || 'Failed to post comment');
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
                    ${person.studentSubjectId ? `<button type="button" class="sc-rail-btn danger sc-person-unenroll-btn">Unenroll</button>` : ''}
                    <button type="button" class="sc-rail-btn outline sc-person-close-btn">Cancel</button>
                </div>
            </div>
        `;
        overlay.querySelector('.sc-person-msg-btn').addEventListener('click', () => {
            overlay.remove();
            openFloatingChat(person.id, person.name, 'student');
        });
        overlay.querySelector('.sc-person-unenroll-btn')?.addEventListener('click', async () => {
            overlay.remove();
            const ok = await notify.confirm(
                `Unenroll ${person.name} from this subject?\n\nThey will lose access to lessons, quizzes, and announcements for this class. This can't be undone from here — they'd need to re-enroll with the class code.`,
                { danger: true, confirmText: 'Unenroll' }
            );
            if (!ok) return;
            const res = await Api.post('/SectionsAPI.php?action=unenroll', { student_subject_id: parseInt(person.studentSubjectId, 10) });
            if (res.success) {
                notify.success(`${person.name} has been unenrolled.`);
                render(container, { subject_id: subjectId, section_id: effectiveSectionId, tab: 'people' });
            } else {
                notify.error(res.message || 'Failed to unenroll student');
            }
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
                        notify.error(res.message || 'Could not update status');
                        return;
                    }
                    await render(container, { subject_id: subjectId, section_id: effectiveSectionId });
                    return;
                }

                if (action === 'edit' && type === 'quiz') {
                    const quizData = allQuizzesForSubject.find(q => String(q.quiz_id) === String(id));
                    if (quizData) {
                        openQuizModal({
                            quiz: quizData,
                            lockSubject: true,
                            classesData: [subjectFromApi || {
                                subject_id: subjectId,
                                subject_code: subject.subject_code,
                                subject_name: subject.subject_name,
                                sections: subjectSections(),
                            }],
                            onSuccess: () => render(container, { subject_id: subjectId, section_id: effectiveSectionId }),
                        });
                    }
                    return;
                }

                if (action === 'questions') {
                    window.location.hash = `#instructor/quiz-questions?quiz_id=${id}`;
                    return;
                }

                if (action === 'delete') {
                    if (!await notify.confirm(`Delete "${name}"? This cannot be undone.`, { danger: true, confirmText: 'Delete' })) return;
                    let url, body;
                    if (type === 'announcement') {
                        url = '/AnnouncementsAPI.php?action=delete';
                        body = { announcement_id: parseInt(id, 10) };
                    } else if (type === 'quiz') {
                        url = '/QuizzesAPI.php?action=delete';
                        body = { quiz_id: parseInt(id, 10) };
                    } else {
                        url = '/LessonsAPI.php?action=delete';
                        body = { lessons_id: parseInt(id, 10) };
                    }
                    const res = await Api.post(url, body);
                    if (!res.success) {
                        notify.error(res.message || 'Could not delete');
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
                // Navigate straight to the question editor — do NOT also kick off
                // an async render(container, ...) here. That re-render lands after
                // the hash change and overwrites #page-content back to this
                // classroom view, so the question editor flashes and disappears.
                if (quizId) {
                    window.location.hash = `#instructor/quiz-questions?quiz_id=${quizId}`;
                } else {
                    render(container, { subject_id: subjectId, section_id: effectiveSectionId });
                }
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
                }).catch(() => notify.info('Class code: ' + code));
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

        container.querySelectorAll('.gc-post-card--ann[data-ann-id]').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('.gc-cw-kebab-wrap') || e.target.closest('.gc-viewers-toggle') || e.target.closest('.gc-subs-btn')) return;
                openAnnouncement(card.dataset.annId);
            });
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

        container.querySelectorAll('.gc-subs-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                openInlineSubmissions(btn.dataset.subType, btn.dataset.subId);
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

        container.querySelector('#gc-open-viewers')?.addEventListener('click', openViewersModal);
        container.querySelector('#gc-open-due-modal')?.addEventListener('click', openDueDateModal);

        container.querySelector('#gc-run-ai-checker')?.addEventListener('click', async () => {
            const w = state.selectedWork;
            if (!w || w.type !== 'quiz') return;
            const btn = container.querySelector('#gc-run-ai-checker');
            if (btn?.dataset.loading) return;
            if (!await notify.confirm('Run AI checker on all pending essay/short answers for this quiz?', { confirmText: 'Run AI Checker' })) return;
            if (btn) {
                btn.dataset.loading = '1';
                btn.disabled = true;
                btn.innerHTML = `${icon('robot', inl)} Checking…`;
            }
            try {
                const res = await Api.post('/QuizAttemptsAPI.php?action=ai-grade-quiz', {
                    quiz_id: parseInt(w.id, 10),
                });
                if (res.success) {
                    notify.success(res.message || 'AI check complete.');
                } else {
                    notify.error(res.message || 'AI check failed.');
                }
                if (res.success) {
                    const [scores, qStats] = await Promise.all([
                        loadQuizScores(w.id),
                        loadQuizQuestionStats(w.id),
                    ]);
                    state.quizScores = scores;
                    state.quizQuestionStats = qStats;
                    refreshBody();
                }
            } catch (_) {
                notify.error('AI checker failed. Check your Groq API key in Settings.');
            } finally {
                if (btn) {
                    delete btn.dataset.loading;
                    btn.disabled = false;
                    btn.innerHTML = `${icon('robot', inl)} AI Checker`;
                }
            }
        });

        bindCommentEvents();

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
                    studentSubjectId: student.student_subject_id || null,
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
        /* ── Submissions right panel ───────────────────────────────── */
        .sc-rail-subs { padding:0 !important; overflow:hidden; border-radius:10px; }
        .gc-sub-panel {
            background:#fff;
            overflow:hidden;
        }
        .gc-sub-panel-hdr {
            padding:14px 16px 10px; border-bottom:1px solid #F0F0F0; background:#FAFAFA;
        }
        .gc-sub-panel-title {
            font-size:13px; font-weight:700; color:#111827;
            display:flex; align-items:center; gap:6px; margin:0;
        }
        .gc-sub-panel-count {
            background:#00461B; color:#fff; border-radius:20px;
            padding:1px 8px; font-size:11px; font-weight:700;
        }
        .gc-sub-panel-body { max-height:70vh; overflow-y:auto; }
        .gc-sub-panel-empty { padding:20px 16px; color:#9CA3AF; font-size:13px; }
        .gc-sub-panel-subtitle { padding:12px 16px 4px; font-size:12px; font-weight:700; color:#374151; margin:0; }
        .gc-sub-panel-quiz { padding:8px 0; }

        .gc-sub-row {
            padding:12px 16px; border-bottom:1px solid #F4F4F5;
        }
        .gc-sub-row:last-child { border-bottom:none; }
        .gc-sub-row-hdr {
            display:flex; align-items:center; gap:8px; margin-bottom:8px;
        }
        .gc-sub-row-meta { flex:1; min-width:0; display:flex; flex-direction:column; gap:1px; }
        .gc-sub-row-name { font-size:13px; font-weight:600; color:#111827; }
        .gc-sub-row-time { font-size:11px; color:#9CA3AF; }
        .gc-sub-row-grade-badge {
            font-size:12px; font-weight:700; color:#00461B;
            background:#E8F5EC; border:1px solid #bbf7d0;
            border-radius:20px; padding:2px 10px; white-space:nowrap; flex-shrink:0;
        }
        .gc-sub-row-files { display:flex; flex-direction:column; gap:4px; margin-bottom:8px; }
        .gc-sub-row-files .gc-work-attach {
            display:flex; align-items:center; gap:6px;
            padding:6px 8px; border-radius:6px; background:#F8F9FA;
            text-decoration:none; color:#374151; font-size:12px;
            transition:background .12s;
        }
        .gc-sub-row-files .gc-work-attach:hover { background:#E9ECEF; }
        .gc-sub-row-grade-row {
            display:flex; gap:6px; align-items:center;
        }
        .gc-sub-grade-input {
            flex:1; padding:6px 8px; border:1px solid #D1D5DB; border-radius:6px;
            font-size:12px; font-family:inherit; color:#111827;
            background:#fff;
        }
        .gc-sub-grade-input:focus { outline:none; border-color:#00461B; box-shadow:0 0 0 2px rgba(0,70,27,.15); }
        .gc-sub-grade-save {
            padding:6px 12px; border:none; border-radius:6px;
            background:#E8F5EC; color:#00461B; font-size:11px; font-weight:700;
            cursor:pointer; white-space:nowrap; font-family:inherit;
            transition:background .12s, color .12s;
        }
        .gc-sub-grade-save:hover { background:#00461B; color:#fff; }
        .gc-sub-grade-save:disabled { opacity:.6; cursor:not-allowed; }

        /* ── Announcement full-page detail body ───────────────────── */
        .gc-ann-full-body {
            font-size:14px; line-height:1.8; color:#374151;
            white-space:pre-wrap; word-break:break-word;
            padding:4px 0 8px;
        }
        /* ── Announcement stream card ─────────────────────────────── */
        .gc-post-card--ann {
            border-left: 4px solid #D1D5DB;
            border-right: 4px solid #D1D5DB;
            border-top: none;
            border-bottom: none;
        }
        .gc-post-card__ann-body {
            flex: 1; min-width: 0; padding: 14px 16px;
        }
        .gc-post-card--ann .gc-post-card__hdr {
            display: flex; align-items: center; gap: 10px; margin-bottom: 10px;
        }
        .gc-ann-badge {
            margin-left: auto; font-size: 11px; font-weight: 700;
            color: var(--subj, #00461B); background: var(--subj-soft, #E8F5EC);
            border: 1px solid var(--subj-light, #bbf7d0); border-radius: 20px;
            padding: 3px 10px; white-space: nowrap; flex-shrink: 0;
        }
        .gc-ann-content { padding: 0 2px; }
        .gc-ann-title {
            font-size: 15px; font-weight: 700; color: #111827; margin-bottom: 6px; line-height: 1.3;
        }
        .gc-ann-preview {
            font-size: 13.5px; color: #374151; line-height: 1.6; margin: 0 0 6px;
            white-space: pre-wrap; word-break: break-word;
        }
        .gc-ann-section {
            font-size: 11px; font-weight: 600; color: var(--subj, #00461B);
            background: var(--subj-soft, #E8F5EC); display: inline-block;
            padding: 2px 8px; border-radius: 6px; margin-top: 4px;
        }
        .gc-ann-attachments {
            display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0;
        }
        .gc-ann-attach-chip {
            display: inline-flex; align-items: center; gap: 6px;
            padding: 6px 12px; border: 1px solid #E5E7EB; border-radius: 20px;
            background: #F9FAFB; color: #374151; font-size: 12.5px; font-weight: 600;
            text-decoration: none; max-width: 220px;
        }
        .gc-ann-attach-chip span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .gc-ann-attach-chip:hover { background: #E8F5EC; border-color: #A7D4B5; color: #00461B; }
        /* ── Inline submissions footer on classwork cards ─────────── */
        .gc-post-card__subs {
            display: flex; align-items: center; justify-content: space-between; gap: 10px;
            padding: 9px 16px 11px; border-top: 1px solid #F0F0F0;
            background: #FAFAFA; font-size: 12px;
        }
        .gc-subs-count { display: inline-flex; align-items: center; gap: 5px; color: #5F6368; font-weight: 500; }
        .gc-subs-btn {
            display: inline-flex; align-items: center; gap: 5px;
            padding: 5px 12px; border: 1.5px solid #00461B; border-radius: 20px;
            background: #fff; color: #00461B; font-size: 11px; font-weight: 700;
            cursor: pointer; transition: background .12s, color .12s; font-family: inherit;
        }
        .gc-subs-btn:hover { background: #00461B; color: #fff; }
        .gc-subs-btn:disabled { opacity: .55; cursor: not-allowed; }
        /* ─────────────────────────────────────────────────────────── */
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
            background:#fff; border:2px solid #111; border-radius:12px;
            padding:18px 16px; text-align:center;
        }
        .sc-class-code-card--empty { padding:20px 16px; }
        .sc-class-code-icon {
            width:52px; height:52px; margin:0 auto 12px; border-radius:50%;
            background:#F3F4F6; color:#111;
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
            border:2px solid #111;
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

        @media (max-width:900px) {
            .sc-cw-layout { grid-template-columns:1fr; }
            .sc-cw-aside { position:static; }
            .sc-class-code-card { display:grid; grid-template-columns:auto 1fr; gap:12px 16px; text-align:left; align-items:center; }
            .sc-class-code-card h3, .sc-class-code-card .sc-class-code-section,
            .sc-class-code-card .sc-class-code-hint, .sc-class-code-card .sc-class-code-foot { grid-column:2; }
            .sc-class-qr-wrap { grid-row:1 / span 4; margin:0; }
            .sc-class-code-value, .sc-class-code-copy { grid-column:1 / -1; }
            .gc-qstat-row { flex-wrap:wrap; }
            .gc-qstat-bar-wrap { width:100%; margin-top:6px; }
        }

        .gc-detail-action-btn--ai { background:#EDE9FE; color:#5B21B6; border-color:#C4B5FD; }
        .gc-detail-action-btn--ai:hover { background:#DDD6FE; }
        .gc-qstats-list { display:flex; flex-direction:column; gap:10px; margin-top:12px; }
        .gc-qstat-row {
            display:flex; align-items:flex-start; gap:10px; padding:10px 12px;
            border:1px solid #E8EAED; border-radius:10px; background:#FAFBFC;
        }
        .gc-qstat-rank {
            width:24px; height:24px; border-radius:50%; background:#FCE8E6; color:#C5221F;
            font-size:11px; font-weight:800; display:flex; align-items:center; justify-content:center; flex-shrink:0;
        }
        .gc-qstat-body { flex:1; min-width:0; }
        .gc-qstat-text { font-size:13px; color:#202124; line-height:1.4; margin-bottom:4px; }
        .gc-qstat-meta { font-size:11px; color:#5F6368; }
        .gc-qstat-bar-wrap {
            width:120px; flex-shrink:0; text-align:right;
        }
        .gc-qstat-bar {
            height:6px; background:#C5221F; border-radius:999px; margin-bottom:4px; max-width:100%;
        }
        .gc-qstat-pct { font-size:10px; font-weight:700; color:#C5221F; white-space:nowrap; }
    `;
}
