import express, { Router, type Request } from 'express';
import { authenticate, requireRole } from '../../middlewares/authMiddleware.js';
import { createRateLimiter } from '../../middlewares/rateLimiter.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import { idParamSchema } from '../../validators/common.js';
import { FORM_CONFIG_ADMIN_ROLES } from '../form-configs/formConfig.routes.js';
import { pdfAssetController, pdfSavedItemController, pdfTemplateController, recordPdfHandler } from './pdfTemplate.controller.js';
import {
    activeBodySchema,
    assetKeyParamSchema,
    contextQuerySchema,
    duplicateBodySchema,
    fieldsQuerySchema,
    recordPdfQuerySchema,
} from './pdfTemplate.validator.js';
import type { PdfModule } from './pdf.types.js';

const admin = requireRole(...FORM_CONFIG_ADMIN_ROLES);
const perUser = (req: Request) => (req.user ? `user:${req.user.id}` : `ip:${req.ip ?? 'unknown'}`);

/** Template documents can be large once JSON-encoded, so these routers parse with 2 MB. */
const jsonBody = express.json({ limit: '2mb' });

/**
 * /api/pdf-templates   (mounted before the global 1 MB JSON parser)
 *   GET    /?module=QUOTATION&includeInactive     list without documents (any user; includeInactive honoured for admins)
 *   GET    /fields?module=QUOTATION               field registry (incl. active custom fields) + line-item columns
 *   ── Admin only ──
 *   GET    /context?module&recordId?              record (or sample) context the builder canvas renders with
 *   POST   /preview { module, document, recordId? }   PDF of an unsaved document (rate-limited 20/min/user)
 *   GET    /:id                                   full template
 *   POST   /                                      create
 *   PUT    /:id      { version, ... }             update; 409 VERSION_CONFLICT when version is stale; system: isActive/isDefault only
 *   POST   /:id/duplicate { name? }
 *   POST   /:id/set-default
 *   PATCH  /:id/active { isActive }               the default can't be deactivated
 *   DELETE /:id                                   soft delete (not system / default)
 */
export const pdfTemplateRouter = Router();
pdfTemplateRouter.use(jsonBody);
pdfTemplateRouter.use(authenticate);

const previewLimiter = createRateLimiter({
    keyPrefix: 'ratelimit:pdf-preview',
    max: 20,
    windowSeconds: 60,
    keyGenerator: perUser,
    message: 'Too many previews. Please wait a moment and try again.',
});

// The service parses the list query itself (booleanQuery only accepts the raw 'true' / 'false' strings).
pdfTemplateRouter.get('/', pdfTemplateController.list);
pdfTemplateRouter.get('/fields', validateRequest({ query: fieldsQuerySchema }), pdfTemplateController.fields);
pdfTemplateRouter.get('/context', admin, validateRequest({ query: contextQuerySchema }), pdfTemplateController.context);
pdfTemplateRouter.post('/preview', admin, previewLimiter, pdfTemplateController.preview);
pdfTemplateRouter.get('/:id', admin, validateRequest({ params: idParamSchema }), pdfTemplateController.get);
pdfTemplateRouter.post('/', admin, pdfTemplateController.create);
pdfTemplateRouter.put('/:id', admin, validateRequest({ params: idParamSchema }), pdfTemplateController.update);
pdfTemplateRouter.post('/:id/duplicate', admin, validateRequest({ params: idParamSchema, body: duplicateBodySchema }), pdfTemplateController.duplicate);
pdfTemplateRouter.post('/:id/set-default', admin, validateRequest({ params: idParamSchema }), pdfTemplateController.setDefault);
pdfTemplateRouter.patch('/:id/active', admin, validateRequest({ params: idParamSchema, body: activeBodySchema }), pdfTemplateController.setActive);
pdfTemplateRouter.delete('/:id', admin, validateRequest({ params: idParamSchema }), pdfTemplateController.remove);

/**
 * /api/pdf-assets   (mounted before the global 1 MB JSON parser; uploads are base64 JSON ≤ 1 MB decoded)
 *   POST   /        { fileName, mimeType: image/png|jpeg|webp, data (base64), key? }   (admin)
 *   GET    /:key    the image, long-lived private cache                              (any signed-in user)
 *   DELETE /:key    blocked while a template references it                           (admin)
 */
export const pdfAssetRouter = Router();
pdfAssetRouter.use(jsonBody);
pdfAssetRouter.use(authenticate);

pdfAssetRouter.post('/', admin, pdfAssetController.upload);
pdfAssetRouter.get('/:key', validateRequest({ params: assetKeyParamSchema }), pdfAssetController.get);
pdfAssetRouter.delete('/:key', admin, validateRequest({ params: assetKeyParamSchema }), pdfAssetController.remove);

/**
 * /api/pdf-saved-items   (admin; mounted before the global 1 MB JSON parser)
 *   GET    /?module=QUOTATION     the module's library (newest first)
 *   POST   /  { module, name, content: { kind: 'section', section } | { kind: 'block', block } }
 *   DELETE /:id                    soft delete (templates keep their copies)
 */
export const pdfSavedItemRouter = Router();
pdfSavedItemRouter.use(jsonBody);
pdfSavedItemRouter.use(authenticate);
pdfSavedItemRouter.use(admin);

pdfSavedItemRouter.get('/', pdfSavedItemController.list);
pdfSavedItemRouter.post('/', pdfSavedItemController.create);
pdfSavedItemRouter.delete('/:id', validateRequest({ params: idParamSchema }), pdfSavedItemController.remove);

/**
 * `GET /:id/pdf?templateId&disposition=inline|attachment` for a module router (register before its `/:id`).
 * Rate-limited to 30 renders per minute per user.
 */
export function registerRecordPdfRoute(router: Router, module: PdfModule): void {
    const limiter = createRateLimiter({
        keyPrefix: `ratelimit:pdf:${module.toLowerCase()}`,
        max: 30,
        windowSeconds: 60,
        keyGenerator: perUser,
        message: 'Too many PDF requests. Please wait a minute and try again.',
    });
    router.get('/:id/pdf', limiter, validateRequest({ params: idParamSchema, query: recordPdfQuerySchema }), recordPdfHandler(module));
}
