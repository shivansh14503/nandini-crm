import { FIELD_MAX_LENGTH } from '@/config/fieldLimits';
import type { Opportunity } from '@/types/opportunity.types';

/**
 * `value` cut to at most `maxLength` characters, ending in '…' when cut (never splitting a surrogate pair). Same rule
 * as the backend `clipLabel` (backend-crm/src/modules/shared/opportunityLabel.ts), so stored labels match.
 */
export function clipLabel(value: string, maxLength: number): string {
    if (value.length <= maxLength) return value;
    let end = Math.max(0, maxLength - 1);
    const last = value.charCodeAt(end - 1);
    if (last >= 0xd800 && last <= 0xdbff) end -= 1;
    return `${value.slice(0, end).trimEnd()}…`;
}

/**
 * How an opportunity reads in pickers and on records that link to one (a Contract stores it as its `opportunity`
 * text, an Activity as its Related To): its name, else its product categories, else its organization, as the
 * opportunity list's title does. Cut to the 200-character label columns, as the backend does, because the product
 * list has no length bound.
 */
export const opportunityLabel = (o: Pick<Opportunity, 'opportunityName' | 'productCategory' | 'organizationName'>): string =>
    clipLabel(o.opportunityName || (o.productCategory ?? []).join(', ') || o.organizationName, FIELD_MAX_LENGTH.title);
