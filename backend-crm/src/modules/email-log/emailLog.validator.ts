import { z } from 'zod';
import { EMAIL_LOG_MODULES, LIST_DEFAULT_LIMIT, LIST_MAX_LIMIT, MAILBOX_MODES } from './emailLog.constants.js';

/** GET /api/email-logs */
export const recordEmailsQuerySchema = z.object({
    module: z.enum(EMAIL_LOG_MODULES, { error: `module must be one of: ${EMAIL_LOG_MODULES.join(', ')}.` }),
    recordId: z.string().trim().min(1, { message: 'recordId is required.' }).max(50),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    limit: z.coerce.number().int().min(1).max(LIST_MAX_LIMIT).default(LIST_DEFAULT_LIMIT),
});

/** PUT /api/admin/email-logging/people/:username */
export const personModeBodySchema = z
    .object({ mode: z.enum(MAILBOX_MODES, { error: "mode must be 'on', 'off' or null (company default)." }).nullable() })
    .strict();

export const usernameParamSchema = z.object({ username: z.string().trim().min(1).max(50) });
