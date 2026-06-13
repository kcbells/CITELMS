/**
 * Dean Reports Page
 * Department performance overview — instructor activity, student performance, enrollment
 */
import { Api } from '../../api.js';
import { icon } from '../../utils/icons.js';

export async function render(container) {
    container.innerHTML = '<div style="display:flex;justify-content:center;padding:60px"><div style="width:40px;height:40px;border:3px solid #e8e8e8;border-top-color:#1B4D3E;border-radius:50%;animation:spin .8s linear infinite"></div></div>';

    const res = await Api.get('/DashboardAPI.php?action=dean');
    const data = res.success ? res.data : {};
    const stats = data.stats || {};
    const dept = data.department || {};
    const faculty = data.faculty || [];
    const programs = data.programs || [];
    const subjectStats = data.subject_stats || [];
    const enrollmentByYear = data.enrollment_by_year || [];
    const programPerf = data.program_performance || [];

    // Computed metrics
    const passRate = (stats.passed + stats.failed) > 0 ? Math.round(stats.passed / (stats.passed + stats.failed) * 100) : 0;
    const activeFaculty = faculty.filter(f => f.subject_count > 0).length;
    const utilizationPct = stats.instructors > 0 ? Math.round(activeFaculty / stats.instructors * 100) : 0;
    const totalEnrolled = enrollmentByYear.reduce((sum, e) => sum + parseInt(e.count || 0), 0);

    container.innerHTML = `
        <style>
            /* ===== Banner ===== */
            .dr-banner {
                background: #00461B;
                border-radius: 16px; padding: 28px 32px;
                display: flex; justify-content: space-between; align-items: center;
                margin-bottom: 24px; flex-wrap: wrap; gap: 16px;
            }
            .dr-banner-left { display: flex; align-items: center; gap: 16px; }
            .dr-banner-icon {
                width: 52px; height: 52px; background: rgba(255,255,255,0.15);
                border-radius: 14px; display: flex; align-items: center; justify-content: center;
                color: #fff; font-size: 24px; flex-shrink: 0;
            }
            .dr-banner h2 { margin: 0; font-size: 22px; font-weight: 800; color: #fff; }
            .dr-banner p { margin: 4px 0 0; font-size: 14px; color: rgba(255,255,255,0.75); }
            .dr-banner-badge {
                background: rgba(255,255,255,0.18); color: #fff; padding: 8px 18px;
                border-radius: 10px; font-size: 13px; font-weight: 700;
                border: 1px solid rgba(255,255,255,0.25);
            }

            /* ===== Stat Cards ===== */
            .dr-stats { display: grid; grid-template-columns: repeat(6, 1fr); gap: 14px; margin-bottom: 24px; }
            .dr-stat {
                background: #fff; border: 1px solid #e8e8e8; border-radius: 14px;
                padding: 18px; position: relative; overflow: hidden;
            }
            .dr-stat::before {
                content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
                background: var(--accent);
            }
            .dr-stat-icon {
                width: 38px; height: 38px; border-radius: 10px;
                display: flex; align-items: center; justify-content: center;
                font-size: 17px; margin-bottom: 10px;
            }
            .dr-stat-val { font-size: 26px; font-weight: 800; color: #1f2937; line-height: 1; }
            .dr-stat-lbl { font-size: 11px; color: #6b7280; font-weight: 600; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.03em; }

            /* ===== Grid Layout ===== */
            .dr-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
            .dr-full { grid-column: 1 / -1; }

            /* ===== Card ===== */
            .dr-card {
                background: #fff; border: 1px solid #e8e8e8; border-radius: 14px; overflow: hidden;
            }
            .dr-card-hd {
                padding: 16px 22px; border-bottom: 1px solid #f0f0f0;
                display: flex; justify-content: space-between; align-items: center;
            }
            .dr-card-hd h3 { margin: 0; font-size: 15px; font-weight: 700; color: #1f2937; display: flex; align-items: center; gap: 8px; }
            .dr-card-cnt { font-size: 12px; color: #6b7280; background: #f3f4f6; padding: 3px 10px; border-radius: 12px; font-weight: 600; }
            .dr-card-bd { padding: 18px 22px; }

            /* ===== Table Header ===== */
            .dr-th {
                font-size: 10px; font-weight: 600; color: #9ca3af; text-transform: uppercase;
                letter-spacing: 0.05em; padding-bottom: 10px; border-bottom: 1px solid #e8e8e8;
                margin-bottom: 6px;
            }

            /* ===== Faculty ===== */
            .dr-fac { display: grid; grid-template-columns: 1fr 70px 70px 70px 70px 70px; align-items: center; gap: 8px; padding: 12px 0; border-bottom: 1px solid #f5f5f5; }
            .dr-fac:last-child { border-bottom: none; }
            .dr-fac-info { display: flex; align-items: center; gap: 10px; }
            .dr-fac-av {
                width: 36px; height: 36px; border-radius: 10px;
                background: #1B4D3E; color: #fff;
                display: flex; align-items: center; justify-content: center;
                font-weight: 700; font-size: 12px; flex-shrink: 0;
            }
            .dr-fac-nm { font-weight: 600; font-size: 13px; color: #1f2937; }
            .dr-fac-id { font-size: 11px; color: #9ca3af; }
            .dr-badge {
                display: inline-flex; align-items: center; justify-content: center;
                padding: 4px 8px; border-radius: 8px; font-size: 12px; font-weight: 700;
            }
            .dr-badge.green { background: #E8F5E9; color: #1B4D3E; }
            .dr-badge.blue { background: #DBEAFE; color: #1E40AF; }
            .dr-badge.amber { background: #FEF3C7; color: #92400E; }
            .dr-badge.purple { background: #EDE9FE; color: #5B21B6; }
            .dr-badge.teal { background: #CCFBF1; color: #0D9488; }

            /* ===== Enrollment Bars ===== */
            .dr-enroll-row { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid #f5f5f5; }
            .dr-enroll-row:last-child { border-bottom: none; }
            .dr-enroll-yr {
                width: 80px; font-size: 13px; font-weight: 600; color: #374151; flex-shrink: 0;
            }
            .dr-enroll-bar-wrap { flex: 1; height: 28px; background: #f3f4f6; border-radius: 8px; overflow: hidden; position: relative; }
            .dr-enroll-bar {
                height: 100%; border-radius: 8px;
                background: #1B4D3E;
                transition: width 0.6s ease; min-width: 2px;
            }
            .dr-enroll-bar-text {
                position: absolute; top: 50%; right: 10px; transform: translateY(-50%);
                font-size: 12px; font-weight: 700; color: #374151;
            }

            /* ===== Program Performance ===== */
            .dr-prog-perf { display: grid; grid-template-columns: 80px 1fr 60px 80px; align-items: center; gap: 10px; padding: 12px 0; border-bottom: 1px solid #f5f5f5; }
            .dr-prog-perf:last-child { border-bottom: none; }
            .dr-prog-code {
                background: #1B4D3E; color: #fff;
                padding: 5px 10px; border-radius: 8px; font-size: 11px; font-weight: 700;
                text-align: center;
            }
            .dr-prog-nm { font-size: 13px; color: #374151; font-weight: 500; }

            /* ===== Subject Performance ===== */
            .dr-subj { display: grid; grid-template-columns: 80px 1fr 60px 60px 110px; align-items: center; gap: 10px; padding: 11px 0; border-bottom: 1px solid #f5f5f5; }
            .dr-subj:last-child { border-bottom: none; }
            .dr-subj-code {
                background: #E8F5E9; color: #1B4D3E; padding: 4px 8px;
                border-radius: 6px; font-size: 11px; font-weight: 700;
                font-family: 'Consolas','Monaco',monospace; text-align: center;
            }
            .dr-subj-nm { font-size: 13px; color: #374151; font-weight: 500; }
            .dr-subj-num { font-size: 13px; color: #6b7280; text-align: center; }

            /* ===== Progress Bar ===== */
            .dr-bar { position: relative; height: 22px; background: #f3f4f6; border-radius: 11px; overflow: hidden; }
            .dr-bar-fill { height: 100%; border-radius: 11px; transition: width 0.5s ease; min-width: 2px; }
            .dr-bar-fill.good { background: #10b981; }
            .dr-bar-fill.mid { background: #f59e0b; }
            .dr-bar-fill.low { background: #ef4444; }
            .dr-bar-text {
                position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
                font-size: 11px; font-weight: 700; color: #374151;
            }

            /* ===== Ring Chart ===== */
            .dr-ring-area { display: flex; align-items: center; gap: 28px; padding: 4px 0; }
            .dr-ring-wrap { position: relative; width: 130px; height: 130px; flex-shrink: 0; }
            .dr-ring-wrap svg { transform: rotate(-90deg); }
            .dr-ring-center {
                position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
                text-align: center;
            }
            .dr-ring-val { font-size: 30px; font-weight: 800; color: #1B4D3E; display: block; line-height: 1; }
            .dr-ring-lbl { font-size: 11px; color: #6b7280; font-weight: 600; }
            .dr-legend { display: flex; flex-direction: column; gap: 10px; }
            .dr-legend-row { display: flex; align-items: center; gap: 10px; }
            .dr-legend-dot { width: 10px; height: 10px; border-radius: 3px; flex-shrink: 0; }
            .dr-legend-txt { font-size: 13px; color: #6b7280; }
            .dr-legend-v { font-size: 15px; font-weight: 700; color: #1f2937; margin-left: auto; }

            /* ===== Summary Table ===== */
            .dr-summary-row { display: flex; justify-content: space-between; align-items: center; padding: 12px 14px; border-radius: 10px; }
            .dr-summary-row:nth-child(odd) { background: #fafbfc; }
            .dr-summary-lbl { font-size: 14px; color: #374151; font-weight: 500; }
            .dr-summary-val { font-size: 17px; font-weight: 800; }

            /* ===== Utilization ===== */
            .dr-util { background: #f3f4f6; height: 10px; border-radius: 5px; overflow: hidden; margin: 6px 0; }
            .dr-util-fill { height: 100%; border-radius: 5px; background: #1B4D3E; }

            /* ===== Empty ===== */
            .dr-empty { text-align: center; padding: 36px 20px; color: #9ca3af; font-size: 14px; }

            /* ===== Responsive ===== */
            @media(max-width:1200px) { .dr-stats { grid-template-columns: repeat(3, 1fr); } }
            @media(max-width:900px) {
                .dr-grid { grid-template-columns: 1fr; }
                .dr-stats { grid-template-columns: repeat(2, 1fr); }
                .dr-fac { grid-template-columns: 1fr; gap: 6px; }
                .dr-subj { grid-template-columns: 1fr; gap: 6px; }
            }
            @media(max-width:600px) { .dr-stats { grid-template-columns: 1fr; } }
        </style>

        <!-- Banner -->
        <div class="dr-banner">
            <div class="dr-banner-left">
                <div class="dr-banner-icon">
                    <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"/></svg>
                </div>
                <div>
                    <h2>Department Reports</h2>
                    <p>${esc(dept.department_name || 'Department')} — Performance Overview</p>
                </div>
            </div>
            <div class="dr-banner-badge">${esc(dept.department_code || 'DEPT')}</div>
        </div>

        <!-- Department Overview Stats -->
        <div class="dr-stats">
            ${statCard('#1B4D3E', '#E8F5E9', '#1B4D3E', stats.instructors, 'Instructors', icon('instructor', { size: 18 }))}
            ${statCard('#2563EB', '#DBEAFE', '#1E40AF', stats.students, 'Enrolled Students', icon('users', { size: 18 }))}
            ${statCard('#7C3AED', '#EDE9FE', '#5B21B6', stats.subjects, 'Subjects', icon('book', { size: 18 }))}
            ${statCard('#0D9488', '#CCFBF1', '#0D9488', stats.offerings, 'Active Offerings', icon('calendar', { size: 18 }))}
            ${statCard('#B45309', '#FEF3C7', '#92400E', stats.total_quizzes, 'Total Quizzes', icon('quiz', { size: 18 }))}
            ${statCard('#059669', '#D1FAE5', '#065F46', stats.published_lessons + ' / ' + stats.total_lessons, 'Lessons (Pub)', icon('lessons', { size: 18 }))}
        </div>

        <div class="dr-grid">

            <!-- ====== SECTION 1: Faculty Workload & Activity ====== -->
            <div class="dr-card dr-full">
                <div class="dr-card-hd">
                    <h3>
                        <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"/></svg>
                        Faculty Workload & Activity
                    </h3>
                    <span class="dr-card-cnt">${faculty.length} instructors</span>
                </div>
                <div class="dr-card-bd">
                    ${faculty.length === 0 ? '<div class="dr-empty">No instructors assigned to this department</div>' :
                    `<div class="dr-fac dr-th" style="border-bottom:1px solid #e8e8e8;padding-bottom:10px">
                        <span>Instructor</span>
                        <span style="text-align:center">Subjects</span>
                        <span style="text-align:center">Sections</span>
                        <span style="text-align:center">Students</span>
                        <span style="text-align:center">Quizzes</span>
                        <span style="text-align:center">Lessons</span>
                    </div>` +
                    faculty.map(f => {
                        const init = ((f.first_name||'?')[0] + (f.last_name||'?')[0]).toUpperCase();
                        return `
                        <div class="dr-fac">
                            <div class="dr-fac-info">
                                <div class="dr-fac-av">${init}</div>
                                <div>
                                    <div class="dr-fac-nm">${esc(f.first_name)} ${esc(f.last_name)}</div>
                                    <div class="dr-fac-id">${esc(f.employee_id || 'No ID')}</div>
                                </div>
                            </div>
                            <span class="dr-badge green" style="justify-self:center">${f.subject_count}</span>
                            <span class="dr-badge blue" style="justify-self:center">${f.section_count}</span>
                            <span class="dr-badge amber" style="justify-self:center">${f.student_count || 0}</span>
                            <span class="dr-badge purple" style="justify-self:center">${f.quiz_count || 0}</span>
                            <span class="dr-badge teal" style="justify-self:center">${f.lesson_count || 0}</span>
                        </div>`;
                    }).join('')}
                </div>
            </div>

            <!-- ====== SECTION 2: Program Enrollment ====== -->
            <div class="dr-card">
                <div class="dr-card-hd">
                    <h3>
                        <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342"/></svg>
                        Program Enrollment
                    </h3>
                    <span class="dr-card-cnt">${programs.length} programs</span>
                </div>
                <div class="dr-card-bd">
                    ${programs.length === 0 ? '<div class="dr-empty">No programs found</div>' :
                    programs.map(p => `
                        <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid #f5f5f5">
                            <div style="display:flex;align-items:center;gap:12px">
                                <span class="dr-prog-code">${esc(p.program_code)}</span>
                                <span class="dr-prog-nm">${esc(p.program_name)}</span>
                            </div>
                            <div style="display:flex;gap:16px;text-align:center">
                                <div>
                                    <div style="font-size:18px;font-weight:700;color:#1B4D3E">${p.student_count || 0}</div>
                                    <div style="font-size:10px;color:#9ca3af;text-transform:uppercase">Students</div>
                                </div>
                                <div>
                                    <div style="font-size:18px;font-weight:700;color:#7C3AED">${p.subject_count || 0}</div>
                                    <div style="font-size:10px;color:#9ca3af;text-transform:uppercase">Subjects</div>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>

            <!-- ====== SECTION 3: Enrollment by Year Level ====== -->
            <div class="dr-card">
                <div class="dr-card-hd">
                    <h3>
                        <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 4.5h14.25M3 9h9.75M3 13.5h5.25m5.25-.75L17.25 9m0 0L21 12.75M17.25 9v12"/></svg>
                        Enrollment by Year Level
                    </h3>
                    <span class="dr-card-cnt">${totalEnrolled} total</span>
                </div>
                <div class="dr-card-bd">
                    ${enrollmentByYear.length === 0 ? '<div class="dr-empty">No enrollment data</div>' :
                    enrollmentByYear.map(e => {
                        const pct = totalEnrolled > 0 ? Math.round(parseInt(e.count) / totalEnrolled * 100) : 0;
                        const yearLabels = {1:'1st Year', 2:'2nd Year', 3:'3rd Year', 4:'4th Year'};
                        return `
                        <div class="dr-enroll-row">
                            <span class="dr-enroll-yr">${yearLabels[e.year_level] || 'Year ' + e.year_level}</span>
                            <div class="dr-enroll-bar-wrap">
                                <div class="dr-enroll-bar" style="width:${Math.max(5, pct)}%"></div>
                                <span class="dr-enroll-bar-text">${e.count} students (${pct}%)</span>
                            </div>
                        </div>`;
                    }).join('')}
                </div>
            </div>

            <!-- ====== SECTION 4: Overall Quiz Performance ====== -->
            <div class="dr-card">
                <div class="dr-card-hd">
                    <h3>
                        <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z"/><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0013.5 3v7.5z"/></svg>
                        Overall Quiz Performance
                    </h3>
                </div>
                <div class="dr-card-bd">
                    ${stats.total_attempts === 0 ?
                    '<div class="dr-empty">No quiz attempts recorded yet</div>' :
                    `<div class="dr-ring-area">
                        <div class="dr-ring-wrap">
                            <svg width="130" height="130" viewBox="0 0 130 130">
                                <circle cx="65" cy="65" r="52" fill="none" stroke="#f3f4f6" stroke-width="11"/>
                                <circle cx="65" cy="65" r="52" fill="none" stroke="#1B4D3E" stroke-width="11"
                                    stroke-dasharray="${Math.PI * 104}" stroke-dashoffset="${Math.PI * 104 * (1 - passRate / 100)}"
                                    stroke-linecap="round"/>
                            </svg>
                            <div class="dr-ring-center">
                                <span class="dr-ring-val">${passRate}%</span>
                                <span class="dr-ring-lbl">Pass Rate</span>
                            </div>
                        </div>
                        <div class="dr-legend">
                            <div class="dr-legend-row">
                                <div class="dr-legend-dot" style="background:#1B4D3E"></div>
                                <span class="dr-legend-txt">Passed</span>
                                <span class="dr-legend-v">${stats.passed}</span>
                            </div>
                            <div class="dr-legend-row">
                                <div class="dr-legend-dot" style="background:#ef4444"></div>
                                <span class="dr-legend-txt">Failed</span>
                                <span class="dr-legend-v">${stats.failed}</span>
                            </div>
                            <div class="dr-legend-row">
                                <div class="dr-legend-dot" style="background:#f59e0b"></div>
                                <span class="dr-legend-txt">Avg Score</span>
                                <span class="dr-legend-v">${stats.avg_score}%</span>
                            </div>
                            <div class="dr-legend-row">
                                <div class="dr-legend-dot" style="background:#6366f1"></div>
                                <span class="dr-legend-txt">Total Attempts</span>
                                <span class="dr-legend-v">${stats.total_attempts}</span>
                            </div>
                        </div>
                    </div>`}
                </div>
            </div>

            <!-- ====== SECTION 5: Program Performance Comparison ====== -->
            <div class="dr-card">
                <div class="dr-card-hd">
                    <h3>
                        <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"/></svg>
                        Program Performance
                    </h3>
                </div>
                <div class="dr-card-bd">
                    ${programPerf.length === 0 ? '<div class="dr-empty">No performance data</div>' :
                    `<div class="dr-prog-perf dr-th" style="border-bottom:1px solid #e8e8e8;padding-bottom:10px">
                        <span>Program</span>
                        <span>Name</span>
                        <span style="text-align:center">Attempts</span>
                        <span style="text-align:center">Avg Score</span>
                    </div>` +
                    programPerf.map(p => {
                        const avg = p.avg_score ? Math.round(parseFloat(p.avg_score)) : null;
                        const barClass = avg === null ? '' : avg >= 75 ? 'good' : avg >= 50 ? 'mid' : 'low';
                        return `
                        <div class="dr-prog-perf">
                            <span class="dr-prog-code">${esc(p.program_code)}</span>
                            <span class="dr-prog-nm">${esc(p.program_name)}</span>
                            <span class="dr-subj-num">${p.attempts || 0}</span>
                            <div class="dr-bar">
                                ${avg !== null ? `<div class="dr-bar-fill ${barClass}" style="width:${Math.max(5, avg)}%"></div><span class="dr-bar-text">${avg}%</span>` :
                                '<span class="dr-bar-text" style="color:#d1d5db">—</span>'}
                            </div>
                        </div>`;
                    }).join('')}
                </div>
            </div>

            <!-- ====== SECTION 6: Subject Performance ====== -->
            <div class="dr-card dr-full">
                <div class="dr-card-hd">
                    <h3>
                        <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"/></svg>
                        Subject Performance
                    </h3>
                    <span class="dr-card-cnt">${subjectStats.length} subjects</span>
                </div>
                <div class="dr-card-bd">
                    ${subjectStats.length === 0 ? '<div class="dr-empty">No subject performance data available</div>' :
                    `<div class="dr-subj dr-th" style="border-bottom:1px solid #e8e8e8;padding-bottom:10px">
                        <span>Code</span>
                        <span>Subject</span>
                        <span style="text-align:center">Students</span>
                        <span style="text-align:center">Attempts</span>
                        <span style="text-align:center">Avg Score</span>
                    </div>` +
                    subjectStats.map(s => {
                        const score = s.avg_score ? Math.round(parseFloat(s.avg_score)) : null;
                        const barClass = score === null ? '' : score >= 75 ? 'good' : score >= 50 ? 'mid' : 'low';
                        return `
                        <div class="dr-subj">
                            <span class="dr-subj-code">${esc(s.subject_code)}</span>
                            <span class="dr-subj-nm">${esc(s.subject_name)}</span>
                            <span class="dr-subj-num">${s.student_count || 0}</span>
                            <span class="dr-subj-num">${s.attempts || 0}</span>
                            <div class="dr-bar">
                                ${score !== null ? `<div class="dr-bar-fill ${barClass}" style="width:${Math.max(5, score)}%"></div><span class="dr-bar-text">${score}%</span>` :
                                '<span class="dr-bar-text" style="color:#d1d5db">No data</span>'}
                            </div>
                        </div>`;
                    }).join('')}
                </div>
            </div>

            <!-- ====== SECTION 7: Department Summary & Key Metrics ====== -->
            <div class="dr-card">
                <div class="dr-card-hd">
                    <h3>
                        <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21"/></svg>
                        Department Summary
                    </h3>
                </div>
                <div class="dr-card-bd">
                    <div style="display:flex;flex-direction:column;gap:2px">
                        <div class="dr-summary-row">
                            <span class="dr-summary-lbl">Department</span>
                            <span class="dr-summary-val" style="color:#1f2937">${esc(dept.department_name || '—')}</span>
                        </div>
                        <div class="dr-summary-row">
                            <span class="dr-summary-lbl">Programs Offered</span>
                            <span class="dr-summary-val" style="color:#7C3AED">${programs.length}</span>
                        </div>
                        <div class="dr-summary-row">
                            <span class="dr-summary-lbl">Active Sections</span>
                            <span class="dr-summary-val" style="color:#0D9488">${stats.sections}</span>
                        </div>
                        <div class="dr-summary-row">
                            <span class="dr-summary-lbl">Lesson Content</span>
                            <span class="dr-summary-val" style="color:#059669">${stats.published_lessons} published / ${stats.total_lessons} total</span>
                        </div>
                        <div class="dr-summary-row">
                            <span class="dr-summary-lbl">Instructor Utilization</span>
                            <span style="text-align:right">
                                <span class="dr-summary-val" style="color:#1B4D3E">${utilizationPct}%</span>
                                <div class="dr-util"><div class="dr-util-fill" style="width:${utilizationPct}%"></div></div>
                                <span style="font-size:11px;color:#9ca3af">${activeFaculty} of ${stats.instructors} with active assignments</span>
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- ====== SECTION 8: Key Performance Indicators ====== -->
            <div class="dr-card">
                <div class="dr-card-hd">
                    <h3>
                        <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                        Key Performance Indicators
                    </h3>
                </div>
                <div class="dr-card-bd">
                    <div style="display:flex;flex-direction:column;gap:2px">
                        <div class="dr-summary-row">
                            <span class="dr-summary-lbl">Avg Quiz Score</span>
                            <span class="dr-summary-val" style="color:${stats.avg_score >= 75 ? '#059669' : stats.avg_score >= 50 ? '#B45309' : '#dc2626'}">${stats.avg_score}%</span>
                        </div>
                        <div class="dr-summary-row">
                            <span class="dr-summary-lbl">Pass Rate</span>
                            <span class="dr-summary-val" style="color:${passRate >= 75 ? '#059669' : passRate >= 50 ? '#B45309' : '#dc2626'}">${passRate}%</span>
                        </div>
                        <div class="dr-summary-row">
                            <span class="dr-summary-lbl">Total Quiz Attempts</span>
                            <span class="dr-summary-val" style="color:#1E40AF">${stats.total_attempts}</span>
                        </div>
                        <div class="dr-summary-row">
                            <span class="dr-summary-lbl">Student-Instructor Ratio</span>
                            <span class="dr-summary-val" style="color:#7C3AED">${stats.instructors > 0 ? Math.round(stats.students / stats.instructors) + ':1' : 'N/A'}</span>
                        </div>
                        <div class="dr-summary-row">
                            <span class="dr-summary-lbl">Content Coverage</span>
                            <span class="dr-summary-val" style="color:#0D9488">${stats.total_lessons > 0 ? Math.round(stats.published_lessons / stats.total_lessons * 100) : 0}%</span>
                        </div>
                    </div>
                </div>
            </div>

        </div>
    `;
}

function statCard(accent, bgColor, textColor, value, label, icon) {
    return `
    <div class="dr-stat" style="--accent:${accent}">
        <div class="dr-stat-icon" style="background:${bgColor};color:${textColor}">${icon}</div>
        <div class="dr-stat-val">${value ?? 0}</div>
        <div class="dr-stat-lbl">${label}</div>
    </div>`;
}

function esc(str) { const d = document.createElement('div'); d.textContent = str || ''; return d.innerHTML; }
