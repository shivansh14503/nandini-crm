import { escapeHtml, type RenderedEmail } from '../notifications/morningSummary.render.js';
import { INVITE_TTL_HOURS, type InvitePurpose } from './invite.token.js';

/**
 * The set-password email (a new user's invite, or an admin-sent password reset link): HTML in the same layout as the
 * morning summary (table layout, inline styles, at most 600 px wide, light background, brand blue button) plus a plain
 * text alternative. The link is also printed as text under the button for mail apps that block buttons. Every
 * interpolated value goes through `escapeHtml`. Pure, unit tested.
 */

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const C = {
    page: '#EEF2F7',
    card: '#FFFFFF',
    band: '#F8FAFC',
    border: '#E2E8F0',
    heading: '#0F172A',
    body: '#475569',
    muted: '#64748B',
    brand: '#2563EB',
    onBrand: '#FFFFFF',
    codeBg: '#F1F5F9',
} as const;

export interface SetPasswordEmailInput {
    purpose: InvitePurpose;
    /** "Asha" (first name), else the username. */
    recipientName: string;
    username: string;
    url: string;
    /** When the link stops working, already formatted for the reader, e.g. "Mon 30 Nov, 1:05 PM IST". */
    expiresLabel: string;
    /** The admin who sent it ("Asha Kulkarni"), when known. */
    sentBy?: string | null;
    /** The user asked for it ("Forgot password?" on the sign-in page): the email says so instead of naming an admin. */
    requestedBySelf?: boolean;
}

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

function copyFor(input: SetPasswordEmailInput) {
    if (input.purpose === 'reset') {
        return {
            subject: 'Reset your Nandini CRM password',
            preview: 'Choose a new password for your Nandini CRM account.',
            heading: `Hi ${input.recipientName}, reset your password`,
            intro: input.requestedBySelf
                ? 'We received a request to reset the password for your Nandini CRM account. Use the link below to choose a new one.'
                : `${input.sentBy ? `${input.sentBy} sent you` : 'You were sent'} a link to choose a new password for your Nandini CRM account.`,
            button: 'Choose a new password',
            footer: input.requestedBySelf
                ? 'If you didn’t ask for this, you can ignore this email: your current password keeps working, and nothing changes unless the link is used.'
                : 'If you didn’t expect this, you can ignore this email: your current password keeps working until you choose a new one.',
        };
    }
    return {
        subject: 'You’re invited to Nandini CRM',
        preview: 'Set your password to start using Nandini CRM.',
        heading: `Welcome to Nandini CRM, ${input.recipientName}`,
        intro: `${input.sentBy ? `${input.sentBy} added you` : 'You have been added'} to Nandini CRM. Set your password to sign in for the first time.`,
        button: 'Set your password',
        footer: 'If you weren’t expecting this invite, you can ignore this email: nothing happens until the link is used.',
    };
}

const link = (href: string, label: string, style: string) => `<a href="${escapeHtml(href)}" style="${style}" target="_blank" rel="noopener">${escapeHtml(label)}</a>`;

/** Subject, HTML and plain text of the set-password email. */
export function renderSetPasswordEmail(input: SetPasswordEmailInput): RenderedEmail {
    const copy = copyFor(input);
    const once = `The link works once and expires on ${input.expiresLabel} (${INVITE_TTL_HOURS} hours after it was sent). After that, ask your administrator to send a new one.`;
    const button = `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-radius:8px;background-color:${C.brand};">${link(
        input.url,
        copy.button,
        `display:inline-block;padding:12px 24px;font-family:${FONT};font-size:15px;font-weight:600;line-height:20px;color:${C.onBrand};text-decoration:none;border-radius:8px;`,
    )}</td></tr></table>`;

    const p = (text: string, style = '') => `<p style="margin:0 0 14px 0;font-family:${FONT};font-size:15px;line-height:23px;color:${C.body};${style}">${text}</p>`;

    const html = [
        '<!DOCTYPE html>',
        '<html lang="en"><head>',
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        '<meta name="color-scheme" content="light">',
        '<meta name="supported-color-schemes" content="light">',
        '<meta name="referrer" content="no-referrer">',
        `<title>${escapeHtml(copy.subject)}</title>`,
        '</head>',
        `<body style="margin:0;padding:0;background-color:${C.page};">`,
        `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.page};">${escapeHtml(copy.preview)}</div>`,
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background-color:${C.page};"><tr><td align="center" style="padding:24px 12px;">`,
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:${C.card};border:1px solid ${C.border};border-radius:12px;">`,
        `<tr><td style="padding:24px 24px 4px 24px;background-color:${C.band};border-radius:12px 12px 0 0;border-bottom:1px solid ${C.border};">`,
        `<div style="font-family:${FONT};font-size:13px;line-height:19px;color:${C.muted};">Nandini CRM</div>`,
        `<h1 style="margin:6px 0 16px 0;font-family:${FONT};font-size:20px;line-height:28px;color:${C.heading};">${escapeHtml(copy.heading)}</h1>`,
        '</td></tr>',
        `<tr><td style="padding:20px 24px 4px 24px;">`,
        p(escapeHtml(copy.intro)),
        p(
            `Your username: <span style="display:inline-block;padding:1px 8px;border-radius:6px;background-color:${C.codeBg};color:${C.heading};font-family:Consolas,Menlo,monospace;font-size:14px;">${escapeHtml(input.username)}</span>`,
        ),
        `<div style="padding:6px 0 20px 0;">${button}</div>`,
        p(escapeHtml(once), `font-size:14px;line-height:21px;`),
        p('If the button doesn’t work, copy this link into your browser:', `font-size:13px;line-height:19px;color:${C.muted};margin-bottom:4px;`),
        `<p style="margin:0 0 20px 0;font-family:Consolas,Menlo,monospace;font-size:12px;line-height:18px;word-break:break-all;">${link(input.url, input.url, `color:${C.brand};text-decoration:underline;`)}</p>`,
        '</td></tr>',
        `<tr><td style="padding:16px 24px 24px 24px;border-top:1px solid ${C.border};font-family:${FONT};font-size:12px;line-height:18px;color:${C.muted};">`,
        `<p style="margin:0 0 8px 0;">${escapeHtml(copy.footer)}</p>`,
        '<p style="margin:0;">Never forward this email: anyone with the link can set the password for this account.</p>',
        '</td></tr>',
        '</table>',
        '</td></tr></table>',
        '</body></html>',
    ].join('\n');

    const text = [
        copy.heading,
        '',
        copy.intro,
        '',
        `Your username: ${input.username}`,
        '',
        `${copy.button}: ${input.url}`,
        '',
        once,
        '',
        copy.footer,
        'Never forward this email: anyone with the link can set the password for this account.',
    ].join('\n');

    return { subject: copy.subject, html, text };
}
