import { createCrudController } from '../shared/crud.js';
import { referralService } from './referral.service.js';

export const referralController = createCrudController(referralService, { singular: 'Referral', plural: 'referrals' });
