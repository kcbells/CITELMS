const LEASE_KEY = 'coc_tab_lease';
const BROADCAST_KEY = 'coc_active_tab_lease';

export { LEASE_KEY, BROADCAST_KEY };

export function getTabLease() {
    let lease = sessionStorage.getItem(LEASE_KEY);
    if (!lease) {
        lease = crypto.randomUUID();
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
    const match = window.location.pathname.match(/^\/([^/]+)/);
    const base = match ? '/' + match[1] : '/COC-LMS';
    clearClientAuth();
    const url = base + '/app/index.html?reason=superseded';
    if (!window.location.href.includes('reason=superseded')) {
        window.location.href = url;
    }
}
