import type { Ticket, TicketFormData } from '../types/ticket.types';

const TICKETS_STORAGE_KEY = 'nandini_crm_tickets_data_v1';

const DAY = 86400000;

/** Formats a Date as the `YYYY-MM-DDTHH:mm` value used by datetime-local inputs. */
export function toLocalDateTimeInput(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const dueIn = (days: number, hour = 18) => {
    const d = new Date(Date.now() + days * DAY);
    d.setHours(hour, 0, 0, 0);
    return toLocalDateTimeInput(d);
};

const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();

const BLANK: TicketFormData = {
    amcFlag: false,
    ticketSubject: '',
    organizationName: '',
    contactPersonName: '',
    contactNumber: '',
    ticketPriority: 'Normal',
    source: 'Call',
    supportType: 'Free',
    problemReported: '',
    resolution: '',
    reasonForEscalatedCalls: '',
    assignedTo: 'mittal.sharma',
    cloudFlag: false,
    natureOfCall: '',
    accountAddress: '',
    contactEmail: '',
    leftJob: 'No',
    ticketStatus: 'New',
    dueDate: '',
    supportMode: 'Offsite Support',
    problemObserved: '',
    rca: '',
    addDescription: '',
    partnerCompany: '',
    partnerCompanyContact: '',
};

let seq = 1000;
const t = (createdDaysAgo: number, data: Partial<TicketFormData>): Ticket => {
    seq += 1;
    return {
        ...BLANK,
        ...data,
        id: `tic-${seq}`,
        ticketNumber: `TIC-${seq}`,
        createdAt: ago(createdDaysAgo),
        updatedAt: ago(Math.max(0, createdDaysAgo - 1)),
        createdBy: 'mittal.sharma',
    };
};

const SAMPLE_TICKETS: Ticket[] = [
    t(1, {
        ticketSubject: 'TallyPrime 4.0 data sync failing with head office',
        organizationName: 'Zenith Cloud Infotech LLP',
        contactPersonName: 'Rohan Bhatia',
        contactNumber: '9810012345',
        contactEmail: 'rohan.bhatia@zenithcloud.in',
        ticketPriority: 'Urgent',
        source: 'Call',
        supportType: 'AMC',
        amcFlag: true,
        cloudFlag: true,
        natureOfCall: 'Sync Failure',
        ticketStatus: 'In Progress',
        supportMode: 'Remote Support (AnyDesk/TeamViewer)',
        dueDate: dueIn(0, 20),
        assignedTo: 'shashi.ranjan',
        problemReported: 'Branch data is not syncing to the head office company since the upgrade to TallyPrime 4.0. Sync log shows "Connection refused" at 2 AM schedule.',
        problemObserved: 'Sync port 9000 blocked on the HO server after a Windows Firewall policy update.',
        accountAddress: 'Plot 22, Sector 62, Noida, Uttar Pradesh 201301',
    }),
    t(2, {
        ticketSubject: 'GST e-Invoice IRN generation failing',
        organizationName: 'Shree Ganesh Steels & Alloys',
        contactPersonName: 'Ashok Agarwal',
        contactNumber: '9829011223',
        contactEmail: 'accounts@shreeganeshsteels.com',
        ticketPriority: 'High',
        source: 'WhatsApp',
        supportType: 'Paid',
        natureOfCall: 'Error Resolution',
        ticketStatus: 'Escalated',
        supportMode: 'Remote Support (AnyDesk/TeamViewer)',
        dueDate: dueIn(-1),
        assignedTo: 'gagan.gupta',
        problemReported: 'e-Invoice upload returns error 2150 "Duplicate IRN" for new invoices.',
        reasonForEscalatedCalls: 'Customer has 40+ invoices pending dispatch; escalated to senior support for GSP credential reset.',
        problemObserved: 'Voucher numbering restarted after year split, causing duplicate document numbers on the IRP.',
    }),
    t(3, {
        ticketSubject: 'Cloud gateway timeout on Tally On Cloud',
        organizationName: 'Kailash Logistics & Cargo Hub',
        contactPersonName: 'Meena Joshi',
        contactNumber: '9876501234',
        contactEmail: 'meena.joshi@kailashlogistics.in',
        ticketPriority: 'High',
        source: 'Email',
        supportType: 'AMC',
        amcFlag: true,
        cloudFlag: true,
        natureOfCall: 'Error Resolution',
        ticketStatus: 'Pending Customer',
        supportMode: 'Remote Support (AnyDesk/TeamViewer)',
        dueDate: dueIn(1),
        assignedTo: 'deepak.joshi',
        problemReported: 'Users get "Gateway timeout" while opening Tally on Cloud after 11 AM daily.',
        problemObserved: 'Concurrent session limit reached; 3 stale sessions not logging off.',
        resolution: 'Cleared stale sessions and set idle-logoff to 30 minutes. Waiting for customer confirmation.',
    }),
    t(4, {
        ticketSubject: 'New TallyPrime installation on 5 nodes',
        organizationName: 'Laxmi Cotspin & Textiles Ltd',
        contactPersonName: 'Suresh Patel',
        contactNumber: '9898012345',
        ticketPriority: 'Normal',
        source: 'Call',
        supportType: 'Paid',
        natureOfCall: 'Installation',
        ticketStatus: 'Assigned',
        supportMode: 'Onsite Support',
        dueDate: dueIn(3, 11),
        assignedTo: 'anil.verma',
        problemReported: 'Install TallyPrime Gold multi-user license on server + 4 client machines and configure data path.',
        partnerCompany: 'Tally Solutions Pvt Ltd',
        partnerCompanyContact: 'Channel Desk – North',
    }),
    t(5, {
        ticketSubject: 'Company data corruption after power failure',
        organizationName: 'R.K. Marble & Granite Works',
        contactPersonName: 'Rakesh Kumar',
        contactNumber: '9414012345',
        ticketPriority: 'Urgent',
        source: 'Call',
        supportType: 'Free',
        natureOfCall: 'Data Corruption',
        ticketStatus: 'Resolved',
        supportMode: 'Remote Support (AnyDesk/TeamViewer)',
        dueDate: dueIn(-4),
        assignedTo: 'shashi.ranjan',
        problemReported: 'Company does not open — "Data is corrupted, please repair" message.',
        problemObserved: 'Ledger index corrupted (tranmgr.900 mismatch).',
        resolution: 'Repaired data using Tally repair utility and restored 2 missing vouchers from backup.',
        rca: 'Unclean shutdown during voucher save. Advised UPS for server and daily auto-backup.',
    }),
    t(6, {
        ticketSubject: 'Training for new accounts staff on GST returns',
        organizationName: 'Vidyapeeth Learning Academy',
        contactPersonName: 'Pooja Sinha',
        contactNumber: '9811122233',
        contactEmail: 'pooja.sinha@vidyapeeth.edu.in',
        ticketPriority: 'Low',
        source: 'Web Portal',
        supportType: 'Paid',
        natureOfCall: 'Training',
        ticketStatus: 'New',
        supportMode: 'Onsite Support',
        dueDate: dueIn(7, 10),
        assignedTo: 'palak',
        problemReported: 'Two-session training on GSTR-1 and GSTR-3B filing from TallyPrime for 3 new staff.',
    }),
    t(6, {
        ticketSubject: 'License reactivation after server change',
        organizationName: 'Apollo Diagnostics & Health Ltd',
        contactPersonName: 'Dr. Nikhil Rao',
        contactNumber: '9845012345',
        ticketPriority: 'High',
        source: 'Call',
        supportType: 'Warranty',
        natureOfCall: 'License Reactivation',
        ticketStatus: 'Closed',
        supportMode: 'Phone Consultation',
        dueDate: dueIn(-5),
        assignedTo: 'gagan.gupta',
        problemReported: 'License shows "Educational mode" after migrating Tally to a new server.',
        resolution: 'Surrendered license from old server via Control Centre and reactivated on new server.',
        rca: 'License not surrendered before hardware change.',
    }),
    t(8, {
        ticketSubject: 'Custom invoice format – add bank QR code',
        organizationName: 'Kalyan Jewellers & Retailers',
        contactPersonName: 'Arvind Menon',
        contactNumber: '9847012345',
        ticketPriority: 'Normal',
        source: 'Email',
        supportType: 'Paid',
        natureOfCall: 'Customization Issue',
        ticketStatus: 'In Progress',
        supportMode: 'Offsite Support',
        dueDate: dueIn(2),
        assignedTo: 'manish.yadav',
        problemReported: 'Need UPI QR code and bank details printed on the sales invoice TDL.',
        partnerCompany: 'TDL Works Pvt Ltd',
        partnerCompanyContact: 'Sandeep Rawat – 9811098110',
    }),
    t(9, {
        ticketSubject: 'Multi-currency configuration for export billing',
        organizationName: 'Sunrise Packaging & Boxes Ltd',
        contactPersonName: 'Kiran Desai',
        contactNumber: '9920012345',
        ticketPriority: 'Normal',
        source: 'Chat',
        supportType: 'AMC',
        amcFlag: true,
        natureOfCall: 'Tally Configuration',
        ticketStatus: 'Resolved',
        supportMode: 'Remote Support (AnyDesk/TeamViewer)',
        dueDate: dueIn(-6),
        assignedTo: 'shashi.ranjan',
        problemReported: 'Enable USD/EUR billing with forex gain/loss on realisation.',
        resolution: 'Configured currencies, rates of exchange and forex ledger. Demonstrated to user.',
    }),
    t(10, {
        ticketSubject: 'Bank reconciliation statement import error',
        organizationName: 'Om Logistics & Freight Express',
        contactPersonName: 'Harish Chandra',
        contactNumber: '9811045678',
        ticketPriority: 'Normal',
        source: 'Call',
        supportType: 'Free',
        natureOfCall: 'Error Resolution',
        ticketStatus: 'Closed',
        supportMode: 'Phone Consultation',
        dueDate: dueIn(-8),
        assignedTo: 'rohit.chauhan',
        problemReported: 'HDFC bank statement Excel import fails with "Invalid date format".',
        resolution: 'Mapped date column to DD-MM-YYYY in the import template.',
    }),
    t(12, {
        ticketSubject: 'Payroll module set-up for 60 employees',
        organizationName: 'TechnoServe Electronics India',
        contactPersonName: 'Lata Iyer',
        contactNumber: '9840012345',
        ticketPriority: 'Low',
        source: 'In-Person',
        supportType: 'Paid',
        natureOfCall: 'Tally Configuration',
        ticketStatus: 'Pending Customer',
        supportMode: 'Onsite Support',
        dueDate: dueIn(-2),
        assignedTo: 'anil.verma',
        problemReported: 'Configure payroll with PF/ESI/PT and attendance import.',
        problemObserved: 'Waiting for employee master data in the agreed Excel format.',
    }),
    t(14, {
        ticketSubject: 'How to carry forward closing stock to new FY',
        organizationName: 'Mahalaxmi Agro Products & Seeds',
        contactPersonName: 'Ganesh Pawar',
        contactNumber: '9822012345',
        ticketPriority: 'Low',
        source: 'Call',
        supportType: 'Free',
        natureOfCall: 'General Query',
        ticketStatus: 'Closed',
        supportMode: 'Phone Consultation',
        dueDate: dueIn(-13),
        assignedTo: 'pooja.bansal',
        problemReported: 'Customer asked how opening stock is carried forward after split company data.',
        resolution: 'Explained split company process and verified opening balances on call.',
    }),
    t(3, {
        ticketSubject: 'Tally server not starting after Windows update',
        organizationName: 'CareWell Pharma & Chemicals',
        contactPersonName: 'Neeraj Malhotra',
        contactNumber: '9811567890',
        contactEmail: 'it@carewellpharma.in',
        ticketPriority: 'Urgent',
        source: 'Call',
        supportType: 'AMC',
        amcFlag: true,
        natureOfCall: 'Error Resolution',
        ticketStatus: 'Assigned',
        supportMode: 'Onsite Support',
        dueDate: dueIn(-1, 12),
        assignedTo: 'mittal.sharma',
        problemReported: 'TallyPrime Server service fails to start; 25 users unable to log in.',
        reasonForEscalatedCalls: 'Business-critical: billing stopped at all 3 depots.',
    }),
    t(5, {
        ticketSubject: 'Biz Analyst mobile app not showing latest data',
        organizationName: 'Matrix Telecom & Hardware',
        contactPersonName: 'Sunil Arora',
        contactNumber: '9811678901',
        ticketPriority: 'Normal',
        source: 'WhatsApp',
        supportType: 'Free',
        cloudFlag: true,
        natureOfCall: 'Sync Failure',
        ticketStatus: 'New',
        supportMode: 'Remote Support (AnyDesk/TeamViewer)',
        dueDate: dueIn(1, 15),
        assignedTo: 'mittal.sharma',
        problemReported: 'Biz Analyst app shows data only up to last week.',
        partnerCompany: 'Biz Analyst (Mobile Pundits)',
        partnerCompanyContact: 'support@bizanalyst.in',
    }),
    t(16, {
        ticketSubject: 'Tally on Cloud user onboarding',
        organizationName: 'Dynamic System Integrators Pvt',
        contactPersonName: 'Varun Khanna',
        contactNumber: '9811789012',
        ticketPriority: 'Normal',
        source: 'Email',
        supportType: 'Paid',
        cloudFlag: true,
        natureOfCall: 'Installation',
        ticketStatus: 'Resolved',
        supportMode: 'Remote Support (AnyDesk/TeamViewer)',
        dueDate: dueIn(-14),
        assignedTo: 'deepak.joshi',
        problemReported: 'Create 4 cloud users, migrate company data and map printers.',
        resolution: 'Users created, data migrated, printer redirection enabled.',
    }),
    t(2, {
        ticketSubject: 'TDS on rent not calculating in payment voucher',
        organizationName: 'Superb Interior & Architecture Lab',
        contactPersonName: 'Ritika Bose',
        contactNumber: '9830012345',
        ticketPriority: 'High',
        source: 'Call',
        supportType: 'Free',
        natureOfCall: 'Tally Configuration',
        ticketStatus: 'In Progress',
        supportMode: 'Remote Support (AnyDesk/TeamViewer)',
        dueDate: dueIn(0, 17),
        assignedTo: 'mittal.sharma',
        problemReported: 'TDS u/s 194-I not deducted automatically on rent payments.',
        problemObserved: 'Party ledger missing deductee type and nature of payment.',
    }),
    t(20, {
        ticketSubject: 'Upgrade from ERP 9 to TallyPrime',
        organizationName: 'Bharat Heavy Electricals & Engg',
        contactPersonName: 'Prakash Singh',
        contactNumber: '9811890123',
        ticketPriority: 'Normal',
        source: 'Web Portal',
        supportType: 'Paid',
        natureOfCall: 'Installation',
        ticketStatus: 'Closed',
        supportMode: 'Onsite Support',
        dueDate: dueIn(-17),
        assignedTo: 'anil.verma',
        problemReported: 'Migrate 6 years of ERP 9 data to TallyPrime 4.0.',
        resolution: 'Data migrated and verified with trial balance for each year.',
        rca: 'N/A – planned upgrade.',
    }),
    t(0, {
        ticketSubject: 'Stock summary showing negative quantities',
        organizationName: 'Vanguard Security & Surveillance',
        contactPersonName: 'Aman Gill',
        contactNumber: '9814012345',
        ticketPriority: 'Normal',
        source: 'Chat',
        supportType: 'Free',
        natureOfCall: 'General Query',
        ticketStatus: 'New',
        supportMode: 'Phone Consultation',
        dueDate: dueIn(2, 12),
        assignedTo: 'govind.tandon',
        problemReported: 'Several CCTV camera items show negative closing stock.',
    }),
];

export function getStoredTickets(): Ticket[] {
    if (typeof window === 'undefined') return SAMPLE_TICKETS;
    try {
        const raw = localStorage.getItem(TICKETS_STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
    } catch {}
    saveStoredTickets(SAMPLE_TICKETS);
    return SAMPLE_TICKETS;
}

export function saveStoredTickets(tickets: Ticket[]): void {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(TICKETS_STORAGE_KEY, JSON.stringify(tickets));
    } catch {}
}

export function getStoredTicketById(id: string): Ticket | undefined {
    return getStoredTickets().find((tk) => tk.id === id);
}

export function addStoredTicket(data: TicketFormData): Ticket {
    const list = getStoredTickets();
    const now = new Date().toISOString();
    const maxSeq = list.reduce((max, tk) => {
        const n = parseInt(tk.ticketNumber.replace(/\D/g, ''), 10);
        return Number.isNaN(n) ? max : Math.max(max, n);
    }, 1000);
    const nextSeq = maxSeq + 1;
    const newTicket: Ticket = {
        ...BLANK,
        ...data,
        id: `tic-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        ticketNumber: `TIC-${nextSeq}`,
        createdAt: now,
        updatedAt: now,
        createdBy: 'mittal.sharma',
    };
    saveStoredTickets([newTicket, ...list]);
    return newTicket;
}

export function updateStoredTicket(id: string, updates: Partial<TicketFormData>): Ticket | null {
    const list = getStoredTickets();
    const idx = list.findIndex((tk) => tk.id === id);
    if (idx === -1) return null;
    const updated: Ticket = { ...list[idx], ...updates, updatedAt: new Date().toISOString() };
    list[idx] = updated;
    saveStoredTickets(list);
    return updated;
}

export function deleteStoredTicket(id: string): boolean {
    const list = getStoredTickets();
    const filtered = list.filter((tk) => tk.id !== id);
    if (filtered.length === list.length) return false;
    saveStoredTickets(filtered);
    return true;
}

export function deleteMultipleStoredTickets(ids: string[]): boolean {
    const idSet = new Set(ids);
    saveStoredTickets(getStoredTickets().filter((tk) => !idSet.has(tk.id)));
    return true;
}
