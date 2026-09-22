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

// Derive the project root from this module's own URL rather than from the page
// path: this file is always served as <base>/app/js/api.js, so stripping that
// suffix gives the real base no matter what the project folder is called, how
// deep the current page sits, or whether the app is served from the web root
// (in which case the base is an empty string).
function detectBaseUrl() {
    const here = new URL(import.meta.url).pathname;
    return here.replace(/\/app\/js\/api\.js$/, '');
}

const BASE_URL = detectBaseUrl();
const API_URL = BASE_URL + '/api';

// ── Cache constants ────────────────────────────────────────────
const DEFAULT_TTL   = 45_000;   // 45 seconds
// ModuleDocumentsAPI is here because publish state has to be live: the
// auto-invalidation on Api.post() only clears the cache of the browser that
// published. A student's browser has its own cache, so an instructor
// publishing a SAS or a quiz wouldn't show up on the student's side for up to
// DEFAULT_TTL — long enough for them to think it's broken, or miss a deadline.
const NO_CACHE_APIS = ['MessagingAPI', 'GroupChatAPI', 'ChatAPI', 'AuthAPI', 'VideoAPI', 'ModuleDocumentsAPI'];

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
        // An empty body used to silently become `{}` here — success/message
        // both undefined, no error surfaced anywhere, so a caller's own
        // generic "something went wrong" fallback text was all a user ever
        // saw, with zero diagnostic trail. A genuinely empty response is
        // always a real failure (a connection cut mid-request — e.g. a slow
        // AI call outliving a proxy/server timeout after headers were
        // already sent as 200 — never a legitimate empty-but-successful
        // response), so treat it as one explicitly instead of guessing {}.
        if (body === '') {
            console.error('[API] Empty response body, HTTP', response.status);
            return {
                success: false,
                message: 'The server closed the connection before finishing (this usually means the request took too long). Please try again.',
                _emptyResponse: true,
            };
        }

        let data;
        try {
            data = JSON.parse(body);
        } catch {
            console.error('[API] Non-JSON response:', raw.slice(0, 300));
            return {
                success: false,
                message: 'Server returned an invalid response. Please refresh and try again.',
                _parseError: true,
            };
        }

        // 422 + blocked — bad words or a nude photo. One popup for the whole
        // app, so every page that sends text gets it without its own code.
        if (data && data.blocked) {
            showBlockedPopup(data.message);
            return { ...data, success: false, _blocked: true };
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
            if (!superseded) {
                localStorage.removeItem('jwt_token');
            }
            const landingPage = (BASE_URL + '/index.html').toLowerCase();
            const here = window.location.pathname.toLowerCase();
            const onLandingPage = here === landingPage || here === BASE_URL.toLowerCase() + '/' || here === BASE_URL.toLowerCase();
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


/**
 * "Not allowed" popup for blocked content. Built here rather than in
 * notify.js so api.js keeps no imports (notify.js imports modules that
 * import api.js). notify.js skips its own toast for the same message.
 */
function showBlockedPopup(message) {
    const msg = message || 'This is not allowed.';
    window.__cocBlocked = { msg, at: Date.now() };
    document.getElementById('coc-blocked-pop')?.remove();
    const wrap = document.createElement('div');
    wrap.id = 'coc-blocked-pop';
    wrap.setAttribute('role', 'alertdialog');
    wrap.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px;';
    const box = document.createElement('div');
    box.style.cssText = 'background:#fff;color:#111;border:2px solid #111;border-radius:10px;width:min(100%,380px);padding:22px 20px 18px;text-align:center;font-family:inherit;';
    box.innerHTML = '<div style="width:52px;height:52px;margin:0 auto 12px;border:2px solid #B91C1C;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#B91C1C">'
        + '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><circle cx="12" cy="12" r="9"/><line x1="5.6" y1="5.6" x2="18.4" y2="18.4"/></svg></div>'
        + '<h3 style="margin:0 0 6px;font-size:18px;font-weight:800;color:#B91C1C">Not allowed</h3>'
        + '<p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:#374151"></p>'
        + '<button type="button" style="width:100%;border:0;border-radius:8px;background:#00461B;color:#fff;font-weight:700;font-size:14px;padding:11px;cursor:pointer">OK</button>';
    box.querySelector('p').textContent = msg + ' Your message was not sent.';
    wrap.appendChild(box);
    const close = () => wrap.remove();
    box.querySelector('button').addEventListener('click', close);
    wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
    document.body.appendChild(wrap);
    box.querySelector('button').focus();
}

// Export BASE_URL for use in other modules
export { BASE_URL };
