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
    /** `/api/user-photos/<id>`; null (or absent) when the user has no profile photo. */
    photoUrl?: string | null;
    /**
     * The user's own out-of-office range (inclusive business days, `YYYY-MM-DD`), null when unset or ended. Whether
     * it applies today is decided on the client (`userAwayStatus`). Absent from older payloads.
     */
    outOfOffice?: { from: string; to: string; message: string | null } | null;
}

export const CRM_USER_DEPARTMENTS: CrmUserDepartment[] = ['Sales', 'Support', 'Accounts', 'IT', 'Management'];
