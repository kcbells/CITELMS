/**
 * Floating Join Subject panel — student only (Messenger-style)
 */
import { enrollmentFormStyles, mountEnrollmentForm } from '../utils/enrollment-ui.js';
import { icon } from '../utils/icons.js';

const G = '#00461B';
const G2 = '#006428';

let rootEl = null;
let isOpen = false;
let formApi = null;

function getEl(id) {
    return rootEl?.querySelector('#' + id) ?? null;
}

function expand(skipReset = false) {
    isOpen = true;
    rootEl?.classList.add('sef-open');
    getEl('sef-panel')?.setAttribute('aria-hidden', 'false');
    if (!skipReset) formApi?.resetForm();
}

function minimize() {
    isOpen = false;
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

function injectStyles() {
    if (document.getElementById('sef-styles')) return;
    const style = document.createElement('style');
    style.id = 'sef-styles';
    style.textContent = `
        ${enrollmentFormStyles(true)}
        body.fm-mounted #sef-root { right: 100px; }
        @media (max-width: 640px) {
            body.fm-mounted #sef-root { right: 84px; bottom: 16px; }
        }
        #sef-root {
            position: fixed; bottom: 24px; right: 24px; z-index: 950;
            font-family: inherit;
        }
        #sef-root * { box-sizing: border-box; }
        .sef-fab {
            width: 58px; height: 58px; border-radius: 50%;
            background: ${G};
            color: #fff; border: none; cursor: pointer;
            box-shadow: 0 6px 28px rgba(0,70,27,.4);
            display: flex; align-items: center; justify-content: center;
            transition: transform .2s, box-shadow .2s;
        }
        .sef-fab:hover { transform: scale(1.05); box-shadow: 0 8px 32px rgba(0,70,27,.5); }
        .sef-fab svg { width: 28px; height: 28px; }
        .sef-panel {
            position: absolute; bottom: 72px; right: 0;
            width: 360px; max-width: calc(100vw - 32px);
            background: #fff; border-radius: 16px;
            box-shadow: 0 12px 48px rgba(0,0,0,.18), 0 0 0 1px rgba(0,0,0,.06);
            display: none; flex-direction: column; overflow: hidden;
            transform-origin: bottom right;
            animation: sef-pop .22s ease;
        }
        #sef-root.sef-open .sef-panel { display: flex; }
        @keyframes sef-pop {
            from { opacity: 0; transform: scale(.92) translateY(8px); }
            to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        .sef-head {
            background: ${G};
            color: #fff; padding: 14px 16px;
            display: flex; align-items: center; justify-content: space-between;
            flex-shrink: 0;
        }
        .sef-head-title { font-size: 15px; font-weight: 700; margin: 0; }
        .sef-head-sub { font-size: 11px; opacity: .85; margin: 2px 0 0; }
        .sef-icon-btn {
            width: 32px; height: 32px; border-radius: 50%; border: none;
            background: rgba(255,255,255,.15); color: #fff; cursor: pointer;
            display: flex; align-items: center; justify-content: center;
            font-size: 18px; line-height: 1;
        }
        .sef-icon-btn:hover { background: rgba(255,255,255,.28); }
        .sef-body { padding: 18px 16px 20px; overflow-y: auto; max-height: min(420px, calc(100vh - 200px)); }
        @media (max-width: 640px) {
            #sef-root { bottom: 16px; right: 16px; }
            .sef-panel { bottom: 68px; width: calc(100vw - 32px); }
        }
    `;
    document.head.appendChild(style);
}

function bindEvents() {
    getEl('sef-fab')?.addEventListener('click', toggle);
    getEl('sef-close')?.addEventListener('click', minimize);
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
        <button type="button" class="sef-fab" id="sef-fab" aria-label="Join subject" title="Join Subject">
            ${icon('plus', { size: 28 })}
        </button>
    `;

    document.body.appendChild(rootEl);
    bindEvents();
    formApi = mountEnrollmentForm(getEl('sef-body'), { onSuccess: onEnrollSuccess });
}

export function unmountStudentEnrollFab() {
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
