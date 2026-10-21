'use client';

import React from 'react';
import { Box } from '@mui/material';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import { useFormContext, useWatch } from 'react-hook-form';

import {
    SectionLabel,
    RhfTextField,
    RhfSelect,
    RhfCheckbox,
} from '@/components/forms';
import { INDIAN_STATES, COUNTRIES } from '@/config/constants';
import type { LeadFormData } from '@/types/lead.types';

const columnSx = { display: 'flex', flexDirection: 'column', gap: 2 } as const;

const PRIMARY_TO_OTHER = [
    ['primaryAddress', 'otherAddress'],
    ['primaryCity', 'otherCity'],
    ['primaryState', 'otherState'],
    ['primaryPostalCode', 'otherPostalCode'],
    ['primaryCountry', 'otherCountry'],
] as const;

/** Address tab of the Lead form. Must be rendered inside a `FormProvider<LeadFormData>`. */
export function LeadAddressSection() {
    const { control, getValues, setValue } = useFormContext<LeadFormData>();
    const copy = Boolean(useWatch({ control, name: 'copyAddressFromLeft' }));
    const primaryValues = useWatch({
        control,
        name: PRIMARY_TO_OTHER.map(([primary]) => primary),
    });

    // Keep "other address" mirrored while the copy toggle is on.
    React.useEffect(() => {
        if (!copy) return;
        PRIMARY_TO_OTHER.forEach(([primary, other], i) => {
            const next = (primaryValues[i] as string) || (primary === 'primaryCountry' ? 'India' : '');
            if (getValues(other) !== next) setValue(other, next, { shouldDirty: true });
        });
    }, [copy, primaryValues, getValues, setValue]);

    return (
        <Box sx={{ p: { xs: 2.5, md: 3.5 } }}>
            <Box
                sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                    gap: { xs: 3, md: 4 },
                }}
            >
                <Box sx={columnSx}>
                    <SectionLabel icon={<PlaceOutlinedIcon sx={{ fontSize: 18, color: '#2563eb' }} />} label="PRIMARY ADDRESS" sx={{ mb: 1 }} />
                    <RhfTextField<LeadFormData> name="primaryAddress" label="Address" hint="Registered or primary premises" multiline minRows={3} maxRows={4} placeholder="Enter a location" />
                    <RhfTextField<LeadFormData> name="primaryCity" label="City" placeholder="e.g. Gurugram / New Delhi" />
                    <RhfSelect<LeadFormData> name="primaryState" label="State/Region" options={INDIAN_STATES} placeholder="Select State / Region" />
                    <RhfTextField<LeadFormData> name="primaryPostalCode" label="Postal Code" placeholder="e.g. 110001" />
                    <RhfSelect<LeadFormData> name="primaryCountry" label="Country" options={COUNTRIES} placeholder="Select Country" />
                    <RhfTextField<LeadFormData> name="primaryLatitude" label="Latitude" hint="GPS coordinate" placeholder="0.00000000" />
                </Box>

                <Box sx={columnSx}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, mb: 1 }}>
                        <SectionLabel icon={<BusinessOutlinedIcon sx={{ fontSize: 18, color: '#64748b' }} />} label="OTHER ADDRESS" />
                        <RhfCheckbox<LeadFormData> name="copyAddressFromLeft" label="Copy address from left" />
                    </Box>
                    <RhfTextField<LeadFormData> name="otherAddress" label="Other Address" hint="Branch, factory, or dispatch location" multiline minRows={3} maxRows={4} placeholder="Enter branch or factory location" disabled={copy} />
                    <RhfTextField<LeadFormData> name="otherCity" label="City" placeholder="Enter city" disabled={copy} />
                    <RhfSelect<LeadFormData> name="otherState" label="State/Region" options={INDIAN_STATES} placeholder="Select State / Region" />
                    <RhfTextField<LeadFormData> name="otherPostalCode" label="Postal Code" placeholder="Enter PIN code" disabled={copy} />
                    <RhfSelect<LeadFormData> name="otherCountry" label="Country" options={COUNTRIES} placeholder="Select Country" />
                    <RhfTextField<LeadFormData> name="otherLongitude" label="Longitude" hint="GPS coordinate" placeholder="0.00000000" />
                </Box>
            </Box>
        </Box>
    );
}
