import { sectionKeyFromLabel } from './formConfig.defaults.js';

/**
 * Backend names follow the names admins see. Admins never type or see an API name: a custom field's key, an
 * admin-created dropdown's key and a dropdown option's value are all derived from the label shown in the UI, and
 * follow it when it is renamed (records, filters and PDF templates are moved with it).
 *
 *  - custom field:              "PO Number"  → cf_po_number
 *  - admin-created dropdown:    "Lead Rating" → custom_lead_rating
 *  - dropdown option:           its value is its label ("Hot")
 *
 * Built-in fields and dropdowns keep the column / key the app's code is written against.
 */

/** Longest generated key; numbering (`_2`, `_3`, …) stays within it. */
export const DERIVED_KEY_MAX = 80;

/** The key a custom field labelled `label` gets: `cf_` + snake_case (a leading digit is prefixed, e.g. "1st" → cf_f_1st). */
export function customFieldKeyBase(label: string): string {
    return `cf_${sectionKeyFromLabel(label).replace(/^(\d)/, 'f_$1') || 'field'}`;
}

/** The key an admin-created dropdown named `label` gets: `custom_` + snake_case. */
export function customCategoryKeyBase(label: string): string {
    return `custom_${sectionKeyFromLabel(label) || 'list'}`;
}

/** `base` cut to leave room for a `_N` suffix, as `uniqueDerivedKey` does. */
const rootOf = (base: string) => base.slice(0, DERIVED_KEY_MAX - 4) || 'item';

/** Whether `key` is what `base` gives (itself, or numbered `_2`, `_3`, … when the plain one was taken). */
export function keyMatchesBase(key: string, base: string): boolean {
    const root = rootOf(base);
    if (key === root) return true;
    if (!key.startsWith(`${root}_`)) return false;
    return /^\d+$/.test(key.slice(root.length + 1));
}

/** `base`, or `base_2`, `base_3`, … : the first that `taken` says is free. */
export async function uniqueDerivedKey(base: string, taken: (key: string) => Promise<boolean>): Promise<string> {
    const root = rootOf(base);
    let candidate = root;
    for (let n = 2; await taken(candidate); n++) candidate = `${root}_${n}`;
    return candidate;
}
