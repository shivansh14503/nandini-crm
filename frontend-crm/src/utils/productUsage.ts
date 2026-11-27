import { ROUTES } from '@/config/constants';
import type { ProductUsage } from '@/types/product.types';
import { CLOSED_STAGES } from './opportunityResponseRules';

/**
 * Product usage (Products view page, drawer and list) and the matching Opportunities list filter. Usage is computed
 * by the API (backend-crm/src/modules/products/product.usage.ts): Used once any opportunity line item carries the
 * product. These are system values, not dropdown options, so they are named here once.
 */
export const PRODUCT_USAGE_STATUSES = ['Used', 'Unused'] as const;
export type ProductUsageStatus = (typeof PRODUCT_USAGE_STATUSES)[number];

/** 'Used' / 'Unused', or null when the record came without usage (global search results). */
export function usageStatusOf(usage: ProductUsage | undefined): ProductUsageStatus | null {
    if (!usage) return null;
    return usage.total > 0 ? 'Used' : 'Unused';
}

/** How an opportunity ended: Closed Won, Closed Lost, or still Open (every other stage). */
export const OPPORTUNITY_OUTCOMES = ['Won', 'Lost', 'Open'] as const;
export type OpportunityOutcome = (typeof OPPORTUNITY_OUTCOMES)[number];

export function outcomeOfStage(stage: string | null | undefined): OpportunityOutcome {
    const value = (stage ?? '').trim();
    if (!CLOSED_STAGES.has(value)) return 'Open';
    return value === 'Closed Won' ? 'Won' : 'Lost';
}

/** Opportunities list Filter dialog keys the product links fill in (opportunityColumns / TableFilter pseudo field). */
export const OPPORTUNITY_PRODUCTS_FILTER_KEY = 'products';
export const OPPORTUNITY_OUTCOME_FILTER_KEY = 'outcome';

/** URL parameters of the link from a product's usage counts to the Opportunities list. */
export const PRODUCT_LINK_PARAM = 'product';
export const OUTCOME_LINK_PARAM = 'outcome';

/** The Opportunities list filtered to the product (and one outcome, when given). */
export function productOpportunitiesHref(productId: string, outcome?: OpportunityOutcome): string {
    const params = new URLSearchParams({ [PRODUCT_LINK_PARAM]: productId });
    if (outcome) params.set(OUTCOME_LINK_PARAM, outcome);
    return `${ROUTES.OPPORTUNITIES}?${params.toString()}`;
}
