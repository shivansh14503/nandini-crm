import { Router, type Request, type Response } from 'express';
import { authenticate, requireAdmin } from '../../middlewares/authMiddleware.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import { sendCreated, sendSuccess } from '../../utils/apiResponse.js';
import { requireUser } from '../../utils/requestContext.js';
import { bookingLinkService } from './bookingLink.service.js';
import { linkIdParamSchema } from './bookingLink.validator.js';

/**
 * /api/booking-links (Calendar Phase 4; signed in). A user's own booking links; admins also everyone's and the company
 * settings. The public page's API is bookingLink.public.routes.ts (/api/public/booking).
 *
 *   GET  /access             → { enabled, canCreate, isAdmin, whoCanCreate, ownsLinks } (the user menu shows "Booking
 *                              links" when enabled and (canCreate or isAdmin), or whenever ownsLinks)
 *   GET  /                   ?scope=mine|all (all: admins) → { access, links: BookingLinkDto[] }
 *   POST /                   { title, ownerUsername? (admins: a colleague), followupType?, durations?, slotStepMinutes?,
 *                              location?, videoMeeting? (meet | teams | null), note?, availability?, bufferBeforeMinutes?,
 *                              bufferAfterMinutes?, minNoticeMinutes?,
 *                              horizonDays?, maxPerDay?, reminder?, askPhone?, askCompany?, relatedModule?, relatedId?,
 *                              isActive? } → 201 BookingLinkDto (slug generated)
 *   PUT  /:id                any subset of the POST fields but ownerUsername → BookingLinkDto. `{ isActive: false }` works
 *                              even when booking links are off or the user's role may no longer create them.
 *   POST /:id/new-address    → BookingLinkDto with a new slug (the old address answers 404 at once)
 *   GET  /:id/bookings       → the latest 50 bookings [{ id, activityId, activityStatus, start, end, visitorName,
 *                              visitorEmail, visitorPhone, visitorCompany, contactId, createdAt }]
 *   GET  /settings           (admins) → { enabled, whoCanCreate }
 *   PUT  /settings           (admins) { enabled?, whoCanCreate? } → settings (ModuleSetting activities/bookingLinks, audited)
 * Owner or admin only; another user's link is 404. Errors: 409 BOOKING_LINKS_OFF, 403 BOOKING_LINKS_NOT_ALLOWED,
 * 409 BOOKING_LINK_LIMIT (20 per person), 400 VALIDATION_ERROR. videoMeeting (default video meeting of booked meetings):
 * 400 VALIDATION_ERROR when the type doesn't offer video (or Zoom / another value), 409 VIDEO_PROVIDER_NOT_CONNECTED when
 * the owner's company calendar can't create that kind of link (GET /api/activities/video-options?owner= lists it);
 * checked on create and when an update changes it or the type.
 */
const router = Router();
router.use(authenticate);

const admins = requireAdmin;

router.get('/access', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    sendSuccess(res, await bookingLinkService.access(requireUser(req)));
});

router.get('/settings', admins, async (_req: Request, res: Response) => {
    sendSuccess(res, await bookingLinkService.settings());
});

router.put('/settings', admins, async (req: Request, res: Response) => {
    sendSuccess(res, await bookingLinkService.saveSettings(req.body, requireUser(req)), 'Settings saved');
});

router.get('/', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    sendSuccess(res, await bookingLinkService.list(req.query, requireUser(req)));
});

router.post('/', async (req: Request, res: Response) => {
    sendCreated(res, await bookingLinkService.create(req.body, requireUser(req)), 'Booking link created');
});

router.put('/:id', validateRequest({ params: linkIdParamSchema }), async (req: Request, res: Response) => {
    sendSuccess(res, await bookingLinkService.update(String(req.params.id), req.body, requireUser(req)), 'Saved');
});

router.post('/:id/new-address', validateRequest({ params: linkIdParamSchema }), async (req: Request, res: Response) => {
    sendSuccess(res, await bookingLinkService.newAddress(String(req.params.id), requireUser(req)), 'New address made');
});

router.get('/:id/bookings', validateRequest({ params: linkIdParamSchema }), async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    sendSuccess(res, await bookingLinkService.bookings(String(req.params.id), requireUser(req)));
});

export default router;
