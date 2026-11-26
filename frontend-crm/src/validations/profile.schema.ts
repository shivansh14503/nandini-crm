import { z } from 'zod';
import { FIELD_MAX_LENGTH as L } from '../config/fieldLimits';
import { formatPersonName } from '../utils/personName';
import { optionalText, requiredText, zodPhoneOptional } from './common';

/**
 * My Profile › Personal details. Mirrors backend `profile.validator.ts` (PATCH /api/me/profile): names in name case,
 * phones in E.164, '' clears the optional fields.
 */
export const profileSchema = z.object({
    firstName: requiredText('First Name', L.personName).transform(formatPersonName),
    lastName: optionalText('Last Name', L.personName).transform((v) => (v ? formatPersonName(v) : '')),
    mobile: zodPhoneOptional,
    officePhone: zodPhoneOptional,
});

/** Form values (what the inputs hold). */
export type ProfileFormData = z.input<typeof profileSchema>;
