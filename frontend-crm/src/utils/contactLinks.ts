/**
 * Builders for tel:, sms:, WhatsApp and mailto: links. Every value is sanitized so stored
 * formatting (spaces, dashes, brackets) never produces a broken or injectable link.
 */

/** Keeps digits and a single leading '+'; returns '' when no digits remain. */
export function sanitizePhone(phone?: string | null): string {
    if (!phone) return '';
    const trimmed = phone.trim();
    const digits = trimmed.replace(/\D/g, '');
    if (!digits) return '';
    return trimmed.startsWith('+') ? `+${digits}` : digits;
}

export function telHref(phone?: string | null): string {
    const clean = sanitizePhone(phone);
    return clean ? `tel:${clean}` : '';
}

export function smsHref(phone?: string | null): string {
    const clean = sanitizePhone(phone);
    return clean ? `sms:${clean}` : '';
}

/**
 * wa.me needs the full international number with digits only. A bare 10-digit number is
 * treated as Indian (+91), matching how mobiles are stored in this CRM.
 */
export function whatsappHref(phone?: string | null, defaultCountryCode = '91'): string {
    const digits = sanitizePhone(phone).replace(/\D/g, '');
    if (!digits) return '';
    const international = digits.length === 10 ? `${defaultCountryCode}${digits}` : digits.replace(/^0+/, '');
    return `https://wa.me/${international}`;
}

export function mailtoHref(email?: string | null): string {
    const clean = (email ?? '').trim().replace(/[\s<>"'?&#]/g, '');
    return clean.includes('@') ? `mailto:${clean}` : '';
}
