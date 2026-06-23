/**
 * Theme utility — light / dark mode, scoped per logged-in user.
 * Each user account has its own preference stored in localStorage.
 * Key: lms_theme_{userId}  |  fallback key: lms_theme_guest
 */

const KEY_PREFIX  = 'lms_theme_';
const LAST_UID_KEY = 'lms_last_uid';

let _uid = null; // set once the logged-in user is known

function _key() {
    return KEY_PREFIX + (_uid || localStorage.getItem(LAST_UID_KEY) || 'guest');
}

/** Call at module load to apply the last-known user's saved theme before first paint. */
export function initTheme() {
    const saved = localStorage.getItem(_key());
    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
    _apply(saved !== null ? saved === 'dark' : prefersDark, false);
}

/**
 * Call after the user is authenticated so the theme is scoped to their account.
 * Re-reads their saved preference and applies it (or saves the current one if none).
 */
export function setThemeUser(uid) {
    _uid = uid ? String(uid) : null;
    if (_uid) localStorage.setItem(LAST_UID_KEY, _uid);
    const saved = localStorage.getItem(_key());
    if (saved !== null) {
        _apply(saved === 'dark', false);
    } else {
        _apply(isDark(), true); // persist current theme as this user's default
    }
}

export function isDark() {
    return document.body.classList.contains('dark');
}

export function toggleTheme() {
    const dark = !isDark();
    _apply(dark, true);
    return dark;
}

function _apply(dark, save) {
    document.body.classList.toggle('dark', dark);
    if (save) localStorage.setItem(_key(), dark ? 'dark' : 'light');
    _syncButtons();
}

function _syncButtons() {
    const dark = isDark();
    document.querySelectorAll('[data-theme-toggle]').forEach(btn => {
        btn.title = dark ? 'Switch to Light Mode' : 'Switch to Dark Mode';
        btn.setAttribute('aria-checked', dark ? 'true' : 'false');
    });
}

export function bindThemeToggle(btn) {
    if (!btn) return;
    _syncButtons();
    btn.addEventListener('click', () => toggleTheme());
    btn.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleTheme(); }
    });
}
