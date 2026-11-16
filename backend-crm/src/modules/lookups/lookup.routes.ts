import { Router, type Request, type Response } from 'express';
import { authenticate } from '../../middlewares/authMiddleware.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { prisma } from '../../config/prisma.js';
import { formConfigService } from '../form-configs/formConfig.service.js';
import { findTaxIdHolders } from '../shared/taxIdentifiers.js';
import { lookupService, taxIdHoldersQuerySchema } from './lookup.service.js';

/**
 * /api/lookups (all cached in Redis)
 *   GET /users               ?includeInactive         → CrmUser[]
 *   GET /organizations       ?search&limit            → compact organizations
 *   GET /contacts            ?search&limit&organizationId
 *   GET /products            ?search&limit&category   (active products)
 *   GET /nature-of-calls                              → NatureOfCallItem[]
 *   GET /partner-companies                            → PartnerCompany[]
 *   GET /partner-contacts    ?partnerCompany          → PartnerCompanyContact[]
 *   GET /address-master      ?country=IN              → { countries, subdivisions }
 *   GET /form-configs        ?includeInactive         → { categories, fieldsByModule, moduleTabs }
 *   GET /tax-id-holders      ?owner&gstNo&panNumber&excludeId → TaxIdHolder[] (live, never cached)
 */
const router = Router();
router.use(authenticate);

const handler = (load: (query: unknown) => Promise<unknown>) => async (req: Request, res: Response) => {
    sendSuccess(res, await load(req.query));
};

router.get('/users', handler((q) => lookupService.users(q)));
router.get('/organizations', handler((q) => lookupService.organizations(q)));
router.get('/contacts', handler((q) => lookupService.contacts(q)));
router.get('/products', handler((q) => lookupService.products(q)));
router.get('/nature-of-calls', handler(() => lookupService.natureOfCalls()));
router.get('/partner-companies', handler(() => lookupService.partnerCompanies()));
router.get('/partner-contacts', handler((q) => lookupService.partnerContacts(q)));
router.get('/address-master', handler((q) => lookupService.addressMaster(q)));
router.get('/form-configs', handler((q) => formConfigService.getConfigs(q)));
// Not cached: a form asks "is this GSTIN / PAN taken?" right after typing it and needs the live answer.
router.get(
    '/tax-id-holders',
    handler((q) => {
        const { owner, gstNo, panNumber, excludeId } = taxIdHoldersQuerySchema.parse(q ?? {});
        return findTaxIdHolders(prisma, owner, { gstNo, panNumber }, excludeId);
    })
);

export default router;
