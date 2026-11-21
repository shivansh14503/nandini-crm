import { useMemo } from 'react';
import { useFormConfigs } from '@/hooks/queries/useFormConfigs';
import type { DropdownCategoryDto, FormConfigsPayload } from '@/types/formConfig.types';
import { findCategory, moduleFields } from '@/utils/formConfig';

/**
 * A lead's Rating (Hot / Warm / Cold) and the rules an admin sets for it (Form Builder › Leads › Rating Rules).
 * The server works the Rating out (backend-crm/src/modules/leads/lead.rating.ts); this mirrors the rule shapes for
 * the builder and for the lead form's hints. docs/lead-rating-rules.md
 */

export const RATINGS = ['Hot', 'Warm', 'Cold'] as const;
export type Rating = (typeof RATINGS)[number];

export const RATING_RULE_KINDS = ['followUpGap', 'daysSinceResponse', 'unansweredCalls', 'always'] as const;
export type RatingRuleKind = (typeof RATING_RULE_KINDS)[number];
export type RangedRuleKind = Exclude<RatingRuleKind, 'always'>;

/** Hot up to `hot` (null = Off); Warm up to `warm` ('noLimit' = never Cold, null = Off); Cold after. */
export interface RatingLimits {
    hot: number | null;
    warm: number | 'noLimit' | null;
}

export type RatingRule = ({ rule: RangedRuleKind } & RatingLimits) | { rule: 'always'; rating: Rating };

export const RATING_RULE_META_KEY = 'ratingRule';
export const CLOSES_LEAD_META_KEY = 'closesLead';
export const NEW_LEAD_RATING_SETTING = 'ratingNewLead';
/** Set only by Convert; always closes a lead. */
export const CONVERTED_STATUS = 'Converted';

export const DEFAULT_NEW_LEAD_LIMITS: RatingLimits = { hot: 5, warm: 'noLimit' };
export const DEFAULT_RESPONSE_RULE: RatingRule = { rule: 'followUpGap', hot: 5, warm: 'noLimit' };

export const MAX_RATING_DAYS = 365;
export const MAX_RATING_CALLS = 50;

export const RULE_LABELS: Record<RatingRuleKind, string> = {
    followUpGap: 'Follow-up gap',
    daysSinceResponse: 'Days since response',
    unansweredCalls: 'Unanswered calls',
    always: 'Always',
};

export const RULE_HINTS: Record<RatingRuleKind, string> = {
    followUpGap: 'Days from the day the response is recorded to the next follow-up',
    daysSinceResponse: 'Days since the response was recorded; ages every night',
    unansweredCalls: 'Unanswered calls in a row, counting this one',
    always: 'One fixed Rating',
};

export const unitOf = (kind: RangedRuleKind | 'newLead'): 'days' | 'calls' => (kind === 'unansweredCalls' ? 'calls' : 'days');

const isRating = (value: unknown): value is Rating => typeof value === 'string' && (RATINGS as readonly string[]).includes(value);
const isLimit = (value: unknown) => value === null || (typeof value === 'number' && Number.isInteger(value));

/** Problems with limits (empty when fine), worded for the builder. */
export function limitIssues(limits: RatingLimits, kind: RangedRuleKind | 'newLead'): string[] {
    const calls = kind === 'unansweredCalls';
    const min = calls ? 1 : 0;
    const max = calls ? MAX_RATING_CALLS : MAX_RATING_DAYS;
    const unit = unitOf(kind);
    const issues: string[] = [];
    if (typeof limits.hot === 'number' && (limits.hot < min || limits.hot > max)) issues.push(`Hot must be ${min}–${max} ${unit}.`);
    if (typeof limits.warm === 'number' && (limits.warm < min || limits.warm > max)) issues.push(`Warm must be ${min}–${max} ${unit}.`);
    if (typeof limits.hot === 'number' && typeof limits.warm === 'number' && limits.warm <= limits.hot) {
        issues.push(`Warm must go past Hot's ${limits.hot} ${unit}.`);
    }
    return issues;
}

/** The rule stored in a Customer Response option's meta; null when it has none (or it is malformed). */
export function ratingRuleFromMeta(meta: Record<string, unknown> | null | undefined): RatingRule | null {
    const raw = meta?.[RATING_RULE_META_KEY];
    if (!raw || typeof raw !== 'object') return null;
    const rule = raw as Record<string, unknown>;
    if (rule.rule === 'always') return isRating(rule.rating) ? { rule: 'always', rating: rule.rating } : null;
    const kind = rule.rule;
    if (kind !== 'followUpGap' && kind !== 'daysSinceResponse' && kind !== 'unansweredCalls') return null;
    if (!isLimit(rule.hot) || !(isLimit(rule.warm) || rule.warm === 'noLimit')) return null;
    const parsed: RatingRule & { rule: RangedRuleKind } = { rule: kind, hot: rule.hot as number | null, warm: rule.warm as RatingLimits['warm'] };
    return limitIssues(parsed, parsed.rule).length === 0 ? parsed : null;
}

export const closesLeadFromMeta = (meta: Record<string, unknown> | null | undefined): boolean => meta?.[CLOSES_LEAD_META_KEY] === true;

export function newLeadLimitsFrom(value: unknown): RatingLimits {
    if (!value || typeof value !== 'object') return DEFAULT_NEW_LEAD_LIMITS;
    const v = value as Record<string, unknown>;
    if (!isLimit(v.hot) || !(isLimit(v.warm) || v.warm === 'noLimit')) return DEFAULT_NEW_LEAD_LIMITS;
    const limits = { hot: v.hot as number | null, warm: v.warm as RatingLimits['warm'] };
    return limitIssues(limits, 'newLead').length === 0 ? limits : DEFAULT_NEW_LEAD_LIMITS;
}

/** What Cold covers: `15+ days` / `never`. */
export function coldRange(limits: RatingLimits, unit: 'days' | 'calls'): string {
    if (limits.warm === 'noLimit') return 'Never';
    const from = typeof limits.warm === 'number' ? limits.warm + 1 : typeof limits.hot === 'number' ? limits.hot + 1 : unit === 'calls' ? 1 : 0;
    return `${from}+ ${unit}`;
}

/** `Hot 0–5 days, then Warm` / `Hot 1–2 calls, Warm up to 4 calls, then Cold`. */
export function describeLimits(limits: RatingLimits, unit: 'days' | 'calls'): string {
    const start = unit === 'calls' ? 1 : 0;
    const hot = limits.hot === null ? 'No Hot' : `Hot ${start}–${limits.hot} ${unit}`;
    if (limits.warm === 'noLimit') return `${hot}, then Warm`;
    if (limits.warm === null) return `${hot}, then Cold`;
    return `${hot}, Warm up to ${limits.warm} ${unit}, then Cold`;
}

export function describeRatingRule(rule: RatingRule): string {
    if (rule.rule === 'always') return `Always ${rule.rating}`;
    return `${RULE_LABELS[rule.rule]}: ${describeLimits(rule, unitOf(rule.rule))}`;
}

/** Colors of a Rating chip (Hot red, Warm amber, Cold neutral slate). */
export function ratingChipColors(rating: string | null | undefined): { color: string; backgroundColor: string; borderColor: string } {
    if (rating === 'Hot') return { color: 'var(--crm-red-700)', backgroundColor: 'var(--crm-red-100)', borderColor: 'var(--crm-red-300)' };
    if (rating === 'Warm') return { color: 'var(--crm-amber-700)', backgroundColor: 'var(--crm-amber-100)', borderColor: 'var(--mui-palette-warning-softBorder)' };
    return { color: 'var(--crm-slate-700)', backgroundColor: 'var(--mui-palette-background-hover)', borderColor: 'var(--mui-palette-border-strong)' };
}

// ── The rules as configured ───────────────────────────────────────────────────

export interface LeadRatingConfig {
    /** The list the leads Customer Response field is linked to (the one admins add / rename / delete options in). */
    responseCategory: DropdownCategoryDto | undefined;
    /** The list the leads Status field is linked to. */
    statusCategory: DropdownCategoryDto | undefined;
    /** Status values that close a lead ("Closes the lead"), plus Converted. */
    closingStatuses: ReadonlySet<string>;
    newLeadLimits: RatingLimits;
    /** A response's rule (the default for options without one). */
    ruleFor: (response: string) => RatingRule;
}

/** Reads the rules from a configuration payload (the saved one, or the Form Builder's draft). */
export function leadRatingConfig(configs: FormConfigsPayload | null | undefined): LeadRatingConfig {
    const fields = moduleFields(configs, 'leads');
    const categoryOf = (fieldKey: string) => findCategory(configs, fields.find((f) => f.fieldKey === fieldKey)?.dropdownCategoryKey);
    const responseCategory = categoryOf('customerResponse');
    const statusCategory = categoryOf('status') ?? findCategory(configs, 'lead_status');
    const closingStatuses = new Set<string>([CONVERTED_STATUS]);
    for (const option of statusCategory?.options ?? []) if (closesLeadFromMeta(option.meta)) closingStatuses.add(option.value);
    return {
        responseCategory,
        statusCategory,
        closingStatuses,
        newLeadLimits: newLeadLimitsFrom(configs?.moduleSettings?.leads?.[NEW_LEAD_RATING_SETTING]),
        ruleFor: (response) => ratingRuleFromMeta(responseCategory?.options.find((o) => o.value === response)?.meta) ?? DEFAULT_RESPONSE_RULE,
    };
}

export function useLeadRatingConfig(): LeadRatingConfig {
    const configs = useFormConfigs();
    return useMemo(() => leadRatingConfig(configs), [configs]);
}
