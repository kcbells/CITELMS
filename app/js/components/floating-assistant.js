/**
 * Floating AI Assistant — free Groq-powered study helper (bottom-right, left of messenger).
 */
import { Api, BASE_URL } from '../api.js';
import { Auth } from '../auth.js';
import { icon } from '../utils/icons.js';
import { isAssistantAllowed } from '../utils/quiz-guard.js';
import { getAssistantContext, onAssistantContextChange, setAssistantContext } from '../utils/assistant-context.js';

const G  = '#00461B';
const G2 = '#006428';
const GL = '#E8F5EC';

let rootEl = null;
let isOpen = false;
let sending = false;
let history = [];
let stylesInjected = false;

function esc(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function getEl(id) {
    return rootEl?.querySelector('#' + id) ?? null;
}

function roleGreeting() {
    const role = Auth.user()?.role || 'student';
    const ctx = getAssistantContext();
    if (role === 'student') {
        if (ctx.work_title) {
            return `I can see you're on <strong>${esc(ctx.work_title)}</strong>. Try one of the quick actions below, or ask me anything about this lesson.`;
        }
        return 'Ask me to explain a lesson, summarize content, or clarify a concept. Highlight text in a lesson to ask about it.';
    }
    if (role === 'instructor') return 'Ask for teaching ideas, quiz tips, or topic explanations.';
    if (role === 'dean') return 'Ask about curriculum, faculty, or academic planning.';
    return 'Ask anything about using Phinmaed Learning.';
}

function renderWelcomeActions(ctx) {
    if (!ctx.lessons_id) return '';
    const title = ctx.work_title || 'this lesson';
    const actions = [
        { label: 'Summarize this lesson',  msg: `Please give me a clear, organized summary of "${title}". Cover all the important points.` },
        { label: 'Explain key concepts',   msg: `What are the key concepts and main ideas I need to understand from "${title}"? Explain each one in simple terms.` },
        { label: 'Important terms',        msg: `List and define the important terms and vocabulary from "${title}" so I can remember them.` },
        { label: 'Quiz me on this lesson', msg: `Give me 5 practice questions based on "${title}" to test my understanding. Show me the questions one at a time, starting with the first one.` },
    ];
    return `<div class="fa-quick-actions">
        <p class="fa-quick-label">Quick actions</p>
        ${actions.map(a => `<button type="button" class="fa-quick-btn" data-msg="${esc(a.msg)}">${a.label}</button>`).join('')}
    </div>`;
}

function renderContextChip() {
    const chip = getEl('fa-context-chip');
    if (!chip) return;
    const ctx = getAssistantContext();
    const label = ctx.work_title
        || (ctx.lessons_id ? 'Current lesson' : '')
        || (ctx.quiz_id ? 'Current quiz' : '');
    if (!label) {
        chip.hidden = true;
        chip.textContent = '';
        return;
    }
    chip.hidden = false;
    chip.textContent = label;
}

function injectStyles() {
    if (stylesInjected) return;
    stylesInjected = true;
    const style = document.createElement('style');
    style.id = 'fa-styles';
    style.textContent = `
        #fa-root {
            position: fixed; bottom: 24px; right: 24px; z-index: 955;
            font-family: inherit;
        }
        #fa-root * { box-sizing: border-box; }

        .fa-fab {
            width: 58px; height: 58px; border-radius: 50%;
            background: ${G};
            color: #fff; border: none; cursor: grab;
            box-shadow: 0 6px 24px rgba(0,70,27,.4);
            display: flex; align-items: center; justify-content: center;
            transition: transform .15s, box-shadow .15s;
            position: relative;
        }
        .fa-fab:hover { transform: scale(1.05); box-shadow: 0 8px 32px rgba(0,70,27,.5); }
        .fa-fab svg { width: 28px; height: 28px; pointer-events: none; }
        .fa-fab-img {
            width: 100%; height: 100%; border-radius: 50%;
            object-fit: cover; object-position: top center;
            background: #fff; pointer-events: none;
        }
        .fa-fab-fallback { display: none; align-items: center; justify-content: center; pointer-events: none; }
        .fa-head-av-img {
            width: 100%; height: 100%; border-radius: 50%;
            object-fit: cover; object-position: top center; background: #fff;
        }
        .fa-head-av-fallback { display: none; align-items: center; justify-content: center; }
        #fa-root.fa-dragging .fa-fab { cursor: grabbing; }
        .fa-head { cursor: grab; }
        #fa-root.fa-dragging .fa-head { cursor: grabbing; }

        .fa-panel {
            display: none; flex-direction: column;
            position: absolute; bottom: 72px; right: 0;
            width: 360px; max-width: calc(100vw - 32px);
            height: 480px; max-height: calc(100dvh - 120px);
            background: #fff; border-radius: 16px;
            box-shadow: 0 12px 48px rgba(0,0,0,.18);
            overflow: hidden;
            border: 1px solid #e5e7eb;
        }
        #fa-root.fa-open .fa-panel { display: flex; animation: fa-pop .2s ease; }
        @keyframes fa-pop {
            from { opacity: 0; transform: scale(.92) translateY(8px); }
            to   { opacity: 1; transform: scale(1) translateY(0); }
        }

        .fa-head {
            background: #fff;
            color: #111827; padding: 14px 16px;
            border-bottom: 1px solid #e5e7eb;
            display: flex; align-items: center; justify-content: space-between; gap: 10px;
        }
        .fa-head-left { display: flex; align-items: center; gap: 10px; min-width: 0; }
        .fa-head-av {
            width: 36px; height: 36px; border-radius: 50%;
            background: ${GL};
            display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .fa-head-av-fallback { color: ${G}; }
        .fa-head-title { font-size: 15px; font-weight: 700; margin: 0; color: #111827; }
        .fa-head-sub { font-size: 11px; opacity: .7; margin: 2px 0 0; color: #4b5563; }
        .fa-context-chip {
            display: block; margin-top: 6px; max-width: 200px;
            font-size: 10px; font-weight: 600; line-height: 1.3;
            background: ${GL}; color: ${G}; border-radius: 6px;
            padding: 4px 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .fa-context-chip[hidden] { display: none !important; }
        .fa-icon-btn {
            background: #f3f4f6; border: none; color: #374151;
            width: 32px; height: 32px; border-radius: 8px; cursor: pointer;
            font-size: 18px; line-height: 1; display: flex; align-items: center; justify-content: center;
        }
        .fa-icon-btn:hover { background: #e5e7eb; }

        .fa-body {
            flex: 1; overflow-y: auto; padding: 16px;
            display: flex; flex-direction: column; gap: 12px;
            background: #f9fafb;
        }
        .fa-welcome {
            text-align: center; padding: 24px 12px; color: #6b7280; font-size: 13px; line-height: 1.5;
        }
        .fa-welcome strong { display: block; color: ${G}; font-size: 15px; margin-bottom: 6px; }

        .fa-msg { max-width: 88%; display: flex; flex-direction: column; gap: 4px; }
        .fa-msg.user { align-self: flex-end; align-items: flex-end; }
        .fa-msg.assistant { align-self: flex-start; align-items: flex-start; }
        .fa-bubble {
            padding: 10px 14px; border-radius: 14px; font-size: 13.5px; line-height: 1.55;
            white-space: pre-wrap; word-break: break-word;
        }
        .fa-msg.user .fa-bubble { background: ${G}; color: #fff; border-bottom-right-radius: 4px; }
        .fa-msg.assistant .fa-bubble { background: #fff; color: #1f2937; border: 1px solid #e5e7eb; border-bottom-left-radius: 4px; }
        .fa-typing { display: flex; gap: 4px; padding: 12px 14px; }
        .fa-typing span {
            width: 7px; height: 7px; border-radius: 50%; background: #9ca3af;
            animation: fa-dot 1.2s infinite;
        }
        .fa-typing span:nth-child(2) { animation-delay: .2s; }
        .fa-typing span:nth-child(3) { animation-delay: .4s; }
        @keyframes fa-dot { 0%,80%,100%{opacity:.3;transform:scale(.8)} 40%{opacity:1;transform:scale(1)} }

        .fa-footer {
            padding: 10px 12px; border-top: 1px solid #e5e7eb; background: #fff;
            display: flex; gap: 8px; align-items: flex-end;
        }
        .fa-input {
            flex: 1; border: 1px solid #e5e7eb; border-radius: 12px;
            padding: 10px 12px; font-size: 14px; font-family: inherit;
            resize: none; max-height: 100px; outline: none; line-height: 1.4;
        }
        .fa-input:focus { border-color: ${G}; box-shadow: 0 0 0 3px rgba(0,70,27,.08); }
        .fa-send {
            width: 40px; height: 40px; border-radius: 12px; border: none;
            background: ${G}; color: #fff; cursor: pointer;
            display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .fa-send:disabled { opacity: .45; cursor: not-allowed; }
        .fa-send:not(:disabled):hover { background: ${G2}; }

        .fa-error {
            background: #FEF2F2; color: #b91c1c; border: 1px solid #FECACA;
            border-radius: 10px; padding: 10px 12px; font-size: 12.5px; align-self: stretch;
        }

        .fa-greeting strong { font-weight: 600; color: #1f2937; }
        .fa-quick-actions {
            padding: 4px 16px 12px;
        }
        .fa-quick-label {
            font-size: 11px; font-weight: 600; color: #9ca3af;
            text-transform: uppercase; letter-spacing: .04em;
            margin: 0 0 8px;
        }
        .fa-quick-btn {
            display: block; width: 100%;
            text-align: left; border: 1px solid #e5e7eb;
            background: #fff; border-radius: 10px;
            padding: 9px 12px; font-size: 13px; color: #1f2937;
            cursor: pointer; margin-bottom: 6px; line-height: 1.4;
            transition: border-color .15s, background .15s;
        }
        .fa-quick-btn:hover {
            border-color: ${G}; background: #f0fdf4; color: ${G};
        }
        .fa-quick-btn:last-child { margin-bottom: 0; }

        @media (max-width: 640px) {
            #fa-root { bottom: 16px; right: 16px; }
            .fa-panel {
                width: calc(100vw - 20px); right: -4px;
                height: calc(100dvh - 80px); max-height: none;
            }
        }
    `;
    document.head.appendChild(style);
}

function renderMessages() {
    const body = getEl('fa-body');
    if (!body) return;

    if (history.length === 0) {
        const ctx = getAssistantContext();
        body.innerHTML = `
            <div class="fa-welcome">
                <strong>Ali</strong>
                Here to help you learn, teach, and stay organized.<br><span class="fa-greeting">${roleGreeting()}</span>
            </div>
            ${renderWelcomeActions(ctx)}`;
        body.querySelectorAll('.fa-quick-btn').forEach(btn => {
            btn.addEventListener('click', () => sendMessage(btn.dataset.msg));
        });
        return;
    }

    body.innerHTML = history.map(turn => `
        <div class="fa-msg ${turn.role}">
            <div class="fa-bubble">${esc(turn.content)}</div>
        </div>
    `).join('');

    body.scrollTop = body.scrollHeight;
}

function showTyping() {
    const body = getEl('fa-body');
    if (!body) return;
    const el = document.createElement('div');
    el.className = 'fa-msg assistant';
    el.id = 'fa-typing';
    el.innerHTML = `<div class="fa-bubble fa-typing"><span></span><span></span><span></span></div>`;
    body.appendChild(el);
    body.scrollTop = body.scrollHeight;
}

function hideTyping() {
    document.getElementById('fa-typing')?.remove();
}

function showError(msg) {
    const body = getEl('fa-body');
    if (!body) return;
    const el = document.createElement('div');
    el.className = 'fa-error';
    el.textContent = msg;
    body.appendChild(el);
    body.scrollTop = body.scrollHeight;
}

async function sendMessage(forcedText = null) {
    if (sending || !isAssistantAllowed()) return;

    const input = getEl('fa-input');
    const text = (forcedText ?? input?.value ?? '').trim();
    if (!text) return;

    if (input && forcedText == null) {
        input.value = '';
        input.style.height = 'auto';
    }
    sending = true;
    getEl('fa-send').disabled = true;

    const ctx = getAssistantContext();
    const payloadContext = { ...ctx };
    if (!payloadContext.highlighted_text) delete payloadContext.highlighted_text;

    history.push({ role: 'user', content: text });
    renderMessages();
    showTyping();

    try {
        const res = await Api.post('/AssistantAPI.php?action=chat', {
            message: text,
            history: history.slice(0, -1),
            context: payloadContext,
        });
        hideTyping();

        if (res.success && res.data?.reply) {
            history.push({ role: 'assistant', content: res.data.reply });
            renderMessages();
        } else {
            showError(res.message || 'Could not get a response. Please try again.');
        }
    } catch (err) {
        hideTyping();
        showError(err.message || 'Network error. Please try again.');
    } finally {
        sending = false;
        getEl('fa-send').disabled = false;
        input?.focus();
    }
}

function expand() {
    if (!isAssistantAllowed()) return;
    isOpen = true;
    rootEl?.classList.add('fa-open');
    getEl('fa-panel')?.setAttribute('aria-hidden', 'false');
    renderContextChip();
    renderMessages();
    setTimeout(() => getEl('fa-input')?.focus(), 100);
}

/** Open Ali and optionally send a question (e.g. from lesson highlight). */
export async function askAli(question, extraContext = {}) {
    if (!isAssistantAllowed()) return;
    if (extraContext && Object.keys(extraContext).length) {
        setAssistantContext(extraContext);
    }
    expand();
    await sendMessage(String(question || '').trim());
}

function minimize() {
    isOpen = false;
    rootEl?.classList.remove('fa-open');
    getEl('fa-panel')?.setAttribute('aria-hidden', 'true');
}

function toggle() {
    if (!isAssistantAllowed()) return;
    if (isOpen) minimize();
    else expand();
}

const FA_POS_KEY = 'fa-pos';

function makeDraggable() {
    const fab    = rootEl.querySelector('.fa-fab');
    const header = rootEl.querySelector('.fa-head');

    let startX, startY, startLeft, startTop;
    let dragging = false;
    let moved    = false;

    function currentPos() {
        const r = rootEl.getBoundingClientRect();
        return { left: r.left, top: r.top };
    }

    function applyPos(left, top) {
        const w = rootEl.offsetWidth  || 58;
        const h = rootEl.offsetHeight || 58;
        left = Math.max(0, Math.min(window.innerWidth  - w, left));
        top  = Math.max(0, Math.min(window.innerHeight - h, top));
        rootEl.style.right  = 'auto';
        rootEl.style.bottom = 'auto';
        rootEl.style.left   = left + 'px';
        rootEl.style.top    = top  + 'px';
    }

    function onMove(e) {
        if (!dragging) return;
        const cx = e.touches ? e.touches[0].clientX : e.clientX;
        const cy = e.touches ? e.touches[0].clientY : e.clientY;
        if (Math.abs(cx - startX) > 4 || Math.abs(cy - startY) > 4) moved = true;
        if (moved) applyPos(startLeft + (cx - startX), startTop + (cy - startY));
    }

    function onUp() {
        if (!dragging) return;
        dragging = false;
        rootEl.classList.remove('fa-dragging');
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup',   onUp);
        document.removeEventListener('touchmove', onMove);
        document.removeEventListener('touchend',  onUp);

        if (moved) {
            // Swallow the upcoming click so the FAB doesn't toggle
            document.addEventListener('click', e => e.stopPropagation(), { capture: true, once: true });
            const r = rootEl.getBoundingClientRect();
            try { localStorage.setItem(FA_POS_KEY, JSON.stringify({ left: r.left, top: r.top })); } catch (_) {}
        }
    }

    function onDown(e) {
        // Let a genuinely OTHER interactive descendant (the header's minimize
        // button) work normally instead of starting a drag. This used to
        // compare against `fab` specifically, but e.target.closest('button')
        // for a click on the fab's own inner <img>/<span> always resolves to
        // the fab itself (its nearest <button> ancestor) — so that check was
        // true for every ordinary click on the icon, silently disabling
        // dragging from the fab face entirely and leaving it draggable only
        // from a sliver of the button not covered by the image. Comparing
        // against e.currentTarget (whichever element this listener is bound
        // to — the fab or the header) is correct for both cases.
        const interactive = e.target.closest('button, textarea, input, a');
        if (interactive && interactive !== e.currentTarget) return;
        const pos  = currentPos();
        startX     = e.touches ? e.touches[0].clientX : e.clientX;
        startY     = e.touches ? e.touches[0].clientY : e.clientY;
        startLeft  = pos.left;
        startTop   = pos.top;
        dragging   = true;
        moved      = false;
        rootEl.classList.add('fa-dragging');
        document.body.style.userSelect = 'none';
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup',   onUp);
        document.addEventListener('touchmove', onMove, { passive: true });
        document.addEventListener('touchend',  onUp);
    }

    fab.addEventListener('mousedown',  onDown);
    fab.addEventListener('touchstart', onDown, { passive: true });
    header?.addEventListener('mousedown',  onDown);
    header?.addEventListener('touchstart', onDown, { passive: true });

    // Restore saved position
    try {
        const saved = JSON.parse(localStorage.getItem(FA_POS_KEY) || 'null');
        if (saved && typeof saved.left === 'number' && typeof saved.top === 'number') {
            requestAnimationFrame(() => applyPos(saved.left, saved.top));
        }
    } catch (_) {}
}

function bindEvents() {
    getEl('fa-bubble')?.addEventListener('click', toggle);
    rootEl?.querySelector('.fa-minimize-btn')?.addEventListener('click', minimize);

    const input = getEl('fa-input');
    input?.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 100) + 'px';
    });
    input?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    getEl('fa-send')?.addEventListener('click', sendMessage);
    makeDraggable();
}

export function mountFloatingAssistant() {
    if (!isAssistantAllowed()) return;
    if (rootEl) return;
    injectStyles();

    rootEl = document.createElement('div');
    rootEl.id = 'fa-root';
    rootEl.innerHTML = `
        <div class="fa-panel" id="fa-panel" aria-hidden="true">
            <div class="fa-head">
                <div class="fa-head-left">
                    <div class="fa-head-av">
                        <img src="${BASE_URL}/assets/images/assistant-ali.png" alt="" class="fa-head-av-img"
                             onerror="this.style.display='none';this.parentElement.querySelector('.fa-head-av-fallback').style.display='inline-flex'">
                        <span class="fa-head-av-fallback">${icon('robot', { size: 20 })}</span>
                    </div>
                    <div>
                        <p class="fa-head-title">Ali</p>
                        <p class="fa-head-sub">Your AI study helper</p>
                        <span class="fa-context-chip" id="fa-context-chip" hidden></span>
                    </div>
                </div>
                <button type="button" class="fa-icon-btn fa-minimize-btn" title="Minimize">&minus;</button>
            </div>
            <div class="fa-body" id="fa-body"></div>
            <div class="fa-footer">
                <textarea class="fa-input" id="fa-input" rows="1" placeholder="Ask Ali…" maxlength="2000"></textarea>
                <button type="button" class="fa-send" id="fa-send" title="Send">${icon('send', { size: 18 })}</button>
            </div>
        </div>
        <button type="button" class="fa-fab" id="fa-bubble" aria-label="Open Ali">
            <img src="${BASE_URL}/assets/images/assistant-ali.png" alt="Ali" class="fa-fab-img"
                 onerror="this.style.display='none';this.parentElement.querySelector('.fa-fab-fallback').style.display='flex'">
            <span class="fa-fab-fallback">${icon('robot', { size: 28 })}</span>
        </button>
    `;

    document.body.appendChild(rootEl);
    bindEvents();
    renderContextChip();
    renderMessages();
    onAssistantContextChange(() => {
        renderContextChip();
        if (isOpen && history.length === 0) renderMessages();
    });
}

export function unmountFloatingAssistant() {
    minimize();
    rootEl?.remove();
    rootEl = null;
    history = [];
    sending = false;
}
