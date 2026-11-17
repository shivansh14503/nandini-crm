'use client';

import React from 'react';
import {
    Autocomplete,
    Box,
    FormHelperText,
    TextField,
    Typography,
    type AutocompleteRenderInputParams,
} from '@mui/material';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { cityService, type CitySuggestion } from '@/services/city.service';
import { FormField, fieldSx } from './FormField';
import { FIELD_MAX_LENGTH, type FieldSize } from './fieldSizing';
import { ReadOnlyField } from './ReadOnlyField';
import { useTabSelect } from './useTabSelect';
import { useFormMode } from '@/context/FormModeContext';
import { useConfiguredPlaceholder } from '@/context/FormConfigContext';
import { useUndoSafeSanitizer } from './undoSafeInput';
import {
    COUNTRY_OPTIONS,
    DEFAULT_COUNTRY_CODE,
    findSubdivision,
    getCountryByCode,
    getCountryNameByCode,
    getStateOptionLabelsForCountry,
    getSubdivisionsByCountry,
    matchesSearch,
    resolveCountryIso2,
    type CountryMasterItem,
} from '@/data/addressMaster';

// ── Shared helpers ────────────────────────────────────────────────────────────

/** ISO2 for a stored country value; empty means India (the CRM default), unknown values stay unknown (''). */
export function countryIso2OrDefault(country?: string | null): string {
    return country?.trim() ? resolveCountryIso2(country) : DEFAULT_COUNTRY_CODE;
}

/** True when `state` is filled in but isn't a subdivision of `country` (used to clear it after a country change). */
export function shouldResetStateForCountry(state?: string | null, country?: string | null): boolean {
    const value = (state ?? '').trim();
    if (!value) return false;
    if (getSubdivisionsByCountry(countryIso2OrDefault(country)).length === 0) return true;
    return !findSubdivision(value, countryIso2OrDefault(country));
}

export interface PostalCodeConfig {
    isIndia: boolean;
    label: string;
    placeholder: string;
    maxLength: number;
    inputMode: 'numeric' | 'text';
    /** Strips characters that can't appear in this country's postal codes. */
    sanitize: (value: string) => string;
}

/** Input rules for the postal code field: 6-digit PIN for India, 2–12 alphanumeric for everywhere else. */
export function getPostalCodeConfig(country?: string | null): PostalCodeConfig {
    const isIndia = countryIso2OrDefault(country) === DEFAULT_COUNTRY_CODE;
    return isIndia
        ? {
              isIndia,
              label: 'Postal Code / PIN Code',
              placeholder: 'e.g. 110001',
              maxLength: 6,
              inputMode: 'numeric',
              sanitize: (v) => v.replace(/\D/g, '').slice(0, 6),
          }
        : {
              isIndia,
              label: 'Postal Code / ZIP Code',
              placeholder: 'e.g. 94105 / SW1A 1AA',
              maxLength: 12,
              inputMode: 'text',
              sanitize: (v) => v.replace(/[^A-Za-z0-9\s-]/g, '').toUpperCase().slice(0, 12),
          };
}

interface BaseFieldProps {
    /** Form field key; used for scroll-to-error (`data-field`). */
    name?: string;
    label?: string;
    required?: boolean;
    disabled?: boolean;
    placeholder?: string;
    hint?: React.ReactNode;
    error?: string;
    /** Width token; each field has a compact default (postal code `xs`, the rest `md`). */
    size?: FieldSize;
}

/** Adds the shared place-name limit to an Autocomplete's input while keeping its own props (ref, handlers, aria). */
const withMaxLength = (slotProps: AutocompleteRenderInputParams['slotProps']) => ({
    ...slotProps,
    htmlInput: { ...slotProps.htmlInput, maxLength: FIELD_MAX_LENGTH.shortText },
});

const ErrorText = ({ error }: { error?: string }) =>
    error ? (
        <FormHelperText error sx={{ mx: 1.75 }}>
            {error}
        </FormHelperText>
    ) : null;

// ── Country ───────────────────────────────────────────────────────────────────

export interface CountrySelectFieldProps extends BaseFieldProps {
    /** Stored value: ISO2 code (legacy country names are also understood). */
    value: string;
    /** Always called with the ISO2 code ('' when cleared). */
    onChange: (iso2: string) => void;
}

const filterCountries = (options: CountryMasterItem[], { inputValue }: { inputValue: string }) =>
    inputValue
        ? options.filter(
              (c) =>
                  matchesSearch(c.countryName, inputValue) ||
                  c.iso2Code.toLowerCase() === inputValue.trim().toLowerCase() ||
                  c.iso3Code.toLowerCase() === inputValue.trim().toLowerCase()
          )
        : options;

/** Searchable country dropdown. Stores the ISO 3166-1 alpha-2 code, displays the country name. */
export function CountrySelectField({
    name,
    label = 'Country',
    value,
    onChange,
    required,
    disabled,
    placeholder: codedPlaceholder = 'Select Country',
    hint,
    error,
    size = 'md',
}: CountrySelectFieldProps) {
    const { mode } = useFormMode();
    const tabSelect = useTabSelect();
    const placeholder = useConfiguredPlaceholder(name, codedPlaceholder);
    if (mode === 'view') {
        return <ReadOnlyField label={label} value={getCountryNameByCode(value)} hideWhenEmpty sx={{ mb: 2 }} />;
    }

    const selected = getCountryByCode(value) ?? null;

    return (
        <FormField name={name} label={label} required={required} hint={hint} size={size}>
            <Autocomplete<CountryMasterItem, false, false, false>
                {...tabSelect}
                options={COUNTRY_OPTIONS as CountryMasterItem[]}
                value={selected}
                onChange={(_, option) => onChange(option?.iso2Code ?? '')}
                getOptionLabel={(option) => option.countryName}
                isOptionEqualToValue={(option, v) => option.iso2Code === v.iso2Code}
                filterOptions={filterCountries}
                disabled={disabled}
                size="small"
                renderOption={(props, option) => {
                    const { key, ...rest } = props as React.HTMLAttributes<HTMLLIElement> & { key: string };
                    return (
                        <Box component="li" key={key} {...rest} sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                            <Typography sx={{ fontSize: '0.84rem' }}>{option.countryName}</Typography>
                            <Typography sx={{ fontSize: '0.72rem', color: 'var(--mui-palette-text-muted)', fontFamily: 'monospace' }}>
                                {option.iso2Code}
                            </Typography>
                        </Box>
                    );
                }}
                renderInput={(params) => (
                    <TextField
                        {...params}
                        placeholder={placeholder}
                        error={Boolean(error)}
                        sx={fieldSx}
                        slotProps={withMaxLength(params.slotProps)}
                    />
                )}
            />
            <ErrorText error={error} />
        </FormField>
    );
}

// ── State / Province / Region ─────────────────────────────────────────────────

export interface StateRegionFieldProps extends BaseFieldProps {
    value: string;
    onChange: (value: string) => void;
    /** Country (ISO2 or name) whose subdivisions are offered. */
    countryValue?: string;
}

/**
 * Country-filtered, searchable state / region dropdown. Only the selected country's states can be picked (the
 * server rejects anything else); a country without states has none, so the field stays empty and disabled. A stored
 * value that isn't in the list (older records) still shows, flagged, until the user picks a listed state.
 */
export function StateRegionField({
    name,
    label = 'State / Province / Region',
    value,
    onChange,
    countryValue,
    required,
    disabled,
    placeholder,
    hint,
    error,
    size = 'md',
}: StateRegionFieldProps) {
    const { mode } = useFormMode();
    const tabSelect = useTabSelect();
    const countryIso2 = countryIso2OrDefault(countryValue);
    const options = getStateOptionLabelsForCountry(countryIso2);
    const hasSubdivisions = options.length > 0;
    const resolvedPlaceholder = useConfiguredPlaceholder(
        name,
        placeholder ?? (hasSubdivisions ? 'Search or select state / region' : 'No states for this country')
    );
    if (mode === 'view') {
        return <ReadOnlyField label={label} value={value} hideWhenEmpty sx={{ mb: 2 }} />;
    }

    // The stored value as the list spells it ('haryana' → 'Haryana', 'Orissa' → 'Odisha').
    const listed = findSubdivision(value, countryIso2)?.subdivisionName;
    const stored = (value ?? '').trim();
    const unlisted = Boolean(stored) && !listed;
    const selected = listed ?? (stored || null);
    // MUI needs the value among the options: an unlisted one is shown first, disabled.
    const allOptions = unlisted && selected ? [selected, ...options] : options;

    return (
        <FormField name={name} label={label} required={required} hint={hint} size={size}>
            <Autocomplete<string, false, false, false>
                {...tabSelect}
                options={allOptions}
                value={selected}
                onChange={(_, next) => onChange(next ?? '')}
                getOptionDisabled={(option) => unlisted && option === selected}
                // Diacritic-insensitive search ('karnten' finds 'Kärnten').
                filterOptions={(opts, state) => (state.inputValue ? opts.filter((o) => matchesSearch(o, state.inputValue)) : opts)}
                noOptionsText="No matching state"
                disabled={disabled || !hasSubdivisions}
                size="small"
                renderInput={(params) => (
                    <TextField
                        {...params}
                        placeholder={resolvedPlaceholder}
                        error={Boolean(error) || unlisted}
                        sx={fieldSx}
                        slotProps={withMaxLength(params.slotProps)}
                    />
                )}
            />
            <ErrorText error={error ?? (unlisted ? 'Not in the state list: pick a state' : undefined)} />
        </FormField>
    );
}

// ── City ──────────────────────────────────────────────────────────────────────

const CITY_SEARCH_DEBOUNCE_MS = 250;
/** A state's list is shown whole up to this many (biggest first); typing narrows it. */
const CITY_OPTION_LIMIT = 50;

function useDebouncedValue<V>(value: V, delayMs: number): V {
    const [debounced, setDebounced] = React.useState(value);
    React.useEffect(() => {
        const timer = setTimeout(() => setDebounced(value), delayMs);
        return () => clearTimeout(timer);
    }, [value, delayMs]);
    return debounced;
}

const subdivisionName = (iso2: string, code: string) =>
    code ? (getSubdivisionsByCountry(iso2).find((s) => s.subdivisionCode === code)?.subdivisionName ?? '') : '';

/** The stored city as an option, so the field shows it before (or without) the list loading. */
const storedCity = (cityName: string): CitySuggestion => ({ id: 0, cityName, subdivisionCode: '' });

export interface CityAutocompleteFieldProps extends BaseFieldProps {
    value: string;
    onChange: (value: string) => void;
    /** Country (ISO2 or name) whose cities are offered. */
    countryValue?: string;
    /** Selected state (name or ISO 3166-2 code); narrows the list to its cities. */
    stateValue?: string;
    /** Called with the state's name when the user picks a city while the state is still empty. */
    onStateSuggested?: (stateName: string) => void;
}

/**
 * City dropdown backed by the city master (`/api/lookups/cities`), narrowed by the selected state. Typing only
 * searches: the value is always a city picked from the list (admins maintain the list under Form Customization →
 * Dropdowns → Address Cities), and the server rejects anything else.
 */
export function CityAutocompleteField({
    name,
    label = 'City',
    value,
    onChange,
    countryValue,
    stateValue,
    onStateSuggested,
    required,
    disabled,
    placeholder: codedPlaceholder,
    hint,
    error,
    size = 'md',
}: CityAutocompleteFieldProps) {
    const { mode } = useFormMode();
    const [open, setOpen] = React.useState(false);
    // What's typed in the box, for the stored value it was typed against: when the value changes (a pick, or from
    // outside: copy address, country change, reset) the box shows the new value again.
    const [typedText, setTypedText] = React.useState<{ forValue: string; text: string } | null>(null);
    const inputValue = typedText && typedText.forValue === (value ?? '') ? typedText.text : (value ?? '');
    const tabSelect = useTabSelect({
        onInputChange: (_, next, reason) => {
            // Typing only searches. MUI's 'reset' (a pick, or leaving the field) drops the typed text, so the box
            // shows the stored city again.
            if (reason === 'reset') setTypedText(null);
            else setTypedText({ forValue: value ?? '', text: next });
            if (reason === 'clear') onChange('');
        },
    });

    const countryIso2 = countryIso2OrDefault(countryValue);
    const stateCode = findSubdivision(stateValue, countryIso2)?.subdivisionCode ?? '';

    // A city belongs to its state: switching to another state clears it. Not when the state was empty (picking a
    // city fills the state in) or when city and state changed together (copying another address).
    const previous = React.useRef({ stateCode, value });
    React.useEffect(() => {
        const before = previous.current;
        previous.current = { stateCode, value };
        if (mode !== 'view' && before.stateCode && stateCode !== before.stateCode && value && value === before.value) onChange('');
    }, [stateCode, value, mode, onChange]);
    const typed = inputValue.trim() !== (value ?? '').trim() ? inputValue.trim() : '';
    const search = useDebouncedValue(typed, CITY_SEARCH_DEBOUNCE_MS);
    // Only fetch while the list is open: a state's list needs no search, a country-wide one needs 2+ characters.
    const enabled = mode !== 'view' && open && Boolean(countryIso2) && (Boolean(stateCode) || search.length >= 2);
    const { data: cities = [], isFetching } = useQuery({
        queryKey: ['lookups', 'cities', countryIso2, stateCode, search],
        queryFn: ({ signal }) =>
            cityService.search(
                { country: countryIso2, state: stateCode || undefined, search: search || undefined, limit: CITY_OPTION_LIMIT },
                signal
            ),
        enabled,
        staleTime: 5 * 60 * 1000,
        placeholderData: keepPreviousData,
    });
    // One object per stored value: MUI treats a new value object as a change and would reset the typed search.
    const selected = React.useMemo(() => (value ? storedCity(value) : null), [value]);
    const listed = !selected || cities.some((c) => c.cityName === selected.cityName);
    // MUI needs the value among the options: a stored city missing from the list (an older record) is shown
    // first, disabled, so it can't be picked again.
    let options: CitySuggestion[] = selected ? [selected] : [];
    if (enabled) options = selected && !listed && !search ? [selected, ...cities] : cities;
    const isUnlisted = (option: CitySuggestion) => option.id === 0 && enabled && !isFetching && !listed;
    const placeholder = useConfiguredPlaceholder(name, codedPlaceholder ?? (stateCode ? 'Select city' : 'Search city'));

    if (mode === 'view') {
        return <ReadOnlyField label={label} value={value} hideWhenEmpty sx={{ mb: 2 }} />;
    }

    const where = stateCode ? subdivisionName(countryIso2, stateCode) : getCountryNameByCode(countryIso2);
    let noOptionsText = `No cities listed for ${where} yet. Ask an admin to add them.`;
    if (!countryIso2) noOptionsText = 'Select a country first';
    else if (!stateCode && search.length < 2) noOptionsText = 'Select a state, or type 2+ letters to search';
    else if (search) noOptionsText = `No city "${search}" in ${where}. Ask an admin to add it.`;

    return (
        <FormField name={name} label={label} required={required} hint={hint} size={size}>
            <Autocomplete<CitySuggestion, false, false, false>
                {...tabSelect}
                open={open}
                onOpen={() => setOpen(true)}
                onClose={(event, reason) => {
                    tabSelect.onClose(event, reason);
                    setOpen(false);
                }}
                options={options}
                loading={isFetching}
                value={selected}
                inputValue={inputValue}
                getOptionLabel={(option) => option.cityName}
                getOptionKey={(option) => `${option.id}|${option.cityName}`}
                isOptionEqualToValue={(option, v) => option.cityName === v.cityName}
                getOptionDisabled={isUnlisted}
                onChange={(_, next) => {
                    if (!next) {
                        onChange('');
                        return;
                    }
                    onChange(next.cityName);
                    if (!stateValue?.trim() && onStateSuggested) {
                        const state = subdivisionName(countryIso2, next.subdivisionCode);
                        if (state) onStateSuggested(state);
                    }
                }}
                // The server already filtered and ranked the list.
                filterOptions={(opts) => opts}
                noOptionsText={noOptionsText}
                loadingText="Loading cities…"
                renderOption={(props, option) => {
                    const { key, ...rest } = props as React.HTMLAttributes<HTMLLIElement> & { key: string };
                    // Without a state filter the same name can exist in several states: show which one.
                    const state = isUnlisted(option)
                        ? 'Not in the city list — pick another'
                        : stateCode
                          ? ''
                          : subdivisionName(countryIso2, option.subdivisionCode);
                    return (
                        <Box component="li" key={key} {...rest} sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                            <Typography sx={{ fontSize: '0.84rem' }}>{option.cityName}</Typography>
                            {state && (
                                <Typography sx={{ fontSize: '0.72rem', color: 'var(--mui-palette-text-muted)' }}>{state}</Typography>
                            )}
                        </Box>
                    );
                }}
                disabled={disabled}
                size="small"
                renderInput={(params) => (
                    <TextField
                        {...params}
                        placeholder={placeholder}
                        error={Boolean(error)}
                        sx={fieldSx}
                        slotProps={withMaxLength(params.slotProps)}
                    />
                )}
            />
            <ErrorText error={error} />
        </FormField>
    );
}

// ── Postal code ───────────────────────────────────────────────────────────────

export interface PostalCodeFieldProps extends BaseFieldProps {
    value: string;
    onChange: (value: string) => void;
    countryValue?: string;
}

/** Postal code input whose label, length and allowed characters follow the selected country. */
export function PostalCodeField({
    name,
    label,
    value,
    onChange,
    countryValue,
    required,
    disabled,
    placeholder,
    hint,
    error,
    size = 'xs',
}: PostalCodeFieldProps) {
    const config = getPostalCodeConfig(countryValue);
    const resolvedPlaceholder = useConfiguredPlaceholder(name, placeholder ?? config.placeholder);
    // Filter before insertion (keeps Ctrl+Z working) instead of only rewriting the value afterwards.
    const sanitizerRef = useUndoSafeSanitizer(config.sanitize);
    return (
        <FormField name={name} label={label ?? config.label} required={required} hint={hint} size={size}>
            <TextField
                inputRef={sanitizerRef}
                fullWidth
                size="small"
                value={value ?? ''}
                onChange={(e) => onChange(config.sanitize(e.target.value))}
                placeholder={resolvedPlaceholder}
                disabled={disabled}
                error={Boolean(error)}
                helperText={error}
                slotProps={{ htmlInput: { maxLength: config.maxLength, inputMode: config.inputMode } }}
                sx={fieldSx}
            />
        </FormField>
    );
}
