export type TicketFilterTab = 'all' | 'my' | 'open' | 'high_priority' | 'recently_added';

export type TicketSortField =
    | 'ticketNumber'
    | 'organizationName'
    | 'contactPersonName'
    | 'ticketPriority'
    | 'ticketStatus'
    | 'natureOfCall'
    | 'dueDate'
    | 'assignedTo';
