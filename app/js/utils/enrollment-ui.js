/**
 * Shared enrollment form — subject code + section join
 */
import { Api } from '../api.js';
import { icon } from './icons.js';
import { normalizeSubjectCode, startQrScanner, stopQrScanner } from './qr-utils.js';

const inl = { size: 14, className: 'ui-icon-inline' };

export function enrollmentFormStyles(compact = false) {
    return `
        .enr-form-group { margin-bottom: ${compact ? '14px' : '16px'}; }
        .enr-form-label { display: block; font-size: 13px; font-weight: 600; color: #404040; margin-bottom: 6px; }
        .enr-mode-tabs {
            display: flex; gap: 8px; margin-bottom: 14px;
            background: #f3f4f6; padding: 4px; border-radius: 10px;
        }
        .enr-mode-tab {
            flex: 1; border: none; background: transparent; color: #525252;
            padding: 8px 10px; border-radius: 8px; font-size: 13px; font-weight: 600;
            cursor: pointer; transition: background .15s, color .15s;
        }
        .enr-mode-tab.active { background: #fff; color: #00461B; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
        .enr-code-input {
            width: 100%; padding: ${compact ? '12px 14px' : '14px 16px'};
            border: 2px solid #e0e0e0; border-radius: 10px;
            font-size: ${compact ? '16px' : '18px'}; font-family: monospace; font-weight: 700;
            text-align: center; letter-spacing: 2px; text-transform: uppercase; box-sizing: border-box;
        }
        .enr-code-input:focus { outline: none; border-color: #00461B; }
        .enr-code-hint { font-size: 12px; color: #737373; margin-top: 6px; text-align: center; }
        .enr-qr-wrap {
            border: 2px dashed #d4d4d4; border-radius: 12px; overflow: hidden;
            background: #fafafa; min-height: 220px;
        }
        .enr-btn-primary {
            width: 100%; background: #00461B;
            color: #fff; border: none; padding: 12px 20px; border-radius: 10px;
            font-weight: 600; font-size: 15px; cursor: pointer; transition: all .2s;
        }
        .enr-btn-primary:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,70,27,.3); }
        .enr-btn-primary:disabled { opacity: .5; cursor: not-allowed; transform: none; }
        .enr-btn-secondary {
            width: 100%; background: #f5f5f5; color: #404040; border: 1px solid #e0e0e0;
            padding: 11px 20px; border-radius: 10px; font-weight: 600; font-size: 14px;
            cursor: pointer; margin-top: 8px;
        }
        .enr-btn-secondary:hover { background: #ebebeb; }
        .enr-alert { padding: 12px 16px; border-radius: 10px; margin-bottom: 16px; font-size: 14px; }
        .enr-alert-success { background: #E8F5E9; color: #1B4D3E; }
        .enr-alert-error { background: #FEE2E2; color: #b91c1c; }
        .enr-preview-section { font-size: 18px; font-weight: 800; color: #1a1a1a; margin-bottom: 4px; }
        .enr-preview-code {
            display: inline-block; background: #E8F5E9; color: #1B4D3E;
            font-family: monospace; font-size: 15px; font-weight: 700;
            padding: 4px 12px; border-radius: 6px; margin-bottom: 12px;
        }
        .enr-preview-capacity { font-size: 13px; color: #737373; margin-bottom: 16px; }
        .enr-preview-divider { border: none; border-top: 1px solid #f0f0f0; margin: 16px 0; }
        .enr-preview-label {
            font-size: 11px; font-weight: 700; color: #9ca3af;
            text-transform: uppercase; letter-spacing: .8px; margin-bottom: 10px;
        }
        .enr-preview-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
        .enr-preview-row {
            display: flex; align-items: flex-start; gap: 10px;
            padding: 10px 12px; background: #f9fafb; border-radius: 8px;
        }
        .enr-preview-row.new { background: #F2F8F2; border: 1px solid #d4edda; }
        .enr-preview-row.done { opacity: .55; }
        .enr-psrow-code {
            font-family: monospace; font-size: 11px; font-weight: 700; color: #1B4D3E;
            background: #E8F5E9; padding: 2px 6px; border-radius: 4px; display: inline-block; margin-bottom: 3px;
        }
        .enr-psrow-name { font-size: 13px; font-weight: 600; color: #1a1a1a; }
        .enr-psrow-meta { font-size: 11px; color: #737373; margin-top: 2px; }
        .enr-section-pick { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
        .enr-section-opt {
            text-align: left; border: 2px solid #e5e7eb; border-radius: 10px;
            padding: 12px 14px; background: #fff; cursor: pointer; transition: border-color .15s, background .15s;
        }
        .enr-section-opt:hover { border-color: #00461B; background: #F2F8F2; }
        .enr-section-opt strong { display: block; font-size: 14px; color: #111; }
        .enr-section-opt span { font-size: 12px; color: #6b7280; }
        .enr-qr-canvas { display: block; margin: 0 auto; border-radius: 8px; }
        .mc-qr-box { margin-top: 8px; text-align: center; }
        .mc-qr-box canvas { border-radius: 8px; border: 1px solid #e5e7eb; }
    `;
}

function esc(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
}

function entryHtml() {
    return `
        <div class="enr-mode-tabs">
            <button type="button" class="enr-mode-tab active" data-mode="type">Enter Code</button>
            <button type="button" class="enr-mode-tab" data-mode="scan">Scan QR</button>
        </div>
        <div id="enr-mode-type">
            <div class="enr-form-group">
                <label class="enr-form-label">Subject Code</label>
                <input type="text" class="enr-code-input" id="enr-code" placeholder="IT 202" maxlength="20" autocomplete="off">
                <div class="enr-code-hint">Enter the subject code from your instructor (e.g. IT 202)</div>
            </div>
            <button type="button" class="enr-btn-primary" id="enr-check">Find Class</button>
        </div>
        <div id="enr-mode-scan" hidden>
            <div class="enr-qr-wrap" id="enr-qr-reader"></div>
            <div class="enr-code-hint" style="margin:10px 0 0">Point your camera at the subject QR code</div>
            <button type="button" class="enr-btn-secondary" id="enr-scan-stop">Enter code instead</button>
        </div>
    `;
}

function bindCodeInput(root) {
    const input = root.querySelector('#enr-code');
    if (!input || input.dataset.bound) return input;
    input.dataset.bound = '1';
    input.addEventListener('input', (e) => {
        e.target.value = e.target.value.toUpperCase();
    });
    return input;
}

function joinPayload(subjectCode, sectionId = 0) {
    const payload = { subject_code: normalizeSubjectCode(subjectCode) };
    if (sectionId) payload.section_id = sectionId;
    return payload;
}

/**
 * @param {HTMLElement} bodyEl
 * @param {{ onSuccess?: () => void, initialSubjectCode?: string, initialSectionId?: number }} opts
 */
export function mountEnrollmentForm(bodyEl, opts = {}) {
    let activeMode = 'type';
    let pendingSubject = opts.initialSubjectCode || '';
    let pendingSectionId = opts.initialSectionId || 0;

    const alertEl = bodyEl.querySelector('#enr-alert') || (() => {
        const el = document.createElement('div');
        el.id = 'enr-alert';
        bodyEl.prepend(el);
        return el;
    })();

    async function setMode(mode) {
        activeMode = mode;
        const typePanel = bodyEl.querySelector('#enr-mode-type');
        const scanPanel = bodyEl.querySelector('#enr-mode-scan');
        bodyEl.querySelectorAll('.enr-mode-tab').forEach((tab) => {
            tab.classList.toggle('active', tab.dataset.mode === mode);
        });
        if (typePanel) typePanel.hidden = mode !== 'type';
        if (scanPanel) scanPanel.hidden = mode !== 'scan';

        if (mode === 'scan') {
            try {
                await startQrScanner('enr-qr-reader', (params) => {
                    applyJoinAndCheck(params.subject_code, params.section_id);
                });
            } catch (_) {
                const alert = bodyEl.querySelector('#enr-alert');
                if (alert) {
                    alert.innerHTML = '<div class="enr-alert enr-alert-error">Could not access camera. Enter the subject code manually.</div>';
                }
                setMode('type');
            }
        } else {
            await stopQrScanner();
        }
    }

    function bindEntryEvents() {
        bodyEl.querySelectorAll('.enr-mode-tab').forEach((tab) => {
            tab.addEventListener('click', () => setMode(tab.dataset.mode || 'type'));
        });
        bodyEl.querySelector('#enr-scan-stop')?.addEventListener('click', () => setMode('type'));
        bodyEl.querySelector('#enr-check')?.addEventListener('click', () => {
            const input = bodyEl.querySelector('#enr-code');
            applyJoinAndCheck(input?.value.trim() || '', 0);
        });
        const input = bindCodeInput(bodyEl);
        input?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') bodyEl.querySelector('#enr-check')?.click();
        });
    }

    function resetForm() {
        stopQrScanner();
        alertEl.innerHTML = '';
        bodyEl.innerHTML = `<div id="enr-alert"></div>${entryHtml()}`;
        bindEntryEvents();
        const input = bodyEl.querySelector('#enr-code');
        if (pendingSubject) {
            const code = normalizeSubjectCode(pendingSubject);
            const sectionId = pendingSectionId;
            pendingSubject = '';
            pendingSectionId = 0;
            if (input) input.value = code;
            if (code.length >= 2) {
                setTimeout(() => applyJoinAndCheck(code, sectionId), 80);
            } else {
                input?.focus();
            }
        } else {
            input?.focus();
        }
    }

    async function applyJoinAndCheck(rawCode, sectionId = 0) {
        const subjectCode = normalizeSubjectCode(rawCode);
        if (!subjectCode || subjectCode.length < 2) {
            const alert = bodyEl.querySelector('#enr-alert');
            if (alert) {
                alert.innerHTML = '<div class="enr-alert enr-alert-error">Enter a valid subject code (e.g. IT101)</div>';
            }
            return;
        }
        await stopQrScanner();
        if (activeMode === 'scan') await setMode('type');
        const input = bodyEl.querySelector('#enr-code');
        if (input) input.value = subjectCode;
        await checkJoin(subjectCode, sectionId);
    }

    async function checkJoin(subjectCode, sectionId = 0) {
        const btn = bodyEl.querySelector('#enr-check');
        const alert = bodyEl.querySelector('#enr-alert');
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Looking up...';
        } else if (alert) {
            alert.innerHTML = '<div class="enr-alert" style="background:#f3f4f6;color:#525252">Looking up class...</div>';
        }

        let res;
        try {
            res = await Api.post('/EnrollmentAPI.php?action=preview', joinPayload(subjectCode, sectionId));
        } catch (_) {
            res = { success: false, message: 'Could not reach the server. Please try again.' };
        }

        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Find Class';
        }

        if (!res?.success) {
            if (alert) {
                alert.innerHTML = `<div class="enr-alert enr-alert-error">${esc(res?.message || 'Could not find that class.')}</div>`;
            }
            return;
        }

        if (alert) alert.innerHTML = '';
        if (res.data?.needs_section) {
            showSectionPicker(res.data);
            return;
        }
        showPreview(res.data, subjectCode, sectionId || res.data.section_id);
    }

    function showSectionPicker(data) {
        const { subject_code, sections } = data;
        bodyEl.innerHTML = `
            <div id="enr-alert"></div>
            <div class="enr-preview-code">${esc(subject_code)}</div>
            <div class="enr-preview-label">Select your section</div>
            <div class="enr-section-pick">
                ${sections.map((sec) => `
                    <button type="button" class="enr-section-opt" data-section-id="${sec.section_id}">
                        <strong>${esc(sec.section_name)}</strong>
                        <span>
                            ${sec.instructor_name ? esc(sec.instructor_name) : 'TBA'}
                            ${sec.schedule ? ' · ' + esc(sec.schedule) : ''}
                            ${sec.room ? ' · ' + esc(sec.room) : ''}
                            · ${Number(sec.current_enrollment)}/${Number(sec.max_students)} enrolled
                        </span>
                    </button>
                `).join('')}
            </div>
            <button type="button" class="enr-btn-secondary" id="enr-back">← Back</button>
        `;

        bodyEl.querySelector('#enr-back')?.addEventListener('click', resetForm);
        bodyEl.querySelectorAll('[data-section-id]').forEach((btn) => {
            btn.addEventListener('click', () => {
                checkJoin(subject_code, parseInt(btn.dataset.sectionId, 10));
            });
        });
    }

    function showPreview(data, subjectCode, sectionId) {
        const {
            section_name, subject_code, subject_name, max_students,
            current_enrollment, subjects, new_count,
        } = data;
        const code = subject_code || subjectCode;
        const spots = max_students > 0 ? max_students - current_enrollment : Infinity;
        const allDone = new_count === 0;
        const isFull = max_students > 0 && spots <= 0 && !allDone;
        const sid = sectionId || data.section_id;

        const subjectRows = (subjects || []).map((s) => {
            if (s.already_enrolled) {
                return `
                    <div class="enr-preview-row done">
                        <span>${icon('check', inl)}</span>
                        <div>
                            <span class="enr-psrow-code" style="background:#f3f4f6;color:#6b7280">${esc(s.subject_code)}</span>
                            <div class="enr-psrow-name" style="color:#6b7280">${esc(s.subject_name)}</div>
                            <div class="enr-psrow-meta">Already enrolled</div>
                        </div>
                    </div>`;
            }
            return `
                <div class="enr-preview-row new">
                    <span style="color:#00461B;font-weight:700">+</span>
                    <div>
                        <span class="enr-psrow-code">${esc(s.subject_code)}</span>
                        <div class="enr-psrow-name">${esc(s.subject_name)}</div>
                        <div class="enr-psrow-meta">
                            ${s.instructor_name ? esc(s.instructor_name) : 'TBA'}
                            ${s.schedule ? ' · ' + esc(s.schedule) : ''}
                            ${s.room ? ' · ' + esc(s.room) : ''}
                            &nbsp;·&nbsp; ${s.units || 0} units
                        </div>
                    </div>
                </div>`;
        }).join('');

        const btnLabel = allDone ? 'Already Enrolled' : 'Confirm & Join';

        bodyEl.innerHTML = `
            <div id="enr-alert"></div>
            <div class="enr-preview-code">${esc(code)}</div>
            <div class="enr-preview-section">${esc(subject_name || code)}</div>
            <div class="enr-preview-capacity" style="font-size:13px;color:#525252;margin-bottom:8px">
                Section: <strong>${esc(section_name)}</strong>
            </div>
            <div class="enr-preview-capacity" style="${isFull ? 'color:#b91c1c;font-weight:600' : ''}">
                ${current_enrollment} / ${max_students} enrolled · ${spots === Infinity ? 'Unlimited' : spots + ' spot' + (spots !== 1 ? 's' : '') + ' left'}
            </div>
            <hr class="enr-preview-divider">
            <div class="enr-preview-label">${allDone ? 'Already enrolled in this subject' : 'You will join this class'}</div>
            <div class="enr-preview-list">${subjectRows}</div>
            ${allDone ? '<div class="enr-alert enr-alert-success">You are already enrolled in this subject.</div>' : ''}
            ${isFull ? '<div class="enr-alert enr-alert-error">This section is full.</div>' : ''}
            <button type="button" class="enr-btn-primary" id="enr-confirm" ${allDone || isFull ? 'disabled' : ''}>
                ${isFull ? 'Section Full' : btnLabel}
            </button>
            <button type="button" class="enr-btn-secondary" id="enr-back">← Back</button>
        `;

        bodyEl.querySelector('#enr-back')?.addEventListener('click', resetForm);
        bodyEl.querySelector('#enr-confirm')?.addEventListener('click', async () => {
            const confirmBtn = bodyEl.querySelector('#enr-confirm');
            const backBtn = bodyEl.querySelector('#enr-back');
            const alert = bodyEl.querySelector('#enr-alert');
            confirmBtn.disabled = true;
            confirmBtn.textContent = 'Joining...';
            backBtn.disabled = true;

            const res = await Api.post('/EnrollmentAPI.php?action=enroll', joinPayload(code, sid));

            if (res.success) {
                alert.innerHTML = `<div class="enr-alert enr-alert-success">${esc(res.message)}</div>`;
                setTimeout(() => opts.onSuccess?.(), 900);
            } else {
                confirmBtn.disabled = false;
                confirmBtn.textContent = btnLabel;
                backBtn.disabled = false;
                alert.innerHTML = `<div class="enr-alert enr-alert-error">${esc(res.message)}</div>`;
            }
        });
    }

    resetForm();
    return {
        resetForm,
        setInitialJoin(subjectCode, sectionId = 0) {
            pendingSubject = subjectCode || '';
            pendingSectionId = sectionId || 0;
            resetForm();
        },
    };
}
