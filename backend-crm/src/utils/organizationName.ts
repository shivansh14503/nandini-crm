/**
 * Organization name normalization and fuzzy matching.
 *
 * Users write the same company many ways ("ABC Pvt Ltd", "M/s. ABC Private Limited.", "abc (p) ltd"). These pure
 * helpers reduce a name to comparable forms so duplicates can be caught and similar records suggested:
 *
 *  - normalized  → lowercase, accents/punctuation stripped, "&" → "and", honorific prefixes ("M/s", "The") dropped
 *  - canonical   → normalized + legal suffixes / abbreviations spelled one way ("private limited" → "pvt ltd")
 *  - core        → canonical minus trailing legal-entity suffixes ("abc pvt ltd" → "abc")
 *
 * Kept byte-for-byte identical in backend-crm and frontend-crm (src/utils/organizationName.ts) so the live form
 * check and the server's write-time check agree. Change both together.
 */

export type OrgNameMatchKind = 'exact' | 'canonical' | 'core' | 'prefix' | 'fuzzy';

export interface OrgNameComparison {
    matchKind: OrgNameMatchKind | 'none';
    score: number;
    reason?: string;
}

export interface SimilarOrganizationResult<T> {
    record: T;
    matchKind: OrgNameMatchKind;
    score: number;
    reason?: string;
}

/** Exact and canonical matches are the same legal name: treated as duplicates, not just suggestions. */
export const isDuplicateMatchKind = (kind: OrgNameMatchKind | 'none' | undefined): kind is 'exact' | 'canonical' =>
    kind === 'exact' || kind === 'canonical';

// ── Normalization ────────────────────────────────────────────────────────────

const LEADING_PREFIXES = new Set(['ms', 'messrs', 'the', 'shri', 'sri', 'smt']);

/**
 * Lowercases, strips accents and punctuation, turns "&" into "and", collapses whitespace and drops leading
 * honorific / business prefixes (M/s, Messrs, The, Shri, Sri, Smt).
 */
export function normalizeOrgText(name: string): string {
    let text = (name ?? '')
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/&/g, ' and ');
    // "M/s", "M/s." and "M / s" before "/" becomes a separator.
    text = text.replace(/^\s*m\s*\/\s*s(?![\p{L}\p{N}])\.?/u, ' ');
    // Dots and apostrophes join ("Pvt.Ltd." → "pvtltd", "A.B.C." → "abc"); every other symbol separates.
    text = text.replace(/[.'’‘`"“”]/g, '');
    text = text.replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

    const tokens = text ? text.split(' ') : [];
    // Only strip a prefix when something follows it ("The" alone stays "the").
    while (tokens.length > 1 && LEADING_PREFIXES.has(tokens[0])) tokens.shift();
    return tokens.join(' ');
}

/** [pattern (space-separated alternatives of whole-token phrases), replacement], applied in order. */
const CANONICAL_RULES: [string[], string][] = [
    [['pvtltd', 'pltd', 'pvtlimited'], 'pvt ltd'],
    [['private limited', 'private ltd', 'pvt limited', 'pvt ltd', 'p limited', 'p ltd'], 'pvt ltd'],
    [['public limited', 'public ltd', 'pub limited', 'pub ltd'], 'ltd'],
    [['limited liability partnership'], 'llp'],
    [['one person company'], 'opc'],
    [['limited'], 'ltd'],
    [['incorporated'], 'inc'],
    [['corporation'], 'corp'],
    [['company'], 'co'],
    [['enterprises', 'enterprise', 'entp'], 'enterprises'],
    [['industries', 'inds', 'ind'], 'industries'],
    [['associates', 'assoc'], 'associates'],
    [['international', 'intl'], 'international'],
    [['technologies', 'technology', 'tech'], 'technologies'],
    [['solutions', 'solns', 'sol'], 'solutions'],
    [['services', 'svcs'], 'services'],
];

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const COMPILED_CANONICAL_RULES: [RegExp, string][] = CANONICAL_RULES.map(([phrases, replacement]) => [
    // Whole-token match: preceded by start/space, followed by space/end.
    new RegExp(`(^| )(?:${phrases.map(escapeRegExp).join('|')})(?= |$)`, 'g'),
    `$1${replacement}`,
]);

/** Spells legal suffixes and common business words one way, e.g. "M/s. ABC Private Limited." → "abc pvt ltd". */
export function canonicalizeOrgName(name: string): string {
    let text = normalizeOrgText(name);
    for (const [pattern, replacement] of COMPILED_CANONICAL_RULES) text = text.replace(pattern, replacement);
    return text.replace(/ {2,}/g, ' ').trim();
}

/** Trailing legal-entity suffixes (canonical spelling) stripped to reach the core brand name. Multi-token first. */
const LEGAL_SUFFIXES: string[][] = [
    ['pvt', 'ltd'],
    ['ltd'],
    ['llp'],
    ['opc'],
    ['inc'],
    ['corp'],
    ['co'],
    ['pvt'],
    ['jv'],
    ['huf'],
    ['trust'],
    ['society'],
    ['ngo'],
    ['psu'],
];

function stripLegalSuffixes(tokens: string[]): string[] {
    const out = [...tokens];
    let stripped = true;
    while (stripped && out.length > 0) {
        stripped = false;
        for (const suffix of LEGAL_SUFFIXES) {
            if (out.length <= suffix.length) continue;
            const tail = out.slice(out.length - suffix.length);
            if (tail.every((t, i) => t === suffix[i])) {
                out.splice(out.length - suffix.length);
                stripped = true;
                break;
            }
        }
        // "Sharma & Co" → "sharma and" → "sharma".
        if (out.length > 1 && out[out.length - 1] === 'and') {
            out.pop();
            stripped = true;
        }
    }
    return out;
}

/** The distinctive brand / root of a name: "ABC Private Limited" → "abc". Falls back to the canonical name. */
export function extractCoreOrgName(name: string): string {
    const canonical = canonicalizeOrgName(name);
    if (!canonical) return '';
    const core = stripLegalSuffixes(canonical.split(' ')).join(' ');
    return core || canonical;
}

// ── Analysis cache (lookups compare one query against hundreds of names per keystroke) ──

interface AnalyzedName {
    exact: string;
    canonical: string;
    core: string;
    canonicalTokens: string[];
    coreTokens: string[];
}

const ANALYSIS_CACHE_LIMIT = 5000;
const analysisCache = new Map<string, AnalyzedName>();

function analyze(name: string): AnalyzedName {
    const cached = analysisCache.get(name);
    if (cached) return cached;
    const canonical = canonicalizeOrgName(name);
    const core = extractCoreOrgName(name);
    const result: AnalyzedName = {
        exact: (name ?? '').trim().toLowerCase().replace(/\s+/g, ' '),
        canonical,
        core,
        canonicalTokens: canonical ? canonical.split(' ') : [],
        coreTokens: core ? core.split(' ') : [],
    };
    if (analysisCache.size >= ANALYSIS_CACHE_LIMIT) analysisCache.clear();
    analysisCache.set(name, result);
    return result;
}

// ── Similarity ───────────────────────────────────────────────────────────────

/** Long forms of canonical tokens, so a partially typed "privat" or "limi" still lines up with "pvt" / "ltd". */
const LONG_FORMS: Record<string, string> = {
    pvt: 'private',
    ltd: 'limited',
    inc: 'incorporated',
    corp: 'corporation',
    co: 'company',
};

function bigrams(text: string): Map<string, number> {
    const grams = new Map<string, number>();
    for (let i = 0; i < text.length - 1; i++) {
        const gram = text.slice(i, i + 2);
        grams.set(gram, (grams.get(gram) ?? 0) + 1);
    }
    return grams;
}

/** Sørensen–Dice coefficient over character bigrams (0..1). */
export function diceSimilarity(a: string, b: string): number {
    if (a === b) return 1;
    if (a.length < 2 || b.length < 2) return 0;
    const left = bigrams(a);
    const right = bigrams(b);
    let overlap = 0;
    for (const [gram, count] of left) overlap += Math.min(count, right.get(gram) ?? 0);
    return (2 * overlap) / (a.length - 1 + (b.length - 1));
}

/** 1 − (Levenshtein distance / longer length), 0..1. */
export function levenshteinSimilarity(a: string, b: string): number {
    if (a === b) return 1;
    const longer = Math.max(a.length, b.length);
    if (longer === 0) return 1;
    let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        const current = [i];
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
        }
        previous = current;
    }
    return 1 - previous[b.length] / longer;
}

/** Whether a typed token lines up with a candidate token (prefix, long-form prefix, or substring for 3+ chars). */
function tokenMatches(typed: string, candidate: string): boolean {
    if (candidate.startsWith(typed)) return true;
    const longForm = LONG_FORMS[candidate];
    if (longForm && longForm.startsWith(typed)) return true;
    return typed.length >= 3 && candidate.includes(typed);
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/**
 * How `inputName` relates to `candidateName`, strongest relation first:
 * exact (1.0) → canonical (0.98) → core (0.90) → prefix / token overlap (0.75–0.88) → fuzzy spelling (0.75–0.85).
 */
export function compareOrganizationNames(inputName: string, candidateName: string): OrgNameComparison {
    const input = analyze(inputName ?? '');
    const candidate = analyze(candidateName ?? '');
    if (!input.exact || !candidate.exact) return { matchKind: 'none', score: 0 };

    if (input.exact === candidate.exact) return { matchKind: 'exact', score: 1 };

    if (input.canonical && input.canonical === candidate.canonical) {
        return { matchKind: 'canonical', score: 0.98, reason: `Same legal name (written as "${(candidateName ?? '').trim()}")` };
    }

    const coreLength = input.core.replace(/ /g, '').length;
    if (coreLength >= 2 && input.core === candidate.core) {
        return { matchKind: 'core', score: 0.9, reason: 'Same core name, different suffix' };
    }

    // Every typed token lines up with some token of the candidate (as typed so far).
    if (input.canonicalTokens.length > 0 && input.canonical.replace(/ /g, '').length >= 2) {
        const allMatch = input.canonicalTokens.every((typed) => candidate.canonicalTokens.some((c) => tokenMatches(typed, c)));
        if (allMatch) {
            const typedChars = input.canonical.replace(/ /g, '').length;
            const candidateChars = Math.max(candidate.canonical.replace(/ /g, '').length, 1);
            const coverage = Math.min(typedChars / candidateChars, 1);
            const leadsWithFirstToken = candidate.canonicalTokens[0]?.startsWith(input.canonicalTokens[0]) ? 0.03 : 0;
            return { matchKind: 'prefix', score: round(Math.min(0.75 + 0.1 * coverage + leadsWithFirstToken, 0.88)), reason: 'Similar organization' };
        }
    }

    // Typos: compare the core names (spaces ignored) once there's enough text to judge.
    if (coreLength >= 3 && candidate.core) {
        const a = input.core.replace(/ /g, '');
        const b = candidate.core.replace(/ /g, '');
        const similarity = Math.max(diceSimilarity(a, b), levenshteinSimilarity(a, b));
        if (similarity >= 0.75) {
            return { matchKind: 'fuzzy', score: round(0.75 + (similarity - 0.75) * 0.4), reason: 'Similar spelling' };
        }
    }

    return { matchKind: 'none', score: 0 };
}

/**
 * Ranks `candidates` by how closely their name matches `query` (best first, then alphabetically).
 * `excludeId` skips the record being edited; `limit` defaults to 6.
 */
export function findSimilarOrganizations<T extends { id?: string; organizationName: string }>(
    candidates: readonly T[],
    query: string,
    options: { excludeId?: string; limit?: number } = {},
): SimilarOrganizationResult<T>[] {
    const { excludeId, limit = 6 } = options;
    if (!query?.trim()) return [];
    const matches: SimilarOrganizationResult<T>[] = [];
    for (const record of candidates) {
        if (!record?.organizationName || (excludeId && record.id === excludeId)) continue;
        const { matchKind, score, reason } = compareOrganizationNames(query, record.organizationName);
        if (matchKind !== 'none') matches.push({ record, matchKind, score, reason });
    }
    matches.sort((a, b) => b.score - a.score || a.record.organizationName.localeCompare(b.record.organizationName));
    return matches.slice(0, limit);
}

/** The user-facing message for a duplicate name, naming how the existing record is written. */
export function duplicateOrganizationMessage(kind: 'exact' | 'canonical', existingName: string): string {
    return kind === 'exact'
        ? `An organization named "${existingName}" already exists.`
        : `This matches existing organization "${existingName}" with a different legal format.`;
}
