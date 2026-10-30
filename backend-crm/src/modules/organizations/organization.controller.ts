import type { Request, Response } from 'express';
import { sendSuccess } from '../../utils/apiResponse.js';
import { requireUser } from '../../utils/requestContext.js';
import { createCrudController } from '../shared/crud.js';
import { organizationService } from './organization.service.js';

export const organizationController = {
    ...createCrudController(organizationService, { singular: 'Organization', plural: 'organizations' }),

    async updateStatusBulk(req: Request, res: Response): Promise<void> {
        const updated = await organizationService.updateStatusBulk(req.body, requireUser(req));
        sendSuccess(res, updated, `${updated.length} organization${updated.length === 1 ? '' : 's'} updated`);
    },
};
