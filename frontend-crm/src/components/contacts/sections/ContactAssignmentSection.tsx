'use client';

import React from 'react';
import { Box, Checkbox, FormControlLabel, Grid, TextField, Typography } from '@mui/material';
import { FormField, LookupField, StyledSelect, fieldSx } from '../../forms';
import { CONTACT_DESIGNATIONS, CONTACT_DEPARTMENTS } from '../../../types/contact.types';

export interface ContactAssignmentSectionProps {
    assignedTo: string;
    isPrimaryContact: boolean;
    designation: string;
    department: string;
    location: string;
    leftJob: 'No' | 'Yes';
    assigneeOptions?: string[];
    onAssignedToChange: (value: string) => void;
    onPrimaryContactChange: (checked: boolean) => void;
    onDesignationChange: (value: string) => void;
    onDepartmentChange: (value: string) => void;
    onLocationChange: (value: string) => void;
    onLeftJobChange: (value: 'No' | 'Yes') => void;
}

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
 * Modular section for internal ownership, primary contact status, and organizational role.
 * Self-contained responsive 2-column grid layout.
 */
export function ContactAssignmentSection({
    assignedTo,
    isPrimaryContact,
    designation,
    department,
    location,
    leftJob,
    assigneeOptions = DEFAULT_ASSIGNEES,
    onAssignedToChange,
    onPrimaryContactChange,
    onDesignationChange,
    onDepartmentChange,
    onLocationChange,
    onLeftJobChange,
}: ContactAssignmentSectionProps) {
    return (
        <Grid container spacing={3.5}>
            {/* Left Column: Assigned to, Primary Checkbox, Designation, Location */}
            <Grid size={{ xs: 12, md: 6 }}>
                <FormField label="Assigned to" required>
                    <LookupField
                        value={assignedTo}
                        onChange={onAssignedToChange}
                        options={assigneeOptions}
                        placeholder="Select assigned sales rep"
                        required
                    />
                </FormField>

                <Box sx={{ mb: 2, pt: 0.5 }}>
                    <FormControlLabel
                        control={
                            <Checkbox
                                size="small"
                                checked={isPrimaryContact}
                                onChange={(e) => onPrimaryContactChange(e.target.checked)}
                                sx={{ color: '#2563EB', '&.Mui-checked': { color: '#2563EB' } }}
                            />
                        }
                        label={
                            <Typography sx={{ fontSize: '0.84rem', fontWeight: 600, color: '#374151' }}>
                                Is Primary Contact
                            </Typography>
                        }
                    />
                </Box>

                <FormField label="Designation">
                    <StyledSelect
                        label="Designation"
                        placeholder="Select Designation"
                        value={designation}
                        onChange={onDesignationChange}
                        options={CONTACT_DESIGNATIONS}
                    />
                </FormField>

                <FormField label="Location">
                    <TextField
                        fullWidth
                        size="small"
                        placeholder="e.g. New Delhi / Branch Office"
                        value={location}
                        onChange={(e) => onLocationChange(e.target.value)}
                        sx={fieldSx}
                    />
                </FormField>
            </Grid>

            {/* Right Column: Department, Left Job */}
            <Grid size={{ xs: 12, md: 6 }}>
                <FormField label="Department">
                    <StyledSelect
                        label="Department"
                        placeholder="Select Department"
                        value={department}
                        onChange={onDepartmentChange}
                        options={CONTACT_DEPARTMENTS}
                    />
                </FormField>

                <FormField label="Left Job">
                    <StyledSelect
                        label="Left Job"
                        placeholder="Select option"
                        value={leftJob}
                        onChange={(v) => onLeftJobChange(v as 'No' | 'Yes')}
                        options={['No', 'Yes']}
                    />
                </FormField>
            </Grid>
        </Grid>
    );
}
