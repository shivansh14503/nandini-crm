import type { Request, Response } from 'express';
import { sendSuccess } from '../../utils/apiResponse.js';
import { requireUser } from '../../utils/requestContext.js';
import { createCrudController } from '../shared/crud.js';
import { convertLead } from './lead.conversion.js';
import { leadService } from './lead.service.js';

export const leadController = {
    ...createCrudController(leadService, { singular: 'Lead', plural: 'leads' }),

    async convert(req: Request, res: Response): Promise<void> {
        const result = await convertLead(String(req.params.id), req.body, requireUser(req));
        sendSuccess(res, result, `Lead converted to opportunity ${result.opportunity.opportunityCode}`);
    },
};
