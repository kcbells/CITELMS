/**
 * iADVANCE Grading Workbook — Excel export.
 * 7 sheets (Guide, Grading Input Sheet, Grading Summary Sheet,
 * FOR END OF SEM RETRIES Grading , For-SIS, Tab for Retries — Sheet5
 * dropped, it only existed as a blank spacer tab in the reference file and
 * added nothing here), same structure/headers/merges as the reference
 * workbook. Colors match the live Global Gradebook screen exactly (same
 * hex values as gb-period-th / gb-group-th--soc / --el / --mastery in
 * utils/gradebook-periods.js and global-gradebook.js), so the exported
 * file reads as the same product as the on-screen table.
 *
 * Every cell is a plain computed VALUE, not an Excel formula — grades are
 * computed in JS with the exact same grading-engine.js logic the live
 * gradebook itself uses, so the exported numbers are already final: no
 * "open in Excel to recalculate" step, and the preview shows exactly what
 * a grader would see in the app.
 *
 * Uses xlsx-js-style (vendored locally, not a CDN — app/js/vendor/xlsx-js-style.min.js)
 * instead of stock SheetJS: stock SheetJS silently drops cell fill colors on
 * write (a Pro-only feature there), which is required for large parts of
 * this spec.
 */
import {
    computeStudentReport, projectOverallGrade, checkinAverage, PERIOD_MODULES,
} from '../../utils/grading-engine.js';
import { notify } from '../../utils/notify.js';

import { esc } from '../../utils/classroom-ui.js';
const inl = { size: 14, className: 'ui-icon-inline' };

// ── Color roles — lifted straight from the live gradebook screen ────────
// G/G2/G3 are the exact P1/P2/Final period-band greens from .gb-period-th
// (utils/gradebook-periods.js); SOC/EL/MASTERY are the exact
// .gb-group-th--soc/--el/--mastery hex values from global-gradebook.js.
// Bare hex (no leading #) — bg fields feed straight into CSS "#${bg}" and
// xlsx-js-style's fgColor.rgb, both of which expect bare hex.
const G  = '00461B'; // .gb-period-th (P1 band) / app brand green
const G2 = '006428'; // .gb-period-th--p2 (P2 band)
const G3 = '1B5E20'; // .gb-period-th--p3 (Final band)
const GL = 'E8F5EC'; // .gb-period-subtotal-th background (computed-cell tint)
const SOC_BLUE     = '1D4ED8'; // .gb-group-th--soc
const EL_VIOLET    = '7C3AED'; // .gb-group-th--el
const MASTERY_AMBER = 'B45309'; // .gb-group-th--mastery

const CLR = {
    bandA:     { bg: G,  fg: 'FFFFFF', bold: true },  // Period band — P1 (Modules 1-4)
    bandB:     { bg: G2, fg: 'FFFFFF', bold: true },  // Period band — P2 (Modules 5-9)
    bandC:     { bg: G3, fg: 'FFFFFF', bold: true },  // Period band — Final (Modules 10-14)
    soc:       { bg: SOC_BLUE,      fg: 'FFFFFF', bold: false }, // Start of Class
    effortful: { bg: EL_VIOLET,     fg: 'FFFFFF', bold: false }, // Effortful Learning (Let's Practice, Reflection)
    mastery:   { bg: MASTERY_AMBER, fg: 'FFFFFF', bold: false }, // Mastery (Wrap Up Quiz, Project)
    optional:  { bg: 'DDD6FE', fg: '4C1D95', bold: false }, // Let's Practice (optional) column — muted EL tint
    rollup:    { bg: GL, fg: G, bold: true },         // computed rollup cells — same tint as .gb-period-subtotal-th
    final:     { bg: G,  fg: 'FFFFFF', bold: true },  // Grading Input Sheet's Final Project block — brand green
    info:      { bg: G,  fg: 'FFFFFF', bold: true },  // File Information / Student Information bars
    subtitle:  { bg: 'F3F4F6', fg: '4B5563', bold: false }, // unused generic subtitle (kept for compat)
    field:     { bg: 'FFFFFF', fg: '111111', bold: true },  // plain field-name leaf row
    // ── Grading Summary Sheet — matched to the reference workbook exactly ──
    gradeSubtitle: { bg: 'BFBFBF', fg: '1F2937', bold: true },   // "Weighted per Component Grade" band
    elRollup:      { bg: 'D9D2E9', fg: '111111', bold: true },   // EL Grade column (P1/P2/P3 Grade Computation)
    masteryRollup: { bg: 'EAD1DC', fg: '111111', bold: true },   // Mastery Grade column
    finalGold:     { bg: 'FFE599', fg: '111111', bold: true },   // P1/P2/P3 Grade + MASTERY Passing check
    compRollup:    { bg: 'EAD1DC', fg: '111111', bold: false },  // P1/P2/Final Component Grade avg columns
    projTitle:     { bg: 'E8A9A2', fg: '111111', bold: true },   // Final Project/Output/Task title band
    projMastery:   { bg: '4A86C8', fg: 'FFFFFF', bold: true },   // "Mastery" sub-band under the project title
    projTint:      { bg: 'F4CCCC', fg: '111111', bold: false },  // Final Project leaf headers (check-in grades, etc.)
    // Four component blocks (SOC / Let's Practice / Reflection / Wrap Up) —
    // title and module-leaf cells share ONE light tint per block (title
    // bold, leaf cells regular), matching the reference exactly.
    socTint:  { bg: 'E8F5EC', fg: '111111', bold: false },
    lpTint:   { bg: 'FFF2CC', fg: '111111', bold: false },
    reflTint: { bg: 'D9EAD3', fg: '111111', bold: false },
    wuqTint:  { bg: 'CFE2F3', fg: '111111', bold: false },
    socTitle:  { bg: 'E8F5EC', fg: '111111', bold: true },
    lpTitle:   { bg: 'FFF2CC', fg: '111111', bold: true },
    reflTitle: { bg: 'D9EAD3', fg: '111111', bold: true },
    wuqTitle:  { bg: 'CFE2F3', fg: '111111', bold: true },
    // Rubric tables on the Guide sheet — bg:null means "no fill, just
    // colored/bold text" (border still applied — see applyFills/sheetToHtml).
    eyebrow:       { bg: null, fg: G2, bold: true },              // small label above a rubric title
    rubricTitle:   { bg: null, fg: G, bold: true, sz: 13 },       // rubric section title
    rubricHeader:  { bg: 'F3F4F6', fg: '111111', bold: true },    // rubric table column headers
    rubricRow:     { bg: null, fg: '111111', bold: false },       // rubric data row
    rubricHighlight: { bg: 'FBE7BD', fg: '7C3A00', bold: false }, // "Good Effort" row tint
};

const STUDENT_ROWS = 60; // spec: rows 5–64 on every sheet
const FIRST_ROW = 5;
const LAST_ROW = FIRST_ROW + STUDENT_ROWS - 1; // 64

// ── Column-letter helpers ───────────────────────────────────────────────
// Pure base-26, same algorithm SheetJS's own decode_col/encode_col use —
// implemented locally so sheet layout can be computed before the vendored
// library is even loaded (the preview renders before Download is clicked).
function colIdx(letters) {
    let n = 0;
    for (const c of letters) n = n * 26 + (c.charCodeAt(0) - 64);
    return n - 1;
}
function fill(fills, r0, c0, r1, c1, style) {
    fills.push({ s: { r: r0, c: c0 }, e: { r: r1, c: c1 }, style });
}
/** Rounds to 2 decimals for display; null/undefined -> blank cell. */
function r2(v) {
    return v === null || v === undefined || Number.isNaN(v) ? '' : Math.round(v * 100) / 100;
}

// ── Grading Input Sheet: module 1–14 start columns (spec's own list) ────
const INPUT_MODULE_START = ['D', 'J', 'P', 'V', 'AB', 'AH', 'AN', 'AT', 'AZ', 'BF', 'BL', 'BR', 'BX', 'CD'];

// ── Shared per-student grade computation ─────────────────────────────────
// Thin adapter around grading-engine.js's computeStudentReport — identical
// in shape to the one global-gradebook.js keeps for its own on-screen
// tables, kept local here (rather than imported) so this module has no
// dependency on the page module that mounts it.
function buildReport(sid, grades, project) {
    return computeStudentReport({
        getModuleInput: (m) => {
            const mg = grades[sid]?.[m] || {};
            return {
                soc1: mg.soc1 ?? null,
                soc2: mg.soc2 ?? null,
                letsPractice: mg.lets_practice ?? null,
                letsPracticeOptional: mg.lets_practice_optional ?? null,
                reflection: mg.reflection ?? null,
                wrapUpQuiz: mg.wrap_up_quiz ?? null,
            };
        },
        getPeriodProject: () => {
            const pg = project[sid] || {};
            return {
                checkins: [pg.checkin1 ?? null, pg.checkin2 ?? null, pg.checkin3 ?? null, pg.checkin4 ?? null],
                finalOutput: pg.final_output ?? null,
            };
        },
    });
}
function projectScoreFor(sid, project) {
    const pg = project[sid] || {};
    return projectOverallGrade([pg.checkin1 ?? null, pg.checkin2 ?? null, pg.checkin3 ?? null, pg.checkin4 ?? null], pg.final_output ?? null);
}
/** Averages one component field (soc/letsPractice/reflection/wrapUpQuiz) across a period's module range. */
function avgField(modules, moduleRange, field) {
    const vals = moduleRange.map(m => modules[m]?.[field]).filter(v => v !== null && v !== undefined);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

// ═══════════════════════════════════════════════════════════════════════
// 1. Guide
// ═══════════════════════════════════════════════════════════════════════
const RECOMMENDED_TIMELINE = [
    ['Week 1',  'July 6 – July 12',  'Introduction to the Course. Expectations, etc. Can already start with Module 1'],
    ['Week 2',  'July 13 – July 19', 'Module 1'],
    ['Week 3',  'July 20 – July 26', 'Module 2'],
    ['Week 4',  'July 27 – Aug 2',   'Module 3'],
    ['Week 5',  'Aug 3 – Aug 9',     'Module 4'],
    ['Week 6',  'Aug 10 – Aug 16',   'P1 Closing Week - Module 5\nP1 covers Modules 1-4'],
    ['Week 7',  'Aug 17 – Aug 23',   'Module 6'],
    ['Week 8',  'Aug 24 – Aug 30',   'Module 7'],
    ['Week 9',  'Aug 31 – Sept 6',   'Module 8'],
    ['Week 10', 'Sept 7 – Sept 13',  'Module 9'],
    ['Week 11', 'Sept 14 – Sept 20', 'P2 Closing Week - Module 10\nP2 covers Modules 5-9'],
    ['Week 12', 'Sept 21 – Sept 27', 'Module 11'],
    ['Week 13', 'Sept 28 – Oct 4',   'Module 12'],
    ['Week 14', 'Oct 5 – Oct 11',    'Module 13'],
    ['Week 15', 'Oct 12 – Oct 18',   'Module 14'],
    ['Week 16', 'Oct 19 – Oct 25',   'Catch up week'],
    ['Week 17', 'Oct 26 – Nov 1',    'Retries'],
];

// 0-3 effort rubrics — exact text from the reference "Let's Learn: How
// Assessment Design Impacts Learning" sheet. Effort Level column combines
// the bold label + one-line description (matches the reference's own
// two-line-in-one-cell layout).
const RUBRIC_EYEBROW = "Let's Learn: How Assessment Design Impacts Learning";

const LP_RUBRIC_HEADERS = ['Score', 'Effort Level', 'Individual Work\nExamples', 'Group Work\nExamples (3–5 students)', 'Submitted Task Examples\n(e.g., digital work, drafts, prototypes)'];
const LP_RUBRIC_ROWS = [
    { score: '0\n(0%)',   effort: 'No Effort',      desc: 'No visible attempt or engagement.',
      individual: 'Leaves task blank; no work or explanation.',
      group: 'No contribution to group output; silent during discussion.',
      submitted: 'No file submitted, or uploads a blank/near-blank file; clearly off-task file with no attempt to follow task.' },
    { score: '1\n(60%)',  effort: 'Little Effort',  desc: 'Minimal or superficial attempt.',
      individual: 'Writes vague or incomplete answers.',
      group: 'Minimal contribution; limited or copied work.',
      submitted: 'Very short or mostly copied work; only a small portion of the task addressed; major parts of instructions missing.' },
    { score: '2\n(80%)',  effort: 'Good Effort',    desc: 'Reasonable attempt showing engagement, even with errors.',
      individual: 'Attempts the task, shows process or reasoning.',
      group: 'Actively participates, contributes ideas, records feedback.',
      submitted: 'Draft or output addresses most parts of the task; visible thinking or process (e.g., annotations, rough draft).',
      highlight: true },
    { score: '3\n(100%)', effort: 'Stronger Effort', desc: 'Substantive attempt showing revision/improvement or deep engagement.',
      individual: 'Revises or improves work after feedback/input.',
      group: 'Leads or defends ideas, revises/improves group output, builds on feedback/input.',
      submitted: 'Substantive draft or product that clearly incorporates feedback/input; revised or expanded beyond first attempt.' },
];

const REFLECTION_RUBRIC_HEADERS = ['Score', 'Effort Level', 'Description', 'Examples of Student Responses / Behaviors'];
const REFLECTION_RUBRIC_ROWS = [
    { score: '0\n(0%)',   effort: 'No Effort',      desc: 'No response or off-topic.',
      description: 'No evidence of reflection.', examples: 'Blank, off-topic, or "I don\'t know."' },
    { score: '1\n(60%)',  effort: 'Little Effort',  desc: 'Minimal or vague response.',
      description: 'Generic statement without explanation.', examples: '"It was hard." / "We answered the questions."' },
    { score: '2\n(80%)',  effort: 'Good Effort',    desc: 'Specific recall and explanation in their own words.',
      description: 'Shows understanding and processing of learning.', examples: '"I learned how to identify context clues…"',
      highlight: true },
    { score: '3\n(100%)', effort: 'Stronger Effort', desc: 'Connects learning to prior knowledge or real-world use.',
      description: 'Shows reasoning, collaboration, or deeper insight.', examples: '"I realized using context clues is like how we analyzed tone last week…"' },
];

/** Writes one rubric table (eyebrow + title + header row + data rows) starting at rowStart/colStart. */
function writeRubricTable(aoa, fills, merges, rowStart, colStart, colCount, title, headers, rows, cellsOf) {
    while (aoa.length <= rowStart + 2 + rows.length) aoa.push([]);
    merges.push({ s: { r: rowStart, c: colStart }, e: { r: rowStart, c: colStart + colCount - 1 } });
    merges.push({ s: { r: rowStart + 1, c: colStart }, e: { r: rowStart + 1, c: colStart + colCount - 1 } });
    aoa[rowStart][colStart] = RUBRIC_EYEBROW;
    aoa[rowStart + 1][colStart] = title;
    fill(fills, rowStart, colStart, rowStart, colStart + colCount - 1, CLR.eyebrow);
    fill(fills, rowStart + 1, colStart, rowStart + 1, colStart + colCount - 1, CLR.rubricTitle);

    const headerRow = rowStart + 2;
    headers.forEach((h, i) => { aoa[headerRow][colStart + i] = h; });
    fill(fills, headerRow, colStart, headerRow, colStart + colCount - 1, CLR.rubricHeader);

    rows.forEach((row, i) => {
        const r = headerRow + 1 + i;
        const cells = cellsOf(row);
        cells.forEach((v, ci) => { aoa[r][colStart + ci] = v; });
        fill(fills, r, colStart, r, colStart + colCount - 1, row.highlight ? CLR.rubricHighlight : CLR.rubricRow);
    });
    return headerRow + 1 + rows.length; // first row after this table
}

function buildGuideSheet(subject, section, teacherName, campusLabel, departmentLabel) {
    const merges = [];
    const fills  = [];
    // Row indices are 0-based; the spec's A1:B6 etc are 1-based, so A1 -> r0 c0.
    merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }); // A1:B1 File Information
    fill(fills, 0, 0, 0, 1, CLR.info);

    merges.push({ s: { r: 0, c: 8 }, e: { r: 0, c: 10 } }); // I1:K1 Recommended Timeline
    fill(fills, 0, 8, 0, 10, CLR.bandA);
    fill(fills, 1, 8, 1, 10, CLR.field); // I2:K2 header row

    const aoa = [
        ['File Information', '', '', '', '', '', '', '', 'Recommended Timeline'],
        ['Name of Teacher', teacherName || '', '', '', '', '', '', '', 'Week', 'Dates', 'Note/ Activity'],
        ['School and Campus', campusLabel || '', '', '', '', '', '', '', ...RECOMMENDED_TIMELINE[0]],
        ['Department', departmentLabel || '', '', '', '', '', '', '', ...RECOMMENDED_TIMELINE[1]],
        ['Subject Name', subject?.subject_name || subject?.subject_code || '', '', '', '', '', '', '', ...RECOMMENDED_TIMELINE[2]],
        ['Modality or Class Set-up', '', '', '', '', '', '', '', ...RECOMMENDED_TIMELINE[3]],
        ['', '', '', '', '', '', '', '', ...RECOMMENDED_TIMELINE[4]],
        ...RECOMMENDED_TIMELINE.slice(5).map(row => ['', '', '', '', '', '', '', '', ...row]),
    ];
    while (aoa.length < 20) aoa.push([]);
    aoa[19][10] = 'P3 covers Modules 10-14';
    fill(fills, 19, 10, 19, 10, { bg: 'FFFFFF', fg: '000000', bold: true });

    // ── 0-3 rubrics — Let's Practice, then Reflection, stacked below ────
    const lpNextRow = writeRubricTable(aoa, fills, merges, 22, 0, 5,
        "0-3 Rubrics for Grading Let's Practice Tasks", LP_RUBRIC_HEADERS, LP_RUBRIC_ROWS,
        row => [row.score, `${row.effort}\n${row.desc}`, row.individual, row.group, row.submitted]);
    writeRubricTable(aoa, fills, merges, lpNextRow + 1, 0, 4,
        '0-3 Rubrics for Grading Reflection', REFLECTION_RUBRIC_HEADERS, REFLECTION_RUBRIC_ROWS,
        row => [row.score, `${row.effort}\n${row.desc}`, row.description, row.examples]);

    return {
        name: 'Guide',
        headerRows: 1,
        cols: [{ wch: 20 }, { wch: 26 }, { wch: 30 }, { wch: 32 }, { wch: 36 }, { wch: 4 }, { wch: 4 }, { wch: 4 }, { wch: 8 }, { wch: 18 }, { wch: 46 }],
        merges,
        fills,
        rowHeights: { 25: 40, 26: 68, 27: 68, 28: 82, 29: 82, 33: 40, 34: 50, 35: 50, 36: 60, 37: 60 },
        aoa,
    };
}

// ═══════════════════════════════════════════════════════════════════════
// 2. Grading Input Sheet
// ═══════════════════════════════════════════════════════════════════════
function buildGradingInputSheet(students, grades, project) {
    const HR = 4;
    const hdr = Array.from({ length: HR }, () => []);
    const merges = [];
    const fills = [];

    const infoCol = (label) => {
        const c = hdr[0].length;
        merges.push({ s: { r: 0, c }, e: { r: HR - 1, c } });
        fill(fills, 0, c, HR - 1, c, CLR.info);
        hdr[0].push(label);
        for (let r = 1; r < HR; r++) hdr[r].push('');
    };
    infoCol('#');
    infoCol('Student Number');
    infoCol('Name of Student');

    for (let m = 1; m <= 14; m++) {
        const c = colIdx(INPUT_MODULE_START[m - 1]);
        merges.push({ s: { r: 0, c }, e: { r: 0, c: c + 5 } });
        fill(fills, 0, c, 0, c + 5, m <= 4 ? CLR.bandA : m <= 9 ? CLR.bandB : CLR.bandC);
        hdr[0][c] = `Module ${m}`;

        merges.push({ s: { r: 1, c }, e: { r: 1, c: c + 4 } });
        fill(fills, 1, c, 1, c + 4, CLR.effortful);
        fill(fills, 1, c + 5, 1, c + 5, CLR.mastery);
        hdr[1][c] = 'Effortful Learning';
        hdr[1][c + 5] = 'Mastery';

        merges.push({ s: { r: 2, c }, e: { r: 2, c: c + 1 } });       // Start of Class (5%) D3:E3
        merges.push({ s: { r: 2, c: c + 2 }, e: { r: 2, c: c + 3 } }); // Let's Practice (35%) F3:G3
        merges.push({ s: { r: 2, c: c + 4 }, e: { r: 3, c: c + 4 } }); // Reflection (15%) H3:H4
        merges.push({ s: { r: 2, c: c + 5 }, e: { r: 3, c: c + 5 } }); // Wrap Up Quiz (15%) I3:I4
        fill(fills, 2, c, 3, c + 1, CLR.soc);        // Start of Class — blue, matches .gb-group-th--soc
        fill(fills, 2, c + 2, 3, c + 3, CLR.effortful);
        fill(fills, 2, c + 4, 3, c + 4, CLR.effortful);
        fill(fills, 2, c + 5, 3, c + 5, CLR.mastery);
        hdr[2][c]     = 'Start of Class (5%)';
        hdr[2][c + 2] = "Let's Practice (35%)";
        hdr[2][c + 4] = 'Reflection (15%)';
        hdr[2][c + 5] = 'Wrap Up Quiz (15%)';

        hdr[3][c]     = 'SOC 1';
        hdr[3][c + 1] = 'SOC 2';
        hdr[3][c + 2] = "Let's Practice";
        hdr[3][c + 3] = "Let's Practice\n(optional)";
        fill(fills, 3, c, 3, c + 1, CLR.field);
        fill(fills, 3, c + 2, 3, c + 2, CLR.field);
        fill(fills, 3, c + 3, 3, c + 3, CLR.optional); // distinct fill for the optional column
    }

    // Final Project/Output/Task block — CJ:CP
    {
        const c = colIdx('CJ');
        merges.push({ s: { r: 0, c }, e: { r: 1, c: c + 6 } });
        fill(fills, 0, c, 1, c + 6, CLR.final);
        hdr[0][c] = 'Final Project/ Output/ Task (30%)';

        merges.push({ s: { r: 2, c }, e: { r: 2, c: c + 3 } });
        fill(fills, 2, c, 3, c + 6, CLR.final);
        hdr[2][c] = 'Check In Grades (minimum of 1, max of 4)';
        hdr[2][c + 4] = 0.65;
        hdr[2][c + 5] = 0.35;
        hdr[2][c + 6] = "*if there's only one check-in, weightage becomes 50-50";

        hdr[3][c]     = 'P1\nCheck-in Grade';
        hdr[3][c + 1] = 'P2 Check-in Grade';
        hdr[3][c + 2] = 'P3.1\nCheck-in Grade';
        hdr[3][c + 3] = 'P3.2\nCheck-in Grade';
        hdr[3][c + 4] = 'Check-in Grades Average';
        hdr[3][c + 5] = 'Final Output/ Presentation Grade';
        hdr[3][c + 6] = 'Project Overall Grade';
    }

    // Fill any header row gaps left by merged cells with ''.
    const width = Math.max(...hdr.map(r => r.length));
    hdr.forEach(r => { for (let i = 0; i < width; i++) if (r[i] === undefined) r[i] = ''; });

    const CJ = colIdx('CJ'), CN = colIdx('CN'), CP = colIdx('CP');
    const rows = students.map((st, i) => {
        const sid = st.user_student_id;
        const row = new Array(width).fill('');
        row[0] = i + 1;
        row[1] = st.student_id || '';
        row[2] = st.name;
        for (let m = 1; m <= 14; m++) {
            const c  = colIdx(INPUT_MODULE_START[m - 1]);
            const mg = grades[sid]?.[m] || {};
            row[c]     = mg.soc1 || '';
            row[c + 1] = mg.soc2 || '';
            row[c + 2] = mg.lets_practice ?? '';
            row[c + 3] = mg.lets_practice_optional ?? '';
            row[c + 4] = mg.reflection ?? '';
            row[c + 5] = mg.wrap_up_quiz ?? '';
        }
        // One shared project for the whole term (not one per period) — same
        // flat checkin1-4 + final_output shape the live gradebook itself
        // reads (see buildReport()'s getPeriodProject above).
        const pg = project[sid] || {};
        const checkins = [pg.checkin1 ?? null, pg.checkin2 ?? null, pg.checkin3 ?? null, pg.checkin4 ?? null];
        row[CJ]     = pg.checkin1 ?? '';
        row[CJ + 1] = pg.checkin2 ?? '';
        row[CJ + 2] = pg.checkin3 ?? '';
        row[CJ + 3] = pg.checkin4 ?? '';
        row[CN]     = r2(checkinAverage(checkins));
        row[CN + 1] = pg.final_output ?? '';
        row[CP]     = r2(projectOverallGrade(checkins, pg.final_output ?? null));
        return row;
    });

    const cols = new Array(width).fill({ wch: 10 });
    cols[0] = { wch: 4.63 }; cols[1] = { wch: 19.75 }; cols[2] = { wch: 17.38 };
    for (let m = 1; m <= 14; m++) {
        const c = colIdx(INPUT_MODULE_START[m - 1]);
        cols[c] = { wch: 7.88 }; cols[c + 1] = { wch: 8.38 }; cols[c + 2] = { wch: 10 };
        cols[c + 3] = { wch: 10 }; cols[c + 4] = { wch: 9.6 }; cols[c + 5] = { wch: 11.25 };
    }
    for (let i = 0; i < 7; i++) cols[CJ + i] = { wch: [9.63, 9.63, 9.63, 9.63, 13, 13.38, 19.25][i] };

    // Every raw entry column gets the exact same dropdown the live gradebook
    // uses for that field (see WUQ_OPTS / rubricSel / the P/A <select> in
    // global-gradebook.js) — so an Excel-side edit can't enter a value the
    // app itself would never produce.
    const socSqref = Array.from({ length: 14 }, (_, i) => {
        const c = colIdx(INPUT_MODULE_START[i]);
        return `${colLetters(c)}${FIRST_ROW}:${colLetters(c + 1)}${LAST_ROW}`; // SOC 1 + SOC 2
    }).join(' ');
    const rubricSqref = Array.from({ length: 14 }, (_, i) => {
        const c = colIdx(INPUT_MODULE_START[i]);
        return `${colLetters(c + 2)}${FIRST_ROW}:${colLetters(c + 4)}${LAST_ROW}`; // Let's Practice + optional + Reflection
    }).join(' ');
    const wuqSqref = Array.from({ length: 14 }, (_, i) => {
        const c = colIdx(INPUT_MODULE_START[i]) + 5;
        return `${colLetters(c)}${FIRST_ROW}:${colLetters(c)}${LAST_ROW}`; // Wrap Up Quiz
    }).join(' ');

    return {
        name: 'Grading Input Sheet',
        headerRows: HR,
        cols,
        merges,
        fills,
        rowHeights: { 1: 20.25, 2: 26.25, 3: 49.5, 4: 47.25 },
        freeze: { xSplit: colIdx('D'), ySplit: HR }, // freeze panes at D5
        dataValidations: [
            { sqref: socSqref,    list: ['P', 'A'] },
            { sqref: rubricSqref, list: ['0', '1', '2', '3'] },
            { sqref: wuqSqref,    list: ['100', '85.71', '71.43', '57.14', '42.86', '28.57', '14.29', '0'] },
        ],
        aoa: [...hdr, ...rows],
    };
}

// ═══════════════════════════════════════════════════════════════════════
// 3 & 4. Grading Summary Sheet / FOR END OF SEM RETRIES Grading  (same builder)
// ═══════════════════════════════════════════════════════════════════════
function buildGradingSummarySheet(sheetName, students, grades, project) {
    const HR = 4;
    const hdr = Array.from({ length: HR }, () => []);
    const merges = [];
    const fills = [];

    // hdr[0] only ever gets ONE cell written per block (the merged title) —
    // its own .length is NOT a reliable "next free column" cursor once a
    // block is wider than 1 column, so every block below advances this
    // explicit cursor by its real span instead.
    let nextCol = 0;

    const infoCol = (label) => {
        const c = nextCol++;
        merges.push({ s: { r: 0, c }, e: { r: HR - 1, c } });
        fill(fills, 0, c, HR - 1, c, CLR.info);
        hdr[0][c] = label;
        for (let r = 1; r < HR; r++) hdr[r][c] = '';
    };
    infoCol('#');
    infoCol('Student Number');
    infoCol('Name of Student');

    // ── Grade Computation blocks (P1/P2/P3) ─────────────────────────────
    const gradeCompBlock = (title, titleStyle, fields, kinds) => {
        const c = nextCol;
        const span = fields.length;
        nextCol += span;
        merges.push({ s: { r: 0, c }, e: { r: 0, c: c + span - 1 } });
        fill(fills, 0, c, 0, c + span - 1, titleStyle);
        hdr[0][c] = title;
        merges.push({ s: { r: 1, c }, e: { r: 2, c: c + span - 1 } });
        fill(fills, 1, c, 2, c + span - 1, CLR.gradeSubtitle);
        hdr[1][c] = 'Weighted per Component Grade';
        fields.forEach((f, i) => { hdr[3][c + i] = f; });
        // Raw weighted-component cells (SOC/LP/Reflection/Wrap Up/Project)
        // stay plain white — only the computed rollups (EL Grade, Mastery
        // Grade, MASTERY check, period Grade) get a highlight color, exactly
        // like the reference workbook.
        const KIND_STYLE = { soc: CLR.field, el: CLR.field, mastery: CLR.field, elRollup: CLR.elRollup, masteryRollup: CLR.masteryRollup, final: CLR.finalGold };
        kinds.forEach((k, i) => {
            fill(fills, 3, c + i, 3, c + i, KIND_STYLE[k] || CLR.field);
        });
        return c;
    };
    const p1Start = gradeCompBlock('P1 Grade Computation', CLR.bandA,
        ['SOC (5%)', "Let's Practice (35%)", 'Reflection (15%)', 'EL\nGrade\n(CS 55%)', 'Wrap Up (15%)', 'Project (30%)', 'Mastery Grade\n(PE 45%)', 'P1 Grade\n\nModules 1 to 4'],
        ['soc', 'el', 'el', 'elRollup', 'mastery', 'mastery', 'masteryRollup', 'final']);
    const p2Start = gradeCompBlock('P2 Grade Computation', CLR.bandB,
        ['SOC (5%)', "Let's Practice (35%)", 'Reflection (15%)', 'EL\nGrade\n(CS 55%)', 'Wrap Up (15%)', 'Project (30%)', 'Mastery Grade\n(PE 45%)', 'P2 Grade\n\nModules 1-9'],
        ['soc', 'el', 'el', 'elRollup', 'mastery', 'mastery', 'masteryRollup', 'final']);
    const p3Start = gradeCompBlock('P3 Grade Computation', CLR.bandA,
        ['SOC (5%)', "Let's Practice (35%)", 'Reflection (15%)', 'EL Grade\n(CS 55%)', 'Wrap Up (15%)', 'Project (30%)', 'Mastery Grade\n(PE 45%)', 'MASTERY Passing check', 'P3/ Final Grade\n\nModules 1-14', 'Remarks'],
        ['soc', 'el', 'el', 'elRollup', 'mastery', 'mastery', 'masteryRollup', 'final', 'final', 'field']);

    // ── Per-module component blocks (SOC / LP / Reflection / Wrap Up) ───
    const componentBlock = (title, titleStyle, tintStyle) => {
        const c = nextCol;
        const span = 17; // 14 modules + P1/P2/Final averages
        nextCol += span;
        merges.push({ s: { r: 0, c }, e: { r: 2, c: c + span - 1 } });
        fill(fills, 0, c, 2, c + span - 1, titleStyle);
        hdr[0][c] = title;
        const fields = [];
        for (let m = 1; m <= 14; m++) fields.push(`Module ${m}`);
        fields.push('P1 Component Grade\n(M1-4)', 'P2 Component Grade\n(M1-9)', 'Final Component GRADE\n(M1-14)');
        fields.forEach((f, i) => { hdr[3][c + i] = f; });
        fill(fills, 3, c, 3, c + 13, tintStyle);             // module columns
        fill(fills, 3, c + 14, 3, c + 16, CLR.compRollup);   // period-average columns
        return c;
    };
    const socStart  = componentBlock('SOC 1 and 2', CLR.socTitle, CLR.socTint);
    const lpStart   = componentBlock("Let's Practice", CLR.lpTitle, CLR.lpTint);
    const reflStart = componentBlock('Reflection', CLR.reflTitle, CLR.reflTint);
    const wuqStart  = componentBlock('Wrap Up', CLR.wuqTitle, CLR.wuqTint);

    // ── Final Project/Output/Task block ──────────────────────────────────
    const projStart = nextCol;
    nextCol += 7;
    {
        const c = projStart;
        merges.push({ s: { r: 0, c }, e: { r: 0, c: c + 6 } });
        fill(fills, 0, c, 0, c + 6, CLR.projTitle);
        hdr[0][c] = 'Final Project/ Output/ Task (30%)';
        merges.push({ s: { r: 1, c }, e: { r: 1, c: c + 6 } });
        fill(fills, 1, c, 1, c + 6, CLR.projMastery);
        hdr[1][c] = 'Mastery';
        merges.push({ s: { r: 2, c }, e: { r: 2, c: c + 3 } });
        fill(fills, 2, c, 2, c + 6, CLR.projTint);
        fill(fills, 3, c, 3, c + 6, CLR.projTint);
        hdr[2][c] = 'Check In Grades (minimum of 1, max of 4)';
        hdr[2][c + 4] = 0.65; hdr[2][c + 5] = 0.35;
        hdr[2][c + 6] = "*if there's only one check-in, weightage becomes 50-50";
        hdr[3][c]     = 'P1\nCheck-in Grade';
        hdr[3][c + 1] = 'P2 Check-in Grade';
        hdr[3][c + 2] = 'P3.1\nCheck-in Grade';
        hdr[3][c + 3] = 'P3.2\nCheck-in Grade';
        hdr[3][c + 4] = 'Check-in Grades Average\n(65%*)\n*50% if only 1 check in';
        hdr[3][c + 5] = 'Final Output/Presentation Grade\n(35%*)\n*50% if only 1 check in';
        hdr[3][c + 6] = 'Overall Grade\n(65%-35%)';
    }

    const width = nextCol;
    hdr.forEach(r => { for (let i = 0; i < width; i++) if (r[i] === undefined) r[i] = ''; });

    // ── Data rows, 5–64 — computed with the same grading-engine.js logic
    //    the live gradebook uses, so every value here is final. ──────────
    const rows = students.slice(0, STUDENT_ROWS).map((st, i) => {
        const sid = st.user_student_id;
        const report = buildReport(sid, grades, project);
        const { modules, periods } = report;
        const projectScore = projectScoreFor(sid, project);

        const row = new Array(width).fill('');
        row[0] = i + 1;
        row[1] = st.student_id || '';
        row[2] = st.name;

        const socP1 = avgField(modules, PERIOD_MODULES.P1, 'soc');
        const socP2 = avgField(modules, PERIOD_MODULES.P2, 'soc');
        const socFin = avgField(modules, PERIOD_MODULES.Final, 'soc');
        const lpP1 = avgField(modules, PERIOD_MODULES.P1, 'letsPractice');
        const lpP2 = avgField(modules, PERIOD_MODULES.P2, 'letsPractice');
        const lpFin = avgField(modules, PERIOD_MODULES.Final, 'letsPractice');
        const reflP1 = avgField(modules, PERIOD_MODULES.P1, 'reflection');
        const reflP2 = avgField(modules, PERIOD_MODULES.P2, 'reflection');
        const reflFin = avgField(modules, PERIOD_MODULES.Final, 'reflection');
        const wuqP1 = avgField(modules, PERIOD_MODULES.P1, 'wrapUpQuiz');
        const wuqP2 = avgField(modules, PERIOD_MODULES.P2, 'wrapUpQuiz');
        const wuqFin = avgField(modules, PERIOD_MODULES.Final, 'wrapUpQuiz');

        // Per-module component blocks
        for (let m = 1; m <= 14; m++) {
            row[socStart + m - 1]  = r2(modules[m]?.soc);
            row[lpStart + m - 1]   = r2(modules[m]?.letsPractice);
            row[reflStart + m - 1] = r2(modules[m]?.reflection);
            row[wuqStart + m - 1]  = r2(modules[m]?.wrapUpQuiz);
        }
        row[socStart + 14] = r2(socP1);  row[socStart + 15] = r2(socP2);  row[socStart + 16] = r2(socFin);
        row[lpStart + 14]  = r2(lpP1);   row[lpStart + 15]  = r2(lpP2);   row[lpStart + 16]  = r2(lpFin);
        row[reflStart + 14] = r2(reflP1); row[reflStart + 15] = r2(reflP2); row[reflStart + 16] = r2(reflFin);
        row[wuqStart + 14] = r2(wuqP1);  row[wuqStart + 15] = r2(wuqP2);  row[wuqStart + 16] = r2(wuqFin);

        // Final Project/Output/Task block — one shared project, pulled straight through.
        const pg = project[sid] || {};
        row[projStart]     = pg.checkin1 ?? '';
        row[projStart + 1] = pg.checkin2 ?? '';
        row[projStart + 2] = pg.checkin3 ?? '';
        row[projStart + 3] = pg.checkin4 ?? '';
        row[projStart + 4] = r2(checkinAverage([pg.checkin1 ?? null, pg.checkin2 ?? null, pg.checkin3 ?? null, pg.checkin4 ?? null]));
        row[projStart + 5] = pg.final_output ?? '';
        row[projStart + 6] = r2(projectScore);

        // P1 computation
        row[p1Start]     = r2(socP1 !== null ? (socP1 / 100) * 5 : null);
        row[p1Start + 1] = r2(lpP1 !== null ? (lpP1 / 100) * 35 : null);
        row[p1Start + 2] = r2(reflP1 !== null ? (reflP1 / 100) * 15 : null);
        row[p1Start + 3] = r2(periods.P1.effortfulLearningGrade);
        row[p1Start + 4] = r2(wuqP1 !== null ? (wuqP1 / 100) * 15 : null);
        row[p1Start + 5] = r2(projectScore !== null ? (projectScore / 100) * 30 : null);
        row[p1Start + 6] = r2(periods.P1.masteryGrade);
        row[p1Start + 7] = r2(periods.P1.periodGrade);

        // P2 computation
        row[p2Start]     = r2(socP2 !== null ? (socP2 / 100) * 5 : null);
        row[p2Start + 1] = r2(lpP2 !== null ? (lpP2 / 100) * 35 : null);
        row[p2Start + 2] = r2(reflP2 !== null ? (reflP2 / 100) * 15 : null);
        row[p2Start + 3] = r2(periods.P2.effortfulLearningGrade);
        row[p2Start + 4] = r2(wuqP2 !== null ? (wuqP2 / 100) * 15 : null);
        row[p2Start + 5] = r2(projectScore !== null ? (projectScore / 100) * 30 : null);
        row[p2Start + 6] = r2(periods.P2.masteryGrade);
        row[p2Start + 7] = r2(periods.P2.periodGrade);

        // P3 / Final computation
        row[p3Start]     = r2(socFin !== null ? (socFin / 100) * 5 : null);
        row[p3Start + 1] = r2(lpFin !== null ? (lpFin / 100) * 35 : null);
        row[p3Start + 2] = r2(reflFin !== null ? (reflFin / 100) * 15 : null);
        row[p3Start + 3] = r2(periods.Final.effortfulLearningGrade);
        row[p3Start + 4] = r2(wuqFin !== null ? (wuqFin / 100) * 15 : null);
        row[p3Start + 5] = r2(projectScore !== null ? (projectScore / 100) * 30 : null);
        row[p3Start + 6] = r2(periods.Final.masteryGrade);
        row[p3Start + 7] = report.masteryStatus || '';
        row[p3Start + 8] = r2(periods.Final.periodGrade);
        row[p3Start + 9] = report.remarks || '';

        return row;
    });

    const cols = new Array(width).fill({ wch: 10 });
    cols[0] = { wch: 4.63 }; cols[1] = { wch: 21 }; cols[2] = { wch: 34.13 };
    cols[p3Start + 7] = { wch: 15.75 }; cols[p3Start + 8] = { wch: 12.63 }; cols[p3Start + 9] = { wch: 28.25 };

    return {
        name: sheetName,
        headerRows: HR,
        cols,
        merges,
        fills,
        rowHeights: { 1: 20.25, 2: 20.25, 3: 20.25 },
        freeze: { xSplit: 3, ySplit: HR }, // freeze panes at D5 — keeps # / Student Number / Name of Student visible
        aoa: [...hdr, ...rows],
    };
}

// ═══════════════════════════════════════════════════════════════════════
// 5. For-SIS
// ═══════════════════════════════════════════════════════════════════════
function buildForSisSheet(students, grades, project) {
    const HR = 4;
    const hdr = Array.from({ length: HR }, () => []);
    const merges = [];
    const fills = [];

    // hdr[0] only gets ONE cell per block (the merged title), so its own
    // .length can't be used as a "next free column" cursor — see the same
    // fix/comment in buildGradingSummarySheet above.
    let nextCol = 0;
    const block = (title, fields, titleStyle, leafStyle) => {
        const c = nextCol;
        const span = fields.length;
        nextCol += span;
        merges.push({ s: { r: 0, c }, e: { r: 2, c: c + span - 1 } });
        fill(fills, 0, c, 2, c + span - 1, titleStyle);
        hdr[0][c] = title;
        fields.forEach((f, i) => { hdr[3][c + i] = f; });
        fill(fills, 3, c, 3, c + span - 1, leafStyle);
        return c;
    };
    block('Student Information', ['#', 'Student Number', 'Name of Student'], CLR.info, CLR.field);
    const p1c = block('P1', ['CS\n(Effortful)', 'PE\n(Mastery)'], CLR.bandA, CLR.effortful);
    const p2c = block('P2', ['CS\n(Effortful)', 'PE\n(Mastery)'], CLR.bandB, CLR.effortful);
    const p3c = block('P3', ['CS\n(Final Effortful Grade)', 'PE\n(Final Mastery Grade)'], CLR.bandC, CLR.effortful);
    fill(fills, 3, p1c + 1, 3, p1c + 1, CLR.mastery);
    fill(fills, 3, p2c + 1, 3, p2c + 1, CLR.mastery);
    fill(fills, 3, p3c,     3, p3c + 1, CLR.final); // H, I accent

    const width = nextCol;
    hdr.forEach(r => { for (let i = 0; i < width; i++) if (r[i] === undefined) r[i] = ''; });

    const rows = students.slice(0, STUDENT_ROWS).map((st, i) => {
        const sid = st.user_student_id;
        const { periods } = buildReport(sid, grades, project);
        return [
            i + 1, st.student_id || '', st.name,
            r2(periods.P1.effortfulLearningGrade), r2(periods.P1.masteryGrade),
            r2(periods.P2.effortfulLearningGrade), r2(periods.P2.masteryGrade),
            r2(periods.Final.effortfulLearningGrade), r2(periods.Final.masteryGrade),
        ];
    });

    return {
        name: 'For-SIS',
        headerRows: HR,
        cols: [{ wch: 10.13 }, { wch: 17.88 }, { wch: 28.75 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 16.38 }, { wch: 16.25 }],
        merges,
        fills,
        freeze: { xSplit: 3, ySplit: HR }, // freeze panes at D5 — keeps # / Student Number / Name of Student visible
        aoa: [...hdr, ...rows],
    };
}

// ═══════════════════════════════════════════════════════════════════════
// 6. Tab for Retries
// ═══════════════════════════════════════════════════════════════════════
function buildTabForRetriesSheet(students, grades, project, retries) {
    const merges = [
        { s: { r: 0, c: 0 }, e: { r: 2, c: 2 } }, // A1:C3
        { s: { r: 0, c: 3 }, e: { r: 2, c: 6 } }, // D1:G3 blank
    ];
    const fills = [];
    fill(fills, 0, 0, 2, 2, CLR.info);
    fill(fills, 0, 3, 2, 6, CLR.info);
    fill(fills, 3, 4, 3, 4, CLR.effortful); // column E accent
    fill(fills, 3, 5, 3, 5, CLR.mastery);   // column F accent

    // Pre-fill identity + remarks for students who actually have an INC
    // remark — the sheet's own purpose ("Students Who Need to do Retries")
    // makes that a reasonable head start; the rest (modules/activities/
    // schedule/status/notes) stays blank for manual tracking, per spec.
    const incStudents = students
        .map(st => ({ st, report: buildReport(st.user_student_id, grades, project) }))
        .filter(({ report }) => report.remarks && String(report.remarks).startsWith('INC'));

    const rows = incStudents.map(({ st, report }, i) => {
        const r = retries[st.user_student_id] || {};
        return [
            i + 1, st.student_id || '', st.name, report.remarks || '',
            r.modules_for_retry || '', r.specific_activities || '',
            r.schedule_of_retry || '', r.status || '', r.notes || '',
        ];
    });

    return {
        name: 'Tab for Retries',
        headerRows: 4,
        cols: [{ wch: 4.63 }, { wch: 19.75 }, { wch: 16.38 }, { wch: 25.13 }, { wch: 23.13 }, { wch: 24.88 }, { wch: 23.38 }, { wch: 24.88 }, { wch: 33.38 }],
        merges,
        fills,
        rowHeights: { 4: 39.75 },
        freeze: { xSplit: 3, ySplit: 4 }, // freeze panes at D5 — keeps # / Student Number / Name of Student visible
        aoa: [
            ['Students Who Need to do Retries', '', '', '', '', '', '', '', ''],
            [], [],
            ['#', 'Student Number', 'Name of Student', 'Remarks', 'Modules with Components for Retry', 'Specific Activities', 'Schedule of Retry', 'Status', 'Remarks/Notes'],
            ...rows,
        ],
    };
}

// ═══════════════════════════════════════════════════════════════════════
// Assembly, preview, download
// ═══════════════════════════════════════════════════════════════════════
function buildExportSheets(subject, section, students, grades, project, retries, meta) {
    return [
        buildGuideSheet(subject, section, meta.teacherName, meta.campusLabel, meta.departmentLabel),
        buildGradingInputSheet(students, grades, project),
        buildGradingSummarySheet('Grading Summary Sheet', students, grades, project),
        buildGradingSummarySheet('FOR END OF SEM RETRIES Grading ', students, grades, project), // trailing space per spec
        buildForSisSheet(students, grades, project),
        buildTabForRetriesSheet(students, grades, project, retries),
    ];
}

// esc() imported from classroom-ui.js (see import above)

function styleAt(fills, r, c) {
    for (let i = fills.length - 1; i >= 0; i--) {
        const f = fills[i];
        if (r >= f.s.r && r <= f.e.r && c >= f.s.c && c <= f.e.c) return f.style;
    }
    return null;
}

/** Renders one sheet's {aoa, merges, headerRows, fills} as a read-only HTML
 *  table honoring merges (rowspan/colspan) — used by the preview modal. */
function sheetToHtml({ aoa, merges = [], headerRows = 0, fills = [] }) {
    if (!aoa.length || !aoa.some(r => r.length)) return '<p class="ggb-xprev-empty">This sheet is intentionally empty.</p>';
    const covered = new Set();
    const spanAt = new Map();
    merges.forEach(m => {
        const rs = m.e.r - m.s.r + 1, cs = m.e.c - m.s.c + 1;
        if (rs > 1 || cs > 1) spanAt.set(`${m.s.r},${m.s.c}`, { rowSpan: rs, colSpan: cs });
        for (let r = m.s.r; r <= m.e.r; r++) for (let c = m.s.c; c <= m.e.c; c++) {
            if (r === m.s.r && c === m.s.c) continue;
            covered.add(`${r},${c}`);
        }
    });
    const maxCol = Math.max(0, ...aoa.map(r => r.length - 1));
    const rowsHtml = aoa.map((row, r) => {
        const tag = r < headerRows ? 'th' : 'td';
        let cellsHtml = '';
        for (let c = 0; c <= maxCol; c++) {
            const key = `${r},${c}`;
            if (covered.has(key)) continue;
            const span = spanAt.get(key);
            const attrs = span ? ` rowspan="${span.rowSpan}" colspan="${span.colSpan}"` : '';
            const st = styleAt(fills, r, c);
            const style = st ? ` style="${st.bg ? `background:#${st.bg};` : ''}color:#${st.fg};${st.bold ? 'font-weight:700;' : ''}${st.sz ? `font-size:${st.sz + 2}px;` : ''}"` : '';
            cellsHtml += `<${tag}${attrs}${style}>${esc(row[c] ?? '')}</${tag}>`;
        }
        return `<tr>${cellsHtml}</tr>`;
    }).join('');
    return `<table class="ggb-xprev-table">${rowsHtml}</table>`;
}

let sheetJsLoadPromise = null;
/** Loads the vendored xlsx-js-style build (local file, not a CDN — works
 *  offline like the rest of this PWA). Stock SheetJS Community Edition
 *  silently drops cell fill/font colors on write (a Pro-only feature
 *  there); this fork restores it for free. */
function loadXlsxStyleLib() {
    if (window.XLSX?.writeFile) return Promise.resolve(window.XLSX);
    if (sheetJsLoadPromise) return sheetJsLoadPromise;
    sheetJsLoadPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = new URL('../../vendor/xlsx-js-style.min.js', import.meta.url).href;
        s.onload  = () => resolve(window.XLSX);
        s.onerror = () => { sheetJsLoadPromise = null; reject(new Error('Could not load the Excel export library.')); };
        document.head.appendChild(s);
    });
    return sheetJsLoadPromise;
}

function applyFills(ws, fills) {
    (fills || []).forEach(f => {
        for (let r = f.s.r; r <= f.e.r; r++) {
            for (let c = f.s.c; c <= f.e.c; c++) {
                const ref = window.XLSX.utils.encode_cell({ r, c });
                if (!ws[ref]) ws[ref] = { t: 's', v: '' };
                ws[ref].s = {
                    ...(f.style.bg ? { fill: { patternType: 'solid', fgColor: { rgb: f.style.bg } } } : {}),
                    font: { bold: !!f.style.bold, color: { rgb: f.style.fg }, ...(f.style.sz ? { sz: f.style.sz } : {}) },
                    alignment: { vertical: 'center', horizontal: 'center', wrapText: true },
                    border: { top: { style: 'thin', color: { rgb: 'D1D5DB' } }, bottom: { style: 'thin', color: { rgb: 'D1D5DB' } }, left: { style: 'thin', color: { rgb: 'D1D5DB' } }, right: { style: 'thin', color: { rgb: 'D1D5DB' } } },
                };
            }
        }
    });
}

async function downloadWorkbook(sheets, subject, section) {
    const XLSX = await loadXlsxStyleLib();
    const wb = XLSX.utils.book_new();
    const patchBySafeName = new Map();
    sheets.forEach(s => {
        const ws = XLSX.utils.aoa_to_sheet(s.aoa);
        if (s.merges?.length) ws['!merges'] = s.merges;
        if (s.cols?.length)   ws['!cols']   = s.cols;
        if (s.rowHeights) {
            ws['!rows'] = ws['!rows'] || [];
            Object.entries(s.rowHeights).forEach(([r, h]) => { ws['!rows'][Number(r) - 1] = { hpx: h }; });
        }
        applyFills(ws, s.fills);
        const safeName = s.name.replace(/[:\\/?*[\]]/g, '').slice(0, 31);
        if (s.freeze || s.dataValidations?.length) {
            patchBySafeName.set(safeName, { freeze: s.freeze, dataValidations: s.dataValidations });
        }
        XLSX.utils.book_append_sheet(wb, ws, safeName);
    });
    const raw = `${subject.subject_name || subject.subject_code} ${section.section_name}`.trim();
    const filename = `${raw.replace(/[\\/:*?"<>|]+/g, '')}.xlsx`;

    // xlsx-js-style (SheetJS 0.18.5 base) doesn't implement writing freeze
    // panes or data validation dropdowns on its own — both are silently
    // ignored on write — so they have to be patched into the generated
    // .xlsx (a plain zip) after the fact. See patchWorksheetXml() below.
    const rawBuf = XLSX.write(wb, { type: 'array', bookType: 'xlsx', cellStyles: true });
    const patched = await patchWorksheetXml(new Uint8Array(rawBuf), patchBySafeName);
    saveBytesAsFile(patched, filename);
}

function saveBytesAsFile(bytes, filename) {
    const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── Freeze panes (post-processing the generated .xlsx zip) ──────────────
// xlsx-js-style never writes real freeze-pane XML for ws['!freeze'], so
// this reads the zip xlsx.write() produced, finds each target worksheet's
// <sheetView> element, and injects the <pane>/<selection> XML Excel
// actually reads. Rewritten entries use the STORE (uncompressed) method —
// the same method XLSX.write() already defaults to (no `compression:true`
// is passed anywhere in this file) — so no deflate/inflate implementation
// is needed for the common case; DecompressionStream is only reached as a
// defensive fallback if that assumption ever stops holding.

const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        t[n] = c >>> 0;
    }
    return t;
})();
function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
}

function readZipEntries(buf) {
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    let eocd = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) {
        if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('not a valid zip (no EOCD)');
    const total = dv.getUint16(eocd + 10, true);
    let cdOffset = dv.getUint32(eocd + 16, true);
    const entries = [];
    for (let i = 0; i < total; i++) {
        if (dv.getUint32(cdOffset, true) !== 0x02014b50) throw new Error('bad central directory');
        const method     = dv.getUint16(cdOffset + 10, true);
        const crc        = dv.getUint32(cdOffset + 16, true);
        const compSize   = dv.getUint32(cdOffset + 20, true);
        const nameLen    = dv.getUint16(cdOffset + 28, true);
        const extraLen   = dv.getUint16(cdOffset + 30, true);
        const commentLen = dv.getUint16(cdOffset + 32, true);
        const localOffset = dv.getUint32(cdOffset + 42, true);
        const name = new TextDecoder().decode(buf.subarray(cdOffset + 46, cdOffset + 46 + nameLen));
        entries.push({ name, method, crc, compSize, localOffset });
        cdOffset += 46 + nameLen + extraLen + commentLen;
    }
    for (const e of entries) {
        const lo = e.localOffset;
        if (dv.getUint32(lo, true) !== 0x04034b50) throw new Error('bad local header for ' + e.name);
        const nameLen = dv.getUint16(lo + 26, true);
        const extraLen = dv.getUint16(lo + 28, true);
        const dataStart = lo + 30 + nameLen + extraLen;
        e.data = buf.subarray(dataStart, dataStart + e.compSize);
    }
    return entries;
}

async function inflateIfNeeded(entry) {
    if (entry.method === 0) return entry.data;
    if (typeof DecompressionStream === 'undefined') throw new Error('compressed entry, no inflater available');
    const stream = new Blob([entry.data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Rebuilds the .xlsx as a fresh zip. `replacements`: Map<entryName, Uint8Array> written as STORE; everything else passes through byte-for-byte (whatever its original method was). */
function rebuildZip(entries, replacements) {
    const encoder = new TextEncoder();
    const localChunks = [];
    const centralChunks = [];
    let offset = 0;

    for (const e of entries) {
        const replacement = replacements.get(e.name);
        const data   = replacement || e.data;
        const method = replacement ? 0 : e.method;
        const crc    = replacement ? crc32(replacement) : e.crc;
        const size   = data.length;
        const nameBytes = encoder.encode(e.name);

        const lfh = new Uint8Array(30 + nameBytes.length);
        const lv = new DataView(lfh.buffer);
        lv.setUint32(0, 0x04034b50, true);
        lv.setUint16(4, 20, true);
        lv.setUint16(6, 0, true);
        lv.setUint16(8, method, true);
        lv.setUint16(10, 0, true);
        lv.setUint16(12, 0x21, true); // DOS date 1980-01-01 — Excel doesn't care about the exact value
        lv.setUint32(14, crc, true);
        lv.setUint32(18, size, true);
        lv.setUint32(22, size, true);
        lv.setUint16(26, nameBytes.length, true);
        lv.setUint16(28, 0, true);
        lfh.set(nameBytes, 30);
        localChunks.push(lfh, data);

        const cdh = new Uint8Array(46 + nameBytes.length);
        const cv = new DataView(cdh.buffer);
        cv.setUint32(0, 0x02014b50, true);
        cv.setUint16(4, 20, true);
        cv.setUint16(6, 20, true);
        cv.setUint16(8, 0, true);
        cv.setUint16(10, method, true);
        cv.setUint16(12, 0, true);
        cv.setUint16(14, 0x21, true);
        cv.setUint32(16, crc, true);
        cv.setUint32(20, size, true);
        cv.setUint32(24, size, true);
        cv.setUint16(28, nameBytes.length, true);
        cv.setUint16(30, 0, true);
        cv.setUint16(32, 0, true);
        cv.setUint16(34, 0, true);
        cv.setUint16(36, 0, true);
        cv.setUint32(38, 0, true);
        cv.setUint32(42, offset, true);
        cdh.set(nameBytes, 46);
        centralChunks.push(cdh);

        offset += lfh.length + data.length;
    }

    const cdStart = offset;
    const cdSize = centralChunks.reduce((a, c) => a + c.length, 0);

    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, entries.length, true);
    ev.setUint16(10, entries.length, true);
    ev.setUint32(12, cdSize, true);
    ev.setUint32(16, cdStart, true);

    const out = new Uint8Array(offset + cdSize + eocd.length);
    let p = 0;
    for (const chunk of localChunks)   { out.set(chunk, p); p += chunk.length; }
    for (const chunk of centralChunks) { out.set(chunk, p); p += chunk.length; }
    out.set(eocd, p);
    return out;
}

function xmlUnescape(s) {
    return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

/** 0-indexed column number -> letters (A, B, ..., Z, AA, ...). */
function colLetters(n) {
    n += 1;
    let s = '';
    while (n > 0) {
        const rem = (n - 1) % 26;
        s = String.fromCharCode(65 + rem) + s;
        n = Math.floor((n - 1) / 26);
    }
    return s;
}

function injectPaneIntoSheetXml(xml, { xSplit, ySplit }) {
    const topLeftCell = `${colLetters(xSplit)}${ySplit + 1}`;
    const activePane = xSplit > 0 && ySplit > 0 ? 'bottomRight' : ySplit > 0 ? 'bottomLeft' : 'topRight';
    const pane = `<pane xSplit="${xSplit}" ySplit="${ySplit}" topLeftCell="${topLeftCell}" activePane="${activePane}" state="frozen"/><selection pane="${activePane}" activeCell="${topLeftCell}" sqref="${topLeftCell}"/>`;
    if (/<sheetView\b[^>]*\/>/.test(xml)) return xml.replace(/<sheetView\b([^>]*)\/>/, (_, attrs) => `<sheetView${attrs}>${pane}</sheetView>`);
    if (/<sheetView\b[^>]*>/.test(xml))  return xml.replace(/(<sheetView\b[^>]*>)/, m => `${m}${pane}`);
    return xml;
}

function xmlEscape(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Injects one <dataValidations> block (dropdown lists) before whichever of
 *  pageMargins/pageSetup/hyperlinks/</worksheet> appears first — the correct
 *  OOXML schema position is right after <mergeCells>, and SheetJS's own
 *  output has nothing else in between, but this stays safe either way. */
function injectDataValidationsIntoSheetXml(xml, validations) {
    if (!validations?.length) return xml;
    const rules = validations.map(v =>
        `<dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1" sqref="${xmlEscape(v.sqref)}"><formula1>"${v.list.join(',')}"</formula1></dataValidation>`
    ).join('');
    const block = `<dataValidations count="${validations.length}">${rules}</dataValidations>`;
    // Per the OOXML CT_Worksheet schema, <dataValidations> must appear
    // before ALL of these (in this exact relative order) — SheetJS itself
    // emits <ignoredErrors>, which sits earlier in that sequence than the
    // pageMargins/hyperlinks tags this used to check for; missing it put
    // <dataValidations> in the wrong position and Excel flagged the file as
    // needing repair. Match the first of any of them, in document order.
    const anchor = xml.match(/<hyperlinks\b|<printOptions\b|<pageMargins\b|<pageSetup\b|<headerFooter\b|<rowBreaks\b|<colBreaks\b|<customProperties\b|<cellWatches\b|<ignoredErrors\b|<smartTags\b|<drawing\b|<legacyDrawing\b|<oleObjects\b|<controls\b|<webPublishItems\b|<tableParts\b|<extLst\b|<\/worksheet>/);
    if (!anchor) return xml;
    return xml.slice(0, anchor.index) + block + xml.slice(anchor.index);
}

/** Patches freeze panes / dropdown data validations into the sheets named in
 *  `specBySafeName` (Map<sheetName, {freeze?, dataValidations?}>). Fails
 *  safe: any parsing problem just returns the original bytes untouched. */
async function patchWorksheetXml(buf, specBySafeName) {
    if (specBySafeName.size === 0) return buf;
    try {
        const entries = readZipEntries(buf);
        const decoder = new TextDecoder();
        const wbEntry = entries.find(e => e.name === 'xl/workbook.xml');
        const relsEntry = entries.find(e => e.name === 'xl/_rels/workbook.xml.rels');
        if (!wbEntry || !relsEntry) return buf;
        const wbXml = decoder.decode(await inflateIfNeeded(wbEntry));
        const relsXml = decoder.decode(await inflateIfNeeded(relsEntry));

        const ridToTarget = new Map();
        for (const m of relsXml.matchAll(/<Relationship\b[^>]*\/>/g)) {
            const idM = m[0].match(/Id="([^"]+)"/);
            const targetM = m[0].match(/Target="([^"]+)"/);
            if (idM && targetM) ridToTarget.set(idM[1], targetM[1]);
        }
        const nameToFile = new Map();
        for (const m of wbXml.matchAll(/<sheet\b[^>]*\/>/g)) {
            const nameM = m[0].match(/name="([^"]+)"/);
            const ridM = m[0].match(/r:id="([^"]+)"/);
            if (!nameM || !ridM) continue;
            const target = ridToTarget.get(ridM[1]);
            if (!target) continue;
            const path = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
            nameToFile.set(xmlUnescape(nameM[1]), path);
        }

        const replacements = new Map();
        for (const [sheetName, spec] of specBySafeName) {
            const path = nameToFile.get(sheetName);
            if (!path) continue;
            const entry = entries.find(e => e.name === path);
            if (!entry) continue;
            let xml = decoder.decode(await inflateIfNeeded(entry));
            if (spec.freeze) xml = injectPaneIntoSheetXml(xml, spec.freeze);
            if (spec.dataValidations?.length) xml = injectDataValidationsIntoSheetXml(xml, spec.dataValidations);
            replacements.set(path, new TextEncoder().encode(xml));
        }
        if (replacements.size === 0) return buf;
        return rebuildZip(entries, replacements);
    } catch (err) {
        console.warn('gradebook export: could not apply freeze panes / dropdowns —', err.message);
        return buf;
    }
}

let stylesInjected = false;
function injectStyles() {
    if (stylesInjected) return;
    stylesInjected = true;
    const style = document.createElement('style');
    style.id = 'ggb-xlsx-export-styles';
    style.textContent = `
        .ggb-xprev-overlay { position:fixed; inset:0; z-index:10000; background:rgba(0,0,0,.55);
            display:flex; align-items:center; justify-content:center; padding:16px; }
        .ggb-xprev-modal { background:#fff; border-radius:14px; width:100%; max-width:1180px; height:88vh;
            display:flex; flex-direction:column; box-shadow:0 24px 64px rgba(0,0,0,.35); overflow:hidden; }
        .ggb-xprev-hdr { display:flex; justify-content:space-between; align-items:flex-start; gap:12px;
            padding:18px 22px 14px; border-bottom:2px solid #111; flex-shrink:0; }
        .ggb-xprev-hdr h3 { margin:0 0 4px; font-size:16px; font-weight:800; color:#111; }
        .ggb-xprev-hdr p { margin:0; font-size:12px; color:#6B7280; }
        .ggb-xprev-close { background:none; border:none; font-size:22px; color:#9CA3AF; cursor:pointer; line-height:1; flex-shrink:0; }
        .ggb-xprev-close:hover { color:#374151; }
        .ggb-xprev-tabs { display:flex; gap:4px; padding:0 22px; border-bottom:1px solid #E5E7EB; overflow-x:auto; flex-shrink:0; }
        .ggb-xprev-tab { padding:9px 14px; border:none; background:none; cursor:pointer; font-size:12.5px;
            font-weight:600; color:#6B7280; white-space:nowrap; border-bottom:2.5px solid transparent; font-family:inherit; }
        .ggb-xprev-tab:hover { color:#00461B; }
        .ggb-xprev-tab.active { color:#00461B; border-bottom-color:#00461B; }
        .ggb-xprev-body { flex:1; overflow:auto; padding:16px 22px; }
        .ggb-xprev-pane { display:none; }
        .ggb-xprev-pane.active { display:block; }
        .ggb-xprev-table { border-collapse:collapse; font-size:10.5px; }
        .ggb-xprev-table th, .ggb-xprev-table td { border:1px solid #D1D5DB; padding:4px 7px; text-align:center; white-space:pre-line; }
        .ggb-xprev-table td:nth-child(3) { text-align:left; white-space:nowrap; }
        .ggb-xprev-empty { color:#9CA3AF; font-style:italic; font-size:13px; }
        .ggb-xprev-ftr { display:flex; justify-content:space-between; align-items:center; gap:12px;
            padding:14px 22px; border-top:2px solid #111; flex-shrink:0; }
        .ggb-xprev-hint { font-size:11.5px; color:#9CA3AF; }
        .ggb-xprev-btn { display:inline-flex; align-items:center; gap:6px; padding:10px 18px; border-radius:8px;
            font-size:13px; font-weight:700; cursor:pointer; border:1.5px solid #111; font-family:inherit; }
        .ggb-xprev-btn-cancel { background:#fff; color:#374151; }
        .ggb-xprev-btn-cancel:hover { background:#F3F4F6; }
        .ggb-xprev-btn-download { background:#00461B; color:#fff; border-color:#00461B; }
        .ggb-xprev-btn-download:hover { background:#006428; }
        .ggb-xprev-btn-download:disabled { opacity:.6; cursor:not-allowed; }
    `;
    document.head.appendChild(style);
}

/**
 * Opens the export preview (Guide / Grading Input Sheet / Grading Summary
 * Sheet / FOR END OF SEM RETRIES Grading  / For-SIS / Tab for Retries),
 * then writes the real .xlsx only once Download is clicked.
 */
export function openGradingWorkbookExport(subject, section, students, grades, project, retries, meta = {}) {
    injectStyles();
    const sheets = buildExportSheets(subject, section, students, grades, project, retries, meta);

    document.querySelectorAll('#ggb-xlsx-xprev-overlay').forEach(el => el.remove());
    const overlay = document.createElement('div');
    overlay.id = 'ggb-xlsx-xprev-overlay';
    overlay.className = 'ggb-xprev-overlay';
    overlay.innerHTML = `
        <div class="ggb-xprev-modal" role="dialog" aria-label="Export Preview">
            <div class="ggb-xprev-hdr">
                <div>
                    <h3>Export Preview</h3>
                    <p>${sheets.length} sheets — every value shown is already computed, exactly what gets written to the file.</p>
                </div>
                <button type="button" class="ggb-xprev-close" id="ggb-xlsx-close" aria-label="Close">&times;</button>
            </div>
            <div class="ggb-xprev-tabs">
                ${sheets.map((s, i) => `<button type="button" class="ggb-xprev-tab${i === 0 ? ' active' : ''}" data-xtab="${i}">${esc(s.name.trim())}</button>`).join('')}
            </div>
            <div class="ggb-xprev-body">
                ${sheets.map((s, i) => `<div class="ggb-xprev-pane${i === 0 ? ' active' : ''}" id="ggb-xlsx-pane-${i}">${sheetToHtml(s)}</div>`).join('')}
            </div>
            <div class="ggb-xprev-ftr">
                <span class="ggb-xprev-hint">Matches what will be in the downloaded .xlsx file.</span>
                <div style="display:flex; gap:10px;">
                    <button type="button" class="ggb-xprev-btn ggb-xprev-btn-cancel" id="ggb-xlsx-cancel">Cancel</button>
                    <button type="button" class="ggb-xprev-btn ggb-xprev-btn-download" id="ggb-xlsx-download">
                        ${icon('download', inl)} Download .xlsx
                    </button>
                </div>
            </div>
        </div>`;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('#ggb-xlsx-close').addEventListener('click', close);
    overlay.querySelector('#ggb-xlsx-cancel').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    overlay.querySelectorAll('.ggb-xprev-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const i = tab.dataset.xtab;
            overlay.querySelectorAll('.ggb-xprev-tab').forEach(b => b.classList.toggle('active', b === tab));
            overlay.querySelectorAll('.ggb-xprev-pane').forEach(p => p.classList.toggle('active', p.id === `ggb-xlsx-pane-${i}`));
        });
    });

    const dlBtn = overlay.querySelector('#ggb-xlsx-download');
    dlBtn.addEventListener('click', async () => {
        const orig = dlBtn.innerHTML;
        dlBtn.disabled = true;
        dlBtn.textContent = 'Preparing…';
        try {
            await downloadWorkbook(sheets, subject, section);
            close();
        } catch (err) {
            console.error('grading workbook export:', err);
            dlBtn.disabled = false;
            dlBtn.innerHTML = orig;
            await notify.alert(err.message || 'Export failed. Please try again.', { title: 'Export Failed', type: 'error' });
        }
    });
}

// icon() is duplicated here (not imported) on purpose — importing the full
// icons util would pull the whole set in for one function; this keeps the
// module self-contained since it's already dynamically-scoped code.
function icon(name, opts = {}) {
    return `<span class="${opts.className || ''}" style="display:inline-flex;width:${opts.size || 16}px;height:${opts.size || 16}px;vertical-align:-3px;">${ICONS[name] || ''}</span>`;
}
const ICONS = {
    download: '<svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
};
