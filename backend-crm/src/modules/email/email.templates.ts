import { escapeHtml, type RenderedEmail } from '../notifications/morningSummary.render.js';

/**
 * System email templates (Admin › Email › Templates; docs/system-design.md › Email). Each template has built-in
 * wording (below) that an admin may replace (EmailTemplate row); "Reset to default" deletes the row.
 *
 * A template is plain text in a few parts (subject, heading, body, button label, text below the button, footer), never
 * admin HTML: the parts are merged ({{firstName}}), escaped and laid out in the CRM's email layout (table layout,
 * inline styles, 600 px, light background, brand button). Templates with a link always show the button, the link as
 * text under it for mail apps that block buttons, and a fixed "never forward" line. Pure, unit tested.
 */

export const EMAIL_TEMPLATE_KEYS = ['user_invite', 'password_reset', 'password_reset_self', 'account_locked', 'morning_summary'] as const;
export type EmailTemplateKey = (typeof EMAIL_TEMPLATE_KEYS)[number];

export const isEmailTemplateKey = (value: unknown): value is EmailTemplateKey =>
    typeof value === 'string' && (EMAIL_TEMPLATE_KEYS as readonly string[]).includes(value);

export interface MergeField {
    key: string;
    label: string;
    /** Shown in the preview. */
    sample: string;
}

export interface TemplateContent {
    subject: string;
    heading: string;
    body: string;
    buttonLabel: string | null;
    afterButton: string | null;
    footer: string | null;
}

export interface EmailTemplateDef {
    key: EmailTemplateKey;
    name: string;
    description: string;
    /** `reserved`: editable now, sent by a later feature. */
    status: 'active' | 'reserved';
    /** Has a `{{link}}` button (set-password / reset links). */
    hasLink: boolean;
    mergeFields: readonly MergeField[];
    defaults: Readonly<TemplateContent>;
}

export const APP_NAME = 'Nandini CRM';

const COMMON: readonly MergeField[] = [
    { key: 'appName', label: 'App name', sample: APP_NAME },
    { key: 'firstName', label: 'First name', sample: 'Asha' },
    { key: 'fullName', label: 'Full name', sample: 'Asha Kulkarni' },
    { key: 'username', label: 'Username', sample: 'asha.k' },
];
const LINK: readonly MergeField[] = [
    { key: 'link', label: 'Link', sample: 'https://crm.nandiniinfosys.com/set-password?token=sample' },
    { key: 'expiresAt', label: 'Link expires at', sample: 'Mon, 30 Nov 2026, 1:05 pm IST' },
    { key: 'linkValidHours', label: 'Link valid for (hours)', sample: '72' },
];
const SENT_BY: MergeField = { key: 'sentBy', label: 'Sent by (admin)', sample: 'Rahul Mehta' };

const NEVER_FORWARD = 'Never forward this email: anyone with the link can use it for this account.';

export const EMAIL_TEMPLATES: Readonly<Record<EmailTemplateKey, EmailTemplateDef>> = {
    user_invite: {
        key: 'user_invite',
        name: 'New user invite / first login',
        description: 'Sent when an admin adds a user or clicks Resend invite. The button opens the page where they set their first password.',
        status: 'active',
        hasLink: true,
        mergeFields: [...COMMON, ...LINK, SENT_BY],
        defaults: {
            subject: 'You’re invited to {{appName}}',
            heading: 'Welcome to {{appName}}, {{firstName}}',
            body: '{{sentBy}} added you to {{appName}}. Set your password to sign in for the first time.\n\nYour username: {{username}}',
            buttonLabel: 'Set your password',
            afterButton: 'The link works once and expires on {{expiresAt}} ({{linkValidHours}} hours after it was sent). After that, ask your administrator to send a new one.',
            footer: 'If you weren’t expecting this invite, you can ignore this email: nothing happens until the link is used.',
        },
    },
    password_reset: {
        key: 'password_reset',
        name: 'Password reset (sent by an admin)',
        description: 'Sent when an admin clicks Send password reset link on Admin › Users.',
        status: 'active',
        hasLink: true,
        mergeFields: [...COMMON, ...LINK, SENT_BY],
        defaults: {
            subject: 'Reset your {{appName}} password',
            heading: 'Hi {{firstName}}, reset your password',
            body: '{{sentBy}} sent you a link to choose a new password for your {{appName}} account.\n\nYour username: {{username}}',
            buttonLabel: 'Choose a new password',
            afterButton: 'The link works once and expires on {{expiresAt}} ({{linkValidHours}} hours after it was sent). After that, ask your administrator to send a new one.',
            footer: 'If you didn’t expect this, you can ignore this email: your current password keeps working until you choose a new one.',
        },
    },
    password_reset_self: {
        key: 'password_reset_self',
        name: 'Password reset (Forgot password)',
        description: 'Sent when a user asks for a reset link on the sign-in page (Forgot password).',
        status: 'active',
        hasLink: true,
        mergeFields: [...COMMON, ...LINK],
        defaults: {
            subject: 'Reset your {{appName}} password',
            heading: 'Hi {{firstName}}, reset your password',
            body: 'We received a request to reset the password for your {{appName}} account. Use the link below to choose a new one.\n\nYour username: {{username}}',
            buttonLabel: 'Choose a new password',
            afterButton: 'The link works once and expires on {{expiresAt}} ({{linkValidHours}} hours after it was sent). After that, you can ask for a new one from the sign-in page.',
            footer: 'If you didn’t ask for this, you can ignore this email: your current password keeps working, and nothing changes unless the link is used.',
        },
    },
    account_locked: {
        key: 'account_locked',
        name: 'Account locked',
        description: 'Reserved: will be sent when an account is locked after too many unsuccessful sign-in attempts.',
        status: 'reserved',
        hasLink: false,
        mergeFields: [
            ...COMMON,
            { key: 'lockedAt', label: 'Locked at', sample: 'Sat, 28 Nov 2026, 11:46 am IST' },
            { key: 'unlockAt', label: 'Unlocks at', sample: 'Sat, 28 Nov 2026, 12:16 pm IST' },
        ],
        defaults: {
            subject: 'Your {{appName}} account was locked',
            heading: 'Hi {{firstName}}, your account is locked',
            body: 'Your {{appName}} account ({{username}}) was locked on {{lockedAt}} after too many unsuccessful sign-in attempts.\n\nYou can sign in again after {{unlockAt}}, or use Forgot password on the sign-in page to choose a new password now.',
            buttonLabel: null,
            afterButton: null,
            footer: 'If this wasn’t you, tell your administrator straight away.',
        },
    },
    morning_summary: {
        key: 'morning_summary',
        name: 'Morning email',
        description: 'Reserved: the morning email keeps its built-in layout for now; this wording will be used when it moves onto templates.',
        status: 'reserved',
        hasLink: false,
        mergeFields: [...COMMON, { key: 'date', label: 'Date', sample: 'Sat, 28 Nov 2026' }],
        defaults: {
            subject: 'Your day ahead: {{date}}',
            heading: 'Good morning, {{firstName}}',
            body: 'Here is what is planned for you today.',
            buttonLabel: null,
            afterButton: null,
            footer: null,
        },
    },
};

const TAG = /\{\{\s*([A-Za-z][A-Za-z0-9]*)\s*\}\}/g;

/** Merge tags used in a text that the template doesn't offer. */
export function unknownMergeTags(def: EmailTemplateDef, text: string | null | undefined): string[] {
    if (!text) return [];
    const allowed = new Set(def.mergeFields.map((f) => f.key));
    const unknown = new Set<string>();
    for (const match of text.matchAll(TAG)) if (!allowed.has(match[1])) unknown.add(match[1]);
    return [...unknown];
}

/** Replaces {{tags}} with their values (missing = empty). The result is plain text, escaped later. */
export function mergeText(text: string, vars: Readonly<Record<string, string | null | undefined>>): string {
    return text.replace(TAG, (_, key: string) => vars[key] ?? '');
}

/** Sample values of a template's merge fields (preview, test sends). */
export const sampleVars = (def: EmailTemplateDef): Record<string, string> => Object.fromEntries(def.mergeFields.map((f) => [f.key, f.sample]));

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
// Email clients don't read CSS variables: the light layout's fixed colours (the brand blue is the light theme's).
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
} as const;

const paragraphsOf = (text: string | null | undefined): string[] =>
    (text ?? '')
        .replace(/\r\n?/g, '\n')
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter(Boolean);

const htmlParagraph = (text: string, style = '') =>
    `<p style="margin:0 0 14px 0;font-family:${FONT};font-size:15px;line-height:23px;color:${C.body};overflow-wrap:anywhere;${style}">${escapeHtml(text).replace(/\n/g, '<br>')}</p>`;

const anchor = (href: string, label: string, style: string) => `<a href="${escapeHtml(href)}" style="${style}" target="_blank" rel="noopener">${escapeHtml(label)}</a>`;

/** Only http(s) links become buttons (a merge value can't turn into javascript:). */
const safeUrl = (url: string | null | undefined): string | null => (url && /^https?:\/\//i.test(url.trim()) ? url.trim() : null);

/**
 * Subject, HTML and plain text of a template with these values. `content` is the admin's wording (or the defaults);
 * `vars.link` is the button's target for templates with a link.
 */
export function renderEmailTemplate(def: EmailTemplateDef, content: TemplateContent, vars: Readonly<Record<string, string | null | undefined>>): RenderedEmail {
    const merged = (text: string | null | undefined) => (text ? mergeText(text, vars) : '');
    const subject = merged(content.subject).replace(/\s+/g, ' ').trim().slice(0, 200) || APP_NAME;
    const heading = merged(content.heading).replace(/\s+/g, ' ').trim();
    const body = paragraphsOf(merged(content.body));
    const after = paragraphsOf(merged(content.afterButton));
    const footer = paragraphsOf(merged(content.footer));
    const url = def.hasLink ? safeUrl(vars.link) : null;
    const buttonLabel = merged(content.buttonLabel).trim() || 'Open';

    const button = url
        ? `<div style="padding:6px 0 20px 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-radius:8px;background-color:${C.brand};">${anchor(
              url,
              buttonLabel,
              `display:inline-block;padding:12px 24px;font-family:${FONT};font-size:15px;font-weight:600;line-height:20px;color:${C.onBrand};text-decoration:none;border-radius:8px;`,
          )}</td></tr></table></div>`
        : '';
    const fallback = url
        ? [
              htmlParagraph('If the button doesn’t work, copy this link into your browser:', `font-size:13px;line-height:19px;color:${C.muted};margin-bottom:4px;`),
              `<p style="margin:0 0 20px 0;font-family:Consolas,Menlo,monospace;font-size:12px;line-height:18px;word-break:break-all;">${anchor(url, url, `color:${C.brand};text-decoration:underline;`)}</p>`,
          ].join('\n')
        : '';
    const footerLines = [...footer, ...(url ? [NEVER_FORWARD] : [])];

    const html = [
        '<!DOCTYPE html>',
        '<html lang="en"><head>',
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        '<meta name="color-scheme" content="light">',
        '<meta name="supported-color-schemes" content="light">',
        '<meta name="referrer" content="no-referrer">',
        `<title>${escapeHtml(subject)}</title>`,
        '</head>',
        `<body style="margin:0;padding:0;background-color:${C.page};">`,
        `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.page};">${escapeHtml(body[0] ?? subject)}</div>`,
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background-color:${C.page};"><tr><td align="center" style="padding:24px 12px;">`,
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:${C.card};border:1px solid ${C.border};border-radius:12px;">`,
        `<tr><td style="padding:24px 24px 4px 24px;background-color:${C.band};border-radius:12px 12px 0 0;border-bottom:1px solid ${C.border};">`,
        `<div style="font-family:${FONT};font-size:13px;line-height:19px;color:${C.muted};">${escapeHtml(APP_NAME)}</div>`,
        `<h1 style="margin:6px 0 16px 0;font-family:${FONT};font-size:20px;line-height:28px;color:${C.heading};overflow-wrap:anywhere;">${escapeHtml(heading)}</h1>`,
        '</td></tr>',
        `<tr><td style="padding:20px 24px 4px 24px;">`,
        ...body.map((p) => htmlParagraph(p)),
        button,
        ...after.map((p) => htmlParagraph(p, 'font-size:14px;line-height:21px;')),
        fallback,
        '</td></tr>',
        ...(footerLines.length
            ? [
                  `<tr><td style="padding:16px 24px 24px 24px;border-top:1px solid ${C.border};font-family:${FONT};font-size:12px;line-height:18px;color:${C.muted};">`,
                  ...footerLines.map((line, i) => `<p style="margin:0 0 ${i === footerLines.length - 1 ? 0 : 8}px 0;overflow-wrap:anywhere;">${escapeHtml(line).replace(/\n/g, '<br>')}</p>`),
                  '</td></tr>',
              ]
            : []),
        '</table>',
        '</td></tr></table>',
        '</body></html>',
    ]
        .filter(Boolean)
        .join('\n');

    const text = [
        heading,
        '',
        ...body.flatMap((p) => [p, '']),
        ...(url ? [`${buttonLabel}: ${url}`, ''] : []),
        ...after.flatMap((p) => [p, '']),
        ...footerLines,
    ]
        .join('\n')
        .trim();

    return { subject, html, text };
}
