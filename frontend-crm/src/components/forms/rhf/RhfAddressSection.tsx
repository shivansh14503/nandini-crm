'use client';

import React, { useEffect } from 'react';
import { Box } from '@mui/material';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import { useFormContext, useWatch, type FieldValues, type Path } from 'react-hook-form';

import { SectionLabel } from '../SectionLabel';
import { ReadOnlyField } from '../ReadOnlyField';
import { formatAddressLine } from '@/utils/address';
import { countryIso2OrDefault } from '../AddressPrimitives';
import { RhfTextField } from './RhfTextField';
import { RhfPinCodeField } from './RhfPinCodeField';
import { RhfCheckbox } from './RhfCheckbox';
import { RhfCityField, RhfCountrySelect, RhfStateRegionField } from './RhfAddressFields';
import { DEFAULT_COUNTRY_CODE, getSubdivisionsByCountry } from '@/data/addressMaster';
import { useFormMode } from '@/context/FormModeContext';

export interface AddressFieldNames<T extends FieldValues> {
    address: Path<T>;
    city: Path<T>;
    state: Path<T>;
    postalCode: Path<T>;
    country: Path<T>;
}

export interface RhfAddressSectionProps<T extends FieldValues> {
    billingTitle?: string;
    shippingTitle?: string;
    streetLabel?: string;
    shippingStreetLabel?: string;
    billingFields?: AddressFieldNames<T>;
    shippingFields?: AddressFieldNames<T>;
    copyFieldName?: Path<T>;
    copyLabel?: string;
    /** Makes the left (billing / primary) column's fields required. */
    required?: boolean;
    disabled?: boolean;
}

const columnSx = { display: 'flex', flexDirection: 'column', gap: 2 } as const;

/** Copy-able field keys mirrored from billing to shipping. */
const MIRRORED_KEYS = ['address', 'country', 'state', 'city', 'postalCode'] as const;

/**
 * Universal two-column address section (billing/primary on the left, shipping/other on the right) built on the
 * ISO 3166 address master: country dropdown storing ISO2, country-filtered state/region, free-text city and a
 * country-aware postal code. The optional copy checkbox mirrors the left column into the right one.
 */
export function RhfAddressSection<T extends FieldValues>({
    billingTitle = 'BILLING ADDRESS',
    shippingTitle = 'SHIPPING ADDRESS',
    streetLabel = 'Street',
    shippingStreetLabel = 'Street',
    billingFields = {
        address: 'billingAddress' as Path<T>,
        city: 'billingCity' as Path<T>,
        state: 'billingState' as Path<T>,
        postalCode: 'billingPostalCode' as Path<T>,
        country: 'billingCountry' as Path<T>,
    },
    shippingFields = {
        address: 'shippingAddress' as Path<T>,
        city: 'shippingCity' as Path<T>,
        state: 'shippingState' as Path<T>,
        postalCode: 'shippingPostalCode' as Path<T>,
        country: 'shippingCountry' as Path<T>,
    },
    copyFieldName = 'copyAddressFromBilling' as Path<T>,
    copyLabel = 'Copy address from left',
    required = true,
    disabled = false,
}: RhfAddressSectionProps<T>) {
    const { control, getValues, setValue } = useFormContext<T>();
    const { mode } = useFormMode();
    const copy = Boolean(useWatch({ control, name: copyFieldName }));

    const billingAddressVal = useWatch({ control, name: billingFields.address });
    const billingCityVal = useWatch({ control, name: billingFields.city });
    const billingStateVal = useWatch({ control, name: billingFields.state });
    const billingPostalCodeVal = useWatch({ control, name: billingFields.postalCode });
    const billingCountryVal = useWatch({ control, name: billingFields.country });

    // Mirror the left column into the right one while "copy" is checked (exact values; country defaults to India).
    useEffect(() => {
        if (!copy || mode === 'view') return;
        const opts = { shouldDirty: true, shouldValidate: true } as const;
        const source: Record<(typeof MIRRORED_KEYS)[number], unknown> = {
            address: billingAddressVal ?? '',
            country: billingCountryVal || DEFAULT_COUNTRY_CODE,
            state: billingStateVal ?? '',
            city: billingCityVal ?? '',
            postalCode: billingPostalCodeVal ?? '',
        };
        for (const key of MIRRORED_KEYS) {
            if (getValues(shippingFields[key]) !== source[key]) {
                setValue(shippingFields[key], source[key] as never, opts);
            }
        }
    }, [
        copy,
        mode,
        billingAddressVal,
        billingCityVal,
        billingStateVal,
        billingPostalCodeVal,
        billingCountryVal,
        getValues,
        setValue,
        shippingFields,
    ]);

    const [sStreet, sCity, sState, sPostal, sCountry] = useWatch({
        control,
        name: [shippingFields.address, shippingFields.city, shippingFields.state, shippingFields.postalCode, shippingFields.country],
    });

    const billingHasStates = getSubdivisionsByCountry(countryIso2OrDefault(billingCountryVal as string)).length > 0;
    const shippingLocked = copy || disabled;

    if (mode === 'view') {
        const billingLine = formatAddressLine({
            street: billingAddressVal as string,
            city: billingCityVal as string,
            state: billingStateVal as string,
            postalCode: billingPostalCodeVal as string,
            country: billingCountryVal as string,
        });
        const shippingLine = formatAddressLine({
            street: sStreet as string,
            city: sCity as string,
            state: sState as string,
            postalCode: sPostal as string,
            country: sCountry as string,
        });
        return (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: { xs: 3, md: 4 } }}>
                {billingLine && (
                    <Box sx={columnSx}>
                        <SectionLabel icon={<PlaceOutlinedIcon sx={{ fontSize: 18, color: '#2563eb' }} />} label={billingTitle} sx={{ mb: 1 }} />
                        <ReadOnlyField label="Address" value={billingLine} copyable />
                    </Box>
                )}
                {shippingLine && (
                    <Box sx={columnSx}>
                        <SectionLabel icon={<LocalShippingOutlinedIcon sx={{ fontSize: 18, color: '#64748b' }} />} label={shippingTitle} sx={{ mb: 1 }} />
                        <ReadOnlyField label="Address" value={shippingLine} copyable />
                    </Box>
                )}
            </Box>
        );
    }

    return (
        <Box
            sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                gap: { xs: 3, md: 4 },
            }}
        >
            {/* ── Left Column: Billing / Primary Address ── */}
            <Box sx={columnSx}>
                <SectionLabel
                    icon={<PlaceOutlinedIcon sx={{ fontSize: 18, color: '#2563eb' }} />}
                    label={billingTitle}
                    sx={{ mb: 1 }}
                />
                <RhfCountrySelect<T> name={billingFields.country} required={required} disabled={disabled} />
                <RhfStateRegionField<T>
                    name={billingFields.state}
                    countryFieldName={billingFields.country}
                    required={required && billingHasStates}
                    disabled={disabled}
                />
                <RhfCityField<T>
                    name={billingFields.city}
                    countryFieldName={billingFields.country}
                    required={required}
                    disabled={disabled}
                />
                <RhfTextField<T>
                    name={billingFields.address}
                    label={streetLabel}
                    required={required}
                    hint="Street address, building, premises"
                    multiline
                    minRows={3}
                    maxRows={4}
                    placeholder="Enter street and building address..."
                    disabled={disabled}
                />
                <RhfPinCodeField<T>
                    name={billingFields.postalCode}
                    countryFieldName={billingFields.country}
                    required={required}
                    disabled={disabled}
                />
            </Box>

            {/* ── Right Column: Shipping / Other Address ── */}
            <Box sx={columnSx}>
                <Box
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: 1,
                        mb: 1,
                    }}
                >
                    <SectionLabel
                        icon={<LocalShippingOutlinedIcon sx={{ fontSize: 18, color: '#64748b' }} />}
                        label={shippingTitle}
                    />
                    <RhfCheckbox<T> name={copyFieldName} label={copyLabel} />
                </Box>

                <RhfCountrySelect<T> name={shippingFields.country} disabled={shippingLocked} />
                <RhfStateRegionField<T>
                    name={shippingFields.state}
                    countryFieldName={shippingFields.country}
                    disabled={shippingLocked}
                />
                <RhfCityField<T>
                    name={shippingFields.city}
                    countryFieldName={shippingFields.country}
                    disabled={shippingLocked}
                />
                <RhfTextField<T>
                    name={shippingFields.address}
                    label={shippingStreetLabel}
                    hint="Delivery warehouse, facility, or office"
                    multiline
                    minRows={3}
                    maxRows={4}
                    placeholder="Enter street and building address..."
                    disabled={shippingLocked}
                />
                <RhfPinCodeField<T>
                    name={shippingFields.postalCode}
                    countryFieldName={shippingFields.country}
                    disabled={shippingLocked}
                />
            </Box>
        </Box>
    );
}
