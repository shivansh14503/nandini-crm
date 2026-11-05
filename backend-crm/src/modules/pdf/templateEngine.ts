import Handlebars from 'handlebars';
import { StatusCodes } from 'http-status-codes';
import { HttpError, type ApiFieldError } from '../../utils/httpError.js';
import { amountInWords, formatCurrency, formatDate, formatNumber } from './format.js';
import type { PdfColumn, TemplatePart } from './pdf.types.js';

/**
 * Isolated Handlebars runtime for PDF templates. Auto-escaping stays on and prototype access stays disabled
 * (the Handlebars ≥ 4.6 default; never enable allowProtoPropertiesByDefault). Only `nl2br` / `lineItemCell`
 * return SafeString, and both escape their input first. `knownHelpersOnly` means a template can call nothing
 * but the helpers registered here plus the built-ins (if / unless / each / with / lookup).
 *
 * Helpers never touch the database: `asset` reads the per-render `@assets` map that pdfRender.service
 * prefetches (see `collectAssetKeys`).
 */

const hb = Handlebars.create();
type HelperOptions = Handlebars.HelperOptions;

/** Template-level data: `{ assets: { key: dataUri } }`, passed as Handlebars `data`. */
export interface TemplateRenderData {
    assets: Record<string, string>;
}

const isOptions = (value: unknown): value is HelperOptions =>
    Boolean(value) && typeof value === 'object' && 'hash' in (value as object) && 'data' in (value as object);

/** Helper arguments without the trailing Handlebars options object. */
const argsOf = (args: unknown[]): unknown[] => (args.length && isOptions(args[args.length - 1]) ? args.slice(0, -1) : args);

const rootOf = (options: HelperOptions): Record<string, unknown> => {
    const root: unknown = options.data?.root;
    return root && typeof root === 'object' ? (root as Record<string, unknown>) : {};
};

const rootCurrency = (options: HelperOptions): string | undefined => {
    const currency = rootOf(options).currency;
    return typeof currency === 'string' ? currency : undefined;
};

const asText = (value: unknown): string => (value === null || value === undefined ? '' : String(value));

/** Escapes, then turns newlines into <br>. */
export function nl2brSafe(value: unknown): Handlebars.SafeString {
    const escaped = hb.Utils.escapeExpression(asText(value));
    return new hb.SafeString(escaped.replace(/\r\n|\r|\n/g, '<br>'));
}

const MULTILINE_COLUMNS = new Set(['description', 'note']);

hb.registerHelper('currency', function (this: unknown, value: unknown, ...rest: unknown[]) {
    const options = rest[rest.length - 1] as HelperOptions;
    const [currency] = argsOf(rest);
    return formatCurrency(value, typeof currency === 'string' ? currency : rootCurrency(options));
});

hb.registerHelper('number', (value: unknown, ...rest: unknown[]) => {
    const [digits] = argsOf(rest);
    return formatNumber(value, typeof digits === 'number' ? digits : 2);
});

hb.registerHelper('date', (value: unknown) => formatDate(value));

hb.registerHelper('nl2br', (value: unknown) => nl2brSafe(value));

hb.registerHelper('amountInWords', (value: unknown, ...rest: unknown[]) => {
    const options = rest[rest.length - 1] as HelperOptions;
    const [currency] = argsOf(rest);
    return amountInWords(value, typeof currency === 'string' ? currency : rootCurrency(options));
});

hb.registerHelper('inc', (value: unknown) => {
    const n = Number(value);
    return Number.isFinite(n) ? n + 1 : 1;
});

hb.registerHelper('eq', (...args: unknown[]) => {
    const [a, b] = argsOf(args);
    return a === b || (a !== null && a !== undefined && b !== null && b !== undefined && String(a) === String(b));
});

hb.registerHelper('and', (...args: unknown[]) => argsOf(args).every(Boolean));
hb.registerHelper('or', (...args: unknown[]) => argsOf(args).some(Boolean));

/** `{{#ifShow "gstNo"}}…{{else}}…{{/ifShow}}` reads `show[key]` from the root context. */
hb.registerHelper('ifShow', function (this: unknown, key: unknown, options: HelperOptions) {
    const show = rootOf(options).show;
    const visible = Boolean(show && typeof show === 'object' && (show as Record<string, unknown>)[asText(key)]);
    return visible ? options.fn(this) : options.inverse(this);
});

/** `<img src="{{asset "logo-acme"}}">` → the prefetched data: URI ('' when unknown). */
hb.registerHelper('asset', (key: unknown, options: HelperOptions) => {
    const assets: unknown = options.data?.assets;
    if (!assets || typeof assets !== 'object') return '';
    const uri = (assets as Record<string, unknown>)[asText(key)];
    return typeof uri === 'string' ? uri : '';
});

/** `{{lineItemCell this column}}` → the column's formatted value for a line item. */
hb.registerHelper('lineItemCell', (item: unknown, column: unknown) => {
    if (!item || typeof item !== 'object' || !column || typeof column !== 'object') return '';
    const key = asText((column as Partial<PdfColumn>).key);
    const row = item as Record<string, unknown>;
    const formatted = row[`${key}Formatted`];
    const value = formatted !== undefined ? formatted : row[key];
    return MULTILINE_COLUMNS.has(key) ? nl2brSafe(value) : nl2brSafe(asText(value).replace(/\r?\n/g, ' '));
});

const HELPER_NAMES = ['currency', 'number', 'date', 'nl2br', 'amountInWords', 'inc', 'eq', 'and', 'or', 'ifShow', 'asset', 'lineItemCell'] as const;
const KNOWN_HELPERS: Record<string, boolean> = Object.fromEntries(HELPER_NAMES.map((name) => [name, true]));

const COMPILE_OPTIONS: CompileOptions = {
    strict: false,
    noEscape: false,
    knownHelpers: KNOWN_HELPERS,
    knownHelpersOnly: true,
};

const RUNTIME_OPTIONS = {
    allowProtoPropertiesByDefault: false,
    allowProtoMethodsByDefault: false,
} as const;

interface CompileOptions {
    strict: boolean;
    noEscape: boolean;
    knownHelpers: Record<string, boolean>;
    knownHelpersOnly: boolean;
}

export type CompiledTemplate = (context: object, data: TemplateRenderData) => string;

// ─── Errors ─────────────────────────────────────────────────────────────────────

export interface TemplateErrorDetail {
    part: TemplatePart | 'css';
    line?: number;
    column?: number;
    message: string;
}

interface ParserErrorShape {
    message?: unknown;
    lineNumber?: unknown;
    column?: unknown;
    hash?: { loc?: { first_line?: unknown; first_column?: unknown }; line?: unknown };
}

/** Pulls a 1-based line / column out of Handlebars parser and compiler exceptions. */
export function describeTemplateError(err: unknown, part: TemplatePart): TemplateErrorDetail {
    const e = (err && typeof err === 'object' ? err : {}) as ParserErrorShape;
    const rawMessage = typeof e.message === 'string' ? e.message : String(err);
    let line: number | undefined;
    let column: number | undefined;
    if (typeof e.lineNumber === 'number') line = e.lineNumber;
    if (typeof e.column === 'number') column = e.column + 1;
    if (line === undefined && typeof e.hash?.loc?.first_line === 'number') line = e.hash.loc.first_line;
    if (column === undefined && typeof e.hash?.loc?.first_column === 'number') column = e.hash.loc.first_column + 1;
    if (line === undefined) {
        const match = /line (\d+)/i.exec(rawMessage);
        if (match) line = Number(match[1]);
    }
    // The parser's message embeds a source excerpt; keep only the first line.
    const message = rawMessage.split('\n')[0].replace(/\s*-\s*\d+:\d+$/, '').trim() || 'Invalid template';
    return { part, line, column, message };
}

export function templateErrorToHttp(details: TemplateErrorDetail[]): HttpError {
    const first = details[0];
    const where = first.line ? ` (line ${first.line}${first.column ? `, column ${first.column}` : ''})` : '';
    const errors: ApiFieldError[] = details.map((d) => ({
        message: `${d.message}${d.line ? ` (line ${d.line}${d.column ? `, column ${d.column}` : ''})` : ''}`,
        path: [d.part, ...(d.line ? [String(d.line)] : []), ...(d.column ? [String(d.column)] : [])],
    }));
    return new HttpError(`Template ${first.part} has an error${where}: ${first.message}`, StatusCodes.UNPROCESSABLE_ENTITY, {
        code: 'TEMPLATE_COMPILE_ERROR',
        errors,
    });
}

// ─── Compile + cache ────────────────────────────────────────────────────────────

const CACHE_LIMIT = 200;
const cache = new Map<string, CompiledTemplate>();

function compileUncached(source: string, part: TemplatePart): CompiledTemplate {
    try {
        // compile() parses lazily; parse() first so syntax errors surface here with their location.
        hb.parse(source);
        const template = hb.compile(source, COMPILE_OPTIONS);
        // Force the compiler pass (unknown helpers under knownHelpersOnly etc.) with an empty context.
        template({}, { data: { assets: {} }, ...RUNTIME_OPTIONS });
        return (context, data) => template(context, { data, ...RUNTIME_OPTIONS });
    } catch (err) {
        throw templateErrorToHttp([describeTemplateError(err, part)]);
    }
}

/**
 * Compiles a template part. With a cache key (`${templateId}:${version}`) the result is kept in an LRU map;
 * previews of unsaved drafts pass no key.
 */
export function compileTemplate(source: string, part: TemplatePart, cacheKey?: string): CompiledTemplate {
    if (!cacheKey) return compileUncached(source, part);
    const key = `${cacheKey}:${part}`;
    const hit = cache.get(key);
    if (hit) {
        cache.delete(key);
        cache.set(key, hit);
        return hit;
    }
    const compiled = compileUncached(source, part);
    cache.set(key, compiled);
    if (cache.size > CACHE_LIMIT) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
    }
    return compiled;
}

/** Validates every part, collecting all errors (used on save so the editor can show each one). */
export function validateTemplateParts(parts: Partial<Record<TemplatePart, string | null | undefined>>): void {
    const details: TemplateErrorDetail[] = [];
    for (const [part, source] of Object.entries(parts) as [TemplatePart, string | null | undefined][]) {
        if (!source) continue;
        try {
            compileUncached(source, part);
        } catch (err) {
            if (err instanceof HttpError && err.errors) {
                details.push(describeTemplateErrorFromHttp(err, part));
            } else {
                details.push(describeTemplateError(err, part));
            }
        }
    }
    if (details.length) throw templateErrorToHttp(details);
}

function describeTemplateErrorFromHttp(err: HttpError, part: TemplatePart): TemplateErrorDetail {
    const path = err.errors?.[0]?.path ?? [];
    const line = path[1] ? Number(path[1]) : undefined;
    const column = path[2] ? Number(path[2]) : undefined;
    const message = err.message.replace(/^Template \w+ has an error(?: \([^)]*\))?: /, '');
    return { part, line, column, message };
}

/** Drops every cached part of a template (called after update / delete). */
export function invalidateTemplate(templateId: string): void {
    for (const key of cache.keys()) if (key.startsWith(`${templateId}:`)) cache.delete(key);
}

/** Renders a compiled part; runtime failures (e.g. a block helper misuse) become the same 422. */
export function renderTemplate(compiled: CompiledTemplate, part: TemplatePart, context: object, data: TemplateRenderData): string {
    try {
        return compiled(context, data);
    } catch (err) {
        throw templateErrorToHttp([describeTemplateError(err, part)]);
    }
}

/** Asset keys referenced as `{{asset "key"}}` in any of the given sources. */
export function collectAssetKeys(...sources: (string | null | undefined)[]): string[] {
    const keys = new Set<string>();
    for (const source of sources) {
        if (!source) continue;
        for (const match of source.matchAll(/\{\{\s*asset\s+["']([\w.-]+)["']\s*\}\}/g)) keys.add(match[1]);
    }
    return [...keys];
}

/** Test hook. */
export const __templateCacheSize = (): number => cache.size;
