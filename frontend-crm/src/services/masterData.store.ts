import type { CrmUser } from '../types/user.types';
import type { NatureOfCallItem } from '../types/ticket.types';
import type { PartnerCompany, PartnerCompanyContact } from '../types/partner.types';

/**
 * Master data loaded from `/api/lookups/*` after sign-in (`loadMasterData`, shared through `useMasterData`).
 * The synchronous getters below serve validation schemas and formatters that can't use hooks; components
 * call `useMasterData()` so they re-render when the data arrives. Dependency-free on purpose.
 */
export interface MasterData {
    users: CrmUser[];
    natureOfCalls: NatureOfCallItem[];
    partnerCompanies: PartnerCompany[];
    partnerContacts: PartnerCompanyContact[];
}

const EMPTY: MasterData = { users: [], natureOfCalls: [], partnerCompanies: [], partnerContacts: [] };

let masters: MasterData = EMPTY;

/** Empty lists until `loadMasterData()` has run. */
export const getMasterData = (): MasterData => masters;

export function setMasterData(data: MasterData): void {
    masters = data;
}

export function clearMasterData(): void {
    masters = EMPTY;
}

/** The user directory (`/api/lookups/users`, inactive users included so old assignments still resolve). */
export const getCrmUsers = (): CrmUser[] => masters.users;

/** Nature of Call master (`/api/lookups/nature-of-calls`). */
export const getNatureOfCalls = (): NatureOfCallItem[] => masters.natureOfCalls;

/** Partner companies (`/api/lookups/partner-companies`). */
export const getPartnerCompanies = (): PartnerCompany[] => masters.partnerCompanies;

/** Partner contacts (`/api/lookups/partner-contacts`). */
export const getPartnerContacts = (): PartnerCompanyContact[] => masters.partnerContacts;

/** Active users only: the pool every "Assigned to" picker draws from. */
export const getActiveUsers = (): CrmUser[] => masters.users.filter((x) => x.status === 'Active');

/** Active, non-group user display names (full name, falling back to username) for assignee autocomplete. */
export function getAssignableUserNames(): string[] {
    return masters.users.filter((x) => x.status === 'Active' && !x.isGroupUser).map((x) => x.name || x.username);
}

/** Resolves a stored username (or name) to the user's full name; unknown values are shown as-is. */
export function formatCrmUserDisplay(value: string | undefined): string {
    return findCrmUser(value)?.name || value || '';
}

/** Active, non-group usernames: autocomplete suggestions for assignee fields. */
export function getAssignableUsernames(): string[] {
    return masters.users.filter((x) => x.status === 'Active' && !x.isGroupUser).map((x) => x.username);
}

/** Finds a user by username or display name (tolerates legacy suffixes like "name (You)"). */
export function findCrmUser(value: string | undefined): CrmUser | undefined {
    const v = (value || '').replace(/\s*\(You\)\s*$/i, '').trim().toLowerCase();
    if (!v) return undefined;
    return masters.users.find((x) => x.username.toLowerCase() === v || x.name.toLowerCase() === v);
}
