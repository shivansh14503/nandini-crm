'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FormProvider, useWatch } from 'react-hook-form';
import { Box } from '@mui/material';
import ConfirmationNumberOutlinedIcon from '@mui/icons-material/ConfirmationNumberOutlined';
import HandshakeOutlinedIcon from '@mui/icons-material/HandshakeOutlined';

import { type BreadcrumbItem } from '../common/AppBreadcrumbs';
import { type FormTabDefinition } from '../common/Drawer';
import { ROUTES } from '../../config/constants';
import { ticketFormSchema } from '@/validations';
import {
    NATURES_OF_CALL,
    SUPPORT_MODES,
    SUPPORT_TYPES,
    TICKET_PRIORITIES,
    TICKET_SOURCES,
    TICKET_STATUSES,
    type TicketFormData,
} from '@/types/ticket.types';
import type { ExtendedOrganization } from '@/types/organization.types';
import type { Contact } from '@/types/contact.types';
import { contactService, organizationService, ticketService } from '@/services';
import { formatAddressLine } from '@/utils/address';

import {
    CommonFormLayout,
    AppToast,
    RhfTextField,
    RhfSelect,
    RhfLookup,
    RhfAssignedUserCard,
    RhfToggleGroupCard,
    RhfDateTimeField,
    RhfPhoneField,
    RhfEmailField,
    useRhfForm,
} from '@/components/forms';

type TicketTabKey = 'overview' | 'partner_company';

// ─── Single Source of Truth for Ticket Form Tabs ──────────────────────────────
export const TICKET_FORM_TABS: (FormTabDefinition & { id: TicketTabKey })[] = [
    {
        id: 'overview',
        label: 'OVERVIEW',
        icon: <ConfirmationNumberOutlinedIcon sx={{ fontSize: 18 }} />,
    },
    {
        id: 'partner_company',
        label: 'Partner Company',
        icon: <HandshakeOutlinedIcon sx={{ fontSize: 18 }} />,
    },
];

export const DEFAULT_TICKET_FORM: TicketFormData = {
    amcFlag: false,
    ticketSubject: '',
    organizationName: '',
    contactPersonName: '',
    contactNumber: '',
    ticketPriority: 'Normal',
    source: 'Call',
    supportType: 'Free',
    problemReported: '',
    resolution: '',
    reasonForEscalatedCalls: '',
    assignedTo: 'mittal.sharma',
    cloudFlag: false,
    natureOfCall: '',
    accountAddress: '',
    contactEmail: '',
    leftJob: 'No',
    ticketStatus: 'New',
    dueDate: '',
    supportMode: 'Offsite Support',
    problemObserved: '',
    rca: '',
    addDescription: '',
    partnerCompany: '',
    partnerCompanyContact: '',
};

const columnSx = { display: 'flex', flexDirection: 'column', minWidth: 0 } as const;
const gridSx = { display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3.5 } as const;

const organizationAddress = (o: ExtendedOrganization) =>
    o.billingAddress ||
    formatAddressLine({
        street: o.billingStreet,
        city: o.billingCity,
        state: o.billingState,
        postalCode: o.billingPostalCode,
        country: o.billingCountry,
    });

const primaryEmail = (c: Contact) => (c.emailAddresses.find((e) => e.isPrimary) ?? c.emailAddresses[0])?.email ?? '';

export interface TicketFormProps {
    mode?: 'create' | 'edit' | 'view';
    initialData?: Partial<TicketFormData>;
    ticketId?: string;
    breadcrumbItems?: BreadcrumbItem[];
}

export default function TicketForm({ mode = 'create', initialData, ticketId, breadcrumbItems }: TicketFormProps) {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<TicketTabKey>('overview');
    const [ticketNumber, setTicketNumber] = useState('');

    const { methods, toast, showToast, closeToast, createSubmitHandler } = useRhfForm<TicketFormData>({
        schema: ticketFormSchema,
        defaultValues: { ...DEFAULT_TICKET_FORM, ...initialData },
    });

    const { reset, getValues, setValue, control, formState } = methods;
    const { isDirty, isSubmitting } = formState;
    const ticketSubject = useWatch({ control, name: 'ticketSubject' });
    const organizationName = useWatch({ control, name: 'organizationName' });

    const organizations = useMemo(() => organizationService.getAllSync(), []);
    const contacts = useMemo(() => contactService.getAllSync(), []);
    const organizationNames = useMemo(() => organizations.map((o) => o.organizationName), [organizations]);

    // Narrow contact suggestions to the chosen organization when it has any contacts on file.
    const contactNames = useMemo(() => {
        const org = organizationName?.trim().toLowerCase();
        const inOrg = org ? contacts.filter((c) => c.organizationName.trim().toLowerCase() === org) : [];
        return (inOrg.length > 0 ? inOrg : contacts).map((c) => c.name);
    }, [contacts, organizationName]);

    const recordLabel = ticketNumber || ticketSubject || 'Ticket';
    const defaultBreadcrumbs: BreadcrumbItem[] = [
        { label: 'Support' },
        { label: 'Tickets', href: ROUTES.TICKETS },
        {
            label:
                mode === 'create'
                    ? 'Create Ticket'
                    : `${mode === 'view' ? 'View' : 'Edit'}: ${recordLabel}`,
        },
    ];

    useEffect(() => {
        if (!ticketId) return;
        let active = true;
        ticketService
            .getById(ticketId)
            .then((found) => {
                if (active && found) {
                    setTicketNumber(found.ticketNumber);
                    reset({ ...DEFAULT_TICKET_FORM, ...found });
                }
            })
            .catch(() => {});
        return () => {
            active = false;
        };
    }, [ticketId, reset]);

    const fillIfEmpty = (key: 'accountAddress' | 'contactNumber' | 'contactEmail' | 'organizationName', value: string) => {
        if (value && !getValues(key)?.trim()) {
            setValue(key, value, { shouldDirty: true, shouldValidate: true });
        }
    };

    const handleOrganizationPicked = (org: ExtendedOrganization) => {
        fillIfEmpty('accountAddress', organizationAddress(org));
    };

    const handleContactPicked = (contact: Contact) => {
        fillIfEmpty('contactNumber', contact.mobile);
        fillIfEmpty('contactEmail', primaryEmail(contact));
        fillIfEmpty('organizationName', contact.organizationName);
        const org = organizations.find((o) => o.organizationName === contact.organizationName);
        if (org) fillIfEmpty('accountAddress', organizationAddress(org));
    };

    const submit = createSubmitHandler(async (values) => {
        try {
            if (mode === 'create') {
                const created = await ticketService.create(values);
                showToast(`Ticket ${created.ticketNumber} created successfully!`, 'success');
            } else if (ticketId) {
                await ticketService.update(ticketId, values);
                showToast('Ticket updated successfully!', 'success');
            }
            reset(values);
            setTimeout(() => router.push(ROUTES.TICKETS), 800);
        } catch (err: unknown) {
            showToast(err instanceof Error ? err.message : 'Failed to save ticket.', 'error');
        }
    });

    // Every required field lives on OVERVIEW, so show it before validating to let the error focus land.
    const handleSave = () => {
        setActiveTab('overview');
        submit();
    };

    const handleDiscard = () => {
        if (mode !== 'view' && isDirty && !window.confirm('Discard unsaved ticket changes?')) return;
        router.push(ROUTES.TICKETS);
    };

    return (
        <FormProvider {...methods}>
            <CommonFormLayout
                breadcrumbItems={breadcrumbItems || defaultBreadcrumbs}
                tabs={TICKET_FORM_TABS}
                activeTab={activeTab}
                onTabChange={(tabId) => setActiveTab(tabId as TicketTabKey)}
                onCancel={handleDiscard}
                onSave={mode === 'view' ? () => router.push(ROUTES.TICKET_EDIT(ticketId!)) : handleSave}
                submitting={isSubmitting}
                saveLabel={mode === 'view' ? 'Edit Ticket' : mode === 'edit' ? 'Update Ticket' : 'Save Ticket'}
                cancelLabel={mode === 'view' ? 'Back' : 'Cancel'}
                recordView={{
                    title: ticketSubject || ticketNumber || '',
                    editHref: ticketId ? ROUTES.TICKET_EDIT(ticketId) : undefined,
                    editLabel: 'Edit Ticket',
                    backHref: ROUTES.TICKETS,
                }}
                mode={mode}
                toast={<AppToast open={toast.open} message={toast.message} severity={toast.severity} onClose={closeToast} />}
            >
                <div hidden={activeTab !== 'overview'}>
                    <Box sx={gridSx}>
                        {/* Left column */}
                        <Box sx={columnSx}>
                            <RhfTextField<TicketFormData> name="ticketSubject" label="Ticket Subject" placeholder="Short summary of the issue" />
                            <RhfLookup<TicketFormData, 'organization'>
                                name="organizationName"
                                label="Organization Name"
                                required
                                options={organizationNames}
                                lookupType="organization"
                                onSelectRecord={handleOrganizationPicked}
                                placeholder="Search or select organization..."
                            />
                            <RhfLookup<TicketFormData, 'contact'>
                                name="contactPersonName"
                                label="Contact Person Name"
                                required
                                options={contactNames}
                                lookupType="contact"
                                onSelectRecord={handleContactPicked}
                                placeholder="Search or select contact..."
                            />
                            <RhfPhoneField<TicketFormData> name="contactNumber" label="Contact Number" placeholder="e.g. 9876543210" />
                            <RhfSelect<TicketFormData> name="ticketPriority" label="Ticket Priority" required options={TICKET_PRIORITIES} />
                            <RhfSelect<TicketFormData> name="source" label="Source" options={TICKET_SOURCES} />
                            <RhfSelect<TicketFormData> name="supportType" label="Support Type" options={SUPPORT_TYPES} />
                            <RhfTextField<TicketFormData>
                                name="problemReported"
                                label="Problem Reported"
                                required
                                multiline
                                minRows={3}
                                placeholder="What the customer reported..."
                            />
                            <RhfTextField<TicketFormData> name="resolution" label="Resolution" multiline minRows={3} placeholder="Steps taken to resolve..." />
                            <RhfTextField<TicketFormData>
                                name="reasonForEscalatedCalls"
                                label="Reason For Escalated Calls"
                                multiline
                                minRows={3}
                                placeholder="Why this call was escalated..."
                            />
                            <RhfAssignedUserCard<TicketFormData> name="assignedTo" label="Assigned to" required roleBadge="Primary Rep" />
                        </Box>

                        {/* Right column */}
                        <Box sx={columnSx}>
                            <RhfToggleGroupCard<TicketFormData>
                                items={[
                                    { name: 'amcFlag', label: 'Active AMC', caption: 'Annual maintenance contract' },
                                    { name: 'cloudFlag', label: 'Active Cloud', caption: 'Cloud hosting subscription' },
                                ]}
                            />
                            <RhfSelect<TicketFormData>
                                name="natureOfCall"
                                label="Nature Of Call"
                                required
                                options={NATURES_OF_CALL}
                                placeholder="Select Nature Of Call"
                            />
                            <RhfTextField<TicketFormData>
                                name="accountAddress"
                                label="Account Address"
                                multiline
                                minRows={2}
                                hint="Filled from the organization when left empty"
                                placeholder="Customer site address"
                            />
                            <RhfEmailField<TicketFormData> name="contactEmail" label="Contact Email" placeholder="e.g. name@company.com" />
                            <RhfSelect<TicketFormData> name="leftJob" label="Left Job" options={['No', 'Yes']} />
                            <RhfSelect<TicketFormData> name="ticketStatus" label="Ticket Status" options={TICKET_STATUSES} />
                            <RhfDateTimeField<TicketFormData> dateName="dueDate" label="Due Date" required combined />
                            <RhfSelect<TicketFormData> name="supportMode" label="Support Mode" required options={SUPPORT_MODES} />
                            <RhfTextField<TicketFormData> name="problemObserved" label="Problem Observed" multiline minRows={3} placeholder="What the engineer found..." />
                            <RhfTextField<TicketFormData> name="rca" label="RCA (Root Cause Analysis)" multiline minRows={3} placeholder="Underlying cause..." />
                            <RhfTextField<TicketFormData> name="addDescription" label="Add Description" multiline minRows={3} placeholder="Additional notes..." />
                        </Box>
                    </Box>
                </div>

                <div hidden={activeTab !== 'partner_company'}>
                    <Box sx={gridSx}>
                        <Box sx={columnSx}>
                            <RhfTextField<TicketFormData> name="partnerCompany" label="Partner Company" placeholder="e.g. Tally Solutions Pvt Ltd" />
                        </Box>
                        <Box sx={columnSx}>
                            <RhfTextField<TicketFormData>
                                name="partnerCompanyContact"
                                label="Partner Company Contact"
                                placeholder="Contact person / desk at the partner"
                            />
                        </Box>
                    </Box>
                </div>
            </CommonFormLayout>
        </FormProvider>
    );
}
