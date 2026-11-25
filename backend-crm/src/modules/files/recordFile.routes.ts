import express, { Router, type Request, type Response } from 'express';
import { authenticate } from '../../middlewares/authMiddleware.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import { sendCreated } from '../../utils/apiResponse.js';
import { requireUser } from '../../utils/requestContext.js';
import { idParamSchema } from '../../validators/common.js';
import { contentDisposition } from '../pdf/pdfRender.service.js';
import { recordFileService } from './recordFile.service.js';

/**
 * /api/files   (mounted before the global 1 MB JSON parser; uploads are base64 JSON ≤ 10 MB decoded)
 *   POST   /        { module: opportunities, fileName, mimeType, data (base64) }  → { id, fileName, mimeType, sizeBytes, url }
 *   GET    /:id     the file (PDF and images inline, others as a download)        (any signed-in user)
 */
const router = Router();
router.use(express.json({ limit: '15mb' }));
router.use(authenticate);

router.post('/', async (req: Request, res: Response) => {
    sendCreated(res, await recordFileService.upload(req.body, requireUser(req)), 'File uploaded');
});

router.get('/:id', validateRequest({ params: idParamSchema }), async (req: Request, res: Response) => {
    const file = await recordFileService.get(String(req.params.id));
    // Binary responses never go through the JSON envelope; errors still do (thrown → errorHandler).
    res.status(200)
        .set({
            'Content-Type': file.mimeType,
            'Content-Length': String(file.data.length),
            'Content-Disposition': contentDisposition(file.inline ? 'inline' : 'attachment', file.fileName),
            // Files never change once uploaded (a new upload gets a new id).
            'Cache-Control': 'private, max-age=31536000, immutable',
            'X-Content-Type-Options': 'nosniff',
            'Cross-Origin-Resource-Policy': 'cross-origin',
        })
        .end(file.data);
});

export default router;
