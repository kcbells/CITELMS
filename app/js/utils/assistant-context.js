/**
 * Tracks what the student is viewing so Ali can answer in context.
 */
let context = {
    page: 'general',
    lessons_id: null,
    quiz_id: null,
    subject_id: null,
    subject_name: '',
    subject_code: '',
    work_title: '',
    highlighted_text: '',
};

const listeners = new Set();

export function getAssistantContext() {
    return { ...context };
}

export function setAssistantContext(patch = {}) {
    context = { ...context, ...patch };
    listeners.forEach(fn => {
        try { fn(getAssistantContext()); } catch (_) { /* ignore */ }
    });
}

export function clearAssistantContext() {
    context = {
        page: 'general',
        lessons_id: null,
        quiz_id: null,
        subject_id: null,
        subject_name: '',
        subject_code: '',
        work_title: '',
        highlighted_text: '',
    };
    listeners.forEach(fn => {
        try { fn(getAssistantContext()); } catch (_) { /* ignore */ }
    });
}

export function onAssistantContextChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}
