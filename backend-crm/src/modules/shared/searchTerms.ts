import { ENTITY_CODE_PREFIX, type EntityCodePrefix } from '../../utils/codeGenerator.js';
import { isValidE164, normalizePhone } from '../../validators/common.js';

/**
 * Recognizes search text with a known shape so lists and global search can use index-friendly predicates:
 * `startsWith` (LIKE 'x%', an index seek) or equality instead of `contains` (LIKE '%x%', a scan).
 *
 *  • Entity codes (`ORG-0042`, `con-12`)  → prefix match on that entity's unique code column only.
 *  • Complete phone numbers                → equality on the stored forms of the number (E.164, digits, national).
 *  • Partial phone numbers (7+ digits)     → `contains` on the phone columns only (numbers are often typed partially).
 *  • GSTIN prefixes (`27AAACR…`)           → prefix match on the GSTIN column.
 *
 * Anything else keeps the module's existing `contains` search. SQL Server's default collation makes all of these
 * case-insensitive.
 */

const CODE_PREFIXES = Object.values(ENTITY_CODE_PREFIX) as EntityCodePrefix[];
const ANY_CODE = new RegExp(`^(${CODE_PREFIXES.join('|')})-\\d+$`, 'i');

/** The search text, uppercased, when it is a code of the given entity (`ORG-0042`); else null. */
export function codeSearchPrefix(term: string, prefix: EntityCodePrefix): string | null {
    const match = detectEntityCode(term);
    return match?.prefix === prefix ? match.code : null;
}

/** Which entity's code the search text is, if any. */
export function detectEntityCode(term: string): { prefix: EntityCodePrefix; code: string } | null {
    const trimmed = term.trim();
    const match = ANY_CODE.exec(trimmed);
    return match ? { prefix: match[1].toUpperCase() as EntityCodePrefix, code: trimmed.toUpperCase() } : null;
}

const MIN_PHONE_DIGITS = 7;
const PHONE_LIKE = /^\+?[\d\s().-]+$/;

/**
 * Stored forms a number may have: the E.164 value new records get (`+919811234567`) plus the bare digits and
 * the 10-digit national number legacy / imported rows may still hold.
 */
export function phoneVariants(raw: string): string[] {
    const normalized = normalizePhone(raw);
    const e164 = typeof normalized === 'string' ? normalized : raw.trim();
    const digits = e164.replace(/\D/g, '');
    const variants = new Set([e164, digits, `+${digits}`]);
    if (digits.length > 10) variants.add(digits.slice(-10));
    return [...variants].filter(Boolean);
}

export type PhoneSearch = { kind: 'exact'; variants: string[] } | { kind: 'partial'; digits: string };

/** A complete number (exact match on its stored forms) or 7+ typed digits (substring); null for other text. */
export function phoneSearch(term: string): PhoneSearch | null {
    const trimmed = term.trim();
    if (!PHONE_LIKE.test(trimmed)) return null;
    const digits = trimmed.replace(/\D/g, '');
    if (digits.length < MIN_PHONE_DIGITS) return null;
    const normalized = normalizePhone(trimmed);
    if (typeof normalized === 'string' && isValidE164(normalized)) return { kind: 'exact', variants: phoneVariants(normalized) };
    return { kind: 'partial', digits };
}

type PhoneFilter = { in: string[] } | { contains: string };

/** One `where` clause per phone column, for an `OR`. */
export function phoneWhere<F extends string>(search: PhoneSearch, fields: readonly F[]): Partial<Record<F, PhoneFilter>>[] {
    const filter: PhoneFilter = search.kind === 'exact' ? { in: search.variants } : { contains: search.digits };
    return fields.map((field) => ({ [field]: filter }) as Partial<Record<F, PhoneFilter>>);
}

/** State code + PAN start (`27AAACR`, up to a full 15-character GSTIN). */
const GSTIN_PREFIX = /^\d{2}[A-Z]{5}[0-9A-Z]{0,8}$/i;

/** The search text, uppercased, when it reads as the start of a GSTIN; else null. */
export function gstSearchPrefix(term: string): string | null {
    const trimmed = term.trim();
    return GSTIN_PREFIX.test(trimmed) ? trimmed.toUpperCase() : null;
}
