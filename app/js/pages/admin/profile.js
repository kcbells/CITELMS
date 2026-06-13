/**
 * Admin Profile Page
 * View/edit current user profile
 */
import { Api } from '../../api.js';
import { Auth } from '../../auth.js';

export async function render(container) {
    const user = Auth.user();

    container.innerHTML = `
        <style>
            .profile-card { background:#fff; border:1px solid #e8e8e8; border-radius:16px; max-width:600px; overflow:hidden; }
            .profile-banner { background:#00461B; padding:32px 24px; text-align:center; }
            .profile-avatar { width:80px; height:80px; border-radius:50%; background:#fff; color:#1B4D3E; display:flex; align-items:center; justify-content:center; font-size:28px; font-weight:800; margin:0 auto 12px; border:3px solid rgba(255,255,255,.3); }
            .profile-name { font-size:22px; font-weight:700; color:#fff; }
            .profile-role { color:rgba(255,255,255,.7); font-size:14px; margin-top:4px; text-transform:capitalize; }
            .profile-body { padding:24px; }
            .info-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
            .info-item { padding:12px; background:#fafafa; border-radius:10px; }
            .info-label { font-size:11px; font-weight:600; color:#737373; text-transform:uppercase; letter-spacing:.5px; margin-bottom:4px; }
            .info-value { font-size:15px; font-weight:600; color:#262626; }
            @media(max-width:768px) { .info-grid { grid-template-columns:1fr; } }
        </style>

        <div class="profile-card">
            <div class="profile-banner">
                <div class="profile-avatar">${Auth.initials()}</div>
                <div class="profile-name">${esc(user.name || user.first_name + ' ' + user.last_name)}</div>
                <div class="profile-role">${user.role}</div>
            </div>
            <div class="profile-body">
                <div class="info-grid">
                    <div class="info-item">
                        <div class="info-label">Email</div>
                        <div class="info-value">${esc(user.email)}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Employee ID</div>
                        <div class="info-value">${esc(user.employee_id || '—')}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Department</div>
                        <div class="info-value">${esc(user.department_name || '—')}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Status</div>
                        <div class="info-value" style="text-transform:capitalize">${esc(user.status || 'active')}</div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function esc(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
}
