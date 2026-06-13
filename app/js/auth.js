/**
 * Auth Module - Login, logout, session check
 * Uses the existing PHP AuthAPI.php
 */

import { Api, BASE_URL } from './api.js';
import {
    applyLoginLease,
    claimActiveTabIfNeeded,
    initSessionTabGuard,
    redirectSuperseded,
} from './utils/session-tab.js';
import { clearClientAuth } from './utils/tab-lease-store.js';

export const Auth = {
    _user: null,
    _permissions: null,   // cached Set of permission slugs
    _serverTabLease: null,

    /**
     * Check if user is logged in (calls AuthAPI check endpoint)
     * Returns user data or null
     */
    async check() {
        try {
            const result = await Api.get('/AuthAPI.php?action=check');
            if (result.success && result.data && result.data.authenticated) {
                const u = result.data.user || {};
                if (u.sub && !u.users_id) u.users_id = u.sub;
                if (!u.name && u.first_name) {
                    u.name = (u.first_name + ' ' + (u.last_name || '')).trim();
                }
                this._user = u;
                this._serverTabLease = result.data?.tab_lease || null;
                if (result.data?.tab_lease) applyLoginLease(result.data.tab_lease);
                return this._user;
            }
            return null;
        } catch (e) {
            return null;
        }
    },

    /**
     * Get current user data (more detailed)
     */
    async getUser() {
        try {
            const result = await Api.get('/AuthAPI.php?action=me');
            if (result.success && result.data) {
                const u = result.data.user;
                // Ensure name field exists (me endpoint only returns first_name/last_name)
                if (!u.name && u.first_name) {
                    u.name = (u.first_name + ' ' + (u.last_name || '')).trim();
                }
                this._user = u;
                return this._user;
            }
            return null;
        } catch (e) {
            return null;
        }
    },

    /**
     * Get cached user (from last check/getUser call)
     */
    user() {
        return this._user;
    },

    /**
     * Fetch and cache the current user's permission slugs.
     * Returns a Set<string>.
     */
    async fetchPermissions() {
        try {
            const res = await Api.get('/RBACApi.php?action=my-permissions');
            this._permissions = new Set(res.success ? res.data : []);
        } catch (e) {
            this._permissions = new Set();
        }
        return this._permissions;
    },

    /**
     * Check if the current user has a given permission slug.
     * @param {string} perm  e.g. 'users.create'
     */
    can(perm) {
        if (!this._permissions) return false;
        return this._permissions.has(perm);
    },

    /**
     * Logout
     */
    async logout() {
        this._user = null;
        this._permissions = null;
        this._serverTabLease = null;
        clearClientAuth();

        try {
            await Api.get('/AuthAPI.php?action=logout');
        } catch (e) { /* ignore */ }

        window.location.href = BASE_URL + '/app/index.html';
    },

    /**
     * Local-only sign-out when another tab claimed this session.
     * Must not call server logout (would kill the active tab too).
     */
    logoutSuperseded() {
        this._user = null;
        this._permissions = null;
        this._serverTabLease = null;
        clearClientAuth();
        redirectSuperseded();
    },

    /**
     * Claim this tab as the active session and watch for other tabs.
     */
    async initSingleTabSession() {
        initSessionTabGuard(() => this.logoutSuperseded());
        await claimActiveTabIfNeeded(this._serverTabLease);
    },

    /**
     * Require login - redirect to login if not authenticated
     */
    async requireLogin() {
        const user = await this.check();
        if (!user) {
            window.location.href = BASE_URL + '/app/index.html';
            return null;
        }
        return user;
    },

    /**
     * Require specific role
     */
    async requireRole(roles) {
        const user = await this.requireLogin();
        if (!user) return null;

        if (typeof roles === 'string') roles = [roles];
        if (!roles.includes(user.role)) {
            window.location.href = BASE_URL + '/app/dashboard.html';
            return null;
        }
        return user;
    },

    /**
     * Helper: get role display name
     */
    roleName(role) {
        const names = {
            admin: 'Administrator',
            dean: 'Dean',
            instructor: 'Instructor',
            student: 'Student'
        };
        return names[role] || role;
    },

    /**
     * Helper: get user initials
     */
    initials() {
        if (!this._user) return '??';
        const first = (this._user.first_name || this._user.name || '?')[0];
        const last = (this._user.last_name || '?')[0];
        return (first + last).toUpperCase();
    }
};
