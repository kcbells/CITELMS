/**
 * Content Bank — Facebook-style feed of shared materials, quiz questions & quizzes.
 */
import { Api } from '../../api.js';
import { Auth } from '../../auth.js';
import { icon, iconLg } from '../../utils/icons.js';
import { L } from '../../utils/action-labels.js';
import { resolveMaterialUrl } from '../../utils/material-files.js';
import { notify } from '../../utils/notify.js';

const inl = { size: 14, className: 'ui-icon-inline' };

// Same palette as the Global Gradebook (global-gradebook.js) — reused here
// so Content Bank reads as part of the same system instead of its own
// separate Facebook-style look: G/G2/GL are the app's primary green, and
// EL/MASTERY/SOC are the exact three group-header colors from the 14-module
// gradebook (purple/amber/blue). BORDER is the flat black now used for
// every card/container border across the app.
const G       = '#00461B';
const G2      = '#006428';
const GL      = '#E8F5EC';
const EL      = '#7C3AED'; // Effortful Learning purple
const MASTERY = '#B45309'; // Mastery amber
const SOC     = '#1D4ED8'; // Start of Class / quiz blue
const BORDER  = '#111';

let mySubjects        = [];
let myQuizzes         = [];
let currentUser       = null;
let section           = 'all';     // 'all' | 'lessons' | 'quizzes'
let activeTab         = 'browse';
let searchTimer       = null;
let closeMenusHandler = null;
let feedCache         = [];        // last loaded items for preview/actions

export async function render(container) {
    const [subjRes, quizRes, bankSubjRes, sharedSubjRes, user] = await Promise.all([
        Api.get('/LessonsAPI.php?action=subjects'),
        Api.get('/QuestionBankAPI.php?action=my-quizzes'),
        Api.get('/LessonBankAPI.php?action=subjects'),
        Api.get('/QuizzesAPI.php?action=shared-subjects'),
        Auth.getUser(),
    ]);
    mySubjects = subjRes.success ? subjRes.data : [];
    myQuizzes  = quizRes.success ? quizRes.data : [];
    currentUser = user || Auth.user();
    const initBankSubjects = mergeSubjects(
        bankSubjRes.success ? bankSubjRes.data : [],
        sharedSubjRes.success ? sharedSubjRes.data : [],
    );

    const myInitials = authorInitials(currentUser?.first_name, currentUser?.last_name, currentUser?.name);

    container.innerHTML = `
        <style>
            /* No fixed max-width — this used to cap the page at 1200px and
               center it, which left large empty gutters on anything wider
               than that (a normal desktop monitor). It now just fills
               whatever width .main-content actually gives it, like other
               pages in the app. */
            .cb-page { background:#fff; padding:12px 20px 28px; min-height:60vh; }
            .cb-layout { max-width:100%; margin:0; }

            .cb-topbar { margin-bottom:12px; }
            .cb-topbar h2 { font-size:20px; font-weight:800; margin:0 0 4px; color:#050505; display:flex; align-items:center; gap:8px; }
            .cb-topbar p  { font-size:13px; color:#65676B; margin:0; }

            /* Icon-only — no visible label, no border. The name only shows
               as a small tooltip on hover/focus (same attr(data-tooltip)
               technique the collapsed sidebar nav already uses), and focus
               fires on tap on touch devices so it still works there. */
            .cb-sections { display:flex; gap:6px; margin-bottom:12px; }
            .cb-section-btn {
                position:relative; width:38px; height:38px; padding:0; border-radius:10px;
                cursor:pointer; color:#65676B; border:none; background:none;
                transition:all .15s; display:flex; align-items:center; justify-content:center;
            }
            .cb-section-btn:hover { background:#F3F4F6; }
            .cb-section-btn.active { background:${G}; color:#fff; }
            .cb-section-btn::after {
                content:attr(data-tooltip); position:absolute; top:calc(100% + 8px); left:50%;
                transform:translateX(-50%); background:#1a2a1a; color:#fff; font-size:11px; font-weight:600;
                padding:5px 10px; border-radius:6px; white-space:nowrap; pointer-events:none;
                opacity:0; transition:opacity .15s; z-index:50;
            }
            .cb-section-btn:hover::after, .cb-section-btn:focus-visible::after, .cb-section-btn.cb-tip-show::after {
                opacity:1;
            }

            .cb-tabs { display:flex; gap:8px; margin-bottom:12px; }
            .cb-tab { flex:1; padding:8px 14px; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; color:#65676B; border:1.5px solid ${BORDER}; background:none; }
            .cb-tab:hover { background:#F3F4F6; }
            .cb-tab.active { background:${GL}; color:${G}; border-color:${BORDER}; }

            .cb-toolbar { display:flex; gap:10px; margin-bottom:12px; flex-wrap:wrap; }
            .cb-search { flex:1; min-width:180px; padding:10px 14px 10px 38px; border:1.5px solid ${BORDER}; border-radius:20px; font-size:14px; background:#fff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='15' height='15' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2'%3E%3Ccircle cx='11' cy='11' r='8'/%3E%3Cline x1='21' y1='21' x2='16.65' y2='16.65'/%3E%3C/svg%3E") no-repeat 14px center; }
            .cb-search:focus { outline:none; border-color:${G}; }
            .cb-select { padding:10px 14px; border:1.5px solid ${BORDER}; border-radius:20px; font-size:13px; cursor:pointer; background:#fff; }

            /* Facebook composer */
            .fb-composer { background:#fff; border:2px solid ${BORDER}; border-radius:12px; padding:14px 16px; margin-bottom:14px; }
            .fb-composer-top { display:flex; align-items:center; gap:12px; margin-bottom:12px; }
            .fb-composer-prompt { flex:1; text-align:left; padding:12px 16px; background:#F0F2F5; border:none; border-radius:24px; font-size:15px; color:#65676B; cursor:pointer; font-family:inherit; }
            .fb-composer-prompt:hover { background:#E4E6EB; }
            .fb-composer-actions { display:flex; gap:4px; border-top:1px solid #E4E6EB; padding-top:10px; }
            .fb-composer-btn { flex:1; display:flex; align-items:center; justify-content:center; gap:8px; padding:10px; border:none; background:none; border-radius:8px; font-size:13px; font-weight:600; color:#65676B; cursor:pointer; }
            .fb-composer-btn:hover { background:#F0F2F5; }
            .fb-composer-btn .ico { font-size:18px; }

            /* Facebook feed */
            .fb-feed { display:flex; flex-direction:column; gap:14px; }
            .fb-post { background:#fff; border:2px solid ${BORDER}; border-radius:12px; overflow:hidden; }
            .fb-post-head { display:flex; align-items:flex-start; gap:10px; padding:14px 16px 0; }
            .fb-post-head-own { cursor:pointer; border-radius:8px; margin:-4px -6px 0; padding:18px 22px 0; transition:background .15s; }
            .fb-post-head-own:hover { background:#F0F2F5; }
            .fb-post-head-own:hover .fb-post-name { text-decoration:underline; }
            .fb-avatar { width:40px; height:40px; border-radius:50%; background:${G}; color:#fff; font-size:14px; font-weight:800; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
            .fb-avatar.sm { width:32px; height:32px; font-size:11px; }
            .fb-post-meta { flex:1; min-width:0; }
            .fb-post-name { font-size:15px; font-weight:700; color:#050505; line-height:1.2; }
            .fb-post-sub { font-size:12px; color:#65676B; margin-top:2px; display:flex; flex-wrap:wrap; gap:4px; align-items:center; }
            .fb-post-sub .dot { opacity:.5; }
            /* Same three accent colors as the Global Gradebook's group
               headers (Effortful/Mastery/Start-of-Class) — solid chips, not
               pastel tints, so a post's type reads exactly like a gradebook
               module column at a glance. */
            .fb-type-pill { font-size:10px; font-weight:700; padding:2px 8px; border-radius:12px; text-transform:uppercase; letter-spacing:.3px; color:#fff; }
            .fb-type-pill.material { background:${G}; }
            .fb-type-pill.question { background:${EL}; }
            .fb-type-pill.quiz { background:${SOC}; }
            .fb-post-body { padding:12px 16px 14px; }
            .fb-post-title { font-size:16px; font-weight:700; color:#050505; margin:0 0 8px; line-height:1.35; }
            .fb-post-text { font-size:14px; color:#050505; line-height:1.5; margin:0; white-space:pre-wrap; }
            .fb-post-text.clamp { display:-webkit-box; -webkit-line-clamp:4; -webkit-box-orient:vertical; overflow:hidden; }
            .fb-post-attach { margin-top:10px; }
            .fb-quiz-card { display:flex; gap:12px; align-items:center; margin-top:10px; padding:14px 16px; background:#F0F2F5; border-radius:10px; border:1.5px solid ${BORDER}; cursor:pointer; transition:background .15s; }
            .fb-quiz-card:hover { background:#E4E6EB; }
            .fb-quiz-card-icon { width:48px; height:48px; border-radius:10px; background:#F3F4F6; color:#111; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
            .fb-quiz-card-title { font-size:15px; font-weight:700; color:#050505; margin:0 0 4px; }
            .fb-quiz-card-meta { font-size:12px; color:#65676B; }
            .fb-post-stats { padding:8px 16px; font-size:13px; color:#65676B; border-top:1px solid #E4E6EB; display:flex; gap:16px; flex-wrap:wrap; align-items:center; }
            .fb-post-actions { display:flex; border-top:1px solid #E4E6EB; }
            .fb-action { flex:1; display:flex; align-items:center; justify-content:center; gap:6px; padding:10px; border:none; background:none; font-size:13px; font-weight:600; color:#65676B; cursor:pointer; }
            .fb-action:hover { background:#F0F2F5; }
            .fb-action.active { color:${G}; background:#F0F2F5; }
            .fb-action.primary { color:${G}; }
            .fb-action.danger { color:#b91c1c; }

            /* Comments */
            .fb-comments { border-top:1px solid #E4E6EB; padding:12px 16px 14px; background:#FAFBFC; display:none; }
            .fb-comments.open { display:block; }
            .fb-comment-list { display:flex; flex-direction:column; gap:10px; margin-bottom:10px; max-height:280px; overflow-y:auto; }
            .fb-comment { display:flex; gap:8px; align-items:flex-start; }
            .fb-comment-body { flex:1; background:#F0F2F5; border-radius:18px; padding:8px 12px; min-width:0; }
            .fb-comment-author { font-size:13px; font-weight:700; color:#050505; margin-right:6px; }
            .fb-comment-text { font-size:13px; color:#050505; line-height:1.45; margin:2px 0 0; white-space:pre-wrap; word-break:break-word; }
            .fb-comment-time { font-size:11px; color:#65676B; margin-top:4px; }
            .fb-comment-empty { font-size:13px; color:#65676B; font-style:italic; padding:4px 0 8px; }
            .fb-comment-compose { display:flex; gap:8px; align-items:flex-end; }
            .fb-comment-input { flex:1; padding:10px 14px; border:none; border-radius:20px; background:#F0F2F5; font-size:13px; font-family:inherit; resize:none; min-height:36px; max-height:100px; }
            .fb-comment-input:focus { outline:none; background:#E4E6EB; }
            .fb-comment-send { padding:8px 14px; border:none; border-radius:8px; background:${G}; color:#fff; font-size:12px; font-weight:700; cursor:pointer; flex-shrink:0; }
            .fb-comment-send:disabled { opacity:.5; cursor:not-allowed; }
            .fb-comment-send:hover:not(:disabled) { background:${G2}; }

            /* Get resource controls */
            .fb-resource-ctrl {
                margin:0 16px 12px; padding:12px 14px; background:${GL}; border:1.5px solid ${BORDER};
                border-radius:10px;
            }
            .fb-resource-ctrl-hdr {
                display:flex; align-items:center; gap:8px; font-size:12px; font-weight:800;
                color:${G}; text-transform:uppercase; letter-spacing:.4px; margin-bottom:10px;
            }
            .fb-resource-ctrl-row {
                display:flex; flex-wrap:wrap; gap:8px; align-items:center;
            }
            .fb-resource-lbl { font-size:12px; font-weight:600; color:#374151; white-space:nowrap; }
            .fb-resource-subject {
                flex:1; min-width:160px; padding:8px 12px; border:1.5px solid ${BORDER}; border-radius:8px;
                font-size:13px; background:#fff; font-family:inherit;
            }
            .fb-resource-subject:focus { outline:none; border-color:${G}; box-shadow:0 0 0 2px rgba(0,70,27,.15); }
            .fb-resource-btn {
                display:inline-flex; align-items:center; gap:6px; padding:8px 14px; border-radius:8px;
                font-size:12px; font-weight:700; cursor:pointer; border:none; font-family:inherit;
                white-space:nowrap; transition:background .15s;
            }
            .fb-resource-btn.preview { background:#fff; color:#374151; border:1.5px solid ${BORDER}; }
            .fb-resource-btn.preview:hover { background:#F9FAFB; border-color:${G}; color:${G}; }
            .fb-resource-btn.outline { background:#fff; color:${SOC}; border:1.5px solid ${BORDER}; }
            .fb-resource-btn.outline:hover { background:#EFF6FF; }
            .fb-resource-btn.primary { background:${G}; color:#fff; }
            .fb-resource-btn.primary:hover { background:${G2}; }
            .fb-resource-btn:disabled { opacity:.55; cursor:not-allowed; }
            .fb-resource-none { font-size:12px; color:#6B7280; font-style:italic; }
            .cb-get-hint {
                font-size:12px; color:${G}; background:${GL}; border:1.5px solid ${BORDER};
                border-radius:8px; padding:8px 12px; margin-bottom:12px; line-height:1.45;
            }

            .cb-vis-badge { font-size:10px; font-weight:700; padding:2px 8px; border-radius:12px; color:#fff; }
            .cb-vis-badge.public  { background:${G}; }
            .cb-vis-badge.private { background:${MASTERY}; }
            .cb-type-badge { font-size:10px; font-weight:700; padding:2px 8px; border-radius:12px; background:${EL}; color:#fff; }
            .cb-subject-tag { background:${SOC}; color:#fff; font-size:11px; font-weight:700; padding:2px 8px; border-radius:12px; }
            .cb-attachment-badge, .cb-attachment-link { display:inline-flex; align-items:center; gap:4px; font-size:11px; font-weight:600; padding:5px 8px; border-radius:6px; text-decoration:none; max-width:100%; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
            .cb-attachment-badge { background:${GL}; color:${G}; border:1.5px solid ${BORDER}; }
            .cb-attachment-link { background:#EFF6FF; color:${SOC}; border:1.5px solid ${BORDER}; }

            .cb-empty { text-align:center; padding:48px 24px; background:#fff; border:2px solid ${BORDER}; border-radius:12px; }
            .cb-empty h3 { font-size:17px; font-weight:700; color:#050505; margin:12px 0 6px; }
            .cb-empty p  { font-size:13px; color:#65676B; margin:0; }

            /* Kebab menu */
            .cb-kebab-wrap { position:relative; flex-shrink:0; }
            .cb-kebab { background:none; border:none; cursor:pointer; padding:3px 7px; border-radius:6px; font-size:18px; color:#bbb; line-height:1; transition:all .15s; }
            .cb-kebab:hover { background:#f3f4f6; color:#555; }
            .cb-kebab-menu { position:absolute; right:0; top:calc(100% + 4px); background:#fff; border:1.5px solid ${BORDER}; border-radius:10px; box-shadow:0 6px 20px rgba(0,0,0,.1); z-index:200; min-width:160px; overflow:hidden; display:none; }
            .cb-kebab-menu.open { display:block; }
            .cb-kebab-item { display:flex; align-items:center; gap:8px; padding:10px 14px; font-size:13px; cursor:pointer; border:none; background:none; width:100%; text-align:left; color:#333; font-weight:500; transition:background .1s; }
            .cb-kebab-item:hover { background:#f5f5f5; }
            .cb-kebab-item.danger { color:#b91c1c; }
            .cb-kebab-item.danger:hover { background:#FEE2E2; }

            /* Modal */
            .cb-overlay { position:fixed; inset:0; background:rgba(0,0,0,.5); z-index:1000; display:flex; align-items:center; justify-content:center; padding:20px; }
            .cb-modal { background:#fff; border-radius:16px; width:100%; max-width:640px; max-height:90vh; overflow-y:auto; animation:cbIn .2s ease-out; border:2px solid ${BORDER}; }
            @keyframes cbIn { from { opacity:0; transform:translateY(-10px); } to { opacity:1; transform:translateY(0); } }
            .cb-modal-header { display:flex; justify-content:space-between; align-items:center; padding:20px 24px; border-bottom:2px solid ${BORDER}; position:sticky; top:0; background:#fff; z-index:1; }
            .cb-modal-header h3 { margin:0; font-size:16px; font-weight:700; }
            .cb-modal-close { background:none; border:none; font-size:24px; color:#999; cursor:pointer; }
            .cb-modal-close:hover { color:#333; }
            .cb-modal-body  { padding:24px; }
            .cb-modal-footer { padding:16px 24px; border-top:2px solid ${BORDER}; display:flex; justify-content:flex-end; gap:10px; background:#fff; }
            .cb-form-group { margin-bottom:16px; }
            .cb-form-group label { display:block; font-size:12px; font-weight:700; color:#444; margin-bottom:5px; text-transform:uppercase; letter-spacing:.4px; }
            .cb-input, .cb-textarea, .cb-form-select { width:100%; padding:9px 12px; border:1.5px solid ${BORDER}; border-radius:8px; font-size:13px; font-family:inherit; box-sizing:border-box; }
            .cb-input:focus, .cb-textarea:focus, .cb-form-select:focus { outline:none; border-color:${G}; }
            .cb-textarea { resize:vertical; min-height:90px; }
            .cb-row { display:flex; gap:12px; }
            .cb-row .cb-form-group { flex:1; }
            .btn-primary-sm { padding:9px 20px; background:${G}; color:#fff; border:none; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; }
            .btn-primary-sm:hover { background:${G2}; }
            .btn-outline-sm { padding:9px 18px; background:#fff; border:1.5px solid ${BORDER}; border-radius:8px; font-size:13px; cursor:pointer; font-weight:500; }

            /* Options builder */
            .cb-options-list { display:flex; flex-direction:column; gap:8px; margin-bottom:10px; }
            .cb-option-item { display:flex; align-items:center; gap:8px; background:#f8f9fa; border-radius:8px; padding:8px 10px; }
            .cb-option-item input[type=text] { flex:1; border:none; background:transparent; font-size:13px; outline:none; }
            .cb-option-correct { width:16px; height:16px; cursor:pointer; accent-color:${G}; flex-shrink:0; }
            .cb-option-del { background:none; border:none; color:#999; cursor:pointer; font-size:16px; line-height:1; flex-shrink:0; }
            .cb-option-del:hover { color:#b91c1c; }
            .cb-add-option { width:100%; padding:7px; background:none; border:1.5px dashed ${BORDER}; border-radius:8px; font-size:12px; color:#888; cursor:pointer; font-weight:600; }
            .cb-add-option:hover { border-color:${G}; color:${G}; }
            .cb-correct-hint { font-size:11px; color:#888; margin-bottom:8px; }

            /* Preview */
            .cb-preview-content { background:#f8f9fa; border-radius:8px; padding:16px; font-size:14px; line-height:1.7; color:#333; white-space:pre-wrap; max-height:300px; overflow-y:auto; }

            /* Attachment */
            .cb-att-type-row { display:flex; gap:16px; flex-wrap:wrap; margin-top:6px; }
            .cb-att-radio { display:flex; align-items:center; gap:6px; font-size:13px; color:#444; cursor:pointer; font-weight:500; }
            .cb-att-radio input { accent-color:${G}; cursor:pointer; }
            .cb-att-hint { font-size:11px; color:#999; margin:4px 0 0; }
            .cb-att-file-input { width:100%; padding:8px; border:1.5px dashed ${BORDER}; border-radius:8px; font-size:13px; box-sizing:border-box; cursor:pointer; }
            .cb-att-file-input:hover { border-color:${G}; }
            .cb-attachment-badge { display:inline-flex; align-items:center; gap:5px; background:${GL}; border:1.5px solid ${BORDER}; color:${G}; font-size:11px; font-weight:600; padding:4px 10px; border-radius:6px; text-decoration:none; max-width:100%; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
            .cb-attachment-badge:hover { background:#dcfce7; }
            .cb-attachment-link { display:inline-flex; align-items:center; gap:5px; background:#EFF6FF; border:1.5px solid ${BORDER}; color:${SOC}; font-size:11px; font-weight:600; padding:4px 10px; border-radius:6px; text-decoration:none; max-width:100%; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
            .cb-attachment-link:hover { background:#DBEAFE; }
            .cb-att-preview-btn { display:inline-flex; align-items:center; gap:8px; padding:10px 16px; border-radius:8px; font-size:13px; font-weight:600; text-decoration:none; cursor:pointer; border:none; }
            .cb-att-preview-btn.file { background:${GL}; color:${G}; }
            .cb-att-preview-btn.link { background:#EFF6FF; color:${SOC}; }

            /* Question accordion groups */
            .cb-group { background:#fff; border:2px solid ${BORDER}; border-radius:14px; margin-bottom:14px; overflow:hidden; transition:box-shadow .15s; }
            .cb-group:hover { box-shadow:0 2px 10px rgba(0,0,0,.06); }
            .cb-group-header { display:flex; align-items:center; gap:12px; padding:16px 20px; cursor:pointer; user-select:none; }
            .cb-group-header:hover { background:#f9f9f9; }
            .cb-group-icon { font-size:20px; flex-shrink:0; }
            .cb-group-info { flex:1; min-width:0; }
            .cb-group-name { font-size:15px; font-weight:700; color:${G}; }
            .cb-group-code { font-size:11px; color:#888; margin-top:1px; }
            .cb-group-count { background:${GL}; color:${G}; font-size:11px; font-weight:700; padding:4px 10px; border-radius:20px; white-space:nowrap; }
            .cb-copy-all-btn { padding:6px 14px; background:${G}; color:#fff; border:none; border-radius:7px; font-size:11px; font-weight:700; cursor:pointer; white-space:nowrap; transition:background .15s; }
            .cb-copy-all-btn:hover { background:${G2}; }
            .cb-group-chevron { font-size:14px; color:#aaa; transition:transform .2s; flex-shrink:0; }
            .cb-group.open .cb-group-chevron { transform:rotate(90deg); }
            .cb-group-body { display:none; border-top:2px solid ${BORDER}; }
            .cb-group.open .cb-group-body { display:block; }

            /* Lesson sub-groups inside each subject group */
            .cb-lesson-group { border-bottom:1px solid #f0f0f0; }
            .cb-lesson-group:last-child { border-bottom:none; }
            .cb-lesson-header { display:flex; align-items:center; gap:8px; padding:9px 20px 9px 24px; cursor:pointer; background:#f7fbf9; user-select:none; }
            .cb-lesson-header:hover { background:#edf7f2; }
            .cb-lesson-icon { font-size:13px; flex-shrink:0; }
            .cb-lesson-title { font-size:12px; font-weight:700; color:${G}; flex:1; text-transform:uppercase; letter-spacing:.4px; }
            .cb-lesson-count { font-size:11px; color:#888; background:#e8e8e8; padding:2px 8px; border-radius:10px; white-space:nowrap; }
            .cb-lesson-chevron { font-size:11px; color:#aaa; transition:transform .2s; }
            .cb-lesson-group.open .cb-lesson-chevron { transform:rotate(90deg); }
            .cb-lesson-body { display:none; }
            .cb-lesson-group.open .cb-lesson-body { display:block; }
            .cb-lesson-body .cb-q-row { padding-left:36px; }

            /* Question rows inside group */
            .cb-q-row { display:flex; align-items:flex-start; gap:12px; padding:14px 20px; border-bottom:1px solid #f5f5f5; transition:background .1s; cursor:pointer; }
            .cb-q-row:last-child { border-bottom:none; }
            .cb-q-row:hover { background:#fafafa; }
            .cb-q-row.expanded { background:${GL}; }
            .cb-q-num { font-size:11px; font-weight:700; color:#bbb; min-width:26px; padding-top:2px; flex-shrink:0; }
            .cb-q-main { flex:1; min-width:0; }
            .cb-q-text { font-size:13px; font-weight:600; color:#222; line-height:1.4; margin-bottom:5px; }
            .cb-q-badges { display:flex; gap:6px; flex-wrap:wrap; align-items:center; }
            .cb-q-opts { padding:10px 0 4px; display:flex; flex-direction:column; gap:4px; }
            .cb-q-opt { font-size:12px; color:#555; display:flex; align-items:center; gap:6px; }
            .cb-q-opt.correct { color:${G}; font-weight:700; }
            .cb-q-opt .dot { width:7px; height:7px; border-radius:50%; background:#ddd; flex-shrink:0; }
            .cb-q-opt.correct .dot { background:${G}; }
            .cb-q-actions { display:flex; gap:6px; align-items:flex-start; flex-shrink:0; padding-top:1px; }
        </style>

        <div class="cb-page">
        <div class="cb-layout">
        <div class="cb-topbar">
            <h2>${icon('folder', { size: 22, className: 'ui-icon-inline' })} Instructor Community</h2>
            <p>Browse resources from colleagues, preview them, and add them to your classes.</p>
        </div>

        <div class="cb-sections">
                <button class="cb-section-btn active" data-section="all" data-tooltip="All" aria-label="All">${icon('dashboard', inl)}</button>
                <button class="cb-section-btn" data-section="lessons" data-tooltip="Materials" aria-label="Materials">${icon('document', inl)}</button>
                <button class="cb-section-btn" data-section="quizzes" data-tooltip="Full Quizzes" aria-label="Full Quizzes">${icon('quiz', inl)}</button>
        </div>

        <div class="cb-tabs">
                <button class="cb-tab active" data-tab="browse">Get Resources</button>
                <button class="cb-tab" data-tab="mine">My Posts</button>
        </div>

            <div id="cb-get-hint" class="cb-get-hint" style="display:none;">
                ${icon('copy', inl)} Choose a class on each post, then click <strong>Get material</strong> or <strong>Get full quiz</strong> to add it to your teaching.
            </div>

            <div id="cb-composer-wrap"></div>

        <div class="cb-toolbar" id="cb-toolbar">
                <input type="text" class="cb-search" id="cb-search" placeholder="Search resources...">
            <select class="cb-select" id="cb-subject">
                <option value="">All Subjects</option>
                ${initBankSubjects.map(s => `<option value="${s.subject_id}">${esc(s.subject_code)} — ${esc(s.subject_name)}</option>`).join('')}
            </select>
        </div>

        <div id="cb-content"></div>
        </div>
        </div>
    `;

    renderComposer(container, myInitials);

    container.querySelectorAll('.cb-section-btn').forEach(btn => {
        // :hover doesn't really exist on touch devices, so the tooltip
        // would otherwise never show there — a brief tap-triggered class
        // fills that gap without interfering with the actual tab switch
        // below (or with the :focus-visible tooltip on keyboard/mouse).
        btn.addEventListener('touchstart', () => {
            container.querySelectorAll('.cb-section-btn.cb-tip-show').forEach(b => b.classList.remove('cb-tip-show'));
            btn.classList.add('cb-tip-show');
            setTimeout(() => btn.classList.remove('cb-tip-show'), 1200);
        }, { passive: true });

        btn.addEventListener('click', async () => {
            container.querySelectorAll('.cb-section-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            section = btn.dataset.section;
            const typeFilter = document.getElementById('cb-type');
            if (typeFilter) typeFilter.style.display = 'none';
            document.getElementById('cb-search').placeholder =
                section === 'lessons' ? 'Search materials…'
                : section === 'quizzes' ? 'Search full quizzes…'
                : 'Search community posts…';
            const bankApi = section === 'quizzes'
                ? '/QuizzesAPI.php?action=shared-subjects'
                : section === 'lessons'
                ? '/LessonBankAPI.php?action=subjects'
                : null;
            if (bankApi) {
                const sRes = await Api.get(bankApi);
                refreshSubjectDropdown(sRes.success ? sRes.data : []);
            } else {
                const [lRes, qRes] = await Promise.all([
                    Api.get('/LessonBankAPI.php?action=subjects'),
                    Api.get('/QuizzesAPI.php?action=shared-subjects'),
                ]);
                const merged = mergeSubjects(lRes.success ? lRes.data : [], qRes.success ? qRes.data : []);
                refreshSubjectDropdown(merged);
            }
            renderComposer(container, myInitials);
            loadContent();
        });
    });

    container.querySelectorAll('.cb-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            container.querySelectorAll('.cb-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            activeTab = tab.dataset.tab;
            document.getElementById('cb-toolbar').style.display = 'flex';
            const hint = document.getElementById('cb-get-hint');
            if (hint) hint.style.display = activeTab === 'browse' ? '' : 'none';
            renderComposer(container, myInitials);
            loadContent();
        });
    });

    const hint = document.getElementById('cb-get-hint');
    if (hint) hint.style.display = activeTab === 'browse' ? '' : 'none';

    document.getElementById('cb-search').addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(loadContent, 350);
    });
    document.getElementById('cb-subject').addEventListener('change', loadContent);

    loadContent();
}

// ─── Load content based on section + tab ─────────────────────────────────────

async function loadContent() {
    const wrap = document.getElementById('cb-content');
    if (!wrap) return;
    wrap.innerHTML = '<div class="fb-feed"><div class="cb-empty"><p>Loading feed…</p></div></div>';

    if (section === 'all') {
        await loadAllContent(wrap);
    } else if (section === 'lessons') {
        await loadLessons(wrap);
    } else {
        await loadQuizContent(wrap);
    }
}

async function loadAllContent(wrap) {
    const search = document.getElementById('cb-search')?.value || '';
    const subjectId = document.getElementById('cb-subject')?.value || '';

    if (activeTab === 'browse') {
        let lUrl = '/LessonBankAPI.php?action=browse';
        let zUrl = '/QuizzesAPI.php?action=browse-shared';
        if (search) {
            lUrl += '&search=' + encodeURIComponent(search);
            zUrl += '&search=' + encodeURIComponent(search);
        }
        if (subjectId) {
            lUrl += '&subject_id=' + subjectId;
            zUrl += '&subject_id=' + subjectId;
        }
        const [lRes, zRes] = await Promise.all([Api.get(lUrl), Api.get(zUrl)]);
        const items = [
            ...(lRes.success ? lRes.data : []).map(l => ({ ...l, feed_type: 'material' })),
            ...(zRes.success ? zRes.data : []).map(q => ({
                ...q,
                feed_type: 'quiz',
                is_own: q.is_own == 1 || q.is_own === true,
            })),
        ].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        renderFeed(wrap, items, 'browse');
    } else {
        const [lRes, zRes] = await Promise.all([
            Api.get('/LessonBankAPI.php?action=my-bank'),
            Api.get('/QuizzesAPI.php?action=instructor-list'),
        ]);
        const items = [
            ...(lRes.success ? lRes.data : []).map(l => ({
                ...l, feed_type: 'material', is_own: true,
                first_name: currentUser?.first_name, last_name: currentUser?.last_name,
            })),
            ...(zRes.success ? zRes.data : [])
                .filter(q => q.status === 'published')
                .map(q => ({
                    ...q, feed_type: 'quiz', is_own: true,
                    first_name: currentUser?.first_name, last_name: currentUser?.last_name,
                })),
        ].sort((a, b) => new Date(b.created_at || b.updated_at || 0) - new Date(a.created_at || a.updated_at || 0));
        renderFeed(wrap, items, 'mine');
    }
}

async function loadQuizContent(wrap) {
    const search = document.getElementById('cb-search')?.value || '';
    const subjectId = document.getElementById('cb-subject')?.value || '';

    if (activeTab === 'browse') {
        let zUrl = '/QuizzesAPI.php?action=browse-shared';
        if (search) zUrl += '&search=' + encodeURIComponent(search);
        if (subjectId) zUrl += '&subject_id=' + subjectId;

        const zRes = await Api.get(zUrl);
        const items = (zRes.success ? zRes.data : []).map(q => ({
            ...q,
            feed_type: 'quiz',
            is_own: q.is_own == 1 || q.is_own === true,
        }));
        renderFeed(wrap, items, 'browse');
    } else {
        const zRes = await Api.get('/QuizzesAPI.php?action=instructor-list');
        const items = (zRes.success ? zRes.data : [])
            .filter(q => q.status === 'published')
            .map(q => ({
                ...q,
                feed_type: 'quiz',
                is_own: true,
                first_name: currentUser?.first_name,
                last_name: currentUser?.last_name,
            }))
            .sort((a, b) => new Date(b.created_at || b.updated_at || 0) - new Date(a.created_at || a.updated_at || 0));
        renderFeed(wrap, items, 'mine');
    }
}

async function openSharedQuizPreview(quizId, title) {
    const overlay = createOverlay(`
        <div class="cb-modal" style="max-width:720px;">
            <div class="cb-modal-header">
                <h3>View Quiz</h3>
                <button class="cb-modal-close">&times;</button>
            </div>
            <div class="cb-modal-body" id="cb-quiz-preview-body">
                <div style="text-align:center;padding:32px;color:#65676B;">Loading quiz…</div>
            </div>
            <div class="cb-modal-footer" id="cb-quiz-preview-footer" style="display:none;">
                <button class="btn-outline-sm modal-cancel">Close</button>
                <button class="btn-primary-sm" id="cb-quiz-use-all">Use All in My Class</button>
                <button class="btn-primary-sm" id="cb-quiz-use-selected" disabled>Use Selected (0)</button>
            </div>
        </div>`);

    const body = overlay.querySelector('#cb-quiz-preview-body');
    const footer = overlay.querySelector('#cb-quiz-preview-footer');
    const res = await Api.get('/QuizzesAPI.php?action=shared-preview&id=' + quizId);

    if (!res.success || !res.data?.quiz) {
        body.innerHTML = alertHtml('error', res.message || 'Could not load quiz preview');
        return;
    }

    const quiz = res.data.quiz;
    const questions = res.data.questions || [];
    const isOwn = Number(quiz.user_teacher_id) === Number(currentUser?.users_id || currentUser?.id);
    const typeLabels = {
        multiple_choice: 'Multiple Choice',
        true_false: 'True / False',
        fill_blank: 'Fill in Blank',
        fill_in_the_blank: 'Fill in Blank',
        short_answer: 'Short Answer',
        essay: 'Essay',
    };

    if (isOwn) {
        body.innerHTML = `
            <div style="margin-bottom:16px;">
                <h4 style="margin:0 0 6px;font-size:17px;color:#050505;">${esc(quiz.quiz_title || title)}</h4>
                <p style="margin:0;font-size:13px;color:#65676B;">
                    ${esc(quiz.subject_code || '')} · ${questions.length} questions · ${quiz.time_limit || 30} min
                </p>
                ${quiz.quiz_description ? `<p style="font-size:13px;color:#444;margin:10px 0 0;">${esc(quiz.quiz_description)}</p>` : ''}
            </div>
            <div style="max-height:52vh;overflow-y:auto;display:flex;flex-direction:column;gap:10px;">
                ${questions.map((q, i) => `
                    <div style="border:1px solid #e4e6eb;border-radius:10px;padding:12px 14px;background:#fff;">
                        <div style="font-size:12px;color:#65676B;margin-bottom:4px;">
                            Q${i + 1} · ${typeLabels[q.question_type] || q.question_type} · ${q.points || 1} pt${q.points != 1 ? 's' : ''}
                        </div>
                        <div style="font-size:14px;color:#050505;line-height:1.5;">${esc(q.question_text)}</div>
                        ${(q.choices || []).length ? `
                            <div style="margin-top:8px;display:flex;flex-direction:column;gap:4px;">
                                ${q.choices.map(c => `
                                    <div style="font-size:12px;color:#444;padding:4px 8px;border-radius:6px;background:${c.is_correct ? '#ecfdf5' : '#f9fafb'};">
                                        ${c.is_correct ? '✓ ' : '○ '}${esc(c.option_text)}
                                    </div>
                                `).join('')}
                            </div>
                        ` : ''}
                    </div>
                `).join('')}
            </div>
        `;
        footer.style.display = '';
        overlay.querySelector('#cb-quiz-use-all')?.remove();
        overlay.querySelector('#cb-quiz-use-selected')?.remove();
        return;
    }

    body.innerHTML = `
        <div id="cb-quiz-copy-alert"></div>
        <div style="margin-bottom:16px;">
            <h4 style="margin:0 0 6px;font-size:17px;color:#050505;">${esc(quiz.quiz_title || title)}</h4>
            <p style="margin:0;font-size:13px;color:#65676B;">
                ${esc(quiz.subject_code || '')} · ${questions.length} questions · ${quiz.time_limit || 30} min
                · by ${esc((quiz.first_name || '') + ' ' + (quiz.last_name || '')).trim()}
            </p>
            ${quiz.quiz_description ? `<p style="font-size:13px;color:#444;margin:10px 0 0;">${esc(quiz.quiz_description)}</p>` : ''}
                </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;gap:10px;flex-wrap:wrap;">
            <label style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;cursor:pointer;">
                <input type="checkbox" id="cb-quiz-select-all" checked style="accent-color:#00461B;">
                Select all questions
            </label>
            <span style="font-size:12px;color:#65676B;">Pick questions to copy, or use all</span>
            </div>
        <div class="cb-form-group" style="margin-bottom:14px;">
            <label>Copy into subject *</label>
            <select class="cb-form-select" id="cb-quiz-copy-subject">
                <option value="">Select subject</option>
                ${mySubjects.map(s => `<option value="${s.subject_id}" ${String(s.subject_id) === String(quiz.subject_id) ? 'selected' : ''}>${esc(s.subject_code)} — ${esc(s.subject_name)}</option>`).join('')}
            </select>
            </div>
        <div style="max-height:52vh;overflow-y:auto;display:flex;flex-direction:column;gap:10px;">
            ${questions.map((q, i) => `
                <label style="display:block;border:1px solid #e4e6eb;border-radius:10px;padding:12px 14px;cursor:pointer;background:#fff;">
                    <div style="display:flex;gap:10px;align-items:flex-start;">
                        <input type="checkbox" class="cb-quiz-q-pick" value="${q.questions_id}" checked style="margin-top:4px;accent-color:#00461B;">
                        <div style="flex:1;min-width:0;">
                            <div style="font-size:12px;color:#65676B;margin-bottom:4px;">
                                Q${i + 1} · ${typeLabels[q.question_type] || q.question_type} · ${q.points || 1} pt${q.points != 1 ? 's' : ''}
                    </div>
                            <div style="font-size:14px;color:#050505;line-height:1.5;">${esc(q.question_text)}</div>
                            ${(q.choices || []).length ? `
                                <div style="margin-top:8px;display:flex;flex-direction:column;gap:4px;">
                                    ${q.choices.map(c => `
                                        <div style="font-size:12px;color:#444;padding:4px 8px;border-radius:6px;background:${c.is_correct ? '#ecfdf5' : '#f9fafb'};">
                                            ${c.is_correct ? '✓ ' : '○ '}${esc(c.option_text)}
                </div>
                                    `).join('')}
            </div>
                            ` : ''}
        </div>
        </div>
                </label>
            `).join('')}
        </div>
    `;
    footer.style.display = '';

    const selectAll = overlay.querySelector('#cb-quiz-select-all');
    const picks = () => [...overlay.querySelectorAll('.cb-quiz-q-pick')];
    const selectedIds = () => picks().filter(cb => cb.checked).map(cb => parseInt(cb.value, 10));
    const useSelectedBtn = overlay.querySelector('#cb-quiz-use-selected');

    const syncSelected = () => {
        const count = selectedIds().length;
        useSelectedBtn.disabled = count === 0;
        useSelectedBtn.textContent = `Use Selected (${count})`;
        if (selectAll) selectAll.checked = count === picks().length && count > 0;
    };

    selectAll?.addEventListener('change', () => {
        picks().forEach(cb => { cb.checked = selectAll.checked; });
        syncSelected();
    });
    picks().forEach(cb => cb.addEventListener('change', syncSelected));
    syncSelected();

    const doCopy = async (questionIds) => {
        const subjectId = parseInt(overlay.querySelector('#cb-quiz-copy-subject')?.value, 10);
        if (!subjectId) {
            overlay.querySelector('#cb-quiz-copy-alert').innerHTML = alertHtml('error', 'Select a subject');
            return;
        }
        const payload = { quiz_id: quizId, subject_id: subjectId };
        if (questionIds && questionIds.length < questions.length) {
            payload.question_ids = questionIds;
        }
        const res = await Api.post('/QuizzesAPI.php?action=copy-shared', payload);
        if (res.success) {
            overlay.remove();
            showToast(res.message || 'Quiz copied');
            const newId = res.data?.quiz_id;
            if (newId) window.location.hash = `#instructor/quiz-questions?quiz_id=${newId}`;
        } else {
            overlay.querySelector('#cb-quiz-copy-alert').innerHTML = alertHtml('error', res.message || 'Copy failed');
        }
    };

    overlay.querySelector('#cb-quiz-use-all')?.addEventListener('click', () => doCopy(null));
    useSelectedBtn?.addEventListener('click', () => {
        const ids = selectedIds();
        if (!ids.length) return;
        doCopy(ids);
    });
}

function openQuizCopyModal(quizId, title, questionIds = null) {
    const overlay = createOverlay(`
        <div class="cb-modal" style="max-width:460px;">
            <div class="cb-modal-header">
                <h3>Use Quiz in My Class</h3>
                <button class="cb-modal-close">&times;</button>
            </div>
            <div class="cb-modal-body">
                <div id="cb-quiz-copy-alert"></div>
                <p style="font-size:13px;color:#555;margin:0 0 16px;">Copying: <strong>${esc(title)}</strong><br><span style="color:#888;font-size:12px;">Creates a draft quiz with ${questionIds ? questionIds.length + ' selected' : 'all'} questions.</span></p>
                <div class="cb-form-group">
                    <label>Copy into subject *</label>
                    <select class="cb-form-select" id="cb-quiz-copy-subject">
                        <option value="">Select subject</option>
                        ${mySubjects.map(s => `<option value="${s.subject_id}">${esc(s.subject_code)} — ${esc(s.subject_name)}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div class="cb-modal-footer">
                <button class="btn-outline-sm modal-cancel">Cancel</button>
                <button class="btn-primary-sm" id="cb-quiz-copy-confirm">Copy Quiz</button>
            </div>
        </div>`);

    overlay.querySelector('#cb-quiz-copy-confirm').addEventListener('click', async () => {
        const subjectId = parseInt(overlay.querySelector('#cb-quiz-copy-subject')?.value, 10);
        if (!subjectId) {
            overlay.querySelector('#cb-quiz-copy-alert').innerHTML = alertHtml('error', 'Select a subject');
        return;
    }
        const btn = overlay.querySelector('#cb-quiz-copy-confirm');
        btn.disabled = true;
        btn.textContent = 'Copying…';
        const payload = { quiz_id: quizId, subject_id: subjectId };
        if (questionIds?.length) payload.question_ids = questionIds;
        const res = await Api.post('/QuizzesAPI.php?action=copy-shared', payload);
        if (res.success) {
            overlay.remove();
            showToast(res.message || 'Quiz copied');
            const newId = res.data?.quiz_id;
            if (newId) window.location.hash = `#instructor/quiz-questions?quiz_id=${newId}`;
        } else {
            btn.disabled = false;
            btn.textContent = 'Copy Quiz';
            overlay.querySelector('#cb-quiz-copy-alert').innerHTML = alertHtml('error', res.message || 'Copy failed');
        }
    });
}

async function loadLessons(wrap) {
    const search = document.getElementById('cb-search')?.value || '';
    const subjectId = document.getElementById('cb-subject')?.value || '';

    if (activeTab === 'browse') {
        let url = '/LessonBankAPI.php?action=browse';
        if (search) url += '&search=' + encodeURIComponent(search);
        if (subjectId) url += '&subject_id=' + subjectId;
        const res = await Api.get(url);
        const items = (res.success ? res.data : []).map(l => ({ ...l, feed_type: 'material' }));
        renderFeed(wrap, items, 'browse');
    } else {
        const res = await Api.get('/LessonBankAPI.php?action=my-bank');
        const items = (res.success ? res.data : []).map(l => ({
            ...l,
            feed_type: 'material',
            is_own: true,
            first_name: currentUser?.first_name,
            last_name: currentUser?.last_name,
        }));
        renderFeed(wrap, items, 'mine');
    }
}

// ─── Facebook-style feed ─────────────────────────────────────────────────────

function renderComposer(container, myInitials) {
    const wrap = document.getElementById('cb-composer-wrap');
    if (!wrap) return;

    if (activeTab === 'mine') {
        wrap.innerHTML = '';
        wrap.style.display = 'none';
        return;
    }
    wrap.style.display = '';

    const prompt = section === 'lessons'
        ? 'Share a lesson or material with colleagues…'
        : section === 'quizzes'
        ? 'Publish a full quiz from My Classes to share here…'
        : 'Share a material or quiz with fellow instructors…';

    wrap.innerHTML = `
        <div class="fb-composer">
            <div class="fb-composer-top">
                <div class="fb-avatar sm">${esc(myInitials)}</div>
                <button type="button" class="fb-composer-prompt" id="fb-composer-main">${esc(prompt)}</button>
            </div>
            <div class="fb-composer-actions">
                ${section !== 'quizzes' ? `
                    <button type="button" class="fb-composer-btn" data-share="lesson">
                        <span class="ico">${icon('document', { size: 16 })}</span> Share Material
                    </button>
                ` : ''}
                ${section !== 'lessons' ? `
                    <button type="button" class="fb-composer-btn" data-share="quiz-hint" title="Publish full quizzes from My Classes">
                        <span class="ico">${icon('quiz', { size: 16 })}</span> Publish Full Quiz
                    </button>
                ` : ''}
            </div>
        </div>
    `;

    const activeSubject = document.getElementById('cb-subject')?.value || '';
    wrap.querySelector('#fb-composer-main')?.addEventListener('click', () => {
        if (section === 'quizzes') {
            showToast('Open My Classes → pick a quiz → set status to Published to share it here.');
            return;
        }
        openLessonPublishModal(container, activeSubject);
    });
    wrap.querySelector('[data-share="lesson"]')?.addEventListener('click', () => openLessonPublishModal(container, activeSubject));
    wrap.querySelector('[data-share="quiz-hint"]')?.addEventListener('click', () => {
        showToast('Open My Classes → pick a quiz → set status to Published to share the full quiz.');
    });
}

function renderFeed(wrap, items, mode) {
    feedCache = items;

    if (!items.length) {
        const empty = section === 'lessons'
            ? emptyHtml('folder', 'No posts yet', mode === 'browse'
                ? 'When colleagues share materials for your subjects, they will show up here.'
                : 'Use the composer above to share your first material.')
            : section === 'quizzes'
            ? emptyHtml('quiz', 'No quiz posts yet', mode === 'browse'
                ? 'Published full quizzes from colleagues will appear here. Comment and copy whole quizzes — not question by question.'
                : 'Publish a full quiz from My Classes to share it with fellow instructors.')
            : emptyHtml('messages', 'No posts yet', mode === 'browse'
                ? 'Materials and full quizzes from colleagues in your subjects will show up in this feed.'
                : 'Share a material or publish a full quiz to get started.');
        wrap.innerHTML = `<div class="fb-feed">${empty}</div>`;
        return;
    }

    wrap.innerHTML = `<div class="fb-feed">${items.map((item, i) => feedPostHtml(item, mode, i)).join('')}</div>`;
    bindFeedEvents(wrap, items, mode);
    bindResourceControls(wrap, items);
    bindCommentEvents(wrap, items);
    loadCommentCountsForFeed(items);
}

function feedPostHtml(item, mode, index) {
    const type = item.feed_type || 'material';
    const isOwn = item.is_own === true || item.is_own === 1 || item.is_own === '1';
    const name = authorName(item.first_name, item.last_name);
    const initials = authorInitials(item.first_name, item.last_name);
    const when = timeAgo(item.created_at || item.updated_at);
    const subject = item.subject_code
        ? `<span class="cb-subject-tag">${esc(item.subject_code)}</span>`
        : '';
    const ref = getPostRef(item);
    const myInitials = authorInitials(currentUser?.first_name, currentUser?.last_name, currentUser?.name);
    const commentKey = ref ? `${ref.post_type}:${ref.post_id}` : '';

    const typePills = {
        material: '<span class="fb-type-pill material">Material</span>',
        question: '<span class="fb-type-pill question">Question</span>',
        quiz: '<span class="fb-type-pill quiz">Full Quiz</span>',
    };

    let title = '';
    let body = '';
    let stats = '';
    let actions = '';

    if (type === 'material') {
        title = esc(item.lesson_title || 'Untitled material');
        body = item.lesson_description
            ? `<p class="fb-post-text clamp">${esc(item.lesson_description)}</p>`
            : '';
        if (item.attachment_type && item.attachment_type !== 'none' && item.attachment_path) {
            const attHref = item.attachment_type === 'link' || /^https?:\/\//i.test(item.attachment_path)
                ? item.attachment_path
                : resolveMaterialUrl(item.attachment_path);
            body += `<div class="fb-post-attach">${
                item.attachment_type === 'file'
                    ? `<a class="cb-attachment-badge" href="${esc(attHref)}" target="_blank" rel="noopener">${L.attach} ${esc(item.attachment_name || 'Attachment')}</a>`
                    : `<a class="cb-attachment-link" href="${esc(attHref)}" target="_blank" rel="noopener">${L.link} ${esc(item.attachment_name || 'Link')}</a>`
            }</div>`;
        }
        stats = `<span>${icon('copy', { size: 12, className: 'ui-icon-inline' })} ${item.copy_count ?? 0} copies</span>`;
        // Dean has moderation authority over the whole bank, not just their own
        // posts — same reasoning as the backend's deleteLesson()/deleteQuestion().
        const canModerate = isOwn || currentUser?.role === 'dean';
        if (canModerate) {
            const label = isOwn ? L.remove : 'Remove (moderator)';
            actions = `<button type="button" class="fb-action danger" data-lesson-delete="${item.bank_id}">${label}</button>`;
        }
    } else if (type === 'quiz') {
        if (item.quiz_description) {
            body = `<p class="fb-post-text clamp">${esc(item.quiz_description)}</p>`;
        }
        body += `
            <div class="fb-quiz-card" data-quiz-open="${item.quiz_id}" data-title="${esc(item.quiz_title || '')}" role="button" tabindex="0">
                <div class="fb-quiz-card-icon">${icon('quiz', { size: 22 })}</div>
                <div style="min-width:0;">
                    <p class="fb-quiz-card-title">${esc(item.quiz_title || 'Untitled quiz')}</p>
                    <p class="fb-quiz-card-meta">${item.question_count || 0} questions · ${item.time_limit || 30} min${item.total_points ? ` · ${item.total_points} pts` : ''}${item.subject_code ? ` · ${esc(item.subject_code)}` : ''}</p>
                </div>
            </div>`;
        stats = `<span>${item.question_count || 0} questions</span>
                 <span>${item.time_limit || 30} min</span>
                 ${item.status ? `<span class="cb-vis-badge ${item.status === 'published' ? 'public' : 'private'}">${esc(item.status)}</span>` : ''}
                 <span class="fb-comment-count" data-comment-count="${esc(commentKey)}"></span>`;
        if (isOwn) {
            actions = `<a class="fb-action primary" href="#instructor/quiz-questions?quiz_id=${item.quiz_id}" style="text-decoration:none">Manage Quiz</a>`;
        }
    }

    const resourceCtrl = resourceControlsHtml(item, index, isOwn, mode);

    if (ref) {
        const commentLabel = `<span class="fb-comment-count-inline" data-comment-count="${esc(commentKey)}"></span>`;
        actions = `<button type="button" class="fb-action" data-feed-comment="${index}">${icon('messages', { size: 14, className: 'ui-icon-inline' })} Comment ${commentLabel}</button>` + (actions || '');
        if (type === 'material' && stats) {
            stats += `<span class="fb-comment-count" data-comment-count="${esc(commentKey)}"></span>`;
        }
    }

    const visBadge = item.visibility
        ? `<span class="cb-vis-badge ${item.visibility}">${item.visibility}</span>`
        : '';

    const commentsPanel = ref ? `
        <div class="fb-comments" id="fb-comments-${esc(ref.post_type)}-${ref.post_id}" data-post-type="${esc(ref.post_type)}" data-post-id="${ref.post_id}">
            <div class="fb-comment-list" data-comment-list>
                <p class="fb-comment-empty">Loading comments…</p>
            </div>
            <div class="fb-comment-compose">
                <div class="fb-avatar sm">${esc(myInitials)}</div>
                <textarea class="fb-comment-input" rows="1" placeholder="Write a comment…" maxlength="2000"></textarea>
                <button type="button" class="fb-comment-send" disabled>Post</button>
            </div>
        </div>` : '';

    return `
        <article class="fb-post" data-feed-idx="${index}" ${ref ? `data-post-type="${esc(ref.post_type)}" data-post-id="${ref.post_id}"` : ''}>
            <div class="fb-post-head${isOwn ? ' fb-post-head-own' : ''}" ${isOwn ? 'data-goto-mine="1" title="View my posts"' : ''}>
                <div class="fb-avatar">${esc(initials)}</div>
                <div class="fb-post-meta">
                    <div class="fb-post-name">${esc(name)}</div>
                    <div class="fb-post-sub">
                        ${subject}
                        ${when ? `<span class="dot">·</span><span>${when}</span>` : ''}
                        ${typePills[type] || ''}
                        ${visBadge}
                    </div>
                </div>
            </div>
            <div class="fb-post-body" ${type === 'material' ? `data-feed-view="${index}" style="cursor:pointer;" title="Click to preview"` : ''}>
                ${title ? `<h3 class="fb-post-title">${title}</h3>` : ''}
                ${body}
            </div>
            ${resourceCtrl}
            ${stats ? `<div class="fb-post-stats">${stats}</div>` : ''}
            ${actions ? `<div class="fb-post-actions">${actions}</div>` : ''}
            ${commentsPanel}
        </article>
    `;
}

function bindFeedEvents(wrap, items, mode) {
    // Clicking your own name/avatar on a post jumps to the "My Posts" tab
    wrap.querySelectorAll('[data-goto-mine]').forEach(el => {
        el.addEventListener('click', () => {
            document.querySelector('.cb-tab[data-tab="mine"]')?.click();
        });
    });
    wrap.querySelectorAll('[data-feed-view]').forEach(el => {
        el.addEventListener('click', (e) => {
            if (e.target.closest('a, button')) return;
            const item = items[parseInt(el.dataset.feedView, 10)];
            if (item?.feed_type === 'material') openLessonPreview(item);
        });
    });
    wrap.querySelectorAll('[data-lesson-copy]').forEach(btn => {
        btn.addEventListener('click', () => openLessonCopyModal(btn.dataset.lessonCopy, btn.dataset.title));
    });
    wrap.querySelectorAll('[data-lesson-delete]').forEach(btn => {
        btn.addEventListener('click', () => confirmLessonDelete(btn.dataset.lessonDelete));
    });
    wrap.querySelectorAll('[data-quiz-preview], [data-quiz-open]').forEach(btn => {
        btn.addEventListener('click', () => openSharedQuizPreview(parseInt(btn.dataset.quizPreview || btn.dataset.quizOpen, 10), btn.dataset.title));
        btn.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && btn.dataset.quizOpen) {
                openSharedQuizPreview(parseInt(btn.dataset.quizOpen, 10), btn.dataset.title);
            }
        });
    });
    wrap.querySelectorAll('[data-quiz-copy]').forEach(btn => {
        btn.addEventListener('click', () => openQuizCopyModal(parseInt(btn.dataset.quizCopy, 10), btn.dataset.title, null));
    });
}

function subjectOptionsHtml() {
    if (!mySubjects.length) {
        return '<option value="">No classes assigned</option>';
    }
    return '<option value="">Select your class…</option>' +
        mySubjects.map(s => `<option value="${s.subject_id}">${esc(s.subject_code)} — ${esc(s.subject_name)}</option>`).join('');
}

function canShowResourceControls(item, isOwn, mode) {
    const type = item.feed_type || 'material';
    if (type === 'material') return true;
    if (type === 'quiz' && !isOwn) return true;
    return false;
}

function resourceControlsHtml(item, index, isOwn, mode) {
    if (!canShowResourceControls(item, isOwn, mode)) return '';

    const type = item.feed_type || 'material';
    const isMaterial = type === 'material';
    const resourceId = isMaterial ? item.bank_id : item.quiz_id;
    const getLabel = isMaterial
        ? (isOwn ? 'Add to another class' : 'Get material')
        : 'Get full quiz';
    const pickLabel = isMaterial ? 'Add to class:' : 'Copy quiz to:';
    const hasClasses = mySubjects.length > 0;

    return `
        <div class="fb-resource-ctrl">
            <div class="fb-resource-ctrl-hdr">
                ${icon('copy', { size: 16, className: 'ui-icon-inline' })}
                <span>Get this resource</span>
            </div>
            <div class="fb-resource-ctrl-row">
                <span class="fb-resource-lbl">${pickLabel}</span>
                ${hasClasses ? `
                    <select class="fb-resource-subject" data-feed-idx="${index}">
                        ${subjectOptionsHtml()}
                    </select>
                    <button type="button" class="fb-resource-btn preview" data-res-preview="${index}">${icon('preview', { size: 14, className: 'ui-icon-inline' })} Preview</button>
                    <button type="button" class="fb-resource-btn primary" data-get-resource="${isMaterial ? 'material' : 'quiz'}" data-resource-id="${resourceId}" data-feed-idx="${index}">
                        ${icon('copy', { size: 14, className: 'ui-icon-inline' })} ${getLabel}
                    </button>
                    ${!isMaterial ? `<button type="button" class="fb-resource-btn outline" data-quiz-pick="${item.quiz_id}" data-title="${esc(item.quiz_title || '')}">${icon('quiz', { size: 14, className: 'ui-icon-inline' })} Pick questions…</button>` : ''}
                ` : `<span class="fb-resource-none">Assign subjects to your account to use resources.</span>`}
            </div>
        </div>`;
}

function bindResourceControls(wrap, items) {
    wrap.querySelectorAll('[data-res-preview]').forEach(btn => {
        btn.addEventListener('click', () => {
            const item = items[parseInt(btn.dataset.feedIdx, 10)];
            if (!item) return;
            if (item.feed_type === 'material') openLessonPreview(item);
            else if (item.feed_type === 'quiz') openSharedQuizPreview(item.quiz_id, item.quiz_title);
        });
    });

    wrap.querySelectorAll('[data-quiz-pick]').forEach(btn => {
        btn.addEventListener('click', () => {
            openSharedQuizPreview(parseInt(btn.dataset.quizPick, 10), btn.dataset.title);
        });
    });

    wrap.querySelectorAll('[data-get-resource]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const idx = parseInt(btn.dataset.feedIdx, 10);
            const item = items[idx];
            const post = btn.closest('.fb-post');
            const subjectId = parseInt(post?.querySelector('.fb-resource-subject')?.value, 10);
            if (!subjectId) {
                showToast('Select which class to add this resource to.');
                return;
            }

            const kind = btn.dataset.getResource;
            const resourceId = parseInt(btn.dataset.resourceId, 10);
            const origHtml = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = 'Adding…';

            try {
                if (kind === 'material') {
                    const res = await Api.post('/LessonBankAPI.php?action=copy', {
                        bank_id: resourceId,
                        subject_id: subjectId,
                    });
                    if (res.success) {
                        showToast('Material added to your class!');
                        loadContent();
                    } else {
                        showToast(res.message || 'Failed to add material.');
                    }
                } else {
                    const res = await Api.post('/QuizzesAPI.php?action=copy-shared', {
                        quiz_id: resourceId,
                        subject_id: subjectId,
                    });
                    if (res.success) {
                        showToast('Full quiz added to your class!');
                        const newId = res.data?.quiz_id;
                        if (newId) {
                            window.location.hash = `#instructor/quiz-questions?quiz_id=${newId}`;
                        } else {
                            loadContent();
                        }
                    } else {
                        showToast(res.message || 'Failed to add quiz.');
                    }
                }
            } finally {
                btn.disabled = false;
                btn.innerHTML = origHtml;
            }
        });
    });
}

// ─── Social comments ─────────────────────────────────────────────────────────

function getPostRef(item) {
    const type = item.feed_type || 'material';
    if (type === 'material' && item.bank_id) return { post_type: 'material', post_id: item.bank_id };
    if (type === 'question' && item.qbank_id) return { post_type: 'question', post_id: item.qbank_id };
    if (type === 'quiz' && item.quiz_id) return { post_type: 'quiz', post_id: item.quiz_id };
    return null;
}

function mergeSubjects(a, b) {
    const map = new Map();
    [...a, ...b].forEach(s => {
        if (s?.subject_id) map.set(String(s.subject_id), s);
    });
    return [...map.values()].sort((x, y) => String(x.subject_code).localeCompare(String(y.subject_code)));
}

function commentRowHtml(c) {
    const authorName = c.author_name || authorName(c.first_name, c.last_name);
    const initials = authorInitials(c.first_name, c.last_name);
    const when = c.created_at
        ? new Date(String(c.created_at).replace(' ', 'T')).toLocaleString('en-US', {
            month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
        })
        : '';
    return `
        <div class="fb-comment">
            <div class="fb-avatar sm">${esc(initials)}</div>
            <div class="fb-comment-body">
                <span class="fb-comment-author">${esc(authorName)}</span>
                <p class="fb-comment-text">${esc(c.content || '')}</p>
                <div class="fb-comment-time">${esc(when)}</div>
            </div>
        </div>`;
}

function updateCommentCountLabels(key, count) {
    const label = count > 0 ? `(${count})` : '';
    document.querySelectorAll(`[data-comment-count="${key}"]`).forEach(el => {
        el.textContent = el.classList.contains('fb-comment-count')
            ? (count > 0 ? `${count} comment${count !== 1 ? 's' : ''}` : '')
            : label;
    });
}

async function loadCommentCountsForFeed(items) {
    const posts = items.map(getPostRef).filter(Boolean);
    if (!posts.length) return;
    const res = await Api.post('/ContentBankAPI.php?action=comment-counts', { posts });
    if (!res.success) return;
    Object.entries(res.data || {}).forEach(([key, count]) => updateCommentCountLabels(key, count));
}

async function loadCommentsForPost(postType, postId, listEl) {
    listEl.innerHTML = '<p class="fb-comment-empty">Loading…</p>';
    const res = await Api.get(`/ContentBankAPI.php?action=comments&post_type=${encodeURIComponent(postType)}&post_id=${postId}`);
    if (!res.success) {
        listEl.innerHTML = '<p class="fb-comment-empty">Could not load comments.</p>';
        return;
    }
    const comments = res.data || [];
    listEl.innerHTML = comments.length
        ? comments.map(commentRowHtml).join('')
        : '<p class="fb-comment-empty">No comments yet. Start the conversation!</p>';
    updateCommentCountLabels(`${postType}:${postId}`, comments.length);
}

function bindCommentEvents(wrap, items) {
    wrap.querySelectorAll('[data-feed-comment]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const item = items[parseInt(btn.dataset.feedComment, 10)];
            const ref = getPostRef(item);
            if (!ref) return;
            const panel = wrap.querySelector(`#fb-comments-${ref.post_type}-${ref.post_id}`);
            if (!panel) return;

            const isOpen = panel.classList.contains('open');
            wrap.querySelectorAll('.fb-comments.open').forEach(p => p.classList.remove('open'));
            wrap.querySelectorAll('[data-feed-comment].active').forEach(b => b.classList.remove('active'));

            if (!isOpen) {
                panel.classList.add('open');
                btn.classList.add('active');
                const listEl = panel.querySelector('[data-comment-list]');
                if (listEl && !panel.dataset.loaded) {
                    await loadCommentsForPost(ref.post_type, ref.post_id, listEl);
                    panel.dataset.loaded = '1';
                }
                panel.querySelector('.fb-comment-input')?.focus();
            }
        });
    });

    wrap.querySelectorAll('.fb-comment-compose').forEach(compose => {
        const panel = compose.closest('.fb-comments');
        const input = compose.querySelector('.fb-comment-input');
        const sendBtn = compose.querySelector('.fb-comment-send');
        if (!panel || !input || !sendBtn) return;

        input.addEventListener('input', () => {
            sendBtn.disabled = !input.value.trim();
            input.style.height = 'auto';
            input.style.height = Math.min(input.scrollHeight, 100) + 'px';
        });

        const submit = async () => {
            const content = input.value.trim();
            if (!content) return;
            const postType = panel.dataset.postType;
            const postId = parseInt(panel.dataset.postId, 10);
            sendBtn.disabled = true;
            const res = await Api.post('/ContentBankAPI.php?action=add-comment', {
                post_type: postType,
                post_id: postId,
                content,
            });
            if (res.success) {
                input.value = '';
                input.style.height = 'auto';
                const listEl = panel.querySelector('[data-comment-list]');
                const existing = listEl.querySelector('.fb-comment-empty');
                if (existing) existing.remove();
                listEl.insertAdjacentHTML('beforeend', commentRowHtml(res.data));
                listEl.scrollTop = listEl.scrollHeight;
                const key = `${postType}:${postId}`;
                const count = listEl.querySelectorAll('.fb-comment').length;
                updateCommentCountLabels(key, count);
            } else {
                showToast(res.message || 'Failed to post comment');
            }
            sendBtn.disabled = !input.value.trim();
        };

        sendBtn.addEventListener('click', submit);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
            }
        });
    });
}

// ─── Lesson Modals ────────────────────────────────────────────────────────────

function openLessonPublishModal(_container, preSelectedSubjectId = '') {
    const myName = authorName(currentUser?.first_name, currentUser?.last_name, currentUser?.name);
    const myInitials = authorInitials(currentUser?.first_name, currentUser?.last_name, currentUser?.name);
    const overlay = createOverlay(`
        <div class="cb-modal">
            <div class="cb-modal-header">
                <h3>Create post</h3>
                <button class="cb-modal-close">&times;</button>
            </div>
            <div class="cb-modal-body">
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:18px;">
                    <div class="fb-avatar sm">${esc(myInitials)}</div>
                    <div>
                        <div style="font-size:15px;font-weight:700;color:#050505;">${esc(myName)}</div>
                        <div style="font-size:12px;color:#65676B;">Sharing a material · Content Bank</div>
                    </div>
                </div>
                <div id="lp-alert"></div>
                <p style="font-size:13px;color:#65676B;margin:0 0 18px;line-height:1.5;">Pick a lesson from your classes to share with colleagues who teach the same subjects.</p>
                <div class="cb-form-group">
                    <label>Subject *</label>
                    <select class="cb-form-select" id="lp-subject">
                        <option value="">-- Select Subject --</option>
                        ${mySubjects.map(s => `<option value="${s.subject_id}" ${preSelectedSubjectId == s.subject_id ? 'selected' : ''}>${esc(s.subject_code)} — ${esc(s.subject_name)}</option>`).join('')}
                    </select>
                </div>
                <div class="cb-form-group">
                    <label>Lesson *</label>
                    <select class="cb-form-select" id="lp-lesson" disabled>
                        <option value="">-- Select a subject first --</option>
                    </select>
                </div>
                <div id="lp-preview" style="display:none;margin-bottom:16px;padding:14px 16px;background:${GL};border:1.5px solid ${BORDER};border-radius:10px;">
                    <div style="font-size:13px;font-weight:700;color:${G};margin-bottom:5px;" id="lp-prev-title"></div>
                    <div style="font-size:12px;color:#555;line-height:1.5;" id="lp-prev-desc"></div>
                    <div style="margin-top:8px;display:flex;gap:8px;align-items:center;" id="lp-prev-meta"></div>
                </div>
                <p style="font-size:12px;color:#65676B;margin:0;padding:10px 12px;background:#F0F2F5;border-radius:8px;line-height:1.5;">
                    Posts are shared publicly with instructors in the same subjects and are available for preview immediately.
                </p>
            </div>
            <div class="cb-modal-footer">
                <button class="btn-outline-sm modal-cancel">Cancel</button>
                <button class="btn-primary-sm" id="lp-save" disabled>Post</button>
            </div>
        </div>`);

    let allLessons = [];
    const subjectSel = overlay.querySelector('#lp-subject');
    const lessonSel  = overlay.querySelector('#lp-lesson');
    const saveBtn    = overlay.querySelector('#lp-save');
    const preview    = overlay.querySelector('#lp-preview');

    async function loadLessons(subjectId) {
        lessonSel.innerHTML = '<option value="">Loading…</option>';
        lessonSel.disabled = true;
        saveBtn.disabled = true;
        preview.style.display = 'none';

        const res = await Api.get(`/LessonsAPI.php?action=instructor-lessons&subject_id=${subjectId}`);
        allLessons = res.success ? res.data : [];

        if (!allLessons.length) {
            lessonSel.innerHTML = '<option value="">No lessons found for this subject</option>';
            return;
        }
        lessonSel.innerHTML = '<option value="">-- Select Lesson --</option>' +
            allLessons.map(l => `<option value="${l.lessons_id}">${esc(l.lesson_title)}${l.status === 'draft' ? ' (draft)' : ''}</option>`).join('');
        lessonSel.disabled = false;
    }

    function showPreview(lessonId) {
        const lesson = allLessons.find(l => String(l.lessons_id) === String(lessonId));
        if (!lesson) { preview.style.display = 'none'; saveBtn.disabled = true; return; }

        overlay.querySelector('#lp-prev-title').textContent = lesson.lesson_title;
        overlay.querySelector('#lp-prev-desc').textContent  = lesson.lesson_description
            ? (lesson.lesson_description.length > 160
                ? lesson.lesson_description.slice(0, 160) + '…'
                : lesson.lesson_description)
            : 'No description provided.';
        const statusColor = lesson.status === 'published' ? G : MASTERY;
        const statusBg    = lesson.status === 'published' ? GL : '#FEF3C7';
        overlay.querySelector('#lp-prev-meta').innerHTML =
            `<span style="font-size:10px;font-weight:700;padding:3px 8px;border-radius:5px;background:${statusBg};color:${statusColor};">${lesson.status}</span>` +
            `<span style="font-size:11px;color:#888;">Lesson order: ${lesson.lesson_order}</span>`;
        preview.style.display = 'block';
        saveBtn.disabled = false;
    }

    subjectSel.addEventListener('change', () => {
        const subjectId = subjectSel.value;
        if (subjectId) {
            loadLessons(subjectId);
        } else {
            lessonSel.innerHTML = '<option value="">-- Select a subject first --</option>';
            lessonSel.disabled = true;
            preview.style.display = 'none';
            saveBtn.disabled = true;
        }
    });

    lessonSel.addEventListener('change', () => showPreview(lessonSel.value));

    // Auto-load if subject already pre-selected
    if (preSelectedSubjectId) loadLessons(preSelectedSubjectId);

    saveBtn.addEventListener('click', async () => {
        const lessonId  = lessonSel.value;
        const subjectId = subjectSel.value;
        if (!subjectId) { overlay.querySelector('#lp-alert').innerHTML = alertHtml('error', 'Please select a subject.'); return; }
        if (!lessonId)  { overlay.querySelector('#lp-alert').innerHTML = alertHtml('error', 'Please select a lesson.'); return; }

        saveBtn.disabled = true; saveBtn.textContent = 'Publishing…';

        const res = await Api.post('/LessonBankAPI.php?action=publish', {
            lessons_id: lessonId,
            visibility: 'public',
        });

        if (res.success) {
            overlay.remove();
            await loadContent();
            showToast('Material shared — preview is available in the feed.');
            if (res.bank_id) {
                const prev = await Api.get('/LessonBankAPI.php?action=get&bank_id=' + res.bank_id);
                if (prev.success) openLessonPreview(prev.data);
            }
        }
        else { saveBtn.disabled = false; saveBtn.textContent = 'Post'; overlay.querySelector('#lp-alert').innerHTML = alertHtml('error', res.message || 'Failed to publish.'); }
    });
}

function openLessonCopyModal(bankId, title) {
    const overlay = createOverlay(`
        <div class="cb-modal" style="max-width:460px;">
            <div class="cb-modal-header">
                <h3>Copy Lesson to My Class</h3>
                <button class="cb-modal-close">&times;</button>
            </div>
            <div class="cb-modal-body">
                <div id="lc-alert"></div>
                <p style="font-size:13px;color:#555;margin:0 0 16px;">Copying: <strong>${esc(title)}</strong><br><span style="color:#888;font-size:12px;">Creates an independent copy in your subject.</span></p>
                <div class="cb-form-group">
                    <label>Copy into subject *</label>
                    <select class="cb-form-select" id="lc-subject">
                        <option value="">-- Select a subject --</option>
                        ${mySubjects.map(s => `<option value="${s.subject_id}">${esc(s.subject_code)} — ${esc(s.subject_name)}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div class="cb-modal-footer">
                <button class="btn-outline-sm modal-cancel">Cancel</button>
                <button class="btn-primary-sm" id="lc-confirm">Copy Lesson</button>
            </div>
        </div>`);

    overlay.querySelector('#lc-confirm').addEventListener('click', async () => {
        const subjectId = overlay.querySelector('#lc-subject').value;
        if (!subjectId) { overlay.querySelector('#lc-alert').innerHTML = alertHtml('error', 'Please select a subject.'); return; }
        const btn = overlay.querySelector('#lc-confirm');
        btn.disabled = true; btn.textContent = 'Copying...';
        const res = await Api.post('/LessonBankAPI.php?action=copy', { bank_id: parseInt(bankId), subject_id: parseInt(subjectId) });
        if (res.success) { overlay.remove(); loadContent(); showToast('Lesson copied! Find it in your Lessons (saved as draft).'); }
        else { btn.disabled = false; btn.textContent = 'Copy Lesson'; overlay.querySelector('#lc-alert').innerHTML = alertHtml('error', res.message || 'Failed to copy.'); }
    });
}

function bankAttachmentHref(lesson) {
    if (!lesson?.attachment_path) return '#';
    if (lesson.attachment_type === 'link' || /^https?:\/\//i.test(lesson.attachment_path)) {
        return lesson.attachment_path;
    }
    return resolveMaterialUrl(lesson.attachment_path);
}

async function openLessonPreview(lesson) {
    if (!lesson?.bank_id) return;

    let data = lesson;
    const res = await Api.get('/LessonBankAPI.php?action=get&bank_id=' + lesson.bank_id);
    if (res.success && res.data) {
        data = { ...lesson, ...res.data };
    }

    const attUrl = bankAttachmentHref(data);
    const hasAtt = data.attachment_type && data.attachment_type !== 'none' && data.attachment_path;
    const attHtml = hasAtt
        ? `<div class="cb-form-group" style="margin-top:14px;">
               <label>Attachment</label>
               <a class="cb-att-preview-btn ${data.attachment_type}"
                  href="${esc(attUrl)}" target="_blank" rel="noopener">
                   ${data.attachment_type === 'file' ? L.downloadFile : L.openLink}
                   <span style="font-size:11px;opacity:.75;font-weight:400;">${esc(data.attachment_name || data.attachment_path)}</span>
               </a>
           </div>`
        : '';
    const isOwn = data.is_own == 1 || data.is_own === true;
    createOverlay(`
        <div class="cb-modal">
            <div class="cb-modal-header">
                <h3>${esc(data.lesson_title)}</h3>
                <button class="cb-modal-close">&times;</button>
            </div>
            <div class="cb-modal-body">
                <div class="cb-card-meta" style="margin-bottom:12px;">
                    ${data.subject_code ? `<span class="cb-subject-tag">${esc(data.subject_code)}</span>` : ''}
                    ${data.first_name ? `<span class="cb-meta-item">By <strong>${esc(data.first_name + ' ' + data.last_name)}</strong></span>` : ''}
                    <span class="cb-copy-badge">${icon('copy', { size: 12, className: 'ui-icon-inline' })} ${data.copy_count ?? 0} copies</span>
                </div>
                ${data.lesson_description ? `<p style="font-size:13px;color:#555;margin:0 0 14px;">${esc(data.lesson_description)}</p>` : ''}
                <div class="cb-form-group">
                    <label>Lesson Content</label>
                    <div class="cb-preview-content">${data.lesson_content ? esc(data.lesson_content) : '<em style="color:#999">No content provided.</em>'}</div>
                </div>
                ${attHtml}
            </div>
            <div class="cb-modal-footer">
                <button class="btn-outline-sm modal-cancel">Close</button>
                ${!isOwn ? `<button class="btn-primary-sm" id="prev-copy-btn">Copy to My Class</button>` : ''}
            </div>
        </div>`);
    const copyBtn = document.getElementById('prev-copy-btn');
    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            document.querySelector('.cb-overlay')?.remove();
            openLessonCopyModal(data.bank_id, data.lesson_title);
        });
    }
}

async function confirmLessonDelete(bankId) {
    if (!await notify.confirm('Remove this lesson from the bank?', { danger: true, confirmText: 'Remove' })) return;
    const res = await Api.post('/LessonBankAPI.php?action=delete', { bank_id: parseInt(bankId) });
    if (res.success) { loadContent(); showToast('Lesson removed from bank.'); }
    else notify.error(res.message || 'Failed to remove.');
}

// ─── Question Modals ──────────────────────────────────────────────────────────

function openQuestionPublishModal(_container, preSelectedSubjectId = '') {
    const myName = authorName(currentUser?.first_name, currentUser?.last_name, currentUser?.name);
    const myInitials = authorInitials(currentUser?.first_name, currentUser?.last_name, currentUser?.name);
    const overlay = createOverlay(`
        <div class="cb-modal">
            <div class="cb-modal-header">
                <h3>Create post</h3>
                <button class="cb-modal-close">&times;</button>
            </div>
            <div class="cb-modal-body">
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:18px;">
                    <div class="fb-avatar sm">${esc(myInitials)}</div>
                    <div>
                        <div style="font-size:15px;font-weight:700;color:#050505;">${esc(myName)}</div>
                        <div style="font-size:12px;color:#65676B;">Sharing a quiz question · Content Bank</div>
                    </div>
                </div>
                <div id="qp-alert"></div>
                <div class="cb-form-group">
                    <label>What's your question? *</label>
                    <textarea class="cb-textarea" id="qp-text" rows="4" placeholder="Write your question here…" style="border:none;background:#F0F2F5;font-size:15px;min-height:100px;"></textarea>
                </div>
                <div class="cb-row">
                    <div class="cb-form-group">
                        <label>Question Type</label>
                        <select class="cb-form-select" id="qp-type">
                            <option value="multiple_choice">Multiple Choice</option>
                            <option value="true_false">True / False</option>
                            <option value="short_answer">Short Answer</option>
                            <option value="essay">Essay</option>
                        </select>
                    </div>
                    <div class="cb-form-group">
                        <label>Points</label>
                        <input type="number" class="cb-input" id="qp-points" value="1" min="1" max="100">
                    </div>
                </div>
                <div class="cb-row">
                    <div class="cb-form-group">
                        <label>Subject *</label>
                        <select class="cb-form-select" id="qp-subject">
                            <option value="">-- Select Subject --</option>
                            ${mySubjects.map(s => `<option value="${s.subject_id}">${esc(s.subject_code)} — ${esc(s.subject_name)}</option>`).join('')}
                        </select>
                    </div>
                    <div class="cb-form-group">
                        <label>Visibility</label>
                        <select class="cb-form-select" id="qp-vis">
                            <option value="public">Public</option>
                            <option value="private">Private (only me)</option>
                        </select>
                    </div>
                </div>
                <div class="cb-form-group">
                    <label>Lesson <span style="font-weight:400;text-transform:none;color:#aaa;">(optional — select subject first)</span></label>
                    <select class="cb-form-select" id="qp-lesson" disabled>
                        <option value="">-- Select a lesson --</option>
                    </select>
                </div>
                <div id="qp-options-section">
                    <div class="cb-form-group">
                        <label>Answer Choices</label>
                        <p class="cb-correct-hint">Check the circle next to the correct answer(s).</p>
                        <div class="cb-options-list" id="qp-options-list"></div>
                        <button type="button" class="cb-add-option" id="qp-add-option">+ Add Option</button>
                    </div>
                </div>
            </div>
            <div class="cb-modal-footer">
                <button class="btn-outline-sm modal-cancel">Cancel</button>
                <button class="btn-primary-sm" id="qp-save">Post</button>
            </div>
        </div>`);

    // Pre-select subject if coming from a filtered browse view
    if (preSelectedSubjectId) overlay.querySelector('#qp-subject').value = preSelectedSubjectId;

    // Dynamic lesson loader
    const qpSubject = overlay.querySelector('#qp-subject');
    const qpLesson  = overlay.querySelector('#qp-lesson');

    async function loadLessonsForSubject(subjectId) {
        qpLesson.innerHTML = '<option value="">Loading…</option>';
        qpLesson.disabled = true;
        if (!subjectId) {
            qpLesson.innerHTML = '<option value="">-- Select a lesson --</option>';
            return;
        }
        const r = await Api.get('/LessonsAPI.php?action=instructor-lessons&subject_id=' + subjectId);
        const lessons = r.success ? r.data : [];
        qpLesson.innerHTML = '<option value="">-- None / General --</option>' +
            lessons.map(l => `<option value="${l.lessons_id}">${esc(l.lesson_title)}</option>`).join('');
        qpLesson.disabled = false;
    }

    qpSubject.addEventListener('change', () => loadLessonsForSubject(qpSubject.value));

    // If subject is already pre-selected, load its lessons immediately
    if (preSelectedSubjectId) loadLessonsForSubject(preSelectedSubjectId);

    // Seed options
    const optList = overlay.querySelector('#qp-options-list');
    addOptionRow(optList);
    addOptionRow(optList);

    overlay.querySelector('#qp-add-option').addEventListener('click', () => addOptionRow(optList));

    // Type change: show/hide options
    overlay.querySelector('#qp-type').addEventListener('change', e => {
        const sect = overlay.querySelector('#qp-options-section');
        if (e.target.value === 'short_answer' || e.target.value === 'essay') {
            sect.style.display = 'none';
        } else {
            sect.style.display = '';
            if (e.target.value === 'true_false') {
                optList.innerHTML = '';
                addOptionRow(optList, 'True',  true);
                addOptionRow(optList, 'False', false);
                overlay.querySelector('#qp-add-option').style.display = 'none';
            } else {
                overlay.querySelector('#qp-add-option').style.display = '';
            }
        }
    });

    overlay.querySelector('#qp-save').addEventListener('click', async () => {
        const text = overlay.querySelector('#qp-text').value.trim();
        if (!text) { overlay.querySelector('#qp-alert').innerHTML = alertHtml('error', 'Question text is required.'); return; }
        const subjectId = overlay.querySelector('#qp-subject').value;
        if (!subjectId) { overlay.querySelector('#qp-alert').innerHTML = alertHtml('error', 'Please select a subject.'); return; }

        const type = overlay.querySelector('#qp-type').value;
        const options = [];
        if (type !== 'short_answer' && type !== 'essay') {
            optList.querySelectorAll('.cb-option-item').forEach(row => {
                const txt = row.querySelector('input[type=text]').value.trim();
                const correct = row.querySelector('input[type=radio],input[type=checkbox]')?.checked || false;
                if (txt) options.push({ option_text: txt, is_correct: correct ? 1 : 0 });
            });
        }

        const btn = overlay.querySelector('#qp-save');
        btn.disabled = true; btn.textContent = 'Publishing...';
        const res = await Api.post('/QuestionBankAPI.php?action=publish', {
            question_text: text,
            question_type: type,
            points:        parseInt(overlay.querySelector('#qp-points').value) || 1,
            subject_id:    overlay.querySelector('#qp-subject').value || null,
            lessons_id:    overlay.querySelector('#qp-lesson').value  || null,
            visibility:    overlay.querySelector('#qp-vis').value,
            options
        });
        if (res.success) { overlay.remove(); loadContent(); showToast('Question published to bank!'); }
        else { btn.disabled = false; btn.textContent = 'Post'; overlay.querySelector('#qp-alert').innerHTML = alertHtml('error', res.message || 'Failed to publish.'); }
    });
}

function addOptionRow(container, text = '', correct = false) {
    const item = document.createElement('div');
    item.className = 'cb-option-item';
    item.innerHTML = `
        <input type="radio" name="qp-correct" class="cb-option-correct" ${correct ? 'checked' : ''}>
        <input type="text" placeholder="Option text..." value="${esc(text)}">
        <button type="button" class="cb-option-del" title="Remove">&times;</button>
    `;
    item.querySelector('.cb-option-del').addEventListener('click', () => item.remove());
    container.appendChild(item);
}

function openQuestionCopyModal(qbankId, questionText) {
    if (!myQuizzes.length) {
        notify.warning('You have no quizzes yet. Create a quiz first, then copy questions into it.');
        return;
    }
    const overlay = createOverlay(`
        <div class="cb-modal" style="max-width:460px;">
            <div class="cb-modal-header">
                <h3>Copy Question to Quiz</h3>
                <button class="cb-modal-close">&times;</button>
            </div>
            <div class="cb-modal-body">
                <div id="qc-alert"></div>
                <p style="font-size:13px;color:#555;margin:0 0 16px;"><strong>${esc(questionText.length > 80 ? questionText.slice(0,80) + '…' : questionText)}</strong><br><span style="color:#888;font-size:12px;">Creates an independent copy in your quiz.</span></p>
                <div class="cb-form-group">
                    <label>Copy into quiz *</label>
                    <select class="cb-form-select" id="qc-quiz">
                        <option value="">-- Select a quiz --</option>
                        ${myQuizzes.map(q => `<option value="${q.quiz_id}">${esc(q.quiz_title)}${q.subject_code ? ' (' + esc(q.subject_code) + ')' : ''}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div class="cb-modal-footer">
                <button class="btn-outline-sm modal-cancel">Cancel</button>
                <button class="btn-primary-sm" id="qc-confirm">Copy Question</button>
            </div>
        </div>`);

    overlay.querySelector('#qc-confirm').addEventListener('click', async () => {
        const quizId = overlay.querySelector('#qc-quiz').value;
        if (!quizId) { overlay.querySelector('#qc-alert').innerHTML = alertHtml('error', 'Please select a quiz.'); return; }
        const btn = overlay.querySelector('#qc-confirm');
        btn.disabled = true; btn.textContent = 'Copying...';
        const res = await Api.post('/QuestionBankAPI.php?action=copy', { qbank_id: parseInt(qbankId), quiz_id: parseInt(quizId) });
        if (res.success) { overlay.remove(); loadContent(); showToast('Question copied to your quiz!'); }
        else { btn.disabled = false; btn.textContent = 'Copy Question'; overlay.querySelector('#qc-alert').innerHTML = alertHtml('error', res.message || 'Failed to copy.'); }
    });
}

async function confirmQuestionDelete(qbankId) {
    if (!await notify.confirm('Remove this question from the bank?', { danger: true, confirmText: 'Remove' })) return;
    const res = await Api.post('/QuestionBankAPI.php?action=delete', { qbank_id: parseInt(qbankId) });
    if (res.success) { loadContent(); showToast('Question removed from bank.'); }
    else notify.error(res.message || 'Failed to remove.');
}

function openGroupCopyModal(qbankIds, groupLabel) {
    if (!myQuizzes.length) {
        notify.warning('You have no quizzes yet. Create a quiz first, then copy questions into it.');
        return;
    }
    const overlay = createOverlay(`
        <div class="cb-modal" style="max-width:460px;">
            <div class="cb-modal-header">
                <h3>Copy All Questions to Quiz</h3>
                <button class="cb-modal-close">&times;</button>
            </div>
            <div class="cb-modal-body">
                <div id="gca-alert"></div>
                <p style="font-size:13px;color:#555;margin:0 0 16px;">
                    Copying <strong>${qbankIds.length} question${qbankIds.length !== 1 ? 's' : ''}</strong> from <strong>${esc(groupLabel)}</strong> into your quiz.<br>
                    <span style="color:#888;font-size:12px;">Each becomes an independent copy you can edit freely.</span>
                </p>
                <div class="cb-form-group">
                    <label>Copy into quiz *</label>
                    <select class="cb-form-select" id="gca-quiz">
                        <option value="">-- Select a quiz --</option>
                        ${myQuizzes.map(q => `<option value="${q.quiz_id}">${esc(q.quiz_title)}${q.subject_code ? ' (' + esc(q.subject_code) + ')' : ''}</option>`).join('')}
                    </select>
                </div>
                <div id="gca-progress" style="display:none;margin-top:12px;">
                    <div style="font-size:12px;color:#555;margin-bottom:6px;" id="gca-progress-text">Copying...</div>
                    <div style="background:#e8e8e8;border-radius:4px;height:6px;overflow:hidden;">
                        <div id="gca-progress-bar" style="height:100%;background:${G};width:0%;transition:width .2s;"></div>
                    </div>
                </div>
            </div>
            <div class="cb-modal-footer">
                <button class="btn-outline-sm modal-cancel">Cancel</button>
                <button class="btn-primary-sm" id="gca-confirm">Copy All</button>
            </div>
        </div>`);

    overlay.querySelector('#gca-confirm').addEventListener('click', async () => {
        const quizId = overlay.querySelector('#gca-quiz').value;
        if (!quizId) {
            overlay.querySelector('#gca-alert').innerHTML = alertHtml('error', 'Please select a quiz.');
            return;
        }

        const confirmBtn = overlay.querySelector('#gca-confirm');
        const cancelBtn  = overlay.querySelector('.modal-cancel');
        confirmBtn.disabled = true;
        cancelBtn.disabled  = true;
        overlay.querySelector('#gca-progress').style.display = 'block';

        let copied = 0;
        let failed = 0;
        const bar  = overlay.querySelector('#gca-progress-bar');
        const txt  = overlay.querySelector('#gca-progress-text');

        for (let i = 0; i < qbankIds.length; i++) {
            txt.textContent = `Copying ${i + 1} of ${qbankIds.length}...`;
            bar.style.width = `${Math.round(((i + 1) / qbankIds.length) * 100)}%`;

            const res = await Api.post('/QuestionBankAPI.php?action=copy', {
                qbank_id: parseInt(qbankIds[i]),
                quiz_id:  parseInt(quizId)
            });
            if (res.success) copied++; else failed++;
        }

        overlay.remove();
        loadContent();
        if (failed === 0) {
            showToast(`${icon('checkCircle', inl)} ${copied} question${copied !== 1 ? 's' : ''} copied to your quiz!`);
        } else {
            showToast(`Copied ${copied}, failed ${failed}. Some questions may already exist.`);
        }
    });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function refreshSubjectDropdown(subjects) {
    const sel = document.getElementById('cb-subject');
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML = '<option value="">All Subjects</option>' +
        subjects.map(s => `<option value="${s.subject_id}" ${current == s.subject_id ? 'selected' : ''}>${esc(s.subject_code)} — ${esc(s.subject_name)}</option>`).join('');
}

function createOverlay(html) {
    const overlay = document.createElement('div');
    overlay.className = 'cb-overlay';
    overlay.innerHTML = html;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector('.cb-modal-close')?.addEventListener('click', close);
    overlay.querySelector('.modal-cancel')?.addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    return overlay;
}

function emptyHtml(iconName, title, msg) {
    return `<div class="cb-empty"><div>${iconLg(iconName)}</div><h3>${title}</h3><p>${msg}</p></div>`;
}

function authorName(first, last, fallback = 'Instructor') {
    const n = `${first || ''} ${last || ''}`.trim();
    return n || fallback;
}

function authorInitials(first, last, fullName) {
    if (first || last) {
        return ((first?.[0] || '') + (last?.[0] || '')).toUpperCase() || 'IN';
    }
    if (fullName) {
        const parts = fullName.trim().split(/\s+/);
        return ((parts[0]?.[0] || '') + (parts[parts.length - 1]?.[0] || '')).toUpperCase() || 'IN';
    }
    return 'IN';
}

function timeAgo(dateStr) {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function showToast(msg) {
    const t = document.createElement('div');
    t.style.cssText = `position:fixed;bottom:24px;right:24px;background:${G};color:#fff;padding:12px 20px;border-radius:10px;font-size:13px;font-weight:600;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,.2);animation:cbIn .2s ease-out`;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3500);
}

function alertHtml(type, msg) {
    const s = type === 'error'
        ? 'background:#FEE2E2;color:#991b1b;'
        : 'background:#d1fae5;color:#065f46;';
    return `<div style="${s}padding:12px 14px;border-radius:8px;font-size:13px;margin-bottom:14px;font-weight:600;">${esc(msg)}</div>`;
}

function esc(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
}
