import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import type { z } from 'zod';
import { sendSuccess } from '../../utils/apiResponse.js';
import { requireUser } from '../../utils/requestContext.js';
import { assertPermission, type PermissionModule } from '../shared/accessControl.js';
import type { ImportEntity } from './import.processor.js';
import { importService, type importBodySchema } from './import.service.js';

/** The Admin › Roles module each import entity fills. */
const IMPORT_PERMISSION_MODULE: Record<ImportEntity, PermissionModule> = {
    organizations: 'organizations',
    contacts: 'contacts',
    products: 'products',
    leads: 'leads',
    opportunities: 'opportunities',
    tickets: 'tickets',
    'partner-companies': 'partnerCompanies',
    quotations: 'quotations',
    contracts: 'contracts',
    referrals: 'referrals',
    activities: 'activities',
};

export const importController = {
    /** POST /api/import/:entity → 202 { status: 'queued', importId } or 200 { status: 'completed', result }. */
    async start(req: Request, res: Response): Promise<void> {
        const entity = req.params.entity as ImportEntity;
        const user = requireUser(req);
        // Admin › Roles: the module's Import permission (and Create: an import adds records).
        assertPermission(user, IMPORT_PERMISSION_MODULE[entity], 'import');
        assertPermission(user, IMPORT_PERMISSION_MODULE[entity], 'create');
        const outcome = await importService.start(entity, req.body as z.infer<typeof importBodySchema>, user);
        if (outcome.status === 'queued') {
            sendSuccess(res, outcome, `Import of ${outcome.total} rows queued`, StatusCodes.ACCEPTED);
        } else {
            const { created, failed } = outcome.result;
            sendSuccess(res, outcome, `Imported ${created} of ${outcome.result.total} rows${failed.length ? ` (${failed.length} failed)` : ''}`);
        }
    },

    /** GET /api/import/jobs/:importId */
    async status(req: Request, res: Response): Promise<void> {
        sendSuccess(res, await importService.status(String(req.params.importId), requireUser(req)));
    },

    /** POST /api/import/jobs/:importId/cancel */
    async cancel(req: Request, res: Response): Promise<void> {
        const status = await importService.cancel(String(req.params.importId), requireUser(req));
        sendSuccess(res, status, status.state === 'cancelled' ? 'Import cancelled' : 'Cancelling import');
    },
};
