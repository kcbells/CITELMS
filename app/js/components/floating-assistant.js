/**
 * Floating AI Assistant — free Hugging Face-powered study helper (bottom-right, left of messenger).
 */
import { Api, BASE_URL } from '../api.js';
import { Auth } from '../auth.js';
import { icon } from '../utils/icons.js';
import { isAssistantAllowed } from '../utils/quiz-guard.js';
import { getAssistantContext, onAssistantContextChange, setAssistantContext } from '../utils/assistant-context.js';
import { esc } from '../utils/classroom-ui.js';

const G  = '#00461B';
const G2 = '#006428';
const GL = '#E8F5EC';

let rootEl = null;
let isOpen = false;
let sending = false;
let history = [];
let stylesInjected = false;

// esc() now imported from classroom-ui.js — the DOM-based version there also
// correctly escapes single quotes, which this file's old regex-based copy did not.

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
            position: fixed; top: 68px; right: 24px; z-index: 955;
            font-family: inherit;
        }
        #fa-root * { box-sizing: border-box; }

        #fa-topbar-btn { position: relative; }
        #fa-topbar-btn.active { background: ${G}; color: #fff; }
        .fa-topbar-img { width: 24px; height: 24px; border-radius: 50%; object-fit: cover; display: block; }
        .fa-topbar-fallback { display: none; align-items: center; justify-content: center; }

        .fa-head-av-img {
            width: 100%; height: 100%; border-radius: 50%;
            object-fit: cover; object-position: top center; background: #fff;
        }
        .fa-head-av-fallback { display: none; align-items: center; justify-content: center; }
        .fa-head { cursor: grab; }

        .fa-panel {
            display: none; flex-direction: column;
            position: absolute; top: 0; right: 0;
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
            padding: 12px; border-top: 1px solid #e5e7eb; background: #fff;
            display: flex; gap: 8px; align-items: flex-end;
        }
        .fa-input {
            flex: 1; border: 1px solid #e5e7eb; border-radius: 12px;
            padding: 10px 12px; font-size: 14px; font-family: inherit;
            resize: none; max-height: 100px; outline: none; line-height: 1.4;
            -webkit-appearance: none; appearance: none;
        }
        .fa-input:focus { border-color: ${G}; box-shadow: 0 0 0 3px rgba(0,70,27,.08); }
        .fa-input::placeholder { color: #9ca3af; }
        .fa-send {
            min-width: 44px; min-height: 44px; width: 44px; height: 44px;
            border-radius: 12px; border: none; background: ${G}; color: #fff;
            cursor: pointer; display: flex; align-items: center; justify-content: center;
            flex-shrink: 0; transition: background .15s, transform .1s;
            -webkit-appearance: none; appearance: none;
        }
        .fa-send:disabled { opacity: .45; cursor: not-allowed; }
        .fa-send:not(:disabled):hover { background: ${G2}; }
        .fa-send:not(:disabled):active { transform: scale(0.95); }
        @supports (hover: hover) {
            .fa-send:not(:disabled):hover { background: ${G2}; }
        }
        @supports not (hover: hover) {
            .fa-send:not(:disabled):active { background: ${G2}; }
        }

        .fa-error {
            background:#7F1D1D; color:#fff; border: 1px solid #FECACA;
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
            #fa-root { top: 60px; right: 10px; }
            .fa-panel {
                width: calc(100vw - 20px); right: -4px;
                height: calc(100dvh - 80px); max-height: none;
            }
            .fa-topbar-img { width: 22px; height: 22px; }
            .fa-send {
                min-width: 48px; min-height: 48px; width: 48px; height: 48px;
            }
            .fa-input {
                padding: 12px 14px; font-size: 16px;
            }
        }
        @media (max-width: 480px) {
            #fa-root { top: 56px; right: 6px; }
            .fa-panel {
                width: calc(100vw - 12px); right: -2px;
            }
            .fa-send {
                min-width: 48px; min-height: 48px;
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

function markNavItem(on) {
    document.getElementById('fa-topbar-btn')?.classList.toggle('active', on);
}

function expand() {
    if (!isAssistantAllowed()) return;
    isOpen = true;
    markNavItem(true);
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
    markNavItem(false);
    rootEl?.classList.remove('fa-open');
    getEl('fa-panel')?.setAttribute('aria-hidden', 'true');
}

function toggle() {
    if (!isAssistantAllowed()) return;
    if (isOpen) minimize();
    else expand();
}

/**
 * Ali is opened from the sidebar entry now, not from a floating bubble.
 * Returns false when the assistant is unavailable (e.g. during a proctored quiz)
 * so the caller can leave the nav item inactive.
 */
export function toggleAssistant() {
    if (!isAssistantAllowed() || !rootEl) return false;
    toggle();
    return true;
}

export function isAssistantOpen() {
    return isOpen;
}

function bindEvents() {
    rootEl?.querySelector('.fa-minimize-btn')?.addEventListener('click', minimize);

    // Close when clicking elsewhere. Capture phase, so it still fires for topbar
    // buttons that stopPropagation() — that is what keeps only one popover open.
    document.addEventListener('click', (e) => {
        if (!isOpen) return;
        const btn = document.getElementById('fa-topbar-btn');
        if (rootEl && !rootEl.contains(e.target) && btn && !btn.contains(e.target)) {
            minimize();
        }
    }, true);

    const input = getEl('fa-input');
    const sendBtn = getEl('fa-send');

    // Auto-resize textarea
    input?.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 100) + 'px';
    });

    // Handle Enter key (Shift+Enter for new line)
    input?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // Handle send button click
    sendBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        sendMessage();
    });

    // Handle touch events for better mobile feedback
    sendBtn?.addEventListener('touchstart', (e) => {
        if (!sending && isAssistantAllowed()) {
            sendBtn.style.opacity = '0.8';
        }
    });

    sendBtn?.addEventListener('touchend', (e) => {
        sendBtn.style.opacity = '';
    });

    // Prevent zoom on input focus (iOS)
    input?.addEventListener('focus', () => {
        if (input.style.fontSize !== '16px') {
            input.style.fontSize = '16px';
        }
    });

    input?.addEventListener('blur', () => {
        input.style.fontSize = '14px';
    });
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
