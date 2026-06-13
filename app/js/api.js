/**
 * API Wrapper - All fetch calls go through here
 * Handles auth, errors, and base URL
 */

import { getTabLease } from './utils/tab-lease-store.js';

// Auto-detect project folder from URL (works for /COC_LMS(2), /COC-LMS, etc.)
function detectBaseUrl() {
    const match = window.location.pathname.match(/^\/([^/]+)/);
    return match ? '/' + match[1] : '/COC-LMS';
}

const BASE_URL = detectBaseUrl();
const API_URL = BASE_URL + '/api';

export const Api = {

    /**
     * Get JWT token from localStorage
     */
    _getToken() {
        return localStorage.getItem('jwt_token') || null;
    },

    /**
     * Build auth headers — always include JWT if available
     */
    _authHeaders(extra = {}) {
        const headers = { 'Accept': 'application/json', ...extra };
        const token = this._getToken();
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const lease = getTabLease();
        if (lease) headers['X-Tab-Lease'] = lease;
        return headers;
    },

    /**
     * GET request
     */
    async get(endpoint) {
        const response = await fetch(API_URL + endpoint, {
            method: 'GET',
            credentials: 'include',
            headers: this._authHeaders()
        });
        return this._handleResponse(response);
    },

    /**
     * POST request with JSON body
     */
    async post(endpoint, data = {}) {
        const response = await fetch(API_URL + endpoint, {
            method: 'POST',
            credentials: 'include',
            headers: this._authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(data)
        });
        return this._handleResponse(response);
    },

    /**
     * POST request with FormData (for file uploads)
     */
    async postForm(endpoint, formData) {
        const response = await fetch(API_URL + endpoint, {
            method: 'POST',
            credentials: 'include',
            headers: this._authHeaders(),
            body: formData
        });
        return this._handleResponse(response);
    },

    /**
     * Handle response - parse JSON and check for auth errors
     */
    async _handleResponse(response) {
        const raw = await response.text();
        let data;
        try {
            data = raw ? JSON.parse(raw) : {};
        } catch {
            console.error('[API] Non-JSON response:', raw.slice(0, 300));
            return {
                success: false,
                message: 'Server returned an invalid response. Please refresh and try again.',
                _parseError: true,
            };
        }

        // 401 — session expired or superseded by another tab
        if (response.status === 401) {
            const superseded = data?.code === 'SESSION_SUPERSEDED';
            if (!superseded) localStorage.removeItem('jwt_token');
            const onLoginPage = /\/app\/(index|login)\.html$/i.test(window.location.pathname);
            if (!onLoginPage) {
                const suffix = superseded ? '?reason=superseded' : '';
                window.location.href = BASE_URL + '/app/index.html' + suffix;
            }
            return { ...data, _superseded: superseded };
        }

        // 403 — authenticated but not allowed; surface clearly without redirecting
        if (response.status === 403) {
            console.warn('[API] 403 Forbidden:', data.message || 'Permission denied');
            return { ...data, success: false, _forbidden: true };
        }

        // 500 — server error; normalise to success:false so callers don't need to check HTTP status
        if (response.status >= 500) {
            console.error('[API] Server error:', response.status, data.message || '');
            return { ...data, success: false, _serverError: true };
        }

        return data;
    }
};

// Export BASE_URL for use in other modules
export { BASE_URL };
