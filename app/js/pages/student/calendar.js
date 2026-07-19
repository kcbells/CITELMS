/**
 * Student — global Calendar (aggregates lessons/quizzes/announcements across all enrolled subjects)
 */
import { Api } from '../../api.js';
import {
    newCalendarState, renderMonthCalendar, bindMonthCalendar, monthCalendarCss, parseCalDate, dateKey,
} from '../../utils/calendar-ui.js';

const state = newCalendarState();

function isLessonDone(l) {
    return l?.is_completed == 1;
}

function isQuizDone(q) {
    const status = q?.quiz_status || '';
    return status === 'passed' || status === 'attempted' || status === 'exhausted';
}

function buildEvents(subjects, lessonsBySubject, quizzesBySubject, announcements) {
    const events = [];

    subjects.forEach(sub => {
        const subjectId = sub.subject_id;
        const subjectName = `${sub.subject_code || ''} — ${sub.subject_name || ''}`.replace(/^— /, '').trim();

        (lessonsBySubject[subjectId] || []).forEach(l => {
            const posted = parseCalDate(l.created_at);
            if (!posted) return;
            const done = isLessonDone(l);
            events.push({
                kind: 'lesson', key: dateKey(posted), id: l.lessons_id, workType: 'lesson',
                title: l.title || l.lesson_title || 'Lesson', sub: done ? 'Lesson completed' : 'Lesson posted',
                icon: 'document', date: posted, done, attempted: false, subjectId, subjectName,
            });
        });

        (quizzesBySubject[subjectId] || []).forEach(q => {
            const title = q.quiz_title || 'Quiz';
            const done = isQuizDone(q);
            const attempted = ['attempted', 'exhausted', 'passed'].includes(q.quiz_status || '');

            const opens = parseCalDate(q.availability_start || q.created_at);
            if (opens) {
                events.push({
                    kind: 'quiz-opens', key: dateKey(opens), id: q.quiz_id, workType: 'quiz', title,
                    sub: done ? 'Quiz completed' : 'Quiz opens', icon: 'clock', date: opens,
                    done, attempted: attempted && !done, subjectId, subjectName,
                });
            }
            const due = parseCalDate(q.due_date);
            if (due) {
                events.push({
                    kind: 'quiz-due', key: dateKey(due), id: q.quiz_id, workType: 'quiz', title,
                    sub: done ? 'Quiz done' : `Quiz due · ${q.total_points != null ? q.total_points + ' pts' : 'Graded'}`,
                    icon: 'quiz', date: due, done, attempted: attempted && !done, subjectId, subjectName,
                });
            }
        });
    });

    announcements.forEach(a => {
        const posted = parseCalDate(a.created_at);
        if (!posted) return;
        const subjectId = a.subject_id;
        const sub = subjects.find(s => String(s.subject_id) === String(subjectId));
        const subjectName = sub ? `${sub.subject_code || ''} — ${sub.subject_name || ''}`.replace(/^— /, '').trim() : '';
        events.push({
            kind: 'announcement', key: dateKey(posted), id: a.announcement_id || a.id, workType: null,
            title: a.title || 'Announcement', sub: 'Announcement', icon: 'announce', date: posted,
            done: false, attempted: false, subjectId, subjectName,
        });
    });

    return events.sort((a, b) => b.date - a.date);
}

export async function render(container) {
    container.innerHTML = `<div style="display:flex;justify-content:center;padding:60px">
        <div style="width:36px;height:36px;border:3px solid #e8e8e8;border-top-color:#00461B;border-radius:50%;animation:cal-spin .8s linear infinite"></div>
        <style>@keyframes cal-spin{to{transform:rotate(360deg)}}</style>
    </div>`;

    const [subjRes, annRes] = await Promise.all([
        Api.get('/EnrollmentAPI.php?action=my-subjects'),
        Api.get('/AnnouncementsAPI.php?action=student-list'),
    ]);
    const subjects = (subjRes.success ? subjRes.data : []).filter(s => s.offering_status !== 'archived');
    const announcements = annRes.success ? annRes.data : [];

    const [lessonsResults, quizzesResults] = await Promise.all([
        Promise.all(subjects.map(s => Api.get('/LessonsAPI.php?action=list&subject_id=' + s.subject_offered_id))),
        Promise.all(subjects.map(s => Api.get('/ProgressAPI.php?action=student-quizzes&subject_id=' + s.subject_id))),
    ]);

    const lessonsBySubject = {};
    const quizzesBySubject = {};
    subjects.forEach((s, i) => {
        lessonsBySubject[s.subject_id] = lessonsResults[i]?.success ? lessonsResults[i].data : [];
        quizzesBySubject[s.subject_id] = quizzesResults[i]?.success ? quizzesResults[i].data : [];
    });

    const events = buildEvents(subjects, lessonsBySubject, quizzesBySubject, announcements);

    function renderPage() {
        container.innerHTML = `
            <style>${monthCalendarCss()}</style>
            <div class="cal-page-wrap cal-page-wrap--full">
                ${renderMonthCalendar(state, events, { emptyMessage: 'No activity yet across your subjects.' })}
            </div>`;

        bindMonthCalendar(container, state, events, {
            renderPage,
            onOpen(ev) {
                if (!ev.subjectId) return;
                if (ev.kind === 'announcement') {
                    window.location.hash = '#student/announcements';
                    return;
                }
                const type = ev.kind.startsWith('quiz') ? 'quiz' : 'lesson';
                window.location.hash = `#student/subject?subject_id=${ev.subjectId}&work=${type}&work_id=${ev.id}`;
            },
        });
    }

    renderPage();
}
