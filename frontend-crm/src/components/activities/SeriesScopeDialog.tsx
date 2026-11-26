'use client';

import React, { useCallback, useRef, useState } from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Radio, RadioGroup, Typography } from '@mui/material';
import RepeatIcon from '@mui/icons-material/Repeat';
import { RaisedLayer } from '@/components/common/RaisedLayer';
import type { SeriesScope } from '@/types/activity.types';

export interface SeriesScopeRequest {
    /** What the user is doing: the title and the confirm button follow it. */
    action: 'save' | 'delete' | 'cancel';
    /** The repeat rule changed: "This event" can't apply it. */
    ruleChanged?: boolean;
    /** The day moved: "All events" can't apply it (change the rule, or pick "This and following"). */
    dayMoved?: boolean;
    /**
     * What a cancel / delete does in the owner's calendar (ActivitySyncStatus `calendarRemovalNote`, trimmed), shown
     * above the buttons; empty when the activity isn't in a calendar.
     */
    calendarNote?: string;
}

const TITLES: Record<SeriesScopeRequest['action'], string> = {
    save: 'Save recurring activity',
    delete: 'Delete recurring activity',
    cancel: 'Cancel recurring activity',
};
const CONFIRM: Record<SeriesScopeRequest['action'], string> = { save: 'Save', delete: 'Delete', cancel: 'Cancel activities' };

const primaryButtonSx = {
    textTransform: 'none',
    fontWeight: 700,
    borderRadius: '8px',
    px: 2.25,
    color: '#ffffff',
    boxShadow: 'none',
    background: 'linear-gradient(135deg, var(--crm-fill-blue-700) 0%, var(--crm-fill-blue-600) 100%)',
    '&:hover': { background: 'linear-gradient(135deg, var(--crm-fill-blue-800) 0%, var(--crm-fill-blue-700) 100%)', boxShadow: '0 4px 14px rgb(var(--crm-accent-rgb) / 0.28)' },
} as const;

const dangerButtonSx = {
    ...primaryButtonSx,
    background: 'var(--crm-fill-red-700)',
    '&:hover': { background: 'var(--crm-fill-red-800)', boxShadow: 'none' },
} as const;

const outlinedButtonSx = {
    textTransform: 'none',
    fontWeight: 600,
    borderRadius: '8px',
    border: '1px solid var(--mui-palette-border-main)',
    color: 'var(--crm-slate-700)',
    backgroundColor: 'var(--mui-palette-background-paper)',
    transition: 'all 0.15s ease',
    '&:hover': { borderColor: 'var(--crm-blue-300)', backgroundColor: 'var(--mui-palette-primary-soft)', color: 'var(--crm-text-blue-700)' },
} as const;

const radioSx = { color: 'var(--mui-palette-text-muted)', '&.Mui-checked': { color: 'var(--mui-palette-primary-main)' } } as const;

/**
 * "This event / This and following events / All events" (Calendar Phase 4), asked before saving, cancelling or deleting
 * an occurrence of a recurring activity. `useSeriesScopePrompt` returns `ask(request)` → the chosen scope, or null when
 * the user backs out, and the dialog element to render. Fits a phone (full width minus a margin).
 */
export function useSeriesScopePrompt() {
    const [request, setRequest] = useState<SeriesScopeRequest | null>(null);
    const [scope, setScope] = useState<SeriesScope>('this');
    const resolver = useRef<((scope: SeriesScope | null) => void) | null>(null);

    const ask = useCallback((next: SeriesScopeRequest): Promise<SeriesScope | null> => {
        resolver.current?.(null);
        setScope(next.ruleChanged ? 'following' : 'this');
        setRequest(next);
        return new Promise((resolve) => {
            resolver.current = resolve;
        });
    }, []);

    const close = (answer: SeriesScope | null) => {
        resolver.current?.(answer);
        resolver.current = null;
        setRequest(null);
    };

    const options: { value: SeriesScope; label: string; note?: string; disabled?: boolean }[] = request
        ? [
              { value: 'this', label: 'This event', note: request.ruleChanged ? 'Pick another option to change how it repeats.' : undefined, disabled: request.ruleChanged },
              { value: 'following', label: 'This and following events' },
              {
                  value: 'all',
                  label: 'All events',
                  note: request.dayMoved ? 'To move every event to another day, change how it repeats.' : 'Past and completed events stay as they are.',
                  disabled: request.dayMoved,
              },
          ]
        : [];

    const dialog = (
        <RaisedLayer>
            <Dialog
                open={Boolean(request)}
                onClose={() => close(null)}
                fullWidth
                maxWidth="xs"
                slotProps={{
                    paper: {
                        sx: {
                            m: 2,
                            width: 'calc(100% - 32px)',
                            borderRadius: '14px',
                            backgroundColor: 'var(--mui-palette-background-paper)',
                            backgroundImage: 'none',
                            border: '1px solid var(--mui-palette-border-main)',
                        },
                    },
                }}
            >
                <DialogTitle component="div" sx={{ display: 'flex', alignItems: 'center', gap: 1, fontWeight: 800, fontSize: '1rem', color: 'var(--crm-slate-900)' }}>
                    <RepeatIcon sx={{ fontSize: 20, color: 'var(--crm-text-blue-600)' }} />
                    {request ? TITLES[request.action] : ''}
                </DialogTitle>
                <DialogContent sx={{ pb: 1 }}>
                    <RadioGroup value={scope} onChange={(e) => setScope(e.target.value as SeriesScope)}>
                        {options.map((option) => (
                            <Box key={option.value} sx={{ mb: 0.5 }}>
                                <FormControlLabel
                                    value={option.value}
                                    disabled={option.disabled}
                                    control={<Radio size="small" sx={radioSx} />}
                                    label={<Typography sx={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--crm-slate-900)' }}>{option.label}</Typography>}
                                    sx={{ minHeight: 40, mr: 0 }}
                                />
                                {option.note && (
                                    <Typography sx={{ pl: 4, mt: -0.5, fontSize: '0.74rem', color: 'var(--mui-palette-text-secondary)' }}>{option.note}</Typography>
                                )}
                            </Box>
                        ))}
                    </RadioGroup>
                    {request?.calendarNote && (
                        <Typography
                            sx={{
                                mt: 1,
                                px: 1.5,
                                py: 1,
                                borderRadius: '8px',
                                fontSize: '0.78rem',
                                color: 'var(--mui-palette-text-secondary)',
                                backgroundColor: 'var(--mui-palette-background-subtle)',
                                border: '1px solid var(--mui-palette-border-main)',
                                overflowWrap: 'anywhere',
                            }}
                        >
                            {request.calendarNote}
                            {scope !== 'this' ? ' Every other event this includes is cancelled there too.' : ''}
                        </Typography>
                    )}
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2, gap: 1, flexWrap: 'wrap' }}>
                    <Button onClick={() => close(null)} sx={outlinedButtonSx}>
                        Back
                    </Button>
                    <Button onClick={() => close(scope)} variant="contained" sx={request?.action === 'save' ? primaryButtonSx : dangerButtonSx}>
                        {request ? CONFIRM[request.action] : 'OK'}
                    </Button>
                </DialogActions>
            </Dialog>
        </RaisedLayer>
    );

    return { ask, dialog };
}
