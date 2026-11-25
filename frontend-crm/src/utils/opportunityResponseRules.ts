import { useMemo } from 'react';
import { useFormConfigs } from '@/hooks/queries/useFormConfigs';
import type { DropdownCategoryDto, DropdownOptionDto, FormConfigsPayload } from '@/types/formConfig.types';
import { findCategory, moduleFields } from '@/utils/formConfig';

/**
 * Opportunities: the Sales Stage decides which Customer Responses can be picked, and the response whether a next
 * follow-up is needed. Same rules as the server (backend opportunity.followUp.ts); admins set them in
 * Form Builder › Opportunities › Response Rules.
 */

/** Response option meta: the Sales Stages it may be picked at (absent = every open stage). */
export const OPPORTUNITY_STAGES_META_KEY = 'opportunityStages';
/** Response option meta: picking it clears the next follow-up (Do Not Contact). */
export const NO_FOLLOW_UP_META_KEY = 'noFollowUp';
/** Stages that end the deal: no response, no follow-up. */
export const CLOSED_STAGES: ReadonlySet<string> = new Set(['Closed Won', 'Closed Lost']);

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Stages a response may be picked at; null = every open stage. */
export function allowedStagesFromMeta(meta: Record<string, unknown> | null | undefined): string[] | null {
    const value = meta?.[OPPORTUNITY_STAGES_META_KEY];
    return Array.isArray(value) && value.every((v) => typeof v === 'string') ? (value as string[]) : null;
}

export const noFollowUpFromMeta = (meta: Record<string, unknown> | null | undefined): boolean => meta?.[NO_FOLLOW_UP_META_KEY] === true;

export function isStageAllowed(option: Pick<DropdownOptionDto, 'meta'>, stage: string): boolean {
    if (CLOSED_STAGES.has(stage)) return false;
    const stages = allowedStagesFromMeta(option.meta);
    return stages === null || stages.some((s) => same(s, stage));
}

export interface OpportunityResponseConfig {
    /** The list the opportunities Customer Response field is linked to. */
    responseCategory: DropdownCategoryDto | undefined;
    /** The list the Sales Stage field is linked to. */
    stageCategory: DropdownCategoryDto | undefined;
    /** Active responses that fit the stage, in admin order (every active one while no stage is picked). */
    responsesFor: (stage: string) => string[];
    /** Whether the response fits the stage (unknown responses don't). */
    allows: (response: string, stage: string) => boolean;
    /** Whether the response clears the next follow-up. */
    noFollowUp: (response: string) => boolean;
}

export function opportunityResponseConfig(configs: FormConfigsPayload | null | undefined): OpportunityResponseConfig {
    const fields = moduleFields(configs, 'opportunities');
    const categoryOf = (fieldKey: string) => findCategory(configs, fields.find((f) => f.fieldKey === fieldKey)?.dropdownCategoryKey);
    const responseCategory = categoryOf('customerResponse');
    const stageCategory = categoryOf('salesStage') ?? findCategory(configs, 'opportunity_sales_stage');
    const active = (responseCategory?.options ?? []).filter((o) => o.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
    const find = (response: string) => active.find((o) => same(o.value, response));
    return {
        responseCategory,
        stageCategory,
        responsesFor: (stage) => active.filter((o) => !stage || isStageAllowed(o, stage)).map((o) => o.value),
        allows: (response, stage) => {
            const option = find(response);
            return Boolean(option) && (!stage || isStageAllowed(option!, stage));
        },
        noFollowUp: (response) => {
            const option = find(response);
            return option ? noFollowUpFromMeta(option.meta) : false;
        },
    };
}

export function useOpportunityResponseConfig(): OpportunityResponseConfig {
    const configs = useFormConfigs();
    return useMemo(() => opportunityResponseConfig(configs), [configs]);
}
