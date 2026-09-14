/**
 * Dean Profile Page
 */
import { Api } from '../../api.js';
import { Auth } from '../../auth.js';
import { bindPasswordChangeOtp, attachStrengthMeter, attachEyeToggle } from '../../utils/password-change-otp.js';

import { esc } from '../../utils/classroom-ui.js';
export async function render(container) {
    const user = Auth.user();
    renderShell(container, user, [
        { label: 'Employee ID', value: user.employee_id || '—' },
        { label: 'Email',       value: user.email },
        { label: 'Department',  value: user.department_name || '—' },
        { label: 'Program',     value: user.program_code ? `${user.program_code} — ${user.program_name}` : (user.program_name || '—') },
        { label: 'Joined',      value: fmtDate(user.created_at) },
    ]);
    bindSave(container);
    bindPassword(container);
}

// esc() imported from classroom-ui.js (see import above)

function fmtDate(d) { return d ? new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—'; }

function renderShell(container, user, details) {
    container.innerHTML = sharedStyles() + `
        <div class="p-layout">
            <aside class="p-sidebar">
                <div class="p-sidebar-card">
                    <div class="p-banner"></div>
                    <div class="p-avatar">${Auth.initials()}</div>
                    <div class="p-identity">
                        <div class="p-name">${esc(user.first_name)} ${esc(user.last_name)}</div>
                        <div class="p-role">${esc(user.role)}</div>
                    </div>
                    <div class="p-details">
                        ${details.map(d => `
                        <div class="p-detail">
                            <span class="p-detail-lbl">${d.label}</span>
                            <span class="p-detail-val">${esc(d.value)}</span>
                        </div>`).join('')}
                    </div>
                </div>
            </aside>

            <div class="p-main">
                <div class="p-panel">
                    <div class="p-panel-hd">
                        <div class="p-panel-icon" style="background:#F3F4F6;">
                            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#111" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"/></svg>
                        </div>
                        <div>
                            <h3>Personal Information</h3>
                            <p>Update your name and email address</p>
                        </div>
                    </div>
                    <div class="p-panel-bd">
                        <div id="info-alert"></div>
                        <div class="p-form-grid">
                            <div class="p-fg">
                                <label class="p-lbl">First Name</label>
                                <input class="p-input" id="f-fname" value="${esc(user.first_name || '')}">
                            </div>
                            <div class="p-fg">
                                <label class="p-lbl">Last Name</label>
                                <input class="p-input" id="f-lname" value="${esc(user.last_name || '')}">
                            </div>
                            <div class="p-fg p-full">
                                <label class="p-lbl">Email Address</label>
                                <input class="p-input" id="f-email" type="email" value="${esc(user.email || '')}">
                            </div>
                        </div>
                        <div class="p-actions">
                            <button class="p-btn" id="btn-info">Save Changes</button>
                        </div>
                    </div>
                </div>

                <div class="p-panel">
                    <div class="p-panel-hd">
                        <div class="p-panel-icon" style="background:#F3F4F6;">
                            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#111" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"/></svg>
                        </div>
                        <div>
                            <h3>Security &amp; Password</h3>
                            <p>A verification code will be sent to your email before the change takes effect</p>
                        </div>
                    </div>
                    <div class="p-panel-bd">
                        <div id="pw-alert"></div>
                        <div class="p-fg p-full" style="margin-bottom:16px;">
                            <label class="p-lbl">Current Password</label>
                            <input type="password" class="p-input" id="f-curpw" placeholder="Enter current password">
                        </div>
                        <div class="p-form-grid">
                            <div class="p-fg">
                                <label class="p-lbl">New Password</label>
                                <input type="password" class="p-input" id="f-newpw" placeholder="Min. 8 characters">
                            </div>
                            <div class="p-fg">
                                <label class="p-lbl">Confirm New Password</label>
                                <input type="password" class="p-input" id="f-confirmpw" placeholder="Repeat new password">
                            </div>
                        </div>
                        <div class="p-actions">
                            <button class="p-btn p-btn-danger" id="btn-pw">Send Verification Code</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function bindSave(container) {
    container.querySelector('#btn-info').addEventListener('click', async () => {
        const al = container.querySelector('#info-alert');
        const payload = {
            first_name: container.querySelector('#f-fname').value.trim(),
            last_name:  container.querySelector('#f-lname').value.trim(),
            email:      container.querySelector('#f-email').value.trim(),
        };
        if (!payload.first_name || !payload.last_name || !payload.email) {
            al.innerHTML = mkAlert('All fields are required.', 'err'); return;
        }
        const res = await Api.post('/AuthAPI.php?action=update-profile', payload);
        al.innerHTML = res.success
            ? mkAlert('Profile updated successfully!', 'ok')
            : mkAlert(res.message || 'Failed to update profile.', 'err');
        if (res.success) await Auth.getUser();
    });
}

function bindPassword(container) {
    bindPasswordChangeOtp(container, {
        alertSelector:   '#pw-alert',
        curSelector:     '#f-curpw',
        newSelector:     '#f-newpw',
        confirmSelector: '#f-confirmpw',
        btnSelector:     '#btn-pw',
        okClass:  'p-alert p-alert-ok',
        errClass: 'p-alert p-alert-err',
    });
    // Strength meter must be attached BEFORE eye toggle so it lands outside the wrapper
    attachStrengthMeter(container.querySelector('#f-newpw'));
    attachEyeToggle(container.querySelector('#f-curpw'));
    attachEyeToggle(container.querySelector('#f-newpw'));
    attachEyeToggle(container.querySelector('#f-confirmpw'));
}

function mkAlert(msg, type) {
    return `<div class="p-alert p-alert-${type}" style="margin-bottom:14px;">${esc(msg)}</div>`;
}

function sharedStyles() {
    return `<style>
        .p-layout { display:grid; grid-template-columns:280px 1fr; gap:24px; align-items:start; }
        .p-sidebar { position:sticky; top:24px; }
        .p-sidebar-card { background:#fff; border:1px solid #e8e8e8; border-radius:18px; overflow:hidden; }
        .p-banner { height:90px; background:linear-gradient(135deg,#00461B 0%,#006b2b 100%); }
        .p-avatar { width:76px; height:76px; border-radius:50%; background:#fff; color:#00461B; display:flex; align-items:center; justify-content:center; font-size:26px; font-weight:800; border:4px solid #fff; box-shadow:0 4px 14px rgba(0,0,0,.13); margin:-38px auto 0; position:relative; z-index:1; }
        .p-identity { text-align:center; padding:14px 20px 16px; }
        .p-name { font-size:18px; font-weight:800; color:#1f2937; }
        .p-role { display:inline-block; background:#00461B; color:#fff; border:1px solid #bbf7d0; padding:4px 14px; border-radius:20px; font-size:12px; font-weight:700; text-transform:capitalize; margin-top:6px; }
        .p-details { border-top:1px solid #f3f4f6; padding:8px 0 12px; }
        .p-detail { display:flex; justify-content:space-between; align-items:flex-start; padding:10px 20px; gap:12px; }
        .p-detail + .p-detail { border-top:1px solid #f9fafb; }
        .p-detail-lbl { font-size:11px; font-weight:700; color:#9ca3af; text-transform:uppercase; letter-spacing:.6px; white-space:nowrap; padding-top:1px; }
        .p-detail-val { font-size:13px; font-weight:600; color:#374151; text-align:right; word-break:break-word; max-width:160px; }
        .p-main { display:flex; flex-direction:column; gap:20px; }
        .p-panel { background:#fff; border:1px solid #e8e8e8; border-radius:16px; overflow:hidden; }
        .p-panel-hd { padding:18px 24px; border-bottom:1px solid #f0f0f0; display:flex; align-items:flex-start; gap:12px; }
        .p-panel-icon { width:38px; height:38px; border-radius:10px; flex-shrink:0; display:flex; align-items:center; justify-content:center; }
        .p-panel-hd h3 { margin:0 0 2px; font-size:15px; font-weight:700; color:#111827; }
        .p-panel-hd p  { margin:0; font-size:12.5px; color:#9ca3af; }
        .p-panel-bd { padding:24px; }
        .p-form-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
        .p-full { grid-column:1/-1; }
        .p-fg { display:flex; flex-direction:column; }
        .p-lbl { font-size:11.5px; font-weight:700; color:#6b7280; text-transform:uppercase; letter-spacing:.5px; margin-bottom:6px; }
        .p-input { padding:11px 14px; border:1.5px solid #e5e7eb; border-radius:10px; font-size:14px; color:#111827; background:#fff; box-sizing:border-box; width:100%; transition:border .15s, box-shadow .15s; }
        .p-input:focus { outline:none; border-color:#00461B; box-shadow:0 0 0 3px rgba(0,70,27,.09); }
        .p-actions { display:flex; justify-content:flex-end; padding-top:20px; }
        .p-btn { padding:10px 26px; border:none; border-radius:10px; font-size:14px; font-weight:700; cursor:pointer; background:#00461B; color:#fff; transition:box-shadow .2s, transform .15s; }
        .p-btn:hover { box-shadow:0 4px 14px rgba(0,70,27,.35); transform:translateY(-1px); }
        .p-btn-danger { background:#b91c1c; }
        .p-btn-danger:hover { box-shadow:0 4px 14px rgba(185,28,28,.3); }
        .p-alert { padding:12px 16px; border-radius:10px; font-size:13.5px; font-weight:500; }
        .p-alert-ok  { background:#00461B; color:#fff; border:1px solid #bbf7d0; }
        .p-alert-err { background:#7F1D1D; color:#fff; border:1px solid #fecaca; }
        @media(max-width:860px) { .p-layout { grid-template-columns:1fr; } .p-sidebar { position:static; } .p-form-grid { grid-template-columns:1fr; } }
    </style>`;
}
