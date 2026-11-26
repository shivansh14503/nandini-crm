'use client';

import { Box, Typography } from '@mui/material';
import SyncOutlinedIcon from '@mui/icons-material/SyncOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import type { ActivityCalendarState } from '@/types/activity.types';
import { formatBusinessInstant } from './activityTime';

/**
 * What came back from the owner's company calendar (Calendar Phase 2, P2-5), as quiet lines under the activity's time:
 * - "Updated from Google Calendar / Outlook <when>": the last change the pull applied.
 * - The event became a repeating series there (D19): the CRM keeps its own fields and stops syncing it.
 * - Longer than 31 days there (D20): the CRM keeps its own times.
 * - Deleted there, for an activity that keeps its status (Completed, or a lead / opportunity follow-up).
 * - A follow-up moved to an all-day slot there: the CRM keeps its time of day (§11.5); the note says where it went.
 * Fixed sentences only: never provider error text. Shows nothing when there is nothing to say.
 */

/** Must match backend calendar-sync/sync.constants.ts TOO_LONG_CODE / FOLLOW_UP_TIME_KEPT_PREFIX. */
const TOO_LONG_CODE = 'too_long';
const FOLLOW_UP_TIME_KEPT_PREFIX = 'Follow-ups keep a time';

const PROVIDER_LABELS: Record<string, string> = { google: 'Google Calendar', microsoft: 'Outlook', fake: 'the test calendar' };

export function calendarNotesOf(calendar: ActivityCalendarState | null | undefined, timeZone: string): { updated: string | null; notes: string[] } {
    if (!calendar) return { updated: null, notes: [] };
    const provider = PROVIDER_LABELS[calendar.provider] ?? 'the calendar';
    const notes: string[] = [];
    if (calendar.state === 'unsupported') notes.push(`Made a repeating event in ${provider}, so it no longer syncs. The CRM keeps its own details.`);
    else if (calendar.state === 'removed_remote') notes.push(`Deleted in ${provider}. It stays here as it is.`);
    if (calendar.errorCode === TOO_LONG_CODE) notes.push(`Longer than 31 days in ${provider}, so the CRM keeps its own times.`);
    if (calendar.warning?.startsWith(FOLLOW_UP_TIME_KEPT_PREFIX)) notes.push(calendar.warning);
    const at = formatBusinessInstant(calendar.externalUpdatedAt, timeZone);
    return { updated: at ? `Updated from ${provider} ${at}` : null, notes };
}

export function ActivityCalendarNotes({ calendar, timeZone }: { calendar: ActivityCalendarState | null | undefined; timeZone: string }) {
    const { updated, notes } = calendarNotesOf(calendar, timeZone);
    if (!updated && notes.length === 0) return null;
    const lineSx = { display: 'flex', alignItems: 'flex-start', gap: 0.6, minWidth: 0 } as const;
    const textSx = { fontSize: '0.76rem', color: 'var(--mui-palette-text-secondary)', overflowWrap: 'anywhere', minWidth: 0 } as const;
    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mt: 1 }}>
            {updated && (
                <Box sx={lineSx}>
                    <SyncOutlinedIcon sx={{ fontSize: 15, mt: '1px', flexShrink: 0, color: 'var(--crm-text-blue-600)' }} />
                    <Typography sx={textSx}>{updated}</Typography>
                </Box>
            )}
            {notes.map((note) => (
                <Box key={note} sx={lineSx}>
                    <InfoOutlinedIcon sx={{ fontSize: 15, mt: '1px', flexShrink: 0, color: 'var(--mui-palette-warning-main)' }} />
                    <Typography sx={textSx}>{note}</Typography>
                </Box>
            ))}
        </Box>
    );
}
