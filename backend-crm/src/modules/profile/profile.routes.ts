import { Router, type Request, type Response } from 'express';
import { authenticate } from '../../middlewares/authMiddleware.js';
import { createRateLimiter } from '../../middlewares/rateLimiter.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { HttpError } from '../../utils/httpError.js';
import { requireUser } from '../../utils/requestContext.js';
import type { AuthSession } from '../../types/user.types.js';
import { preferencesService } from '../preferences/preferences.service.js';
import { preferencesPatchSchema, type PreferencesPatch } from '../preferences/preferences.validator.js';
import { profileService } from './profile.service.js';
import { photoUploadSchema, profileUpdateSchema, sessionIdParamSchema, type PhotoUploadInput, type ProfileUpdateInput } from './profile.validator.js';

/**
 * /api/me (My Profile: the signed-in user's own profile, photo, sessions and notification preferences; every route acts
 * on the caller only)
 *   GET    /profile          → ProfileDto { id, username, firstName, lastName, fullName, email, role, department, jobTitle,
 *                              reportsTo: { id, name } | null, mobile, officePhone, photoUrl, mustChangePassword,
 *                              lastLoginAt, passwordChangedAt, createdAt }   (jobTitle / reportsTo are set in Admin › Users)
 *   PATCH  /profile          { firstName?, lastName?, mobile?, officePhone? } (other keys refused) → ProfileDto
 *                              firstName required when sent; '' / null clears lastName / mobile / officePhone;
 *                              phones are E.164 (national Indian numbers are normalized). fullName is recomputed.
 *   PUT    /photo            { mimeType: image/png|image/jpeg|image/webp, data: base64 or data: URI, fileName? }
 *                              ≤ 512 KB decoded → { photoUrl }   400 INVALID_IMAGE · 400 IMAGE_TOO_LARGE
 *   DELETE /photo            → { photoUrl: null }
 *   GET    /sessions         → { tracked, sessions: [{ id, current, ip, userAgent, device, createdAt, expiresAt }] }
 *                              current first, then newest; { tracked: false, sessions: [] } while Redis is down
 *   DELETE /sessions/:id     signs out one other session → { id }   400 CURRENT_SESSION · 404 · 503 SESSIONS_UNAVAILABLE
 *   DELETE /sessions         signs out all other sessions → { signedOutSessions }
 *   (the two DELETE /sessions routes: 30 requests / 10 min per user)
 *   GET    /preferences      → PreferencesDto { inApp: { activity_reminder, activity_assigned, activity_invited,
 *                              contract_renewal }, morningSummaryEmail, defaultReminder, outOfOffice: { from, to, message,
 *                              active } | null, onLeave, email, mail: { summaryEnabled, mailEnabled }, updatedAt }
 *   PATCH  /preferences      { inApp?: { <kind>?: boolean }, morningSummaryEmail?, defaultReminder?: <reminder> | 'none' |
 *                              null, outOfOffice?: { from, to, message? } | null } (other keys refused) → PreferencesDto
 *                              400 VALIDATION_ERROR (path ['outOfOffice', 'from' | 'to' | 'message'] for the date rules)
 *
 * Changing the password is POST /api/auth/change-password; photos are served by GET /api/user-photos/:id.
 */
const router = Router();
router.use(authenticate);

const sessionRevokeLimiter = createRateLimiter({
    keyPrefix: 'ratelimit:session-revoke',
    max: 30,
    windowSeconds: 10 * 60,
    keyGenerator: (req: Request) => (req.user ? `user:${req.user.id}` : `ip:${req.ip ?? 'unknown'}`),
    message: 'Too many sign-out requests. Please wait a few minutes.',
});

function requireSession(req: Request): AuthSession {
    if (!req.auth) throw HttpError.unauthorized();
    return req.auth;
}

router.get('/profile', async (req: Request, res: Response) => {
    sendSuccess(res, await profileService.get(requireUser(req)));
});

router.patch('/profile', validateRequest({ body: profileUpdateSchema }), async (req: Request, res: Response) => {
    sendSuccess(res, await profileService.update(requireUser(req), req.body as ProfileUpdateInput), 'Profile updated');
});

router.put('/photo', validateRequest({ body: photoUploadSchema }), async (req: Request, res: Response) => {
    sendSuccess(res, await profileService.setPhoto(requireUser(req), req.body as PhotoUploadInput), 'Photo updated');
});

router.delete('/photo', async (req: Request, res: Response) => {
    sendSuccess(res, await profileService.removePhoto(requireUser(req)), 'Photo removed');
});

router.get('/preferences', async (req: Request, res: Response) => {
    sendSuccess(res, await preferencesService.get(requireUser(req)));
});

router.patch('/preferences', validateRequest({ body: preferencesPatchSchema }), async (req: Request, res: Response) => {
    sendSuccess(res, await preferencesService.update(requireUser(req), req.body as PreferencesPatch), 'Preferences saved');
});

router.get('/sessions', async (req: Request, res: Response) => {
    sendSuccess(res, await profileService.sessions(requireUser(req), requireSession(req)));
});

router.delete('/sessions/:id', sessionRevokeLimiter, validateRequest({ params: sessionIdParamSchema }), async (req: Request, res: Response) => {
    const id = String(req.params.id);
    await profileService.revokeSession(requireUser(req), requireSession(req), id);
    sendSuccess(res, { id }, 'Session signed out');
});

router.delete('/sessions', sessionRevokeLimiter, async (req: Request, res: Response) => {
    sendSuccess(res, await profileService.revokeOtherSessions(requireUser(req), requireSession(req)), 'Other sessions signed out');
});

export default router;
