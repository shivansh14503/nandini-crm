import type { EntityEmail } from '../../generated/prisma/client.js';
import type { AuditAction, AuditEntityType, AuditEntry } from '../../services/audit.service.js';

/**
 * Audit entries for email check results written onto records (the background check after a save, bulk re-checks,
 * the admin's "accept"). One entry per record and address whose result changed, on the record's own trail:
 * `{ verificationStatus: { from, to }, email, reason, runId? }`. Re-checks that confirm the stored result write nothing.
 */

/** EntityEmail columns read before a result is written. */
export const CHECKED_ROW_SELECT = {
    email: true,
    leadId: true,
    contactId: true,
    organizationId: true,
    referralId: true,
    verificationStatus: true,
    verificationReason: true,
    verifiedAt: true,
} as const;

export type CheckedRow = Pick<EntityEmail, keyof typeof CHECKED_ROW_SELECT>;

export interface CheckResult {
    status: string | null;
    reason: string | null;
}

/** `valid` / `risky` / `invalid`; `undecided` = checked without an answer; `unchecked` = never checked. */
export const resultLabel = (status: string | null, checked: boolean): string => status ?? (checked ? 'undecided' : 'unchecked');

function ownerOf(row: CheckedRow): [AuditEntityType, string] | null {
    if (row.leadId) return ['Lead', row.leadId];
    if (row.contactId) return ['Contact', row.contactId];
    if (row.organizationId) return ['Organization', row.organizationId];
    if (row.referralId) return ['Referral', row.referralId];
    return null;
}

export function emailCheckEntries(
    rows: readonly CheckedRow[],
    resultFor: (email: string) => CheckResult | undefined,
    options: { action: AuditAction; changedBy: string; runId?: string },
): AuditEntry[] {
    const entries: AuditEntry[] = [];
    for (const row of rows) {
        const next = resultFor(row.email);
        const owner = ownerOf(row);
        if (!next || !owner) continue;
        const from = resultLabel(row.verificationStatus, row.verifiedAt !== null);
        const to = resultLabel(next.status, true);
        if (from === to && (row.verificationReason ?? null) === (next.reason ?? null)) continue;
        entries.push({
            entityType: owner[0],
            entityId: owner[1],
            action: options.action,
            changedBy: options.changedBy,
            // An address found unable to receive mail is worth a second look.
            severity: to === 'invalid' ? 'NOTICE' : undefined,
            changes: {
                verificationStatus: { from, to },
                email: row.email,
                reason: next.reason,
                ...(options.runId ? { runId: options.runId } : {}),
            },
        });
    }
    return entries;
}
