'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
    Divider,
    IconButton,
    Skeleton,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Tooltip,
    Typography,
} from '@mui/material';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import UndoRoundedIcon from '@mui/icons-material/UndoRounded';
import RedoRoundedIcon from '@mui/icons-material/RedoRounded';
import ZoomInRoundedIcon from '@mui/icons-material/ZoomInRounded';
import ZoomOutRoundedIcon from '@mui/icons-material/ZoomOutRounded';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import { ROUTES } from '@/config/constants';
import { AppToast } from '@/components/common/AppToast';
import { ErrorAlert } from '@/components/common/ErrorAlert';
import { UnsavedChangesModal } from '@/components/common/UnsavedChangesModal';
import { useFormDraftGuard } from '@/hooks/useFormDraftGuard';
import { queryKeys } from '@/hooks/queries/queryKeys';
import { useCreatePdfTemplate, useDuplicatePdfTemplate, usePdfContext, usePdfFields, usePdfTemplate, useSavePdfItem, useUpdatePdfTemplate } from '@/hooks/queries/usePdfTemplates';
import { blankDocument, type PdfDocument, type RenderOptions, type SavedItemContent } from '@/lib/pdf-document';
import { ApiClientError } from '@/services/apiClient';
import { pdfTemplateService } from '@/services/pdfTemplate.service';
import type { PdfFieldRegistry, PdfModule, PdfRenderContext, PdfTemplate } from '@/types/pdfTemplate.types';
import { errorMessage, primaryButtonSx, secondaryButtonSx, surfaceSx } from '@/components/settings/form-customization/builderUi';
import { StatusChip } from '../admin/PdfTemplateChips';
import { Canvas } from './canvas/Canvas';
import { QuotationPicker, type PickedRecord } from './common/QuotationPicker';
import { BuilderDnd } from './dnd/BuilderDnd';
import { LeftPanel } from './panel/LeftPanel';
import type { TemplateMeta } from './panel/StylingTab';
import { BuilderProvider, useBuilder, useBuilderEnv, type BuilderEnv } from './state/builderState';
import { duplicateBlock, duplicateSection, removeSelected } from './state/docOps';

type Severity = 'success' | 'error' | 'info' | 'warning';
const toastClosed = { open: false, message: '', severity: 'success' as Severity };
const ZOOMS = [0.5, 0.6, 0.75, 0.9, 1, 1.1, 1.25, 1.5];

const isTyping = (target: EventTarget | null) => {
    const el = target as HTMLElement | null;
    return Boolean(el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)));
};

// ─── Loader ─────────────────────────────────────────────────────────────────────

export function PdfTemplateBuilder({ templateId, module: newModule = 'QUOTATION', sourceTemplateId }: { templateId?: string; module?: PdfModule; sourceTemplateId?: string | null }) {
    const templateQuery = usePdfTemplate(templateId);
    const sourceQuery = usePdfTemplate(templateId ? undefined : (sourceTemplateId ?? undefined));
    const pdfModule = templateQuery.data?.module ?? newModule;
    const fieldsQuery = usePdfFields(pdfModule);
    const [record, setRecord] = useState<PickedRecord | null>(null);
    const contextQuery = usePdfContext(pdfModule, record?.id);

    const error = templateQuery.error ?? sourceQuery.error ?? fieldsQuery.error ?? (contextQuery.data ? null : contextQuery.error);
    if (error) return <ErrorAlert error={errorMessage(error, 'The template could not be loaded.')} />;

    const ready = fieldsQuery.data && contextQuery.data && (templateId ? templateQuery.data : !sourceTemplateId || sourceQuery.data);
    if (!ready || !fieldsQuery.data || !contextQuery.data) {
        return (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '380px 1fr' }, gap: 2 }}>
                <Skeleton variant="rectangular" height={620} sx={{ borderRadius: '12px' }} />
                <Skeleton variant="rectangular" height={620} sx={{ borderRadius: '12px' }} />
            </Box>
        );
    }

    const registry = fieldsQuery.data;
    const template = templateQuery.data;
    const source = sourceQuery.data;
    const initialDoc: PdfDocument = template?.document ?? source?.document ?? blankDocument({ lineItemColumns: registry.lineItemColumns });
    const initialMeta: TemplateMeta = template
        ? { name: template.name, description: template.description, isActive: template.isActive, isDefault: template.isDefault }
        : { name: source ? `${source.name} (Custom)` : '', description: source?.description ?? '', isActive: true, isDefault: false };

    return (
        <BuilderShell
            key={templateId ?? `new:${sourceTemplateId ?? 'blank'}`}
            module={pdfModule}
            template={template}
            initialDoc={initialDoc}
            initialMeta={initialMeta}
            registry={registry}
            baseContext={contextQuery.data}
            contextLoading={contextQuery.isFetching}
            record={record}
            onRecordChange={setRecord}
        />
    );
}

// ─── Shell: env (notify, library dialog) + providers ────────────────────────────

interface ShellProps {
    module: PdfModule;
    template: PdfTemplate | undefined;
    initialDoc: PdfDocument;
    initialMeta: TemplateMeta;
    registry: PdfFieldRegistry;
    baseContext: PdfRenderContext;
    contextLoading: boolean;
    record: PickedRecord | null;
    onRecordChange: (record: PickedRecord | null) => void;
}

function BuilderShell(props: ShellProps) {
    const { module, template, initialDoc, registry, baseContext } = props;
    const [toast, setToast] = useState(toastClosed);
    const [libraryItem, setLibraryItem] = useState<{ content: SavedItemContent; name: string } | null>(null);
    const saveItem = useSavePdfItem(module);
    const libraryNameRef = useRef<HTMLInputElement | null>(null);

    const notify = useCallback((message: string, severity: Severity = 'success') => setToast({ open: true, message, severity }), []);
    const saveToLibrary = useCallback((content: SavedItemContent, suggestedName: string) => setLibraryItem({ content, name: suggestedName }), []);
    const labels = useMemo(() => new Map(registry.fields.map((f) => [f.path, f.label])), [registry]);
    const renderOptions = useMemo<RenderOptions>(() => ({ mode: 'editor', assetSrc: (key) => pdfTemplateService.assetUrl(key), fieldLabel: (path) => labels.get(path) ?? path }), [labels]);
    const env = useMemo<Omit<BuilderEnv, 'context'>>(
        () => ({ module, registry, renderOptions, readOnly: Boolean(template?.isSystem), notify, saveToLibrary }),
        [module, registry, renderOptions, template?.isSystem, notify, saveToLibrary],
    );

    return (
        <BuilderProvider initialDoc={initialDoc} env={env} baseContext={baseContext}>
            <BuilderDnd>
                <BuilderLayout {...props} notify={notify} />
            </BuilderDnd>
            <Dialog
                open={Boolean(libraryItem)}
                onClose={() => setLibraryItem(null)}
                maxWidth="xs"
                fullWidth
                // Focus (and select) the name once the open animation is done; autoFocus fires while it is still hidden.
                slotProps={{ paper: { sx: { borderRadius: '12px' } }, transition: { onEntered: () => libraryNameRef.current?.select() } }}
            >
                <DialogTitle sx={{ fontSize: '1rem', fontWeight: 700 }}>Save to library</DialogTitle>
                <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    <Typography sx={{ fontSize: '0.82rem', color: '#475569' }}>Saved items appear in Contents → Saved for every quotation template. Inserting one places a copy.</Typography>
                    <TextField
                        inputRef={libraryNameRef}
                        size="small"
                        label="Name"
                        value={libraryItem?.name ?? ''}
                        onChange={(e) => setLibraryItem((item) => (item ? { ...item, name: e.target.value } : item))}
                        slotProps={{ htmlInput: { maxLength: 120 } }}
                    />
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button variant="outlined" onClick={() => setLibraryItem(null)} sx={secondaryButtonSx}>
                        Cancel
                    </Button>
                    <Button
                        variant="contained"
                        disabled={!libraryItem?.name.trim() || saveItem.isPending}
                        onClick={() => {
                            if (!libraryItem) return;
                            saveItem.mutate(
                                { name: libraryItem.name.trim(), content: libraryItem.content },
                                {
                                    onSuccess: () => {
                                        setLibraryItem(null);
                                        notify('Saved to the library');
                                    },
                                    onError: (err) => notify(errorMessage(err, 'Could not save to the library.'), 'error'),
                                },
                            );
                        }}
                        sx={primaryButtonSx}
                    >
                        Save
                    </Button>
                </DialogActions>
            </Dialog>
            <AppToast open={toast.open} message={toast.message} severity={toast.severity} onClose={() => setToast((t) => ({ ...t, open: false }))} />
        </BuilderProvider>
    );
}

// ─── Layout: top bar, panel, canvas, save flow ──────────────────────────────────

function BuilderLayout({ module, template, initialMeta, contextLoading, record, onRecordChange, notify }: ShellProps & { notify: (m: string, s?: Severity) => void }) {
    const router = useRouter();
    const queryClient = useQueryClient();
    const { doc, selection, edit, select, undo, redo, canUndo, canRedo, reset } = useBuilder();
    const { readOnly } = useBuilderEnv();
    const isNew = !template;

    const [meta, setMeta] = useState<TemplateMeta>(initialMeta);
    const [version, setVersion] = useState(template?.version ?? 0);
    const [zoom, setZoom] = useState(1);
    const [conflictOpen, setConflictOpen] = useState(false);
    const [preview, setPreview] = useState<{ open: boolean; url?: string; loading: boolean; error?: string }>({ open: false, loading: false });
    const [baseline, setBaseline] = useState(() => JSON.stringify({ doc, meta: initialMeta }));

    const create = useCreatePdfTemplate();
    const update = useUpdatePdfTemplate();
    const duplicate = useDuplicatePdfTemplate();
    const saving = create.isPending || update.isPending;

    const isDirty = !readOnly && JSON.stringify({ doc, meta }) !== baseline;
    const { confirmDiscard, discardModalOpen, handleKeepEditing, handleDiscardAndLeave } = useFormDraftGuard({ isDirty, enabled: !readOnly });

    const applySaved = useCallback(
        (saved: PdfTemplate) => {
            const savedMeta = { name: saved.name, description: saved.description, isActive: saved.isActive, isDefault: saved.isDefault };
            setVersion(saved.version);
            setMeta(savedMeta);
            reset(saved.document);
            setBaseline(JSON.stringify({ doc: saved.document, meta: savedMeta }));
        },
        [reset],
    );

    const submit = useCallback(
        async (overwriteVersion?: number) => {
            if (readOnly) return;
            if (!meta.name.trim()) {
                select(null);
                notify('Give the template a name (Document settings → General).', 'error');
                return;
            }
            const body = { name: meta.name.trim(), description: meta.description.trim(), isActive: meta.isActive, isDefault: meta.isDefault, document: doc };
            try {
                if (isNew) {
                    const created = await create.mutateAsync({ ...body, module });
                    setBaseline(JSON.stringify({ doc, meta }));
                    notify('Template created');
                    router.replace(ROUTES.PDF_TEMPLATE_EDIT(created.id));
                    return;
                }
                const saved = await update.mutateAsync({ id: template.id, input: { ...body, version: overwriteVersion ?? version } });
                applySaved(saved);
                notify('Template saved');
            } catch (err) {
                if (err instanceof ApiClientError && err.status === 409 && err.details?.code === 'VERSION_CONFLICT') {
                    setConflictOpen(true);
                    return;
                }
                const extra = err instanceof ApiClientError && (err.details?.errors?.length ?? 0) > 1 ? ` (+${(err.details?.errors?.length ?? 1) - 1} more)` : '';
                notify(`${errorMessage(err, 'The template could not be saved.')}${extra}`, 'error');
            }
        },
        [applySaved, create, doc, isNew, meta, module, notify, readOnly, router, select, template, update, version],
    );

    const openPreview = async () => {
        setPreview({ open: true, loading: true });
        try {
            const blob = await pdfTemplateService.previewPdf(module, doc, record?.id);
            setPreview({ open: true, loading: false, url: URL.createObjectURL(blob) });
        } catch (err) {
            setPreview({ open: true, loading: false, error: errorMessage(err, 'The PDF could not be generated.') });
        }
    };
    const closePreview = () => {
        if (preview.url) URL.revokeObjectURL(preview.url);
        setPreview({ open: false, loading: false });
    };

    // Keyboard shortcuts (not while typing in an input or editing text on the page).
    const keyState = useRef({ submit, selection, undo, redo, edit, select, readOnly });
    useEffect(() => {
        keyState.current = { submit, selection, undo, redo, edit, select, readOnly };
    });
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const s = keyState.current;
            const mod = e.ctrlKey || e.metaKey;
            if (mod && e.key.toLowerCase() === 's') {
                e.preventDefault();
                void s.submit();
                return;
            }
            if (isTyping(e.target) || s.readOnly) return;
            if (mod && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                if (e.shiftKey) s.redo();
                else s.undo();
            } else if (mod && e.key.toLowerCase() === 'y') {
                e.preventDefault();
                s.redo();
            } else if (e.key === 'Escape') {
                s.select(null);
            } else if ((e.key === 'Delete' || e.key === 'Backspace') && s.selection) {
                e.preventDefault();
                const sel = s.selection;
                s.edit((d) => removeSelected(d, sel), { select: null });
            } else if (mod && e.key.toLowerCase() === 'd' && s.selection) {
                e.preventDefault();
                const sel = s.selection;
                let id: string | null = null;
                s.edit((d) => {
                    id = sel.kind === 'section' ? duplicateSection(d, sel.id) : sel.kind === 'block' ? duplicateBlock(d, sel.id) : null;
                });
                if (id) s.select({ kind: sel.kind, id });
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

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
            await submit(latest.version);
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

    const zoomIndex = ZOOMS.indexOf(zoom);
    const iconBtn = { width: 32, height: 32, borderRadius: '8px', border: '1px solid #e2e8f0' } as const;

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, flex: 1, minHeight: 0 }}>
            {/* Top bar */}
            <Box sx={{ ...surfaceSx, px: 1.5, py: 1, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Button variant="outlined" size="small" startIcon={<ArrowBackRoundedIcon />} onClick={() => confirmDiscard(() => router.push(ROUTES.PDF_TEMPLATES))} sx={secondaryButtonSx}>
                    Templates
                </Button>
                <Box sx={{ minWidth: 0, flex: '1 1 200px', ml: 0.5 }}>
                    <Typography component="h1" noWrap sx={{ fontSize: '0.98rem', fontWeight: 700, color: '#0f172a' }}>
                        {meta.name || (isNew ? 'New PDF template' : template?.name)}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 0.5, mt: 0.25, flexWrap: 'wrap' }}>
                        {template?.isSystem && <StatusChip tone="system">System · read-only</StatusChip>}
                        {template?.isDefault && <StatusChip tone="default">Default</StatusChip>}
                        {template && <StatusChip tone={template.isActive ? 'active' : 'inactive'}>{template.isActive ? 'Active' : 'Inactive'}</StatusChip>}
                        {!isNew && <StatusChip tone="neutral">v{version}</StatusChip>}
                        {isDirty && <StatusChip tone="custom">Unsaved changes</StatusChip>}
                    </Box>
                </Box>

                {!readOnly && (
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <Tooltip title="Undo (Ctrl+Z)" arrow>
                            <span>
                                <IconButton aria-label="Undo" size="small" disabled={!canUndo} onClick={undo} sx={iconBtn}>
                                    <UndoRoundedIcon sx={{ fontSize: 18 }} />
                                </IconButton>
                            </span>
                        </Tooltip>
                        <Tooltip title="Redo (Ctrl+Shift+Z)" arrow>
                            <span>
                                <IconButton aria-label="Redo" size="small" disabled={!canRedo} onClick={redo} sx={iconBtn}>
                                    <RedoRoundedIcon sx={{ fontSize: 18 }} />
                                </IconButton>
                            </span>
                        </Tooltip>
                    </Box>
                )}
                <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                    <IconButton aria-label="Zoom out" size="small" disabled={zoomIndex <= 0} onClick={() => setZoom(ZOOMS[Math.max(0, zoomIndex - 1)])} sx={iconBtn}>
                        <ZoomOutRoundedIcon sx={{ fontSize: 18 }} />
                    </IconButton>
                    <Typography sx={{ fontSize: '0.76rem', fontWeight: 600, color: '#334155', width: 42, textAlign: 'center' }}>{Math.round(zoom * 100)}%</Typography>
                    <IconButton aria-label="Zoom in" size="small" disabled={zoomIndex >= ZOOMS.length - 1} onClick={() => setZoom(ZOOMS[Math.min(ZOOMS.length - 1, zoomIndex + 1)])} sx={iconBtn}>
                        <ZoomInRoundedIcon sx={{ fontSize: 18 }} />
                    </IconButton>
                </Box>
                <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
                <ToggleButtonGroup
                    exclusive
                    size="small"
                    value={record ? 'record' : 'sample'}
                    onChange={(_e, v: 'sample' | 'record' | null) => v === 'sample' && onRecordChange(null)}
                    aria-label="Preview data"
                    sx={{ '& .MuiToggleButton-root': { textTransform: 'none', fontSize: '0.74rem', py: 0.4, px: 1 } }}
                >
                    <ToggleButton value="sample">Sample data</ToggleButton>
                    <ToggleButton value="record" disabled={!record}>
                        Record
                    </ToggleButton>
                </ToggleButtonGroup>
                <Box sx={{ width: 230 }}>
                    <QuotationPicker value={record} onChange={onRecordChange} />
                </Box>
                {contextLoading && <CircularProgress size={16} aria-label="Loading record" />}
                <Box sx={{ flex: '1 1 0', display: { xs: 'none', lg: 'block' } }} />
                <Button variant="outlined" size="small" startIcon={<PictureAsPdfOutlinedIcon sx={{ fontSize: 18 }} />} onClick={() => void openPreview()} sx={{ ...secondaryButtonSx, height: 34 }}>
                    Preview PDF
                </Button>
                {readOnly ? (
                    <Button variant="contained" startIcon={duplicate.isPending ? <CircularProgress size={14} sx={{ color: '#fff' }} /> : <ContentCopyOutlinedIcon />} disabled={duplicate.isPending} onClick={() => void duplicateToEdit()} sx={{ ...primaryButtonSx, height: 34 }}>
                        Duplicate to edit
                    </Button>
                ) : (
                    <Button
                        variant="contained"
                        startIcon={saving ? <CircularProgress size={14} sx={{ color: '#fff' }} /> : <SaveOutlinedIcon />}
                        disabled={saving || (!isNew && !isDirty)}
                        onClick={() => void submit()}
                        aria-keyshortcuts="Control+S Meta+S"
                        sx={{ ...primaryButtonSx, height: 34 }}
                    >
                        {isNew ? 'Create template' : 'Save'}
                    </Button>
                )}
            </Box>

            {readOnly && (
                <Alert severity="info" sx={{ borderRadius: '10px', fontSize: '0.82rem', py: 0 }}>
                    This is a built-in template and can&apos;t be changed. Duplicate it to customise the layout, blocks and styling.
                </Alert>
            )}

            {/* Panel + canvas */}
            <Box sx={{ ...surfaceSx, overflow: 'hidden', display: 'flex', flexDirection: { xs: 'column', md: 'row' }, height: 'calc(100vh - 210px)', minHeight: 560 }}>
                <LeftPanel meta={meta} onMetaChange={(patch) => setMeta((m) => ({ ...m, ...patch }))} isNew={isNew} isCurrentDefault={Boolean(template?.isDefault)} />
                <Canvas zoom={zoom} />
            </Box>

            {/* Preview */}
            <Dialog open={preview.open} onClose={closePreview} maxWidth="lg" fullWidth slotProps={{ paper: { sx: { borderRadius: '12px', height: '90vh' } } }}>
                <DialogTitle sx={{ fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
                    PDF preview
                    <Typography component="span" sx={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 500 }}>
                        {record ? record.label : 'Sample data'} · unsaved changes included
                    </Typography>
                </DialogTitle>
                <DialogContent sx={{ p: 0, display: 'flex', flexDirection: 'column' }}>
                    {preview.loading && (
                        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5, color: '#64748b' }}>
                            <CircularProgress size={22} /> Generating PDF…
                        </Box>
                    )}
                    {preview.error && (
                        <Box sx={{ p: 3 }}>
                            <ErrorAlert error={preview.error} />
                        </Box>
                    )}
                    {preview.url && <Box component="iframe" title="PDF preview" src={preview.url} sx={{ flex: 1, border: 0, width: '100%' }} />}
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button variant="outlined" onClick={closePreview} sx={secondaryButtonSx}>
                        Close
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Version conflict */}
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
        </Box>
    );
}
