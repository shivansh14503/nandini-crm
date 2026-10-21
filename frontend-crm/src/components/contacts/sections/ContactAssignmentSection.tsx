'use client';

import React from 'react';
import { Grid } from '@mui/material';
import { RhfCheckbox, RhfLookup, RhfSelect, RhfTextField } from '@/components/forms';
import {
    CONTACT_DESIGNATIONS,
    CONTACT_DEPARTMENTS,
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
 * Internal ownership, primary contact status and organizational role.
 * Must be rendered inside a `FormProvider<ContactFormData>`.
 */
export function ContactAssignmentSection({ assigneeOptions = DEFAULT_ASSIGNEES }: { assigneeOptions?: string[] }) {
    return (
        <Grid container spacing={3.5}>
            <Grid size={{ xs: 12, md: 6 }}>
                <RhfLookup<ContactFormData> name="assignedTo" label="Assigned to" required options={assigneeOptions} placeholder="Select assigned sales rep" />
                <RhfCheckbox<ContactFormData> name="isPrimaryContact" label="Is Primary Contact" />
                <RhfSelect<ContactFormData> name="designation" label="Designation" options={CONTACT_DESIGNATIONS} placeholder="Select Designation" />
                <RhfTextField<ContactFormData> name="location" label="Location" placeholder="e.g. New Delhi / Branch Office" />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
                <RhfSelect<ContactFormData> name="department" label="Department" options={CONTACT_DEPARTMENTS} placeholder="Select Department" />
                <RhfSelect<ContactFormData> name="leftJob" label="Left Job" options={['No', 'Yes']} placeholder="Select option" />
            </Grid>
        </Grid>
    );
}
