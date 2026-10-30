import { z } from 'zod';
import type { TransactionClient } from '../../config/prisma.js';
import type { EntityEmail } from '../../generated/prisma/client.js';
import { optionalEmail } from '../../validators/common.js';

/** `CorporateEmail` from frontend-crm/src/types/organization.types.ts. */
export interface CorporateEmailDto {
    id: string;
    email: string;
    isPrimary: boolean;
    isOptedOut: boolean;
    isInvalidBounce: boolean;
}

const MAX_EMAILS_PER_RECORD = 20;

/** One row of an email list as the forms send it (ids are client-generated and ignored). */
export const corporateEmailInputSchema = z.object({
    id: z.string().optional(),
    email: optionalEmail,
    isPrimary: z.boolean().default(false),
    isOptedOut: z.boolean().default(false),
    isInvalidBounce: z.boolean().default(false),
});

export const corporateEmailListSchema = z
    .array(corporateEmailInputSchema)
    .max(MAX_EMAILS_PER_RECORD, { message: `At most ${MAX_EMAILS_PER_RECORD} email addresses are allowed.` });

export type CorporateEmailInput = z.infer<typeof corporateEmailInputSchema>;

export interface NormalizedEmail {
    email: string;
    isPrimary: boolean;
    isOptedOut: boolean;
    isInvalidBounce: boolean;
}

/**
 * Drops blank rows, de-duplicates addresses (case-insensitively) and guarantees exactly one primary
 * whenever at least one address remains, mirroring the frontend's RhfEmailList behaviour.
 */
export function normalizeEmails(rows: readonly CorporateEmailInput[] | undefined): NormalizedEmail[] {
    const seen = new Set<string>();
    const result: NormalizedEmail[] = [];
    for (const row of rows ?? []) {
        const email = row.email?.trim().toLowerCase();
        if (!email || seen.has(email)) continue;
        seen.add(email);
        result.push({ email, isPrimary: row.isPrimary, isOptedOut: row.isOptedOut, isInvalidBounce: row.isInvalidBounce });
    }
    const primaryIndex = Math.max(result.findIndex((row) => row.isPrimary), 0);
    return result.map((row, index) => ({ ...row, isPrimary: result.length > 0 && index === primaryIndex }));
}

export function toEmailDtos(rows: readonly EntityEmail[] | undefined): CorporateEmailDto[] {
    return [...(rows ?? [])]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((row) => ({
            id: row.id,
            email: row.email,
            isPrimary: row.isPrimary,
            isOptedOut: row.isOptedOut,
            isInvalidBounce: row.isInvalidBounce,
        }));
}

export type EmailOwner = { organizationId: string } | { contactId: string } | { leadId: string };

/** Replaces an owner's email list (delete + insert) inside the caller's transaction. */
export async function replaceEmails(tx: TransactionClient, owner: EmailOwner, emails: readonly NormalizedEmail[]): Promise<void> {
    await tx.entityEmail.deleteMany({ where: owner });
    if (emails.length === 0) return;
    await tx.entityEmail.createMany({
        data: emails.map((row, index) => ({ ...row, ...owner, sortOrder: index })),
    });
}

/** Prisma `include` / `orderBy` fragment for loading a record's emails in display order. */
export const emailsInclude = { orderBy: { sortOrder: 'asc' } } as const;
