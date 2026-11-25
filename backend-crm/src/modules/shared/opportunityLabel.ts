import { parseStringArray } from '../../utils/mappers.js';

/**
 * What forms show for an opportunity (frontend `opportunityLabel`): its name, else its products, else its
 * organization. Used where a record links to an opportunity (contracts, activities).
 */
export function opportunityLabel(opportunity: { opportunityName: string | null; productCategoryJson: string | null; organizationName: string }): string {
    return opportunity.opportunityName || parseStringArray(opportunity.productCategoryJson).join(', ') || opportunity.organizationName;
}
