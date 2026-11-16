/**
 * Contact person names are stored in name case: each word starts with a capital, the rest lowercase
 * ("rajesh KUMAR" → "Rajesh Kumar", "r.k. sharma" → "R.K. Sharma"). Titles in {@link UPPERCASE_TITLES} stay
 * all caps ("ca rajesh kumar" → "CA Rajesh Kumar", CA = Chartered Accountant).
 *
 * Kept byte-for-byte identical in backend-crm and frontend-crm (src/utils/personName.ts). Change both together.
 */

/** Whole words kept uppercase. */
const UPPERCASE_TITLES = new Set(['ca']);

/** Formats a person's name; length is unchanged, so an input's caret can stay where it was. */
export function formatPersonName(value: string): string {
    return value
        .toLowerCase()
        .replace(/(^|[\s.\-])([^\s.\-]*)/g, (_, sep: string, word: string) =>
            sep + (UPPERCASE_TITLES.has(word) ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1)),
        );
}
