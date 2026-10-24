'use client';

import React from 'react';
import { Autocomplete, Box, FormHelperText, TextField, Typography } from '@mui/material';
import { FormField, fieldSx } from './FormField';
import { ReadOnlyField } from './ReadOnlyField';
import { useFormMode } from '@/context/FormModeContext';
import {
    COUNTRY_OPTIONS,
    DEFAULT_COUNTRY_CODE,
    STATE_NOT_LISTED,
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
}

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
    placeholder = 'Select Country',
    hint,
    error,
}: CountrySelectFieldProps) {
    const { mode } = useFormMode();
    if (mode === 'view') {
        return <ReadOnlyField label={label} value={getCountryNameByCode(value)} hideWhenEmpty sx={{ mb: 2 }} />;
    }

    const selected = getCountryByCode(value) ?? null;

    return (
        <FormField name={name} label={label} required={required} hint={hint}>
            <Autocomplete<CountryMasterItem, false, false, false>
                options={COUNTRY_OPTIONS as CountryMasterItem[]}
                value={selected}
                onChange={(_, option) => onChange(option?.iso2Code ?? '')}
                getOptionLabel={(option) => option.countryName}
                isOptionEqualToValue={(option, v) => option.iso2Code === v.iso2Code}
                filterOptions={filterCountries}
                disabled={disabled}
                autoHighlight
                size="small"
                renderOption={(props, option) => {
                    const { key, ...rest } = props as React.HTMLAttributes<HTMLLIElement> & { key: string };
                    return (
                        <Box component="li" key={key} {...rest} sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                            <Typography sx={{ fontSize: '0.84rem' }}>{option.countryName}</Typography>
                            <Typography sx={{ fontSize: '0.72rem', color: '#94a3b8', fontFamily: 'monospace' }}>
                                {option.iso2Code}
                            </Typography>
                        </Box>
                    );
                }}
                renderInput={(params) => (
                    <TextField {...params} placeholder={placeholder} error={Boolean(error)} sx={fieldSx} />
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
 * Country-filtered, searchable state/region field. Accepts free text for regions missing from ISO 3166-2;
 * picking 'Not listed' clears the field so the user can type the region manually.
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
}: StateRegionFieldProps) {
    const { mode } = useFormMode();
    const [manualEntry, setManualEntry] = React.useState(false);
    if (mode === 'view') {
        return <ReadOnlyField label={label} value={value} hideWhenEmpty sx={{ mb: 2 }} />;
    }

    const options = getStateOptionLabelsForCountry(countryIso2OrDefault(countryValue));
    const hasSubdivisions = options.length > 1;
    const resolvedPlaceholder =
        placeholder ??
        (manualEntry || !hasSubdivisions ? 'Type state / province / region' : 'Search or select state / region');

    return (
        <FormField name={name} label={label} required={required} hint={hint}>
            <Autocomplete<string, false, false, true>
                freeSolo
                options={options}
                value={value || null}
                inputValue={value ?? ''}
                onChange={(_, next) => {
                    if (next === STATE_NOT_LISTED) {
                        setManualEntry(true);
                        onChange('');
                        return;
                    }
                    onChange(next ?? '');
                }}
                onInputChange={(_, next, reason) => {
                    if (reason === 'input' || reason === 'clear') onChange(next);
                }}
                // Diacritic-insensitive search ('haryana' finds 'Haryāna'); 'Not listed' always stays available.
                filterOptions={(opts, state) =>
                    state.inputValue
                        ? [...opts.filter((o) => o !== STATE_NOT_LISTED && matchesSearch(o, state.inputValue)), STATE_NOT_LISTED]
                        : opts
                }
                disabled={disabled}
                size="small"
                renderInput={(params) => (
                    <TextField {...params} placeholder={resolvedPlaceholder} error={Boolean(error)} sx={fieldSx} />
                )}
            />
            <ErrorText error={error} />
        </FormField>
    );
}

// ── City ──────────────────────────────────────────────────────────────────────

// Suggestions only (Address_Field_Design: "Allow manual entry; do not require a global city master").
const CITY_SUGGESTIONS: Record<string, string[]> = {
    IN: [
        'Ahmedabad', 'Bengaluru', 'Bhopal', 'Bhubaneswar', 'Chandigarh', 'Chennai', 'Coimbatore', 'Dehradun',
        'Faridabad', 'Ghaziabad', 'Gurugram', 'Guwahati', 'Hyderabad', 'Indore', 'Jaipur', 'Kanpur', 'Kochi',
        'Kolkata', 'Lucknow', 'Ludhiana', 'Mumbai', 'Mysuru', 'Nagpur', 'Nashik', 'New Delhi', 'Noida', 'Patna',
        'Pune', 'Raipur', 'Rajkot', 'Ranchi', 'Surat', 'Thiruvananthapuram', 'Vadodara', 'Varanasi',
        'Visakhapatnam',
    ],
};

export interface CityAutocompleteFieldProps extends BaseFieldProps {
    value: string;
    onChange: (value: string) => void;
    /** Used only to pick suggestions; any city can be typed. */
    countryValue?: string;
}

/** Free-text city input with optional suggestions for the selected country. */
export function CityAutocompleteField({
    name,
    label = 'City',
    value,
    onChange,
    countryValue,
    required,
    disabled,
    placeholder = 'Enter city',
    hint,
    error,
}: CityAutocompleteFieldProps) {
    const { mode } = useFormMode();
    if (mode === 'view') {
        return <ReadOnlyField label={label} value={value} hideWhenEmpty sx={{ mb: 2 }} />;
    }

    const suggestions = CITY_SUGGESTIONS[countryIso2OrDefault(countryValue)] ?? [];

    return (
        <FormField name={name} label={label} required={required} hint={hint}>
            <Autocomplete<string, false, false, true>
                freeSolo
                options={suggestions}
                value={value || null}
                inputValue={value ?? ''}
                onChange={(_, next) => onChange(next ?? '')}
                onInputChange={(_, next, reason) => {
                    if (reason === 'input' || reason === 'clear') onChange(next);
                }}
                filterOptions={(opts, state) =>
                    state.inputValue ? opts.filter((o) => matchesSearch(o, state.inputValue)) : opts
                }
                disabled={disabled}
                size="small"
                renderInput={(params) => (
                    <TextField {...params} placeholder={placeholder} error={Boolean(error)} sx={fieldSx} />
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
}: PostalCodeFieldProps) {
    const config = getPostalCodeConfig(countryValue);
    return (
        <FormField name={name} label={label ?? config.label} required={required} hint={hint}>
            <TextField
                fullWidth
                size="small"
                value={value ?? ''}
                onChange={(e) => onChange(config.sanitize(e.target.value))}
                placeholder={placeholder ?? config.placeholder}
                disabled={disabled}
                error={Boolean(error)}
                helperText={error}
                slotProps={{ htmlInput: { maxLength: config.maxLength, inputMode: config.inputMode } }}
                sx={fieldSx}
            />
        </FormField>
    );
}
