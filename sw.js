/**
 * COC LMS — Service Worker v4
 *
 * SHELL_CACHE  — static files (HTML, CSS, JS, images) — stale-while-revalidate
 * DATA_CACHE   — API responses for lessons, subjects, gradebook — network-first
 * NEVER CACHED — enrollment/join actions, POST requests, auth
 * BACKGROUND SYNC — outgoing messages queued in IndexedDB, flushed on reconnect
 */

const SHELL_VER = 'coc-shell-v79';
const DATA_VER  = 'coc-data-v79';

// Static shell — precached on install
const SHELL_FILES = [
    './',
    './index.html',
    './app/dashboard.html',
    './app/home.html',
    './css/style.css',
    './manifest.json',
    './assets/images/phinma_logo2.png',
    './assets/images/default-avatar.png',
];

// API path segments that are safe to cache offline (GET only)
const CACHEABLE_API = [
    'SubjectsAPI',
    'EnrollmentAPI',
    'ClassroomAPI',
    'ProgressAPI',
    'LessonsAPI',
    'GradebookAPI',
    'GlobalGradebookAPI',
    'QuizzesAPI',
    'AnnouncementsAPI',
    'ChatAPI',
    'UsersAPI',
    'CurriculumAPI',
    // page-layer PHP endpoints
    'lessons.php',
    'my-classes.php',
    'grades.php',
    'progress.php',
    'my-subjects.php',
    'dashboard.php',
    'analytics.php',
    'students.php',
    'quizzes.php',
    'learning-hub.php',
];

// Query-string fragments that must NEVER be cached (enrollment / mutation side-effects)
const NEVER_CACHE_ACTIONS = [
    'action=enroll',
    'action=join',
    'action=unenroll',
    'action=drop',
    'action=register',
    'action=login',
    'action=logout',
    'action=send',
    'action=create',
    'action=delete',
    'action=update',
    'action=submit',
    'action=reset',
    'action=verify',
    'action=mark-read',
    'action=start-conversation',
];

// ── Install ───────────────────────────────────────────────────────────────────
self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(SHELL_VER)
            .then(c => c.addAll(SHELL_FILES))
            .catch(() => {}) // never block install if a precache item fails
    );
    self.skipWaiting();
});

// ── Activate ──────────────────────────────────────────────────────────────────
self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys
                    .filter(k => k !== SHELL_VER && k !== DATA_VER)
                    .map(k => caches.delete(k))
            )
        ).then(() => self.clients.claim())
    );
});

// ── Message (client → SW) ─────────────────────────────────────────────────────
self.addEventListener('message', e => {
    if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
    if (e.data?.type === 'FLUSH_MESSAGES') {
        // Client came online — tell all clients to flush their queue
        self.clients.matchAll().then(clients =>
            clients.forEach(c => c.postMessage({ type: 'DO_FLUSH' }))
        );
    }
});

// ── Background Sync (fires when network is restored) ─────────────────────────
self.addEventListener('sync', e => {
    if (e.tag === 'outbox-messages') {
        e.waitUntil(
            self.clients.matchAll().then(clients =>
                clients.forEach(c => c.postMessage({ type: 'DO_FLUSH' }))
            )
        );
    }
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', e => {
    const req = e.request;
    const url = new URL(req.url);

    // Only intercept same-origin GET requests
    if (req.method !== 'GET' || url.origin !== self.location.origin) return;

    const path   = url.pathname;
    const search = url.search;

    // Enrollment / mutation actions → always network-only
    if (NEVER_CACHE_ACTIONS.some(a => search.includes(a))) return;

    // PHP API responses for offline-capable features → network-first + cache
    if (path.endsWith('.php') && CACHEABLE_API.some(p => path.includes(p))) {
        e.respondWith(networkFirst(req, DATA_VER));
        return;
    }

    // All other PHP (auth, enrollment, admin) → network-only
    if (path.endsWith('.php')) return;

    // Static assets → stale-while-revalidate
    e.respondWith(staleWhileRevalidate(req, SHELL_VER));
});

// ── Strategies ────────────────────────────────────────────────────────────────

/**
 * Network-first: try network, cache success; fall back to cache when offline.
 * Returns a JSON offline message if nothing is cached.
 */
async function networkFirst(request, cacheName) {
    const cache = await caches.open(cacheName);
    try {
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
    } catch {
        const cached = await cache.match(request);
        if (cached) return cached;
        // Return a graceful JSON so the app can show "offline" state
        return new Response(
            JSON.stringify({
                success: false,
                offline:  true,
                message:  'You are offline. Showing the last saved data.',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
    }
}

/**
 * Stale-while-revalidate: serve from cache immediately; update cache in background.
 * Falls back to network if not cached, then to an offline page for HTML.
 */
async function staleWhileRevalidate(request, cacheName) {
    const cache  = await caches.open(cacheName);
    const cached = await cache.match(request);

    const networkPromise = fetch(request).then(response => {
        if (response.ok && response.type !== 'opaque') {
            cache.put(request, response.clone());
        }
        return response;
    }).catch(() => null);

    return cached || networkPromise || offlineFallback(request, cache);
}

async function offlineFallback(request, cache) {
    const url = new URL(request.url);
    if (url.pathname.endsWith('.html') || url.pathname === '/' || url.pathname.endsWith('/')) {
        return (
            (await cache.match('./app/dashboard.html')) ||
            (await cache.match('./index.html')) ||
            new Response('Offline', { status: 503 })
        );
    }
    return new Response('Offline', { status: 503 });
}
