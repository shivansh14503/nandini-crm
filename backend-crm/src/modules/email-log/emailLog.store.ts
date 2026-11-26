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
}

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
        if (email.messageIdHash) {
            const found = await prisma.loggedEmail.findFirst({ where: { messageIdHash: email.messageIdHash }, select: { id: true } });
            if (found) return { id: found.id, created: false };
        }
        try {
            const row = await prisma.loggedEmail.create({ data: email, select: { id: true } });
            return { id: row.id, created: true };
        } catch (err) {
            // UX_LoggedEmail_messageIdHash: another employee's run logged it a moment ago. Outside any transaction (D45).
            if (!email.messageIdHash || !isUniqueViolation(err)) throw err;
            const winner = await prisma.loggedEmail.findFirst({ where: { messageIdHash: email.messageIdHash }, select: { id: true } });
            if (!winner) throw err;
            return { id: winner.id, created: false };
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
};
