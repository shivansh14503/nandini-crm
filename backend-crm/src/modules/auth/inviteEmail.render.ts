/**
 * Set-password emails (a new user's invite, an admin-sent or self-service password reset link) are rendered from the
 * Admin › Email templates (modules/email/email.templates.ts: user_invite, password_reset, password_reset_self). This
 * file keeps the link expiry's wording.
 */

/** "Mon 30 Nov 2026, 1:05 pm" in the business timezone (+ its short zone name). */
export function formatExpiry(instant: Date, timeZone: string): string {
    return new Intl.DateTimeFormat('en-GB', {
        timeZone,
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZoneName: 'short',
    }).format(instant);
}
