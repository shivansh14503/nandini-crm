import { HttpError, type ApiFieldError } from '../../utils/httpError.js';

/**
 * Lead Source options (shared_lead_source) that ask who referred the record: Referred By is shown, and required,
 * for them on the Lead, Opportunity and Convert Lead forms. System options (the rules depend on them).
 */
export const REFERRED_BY_LEAD_SOURCES = ['CA', 'Reference'] as const;

/**
 * The Lead Source option whose records name their Partner Company: an organization whose Customer Type is Partner,
 * picked in the organization picker (opened with that filter), as the Organization form's Partner Company field was.
 */
export const PARTNER_LEAD_SOURCE = 'Partner';

const same = (value: string | null | undefined, option: string) => (value ?? '').trim().toLowerCase() === option.toLowerCase();

/** Whether a Lead Source asks for Referred By (CA, Reference). Mirrors frontend-crm/src/utils/leadSource.ts. */
export function leadSourceNeedsReferredBy(leadSource?: string | null): boolean {
    return REFERRED_BY_LEAD_SOURCES.some((option) => same(leadSource, option));
}

/** Whether a Lead Source is Partner, so the record gives its Partner Company. Mirrors frontend-crm/src/utils/leadSource.ts. */
export function isPartnerLeadSource(leadSource?: string | null): boolean {
    return same(leadSource, PARTNER_LEAD_SOURCE);
}

export interface LeadSourceDetails {
    leadSource?: string | null;
    referredBy?: string | null;
    partnerCompany?: string | null;
}

/**
 * The missing follow-up fields of a Lead Source, as field issues: Referred By for CA / Reference, Partner Company
 * for Partner. `paths` renames the fields (Convert Lead names the opportunity's Partner Company differently).
 */
export function leadSourceDetailIssues(record: LeadSourceDetails, paths: { referredBy?: string; partnerCompany?: string } = {}): ApiFieldError[] {
    const issues: ApiFieldError[] = [];
    const source = record.leadSource?.trim() ?? '';
    if (leadSourceNeedsReferredBy(source) && !record.referredBy?.trim()) {
        issues.push({ message: `Referred By is required when Lead Source is ${source}.`, path: [paths.referredBy ?? 'referredBy'] });
    }
    if (isPartnerLeadSource(source) && !record.partnerCompany?.trim()) {
        issues.push({ message: `Partner Company is required when Lead Source is ${source}.`, path: [paths.partnerCompany ?? 'partnerCompany'] });
    }
    return issues;
}

/** Refuses a lead or opportunity missing the field its Lead Source asks for (400, on that field). */
export function assertLeadSourceDetails(record: LeadSourceDetails): void {
    const issues = leadSourceDetailIssues(record);
    if (issues.length > 0) throw HttpError.badRequest(issues[0].message, issues);
}

/** The Partner Company to store: kept only for Lead Source Partner. */
export function partnerCompanyFor(record: LeadSourceDetails): string | null {
    return isPartnerLeadSource(record.leadSource) ? record.partnerCompany?.trim() || null : null;
}

/** The fields whose change re-checks the rule on an edit (a stored legacy record isn't refused for other edits). */
export const LEAD_SOURCE_DETAIL_KEYS = ['leadSource', 'referredBy', 'referredById', 'partnerCompany'] as const;
