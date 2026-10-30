'use client';

import React from 'react';
import { Autocomplete, Box, InputAdornment, TextField } from '@mui/material';
import { useController, useFormContext, type FieldValues } from 'react-hook-form';
import { FormField, fieldSx } from '../FormField';
import { resolveFieldSize } from '../fieldSizing';
import type { RhfTextFieldProps } from './RhfTextField';
import {
    DEFAULT_PHONE_COUNTRY_ISO2,
    getPhoneCountry,
    PHONE_COUNTRIES,
    matchesPhoneCountry,
    type PhoneCountry,
} from '@/data/countryPhoneCodes';
import { getPreferredCountry, setPreferredCountry, subscribePreferredCountry } from '@/utils/phoneCountryStore';
import { formatPhoneDisplay, joinPhone, maxNationalDigits, splitPhone } from '@/utils/phone';

export type RhfPhoneFieldProps<T extends FieldValues = FieldValues> = Omit<RhfTextFieldProps<T>, 'numericOnly'> & {
    /** ISO-2 country preselected for empty values and legacy numbers without a country code. Defaults to India. */
    defaultCountry?: string;
    /**
     * When true, picking a country here sets the default country of the form's other phone fields.
     * Defaults to true only for the primary "mobile" field.
     */
    setsFormDefault?: boolean;
};

function CountryFlag({ country }: { country: PhoneCountry }) {
    return (
        // eslint-disable-next-line @next/next/no-img-element -- tiny CDN flag; next/image adds nothing here
        <img
            src={country.flagUrl}
            srcSet={`${country.flagUrl2x} 2x`}
            width={20}
            height={15}
            alt=""
            loading="lazy"
            style={{ objectFit: 'cover', borderRadius: 2, flexShrink: 0 }}
        />
    );
}

/**
 * International phone input: a searchable country picker (name, ISO-2, ISO-3 or dial code) embedded in the
 * start of an MUI TextField, plus a digits-only national number input. The form value is the full E.164
 * string (`+919811234567`, '' when empty). Legacy 10-digit values are shown as India (+91).
 * Selecting a country closes the list and moves focus to the number input.
 */
export function RhfPhoneField<T extends FieldValues>({
    name,
    label,
    required,
    hint,
    fieldSize,
    fieldType = 'phone',
    placeholder = 'e.g. 9811234567',
    disabled,
    sx,
    slotProps,
    defaultCountry = DEFAULT_PHONE_COUNTRY_ISO2,
    setsFormDefault = /(^|\.)mobile$/.test(name),
    onChange: onChangeProp,
    // Accepted for compatibility with RhfTextField call sites; the national length is derived from the country.
    maxLength: _maxLength,
    ...rest
}: RhfPhoneFieldProps<T>) {
    void _maxLength;
    const { field, fieldState } = useController<T>({ name });
    const inputRef = React.useRef<HTMLInputElement | null>(null);
    const [open, setOpen] = React.useState(false);
    const { control } = useFormContext<T>();
    // Country chosen in any other phone field of this form; empty untouched fields default to it.
    const sharedIso2 = React.useSyncExternalStore(
        (notify) => subscribePreferredCountry(control, notify),
        () => getPreferredCountry(control),
        () => undefined,
    );
    const [pickedByUser, setPickedByUser] = React.useState(false);
    const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null);
    const [selected, setSelected] = React.useState<PhoneCountry>(
        () => splitPhone(field.value, getPreferredCountry(control) ?? defaultCountry).country,
    );

    const value: string = typeof field.value === 'string' ? field.value : '';
    // Keep the user's chosen country while it still prefixes the value (+1 vs +1242 are ambiguous to parse).
    const ownsValue = !value || value.startsWith(selected.dialCode);
    const external = ownsValue ? null : splitPhone(value, defaultCountry);
    const country = external?.country ?? selected;
    const national = external
        ? external.national
        : value.slice(selected.dialCode.length).replace(/\D/g, '');

    // Adopt the country of an externally set value (form reset / async load); adjusting state during render is the React-sanctioned pattern.
    if (external && external.country.iso2 !== selected.iso2) setSelected(external.country);

    // Follow the form's preferred country while this field is empty and the user hasn't chosen its own.
    const shared = !value && !pickedByUser && sharedIso2 ? getPhoneCountry(sharedIso2) : undefined;
    if (shared && shared.iso2 !== selected.iso2) setSelected(shared);

    const emit = (next: string) => {
        field.onChange(next);
        onChangeProp?.({ target: { name, value: next } } as unknown as React.ChangeEvent<HTMLInputElement>);
    };

    const handleCountryChange = (_: unknown, next: PhoneCountry | null) => {
        if (!next) return;
        setSelected(next);
        setPickedByUser(true);
        if (setsFormDefault) setPreferredCountry(control, next.iso2);
        setOpen(false);
        emit(joinPhone(next, national.slice(0, maxNationalDigits(next))));
        // Wait for the popup to unmount and Autocomplete to settle before moving focus.
        setTimeout(() => inputRef.current?.focus(), 0);
    };

    const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value;
        if (raw.trim().startsWith('+')) {
            // Pasted a full international number: pick the country from it.
            const parsed = splitPhone(raw, country.iso2);
            setSelected(parsed.country);
            emit(joinPhone(parsed.country, parsed.national.slice(0, maxNationalDigits(parsed.country))));
            return;
        }
        emit(joinPhone(country, raw.replace(/\D/g, '').slice(0, maxNationalDigits(country))));
    };

    const resolvedSize = resolveFieldSize(name, fieldType, fieldSize);
    const htmlInput = (slotProps?.htmlInput as Record<string, unknown> | undefined) ?? {};

    return (
        <FormField
            name={name}
            label={label}
            required={required}
            hint={hint}
            size={resolvedSize}
            viewValue={formatPhoneDisplay(value) || undefined}
        >
            <TextField
                {...rest}
                ref={setAnchorEl}
                inputRef={(el: HTMLInputElement | null) => {
                    inputRef.current = el;
                    field.ref(el);
                }}
                name={name}
                value={national}
                onChange={handleNumberChange}
                onBlur={field.onBlur}
                disabled={disabled}
                placeholder={placeholder}
                fullWidth
                size="small"
                error={Boolean(fieldState.error)}
                helperText={fieldState.error?.message}
                sx={{ ...fieldSx, ...sx }}
                slotProps={{
                    ...slotProps,
                    htmlInput: {
                        ...htmlInput,
                        type: 'tel',
                        inputMode: 'tel',
                        autoComplete: 'tel-national',
                        'data-phone-national': '',
                        maxLength: maxNationalDigits(country),
                    },
                    input: {
                        ...(slotProps?.input as object | undefined),
                        sx: { pl: 1 },
                        startAdornment: (
                            <InputAdornment position="start" sx={{ mr: 0.5, ml: 0 }}>
                                <Autocomplete<PhoneCountry, false, true, false>
                                    options={PHONE_COUNTRIES as PhoneCountry[]}
                                    value={country}
                                    disableClearable
                                    autoHighlight
                                    selectOnFocus
                                    openOnFocus
                                    disabled={disabled}
                                    open={open}
                                    onOpen={() => setOpen(true)}
                                    onClose={() => setOpen(false)}
                                    onChange={handleCountryChange}
                                    isOptionEqualToValue={(a, b) => a.iso2 === b.iso2}
                                    getOptionLabel={(c) => `${c.iso3} ${c.dialCode}`}
                                    getOptionKey={(c) => c.iso2}
                                    filterOptions={(options, state) =>
                                        // Selected value's label ("IND") is not a query: show everything until the user types.
                                        state.inputValue === `${country.iso3} ${country.dialCode}`
                                            ? options
                                            : options.filter((c) => matchesPhoneCountry(c, state.inputValue))
                                    }
                                    sx={{ width: 82, flexShrink: 0 }}
                                    slotProps={{
                                        popper: {
                                            anchorEl,
                                            placement: 'bottom-start',
                                            modifiers: [{ name: 'offset', options: { offset: [0, 6] } }],
                                            sx: { width: '340px !important', zIndex: 1500 },
                                        },
                                        paper: { sx: { fontSize: '0.85rem' } },
                                    }}
                                    renderOption={(props, c) => {
                                        const { key, ...optionProps } = props as React.HTMLAttributes<HTMLLIElement> & {
                                            key: string;
                                        };
                                        return (
                                            <Box
                                                component="li"
                                                key={key}
                                                {...optionProps}
                                                sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                                            >
                                                <CountryFlag country={c} />
                                                <Box component="span" sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {c.name}
                                                </Box>
                                                <Box component="span" sx={{ fontWeight: 600, width: 34, flexShrink: 0 }}>
                                                    {c.iso3}
                                                </Box>
                                                <Box component="span" sx={{ color: 'text.secondary', minWidth: 42, textAlign: 'right', flexShrink: 0 }}>
                                                    {c.dialCode}
                                                </Box>
                                            </Box>
                                        );
                                    }}
                                    renderInput={(params) => (
                                        <TextField
                                            {...params}
                                            variant="standard"
                                            size="small"
                                            placeholder="Code"
                                            aria-label={`${label} country code`}
                                            slotProps={{
                                                ...params.slotProps,
                                                input: {
                                                    ...params.slotProps.input,
                                                    disableUnderline: true,
                                                    sx: { fontSize: '0.85rem', fontWeight: 500, pl: '0 !important', pr: '16px !important', '& input': { p: '0 !important', minWidth: 0 }, '& .MuiAutocomplete-endAdornment': { right: 0 } },
                                                },
                                            }}
                                        />
                                    )}
                                />
                                <Box
                                    aria-hidden
                                    sx={{ width: '1px', height: 20, bgcolor: 'divider', ml: 0, flexShrink: 0 }}
                                />
                            </InputAdornment>
                        ),
                    },
                }}
            />
        </FormField>
    );
}

