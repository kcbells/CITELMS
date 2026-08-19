/**
 * Grading Engine — "Effortful Learning" / "Mastery" model
 * Mirrors the reference Excel gradebook: 14 modules, 3 grading periods (P1, P2, Final).
 *
 * Pure functions only — no DOM, no fetch. Every function is null-safe: a
 * missing/blank input propagates as `null`, never silently becomes 0.
 *
 * IMPORTANT — resolved ambiguity in the per-module Effortful Learning formula:
 * The spec states the per-module EL formula "always divides by the full 55
 * (not just the weights of fields that were actually filled in), except in
 * the Final (P3) EL formula, which divides only by the sum of weights of
 * non-blank components." That means there are two divisor modes for the
 * SAME per-module formula, selected by which period is being aggregated:
 *   - P1 / P2  → fixed divisor of 55 (missing components just don't add to
 *                the numerator; the denominator stays 55 regardless).
 *   - Final    → dynamic divisor = sum of weights of the non-blank
 *                components only (this is the literal Section 4 pseudocode).
 * `moduleEffortfulLearningGrade()` takes a `period` argument to select the
 * correct mode; `periodEffortfulLearningGrade()` passes it through per module.
 */

// ── 1-2. Rubric conversion ──────────────────────────────────────────────────

export const RUBRIC_SCALE = { 0: 0, 1: 60, 2: 80, 3: 100 };

/** @param {0|1|2|3|null} score */
export function rubricToPercent(score) {
    if (score === null || score === undefined || score === '') return null;
    const key = typeof score === 'number' ? score : parseInt(score, 10);
    const v = RUBRIC_SCALE[key];
    return v !== undefined ? v : null;
}

/**
 * Let's Practice: average of whichever attempt(s) exist, each converted
 * from rubric score to percent individually before averaging.
 * @param {0|1|2|3|null} letsPractice
 * @param {0|1|2|3|null} letsPracticeOptional
 */
export function letsPracticeGrade(letsPractice, letsPracticeOptional) {
    const raw = [letsPractice, letsPracticeOptional].filter(
        (v) => v !== null && v !== undefined && v !== ''
    );
    if (raw.length === 0) return null;
    const values = raw.map((v) => rubricToPercent(v)).filter((v) => v !== null);
    if (values.length === 0) return null;
    return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Reflection: single rubric value converted directly, no averaging.
 * @param {0|1|2|3|null} reflection
 */
export function reflectionGrade(reflection) {
    return rubricToPercent(reflection);
}

// ── 3. SOC (Start of Class) attendance percentage ───────────────────────────

/**
 * @param {"P"|"A"|null} soc1
 * @param {"P"|"A"|null} soc2
 */
export function socGrade(soc1, soc2) {
    const entries = [soc1, soc2].filter((x) => x === 'P' || x === 'A');
    if (entries.length === 0) return null;
    const presentCount = entries.filter((x) => x === 'P').length;
    return (presentCount / entries.length) * 100;
}

// ── 4. Per-module Effortful Learning grade — weight 55% ─────────────────────

const EL_WEIGHTS = { soc: 5, lp: 35, reflection: 15 };
const EL_TOTAL_WEIGHT = EL_WEIGHTS.soc + EL_WEIGHTS.lp + EL_WEIGHTS.reflection; // 55

/**
 * @param {number|null} soc          0-100, already-computed SOC percentage
 * @param {number|null} letsPractice 0-100, already-computed Let's Practice percentage
 * @param {number|null} reflection   0-100, already-computed Reflection percentage
 * @param {"P1"|"P2"|"Final"} period Selects fixed-55 (P1/P2) vs dynamic (Final) divisor
 */
export function moduleEffortfulLearningGrade(soc, letsPractice, reflection, period = 'Final') {
    let total = 0;
    let presentWeights = 0;

    if (soc !== null && soc !== undefined) {
        total += (soc / 100) * EL_WEIGHTS.soc;
        presentWeights += EL_WEIGHTS.soc;
    }
    if (letsPractice !== null && letsPractice !== undefined) {
        total += (letsPractice / 100) * EL_WEIGHTS.lp;
        presentWeights += EL_WEIGHTS.lp;
    }
    if (reflection !== null && reflection !== undefined) {
        total += (reflection / 100) * EL_WEIGHTS.reflection;
        presentWeights += EL_WEIGHTS.reflection;
    }

    if (presentWeights === 0) return null;

    const divisor = period === 'Final' ? presentWeights : EL_TOTAL_WEIGHT;
    return (total / divisor) * 100;
}

// ── 5. Per-module Mastery grade — weight 45% ────────────────────────────────

const MASTERY_WEIGHTS = { wrapUpQuiz: 15, project: 30 };
const MASTERY_TOTAL_WEIGHT = MASTERY_WEIGHTS.wrapUpQuiz + MASTERY_WEIGHTS.project; // 45

/**
 * @param {number|null} wrapUpQuiz   0-100
 * @param {number|null} projectScore 0-100, the PERIOD's project score (shared across its modules)
 */
export function moduleMasteryGrade(wrapUpQuiz, projectScore) {
    if ((wrapUpQuiz === null || wrapUpQuiz === undefined) &&
        (projectScore === null || projectScore === undefined)) {
        return null;
    }
    const wq = (wrapUpQuiz   !== null && wrapUpQuiz   !== undefined) ? (wrapUpQuiz   / 100) * MASTERY_WEIGHTS.wrapUpQuiz : 0;
    const pj = (projectScore !== null && projectScore !== undefined) ? (projectScore / 100) * MASTERY_WEIGHTS.project    : 0;
    return ((wq + pj) / MASTERY_TOTAL_WEIGHT) * 100;
}

// ── 6. Project / Final Output grade (per period) ────────────────────────────

/**
 * @param {(number|null)[]} checkins  up to 4 check-in grades (P1, P2, P3.1, P3.2)
 * @returns {number|null} plain average of whichever check-ins have a value —
 *          the same "Check-in Grades Average" column shown on the reference
 *          SAS spreadsheet, factored out so the table can display it
 *          alongside the overall grade instead of only using it internally.
 */
export function checkinAverage(checkins) {
    const valid = (checkins || []).filter((v) => v !== null && v !== undefined);
    return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
}

/**
 * @param {(number|null)[]} checkins  up to 4 check-in grades (P1, P2, P3.1, P3.2)
 * @param {number|null} finalOutputGrade
 */
export function projectOverallGrade(checkins, finalOutputGrade) {
    const valid = (checkins || []).filter((v) => v !== null && v !== undefined);
    const checkinAvg = checkinAverage(checkins);

    const hasOutput = finalOutputGrade !== null && finalOutputGrade !== undefined;

    if (checkinAvg === null && !hasOutput) return null;
    if (checkinAvg === null) return finalOutputGrade;
    if (!hasOutput) return checkinAvg;

    const [checkinWeight, outputWeight] = valid.length === 1 ? [0.5, 0.5] : [0.65, 0.35];
    return checkinAvg * checkinWeight + finalOutputGrade * outputWeight;
}

// ── 7. Period grade — blends EL and Mastery ─────────────────────────────────

export const EL_WEIGHT = 0.55;
export const MASTERY_WEIGHT = 0.45;

export const PERIOD_MODULES = {
    P1:    [1, 2, 3, 4],
    P2:    [1, 2, 3, 4, 5, 6, 7, 8, 9],
    Final: Array.from({ length: 14 }, (_, i) => i + 1),
};
export const PERIODS = ['P1', 'P2', 'Final'];

function averageNonNull(values) {
    const v = values.filter((x) => x !== null && x !== undefined);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

/**
 * @param {number|null} elGrade
 * @param {number|null} masteryGrade
 */
export function periodGrade(elGrade, masteryGrade) {
    const hasEl = elGrade !== null && elGrade !== undefined;
    const hasMastery = masteryGrade !== null && masteryGrade !== undefined;
    if (!hasEl && !hasMastery) return null;
    if (!hasEl) return masteryGrade;
    if (!hasMastery) return elGrade;
    return elGrade * EL_WEIGHT + masteryGrade * MASTERY_WEIGHT;
}

/**
 * Averages the per-module EL grades covered by a period's module range.
 * @param {number[]} moduleRange e.g. PERIOD_MODULES.P1
 * @param {(moduleNumber:number)=>number|null} getModuleEl  returns a module's EL grade
 */
export function periodEffortfulLearningGrade(moduleRange, getModuleEl) {
    const values = moduleRange.map(getModuleEl);
    return averageNonNull(values);
}

/**
 * Averages the per-module Mastery grades covered by a period's module range.
 * @param {number[]} moduleRange
 * @param {(moduleNumber:number)=>number|null} getModuleMastery
 */
export function periodMasteryGrade(moduleRange, getModuleMastery) {
    const values = moduleRange.map(getModuleMastery);
    return averageNonNull(values);
}

// ── 8. Mastery passing check ─────────────────────────────────────────────────

export const MASTERY_PASS_THRESHOLD = 80;

/** @param {number|null} finalMasteryGrade */
export function masteryStatus(finalMasteryGrade) {
    if (finalMasteryGrade === null || finalMasteryGrade === undefined) return null;
    return finalMasteryGrade >= MASTERY_PASS_THRESHOLD ? 'Met Mastery' : 'Retry Mastery components';
}

// ── 9. Final remarks / student status ────────────────────────────────────────

/**
 * @param {"Met Mastery"|"Retry Mastery components"|null} status
 * @param {number|null} finalPeriodGrade
 */
export function finalRemarks(status, finalPeriodGrade) {
    if (status === null || status === undefined) return null;
    if (finalPeriodGrade === null || finalPeriodGrade === undefined) return null;

    const passed = finalPeriodGrade >= MASTERY_PASS_THRESHOLD;
    if (status === 'Met Mastery' && passed)   return 'Passed';
    if (status === 'Met Mastery' && !passed)  return 'INC - Retry Effortful';
    if (status === 'Retry Mastery components' && passed)  return 'INC - Retry Mastery';
    if (status === 'Retry Mastery components' && !passed) return 'INC - Retry Effortful and Mastery';
    return null;
}

// ── 10. Full per-student, per-period computation ────────────────────────────

/**
 * @typedef {Object} ModuleInput
 * @property {"P"|"A"|null} soc1
 * @property {"P"|"A"|null} soc2
 * @property {0|1|2|3|null} letsPractice
 * @property {0|1|2|3|null} letsPracticeOptional
 * @property {0|1|2|3|null} reflection
 * @property {number|null}  wrapUpQuiz
 */

/**
 * Computes everything for one student: per-module EL/Mastery grades, all
 * three period results, mastery status, and final remarks.
 *
 * @param {Object} params
 * @param {(moduleNumber:number)=>ModuleInput} params.getModuleInput  raw inputs for module 1-14
 * @param {(period:"P1"|"P2"|"Final")=>{checkins:(number|null)[], finalOutput:number|null}} params.getPeriodProject
 * @returns {{
 *   modules: Record<number, {effortfulLearning: Record<string, number|null>, mastery: number|null}>,
 *   periods: Record<"P1"|"P2"|"Final", {effortfulLearningGrade: number|null, masteryGrade: number|null, periodGrade: number|null}>,
 *   masteryStatus: "Met Mastery"|"Retry Mastery components"|null,
 *   remarks: string|null,
 * }}
 */
export function computeStudentReport({ getModuleInput, getPeriodProject }) {
    // Per-module SOC / Let's Practice / Reflection are period-independent —
    // compute once. EL itself depends on period (fixed-55 vs dynamic divisor),
    // so it's memoised per (module, period).
    const socByModule = {};
    const lpByModule = {};
    const reflByModule = {};
    const wuqByModule = {};

    for (let m = 1; m <= 14; m++) {
        const input = getModuleInput(m) || {};
        socByModule[m]  = socGrade(input.soc1 ?? null, input.soc2 ?? null);
        lpByModule[m]   = letsPracticeGrade(input.letsPractice ?? null, input.letsPracticeOptional ?? null);
        reflByModule[m] = reflectionGrade(input.reflection ?? null);
        wuqByModule[m]  = (input.wrapUpQuiz === undefined ? null : input.wrapUpQuiz);
    }

    const elCache = {}; // `${module}:${period}` -> value
    function moduleEl(m, period) {
        const key = `${m}:${period}`;
        if (!(key in elCache)) {
            elCache[key] = moduleEffortfulLearningGrade(socByModule[m], lpByModule[m], reflByModule[m], period);
        }
        return elCache[key];
    }

    const masteryCache = {}; // `${module}:${period}` -> value (mastery depends on the period's project score)
    const projectScoreByPeriod = {};
    function moduleMastery(m, period) {
        const key = `${m}:${period}`;
        if (!(key in masteryCache)) {
            // A module isn't "graded" for Mastery until it has its own Wrap-Up
            // Quiz score. The period's Project score is shared across every
            // module in range, so without this guard an ungraded module would
            // still produce a partial (quiz=0 + shared project) Mastery value
            // and silently drag the period average down — even though nothing
            // has actually been entered for that module yet.
            if (wuqByModule[m] === null || wuqByModule[m] === undefined) {
                masteryCache[key] = null;
            } else {
                if (!(period in projectScoreByPeriod)) {
                    const pp = getPeriodProject(period) || {};
                    projectScoreByPeriod[period] = projectOverallGrade(pp.checkins || [], pp.finalOutput ?? null);
                }
                masteryCache[key] = moduleMasteryGrade(wuqByModule[m], projectScoreByPeriod[period]);
            }
        }
        return masteryCache[key];
    }

    /** @type {Record<string, {effortfulLearningGrade:number|null, masteryGrade:number|null, periodGrade:number|null}>} */
    const periods = {};
    for (const period of PERIODS) {
        const range = PERIOD_MODULES[period];
        const el = periodEffortfulLearningGrade(range, (m) => moduleEl(m, period));
        const mastery = periodMasteryGrade(range, (m) => moduleMastery(m, period));
        periods[period] = {
            effortfulLearningGrade: el,
            masteryGrade: mastery,
            periodGrade: periodGrade(el, mastery),
        };
    }

    const status = masteryStatus(periods.Final.masteryGrade);
    const remarks = finalRemarks(status, periods.Final.periodGrade);

    const modules = {};
    for (let m = 1; m <= 14; m++) {
        modules[m] = {
            soc: socByModule[m],
            letsPractice: lpByModule[m],
            reflection: reflByModule[m],
            wrapUpQuiz: wuqByModule[m],
        };
    }

    return { modules, periods, masteryStatus: status, remarks };
}

export function formatGrade(value, decimals = 2) {
    if (value === null || value === undefined || Number.isNaN(value)) return '—';
    return Number(value).toFixed(decimals);
}
