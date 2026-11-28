import { z } from 'zod';
import { ENV } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { prisma } from '../../config/prisma.js';
import { secretBox } from '../../services/secretBox.js';

/**
 * Outbound Email settings (Admin › Email › Outbound Email; docs/system-design.md › Email): one OutboundEmailSetting
 * row. Two ways to send:
 *   gmail  Gmail API as `senderEmail`, with the Google Workspace service account key already uploaded on Admin › API
 *          Integrations (domain-wide delegation, scope gmail.send). No credential is stored or shown here.
 *   smtp   the server's SMTP_* environment settings (MAIL_ENABLED + SMTP_HOST), as before.
 * No row = the SMTP environment settings alone (how the CRM sent mail before this page existed).
 *
 * Every process (API, worker) keeps a snapshot, refreshed at most every 30 s and right after a save in this process,
 * so `isMailConfigured()` stays synchronous for its callers.
 */

export const OUTBOUND_PROVIDERS = ['gmail', 'smtp'] as const;
export type OutboundProvider = (typeof OUTBOUND_PROVIDERS)[number];

export const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
export const DEFAULT_DAILY_LIMIT = 1500;
/** Google Workspace allows 2,000 messages per user per day. */
export const MAX_DAILY_LIMIT = 2000;
const SETTINGS_ID = 1;
const SNAPSHOT_TTL_MS = 30_000;

export interface OutboundSettings {
    provider: OutboundProvider;
    enabled: boolean;
    senderEmail: string | null;
    senderName: string | null;
    replyTo: string | null;
    dailyLimit: number;
    lastTestAt: Date | null;
    lastTestOk: boolean | null;
    lastTestMessage: string | null;
    updatedBy: string | null;
    updatedAt: Date | null;
    /** False while no row exists (the SMTP environment settings alone). */
    saved: boolean;
}

export interface GoogleKeyInfo {
    configured: boolean;
    clientEmail: string | null;
    clientId: string | null;
}

export interface MailConfig {
    settings: OutboundSettings;
    googleKey: GoogleKeyInfo;
}

export type MailReadiness =
    | { ready: true; provider: OutboundProvider; fromEmail: string; fromName: string | null }
    | { ready: false; provider: OutboundProvider; reason: string };

const LEGACY: OutboundSettings = Object.freeze({
    provider: 'smtp',
    enabled: true,
    senderEmail: null,
    senderName: null,
    replyTo: null,
    dailyLimit: DEFAULT_DAILY_LIMIT,
    lastTestAt: null,
    lastTestOk: null,
    lastTestMessage: null,
    updatedBy: null,
    updatedAt: null,
    saved: false,
}) as OutboundSettings;

const NO_KEY: GoogleKeyInfo = { configured: false, clientEmail: null, clientId: null };

/** `Name <address>` of the SMTP_FROM / MAIL_FROM setting, split. */
export function parseFromHeader(value: string): { name: string | null; email: string } {
    const match = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(value);
    if (match) return { name: match[1].trim() || null, email: match[2].trim() };
    return { name: null, email: value.trim() };
}

export const MAIL_OFF_REASONS = {
    switchedOff: 'Outgoing email is switched off on Admin › Email › Outbound Email.',
    noSender: 'No sender address is set on Admin › Email › Outbound Email.',
    noGoogleKey: 'No Google Workspace service account key is uploaded yet (Admin › API Integrations › Google Workspace).',
    noEncryptionKey: 'INTEGRATIONS_ENCRYPTION_KEY is not set on the server, so the Google key cannot be read.',
    smtpOff: 'SMTP is turned off on the server (MAIL_ENABLED is false or SMTP_HOST is empty).',
} as const;

/** Whether and how mail can be sent with this configuration. Pure. */
export function readinessOf(config: MailConfig, mail: Pick<typeof ENV.MAIL, 'ENABLED' | 'SMTP_HOST' | 'FROM'> = ENV.MAIL, encryptionReady = secretBox.ready()): MailReadiness {
    const { settings, googleKey } = config;
    if (settings.provider === 'gmail') {
        if (!settings.enabled) return { ready: false, provider: 'gmail', reason: MAIL_OFF_REASONS.switchedOff };
        if (!settings.senderEmail) return { ready: false, provider: 'gmail', reason: MAIL_OFF_REASONS.noSender };
        if (!encryptionReady) return { ready: false, provider: 'gmail', reason: MAIL_OFF_REASONS.noEncryptionKey };
        if (!googleKey.configured) return { ready: false, provider: 'gmail', reason: MAIL_OFF_REASONS.noGoogleKey };
        return { ready: true, provider: 'gmail', fromEmail: settings.senderEmail, fromName: settings.senderName };
    }
    if (settings.saved && !settings.enabled) return { ready: false, provider: 'smtp', reason: MAIL_OFF_REASONS.switchedOff };
    if (!mail.ENABLED || !mail.SMTP_HOST) return { ready: false, provider: 'smtp', reason: MAIL_OFF_REASONS.smtpOff };
    const envFrom = parseFromHeader(mail.FROM);
    return {
        ready: true,
        provider: 'smtp',
        fromEmail: settings.senderEmail ?? envFrom.email,
        fromName: settings.senderEmail ? settings.senderName : (settings.senderName ?? envFrom.name),
    };
}

type SettingsRow = Awaited<ReturnType<typeof prisma.outboundEmailSetting.findUnique>>;

function toSettings(row: SettingsRow): OutboundSettings {
    if (!row) return { ...LEGACY };
    return {
        provider: row.provider === 'smtp' ? 'smtp' : 'gmail',
        enabled: row.enabled,
        senderEmail: row.senderEmail,
        senderName: row.senderName,
        replyTo: row.replyTo,
        dailyLimit: row.dailyLimit,
        lastTestAt: row.lastTestAt,
        lastTestOk: row.lastTestOk,
        lastTestMessage: row.lastTestMessage,
        updatedBy: row.updatedBy,
        updatedAt: row.updatedAt,
        saved: true,
    };
}

/** The Google key's non-secret facts (never the key). Imported lazily: the calendar registry pulls in a lot. */
async function loadGoogleKey(): Promise<GoogleKeyInfo> {
    try {
        const { loadProviderAccess } = await import('../calendar-sync/providers/registry.js');
        const access = await loadProviderAccess('google');
        if (!access.creds || access.creds.kind !== 'google') return NO_KEY;
        return { configured: true, clientEmail: access.creds.key.clientEmail, clientId: access.creds.key.clientId };
    } catch (err) {
        logger.warn({ err: (err as Error).message }, 'Could not read the Google service account key for outbound email');
        return NO_KEY;
    }
}

let snapshot: { config: MailConfig; at: number } | null = null;
let loading: Promise<MailConfig> | null = null;

/** Reads the settings and the Google key's facts (fresh). */
export async function loadMailConfig(): Promise<MailConfig> {
    loading ??= (async () => {
        try {
            const [row, googleKey] = await Promise.all([prisma.outboundEmailSetting.findUnique({ where: { id: SETTINGS_ID } }), loadGoogleKey()]);
            const config = { settings: toSettings(row), googleKey };
            snapshot = { config, at: Date.now() };
            return config;
        } finally {
            loading = null;
        }
    })();
    return loading;
}

/** The snapshot, refreshed when older than 30 s. Falls back to the last snapshot (or the legacy settings) on a DB error. */
export async function getMailConfig(): Promise<MailConfig> {
    if (snapshot && Date.now() - snapshot.at < SNAPSHOT_TTL_MS) return snapshot.config;
    try {
        return await loadMailConfig();
    } catch (err) {
        logger.warn({ err: (err as Error).message }, 'Could not read the outbound email settings');
        return snapshot?.config ?? { settings: { ...LEGACY }, googleKey: NO_KEY };
    }
}

/** The last snapshot (synchronous callers); the legacy SMTP settings until the first load. */
export const currentMailConfig = (): MailConfig => snapshot?.config ?? { settings: { ...LEGACY }, googleKey: NO_KEY };

/** Drops the snapshot (a save in this process, tests). */
export function invalidateMailConfig(): void {
    snapshot = null;
}

/** Tests: use this configuration. */
export function setMailConfigForTests(config: MailConfig | null): void {
    snapshot = config ? { config, at: Number.MAX_SAFE_INTEGER / 2 } : null;
}

let timer: NodeJS.Timeout | undefined;

/** Loads the snapshot at start-up and keeps it fresh (API and worker processes). */
export function startMailConfigRefresh(): void {
    void getMailConfig();
    timer ??= setInterval(() => void getMailConfig(), SNAPSHOT_TTL_MS);
    timer.unref();
}

export function stopMailConfigRefresh(): void {
    if (timer) clearInterval(timer);
    timer = undefined;
}

// ── Saving ────────────────────────────────────────────────────────────────────────────────────────────────────

const optionalEmail = (label: string) =>
    z
        .union([z.string(), z.null()])
        .optional()
        .transform((v) => (typeof v === 'string' ? v.trim().toLowerCase() : v))
        .refine((v) => v === undefined || v === null || v === '' || z.email().safeParse(v).success, { message: `${label} must be a valid email address.` })
        .transform((v) => (v === '' ? null : v));

/** PUT /api/admin/email/outbound: any subset of the settings. */
export const outboundSettingsPatchSchema = z
    .object({
        provider: z.enum(OUTBOUND_PROVIDERS, { error: 'Send with must be Gmail API or SMTP.' }).optional(),
        enabled: z.boolean({ error: 'Sending must be on or off.' }).optional(),
        senderEmail: optionalEmail('Sender address'),
        senderName: z
            .union([z.string(), z.null()])
            .optional()
            .transform((v) => (typeof v === 'string' ? v.replace(/[\r\n"<>]/g, ' ').replace(/\s+/g, ' ').trim() || null : v))
            .refine((v) => !v || v.length <= 120, { message: 'Display name can be at most 120 characters.' }),
        replyTo: optionalEmail('Reply-to address'),
        dailyLimit: z.coerce
            .number({ error: 'Daily limit must be a number.' })
            .int('Daily limit must be a whole number.')
            .min(1, 'Daily limit must be at least 1.')
            .max(MAX_DAILY_LIMIT, `Daily limit can be at most ${MAX_DAILY_LIMIT} (the Google Workspace limit).`)
            .optional(),
    })
    .strict()
    .refine((body) => Object.keys(body).length > 0, { message: 'Nothing to update.' });

export type OutboundSettingsPatch = z.infer<typeof outboundSettingsPatchSchema>;

const legacySmtpOn = () => ENV.MAIL.ENABLED && Boolean(ENV.MAIL.SMTP_HOST);

/** How the settings row starts when it is first created: the way the server already sent (SMTP when its settings are on). */
export function firstSaveDefaults(smtpOn = legacySmtpOn()): { provider: OutboundProvider; enabled: boolean } {
    return { provider: smtpOn ? 'smtp' : 'gmail', enabled: smtpOn };
}

export const SETTINGS_FIELDS = ['provider', 'enabled', 'senderEmail', 'senderName', 'replyTo', 'dailyLimit'] as const;

/** Saves a patch (creating the row with the current values when it doesn't exist yet). Returns before / after. */
export async function saveOutboundSettings(patch: OutboundSettingsPatch, username: string): Promise<{ before: OutboundSettings; after: OutboundSettings }> {
    const before = toSettings(await prisma.outboundEmailSetting.findUnique({ where: { id: SETTINGS_ID } }));
    const data: Record<string, unknown> = {};
    for (const field of SETTINGS_FIELDS) if (patch[field] !== undefined) data[field] = patch[field];
    // Changing how or as whom mail is sent makes the last check stale.
    const resetsTest = ['provider', 'senderEmail'].some((f) => f in data && data[f] !== before[f as keyof OutboundSettings]);
    const row = await prisma.outboundEmailSetting.upsert({
        where: { id: SETTINGS_ID },
        create: {
            id: SETTINGS_ID,
            // First save: keep sending the way the server did (SMTP when its environment settings are on).
            ...(before.saved ? { provider: before.provider, enabled: before.enabled } : firstSaveDefaults()),
            dailyLimit: before.dailyLimit,
            ...data,
            updatedBy: username,
        },
        update: { ...data, ...(resetsTest ? { lastTestAt: null, lastTestOk: null, lastTestMessage: null } : {}), updatedBy: username },
    });
    invalidateMailConfig();
    return { before, after: toSettings(row) };
}

/** Records the outcome of Check connection / Send test email. */
export async function recordOutboundTest(ok: boolean, message: string, at = new Date()): Promise<void> {
    await prisma.outboundEmailSetting
        .upsert({
            where: { id: SETTINGS_ID },
            // No row yet: create it as the first Save would (SMTP and on while the server's SMTP settings are on), so a
            // check on a never-saved page doesn't switch working SMTP mail off.
            create: { id: SETTINGS_ID, ...firstSaveDefaults(), lastTestAt: at, lastTestOk: ok, lastTestMessage: message.slice(0, 300) },
            update: { lastTestAt: at, lastTestOk: ok, lastTestMessage: message.slice(0, 300) },
        })
        .catch((err: Error) => logger.warn({ err: err.message }, 'Could not record the outbound email check'));
    invalidateMailConfig();
}
