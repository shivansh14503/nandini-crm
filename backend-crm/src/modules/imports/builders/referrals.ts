import type { TransactionClient } from '../../../config/prisma.js';
import type { AuthUser } from '../../../types/user.types.js';
import type { ModuleFieldConfig } from '../../form-configs/customFieldValidator.js';
import type { ReferralDto } from '../../referrals/referral.mapper.js';
import { createReferralRecord } from '../../referrals/referral.service.js';
import { referralInputSchema } from '../../referrals/referral.validator.js';
import type { PrefetchedLookups } from '../../shared/prefetch.js';
import { buildImportPayload } from '../importValues.js';
import { referralImportRaw } from './referrals.values.js';

/**
 * Bulk import of referrals (POST /api/import/referrals). One spreadsheet row is one referral, made the way Referrals ›
 * New does (ReferralForm):
 *
 * - Every active field of the referral form can be imported (Form Builder configuration, custom fields included):
 *   Name, Mobile, Office Phone, Company Name, Status, Email Address (several split by commas / semicolons; the first
 *   is primary), Designation, Department, Assigned to. A referral links to no other record; Company Name is free text.
 * - Blank cells take what the form pre-fills: Status = Active, Assigned to = the importing user
 *   (REFERRAL_IMPORT_DEFAULTS in referrals.values.ts).
 * - The row is checked with the create API's rules: `referralInputSchema`, the admin's form rules (required fields,
 *   formats, options) and, inside the write, a Mobile already used by a live referral (an earlier row of the same file
 *   included) and an Assigned to that is not an active user.
 *
 * The record is saved with createReferralRecord, as the create API does (mobile lock and uniqueness, Assigned to
 * check, emails, CREATE audit entry). Referrals send no notifications; the processor invalidates the referral caches
 * (lists and the Referred By picker) once after the rows. Like the other imports with email rows (contacts, leads,
 * organizations), the per-address deliverability check and the background email verification of the form's save are
 * not run for imported rows: an admin re-checks them in Settings › Email Validation.
 */

/** Per-import data of a referrals import, loaded once before the row loop. */
export interface ReferralImportContext {
    fieldConfig: ModuleFieldConfig;
    lookups: PrefetchedLookups;
}

type CheckRow = (raw: Record<string, unknown>, customFields: Record<string, unknown>) => Record<string, unknown>;

/**
 * Reads, defaults and validates one referral row, and returns its write. Throws (failing only this row) when a cell
 * can't be read or the referral breaks a form rule.
 */
export function buildReferralImportRow(
    values: Record<string, string>,
    user: AuthUser,
    ctx: ReferralImportContext,
    checkRow: CheckRow,
): (tx: TransactionClient) => Promise<ReferralDto> {
    const { payload, customFields } = buildImportPayload(ctx.fieldConfig, values);
    const raw = referralImportRaw(payload, customFields, user.username);
    const input = referralInputSchema.parse(raw);
    input.customFields = checkRow(raw, customFields);
    return (tx) => createReferralRecord(tx, input, user, ctx.lookups);
}
