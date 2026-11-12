import { createHash } from 'node:crypto';
import { ENV } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { isRedisReady, redis } from '../../config/redis.js';
import { auditService } from '../../services/audit.service.js';
import type { AuthUser } from '../../types/user.types.js';
import type { ContextBuildInput } from './contexts/contextTypes.js';
import { collectDocumentAssetKeys, renderDocument, type PdfDocument } from './document/index.js';
import { buildHtmlDocument, wrapHeaderFooter } from './document.js';
import { buildFieldRegistry, loadCustomFieldMeta, type CustomFieldMeta } from './fieldRegistry.js';
import { PDF_MODULE_ADAPTERS } from './moduleAdapters.js';
import type { PdfContext, PdfModule } from './pdf.types.js';
import { pdfAssetService } from './pdfAsset.service.js';
import { assertDocumentValid, documentOf, pdfTemplateService } from './pdfTemplate.service.js';
import { contextQuerySchema, previewBodySchema } from './pdfTemplate.validator.js';
import { getPdfRenderer } from './renderer/puppeteerRenderer.js';

/**
 * Template + record → PDF. Steps: resolve template → (cache lookup) → context → renderDocument (header / body /
 * footer HTML) → wrap → Chromium → (cache store) → audit.
 */

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

/** Context input + the data: URIs of every image the document uses. */
async function prepareInput(module: PdfModule, document: PdfDocument, user: AuthUser, customFields: CustomFieldMeta[]) {
    const keys = collectDocumentAssetKeys(document);
    const assets = keys.length ? await pdfAssetService.loadDataUris(keys) : {};
    const input: ContextBuildInput = {
        registry: buildFieldRegistry(module, customFields),
        theme: document.theme,
        logoDataUri: document.theme.logoAssetKey ? (assets[document.theme.logoAssetKey] ?? '') : '',
        customFields,
        generatedBy: user.username,
        timeZone: ENV.BUSINESS_TIMEZONE,
    };
    return { input, assets };
}

async function renderToPdf(document: PdfDocument, context: PdfContext, assets: Record<string, string>, title: string, meta: { templateId: string; recordId?: string }): Promise<Buffer> {
    const rendered = renderDocument(document, context, { mode: 'pdf', assetSrc: (key) => assets[key] ?? null });
    const { margins } = document.page;
    const layout = (offsetMm: number) => ({ offsetMm, leftMm: margins.left, rightMm: margins.right });
    return getPdfRenderer().renderPdf({
        html: buildHtmlDocument({ bodyHtml: rendered.body, theme: document.theme, pageSize: document.page.size, orientation: document.page.orientation, title }),
        headerHtml: rendered.header ? wrapHeaderFooter(rendered.header, 'header', layout(margins.header)) : undefined,
        footerHtml: rendered.footer ? wrapHeaderFooter(rendered.footer, 'footer', layout(margins.footer)) : undefined,
        pageSize: document.page.size,
        orientation: document.page.orientation,
        margins,
        meta,
    });
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
            adapter.loadRecordMeta(recordId, user),
            loadCustomFieldMeta(module),
        ]);
        const document = documentOf(row);
        const fileName = `${meta.fileBaseName}.pdf`;

        const cacheKey = `pdf:${module}:${sha256(
            JSON.stringify([row.id, row.version, recordId, meta.updatedAt.toISOString(), customFields.map((c) => `${c.fieldKey}:${c.label}:${c.fieldType}`)]),
        )}`;
        const cached = await cacheGet(cacheKey);
        let buffer: Buffer;
        if (cached) {
            buffer = cached;
            logger.info({ templateId: row.id, recordId, bytes: buffer.length }, 'PDF served from cache');
        } else {
            const { input, assets } = await prepareInput(module, document, user, customFields);
            const context = await adapter.buildContext(recordId, input);
            buffer = await renderToPdf(document, context, assets, meta.fileBaseName, { templateId: row.id, recordId });
            await cacheSet(cacheKey, buffer);
        }

        void auditService.enqueue({
            entityType: adapter.auditEntityType,
            entityId: recordId,
            action: 'PDF_GENERATED',
            changedBy: user.username,
            changes: { templateId: row.id, templateName: row.name, templateVersion: row.version, bytes: buffer.length, cached: Boolean(cached) },
        });
        return { buffer, fileName };
    },

    /** PDF of an unsaved builder document; sample data when no record is picked. */
    async renderPreview(body: unknown, user: AuthUser): Promise<Buffer> {
        const { module, document, recordId } = previewBodySchema.parse(body);
        const customFields = await loadCustomFieldMeta(module);
        assertDocumentValid(document, buildFieldRegistry(module, customFields));
        const adapter = PDF_MODULE_ADAPTERS[module];
        // Previewing against a real record reads it, so it gets the same 404 / 403 checks as a download.
        if (recordId) await adapter.loadRecordMeta(recordId, user);
        const { input, assets } = await prepareInput(module, document, user, customFields);
        const context = recordId ? await adapter.buildContext(recordId, input) : adapter.buildSampleContext(input);
        return renderToPdf(document, context, assets, 'Preview', { templateId: 'preview', ...(recordId ? { recordId } : {}) });
    },

    /**
     * The record context the builder canvas renders blocks with (sample data without a record). Company details
     * come from the builder's own theme, so the logo is left empty here (the canvas loads it by URL).
     */
    async editorContext(query: unknown, user: AuthUser): Promise<PdfContext> {
        const { module, recordId } = contextQuerySchema.parse(query ?? {});
        const customFields = await loadCustomFieldMeta(module);
        const adapter = PDF_MODULE_ADAPTERS[module];
        if (recordId) await adapter.loadRecordMeta(recordId, user);
        const input: ContextBuildInput = {
            registry: buildFieldRegistry(module, customFields),
            theme: { accentColor: '#1d4ed8', textColor: '#1f2937', fontSize: 10, lineHeight: 1.4, companyName: '', companyAddress: '', companyPhone: '', companyEmail: '', companyGstin: '', companyWebsite: '' },
            logoDataUri: '',
            customFields,
            generatedBy: user.username,
            timeZone: ENV.BUSINESS_TIMEZONE,
        };
        return recordId ? adapter.buildContext(recordId, input) : adapter.buildSampleContext(input);
    },
};
