import { formatDay, truncate } from './notification.format.js';
import type { MorningSummary, SummaryItem, SummarySection } from './morningSummary.sections.js';

/**
 * The morning summary as an email: HTML (table layout, inline styles only, 600 px wide at most, a light background,
 * so it reads the same in Gmail, Outlook and phone mail apps) plus a plain-text alternative. Email clients don't use
 * the CRM theme, so this is the one place literal colours are right: the brand blue #2563EB for the button and links,
 * neutral slate for everything else. Every interpolated value goes through `escapeHtml`.
 */

/** Escapes text for HTML element content and quoted attribute values. */
export function escapeHtml(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const SUBJECT_MAX = 200;
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const C = {
    page: '#EEF2F7',
    card: '#FFFFFF',
    band: '#F8FAFC',
    border: '#E2E8F0',
    divider: '#F1F5F9',
    heading: '#0F172A',
    body: '#475569',
    muted: '#64748B',
    brand: '#2563EB',
    onBrand: '#FFFFFF',
} as const;

export const FOOTER_LINES = [
    'You get this email because you have an active Nandini CRM account with this address. It goes out on working-day mornings.',
    '"Add to Google Calendar" saves a one-time copy: if the activity moves in the CRM, that copy won\'t follow. Automatic calendar sync is planned.',
] as const;

export interface RenderedEmail {
    subject: string;
    html: string;
    text: string;
}

/** `Your CRM day, Wed 25 Nov: 3 activities today · 2 overdue` (at most 200 characters). */
export function summarySubject(summary: MorningSummary): string {
    return truncate(`Your CRM day, ${formatDay(summary.day, summary.formats)}: ${summary.headline}`, SUBJECT_MAX);
}

const link = (href: string, label: string, style: string) => `<a href="${escapeHtml(href)}" style="${style}" target="_blank" rel="noopener">${escapeHtml(label)}</a>`;

function itemRow(item: SummaryItem, first: boolean): string {
    const border = first ? '' : `border-top:1px solid ${C.divider};`;
    const badge = item.badge
        ? ` <span style="display:inline-block;margin-left:4px;padding:1px 6px;border-radius:4px;background-color:${C.divider};color:${C.body};font-size:12px;font-weight:normal;line-height:18px;white-space:nowrap;">${escapeHtml(item.badge)}</span>`
        : '';
    const detail = item.detail ? `<div style="margin-top:2px;font-size:13px;line-height:19px;color:${C.muted};">${escapeHtml(item.detail)}</div>` : '';
    const calendar = item.googleCalendarUrl
        ? `<div style="margin-top:4px;font-size:12px;line-height:18px;">${link(item.googleCalendarUrl, 'Add to Google Calendar', `color:${C.brand};text-decoration:underline;`)}</div>`
        : '';
    return [
        '<tr>',
        `<td valign="top" width="112" style="${border}padding:10px 8px 10px 12px;width:112px;font-family:${FONT};font-size:13px;line-height:19px;color:${C.body};">${escapeHtml(item.when)}</td>`,
        `<td valign="top" style="${border}padding:10px 12px 10px 4px;font-family:${FONT};font-size:14px;line-height:20px;color:${C.heading};">`,
        `${link(item.href, item.title, `color:${C.heading};font-weight:600;text-decoration:none;`)}${badge}${detail}${calendar}`,
        '</td>',
        '</tr>',
    ].join('');
}

function sectionHtml(section: SummarySection): string {
    const rows = section.items.map((item, index) => itemRow(item, index === 0)).join('');
    const more = section.more.length
        ? `<p style="margin:8px 0 0 0;font-family:${FONT};font-size:13px;line-height:19px;">${section.more
              .map((entry) => link(entry.href, entry.label, `color:${C.brand};text-decoration:underline;`))
              .join(' &middot; ')}</p>`
        : '';
    return [
        '<tr><td style="padding:20px 24px 0 24px;">',
        `<h2 style="margin:0 0 8px 0;font-family:${FONT};font-size:15px;line-height:22px;color:${C.heading};">${escapeHtml(section.title)} <span style="font-weight:normal;color:${C.muted};">(${section.total})</span></h2>`,
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border:1px solid ${C.border};border-radius:8px;border-collapse:separate;background-color:${C.card};">${rows}</table>`,
        more,
        '</td></tr>',
    ].join('');
}

function renderHtml(summary: MorningSummary, subject: string): string {
    const button = `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-radius:8px;background-color:${C.brand};">${link(
        summary.calendarUrl,
        'Open the CRM',
        `display:inline-block;padding:10px 20px;font-family:${FONT};font-size:14px;font-weight:600;line-height:20px;color:${C.onBrand};text-decoration:none;border-radius:8px;`,
    )}</td></tr></table>`;
    const intro = summary.empty
        ? 'Nothing is due today: no activities, follow-ups or renewals. Enjoy the clear day!'
        : summary.headline;
    return [
        '<!DOCTYPE html>',
        '<html lang="en"><head>',
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        '<meta name="color-scheme" content="light">',
        '<meta name="supported-color-schemes" content="light">',
        `<title>${escapeHtml(subject)}</title>`,
        '</head>',
        `<body style="margin:0;padding:0;background-color:${C.page};">`,
        // Inbox preview text.
        `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.page};">${escapeHtml(summary.headline)}</div>`,
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background-color:${C.page};"><tr><td align="center" style="padding:24px 12px;">`,
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:${C.card};border:1px solid ${C.border};border-radius:12px;">`,
        `<tr><td style="padding:24px 24px 0 24px;background-color:${C.band};border-radius:12px 12px 0 0;border-bottom:1px solid ${C.border};">`,
        `<div style="font-family:${FONT};font-size:13px;line-height:19px;color:${C.muted};">Nandini CRM &middot; ${escapeHtml(summary.dayLabel)}</div>`,
        `<h1 style="margin:6px 0 4px 0;font-family:${FONT};font-size:20px;line-height:28px;color:${C.heading};">Good morning, ${escapeHtml(summary.recipientName)}</h1>`,
        `<p style="margin:0 0 16px 0;font-family:${FONT};font-size:15px;line-height:22px;color:${C.body};">${escapeHtml(intro)}</p>`,
        `<div style="padding:0 0 20px 0;">${button}</div>`,
        '</td></tr>',
        ...summary.sections.map(sectionHtml),
        `<tr><td style="padding:24px;font-family:${FONT};font-size:12px;line-height:18px;color:${C.muted};">`,
        FOOTER_LINES.map((line) => `<p style="margin:0 0 8px 0;">${escapeHtml(line)}</p>`).join(''),
        '</td></tr>',
        '</table>',
        '</td></tr></table>',
        '</body></html>',
    ].join('\n');
}

function renderText(summary: MorningSummary): string {
    const lines: string[] = [`Good morning, ${summary.recipientName}`, summary.dayLabel, '', summary.empty ? 'Nothing is due today.' : summary.headline, ''];
    for (const section of summary.sections) {
        lines.push(`${section.title.toUpperCase()} (${section.total})`);
        for (const item of section.items) {
            lines.push(`- ${[item.when, item.title].filter(Boolean).join('  ')}${item.badge ? ` [${item.badge}]` : ''}`);
            if (item.detail) lines.push(`  ${item.detail}`);
            lines.push(`  ${item.href}`);
            if (item.googleCalendarUrl) lines.push(`  Add to Google Calendar: ${item.googleCalendarUrl}`);
        }
        for (const entry of section.more) lines.push(`  ${entry.label}: ${entry.href}`);
        lines.push('');
    }
    lines.push(`Open the CRM: ${summary.calendarUrl}`, '', ...FOOTER_LINES);
    return lines.join('\n');
}

/** Subject, HTML and plain text of the summary email. */
export function renderMorningSummary(summary: MorningSummary): RenderedEmail {
    const subject = summarySubject(summary);
    return { subject, html: renderHtml(summary, subject), text: renderText(summary) };
}
