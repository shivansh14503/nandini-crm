'use client';

import React from 'react';
import { Box, ButtonBase, Tooltip, Typography } from '@mui/material';
import type { AuditDayCount } from '@/services/auditAdmin.service';
import { fmtCount, fmtDay, fmtShortDay, useDisplayFormats } from '@/utils/formats';

/** Stacked bottom to top in this order; colours are theme tokens with their own dark-mode steps (color-scale.css). */
const SERIES = [
    { key: 'data', label: 'Data', color: 'var(--crm-chart-audit-data)' },
    { key: 'config', label: 'Configuration', color: 'var(--crm-chart-audit-config)' },
    { key: 'security', label: 'Security', color: 'var(--crm-chart-audit-security)' },
] as const;

const PLOT_HEIGHT = 112;
/** `2026-11-21` → `21 Nov` (with the year when asked: `21 Nov 2026`); the company date style once saved. */
export function shortDate(date: string, withYear = false): string {
    return withYear ? fmtDay(date, { legacy: 'D MMM YYYY' }) : fmtShortDay(date);
}

const n = (value: number) => fmtCount(value);

function Swatch({ color }: { color: string }) {
    return <Box component="span" aria-hidden sx={{ width: 10, height: 10, borderRadius: '3px', backgroundColor: color, flexShrink: 0 }} />;
}

/** Events per day, by category, as stacked bars; a click on a day filters the list to it. */
export function AuditEventsChart({ days, onPickDay }: { days: AuditDayCount[]; onPickDay: (date: string) => void }) {
    useDisplayFormats(); // tick dates and counts follow an admin's format change
    const max = Math.max(1, ...days.map((d) => d.total));
    const totals = SERIES.map((s) => days.reduce((sum, d) => sum + d[s.key], 0));
    const gap = days.length > 90 ? 0 : days.length > 45 ? 1 : 2;
    const ticks = days.length > 1 ? [days[0], days[Math.floor((days.length - 1) / 2)], days[days.length - 1]] : days;
    const multiYear = days.length > 0 && days[0].date.slice(0, 4) !== days[days.length - 1].date.slice(0, 4);

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, minWidth: 0 }}>
            {/* Legend (with each series' total in the range) */}
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                {SERIES.map((s, i) => (
                    <Box key={s.key} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
                        <Swatch color={s.color} />
                        <Typography sx={{ fontSize: '0.75rem', color: 'var(--mui-palette-text-secondary)' }}>
                            {s.label}{' '}
                            <Box component="span" sx={{ fontWeight: 700, color: 'var(--crm-slate-900)' }}>
                                {n(totals[i])}
                            </Box>
                        </Typography>
                    </Box>
                ))}
            </Box>

            {/* Plot: the top gridline carries the scale; bars sit on the baseline */}
            <Box sx={{ position: 'relative', pt: 1.75 }}>
                <Typography sx={{ position: 'absolute', top: 0, left: 0, fontSize: '0.65rem', color: 'var(--mui-palette-text-muted)', lineHeight: 1 }}>{n(max)}</Typography>
                <Box sx={{ position: 'absolute', top: 14, left: 0, right: 0, borderTop: '1px dashed var(--mui-palette-border-main)' }} />
                <Box
                    role="group"
                    aria-label="Events per day"
                    sx={{ position: 'relative', height: PLOT_HEIGHT, display: 'flex', alignItems: 'flex-end', gap: `${gap}px`, borderBottom: '1px solid var(--mui-palette-border-strong)' }}
                >
                    {days.map((day) => {
                        const label = `${shortDate(day.date, true)}: ${n(day.total)} event${day.total === 1 ? '' : 's'}`;
                        return (
                            <Tooltip
                                key={day.date}
                                placement="top"
                                title={
                                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, py: 0.25 }}>
                                        <Box sx={{ fontWeight: 700 }}>{label}</Box>
                                        {SERIES.map((s) => (
                                            <Box key={s.key} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                                <Swatch color={s.color} />
                                                {s.label}: {n(day[s.key])}
                                            </Box>
                                        ))}
                                        {day.total > 0 && <Box sx={{ opacity: 0.8, mt: 0.25 }}>Click to see that day</Box>}
                                    </Box>
                                }
                            >
                                <ButtonBase
                                    aria-label={`${label}. Data ${day.data}, configuration ${day.config}, security ${day.security}.`}
                                    onClick={() => onPickDay(day.date)}
                                    sx={{
                                        flex: 1,
                                        minWidth: 0,
                                        height: '100%',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        justifyContent: 'flex-end',
                                        borderRadius: '4px 4px 0 0',
                                        '&:hover, &:focus-visible': { backgroundColor: 'var(--mui-palette-background-hover)' },
                                    }}
                                >
                                    {/* Top of the stack first (column direction), each segment separated by a 2px surface gap */}
                                    <Box
                                        sx={{
                                            width: '100%',
                                            height: `${(day.total / max) * 100}%`,
                                            minHeight: day.total > 0 ? 3 : 0,
                                            display: 'flex',
                                            flexDirection: 'column-reverse',
                                            gap: day.total > 0 && gap > 0 ? '2px' : 0,
                                            borderRadius: '4px 4px 0 0',
                                            overflow: 'hidden',
                                        }}
                                    >
                                        {SERIES.map((s) =>
                                            day[s.key] > 0 ? <Box key={s.key} sx={{ flex: `${day[s.key]} 1 0`, minHeight: 1, backgroundColor: s.color }} /> : null
                                        )}
                                    </Box>
                                </ButtonBase>
                            </Tooltip>
                        );
                    })}
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
                    {ticks.map((day, i) => (
                        <Typography key={`${day.date}-${i}`} sx={{ fontSize: '0.68rem', color: 'var(--mui-palette-text-muted)' }}>
                            {shortDate(day.date, multiYear)}
                        </Typography>
                    ))}
                </Box>
            </Box>
        </Box>
    );
}
