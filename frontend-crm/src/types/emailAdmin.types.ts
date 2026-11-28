/** Admin › Email (backend modules/email/email.admin.service.ts; docs/api-plan.md › Admin email). */

export type OutboundProvider = 'gmail' | 'smtp';

export interface OutboundEmailDto {
    provider: OutboundProvider;
    enabled: boolean;
    senderEmail: string | null;
    senderName: string | null;
    replyTo: string | null;
    dailyLimit: number;
    maxDailyLimit: number;
    updatedBy: string | null;
    updatedAt: string | null;
    status: {
        ready: boolean;
        reason: string | null;
        lastTestAt: string | null;
        lastTestOk: boolean | null;
        lastTestMessage: string | null;
        sentToday: number;
        queued: number;
        failed: number;
    };
    gmail: { keyConfigured: boolean; serviceAccountEmail: string | null; clientId: string | null; scope: string };
    smtp: { configured: boolean; host: string | null; port: number; from: string };
}

export interface SaveOutboundEmailPayload {
    provider?: OutboundProvider;
    enabled?: boolean;
    senderEmail?: string | null;
    senderName?: string | null;
    replyTo?: string | null;
    dailyLimit?: number;
}

export interface OutboundCheckResult {
    ok: boolean;
    message: string;
    outbound: OutboundEmailDto;
}

export type EmailTemplateKey = 'user_invite' | 'password_reset' | 'password_reset_self' | 'account_locked' | 'morning_summary';

export interface EmailTemplateContent {
    subject: string;
    heading: string;
    body: string;
    buttonLabel: string | null;
    afterButton: string | null;
    footer: string | null;
}

export interface EmailTemplateDto {
    key: EmailTemplateKey;
    name: string;
    description: string;
    status: 'active' | 'reserved';
    hasLink: boolean;
    mergeFields: { key: string; label: string; sample: string }[];
    content: EmailTemplateContent;
    defaults: EmailTemplateContent;
    customised: boolean;
    updatedBy: string | null;
    updatedAt: string | null;
}

export interface RenderedEmailPreview {
    subject: string;
    html: string;
    text: string;
}

export type EmailLogStatus = 'queued' | 'sending' | 'sent' | 'failed' | 'skipped';

export interface EmailLogDto {
    id: string;
    kind: string;
    kindLabel: string;
    templateKey: string | null;
    toEmail: string;
    toUsername: string | null;
    fromEmail: string | null;
    subject: string;
    status: EmailLogStatus;
    provider: string | null;
    error: string | null;
    attempts: number;
    maxAttempts: number;
    createdAt: string;
    sentAt: string | null;
    lastAttemptAt: string | null;
    nextAttemptAt: string | null;
    retry: 'send' | 'resend_link' | null;
}

export interface EmailQueueQuery {
    status?: EmailLogStatus;
    kind?: string;
    q?: string;
    page: number;
    limit: number;
}

export interface EmailQueueResult {
    data: EmailLogDto[];
    total: number;
    page: number;
    limit: number;
    summary: {
        counts: Record<EmailLogStatus, number>;
        sentToday: number;
        dailyLimit: number;
        kinds: { value: string; label: string }[];
    };
}

export interface EmailRetryResult {
    ok: boolean;
    message: string;
    email: EmailLogDto | null;
}
