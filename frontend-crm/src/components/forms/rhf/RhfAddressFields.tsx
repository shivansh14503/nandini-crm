'use client';

import React, { useEffect, useRef } from 'react';
import { useController, useFormContext, useWatch, type FieldPath, type FieldValues, type Path } from 'react-hook-form';
import {
    CityAutocompleteField,
    CountrySelectField,
    StateRegionField,
    countryIso2OrDefault,
    shouldResetStateForCountry,
} from '../AddressPrimitives';
import { useFormMode } from '@/context/FormModeContext';
import { resolveCountryIso2 } from '@/data/addressMaster';

interface RhfAddressFieldBaseProps<T extends FieldValues> {
    name: FieldPath<T>;
    label?: string;
    required?: boolean;
    disabled?: boolean;
    placeholder?: string;
    hint?: React.ReactNode;
}

/** Watches an optional country field; returns undefined when no field name is given. */
function useWatchedCountry<T extends FieldValues>(countryFieldName?: Path<T>, fallbackName?: Path<T>): string | undefined {
    const { control } = useFormContext<T>();
    // useWatch must always be called; watch the fallback (own) field when no country field is configured.
    const watched = useWatch({ control, name: (countryFieldName ?? fallbackName) as Path<T> });
    return countryFieldName ? ((watched as string | undefined) ?? '') : undefined;
}

// ── Country ───────────────────────────────────────────────────────────────────

export type RhfCountrySelectProps<T extends FieldValues> = RhfAddressFieldBaseProps<T>;

/** RHF country dropdown storing ISO2 codes; legacy names already in the form ('India') are converted to 'IN'. */
export function RhfCountrySelect<T extends FieldValues>({ name, ...props }: RhfCountrySelectProps<T>) {
    const { field, fieldState } = useController<T>({ name });
    const { setValue } = useFormContext<T>();
    const raw = typeof field.value === 'string' ? field.value : '';

    useEffect(() => {
        const iso2 = resolveCountryIso2(raw);
        if (iso2 && iso2 !== raw) setValue(name, iso2 as never, { shouldDirty: false });
    }, [raw, name, setValue]);

    return (
        <CountrySelectField
            {...props}
            name={name}
            value={raw}
            onChange={(iso2) => field.onChange(iso2)}
            error={fieldState.error?.message}
        />
    );
}

// ── State / Region ────────────────────────────────────────────────────────────

export interface RhfStateRegionFieldProps<T extends FieldValues> extends RhfAddressFieldBaseProps<T> {
    /** Country field this state belongs to; options are filtered by it. */
    countryFieldName?: Path<T>;
    /** Fixed country when there is no country field. */
    countryCode?: string;
}

/** RHF state/region field filtered by the watched country; cleared when the country changes to one it doesn't belong to. */
export function RhfStateRegionField<T extends FieldValues>({
    name,
    countryFieldName,
    countryCode,
    ...props
}: RhfStateRegionFieldProps<T>) {
    const { field, fieldState } = useController<T>({ name });
    const { setValue, getValues } = useFormContext<T>();
    const { mode } = useFormMode();
    const watchedCountry = useWatchedCountry<T>(countryFieldName, name);
    const country = watchedCountry ?? countryCode ?? '';
    const countryIso2 = countryIso2OrDefault(country);

    // Reset only on an actual country change (not on mount / record load, where state and country arrive together).
    const previousCountry = useRef(countryIso2);
    useEffect(() => {
        if (previousCountry.current === countryIso2) return;
        previousCountry.current = countryIso2;
        if (mode === 'view') return;
        const state = getValues(name) as string | undefined;
        if (shouldResetStateForCountry(state, countryIso2)) {
            setValue(name, '' as never, { shouldDirty: true, shouldValidate: false });
        }
    }, [countryIso2, mode, name, getValues, setValue]);

    return (
        <StateRegionField
            {...props}
            name={name}
            value={typeof field.value === 'string' ? field.value : ''}
            onChange={(v) => field.onChange(v)}
            countryValue={country}
            error={fieldState.error?.message}
        />
    );
}

// ── City ──────────────────────────────────────────────────────────────────────

export interface RhfCityFieldProps<T extends FieldValues> extends RhfAddressFieldBaseProps<T> {
    /** Country field used to offer city suggestions (manual entry is always allowed). */
    countryFieldName?: Path<T>;
}

export function RhfCityField<T extends FieldValues>({ name, countryFieldName, ...props }: RhfCityFieldProps<T>) {
    const { field, fieldState } = useController<T>({ name });
    const country = useWatchedCountry<T>(countryFieldName, name);

    return (
        <CityAutocompleteField
            {...props}
            name={name}
            value={typeof field.value === 'string' ? field.value : ''}
            onChange={(v) => field.onChange(v)}
            countryValue={country}
            error={fieldState.error?.message}
        />
    );
}
