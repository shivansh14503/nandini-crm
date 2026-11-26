'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Tooltip, Typography, useMediaQuery, useTheme } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import { FormProvider, useWatch } from 'react-hook-form';
import { FormConfigProvider } from '@/context/FormConfigContext';
import { AppToast } from '@/components/common/AppToast';
import { RaisedLayer } from '@/components/common/RaisedLayer';
import { getModuleColor } from '@/theme/moduleColors';
import { NOTE_TYPE, type Activity } from '@/types/activity.types';
import type { ActivityFormValues } from '@/validations/activity.schema';
import { ActivityFormFields, useActivityForm } from './ActivityFormFields';
import { ActivityTypeIcon, useActivityTypeLabel } from './ActivityBadges';
import { ActivityRepeatField, useActivityRepeat } from './ActivityRepeatField';
import { newActivityHref } from './activityLinks';
import { timeZoneAbbr } from './activityTime';

export interface ActivityQuickCreateDialogProps {
    open: boolean;
    onClose: () => void;
    /** Values the activity starts with (a calendar slot, a record's Activities tab button). */
    prefill?: Partial<ActivityFormValues>;
    /** Called with the created activity (the dialog closes itself). */
    onSaved?: (activity: Activity) => void;
}

/** Brand gradient with its own hover gradient (CLAUDE.md §2.D). */
const primaryButtonSx = {
    textTransform: 'none',
    fontWeight: 700,
    fontSize: '0.85rem',
    height: 40,
    px: 2.4,
    borderRadius: '8px',
    color: '#ffffff',
    boxShadow: 'none',
    background: 'linear-gradient(135deg, var(--crm-fill-blue-700) 0%, var(--crm-fill-blue-600) 100%)',
    '&:hover': {
        background: 'linear-gradient(135deg, var(--crm-fill-blue-800) 0%, var(--crm-fill-blue-700) 100%)',
        boxShadow: '0 4px 14px rgb(var(--crm-accent-rgb) / 0.28)',
    },
} as const;

const outlinedButtonSx = {
    textTransform: 'none',
    fontWeight: 600,
    fontSize: '0.85rem',
    height: 40,
    px: 2,
    borderRadius: '8px',
    border: '1px solid var(--mui-palette-border-main)',
    color: 'var(--crm-slate-700)',
    backgroundColor: 'var(--mui-palette-background-paper)',
    transition: 'all 0.15s ease',
    '&:hover': {
        borderColor: 'var(--crm-blue-300)',
        backgroundColor: 'var(--mui-palette-primary-soft)',
        color: 'var(--crm-text-blue-700)',
    },
} as const;

function QuickCreateContent({ prefill, onClose, onSaved }: Omit<ActivityQuickCreateDialogProps, 'open'>) {
    const router = useRouter();
    const { methods, toast, showToast, closeToast, createSubmitHandler, clock, durationOf, save } = useActivityForm({ mode: 'create', prefill });
    const { control, getValues, formState } = methods;
    const followupType = useWatch({ control, name: 'followupType' }) ?? '';
    // Recurring activities (Calendar Phase 4): Repeat for any type but Note.
    const startAt = useWatch({ control, name: 'startAt' }) ?? '';
    const repeatState = useActivityRepeat(undefined);
    const typeLabel = useActivityTypeLabel()(followupType);
    const color = getModuleColor('activities');

    const submit = createSubmitHandler(async (values) => {
        try {
            const repeat = followupType !== NOTE_TYPE ? repeatState.repeat : null;
            const saved = await save(values, repeat ? { repeat } : undefined);
            onSaved?.(saved);
            onClose();
        } catch (err: unknown) {
            showToast(err instanceof Error ? err.message : 'Failed to save activity.', 'error');
        }
    });

    // The full form, with what is filled in so far that the query string can carry. The dialog closes first, so its
    // owner (calendar, Activities tab, FAB) doesn't show it again when the user comes back to that page.
    const openFullForm = () => {
        const v = getValues();
        onClose();
        router.push(
            newActivityHref({
                type: v.followupType,
                status: v.status,
                subject: v.subject,
                relatedModule: v.relatedModule,
                relatedId: v.relatedId,
                start: v.followupType === NOTE_TYPE ? undefined : v.startAt,
                end: v.followupType === NOTE_TYPE ? undefined : v.endAt,
                allDay: v.allDay,
            })
        );
    };

    return (
        <FormProvider {...methods}>
            <FormConfigProvider module="activities">
                <DialogTitle
                    component="div"
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1.25,
                        py: 1.75,
                        px: { xs: 2, sm: 3 },
                        borderBottom: '1px solid var(--mui-palette-border-light)',
                        borderTop: `3px solid ${color.main}`,
                        background: `linear-gradient(180deg, ${color.soft} 0%, transparent 100%)`,
                    }}
                >
                    <Box
                        sx={{
                            width: 36,
                            height: 36,
                            borderRadius: '10px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: color.soft,
                            border: `1px solid ${color.border}`,
                            flexShrink: 0,
                        }}
                    >
                        <ActivityTypeIcon type={followupType} sx={{ fontSize: 20 }} />
                    </Box>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography noWrap sx={{ fontSize: '1.02rem', fontWeight: 800, color: 'var(--crm-slate-900)' }}>
                            {followupType === NOTE_TYPE ? 'New Note' : `New ${typeLabel || 'Activity'}`}
                        </Typography>
                        <Typography noWrap sx={{ fontSize: '0.75rem', color: 'var(--mui-palette-text-secondary)' }}>
                            {`Times in ${timeZoneAbbr(clock.timeZone)} (${clock.timeZone})`}
                        </Typography>
                    </Box>
                    <Tooltip title="Open the full form">
                        <IconButton
                            onClick={openFullForm}
                            aria-label="Open the full form"
                            sx={{
                                width: 40,
                                height: 40,
                                border: '1px solid var(--mui-palette-border-main)',
                                borderRadius: '8px',
                                color: 'var(--mui-palette-text-secondary)',
                                '&:hover': { borderColor: 'var(--crm-blue-300)', backgroundColor: 'var(--mui-palette-primary-soft)', color: 'var(--crm-text-blue-700)' },
                            }}
                        >
                            <OpenInFullIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Close">
                        <IconButton
                            onClick={onClose}
                            aria-label="Close"
                            sx={{
                                width: 40,
                                height: 40,
                                border: '1px solid var(--mui-palette-border-main)',
                                borderRadius: '8px',
                                color: 'var(--mui-palette-text-secondary)',
                                '&:hover': {
                                    color: 'var(--mui-palette-error-main)',
                                    backgroundColor: 'var(--mui-palette-error-soft)',
                                    borderColor: 'var(--mui-palette-error-softBorder)',
                                },
                            }}
                        >
                            <CloseIcon sx={{ fontSize: 20 }} />
                        </IconButton>
                    </Tooltip>
                </DialogTitle>
                <DialogContent sx={{ px: { xs: 2, sm: 3 }, pt: '20px !important', pb: 2 }}>
                    <ActivityFormFields
                        clock={clock}
                        durationOf={durationOf}
                        compact
                        repeatSlot={<ActivityRepeatField value={repeatState.repeat} onChange={repeatState.setRepeat} startDay={startAt.slice(0, 10)} />}
                    />
                </DialogContent>
                <DialogActions sx={{ px: { xs: 2, sm: 3 }, py: 1.5, gap: 1, borderTop: '1px solid var(--mui-palette-border-light)', flexWrap: 'wrap' }}>
                    <Button onClick={onClose} sx={outlinedButtonSx}>
                        Cancel
                    </Button>
                    <Button onClick={submit} disabled={formState.isSubmitting} variant="contained" sx={primaryButtonSx}>
                        {formState.isSubmitting ? 'Saving...' : followupType === NOTE_TYPE ? 'Save Note' : 'Save Activity'}
                    </Button>
                </DialogActions>
                <AppToast open={toast.open} message={toast.message} severity={toast.severity} onClose={closeToast} />
            </FormConfigProvider>
        </FormProvider>
    );
}

/**
 * Quick create of an activity: the form's fields in a compact dialog (same labels and options, from the Activities
 * form configuration). Full screen on phones. Opened from a calendar slot, a record's Activities tab and the phone FAB.
 */
export function ActivityQuickCreateDialog({ open, onClose, prefill, onSaved }: ActivityQuickCreateDialogProps) {
    const theme = useTheme();
    const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
    return (
        <RaisedLayer>
            <Dialog
                open={open}
                onClose={onClose}
                fullScreen={fullScreen}
                fullWidth
                maxWidth="sm"
                scroll="paper"
                slotProps={{
                    paper: {
                        sx: {
                            backgroundColor: 'var(--mui-palette-background-paper)',
                            backgroundImage: 'none',
                            borderRadius: fullScreen ? 0 : '14px',
                            border: fullScreen ? 'none' : '1px solid var(--mui-palette-border-main)',
                        },
                    },
                }}
            >
                {/* Mounted per opening, so each opening starts from its own prefill. */}
                {open && <QuickCreateContent prefill={prefill} onClose={onClose} onSaved={onSaved} />}
            </Dialog>
        </RaisedLayer>
    );
}
