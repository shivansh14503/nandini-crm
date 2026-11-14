'use client';

import React, { useMemo, useState } from 'react';
import {
    Alert,
    Autocomplete,
    Box,
    Button,
    Checkbox,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControlLabel,
    IconButton,
    MenuItem,
    Radio,
    RadioGroup,
    Tab,
    Tabs,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import HistoryIcon from '@mui/icons-material/History';
import TuneIcon from '@mui/icons-material/Tune';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import AddIcon from '@mui/icons-material/Add';
import BookmarkBorderIcon from '@mui/icons-material/BookmarkBorder';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import CheckBoxIcon from '@mui/icons-material/CheckBox';
import { moduleNavLabel } from '@/types/formConfig.types';
import { activeConditionCount, describeCriteria } from './applyFilter';
import { DATE_OPERATORS, DAYS_OPERATORS, type FilterCondition, type FilterCriteria, type FilterFieldDef, type SavedTableFilter } from './types';
import type { TableFilterController } from './useTableFilter';

export interface FilterSortOption {
    field: string;
    label: string;
}

interface TableFilterModalProps {
    controller: TableFilterController;
    /** Sortable columns, for "Order by". */
    sortOptions: FilterSortOption[];
}

type TabId = 'recent' | 'advanced';

const EMPTY: FilterCriteria = { conditions: {} };

const primaryBtnSx = {
    background: 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)',
    color: '#fff',
    textTransform: 'none',
    fontWeight: 700,
    borderRadius: '8px',
    px: 2.5,
    boxShadow: 'none',
    '&:hover': { background: 'linear-gradient(135deg, #1e40af 0%, #1d4ed8 100%)', boxShadow: 'none' },
    '&.Mui-disabled': { background: '#cbd5e1', color: '#fff' },
} as const;
const textBtnSx = { textTransform: 'none', fontWeight: 600, color: '#475569' } as const;
const inputSx = {
    '& .MuiOutlinedInput-root': { fontSize: '0.8rem', borderRadius: '6px', backgroundColor: '#fff', minHeight: 36 },
    '& .MuiInputBase-input': { py: '7px' },
} as const;
const labelSx = { fontSize: '0.74rem', fontWeight: 700, color: '#475569', mb: 0.5 } as const;

function relativeTime(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const min = Math.round(diff / 60_000);
    if (min < 1) return 'just now';
    if (min < 60) return `${min} min ago`;
    const hours = Math.round(min / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    const days = Math.round(hours / 24);
    if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
    return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Mounts fresh each time it opens, starting from the applied filter. */
export function TableFilterModal(props: TableFilterModalProps) {
    return props.controller.isOpen ? <FilterDialog {...props} /> : null;
}

function FilterDialog({ controller, sortOptions }: TableFilterModalProps) {
    const { fields, lists } = controller;
    // null until the user picks a tab: lands on Recent when there are recents and nothing is applied (also once
    // the recents finish loading on first open), else Advanced.
    const [chosenTab, setTab] = useState<TabId | null>(null);
    const recentCount = lists.recent.length;
    const tab: TabId = chosenTab ?? (controller.criteria || recentCount === 0 ? 'advanced' : 'recent');
    const [draft, setDraft] = useState<FilterCriteria>(() => controller.criteria ?? EMPTY);
    // Fields shown on the Advanced tab: the module's defaults plus any the draft uses or the user added.
    const [extraKeys, setExtraKeys] = useState<string[]>(() =>
        Object.keys(controller.criteria?.conditions ?? {}).filter((k) => !fields.defaultKeys.includes(k))
    );
    const [saveName, setSaveName] = useState('');
    const [savedId, setSavedId] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    const shownKeys = useMemo(() => [...fields.defaultKeys, ...extraKeys.filter((k) => fields.byKey.has(k))], [fields, extraKeys]);
    const addableFields = useMemo(() => fields.fields.filter((f) => !shownKeys.includes(f.key)), [fields, shownKeys]);
    const sortLabel = (field: string) => sortOptions.find((o) => o.field === field)?.label ?? field;

    const cleaned = useMemo(() => controller.clean(draft), [controller, draft]);
    const draftCount = activeConditionCount(cleaned);
    const matchCount = useMemo(() => controller.countMatches(cleaned), [controller, cleaned]);

    const setCondition = (key: string, condition: FilterCondition | null) =>
        setDraft((prev) => {
            const conditions = { ...prev.conditions };
            if (condition) conditions[key] = condition;
            else delete conditions[key];
            return { ...prev, conditions };
        });

    const loadIntoAdvanced = (criteria: FilterCriteria) => {
        setDraft(criteria);
        setExtraKeys(Object.keys(criteria.conditions).filter((k) => !fields.defaultKeys.includes(k)));
        setTab('advanced');
    };

    const applyAndClose = (criteria: FilterCriteria) => {
        controller.apply(criteria);
        controller.close();
    };

    const handleSave = async () => {
        const name = saveName.trim();
        if (!name) return;
        if (draftCount === 0) {
            setError('Set at least one filter before saving.');
            return;
        }
        setBusy(true);
        setError(null);
        try {
            await controller.save(name, cleaned);
            setNotice(`Saved as "${name}". Find it under My Filters.`);
            setSaveName('');
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not save the filter.');
        } finally {
            setBusy(false);
        }
    };

    const handleDeleteSaved = async (item: SavedTableFilter) => {
        if (!confirm(`Delete the saved filter "${item.name}"?`)) return;
        setBusy(true);
        setError(null);
        try {
            await controller.removeSaved(item.id);
            setSavedId('');
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not delete the filter.');
        } finally {
            setBusy(false);
        }
    };

    const moduleLabel = moduleNavLabel(controller.module);

    return (
        <Dialog
            open
            onClose={controller.close}
            fullWidth
            maxWidth="md"
            // Fixed height: switching between Recent and Advanced never resizes the dialog; the content area scrolls.
            slotProps={{ paper: { sx: { borderRadius: '14px', boxShadow: '0 20px 50px rgba(15,23,42,0.18)', height: 'min(680px, 88vh)' } } }}
        >
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pb: 0, pr: 1.5 }}>
                <Typography sx={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', flex: 1 }}>Filter {moduleLabel}</Typography>
                <IconButton size="small" onClick={controller.close} aria-label="Close filter">
                    <CloseIcon fontSize="small" />
                </IconButton>
            </DialogTitle>

            <Tabs
                value={tab}
                onChange={(_, v: TabId) => setTab(v)}
                sx={{
                    px: 3,
                    minHeight: 40,
                    borderBottom: '1px solid #e2e8f0',
                    '& .MuiTab-root': { minHeight: 40, textTransform: 'none', fontWeight: 700, fontSize: '0.82rem' },
                }}
            >
                <Tab
                    value="recent"
                    icon={<HistoryIcon sx={{ fontSize: 17 }} />}
                    iconPosition="start"
                    label={`Recent${recentCount ? ` (${recentCount})` : ''}`}
                />
                <Tab value="advanced" icon={<TuneIcon sx={{ fontSize: 17 }} />} iconPosition="start" label="Advanced" />
            </Tabs>

            <DialogContent sx={{ flex: 1, overflowY: 'auto', pt: '16px !important', backgroundColor: tab === 'advanced' ? '#f8fafc' : '#fff' }}>
                {error && (
                    <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2, fontSize: '0.8rem' }}>
                        {error}
                    </Alert>
                )}
                {notice && (
                    <Alert severity="success" onClose={() => setNotice(null)} sx={{ mb: 2, fontSize: '0.8rem' }}>
                        {notice}
                    </Alert>
                )}

                {tab === 'recent' ? (
                    <RecentList
                        items={lists.recent}
                        loading={controller.listsLoading}
                        describe={(c) => describeCriteria(c, fields.byKey, sortLabel)}
                        onApply={applyAndClose}
                        onEdit={loadIntoAdvanced}
                        onGoAdvanced={() => setTab('advanced')}
                    />
                ) : (
                    <Box>
                        {/* My Filters */}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, flexWrap: 'wrap' }}>
                            <BookmarkBorderIcon sx={{ fontSize: 18, color: '#64748b' }} />
                            <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155' }}>My Filters</Typography>
                            <TextField
                                select
                                size="small"
                                value={savedId}
                                onChange={(e) => {
                                    const id = e.target.value;
                                    setSavedId(id);
                                    const item = lists.saved.find((s) => s.id === id);
                                    if (item) loadIntoAdvanced(item.criteria);
                                }}
                                sx={{ ...inputSx, minWidth: 240 }}
                                slotProps={{ select: { displayEmpty: true } }}
                            >
                                <MenuItem value="" sx={{ fontSize: '0.8rem' }}>
                                    {lists.saved.length ? '-- None --' : 'No saved filters yet'}
                                </MenuItem>
                                {lists.saved.map((s) => (
                                    <MenuItem key={s.id} value={s.id} sx={{ fontSize: '0.8rem' }}>
                                        {s.name}
                                    </MenuItem>
                                ))}
                            </TextField>
                            {savedId && (
                                <Tooltip title="Delete this saved filter">
                                    <IconButton
                                        size="small"
                                        disabled={busy}
                                        onClick={() => {
                                            const item = lists.saved.find((s) => s.id === savedId);
                                            if (item) void handleDeleteSaved(item);
                                        }}
                                    >
                                        <DeleteOutlineIcon fontSize="small" sx={{ color: '#ef4444' }} />
                                    </IconButton>
                                </Tooltip>
                            )}
                        </Box>

                        {/* Field grid */}
                        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                            {shownKeys.map((key) => {
                                const field = fields.byKey.get(key);
                                if (!field) return null;
                                const removable = !fields.defaultKeys.includes(key);
                                return (
                                    <Box key={key} sx={{ minWidth: 0 }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <Typography sx={labelSx}>{field.label}</Typography>
                                            {removable && (
                                                <Tooltip title="Remove field">
                                                    <IconButton
                                                        size="small"
                                                        sx={{ p: 0.2, mb: 0.5 }}
                                                        onClick={() => {
                                                            setExtraKeys((prev) => prev.filter((k) => k !== key));
                                                            setCondition(key, null);
                                                        }}
                                                    >
                                                        <CloseIcon sx={{ fontSize: 14, color: '#94a3b8' }} />
                                                    </IconButton>
                                                </Tooltip>
                                            )}
                                        </Box>
                                        <FieldControl field={field} condition={draft.conditions[key]} onChange={(c) => setCondition(key, c)} />
                                    </Box>
                                );
                            })}
                        </Box>

                        {addableFields.length > 0 && (
                            <Autocomplete
                                options={addableFields}
                                getOptionLabel={(f) => f.label}
                                value={null}
                                blurOnSelect
                                clearOnBlur
                                onChange={(_, f) => f && setExtraKeys((prev) => [...prev, f.key])}
                                sx={{ mt: 2, maxWidth: 320 }}
                                renderInput={(params) => (
                                    <TextField
                                        {...params}
                                        size="small"
                                        placeholder="Add another field..."
                                        sx={inputSx}
                                        slotProps={{
                                            ...params.slotProps,
                                            input: {
                                                ...params.slotProps.input,
                                                startAdornment: <AddIcon sx={{ fontSize: 18, color: '#2563eb', ml: 0.5 }} />,
                                            },
                                        }}
                                    />
                                )}
                            />
                        )}

                        {/* Order by */}
                        {controller.canSort && sortOptions.length > 0 && (
                            <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 2, mt: 2.5, pt: 2, borderTop: '1px dashed #e2e8f0', flexWrap: 'wrap' }}>
                                <Box sx={{ minWidth: 240 }}>
                                    <Typography sx={labelSx}>Order by column</Typography>
                                    <TextField
                                        select
                                        size="small"
                                        fullWidth
                                        value={draft.sort?.field ?? ''}
                                        onChange={(e) =>
                                            setDraft((prev) => ({
                                                ...prev,
                                                sort: e.target.value ? { field: e.target.value, order: prev.sort?.order ?? 'desc' } : undefined,
                                            }))
                                        }
                                        sx={inputSx}
                                        slotProps={{ select: { displayEmpty: true } }}
                                    >
                                        <MenuItem value="" sx={{ fontSize: '0.8rem' }}>
                                            Keep current order
                                        </MenuItem>
                                        {sortOptions.map((o) => (
                                            <MenuItem key={o.field} value={o.field} sx={{ fontSize: '0.8rem' }}>
                                                {o.label}
                                            </MenuItem>
                                        ))}
                                    </TextField>
                                </Box>
                                <RadioGroup
                                    row
                                    value={draft.sort?.order ?? 'desc'}
                                    onChange={(e) =>
                                        setDraft((prev) => (prev.sort ? { ...prev, sort: { ...prev.sort, order: e.target.value as 'asc' | 'desc' } } : prev))
                                    }
                                >
                                    {(['desc', 'asc'] as const).map((o) => (
                                        <FormControlLabel
                                            key={o}
                                            value={o}
                                            disabled={!draft.sort}
                                            control={<Radio size="small" />}
                                            label={o === 'desc' ? 'Descending' : 'Ascending'}
                                            sx={{ '& .MuiFormControlLabel-label': { fontSize: '0.8rem' } }}
                                        />
                                    ))}
                                </RadioGroup>
                            </Box>
                        )}

                        {/* Save filter as */}
                        <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 1, mt: 2.5, pt: 2, borderTop: '1px dashed #e2e8f0' }}>
                            <Box sx={{ flex: 1, maxWidth: 360 }}>
                                <Typography sx={labelSx}>Save filter as</Typography>
                                <TextField
                                    size="small"
                                    fullWidth
                                    placeholder="e.g. My hot leads this week"
                                    value={saveName}
                                    onChange={(e) => setSaveName(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            void handleSave();
                                        }
                                    }}
                                    slotProps={{ htmlInput: { maxLength: 120 } }}
                                    sx={inputSx}
                                />
                            </Box>
                            <Button
                                variant="outlined"
                                disabled={busy || !saveName.trim() || draftCount === 0}
                                onClick={() => void handleSave()}
                                startIcon={busy ? <CircularProgress size={14} /> : undefined}
                                sx={{ textTransform: 'none', fontWeight: 700, borderRadius: '6px', height: 36 }}
                            >
                                Save
                            </Button>
                        </Box>
                    </Box>
                )}
            </DialogContent>

            {tab === 'advanced' && (
                <DialogActions sx={{ px: 3, py: 1.5, borderTop: '1px solid #e2e8f0', gap: 1 }}>
                    <Button
                        onClick={() => {
                            setDraft(EMPTY);
                            setExtraKeys([]);
                            setSavedId('');
                            if (controller.criteria) controller.clear();
                        }}
                        sx={textBtnSx}
                    >
                        Clear
                    </Button>
                    <Typography sx={{ flex: 1, fontSize: '0.78rem', color: '#64748b', textAlign: 'right', pr: 1 }}>
                        {draftCount > 0 ? `${matchCount.toLocaleString('en-IN')} matching record${matchCount === 1 ? '' : 's'}` : 'No filters set'}
                    </Typography>
                    <Button onClick={controller.close} sx={textBtnSx}>
                        Cancel
                    </Button>
                    <Button variant="contained" onClick={() => applyAndClose(draft)} sx={primaryBtnSx}>
                        Search
                    </Button>
                </DialogActions>
            )}
        </Dialog>
    );
}

// ── Recent tab ───────────────────────────────────────────────────────────────

function RecentList({
    items,
    loading,
    describe,
    onApply,
    onEdit,
    onGoAdvanced,
}: {
    items: SavedTableFilter[];
    loading: boolean;
    describe: (c: FilterCriteria) => string[];
    onApply: (c: FilterCriteria) => void;
    onEdit: (c: FilterCriteria) => void;
    onGoAdvanced: () => void;
}) {
    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                <CircularProgress size={24} />
            </Box>
        );
    }
    if (items.length === 0) {
        return (
            <Box sx={{ textAlign: 'center', py: 6, color: '#64748b' }}>
                <HistoryIcon sx={{ fontSize: 40, color: '#cbd5e1' }} />
                <Typography sx={{ fontWeight: 700, color: '#334155', mt: 1 }}>No recent filters yet</Typography>
                <Typography sx={{ fontSize: '0.8rem', mt: 0.5 }}>Your last 10 searches show up here, so you can run them again in one click.</Typography>
                <Button onClick={onGoAdvanced} sx={{ mt: 2, textTransform: 'none', fontWeight: 700 }} startIcon={<TuneIcon />}>
                    Build a filter
                </Button>
            </Box>
        );
    }
    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {items.map((item) => {
                const parts = describe(item.criteria);
                return (
                    <Box
                        key={item.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => onApply(item.criteria)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                onApply(item.criteria);
                            }
                        }}
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1.5,
                            p: 1.25,
                            pl: 1.5,
                            border: '1px solid #e2e8f0',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                            '&:hover, &:focus-visible': { borderColor: '#93c5fd', backgroundColor: '#f8fbff', outline: 'none' },
                        }}
                    >
                        <HistoryIcon sx={{ fontSize: 18, color: '#94a3b8', flexShrink: 0 }} />
                        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                            {parts.length ? (
                                parts.map((p) => (
                                    <Chip
                                        key={p}
                                        label={p}
                                        size="small"
                                        sx={{ height: 22, fontSize: '0.72rem', fontWeight: 600, backgroundColor: '#eff6ff', color: '#1e40af', maxWidth: '100%' }}
                                    />
                                ))
                            ) : (
                                <Typography sx={{ fontSize: '0.78rem', color: '#94a3b8' }}>Uses fields that no longer exist</Typography>
                            )}
                        </Box>
                        <Typography sx={{ fontSize: '0.72rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>{relativeTime(item.lastUsedAt)}</Typography>
                        <Tooltip title="Edit in Advanced">
                            <IconButton
                                size="small"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onEdit(item.criteria);
                                }}
                            >
                                <EditOutlinedIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                        </Tooltip>
                    </Box>
                );
            })}
        </Box>
    );
}

// ── Field controls ───────────────────────────────────────────────────────────

const checkboxIcon = <CheckBoxOutlineBlankIcon fontSize="small" />;
const checkedIcon = <CheckBoxIcon fontSize="small" />;

function FieldControl({
    field,
    condition,
    onChange,
}: {
    field: FilterFieldDef;
    condition: FilterCondition | undefined;
    onChange: (c: FilterCondition | null) => void;
}) {
    switch (field.kind) {
        case 'options': {
            const options = field.options ?? [];
            const selected = condition?.values ?? [];
            // Values no longer offered (archived options) stay visible so they can be removed.
            const all = [...options, ...selected.filter((v) => !options.some((o) => o.value === v)).map((v) => ({ value: v, label: v }))];
            return (
                <Autocomplete
                    multiple
                    disableCloseOnSelect
                    size="small"
                    limitTags={2}
                    options={all}
                    value={all.filter((o) => selected.includes(o.value))}
                    isOptionEqualToValue={(a, b) => a.value === b.value}
                    getOptionLabel={(o) => o.label}
                    onChange={(_, v) => onChange(v.length ? { op: 'in', values: v.map((o) => o.value) } : null)}
                    renderOption={(props, option, { selected: isSel }) => {
                        const { key, ...rest } = props as React.HTMLAttributes<HTMLLIElement> & { key: string };
                        return (
                            <li key={key} {...rest} style={{ fontSize: '0.8rem', paddingTop: 2, paddingBottom: 2 }}>
                                <Checkbox icon={checkboxIcon} checkedIcon={checkedIcon} checked={isSel} size="small" sx={{ mr: 0.5, p: 0.5 }} />
                                {option.label}
                            </li>
                        );
                    }}
                    slotProps={{ chip: { size: 'small', sx: { height: 22, fontSize: '0.72rem' } } }}
                    renderInput={(params) => <TextField {...params} placeholder={selected.length ? '' : 'Any'} sx={inputSx} />}
                />
            );
        }
        case 'text':
            return (
                <TextField
                    size="small"
                    fullWidth
                    placeholder="Contains..."
                    value={condition?.value ?? ''}
                    onChange={(e) => onChange(e.target.value ? { op: 'contains', value: e.target.value } : null)}
                    sx={inputSx}
                />
            );
        case 'boolean':
            return (
                <TextField
                    select
                    size="small"
                    fullWidth
                    value={condition?.value ?? ''}
                    onChange={(e) => onChange(e.target.value ? { op: 'is', value: e.target.value } : null)}
                    sx={inputSx}
                    slotProps={{ select: { displayEmpty: true } }}
                >
                    <MenuItem value="" sx={{ fontSize: '0.8rem' }}>
                        Any
                    </MenuItem>
                    <MenuItem value="yes" sx={{ fontSize: '0.8rem' }}>
                        Yes
                    </MenuItem>
                    <MenuItem value="no" sx={{ fontSize: '0.8rem' }}>
                        No
                    </MenuItem>
                </TextField>
            );
        case 'days': {
            const op = condition?.op ?? 'gte';
            return (
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <TextField
                        select
                        size="small"
                        value={op}
                        onChange={(e) => onChange({ op: e.target.value as FilterCondition['op'], value: condition?.value })}
                        sx={{ ...inputSx, width: 130, flexShrink: 0 }}
                    >
                        {DAYS_OPERATORS.map((o) => (
                            <MenuItem key={o.op} value={o.op} sx={{ fontSize: '0.8rem' }}>
                                {o.label}
                            </MenuItem>
                        ))}
                    </TextField>
                    <TextField
                        size="small"
                        fullWidth
                        type="number"
                        placeholder="Days"
                        value={condition?.value ?? ''}
                        onChange={(e) => onChange(e.target.value === '' ? null : { op, value: e.target.value })}
                        slotProps={{ htmlInput: { min: 0, max: 36500 } }}
                        sx={inputSx}
                    />
                </Box>
            );
        }
        case 'date': {
            const op = condition?.op ?? 'equals';
            const meta = DATE_OPERATORS.find((o) => o.op === op) ?? DATE_OPERATORS[0];
            const set = (patch: Partial<FilterCondition>) => {
                const next = { op, value: condition?.value, value2: condition?.value2, ...patch };
                const inputs = DATE_OPERATORS.find((o) => o.op === next.op)?.inputs ?? 1;
                // A date operator with nothing picked is "not set".
                if (inputs > 0 && !next.value && !next.value2) return onChange(next.op === 'equals' ? null : { op: next.op });
                onChange(inputs === 0 ? { op: next.op } : inputs === 1 ? { op: next.op, value: next.value } : next);
            };
            return (
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    <TextField
                        select
                        size="small"
                        value={op}
                        onChange={(e) => set({ op: e.target.value as FilterCondition['op'] })}
                        sx={{ ...inputSx, width: 140, flexShrink: 0 }}
                    >
                        {DATE_OPERATORS.map((o) => (
                            <MenuItem key={o.op} value={o.op} sx={{ fontSize: '0.8rem' }}>
                                {o.label}
                            </MenuItem>
                        ))}
                    </TextField>
                    {meta.inputs >= 1 && (
                        <TextField
                            size="small"
                            type="date"
                            value={condition?.value ?? ''}
                            onChange={(e) => set({ value: e.target.value || undefined })}
                            sx={{ ...inputSx, flex: 1, minWidth: 140 }}
                            slotProps={{ htmlInput: { 'aria-label': meta.inputs === 2 ? `${field.label} from` : field.label } }}
                        />
                    )}
                    {meta.inputs === 2 && (
                        <TextField
                            size="small"
                            type="date"
                            value={condition?.value2 ?? ''}
                            onChange={(e) => set({ value2: e.target.value || undefined })}
                            sx={{ ...inputSx, flex: 1, minWidth: 140 }}
                            slotProps={{ htmlInput: { 'aria-label': `${field.label} to` } }}
                        />
                    )}
                </Box>
            );
        }
    }
}
