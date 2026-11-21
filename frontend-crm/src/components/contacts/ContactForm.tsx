'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FormProvider, type Path } from 'react-hook-form';
import { ApiClientError } from '@/services/apiClient';
import { Divider } from '@mui/material';

// Icons
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import ContactPhoneOutlinedIcon from '@mui/icons-material/ContactPhoneOutlined';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';

import { type BreadcrumbItem } from '../common/AppBreadcrumbs';
import { AppToast } from '../common/AppToast';
import { setSaveFlash } from '@/utils/saveFlash';
import { type FormTabDefinition } from '../common/Drawer';
import type { RecordAuditStamp } from '../common/Drawer/RecordAuditFooter';
import { ROUTES } from '@/config/constants';
import type { ContactFormData } from '@/types/contact.types';
import { contactService } from '@/services';
import { contactFormSchema } from '../../validations';

import { CommonFormLayout } from '../common/CommonFormLayout';

// Reusable Production-grade Form Primitives
import { ExistingRecordMatches, SectionLabel, useExistingRecordCheck, useRhfForm } from '@/components/forms';

// Modular Contact Form Sections
import {
    ContactBasicInfoSection,
    ContactPhonesEmailsSection,
    ContactAssignmentSection,
    ContactPreferencesSection,
} from './sections';
import { FormConfigProvider } from '@/context/FormConfigContext';
import { DynamicModuleCustomFields } from '@/components/forms/DynamicModuleCustomFields';
import { useShowRecordNumber } from '@/hooks/queries/useDocumentSeries';

// ─── Single Source of Truth for Contact Form Tabs ──────────────────────────────
export const CONTACT_FORM_TABS: FormTabDefinition[] = [
    {
        id: 'overview',
        label: 'Overview',
        icon: <PersonOutlinedIcon sx={{ fontSize: 18, color: 'var(--crm-text-blue-600)' }} />,
    },
];

export interface ContactFormProps {
    mode?: 'create' | 'edit' | 'view';
    initialData?: Partial<ContactFormData>;
    contactId?: string;
    breadcrumbItems?: BreadcrumbItem[];
}

const DEFAULT_FORM: ContactFormData = {
    name: '',
    organizationName: '',
    mobile: '',
    officePhone: '',
    phone3: '',
    phone4: '',
    phone5: '',
    emailAddress: [
        {
            id: 'email-1',
            email: '',
            isPrimary: true,
            isOptedOut: false,
            isInvalidBounce: false,
        },
    ],
    assignedTo: '',
    isPrimaryContact: false,
    designation: '',
    department: '',
    leftJob: 'No',
    communicationType: ['Call', 'Email'],
    doNotCall: false,
    addDescription: '',
};

const sectionDividerSx = { my: 3.5, borderColor: 'var(--mui-palette-border-light)' } as const;

export default function ContactForm({
    mode = 'create',
    initialData,
    contactId,
    breadcrumbItems,
}: ContactFormProps) {
    const router = useRouter();

    const { methods, toast, showToast, closeToast, createSubmitHandler, stepwise } = useRhfForm<ContactFormData>({
        schema: contactFormSchema,
        module: 'contacts',
        defaultValues: { ...DEFAULT_FORM, ...initialData },
        dropdownDefaults: { enabled: mode === 'create', keep: initialData },
        assigneeField: 'assignedTo',
    });
    const { reset, watch, formState } = methods;
    const { isDirty, isSubmitting } = formState;
    const contactName = watch('name');
    const [audit, setAudit] = useState<RecordAuditStamp>();
    const [recordCode, setRecordCode] = useState('');
    const showNumber = useShowRecordNumber();

    // Leads / contacts / organizations already using this mobile or these emails, listed as links under the fields.
    const { mobileMatches, emailMatches } = useExistingRecordCheck({
        mobile: watch('mobile'),
        emailAddress: watch('emailAddress'),
        excludeId: contactId,
        owner: 'contact',
        enabled: mode !== 'view',
    });
    const mobileNotice = mobileMatches.length > 0 ? <ExistingRecordMatches matches={mobileMatches} title="Mobile already in CRM" /> : undefined;
    const emailNotices = useMemo(
        () =>
            Object.fromEntries(
                Object.entries(emailMatches).map(([email, matches]) => [
                    email,
                    <ExistingRecordMatches key={email} matches={matches} title="Email already in CRM" />,
                ])
            ),
        [emailMatches]
    );

    const defaultBreadcrumbs: BreadcrumbItem[] = [
        { label: 'Sales' },
        { label: 'Contacts', href: ROUTES.CONTACTS },
        { label: mode !== 'create' ? (contactName ? `${mode === 'view' ? 'View' : 'Edit'}: ${contactName}` : `${mode === 'view' ? 'View' : 'Edit'} Contact`) : 'Create Contact' },
    ];

    // Populate data when editing
    // True until the saved record arrives (view / edit), so the form shows skeleton fields, not empty ones.
    const [recordLoading, setRecordLoading] = useState(Boolean(contactId));
    useEffect(() => {
        if (!contactId) return;
        let active = true;
        contactService
            .getById(contactId)
            .then((found) => {
                if (active && found) {
                    reset({ ...DEFAULT_FORM, ...found });
                    setRecordCode(found.contactCode ?? '');
                    setAudit({ createdAt: found.createdAt, createdBy: found.createdBy, updatedAt: found.updatedAt, updatedBy: found.updatedBy });
                }
            })
            .catch(() => {})
            .finally(() => {
                if (active) setRecordLoading(false);
            });
        return () => {
            active = false;
        };
    }, [contactId, reset]);

    const handleSave = createSubmitHandler(async (values) => {
        try {
            // With an id this is an edit: update (API mode reports a missing record as an error instead of
            // silently creating a duplicate). Only the mock store returns null for an unknown id.
            const updated = contactId ? await contactService.update(contactId, values) : null;
            const saved = updated ?? (await contactService.create(values));
            reset(values);
            setSaveFlash({
                listPath: ROUTES.CONTACTS,
                message: `Contact "${values.name}" ${updated ? 'updated' : 'created'} successfully!`,
                severity: 'success',
                recordId: saved?.id,
            });
            router.push(ROUTES.CONTACTS);
        } catch (err: unknown) {
            let message = err instanceof Error ? err.message : 'Failed to save contact.';
            if (err instanceof ApiClientError) {
                // 400 / 409 responses name the offending fields (e.g. an email that can't receive mail): mark them inline.
                const fieldErrors = (err.details?.errors ?? []).filter((e) => e.path?.[0]);
                fieldErrors.forEach((fieldErr) => {
                    methods.setError(fieldErr.path.join('.') as Path<ContactFormData>, { type: 'server', message: fieldErr.message });
                });
                if (fieldErrors.length > 0) message = fieldErrors[0].message || message;
            }
            showToast(message, 'error');
        }
    });

    const handleDiscard = () => {
        router.push(ROUTES.CONTACTS);
    };

    return (
        <FormProvider {...methods}>
            <FormConfigProvider module="contacts">
                <CommonFormLayout
                    loading={recordLoading}
                    isDirty={isDirty}
                    breadcrumbItems={breadcrumbItems || defaultBreadcrumbs}
                    tabs={CONTACT_FORM_TABS}
                    activeTab="overview"
                    onCancel={handleDiscard}
                    onSave={mode === 'view' ? () => router.push(ROUTES.CONTACT_EDIT(contactId!)) : handleSave}
                    submitting={isSubmitting}
                    saveLabel={mode === 'view' ? 'Edit Contact' : mode === 'edit' ? 'Update Contact' : 'Save Contact'}
                    stepwise={stepwise}
                    cancelLabel={mode === 'view' ? 'Back' : 'Cancel'}
                    recordView={{
                        title: contactName || '',
                        code: showNumber('contact') ? recordCode : undefined,
                        editHref: contactId ? ROUTES.CONTACT_EDIT(contactId) : undefined,
                        editLabel: 'Edit Contact',
                        backHref: ROUTES.CONTACTS,
                        audit,
                    }}
                    mode={mode}
                    toast={<AppToast open={toast.open} message={toast.message} severity={toast.severity} onClose={closeToast} />}
                >
                    <SectionLabel icon={<ContactPhoneOutlinedIcon sx={{ fontSize: 18 }} />} label="Contact Details & Association" />
                    <ContactBasicInfoSection mobileNotice={mobileNotice} />

                    <Divider sx={sectionDividerSx} />

                    <SectionLabel icon={<ContactPhoneOutlinedIcon sx={{ fontSize: 18 }} />} label="Alternate Communication Channels" />
                    <ContactPhonesEmailsSection emailNotices={emailNotices} />

                    <Divider sx={sectionDividerSx} />

                    <SectionLabel icon={<BusinessOutlinedIcon sx={{ fontSize: 18 }} />} label="Internal Assignment & Department Role" />
                    <ContactAssignmentSection />

                    <Divider sx={sectionDividerSx} />

                    <SectionLabel icon={<TuneOutlinedIcon sx={{ fontSize: 18 }} />} label="Notes" />
                    <ContactPreferencesSection />
                    <DynamicModuleCustomFields module="contacts" tabKey="overview" sx={{ px: 0, pb: 0, mt: 3.5 }} />
                </CommonFormLayout>
            </FormConfigProvider>
        </FormProvider>
    );
}
