import type { AuditEntry } from '@/hooks/queries/useAuditLogs';
import { parseTimeOfDay } from '@/utils/pastDates';

/** One item of a record's follow-up history. */
export interface FollowUpEvent {
    id: string;
    /** `rated`: the Rating changed on its own (the nightly ageing of a lead). */
    kind: 'created' | 'followUp' | 'converted' | 'rated';
    /** ISO timestamp of the change. */
    at: string;
    author: string;
    /** Customer response picked on this follow-up. */
    response?: string;
    remarks?: string;
    /** Follow-up slot before this change (follow-ups only). */
    previous?: string;
    /** Follow-up slot after this change ('' when none). */
    next: string;
    /** The next follow-up stayed the same. */
    retained?: boolean;
    /** Leads: the Rating before and after ('' when none). */
    rating?: { from: string; to: string };
    /** Leads: unanswered calls in a row after this follow-up (shown when > 0). */
    unansweredCalls?: number;
    /** Leads: this follow-up closed the lead, with that status. */
    closedAs?: string;
    /** Why the Rating is what it is. */
    reason?: string;
}

/** The `followUp` block of a lead's FOLLOW_UP history row (backend lead.followUp.ts FollowUpSummary). */
interface FollowUpSummary {
    response?: string;
    remarks?: string;
    previous?: { date?: string; time?: string };
    next?: { date?: string; time?: string };
    decision?: 'keep' | 'new' | 'closed';
    status?: { from?: string; to?: string };
    rating?: { from?: string; to?: string };
    unansweredCalls?: number;
    reason?: string;
}

const FOLLOW_UP_FIELDS = ['nextFollowupDate', 'nextFollowupTime', 'customerResponse', 'remarks'] as const;
type FollowUpField = (typeof FOLLOW_UP_FIELDS)[number];
type FollowUpState = Record<FollowUpField, string>;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n: number) => String(n).padStart(2, '0');
const str = (value: unknown) => (value === null || value === undefined ? '' : String(value).trim());

const isDiff = (value: unknown): value is { from: unknown; to: unknown } =>
    typeof value === 'object' && value !== null && 'from' in value && 'to' in value;

/** `2026-11-16` + `11:10 AM` → `16 Nov 2026 · 11:10 am`; '' when no date. */
export function formatSlot(date: string, time: string): string {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
    if (!match) return '';
    const day = `${Number(match[3])} ${MONTHS[Number(match[2]) - 1]} ${match[1]}`;
    const minutes = parseTimeOfDay(time);
    if (minutes === null) return day;
    const h = Math.floor(minutes / 60);
    return `${day} · ${h % 12 || 12}:${pad(minutes % 60)} ${h < 12 ? 'am' : 'pm'}`;
}

/** ISO timestamp → `14 Nov, 10:11 am` (year added when it isn't the current one). */
export function formatEventTime(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const year = d.getFullYear() === new Date().getFullYear() ? '' : ` ${d.getFullYear()}`;
    const h = d.getHours();
    return `${d.getDate()} ${MONTHS[d.getMonth()]}${year}, ${h % 12 || 12}:${pad(d.getMinutes())} ${h < 12 ? 'am' : 'pm'}`;
}

/**
 * Rebuilds the follow-up history from the record's audit rows (newest first in, newest first out): its creation,
 * every update that touched the follow-up fields, and a lead's conversion. Previous slots come from each diff's
 * `from` values, so the history stays right even when older rows are past the audit endpoint's limit.
 */
export function buildFollowUpEvents(entries: AuditEntry[]): FollowUpEvent[] {
    const state: FollowUpState = { nextFollowupDate: '', nextFollowupTime: '', customerResponse: '', remarks: '' };
    const events: FollowUpEvent[] = [];

    for (const entry of [...entries].reverse()) {
        const changes = (entry.changes ?? {}) as Record<string, unknown>;
        const base = { id: entry.id, at: entry.createdAt, author: entry.changedBy };

        if (entry.action === 'CREATE') {
            for (const field of FOLLOW_UP_FIELDS) state[field] = str(changes[field]);
            const rating = str(changes.rating);
            events.push({
                ...base,
                kind: 'created',
                response: state.customerResponse || undefined,
                remarks: state.remarks || undefined,
                next: formatSlot(state.nextFollowupDate, state.nextFollowupTime),
                rating: rating ? { from: '', to: rating } : undefined,
                reason: str(changes.ratingReason) || undefined,
            });
            continue;
        }

        if (entry.action === 'CONVERT') {
            const rating = isDiff(changes.rating) ? { from: str(changes.rating.from), to: str(changes.rating.to) } : undefined;
            events.push({ ...base, kind: 'converted', next: formatSlot(state.nextFollowupDate, state.nextFollowupTime), rating });
            state.nextFollowupDate = '';
            state.nextFollowupTime = '';
            continue;
        }

        // A lead follow-up: its own summary says it all (it is written even when nothing else changed).
        if (entry.action === 'FOLLOW_UP' && changes.followUp && typeof changes.followUp === 'object') {
            const f = changes.followUp as FollowUpSummary;
            for (const field of FOLLOW_UP_FIELDS) if (isDiff(changes[field])) state[field] = str((changes[field] as { to: unknown }).to);
            state.nextFollowupDate = str(f.next?.date);
            state.nextFollowupTime = str(f.next?.time);
            const previous = formatSlot(str(f.previous?.date), str(f.previous?.time));
            events.push({
                ...base,
                kind: 'followUp',
                response: str(f.response) || undefined,
                remarks: str(f.remarks) || undefined,
                previous,
                next: formatSlot(state.nextFollowupDate, state.nextFollowupTime),
                retained: f.decision === 'keep',
                rating: f.rating ? { from: str(f.rating.from), to: str(f.rating.to) } : undefined,
                unansweredCalls: typeof f.unansweredCalls === 'number' ? f.unansweredCalls : undefined,
                closedAs: f.decision === 'closed' ? str(f.status?.to) || 'Closed' : undefined,
                reason: str(f.reason) || undefined,
            });
            continue;
        }

        if (entry.action !== 'UPDATE' && entry.action !== 'STATUS_CHANGE') continue;
        const touched = FOLLOW_UP_FIELDS.filter((field) => isDiff(changes[field]));
        if (touched.length === 0) {
            // The Rating moving on by itself (the nightly ageing).
            if (isDiff(changes.rating)) {
                events.push({
                    ...base,
                    kind: 'rated',
                    next: formatSlot(state.nextFollowupDate, state.nextFollowupTime),
                    rating: { from: str(changes.rating.from), to: str(changes.rating.to) },
                    reason: isDiff(changes.ratingReason) ? str(changes.ratingReason.to) : undefined,
                });
            }
            continue;
        }

        const before = { ...state };
        for (const field of touched) {
            const diff = changes[field] as { from: unknown; to: unknown };
            before[field] = str(diff.from);
            state[field] = str(diff.to);
        }
        const previous = formatSlot(before.nextFollowupDate, before.nextFollowupTime);
        const next = formatSlot(state.nextFollowupDate, state.nextFollowupTime);
        events.push({
            ...base,
            kind: 'followUp',
            // The values in effect after this follow-up, picked again or not.
            response: state.customerResponse || undefined,
            remarks: state.remarks || undefined,
            previous,
            next,
            retained: previous !== '' && previous === next,
        });
    }

    return events.reverse();
}
