import { Router, type Request, type Response } from 'express';
import { authenticate } from '../../middlewares/authMiddleware.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { prisma } from '../../config/prisma.js';
import { formConfigService } from '../form-configs/formConfig.service.js';
import { findTaxIdHolders } from '../shared/taxIdentifiers.js';
import { lookupService, taxIdHoldersQuerySchema } from './lookup.service.js';
import { z } from 'zod';
import { checkEmailForForm } from '../email-verification/emailVerification.service.js';
import { createRateLimiter } from '../../middlewares/rateLimiter.js';

/**
 * /api/lookups (all cached in Redis)
 *   GET /users               ?includeInactive         → CrmUser[]
 *   GET /organizations       ?search&limit            → compact organizations
 *   GET /contacts            ?search&limit&organizationId
 *   GET /products            ?search&limit&productCategory   (active products)
 *   GET /nature-of-calls                              → NatureOfCallItem[]
 *   GET /partner-companies                            → PartnerCompany[]
 *   GET /partner-contacts    ?partnerCompany          → PartnerCompanyContact[]
 *   GET /address-master      ?country=IN              → { countries, subdivisions }
 *   GET /cities              ?country=IN&state=IN-DL&search&limit → CityLookupDto[] (searches not cached)
 *   GET /form-configs        ?includeInactive         → { categories, fieldsByModule, moduleTabs }
 *   GET /tax-id-holders      ?owner&gstNumber&panNumber&excludeId → TaxIdHolder[] (live, never cached)
 *   GET /email-check         ?email                   → EmailCheckResult (stored result of an address already saved on any record, else free checks + mailbox check; rate limited)
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
router.get('/cities', handler((q) => lookupService.cities(q)));
router.get('/form-configs', handler((q) => formConfigService.getConfigs(q)));
// Not cached: a form asks "is this GSTIN / PAN taken?" right after typing it and needs the live answer.
router.get(
    '/tax-id-holders',
    handler((q) => {
        const { owner, gstNumber, panNumber, excludeId } = taxIdHoldersQuerySchema.parse(q ?? {});
        return findTaxIdHolders(prisma, owner, { gstNumber, panNumber }, excludeId);
    })
);
// Run when a form's email field loses focus: an address already saved on any record returns its stored result;
// otherwise free checks, then the mailbox check. Limited per user so a stuck form can't drain the quota.
const emailCheckQuerySchema = z.object({ email: z.string().trim().min(1).max(254) });
const emailCheckLimiter = createRateLimiter({
    keyPrefix: 'ratelimit:email-check',
    max: 60,
    windowSeconds: 10 * 60,
    keyGenerator: (req: Request) => (req.user ? `user:${req.user.id}` : `ip:${req.ip ?? 'unknown'}`),
    message: 'Too many email checks. Please wait a few minutes.',
});
router.get(
    '/email-check',
    emailCheckLimiter,
    handler((q) => checkEmailForForm(emailCheckQuerySchema.parse(q ?? {}).email))
);

export default router;
