import sanitizeHtml from 'sanitize-html';

/**
 * Template HTML is admin-authored but never trusted: it is sanitized on save and again for every preview
 * draft. Only layout / table / typography markup survives; images may only use `data:` URIs or the
 * `{{asset "key"}}` / `{{company.logoDataUri}}` placeholders (which resolve to data: URIs at render time).
 * Chromium additionally runs with JavaScript disabled and no network access (renderer/puppeteerRenderer.ts).
 *
 * Handlebars expressions are swapped for opaque tokens while sanitizing so the sanitizer can't mangle the
 * quotes inside them, then restored. Triple-stash (`{{{x}}}`) and `{{& x}}` are rewritten to `{{x}}`, so
 * every value stays auto-escaped; raw blocks and `\{{` escapes (which print text verbatim) are removed.
 */

/** Byte limits (UTF-8) per template part. */
export const TEMPLATE_SIZE_LIMITS = {
    body: 500 * 1024,
    header: 100 * 1024,
    footer: 100 * 1024,
    css: 100 * 1024,
} as const;

export const byteLength = (value: string): number => Buffer.byteLength(value, 'utf8');

const ALLOWED_TAGS = [
    'style',
    'div', 'span', 'p', 'br', 'hr', 'section', 'header', 'footer', 'article', 'aside', 'main',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'strong', 'b', 'em', 'i', 'u', 's', 'small', 'sub', 'sup', 'mark', 'code', 'pre', 'blockquote', 'address',
    'ul', 'ol', 'li', 'dl', 'dt', 'dd',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
    'img', 'figure', 'figcaption',
];

const COMMON_ATTRIBUTES = ['class', 'style', 'id', 'title', 'align', 'valign', 'width', 'height', 'dir', 'lang'];

// Private-use code points never appear in real templates (they are stripped from the input first).
const TOKEN_START = String.fromCharCode(0xe000);
const TOKEN_END = String.fromCharCode(0xe001);
const TOKEN_CHARS = new RegExp(`[${TOKEN_START}${TOKEN_END}]`, 'g');
const TOKEN_PATTERN = new RegExp(`${TOKEN_START}(\\d+)${TOKEN_END}`, 'g');
const MUSTACHE_PATTERN = /\{\{[\s\S]*?\}\}/g;

/** Mustaches allowed as an <img src>: they resolve to data: URIs. */
const IMG_SRC_MUSTACHE = /^\{\{\s*(asset\s+["'][\w.-]+["']|company\.logoDataUri)\s*\}\}$/;
const DATA_IMAGE_URI = /^data:image\/(png|jpe?g|webp|gif);base64,[a-z0-9+/=\s]+$/i;

function buildOptions(tokens: string[]): sanitizeHtml.IOptions {
    const restore = (value: string) => value.replace(TOKEN_PATTERN, (_m, i: string) => tokens[Number(i)] ?? '');
    return {
        allowedTags: ALLOWED_TAGS,
        allowedAttributes: {
            '*': COMMON_ATTRIBUTES,
            td: [...COMMON_ATTRIBUTES, 'colspan', 'rowspan'],
            th: [...COMMON_ATTRIBUTES, 'colspan', 'rowspan', 'scope'],
            col: [...COMMON_ATTRIBUTES, 'span'],
            colgroup: [...COMMON_ATTRIBUTES, 'span'],
            img: [...COMMON_ATTRIBUTES, 'src', 'alt'],
            ol: [...COMMON_ATTRIBUTES, 'start', 'type'],
        },
        allowedSchemes: ['data'],
        allowedSchemesByTag: { img: ['data'] },
        allowedSchemesAppliedToAttributes: ['src', 'href', 'cite'],
        allowProtocolRelative: false,
        // Removed together with their contents.
        nonTextTags: ['script', 'iframe', 'object', 'embed', 'form', 'noscript', 'textarea', 'option', 'title', 'template', 'svg', 'math', 'head'],
        disallowedTagsMode: 'discard',
        // <style> contents are cleaned by sanitizeTemplateCss below.
        allowVulnerableTags: true,
        parser: { lowerCaseAttributeNames: true },
        transformTags: {
            img: (tagName, attribs) => {
                const src = restore(attribs.src ?? '').trim();
                const next = { ...attribs };
                if (!IMG_SRC_MUSTACHE.test(src) && !DATA_IMAGE_URI.test(src)) delete next.src;
                return { tagName, attribs: next };
            },
        },
        exclusiveFilter: (frame) => frame.tag === 'img' && !frame.attribs.src,
    };
}

const DANGEROUS_CSS = [
    /@import[^;]*;?/gi,
    /@charset[^;]*;?/gi,
    /@namespace[^;]*;?/gi,
    /expression\s*\(/gi,
    /behavior\s*:/gi,
    /-moz-binding\s*:/gi,
    /javascript\s*:/gi,
    /<\/?\s*style/gi,
];

/** Strips `@import`, `expression(`, legacy binding hooks, `javascript:` and every `url(…)` that isn't a data: URI. */
export function sanitizeTemplateCss(css: string | null | undefined): string {
    if (!css) return '';
    // Decode CSS escapes (`\75 rl(` = `url(`) first so they can't smuggle keywords past the patterns below.
    let out = css
        .replace(/<!--|-->/g, '')
        .replace(/\\([0-9a-f]{1,6})\s?/gi, (_m, hex: string) => {
            const code = parseInt(hex, 16);
            return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
        })
        .replace(/\\(.)/g, '$1')
        .replace(/\\/g, '');
    for (const pattern of DANGEROUS_CSS) out = out.replace(pattern, '');
    out = out.replace(/url\s*\(\s*(['"]?)([\s\S]*?)\1\s*\)/gi, (match, _quote: string, target: string) =>
        /^data:(image|font)\//i.test(target.trim()) ? match : 'none',
    );
    return out;
}

/**
 * Normalises Handlebars syntax that could print template text verbatim (and so bypass the sanitizer):
 * `{{{x}}}` / `{{& x}}` → `{{x}}` (always escaped); raw blocks `{{{{raw}}}}` and `\{{…}}` escapes are removed.
 */
export function forceEscapedMustaches(html: string): string {
    return html
        .replace(/\{\{\{\{\/?[\s\S]*?\}\}\}\}/g, '')
        .replace(/\\+(?=\{\{)/g, '')
        .replace(/\{\{\{\s*([\s\S]*?)\s*\}\}\}/g, '{{$1}}')
        .replace(/\{\{&\s*([\s\S]*?)\}\}/g, '{{$1}}');
}

/** Sanitizes a template part and the CSS inside any `<style>` blocks / style="" attributes it contains. */
export function sanitizeTemplateHtml(html: string | null | undefined): string {
    if (!html) return '';
    const tokens: string[] = [];
    const shielded = forceEscapedMustaches(html.replace(TOKEN_CHARS, '')).replace(MUSTACHE_PATTERN, (m) => {
        // A "mustache" containing markup is left to the sanitizer (it then fails to compile, harmlessly).
        if (/[<>]/.test(m)) return m;
        tokens.push(m);
        return `${TOKEN_START}${tokens.length - 1}${TOKEN_END}`;
    });
    const cleaned = sanitizeHtml(shielded, buildOptions(tokens))
        .replace(/(<style[^>]*>)([\s\S]*?)(<\/style>)/gi, (_m, open: string, body: string, close: string) => `${open}${sanitizeTemplateCss(body)}${close}`)
        .replace(/style="([^"]*)"/gi, (_m, value: string) => `style="${sanitizeTemplateCss(value)}"`);
    // Handlebars consumes every restored mustache and HTML-escapes whatever it outputs.
    return cleaned.replace(TOKEN_PATTERN, (_m, i: string) => tokens[Number(i)] ?? '');
}
