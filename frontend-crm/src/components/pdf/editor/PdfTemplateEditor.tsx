'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
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
    ListItemText,
    Menu,
    MenuItem,
    Skeleton,
    Typography,
    useMediaQuery,
    useTheme,
} from '@mui/material';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import CodeRoundedIcon from '@mui/icons-material/CodeRounded';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import type { EditorView } from '@uiw/react-codemirror';
import { ROUTES } from '@/config/constants';
import { AppToast } from '@/components/common/AppToast';
import { ErrorAlert } from '@/components/common/ErrorAlert';
import { UnsavedChangesModal } from '@/components/common/UnsavedChangesModal';
import { useFormDraftGuard } from '@/hooks/useFormDraftGuard';
import { ApiClientError } from '@/services/apiClient';
import { pdfTemplateService } from '@/services/pdfTemplate.service';
import { queryKeys } from '@/hooks/queries/queryKeys';
import { useCreatePdfTemplate, useDuplicatePdfTemplate, usePdfFields, usePdfTemplate, usePdfTemplates, useUpdatePdfTemplate } from '@/hooks/queries/usePdfTemplates';
import type { PdfFieldRegistry, PdfModule, PdfTemplate } from '@/types/pdfTemplate.types';
import { pdfTemplateFormSchema, type PdfTemplateFormValues } from '@/validations/pdfTemplate.schema';
import { errorMessage, panelHeaderSx, PillTabs, primaryButtonSx, secondaryButtonSx, surfaceSx } from '@/components/settings/form-customization/builderUi';
import { StatusChip } from '../admin/PdfTemplateChips';
import { blankFormValues, copyFormValues, SNIPPETS, toCreateInput, toDraft, toFormValues, toUpdateInput } from './editorUtils';
import { InsertFieldButton } from './InsertFieldButton';
import { LivePreviewPane } from './LivePreviewPane';
import { BrandingPanel } from './panels/BrandingPanel';
import { FieldsPanel } from './panels/FieldsPanel';
import { GeneralPanel } from './panels/GeneralPanel';
import { MarginsPanel } from './panels/MarginsPanel';

const CodeEditor = dynamic(() => import('./CodeEditor'), {
    ssr: false,
    loading: () => <Skeleton variant="rectangular" height="100%" sx={{ minHeight: 320 }} />,
});

type SettingsTab = 'general' | 'margins' | 'fields' | 'branding';
type CodeTab = 'bodyHtml' | 'headerHtml' | 'footerHtml' | 'css';
type PaneTab = 'settings' | 'code' | 'preview';

const CODE_TABS: { key: CodeTab; label: string }[] = [
    { key: 'headerHtml', label: 'Header' },
    { key: 'bodyHtml', label: 'Body' },
    { key: 'footerHtml', label: 'Footer' },
    { key: 'css', label: 'CSS' },
];

const toastClosed = { open: false, message: '', severity: 'success' as 'success' | 'error' | 'info' | 'warning' };

// ─── Loader: fetches what the form needs, then mounts the editor with complete default values ────────────

export function PdfTemplateEditor({ templateId, module: newModule = 'QUOTATION', sourceTemplateId }: { templateId?: string; module?: PdfModule; sourceTemplateId?: string | null }) {
    const templateQuery = usePdfTemplate(templateId);
    const sourceQuery = usePdfTemplate(templateId ? undefined : (sourceTemplateId ?? undefined));
    const pdfModule = templateQuery.data?.module ?? newModule;
    const fieldsQuery = usePdfFields(pdfModule);

    const error = templateQuery.error ?? sourceQuery.error ?? fieldsQuery.error;
    if (error) return <ErrorAlert error={errorMessage(error, 'The template could not be loaded.')} />;

    const ready = fieldsQuery.data && (templateId ? templateQuery.data : !sourceTemplateId || sourceQuery.data);
    if (!ready || !fieldsQuery.data) {
        return (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '320px 1fr 1fr' }, gap: 2 }}>
                {[0, 1, 2].map((i) => (
                    <Skeleton key={i} variant="rectangular" height={520} sx={{ borderRadius: '12px' }} />
                ))}
            </Box>
        );
    }

    const registry = fieldsQuery.data;
    const initial = templateQuery.data
        ? toFormValues(templateQuery.data, registry)
        : sourceQuery.data
          ? copyFormValues(sourceQuery.data, registry)
          : blankFormValues(pdfModule, registry);

    return <EditorForm key={templateId ?? `new:${sourceTemplateId ?? 'blank'}`} template={templateQuery.data} initial={initial} registry={registry} />;
}

// ─── Form ────────────────────────────────────────────────────────────────────────────────────────────────

function EditorForm({ template, initial, registry }: { template: PdfTemplate | undefined; initial: PdfTemplateFormValues; registry: PdfFieldRegistry }) {
    const router = useRouter();
    const theme = useTheme();
    const wide = useMediaQuery(theme.breakpoints.up('lg'));
    const queryClient = useQueryClient();
    const isNew = !template;
    const readOnly = Boolean(template?.isSystem);

    const form = useForm<PdfTemplateFormValues>({ resolver: zodResolver(pdfTemplateFormSchema), defaultValues: initial, mode: 'onChange' });
    const { control, handleSubmit, reset, setValue, getValues, formState } = form;
    const values = useWatch({ control }) as PdfTemplateFormValues;

    const [version, setVersion] = useState(template?.version ?? 0);
    const [settingsTab, setSettingsTab] = useState<SettingsTab>('general');
    const [codeTab, setCodeTab] = useState<CodeTab>('bodyHtml');
    const [paneTab, setPaneTab] = useState<PaneTab>('code');
    const [toast, setToast] = useState(toastClosed);
    const [conflictOpen, setConflictOpen] = useState(false);
    const [sampleToLoad, setSampleToLoad] = useState<{ id: string; name: string } | null>(null);
    const [snippetAnchor, setSnippetAnchor] = useState<HTMLElement | null>(null);
    const [sampleAnchor, setSampleAnchor] = useState<HTMLElement | null>(null);
    const viewRef = useRef<EditorView | null>(null);

    const create = useCreatePdfTemplate();
    const update = useUpdatePdfTemplate();
    const duplicate = useDuplicatePdfTemplate();
    const systemTemplates = usePdfTemplates({ module: initial.module, includeInactive: true }).data?.filter((t) => t.isSystem) ?? [];
    const saving = create.isPending || update.isPending;

    const isDirty = formState.isDirty && !readOnly;
    const { confirmDiscard, discardModalOpen, handleKeepEditing, handleDiscardAndLeave } = useFormDraftGuard({ isDirty, enabled: !readOnly });

    const notify = useCallback((message: string, severity: (typeof toastClosed)['severity'] = 'success') => setToast({ open: true, message, severity }), []);

    const draft = useMemo(() => toDraft(values, template?.id), [values, template?.id]);
    const draftKey = useMemo(() => JSON.stringify(draft), [draft]);

    const applySaved = useCallback(
        (saved: PdfTemplate) => {
            setVersion(saved.version);
            reset(toFormValues(saved, registry));
        },
        [registry, reset],
    );

    const describeError = (err: unknown) => {
        if (err instanceof ApiClientError && err.details?.errors?.length) {
            return `${err.message}${err.details.errors.length > 1 ? ` (+${err.details.errors.length - 1} more)` : ''}`;
        }
        return errorMessage(err, 'The template could not be saved.');
    };

    const submit = useCallback(
        async (v: PdfTemplateFormValues, overwriteVersion?: number) => {
            try {
                if (isNew) {
                    const created = await create.mutateAsync(toCreateInput(v));
                    reset(toFormValues(created, registry));
                    notify('Template created');
                    router.replace(ROUTES.PDF_TEMPLATE_EDIT(created.id));
                    return;
                }
                const saved = await update.mutateAsync({ id: template.id, input: toUpdateInput(v, overwriteVersion ?? version) });
                applySaved(saved);
                notify('Template saved');
            } catch (err) {
                if (err instanceof ApiClientError && err.status === 409 && err.details?.code === 'VERSION_CONFLICT') {
                    setConflictOpen(true);
                    return;
                }
                notify(describeError(err), 'error');
            }
        },
        [applySaved, create, isNew, notify, registry, reset, router, template, update, version],
    );

    const save = useMemo(
        () =>
            handleSubmit(
                (v) => submit(v),
                () => notify('Fix the highlighted fields before saving.', 'error'),
            ),
        [handleSubmit, notify, submit],
    );

    // Ctrl / Cmd + S saves.
    const saveRef = useRef(save);
    useEffect(() => {
        saveRef.current = save;
    }, [save]);
    useEffect(() => {
        if (readOnly) return;
        const onKey = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                e.preventDefault();
                void saveRef.current();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [readOnly]);

    const reloadFromServer = async () => {
        if (!template) return;
        setConflictOpen(false);
        try {
            const latest = await queryClient.fetchQuery({ queryKey: queryKeys.pdfTemplates.detail(template.id), queryFn: () => pdfTemplateService.get(template.id), staleTime: 0 });
            applySaved(latest);
            notify('Reloaded the latest version.', 'info');
        } catch (err) {
            notify(errorMessage(err), 'error');
        }
    };

    const overwrite = async () => {
        if (!template) return;
        setConflictOpen(false);
        try {
            const latest = await pdfTemplateService.get(template.id);
            await submit(getValues(), latest.version);
        } catch (err) {
            notify(errorMessage(err), 'error');
        }
    };

    const duplicateToEdit = async () => {
        if (!template) return;
        try {
            const copy = await duplicate.mutateAsync({ id: template.id });
            notify(`Created "${copy.name}"`);
            router.push(ROUTES.PDF_TEMPLATE_EDIT(copy.id));
        } catch (err) {
            notify(errorMessage(err), 'error');
        }
    };

    const insertText = (text: string) => {
        const view = viewRef.current;
        if (view) {
            view.dispatch(view.state.replaceSelection(text));
            view.focus();
            return;
        }
        setValue(codeTab, `${getValues(codeTab)}${text}`, { shouldDirty: true });
    };

    const loadSample = async () => {
        if (!sampleToLoad) return;
        const target = sampleToLoad;
        setSampleToLoad(null);
        try {
            const sample = await pdfTemplateService.get(target.id);
            const opts = { shouldDirty: true, shouldValidate: true } as const;
            setValue('headerHtml', sample.headerHtml, opts);
            setValue('bodyHtml', sample.bodyHtml, opts);
            setValue('footerHtml', sample.footerHtml, opts);
            setValue('css', sample.css, opts);
            setValue('margins', sample.margins, opts);
            setValue('pageSize', sample.pageSize, opts);
            setValue('orientation', sample.orientation, opts);
            notify(`Loaded the "${target.name}" layout.`, 'info');
        } catch (err) {
            notify(errorMessage(err), 'error');
        }
    };

    const back = () => confirmDiscard(() => router.push(ROUTES.PDF_TEMPLATES));
    const codeError = formState.errors[codeTab]?.message;

    // ── Panes ──
    const settingsPane = (
        <Box sx={{ ...surfaceSx, display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%', overflow: 'hidden' }}>
            <Box sx={{ ...panelHeaderSx, py: 1 }}>
                <PillTabs<SettingsTab>
                    value={settingsTab}
                    onChange={setSettingsTab}
                    items={[
                        { key: 'general', label: 'General' },
                        { key: 'margins', label: 'Margins' },
                        { key: 'fields', label: 'Fields' },
                        { key: 'branding', label: 'Branding' },
                    ]}
                />
            </Box>
            <Box role="tabpanel" sx={{ p: 2, overflowY: 'auto', flex: 1 }}>
                {settingsTab === 'general' && <GeneralPanel form={form} readOnly={readOnly} isNew={isNew} isCurrentDefault={Boolean(template?.isDefault)} />}
                {settingsTab === 'margins' && <MarginsPanel form={form} readOnly={readOnly} />}
                {settingsTab === 'fields' && <FieldsPanel form={form} registry={registry} readOnly={readOnly} />}
                {settingsTab === 'branding' && <BrandingPanel form={form} readOnly={readOnly} onError={(m) => notify(m, 'error')} />}
            </Box>
        </Box>
    );

    const codePane = (
        <Box sx={{ ...surfaceSx, display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%', overflow: 'hidden' }}>
            <Box sx={{ ...panelHeaderSx, py: 1, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <PillTabs<CodeTab> value={codeTab} onChange={setCodeTab} items={CODE_TABS.map((t) => ({ ...t, hasUnsaved: Boolean(formState.dirtyFields[t.key]) }))} sx={{ mr: 'auto' }} />
                <InsertFieldButton fields={registry.fields} disabled={readOnly || codeTab === 'css'} onInsert={insertText} />
                <Button
                    size="small"
                    variant="outlined"
                    startIcon={<CodeRoundedIcon sx={{ fontSize: 16 }} />}
                    disabled={readOnly || codeTab === 'css'}
                    onClick={(e) => setSnippetAnchor(e.currentTarget)}
                    aria-haspopup="menu"
                    sx={{ ...secondaryButtonSx, height: 30 }}
                >
                    Snippets
                </Button>
                <Button
                    size="small"
                    variant="outlined"
                    startIcon={<AutoAwesomeOutlinedIcon sx={{ fontSize: 16 }} />}
                    disabled={readOnly || systemTemplates.length === 0}
                    onClick={(e) => setSampleAnchor(e.currentTarget)}
                    aria-haspopup="menu"
                    sx={{ ...secondaryButtonSx, height: 30 }}
                >
                    Load sample
                </Button>
            </Box>
            {codeError && (
                <Alert severity="error" sx={{ borderRadius: 0, py: 0, fontSize: '0.78rem' }}>
                    {codeError}
                </Alert>
            )}
            <Box sx={{ flex: 1, minHeight: 320, overflow: 'auto' }}>
                <CodeEditor
                    key={codeTab}
                    value={values[codeTab] ?? ''}
                    onChange={(next) => setValue(codeTab, next, { shouldDirty: true, shouldValidate: true })}
                    language={codeTab === 'css' ? 'css' : 'html'}
                    readOnly={readOnly}
                    ariaLabel={`${CODE_TABS.find((t) => t.key === codeTab)?.label} template code`}
                    onViewReady={(view) => {
                        viewRef.current = view;
                    }}
                />
            </Box>
            <Box sx={{ px: 2, py: 0.75, borderTop: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
                <Typography sx={{ fontSize: '0.7rem', color: '#64748b' }}>
                    Handlebars: <code>{'{{field}}'}</code> (escaped), <code>{'{{#ifShow "key"}}…{{/ifShow}}'}</code>, <code>{'{{#each lineItems}}'}</code>, helpers{' '}
                    <code>currency number date nl2br amountInWords eq and or inc asset lineItemCell</code>. Header / footer: <code>pageNumber</code> / <code>totalPages</code> spans.
                </Typography>
            </Box>
        </Box>
    );

    const previewPane = <LivePreviewPane draft={draft} draftKey={draftKey} />;

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minHeight: 0 }}>
            {/* Header */}
            <Box sx={{ ...surfaceSx, p: { xs: 1.5, md: 2 }, display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                <Button variant="outlined" size="small" startIcon={<ArrowBackRoundedIcon />} onClick={back} sx={secondaryButtonSx}>
                    Templates
                </Button>
                <Box sx={{ flex: '1 1 240px', minWidth: 0 }}>
                    <Typography component="h1" noWrap sx={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>
                        {isNew ? 'New PDF template' : values.name || template?.name}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 0.75, mt: 0.5, flexWrap: 'wrap' }}>
                        {template?.isSystem && <StatusChip tone="system">System · read-only</StatusChip>}
                        {template?.isDefault && <StatusChip tone="default">Default</StatusChip>}
                        {template && <StatusChip tone={template.isActive ? 'active' : 'inactive'}>{template.isActive ? 'Active' : 'Inactive'}</StatusChip>}
                        {!isNew && <StatusChip tone="neutral">v{version}</StatusChip>}
                        {isDirty && <StatusChip tone="custom">Unsaved changes</StatusChip>}
                    </Box>
                </Box>
                {readOnly ? (
                    <Button variant="contained" startIcon={duplicate.isPending ? <CircularProgress size={14} sx={{ color: '#fff' }} /> : <ContentCopyOutlinedIcon />} disabled={duplicate.isPending} onClick={() => void duplicateToEdit()} sx={{ ...primaryButtonSx, height: 36 }}>
                        Duplicate to edit
                    </Button>
                ) : (
                    <Button
                        variant="contained"
                        startIcon={saving ? <CircularProgress size={14} sx={{ color: '#fff' }} /> : <SaveOutlinedIcon />}
                        disabled={saving || (!isNew && !isDirty)}
                        onClick={() => void save()}
                        aria-keyshortcuts="Control+S Meta+S"
                        sx={{ ...primaryButtonSx, height: 36 }}
                    >
                        {isNew ? 'Create template' : 'Save'}
                    </Button>
                )}
            </Box>

            {readOnly && (
                <Alert
                    severity="info"
                    sx={{ borderRadius: '10px', fontSize: '0.82rem' }}
                    action={
                        <Button size="small" onClick={() => void duplicateToEdit()} sx={{ textTransform: 'none', fontWeight: 700 }}>
                            Duplicate to edit
                        </Button>
                    }
                >
                    This is a built-in template and can&apos;t be changed. Duplicate it to customise the layout, fields and branding.
                </Alert>
            )}

            {wide ? (
                <Box sx={{ display: 'grid', gridTemplateColumns: '320px minmax(0, 1fr) minmax(0, 1fr)', gap: 2, height: 'calc(100vh - 260px)', minHeight: 560 }}>
                    {settingsPane}
                    {codePane}
                    {previewPane}
                </Box>
            ) : (
                <>
                    <PillTabs<PaneTab>
                        value={paneTab}
                        onChange={setPaneTab}
                        items={[
                            { key: 'settings', label: 'Settings' },
                            { key: 'code', label: 'Code' },
                            { key: 'preview', label: 'Preview' },
                        ]}
                    />
                    <Box sx={{ height: '70vh', minHeight: 480 }}>
                        {paneTab === 'settings' && settingsPane}
                        {paneTab === 'code' && codePane}
                        {paneTab === 'preview' && previewPane}
                    </Box>
                </>
            )}

            {/* Snippets / samples menus */}
            <Menu anchorEl={snippetAnchor} open={Boolean(snippetAnchor)} onClose={() => setSnippetAnchor(null)} slotProps={{ paper: { sx: { borderRadius: '10px', border: '1px solid #e2e8f0', minWidth: 260 } } }}>
                {SNIPPETS.map((s) => (
                    <MenuItem
                        key={s.key}
                        onClick={() => {
                            setSnippetAnchor(null);
                            insertText(s.code);
                        }}
                    >
                        <ListItemText primary={s.label} secondary={s.description} slotProps={{ primary: { sx: { fontSize: '0.84rem', fontWeight: 600 } }, secondary: { sx: { fontSize: '0.72rem' } } }} />
                    </MenuItem>
                ))}
            </Menu>
            <Menu anchorEl={sampleAnchor} open={Boolean(sampleAnchor)} onClose={() => setSampleAnchor(null)} slotProps={{ paper: { sx: { borderRadius: '10px', border: '1px solid #e2e8f0', minWidth: 240 } } }}>
                {systemTemplates.map((t) => (
                    <MenuItem
                        key={t.id}
                        onClick={() => {
                            setSampleAnchor(null);
                            setSampleToLoad({ id: t.id, name: t.name });
                        }}
                    >
                        <ListItemText primary={t.name} secondary={t.description} slotProps={{ primary: { sx: { fontSize: '0.84rem', fontWeight: 600 } }, secondary: { sx: { fontSize: '0.72rem', whiteSpace: 'normal', maxWidth: 300 } } }} />
                    </MenuItem>
                ))}
            </Menu>

            <Dialog open={Boolean(sampleToLoad)} onClose={() => setSampleToLoad(null)} slotProps={{ paper: { sx: { borderRadius: '12px' } } }}>
                <DialogTitle sx={{ fontSize: '1rem', fontWeight: 700 }}>Load the “{sampleToLoad?.name}” layout?</DialogTitle>
                <DialogContent>
                    <Typography sx={{ fontSize: '0.85rem', color: '#475569' }}>
                        This replaces the header, body, footer, CSS, page size and margins. Field visibility and branding are kept. Nothing is saved until you click Save.
                    </Typography>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button variant="outlined" onClick={() => setSampleToLoad(null)} sx={secondaryButtonSx}>
                        Cancel
                    </Button>
                    <Button variant="contained" onClick={() => void loadSample()} sx={primaryButtonSx}>
                        Replace content
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog open={conflictOpen} onClose={() => setConflictOpen(false)} slotProps={{ paper: { sx: { borderRadius: '12px' } } }}>
                <DialogTitle sx={{ fontSize: '1rem', fontWeight: 700 }}>This template was changed by someone else</DialogTitle>
                <DialogContent>
                    <Typography sx={{ fontSize: '0.85rem', color: '#475569' }}>
                        Another administrator saved this template after you opened it. Reload to see their version (your changes are discarded), or overwrite it with yours.
                    </Typography>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button variant="outlined" onClick={() => void reloadFromServer()} sx={secondaryButtonSx}>
                        Reload theirs
                    </Button>
                    <Button variant="contained" color="error" onClick={() => void overwrite()} sx={{ ...primaryButtonSx, background: 'linear-gradient(135deg, #b91c1c 0%, #dc2626 100%)' }}>
                        Overwrite with mine
                    </Button>
                </DialogActions>
            </Dialog>

            <UnsavedChangesModal open={discardModalOpen} onKeepEditing={handleKeepEditing} onDiscardAndLeave={handleDiscardAndLeave} />
            <AppToast open={toast.open} message={toast.message} severity={toast.severity} onClose={() => setToast((t) => ({ ...t, open: false }))} />
        </Box>
    );
}
