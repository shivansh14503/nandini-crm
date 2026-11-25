/**
 * Lead Source follow-up fields on the Lead, Opportunity and Convert Lead forms: Referred By for CA / Reference, the
 * Partner Company (an organization whose Customer Type is Partner) for Partner. Dependency-free, so the backend's contract test loads it.
 */

/**
 * Lead Source options (shared_lead_source) that ask who referred the record: Referred By is shown, and required, for
 * them on the Lead, Opportunity and Convert Lead forms. Mirrors backend-crm/src/modules/shared/leadSource.ts
 * (contractSync.test.ts checks they agree).
 */
export const REFERRED_BY_LEAD_SOURCES = ['CA', 'Reference'] as const;

/** The Lead Source option whose records name their Partner Company (an organization whose Customer Type is Partner). */
export const PARTNER_LEAD_SOURCE = 'Partner';

const sameOption = (value: string | null | undefined, option: string) => (value ?? '').trim().toLowerCase() === option.toLowerCase();

/** Whether a Lead Source asks for Referred By (CA, Reference). */
export const leadSourceNeedsReferredBy = (leadSource?: string | null): boolean => REFERRED_BY_LEAD_SOURCES.some((option) => sameOption(leadSource, option));

/** Whether a Lead Source is Partner, so the record names its Partner Company. */
export const isPartnerLeadSource = (leadSource?: string | null): boolean => sameOption(leadSource, PARTNER_LEAD_SOURCE);

/**
 * The missing follow-up field of a Lead Source: Referred By for CA / Reference, Partner Company for Partner. `paths`
 * renames the fields (Convert Lead names the opportunity's Partner Company differently).
 */
export function leadSourceDetailIssues(
    values: { leadSource?: string | null; referredBy?: string | null; partnerCompany?: string | null },
    paths: { referredBy?: string; partnerCompany?: string } = {},
): { path: string; message: string }[] {
    const source = values.leadSource?.trim() ?? '';
    const issues: { path: string; message: string }[] = [];
    if (leadSourceNeedsReferredBy(source) && !values.referredBy?.trim()) {
        issues.push({ path: paths.referredBy ?? 'referredBy', message: `Referred By is required when Lead Source is ${source}.` });
    }
    if (isPartnerLeadSource(source) && !values.partnerCompany?.trim()) {
        issues.push({ path: paths.partnerCompany ?? 'partnerCompany', message: `Partner Company is required when Lead Source is ${source}.` });
    }
    return issues;
}
