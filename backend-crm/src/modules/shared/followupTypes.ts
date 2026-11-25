import type { ApiFieldError } from '../../utils/httpError.js';
import { ACTIVITY_ONLY_FOLLOWUP_TYPES, FOLLOWUP_TYPE_CATEGORY_KEY } from '../form-configs/formConfig.defaults.js';

/**
 * Task and Note are Followup Type options (shared_followup_type) offered on Activities only. Leads and opportunities
 * share the dropdown but not those two: their forms hide them, and their APIs refuse a change to one. A record that
 * already stores one stays editable (the check runs only when the value changes), so it is a service check rather
 * than a zod refine: updates parse the stored record merged with the patch.
 */

export const ACTIVITY_ONLY_TYPE_MESSAGE = 'Task and Note can only be used on Activities.';
export const ACTIVITY_ONLY_DEFAULT_MESSAGE = "Task and Note are offered on Activities only, so they can't be the default Followup Type.";

const key = (value: string | null | undefined) => (value ?? '').trim().toLowerCase();
const ACTIVITY_ONLY_KEYS: ReadonlySet<string> = new Set(ACTIVITY_ONLY_FOLLOWUP_TYPES.map(key));

/** Whether a Followup Type is one offered on Activities only (Task, Note; any case, trimmed). */
export function isActivityOnlyFollowupType(value: string | null | undefined): boolean {
    return ACTIVITY_ONLY_KEYS.has(key(value));
}

/**
 * The lead / opportunity Followup Type issue: a value that becomes Task or Note (`previous` is the stored value on
 * updates, undefined for new records). An unchanged stored Task / Note passes.
 */
export function activityOnlyTypeIssues(value: string | null | undefined, previous?: string | null, path = 'followupType'): ApiFieldError[] {
    if (!isActivityOnlyFollowupType(value) || key(value) === key(previous)) return [];
    return [{ path: [path], message: ACTIVITY_ONLY_TYPE_MESSAGE }];
}

/** Form Builder › Dropdowns: Task / Note of the Followup Type list can't be marked as the default option. */
export function activityOnlyDefaultIssues(categoryKey: string, optionValue: string, isDefault: boolean | undefined): ApiFieldError[] {
    if (isDefault !== true || categoryKey !== FOLLOWUP_TYPE_CATEGORY_KEY || !isActivityOnlyFollowupType(optionValue)) return [];
    return [{ path: ['isDefault'], message: ACTIVITY_ONLY_DEFAULT_MESSAGE }];
}
