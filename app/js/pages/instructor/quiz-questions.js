/**
 * Instructor Quiz Questions Page
 * Google Forms-style question editor with image/audio/link attachments.
 */
import { Api, BASE_URL } from '../../api.js';
import { L, icon } from '../../utils/action-labels.js';
import { notify } from '../../utils/notify.js';

const inl = { size: 14, className: 'ui-icon-inline' };

const QUESTION_TYPES = [
    { value: 'multiple_choice', label: 'Multiple Choice', icon: '⊙' },
    { value: 'true_false',      label: 'True / False',    icon: '◐' },
    { value: 'fill_blank',      label: 'Fill in the Blank', icon: '___' },
    { value: 'short_answer',    label: 'Short Answer',    icon: '—' },
    { value: 'essay',           label: 'Essay',           icon: '¶' },
];

const TYPE_LABELS = Object.fromEntries(QUESTION_TYPES.map(t => [t.value, t.label]));
const OPTION_TYPES = ['multiple_choice', 'true_false'];

export async function render(container, params = {}) {
    const quizId = params.quiz_id;
    if (!quizId) {
        container.innerHTML = '<div style="text-align:center;padding:60px;color:#737373">No quiz selected. <a href="#instructor/my-classes">Go to My Classes</a></div>';
        return;
    }
    container.innerHTML = '<div style="text-align:center;padding:60px;color:#737373">Loading questions…</div>';
    await loadPage(container, quizId);
}

async function loadPage(container, quizId) {
    const res = await Api.get('/QuizzesAPI.php?action=list-questions&quiz_id=' + quizId);
    if (!res.success) {
        container.innerHTML = `<div style="text-align:center;padding:60px;color:#b91c1c">${res.message || 'Failed to load quiz'}</div>`;
        return;
    }
    const { quiz, questions } = res.data;

    container.innerHTML = `
        <style>
            /* ── Page layout ── */
            .qq-back { display:inline-flex; align-items:center; gap:6px; color:#1B4D3E; font-size:14px; font-weight:500; text-decoration:none; margin-bottom:16px; cursor:pointer; }
            .qq-back:hover { text-decoration:underline; }
            .qq-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:24px; flex-wrap:wrap; gap:12px; }
            .qq-title { font-size:22px; font-weight:700; color:#262626; }
            .qq-meta  { font-size:13px; color:#737373; margin-top:4px; }
            .qq-meta .code { background:#E8F5E9; color:#1B4D3E; padding:2px 8px; border-radius:4px; font-family:monospace; font-weight:600; font-size:12px; }
            .qq-count { background:#E8F5E9; color:#1B4D3E; padding:4px 12px; border-radius:20px; font-size:13px; font-weight:600; margin-left:8px; }
            .badge { padding:4px 10px; border-radius:20px; font-size:11px; font-weight:600; text-transform:capitalize; }
            .badge-published { background:#E8F5E9; color:#1B4D3E; }
            .badge-draft { background:#FEF3C7; color:#B45309; }

            .btn-primary  { background:#00461B; color:#fff; border:none; padding:10px 20px; border-radius:10px; font-weight:600; font-size:14px; cursor:pointer; }
            .btn-primary:hover { transform:translateY(-1px); box-shadow:0 4px 12px rgba(0,70,27,.3); }
            .btn-bank  { background:#fff; color:#1B4D3E; border:1px solid #1B4D3E; padding:9px 18px; border-radius:10px; font-weight:600; font-size:14px; cursor:pointer; }
            .btn-bank:hover { background:#E8F5E9; }
            .btn-ai  { background:#fff; color:#6D28D9; border:1px solid #6D28D9; padding:9px 18px; border-radius:10px; font-weight:600; font-size:14px; cursor:pointer; display:inline-flex; align-items:center; gap:6px; }
            .btn-ai:hover { background:#EDE9FE; }

            /* ── Question card (display) ── */
            .qq-list { display:flex; flex-direction:column; gap:12px; }
            .q-card { background:#fff; border:1px solid #e8e8e8; border-radius:12px; overflow:hidden; border-left:4px solid transparent; transition:border-color .15s; }
            .q-card:hover { border-left-color:#00461B; }
            .q-card-header { display:flex; align-items:flex-start; padding:16px 20px; gap:12px; }
            .q-number { width:32px; height:32px; border-radius:50%; background:#E8F5E9; color:#1B4D3E; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:13px; flex-shrink:0; margin-top:2px; }
            .q-body { flex:1; min-width:0; }
            .q-text { font-size:14px; font-weight:600; color:#262626; line-height:1.45; margin-bottom:4px; }
            .q-info { display:flex; align-items:center; gap:8px; flex-shrink:0; flex-wrap:wrap; }
            .q-type-badge { padding:3px 8px; border-radius:6px; font-size:11px; font-weight:600; background:#f3f4f6; color:#404040; white-space:nowrap; }
            .q-points { font-size:12px; color:#737373; font-weight:600; }
            .q-media-badge { display:inline-flex; align-items:center; gap:4px; font-size:11px; color:#6D28D9; background:#EDE9FE; padding:2px 8px; border-radius:6px; font-weight:600; }
            .q-media-preview { padding:0 20px 14px 66px; }
            .q-media-img { max-width:240px; max-height:160px; border-radius:8px; border:1px solid #e8e8e8; object-fit:cover; display:block; }
            .q-media-audio { width:100%; max-width:320px; }
            .q-options { padding:0 20px 16px 66px; }
            .q-opt { display:flex; align-items:center; gap:8px; padding:4px 0; font-size:13px; color:#404040; }
            .q-opt-dot { width:16px; height:16px; flex-shrink:0; border-radius:50%; border:2px solid #d1d5db; display:flex; align-items:center; justify-content:center; font-size:9px; }
            .q-opt-dot.correct { background:#00461B; border-color:#00461B; color:#fff; }
            .q-actions { display:flex; gap:6px; }
            .btn-icon { width:32px; height:32px; border-radius:8px; border:1px solid #e0e0e0; background:#fff; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:15px; }
            .btn-icon:hover { background:#f5f5f5; }
            .btn-icon.danger { color:#b91c1c; border-color:#fecaca; }
            .btn-icon.danger:hover { background:#FEE2E2; }
            .empty-questions { text-align:center; padding:60px 20px; background:#fff; border:2px dashed #e0e0e0; border-radius:14px; }
            .empty-questions h3 { font-size:18px; color:#262626; margin-bottom:8px; }
            .empty-questions p { font-size:14px; color:#737373; margin-bottom:20px; }

            /* ── Google Forms Question Modal ── */
            .gf-overlay { position:fixed; inset:0; background:rgba(0,0,0,.45); display:flex; align-items:center; justify-content:center; z-index:2000; padding:16px; backdrop-filter:blur(2px); }
            .gf-modal { background:#f0f4f9; border-radius:14px; width:100%; max-width:700px; max-height:94vh; overflow:hidden; display:flex; flex-direction:column; box-shadow:0 24px 64px rgba(0,0,0,.22); animation:gfIn .2s ease; }
            @keyframes gfIn { from { opacity:0; transform:translateY(10px) scale(.98); } to { opacity:1; transform:none; } }
            .gf-modal-hdr { padding:16px 22px; background:#00461B; color:#fff; display:flex; justify-content:space-between; align-items:center; flex-shrink:0; }
            .gf-modal-hdr h3 { font-size:16px; font-weight:700; margin:0; }
            .gf-modal-close { background:rgba(255,255,255,.15); border:none; color:#fff; width:30px; height:30px; border-radius:7px; font-size:20px; cursor:pointer; line-height:1; display:flex; align-items:center; justify-content:center; }
            .gf-modal-body { overflow-y:auto; flex:1; padding:16px; display:flex; flex-direction:column; gap:12px; }
            .gf-modal-ft { padding:12px 20px; border-top:1px solid #dde3ea; background:#fff; display:flex; justify-content:flex-end; align-items:center; gap:10px; flex-shrink:0; }

            /* ── Question card (Google Forms style) ── */
            .gf-card { background:#fff; border-radius:12px; border:1px solid #dde3ea; border-top:6px solid #00461B; overflow:visible; }
            .gf-card-body { padding:20px 22px; }

            /* Question text area */
            .gf-q-row { display:flex; gap:14px; align-items:flex-start; margin-bottom:18px; }
            .gf-q-text-wrap { flex:1; min-width:0; }
            .gf-q-text { width:100%; font-size:16px; font-weight:500; color:#202124; border:none; border-bottom:2px solid #e0e0e0; border-radius:0; padding:8px 4px 6px; resize:none; min-height:52px; font-family:inherit; background:transparent; outline:none; line-height:1.45; transition:border-color .15s; box-sizing:border-box; }
            .gf-q-text:focus { border-bottom-color:#00461B; }
            .gf-q-text::placeholder { color:#9aa0a6; }

            /* Type selector */
            .gf-type-wrap { flex-shrink:0; width:190px; }
            .gf-type-select { width:100%; padding:10px 12px; border:1px solid #dadce0; border-radius:8px; font-size:13px; font-weight:600; color:#202124; background:#fff; cursor:pointer; appearance:none; -webkit-appearance:none; background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%235f6368' stroke-width='2.5'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E"); background-repeat:no-repeat; background-position:right 10px center; font-family:inherit; }
            .gf-type-select:focus { outline:none; border-color:#00461B; box-shadow:0 0 0 2px rgba(0,70,27,.12); }

            /* Media attachment bar */
            .gf-media-bar { display:flex; align-items:center; gap:6px; padding:8px 0 14px; border-bottom:1px solid #f1f3f4; margin-bottom:14px; }
            .gf-media-bar-label { font-size:11px; font-weight:700; color:#5f6368; text-transform:uppercase; letter-spacing:.5px; margin-right:4px; }
            .gf-media-tab { display:flex; align-items:center; gap:5px; padding:6px 12px; border-radius:20px; border:1.5px solid #e0e0e0; font-size:12px; font-weight:600; color:#5f6368; cursor:pointer; background:#fff; transition:all .15s; }
            .gf-media-tab:hover { border-color:#00461B; color:#00461B; background:#f0fdf4; }
            .gf-media-tab.active { border-color:#00461B; color:#00461B; background:#E8F5EC; }
            .gf-media-content { margin-bottom:14px; }

            /* Media upload area */
            .gf-upload-zone { border:2px dashed #dadce0; border-radius:10px; padding:24px; text-align:center; cursor:pointer; transition:all .2s; }
            .gf-upload-zone:hover { border-color:#00461B; background:#f0fdf4; }
            .gf-upload-icon { font-size:28px; margin-bottom:6px; }
            .gf-upload-text { font-size:13px; font-weight:600; color:#374151; }
            .gf-upload-hint { font-size:11px; color:#9aa0a6; margin-top:3px; }
            .gf-file-pill { display:flex; align-items:center; gap:10px; padding:10px 14px; background:#E8F5EC; border-radius:8px; font-size:13px; font-weight:600; color:#1B4D3E; }
            .gf-file-remove { background:none; border:none; color:#b91c1c; cursor:pointer; font-size:18px; margin-left:auto; line-height:1; }
            .gf-preview-img { max-width:100%; max-height:200px; border-radius:8px; display:block; margin-top:8px; border:1px solid #e8e8e8; object-fit:cover; }
            .gf-preview-audio { width:100%; margin-top:8px; }
            .gf-link-inputs { display:flex; flex-direction:column; gap:8px; }
            .gf-link-input { width:100%; padding:9px 12px; border:1.5px solid #dadce0; border-radius:8px; font-size:13px; font-family:inherit; box-sizing:border-box; }
            .gf-link-input:focus { outline:none; border-color:#00461B; }

            /* Options area */
            .gf-options { display:flex; flex-direction:column; gap:6px; }
            .gf-opt-row { display:flex; align-items:center; gap:10px; padding:6px 4px; border-radius:8px; }
            .gf-opt-row:hover { background:#f8f9fa; }
            .gf-opt-marker { width:20px; height:20px; flex-shrink:0; border-radius:50%; border:2px solid #dadce0; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:10px; transition:all .15s; }
            .gf-opt-marker.is-correct { background:#00461B; border-color:#00461B; color:#fff; }
            .gf-opt-input { flex:1; border:none; border-bottom:1.5px solid transparent; padding:5px 4px; font-size:14px; font-family:inherit; color:#202124; background:transparent; outline:none; transition:border-color .15s; }
            .gf-opt-input:focus { border-bottom-color:#00461B; }
            .gf-opt-input::placeholder { color:#9aa0a6; }
            .gf-opt-del { width:28px; height:28px; border:none; background:transparent; color:#9aa0a6; cursor:pointer; font-size:18px; border-radius:50%; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
            .gf-opt-del:hover { background:#f1f3f4; color:#5f6368; }
            .gf-add-opt { display:flex; align-items:center; gap:8px; padding:8px 4px; cursor:pointer; font-size:13px; font-weight:600; color:#00461B; background:none; border:none; margin-top:2px; }
            .gf-add-opt:hover { color:#006428; }

            /* Answer hint for text types */
            .gf-text-hint { padding:14px 16px; background:#f8f9fa; border:1.5px dashed #dadce0; border-radius:8px; font-size:13px; color:#9aa0a6; font-style:italic; }
            .gf-fill-hint { display:flex; align-items:center; gap:8px; }
            .gf-fill-blank { display:inline-block; border-bottom:2px solid #00461B; min-width:120px; height:24px; }

            /* Correct answer key (for fill/short/essay) */
            .gf-answer-key { background:#f0fdf4; border:1.5px solid #bbf7d0; border-radius:8px; padding:14px 16px; }
            .gf-answer-key-label { font-size:11px; font-weight:700; color:#1B4D3E; text-transform:uppercase; letter-spacing:.5px; margin-bottom:8px; display:flex; align-items:center; gap:6px; }
            .gf-answer-textarea { width:100%; border:none; border-bottom:1.5px solid #bbf7d0; padding:6px 4px; font-size:14px; font-family:inherit; background:transparent; resize:none; outline:none; min-height:44px; color:#202124; box-sizing:border-box; }
            .gf-answer-textarea:focus { border-bottom-color:#00461B; }
            .gf-answer-textarea::placeholder { color:#9aa0a6; font-style:italic; }
            .gf-answer-hint { font-size:11px; color:#6b7280; margin-top:6px; }

            /* Card bottom bar */
            .gf-card-bottom { display:flex; align-items:center; justify-content:flex-end; gap:14px; padding:12px 22px; border-top:1px solid #f1f3f4; }
            .gf-pts-wrap { display:flex; align-items:center; gap:8px; margin-right:auto; }
            .gf-pts-label { font-size:13px; font-weight:600; color:#5f6368; }
            .gf-pts-input { width:60px; padding:6px 10px; border:1.5px solid #dadce0; border-radius:8px; font-size:14px; font-weight:700; text-align:center; font-family:inherit; color:#202124; }
            .gf-pts-input:focus { outline:none; border-color:#00461B; }
            .gf-correct-hint { font-size:12px; color:#1B4D3E; background:#E8F5EC; padding:5px 10px; border-radius:6px; font-weight:600; }

            /* Alert */
            .gf-alert { background:#FEE2E2; color:#b91c1c; padding:10px 14px; border-radius:8px; font-size:13px; margin-bottom:4px; }

            /* Save buttons */
            .gf-btn-cancel { background:#fff; color:#5f6368; border:1.5px solid #dadce0; padding:9px 20px; border-radius:8px; font-weight:600; font-size:13px; cursor:pointer; }
            .gf-btn-cancel:hover { background:#f1f3f4; }
            .gf-btn-save { background:#00461B; color:#fff; border:none; padding:9px 22px; border-radius:8px; font-weight:700; font-size:13px; cursor:pointer; }
            .gf-btn-save:hover { background:#006428; }
            .gf-btn-save:disabled { opacity:.5; cursor:not-allowed; }

            @media(max-width:600px) { .gf-q-row { flex-direction:column; } .gf-type-wrap { width:100%; } }
        </style>

        <a class="qq-back" id="btn-back">&larr; Back to Class</a>

        <div class="qq-header">
            <div>
                <div class="qq-title">${esc(quiz.quiz_title)} <span class="qq-count">${questions.length} question${questions.length !== 1 ? 's' : ''}</span></div>
                <div class="qq-meta"><span class="code">${esc(quiz.subject_id)}</span> <span class="badge badge-${quiz.status}">${quiz.status}</span> &middot; ${quiz.time_limit} min &middot; ${quiz.passing_rate}% to pass</div>
            </div>
            <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
                <button class="btn-ai" id="btn-ai-gen"><svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:4px;flex-shrink:0"><path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/></svg>AI Generate</button>
                <button class="btn-bank" id="btn-copy-bank">${icon('clipboard', inl)} Copy from Bank</button>
                <button class="btn-primary" id="btn-add-q">+ Add Question</button>
            </div>
        </div>

        <div class="qq-list" id="qq-list">
            ${questions.length === 0 ? `
                <div class="empty-questions">
                    <h3>No Questions Yet</h3>
                    <p>Add questions to this quiz so students can take it.</p>
                    <button class="btn-primary" id="btn-add-q-empty">+ Add First Question</button>
                </div>
            ` : questions.map((q, i) => renderQuestionCard(q, i)).join('')}
        </div>
    `;

    container.querySelector('#btn-back').addEventListener('click', () => {
        const backHash = quiz.subject_id ? `#instructor/subject?subject_id=${quiz.subject_id}` : '#instructor/my-classes';
        window.location.hash = backHash;
    });
    container.querySelector('#btn-add-q').addEventListener('click', () => openQuestionModal(container, quizId));
    container.querySelector('#btn-copy-bank').addEventListener('click', () => openBankModal(container, quizId));
    container.querySelector('#btn-ai-gen').addEventListener('click', () => {
        window.location.hash = `#instructor/quiz-ai-generate?quiz_id=${quizId}&quiz_title=${encodeURIComponent(quiz.quiz_title || '')}&subject_id=${encodeURIComponent(quiz.subject_id || '')}`;
    });

    const emptyBtn = container.querySelector('#btn-add-q-empty');
    if (emptyBtn) emptyBtn.addEventListener('click', () => openQuestionModal(container, quizId));

    container.querySelectorAll('[data-edit-q]').forEach(btn => {
        btn.addEventListener('click', () => {
            const q = questions.find(q => q.questions_id == btn.dataset.editQ);
            if (q) openQuestionModal(container, quizId, q);
        });
    });

    container.querySelectorAll('[data-delete-q]').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!await notify.confirm('Delete this question? This cannot be undone.', { danger: true, confirmText: 'Delete' })) return;
            const res = await Api.post('/QuizzesAPI.php?action=delete-question', { questions_id: parseInt(btn.dataset.deleteQ) });
            if (res.success) loadPage(container, quizId);
            else notify.error(res.message);
        });
    });
}

/* ── Question card display ── */
function renderQuestionCard(q, index) {
    const markerIsCircle = q.question_type !== 'checkboxes';

    const resolveMediaUrl = url => (!url || /^https?:\/\//i.test(url) || url.startsWith('/')) ? url : BASE_URL + '/' + url;
    const mediaHtml = (() => {
        if (!q.media_type || q.media_type === 'none' || !q.media_url) return '';
        const mUrl = resolveMediaUrl(q.media_url);
        if (q.media_type === 'image') return `<div class="q-media-preview"><img class="q-media-img" src="${esc(mUrl)}" alt=""></div>`;
        if (q.media_type === 'audio') return `<div class="q-media-preview"><audio class="q-media-audio" controls src="${esc(mUrl)}"></audio></div>`;
        if (q.media_type === 'link') return `<div class="q-media-preview"><a style="color:#1B4D3E;font-weight:600;font-size:13px;display:inline-flex;align-items:center;gap:5px;" href="${esc(mUrl)}" target="_blank" rel="noopener"><svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244"/></svg>${esc(q.media_name || q.media_url)}</a></div>`;
        return '';
    })();

    const mediaBadge = (q.media_type && q.media_type !== 'none' && q.media_url)
        ? `<span class="q-media-badge">${q.media_type === 'image' ? '<svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path stroke-linecap="round" stroke-linejoin="round" d="M21 15l-5-5L5 21"/></svg>' : q.media_type === 'audio' ? '<svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z"/></svg>' : '<svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244"/></svg>'} ${q.media_type}</span>`
        : '';

    return `
        <div class="q-card">
            <div class="q-card-header">
                <div class="q-number">${index + 1}</div>
                <div class="q-body">
                    <div class="q-text">${esc(q.question_text)}</div>
                    ${mediaBadge}
                </div>
                <div class="q-info">
                    <span class="q-type-badge">${TYPE_LABELS[q.question_type] || q.question_type}</span>
                    <span class="q-points">${q.points} pt${q.points !== 1 ? 's' : ''}</span>
                    <div class="q-actions">
                        <button class="btn-icon" data-edit-q="${q.questions_id}" title="Edit">&#9998;</button>
                        <button class="btn-icon danger" data-delete-q="${q.questions_id}" title="Delete">&times;</button>
                    </div>
                </div>
            </div>
            ${mediaHtml}
            ${q.options && q.options.length ? `
                <div class="q-options">
                    ${q.options.map(o => `
                        <div class="q-opt">
                            <div class="q-opt-dot ${o.is_correct ? 'correct' : ''}">${o.is_correct ? '✓' : ''}</div>
                            <span>${esc(o.option_text)}</span>
                        </div>
                    `).join('')}
                </div>
            ` : ''}
        </div>
    `;
}

/* ══════════════════════════════════════════════
   Google Forms-style Question Modal
══════════════════════════════════════════════ */
export function openQuestionModal(container, quizId, question = null) {
    const isEdit = !!question;
    let currentType = question?.question_type || 'multiple_choice';

    // Normalize legacy types
    if (currentType === 'paragraph') currentType = 'essay';
    if (currentType === 'fill_in_the_blank') currentType = 'fill_blank';
    // Fallback unknown types to MC
    if (!QUESTION_TYPES.find(t => t.value === currentType)) currentType = 'multiple_choice';

    // Options state
    let options = (() => {
        if (question?.options?.length) return question.options.map(o => ({ ...o }));
        if (currentType === 'true_false') return [{ option_text:'True', is_correct:true }, { option_text:'False', is_correct:false }];
        return [
            { option_text:'', is_correct:false },
            { option_text:'', is_correct:false },
            { option_text:'', is_correct:false },
            { option_text:'', is_correct:false },
        ];
    })();

    // Media state — resolve relative paths from DB to absolute URLs for display
    const _resolveUrl = u => (!u || /^https?:\/\//i.test(u) || u.startsWith('/')) ? u : BASE_URL + '/' + u;
    let mediaState = {
        type:  question?.media_type  || 'none',
        url:   _resolveUrl(question?.media_url || ''),
        name:  question?.media_name  || '',
    };
    let uploading = false;

    const overlay = document.createElement('div');
    overlay.className = 'gf-overlay';
    overlay.innerHTML = `
        <div class="gf-modal" role="dialog" aria-modal="true">
            <div class="gf-modal-hdr">
                <h3>${isEdit ? 'Edit Question' : 'New Question'}</h3>
                <button class="gf-modal-close" title="Close">&times;</button>
            </div>
            <div class="gf-modal-body" id="gf-body">
                <div id="gf-alert"></div>

                <!-- ── Question Card ── -->
                <div class="gf-card">
                    <div class="gf-card-body">

                        <!-- Question text + type selector -->
                        <div class="gf-q-row">
                            <div class="gf-q-text-wrap">
                                <textarea class="gf-q-text" id="gf-qtext" placeholder="Question" rows="2">${esc(question?.question_text || '')}</textarea>
                            </div>
                            <div class="gf-type-wrap">
                                <select class="gf-type-select" id="gf-qtype">
                                    ${QUESTION_TYPES.map(t => `<option value="${t.value}" ${currentType === t.value ? 'selected' : ''}>${t.icon} ${t.label}</option>`).join('')}
                                </select>
                            </div>
                        </div>

                        <!-- Media attachment bar -->
                        <div class="gf-media-bar">
                            <span class="gf-media-bar-label">Attach:</span>
                            <button type="button" class="gf-media-tab ${mediaState.type === 'none' ? 'active' : ''}" data-mtype="none">None</button>
                            <button type="button" class="gf-media-tab ${mediaState.type === 'image' ? 'active' : ''}" data-mtype="image"><svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path stroke-linecap="round" stroke-linejoin="round" d="M21 15l-5-5L5 21"/></svg> Image</button>
                            <button type="button" class="gf-media-tab ${mediaState.type === 'audio' ? 'active' : ''}" data-mtype="audio"><svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z"/></svg> Audio</button>
                            <button type="button" class="gf-media-tab ${mediaState.type === 'link' ? 'active' : ''}" data-mtype="link"><svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244"/></svg> Link</button>
                        </div>
                        <div class="gf-media-content" id="gf-media-content"></div>

                        <!-- Options / Answer area -->
                        <div id="gf-options-area"></div>

                    </div>

                    <!-- Card bottom bar: points + hint -->
                    <div class="gf-card-bottom">
                        <div class="gf-pts-wrap">
                            <label class="gf-pts-label" for="gf-pts">Points</label>
                            <input type="number" class="gf-pts-input" id="gf-pts" min="1" max="100" value="${question?.points || 1}">
                        </div>
                        <span class="gf-correct-hint" id="gf-correct-hint" style="display:none;"></span>
                    </div>
                </div>
            </div>
            <div class="gf-modal-ft">
                <button class="gf-btn-cancel">Cancel</button>
                <button class="gf-btn-save" id="gf-save">${isEdit ? 'Update Question' : 'Add Question'}</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('.gf-modal-close').addEventListener('click', close);
    overlay.querySelector('.gf-btn-cancel').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    /* ── Helpers ── */
    function setCorrectHint(text) {
        const el = overlay.querySelector('#gf-correct-hint');
        if (text) { el.textContent = text; el.style.display = ''; }
        else el.style.display = 'none';
    }

    /* ── Media ── */
    function renderMedia() {
        const wrap = overlay.querySelector('#gf-media-content');
        overlay.querySelectorAll('.gf-media-tab').forEach(b =>
            b.classList.toggle('active', b.dataset.mtype === mediaState.type));

        if (mediaState.type === 'none') { wrap.innerHTML = ''; return; }

        if (mediaState.type === 'link') {
            wrap.innerHTML = `
                <div class="gf-link-inputs">
                    <input type="url" class="gf-link-input" id="gf-link-url" placeholder="https://…" value="${esc(mediaState.url)}">
                    <input type="text" class="gf-link-input" id="gf-link-name" placeholder="Display label (optional)" value="${esc(mediaState.name)}">
                </div>`;
            wrap.querySelector('#gf-link-url').addEventListener('input', e => { mediaState.url = e.target.value.trim(); });
            wrap.querySelector('#gf-link-name').addEventListener('input', e => { mediaState.name = e.target.value.trim(); });
            return;
        }

        const accept = mediaState.type === 'image' ? 'image/*' : 'audio/*';
        if (mediaState.url) {
            const preview = mediaState.type === 'image'
                ? `<img class="gf-preview-img" src="${esc(mediaState.url)}" alt="">`
                : `<audio class="gf-preview-audio" controls src="${esc(mediaState.url)}"></audio>`;
            wrap.innerHTML = `
                <div class="gf-file-pill">
                    <span style="display:inline-flex;align-items:center;gap:5px;">${mediaState.type === 'image' ? '<svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path stroke-linecap="round" stroke-linejoin="round" d="M21 15l-5-5L5 21"/></svg>' : '<svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z"/></svg>'} ${esc(mediaState.name || mediaState.url.split('/').pop())}</span>
                    <button class="gf-file-remove" id="gf-rm-media" title="Remove">×</button>
                </div>
                ${preview}`;
            wrap.querySelector('#gf-rm-media').addEventListener('click', () => {
                mediaState = { type: mediaState.type, url: '', name: '' };
                renderMedia();
            });
        } else {
            wrap.innerHTML = `
                <div class="gf-upload-zone" id="gf-drop">
                    <div class="gf-upload-icon">${mediaState.type === 'image' ? '<svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="#9ca3af" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path stroke-linecap="round" stroke-linejoin="round" d="M21 15l-5-5L5 21"/></svg>' : '<svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="#9ca3af" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z"/></svg>'}</div>
                    <div class="gf-upload-text">Click or drag to upload ${mediaState.type === 'image' ? 'image' : 'audio'}</div>
                    <div class="gf-upload-hint">${mediaState.type === 'image' ? 'JPG, PNG, GIF, WEBP' : 'MP3, WAV, OGG, AAC'} · max 10 MB</div>
                </div>
                <input type="file" id="gf-file-inp" accept="${accept}" style="display:none;">
                <div id="gf-upload-status"></div>`;
            const dz = wrap.querySelector('#gf-drop');
            const fi = wrap.querySelector('#gf-file-inp');
            dz.addEventListener('click', () => fi.click());
            dz.addEventListener('dragover', e => { e.preventDefault(); dz.style.borderColor = '#00461B'; dz.style.background = '#f0fdf4'; });
            dz.addEventListener('dragleave', () => { dz.style.borderColor = ''; dz.style.background = ''; });
            dz.addEventListener('drop', e => { e.preventDefault(); if (e.dataTransfer.files[0]) doUpload(e.dataTransfer.files[0]); });
            fi.addEventListener('change', () => { if (fi.files[0]) doUpload(fi.files[0]); });
        }
    }

    async function doUpload(file) {
        if (uploading) return;
        uploading = true;
        const st = overlay.querySelector('#gf-upload-status');
        if (st) st.innerHTML = '<div style="font-size:13px;color:#737373;padding:6px 0;">Uploading…</div>';
        const fd = new FormData();
        fd.append('file', file);
        fd.append('media_type', mediaState.type);
        const res = await Api.postForm('/QuizzesAPI.php?action=upload-question-media', fd);
        uploading = false;
        if (res.success) { mediaState.url = BASE_URL + '/' + res.url; mediaState.name = res.name || file.name; renderMedia(); }
        else if (st) st.innerHTML = `<div style="color:#b91c1c;font-size:13px;margin-top:4px;">${esc(res.message || 'Upload failed')}</div>`;
    }

    overlay.querySelectorAll('.gf-media-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.dataset.mtype === mediaState.type) return;
            mediaState = { type: btn.dataset.mtype, url: '', name: '' };
            renderMedia();
        });
    });

    /* ── Options rendering ── */
    function syncOptionsFromDom() {
        overlay.querySelectorAll('.gf-opt-input').forEach(inp => {
            const i = parseInt(inp.dataset.oi);
            if (!isNaN(i)) options[i].option_text = inp.value;
        });
    }

    function renderOptionsArea(type) {
        const area = overlay.querySelector('#gf-options-area');

        if (type === 'multiple_choice' || type === 'true_false') {
            setCorrectHint('Click ○ to mark the correct answer');
            area.innerHTML = `
                <div class="gf-options" id="gf-opts"></div>
                ${type === 'multiple_choice' ? `<button class="gf-add-opt" id="gf-add-opt">+ Add option</button>` : ''}
            `;
            repaintOptions(type);

            overlay.querySelector('#gf-add-opt')?.addEventListener('click', () => {
                syncOptionsFromDom();
                options.push({ option_text: '', is_correct: false });
                repaintOptions(type);
                // Focus new input
                const inputs = overlay.querySelectorAll('.gf-opt-input');
                inputs[inputs.length - 1]?.focus();
            });

        } else if (type === 'fill_blank') {
            setCorrectHint('Provide the expected answer below');
            const val = question?.options?.find(o => o.is_correct)?.option_text || '';
            area.innerHTML = `
                <div class="gf-text-hint" style="margin-bottom:14px;">
                    <div class="gf-fill-hint">Students will type their answer in a blank: <span class="gf-fill-blank"></span></div>
                </div>
                <div class="gf-answer-key">
                    <div class="gf-answer-key-label">✓ Correct Answer</div>
                    <textarea class="gf-answer-textarea" id="gf-model" rows="2"
                        placeholder="Type the exact word or phrase…">${esc(val)}</textarea>
                    <div class="gf-answer-hint">Matching is case-insensitive. AI grading can accept near-matches.</div>
                </div>`;

        } else if (type === 'short_answer') {
            setCorrectHint('Provide a model answer for AI grading');
            const val = question?.options?.find(o => o.is_correct)?.option_text || '';
            area.innerHTML = `
                <div class="gf-text-hint" style="margin-bottom:14px;">Students will type a short written response (1–3 sentences).</div>
                <div class="gf-answer-key">
                    <div class="gf-answer-key-label">✓ Model Answer (for grading)</div>
                    <textarea class="gf-answer-textarea" id="gf-model" rows="3"
                        placeholder="Enter the key points expected in a correct answer…">${esc(val)}</textarea>
                    <div class="gf-answer-hint">AI will compare student answers against this model.</div>
                </div>`;

        } else if (type === 'essay') {
            setCorrectHint('Provide a model answer for AI grading');
            const val = question?.options?.find(o => o.is_correct)?.option_text || '';
            area.innerHTML = `
                <div class="gf-text-hint" style="margin-bottom:14px;">Students will write a full paragraph or essay response.</div>
                <div class="gf-answer-key">
                    <div class="gf-answer-key-label">✓ Model Answer / Rubric</div>
                    <textarea class="gf-answer-textarea" id="gf-model" rows="4"
                        placeholder="Describe what a complete, correct answer should include…">${esc(val)}</textarea>
                    <div class="gf-answer-hint">Used by AI to evaluate completeness and accuracy.</div>
                </div>`;
        }
    }

    function repaintOptions(type) {
        const list = overlay.querySelector('#gf-opts');
        if (!list) return;

        list.innerHTML = options.map((o, i) => `
            <div class="gf-opt-row" data-oi="${i}">
                <div class="gf-opt-marker ${o.is_correct ? 'is-correct' : ''}" data-mark="${i}" title="Click to mark correct">${o.is_correct ? '✓' : ''}</div>
                <input class="gf-opt-input" type="text" data-oi="${i}" value="${esc(o.option_text || '')}"
                    placeholder="${type === 'true_false' ? o.option_text || 'Option ' + (i+1) : 'Option ' + (i+1)}"
                    ${type === 'true_false' ? 'readonly style="color:#5f6368;"' : ''}>
                ${(type !== 'true_false' && options.length > 2)
                    ? `<button class="gf-opt-del" data-del="${i}" title="Remove">×</button>`
                    : '<div style="width:28px;"></div>'}
            </div>
        `).join('');

        // Mark correct handler
        list.querySelectorAll('[data-mark]').forEach(dot => {
            dot.addEventListener('click', () => {
                syncOptionsFromDom();
                const i = parseInt(dot.dataset.mark);
                // Single correct for MC/TF
                options.forEach((o, idx) => { o.is_correct = idx === i; });
                repaintOptions(type);
            });
        });

        // Text input sync
        list.querySelectorAll('.gf-opt-input').forEach(inp => {
            inp.addEventListener('input', () => {
                options[parseInt(inp.dataset.oi)].option_text = inp.value;
            });
        });

        // Delete option
        list.querySelectorAll('[data-del]').forEach(btn => {
            btn.addEventListener('click', () => {
                syncOptionsFromDom();
                options.splice(parseInt(btn.dataset.del), 1);
                repaintOptions(type);
            });
        });
    }

    /* ── Type selector change ── */
    const typeSelect = overlay.querySelector('#gf-qtype');
    typeSelect.addEventListener('change', () => {
        const newType = typeSelect.value;
        currentType = newType;
        if (newType === 'true_false') {
            options = [{ option_text: 'True', is_correct: true }, { option_text: 'False', is_correct: false }];
        } else if (newType === 'multiple_choice' && !OPTION_TYPES.includes(
            options.length ? 'multiple_choice' : newType)) {
            options = [
                { option_text: '', is_correct: false },
                { option_text: '', is_correct: false },
                { option_text: '', is_correct: false },
                { option_text: '', is_correct: false },
            ];
        }
        renderOptionsArea(newType);
    });

    /* ── Save ── */
    overlay.querySelector('#gf-save').addEventListener('click', async () => {
        const alertEl = overlay.querySelector('#gf-alert');
        alertEl.innerHTML = '';

        const type  = overlay.querySelector('#gf-qtype').value;
        const text  = overlay.querySelector('#gf-qtext').value.trim();
        const pts   = parseInt(overlay.querySelector('#gf-pts').value) || 1;

        if (!text) {
            alertEl.innerHTML = '<div class="gf-alert">Please enter the question text.</div>';
            overlay.querySelector('#gf-qtext').focus();
            return;
        }

        // Validate media link
        if (mediaState.type === 'link' && !mediaState.url) {
            alertEl.innerHTML = '<div class="gf-alert">Please enter a URL for the link attachment, or set attachment to None.</div>';
            return;
        }
        if ((mediaState.type === 'image' || mediaState.type === 'audio') && !mediaState.url) {
            mediaState.type = 'none'; // no file uploaded — ignore silently
        }

        syncOptionsFromDom();

        const isSubjective = ['short_answer', 'essay', 'fill_blank'].includes(type);
        let finalOptions = [];

        if (isSubjective) {
            const modelVal = overlay.querySelector('#gf-model')?.value.trim() || '';
            finalOptions = modelVal ? [{ option_text: modelVal, is_correct: true }] : [];
        } else {
            finalOptions = options.filter(o => o.option_text.trim() !== '');
            if (finalOptions.length < 2) {
                alertEl.innerHTML = '<div class="gf-alert">Add at least 2 answer options.</div>';
                return;
            }
            if (!finalOptions.some(o => o.is_correct)) {
                alertEl.innerHTML = '<div class="gf-alert">Click the circle (○) on one option to mark it as correct.</div>';
                return;
            }
        }

        const payload = {
            quiz_id:       quizId,
            question_text: text,
            question_type: type,
            points:        pts,
            options:       finalOptions,
            media_type:    mediaState.type,
            media_url:     mediaState.url  || '',
            media_name:    mediaState.name || '',
        };
        if (isEdit) payload.questions_id = question.questions_id;

        const saveBtn = overlay.querySelector('#gf-save');
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving…';

        const action = isEdit ? 'update-question' : 'add-question';
        const res = await Api.post(`/QuizzesAPI.php?action=${action}`, payload);
        if (res.success) {
            overlay.remove();
            loadPage(container, quizId);
        } else {
            alertEl.innerHTML = `<div class="gf-alert">${esc(res.message || 'Failed to save question')}</div>`;
            saveBtn.disabled = false;
            saveBtn.textContent = isEdit ? 'Update Question' : 'Add Question';
        }
    });

    /* ── Init ── */
    renderMedia();
    renderOptionsArea(currentType);
}

/* ══════════════════════════════════════════════
   Question Bank modal
══════════════════════════════════════════════ */
async function openBankModal(container, quizId) {
    const overlay = document.createElement('div');
    overlay.className = 'gf-overlay';
    overlay.innerHTML = `
        <div class="gf-modal" style="max-width:760px;">
            <div class="gf-modal-hdr">
                <h3>${icon('clipboard', inl)} Copy from Question Bank</h3>
                <button class="gf-modal-close">&times;</button>
            </div>
            <div class="gf-modal-body" style="padding:16px 20px;">
                <div style="display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap;">
                    <input type="text" id="bank-search" placeholder="Search questions…"
                        style="flex:1;min-width:140px;padding:8px 12px;border:1.5px solid #dadce0;border-radius:8px;font-size:13px;font-family:inherit;">
                    <select id="bank-subject" style="padding:8px 12px;border:1.5px solid #dadce0;border-radius:8px;font-size:13px;min-width:130px;">
                        <option value="">All Subjects</option>
                    </select>
                    <select id="bank-type" style="padding:8px 12px;border:1.5px solid #dadce0;border-radius:8px;font-size:13px;">
                        <option value="">All Types</option>
                        <option value="multiple_choice">Multiple Choice</option>
                        <option value="true_false">True / False</option>
                        <option value="short_answer">Short Answer</option>
                        <option value="essay">Essay</option>
                    </select>
                </div>
                <div id="bank-list" style="max-height:460px;overflow-y:auto;display:flex;flex-direction:column;gap:8px;">
                    <div style="text-align:center;padding:40px;color:#737373;">Loading…</div>
                </div>
            </div>
            <div class="gf-modal-ft" style="justify-content:space-between;">
                <span style="font-size:13px;color:#737373;" id="bank-status">Loading questions…</span>
                <div style="display:flex;gap:10px;">
                    <button class="gf-btn-cancel" id="bank-close">Close</button>
                    <button class="gf-btn-save" id="btn-copy-all" style="display:none;">Copy All</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('.gf-modal-close').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#bank-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    const searchInput   = overlay.querySelector('#bank-search');
    const subjectSelect = overlay.querySelector('#bank-subject');
    const typeSelect    = overlay.querySelector('#bank-type');
    const copyAllBtn    = overlay.querySelector('#btn-copy-all');
    const statusEl      = overlay.querySelector('#bank-status');
    const listEl        = overlay.querySelector('#bank-list');

    let allQuestions = [], currentQuestions = [], searchTimer;

    const typeCls = { multiple_choice:'mc', true_false:'tf', short_answer:'sa', essay:'es' };
    const typeLabel = { multiple_choice:'Multiple Choice', true_false:'True/False', short_answer:'Short Answer', essay:'Essay', fill_blank:'Fill in Blank' };

    function renderBank() {
        const subj = subjectSelect.value;
        currentQuestions = subj ? allQuestions.filter(q => q.subject_code === subj) : allQuestions;
        if (!currentQuestions.length) {
            listEl.innerHTML = '<div style="text-align:center;padding:40px;color:#737373;font-size:14px;">No questions found.</div>';
            statusEl.textContent = 'No questions found.';
            copyAllBtn.style.display = 'none';
            return;
        }
        copyAllBtn.style.display = '';
        copyAllBtn.textContent = `Copy All (${currentQuestions.length})`;
        copyAllBtn.disabled = false;
        statusEl.textContent = `${currentQuestions.length} question${currentQuestions.length > 1 ? 's' : ''} found`;

        const groups = new Map();
        for (const q of currentQuestions) {
            const key = q.subject_code || '__none__';
            if (!groups.has(key)) groups.set(key, { code: q.subject_code || '', name: q.subject_name || 'No Subject', qs: [] });
            groups.get(key).qs.push(q);
        }

        let html = '';
        for (const [, g] of groups) {
            const gid = 'bg-' + (g.code || 'none').replace(/\W/g, '-');
            html += `<div style="border:1px solid #dadce0;border-radius:10px;overflow:hidden;">
                <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:#f8f9fa;cursor:pointer;border-bottom:1px solid #e8e8e8;" class="bg-hdr" data-gid="${gid}">
                    <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="#6b7280" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/></svg>
                    ${g.code ? `<span style="background:#1B4D3E;color:#fff;padding:2px 7px;border-radius:4px;font-size:11px;font-weight:700;">${esc(g.code)}</span>` : ''}
                    <span style="font-size:13px;font-weight:600;color:#262626;flex:1;">${esc(g.name)}</span>
                    <span style="font-size:11px;color:#737373;">${g.qs.length} q</span>
                    <button class="bg-copy-all gf-btn-save" data-gid="${gid}" style="font-size:11px;padding:4px 10px;">Copy All (${g.qs.length})</button>
                    <span class="bg-chev" style="font-size:11px;color:#9aa0a6;transition:transform .2s;">▾</span>
                </div>
                <div class="bg-body" id="${gid}">
                    ${g.qs.map(q => `
                        <div style="display:flex;align-items:flex-start;gap:12px;padding:12px 16px;border-bottom:1px solid #f1f3f4;background:#fff;" class="bq-row">
                            <div style="flex:1;min-width:0;">
                                <div style="font-size:13px;font-weight:600;color:#262626;margin-bottom:5px;line-height:1.4;">${esc(q.question_text)}</div>
                                <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;font-size:11px;color:#737373;">
                                    <span style="padding:2px 8px;border-radius:6px;font-weight:600;background:#f3f4f6;color:#404040;" class="bq-t-${typeCls[q.question_type] || ''}">${typeLabel[q.question_type] || q.question_type}</span>
                                    <span>${q.points} pt${q.points > 1 ? 's' : ''}</span>
                                    ${q.copy_count > 0 ? `<span>Used ${q.copy_count}×</span>` : ''}
                                </div>
                                ${q.options?.length ? `<div style="margin-top:6px;display:flex;flex-direction:column;gap:2px;">
                                    ${q.options.map(o => `<div style="font-size:12px;color:${o.is_correct ? '#1B4D3E' : '#5f6368'};font-weight:${o.is_correct ? '600' : '400'};display:flex;align-items:center;gap:5px;">
                                        <span>${o.is_correct ? '✓' : '○'}</span><span>${esc(o.option_text)}</span>
                                    </div>`).join('')}
                                </div>` : ''}
                            </div>
                            <button class="gf-btn-save bq-copy" data-qbank="${q.qbank_id}" style="font-size:12px;padding:6px 14px;flex-shrink:0;">Copy</button>
                        </div>
                    `).join('')}
                </div>
            </div>`;
        }
        listEl.innerHTML = html;

        listEl.querySelectorAll('.bg-hdr').forEach(hdr => {
            hdr.addEventListener('click', e => {
                if (e.target.closest('.bg-copy-all')) return;
                const body = document.getElementById(hdr.dataset.gid);
                const chev = hdr.querySelector('.bg-chev');
                const collapsed = body.style.display === 'none';
                body.style.display = collapsed ? '' : 'none';
                if (chev) chev.style.transform = collapsed ? '' : 'rotate(-90deg)';
            });
        });

        listEl.querySelectorAll('.bq-copy').forEach(btn => {
            btn.addEventListener('click', async () => {
                btn.disabled = true; btn.textContent = '…';
                const res = await Api.post('/QuestionBankAPI.php?action=copy', { qbank_id: parseInt(btn.dataset.qbank), quiz_id: parseInt(quizId) });
                if (res.success) { btn.textContent = '✓ Copied'; btn.style.background = '#1a6635'; loadPage(container, quizId); }
                else { btn.disabled = false; btn.textContent = 'Copy'; notify.error(res.message || 'Failed'); }
            });
        });

        listEl.querySelectorAll('.bg-copy-all').forEach(btn => {
            btn.addEventListener('click', async e => {
                e.stopPropagation();
                const body = document.getElementById(btn.dataset.gid);
                const rows = body.querySelectorAll('.bq-copy');
                btn.disabled = true; btn.textContent = 'Copying…';
                let done = 0;
                for (const rb of rows) {
                    rb.disabled = true; rb.textContent = '…';
                    const res = await Api.post('/QuestionBankAPI.php?action=copy', { qbank_id: parseInt(rb.dataset.qbank), quiz_id: parseInt(quizId) });
                    if (res.success) { done++; rb.textContent = '✓'; rb.style.background = '#1a6635'; }
                    else { rb.disabled = false; rb.textContent = 'Copy'; }
                }
                btn.textContent = `✓ Done (${done})`;
                if (done > 0) loadPage(container, quizId);
            });
        });
    }

    async function loadBank() {
        listEl.innerHTML = '<div style="text-align:center;padding:40px;color:#737373;">Loading…</div>';
        copyAllBtn.style.display = 'none';
        let url = '/QuestionBankAPI.php?action=browse';
        const s = searchInput.value.trim();
        const t = typeSelect.value;
        if (s) url += '&search=' + encodeURIComponent(s);
        if (t) url += '&type='   + encodeURIComponent(t);
        const res = await Api.get(url);
        allQuestions = res.success ? res.data : [];
        const prevSubj = subjectSelect.value;
        const subjects = [...new Set(allQuestions.map(q => q.subject_code).filter(Boolean))].sort();
        subjectSelect.innerHTML = `<option value="">All Subjects</option>` + subjects.map(s => `<option value="${esc(s)}" ${prevSubj === s ? 'selected' : ''}>${esc(s)}</option>`).join('');
        if (!allQuestions.length) {
            listEl.innerHTML = '<div style="text-align:center;padding:40px;color:#737373;font-size:14px;">No questions in the bank yet.</div>';
            statusEl.textContent = 'No questions found.';
            return;
        }
        renderBank();
    }

    copyAllBtn.addEventListener('click', async () => {
        if (!currentQuestions.length) return;
        copyAllBtn.disabled = true; copyAllBtn.textContent = 'Copying…';
        let done = 0;
        for (let i = 0; i < currentQuestions.length; i++) {
            const res = await Api.post('/QuestionBankAPI.php?action=copy', { qbank_id: currentQuestions[i].qbank_id, quiz_id: parseInt(quizId) });
            if (res.success) done++;
            statusEl.textContent = `Copied ${done}/${i + 1}…`;
        }
        statusEl.innerHTML = `<strong style="color:#1B4D3E;">✓ ${done} copied</strong>`;
        copyAllBtn.textContent = 'Done';
        loadPage(container, quizId);
    });

    searchInput.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(loadBank, 350); });
    typeSelect.addEventListener('change', loadBank);
    subjectSelect.addEventListener('change', renderBank);
    loadBank();
}

function esc(str) { const d = document.createElement('div'); d.textContent = str || ''; return d.innerHTML; }
