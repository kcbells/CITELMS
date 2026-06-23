/**
 * API Wrapper - All fetch calls go through here
 * Handles auth, errors, base URL, and client-side response caching.
 *
 * Cache behaviour:
 *  - Api.get() caches responses in memory for DEFAULT_TTL ms (45 s).
 *  - Api.post() / Api.postForm() auto-invalidate cache entries that share
 *    the same PHP file name, then also purge DashboardAPI (counts change).
 *  - Pass { ttl: 0 } to force a fresh fetch: Api.get('/...', { ttl: 0 })
 *  - Messaging, Chat, and Auth endpoints are never cached.
 */

import { getTabLease } from './utils/tab-lease-store.js';

// Auto-detect project folder from URL (works for /COC_LMS(2), /COC-LMS, etc.)
function detectBaseUrl() {
    const match = window.location.pathname.match(/^\/([^/]+)/);
    return match ? '/' + match[1] : '/COC-LMS';
}

const BASE_URL = detectBaseUrl();
const API_URL = BASE_URL + '/api';

// ── Cache constants ────────────────────────────────────────────
const DEFAULT_TTL   = 45_000;   // 45 seconds
const NO_CACHE_APIS = ['MessagingAPI', 'ChatAPI', 'AuthAPI', 'VideoAPI'];

// endpoint string → { data, expiresAt }
const _cache = new Map();

export const Api = {

    // ── Auth helpers ────────────────────────────────────────────
    _getToken() {
        return localStorage.getItem('jwt_token') || null;
    },

    _authHeaders(extra = {}) {
        const headers = { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest', ...extra };
        const token = this._getToken();
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const lease = getTabLease();
        if (lease) headers['X-Tab-Lease'] = lease;
        return headers;
    },

    // ── Cache helpers ───────────────────────────────────────────
    _cacheable(endpoint) {
        return !NO_CACHE_APIS.some(name => endpoint.includes(name));
    },

    _cacheGet(key) {
        const entry = _cache.get(key);
        if (!entry) return null;
        if (Date.now() > entry.expiresAt) { _cache.delete(key); return null; }
        return entry.data;
    },

    _cacheSet(key, data, ttl) {
        _cache.set(key, { data, expiresAt: Date.now() + ttl });
    },

    /**
     * Invalidate all cache entries whose key contains `pattern`.
     * Called automatically after every POST; also available to page code.
     */
    invalidate(pattern) {
        for (const key of _cache.keys()) {
            if (key.includes(pattern)) _cache.delete(key);
        }
    },

    /** Wipe the entire cache (e.g. on logout). */
    invalidateAll() {
        _cache.clear();
    },

    // ── Request methods ─────────────────────────────────────────
    /**
     * GET request — returns cached result if fresh.
     * @param {string} endpoint
     * @param {{ ttl?: number }} [opts]  ttl=0 forces a network fetch.
     */
    async get(endpoint, opts = {}) {
        const ttl = opts.ttl !== undefined ? opts.ttl : DEFAULT_TTL;
        const useCache = ttl > 0 && this._cacheable(endpoint);

        if (useCache) {
            const cached = this._cacheGet(endpoint);
            if (cached) return cached;
        }

        const response = await fetch(API_URL + endpoint, {
            method: 'GET',
            credentials: 'include',
            headers: this._authHeaders(),
        });
        const data = await this._handleResponse(response);

        if (useCache && data?.success !== false) {
            this._cacheSet(endpoint, data, ttl);
        }
        return data;
    },

    /**
     * POST request with JSON body.
     * Auto-invalidates cache entries for the same API file.
     */
    async post(endpoint, data = {}) {
        const response = await fetch(API_URL + endpoint, {
            method: 'POST',
            credentials: 'include',
            headers: this._authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(data),
        });
        const result = await this._handleResponse(response);
        this._postInvalidate(endpoint);
        return result;
    },

    /**
     * POST request with FormData (file uploads).
     * Auto-invalidates cache entries for the same API file.
     */
    async postForm(endpoint, formData) {
        const response = await fetch(API_URL + endpoint, {
            method: 'POST',
            credentials: 'include',
            headers: this._authHeaders(),
            body: formData,
        });
        const result = await this._handleResponse(response);
        this._postInvalidate(endpoint);
        return result;
    },

    /** Invalidate relevant cache entries after a mutating request. */
    _postInvalidate(endpoint) {
        // Invalidate entries that share the same PHP file
        const match = endpoint.match(/\/([\w]+API\.php)/i);
        if (match) {
            this.invalidate(match[1]);
        }
        // Dashboard aggregates data from many sources — always purge it too
        this.invalidate('DashboardAPI');
    },

    // ── Response handler ────────────────────────────────────────
    async _handleResponse(response) {
        const raw = await response.text();
        // Strip UTF-8 BOM (﻿) if a PHP file was saved with BOM encoding
        const body = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw;
        let data;
        try {
            data = body ? JSON.parse(body) : {};
        } catch {
            console.error('[API] Non-JSON response:', raw.slice(0, 300));
            return {
                success: false,
                message: 'Server returned an invalid response. Please refresh and try again.',
                _parseError: true,
            };
        }

        // 429 — rate limited
        if (response.status === 429) {
            const retryAfter = parseInt(response.headers.get('Retry-After') || '60', 10);
            const msg = data?.message || `Too many requests. Please wait ${retryAfter} seconds and try again.`;
            console.warn('[API] 429 Rate limited:', msg);
            return { ...data, success: false, _rateLimited: true, retry_after: retryAfter };
        }

        // 401 — session expired or superseded by another tab
        if (response.status === 401) {
            const superseded = data?.code === 'SESSION_SUPERSEDED';
            if (!superseded) localStorage.removeItem('jwt_token');
            const onLandingPage = /\/index\.html$|\/COC_LMS\(2\)\/?$/i.test(window.location.pathname);
            if (!onLandingPage) {
                window.location.href = BASE_URL + '/index.html';
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
    },
};

// Export BASE_URL for use in other modules
export { BASE_URL };
