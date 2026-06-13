/**
 * Admin Settings Page
 * System settings management — professional left-nav layout
 */
import { Api } from '../../api.js';
import { icon } from '../../utils/icons.js';

const inl = { size: 14, className: 'ui-icon-inline' };

export async function render(container) {
    container.innerHTML = `
        <style>
            .set-wrap { max-width: 100%; }

            /* ── Banner ── */
            .set-banner {
                background: #00461B;
                border-radius: 20px; padding: 28px 36px; margin-bottom: 28px;
                display: flex; align-items: center; gap: 20px;
                box-shadow: 0 2px 10px rgba(0,70,27,.1);
            }
            .set-banner-icon {
                width: 52px; height: 52px; border-radius: 14px;
                background: rgba(255,255,255,.15);
                display: flex; align-items: center; justify-content: center;
                font-size: 24px; flex-shrink: 0; position: relative; z-index: 1;
            }
            .set-banner-text { position: relative; z-index: 1; }
            .set-banner-text h1 { font-size: 22px; font-weight: 800; color: #fff; margin-bottom: 4px; }
            .set-banner-text p  { color: rgba(255,255,255,.78); font-size: 14px; }

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
            .set-nav-item.active { background: #f0fdf4; color: #00461B; font-weight: 700; }
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
            }
            .set-card-head-icon.green  { background: #D1FAE5; }
            .set-card-head-icon.blue   { background: #DBEAFE; }
            .set-card-head-icon.yellow { background: #FEF3C7; }
            .set-card-head-icon.purple { background: #EDE9FE; }
            .set-card-head-icon.red    { background: #FEE2E2; }
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

            /* Password field */
            .pw-wrap { position: relative; }
            .pw-wrap .f-input { padding-right: 42px; }
            .pw-toggle {
                position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
                background: none; border: none; cursor: pointer; font-size: 15px; color: #737373;
            }

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
                background: #FEE2E2; color: #b91c1c;
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
            .set-toast.error   { background: #FEE2E2; color: #b91c1c; border: 1px solid #FCA5A5; }
            @keyframes slideIn { from { opacity:0; transform:translateY(-12px); } to { opacity:1; transform:translateY(0); } }

            /* Tag chips */
            .ext-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
            .ext-chip {
                background: #F5F5F5; border: 1px solid #e0e0e0;
                padding: 3px 10px; border-radius: 20px;
                font-size: 11.5px; font-weight: 600; color: #525252;
            }

            /* Number input with stepper */
            .num-wrap { display: flex; align-items: center; gap: 0; }
            .num-wrap .f-input { border-radius: 9px 0 0 9px; border-right: none; text-align: center; width: 80px; }
            .num-btn {
                border: 1.5px solid #e0e0e0; background: #f5f5f5;
                padding: 0 13px; font-size: 16px; cursor: pointer; height: 42px;
                color: #525252; transition: background .15s;
            }
            .num-btn:last-child { border-radius: 0 9px 9px 0; }
            .num-btn:hover { background: #e8e8e8; }

            @media(max-width:900px) {
                .set-layout { grid-template-columns: 1fr; }
                .set-nav { position: static; }
                .fg-row { grid-template-columns: 1fr; }
            }
        </style>

        <div class="set-wrap">
            <!-- Banner -->
            <div class="set-banner">
                <div class="set-banner-icon">${icon('settings', { size: 28 })}</div>
                <div class="set-banner-text">
                    <h1>System Settings</h1>
                    <p>Configure and manage CIT-LMS system-wide preferences</p>
                </div>
            </div>

            <div class="set-layout">
                <!-- Left Nav -->
                <aside class="set-nav">
                    <div class="set-nav-label">Configuration</div>
                    <div class="set-nav-item active" data-section="general">
                        <span class="nav-icon">${icon('school')}</span> General
                    </div>
                    <div class="set-nav-item" data-section="quiz">
                        <span class="nav-icon">${icon('quiz')}</span> Quiz Settings
                    </div>
                    <div class="set-nav-item" data-section="upload">
                        <span class="nav-icon">${icon('folder')}</span> File Upload
                    </div>
                    <div class="set-nav-divider"></div>
                    <div class="set-nav-label">Integrations</div>
                    <div class="set-nav-item" data-section="ai">
                        <span class="nav-icon">${icon('robot')}</span> AI Generation
                    </div>
                    <div class="set-nav-divider"></div>
                    <div class="set-nav-label">Academic</div>
                    <div class="set-nav-item" data-section="school-year">
                        <span class="nav-icon">${icon('calendar')}</span> School Year
                    </div>
                    <div class="set-nav-divider"></div>
                    <div class="set-nav-label">Advanced</div>
                    <div class="set-nav-item" data-section="maintenance">
                        <span class="nav-icon">${icon('wrench')}</span> Maintenance
                    </div>
                    <div class="set-nav-divider"></div>
                    <div class="set-nav-label">Administration</div>
                    <div class="set-nav-item" data-section="users">
                        <span class="nav-icon">${icon('users')}</span> Users
                    </div>
                    <div class="set-nav-item" data-section="rbac">
                        <span class="nav-icon">${icon('lock')}</span> Roles & Permissions
                    </div>
                </aside>

                <!-- Right Panels -->
                <main>
                    <!-- ── General ── -->
                    <div class="set-panel active" data-panel="general">
                        <div class="set-card">
                            <div class="set-card-head">
                                <div class="set-card-head-icon green">${icon('school', { size: 22 })}</div>
                                <div class="set-card-title">
                                    <h3>General Settings</h3>
                                    <p>Basic system information and academic calendar</p>
                                </div>
                            </div>
                            <div class="set-card-body">
                                <div class="fg">
                                    <label>Site Name</label>
                                    <input class="f-input" id="s-site-name" value="CIT-LMS">
                                </div>
                                <div class="fg">
                                    <label>Site Tagline</label>
                                    <input class="f-input" id="s-site-tagline" value="Learning Management System">
                                </div>
                                <div class="fg-row">
                                    <div class="fg">
                                        <label>Academic Year</label>
                                        <input class="f-input" id="s-acad-year" value="2025-2026" placeholder="e.g. 2025-2026">
                                    </div>
                                    <div class="fg">
                                        <label>Current Semester</label>
                                        <select class="f-select" id="s-semester">
                                            <option value="1st">1st Semester</option>
                                            <option value="2nd">2nd Semester</option>
                                            <option value="summer">Summer</option>
                                        </select>
                                    </div>
                                </div>
                                <div class="fg">
                                    <label>Student Enrollment</label>
                                    <div class="radio-cards">
                                        <label class="radio-card selected" id="enroll-open-card">
                                            <input type="radio" name="s-enrollment" value="1" checked> ${icon('checkCircle', inl)} Open
                                        </label>
                                        <label class="radio-card" id="enroll-closed-card">
                                            <input type="radio" name="s-enrollment" value="0"> ${icon('close', inl)} Closed
                                        </label>
                                    </div>
                                    <div class="fg-hint">Controls whether students can enroll in sections</div>
                                </div>
                            </div>
                            <div class="set-card-foot">
                                <button class="btn-primary" data-section="general">${icon('check', inl)} Save General Settings</button>
                            </div>
                        </div>
                    </div>

                    <!-- ── Quiz ── -->
                    <div class="set-panel" data-panel="quiz">
                        <div class="set-card">
                            <div class="set-card-head">
                                <div class="set-card-head-icon blue">${icon('quiz', { size: 22 })}</div>
                                <div class="set-card-title">
                                    <h3>Quiz Settings</h3>
                                    <p>Default values applied when instructors create new quizzes</p>
                                </div>
                            </div>
                            <div class="set-card-body">
                                <div class="fg">
                                    <label>Default Time Limit</label>
                                    <div class="num-wrap">
                                        <button class="num-btn" id="dec-time">−</button>
                                        <input type="number" class="f-input" id="s-quiz-time" value="30" min="1" max="300">
                                        <button class="num-btn" id="inc-time">+</button>
                                    </div>
                                    <div class="fg-hint">Minutes — instructors can override per quiz</div>
                                </div>
                                <div class="fg">
                                    <label>Default Passing Rate</label>
                                    <div class="num-wrap">
                                        <button class="num-btn" id="dec-pass">−</button>
                                        <input type="number" class="f-input" id="s-passing-rate" value="60" min="0" max="100">
                                        <button class="num-btn" id="inc-pass">+</button>
                                    </div>
                                    <div class="fg-hint">Percentage — minimum score to pass</div>
                                </div>
                                <div class="fg">
                                    <label>Allow Quiz Retakes</label>
                                    <div class="toggle-wrap">
                                        <label class="toggle">
                                            <input type="checkbox" id="s-retakes" checked>
                                            <span class="toggle-slider"></span>
                                        </label>
                                        <span class="toggle-label" id="retake-label">Enabled — students may retake quizzes</span>
                                    </div>
                                </div>
                                <div class="fg">
                                    <label>Show Correct Answers After Submission</label>
                                    <div class="toggle-wrap">
                                        <label class="toggle">
                                            <input type="checkbox" id="s-show-answers" checked>
                                            <span class="toggle-slider"></span>
                                        </label>
                                        <span class="toggle-label" id="answers-label">Enabled — students see answers on result page</span>
                                    </div>
                                </div>
                            </div>
                            <div class="set-card-foot">
                                <button class="btn-primary" data-section="quiz">${icon('check', inl)} Save Quiz Settings</button>
                            </div>
                        </div>
                    </div>

                    <!-- ── Upload ── -->
                    <div class="set-panel" data-panel="upload">
                        <div class="set-card">
                            <div class="set-card-head">
                                <div class="set-card-head-icon yellow">${icon('folder', { size: 22 })}</div>
                                <div class="set-card-title">
                                    <h3>File Upload Settings</h3>
                                    <p>Control what files users can upload and their size limits</p>
                                </div>
                            </div>
                            <div class="set-card-body">
                                <div class="fg">
                                    <label>Maximum File Size</label>
                                    <div class="num-wrap">
                                        <button class="num-btn" id="dec-size">−</button>
                                        <input type="number" class="f-input" id="s-max-file" value="10" min="1" max="100">
                                        <button class="num-btn" id="inc-size">+</button>
                                    </div>
                                    <div class="fg-hint">Megabytes (MB)</div>
                                </div>
                                <div class="fg">
                                    <label>Allowed File Extensions</label>
                                    <input class="f-input" id="s-extensions" value="pdf,doc,docx,ppt,pptx,jpg,png">
                                    <div class="fg-hint">Comma-separated — no spaces</div>
                                    <div class="ext-chips" id="ext-preview"></div>
                                </div>
                            </div>
                            <div class="set-card-foot">
                                <button class="btn-primary" data-section="upload">${icon('check', inl)} Save Upload Settings</button>
                            </div>
                        </div>
                    </div>

                    <!-- ── AI ── -->
                    <div class="set-panel" data-panel="ai">
                        <div class="set-card">
                            <div class="set-card-head">
                                <div class="set-card-head-icon purple">${icon('robot', { size: 22 })}</div>
                                <div class="set-card-title">
                                    <h3>AI Quiz Generation</h3>
                                    <p>Configure the Groq API for AI-powered quiz creation</p>
                                </div>
                            </div>
                            <div class="set-card-body">
                                <div class="fg">
                                    <label>Groq API Key</label>
                                    <div class="pw-wrap">
                                        <input type="password" class="f-input" id="s-groq-key" placeholder="gsk_...">
                                        <button class="pw-toggle" id="toggle-key" title="Show/hide key">${icon('eye', { size: 16 })}</button>
                                    </div>
                                    <div class="fg-hint">${icon('link', { size: 14, className: 'ui-icon-inline' })} Get your key at <strong>console.groq.com</strong> — kept server-side only</div>
                                </div>
                                <div class="fg">
                                    <label>AI Model</label>
                                    <select class="f-select" id="s-ai-model">
                                        <option value="llama-3.3-70b-versatile">Llama 3.3 70B — Best Quality (Recommended)</option>
                                        <option value="llama-3.1-8b-instant">Llama 3.1 8B — Fast & Lightweight</option>
                                        <option value="mixtral-8x7b-32768">Mixtral 8x7B — Large Context Window</option>
                                        <option value="gemma2-9b-it">Gemma 2 9B — Google DeepMind</option>
                                    </select>
                                    <div class="fg-hint">Model used for generating quiz questions from uploaded documents</div>
                                </div>
                                <div class="fg">
                                    <label>AI Feature Status</label>
                                    <div class="toggle-wrap">
                                        <label class="toggle">
                                            <input type="checkbox" id="s-ai-enabled" checked>
                                            <span class="toggle-slider"></span>
                                        </label>
                                        <span class="toggle-label" id="ai-status-label">Enabled — instructors can use AI quiz generator</span>
                                    </div>
                                </div>
                            </div>
                            <div class="set-card-foot">
                                <button class="btn-primary" data-section="ai">${icon('check', inl)} Save AI Settings</button>
                            </div>
                        </div>
                    </div>

                    <!-- ── School Year ── -->
                    <div class="set-panel" data-panel="school-year">
                        <div class="set-card">
                            <div class="set-card-head">
                                <div class="set-card-head-icon blue">${icon('calendar', { size: 22 })}</div>
                                <div class="set-card-title">
                                    <h3>School Year Records</h3>
                                    <p>Manage academic semesters and their active/inactive status for record keeping</p>
                                </div>
                            </div>
                            <div class="set-card-body" id="sy-body">
                                <div style="text-align:center;padding:32px;color:#737373;">Loading...</div>
                            </div>
                            <div class="set-card-foot">
                                <button class="btn-primary" id="btn-add-sem">+ Add Semester</button>
                            </div>
                        </div>
                    </div>

                    <!-- ── Maintenance ── -->
                    <div class="set-panel" data-panel="maintenance">
                        <div class="set-card">
                            <div class="set-card-head">
                                <div class="set-card-head-icon red">${icon('wrench', { size: 22 })}</div>
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
    const _loaded = { users: false, rbac: false };

    container.querySelectorAll('.set-nav-item').forEach(item => {
        item.addEventListener('click', async () => {
            const sec = item.dataset.section;
            container.querySelectorAll('.set-nav-item').forEach(i => i.classList.remove('active'));
            container.querySelectorAll('.set-panel').forEach(p => p.classList.remove('active'));
            item.classList.add('active');
            container.querySelector(`.set-panel[data-panel="${sec}"]`).classList.add('active');
            if (sec === 'school-year') loadSchoolYear();
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

    // ── Enrollment radio card highlight ──
    container.querySelectorAll('input[name="s-enrollment"]').forEach(r => {
        r.addEventListener('change', () => {
            container.querySelector('#enroll-open-card').classList.toggle('selected', r.value === '1' && r.checked);
            container.querySelector('#enroll-closed-card').classList.toggle('selected', r.value === '0' && r.checked);
        });
    });

    // ── Number steppers ──
    [
        ['dec-time', 'inc-time', 's-quiz-time', 1, 300],
        ['dec-pass', 'inc-pass', 's-passing-rate', 0, 100],
        ['dec-size', 'inc-size', 's-max-file', 1, 500]
    ].forEach(([decId, incId, inputId, min, max]) => {
        const input = container.querySelector(`#${inputId}`);
        container.querySelector(`#${decId}`).addEventListener('click', () => {
            input.value = Math.max(min, parseInt(input.value) - (inputId === 's-passing-rate' ? 5 : 1));
        });
        container.querySelector(`#${incId}`).addEventListener('click', () => {
            input.value = Math.min(max, parseInt(input.value) + (inputId === 's-passing-rate' ? 5 : 1));
        });
    });

    // ── Toggle labels ──
    function bindToggle(id, labelId, onText, offText) {
        const cb = container.querySelector(`#${id}`);
        const lb = container.querySelector(`#${labelId}`);
        cb.addEventListener('change', () => { lb.textContent = cb.checked ? onText : offText; });
    }
    bindToggle('s-retakes',      'retake-label',  'Enabled — students may retake quizzes',           'Disabled — one attempt per quiz');
    bindToggle('s-show-answers', 'answers-label', 'Enabled — students see answers on result page',   'Disabled — answers hidden after submission');
    bindToggle('s-ai-enabled',   'ai-status-label','Enabled — instructors can use AI quiz generator','Disabled — AI feature hidden from instructors');
    bindToggle('s-maintenance',  'maint-label',   'Enabled — non-admin users cannot log in',         'Disabled — system is live');

    // ── Extension chip preview ──
    function renderChips() {
        const val = container.querySelector('#s-extensions').value;
        const chips = val.split(',').map(e => e.trim()).filter(Boolean);
        container.querySelector('#ext-preview').innerHTML =
            chips.map(c => `<span class="ext-chip">.${c}</span>`).join('');
    }
    container.querySelector('#s-extensions').addEventListener('input', renderChips);
    renderChips();

    // ── Password toggle ──
    container.querySelector('#toggle-key').addEventListener('click', () => {
        const inp = container.querySelector('#s-groq-key');
        inp.type = inp.type === 'password' ? 'text' : 'password';
    });

    // ── Save handlers (static panels) ──
    container.querySelectorAll('[data-section]').forEach(btn => {
        if (btn.tagName !== 'BUTTON') return;
        if (['btn-add-sem'].includes(btn.id)) return; // handled separately
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

    // ── School Year: load semesters ──────────────────────────────────────────

    const SEM_NAMES = { 1: '1st Semester', 2: '2nd Semester', 3: 'Summer' };

    function fmtDate(d) {
        if (!d) return null;
        const dt = new Date(d);
        return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    async function loadSchoolYear() {
        const body = container.querySelector('#sy-body');
        body.innerHTML = '<div style="text-align:center;padding:32px;color:#737373;">Loading...</div>';

        const res = await Api.get('/SemesterAPI.php?action=list');
        const semesters = res.success ? res.data : [];

        if (semesters.length === 0) {
            body.innerHTML = '<p style="color:#737373;text-align:center;padding:24px 0;">No semesters yet. Click "+ Add Semester" to create one.</p>';
            return;
        }

        const active = semesters.find(s => s.status === 'active');

        // Group by academic_year (already sorted DESC)
        const grouped = {};
        for (const s of semesters) {
            if (!grouped[s.academic_year]) grouped[s.academic_year] = [];
            grouped[s.academic_year].push(s);
        }

        const statusBadge = (s) => {
            const cfg = {
                active:   { bg:'#E8F5E9', color:'#1B4D3E', dot:'#22c55e', label:'Active'   },
                upcoming: { bg:'#DBEAFE', color:'#1E40AF', dot:'#3b82f6', label:'Upcoming'  },
                inactive: { bg:'#f3f4f6', color:'#6b7280', dot:'#9ca3af', label:'Inactive'  },
            }[s.status] || { bg:'#f3f4f6', color:'#6b7280', dot:'#9ca3af', label: s.status };
            return `<span style="display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;background:${cfg.bg};color:${cfg.color};">
                <span style="width:7px;height:7px;border-radius:50%;background:${cfg.dot};display:inline-block;"></span>${cfg.label}
            </span>`;
        };

        const dateRange = (s) => {
            if (!s.start_date && !s.end_date) return '<span style="color:#bbb;">No dates set</span>';
            return `${fmtDate(s.start_date) || '?'} → ${fmtDate(s.end_date) || '?'}`;
        };

        body.innerHTML = `
            <style>
                .sy-active-card {
                    background: #f0fdf4;
                    border: 1.5px solid #86efac; border-radius: 12px;
                    padding: 14px 18px; margin-bottom: 20px;
                    display: flex; align-items: center; gap: 14px;
                }
                .sy-active-dot { width:10px;height:10px;border-radius:50%;background:#22c55e;flex-shrink:0;box-shadow:0 0 0 3px #bbf7d0; }
                .sy-active-info .sy-active-title { font-size:14px;font-weight:700;color:#15803d; }
                .sy-active-info .sy-active-sub   { font-size:12px;color:#4ade80; margin-top:2px; }
                .sy-no-active { background:#FEF3C7;border:1.5px solid #FDE68A;border-radius:12px;padding:12px 16px;margin-bottom:20px;font-size:13px;color:#92400e;font-weight:600; }
                .sy-ay-block { margin-bottom:16px; }
                .sy-ay-label { font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.7px;padding:6px 0 8px;border-bottom:2px solid #f0f0f0;margin-bottom:0; }
                .sy-row {
                    display:grid; grid-template-columns:1fr 180px 110px 36px;
                    align-items:center; gap:12px;
                    padding:11px 4px; border-bottom:1px solid #f5f5f5;
                    font-size:13.5px;
                }
                .sy-row:last-child { border-bottom:none; }
                .sy-row:hover { background:#fafafa; border-radius:8px; }
                .sy-row-name { font-weight:600; color:#262626; }
                .sy-row-name.active-row { color:#15803d; }
                .sy-row-date { font-size:12px; color:#737373; }
                .sy-row-actions { display:flex; gap:6px; justify-content:flex-end; position:relative; }
                .sy-kebab { width:30px;height:30px;border-radius:7px;border:1px solid #e5e7eb;background:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s;font-size:18px;color:#6b7280;line-height:1; }
                .sy-kebab:hover { background:#f3f4f6;border-color:#d1d5db;color:#374151; }
                .sy-kebab.open { background:#f3f4f6;border-color:#d1d5db; }
                .sy-dropdown { position:absolute;top:calc(100% + 4px);right:0;background:#fff;border:1px solid #e5e7eb;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.12);min-width:155px;z-index:100;overflow:hidden;animation:syDdIn .1s ease; }
                @keyframes syDdIn { from{opacity:0;transform:translateY(-4px)} to{opacity:1;transform:translateY(0)} }
                .sy-dd-item { display:flex;align-items:center;gap:9px;padding:9px 14px;font-size:13px;font-weight:500;color:#374151;cursor:pointer;transition:background .1s; }
                .sy-dd-item:hover { background:#f9fafb; }
                .sy-dd-item.danger { color:#dc2626; }
                .sy-dd-item.danger:hover { background:#fef2f2; }
                .sy-dd-item.disabled { color:#d1d5db;cursor:not-allowed;pointer-events:none; }
                .sy-dd-sep { height:1px;background:#f0f0f0;margin:3px 0; }
            </style>

            ${active
                ? `<div class="sy-active-card">
                    <div class="sy-active-dot"></div>
                    <div class="sy-active-info">
                        <div class="sy-active-title">${escSy(active.semester_name)} &nbsp;·&nbsp; AY ${escSy(active.academic_year)}</div>
                        <div class="sy-active-sub">${dateRange(active)}</div>
                    </div>
                   </div>`
                : `<div class="sy-no-active">${icon('warning', { size: 14, className: 'ui-icon-inline' })} No active semester — set one below so offerings and student data resolve correctly.</div>`
            }

            ${Object.entries(grouped).map(([ay, rows]) => `
                <div class="sy-ay-block">
                    <div class="sy-ay-label">AY ${escSy(ay)}</div>
                    ${rows.map(s => `
                    <div class="sy-row" data-sem-id="${s.semester_id}">
                        <span class="sy-row-name ${s.status === 'active' ? 'active-row' : ''}">${escSy(s.semester_name)}</span>
                        <span class="sy-row-date">${dateRange(s)}</span>
                        <span>${statusBadge(s)}</span>
                        <div class="sy-row-actions">
                            <button class="sy-kebab" data-sem-id="${s.semester_id}" aria-label="Actions">⋮</button>
                        </div>
                    </div>`).join('')}
                </div>
            `).join('')}
        `;

        // Kebab menu
        let openDropdown = null;
        const closeDropdown = () => {
            if (openDropdown) {
                openDropdown.dropdown.remove();
                openDropdown.btn.classList.remove('open');
                openDropdown = null;
            }
        };
        document.addEventListener('click', closeDropdown, { capture: true, once: false });

        body.querySelectorAll('.sy-kebab').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                if (openDropdown && openDropdown.btn === btn) { closeDropdown(); return; }
                closeDropdown();

                const semId = btn.dataset.semId;
                const s = semesters.find(x => x.semester_id == semId);
                if (!s) return;

                const dd = document.createElement('div');
                dd.className = 'sy-dropdown';
                dd.innerHTML = `
                    <div class="sy-dd-item" data-action="edit">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        Edit
                    </div>
                    ${s.status !== 'active' ? `
                    <div class="sy-dd-item" data-action="activate">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                        Set Active
                    </div>` : ''}
                    <div class="sy-dd-sep"></div>
                    <div class="sy-dd-item danger ${s.status === 'active' ? 'disabled' : ''}" data-action="delete" title="${s.status === 'active' ? 'Cannot delete active semester' : ''}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                        Delete
                    </div>
                `;

                btn.classList.add('open');
                btn.parentElement.appendChild(dd);
                openDropdown = { btn, dropdown: dd };

                dd.addEventListener('click', async e2 => {
                    e2.stopPropagation();
                    const item = e2.target.closest('[data-action]');
                    if (!item || item.classList.contains('disabled')) return;
                    closeDropdown();

                    if (item.dataset.action === 'edit') {
                        openSemModal(s);
                    } else if (item.dataset.action === 'activate') {
                        const r = await Api.post('/SemesterAPI.php?action=update', {
                            semester_id: parseInt(semId),
                            semester_name: s.semester_name,
                            academic_year: s.academic_year,
                            start_date: s.start_date,
                            end_date: s.end_date,
                            status: 'active'
                        });
                        if (r.success) { showToast(`${s.semester_name} (${s.academic_year}) is now active`, 'success'); loadSchoolYear(); }
                        else showToast(r.message || 'Failed', 'error');
                    } else if (item.dataset.action === 'delete') {
                        if (!confirm(`Delete "${s.semester_name} ${s.academic_year}"?\nThis cannot be undone.`)) return;
                        const r = await Api.post('/SemesterAPI.php?action=delete', { semester_id: parseInt(semId) });
                        if (r.success) { showToast('Semester deleted', 'success'); loadSchoolYear(); }
                        else showToast(r.message || 'Failed', 'error');
                    }
                });
            });
        });
    }

    // ── Add/Edit Semester Modal ──────────────────────────────────────────────

    function openSemModal(sem = null) {
        const isEdit = !!sem;
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:2000;';
        overlay.innerHTML = `
            <div style="background:#fff;border-radius:16px;width:90%;max-width:460px;overflow:hidden;">
                <div style="padding:20px 24px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center;">
                    <h3 style="font-size:17px;font-weight:700;color:#262626;">${isEdit ? 'Edit Semester' : 'Add Semester'}</h3>
                    <button id="sem-close" style="background:none;border:none;font-size:22px;cursor:pointer;color:#737373;">&times;</button>
                </div>
                <div style="padding:24px;">
                    <div id="sem-alert"></div>
                    <div class="fg">
                        <label>Academic Year *</label>
                        <input class="f-input" id="sem-ay" placeholder="e.g. 2025-2026" value="${escSy(sem?.academic_year || '')}">
                        <div class="fg-hint">Format: YYYY-YYYY</div>
                    </div>
                    <div class="fg">
                        <label>Semester *</label>
                        <select class="f-select" id="sem-type">
                            <option value="1" ${sem?.sem_level == 1 ? 'selected' : ''}>1st Semester</option>
                            <option value="2" ${sem?.sem_level == 2 ? 'selected' : ''}>2nd Semester</option>
                            <option value="3" ${sem?.sem_level == 3 ? 'selected' : ''}>Summer</option>
                        </select>
                    </div>
                    ${isEdit ? `
                    <div class="fg">
                        <label>Custom Name</label>
                        <input class="f-input" id="sem-name" value="${escSy(sem?.semester_name || '')}">
                        <div class="fg-hint">Leave as default or customize (e.g. "Midyear")</div>
                    </div>` : ''}
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                        <div class="fg">
                            <label>Start Date</label>
                            <input type="date" class="f-input" id="sem-start" value="${sem?.start_date || ''}">
                        </div>
                        <div class="fg">
                            <label>End Date</label>
                            <input type="date" class="f-input" id="sem-end" value="${sem?.end_date || ''}">
                        </div>
                    </div>
                    <div class="fg">
                        <label>Status</label>
                        <select class="f-select" id="sem-status">
                            <option value="upcoming" ${(sem?.status || 'upcoming') === 'upcoming' ? 'selected' : ''}>Upcoming</option>
                            <option value="active"   ${sem?.status === 'active'   ? 'selected' : ''}>Active</option>
                            <option value="inactive" ${sem?.status === 'inactive' ? 'selected' : ''}>Inactive</option>
                        </select>
                        <div class="fg-hint">Setting as "Active" will mark all other semesters as inactive</div>
                    </div>
                </div>
                <div style="padding:14px 24px;border-top:1px solid #f0f0f0;display:flex;justify-content:flex-end;gap:10px;">
                    <button class="btn-primary" id="sem-cancel" style="background:#f5f5f5;color:#404040;border:1px solid #e0e0e0;box-shadow:none;">Cancel</button>
                    <button class="btn-primary" id="sem-save">${isEdit ? 'Update' : 'Create'} Semester</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        overlay.querySelector('#sem-close').addEventListener('click', () => overlay.remove());
        overlay.querySelector('#sem-cancel').addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

        overlay.querySelector('#sem-save').addEventListener('click', async () => {
            const ay     = overlay.querySelector('#sem-ay').value.trim();
            const lvl    = overlay.querySelector('#sem-type').value;
            const name   = isEdit ? overlay.querySelector('#sem-name').value.trim() : SEM_NAMES[lvl];
            const start  = overlay.querySelector('#sem-start').value || null;
            const end    = overlay.querySelector('#sem-end').value || null;
            const status = overlay.querySelector('#sem-status').value;

            if (!ay) {
                overlay.querySelector('#sem-alert').innerHTML = '<div style="background:#FEE2E2;color:#b91c1c;padding:9px 14px;border-radius:8px;font-size:13px;margin-bottom:12px;">Academic year is required</div>';
                return;
            }

            const payload = { semester_name: name || SEM_NAMES[lvl], academic_year: ay, sem_level: parseInt(lvl), start_date: start, end_date: end, status };
            if (isEdit) payload.semester_id = sem.semester_id;

            const action = isEdit ? 'update' : 'create';
            const r = await Api.post(`/SemesterAPI.php?action=${action}`, payload);

            if (r.success) {
                overlay.remove();
                showToast(isEdit ? 'Semester updated' : 'Semester created', 'success');
                loadSchoolYear();
            } else {
                overlay.querySelector('#sem-alert').innerHTML = `<div style="background:#FEE2E2;color:#b91c1c;padding:9px 14px;border-radius:8px;font-size:13px;margin-bottom:12px;">${escSy(r.message)}</div>`;
            }
        });
    }

    container.querySelector('#btn-add-sem').addEventListener('click', () => openSemModal());
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
