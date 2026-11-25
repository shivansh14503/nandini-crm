/**
 * Tally Serial No rule: exactly 9 digits, starting with 7 (e.g. 712345678).
 * Ported from frontend-crm/src/utils/tallySerial.ts (the forms show the same messages inline);
 * src/validators/contractSync.test.ts checks both copies agree.
 */
export const TALLY_SERIAL_LENGTH = 9;
export const TALLY_SERIAL_REGEX = /^7\d{8}$/;

/** The reason `value` isn't a valid Tally Serial No, or `null` when it is (or is blank). */
export function tallySerialIssue(value: string | null | undefined, field = 'Tally Serial No'): string | null {
    const text = (value ?? '').trim();
    if (!text) return null;
    if (!/^\d+$/.test(text)) return `${field} can contain digits only.`;
    if (text.length !== TALLY_SERIAL_LENGTH) {
        return `${field} must be exactly ${TALLY_SERIAL_LENGTH} digits (you entered ${text.length}).`;
    }
    if (!text.startsWith('7')) return `${field} must start with 7.`;
    return null;
}
