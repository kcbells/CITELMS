/**
 * Shared UI tokens — flat, solid surfaces (no gradients, no outline borders).
 */
export const UI = {
    primary: '#00461B',
    primaryMid: '#1B4D3E',
    primaryLight: '#E8F5EC',
    surface: '#FFFFFF',
    muted: '#F3F4F6',
    maroon: '#6B0F1A',
    maroonDark: '#3D0C11',
    text: '#262626',
    textMuted: '#6B7280',
};

/** Flat page hero / banner */
export function solidHeroCss(cls = 'ui-hero') {
    return `
        .${cls} {
            background: ${UI.primary};
            border-radius: 16px;
            padding: 28px 32px;
            color: #fff;
            border: none;
            box-shadow: none;
        }
    `;
}

/** Flat primary button */
export function solidPrimaryBtnCss(cls = 'ui-btn-primary') {
    return `
        .${cls} {
            background: ${UI.primary};
            color: #fff;
            border: none;
            border-radius: 10px;
            font-weight: 700;
            cursor: pointer;
            transition: background .15s;
            box-shadow: none;
        }
        .${cls}:hover { background: ${UI.primaryMid}; }
    `;
}

/** Flat card / panel surface */
export function flatCardCss(cls = 'ui-card') {
    return `
        .${cls} {
            background: ${UI.surface};
            border: none;
            border-radius: 14px;
            box-shadow: none;
        }
        .${cls}:hover { background: ${UI.muted}; }
    `;
}

/** Flat filled input */
export function flatInputCss(cls = 'ui-input') {
    return `
        .${cls} {
            border: none;
            background: ${UI.muted};
            border-radius: 8px;
            padding: 10px 14px;
            font-size: 14px;
            outline: none;
        }
        .${cls}:focus {
            outline: 2px solid ${UI.primary};
            outline-offset: 0;
        }
    `;
}
