/**
 * Instructor My Classes — subjects → sections → open class
 */
import { Api } from '../../api.js';
import { subjectColor, programPatternSvg } from '../../utils/subject-colors.js';
import { icon, iconLg } from '../../utils/icons.js';
import { openAnnouncementModal } from '../../components/announcement-modal.js';
import { openLessonModal } from '../../components/lesson-modal.js';
import { openQuizCreatePicker } from '../../components/quiz-create-picker.js';
import { buildStudentJoinUrl, buildStudentJoinUrlByEnrollmentCode, renderQrInto } from '../../utils/qr-utils.js';
const inl = { size: 14, className: 'ui-icon-inline' };
const G = '#00461B';
const G2 = '#006428';
const GL = '#E8F5EC';
const BORDER = '#E5E7EB';

export async function render(container, params = {}) {
    container.innerHTML = `<div class="mc-loading"><div class="mc-spin"></div></div>`;

    const hashParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
    const subjectId  = params?.subject_id || hashParams.get('subject_id');
    const view       = (params?.view || hashParams.get('view')) === 'archived' ? 'archived' : 'active';

    const classesRes = await Api.get('/SectionsAPI.php?action=instructor-classes');

    const subjects = classesRes.success ? (classesRes.data || []) : [];

    if (subjectId) {
        const subject = subjects.find(s => String(s.subject_id) === String(subjectId));
        if (!subject) {
            container.innerHTML = emptyState('Subject not found.', '#instructor/my-classes');
            applyPageBg(container);
            return;
        }
        renderSubjectSections(container, subject);
    } else {
        renderSubjectList(container, subjects, view);
    }

    applyPageBg(container);
}

function renderSubjectList(container, subjects, view = 'active') {
    const activeSubjects   = subjects.filter(s => s.offering_status !== 'archived');
    const archivedSubjects = subjects.filter(s => s.offering_status === 'archived');
    const viewSubjects     = view === 'archived' ? archivedSubjects : activeSubjects;

    const emptyMsg = view === 'archived'
        ? 'No archived subjects yet. Use the Archive button on any active subject to move it here.'
        : 'No subjects assigned yet. Contact your dean to assign subjects to you.';

    container.innerHTML = `
        <style>${styles()}</style>
        <div class="mc-page">
            ${viewSubjects.length === 0 ? emptyState(emptyMsg, null) : `
                <div class="mc-subj-grid" id="mc-subj-grid">
                    ${viewSubjects.map(s => subjectCard(s)).join('')}
                </div>
            `}
        </div>
    `;

    container.querySelectorAll('.mc-archive-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            // A subject can back onto several subject_offered rows at once
            // (one per section, under the same instructor) — archiving "this
            // subject" has to apply to every one of them, or sections behind
            // the other IDs would silently stay open while the card shows
            // Archived.
            const offeredIds = (btn.dataset.offeredIds || '').split(',').map(v => parseInt(v, 10)).filter(Boolean);
            const newStatus = btn.dataset.newStatus;
            const isArchiving = newStatus === 'archived';
            const ok = await showMcConfirm(
                isArchiving
                    ? 'Archive this subject? Students will see it in their Archived Classes and cannot take quizzes or submit work.'
                    : 'Unarchive this subject? It will return to students\' active subjects.',
                { title: isArchiving ? 'Archive Subject' : 'Unarchive Subject',
                  confirmLabel: isArchiving ? 'Archive' : 'Unarchive' }
            );
            if (!ok) return;
            btn.disabled = true;
            btn.innerHTML = 'Saving…';
            const results = await Promise.all(offeredIds.map(id => Api.post('/SubjectOfferingsAPI.php?action=update', {
                subject_offered_id: id,
                status: newStatus,
            })));
            const failed = results.find(r => !r.success);
            if (!failed) {
                render(container, { view: newStatus === 'archived' ? 'archived' : 'active' });
            } else {
                showMcPopup(failed.message || 'Failed to update.', { title: 'Error', type: 'error' });
                btn.disabled = false;
                btn.innerHTML = icon('archive', inl) + ' ' + (isArchiving ? 'Archive' : 'Unarchive');
            }
        });
    });
}

function renderSubjectSections(container, subject) {
    const sections = subject.sections || [];
    const color = subjectColor(subject.subject_id);

    container.innerHTML = `
        <style>${styles()}</style>
        <div class="mc-page">
            <div class="mc-crumb">
                <a href="#instructor/my-classes">My Classes</a>
                <span class="mc-crumb-sep">&rsaquo;</span>
                <span class="mc-crumb-current">${esc(subject.subject_name)}</span>
            </div>

            <header class="mc-subj-hero">
                <div class="mc-subj-hero-band" style="background:${color}">
                    ${programPatternSvg(subject.program_code, subject.subject_id, { width: 300, height: 160 })}
                    <span class="mc-subj-code">${esc(subject.subject_code)}</span>
                    <h1>${esc(subject.subject_name)}</h1>
                    ${subject.program_code ? `<span class="mc-subj-prog">${esc(subject.program_code)}</span>` : ''}
                </div>
                <div class="mc-subj-hero-meta">
                    <div class="mc-subj-hero-meta-row">
                        <p>${sections.length} section${sections.length !== 1 ? 's' : ''}</p>
                        <div class="mc-fab-wrap">
                            <div class="mc-fab-menu" id="mc-fab-menu" hidden>
                                <button type="button" class="mc-fab-item" id="mc-add-lesson">
                                    <span class="mc-fab-item-icon">${icon('document', inl)}</span>
                                    <span class="mc-fab-item-label">Add Lesson</span>
                                </button>
                                <button type="button" class="mc-fab-item" id="mc-post-announce">
                                    <span class="mc-fab-item-icon">${icon('announce', inl)}</span>
                                    <span class="mc-fab-item-label">Post Announcement</span>
                                </button>
                                <button type="button" class="mc-fab-item" id="mc-create-quiz">
                                    <span class="mc-fab-item-icon">${icon('quiz', inl)}</span>
                                    <span class="mc-fab-item-label">Create Quiz</span>
                                </button>
                                <button type="button" class="mc-fab-item" id="mc-add-section">
                                    <span class="mc-fab-item-icon">${icon('plus', inl)}</span>
                                    <span class="mc-fab-item-label">Add Section</span>
                                </button>
                            </div>
                            <button type="button" class="mc-fab-toggle" id="mc-fab-toggle" aria-expanded="false" aria-label="Class actions">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                                    <line x1="12" y1="5" x2="12" y2="19"/>
                                    <line x1="5" y1="12" x2="19" y2="12"/>
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            ${sections.length === 0 ? `
                <div class="mc-empty-inline">
                    <p>No sections yet for this subject.</p>
                    <button type="button" class="mc-btn-primary" id="mc-add-section-inline">Create first section</button>
                </div>
            ` : `
                <div class="mc-sec-grid">
                    ${sections.map(sec => sectionCard(subject, sec)).join('')}
                </div>
            `}
        </div>
    `;

    const fabToggle = container.querySelector('#mc-fab-toggle');
    const fabMenu   = container.querySelector('#mc-fab-menu');
    const closeFab  = () => {
        if (!fabMenu || fabMenu.hidden) return;
        fabMenu.hidden = true;
        fabToggle?.classList.remove('open');
        fabToggle?.setAttribute('aria-expanded', 'false');
    };
    fabToggle?.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = !fabMenu.hidden;
        if (isOpen) { closeFab(); return; }
        // .mc-fab-menu is position:fixed and 0x0 — anchor its origin to the
        // toggle button's actual on-screen center right before showing it,
        // so the arc always radiates from the real button regardless of
        // scroll position or where this card sits on the page.
        const r = fabToggle.getBoundingClientRect();
        fabMenu.style.left = `${r.left + r.width / 2}px`;
        fabMenu.style.top = `${r.top + r.height / 2}px`;
        fabMenu.hidden = false;
        fabToggle.classList.add('open');
        fabToggle.setAttribute('aria-expanded', 'true');
    });
    fabMenu?.addEventListener('click', (e) => e.stopPropagation());
    document.addEventListener('click', closeFab);
    // Fixed positioning is anchored by a one-time snapshot on open, so if
    // the page scrolls while the menu is open that snapshot goes stale —
    // just close it rather than let it drift away from the button.
    window.addEventListener('scroll', closeFab, true);

    container.querySelector('#mc-add-section')?.addEventListener('click', () => { closeFab(); openCreateSectionModal(container, subject); });
    container.querySelector('#mc-add-section-inline')?.addEventListener('click', () => openCreateSectionModal(container, subject));
    container.querySelector('#mc-add-lesson')?.addEventListener('click', () => {
        closeFab();
        openLessonModal({
            presetSubjectId: subject.subject_id,
            lockSubject: true,
            classesData: [{ ...subject, sections }],
            onSuccess: () => render(container, { subject_id: subject.subject_id }),
        });
    });
    container.querySelector('#mc-post-announce')?.addEventListener('click', () => {
        closeFab();
        openAnnouncementModal({
            presetSubjectId: subject.subject_id,
            lockSubject: true,
            classesData: [{ ...subject, sections }],
            subjects: [{ subject_id: subject.subject_id, subject_code: subject.subject_code, subject_name: subject.subject_name }],
        });
    });
    container.querySelector('#mc-create-quiz')?.addEventListener('click', () => {
        closeFab();
        openQuizPicker(subject, sections);
    });
    container.querySelectorAll('[data-copy]').forEach(el => {
        el.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            navigator.clipboard.writeText(el.dataset.copy);
            showMcPopup('Class code copied — share it with students so they can join.', { title: 'Copied', type: 'success' });
        });
    });

    container.querySelectorAll('[data-qr-url]').forEach(async (el) => {
        const url = el.dataset.qrUrl;
        if (!url) return;
        try {
            await renderQrInto(el, url, 160);
        } catch (_) {
            el.innerHTML = '<span class="mc-class-code-hint">QR unavailable</span>';
        }
    });

    container.querySelectorAll('[data-manage]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            openManageStudentsModal(container, subject, {
                sectionId: parseInt(btn.dataset.manage, 10),
                sectionName: btn.dataset.sname,
                subjectCode: btn.dataset.subjectCode || subject.subject_code || '',
                enrollmentCode: btn.dataset.enrollmentCode || '',
                subjectOfferedId: parseInt(btn.dataset.offered, 10) || subject.subject_offered_id,
            });
        });
    });

    // Pending-join-request counts — lazy, after the cards themselves are up,
    // so a slow count fetch never blocks the actual class list from showing.
    container.querySelectorAll('[data-pending-badge]').forEach(async (badge) => {
        const [offeredId, sectionId] = (badge.dataset.pendingBadge || '').split('|');
        if (!offeredId || !sectionId) return;
        try {
            const res = await Api.get(`/SectionsAPI.php?action=pending-joins&subject_offered_id=${offeredId}&section_id=${sectionId}`);
            const n = res.success ? (res.data || []).length : 0;
            if (n > 0) { badge.textContent = String(n); badge.hidden = false; }
        } catch (_) { /* badge just stays hidden */ }
    });
}

function subjectCard(s) {
    const color = subjectColor(s.subject_id);
    const secCount = (s.sections || []).length;
    const studentTotal = (s.sections || []).reduce((n, x) => n + Number(x.student_count || 0), 0);
    const search = [s.subject_code, s.subject_name, s.program_code].filter(Boolean).join(' ').toLowerCase();
    const isArchived = s.offering_status === 'archived';

    return `
        <div class="mc-subj-card-wrap${isArchived ? ' mc-subj-card-wrap--archived' : ''}"
             data-search="${esc(search)}">
            <a href="#instructor/my-classes?subject_id=${s.subject_id}" class="mc-subj-card">
                <div class="mc-subj-top" style="background:${color}${isArchived ? ';filter:saturate(.5)' : ''}">
                    ${programPatternSvg(s.program_code, s.subject_id)}
                    <span class="mc-subj-card-code">${esc(s.subject_code)}</span>
                    <h3>${esc(s.subject_name)}</h3>
                    ${isArchived ? '<span class="mc-archived-badge">Archived</span>' : ''}
                </div>
                <div class="mc-subj-body">
                    <div class="mc-stat-row">${icon('school', inl)} <strong>${secCount}</strong> section${secCount !== 1 ? 's' : ''}</div>
                    <div class="mc-stat-row">${icon('users', inl)} <strong>${studentTotal}</strong> student${studentTotal !== 1 ? 's' : ''}</div>
                    <span class="mc-subj-link">View sections →</span>
                </div>
            </a>
            ${s.subject_offered_id ? `
            <button type="button" class="mc-archive-btn${isArchived ? ' mc-archive-btn--restore' : ''}"
                    data-offered-ids="${esc((s.subject_offered_ids || [s.subject_offered_id]).join(','))}"
                    data-new-status="${isArchived ? 'open' : 'archived'}"
                    title="${isArchived ? 'Unarchive this subject' : 'Archive this subject'}">
                ${icon('archive', inl)} ${isArchived ? 'Unarchive' : 'Archive'}
            </button>` : ''}
        </div>
    `;
}

function sectionCard(subject, sec) {
    const openUrl = `#instructor/subject?subject_id=${subject.subject_id}&section_id=${sec.section_id}`;
    const classCode = sec.enrollment_code || '';
    const joinUrl = buildStudentJoinUrlByEnrollmentCode(classCode);

    return `
        <article class="mc-sec-card">
            <div class="mc-sec-head">
                <div>
                    <h3 class="mc-sec-name">${esc(sec.section_name)}</h3>
                    <div class="mc-class-code-box">
                        <span class="mc-class-code-label">Class code</span>
                        <button type="button" class="mc-enroll-code" data-copy="${esc(classCode)}" title="Copy class code for students">
                            ${esc(classCode)}
                            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                        </button>
                        <div class="mc-qr-box" data-qr-url="${esc(joinUrl)}" id="mc-qr-${sec.section_id}"></div>
                        <span class="mc-class-code-hint">Students scan QR or enter <strong>${esc(classCode)}</strong> to join <strong>${esc(sec.section_name)}</strong></span>
                    </div>
                </div>
                <span class="mc-sec-badge">${esc(sec.status || 'active')}</span>
                </div>
            <div class="mc-sec-meta">
                ${sec.schedule ? `<div>${icon('clock', inl)} ${esc(sec.schedule)}</div>` : ''}
                ${sec.room ? `<div>${icon('pin', inl)} ${esc(sec.room)}</div>` : ''}
                <div>${icon('users', inl)} ${Number(sec.student_count || 0)} / ${Number(sec.max_students || 40)} students</div>
                </div>
            <div class="mc-sec-actions">
                <a href="${openUrl}" class="mc-btn-primary mc-btn-sm">Open Class</a>
                <button type="button" class="mc-btn-manage-people" data-manage="${sec.section_id}" data-sname="${esc(sec.section_name)}" data-subject-code="${esc(subject.subject_code)}" data-enrollment-code="${esc(classCode)}" data-offered="${sec.subject_offered_id || subject.subject_offered_id || ''}" title="Add students, approve QR/code join requests">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                        <circle cx="9" cy="7" r="4"/>
                        <line x1="19" y1="8" x2="19" y2="14"/>
                        <line x1="16" y1="11" x2="22" y2="11"/>
                    </svg>
                    <span class="mc-manage-people-badge" data-pending-badge="${sec.subject_offered_id || subject.subject_offered_id || ''}|${sec.section_id}" hidden>0</span>
                </button>
            </div>
        </article>
    `;
}

function openCreateSectionModal(container, subject) {
    const color = subjectColor(subject.subject_id);
    const overlay = document.createElement('div');
    overlay.className = 'mc-modal-overlay';
    overlay.innerHTML = `
        <div class="mc-modal mc-modal-create" role="dialog" aria-modal="true">
            <div class="mc-modal-create-hdr" style="background:${color}">
                <div>
                    <p class="mc-modal-create-label">New Section</p>
                    <h3>${esc(subject.subject_code)}</h3>
                    <p class="mc-modal-create-sub">${esc(subject.subject_name)}</p>
                </div>
                <button type="button" class="mc-modal-x mc-modal-x-light" aria-label="Close">&times;</button>
            </div>
            <div class="mc-modal-body">
                <div id="mc-modal-alert"></div>
                <div class="mc-steps">
                    <div class="mc-step active"><span>1</span> Section</div>
                    <div class="mc-step-line"></div>
                    <div class="mc-step"><span>2</span> Schedule & Room</div>
                </div>
                <div class="mc-field">
                    <label class="mc-field-label">${icon('school', inl)} Section Name *</label>
                    <input type="text" id="mc-sec-name" placeholder="e.g. BSIT-3A, IT-2B" class="mc-input mc-input-lg" autocomplete="off">
                    <span class="mc-field-hint">A unique name for this class section</span>
                </div>
                <div class="mc-field-row">
                    <div class="mc-field">
                        <label class="mc-field-label">${icon('clock', inl)} Schedule *</label>
                        <input type="text" id="mc-schedule" placeholder="MWF 7:30 AM – 9:00 AM" class="mc-input">
                    </div>
                    <div class="mc-field">
                        <label class="mc-field-label">${icon('pin', inl)} Room</label>
                        <input type="text" id="mc-room" placeholder="Lab 201, Room 305" class="mc-input">
                    </div>
                </div>
                <div class="mc-field">
                    <label class="mc-field-label">${icon('users', inl)} Max Students</label>
                    <div class="mc-max-wrap">
                        <input type="number" id="mc-max" value="40" min="1" max="200" class="mc-input mc-input-narrow">
                        <span class="mc-field-hint">Default is 40 students per section</span>
                    </div>
                </div>
            </div>
            <div class="mc-modal-ft">
                <button type="button" class="mc-btn-ghost mc-modal-cancel">Cancel</button>
                <button type="button" class="mc-btn-primary" id="mc-modal-save">
                    ${icon('check', inl)} Create Section
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector('.mc-modal-x').addEventListener('click', close);
    overlay.querySelector('.mc-modal-cancel').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    const nameInput = overlay.querySelector('#mc-sec-name');
    const schedInput = overlay.querySelector('#mc-schedule');
    nameInput?.focus();
    nameInput?.addEventListener('input', () => {
        overlay.querySelectorAll('.mc-step')[0]?.classList.add('active');
    });
    schedInput?.addEventListener('input', () => {
        overlay.querySelectorAll('.mc-step')[1]?.classList.toggle('active', !!schedInput.value.trim());
    });

    overlay.querySelector('#mc-modal-save').addEventListener('click', async () => {
        const payload = {
            subject_id: subject.subject_id,
            subject_offered_id: subject.subject_offered_id,
            section_name: overlay.querySelector('#mc-sec-name').value.trim(),
            schedule: overlay.querySelector('#mc-schedule').value.trim(),
            room: overlay.querySelector('#mc-room').value.trim(),
            max_students: parseInt(overlay.querySelector('#mc-max').value, 10) || 40,
        };

        if (!payload.section_name || !payload.schedule) {
            overlay.querySelector('#mc-modal-alert').innerHTML = '<div class="mc-alert">Section name and schedule are required.</div>';
            return;
        }

        const btn = overlay.querySelector('#mc-modal-save');
        btn.disabled = true;
        btn.textContent = 'Saving…';

        const res = await Api.post('/SectionsAPI.php?action=create-for-subject', payload);
        if (res.success) {
            close();
            render(container, { subject_id: subject.subject_id });
        } else {
            overlay.querySelector('#mc-modal-alert').innerHTML = `<div class="mc-alert">${esc(res.message || 'Failed')}</div>`;
            btn.disabled = false;
            btn.textContent = 'Create Section';
        }
    });
}

async function openManageStudentsModal(container, subject, sectionInfo) {
    const { sectionId, sectionName, subjectCode, enrollmentCode, subjectOfferedId } = sectionInfo;
    const code = enrollmentCode || subjectCode || subject.subject_code || '';
    const joinUrl = enrollmentCode ? buildStudentJoinUrlByEnrollmentCode(enrollmentCode) : buildStudentJoinUrl(code, sectionId);
    const offeredId = String(subjectOfferedId || subject.subject_offered_id || '');
    const [res, pendingRes] = await Promise.all([
        Api.get('/SectionsAPI.php?action=students&section_id=' + sectionId),
        Api.get(`/SectionsAPI.php?action=pending-joins&subject_offered_id=${offeredId}&section_id=${sectionId}`),
    ]);
    const rows = res.success ? res.data : [];
    let pending = pendingRes.success ? (pendingRes.data || []) : [];

    const byStudent = new Map();
    for (const row of rows) {
        const matchesSubject = offeredId
            ? String(row.subject_offered_id) === offeredId
            : String(row.subject_id) === String(subject.subject_id);
        if (!matchesSubject) continue;

        if (!byStudent.has(row.user_student_id)) {
            byStudent.set(row.user_student_id, { ...row, subjects: [] });
        }
        byStudent.get(row.user_student_id).subjects.push(row);
    }
    const students = [...byStudent.values()];

    const overlay = document.createElement('div');
    overlay.className = 'mc-modal-overlay';
    overlay.innerHTML = `
        <div class="mc-modal mc-modal-wide mc-modal-students">
            <div class="mc-modal-hdr">
                <div>
                    <h3>${icon('users', inl)} ${esc(sectionName)}</h3>
                    <p class="mc-modal-sub">Manage enrollment for ${esc(subject.subject_code)}</p>
                </div>
                <button type="button" class="mc-modal-x">&times;</button>
            </div>
            <div class="mc-modal-body">
                <div class="mc-import-code-banner">
                    <div>
                        <span class="mc-class-code-label">Class code for students</span>
                        <button type="button" class="mc-enroll-code lg" data-copy="${esc(code)}">${esc(code)}</button>
                        <div class="mc-qr-box" data-qr-url="${esc(joinUrl)}" id="mc-modal-qr"></div>
                    </div>
                    <p class="mc-class-code-hint">Section <strong>${esc(sectionName)}</strong> — students scan QR or enter <strong>${esc(code)}</strong> in Join Class.</p>
                </div>

                <div class="mc-stu-tabs">
                    <button type="button" class="mc-stu-tab${pending.length ? '' : ' active'}" data-stu-tab="enrolled">Enrolled (${students.length})</button>
                    <button type="button" class="mc-stu-tab${pending.length ? ' active' : ''}" data-stu-tab="pending">Pending (${pending.length})</button>
                    <button type="button" class="mc-stu-tab" data-stu-tab="add">Add Students</button>
                </div>

                <div id="mc-stu-panel-enrolled"${pending.length ? ' hidden' : ''}>
                    ${students.length === 0
                        ? '<p class="mc-empty-text">No students yet. Share the class code or import a list below.</p>'
                        : students.map(st => `
                            <div class="mc-student-row">
                                <div>
                                    <strong>${esc(st.last_name)}, ${esc(st.first_name)}</strong>
                                    <span class="mc-student-id">${esc(st.student_id || '')}</span>
                                </div>
                                ${st.subjects.map(subj => `
                                    <button type="button" class="mc-btn-danger-sm" data-ssid="${subj.student_subject_id}">Remove</button>
                                `).join('')}
                            </div>
                        `).join('')}
                </div>

                <div id="mc-stu-panel-pending"${pending.length ? '' : ' hidden'}>
                    <p class="mc-import-hint">Students who scanned the QR code or entered the class code — nothing enrolls until you approve them here.</p>
                    <div id="mc-pending-list">
                        ${pending.length === 0
                            ? '<p class="mc-empty-text">No pending join requests right now.</p>'
                            : pending.map(p => `
                                <div class="mc-student-row" data-pending-row="${p.request_id}">
                                    <div>
                                        <strong>${esc(p.last_name)}, ${esc(p.first_name)}</strong>
                                        <span class="mc-student-id">${esc(p.student_id || p.email || '')}</span>
                                    </div>
                                    <div class="mc-pending-actions">
                                        <button type="button" class="mc-btn-approve-sm" data-approve="${p.request_id}">Approve</button>
                                        <button type="button" class="mc-btn-danger-sm" data-reject="${p.request_id}">Reject</button>
                                    </div>
                                </div>
                            `).join('')}
                    </div>
                </div>

                <div id="mc-stu-panel-add" hidden>
                    <p class="mc-import-hint">Upload Excel, Word, CSV, PDF, or a photo of a class list. You can also paste student IDs below.</p>
                    <div class="mc-import-drop" id="mc-import-drop">
                        <input type="file" id="mc-import-file" hidden accept=".xlsx,.xls,.csv,.txt,.doc,.docx,.pdf,.ods,.jpg,.jpeg,.png,.gif,.webp,.bmp,.tif,.tiff">
                        <div class="mc-import-drop-inner">
                            ${icon('document', { size: 28, className: 'ui-icon-inline' })}
                            <p><strong>Drop file here</strong> or <button type="button" class="mc-link-btn" id="mc-pick-file">browse</button></p>
                            <span>Excel · Word · CSV · PDF · Image</span>
                        </div>
                        <p class="mc-import-fname" id="mc-import-fname" hidden></p>
                    </div>
                    <div class="mc-field" style="margin-top:14px">
                        <label class="mc-field-label">Or paste student IDs (one per line)</label>
                        <textarea id="mc-import-paste" class="mc-input" rows="4" placeholder="STU-2024-001&#10;STU-2024-002&#10;student@email.com"></textarea>
                    </div>
                    <div id="mc-import-preview"></div>
                    <div class="mc-import-actions">
                        <button type="button" class="mc-btn-ghost" id="mc-preview-import">Preview list</button>
                        <button type="button" class="mc-btn-primary" id="mc-run-import">Add matched students</button>
                    </div>
                </div>
            </div>
            <div class="mc-modal-ft">
                <button type="button" class="mc-btn-ghost mc-modal-cancel">Close</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector('.mc-modal-x').addEventListener('click', close);
    overlay.querySelector('.mc-modal-cancel').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    overlay.querySelectorAll('[data-copy]').forEach(el => {
        el.addEventListener('click', () => {
            navigator.clipboard.writeText(el.dataset.copy);
            showMcPopup('Class code copied to clipboard.', { title: 'Copied', type: 'success' });
        });
    });

    const qrEl = overlay.querySelector('[data-qr-url]');
    if (qrEl?.dataset.qrUrl) {
        renderQrInto(qrEl, qrEl.dataset.qrUrl, 148).catch(() => {});
    }

    overlay.querySelectorAll('.mc-stu-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            overlay.querySelectorAll('.mc-stu-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const which = tab.dataset.stuTab;
            overlay.querySelector('#mc-stu-panel-enrolled').hidden = which !== 'enrolled';
            overlay.querySelector('#mc-stu-panel-pending').hidden  = which !== 'pending';
            overlay.querySelector('#mc-stu-panel-add').hidden      = which !== 'add';
        });
    });

    // Approve/Reject — decrements the tab count + card badge in place rather
    // than reloading the whole modal, so approving several requests in a row
    // stays snappy.
    function updatePendingTabCount() {
        overlay.querySelector('[data-stu-tab="pending"]').textContent = `Pending (${pending.length})`;
        if (pending.length === 0) {
            overlay.querySelector('#mc-pending-list').innerHTML = '<p class="mc-empty-text">No pending join requests right now.</p>';
        }
        const cardBadge = container.querySelector(`[data-pending-badge="${offeredId}|${sectionId}"]`);
        if (cardBadge) {
            if (pending.length > 0) { cardBadge.textContent = String(pending.length); cardBadge.hidden = false; }
            else cardBadge.hidden = true;
        }
    }

    overlay.querySelector('#mc-pending-list')?.addEventListener('click', async (e) => {
        const approveBtn = e.target.closest('[data-approve]');
        const rejectBtn  = e.target.closest('[data-reject]');
        if (!approveBtn && !rejectBtn) return;
        const btn = approveBtn || rejectBtn;
        const requestId = parseInt(btn.dataset.approve || btn.dataset.reject, 10);
        const action = approveBtn ? 'approve-join' : 'reject-join';
        btn.disabled = true;

        const resDecide = await Api.post(`/SectionsAPI.php?action=${action}`, { request_id: requestId });
        if (!resDecide.success) {
            showMcPopup(resDecide.message || 'Failed to update this request.', { title: 'Error', type: 'error' });
            btn.disabled = false;
            return;
        }
        pending = pending.filter(p => p.request_id !== requestId);
        overlay.querySelector(`[data-pending-row="${requestId}"]`)?.remove();
        updatePendingTabCount();
        if (approveBtn) {
            showMcPopup('Student approved and enrolled.', { title: 'Approved', type: 'success' });
        }
    });

    const fileInput = overlay.querySelector('#mc-import-file');
    const fnameEl = overlay.querySelector('#mc-import-fname');
    const pickFile = () => fileInput.click();
    overlay.querySelector('#mc-pick-file')?.addEventListener('click', pickFile);
    overlay.querySelector('#mc-import-drop')?.addEventListener('click', e => {
        if (e.target.closest('#mc-pick-file')) return;
        pickFile();
    });
    const dropZone = overlay.querySelector('#mc-import-drop');
    dropZone?.addEventListener('dragover', e => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });
    dropZone?.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone?.addEventListener('drop', e => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        const file = e.dataTransfer?.files?.[0];
        if (!file) return;
        const dt = new DataTransfer();
        dt.items.add(file);
        fileInput.files = dt.files;
        onFileSelected(file);
    });

    async function onFileSelected(file) {
        if (!file) return;
        fnameEl.hidden = false;
        fnameEl.textContent = file.name;
        await runImportPreview();
    }

    fileInput?.addEventListener('change', () => {
        if (fileInput.files?.[0]) onFileSelected(fileInput.files[0]);
    });

    function buildImportFormData() {
        const fd = new FormData();
        fd.append('section_id', sectionId);
        if (subjectOfferedId) fd.append('subject_offered_id', subjectOfferedId);
        if (fileInput?.files?.[0]) fd.append('file', fileInput.files[0]);
        const paste = overlay.querySelector('#mc-import-paste')?.value?.trim();
        if (paste) fd.append('student_list', paste);
        return fd;
    }

    function renderPreview(data) {
        const el = overlay.querySelector('#mc-import-preview');
        if (!data) { el.innerHTML = ''; return; }
        const parsed = data.parsed_count ?? ((data.parsed_ids?.length || 0) + (data.parsed_emails?.length || 0));
        const sources = (data.sources || []).map(s =>
            `<li>${esc(s.name || s.type)}${s.format ? ` <span class="mc-preview-src">(${esc(s.format)})</span>` : ''} — ${s.ids_found || 0} ID(s)</li>`
        ).join('');
        el.innerHTML = `
            <div class="mc-preview-box">
                <p class="mc-preview-title">Read ${parsed} ID(s) from file · ${data.matched?.length || 0} matched · ${data.not_found?.length || 0} not in system</p>
                ${sources ? `<ul class="mc-preview-sources">${sources}</ul>` : ''}
                ${(data.matched || []).length ? `
                <table class="mc-preview-table">
                    <thead><tr><th>Student ID</th><th>Name</th></tr></thead>
                    <tbody>${data.matched.map(s => `
                        <tr><td>${esc(s.student_id)}</td><td>${esc(s.name)}</td></tr>
                    `).join('')}</tbody>
                </table>` : '<p class="mc-empty-text">No matching student accounts found.</p>'}
                ${(data.not_found || []).length ? `<p class="mc-preview-warn">Not found: ${data.not_found.map(n => esc(n.value)).join(', ')}</p>` : ''}
            </div>
        `;
    }

    async function runImportPreview() {
        const previewEl = overlay.querySelector('#mc-import-preview');
        const hasFile = !!fileInput?.files?.[0];
        const hasPaste = !!overlay.querySelector('#mc-import-paste')?.value?.trim();
        if (!hasFile && !hasPaste) {
            previewEl.innerHTML = '<div class="mc-alert">Upload a file or paste student IDs first.</div>';
            return null;
        }
        previewEl.innerHTML = '<p class="mc-empty-text">Reading file and analyzing list…</p>';
        try {
            const r = await Api.postForm('/SectionsAPI.php?action=preview-import-students', buildImportFormData());
            if (r.success) {
                renderPreview(r.data);
                return r.data;
            }
            previewEl.innerHTML = `<div class="mc-alert">${esc(r.message)}</div>`;
            return null;
        } catch {
            previewEl.innerHTML = '<div class="mc-alert">Could not read the file. Try CSV/Excel or paste IDs below.</div>';
            return null;
        }
    }

    overlay.querySelector('#mc-preview-import')?.addEventListener('click', runImportPreview);

    overlay.querySelector('#mc-run-import')?.addEventListener('click', async () => {
        const btn = overlay.querySelector('#mc-run-import');
        btn.disabled = true;
        btn.textContent = 'Adding…';
        const r = await Api.postForm('/SectionsAPI.php?action=bulk-import-students', buildImportFormData());
        if (r.success) {
            close();
            showImportResultPopup(r.data, r.message);
            render(container, { subject_id: subject.subject_id });
        } else {
            showMcPopup(r.message || 'Import failed. Check the file format and try again.', { title: 'Import failed', type: 'error' });
            btn.disabled = false;
            btn.textContent = 'Add matched students';
        }
    });

    overlay.querySelectorAll('[data-ssid]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const ok = await showMcConfirm('Remove this student from the class?');
            if (!ok) return;
            btn.disabled = true;
            const r = await Api.post('/SectionsAPI.php?action=unenroll', {
                student_subject_id: parseInt(btn.dataset.ssid, 10)
            });
            if (r.success) {
                close();
                showMcPopup('Student removed from this class.', { title: 'Removed', type: 'success' });
                render(container, { subject_id: subject.subject_id });
            } else {
                showMcPopup(r.message || 'Could not remove student.', { title: 'Error', type: 'error' });
                btn.disabled = false;
            }
        });
    });
}

function emptyState(msg, backHref) {
    return `
        <style>${styles()}</style>
        <div class="mc-page">
            <div class="mc-empty-state">
                <div class="mc-empty-icon">${iconLg('book')}</div>
                <p>${esc(msg)}</p>
                ${backHref ? `<a href="${backHref}" class="mc-btn-primary">Back</a>` : ''}
            </div>
        </div>
    `;
}

function openQuizPicker(subject, sections, sectionId = null) {
    openQuizCreatePicker({
        presetSubjectId: subject.subject_id,
        presetSectionId: sectionId,
        lockSubject: true,
        classesData: [{ ...subject, sections }],
        backTarget: 'my-classes',
    });
}

function showMcPopup(message, { title = 'Notice', type = 'info', onClose } = {}) {
    const iconMap = {
        success: '<svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="#059669" stroke-width="2"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="10"/></svg>',
        error: '<svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="#DC2626" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>',
        info: '<svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="#00461B" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>',
    };
    const overlay = document.createElement('div');
    overlay.className = 'mc-popup-overlay';
    overlay.innerHTML = `
        <div class="mc-popup mc-popup-${type}" role="dialog" aria-modal="true">
            <div class="mc-popup-icon">${iconMap[type] || iconMap.info}</div>
            <h4 class="mc-popup-title">${esc(title)}</h4>
            <p class="mc-popup-msg">${esc(message)}</p>
            <button type="button" class="mc-btn-primary mc-popup-ok">OK</button>
        </div>
    `;
    const close = () => {
        overlay.remove();
        onClose?.();
    };
    overlay.querySelector('.mc-popup-ok').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    document.body.appendChild(overlay);
    return close;
}

function showMcConfirm(message, { title = 'Confirm', confirmLabel = 'Yes', cancelLabel = 'Cancel' } = {}) {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'mc-popup-overlay';
        overlay.innerHTML = `
            <div class="mc-popup mc-popup-confirm" role="dialog" aria-modal="true">
                <h4 class="mc-popup-title">${esc(title)}</h4>
                <p class="mc-popup-msg">${esc(message)}</p>
                <div class="mc-popup-actions">
                    <button type="button" class="mc-btn-ghost mc-popup-cancel">${esc(cancelLabel)}</button>
                    <button type="button" class="mc-btn-primary mc-popup-confirm">${esc(confirmLabel)}</button>
                </div>
            </div>
        `;
        const done = (val) => { overlay.remove(); resolve(val); };
        overlay.querySelector('.mc-popup-cancel').addEventListener('click', () => done(false));
        overlay.querySelector('.mc-popup-confirm').addEventListener('click', () => done(true));
        overlay.addEventListener('click', e => { if (e.target === overlay) done(false); });
        document.body.appendChild(overlay);
    });
}

function showImportResultPopup(data, message) {
    const added = data?.added || [];
    const skipped = data?.skipped || [];
    const notFound = data?.not_found || [];
    const parts = [];
    if (message) parts.push(message);
    else parts.push(`${added.length} student(s) added successfully.`);

    const overlay = document.createElement('div');
    overlay.className = 'mc-popup-overlay';
    overlay.innerHTML = `
        <div class="mc-popup mc-popup-wide mc-popup-success" role="dialog" aria-modal="true">
            <div class="mc-popup-icon">${'<svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="#059669" stroke-width="2"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="10"/></svg>'}</div>
            <h4 class="mc-popup-title">Students added</h4>
            <p class="mc-popup-msg">${esc(parts.join(' '))}</p>
            ${added.length ? `
                <div class="mc-popup-section">
                    <strong>Added (${added.length})</strong>
                    <table class="mc-preview-table">
                        <thead><tr><th>Student ID</th><th>Name</th></tr></thead>
                        <tbody>${added.map(s => `
                            <tr><td>${esc(s.student_id)}</td><td>${esc(s.name)}</td></tr>
                        `).join('')}</tbody>
                    </table>
                </div>` : ''}
            ${skipped.length ? `
                <div class="mc-popup-section mc-popup-warn">
                    <strong>Already enrolled (${skipped.length})</strong>
                    <p>${skipped.map(s => esc(s.student_id || s)).join(', ')}</p>
                </div>` : ''}
            ${notFound.length ? `
                <div class="mc-popup-section mc-popup-warn">
                    <strong>Not found (${notFound.length})</strong>
                    <p>${notFound.map(n => esc(n.value || n)).join(', ')}</p>
                </div>` : ''}
            <button type="button" class="mc-btn-primary mc-popup-ok">Done</button>
        </div>
    `;
    overlay.querySelector('.mc-popup-ok').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
}

function styles() {
    return `
        .mc-page { width:100%; min-height:calc(100vh - 120px); background:transparent; }
        .mc-loading { display:flex; justify-content:center; align-items:center; min-height:320px; }
        .mc-spin { width:42px; height:42px; border:3px solid #eee; border-top-color:${G}; border-radius:50%; animation:mcSpin .75s linear infinite; }
        @keyframes mcSpin { to { transform:rotate(360deg); } }

        .mc-hero { display:flex; justify-content:space-between; align-items:flex-start; gap:20px; flex-wrap:wrap;
            padding:28px 32px; margin-bottom:24px; border-radius:16px; color:#fff;
            background:${G}; box-shadow:0 2px 10px rgba(0,70,27,.1); }
        .mc-hero-label { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:1px; opacity:.75; margin:0 0 6px; }
        .mc-hero-title { font-size:28px; font-weight:800; margin:0 0 6px; }
        .mc-hero-sub { font-size:14px; opacity:.88; margin:0 0 12px; max-width:480px; }
        .mc-hero-badge { display:inline-block; font-size:12px; font-weight:600; background:rgba(255,255,255,.2);
            border:none; padding:5px 12px; border-radius:20px; }
        .mc-btn-outline { padding:10px 18px; background:#fff; color:${G}; border-radius:10px; font-weight:700;
            font-size:14px; text-decoration:none; white-space:nowrap; }
        .mc-view-tabs { display:flex; gap:4px; padding:4px; background:rgba(255,255,255,.15); border-radius:12px; align-self:flex-start; }
        .mc-view-tab { display:inline-flex; align-items:center; gap:6px; padding:8px 16px; border-radius:8px;
            font-size:13px; font-weight:700; color:rgba(255,255,255,.75); text-decoration:none; transition:all .15s; }
        .mc-view-tab:hover { color:#fff; background:rgba(255,255,255,.15); }
        .mc-view-tab.active { background:#fff; color:${G}; }

        .mc-back { display:inline-flex; align-items:center; gap:6px; font-size:13px; font-weight:600; color:${G};
            text-decoration:none; margin-bottom:16px; }
        .mc-back:hover { text-decoration:underline; }

        .mc-crumb { display:flex; align-items:center; gap:8px; flex-wrap:wrap; font-size:13px; font-weight:600; margin-bottom:16px; }
        .mc-crumb a { color:#6B7280; text-decoration:none; transition:color .15s; }
        .mc-crumb a:hover { color:${G}; }
        .mc-crumb-sep { color:#9CA3AF; font-weight:400; }
        .mc-crumb-current { color:#111; }

        .mc-subj-hero { display:flex; gap:0; border:2px solid #111; border-radius:14px; overflow:hidden; margin-bottom:24px;
            background:#fff; }
        .mc-subj-hero-band { padding:24px 28px; color:#fff; min-width:240px; position:relative; overflow:hidden; }
        .mc-subj-code { font-size:11px; font-weight:700; font-family:monospace; opacity:.9; }
        .mc-subj-hero-band h1 { font-size:22px; font-weight:800; margin:6px 0 4px; }
        .mc-subj-prog { font-size:12px; opacity:.85; }
        .mc-subj-hero-meta { flex:1; padding:24px 28px; display:flex; flex-direction:column; justify-content:center; gap:12px; }
        .mc-subj-hero-meta p { margin:0; color:#6B7280; font-size:14px; }
        /* Row pairs the "N sections" text with the + button right beside
           it, so the button reads as "add a section here" rather than a
           generic floating action disconnected from that count. */
        .mc-subj-hero-meta-row { display:flex; align-items:center; gap:10px; }
        /* Single "+" FAB replacing the old 4-button row (Add Lesson / Post
           Announcement / Create Quiz / Add Section) — clicking it radiates
           the four actions out in an arc around the button itself (each one
           starts stacked at dead center, scaled to nothing, then springs
           out to its own point on the arc) instead of a permanently-visible
           row or a plain stacked list above it. */
        .mc-fab-wrap { position:relative; display:inline-flex; flex-shrink:0; }
        .mc-fab-toggle { width:32px; height:32px; border-radius:50%; border:none; background:${G}; color:#fff;
            display:flex; align-items:center; justify-content:center; cursor:pointer;
            box-shadow:0 3px 10px rgba(0,70,27,.3); transition:background .15s, transform .2s; position:relative; z-index:21; }
        .mc-fab-toggle:hover { background:${G2}; }
        .mc-fab-toggle svg { transition:transform .2s; }
        .mc-fab-toggle.open { background:#111; }
        .mc-fab-toggle.open svg { transform:rotate(45deg); }

        /* position:fixed (not absolute) and a zero-size box whose top-left
           corner is set via JS to the toggle button's real on-screen center
           (see the click handler below). This is deliberate: .mc-subj-hero
           has overflow:hidden for its rounded corners, and the arc below
           radiates up to ~89px above the button — plain absolute
           positioning gets silently clipped by that boundary, chopping and
           scrambling the icons. Fixed positioning is anchored to the
           viewport instead, so it escapes that clip entirely regardless of
           where the button sits on the page. */
        .mc-fab-menu { position:fixed; top:0; left:0; width:0; height:0; pointer-events:none; z-index:9999; }
        .mc-fab-menu[hidden] { display:none; }
        .mc-fab-item { position:absolute; top:0; left:0; display:flex; flex-direction:column; align-items:center;
            gap:5px; background:none; border:none; cursor:pointer; padding:0; pointer-events:auto;
            opacity:0; transform:translate(-50%,-50%) scale(.3);
            transition:transform .26s cubic-bezier(.34,1.56,.64,1), opacity .18s; }
        /* Arc above-and-around the button — angles swept from upper-left to
           upper-right so nothing lands underneath where the button itself
           (or the page content below the header) would block it. Each
           item's own final point = center + (radius * sin/cos of its own
           angle on that arc), pre-computed since not every target browser
           supports CSS trig functions (sin()/cos()) yet.
           The x-gap between the two inner points (2 and 3) and between
           each inner/outer pair (1-2, 3-4) must all exceed the label
           chip's own width (~64px, fixed below) or adjacent labels run
           into each other and merge into unreadable text — that was the
           actual cause of the "Post Announce Create Qui" collision. */
        .mc-fab-menu:not([hidden]) .mc-fab-item { opacity:1; }
        .mc-fab-menu:not([hidden]) .mc-fab-item:nth-child(1) { transform:translate(calc(-50% - 104px), calc(-50% - 28px)) scale(1); transition-delay:.02s; }
        .mc-fab-menu:not([hidden]) .mc-fab-item:nth-child(2) { transform:translate(calc(-50% - 52px), calc(-50% - 96px)) scale(1); transition-delay:.06s; }
        .mc-fab-menu:not([hidden]) .mc-fab-item:nth-child(3) { transform:translate(calc(-50% + 52px), calc(-50% - 96px)) scale(1); transition-delay:.10s; }
        .mc-fab-menu:not([hidden]) .mc-fab-item:nth-child(4) { transform:translate(calc(-50% + 104px), calc(-50% - 28px)) scale(1); transition-delay:.14s; }
        .mc-fab-item-icon { width:40px; height:40px; border-radius:50%; background:#fff; border:1px solid #111;
            display:flex; align-items:center; justify-content:center; color:${G};
            box-shadow:0 3px 10px rgba(0,0,0,.25); transition:background .15s, transform .15s; }
        .mc-fab-item:hover .mc-fab-item-icon { background:${GL}; transform:scale(1.08); }
        /* Fixed width + wrapping (not nowrap) keeps every chip the same
           compact footprint regardless of label length, so the spacing
           above is guaranteed enough no matter what these buttons get
           renamed to later. */
        .mc-fab-item-label { font-size:9.5px; font-weight:700; color:#111; text-align:center; line-height:1.2;
            width:64px; white-space:normal; text-shadow:0 1px 3px rgba(255,255,255,.9), 0 0 6px rgba(255,255,255,.7); }
        @media(prefers-reduced-motion:reduce) {
            .mc-fab-item, .mc-fab-toggle svg, .mc-fab-toggle { transition:none; }
        }

        .mc-toolbar { display:flex; align-items:center; gap:12px; margin-bottom:20px; padding:14px 16px;
            background:#F3F4F6; border:none; border-radius:12px; }
        .mc-search-wrap { flex:1; position:relative; }
        .mc-search-wrap svg { position:absolute; left:12px; top:50%; transform:translateY(-50%); color:#9CA3AF; }
        .mc-search { width:100%; padding:10px 14px 10px 38px; border:none; background:#ECEFF1; border-radius:8px; font-size:14px; }
        .mc-count { font-size:12px; font-weight:700; color:${G}; background:${GL}; padding:8px 14px; border-radius:20px; }

        .mc-subj-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:20px; }
        .mc-subj-card-wrap { position:relative; border-radius:14px; overflow:hidden; display:flex; flex-direction:column; }
        .mc-subj-card-wrap--archived { opacity:.85; }
        .mc-subj-card { text-decoration:none; color:inherit; border:none; border-radius:14px; overflow:hidden;
            background:#fff; box-shadow:none; transition:background .15s; display:flex; flex-direction:column; flex:1; }
        .mc-subj-card:hover { background:#F9FAFB; }
        .mc-subj-top { padding:20px 18px; min-height:100px; display:flex; flex-direction:column; justify-content:flex-end; position:relative; overflow:hidden; }
        .mc-subj-card-code { font-size:11px; font-weight:700; font-family:monospace; color:rgba(255,255,255,.9); }
        .mc-subj-top h3 { font-size:17px; font-weight:700; color:#fff; margin:6px 0 0; line-height:1.3; }
        .mc-subj-body { padding:16px 18px; flex:1; display:flex; flex-direction:column; gap:8px; }
        .mc-stat-row { font-size:13px; color:#374151; display:flex; align-items:center; gap:8px; }
        .mc-subj-link { margin-top:auto; font-size:12px; font-weight:700; color:${G}; padding-top:10px; }
        .mc-archived-badge { display:inline-block; font-size:10px; font-weight:700; text-transform:uppercase;
            background:rgba(0,0,0,.25); color:#fff; padding:2px 7px; border-radius:4px; margin-top:6px; letter-spacing:.5px; }
        .mc-archive-btn { width:100%; padding:9px 14px; background:#F3F4F6; color:#374151; border:1px solid ${BORDER};
            border-top:none; border-radius:0 0 14px 14px; font-size:12px; font-weight:700; cursor:pointer;
            transition:background .15s; text-align:center; }
        .mc-archive-btn:hover { background:#E5E7EB; }
        .mc-archive-btn--restore { background:#F0FDF4; color:${G}; border-color:#BBF7D0; }
        .mc-archive-btn--restore:hover { background:#DCFCE7; }
        .mc-archive-btn:disabled { opacity:.5; cursor:not-allowed; }
        .mc-archive-divider { grid-column:1/-1; display:flex; align-items:center; gap:14px; padding:8px 0; margin-top:8px; }
        .mc-archive-divider::before,.mc-archive-divider::after { content:''; flex:1; height:1px; background:${BORDER}; }
        .mc-archive-divider-label { font-size:12px; font-weight:700; color:#6B7280; white-space:nowrap; }

        .mc-sec-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(190px,1fr)); gap:10px; }
        .mc-sec-card { border:1px solid #111; border-radius:10px; padding:9px; background:#fff;
            box-shadow:none; transition:background .15s; }
        .mc-sec-card:hover { background:#F9FAFB; }
        .mc-sec-head { display:flex; justify-content:space-between; align-items:flex-start; gap:6px; margin-bottom:6px; }
        .mc-sec-name { font-size:13px; font-weight:700; color:#111; margin:0 0 2px; }
        .mc-class-code-box { margin-top:4px; }
        .mc-class-code-label { display:block; font-size:8px; font-weight:700; text-transform:uppercase;
            letter-spacing:.3px; color:#6B7280; margin-bottom:2px; }
        .mc-class-code-hint { display:block; font-size:9px; color:#9CA3AF; margin-top:2px; }
        .mc-qr-box { margin-top:4px; text-align:center; }
        .mc-qr-box canvas,
        .mc-qr-box img.enr-qr-canvas { border-radius:6px; border:1px solid #e5e7eb; width:120px; height:120px; }
        .mc-enroll-code { font-family:monospace; font-size:10px; font-weight:800; color:${G};
            background:#fff; padding:3px 7px; border-radius:5px; border:1px dashed #111;
            cursor:pointer; display:inline-flex; align-items:center; gap:4px; }
        .mc-enroll-code.lg { font-size:18px; padding:10px 16px; letter-spacing:1px; }
        .mc-enroll-code:hover { background:#F9FAFB; }
        .mc-modal-sub { font-size:12px; color:#6B7280; margin:4px 0 0; }
        .mc-import-code-banner { background:#fff; border:1px solid #111; border-radius:12px;
            padding:14px 16px; margin-bottom:18px; }
        .mc-stu-tabs { display:flex; gap:8px; margin-bottom:16px; border-bottom:1px solid #E5E7EB; }
        .mc-stu-tab { padding:10px 16px; border:none; background:none; font-size:13px; font-weight:700;
            color:#6B7280; cursor:pointer; border-bottom:2px solid transparent; margin-bottom:-1px; }
        .mc-stu-tab.active { color:${G}; border-bottom-color:${G}; }
        .mc-import-hint { font-size:13px; color:#6B7280; margin:0 0 12px; }
        .mc-import-drop { border:2px dashed #D1D5DB; border-radius:12px; padding:24px; text-align:center;
            background:#FAFAFA; cursor:pointer; transition:border-color .15s, background .15s; }
        .mc-import-drop:hover, .mc-import-drop.dragover { border-color:${G}; background:#F8FDF9; }
        .mc-preview-sources { margin:0 0 10px; padding-left:18px; font-size:12px; color:#6B7280; }
        .mc-preview-src { color:#9CA3AF; font-weight:400; }
        .mc-import-drop-inner p { margin:8px 0 4px; font-size:14px; color:#374151; }
        .mc-import-drop-inner span { font-size:11px; color:#9CA3AF; }
        .mc-link-btn { background:none; border:none; color:${G}; font-weight:700; cursor:pointer; text-decoration:underline; }
        .mc-import-fname { font-size:12px; color:${G}; font-weight:600; margin-top:8px; }
        .mc-import-actions { display:flex; gap:10px; margin-top:16px; flex-wrap:wrap; }
        .mc-preview-box { margin-top:14px; padding:12px 14px; background:#F9FAFB; border:1px solid #E5E7EB; border-radius:10px; }
        .mc-preview-title { font-size:13px; font-weight:700; color:#111; margin:0 0 8px; }
        .mc-preview-list { margin:0; padding-left:18px; font-size:13px; color:#374151; }
        .mc-preview-table { width:100%; border-collapse:collapse; margin-top:4px; font-size:13px; background:#fff;
            border:1px solid #E5E7EB; border-radius:8px; overflow:hidden; }
        .mc-preview-table th { text-align:left; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.4px;
            color:#6B7280; background:#F3F4F6; padding:8px 12px; border-bottom:1px solid #E5E7EB; }
        .mc-preview-table td { padding:7px 12px; color:#374151; border-bottom:1px solid #F3F4F6; }
        .mc-preview-table tr:last-child td { border-bottom:none; }
        .mc-preview-table td:first-child { font-weight:700; color:${G}; white-space:nowrap; }
        .mc-preview-warn { font-size:12px; color:#B45309; margin:8px 0 0; }
        .mc-modal-students { max-width:640px; }
        .mc-sec-badge { font-size:8px; font-weight:700; text-transform:uppercase; padding:2px 6px; border-radius:4px;
            background:${GL}; color:${G}; }
        .mc-sec-meta { font-size:10px; color:#6B7280; display:flex; flex-direction:column; gap:3px; margin-bottom:6px; }
        .mc-sec-meta div { display:flex; align-items:center; gap:4px; }
        .mc-sec-actions { display:flex; flex-wrap:wrap; gap:5px; }

        .mc-btn-primary { background:${G}; color:#fff; border:none; padding:10px 18px; border-radius:10px;
            font-size:13px; font-weight:700; cursor:pointer; text-decoration:none; display:inline-flex; align-items:center; }
        .mc-btn-primary:hover { background:${G2}; }
        .mc-btn-sm { padding:5px 9px; font-size:10px; }
        .mc-btn-ghost { background:#fff; color:#374151; border:1px solid ${BORDER}; padding:8px 14px; border-radius:10px;
            font-size:12px; font-weight:600; cursor:pointer; }
        .mc-btn-danger { color:#B91C1C; border-color:#FECACA; }
        .mc-btn-danger-sm { font-size:11px; font-weight:700; color:#B91C1C; background:#FEE2E2; border:none;
            padding:6px 10px; border-radius:6px; cursor:pointer; }
        .mc-btn-approve-sm { font-size:11px; font-weight:700; color:${G}; background:${GL}; border:none;
            padding:6px 10px; border-radius:6px; cursor:pointer; }
        .mc-pending-actions { display:flex; gap:6px; }

        /* Card action icon — replaces the old separate "Add Student" text
           button + "Remove" button: one icon opens the modal where both
           adding a student AND approving/rejecting QR-code join requests
           happen (see openManageStudentsModal()'s Pending tab). The badge
           only appears once a pending-count fetch finds requests waiting —
           see the [data-pending-badge] handler in renderSubjectSections(). */
        .mc-btn-manage-people { position:relative; display:inline-flex; align-items:center; justify-content:center;
            width:34px; height:34px; border-radius:10px; border:1px solid ${BORDER}; background:#fff;
            color:#374151; cursor:pointer; flex-shrink:0; }
        .mc-btn-manage-people:hover { background:#F9FAFB; border-color:${G}; color:${G}; }
        .mc-manage-people-badge { position:absolute; top:-6px; right:-6px; min-width:16px; height:16px; padding:0 4px;
            border-radius:9px; background:#DC2626; color:#fff; font-size:10px; font-weight:800;
            display:flex; align-items:center; justify-content:center; line-height:1; }
        /* display:flex above has the same specificity as the browser's own
           [hidden]{display:none} default and loads after it, so it was
           silently winning — the badge showed "0" on every card regardless
           of the hidden attribute JS sets when there's nothing pending.
           This re-asserts hidden wins. */
        .mc-manage-people-badge[hidden] { display:none; }

        .mc-empty-state, .mc-empty-inline { text-align:center; padding:48px 24px; border:2px dashed ${BORDER};
            border-radius:16px; background:#FAFAFA; }
        .mc-empty-icon { margin-bottom:12px; }
        .mc-empty-text { color:#9CA3AF; text-align:center; padding:20px 0; }
        .mc-no-results { text-align:center; color:#9CA3AF; padding:24px; }

        .mc-modal-overlay { position:fixed; inset:0; background:rgba(15,23,42,.5); backdrop-filter:blur(4px);
            display:flex; align-items:center; justify-content:center; z-index:2000; padding:20px; animation:mcFadeIn .2s ease; }
        @keyframes mcFadeIn { from { opacity:0; } to { opacity:1; } }
        .mc-modal { background:#fff; border-radius:18px; width:100%; max-width:480px; max-height:92vh; overflow:hidden;
            display:flex; flex-direction:column; box-shadow:0 24px 48px rgba(0,0,0,.18); animation:mcSlideUp .25s ease; }
        @keyframes mcSlideUp { from { transform:translateY(16px); opacity:0; } to { transform:translateY(0); opacity:1; } }
        .mc-modal-wide { max-width:560px; }
        .mc-modal-create { max-width:520px; }
        .mc-modal-create-hdr { padding:22px 24px; color:#fff; display:flex; justify-content:space-between; align-items:flex-start; gap:12px; }
        .mc-modal-create-label { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.8px; opacity:.8; margin:0 0 4px; }
        .mc-modal-create-hdr h3 { font-size:22px; font-weight:800; margin:0 0 2px; font-family:monospace; }
        .mc-modal-create-sub { font-size:13px; margin:0; opacity:.9; }
        .mc-modal-hdr { padding:18px 22px; border-bottom:1px solid #f0f0f0; display:flex; justify-content:space-between; align-items:center; }
        .mc-modal-hdr h3 { font-size:17px; font-weight:700; margin:0; }
        .mc-modal-x { background:none; border:none; font-size:24px; cursor:pointer; color:#9CA3AF; width:32px; height:32px; border-radius:8px; }
        .mc-modal-x-light { color:#fff; background:rgba(255,255,255,.15); }
        .mc-modal-x-light:hover { background:rgba(255,255,255,.25); }
        .mc-modal-body { padding:22px 24px; overflow-y:auto; flex:1; }
        .mc-modal-ft { padding:16px 24px; border-top:1px solid #f0f0f0; display:flex; justify-content:flex-end; gap:10px; background:#fafafa; }
        .mc-steps { display:flex; align-items:center; gap:8px; margin-bottom:20px; padding:12px 14px; background:#F9FAFB; border-radius:10px; }
        .mc-step { display:flex; align-items:center; gap:6px; font-size:12px; font-weight:600; color:#9CA3AF; }
        .mc-step span { width:22px; height:22px; border-radius:50%; background:#E5E7EB; color:#6B7280; display:flex; align-items:center;
            justify-content:center; font-size:11px; font-weight:800; }
        .mc-step.active { color:${G}; }
        .mc-step.active span { background:${G}; color:#fff; }
        .mc-step-line { flex:1; height:2px; background:#E5E7EB; min-width:24px; }
        .mc-field { margin-bottom:16px; }
        .mc-field-label { display:flex; align-items:center; gap:6px; font-size:12px; font-weight:700; color:#374151; margin-bottom:7px; }
        .mc-field-hint { display:block; font-size:11px; color:#9CA3AF; margin-top:5px; font-weight:400; }
        .mc-input { width:100%; padding:11px 14px; border:1.5px solid ${BORDER}; border-radius:10px; font-size:14px; box-sizing:border-box;
            transition:border-color .15s, box-shadow .15s; }
        .mc-input:focus { outline:none; border-color:${G}; box-shadow:0 0 0 3px rgba(0,70,27,.1); }
        .mc-input-lg { font-size:15px; font-weight:600; }
        .mc-input-narrow { max-width:120px; }
        .mc-max-wrap { display:flex; flex-direction:column; gap:4px; }
        .mc-field-row { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
        .mc-modal-hint { font-size:13px; color:#6B7280; margin-bottom:16px; }
        .mc-alert { background:#FEE2E2; color:#B91C1C; padding:10px 14px; border-radius:8px; font-size:13px; margin-bottom:12px; }
        .mc-student-row { display:flex; justify-content:space-between; align-items:center; padding:12px 0; border-bottom:1px solid #f0f0f0; }
        .mc-student-id { display:block; font-size:11px; color:#9CA3AF; }
        .mc-popup-overlay { position:fixed; inset:0; background:rgba(15,23,42,.55); backdrop-filter:blur(4px);
            display:flex; align-items:center; justify-content:center; z-index:4000; padding:20px; animation:mcFadeIn .2s ease; }
        .mc-popup { background:#fff; border-radius:16px; padding:28px 24px 22px; max-width:400px; width:100%;
            text-align:center; box-shadow:0 20px 50px rgba(0,0,0,.2); animation:mcSlideUp .25s ease; }
        .mc-popup-wide { max-width:480px; text-align:left; }
        .mc-popup-icon { margin-bottom:12px; display:flex; justify-content:center; }
        .mc-popup-wide .mc-popup-icon { justify-content:flex-start; }
        .mc-popup-title { font-size:18px; font-weight:800; color:#111; margin:0 0 8px; }
        .mc-popup-msg { font-size:14px; color:#4B5563; margin:0 0 20px; line-height:1.5; }
        .mc-popup-ok { width:100%; justify-content:center; }
        .mc-popup-wide .mc-popup-ok { width:auto; margin-top:8px; }
        .mc-popup-actions { display:flex; gap:10px; justify-content:flex-end; }
        .mc-popup-section { margin:12px 0; padding:12px; background:#F9FAFB; border-radius:10px; font-size:13px; }
        .mc-popup-section strong { display:block; margin-bottom:6px; color:#111; }
        .mc-popup-list { margin:0; padding-left:18px; color:#374151; }
        .mc-popup-warn { background:#FFFBEB; color:#92400E; }
        .mc-popup-warn strong { color:#B45309; }

        @media(max-width:768px) {
            .mc-subj-hero { flex-direction:column; }
            .mc-field-row { grid-template-columns:1fr; }
            .mc-hero { padding:22px 20px; }
        }

        /* Narrow/mobile — the section card grid collapses to one column
           here, so the aggressive desktop-density spacing (needed there to
           fit many cards per row) just reads as cramped with nothing else
           to compete with for space. Give the card room back at this width. */
        @media(max-width:480px) {
            .mc-sec-grid { grid-template-columns:1fr; gap:14px; }
            .mc-sec-card { padding:16px; }
            .mc-sec-name { font-size:16px; }
            .mc-qr-box canvas,
            .mc-qr-box img.enr-qr-canvas { width:150px; height:150px; }
            .mc-enroll-code { font-size:13px; padding:6px 12px; }
            .mc-sec-meta { font-size:12px; gap:5px; }
            .mc-btn-manage-people { width:40px; height:40px; }
        }
    `;
}

function applyPageBg(container) {
    container.style.background = '#fff';
    const pageContent = container.closest('.page-content');
    if (pageContent) {
        pageContent.style.background = '#fff';
        pageContent.classList.add('mc-page-white');
    }
}

function esc(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
}
