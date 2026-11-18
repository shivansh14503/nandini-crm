import { isValidPhoneNumber, parsePhoneNumberFromString } from 'libphonenumber-js';
import { DEFAULT_PHONE_COUNTRY_ISO2, PHONE_COUNTRIES, getPhoneCountry, type PhoneCountry } from '@/data/countryPhoneCodes';

/** ITU-T E.164: `+`, non-zero first digit, 7-15 digits total. */
export const E164_REGEX = /^\+[1-9]\d{6,14}$/;

export const isValidE164 = (value: string): boolean => E164_REGEX.test(value) && isValidPhoneNumber(value);

export interface SplitPhone {
    country: PhoneCountry;
    /** Digits only, without the country code. */
    national: string;
}

const fallbackCountry = (): PhoneCountry => getPhoneCountry(DEFAULT_PHONE_COUNTRY_ISO2) ?? PHONE_COUNTRIES[0];

/** Dial codes longest-first so '+1242' (Bahamas) wins over '+1'. */
const countriesByDialLength = [...PHONE_COUNTRIES].sort((a, b) => b.dialCode.length - a.dialCode.length);

/**
 * Splits a stored value into country + national digits. Legacy values without a '+' (10-digit Indian numbers,
 * "91..." or "0...") are treated as India. Empty or unparseable input yields `defaultIso2`.
 */
export function splitPhone(value: unknown, defaultIso2: string = DEFAULT_PHONE_COUNTRY_ISO2): SplitPhone {
    const base = getPhoneCountry(defaultIso2) ?? fallbackCountry();
    const raw = typeof value === 'string' ? value.trim() : '';
    if (!raw) return { country: base, national: '' };

    if (raw.startsWith('+')) {
        const parsed = parsePhoneNumberFromString(raw);
        const iso2 = parsed?.country;
        const country =
            (iso2 && getPhoneCountry(iso2)) ||
            (parsed && countriesByDialLength.find((c) => c.dialCode === `+${parsed.countryCallingCode}`)) ||
            undefined;
        if (parsed && country) return { country, national: parsed.nationalNumber };
        // Incomplete while typing: match the longest known dial code prefix.
        const digits = raw.replace(/\D/g, '');
        const match = countriesByDialLength.find((c) => digits.startsWith(c.dialCode.slice(1)));
        if (match) return { country: match, national: digits.slice(match.dialCode.length - 1) };
        return { country: base, national: digits };
    }

    // Legacy national-only data -> India.
    const india = fallbackCountry();
    let digits = raw.replace(/\D/g, '');
    if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
    else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
    return { country: india, national: digits };
}

/**
 * Reads a pasted phone number that carries its country code (e.g. '+91 98112 34567' copied from a list or
 * drawer, '0091…', '91 98112 34567', '098112 34567') or is a complete Indian number ('98112 34567').
 * Returns its country + national digits, or null when the text isn't a recognisable full number (then the
 * paste is left to the input's normal digit filtering).
 */
export function parsePastedPhone(text: string, current: PhoneCountry): SplitPhone | null {
    const trimmed = (text ?? '').trim();
    const digits = trimmed.replace(/\D/g, '');
    if (!digits) return null;
    if (trimmed.startsWith('+')) return splitPhone(`+${digits}`, current.iso2);
    if (digits.startsWith('00')) return splitPhone(`+${digits.slice(2)}`, current.iso2);
    if (current.iso2 === 'IN') {
        const india = current;
        if (digits.length === 12 && digits.startsWith('91')) return { country: india, national: digits.slice(2) };
        if (digits.length === 11 && digits.startsWith('0')) return { country: india, national: digits.slice(1) };
        if (digits.length === 10) return { country: india, national: digits };
    }
    return null;
}

/** Combines country + national digits into E.164; '' when there are no digits. */
export function joinPhone(country: PhoneCountry, national: string): string {
    const digits = national.replace(/\D/g, '');
    return digits ? `${country.dialCode}${digits}` : '';
}

/** Max national digits that can still form a valid E.164 number (15 total minus the dial code). */
export const maxNationalDigits = (country: PhoneCountry): number => 15 - (country.dialCode.length - 1);

/** Display form: country code, then the national digits with no spaces, e.g. '+91 9811234567'. */
export function formatPhoneDisplay(value: unknown): string {
    if (typeof value !== 'string' || !value.trim()) return '';
    const { country, national } = splitPhone(value);
    if (!national) return '';
    return `${country.dialCode} ${national}`;
}
/**
 * Phone text for copy buttons: always with its country code ('+91 9811234567'), including legacy numbers
 * stored without one, so it pastes back into a phone field (or WhatsApp) complete.
 */
export const phoneForCopy = (value: string): string => formatPhoneDisplay(value) || value;

/**
 * Normalizes any phone input to E.164 for validation/submit: separators dropped, '+'/'00' kept as the
 * international prefix, legacy national numbers (10 digits, 91+10, 0+10) treated as India (+91).
 * Blank stays ''; unrecognised input is returned digits-only so validation rejects it.
 */
export function normalizeToE164(value: string): string {
    const trimmed = (value ?? '').trim();
    if (!trimmed) return '';
    const digits = trimmed.replace(/\D/g, '');
    if (!digits) return '';
    if (trimmed.startsWith('+')) return `+${digits}`;
    if (digits.startsWith('00')) return `+${digits.slice(2)}`;
    if (digits.length === 10) return `+91${digits}`;
    if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
    if (digits.length === 11 && digits.startsWith('0')) return `+91${digits.slice(1)}`;
    return digits;
}
/**
 * Validation message for an E.164 candidate, or null when valid. Names the country so users can tell
 * "wrong length for this country" from "not a number at all".
 */
export function phoneIssue(e164: string): string | null {
    if (!e164) return 'Phone number is required.';
    if (isValidE164(e164)) return null;
    if (!E164_REGEX.test(e164)) return 'Enter a valid phone number (digits only, with country code).';
    const { country } = splitPhone(e164);
    return `Enter a valid ${country.name} (${country.dialCode}) phone number.`;
}
