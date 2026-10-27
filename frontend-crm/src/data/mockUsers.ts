import type { CrmUser } from '../types/user.types';

export type { CrmUser } from '../types/user.types';

const u = (
    id: number,
    name: string,
    username: string,
    department: CrmUser['department'],
    role: string,
    email: string,
    extra: Partial<Pick<CrmUser, 'status' | 'isGroupUser' | 'onLeave'>> = {}
): CrmUser => ({
    id: `usr-${String(id).padStart(3, '0')}`,
    name,
    username,
    department,
    role,
    email,
    status: 'Active',
    isGroupUser: false,
    onLeave: false,
    ...extra,
});

/**
 * Employee directory seeded from the legacy CRM (crm.nandiniinfosys.in) plus the
 * usernames already referenced by mock leads, contacts and organizations.
 */
export const MOCK_USERS: CrmUser[] = [
    // Legacy CRM users
    u(1, 'Mittal Sharma', 'mittal.sharma', 'Sales', 'Senior Sales Specialist', 'mittal.sharma@nandiniinfosys.com'),
    u(2, 'Shashi Ranjan', 'shashi.ranjan', 'Support', 'Support Specialist', 'shashi.ranjan@nandiniinfosys.com'),
    u(3, 'Govind Tandon', 'govind.tandon', 'Sales', 'Sales Manager', 'govind@nandiniinfosys.com'),
    u(4, 'Gagan Gupta', 'gagan.gupta', 'Support', 'Support Engineer', 'gagan@nandiniinfosys.com'),
    u(5, 'Palak Kumari', 'palak', 'Sales', 'Sales Executive', 'palak@nandiniinfosys.com'),
    u(6, 'Nupur Jangra', 'nupur', 'Sales', 'Sales Executive', 'nupur.jangra@nandiniinfosys.com'),

    // Users referenced across existing CRM records
    u(7, 'Rahul Verma', 'rahul.verma', 'Sales', 'Key Account Manager', 'rahul.verma@nandiniinfosys.com'),
    u(8, 'Priya Singh', 'priya.singh', 'Sales', 'Sales Executive', 'priya.singh@nandiniinfosys.com'),
    u(9, 'Amit Patel', 'amit.patel', 'Sales', 'Business Development Executive', 'amit.patel@nandiniinfosys.com'),
    u(10, 'Vikram Seth', 'vikram.seth', 'Management', 'Regional Sales Head', 'vikram.seth@nandiniinfosys.com'),
    u(11, 'Bhanu Pratap', 'bhanu.pratap', 'Sales', 'Sales Executive', 'bhanu.pratap@nandiniinfosys.com'),
    u(12, 'Neha Kapoor', 'neha.kapoor', 'Sales', 'Inside Sales Executive', 'neha.kapoor@nandiniinfosys.com', { onLeave: true }),
    u(13, 'Neha Gupta', 'neha.gupta', 'Sales', 'Sales Executive', 'neha.gupta@nandiniinfosys.com'),
    u(14, 'Amit Verma', 'amit.verma', 'Sales', 'Senior Sales Executive', 'amit.verma@nandiniinfosys.com'),
    u(15, 'Priya Sharma', 'priya.sharma', 'Sales', 'Telesales Executive', 'priya.sharma@nandiniinfosys.com'),
    u(16, 'Deepa Nair', 'deepa.nair', 'Accounts', 'Accounts Executive', 'deepa.nair@nandiniinfosys.com'),
    u(17, 'Rajesh Kumar', 'rajesh.kumar', 'Sales', 'Area Sales Manager', 'rajesh.kumar@nandiniinfosys.com'),
    u(18, 'Anil Verma', 'anil.verma', 'Support', 'Tally Implementation Consultant', 'anil.verma@nandiniinfosys.com'),
    u(19, 'Deepak Joshi', 'deepak.joshi', 'IT', 'Cloud Infrastructure Engineer', 'deepak.joshi@nandiniinfosys.com'),
    u(20, 'Amit Tandon', 'amit.tandon', 'Sales', 'Channel Sales Manager', 'amit.tandon@nandiniinfosys.com'),

    // Additional team members
    u(21, 'Sanjay Malhotra', 'sanjay.malhotra', 'Management', 'Director – Operations', 'sanjay.malhotra@nandiniinfosys.com'),
    u(22, 'Kavita Arora', 'kavita.arora', 'Accounts', 'Accounts Manager', 'kavita.arora@nandiniinfosys.com'),
    u(23, 'Rohit Chauhan', 'rohit.chauhan', 'Support', 'Support Specialist', 'rohit.chauhan@nandiniinfosys.com', { onLeave: true }),
    u(24, 'Pooja Bansal', 'pooja.bansal', 'Support', 'Customer Success Executive', 'pooja.bansal@nandiniinfosys.com'),
    u(25, 'Manish Yadav', 'manish.yadav', 'IT', 'Tally Customization Developer', 'manish.yadav@nandiniinfosys.com'),
    u(26, 'Ankit Saxena', 'ankit.saxena', 'IT', 'System Administrator', 'ankit.saxena@nandiniinfosys.com'),
    u(27, 'Sneha Rawat', 'sneha.rawat', 'Sales', 'Sales Executive', 'sneha.rawat@nandiniinfosys.com', { status: 'Inactive' }),
    u(28, 'Arjun Mehra', 'arjun.mehra', 'Support', 'Support Engineer', 'arjun.mehra@nandiniinfosys.com', { status: 'Inactive' }),
    u(29, 'Ritu Khanna', 'ritu.khanna', 'Accounts', 'Billing Executive', 'ritu.khanna@nandiniinfosys.com'),

    // Group users (shared queues)
    u(30, 'Sales Team', 'sales.team', 'Sales', 'Group – Sales Queue', 'sales@nandiniinfosys.com', { isGroupUser: true }),
    u(31, 'Support Desk', 'support.desk', 'Support', 'Group – Support Queue', 'support@nandiniinfosys.com', { isGroupUser: true }),
    u(32, 'Accounts Team', 'accounts.team', 'Accounts', 'Group – Accounts Queue', 'accounts@nandiniinfosys.com', { isGroupUser: true }),
];

export function getCrmUsers(): CrmUser[] {
    return MOCK_USERS;
}

/** Active, non-group usernames — handy as autocomplete suggestions for assignee fields. */
export function getAssignableUsernames(): string[] {
    return MOCK_USERS.filter((x) => x.status === 'Active' && !x.isGroupUser).map((x) => x.username);
}

/** Finds a user by username or display name (tolerates legacy suffixes like "mittal.sharma (You)"). */
export function findCrmUser(value: string | undefined): CrmUser | undefined {
    const v = (value || '').replace(/\s*\(You\)\s*$/i, '').trim().toLowerCase();
    if (!v) return undefined;
    return MOCK_USERS.find((x) => x.username.toLowerCase() === v || x.name.toLowerCase() === v);
}
