import { ACTIVE_REFERRAL_STATUS } from '../../referrals/referral.validator.js';

/**
 * Pure helpers of the referrals import (builders/referrals.ts): what a blank cell of a referral row becomes. A referral
 * links to no other record, so a row only needs the form's own fields.
 */

/**
 * Values a blank cell becomes, as Referrals › New pre-fills them (ReferralForm: Status "Active"; a blank Assigned to is
 * saved as the user who creates it). Mirrored by IMPORT_DEFAULTS.referrals in
 * frontend-crm/src/components/common/import/importFields.ts, which shows them on the mapping step.
 */
export const REFERRAL_IMPORT_DEFAULTS = {
    status: ACTIVE_REFERRAL_STATUS,
} as const;

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/**
 * The form-shaped referral of a row: its cells (read by `buildImportPayload`) with the blank Status and Assigned to
 * filled in. Assigned to defaults to `importer`, the importing user's username.
 */
export function referralImportRaw(
    payload: Record<string, unknown>,
    customFields: Record<string, unknown>,
    importer: string,
): Record<string, unknown> {
    return {
        ...payload,
        status: text(payload.status) || REFERRAL_IMPORT_DEFAULTS.status,
        assignedTo: text(payload.assignedTo) || importer,
        customFields,
    };
}
