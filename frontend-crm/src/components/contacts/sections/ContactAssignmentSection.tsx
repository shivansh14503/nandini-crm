'use client';

import React from 'react';
import { FormGrid, FormGridItem, RhfCheckbox, RhfChipGroup, RhfLookup, RhfSelect } from '@/components/forms';
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
        <FormGrid columns={3}>
            <RhfSelect<ContactFormData> name="designation" label="Designation" options={CONTACT_DESIGNATIONS} placeholder="Select Designation" />
            <RhfSelect<ContactFormData> name="department" label="Department" options={CONTACT_DEPARTMENTS} placeholder="Select Department" />
            <RhfLookup<ContactFormData> name="assignedTo" label="Assigned to" lookupType="user" required options={assigneeOptions} placeholder="Select assigned sales rep" />

            <RhfChipGroup<ContactFormData> name="communicationType" label="Communication Type" hint="Select preferred channels" options={COMMUNICATION_TYPES} />
            <FormGridItem span="full">
                <RhfCheckbox<ContactFormData> name="doNotCall" label="Do Not Call (DND)" />
            </FormGridItem>
        </FormGrid>
    );
}
