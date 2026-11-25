import type { Opportunity } from '@/types/opportunity.types';

/**
 * How an opportunity reads in pickers and on records that link to one (a Contract stores it as its `opportunity`
 * text): its name, else its product categories, else its organization, as the opportunity list's title does.
 */
export const opportunityLabel = (o: Pick<Opportunity, 'opportunityName' | 'productCategory' | 'organizationName'>): string =>
    o.opportunityName || (o.productCategory ?? []).join(', ') || o.organizationName;
