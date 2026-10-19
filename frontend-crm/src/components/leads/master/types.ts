export type LeadFilterTab = 'all' | 'hot' | 'new' | 'followup_today' | 'my_leads';

export type LeadSortField =
    | 'name'
    | 'organizationName'
    | 'mobile'
    | 'leadType'
    | 'status'
    | 'nextFollowupDate'
    | 'assignedTo'
    | 'createdAt';
