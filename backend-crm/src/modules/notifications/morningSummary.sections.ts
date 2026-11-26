import { daysBetween, zonedDayOf } from '../../utils/zonedTime.js';
import type { CalendarItem } from '../activities/activity.calendar.js';
import { allDayRange } from '../activities/activity.mapper.js';
import { TASK_TYPE } from '../activities/activity.schedule.js';
import { DEFAULT_DISPLAY_FORMATS, type DisplayFormats } from '../company-formats/core/displayFormats.js';
import { dayCount, daysOverdue, formatDay, formatDayLong, formatTime, joinParts, relatedLabel } from './notification.format.js';
import { calendarDayPath, CONTRACTS_EXPIRING_PATH, crmUrl, googleCalendarDetails, googleCalendarLink, recordPath } from './morningSummary.links.js';

/**
 * The morning summary's content, built from plain rows (the service loads them with the calendar feed's where-builders
 * and access rules). Pure, so every rule is tested without a database; morningSummary.render.ts turns the result
 * into HTML and plain text.
 */

/** Rows listed in the overdue sections; the rest are counted ("and N more"). */
export const SUMMARY_LIST_MAX = 10;
/** Contracts ending within this many days are listed under renewals. */
export const ENDING_SOON_DAYS = 30;

/** An activity row of the summary (Notes never appear: they have no time). */
export interface SummaryActivityRow {
    id: string;
    subject: string;
    followupType: string;
    startAt: Date | null;
    endAt: Date | null;
    allDay: boolean;
    timeZone: string;
    location: string | null;
    relatedTo: string | null;
    relatedCode: string | null;
    remarks: string | null;
}

export interface SummaryContractRow {
    id: string;
    contractNumber: string;
    contractTitle: string;
    organizationName: string;
    /** Fake-UTC wall clock (Contract.renewalReminderDate). */
    renewalReminderDate: Date | null;
    /** DATE column (midnight UTC). */
    endDate: Date | null;
}

/** Lead / opportunity follow-ups as the calendar feed maps them (leadFollowupToCalendarItem …). */
export type SummaryFollowup = Pick<CalendarItem, 'module' | 'recordId' | 'title' | 'followupType' | 'start' | 'allDay' | 'startDay' | 'relatedTo'>;

export interface MorningSummaryInput {
    now: Date;
    timeZone: string;
    /** Web app base URL (APP_PUBLIC_URL). */
    appUrl: string;
    recipient: { username: string; fullName: string };
    /** Followup Type value → its option's `meta.icon` (call, meeting …). */
    typeIcons?: Readonly<Record<string, string>>;
    /** Company display formats (Admin › Company formats); missing = the defaults (this email's own style). */
    formats?: DisplayFormats;
    /** Activities of today (owner, or invited and not declined), with the total when capped. */
    today: { total: number; rows: SummaryActivityRow[] };
    /** The user's Planned activities that ended by the start of today, oldest first (not in today's schedule). */
    overdue: { total: number; rows: SummaryActivityRow[] };
    /** Totals per module (the lists are capped) for the headline and the "and N more" links. */
    followupsToday: FollowupRows;
    /** Oldest first; totals per module for the "and N more" links. */
    overdueFollowups: FollowupRows;
    /**
     * Renewal reminder today, or ending within ENDING_SOON_DAYS (a contract may be in both: listed once), with the
     * total when capped.
     */
    contracts: { total: number; rows: SummaryContractRow[] };
}

/** Follow-up rows of one section, with each module's full count. */
export interface FollowupRows {
    leads: number;
    opportunities: number;
    rows: SummaryFollowup[];
}

export type SummarySectionKey = 'today' | 'overdueActivities' | 'followupsToday' | 'overdueFollowups' | 'contracts';

export interface SummaryItem {
    /** Left column: `10:30 AM – 11:30 AM`, `All day`, `Due Mon 23 Nov` … */
    when: string;
    /** Type badge: `📞 Call` ('' when none). */
    badge: string;
    title: string;
    /** Second line: related record, location, organization … */
    detail: string;
    /** Absolute link to the record in the CRM. */
    href: string;
    /** "Add to Google Calendar" (today's schedule, not Tasks). */
    googleCalendarUrl?: string;
}

export interface SummaryMoreLink {
    label: string;
    href: string;
}

export interface SummarySection {
    key: SummarySectionKey;
    title: string;
    total: number;
    items: SummaryItem[];
    more: SummaryMoreLink[];
}

export interface SummaryCounts {
    todayActivities: number;
    overdueActivities: number;
    followupsToday: number;
    overdueFollowups: number;
    contracts: number;
}

export interface MorningSummary {
    day: string;
    /** `Wednesday, 25 November 2026` */
    dayLabel: string;
    recipientName: string;
    appUrl: string;
    /** "Open the CRM" button target. */
    calendarUrl: string;
    counts: SummaryCounts;
    /** `3 activities today · 5 follow-ups due · 2 overdue` */
    headline: string;
    /** Non-empty sections only, in display order. */
    sections: SummarySection[];
    /** True when every section is empty. */
    empty: boolean;
    /** The display formats the texts were written in (the subject line uses them too). */
    formats: DisplayFormats;
}

const TYPE_EMOJI: Readonly<Record<string, string>> = {
    call: '📞',
    meeting: '👥',
    presentation: '📊',
    email: '✉️',
    whatsapp: '💬',
    visit: '📍',
};

/** `📞 Call`: the type with the emoji of its option's icon (✅ for Task, 🗓️ when it has none). */
export function typeBadge(followupType: string | null | undefined, typeIcons: Readonly<Record<string, string>> = {}): string {
    if (!followupType) return '';
    const emoji = followupType === TASK_TYPE ? '✅' : (TYPE_EMOJI[typeIcons[followupType] ?? ''] ?? '🗓️');
    return `${emoji} ${followupType}`;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** `3 activities today · 5 follow-ups due · 2 overdue · 1 contract to renew`, or `Nothing due today`. */
export function summaryHeadline(counts: SummaryCounts): string {
    const overdue = counts.overdueActivities + counts.overdueFollowups;
    const parts = [
        counts.todayActivities > 0 ? `${plural(counts.todayActivities, 'activity', 'activities')} today` : '',
        counts.followupsToday > 0 ? `${plural(counts.followupsToday, 'follow-up')} due` : '',
        overdue > 0 ? `${overdue} overdue` : '',
        counts.contracts > 0 ? `${plural(counts.contracts, 'contract')} to renew` : '',
    ];
    return joinParts(parts) || 'Nothing due today';
}

const startOf = (row: SummaryActivityRow) => row.startAt?.getTime() ?? 0;

/** Today's schedule order: all-day first, then by start, then subject. */
export function compareTodayRows(a: SummaryActivityRow, b: SummaryActivityRow): number {
    if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
    return startOf(a) - startOf(b) || a.subject.localeCompare(b.subject);
}

function todayWhen(row: SummaryActivityRow, day: string, formats: DisplayFormats): string {
    if (!row.startAt) return '';
    if (row.allDay) {
        const { startDay, endDay } = allDayRange(row.startAt, row.endAt, row.timeZone);
        return startDay === endDay ? 'All day' : `All day (until ${formatDay(endDay, formats)})`;
    }
    const start = formatTime(row.startAt, row.timeZone, formats);
    const startedEarlier = zonedDayOf(row.startAt, row.timeZone) < day;
    const hasEnd = row.endAt !== null && row.endAt.getTime() > row.startAt.getTime();
    if (startedEarlier) return hasEnd && row.endAt ? `Until ${formatTime(row.endAt, row.timeZone, formats)}` : start;
    return hasEnd && row.endAt && zonedDayOf(row.endAt, row.timeZone) === day ? `${start} – ${formatTime(row.endAt, row.timeZone, formats)}` : start;
}

/*
 * Parked by the owner (Calendar Phase 2): follow-up activities (origin 'followup', P2-4) are kept out of the activity
 * sections by morningSummary.service.ts (NOT_FOLLOW_UP_ACTIVITY), so the email lists each follow-up once, from its
 * lead / opportunity. When the email is picked up again: list follow-up activities here instead of the derived ones,
 * and hide the "Add to Google Calendar" link for owners whose calendar is synced.
 */
function activityItem(row: SummaryActivityRow, input: MorningSummaryInput, when: string, withCalendarLink: boolean): SummaryItem {
    const related = relatedLabel(row);
    const href = crmUrl(input.appUrl, recordPath('activities', row.id));
    const item: SummaryItem = {
        when,
        badge: typeBadge(row.followupType, input.typeIcons),
        title: row.subject,
        detail: joinParts([related, row.location]),
        href,
    };
    // Calendar Phase 2 (parked by the owner, spec D29): once calendar sync pushes CRM meetings to Google / Outlook, a
    // connected user (calendar-sync/connection.service.ts hasActiveCalendarConnection) may no longer need this "Add to
    // Google Calendar" link. Nothing changes until the owner un-parks the morning email.
    if (withCalendarLink && row.startAt && row.followupType !== TASK_TYPE) {
        item.googleCalendarUrl = googleCalendarLink({
            title: row.subject,
            start: row.startAt,
            end: row.endAt,
            allDay: row.allDay,
            timeZone: row.timeZone,
            details: googleCalendarDetails({ related, remarks: row.remarks, crmLink: href }),
            location: row.location,
        });
    }
    return item;
}

function overdueActivityWhen(row: SummaryActivityRow, formats: DisplayFormats): string {
    if (!row.startAt) return '';
    const day = formatDay(zonedDayOf(row.startAt, row.timeZone), formats);
    return row.allDay ? day : `${day}, ${formatTime(row.startAt, row.timeZone, formats)}`;
}

const MODULE_NAME: Readonly<Record<string, string>> = { leads: 'Lead', opportunities: 'Opportunity' };

function followupItem(item: SummaryFollowup, input: MorningSummaryInput, when: string, extra = ''): SummaryItem {
    const module = item.module === 'opportunities' ? 'opportunities' : 'leads';
    return {
        when,
        badge: typeBadge(item.followupType, input.typeIcons),
        title: item.title,
        detail: joinParts([`${MODULE_NAME[module]} ${item.relatedTo}`.trim(), extra]),
        href: crmUrl(input.appUrl, recordPath(module, item.recordId)),
    };
}

/** Timed follow-ups by time, then the ones without a time. */
export function compareFollowupsToday(a: SummaryFollowup, b: SummaryFollowup): number {
    if (a.allDay !== b.allDay) return a.allDay ? 1 : -1;
    return a.start.localeCompare(b.start) || a.title.localeCompare(b.title);
}

const followupDay = (item: SummaryFollowup, timeZone: string) => item.startDay ?? zonedDayOf(new Date(item.start), timeZone);

/** Where a follow-up section's "and N more" links go, per module (absolute URLs). */
interface FollowupMoreHrefs {
    leads: string;
    opportunities: string;
}

/** A follow-up section's total and its "and N more leads / opportunities" links (lists are capped per module). */
function followupTotals(followups: FollowupRows, shown: readonly SummaryFollowup[], hrefs: FollowupMoreHrefs): { total: number; more: SummaryMoreLink[] } {
    const shownLeads = shown.filter((item) => item.module === 'leads').length;
    const shownOpportunities = shown.length - shownLeads;
    const more: SummaryMoreLink[] = [];
    if (followups.leads > shownLeads) {
        more.push({ label: `and ${plural(followups.leads - shownLeads, 'more lead')}`, href: hrefs.leads });
    }
    if (followups.opportunities > shownOpportunities) {
        more.push({
            label: `and ${plural(followups.opportunities - shownOpportunities, 'more opportunity', 'more opportunities')}`,
            href: hrefs.opportunities,
        });
    }
    return { total: Math.max(followups.leads + followups.opportunities, shown.length), more };
}

/** Contracts: renewal reminders today first (by time), then by end date; one row per contract. */
function contractItems(rows: readonly SummaryContractRow[], input: MorningSummaryInput, day: string, formats: DisplayFormats): SummaryItem[] {
    // Fake-UTC wall clock and DATE columns: their UTC reading is the business-timezone value.
    const renewalDay = (row: SummaryContractRow) => (row.renewalReminderDate ? row.renewalReminderDate.toISOString().slice(0, 10) : '');
    const endDay = (row: SummaryContractRow) => (row.endDate ? row.endDate.toISOString().slice(0, 10) : '');
    const remindsToday = (row: SummaryContractRow) => renewalDay(row) === day;
    const unique = [...new Map(rows.map((row) => [row.id, row])).values()];
    unique.sort((a, b) => {
        if (remindsToday(a) !== remindsToday(b)) return remindsToday(a) ? -1 : 1;
        if (remindsToday(a)) return (a.renewalReminderDate?.getTime() ?? 0) - (b.renewalReminderDate?.getTime() ?? 0);
        return endDay(a).localeCompare(endDay(b)) || a.contractNumber.localeCompare(b.contractNumber);
    });
    return unique.map((row) => {
        const ends = endDay(row);
        const daysLeft = ends ? daysBetween(day, ends) : null;
        const inDays = daysLeft === null ? '' : daysLeft === 0 ? 'today' : daysLeft > 0 ? `in ${dayCount(daysLeft)}` : `${dayCount(-daysLeft)} ago`;
        let when: string;
        let endsText: string;
        if (remindsToday(row) && row.renewalReminderDate) {
            when = `Renewal, ${formatTime(row.renewalReminderDate, 'UTC', formats)}`;
            endsText = ends ? `ends ${formatDay(ends, formats)} (${inDays})` : '';
        } else {
            when = ends ? `Ends ${formatDay(ends, formats)}` : '';
            endsText = inDays;
        }
        return {
            when,
            badge: '',
            title: joinParts([row.contractTitle, row.organizationName]),
            detail: joinParts([row.contractNumber, endsText]),
            href: crmUrl(input.appUrl, recordPath('contracts', row.id)),
        };
    });
}

/** Builds the summary: sections in display order, empty ones left out. */
export function buildMorningSummary(input: MorningSummaryInput): MorningSummary {
    const { now, timeZone, appUrl } = input;
    const formats = input.formats ?? DEFAULT_DISPLAY_FORMATS;
    const day = zonedDayOf(now, timeZone);
    const sections: SummarySection[] = [];
    const activitiesUrl = crmUrl(appUrl, '/activities?mine=1');

    // The day's agenda, so a link opened later in the day (or the next morning) still shows this day.
    const dayAgendaUrl = crmUrl(appUrl, calendarDayPath(day));
    const todayRows = [...input.today.rows].sort(compareTodayRows);
    const todayTotal = Math.max(input.today.total, todayRows.length);
    if (todayTotal > 0) {
        sections.push({
            key: 'today',
            title: "Today's schedule",
            total: todayTotal,
            items: todayRows.map((row) => activityItem(row, input, todayWhen(row, day, formats), true)),
            more: todayTotal > todayRows.length ? [{ label: `and ${todayTotal - todayRows.length} more`, href: dayAgendaUrl }] : [],
        });
    }

    const overdueRows = input.overdue.rows.slice(0, SUMMARY_LIST_MAX);
    const overdueTotal = Math.max(input.overdue.total, overdueRows.length);
    if (overdueTotal > 0) {
        sections.push({
            key: 'overdueActivities',
            title: 'Overdue activities',
            total: overdueTotal,
            items: overdueRows.map((row) => activityItem(row, input, overdueActivityWhen(row, formats), false)),
            more: overdueTotal > overdueRows.length ? [{ label: `and ${overdueTotal - overdueRows.length} more`, href: activitiesUrl }] : [],
        });
    }

    // The day's agenda lists every follow-up due that day; the lead / opportunity lists can't be filtered to it by URL.
    const followups = [...input.followupsToday.rows].sort(compareFollowupsToday);
    const followupsToday = followupTotals(input.followupsToday, followups, { leads: dayAgendaUrl, opportunities: dayAgendaUrl });
    if (followupsToday.total > 0) {
        sections.push({
            key: 'followupsToday',
            title: 'Follow-ups due today',
            total: followupsToday.total,
            items: followups.map((item) => followupItem(item, input, item.allDay ? 'Any time' : formatTime(new Date(item.start), timeZone, formats))),
            more: followupsToday.more,
        });
    }

    const overdueFollowups = input.overdueFollowups.rows.slice(0, SUMMARY_LIST_MAX);
    const overdueFollowupTotals = followupTotals(input.overdueFollowups, overdueFollowups, {
        leads: crmUrl(appUrl, '/leads'),
        opportunities: crmUrl(appUrl, '/opportunities'),
    });
    if (overdueFollowupTotals.total > 0) {
        sections.push({
            key: 'overdueFollowups',
            title: 'Overdue follow-ups',
            total: overdueFollowupTotals.total,
            items: overdueFollowups.map((item) => {
                const due = followupDay(item, timeZone);
                return followupItem(item, input, `Due ${formatDay(due, formats)}`, `${dayCount(daysOverdue(due, day))} overdue`);
            }),
            more: overdueFollowupTotals.more,
        });
    }

    const contracts = contractItems(input.contracts.rows, input, day, formats);
    const contractTotal = Math.max(input.contracts.total, contracts.length);
    if (contractTotal > 0) {
        sections.push({
            key: 'contracts',
            title: 'Contract renewals',
            total: contractTotal,
            items: contracts,
            // The first rows end soonest, so the rest are on the "Expiring in 30 Days" pill (a renewal reminder is
            // set 15 days before the End Date by default).
            more: contractTotal > contracts.length ? [{ label: `and ${contractTotal - contracts.length} more`, href: crmUrl(appUrl, CONTRACTS_EXPIRING_PATH) }] : [],
        });
    }

    const counts: SummaryCounts = {
        todayActivities: todayTotal,
        overdueActivities: overdueTotal,
        followupsToday: followupsToday.total,
        overdueFollowups: overdueFollowupTotals.total,
        contracts: contractTotal,
    };
    return {
        day,
        dayLabel: formatDayLong(day, formats),
        recipientName: input.recipient.fullName.trim() || input.recipient.username,
        appUrl,
        calendarUrl: crmUrl(appUrl, '/calendar'),
        counts,
        headline: summaryHeadline(counts),
        sections,
        empty: sections.length === 0,
        formats,
    };
}
