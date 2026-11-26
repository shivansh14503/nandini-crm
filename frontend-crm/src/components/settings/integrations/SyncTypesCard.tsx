'use client';

import React, { useEffect, useState } from 'react';
import { Box, Button, Checkbox, FormControlLabel, Tooltip, Typography } from '@mui/material';
import { errorMessage, panelHeaderSx, primaryButtonSx, secondaryButtonSx, surfaceSx } from '@/components/settings/form-customization/builderUi';
import { useSaveSyncTypes, useSaveVideoTypes } from '@/hooks/queries/useIntegrationsAdmin';
import type { SyncType } from '@/types/integration.types';
import { hintSx } from './integrationUi';

/**
 * "What goes to calendars": one checkbox per Followup Type (option meta `calendarSync`; Task / Note locked off), and
 * which of them offer a Video meeting on the activity form (option meta `videoMeeting`; Calendar Phase 3).
 */
export function SyncTypesCard({
    types,
    onDirtyChange,
    onToast,
}: {
    types: SyncType[];
    onDirtyChange: (dirty: boolean) => void;
    onToast: (message: string, severity?: 'success' | 'error') => void;
}) {
    /** Unsaved ticks, by type value. A tick back to the saved state drops out. */
    const [changes, setChanges] = useState<Record<string, boolean>>({});
    const [videoChanges, setVideoChanges] = useState<Record<string, boolean>>({});
    const save = useSaveSyncTypes();
    const saveVideo = useSaveVideoTypes();
    const saving = save.isPending || saveVideo.isPending;

    // Drop changes the server now agrees with (or whose type disappeared).
    const live = Object.fromEntries(Object.entries(changes).filter(([value, on]) => types.some((t) => t.value === value && !t.locked && t.calendarSync !== on)));
    const liveVideo = Object.fromEntries(Object.entries(videoChanges).filter(([value, on]) => types.some((t) => t.value === value && !t.locked && t.videoMeeting !== on)));
    const dirty = Object.keys(live).length > 0 || Object.keys(liveVideo).length > 0;

    const videoTypes = types.filter((t) => !t.locked);

    useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
    useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

    const toggle = (t: SyncType, on: boolean) =>
        setChanges((c) => {
            const next = { ...c };
            if (on === t.calendarSync) delete next[t.value];
            else next[t.value] = on;
            return next;
        });
    const toggleVideo = (t: SyncType, on: boolean) =>
        setVideoChanges((c) => {
            const next = { ...c };
            if (on === t.videoMeeting) delete next[t.value];
            else next[t.value] = on;
            return next;
        });

    const submit = async () => {
        try {
            if (Object.keys(live).length > 0) await save.mutateAsync(live);
            setChanges({});
            if (Object.keys(liveVideo).length > 0) await saveVideo.mutateAsync(liveVideo);
            setVideoChanges({});
            onToast('Saved. New and edited activities follow the new choice.');
        } catch (err) {
            onToast(errorMessage(err, 'Could not save which types go to calendars.'), 'error');
        }
    };

    return (
        <Box component="section" aria-labelledby="sync-types-title" sx={{ ...surfaceSx, overflow: 'hidden', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <Box sx={panelHeaderSx}>
                <Typography id="sync-types-title" component="h2" sx={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--crm-slate-900)' }}>
                    What goes to calendars
                </Typography>
                <Typography sx={hintSx}>Planned activities of the ticked Followup Types are copied to the owner&apos;s connected calendar.</Typography>
            </Box>
            <Box sx={{ p: { xs: 1.75, sm: 2 }, display: 'flex', flexDirection: 'column', gap: 1.5, flex: 1, minWidth: 0 }}>
                {types.length === 0 ? (
                    <Typography sx={hintSx}>No Followup Types are set up. Add them in Form Customization › Dropdowns.</Typography>
                ) : (
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0,1fr)', sm: 'repeat(2, minmax(0,1fr))' }, columnGap: 1.5, rowGap: 0.25 }}>
                        {types.map((t) => {
                            const checked = t.locked ? false : (live[t.value] ?? t.calendarSync);
                            const control = (
                                <FormControlLabel
                                    disabled={t.locked || saving}
                                    control={<Checkbox size="small" checked={checked} onChange={(e) => toggle(t, e.target.checked)} />}
                                    label={
                                        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'baseline', gap: 0.75, flexWrap: 'wrap', minWidth: 0 }}>
                                            <Typography component="span" sx={{ fontSize: '0.84rem', color: t.locked ? 'var(--mui-palette-text-secondary)' : 'var(--crm-slate-900)', overflowWrap: 'anywhere' }}>
                                                {t.label}
                                            </Typography>
                                            {t.locked && (
                                                <Typography component="span" sx={{ fontSize: '0.72rem', color: 'var(--mui-palette-text-muted)' }}>
                                                    never synced
                                                </Typography>
                                            )}
                                            {t.value in live && (
                                                <Typography component="span" sx={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--crm-amber-700)' }}>
                                                    unsaved
                                                </Typography>
                                            )}
                                        </Box>
                                    }
                                    sx={{ ml: 0, mr: 0, minHeight: 36, minWidth: 0 }}
                                />
                            );
                            return t.locked && t.lockReason ? (
                                <Tooltip key={t.value} title={t.lockReason} arrow placement="top-start">
                                    <span>{control}</span>
                                </Tooltip>
                            ) : (
                                <React.Fragment key={t.value}>{control}</React.Fragment>
                            );
                        })}
                    </Box>
                )}
                <Typography sx={hintSx}>
                    Unticking a type stops new copies. Events already on calendars stay until their activity is next edited. Tasks and notes never go to calendars.
                </Typography>
                {videoTypes.length > 0 && (
                    <Box sx={{ borderTop: '1px solid var(--mui-palette-border-light)', pt: 1.5, display: 'flex', flexDirection: 'column', gap: 0.75, minWidth: 0 }}>
                        <Typography component="h3" sx={{ fontWeight: 700, fontSize: '0.84rem', color: 'var(--crm-slate-900)' }}>
                            Offer a video meeting on
                        </Typography>
                        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0,1fr)', sm: 'repeat(2, minmax(0,1fr))' }, columnGap: 1.5, rowGap: 0.25 }}>
                            {videoTypes.map((t) => {
                                const synced = live[t.value] ?? t.calendarSync;
                                return (
                                    <FormControlLabel
                                        key={t.value}
                                        disabled={!synced || saving}
                                        control={<Checkbox size="small" checked={synced && (liveVideo[t.value] ?? t.videoMeeting)} onChange={(e) => toggleVideo(t, e.target.checked)} />}
                                        label={
                                            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'baseline', gap: 0.75, flexWrap: 'wrap', minWidth: 0 }}>
                                                <Typography component="span" sx={{ fontSize: '0.84rem', color: synced ? 'var(--crm-slate-900)' : 'var(--mui-palette-text-secondary)', overflowWrap: 'anywhere' }}>
                                                    {t.label}
                                                </Typography>
                                                {!synced && (
                                                    <Typography component="span" sx={{ fontSize: '0.72rem', color: 'var(--mui-palette-text-muted)' }}>
                                                        not sent to calendars
                                                    </Typography>
                                                )}
                                                {t.value in liveVideo && (
                                                    <Typography component="span" sx={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--crm-amber-700)' }}>
                                                        unsaved
                                                    </Typography>
                                                )}
                                            </Box>
                                        }
                                        sx={{ ml: 0, mr: 0, minHeight: 36, minWidth: 0 }}
                                    />
                                );
                            })}
                        </Box>
                        <Typography sx={hintSx}>
                            The activity form then offers Google Meet or Microsoft Teams, whichever the owner&apos;s company calendar makes. Unticking keeps meetings already set up.
                        </Typography>
                    </Box>
                )}
                <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', flexWrap: 'wrap', mt: 'auto' }}>
                    {dirty && (
                        <Button
                            variant="outlined"
                            sx={{ ...secondaryButtonSx, minHeight: 36 }}
                            onClick={() => {
                                setChanges({});
                                setVideoChanges({});
                            }}
                            disabled={saving}
                        >
                            Cancel
                        </Button>
                    )}
                    <Button variant="contained" sx={{ ...primaryButtonSx, minHeight: 36 }} disabled={!dirty || saving} onClick={() => void submit()}>
                        {saving ? 'Saving…' : 'Save'}
                    </Button>
                </Box>
            </Box>
        </Box>
    );
}
