export type OpportunityFilterTab =
    | 'all'
    | 'open'
    | 'closing_soon'
    | 'won'
    | 'my_deals'
    | 'high_value';

/** Any column's field key: the table sorts on `row[sortField]`, including columns added from the form. */
export type OpportunitySortField = string;
