/**
 * Camera / microphone access for the online class.
 *
 * WHY THIS WAS REWRITTEN
 * ----------------------
 * Joining a class used to call getUserMedia THREE times: once for video alone
 * (to "check" the camera permission), once for audio alone, then a third time
 * for both to get the stream actually used. Every call is a separate
 * permission gesture, so the browser could prompt up to three times and the
 * camera light blinked three times before the first frame appeared.
 *
 * It also gated on navigator.permissions.query({name:'camera'}), which
 * Firefox does not implement for camera/microphone. There it threw, the catch
 * showed a "Camera Error" dialog, and the user saw a failure message for a
 * camera that worked perfectly.
 *
 * Now: ONE getUserMedia call for both tracks, one prompt, and the live stream
 * is handed back to the caller so nothing has to ask twice. The Permissions
 * API is only consulted as an optional hint, never as a gate.
 */

/** Same constraints the player used inline, kept in one place. */
const VIDEO_CONSTRAINTS = { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } };

/**
 * Why access failed, as a stable string the caller can branch on:
 *   'insecure'   - not an https:// (or localhost) page, so the API is absent
 *   'unsupported'- secure, but the browser has no getUserMedia at all
 *   'denied'     - the person (or a policy) refused
 *   'notfound'   - no such device attached
 *   'busy'       - device exists but another app holds it
 *   'constraint' - device exists but cannot satisfy the requested settings
 *   'unknown'
 */
function classify(err) {
    switch (err?.name) {
        case 'NotAllowedError':
        case 'PermissionDeniedError':   return 'denied';
        case 'NotFoundError':
        case 'DevicesNotFoundError':    return 'notfound';
        case 'NotReadableError':
        case 'TrackStartError':         return 'busy';
        case 'OverconstrainedError':
        case 'ConstraintNotSatisfiedError': return 'constraint';
        case 'SecurityError':           return 'insecure';
        default:                        return 'unknown';
    }
}

/** A sentence the person can act on, rather than a raw DOMException name. */
function describe(reason, what = 'Camera and microphone') {
    switch (reason) {
        case 'insecure':
            return `${what} need a secure connection. This page is open over `
                 + `${location.protocol}//${location.host} — reopen it using https:// (or on localhost) and join again.`;
        case 'unsupported':
            return `This browser cannot access your ${what.toLowerCase()}. Try Chrome, Edge or Firefox.`;
        case 'denied':
            return `${what} access was blocked. Click the padlock in the address bar, set Camera and Microphone to Allow, then rejoin.`;
        case 'notfound':
            return `No ${what.toLowerCase()} was found on this device. Connect one and rejoin.`;
        case 'busy':
            return `Your ${what.toLowerCase()} is already in use by another app (Zoom, Teams, Meet, another tab). Close it and rejoin.`;
        case 'constraint':
            return `Your ${what.toLowerCase()} does not support the required settings.`;
        default:
            return `Could not access your ${what.toLowerCase()}. Check it is connected and not in use, then rejoin.`;
    }
}

/**
 * Ask once for camera + microphone and return the live stream.
 *
 * Falls back to audio-only when the camera specifically fails but the
 * microphone still works — being heard in class matters more than being
 * seen, and a missing webcam should not block the join outright.
 *
 * @returns {Promise<{stream: MediaStream|null, video: boolean, audio: boolean,
 *                    reason: string|null, message: string|null}>}
 */
export async function acquireClassMedia({ video = true, audio = true } = {}) {
    if (!navigator.mediaDevices?.getUserMedia) {
        // Plain http:// on a LAN/hotspot IP is not a secure context, so
        // navigator.mediaDevices is undefined however capable the browser is.
        const reason = window.isSecureContext ? 'unsupported' : 'insecure';
        return { stream: null, video: false, audio: false, reason, message: describe(reason) };
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: video ? VIDEO_CONSTRAINTS : false,
            audio,
        });
        return {
            stream,
            video: stream.getVideoTracks().length > 0,
            audio: stream.getAudioTracks().length > 0,
            reason: null,
            message: null,
        };
    } catch (err) {
        const reason = classify(err);

        // Retry without video when the camera looks like the sole problem.
        // 'denied' is excluded: a refusal usually covers both, and retrying
        // would fire a second prompt straight after the person said no.
        if (video && audio && reason !== 'denied' && reason !== 'insecure') {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                return {
                    stream,
                    video: false,
                    audio: stream.getAudioTracks().length > 0,
                    reason: `camera-${reason}`,
                    message: describe(reason, 'Camera') + ' Joining with audio only.',
                };
            } catch {
                /* fall through and report the original failure */
            }
        }

        return { stream: null, video: false, audio: false, reason, message: describe(reason) };
    }
}

/**
 * Back-compatible boolean wrapper.
 *
 * Prefer acquireClassMedia(): this one throws the stream away, so whoever
 * calls it has to open the devices a second time — the exact duplicate-prompt
 * problem this module was rewritten to remove.
 */
export async function requestMediaPermissions() {
    const res = await acquireClassMedia();
    res.stream?.getTracks().forEach(t => t.stop());
    if (!res.stream) showMediaDialog('Cannot start video', `<p>${escapeHtml(res.message)}</p>`, 'error');
    return !!res.stream;
}

/** Optional hint only — never gate on this; Firefox has no camera/mic support here. */
export async function checkPermissionState(name) {
    try {
        if (!navigator.permissions?.query) return 'unknown';
        const res = await navigator.permissions.query({ name });
        return res.state;                       // 'granted' | 'denied' | 'prompt'
    } catch {
        return 'unknown';                       // unsupported query name, etc.
    }
}

export async function isCameraAvailable()     { return hasDevice('videoinput'); }
export async function isMicrophoneAvailable() { return hasDevice('audioinput'); }

async function hasDevice(kind) {
    try {
        if (!navigator.mediaDevices?.enumerateDevices) return false;
        const devices = await navigator.mediaDevices.enumerateDevices();
        return devices.some(d => d.kind === kind);
    } catch {
        return false;
    }
}

function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}

/**
 * Explain a failure and tell the person what to change.
 * Exported so the player can show it without re-deriving the wording.
 */
export function showMediaHelpDialog(reason, message) {
    const steps = reason === 'denied'
        ? `<p style="margin:12px 0 6px;"><strong>To allow it:</strong></p>
           <ol style="text-align:left;padding-left:20px;margin:0;">
             <li>Click the padlock (or camera icon) in the address bar</li>
             <li>Set <strong>Camera</strong> and <strong>Microphone</strong> to <strong>Allow</strong></li>
             <li>Reload the page and rejoin the class</li>
           </ol>`
        : '';
    showMediaDialog('Cannot start video', `<p>${escapeHtml(message)}</p>${steps}`, 'error');
}

/** Modal used by the helpers above. */
function showMediaDialog(title, message, type = 'info') {
    const dialog = document.createElement('div');
    dialog.style.cssText = `
        position: fixed; inset: 0; z-index: 9999;
        background: rgba(0,0,0,0.5);
        display: flex; align-items: center; justify-content: center;
        padding: 20px;
    `;

    const card = document.createElement('div');
    card.style.cssText = `
        background: white; border-radius: 12px;
        max-width: 400px; width: 100%;
        padding: 24px; box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        animation: slideUp 0.3s ease;
    `;

    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideUp {
            from { opacity: 0; transform: translateY(20px); }
            to   { opacity: 1; transform: translateY(0); }
        }
    `;
    document.head.appendChild(style);

    const iconColor = type === 'error' ? '#dc2626' : '#0891b2';
    const iconSvg = type === 'error'
        ? '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
        : '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';

    card.innerHTML = `
        <div style="display: flex; gap: 16px; margin-bottom: 16px;">
            <div style="color: ${iconColor}; flex-shrink: 0;">${iconSvg}</div>
            <h3 style="margin: 0; font-size: 16px; font-weight: 600; color: #111827;">${escapeHtml(title)}</h3>
        </div>
        <div style="color: #4b5563; font-size: 14px; line-height: 1.6; margin-bottom: 20px;">
            ${message}
        </div>
        <button id="media-dialog-close" style="
            width: 100%; padding: 10px 16px;
            background: #00461B; color: white;
            border: none; border-radius: 6px;
            font-size: 14px; font-weight: 600;
            cursor: pointer; transition: background 0.2s;
        ">OK</button>
    `;

    card.querySelector('#media-dialog-close').addEventListener('click', () => {
        dialog.remove();
        style.remove();
    });

    dialog.appendChild(card);
    document.body.appendChild(dialog);
}

/**
 * Kept for callers that used it. There is no permission cache any more - the
 * stale cache was itself a bug: once a person hit Block, the old module
 * remembered `false` for the rest of the session, so granting access and
 * trying again still failed until a full reload.
 */
export function clearPermissionCache() { /* no-op: nothing is cached */ }
