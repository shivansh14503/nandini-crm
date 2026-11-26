import type { FetchImpl } from '../../calendar-sync/providers/types.js';

/**
 * Mail adapters of email logging (Calendar Phase 4). Thin `fetch` clients (no SDKs, D1) on the same company tokens as
 * calendar sync (calendar-sync/tokenSource.ts, minted with the mail scope). Each adapter turns its provider's answer into
 * `MailMessage`s: headers, flags and a snippet only. Bodies and attachments are never requested.
 */

export type MailProviderKey = 'google' | 'microsoft' | 'fake';
export type { FetchImpl };

export interface MailAddress {
    /** Lower-cased. */
    email: string;
    name?: string;
}

/** One message as the engine sees it (provider-neutral). */
export interface MailMessage {
    /** Gmail id / Graph immutable id. */
    providerMessageId: string;
    providerThreadId: string | null;
    /** The RFC Message-ID header as sent (dedupe across mailboxes); null when the message had none. */
    internetMessageId: string | null;
    subject: string;
    from: MailAddress | null;
    to: MailAddress[];
    cc: MailAddress[];
    sentAt: Date;
    /** Provider snippet (Gmail snippet / Graph bodyPreview), not yet cleaned. */
    snippet: string | null;
    hasAttachments: boolean;
    /** The employee sent it (Gmail SENT label / Graph Sent Items). */
    sentByMailbox: boolean;
    isDraft: boolean;
    /** Spam, trash or chat (Gmail labels): never logged. */
    excluded: boolean;
    /** Marked private / personal by the employee (label, category, sensitivity). */
    privateMarked: boolean;
    /** From the headers; null = not read yet (Graph: read lazily for matched messages only). */
    automated: boolean | null;
    /** Outlook on the web link (Graph); Gmail links are built from the id. */
    webLink: string | null;
}

/** Where a mailbox's reading stands. Gmail: the history id; Graph: one delta / next link per folder. */
export type MailCursor = { kind: 'gmail'; historyId: string } | { kind: 'graph'; inbox: string | null; sent: string | null } | { kind: 'fake'; position: number };

export interface MailPage {
    messages: MailMessage[];
    /** The cursor to save once these messages are handled. */
    cursor: MailCursor;
    /** False when the run stopped at its limit (more is waiting; the next run continues from `cursor`). */
    complete: boolean;
    /** The cursor was missing or expired, so the last FULL_SYNC_DAYS were read again (bounded). */
    resynced: boolean;
}

/** One mailbox, for one run. The token never leaves the adapter call. */
export interface MailCtx {
    accessToken: string;
    /** Lower-cased company email: the impersonated Google user / the Graph `/users/{mailbox}` segment. */
    mailbox: string;
}

export interface ListOptions {
    /** A full sync reads messages received since then. */
    since: Date;
    /** New messages handled by one run. */
    limit: number;
}

export interface MailAdapter {
    readonly provider: MailProviderKey;
    /** New messages since the cursor (null = first run: a bounded full sync). */
    listNew(ctx: MailCtx, cursor: MailCursor | null, options: ListOptions): Promise<MailPage>;
    /** Reads the headers the automation rule needs (Graph, lazily, for matched messages only). */
    automatedOf(ctx: MailCtx, providerMessageId: string): Promise<boolean>;
    /** "Open in Gmail / Outlook" for the employee whose mailbox holds it. */
    webLinkOf(mailbox: string, message: Pick<MailMessage, 'providerMessageId' | 'webLink'>): string | null;
}
