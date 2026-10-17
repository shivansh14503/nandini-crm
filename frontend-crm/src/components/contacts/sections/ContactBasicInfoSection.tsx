'use client';

import React from 'react';
import { Grid, TextField } from '@mui/material';
import { FormField, LookupField, fieldSx } from '../../forms';

export interface ContactBasicInfoSectionProps {
    name: string;
    organizationName: string;
    mobile: string;
    officePhone: string;
    organizationNames: string[];
    onNameChange: (value: string) => void;
    onOrganizationChange: (value: string) => void;
    onMobileChange: (value: string) => void;
    onOfficePhoneChange: (value: string) => void;
}

/**
 * Modular section for basic contact identity & organization association.
 * Self-contained responsive 2-column grid layout.
 */
export function ContactBasicInfoSection({
    name,
    organizationName,
    mobile,
    officePhone,
    organizationNames,
    onNameChange,
    onOrganizationChange,
    onMobileChange,
    onOfficePhoneChange,
}: ContactBasicInfoSectionProps) {
    return (
        <Grid container spacing={3.5}>
            {/* Left: Contact Name & Mobile */}
            <Grid size={{ xs: 12, md: 6 }}>
                <FormField label="Name" required>
                    <TextField
                        fullWidth
                        size="small"
                        placeholder="e.g. Rajesh Kumar"
                        value={name}
                        onChange={(e) => onNameChange(e.target.value)}
                        sx={fieldSx}
                        autoFocus
                    />
                </FormField>

                <FormField label="Mobile" required hint="Primary contact number">
                    <TextField
                        fullWidth
                        size="small"
                        placeholder="e.g. +91 98765 43210"
                        value={mobile}
                        onChange={(e) => onMobileChange(e.target.value)}
                        sx={fieldSx}
                    />
                </FormField>
            </Grid>

            {/* Right: Organization Name & Office Phone */}
            <Grid size={{ xs: 12, md: 6 }}>
                <FormField label="Organization Name" required hint="Parent company / account">
                    <LookupField
                        value={organizationName}
                        onChange={onOrganizationChange}
                        options={organizationNames}
                        placeholder="Search or select organization..."
                        required
                    />
                </FormField>

                <FormField label="Office Phone">
                    <TextField
                        fullWidth
                        size="small"
                        placeholder="e.g. 011-23456789"
                        value={officePhone}
                        onChange={(e) => onOfficePhoneChange(e.target.value)}
                        sx={fieldSx}
                    />
                </FormField>
            </Grid>
        </Grid>
    );
}
