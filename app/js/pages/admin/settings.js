/**
 * Admin Settings Page — System maintenance focus
 */
import { Api, BASE_URL } from '../../api.js';
import { icon } from '../../utils/icons.js';
import { notify } from '../../utils/notify.js';
import { attachEyeToggle } from '../../utils/password-change-otp.js';

const inl = { size: 14, className: 'ui-icon-inline' };

export async function render(container) {
    container.innerHTML = `
        <style>
            .set-wrap { max-width: 100%; }

            /* ── Layout ── */
            .set-layout { display: grid; grid-template-columns: 220px 1fr; gap: 24px; align-items: start; }

            /* ── Left Nav ── */
            .set-nav {
                background: #fff; border: 1px solid #e8e8e8; border-radius: 16px;
                overflow: hidden; position: sticky; top: 20px;
            }
            .set-nav-label {
                padding: 14px 18px 8px; font-size: 11px; font-weight: 700;
                color: #a3a3a3; letter-spacing: .8px; text-transform: uppercase;
            }
            .set-nav-item {
                display: flex; align-items: center; gap: 11px;
                padding: 11px 18px; cursor: pointer; transition: all .18s;
                margin: 2px 0;
                font-size: 13.5px; font-weight: 500; color: #525252;
            }
            .set-nav-item:hover { background: #f5faf7; color: #00461B; }
            .set-nav-item.active { background:#00461B; color:#fff; font-weight: 700; }
            .set-nav-item .nav-icon { font-size: 16px; width: 22px; text-align: center; }
            .set-nav-divider { height: 1px; background: #f0f0f0; margin: 6px 0; }

            /* ── Right Content ── */
            .set-panel { display: none; }
            .set-panel.active { display: block; }

            .set-card {
                background: #fff; border: 1px solid #e8e8e8; border-radius: 16px;
                overflow: hidden; margin-bottom: 20px;
            }
            .set-card:last-child { margin-bottom: 0; }
            .set-card-head {
                padding: 20px 24px 16px; border-bottom: 1px solid #f0f0f0;
                display: flex; align-items: center; gap: 14px;
            }
            .set-card-head-icon {
                width: 40px; height: 40px; border-radius: 10px;
                display: flex; align-items: center; justify-content: center;
                font-size: 18px; flex-shrink: 0;
                background: #F3F4F6; color: #111;
            }
            .set-card-title h3 { font-size: 15px; font-weight: 700; color: #262626; }
            .set-card-title p  { font-size: 12.5px; color: #737373; margin-top: 2px; }

            .set-card-body { padding: 24px; }
            .set-card-foot {
                padding: 14px 24px; background: #fafafa; border-top: 1px solid #f0f0f0;
                display: flex; justify-content: flex-end; align-items: center; gap: 12px;
            }

            /* ── Form Elements ── */
            .fg { margin-bottom: 20px; }
            .fg:last-child { margin-bottom: 0; }
            .fg-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
            .fg label {
                display: block; font-size: 12.5px; font-weight: 600;
                color: #404040; margin-bottom: 6px;
            }
            .fg-hint { font-size: 11.5px; color: #8a8a8a; margin-top: 5px; }
            .f-input, .f-select, .f-textarea {
                width: 100%; padding: 10px 14px;
                border: 1.5px solid #e0e0e0; border-radius: 9px;
                font-size: 13.5px; font-family: inherit; box-sizing: border-box;
                background: #fff; color: #262626; transition: border .15s, box-shadow .15s;
            }
            .f-input:focus, .f-select:focus, .f-textarea:focus {
                outline: none; border-color: #00461B;
                box-shadow: 0 0 0 3px rgba(0,70,27,.1);
            }
            .f-textarea { resize: vertical; }
            .f-input[readonly] { background: #f7f7f7; color: #737373; cursor: default; }

            /* Toggle switch */
            .toggle-wrap { display: flex; align-items: center; gap: 10px; }
            .toggle { position: relative; display: inline-block; width: 44px; height: 24px; }
            .toggle input { opacity: 0; width: 0; height: 0; }
            .toggle-slider {
                position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0;
                background: #d4d4d4; border-radius: 24px; transition: .25s;
            }
            .toggle-slider:before {
                position: absolute; content: ''; height: 18px; width: 18px;
                left: 3px; bottom: 3px; background: #fff;
                border-radius: 50%; transition: .25s;
                box-shadow: 0 1px 3px rgba(0,0,0,.2);
            }
            .toggle input:checked + .toggle-slider { background: #00461B; }
            .toggle input:checked + .toggle-slider:before { transform: translateX(20px); }
            .toggle-label { font-size: 13px; font-weight: 500; color: #525252; }

            /* Radio cards */
            .radio-cards { display: flex; gap: 10px; }
            .radio-card {
                flex: 1; border: 1.5px solid #e0e0e0; border-radius: 10px;
                padding: 12px 16px; cursor: pointer; transition: all .18s;
                display: flex; align-items: center; gap: 10px; font-size: 13px;
            }
            .radio-card:hover { border-color: #00461B; background: #f7fdf9; }
            .radio-card.selected { border-color: #00461B; background: #f0fdf4; }
            .radio-card input { accent-color: #00461B; }

            /* Buttons */
            .btn-primary {
                background: #00461B;
                color: #fff; border: none; padding: 9px 22px;
                border-radius: 9px; font-weight: 700; font-size: 13px; cursor: pointer;
                display: flex; align-items: center; gap: 7px;
                transition: box-shadow .2s;
            }
            .btn-primary:hover { box-shadow: 0 3px 10px rgba(0,70,27,.35); }
            .btn-primary:disabled { opacity: .6; cursor: not-allowed; }
            .btn-danger {
                background:#7F1D1D; color:#fff;
                border: none; padding: 9px 22px;
                border-radius: 9px; font-weight: 700; font-size: 13px; cursor: pointer;
                transition: background .18s;
            }
            .btn-danger:hover { background: #FCA5A5; }

            /* Alert toast */
            .set-toast {
                position: fixed; top: 24px; right: 24px; z-index: 9999;
                padding: 12px 20px; border-radius: 10px; font-size: 13px; font-weight: 600;
                box-shadow: 0 4px 16px rgba(0,0,0,.12);
                animation: slideIn .25s ease;
            }
            .set-toast.success { background: #D1FAE5; color: #065F46; border: 1px solid #6EE7B7; }
            .set-toast.error   { background:#7F1D1D; color:#fff; border: 1px solid #FCA5A5; }
            @keyframes slideIn { from { opacity:0; transform:translateY(-12px); } to { opacity:1; transform:translateY(0); } }

            /* ── System Overview ── */
            .sov-grid {
                display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
                gap: 14px; margin-bottom: 24px;
            }
            .sov-stat {
                background: #f9fafb; border: 1px solid #e8e8e8; border-radius: 12px;
                padding: 16px 18px;
            }
            .sov-stat-val { font-size: 28px; font-weight: 800; color: #00461B; line-height: 1; }
            .sov-stat-lbl { font-size: 12px; color: #6b7280; margin-top: 4px; font-weight: 500; }
            .sov-campus-name { font-weight: 600; color: #262626; }
            .sov-loading { text-align: center; padding: 32px; color: #737373; }

            @media(max-width:900px) {
                .set-layout { grid-template-columns: 1fr; }
                .set-nav { position: static; }
                .fg-row { grid-template-columns: 1fr; }
            }
        </style>

        <div class="set-wrap">
            <div class="set-layout">
                <!-- Left Nav -->
                <aside class="set-nav">
                    <div class="set-nav-label">Academic</div>
                    <div class="set-nav-item active" data-section="school-year">
                        <span class="nav-icon">${icon('calendar')}</span> School Year
                    </div>
                    <div class="set-nav-divider"></div>
                    <div class="set-nav-label">System</div>
                    <div class="set-nav-item" data-section="overview">
                        <span class="nav-icon">${icon('chart')}</span> System Overview
                    </div>
                    <div class="set-nav-item" data-section="activity">
                        <span class="nav-icon">${icon('checkCircle')}</span> Activity Log
                    </div>
                    <div class="set-nav-item" data-section="maintenance">
                        <span class="nav-icon">${icon('wrench')}</span> Maintenance
                    </div>
                    <div class="set-nav-item" data-section="ai">
                        <span class="nav-icon">${icon('robot')}</span> AI / Ali Assistant
                    </div>
                    <div class="set-nav-item" data-section="backup">
                        <span class="nav-icon">${icon('database')}</span> Database Backup
                    </div>
                    <div class="set-nav-divider"></div>
                    <div class="set-nav-label">Administration</div>
                    <div class="set-nav-item" data-section="users">
                        <span class="nav-icon">${icon('users')}</span> Users
                    </div>
                    <div class="set-nav-item" data-section="rbac">
                        <span class="nav-icon">${icon('lock')}</span> Roles &amp; Permissions
                    </div>
                </aside>

                <!-- Right Panels -->
                <main>
                    <!-- ── School Year ── -->
                    <div class="set-panel active" data-panel="school-year">
                        <div class="set-card">
                            <div class="set-card-head">
                                <div class="set-card-head-icon">${icon('calendar', { size: 22 })}</div>
                                <div class="set-card-title">
                                    <h3>School Year &amp; Active Semester</h3>
                                    <p>Toggle which semester is currently active — the academic year updates automatically</p>
                                </div>
                            </div>
                            <div class="set-card-body" id="sy-body">
                                <div style="text-align:center;padding:40px;color:#737373;">Loading...</div>
                            </div>
                        </div>
                    </div>

                    <!-- ── System Overview ── -->
                    <div class="set-panel" data-panel="overview">
                        <div class="set-card">
                            <div class="set-card-head">
                                <div class="set-card-head-icon">${icon('chart', { size: 22 })}</div>
                                <div class="set-card-title">
                                    <h3>System Overview</h3>
                                    <p>Live snapshot of users, enrollment, academic structure, and content</p>
                                </div>
                            </div>
                            <div class="set-card-body" id="sov-body">
                                <div class="sov-loading">Loading system data...</div>
                            </div>
                        </div>
                    </div>

                    <!-- ── Activity Log ── -->
                    <div class="set-panel" data-panel="activity">
                        <div class="set-card">
                            <div class="set-card-head">
                                <div class="set-card-head-icon">${icon('checkCircle', { size: 22 })}</div>
                                <div class="set-card-title">
                                    <h3>Activity Log</h3>
                                    <p>Recent activity across the system — logins, registrations, and account changes</p>
                                </div>
                                <button class="btn-primary" id="btn-refresh-activity" style="margin-left:auto;">${icon('clock', inl)} Refresh</button>
                            </div>
                            <div class="set-card-body" id="activity-body">
                                <div class="sov-loading">Loading activity...</div>
                            </div>
                        </div>
                    </div>

                    <!-- ── Maintenance ── -->
                    <div class="set-panel" data-panel="maintenance">
                        <div class="set-card">
                            <div class="set-card-head">
                                <div class="set-card-head-icon">${icon('wrench', { size: 22 })}</div>
                                <div class="set-card-title">
                                    <h3>Maintenance Mode</h3>
                                    <p>Take the system offline for updates or maintenance</p>
                                </div>
                            </div>
                            <div class="set-card-body">
                                <div class="fg">
                                    <label>Maintenance Mode</label>
                                    <div class="toggle-wrap">
                                        <label class="toggle">
                                            <input type="checkbox" id="s-maintenance">
                                            <span class="toggle-slider"></span>
                                        </label>
                                        <span class="toggle-label" id="maint-label">Disabled — system is live</span>
                                    </div>
                                    <div class="fg-hint" style="color:#b45309;">${icon('warning', { size: 14, className: 'ui-icon-inline' })} Enabling this will prevent all non-admin users from logging in</div>
                                </div>
                                <div class="fg">
                                    <label>Maintenance Message</label>
                                    <textarea class="f-textarea" id="s-maint-msg" rows="4">The system is currently under maintenance. Please check back later.</textarea>
                                    <div class="fg-hint">Shown to users attempting to log in during maintenance</div>
                                </div>
                            </div>
                            <div class="set-card-foot">
                                <span style="font-size:12px;color:#737373;">Changes take effect immediately</span>
                                <button class="btn-danger" data-section="maintenance" id="save-maint">Save Maintenance Settings</button>
                            </div>
                        </div>

                        <div class="set-card">
                            <div class="set-card-head">
                                <div class="set-card-head-icon">${icon('database', { size: 22 })}</div>
                                <div class="set-card-title">
                                    <h3>Data Management</h3>
                                    <p>Perform system-level data operations with caution</p>
                                </div>
                            </div>
                            <div class="set-card-body">
                                <div class="fg" style="margin-bottom:16px;">
                                    <div style="display:flex;align-items:flex-start;gap:14px;padding:14px 16px;background:#FEF3C7;border:1px solid #FDE68A;border-radius:10px;">
                                        <span style="font-size:20px;flex-shrink:0;">${icon('warning', { size: 20 })}</span>
                                        <div>
                                            <div style="font-size:13px;font-weight:700;color:#92400e;margin-bottom:3px;">Caution — these actions are irreversible</div>
                                            <div style="font-size:12.5px;color:#b45309;">Always create a database backup before performing data operations. Deleted records cannot be recovered.</div>
                                        </div>
                                    </div>
                                </div>
                                <div style="display:flex;flex-direction:column;gap:12px;">
                                    <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border:1px solid #e8e8e8;border-radius:10px;">
                                        <div>
                                            <div style="font-size:13.5px;font-weight:600;color:#262626;">Clear Inactive Users</div>
                                            <div style="font-size:12px;color:#737373;margin-top:2px;">Remove user accounts with status = inactive for more than 90 days</div>
                                        </div>
                                        <button class="btn-danger" id="btn-clear-inactive" style="white-space:nowrap;">Run Cleanup</button>
                                    </div>
                                    <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border:1px solid #e8e8e8;border-radius:10px;">
                                        <div>
                                            <div style="font-size:13.5px;font-weight:600;color:#262626;">Archive Old Semesters</div>
                                            <div style="font-size:12px;color:#737373;margin-top:2px;">Mark semesters older than 2 years as archived</div>
                                        </div>
                                        <button class="btn-primary" id="btn-archive-sems" style="white-space:nowrap;">${icon('archive', inl)} Archive</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- ── Database Backup ── -->
                    <div class="set-panel" data-panel="backup">
                        <div class="set-card">
                            <div class="set-card-head">
                                <div class="set-card-head-icon">${icon('database', { size: 22 })}</div>
                                <div class="set-card-title">
                                    <h3>Database Backup</h3>
                                    <p>Save a copy of everything — accounts, classes, grades, quizzes — so the system can be restored if it crashes</p>
                                </div>
                            </div>
                            <div class="set-card-body">
                                <div style="display:flex;align-items:flex-start;gap:14px;padding:14px 16px;border:1.5px solid #111;border-radius:10px;margin-bottom:16px;">
                                    <span style="flex-shrink:0;">${icon('shield', { size: 20 })}</span>
                                    <div>
                                        <div style="font-size:13px;font-weight:700;color:#111;margin-bottom:3px;">Keep a copy somewhere else too</div>
                                        <div style="font-size:12.5px;color:#4b5563;">A backup stored only on this computer is lost with the computer. Download the newest one now and then, and keep it on a drive or cloud folder.</div>
                                    </div>
                                </div>

                                <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:16px;">
                                    <div>
                                        <div style="font-size:13.5px;font-weight:700;color:#262626;">Back up now</div>
                                        <div style="font-size:12px;color:#737373;margin-top:2px;" id="bk-sub">Creates a .sql file you can download and restore from</div>
                                    </div>
                                    <button class="btn-primary" id="bk-create" style="white-space:nowrap;">${icon('download', inl)} Create Backup</button>
                                </div>

                                <div id="bk-list"><div style="font-size:13px;color:#737373;">Loading backups…</div></div>
                            </div>
                        </div>
                    </div>

                    <!-- ── AI / Ali Assistant ── -->
                    <div class="set-panel" data-panel="ai">
                        <div class="set-card">
                            <div class="set-card-head">
                                <div class="set-card-head-icon">${icon('robot', { size: 22 })}</div>
                                <div class="set-card-title">
                                    <h3>AI Provider</h3>
                                    <p>Powers Ali the assistant, AI quiz generation, AI answer grading, and the SAS/Teaching Guide module-quiz builder — via Hugging Face's free Inference API</p>
                                </div>
                            </div>
                            <div class="set-card-body" id="ai-body">
                                <div style="text-align:center;padding:40px;color:#737373;">Loading...</div>
                            </div>
                            <div class="set-card-foot">
                                <span style="font-size:12px;color:#737373;">Get a free token at huggingface.co/settings/tokens</span>
                                <button class="btn-primary" id="save-ai">Save AI Settings</button>
                            </div>
                        </div>
                    </div>

                    <!-- ── Users ── -->
                    <div class="set-panel" data-panel="users">
                        <div id="set-users-mount"></div>
                    </div>

                    <!-- ── RBAC ── -->
                    <div class="set-panel" data-panel="rbac">
                        <div id="set-rbac-mount"></div>
                    </div>
                </main>
            </div>
        </div>
    `;

    // ── Nav switching ──
    const _loaded = { users: false, rbac: false, overview: false, activity: false, ai: false };

    container.querySelectorAll('.set-nav-item').forEach(item => {
        item.addEventListener('click', async () => {
            const sec = item.dataset.section;
            container.querySelectorAll('.set-nav-item').forEach(i => i.classList.remove('active'));
            container.querySelectorAll('.set-panel').forEach(p => p.classList.remove('active'));
            item.classList.add('active');
            container.querySelector(`.set-panel[data-panel="${sec}"]`).classList.add('active');

            if (sec === 'school-year') loadSchoolYear();

            if (sec === 'overview' && !_loaded.overview) {
                _loaded.overview = true;
                loadSystemOverview();
            }
            if (sec === 'activity' && !_loaded.activity) {
                _loaded.activity = true;
                loadActivityLog();
            }
            if (sec === 'ai' && !_loaded.ai) {
                _loaded.ai = true;
                loadAiSettings();
            }
            if (sec === 'users' && !_loaded.users) {
                _loaded.users = true;
                const { render: renderUsers } = await import('./users.js');
                await renderUsers(container.querySelector('#set-users-mount'));
            }
            if (sec === 'rbac' && !_loaded.rbac) {
                _loaded.rbac = true;
                const { render: renderRbac } = await import('./rbac.js');
                await renderRbac(container.querySelector('#set-rbac-mount'));
            }
        });
    });

    // Auto-load the default active panel (School Year)
    loadSchoolYear();

    // ── Database backup ──────────────────────────────────────────────────
    const bkList = container.querySelector('#bk-list');

    const prettySize = (bytes) => {
        if (!bytes) return '0 KB';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
        return (bytes / 1024 / 1024).toFixed(1) + ' MB';
    };
    const prettyWhen = (ts) => {
        const d = new Date(String(ts).replace(' ', 'T'));
        return isNaN(d) ? ts : d.toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    async function loadBackups() {
        if (!bkList) return;
        const res = await Api.get('/BackupAPI.php?action=list');
        if (!res.success) {
            bkList.innerHTML = `<div style="font-size:13px;color:#b91c1c;">${res.message || 'Could not load backups.'}</div>`;
            return;
        }
        const { backups = [], keep = 10 } = res.data || {};
        if (!backups.length) {
            bkList.innerHTML = '<div style="font-size:13px;color:#737373;padding:14px 16px;border:1px dashed #d4d4d4;border-radius:10px;">No backups yet. Press <strong>Create Backup</strong> to make the first one.</div>';
            return;
        }
        bkList.innerHTML = `
            <div style="font-size:12px;font-weight:700;color:#737373;text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px;">
                Saved backups — newest first (the last ${keep} are kept)
            </div>
            <div style="display:flex;flex-direction:column;gap:8px;">
                ${backups.map((b, i) => `
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:12px 14px;border:1px solid ${i === 0 ? '#111' : '#e8e8e8'};border-radius:10px;">
                        <div style="min-width:0;">
                            <div style="font-size:13px;font-weight:700;color:#262626;">
                                ${prettyWhen(b.created_at)} ${i === 0 ? '<span style="font-size:10px;font-weight:800;color:#00461B;border:1px solid #00461B;border-radius:4px;padding:1px 6px;margin-left:6px;">NEWEST</span>' : ''}
                            </div>
                            <div style="font-size:11.5px;color:#737373;margin-top:2px;word-break:break-all;">${b.file} · ${prettySize(b.size_bytes)}</div>
                        </div>
                        <div style="display:flex;gap:8px;flex-shrink:0;">
                            <a class="btn-primary" style="white-space:nowrap;text-decoration:none;" href="${BASE_URL}/api/BackupAPI.php?action=download&file=${encodeURIComponent(b.file)}">Download</a>
                            <button class="btn-danger" data-bk-del="${b.file}" style="white-space:nowrap;">Delete</button>
                        </div>
                    </div>`).join('')}
            </div>`;

        bkList.querySelectorAll('[data-bk-del]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const file = btn.dataset.bkDel;
                const ok = await notify.confirm(`Delete this backup?
${file}

This cannot be undone.`, { danger: true, confirmText: 'Delete' });
                if (!ok) return;
                const res = await Api.post('/BackupAPI.php?action=delete', { file });
                if (res.success) { notify.success('Backup deleted.'); loadBackups(); }
                else notify.error(res.message || 'Could not delete that backup.');
            });
        });
    }

    container.querySelector('#bk-create')?.addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        const orig = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = `${icon('clock', inl)} Backing up…`;
        try {
            const res = await Api.post('/BackupAPI.php?action=create', {});
            if (res.success) {
                const d = res.data || {};
                loadBackups();   // refresh the list first, so it is current behind the message
                await notify.alert(
                    `Backup saved.

File: ${d.file}
Size: ${prettySize(d.size_bytes)}
Took: ${d.seconds}s` +
                    (d.pruned ? `

${d.pruned} older backup${d.pruned === 1 ? '' : 's'} removed.` : '') +
                    `

Download it and keep a copy off this computer.`,
                    { title: 'Backup Complete', type: 'success' });
            } else {
                notify.error(res.message || 'Backup failed.');
            }
        } catch (_) {
            notify.error('Connection error while backing up.');
        } finally {
            btn.disabled = false;
            btn.innerHTML = orig;
        }
    });

    loadBackups();

    // ── Toggle labels ──
    const cb = container.querySelector('#s-maintenance');
    const lb = container.querySelector('#maint-label');
    cb.addEventListener('change', () => {
        lb.textContent = cb.checked ? 'Enabled — non-admin users cannot log in' : 'Disabled — system is live';
    });

    // ── Save handlers ──
    container.querySelectorAll('[data-section]').forEach(btn => {
        if (btn.tagName !== 'BUTTON') return;
        if (btn.id === 'btn-add-sem') return;
        btn.addEventListener('click', async () => {
            const orig = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = `${icon('clock', inl)} Saving...`;
            await new Promise(r => setTimeout(r, 500));
            btn.disabled = false;
            btn.innerHTML = `${icon('checkCircle', inl)} Saved!`;
            showToast('Settings saved successfully!', 'success');
            setTimeout(() => { btn.innerHTML = orig; }, 1800);
        });
    });

    container.querySelector('#btn-refresh-activity')?.addEventListener('click', () => loadActivityLog());

    // ── Data Management buttons ──
    container.querySelector('#btn-clear-inactive').addEventListener('click', async () => {
        const ok = await notify.confirm('Remove inactive user accounts older than 90 days?\nThis cannot be undone.', { danger: true, confirmText: 'Run Cleanup' });
        if (ok) showToast('Cleanup completed — no eligible records found.', 'success');
    });
    container.querySelector('#btn-archive-sems').addEventListener('click', async () => {
        const ok = await notify.confirm('Archive semesters older than 2 years?', { confirmText: 'Archive' });
        if (ok) showToast('Semesters archived successfully.', 'success');
    });

    // ── AI / Ali Assistant save ──
    container.querySelector('#save-ai').addEventListener('click', async () => {
        const btn = container.querySelector('#save-ai');
        const keyInput = container.querySelector('#ai-hf-key');
        const modelInput = container.querySelector('#ai-model');
        if (!keyInput) return; // panel never opened/loaded
        const orig = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = `${icon('clock', inl)} Saving...`;
        const res = await Api.post('/AiSettingsAPI.php?action=save', {
            hf_api_key: keyInput.value.trim(),
            ai_model: modelInput.value.trim(),
        });
        btn.disabled = false;
        btn.innerHTML = orig;
        if (res.success) {
            showToast('AI settings saved successfully!', 'success');
            keyInput.value = '';
            loadAiSettings();
        } else {
            showToast(res.message || 'Could not save AI settings.', 'error');
        }
    });

    // ── System Overview ──────────────────────────────────────────────────────

    async function loadSystemOverview() {
        const body = container.querySelector('#sov-body');
        body.innerHTML = '<div class="sov-loading">Loading system data...</div>';

        try {
            const dashRes = await Api.get('/DashboardAPI.php?action=admin');
            const s   = dashRes.success ? (dashRes.data?.stats         ?? {}) : {};
            const ru  = dashRes.success ? (dashRes.data?.recent_users   ?? []) : [];
            const depts = dashRes.success ? (dashRes.data?.enrollment_by_dept ?? []) : [];

            const stat = (val, lbl, color = '#00461B') => `
                <div class="sov-stat">
                    <div class="sov-stat-val" style="color:${color}">${val ?? '—'}</div>
                    <div class="sov-stat-lbl">${lbl}</div>
                </div>`;

            const roleColors = { admin: '#7c3aed', dean: '#0369a1', instructor: '#0f766e', student: '#15803d' };
            const roleBadge = (r) => {
                const c = roleColors[r] || '#525252';
                return `<span style="background:${c}15;color:${c};border:1px solid ${c}30;border-radius:5px;padding:2px 7px;font-size:11px;font-weight:700;text-transform:capitalize;">${r}</span>`;
            };

            const recentRows = ru.length === 0
                ? `<tr><td colspan="4" style="text-align:center;padding:20px;color:#9ca3af;">No users yet</td></tr>`
                : ru.map(u => `
                    <tr>
                        <td style="padding:9px 12px;font-weight:600;color:#262626;">${escSy(u.first_name)} ${escSy(u.last_name)}</td>
                        <td style="padding:9px 12px;color:#525252;font-size:12.5px;">${escSy(u.email)}</td>
                        <td style="padding:9px 12px;">${roleBadge(u.role)}</td>
                        <td style="padding:9px 12px;color:#9ca3af;font-size:12px;">${new Date(u.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</td>
                    </tr>`).join('');

            const deptRows = depts.length === 0
                ? `<div style="color:#9ca3af;font-size:13px;padding:12px 0;">No department data available.</div>`
                : depts.map(d => `
                    <div class="sov-dept-row">
                        <div style="flex:1;min-width:0;">
                            <div class="sov-campus-name">${escSy(d.department_name)}</div>
                            <div style="font-size:11.5px;color:#9ca3af;margin-top:2px;">${d.program_count} program${d.program_count!=1?'s':''} · ${d.section_count} section${d.section_count!=1?'s':''}</div>
                        </div>
                        <div style="text-align:right;flex-shrink:0;">
                            <div style="font-size:18px;font-weight:800;color:#00461B;">${d.enrolled_count}</div>
                            <div style="font-size:11px;color:#9ca3af;">enrolled</div>
                        </div>
                    </div>`).join('');

            body.innerHTML = `
                <style>
                    .sov-group-lbl {
                        font-size:11px;font-weight:700;color:#9ca3af;
                        text-transform:uppercase;letter-spacing:.7px;
                        margin:20px 0 10px;
                    }
                    .sov-group-lbl:first-child { margin-top:0; }
                    .sov-dept-row {
                        display:flex;align-items:center;gap:16px;
                        padding:12px 14px;border-radius:10px;border:1px solid #f0f0f0;
                        margin-bottom:8px;
                    }
                    .sov-dept-row:last-child { margin-bottom:0; }
                    .sov-tbl { width:100%;border-collapse:collapse; }
                    .sov-tbl thead th {
                        text-align:left;padding:8px 12px;font-size:11px;font-weight:700;
                        color:#fff;background:#00461B;text-transform:uppercase;letter-spacing:.5px;
                        border-bottom:1px solid #f0f0f0;
                    }
                    .sov-tbl tbody tr:hover { background:#fafafa; }
                    .sov-tbl tbody tr { border-bottom:1px solid #f9f9f9; }
                </style>

                <div class="sov-group-lbl">People</div>
                <div class="sov-grid" style="margin-bottom:0;">
                    ${stat(s.total_users,       'Total Users')}
                    ${stat(s.total_students,    'Students')}
                    ${stat(s.total_instructors, 'Instructors')}
                    ${stat(s.total_deans,       'Deans')}
                </div>

                <div class="sov-group-lbl">Academic Structure</div>
                <div class="sov-grid" style="margin-bottom:0;">
                    ${stat(s.total_departments, 'Departments')}
                    ${stat(s.total_programs,    'Programs')}
                    ${stat(s.total_subjects,    'Subjects')}
                    ${stat(s.total_sections,    'Sections')}
                </div>

                <div class="sov-group-lbl">Activity</div>
                <div class="sov-grid" style="margin-bottom:0;">
                    ${stat(s.total_enrolled,         'Enrolled Students',   '#0369a1')}
                    ${stat(s.total_faculty_assigned, 'Active Instructors',  '#0f766e')}
                    ${stat(s.total_offerings,        'Subject Offerings',   '#7c3aed')}
                    ${stat(s.total_lessons,          'Lessons',             '#b45309')}
                    ${stat(s.total_quizzes,          'Quizzes',             '#b91c1c')}
                </div>

                <div class="sov-group-lbl">Enrollment by Department</div>
                ${deptRows}

                <div class="sov-group-lbl">Recently Registered Users</div>
                <div style="overflow-x:auto;">
                    <table class="sov-tbl">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Email</th>
                                <th>Role</th>
                                <th>Joined</th>
                            </tr>
                        </thead>
                        <tbody>${recentRows}</tbody>
                    </table>
                </div>
            `;
        } catch {
            body.innerHTML = '<div class="sov-loading" style="color:#b91c1c;">Failed to load system data.</div>';
        }
    }

    // ── School Year ──────────────────────────────────────────────────────────

    const SEM_DEFS = [
        { level: 1, name: 'First Semester'  },
        { level: 2, name: 'Second Semester' },
        { level: 3, name: 'Summer'          },
    ];

    function computeAcademicYear() {
        const now = new Date();
        const y = now.getFullYear();
        const m = now.getMonth() + 1;
        const start = m >= 7 ? y : y - 1;
        return `${start}-${start + 1}`;
    }

    function semDefaultDates(level, acadYear) {
        const [sy] = (acadYear || '').split('-').map(Number);
        if (!sy) return { start: '', end: '' };
        const ey = sy + 1;
        if (level === 1) return { start: `${sy}-07-01`,  end: `${sy}-11-30`  };
        if (level === 2) return { start: `${sy}-12-01`,  end: `${ey}-04-30`  };
        if (level === 3) return { start: `${ey}-05-01`,  end: `${ey}-06-30`  };
        return { start: '', end: '' };
    }

    function fmtDate(d) {
        if (!d) return null;
        return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    // Semester sequence: 1 → 2 → 3 → 1 (next year) → ...
    // If target level > current level → same academic year (moving forward)
    // If target level <= current level → next academic year (wrapping around)
    function targetAcademicYear(targetLevel, activeSem) {
        if (!activeSem) return computeAcademicYear();
        const [sy] = activeSem.academic_year.split('-').map(Number);
        const curLevel = parseInt(activeSem.sem_level);
        return targetLevel > curLevel
            ? activeSem.academic_year
            : `${sy + 1}-${sy + 2}`;
    }

    // ── Activity Log ─────────────────────────────────────────────────────────

    let _actPage = 1;
    let _actSearch = '';
    let _actType = '';
    let _actDevice = '';   // phone / computer
    let _actRole = '';

    // Human labels + a rough grouping color for each raw activity_type — new
    // types just fall back to a neutral badge instead of breaking anything.
    const ACTIVITY_META = {
        login_success:        { label: 'Logged in',            color: '#15803d', bg: '#f0fdf4' },
        login_failed:         { label: 'Failed login',         color: '#b91c1c', bg: '#fef2f2' },
        login_blocked:        { label: 'Login blocked',        color: '#b91c1c', bg: '#fef2f2' },
        logout:                { label: 'Logged out',           color: '#6b7280', bg: '#f9fafb' },
        first_login:           { label: 'First login',          color: '#1d4ed8', bg: '#eff6ff' },
        password_set:          { label: 'Password set',         color: '#1d4ed8', bg: '#eff6ff' },
        password_reset:        { label: 'Password reset',       color: '#b45309', bg: '#fffbeb' },
        register:               { label: 'Self-registered',      color: '#7c3aed', bg: '#f5f3ff' },
    };
    function activityMeta(type) {
        return ACTIVITY_META[type] || { label: type.replace(/_/g, ' '), color: '#374151', bg: '#f3f4f6' };
    }

    async function loadAiSettings() {
        const body = container.querySelector('#ai-body');
        body.innerHTML = '<div class="sov-loading">Loading...</div>';

        const res = await Api.get('/AiSettingsAPI.php?action=get', { ttl: 0 });
        if (!res.success) {
            body.innerHTML = `<div style="color:#b91c1c;font-size:13px;padding:20px;">Could not load AI settings: ${escSy(res.message || 'Unknown error')}</div>`;
            return;
        }
        const { has_key, masked_key, model } = res.data;

        body.innerHTML = `
            <div class="fg">
                <label>Hugging Face Access Token</label>
                <input type="password" class="f-input" id="ai-hf-key" placeholder="${has_key ? 'Currently set — leave blank to keep it' : 'hf_...'}" autocomplete="off">
                <div class="fg-hint">
                    ${has_key
                        ? `${icon('checkCircle', { size: 13, className: 'ui-icon-inline' })} A token is saved (${escSy(masked_key)}). Enter a new one to replace it.`
                        : `${icon('warning', { size: 13, className: 'ui-icon-inline' })} No token saved yet — Ali, AI quiz generation, AI grading, and the SAS module-quiz builder won't work until one is added.`}
                    Get a free token at huggingface.co/settings/tokens.
                </div>
            </div>
            <div class="fg">
                <label>Model</label>
                <input type="text" class="f-input" id="ai-model" value="${escSy(model || 'meta-llama/Llama-3.1-8B-Instruct')}">
                <div class="fg-hint">A Hugging Face chat/instruct model id available on the free Inference API router. Leave the default unless you know you need a different one.</div>
            </div>`;
        attachEyeToggle(body.querySelector('#ai-hf-key'));
    }

    /** "3 min ago" under the timestamp — quicker to scan than a date alone. */
    function ago(ts) {
        const then = new Date(String(ts).replace(' ', 'T'));
        if (isNaN(then)) return '';
        const secs = Math.max(0, (Date.now() - then.getTime()) / 1000);
        const say = secs < 60 ? 'just now'
            : secs < 3600 ? Math.floor(secs / 60) + ' min ago'
            : secs < 86400 ? Math.floor(secs / 3600) + ' hr ago'
            : Math.floor(secs / 86400) + ' days ago';
        return `<span class="act-ago">${say}</span>`;
    }

    async function loadActivityLog() {
        const body = container.querySelector('#activity-body');
        body.innerHTML = '<div class="sov-loading">Loading activity...</div>';

        const params = new URLSearchParams({ page: _actPage, per_page: 30 });
        if (_actSearch) params.set('search', _actSearch);
        if (_actType) params.set('activity_type', _actType);
        if (_actDevice) params.set('device', _actDevice);
        if (_actRole) params.set('role', _actRole);

        const res = await Api.get(`/UsersAPI.php?action=activity-log&${params}`, { ttl: 0 });
        if (!res.success) {
            body.innerHTML = `<div style="color:#b91c1c;font-size:13px;padding:20px;">Could not load activity log: ${escSy(res.message || 'Unknown error')}</div>`;
            return;
        }

        const { logs, types, total, page, total_pages } = res.data;

        body.innerHTML = `
            <style>
                .act-toolbar { display:flex; gap:10px; flex-wrap:wrap; margin-bottom:16px; }
                .act-search { flex:1; min-width:200px; padding:8px 12px; border:1px solid #e5e7eb; border-radius:8px; font-size:13px; }
                .act-type-select { padding:8px 12px; border:1px solid #e5e7eb; border-radius:8px; font-size:13px; background:#fff; }
                .act-count { font-size:12px; color:#6b7280; margin-bottom:10px; }
                .act-table-wrap { border:1px solid #e8e8e8; border-radius:12px; overflow:auto; }
                .act-table { width:100%; min-width:940px; border-collapse:collapse; font-size:12.5px; }
                .act-desc { min-width:200px; }
                .act-table td:first-child { white-space:nowrap; }
                .act-table th { text-align:left; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.3px;
                    color:#fff; background:#00461B; padding:10px 14px; border-bottom:1px solid #e8e8e8; white-space:nowrap; }
                .act-table td { padding:10px 14px; border-bottom:1px solid #f0f0f0; vertical-align:middle; }
                .act-table tr:last-child td { border-bottom:none; }
                .act-table tr:nth-child(even) td { background:#fafafa; }
                .act-badge { display:inline-block; font-size:10.5px; font-weight:700; padding:3px 9px; border-radius:20px; white-space:nowrap; }
                .act-who { font-weight:700; color:#262626; }
                .act-email { color:#9ca3af; font-weight:400; }
                .act-desc { color:#6b7280; }
                .act-time { color:#9ca3af; white-space:nowrap; }
                .act-empty { text-align:center; padding:40px; color:#9ca3af; font-size:13px; }
                .act-badge { border:1px solid #111; background:#fff; color:#111; }
                .act-sev-create { border-color:#00461B; color:#00461B; }
                .act-sev-warn   { border-color:#B45309; color:#B45309; }
                .act-sev-danger { border-color:#B91C1C; color:#B91C1C; }
                .act-role { display:block; font-size:10.5px; color:#6b7280; text-transform:capitalize; margin-top:2px; }
                .act-device { color:#374151; white-space:nowrap; }
                .act-ip { font-family:ui-monospace, monospace; font-size:11.5px; color:#374151; white-space:nowrap; }
                .act-ago { display:block; font-size:10.5px; color:#9ca3af; }
                .act-pager { display:flex; align-items:center; justify-content:center; gap:12px; margin-top:16px; }
                .act-pager button { border:1px solid #e5e7eb; background:#fff; border-radius:6px; padding:6px 12px; font-size:12.5px; cursor:pointer; }
                .act-pager button:disabled { opacity:.4; cursor:default; }
                .act-pager span { font-size:12.5px; color:#6b7280; }
            </style>
            <div class="act-toolbar">
                <input type="text" class="act-search" id="act-search" placeholder="Search name, email, details, IP address…" value="${escSy(_actSearch)}">
                <select class="act-type-select" id="act-type-select">
                    <option value="">All actions</option>
                    ${(res.data.type_options || types.map(t => ({ value: t, label: t }))).map(o => `<option value="${escSy(o.value)}" ${o.value === _actType ? 'selected' : ''}>${escSy(o.label)}</option>`).join('')}
                </select>
                <select class="act-type-select" id="act-device-select">
                    <option value="">Any device</option>
                    <option value="phone" ${_actDevice === 'phone' ? 'selected' : ''}>Phone</option>
                    <option value="computer" ${_actDevice === 'computer' ? 'selected' : ''}>Computer</option>
                </select>
                <select class="act-type-select" id="act-role-select">
                    <option value="">Any role</option>
                    ${['admin','dean','program_head','instructor','student'].map(r => `<option value="${r}" ${_actRole === r ? 'selected' : ''}>${r.replace('_',' ')}</option>`).join('')}
                </select>
            </div>
            <div class="act-count">${total} ${total === 1 ? 'entry' : 'entries'}</div>
            ${logs.length === 0 ? `<div class="act-empty">No activity found${_actSearch || _actType ? ' for this filter' : ''}.</div>` : `
            <div class="act-table-wrap">
                <table class="act-table">
                    <thead>
                        <tr>
                            <th>Action</th>
                            <th>Who</th>
                            <th>Details</th>
                            <th>Device</th>
                            <th>IP address</th>
                            <th>When</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${logs.map(l => {
                            const meta = activityMeta(l.activity_type);
                            const who = l.users_id
                                ? `<span class="act-who">${escSy((l.first_name || '') + ' ' + (l.last_name || '')).trim() || 'Unknown user'}</span><br><span class="act-email">${escSy(l.email || '')}</span>`
                                : `<span class="act-email">System / unauthenticated</span>`;
                            const time = new Date(l.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
                            const label = l.action_label || meta.label;
                            const sev = l.severity || 'normal';
                            const role = l.role ? `<span class="act-role">${escSy(String(l.role).replace('_', ' '))}</span>` : '';
                            return `
                            <tr>
                                <td><span class="act-badge act-sev-${sev}">${escSy(label)}</span></td>
                                <td>${who}${role}</td>
                                <td class="act-desc">${escSy(l.activity_description || '')}</td>
                                <td class="act-device" title="${escSy(l.user_agent || '')}">${escSy(l.device_label || 'Unknown device')}</td>
                                <td class="act-ip">${escSy(l.ip_address || 'Not recorded')}</td>
                                <td class="act-time">${time}${ago(l.created_at)}</td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>
            <div class="act-pager">
                <button id="act-prev" ${page <= 1 ? 'disabled' : ''}>&larr; Newer</button>
                <span>Page ${page} of ${total_pages || 1}</span>
                <button id="act-next" ${page >= total_pages ? 'disabled' : ''}>Older &rarr;</button>
            </div>`}
        `;

        let searchDebounce;
        body.querySelector('#act-search')?.addEventListener('input', (e) => {
            clearTimeout(searchDebounce);
            searchDebounce = setTimeout(() => {
                _actSearch = e.target.value.trim();
                _actPage = 1;
                loadActivityLog();
            }, 350);
        });
        body.querySelector('#act-type-select')?.addEventListener('change', (e) => {
            _actType = e.target.value;
            _actPage = 1;
            loadActivityLog();
        });
        body.querySelector('#act-device-select')?.addEventListener('change', (e) => {
            _actDevice = e.target.value;
            _actPage = 1;
            loadActivityLog();
        });
        body.querySelector('#act-role-select')?.addEventListener('change', (e) => {
            _actRole = e.target.value;
            _actPage = 1;
            loadActivityLog();
        });
        body.querySelector('#act-prev')?.addEventListener('click', () => { if (_actPage > 1) { _actPage--; loadActivityLog(); } });
        body.querySelector('#act-next')?.addEventListener('click', () => { if (_actPage < total_pages) { _actPage++; loadActivityLog(); } });
    }

    async function loadSchoolYear() {
        const body = container.querySelector('#sy-body');
        body.innerHTML = '<div style="text-align:center;padding:40px;color:#737373;">Loading...</div>';

        const res = await Api.get('/SemesterAPI.php?action=list');
        let allSems = res.success ? res.data : [];

        async function reload() {
            const r = await Api.get('/SemesterAPI.php?action=list');
            allSems = r.success ? r.data : allSems;
            render();
        }

        function render() {
            const active = allSems.find(s => s.status === 'active');

            // Build per-level "projected year" (year that would be set if this toggle is clicked)
            // For the active toggle, show its own year
            const projYear = (def) => {
                if (active && parseInt(active.sem_level) === def.level) return active.academic_year;
                return targetAcademicYear(def.level, active);
            };

            const fmtAY = (ay) => `AY ${ay}`;

            body.innerHTML = `
                <style>
                    .sy-active-banner {
                        display:flex; align-items:center; gap:14px;
                        background:#fff; border:1px solid #111; border-radius:14px;
                        padding:16px 20px; margin-bottom:24px;
                    }
                    .sy-active-pulse {
                        width:10px; height:10px; border-radius:50%; background:#4ade80; flex-shrink:0;
                        box-shadow: 0 0 0 3px rgba(74,222,128,.25);
                        animation: syPulse 2s infinite;
                    }
                    @keyframes syPulse {
                        0%,100% { box-shadow: 0 0 0 3px rgba(74,222,128,.25); }
                        50%      { box-shadow: 0 0 0 6px rgba(74,222,128,.08); }
                    }
                    .sy-active-info { flex:1; min-width:0; }
                    .sy-active-name { font-size:15px; font-weight:800; color:#111; }
                    .sy-active-meta { font-size:12px; color:#6B7280; margin-top:2px; }
                    .sy-no-active-banner {
                        display:flex; align-items:center; gap:10px;
                        padding:12px 16px; background:#FEF3C7; border:1.5px solid #FDE68A;
                        border-radius:12px; margin-bottom:24px;
                        font-size:13px; font-weight:600; color:#92400e;
                    }
                    .sy-sem-row {
                        display:flex; align-items:center; gap:16px;
                        padding:18px 20px; border:1.5px solid #e8e8e8; border-radius:14px;
                        margin-bottom:10px; transition:border-color .2s, background .2s;
                        cursor:default;
                    }
                    .sy-sem-row:last-child { margin-bottom:0; }
                    .sy-sem-row.is-active {
                        border-color:#111; background:#fff;
                    }
                    .sy-sem-icon {
                        width:42px; height:42px; border-radius:12px; flex-shrink:0;
                        display:flex; align-items:center; justify-content:center;
                        background:#f3f4f6;
                    }
                    .sy-sem-row.is-active .sy-sem-icon { background:#f3f4f6; }
                    .sy-sem-icon svg { stroke:#6b7280; }
                    .sy-sem-row.is-active .sy-sem-icon svg { stroke:#00461B; }
                    .sy-sem-info { flex:1; min-width:0; }
                    .sy-sem-name { font-size:14px; font-weight:700; color:#262626; }
                    .sy-sem-row.is-active .sy-sem-name { color:#00461B; }
                    .sy-sem-year { font-size:12px; color:#9ca3af; margin-top:2px; font-weight:500; }
                    .sy-sem-row.is-active .sy-sem-year { color:#6b7280; }

                    /* Toggle switch */
                    .sy-toggle { position:relative; display:inline-block; width:48px; height:26px; flex-shrink:0; }
                    .sy-toggle input { opacity:0; width:0; height:0; }
                    .sy-toggle-slider {
                        position:absolute; cursor:pointer; top:0; left:0; right:0; bottom:0;
                        background:#d1d5db; border-radius:26px; transition:.25s;
                    }
                    .sy-toggle-slider:before {
                        position:absolute; content:''; height:20px; width:20px;
                        left:3px; bottom:3px; background:#fff; border-radius:50%;
                        transition:.25s; box-shadow:0 1px 4px rgba(0,0,0,.2);
                    }
                    .sy-toggle input:checked + .sy-toggle-slider { background:#00461B; }
                    .sy-toggle input:checked + .sy-toggle-slider:before { transform:translateX(22px); }
                    .sy-toggle input:disabled + .sy-toggle-slider { opacity:.5; cursor:not-allowed; }
                </style>

                ${active ? `
                <div class="sy-active-banner">
                    <div class="sy-active-pulse"></div>
                    <div class="sy-active-info">
                        <div class="sy-active-name">${escSy(active.semester_name)} &nbsp;·&nbsp; ${fmtAY(active.academic_year)}</div>
                        <div class="sy-active-meta">
                            ${active.start_date && active.end_date
                                ? `${fmtDate(active.start_date)} – ${fmtDate(active.end_date)}`
                                : 'No dates configured'}
                        </div>
                    </div>
                </div>` : `
                <div class="sy-no-active-banner">
                    ${icon('warning', { size: 15, className: 'ui-icon-inline' })}
                    No active semester — toggle one below to activate it.
                </div>`}

                ${SEM_DEFS.map(def => {
                    const isActive = active && parseInt(active.sem_level) === def.level;
                    const py = projYear(def);
                    const semIcon = def.level === 1
                        ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>`
                        : def.level === 2
                        ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`
                        : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
                    return `
                    <div class="sy-sem-row ${isActive ? 'is-active' : ''}">
                        <div class="sy-sem-icon">${semIcon}</div>
                        <div class="sy-sem-info">
                            <div class="sy-sem-name">${def.name}</div>
                            <div class="sy-sem-year">${fmtAY(py)}</div>
                        </div>
                        <label class="sy-toggle" title="${isActive ? 'Click to deactivate' : `Activate ${def.name} for ${fmtAY(py)}`}">
                            <input type="checkbox" data-level="${def.level}" ${isActive ? 'checked' : ''}>
                            <span class="sy-toggle-slider"></span>
                        </label>
                    </div>`;
                }).join('')}
            `;

            // Toggle handlers
            body.querySelectorAll('.sy-toggle input').forEach(cb => {
                cb.addEventListener('change', async () => {
                    const level = parseInt(cb.dataset.level);
                    const def   = SEM_DEFS.find(d => d.level === level);
                    // Disable all toggles while processing
                    body.querySelectorAll('.sy-toggle input').forEach(x => { x.disabled = true; });

                    if (cb.checked) {
                        // ── Activate ──────────────────────────────────────────
                        const currentActive = allSems.find(s => s.status === 'active');
                        const year = targetAcademicYear(level, currentActive);

                        const confirmMsg = currentActive
                            ? `Switch the active semester to "${def.name}" (AY ${year})?\n"${currentActive.semester_name}" (AY ${currentActive.academic_year}) will be deactivated.`
                            : `Set "${def.name}" (AY ${year}) as the active semester?`;
                        const ok = await notify.confirm(confirmMsg, { confirmText: 'Activate' });
                        if (!ok) { cb.checked = false; render(); return; }

                        let existing = allSems.find(s => s.academic_year === year && parseInt(s.sem_level) === level);

                        if (!existing) {
                            // Semester doesn't exist yet for this year — create it as active
                            const dates = semDefaultDates(level, year);
                            const cr = await Api.post('/SemesterAPI.php?action=create', {
                                semester_name: def.name,
                                academic_year: year,
                                sem_level: level,
                                start_date: dates.start,
                                end_date: dates.end,
                                status: 'active',
                            });
                            if (!cr.success) {
                                showToast(cr.message || 'Failed to create semester', 'error');
                                render(); return;
                            }
                            // Fetch fresh list to get the new semester_id
                            const lr = await Api.get('/SemesterAPI.php?action=list');
                            allSems = lr.success ? lr.data : allSems;
                            showToast(`${def.name} (AY ${year}) is now active`, 'success');
                            render(); return;
                        }

                        // Semester exists — just activate it
                        const r = await Api.post('/SemesterAPI.php?action=update', {
                            semester_id: parseInt(existing.semester_id),
                            semester_name: existing.semester_name,
                            academic_year: existing.academic_year,
                            start_date: existing.start_date,
                            end_date: existing.end_date,
                            status: 'active',
                        });
                        if (r.success) {
                            // Update in-memory state (no list call needed — avoids autoActivate)
                            allSems.forEach(s => { if (s.status === 'active') s.status = 'inactive'; });
                            existing.status = 'active';
                            showToast(`${def.name} (AY ${year}) is now active`, 'success');
                        } else {
                            showToast(r.message || 'Failed to activate', 'error');
                        }
                        render();

                    } else {
                        // ── Deactivate ────────────────────────────────────────
                        const activeSem = allSems.find(s => s.status === 'active');
                        if (!activeSem) { render(); return; }

                        const ok = await notify.confirm(
                            `Set "${def.name}" as inactive?\nThere will be no active semester until you toggle another on.`,
                            { confirmText: 'Deactivate' }
                        );
                        if (!ok) { render(); return; }

                        const r = await Api.post('/SemesterAPI.php?action=update', {
                            semester_id: parseInt(activeSem.semester_id),
                            semester_name: activeSem.semester_name,
                            academic_year: activeSem.academic_year,
                            start_date: activeSem.start_date,
                            end_date: activeSem.end_date,
                            status: 'inactive',
                        });
                        if (r.success) {
                            activeSem.status = 'inactive';
                            showToast(`${def.name} deactivated`, 'success');
                        } else {
                            showToast(r.message || 'Failed to deactivate', 'error');
                        }
                        render();
                    }
                });
            });
        }

        render();
    }
}

function escSy(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
}

function showToast(msg, type = 'success') {
    const t = document.createElement('div');
    t.className = `set-toast ${type}`;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
}
