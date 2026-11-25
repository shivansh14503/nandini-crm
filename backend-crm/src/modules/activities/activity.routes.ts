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
 *                           follow-ups, contract renewal reminders)
 *   GET    /link-targets  ?module&search&limit → records of one module the caller can link to
 *   GET    /              ?page&limit&search&sortBy&sortOrder&followupType&status&excludeStatus&assignedTo&mine
 *                           &attending&relatedModule&relatedId&organizationId&contactId&rollup&from&to&overdue
 *                           &createdWithinDays
 *   GET    /:id           → activity + viewer { canEdit, myResponse }
 *   POST   /              timed: startAt / endAt instants; all-day: allDay true + startDay / endDay (inclusive days)
 *   PUT    /:id           (partial; PATCH is an alias; owner, creator or a global role only)
 *   DELETE /:id           (soft delete)
 *   POST   /bulk-delete   { ids }
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
