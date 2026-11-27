'use client';

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Box, Paper, Typography, type SxProps, type Theme } from '@mui/material';
import { type BreadcrumbItem } from './AppBreadcrumbs';
import { FormHeader } from '../forms/FormHeader';
import { CommonRecordDetailView, type CommonRecordDetailViewProps } from './CommonRecordDetailView';
import { FormModeProvider } from '@/context/FormModeContext';
import { FormStickyFooter } from '../forms/FormStickyFooter';
import { DynamicModuleCustomFields } from '../forms/DynamicModuleCustomFields';
import { useFormConfigContext } from '@/context/FormConfigContext';
import { useCodedDefaultsRecorder } from '@/context/CodedFieldDefaultsContext';
import { useFormContext, useWatch, type Control, type FieldValues, type Path, type UseFormReturn } from 'react-hook-form';
import { orderIssues, type FormStepwise } from '../forms/formStepwise';
import { focusFormField } from '@/utils/formFocus';
import { fieldFormName, type ConfigValidationIssue } from '@/utils/formConfig';
import { useFormDraftGuard } from '@/hooks/useFormDraftGuard';
import { UnsavedChangesModal } from './UnsavedChangesModal';
import { FormSectionsSkeleton } from './skeletons';
import { usePermissions } from '@/hooks/usePermissions';
import { moduleKeyFrom } from '@/theme/moduleColors';

/** Tab id used when a form without tabs gets admin-created tabs: it stands for the form's own fields. */
const FORM_FIELDS_TAB_ID = '__form_fields__';

export interface FormTabItem {
    id: string;
    label: string;
    icon?: React.ReactNode;
    badge?: React.ReactNode;
}

export interface CommonFormLayoutProps {
    /**
     * Form mode. `view` renders every field read-only and turns the footer into a read-only bar.
     */
    mode?: 'create' | 'edit' | 'view';
    /** Optional notice rendered between the header and the form card. */
    banner?: React.ReactNode;
    /**
     * When set and `mode` is 'view', the page renders as a read-only CommonRecordDetailView
     * (identity hero, tabs, audit footer) instead of a disabled form.
     */
    recordView?: Omit<CommonRecordDetailViewProps, 'tabs' | 'activeTab' | 'onTabChange' | 'children' | 'banner' | 'toast' | 'breadcrumbItems'>;
    saveDisabled?: boolean;
    saveDisabledTooltip?: string;
    /**
     * Whether the form has unsaved changes. Defaults to the surrounding react-hook-form `formState.isDirty`.
     * While dirty (and not in view mode), leaving via Cancel, any in-app link, GlobalSearch, Browser Back or
     * reload asks "Keep Editing" / "Discard & Leave" first.
     */
    isDirty?: boolean;
    /**
     * Called on "Discard & Leave", after the surrounding react-hook-form is reset, for forms that keep extra
     * local state (needed when the destination is the same page, e.g. "New Organization" while on it).
     */
    onDiscard?: () => void;
    /**
     * Optional custom breadcrumb elements. If omitted, AppBreadcrumbs is rendered with optional `breadcrumbItems`.
     */
    breadcrumbs?: React.ReactNode;
    /**
     * Optional breadcrumb items passed to AppBreadcrumbs if custom breadcrumbs element is omitted.
     */
    breadcrumbItems?: BreadcrumbItem[];
    /**
     * Optional header extra elements rendered on the right side of the breadcrumbs row (if any).
     */
    headerExtra?: React.ReactNode;
    /**
     * Form tabs displayed at the top of the form card.
     */
    tabs?: FormTabItem[];
    /**
     * ID of the active tab.
     */
    activeTab?: string;
    /**
     * Callback when a tab is clicked.
     */
    onTabChange?: (tabId: string) => void;
    /**
     * Main form fields content (active panel).
     */
    children: React.ReactNode;
    /**
     * Callback when Cancel button is clicked in the sticky footer.
     */
    onCancel: () => void;
    /**
     * Callback when Save button is clicked in the sticky footer.
     */
    onSave: () => void;
    /**
     * Whether form is currently submitting.
     */
    submitting?: boolean;
    /**
     * Text for the primary save button (e.g. "Save Contact", "Save Lead").
     */
    saveLabel?: string;
    /** Replaces the Save button's icon (passed to FormStickyFooter). */
    saveIcon?: React.ReactNode;
    /** Extra styling for the Save button (passed to FormStickyFooter). */
    saveSx?: SxProps<Theme>;
    /**
     * Step-by-step checks (`useRhfForm`'s `stepwise`): Save reports the first missing field in the form's order
     * (tab by tab, top to bottom), and a new record with several tabs shows "Next" on every tab before the last, and
     * on the last one until nothing is missing.
     */
    stepwise?: FormStepwise;
    /**
     * Text for the cancel button. Defaults to "Cancel".
     */
    cancelLabel?: string;
    /**
     * Optional toast notification element.
     */
    toast?: React.ReactNode;
    /**
     * Set to true to hide the sticky bottom action bar.
     */
    hideFooter?: boolean;
    /**
     * Disable default padding on the content wrapper (useful when child tab components provide their own internal padding).
     */
    disableContentPadding?: boolean;
    /**
     * Custom sx styling for outer page container.
     */
    sx?: SxProps<Theme>;
    /**
     * Custom sx styling for the Paper form card.
     */
    paperSx?: SxProps<Theme>;
    /**
     * Custom sx styling for the form content box inside Paper.
     */
    contentSx?: SxProps<Theme>;
    /** The record being viewed / edited is still loading: skeleton fields instead of empty ones. */
    loading?: boolean;
}

/** Re-renders `render` whenever any form value changes, without re-rendering the whole layout. */
function ValueWatcher({ control, render }: { control: Control<FieldValues>; render: () => React.ReactNode }) {
    useWatch({ control });
    return <>{render()}</>;
}

/**
 * Caps the field area (not the card) so form grids stay proportional on ultrawide monitors: past this width
 * the 3-column grids' cells would grow far wider than any field-size token, scattering fields across the row.
 */
const FORM_CONTENT_MAX_WIDTH = 1440;

/**
 * CommonFormLayout provides a standard, consistent page layout for all Create/Edit forms across the CRM:
 * 1. Line 1: Route-aware Breadcrumbs (no redundant discard button).
 * 2. Form Card: Clean Paper container with unified horizontal tabs bar.
 * 3. Card Body: Active form sections and fields.
 * 4. Bottom: Enterprise sticky action bar with local buffer status indicator, Cancel, and Save buttons.
 * 5. Toast: Standard enterprise notifications.
 */
export function CommonFormLayout({
    breadcrumbs,
    breadcrumbItems,
    headerExtra,
    tabs,
    activeTab,
    onTabChange,
    children,
    onCancel,
    onSave,
    submitting = false,
    saveLabel = 'Save Record',
    saveIcon,
    saveSx,
    stepwise,
    cancelLabel = 'Cancel',
    toast,
    hideFooter = false,
    disableContentPadding = false,
    sx,
    paperSx,
    contentSx,
    mode = 'create',
    banner,
    recordView,
    saveDisabled,
    saveDisabledTooltip,
    isDirty,
    onDiscard,
    loading = false,
}: CommonFormLayoutProps) {
    // ── Unsaved changes guard ──
    // useFormContext() is null outside a FormProvider (typed as non-null by react-hook-form).
    const formCtx = useFormContext() as UseFormReturn<FieldValues> | null;
    const formDirty = isDirty ?? Boolean(formCtx?.formState.isDirty);
    // The form builder's hidden copy of a form (read for its coded texts) must never guard navigation.
    const isHarvestCopy = Boolean(useCodedDefaultsRecorder());
    const { confirmDiscard, discardModalOpen, handleKeepEditing, handleDiscardAndLeave } = useFormDraftGuard({
        isDirty: formDirty,
        enabled: mode !== 'view' && !isHarvestCopy,
        onDiscard: () => {
            formCtx?.reset();
            onDiscard?.();
        },
    });
    const handleCancel = () => (mode === 'view' ? onCancel() : confirmDiscard(onCancel));
    // An edit with nothing changed has nothing to update: the save action stays disabled until the form is dirty.
    const nothingToUpdate = mode === 'edit' && !formDirty;

    // ── Admin-created (custom) tabs ──
    // Inside a FormConfigProvider, custom tabs of the module that hold visible fields are added after the form's
    // own tabs. Selecting one shows its fields (DynamicModuleCustomFields); the form's own panels stay mounted but
    // hidden, so their local state survives. Works for every form, whether or not it passes onTabChange.
    const configCtx = useFormConfigContext();
    const { canRecord } = usePermissions();
    const viewModule = moduleKeyFrom(configCtx?.module);
    /** Selected custom tab, remembered with the form's own tab at that moment. */
    const [customSelection, setCustomSelection] = useState<{ key: string; basis: string | undefined } | null>(null);
    // Pages stay mounted but hidden after you leave (cacheComponents): open on the form's own tab each time it's shown.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- only an effect sees the page being shown again
    useLayoutEffect(() => setCustomSelection(null), []);
    const customTabs = useMemo(() => {
        if (!configCtx?.configs) return [];
        const own = new Set((tabs ?? []).map((t) => t.id));
        return (configCtx.configs.moduleTabs[configCtx.module] ?? []).filter(
            (t) =>
                t.isCustom &&
                !own.has(t.key) &&
                [...configCtx.customFields, ...configCtx.systemFields.values()].some(
                    (f) => f.tabKey === t.key && !f.isDeleted && f.isActive && f.isVisibleInForm,
                ),
        );
    }, [configCtx, tabs]);
    // The form switching tabs itself (e.g. to show a validation error) leaves the custom tab.
    const activeCustom =
        customSelection && customSelection.basis === activeTab && customTabs.some((t) => t.key === customSelection.key) ? customSelection.key : null;

    const ownTabs: FormTabItem[] =
        tabs && tabs.length > 0
            ? tabs
            : customTabs.length > 0
              ? [{ id: FORM_FIELDS_TAB_ID, label: configCtx?.configs?.moduleTabs[configCtx.module]?.[0]?.label ?? 'Details' }]
              : [];
    const effectiveTabs: FormTabItem[] = [...ownTabs, ...customTabs.map((t) => ({ id: t.key, label: t.label }))];
    const effectiveActiveTab = activeCustom ?? activeTab ?? (tabs && tabs.length > 0 ? undefined : ownTabs[0]?.id);
    const tabsClickable = Boolean(onTabChange) || customTabs.length > 0;
    const handleTabChange = (tabId: string) => {
        if (customTabs.some((t) => t.key === tabId)) {
            setCustomSelection({ key: tabId, basis: activeTab });
            return;
        }
        setCustomSelection(null);
        if (tabId !== FORM_FIELDS_TAB_ID) onTabChange?.(tabId);
    };
    // ── Step-by-step checks (see FormStepwise) ──
    const stepTabIds = effectiveTabs.map((t) => t.id);
    const issueTab = (path: string): string | undefined => {
        const configured = configCtx ? (configCtx.customFields.find((f) => fieldFormName(f) === path) ?? configCtx.systemFields.get(path)) : undefined;
        const tab = stepwise?.fieldTab?.(path) ?? configured?.tabKey;
        if (tab && stepTabIds.includes(tab)) return tab;
        // One tab of the form's own (or the stand-in for none): every field not on a custom tab sits there.
        if (ownTabs.length === 1) return ownTabs[0].id;
        return effectiveActiveTab;
    };
    const tabRankOf = (path: string) => {
        const index = stepTabIds.indexOf(issueTab(path) ?? '');
        return index === -1 ? stepTabIds.length : index;
    };
    const orderedIssues = () => (stepwise ? orderIssues(stepwise.issues(), tabRankOf) : []);
    const stepwiseActive = Boolean(stepwise) && mode !== 'view' && !isHarvestCopy;
    const nextEnabled = stepwiseActive && mode === 'create' && stepTabIds.length > 1;

    // Focus to run once a step's tab has rendered (the tab switch re-renders the form first).
    const pendingStepFocus = useRef<(() => void) | null>(null);
    useEffect(() => {
        const focus = pendingStepFocus.current;
        if (!focus) return;
        pendingStepFocus.current = null;
        const frame = requestAnimationFrame(focus);
        return () => cancelAnimationFrame(frame);
    }, [effectiveActiveTab]);
    const showStepTab = (tab: string | undefined, focus: () => void) => {
        pendingStepFocus.current = null;
        if (tab && tab !== effectiveActiveTab) {
            pendingStepFocus.current = focus;
            handleTabChange(tab);
        } else {
            focus();
        }
    };
    /** Marks the field (keeping an error already there, e.g. a duplicate name) and says why. */
    const reportIssue = (issue: ConfigValidationIssue) => {
        const path = issue.path as Path<FieldValues>;
        if (formCtx && !formCtx.getFieldState(path).error) formCtx.setError(path, { type: 'custom', message: issue.message });
        stepwise?.notify(issue.message);
    };
    const focusFirstIssueOf = (tab: string | undefined) => () => {
        const first = orderedIssues().find((i) => issueTab(i.path) === tab);
        if (first) focusFormField(first.path);
    };
    /** "Next": checks the open tab like Save (one field at a time); once it's complete, moves to the next tab's first missing field. */
    const handleNext = () => {
        const issues = orderedIssues();
        const here = issues.find((i) => issueTab(i.path) === effectiveActiveTab);
        if (here) {
            reportIssue(here);
            focusFormField(here.path);
            return;
        }
        const current = stepTabIds.indexOf(effectiveActiveTab ?? '');
        const next = issues.find((i) => tabRankOf(i.path) > current);
        // A later tab with nothing required is still a step: Next opens it so its fields aren't missed.
        const tab = next ? issueTab(next.path) : current >= 0 && current < stepTabIds.length - 1 ? stepTabIds[current + 1] : issues[0] && issueTab(issues[0].path);
        if (!tab && !issues[0]) {
            onSave();
            return;
        }
        showStepTab(tab, focusFirstIssueOf(tab));
    };
    /** Save: the first missing field in the form's order (any tab), or the form's own save once nothing is missing. */
    const handleStepSave = async () => {
        const [first] = orderedIssues();
        if (!first) {
            onSave();
            return;
        }
        // A save attempt as far as the form can tell (inline errors, submit count: e.g. the follow-up popup glows),
        // without the form's own "first error" toast and focus, which would follow a different order.
        if (formCtx) await formCtx.handleSubmit(() => {}, () => {})();
        reportIssue(first);
        showStepTab(issueTab(first.path), () => focusFormField(first.path));
    };

    /** The form's own panels, hidden (not unmounted) while a custom tab is shown, followed by that tab's fields. */
    const content = (padded: boolean) =>
        customTabs.length === 0 ? (
            children
        ) : (
            <>
                <div style={{ display: activeCustom ? 'none' : 'contents' }}>{children}</div>
                {activeCustom && configCtx && (
                    <DynamicModuleCustomFields key={activeCustom} module={configCtx.module} tabKey={activeCustom} sx={padded ? { px: 0, pb: 0 } : { pt: 3.5 }} />
                )}
            </>
        );

    /** "Next" while a new record still misses something (re-read on every change), then the form's Save. */
    const renderFooter = () => {
        // Every tab before the last gets "Next" (even one with nothing required), so later tabs aren't missed.
        const activeIndex = stepTabIds.indexOf(effectiveActiveTab ?? '');
        const laterTab = activeIndex >= 0 && activeIndex < stepTabIds.length - 1;
        const pending = nextEnabled && (laterTab || Boolean(stepwise?.issues().length));
        return (
            <FormStickyFooter
                onCancel={handleCancel}
                onSave={!stepwiseActive ? onSave : pending ? handleNext : () => void handleStepSave()}
                submitting={submitting}
                saveLabel={pending ? 'Next' : saveLabel}
                saveKind={pending ? 'next' : 'save'}
                saveIcon={saveIcon}
                saveSx={pending ? undefined : saveSx}
                cancelLabel={cancelLabel}
                mode={mode}
                saveDisabled={saveDisabled || nothingToUpdate}
                saveDisabledTooltip={saveDisabled ? saveDisabledTooltip : nothingToUpdate ? 'No changes to update' : undefined}
            />
        );
    };

    if (mode === 'view' && recordView) {
        return (
            <CommonRecordDetailView
                actions={headerExtra}
                {...recordView}
                // Admin › Roles: no Edit for a record the role can't edit (Own: only the user's own or created records).
                editHref={viewModule && !canRecord(viewModule, 'edit', recordView.audit) ? undefined : recordView.editHref}
                breadcrumbItems={breadcrumbItems}
                tabs={effectiveTabs.length > 0 ? effectiveTabs : tabs}
                activeTab={effectiveActiveTab}
                onTabChange={tabsClickable ? handleTabChange : undefined}
                banner={banner}
                toast={toast}
                padContent={!disableContentPadding}
                loading={loading}
            >
                {content(!disableContentPadding)}
            </CommonRecordDetailView>
        );
    }

    return (
        <Box sx={{ width: '100%', pb: 1.5, ...sx }}>
            {/* ── Line 1: Route-Aware Breadcrumbs ── */}
            <FormHeader
                breadcrumbs={breadcrumbs}
                breadcrumbItems={breadcrumbItems}
                extraActions={headerExtra}
            />

            {banner}

            {/* ── Main Form Card ── */}
            <Paper
                elevation={0}
                sx={{
                    borderRadius: '12px',
                    border: '1px solid var(--mui-palette-border-main)',
                    backgroundColor: 'var(--mui-palette-background-paper)',
                    overflow: 'hidden',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                    ...paperSx,
                }}
            >
                {/* ── Horizontal Navigation Tabs Bar ── */}
                {effectiveTabs.length > 0 && (
                    <Box
                        sx={{
                            backgroundColor: 'var(--mui-palette-background-subtle)',
                            borderBottom: '1px solid var(--mui-palette-border-main)',
                            px: { xs: 2, md: 2.5 },
                            py: 1,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                            overflowX: 'auto',
                        }}
                    >
                        {effectiveTabs.map((tab) => {
                            const isActive = effectiveActiveTab === tab.id;

                            return (
                                <Box
                                    key={tab.id}
                                    onClick={() => handleTabChange(tab.id)}
                                    sx={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 1,
                                        px: 2,
                                        py: 0.9,
                                        borderRadius: '8px',
                                        cursor: tabsClickable ? 'pointer' : 'default',
                                        userSelect: 'none',
                                        whiteSpace: 'nowrap',
                                        transition: 'all 0.15s ease-in-out',
                                        backgroundColor: isActive ? 'var(--mui-palette-background-paper)' : 'transparent',
                                        border: isActive ? '1px solid var(--mui-palette-border-strong)' : '1px solid transparent',
                                        boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                                        color: isActive ? 'var(--crm-text-blue-900)' : 'var(--mui-palette-text-secondary)',
                                        fontWeight: isActive ? 700 : 500,
                                        fontSize: '0.84rem',
                                        '&:hover': {
                                            backgroundColor: isActive ? 'var(--mui-palette-background-paper)' : 'var(--mui-palette-primary-soft)',
                                            color: isActive ? 'var(--crm-blue-900)' : 'var(--crm-text-blue-700)',
                                        },
                                    }}
                                >
                                    {tab.icon && (
                                        <Box
                                            sx={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                color: isActive ? 'var(--crm-text-blue-600)' : 'var(--mui-palette-text-secondary)',
                                            }}
                                        >
                                            {tab.icon}
                                        </Box>
                                    )}
                                    <Typography
                                        sx={{
                                            fontSize: '0.84rem',
                                            fontWeight: 'inherit',
                                            color: 'inherit',
                                        }}
                                    >
                                        {tab.label}
                                    </Typography>

                                    {tab.badge && (
                                        <Box
                                            sx={{
                                                px: 1,
                                                py: 0.2,
                                                borderRadius: '9999px',
                                                border: '1px solid var(--crm-blue-300)',
                                                backgroundColor: 'var(--mui-palette-primary-soft)',
                                                color: 'var(--crm-text-blue-600)',
                                                fontSize: '0.72rem',
                                                fontWeight: 600,
                                                lineHeight: 1.2,
                                            }}
                                        >
                                            {tab.badge}
                                        </Box>
                                    )}

                                </Box>
                            );
                        })}
                    </Box>
                )}

                {/* ── Form Content Panels ── */}
                <Box
                    sx={{
                        p: disableContentPadding ? 0 : { xs: 2.5, md: 3.5 },
                        maxWidth: FORM_CONTENT_MAX_WIDTH,
                        ...contentSx,
                    }}
                >
                    {/* View mode: the disabled fieldset covers native controls; `inert` also blocks custom
                        (MUI Select/Autocomplete/date pickers, chips, buttons) from mouse, keyboard and focus. */}
                    <FormModeProvider mode={mode}>
                    <fieldset
                        disabled={mode === 'view'}
                        inert={mode === 'view'}
                        style={{ border: 'none', padding: 0, margin: 0, minWidth: 0 }}
                    >
                        {/* Panels stay mounted (hidden) while the record loads, so the form is ready when it lands. */}
                        {loading && <FormSectionsSkeleton sx={disableContentPadding ? undefined : { p: 0 }} />}
                        <div style={{ display: loading ? 'none' : 'contents' }}>{content(!disableContentPadding)}</div>
                    </fieldset>
                    </FormModeProvider>
                </Box>
            </Paper>

            {/* ── Bottom Sticky Action Bar ── */}
            {!hideFooter && (formCtx && nextEnabled ? <ValueWatcher control={formCtx.control} render={renderFooter} /> : renderFooter())}

            {/* ── Notifications Toast ── */}
            {toast}

            <UnsavedChangesModal
                open={discardModalOpen}
                onKeepEditing={handleKeepEditing}
                onDiscardAndLeave={handleDiscardAndLeave}
            />
        </Box>
    );
}

export { CommonFormLayout as CommonFormView };
