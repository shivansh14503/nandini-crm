import { Router } from 'express';
import { authenticate } from '../../middlewares/authMiddleware.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import { idParamSchema } from '../../validators/common.js';
import { registerCrudRoutes } from '../shared/crud.js';
import { busyLimiter } from '../calendar-sync/busy.rateLimit.js';
import { activityController } from './activity.controller.js';

/**
 * /api/activities (calls, meetings, tasks, notes … linked to at most one CRM record; docs/api-plan.md › Activities)
 *   GET    /meta          → { timeZone, now, relatedModules, durationMinutes, fallbackDurationMinutes, reminders,
 *                             statuses, maxDurationDays }
 *   GET    /calendar      ?from&to (instants with a zone, to exclusive, at most 62 days)&users&types&sources&status
 *                           → { timeZone, from, to, truncated, items: CalendarItem[] } (activities, lead / opportunity
 *                           follow-ups, contract renewal reminders). Follow-up activities (origin 'followup') come
 *                           under the leadFollowup / opportunityFollowup sources with activityId and editable false;
 *                           a record whose open follow-up activity the caller can see isn't listed again as a derived
 *                           follow-up (switch `followUpActivities` off: Phase 1 feed)
 *   GET    /busy          ?users (csv, 1–20 usernames)&from&to (instants with a zone, to exclusive, at most 31 days)
 *                           &exclude (activity id)&suggest (minutes, 5–1440) → { timeZone, from, to, generatedAt,
 *                           people: [{ username, name, provider, status, sources, busy: [{ start, end, kind }] }],
 *                           suggestion? } — colleagues' busy times while picking a time (Calendar Phase 2, P2-6):
 *                           CRM activities plus their company calendar's free/busy, times only (no titles, any
 *                           signed-in user, any active colleague). 60 / min per user (429 RATE_LIMITED)
 *   GET    /link-targets  ?module&search&limit → records of one module the caller can link to
 *   GET    /video-options ?owner (username; default the caller) → { owner, calendarProvider, options: [{ value: meet |
 *                           teams | zoom, label, available, reason? }] } — the Video meeting choices the owner's company
 *                           calendar allows (Calendar Phase 3, P3-1: Google → Meet, Microsoft 365 → Teams, Zoom later)
 *   GET    /              ?page&limit&search&sortBy&sortOrder&followupType&status&excludeStatus&assignedTo&mine
 *                           &attending&relatedModule&relatedId&organizationId&contactId&rollup&from&to&overdue
 *                           &createdWithinDays
 *   GET    /:id           → activity (incl. origin, videoMeeting, conferenceJoinUrl) + viewer { canEdit, myResponse } +
 *                           lockedFields + calendar + conference { provider, state, joinUrl, errorCode, errorMessage,
 *                           canRetry, locked } | null
 *   POST   /              timed: startAt / endAt instants; all-day: allDay true + startDay / endDay (inclusive days).
 *                           videoMeeting meet | teams | '' (P3-1): 400 VALIDATION_ERROR when not Planned or the type
 *                           doesn't offer it; 409 VIDEO_PROVIDER_NOT_CONNECTED when the owner's company calendar can't
 *                           create that kind of link (zoom: always, until P3-2)
 *   PUT    /:id           (partial; PATCH is an alias; owner, creator or a global role only). A lead / opportunity
 *                           follow-up activity (origin 'followup') refuses a change to a locked field (lockedFields:
 *                           type, start / end / all-day, status, owner, related record) with 409
 *                           FOLLOW_UP_ACTIVITY_LOCKED; it changes with its record (Record a follow-up). videoMeeting as
 *                           on POST (also checked on an owner change); a ready Teams link can't be removed or changed:
 *                           409 VIDEO_MEETING_LOCKED
 *   DELETE /:id           (soft delete; a follow-up activity: 409 FOLLOW_UP_ACTIVITY_LOCKED)
 *   POST   /bulk-delete   { ids } → { deleted, ids, notFound, skipped?: [{ id, reason }] } (follow-up activities skipped)
 *   POST   /:id/response  { responseStatus: accepted | tentative | declined } (invited colleagues only; audited RSVP)
 *   POST   /:id/conference/retry → activity view: asks the calendar again for a video link that failed (owner, creator
 *                           or a global role; 409 NOTHING_TO_RETRY unless it failed, 409 VIDEO_PROVIDER_NOT_CONNECTED)
 */
const router = Router();
router.use(authenticate);

// Before the CRUD routes so these paths aren't captured by `/:id`.
router.get('/meta', activityController.meta);
router.get('/calendar', activityController.calendar);
router.get('/busy', busyLimiter, activityController.busy);
router.get('/link-targets', activityController.linkTargets);
router.get('/video-options', activityController.videoOptions);
router.post('/:id/response', validateRequest({ params: idParamSchema }), activityController.respond);
router.post('/:id/conference/retry', validateRequest({ params: idParamSchema }), activityController.retryConference);
registerCrudRoutes(router, activityController);

export default router;
