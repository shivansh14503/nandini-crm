'use client';

import React, { useMemo, useState } from 'react';
import { Alert, Autocomplete, Box, Button, Skeleton, TextField, Typography } from '@mui/material';
import ApartmentOutlinedIcon from '@mui/icons-material/ApartmentOutlined';
import { AppToast } from '@/components/common/AppToast';
import { errorMessage, inputSx, panelHeaderSx, primaryButtonSx, secondaryButtonSx, surfaceSx } from '@/components/settings/form-customization/builderUi';
import { useLeaveGuard } from '@/components/settings/useLeaveGuard';
import { useCompanySettings, useSaveCompanySettings } from '@/hooks/queries/useCompanySettings';
import { useMasterData } from '@/hooks/queries/useMasterData';
import { getStateOptionLabelsForCountry } from '@/data/addressMaster';
import { ApiClientError } from '@/services/apiClient';
import { findCrmUser } from '@/services/masterData.store';
import { fmtInstant } from '@/utils/formats';

const LEAVE_MESSAGE = 'You have unsaved company detail changes. Leave this page and lose them?';
const fieldLabelSx = { fontSize: '0.78rem', fontWeight: 600, color: 'var(--crm-slate-700)', mb: 0.5, display: 'block' } as const;
const hintSx = { fontSize: '0.72rem', color: 'var(--mui-palette-text-secondary)', mt: 0.75, lineHeight: 1.5 } as const;
const buttonSize = { minHeight: 40 } as const;

/** The server's message for the Company State field (400 VALIDATION_ERROR `errors[].path`). */
function stateErrorOf(err: unknown): string | undefined {
    if (!(err instanceof ApiClientError)) return undefined;
    return err.details?.errors?.find((e) => e.path?.[0] === 'companyState')?.message;
}

function LoadingState() {
    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }} aria-busy="true">
            <Skeleton variant="rounded" height={84} sx={{ borderRadius: '12px' }} />
            <Skeleton variant="rounded" height={220} sx={{ borderRadius: '12px' }} />
        </Box>
    );
}

/**
 * Admin › Company Details: our company's state. Line items (Jira CRM-111) charge IGST to a customer in another state
 * and CGST + SGST to one in the same state; records saved while no state was set take the split once it is saved.
 */
export function CompanyDetailsView() {
    const query = useCompanySettings();
    const save = useSaveCompanySettings();
    // Re-renders once the user directory loads, so "Last changed by" shows the admin's name.
    useMasterData();
    const states = useMemo(() => getStateOptionLabelsForCountry('IN'), []);
    const [draft, setDraft] = useState<string | null>(null);
    const [fieldError, setFieldError] = useState<string | undefined>();
    const [toast, setToast] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });

    // Take the server copy on first load and after every save (React's "adjust state while rendering" pattern).
    const [syncedFrom, setSyncedFrom] = useState<typeof query.data>(undefined);
    if (query.data && query.data !== syncedFrom) {
        setSyncedFrom(query.data);
        setDraft(query.data.companyState);
        setFieldError(undefined);
    }

    const savedState = query.data?.companyState ?? '';
    const dirty = draft !== null && draft !== savedState;
    useLeaveGuard(dirty, LEAVE_MESSAGE);

    if (query.isPending || (draft === null && !query.isError)) return <LoadingState />;
    if (draft === null || !query.data) {
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
                {errorMessage(query.error, 'Could not load company details.')}
            </Alert>
        );
    }

    const config = query.data;
    const changedBy = config.updatedBy ? findCrmUser(config.updatedBy)?.name || config.updatedBy : null;
    const changedAt = fmtInstant(config.updatedAt);
    const options = draft && !states.includes(draft) ? [...states, draft] : states;

    const onSave = async () => {
        setFieldError(undefined);
        try {
            await save.mutateAsync({ companyState: draft });
            setToast({ open: true, message: 'Company details saved.', severity: 'success' });
        } catch (err) {
            setFieldError(stateErrorOf(err));
            setToast({ open: true, message: errorMessage(err, 'Could not save company details.'), severity: 'error' });
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
                    <ApartmentOutlinedIcon />
                </Box>
                <Box sx={{ flex: 1, minWidth: { xs: 0, sm: 220 }, flexBasis: { xs: 'calc(100% - 56px)', sm: 'auto' } }}>
                    <Typography component="h1" sx={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--crm-slate-900)' }}>
                        Company Details
                    </Typography>
                    <Typography sx={{ fontSize: '0.8rem', color: 'var(--mui-palette-text-secondary)', mt: 0.25 }}>
                        Your company&apos;s state decides how GST is charged on opportunities and quotations.
                    </Typography>
                </Box>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, width: { xs: '100%', sm: 'auto' } }}>
                    <Button
                        variant="outlined"
                        sx={{ ...secondaryButtonSx, ...buttonSize, flex: { xs: 1, sm: 'none' } }}
                        disabled={!dirty || save.isPending}
                        onClick={() => {
                            setDraft(savedState);
                            setFieldError(undefined);
                        }}
                    >
                        Cancel
                    </Button>
                    <Button variant="contained" sx={{ ...primaryButtonSx, ...buttonSize, flex: { xs: 1, sm: 'none' } }} disabled={!dirty || save.isPending} onClick={onSave}>
                        {save.isPending ? 'Saving…' : 'Save changes'}
                    </Button>
                </Box>
            </Box>

            {config.companyState ? (
                <Alert severity="success" sx={{ borderRadius: '10px', fontSize: '0.8rem' }}>
                    Company State is {config.companyState}. Last changed{changedBy ? ` by ${changedBy}` : ''}
                    {changedAt ? ` on ${changedAt}` : ''}.
                </Alert>
            ) : (
                <Alert severity="info" sx={{ borderRadius: '10px', fontSize: '0.8rem' }}>
                    Not set yet. Line items show a single GST line until a Company State is saved; then they split it into IGST or CGST + SGST.
                </Alert>
            )}

            <Box component="section" aria-labelledby="company-details-gst-title" sx={{ ...surfaceSx, overflow: 'hidden', minWidth: 0 }}>
                <Box sx={panelHeaderSx}>
                    <Typography id="company-details-gst-title" component="h2" sx={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--crm-slate-900)' }}>
                        GST
                    </Typography>
                    <Typography sx={{ fontSize: '0.75rem', color: 'var(--mui-palette-text-secondary)' }}>One setting for the whole company.</Typography>
                </Box>
                <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <Typography component="label" htmlFor="company-details-state" sx={fieldLabelSx}>
                        Company State
                    </Typography>
                    <Autocomplete
                        id="company-details-state"
                        options={options}
                        value={draft || null}
                        onChange={(_, value) => {
                            setDraft(value ?? '');
                            setFieldError(undefined);
                        }}
                        disabled={save.isPending}
                        size="small"
                        sx={{ maxWidth: { sm: 420 } }}
                        renderInput={(params) => <TextField {...params} placeholder="Pick a state or union territory" error={Boolean(fieldError)} helperText={fieldError} sx={inputSx} />}
                    />
                    <Typography sx={hintSx}>
                        The customer&apos;s state is its shipping address state, or the billing state when no shipping state is filled. A customer in another
                        state is charged IGST; one in the same state (or with no state) is charged CGST + SGST, half the GST rate each. Each record keeps the
                        split it was saved with; records saved while no Company State was set take it when you save one.
                    </Typography>
                </Box>
            </Box>

            <AppToast open={toast.open} message={toast.message} severity={toast.severity} onClose={() => setToast((t) => ({ ...t, open: false }))} />
        </Box>
    );
}
