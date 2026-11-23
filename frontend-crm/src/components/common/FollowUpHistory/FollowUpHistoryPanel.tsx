'use client';

import React, { useMemo } from 'react';
import { Box, Skeleton, Tooltip, Typography } from '@mui/material';
import { RatingBadge } from '@/components/common/RatingBadge';
import EventRepeatOutlinedIcon from '@mui/icons-material/EventRepeatOutlined';
import { useEntityAuditEntries, type AuditEntityType } from '@/hooks/queries/useAuditLogs';
import { glassSurfaceSx, GLASS_SHADOW, GLASS_RADIUS, FLOAT_INSET } from '@/theme/glass';
import { DOCK } from '@/components/common/Drawer/RelatedModulesSidebar';
import { buildFollowUpEvents, formatEventTime, type FollowUpEvent } from './followUpEvents';

/** Width of the follow-up panel on wide screens (px). */
export const FOLLOW_UP_PANEL_WIDTH = 320;

export interface FollowUpHistoryPanelProps {
    entityType: Extract<AuditEntityType, 'leads' | 'opportunities'>;
    recordId: string;
    /** Singular record name for the "created" / "converted" items, e.g. `Lead`. */
    recordLabel: string;
}

/**
 * The record's follow-up history: always open. On wide screens it sits beside the form, as tall as the form, and
 * sticks below the navbar while the page scrolls; on narrower ones it is a plain card under the form.
 */
export function FollowUpHistoryPanel({ entityType, recordId, recordLabel }: FollowUpHistoryPanelProps) {
    const { data: entries, isLoading, isError } = useEntityAuditEntries(entityType, recordId || undefined);
    const events = useMemo(() => buildFollowUpEvents(entries ?? []), [entries]);

    return (
        <Box
            component="aside"
            aria-label="Follow-up history"
            sx={{
                ...glassSurfaceSx,
                position: { xs: 'static', lg: 'sticky' },
                top: { lg: DOCK.top },
                width: '100%',
                // Wide screens: the form's height, but never taller than the space below the navbar.
                height: { lg: `min(100%, calc(100vh - ${DOCK.top + FLOAT_INSET}px))` },
                maxHeight: { xs: 480, lg: 'none' },
                mt: { xs: 2, lg: 0 },
                display: 'flex',
                flexDirection: 'column',
                boxSizing: 'border-box',
                overflow: 'hidden',
                borderRadius: GLASS_RADIUS,
                boxShadow: GLASS_SHADOW,
            }}
        >
            <Box
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 1,
                    flexShrink: 0,
                    px: 2.25,
                    py: 1.75,
                    // Same height as that tab bar, so the two bottom borders line up.
                    minHeight: 54,
                    boxSizing: 'border-box',
                    // Same band as the form's tab bar beside it (CommonFormLayout).
                    backgroundColor: 'var(--mui-palette-background-subtle)',
                    borderBottom: '1px solid var(--mui-palette-border-main)',
                }}
            >
                <Typography component="h2" sx={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--crm-slate-900)' }}>
                    Follow-up history
                </Typography>
                {!isLoading && !isError && (
                    <Typography sx={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--mui-palette-text-muted)' }}>
                        {events.length} {events.length === 1 ? 'event' : 'events'}
                    </Typography>
                )}
            </Box>

            <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: 2.25, py: 1.75 }}>
                {isLoading ? (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                        {[0, 1, 2].map((i) => (
                            <Skeleton key={i} variant="rounded" height={64} sx={{ borderRadius: '10px' }} />
                        ))}
                    </Box>
                ) : isError || events.length === 0 ? (
                    <Box sx={{ py: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.75, textAlign: 'center', color: 'var(--mui-palette-text-muted)' }}>
                        <EventRepeatOutlinedIcon sx={{ fontSize: 30 }} />
                        <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--mui-palette-text-secondary)' }}>
                            {isError ? 'The follow-up history could not be loaded.' : 'No follow-ups yet'}
                        </Typography>
                        <Typography sx={{ fontSize: '0.72rem' }}>
                            {isError ? 'Please try again in a moment.' : 'Follow-ups recorded on this record will appear here.'}
                        </Typography>
                    </Box>
                ) : (
                    <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0 }}>
                        {events.map((event, index) => (
                            <TimelineItem key={event.id} event={event} recordLabel={recordLabel} latest={index === 0} last={index === events.length - 1} />
                        ))}
                    </Box>
                )}
            </Box>
        </Box>
    );
}

/** `Rating Warm → Hot` (or just `Rating Hot` when it stayed or is the first); the reason on hover. */
function RatingChange({ from, to, reason }: { from: string; to: string; reason?: string }) {
    const pill = (rating: string) => <RatingBadge rating={rating} variant="small" />;
    return (
        <Tooltip title={reason ?? ''} arrow disableInteractive>
            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontSize: '0.7rem', color: 'var(--mui-palette-text-secondary)' }}>
                Rating
                {from && from !== to && (
                    <>
                        {pill(from)}
                        <span aria-hidden>→</span>
                    </>
                )}
                {pill(to)}
            </Box>
        </Tooltip>
    );
}

function TimelineItem({ event, recordLabel, latest, last }: { event: FollowUpEvent; recordLabel: string; latest: boolean; last: boolean }) {
    const fallbackTitle =
        event.kind === 'created'
            ? `${recordLabel} created`
            : event.kind === 'converted'
              ? `${recordLabel} converted`
              : event.kind === 'rated'
                ? 'Rating changed'
                : 'Follow-up recorded';
    // The customer response is the title; creation is still marked on the timestamp line.
    const title = event.kind === 'converted' || event.kind === 'rated' ? fallbackTitle : event.response || fallbackTitle;
    const markCreated = event.kind === 'created' && Boolean(event.response);
    const showSlot = event.kind !== 'converted' && event.kind !== 'rated' && !event.closedAs;

    return (
        <Box component="li" sx={{ position: 'relative', pl: 2.5, pb: last ? 0 : 2.25 }}>
            {/* Rail: dot plus the line down to the next item. */}
            <Box
                aria-hidden
                sx={{
                    position: 'absolute',
                    left: 2,
                    top: 5,
                    width: 9,
                    height: 9,
                    borderRadius: '50%',
                    backgroundColor: latest ? 'var(--mui-palette-primary-main)' : 'var(--crm-slate-400)',
                    boxShadow: latest ? '0 0 0 3px rgb(var(--crm-accent-rgb) / 0.18)' : 'none',
                }}
            />
            {!last && (
                <Box aria-hidden sx={{ position: 'absolute', left: 6, top: 18, bottom: 2, width: '1px', backgroundColor: 'var(--mui-palette-border-main)' }} />
            )}

            <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--crm-slate-900)', lineHeight: 1.4 }}>{title}</Typography>

            {showSlot && (
                <Box sx={{ mt: 0.6, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.75 }}>
                    {event.next ? (
                        <Box
                            component="span"
                            sx={{
                                display: 'inline-block',
                                px: 1,
                                py: 0.2,
                                borderRadius: '999px',
                                fontSize: '0.7rem',
                                fontWeight: 600,
                                color: 'var(--crm-text-blue-700)',
                                backgroundColor: 'var(--mui-palette-primary-soft)',
                                border: '1px solid var(--mui-palette-primary-softBorder)',
                            }}
                        >
                            {event.next}
                        </Box>
                    ) : (
                        <Typography component="span" sx={{ fontSize: '0.74rem', color: 'var(--mui-palette-text-muted)' }}>
                            No follow-up scheduled
                        </Typography>
                    )}
                    {event.retained && (
                        <Typography component="span" sx={{ fontSize: '0.72rem', color: 'var(--mui-palette-text-secondary)' }}>
                            (kept)
                        </Typography>
                    )}
                </Box>
            )}

            {event.closedAs && (
                <Typography sx={{ mt: 0.6, fontSize: '0.74rem', color: 'var(--mui-palette-text-secondary)' }}>
                    Lead closed as <strong>{event.closedAs}</strong> · follow-up removed
                </Typography>
            )}

            {(event.rating?.to || (event.unansweredCalls ?? 0) > 0) && (
                <Box sx={{ mt: 0.6, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.75 }}>
                    {event.rating?.to && <RatingChange from={event.rating.from} to={event.rating.to} reason={event.reason} />}
                    {(event.unansweredCalls ?? 0) > 0 && (
                        <Typography component="span" sx={{ fontSize: '0.72rem', color: 'var(--mui-palette-text-secondary)' }}>
                            {event.unansweredCalls} unanswered {event.unansweredCalls === 1 ? 'call' : 'calls'} in a row
                        </Typography>
                    )}
                </Box>
            )}

            {event.remarks && (
                <Typography sx={{ mt: 0.6, fontSize: '0.75rem', color: 'var(--crm-slate-700)', lineHeight: 1.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                    {event.remarks}
                </Typography>
            )}

            <Typography sx={{ mt: 0.75, fontSize: '0.68rem', color: 'var(--mui-palette-text-muted)' }}>
                {markCreated && `${recordLabel} created · `}
                {formatEventTime(event.at)} · {event.author}
            </Typography>
        </Box>
    );
}
