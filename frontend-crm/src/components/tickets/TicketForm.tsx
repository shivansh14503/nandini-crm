'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
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
    NATURE_PRIORITY_TO_TICKET_PRIORITY,
    SUPPORT_MODES,
    SUPPORT_TYPES,
    TICKET_PRIORITIES,
    TICKET_SOURCES,
    TICKET_STATUSES,
    type NatureOfCallItem,
    type TicketFormData,
    type TicketPriority,
} from '@/types/ticket.types';
import type { ExtendedOrganization } from '@/types/organization.types';
import type { Contact } from '@/types/contact.types';
import type { PartnerCompany, PartnerCompanyContact } from '@/types/partner.types';
import { getNatureOfCalls } from '@/data/mockNatureOfCalls';
import { getPartnerCompanies, getPartnerContacts } from '@/data/mockPartners';
import { contactService, organizationService, ticketService } from '@/services';
import { formatAddressLine } from '@/utils/address';

import {
    CommonFormLayout,
    AppToast,
    FormGrid,
    FormGridItem,
    fieldSizeSx,
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

    const natureOfCallNames = useMemo(() => getNatureOfCalls().map((n) => n.name), []);
    const partnerCompanyNames = useMemo(() => getPartnerCompanies().map((p) => p.companyName), []);
    const partnerContacts = useMemo(() => getPartnerContacts(), []);
    const partnerCompany = useWatch({ control, name: 'partnerCompany' });

    // Same narrowing for partner contacts: only the chosen partner's people, when it has any.
    const partnerContactNames = useMemo(() => {
        const company = partnerCompany?.trim().toLowerCase();
        const inCompany = company ? partnerContacts.filter((c) => c.partnerCompany.toLowerCase() === company) : [];
        return (inCompany.length > 0 ? inCompany : partnerContacts).map((c) => c.name);
    }, [partnerContacts, partnerCompany]);

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

    const touch = { shouldDirty: true, shouldValidate: true } as const;
    const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

    const clearContactFields = () => {
        setValue('contactPersonName', '', { shouldDirty: true });
        setValue('contactNumber', '', touch);
        setValue('contactEmail', '', touch);
    };

    // ── Organization selection & clear ───────────────────────────────────────
    const handleOrganizationPicked = (org: ExtendedOrganization) => {
        // Always overwrite: switching organizations must replace the previous one's address.
        setValue('accountAddress', organizationAddress(org), touch);
        // A contact who belongs to a different organization no longer applies.
        const currentContact = getValues('contactPersonName')?.trim();
        if (currentContact) {
            const match = contacts.find((c) => sameName(c.name, currentContact));
            if (match && match.organizationName && !sameName(match.organizationName, org.organizationName)) {
                clearContactFields();
            }
        }
    };

    const handleOrganizationCleared = () => {
        setValue('accountAddress', '', touch);
        clearContactFields();
    };

    // ── Contact selection & clear ────────────────────────────────────────────
    const handleContactPicked = (contact: Contact) => {
        setValue('contactNumber', contact.mobile || '', touch);
        setValue('contactEmail', primaryEmail(contact), touch);
        if (contact.organizationName) {
            setValue('organizationName', contact.organizationName, touch);
            const org = organizations.find((o) => sameName(o.organizationName, contact.organizationName));
            // No directory record for the contact's organization: don't leave a previous one's address behind.
            setValue('accountAddress', org ? organizationAddress(org) : '', touch);
        }
    };

    const handleContactCleared = () => {
        setValue('contactNumber', '', touch);
        setValue('contactEmail', '', touch);
    };

    // ── Nature of call → suggested priority ──────────────────────────────────
    // Priority set by the last nature-of-call pick. If the current priority differs from it (or from the
    // default before any pick), the user chose it explicitly and it is left alone.
    const autoPriorityRef = useRef<TicketPriority | null>(null);
    const handleNatureOfCallPicked = (item: NatureOfCallItem) => {
        const current = getValues('ticketPriority');
        const untouched = current === (autoPriorityRef.current ?? DEFAULT_TICKET_FORM.ticketPriority);
        if (!untouched) return;
        const suggested = NATURE_PRIORITY_TO_TICKET_PRIORITY[item.priority];
        autoPriorityRef.current = suggested;
        setValue('ticketPriority', suggested, touch);
    };

    // ── Partner company & contact ────────────────────────────────────────────
    const handlePartnerCompanyPicked = (partner: PartnerCompany) => {
        const contactName = getValues('partnerCompanyContact')?.trim();
        const contact = contactName ? partnerContacts.find((c) => sameName(c.name, contactName)) : undefined;
        if (contact && !sameName(contact.partnerCompany, partner.companyName)) {
            setValue('partnerCompanyContact', '', { shouldDirty: true });
        }
    };

    const handlePartnerContactPicked = (contact: PartnerCompanyContact) => {
        setValue('partnerCompany', contact.partnerCompany, touch);
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
                    {/* Entitlements */}
                    <Box sx={fieldSizeSx('lg')}>
                        <RhfToggleGroupCard<TicketFormData>
                            items={[
                                { name: 'amcFlag', label: 'Active AMC', caption: 'Annual maintenance contract' },
                                { name: 'cloudFlag', label: 'Active Cloud', caption: 'Cloud hosting subscription' },
                            ]}
                        />
                    </Box>

                    <FormGrid columns={3} sx={{ mt: 1 }}>
                        {/* ── Customer ── */}
                        <RhfTextField<TicketFormData> name="ticketSubject" label="Ticket Subject" placeholder="Short summary of the issue" />
                        <RhfLookup<TicketFormData, 'organization'>
                            name="organizationName"
                            label="Organization Name"
                            required
                            options={organizationNames}
                            lookupType="organization"
                            onSelectRecord={handleOrganizationPicked}
                            onClearRecord={handleOrganizationCleared}
                            placeholder="Search or select organization..."
                        />
                        <RhfLookup<TicketFormData, 'contact'>
                            name="contactPersonName"
                            label="Contact Person Name"
                            required
                            options={contactNames}
                            lookupType="contact"
                            onSelectRecord={handleContactPicked}
                            onClearRecord={handleContactCleared}
                            placeholder="Search or select contact..."
                            fieldSize="md"
                        />

                        {/* ── Contact channels ── */}
                        <RhfPhoneField<TicketFormData> name="contactNumber" label="Contact Number" placeholder="e.g. 9876543210" />
                        <RhfEmailField<TicketFormData> name="contactEmail" label="Contact Email" placeholder="e.g. name@company.com" />
                        <RhfSelect<TicketFormData> name="leftJob" label="Left Job" options={['No', 'Yes']} />

                        {/* ── Classification ── */}
                        <RhfLookup<TicketFormData, 'natureOfCall'>
                            name="natureOfCall"
                            label="Nature Of Call"
                            required
                            options={natureOfCallNames}
                            lookupType="natureOfCall"
                            onSelectRecord={handleNatureOfCallPicked}
                            hint="Sets a suggested priority"
                            placeholder="Search or select nature of call..."
                        />
                        <RhfSelect<TicketFormData> name="ticketPriority" label="Ticket Priority" required options={TICKET_PRIORITIES} />
                        <RhfSelect<TicketFormData> name="ticketStatus" label="Ticket Status" options={TICKET_STATUSES} />

                        {/* ── Channel ── */}
                        <RhfSelect<TicketFormData> name="source" label="Source" options={TICKET_SOURCES} />
                        <RhfSelect<TicketFormData> name="supportType" label="Support Type" options={SUPPORT_TYPES} />
                        <RhfSelect<TicketFormData> name="supportMode" label="Support Mode" required options={SUPPORT_MODES} />

                        {/* ── Scheduling & ownership ── */}
                        <RhfDateTimeField<TicketFormData> dateName="dueDate" label="Due Date" required combined />
                        <RhfAssignedUserCard<TicketFormData> name="assignedTo" label="Assigned to" required roleBadge="Primary Rep" />
                        <FormGridItem>
                            <RhfTextField<TicketFormData>
                                name="accountAddress"
                                label="Account Address"
                                multiline
                                minRows={2}
                                hint="From the selected organization"
                                placeholder="Customer site address"
                                fieldSize="lg"
                            />
                        </FormGridItem>
                    </FormGrid>

                    {/* ── Case notes: textareas three to a row ── */}
                    <FormGrid columns={3} sx={{ mt: 3 }}>
                        <FormGridItem>
                            <RhfTextField<TicketFormData>
                                name="problemReported"
                                label="Problem Reported"
                                required
                                multiline
                                minRows={3}
                                placeholder="What the customer reported..."
                            />
                        </FormGridItem>
                        <FormGridItem>
                            <RhfTextField<TicketFormData> name="problemObserved" label="Problem Observed" multiline minRows={3} placeholder="What the engineer found..." />
                        </FormGridItem>
                        <FormGridItem>
                            <RhfTextField<TicketFormData> name="rca" label="RCA (Root Cause Analysis)" multiline minRows={3} placeholder="Underlying cause..." />
                        </FormGridItem>
                        <FormGridItem>
                            <RhfTextField<TicketFormData> name="resolution" label="Resolution" multiline minRows={3} placeholder="Steps taken to resolve..." />
                        </FormGridItem>
                        <FormGridItem>
                            <RhfTextField<TicketFormData>
                                name="reasonForEscalatedCalls"
                                label="Reason For Escalated Calls"
                                multiline
                                minRows={3}
                                placeholder="Why this call was escalated..."
                            />
                        </FormGridItem>
                        <FormGridItem>
                            <RhfTextField<TicketFormData> name="addDescription" label="Add Description" multiline minRows={3} placeholder="Additional notes..." />
                        </FormGridItem>
                    </FormGrid>
                </div>

                <div hidden={activeTab !== 'partner_company'}>
                    <FormGrid columns={2}>
                        <RhfLookup<TicketFormData, 'partnerCompany'>
                            name="partnerCompany"
                            label="Partner Company"
                            options={partnerCompanyNames}
                            lookupType="partnerCompany"
                            onSelectRecord={handlePartnerCompanyPicked}
                            onClearRecord={() => setValue('partnerCompanyContact', '', { shouldDirty: true })}
                            placeholder="Search or select partner company..."
                        />
                        <RhfLookup<TicketFormData, 'partnerCompanyContact'>
                            name="partnerCompanyContact"
                            label="Partner Company Contact"
                            options={partnerContactNames}
                            lookupType="partnerCompanyContact"
                            onSelectRecord={handlePartnerContactPicked}
                            placeholder="Search or select partner contact..."
                        />
                    </FormGrid>
                </div>
            </CommonFormLayout>
        </FormProvider>
    );
}
