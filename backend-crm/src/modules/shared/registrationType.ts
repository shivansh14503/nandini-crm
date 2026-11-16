/**
 * Registration types that carry a GSTIN: 'Registered' and 'Special Economic Zone (SEZ)'. Leads and organizations
 * of these types must have a valid GSTIN; every other type stores none. Mirrors `isGstRegistrationType` in
 * frontend-crm/src/config/constants.ts.
 */
export function isGstRegistrationType(registrationType?: string | null): boolean {
    const value = (registrationType ?? '').trim().toLowerCase();
    return value === 'registered' || value === 'sez' || value.includes('(sez)') || value === 'special economic zone';
}

