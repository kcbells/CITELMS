/**
 * QR helpers — subject code + section join links
 */
import { BASE_URL } from '../api.js';

const QR_LIB = 'https://cdn.jsdelivr.net/npm/qrcode@1.5.4/build/qrcode.min.js';
const SCAN_LIB = 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js';

function loadScript(src) {
    return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) {
            resolve();
            return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load script'));
        document.head.appendChild(script);
    });
}

export function normalizeSubjectCode(raw) {
    return String(raw || '').toUpperCase().replace(/\s+/g, ' ').trim();
}

export function parseJoinParamsFromScan(raw) {
    const text = String(raw || '').trim();
    if (!text) return { subject_code: '', section_id: 0, enrollment_code: '', subject_id: 0 };

    try {
        let url;
        if (text.includes('://')) {
            url = new URL(text);
        } else if (
            text.includes('subject_code=')
            || text.includes('enrollment_code=')
            || text.includes('section_id=')
            || text.startsWith('#')
            || text.startsWith('?')
        ) {
            const path = text.startsWith('#') || text.startsWith('?')
                ? '/app/dashboard.html' + (text.startsWith('?') ? text : text.replace(/^#/, '?'))
                : text;
            url = new URL(path, window.location.origin + BASE_URL);
        }

        if (url) {
            const fromQuery = {
                subject_code: url.searchParams.get('subject_code') || '',
                section_id: parseInt(url.searchParams.get('section_id') || '0', 10) || 0,
                enrollment_code: url.searchParams.get('enrollment_code') || '',
                subject_id: parseInt(url.searchParams.get('subject_id') || '0', 10) || 0,
            };
            if (fromQuery.enrollment_code) {
                return { subject_code: '', section_id: 0, enrollment_code: fromQuery.enrollment_code.toUpperCase(), subject_id: fromQuery.subject_id };
            }
            if (fromQuery.subject_code) {
                return {
                    subject_code: normalizeSubjectCode(fromQuery.subject_code),
                    section_id: fromQuery.section_id,
                    enrollment_code: '',
                    subject_id: 0,
                };
            }

            const hash = url.hash.replace(/^#/, '');
            const query = hash.includes('?') ? hash.split('?')[1] : '';
            if (query) {
                const params = new URLSearchParams(query);
                const enrollmentCode = params.get('enrollment_code') || '';
                const subjectIdHint = parseInt(params.get('subject_id') || '0', 10) || 0;
                if (enrollmentCode) {
                    return { subject_code: '', section_id: 0, enrollment_code: enrollmentCode.toUpperCase(), subject_id: subjectIdHint };
                }
                const subjectCode = params.get('subject_code') || '';
                if (subjectCode) {
                    return {
                        subject_code: normalizeSubjectCode(subjectCode),
                        section_id: parseInt(params.get('section_id') || '0', 10) || 0,
                        enrollment_code: '',
                        subject_id: 0,
                    };
                }
            }
        }
    } catch (_) {
        /* fall through */
    }

    // Plain text: a unique class/enrollment code (new 8-char format, or legacy XXX-9999
    // format from sections created before the format change) — otherwise a subject code
    const plain = text.toUpperCase().replace(/\s+/g, '');
    const ENROLLMENT_CODE_RE = /^([A-Z0-9]{8}|[A-Z0-9]{3}-[A-Z0-9]{4})$/;
    if (ENROLLMENT_CODE_RE.test(plain)) {
        return { subject_code: '', section_id: 0, enrollment_code: plain, subject_id: 0 };
    }
    if (/^[A-Z0-9-]{2,20}$/i.test(text)) {
        return { subject_code: normalizeSubjectCode(text), section_id: 0, enrollment_code: '', subject_id: 0 };
    }

    return { subject_code: '', section_id: 0, enrollment_code: '', subject_id: 0 };
}

export function buildStudentJoinUrl(subjectCode, sectionId = 0) {
    const code = normalizeSubjectCode(subjectCode);
    const params = new URLSearchParams({ subject_code: code });
    if (sectionId) params.set('section_id', String(sectionId));
    return `${window.location.origin}${BASE_URL}/index.html?${params.toString()}`;
}

/**
 * @param {string} enrollmentCode  the section's own class code
 * @param {number} [subjectId]  when this QR is shown from one specific
 *        subject's Classwork page, scope the join to just that subject —
 *        otherwise a section's code joins EVERY subject taught to it at
 *        once, which is surprising when an instructor hands out "their"
 *        class code expecting it to cover only their own class.
 */
export function buildStudentJoinUrlByEnrollmentCode(enrollmentCode, subjectId = 0) {
    const code = String(enrollmentCode || '').toUpperCase().replace(/\s+/g, '');
    const params = new URLSearchParams({ enrollment_code: code });
    if (subjectId) params.set('subject_id', String(subjectId));
    return `${window.location.origin}${BASE_URL}/index.html?${params.toString()}`;
}

export function buildDashboardJoinHash(subjectCode, sectionId = 0) {
    const code = normalizeSubjectCode(subjectCode);
    let hash = `student/my-subjects?join=1&subject_code=${encodeURIComponent(code)}`;
    if (sectionId) hash += `&section_id=${encodeURIComponent(String(sectionId))}`;
    return hash;
}

function renderQrImageFallback(container, text, size) {
    const img = document.createElement('img');
    img.className = 'enr-qr-canvas';
    img.alt = 'QR code';
    img.width = size;
    img.height = size;
    img.src = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(text)}`;
    container.appendChild(img);
}

export async function renderQrInto(container, text, size = 148) {
    if (!container) return;
    container.innerHTML = '';
    try {
        await loadScript(QR_LIB);
        if (window.QRCode?.toCanvas) {
            const canvas = document.createElement('canvas');
            canvas.className = 'enr-qr-canvas';
            container.appendChild(canvas);
            await window.QRCode.toCanvas(canvas, text, {
                width: size,
                margin: 1,
                color: { dark: '#00461B', light: '#ffffff' },
            });
            return;
        }
    } catch (_) {
        /* fall through to image API */
    }
    renderQrImageFallback(container, text, size);
}

let activeScanner = null;

export async function startQrScanner(elementId, onJoin) {
    await loadScript(SCAN_LIB);
    await stopQrScanner();

    const scanner = new window.Html5Qrcode(elementId);
    activeScanner = scanner;

    await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decoded) => {
            const params = parseJoinParamsFromScan(decoded);
            if (params.subject_code || params.enrollment_code) onJoin?.(params);
        },
        () => {}
    );

    return scanner;
}

export async function stopQrScanner() {
    if (!activeScanner) return;
    try {
        if (activeScanner.isScanning) await activeScanner.stop();
        await activeScanner.clear();
    } catch (_) {
        /* ignore */
    }
    activeScanner = null;
}

// Legacy alias
export const normalizeEnrollmentCode = normalizeSubjectCode;
