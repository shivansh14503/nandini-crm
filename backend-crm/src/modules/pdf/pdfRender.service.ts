import { createHash } from 'node:crypto';
import { ENV } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { isRedisReady, redis } from '../../config/redis.js';
import type { PdfTemplate } from '../../generated/prisma/client.js';
import { auditService } from '../../services/audit.service.js';
import type { AuthUser } from '../../types/user.types.js';
import type { ContextBuildInput } from './contexts/contextTypes.js';
import { buildHtmlDocument, wrapHeaderFooter } from './document.js';
import { buildFieldRegistry, loadCustomFieldMeta } from './fieldRegistry.js';
import { mergeBranding, mergeFieldVisibility } from './fieldVisibility.js';
import { PDF_MODULE_ADAPTERS } from './moduleAdapters.js';
import type { Branding, FieldVisibility, Orientation, PageSize, PdfContext, PdfMargins, PdfModule } from './pdf.types.js';
import { pdfAssetService } from './pdfAsset.service.js';
import { toMargins, toModule } from './pdfTemplate.mapper.js';
import { pdfTemplateService, prepareParts } from './pdfTemplate.service.js';
import { previewBodySchema } from './pdfTemplate.validator.js';
import { getPdfRenderer } from './renderer/puppeteerRenderer.js';
import { collectAssetKeys, compileTemplate, renderTemplate } from './templateEngine.js';

/**
 * Template + record → PDF. Steps: resolve template → registry / visibility / branding → (cache lookup) →
 * context → compile header/body/footer → wrap document → render → (cache store) → audit.
 */

interface RenderableTemplate {
    id: string;
    name: string;
    version: number;
    /** Compile-cache key; undefined for unsaved drafts. */
    cacheKey?: string;
    module: PdfModule;
    pageSize: PageSize;
    orientation: Orientation;
    margins: PdfMargins;
    headerHtml: string;
    bodyHtml: string;
    footerHtml: string;
    css: string;
    visibility: FieldVisibility;
    branding: Branding;
}

export interface RenderedPdf {
    buffer: Buffer;
    fileName: string;
}

/** `attachment; filename="QT-1_acme.pdf"; filename*=UTF-8''QT-1_acme.pdf` */
export function contentDisposition(disposition: 'inline' | 'attachment', fileName: string): string {
    const ascii = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\;]/g, '_');
    return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

async function prepareInput(template: RenderableTemplate, user: AuthUser, customFields: ContextBuildInput['customFields']) {
    const registry = buildFieldRegistry(template.module, customFields);
    const assetKeys = collectAssetKeys(template.headerHtml, template.bodyHtml, template.footerHtml, template.css);
    if (template.branding.logoAssetKey) assetKeys.push(template.branding.logoAssetKey);
    const assets = assetKeys.length ? await pdfAssetService.loadDataUris(assetKeys) : {};
    const input: ContextBuildInput = {
        registry,
        visibility: template.visibility,
        branding: template.branding,
        logoDataUri: template.branding.logoAssetKey ? (assets[template.branding.logoAssetKey] ?? '') : '',
        customFields,
        generatedBy: user.username,
        timeZone: ENV.BUSINESS_TIMEZONE,
    };
    return { input, assets };
}

function compileParts(template: RenderableTemplate, context: PdfContext, assets: Record<string, string>, title: string) {
    const data = { assets };
    const part = (source: string, name: 'header' | 'body' | 'footer') =>
        source.trim() ? renderTemplate(compileTemplate(source, name, template.cacheKey), name, context, data) : '';
    const body = part(template.bodyHtml, 'body');
    const header = part(template.headerHtml, 'header');
    const footer = part(template.footerHtml, 'footer');
    const html = buildHtmlDocument({ bodyHtml: body, css: template.css, branding: template.branding, pageSize: template.pageSize, orientation: template.orientation, title });
    return { html, header, footer };
}

async function renderToPdf(template: RenderableTemplate, compiled: ReturnType<typeof compileParts>, recordId?: string): Promise<Buffer> {
    const { margins } = template;
    const accent = template.branding.accentColor;
    return getPdfRenderer().renderPdf({
        html: compiled.html,
        headerHtml: compiled.header ? wrapHeaderFooter(compiled.header, 'header', { offsetMm: margins.header, leftMm: margins.left, rightMm: margins.right }, accent) : undefined,
        footerHtml: compiled.footer ? wrapHeaderFooter(compiled.footer, 'footer', { offsetMm: margins.footer, leftMm: margins.left, rightMm: margins.right }, accent) : undefined,
        pageSize: template.pageSize,
        orientation: template.orientation,
        margins,
        meta: { templateId: template.id, ...(recordId ? { recordId } : {}) },
    });
}

function fromRow(row: PdfTemplate, customFields: ContextBuildInput['customFields']): RenderableTemplate {
    const module = toModule(row.module);
    return {
        id: row.id,
        name: row.name,
        version: row.version,
        cacheKey: `${row.id}:${row.version}`,
        module,
        pageSize: row.pageSize === 'Letter' || row.pageSize === 'Legal' ? row.pageSize : 'A4',
        orientation: row.orientation === 'landscape' ? 'landscape' : 'portrait',
        margins: toMargins(row),
        headerHtml: row.headerHtml ?? '',
        bodyHtml: row.bodyHtml,
        footerHtml: row.footerHtml ?? '',
        css: row.css ?? '',
        visibility: mergeFieldVisibility(buildFieldRegistry(module, customFields), row.fieldVisibilityJson),
        branding: mergeBranding(row.brandingJson),
    };
}

// ─── Redis cache (optional, fail-open) ──────────────────────────────────────────

async function cacheGet(key: string): Promise<Buffer | null> {
    if (ENV.PDF.CACHE_TTL_SECONDS === 0 || !isRedisReady()) return null;
    try {
        return await redis.getBuffer(key);
    } catch (err) {
        logger.warn({ err: (err as Error).message }, 'PDF cache read failed');
        return null;
    }
}

async function cacheSet(key: string, buffer: Buffer): Promise<void> {
    if (ENV.PDF.CACHE_TTL_SECONDS === 0 || !isRedisReady()) return;
    try {
        await redis.set(key, buffer, 'EX', ENV.PDF.CACHE_TTL_SECONDS);
    } catch (err) {
        logger.warn({ err: (err as Error).message }, 'PDF cache write failed');
    }
}

export const pdfRenderService = {
    async renderRecordPdf(params: { module: PdfModule; recordId: string; templateId?: string; user: AuthUser }): Promise<RenderedPdf> {
        const { module, recordId, user } = params;
        const adapter = PDF_MODULE_ADAPTERS[module];
        const [row, meta, customFields] = await Promise.all([
            pdfTemplateService.resolveTemplate(module, params.templateId),
            adapter.loadRecordMeta(recordId),
            loadCustomFieldMeta(module),
        ]);
        const template = fromRow(row, customFields);
        const fileName = `${meta.fileBaseName}.pdf`;

        const cacheKey = `pdf:${module}:${sha256(
            JSON.stringify([template.id, template.version, recordId, meta.updatedAt.toISOString(), customFields.map((c) => `${c.fieldKey}:${c.label}:${c.fieldType}`)]),
        )}`;
        const cached = await cacheGet(cacheKey);
        let buffer: Buffer;
        if (cached) {
            buffer = cached;
            logger.info({ templateId: template.id, recordId, bytes: buffer.length }, 'PDF served from cache');
        } else {
            const { input, assets } = await prepareInput(template, user, customFields);
            const context = await adapter.buildContext(recordId, input);
            buffer = await renderToPdf(template, compileParts(template, context, assets, meta.fileBaseName), recordId);
            await cacheSet(cacheKey, buffer);
        }

        void auditService.enqueue({
            entityType: adapter.auditEntityType,
            entityId: recordId,
            action: 'PDF_GENERATED',
            changedBy: user.username,
            changes: { templateId: template.id, templateName: template.name, templateVersion: template.version, bytes: buffer.length, cached: Boolean(cached) },
        });
        return { buffer, fileName };
    },

    /** Editor preview of an unsaved draft (re-sanitized here); sample data when no record is picked. */
    async renderPreview(body: unknown, user: AuthUser): Promise<{ format: 'html'; html: string } | { format: 'pdf'; buffer: Buffer }> {
        const { template: draft, recordId, format } = previewBodySchema.parse(body);
        const parts = prepareParts(draft);
        const customFields = await loadCustomFieldMeta(draft.module);
        const registry = buildFieldRegistry(draft.module, customFields);
        const template: RenderableTemplate = {
            id: draft.id ?? 'draft',
            name: draft.name ?? 'Draft',
            version: 0,
            module: draft.module,
            pageSize: draft.pageSize,
            orientation: draft.orientation,
            margins: draft.margins,
            ...parts,
            visibility: mergeFieldVisibility(registry, draft.fieldVisibility),
            branding: mergeBranding(draft.branding),
        };
        const adapter = PDF_MODULE_ADAPTERS[draft.module];
        const { input, assets } = await prepareInput(template, user, customFields);
        const context = recordId ? await adapter.buildContext(recordId, input) : adapter.buildSampleContext(input);
        const compiled = compileParts(template, context, assets, 'Preview');

        if (format === 'html') {
            // Fast preview: header and footer are shown inline above / below the body (page numbers read "1").
            const strip = (html: string) => html.replace(/<span class="(pageNumber|totalPages)"><\/span>/g, '1');
            const headerBlock = compiled.header ? `<div class="pdf-preview-header" style="border-bottom:1px dashed #cbd5e1;margin-bottom:8px;padding-bottom:4px;font-size:8pt;color:#475569">${strip(compiled.header)}</div>` : '';
            const footerBlock = compiled.footer ? `<div class="pdf-preview-footer" style="border-top:1px dashed #cbd5e1;margin-top:12px;padding-top:4px;font-size:8pt;color:#475569">${strip(compiled.footer)}</div>` : '';
            const html = compiled.html.replace('<body>', `<body style="padding:${template.margins.top / 3}mm ${template.margins.right}mm ${template.margins.bottom / 3}mm ${template.margins.left}mm">${headerBlock}`).replace('</body>', `${footerBlock}</body>`);
            return { format: 'html', html };
        }
        return { format: 'pdf', buffer: await renderToPdf(template, compiled, recordId) };
    },
};
