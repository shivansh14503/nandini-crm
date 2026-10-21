'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { FormProvider } from 'react-hook-form';
import { Divider } from '@mui/material';

// Icons
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import ContactPhoneOutlinedIcon from '@mui/icons-material/ContactPhoneOutlined';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';

import { type BreadcrumbItem } from '../common/AppBreadcrumbs';
import { AppToast } from '../common/AppToast';
import { type FormTabDefinition } from '../common/Drawer';
import { ROUTES } from '../../config/constants';
import type { ContactFormData } from '../../types/contact.types';
import { contactService } from '@/services';
import { contactFormSchema } from '../../validations';

import { CommonFormLayout } from '../common/CommonFormLayout';

// Reusable Production-grade Form Primitives
import { SectionLabel, useRhfForm } from '@/components/forms';

// Modular Contact Form Sections
import {
    ContactBasicInfoSection,
    ContactPhonesEmailsSection,
    ContactAssignmentSection,
    ContactPreferencesSection,
} from './sections';

// ─── Single Source of Truth for Contact Form Tabs ──────────────────────────────
export const CONTACT_FORM_TABS: FormTabDefinition[] = [
    {
        id: 'overview',
        label: 'Overview',
        icon: <PersonOutlinedIcon sx={{ fontSize: 18, color: '#2563eb' }} />,
    },
];

export interface ContactFormProps {
    mode?: 'create' | 'edit';
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
    emailAddresses: [
        {
            id: 'email-1',
            email: '',
            isPrimary: true,
            isOptedOut: false,
            isInvalidBounce: false,
        },
    ],
    assignedTo: 'mittal.sharma',
    isPrimaryContact: false,
    designation: '',
    department: '',
    location: '',
    leftJob: 'No',
    communicationType: ['Call', 'Email'],
    doNotCall: false,
    description: '',
};

const sectionDividerSx = { my: 3.5, borderColor: '#f1f5f9' } as const;

export default function ContactForm({
    mode = 'create',
    initialData,
    contactId,
    breadcrumbItems,
}: ContactFormProps) {
    const router = useRouter();

    const { methods, toast, showToast, closeToast, createSubmitHandler } = useRhfForm<ContactFormData>({
        schema: contactFormSchema,
        defaultValues: { ...DEFAULT_FORM, ...initialData },
    });
    const { reset, watch, formState } = methods;
    const { isDirty, isSubmitting } = formState;
    const contactName = watch('name');

    const defaultBreadcrumbs: BreadcrumbItem[] = [
        { label: 'Sales' },
        { label: 'Contacts', href: ROUTES.CONTACTS },
        { label: mode === 'edit' ? (contactName ? `Edit: ${contactName}` : 'Edit Contact') : 'Create Contact' },
    ];

    // Populate data when editing
    useEffect(() => {
        if (!contactId) return;
        let active = true;
        contactService
            .getById(contactId)
            .then((found) => {
                if (active && found) reset({ ...DEFAULT_FORM, ...found });
            })
            .catch(() => {});
        return () => {
            active = false;
        };
    }, [contactId, reset]);

    const handleSave = createSubmitHandler(async (values) => {
        try {
            if (contactId && contactService.getByIdSync(contactId)) {
                await contactService.update(contactId, values);
            } else {
                await contactService.create(values);
            }
            showToast(`Contact "${values.name}" saved successfully!`, 'success');
            reset(values);
            setTimeout(() => router.push(ROUTES.CONTACTS), 700);
        } catch (err: unknown) {
            showToast(err instanceof Error ? err.message : 'Failed to save contact.', 'error');
        }
    });

    const handleDiscard = () => {
        if (isDirty && !window.confirm('Discard unsaved contact changes?')) return;
        router.push(ROUTES.CONTACTS);
    };

    return (
        <FormProvider {...methods}>
            <CommonFormLayout
                breadcrumbItems={breadcrumbItems || defaultBreadcrumbs}
                tabs={CONTACT_FORM_TABS}
                activeTab="overview"
                onCancel={handleDiscard}
                onSave={handleSave}
                submitting={isSubmitting}
                saveLabel={mode === 'edit' ? 'Update Contact' : 'Save Contact'}
                cancelLabel="Cancel"
                toast={<AppToast open={toast.open} message={toast.message} severity={toast.severity} onClose={closeToast} />}
            >
                <SectionLabel icon={<ContactPhoneOutlinedIcon sx={{ fontSize: 18 }} />} label="Contact Details & Association" />
                <ContactBasicInfoSection />

                <Divider sx={sectionDividerSx} />

                <SectionLabel icon={<ContactPhoneOutlinedIcon sx={{ fontSize: 18 }} />} label="Alternate Communication Channels" />
                <ContactPhonesEmailsSection />

                <Divider sx={sectionDividerSx} />

                <SectionLabel icon={<BusinessOutlinedIcon sx={{ fontSize: 18 }} />} label="Internal Assignment & Department Role" />
                <ContactAssignmentSection />

                <Divider sx={sectionDividerSx} />

                <SectionLabel icon={<TuneOutlinedIcon sx={{ fontSize: 18 }} />} label="Communication Preferences & Notes" />
                <ContactPreferencesSection />
            </CommonFormLayout>
        </FormProvider>
    );
}
