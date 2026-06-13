/**
 * Client-side quiz proctoring state — shared by take-quiz, app router, and AI assistant.
 */

let proctored = false;
let practiceQuiz = false;
let quizId = null;
let quizInProgress = false;
let attemptsRemaining = null;
let maxAttempts = null;
let leaveConfirmHandler = null;
let confirmedExitHandler = null;

export function setQuizProctoring(active, options = {}) {
    proctored = !!active;
    practiceQuiz = !!options.practice;
    quizId = options.quizId ?? null;
    if (options.attemptsRemaining !== undefined) attemptsRemaining = options.attemptsRemaining;
    if (options.maxAttempts !== undefined) maxAttempts = options.maxAttempts;
    document.body.classList.toggle('quiz-proctored', proctored);
}

export function setQuizInProgress(active) {
    quizInProgress = !!active;
}

export function setQuizAttemptInfo(remaining, max) {
    attemptsRemaining = remaining ?? null;
    maxAttempts = max ?? null;
}

export function registerQuizLeaveHandlers(handlers = {}) {
    leaveConfirmHandler = handlers.onConfirmLeave || null;
    confirmedExitHandler = handlers.onConfirmedExit || null;
}

export function clearQuizProctoring() {
    proctored = false;
    practiceQuiz = false;
    quizId = null;
    quizInProgress = false;
    attemptsRemaining = null;
    maxAttempts = null;
    leaveConfirmHandler = null;
    confirmedExitHandler = null;
    document.body.classList.remove('quiz-proctored');
}

export function isQuizProctored() {
    return proctored;
}

export function isPracticeQuiz() {
    return practiceQuiz;
}

export function isQuizInProgress() {
    return quizInProgress;
}

export function getActiveQuizId() {
    return quizId;
}

export function isAssistantAllowed() {
    return !proctored;
}

/**
 * Human-readable warning about remaining attempts (for exit / tab-switch dialogs).
 */
export function formatQuizAttemptWarning() {
    if (attemptsRemaining === null || attemptsRemaining === undefined) {
        return 'Leaving may affect your current attempt.';
    }
    const n = parseInt(attemptsRemaining, 10);
    if (Number.isNaN(n)) {
        return 'Leaving may affect your current attempt.';
    }
    if (n <= 0) {
        return 'This is your last attempt for this quiz.';
    }
    if (n === 1) {
        return 'You only have 1 attempt left for this quiz.';
    }
    return `You only have ${n} attempts left for this quiz.`;
}

/**
 * Ask the active take-quiz page to show the exit confirmation modal.
 * Resolves true if the student confirms leaving, false if they stay.
 */
export function requestQuizLeaveConfirm(source = 'navigation') {
    if (!leaveConfirmHandler) {
        return Promise.resolve(false);
    }
    return new Promise((resolve) => {
        leaveConfirmHandler(source, resolve);
    });
}

/**
 * Called after the student confirmed leaving (e.g. submit proctored attempt).
 */
export async function runConfirmedQuizExit() {
    if (confirmedExitHandler) {
        await confirmedExitHandler();
    }
}
