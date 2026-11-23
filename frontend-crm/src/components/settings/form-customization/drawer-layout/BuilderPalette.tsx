'use client';

import React, { useMemo, useState } from 'react';
import { Box, CircularProgress, IconButton, InputAdornment, TextField, Tooltip, Typography } from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import DragIndicatorRoundedIcon from '@mui/icons-material/DragIndicatorRounded';
import ExtensionOutlinedIcon from '@mui/icons-material/ExtensionOutlined';
import HorizontalRuleRoundedIcon from '@mui/icons-material/HorizontalRuleRounded';
import NotesRoundedIcon from '@mui/icons-material/NotesRounded';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import TitleRoundedIcon from '@mui/icons-material/TitleRounded';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';
import ViewAgendaOutlinedIcon from '@mui/icons-material/ViewAgendaOutlined';
import ViewColumnOutlinedIcon from '@mui/icons-material/ViewColumnOutlined';
import ShortTextRoundedIcon from '@mui/icons-material/ShortTextRounded';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import ArrowDropDownCircleOutlinedIcon from '@mui/icons-material/ArrowDropDownCircleOutlined';
import ChecklistRoundedIcon from '@mui/icons-material/ChecklistRounded';
import NumbersRoundedIcon from '@mui/icons-material/NumbersRounded';
import CheckBoxOutlinedIcon from '@mui/icons-material/CheckBoxOutlined';
import type { SvgIconComponent } from '@mui/icons-material';
import type { FieldType } from '@/types/formConfig.types';
import type { DrawerPiece } from '@/types/drawerLayout.types';
import type { AddressDef, BuiltInPiece, DrawerFieldDef } from '@/components/common/Drawer/layout';
import { inputSx } from '../builderUi';
import { DND_HANDLE, dndSource, type DragSource } from './LayoutDrag';

/**
 * Left panel of the Drawer Layout builder: form fields, layout blocks and ready-made / saved pieces. Drag any item
 * onto the drawer, or press its + to add it (to the selected section, or as a new section at the end of the tab).
 */

const FIELD_ICONS: Partial<Record<FieldType, SvgIconComponent>> = {
    textarea: NotesRoundedIcon,
    date: CalendarMonthOutlinedIcon,
    datetime: CalendarMonthOutlinedIcon,
    phone: PhoneOutlinedIcon,
    email: EmailOutlinedIcon,
    select: ArrowDropDownCircleOutlinedIcon,
    lookup: ArrowDropDownCircleOutlinedIcon,
    multiselect: ChecklistRoundedIcon,
    number: NumbersRoundedIcon,
    amount: NumbersRoundedIcon,
    percentage: NumbersRoundedIcon,
    checkbox: CheckBoxOutlinedIcon,
};

export type PaletteTab = 'fields' | 'blocks' | 'pieces';

function PaletteItem({
    id,
    source,
    title,
    subtitle,
    icon,
    placedNote,
    onAdd,
    onRemove,
    readOnly,
}: {
    id: string;
    source: DragSource;
    title: string;
    subtitle?: string;
    icon: React.ReactNode;
    placedNote?: string;
    onAdd: (source: DragSource) => void;
    onRemove?: () => void;
    readOnly: boolean;
}) {
    return (
        <Box
            {...(readOnly ? {} : dndSource(source))}
            data-palette-item={id}
            aria-label={`${title}. Drag onto the drawer, or press Add.`}
            sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                pl: 0.5,
                pr: 0.5,
                py: 0.6,
                borderRadius: '8px',
                border: '1px solid var(--mui-palette-border-main)',
                backgroundColor: 'var(--mui-palette-background-paper)',
                cursor: readOnly ? 'default' : 'grab',
                outline: 'none',
                transition: 'border-color 0.12s ease, background-color 0.12s ease',
                '&:hover': readOnly ? undefined : { borderColor: 'var(--crm-blue-300)', backgroundColor: 'var(--mui-palette-primary-soft)' },
                '&:focus-visible': { boxShadow: '0 0 0 3px rgb(var(--crm-accent-rgb) / 0.22)' },
            }}
        >
            {!readOnly && (
                // The grip: on touch screens drags start here, so the list still scrolls under a finger.
                <Box
                    {...DND_HANDLE}
                    aria-hidden
                    sx={{
                        position: 'relative',
                        display: 'flex',
                        flexShrink: 0,
                        color: 'var(--mui-palette-text-muted)',
                        touchAction: 'none',
                        cursor: 'grab',
                        '&::before': { content: '""', position: 'absolute', inset: '-10px -8px' },
                    }}
                >
                    <DragIndicatorRoundedIcon sx={{ fontSize: 16 }} />
                </Box>
            )}
            <Box sx={{ display: 'flex', color: 'var(--crm-text-blue-600)', flexShrink: 0 }}>{icon}</Box>
            <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography noWrap sx={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--crm-slate-900)' }}>
                    {title}
                </Typography>
                {subtitle && (
                    <Typography noWrap sx={{ fontSize: '0.68rem', color: 'var(--mui-palette-text-secondary)' }}>
                        {subtitle}
                    </Typography>
                )}
            </Box>
            {placedNote && (
                <Tooltip title={placedNote} arrow>
                    <CheckRoundedIcon aria-label={placedNote} sx={{ fontSize: 16, color: 'var(--mui-palette-success-main)', flexShrink: 0 }} />
                </Tooltip>
            )}
            {!readOnly && onRemove && (
                <Tooltip title="Delete this saved piece" arrow>
                    <IconButton
                        size="small"
                        aria-label={`Delete saved piece ${title}`}
                        onClick={(e) => {
                            e.stopPropagation();
                            onRemove();
                        }}
                        sx={{ p: 0.4, color: 'var(--mui-palette-text-muted)', '&:hover': { color: 'var(--mui-palette-error-main)', backgroundColor: 'var(--mui-palette-error-soft)' } }}
                    >
                        <DeleteOutlineRoundedIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                </Tooltip>
            )}
            {!readOnly && (
                <Tooltip title="Add to the drawer" arrow>
                    <IconButton
                        size="small"
                        aria-label={`Add ${title}`}
                        onClick={(e) => {
                            e.stopPropagation();
                            onAdd(source);
                        }}
                        sx={{
                            p: 0.4,
                            color: 'var(--mui-palette-text-secondary)',
                            border: '1px solid var(--mui-palette-border-main)',
                            borderRadius: '6px',
                            '&:hover': { borderColor: 'var(--crm-blue-300)', backgroundColor: 'var(--mui-palette-primary-soft)', color: 'var(--crm-text-blue-700)' },
                        }}
                    >
                        <AddRoundedIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                </Tooltip>
            )}
        </Box>
    );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
    return <Typography sx={{ fontSize: '0.66rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--mui-palette-text-muted)', mt: 1, mb: 0.25 }}>{children}</Typography>;
}

export function BuilderPalette({
    fields,
    addresses,
    placed,
    customFieldsPlaced,
    builtInPieces,
    savedPieces,
    piecesLoading,
    onAdd,
    onRemovePiece,
    readOnly,
}: {
    fields: DrawerFieldDef[];
    addresses: AddressDef[];
    placed: Set<string>;
    customFieldsPlaced: boolean;
    builtInPieces: BuiltInPiece[];
    savedPieces: DrawerPiece[];
    piecesLoading: boolean;
    onAdd: (source: DragSource) => void;
    onRemovePiece: (piece: DrawerPiece) => void;
    readOnly: boolean;
}) {
    const [tab, setTab] = useState<PaletteTab>('fields');
    const [query, setQuery] = useState('');
    const q = query.trim().toLowerCase();

    const groups = useMemo(() => {
        const map = new Map<string, DrawerFieldDef[]>();
        for (const f of fields) {
            if (q && !f.label.toLowerCase().includes(q) && !f.key.toLowerCase().includes(q)) continue;
            map.set(f.group, [...(map.get(f.group) ?? []), f]);
        }
        return [...map.entries()];
    }, [fields, q]);

    const matches = (text: string) => !q || text.toLowerCase().includes(q);
    const pieces = builtInPieces.filter((p) => matches(p.name) || matches(p.description));
    const saved = savedPieces.filter((p) => matches(p.name));

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, minHeight: 0 }}>
            <Box role="tablist" aria-label="Add to the drawer" sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0.5, p: 0.4, borderRadius: '9px', backgroundColor: 'var(--mui-palette-background-subtle)', border: '1px solid var(--mui-palette-border-main)' }}>
                {(
                    [
                        ['fields', 'Fields'],
                        ['blocks', 'Blocks'],
                        ['pieces', 'Pieces'],
                    ] as const
                ).map(([key, label]) => {
                    const on = tab === key;
                    return (
                        <Box
                            key={key}
                            component="button"
                            type="button"
                            role="tab"
                            aria-selected={on}
                            onClick={() => setTab(key)}
                            sx={{
                                py: 0.6,
                                borderRadius: '7px',
                                fontSize: '0.78rem',
                                fontWeight: 600,
                                fontFamily: 'inherit',
                                cursor: 'pointer',
                                border: on ? '1px solid var(--mui-palette-border-strong)' : '1px solid transparent',
                                backgroundColor: on ? 'var(--mui-palette-background-paper)' : 'transparent',
                                color: on ? 'var(--crm-text-blue-900)' : 'var(--mui-palette-text-secondary)',
                                '&:hover': on ? undefined : { backgroundColor: 'var(--mui-palette-primary-soft)', color: 'var(--crm-text-blue-700)' },
                                '&:focus-visible': { outline: 'none', boxShadow: '0 0 0 3px rgb(var(--crm-accent-rgb) / 0.22)' },
                            }}
                        >
                            {label}
                        </Box>
                    );
                })}
            </Box>

            {tab !== 'blocks' && (
                <TextField
                    size="small"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={tab === 'fields' ? 'Search fields' : 'Search pieces'}
                    sx={inputSx}
                    slotProps={{
                        input: {
                            startAdornment: (
                                <InputAdornment position="start">
                                    <SearchRoundedIcon sx={{ fontSize: 18, color: 'var(--mui-palette-text-muted)' }} />
                                </InputAdornment>
                            ),
                        },
                        htmlInput: { 'aria-label': tab === 'fields' ? 'Search fields' : 'Search pieces' },
                    }}
                />
            )}

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.6 }}>
                {tab === 'fields' && (
                    <>
                        {groups.length === 0 && <Typography sx={{ fontSize: '0.8rem', color: 'var(--mui-palette-text-muted)', py: 2, textAlign: 'center' }}>No field matches “{query}”.</Typography>}
                        {groups.map(([group, list]) => (
                            <React.Fragment key={group}>
                                <GroupLabel>{group}</GroupLabel>
                                {list.map((f) => {
                                    const Icon = FIELD_ICONS[f.type] ?? ShortTextRoundedIcon;
                                    return (
                                        <PaletteItem
                                            key={f.key}
                                            id={`palette-field-${f.key}`}
                                            source={{ source: 'field', key: f.key, label: f.label }}
                                            title={f.label}
                                            icon={<Icon sx={{ fontSize: 17 }} />}
                                            placedNote={placed.has(f.key) ? 'Already on the drawer' : undefined}
                                            onAdd={onAdd}
                                            readOnly={readOnly}
                                        />
                                    );
                                })}
                            </React.Fragment>
                        ))}
                        {!readOnly && (
                            <Typography sx={{ fontSize: '0.7rem', color: 'var(--mui-palette-text-muted)', mt: 1 }}>
                                Tip: drop a field on the header&apos;s badge row to make it a badge.
                            </Typography>
                        )}
                    </>
                )}

                {tab === 'blocks' && (
                    <>
                        <GroupLabel>Sections</GroupLabel>
                        <PaletteItem id="palette-section-1" source={{ source: 'section', columns: 1, label: 'Section' }} title="Section" subtitle="One column" icon={<ViewAgendaOutlinedIcon sx={{ fontSize: 17 }} />} onAdd={onAdd} readOnly={readOnly} />
                        <PaletteItem id="palette-section-2" source={{ source: 'section', columns: 2, label: 'Two-column section' }} title="Two-column section" subtitle="Fields side by side" icon={<ViewColumnOutlinedIcon sx={{ fontSize: 17 }} />} onAdd={onAdd} readOnly={readOnly} />
                        <GroupLabel>Inside a section</GroupLabel>
                        <PaletteItem id="palette-heading" source={{ source: 'block', blockType: 'heading', label: 'Heading' }} title="Heading" subtitle="Bold line of text" icon={<TitleRoundedIcon sx={{ fontSize: 17 }} />} onAdd={onAdd} readOnly={readOnly} />
                        <PaletteItem id="palette-text" source={{ source: 'block', blockType: 'text', label: 'Static text' }} title="Static text" subtitle="A note shown on every record" icon={<NotesRoundedIcon sx={{ fontSize: 17 }} />} onAdd={onAdd} readOnly={readOnly} />
                        <PaletteItem id="palette-divider" source={{ source: 'block', blockType: 'divider', label: 'Divider' }} title="Divider" subtitle="Thin line" icon={<HorizontalRuleRoundedIcon sx={{ fontSize: 17 }} />} onAdd={onAdd} readOnly={readOnly} />
                        {addresses.map((a) => (
                            <PaletteItem
                                key={a.prefix}
                                id={`palette-address-${a.prefix}`}
                                source={{ source: 'block', blockType: 'address', prefix: a.prefix, label: a.label }}
                                title={a.label}
                                subtitle="Street, city, state, PIN, country"
                                icon={<PlaceOutlinedIcon sx={{ fontSize: 17 }} />}
                                onAdd={onAdd}
                                readOnly={readOnly}
                            />
                        ))}
                        <PaletteItem
                            id="palette-custom-fields"
                            source={{ source: 'block', blockType: 'customFields', label: 'Other custom fields' }}
                            title="Other custom fields"
                            subtitle="New custom fields show up here"
                            icon={<TuneOutlinedIcon sx={{ fontSize: 17 }} />}
                            placedNote={customFieldsPlaced ? 'Already on the drawer' : undefined}
                            onAdd={onAdd}
                            readOnly={readOnly}
                        />
                    </>
                )}

                {tab === 'pieces' && (
                    <>
                        <GroupLabel>Ready-made</GroupLabel>
                        {pieces.map((p) => (
                            <PaletteItem
                                key={p.id}
                                id={`palette-piece-${p.id}`}
                                source={{ source: 'piece', pieceId: p.id, label: p.name }}
                                title={p.name}
                                subtitle={p.description}
                                icon={<ExtensionOutlinedIcon sx={{ fontSize: 17 }} />}
                                onAdd={onAdd}
                                readOnly={readOnly}
                            />
                        ))}
                        <GroupLabel>Saved by admins</GroupLabel>
                        {piecesLoading && <CircularProgress size={18} sx={{ alignSelf: 'center', my: 1 }} />}
                        {!piecesLoading && saved.length === 0 && (
                            <Typography sx={{ fontSize: '0.76rem', color: 'var(--mui-palette-text-muted)' }}>
                                {q ? 'No saved piece matches.' : 'None yet. Select a section on the drawer and use “Save as piece” to reuse it later.'}
                            </Typography>
                        )}
                        {saved.map((p) => (
                            <PaletteItem
                                key={p.id}
                                id={`palette-piece-${p.id}`}
                                source={{ source: 'piece', pieceId: p.id, label: p.name }}
                                title={p.name}
                                subtitle={`${p.section.blocks.length} item${p.section.blocks.length === 1 ? '' : 's'} • by ${p.createdBy}`}
                                icon={<ExtensionOutlinedIcon sx={{ fontSize: 17 }} />}
                                onAdd={onAdd}
                                onRemove={() => onRemovePiece(p)}
                                readOnly={readOnly}
                            />
                        ))}
                    </>
                )}
            </Box>
        </Box>
    );
}
