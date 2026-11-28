import { logger } from '../../config/logger.js';
import { prisma } from '../../config/prisma.js';
import { queueMail, sendMail, type MailResult } from '../../services/mail.service.js';
import type { RenderedEmail } from '../notifications/morningSummary.render.js';
import { APP_NAME, EMAIL_TEMPLATES, renderEmailTemplate, type EmailTemplateKey, type TemplateContent } from './email.templates.js';

/**
 * Template wording (EmailTemplate rows over the built-in defaults) and the templated send. Every process keeps the
 * rows for 60 s (dropped at once in the process that saves). A database error falls back to the defaults, so a system
 * email is never lost to a template read.
 */

const CACHE_TTL_MS = 60_000;
let cache: { rows: Map<string, TemplateContent>; at: number } | null = null;

export function invalidateTemplateCache(): void {
    cache = null;
}

async function loadRows(): Promise<Map<string, TemplateContent>> {
    if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.rows;
    const rows = await prisma.emailTemplate.findMany({ select: { key: true, subject: true, heading: true, body: true, buttonLabel: true, afterButton: true, footer: true } });
    const map = new Map(rows.map((r) => [r.key, { subject: r.subject, heading: r.heading, body: r.body, buttonLabel: r.buttonLabel, afterButton: r.afterButton, footer: r.footer }]));
    cache = { rows: map, at: Date.now() };
    return map;
}

/** The admin's wording of a template, or null for the built-in one. */
export async function loadTemplateOverride(key: EmailTemplateKey): Promise<TemplateContent | null> {
    try {
        return (await loadRows()).get(key) ?? null;
    } catch (err) {
        logger.warn({ err: (err as Error).message, template: key }, 'Email template could not be read; using the built-in wording');
        return null;
    }
}

/** The wording in use: the admin's, else the default. */
export async function templateContent(key: EmailTemplateKey): Promise<TemplateContent> {
    return (await loadTemplateOverride(key)) ?? { ...EMAIL_TEMPLATES[key].defaults };
}

/** `firstName` from the first name, else the full name's first word, else the username. */
export function personVars(person: { firstName?: string | null; fullName?: string | null; username?: string | null }): Record<string, string> {
    const fullName = person.fullName?.trim() ?? '';
    const firstName = person.firstName?.trim() || fullName.split(/\s+/)[0] || person.username?.trim() || '';
    return { appName: APP_NAME, firstName, fullName: fullName || firstName, username: person.username?.trim() ?? '' };
}

/** Renders a template with these values (the admin's wording or the default). */
export async function renderTemplate(key: EmailTemplateKey, vars: Readonly<Record<string, string | null | undefined>>, content?: TemplateContent | null): Promise<RenderedEmail> {
    const def = EMAIL_TEMPLATES[key];
    return renderEmailTemplate(def, content ?? (await templateContent(key)), { appName: APP_NAME, ...vars });
}

export interface TemplatedMailInput {
    to: string;
    toUsername?: string | null;
    vars: Readonly<Record<string, string | null | undefined>>;
    /** EmailLog.kind; default the template key. */
    kind?: string;
    dedupeKey?: string;
    retainBody?: boolean;
    essential?: boolean;
    /** queue = sent by the background worker (bulk / scheduled emails); now = sent in this request. */
    deliver?: 'now' | 'queue';
}

/** Renders a template and sends it through the mail service (logged, retried, daily limit). Never throws for a send. */
export async function sendTemplatedMail(key: EmailTemplateKey, input: TemplatedMailInput): Promise<MailResult> {
    const email = await renderTemplate(key, input.vars);
    const mail = {
        to: input.to,
        toUsername: input.toUsername ?? null,
        subject: email.subject,
        html: email.html,
        text: email.text,
        kind: input.kind ?? key,
        templateKey: key,
        ...(input.dedupeKey ? { dedupeKey: input.dedupeKey } : {}),
        ...(input.retainBody !== undefined ? { retainBody: input.retainBody } : {}),
        ...(input.essential !== undefined ? { essential: input.essential } : {}),
    };
    return input.deliver === 'queue' ? queueMail(mail) : sendMail(mail);
}
