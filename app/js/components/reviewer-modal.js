/**
 * Exam Reviewer — student picks modules, the system builds a study reviewer
 * from that subject's published Teaching Guide / SAS documents.
 *
 * Added from student survey feedback: "The system should provide a summarized
 * reviewer to help students prepare for exams."
 *
 * Talks to ReviewerAPI.php, which enforces enrolment and only ever reads
 * PUBLISHED documents — this component never decides access on its own.
 */
import { Api } from '../api.js';
import { icon } from '../utils/icons.js';
import { notify } from '../utils/notify.js';
import { esc } from '../utils/classroom-ui.js';

const STYLES = `
    .rv-overlay { position:fixed; inset:0; background:rgba(15,23,20,.55); z-index:2700;
        display:flex; align-items:center; justify-content:center; padding:20px; animation:rvIn .18s ease; }
    @keyframes rvIn { from { opacity:0; } to { opacity:1; } }
    .rv-modal { background:#fff; border-radius:18px; width:100%; max-width:720px;
        height:min(90vh,880px); display:flex; flex-direction:column; overflow:hidden;
        box-shadow:0 24px 56px rgba(0,0,0,.22); }
    .rv-hdr { padding:20px 24px; border-bottom:1.5px solid #111; display:flex;
        justify-content:space-between; align-items:flex-start; gap:12px; flex-shrink:0; }
    .rv-hdr h3 { margin:0 0 3px; font-size:18px; font-weight:800; color:#111; }
    .rv-hdr p { margin:0; font-size:12.5px; color:#6B7280; }
    .rv-close { background:none; border:none; font-size:22px; line-height:1; cursor:pointer;
        color:#374151; width:32px; height:32px; border-radius:8px; flex-shrink:0; }
    .rv-close:hover { background:#F3F4F6; }
    .rv-body { padding:20px 24px; overflow-y:auto; flex:1; min-height:0; }
    .rv-ft { padding:14px 24px; border-top:1px solid #E5E7EB; display:flex; justify-content:space-between;
        align-items:center; gap:10px; background:#fafafa; flex-shrink:0; }

    .rv-pick-lead { font-size:13.5px; color:#374151; margin:0 0 14px; line-height:1.6; }
    .rv-mods { display:grid; grid-template-columns:repeat(auto-fill,minmax(132px,1fr)); gap:8px; margin-bottom:6px; }
    .rv-mod { display:flex; align-items:center; gap:8px; padding:10px 12px; border:1.5px solid #111;
        border-radius:9px; cursor:pointer; font-size:13px; font-weight:600; color:#111; background:#fff; }
    .rv-mod:hover { background:#F3F4F6; }
    .rv-mod input { accent-color:#00461B; width:15px; height:15px; cursor:pointer; }
    .rv-mod.is-on { background:#00461B; color:#fff; border-color:#00461B; }
    .rv-mod-sub { display:block; font-size:10.5px; font-weight:500; opacity:.75; }
    .rv-cap { font-size:11.5px; color:#6B7280; margin:10px 0 0; }

    .rv-btn { display:inline-flex; align-items:center; gap:7px; padding:10px 18px; border-radius:10px;
        font-size:13.5px; font-weight:700; cursor:pointer; font-family:inherit; border:none; }
    .rv-btn-primary { background:#00461B; color:#fff; }
    .rv-btn-primary:disabled { opacity:.45; cursor:not-allowed; }
    .rv-btn-ghost { background:#fff; color:#374151; border:1.5px solid #111; }
    .rv-btn-ghost:hover { background:#F3F4F6; }

    .rv-loading { display:flex; flex-direction:column; align-items:center; justify-content:center;
        gap:14px; padding:56px 20px; text-align:center; }
    .rv-spin { width:36px; height:36px; border:3px solid #E5E7EB; border-top-color:#00461B;
        border-radius:50%; animation:rvSpin .8s linear infinite; }
    @keyframes rvSpin { to { transform:rotate(360deg); } }
    .rv-loading p { margin:0; font-size:13px; color:#6B7280; }

    .rv-empty { text-align:center; padding:42px 20px; color:#6B7280; font-size:13.5px; line-height:1.6; }

    .rv-sec { margin-bottom:26px; }
    .rv-sec-h { display:flex; align-items:center; gap:8px; font-size:12px; font-weight:800; color:#00461B;
        text-transform:uppercase; letter-spacing:.5px; margin:0 0 12px; padding-bottom:7px;
        border-bottom:1.5px solid #00461B; }
    .rv-grp { margin-bottom:16px; }
    .rv-grp-h { font-size:14px; font-weight:800; color:#111; margin:0 0 6px; }
    .rv-grp-mod { font-size:10.5px; font-weight:700; color:#6B7280; text-transform:uppercase; letter-spacing:.4px; }
    .rv-grp ul { margin:0; padding-left:20px; }
    .rv-grp li { font-size:13px; color:#374151; line-height:1.65; margin-bottom:4px; }

    .rv-term { padding:10px 12px; border:1.5px solid #E5E7EB; border-radius:9px; margin-bottom:8px; background:#fff; }
    .rv-term-t { font-size:13.5px; font-weight:800; color:#111; }
    .rv-term-d { font-size:12.5px; color:#374151; line-height:1.6; margin-top:2px; }

    .rv-q { border:1.5px solid #E5E7EB; border-radius:9px; padding:12px 14px; margin-bottom:8px; background:#fff; }
    .rv-q-t { font-size:13.5px; font-weight:700; color:#111; line-height:1.5; }
    .rv-q-reveal { margin-top:8px; background:none; border:none; padding:0; cursor:pointer;
        font-family:inherit; font-size:12px; font-weight:700; color:#00461B; text-decoration:underline; }
    .rv-q-a { margin-top:8px; padding:9px 11px; background:#00461B; color:#fff; border-radius:8px;
        font-size:12.5px; line-height:1.6; }

    @media print {
        .rv-overlay { position:static; background:#fff; padding:0; display:block; }
        .rv-modal { max-width:none; height:auto; box-shadow:none; border-radius:0; }
        .rv-hdr, .rv-ft, .rv-close, .rv-q-reveal { display:none !important; }
        .rv-body { overflow:visible; padding:0; }
        .rv-q-a { display:block !important; background:#fff; color:#111; border:1px solid #999; }
    }
    @media (max-width:640px) {
        .rv-overlay { padding:0; }
        .rv-modal { height:100vh; border-radius:0; max-width:none; }
    }
`;

function injectStyles() {
    if (document.getElementById('rv-modal-styles')) return;
    const s = document.createElement('style');
    s.id = 'rv-modal-styles';
    s.textContent = STYLES;
    document.head.appendChild(s);
}

/**
 * @param {number} subjectId
 * @param {{ subjectName?: string, subjectCode?: string }} [opts]
 */
export async function openReviewerModal(subjectId, opts = {}) {
    if (!subjectId) return;
    injectStyles();

    const overlay = document.createElement('div');
    overlay.className = 'rv-overlay';
    overlay.innerHTML = `
        <div class="rv-modal" role="dialog" aria-modal="true" aria-label="Exam reviewer">
            <div class="rv-hdr">
                <div>
                    <h3>Exam Reviewer</h3>
                    <p>${esc(opts.subjectCode || '')}${opts.subjectCode && opts.subjectName ? ' · ' : ''}${esc(opts.subjectName || '')}</p>
                </div>
                <button type="button" class="rv-close" aria-label="Close">&times;</button>
            </div>
            <div class="rv-body" id="rv-body">
                <div class="rv-loading"><div class="rv-spin"></div><p>Checking what's available to review…</p></div>
            </div>
            <div class="rv-ft" id="rv-ft"></div>
        </div>`;

    const close = () => { document.body.style.overflow = ''; overlay.remove(); };
    document.body.style.overflow = 'hidden';
    overlay.querySelector('.rv-close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.body.appendChild(overlay);

    const body = overlay.querySelector('#rv-body');
    const foot = overlay.querySelector('#rv-ft');

    const res = await Api.get(`/ReviewerAPI.php?action=modules&subject_id=${subjectId}`, { ttl: 0 });
    if (!res.success) {
        body.innerHTML = `<div class="rv-empty">${esc(res.message || 'Could not load this subject.')}</div>`;
        return;
    }
    const modules = res.modules || [];
    if (!modules.length) {
        body.innerHTML = `<div class="rv-empty">
            There's no published module material for this subject yet, so there's nothing to build a reviewer from.
            <br><br>Once your instructor publishes a module's Student Activity Sheet, it'll show up here.</div>`;
        return;
    }

    renderPicker(modules, res.max_modules || 5);

    function renderPicker(mods, maxModules) {
        body.innerHTML = `
            <p class="rv-pick-lead">Pick the modules you're reviewing — for example the ones covered by your
                upcoming exam. You can choose up to <strong>${maxModules}</strong> at a time.</p>
            <div class="rv-mods">
                ${mods.map(m => `
                    <label class="rv-mod" data-mod="${m.module_number}">
                        <input type="checkbox" value="${m.module_number}">
                        <span>Module ${m.module_number}
                            <span class="rv-mod-sub">${m.has_sas && m.has_tg ? 'SAS + Guide' : m.has_sas ? 'SAS' : 'Guide'}</span>
                        </span>
                    </label>`).join('')}
            </div>
            <p class="rv-cap">Built only from your instructor's published material for this subject.</p>`;

        foot.innerHTML = `
            <span class="rv-cap" id="rv-count">None selected</span>
            <button type="button" class="rv-btn rv-btn-primary" id="rv-go" disabled>
                ${icon('robot', { size: 14, className: 'ui-icon-inline' })} Build Reviewer
            </button>`;

        const boxes = [...body.querySelectorAll('.rv-mod input')];
        const goBtn = foot.querySelector('#rv-go');
        const count = foot.querySelector('#rv-count');

        const sync = () => {
            const picked = boxes.filter(b => b.checked);
            boxes.forEach(b => b.closest('.rv-mod').classList.toggle('is-on', b.checked));
            // Enforce the cap in the UI too, so the student sees the limit
            // rather than getting refused after waiting on a request.
            boxes.forEach(b => { b.disabled = !b.checked && picked.length >= maxModules; });
            goBtn.disabled = picked.length === 0;
            count.textContent = picked.length
                ? `${picked.length} module${picked.length > 1 ? 's' : ''} selected`
                : 'None selected';
        };
        boxes.forEach(b => b.addEventListener('change', sync));
        sync();

        goBtn.addEventListener('click', () => {
            const picked = boxes.filter(b => b.checked).map(b => parseInt(b.value, 10));
            generate(picked, mods, maxModules);
        });
    }

    async function generate(picked, mods, maxModules) {
        body.innerHTML = `
            <div class="rv-loading">
                <div class="rv-spin"></div>
                <p>Reading module ${picked.join(', ')} and writing your reviewer…<br>
                   This takes about a minute — please keep this open.</p>
            </div>`;
        foot.innerHTML = '';

        const res2 = await Api.post('/ReviewerAPI.php?action=generate', { subject_id: subjectId, modules: picked });
        if (!res2.success) {
            body.innerHTML = `<div class="rv-empty">${esc(res2.message || 'Could not build the reviewer.')}</div>`;
            foot.innerHTML = `<span></span><button type="button" class="rv-btn rv-btn-ghost" id="rv-back">Try again</button>`;
            foot.querySelector('#rv-back').addEventListener('click', () => renderPicker(mods, maxModules));
            return;
        }
        renderReviewer(res2.data, mods, maxModules);
    }

    function renderReviewer(d, mods, maxModules) {
        const summary = d.summary || [], terms = d.key_terms || [], practice = d.practice || [];

        body.innerHTML = `
            ${summary.length ? `
            <div class="rv-sec">
                <h4 class="rv-sec-h">${icon('document', { size: 13, className: 'ui-icon-inline' })} Key Points</h4>
                ${summary.map(s => `
                    <div class="rv-grp">
                        <p class="rv-grp-h">${esc(s.heading)}
                            ${s.module ? `<span class="rv-grp-mod">· Module ${s.module}</span>` : ''}</p>
                        <ul>${s.points.map(p => `<li>${esc(p)}</li>`).join('')}</ul>
                    </div>`).join('')}
            </div>` : ''}

            ${terms.length ? `
            <div class="rv-sec">
                <h4 class="rv-sec-h">${icon('book', { size: 13, className: 'ui-icon-inline' })} Key Terms</h4>
                ${terms.map(t => `
                    <div class="rv-term">
                        <div class="rv-term-t">${esc(t.term)}
                            ${t.module ? `<span class="rv-grp-mod">· Module ${t.module}</span>` : ''}</div>
                        <div class="rv-term-d">${esc(t.definition)}</div>
                    </div>`).join('')}
            </div>` : ''}

            ${practice.length ? `
            <div class="rv-sec">
                <h4 class="rv-sec-h">${icon('quiz', { size: 13, className: 'ui-icon-inline' })} Practice Questions</h4>
                ${practice.map((q, i) => `
                    <div class="rv-q">
                        <div class="rv-q-t">${i + 1}. ${esc(q.question)}
                            ${q.module ? `<span class="rv-grp-mod">· Module ${q.module}</span>` : ''}</div>
                        ${q.answer ? `
                            <button type="button" class="rv-q-reveal" data-a="${i}">Show answer</button>
                            <div class="rv-q-a" id="rv-a-${i}" hidden>${esc(q.answer)}</div>` : ''}
                    </div>`).join('')}
            </div>` : ''}

            <p class="rv-cap">Generated from your instructor's published material for module(s)
                ${(d.modules || []).join(', ')}. Study aid only — always check against your own notes.</p>`;

        body.querySelectorAll('.rv-q-reveal').forEach(btn => {
            btn.addEventListener('click', () => {
                const a = body.querySelector(`#rv-a-${btn.dataset.a}`);
                if (!a) return;
                a.hidden = !a.hidden;
                btn.textContent = a.hidden ? 'Show answer' : 'Hide answer';
            });
        });

        foot.innerHTML = `
            <button type="button" class="rv-btn rv-btn-ghost" id="rv-again">Pick other modules</button>
            <button type="button" class="rv-btn rv-btn-primary" id="rv-print">
                ${icon('download', { size: 14, className: 'ui-icon-inline' })} Save / Print
            </button>`;
        foot.querySelector('#rv-again').addEventListener('click', () => renderPicker(mods, maxModules));
        foot.querySelector('#rv-print').addEventListener('click', () => {
            // Answers print revealed — a printed reviewer with everything hidden
            // would be useless to study from.
            body.querySelectorAll('.rv-q-a').forEach(a => { a.hidden = false; });
            window.print();
        });
    }
}
