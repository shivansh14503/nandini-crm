'use client';

import React, { useMemo, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControl,
    FormControlLabel,
    FormHelperText,
    FormLabel,
    MenuItem,
    Radio,
    RadioGroup,
    Skeleton,
    TextField,
    Typography,
} from '@mui/material';
import TranslateOutlinedIcon from '@mui/icons-material/TranslateOutlined';
import { AppToast } from '@/components/common/AppToast';
import { errorMessage, inputSx, panelHeaderSx, primaryButtonSx, secondaryButtonSx, surfaceSx } from '@/components/settings/form-customization/builderUi';
import { phoneDialogPaperSx } from '@/components/profile/profileUi';
import { useLeaveGuard } from '@/components/settings/useLeaveGuard';
import { useCompanyFormats, useResetCompanyFormats, useSaveCompanyFormats } from '@/hooks/queries/useCompanyFormats';
import { useMasterData } from '@/hooks/queries/useMasterData';
import { formatDay, formatNumber, formatTime } from '@/lib/display-formats/displayFormats';
import { ApiClientError } from '@/services/apiClient';
import { findCrmUser } from '@/services/masterData.store';
import {
    CRM_CURRENCY,
    DATE_FORMATS,
    NUMBER_GROUPINGS,
    NUMBER_GROUPING_LABELS,
    TIME_FORMATS,
    TIME_FORMAT_LABELS,
    type CompanyFormatsDto,
    type DateFormat,
    type NumberGrouping,
    type SaveCompanyFormatsPayload,
    type TimeFormat,
} from '@/types/companyFormats.types';
import { fmtInstant } from '@/utils/formats';
import { FormatsPreview } from './FormatsPreview';

type FieldKey = keyof SaveCompanyFormatsPayload;
type FieldErrors = Partial<Record<FieldKey, string>>;

const FIELD_KEYS: readonly FieldKey[] = ['dateFormat', 'timeFormat', 'numberGrouping'];
const LEAVE_MESSAGE = 'You have unsaved company format changes. Leave this page and lose them?';

const draftFrom = (dto: CompanyFormatsDto): SaveCompanyFormatsPayload => ({
    dateFormat: dto.dateFormat,
    timeFormat: dto.timeFormat,
    numberGrouping: dto.numberGrouping,
});

const sameDraft = (a: SaveCompanyFormatsPayload, b: SaveCompanyFormatsPayload) =>
    a.dateFormat === b.dateFormat && a.timeFormat === b.timeFormat && a.numberGrouping === b.numberGrouping;

/** Option examples, as saved formats would show them. */
const SAMPLE = { dateFormat: 'DD-MMM-YYYY', timeFormat: '12h', numberGrouping: 'indian', customized: true } as const;
const dateExample = (format: DateFormat) => formatDay('2026-03-25', { ...SAMPLE, dateFormat: format });
const timeExample = (format: TimeFormat) => formatTime('13:07', { ...SAMPLE, timeFormat: format });
const groupingExample = (grouping: NumberGrouping) => formatNumber(1234567.89, { ...SAMPLE, numberGrouping: grouping });

const fieldLabelSx = { fontSize: '0.78rem', fontWeight: 600, color: 'var(--crm-slate-700)', mb: 0.5, display: 'block' } as const;
const hintSx = { fontSize: '0.72rem', color: 'var(--mui-palette-text-secondary)', mt: 0.5, mx: 0, lineHeight: 1.4 } as const;
const radioLabelSx = { mr: 3, minHeight: 40, '& .MuiFormControlLabel-label': { fontSize: '0.85rem', color: 'var(--crm-slate-900)' } } as const;
const buttonSize = { minHeight: 40 } as const;

const resetButtonSx = {
    ...secondaryButtonSx,
    ...buttonSize,
    '&:hover': {
        color: 'var(--mui-palette-error-main)',
        backgroundColor: 'var(--mui-palette-error-soft)',
        borderColor: 'var(--mui-palette-error-softBorder)',
    },
} as const;

const dangerButtonSx = {
    ...primaryButtonSx,
    ...buttonSize,
    color: '#ffffff',
    // --crm-fill-red-* stays a deep red in both schemes, so white text stays readable.
    background: 'var(--crm-fill-red-700)',
    '&:hover': { background: 'var(--crm-fill-red-800)', boxShadow: 'none' },
    '&.Mui-disabled': { background: 'var(--mui-palette-background-hover)', color: 'var(--mui-palette-text-muted)' },
} as const;

/** The server's per-field messages (400 VALIDATION_ERROR `errors[].path`). */
function fieldErrorsOf(err: unknown): FieldErrors {
    if (!(err instanceof ApiClientError)) return {};
    const out: FieldErrors = {};
    for (const e of err.details?.errors ?? []) {
        const key = e.path?.[0];
        if (typeof key === 'string' && (FIELD_KEYS as readonly string[]).includes(key) && e.message) out[key as FieldKey] = e.message;
    }
    return out;
}

function ResetDialog({ open, pending, onClose, onConfirm }: { open: boolean; pending: boolean; onClose: () => void; onConfirm: () => void }) {
    return (
        <Dialog open={open} onClose={pending ? undefined : onClose} fullWidth maxWidth="xs" aria-labelledby="company-formats-reset-title" slotProps={{ paper: { sx: phoneDialogPaperSx } }}>
            <DialogTitle id="company-formats-reset-title" sx={{ fontWeight: 700, fontSize: '1rem', color: 'var(--crm-slate-900)' }}>
                Reset to CRM defaults?
            </DialogTitle>
            <DialogContent>
                <Typography sx={{ fontSize: '0.85rem', color: 'var(--crm-slate-700)', lineHeight: 1.55 }}>
                    Screens go back to today&apos;s mixed styles. This applies to everyone, and you can save formats again at any time.
                </Typography>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2, gap: 1, flexWrap: 'wrap' }}>
                <Button variant="outlined" onClick={onClose} disabled={pending} sx={{ ...secondaryButtonSx, ...buttonSize, flex: { xs: 1, sm: 'none' } }}>
                    Cancel
                </Button>
                <Button variant="contained" onClick={onConfirm} disabled={pending} sx={{ ...dangerButtonSx, flex: { xs: 1, sm: 'none' } }}>
                    {pending ? 'Resetting…' : 'Reset'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

function LoadingState() {
    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }} aria-busy="true">
            <Skeleton variant="rounded" height={84} sx={{ borderRadius: '12px' }} />
            <Skeleton variant="rounded" height={56} sx={{ borderRadius: '10px' }} />
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) minmax(0, 360px)' } }}>
                <Skeleton variant="rounded" height={360} sx={{ borderRadius: '12px' }} />
                <Skeleton variant="rounded" height={300} sx={{ borderRadius: '12px' }} />
            </Box>
        </Box>
    );
}

/** Admin › Company formats: one company-wide date, time and number format, with a live preview. */
export function CompanyFormatsView() {
    const query = useCompanyFormats();
    const save = useSaveCompanyFormats();
    const reset = useResetCompanyFormats();
    // Re-renders once the user directory loads, so "Last changed by" shows the admin's name.
    useMasterData();
    const [draft, setDraft] = useState<SaveCompanyFormatsPayload | null>(null);
    const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
    const [confirmReset, setConfirmReset] = useState(false);
    const [toast, setToast] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });

    // Take the server copy on first load and after every save / reset (React's "adjust state while rendering" pattern).
    const [syncedFrom, setSyncedFrom] = useState<CompanyFormatsDto | undefined>(undefined);
    if (query.data && query.data !== syncedFrom) {
        setSyncedFrom(query.data);
        setDraft(draftFrom(query.data));
        setFieldErrors({});
    }

    const saved = useMemo(() => (query.data ? draftFrom(query.data) : null), [query.data]);
    const dirty = Boolean(draft && saved && !sameDraft(draft, saved));
    const pending = save.isPending || reset.isPending;
    useLeaveGuard(dirty, LEAVE_MESSAGE);

    if (query.isPending || (!draft && !query.isError)) return <LoadingState />;
    // A failed background refetch keeps the loaded data: the editor (and the draft) stay, with a warning below.
    if (!draft || !query.data) {
        return (
            <Alert
                severity="error"
                sx={{ borderRadius: '10px', alignItems: 'center' }}
                action={
                    <Button size="small" variant="outlined" sx={{ ...secondaryButtonSx, ...buttonSize }} onClick={() => void query.refetch()} disabled={query.isFetching}>
                        Try again
                    </Button>
                }
            >
                {errorMessage(query.error, 'Could not load company formats.')}
            </Alert>
        );
    }

    const config = query.data;
    // Saving the shown defaults is meaningful while not customized: it applies one format everywhere.
    const canSave = (dirty || !config.customized) && !pending;
    const changedBy = config.updatedBy ? findCrmUser(config.updatedBy)?.name || config.updatedBy : null;
    const changedAt = fmtInstant(config.updatedAt);

    const setField = <K extends FieldKey>(key: K, value: SaveCompanyFormatsPayload[K]) => {
        setDraft((d) => (d ? { ...d, [key]: value } : d));
        setFieldErrors((errors) => (errors[key] ? { ...errors, [key]: undefined } : errors));
    };

    const onSave = async () => {
        setFieldErrors({});
        try {
            await save.mutateAsync(draft);
            setToast({ open: true, message: 'Company formats saved.', severity: 'success' });
        } catch (err) {
            setFieldErrors(fieldErrorsOf(err));
            setToast({ open: true, message: errorMessage(err, 'Could not save company formats.'), severity: 'error' });
        }
    };

    const onReset = async () => {
        try {
            await reset.mutateAsync();
            setConfirmReset(false);
            setToast({ open: true, message: 'Company formats reset.', severity: 'success' });
        } catch (err) {
            setConfirmReset(false);
            setToast({ open: true, message: errorMessage(err, 'Could not reset company formats.'), severity: 'error' });
        }
    };

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            {/* Header */}
            <Box sx={{ ...surfaceSx, p: { xs: 2, md: 2.5 }, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2 }}>
                <Box
                    sx={{
                        width: 40,
                        height: 40,
                        borderRadius: '10px',
                        backgroundColor: 'var(--mui-palette-primary-soft)',
                        border: '1px solid var(--mui-palette-primary-softBorder)',
                        color: 'var(--crm-text-blue-600)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                    }}
                >
                    <TranslateOutlinedIcon />
                </Box>
                <Box sx={{ flex: 1, minWidth: { xs: 0, sm: 220 }, flexBasis: { xs: 'calc(100% - 56px)', sm: 'auto' } }}>
                    <Typography component="h1" sx={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--crm-slate-900)' }}>
                        Company Formats
                    </Typography>
                    <Typography sx={{ fontSize: '0.8rem', color: 'var(--mui-palette-text-secondary)', mt: 0.25 }}>
                        How dates, times and numbers appear for everyone: on screens, in PDFs, emails and notifications.
                    </Typography>
                </Box>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, width: { xs: '100%', sm: 'auto' } }}>
                    <Button
                        variant="outlined"
                        sx={{ ...secondaryButtonSx, ...buttonSize, flex: { xs: 1, sm: 'none' } }}
                        disabled={!dirty || pending}
                        onClick={() => {
                            if (saved) setDraft(saved);
                            setFieldErrors({});
                        }}
                    >
                        Cancel
                    </Button>
                    <Button variant="contained" sx={{ ...primaryButtonSx, ...buttonSize, flex: { xs: 1, sm: 'none' } }} disabled={!canSave} onClick={onSave}>
                        {save.isPending ? 'Saving…' : 'Save changes'}
                    </Button>
                </Box>
            </Box>

            {query.isError && (
                <Alert
                    severity="warning"
                    sx={{ borderRadius: '10px', fontSize: '0.8rem', alignItems: 'center' }}
                    action={
                        <Button size="small" variant="outlined" sx={{ ...secondaryButtonSx, ...buttonSize }} onClick={() => void query.refetch()} disabled={query.isFetching}>
                            Try again
                        </Button>
                    }
                >
                    Could not refresh company formats. Showing the last loaded ones.
                </Alert>
            )}

            {config.customized ? (
                <Alert severity="success" sx={{ borderRadius: '10px', fontSize: '0.8rem' }}>
                    Last changed{changedBy ? ` by ${changedBy}` : ''}
                    {changedAt ? ` on ${changedAt}` : ''}.
                </Alert>
            ) : (
                <Alert severity="info" sx={{ borderRadius: '10px', fontSize: '0.8rem' }}>
                    Not set yet. Screens keep today&apos;s styles (24-Oct-2026 in lists, 25 Nov 2026 in forms). Saving applies the formats below
                    everywhere.
                </Alert>
            )}

            <Box sx={{ display: 'grid', gap: 2, alignItems: 'start', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) minmax(0, 360px)' } }}>
                {/* Settings */}
                <Box component="section" aria-labelledby="company-formats-settings-title" sx={{ ...surfaceSx, overflow: 'hidden', minWidth: 0 }}>
                    <Box sx={panelHeaderSx}>
                        <Typography id="company-formats-settings-title" component="h2" sx={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--crm-slate-900)' }}>
                            Formats
                        </Typography>
                        <Typography sx={{ fontSize: '0.75rem', color: 'var(--mui-palette-text-secondary)' }}>One setting for the whole company.</Typography>
                    </Box>

                    <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                        <Box>
                            <Typography component="label" htmlFor="company-formats-date" sx={fieldLabelSx}>
                                Date format
                            </Typography>
                            <TextField
                                id="company-formats-date"
                                select
                                fullWidth
                                size="small"
                                value={draft.dateFormat}
                                onChange={(e) => setField('dateFormat', e.target.value as DateFormat)}
                                disabled={pending}
                                error={Boolean(fieldErrors.dateFormat)}
                                helperText={fieldErrors.dateFormat}
                                sx={{ ...inputSx, maxWidth: { sm: 420 } }}
                                // The closed field isn't a flex box (no gap): spell the example out instead of reusing the menu row.
                                slotProps={{ select: { renderValue: (value) => `${value as DateFormat} (${dateExample(value as DateFormat)})` } }}
                            >
                                {DATE_FORMATS.map((format) => (
                                    <MenuItem key={format} value={format} sx={{ fontSize: '0.85rem', minHeight: 40, flexWrap: 'wrap', columnGap: 1 }}>
                                        {format}
                                        <Box component="span" sx={{ color: 'var(--mui-palette-text-muted)', fontSize: '0.78rem' }}>
                                            {dateExample(format)}
                                        </Box>
                                    </MenuItem>
                                ))}
                            </TextField>
                        </Box>

                        <FormControl error={Boolean(fieldErrors.timeFormat)} disabled={pending}>
                            <FormLabel id="company-formats-time" sx={{ ...fieldLabelSx, '&.Mui-focused': { color: 'var(--crm-slate-700)' } }}>
                                Time format
                            </FormLabel>
                            <RadioGroup row aria-labelledby="company-formats-time" value={draft.timeFormat} onChange={(e) => setField('timeFormat', e.target.value as TimeFormat)} sx={{ flexWrap: 'wrap' }}>
                                {TIME_FORMATS.map((format) => (
                                    <FormControlLabel key={format} value={format} control={<Radio />} label={`${TIME_FORMAT_LABELS[format]} (${timeExample(format)})`} sx={radioLabelSx} />
                                ))}
                            </RadioGroup>
                            {fieldErrors.timeFormat && <FormHelperText sx={{ mx: 0 }}>{fieldErrors.timeFormat}</FormHelperText>}
                        </FormControl>

                        <FormControl error={Boolean(fieldErrors.numberGrouping)} disabled={pending}>
                            <FormLabel id="company-formats-grouping" sx={{ ...fieldLabelSx, '&.Mui-focused': { color: 'var(--crm-slate-700)' } }}>
                                Number grouping
                            </FormLabel>
                            <RadioGroup
                                row
                                aria-labelledby="company-formats-grouping"
                                value={draft.numberGrouping}
                                onChange={(e) => setField('numberGrouping', e.target.value as NumberGrouping)}
                                sx={{ flexWrap: 'wrap' }}
                            >
                                {NUMBER_GROUPINGS.map((grouping) => (
                                    <FormControlLabel
                                        key={grouping}
                                        value={grouping}
                                        control={<Radio />}
                                        label={`${NUMBER_GROUPING_LABELS[grouping]} (${groupingExample(grouping)})`}
                                        sx={radioLabelSx}
                                    />
                                ))}
                            </RadioGroup>
                            <FormHelperText sx={hintSx}>{fieldErrors.numberGrouping || 'Applies to numbers and amounts. Amounts in words follow it too (lakh / crore or million / billion).'}</FormHelperText>
                        </FormControl>

                        <Box>
                            <Typography sx={fieldLabelSx}>Currency</Typography>
                            <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--crm-slate-900)' }}>
                                {CRM_CURRENCY.name} ({CRM_CURRENCY.symbol}), {CRM_CURRENCY.decimals} decimals
                            </Typography>
                            <Typography sx={hintSx}>Fixed. Opportunities and quotations keep the currency picked on each record.</Typography>
                        </Box>

                        <Typography sx={{ fontSize: '0.75rem', color: 'var(--mui-palette-text-secondary)', lineHeight: 1.5 }}>
                            Applies to all screens (lists, drawers, forms in view mode), the calendar, notifications, PDFs and the morning email. Date
                            pickers follow the browser&apos;s own format; exports and stored values don&apos;t change; notifications already sent keep their
                            wording.
                        </Typography>
                    </Box>

                    {config.customized && (
                        <Box
                            sx={{
                                px: 2,
                                py: 1.5,
                                borderTop: '1px solid var(--mui-palette-border-main)',
                                backgroundColor: 'var(--mui-palette-background-subtle)',
                                display: 'flex',
                                flexWrap: 'wrap',
                                alignItems: 'center',
                                gap: 1.5,
                            }}
                        >
                            <Typography sx={{ flex: 1, minWidth: 200, fontSize: '0.75rem', color: 'var(--mui-palette-text-secondary)' }}>
                                Go back to the styles each screen used before company formats were saved.
                            </Typography>
                            <Button variant="outlined" sx={resetButtonSx} disabled={pending} onClick={() => setConfirmReset(true)}>
                                Reset to CRM defaults
                            </Button>
                        </Box>
                    )}
                </Box>

                <FormatsPreview draft={draft} />
            </Box>

            <ResetDialog open={confirmReset} pending={reset.isPending} onClose={() => setConfirmReset(false)} onConfirm={onReset} />
            <AppToast open={toast.open} message={toast.message} severity={toast.severity} onClose={() => setToast((t) => ({ ...t, open: false }))} />
        </Box>
    );
}
