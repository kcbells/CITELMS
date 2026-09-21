/**
 * Floating Join Subject panel — student only (Messenger-style)
 *
 * The bubble can be dragged anywhere on screen and stays where it was parked.
 * Because of that the panel can no longer be a simple bottom/right child of
 * the root — see placePanel().
 */
import { enrollmentFormStyles, mountEnrollmentForm } from '../utils/enrollment-ui.js';
import { icon } from '../utils/icons.js';

const G = '#00461B';
const G2 = '#006428';

/** Where the user parked the bubble. Survives navigation and reloads. */
const POS_KEY = 'sef_fab_pos';
/** How far the pointer must travel before a press counts as a drag, not a tap. */
const DRAG_SLOP = 6;
/** Keeps the bubble clear of the screen edges. */
const EDGE = 8;
/** Keeps the panel clear of the screen edges. */
const GUTTER = 16;
/** Space between the bubble and the panel. */
const GAP = 10;

let rootEl = null;
let isOpen = false;
let formApi = null;
let drag = null;
let suppressClick = false;
let panelObserver = null;
let rafId = 0;

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi));

function getEl(id) {
    return rootEl?.querySelector('#' + id) ?? null;
}

function expand(skipReset = false) {
    isOpen = true;
    rootEl?.classList.add('sef-open');
    getEl('sef-panel')?.setAttribute('aria-hidden', 'false');
    if (!skipReset) formApi?.resetForm();
    placePanel();
}

function minimize() {
    isOpen = false;
    // Drop focus from the code input as the panel closes. On phones the
    // keyboard's Go/Enter submits while the input is still focused, and a
    // focused input makes the live refresh (utils/live-refresh.js) hold off
    // as if the student were still typing -- so the approval never showed.
    const focused = document.activeElement;
    if (focused && rootEl?.contains(focused)) focused.blur();
    rootEl?.classList.remove('sef-open');
    getEl('sef-panel')?.setAttribute('aria-hidden', 'true');
}

function toggle() {
    if (isOpen) minimize();
    else expand();
}

function onEnrollSuccess() {
    minimize();
    const hash = window.location.hash.replace('#', '');
    if (hash.startsWith('student/my-subjects')) {
        window.dispatchEvent(new CustomEvent('student-subjects-refresh'));
    } else {
        window.location.hash = '#student/my-subjects';
    }
}

/* ── Panel placement ─────────────────────────────────────────────────────────
 * The panel used to hang off the root at `bottom: 72px; right: 0`, which only
 * ever works while the root is pinned to the bottom-right corner. Now that the
 * bubble can be parked anywhere, the panel is positioned in viewport
 * coordinates instead: it sits above the bubble when there is room and drops
 * below it when there is not, and both axes are clamped so no edge can leave
 * the screen. The CSS keeps a sane corner default for the moment before this
 * first runs.
 * ─────────────────────────────────────────────────────────────────────────── */
function placePanel() {
    const panel = getEl('sef-panel');
    const fab = getEl('sef-fab');
    if (!panel || !fab || !isOpen) return;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const f = fab.getBoundingClientRect();

    const width = Math.min(360, vw - GUTTER * 2);
    const height = panel.offsetHeight;

    // Line the panel's right edge up with the bubble's, then pull it back on
    // screen if that pushed it past either side.
    const left = clamp(f.right - width, GUTTER, vw - width - GUTTER);

    const above = f.top - GAP - height;
    const below = f.bottom + GAP;
    const openDown = above < GUTTER && below + height <= vh - GUTTER;
    const top = clamp(openDown ? below : above, GUTTER, vh - height - GUTTER);

    panel.style.position = 'fixed';
    panel.style.left = left + 'px';
    panel.style.top = top + 'px';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    panel.style.width = width + 'px';
    panel.style.maxWidth = 'none';
    // Make the pop animation grow out of the bubble wherever it happens to be.
    panel.style.transformOrigin =
        (f.left + f.width / 2 - left) + 'px ' + (openDown ? 0 : height) + 'px';
}

/* ── Dragging ─────────────────────────────────────────────────────────────── */

/** Move the bubble, keeping it fully on screen. */
function moveTo(x, y) {
    const fab = getEl('sef-fab');
    if (!rootEl || !fab) return;
    // The panel is position:fixed, so the root's box is just the bubble's.
    const w = fab.offsetWidth;
    const h = fab.offsetHeight;
    rootEl.style.left = clamp(x, EDGE, window.innerWidth - w - EDGE) + 'px';
    rootEl.style.top = clamp(y, EDGE, window.innerHeight - h - EDGE) + 'px';
    rootEl.style.right = 'auto';
    rootEl.style.bottom = 'auto';
}

function savePos() {
    if (!rootEl) return;
    try {
        const r = rootEl.getBoundingClientRect();
        localStorage.setItem(POS_KEY, JSON.stringify({ x: r.left, y: r.top }));
    } catch { /* storage blocked (private mode) — the spot just will not persist */ }
}

function restorePos() {
    let saved = null;
    try {
        saved = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
    } catch { /* ignore */ }
    if (typeof saved?.x !== 'number' || typeof saved?.y !== 'number') return;
    moveTo(saved.x, saved.y);
}

function onPointerDown(e) {
    if (e.button > 0) return;
    const fab = getEl('sef-fab');
    if (!fab) return;
    // Clear any flag left over from a drag whose click never arrived, so a
    // stale suppression cannot eat this gesture's tap.
    suppressClick = false;
    const r = fab.getBoundingClientRect();
    drag = {
        id: e.pointerId,
        offX: e.clientX - r.left,
        offY: e.clientY - r.top,
        x0: e.clientX,
        y0: e.clientY,
        x: r.left,
        y: r.top,
        moved: false,
    };
    fab.setPointerCapture?.(e.pointerId);
}

function onPointerMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < DRAG_SLOP) return;
    if (!drag.moved) {
        drag.moved = true;
        rootEl?.classList.add('sef-dragging');
    }
    drag.x = e.clientX - drag.offX;
    drag.y = e.clientY - drag.offY;
    // Coalesce pointermove bursts into one write per frame.
    if (!rafId) {
        rafId = requestAnimationFrame(() => {
            rafId = 0;
            if (!drag) return;
            moveTo(drag.x, drag.y);
            placePanel();
        });
    }
}

function endDrag(e, cancelled = false) {
    if (!drag || e.pointerId !== drag.id) return;
    getEl('sef-fab')?.releasePointerCapture?.(e.pointerId);
    if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
    }
    if (drag.moved) {
        moveTo(drag.x, drag.y);
        placePanel();
        savePos();
        // A click fires right after the drag ends; swallow it so parking the
        // bubble does not also open the panel.
        if (!cancelled) suppressClick = true;
    }
    rootEl?.classList.remove('sef-dragging');
    drag = null;
}

function onFabClick() {
    if (suppressClick) {
        suppressClick = false;
        return;
    }
    toggle();
}

function onWindowResize() {
    // Only re-clamp if the bubble has actually been dragged; otherwise the CSS
    // corner default is still in charge and should stay that way.
    if (rootEl?.style.left) {
        const r = rootEl.getBoundingClientRect();
        moveTo(r.left, r.top);
    }
    placePanel();
}

function injectStyles() {
    if (document.getElementById('sef-styles')) return;
    const style = document.createElement('style');
    style.id = 'sef-styles';
    style.textContent = `
        ${enrollmentFormStyles(true)}
        #sef-root {
            position: fixed; bottom: 24px; right: 96px; z-index: 950;
            font-family: inherit;
        }
        #sef-root * { box-sizing: border-box; }
        .sef-fab {
            width: 58px; height: 58px; border-radius: 50%;
            background: #fff;
            color: #111; border: 2px solid #111; cursor: pointer;
            box-shadow: 0 6px 28px rgba(0,0,0,.18);
            display: flex; align-items: center; justify-content: center;
            transition: transform .2s, box-shadow .2s;
            /* Without this the browser claims the touch for scrolling and no
               pointermove ever reaches the drag handler. */
            touch-action: none;
            user-select: none; -webkit-user-select: none;
            -webkit-tap-highlight-color: transparent;
        }
        .sef-fab:hover { transform: scale(1.05); box-shadow: 0 8px 32px rgba(0,0,0,.24); }
        .sef-fab svg { width: 28px; height: 28px; pointer-events: none; }
        #sef-root.sef-dragging .sef-fab {
            cursor: grabbing; transform: scale(1.1);
            box-shadow: 0 12px 36px rgba(0,0,0,.3);
            transition: none;
        }
        /* Corner default only — placePanel() takes over in viewport
           coordinates as soon as the panel is opened. */
        .sef-panel {
            position: fixed; bottom: 96px; right: 16px;
            width: 360px; max-width: calc(100vw - 32px);
            background: #fff; border-radius: 16px;
            box-shadow: 0 12px 48px rgba(0,0,0,.18), 0 0 0 1px rgba(0,0,0,.06);
            display: none; flex-direction: column; overflow: hidden;
            animation: sef-pop .22s ease;
        }
        #sef-root.sef-open .sef-panel { display: flex; }
        /* The panel must not jump around under the finger mid-drag. */
        #sef-root.sef-dragging .sef-panel { animation: none; }
        @keyframes sef-pop {
            from { opacity: 0; transform: scale(.92) translateY(8px); }
            to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        .sef-head {
            background: #fff; border-bottom: 1px solid #E5E7EB;
            color: #111; padding: 14px 16px;
            display: flex; align-items: center; justify-content: space-between;
            flex-shrink: 0;
        }
        .sef-head-title { font-size: 15px; font-weight: 700; margin: 0; color: #111; }
        .sef-head-sub { font-size: 11px; color: #6B7280; margin: 2px 0 0; }
        .sef-icon-btn {
            width: 32px; height: 32px; border-radius: 50%; border: none;
            background: #F3F4F6; color: #111; cursor: pointer;
            display: flex; align-items: center; justify-content: center;
            font-size: 18px; line-height: 1;
        }
        .sef-icon-btn:hover { background: #E5E7EB; }
        .sef-body { padding: 18px 16px 20px; overflow-y: auto; max-height: min(420px, calc(100vh - 200px)); }
        @media (max-width: 640px) {
            #sef-root { bottom: 16px; right: 88px; }
        }
    `;
    document.head.appendChild(style);
}

function bindEvents() {
    const fab = getEl('sef-fab');
    fab?.addEventListener('click', onFabClick);
    fab?.addEventListener('pointerdown', onPointerDown);
    fab?.addEventListener('pointermove', onPointerMove);
    fab?.addEventListener('pointerup', endDrag);
    fab?.addEventListener('pointercancel', (e) => endDrag(e, true));
    getEl('sef-close')?.addEventListener('click', minimize);
    window.addEventListener('resize', onWindowResize);

    // The panel grows and shrinks as the form moves between steps (code entry →
    // class preview → section picker); keep it anchored to the bubble as it does.
    const panel = getEl('sef-panel');
    if (panel && typeof ResizeObserver !== 'undefined') {
        panelObserver = new ResizeObserver(() => placePanel());
        panelObserver.observe(panel);
    }
}

export function mountStudentEnrollFab() {
    unmountStudentEnrollFab();
    injectStyles();

    rootEl = document.createElement('div');
    rootEl.id = 'sef-root';
    rootEl.innerHTML = `
        <div class="sef-panel" id="sef-panel" aria-hidden="true" role="dialog" aria-label="Join subject">
            <div class="sef-head">
                <div>
                    <p class="sef-head-title">Join Class</p>
                    <p class="sef-head-sub">Scan QR or enter subject code</p>
                </div>
                <button type="button" class="sef-icon-btn" id="sef-close" aria-label="Close">&times;</button>
            </div>
            <div class="sef-body enr-body" id="sef-body"></div>
        </div>
        <button type="button" class="sef-fab" id="sef-fab" aria-label="Join subject" title="Join Subject — drag to move">
            ${icon('plus', { size: 28 })}
        </button>
    `;

    document.body.appendChild(rootEl);
    bindEvents();
    restorePos();
    formApi = mountEnrollmentForm(getEl('sef-body'), { onSuccess: onEnrollSuccess });
}

export function unmountStudentEnrollFab() {
    window.removeEventListener('resize', onWindowResize);
    panelObserver?.disconnect();
    panelObserver = null;
    if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
    }
    drag = null;
    suppressClick = false;
    rootEl?.remove();
    rootEl = null;
    isOpen = false;
    formApi = null;
}

/** Open join panel from My Subjects buttons, etc. */
export function openJoinPanel() {
    if (!rootEl) mountStudentEnrollFab();
    expand();
}

/** Open join panel and prefill from QR / deep link (subject code + section). */
export function openJoinPanelWithSubject(subjectCode, sectionId = 0) {
    if (!rootEl) mountStudentEnrollFab();
    expand(true);
    formApi?.setInitialJoin?.(subjectCode, sectionId);
}

/** @deprecated use openJoinPanelWithSubject */
export function openJoinPanelWithCode(code) {
    openJoinPanelWithSubject(code, 0);
}

export function closeJoinPanel() {
    minimize();
}
