import { getCountries, getCountryCallingCode, type CountryCode } from 'libphonenumber-js';
import { COUNTRY_MASTER, DEFAULT_COUNTRY_CODE } from './addressMaster';

/**
 * Country dial-code dataset for the international phone input. Names and ISO-3 codes come from the CRM address
 * master (so they match every other country picker); dial codes come from libphonenumber-js metadata, which
 * stays correct for shared codes (+1, +44, +7...). Flags are CDN images - emoji flags don't render on Windows.
 */
export interface PhoneCountry {
    name: string;
    iso2: string;
    iso3: string;
    /** With plus sign, e.g. '+91'. */
    dialCode: string;
    /** 20px-wide PNG and its 2x variant for retina screens. */
    flagUrl: string;
    flagUrl2x: string;
}

export const DEFAULT_PHONE_COUNTRY_ISO2 = DEFAULT_COUNTRY_CODE;

export const flagUrl = (iso2: string, width: 20 | 40 = 20): string =>
    `https://flagcdn.com/w${width}/${iso2.toLowerCase()}.png`;

const supported = new Set<string>(getCountries());

export const PHONE_COUNTRIES: readonly PhoneCountry[] = COUNTRY_MASTER.filter((c) => supported.has(c.iso2Code))
    .map((c) => ({
        name: c.countryName,
        iso2: c.iso2Code,
        iso3: c.iso3Code,
        dialCode: `+${getCountryCallingCode(c.iso2Code as CountryCode)}`,
        flagUrl: flagUrl(c.iso2Code, 20),
        flagUrl2x: flagUrl(c.iso2Code, 40),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

const BY_ISO2 = new Map(PHONE_COUNTRIES.map((c) => [c.iso2, c]));

export const getPhoneCountry = (iso2?: string | null): PhoneCountry | undefined =>
    iso2 ? BY_ISO2.get(iso2.toUpperCase()) : undefined;

/** Matches by country name, ISO-2, ISO-3 or dial code ("+91" / "91"). */
export function matchesPhoneCountry(country: PhoneCountry, query: string): boolean {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const dial = country.dialCode.slice(1);
    const qDigits = q.replace(/^\+/, '');
    return (
        country.name.toLowerCase().includes(q) ||
        country.iso2.toLowerCase() === q ||
        country.iso3.toLowerCase().startsWith(q) ||
        (/^\d+$/.test(qDigits) && dial.startsWith(qDigits))
    );
}