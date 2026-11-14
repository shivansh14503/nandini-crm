'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Button, FormControl, IconButton, InputLabel, MenuItem, Select, Tooltip, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import RadioButtonCheckedRoundedIcon from '@mui/icons-material/RadioButtonCheckedRounded';
import RadioButtonUncheckedRoundedIcon from '@mui/icons-material/RadioButtonUncheckedRounded';
import ToggleOnOutlinedIcon from '@mui/icons-material/ToggleOnOutlined';
import ToggleOffOutlinedIcon from '@mui/icons-material/ToggleOffOutlined';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import { ROUTES } from '@/config/constants';
import { AppToast } from '@/components/common/AppToast';
import { CommonActionModal } from '@/components/common/CommonActionModal';
import { ErrorAlert } from '@/components/common/ErrorAlert';
import { DataTable, TableRowActions, type DataTableColumn } from '@/components/common/DataTable';
import { errorMessage, inputSx, primaryButtonSx, surfaceSx } from '@/components/settings/form-customization/builderUi';
import {
    useDeletePdfTemplate,
    useDuplicatePdfTemplate,
    usePdfTemplates,
    useSetDefaultPdfTemplate,
    useSetPdfTemplateActive,
} from '@/hooks/queries/usePdfTemplates';
import { PDF_MODULE_LABELS, PDF_MODULES, type PdfModule, type PdfTemplateListItem } from '@/types/pdfTemplate.types';
import { NewTemplateDialog } from './NewTemplateDialog';
import { StatusChip } from './PdfTemplateChips';

const actionIconSx = {
    width: 28,
    height: 28,
    borderRadius: '6px',
    color: 'var(--mui-palette-text-secondary)',
    '&:hover': { color: 'var(--crm-blue-700)', backgroundColor: 'var(--mui-palette-primary-soft)' },
} as const;

const formatUpdated = (iso: string) => {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

type ModuleFilter = PdfModule | 'ALL';

/** Admin list of PDF templates with set-default / activate / duplicate / delete actions. */
export function PdfTemplatesListView() {
    const router = useRouter();
    const [moduleFilter, setModuleFilter] = useState<ModuleFilter>('ALL');
    const [newOpen, setNewOpen] = useState(false);
    const [toDelete, setToDelete] = useState<PdfTemplateListItem | null>(null);
    const [toast, setToast] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });

    const query = usePdfTemplates({ includeInactive: true });
    const duplicate = useDuplicatePdfTemplate();
    const setDefault = useSetDefaultPdfTemplate();
    const setActive = useSetPdfTemplateActive();
    const remove = useDeletePdfTemplate();
    const busy = duplicate.isPending || setDefault.isPending || setActive.isPending || remove.isPending;

    const rows = useMemo(() => (query.data ?? []).filter((t) => moduleFilter === 'ALL' || t.module === moduleFilter), [query.data, moduleFilter]);

    const notify = (message: string, severity: 'success' | 'error' = 'success') => setToast({ open: true, message, severity });
    const run = async (action: () => Promise<unknown>, success: string) => {
        try {
            await action();
            notify(success);
        } catch (err) {
            notify(errorMessage(err), 'error');
        }
    };

    /** The default must be active, so an inactive template is activated first. */
    const makeDefault = (t: PdfTemplateListItem) =>
        run(
            async () => {
                if (!t.isActive) await setActive.mutateAsync({ id: t.id, isActive: true });
                await setDefault.mutateAsync(t.id);
            },
            t.isActive ? `"${t.name}" is now the default` : `"${t.name}" activated and set as the default`,
        );

    const columns: DataTableColumn<PdfTemplateListItem>[] = [
        {
            id: 'name',
            label: 'Name',
            locked: true,
            minWidth: 220,
            render: (t) => (
                <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--crm-slate-900)' }}>{t.name}</Typography>
                    {t.description && (
                        <Typography noWrap sx={{ fontSize: '0.75rem', color: 'var(--mui-palette-text-secondary)', maxWidth: 420 }}>
                            {t.description}
                        </Typography>
                    )}
                </Box>
            ),
        },
        { id: 'module', label: 'Module', render: (t) => PDF_MODULE_LABELS[t.module] },
        {
            id: 'default',
            label: 'Default',
            align: 'center',
            minWidth: 130,
            render: (t) =>
                t.isDefault ? (
                    <Tooltip title={`Used when users click Print / PDF on a ${PDF_MODULE_LABELS[t.module].toLowerCase()}`}>
                        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, color: 'var(--crm-text-blue-700)' }}>
                            <RadioButtonCheckedRoundedIcon sx={{ fontSize: 18 }} />
                            <StatusChip tone="default">Default</StatusChip>
                        </Box>
                    </Tooltip>
                ) : (
                    <Tooltip title={t.isActive ? 'Use this template for Print / PDF' : 'Activates it and uses it for Print / PDF'}>
                        <span>
                            <Button
                                size="small"
                                variant="text"
                                aria-label={`Make ${t.name} the default template`}
                                disabled={busy}
                                startIcon={<RadioButtonUncheckedRoundedIcon sx={{ fontSize: '18px !important' }} />}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    void makeDefault(t);
                                }}
                                sx={{ textTransform: 'none', fontSize: '0.78rem', fontWeight: 600, color: 'var(--mui-palette-text-secondary)', borderRadius: '8px', px: 1, '&:hover': { color: 'var(--crm-blue-700)', backgroundColor: 'var(--mui-palette-primary-soft)' } }}
                            >
                                Make default
                            </Button>
                        </span>
                    </Tooltip>
                ),
        },
        { id: 'status', label: 'Status', align: 'center', render: (t) => <StatusChip tone={t.isActive ? 'active' : 'inactive'}>{t.isActive ? 'Active' : 'Inactive'}</StatusChip> },
        { id: 'type', label: 'Type', align: 'center', render: (t) => <StatusChip tone={t.isSystem ? 'system' : 'custom'}>{t.isSystem ? 'System' : 'Custom'}</StatusChip> },
        { id: 'page', label: 'Page', render: (t) => `${t.pageSize} · ${t.orientation === 'portrait' ? 'Portrait' : 'Landscape'}` },
        {
            id: 'updated',
            label: 'Updated',
            minWidth: 170,
            render: (t) => (
                <Box>
                    <Typography sx={{ fontSize: '0.8rem', color: 'var(--crm-slate-700)' }}>{formatUpdated(t.updatedAt)}</Typography>
                    <Typography sx={{ fontSize: '0.72rem', color: 'var(--mui-palette-text-muted)' }}>{t.updatedBy || t.createdBy}</Typography>
                </Box>
            ),
        },
    ];

    const renderActions = (t: PdfTemplateListItem) => (
        <TableRowActions
            editHref={ROUTES.PDF_TEMPLATE_EDIT(t.id)}
            editTooltip={t.isSystem ? 'View (read-only)' : 'Edit'}
            onDelete={t.isSystem || t.isDefault ? undefined : () => setToDelete(t)}
            deleteTooltip="Delete"
        >
            <Tooltip title="Duplicate">
                <span>
                    <IconButton
                        size="small"
                        aria-label={`Duplicate ${t.name}`}
                        disabled={busy}
                        onClick={(e) => {
                            e.stopPropagation();
                            void run(async () => {
                                const copy = await duplicate.mutateAsync({ id: t.id });
                                router.push(ROUTES.PDF_TEMPLATE_EDIT(copy.id));
                            }, `"${t.name}" duplicated`);
                        }}
                        sx={actionIconSx}
                    >
                        <ContentCopyOutlinedIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                </span>
            </Tooltip>
            <Tooltip title={t.isDefault ? 'The default template cannot be deactivated' : t.isActive ? 'Deactivate' : 'Activate'}>
                <span>
                    <IconButton
                        size="small"
                        aria-label={`${t.isActive ? 'Deactivate' : 'Activate'} ${t.name}`}
                        disabled={busy || t.isDefault}
                        onClick={(e) => {
                            e.stopPropagation();
                            void run(() => setActive.mutateAsync({ id: t.id, isActive: !t.isActive }), `"${t.name}" ${t.isActive ? 'deactivated' : 'activated'}`);
                        }}
                        sx={actionIconSx}
                    >
                        {t.isActive ? <ToggleOnOutlinedIcon sx={{ fontSize: 18, color: 'var(--crm-emerald-600)' }} /> : <ToggleOffOutlinedIcon sx={{ fontSize: 18 }} />}
                    </IconButton>
                </span>
            </Tooltip>
        </TableRowActions>
    );

    return (
        <>
            <Box sx={{ ...surfaceSx, p: { xs: 2, md: 2.5 }, mb: 2, display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                <Box sx={{ width: 40, height: 40, borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--mui-palette-primary-soft)', border: '1px solid var(--mui-palette-primary-softBorder)', color: 'var(--crm-text-blue-600)' }}>
                    <PictureAsPdfOutlinedIcon />
                </Box>
                <Box sx={{ flex: '1 1 260px', minWidth: 0 }}>
                    <Typography component="h1" sx={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--crm-slate-900)' }}>
                        PDF Templates
                    </Typography>
                    <Typography sx={{ fontSize: '0.8rem', color: 'var(--mui-palette-text-secondary)' }}>
                        System templates are read-only; duplicate one to customise it. The default template is used when users click Print / PDF.
                    </Typography>
                </Box>
                <FormControl size="small" sx={{ ...inputSx, minWidth: 170 }}>
                    <InputLabel id="pdf-module-filter">Module</InputLabel>
                    <Select labelId="pdf-module-filter" label="Module" value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value as ModuleFilter)}>
                        <MenuItem value="ALL">All modules</MenuItem>
                        {PDF_MODULES.map((m) => (
                            <MenuItem key={m} value={m}>
                                {PDF_MODULE_LABELS[m]}
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>
                <Button variant="contained" startIcon={<AddIcon />} onClick={() => setNewOpen(true)} sx={{ ...primaryButtonSx, height: 36 }}>
                    New template
                </Button>
            </Box>

            <ErrorAlert error={query.isError ? errorMessage(query.error, 'PDF templates could not be loaded.') : null} />

            <Box sx={{ ...surfaceSx, overflow: 'hidden' }}>
                <DataTable<PdfTemplateListItem>
                    data={rows}
                    columns={columns}
                    selectable={false}
                    keyExtractor={(t) => t.id}
                    renderActions={renderActions}
                    actionsWidth={190}
                    onRowClick={(t) => router.push(ROUTES.PDF_TEMPLATE_EDIT(t.id))}
                    emptyTitle={query.isLoading ? 'Loading templates…' : 'No PDF templates'}
                    emptyDescription={query.isLoading ? undefined : 'Create a template, or restart the API to restore the built-in ones.'}
                    minHeight={260}
                />
            </Box>

            <NewTemplateDialog
                open={newOpen}
                templates={query.data ?? []}
                onClose={() => setNewOpen(false)}
                onContinue={(module, sourceId) => {
                    setNewOpen(false);
                    const qs = new URLSearchParams({ module });
                    if (sourceId) qs.set('from', sourceId);
                    router.push(`${ROUTES.PDF_TEMPLATE_NEW}?${qs.toString()}`);
                }}
            />

            <CommonActionModal
                open={Boolean(toDelete)}
                title={`Delete "${toDelete?.name ?? ''}"?`}
                description="The template is removed for everyone. PDFs already downloaded are not affected."
                reasonLabel="Reason (optional)"
                confirmLabel="Delete template"
                confirmColor="error"
                loading={remove.isPending}
                onClose={() => setToDelete(null)}
                onConfirm={async () => {
                    if (!toDelete) return;
                    const target = toDelete;
                    await run(() => remove.mutateAsync(target.id), `"${target.name}" deleted`);
                    setToDelete(null);
                }}
            />

            <AppToast open={toast.open} message={toast.message} severity={toast.severity} onClose={() => setToast((t) => ({ ...t, open: false }))} />
        </>
    );
}
