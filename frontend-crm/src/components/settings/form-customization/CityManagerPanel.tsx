'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
    Autocomplete,
    Box,
    Button,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControlLabel,
    IconButton,
    InputAdornment,
    Radio,
    RadioGroup,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutlineOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import LocationCityOutlinedIcon from '@mui/icons-material/LocationCityOutlined';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    COUNTRY_OPTIONS,
    DEFAULT_COUNTRY_CODE,
    getCountryByCode,
    getSubdivisionsByCountry,
    matchesSearch,
    type CountryMasterItem,
    type StateRegionMasterItem,
} from '@/data/addressMaster';
import { cityService, type CitySuggestion } from '@/services/city.service';
import { cityAdminService, describeUpdatedRecords, type AdminCity, type CityUsage } from '@/services/cityAdmin.service';
import {
    Badge,
    EmptyState,
    dangerColor,
    errorMessage,
    inputSx,
    panelHeaderSx,
    primaryButtonSx,
    secondaryButtonSx,
    surfaceSx,
} from './builderUi';

type Notify = (message: string, severity?: 'success' | 'error' | 'info' | 'warning') => void;

const PAGE_SIZE = 25;
/** Address columns store the city name in 80 characters. */
const CITY_NAME_MAX = 80;

const iconButtonSx = {
    border: '1px solid var(--mui-palette-border-main)',
    borderRadius: '8px',
    color: 'var(--mui-palette-text-secondary)',
    backgroundColor: 'var(--mui-palette-background-paper)',
    transition: 'all 0.15s ease',
    '&:hover': {
        borderColor: 'var(--crm-blue-300)',
        backgroundColor: 'var(--mui-palette-primary-soft)',
        color: 'var(--crm-text-blue-700)',
    },
} as const;

const dangerIconButtonSx = {
    ...iconButtonSx,
    '&:hover': {
        color: 'var(--mui-palette-error-main)',
        backgroundColor: 'var(--mui-palette-error-soft)',
        borderColor: 'var(--mui-palette-error-softBorder)',
    },
} as const;

const plural = (n: number, word: string, words = `${word}s`) => `${n} ${n === 1 ? word : words}`;

function useDebounced<V>(value: V, ms = 250): V {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const timer = setTimeout(() => setDebounced(value), ms);
        return () => clearTimeout(timer);
    }, [value, ms]);
    return debounced;
}

/**
 * Admin editor for the city list address forms pick from: choose a country and state, then add, rename or delete
 * its cities. Changes apply immediately (no Save Changes): a rename updates every record that uses the city, and a
 * delete first moves those records to another city or clears their city.
 */
export function CityManagerPanel({ canEdit, notify }: { canEdit: boolean; notify: Notify }) {
    const queryClient = useQueryClient();
    const [countryIso2, setCountryIso2] = useState(DEFAULT_COUNTRY_CODE);
    const subdivisions = useMemo(() => getSubdivisionsByCountry(countryIso2), [countryIso2]);
    const [stateCode, setStateCode] = useState('');
    const [search, setSearch] = useState('');
    // The page belongs to one country / state / search: changing any of them starts again at page 1.
    const [pageState, setPageState] = useState({ filter: '', page: 1 });
    const [newCity, setNewCity] = useState('');
    const [adding, setAdding] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<AdminCity | null>(null);
    const debouncedSearch = useDebounced(search.trim());

    const hasStates = subdivisions.length > 0;
    // A country with states lists one state at a time; one without lists the whole country.
    const ready = Boolean(countryIso2) && (!hasStates || Boolean(stateCode));
    const state = subdivisions.find((s) => s.subdivisionCode === stateCode) ?? null;
    const placeName = state?.subdivisionName ?? getCountryByCode(countryIso2)?.countryName ?? '';

    const filter = `${countryIso2}|${stateCode}|${debouncedSearch}`;
    const page = pageState.filter === filter ? pageState.page : 1;
    const setPage = (next: number) => setPageState({ filter, page: next });

    const listKey = ['admin-cities', countryIso2, stateCode, debouncedSearch, page] as const;
    const { data, isFetching, error } = useQuery({
        queryKey: listKey,
        queryFn: ({ signal }) =>
            cityAdminService.list(
                { country: countryIso2, state: stateCode || undefined, search: debouncedSearch || undefined, page, limit: PAGE_SIZE },
                signal
            ),
        enabled: ready,
        placeholderData: keepPreviousData,
    });
    const cities = ready ? (data?.data ?? []) : [];
    const total = ready ? (data?.total ?? 0) : 0;
    const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

    /** The admin list and every form's city dropdown. */
    const refresh = () =>
        Promise.all([
            queryClient.invalidateQueries({ queryKey: ['admin-cities'] }),
            queryClient.invalidateQueries({ queryKey: ['lookups', 'cities'] }),
        ]);

    const addCity = async () => {
        const cityName = newCity.trim().replace(/\s+/g, ' ');
        if (!cityName || !ready) return;
        setAdding(true);
        try {
            const created = await cityAdminService.create({ countryIso2, subdivisionCode: stateCode || null, cityName });
            setNewCity('');
            notify(`${created.cityName} added to ${placeName}.`, 'success');
            await refresh();
        } catch (err) {
            notify(errorMessage(err), 'error');
        } finally {
            setAdding(false);
        }
    };

    const rename = async (city: AdminCity, cityName: string): Promise<boolean> => {
        try {
            const { updatedRecords } = await cityAdminService.rename(city.id, cityName);
            const updated = describeUpdatedRecords(updatedRecords);
            notify(`${city.cityName} renamed to ${cityName}${updated ? `; ${updated} updated` : ''}.`, 'success');
            await refresh();
            return true;
        } catch (err) {
            notify(errorMessage(err), 'error');
            return false;
        }
    };

    return (
        <Box sx={{ ...surfaceSx, overflow: 'hidden' }}>
            <Box sx={{ ...panelHeaderSx, py: 1.75 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                    <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--crm-slate-900)' }}>Address Cities</Typography>
                    <Badge tone="shared">All address forms</Badge>
                </Box>
                <Typography sx={{ fontSize: '0.76rem', color: 'var(--mui-palette-text-secondary)', mt: 0.5 }}>
                    The City dropdown on every address (organizations, leads, quotations, partner companies). Users can only pick a city from
                    this list. Changes here apply immediately.
                </Typography>
            </Box>

            {/* ── Country / state / search ── */}
            <Box
                sx={{
                    p: 2,
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' },
                    gap: 1.25,
                    borderBottom: '1px solid var(--mui-palette-border-light)',
                }}
            >
                <Autocomplete<CountryMasterItem, false, true, false>
                    options={COUNTRY_OPTIONS as CountryMasterItem[]}
                    value={getCountryByCode(countryIso2) ?? (COUNTRY_OPTIONS[0] as CountryMasterItem)}
                    disableClearable
                    onChange={(_, next) => {
                        setCountryIso2(next.iso2Code);
                        setStateCode('');
                        setSearch('');
                    }}
                    getOptionLabel={(c) => c.countryName}
                    isOptionEqualToValue={(a, b) => a.iso2Code === b.iso2Code}
                    filterOptions={(opts, { inputValue }) => (inputValue ? opts.filter((c) => matchesSearch(c.countryName, inputValue)) : opts)}
                    size="small"
                    renderInput={(params) => <TextField {...params} label="Country" sx={inputSx} />}
                />
                <Autocomplete<StateRegionMasterItem, false, false, false>
                    options={subdivisions as StateRegionMasterItem[]}
                    value={state}
                    onChange={(_, next) => {
                        setStateCode(next?.subdivisionCode ?? '');
                        setSearch('');
                    }}
                    disabled={!hasStates}
                    getOptionLabel={(s) => s.subdivisionName}
                    isOptionEqualToValue={(a, b) => a.subdivisionCode === b.subdivisionCode}
                    filterOptions={(opts, { inputValue }) => (inputValue ? opts.filter((s) => matchesSearch(s.subdivisionName, inputValue)) : opts)}
                    size="small"
                    renderInput={(params) => (
                        <TextField {...params} label="State / Region" placeholder={hasStates ? 'Select state' : 'No states'} sx={inputSx} />
                    )}
                />
                <TextField
                    size="small"
                    label="Search cities"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    disabled={!ready}
                    sx={inputSx}
                    slotProps={{
                        input: {
                            startAdornment: (
                                <InputAdornment position="start">
                                    <SearchRoundedIcon sx={{ fontSize: 18, color: 'var(--mui-palette-text-muted)' }} />
                                </InputAdornment>
                            ),
                        },
                    }}
                />
            </Box>

            {!ready ? (
                <EmptyState icon={<LocationCityOutlinedIcon />} title="Select a state" description="Pick a country and a state to see and edit its cities." />
            ) : (
                <>
                    {canEdit && (
                        <Box sx={{ p: 2, borderBottom: '1px solid var(--mui-palette-border-light)', display: 'flex', gap: 1, alignItems: 'center' }}>
                            <TextField
                                size="small"
                                fullWidth
                                placeholder={`Add a city to ${placeName}…`}
                                value={newCity}
                                onChange={(e) => setNewCity(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        void addCity();
                                    }
                                }}
                                disabled={adding}
                                sx={inputSx}
                                slotProps={{ htmlInput: { maxLength: CITY_NAME_MAX, 'aria-label': 'New city' } }}
                            />
                            <Button
                                variant="contained"
                                startIcon={adding ? <CircularProgress size={14} sx={{ color: 'inherit' }} /> : <AddRoundedIcon />}
                                onClick={() => void addCity()}
                                disabled={adding || !newCity.trim()}
                                sx={{ ...primaryButtonSx, flexShrink: 0 }}
                            >
                                Add City
                            </Button>
                        </Box>
                    )}

                    <Box
                        sx={{
                            px: 2,
                            py: 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 1,
                            borderBottom: '1px solid var(--mui-palette-border-light)',
                        }}
                    >
                        <Typography sx={{ fontSize: '0.74rem', color: 'var(--mui-palette-text-secondary)' }}>
                            {total === 0
                                ? 'No cities'
                                : `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${plural(total, 'city', 'cities')}`}
                            {debouncedSearch ? ` matching “${debouncedSearch}”` : ''} in {placeName}
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                            {isFetching && <CircularProgress size={14} sx={{ color: 'var(--mui-palette-text-muted)' }} />}
                            <IconButton size="small" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage(page - 1)} sx={iconButtonSx}>
                                <ChevronLeftRoundedIcon sx={{ fontSize: 18 }} />
                            </IconButton>
                            <IconButton
                                size="small"
                                aria-label="Next page"
                                disabled={page >= pageCount}
                                onClick={() => setPage(page + 1)}
                                sx={iconButtonSx}
                            >
                                <ChevronRightRoundedIcon sx={{ fontSize: 18 }} />
                            </IconButton>
                        </Box>
                    </Box>

                    <Box>
                        {error ? (
                            <EmptyState title="Couldn't load the cities" description={errorMessage(error)} />
                        ) : cities.length === 0 && !isFetching ? (
                            <EmptyState
                                icon={<LocationCityOutlinedIcon />}
                                title={debouncedSearch ? 'No city matches' : 'No cities yet'}
                                description={canEdit ? `Add ${debouncedSearch ? `“${debouncedSearch}”` : 'the first city'} above.` : undefined}
                            />
                        ) : (
                            cities.map((city) => (
                                <CityRow
                                    key={`${city.id}:${city.cityName}`}
                                    city={city}
                                    canEdit={canEdit}
                                    onRename={(name) => rename(city, name)}
                                    onDelete={() => setDeleteTarget(city)}
                                />
                            ))
                        )}
                    </Box>
                </>
            )}

            {deleteTarget && (
                <DeleteCityDialog
                    city={deleteTarget}
                    placeName={placeName}
                    onClose={() => setDeleteTarget(null)}
                    onDeleted={async (message) => {
                        setDeleteTarget(null);
                        notify(message, 'success');
                        await refresh();
                    }}
                    notify={notify}
                />
            )}
        </Box>
    );
}

function CityRow({
    city,
    canEdit,
    onRename,
    onDelete,
}: {
    city: AdminCity;
    canEdit: boolean;
    onRename: (cityName: string) => Promise<boolean>;
    onDelete: () => void;
}) {
    const [editing, setEditing] = useState(false);
    const [name, setName] = useState(city.cityName);
    const [saving, setSaving] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);

    const next = name.trim().replace(/\s+/g, ' ');
    const cancel = () => {
        setName(city.cityName);
        setEditing(false);
    };
    const save = async () => {
        setConfirmOpen(false);
        if (!next || next === city.cityName) return cancel();
        setSaving(true);
        const ok = await onRename(next);
        setSaving(false);
        if (ok) setEditing(false);
    };
    // Renaming a city in use rewrites those records: say so first.
    const submit = () => (city.usageCount > 0 && next && next !== city.cityName ? setConfirmOpen(true) : void save());

    return (
        <Box
            sx={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) auto auto',
                alignItems: 'center',
                gap: 1.25,
                px: 2,
                py: 0.9,
                borderBottom: '1px solid var(--mui-palette-border-light)',
                backgroundColor: 'var(--mui-palette-background-paper)',
                transition: 'background-color 0.12s',
                '&:hover': { backgroundColor: 'var(--mui-palette-background-hover)' },
            }}
        >
            <Box sx={{ minWidth: 0 }}>
                {editing ? (
                    <TextField
                        size="small"
                        fullWidth
                        autoFocus
                        variant="standard"
                        value={name}
                        disabled={saving}
                        onChange={(e) => setName(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') submit();
                            if (e.key === 'Escape') cancel();
                        }}
                        slotProps={{
                            input: { sx: { fontSize: '0.85rem', fontWeight: 600, color: 'var(--mui-palette-text-primary)' } },
                            htmlInput: { maxLength: CITY_NAME_MAX, 'aria-label': `New name for ${city.cityName}` },
                        }}
                    />
                ) : (
                    <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--mui-palette-text-primary)' }} noWrap>
                        {city.cityName}
                    </Typography>
                )}
            </Box>
            <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                {city.usageCount > 0 && (
                    <Badge tone="active" title="Live organizations, leads, quotations and partner companies whose address uses this city">
                        {plural(city.usageCount, 'record')}
                    </Badge>
                )}
                {!city.isSeeded && (
                    <Badge tone="custom" title="Added by an admin">
                        Added
                    </Badge>
                )}
            </Box>
            {canEdit && (
                <Box sx={{ display: 'flex', gap: 0.75 }}>
                    {editing ? (
                        <>
                            <Tooltip title="Save" arrow>
                                <span>
                                    <IconButton size="small" aria-label={`Save ${city.cityName}`} disabled={saving || !next} onClick={submit} sx={iconButtonSx}>
                                        {saving ? <CircularProgress size={14} /> : <CheckRoundedIcon sx={{ fontSize: 17 }} />}
                                    </IconButton>
                                </span>
                            </Tooltip>
                            <Tooltip title="Cancel" arrow>
                                <span>
                                    <IconButton size="small" aria-label="Cancel rename" disabled={saving} onClick={cancel} sx={iconButtonSx}>
                                        <CloseRoundedIcon sx={{ fontSize: 17 }} />
                                    </IconButton>
                                </span>
                            </Tooltip>
                        </>
                    ) : (
                        <>
                            <Tooltip title="Rename" arrow>
                                <IconButton size="small" aria-label={`Rename ${city.cityName}`} onClick={() => setEditing(true)} sx={iconButtonSx}>
                                    <EditOutlinedIcon sx={{ fontSize: 17 }} />
                                </IconButton>
                            </Tooltip>
                            <Tooltip title="Delete" arrow>
                                <IconButton size="small" aria-label={`Delete ${city.cityName}`} onClick={onDelete} sx={dangerIconButtonSx}>
                                    <DeleteOutlineOutlinedIcon sx={{ fontSize: 17 }} />
                                </IconButton>
                            </Tooltip>
                        </>
                    )}
                </Box>
            )}

            {confirmOpen && (
                <Dialog open onClose={() => setConfirmOpen(false)} maxWidth="xs" fullWidth slotProps={{ paper: { sx: { borderRadius: '12px' } } }}>
                    <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', color: 'var(--crm-slate-900)' }}>
                        Rename {city.cityName} to {next}?
                    </DialogTitle>
                    <DialogContent>
                        <Typography sx={{ fontSize: '0.85rem', color: 'var(--mui-palette-text-secondary)' }}>
                            {plural(city.usageCount, 'record')} {city.usageCount === 1 ? 'uses' : 'use'} this city. {city.usageCount === 1 ? 'It' : 'They'} will
                            show the new name too.
                        </Typography>
                    </DialogContent>
                    <DialogActions sx={{ px: 3, pb: 2 }}>
                        <Button onClick={() => setConfirmOpen(false)} variant="outlined" sx={secondaryButtonSx}>
                            Cancel
                        </Button>
                        <Button onClick={() => void save()} variant="contained" sx={primaryButtonSx}>
                            Rename
                        </Button>
                    </DialogActions>
                </Dialog>
            )}
        </Box>
    );
}

/**
 * Confirms a delete. When records use the city, lists them and asks what happens to them: move them to another
 * city of the same state, or clear their city.
 */
function DeleteCityDialog({
    city,
    placeName,
    onClose,
    onDeleted,
    notify,
}: {
    city: AdminCity;
    placeName: string;
    onClose: () => void;
    onDeleted: (message: string) => Promise<void>;
    notify: Notify;
}) {
    const [usage, setUsage] = useState<CityUsage | null>(null);
    const [loadError, setLoadError] = useState('');
    const [action, setAction] = useState<'move' | 'clear'>('move');
    const [target, setTarget] = useState<CitySuggestion | null>(null);
    const [targetSearch, setTargetSearch] = useState('');
    const [deleting, setDeleting] = useState(false);
    const debouncedTargetSearch = useDebounced(targetSearch.trim());

    useEffect(() => {
        let cancelled = false;
        cityAdminService
            .usage(city.id)
            .then((u) => !cancelled && setUsage(u))
            .catch((err) => !cancelled && setLoadError(errorMessage(err)));
        return () => {
            cancelled = true;
        };
    }, [city.id]);

    const inUse = (usage?.total ?? 0) > 0;
    // Other cities of the same state (or country, when it has no states).
    const { data: targets = [], isFetching: targetsLoading } = useQuery({
        queryKey: ['lookups', 'cities', city.countryIso2, city.subdivisionCode ?? '', debouncedTargetSearch, 'move-target'],
        queryFn: ({ signal }) =>
            cityService.search(
                { country: city.countryIso2, state: city.subdivisionCode ?? undefined, search: debouncedTargetSearch || undefined, limit: 50 },
                signal
            ),
        enabled: inUse && action === 'move' && (Boolean(city.subdivisionCode) || debouncedTargetSearch.length >= 2),
    });
    const targetOptions = targets.filter((c) => c.id !== city.id && (!city.subdivisionCode || c.subdivisionCode === city.subdivisionCode));

    const confirm = async () => {
        setDeleting(true);
        try {
            const result = await cityAdminService.remove(
                city.id,
                !inUse ? {} : action === 'move' && target ? { action: 'move', targetCityId: target.id } : { action: 'clear' }
            );
            const updated = describeUpdatedRecords(result.updatedRecords);
            const what = result.action === 'move' && target ? `; ${updated} moved to ${target.cityName}` : result.action === 'clear' ? `; city cleared on ${updated}` : '';
            await onDeleted(`${city.cityName} deleted${updated ? what : ''}.`);
        } catch (err) {
            notify(errorMessage(err), 'error');
            setDeleting(false);
        }
    };

    const canConfirm = Boolean(usage) && !deleting && (!inUse || action === 'clear' || Boolean(target));

    return (
        <Dialog open onClose={deleting ? undefined : onClose} maxWidth="sm" fullWidth slotProps={{ paper: { sx: { borderRadius: '12px' } } }}>
            <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', color: 'var(--crm-slate-900)', borderBottom: '1px solid var(--mui-palette-border-main)' }}>
                Delete {city.cityName}?
            </DialogTitle>
            <DialogContent sx={{ pt: '16px !important', display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {loadError && <Typography sx={{ fontSize: '0.85rem', color: dangerColor }}>{loadError}</Typography>}
                {!usage && !loadError && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <CircularProgress size={16} />
                        <Typography sx={{ fontSize: '0.85rem', color: 'var(--mui-palette-text-secondary)' }}>Checking which records use it…</Typography>
                    </Box>
                )}
                {usage && !inUse && (
                    <Typography sx={{ fontSize: '0.85rem', color: 'var(--mui-palette-text-secondary)' }}>
                        No record uses {city.cityName}. It will no longer be offered in {placeName}&apos;s city dropdown.
                    </Typography>
                )}
                {usage && inUse && (
                    <>
                        <Box
                            sx={{
                                p: 1.5,
                                borderRadius: '8px',
                                backgroundColor: 'var(--mui-palette-background-subtle)',
                                border: '1px solid var(--mui-palette-border-main)',
                            }}
                        >
                            <Typography sx={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--crm-slate-900)', mb: 0.75 }}>
                                {plural(usage.total, 'record')} {usage.total === 1 ? 'uses' : 'use'} {city.cityName}:
                            </Typography>
                            {usage.groups.map((g) => (
                                <Box key={g.owner} sx={{ mb: 0.75 }}>
                                    <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--mui-palette-text-primary)' }}>
                                        {g.count} {g.label}
                                    </Typography>
                                    <Typography sx={{ fontSize: '0.78rem', color: 'var(--mui-palette-text-secondary)' }}>
                                        {g.records.map((r) => (r.code ? `${r.name} (${r.code})` : r.name)).join(' • ')}
                                        {g.count > g.records.length ? ` • and ${g.count - g.records.length} more` : ''}
                                    </Typography>
                                </Box>
                            ))}
                        </Box>

                        <Typography sx={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--crm-slate-900)' }}>What should happen to them?</Typography>
                        <RadioGroup value={action} onChange={(e) => setAction(e.target.value as 'move' | 'clear')}>
                            <FormControlLabel
                                value="move"
                                control={<Radio size="small" />}
                                label={<Typography sx={{ fontSize: '0.84rem' }}>Move them to another city of {placeName}</Typography>}
                            />
                            {action === 'move' && (
                                <Box sx={{ pl: 3.5, pb: 1 }}>
                                    <Autocomplete<CitySuggestion, false, false, false>
                                        options={targetOptions}
                                        value={target}
                                        onChange={(_, next) => setTarget(next)}
                                        inputValue={targetSearch}
                                        onInputChange={(_, next, reason) => reason !== 'reset' && setTargetSearch(next)}
                                        loading={targetsLoading}
                                        filterOptions={(opts) => opts}
                                        getOptionLabel={(c) => c.cityName}
                                        isOptionEqualToValue={(a, b) => a.id === b.id}
                                        noOptionsText={city.subdivisionCode ? 'No matching city' : 'Type 2+ letters to search'}
                                        size="small"
                                        renderInput={(params) => <TextField {...params} placeholder="Select city" sx={inputSx} />}
                                    />
                                </Box>
                            )}
                            <FormControlLabel
                                value="clear"
                                control={<Radio size="small" />}
                                label={<Typography sx={{ fontSize: '0.84rem' }}>Clear the city on them (users pick a new one on their next edit)</Typography>}
                            />
                        </RadioGroup>
                        <Typography sx={{ fontSize: '0.78rem', color: 'var(--mui-palette-text-secondary)' }}>
                            The records themselves are kept; only their city changes.
                        </Typography>
                    </>
                )}
            </DialogContent>
            <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid var(--mui-palette-border-main)' }}>
                <Button onClick={onClose} disabled={deleting} variant="outlined" sx={secondaryButtonSx}>
                    Cancel
                </Button>
                <Button
                    onClick={() => void confirm()}
                    disabled={!canConfirm}
                    variant="contained"
                    sx={{
                        ...primaryButtonSx,
                        background: 'var(--mui-palette-error-main)',
                        '&:hover': { background: 'var(--mui-palette-error-dark)', boxShadow: 'none' },
                    }}
                >
                    {deleting ? 'Deleting…' : inUse ? (action === 'move' ? 'Move Records & Delete' : 'Clear City & Delete') : 'Delete City'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
