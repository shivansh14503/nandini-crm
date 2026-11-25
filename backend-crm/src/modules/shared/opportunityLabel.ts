import { FIELD_MAX_LENGTH } from '../../config/fieldLimits.js';
import { parseStringArray } from '../../utils/mappers.js';

/**
 * `value` cut to at most `maxLength` characters, ending in '…' when cut (never splitting a surrogate pair), for a
 * display snapshot stored in a column of that width.
 */
export function clipLabel(value: string, maxLength: number): string {
    if (value.length <= maxLength) return value;
    let end = Math.max(0, maxLength - 1);
    const last = value.charCodeAt(end - 1);
    if (last >= 0xd800 && last <= 0xdbff) end -= 1;
    return `${value.slice(0, end).trimEnd()}…`;
}

/**
 * What forms show for an opportunity (frontend `opportunityLabel`, which cuts the same way): its name, else its
 * products, else its organization. Used where a record links to an opportunity (contracts, activities). The product
 * list has no length bound (up to 30 categories), so the label is cut to the 200-character label columns
 * (`Contract.opportunity`, `Activity.relatedTo`) by default.
 */
export function opportunityLabel(
    opportunity: { opportunityName: string | null; productCategoryJson: string | null; organizationName: string },
    maxLength: number = FIELD_MAX_LENGTH.title,
): string {
    const label = opportunity.opportunityName || parseStringArray(opportunity.productCategoryJson).join(', ') || opportunity.organizationName;
    return clipLabel(label, maxLength);
}
