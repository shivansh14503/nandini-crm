import { ACTIVITY_ONLY_FOLLOWUP_TYPES } from '../types/activity.types';

/**
 * Task and Note are Followup Type options (shared_followup_type) offered on Activities only. Leads and opportunities
 * share the dropdown but not those two: their forms hide them, and the API refuses a change to one. A record that
 * already stores one stays editable (the check runs only when the value changes).
 *
 * Mirrors backend-crm/src/modules/shared/followupTypes.ts (checked by backend-crm validators/contractSync.test.ts),
 * so it uses relative imports only.
 */

export const ACTIVITY_ONLY_TYPE_MESSAGE = 'Task and Note can only be used on Activities.';

const key = (value: string | null | undefined) => (value ?? '').trim().toLowerCase();
const ACTIVITY_ONLY_KEYS: ReadonlySet<string> = new Set(ACTIVITY_ONLY_FOLLOWUP_TYPES.map(key));

/** Whether a Followup Type is one offered on Activities only (Task, Note; any case, trimmed). */
export function isActivityOnlyFollowupType(value: string | null | undefined): boolean {
    return ACTIVITY_ONLY_KEYS.has(key(value));
}

/**
 * The lead / opportunity Followup Type issue: a value that becomes Task or Note (`previous` is the stored value on
 * edits, undefined for new records). An unchanged stored Task / Note passes.
 */
export function activityOnlyTypeIssues(value: string | null | undefined, previous?: string | null, path = 'followupType'): { path: string; message: string }[] {
    if (!isActivityOnlyFollowupType(value) || key(value) === key(previous)) return [];
    return [{ path, message: ACTIVITY_ONLY_TYPE_MESSAGE }];
}
