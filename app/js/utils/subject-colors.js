/** Solid palette — Google Classroom–style, one color per subject */
const PALETTE = [
    '#00461B', // college green
    '#1967D2',
    '#188038',
    '#E37400',
    '#8430CE',
    '#129EAF',
    '#C5221F',
    '#0B8043',
    '#5C6BC0',
    '#D81B60',
    '#795548',
    '#455A64',
];

export function subjectColor(subjectId) {
    const id = String(subjectId || '0');
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
        hash = ((hash << 5) - hash) + id.charCodeAt(i);
        hash |= 0;
    }
    return PALETTE[Math.abs(hash) % PALETTE.length];
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
