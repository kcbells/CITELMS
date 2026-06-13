/**
 * Student Profile Page
 * View and update personal info and password
 */
import { Api } from '../../api.js';
import { Auth } from '../../auth.js';
import { bindPasswordChangeOtp } from '../../utils/password-change-otp.js';

export async function render(container) {
    const user = Auth.user();

    // Get student stats
    const dashRes = await Api.get('/DashboardAPI.php?action=student');
    const stats = dashRes.success ? dashRes.data.stats : {};

    container.innerHTML = `
        <style>
            .profile-layout { display:grid; grid-template-columns:300px 1fr; gap:24px; align-items:start; }

            .profile-sidebar { background:#fff; border:1px solid #e8e8e8; border-radius:14px; overflow:hidden; position:sticky; top:24px; }
            .profile-banner { height:80px; background:#00461B; position:relative; }
            .profile-avatar { width:72px; height:72px; border-radius:50%; background:#E8F5E9; color:#1B4D3E; display:flex; align-items:center; justify-content:center; font-size:24px; font-weight:800; border:4px solid #fff; position:absolute; bottom:-36px; left:50%; transform:translateX(-50%); }
            .profile-info { text-align:center; padding:44px 20px 16px; }
            .profile-name { font-size:18px; font-weight:700; color:#262626; }
            .profile-role { display:inline-block; background:#E8F5E9; color:#1B4D3E; padding:4px 12px; border-radius:20px; font-size:12px; font-weight:600; margin-top:6px; text-transform:capitalize; }

            .profile-stats { display:grid; grid-template-columns:repeat(3,1fr); border-top:1px solid #f0f0f0; }
            .ps-item { text-align:center; padding:14px 8px; }
            .ps-item:not(:last-child) { border-right:1px solid #f0f0f0; }
            .ps-num { font-size:18px; font-weight:800; color:#1B4D3E; display:block; }
            .ps-label { font-size:10px; color:#737373; text-transform:uppercase; }

            .profile-details { padding:16px 20px; }
            .pd-item { display:flex; justify-content:space-between; padding:10px 0; border-bottom:1px solid #f5f5f5; font-size:13px; }
            .pd-item:last-child { border-bottom:none; }
            .pd-label { color:#737373; }
            .pd-value { color:#262626; font-weight:600; }

            .profile-main { display:flex; flex-direction:column; gap:20px; }
            .form-card { background:#fff; border:1px solid #e8e8e8; border-radius:14px; overflow:hidden; }
            .form-card-header { padding:16px 24px; background:#fafafa; border-bottom:1px solid #e8e8e8; font-weight:700; font-size:15px; color:#262626; }
            .form-card-body { padding:24px; }
            .form-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
            .form-group { margin-bottom:16px; }
            .form-group.full { grid-column:1/-1; }
            .form-label { display:block; font-size:13px; font-weight:600; color:#404040; margin-bottom:6px; }
            .form-input { width:100%; padding:10px 14px; border:1px solid #e0e0e0; border-radius:8px; font-size:14px; box-sizing:border-box; }
            .form-input:focus { outline:none; border-color:#00461B; }
            .btn-primary { background:#00461B; color:#fff; border:none; padding:10px 20px; border-radius:10px; font-weight:600; font-size:14px; cursor:pointer; }
            .form-actions { display:flex; justify-content:flex-end; padding-top:8px; }
            .alert { padding:12px 16px; border-radius:10px; margin-bottom:16px; font-size:14px; }
            .alert-success { background:#E8F5E9; color:#1B4D3E; }
            .alert-error { background:#FEE2E2; color:#b91c1c; }

            @media(max-width:768px) { .profile-layout { grid-template-columns:1fr; } .form-grid { grid-template-columns:1fr; } .profile-sidebar { position:static; } }
        </style>

        <div class="profile-layout">
            <div class="profile-sidebar">
                <div class="profile-banner">
                    <div class="profile-avatar">${Auth.initials()}</div>
                </div>
                <div class="profile-info">
                    <div class="profile-name">${esc(user.first_name)} ${esc(user.last_name)}</div>
                    <div class="profile-role">${esc(user.role)}</div>
                </div>
                <div class="profile-stats">
                    <div class="ps-item"><span class="ps-num">${stats.subjects||0}</span><span class="ps-label">Subjects</span></div>
                    <div class="ps-item"><span class="ps-num">${stats.lessons_completed||0}</span><span class="ps-label">Lessons</span></div>
                    <div class="ps-item"><span class="ps-num">${stats.total_quizzes||0}</span><span class="ps-label">Quizzes</span></div>
                </div>
                <div class="profile-details">
                    <div class="pd-item"><span class="pd-label">Student ID</span><span class="pd-value">${esc(user.student_id||'—')}</span></div>
                    <div class="pd-item"><span class="pd-label">Email</span><span class="pd-value">${esc(user.email)}</span></div>
                    <div class="pd-item"><span class="pd-label">Program</span><span class="pd-value">${esc(user.program_code||user.program_name||'—')}</span></div>
                    <div class="pd-item"><span class="pd-label">Year Level</span><span class="pd-value">${user.year_level ? 'Year '+user.year_level : '—'}</span></div>
                    <div class="pd-item"><span class="pd-label">Joined</span><span class="pd-value">${user.created_at ? new Date(user.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—'}</span></div>
                </div>
            </div>

            <div class="profile-main">
                <div class="form-card">
                    <div class="form-card-header">Personal Information</div>
                    <div class="form-card-body">
                        <div id="info-alert"></div>
                        <div class="form-grid">
                            <div class="form-group"><label class="form-label">First Name</label><input class="form-input" id="f-fname" value="${esc(user.first_name||'')}"></div>
                            <div class="form-group"><label class="form-label">Last Name</label><input class="form-input" id="f-lname" value="${esc(user.last_name||'')}"></div>
                            <div class="form-group full"><label class="form-label">Email</label><input class="form-input" id="f-email" value="${esc(user.email||'')}"></div>
                        </div>
                        <div class="form-actions"><button class="btn-primary" id="btn-info">Update Info</button></div>
                    </div>
                </div>

                <div class="form-card">
                    <div class="form-card-header">Change Password</div>
                    <div class="form-card-body">
                        <div id="pw-alert"></div>
                        <div class="form-group"><label class="form-label">Current Password</label><input type="password" class="form-input" id="f-curpw"></div>
                        <div class="form-group"><label class="form-label">New Password</label><input type="password" class="form-input" id="f-newpw"></div>
                        <div class="form-group"><label class="form-label">Confirm Password</label><input type="password" class="form-input" id="f-confirmpw"></div>
                        <p style="font-size:12px;color:#737373;margin:0">A verification code will be emailed to you before your password is changed.</p>
                        <div class="form-actions"><button class="btn-primary" id="btn-pw">Send verification code</button></div>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Update info
    container.querySelector('#btn-info').addEventListener('click', async () => {
        const alertEl = container.querySelector('#info-alert');
        const payload = {
            first_name: container.querySelector('#f-fname').value,
            last_name: container.querySelector('#f-lname').value,
            email: container.querySelector('#f-email').value,
        };
        if (!payload.first_name || !payload.last_name || !payload.email) {
            alertEl.innerHTML = '<div class="alert alert-error">All fields are required</div>';
            return;
        }
        const res = await Api.post('/AuthAPI.php?action=update-profile', payload);
        if (res.success) {
            alertEl.innerHTML = '<div class="alert alert-success">Profile updated!</div>';
            await Auth.getUser();
        } else {
            alertEl.innerHTML = `<div class="alert alert-error">${res.message}</div>`;
        }
    });

    bindPasswordChangeOtp(container, {
        alertSelector: '#pw-alert',
        curSelector: '#f-curpw',
        newSelector: '#f-newpw',
        confirmSelector: '#f-confirmpw',
        btnSelector: '#btn-pw',
        okClass: 'alert alert-success',
        errClass: 'alert alert-error',
    });
}

function esc(str) { const d = document.createElement('div'); d.textContent = str||''; return d.innerHTML; }
