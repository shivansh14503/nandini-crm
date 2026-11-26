import type { Request, Response } from 'express';
import { sendSuccess } from '../../utils/apiResponse.js';
import { requireUser } from '../../utils/requestContext.js';
import { createCrudController } from '../shared/crud.js';
import { busyService } from '../calendar-sync/busy.service.js';
import { calendarSyncActions } from '../calendar-sync/sync.actions.js';
import { activityService } from './activity.service.js';

export const activityController = {
    ...createCrudController(activityService, { singular: 'Activity', plural: 'activities' }),

    async meta(_req: Request, res: Response): Promise<void> {
        sendSuccess(res, await activityService.meta());
    },

    async calendar(req: Request, res: Response): Promise<void> {
        sendSuccess(res, await activityService.calendar(req.query, requireUser(req)));
    },

    /** Busy times (P2-6). Personal calendar data, even as times only: never cached by the browser or a proxy. */
    async busy(req: Request, res: Response): Promise<void> {
        res.setHeader('Cache-Control', 'no-store');
        sendSuccess(res, await busyService.busy(req.query, requireUser(req)));
    },

    async linkTargets(req: Request, res: Response): Promise<void> {
        sendSuccess(res, await activityService.linkTargets(req.query, requireUser(req)));
    },

    async respond(req: Request, res: Response): Promise<void> {
        sendSuccess(res, await activityService.respond(String(req.params.id), req.body, requireUser(req)), 'Reply saved');
    },

    /** Calendar Phase 2 P2-3c: push the owner's calendar copy again (Retry / Add again). */
    async retryCalendarSync(req: Request, res: Response): Promise<void> {
        sendSuccess(res, await calendarSyncActions.retry(String(req.params.id), requireUser(req)), 'Sending to the calendar');
    },

    /** Calendar Phase 2 P2-3c: the owner sends the held invitations. */
    async sendCalendarInvites(req: Request, res: Response): Promise<void> {
        sendSuccess(res, await calendarSyncActions.sendInvites(String(req.params.id), requireUser(req)), 'Invitations are on their way');
    },
};
