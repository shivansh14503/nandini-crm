import { Router } from 'express';
import { authenticate } from '../../middlewares/authMiddleware.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import { idParamSchema } from '../../validators/common.js';
import { registerCrudRoutes } from '../shared/crud.js';
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
 *   GET    /link-targets  ?module&search&limit → records of one module the caller can link to
 *   GET    /              ?page&limit&search&sortBy&sortOrder&followupType&status&excludeStatus&assignedTo&mine
 *                           &attending&relatedModule&relatedId&organizationId&contactId&rollup&from&to&overdue
 *                           &createdWithinDays
 *   GET    /:id           → activity (incl. origin) + viewer { canEdit, myResponse } + lockedFields
 *   POST   /              timed: startAt / endAt instants; all-day: allDay true + startDay / endDay (inclusive days)
 *   PUT    /:id           (partial; PATCH is an alias; owner, creator or a global role only). A lead / opportunity
 *                           follow-up activity (origin 'followup') refuses a change to a locked field (lockedFields:
 *                           type, start / end / all-day, status, owner, related record) with 409
 *                           FOLLOW_UP_ACTIVITY_LOCKED; it changes with its record (Record a follow-up)
 *   DELETE /:id           (soft delete; a follow-up activity: 409 FOLLOW_UP_ACTIVITY_LOCKED)
 *   POST   /bulk-delete   { ids } → { deleted, ids, notFound, skipped?: [{ id, reason }] } (follow-up activities skipped)
 *   POST   /:id/response  { responseStatus: accepted | tentative | declined } (invited colleagues only; audited RSVP)
 */
const router = Router();
router.use(authenticate);

// Before the CRUD routes so these paths aren't captured by `/:id`.
router.get('/meta', activityController.meta);
router.get('/calendar', activityController.calendar);
router.get('/link-targets', activityController.linkTargets);
router.post('/:id/response', validateRequest({ params: idParamSchema }), activityController.respond);
registerCrudRoutes(router, activityController);

export default router;
