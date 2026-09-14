/**
 * Shared "todo-list" calendar — mini month grid + upcoming/overdue task list.
 * Used by the global Calendar page (student & instructor). Each event carries
 * a `subjectId`/`subjectName` so items from every subject can be told apart.
 */
import { icon } from './icons.js';

export function dateKey(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function parseCalDate(v) {
    if (!v) return null;
    const d = new Date(String(v).replace(' ', 'T'));
    return Number.isNaN(d.getTime()) ? null : d;
}

export function formatCalDay(d) {
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatCalTime(d) {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function esc(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
}

/** Fresh state object for a calendar page — hang onto this across re-renders. */
export function newCalendarState() {
    const now = new Date();
    return { calFilter: 'all', calYear: now.getFullYear(), calMonth: now.getMonth(), calSelectedDay: null };
}


/**
 * Full-width Google-Calendar-style month grid — a large 6-week grid with
 * colored event chips inside each day cell (instead of the small dot-only
 * mini grid). Click a chip to open it; click "+N more" / an empty day to
 * see the full day list in a modal.
 */
export function renderMonthCalendar(state, allEvents, opts = {}) {
    const filter = state.calFilter || 'all';
    const year = state.calYear;
    const month = state.calMonth;

    const events = filter === 'lesson'      ? allEvents.filter(e => e.kind === 'lesson')
                 : filter === 'quiz'         ? allEvents.filter(e => e.kind.startsWith('quiz'))
                 : filter === 'announcement' ? allEvents.filter(e => e.kind === 'announcement')
                 : allEvents;

    const byDay = {};
    events.forEach(ev => {
        if (!byDay[ev.key]) byDay[ev.key] = [];
        byDay[ev.key].push(ev);
    });
    Object.values(byDay).forEach(list => list.sort((a, b) => a.date - b.date));

    const todayKey = dateKey(new Date());
    const monthLabel = new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const firstOfMonth = new Date(year, month, 1);
    const startDow = firstOfMonth.getDay();
    const gridStart = new Date(year, month, 1 - startDow);
    const totalCells = 42; // 6 weeks × 7 days — always a full grid, like Google Calendar

    const MAX_CHIPS = 3;
    let cells = '';
    for (let i = 0; i < totalCells; i++) {
        const d = new Date(gridStart);
        d.setDate(gridStart.getDate() + i);
        const key = dateKey(d);
        const inMonth = d.getMonth() === month;
        const dayEvs = byDay[key] || [];
        const visible = dayEvs.slice(0, MAX_CHIPS);
        const extra = dayEvs.length - visible.length;

        const chips = visible.map(ev => {
            const kindClass = ev.kind.startsWith('quiz') ? 'quiz' : ev.kind;
            const label = ev.kind === 'quiz-due' ? `${ev.title} (Due)` : ev.title;
            return `<button type="button" class="mcal-chip mcal-chip--${kindClass}${ev.done ? ' mcal-chip--done' : ''}"
                data-cal-kind="${ev.kind}" data-cal-id="${ev.id}" data-cal-subject="${esc(ev.subjectId || '')}"
                title="${esc(ev.title)}${ev.subjectName ? ' — ' + esc(ev.subjectName) : ''}">${esc(label)}</button>`;
        }).join('');
        const more = extra > 0 ? `<button type="button" class="mcal-more" data-cal-day="${key}">+${extra} more</button>` : '';

        cells += `
        <div class="mcal-day${key === todayKey ? ' mcal-today' : ''}${!inMonth ? ' mcal-other-month' : ''}" data-cal-day="${key}">
            <span class="mcal-daynum${key === todayKey ? ' mcal-daynum--today' : ''}">${d.getDate()}</span>
            <div class="mcal-chips">${chips}${more}</div>
        </div>`;
    }

    const FILTERS = [
        { key: 'all',          label: 'All' },
        { key: 'lesson',       label: 'Lessons' },
        { key: 'quiz',         label: 'Quizzes' },
        { key: 'announcement', label: 'Announcements' },
    ];
    const filterBar = FILTERS.map(f => `
        <button type="button" class="mcal-filter mcal-filter--${f.key}${filter === f.key ? ' is-active' : ''}" data-cal-filter="${f.key}">
            <span class="mcal-filter-dot"></span>${esc(f.label)}
        </button>`).join('');

    return `
    <div class="mcal-wrap">
        <div class="mcal-toolbar">
            <div class="mcal-nav">
                <button type="button" class="mcal-today-btn" id="sc-cal-today">Today</button>
                <div class="mcal-nav-arrows">
                    <button type="button" class="mcal-nav-btn" id="sc-cal-prev" aria-label="Previous month">&lsaquo;</button>
                    <button type="button" class="mcal-nav-btn" id="sc-cal-next" aria-label="Next month">&rsaquo;</button>
                </div>
                <span class="mcal-month">${esc(monthLabel)}</span>
            </div>
            <div class="mcal-filters">${filterBar}</div>
        </div>
        <div class="mcal-weekdays">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(w => `<span>${w}</span>`).join('')}</div>
        <div class="mcal-grid">${cells}</div>
    </div>`;
}

function dayModalHtml(dayKey, dayEvs) {
    const dateLabel = formatCalDay(new Date(dayKey + 'T12:00:00'));
    return `
    <div class="mcal-modal-overlay" data-mcal-overlay>
        <div class="mcal-modal" role="dialog" aria-labelledby="mcal-modal-title">
            <div class="mcal-modal-hdr">
                <h3 id="mcal-modal-title">${esc(dateLabel)}</h3>
                <button type="button" class="mcal-modal-close" data-mcal-close aria-label="Close">&times;</button>
            </div>
            <div class="mcal-modal-body">
                ${dayEvs.length ? dayEvs.map(ev => {
                    const kindClass = ev.kind.startsWith('quiz') ? 'quiz' : ev.kind;
                    return `<button type="button" class="mcal-modal-row" data-cal-kind="${ev.kind}" data-cal-id="${ev.id}" data-cal-subject="${esc(ev.subjectId || '')}">
                        <span class="mcal-modal-dot mcal-chip--${kindClass}"></span>
                        <span class="mcal-modal-row-body">
                            <span class="mcal-modal-row-title">${esc(ev.title)}</span>
                            <span class="mcal-modal-row-sub">${esc(ev.sub)}${ev.subjectName ? ' · ' + esc(ev.subjectName) : ''} · ${esc(formatCalTime(ev.date))}</span>
                        </span>
                    </button>`;
                }).join('') : '<p class="mcal-modal-empty">Nothing scheduled on this day.</p>'}
            </div>
        </div>
    </div>`;
}

function eventPreviewHtml(ev) {
    const kindClass = ev.kind.startsWith('quiz') ? 'quiz' : ev.kind;
    const typeLabel = ev.kind === 'lesson' ? 'Lesson' : ev.kind === 'announcement' ? 'Announcement'
        : ev.kind === 'quiz-due' ? 'Quiz — Due' : ev.kind === 'quiz-opens' ? 'Quiz — Opens' : 'Quiz';
    return `
    <div class="mcal-modal-overlay" data-mcal-overlay>
        <div class="mcal-preview" role="dialog" aria-labelledby="mcal-preview-title">
            <div class="mcal-preview-hdr mcal-chip--${kindClass}">
                <span class="mcal-preview-kind">${esc(typeLabel)}</span>
                <button type="button" class="mcal-modal-close" data-mcal-close aria-label="Close">&times;</button>
            </div>
            <div class="mcal-preview-body">
                <h3 id="mcal-preview-title" class="mcal-preview-title">${esc(ev.title)}</h3>
                <p class="mcal-preview-sub">${esc(ev.sub)}${ev.subjectName ? ' · ' + esc(ev.subjectName) : ''}</p>
                <p class="mcal-preview-date">${esc(formatCalDay(ev.date))} · ${esc(formatCalTime(ev.date))}</p>
            </div>
            <div class="mcal-preview-foot">
                <button type="button" class="mcal-preview-cancel" data-mcal-close>Close</button>
                <button type="button" class="mcal-preview-view" data-mcal-view>View</button>
            </div>
        </div>
    </div>`;
}

/** Wire up nav/day-cell/chip clicks for the full month grid. */
export function bindMonthCalendar(container, state, allEvents, { renderPage, onOpen }) {
    function openPreview(ev) {
        container.querySelector('[data-mcal-overlay]')?.remove();
        const wrap = document.createElement('div');
        wrap.innerHTML = eventPreviewHtml(ev);
        const overlay = wrap.firstElementChild;
        container.appendChild(overlay);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
        overlay.querySelectorAll('[data-mcal-close]').forEach(btn => btn.addEventListener('click', () => overlay.remove()));
        overlay.querySelector('[data-mcal-view]')?.addEventListener('click', () => {
            overlay.remove();
            onOpen(ev);
        });
    }

    container.querySelector('#sc-cal-prev')?.addEventListener('click', () => {
        state.calMonth -= 1;
        if (state.calMonth < 0) { state.calMonth = 11; state.calYear -= 1; }
        renderPage();
    });
    container.querySelector('#sc-cal-next')?.addEventListener('click', () => {
        state.calMonth += 1;
        if (state.calMonth > 11) { state.calMonth = 0; state.calYear += 1; }
        renderPage();
    });
    container.querySelector('#sc-cal-today')?.addEventListener('click', () => {
        const t = new Date();
        state.calYear = t.getFullYear();
        state.calMonth = t.getMonth();
        renderPage();
    });
    container.querySelectorAll('[data-cal-filter]').forEach(btn => {
        btn.addEventListener('click', () => {
            state.calFilter = btn.dataset.calFilter;
            renderPage();
        });
    });
    container.querySelectorAll('[data-cal-kind]').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            const kind = el.dataset.calKind;
            const id = el.dataset.calId;
            const subjectId = el.dataset.calSubject;
            const ev = allEvents.find(x => x.kind === kind && String(x.id) === String(id) && String(x.subjectId || '') === String(subjectId || ''));
            if (ev) openPreview(ev);
        });
    });

    function openDayModal(dayKey) {
        container.querySelector('[data-mcal-overlay]')?.remove();
        const filter = state.calFilter || 'all';
        const all = (allEvents.filter(e => e.key === dayKey))
            .filter(e => filter === 'all' || (filter === 'quiz' ? e.kind.startsWith('quiz') : e.kind === filter))
            .sort((a, b) => a.date - b.date);
        const wrap = document.createElement('div');
        wrap.innerHTML = dayModalHtml(dayKey, all);
        const overlay = wrap.firstElementChild;
        container.appendChild(overlay);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
        overlay.querySelector('[data-mcal-close]')?.addEventListener('click', () => overlay.remove());
        overlay.querySelectorAll('[data-cal-kind]').forEach(el => {
            el.addEventListener('click', () => {
                const kind = el.dataset.calKind;
                const id = el.dataset.calId;
                const subjectId = el.dataset.calSubject;
                const ev = allEvents.find(x => x.kind === kind && String(x.id) === String(id) && String(x.subjectId || '') === String(subjectId || ''));
                overlay.remove();
                if (ev) openPreview(ev);
            });
        });
    }

    container.querySelectorAll('[data-cal-day]').forEach(el => {
        el.addEventListener('click', (e) => {
            if (e.target.closest('[data-cal-kind]')) return;
            openDayModal(el.dataset.calDay);
        });
    });
}

export function monthCalendarCss() {
    return `
.mcal-wrap{background:#fff;border:1px solid #E2E5E3;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(16,24,20,.04)}
.mcal-toolbar{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;padding:16px 20px;border-bottom:1px solid #EEF1EF}
.mcal-nav{display:flex;align-items:center;gap:14px}
.mcal-today-btn{padding:7px 16px;border:1.5px solid #DDE2DE;border-radius:20px;background:#fff;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;color:#374151;transition:all .15s}
.mcal-today-btn:hover{border-color:#00461B;color:#00461B;background:#F3FAF5}
.mcal-nav-arrows{display:flex;align-items:center;gap:2px}
.mcal-nav-btn{width:30px;height:30px;border:none;border-radius:50%;background:transparent;cursor:pointer;font-size:18px;color:#5F6368;display:flex;align-items:center;justify-content:center;line-height:1;font-family:inherit;transition:background .15s,color .15s}
.mcal-nav-btn:hover{background:#EFF6F1;color:#00461B}
.mcal-month{font-size:17px;font-weight:800;color:#1A1F1C;letter-spacing:-.01em}
.mcal-filters{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.mcal-filter{display:inline-flex;align-items:center;gap:6px;border:1.5px solid #E5E9E6;border-radius:20px;background:#fff;
    padding:5px 12px 5px 10px;font-size:11.5px;font-weight:700;color:#5B6560;cursor:pointer;font-family:inherit;transition:all .15s}
.mcal-filter-dot{width:7px;height:7px;border-radius:50%;background:#C6CDC8;flex-shrink:0;transition:background .15s}
.mcal-filter:hover{border-color:#C9D4CC;color:#1A1F1C}
.mcal-filter.is-active{border-color:transparent;color:#fff}
.mcal-filter--all.is-active{background:#00461B}
.mcal-filter--all .mcal-filter-dot{background:linear-gradient(135deg,#00461B 33%,#1A73E8 33% 66%,#9334E6 66%)}
.mcal-filter--lesson.is-active{background:#00461B}
.mcal-filter--lesson .mcal-filter-dot{background:#00461B}
.mcal-filter--quiz.is-active{background:#9334E6}
.mcal-filter--quiz .mcal-filter-dot{background:#9334E6}
.mcal-filter--announcement.is-active{background:#1A73E8}
.mcal-filter--announcement .mcal-filter-dot{background:#1A73E8}
.mcal-filter.is-active .mcal-filter-dot{background:#fff}
.mcal-weekdays{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));background:#FAFBFA;border-bottom:1px solid #EEF1EF}
.mcal-weekdays span{text-align:center;font-size:10.5px;font-weight:800;color:#8B9690;padding:10px 0;text-transform:uppercase;letter-spacing:.6px}
.mcal-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));grid-auto-rows:1fr}
.mcal-day{min-width:0;min-height:112px;border-right:1px solid #EEF1EF;border-bottom:1px solid #EEF1EF;padding:7px;display:flex;flex-direction:column;gap:4px;cursor:pointer;transition:background .15s;position:relative}
.mcal-day:hover{background:#FAFCFB}
.mcal-grid .mcal-day:nth-child(7n){border-right:none}
.mcal-grid .mcal-day:nth-last-child(-n+7){border-bottom:none}
.mcal-other-month{background:#FCFCFB}
.mcal-other-month .mcal-daynum{color:#C4CAC5}
.mcal-today{background:#F3FAF5}
.mcal-today:hover{background:#EAF7EE}
.mcal-daynum{font-size:12px;font-weight:700;color:#374151;width:24px;height:24px;display:flex;align-items:center;justify-content:center;border-radius:50%;flex-shrink:0}
.mcal-daynum--today{background:#00461B;color:#fff;box-shadow:0 0 0 3px rgba(0,70,27,.12)}
.mcal-chips{display:flex;flex-direction:column;gap:3px;overflow:hidden}
.mcal-chip{display:flex;align-items:center;gap:5px;border:none;border-radius:6px;padding:3px 7px;font-size:10.5px;font-weight:700;color:#fff;text-align:left;cursor:pointer;
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:inherit;width:100%;transition:filter .1s,transform .1s}
.mcal-chip:hover{filter:brightness(1.08)}
.mcal-chip:active{transform:scale(.98)}
.mcal-chip--lesson{background:#00461B}
.mcal-chip--announcement{background:#1A73E8}
.mcal-chip--quiz{background:#9334E6}
.mcal-chip--done{opacity:.5;text-decoration:line-through}
.mcal-more{border:none;background:none;font-size:10.5px;font-weight:700;color:#8B9690;cursor:pointer;text-align:left;padding:2px 7px;font-family:inherit}
.mcal-more:hover{color:#00461B}
@media(max-width:768px){
    .mcal-day{min-height:74px;padding:4px}
    .mcal-chip{padding:2px 4px;font-size:9.5px}
    .mcal-weekdays span{font-size:9px}
    .mcal-filters{width:100%;justify-content:flex-start}
    .mcal-toolbar{padding:14px 16px}
}

/* Day modal */
.mcal-modal-overlay{position:fixed;inset:0;background:rgba(17,24,39,.5);z-index:2000;display:flex;align-items:center;justify-content:center;padding:16px}
.mcal-modal{background:#fff;border-radius:14px;width:100%;max-width:440px;max-height:80vh;overflow-y:auto;box-shadow:0 24px 60px rgba(0,0,0,.25)}
.mcal-modal-hdr{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #F0F0F0}
.mcal-modal-hdr h3{font-size:15px;font-weight:700;color:#111;margin:0}
.mcal-modal-close{width:28px;height:28px;border:none;background:#F3F4F6;color:#374151;border-radius:50%;font-size:16px;cursor:pointer}
.mcal-modal-close:hover{background:#E5E7EB}
.mcal-modal-body{padding:10px 12px;display:flex;flex-direction:column;gap:4px}
.mcal-modal-empty{text-align:center;color:#9CA3AF;font-size:13px;padding:24px 0}
.mcal-modal-row{display:flex;align-items:flex-start;gap:10px;padding:10px;border:none;background:none;border-radius:10px;cursor:pointer;text-align:left;width:100%;font-family:inherit}
.mcal-modal-row:hover{background:#F8FDF9}
.mcal-modal-dot{width:10px;height:10px;border-radius:50%;margin-top:4px;flex-shrink:0}
.mcal-modal-row-body{display:flex;flex-direction:column;gap:2px;min-width:0}
.mcal-modal-row-title{font-size:13px;font-weight:600;color:#111}
.mcal-modal-row-sub{font-size:11px;color:#6B7280}

/* Event preview modal */
.mcal-preview{background:#fff;border-radius:14px;width:100%;max-width:400px;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,.25)}
.mcal-preview-hdr{display:flex;align-items:center;justify-content:space-between;padding:14px 18px}
.mcal-preview-kind{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:#fff}
.mcal-preview-hdr .mcal-modal-close{background:rgba(255,255,255,.2);color:#fff}
.mcal-preview-hdr .mcal-modal-close:hover{background:rgba(255,255,255,.32)}
.mcal-preview-body{padding:18px}
.mcal-preview-title{font-size:16px;font-weight:800;color:#111;margin:0 0 6px}
.mcal-preview-sub{font-size:13px;color:#374151;margin:0 0 4px}
.mcal-preview-date{font-size:12px;color:#6B7280;margin:0}
.mcal-preview-foot{display:flex;gap:10px;padding:14px 18px;border-top:1px solid #F0F0F0}
.mcal-preview-cancel{flex:1;padding:10px;border:1px solid #DADCE0;border-radius:10px;background:#fff;font-size:13px;font-weight:700;color:#374151;cursor:pointer;font-family:inherit}
.mcal-preview-cancel:hover{background:#F3F4F6}
.mcal-preview-view{flex:1;padding:10px;border:none;border-radius:10px;background:#00461B;font-size:13px;font-weight:700;color:#fff;cursor:pointer;font-family:inherit}
.mcal-preview-view:hover{background:#006428}

/* ── Page shell (global calendar page) ── */
.cal-page-wrap{padding:4px 0 20px;max-width:640px}
.cal-page-wrap--full{max-width:100%}
.cal-page-hdr{margin-bottom:20px}
.cal-page-title{font-size:20px;font-weight:800;color:#111;margin:0}
.cal-page-sub{font-size:13px;color:#6B7280;margin:2px 0 0}
`;
}

