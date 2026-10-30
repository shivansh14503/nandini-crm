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

export type NatureOfCallPriority = 'High' | 'Medium' | 'Low';

/** One entry of the Nature of Call master (see `data/mockNatureOfCalls.ts`). */
export interface NatureOfCallItem {
    id: string;
    name: string;
    priority: NatureOfCallPriority;
}

/** Ticket priority suggested by a nature of call's own priority (the master has no "Urgent"/"Normal"). */
export const NATURE_PRIORITY_TO_TICKET_PRIORITY: Record<NatureOfCallPriority, TicketPriority> = {
    High: 'High',
    Medium: 'Normal',
    Low: 'Low',
};

export interface TicketFormData {
    // Overview — left column
    amcFlag: boolean;
    ticketSubject: string;
    organizationName: string;
    organizationId?: string;
    contactPersonName: string;
    contactId?: string;
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
    /** Name from the Nature of Call master. */
    natureOfCall: string;
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

export const isTicketOpen = (t: Pick<Ticket, 'ticketStatus'>) => !TICKET_CLOSED_STATUSES.includes(t.ticketStatus);

export const isTicketOverdue = (t: Pick<Ticket, 'ticketStatus' | 'dueDate'>, now = Date.now()) =>
    isTicketOpen(t) && Boolean(t.dueDate) && new Date(t.dueDate).getTime() < now;
