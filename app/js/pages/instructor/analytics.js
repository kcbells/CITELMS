/**
 * Instructor Analytics Page
 * Teaching performance metrics and student progress overview
 */
import { Api } from '../../api.js';

export async function render(container) {
    const [dashRes, subjRes] = await Promise.all([
        Api.get('/DashboardAPI.php?action=instructor'),
        Api.get('/LessonsAPI.php?action=subjects')
    ]);
    const data = dashRes.success ? dashRes.data : {};
    const stats = data.stats || {};
    const classes = data.classes || [];
    const subjects = subjRes.success ? subjRes.data : [];

    // Fetch quiz data per subject for analytics
    const quizPromises = subjects.map(s =>
        Api.get('/QuizzesAPI.php?action=instructor-list&subject_id=' + s.subject_id)
            .then(r => ({ subject: s, quizzes: r.success ? r.data : [] }))
            .catch(() => ({ subject: s, quizzes: [] }))
    );
    const subjectQuizzes = await Promise.all(quizPromises);

    // Compute analytics
    let totalQuestions = 0, totalAttempts = 0, totalAvgScore = 0, quizzesWithScores = 0;
    let publishedLessons = 0, draftLessons = 0, publishedQuizzes = 0, draftQuizzes = 0;
    const subjectAnalytics = [];

    subjectQuizzes.forEach(sq => {
        let subjAttempts = 0, subjAvg = 0, subjQuizCount = 0;
        sq.quizzes.forEach(q => {
            totalQuestions += parseInt(q.question_count || 0);
            const attempts = parseInt(q.attempt_count || 0);
            totalAttempts += attempts;
            if (q.status === 'published') publishedQuizzes++;
            else draftQuizzes++;
            if (q.avg_score && attempts > 0) {
                subjAvg += parseFloat(q.avg_score);
                subjQuizCount++;
                totalAvgScore += parseFloat(q.avg_score);
                quizzesWithScores++;
            }
            subjAttempts += attempts;
        });
        subjectAnalytics.push({
            code: sq.subject.subject_code,
            name: sq.subject.subject_name,
            quizCount: sq.quizzes.length,
            attemptCount: subjAttempts,
            avgScore: subjQuizCount > 0 ? (subjAvg / subjQuizCount).toFixed(1) : '—'
        });
    });

    classes.forEach(c => {
        publishedLessons += parseInt(c.published_lessons || 0);
        draftLessons += (parseInt(c.total_lessons || 0) - parseInt(c.published_lessons || 0));
    });

    const overallAvg = quizzesWithScores > 0 ? (totalAvgScore / quizzesWithScores).toFixed(1) : '—';

    // Chart data — content donut
    const totalPub   = publishedLessons + publishedQuizzes;
    const totalDraft = draftLessons + draftQuizzes;
    const totalContent = totalPub + totalDraft;
    const circ   = 282.74;
    const pubArc   = totalContent > 0 ? (totalPub / totalContent) * circ : 0;
    const draftArc = totalContent > 0 ? (totalDraft / totalContent) * circ : 0;

    // SVG column chart — attempts per subject
    const maxAtt = Math.max(...subjectAnalytics.map(s => s.attemptCount), 1);
    const barW = 52, barGap = 24, chartH = 150, padL = 32, padB = 50;
    const svgW = padL + subjectAnalytics.length * (barW + barGap);
    const colBars = subjectAnalytics.map((sa, i) => {
        const bh = maxAtt > 0 ? Math.max((sa.attemptCount / maxAtt) * chartH, sa.attemptCount > 0 ? 6 : 0) : 0;
        const x  = padL + i * (barW + barGap);
        const y  = chartH - bh;
        const gradId = `cg${i}`;
        return { sa, x, y, bh, gradId };
    });

    container.innerHTML = `
        <style>
            .an-banner { background:#00461B; border-radius:16px; padding:28px 32px; margin-bottom:24px; }
            .an-banner::before { content:''; position:absolute; top:-40px; right:-40px; width:180px; height:180px; border-radius:50%; background:rgba(255,255,255,.07); pointer-events:none; }
            .an-banner::after { content:''; position:absolute; bottom:-60px; left:60px; width:220px; height:220px; border-radius:50%; background:rgba(255,255,255,.05); pointer-events:none; }
            .an-banner-inner { display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap; position:relative; z-index:1; }
            .an-banner-title { font-size:26px; font-weight:800; color:#fff; margin:0 0 4px; }
            .an-banner-sub { font-size:14px; color:rgba(255,255,255,.75); margin:0; }
            .an-back-btn { display:inline-flex; align-items:center; gap:6px; padding:9px 16px; background:rgba(255,255,255,.15); color:#fff; border:1px solid rgba(255,255,255,.25); border-radius:10px; font-size:13px; font-weight:600; text-decoration:none; transition:all .15s; }
            .an-back-btn:hover { background:rgba(255,255,255,.25); }

            /* Stat cards */
            .analytics-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(148px,1fr)); gap:14px; margin-bottom:24px; }
            .an-card { background:#fff; border:1px solid #f1f5f9; border-radius:14px; padding:20px 16px; text-align:center; box-shadow:0 1px 3px rgba(0,0,0,.07); transition:all .2s; }
            .an-card:hover { box-shadow:0 6px 18px rgba(0,0,0,.1); transform:translateY(-2px); }
            .an-icon { width:42px; height:42px; border-radius:12px; display:flex; align-items:center; justify-content:center; margin:0 auto 12px; }
            .an-num { font-size:28px; font-weight:800; line-height:1; }
            .an-label { font-size:11px; color:#9ca3af; margin-top:5px; text-transform:uppercase; letter-spacing:.4px; }

            /* Charts layout */
            .an-charts-top { display:grid; grid-template-columns:210px 1fr 210px; gap:16px; margin-bottom:20px; }
            .chart-card { background:#fff; border:1px solid #f1f5f9; border-radius:14px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,.07); }
            .chart-card.full { grid-column:1/-1; }
            .chart-header { padding:14px 20px; background:#fafbfc; border-bottom:1px solid #f1f5f9; display:flex; align-items:center; justify-content:space-between; }
            .chart-title { font-weight:700; font-size:14px; color:#111827; }
            .chart-sub { font-size:11px; color:#9ca3af; }
            .chart-body { padding:20px; }

            /* Horizontal bars */
            .bar-row { display:flex; align-items:center; gap:10px; margin-bottom:12px; }
            .bar-row:last-child { margin-bottom:0; }
            .bar-label { min-width:58px; font-size:12px; font-weight:700; color:#374151; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
            .bar-track { flex:1; background:#e2e8f0; height:10px; border-radius:5px; overflow:hidden; }
            .bar-fill { height:100%; border-radius:5px; transition:width .65s cubic-bezier(.4,0,.2,1); }
            .bar-fill.green { background:#1B4D3E; }
            .bar-fill.yellow { background:#B45309; }
            .bar-fill.red { background:#b91c1c; }
            .bar-fill.slate { background:#94a3b8; }
            .bar-value { min-width:38px; text-align:right; font-size:12px; font-weight:700; color:#111827; }

            /* Stat pairs */
            .stat-pair { display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid #f8fafc; }
            .stat-pair:last-child { border-bottom:none; }
            .sp-left { display:flex; align-items:center; gap:8px; font-size:13px; color:#374151; }
            .sp-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
            .sp-value { font-size:13px; font-weight:700; color:#111827; }

            /* SVG column chart */
            .col-chart-wrap { overflow-x:auto; padding:4px 0 0; }

            /* Subject breakdown */
            .data-table { width:100%; border-collapse:collapse; border-radius:10px; overflow:hidden; border:2px solid #1B4D3E; }
            .data-table th { text-align:left; padding:10px 14px; font-size:12px; font-weight:700; color:#404040; background:#f7f7f7; border-bottom:1px solid #ccc; }
            .data-table td { padding:10px 14px; border-bottom:1px solid #f0f0f0; font-size:13px; vertical-align:middle; }
            .data-table tr:last-child td { border-bottom:none; }
            .data-table tr:hover td { background:#f9fffe; }
            .subj-tag { background:#E8F5E9; color:#1B4D3E; padding:3px 8px; border-radius:6px; font-family:monospace; font-size:12px; font-weight:700; }
            .mini-bar { height:5px; border-radius:3px; background:#e2e8f0; overflow:hidden; width:72px; margin-top:3px; }
            .mini-fill { height:100%; border-radius:3px; }

            .empty-text { text-align:center; padding:28px; color:#9ca3af; font-size:13px; }
            @media(max-width:960px) { .an-charts-top { grid-template-columns:1fr 1fr; } }
            @media(max-width:600px) { .an-charts-top { grid-template-columns:1fr; } .analytics-grid { grid-template-columns:1fr 1fr; } }
        </style>

        <div class="an-banner">
            <div class="an-banner-inner">
                <div>
                    <h2 class="an-banner-title">Analytics</h2>
                    <p class="an-banner-sub">Teaching performance and student engagement overview</p>
                </div>
                <a href="#instructor/gradebook" class="an-back-btn">
                    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>
                    Gradebook
                </a>
            </div>
        </div>

        <!-- Stat Cards -->
        <div class="analytics-grid">
            <div class="an-card">
                <div class="an-icon" style="background:#e8f5e9;color:#1B4D3E;">
                    <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"/></svg>
                </div>
                <div class="an-num" style="color:#1B4D3E;">${stats.classes||0}</div>
                <div class="an-label">Classes</div>
            </div>
            <div class="an-card">
                <div class="an-icon" style="background:#dbeafe;color:#1e40af;">
                    <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"/></svg>
                </div>
                <div class="an-num" style="color:#1e40af;">${stats.students||0}</div>
                <div class="an-label">Students</div>
            </div>
            <div class="an-card">
                <div class="an-icon" style="background:#e8f5e9;color:#16a34a;">
                    <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25"/></svg>
                </div>
                <div class="an-num" style="color:#16a34a;">${publishedLessons}</div>
                <div class="an-label">Pub. Lessons</div>
            </div>
            <div class="an-card">
                <div class="an-icon" style="background:#ede9fe;color:#6D28D9;">
                    <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c.98 0 1.813.626 2.122 1.5"/></svg>
                </div>
                <div class="an-num" style="color:#6D28D9;">${publishedQuizzes}</div>
                <div class="an-label">Pub. Quizzes</div>
            </div>
            <div class="an-card">
                <div class="an-icon" style="background:#fef3c7;color:#B45309;">
                    <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"/></svg>
                </div>
                <div class="an-num" style="color:#B45309;">${totalQuestions}</div>
                <div class="an-label">Questions</div>
            </div>
            <div class="an-card">
                <div class="an-icon" style="background:#fee2e2;color:#b91c1c;">
                    <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"/></svg>
                </div>
                <div class="an-num" style="color:#b91c1c;">${totalAttempts}</div>
                <div class="an-label">Attempts</div>
            </div>
            <div class="an-card">
                <div class="an-icon" style="background:#e8f5e9;color:#1B4D3E;">
                    <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"/></svg>
                </div>
                <div class="an-num" style="color:#1B4D3E;">${overallAvg}${overallAvg !== '—' ? '%' : ''}</div>
                <div class="an-label">Avg Score</div>
            </div>
        </div>

        <!-- Top Charts Row: Donut | Bar Chart | Content Breakdown -->
        <div class="an-charts-top">

            <!-- Content Status Donut -->
            <div class="chart-card">
                <div class="chart-header">
                    <span class="chart-title">Content Status</span>
                </div>
                <div class="chart-body" style="display:flex;flex-direction:column;align-items:center;gap:16px;">
                    <svg width="140" height="140" viewBox="0 0 120 120">
                        <circle cx="60" cy="60" r="45" fill="none" stroke="#f1f5f9" stroke-width="16"/>
                        <circle cx="60" cy="60" r="45" fill="none" stroke="#fde68a" stroke-width="16"
                            stroke-dasharray="${draftArc.toFixed(2)} ${circ}" stroke-dashoffset="${(-pubArc).toFixed(2)}"
                            transform="rotate(-90 60 60)"/>
                        <circle cx="60" cy="60" r="45" fill="none" stroke="#1B4D3E" stroke-width="16"
                            stroke-dasharray="${pubArc.toFixed(2)} ${circ}"
                            transform="rotate(-90 60 60)"/>
                        <text x="60" y="55" text-anchor="middle" font-size="20" font-weight="800" fill="#111827">${totalContent}</text>
                        <text x="60" y="70" text-anchor="middle" font-size="9" fill="#9ca3af">Total Items</text>
                    </svg>
                    <div style="width:100%;">
                        <div class="stat-pair">
                            <span class="sp-left"><span class="sp-dot" style="background:#1B4D3E;"></span>Published</span>
                            <span class="sp-value" style="color:#1B4D3E;">${totalPub}</span>
                        </div>
                        <div class="stat-pair">
                            <span class="sp-left"><span class="sp-dot" style="background:#fde68a;border:1px solid #f59e0b;"></span>Draft</span>
                            <span class="sp-value" style="color:#B45309;">${totalDraft}</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Subject Performance Bars -->
            <div class="chart-card">
                <div class="chart-header">
                    <span class="chart-title">Subject Performance</span>
                    <span class="chart-sub">avg quiz score</span>
                </div>
                <div class="chart-body">
                    ${subjectAnalytics.length === 0 ? '<div class="empty-text">No subjects assigned</div>' :
                      subjectAnalytics.map(sa => {
                        const pct = sa.avgScore !== '—' ? parseFloat(sa.avgScore) : 0;
                        const cls = sa.avgScore === '—' ? 'slate' : pct >= 75 ? 'green' : pct >= 50 ? 'yellow' : 'red';
                        return `<div class="bar-row">
                            <div class="bar-label" title="${esc(sa.name)}">${esc(sa.code)}</div>
                            <div class="bar-track"><div class="bar-fill ${cls}" style="width:${pct}%"></div></div>
                            <div class="bar-value">${sa.avgScore}${sa.avgScore !== '—' ? '%' : ''}</div>
                        </div>`;
                      }).join('')}
                </div>
            </div>

            <!-- Content Breakdown -->
            <div class="chart-card">
                <div class="chart-header">
                    <span class="chart-title">Content Breakdown</span>
                </div>
                <div class="chart-body">
                    <div class="stat-pair">
                        <span class="sp-left"><span class="sp-dot" style="background:#16a34a;"></span>Pub. Lessons</span>
                        <span class="sp-value">${publishedLessons}</span>
                    </div>
                    <div class="stat-pair">
                        <span class="sp-left"><span class="sp-dot" style="background:#fde68a;border:1px solid #f59e0b;"></span>Draft Lessons</span>
                        <span class="sp-value">${draftLessons}</span>
                    </div>
                    <div class="stat-pair">
                        <span class="sp-left"><span class="sp-dot" style="background:#6D28D9;"></span>Pub. Quizzes</span>
                        <span class="sp-value">${publishedQuizzes}</span>
                    </div>
                    <div class="stat-pair">
                        <span class="sp-left"><span class="sp-dot" style="background:#c4b5fd;"></span>Draft Quizzes</span>
                        <span class="sp-value">${draftQuizzes}</span>
                    </div>
                    <div class="stat-pair">
                        <span class="sp-left"><span class="sp-dot" style="background:#94a3b8;"></span>Questions</span>
                        <span class="sp-value">${totalQuestions}</span>
                    </div>
                    <div class="stat-pair">
                        <span class="sp-left"><span class="sp-dot" style="background:#b91c1c;"></span>Attempts</span>
                        <span class="sp-value">${totalAttempts}</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- SVG Column Chart: Quiz Attempts per Subject -->
        ${subjectAnalytics.length > 0 ? `
        <div class="chart-card full" style="margin-bottom:20px;">
            <div class="chart-header">
                <span class="chart-title">Quiz Attempts per Subject</span>
                <span class="chart-sub">total student attempts</span>
            </div>
            <div class="chart-body">
                <div class="col-chart-wrap">
                    <svg width="${Math.max(svgW, 400)}" height="${chartH + padB + 10}" viewBox="0 0 ${Math.max(svgW, 400)} ${chartH + padB + 10}" style="display:block;">
                        <defs>
                            ${colBars.map(b => `
                            <linearGradient id="${b.gradId}" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stop-color="#40916C"/>
                                <stop offset="100%" stop-color="#1B4D3E"/>
                            </linearGradient>`).join('')}
                        </defs>
                        <!-- Y-axis grid lines -->
                        ${[0.25, 0.5, 0.75, 1].map(f => {
                            const y = chartH - f * chartH;
                            const val = Math.round(f * maxAtt);
                            return `<line x1="${padL - 8}" y1="${y}" x2="${Math.max(svgW, 400) - 8}" y2="${y}" stroke="#f1f5f9" stroke-width="1"/>
                                    <text x="${padL - 10}" y="${y + 4}" text-anchor="end" font-size="9" fill="#9ca3af">${val}</text>`;
                        }).join('')}
                        <!-- Baseline -->
                        <line x1="${padL - 8}" y1="${chartH}" x2="${Math.max(svgW, 400) - 8}" y2="${chartH}" stroke="#e2e8f0" stroke-width="1.5"/>
                        <!-- Bars -->
                        ${colBars.map(b => `
                            <rect x="${b.x}" y="${b.y}" width="${barW}" height="${b.bh}" rx="7" fill="url(#${b.gradId})" opacity=".92"/>
                            ${b.sa.attemptCount > 0 ? `<text x="${b.x + barW/2}" y="${b.y - 6}" text-anchor="middle" font-size="11" font-weight="700" fill="#374151">${b.sa.attemptCount}</text>` : ''}
                            <text x="${b.x + barW/2}" y="${chartH + 18}" text-anchor="middle" font-size="11" font-weight="700" fill="#374151">${esc(b.sa.code)}</text>
                            <text x="${b.x + barW/2}" y="${chartH + 32}" text-anchor="middle" font-size="9" fill="#9ca3af">${esc(b.sa.name.length > 14 ? b.sa.name.substring(0,14)+'…' : b.sa.name)}</text>
                        `).join('')}
                    </svg>
                </div>
            </div>
        </div>
        ` : ''}

        <!-- Subject Breakdown Table -->
        <div class="chart-card full">
            <div class="chart-header">
                <span class="chart-title">Subject Breakdown</span>
                <span class="chart-sub">${subjectAnalytics.length} subject${subjectAnalytics.length !== 1 ? 's' : ''}</span>
            </div>
            <div class="chart-body" style="padding:0;">
                ${subjectAnalytics.length === 0 ? '<div class="empty-text">No data available</div>' : `
                <table class="data-table">
                    <thead><tr>
                        <th>Subject</th><th>Quizzes</th><th>Attempts</th><th>Avg Score</th><th>Students</th>
                    </tr></thead>
                    <tbody>
                        ${subjectAnalytics.map(sa => {
                            const cls_ = classes.find(c => c.subject_code === sa.code);
                            const pct = sa.avgScore !== '—' ? parseFloat(sa.avgScore) : 0;
                            const fillColor = sa.avgScore === '—' ? '#e2e8f0' : pct >= 75 ? '#1B4D3E' : pct >= 50 ? '#B45309' : '#b91c1c';
                            return `<tr>
                                <td>
                                    <span class="subj-tag">${esc(sa.code)}</span>
                                    <span style="color:#9ca3af;font-size:12px;margin-left:4px;">${esc(sa.name)}</span>
                                </td>
                                <td><strong>${sa.quizCount}</strong></td>
                                <td><strong>${sa.attemptCount}</strong></td>
                                <td>
                                    <div style="display:flex;align-items:center;gap:8px;">
                                        <div class="mini-bar"><div class="mini-fill" style="width:${pct}%;background:${fillColor};"></div></div>
                                        <strong>${sa.avgScore}${sa.avgScore !== '—' ? '%' : ''}</strong>
                                    </div>
                                </td>
                                <td><strong>${cls_ ? cls_.student_count : '—'}</strong></td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>`}
            </div>
        </div>
    `;
}

function esc(str) { const d = document.createElement('div'); d.textContent = str||''; return d.innerHTML; }
