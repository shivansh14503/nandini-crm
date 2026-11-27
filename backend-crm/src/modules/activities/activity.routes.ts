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
 *                           409 VIDEO_MEETING_LOCKED. A meeting organized outside the CRM (externalOrganizer, P2-8)
 *                           refuses a change to subject, start / end / all-day, location, attendees, owner or
 *                           videoMeeting with 409 EXTERNAL_EVENT_LOCKED (its pulled join link still shows)
 *   DELETE /:id           (soft delete; a follow-up activity: 409 FOLLOW_UP_ACTIVITY_LOCKED; an imported meeting is
 *                           removed from the CRM only: its calendar links detach, syncKey kept, the event stays)
 *   POST   /bulk-delete   { ids } → { deleted, ids, notFound, skipped?: [{ id, reason }] } (follow-up activities skipped)
 *   POST   /:id/response  { responseStatus: accepted | tentative | declined } (invited colleagues, and the owner of an
 *                           externalOrganizer meeting holding the invitation in their synced calendar, whose Decline
 *                           cancels it and Accept / Maybe revive it; audited RSVP; 403 otherwise). P2-8:
 *                           queues an `rsvp` job that sends the reply to the person's calendar copy when both import
 *                           switches are on for them
 *   POST   /:id/conference/retry → activity view: asks the calendar again for a video link that failed (owner, creator
 *                           or a global role; 409 NOTHING_TO_RETRY unless it failed, 409 VIDEO_PROVIDER_NOT_CONNECTED)
 *   POST   /:id/calendar-sync/retry        (owner or editor; Calendar Phase 2 P2-3c) → activity view. Pushes the copy in
 *                           the owner's calendar again now (attempts reset; a refused push goes back to pending). For an
 *                           event deleted in the calendar (`removed_remote`) it is "Add again": a new copy, upcoming
 *                           planned activities only
 *   POST   /:id/calendar-sync/send-invites (owner only, 403 otherwise: invitations leave a mailbox only on its owner's
 *                           action) → activity view. Sends the invitations of a private copy and every held guest:
 *                           invites='send', held guests released, pushed now (an outside guest also clears the internal
 *                           description in the same calendar request). Audited SEND_INVITES. Nothing held: unchanged
 *                           Both: 409 CALENDAR_NOT_SYNCED (no copy in the owner's calendar), 409
 *                           CALENDAR_SYNC_NOT_RETRYABLE (a repeating series in the calendar; Add again on an activity
 *                           that is no longer upcoming and planned), 503 CALENDAR_SYNC_DISABLED (kill switch off)
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
router.post('/:id/calendar-sync/retry', validateRequest({ params: idParamSchema }), activityController.retryCalendarSync);
router.post('/:id/calendar-sync/send-invites', validateRequest({ params: idParamSchema }), activityController.sendCalendarInvites);
registerCrudRoutes(router, activityController);

export default router;
