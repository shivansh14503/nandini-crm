import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { logger } from '../../config/logger.js';
import type { Theme } from './document/schema.js';
import type { Orientation, PageSize } from './pdf.types.js';

/**
 * Wraps rendered template HTML in a complete document: embedded Noto Sans (latin + latin-ext, which carries
 * the ₹ glyph) and print CSS that keeps table rows together and repeats table headers. The document's own
 * styles are inline (document/render.ts). Chromium never fetches anything, so fonts are inlined.
 *
 * Fonts are read once from `src/modules/pdf/assets/fonts/` when present, else from the `@fontsource/noto-sans`
 * package. When neither is available the system sans-serif is used and a warning is logged.
 */

const FONT_FILES = [
    { file: 'noto-sans-latin-400-normal.woff2', weight: 400, style: 'normal', range: 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD' },
    { file: 'noto-sans-latin-ext-400-normal.woff2', weight: 400, style: 'normal', range: 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF' },
    { file: 'noto-sans-latin-700-normal.woff2', weight: 700, style: 'normal', range: 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD' },
    { file: 'noto-sans-latin-ext-700-normal.woff2', weight: 700, style: 'normal', range: 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF' },
    { file: 'noto-sans-latin-400-italic.woff2', weight: 400, style: 'italic', range: 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD' },
] as const;

const LOCAL_FONT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'assets', 'fonts');

function readFont(file: string): Buffer | null {
    const local = path.join(LOCAL_FONT_DIR, file);
    if (existsSync(local)) return readFileSync(local);
    try {
        const require = createRequire(import.meta.url);
        return readFileSync(require.resolve(`@fontsource/noto-sans/files/${file}`));
    } catch {
        return null;
    }
}

let fontFaceCss: string | null = null;

/** `@font-face` rules with base64 fonts (built once, ~150 KB). */
export function getFontFaceCss(): string {
    if (fontFaceCss !== null) return fontFaceCss;
    const rules: string[] = [];
    for (const font of FONT_FILES) {
        const data = readFont(font.file);
        if (!data) continue;
        rules.push(
            `@font-face{font-family:'Noto Sans PDF';font-style:${font.style};font-weight:${font.weight};font-display:block;` +
                `src:url(data:font/woff2;base64,${data.toString('base64')}) format('woff2');unicode-range:${font.range};}`,
        );
    }
    if (rules.length === 0) logger.warn('PDF fonts not found (assets/fonts or @fontsource/noto-sans); falling back to system sans-serif');
    fontFaceCss = rules.join('\n');
    return fontFaceCss;
}

export const FONT_STACK = `'Noto Sans PDF', 'Noto Sans', 'Segoe UI', Arial, sans-serif`;

const BASE_CSS = `
*,*::before,*::after{box-sizing:border-box}
html,body{margin:0;padding:0}
body{font-family:${FONT_STACK};font-size:10pt;line-height:1.4;color:#1f2937;-webkit-print-color-adjust:exact;print-color-adjust:exact}
img{max-width:100%}
table{border-collapse:collapse;width:100%;page-break-inside:auto}
tr{page-break-inside:avoid;break-inside:avoid}
thead{display:table-header-group}
tfoot{display:table-footer-group}
.page-break{page-break-before:always;break-before:page}
.avoid-break{page-break-inside:avoid;break-inside:avoid}
.text-right{text-align:right}.text-center{text-align:center}.text-left{text-align:left}
.muted{color:#64748b}
`;

export interface BuildDocumentInput {
    bodyHtml: string;
    theme: Theme;
    pageSize: PageSize;
    orientation: Orientation;
    title?: string;
}

const escapeHtmlText = (value: string): string =>
    value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Full HTML document for the body band. */
export function buildHtmlDocument(input: BuildDocumentInput): string {
    const pageCss = `@page{size:${input.pageSize} ${input.orientation}}`;
    const textColor = /^#[0-9a-f]{3,6}$/i.test(input.theme.textColor) ? input.theme.textColor : '#1f2937';
    return [
        '<!DOCTYPE html>',
        '<html lang="en"><head><meta charset="utf-8">',
        `<title>${escapeHtmlText(input.title ?? 'Document')}</title>`,
        `<style>${getFontFaceCss()}</style>`,
        `<style>${pageCss}${BASE_CSS}body{color:${textColor}}p{margin:0}</style>`,
        '</head><body>',
        input.bodyHtml,
        '</body></html>',
    ].join('');
}

/**
 * Chromium renders header/footer templates in a separate context: page CSS and web fonts aren't inherited
 * and the default font size is tiny, so each gets inline styles (the band itself carries the theme's size).
 * `offsetMm` (margins.header / margins.footer) pushes the content away from the page edge.
 * `<span class="pageNumber">` / `totalPages` keep working.
 */
export function wrapHeaderFooter(html: string | null | undefined, kind: 'header' | 'footer', layout: { offsetMm: number; leftMm: number; rightMm: number }): string {
    if (!html || !html.trim()) return '<span></span>';
    const padding = kind === 'header' ? `padding-top:${layout.offsetMm}mm` : `padding-bottom:${layout.offsetMm}mm`;
    return (
        `<div style="box-sizing:border-box;width:100%;font-family:${FONT_STACK.replace(/'/g, '')};font-size:8pt;line-height:1.35;color:#475569;` +
        `-webkit-print-color-adjust:exact;print-color-adjust:exact;${padding};` +
        `padding-left:${layout.leftMm}mm;padding-right:${layout.rightMm}mm;">${html}</div>`
    );
}
