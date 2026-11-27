import { FULL_SYNC_MAX_MESSAGES } from '../emailLog.constants.js';
import type { MailAdapter, MailMessage, MailPage } from './types.js';

/**
 * In-memory mail provider (dev / tests; offered only while CALENDAR_FAKE_PROVIDER is on, like the fake calendar). Each
 * mailbox is a list of messages; the cursor is a position in it. Test controls: add messages, make the next calls of a
 * mailbox (or every mailbox, '*') throw, and say which messages are automated when their headers are read lazily.
 */

interface FakeMailbox {
    messages: MailMessage[];
}

const boxes = new Map<string, FakeMailbox>();
const failures = new Map<string, Error>();
const automatedIds = new Set<string>();
let headerReads = 0;

const box = (mailbox: string): FakeMailbox => {
    const key = mailbox.toLowerCase();
    let found = boxes.get(key);
    if (!found) {
        found = { messages: [] };
        boxes.set(key, found);
    }
    return found;
};

export const fakeMail = {
    /** Adds messages to a mailbox (oldest first). */
    add(mailbox: string, ...messages: MailMessage[]): void {
        box(mailbox).messages.push(...messages);
    },
    /** The next calls for this mailbox ('*' = every mailbox) throw `error` until cleared (null). */
    fail(mailbox: string, error: Error | null): void {
        if (error) failures.set(mailbox.toLowerCase(), error);
        else failures.delete(mailbox.toLowerCase());
    },
    /** `automatedOf` answers true for these message ids. */
    markAutomated(...ids: string[]): void {
        for (const id of ids) automatedIds.add(id);
    },
    headerReads: () => headerReads,
    reset(): void {
        boxes.clear();
        failures.clear();
        automatedIds.clear();
        headerReads = 0;
    },
};

const check = (mailbox: string) => {
    const error = failures.get(mailbox.toLowerCase()) ?? failures.get('*');
    if (error) throw error;
};

export function createFakeMailAdapter(): MailAdapter {
    return {
        provider: 'fake',
        async listNew(ctx, cursor, options): Promise<MailPage> {
            check(ctx.mailbox);
            const all = box(ctx.mailbox).messages;
            if (!cursor || cursor.kind !== 'fake') {
                const recent = all.filter((m) => m.sentAt.getTime() >= options.since.getTime()).slice(-FULL_SYNC_MAX_MESSAGES);
                return { messages: recent, cursor: { kind: 'fake', position: all.length }, complete: true, resynced: true };
            }
            const start = Math.min(cursor.position, all.length);
            const slice = all.slice(start, start + options.limit);
            const position = start + slice.length;
            return { messages: slice, cursor: { kind: 'fake', position }, complete: position >= all.length, resynced: false };
        },
        async automatedOf(ctx, id) {
            check(ctx.mailbox);
            headerReads += 1;
            return automatedIds.has(id);
        },
        webLinkOf(mailbox, message) {
            return `https://mail.example.test/${encodeURIComponent(mailbox)}/${encodeURIComponent(message.providerMessageId)}`;
        },
    };
}
