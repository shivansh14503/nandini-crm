import { z } from 'zod';
import type { prisma, TransactionClient } from '../../config/prisma.js';
import { HttpError } from '../../utils/httpError.js';
import { fromDateOnly, toDateOnly } from '../../utils/mappers.js';
import { parseTimeOfDay } from '../../validators/notInPast.js';
import { CONVERTED_STATUS } from './lead.validator.js';
import {
    ageingFromColumns,
    ageingJson,
    closesLeadFromMeta,
    DEFAULT_RESPONSE_RULE,
    newLeadLimitsFrom,
    rateAgeing,
    rateFollowUp,
    rateNewLead,
    ratingRuleFromMeta,
    type Rating,
    type RatingLimits,
    type RatingRule,
} from './lead.rating.js';

/**
 * Follow-up and Rating rules of lead saves (docs/lead-rating-rules.md §3). The service calls these inside its
 * transaction, before writing, so a refused save changes nothing.
 */

/** Module setting (`ModuleSetting`, module `leads`) holding the new-lead Rating limits. */
export const NEW_LEAD_RATING_SETTING = 'ratingNewLead';

export const followUpDecisionSchema = z.enum(['keep', 'new']);
export type FollowUpDecision = z.infer<typeof followUpDecisionSchema>;

/** The admin's Rating rules as the lead form's own dropdowns and settings hold them. */
export interface RatingConfig {
    /** Customer Response option value → its rule (options without one rate with DEFAULT_RESPONSE_RULE). */
    responseRules: Map<string, RatingRule>;
    /** Status values that close a lead ("Closes the lead" switch), plus Converted. */
    closingStatuses: Set<string>;
    newLeadLimits: RatingLimits;
}

type Db = TransactionClient | typeof prisma;

const parseMeta = (json: string | null): unknown => {
    if (!json) return null;
    try {
        return JSON.parse(json);
    } catch {
        return null;
    }
};

/** Reads the rules from the lists the leads Customer Response and Status fields are linked to. */
export async function loadRatingConfig(db: Db): Promise<RatingConfig> {
    const [fields, setting] = await Promise.all([
        db.formFieldDefinition.findMany({
            where: { module: 'leads', fieldKey: { in: ['customerResponse', 'status'] } },
            select: { fieldKey: true, dropdownCategoryId: true },
        }),
        db.moduleSetting.findUnique({ where: { module_key: { module: 'leads', key: NEW_LEAD_RATING_SETTING } } }),
    ]);
    const categoryOf = (key: string) => fields.find((f) => f.fieldKey === key)?.dropdownCategoryId ?? null;
    const responseCategory = categoryOf('customerResponse');
    const statusCategory = categoryOf('status');
    const categoryIds = [responseCategory, statusCategory].filter((id): id is string => Boolean(id));
    const options = categoryIds.length
        ? await db.dropdownOption.findMany({ where: { categoryId: { in: categoryIds } }, select: { categoryId: true, value: true, metaJson: true } })
        : [];

    const responseRules = new Map<string, RatingRule>();
    const closingStatuses = new Set<string>([CONVERTED_STATUS]);
    for (const option of options) {
        const meta = parseMeta(option.metaJson);
        if (option.categoryId === responseCategory) {
            const rule = ratingRuleFromMeta(meta);
            if (rule) responseRules.set(option.value, rule);
        }
        if (option.categoryId === statusCategory && closesLeadFromMeta(meta)) closingStatuses.add(option.value);
    }
    return { responseRules, closingStatuses, newLeadLimits: newLeadLimitsFrom(parseMeta(setting?.valueJson ?? null)) };
}

// ── Follow-up slots ───────────────────────────────────────────────────────────

export interface Slot {
    date: string;
    time: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** `YYYY-MM-DDTHH:mm` of a slot, or null without a valid date and time. */
function slotWallClock({ date, time }: Slot): string | null {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    const minutes = parseTimeOfDay(time);
    if (minutes === null) return null;
    return `${date}T${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

const sameSlot = (a: Slot, b: Slot) => a.date === b.date && a.time.trim() === b.time.trim();

const fieldError = (path: string, message: string) => HttpError.badRequest(message, [{ message, path: [path] }]);

/**
 * A follow-up being set (new lead, or "schedule a new one"): needs a date and a time, later than `now`
 * (business-timezone wall clock `YYYY-MM-DDTHH:mm`), checked when Save is clicked.
 */
export function assertFutureSlot(slot: Slot, now: string): void {
    if (!slot.date.trim()) throw fieldError('nextFollowupDate', 'Select the next follow-up date.');
    if (!slot.time.trim()) throw fieldError('nextFollowupTime', 'Select the next follow-up time.');
    const at = slotWallClock(slot);
    if (!at) throw fieldError('nextFollowupTime', 'Select a valid next follow-up time.');
    if (at <= now) {
        throw fieldError(slot.date < now.slice(0, 10) ? 'nextFollowupDate' : 'nextFollowupTime', 'The next follow-up must be later than now.');
    }
}

// ── New leads ─────────────────────────────────────────────────────────────────

export interface RatingColumns {
    rating: Rating | null;
    ratingReason: string | null;
    unansweredCalls: number;
    ratingAgeingFrom: Date | null;
    ratingAgeingJson: string | null;
}

/** Rating columns of a new lead: the new-lead rule, from the day it is created to its first follow-up. */
export function newLeadRatingColumns(config: RatingConfig, today: string, followUpDate: string | null | undefined): RatingColumns {
    const date = followUpDate?.slice(0, 10) ?? '';
    // Imports may carry no follow-up or a past one: Warm, as the plan says.
    const result = date && date >= today ? rateNewLead(config.newLeadLimits, today, date) : { rating: 'Warm' as const, reason: 'New lead without an upcoming follow-up' };
    return { rating: result.rating, ratingReason: result.reason, unansweredCalls: 0, ratingAgeingFrom: null, ratingAgeingJson: null };
}

// ── Edits ─────────────────────────────────────────────────────────────────────

/** The stored lead columns the edit rules read. */
export interface LeadRatingState {
    status: string;
    rating: string | null;
    ratingReason: string | null;
    unansweredCalls: number;
    ratingAgeingFrom: Date | null;
    ratingAgeingJson: string | null;
    nextFollowupDate: Date | null;
    nextFollowupTime: string | null;
}

/** History block of a recorded follow-up (`followUp` in the FOLLOW_UP audit row). */
export interface FollowUpSummary {
    response: string;
    remarks: string;
    /** The follow-up before this save ('' parts when none). */
    previous: Slot;
    /** The follow-up after it (empty when the lead closed). */
    next: Slot;
    /** keep / new, or `closed` when the save closed (or kept closed) the lead. */
    decision: FollowUpDecision | 'closed';
    status: { from: string; to: string };
    rating: { from: string; to: string };
    unansweredCalls: number;
    reason: string;
}

export interface FollowUpPlan {
    /** Columns to write on top of the lead input; `nextFollowup*` only when the save clears them. */
    data: Partial<RatingColumns> & { nextFollowupDate?: null; nextFollowupTime?: null };
    /** Set when the save records a follow-up (FOLLOW_UP history row); null for a details-only edit. */
    followUp: FollowUpSummary | null;
}

/** The Rating a lead has today: an ageing lead moves on by the days passed; others keep theirs. */
export function currentRating(state: LeadRatingState, today: string): { rating: string | null; reason: string | null } {
    const ageing = ageingFromColumns(toDateOnly(state.ratingAgeingFrom), state.ratingAgeingJson);
    if (!ageing) return { rating: state.rating, reason: state.ratingReason };
    return rateAgeing(ageing, today);
}

/** Columns that keep a lead's Rating as it is today and stop its ageing (closing, converting). */
export function frozenRatingColumns(state: LeadRatingState, today: string): Partial<RatingColumns> {
    const now = currentRating(state, today);
    return {
        rating: (now.rating as Rating | null) ?? null,
        ratingReason: now.reason,
        ratingAgeingFrom: null,
        ratingAgeingJson: null,
    };
}

export interface PlanLeadEditInput {
    state: LeadRatingState;
    /** The Customer Response the save records ('' = details only). */
    response: string;
    remarks: string;
    /** `followUpDecision` from the request body. */
    decision: unknown;
    /** Status and follow-up the save leaves (after merging the patch). */
    nextStatus: string;
    next: Slot;
    config: RatingConfig;
    /** Business-timezone wall clock `YYYY-MM-DDTHH:mm`. */
    now: string;
}

/**
 * The follow-up rules of a lead edit: what it may change and the Rating it gives. Throws a 400 naming the field to
 * fix; otherwise returns the columns to write and the history block.
 */
export function planLeadEdit({ state, response, remarks, decision, nextStatus, next, config, now }: PlanLeadEditInput): FollowUpPlan {
    const today = now.slice(0, 10);
    const previous: Slot = { date: toDateOnly(state.nextFollowupDate), time: state.nextFollowupTime ?? '' };
    const wasClosed = config.closingStatuses.has(state.status);
    const closing = config.closingStatuses.has(nextStatus);

    // Details only: the follow-up, the Rating and the counter stay as they are.
    if (!response) {
        if (closing && !wasClosed) throw fieldError('customerResponse', 'Pick a Customer Response to close the lead.');
        if (wasClosed && !closing) throw fieldError('customerResponse', 'Pick a Customer Response and schedule a follow-up to reopen the lead.');
        if (!closing && !sameSlot(previous, next)) throw fieldError('customerResponse', 'Pick a Customer Response to change the next follow-up.');
        return { data: {}, followUp: null };
    }

    const ratingFrom = state.rating ?? '';
    const summaryBase = { response, remarks, previous, status: { from: state.status, to: nextStatus }, unansweredCalls: state.unansweredCalls };

    // Closing (Lost / Converted): the Rating stays as it is today, the follow-up goes.
    if (closing) {
        const frozen = frozenRatingColumns(state, today);
        return {
            data: { ...frozen, nextFollowupDate: null, nextFollowupTime: null },
            followUp: {
                ...summaryBase,
                next: { date: '', time: '' },
                decision: 'closed',
                rating: { from: ratingFrom, to: frozen.rating ?? '' },
                reason: frozen.ratingReason ?? '',
            },
        };
    }

    const parsedDecision = followUpDecisionSchema.safeParse(decision);
    if (!parsedDecision.success) {
        throw fieldError('followUpDecision', 'Choose whether to keep the current follow-up or schedule a new one.');
    }
    if (parsedDecision.data === 'keep') {
        const at = slotWallClock(previous);
        if (!at || at <= now) throw fieldError('nextFollowupDate', 'The current follow-up has passed. Schedule a new one.');
        if (!sameSlot(previous, next)) throw fieldError('nextFollowupDate', 'Keeping the current follow-up can’t change its date or time.');
    } else {
        assertFutureSlot(next, now);
    }

    const rule = config.responseRules.get(response) ?? DEFAULT_RESPONSE_RULE;
    const rated = rateFollowUp({ rule, response, today, followUpDate: next.date, unansweredCalls: state.unansweredCalls });
    return {
        data: {
            rating: rated.rating,
            ratingReason: rated.reason,
            unansweredCalls: rated.unansweredCalls,
            ratingAgeingFrom: rated.ageing ? fromDateOnly(rated.ageing.from) : null,
            ratingAgeingJson: rated.ageing ? ageingJson(rated.ageing) : null,
        },
        followUp: {
            ...summaryBase,
            next,
            decision: parsedDecision.data,
            rating: { from: ratingFrom, to: rated.rating },
            unansweredCalls: rated.unansweredCalls,
            reason: rated.reason,
        },
    };
}
