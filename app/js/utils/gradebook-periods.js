/**
 * COC grading periods — P1 Midterms, P2 Prefinals, P3 Finals
 */

export const GRADING_PERIODS = [
    { code: 'P1', label: 'P1', title: 'Midterms' },
    { code: 'P2', label: 'P2', title: 'Prefinals' },
    { code: 'P3', label: 'P3', title: 'Finals' },
];

export function normalizeGradingPeriod(raw) {
    const p = String(raw || 'P1').toUpperCase();
    return GRADING_PERIODS.some(x => x.code === p) ? p : 'P1';
}

export function periodMeta(code) {
    return GRADING_PERIODS.find(p => p.code === normalizeGradingPeriod(code)) || GRADING_PERIODS[0];
}

export function appliesToSection(item, sectionId) {
    if (!sectionId) return true;
    if (item.all_sections == 1 || item.all_sections === true) return true;
    const ids = (item.section_ids || []).map(Number);
    if (!ids.length) return true;
    return ids.includes(Number(sectionId));
}

export function isItemMissing(item) {
    if (!item?.due_date) return false;
    const due = new Date(item.due_date);
    due.setHours(23, 59, 59, 999);
    return Date.now() > due.getTime();
}

/**
 * Build period groups from published quizzes + lessons for a section.
 */
export function buildPeriodGroups(quizzes = [], lessons = [], sectionId = 0) {
    const items = [];

    for (const q of quizzes) {
        if (q.status && q.status !== 'published') continue;
        if (sectionId && !appliesToSection(q, sectionId)) continue;
        items.push({
            key: `q-${q.quiz_id}`,
            kind: 'quiz',
            id: q.quiz_id,
            title: q.quiz_title || 'Quiz',
            period: normalizeGradingPeriod(q.grading_period),
            totalPoints: parseFloat(q.total_points) || 0,
            due_date: q.due_date,
            quiz_type: q.quiz_type,
            raw: q,
        });
    }

    for (const l of lessons) {
        if (l.status && l.status !== 'published') continue;
        if (sectionId && !appliesToSection(l, sectionId)) continue;
        items.push({
            key: `l-${l.lessons_id}`,
            kind: 'lesson',
            id: l.lessons_id,
            title: l.lesson_title || 'Activity',
            period: normalizeGradingPeriod(l.grading_period),
            due_date: l.due_date,
            raw: l,
        });
    }

    const groups = {};
    for (const p of GRADING_PERIODS) {
        groups[p.code] = items
            .filter(i => i.period === p.code)
            .sort((a, b) => {
                const ka = a.kind === 'lesson' ? 0 : 1;
                const kb = b.kind === 'lesson' ? 0 : 1;
                if (ka !== kb) return ka - kb;
                return String(a.title).localeCompare(String(b.title));
            });
    }

    const flat = GRADING_PERIODS.flatMap(p => groups[p.code]);
    return { groups, items, flat };
}

export function periodQuizSubtotal(studentQuizScores, periodItems) {
    let earned = 0;
    let possible = 0;
    for (const item of periodItems) {
        if (item.kind !== 'quiz') continue;
        const cell = studentQuizScores?.[item.id];
        if (!cell) continue;
        earned += parseFloat(cell.earned) || 0;
        possible += parseFloat(cell.total) || 0;
    }
    return { earned, possible };
}

export function gradingPeriodSelectHtml(selectId, selected = 'P1') {
    return `
        <div class="gbp-field">
            <label class="gbp-label" for="${selectId}">Grading Period *</label>
            <select class="gbp-select" id="${selectId}">
                ${GRADING_PERIODS.map(p => `
                    <option value="${p.code}" ${p.code === normalizeGradingPeriod(selected) ? 'selected' : ''}>
                        ${p.label} — ${p.title}
                    </option>`).join('')}
            </select>
            <p class="gbp-hint">COC: P1 Midterms · P2 Prefinals · P3 Finals</p>
        </div>`;
}

export function gradingPeriodTableCss() {
    return `
        .gbp-field { margin-bottom:16px; }
        .gbp-label { display:block; font-size:12px; font-weight:700; color:#374151; margin-bottom:6px;
            text-transform:uppercase; letter-spacing:.4px; }
        .gbp-select { width:100%; padding:11px 14px; border:1.5px solid #e5e7eb; border-radius:10px;
            font-size:14px; font-family:inherit; box-sizing:border-box; }
        .gbp-hint { font-size:11px; color:#9ca3af; margin:6px 0 0; }

        .gb-period-th {
            background:#00461B !important; color:#fff !important; text-align:center !important;
            font-size:11px !important; font-weight:800 !important; letter-spacing:.3px;
            border-left:2px solid rgba(255,255,255,.25) !important;
        }
        .gb-period-th--p2 { background:#006428 !important; }
        .gb-period-th--p3 { background:#1B5E20 !important; }
        .gb-period-sub { display:block; font-size:9px; font-weight:600; opacity:.85; text-transform:uppercase; }
        .gb-period-subtotal-th {
            background:#E8F5EC !important; color:#00461B !important; font-size:10px !important;
            font-weight:800 !important; text-align:center !important; min-width:52px;
            border-left:2px solid #A7D4B5 !important;
        }
        .gb-item-th {
            font-size:10px !important; text-align:center !important; vertical-align:bottom !important;
            min-width:72px; max-width:100px; padding:8px 6px !important;
            /* Deliberately NOT the same dark green as the "#/Student ID/Name"
               identity columns (.gc-cur-table thead tr th, classroom-ui.js) —
               a distinct dark slate keeps the per-module SOC/LP/REFL/WUQ
               columns visually separate from the identity columns instead of
               blending into one solid green bar, while still being dark
               enough for the light mint/lavender/white label text below to
               read clearly. */
            background:#1F2937 !important; border-bottom:1px solid #111827 !important;
        }
        .gb-item-th--empty { color:rgba(255,255,255,.7); font-style:italic; }
        /* These sit inside .gc-cur-table's <th> header row, which is dark
           green by default (see classroom-ui.js's curriculumTableCss()) —
           colors here are light tints readable on that background, not the
           dark-on-light colors this used before that header turned green.
           Quiz vs Activity keeps a distinct hue (mint vs lavender) so the
           type badge still reads at a glance, just light instead of dark. */
        .gb-item-type {
            display:block; font-size:8px; font-weight:800; text-transform:uppercase;
            color:rgba(255,255,255,.75); letter-spacing:.4px; margin-bottom:2px;
        }
        .gb-item-type.quiz { color:#A7F3D0; }
        .gb-item-type.activity { color:#DDD6FE; }
        .gb-item-name { display:block; font-weight:700; color:#fff; line-height:1.2; }
        .gb-period-section { margin-bottom:20px; }
        .gb-period-section-hdr {
            display:flex; align-items:center; gap:10px; padding:12px 16px;
            background:#fff; border:1px solid #E5E7EB; border-bottom:none; color:#111; border-radius:12px 12px 0 0;
        }
        .gb-period-section-hdr.p2 { background:#fff; }
        .gb-period-section-hdr.p3 { background:#fff; }
        .gb-period-section-code { font-size:18px; font-weight:900; font-family:monospace; color:#00461B; }
        .gb-period-section-title { font-size:13px; color:#6B7280; }
        .gb-period-section-sub {
            margin-left:auto; font-size:12px; font-weight:700;
            background:#00461B; color:#fff; padding:4px 10px; border-radius:20px;
        }
        .gb-period-panel {
            border:1px solid #e5e7eb; border-top:none; border-radius:0 0 12px 12px;
            overflow:hidden; background:#fff;
        }
        .gb-period-empty { padding:24px; text-align:center; color:#9ca3af; font-size:13px; }
        .gb-stu-kind { display:inline-block; padding:2px 7px; border-radius:10px; font-size:9px;
            font-weight:800; text-transform:uppercase; }
        .gb-stu-kind.quiz { background:#00461B; color:#fff; }
        .gb-stu-kind.activity { background:#EDE9FE; color:#6D28D9; }
    `;
}
