import { DEFAULT_COUNTRY_CODE, getCountryNameByCode, normalizeLegacyStateName, resolveCountryIso2 } from '@/data/addressMaster';

/**
 * Stored country value → ISO2 code. Empty becomes India; legacy names ('India', 'United States') become codes;
 * values the master doesn't know (e.g. legacy 'Other') are kept as-is rather than silently changed.
 */
export function normalizeCountryValue(country?: string | null): string {
    const raw = (country ?? '').trim();
    if (!raw) return DEFAULT_COUNTRY_CODE;
    return resolveCountryIso2(raw) || raw;
}

/**
 * Returns a copy of `record` with each [countryField, stateField] pair normalised: country to ISO2
 * (see normalizeCountryValue) and state to the master's canonical name ('Haryana' → 'Haryāna'; manual entries kept).
 * Use when loading saved records into forms so legacy data prefills the address master fields.
 */
export function normalizeAddressFields<T extends object>(
    record: T,
    pairs: ReadonlyArray<readonly [country: keyof T, state: keyof T]>
): T {
    const next: Record<keyof T, unknown> = { ...record };
    for (const [countryKey, stateKey] of pairs) {
        const country = normalizeCountryValue(next[countryKey] as string | undefined);
        next[countryKey] = country;
        next[stateKey] = normalizeLegacyStateName(next[stateKey] as string | undefined, country);
    }
    return next as T;
}

/**
 * One-line postal-style address for read-only views: street, city, state, postal code, country name.
 * Empty parts are skipped.
 */
export function formatAddressLine(parts: {
    street?: string | null;
    city?: string | null;
    state?: string | null;
    postalCode?: string | null;
    country?: string | null;
}): string {
    return [
        parts.street,
        parts.city,
        parts.state,
        parts.postalCode,
        parts.country ? getCountryNameByCode(parts.country) : '',
    ]
        .map((p) => (p ?? '').toString().trim())
        .filter(Boolean)
        .join(', ');
}
