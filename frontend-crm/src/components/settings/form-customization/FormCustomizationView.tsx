'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Tooltip, Typography } from '@mui/material';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';
import ListAltOutlinedIcon from '@mui/icons-material/ListAltOutlined';
import ViewQuiltOutlinedIcon from '@mui/icons-material/ViewQuiltOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import PublicOutlinedIcon from '@mui/icons-material/PublicOutlined';
import { useQueryClient } from '@tanstack/react-query';
import { AppBreadcrumbsBar } from '@/components/common/AppBreadcrumbsBar';
import { AppToast } from '@/components/common/AppToast';
import { EntityDetailDrawer } from '@/components/common/Drawer';
import { AuditTrailTimeline } from '@/components/common/Drawer/AuditTrailTimeline';
import { ROUTES } from '@/config/constants';
import { useAuth } from '@/context/AuthContext';
import { auditLogKeys } from '@/hooks/queries/useAuditLogs';
import { FormStickyFooter } from '@/components/forms/FormStickyFooter';
import { FormConfigsOverrideContext, useFormConfigsQuery } from '@/hooks/queries/useFormConfigs';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import { CRM_MODULE_KEYS, moduleGroupOf, moduleNavLabel, type CrmModuleKey } from '@/types/formConfig.types';
import { modulesTouchedBy, tabsTouchedBy, viewsTouchedForModule } from './configDraft';
import { GROUP_ICONS, MODULE_ICONS, ModuleHierarchySelector } from './ModuleHierarchySelector';
import { PillTabs, surfaceSx, errorMessage, primaryButtonSx, secondaryButtonSx } from './builderUi';
import { ConfigDraftActionsContext, ConfigDraftChangesContext, changedIds, useConfigDraft } from './useConfigDraft';
import { DropdownManagerPanel, categoriesForModule } from './DropdownManagerPanel';
import { FormFieldsBuilderPanel } from './FormFieldsBuilderPanel';
import { FormLivePreviewPanel } from './FormLivePreviewPanel';

/** Roles allowed to change forms and dropdowns (mirrors FORM_CONFIG_ADMIN_ROLES on the API). */
const ADMIN_ROLES = new Set(['admin', 'administrator', 'super admin']);

type BuilderView = 'dropdowns' | 'fields' | 'preview';

const VIEWS = [
    { key: 'dropdowns' as const, label: 'Dropdowns', icon: <ListAltOutlinedIcon sx={{ fontSize: 17 }} /> },
    { key: 'fields' as const, label: 'Form Fields & Sections', icon: <ViewQuiltOutlinedIcon sx={{ fontSize: 17 }} /> },
    { key: 'preview' as const, label: 'Live Preview', icon: <VisibilityOutlinedIcon sx={{ fontSize: 17 }} /> },
];

/** Asks before leaving the page (reload, close, or an in-app link) while there are unsaved changes. */
function useLeaveGuard(active: boolean) {
    useEffect(() => {
        if (!active) return;
        const message = 'You have unsaved form customization changes. Leave without saving?';
        const onBeforeUnload = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            e.returnValue = message;
        };
        const onClick = (e: MouseEvent) => {
            if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            const anchor = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
            if (!anchor || anchor.target === '_blank' || anchor.origin !== window.location.origin) return;
            if (anchor.pathname === window.location.pathname) return;
            if (!window.confirm(message)) {
                e.preventDefault();
                e.stopPropagation();
            }
        };
        window.addEventListener('beforeunload', onBeforeUnload);
        document.addEventListener('click', onClick, true);
        return () => {
            window.removeEventListener('beforeunload', onBeforeUnload);
            document.removeEventListener('click', onClick, true);
        };
    }, [active]);
}

/**
 * Form Customization: per-module dropdown options, form fields / sections and a live preview. Edits are staged
 * in a draft (shown everywhere on this page, the Live Preview included) and applied for all users on "Save Changes".
 */
export function FormCustomizationView() {
    const { user } = useAuth();
    const canEdit = ADMIN_ROLES.has((user?.role ?? '').toLowerCase());
    const { data: savedConfigs, isLoading, error, refetch } = useFormConfigsQuery();
    const { draft: configs, ops, dirty, saving, actions, save, discard } = useConfigDraft(savedConfigs, refetch);
    const changed = useMemo(() => changedIds(ops), [ops]);
    const [discardOpen, setDiscardOpen] = useState(false);
    useLeaveGuard(dirty);

    const [module, setModule] = useState<CrmModuleKey>('leads');
    const [view, setView] = useState<BuilderView>('dropdowns');
    const [toast, setToast] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' | 'warning' }>({
        open: false,
        message: '',
        severity: 'success',
    });
    const notify = useCallback(
        (message: string, severity: 'success' | 'error' | 'info' | 'warning' = 'success') => setToast({ open: true, message, severity }),
        [],
    );

    const queryClient = useQueryClient();
    /** The admin audit trail drawer starts collapsed to its bookmark on the right edge. */
    const [isDrawerCollapsed, setIsDrawerCollapsed] = useState(true);

    const handleSave = async () => {
        try {
            const count = await save();
            notify(`${count} change${count === 1 ? '' : 's'} saved — forms and dropdowns are updated for all users`, 'success');
        } catch (err) {
            notify(errorMessage(err), 'error');
        } finally {
            // Even a partly failed save may have applied (and audited) some changes.
            void queryClient.invalidateQueries({ queryKey: auditLogKeys.all });
        }
    };

    const fieldCounts = useMemo(
        () => Object.fromEntries(CRM_MODULE_KEYS.map((key) => [key, configs?.fieldsByModule[key]?.filter((f) => f.isActive).length ?? 0])),
        [configs],
    ) as Record<CrmModuleKey, number>;
    const unsavedModules = useMemo(
        () => (configs && savedConfigs ? modulesTouchedBy(ops, savedConfigs, configs) : new Set<CrmModuleKey>()),
        [ops, savedConfigs, configs],
    );
    /** Which views and form tabs of the selected module have unsaved changes (orange dots). */
    const viewsTouched = useMemo(
        () => (configs && savedConfigs ? viewsTouchedForModule(ops, savedConfigs, configs, module) : { dropdowns: false, fields: false }),
        [ops, savedConfigs, configs, module],
    );
    const unsavedTabs = useMemo(
        () => (configs && savedConfigs ? tabsTouchedBy(ops, savedConfigs, configs, module) : new Set<string>()),
        [ops, savedConfigs, configs, module],
    );
    const dropdownCount = useMemo(() => (configs ? categoriesForModule(configs, module).length : 0), [configs, module]);
    const group = moduleGroupOf(module);
    const viewItems = VIEWS.map((v) => ({
        ...v,
        count: !configs ? undefined : v.key === 'dropdowns' ? dropdownCount : v.key === 'fields' ? fieldCounts[module] : undefined,
        hasUnsaved: v.key === 'dropdowns' ? viewsTouched.dropdowns : v.key === 'fields' ? viewsTouched.fields : false,
        unsavedTooltip: v.key === 'dropdowns' ? 'Unsaved dropdown changes on this form' : 'Unsaved field, section or tab changes on this form',
    }));

    return (
        <Box sx={{ px: { xs: 2, md: 3 }, pt: 2, pb: canEdit ? 12 : 4, width: '100%', maxWidth: 1440, mx: 'auto' }}>
            <AppBreadcrumbsBar items={[{ label: 'Administration' }, { label: 'Admin', href: ROUTES.ADMIN }, { label: 'Form Customization' }]} />

            {/* ── Header ── */}
            <Box sx={{ ...surfaceSx, mb: 2, overflow: 'hidden' }}>
                <Box sx={{ px: { xs: 2, md: 3 }, py: 2.25, display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                    <Box
                        sx={{
                            width: 40,
                            height: 40,
                            borderRadius: '10px',
                            backgroundColor: '#eff6ff',
                            border: '1px solid #bfdbfe',
                            color: '#2563eb',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                        }}
                    >
                        <TuneOutlinedIcon />
                    </Box>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography component="h1" sx={{ fontWeight: 700, fontSize: '1.15rem', color: '#0f172a' }}>
                            Form & Dropdown Customization
                        </Typography>
                        <Typography sx={{ fontSize: '0.82rem', color: '#64748b', mt: 0.25 }}>
                            Manage dropdown options, tailor built-in fields and add custom fields for every CRM module. Changes show in the Live Preview straight away and reach every user&apos;s forms when you click Save Changes.
                        </Typography>
                    </Box>
                    <Button
                        variant="outlined"
                        size="small"
                        startIcon={<HistoryOutlinedIcon sx={{ fontSize: 16 }} />}
                        onClick={() => setIsDrawerCollapsed(false)}
                        sx={{ ...secondaryButtonSx, flexShrink: 0, whiteSpace: 'nowrap' }}
                    >
                        Activity / Changes
                    </Button>
                </Box>
                <Box sx={{ px: { xs: 2, md: 3 }, py: 1.5, backgroundColor: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
                    <ModuleHierarchySelector value={module} onChange={setModule} fieldCounts={configs ? fieldCounts : {}} unsaved={unsavedModules} />
                </Box>
            </Box>

            {!canEdit && (
                <Alert severity="info" sx={{ mb: 2, borderRadius: '8px' }}>
                    You can review the configuration, but only administrators can change forms and dropdowns.
                </Alert>
            )}

            {/* ── Active form context + view switcher ── */}
            <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, flexWrap: 'wrap' }}>
                <Box
                    aria-live="polite"
                    sx={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 0.75,
                        px: 1.25,
                        py: 0.6,
                        borderRadius: '8px',
                        border: '1px solid #e2e8f0',
                        backgroundColor: '#ffffff',
                        minWidth: 0,
                        flexWrap: 'wrap',
                    }}
                >
                    <Box component="span" sx={{ display: 'flex', color: '#64748b' }}>
                        {GROUP_ICONS[group.key]}
                    </Box>
                    <Typography component="span" sx={{ fontSize: '0.78rem', fontWeight: 600, color: '#64748b' }}>
                        {group.label}
                    </Typography>
                    <ChevronRightRoundedIcon sx={{ fontSize: 16, color: '#cbd5e1' }} />
                    <Box component="span" sx={{ display: 'flex', color: '#2563eb' }}>
                        {MODULE_ICONS[module]}
                    </Box>
                    <Typography component="span" sx={{ fontSize: '0.84rem', fontWeight: 700, color: '#0f172a' }}>
                        {moduleNavLabel(module)}
                    </Typography>
                    {configs && (
                        <Typography component="span" sx={{ fontSize: '0.74rem', color: '#64748b', ml: 0.5 }}>
                            {dropdownCount} Dropdown{dropdownCount === 1 ? '' : 's'} • {fieldCounts[module]} Field{fieldCounts[module] === 1 ? '' : 's'}
                        </Typography>
                    )}
                    {unsavedModules.has(module) && (
                        <Box component="span" title="Unsaved changes on this form" sx={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: '#f59e0b', boxShadow: '0 0 0 2px #fef3c7', ml: 0.25 }} />
                    )}
                </Box>
                <PillTabs items={viewItems} value={view} onChange={setView} />
            </Box>

            {isLoading && (
                <Box sx={{ ...surfaceSx, py: 8, display: 'flex', justifyContent: 'center' }}>
                    <CircularProgress size={28} />
                </Box>
            )}

            {error && !configs && (
                <Alert
                    severity="error"
                    sx={{ borderRadius: '8px' }}
                    action={
                        <Button color="inherit" size="small" onClick={() => void refetch()}>
                            Retry
                        </Button>
                    }
                >
                    Couldn&apos;t load the form configuration: {errorMessage(error)}
                </Alert>
            )}

            {configs && (
                <FormConfigsOverrideContext.Provider value={configs}>
                    <ConfigDraftActionsContext.Provider value={actions}>
                        <ConfigDraftChangesContext.Provider value={changed}>
                            {view === 'dropdowns' && <DropdownManagerPanel module={module} configs={configs} canEdit={canEdit && !saving} notify={notify} />}
                            {view === 'fields' && <FormFieldsBuilderPanel module={module} configs={configs} canEdit={canEdit && !saving} notify={notify} unsavedTabs={unsavedTabs} />}
                            {view === 'preview' && <FormLivePreviewPanel module={module} configs={configs} unsavedCount={ops.length} unsavedTabs={unsavedTabs} />}
                        </ConfigDraftChangesContext.Provider>
                    </ConfigDraftActionsContext.Provider>
                </FormConfigsOverrideContext.Provider>
            )}

            {canEdit && configs && (
                <FormStickyFooter
                    onCancel={() => setDiscardOpen(true)}
                    onSave={() => void handleSave()}
                    submitting={saving}
                    saveLabel={saving ? 'Saving…' : 'Save Changes'}
                    cancelLabel="Discard Changes"
                    saveDisabled={!dirty}
                    saveDisabledTooltip="No unsaved changes"
                    cancelDisabled={!dirty}
                    status={<DraftStatus summaries={ops.map((op) => op.summary)} saving={saving} />}
                />
            )}

            {/* Admin audit trail: who changed which form / dropdown, when, and with which role. */}
            <EntityDetailDrawer
                open={true}
                persistent
                isCollapsed={isDrawerCollapsed}
                onToggleCollapse={() => setIsDrawerCollapsed((prev) => !prev)}
                onClose={() => setIsDrawerCollapsed(true)}
                hideBackdrop={true}
                showBookmark={true}
                title="Form Customization"
                subtitle={`${moduleNavLabel(module)} • Admin Audit Trail`}
                avatarIcon={<TuneOutlinedIcon sx={{ fontSize: 22 }} />}
                verified={true}
                badges={[
                    { label: user?.role || 'Admin', backgroundColor: '#eff6ff', color: '#1d4ed8', borderColor: '#bfdbfe' },
                    { label: moduleNavLabel(module), backgroundColor: '#f1f5f9', color: '#475569', borderColor: '#e2e8f0' },
                ]}
                statusText={dirty ? `${ops.length} unsaved change${ops.length === 1 ? '' : 's'} in draft` : 'All form configurations synced'}
                tabs={[
                    {
                        id: 'all-modules',
                        label: 'All Modules',
                        icon: <PublicOutlinedIcon sx={{ fontSize: 16 }} />,
                        content: <AuditTrailTimeline entityType="form-configs" entityId="all" />,
                    },
                ]}
                includeChangesTab={true}
                auditEntity={{ type: 'form-configs', id: module }}
                defaultTabIndex={1}
            />

            <Dialog open={discardOpen} onClose={() => setDiscardOpen(false)} maxWidth="xs" fullWidth slotProps={{ paper: { sx: { borderRadius: '12px' } } }}>
                <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem' }}>Discard unsaved changes?</DialogTitle>
                <DialogContent>
                    <Typography sx={{ fontSize: '0.85rem', color: '#475569' }}>
                        {ops.length} unsaved change{ops.length === 1 ? '' : 's'} will be thrown away and the builder goes back to the saved configuration.
                    </Typography>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={() => setDiscardOpen(false)} variant="outlined" sx={secondaryButtonSx}>
                        Keep Editing
                    </Button>
                    <Button
                        variant="contained"
                        sx={{ ...primaryButtonSx, background: 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)' }}
                        onClick={() => {
                            discard();
                            setDiscardOpen(false);
                            notify('Unsaved changes discarded', 'info');
                        }}
                    >
                        Discard
                    </Button>
                </DialogActions>
            </Dialog>

            <AppToast open={toast.open} message={toast.message} severity={toast.severity} onClose={() => setToast((t) => ({ ...t, open: false }))} />
        </Box>
    );
}

/** Left side of the save bar: unsaved-change count (hover for the list) or "all saved". */
function DraftStatus({ summaries, saving }: { summaries: string[]; saving: boolean }) {
    const count = summaries.length;
    const dot = (color: string) => <Box sx={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />;
    if (saving) {
        return (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CircularProgress size={12} />
                <Typography sx={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 500 }}>Saving changes…</Typography>
            </Box>
        );
    }
    if (count === 0) {
        return (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {dot('#22c55e')}
                <Typography sx={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 500 }}>All changes saved</Typography>
            </Box>
        );
    }
    const shown = summaries.slice(0, 12);
    return (
        <Tooltip
            arrow
            placement="top-start"
            title={
                <Box component="ul" sx={{ m: 0, pl: 2, py: 0.5 }}>
                    {shown.map((text, i) => (
                        <li key={i} style={{ fontSize: '0.75rem' }}>
                            {text}
                        </li>
                    ))}
                    {summaries.length > shown.length && <li style={{ fontSize: '0.75rem' }}>…and {summaries.length - shown.length} more</li>}
                </Box>
            }
        >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, cursor: 'default' }}>
                {dot('#f59e0b')}
                <Typography sx={{ fontSize: '0.78rem', color: '#b45309', fontWeight: 600 }}>
                    {count} unsaved change{count === 1 ? '' : 's'} — showing in the preview, not yet applied to the CRM
                </Typography>
            </Box>
        </Tooltip>
    );
}
