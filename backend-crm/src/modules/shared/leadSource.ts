import { HttpError, type ApiFieldError } from '../../utils/httpError.js';

/**
 * Lead Source options (shared_lead_source) that ask who referred the record: Referred By is shown, and required,
 * for them on the Lead, Opportunity and Convert Lead forms. System options (the rules depend on them).
 */
export const REFERRED_BY_LEAD_SOURCES = ['CA', 'Reference'] as const;

/** The Lead Source option whose records give the partner's Nature of Partner (the shared partner_nature list). */
export const PARTNER_LEAD_SOURCE = 'Partner';

const same = (value: string | null | undefined, option: string) => (value ?? '').trim().toLowerCase() === option.toLowerCase();

/** Whether a Lead Source asks for Referred By (CA, Reference). Mirrors frontend-crm/src/config/constants.ts. */
export function leadSourceNeedsReferredBy(leadSource?: string | null): boolean {
    return REFERRED_BY_LEAD_SOURCES.some((option) => same(leadSource, option));
}

/** Whether a Lead Source is Partner, so the record gives its Nature of Partner. Mirrors frontend-crm/src/config/constants.ts. */
export function isPartnerLeadSource(leadSource?: string | null): boolean {
    return same(leadSource, PARTNER_LEAD_SOURCE);
}

export interface LeadSourceDetails {
    leadSource?: string | null;
    referredBy?: string | null;
    natureOfPartner?: string | null;
}

/**
 * The missing follow-up fields of a Lead Source, as field issues: Referred By for CA / Reference, Nature of Partner
 * for Partner. `paths` renames the fields (Convert Lead names the opportunity's Nature of Partner differently).
 */
export function leadSourceDetailIssues(record: LeadSourceDetails, paths: { referredBy?: string; natureOfPartner?: string } = {}): ApiFieldError[] {
    const issues: ApiFieldError[] = [];
    const source = record.leadSource?.trim() ?? '';
    if (leadSourceNeedsReferredBy(source) && !record.referredBy?.trim()) {
        issues.push({ message: `Referred By is required when Lead Source is ${source}.`, path: [paths.referredBy ?? 'referredBy'] });
    }
    if (isPartnerLeadSource(source) && !record.natureOfPartner?.trim()) {
        issues.push({ message: `Nature of Partner is required when Lead Source is ${source}.`, path: [paths.natureOfPartner ?? 'natureOfPartner'] });
    }
    return issues;
}

/** Refuses a lead or opportunity missing the field its Lead Source asks for (400, on that field). */
export function assertLeadSourceDetails(record: LeadSourceDetails): void {
    const issues = leadSourceDetailIssues(record);
    if (issues.length > 0) throw HttpError.badRequest(issues[0].message, issues);
}

/** The Nature of Partner to store: kept only for Lead Source Partner. */
export function natureOfPartnerFor(record: LeadSourceDetails): string | null {
    return isPartnerLeadSource(record.leadSource) ? record.natureOfPartner?.trim() || null : null;
}

/** The fields whose change re-checks the rule on an edit (a stored legacy record isn't refused for other edits). */
export const LEAD_SOURCE_DETAIL_KEYS = ['leadSource', 'referredBy', 'natureOfPartner'] as const;
