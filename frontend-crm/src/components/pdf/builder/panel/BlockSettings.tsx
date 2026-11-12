'use client';

import React from 'react';
import { Box, Button, Checkbox, IconButton, Tooltip, Typography } from '@mui/material';
import ArrowUpwardRoundedIcon from '@mui/icons-material/ArrowUpwardRounded';
import ArrowDownwardRoundedIcon from '@mui/icons-material/ArrowDownwardRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import { BLOCK_LABELS, newId, type Block, type BlockOf, type BlockType } from '@/lib/pdf-document';
import type { PdfFieldDefinition } from '@/types/pdfTemplate.types';
import { secondaryButtonSx } from '@/components/settings/form-customization/builderUi';
import { FieldPickerButton } from '../common/FieldPicker';
import { useBuilder, useBuilderEnv } from '../state/builderState';
import { findBlock } from '../state/docOps';
import { ColorInput, Field, NumberInput, PanelSection, Segmented, SelectInput, SwitchRow, TextInput } from './controls';
import { ImageUploadField } from './ImageUploadField';

/** The "<Block> settings" accordion: what the block shows (its props), per block type. */

type Props<T extends BlockType> = {
    block: BlockOf<T>;
    set: (recipe: (props: BlockOf<T>['props']) => void, coalesceKey?: string) => void;
    disabled: boolean;
    fields: PdfFieldDefinition[];
    accent: string;
};

function moveItem<T>(list: T[], from: number, to: number): void {
    if (to < 0 || to >= list.length) return;
    const [item] = list.splice(from, 1);
    list.splice(to, 0, item);
}

function RowActions({ index, count, onMove, onRemove, disabled, label }: { index: number; count: number; onMove: (to: number) => void; onRemove?: () => void; disabled: boolean; label: string }) {
    const btn = { width: 24, height: 24, color: '#64748b' } as const;
    return (
        <Box sx={{ display: 'flex', flexShrink: 0 }}>
            <IconButton size="small" aria-label={`Move ${label} up`} disabled={disabled || index === 0} onClick={() => onMove(index - 1)} sx={btn}>
                <ArrowUpwardRoundedIcon sx={{ fontSize: 15 }} />
            </IconButton>
            <IconButton size="small" aria-label={`Move ${label} down`} disabled={disabled || index === count - 1} onClick={() => onMove(index + 1)} sx={btn}>
                <ArrowDownwardRoundedIcon sx={{ fontSize: 15 }} />
            </IconButton>
            {onRemove && (
                <IconButton size="small" aria-label={`Remove ${label}`} disabled={disabled} onClick={onRemove} sx={{ ...btn, '&:hover': { color: '#dc2626' } }}>
                    <CloseRoundedIcon sx={{ fontSize: 15 }} />
                </IconButton>
            )}
        </Box>
    );
}

const rowSx = { display: 'flex', alignItems: 'center', gap: 0.75, p: 0.75, borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc' } as const;

function fieldLabel(fields: PdfFieldDefinition[], path: string): string {
    return fields.find((f) => f.path === path)?.label ?? `Unknown field (${path})`;
}

// ─── Per type ───────────────────────────────────────────────────────────────────

function TextLike({ block }: { block: BlockOf<'title'> | BlockOf<'text'> }) {
    const { setEditingBlock } = useBuilder();
    const { readOnly } = useBuilderEnv();
    return (
        <Button variant="outlined" size="small" startIcon={<EditOutlinedIcon sx={{ fontSize: 16 }} />} disabled={readOnly} onClick={() => setEditingBlock(block.id)} sx={{ ...secondaryButtonSx, alignSelf: 'flex-start' }}>
            Edit text on the page
        </Button>
    );
}

function ImageSettings({ block, set, disabled }: Props<'image'>) {
    const { notify } = useBuilderEnv();
    const p = block.props;
    return (
        <>
            <Field label="Image">
                <Segmented
                    value={p.source}
                    onChange={(v) => set((pp) => void (pp.source = v))}
                    options={[
                        { value: 'logo', label: 'Company logo' },
                        { value: 'asset', label: 'Uploaded image' },
                    ]}
                    disabled={disabled}
                    ariaLabel="Image source"
                />
            </Field>
            {p.source === 'asset' ? (
                <ImageUploadField value={p.assetKey} onChange={(key) => set((pp) => void (pp.assetKey = key))} onError={(m) => notify(m, 'error')} disabled={disabled} removable={false} />
            ) : (
                <Typography sx={{ fontSize: '0.74rem', color: '#64748b' }}>Uses the logo set in Document settings → Company.</Typography>
            )}
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                <Field label="Width" hint="0 = natural">
                    <NumberInput value={p.widthMm} onChange={(v) => set((pp) => void (pp.widthMm = v ?? 0), 'img-w')} min={0} max={300} unit="mm" disabled={disabled} ariaLabel="Image width" />
                </Field>
                <Field label="Height" hint="0 = auto">
                    <NumberInput value={p.heightMm} onChange={(v) => set((pp) => void (pp.heightMm = v ?? 0), 'img-h')} min={0} max={300} unit="mm" disabled={disabled} ariaLabel="Image height" />
                </Field>
            </Box>
            <Field label="Alignment">
                <Segmented
                    value={p.align}
                    onChange={(v) => set((pp) => void (pp.align = v))}
                    options={[
                        { value: 'left', label: 'Left' },
                        { value: 'center', label: 'Center' },
                        { value: 'right', label: 'Right' },
                    ]}
                    disabled={disabled}
                    ariaLabel="Image alignment"
                />
            </Field>
            <Field label="Alt text">
                <TextInput value={p.alt} onChange={(v) => set((pp) => void (pp.alt = v), 'img-alt')} disabled={disabled} ariaLabel="Alt text" maxLength={120} />
            </Field>
        </>
    );
}

function DividerSettings({ block, set, disabled, accent }: Props<'divider'>) {
    const p = block.props;
    return (
        <>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                <Field label="Thickness">
                    <NumberInput value={p.thickness} onChange={(v) => set((pp) => void (pp.thickness = v ?? 1), 'div-t')} min={0.5} max={10} step={0.5} unit="px" disabled={disabled} ariaLabel="Line thickness" />
                </Field>
                <Field label="Width">
                    <NumberInput value={p.widthPct} onChange={(v) => set((pp) => void (pp.widthPct = v ?? 100), 'div-w')} min={5} max={100} unit="%" disabled={disabled} ariaLabel="Line width" />
                </Field>
            </Box>
            <Field label="Line style">
                <Segmented
                    value={p.lineStyle}
                    onChange={(v) => set((pp) => void (pp.lineStyle = v))}
                    options={[
                        { value: 'solid', label: 'Solid' },
                        { value: 'dashed', label: 'Dashed' },
                        { value: 'dotted', label: 'Dotted' },
                    ]}
                    disabled={disabled}
                    ariaLabel="Line style"
                />
            </Field>
            <Field label="Colour">
                <ColorInput value={p.color} onChange={(v) => set((pp) => void (pp.color = v ?? '#cbd5e1'))} accent={accent} allowNone={false} disabled={disabled} ariaLabel="Line colour" />
            </Field>
        </>
    );
}

function FieldSettings({ block, set, disabled, fields, accent }: Props<'field'>) {
    const p = block.props;
    return (
        <>
            <Field label="Field">
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: '#0f172a', flex: 1, minWidth: 0 }} noWrap>
                        {fieldLabel(fields, p.path)}
                    </Typography>
                    <FieldPickerButton
                        fields={fields}
                        label="Change"
                        variant="compact"
                        disabled={disabled}
                        onPick={(f) =>
                            set((pp) => {
                                pp.path = f.path;
                                pp.label = f.label;
                            })
                        }
                    />
                </Box>
            </Field>
            <Field label="Label">
                <TextInput value={p.label} onChange={(v) => set((pp) => void (pp.label = v), 'field-label')} disabled={disabled} ariaLabel="Field label" maxLength={80} />
            </Field>
            <SwitchRow label="Show label" checked={p.showLabel} onChange={(v) => set((pp) => void (pp.showLabel = v))} disabled={disabled} />
            <Field label="Layout">
                <Segmented
                    value={p.layout}
                    onChange={(v) => set((pp) => void (pp.layout = v))}
                    options={[
                        { value: 'inline', label: 'Label: value' },
                        { value: 'stacked', label: 'Label above' },
                    ]}
                    disabled={disabled}
                    ariaLabel="Field layout"
                />
            </Field>
            <SwitchRow label="Bold label" checked={p.labelBold} onChange={(v) => set((pp) => void (pp.labelBold = v))} disabled={disabled} />
            <Field label="Label colour">
                <ColorInput value={p.labelColor} onChange={(v) => set((pp) => void (pp.labelColor = v))} accent={accent} disabled={disabled} ariaLabel="Label colour" />
            </Field>
        </>
    );
}

function DetailsListSettings({ block, set, disabled, fields, accent }: Props<'detailsList'>) {
    const p = block.props;
    return (
        <>
            <Field label="Rows">
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                    {p.rows.map((row, i) => (
                        <Box key={row.id} sx={{ ...rowSx, flexDirection: 'column', alignItems: 'stretch' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                    <TextInput value={row.label} onChange={(v) => set((pp) => void (pp.rows[i].label = v), `row-${row.id}`)} disabled={disabled} ariaLabel={`Row ${i + 1} label`} maxLength={80} />
                                </Box>
                                <RowActions index={i} count={p.rows.length} label={`row ${i + 1}`} disabled={disabled} onMove={(to) => set((pp) => moveItem(pp.rows, i, to))} onRemove={() => set((pp) => void pp.rows.splice(i, 1))} />
                            </Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <Typography sx={{ fontSize: '0.7rem', color: '#64748b', flex: 1, minWidth: 0 }} noWrap title={row.path}>
                                    {fieldLabel(fields, row.path)}
                                </Typography>
                                <Tooltip title="Hide the row when the value is empty" arrow>
                                    <Box component="label" sx={{ display: 'flex', alignItems: 'center', fontSize: '0.68rem', color: '#64748b' }}>
                                        <Checkbox size="small" checked={row.hideIfEmpty} disabled={disabled} onChange={(e) => set((pp) => void (pp.rows[i].hideIfEmpty = e.target.checked))} sx={{ p: 0.25 }} />
                                        Hide empty
                                    </Box>
                                </Tooltip>
                                <FieldPickerButton fields={fields} label="Field" variant="compact" disabled={disabled} onPick={(f) => set((pp) => void (pp.rows[i].path = f.path))} />
                            </Box>
                        </Box>
                    ))}
                    <FieldPickerButton
                        fields={fields}
                        label="Add row"
                        disabled={disabled || p.rows.length >= 40}
                        onPick={(f) => set((pp) => void pp.rows.push({ id: newId('r'), path: f.path, label: f.label, hideIfEmpty: true }))}
                        sx={{ alignSelf: 'flex-start' }}
                    />
                </Box>
            </Field>
            <Field label="Label column width">
                <NumberInput value={p.labelWidthPct} onChange={(v) => set((pp) => void (pp.labelWidthPct = v ?? 40), 'dl-w')} min={10} max={80} unit="%" disabled={disabled} ariaLabel="Label column width" />
            </Field>
            <SwitchRow label="Bold values" checked={p.valueBold} onChange={(v) => set((pp) => void (pp.valueBold = v))} disabled={disabled} />
            <SwitchRow label="Borders" checked={p.bordered} onChange={(v) => set((pp) => void (pp.bordered = v))} disabled={disabled} />
            <Field label="Label colour">
                <ColorInput value={p.labelColor} onChange={(v) => set((pp) => void (pp.labelColor = v))} accent={accent} disabled={disabled} ariaLabel="Label colour" />
            </Field>
        </>
    );
}

function AddressSettings({ block, set, disabled }: Props<'address'>) {
    const p = block.props;
    return (
        <>
            <Field label="Address">
                <Segmented
                    value={p.which}
                    onChange={(v) => set((pp) => void (pp.which = v))}
                    options={[
                        { value: 'billing', label: 'Billing' },
                        { value: 'shipping', label: 'Shipping' },
                    ]}
                    disabled={disabled}
                    ariaLabel="Which address"
                />
            </Field>
            <Field label="Heading" hint="Leave empty for none">
                <TextInput value={p.title} onChange={(v) => set((pp) => void (pp.title = v), 'addr-title')} disabled={disabled} ariaLabel="Address heading" maxLength={80} />
            </Field>
            <Field label="Lines">
                {(['street', 'city', 'state', 'postalCode', 'country'] as const).map((part) => (
                    <SwitchRow
                        key={part}
                        label={{ street: 'Street', city: 'City', state: 'State', postalCode: 'Postal code', country: 'Country' }[part]}
                        checked={p.parts[part]}
                        onChange={(v) => set((pp) => void (pp.parts[part] = v))}
                        disabled={disabled}
                    />
                ))}
            </Field>
        </>
    );
}

function LineItemsSettings({ block, set, disabled, accent }: Props<'lineItems'>) {
    const { registry } = useBuilderEnv();
    const p = block.props;
    const missing = registry.lineItemColumns.filter((c) => !p.columns.some((col) => col.key === c.key));
    return (
        <>
            <Field label="Columns" hint="Tick to show. Widths are % of the table; leave empty to share the remaining space. Tip: double-click a heading on the page to rename it.">
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                    {p.columns.map((col, i) => (
                        <Box key={col.key} sx={{ ...rowSx, flexDirection: 'column', alignItems: 'stretch', gap: 0.5, opacity: col.visible ? 1 : 0.7 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <Checkbox size="small" checked={col.visible} disabled={disabled} onChange={(e) => set((pp) => void (pp.columns[i].visible = e.target.checked))} sx={{ p: 0.25 }} slotProps={{ input: { 'aria-label': `Show ${col.label}` } }} />
                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                    <TextInput value={col.label} onChange={(v) => set((pp) => void (pp.columns[i].label = v), `col-${col.key}`)} disabled={disabled} ariaLabel={`${col.key} column label`} maxLength={60} />
                                </Box>
                                <RowActions index={i} count={p.columns.length} label={`${col.label} column`} disabled={disabled} onMove={(to) => set((pp) => moveItem(pp.columns, i, to))} />
                            </Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, pl: 3.5 }}>
                                <Typography component="span" sx={{ fontSize: '0.7rem', color: '#64748b' }}>
                                    Width
                                </Typography>
                                <NumberInput value={col.widthPct} onChange={(v) => set((pp) => void (pp.columns[i].widthPct = v), `colw-${col.key}`)} min={2} max={90} unit="%" optional disabled={disabled} ariaLabel={`${col.label} width`} width={96} />
                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                    <Segmented
                                        value={col.align}
                                        onChange={(v) => set((pp) => void (pp.columns[i].align = v))}
                                        options={[
                                            { value: 'left', label: 'L', title: 'Align left' },
                                            { value: 'center', label: 'C', title: 'Align center' },
                                            { value: 'right', label: 'R', title: 'Align right' },
                                        ]}
                                        disabled={disabled}
                                        ariaLabel={`${col.label} alignment`}
                                    />
                                </Box>
                            </Box>
                        </Box>
                    ))}
                    {missing.length > 0 && (
                        <Button
                            size="small"
                            variant="text"
                            disabled={disabled}
                            onClick={() => set((pp) => void pp.columns.push(...missing.map((c) => ({ key: c.key, label: c.label, visible: false, align: c.align, ...(c.widthPct !== undefined ? { widthPct: c.widthPct } : {}) }))))}
                            sx={{ alignSelf: 'flex-start', textTransform: 'none', fontSize: '0.75rem' }}
                        >
                            Add {missing.length} new column{missing.length > 1 ? 's' : ''}
                        </Button>
                    )}
                </Box>
            </Field>
            <SwitchRow label="Description under item name" hint="Instead of its own column" checked={p.descriptionUnderName} onChange={(v) => set((pp) => void (pp.descriptionUnderName = v))} disabled={disabled} />
            <Field label="Borders">
                <Segmented
                    value={p.borders}
                    onChange={(v) => set((pp) => void (pp.borders = v))}
                    options={[
                        { value: 'grid', label: 'Grid' },
                        { value: 'rows', label: 'Rows' },
                        { value: 'none', label: 'None' },
                    ]}
                    disabled={disabled}
                    ariaLabel="Table borders"
                />
            </Field>
            <SwitchRow label="Striped rows" checked={p.zebra} onChange={(v) => set((pp) => void (pp.zebra = v))} disabled={disabled} />
            <Field label="Header background">
                <ColorInput value={p.headerBackground} onChange={(v) => set((pp) => void (pp.headerBackground = v ?? 'transparent'))} accent={accent} disabled={disabled} ariaLabel="Header background" />
            </Field>
            <Field label="Header text">
                <ColorInput value={p.headerColor} onChange={(v) => set((pp) => void (pp.headerColor = v ?? '#0f172a'))} accent={accent} allowNone={false} disabled={disabled} ariaLabel="Header text colour" />
            </Field>
            <Field label="Border colour">
                <ColorInput value={p.borderColor} onChange={(v) => set((pp) => void (pp.borderColor = v ?? '#cbd5e1'))} accent={accent} allowNone={false} disabled={disabled} ariaLabel="Border colour" />
            </Field>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                <Field label="Font size" hint="0 = inherit">
                    <NumberInput value={p.fontSize} onChange={(v) => set((pp) => void (pp.fontSize = v ?? 0), 'li-fs')} min={0} max={20} step={0.5} unit="pt" disabled={disabled} ariaLabel="Table font size" />
                </Field>
                <Field label="When empty">
                    <TextInput value={p.emptyText} onChange={(v) => set((pp) => void (pp.emptyText = v), 'li-empty')} disabled={disabled} ariaLabel="Empty table text" maxLength={80} />
                </Field>
            </Box>
        </>
    );
}

function TotalsSettings({ block, set, disabled, accent }: Props<'totals'>) {
    const p = block.props;
    return (
        <>
            <Field label="Rows">
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                    {p.rows.map((row, i) => (
                        <Box key={row.key} sx={rowSx}>
                            <Checkbox size="small" checked={row.visible} disabled={disabled} onChange={(e) => set((pp) => void (pp.rows[i].visible = e.target.checked))} sx={{ p: 0.25 }} slotProps={{ input: { 'aria-label': `Show ${row.label}` } }} />
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                <TextInput value={row.label} onChange={(v) => set((pp) => void (pp.rows[i].label = v), `tot-${row.key}`)} disabled={disabled} ariaLabel={`${row.key} label`} maxLength={60} />
                            </Box>
                            <Tooltip title="Hide when zero" arrow>
                                <Checkbox size="small" checked={row.hideIfZero} disabled={disabled} onChange={(e) => set((pp) => void (pp.rows[i].hideIfZero = e.target.checked))} sx={{ p: 0.25 }} slotProps={{ input: { 'aria-label': `Hide ${row.label} when zero` } }} />
                            </Tooltip>
                            <RowActions index={i} count={p.rows.length} label={row.label} disabled={disabled} onMove={(to) => set((pp) => moveItem(pp.rows, i, to))} />
                        </Box>
                    ))}
                    <Typography sx={{ fontSize: '0.68rem', color: '#94a3b8' }}>Second tick box: hide the row when its amount is zero.</Typography>
                </Box>
            </Field>
            <SwitchRow label="Highlight grand total" checked={p.highlightGrandTotal} onChange={(v) => set((pp) => void (pp.highlightGrandTotal = v))} disabled={disabled} />
            {p.highlightGrandTotal && (
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                    <Field label="Grand total background">
                        <ColorInput
                            value={p.grandTotalBackground ?? 'accent'}
                            onChange={(v) => set((pp) => void (v && v !== 'accent' ? (pp.grandTotalBackground = v) : delete pp.grandTotalBackground))}
                            accent={accent}
                            allowNone={false}
                            disabled={disabled}
                            ariaLabel="Grand total background"
                        />
                    </Field>
                    <Field label="Grand total text">
                        <ColorInput
                            value={p.grandTotalColor ?? '#ffffff'}
                            onChange={(v) => set((pp) => void (v && v.toLowerCase() !== '#ffffff' ? (pp.grandTotalColor = v) : delete pp.grandTotalColor))}
                            accent={accent}
                            allowNone={false}
                            disabled={disabled}
                            ariaLabel="Grand total text colour"
                        />
                    </Field>
                </Box>
            )}
            <SwitchRow label="Borders" checked={p.bordered} onChange={(v) => set((pp) => void (pp.bordered = v))} disabled={disabled} />
            <Field label="Label column width">
                <NumberInput value={p.labelWidthPct} onChange={(v) => set((pp) => void (pp.labelWidthPct = v ?? 55), 'tot-w')} min={20} max={80} unit="%" disabled={disabled} ariaLabel="Label column width" />
            </Field>
        </>
    );
}

function TermsSettings({ block, set, disabled, accent }: Props<'terms'>) {
    const p = block.props;
    return (
        <>
            <Field label="Sections">
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                    {p.sections.map((s, i) => (
                        <Box key={s.key} sx={rowSx}>
                            <Checkbox size="small" checked={s.visible} disabled={disabled} onChange={(e) => set((pp) => void (pp.sections[i].visible = e.target.checked))} sx={{ p: 0.25 }} slotProps={{ input: { 'aria-label': `Show ${s.title}` } }} />
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                <TextInput value={s.title} onChange={(v) => set((pp) => void (pp.sections[i].title = v), `terms-${s.key}`)} disabled={disabled} ariaLabel={`${s.key} title`} maxLength={80} />
                            </Box>
                            <RowActions index={i} count={p.sections.length} label={s.title} disabled={disabled} onMove={(to) => set((pp) => moveItem(pp.sections, i, to))} />
                        </Box>
                    ))}
                </Box>
            </Field>
            <SwitchRow label="Show section titles" checked={p.showTitles} onChange={(v) => set((pp) => void (pp.showTitles = v))} disabled={disabled} />
            <Field label="Title colour">
                <ColorInput value={p.titleColor} onChange={(v) => set((pp) => void (pp.titleColor = v ?? 'accent'))} accent={accent} allowNone={false} disabled={disabled} ariaLabel="Title colour" />
            </Field>
        </>
    );
}

function SignatureSettings({ block, set, disabled }: Props<'signature'>) {
    const { notify } = useBuilderEnv();
    const p = block.props;
    return (
        <>
            <Field label="Signature / stamp image">
                <ImageUploadField value={p.assetKey} onChange={(key) => set((pp) => void (pp.assetKey = key))} onError={(m) => notify(m, 'error')} disabled={disabled} emptyLabel="Blank space" />
            </Field>
            <Field label="Height">
                <NumberInput value={p.heightMm} onChange={(v) => set((pp) => void (pp.heightMm = v ?? 18), 'sig-h')} min={5} max={80} unit="mm" disabled={disabled} ariaLabel="Signature height" />
            </Field>
            <Field label="Caption">
                <TextInput value={p.caption} onChange={(v) => set((pp) => void (pp.caption = v), 'sig-cap')} disabled={disabled} ariaLabel="Signature caption" maxLength={120} />
            </Field>
            <SwitchRow label="Line above caption" checked={p.lineAbove} onChange={(v) => set((pp) => void (pp.lineAbove = v))} disabled={disabled} />
            <Field label="Alignment">
                <Segmented
                    value={p.align}
                    onChange={(v) => set((pp) => void (pp.align = v))}
                    options={[
                        { value: 'left', label: 'Left' },
                        { value: 'center', label: 'Center' },
                        { value: 'right', label: 'Right' },
                    ]}
                    disabled={disabled}
                    ariaLabel="Signature alignment"
                />
            </Field>
        </>
    );
}

/** Blocks whose content can be empty for a record (offer "hide when empty"). */
const CAN_BE_EMPTY: BlockType[] = ['title', 'text', 'image', 'field', 'detailsList', 'address', 'amountInWords', 'terms', 'customFields', 'lineItems', 'totals'];

export function BlockSettings({ block }: { block: Block }) {
    const { edit } = useBuilder();
    const { registry, readOnly, context } = useBuilderEnv();
    const { doc } = useBuilder();
    const disabled = readOnly;
    const accent = doc.theme.accentColor;
    const id = block.id;

    const set = (recipe: (props: never) => void, coalesceKey?: string) =>
        edit(
            (d) => {
                const at = findBlock(d, id);
                if (at) (recipe as (props: unknown) => void)(at.block.props);
            },
            coalesceKey ? { coalesceKey: `${id}:${coalesceKey}` } : undefined,
        );
    const common = { set: set as never, disabled, fields: registry.fields, accent };

    let content: React.ReactNode = null;
    switch (block.type) {
        case 'title':
            content = (
                <>
                    <Field label="Size">
                        <SelectInput
                            value={block.props.level}
                            onChange={(v) => set(((pp: BlockOf<'title'>['props']) => void (pp.level = v)) as never)}
                            options={[
                                { value: 1, label: 'Large (20 pt)' },
                                { value: 2, label: 'Medium (15 pt)' },
                                { value: 3, label: 'Small (12 pt)' },
                            ]}
                            disabled={disabled}
                            ariaLabel="Title size"
                        />
                    </Field>
                    <TextLike block={block} />
                </>
            );
            break;
        case 'text':
            content = <TextLike block={block} />;
            break;
        case 'image':
            content = <ImageSettings block={block} {...common} />;
            break;
        case 'divider':
            content = <DividerSettings block={block} {...common} />;
            break;
        case 'spacer':
            content = (
                <Field label="Height">
                    <NumberInput value={block.props.heightMm} onChange={(v) => set(((pp: BlockOf<'spacer'>['props']) => void (pp.heightMm = v ?? 6)) as never, 'spacer')} min={1} max={200} unit="mm" disabled={disabled} ariaLabel="Spacer height" />
                </Field>
            );
            break;
        case 'pageBreak':
            content = <Typography sx={{ fontSize: '0.78rem', color: '#64748b' }}>Everything after this block starts on a new page.</Typography>;
            break;
        case 'field':
            content = <FieldSettings block={block} {...common} />;
            break;
        case 'detailsList':
            content = <DetailsListSettings block={block} {...common} />;
            break;
        case 'address':
            content = <AddressSettings block={block} {...common} />;
            break;
        case 'lineItems':
            content = <LineItemsSettings block={block} {...common} />;
            break;
        case 'totals':
            content = <TotalsSettings block={block} {...common} />;
            break;
        case 'amountInWords':
            content = (
                <>
                    <Field label="Label">
                        <TextInput value={block.props.label} onChange={(v) => set(((pp: BlockOf<'amountInWords'>['props']) => void (pp.label = v)) as never, 'aiw')} disabled={disabled} ariaLabel="Label" maxLength={80} />
                    </Field>
                    <SwitchRow label="Show label" checked={block.props.showLabel} onChange={(v) => set(((pp: BlockOf<'amountInWords'>['props']) => void (pp.showLabel = v)) as never)} disabled={disabled} />
                </>
            );
            break;
        case 'terms':
            content = <TermsSettings block={block} {...common} />;
            break;
        case 'customFields':
            content = (
                <>
                    <Field label="Heading" hint="Leave empty for none">
                        <TextInput value={block.props.title} onChange={(v) => set(((pp: BlockOf<'customFields'>['props']) => void (pp.title = v)) as never, 'cf')} disabled={disabled} ariaLabel="Heading" maxLength={80} />
                    </Field>
                    <Field label="Label column width">
                        <NumberInput value={block.props.labelWidthPct} onChange={(v) => set(((pp: BlockOf<'customFields'>['props']) => void (pp.labelWidthPct = v ?? 35)) as never, 'cf-w')} min={10} max={80} unit="%" disabled={disabled} ariaLabel="Label column width" />
                    </Field>
                    <Typography sx={{ fontSize: '0.72rem', color: '#64748b' }}>Lists every custom quotation field that has a value ({Array.isArray(context.customList) ? context.customList.length : 0} in this preview).</Typography>
                </>
            );
            break;
        case 'pageNumber':
            content = (
                <Field label="Format" hint="{page} = this page, {total} = page count">
                    <TextInput value={block.props.format} onChange={(v) => set(((pp: BlockOf<'pageNumber'>['props']) => void (pp.format = v)) as never, 'pn')} disabled={disabled} ariaLabel="Page number format" maxLength={60} />
                </Field>
            );
            break;
        case 'signature':
            content = <SignatureSettings block={block} {...common} />;
            break;
    }

    return (
        <PanelSection title={`${BLOCK_LABELS[block.type]} settings`} defaultExpanded>
            {content}
            {CAN_BE_EMPTY.includes(block.type) && (
                <SwitchRow
                    label="Hide when empty"
                    hint="Leave it out of the PDF when the record has no value"
                    checked={Boolean(block.hideIfEmpty)}
                    onChange={(v) =>
                        edit((d) => {
                            const at = findBlock(d, id);
                            if (at) at.block.hideIfEmpty = v || undefined;
                        })
                    }
                    disabled={disabled}
                />
            )}
        </PanelSection>
    );
}
