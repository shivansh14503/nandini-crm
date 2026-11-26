import { z } from 'zod';
import { isGraphLink } from '../../calendar-sync/providers/graphChanges.js';
import { CursorExpiredError, providerFetch } from '../../calendar-sync/providers/http.js';
import { graphUserUrl } from '../../calendar-sync/providers/microsoft.js';
import { FULL_SYNC_MAX_MESSAGES, MAX_PAGES_PER_RUN, WEB_LINK_MAX } from '../emailLog.constants.js';
import { hasPrivateMarker, isAutomatedHeaders, mailAddress } from '../emailLog.match.js';
import type { FetchImpl, ListOptions, MailAdapter, MailAddress, MailCtx, MailMessage, MailPage } from './types.js';

/**
 * Microsoft Graph v1.0 mail for email logging, with the tenant-wide app token (application permission `Mail.Read`, or
 * an Exchange RBAC for Applications role `Application Mail.Read` scoped to the logged people).
 *
 *   GET /users/{mailbox}/mailFolders('inbox')/messages/delta      and   …/mailFolders('sentitems')/messages/delta
 *       first run: $filter=receivedDateTime ge <now − 7 days>, $orderby=receivedDateTime desc [U: delta's only filter
 *       and order, per the message delta docs], $select of the header fields + bodyPreview (never body / attachments);
 *       pages follow @odata.nextLink; the last page's @odata.deltaLink is the folder's cursor. A run that reaches its
 *       limit keeps the nextLink as the cursor and continues next time.
 *       410 / syncStateNotFound → that folder starts over (bounded by the same filter).
 *   GET /users/{mailbox}/messages/{id}?$select=internetMessageHeaders   lazily, only for messages that matched a CRM
 *       address, to apply the automation rule (List-Unsubscribe / Auto-Submitted / Precedence).
 * Prefer: IdType="ImmutableId" (ids survive moves between folders), odata.maxpagesize=50. `@removed` entries are ignored
 * (a logged email stays logged). Links (cursor, next page) are only followed when they point at the Graph API itself.
 */

export const GRAPH_MAIL_PAGE_SIZE = 50;
export const GRAPH_MAIL_SELECT = [
    'id',
    'conversationId',
    'internetMessageId',
    'subject',
    'from',
    'toRecipients',
    'ccRecipients',
    'sentDateTime',
    'receivedDateTime',
    'bodyPreview',
    'hasAttachments',
    'isDraft',
    'sensitivity',
    'categories',
    'webLink',
].join(',');
const FOLDERS = [
    { key: 'inbox', path: "mailFolders('inbox')" },
    { key: 'sent', path: "mailFolders('sentitems')" },
] as const;
type FolderKey = (typeof FOLDERS)[number]['key'];

const recipientSchema = z.object({ emailAddress: z.object({ address: z.string().nullish(), name: z.string().nullish() }).nullish() });
export const graphMessageSchema = z.object({
    id: z.string(),
    conversationId: z.string().nullish(),
    internetMessageId: z.string().nullish(),
    subject: z.string().nullish(),
    from: recipientSchema.nullish(),
    toRecipients: z.array(recipientSchema).nullish(),
    ccRecipients: z.array(recipientSchema).nullish(),
    sentDateTime: z.string().nullish(),
    receivedDateTime: z.string().nullish(),
    bodyPreview: z.string().nullish(),
    hasAttachments: z.boolean().nullish(),
    isDraft: z.boolean().nullish(),
    sensitivity: z.string().nullish(),
    categories: z.array(z.string()).nullish(),
    webLink: z.string().nullish(),
});
const deltaSchema = z.object({ value: z.array(z.unknown()).nullish(), '@odata.nextLink': z.string().nullish(), '@odata.deltaLink': z.string().nullish() });
const headersSchema = z.object({ internetMessageHeaders: z.array(z.object({ name: z.string(), value: z.string() })).nullish() });

export type GraphMessage = z.infer<typeof graphMessageSchema>;

const PRIVATE_SENSITIVITY = new Set(['personal', 'private', 'confidential']);

const recipients = (list: GraphMessage['toRecipients']): MailAddress[] =>
    (list ?? []).map((r) => mailAddress(r.emailAddress?.address, r.emailAddress?.name)).filter((a): a is MailAddress => a !== null);

/** A Graph message as a MailMessage (`automated` unknown until its headers are read). Pure. */
export function graphToMessage(raw: GraphMessage, folder: FolderKey): MailMessage {
    const when = Date.parse(raw.sentDateTime ?? raw.receivedDateTime ?? '');
    const link = raw.webLink && raw.webLink.length <= WEB_LINK_MAX && /^https:\/\//i.test(raw.webLink) ? raw.webLink : null;
    return {
        providerMessageId: raw.id,
        providerThreadId: raw.conversationId ?? null,
        internetMessageId: raw.internetMessageId?.trim() || null,
        subject: raw.subject ?? '',
        from: mailAddress(raw.from?.emailAddress?.address, raw.from?.emailAddress?.name),
        to: recipients(raw.toRecipients),
        cc: recipients(raw.ccRecipients),
        sentAt: new Date(Number.isFinite(when) ? when : Date.now()),
        snippet: raw.bodyPreview ?? null,
        hasAttachments: Boolean(raw.hasAttachments),
        sentByMailbox: folder === 'sent',
        isDraft: Boolean(raw.isDraft),
        excluded: false,
        privateMarked: PRIVATE_SENSITIVITY.has((raw.sensitivity ?? '').toLowerCase()) || hasPrivateMarker(raw.categories ?? []),
        automated: null,
        webLink: link,
    };
}

/** URL of a folder's first delta page (pure, tested). */
export function graphMailDeltaUrl(mailbox: string, folderPath: string, since: Date): string {
    const params = new URLSearchParams({
        $select: GRAPH_MAIL_SELECT,
        $filter: `receivedDateTime ge ${since.toISOString()}`,
        $orderby: 'receivedDateTime desc',
    });
    return `${graphUserUrl(mailbox)}/${folderPath}/messages/delta?${params.toString()}`;
}

export function createGraphMailAdapter(fetchImpl?: FetchImpl): MailAdapter {
    const headers = (ctx: MailCtx) => ({ Authorization: `Bearer ${ctx.accessToken}`, Prefer: `IdType="ImmutableId", odata.maxpagesize=${GRAPH_MAIL_PAGE_SIZE}` });

    /** Reads one folder from its link until the delta link or the limit. Returns the messages and the link to keep. */
    async function readFolder(ctx: MailCtx, folder: (typeof FOLDERS)[number], start: string, budget: number, fullSync: boolean) {
        const messages: MailMessage[] = [];
        let url = start;
        let keep: string = start;
        let complete = false;
        for (let pages = 0; pages < MAX_PAGES_PER_RUN; pages += 1) {
            if (!isGraphLink(url)) throw new CursorExpiredError({ provider: 'microsoft', operation: 'mail-delta', status: 0, code: 'cursor_invalid' });
            const { json } = await providerFetch({ method: 'GET', url, headers: headers(ctx), provider: 'microsoft', operation: 'mail-delta' }, { fetchImpl, schema: deltaSchema, cursor: true });
            for (const item of json.value ?? []) {
                if (item && typeof item === 'object' && '@removed' in item) continue;
                const parsed = graphMessageSchema.safeParse(item);
                if (parsed.success) messages.push(graphToMessage(parsed.data, folder.key));
            }
            const next = json['@odata.nextLink'];
            const delta = json['@odata.deltaLink'];
            if (delta) {
                keep = delta;
                complete = true;
                break;
            }
            if (!next) {
                complete = true;
                break;
            }
            keep = next;
            url = next;
            if (messages.length >= budget || (fullSync && messages.length >= FULL_SYNC_MAX_MESSAGES)) break;
        }
        return { messages, keep, complete };
    }

    return {
        provider: 'microsoft',

        async listNew(ctx, cursor, options: ListOptions): Promise<MailPage> {
            const links = { inbox: cursor?.kind === 'graph' ? cursor.inbox : null, sent: cursor?.kind === 'graph' ? cursor.sent : null };
            const out: MailMessage[] = [];
            let complete = true;
            let resynced = false;
            for (const folder of FOLDERS) {
                const budget = Math.max(1, options.limit - out.length);
                const stored = links[folder.key];
                const first = graphMailDeltaUrl(ctx.mailbox, folder.path, options.since);
                let result: Awaited<ReturnType<typeof readFolder>>;
                try {
                    result = await readFolder(ctx, folder, stored ?? first, budget, !stored);
                    if (!stored) resynced = true;
                } catch (err) {
                    if (!(err instanceof CursorExpiredError) || !stored) throw err;
                    // The delta link expired (or isn't a Graph link): this folder starts over, bounded.
                    result = await readFolder(ctx, folder, first, budget, true);
                    resynced = true;
                }
                out.push(...result.messages);
                links[folder.key] = result.keep;
                if (!result.complete) complete = false;
            }
            return { messages: out, cursor: { kind: 'graph', inbox: links.inbox, sent: links.sent }, complete, resynced };
        },

        async automatedOf(ctx, providerMessageId) {
            const url = `${graphUserUrl(ctx.mailbox)}/messages/${encodeURIComponent(providerMessageId)}?$select=internetMessageHeaders`;
            const { json } = await providerFetch({ method: 'GET', url, headers: headers(ctx), provider: 'microsoft', operation: 'mail-headers' }, { fetchImpl, schema: headersSchema });
            const map: Record<string, string> = {};
            for (const h of json.internetMessageHeaders ?? []) {
                const key = h.name.toLowerCase();
                if (map[key] === undefined) map[key] = h.value;
            }
            return isAutomatedHeaders(map);
        },

        webLinkOf(_mailbox, message) {
            return message.webLink;
        },
    };
}
