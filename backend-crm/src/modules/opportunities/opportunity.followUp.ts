import { z } from 'zod';
import type { prisma, TransactionClient } from '../../config/prisma.js';
import { HttpError } from '../../utils/httpError.js';
import { parseTimeOfDay } from '../../validators/notInPast.js';
import { CLOSED_SALES_STAGES } from './opportunity.validator.js';

/**
 * An opportunity's Customer Response follows its Sales Stage (docs/api-plan.md, Opportunities):
 *  - each response option lists the stages it may be picked at (`opportunityStages` in its meta; none = every open stage);
 *  - a response with `noFollowUp` (Do Not Contact) is kept but clears the next follow-up;
 *  - Closed Won / Closed Lost record no response and no follow-up;
 *  - any other recorded response needs a next follow-up (date and time) later than now.
 * Admins set both keys in Form Builder › Opportunities › Response Rules. Pure functions; `loadResponseRules` reads them.
 */

export const OPPORTUNITY_STAGES_META_KEY = 'opportunityStages';
export const NO_FOLLOW_UP_META_KEY = 'noFollowUp';
/** Stages that end the deal: no response, no follow-up. */
export const CLOSED_STAGES: ReadonlySet<string> = new Set(CLOSED_SALES_STAGES);

/** Meta validation (Form Builder saves): a list of Sales Stage values, and an on / off switch. */
export const opportunityStagesSchema = z.array(z.string().trim().min(1).max(200)).max(100);

/** Stages a response may be picked at; null = every open stage (the key is absent or malformed). */
export function allowedStagesFromMeta(meta: unknown): string[] | null {
    if (!meta || typeof meta !== 'object') return null;
    const parsed = opportunityStagesSchema.safeParse((meta as Record<string, unknown>)[OPPORTUNITY_STAGES_META_KEY]);
    return parsed.success ? parsed.data : null;
}

export const noFollowUpFromMeta = (meta: unknown): boolean =>
    Boolean(meta && typeof meta === 'object' && (meta as Record<string, unknown>)[NO_FOLLOW_UP_META_KEY] === true);

export interface ResponseRule {
    /** null = every open stage. */
    stages: string[] | null;
    noFollowUp: boolean;
}

export interface ResponseRules {
    /** Active options of the list the opportunities Customer Response field is linked to, by value (lower case). */
    responses: ReadonlyMap<string, ResponseRule & { value: string }>;
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function isResponseAllowed(rule: ResponseRule, stage: string): boolean {
    if (CLOSED_STAGES.has(stage)) return false;
    return rule.stages === null || rule.stages.some((s) => same(s, stage));
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

/** Reads the rules from the list the opportunities Customer Response field is linked to. */
export async function loadResponseRules(db: Db): Promise<ResponseRules> {
    const field = await db.formFieldDefinition.findUnique({
        where: { module_fieldKey: { module: 'opportunities', fieldKey: 'customerResponse' } },
        select: { dropdownCategoryId: true },
    });
    const options = field?.dropdownCategoryId
        ? await db.dropdownOption.findMany({ where: { categoryId: field.dropdownCategoryId, isActive: true }, select: { value: true, metaJson: true } })
        : [];
    const responses = new Map<string, ResponseRule & { value: string }>();
    for (const option of options) {
        const meta = parseMeta(option.metaJson);
        responses.set(option.value.toLowerCase(), { value: option.value, stages: allowedStagesFromMeta(meta), noFollowUp: noFollowUpFromMeta(meta) });
    }
    return { responses };
}

export interface FollowUpState {
    salesStage: string;
    customerResponse?: string | null;
    nextFollowupDate?: string | null;
    nextFollowupTime?: string | null;
}

export interface FollowUpPlan {
    customerResponse: string;
    nextFollowupDate: string | null;
    nextFollowupTime: string;
    /** No follow-up is kept by this save (closed stage, or a "no follow-up" response): skip its required check. */
    followUpCleared: boolean;
}

const fieldError = (path: string, message: string) => HttpError.badRequest(message, [{ path: [path], message }]);

/**
 * What a save stores for the response and the next follow-up, or a 400 on the offending field.
 * `responseRecorded`: the save sends a non-empty Customer Response (a follow-up is being recorded); otherwise the
 * stored response stays as it is (an edit of other details, or a stage change from elsewhere).
 * `now` is the business-timezone wall clock, `YYYY-MM-DDTHH:mm`.
 */
export function planOpportunityFollowUp(values: FollowUpState, responseRecorded: boolean, rules: ResponseRules, now: string): FollowUpPlan {
    const stage = values.salesStage.trim();
    const date = (values.nextFollowupDate ?? '').trim().slice(0, 10);
    const time = (values.nextFollowupTime ?? '').trim();
    const response = (values.customerResponse ?? '').trim();

    if (CLOSED_STAGES.has(stage)) return { customerResponse: '', nextFollowupDate: null, nextFollowupTime: '', followUpCleared: true };
    if (!responseRecorded || !response) return { customerResponse: response, nextFollowupDate: date || null, nextFollowupTime: time, followUpCleared: false };

    const rule = rules.responses.get(response.toLowerCase());
    if (!rule) throw fieldError('customerResponse', `"${response}" is not a Customer Response option.`);
    if (!isResponseAllowed(rule, stage)) throw fieldError('customerResponse', `"${rule.value}" can't be picked at Sales Stage ${stage}. Pick another Customer Response.`);
    if (rule.noFollowUp) return { customerResponse: rule.value, nextFollowupDate: null, nextFollowupTime: '', followUpCleared: true };

    if (!date) throw fieldError('nextFollowupDate', 'Select the next follow-up date.');
    const minutes = parseTimeOfDay(time);
    if (!time || minutes === null) throw fieldError('nextFollowupTime', 'Select the next follow-up time.');
    const slot = `${date}T${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
    if (slot <= now) throw fieldError('nextFollowupTime', 'The next follow-up must be later than now. Pick a later date or time.');
    return { customerResponse: rule.value, nextFollowupDate: date, nextFollowupTime: time, followUpCleared: false };
}
