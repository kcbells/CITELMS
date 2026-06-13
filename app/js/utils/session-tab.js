/**
 * Single active tab per browser login.
 */
import { Api } from '../api.js';
import {
    applyLoginLease,
    BROADCAST_KEY,
    getTabLease,
    redirectSuperseded,
    setTabLease,
} from './tab-lease-store.js';

let guardBound = false;

export { applyLoginLease, getTabLease, setTabLease };

export async function claimActiveTab() {
    const lease = getTabLease();
    const res = await Api.post('/AuthAPI.php?action=claim-tab', { tab_lease: lease });
    if (res.success && res.data?.tab_lease) {
        setTabLease(res.data.tab_lease);
    }
    return res;
}

/** Skip network call when this tab already owns the server lease. */
export async function claimActiveTabIfNeeded(serverLease) {
    const mine = sessionStorage.getItem('coc_tab_lease');
    if (serverLease && mine && serverLease === mine) {
        return { success: true, skipped: true };
    }
    return claimActiveTab();
}

export function initSessionTabGuard(onSuperseded) {
    if (guardBound) return;
    guardBound = true;

    window.addEventListener('storage', (e) => {
        if (e.key !== BROADCAST_KEY || !e.newValue) return;
        const mine = sessionStorage.getItem('coc_tab_lease');
        if (mine && e.newValue !== mine) {
            onSuperseded?.();
        }
    });
}

export { redirectSuperseded };
