import type { EmailVerificationStatus } from './localChecks.js';

// Reading the provider's List API reports (pure functions, unit-tested in listReports.test.ts).

/** A decided result to write onto every row with the address. */
export interface Decision {
    status: EmailVerificationStatus;
    reason: string;
}

/** Splits one CSV line into cells (handles quoted cells and doubled quotes). */
function csvCells(line: string): string[] {
    const cells: string[] = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (quoted) {
            if (ch === '"' && line[i + 1] === '"') {
                cell += '"';
                i++;
            } else if (ch === '"') quoted = false;
            else cell += ch;
        } else if (ch === '"') quoted = true;
        else if (ch === ',') {
            cells.push(cell);
            cell = '';
        } else cell += ch;
    }
    cells.push(cell);
    return cells.map((c) => c.trim());
}

const csvLines = (csv: string) => csv.split(/\r?\n/).filter((line) => line.trim().length > 0);

/** Addresses of a report: the first column (the one we uploaded), skipping the header. */
export function reportEmails(csv: string): Set<string> {
    const emails = new Set<string>();
    for (const line of csvLines(csv)) {
        const first = csvCells(line)[0]?.toLowerCase() ?? '';
        if (first.includes('@')) emails.add(first);
    }
    return emails;
}

export type ReportDetail = { reason?: string; acceptAll?: boolean };

/**
 * Best effort: the reason / accept-all columns of the full report, by header name. The provider appends its result
 * columns after ours but doesn't document their exact names, so a report without them just yields no details.
 */
export function reportDetails(csv: string): Map<string, ReportDetail> {
    const details = new Map<string, ReportDetail>();
    const lines = csvLines(csv);
    if (lines.length === 0) return details;
    const header = csvCells(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''));
    const reasonAt = header.findIndex((h) => h === 'reason' || h.endsWith('_reason'));
    const acceptAllAt = header.findIndex((h) => h === 'accept_all' || h === 'acceptall' || h.endsWith('accept_all'));
    if (reasonAt < 0 && acceptAllAt < 0) return details;
    for (const line of lines.slice(1)) {
        const cells = csvCells(line);
        const email = cells[0]?.toLowerCase() ?? '';
        if (!email.includes('@')) continue;
        const reason = reasonAt >= 0 ? cells[reasonAt]?.toLowerCase().replace(/\s+/g, '_') || undefined : undefined;
        const acceptAll = acceptAllAt >= 0 ? ['true', '1', 'yes'].includes((cells[acceptAllAt] ?? '').toLowerCase()) : undefined;
        details.set(email, { reason, acceptAll });
    }
    return details;
}

/**
 * Turns the provider's reports into results, matching the single-address mapping: safe to send = valid; valid but
 * not safe to send (catch-all, disposable, …) = risky; invalid = invalid; unknown / missing = undecided.
 */
export function decideFromReports(
    sent: readonly string[],
    reports: { safetosend: Set<string>; valid: Set<string>; invalid: Set<string> },
    details: Map<string, ReportDetail>,
): { decisions: Map<string, Decision>; undecided: number } {
    const decisions = new Map<string, Decision>();
    let undecided = 0;
    for (const email of sent) {
        const detail = details.get(email);
        if (reports.invalid.has(email)) decisions.set(email, { status: 'invalid', reason: detail?.reason ?? 'rejected_email' });
        else if (reports.safetosend.has(email)) decisions.set(email, { status: 'valid', reason: detail?.reason ?? 'accepted_email' });
        else if (reports.valid.has(email)) {
            const reason = detail?.acceptAll ? 'accept_all' : detail?.reason && detail.reason !== 'accepted_email' ? detail.reason : 'not_safe_to_send';
            decisions.set(email, { status: 'risky', reason });
        } else undecided += 1;
    }
    return { decisions, undecided };
}

