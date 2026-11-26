import { createHash } from 'node:crypto';
import {
    EMAIL_MAX,
    NAME_MAX,
    OPPORTUNITY_LINKS_PER_CONTACT,
    PRIVATE_MARKERS,
    RECIPIENTS_JSON_MAX,
    RECIPIENTS_KEPT,
    SNIPPET_MAX,
    SUBJECT_MAX,
    type EmailDirection,
    type EmailLogModule,
} from './emailLog.constants.js';
import type { MailAddress, MailMessage } from './providers/types.js';

/**
 * Which mail is logged and on which records (design note EL6–EL8). Pure: no database, no provider. The engine
 * (emailLog.ingest.ts) feeds it normalised messages and a lookup of CRM addresses.
 *
 *   1. Drafts, spam / trash / chats (`skip`), and messages marked private (Gmail user label / Outlook category
 *      "Private", "Personal" or "No CRM"; Outlook sensitivity personal / private / confidential) are never logged.
 *   2. Only from, to and cc count (Bcc is never read). Every address on a company domain → internal-only, skipped.
 *   3. At least one external address must be a live CRM contact / lead email.
 *   4. Automated mail (List-Unsubscribe, Auto-Submitted ≠ no, Precedence bulk / list / junk) only when the sender itself
 *      is a matched contact / lead address.
 *   5. Links: each matched contact and lead, and the matched contacts' opportunities (≤ 10 per contact).
 */

const EMAIL_SHAPE = /^[^@\s<>(),;:"[\]]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;

/** Lower-cased, trimmed address without angle brackets / `mailto:`; null when it isn't an address. */
export function normalizeEmail(value: string | null | undefined): string | null {
    if (typeof value !== 'string') return null;
    const text = value
        .trim()
        .replace(/^mailto:/i, '')
        .replace(/^<|>$/g, '')
        .trim()
        .toLowerCase();
    if (!text || text.length > EMAIL_MAX || !EMAIL_SHAPE.test(text)) return null;
    return text;
}

export const domainOf = (email: string): string => email.slice(email.lastIndexOf('@') + 1);

const cleanName = (name: string | null | undefined): string | undefined => {
    const text = (name ?? '')
        .trim()
        .replace(/^"|"$/g, '')
        .replace(/\\(.)/g, '$1')
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, NAME_MAX);
    return text || undefined;
};

/** One address with an optional display name; null when the address is unreadable. */
export function mailAddress(email: string | null | undefined, name?: string | null): MailAddress | null {
    const address = normalizeEmail(email);
    if (!address) return null;
    const display = cleanName(name);
    return display && display.toLowerCase() !== address ? { email: address, name: display } : { email: address };
}

/** Splits an address header (`"Doe, Jane" <jane@x.com>, bob@y.com`) at commas outside quotes / angle brackets. */
function splitAddresses(header: string): string[] {
    const parts: string[] = [];
    let current = '';
    let quoted = false;
    let angle = 0;
    for (let i = 0; i < header.length; i += 1) {
        const ch = header[i];
        if (ch === '\\' && quoted && i + 1 < header.length) {
            current += ch + header[i + 1];
            i += 1;
            continue;
        }
        if (ch === '"') quoted = !quoted;
        else if (!quoted && ch === '<') angle += 1;
        else if (!quoted && ch === '>') angle = Math.max(0, angle - 1);
        if ((ch === ',' || ch === ';') && !quoted && angle === 0) {
            parts.push(current);
            current = '';
            continue;
        }
        current += ch;
    }
    parts.push(current);
    return parts.map((p) => p.trim()).filter(Boolean);
}

/** An RFC 5322 address-list header (From / To / Cc) as addresses; unreadable entries and groups' labels are dropped. */
export function parseAddressList(header: string | null | undefined): MailAddress[] {
    if (!header) return [];
    const out: MailAddress[] = [];
    // Group syntax "Team: a@x.com, b@y.com;" → drop the label.
    const text = header.replace(/(^|,)\s*[^,:<>"@]+:\s*/g, '$1').replace(/;\s*$/, '');
    for (const part of splitAddresses(text)) {
        const angle = /^(.*)<([^<>]+)>\s*(?:\([^)]*\))?$/.exec(part);
        const address = angle ? mailAddress(angle[2], angle[1]) : mailAddress(part.replace(/\s*\([^)]*\)\s*$/, ''));
        if (address) out.push(address);
    }
    return out;
}

/** Distinct addresses of from, to and cc (never bcc). */
export function participantsOf(msg: Pick<MailMessage, 'from' | 'to' | 'cc'>): string[] {
    const all = [msg.from, ...msg.to, ...msg.cc].filter((a): a is MailAddress => Boolean(a)).map((a) => a.email);
    return [...new Set(all)];
}

const isCompany = (email: string, domains: ReadonlySet<string>) => domains.has(domainOf(email));

/** Addresses outside the company domains. */
export function externalAddresses(msg: Pick<MailMessage, 'from' | 'to' | 'cc'>, companyDomains: readonly string[]): string[] {
    const domains = new Set(companyDomains.map((d) => d.toLowerCase()));
    return participantsOf(msg).filter((e) => !isCompany(e, domains));
}

/** out = sent from a company domain; in = from outside (or no readable sender). */
export function directionOf(from: MailAddress | null, companyDomains: readonly string[]): EmailDirection {
    if (!from) return 'in';
    return isCompany(from.email, new Set(companyDomains.map((d) => d.toLowerCase()))) ? 'out' : 'in';
}

/** Header names (lower-cased) → values: does the message say it was sent by a machine or a list? */
export function isAutomatedHeaders(headers: Readonly<Record<string, string | undefined>>): boolean {
    const get = (name: string) => (headers[name] ?? '').trim().toLowerCase();
    if (get('list-unsubscribe')) return true;
    if (get('list-id')) return true;
    const auto = get('auto-submitted');
    if (auto && auto !== 'no') return true;
    if (['bulk', 'list', 'junk', 'auto_reply'].includes(get('precedence'))) return true;
    if (get('x-auto-response-suppress') && /\b(all|oof|autoreply)\b/.test(get('x-auto-response-suppress')) && get('x-autoreply')) return true;
    return false;
}

/** A Gmail user label / Outlook category that keeps a message out of the CRM ("Private", "Personal", "No CRM"). */
export function hasPrivateMarker(names: readonly string[]): boolean {
    return names.some((n) => PRIVATE_MARKERS.includes(n.trim().toLowerCase().replace(/\s+/g, ' ')));
}

const ENTITIES: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

/** Plain text for display: entities decoded, tags and control characters dropped, whitespace collapsed, ≤ 500. */
export function cleanSnippet(text: string | null | undefined): string | null {
    if (!text) return null;
    const decoded = text
        .replace(/<[^>]*>/g, ' ')
        .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+|#39);/gi, (whole, code: string) => {
            const lower = code.toLowerCase();
            if (ENTITIES[lower]) return ENTITIES[lower];
            const n = lower.startsWith('#x') ? parseInt(lower.slice(2), 16) : lower.startsWith('#') ? parseInt(lower.slice(1), 10) : NaN;
            return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : whole;
        })
        .replace(/[\u0000-\u0008\u000b-\u001f\u007f\u200b-\u200f\u2028\u2029\ufeff]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (!decoded) return null;
    return decoded.length > SNIPPET_MAX ? `${decoded.slice(0, SNIPPET_MAX - 1).trimEnd()}…` : decoded;
}

/** Subject trimmed to the column (control characters dropped); '(no subject)' when empty. */
export function cleanSubject(text: string | null | undefined): string {
    const subject = (text ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!subject) return '(no subject)';
    return subject.length > SUBJECT_MAX ? `${subject.slice(0, SUBJECT_MAX - 1).trimEnd()}…` : subject;
}

/** At most 25 recipients whose JSON fits NVARCHAR(4000); how many were left out. */
export function boundRecipients(list: readonly MailAddress[]): { json: string; kept: MailAddress[]; more: number } {
    const kept = list.slice(0, RECIPIENTS_KEPT).map((a) => (a.name ? { email: a.email, name: a.name } : { email: a.email }));
    let json = JSON.stringify(kept);
    while (json.length > RECIPIENTS_JSON_MAX && kept.length > 0) {
        kept.pop();
        json = JSON.stringify(kept);
    }
    return { json, kept, more: list.length - kept.length };
}

/** sha256 (hex) of the Message-ID header as sent (trimmed); null when there is none. */
export function messageIdHash(messageId: string | null | undefined): string | null {
    const id = (messageId ?? '').trim();
    if (!id || id.length > 2000) return null;
    return createHash('sha256').update(id).digest('hex');
}

// ── Matching ──────────────────────────────────────────────────────────────────────────────────────────────────

/** Live CRM records holding an address (lower-cased keys). */
export interface AddressMatch {
    contacts: string[];
    leads: string[];
}
export type AddressLookup = ReadonlyMap<string, AddressMatch>;
/** Contact id → its live opportunities, most recently updated first. */
export type OpportunityLookup = ReadonlyMap<string, readonly string[]>;

export interface LinkPlan {
    module: EmailLogModule;
    recordId: string;
    matchedEmail: string;
}

export type SkipReason = 'draft' | 'excluded_folder' | 'private' | 'no_participants' | 'internal' | 'no_match' | 'automated';

export type MessagePlan = { action: 'skip'; reason: SkipReason } | { action: 'log'; links: LinkPlan[]; senderMatched: boolean; needsAutomationCheck: boolean };

/** Before any lookup: drafts, excluded folders, private, internal-only. Returns null when the message stays a candidate. */
export function preFilter(msg: MailMessage, companyDomains: readonly string[]): SkipReason | null {
    if (msg.isDraft) return 'draft';
    if (msg.excluded) return 'excluded_folder';
    if (msg.privateMarked) return 'private';
    const all = participantsOf(msg);
    if (all.length === 0) return 'no_participants';
    if (externalAddresses(msg, companyDomains).length === 0) return 'internal';
    return null;
}

/**
 * The plan for one candidate message. `automated` = what the headers say (null = not read yet: Graph reads them only
 * after a match, `needsAutomationCheck` tells the engine to read and call again).
 */
export function planMessage(msg: MailMessage, companyDomains: readonly string[], addresses: AddressLookup, opportunities: OpportunityLookup): MessagePlan {
    const pre = preFilter(msg, companyDomains);
    if (pre) return { action: 'skip', reason: pre };
    const external = externalAddresses(msg, companyDomains);
    const links: LinkPlan[] = [];
    const seen = new Set<string>();
    const add = (module: EmailLogModule, recordId: string, matchedEmail: string) => {
        const key = `${module}:${recordId}`;
        if (seen.has(key)) return;
        seen.add(key);
        links.push({ module, recordId, matchedEmail });
    };
    for (const email of external) {
        const match = addresses.get(email);
        if (!match) continue;
        for (const id of match.contacts) add('contacts', id, email);
        for (const id of match.leads) add('leads', id, email);
    }
    if (links.length === 0) return { action: 'skip', reason: 'no_match' };
    for (const link of [...links]) {
        if (link.module !== 'contacts') continue;
        for (const oppId of (opportunities.get(link.recordId) ?? []).slice(0, OPPORTUNITY_LINKS_PER_CONTACT)) add('opportunities', oppId, link.matchedEmail);
    }
    const sender = msg.from?.email ?? '';
    const senderMatched = Boolean(sender && addresses.has(sender) && external.includes(sender));
    if (msg.automated === true && !senderMatched) return { action: 'skip', reason: 'automated' };
    return { action: 'log', links, senderMatched, needsAutomationCheck: msg.automated === null && !senderMatched };
}
