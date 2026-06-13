/**
 * Instructor Quizzes Page
 * CRUD for quiz management
 */
import { Api } from '../../api.js';
import { L, icon } from '../../utils/action-labels.js';
import { openQuizModal } from '../../components/quiz-modal.js';
import { openQuizCreatePicker } from '../../components/quiz-create-picker.js';

const inl = { size: 14, className: 'ui-icon-inline' };

let subjects          = [];
let closeMenusHandler = null;

export async function render(container, params = {}) {
    const subjRes = await Api.get('/LessonsAPI.php?action=subjects');
    subjects = subjRes.success ? subjRes.data : [];
    renderList(container, params.subject_id || '');
}

async function renderList(container, filterSubject = '') {
    const params = filterSubject ? '&subject_id=' + filterSubject : '';
    const res = await Api.get('/QuizzesAPI.php?action=instructor-list' + params);
    const quizzes = res.success ? res.data : [];

    container.innerHTML = `
        <style>
            .qz-banner { background:#00461B; border-radius:16px; padding:28px 32px; margin-bottom:24px; }
            .qz-banner::before { content:''; position:absolute; top:-40px; right:-40px; width:180px; height:180px; border-radius:50%; background:rgba(255,255,255,.07); pointer-events:none; }
            .qz-banner::after { content:''; position:absolute; bottom:-60px; left:60px; width:220px; height:220px; border-radius:50%; background:rgba(255,255,255,.05); pointer-events:none; }
            .qz-banner-inner { display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap; position:relative; z-index:1; }
            .qz-banner-title { font-size:26px; font-weight:800; color:#fff; margin:0 0 4px; }
            .qz-banner-sub { font-size:14px; color:rgba(255,255,255,.75); margin:0; }
            .qz-banner-actions { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
            .qz-back-btn { display:inline-flex; align-items:center; gap:6px; padding:9px 16px; background:rgba(255,255,255,.15); color:#fff; border:1px solid rgba(255,255,255,.25); border-radius:10px; font-size:13px; font-weight:600; text-decoration:none; transition:all .15s; }
            .qz-back-btn:hover { background:rgba(255,255,255,.25); }
            .btn-primary { background:#fff; color:#1B4D3E; border:none; padding:10px 20px; border-radius:10px; font-weight:700; font-size:14px; cursor:pointer; transition:all .15s; }
            .btn-primary:hover { background:#f0fdf4; transform:translateY(-1px); box-shadow:0 4px 12px rgba(0,0,0,.15); }
            .btn-ai { background:rgba(255,255,255,.15); color:#fff; border:1px solid rgba(255,255,255,.3); padding:9px 18px; border-radius:10px; font-weight:600; font-size:14px; cursor:pointer; display:inline-flex; align-items:center; gap:6px; transition:all .15s; }
            .btn-ai:hover { background:rgba(255,255,255,.25); }

            .qz-filter-bar { display:flex; align-items:center; gap:12px; margin-bottom:20px; }
            .qz-filter-bar select { padding:9px 14px; border:1px solid #e8ecef; border-radius:10px; font-size:13px; min-width:240px; background:#fff; color:#374151; cursor:pointer; outline:none; transition:border-color .15s; box-shadow:0 1px 2px rgba(0,0,0,.04); }
            .qz-filter-bar select:focus { border-color:#1B4D3E; box-shadow:0 0 0 3px rgba(27,77,62,.08); }

            .quizzes-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(320px,1fr)); gap:16px; }
            .quiz-card { background:#fff; border:1px solid #f1f5f9; border-radius:14px; overflow:hidden; transition:all .2s; box-shadow:0 1px 3px rgba(0,0,0,.07); }
            .quiz-card:hover { border-color:#d1fae5; box-shadow:0 8px 24px rgba(0,0,0,.1); transform:translateY(-2px); }
            .quiz-top { padding:18px 20px; display:flex; justify-content:space-between; align-items:flex-start; border-bottom:1px solid #f8fafc; }
            .quiz-title { font-size:16px; font-weight:700; color:#111827; margin-bottom:4px; }
            .quiz-subject { font-size:12px; color:#9ca3af; }
            .quiz-subject .code { background:#E8F5E9; color:#1B4D3E; padding:2px 6px; border-radius:4px; font-family:monospace; font-size:11px; margin-right:4px; }
            .badge { padding:4px 10px; border-radius:20px; font-size:11px; font-weight:600; text-transform:capitalize; }
            .badge-published { background:#dcfce7; color:#16a34a; }
            .badge-draft { background:#FEF3C7; color:#B45309; }

            .quiz-stats { display:grid; grid-template-columns:repeat(4,1fr); padding:14px 20px; gap:8px; }
            .qs-item { text-align:center; background:#f8fafc; padding:10px 4px; border-radius:10px; border:1px solid #f1f5f9; }
            .qs-num { font-size:16px; font-weight:800; color:#111827; display:block; }
            .qs-label { font-size:10px; color:#9ca3af; text-transform:uppercase; letter-spacing:.3px; }

            /* Kebab */
            .quiz-kebab-wrap { position:relative; flex-shrink:0; }
            .quiz-kebab { background:none; border:none; cursor:pointer; padding:3px 8px; border-radius:6px; font-size:20px; color:#bbb; line-height:1; transition:all .15s; }
            .quiz-kebab:hover { background:#f3f4f6; color:#555; }
            .quiz-kebab-menu { position:absolute; right:0; top:calc(100% + 4px); background:#fff; border:1px solid #e0e0e0; border-radius:10px; box-shadow:0 6px 20px rgba(0,0,0,.1); z-index:200; min-width:160px; overflow:hidden; display:none; }
            .quiz-kebab-menu.open { display:block; }
            .quiz-kebab-item { display:flex; align-items:center; gap:8px; padding:10px 14px; font-size:13px; cursor:pointer; border:none; background:none; width:100%; text-align:left; color:#333; font-weight:500; transition:background .1s; }
            .quiz-kebab-item:hover { background:#f5f5f5; }
            .quiz-kebab-item.danger { color:#b91c1c; }
            .quiz-kebab-item.danger:hover { background:#FEE2E2; }

            .modal-overlay { position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,.5); display:flex; align-items:center; justify-content:center; z-index:1000; }
            .modal { background:#fff; border-radius:16px; width:90%; max-width:560px; max-height:90vh; overflow-y:auto; }
            .modal-header { padding:20px 24px; border-bottom:1px solid #f0f0f0; display:flex; justify-content:space-between; align-items:center; }
            .modal-header h3 { font-size:18px; font-weight:700; }
            .modal-close { background:none; border:none; font-size:24px; cursor:pointer; color:#737373; }
            .modal-body { padding:24px; }
            .modal-footer { padding:16px 24px; border-top:1px solid #f0f0f0; display:flex; justify-content:flex-end; gap:12px; }
            .form-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
            .form-group { margin-bottom:16px; }
            .form-group.full { grid-column:1/-1; }
            .form-label { display:block; font-size:13px; font-weight:600; color:#404040; margin-bottom:6px; }
            .form-input, .form-select, .form-textarea { width:100%; padding:9px 14px; border:1px solid #e0e0e0; border-radius:8px; font-size:14px; box-sizing:border-box; font-family:inherit; }
            .form-input:focus, .form-select:focus { outline:none; border-color:#00461B; }
            .btn-secondary { background:#f5f5f5; color:#404040; border:1px solid #e0e0e0; padding:9px 18px; border-radius:8px; font-weight:500; cursor:pointer; font-size:14px; }
            .alert { padding:12px 16px; border-radius:10px; margin-bottom:16px; font-size:14px; }
            .alert-error { background:#FEE2E2; color:#b91c1c; }
            .empty-state-sm { text-align:center; padding:40px; color:#737373; }
            @media(max-width:768px) { .quizzes-grid { grid-template-columns:1fr; } .form-grid { grid-template-columns:1fr; } .quiz-stats { grid-template-columns:1fr 1fr; } }
        </style>

        <div class="qz-banner">
            <div class="qz-banner-inner">
                <div>
                    <h2 class="qz-banner-title">Quizzes <span style="font-size:16px;font-weight:600;opacity:.8;">(${quizzes.length})</span></h2>
                    <p class="qz-banner-sub">Create and manage assessments for your students</p>
                </div>
                <div class="qz-banner-actions">
                    <a href="#instructor/my-classes" class="qz-back-btn">
                        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>
                        My Classes
                    </a>
                    <button class="btn-primary" id="btn-add">+ Create Quiz</button>
                </div>
            </div>
        </div>
        <div class="qz-filter-bar">
            <select id="filter-subject">
                <option value="">All Subjects</option>
                ${subjects.map(s => `<option value="${s.subject_id}" ${filterSubject==s.subject_id?'selected':''}>${esc(s.subject_code)} - ${esc(s.subject_name)}</option>`).join('')}
            </select>
        </div>

        ${quizzes.length === 0 ? '<div class="empty-state-sm">No quizzes yet. Create your first quiz!</div>' :
          `<div class="quizzes-grid">
            ${quizzes.map(q => `
                <div class="quiz-card">
                    <div class="quiz-top">
                        <div>
                            <div class="quiz-title">${esc(q.quiz_title)}</div>
                            <div class="quiz-subject"><span class="code">${esc(q.subject_code)}</span>${esc(q.subject_name)}</div>
                        </div>
                        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
                            <span class="badge badge-${q.status}">${q.status}</span>
                            <div class="quiz-kebab-wrap">
                                <button class="quiz-kebab" title="More actions">⋮</button>
                                <div class="quiz-kebab-menu">
                                    <button class="quiz-kebab-item" data-questions="${q.quiz_id}">${icon('clipboard', inl)} Questions</button>
                                    <button class="quiz-kebab-item" data-edit="${q.quiz_id}">${L.edit}</button>
                                    <button class="quiz-kebab-item danger" data-delete="${q.quiz_id}" data-name="${esc(q.quiz_title)}">${icon('trash', inl)} Delete</button>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="quiz-stats">
                        <div class="qs-item"><span class="qs-num">${q.question_count}</span><span class="qs-label">Questions</span></div>
                        <div class="qs-item"><span class="qs-num">${q.attempt_count||0}</span><span class="qs-label">Attempts</span></div>
                        <div class="qs-item"><span class="qs-num">${q.avg_score||'—'}</span><span class="qs-label">Avg Score</span></div>
                        <div class="qs-item"><span class="qs-num">${q.time_limit}m</span><span class="qs-label">Time</span></div>
                        <div class="qs-item"><span class="qs-num">${(q.max_attempts || 0) > 0 ? q.max_attempts : '∞'}</span><span class="qs-label">Attempts</span></div>
                    </div>
                </div>
            `).join('')}
          </div>`}
    `;

    container.querySelector('#btn-add').addEventListener('click', () => {
        openQuizCreatePicker({
            presetSubjectId: filterSubject || '',
            lockSubject: !!filterSubject,
            backTarget: 'quizzes',
            onSuccess: () => renderList(container, filterSubject),
        });
    });
    container.querySelector('#filter-subject').addEventListener('change', (e) => renderList(container, e.target.value));

    // Kebab: close on outside click
    if (closeMenusHandler) document.removeEventListener('click', closeMenusHandler);
    closeMenusHandler = () => document.querySelectorAll('.quiz-kebab-menu.open').forEach(m => m.classList.remove('open'));
    document.addEventListener('click', closeMenusHandler);

    // Kebab toggle
    container.querySelectorAll('.quiz-kebab').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            const menu = btn.nextElementSibling;
            const wasOpen = menu.classList.contains('open');
            document.querySelectorAll('.quiz-kebab-menu.open').forEach(m => m.classList.remove('open'));
            if (!wasOpen) menu.classList.add('open');
        });
    });

    container.querySelectorAll('[data-questions]').forEach(btn => {
        btn.addEventListener('click', () => {
            window.location.hash = '#instructor/quiz-questions?quiz_id=' + btn.dataset.questions;
        });
    });

    container.querySelectorAll('[data-edit]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const q = quizzes.find(q => q.quiz_id == btn.dataset.edit);
            if (q) openQuizModal({ quiz: q, onSuccess: () => renderList(container, filterSubject) });
        });
    });

    container.querySelectorAll('[data-delete]').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!confirm(`Delete "${btn.dataset.name}"?`)) return;
            const res = await Api.post('/QuizzesAPI.php?action=delete', { quiz_id: parseInt(btn.dataset.delete) });
            if (res.success) renderList(container, filterSubject);
            else alert(res.message);
        });
    });
}

function esc(str) { const d = document.createElement('div'); d.textContent = str||''; return d.innerHTML; }
