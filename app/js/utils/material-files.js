/**
 * Lesson material attachments — preview PDF, Office, media, images in-browser
 */
import { BASE_URL } from '../api.js';

const API_URL = BASE_URL + '/api';
const OFFICE_OXIDE_URL = 'https://cdn.jsdelivr.net/npm/office-oxide-wasm@0.1.2/web/office_oxide.js';
const SILURUS_PPTX_URL = 'https://cdn.jsdelivr.net/npm/@silurus/ooxml@0.32.1/dist/pptx.mjs';

function escAttr(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function escHtml(str) {
    return escAttr(str);
}

function fileExtension(name) {
    const n = String(name || '');
    const i = n.lastIndexOf('.');
    return i >= 0 ? n.slice(i + 1).toLowerCase() : '';
}

/** Encode each path segment so folders like COC_LMS(2) work in browsers */
export function resolveMaterialUrl(filePath, baseUrl = BASE_URL) {
    if (!filePath) return '';
    if (/^https?:\/\//i.test(filePath)) return filePath;

    let clean = String(filePath).replace(/\\/g, '/').replace(/^\//, '');
    clean = clean.replace(/^COC-LMS\//i, '').replace(/^COC_LMS\(2\)\//i, '');

    const base = String(baseUrl).replace(/\/$/, '');
    const encodedBase = base.split('/').map((seg, i) => (i === 0 || !seg ? seg : encodeURIComponent(seg))).join('/');
    const encodedPath = clean.split('/').filter(Boolean).map(encodeURIComponent).join('/');
    return encodedPath ? `${encodedBase}/${encodedPath}` : encodedBase;
}

/** Authenticated API URL for streaming a material */
export function materialServeUrl(materialId, { download = false } = {}) {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('jwt_token') : null;
    let url = `${API_URL}/LessonsAPI.php?action=serve-material&material_id=${encodeURIComponent(materialId)}`;
    if (download) url += '&download=1';
    if (token) url += `&token=${encodeURIComponent(token)}`;
    return url;
}

function absoluteMaterialServeUrl(materialId) {
    return new URL(materialServeUrl(materialId), window.location.href).href;
}

export function isMaterialLink(m) {
    return m.material_type === 'link' || /^https?:\/\//i.test(m.file_path || '');
}

export function materialExt(m) {
    const name = m.original_name || m.file_name || '';
    return (name.split('.').pop() || 'FILE').toUpperCase();
}

/** Preview mode for a material row */
export function getMaterialPreviewKind(m, name = '') {
    const n = name || m?.original_name || m?.file_name || '';
    const ext = fileExtension(n);
    const type = String(m?.material_type || '').toLowerCase();

    if (isMaterialLink(m || { file_path: n, material_type: type })) return 'link';
    if (type === 'image' || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) return 'image';
    if (ext === 'pdf') return 'pdf';
    if (type === 'audio' || ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'opus', 'wma'].includes(ext)) return 'audio';
    if (type === 'video' || ['mp4', 'webm', 'mov', 'mkv', 'avi', 'm4v'].includes(ext)) return 'video';
    if (['txt', 'csv', 'md', 'json', 'xml', 'log', 'rtf'].includes(ext)) return 'text';
    if (ext === 'docx') return 'docx';
    if (ext === 'doc') return 'doc';
    if (['xlsx', 'xlsm'].includes(ext)) return 'xlsx';
    if (ext === 'xls') return 'xls';
    if (['pptx', 'ppsx'].includes(ext)) return 'pptx';
    if (ext === 'ppt') return 'ppt';
    return 'unsupported';
}

export function canInlinePreview(m) {
    const kind = getMaterialPreviewKind(m);
    return kind !== 'link' && kind !== 'unsupported';
}

const OFFICE_WASM_FORMAT = {
    docx: 'docx', doc: 'doc', xlsx: 'xlsx', xls: 'xls', ppt: 'ppt',
};

/**
 * Clickable file row — opens viewer modal on click
 */
export function renderMaterialAttachment(m) {
    const name = m.original_name || m.file_name || 'Material';
    const isLink = isMaterialLink(m);
    const matId = m.material_id || '';
    const ext = isLink ? 'Link' : materialExt(m);
    const staticUrl = isLink ? (m.file_path || '#') : resolveMaterialUrl(m.file_path);
    const viewUrl = isLink ? staticUrl : (matId ? materialServeUrl(matId) : staticUrl);
    const previewable = canInlinePreview(m);

    if (isLink) {
        return `
            <a class="gc-material-row gc-material-row--link" href="${escAttr(viewUrl)}" target="_blank" rel="noopener">
                <span class="gc-material-icon" aria-hidden="true">🔗</span>
                <div class="gc-material-text">
                    <span class="gc-material-name">${escAttr(name)}</span>
                    <span class="gc-material-meta">${escAttr(ext)} · Opens in new tab</span>
                </div>
                <span class="gc-material-chevron" aria-hidden="true">↗</span>
            </a>`;
    }

    return `
        <button type="button" class="gc-material-row gc-material-row--file"
                data-mat-open
                data-mat-id="${escAttr(matId)}"
                data-mat-name="${escAttr(name)}"
                data-mat-url="${escAttr(viewUrl)}">
            <span class="gc-material-icon" aria-hidden="true">📄</span>
            <div class="gc-material-text">
                <span class="gc-material-name">${escAttr(name)}</span>
                <span class="gc-material-meta">${escAttr(ext)}${m.file_size ? ` · ${formatSize(m.file_size)}` : ''} · ${previewable ? 'Click to preview' : 'Click to open'}</span>
            </div>
            <span class="gc-material-chevron" aria-hidden="true">›</span>
        </button>`;
}

function formatSize(bytes) {
    const n = Number(bytes) || 0;
    if (n > 1048576) return (n / 1048576).toFixed(1) + ' MB';
    if (n > 1024) return (n / 1024).toFixed(1) + ' KB';
    return n + ' B';
}

let activeViewer = null;
let officeOxidePromise = null;
let silurusPptxPromise = null;
let pptxViewerCleanup = null;

async function fetchMaterialBlob(materialId) {
    const serveUrl = materialServeUrl(materialId);
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('jwt_token') : null;
    const headers = { Accept: '*/*' };
    if (token) headers.Authorization = `Bearer ${token}`;

    const resp = await fetch(serveUrl, { credentials: 'include', headers });
    if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        throw new Error(text || `Could not load file (${resp.status})`);
    }
    return resp.blob();
}

async function loadOfficeOxide() {
    if (!officeOxidePromise) {
        officeOxidePromise = import(OFFICE_OXIDE_URL).then(async (mod) => {
            await mod.default();
            return mod;
        });
    }
    return officeOxidePromise;
}

async function loadSilurusPptx() {
    if (!silurusPptxPromise) {
        silurusPptxPromise = import(SILURUS_PPTX_URL);
    }
    return silurusPptxPromise;
}

function canvasToBlobUrl(canvas) {
    return new Promise((resolve, reject) => {
        if (!canvas?.width || !canvas?.height) {
            reject(new Error('Slide canvas has no dimensions'));
            return;
        }
        canvas.toBlob((blob) => {
            if (!blob) reject(new Error('Could not capture slide image'));
            else resolve(URL.createObjectURL(blob));
        }, 'image/png', 0.92);
    });
}

/** Render each PPTX slide to a blob URL via PptxViewer (reliable canvas sizing) */
async function renderPptxSlideImages(blob, onProgress) {
    const mod = await loadSilurusPptx();
    const PptxViewer = mod.PptxViewer;
    const PptxPresentation = mod.PptxPresentation;
    const arrayBuffer = await blob.arrayBuffer();
    const width = Math.min(1280, Math.max(720, window.innerWidth - 80));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const urls = [];

    if (PptxViewer) {
        const canvas = document.createElement('canvas');
        const viewer = new PptxViewer(canvas, { width, dpr });
        await viewer.load(arrayBuffer);
        const slideCount = viewer.slideCount || 0;
        if (slideCount <= 0) {
            viewer.destroy?.();
            return urls;
        }
        try {
            for (let i = 0; i < slideCount; i++) {
                onProgress?.(i + 1, slideCount);
                await viewer.goToSlide(i);
                urls.push(await canvasToBlobUrl(canvas));
            }
        } finally {
            viewer.destroy?.();
        }
        return urls;
    }

    if (!PptxPresentation) {
        throw new Error('PPTX renderer is not available in this browser.');
    }

    const doc = await PptxPresentation.load(arrayBuffer);
    const slideCount = doc.slideCount || 0;
    try {
        for (let i = 0; i < slideCount; i++) {
            onProgress?.(i + 1, slideCount);
            const canvas = document.createElement('canvas');
            await doc.renderSlide(canvas, i, { width, dpr });
            if (!canvas.height || canvas.height < 4) {
                throw new Error('Slide render produced invalid dimensions');
            }
            urls.push(await canvasToBlobUrl(canvas));
        }
    } finally {
        doc.destroy?.();
    }
    return urls;
}

function pptxViewerShellHtml() {
    return `<div class="gc-mat-pptx-viewer">
        <div class="gc-mat-pptx-navbar">
            <button type="button" class="gc-mat-pptx-navbtn" data-pptx-prev aria-label="Previous slide">‹ Prev</button>
            <span class="gc-mat-pptx-counter" data-pptx-counter>Rendering slides…</span>
            <button type="button" class="gc-mat-pptx-navbtn" data-pptx-next aria-label="Next slide">Next ›</button>
        </div>
        <div class="gc-mat-pptx-stage" data-pptx-stage>
            <img class="gc-mat-pptx-main-img" data-pptx-main alt="">
        </div>
        <div class="gc-mat-pptx-thumbs" data-pptx-thumbs></div>
    </div>`;
}

async function mountPptxViewer(root, blob, name) {
    if (!root) return;

    const counter = root.querySelector('[data-pptx-counter]');
    const mainImg = root.querySelector('[data-pptx-main]');
    const thumbs = root.querySelector('[data-pptx-thumbs]');
    let slideUrls = [];
    let activeIdx = 0;

    slideUrls = await renderPptxSlideImages(blob, (done, total) => {
        if (counter) counter.textContent = `Rendering slide ${done} of ${total}…`;
    });

    if (!slideUrls.length) {
        throw new Error('No slides found in this presentation.');
    }

    root.dataset.pptxSlideUrls = slideUrls.join('\n');

    thumbs.replaceChildren();
    slideUrls.forEach((url, i) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `gc-mat-pptx-thumb${i === 0 ? ' is-active' : ''}`;
        btn.dataset.thumbIdx = String(i);
        btn.setAttribute('aria-label', `Go to slide ${i + 1}`);

        const img = document.createElement('img');
        img.src = url;
        img.alt = `Slide ${i + 1}`;

        const label = document.createElement('span');
        label.textContent = String(i + 1);

        btn.append(img, label);
        thumbs.appendChild(btn);
    });

    const prevBtn = root.querySelector('[data-pptx-prev]');
    const nextBtn = root.querySelector('[data-pptx-next]');

    const showSlide = (i) => {
        activeIdx = Math.max(0, Math.min(slideUrls.length - 1, i));
        if (mainImg) {
            mainImg.src = slideUrls[activeIdx];
            mainImg.alt = `${name} — slide ${activeIdx + 1}`;
        }
        if (counter) counter.textContent = `Slide ${activeIdx + 1} of ${slideUrls.length}`;
        if (prevBtn) prevBtn.disabled = activeIdx <= 0;
        if (nextBtn) nextBtn.disabled = activeIdx >= slideUrls.length - 1;
        thumbs.querySelectorAll('.gc-mat-pptx-thumb').forEach((btn, j) => {
            btn.classList.toggle('is-active', j === activeIdx);
        });
        const activeThumb = thumbs.querySelector(`[data-thumb-idx="${activeIdx}"]`);
        activeThumb?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    };

    prevBtn?.addEventListener('click', () => showSlide(activeIdx - 1));
    nextBtn?.addEventListener('click', () => showSlide(activeIdx + 1));
    thumbs.querySelectorAll('.gc-mat-pptx-thumb').forEach((btn) => {
        btn.addEventListener('click', () => showSlide(parseInt(btn.dataset.thumbIdx, 10)));
    });

    const onKey = (e) => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') showSlide(activeIdx - 1);
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') showSlide(activeIdx + 1);
    };
    document.addEventListener('keydown', onKey);

    pptxViewerCleanup = () => {
        document.removeEventListener('keydown', onKey);
        slideUrls.forEach((url) => URL.revokeObjectURL(url));
        slideUrls = [];
        pptxViewerCleanup = null;
    };

    showSlide(0);
}

async function renderOfficeWasmHtml(blob, wasmFormat) {
    const { WasmDocument } = await loadOfficeOxide();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const doc = new WasmDocument(bytes, wasmFormat);
    try {
        const html = doc.toHtml?.() || '';
        if (html && html.trim()) {
            return `<div class="gc-mat-office-html">${html}</div>`;
        }
        const text = doc.plainText?.() || '';
        if (text.trim()) {
            return `<div class="gc-mat-office-html"><pre class="gc-mat-plain">${escHtml(text)}</pre></div>`;
        }
        return '<div class="gc-mat-office-html"><p class="gc-mat-empty">No readable content in this file.</p></div>';
    } finally {
        doc.free?.();
    }
}

function officeOnlineEmbedHtml(materialId, name) {
    const src = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(absoluteMaterialServeUrl(materialId))}`;
    return `<iframe class="gc-mat-viewer-frame" src="${escAttr(src)}" title="${escAttr(name)}"></iframe>`;
}

function downloadFallbackHtml(name, materialId, message = '') {
    const downloadHref = escAttr(materialId ? materialServeUrl(materialId, { download: true }) : '#');
    return `<div class="gc-mat-viewer-fallback">
        ${message ? `<p>${escHtml(message)}</p>` : ''}
        <p>Download the file to open it in Word, Excel, PowerPoint, or another app on your device.</p>
        <a class="gc-mat-toolbar-btn gc-mat-toolbar-btn--solid" href="${downloadHref}" download="${escAttr(name)}">Download file</a>
    </div>`;
}

async function buildPreviewBody(kind, { name, materialId, blob, blobUrl }) {
    switch (kind) {
        case 'image':
            return `<div class="gc-mat-viewer-body"><img class="gc-mat-viewer-img" src="${escAttr(blobUrl)}" alt="${escAttr(name)}"></div>`;
        case 'pdf':
            return `<iframe class="gc-mat-viewer-frame" src="${escAttr(blobUrl)}" title="${escAttr(name)}"></iframe>`;
        case 'audio':
            return `<div class="gc-mat-viewer-body gc-mat-viewer-body--media">
                <audio class="gc-mat-viewer-audio" controls autoplay src="${escAttr(blobUrl)}">Your browser does not support audio playback.</audio>
            </div>`;
        case 'video':
            return `<div class="gc-mat-viewer-body gc-mat-viewer-body--media">
                <video class="gc-mat-viewer-video" controls autoplay src="${escAttr(blobUrl)}">Your browser does not support video playback.</video>
            </div>`;
        case 'text': {
            const text = await blob.text();
            return `<div class="gc-mat-viewer-body gc-mat-viewer-body--text"><pre class="gc-mat-text-pre">${escHtml(text)}</pre></div>`;
        }
        case 'docx':
        case 'doc':
        case 'xlsx':
        case 'xls':
        case 'ppt': {
            const wasmFormat = OFFICE_WASM_FORMAT[kind];
            try {
                return await renderOfficeWasmHtml(blob, wasmFormat);
            } catch (wasmErr) {
                console.warn('Office WASM preview failed, trying Office Online:', wasmErr);
                if (materialId) {
                    return officeOnlineEmbedHtml(materialId, name);
                }
                throw wasmErr;
            }
        }
        case 'pptx':
            return pptxViewerShellHtml();
        default:
            return downloadFallbackHtml(name, materialId);
    }
}

function buildViewerShell(name, materialId, bodyHtml) {
    const downloadHref = escAttr(
        materialId
            ? materialServeUrl(materialId, { download: true })
            : '#'
    );
    const safeName = escAttr(name || 'Document');

    return `
        <div class="gc-mat-viewer">
            <div class="gc-mat-viewer-toolbar">
                <span class="gc-mat-viewer-title">${safeName}</span>
                <div class="gc-mat-viewer-actions">
                    <a class="gc-mat-toolbar-btn" href="${downloadHref}" download="${safeName}">Download</a>
                    <button type="button" class="gc-mat-toolbar-btn" data-mat-viewer-print>Print</button>
                    <button type="button" class="gc-mat-viewer-close" aria-label="Close">&times;</button>
                </div>
            </div>
            <div class="gc-mat-viewer-body-wrap">${bodyHtml}</div>
        </div>`;
}

function bindViewerChrome(overlay, name, materialId, viewUrl) {
    overlay.querySelector('.gc-mat-viewer-close')?.addEventListener('click', closeMaterialViewer);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeMaterialViewer(); });
    overlay.querySelector('[data-mat-viewer-print]')?.addEventListener('click', () => {
        const pptxViewer = overlay.querySelector('.gc-mat-pptx-viewer');
        const pptxSlideUrls = pptxViewer?.dataset.pptxSlideUrls?.split('\n').filter(Boolean) || [];
        if (pptxSlideUrls.length) {
            const w = window.open('', '_blank');
            if (!w) return;
            w.document.write(`<!DOCTYPE html><html><head><title>${escHtml(name)}</title>
                <style>body{margin:0;padding:16px;background:#f3f4f6}
                figure{margin:0 0 20px;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)}
                figcaption{padding:8px 12px;font:600 12px Segoe UI,sans-serif;color:#5f6368;border-bottom:1px solid #e8eaed}
                img{display:block;width:100%;height:auto}</style></head><body>`);
            pptxSlideUrls.forEach((src, i) => {
                w.document.write(`<figure><figcaption>Slide ${i + 1}</figcaption><img src="${src}" alt="Slide ${i + 1}"></figure>`);
            });
            w.document.write('</body></html>');
            w.document.close();
            w.focus();
            w.print();
            return;
        }
        const target = overlay.querySelector('.gc-mat-viewer-frame, .gc-mat-viewer-img, .gc-mat-office-html, .gc-mat-text-pre');
        if (target?.tagName === 'IFRAME') {
            printMaterialUrl(target.src, name);
            return;
        }
        const w = window.open('', '_blank');
        if (!w) return;
        w.document.write(`<!DOCTYPE html><html><head><title>${escHtml(name)}</title>
            <style>body{font-family:Segoe UI,system-ui,sans-serif;padding:24px;line-height:1.5;color:#202124}
            table{border-collapse:collapse;width:100%}th,td{border:1px solid #dadce0;padding:6px 10px}
            img{max-width:100%}pre{white-space:pre-wrap;word-break:break-word}</style></head><body>`);
        if (target) {
            w.document.write(target.outerHTML || target.textContent || '');
        }
        w.document.write('</body></html>');
        w.document.close();
        w.focus();
        w.print();
    });

    const onKey = (e) => {
        if (e.key === 'Escape') {
            closeMaterialViewer();
            document.removeEventListener('keydown', onKey);
        }
    };
    document.addEventListener('keydown', onKey);
}

export async function openMaterialViewer({ url, name, materialId = null }) {
    closeMaterialViewer();

    const kind = getMaterialPreviewKind({ original_name: name }, name);
    const matId = materialId || null;

    const overlay = document.createElement('div');
    overlay.className = 'gc-mat-viewer-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', name || 'Document viewer');
    overlay.innerHTML = buildViewerShell(
        name,
        matId,
        '<div class="gc-mat-viewer-loading"><div class="gc-mat-spinner"></div><span>Loading preview…</span></div>'
    );

    document.body.appendChild(overlay);
    activeViewer = overlay;
    document.body.style.overflow = 'hidden';

    let blobUrl = null;

    try {
        if (kind === 'unsupported' || kind === 'link') {
            overlay.querySelector('.gc-mat-viewer-body-wrap').innerHTML =
                downloadFallbackHtml(name, matId, 'Preview is not available for this file type.');
        } else if (matId) {
            const blob = await fetchMaterialBlob(matId);
            blobUrl = URL.createObjectURL(blob);
            if (blobUrl) overlay.dataset.blobUrl = blobUrl;

            const bodyHtml = await buildPreviewBody(kind, { name, materialId: matId, blob, blobUrl });
            overlay.querySelector('.gc-mat-viewer-body-wrap').innerHTML = bodyHtml;
            if (kind === 'pptx') {
                await mountPptxViewer(
                    overlay.querySelector('.gc-mat-pptx-viewer'),
                    blob,
                    name
                );
            }
        } else if (kind === 'image' || kind === 'pdf') {
            overlay.querySelector('.gc-mat-viewer-body-wrap').innerHTML =
                await buildPreviewBody(kind, { name, materialId: null, blob: null, blobUrl: url });
        } else {
            overlay.querySelector('.gc-mat-viewer-body-wrap').innerHTML =
                downloadFallbackHtml(name, matId);
        }

        bindViewerChrome(overlay, name, matId, blobUrl || url);
    } catch (err) {
        if (kind === 'pptx' && matId) {
            try {
                const blob = await fetchMaterialBlob(matId);
                overlay.querySelector('.gc-mat-viewer-body-wrap').innerHTML = pptxViewerShellHtml();
                await mountPptxViewer(overlay.querySelector('.gc-mat-pptx-viewer'), blob, name);
                bindViewerChrome(overlay, name, matId, url);
                return;
            } catch (pptxErr) {
                console.warn('PPTX slide render failed:', pptxErr);
                try {
                    overlay.querySelector('.gc-mat-viewer-body-wrap').innerHTML =
                        officeOnlineEmbedHtml(matId, name);
                    bindViewerChrome(overlay, name, matId, url);
                    return;
                } catch (_) { /* fall through */ }
            }
        }
        if (matId && OFFICE_WASM_FORMAT[kind]) {
            try {
                overlay.querySelector('.gc-mat-viewer-body-wrap').innerHTML =
                    officeOnlineEmbedHtml(matId, name);
                bindViewerChrome(overlay, name, matId, url);
                return;
            } catch (_) { /* fall through */ }
        }
        overlay.querySelector('.gc-mat-viewer-body-wrap').innerHTML =
            downloadFallbackHtml(name, matId, err.message || 'Could not load preview.');
        bindViewerChrome(overlay, name, matId, url);
    }
}

export function closeMaterialViewer() {
    if (pptxViewerCleanup) {
        pptxViewerCleanup();
    }
    if (activeViewer) {
        const blob = activeViewer.dataset.blobUrl;
        if (blob) URL.revokeObjectURL(blob);
        activeViewer.remove();
        activeViewer = null;
        document.body.style.overflow = '';
    }
}

export function printMaterialUrl(url, name) {
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:none;';
    frame.src = url;
    frame.onload = () => {
        try {
            frame.contentWindow?.focus();
            frame.contentWindow?.print();
        } catch (_) {
            window.open(url, '_blank', 'noopener');
        }
        setTimeout(() => frame.remove(), 60000);
    };
    document.body.appendChild(frame);
}

export function bindMaterialAttachments(root = document) {
    root.querySelectorAll('[data-mat-open]').forEach((el) => {
        el.addEventListener('click', async (e) => {
            e.preventDefault();
            const url = el.dataset.matUrl;
            const name = el.dataset.matName;
            const materialId = el.dataset.matId || null;
            if (!url && !materialId) return;
            await openMaterialViewer({ url, name, materialId });
        });
    });
}

export function materialAttachmentCss() {
    return `
.gc-material-list { display:flex; flex-direction:column; gap:8px; }
.gc-material-row {
    display:flex; align-items:center; gap:12px; width:100%;
    padding:12px 14px; border:1px solid #E8EAED; border-radius:10px; background:#fff;
    text-align:left; font-family:inherit; color:inherit;
    box-shadow:0 2px 8px rgba(0,0,0,.06);
    transition:border-color .12s, background .12s, box-shadow .12s;
}
.gc-material-row--file {
    cursor:pointer; border:none; outline:none;
    border:1px solid #DADCE0;
}
.gc-material-row--file:hover {
    border-color:#00461B; background:#F8FDF9; box-shadow:0 1px 4px rgba(0,70,27,.08);
}
.gc-material-row--file:focus-visible {
    outline:2px solid #00461B; outline-offset:2px;
}
.gc-material-row--link {
    text-decoration:none; color:inherit;
}
.gc-material-row--link:hover {
    border-color:#00461B; background:#F8FDF9;
}
.gc-material-icon { font-size:22px; flex-shrink:0; line-height:1; }
.gc-material-text { min-width:0; flex:1; }
.gc-material-name { display:block; font-size:13px; font-weight:600; color:#202124; word-break:break-word; }
.gc-material-meta { display:block; font-size:11px; color:#5F6368; margin-top:2px; }
.gc-material-chevron { font-size:18px; color:#9AA0A6; flex-shrink:0; line-height:1; }

.gc-mat-viewer-overlay {
    position:fixed; inset:0; background:rgba(0,0,0,.85); z-index:10050;
    display:flex; flex-direction:column; padding:0;
}
.gc-mat-viewer {
    display:flex; flex-direction:column; width:100%; height:100%; min-height:100vh; min-height:100dvh;
    background:#1a1a1a;
}
.gc-mat-viewer-toolbar {
    display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;
    padding:10px 16px; background:#00461B; color:#fff; flex-shrink:0;
}
.gc-mat-viewer-title { font-size:14px; font-weight:700; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1; }
.gc-mat-viewer-actions { display:flex; flex-wrap:wrap; gap:8px; align-items:center; flex-shrink:0; }
.gc-mat-toolbar-btn {
    display:inline-flex; align-items:center; padding:6px 14px; border-radius:6px;
    border:1px solid rgba(255,255,255,.35); background:transparent; color:#fff;
    font-size:13px; font-weight:600; cursor:pointer; text-decoration:none; font-family:inherit;
}
.gc-mat-toolbar-btn:hover { background:rgba(255,255,255,.15); color:#fff; }
.gc-mat-toolbar-btn--solid { background:#fff; color:#00461B; border-color:#fff; }
.gc-mat-toolbar-btn--solid:hover { background:#F8FDF9; color:#00461B; }
.gc-mat-viewer-close {
    background:none; border:none; color:#fff; font-size:26px; cursor:pointer;
    line-height:1; padding:0 4px; margin-left:4px;
}
.gc-mat-viewer-close:hover { opacity:.85; }
.gc-mat-viewer-body-wrap {
    flex:1; min-height:0; display:flex; flex-direction:column; overflow:hidden;
}
.gc-mat-viewer-body {
    flex:1; min-height:0; height:calc(100dvh - 52px);
    display:flex; align-items:center; justify-content:center;
    overflow:auto; background:#2b2b2b; padding:8px; box-sizing:border-box;
}
.gc-mat-viewer-body--media { background:#111; padding:16px; }
.gc-mat-viewer-body--text { background:#fff; padding:0; align-items:stretch; justify-content:flex-start; }
.gc-mat-viewer-img {
    max-width:100%; max-height:100%; width:auto; height:auto;
    object-fit:contain; display:block; margin:auto;
}
.gc-mat-viewer-frame {
    flex:1; min-height:0; height:calc(100dvh - 52px);
    border:none; width:100%; background:#fff; display:block;
}
.gc-mat-viewer-audio { width:min(100%, 640px); margin:auto; display:block; }
.gc-mat-viewer-video {
    width:min(100%, 1100px); max-height:calc(100dvh - 80px);
    margin:auto; display:block; background:#000; border-radius:8px;
}
.gc-mat-text-pre {
    flex:1; width:100%; margin:0; padding:20px 24px; overflow:auto;
    font-size:13px; line-height:1.55; white-space:pre-wrap; word-break:break-word;
    font-family:Consolas, Monaco, monospace; color:#202124; background:#fff;
    box-sizing:border-box;
}
.gc-mat-office-html {
    flex:1; min-height:0; overflow:auto; background:#fff; color:#202124;
    padding:24px 32px 40px; font-size:14px; line-height:1.6;
    font-family:Segoe UI, system-ui, sans-serif;
}
.gc-mat-office-html table { border-collapse:collapse; width:100%; margin:14px 0; font-size:13px; }
.gc-mat-office-html th, .gc-mat-office-html td { border:1px solid #dadce0; padding:8px 12px; text-align:left; vertical-align:top; }
.gc-mat-office-html th { background:#f8f9fa; font-weight:700; }
.gc-mat-office-html img { max-width:100%; height:auto; margin:8px 0; }
.gc-mat-office-html h1, .gc-mat-office-html h2, .gc-mat-office-html h3 { margin:1.2em 0 .5em; color:#00461B; }
.gc-mat-office-html p { margin:0 0 .75em; }
.gc-mat-office-html ul, .gc-mat-office-html ol { margin:0 0 .75em 1.4em; }
.gc-mat-plain { white-space:pre-wrap; word-break:break-word; font-family:Consolas, Monaco, monospace; font-size:13px; }
.gc-mat-empty { color:#5f6368; font-style:italic; }
.gc-mat-viewer-fallback {
    flex:1; min-height:0; display:flex; flex-direction:column; align-items:center; justify-content:center;
    gap:16px; padding:32px 24px; color:#202124; font-size:14px; background:#fff; text-align:center;
}
.gc-mat-viewer-fallback p { margin:0; max-width:420px; line-height:1.55; color:#5f6368; }
.gc-mat-viewer-loading {
    flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center;
    gap:14px; color:#e8eaed; font-size:15px; font-weight:600;
}
.gc-mat-spinner {
    width:36px; height:36px; border:3px solid rgba(255,255,255,.2);
    border-top-color:#fff; border-radius:50%; animation:gc-mat-spin .8s linear infinite;
}
@keyframes gc-mat-spin { to { transform:rotate(360deg); } }

.gc-mat-pptx-viewer {
    flex:1; min-height:0; display:flex; flex-direction:column; background:#1e1e1e;
}
.gc-mat-pptx-navbar {
    display:flex; align-items:center; justify-content:center; gap:16px; flex-shrink:0;
    padding:10px 16px; background:#111; border-bottom:1px solid #333; color:#fff;
}
.gc-mat-pptx-navbtn {
    padding:6px 14px; border-radius:6px; border:1px solid rgba(255,255,255,.3);
    background:rgba(255,255,255,.08); color:#fff; font-size:13px; font-weight:600;
    cursor:pointer; font-family:inherit;
}
.gc-mat-pptx-navbtn:hover { background:rgba(255,255,255,.16); }
.gc-mat-pptx-navbtn:disabled { opacity:.35; cursor:not-allowed; }
.gc-mat-pptx-counter { font-size:13px; font-weight:600; min-width:120px; text-align:center; color:#e8eaed; }
.gc-mat-pptx-stage {
    flex:1; min-height:0; display:flex; align-items:center; justify-content:center;
    padding:16px; overflow:auto; background:#1e1e1e;
}
.gc-mat-pptx-main-img {
    display:block; max-width:min(100%, 1100px); max-height:calc(100vh - 220px);
    width:auto; height:auto; background:#fff; border-radius:8px;
    box-shadow:0 8px 28px rgba(0,0,0,.45);
}
.gc-mat-pptx-thumbs {
    flex-shrink:0; display:flex; gap:8px; padding:10px 14px; overflow-x:auto;
    background:#111; border-top:1px solid #333;
}
.gc-mat-pptx-thumb {
    flex:0 0 auto; width:108px; padding:0; border:2px solid transparent;
    border-radius:6px; background:none; cursor:pointer; opacity:.55;
    transition:border-color .15s, opacity .15s; overflow:hidden;
}
.gc-mat-pptx-thumb.is-active { border-color:#86efac; opacity:1; }
.gc-mat-pptx-thumb img { display:block; width:100%; height:62px; object-fit:cover; background:#fff; }
.gc-mat-pptx-thumb span {
    display:block; text-align:center; font-size:10px; font-weight:700;
    color:#e8eaed; padding:3px 0 5px; background:#1a1a1a;
}
`;
}
