import type { Request, Response } from 'express';
import { sendSuccess } from '../../utils/apiResponse.js';
import { requireUser } from '../../utils/requestContext.js';
import { createCrudController } from '../shared/crud.js';
import { activityService } from './activity.service.js';

export const activityController = {
    ...createCrudController(activityService, { singular: 'Activity', plural: 'activities' }),

    async meta(_req: Request, res: Response): Promise<void> {
        sendSuccess(res, await activityService.meta());
    },

    async calendar(req: Request, res: Response): Promise<void> {
        sendSuccess(res, await activityService.calendar(req.query, requireUser(req)));
    },

    async linkTargets(req: Request, res: Response): Promise<void> {
        sendSuccess(res, await activityService.linkTargets(req.query, requireUser(req)));
    },

    async respond(req: Request, res: Response): Promise<void> {
        sendSuccess(res, await activityService.respond(String(req.params.id), req.body, requireUser(req)), 'Reply saved');
    },
};
