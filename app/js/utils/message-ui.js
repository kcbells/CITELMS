/**
 * Shared message attachment rendering & upload helpers
 */
import { BASE_URL } from '../api.js';

export const MSG_MAX_ATTACH = 2 * 1024 * 1024;
export const MSG_ALLOW_ATTACH = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf',
];

/** Secure URL — only participants can load via MessagingAPI */
export function messageAttachmentUrl(messageId) {
    if (!messageId) return '';
    return `${BASE_URL}/api/MessagingAPI.php?action=attachment&message_id=${encodeURIComponent(messageId)}`;
}

export function isImageAttachment(m) {
    if (!m?.attachment_path) return false;
    if (m.attachment_type === 'image') return true;
    const name = (m.attachment_name || m.attachment_path || '').toLowerCase();
    return /\.(jpe?g|png|gif|webp)$/.test(name);
}

export function isPdfAttachment(m) {
    if (!m?.attachment_path) return false;
    if (m.attachment_type === 'file') {
        return (m.attachment_name || '').toLowerCase().endsWith('.pdf');
    }
    return (m.attachment_name || m.attachment_path || '').toLowerCase().endsWith('.pdf');
}

/**
 * @param {object} m message row from API
 * @param {number|string} meId
 * @param {function} esc html escape fn
 * @param {{ imgClass?: string, fileClass?: string, preview?: boolean }} opts
 */
export function renderMessageBody(m, meId, esc, opts = {}) {
    const {
        imgClass = 'msg-att-img',
        fileClass = 'msg-att-file',
        preview = true,
    } = opts;

    let html = '';

    if (m.attachment_path && m.message_id) {
        const url = messageAttachmentUrl(m.message_id);
        const name = esc(m.attachment_name || 'Attachment');

        if (isImageAttachment(m)) {
            html += `<div class="msg-att-wrap">
                <button type="button" class="msg-att-img-btn" data-preview="${esc(url)}" data-name="${name}" title="View image">
                    <img class="${imgClass}" src="${esc(url)}" alt="${name}" loading="lazy" decoding="async">
                </button>
            </div>`;
        } else if (isPdfAttachment(m)) {
            html += `<a class="${fileClass} msg-att-pdf" href="${esc(url)}" target="_blank" rel="noopener">
                <span class="msg-att-pdf-icon" aria-hidden="true">PDF</span>
                <span class="msg-att-pdf-name">${name}</span>
            </a>`;
        } else {
            html += `<a class="${fileClass}" href="${esc(url)}" target="_blank" rel="noopener" download>
                ${name}
            </a>`;
        }
    }

    const text = (m.content || '').trim();
    const isAttachOnly = (text.startsWith('[Attachment] ') || text.startsWith('📎 ')) && m.attachment_path;
    if (text && !isAttachOnly) {
        html += `<div class="msg-att-text">${esc(text)}</div>`;
    }

    return html;
}

export function validateMessageFile(file) {
    if (!file) return { ok: false, message: 'No file selected' };
    if (file.size > MSG_MAX_ATTACH) {
        return { ok: false, message: 'File too large. Max 2MB.' };
    }
    const okType = MSG_ALLOW_ATTACH.includes(file.type)
        || /\.(jpe?g|png|gif|webp|pdf)$/i.test(file.name || '');
    if (!okType) {
        return { ok: false, message: 'Allowed: JPG, PNG, GIF, WEBP, PDF only.' };
    }
    return { ok: true };
}

export function bindImagePreview(root = document) {
    root.querySelectorAll('.msg-att-img-btn[data-preview]').forEach(btn => {
        if (btn.dataset.bound) return;
        btn.dataset.bound = '1';
        btn.addEventListener('click', () => {
            openImagePreview(btn.dataset.preview, btn.dataset.name);
        });
    });
}

export function openImagePreview(url, name = 'Image') {
    let overlay = document.getElementById('msg-preview-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'msg-preview-overlay';
        overlay.className = 'msg-preview-overlay';
        overlay.innerHTML = `
            <div class="msg-preview-box" role="dialog" aria-label="Image preview">
                <div class="msg-preview-head">
                    <span id="msg-preview-title"></span>
                    <button type="button" id="msg-preview-close" aria-label="Close">&times;</button>
                </div>
                <img id="msg-preview-img" alt="">
                <a id="msg-preview-open" href="#" target="_blank" rel="noopener">Open full size</a>
            </div>`;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.classList.remove('msg-preview-open');
        });
        overlay.querySelector('#msg-preview-close')?.addEventListener('click', () => {
            overlay.classList.remove('msg-preview-open');
        });
        if (!document.getElementById('msg-preview-styles')) {
            const s = document.createElement('style');
            s.id = 'msg-preview-styles';
            s.textContent = `
                .msg-preview-overlay {
                    position:fixed; inset:0; z-index:10050; background:rgba(0,0,0,.75);
                    display:none; align-items:center; justify-content:center; padding:20px;
                }
                .msg-preview-overlay.msg-preview-open { display:flex; }
                .msg-preview-box {
                    background:#fff; border-radius:12px; max-width:min(92vw, 720px);
                    max-height:90vh; display:flex; flex-direction:column; overflow:hidden;
                }
                .msg-preview-head {
                    display:flex; justify-content:space-between; align-items:center;
                    padding:10px 14px; border-bottom:1px solid #eee; font-size:13px; font-weight:600;
                }
                #msg-preview-close {
                    border:none; background:#f3f4f6; width:28px; height:28px;
                    border-radius:50%; cursor:pointer; font-size:18px; line-height:1;
                }
                #msg-preview-img { max-width:100%; max-height:calc(90vh - 100px); object-fit:contain; }
                #msg-preview-open {
                    padding:10px 14px; font-size:12px; font-weight:700; color:#00461B;
                    text-align:center; text-decoration:none; border-top:1px solid #eee;
                }
                .msg-att-wrap { margin-bottom:4px; }
                .msg-att-img-btn {
                    border:none; padding:0; background:transparent; cursor:zoom-in;
                    display:block; max-width:100%;
                }
                .msg-att-img { max-width:min(240px, 100%); max-height:200px; border-radius:10px; display:block; object-fit:cover; }
                .msg-att-file, .msg-att-pdf {
                    display:inline-flex; align-items:center; gap:8px;
                    padding:8px 12px; border-radius:10px; text-decoration:none;
                    font-size:12px; font-weight:600; margin-bottom:4px;
                    background:rgba(0,0,0,.08); color:inherit;
                }
                .msg-row.mine .msg-att-file, .msg-row.mine .msg-att-pdf { background:rgba(255,255,255,.15); color:#fff; }
                .msg-att-pdf-icon {
                    background:#DC2626; color:#fff; font-size:10px; font-weight:800;
                    padding:4px 6px; border-radius:4px;
                }
                .msg-att-pdf-name { max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
                .msg-att-text { word-break:break-word; }
            `;
            document.head.appendChild(s);
        }
    }
    overlay.querySelector('#msg-preview-img').src = url;
    overlay.querySelector('#msg-preview-img').alt = name;
    overlay.querySelector('#msg-preview-title').textContent = name;
    const openLink = overlay.querySelector('#msg-preview-open');
    openLink.href = url;
    overlay.classList.add('msg-preview-open');
}
