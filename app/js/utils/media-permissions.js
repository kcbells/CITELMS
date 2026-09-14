/**
 * Media Permissions Handler
 * Handles requesting and checking camera/microphone permissions
 */

const PERMISSION_CACHE = new Map();

/**
 * Request camera permission
 * @returns {Promise<boolean>} true if permission granted
 */
export async function requestCameraPermission() {
    try {
        const cached = PERMISSION_CACHE.get('camera');
        if (cached !== undefined) return cached;

        const result = await navigator.permissions.query({ name: 'camera' });
        if (result.state === 'granted') {
            PERMISSION_CACHE.set('camera', true);
            return true;
        }

        if (result.state === 'denied') {
            PERMISSION_CACHE.set('camera', false);
            showPermissionDeniedDialog('Camera');
            return false;
        }

        // prompt state - ask user
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach(track => track.stop());
        PERMISSION_CACHE.set('camera', true);
        return true;
    } catch (err) {
        PERMISSION_CACHE.set('camera', false);
        showPermissionErrorDialog('Camera', err.message);
        return false;
    }
}

/**
 * Request microphone permission
 * @returns {Promise<boolean>} true if permission granted
 */
export async function requestMicrophonePermission() {
    try {
        const cached = PERMISSION_CACHE.get('microphone');
        if (cached !== undefined) return cached;

        const result = await navigator.permissions.query({ name: 'microphone' });
        if (result.state === 'granted') {
            PERMISSION_CACHE.set('microphone', true);
            return true;
        }

        if (result.state === 'denied') {
            PERMISSION_CACHE.set('microphone', false);
            showPermissionDeniedDialog('Microphone');
            return false;
        }

        // prompt state - ask user
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());
        PERMISSION_CACHE.set('microphone', true);
        return true;
    } catch (err) {
        PERMISSION_CACHE.set('microphone', false);
        showPermissionErrorDialog('Microphone', err.message);
        return false;
    }
}

/**
 * Request both camera and microphone permissions
 * @returns {Promise<boolean>} true if both permissions granted
 */
export async function requestMediaPermissions() {
    const cameraOK = await requestCameraPermission();
    const micOK = await requestMicrophonePermission();
    return cameraOK && micOK;
}

/**
 * Check if camera is available
 * @returns {Promise<boolean>}
 */
export async function isCameraAvailable() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        return devices.some(device => device.kind === 'videoinput');
    } catch {
        return false;
    }
}

/**
 * Check if microphone is available
 * @returns {Promise<boolean>}
 */
export async function isMicrophoneAvailable() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        return devices.some(device => device.kind === 'audioinput');
    } catch {
        return false;
    }
}

/**
 * Show permission denied dialog
 */
function showPermissionDeniedDialog(mediaType) {
    showMediaDialog(
        `${mediaType} Permission Denied`,
        `<p>Phinmaed Learning needs access to your ${mediaType.toLowerCase()} to use this feature.</p>
         <p>Please enable ${mediaType.toLowerCase()} permissions in your browser settings and try again.</p>
         <p><strong>Steps:</strong></p>
         <ol style="text-align: left; padding-left: 20px;">
            <li>Click the lock icon in the address bar</li>
            <li>Find "${mediaType}" in the permissions list</li>
            <li>Change it from "Blocked" to "Allow"</li>
            <li>Reload the page</li>
         </ol>`,
        'error'
    );
}

/**
 * Show permission error dialog
 */
function showPermissionErrorDialog(mediaType, error) {
    showMediaDialog(
        `${mediaType} Error`,
        `<p>Could not access your ${mediaType.toLowerCase()}.</p>
         <p><strong>Error:</strong> ${error}</p>
         <p>Make sure:</p>
         <ul style="text-align: left; padding-left: 20px;">
            <li>Your device has a ${mediaType.toLowerCase()} connected</li>
            <li>The ${mediaType.toLowerCase()} is not being used by another app</li>
            <li>You have given permission to access the ${mediaType.toLowerCase()}</li>
         </ul>`,
        'error'
    );
}

/**
 * Show media permission dialog
 */
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
            to { opacity: 1; transform: translateY(0); }
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
            <h3 style="margin: 0; font-size: 16px; font-weight: 600; color: #111827;">${title}</h3>
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
 * Clear permission cache (for testing or when user changes settings)
 */
export function clearPermissionCache(mediaType) {
    if (mediaType) {
        PERMISSION_CACHE.delete(mediaType);
    } else {
        PERMISSION_CACHE.clear();
    }
}
