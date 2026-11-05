'use client';

import React, { useMemo, useState } from 'react';
import { useWatch, type UseFormReturn } from 'react-hook-form';
import { Box, Button, TextField, Typography } from '@mui/material';
import { DragHandle, inputSx, LabeledSwitch, secondaryButtonSx } from '@/components/settings/form-customization/builderUi';
import { useDragReorder } from '@/components/settings/form-customization/useDragReorder';
import type { FieldVisibility, LineItemColumnSetting, PdfFieldDefinition, PdfFieldRegistry } from '@/types/pdfTemplate.types';
import type { PdfTemplateFormValues } from '@/validations/pdfTemplate.schema';
import { defaultVisibility } from '../editorUtils';

type ColumnRow = LineItemColumnSetting & { id: string };

const groupTitleSx = { fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', mt: 1.5, mb: 0.5 } as const;

/** Field visibility switches (grouped) and the line-item column list (visible / label / drag order). */
export function FieldsPanel({ form, registry, readOnly }: { form: UseFormReturn<PdfTemplateFormValues>; registry: PdfFieldRegistry | undefined; readOnly: boolean }) {
    const visibility = useWatch({ control: form.control, name: 'fieldVisibility' }) as FieldVisibility;
    const [filter, setFilter] = useState('');

    const setVisibility = (next: FieldVisibility) => form.setValue('fieldVisibility', next, { shouldDirty: true, shouldValidate: true });

    const groups = useMemo(() => {
        const q = filter.trim().toLowerCase();
        const map = new Map<string, PdfFieldDefinition[]>();
        for (const f of registry?.fields ?? []) {
            if (q && !f.label.toLowerCase().includes(q) && !f.path.toLowerCase().includes(q)) continue;
            map.set(f.group, [...(map.get(f.group) ?? []), f]);
        }
        return [...map.entries()];
    }, [filter, registry]);

    const columnRows: ColumnRow[] = useMemo(() => visibility.lineItemColumns.map((c) => ({ ...c, id: c.key })), [visibility.lineItemColumns]);
    const { orderedItems, getRowDragProps, getRowDragSx } = useDragReorder({
        items: columnRows,
        canDrag: !readOnly,
        onReorder: (ids) => {
            const byKey = new Map(visibility.lineItemColumns.map((c) => [c.key, c]));
            const reordered = ids.map((id, order) => ({ ...(byKey.get(id) as LineItemColumnSetting), order }));
            setVisibility({ ...visibility, lineItemColumns: reordered });
        },
    });

    const updateColumn = (key: string, patch: Partial<LineItemColumnSetting>) =>
        setVisibility({ ...visibility, lineItemColumns: visibility.lineItemColumns.map((c) => (c.key === key ? { ...c, ...patch } : c)) });

    return (
        <Box>
            <Box sx={{ display: 'flex', gap: 1, mb: 1, flexWrap: 'wrap' }}>
                <Button
                    size="small"
                    variant="outlined"
                    disabled={readOnly}
                    onClick={() => setVisibility({ ...visibility, fields: Object.fromEntries(Object.keys(visibility.fields).map((k) => [k, true])) })}
                    sx={secondaryButtonSx}
                >
                    Show all
                </Button>
                <Button size="small" variant="outlined" disabled={readOnly} onClick={() => setVisibility(defaultVisibility(registry))} sx={secondaryButtonSx}>
                    Reset to defaults
                </Button>
            </Box>
            <TextField size="small" fullWidth placeholder="Filter fields…" value={filter} onChange={(e) => setFilter(e.target.value)} sx={inputSx} slotProps={{ htmlInput: { 'aria-label': 'Filter fields' } }} />

            {groups.map(([group, fields]) => (
                <Box key={group}>
                    <Typography sx={groupTitleSx}>{group}</Typography>
                    {fields.map((f) => (
                        <Box key={f.key} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, py: 0.25 }}>
                            <Box sx={{ minWidth: 0 }}>
                                <Typography noWrap sx={{ fontSize: '0.8rem', color: '#0f172a' }}>{f.label}</Typography>
                                <Typography noWrap sx={{ fontSize: '0.68rem', color: '#94a3b8', fontFamily: 'monospace' }}>
                                    {f.key}
                                </Typography>
                            </Box>
                            <LabeledSwitch
                                label={`Show ${f.label}`}
                                checked={visibility.fields[f.key] ?? f.defaultVisible}
                                disabled={readOnly}
                                onChange={(checked) => setVisibility({ ...visibility, fields: { ...visibility.fields, [f.key]: checked } })}
                            />
                        </Box>
                    ))}
                </Box>
            ))}

            <Typography sx={{ ...groupTitleSx, mt: 2.5 }}>Line-item columns</Typography>
            <Typography sx={{ fontSize: '0.72rem', color: '#64748b', mb: 1 }}>Drag to reorder. Description shows under the item name in the built-in layouts.</Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                {orderedItems.map((col) => (
                    <Box
                        key={col.id}
                        {...getRowDragProps(col, !readOnly)}
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                            p: 0.75,
                            pl: 0.5,
                            borderRadius: '8px',
                            border: '1px solid #e2e8f0',
                            backgroundColor: col.visible ? '#ffffff' : '#f8fafc',
                            ...getRowDragSx(col),
                        }}
                    >
                        <DragHandle disabled={readOnly} title="Drag to reorder" />
                        <TextField
                            size="small"
                            value={col.label}
                            disabled={readOnly}
                            onChange={(e) => updateColumn(col.key, { label: e.target.value })}
                            slotProps={{ htmlInput: { 'aria-label': `Label of the ${col.key} column`, maxLength: 60 } }}
                            sx={{ ...inputSx, flex: 1, '& .MuiOutlinedInput-root': { ...inputSx['& .MuiOutlinedInput-root'], height: 32 } }}
                        />
                        <LabeledSwitch label={`Show the ${col.label} column`} checked={col.visible} disabled={readOnly} onChange={(visible) => updateColumn(col.key, { visible })} />
                    </Box>
                ))}
            </Box>
        </Box>
    );
}
