/**
 * Offline manager — detects connectivity, shows banner, queues messages.
 *
 * Usage (auto-initialises on import):
 *   import { isOnline, queueMessage, flushMessageQueue } from './offline.js';
 */

const DB_NAME    = 'coc-offline';
const DB_VER     = 1;
const STORE_NAME = 'msg-queue';

// ── IndexedDB helpers ─────────────────────────────────────────────────────────

function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VER);
        req.onupgradeneeded = e => {
            e.target.result.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        };
        req.onsuccess = e => resolve(e.target.result);
        req.onerror   = e => reject(e.target.error);
    });
}

async function dbPut(record) {
    const db    = await openDB();
    const tx    = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    return new Promise((resolve, reject) => {
        const r = store.add(record);
        r.onsuccess = () => resolve(r.result);
        r.onerror   = () => reject(r.error);
    });
}

async function dbGetAll() {
    const db    = await openDB();
    const tx    = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    return new Promise((resolve, reject) => {
        const r = store.getAll();
        r.onsuccess = () => resolve(r.result);
        r.onerror   = () => reject(r.error);
    });
}

async function dbDelete(id) {
    const db    = await openDB();
    const tx    = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    return new Promise((resolve, reject) => {
        const r = store.delete(id);
        r.onsuccess = () => resolve();
        r.onerror   = () => reject(r.error);
    });
}

// ── Online/offline state ──────────────────────────────────────────────────────

export function isOnline() {
    return navigator.onLine;
}

// ── Offline banner ────────────────────────────────────────────────────────────

function injectBanner() {
    if (document.getElementById('coc-offline-banner')) return;
    const el = document.createElement('div');
    el.id = 'coc-offline-banner';
    el.innerHTML = `
        <span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0">
                <line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/>
                <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.56 9"/>
                <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
                <line x1="12" y1="20" x2="12.01" y2="20"/>
            </svg>
            You're offline — browsing saved content. Quizzes and class joining require connection.
        </span>`;
    Object.assign(el.style, {
        position:       'fixed',
        top:            '0',
        left:           '0',
        right:          '0',
        zIndex:         '99999',
        background:     '#1e40af',
        color:          '#fff',
        fontSize:       '13px',
        fontWeight:     '500',
        padding:        '10px 16px',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        gap:            '8px',
        transform:      'translateY(-100%)',
        transition:     'transform 0.3s ease',
        boxShadow:      '0 2px 8px rgba(0,0,0,0.25)',
    });
    el.querySelector('span').style.cssText = 'display:flex;align-items:center;gap:8px;';
    document.body.prepend(el);
    return el;
}

function showBanner() {
    const b = document.getElementById('coc-offline-banner') || injectBanner();
    if (b) b.style.transform = 'translateY(0)';
}

function hideBanner() {
    const b = document.getElementById('coc-offline-banner');
    if (b) b.style.transform = 'translateY(-100%)';
}

function updateBanner() {
    if (!navigator.onLine) showBanner(); else hideBanner();
}

// ── Message queue ─────────────────────────────────────────────────────────────

/**
 * Queue a message to send when connectivity is restored.
 * @param {string} url    — API endpoint URL
 * @param {object} body   — JSON body to POST
 * @param {object} headers — request headers
 */
export async function queueMessage(url, body, headers = {}) {
    await dbPut({ url, body, headers, queued_at: Date.now() });
}

/**
 * Try to send all queued messages. Called when back online.
 * Returns number of messages successfully sent.
 */
export async function flushMessageQueue() {
    if (!navigator.onLine) return 0;
    const items = await dbGetAll();
    if (!items.length) return 0;

    let sent = 0;
    for (const item of items) {
        try {
            const res = await fetch(item.url, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json', ...item.headers },
                body:    JSON.stringify(item.body),
            });
            if (res.ok) {
                await dbDelete(item.id);
                sent++;
            }
        } catch { /* still offline — leave in queue */ }
    }

    if (sent > 0) {
        import('./notify.js').then(({ notify }) => {
            notify(`${sent} queued message${sent > 1 ? 's' : ''} sent.`, 'success');
        }).catch(() => {});
    }
    return sent;
}

export async function queuedCount() {
    const items = await dbGetAll();
    return items.length;
}

// ── Init (auto-runs on import) ────────────────────────────────────────────────

window.addEventListener('online',  () => { updateBanner(); flushMessageQueue(); });
window.addEventListener('offline', () => { updateBanner(); });

// Show banner immediately if already offline when the module loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateBanner);
} else {
    updateBanner();
}
