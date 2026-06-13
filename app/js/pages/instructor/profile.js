/**
 * Instructor Profile Page
 * View and update personal info and password
 */
import { Api } from '../../api.js';
import { Auth } from '../../auth.js';
import { bindPasswordChangeOtp } from '../../utils/password-change-otp.js';

export async function render(container) {
    const user = Auth.user();
    const joinDate = user.created_at ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

    container.innerHTML = `
        <style>
            /* ===== Layout ===== */
            .pr-layout { display: grid; grid-template-columns: 320px 1fr; gap: 24px; align-items: start; }

            /* ===== Sidebar Card ===== */
            .pr-sidebar { position: sticky; top: 24px; }
            .pr-card {
                background: #fff; border: 1px solid #e8e8e8; border-radius: 16px;
                overflow: hidden;
            }
            .pr-banner {
                height: 100px; background: #00461B;
                position: relative;
            }
            .pr-avatar {
                width: 80px; height: 80px; border-radius: 50%;
                background: #fff; color: #1B4D3E;
                display: flex; align-items: center; justify-content: center;
                font-size: 28px; font-weight: 800;
                border: 4px solid #fff;
                box-shadow: 0 4px 12px rgba(0,0,0,0.12);
                position: absolute; bottom: -40px; left: 50%; transform: translateX(-50%);
            }

            .pr-identity { text-align: center; padding: 48px 24px 20px; }
            .pr-name {
                font-size: 20px; font-weight: 700; color: #1f2937;
                margin: 0 0 8px; text-transform: capitalize;
            }
            .pr-role {
                display: inline-block; background: #E8F5E9; color: #1B4D3E;
                padding: 5px 16px; border-radius: 20px;
                font-size: 12px; font-weight: 700; text-transform: capitalize;
            }

            /* Department & Program badges */
            .pr-badges { padding: 0 20px 16px; display: flex; flex-direction: column; gap: 8px; }
            .pr-badge-row {
                display: flex; align-items: center; gap: 10px;
                padding: 10px 14px; border-radius: 10px;
            }
            .pr-badge-row.dept { background: #1B4D3E; }
            .pr-badge-row.prog { background: #1B4D3E; }
            .pr-badge-code {
                font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.95);
                background: rgba(255,255,255,0.18); padding: 3px 10px;
                border-radius: 6px; flex-shrink: 0;
            }
            .pr-badge-name {
                font-size: 12px; font-weight: 600; color: #fff;
                white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            }

            /* Detail rows */
            .pr-details { padding: 0 20px 20px; }
            .pr-detail {
                display: flex; justify-content: space-between; align-items: center;
                padding: 12px 0; border-bottom: 1px solid #f3f4f6;
            }
            .pr-detail:last-child { border-bottom: none; }
            .pr-detail-icon {
                display: flex; align-items: center; gap: 10px;
            }
            .pr-detail-ic {
                width: 32px; height: 32px; border-radius: 8px;
                display: flex; align-items: center; justify-content: center;
                font-size: 14px; flex-shrink: 0;
            }
            .pr-detail-lbl { font-size: 13px; color: #6b7280; font-weight: 500; }
            .pr-detail-val { font-size: 13px; color: #1f2937; font-weight: 600; text-align: right; word-break: break-all; max-width: 160px; }

            /* ===== Main Content ===== */
            .pr-main { display: flex; flex-direction: column; gap: 20px; }

            /* Panel */
            .pr-panel {
                background: #fff; border: 1px solid #e8e8e8; border-radius: 16px; overflow: hidden;
            }
            .pr-panel-hd {
                padding: 16px 24px; border-bottom: 1px solid #f0f0f0;
                display: flex; align-items: center; gap: 10px;
            }
            .pr-panel-hd-icon {
                width: 34px; height: 34px; border-radius: 10px;
                display: flex; align-items: center; justify-content: center;
                font-size: 16px; flex-shrink: 0;
            }
            .pr-panel-hd h3 { margin: 0; font-size: 15px; font-weight: 700; color: #1f2937; }
            .pr-panel-hd p { margin: 2px 0 0; font-size: 12px; color: #9ca3af; }
            .pr-panel-bd { padding: 24px; }

            /* Form */
            .pr-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
            .pr-form-full { grid-column: 1 / -1; }
            .pr-fg { margin-bottom: 0; }
            .pr-lbl {
                display: block; font-size: 12px; font-weight: 600; color: #6b7280;
                margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.04em;
            }
            .pr-input {
                width: 100%; padding: 11px 14px; border: 1.5px solid #e5e7eb;
                border-radius: 10px; font-size: 14px; color: #1f2937;
                box-sizing: border-box; transition: all 0.2s;
                background: #fff;
            }
            .pr-input:focus {
                outline: none; border-color: #1B4D3E;
                box-shadow: 0 0 0 3px rgba(27,77,62,0.08);
            }
            .pr-input::placeholder { color: #d1d5db; }

            .pr-actions { display: flex; justify-content: flex-end; padding-top: 20px; }
            .pr-btn {
                padding: 11px 24px; border: none; border-radius: 10px;
                font-size: 14px; font-weight: 600; cursor: pointer;
                transition: all 0.2s; display: inline-flex; align-items: center; gap: 8px;
            }
            .pr-btn-primary {
                background: #00461B; color: #fff;
                box-shadow: 0 2px 8px rgba(27,77,62,0.25);
            }
            .pr-btn-primary:hover {
                transform: translateY(-1px);
                box-shadow: 0 4px 16px rgba(27,77,62,0.35);
            }

            /* Alerts */
            .pr-alert { padding: 12px 16px; border-radius: 10px; font-size: 14px; font-weight: 500; margin-bottom: 16px; }
            .pr-alert-ok { background: #E8F5E9; color: #1B4D3E; border: 1px solid #A7F3D0; }
            .pr-alert-err { background: #FEE2E2; color: #b91c1c; border: 1px solid #FECACA; }

            /* Responsive */
            @media(max-width: 900px) {
                .pr-layout { grid-template-columns: 1fr; }
                .pr-sidebar { position: static; }
                .pr-form-grid { grid-template-columns: 1fr; }
            }
        </style>

        <div class="pr-layout">
            <!-- Sidebar -->
            <div class="pr-sidebar">
                <div class="pr-card">
                    <div class="pr-banner">
                        <div class="pr-avatar">${Auth.initials()}</div>
                    </div>

                    <div class="pr-identity">
                        <h2 class="pr-name">${esc(user.first_name)} ${esc(user.last_name)}</h2>
                        <span class="pr-role">${esc(user.role)}</span>
                    </div>

                    <div class="pr-badges">
                        ${user.department_name ? `
                        <div class="pr-badge-row dept">
                            <span class="pr-badge-code">${esc(user.department_name?.split(' ').map(w => w[0]).join('') || '—')}</span>
                            <span class="pr-badge-name">${esc(user.department_name)}</span>
                        </div>` : ''}
                        ${user.program_name ? `
                        <div class="pr-badge-row prog">
                            <span class="pr-badge-code">${esc(user.program_code || '—')}</span>
                            <span class="pr-badge-name">${esc(user.program_name)}</span>
                        </div>` : ''}
                    </div>

                    <div class="pr-details">
                        <div class="pr-detail">
                            <div class="pr-detail-icon">
                                <div class="pr-detail-ic" style="background:#E8F5E9;color:#1B4D3E">
                                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5zm6-10.125a1.875 1.875 0 11-3.75 0 1.875 1.875 0 013.75 0zm1.294 6.336a6.721 6.721 0 01-3.17.789 6.721 6.721 0 01-3.168-.789 3.376 3.376 0 016.338 0z"/></svg>
                                </div>
                                <span class="pr-detail-lbl">Employee ID</span>
                            </div>
                            <span class="pr-detail-val">${esc(user.employee_id || '—')}</span>
                        </div>
                        <div class="pr-detail">
                            <div class="pr-detail-icon">
                                <div class="pr-detail-ic" style="background:#DBEAFE;color:#1E40AF">
                                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"/></svg>
                                </div>
                                <span class="pr-detail-lbl">Email</span>
                            </div>
                            <span class="pr-detail-val">${esc(user.email)}</span>
                        </div>
                        <div class="pr-detail">
                            <div class="pr-detail-icon">
                                <div class="pr-detail-ic" style="background:#FEF3C7;color:#92400E">
                                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"/></svg>
                                </div>
                                <span class="pr-detail-lbl">Joined</span>
                            </div>
                            <span class="pr-detail-val">${joinDate}</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Main Content -->
            <div class="pr-main">
                <!-- Personal Information -->
                <div class="pr-panel">
                    <div class="pr-panel-hd">
                        <div class="pr-panel-hd-icon" style="background:#E8F5E9;color:#1B4D3E">
                            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"/></svg>
                        </div>
                        <div>
                            <h3>Personal Information</h3>
                            <p>Update your name and email address</p>
                        </div>
                    </div>
                    <div class="pr-panel-bd">
                        <div id="info-alert"></div>
                        <div class="pr-form-grid">
                            <div class="pr-fg">
                                <label class="pr-lbl">First Name</label>
                                <input class="pr-input" id="f-fname" value="${esc(user.first_name || '')}">
                            </div>
                            <div class="pr-fg">
                                <label class="pr-lbl">Last Name</label>
                                <input class="pr-input" id="f-lname" value="${esc(user.last_name || '')}">
                            </div>
                            <div class="pr-fg pr-form-full">
                                <label class="pr-lbl">Email Address</label>
                                <input class="pr-input" id="f-email" type="email" value="${esc(user.email || '')}">
                            </div>
                        </div>
                        <div class="pr-actions">
                            <button class="pr-btn pr-btn-primary" id="btn-info">
                                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>
                                Save Changes
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Change Password -->
                <div class="pr-panel">
                    <div class="pr-panel-hd">
                        <div class="pr-panel-hd-icon" style="background:#FEE2E2;color:#b91c1c">
                            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"/></svg>
                        </div>
                        <div>
                            <h3>Security & Password</h3>
                            <p>Update your account password</p>
                        </div>
                    </div>
                    <div class="pr-panel-bd">
                        <div id="pw-alert"></div>
                        <div class="pr-form-grid">
                            <div class="pr-fg pr-form-full">
                                <label class="pr-lbl">Current Password</label>
                                <input type="password" class="pr-input" id="f-curpw" placeholder="Enter current password">
                            </div>
                            <div class="pr-fg">
                                <label class="pr-lbl">New Password</label>
                                <input type="password" class="pr-input" id="f-newpw" placeholder="Min. 6 characters">
                            </div>
                            <div class="pr-fg">
                                <label class="pr-lbl">Confirm New Password</label>
                                <input type="password" class="pr-input" id="f-confirmpw" placeholder="Repeat new password">
                            </div>
                        </div>
                        <p style="font-size:12px;color:#9ca3af;margin:0 0 8px">A verification code will be sent to your registered email.</p>
                        <div class="pr-actions">
                            <button class="pr-btn pr-btn-primary" id="btn-pw">
                                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"/></svg>
                                Send verification code
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Update info handler
    container.querySelector('#btn-info').addEventListener('click', async () => {
        const alertEl = container.querySelector('#info-alert');
        const payload = {
            first_name: container.querySelector('#f-fname').value.trim(),
            last_name: container.querySelector('#f-lname').value.trim(),
            email: container.querySelector('#f-email').value.trim(),
        };
        if (!payload.first_name || !payload.last_name || !payload.email) {
            alertEl.innerHTML = '<div class="pr-alert pr-alert-err">All fields are required</div>';
            return;
        }
        const res = await Api.post('/AuthAPI.php?action=update-profile', payload);
        if (res.success) {
            alertEl.innerHTML = '<div class="pr-alert pr-alert-ok">Profile updated successfully!</div>';
            await Auth.getUser();
        } else {
            alertEl.innerHTML = `<div class="pr-alert pr-alert-err">${res.message}</div>`;
        }
    });

    bindPasswordChangeOtp(container, {
        alertSelector: '#pw-alert',
        curSelector: '#f-curpw',
        newSelector: '#f-newpw',
        confirmSelector: '#f-confirmpw',
        btnSelector: '#btn-pw',
        okClass: 'pr-alert pr-alert-ok',
        errClass: 'pr-alert pr-alert-err',
    });
}

function esc(str) { const d = document.createElement('div'); d.textContent = str || ''; return d.innerHTML; }
