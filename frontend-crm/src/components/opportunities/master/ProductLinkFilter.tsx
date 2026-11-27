'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { FilterCriteria } from '../../common/TableFilter/types';
import {
    OPPORTUNITY_OUTCOME_FILTER_KEY,
    OPPORTUNITY_OUTCOMES,
    OPPORTUNITY_PRODUCTS_FILTER_KEY,
    OUTCOME_LINK_PARAM,
    PRODUCT_LINK_PARAM,
    type OpportunityOutcome,
} from '@/utils/productUsage';

/**
 * Opens the Opportunities list from a product's usage counts (`/opportunities?product=<id>&outcome=Won`): applies
 * the matching Filter dialog conditions (Product, Outcome) once, then drops the parameters from the address so
 * clearing the filter sticks. Rendered inside a Suspense boundary (it reads the search params).
 */
export function ProductLinkFilter({ apply }: { apply: (criteria: FilterCriteria, options?: { remember?: boolean }) => void }) {
    const params = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();
    const productId = params.get(PRODUCT_LINK_PARAM);
    const outcomeParam = params.get(OUTCOME_LINK_PARAM);
    const handled = useRef<string | null>(null);

    useEffect(() => {
        if (!productId) return;
        const key = `${productId}|${outcomeParam ?? ''}`;
        if (handled.current === key) return;
        handled.current = key;
        const outcome = OPPORTUNITY_OUTCOMES.find((o) => o.toLowerCase() === (outcomeParam ?? '').toLowerCase()) as OpportunityOutcome | undefined;
        const conditions: FilterCriteria['conditions'] = { [OPPORTUNITY_PRODUCTS_FILTER_KEY]: { op: 'in', values: [productId] } };
        if (outcome) conditions[OPPORTUNITY_OUTCOME_FILTER_KEY] = { op: 'in', values: [outcome] };
        apply({ conditions }, { remember: false });
        const rest = new URLSearchParams(params.toString());
        rest.delete(PRODUCT_LINK_PARAM);
        rest.delete(OUTCOME_LINK_PARAM);
        const query = rest.toString();
        router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    }, [productId, outcomeParam, apply, params, router, pathname]);

    return null;
}
