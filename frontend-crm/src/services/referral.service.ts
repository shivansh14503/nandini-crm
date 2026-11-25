import type { Referral, ReferralFormData } from '../types/referral.types';
import { createCrudService } from './base.service';

/** `/api/referrals` CRUD. Active referrals feed the Referred By picker on leads and opportunities. */
export const referralService = createCrudService<Referral, ReferralFormData, Partial<ReferralFormData>>('/api/referrals');
