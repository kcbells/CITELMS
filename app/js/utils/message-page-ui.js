/**
 * Shared Messages page layout & styles (student + instructor)
 */
import { icon, iconLg } from './icons.js';

const G  = '#00461B';
const G2 = '#006428';
const GL = '#E8F5EC';
const BORDER = '#E5E7EB';

const inl = { size: 14, className: 'ui-icon-inline' };

export function messagePageStyles() {
    return `
        .msg-page { width:100%; min-height:calc(100vh - 120px); background:#fff; }
        .msg-hero {
            display:flex; align-items:flex-start; justify-content:space-between;
            gap:16px; flex-wrap:wrap;
            padding:24px 28px; margin-bottom:20px;
            background:${G};
            border-radius:16px; color:#fff;
            box-shadow:0 2px 10px rgba(0,70,27,.1);
        }
        .msg-hero-label {
            font-size:11px; font-weight:700; text-transform:uppercase;
            letter-spacing:1.2px; opacity:.75; margin:0 0 6px;
        }
        .msg-hero-title { font-size:26px; font-weight:800; margin:0 0 6px; letter-spacing:-.4px; }
        .msg-hero-sub { font-size:14px; opacity:.9; margin:0; max-width:480px; line-height:1.5; }
        .msg-hero-stat {
            display:flex; align-items:center; gap:8px;
            padding:10px 16px; background:rgba(255,255,255,.12);
            border:1px solid rgba(255,255,255,.2); border-radius:12px;
            font-size:13px; font-weight:600;
        }
        .msg-hero-stat svg { opacity:.9; }

        .msg-layout {
            display:flex; height:calc(100vh - 260px); min-height:520px;
            border:1px solid ${BORDER}; border-radius:16px; overflow:hidden;
            background:#fff;
            box-shadow:0 4px 24px rgba(0,70,27,.08);
        }

        .msg-sidebar {
            width:320px; min-width:280px;
            display:flex; flex-direction:column;
            background:#FAFAFA; border-right:1px solid ${BORDER};
        }
        .msg-sidebar-header { padding:18px 16px 12px; }
        .msg-sidebar-header h2 {
            font-size:15px; font-weight:800; color:#111; margin:0 0 12px;
            display:flex; align-items:center; gap:8px;
        }
        .msg-search-wrap {
            position:relative; margin-bottom:12px;
        }
        .msg-search-wrap svg {
            position:absolute; left:12px; top:50%; transform:translateY(-50%);
            color:#9CA3AF; pointer-events:none;
        }
        .msg-search {
            width:100%; padding:10px 12px 10px 36px;
            border:1px solid ${BORDER}; border-radius:10px;
            font-size:13px; background:#fff; outline:none;
            transition:border-color .15s, box-shadow .15s;
        }
        .msg-search:focus {
            border-color:${G}; box-shadow:0 0 0 3px rgba(0,70,27,.1);
        }
        .msg-new-btn {
            display:flex; align-items:center; justify-content:center; gap:8px;
            width:100%; padding:11px 14px; border-radius:10px;
            background:${G}; color:#fff; border:none;
            font-size:13px; font-weight:700; cursor:pointer; font-family:inherit;
            box-shadow:0 2px 8px rgba(0,70,27,.25);
            transition:transform .15s, background .15s, box-shadow .15s;
        }
        .msg-new-btn:hover {
            background:${G2}; transform:translateY(-1px);
            box-shadow:0 4px 12px rgba(0,70,27,.3);
        }

        .thread-list {
            flex:1; overflow-y:auto; padding:8px 10px 12px;
            display:flex; flex-direction:column; gap:6px;
        }
        .thread-item {
            display:flex; align-items:flex-start; gap:12px;
            padding:12px 14px; cursor:pointer; border-radius:12px;
            border:1px solid transparent; background:#fff;
            transition:background .15s, border-color .15s, box-shadow .15s;
        }
        .thread-item:hover {
            border-color:#C5D9CB; box-shadow:0 2px 8px rgba(0,70,27,.06);
        }
        .thread-item.active {
            background:${GL}; border-color:${G};
            box-shadow:0 2px 10px rgba(0,70,27,.1);
        }
        .thread-avatar {
            width:44px; height:44px; border-radius:50%;
            background:${G};
            color:#fff; font-size:14px; font-weight:800;
            display:flex; align-items:center; justify-content:center;
            flex-shrink:0; box-shadow:0 2px 8px rgba(0,70,27,.2);
            border:2px solid #fff;
        }
        .thread-info { flex:1; min-width:0; padding-top:2px; }
        .thread-name { font-size:14px; font-weight:700; color:#111; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .thread-preview { font-size:12px; color:#6B7280; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-top:3px; }
        .thread-meta { display:flex; flex-direction:column; align-items:flex-end; gap:6px; flex-shrink:0; }
        .thread-time { font-size:10px; font-weight:600; color:#9CA3AF; }
        .thread-badge {
            background:${G}; color:#fff; font-size:10px; font-weight:800;
            padding:3px 8px; border-radius:20px; min-width:20px; text-align:center;
            box-shadow:0 1px 4px rgba(0,70,27,.3);
        }
        .thread-empty {
            padding:32px 20px; text-align:center; color:#9CA3AF; font-size:13px;
            line-height:1.55; background:#fff; border-radius:12px;
            border:2px dashed ${BORDER}; margin:4px 0;
        }

        .msg-main { flex:1; display:flex; flex-direction:column; min-width:0; background:#F8FAF9; }
        .msg-topbar {
            padding:14px 20px; border-bottom:1px solid ${BORDER};
            display:flex; align-items:center; gap:14px; background:#fff;
            box-shadow:0 1px 4px rgba(0,0,0,.04);
        }
        .msg-topbar-avatar {
            width:42px; height:42px; border-radius:50%;
            background:${G};
            color:#fff; font-size:15px; font-weight:800;
            display:flex; align-items:center; justify-content:center; flex-shrink:0;
            box-shadow:0 2px 8px rgba(0,70,27,.2);
        }
        .msg-topbar-name { font-size:15px; font-weight:700; color:#111; }
        .msg-topbar-role {
            font-size:12px; color:${G}; font-weight:600;
            background:${GL}; display:inline-block; padding:2px 8px; border-radius:20px; margin-top:2px;
        }
        .msg-body {
            flex:1; overflow-y:auto; padding:20px 24px;
            display:flex; flex-direction:column; gap:10px;
            background:#F8FAF9;
        }
        .msg-bubble-row { display:flex; align-items:flex-end; gap:8px; }
        .msg-bubble-row.mine { justify-content:flex-end; }
        .msg-bubble-row.theirs { justify-content:flex-start; }
        .msg-bubble {
            max-width:min(72%, 420px); padding:11px 15px;
            border-radius:18px; font-size:14px; line-height:1.55;
            word-break:break-word; box-shadow:0 1px 3px rgba(0,0,0,.06);
        }
        .msg-bubble-row.mine .msg-bubble {
            background:${G};
            color:#fff; border-bottom-right-radius:6px;
        }
        .msg-bubble-row.theirs .msg-bubble {
            background:#fff; color:#111; border:1px solid ${BORDER};
            border-bottom-left-radius:6px;
        }
        .msg-time { font-size:10px; opacity:.7; margin-top:5px; display:block; text-align:right; }
        .msg-bubble-row.theirs .msg-time { text-align:left; color:#9CA3AF; }
        .msg-date-divider {
            text-align:center; font-size:11px; font-weight:600; color:#9CA3AF;
            padding:10px 0; position:relative;
        }
        .msg-date-divider span {
            background:#F0F4F2; padding:4px 14px; border-radius:20px;
            border:1px solid ${BORDER}; position:relative;
        }

        .msg-footer {
            padding:14px 18px; border-top:1px solid ${BORDER};
            display:flex; gap:10px; background:#fff; align-items:flex-end;
            box-shadow:0 -2px 12px rgba(0,0,0,.04);
        }
        .msg-compose {
            flex:1; display:flex; align-items:flex-end; gap:8px;
            padding:6px 6px 6px 14px; background:#F3F4F6;
            border-radius:24px; border:1px solid ${BORDER};
            transition:border-color .15s, box-shadow .15s;
        }
        .msg-compose:focus-within {
            border-color:${G}; background:#fff;
            box-shadow:0 0 0 3px rgba(0,70,27,.08);
        }
        .msg-input {
            flex:1; padding:8px 4px; border:none; background:transparent;
            font-size:14px; outline:none; resize:none;
            max-height:120px; line-height:1.5; font-family:inherit;
        }
        .msg-send-btn {
            width:40px; height:40px; border-radius:50%;
            background:${G}; color:#fff; border:none;
            cursor:pointer; transition:background .15s, transform .15s;
            display:flex; align-items:center; justify-content:center; flex-shrink:0;
            box-shadow:0 2px 8px rgba(0,70,27,.25);
        }
        .msg-send-btn:hover { background:${G2}; transform:scale(1.04); }
        .msg-send-btn:disabled { background:#D1D5DB; cursor:default; box-shadow:none; transform:none; }
        .msg-attach-btn {
            width:36px; height:36px; border-radius:50%;
            border:none; background:transparent; cursor:pointer;
            display:flex; align-items:center; justify-content:center; flex-shrink:0;
            color:#6B7280; transition:color .15s, background .15s;
        }
        .msg-attach-btn:hover { color:${G}; background:rgba(0,70,27,.08); }
        .msg-attach-btn svg { width:18px; height:18px; }
        .msg-att-preview {
            display:none; padding:10px 18px; background:${GL};
            border-top:1px solid #C5D9CB; font-size:12px; font-weight:600;
            align-items:center; justify-content:space-between; gap:8px; color:${G};
        }
        .msg-att-preview.visible { display:flex; }

        .msg-placeholder {
            flex:1; display:flex; flex-direction:column;
            align-items:center; justify-content:center;
            padding:48px 32px; text-align:center;
        }
        .msg-placeholder-card {
            max-width:360px; padding:40px 32px;
            background:#fff; border-radius:20px;
            border:1px solid ${BORDER};
            box-shadow:0 8px 32px rgba(0,70,27,.08);
        }
        .msg-placeholder-icon {
            width:72px; height:72px; border-radius:50%;
            background:${GL};
            border:2px solid #C5D9CB;
            display:flex; align-items:center; justify-content:center;
            margin:0 auto 18px; color:${G};
        }
        .msg-placeholder h3 { font-size:18px; font-weight:700; color:#111; margin:0 0 8px; }
        .msg-placeholder p { font-size:14px; color:#6B7280; margin:0; line-height:1.5; }

        .nc-overlay {
            position:fixed; inset:0; background:rgba(0,0,0,.45);
            backdrop-filter:blur(4px);
            display:flex; align-items:center; justify-content:center; z-index:900;
            padding:20px;
        }
        .nc-modal {
            background:#fff; border-radius:16px; width:440px; max-width:100%;
            max-height:80vh; display:flex; flex-direction:column;
            box-shadow:0 24px 64px rgba(0,0,0,.2); overflow:hidden;
        }
        .nc-header {
            padding:18px 20px;
            background:${G};
            color:#fff; display:flex; justify-content:space-between; align-items:center;
        }
        .nc-header h3 { font-size:16px; font-weight:700; margin:0; }
        .nc-close {
            background:rgba(255,255,255,.15); border:none;
            width:32px; height:32px; border-radius:50%;
            font-size:18px; cursor:pointer; color:#fff;
            display:flex; align-items:center; justify-content:center;
        }
        .nc-close:hover { background:rgba(255,255,255,.25); }
        .nc-search { padding:12px 14px; border-bottom:1px solid ${BORDER}; background:#FAFAFA; }
        .nc-search input {
            width:100%; padding:10px 12px; border:1px solid ${BORDER};
            border-radius:10px; font-size:13px; outline:none; box-sizing:border-box;
            background:#fff;
        }
        .nc-search input:focus { border-color:${G}; box-shadow:0 0 0 3px rgba(0,70,27,.1); }
        .nc-body { flex:1; overflow-y:auto; padding:12px; }
        .nc-contact {
            display:flex; align-items:center; gap:12px;
            padding:12px 14px; border-radius:12px; cursor:pointer;
            border:1px solid transparent; transition:all .15s;
        }
        .nc-contact:hover {
            background:${GL}; border-color:#C5D9CB;
        }
        .nc-avatar {
            width:42px; height:42px; border-radius:50%;
            background:${G};
            color:#fff; font-size:14px; font-weight:800;
            display:flex; align-items:center; justify-content:center;
        }
        .nc-name { font-size:14px; font-weight:700; color:#111; }
        .nc-sub  { font-size:12px; color:#6B7280; margin-top:2px; }

        @media (max-width:768px) {
            .msg-hero { padding:20px; }
            .msg-hero-title { font-size:22px; }
            .msg-layout { flex-direction:column; height:auto; min-height:0; }
            .msg-sidebar { width:100%; min-width:unset; border-right:none; border-bottom:1px solid ${BORDER}; max-height:280px; }
            .msg-main { min-height:420px; }
            .msg-hero-stat { display:none; }
        }
    `;
}

export function messagePageHeader(subtitle) {
    return `
        <header class="msg-hero">
            <div>
                <p class="msg-hero-label">Communication</p>
                <h1 class="msg-hero-title">Messages</h1>
                <p class="msg-hero-sub">${subtitle}</p>
            </div>
            <div class="msg-hero-stat">${icon('messages', inl)} Private chats</div>
        </header>`;
}

export function messageSidebarShell(newMessageLabel) {
    return `
        <div class="msg-sidebar">
            <div class="msg-sidebar-header">
                <h2>${icon('messages', inl)} Conversations</h2>
                <div class="msg-search-wrap">
                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
                    </svg>
                    <input class="msg-search" id="msg-thread-search" type="search"
                        placeholder="Search conversations…" autocomplete="off">
                </div>
                <button type="button" class="msg-new-btn" id="btn-new-chat">${newMessageLabel}</button>
            </div>
            <div class="thread-list" id="thread-list">
                <div class="thread-empty">Loading…</div>
            </div>
        </div>`;
}

export function messagePlaceholder(title, description) {
    return `
        <div class="msg-placeholder">
            <div class="msg-placeholder-card">
                <div class="msg-placeholder-icon">${iconLg('messages')}</div>
                <h3>${title}</h3>
                <p>${description}</p>
            </div>
        </div>`;
}

export function applyMessagePageBg(container) {
    container.style.background = '#fff';
    const pageContent = container.closest('.page-content');
    if (pageContent) pageContent.style.background = '#fff';
}
