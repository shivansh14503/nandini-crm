'use client';

import React from 'react';
import { Grid } from '@mui/material';
import { RhfCheckbox, RhfChipGroup, RhfLookup, RhfSelect } from '@/components/forms';
import {
    CONTACT_DESIGNATIONS,
    CONTACT_DEPARTMENTS,
    COMMUNICATION_TYPES,
    type ContactFormData,
} from '../../../types/contact.types';

const DEFAULT_ASSIGNEES = [
    'mittal.sharma',
    'rahul.verma',
    'priya.singh',
    'amit.patel',
    'vikram.seth',
    'bhanu.pratap',
    'neha.kapoor',
];

/**
 * Internal ownership, organizational role and communication preferences.
 * Must be rendered inside a `FormProvider<ContactFormData>`.
 */
export function ContactAssignmentSection({ assigneeOptions = DEFAULT_ASSIGNEES }: { assigneeOptions?: string[] }) {
    return (
        <Grid container spacing={3.5}>
            <Grid size={{ xs: 12, md: 6 }}>
                <RhfSelect<ContactFormData> name="designation" label="Designation" options={CONTACT_DESIGNATIONS} placeholder="Select Designation" />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
                <RhfSelect<ContactFormData> name="department" label="Department" options={CONTACT_DEPARTMENTS} placeholder="Select Department" />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
                <RhfLookup<ContactFormData> name="assignedTo" label="Assigned to" lookupType="user" required options={assigneeOptions} placeholder="Select assigned sales rep" />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
                <RhfChipGroup<ContactFormData> name="communicationType" label="Communication Type" hint="Select preferred channels" options={COMMUNICATION_TYPES} />
                <RhfCheckbox<ContactFormData> name="doNotCall" label="Do Not Call (DND)" />
            </Grid>
        </Grid>
    );
}
