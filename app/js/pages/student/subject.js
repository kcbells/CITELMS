/**
 * Student Subject — Classwork (inline lessons), People, Calendar
 */
import { Api, BASE_URL } from '../../api.js';
import { Auth } from '../../auth.js';
import { subjectColor, subjectThemeVars, programPatternSvg } from '../../utils/subject-colors.js';
import { renderEmbedded, getLessonStyles } from './lesson-view.js';
import { openFloatingChat } from '../../components/floating-messenger.js';
import { openOnlineClass, preloadOnlineClass } from '../../components/online-class-player.js';
import { getFullName, buildClassRoomSlug } from '../../utils/user-display.js';
import {
    esc, initials, emptyMsg, classroomCss, icon, iconLg, renderClassworkPostCard,
    renderWorkFocusRailStack, openGcModal,
    bindPrivateCommentRail, classroomPageFooter,
} from '../../utils/classroom-ui.js';
import {
    renderMaterialAttachment, bindMaterialAttachments, materialAttachmentCss, resolveMaterialUrl,
} from '../../utils/material-files.js';
import { subjectHash } from './quizzes.js';
import { mountStudentGrades } from './grades.js';
import { setAssistantContext, clearAssistantContext } from '../../utils/assistant-context.js';
import { bindQuizReviewTriggers } from '../../components/student-quiz-review-modal.js';
import { notify } from '../../utils/notify.js';

const inl = { size: 14, className: 'ui-icon-inline' };

/** Update hash without firing hashchange (avoids full page reload) */
function syncHashQuiet(hash) {
    if (window.location.hash !== hash) {
        history.replaceState(null, '', hash);
    }
}

let activeRenderGen = 0;

export async function render(container, params) {
    const renderGen = ++activeRenderGen;
    const subjectId = params?.subject_id
        || new URLSearchParams(window.location.hash.split('?')[1] || '').get('subject_id');

    if (!subjectId) {
        container.innerHTML = emptyMsg('No subject selected.', '#student/my-subjects', 'Back to My Subjects');
        return;
    }

    container.innerHTML = `<div class="sc-loading"><div class="sc-spin"></div></div>`;

    const [subjRes, classRes, annRes, quizRes] = await Promise.all([
        Api.get('/EnrollmentAPI.php?action=my-subjects'),
        Api.get('/ClassroomAPI.php?action=info&subject_id=' + subjectId),
        Api.get('/AnnouncementsAPI.php?action=student-list'),
        Api.get('/ProgressAPI.php?action=student-quizzes&subject_id=' + subjectId),
    ]);

    const subject = (subjRes.success ? subjRes.data : [])
        .find(s => String(s.subject_id) === String(subjectId));

    if (!subject) {
        container.innerHTML = emptyMsg('Subject not found or you are not enrolled.', '#student/my-subjects', 'Back to My Subjects');
        return;
    }

    const lessonsRes = await Api.get('/LessonsAPI.php?action=list&subject_id=' + subject.subject_offered_id);
    const classmatesRes = await Api.get('/ClassroomAPI.php?action=classmates&subject_id=' + subjectId);

    const classroom = classRes.success ? classRes.data : {};
    const teacher   = classroom.teacher || null;
    const lessons   = lessonsRes.success ? lessonsRes.data : [];
    const quizzes   = quizRes.success ? quizRes.data : [];
    const classmates = classmatesRes.success ? classmatesRes.data : [];
    const announcements = (annRes.success ? annRes.data : [])
        .filter(a => String(a.subject_id) === String(subjectId));

    const isArchived = subject.offering_status === 'archived';
    const color = subjectColor(subject.subject_id);
    const themeVars = subjectThemeVars(color);
    await Auth.getUser();
    const me = Auth.user() || {};
    preloadOnlineClass();

    const hashParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
    const urlTab = params?.tab || hashParams.get('tab') || 'classwork';
    const validTabs = ['classwork', 'people', 'gradebook'];
    const normalizedTab = (urlTab === 'quizzes' || urlTab === 'announcements' || urlTab === 'calendar') ? 'classwork'
        : urlTab;

    const now = new Date();
    const teacherName = teacher
        ? (teacher.full_name || `${teacher.first_name || ''} ${teacher.last_name || ''}`.trim())
        : (subject.instructor_name || 'Instructor');
    const teacherInitials = teacher
        ? initials(teacher.first_name, teacher.last_name)
        : initials(teacherName.split(' ')[0], teacherName.split(' ').slice(1).join(' ') || teacherName[0]);

    const state = {
        tab: validTabs.includes(normalizedTab) ? normalizedTab : 'classwork',
        selectedWork: null,
        workComments: [],
        privateComments: [],
        privateReplyTo: null,
        workMaterials: [],
        studentSubmissions: [],
    };

    function renderMainBody() {
        if (state.selectedWork) return renderWorkFocus();
        if (state.tab === 'classwork') return renderClasswork();
        if (state.tab === 'people') return renderPeople();
        if (state.tab === 'gradebook') return '<div id="sc-grades-host"></div>';
        return '';
    }

    let clockInterval = null;

    function renderPage() {
        if (renderGen !== activeRenderGen) return;
        const focused = !!state.selectedWork;

        container.innerHTML = `
            <style>${classroomCss(color)}${studentClassworkCss()}${materialAttachmentCss()}${focused ? getLessonStyles() : ''}</style>
            <div class="sc-page sc-student-class" style="${themeVars}">
                <div class="sc-crumb">
                    <a href="${isArchived ? '#student/my-subjects?view=archived' : '#student/my-subjects'}">${isArchived ? 'Archived Classes' : 'My Subjects'}</a>
                    <span class="sc-crumb-sep">&rsaquo;</span>
                    <span class="sc-crumb-current">${esc(subject.subject_name)}</span>
                </div>

                <header class="sc-hero" style="background:${color}${isArchived ? ';filter:saturate(.55)' : ''}">
                    ${programPatternSvg(subject.program_code, subject.subject_id, { width: 900, height: 180, opacity: 0.13 })}
                    <div class="sc-hero-main">
                        <span class="sc-hero-code">${esc(subject.subject_code)}</span>
                        <h1 class="sc-hero-title">${esc(subject.subject_name)}</h1>
                        <div class="sc-hero-chips">
                            ${isArchived ? '<span class="sc-chip sc-chip--archived">Archived</span>' : ''}
                            ${subject.section_name ? `<span class="sc-chip">${esc(subject.section_name)}</span>` : ''}
                            ${subject.schedule ? `<span class="sc-chip">${icon('clock', inl)} ${esc(subject.schedule)}</span>` : ''}
                            ${subject.room ? `<span class="sc-chip">${icon('pin', inl)} ${esc(subject.room)}</span>` : ''}
                            ${subject.instructor_name ? `<span class="sc-chip">${icon('user', inl)} ${esc(subject.instructor_name)}</span>` : ''}
                        </div>
                    </div>
                    <div class="sc-hero-clock" id="sc-hero-clock">
                        <div class="sc-clock-time" id="sc-clock-time">--:--:--</div>
                        <div class="sc-clock-date" id="sc-clock-date">---</div>
                    </div>
                </header>

                ${isArchived ? `
                <div class="sc-archived-notice">
                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>
                    This subject is archived. You can view lesson materials and past quiz results, but cannot submit work or take quizzes.
                </div>` : ''}

                <div class="sc-layout ${focused ? 'sc-layout--work-focus' : ''}">
                    <div class="sc-main">
                        <div class="sc-panel">
                            <nav class="sc-tabs" id="sc-tabs">
                                <button class="sc-tab ${state.tab === 'classwork' ? 'active' : ''}" data-tab="classwork">Classwork</button>
                                <button class="sc-tab ${state.tab === 'people' ? 'active' : ''}" data-tab="people">People</button>
                                <button class="sc-tab ${state.tab === 'gradebook' ? 'active' : ''}" data-tab="gradebook">Grades</button>
                            </nav>
                            <div class="sc-body ${focused ? 'sc-body-focus' : ''}">
                                ${renderMainBody()}
                            </div>
                        </div>
                    </div>
                    ${renderRightRail(focused)}
                </div>
                ${classroomPageFooter()}
            </div>
        `;

        if (focused) {
            bindFocusEvents();
            bindEvents();
            if (state.selectedWork.type === 'lesson') mountLessonEmbed();
        } else {
            bindEvents();
            if (state.tab === 'classwork') {
                announcements.forEach(a => recordContentView('announcement', a.announcement_id));
            }
            if (state.tab === 'gradebook') {
                const host = container.querySelector('#sc-grades-host');
                if (host) mountStudentGrades(host, { subjectId });
            }
        }

        if (clockInterval) clearInterval(clockInterval);
        function tickClock() {
            const timeEl = container.querySelector('#sc-clock-time');
            const dateEl = container.querySelector('#sc-clock-date');
            if (!timeEl) { clearInterval(clockInterval); clockInterval = null; return; }
            const d = new Date();
            timeEl.textContent = [d.getHours(), d.getMinutes(), d.getSeconds()]
                .map(n => String(n).padStart(2, '0')).join(':');
            dateEl.textContent = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
        }
        tickClock();
        clockInterval = setInterval(tickClock, 1000);
    }

    function renderMessageRailCard() {
        const teacherId = teacher?.users_id || '';
        const teacherName = teacher
            ? (teacher.full_name || `${teacher.first_name || ''} ${teacher.last_name || ''}`.trim())
            : (subject.instructor_name || 'Instructor');
        const teacherIni = teacher ? initials(teacher.first_name, teacher.last_name) : '?';

        return `
            <div class="sc-rail-card sc-rail-msg">
                <div class="sc-rail-icon">${icon('messages', { size: 22 })}</div>
                <h3 class="sc-rail-title">Message</h3>
                <p class="sc-rail-desc">Chat privately with your instructor about this classwork.</p>
                ${teacherId ? `
                    <div class="sc-rail-teacher">
                        <div class="sc-avatar sm teacher-av">${teacherIni}</div>
                        <span class="sc-rail-teacher-name">${esc(teacherName)}</span>
                    </div>
                    <button type="button" class="sc-rail-btn primary" id="sc-msg-teacher"
                        data-user-id="${teacherId}" data-user-name="${esc(teacherName)}">
                        Message
                    </button>
                ` : `<p class="sc-rail-muted">No instructor assigned yet.</p>`}
            </div>`;
    }

    function isWorkSubmitted(w) {
        if (!w) return false;
        if (w.type === 'lesson') return w.data.is_completed == 1;
        const status = w.data.quiz_status || 'none';
        return status === 'passed' || status === 'attempted' || status === 'exhausted';
    }

    function isPastDue(w) {
        if (!w?.data?.due_date) return false;
        const due = formatDue(w.data.due_date);
        return !!due?.late;
    }

    function canEditAttachments(w) {
        if (isArchived) return false;
        if (!w || isWorkSubmitted(w) || isPastDue(w)) return false;
        return w.type === 'lesson' || w.type === 'quiz';
    }

    function formatOpensAt(ts) {
        if (!ts) return '';
        const d = new Date(String(ts).replace(' ', 'T'));
        if (Number.isNaN(d.getTime())) return '';
        return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    }

    function renderStudentAttachRow(f, canEdit) {
        const name = f.original_name || f.file_name || 'File';
        const cleanPath = (f.file_path || '').replace(/^\//, '').replace(/^COC-LMS\//i, '').replace(/^COC_LMS\(2\)\//i, '');
        const href = `${BASE_URL}/${cleanPath}`;
        const sub = (name.split('.').pop() || 'File').toUpperCase();
        return `<div class="gc-work-attach-row">
            <a class="gc-work-attach" href="${esc(href)}" target="_blank" rel="noopener">
                <span class="gc-work-attach-icon">${icon('document', { size: 24 })}</span>
                <span class="gc-work-attach-text">
                    <span class="gc-work-attach-name">${esc(name)}</span>
                    <span class="gc-work-attach-sub">${esc(sub)}</span>
                </span>
            </a>
            ${canEdit ? `<button type="button" class="gc-attach-remove" data-file-id="${f.file_id}" aria-label="Remove">&times;</button>` : ''}
        </div>`;
    }

    function renderRightRail(focused = false) {
        if (focused && state.selectedWork) {
            if (state.selectedWork.type === 'announcement') {
                return `<aside class="sc-rail sc-rail--work-focus"><div class="sc-rail-focus-stack"></div></aside>`;
            }
            return renderWorkFocusRailStack(
                renderYourWorkCard(state.selectedWork, true),
                {
                    comments: state.privateComments,
                    userInitials: initials(me.first_name, me.last_name),
                    hint: 'Only you and your instructor can see these.',
                    replyingTo: state.privateReplyTo,
                },
            );
        }

        const myDisplay = getFullName(me);
        const roomSlug = buildClassRoomSlug(subject.subject_code, subjectId);

        return `
            <aside class="sc-rail">
                ${renderMessageRailCard()}

                <div class="sc-rail-card sc-rail-video">
                    <div class="sc-rail-icon">${icon('video', { size: 22 })}</div>
                    <h3 class="sc-rail-title">Online Class</h3>
                    <p class="sc-rail-desc">Join the live class — your LMS name is used automatically.</p>
                    <div class="sc-rail-live">
                        <span class="sc-live-dot"></span> Auto-join with your account
                    </div>
                    <button type="button" class="sc-rail-btn video" id="sc-join-video"
                        data-room="${esc(roomSlug)}">
                        Join Online Class
                    </button>
                    <p class="sc-rail-foot">Join as <strong>${esc(myDisplay)}</strong></p>
                    <p class="sc-rail-foot">Room: ${esc(subject.subject_code)} · Built-in live class</p>
                </div>
            </aside>`;
    }

    function goToMessenger(userId, name, role = '') {
        if (!userId) return;
        openFloatingChat(userId, name || 'Chat', role);
    }

    function showPersonModal(person) {
        container.querySelector('.sc-person-overlay')?.remove();
        const ini = person.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
        const overlay = document.createElement('div');
        overlay.className = 'sc-person-overlay';
        overlay.innerHTML = `
            <div class="sc-person-modal">
                <button type="button" class="sc-person-close" aria-label="Close">&times;</button>
                <div class="sc-person-modal-av ${person.role === 'instructor' ? 'teacher-av' : ''}">${ini}</div>
                <h3 class="sc-person-modal-name">${esc(person.name)}</h3>
                <p class="sc-person-modal-role">${person.role === 'instructor' ? 'Instructor' : esc(person.studentId || 'Classmate')}</p>
                <div class="sc-person-modal-actions">
                    <button type="button" class="sc-rail-btn primary sc-person-msg-btn">
                        <span>${icon('messages', { size: 16 })}</span> Send Message
                    </button>
                    <button type="button" class="sc-rail-btn outline sc-person-close-btn">Cancel</button>
                </div>
            </div>`;
        overlay.querySelector('.sc-person-msg-btn').addEventListener('click', () => {
            overlay.remove();
            goToMessenger(person.id, person.name, person.role);
        });
        overlay.querySelector('.sc-person-close').addEventListener('click', () => overlay.remove());
        overlay.querySelector('.sc-person-close-btn').addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
        container.appendChild(overlay);
    }

    function workStatusLabel(w) {
        if (w.type === 'lesson') {
            return w.data.is_completed == 1 ? { text: 'Submitted', cls: 'done' } : null;
        }
        const status = w.data.quiz_status || 'none';
        if (status === 'passed') return { text: 'Submitted', cls: 'done' };
        if (status === 'attempted' || status === 'exhausted') return { text: 'Submitted', cls: 'done' };
        return null;
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

    function fileHref(filePath) {
        return resolveMaterialUrl(filePath);
    }

    async function recordContentView(contentType, contentId) {
        try {
            await Api.post('/ClassroomAPI.php?action=record-view', {
                subject_id: parseInt(subjectId, 10),
                content_type: contentType,
                content_id: parseInt(contentId, 10),
            });
        } catch (_) { /* non-blocking */ }
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

        const feedInner = !items.length
            ? `<div class="sc-empty sc-empty--inline">
                <div class="sc-empty-icon">${iconLg('folderOpen')}</div>
                <h3>No classwork yet</h3>
                <p>Your teacher hasn't posted any lessons or assessments yet.</p>
            </div>`
            : `<div class="gc-cw-stream">
                ${items.map(classworkRow).join('')}
              </div>`;

        return `
            <div class="sc-cw-layout sc-cw-layout--student">
                <div class="sc-cw-feed">
                    ${feedInner}
                </div>
            </div>`;
    }

    function renderAnnAttachments(atts) {
        if (!atts || !atts.length) return '';
        return `<div class="gc-ann-attachments">${atts.map(a => `
            <a class="gc-ann-attach-chip" href="${resolveMaterialUrl(a.file_path)}" target="_blank" rel="noopener" download="${esc(a.original_name)}" onclick="event.stopPropagation()">
                ${icon('document', inl)}<span>${esc(a.original_name)}</span>
            </a>`).join('')}</div>`;
    }

    function classworkRow(item) {
        const d = item.data;
        const posted = formatPosted(d.created_at || d.updated_at);

        if (item.type === 'announcement') {
            const title = d.title || 'Announcement';
            const rawContent = (d.content || '').replace(/<[^>]+>/g, '');
            const preview = rawContent.length > 200 ? rawContent.slice(0, 200) + '…' : rawContent;
            return `
                <article class="gc-post-card gc-post-card--ann" data-ann-id="${d.announcement_id}">
                    <div class="gc-post-card__row">
                        <div class="gc-post-card__ann-body">
                            <header class="gc-post-card__hdr">
                                <div class="sc-avatar sm teacher-av">${esc(teacherInitials)}</div>
                                <div class="gc-cw-author-text">
                                    <span class="gc-cw-author-name">${esc(teacherName)}</span>
                                    ${posted ? `<span class="gc-cw-posted-time">${esc(posted)}</span>` : ''}
                                </div>
                                <span class="gc-ann-badge">${icon('announce', { size: 13, className: 'ui-icon-inline' })} Announcement</span>
                            </header>
                            <div class="gc-ann-content">
                                <div class="gc-ann-title">${esc(title)}</div>
                                ${preview ? `<p class="gc-ann-preview">${esc(preview)}</p>` : ''}
                                ${renderAnnAttachments(d.attachments)}
                            </div>
                        </div>
                    </div>
                </article>`;
        }

        if (item.type === 'lesson') {
            const locked = d.is_locked == 1;
            const done = d.is_completed == 1;
            const due = formatDue(d.due_date);
            const rowCls = done ? 'done' : locked ? 'locked' : '';
            let right = done
                ? `<span class="gc-cw-status done">${icon('check', inl)} Done</span>`
                : locked
                    ? `<span class="gc-cw-status locked">${icon('lock', inl)} Locked</span>`
                    : '';
            if (due && !done) {
                right = `<span class="gc-cw-due ${due.late ? 'late' : ''}">${due.late ? 'Missing' : 'Due'} ${esc(due.label)}</span>${right}`;
            }
            return renderClassworkPostCard({
                authorName: teacherName,
                authorInitials: teacherInitials,
                posted,
                iconName: 'document',
                title: d.title || d.lesson_title || 'Untitled lesson',
                typeLabel: (d.total_points != null && d.total_points !== '') ? `Activity · ${Number(d.total_points)} pts` : 'Activity',
                rightHtml: right,
                workType: 'lesson',
                workId: d.lessons_id,
                disabled: locked,
                rowClass: rowCls,
            });
        }

        const status = d.quiz_status || 'none';
        const pts = d.total_points != null && d.total_points !== '' ? Number(d.total_points) : null;
        const due = formatDue(d.due_date);
        let right = '';
        if (status === 'scheduled') {
            const opens = formatOpensAt(d.availability_start);
            right = `<span class="gc-cw-status locked">${opens ? `Opens ${esc(opens)}` : 'Scheduled'}</span>`;
        } else if (status === 'passed' || status === 'attempted' || status === 'exhausted') {
            right = `<span class="gc-cw-status done">${icon('check', inl)} Work submitted</span>`;
        }
        if (pts != null) {
            right = `${right}<span class="gc-cw-points">${pts} pts</span>`;
        }
        if (due && status !== 'passed') {
            right = `<span class="gc-cw-due ${due.late ? 'late' : ''}">${due.late ? 'Missing' : 'Due'} ${esc(due.label)}</span>${right}`;
        }
        return renderClassworkPostCard({
            authorName: teacherName,
            authorInitials: teacherInitials,
            posted,
            iconName: 'quiz',
            title: d.quiz_title || 'Untitled quiz',
            typeLabel: `Quiz · ${d.question_count || 0} questions`,
            rightHtml: right,
            workType: 'quiz',
            workId: d.quiz_id,
        });
    }

    function workPoints(w) {
        if (w.type === 'quiz') {
            const pts = w.data.total_points;
            return pts != null && pts !== '' ? Number(pts) : null;
        }
        return null;
    }

    function renderSubmitAction(w) {
        // Archived subject — freeze all submissions; only show past results read-only
        if (isArchived) {
            if (w.type === 'lesson') {
                if (w.data.is_completed == 1) {
                    return `<button type="button" class="gc-submit-btn gc-submit-btn--done" disabled>${icon('checkCircle', inl)} Submitted</button>`;
                }
                return `<button type="button" class="gc-submit-btn gc-submit-btn--frozen" disabled>${icon('archive', inl)} Subject archived</button>`;
            }
            const q = w.data;
            const status = q.quiz_status || 'none';
            const aid = q.best_attempt_id;
            if (status === 'passed' || status === 'attempted' || status === 'exhausted') {
                return `<button type="button" class="gc-submit-btn gc-submit-btn--done" disabled>${icon('checkCircle', inl)} Submitted</button>`
                    + (aid ? `<button type="button" class="gc-submit-btn gc-submit-btn--outline" data-quiz-review="${aid}">${icon('chart', inl)} View result</button>` : '');
            }
            return `<button type="button" class="gc-submit-btn gc-submit-btn--frozen" disabled>${icon('archive', inl)} Subject archived</button>`;
        }

        if (w.type === 'lesson') {
            if (w.data.is_completed == 1) {
                return `<button type="button" class="gc-submit-btn gc-submit-btn--done" disabled>${icon('checkCircle', inl)} Submitted to instructor</button>`;
            }
            if (isPastDue(w)) {
                return `<button type="button" class="gc-submit-btn" disabled>Past due — contact instructor</button>`;
            }
            return `<button type="button" class="gc-submit-btn" id="gc-submit-work">Submit</button>`;
        }

        const q = w.data;
        const status = q.quiz_status || 'none';
        const pastDue = isPastDue(w);
        const canTake = !pastDue && q.is_available !== false && !!q.can_take;
        const attemptsLabel = (q.max_attempts || 0) > 0
            ? `${q.attempts_used || 0}/${q.max_attempts} attempts`
            : (q.attempts_used ? `${q.attempts_used} attempt${q.attempts_used !== 1 ? 's' : ''}` : '');
        if (status === 'passed') {
            const aid = q.best_attempt_id;
            return `<button type="button" class="gc-submit-btn gc-submit-btn--done" disabled>${icon('checkCircle', inl)} Work submitted</button>`
                + (aid ? `<button type="button" class="gc-submit-btn gc-submit-btn--outline" data-quiz-review="${aid}">${icon('chart', inl)} Where I went wrong</button>` : '');
        }
        if (status === 'attempted' || status === 'exhausted') {
            const aid = q.best_attempt_id;
            return `<button type="button" class="gc-submit-btn gc-submit-btn--done" disabled>${icon('checkCircle', inl)} Work submitted</button>`
                + (aid ? `<button type="button" class="gc-submit-btn gc-submit-btn--outline" data-quiz-review="${aid}">${icon('chart', inl)} Where I went wrong</button>` : '');
        }
        if (status === 'exhausted' || (!canTake && q.attempts_remaining === 0 && (q.max_attempts || 0) > 0)) {
            return `<button type="button" class="gc-submit-btn" disabled>No attempts left${attemptsLabel ? ` (${attemptsLabel})` : ''}</button>`;
        }
        if (canTake) {
            return `<a href="#student/take-quiz?quiz_id=${q.quiz_id}" class="gc-submit-btn">${icon('quiz', inl)} Take Quiz${q.attempts_remaining != null ? ` (${q.attempts_remaining} left)` : ''}</a>`;
        }
        if (pastDue && status !== 'passed') {
            return `<button type="button" class="gc-submit-btn" disabled>Past due — contact instructor</button>`;
        }
        const opens = formatOpensAt(q.availability_start);
        return `<button type="button" class="gc-submit-btn" disabled>${opens ? `Opens ${esc(opens)}` : 'Not open yet'}</button>`;
    }

    function renderYourWorkCard(w, forRail = false) {
        const submitted = isWorkSubmitted(w);
        const files = state.studentSubmissions || [];
        const canEdit = canEditAttachments(w);
        const statusLbl = workStatusLabel(w);
        const list = files.length
            ? files.map(f => renderStudentAttachRow(f, canEdit)).join('')
            : `<p class="gc-focus-card-empty">${submitted ? 'No files were attached.' : 'Attach your work before submitting.'}</p>`;
        const addBtn = canEdit ? `
            <label class="gc-add-attach-btn">
                <input type="file" id="gc-student-attach-input" class="gc-student-attach-input" hidden
                    accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.jpg,.jpeg,.png,.gif,.webp,.zip">
                ${icon('plus', inl)} Add attachment
            </label>` : '';

        const wrapTag = forRail ? 'div' : 'section';
        const wrapCls = forRail
            ? 'sc-rail-work-inner'
            : 'gc-focus-card gc-focus-card--student-work';

        if (w.type === 'quiz') {
            const turnedInRaw = sessionStorage.getItem('coc_quiz_turned_in');
            let turnedInNote = '';
            if (turnedInRaw) {
                try {
                    const info = JSON.parse(turnedInRaw);
                    if (String(info.quizId) === String(w.data.quiz_id)) {
                        sessionStorage.removeItem('coc_quiz_turned_in');
                        const raw = info.earned_points != null && info.total_points
                            ? ` — ${info.earned_points}/${info.total_points} pts`
                            : (info.percentage != null ? ` — ${parseFloat(info.percentage).toFixed(0)}%` : '');
                        turnedInNote = `<p class="gc-focus-card-note gc-focus-card-note--success">Quiz submitted${raw}. Your work has been turned in.</p>`;
                    }
                } catch (_) { /* ignore */ }
            }
            const submitted = isWorkSubmitted(w);
            return `
                <${wrapTag} class="${wrapCls}">
                    <div class="gc-focus-card-hdr sc-rail-work-submit">
                        <div class="gc-focus-card-hdr-left">
                            <h3 class="gc-focus-card-title sc-rail-title">${icon('quiz', inl)} Your work</h3>
                            ${statusLbl ? `<span class="gc-work-status ${statusLbl.cls}">${esc(statusLbl.text)}</span>` : ''}
                        </div>
                    </div>
                    ${turnedInNote || (submitted
                        ? `<p class="gc-focus-card-note gc-focus-card-note--muted">Your quiz has been submitted.</p>`
                        : `<p class="gc-focus-card-note gc-focus-card-note--muted">Complete the quiz to turn in your work.</p>`)}
                    <div class="gc-rail-submit-wrap">${renderSubmitAction(w)}</div>
                </${wrapTag}>`;
        }

        const pastNote = isPastDue(w) && !submitted
            ? '<p class="gc-focus-card-note gc-focus-card-note--warn">Past due — you can no longer attach or submit.</p>'
            : '';

        const earnedPts = state.studentSubmissions?.find(f => f.points_earned != null)?.points_earned ?? null;
        const totalPts = w.data.total_points != null && w.data.total_points !== '' ? Number(w.data.total_points) : null;
        const gradeNote = earnedPts != null
            ? `<div class="gc-work-grade-badge">${icon('check', inl)} Grade: <strong>${earnedPts}${totalPts != null ? ' / ' + totalPts : ''} pts</strong></div>`
            : (submitted && totalPts != null ? `<p class="gc-focus-card-note gc-focus-card-note--muted">Pending grade — ${totalPts} pts total.</p>` : '');

        return `
            <${wrapTag} class="${wrapCls}">
                <div class="gc-focus-card-hdr sc-rail-work-submit">
                    <div class="gc-focus-card-hdr-left">
                        <h3 class="gc-focus-card-title sc-rail-title">${icon('document', inl)} Your work</h3>
                        ${statusLbl ? `<span class="gc-work-status ${statusLbl.cls}">${esc(statusLbl.text)}</span>` : ''}
                    </div>
                </div>
                ${gradeNote}
                <div class="gc-work-attach-list" id="gc-student-attach-list">${list}</div>
                ${addBtn}
                <div class="gc-rail-submit-wrap">${renderSubmitAction(w)}</div>
                ${pastNote}
                <p class="gc-focus-card-note gc-focus-card-note--muted">Attach files, then submit when ready.</p>
            </${wrapTag}>`;
    }

    function renderAnnouncementFocus() {
        const w = state.selectedWork;
        const d = w.data;
        const posted = formatPosted(d.created_at || d.updated_at);
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
                        <div class="sc-avatar teacher-av">${esc(teacherInitials)}</div>
                        <div class="gc-cw-author-text">
                            <span class="gc-cw-author-name">${esc(teacherName)}</span>
                            ${posted ? `<span class="gc-cw-posted-time">${esc(posted)}</span>` : ''}
                        </div>
                    </div>
                    <div class="gc-assign-head">
                        <div class="gc-assign-icon">${icon('announce', { size: 28 })}</div>
                        <div class="gc-assign-head-text">
                            <h1 class="gc-detail-title">${esc(d.title || 'Announcement')}</h1>
                            <p class="gc-detail-type">Announcement</p>
                        </div>
                    </div>
                    <div class="gc-ann-full-body">${esc(d.content || '')}</div>
                    ${renderAnnAttachments(d.attachments)}
                    <section class="gc-focus-card gc-focus-card--comments">
                        <h3 class="gc-focus-card-title">${icon('messages', inl)} Class comments</h3>
                        ${commentSection('work')}
                    </section>
                </div>
            </div>`;
    }

    function renderWorkFocus() {
        const w = state.selectedWork;
        if (!w) return '';
        if (w.type === 'announcement') return renderAnnouncementFocus();

        const posted = formatPosted(w.data.created_at || w.data.updated_at);
        const title = w.type === 'lesson'
            ? (w.data.title || w.data.lesson_title || 'Untitled lesson')
            : (w.data.quiz_title || 'Untitled quiz');
        const lessonTotalPts = w.type === 'lesson' && w.data.total_points != null && w.data.total_points !== ''
            ? Number(w.data.total_points) : null;
        const typeLabel = w.type === 'lesson'
            ? (lessonTotalPts != null ? `Activity · ${lessonTotalPts} pts` : 'Activity')
            : 'Quiz assignment';
        const description = w.type === 'quiz' ? (w.data.quiz_description || '') : '';
        const points = workPoints(w);
        const due = formatDue(w.data.due_date);

        const quizMeta = w.type === 'quiz' ? `
            <p class="gc-instructions-extra">
                ${w.data.question_count || 0} questions ·
                ${w.data.time_limit ? `${w.data.time_limit} min` : 'No time limit'} ·
                Pass ${w.data.passing_rate || 0}%
                ${(w.data.max_attempts || 0) > 0 ? ` · ${w.data.max_attempts} attempt${w.data.max_attempts !== 1 ? 's' : ''} allowed` : ' · Unlimited attempts'}
                ${w.data.earned_points != null && w.data.total_points != null
                    ? ` · Score ${parseFloat(w.data.earned_points)}/${parseFloat(w.data.total_points)} pts`
                    : (w.data.best_score != null ? ` · Best ${parseFloat(w.data.best_score).toFixed(0)}%` : '')}
            </p>` : '';

        const lessonHost = w.type === 'lesson'
            ? `<div id="sc-lesson-host" class="gc-lesson-host"><div class="sc-lesson-loading">Loading…</div></div>`
            : '';

        const materials = state.workMaterials || [];
        const materialsBlock = w.type === 'lesson' && materials.length ? `
            <div class="gc-focus-card gc-focus-card--materials">
                <h3 class="gc-focus-card-title">Attached files</h3>
                <div class="gc-material-list">${materials.map(renderMaterialAttachment).join('')}</div>
            </div>` : '';

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
                        <div class="sc-avatar teacher-av">${esc(teacherInitials)}</div>
                        <div class="gc-cw-author-text">
                            <span class="gc-cw-author-name">${esc(teacherName)}</span>
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

                    <div class="gc-points-due-row">
                        <span class="gc-points">${points != null ? `${points} points` : 'Ungraded'}</span>
                        ${due ? `<span class="gc-due ${due.late ? 'late' : ''}">${due.late ? 'Missing' : 'Due'} ${esc(due.label)}</span>` : '<span></span>'}
                    </div>

                    ${description ? `<div class="gc-instructions-body">${esc(description)}</div>` : ''}
                    ${quizMeta}
                    ${materialsBlock}
                    ${lessonHost}

                    <section class="gc-focus-card gc-focus-card--comments">
                        <h3 class="gc-focus-card-title">${icon('messages', inl)} Class comments</h3>
                        ${commentSection('work')}
                    </section>
                </div>
            </div>`;
    }

    function renderPeople() {
        const teacherInitials = teacher ? initials(teacher.first_name, teacher.last_name) : '?';
        const teacherName = teacher
            ? (teacher.full_name || `${teacher.first_name} ${teacher.last_name}`)
            : (subject.instructor_name || 'Instructor TBA');

        const teacherId = teacher?.users_id || '';

        return `
            <div class="sc-people-grid">
                <section class="sc-people-card sc-teacher-card">
                    <h3 class="sc-section-title">Teacher</h3>
                    ${teacherId ? `
                    <button type="button" class="sc-person-block sc-person-click"
                        data-person-id="${teacherId}"
                        data-person-name="${esc(teacherName)}"
                        data-person-role="instructor">
                        <div class="sc-avatar lg teacher-av">${teacherInitials}</div>
                        <div class="sc-person-info">
                            <div class="sc-person-name">${esc(teacherName)}</div>
                            <div class="sc-person-role">Instructor · Tap to message</div>
                            ${teacher?.email ? `<div class="sc-person-email">${esc(teacher.email)}</div>` : ''}
                        </div>
                        <span class="sc-person-chevron">›</span>
                    </button>` : `
                    <div class="sc-person-block">
                        <div class="sc-avatar lg teacher-av">?</div>
                        <div class="sc-person-info">
                            <div class="sc-person-name">${esc(teacherName)}</div>
                            <div class="sc-person-role">Instructor</div>
                        </div>
                    </div>`}
                </section>

                <section class="sc-people-card sc-classmates-card">
                    <h3 class="sc-section-title">Classmates <span class="sc-badge-count">${classmates.length}</span></h3>
                    <p class="sc-people-hint">Tap a classmate to send a message</p>
                    ${classmates.length === 0
                        ? `<p class="sc-muted">No classmates in this section yet.</p>`
                        : `<div class="sc-mates-grid">
                            ${classmates.map(c => {
                                const name = c.full_name || `${c.first_name} ${c.last_name}`;
                                if (c.is_me == 1) {
                                    return `<div class="sc-mate is-me">
                                        <div class="sc-avatar">${initials(c.first_name, c.last_name)}</div>
                                        <div class="sc-mate-info">
                                            <span class="sc-mate-name">${esc(name)}</span>
                                            <span class="sc-you">You</span>
                                            <span class="sc-mate-id">${esc(c.student_id || 'Student')}</span>
                                        </div>
                                    </div>`;
                                }
                                return `<button type="button" class="sc-mate sc-mate-click"
                                    data-person-id="${c.users_id}"
                                    data-person-name="${esc(name)}"
                                    data-person-role="student"
                                    data-person-student-id="${esc(c.student_id || '')}">
                                    <div class="sc-avatar">${initials(c.first_name, c.last_name)}</div>
                                    <div class="sc-mate-info">
                                        <span class="sc-mate-name">${esc(name)}</span>
                                        <span class="sc-mate-id">${esc(c.student_id || 'Student')}</span>
                                    </div>
                                    <span class="sc-person-chevron">›</span>
                                </button>`;
                            }).join('')}
                           </div>`
                    }
                </section>
            </div>`;
    }

    function commentSection(scope, opts = {}) {
        const comments = state.workComments;
        const inputId  = 'sc-work-input';
        const btnId    = 'sc-work-post';
        const listId   = 'sc-work-comments';
        const gcStyle  = !!opts.composeBottom;

        const compose = `
            <div class="sc-comment-compose ${gcStyle ? 'sc-comment-compose--inline' : ''}">
                <div class="sc-avatar sm">${initials(me.first_name, me.last_name)}</div>
                <div class="sc-comment-input-wrap">
                    <textarea id="${inputId}" class="sc-comment-input" placeholder="Add class comment…" rows="1"></textarea>
                    ${gcStyle
                        ? `<button type="button" id="${btnId}" class="gc-send-btn" aria-label="Post">${icon('messages', { size: 18 })}</button>`
                        : `<button type="button" id="${btnId}" class="sc-comment-btn">Post</button>`}
                </div>
            </div>`;

        const list = `
            <div class="sc-comment-list" id="${listId}">
                ${comments.length
                    ? comments.map(c => commentRow(c)).join('')
                    : (gcStyle ? '' : `<p class="sc-comment-empty">No comments yet. Be the first to comment.</p>`)
                }
            </div>`;

        return `
            <div class="sc-comments ${gcStyle ? 'sc-comments--gc' : ''}" data-scope="${scope}">
                ${gcStyle ? list + compose : compose + list}
            </div>`;
    }

    function commentRow(c) {
        const date = c.created_at
            ? new Date(c.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
            : '';
        const roleLabel = c.role === 'instructor' ? 'Teacher' : c.role === 'admin' ? 'Admin' : '';
        return `
            <div class="sc-comment ${c.is_mine == 1 ? 'mine' : ''}">
                <div class="sc-avatar sm">${initials(c.first_name, c.last_name)}</div>
                <div class="sc-comment-body">
                    <div class="sc-comment-head">
                        <span class="sc-comment-author">${esc(c.author_name || (c.first_name + ' ' + c.last_name))}</span>
                        ${roleLabel ? `<span class="sc-comment-role">${roleLabel}</span>` : ''}
                        <span class="sc-comment-date">${esc(date)}</span>
                    </div>
                    <p class="sc-comment-text">${esc(c.content)}</p>
                </div>
            </div>`;
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

    async function loadStudentSubmissions(lessonsId, quizId) {
        let url = '/ClassroomAPI.php?action=submissions&subject_id=' + subjectId;
        if (lessonsId) url += '&lessons_id=' + lessonsId;
        else if (quizId) url += '&quiz_id=' + quizId;
        else {
            state.studentSubmissions = [];
            return;
        }
        const res = await Api.get(url);
        state.studentSubmissions = res.success ? res.data : [];
    }

    async function loadWorkMaterials(lessonsId) {
        const res = await Api.get(`/LessonsAPI.php?action=materials&lessons_id=${lessonsId}`);
        state.workMaterials = res.success ? (res.data || []) : [];
    }

    async function loadFocusData() {
        const w = state.selectedWork;
        if (!w) return;

        state.workMaterials = [];
        state.studentSubmissions = [];
        if (w.type === 'lesson') {
            const res = await Api.get('/LessonsAPI.php?action=get&lessons_id=' + w.id);
            await Promise.all([
                loadWorkComments(w.id, null),
                loadWorkMaterials(w.id),
                loadStudentSubmissions(w.id, null),
            ]);
            if (res.success) {
                const lesson = res.data.lesson || {};
                w.data = {
                    ...w.data,
                    description: lesson.lesson_description || w.data.description,
                    lesson_description: lesson.lesson_description || w.data.lesson_description,
                    due_date: lesson.due_date || w.data.due_date,
                    is_completed: res.data.is_completed ? 1 : 0,
                };
            }
        } else {
            const res = await Api.get('/QuizzesAPI.php?action=get&id=' + w.id);
            if (res.success) {
                w.data = { ...w.data, ...res.data };
            }
            await Promise.all([
                loadWorkComments(null, w.id),
                loadStudentSubmissions(null, w.id),
            ]);
        }
    }

    async function uploadStudentFile(file) {
        const w = state.selectedWork;
        if (!w || !canEditAttachments(w)) return;
        const fd = new FormData();
        fd.append('file', file);
        fd.append('subject_id', subjectId);
        if (w.type === 'lesson') fd.append('lessons_id', w.id);
        else if (w.type === 'quiz') fd.append('quiz_id', w.id);
        const res = await Api.postForm('/ClassroomAPI.php?action=upload-submission', fd);
        if (!res.success) {
            notify.error(res.message || 'Upload failed');
            return;
        }
        state.studentSubmissions.push(res.data);
        renderPage();
        if (state.selectedWork?.type === 'lesson') mountLessonEmbed();
    }

    async function removeStudentFile(fileId) {
        const res = await Api.post('/ClassroomAPI.php?action=delete-submission', { file_id: fileId });
        if (!res.success) {
            notify.error(res.message || 'Could not remove file');
            return;
        }
        state.studentSubmissions = state.studentSubmissions.filter(f => String(f.file_id) !== String(fileId));
        renderPage();
        if (state.selectedWork?.type === 'lesson') mountLessonEmbed();
    }

    async function mountLessonEmbed() {
        const host = container.querySelector('#sc-lesson-host');
        if (!host || state.selectedWork?.type !== 'lesson') return;

        const lessonId = state.selectedWork.id;
        await renderEmbedded(host, lessonId, {
            focus: true,
            hideMaterials: false,
            hideActions: true,
            hideHeader: true,
            onSelectLesson: (lid) => openWork('lesson', lid),
            onComplete: async (lid) => {
                const listRes = await Api.get('/LessonsAPI.php?action=list&subject_id=' + subject.subject_offered_id);
                if (listRes.success) {
                    listRes.data.forEach(nl => {
                        const j = lessons.findIndex(l => String(l.lessons_id) === String(nl.lessons_id));
                        if (j >= 0) lessons[j] = nl;
                    });
                }
                openWork('lesson', lid);
            },
        });
    }

    async function openWork(type, id) {
        if (renderGen !== activeRenderGen) return;
        recordContentView(type, id);
        state.privateReplyTo = null;
        if (type === 'lesson') {
            const lesson = lessons.find(l => String(l.lessons_id) === String(id));
            if (!lesson || lesson.is_locked == 1) return;
            state.tab = 'classwork';
            state.selectedWork = { type: 'lesson', id, data: lesson };
            setAssistantContext({
                page: 'classwork-lesson',
                lessons_id: parseInt(id, 10),
                quiz_id: null,
                subject_id: parseInt(subjectId, 10),
                subject_name: subject.subject_name || '',
                subject_code: subject.subject_code || '',
                work_title: lesson.lesson_title || lesson.title || 'Lesson',
                highlighted_text: '',
            });
            await loadFocusData();
            if (renderGen !== activeRenderGen) return;
            syncHashQuiet(subjectHash(subjectId, 'classwork', { type, id }));
            renderPage();
            return;
        }

        const quiz = quizzes.find(q => String(q.quiz_id) === String(id));
        if (!quiz) return;
        state.tab = 'classwork';
        state.selectedWork = { type: 'quiz', id, data: quiz };
        setAssistantContext({
            page: 'classwork-quiz',
            lessons_id: null,
            quiz_id: parseInt(id, 10),
            subject_id: parseInt(subjectId, 10),
            subject_name: subject.subject_name || '',
            subject_code: subject.subject_code || '',
            work_title: quiz.quiz_title || 'Quiz',
            highlighted_text: '',
        });
        await loadFocusData();
        if (renderGen !== activeRenderGen) return;
        syncHashQuiet(subjectHash(subjectId, 'classwork', { type, id }));
        renderPage();
    }

    async function postComment(scope, text, isPrivate = false) {
        const payload = { subject_id: parseInt(subjectId, 10), content: text, is_private: isPrivate };
        if (scope === 'work' && state.selectedWork) {
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
            renderPage();
            if (state.selectedWork?.type === 'lesson') mountLessonEmbed();
            return;
        }

        state.workComments.push(res.data);
        const list = container.querySelector('#sc-work-comments');
        if (list) {
            const empty = list.querySelector('.sc-comment-empty');
            if (empty) empty.remove();
            list.insertAdjacentHTML('beforeend', commentRow(res.data));
        }
        const input = container.querySelector('#sc-work-input');
        if (input) input.value = '';
    }

    function bindPrivateRail() {
        const rail = container.querySelector('.sc-rail--work-focus');
        bindPrivateCommentRail(rail, {
            onReply: (target) => {
                state.privateReplyTo = target;
                renderPage();
                if (state.selectedWork?.type === 'lesson') mountLessonEmbed();
                container.querySelector('#sc-private-input')?.focus();
            },
            onCancelReply: () => {
                state.privateReplyTo = null;
                renderPage();
                if (state.selectedWork?.type === 'lesson') mountLessonEmbed();
            },
        });
    }

    function bindCommentEvents() {
        container.querySelector('#sc-work-post')?.addEventListener('click', () => {
            const text = container.querySelector('#sc-work-input')?.value?.trim();
            if (text) postComment('work', text, false);
        });
        container.querySelector('#sc-private-post')?.addEventListener('click', () => {
            const text = container.querySelector('#sc-private-input')?.value?.trim();
            if (text) postComment('work', text, true);
        });
    }

    function bindFocusEvents() {
        container.querySelector('#sc-back-cw')?.addEventListener('click', () => {
            state.selectedWork = null;
            state.workComments = [];
            state.privateComments = [];
            state.privateReplyTo = null;
            state.workMaterials = [];
            state.studentSubmissions = [];
            clearAssistantContext();
            syncHashQuiet(subjectHash(subjectId, 'classwork'));
            renderPage();
        });
        container.querySelector('#gc-student-attach-input')?.addEventListener('change', async (e) => {
            const input = e.target;
            const file = input.files?.[0];
            if (!file) return;
            input.value = '';
            await uploadStudentFile(file);
        });
        container.querySelectorAll('.gc-attach-remove').forEach(btn => {
            btn.addEventListener('click', () => removeStudentFile(btn.dataset.fileId));
        });
        container.querySelector('#gc-submit-work')?.addEventListener('click', async (e) => {
            if (e.currentTarget.tagName === 'A') return;
            const w = state.selectedWork;
            if (!w || w.type !== 'lesson') return;
            const res = await Api.post('/ClassroomAPI.php?action=submit-work', {
                subject_id: parseInt(subjectId, 10),
                lessons_id: w.id,
            });
            if (!res.success) {
                notify.error(res.message || 'Could not submit work');
                return;
            }
            const lesson = lessons.find(l => String(l.lessons_id) === String(w.id));
            if (lesson) lesson.is_completed = 1;
            if (w.data) w.data.is_completed = 1;
            state.studentSubmissions = state.studentSubmissions.map(f => ({
                ...f, is_submitted: 1,
            }));
            renderPage();
            if (state.selectedWork?.type === 'lesson') mountLessonEmbed();
        });
        bindCommentEvents();
        bindPrivateRail();
        bindMaterialAttachments(container);
    }

    function bindEvents() {
        container.querySelectorAll('.sc-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const nextTab = tab.dataset.tab;
                if (state.tab === nextTab && !state.selectedWork) return;
                state.tab = nextTab;
                state.selectedWork = null;
                state.workComments = [];
                state.privateComments = [];
                state.privateReplyTo = null;
                state.workMaterials = [];
                state.studentSubmissions = [];
                if (nextTab !== 'classwork') clearAssistantContext();
                syncHashQuiet(subjectHash(subjectId, nextTab));
                renderPage();
            });
        });

        container.querySelectorAll('.gc-post-card__btn[data-work]').forEach(btn => {
            btn.addEventListener('click', () => {
                openWork(btn.dataset.work, btn.dataset.id);
            });
        });

        container.querySelectorAll('.gc-post-card--ann[data-ann-id]').forEach(card => {
            card.style.cursor = 'pointer';
            card.addEventListener('click', () => {
                const d = announcements.find(a => String(a.announcement_id) === card.dataset.annId);
                if (!d) return;
                state.tab = 'classwork';
                state.selectedWork = { type: 'announcement', id: card.dataset.annId, data: d };
                state.workComments = [];
                state.privateComments = [];
                state.privateReplyTo = null;
                renderPage();
            });
        });

        if (!state.selectedWork) bindCommentEvents();

        container.querySelector('#sc-msg-teacher')?.addEventListener('click', (e) => {
            const btn = e.currentTarget;
            goToMessenger(btn.dataset.userId, btn.dataset.userName, 'instructor');
        });

        container.querySelector('#sc-join-video')?.addEventListener('click', (e) => {
            const btn = e.currentTarget;
            openOnlineClass({
                room: btn.dataset.room,
                subjectId: subject.subject_id,
                subjectName: subject.subject_name,
                subjectCode: subject.subject_code,
                user: me,
            });
        });

        container.querySelectorAll('[data-person-id]').forEach(el => {
            el.addEventListener('click', () => {
                showPersonModal({
                    id: el.dataset.personId,
                    name: el.dataset.personName,
                    role: el.dataset.personRole,
                    studentId: el.dataset.personStudentId || '',
                });
            });
        });

        bindQuizReviewTriggers(container);
    }

    const workType = params?.work || hashParams.get('work');
    const workId = params?.work_id || hashParams.get('work_id');
    if (workType && workId && state.tab === 'classwork') {
        if (workType === 'lesson') {
            const lesson = lessons.find(l => String(l.lessons_id) === String(workId));
            if (lesson && lesson.is_locked != 1) {
                state.selectedWork = { type: 'lesson', id: workId, data: lesson };
            }
        } else if (workType === 'quiz') {
            const quiz = quizzes.find(q => String(q.quiz_id) === String(workId));
            if (quiz) state.selectedWork = { type: 'quiz', id: workId, data: quiz };
        }
    }

    try {
        if (state.selectedWork) await loadFocusData();
        if (renderGen !== activeRenderGen) return;
        renderPage();
    } catch (err) {
        console.error('Subject page error:', err);
        if (renderGen !== activeRenderGen) return;
        container.innerHTML = emptyMsg(
            err.message || 'Could not load this subject.',
            '#student/my-subjects',
            'Back to My Subjects'
        );
        return;
    }

    container.style.background = '#fff';
    const pageContent = container.closest('.page-content');
    if (pageContent) pageContent.style.background = '#fff';
}

function studentClassworkCss() {
    return `
.sc-student-class .sc-cw-layout--student { display:block; }
.sc-student-class .sc-cw-feed { min-width:0; }
.sc-student-class .gc-cw-right { flex-direction:row; align-items:center; gap:8px; flex-wrap:wrap; justify-content:flex-end; }
.sc-student-class .gc-cw-status:not(.done):not(.locked) { color:#B45309; background:#FEF3C7; padding:2px 8px; border-radius:10px; font-size:11px; }
.sc-student-class .gc-cw-status.done { color:#137333; background:#E6F4EA; padding:2px 8px; border-radius:10px; font-size:11px; }
.sc-student-class .gc-cw-status.locked { color:#5F6368; background:#F1F3F4; padding:2px 8px; border-radius:10px; font-size:11px; }
.sc-student-class .gc-cw-card-author--detail { display:flex; align-items:center; gap:12px; padding:0 0 8px; }
.sc-student-class .gc-cw-card-author--detail .sc-avatar { width:40px; height:40px; font-size:14px; }
.sc-student-class .gc-cw-author-text { display:flex; flex-direction:column; gap:2px; min-width:0; }
.sc-student-class .gc-cw-author-name { font-size:14px; font-weight:600; color:#202124; }
.sc-student-class .gc-cw-posted-time { font-size:12px; color:#5F6368; }
.sc-student-class .gc-unified-work-card { display:flex; flex-direction:column; gap:16px; }
.sc-student-class .gc-focus-card {
    border:1px solid #E8EAED; border-radius:12px; padding:16px 18px; background:#fff;
    box-shadow:0 2px 10px rgba(0,0,0,.08);
}
.sc-student-class .gc-focus-card-title { font-size:14px; font-weight:700; color:#202124; margin:0 0 12px; display:flex; align-items:center; gap:6px; }
.sc-student-class .gc-focus-card-hdr { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:12px; }
.sc-student-class .gc-focus-card-hdr--actions { align-items:flex-start; }
.sc-student-class .gc-focus-card-hdr-left { display:flex; flex-direction:column; gap:4px; min-width:0; }
.sc-student-class .gc-focus-card-submit { margin-left:auto; flex-shrink:0; }
.sc-student-class .gc-focus-card-hdr .gc-focus-card-title { margin:0; }
.sc-student-class .gc-focus-card-empty { font-size:13px; color:#9AA0A6; margin:0; font-style:italic; }
.sc-student-class .gc-focus-card-note { font-size:12px; color:#5F6368; margin:12px 0 0; }
.sc-student-class .gc-focus-card-note--muted { font-style:italic; }
.sc-student-class .gc-ann-full-body {
    font-size:14px; line-height:1.8; color:#374151;
    white-space:pre-wrap; word-break:break-word;
    padding:4px 0 8px;
}
.sc-student-class .gc-work-grade-badge {
    display:flex; align-items:center; gap:6px; padding:10px 14px;
    border-radius:8px; background:#E6F4EA; border:1px solid #b7dfbe;
    color:#137333; font-size:13px; font-weight:600; margin-bottom:10px;
}
.sc-student-class .gc-focus-card-note--success { color:#137333; font-weight:600; }
.sc-student-class .gc-attach-tiles { display:grid; grid-template-columns:repeat(auto-fill,minmax(140px,1fr)); gap:12px; }
.sc-student-class .gc-attach-tile {
    display:flex; flex-direction:column; align-items:center; gap:6px; padding:14px 10px;
    border:1px solid #DADCE0; border-radius:10px; background:#fff; text-decoration:none; color:inherit;
    transition:border-color .12s, background .12s;
}
.sc-student-class .gc-attach-tile:hover { border-color:#00461B; background:#F8FDF9; }
.sc-student-class .gc-tile-name { font-size:12px; font-weight:600; color:#202124; text-align:center; word-break:break-word; }
.sc-student-class .gc-tile-ext { font-size:10px; color:#5F6368; }
.sc-student-class .gc-work-attach-list { display:flex; flex-direction:column; gap:8px; margin-bottom:12px; }
.sc-student-class .gc-focus-card-submit .gc-submit-btn {
    display:inline-flex; align-items:center; justify-content:center; gap:6px;
    padding:8px 18px; border-radius:8px; border:none; background:#00461B; color:#fff;
    font-size:13px; font-weight:600; cursor:pointer; text-decoration:none; font-family:inherit;
    width:auto; min-width:96px;
}
.sc-student-class .gc-submit-btn:hover { background:#003314; color:#fff; }
.sc-student-class .gc-submit-btn:disabled { opacity:.6; cursor:not-allowed; }
.sc-student-class .gc-submit-btn--done { background:#E6F4EA; color:#137333; }
.sc-student-class .gc-submit-btn--outline { background:#fff; color:#00461B; border:1px solid #00461B; }
.sc-student-class .gc-submit-btn--frozen { background:#F1F3F4; color:#5F6368; border:1px solid #E0E0E0; }
.sc-student-class .gc-work-status.done { color:#137333; background:#E6F4EA; padding:2px 8px; border-radius:10px; font-size:11px; font-weight:600; }
.sc-student-class .sc-empty--inline { padding:40px 20px; }
.sc-hero-clock {
    display:flex; flex-direction:column; align-items:center; justify-content:center;
    padding:10px 24px; border-radius:16px;
    background:#111; border:1px solid #111;
    min-width:210px; text-align:center;
}
.sc-clock-time {
    font-family:'Courier New', Courier, monospace;
    font-size:38px; font-weight:800;
    color:#fff; letter-spacing:4px; line-height:1;
    font-variant-numeric:tabular-nums;
    text-shadow:0 2px 10px rgba(0,0,0,0.35);
}
.sc-clock-date {
    font-size:10.5px; font-weight:600;
    color:rgba(255,255,255,0.88);
    letter-spacing:1.5px; text-transform:uppercase;
    margin-top:6px; line-height:1;
}
.sc-chip--archived {
    display:inline-flex; align-items:center; gap:4px;
    background:#111; color:#fff; font-size:11px; font-weight:600;
    padding:3px 9px; border-radius:10px; letter-spacing:.3px;
}
.sc-archived-notice {
    display:flex; align-items:flex-start; gap:10px;
    background:#FEF3C7; border:1px solid #FCD34D; border-radius:8px;
    padding:12px 16px; margin:0 16px 12px; font-size:13px; color:#92400E; line-height:1.5;
}
.sc-archived-notice svg { flex-shrink:0; margin-top:2px; stroke:#B45309; }
.sc-student-class .gc-post-card--ann { border-left: 4px solid #D1D5DB; border-right: 4px solid #D1D5DB; border-top: none; border-bottom: none; }
.sc-student-class .gc-post-card__ann-body { flex: 1; min-width: 0; padding: 14px 16px; }
.sc-student-class .gc-post-card--ann .gc-post-card__hdr { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.sc-student-class .gc-ann-badge { margin-left: auto; font-size: 11px; font-weight: 700; color: var(--subj, #00461B); background: var(--subj-soft, #E8F5EC); border: 1px solid var(--subj-light, #bbf7d0); border-radius: 20px; padding: 3px 10px; white-space: nowrap; flex-shrink: 0; }
.sc-student-class .gc-ann-content { padding: 0 2px; }
.sc-student-class .gc-ann-title { font-size: 15px; font-weight: 700; color: #111827; margin-bottom: 6px; line-height: 1.3; }
.sc-student-class .gc-ann-preview { font-size: 13.5px; color: #374151; line-height: 1.6; margin: 0 0 6px; white-space: pre-wrap; word-break: break-word; }
.gc-ann-attachments { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0; }
.gc-ann-attach-chip {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 6px 12px; border: 1px solid #E5E7EB; border-radius: 20px;
    background: #F9FAFB; color: #374151; font-size: 12.5px; font-weight: 600;
    text-decoration: none; max-width: 220px;
}
.gc-ann-attach-chip span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.gc-ann-attach-chip:hover { background: #E8F5EC; border-color: #A7D4B5; color: #00461B; }
`;
}


