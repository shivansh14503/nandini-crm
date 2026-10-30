'use client';

import React from 'react';
import { RhfTextField } from '@/components/forms';
import type { ContactFormData } from '@/types/contact.types';

/**
 * Free-text description / notes (full width; capped at the long-text limit).
 * Must be rendered inside a `FormProvider<ContactFormData>`.
 */
export function ContactPreferencesSection() {
    return (
        <RhfTextField<ContactFormData>
            name="description"
            label="Add Description"
            multiline
            minRows={3}
            placeholder="Enter additional contact details, background, notes, or special instructions..."
        />
    );
}
