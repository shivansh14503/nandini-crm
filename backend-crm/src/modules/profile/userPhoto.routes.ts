import { Router, type Request, type Response } from 'express';
import { authenticate } from '../../middlewares/authMiddleware.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import { contentDisposition } from '../pdf/pdfRender.service.js';
import { profileService } from './profile.service.js';
import { photoIdParamSchema } from './profile.validator.js';

/**
 * /api/user-photos (profile photos, shown next to a user's name; uploaded through PUT /api/me/photo)
 *   GET    /:id     the image (PNG, JPEG or WebP), cached forever: a new upload gets a new id   (any signed-in user)
 */
const router = Router();
router.use(authenticate);

router.get('/:id', validateRequest({ params: photoIdParamSchema }), async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const photo = await profileService.photo(id);
    const extension = photo.mimeType.split('/')[1] === 'jpeg' ? 'jpg' : photo.mimeType.split('/')[1];
    // Binary responses never go through the JSON envelope; errors still do (thrown → errorHandler).
    res.status(200)
        .set({
            'Content-Type': photo.mimeType,
            'Content-Length': String(photo.data.length),
            'Content-Disposition': contentDisposition('inline', `photo-${id}.${extension}`),
            'Cache-Control': 'private, max-age=31536000, immutable',
            'X-Content-Type-Options': 'nosniff',
            'Cross-Origin-Resource-Policy': 'cross-origin',
        })
        .end(photo.data);
});

export default router;
