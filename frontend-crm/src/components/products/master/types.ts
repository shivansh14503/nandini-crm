/**
 * List pills: the fixed views plus one `status:<value>` pill per Status option and one `type:<value>` pill per active
 * Product Type option (both from Admin › Dropdown Manager).
 */
export type ProductFilterTab = 'all' | 'recently_added' | `type:${string}` | `status:${string}`;

export const productTypePill = (value: string): ProductFilterTab => `type:${value}`;
export const productStatusPill = (value: string): ProductFilterTab => `status:${value}`;

/** The Product Type value a pill filters by, or `null` for the other views. */
export const typeOfPill = (tab: ProductFilterTab): string | null => (tab.startsWith('type:') ? tab.slice('type:'.length) : null);

/** The Status value a pill filters by, or `null` for the other views. */
export const statusOfPill = (tab: ProductFilterTab): string | null => (tab.startsWith('status:') ? tab.slice('status:'.length) : null);

export type ProductSortField =
    | 'productName'
    | 'productCategory'
    | 'manufacturer'
    | 'hsnCode'
    | 'mrp'
    | 'taxRate'
    | 'type'
    | 'createdAt';
