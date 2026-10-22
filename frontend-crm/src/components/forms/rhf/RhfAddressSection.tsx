'use client';

import React, { useEffect } from 'react';
import { Box } from '@mui/material';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import { useFormContext, useWatch, type FieldValues, type Path } from 'react-hook-form';

import { SectionLabel } from '../SectionLabel';
import { RhfTextField } from './RhfTextField';
import { RhfSelect } from './RhfSelect';
import { RhfCheckbox } from './RhfCheckbox';
import { INDIAN_STATES, COUNTRIES } from '@/config/constants';

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
    required?: boolean;
    disabled?: boolean;
}

const columnSx = { display: 'flex', flexDirection: 'column', gap: 2 } as const;

export function RhfAddressSection<T extends FieldValues>({
    billingTitle = 'BILLING ADDRESS',
    shippingTitle = 'SHIPPING ADDRESS',
    streetLabel = 'Address',
    shippingStreetLabel = 'Shipping Address',
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
    const copy = Boolean(useWatch({ control, name: copyFieldName }));

    const billingAddressVal = useWatch({ control, name: billingFields.address });
    const billingCityVal = useWatch({ control, name: billingFields.city });
    const billingStateVal = useWatch({ control, name: billingFields.state });
    const billingPostalCodeVal = useWatch({ control, name: billingFields.postalCode });
    const billingCountryVal = useWatch({ control, name: billingFields.country });

    // Sync shipping fields with billing when copy toggle is enabled
    useEffect(() => {
        if (!copy) return;
        const opts = { shouldDirty: true, shouldValidate: true } as const;

        if (getValues(shippingFields.address) !== billingAddressVal) {
            setValue(shippingFields.address, (billingAddressVal || '') as never, opts);
        }
        if (getValues(shippingFields.city) !== billingCityVal) {
            setValue(shippingFields.city, (billingCityVal || '') as never, opts);
        }
        if (getValues(shippingFields.state) !== billingStateVal) {
            setValue(shippingFields.state, (billingStateVal || 'Delhi') as never, opts);
        }
        if (getValues(shippingFields.postalCode) !== billingPostalCodeVal) {
            setValue(shippingFields.postalCode, (billingPostalCodeVal || '') as never, opts);
        }
        if (getValues(shippingFields.country) !== billingCountryVal) {
            setValue(shippingFields.country, (billingCountryVal || 'India') as never, opts);
        }
    }, [
        copy,
        billingAddressVal,
        billingCityVal,
        billingStateVal,
        billingPostalCodeVal,
        billingCountryVal,
        getValues,
        setValue,
        shippingFields,
    ]);

    return (
        <Box
            sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                gap: { xs: 3, md: 4 },
            }}
        >
            {/* ── Left Column: Primary / Billing Address ── */}
            <Box sx={columnSx}>
                <SectionLabel
                    icon={<PlaceOutlinedIcon sx={{ fontSize: 18, color: '#2563eb' }} />}
                    label={billingTitle}
                    sx={{ mb: 1 }}
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
                <RhfTextField<T>
                    name={billingFields.city}
                    label="City"
                    required={required}
                    placeholder="e.g. New Delhi / Gurugram"
                    disabled={disabled}
                />
                <RhfSelect<T>
                    name={billingFields.state}
                    label="State / Region"
                    required={required}
                    options={INDIAN_STATES}
                    placeholder="Select State / Region"
                    disabled={disabled}
                />
                <RhfTextField<T>
                    name={billingFields.postalCode}
                    label="Postal Code (PIN)"
                    required={required}
                    placeholder="e.g. 110020"
                    disabled={disabled}
                />
                <RhfSelect<T>
                    name={billingFields.country}
                    label="Country"
                    required={required}
                    options={COUNTRIES}
                    placeholder="Select Country"
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

                <RhfTextField<T>
                    name={shippingFields.address}
                    label={shippingStreetLabel}
                    hint="Delivery warehouse, facility, or office"
                    multiline
                    minRows={3}
                    maxRows={4}
                    placeholder="Enter shipping address..."
                    disabled={copy ? true : disabled}
                />
                <RhfTextField<T>
                    name={shippingFields.city}
                    label="City"
                    placeholder="Enter delivery city"
                    disabled={copy ? true : disabled}
                />
                <RhfSelect<T>
                    name={shippingFields.state}
                    label="State / Region"
                    options={INDIAN_STATES}
                    placeholder="Select State / Region"
                    disabled={copy ? true : disabled}
                />
                <RhfTextField<T>
                    name={shippingFields.postalCode}
                    label="Postal Code (PIN)"
                    placeholder="Enter delivery PIN code"
                    disabled={copy ? true : disabled}
                />
                <RhfSelect<T>
                    name={shippingFields.country}
                    label="Country"
                    options={COUNTRIES}
                    placeholder="Select Country"
                    disabled={copy ? true : disabled}
                />
            </Box>
        </Box>
    );
}
