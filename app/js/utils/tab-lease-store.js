const LEASE_KEY = 'coc_tab_lease';
const BROADCAST_KEY = 'coc_active_tab_lease';

export { LEASE_KEY, BROADCAST_KEY };

/**
 * Random lease id.
 *
 * crypto.randomUUID() is gated on a *secure context*, so it only exists on
 * HTTPS and on http://localhost. Served over plain HTTP from a LAN or hotspot
 * address (http://192.168.x.x, http://10.x.x.x) it is undefined, and calling
 * it threw a TypeError inside Api._authHeaders() — i.e. on every API request.
 * The dashboard's requireLogin() read that as "not authenticated" and bounced
 * straight back to the login page, so the app was unusable on a phone while
 * working fine on the host machine.
 *
 * crypto.getRandomValues() carries no such restriction, so it is used instead;
 * Math.random is a last resort only. The value just has to be unguessable
 * enough to distinguish one tab from another — the server never trusts it as
 * a credential.
 */
function randomLease() {
    const bytes = new Uint8Array(16);
    if (globalThis.crypto?.getRandomValues) {
        crypto.getRandomValues(bytes);
    } else {
        for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

/** Project root, derived from this module's own URL (see api.js detectBaseUrl). */
function baseUrl() {
    return new URL(import.meta.url).pathname.replace(/\/app\/js\/utils\/tab-lease-store\.js$/, '');
}

export function getTabLease() {
    let lease = sessionStorage.getItem(LEASE_KEY);
    if (!lease) {
        lease = randomLease();
        sessionStorage.setItem(LEASE_KEY, lease);
    }
    return lease;
}

export function setTabLease(lease) {
    if (!lease) return;
    sessionStorage.setItem(LEASE_KEY, lease);
    localStorage.setItem(BROADCAST_KEY, lease);
}

export function applyLoginLease(lease) {
    if (lease) setTabLease(lease);
}

export function clearClientAuth() {
    localStorage.removeItem('jwt_token');
    sessionStorage.removeItem(LEASE_KEY);
}

export function redirectSuperseded() {
    clearClientAuth();
    const url = baseUrl() + '/index.html';
    if (!window.location.href.endsWith('/index.html')) {
        window.location.href = url;
    }
}
