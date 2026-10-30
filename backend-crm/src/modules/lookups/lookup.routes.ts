import { Router, type Request, type Response } from 'express';
import { authenticate } from '../../middlewares/authMiddleware.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { lookupService } from './lookup.service.js';

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

export default router;
