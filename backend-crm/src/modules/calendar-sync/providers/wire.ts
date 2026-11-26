import { z } from 'zod';

/**
 * What Google Calendar v3 and Microsoft Graph v1.0 answer for one event (Calendar Phase 2 spec §7.4, §7.5), parsed
 * with zod by `providerFetch` (unknown fields ignored; everything optional the providers may leave out). Documented
 * shapes, not recorded ones: the sandbox can't reach either provider (§18, §21.2).
 */

const text = z.string().nullish();
const flag = z.boolean().nullish();

const googleTime = z.object({ date: text, dateTime: text, timeZone: text });

export const googleEventSchema = z.object({
    id: z.string(),
    iCalUID: text,
    etag: text,
    updated: text,
    /** confirmed | tentative | cancelled */
    status: text,
    htmlLink: text,
    summary: text,
    description: text,
    location: text,
    start: googleTime.nullish(),
    end: googleTime.nullish(),
    organizer: z.object({ email: text, displayName: text, self: flag }).nullish(),
    attendees: z
        .array(
            z.object({
                email: text,
                displayName: text,
                responseStatus: text,
                optional: flag,
                resource: flag,
                organizer: flag,
                self: flag,
            }),
        )
        .nullish(),
    reminders: z.object({ useDefault: flag, overrides: z.array(z.object({ method: text, minutes: z.number().nullish() })).nullish() }).nullish(),
    extendedProperties: z.object({ private: z.record(z.string(), z.string()).nullish() }).nullish(),
    recurrence: z.array(z.string()).nullish(),
    recurringEventId: text,
    eventType: text,
    visibility: text,
});
export type GoogleEventWire = z.infer<typeof googleEventSchema>;

const graphTime = z.object({ dateTime: z.string(), timeZone: text });

export const graphEventSchema = z.object({
    id: z.string(),
    iCalUId: text,
    '@odata.etag': text,
    changeKey: text,
    lastModifiedDateTime: text,
    isCancelled: flag,
    isOrganizer: flag,
    isAllDay: flag,
    /** singleInstance | occurrence | exception | seriesMaster */
    type: text,
    sensitivity: text,
    webLink: text,
    subject: text,
    body: z.object({ contentType: text, content: text }).nullish(),
    start: graphTime.nullish(),
    end: graphTime.nullish(),
    originalStartTimeZone: text,
    originalEndTimeZone: text,
    location: z.object({ displayName: text }).nullish(),
    organizer: z.object({ emailAddress: z.object({ address: text, name: text }).nullish() }).nullish(),
    attendees: z
        .array(
            z.object({
                /** required | optional | resource */
                type: text,
                status: z.object({ response: text, time: text }).nullish(),
                emailAddress: z.object({ address: text, name: text }).nullish(),
            }),
        )
        .nullish(),
    isReminderOn: flag,
    reminderMinutesBeforeStart: z.number().nullish(),
    singleValueExtendedProperties: z.array(z.object({ id: z.string(), value: text })).nullish(),
});
export type GraphEventWire = z.infer<typeof graphEventSchema>;
