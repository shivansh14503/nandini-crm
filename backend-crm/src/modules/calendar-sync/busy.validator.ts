import { z } from 'zod';
import { requiredInstant } from '../../validators/common.js';
import { BUSY_MAX_RANGE_DAYS, BUSY_MAX_USERS, BUSY_SUGGEST_MAX_MINUTES, BUSY_SUGGEST_MIN_MINUTES } from './busy.constants.js';

/** `GET /api/activities/busy` query (spec §12.1). Problems answer 400 VALIDATION_ERROR. */

const DAY_MS = 24 * 60 * 60 * 1000;
const USERNAME_MAX = 50;

/** `users`: a csv (or repeated param) of 1–20 usernames, trimmed, de-duplicated case-insensitively, order kept. */
const usersSchema = z
    .union([z.string(), z.array(z.string())], { error: 'users is required.' })
    .transform((value) => (Array.isArray(value) ? value.join(',') : value).split(',').map((item) => item.trim()).filter(Boolean))
    .transform((names) => {
        const seen = new Set<string>();
        return names.filter((name) => {
            const key = name.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    })
    .pipe(
        z
            .array(z.string().max(USERNAME_MAX, { message: `A username has at most ${USERNAME_MAX} characters.` }))
            .min(1, { message: 'Pick at least one person.' })
            .max(BUSY_MAX_USERS, { message: `Pick at most ${BUSY_MAX_USERS} people.` }),
    );

export const busyQuerySchema = z
    .object({
        users: usersSchema,
        /** Window start (inclusive), an instant with a zone. */
        from: requiredInstant('from'),
        /** Window end (exclusive). */
        to: requiredInstant('to'),
        /** The activity being edited: its own block doesn't count (it is moving). */
        exclude: z.string().trim().max(50).optional().transform((value) => value || undefined),
        /** Ask for the first common free slot of this many minutes. */
        suggest: z.preprocess(
            (value) => (value === null || value === undefined || (typeof value === 'string' && value.trim() === '') ? undefined : value),
            z.coerce
            .number({ error: 'suggest must be a number of minutes.' })
            .int({ message: 'suggest must be a whole number of minutes.' })
            .min(BUSY_SUGGEST_MIN_MINUTES, { message: `suggest must be ${BUSY_SUGGEST_MIN_MINUTES}–${BUSY_SUGGEST_MAX_MINUTES} minutes.` })
            .max(BUSY_SUGGEST_MAX_MINUTES, { message: `suggest must be ${BUSY_SUGGEST_MIN_MINUTES}–${BUSY_SUGGEST_MAX_MINUTES} minutes.` })
            .optional(),
        ),
    })
    .superRefine((query, ctx) => {
        const from = Date.parse(query.from);
        const to = Date.parse(query.to);
        if (to <= from) ctx.addIssue({ code: 'custom', path: ['to'], message: 'to must be after from.' });
        else if (to - from > BUSY_MAX_RANGE_DAYS * DAY_MS) {
            ctx.addIssue({ code: 'custom', path: ['to'], message: `Pick a range of at most ${BUSY_MAX_RANGE_DAYS} days.` });
        }
    });

export type BusyQuery = z.infer<typeof busyQuerySchema>;
