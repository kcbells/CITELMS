/** Solid palette — dark shades only (white text stays readable, no gradients) */
const PALETTE = [
    '#00461B', // college green
    '#1E3A8A', // dark blue
    '#14532D', // forest green
    '#9A3412', // burnt sienna
    '#5B21B6', // dark violet
    '#0E7490', // deep teal
    '#991B1B', // dark red
    '#065F46', // dark emerald
    '#3730A3', // indigo
    '#9D174D', // dark magenta
    '#5D4037', // brown
    '#37474F', // blue-gray
];

function hashStr(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}

export function subjectColor(subjectId) {
    const id = String(subjectId || '0');
    return PALETTE[hashStr(id) % PALETTE.length];
}

// ── Google Classroom–style header art ───────────────────────────────────────
// A handful of abstract line-art doodles, layered semi-transparent-white over
// the solid banner color. Picked per subject (hashed on a salted id so the
// pattern varies independently of which color the subject landed on).
const PATTERNS = [
    // Scattered circles of varying size
    (w, h) => `<circle cx="${w * .14}" cy="${h * .28}" r="17"/><circle cx="${w * .32}" cy="${h * .72}" r="9"/>
        <circle cx="${w * .55}" cy="${h * .22}" r="24"/><circle cx="${w * .74}" cy="${h * .62}" r="13"/>
        <circle cx="${w * .9}" cy="${h * .3}" r="30"/><circle cx="${w * .42}" cy="${h * .85}" r="6"/>`,
    // Overlapping wave arcs along the bottom
    (w, h) => `<path d="M-10 ${h * .75} Q ${w * .17} ${h * .45} ${w * .34} ${h * .75} T ${w * .68} ${h * .75} T ${w + 10} ${h * .75}" fill="none" stroke-width="6"/>
        <path d="M-10 ${h * .95} Q ${w * .17} ${h * .65} ${w * .34} ${h * .95} T ${w * .68} ${h * .95} T ${w + 10} ${h * .95}" fill="none" stroke-width="4"/>`,
    // Diagonal parallel stripes
    (w, h) => Array.from({ length: 6 }, (_, i) =>
        `<line x1="${-40 + i * 60}" y1="${h + 20}" x2="${i * 60 + h + 20}" y2="-20" stroke-width="10"/>`).join(''),
    // Concentric ring outlines, corner-anchored
    (w, h) => `<circle cx="${w * .86}" cy="${h * .18}" r="14" fill="none" stroke-width="3"/>
        <circle cx="${w * .86}" cy="${h * .18}" r="28" fill="none" stroke-width="3"/>
        <circle cx="${w * .86}" cy="${h * .18}" r="42" fill="none" stroke-width="3"/>
        <circle cx="${w * .1}" cy="${h * .85}" r="10" fill="none" stroke-width="3"/>
        <circle cx="${w * .1}" cy="${h * .85}" r="22" fill="none" stroke-width="3"/>`,
    // Scattered triangle outlines
    (w, h) => `<polygon points="${w * .1},${h * .8} ${w * .22},${h * .3} ${w * .34},${h * .8}" fill="none" stroke-width="3"/>
        <polygon points="${w * .55},${h * .9} ${w * .64},${h * .5} ${w * .73},${h * .9}" fill="none" stroke-width="3"/>
        <polygon points="${w * .8},${h * .5} ${w * .92},${h * .12} ${w + 10},${h * .5}" fill="none" stroke-width="3"/>`,
    // Dot grid
    (w, h) => Array.from({ length: 5 }, (_, r) =>
        Array.from({ length: 8 }, (_, c) => `<circle cx="${c * (w / 7)}" cy="${r * (h / 4)}" r="3.5"/>`).join('')
    ).join(''),
];

export function subjectPatternSvg(subjectId, { width = 400, height = 140, opacity = 0.16 } = {}) {
    const idx = hashStr(`pattern:${subjectId}`) % PATTERNS.length;
    const shapes = PATTERNS[idx](width, height);
    return wrapPatternSvg(shapes, width, height, opacity);
}

function wrapPatternSvg(shapes, width, height, opacity) {
    return `<svg class="subj-pattern" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg" aria-hidden="true"
        style="position:absolute;inset:0;width:100%;height:100%;fill:#fff;stroke:#fff;opacity:${opacity};pointer-events:none;z-index:-1;">
        ${shapes}
    </svg>`;
}

// ── Program-themed banner art ───────────────────────────────────────────────
// One motif per program family — BSIT gets binary code / circuitry, nursing a
// heartbeat, business charts, and so on. Layered as translucent white line-art
// over the subject's solid dark color. Falls back to the generic doodles when
// the program isn't recognized.

const PROGRAM_THEMES = {
    tech: (w, h) => {
        const rows = [];
        for (let r = 0; r < 4; r++) {
            const y = h * (0.16 + r * 0.24);
            const bits = Array.from({ length: 26 }, (_, i) => (((i * 7) + (r * 13)) % 3 === 0 ? '0' : '1')).join(' ');
            rows.push(`<text x="${-14 + r * 18}" y="${y}" font-family="ui-monospace,monospace" font-size="12" letter-spacing="3">${bits}</text>`);
        }
        rows.push(`<text x="${w * .8}" y="${h * .56}" font-family="ui-monospace,monospace" font-size="36" font-weight="bold">&lt;/&gt;</text>`);
        // circuit trace with nodes
        rows.push(`<path d="M${w * .04} ${h * .88} H ${w * .2} V ${h * .68} H ${w * .34}" fill="none" stroke-width="2.5"/>
            <circle cx="${w * .34}" cy="${h * .68}" r="4"/><circle cx="${w * .04}" cy="${h * .88}" r="4"/>`);
        return rows.join('');
    },
    engineering: (w, h) => `
        <circle cx="${w * .84}" cy="${h * .3}" r="26" fill="none" stroke-width="4" stroke-dasharray="10 7"/>
        <circle cx="${w * .84}" cy="${h * .3}" r="10" fill="none" stroke-width="3"/>
        <polygon points="${w * .08},${h * .85} ${w * .3},${h * .3} ${w * .3},${h * .85}" fill="none" stroke-width="3"/>
        <line x1="${w * .42}" y1="${h * .78}" x2="${w * .68}" y2="${h * .78}" stroke-width="3"/>
        ${Array.from({ length: 6 }, (_, i) => `<line x1="${w * (.42 + i * .052)}" y1="${h * .7}" x2="${w * (.42 + i * .052)}" y2="${h * .78}" stroke-width="2"/>`).join('')}`,
    business: (w, h) => `
        <rect x="${w * .08}" y="${h * .55}" width="22" height="${h * .32}" fill="none" stroke-width="3"/>
        <rect x="${w * .16}" y="${h * .4}" width="22" height="${h * .47}" fill="none" stroke-width="3"/>
        <rect x="${w * .24}" y="${h * .25}" width="22" height="${h * .62}" fill="none" stroke-width="3"/>
        <path d="M${w * .45} ${h * .7} L ${w * .6} ${h * .42} L ${w * .7} ${h * .55} L ${w * .88} ${h * .2}" fill="none" stroke-width="3.5"/>
        <polygon points="${w * .88},${h * .2} ${w * .83},${h * .22} ${w * .87},${h * .3}"/>
        <text x="${w * .55}" y="${h * .92}" font-family="ui-monospace,monospace" font-size="20" font-weight="bold">%</text>`,
    health: (w, h) => `
        <path d="M${w * .82} ${h * .18} h14 v14 h14 v14 h-14 v14 h-14 v-14 h-14 v-14 h14 z" fill="none" stroke-width="3"/>
        <path d="M${-10} ${h * .6} H ${w * .18} L ${w * .24} ${h * .38} L ${w * .32} ${h * .82} L ${w * .38} ${h * .52} L ${w * .42} ${h * .6} H ${w * .62}" fill="none" stroke-width="3.5"/>
        <circle cx="${w * .68}" cy="${h * .6}" r="4"/>`,
    crim: (w, h) => `
        <path d="M${w * .84} ${h * .15} l 26 9 v 22 c 0 16 -12 27 -26 33 c -14 -6 -26 -17 -26 -33 v -22 z" fill="none" stroke-width="3.5"/>
        <path d="M${w * .78} ${h * .45} l 5 7 l 11 -14" fill="none" stroke-width="3.5"/>
        <circle cx="${w * .14}" cy="${h * .68}" r="22" fill="none" stroke-width="3.5"/>
        <line x1="${w * .14 + 16}" y1="${h * .68 + 16}" x2="${w * .14 + 34}" y2="${h * .68 + 34}" stroke-width="5"/>`,
    education: (w, h) => `
        <path d="M${w * .1} ${h * .3} q ${w * .07} -10 ${w * .14} 0 v ${h * .45} q -${w * .07} -10 -${w * .14} 0 z" fill="none" stroke-width="3"/>
        <path d="M${w * .24} ${h * .3} q ${w * .07} -10 ${w * .14} 0 v ${h * .45} q -${w * .07} -10 -${w * .14} 0 z" fill="none" stroke-width="3"/>
        <text x="${w * .74}" y="${h * .6}" font-family="Georgia,serif" font-size="42" font-weight="bold">A+</text>
        <line x1="${w * .5}" y1="${h * .82}" x2="${w * .66}" y2="${h * .82}" stroke-width="3"/>`,
    hospitality: (w, h) => `
        <circle cx="${w * .85}" cy="${h * .5}" r="30" fill="none" stroke-width="3"/>
        <ellipse cx="${w * .85}" cy="${h * .5}" rx="13" ry="30" fill="none" stroke-width="2.5"/>
        <line x1="${w * .85 - 30}" y1="${h * .5}" x2="${w * .85 + 30}" y2="${h * .5}" stroke-width="2.5"/>
        <circle cx="${w * .16}" cy="${h * .55}" r="22" fill="none" stroke-width="3"/>
        <circle cx="${w * .16}" cy="${h * .55}" r="30" fill="none" stroke-width="2"/>
        <path d="M${w * .38} ${h * .3} q 6 10 0 20 M${w * .44} ${h * .28} q 6 10 0 20" fill="none" stroke-width="2.5"/>`,
    psych: (w, h) => `
        <text x="${w * .78}" y="${h * .68}" font-family="Georgia,serif" font-size="64" font-weight="bold">&#936;</text>
        <circle cx="${w * .16}" cy="${h * .45}" r="24" fill="none" stroke-width="3"/>
        <path d="M${w * .16 - 12} ${h * .45} q 12 -16 24 0 q -12 16 -24 0" fill="none" stroke-width="2.5"/>
        <circle cx="${w * .4}" cy="${h * .72}" r="8" fill="none" stroke-width="2.5"/>
        <circle cx="${w * .5}" cy="${h * .55}" r="5" fill="none" stroke-width="2"/>`,
};

const PROGRAM_FAMILY = [
    [/^(BS)?(IT|CS|CPE|IS|EMC|ACT)/, 'tech'],
    [/^(BS)?(CE|EE|ME|AR|ARCH)/,     'engineering'],
    [/^(BS)?(BA|ACC|MAN|AIS|MA|HRM|MKT|FM|ENTREP)/, 'business'],
    [/^(BS)?(N|NUR|MID|M|PHARM|RT)$|^(BSN|NUR|MID|PHARM)/, 'health'],
    [/^(BS)?(CRIM|CR|SEC)/,          'crim'],
    [/^(B[SE]?ED|ED|TCP)/,           'education'],
    [/^(BS)?(HM|TM|HRS)/,            'hospitality'],
    [/^(AB)?(PSY)/,                  'psych'],
];

function programFamily(programCode) {
    const code = String(programCode || '').toUpperCase().replace(/[^A-Z]/g, '');
    if (!code) return null;
    for (const [re, fam] of PROGRAM_FAMILY) {
        if (re.test(code)) return fam;
    }
    return null;
}

/**
 * Program-themed overlay: BSIT subjects get binary code/circuits, nursing a
 * heartbeat, etc. Unknown/missing programs fall back to the generic doodles.
 */
export function programPatternSvg(programCode, subjectId, { width = 400, height = 140, opacity = 0.14 } = {}) {
    const fam = programFamily(programCode);
    if (!fam) return subjectPatternSvg(subjectId, { width, height, opacity });
    return wrapPatternSvg(PROGRAM_THEMES[fam](width, height), width, height, opacity);
}

function parseHex(hex) {
    const h = (hex || '#00461B').replace('#', '');
    return {
        r: parseInt(h.slice(0, 2), 16) || 0,
        g: parseInt(h.slice(2, 4), 16) || 70,
        b: parseInt(h.slice(4, 6), 16) || 27,
    };
}

function mixHex(hex, whitePct) {
    const { r, g, b } = parseHex(hex);
    const w = whitePct / 100;
    const mix = (c) => Math.round(c * (1 - w) + 255 * w);
    const toHex = (n) => n.toString(16).padStart(2, '0');
    return `#${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`;
}

export function subjectTints(hex) {
    return {
        solid: hex,
        light: mixHex(hex, 88),
        soft: mixHex(hex, 94),
        iconBg: mixHex(hex, 82),
        rowBorder: mixHex(hex, 75),
        rowHover: mixHex(hex, 96),
    };
}

export function subjectThemeVars(hex) {
    const t = subjectTints(hex);
    return `--subj:${t.solid};--subj-light:${t.light};--subj-soft:${t.soft};--subj-icon-bg:${t.iconBg};--subj-row-border:${t.rowBorder};--subj-row-hover:${t.rowHover};`;
}
