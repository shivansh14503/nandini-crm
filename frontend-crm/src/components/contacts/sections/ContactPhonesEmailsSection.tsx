'use client';

import React from 'react';
import { FormGrid, RhfPhoneField, RhfEmailList } from '@/components/forms';
import type { ContactFormData } from '@/types/contact.types';

/**
 * Alternate phone numbers (one row) and email addresses (below).
 * Must be rendered inside a `FormProvider<ContactFormData>`.
 */
export function ContactPhonesEmailsSection() {
    return (
        <FormGrid columns={3}>
            <RhfPhoneField<ContactFormData> name="phone3" label="Phone 3" placeholder="Alternate direct number" />
            <RhfPhoneField<ContactFormData> name="phone4" label="Phone 4" placeholder="Office extension / desk" />
            <RhfPhoneField<ContactFormData> name="phone5" label="Phone 5" placeholder="Additional mobile" />

            {/* Required by default; the form builder can relax it. */}
            <RhfEmailList name="emailAddresses" />
        </FormGrid>
    );
}
