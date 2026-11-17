import { sectionKeyFromLabel } from './formConfig.defaults.js';

/**
 * Backend names follow the names admins see. Admins never type or see an API name: the key of a field or dropdown
 * added in the form builder and a dropdown option's value are all derived from the label shown in the UI, with no
 * prefix and no numbering, and follow it when it is renamed (records, filters and PDF templates are moved with it).
 *
 *  - field added in the form builder:     "PO Number"   → po_number
 *  - dropdown added in the form builder:  "Lead Rating" → lead_rating
 *  - dropdown option:                     its value is its label ("Hot")
 *
 * A name whose key another field / dropdown (or a record column) already has is refused, saying what it clashes
 * with, so the admin chooses a different name; nothing is renamed or numbered behind their back. Built-in fields and
 * dropdowns keep the column / key the app's code is written against.
 */

/** Longest key; longer labels are cut. */
export const DERIVED_KEY_MAX = 80;

/** snake_case of a label, starting with a letter ("1st Visit" → field_1st_visit), or `fallback` when it has none. */
function keyFromLabel(label: string, fallback: string): string {
    const slug = sectionKeyFromLabel(label);
    const key = !slug ? fallback : /^[a-z]/.test(slug) ? slug : `${fallback}_${slug}`;
    return key.slice(0, DERIVED_KEY_MAX).replace(/_+$/, '');
}

/** The key a field added in the form builder gets from its label: snake_case ("PO Number" → po_number). */
export function fieldKeyFromLabel(label: string): string {
    return keyFromLabel(label, 'field');
}

/** The key a dropdown added in the form builder gets from its name: snake_case ("Lead Rating" → lead_rating). */
export function dropdownKeyFromLabel(label: string): string {
    return keyFromLabel(label, 'list');
}
