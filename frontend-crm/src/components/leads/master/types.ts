/** Quick view pill; `'all'` means no pill is active. */
export type LeadFilterTab = 'all' | 'hot' | 'followup_today' | 'my_leads';

/** Status summary card buckets: the 9 lead statuses grouped into pipeline stages. */
export type LeadStatusBucket = 'all' | 'new' | 'in_process' | 'converted' | 'lost';

/** Which summary bucket a lead status belongs to (anything not New / Converted / Lost is still in process). */
export function getLeadStatusBucket(status: string | undefined | null): Exclude<LeadStatusBucket, 'all'> {
    const s = (status || 'New').trim();
    if (s === 'New') return 'new';
    if (s === 'Converted') return 'converted';
    if (s.includes('Lost') || s.includes('Unqualified')) return 'lost';
    return 'in_process';
}

export type LeadSortField =
    | 'name'
    | 'organizationName'
    | 'mobile'
    | 'leadType'
    | 'status'
    | 'nextFollowupDate'
    | 'assignedTo'
    | 'createdAt';
