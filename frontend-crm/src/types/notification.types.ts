/**
 * In-app notifications (navbar bell) and the morning summary email preview: the contract of `/api/notifications`
 * (backend-crm/src/modules/notifications, docs/api-plan.md). Empty values are `''`, never `null`.
 */

export const NOTIFICATION_KINDS = ['activity_reminder', 'activity_assigned', 'activity_invited', 'contract_renewal', 'calendar_reconnect'] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/** Module of the record a notification is about. */
export type NotificationEntityModule = 'activities' | 'contracts' | 'calendar-connections' | '';

/** One notification of the bell (named so it doesn't shadow the browser's own `Notification` type). */
export interface CrmNotification {
    id: string;
    /** A known kind, or a newer one this build doesn't know yet (shown with the generic icon). */
    kind: NotificationKind | (string & {});
    /** e.g. `Reminder: Demo with ACME`, `Assigned to you: …`, `Invitation: …`, `Contract renewal due: …`. */
    title: string;
    body: string;
    entityModule: NotificationEntityModule | (string & {});
    entityId: string;
    /** ISO instant the notification is about (activity start, renewal reminder), '' when none. */
    dueAt: string;
    /** Username of who caused it, `system`, or ''. */
    actor: string;
    /** ISO instant, '' while unread. */
    readAt: string;
    /** ISO instant. */
    createdAt: string;
    /** App route to open: `/calendar?activity=<id>`, `/contracts/<id>`, `/connected-calendars`, or '' when nowhere. */
    href: string;
}

/** `GET /api/notifications`: newest first. */
export interface NotificationPage {
    data: CrmNotification[];
    /** Pass as `before` for the next (older) page; null on the last page. */
    nextCursor: string | null;
    unreadCount: number;
}

export interface NotificationListParams {
    unreadOnly?: boolean;
    /** 1–50, default 20. */
    limit?: number;
    /** `nextCursor` of the previous page (`<createdAt ISO>|<id>`). */
    before?: string;
}

export interface NotificationReadResult {
    id: string;
    readAt: string;
}

/** Row counts of each morning summary section. */
export interface MorningSummaryCounts {
    todayActivities: number;
    overdueActivities: number;
    followupsToday: number;
    overdueFollowups: number;
    contracts: number;
}

/** `GET /api/notifications/morning-summary/preview`: the caller's email for today, sent nowhere. */
export interface MorningSummaryPreview {
    subject: string;
    /** The email's HTML (inline styles, light background): render it in a sandboxed iframe only. */
    html: string;
    text: string;
    counts: MorningSummaryCounts;
    /** Nothing due today: with the default settings no email goes out. */
    empty: boolean;
    /** Whether outgoing email is turned on on the server. */
    mailEnabled: boolean;
    /** The caller's email address ('' when none: they get no email). */
    email: string;
    /**
     * Why the caller gets no morning email even with mail on: they turned it off (My Profile › Notifications), are
     * out of office today, or an admin marked them on leave. null when nothing stops it.
     */
    notSentReason: MorningSummaryNotSentReason | null;
}

export type MorningSummaryNotSentReason = 'opted_out' | 'out_of_office' | 'on_leave';

/** `POST /api/notifications/morning-summary/test` (admin roles). */
export interface MorningSummaryTestResult {
    status: 'sent' | 'failed' | 'skipped' | 'duplicate';
    error?: string;
    /** Where it went. */
    email: string;
    /** For the toast (also the response's `message`). */
    message: string;
}
