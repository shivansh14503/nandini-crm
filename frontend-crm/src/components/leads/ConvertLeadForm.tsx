'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FormProvider } from 'react-hook-form';
import { Box, CircularProgress, Divider, Typography } from '@mui/material';

// Icons
import PersonOutlineOutlinedIcon from '@mui/icons-material/PersonOutlineOutlined';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import MonetizationOnOutlinedIcon from '@mui/icons-material/MonetizationOnOutlined';
import TransformOutlinedIcon from '@mui/icons-material/TransformOutlined';

import { type BreadcrumbItem } from '../common/AppBreadcrumbs';
import { AppToast } from '../common/AppToast';
import { CommonFormLayout } from '../common/CommonFormLayout';
import { SectionLabel, useRhfForm } from '@/components/forms';
import { ROUTES } from '@/config/constants';
import type { Lead } from '@/types/lead.types';
import {
    buildConvertLeadDefaults,
    convertLead,
    leadService,
} from '@/services';
import {
    convertLeadFormSchema,
    type ConvertLeadFormValues,
} from '@/validations';
import {
    ConvertContactSection,
    ConvertOpportunitySection,
    ConvertOrganizationSection,
} from './convert';

export interface ConvertLeadFormProps {
    leadId: string;
    breadcrumbItems?: BreadcrumbItem[];
}

const CONVERT_TABS = [
    {
        id: 'convert',
        label: 'Convert Lead',
        icon: <TransformOutlinedIcon sx={{ fontSize: 18, color: '#2563eb' }} />,
    },
];

const sectionDividerSx = { my: 3.5, borderColor: '#f1f5f9' } as const;

const EMPTY_DEFAULTS: ConvertLeadFormValues = {
    existingOrganizationId: '',
    organizationName: '',
    mailingName: '',
    natureOfBusiness: '',
    typeOfEntity: '',
    customerType: '',
    sourceOfLead: '',
    memberOf: '',
    organizationDescription: '',
    organizationAssignedTo: 'mittal.sharma',

    existingContactId: '',
    contactName: '',
    contactMobile: '',
    contactPhone3: '',
    contactEmails: [{ id: 'eml-1', email: '', isPrimary: true, isOptedOut: false, isInvalidBounce: false }],
    isPrimaryContact: true,
    designation: '',
    department: '',
    location: '',
    communicationType: ['Call', 'Email'],
    doNotCall: false,
    contactDescription: '',
    contactAssignedTo: 'mittal.sharma',

    productCategory: ['Biz Analyst'],
    principalCompany: '',
    referredBy: '',
    opportunityType: 'New Business',
    nextFollowupDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
    nextFollowupTime: '11:00 AM',
    followupType: 'Call',
    opportunityDescription: '',
    opportunityLeadSource: 'Website Enquiry',
    opportunityAssignedTo: 'mittal.sharma',
    copyActivitiesTo: [],
};

export function ConvertLeadForm({ leadId, breadcrumbItems }: ConvertLeadFormProps) {
    const router = useRouter();
    const [lead, setLead] = useState<Lead | null>(null);
    const [loading, setLoading] = useState(true);

    const { methods, toast, showToast, closeToast, createSubmitHandler } =
        useRhfForm<ConvertLeadFormValues>({
            schema: convertLeadFormSchema,
            defaultValues: EMPTY_DEFAULTS,
        });

    const { reset, formState } = methods;
    const { isDirty, isSubmitting } = formState;

    useEffect(() => {
        let active = true;
        leadService
            .getById(leadId)
            .then((found) => {
                if (!active) return;
                if (!found) {
                    showToast('Lead record not found.', 'error');
                } else {
                    setLead(found);
                    reset(buildConvertLeadDefaults(found));
                }
            })
            .catch((err) => {
                if (active) {
                    showToast(err instanceof Error ? err.message : 'Failed to load lead details.', 'error');
                }
            })
            .finally(() => {
                if (active) setLoading(false);
            });

        return () => {
            active = false;
        };
    }, [leadId, reset, showToast]);

    const defaultBreadcrumbs: BreadcrumbItem[] = [
        { label: 'Sales' },
        { label: 'Leads', href: ROUTES.LEADS },
        { label: lead?.name ? `Convert: ${lead.name}` : 'Convert Lead' },
    ];

    const handleSave = createSubmitHandler(async (values) => {
        try {
            const result = await convertLead(leadId, values);
            const orgNote = result.organizationCreated
                ? `Created organization "${result.organization.organizationName}".`
                : `Linked existing organization "${result.organization.organizationName}".`;
            const contactNote = result.contactCreated
                ? `Created contact "${result.contact.name}".`
                : `Linked existing contact "${result.contact.name}".`;

            showToast(`Lead converted successfully! ${orgNote} ${contactNote}`, 'success');
            reset(values);
            setTimeout(() => router.push(ROUTES.LEADS), 1000);
        } catch (err: unknown) {
            showToast(err instanceof Error ? err.message : 'Failed to convert lead.', 'error');
        }
    });

    const handleDiscard = () => {
        if (isDirty && !window.confirm('Discard unsaved lead conversion data?')) return;
        router.push(ROUTES.LEADS);
    };

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 12 }}>
                <CircularProgress size={36} sx={{ color: '#2563eb' }} />
                <Typography sx={{ ml: 2, color: '#64748b', fontSize: '0.9rem' }}>
                    Loading lead data...
                </Typography>
            </Box>
        );
    }

    return (
        <FormProvider {...methods}>
            <CommonFormLayout
                breadcrumbItems={breadcrumbItems || defaultBreadcrumbs}
                tabs={CONVERT_TABS}
                activeTab="convert"
                onCancel={handleDiscard}
                onSave={handleSave}
                submitting={isSubmitting}
                saveLabel="Convert Lead"
                cancelLabel="Cancel"
                toast={
                    <AppToast
                        open={toast.open}
                        message={toast.message}
                        severity={toast.severity}
                        onClose={closeToast}
                    />
                }
            >
                <SectionLabel
                    icon={<PersonOutlineOutlinedIcon sx={{ fontSize: 18 }} />}
                    label="1. Create Contact OR Select Contact"
                />
                <ConvertContactSection />

                <Divider sx={sectionDividerSx} />

                <SectionLabel
                    icon={<BusinessOutlinedIcon sx={{ fontSize: 18 }} />}
                    label="2. Create Organization OR Select Organization"
                />
                <ConvertOrganizationSection />

                <Divider sx={sectionDividerSx} />

                <SectionLabel
                    icon={<MonetizationOnOutlinedIcon sx={{ fontSize: 18 }} />}
                    label="3. Create Opportunity"
                />
                <ConvertOpportunitySection />
            </CommonFormLayout>
        </FormProvider>
    );
}

export default ConvertLeadForm;
