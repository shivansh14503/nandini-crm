/** List pills: the fixed views plus one `type:<value>` pill per active Product Type option. */
export type ProductFilterTab = 'all' | 'recently_added' | `type:${string}`;

export const productTypePill = (value: string): ProductFilterTab => `type:${value}`;

/** The Product Type value a pill filters by, or `null` for the fixed views. */
export const typeOfPill = (tab: ProductFilterTab): string | null => (tab.startsWith('type:') ? tab.slice('type:'.length) : null);

export type ProductSortField =
    | 'productName'
    | 'category'
    | 'manufacturer'
    | 'hsnCode'
    | 'mrp'
    | 'taxRate'
    | 'type'
    | 'createdAt';
