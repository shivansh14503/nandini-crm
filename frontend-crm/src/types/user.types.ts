// ─── CRM User Directory Types ─────────────────────────────────────────────────

export type CrmUserDepartment = 'Sales' | 'Support' | 'Accounts' | 'IT' | 'Management';

export type CrmUserStatus = 'Active' | 'Inactive';

/** An employee in the CRM user directory (assignees, owners, sponsors). */
export interface CrmUser {
    id: string;
    name: string;
    username: string;
    department: CrmUserDepartment;
    role: string;
    email: string;
    status: CrmUserStatus;
    isGroupUser: boolean;
    onLeave: boolean;
}

export const CRM_USER_DEPARTMENTS: CrmUserDepartment[] = ['Sales', 'Support', 'Accounts', 'IT', 'Management'];
