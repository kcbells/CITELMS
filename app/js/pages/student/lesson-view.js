/**
 * Student Lesson View (SPA)
 * Full lesson content with materials, video embeds, nav, and mark complete
 */
import { Api } from '../../api.js';
import { icon } from '../../utils/icons.js';
import {
    renderMaterialAttachment, bindMaterialAttachments, materialAttachmentCss,
} from '../../utils/material-files.js';
import { setAssistantContext } from '../../utils/assistant-context.js';

const inl = { size: 14, className: 'ui-icon-inline' };

export async function render(container, params) {
    const lessonId = params?.id || new URLSearchParams(window.location.hash.split('?')[1] || '').get('id');
    if (!lessonId) {
        container.innerHTML = '<div style="text-align:center;padding:60px;color:#737373">No lesson selected. <a href="#student/lessons" style="color:#1B4D3E">Go to Lessons</a></div>';
        return;
    }
    container.innerHTML = `<style>${getStyles()}</style><div class="lv-wrap"><div style="text-align:center;padding:60px;color:#737373">Loading lesson...</div></div>`;
    const bundle = await loadLessonBundle(lessonId);
    if (bundle.error) {
        container.innerHTML = `<style>${getStyles()}</style><div class="lv-wrap"><div style="text-align:center;padding:60px;color:#737373">${esc(bundle.error)}. <a href="#student/lessons" style="color:#1B4D3E">Go to Lessons</a></div></div>`;
        return;
    }
    paintLesson(container, lessonId, bundle, false);
}

/** Embed full lesson inside subject classwork (no page navigation) */
export async function renderEmbedded(container, lessonId, hooks = {}) {
    container.innerHTML = `<div style="text-align:center;padding:40px;color:#737373">Loading lesson...</div>`;
    const bundle = await loadLessonBundle(lessonId);
    if (bundle.error) {
        container.innerHTML = `<div style="text-align:center;padding:40px;color:#737373">${esc(bundle.error)}</div>`;
        return;
    }
    paintLesson(container, lessonId, bundle, true, hooks);
}

export function getLessonStyles() { return getStyles(); }

async function loadLessonBundle(lessonId) {
    const res = await Api.get('/LessonsAPI.php?action=get&lessons_id=' + lessonId);
    if (!res.success) return { error: res.message || 'Failed to load lesson' };

    const d = res.data;
    const lesson = d.lesson;
    const allLessons = d.all_lessons || [];
    const materials = d.materials || [];
    const completedCount = allLessons.filter(l => l.is_completed == 1).length;
    const videoLinks = materials.filter(m => m.material_type === 'link' && (m.file_type === 'youtube' || m.file_type === 'vimeo'));
    const otherMaterials = materials.filter(m => !(m.material_type === 'link' && (m.file_type === 'youtube' || m.file_type === 'vimeo')));

    let linkedQuizzes = [];
    try {
        const qRes = await Api.get('/QuizzesAPI.php?action=by-lesson&lesson_id=' + lessonId);
        if (qRes.success) linkedQuizzes = qRes.data || [];
    } catch (_) { /* non-fatal */ }

    return { d, lesson, allLessons, completedCount, videoLinks, otherMaterials, linkedQuizzes };
}

function paintLesson(container, lessonId, bundle, embedded, hooks = {}) {
    const { d, lesson, allLessons, completedCount, videoLinks, otherMaterials, linkedQuizzes } = bundle;
    const body = !d.prerequisite_met
        ? renderLocked(d.prerequisite_lesson, embedded)
        : renderContent(lesson, d, allLessons, completedCount, videoLinks, otherMaterials, linkedQuizzes, embedded, hooks);

    if (embedded) {
        container.innerHTML = `<div class="lv-wrap lv-embedded${hooks.focus ? ' lv-focus' : ''}">${body}</div>`;
    } else {
        container.innerHTML = `
            <style>${getStyles()}</style>
            <div class="lv-wrap">
                <a href="#student/lessons?subject_id=${lesson.subject_offered_id || ''}" class="back-link">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                    Back to ${esc(lesson.subject_code)} Lessons
                </a>
                ${body}
            </div>`;
    }

    if (d.prerequisite_met) {
        bindEvents(container, lessonId, d, hooks);
        setAssistantContext({
            page: embedded ? 'classwork-lesson' : 'lesson',
            lessons_id: parseInt(lessonId, 10),
            work_title: lesson.lesson_title || lesson.title || 'Lesson',
            subject_id: lesson.subject_id,
            subject_name: lesson.subject_name || '',
            subject_code: lesson.subject_code || '',
            highlighted_text: '',
        });
        bindLessonAiHighlight(container, lesson, parseInt(lessonId, 10));
    } else if (embedded) {
        bindLessonNav(container, hooks);
    }
}

function renderLocked(prereq, embedded = false) {
    const goBtn = prereq
        ? (embedded
            ? `<button type="button" class="btn-primary" data-lesson-nav="${prereq.lessons_id}">
                Go to Required Lesson
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
               </button>`
            : `<a href="#student/lesson-view?id=${prereq.lessons_id}" class="btn-primary">
                Go to Required Lesson
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
               </a>`)
        : '';
    return `
        <div class="locked-box">
            <div class="locked-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
            </div>
            <h2>Lesson Locked</h2>
            <p>Complete "<strong>${esc(prereq?.lesson_title || 'Previous lesson')}</strong>" first</p>
            ${goBtn}
        </div>`;
}

function renderContent(lesson, d, allLessons, completedCount, videoLinks, otherMaterials, linkedQuizzes = [], embedded = false, hooks = {}) {
    const hideMaterials = !!hooks.hideMaterials;
    const hideActions = !!hooks.hideActions;
    const hideHeader = !!hooks.hideHeader;
    const focus = !!hooks.focus;
    return `
        <div class="lesson-layout">
            <!-- Sidebar -->
            <aside class="lesson-sidebar">
                <div class="sidebar-header">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
                    </svg>
                    <span>Lessons</span>
                    <span class="count">${completedCount}/${allLessons.length}</span>
                </div>
                <div class="sidebar-list">
                    ${allLessons.map(item => embedded
                        ? `<button type="button" data-lesson-nav="${item.lessons_id}" class="sidebar-item ${item.lessons_id == lesson.lessons_id ? 'active' : ''} ${item.is_completed == 1 ? 'completed' : ''}">
                            <span class="item-num">
                                ${item.is_completed == 1
                                    ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg>'
                                    : item.order_number}
                            </span>
                            <span class="item-title">${esc(item.title)}</span>
                           </button>`
                        : `<a href="#student/lesson-view?id=${item.lessons_id}" class="sidebar-item ${item.lessons_id == lesson.lessons_id ? 'active' : ''} ${item.is_completed == 1 ? 'completed' : ''}">
                            <span class="item-num">
                                ${item.is_completed == 1
                                    ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg>'
                                    : item.order_number}
                            </span>
                            <span class="item-title">${esc(item.title)}</span>
                           </a>`
                    ).join('')}
                </div>
            </aside>

            <!-- Main -->
            <div class="lesson-main">
                ${!hideHeader ? `<!-- Header -->
                <div class="lesson-header">
                    <div class="header-badges">
                        <span class="badge-code">${esc(lesson.subject_code)}</span>
                        ${lesson.difficulty ? `<span class="badge-level ${lesson.difficulty}">${lesson.difficulty.charAt(0).toUpperCase() + lesson.difficulty.slice(1)}</span>` : ''}
                        ${d.is_completed ? `<span class="badge-complete"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg> Completed</span>` : ''}
                    </div>
                    <h1>${esc(lesson.lesson_title)}</h1>
                    <div class="header-meta">
                        <span class="meta-item">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                            ${esc(lesson.instructor_name)}
                        </span>
                        <span class="meta-item">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                            ${lesson.estimated_time || 30} mins
                        </span>
                    </div>
                </div>` : ''}

                <!-- Learning Objectives -->
                ${!focus && lesson.learning_objectives ? `
                <div class="objectives-card">
                    <h3>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
                        Learning Objectives
                    </h3>
                    <ul>
                        ${lesson.learning_objectives.split('\n').filter(o => o.trim()).map(o => `<li>${esc(o.replace(/^[\s•\-*]+/, ''))}</li>`).join('')}
                    </ul>
                </div>` : ''}

                <!-- Content -->
                ${lesson.lesson_content ? `
                <div class="content-card${focus ? ' lv-focus-card' : ''}">
                    <div class="content-body">${lesson.lesson_content}</div>
                </div>` : ''}

                <!-- Video Materials -->
                ${!hideMaterials && videoLinks.length > 0 ? `
                <div class="${focus ? 'lv-materials-block' : 'resources-card'}">
                    ${focus ? '' : `<h3>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                        Video Materials
                    </h3>`}
                    <div class="video-list">
                        ${videoLinks.map(v => {
                            const embedUrl = getEmbedUrl(v);
                            if (embedUrl) {
                                return `<div class="video-embed">
                                    <div class="video-title">${esc(v.original_name)}</div>
                                    <div class="video-responsive"><iframe src="${esc(embedUrl)}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>
                                </div>`;
                            }
                            return `<a href="${esc(v.file_path)}" class="resource-item" target="_blank" rel="noopener">
                                <div class="res-icon video-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg></div>
                                <span class="resource-name">${esc(v.original_name)}</span>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                            </a>`;
                        }).join('')}
                    </div>
                </div>` : ''}

                <!-- Attachments -->
                ${!hideMaterials && otherMaterials.length > 0 ? `
                <div class="${focus ? 'lv-materials-block' : 'resources-card'}">
                    ${focus ? '' : `<h3>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                        Resources & Files
                    </h3>`}
                    <div class="gc-material-list">${otherMaterials.map(f => renderMaterialAttachment(f)).join('')}</div>
                </div>` : ''}

                <!-- Related Quizzes -->
                ${linkedQuizzes.length > 0 ? renderQuizzesCard(linkedQuizzes) : ''}

                ${!hideActions ? `<!-- Actions -->
                <div class="actions-card">
                    ${!d.is_completed
                        ? `<button id="markCompleteBtn" class="btn-complete" data-lesson="${lesson.lessons_id}">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>
                            Mark as Complete
                        </button>`
                        : `<div class="completed-msg">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>
                            Completed on ${d.completed_at ? new Date(d.completed_at).toLocaleDateString('en-US', {year:'numeric', month:'short', day:'numeric'}) : ''}
                        </div>`}
                </div>` : ''}

                ${!hideActions ? `<!-- Navigation -->
                <div class="lesson-nav">
                    ${d.prev_lesson
                        ? (embedded
                            ? `<button type="button" data-lesson-nav="${d.prev_lesson.lessons_id}" class="nav-btn prev">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                                <div><small>Previous</small><span>${esc(d.prev_lesson.title)}</span></div>
                               </button>`
                            : `<a href="#student/lesson-view?id=${d.prev_lesson.lessons_id}" class="nav-btn prev">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                                <div><small>Previous</small><span>${esc(d.prev_lesson.title)}</span></div>
                               </a>`)
                        : '<div></div>'}
                    ${d.next_lesson
                        ? (embedded
                            ? `<button type="button" data-lesson-nav="${d.next_lesson.lessons_id}" class="nav-btn next">
                                <div><small>Next</small><span>${esc(d.next_lesson.title)}</span></div>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                               </button>`
                            : `<a href="#student/lesson-view?id=${d.next_lesson.lessons_id}" class="nav-btn next">
                                <div><small>Next</small><span>${esc(d.next_lesson.title)}</span></div>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                               </a>`)
                        : ''}
                </div>` : ''}
            </div>
        </div>`;
}

function renderQuizzesCard(quizzes) {
    const statusMeta = {
        passed:    { label: 'Passed',    bg: '#E8F5E9', color: '#1B4D3E', icon: icon('check', { size: 12 }) },
        attempted: { label: 'Attempted', bg: '#EFF6FF', color: '#1d4ed8', icon: '↺' },
        overdue:   { label: 'Overdue',   bg: '#FEE2E2', color: '#b91c1c', icon: '!' },
        available: { label: 'Available', bg: '#F0FDF4', color: '#166534', icon: '▶' },
    };

    return `
        <div class="resources-card">
            <h3>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                </svg>
                Lesson Assessments
            </h3>
            <div class="quiz-list">
                ${quizzes.map(q => {
                    const s = statusMeta[q.status] || statusMeta.available;
                    const due = q.due_date ? new Date(q.due_date).toLocaleDateString('en-US', {month:'short', day:'numeric'}) : null;
                    return `
                        <div class="quiz-row">
                            <div class="quiz-row-info">
                                <div class="quiz-row-title">${esc(q.quiz_title)}</div>
                                <div class="quiz-row-meta">
                                    ${q.question_count} question${q.question_count != 1 ? 's' : ''}
                                    ${q.time_limit ? ` &middot; ${q.time_limit} min` : ''}
                                    ${due ? ` &middot; Due ${due}` : ''}
                                    ${q.attempts_used > 0 ? ` &middot; ${q.attempts_used} attempt${q.attempts_used != 1 ? 's' : ''}` : ''}
                                    ${q.best_score !== null ? ` &middot; Best: <strong>${parseFloat(q.best_score).toFixed(1)}%</strong>` : ''}
                                </div>
                            </div>
                            <div class="quiz-row-right">
                                <span class="quiz-status-badge" style="background:${s.bg};color:${s.color}">${s.icon} ${s.label}</span>
                                ${q.status === 'passed'
                                    ? `<a href="#student/take-quiz?quiz_id=${q.quiz_id}" class="btn-take-quiz btn-passed">${icon('check', inl)} Passed</a>`
                                    : (q.status === 'exhausted' || (!q.can_take && q.attempts_remaining === 0 && (q.max_attempts || 0) > 0))
                                        ? `<span class="btn-take-quiz disabled">No attempts left</span>`
                                    : q.can_take
                                        ? `<a href="#student/take-quiz?quiz_id=${q.quiz_id}" class="btn-take-quiz">
                                            ${q.attempts_used > 0 ? 'Retake' : 'Take Quiz'}${q.attempts_remaining != null ? ` (${q.attempts_remaining} left)` : ''}
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                                           </a>`
                                        : `<span class="btn-take-quiz disabled">Closed</span>`}
                            </div>
                        </div>`;
                }).join('')}
            </div>
        </div>`;
}

function getEmbedUrl(v) {
    const url = v.file_path || '';
    if (v.file_type === 'youtube') {
        let vid = null;
        // ?v=XXX or &v=XXX (handles extra params before v=)
        let m = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
        if (m) vid = m[1];
        // youtu.be/XXX
        if (!vid) { m = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/); if (m) vid = m[1]; }
        // youtube.com/embed/XXX
        if (!vid) { m = url.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/); if (m) vid = m[1]; }
        // youtube.com/shorts/XXX
        if (!vid) { m = url.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/); if (m) vid = m[1]; }
        // youtube.com/live/XXX
        if (!vid) { m = url.match(/youtube\.com\/live\/([a-zA-Z0-9_-]{11})/); if (m) vid = m[1]; }
        if (vid) return 'https://www.youtube.com/embed/' + vid;
    } else if (v.file_type === 'vimeo') {
        const m = url.match(/vimeo\.com\/(\d+)/);
        if (m) return 'https://player.vimeo.com/video/' + m[1];
    }
    return null;
}

function bindLessonNav(container, hooks = {}) {
    container.querySelectorAll('[data-lesson-nav]').forEach(el => {
        el.addEventListener('click', () => {
            const id = el.dataset.lessonNav;
            if (id && hooks.onSelectLesson) hooks.onSelectLesson(id);
        });
    });
}

function bindLessonAiHighlight(container, lesson, lessonId) {
    let toolbar = null;

    const hideToolbar = () => {
        toolbar?.remove();
        toolbar = null;
    };

    const onDocDown = (e) => {
        if (toolbar && !toolbar.contains(e.target)) hideToolbar();
    };

    const showToolbar = (rect, text) => {
        hideToolbar();
        toolbar = document.createElement('div');
        toolbar.className = 'lv-ali-toolbar';
        toolbar.innerHTML = `<button type="button" class="lv-ali-toolbar-btn">${icon('robot', { size: 14, className: 'ui-icon-inline' })} Ask Ali</button>`;
        const left = Math.max(8, Math.min(rect.left, window.innerWidth - 140));
        const top = Math.max(8, rect.top - 44);
        toolbar.style.left = `${left}px`;
        toolbar.style.top = `${top}px`;
        toolbar.querySelector('button').addEventListener('click', async () => {
            const snippet = text.slice(0, 800);
            const { askAli } = await import('../../components/floating-assistant.js');
            askAli(`Please explain this part of the lesson in simple terms:\n\n"${snippet}"`, {
                page: 'lesson',
                lessons_id: lessonId,
                work_title: lesson.lesson_title || lesson.title || 'Lesson',
                subject_id: lesson.subject_id,
                subject_name: lesson.subject_name || '',
                subject_code: lesson.subject_code || '',
                highlighted_text: snippet,
            });
            hideToolbar();
            window.getSelection()?.removeAllRanges();
        });
        document.body.appendChild(toolbar);
    };

    container.querySelectorAll('.content-body').forEach((body) => {
        body.addEventListener('mouseup', () => {
            setTimeout(() => {
                const sel = window.getSelection();
                const text = sel?.toString().trim() || '';
                if (text.length < 3 || !sel?.rangeCount) {
                    hideToolbar();
                    return;
                }
                const anchor = sel.anchorNode;
                if (!anchor || !body.contains(anchor)) {
                    hideToolbar();
                    return;
                }
                const rect = sel.getRangeAt(0).getBoundingClientRect();
                if (rect.width === 0 && rect.height === 0) {
                    hideToolbar();
                    return;
                }
                showToolbar(rect, text);
            }, 10);
        });
    });

    document.addEventListener('mousedown', onDocDown);
    container._aliHighlightCleanup = () => {
        hideToolbar();
        document.removeEventListener('mousedown', onDocDown);
    };
}

function bindEvents(container, lessonId, d, hooks = {}) {
    bindLessonNav(container, hooks);

    bindMaterialAttachments(container);

    const btn = container.querySelector('#markCompleteBtn');
    if (btn) {
        btn.addEventListener('click', async function () {
            btn.disabled = true;
            btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg> Marking...';
            const res = await Api.post('/LessonsAPI.php?action=complete', { lessons_id: parseInt(lessonId) });
            if (res.success) {
                if (hooks.onComplete) {
                    hooks.onComplete(lessonId);
                } else {
                    const mod = await import('./lesson-view.js?v=' + Date.now());
                    mod.render(container, { id: lessonId });
                }
            } else {
                btn.disabled = false;
                btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg> Mark as Complete';
                alert(res.message || 'Failed');
            }
        });
    }
}

function esc(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
}

function getStyles() {
    return materialAttachmentCss() + `
/* Lesson View - Green Theme */
.lv-wrap { padding:24px; max-width:1200px; margin:0 auto; }
.lv-wrap.lv-embedded { padding:0; max-width:none; margin:0; }

.back-link {
    display:inline-flex; align-items:center; gap:6px;
    color:#1B4D3E; text-decoration:none; font-size:14px; font-weight:500; margin-bottom:20px;
}
.back-link:hover { opacity:.7; }

/* Layout */
.lesson-layout { display:grid; grid-template-columns:280px 1fr; gap:24px; }

/* Sidebar */
.lesson-sidebar {
    background:#fff; border:1px solid #e8e8e8; border-radius:12px;
    position:sticky; top:90px; max-height:calc(100vh - 120px);
    display:flex; flex-direction:column; overflow:hidden;
}
.sidebar-header {
    display:flex; align-items:center; gap:8px; padding:16px;
    border-bottom:1px solid #e8e8e8; font-size:14px; font-weight:600; color:#333;
}
.sidebar-header svg { color:#1B4D3E; }
.sidebar-header .count { margin-left:auto; color:#1B4D3E; font-size:13px; }
.sidebar-list { flex:1; overflow-y:auto; padding:8px; }

.sidebar-item {
    display:flex; align-items:center; gap:10px; padding:10px 12px; width:100%;
    border:none; background:none; cursor:pointer; text-align:left;
    border-radius:8px; text-decoration:none; color:#666; font-size:13px;
    margin-bottom:4px; transition:all .2s;
}
.sidebar-item:hover { background:#fafafa; }
.sidebar-item.active { background:#E8F5E9; color:#1B4D3E; font-weight:600; }

.item-num {
    width:26px; height:26px; background:#f5f5f5; border-radius:50%;
    display:flex; align-items:center; justify-content:center;
    font-size:12px; font-weight:600; flex-shrink:0; color:#999;
}
.sidebar-item.completed .item-num { background:#1B4D3E; color:#fff; }
.sidebar-item.active .item-num { background:#1B4D3E; color:#fff; }
.item-title { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

/* Main */
.lesson-main { min-width:0; }

/* Cards */
.lesson-header, .objectives-card, .content-card, .resources-card, .actions-card {
    background:#fff; border:1px solid #e8e8e8; border-radius:12px; padding:24px; margin-bottom:16px;
}

/* Header */
.header-badges { display:flex; gap:8px; margin-bottom:12px; flex-wrap:wrap; }
.badge-code { background:#1B4D3E; color:#fff; padding:5px 10px; border-radius:6px; font-size:11px; font-weight:600; }
.badge-level { padding:5px 10px; border-radius:6px; font-size:11px; font-weight:500; }
.badge-level.beginner { background:#E8F5E9; color:#1B4D3E; }
.badge-level.intermediate { background:#FFF8E1; color:#F57C00; }
.badge-level.advanced { background:#FFEBEE; color:#C62828; }
.badge-complete {
    display:inline-flex; align-items:center; gap:4px;
    background:#E8F5E9; color:#1B4D3E; padding:5px 10px; border-radius:6px; font-size:11px; font-weight:600;
}
.lesson-header h1 { font-size:24px; font-weight:700; color:#333; margin:0 0 12px; }
.header-meta { display:flex; gap:20px; }
.meta-item { display:flex; align-items:center; gap:6px; font-size:14px; color:#666; }
.meta-item svg { color:#1B4D3E; }

/* Objectives */
.objectives-card { background:#f8fdf9; border-color:#c8e6c9; }
.objectives-card h3 {
    display:flex; align-items:center; gap:8px;
    font-size:15px; font-weight:600; color:#1B4D3E; margin:0 0 14px;
}
.objectives-card ul { margin:0; padding:0; list-style:none; }
.objectives-card li { position:relative; padding-left:20px; margin-bottom:8px; font-size:14px; color:#333; line-height:1.5; }
.objectives-card li::before {
    content:''; position:absolute; left:0; top:8px; width:8px; height:8px;
    border:2px solid #1B4D3E; border-radius:2px;
}

/* Content */
.content-card h3 { display:flex; align-items:center; gap:8px; font-size:15px; font-weight:600; color:#333; margin:0 0 14px; }
.content-body { font-size:15px; line-height:1.7; color:#444; }
.content-body h2, .content-body h3, .content-body h4 { color:#333; margin:24px 0 12px; }
.content-body p { margin:0 0 16px; }
.content-body ul, .content-body ol { margin:0 0 16px; padding-left:24px; }
.content-body li { margin-bottom:6px; }
.content-body img { max-width:100%; border-radius:8px; margin:16px 0; }
.content-body pre { background:#1a1a2e; color:#e8e8e8; padding:16px; border-radius:8px; overflow-x:auto; font-size:13px; }
.content-body code { background:#f5f5f5; padding:2px 6px; border-radius:4px; font-size:13px; }
.content-body pre code { background:none; padding:0; }

/* Resources */
.resources-card h3 { display:flex; align-items:center; gap:8px; font-size:15px; font-weight:600; color:#333; margin:0 0 14px; }
.resources-list { display:flex; flex-direction:column; gap:8px; }
.resource-item {
    display:flex; align-items:center; gap:12px; padding:12px 14px;
    background:#fafafa; border-radius:8px; text-decoration:none; color:#333; transition:all .2s;
}
.resource-item:hover { background:#E8F5E9; }
.res-icon { width:36px; height:36px; border-radius:8px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
.res-icon.pdf-icon { background:#FEE2E2; color:#b91c1c; }
.res-icon.doc-icon { background:#DBEAFE; color:#1E40AF; }
.res-icon.zip-icon { background:#FEF3C7; color:#92400E; }
.res-icon.link-icon { background:#EDE9FE; color:#5B21B6; }
.res-icon.video-icon { background:#FEE2E2; color:#b91c1c; }
.resource-name { font-size:14px; font-weight:500; color:#333; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.resource-meta { font-size:11px; color:#9ca3af; margin-top:2px; }
.resource-url { font-size:11px; color:#9ca3af; margin-top:2px; }
.resource-item svg:last-child { color:#999; flex-shrink:0; }

/* Video Embeds */
.video-list { display:flex; flex-direction:column; gap:16px; }
.video-embed { border:1px solid #e8e8e8; border-radius:10px; overflow:hidden; }
.video-title { padding:10px 14px; font-size:13px; font-weight:600; color:#333; background:#fafafa; border-bottom:1px solid #e8e8e8; }
.video-responsive { position:relative; padding-bottom:56.25%; height:0; overflow:hidden; }
.video-responsive iframe { position:absolute; top:0; left:0; width:100%; height:100%; }

/* Image Preview */
.resource-image-card { border:1px solid #e8e8e8; border-radius:10px; overflow:hidden; margin-bottom:8px; }
.resource-image-card img { width:100%; max-height:400px; object-fit:contain; display:block; background:#fafafa; }
.resource-image-info { display:flex; justify-content:space-between; align-items:center; padding:10px 14px; border-top:1px solid #e8e8e8; }
.res-download-btn {
    font-size:12px; font-weight:600; color:#1B4D3E; text-decoration:none;
    padding:4px 12px; border:1px solid #1B4D3E; border-radius:6px;
}
.res-download-btn:hover { background:#E8F5E9; }

/* Quiz list */
.quiz-list { display:flex; flex-direction:column; gap:10px; }
.quiz-row {
    display:flex; align-items:center; justify-content:space-between; gap:12px;
    padding:14px 16px; background:#f9fafb; border:1px solid #e8e8e8; border-radius:10px;
}
.quiz-row:hover { border-color:#1B4D3E; background:#f8fdf9; }
.quiz-row-info { flex:1; min-width:0; }
.quiz-row-title { font-size:14px; font-weight:600; color:#1a1a1a; margin-bottom:4px; }
.quiz-row-meta { font-size:12px; color:#6b7280; }
.quiz-row-right { display:flex; align-items:center; gap:10px; flex-shrink:0; }
.quiz-status-badge {
    font-size:11px; font-weight:700; padding:3px 10px; border-radius:20px;
    white-space:nowrap;
}
.btn-take-quiz {
    display:inline-flex; align-items:center; gap:6px;
    background:#1B4D3E; color:#fff; border:none; border-radius:8px;
    padding:7px 14px; font-size:13px; font-weight:600; text-decoration:none;
    cursor:pointer; transition:background .2s; white-space:nowrap;
}
.btn-take-quiz:hover { background:#2D6A4F; }
.btn-take-quiz.disabled { background:#d1d5db; color:#6b7280; cursor:not-allowed; pointer-events:none; }
.btn-take-quiz.btn-passed { background:#DCFCE7; color:#15803D; border:1px solid #86EFAC; cursor:default; pointer-events:none; }

/* Actions */
.btn-complete {
    width:100%; display:flex; align-items:center; justify-content:center; gap:8px;
    padding:14px; background:#1B4D3E; color:#fff; border:none; border-radius:10px;
    font-size:15px; font-weight:600; cursor:pointer; transition:all .2s;
}
.btn-complete:hover { background:#2D6A4F; }
.btn-complete:disabled { background:#ccc; cursor:not-allowed; }
.completed-msg {
    display:flex; align-items:center; justify-content:center; gap:8px;
    padding:14px; background:#E8F5E9; color:#1B4D3E; border-radius:10px; font-size:14px; font-weight:600;
}

/* Navigation */
.lesson-nav { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
.nav-btn {
    display:flex; align-items:center; gap:12px; padding:16px;
    background:#fff; border:1px solid #e8e8e8; border-radius:10px; text-decoration:none;
    transition:all .2s; cursor:pointer; font:inherit; color:inherit;
}
button.nav-btn { width:100%; }
.nav-btn:hover { border-color:#1B4D3E; background:#f8fdf9; }
.nav-btn svg { color:#1B4D3E; flex-shrink:0; }
.nav-btn div { min-width:0; }
.nav-btn small { display:block; font-size:12px; color:#999; margin-bottom:2px; }
.nav-btn span { display:block; font-size:14px; font-weight:600; color:#333; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.nav-btn.next { justify-content:flex-end; text-align:right; }

/* Locked */
.locked-box {
    background:#fff; border:1px solid #e8e8e8; border-radius:12px;
    padding:60px 40px; text-align:center; max-width:480px; margin:40px auto;
}
.locked-icon {
    width:80px; height:80px; background:#f5f5f5; border-radius:50%;
    display:flex; align-items:center; justify-content:center; margin:0 auto 20px; color:#999;
}
.locked-box h2 { font-size:22px; color:#333; margin:0 0 10px; }
.locked-box p { color:#666; margin:0 0 24px; }
.btn-primary {
    display:inline-flex; align-items:center; gap:8px;
    background:#1B4D3E; color:#fff; padding:12px 24px; border-radius:8px;
    text-decoration:none; font-weight:600; transition:all .2s;
}
.btn-primary:hover { background:#2D6A4F; }

.lv-ali-toolbar {
    position: fixed; z-index: 960;
    background: #00461B; color: #fff; border-radius: 20px;
    box-shadow: 0 4px 16px rgba(0,70,27,.35);
    padding: 2px;
    animation: lv-ali-pop .15s ease;
}
@keyframes lv-ali-pop {
    from { opacity: 0; transform: scale(.92); }
    to { opacity: 1; transform: scale(1); }
}
.lv-ali-toolbar-btn {
    display: inline-flex; align-items: center; gap: 6px;
    background: transparent; border: none; color: #fff;
    font-size: 13px; font-weight: 700; padding: 8px 14px; cursor: pointer;
    border-radius: 18px;
}
.lv-ali-toolbar-btn:hover { background: rgba(255,255,255,.12); }
.content-body { user-select: text; }

/* Responsive */
@media (max-width:900px) {
    .lesson-layout { grid-template-columns:1fr; }
    .lesson-sidebar { position:static; max-height:none; }
    .sidebar-list { max-height:200px; }
}
@media (max-width:600px) {
    .lv-wrap { padding:16px; }
    .lesson-nav { grid-template-columns:1fr; }
}
`;
}
