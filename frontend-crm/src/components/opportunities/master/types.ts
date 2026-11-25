/** Quick view pills ('all' = none); the sales stage is picked on the stage cards. */
export type OpportunityFilterTab =
    | 'all'
    | 'open'
    | 'followup_today'
    | 'my_deals'
    | 'high_value';

/** Any column's field key: the table sorts on `row[sortField]`, including columns added from the form. */
export type OpportunitySortField = string;
