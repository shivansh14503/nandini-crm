'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
    Alert,
    Box,
    Button,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    MenuItem,
    Skeleton,
    Switch,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';
import DashboardCustomizeOutlinedIcon from '@mui/icons-material/DashboardCustomizeOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import { AppToast } from '@/components/common/AppToast';
import { EntityDetailDrawer } from '@/components/common/Drawer';
import { SCORECARD_MODULES, useDefaultScorecard } from '@/components/common/scorecard/scorecardModules';
import { ROUTES } from '@/config/constants';
import { auditLogKeys } from '@/hooks/queries/useAuditLogs';
import { useFormConfigs, useFormConfigsQuery } from '@/hooks/queries/useFormConfigs';
import { SCORECARDS_QUERY_KEY, useResetScorecard, useSaveScorecard, useScorecards } from '@/hooks/queries/useScorecards';
import { ApiClientError } from '@/services/apiClient';
import { FLOAT_INSET, NAVBAR_HEIGHT } from '@/theme/glass';
import { getModuleColor, moduleKeyFrom } from '@/theme/moduleColors';
import { CRM_MODULE_GROUPS, moduleNavLabel, type CrmModuleKey } from '@/types/formConfig.types';
import type { ScorecardConfig } from '@/types/scorecard.types';
import { Badge, errorMessage, primaryButtonSx, secondaryButtonSx, surfaceSx, type BadgeTone } from '../form-customization/builderUi';
import { GROUP_ICONS, MODULE_ICONS } from '../form-customization/ModuleHierarchySelector';
import { useLeaveGuard } from '../useLeaveGuard';
import { ScorecardEditor } from './ScorecardEditor';
import { ScorecardPreview } from './ScorecardPreview';
import { draftMode, draftPayload, useScorecardDraft, type DraftMode } from './scorecardDraft';

/**
 * Admin › List Scorecards: the summary cards above each module's list. Pick a module, switch its cards on or off,
 * and set them up (field, order, colors, totals) with a live preview over the module's records. One draft at a
 * time; Save makes it what every user's list shows, Discard goes back to what is saved.
 */

const LEAVE_MESSAGE = 'You have unsaved scorecard changes. Leave without saving?';

/** The module rail stays in view just below the floating navbar. */
const RAIL_TOP = FLOAT_INSET + NAVBAR_HEIGHT + 12;

const STATUS: Record<DraftMode, { label: string; tone: BadgeTone }> = {
    custom: { label: 'Custom', tone: 'custom' },
    builtin: { label: 'Built-in', tone: 'system' },
    off: { label: 'Off', tone: 'neutral' },
};

/** What a module's list shows with what is saved. */
function savedMode(module: CrmModuleKey, saved: ScorecardConfig | undefined): DraftMode {
    if (saved) return saved.enabled ? 'custom' : 'off';
    return SCORECARD_MODULES[module].builtInCards ? 'builtin' : 'off';
}

const formatSavedAt = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
};

const moduleTint = (module: CrmModuleKey) => getModuleColor(moduleKeyFrom(module) ?? 'leads');

function ModuleIconTile({ module, size = 32 }: { module: CrmModuleKey; size?: number }) {
    const tint = moduleTint(module);
    return (
        <Box
            sx={{
                width: size,
                height: size,
                flexShrink: 0,
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: tint.main,
                backgroundColor: tint.soft,
                border: `1px solid ${tint.border}`,
            }}
        >
            {MODULE_ICONS[module]}
        </Box>
    );
}

/** Orange dot for a module with unsaved changes. */
const UnsavedDot = () => (
    <Tooltip title="Unsaved changes" arrow>
        <Box component="span" aria-label="Unsaved changes" sx={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: 'var(--crm-orange-500)', flexShrink: 0 }} />
    </Tooltip>
);

export function ScorecardsAdminView({ module }: { module: CrmModuleKey }) {
    const router = useRouter();
    const queryClient = useQueryClient();
    const scorecardsQuery = useScorecards();
    const formConfigsQuery = useFormConfigsQuery();
    const configs = useFormConfigs();
    const savedAll = scorecardsQuery.data;
    const saved = savedAll?.[module] ?? null;
    const defaults = useDefaultScorecard(module);
    const { draft, base, dirty, outdated, version, update, edit, discard, settle } = useScorecardDraft(module, saved, configs, defaults);
    const saveMutation = useSaveScorecard(module);
    const resetMutation = useResetScorecard(module);

    const [pendingModule, setPendingModule] = useState<CrmModuleKey | null>(null);
    const [confirmReset, setConfirmReset] = useState(false);
    const [activityOpen, setActivityOpen] = useState(false);
    const [toast, setToast] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' }>({ open: false, message: '', severity: 'success' });
    const notify = (message: string, severity: 'success' | 'error' | 'info' = 'success') => setToast({ open: true, message, severity });

    useLeaveGuard(dirty, LEAVE_MESSAGE);

    const loading = scorecardsQuery.isPending || formConfigsQuery.isPending;
    const loadError = scorecardsQuery.error ?? formConfigsQuery.error;
    const busy = saveMutation.isPending || resetMutation.isPending;
    const mode = draftMode(draft);
    const info = SCORECARD_MODULES[module];
    const label = moduleNavLabel(module);

    const openModule = (next: CrmModuleKey) => router.replace(ROUTES.LIST_SCORECARDS_FOR(next), { scroll: false });
    const requestModule = (next: CrmModuleKey) => {
        if (next === module) return;
        if (dirty) setPendingModule(next);
        else openModule(next);
    };

    const refreshAudit = () => void queryClient.invalidateQueries({ queryKey: auditLogKeys.all });

    const handleSave = async () => {
        try {
            const nowSaved = await saveMutation.mutateAsync(draftPayload(draft, version));
            settle(nowSaved);
            notify(`${label} scorecard saved. Every user's list shows it now.`);
        } catch (err) {
            if (err instanceof ApiClientError && err.status === 409) {
                // Someone else saved (or reset) meanwhile: load their version so the banner can offer it.
                void queryClient.invalidateQueries({ queryKey: SCORECARDS_QUERY_KEY });
            }
            notify(errorMessage(err, 'Could not save the scorecard.'), 'error');
        } finally {
            refreshAudit();
        }
    };

    const handleReset = async () => {
        setConfirmReset(false);
        try {
            await resetMutation.mutateAsync();
            settle(null);
            notify(info.builtInCards ? `${label} list is back to its built-in cards.` : `${label} scorecard removed. The list shows no cards.`);
        } catch (err) {
            notify(errorMessage(err, 'Could not reset the scorecard.'), 'error');
        } finally {
            refreshAudit();
        }
    };

    const statusOf = (m: CrmModuleKey) => (m === module ? mode : savedMode(m, savedAll?.[m]));

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
                    <DashboardCustomizeOutlinedIcon />
                </Box>
                {/* Phones: the text keeps the row beside the icon and the button wraps below it. */}
                <Box sx={{ flex: 1, minWidth: { xs: 'calc(100% - 56px)', sm: 220 } }}>
                    <Typography component="h1" sx={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--crm-slate-900)' }}>
                        List Scorecards
                    </Typography>
                    <Typography sx={{ fontSize: '0.8rem', color: 'var(--mui-palette-text-secondary)', mt: 0.25 }}>
                        Choose which lists show summary cards above their records, what the cards count, their order and colors. Changes reach
                        every user&apos;s list when you save.
                    </Typography>
                </Box>
                <Button
                    variant="outlined"
                    size="small"
                    startIcon={<HistoryOutlinedIcon sx={{ fontSize: 16 }} />}
                    onClick={() => setActivityOpen(true)}
                    sx={{ ...secondaryButtonSx, flexShrink: 0, whiteSpace: 'nowrap', minHeight: 34, ml: { xs: '56px', sm: 0 } }}
                >
                    Activity / Changes
                </Button>
            </Box>

            {loadError && (
                <Alert severity="error" sx={{ borderRadius: '10px', fontSize: '0.8rem' }}>
                    {errorMessage(loadError, 'Could not load the scorecard settings.')}
                </Alert>
            )}

            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: '248px minmax(0, 1fr)' }, alignItems: 'start' }}>
                <ModulePicker module={module} statusOf={statusOf} unsaved={dirty} onSelect={requestModule} />

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                    {/* Module bar: on / off, status, reset */}
                    <Box sx={{ ...surfaceSx, p: { xs: 1.5, md: 2 }, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: { xs: 1.25, md: 2 } }}>
                        <ModuleIconTile module={module} size={36} />
                        <Box sx={{ flex: 1, minWidth: { xs: 'calc(100% - 52px)', sm: 200 } }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                                <Typography component="h2" sx={{ fontWeight: 700, fontSize: '0.98rem', color: 'var(--crm-slate-900)' }}>
                                    {label} cards
                                </Typography>
                                <Badge tone={STATUS[mode].tone}>{STATUS[mode].label}</Badge>
                                {dirty && <Badge tone="unsaved">Unsaved</Badge>}
                            </Box>
                            <Typography sx={{ fontSize: '0.75rem', color: 'var(--mui-palette-text-secondary)', mt: 0.25 }}>
                                {saved?.updatedAt
                                    ? `Last saved${saved.updatedBy ? ` by ${saved.updatedBy}` : ''}, ${formatSavedAt(saved.updatedAt)}`
                                    : info.builtInCards
                                      ? 'Not set up yet: the list shows its built-in cards.'
                                      : 'Not set up yet: the list shows no cards.'}
                            </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', ml: { xs: 0, sm: 'auto' } }}>
                            <Box
                                component="label"
                                sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 0.5,
                                    pl: 1.25,
                                    pr: 0.25,
                                    minHeight: 36,
                                    borderRadius: '8px',
                                    border: '1px solid var(--mui-palette-border-main)',
                                    backgroundColor: draft.enabled ? 'var(--mui-palette-primary-soft)' : 'var(--mui-palette-background-paper)',
                                    borderColor: draft.enabled ? 'var(--mui-palette-primary-softBorder)' : 'var(--mui-palette-border-main)',
                                    cursor: loading || busy ? 'default' : 'pointer',
                                }}
                            >
                                <Typography component="span" sx={{ fontSize: '0.8rem', fontWeight: 600, color: draft.enabled ? 'var(--crm-text-blue-900)' : 'var(--crm-slate-700)' }}>
                                    Show cards on the list
                                </Typography>
                                {/* On / off only: switching keeps the built-in cards built-in (see useScorecardDraft's `custom`). */}
                                <Switch
                                    checked={draft.enabled}
                                    disabled={loading || busy}
                                    onChange={(e) => update((d) => ({ ...d, enabled: e.target.checked }))}
                                    slotProps={{ input: { 'aria-label': `Show cards on the ${label} list` } }}
                                />
                            </Box>
                            {saved && (
                                <Button
                                    size="small"
                                    startIcon={<RestartAltIcon sx={{ fontSize: 17 }} />}
                                    onClick={() => setConfirmReset(true)}
                                    disabled={busy}
                                    sx={{
                                        textTransform: 'none',
                                        fontWeight: 600,
                                        fontSize: '0.8rem',
                                        minHeight: 36,
                                        borderRadius: '8px',
                                        color: 'var(--mui-palette-text-secondary)',
                                        '&:hover': { color: 'var(--mui-palette-error-main)', backgroundColor: 'var(--mui-palette-error-soft)' },
                                    }}
                                >
                                    Reset to default
                                </Button>
                            )}
                        </Box>
                    </Box>

                    {outdated && (
                        <Alert
                            severity="warning"
                            sx={{ borderRadius: '10px', fontSize: '0.8rem', alignItems: 'center' }}
                            action={
                                <Button size="small" onClick={discard} sx={{ textTransform: 'none', fontWeight: 700, color: 'inherit', whiteSpace: 'nowrap' }}>
                                    Load latest
                                </Button>
                            }
                        >
                            {saved
                                ? `${saved.updatedBy ?? 'Another admin'} saved the ${label} scorecard while you were editing. Load their version, then make your changes again.`
                                : `Someone reset the ${label} scorecard while you were editing. Load the latest settings, then make your changes again.`}
                        </Alert>
                    )}

                    {mode === 'builtin' && !loading && (
                        <Alert severity="info" sx={{ borderRadius: '10px', fontSize: '0.8rem' }}>
                            {module === 'leads'
                                ? 'The Leads list shows its built-in cards (New, In Process, Converted and Lost). '
                                : `The ${label} list shows its built-in cards, one per ${module === 'contracts' ? 'status' : 'stage'}. `}
                            Change any setting below to use your own cards instead.
                        </Alert>
                    )}
                    {mode === 'off' && saved && !saved.enabled && info.builtInCards && !loading && (
                        <Alert severity="info" sx={{ borderRadius: '10px', fontSize: '0.8rem' }}>
                            Switching the cards back on shows the cards set up below. Use Reset to default for the list&apos;s built-in cards.
                        </Alert>
                    )}

                    {loading ? (
                        <>
                            <Skeleton variant="rounded" height={150} sx={{ borderRadius: '12px' }} />
                            <Skeleton variant="rounded" height={360} sx={{ borderRadius: '12px' }} />
                        </>
                    ) : (
                        <>
                            <ScorecardPreview module={module} configs={configs} draft={draft} mode={mode} defaults={defaults} />
                            <ScorecardEditor module={module} configs={configs} draft={draft} base={base} edit={edit} disabled={busy} saved={Boolean(saved)} />
                        </>
                    )}

                    {/* Save bar: stays in view at the bottom of the screen while the page scrolls. */}
                    <Box
                        sx={{
                            ...surfaceSx,
                            position: 'sticky',
                            bottom: { xs: 8, md: 16 },
                            zIndex: 5,
                            px: { xs: 1.5, md: 2 },
                            py: 1.25,
                            display: 'flex',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: 1,
                            boxShadow: dirty ? '0 8px 24px -8px rgba(15, 23, 42, 0.22)' : surfaceSx.boxShadow,
                            borderColor: dirty ? 'var(--crm-orange-200)' : 'var(--mui-palette-border-main)',
                        }}
                    >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, minWidth: 160 }}>
                            {dirty && <UnsavedDot />}
                            <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: dirty ? 'var(--crm-orange-700)' : 'var(--mui-palette-text-secondary)' }}>
                                {dirty ? `Unsaved changes to the ${label} cards` : 'No unsaved changes'}
                            </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', gap: 1, ml: 'auto' }}>
                            <Button variant="outlined" size="small" onClick={discard} disabled={!dirty || busy} sx={{ ...secondaryButtonSx, minHeight: 36 }}>
                                Discard
                            </Button>
                            <Tooltip
                                title={
                                    outdated
                                        ? 'Load the latest version first'
                                        : dirty && !draft.fieldKey
                                          ? 'Pick a dropdown field first'
                                          : ''
                                }
                                arrow
                            >
                                <span>
                                    <Button
                                        variant="contained"
                                        size="small"
                                        onClick={() => void handleSave()}
                                        disabled={!dirty || busy || outdated || !draft.fieldKey}
                                        startIcon={saveMutation.isPending ? <CircularProgress size={14} color="inherit" /> : <SaveOutlinedIcon sx={{ fontSize: 17 }} />}
                                        sx={{
                                            ...primaryButtonSx,
                                            color: '#ffffff',
                                            minHeight: 36,
                                            px: 2.25,
                                            '&.Mui-disabled': { background: 'var(--mui-palette-background-hover)', color: 'var(--mui-palette-text-muted)' },
                                        }}
                                    >
                                        {saveMutation.isPending ? 'Saving…' : 'Save'}
                                    </Button>
                                </span>
                            </Tooltip>
                        </Box>
                    </Box>
                </Box>
            </Box>

            {/* Unsaved edits when picking another module */}
            <Dialog open={Boolean(pendingModule)} onClose={() => setPendingModule(null)} maxWidth="xs" fullWidth slotProps={{ paper: { sx: { borderRadius: '12px', m: 2, width: 'calc(100% - 32px)' } } }}>
                <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', color: 'var(--crm-slate-900)' }}>Discard unsaved changes?</DialogTitle>
                <DialogContent>
                    <Typography sx={{ fontSize: '0.85rem', color: 'var(--crm-slate-600)' }}>
                        Your changes to the {label} cards aren&apos;t saved. Open {pendingModule ? moduleNavLabel(pendingModule) : 'the other module'} and throw them away?
                    </Typography>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
                    <Button onClick={() => setPendingModule(null)} variant="outlined" sx={secondaryButtonSx}>
                        Keep editing
                    </Button>
                    <Button
                        variant="contained"
                        sx={{ ...primaryButtonSx, color: '#ffffff' }}
                        onClick={() => {
                            const next = pendingModule;
                            setPendingModule(null);
                            if (next) openModule(next);
                        }}
                    >
                        Discard and open
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Reset to default */}
            <Dialog open={confirmReset} onClose={() => setConfirmReset(false)} maxWidth="xs" fullWidth slotProps={{ paper: { sx: { borderRadius: '12px', m: 2, width: 'calc(100% - 32px)' } } }}>
                <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', color: 'var(--crm-slate-900)' }}>Reset the {label} cards?</DialogTitle>
                <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <Typography sx={{ fontSize: '0.85rem', color: 'var(--crm-slate-600)' }}>
                        {info.builtInCards
                            ? `The ${label} list goes back to its built-in cards.`
                            : `The ${label} list stops showing cards.`}{' '}
                        The saved field, order, colors and totals are removed, and the list column and drawer colors switch off.
                    </Typography>
                    {dirty && <Typography sx={{ fontSize: '0.85rem', color: 'var(--crm-slate-600)' }}>Your unsaved changes are thrown away too.</Typography>}
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
                    <Button onClick={() => setConfirmReset(false)} variant="outlined" sx={secondaryButtonSx}>
                        Cancel
                    </Button>
                    <Button
                        variant="contained"
                        onClick={() => void handleReset()}
                        sx={{
                            ...primaryButtonSx,
                            color: '#ffffff',
                            background: 'linear-gradient(135deg, var(--crm-red-600) 0%, var(--crm-red-500) 100%)',
                            '&:hover': { background: 'linear-gradient(135deg, var(--crm-red-700) 0%, var(--crm-red-600) 100%)', boxShadow: '0 2px 6px rgba(239,68,68,0.3)' },
                        }}
                    >
                        Reset
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Admin audit trail: who changed which list's cards, when. */}
            <EntityDetailDrawer
                open={activityOpen}
                onClose={() => setActivityOpen(false)}
                showBookmark={false}
                title="List Scorecards"
                subtitle={`${label} • Admin Audit Trail`}
                avatarIcon={<DashboardCustomizeOutlinedIcon sx={{ fontSize: 22 }} />}
                verified={true}
                badges={[{ label, backgroundColor: 'var(--mui-palette-background-hover)', color: 'var(--crm-slate-600)', borderColor: 'var(--mui-palette-border-main)' }]}
                includeChangesTab={true}
                auditEntity={{ type: 'scorecards', id: module }}
            />

            <AppToast open={toast.open} message={toast.message} severity={toast.severity} onClose={() => setToast((t) => ({ ...t, open: false }))} />
        </Box>
    );
}

/**
 * The modules, with what each list shows now: a rail grouped as in the navbar on large screens, a dropdown on
 * smaller ones.
 */
function ModulePicker({
    module,
    statusOf,
    unsaved,
    onSelect,
}: {
    module: CrmModuleKey;
    statusOf: (module: CrmModuleKey) => DraftMode;
    /** The selected module has unsaved changes. */
    unsaved: boolean;
    onSelect: (module: CrmModuleKey) => void;
}) {
    return (
        <>
            {/* Phones and tablets: a dropdown */}
            <Box sx={{ display: { xs: 'block', lg: 'none' }, ...surfaceSx, p: 1.5 }}>
                <TextField
                    select
                    fullWidth
                    size="small"
                    label="List"
                    value={module}
                    onChange={(e) => onSelect(e.target.value as CrmModuleKey)}
                    slotProps={{
                        select: {
                            renderValue: (value) => (
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                                    <ModuleIconTile module={value as CrmModuleKey} size={24} />
                                    <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 600 }}>
                                        {moduleNavLabel(value as CrmModuleKey)}
                                    </Box>
                                    <Badge tone={STATUS[statusOf(value as CrmModuleKey)].tone}>{STATUS[statusOf(value as CrmModuleKey)].label}</Badge>
                                    {unsaved && <UnsavedDot />}
                                </Box>
                            ),
                        },
                    }}
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px', backgroundColor: 'var(--mui-palette-background-paper)' } }}
                >
                    {CRM_MODULE_GROUPS.flatMap((group) => [
                        <MenuItem key={`group-${group.key}`} disabled sx={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', opacity: '1 !important', color: 'var(--mui-palette-text-muted)', minHeight: 32 }}>
                            {group.label}
                        </MenuItem>,
                        ...group.modules.map((m) => (
                            <MenuItem key={m.key} value={m.key} sx={{ gap: 1, minHeight: 44 }}>
                                <ModuleIconTile module={m.key} size={26} />
                                <Box component="span" sx={{ flex: 1, fontSize: '0.85rem', fontWeight: 600 }}>
                                    {m.label}
                                </Box>
                                <Badge tone={STATUS[statusOf(m.key)].tone}>{STATUS[statusOf(m.key)].label}</Badge>
                            </MenuItem>
                        )),
                    ])}
                </TextField>
            </Box>

            {/* Large screens: a rail */}
            <Box component="nav" aria-label="Lists" sx={{ display: { xs: 'none', lg: 'block' }, ...surfaceSx, py: 1, position: 'sticky', top: RAIL_TOP }}>
                {CRM_MODULE_GROUPS.map((group) => (
                    <Box key={group.key} sx={{ '& + &': { mt: 0.75 } }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 2, py: 0.75, color: 'var(--mui-palette-text-muted)' }}>
                            {GROUP_ICONS[group.key]}
                            <Typography component="span" sx={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                                {group.label}
                            </Typography>
                        </Box>
                        {group.modules.map((m) => {
                            const active = m.key === module;
                            const status = STATUS[statusOf(m.key)];
                            return (
                                <Box
                                    key={m.key}
                                    component="button"
                                    type="button"
                                    aria-current={active ? 'page' : undefined}
                                    onClick={() => onSelect(m.key)}
                                    sx={{
                                        all: 'unset',
                                        boxSizing: 'border-box',
                                        width: 'calc(100% - 16px)',
                                        mx: 1,
                                        px: 1,
                                        py: 0.75,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 1,
                                        borderRadius: '8px',
                                        cursor: 'pointer',
                                        border: '1px solid',
                                        borderColor: active ? 'var(--mui-palette-border-strong)' : 'transparent',
                                        backgroundColor: active ? 'var(--mui-palette-primary-soft)' : 'transparent',
                                        transition: 'all 0.15s ease',
                                        '&:hover': active ? undefined : { backgroundColor: 'var(--mui-palette-background-hover)' },
                                        '&:focus-visible': { boxShadow: '0 0 0 3px rgb(var(--crm-accent-rgb) / 0.22)' },
                                    }}
                                >
                                    <ModuleIconTile module={m.key} size={28} />
                                    <Typography
                                        component="span"
                                        sx={{
                                            flex: 1,
                                            minWidth: 0,
                                            fontSize: '0.84rem',
                                            fontWeight: active ? 700 : 600,
                                            color: active ? 'var(--crm-text-blue-900)' : 'var(--crm-slate-700)',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                        }}
                                    >
                                        {m.label}
                                    </Typography>
                                    {active && unsaved && <UnsavedDot />}
                                    <Badge tone={status.tone}>{status.label}</Badge>
                                </Box>
                            );
                        })}
                    </Box>
                ))}
            </Box>
        </>
    );
}
