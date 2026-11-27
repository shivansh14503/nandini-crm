import { prisma } from '../../config/prisma.js';
import { isUniqueViolation } from '../../utils/prismaErrors.js';
import { ADDRESS_LOOKUP_CHUNK, type EmailDirection, type EmailLogModule } from './emailLog.constants.js';
import type { AddressLookup, AddressMatch, OpportunityLookup } from './emailLog.match.js';

/**
 * The database side of email logging, behind one interface so the engine (emailLog.ingest.ts) runs on an in-memory
 * store in tests. Every insert here is a single statement **outside any transaction**: a unique-index error (another
 * employee's run logged the same Message-ID first, or a re-read of the same mailbox message) is caught right here and
 * answered with the winner's row (D45: never caught inside a transaction).
 */

export interface MailboxRow {
    username: string;
    mode: string | null;
    provider: string | null;
    accountEmail: string | null;
    cursorJson: string | null;
    status: string;
    errorLevel: string | null;
    lastErrorCode: string | null;
    consecutiveFailures: number;
    lastRunAt: Date | null;
    lastSuccessAt: Date | null;
    nextRunAt: Date | null;
    leaseId: string | null;
    leaseUntil: Date | null;
    loggingSince: Date | null;
    purgedAt: Date | null;
}

/** What a run re-reads while it works: the person's switch and the last purge (an admin may act mid-run). */
export interface MailboxRunState {
    mode: string | null;
    loggingSince: Date | null;
    purgedAt: Date | null;
}

/** Who a run is for: the person's live calendar connection decides the provider and mailbox (design note EL1). */
export interface MailTarget {
    userActive: boolean;
    connection: { provider: string; accountEmail: string } | null;
    mailbox: MailboxRow | null;
}

export interface NewEmail {
    messageIdHash: string | null;
    threadId: string | null;
    subject: string;
    fromEmail: string;
    fromName: string | null;
    toJson: string;
    ccJson: string;
    moreRecipients: number;
    sentAt: Date;
    direction: EmailDirection;
    snippet: string | null;
    hasAttachments: boolean;
    provider: string;
    ownerUsername: string;
}

export interface NewCopy {
    emailId: string;
    username: string;
    provider: string;
    providerMessageId: string;
    providerThreadId: string | null;
    webLink: string | null;
    direction: EmailDirection;
    /** The mailbox address is the sender or in To / Cc (false = Bcc / list: not shown as a participant to others). */
    addressed: boolean;
}

export interface NewLink {
    emailId: string;
    module: EmailLogModule;
    recordId: string;
    matchedEmail: string | null;
    sentAt: Date;
}

/** The state a finished (or failed) run writes on the mailbox row. */
export interface RunUpdate {
    provider?: string | null;
    accountEmail?: string | null;
    cursorJson?: string | null;
    status?: string;
    errorLevel?: string | null;
    lastErrorCode?: string | null;
    lastErrorMessage?: string | null;
    lastErrorAt?: Date | null;
    consecutiveFailures?: number;
    lastRunAt?: Date;
    lastSuccessAt?: Date;
    nextRunAt?: Date | null;
    loggedDelta?: number;
}

export interface EmailLogStore {
    loadTarget(username: string): Promise<MailTarget>;
    /** The person's switch and last purge, read again during a run (null = no row). */
    runState(username: string): Promise<MailboxRunState | null>;
    /** Takes the mailbox's lease (creating its row on first use); false when another run holds it. */
    claimLease(username: string, leaseId: string, now: Date, until: Date): Promise<boolean>;
    /** Writes the run's result and frees the lease (only while this run still holds it). */
    finishRun(username: string, leaseId: string, update: RunUpdate): Promise<void>;
    lookupAddresses(emails: readonly string[]): Promise<AddressLookup>;
    opportunitiesOfContacts(contactIds: readonly string[]): Promise<OpportunityLookup>;
    findCopy(username: string, providerMessageId: string): Promise<{ emailId: string } | null>;
    /** The email of this Message-ID (creating it), and whether this call created it. */
    upsertEmail(email: NewEmail): Promise<{ id: string; created: boolean }>;
    /** False when the copy already existed. */
    addCopy(copy: NewCopy): Promise<boolean>;
    /** False when the link already existed. */
    addLink(link: NewLink): Promise<boolean>;
    /** A mailbox of this provider has logged successfully before. */
    anyMailboxOk(provider: string): Promise<boolean>;
    /** Deletes these copies of one mailbox and every email left without a copy (a run overtaken by a purge). */
    removeCopies(username: string, providerMessageIds: readonly string[]): Promise<number>;
}

/**
 * Two mailboxes' copies are the same email only when the sent times agree within this window (the Message-ID header
 * is sender-controlled: a reused id with a different date is stored as its own email, without a hash).
 */
export const SAME_EMAIL_WINDOW_MS = 48 * 60 * 60_000;

/** Whether a row found by Message-ID hash is the same email as `email` (sent times within the window). Pure. */
export const isSameEmail = (row: { sentAt: Date }, email: Pick<NewEmail, 'sentAt'>): boolean => Math.abs(row.sentAt.getTime() - email.sentAt.getTime()) <= SAME_EMAIL_WINDOW_MS;

const chunks = <T>(items: readonly T[], size: number): T[][] => {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
};

const MAILBOX_SELECT = {
    username: true,
    mode: true,
    provider: true,
    accountEmail: true,
    cursorJson: true,
    status: true,
    errorLevel: true,
    lastErrorCode: true,
    consecutiveFailures: true,
    lastRunAt: true,
    lastSuccessAt: true,
    nextRunAt: true,
    leaseId: true,
    leaseUntil: true,
    loggingSince: true,
    purgedAt: true,
} as const;

export const prismaEmailLogStore: EmailLogStore = {
    async loadTarget(username) {
        const [user, connection, mailbox] = await Promise.all([
            prisma.user.findUnique({ where: { username }, select: { isActive: true, isGroupUser: true } }),
            prisma.calendarConnection.findFirst({ where: { username, status: 'ok' }, select: { provider: true, accountEmail: true } }),
            prisma.loggedEmailMailbox.findUnique({ where: { username }, select: MAILBOX_SELECT }),
        ]);
        return { userActive: Boolean(user?.isActive && !user.isGroupUser), connection, mailbox };
    },

    async runState(username) {
        return prisma.loggedEmailMailbox.findUnique({ where: { username }, select: { mode: true, loggingSince: true, purgedAt: true } });
    },

    async claimLease(username, leaseId, now, until) {
        const take = () =>
            prisma.loggedEmailMailbox.updateMany({
                where: { username, OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] },
                data: { leaseId, leaseUntil: until },
            });
        if ((await take()).count === 1) return true;
        const exists = await prisma.loggedEmailMailbox.findUnique({ where: { username }, select: { username: true } });
        if (exists) return false;
        try {
            await prisma.loggedEmailMailbox.create({ data: { username, leaseId, leaseUntil: until } });
            return true;
        } catch (err) {
            if (!isUniqueViolation(err)) throw err;
            return (await take()).count === 1;
        }
    },

    async finishRun(username, leaseId, update) {
        const { loggedDelta, ...data } = update;
        await prisma.loggedEmailMailbox.updateMany({
            where: { username, leaseId },
            data: { ...data, ...(loggedDelta ? { loggedCount: { increment: loggedDelta } } : {}), leaseId: null, leaseUntil: null },
        });
    },

    async lookupAddresses(emails) {
        const map = new Map<string, AddressMatch>();
        for (const chunk of chunks([...new Set(emails)], ADDRESS_LOOKUP_CHUNK)) {
            const rows = await prisma.entityEmail.findMany({
                where: { email: { in: chunk }, OR: [{ contact: { isDeleted: false } }, { lead: { isDeleted: false } }] },
                select: { email: true, contactId: true, leadId: true },
            });
            for (const row of rows) {
                const key = row.email.trim().toLowerCase();
                const entry = map.get(key) ?? { contacts: [], leads: [] };
                if (row.contactId && !entry.contacts.includes(row.contactId)) entry.contacts.push(row.contactId);
                if (row.leadId && !entry.leads.includes(row.leadId)) entry.leads.push(row.leadId);
                map.set(key, entry);
            }
        }
        return map;
    },

    async opportunitiesOfContacts(contactIds) {
        const map = new Map<string, string[]>();
        for (const chunk of chunks([...new Set(contactIds)], ADDRESS_LOOKUP_CHUNK)) {
            const rows = await prisma.opportunity.findMany({
                where: { contactId: { in: chunk }, isDeleted: false },
                select: { id: true, contactId: true },
                orderBy: { updatedAt: 'desc' },
                take: 2_000,
            });
            for (const row of rows) if (row.contactId) map.set(row.contactId, [...(map.get(row.contactId) ?? []), row.id]);
        }
        return map;
    },

    async findCopy(username, providerMessageId) {
        return prisma.loggedEmailCopy.findUnique({ where: { username_providerMessageId: { username, providerMessageId } }, select: { emailId: true } });
    },

    async upsertEmail(email) {
        const create = async (data: NewEmail) => ({ id: (await prisma.loggedEmail.create({ data, select: { id: true } })).id, created: true });
        if (!email.messageIdHash) return create(email);
        const byHash = () => prisma.loggedEmail.findFirst({ where: { messageIdHash: email.messageIdHash }, select: { id: true, sentAt: true } });
        const found = await byHash();
        if (found) return isSameEmail(found, email) ? { id: found.id, created: false } : create({ ...email, messageIdHash: null });
        try {
            return await create(email);
        } catch (err) {
            // UX_LoggedEmail_messageIdHash: another employee's run logged it a moment ago. Outside any transaction (D45).
            if (!isUniqueViolation(err)) throw err;
            const winner = await byHash();
            if (!winner) throw err;
            return isSameEmail(winner, email) ? { id: winner.id, created: false } : create({ ...email, messageIdHash: null });
        }
    },

    async addCopy(copy) {
        try {
            await prisma.loggedEmailCopy.create({ data: copy });
            return true;
        } catch (err) {
            if (isUniqueViolation(err)) return false;
            throw err;
        }
    },

    async addLink(link) {
        try {
            await prisma.loggedEmailLink.create({ data: link });
            return true;
        } catch (err) {
            if (isUniqueViolation(err)) return false;
            throw err;
        }
    },

    async anyMailboxOk(provider) {
        return (await prisma.loggedEmailMailbox.count({ where: { provider, lastSuccessAt: { not: null } } })) > 0;
    },

    async removeCopies(username, providerMessageIds) {
        let removed = 0;
        for (const chunk of chunks([...new Set(providerMessageIds)], ADDRESS_LOOKUP_CHUNK)) {
            const copies = await prisma.loggedEmailCopy.findMany({ where: { username, providerMessageId: { in: chunk } }, select: { id: true, emailId: true } });
            if (copies.length === 0) continue;
            removed += (await prisma.loggedEmailCopy.deleteMany({ where: { id: { in: copies.map((c) => c.id) } } })).count;
            await prisma.loggedEmail.deleteMany({ where: { id: { in: [...new Set(copies.map((c) => c.emailId))] }, copies: { none: {} } } });
        }
        return removed;
    },
};
