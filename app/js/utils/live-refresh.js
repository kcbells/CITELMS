/**
 * Keep a page in step with the server without the person pressing refresh.
 *
 * The mechanism is a cheap "version" probe: the page asks the API for a short
 * fingerprint of everything it displays, every POLL_MS. When that fingerprint
 * changes, and only then, the page re-renders. Nothing streams and nothing is
 * pushed - one small request on a timer, which is why it works on shared
 * hosting and over a phone hotspot.
 *
 * Extracted from student/subject.js, where it worked well but was private to
 * that one page, so every other screen still needed a manual reload.
 *
 * The hard part is NOT the polling, it is not being rude about it:
 *
 *   - Only while the tab is visible. A backgrounded tab polls nothing, and
 *     checks immediately on focus so returning to the tab feels instant.
 *   - Never mid-interaction. Re-rendering while a modal is open or while
 *     someone is typing would destroy their input; the tick is skipped and
 *     retried rather than dropped.
 *   - Scroll position is restored, so a refresh does not jump the reader
 *     back to the top.
 *   - Cache-busted, because the API layer caches GETs and a stale version
 *     answer would defeat the whole point.
 *
 * Usage:
 *   const stop = watchLive({
 *       container,
 *       version: () => Api.get('...action=version&_t=' + Date.now())
 *                        .then(r => r?.success ? r.data.version : null),
 *       render: () => render(container, params),
 *   });
 *   // stop() when the view is torn down (the watcher also self-stops once
 *   // its container leaves the DOM, so forgetting is not fatal).
 */

/** Default cadence. Slow enough to be invisible in load terms, fast enough to feel live. */
export const LIVE_POLL_MS = 30_000;

/** True when re-rendering right now would yank something out from under the user. */
export function refreshWouldInterrupt() {
    if (document.querySelector(
        '.gc-modal-overlay, .mc-modal-overlay, .sc-modal-overlay, .notify-overlay, [data-modal-open]'
    )) return true;

    const el = document.activeElement;
    if (!el) return false;
    // A field that is hidden (closed panel, aria-hidden, display:none) can
    // still hold focus, especially on mobile; nobody is typing into it.
    if (el.closest('[aria-hidden="true"]') || el.getClientRects().length === 0) return false;
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable) return true;
    // An open <select> gives no focus signal on every browser, but a change
    // landing under an open dropdown is just as disruptive.
    if (el.tagName === 'SELECT') return true;
    return false;
}

// Fields the person has actually typed in / changed. A page setting a
// field's value in code (a pre-selected filter) fires no event, so it is
// never mistaken for unsaved work that would block every refresh.
const touchedFields = new WeakSet();
const markTouched = e => { if (e.target instanceof Element) touchedFields.add(e.target); };
document.addEventListener('input', markTouched, true);
document.addEventListener('change', markTouched, true);

/** The page part of the hash ("instructor/subject"), without its query. */
export function currentRouteKey() {
    return (window.location.hash || '').replace(/^#/, '').split('?')[0];
}

/**
 * Broader check for the app-wide page refresh (app.js), which runs on pages
 * that were never written with live refresh in mind — so it cannot rely on
 * each page's own modal class names. Says "wait" when the person is plainly
 * mid-task:
 *   - any full-screen overlay is up (every modal/dialog style in the app is
 *     a fixed element covering most of the viewport, whatever its class)
 *   - a form field in the page holds something they typed but did not save
 *   - audio/video is playing, or an embedded frame is on screen
 *   - they are selecting text
 */
export function pageEditingInProgress(container) {
    if (refreshWouldInterrupt()) return true;

    const vw = window.innerWidth, vh = window.innerHeight;
    for (const el of document.body.children) {
        if (el.contains(container) || /^(SCRIPT|STYLE|LINK|TEMPLATE)$/.test(el.tagName)) continue;
        const cs = getComputedStyle(el);
        if (cs.position !== 'fixed' || cs.display === 'none' || cs.visibility === 'hidden'
            || +cs.opacity === 0 || cs.pointerEvents === 'none') continue;
        const r = el.getBoundingClientRect();
        if (r.width >= vw * 0.6 && r.height >= vh * 0.6) return true;
    }

    for (const f of container.querySelectorAll('input, textarea, select')) {
        if (!touchedFields.has(f) || f.disabled || f.getClientRects().length === 0) continue;
        if (f.tagName === 'SELECT') {
            if ([...f.options].some(o => o.selected !== o.defaultSelected)) return true;
        } else if (f.type === 'checkbox' || f.type === 'radio') {
            if (f.checked !== f.defaultChecked) return true;
        } else if (f.type !== 'button' && f.type !== 'submit' && f.type !== 'hidden') {
            if (f.value !== f.defaultValue) return true;
        }
    }

    if ([...document.querySelectorAll('video, audio')].some(m => !m.paused && !m.ended)) return true;
    if ([...container.querySelectorAll('iframe')].some(f => f.getClientRects().length > 0)) return true;
    if (String(window.getSelection?.() || '').length > 0) return true;
    return false;
}

/**
 * Start watching. Returns a stop() function; calling it twice is harmless.
 *
 * @param {object}   opts
 * @param {Element}  opts.container  re-render target; when it leaves the DOM the watcher stops itself
 * @param {Function} opts.version    async () => string|number|null  (null = skip this tick)
 * @param {Function} opts.render     async () => void
 * @param {number}   [opts.intervalMs]
 * @param {Function} [opts.onRefresh] called after a successful re-render
 * @param {Function} [opts.shouldWait] extra "not now" check, on top of refreshWouldInterrupt()
 */
export function watchLive({ container, version, render, intervalMs = LIVE_POLL_MS, onRefresh, shouldWait }) {
    let timer = null;
    let current = null;
    let running = false;
    let stopped = false;
    // Pages render into the shared #page-content, which never leaves the
    // DOM — so "container disconnected" alone never fired, and a watcher from
    // a page the person had already left could re-render THAT page over the
    // one they were now on. Stop as soon as the route changes.
    const route = currentRouteKey();

    const onVisible = () => {
        if (document.visibilityState === 'visible') check();
    };

    async function check() {
        if (stopped || running) return;
        if (document.visibilityState !== 'visible') return;
        if (!container?.isConnected || currentRouteKey() !== route) return stop();

        running = true;
        try {
            const v = await version();
            if (v == null || v === current) return;

            // Deliberately do NOT adopt the new version here: leaving it
            // unchanged means the next tick retries instead of silently
            // swallowing the update the user never saw.
            if (refreshWouldInterrupt() || shouldWait?.()) return;

            current = v;
            if (!container.isConnected || currentRouteKey() !== route) return stop();

            const y = window.scrollY;
            await render();
            window.scrollTo(0, y);
            onRefresh?.();
        } catch {
            /* offline, or a hiccup - the next tick tries again */
        } finally {
            running = false;
        }
    }

    function stop() {
        if (stopped) return;
        stopped = true;
        clearInterval(timer);
        timer = null;
        document.removeEventListener('visibilitychange', onVisible);
        window.removeEventListener('focus', onVisible);
    }

    // Seed the baseline so the first tick compares against what is already
    // on screen rather than re-rendering immediately for no reason.
    Promise.resolve(version()).then(v => { if (!stopped) current = v; }).catch(() => {});

    timer = setInterval(check, intervalMs);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);

    return stop;
}

/**
 * Convenience wrapper for the common case: a GET that returns
 * { success: true, data: { version } }.
 */
export function versionFetcher(Api, url) {
    return async () => {
        const sep = url.includes('?') ? '&' : '?';
        const res = await Api.get(`${url}${sep}_t=${Date.now()}`);
        return res?.success ? (res.data?.version ?? null) : null;
    };
}
