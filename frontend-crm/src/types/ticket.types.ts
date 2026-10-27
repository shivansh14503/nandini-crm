// ─── Support Ticket Types ─────────────────────────────────────────────────────

export type TicketPriority = 'Low' | 'Normal' | 'High' | 'Urgent';

export type TicketStatus =
    | 'New'
    | 'Assigned'
    | 'In Progress'
    | 'Pending Customer'
    | 'Escalated'
    | 'Resolved'
    | 'Closed';

export type TicketSource = 'Call' | 'Email' | 'Web Portal' | 'Chat' | 'In-Person' | 'WhatsApp';

export type SupportType = 'Free' | 'Paid' | 'AMC' | 'Warranty';

export type SupportMode =
    | 'Offsite Support'
    | 'Onsite Support'
    | 'Remote Support (AnyDesk/TeamViewer)'
    | 'Phone Consultation';

export type NatureOfCall =
    | 'Installation'
    | 'Training'
    | 'Data Corruption'
    | 'Customization Issue'
    | 'Tally Configuration'
    | 'Error Resolution'
    | 'License Reactivation'
    | 'Sync Failure'
    | 'General Query';

export interface TicketFormData {
    // Overview — left column
    amcFlag: boolean;
    ticketSubject: string;
    organizationName: string;
    contactPersonName: string;
    contactNumber: string;
    ticketPriority: TicketPriority;
    source: TicketSource;
    supportType: SupportType;
    problemReported: string;
    resolution: string;
    reasonForEscalatedCalls: string;
    assignedTo: string;

    // Overview — right column
    cloudFlag: boolean;
    natureOfCall: NatureOfCall | '';
    accountAddress: string;
    contactEmail: string;
    leftJob: 'No' | 'Yes';
    ticketStatus: TicketStatus;
    /** Local date-time, `YYYY-MM-DDTHH:mm`. */
    dueDate: string;
    supportMode: SupportMode;
    problemObserved: string;
    rca: string;
    addDescription: string;

    // Partner Company tab
    partnerCompany: string;
    partnerCompanyContact: string;
}

export interface Ticket extends TicketFormData {
    id: string;
    /** e.g. "TIC-1024" */
    ticketNumber: string;
    createdAt: string;
    updatedAt: string;
    createdBy: string;
}

export const TICKET_PRIORITIES: TicketPriority[] = ['Low', 'Normal', 'High', 'Urgent'];

export const TICKET_STATUSES: TicketStatus[] = [
    'New',
    'Assigned',
    'In Progress',
    'Pending Customer',
    'Escalated',
    'Resolved',
    'Closed',
];

/** Statuses that count as finished work (not open, never overdue). */
export const TICKET_CLOSED_STATUSES: TicketStatus[] = ['Resolved', 'Closed'];

export const TICKET_SOURCES: TicketSource[] = ['Call', 'Email', 'Web Portal', 'Chat', 'In-Person', 'WhatsApp'];

export const SUPPORT_TYPES: SupportType[] = ['Free', 'Paid', 'AMC', 'Warranty'];

export const SUPPORT_MODES: SupportMode[] = [
    'Offsite Support',
    'Onsite Support',
    'Remote Support (AnyDesk/TeamViewer)',
    'Phone Consultation',
];

export const NATURES_OF_CALL: NatureOfCall[] = [
    'Installation',
    'Training',
    'Data Corruption',
    'Customization Issue',
    'Tally Configuration',
    'Error Resolution',
    'License Reactivation',
    'Sync Failure',
    'General Query',
];

export const isTicketOpen = (t: Pick<Ticket, 'ticketStatus'>) => !TICKET_CLOSED_STATUSES.includes(t.ticketStatus);

export const isTicketOverdue = (t: Pick<Ticket, 'ticketStatus' | 'dueDate'>, now = Date.now()) =>
    isTicketOpen(t) && Boolean(t.dueDate) && new Date(t.dueDate).getTime() < now;
