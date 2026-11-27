import { z } from 'zod';
import { providerFetch, ProviderNotFoundError } from '../../calendar-sync/providers/http.js';
import { FULL_SYNC_MAX_MESSAGES, MAX_PAGES_PER_RUN } from '../emailLog.constants.js';
import { hasPrivateMarker, isAutomatedHeaders, parseAddressList } from '../emailLog.match.js';
import type { FetchImpl, ListOptions, MailAdapter, MailCtx, MailCursor, MailMessage, MailPage } from './types.js';

/**
 * Gmail API v1 for email logging, with a domain-wide-delegation token minted for the employee (`sub`) with
 * `gmail.readonly` only (emailLog.constants.ts GMAIL_SCOPE). `users/me` is the impersonated employee.
 *
 *   first run / expired cursor  GET /profile (historyId H) → GET /messages?q=after:<since> -in:chats -in:drafts -in:spam
 *                               -in:trash (≤ 300 ids) → messages.get each; cursor = H
 *   later runs                  GET /history?startHistoryId=<cursor>&historyTypes=messageAdded (pages of 100) →
 *                               messages.get each new id (drafts / spam / trash / chats skipped by their labels)
 *   404 on history              the cursor is too old: the bounded full sync above [V: "a historyId is typically valid
 *                               for at least a week … HTTP 404 … perform a full sync"]
 *   messages.get                format=metadata with a fixed header list (no body, no attachment) + snippet + labels
 *
 * Messages are fetched 5 at a time. A message deleted in between (404) is skipped. Tokens and URLs are never logged
 * (providerFetch errors carry the operation and code only).
 */

export const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';
export const GMAIL_PAGE_SIZE = 100;
export const GMAIL_FETCH_CONCURRENCY = 5;
/** Headers read with format=metadata: addresses, subject, date, Message-ID and the automation signals. */
export const GMAIL_METADATA_HEADERS = ['From', 'To', 'Cc', 'Subject', 'Date', 'Message-ID', 'List-Unsubscribe', 'List-Id', 'Auto-Submitted', 'Precedence'] as const;
/** Labels of messages never logged (before fetching their metadata). */
const EXCLUDED_LABELS = new Set(['SPAM', 'TRASH', 'CHAT']);

const profileSchema = z.object({ historyId: z.union([z.string(), z.number()]).transform(String) });
const listSchema = z.object({ messages: z.array(z.object({ id: z.string() })).nullish(), nextPageToken: z.string().nullish() });
const historySchema = z.object({
    history: z
        .array(
            z.object({
                id: z.union([z.string(), z.number()]).transform(String),
                messagesAdded: z.array(z.object({ message: z.object({ id: z.string(), labelIds: z.array(z.string()).nullish() }) })).nullish(),
            }),
        )
        .nullish(),
    nextPageToken: z.string().nullish(),
    historyId: z.union([z.string(), z.number()]).transform(String).nullish(),
});
const headerSchema = z.object({ name: z.string(), value: z.string() });
const partSchema = z.object({ filename: z.string().nullish(), mimeType: z.string().nullish() }).passthrough();
export const gmailMessageSchema = z.object({
    id: z.string(),
    threadId: z.string().nullish(),
    labelIds: z.array(z.string()).nullish(),
    snippet: z.string().nullish(),
    internalDate: z.union([z.string(), z.number()]).nullish(),
    payload: z.object({ mimeType: z.string().nullish(), headers: z.array(headerSchema).nullish(), parts: z.array(partSchema).nullish() }).nullish(),
});
const labelsSchema = z.object({ labels: z.array(z.object({ id: z.string(), name: z.string(), type: z.string().nullish() })).nullish() });

export type GmailMessage = z.infer<typeof gmailMessageSchema>;

/** A Gmail message (format=metadata) as a MailMessage. `labelNames`: user label id → name. Pure. */
export function gmailToMessage(raw: GmailMessage, labelNames: ReadonlyMap<string, string> = new Map()): MailMessage {
    const headers: Record<string, string> = {};
    for (const h of raw.payload?.headers ?? []) {
        const key = h.name.toLowerCase();
        if (headers[key] === undefined) headers[key] = h.value;
    }
    const labels = raw.labelIds ?? [];
    const internal = raw.internalDate !== null && raw.internalDate !== undefined ? Number(raw.internalDate) : NaN;
    const headerDate = headers.date ? Date.parse(headers.date) : NaN;
    const sentAt = new Date(Number.isFinite(internal) && internal > 0 ? internal : Number.isFinite(headerDate) ? headerDate : Date.now());
    const userLabelNames = labels.map((id) => labelNames.get(id)).filter((n): n is string => Boolean(n));
    const parts = raw.payload?.parts ?? [];
    return {
        providerMessageId: raw.id,
        providerThreadId: raw.threadId ?? null,
        internetMessageId: headers['message-id']?.trim() || null,
        subject: headers.subject ?? '',
        from: parseAddressList(headers.from)[0] ?? null,
        to: parseAddressList(headers.to),
        cc: parseAddressList(headers.cc),
        sentAt,
        snippet: raw.snippet ?? null,
        // [U] format=metadata may leave out the parts: a multipart/mixed message is read as having attachments.
        hasAttachments: parts.some((p) => Boolean(p.filename)) || (raw.payload?.mimeType ?? '').toLowerCase() === 'multipart/mixed',
        sentByMailbox: labels.includes('SENT'),
        isDraft: labels.includes('DRAFT'),
        excluded: labels.some((l) => EXCLUDED_LABELS.has(l)),
        privateMarked: hasPrivateMarker(userLabelNames),
        automated: isAutomatedHeaders(headers),
        webLink: null,
    };
}

/** The Gmail search of a bounded full sync (pure, tested). */
export function gmailFullSyncQuery(since: Date): string {
    return `after:${Math.floor(since.getTime() / 1000)} -in:chats -in:drafts -in:spam -in:trash`;
}

/** Runs `fn` over `items`, `limit` at a time, keeping the order. */
async function mapLimited<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
    const out: R[] = new Array(items.length);
    let next = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        for (;;) {
            const i = next;
            next += 1;
            if (i >= items.length) return;
            out[i] = await fn(items[i]);
        }
    });
    await Promise.all(workers);
    return out;
}

export function createGmailAdapter(fetchImpl?: FetchImpl): MailAdapter {
    const get = <T>(ctx: MailCtx, path: string, operation: string, schema: z.ZodType<T>) =>
        providerFetch({ method: 'GET', url: `${GMAIL_API}${path}`, headers: { Authorization: `Bearer ${ctx.accessToken}` }, provider: 'google', operation }, { fetchImpl, schema }).then((r) => r.json);

    async function labelMap(ctx: MailCtx): Promise<Map<string, string>> {
        const json = await get(ctx, '/labels', 'mail-labels', labelsSchema);
        return new Map((json.labels ?? []).filter((l) => l.type !== 'system').map((l) => [l.id, l.name]));
    }

    async function fetchMessages(ctx: MailCtx, ids: readonly string[]): Promise<MailMessage[]> {
        const params = new URLSearchParams({ format: 'metadata' });
        for (const h of GMAIL_METADATA_HEADERS) params.append('metadataHeaders', h);
        const raws = await mapLimited(ids, GMAIL_FETCH_CONCURRENCY, async (id) => {
            try {
                return await get(ctx, `/messages/${encodeURIComponent(id)}?${params.toString()}`, 'mail-get', gmailMessageSchema);
            } catch (err) {
                if (err instanceof ProviderNotFoundError) return null; // deleted since it was listed
                throw err;
            }
        });
        const found = raws.filter((r): r is GmailMessage => r !== null);
        const needsLabels = found.some((m) => (m.labelIds ?? []).some((l) => l.startsWith('Label_')));
        const names = needsLabels ? await labelMap(ctx) : new Map<string, string>();
        return found.map((m) => gmailToMessage(m, names));
    }

    async function fullSync(ctx: MailCtx, since: Date): Promise<MailPage> {
        const profile = await get(ctx, '/profile', 'mail-profile', profileSchema);
        const ids: string[] = [];
        let pageToken: string | null | undefined;
        let pages = 0;
        do {
            const params = new URLSearchParams({ q: gmailFullSyncQuery(since), maxResults: String(GMAIL_PAGE_SIZE) });
            if (pageToken) params.set('pageToken', pageToken);
            const json = await get(ctx, `/messages?${params.toString()}`, 'mail-list', listSchema);
            for (const m of json.messages ?? []) if (ids.length < FULL_SYNC_MAX_MESSAGES) ids.push(m.id);
            pageToken = json.nextPageToken;
            pages += 1;
        } while (pageToken && ids.length < FULL_SYNC_MAX_MESSAGES && pages < MAX_PAGES_PER_RUN);
        return { messages: await fetchMessages(ctx, ids), cursor: { kind: 'gmail', historyId: profile.historyId }, complete: true, resynced: true };
    }

    return {
        provider: 'google',

        async listNew(ctx, cursor, options: ListOptions): Promise<MailPage> {
            if (!cursor || cursor.kind !== 'gmail') return fullSync(ctx, options.since);
            const ids: string[] = [];
            const seen = new Set<string>();
            let pageToken: string | null | undefined;
            let pages = 0;
            let last: MailCursor = cursor;
            let complete = true;
            try {
                outer: do {
                    const params = new URLSearchParams({ startHistoryId: cursor.historyId, historyTypes: 'messageAdded', maxResults: String(GMAIL_PAGE_SIZE) });
                    if (pageToken) params.set('pageToken', pageToken);
                    const json = await get(ctx, `/history?${params.toString()}`, 'mail-history', historySchema);
                    pages += 1;
                    for (const record of json.history ?? []) {
                        for (const added of record.messagesAdded ?? []) {
                            const labels = added.message.labelIds ?? [];
                            if (labels.includes('DRAFT') || labels.some((l) => EXCLUDED_LABELS.has(l))) continue;
                            if (seen.has(added.message.id)) continue;
                            seen.add(added.message.id);
                            ids.push(added.message.id);
                        }
                        last = { kind: 'gmail', historyId: record.id };
                        if (ids.length >= options.limit) {
                            complete = false;
                            break outer;
                        }
                    }
                    pageToken = json.nextPageToken;
                    if (!pageToken && json.historyId) last = { kind: 'gmail', historyId: json.historyId };
                    if (pageToken && pages >= MAX_PAGES_PER_RUN) complete = false;
                } while (pageToken && pages < MAX_PAGES_PER_RUN);
            } catch (err) {
                // 404: the history id is too old (or unknown): bounded full sync.
                if (err instanceof ProviderNotFoundError) return fullSync(ctx, options.since);
                throw err;
            }
            return { messages: await fetchMessages(ctx, ids), cursor: last, complete, resynced: false };
        },

        async automatedOf() {
            // Gmail's metadata already carried the headers (gmailToMessage sets `automated`).
            return false;
        },

        webLinkOf(mailbox, message) {
            return `https://mail.google.com/mail/?authuser=${encodeURIComponent(mailbox)}#all/${encodeURIComponent(message.providerMessageId)}`;
        },
    };
}
