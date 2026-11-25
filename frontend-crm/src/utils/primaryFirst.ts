/** An entry of a repeatable list that can mark one entry as the primary one (emails: `{ email, isPrimary }`). */
export const isPrimaryEntry = (value: unknown): boolean =>
    Boolean(value && typeof value === 'object' && (value as { isPrimary?: unknown }).isPrimary === true);

/**
 * The list with its primary entry (or entries) moved to the front, the rest keeping their saved order.
 * Lists without a primary flag come back unchanged. Read-only views use it so the primary email is listed first.
 */
export function primaryFirst<T>(items: readonly T[]): T[] {
    if (!items.some(isPrimaryEntry)) return [...items];
    return [...items.filter(isPrimaryEntry), ...items.filter((item) => !isPrimaryEntry(item))];
}
