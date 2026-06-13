/**
 * Dean Profile Page
 * View/edit profile with department info
 */
import { Api } from '../../api.js';
import { Auth } from '../../auth.js';
import { bindPasswordChangeOtp } from '../../utils/password-change-otp.js';

export async function render(container) {
    const user = Auth.user();

    container.innerHTML = `
        <style>
            .profile-layout { display:grid; grid-template-columns:280px 1fr; gap:24px; align-items:start; }
            .profile-sidebar { position:sticky; top:20px; }
            .profile-card { background:#fff; border:1px solid #e8e8e8; border-radius:16px; overflow:hidden; }
            .profile-banner { background:#00461B; padding:32px 20px 24px; text-align:center; }
            .profile-avatar { width:76px; height:76px; border-radius:50%; background:#fff; color:#1B4D3E; display:flex; align-items:center; justify-content:center; font-size:28px; font-weight:800; margin:0 auto 14px; box-shadow:0 0 0 4px rgba(255,255,255,.25); }
            .profile-name { font-size:18px; font-weight:700; color:#fff; line-height:1.3; }
            .profile-role { display:inline-block; background:rgba(255,255,255,.18); padding:4px 14px; border-radius:20px; font-size:12px; color:#fff; margin-top:8px; font-weight:600; text-transform:capitalize; letter-spacing:.3px; }
            .profile-info { padding:8px 0; }
            .info-row { display:flex; flex-direction:column; padding:12px 20px; border-bottom:1px solid #f5f5f5; gap:3px; }
            .info-row:last-child { border-bottom:none; }
            .info-label { font-size:10px; font-weight:700; color:#9ca3af; text-transform:uppercase; letter-spacing:.8px; }
            .info-value { font-size:13px; font-weight:600; color:#1a1a1a; word-break:break-word; }
            .status-dot { display:inline-flex; align-items:center; gap:5px; }
            .status-dot::before { content:''; width:7px; height:7px; border-radius:50%; background:#16a34a; display:inline-block; }

            .form-card { background:#fff; border:1px solid #e8e8e8; border-radius:14px; overflow:hidden; margin-bottom:20px; }
            .card-header { padding:16px 24px; border-bottom:1px solid #f0f0f0; font-weight:700; font-size:15px; color:#1a1a1a; }
            .card-body { padding:24px; }
            .card-footer { padding:12px 24px; border-top:1px solid #f0f0f0; display:flex; justify-content:flex-end; }

            .form-row { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
            .form-group { margin-bottom:16px; }
            .form-group:last-child { margin-bottom:0; }
            .form-label { display:block; font-size:12px; font-weight:700; color:#6b7280; margin-bottom:6px; text-transform:uppercase; letter-spacing:.5px; }
            .form-input { width:100%; padding:10px 14px; border:1px solid #e0e0e0; border-radius:8px; font-size:14px; box-sizing:border-box; color:#1a1a1a; background:#fff; transition:border .15s; }
            .form-input:focus { outline:none; border-color:#1B4D3E; box-shadow:0 0 0 3px rgba(27,77,62,.08); }

            .btn-save { background:#00461B; color:#fff; border:none; padding:10px 24px; border-radius:8px; font-weight:600; font-size:14px; cursor:pointer; transition:all .2s; }
            .btn-save:hover { box-shadow:0 4px 12px rgba(0,70,27,.3); transform:translateY(-1px); }
            .alert { padding:10px 16px; border-radius:8px; margin-bottom:16px; font-size:13px; }
            .alert-success { background:#E8F5E9; color:#1B4D3E; border:1px solid #bbf7d0; }
            .alert-error { background:#FEE2E2; color:#b91c1c; border:1px solid #fecaca; }

            @media(max-width:768px) { .profile-layout { grid-template-columns:1fr; } .form-row { grid-template-columns:1fr; } .profile-sidebar { position:static; } }
        </style>

        <div class="profile-layout">
            <div class="profile-sidebar">
                <div class="profile-card">
                    <div class="profile-banner">
                        <div class="profile-avatar">${Auth.initials()}</div>
                        <div class="profile-name">${esc(user.name || (user.first_name+' '+user.last_name))}</div>
                        <div class="profile-role">${user.role}</div>
                    </div>
                    <div class="profile-info">
                        <div class="info-row">
                            <span class="info-label">Employee ID</span>
                            <span class="info-value">${esc(user.employee_id||'—')}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Email</span>
                            <span class="info-value">${esc(user.email)}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Department</span>
                            <span class="info-value">${esc(user.department_name||'—')}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Status</span>
                            <span class="info-value status-dot" style="text-transform:capitalize">${esc(user.status||'Active')}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div>
                <div id="profile-alert"></div>
                <div class="form-card">
                    <div class="card-header">Personal Details</div>
                    <div class="card-body">
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label">First Name</label>
                                <input class="form-input" id="p-first" value="${esc(user.first_name||'')}">
                            </div>
                            <div class="form-group">
                                <label class="form-label">Last Name</label>
                                <input class="form-input" id="p-last" value="${esc(user.last_name||'')}">
                            </div>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Email</label>
                            <input type="email" class="form-input" id="p-email" value="${esc(user.email||'')}">
                        </div>
                    </div>
                    <div class="card-footer"><button class="btn-save" id="btn-save-profile">Save Changes</button></div>
                </div>

                <div class="form-card">
                    <div class="card-header">Change Password</div>
                    <div class="card-body">
                        <div id="pw-alert"></div>
                        <div class="form-group">
                            <label class="form-label">Current Password</label>
                            <input type="password" class="form-input" id="p-current-pw">
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label">New Password</label>
                                <input type="password" class="form-input" id="p-new-pw">
                            </div>
                            <div class="form-group">
                                <label class="form-label">Confirm Password</label>
                                <input type="password" class="form-input" id="p-confirm-pw">
                            </div>
                        </div>
                    </div>
                    <div class="card-footer"><button class="btn-save" id="btn-change-pw">Send verification code</button></div>
                </div>
            </div>
        </div>
    `;

    // Save profile (placeholder)
    container.querySelector('#btn-save-profile').addEventListener('click', () => {
        const alert = container.querySelector('#profile-alert');
        alert.innerHTML = '<div class="alert alert-success">Profile updated successfully!</div>';
        setTimeout(() => alert.innerHTML = '', 3000);
    });

    bindPasswordChangeOtp(container, {
        alertSelector: '#pw-alert',
        curSelector: '#p-current-pw',
        newSelector: '#p-new-pw',
        confirmSelector: '#p-confirm-pw',
        btnSelector: '#btn-change-pw',
        okClass: 'alert alert-success',
        errClass: 'alert alert-error',
    });
}

function esc(str) { const d = document.createElement('div'); d.textContent = str||''; return d.innerHTML; }
