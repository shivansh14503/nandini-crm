import type { Request, Response } from 'express';
import { sendCreated, sendSuccess } from '../../utils/apiResponse.js';
import { requireUser } from '../../utils/requestContext.js';
import { getFieldRegistry } from './fieldRegistry.js';
import type { PdfModule } from './pdf.types.js';
import { pdfAssetService } from './pdfAsset.service.js';
import { contentDisposition, pdfRenderService } from './pdfRender.service.js';
import { pdfTemplateService } from './pdfTemplate.service.js';
import { fieldsQuerySchema, recordPdfQuerySchema } from './pdfTemplate.validator.js';

const param = (req: Request, name: string) => String(req.params[name]);

/** Binary responses never go through the JSON envelope; errors still do (thrown → errorHandler). */
function sendBinary(res: Response, data: Buffer, headers: Record<string, string>): void {
    res.status(200)
        .set({ ...headers, 'Content-Length': String(data.length), 'X-Content-Type-Options': 'nosniff' })
        .end(data);
}

export const pdfTemplateController = {
    async list(req: Request, res: Response): Promise<void> {
        sendSuccess(res, await pdfTemplateService.list(req.query, requireUser(req)));
    },
    async fields(req: Request, res: Response): Promise<void> {
        const { module } = fieldsQuerySchema.parse(req.query);
        sendSuccess(res, await getFieldRegistry(module));
    },
    async get(req: Request, res: Response): Promise<void> {
        sendSuccess(res, await pdfTemplateService.get(param(req, 'id')));
    },
    async create(req: Request, res: Response): Promise<void> {
        sendCreated(res, await pdfTemplateService.create(req.body, requireUser(req)), 'PDF template created');
    },
    async update(req: Request, res: Response): Promise<void> {
        sendSuccess(res, await pdfTemplateService.update(param(req, 'id'), req.body, requireUser(req)), 'PDF template saved');
    },
    async duplicate(req: Request, res: Response): Promise<void> {
        sendCreated(res, await pdfTemplateService.duplicate(param(req, 'id'), req.body, requireUser(req)), 'PDF template duplicated');
    },
    async setDefault(req: Request, res: Response): Promise<void> {
        sendSuccess(res, await pdfTemplateService.setDefault(param(req, 'id'), requireUser(req)), 'Default template updated');
    },
    async setActive(req: Request, res: Response): Promise<void> {
        const row = await pdfTemplateService.setActive(param(req, 'id'), req.body, requireUser(req));
        sendSuccess(res, row, row.isActive ? 'PDF template activated' : 'PDF template deactivated');
    },
    async remove(req: Request, res: Response): Promise<void> {
        sendSuccess(res, await pdfTemplateService.remove(param(req, 'id'), requireUser(req)), 'PDF template deleted');
    },
    async preview(req: Request, res: Response): Promise<void> {
        const result = await pdfRenderService.renderPreview(req.body, requireUser(req));
        if (result.format === 'html') {
            sendBinary(res, Buffer.from(result.html, 'utf8'), {
                'Content-Type': 'text/html; charset=utf-8',
                'Cache-Control': 'private, no-store',
                // Defence in depth: the editor shows it in a sandboxed iframe anyway.
                'Content-Security-Policy': "default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'; sandbox",
            });
            return;
        }
        sendBinary(res, result.buffer, {
            'Content-Type': 'application/pdf',
            'Content-Disposition': contentDisposition('inline', 'preview.pdf'),
            'Cache-Control': 'private, no-store',
        });
    },
};

/** GET /api/<module>/:id/pdf handler factory (mounted by each module's router). */
export function recordPdfHandler(module: PdfModule) {
    return async (req: Request, res: Response): Promise<void> => {
        const { templateId, disposition } = recordPdfQuerySchema.parse(req.query);
        const { buffer, fileName } = await pdfRenderService.renderRecordPdf({ module, recordId: param(req, 'id'), templateId, user: requireUser(req) });
        sendBinary(res, buffer, {
            'Content-Type': 'application/pdf',
            'Content-Disposition': contentDisposition(disposition, fileName),
            'Cache-Control': 'private, no-store',
        });
    };
}

export const pdfAssetController = {
    async upload(req: Request, res: Response): Promise<void> {
        sendCreated(res, await pdfAssetService.upload(req.body, requireUser(req)), 'Image uploaded');
    },
    async get(req: Request, res: Response): Promise<void> {
        const asset = await pdfAssetService.get(param(req, 'key'));
        sendBinary(res, asset.data, {
            'Content-Type': asset.mimeType,
            // Keys are immutable (a new upload gets a new key).
            'Cache-Control': 'private, max-age=31536000, immutable',
            'Content-Disposition': contentDisposition('inline', asset.fileName),
            'Cross-Origin-Resource-Policy': 'cross-origin',
        });
    },
    async remove(req: Request, res: Response): Promise<void> {
        sendSuccess(res, await pdfAssetService.remove(param(req, 'key'), requireUser(req)), 'Image deleted');
    },
};
