/**
 * Instructor — global Calendar (aggregates lessons/quizzes/announcements across all taught subjects)
 */
import { Api } from '../../api.js';
import {
    newCalendarState, renderMonthCalendar, bindMonthCalendar, monthCalendarCss, parseCalDate, dateKey,
} from '../../utils/calendar-ui.js';

const state = newCalendarState();

function buildEvents(lessons, quizzes, announcements) {
    const events = [];
    const subjectName = row => `${row.subject_code || ''} — ${row.subject_name || ''}`.replace(/^— /, '').trim();

    lessons.forEach(l => {
        const d = parseCalDate(l.created_at || l.updated_at);
        if (!d) return;
        events.push({
            kind: 'lesson', date: d, key: dateKey(d), id: l.lessons_id,
            title: l.lesson_title || l.title || 'Lesson', sub: 'Lesson posted', icon: 'document',
            done: false, attempted: false, subjectId: l.subject_id, subjectName: subjectName(l),
        });
    });

    announcements.forEach(a => {
        const d = parseCalDate(a.created_at);
        if (!d) return;
        events.push({
            kind: 'announcement', date: d, key: dateKey(d), id: a.announcement_id,
            title: a.title || 'Announcement', sub: 'Announcement', icon: 'announce',
            done: false, attempted: false, subjectId: a.subject_id, subjectName: subjectName(a),
        });
    });

    quizzes.forEach(q => {
        const title = q.quiz_title || 'Quiz';
        if (q.due_date) {
            const d = parseCalDate(q.due_date);
            if (d) events.push({
                kind: 'quiz-due', date: d, key: dateKey(d), id: q.quiz_id, title,
                sub: `Quiz due · ${q.total_points != null ? q.total_points + ' pts' : 'Graded'}`, icon: 'quiz',
                done: false, attempted: false, subjectId: q.subject_id, subjectName: subjectName(q),
            });
        }
        if (q.availability_start) {
            const d = parseCalDate(q.availability_start);
            if (d) events.push({
                kind: 'quiz-opens', date: d, key: dateKey(d), id: q.quiz_id, title, sub: 'Quiz opens', icon: 'clock',
                done: false, attempted: false, subjectId: q.subject_id, subjectName: subjectName(q),
            });
        }
        if (!q.due_date) {
            const posted = parseCalDate(q.created_at);
            if (posted) events.push({
                kind: 'quiz', date: posted, key: dateKey(posted), id: q.quiz_id, title, sub: 'Quiz posted', icon: 'quiz',
                done: false, attempted: false, subjectId: q.subject_id, subjectName: subjectName(q),
            });
        }
    });

    return events.sort((a, b) => b.date - a.date);
}

export async function render(container) {
    container.innerHTML = `<div style="display:flex;justify-content:center;padding:60px">
        <div style="width:36px;height:36px;border:3px solid #e8e8e8;border-top-color:#00461B;border-radius:50%;animation:cal-spin .8s linear infinite"></div>
        <style>@keyframes cal-spin{to{transform:rotate(360deg)}}</style>
    </div>`;

    const [lessonsRes, quizzesRes, annRes] = await Promise.all([
        Api.get('/LessonsAPI.php?action=instructor-lessons'),
        Api.get('/QuizzesAPI.php?action=instructor-list'),
        Api.get('/AnnouncementsAPI.php?action=instructor-list'),
    ]);

    const lessons = lessonsRes.success ? lessonsRes.data : [];
    const quizzes = quizzesRes.success ? quizzesRes.data : [];
    const announcements = annRes.success ? annRes.data : [];
    const events = buildEvents(lessons, quizzes, announcements);

    function renderPage() {
        container.innerHTML = `
            <style>${monthCalendarCss()}</style>
            <div class="cal-page-wrap cal-page-wrap--full">
                ${renderMonthCalendar(state, events, { emptyMessage: 'No activity yet across your classes.' })}
            </div>`;

        bindMonthCalendar(container, state, events, {
            renderPage,
            onOpen(ev) {
                if (!ev.subjectId) return;
                if (ev.kind === 'announcement') {
                    window.location.hash = '#instructor/announcements';
                    return;
                }
                window.location.hash = `#instructor/subject?subject_id=${ev.subjectId}&tab=classwork`;
            },
        });
    }

    renderPage();
}
