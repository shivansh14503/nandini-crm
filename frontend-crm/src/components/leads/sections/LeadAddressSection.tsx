'use client';

import React from 'react';
import { Box } from '@mui/material';

import { RhfAddressSection } from '@/components/forms';
import type { LeadFormData } from '@/types/lead.types';

/** Address tab of the Lead form. Must be rendered inside a `FormProvider<LeadFormData>`. */
export function LeadAddressSection() {
    return (
        <Box sx={{ p: { xs: 2.5, md: 3.5 } }}>
            <RhfAddressSection<LeadFormData>
                billingTitle="PRIMARY ADDRESS"
                shippingTitle="OTHER ADDRESS"
                streetLabel="Street"
                shippingStreetLabel="Street"
                copyFieldName="copyAddressFromLeft"
                required={false}
                billingFields={{
                    address: 'primaryAddress',
                    city: 'primaryCity',
                    state: 'primaryState',
                    postalCode: 'primaryPostalCode',
                    country: 'primaryCountry',
                }}
                shippingFields={{
                    address: 'otherAddress',
                    city: 'otherCity',
                    state: 'otherState',
                    postalCode: 'otherPostalCode',
                    country: 'otherCountry',
                }}
            />
        </Box>
    );
}
