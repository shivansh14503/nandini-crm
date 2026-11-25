'use client';

import { NO_PAST_DATES } from '@/utils/pastDates';
import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FormProvider } from 'react-hook-form';
import { Box, Divider } from '@mui/material';

// Icons
import PersonOutlineOutlinedIcon from '@mui/icons-material/PersonOutlineOutlined';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import MonetizationOnOutlinedIcon from '@mui/icons-material/MonetizationOnOutlined';
import PublishedWithChangesIcon from '@mui/icons-material/PublishedWithChanges';

import { type BreadcrumbItem } from '../common/AppBreadcrumbs';
import { AppToast } from '../common/AppToast';
import { setSaveFlash } from '@/utils/saveFlash';
import { CommonFormLayout } from '../common/CommonFormLayout';
import { BreadcrumbsSkeleton, FormCardSkeleton } from '../common/skeletons';
import { RhfCheckbox, SectionLabel, useRhfForm } from '@/components/forms';
import { ROUTES } from '@/config/constants';
import type { Lead } from '@/types/lead.types';
import {
    buildConvertLeadDefaults,
    convertLead,
    leadPrefilledFields,
    leadService,
} from '@/services';
import {
    convertLeadFormSchema,
    type ConvertLeadFormValues,
} from '@/validations';
import { getFormConfigs } from '@/services/masterData.store';
import { convertRequiredIssues } from '@/utils/convertLeadFields';
import {
    ConvertContactSection,
    ConvertOpportunitySection,
    ConvertOrganizationSection,
} from './convert';
import { LeadPrefilledProvider } from './convert/LeadLocked';
import { lockedInputSx } from '@/components/forms/LockedInputs';

export interface ConvertLeadFormProps {
    leadId: string;
    breadcrumbItems?: BreadcrumbItem[];
}

const CONVERT_TABS = [
    {
        id: 'convert',
        label: 'Convert Lead',
        icon: <PublishedWithChangesIcon sx={{ fontSize: 18, color: 'var(--crm-logo-green-text)' }} />,
    },
];

/** Same company-logo green "Convert Lead" look as the action in the lead's side drawer. */
const convertButtonSx = {
    color: 'var(--crm-logo-green-text)',
    background: 'var(--crm-logo-green-soft)',
    border: '1px solid var(--crm-logo-green-border)',
    boxShadow: 'none',
    '&:hover': {
        background: 'var(--crm-logo-green-soft-hover)',
        borderColor: 'var(--crm-logo-green-border-hover)',
        boxShadow: 'none',
    },
} as const;

const sectionDividerSx = { my: 3.5, borderColor: 'var(--mui-palette-border-light)' } as const;

/**
 * Editable inputs get a darker outline and the locked ones (values from the lead, see LeadLocked) a soft fill, so the
 * two are easy to tell apart. Hover, focus and error outlines are left to the fields' own styles.
 */
const inputStatesSx = {
    '& .MuiOutlinedInput-root:not(.Mui-disabled):not(:has(input[readonly])):not(.Mui-focused):not(.Mui-error):not(:hover) .MuiOutlinedInput-notchedOutline': {
        borderColor: 'var(--crm-slate-500)',
    },
    // Locked: disabled (from the lead) or read-only (Mailing Name follows Organization Name).
    ...lockedInputSx,
} as const;

const EMPTY_DEFAULTS: ConvertLeadFormValues = {
    existingOrganizationId: '',
    organizationName: '',
    mailingName: '',
    natureOfBusiness: '',
    typeOfEntity: '',
    customerType: '',
    natureOfPartner: '',
    leadSource: '',
    memberOf: '',
    organizationDescription: '',

    existingContactId: '',
    contactName: '',
    contactMobile: '',
    contactPhone3: '',
    contactEmails: [{ id: 'eml-1', email: '', isPrimary: true, isOptedOut: false, isInvalidBounce: false }],
    isPrimaryContact: true,
    designation: '',
    department: '',
    communicationType: ['Call', 'Email'],
    doNotCall: false,
    contactDescription: '',

    createOpportunity: true,
    productCategory: ['Biz Analyst'],
    referredBy: '',
    referredById: '',
    opportunityPartnerCompany: '',
    type: 'New Business',
    nextFollowupDate: '',
    nextFollowupTime: '',
    followupType: 'Call',
    opportunityDescription: '',
    opportunityLeadSource: 'Website Enquiry',
    extraFields: { contacts: {}, organizations: {}, opportunities: {} },
};

export function ConvertLeadForm({ leadId, breadcrumbItems }: ConvertLeadFormProps) {
    const router = useRouter();
    const [lead, setLead] = useState<Lead | null>(null);
    const [loading, setLoading] = useState(true);

    const { methods, toast, showToast, closeToast, createSubmitHandler, stepwise } =
        useRhfForm<ConvertLeadFormValues>({
            schema: convertLeadFormSchema,
            noPastDates: NO_PAST_DATES.followup,
            defaultValues: EMPTY_DEFAULTS,
            // Fields an admin made required on the contact / organization / opportunity forms are required here too
            // (those shown on Convert Lead). An existing contact or organization is linked as-is, so only a new one
            // must meet its form's rules.
            extraRules: (values) => convertRequiredIssues(getFormConfigs(), values),
        });

    const { reset, formState } = methods;
    // Values the lead supplied show read-only (see LeadLocked).
    const prefilled = useMemo(() => (lead ? leadPrefilledFields(lead) : new Set<string>()), [lead]);
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
            const opportunityNote = result.opportunity ? '' : ' No opportunity was created.';

            const message = `Lead converted successfully! ${orgNote} ${contactNote}${opportunityNote}`;
            reset(values);
            if (result.opportunity) {
                // Straight to the new opportunity's detail page, which shows the message.
                const detailPath = ROUTES.OPPORTUNITY_DETAIL(result.opportunity.id);
                setSaveFlash({ listPath: detailPath, message, severity: 'success' });
                router.push(detailPath);
            } else {
                setSaveFlash({ listPath: ROUTES.LEADS, message, severity: 'success', recordId: leadId });
                router.push(ROUTES.LEADS);
            }
        } catch (err: unknown) {
            showToast(err instanceof Error ? err.message : 'Failed to convert lead.', 'error');
        }
    });

    const handleDiscard = () => {
        router.push(ROUTES.LEADS);
    };

    if (loading) {
        return (
            <Box role="status" aria-label="Loading lead data">
                <BreadcrumbsSkeleton />
                <FormCardSkeleton />
            </Box>
        );
    }

    return (
        <FormProvider {...methods}>
            <LeadPrefilledProvider fields={prefilled}>
                <CommonFormLayout
                    isDirty={isDirty}
                    breadcrumbItems={breadcrumbItems || defaultBreadcrumbs}
                    tabs={CONVERT_TABS}
                    activeTab="convert"
                    onCancel={handleDiscard}
                    onSave={handleSave}
                    submitting={isSubmitting}
                    saveLabel="Convert Lead"
                    saveIcon={<PublishedWithChangesIcon sx={{ fontSize: 18 }} />}
                    saveSx={convertButtonSx}
                    stepwise={stepwise}
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
                    <Box sx={inputStatesSx}>
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

                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', mb: 1 }}>
                            <SectionLabel
                                icon={<MonetizationOnOutlinedIcon sx={{ fontSize: 18 }} />}
                                label="3. Create Opportunity"
                                sx={{ mb: 0 }}
                            />
                            {/* Off when the deal already has an opportunity: the lead converts without creating another. */}
                            <RhfCheckbox<ConvertLeadFormValues> name="createOpportunity" label="Create a new opportunity" />
                        </Box>
                        <ConvertOpportunitySection />
                    </Box>
                </CommonFormLayout>
            </LeadPrefilledProvider>
        </FormProvider>
    );
}

export default ConvertLeadForm;
