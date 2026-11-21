import { z } from 'zod';

/**
 * A lead's Rating (`Lead.rating`): Hot / Warm / Cold, worked out by the server from the follow-ups users record, with
 * limits an admin sets in Form Builder › Leads › Rating Rules (docs/lead-rating-rules.md). Pure functions: callers
 * pass "today" as an IST calendar date (`YYYY-MM-DD`), so every count is in calendar days, not 24-hour blocks.
 */

export const RATINGS = ['Hot', 'Warm', 'Cold'] as const;
export type Rating = (typeof RATINGS)[number];

/** How a Customer Response option rates a lead (UI names: Follow-up gap / Days since response / Unanswered calls / Always). */
export const RATING_RULE_KINDS = ['followUpGap', 'daysSinceResponse', 'unansweredCalls', 'always'] as const;
export type RatingRuleKind = (typeof RATING_RULE_KINDS)[number];

/**
 * Limits of a ranged rule. Hot up to `hot` (null = Off: the rule starts at Warm); Warm up to `warm` ('noLimit' = never
 * Cold; null = Off: Hot goes straight to Cold); Cold after that. Inclusive.
 */
export interface RatingLimits {
    hot: number | null;
    warm: number | 'noLimit' | null;
}

export type RangedRuleKind = Exclude<RatingRuleKind, 'always'>;
export type RatingRule = ({ rule: RangedRuleKind } & RatingLimits) | { rule: 'always'; rating: Rating };

/** Option meta key holding its rule, and the Status option meta key of the "Closes the lead" switch. */
export const RATING_RULE_META_KEY = 'ratingRule';
export const CLOSES_LEAD_META_KEY = 'closesLead';

/** New leads: days from creation to the first follow-up. Hot 0–5, Warm after (never Cold). */
export const DEFAULT_NEW_LEAD_LIMITS: RatingLimits = { hot: 5, warm: 'noLimit' };
/** An option without a rule yet (e.g. one an admin just added) rates like this. */
export const DEFAULT_RESPONSE_RULE: RatingRule = { rule: 'followUpGap', hot: 5, warm: 'noLimit' };

export const MAX_RATING_DAYS = 365;
export const MAX_RATING_CALLS = 50;

/** Room for `ratingReason` (NVARCHAR(200)). */
const MAX_REASON = 200;

// ── Validation (Form Builder saves) ───────────────────────────────────────────

const limitNumber = z.number().int();

function refineLimits(limits: RatingLimits, kind: RangedRuleKind | 'newLead', ctx: z.RefinementCtx): void {
    const calls = kind === 'unansweredCalls';
    const min = calls ? 1 : 0;
    const max = calls ? MAX_RATING_CALLS : MAX_RATING_DAYS;
    const unit = calls ? 'calls' : 'days';
    for (const [key, value] of [['hot', limits.hot], ['warm', limits.warm]] as const) {
        if (typeof value === 'number' && (value < min || value > max)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: `${key === 'hot' ? 'Hot' : 'Warm'} must be ${min}–${max} ${unit}.` });
        }
    }
    if (typeof limits.hot === 'number' && typeof limits.warm === 'number' && limits.warm <= limits.hot) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['warm'], message: `Warm must go past Hot's ${limits.hot} ${unit}.` });
    }
}

const limitsShape = { hot: limitNumber.nullable(), warm: z.union([limitNumber, z.literal('noLimit')]).nullable() };

export const ratingLimitsSchema = z.object(limitsShape).strict().superRefine((limits, ctx) => refineLimits(limits, 'newLead', ctx));

export const ratingRuleSchema: z.ZodType<RatingRule> = z
    .discriminatedUnion('rule', [
        z.object({ rule: z.enum(['followUpGap', 'daysSinceResponse', 'unansweredCalls']), ...limitsShape }).strict(),
        z.object({ rule: z.literal('always'), rating: z.enum(RATINGS) }).strict(),
    ])
    .superRefine((rule, ctx) => {
        if (rule.rule !== 'always') refineLimits(rule, rule.rule, ctx);
    });

/** The rule stored in a Customer Response option's meta; null when it has none (or it is malformed). */
export function ratingRuleFromMeta(meta: unknown): RatingRule | null {
    if (!meta || typeof meta !== 'object') return null;
    const parsed = ratingRuleSchema.safeParse((meta as Record<string, unknown>)[RATING_RULE_META_KEY]);
    return parsed.success ? parsed.data : null;
}

/** Whether a Status option's meta has "Closes the lead" switched on. */
export const closesLeadFromMeta = (meta: unknown): boolean =>
    Boolean(meta && typeof meta === 'object' && (meta as Record<string, unknown>)[CLOSES_LEAD_META_KEY] === true);

/** The new-lead limits stored as a module setting; the default when missing or malformed. */
export function newLeadLimitsFrom(value: unknown): RatingLimits {
    const parsed = ratingLimitsSchema.safeParse(value);
    return parsed.success ? parsed.data : DEFAULT_NEW_LEAD_LIMITS;
}

// ── Rating ────────────────────────────────────────────────────────────────────

/** Calendar days from `from` to `to` (both `YYYY-MM-DD`); negative when `to` is earlier. */
export function calendarDaysBetween(from: string, to: string): number {
    const day = (value: string) => Date.UTC(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, Number(value.slice(8, 10)));
    return Math.round((day(to) - day(from)) / 86_400_000);
}

/** Where a count (days or calls) falls in the limits. */
export function ratingForCount(count: number, limits: RatingLimits): Rating {
    if (limits.hot !== null && count <= limits.hot) return 'Hot';
    if (limits.warm === 'noLimit') return 'Warm';
    if (limits.warm !== null && count <= limits.warm) return 'Warm';
    return 'Cold';
}

const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`;
const quoted = (label: string) => `"${label.length > 80 ? `${label.slice(0, 77)}…` : label}"`;
const clip = (reason: string) => (reason.length > MAX_REASON ? `${reason.slice(0, MAX_REASON - 1)}…` : reason);

export interface RatingResult {
    rating: Rating;
    /** Why, in words (stored as `ratingReason`). */
    reason: string;
}

/** A new lead: the days from its creation date to its first follow-up date. */
export function rateNewLead(limits: RatingLimits, createdOn: string, followUpDate: string): RatingResult {
    const gap = Math.max(0, calendarDaysBetween(createdOn, followUpDate));
    return { rating: ratingForCount(gap, limits), reason: `New lead, first follow-up in ${days(gap)}` };
}

/** Snapshot of a "Days since response" rule while the lead ages (`ratingAgeingFrom` + `ratingAgeingJson`). */
export interface AgeingSnapshot {
    /** The day the response was recorded (`YYYY-MM-DD`, IST). */
    from: string;
    limits: RatingLimits;
    /** The response's label, for the reason text. */
    response: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** `2026-11-20` → `20 Nov 2026`. */
const dayLabel = (date: string) => `${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1] ?? ''} ${date.slice(0, 4)}`;

/**
 * A lead ageing under "Days since response", as of `today`. The reason names the response and its day (not the
 * day count), so it only changes when the Rating does and the nightly job writes nothing on the other days.
 */
export function rateAgeing(snapshot: AgeingSnapshot, today: string): RatingResult {
    const elapsed = Math.max(0, calendarDaysBetween(snapshot.from, today));
    return { rating: ratingForCount(elapsed, snapshot.limits), reason: clip(`Ageing since ${quoted(snapshot.response)} on ${dayLabel(snapshot.from)}`) };
}

export interface FollowUpRatingInput {
    /** The picked response's rule (`DEFAULT_RESPONSE_RULE` when it has none). */
    rule: RatingRule;
    /** The picked response's label. */
    response: string;
    /** IST calendar date of the save. */
    today: string;
    /** The next follow-up date the save leaves (kept or new). */
    followUpDate: string;
    /** The lead's consecutive unanswered calls before this response. */
    unansweredCalls: number;
}

export interface FollowUpRatingResult extends RatingResult {
    /** The counter after this response: one more for an "Unanswered calls" response, otherwise reset to 0. */
    unansweredCalls: number;
    /** Set while the lead ages under a "Days since response" rule; null clears any earlier one. */
    ageing: AgeingSnapshot | null;
}

/** The Rating a recorded follow-up gives (docs/lead-rating-rules.md §2). */
export function rateFollowUp({ rule, response, today, followUpDate, unansweredCalls }: FollowUpRatingInput): FollowUpRatingResult {
    switch (rule.rule) {
        case 'always':
            return { rating: rule.rating, reason: clip(`${quoted(response)} is always ${rule.rating}`), unansweredCalls: 0, ageing: null };
        case 'followUpGap': {
            const gap = Math.max(0, calendarDaysBetween(today, followUpDate));
            return {
                rating: ratingForCount(gap, rule),
                reason: clip(`Follow-up in ${days(gap)} after ${quoted(response)}`),
                unansweredCalls: 0,
                ageing: null,
            };
        }
        case 'daysSinceResponse': {
            const ageing: AgeingSnapshot = { from: today, limits: { hot: rule.hot, warm: rule.warm }, response };
            return { ...rateAgeing(ageing, today), unansweredCalls: 0, ageing };
        }
        case 'unansweredCalls': {
            const calls = Math.max(0, unansweredCalls) + 1;
            return {
                rating: ratingForCount(calls, rule),
                reason: clip(`${calls} unanswered call${calls === 1 ? '' : 's'} in a row (${quoted(response)})`),
                unansweredCalls: calls,
                ageing: null,
            };
        }
    }
}

// ── Words (audit trail) ───────────────────────────────────────────────────────

const RULE_NAMES: Record<RatingRuleKind, string> = {
    followUpGap: 'Follow-up gap',
    daysSinceResponse: 'Days since response',
    unansweredCalls: 'Unanswered calls',
    always: 'Always',
};

/** `Hot 0–5 days, Warm up to 14 days, then Cold` / `Hot 1–2 calls, then Warm`. */
export function describeLimits(limits: RatingLimits, unit: 'days' | 'calls'): string {
    const start = unit === 'calls' ? 1 : 0;
    const hot = limits.hot === null ? 'No Hot' : `Hot ${start}–${limits.hot} ${unit}`;
    if (limits.warm === 'noLimit') return `${hot}, then Warm`;
    if (limits.warm === null) return `${hot}, then Cold`;
    return `${hot}, Warm up to ${limits.warm} ${unit}, then Cold`;
}

/** `Follow-up gap: Hot 0–5 days, then Warm` / `Always Cold`. */
export function describeRatingRule(rule: RatingRule): string {
    if (rule.rule === 'always') return `Always ${rule.rating}`;
    return `${RULE_NAMES[rule.rule]}: ${describeLimits(rule, rule.rule === 'unansweredCalls' ? 'calls' : 'days')}`;
}

/** `ratingAgeingJson` column ↔ snapshot (the `from` date lives in `ratingAgeingFrom`). */
export const ageingJson = (snapshot: AgeingSnapshot): string => JSON.stringify({ limits: snapshot.limits, response: snapshot.response });

export function ageingFromColumns(from: string, json: string | null | undefined): AgeingSnapshot | null {
    if (!from || !json) return null;
    try {
        const parsed = JSON.parse(json) as { limits?: unknown; response?: unknown };
        const limits = z.object(limitsShape).safeParse(parsed.limits);
        if (!limits.success) return null;
        return { from, limits: limits.data, response: typeof parsed.response === 'string' ? parsed.response : '' };
    } catch {
        return null;
    }
}
