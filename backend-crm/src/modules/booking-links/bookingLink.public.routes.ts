import express, { Router, type NextFunction, type Request, type Response } from 'express';
import { normalizeIp } from '../../services/auditContext.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { HttpError } from '../../utils/httpError.js';
import { bookingPublicService } from './bookingLink.public.js';
import { bookingLimiters } from './bookingLink.rateLimit.js';
import { SLUG_PATTERN } from './bookingLink.validator.js';

/**
 * /api/public/booking: the public booking page's API (Calendar Phase 4). **No sign-in**: mounted on its own, before the
 * app's global body parser, with a 16 KB JSON limit. Every answer is `Cache-Control: no-store` and `X-Robots-Tag:
 * noindex`. CORS, helmet and CSP are the app's (the page is served from the app's own origin). Rate limits per IP and
 * per link (Redis; in process when Redis can't count, never unlimited). A slug that isn't well-formed gets the same
 * 404 as a missing link, before any read.
 *
 *   GET  /:slug        → PublicLinkDto { slug, title, ownerName, typeLabel, durations, defaultDuration, location, note,
 *                        askPhone, askCompany, timeZone, firstDay, lastDay }                         60 / min / IP
 *   GET  /:slug/slots  ?from=YYYY-MM-DD&days=1..14 (7)&duration=<offered minutes>
 *                      → { timeZone, duration, days: [{ date, slots: [{ start, token }] }], firstDay, lastDay, prevFrom,
 *                          nextFrom }                                  60 / min / IP, 600 / min / link
 *                        503 CALENDAR_UNAVAILABLE when the owner's company calendar can't be read now.
 *   POST /:slug/book   { token, name, email, phone?, company?, message?, website (honeypot, must be empty) }
 *                      → 201 { booking: { id, title, typeLabel, ownerName, start, end, durationMinutes, timeZone,
 *                          location }, ics }                           10 / hour / IP, 30 / hour / link
 *                        409 SLOT_UNAVAILABLE (taken, expired or edited link), 409 BOOKING_DAY_FULL, 400 BOOKING_REJECTED
 *                        (honeypot), 400 VALIDATION_ERROR, 503 CALENDAR_UNAVAILABLE.
 * Every route: 404 NOT_FOUND (one message) for a missing, turned-off or unusable link or when booking links are off;
 * 429 RATE_LIMITED.
 */
const router = Router();

router.use(express.json({ limit: '16kb' }));
router.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    next();
});

/** A malformed slug is the same 404 as a missing link (no read, no hint). */
function checkSlug(req: Request, _res: Response, next: NextFunction): void {
    if (!SLUG_PATTERN.test(String(req.params.slug ?? ''))) return next(HttpError.notFound('This booking page doesn’t exist or is no longer available.'));
    next();
}

const slugOf = (req: Request) => String(req.params.slug);

router.get('/:slug', bookingLimiters.view, checkSlug, async (req: Request, res: Response) => {
    sendSuccess(res, await bookingPublicService.view(slugOf(req)));
});

router.get('/:slug/slots', bookingLimiters.slotsPerIp, bookingLimiters.slotsPerLink, checkSlug, async (req: Request, res: Response) => {
    sendSuccess(res, await bookingPublicService.slots(slugOf(req), req.query));
});

router.post('/:slug/book', bookingLimiters.bookPerIp, bookingLimiters.bookPerLink, checkSlug, async (req: Request, res: Response) => {
    const result = await bookingPublicService.book(slugOf(req), req.body, {
        requestId: (req as Request & { id?: string }).id,
        ipAddress: normalizeIp(req.ip),
        userAgent: req.get('user-agent')?.slice(0, 400),
    });
    sendSuccess(res, result, 'Booked', 201);
});

export default router;
