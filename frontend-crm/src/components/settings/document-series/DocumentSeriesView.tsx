'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Checkbox,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControlLabel,
    IconButton,
    MenuItem,
    Switch,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import FormatListNumberedOutlinedIcon from '@mui/icons-material/FormatListNumberedOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { AppToast } from '@/components/common/AppToast';
import { errorMessage, inputSx, panelHeaderSx, primaryButtonSx, secondaryButtonSx, surfaceSx } from '@/components/settings/form-customization/builderUi';
import { useDocumentSeries, useSaveDocumentSeries } from '@/hooks/queries/useDocumentSeries';
import {
    FY_FORMATS,
    SEPARATORS,
    SERIES_MODULES,
    type DocumentSeriesConfig,
    type FyFormat,
    type SeriesInput,
    type SeriesModule,
    type SeriesRule,
    type SeriesSettings,
    type Separator,
} from '@/types/documentSeries.types';
import {
    MAX_COMPANY_PREFIX,
    MAX_MODULE_PREFIX,
    MAX_PAD_LENGTH,
    MAX_SUFFIX,
    financialYearOf,
    formatDocumentNumber,
    formatFinancialYear,
    nextNumber,
    validateDraft,
} from '@/utils/documentSeries';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const SEPARATOR_LABELS: Record<Separator, string> = {
    '/': 'Slash  /',
    '-': 'Hyphen  -',
    _: 'Underscore  _',
    '.': 'Dot  .',
    '': 'None',
};

interface DraftRow extends SeriesInput {
    module: SeriesModule;
    label: string;
}

interface Draft {
    settings: SeriesSettings;
    rows: DraftRow[];
}

const moduleOrder = (module: SeriesModule) => SERIES_MODULES.indexOf(module);

const toInput = (row: SeriesInput): SeriesInput => ({
    modulePrefix: row.modulePrefix,
    includeCompanyPrefix: row.includeCompanyPrefix,
    suffix: row.suffix,
    padLength: row.padLength,
    startingNumber: row.startingNumber,
});

/** Series always include the financial year and restart every year. */
const toRule = (row: SeriesInput): SeriesRule => ({ ...toInput(row), includeFinancialYear: true, resetEachFinancialYear: true });

const draftFrom = (config: DocumentSeriesConfig): Draft => ({
    settings: {
        companyPrefix: config.settings.companyPrefix,
        separator: config.settings.separator,
        fyStartMonth: config.settings.fyStartMonth,
        fyFormat: config.settings.fyFormat,
    },
    rows: config.series.map((s) => ({ module: s.module, label: s.label, ...toInput(s) })),
});

const headCellSx = {
    fontSize: '0.72rem',
    fontWeight: 700,
    color: 'var(--crm-slate-600)',
    textTransform: 'uppercase',
    letterSpacing: '0.03em',
    backgroundColor: 'var(--mui-palette-background-subtle)',
    whiteSpace: 'nowrap',
    py: 1.25,
} as const;

const cellSx = { py: 1, px: 1.25, verticalAlign: 'top', whiteSpace: 'nowrap' } as const;
/** Fixed input widths so typing never squeezes other columns; the table scrolls sideways instead. */
const fixedInputSx = (width: number) => ({ ...inputSx, width, '& .MuiOutlinedInput-input': { py: '7px', px: '10px' } }) as const;
const fieldLabelSx = { fontSize: '0.75rem', fontWeight: 600, color: 'var(--crm-slate-700)', mb: 0.5 } as const;

function ErrorText({ message }: { message?: string }) {
    if (!message) return null;
    return <Typography sx={{ fontSize: '0.7rem', color: 'var(--mui-palette-error-main)', mt: 0.4, lineHeight: 1.3, whiteSpace: 'normal', maxWidth: 160 }}>{message}</Typography>;
}

function AddSeriesDialog({
    open,
    options,
    onClose,
    onAdd,
}: {
    open: boolean;
    options: { module: SeriesModule; label: string; nextCode: string }[];
    onClose: () => void;
    onAdd: (modules: SeriesModule[]) => void;
}) {
    const [selected, setSelected] = useState<SeriesModule[]>([]);
    const toggle = (module: SeriesModule) => setSelected((s) => (s.includes(module) ? s.filter((m) => m !== module) : [...s, module]));
    const close = () => {
        setSelected([]);
        onClose();
    };

    return (
        <Dialog open={open} onClose={close} fullWidth maxWidth="xs">
            <DialogTitle sx={{ fontSize: '1rem', fontWeight: 700 }}>Add series</DialogTitle>
            <DialogContent dividers>
                <Typography sx={{ fontSize: '0.8rem', color: 'var(--mui-palette-text-secondary)', mb: 1.5 }}>
                    Choose the modules to give their own series. You can set each one&apos;s prefix, suffix and numbering in the table.
                </Typography>
                {options.length === 0 ? (
                    <Typography sx={{ fontSize: '0.85rem', color: 'var(--crm-slate-700)' }}>Every module already has a series.</Typography>
                ) : (
                    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                        {options.map((o) => (
                            <FormControlLabel
                                key={o.module}
                                control={<Checkbox size="small" checked={selected.includes(o.module)} onChange={() => toggle(o.module)} />}
                                label={
                                    <Box>
                                        <Typography component="span" sx={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--crm-slate-900)' }}>
                                            {o.label}
                                        </Typography>
                                        <Typography component="span" sx={{ fontSize: '0.75rem', color: 'var(--mui-palette-text-muted)', ml: 1 }}>
                                            now {o.nextCode}
                                        </Typography>
                                    </Box>
                                }
                            />
                        ))}
                    </Box>
                )}
            </DialogContent>
            <DialogActions sx={{ px: 3, py: 1.5 }}>
                <Button variant="outlined" sx={secondaryButtonSx} onClick={close}>
                    Cancel
                </Button>
                <Button
                    variant="contained"
                    sx={primaryButtonSx}
                    disabled={selected.length === 0}
                    onClick={() => {
                        onAdd(selected);
                        close();
                    }}
                >
                    Add {selected.length > 1 ? `${selected.length} series` : 'series'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

/** Admin → Document Series: common prefix / financial year settings plus the series added per module. */
export function DocumentSeriesView() {
    const query = useDocumentSeries();
    const save = useSaveDocumentSeries();
    const [draft, setDraft] = useState<Draft | null>(null);
    const [addOpen, setAddOpen] = useState(false);
    const [toast, setToast] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });

    // Take the server copy on first load and after every save (React's "adjust state while rendering" pattern).
    const [syncedFrom, setSyncedFrom] = useState<DocumentSeriesConfig | undefined>(undefined);
    if (query.data && query.data !== syncedFrom) {
        setSyncedFrom(query.data);
        setDraft(draftFrom(query.data));
    }

    const saved = useMemo(() => (query.data ? draftFrom(query.data) : null), [query.data]);
    const dirty = Boolean(draft && saved && JSON.stringify(draft) !== JSON.stringify(saved));
    const errors = useMemo(
        () => (draft ? validateDraft(draft.settings, draft.rows.map((row) => ({ module: row.module, label: row.label, rule: row }))) : {}),
        [draft],
    );
    const hasErrors = Object.keys(errors).length > 0;
    const fy = useMemo(() => (draft && query.data ? financialYearOf(draft.settings, query.data.timeZone) : null), [draft, query.data]);

    // Warn before leaving with unsaved changes.
    useEffect(() => {
        if (!dirty) return;
        const handler = (e: BeforeUnloadEvent) => e.preventDefault();
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [dirty]);

    if (query.isLoading || (!draft && !query.isError)) {
        return (
            <Box sx={{ ...surfaceSx, py: 8, display: 'flex', justifyContent: 'center' }}>
                <CircularProgress size={28} />
            </Box>
        );
    }
    if (query.isError || !draft || !query.data || !fy) {
        return (
            <Alert severity="error" sx={{ borderRadius: '10px' }}>
                {errorMessage(query.error, 'Could not load document series.')}
            </Alert>
        );
    }

    const config = query.data;
    const savedSeries = new Map(config.series.map((s) => [s.module, s]));
    const defaults = new Map(config.defaultNumbering.map((d) => [d.module, d]));
    const inDraft = new Set(draft.rows.map((r) => r.module));

    /** Modules using their original numbering in the draft, with what that numbering looks like. */
    const unadded = SERIES_MODULES.filter((m) => !inDraft.has(m)).map((module) => {
        const d = defaults.get(module);
        const label = d?.label ?? savedSeries.get(module)?.label ?? module;
        return { module, label, nextCode: d?.nextCode ?? 'original numbering' };
    });

    const setSettings = (patch: Partial<SeriesSettings>) => setDraft((d) => (d ? { ...d, settings: { ...d.settings, ...patch } } : d));
    const setRow = (module: SeriesModule, patch: Partial<SeriesInput>) =>
        setDraft((d) => (d ? { ...d, rows: d.rows.map((row) => (row.module === module ? { ...row, ...patch } : row)) } : d));
    const removeRow = (module: SeriesModule) => setDraft((d) => (d ? { ...d, rows: d.rows.filter((row) => row.module !== module) } : d));
    const addRows = (modules: SeriesModule[]) =>
        setDraft((d) => {
            if (!d) return d;
            const added: DraftRow[] = modules.map((module) => {
                // Re-adding a series removed in this draft brings back its saved settings.
                const previous = savedSeries.get(module);
                if (previous) return { module, label: previous.label, ...toInput(previous) };
                const d0 = defaults.get(module);
                return {
                    module,
                    label: d0?.label ?? module,
                    modulePrefix: d0?.suggestedPrefix ?? module.slice(0, 3).toUpperCase(),
                    includeCompanyPrefix: Boolean(d.settings.companyPrefix),
                    suffix: '',
                    padLength: 4,
                    startingNumber: 1,
                };
            });
            const rows = [...d.rows, ...added].sort((a, b) => moduleOrder(a.module) - moduleOrder(b.module));
            return { ...d, rows };
        });

    /** Last number issued this financial year on the module's series counter. */
    const lastIssued = (module: SeriesModule) => savedSeries.get(module)?.lastNumber ?? defaults.get(module)?.seriesLastNumber ?? 0;
    const previewFor = (row: DraftRow) => formatDocumentNumber(draft.settings, toRule(row), fy, nextNumber(lastIssued(row.module), row.startingNumber));
    const sampleCode = formatDocumentNumber(
        draft.settings,
        toRule({ modulePrefix: 'L', includeCompanyPrefix: Boolean(draft.settings.companyPrefix), suffix: '', padLength: 4, startingNumber: 1 }),
        fy,
        1004,
    );

    const onSave = async () => {
        try {
            await save.mutateAsync({ ...draft.settings, series: draft.rows.map((row) => ({ module: row.module, ...toInput(row) })) });
            setToast({ open: true, message: 'Document series saved. New records will use the updated numbering.', severity: 'success' });
        } catch (err) {
            setToast({ open: true, message: errorMessage(err), severity: 'error' });
        }
    };

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            {/* Header */}
            <Box sx={{ ...surfaceSx, p: { xs: 2, md: 2.5 }, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2 }}>
                <Box
                    sx={{
                        width: 40,
                        height: 40,
                        borderRadius: '10px',
                        backgroundColor: 'var(--mui-palette-primary-soft)',
                        border: '1px solid var(--mui-palette-primary-softBorder)',
                        color: 'var(--crm-text-blue-600)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                    }}
                >
                    <FormatListNumberedOutlinedIcon />
                </Box>
                <Box sx={{ flex: 1, minWidth: 220 }}>
                    <Typography component="h1" sx={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--crm-slate-900)' }}>
                        Document Series
                    </Typography>
                    <Typography sx={{ fontSize: '0.8rem', color: 'var(--mui-palette-text-secondary)', mt: 0.25 }}>
                        Build record numbers from a company prefix, module prefix, financial year and running number, e.g.{' '}
                        <Box component="span" sx={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--crm-text-blue-700)' }}>
                            {sampleCode}
                        </Box>
                    </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button variant="outlined" sx={secondaryButtonSx} disabled={!dirty || save.isPending} onClick={() => saved && setDraft(saved)}>
                        Cancel
                    </Button>
                    <Tooltip title={hasErrors ? 'Fix the highlighted fields first' : ''}>
                        <span>
                            <Button variant="contained" sx={primaryButtonSx} disabled={!dirty || hasErrors || save.isPending} onClick={onSave}>
                                {save.isPending ? 'Saving…' : 'Save changes'}
                            </Button>
                        </span>
                    </Tooltip>
                </Box>
            </Box>

            <Alert severity="info" icon={<InfoOutlinedIcon fontSize="small" />} sx={{ borderRadius: '10px', fontSize: '0.8rem' }}>
                Every series restarts from its starting number at the beginning of each financial year ({MONTHS[draft.settings.fyStartMonth - 1]} 1).
                Changes apply to records created after saving; existing numbers never change. Modules without a series keep their current
                numbering.
            </Alert>

            {/* Common settings */}
            <Box sx={{ ...surfaceSx, overflow: 'hidden' }}>
                <Box sx={panelHeaderSx}>
                    <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--crm-slate-900)' }}>Common settings</Typography>
                    <Typography sx={{ fontSize: '0.75rem', color: 'var(--mui-palette-text-secondary)' }}>Shared by every series.</Typography>
                </Box>
                <Box sx={{ p: 2, display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' } }}>
                    <Box>
                        <Typography component="label" htmlFor="ds-company-prefix" sx={fieldLabelSx}>
                            Company prefix
                        </Typography>
                        <TextField
                            id="ds-company-prefix"
                            fullWidth
                            size="small"
                            placeholder="e.g. NIPL"
                            value={draft.settings.companyPrefix}
                            onChange={(e) => setSettings({ companyPrefix: e.target.value.toUpperCase().replace(/\s/g, '') })}
                            error={Boolean(errors.companyPrefix)}
                            slotProps={{ htmlInput: { maxLength: MAX_COMPANY_PREFIX } }}
                            sx={inputSx}
                        />
                        <ErrorText message={errors.companyPrefix} />
                    </Box>
                    <Box>
                        <Typography component="label" htmlFor="ds-separator" sx={fieldLabelSx}>
                            Separator
                        </Typography>
                        <TextField
                            id="ds-separator"
                            select
                            fullWidth
                            size="small"
                            value={draft.settings.separator === '' ? 'none' : draft.settings.separator}
                            onChange={(e) => setSettings({ separator: (e.target.value === 'none' ? '' : e.target.value) as Separator })}
                            sx={inputSx}
                        >
                            {SEPARATORS.map((sep) => (
                                <MenuItem key={sep || 'none'} value={sep || 'none'} sx={{ fontSize: '0.85rem' }}>
                                    {SEPARATOR_LABELS[sep]}
                                </MenuItem>
                            ))}
                        </TextField>
                    </Box>
                    <Box>
                        <Typography component="label" htmlFor="ds-fy-start" sx={fieldLabelSx}>
                            Financial year starts in
                        </Typography>
                        <TextField
                            id="ds-fy-start"
                            select
                            fullWidth
                            size="small"
                            value={draft.settings.fyStartMonth}
                            onChange={(e) => setSettings({ fyStartMonth: Number(e.target.value) })}
                            sx={inputSx}
                        >
                            {MONTHS.map((name, i) => (
                                <MenuItem key={name} value={i + 1} sx={{ fontSize: '0.85rem' }}>
                                    {name}
                                </MenuItem>
                            ))}
                        </TextField>
                    </Box>
                    <Box>
                        <Typography component="label" htmlFor="ds-fy-format" sx={fieldLabelSx}>
                            Financial year format
                        </Typography>
                        <TextField
                            id="ds-fy-format"
                            select
                            fullWidth
                            size="small"
                            value={draft.settings.fyFormat}
                            onChange={(e) => setSettings({ fyFormat: e.target.value as FyFormat })}
                            sx={inputSx}
                        >
                            {FY_FORMATS.map((format) => (
                                <MenuItem key={format} value={format} sx={{ fontSize: '0.85rem' }}>
                                    {formatFinancialYear(fy.startYear, draft.settings.fyStartMonth, format)}
                                    <Box component="span" sx={{ color: 'var(--mui-palette-text-muted)', ml: 1, fontSize: '0.75rem' }}>
                                        ({format})
                                    </Box>
                                </MenuItem>
                            ))}
                        </TextField>
                        <Typography sx={{ fontSize: '0.7rem', color: 'var(--mui-palette-text-secondary)', mt: 0.4 }}>Current financial year: {fy.label}</Typography>
                    </Box>
                </Box>
            </Box>

            {/* Series */}
            <Box sx={{ ...surfaceSx, overflow: 'hidden', minWidth: 0 }}>
                <Box sx={{ ...panelHeaderSx, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ flex: 1, minWidth: 200 }}>
                        <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--crm-slate-900)' }}>Series</Typography>
                        <Typography sx={{ fontSize: '0.75rem', color: 'var(--mui-palette-text-secondary)' }}>
                            Order: company prefix · module prefix · financial year · number · suffix
                        </Typography>
                    </Box>
                    <Button
                        size="small"
                        variant="contained"
                        startIcon={<AddIcon />}
                        sx={primaryButtonSx}
                        disabled={unadded.length === 0}
                        onClick={() => setAddOpen(true)}
                    >
                        Add series
                    </Button>
                </Box>

                {draft.rows.length === 0 ? (
                    <Box sx={{ py: 5, px: 3, textAlign: 'center' }}>
                        <Typography sx={{ fontWeight: 700, color: 'var(--mui-palette-text-primary)', fontSize: '0.9rem' }}>No series yet</Typography>
                        <Typography sx={{ fontSize: '0.8rem', color: 'var(--mui-palette-text-secondary)', mt: 0.5 }}>
                            All modules use their current numbering. Add a series to number a module like {sampleCode}.
                        </Typography>
                        <Button variant="outlined" startIcon={<AddIcon />} sx={{ ...secondaryButtonSx, mt: 2 }} onClick={() => setAddOpen(true)}>
                            Add series
                        </Button>
                    </Box>
                ) : (
                    <TableContainer sx={{ overflowX: 'auto', maxWidth: '100%' }}>
                        <Table size="small" sx={{ width: 'max-content', minWidth: '100%' }}>
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={headCellSx}>Module</TableCell>
                                    <TableCell sx={headCellSx}>Prefix</TableCell>
                                    <TableCell sx={headCellSx} align="center">
                                        Company prefix
                                    </TableCell>
                                    <TableCell sx={headCellSx}>Suffix</TableCell>
                                    <TableCell sx={headCellSx}>
                                        <Tooltip title="Minimum digits; shorter numbers are zero-padded (4 → 0042)">
                                            <span>Digits</span>
                                        </Tooltip>
                                    </TableCell>
                                    <TableCell sx={headCellSx}>
                                        <Tooltip title="Each financial year starts from this number. Raising it mid-year jumps the series forward; numbers are never reused.">
                                            <span>Starting #</span>
                                        </Tooltip>
                                    </TableCell>
                                    <TableCell sx={headCellSx}>
                                        <Tooltip title={`Last number issued in FY ${fy.label}`}>
                                            <span>Current #</span>
                                        </Tooltip>
                                    </TableCell>
                                    <TableCell sx={headCellSx}>Next number</TableCell>
                                    <TableCell sx={headCellSx} />
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {draft.rows.map((row) => {
                                    const err = (field: string) => errors[`${row.module}.${field}`];
                                    return (
                                        <TableRow key={row.module} hover>
                                            <TableCell sx={{ ...cellSx, pt: 1.75 }}>
                                                <Typography sx={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--crm-slate-900)' }}>{row.label}</Typography>
                                            </TableCell>
                                            <TableCell sx={cellSx}>
                                                <TextField
                                                    size="small"
                                                    value={row.modulePrefix}
                                                    onChange={(e) => setRow(row.module, { modulePrefix: e.target.value.toUpperCase().replace(/\s/g, '') })}
                                                    error={Boolean(err('modulePrefix'))}
                                                    slotProps={{ htmlInput: { maxLength: MAX_MODULE_PREFIX, 'aria-label': `${row.label} prefix` } }}
                                                    sx={fixedInputSx(110)}
                                                />
                                                <ErrorText message={err('modulePrefix')} />
                                            </TableCell>
                                            <TableCell sx={cellSx} align="center">
                                                <Switch
                                                    size="small"
                                                    checked={row.includeCompanyPrefix}
                                                    onChange={(e) => setRow(row.module, { includeCompanyPrefix: e.target.checked })}
                                                    slotProps={{ input: { 'aria-label': `Include company prefix in ${row.label} numbers` } }}
                                                />
                                                <ErrorText message={err('includeCompanyPrefix')} />
                                            </TableCell>
                                            <TableCell sx={cellSx}>
                                                <TextField
                                                    size="small"
                                                    placeholder="None"
                                                    value={row.suffix}
                                                    onChange={(e) => setRow(row.module, { suffix: e.target.value.toUpperCase().replace(/\s/g, '') })}
                                                    error={Boolean(err('suffix'))}
                                                    slotProps={{ htmlInput: { maxLength: MAX_SUFFIX, 'aria-label': `${row.label} suffix` } }}
                                                    sx={fixedInputSx(110)}
                                                />
                                                <ErrorText message={err('suffix')} />
                                            </TableCell>
                                            <TableCell sx={cellSx}>
                                                <TextField
                                                    size="small"
                                                    type="number"
                                                    value={Number.isNaN(row.padLength) ? '' : row.padLength}
                                                    onChange={(e) => setRow(row.module, { padLength: e.target.value === '' ? NaN : Number(e.target.value) })}
                                                    error={Boolean(err('padLength'))}
                                                    slotProps={{ htmlInput: { min: 1, max: MAX_PAD_LENGTH, 'aria-label': `${row.label} digits` } }}
                                                    sx={fixedInputSx(76)}
                                                />
                                                <ErrorText message={err('padLength')} />
                                            </TableCell>
                                            <TableCell sx={cellSx}>
                                                <TextField
                                                    size="small"
                                                    type="number"
                                                    value={Number.isNaN(row.startingNumber) ? '' : row.startingNumber}
                                                    onChange={(e) => setRow(row.module, { startingNumber: e.target.value === '' ? NaN : Number(e.target.value) })}
                                                    error={Boolean(err('startingNumber'))}
                                                    slotProps={{ htmlInput: { min: 1, 'aria-label': `${row.label} starting number` } }}
                                                    sx={fixedInputSx(120)}
                                                />
                                                <ErrorText message={err('startingNumber')} />
                                            </TableCell>
                                            <TableCell sx={{ ...cellSx, pt: 1.75 }}>
                                                <Typography sx={{ fontSize: '0.84rem', color: 'var(--crm-slate-700)' }}>{lastIssued(row.module)}</Typography>
                                            </TableCell>
                                            <TableCell sx={{ ...cellSx, pt: 1.75 }}>
                                                <Typography sx={{ fontSize: '0.84rem', fontFamily: 'monospace', fontWeight: 700, color: 'var(--crm-text-blue-700)' }}>
                                                    {previewFor(row)}
                                                </Typography>
                                            </TableCell>
                                            <TableCell sx={{ ...cellSx, pt: 1.1 }} align="right">
                                                <Tooltip title={`Remove the ${row.label} series (it goes back to its original numbering when you save)`}>
                                                    <IconButton
                                                        size="small"
                                                        aria-label={`Remove ${row.label} series`}
                                                        onClick={() => removeRow(row.module)}
                                                        sx={{ color: 'var(--mui-palette-text-muted)', '&:hover': { color: 'var(--crm-red-500)', backgroundColor: 'var(--mui-palette-error-soft)' } }}
                                                    >
                                                        <DeleteOutlineRoundedIcon fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}

                {unadded.length > 0 && draft.rows.length > 0 && (
                    <Box sx={{ px: 2, py: 1.25, borderTop: '1px solid var(--mui-palette-border-main)', backgroundColor: 'var(--mui-palette-background-subtle)' }}>
                        <Typography sx={{ fontSize: '0.75rem', color: 'var(--mui-palette-text-secondary)' }}>
                            Using current numbering:{' '}
                            {unadded.map((u, i) => (
                                <React.Fragment key={u.module}>
                                    {i > 0 && ', '}
                                    {u.label}{' '}
                                    <Box component="span" sx={{ fontFamily: 'monospace', color: 'var(--crm-slate-600)' }}>
                                        ({u.nextCode})
                                    </Box>
                                </React.Fragment>
                            ))}
                        </Typography>
                    </Box>
                )}
            </Box>

            {config.settings.updatedAt && (
                <Typography sx={{ fontSize: '0.72rem', color: 'var(--mui-palette-text-muted)', textAlign: 'right' }}>
                    Last saved by {config.settings.updatedBy ?? 'unknown'} on{' '}
                    {new Date(config.settings.updatedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                </Typography>
            )}

            <AddSeriesDialog open={addOpen} options={unadded} onClose={() => setAddOpen(false)} onAdd={addRows} />
            <AppToast open={toast.open} message={toast.message} severity={toast.severity} onClose={() => setToast((t) => ({ ...t, open: false }))} />
        </Box>
    );
}
