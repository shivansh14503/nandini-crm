'use client';

import React from 'react';
import { Box, Breadcrumbs, Button, IconButton, Link, Tooltip, Typography } from '@mui/material';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import ViewWeekOutlinedIcon from '@mui/icons-material/ViewWeekOutlined';
import CropPortraitOutlinedIcon from '@mui/icons-material/CropPortraitOutlined';
import { BLOCK_LABELS, PAGE_SIZES, SECTION_PRESETS, type Style } from '@/lib/pdf-document';
import { LabeledSwitch } from '@/components/settings/form-customization/builderUi';
import { BLOCK_ICONS, blockName } from '../blockMeta';
import { useBuilder, useBuilderEnv } from '../state/builderState';
import { BAND_LABELS, findBlock, findColumn, findSection, removeColumn, setColumnWidths, type Selection } from '../state/docOps';
import { BlockSettings } from './BlockSettings';
import { ColorInput, Field, NumberInput, PanelSection, SelectInput, StyleEditor, TextInput } from './controls';
import { ImageUploadField } from './ImageUploadField';

/** Template-level fields that live outside the document (not part of undo history). */
export interface TemplateMeta {
    name: string;
    description: string;
    isActive: boolean;
    isDefault: boolean;
}

function applyStylePatch(style: Style, patch: Partial<Style>): void {
    for (const [key, value] of Object.entries(patch) as [keyof Style, unknown][]) {
        if (value === undefined) delete style[key];
        else (style as Record<string, unknown>)[key] = value;
    }
}

// ─── Document ───────────────────────────────────────────────────────────────────

function DocumentSettings({ meta, onMetaChange, isNew, isCurrentDefault }: { meta: TemplateMeta; onMetaChange: (patch: Partial<TemplateMeta>) => void; isNew: boolean; isCurrentDefault: boolean }) {
    const { doc, edit } = useBuilder();
    const { readOnly, notify } = useBuilderEnv();
    const disabled = readOnly;
    const m = doc.page.margins;
    const t = doc.theme;
    const setMargin = (key: keyof typeof m, v: number | undefined) => edit((d) => void (d.page.margins[key] = v ?? 0), { coalesceKey: `margin:${key}` });
    const setTheme = <K extends keyof typeof t>(key: K, v: (typeof t)[K], coalesce = true) => edit((d) => void (d.theme[key] = v), coalesce ? { coalesceKey: `theme:${String(key)}` } : undefined);

    return (
        <>
            <PanelSection title="General" defaultExpanded>
                <Field label="Template name">
                    <TextInput value={meta.name} onChange={(v) => onMetaChange({ name: v })} disabled={disabled} ariaLabel="Template name" maxLength={120} />
                </Field>
                <Field label="Description">
                    <TextInput value={meta.description} onChange={(v) => onMetaChange({ description: v })} disabled={disabled} ariaLabel="Template description" multiline maxLength={500} />
                </Field>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--crm-slate-700)' }}>Active</Typography>
                    <LabeledSwitch label="Active" checked={meta.isActive} disabled={disabled || isCurrentDefault} disabledReason={isCurrentDefault ? 'The default template must stay active.' : undefined} onChange={(v) => onMetaChange({ isActive: v, ...(v ? {} : { isDefault: false }) })} />
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box>
                        <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--crm-slate-700)' }}>Default</Typography>
                        <Typography sx={{ fontSize: '0.68rem', color: 'var(--mui-palette-text-muted)' }}>Used when users click Print / PDF</Typography>
                    </Box>
                    <LabeledSwitch
                        label="Default"
                        checked={meta.isDefault}
                        disabled={disabled || isCurrentDefault || !meta.isActive}
                        disabledReason={isCurrentDefault ? 'Make another template the default instead.' : !meta.isActive ? 'Activate the template first.' : undefined}
                        onChange={(v) => onMetaChange({ isDefault: v })}
                    />
                </Box>
                {isNew && <Typography sx={{ fontSize: '0.7rem', color: 'var(--mui-palette-text-muted)' }}>Nothing is stored until you click Create template.</Typography>}
            </PanelSection>
            <PanelSection title="Page">
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                    <Field label="Size">
                        <SelectInput value={doc.page.size} onChange={(v) => edit((d) => void (d.page.size = v))} options={PAGE_SIZES.map((s) => ({ value: s, label: s }))} disabled={disabled} ariaLabel="Page size" />
                    </Field>
                    <Field label="Orientation">
                        <SelectInput
                            value={doc.page.orientation}
                            onChange={(v) => edit((d) => void (d.page.orientation = v))}
                            options={[
                                { value: 'portrait', label: 'Portrait' },
                                { value: 'landscape', label: 'Landscape' },
                            ]}
                            disabled={disabled}
                            ariaLabel="Orientation"
                        />
                    </Field>
                </Box>
                <Field label="Margins (mm)" hint="Top / bottom must leave room for the header / footer: they print inside these margins.">
                    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0.5 }}>
                        {(['top', 'right', 'bottom', 'left'] as const).map((k) => (
                            <Box key={k}>
                                <Typography sx={{ fontSize: '0.64rem', color: 'var(--mui-palette-text-muted)', textAlign: 'center', textTransform: 'capitalize' }}>{k}</Typography>
                                <NumberInput value={m[k]} onChange={(v) => setMargin(k, v)} min={0} max={k === 'top' || k === 'bottom' ? 120 : 80} step={0.5} disabled={disabled} ariaLabel={`${k} margin (mm)`} />
                            </Box>
                        ))}
                    </Box>
                </Field>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                    <Field label="Header offset" hint="From the page top">
                        <NumberInput value={m.header} onChange={(v) => setMargin('header', v)} min={0} max={60} step={0.5} unit="mm" disabled={disabled} ariaLabel="Header offset (mm)" />
                    </Field>
                    <Field label="Footer offset" hint="From the page bottom">
                        <NumberInput value={m.footer} onChange={(v) => setMargin('footer', v)} min={0} max={60} step={0.5} unit="mm" disabled={disabled} ariaLabel="Footer offset (mm)" />
                    </Field>
                </Box>
            </PanelSection>
            <PanelSection title="Theme">
                <Field label="Accent colour" hint="Used wherever a colour is set to “Accent”">
                    <ColorInput value={t.accentColor} onChange={(v) => v && v !== 'accent' && setTheme('accentColor', v)} accent={t.accentColor} allowAccent={false} allowNone={false} disabled={disabled} ariaLabel="Accent colour" />
                </Field>
                <Field label="Text colour">
                    <ColorInput value={t.textColor} onChange={(v) => v && v !== 'accent' && setTheme('textColor', v)} accent={t.accentColor} allowAccent={false} allowNone={false} disabled={disabled} ariaLabel="Text colour" />
                </Field>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                    <Field label="Base font size">
                        <NumberInput value={t.fontSize} onChange={(v) => setTheme('fontSize', v ?? 9.5)} min={6} max={16} step={0.5} unit="pt" disabled={disabled} ariaLabel="Base font size" />
                    </Field>
                    <Field label="Line height">
                        <NumberInput value={t.lineHeight} onChange={(v) => setTheme('lineHeight', v ?? 1.4)} min={1} max={2.5} step={0.05} disabled={disabled} ariaLabel="Line height" />
                    </Field>
                </Box>
            </PanelSection>
            <PanelSection title="Company">
                <Field label="Logo">
                    <ImageUploadField value={t.logoAssetKey} onChange={(key) => edit((d) => void (key ? (d.theme.logoAssetKey = key) : delete d.theme.logoAssetKey))} onError={(msg) => notify(msg, 'error')} disabled={disabled} emptyLabel="No logo" />
                </Field>
                {(
                    [
                        ['companyName', 'Company name', 200, false],
                        ['companyAddress', 'Address', 1000, true],
                        ['companyPhone', 'Phone', 100, false],
                        ['companyEmail', 'Email', 200, false],
                        ['companyGstin', 'GSTIN', 50, false],
                        ['companyWebsite', 'Website', 200, false],
                    ] as const
                ).map(([key, label, max, multiline]) => (
                    <Field key={key} label={label}>
                        <TextInput value={t[key]} onChange={(v) => setTheme(key, v)} disabled={disabled} ariaLabel={label} maxLength={max} multiline={multiline} />
                    </Field>
                ))}
            </PanelSection>
        </>
    );
}

// ─── Section / column ───────────────────────────────────────────────────────────

function SectionSettings({ id }: { id: string }) {
    const { doc, edit } = useBuilder();
    const { readOnly } = useBuilderEnv();
    const at = findSection(doc, id);
    if (!at) return null;
    const widths = at.section.columns.map((c) => c.widthPct);
    const key = widths.map((w) => Math.round(w)).join('-');
    return (
        <>
            <PanelSection title="Columns" defaultExpanded>
                <Field label="Layout">
                    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0.75 }}>
                        {SECTION_PRESETS.map((preset) => {
                            const active = preset.widths.map((w) => Math.round(w)).join('-') === key;
                            return (
                                <Tooltip key={preset.key} title={preset.label} arrow>
                                    <Box
                                        component="button"
                                        type="button"
                                        disabled={readOnly}
                                        aria-label={preset.label}
                                        aria-pressed={active}
                                        onClick={() => edit((d) => setColumnWidths(d, id, preset.widths))}
                                        sx={{ display: 'flex', gap: '2px', p: 0.75, height: 30, borderRadius: '6px', border: `1px solid ${active ? 'var(--mui-palette-primary-main)' : 'var(--mui-palette-border-strong)'}`, backgroundColor: active ? 'var(--mui-palette-primary-soft)' : 'var(--mui-palette-background-paper)', cursor: 'pointer' }}
                                    >
                                        {preset.widths.map((w, i) => (
                                            <Box key={i} sx={{ flex: w, backgroundColor: active ? 'var(--crm-blue-300)' : 'var(--crm-slate-200)', borderRadius: '2px' }} />
                                        ))}
                                    </Box>
                                </Tooltip>
                            );
                        })}
                    </Box>
                </Field>
                <Field label="Widths (%)" hint="Or drag the bars between columns on the page.">
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                        {at.section.columns.map((c, i) => (
                            <NumberInput
                                key={c.id}
                                value={Math.round(c.widthPct * 100) / 100}
                                onChange={(v) => {
                                    if (v === undefined) return;
                                    const next = [...widths];
                                    next[i] = v;
                                    edit((d) => setColumnWidths(d, id, next), { coalesceKey: `widths:${id}` });
                                }}
                                min={5}
                                max={95}
                                disabled={readOnly}
                                ariaLabel={`Column ${i + 1} width (%)`}
                            />
                        ))}
                    </Box>
                </Field>
            </PanelSection>
            <StyleEditor
                kind="section"
                style={at.section.style}
                accent={doc.theme.accentColor}
                disabled={readOnly}
                groups={['background', 'spacing', 'border', 'typography', 'layout']}
                onChange={(patch) =>
                    edit(
                        (d) => {
                            const s = findSection(d, id);
                            if (s) applyStylePatch(s.section.style, patch);
                        },
                        { coalesceKey: `style:${id}:${Object.keys(patch).join(',')}` },
                    )
                }
            />
        </>
    );
}

function ColumnSettings({ id }: { id: string }) {
    const { doc, edit } = useBuilder();
    const { readOnly } = useBuilderEnv();
    const at = findColumn(doc, id);
    if (!at) return null;
    return (
        <>
            <PanelSection title="Column" defaultExpanded>
                <Typography sx={{ fontSize: '0.78rem', color: 'var(--crm-slate-600)' }}>
                    Column {at.columnIndex + 1} of {at.section.columns.length} · {Math.round(at.column.widthPct)}% wide · {at.column.blocks.length} block{at.column.blocks.length === 1 ? '' : 's'}
                </Typography>
                <Box>
                    <Button
                        size="small"
                        variant="outlined"
                        color="error"
                        disabled={readOnly}
                        startIcon={<DeleteOutlineRoundedIcon sx={{ fontSize: 16 }} />}
                        onClick={() => edit((d) => removeColumn(d, id), { select: null })}
                        sx={{ textTransform: 'none', fontSize: '0.76rem' }}
                    >
                        {at.section.columns.length === 1 ? 'Delete column and section' : 'Delete column'}
                    </Button>
                    <Typography sx={{ fontSize: '0.68rem', color: 'var(--mui-palette-text-muted)', mt: 0.5 }}>
                        {at.section.columns.length === 1
                            ? 'This is the only column, so the whole section is removed.'
                            : 'Its blocks are deleted too; the neighbouring column takes over its width.'}
                    </Typography>
                </Box>
            </PanelSection>
            <StyleEditor
                kind="column"
                style={at.column.style}
                accent={doc.theme.accentColor}
                disabled={readOnly}
                groups={['layout', 'background', 'spacing', 'border', 'typography']}
                onChange={(patch) =>
                    edit(
                        (d) => {
                            const c = findColumn(d, id);
                            if (c) applyStylePatch(c.column.style, patch);
                        },
                        { coalesceKey: `style:${id}:${Object.keys(patch).join(',')}` },
                    )
                }
            />
        </>
    );
}

function BlockStyling({ id }: { id: string }) {
    const { doc, edit } = useBuilder();
    const { readOnly } = useBuilderEnv();
    const at = findBlock(doc, id);
    if (!at) return null;
    return (
        <>
            <BlockSettings block={at.block} />
            <StyleEditor
                kind="block"
                style={at.block.style}
                accent={doc.theme.accentColor}
                disabled={readOnly}
                groups={['typography', 'background', 'spacing', 'border', 'layout']}
                onChange={(patch) =>
                    edit(
                        (d) => {
                            const b = findBlock(d, id);
                            if (b) applyStylePatch(b.block.style, patch);
                        },
                        { coalesceKey: `style:${id}:${Object.keys(patch).join(',')}` },
                    )
                }
            />
        </>
    );
}

// ─── Panel ──────────────────────────────────────────────────────────────────────

interface Crumb {
    label: string;
    selection: Selection | null;
}

export function StylingTab({ meta, onMetaChange, isNew, isCurrentDefault }: { meta: TemplateMeta; onMetaChange: (patch: Partial<TemplateMeta>) => void; isNew: boolean; isCurrentDefault: boolean }) {
    const { doc, selection, select } = useBuilder();

    const crumbs: Crumb[] = [{ label: 'Document', selection: null }];
    let title = 'Document settings';
    let icon: React.ReactNode = <DescriptionOutlinedIcon sx={{ fontSize: 20 }} />;
    if (selection) {
        const sectionId = selection.kind === 'section' ? selection.id : selection.kind === 'column' ? findColumn(doc, selection.id)?.section.id : findBlock(doc, selection.id)?.section.id;
        const sec = sectionId ? findSection(doc, sectionId) : null;
        if (sec) crumbs.push({ label: `${BAND_LABELS[sec.band]} · Section ${sec.index + 1}`, selection: { kind: 'section', id: sec.section.id } });
        if (selection.kind === 'section') {
            title = 'Section';
            icon = <ViewWeekOutlinedIcon sx={{ fontSize: 20 }} />;
        }
        if (selection.kind === 'column' || selection.kind === 'block') {
            const col = selection.kind === 'column' ? findColumn(doc, selection.id) : findBlock(doc, selection.id);
            if (col) crumbs.push({ label: `Column ${col.columnIndex + 1}`, selection: { kind: 'column', id: col.column.id } });
            if (selection.kind === 'column') {
                title = 'Column';
                icon = <CropPortraitOutlinedIcon sx={{ fontSize: 20 }} />;
            }
        }
        if (selection.kind === 'block') {
            const b = findBlock(doc, selection.id);
            if (b) {
                crumbs.push({ label: BLOCK_LABELS[b.block.type], selection });
                title = blockName(b.block);
                const Icon = BLOCK_ICONS[b.block.type];
                icon = <Icon sx={{ fontSize: 20 }} />;
            }
        }
    }

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
            <Box sx={{ px: 2, py: 1, borderBottom: '1px solid var(--mui-palette-border-main)', backgroundColor: 'var(--mui-palette-background-subtle)' }}>
                <Breadcrumbs separator="›" aria-label="Selection path" sx={{ '& .MuiBreadcrumbs-separator': { mx: 0.5, color: 'var(--mui-palette-text-muted)' } }}>
                    {crumbs.map((c, i) =>
                        i === crumbs.length - 1 ? (
                            <Typography key={c.label} sx={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--crm-text-blue-700)' }}>
                                {c.label}
                            </Typography>
                        ) : (
                            <Link key={c.label} component="button" type="button" underline="hover" onClick={() => select(c.selection)} sx={{ fontSize: '0.74rem', color: 'var(--crm-slate-600)' }}>
                                {c.label}
                            </Link>
                        ),
                    )}
                </Breadcrumbs>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 2, py: 1.5, borderBottom: '1px solid var(--mui-palette-border-main)' }}>
                <Box sx={{ width: 36, height: 36, borderRadius: '8px', backgroundColor: 'var(--mui-palette-primary-soft)', color: 'var(--crm-text-blue-700)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</Box>
                <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: 'var(--crm-slate-900)', flex: 1, minWidth: 0 }} noWrap title={title}>
                    {title}
                </Typography>
                {selection && (
                    <Tooltip title="Close (Esc)" arrow>
                        <IconButton aria-label="Close settings" size="small" onClick={() => select(null)}>
                            <CloseRoundedIcon />
                        </IconButton>
                    </Tooltip>
                )}
            </Box>
            <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                {!selection && <DocumentSettings meta={meta} onMetaChange={onMetaChange} isNew={isNew} isCurrentDefault={isCurrentDefault} />}
                {selection?.kind === 'section' && <SectionSettings key={selection.id} id={selection.id} />}
                {selection?.kind === 'column' && <ColumnSettings key={selection.id} id={selection.id} />}
                {selection?.kind === 'block' && <BlockStyling key={selection.id} id={selection.id} />}
            </Box>
        </Box>
    );
}

