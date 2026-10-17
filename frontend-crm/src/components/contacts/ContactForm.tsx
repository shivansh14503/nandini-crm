'use client';

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
    Box,
    Paper,
    Divider,
} from '@mui/material';

// Icons
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import ContactPhoneOutlinedIcon from '@mui/icons-material/ContactPhoneOutlined';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';

import { type BreadcrumbItem } from '../common/AppBreadcrumbs';
import { AppToast } from '../common/AppToast';
import { ROUTES } from '../../config/constants';
import type { CorporateEmail } from '../../types/organization.types';
import type { ContactFormData } from '../../types/contact.types';
import { getStoredOrganizations } from '../../data/mockOrganizations';
import { validateWithToast, contactFormSchema } from '../../validations';

// Reusable Production-grade Form Primitives
import {
    FormHeader,
    FormStickyFooter,
    SectionLabel,
} from '../forms';

// Modular Contact Form Sections
import {
    ContactBasicInfoSection,
    ContactPhonesEmailsSection,
    ContactAssignmentSection,
    ContactPreferencesSection,
} from './sections';

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

export default function ContactForm({
    mode = 'create',
    initialData,
    contactId,
    breadcrumbItems,
}: ContactFormProps) {
    const router = useRouter();

    const [form, setForm] = useState<ContactFormData>({ ...DEFAULT_FORM, ...initialData });
    const [submitting, setSubmitting] = useState(false);
    const [isDirty, setIsDirty] = useState(false);
    const [toast, setToast] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' | 'warning' }>({
        open: false,
        message: '',
        severity: 'success',
    });

    const defaultBreadcrumbs: BreadcrumbItem[] = [
        { label: 'Sales' },
        { label: 'Contacts', href: ROUTES.CONTACTS },
        { label: mode === 'edit' ? (form.name ? `Edit: ${form.name}` : 'Edit Contact') : 'Create Contact' },
    ];

    // Populate data when editing
    useEffect(() => {
        if (initialData && Object.keys(initialData).length > 0) {
            setForm((prev) => ({ ...prev, ...initialData }));
        } else if (contactId) {
            try {
                const STORAGE_KEY = 'nandini_crm_contacts_data_v1';
                const stored = localStorage.getItem(STORAGE_KEY);
                if (stored) {
                    const list = JSON.parse(stored);
                    const found = list.find((c: any) => c.id === contactId);
                    if (found) {
                        setForm((prev) => ({ ...prev, ...found }));
                    }
                }
            } catch {}
        }
    }, [initialData, contactId]);

    // Pre-populate organizations list for LookupField autocomplete
    const organizationNames = useMemo(() => {
        try {
            const orgs = getStoredOrganizations();
            return orgs.map((o) => o.organizationName);
        } catch {
            return [];
        }
    }, []);

    // Field Updater
    const set = useCallback(
        <K extends keyof ContactFormData>(key: K, value: ContactFormData[K]) => {
            setForm((prev) => ({ ...prev, [key]: value }));
            setIsDirty(true);
        },
        []
    );

    // Email Management
    const addEmail = () => {
        const newEmail: CorporateEmail = {
            id: crypto.randomUUID(),
            email: '',
            isPrimary: form.emailAddresses.length === 0,
            isOptedOut: false,
            isInvalidBounce: false,
        };
        set('emailAddresses', [...form.emailAddresses, newEmail]);
    };

    const updateEmail = (id: string, updated: CorporateEmail) => {
        const next = form.emailAddresses.map((e) => {
            if (e.id === id) return updated;
            if (updated.isPrimary) return { ...e, isPrimary: false };
            return e;
        });
        set('emailAddresses', next);
    };

    const removeEmail = (id: string) => {
        const next = form.emailAddresses.filter((e) => e.id !== id);
        if (next.length > 0 && !next.some((e) => e.isPrimary)) {
            next[0].isPrimary = true;
        }
        set('emailAddresses', next);
    };

    // Communication Type Toggle
    const toggleCommunicationType = (type: string) => {
        const current = form.communicationType || [];
        if (current.includes(type)) {
            set('communicationType', current.filter((t) => t !== type));
        } else {
            set('communicationType', [...current, type]);
        }
    };

    // Discard Handler
    const handleDiscard = () => {
        if (isDirty && !window.confirm('Discard unsaved contact changes?')) return;
        router.push(ROUTES.CONTACTS);
    };

    // Submit Handler with Zod Validation
    const handleSubmit = async (redirectAfter = true) => {
        const validation = validateWithToast(contactFormSchema, form);
        if (!validation.success) {
            setToast({
                open: true,
                message: validation.error,
                severity: 'error',
            });
            return;
        }

        setSubmitting(true);
        try {
            const STORAGE_KEY = 'nandini_crm_contacts_data_v1';
            let existingContacts = [];
            try {
                const stored = localStorage.getItem(STORAGE_KEY);
                if (stored) existingContacts = JSON.parse(stored);
            } catch {
                existingContacts = [];
            }

            const newContact = {
                id: contactId || `contact-${Date.now()}`,
                contactCode: `CON-${Math.floor(1000 + Math.random() * 9000)}`,
                ...form,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                createdBy: form.assignedTo || 'mittal.sharma',
            };

            let updatedList;
            const existingIndex = existingContacts.findIndex((c: any) => c.id === contactId);
            if (existingIndex >= 0) {
                updatedList = [...existingContacts];
                updatedList[existingIndex] = {
                    ...existingContacts[existingIndex],
                    ...form,
                    updatedAt: new Date().toISOString(),
                };
            } else {
                updatedList = [newContact, ...existingContacts];
            }
            localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedList));

            setToast({
                open: true,
                message: `Contact "${form.name}" saved successfully!`,
                severity: 'success',
            });
            setIsDirty(false);

            if (redirectAfter) {
                setTimeout(() => {
                    router.push(ROUTES.CONTACTS);
                }, 700);
            } else {
                setForm(DEFAULT_FORM);
            }
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to save contact.';
            setToast({
                open: true,
                message,
                severity: 'error',
            });
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Box sx={{ pb: 8 }}>
            {/* ── Top Header & Actions with Permanent Breadcrumbs ─────────────── */}
            <FormHeader
                breadcrumbItems={breadcrumbItems || defaultBreadcrumbs}
                onDiscard={handleDiscard}
                submitting={submitting}
                discardLabel="Discard"
            />

            {/* ── Main Form Card with Tabs ──────────────────────────────────── */}
            <Paper
                elevation={0}
                sx={{
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    backgroundColor: '#fff',
                }}
            >
                {/* ── Tab Header Bar ─────────────────────────────────────────── */}
                <Box
                    sx={{
                        backgroundColor: '#f8fafc',
                        borderBottom: '1px solid #e2e8f0',
                        px: 2,
                        py: 1,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                    }}
                >
                    <Box
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                            px: 2,
                            py: 1,
                            borderRadius: '8px',
                            backgroundColor: '#ffffff',
                            border: '1px solid #d1d5db',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                            color: '#1e3a8a',
                            fontWeight: 700,
                            fontSize: '0.84rem',
                        }}
                    >
                        <PersonOutlinedIcon sx={{ fontSize: 18, color: '#2563eb' }} />
                        OVERVIEW
                    </Box>
                </Box>

                {/* ── Form Content ───────────────────────────────────────────── */}
                <Box sx={{ p: { xs: 2.5, md: 3.5 } }}>
                    {/* Section 1: Basic Identity & Account */}
                    <SectionLabel
                        icon={<ContactPhoneOutlinedIcon sx={{ fontSize: 18 }} />}
                        label="Contact Details & Association"
                    />
                    <ContactBasicInfoSection
                        name={form.name}
                        organizationName={form.organizationName}
                        mobile={form.mobile}
                        officePhone={form.officePhone}
                        organizationNames={organizationNames}
                        onNameChange={(v) => set('name', v)}
                        onOrganizationChange={(v) => set('organizationName', v)}
                        onMobileChange={(v) => set('mobile', v)}
                        onOfficePhoneChange={(v) => set('officePhone', v)}
                    />

                    <Divider sx={{ my: 3.5, borderColor: '#f1f5f9' }} />

                    {/* Section 2: Extended Contact Numbers & Verified Emails */}
                    <SectionLabel
                        icon={<ContactPhoneOutlinedIcon sx={{ fontSize: 18 }} />}
                        label="Alternate Communication Channels"
                    />
                    <ContactPhonesEmailsSection
                        phone3={form.phone3}
                        phone4={form.phone4}
                        phone5={form.phone5}
                        emailAddresses={form.emailAddresses}
                        onPhone3Change={(v) => set('phone3', v)}
                        onPhone4Change={(v) => set('phone4', v)}
                        onPhone5Change={(v) => set('phone5', v)}
                        onAddEmail={addEmail}
                        onUpdateEmail={updateEmail}
                        onRemoveEmail={removeEmail}
                    />

                    <Divider sx={{ my: 3.5, borderColor: '#f1f5f9' }} />

                    {/* Section 3: Internal Assignment & Role */}
                    <SectionLabel
                        icon={<BusinessOutlinedIcon sx={{ fontSize: 18 }} />}
                        label="Internal Assignment & Department Role"
                    />
                    <ContactAssignmentSection
                        assignedTo={form.assignedTo}
                        isPrimaryContact={form.isPrimaryContact}
                        designation={form.designation}
                        department={form.department}
                        location={form.location}
                        leftJob={form.leftJob}
                        onAssignedToChange={(v) => set('assignedTo', v)}
                        onPrimaryContactChange={(c) => set('isPrimaryContact', c)}
                        onDesignationChange={(v) => set('designation', v)}
                        onDepartmentChange={(v) => set('department', v)}
                        onLocationChange={(v) => set('location', v)}
                        onLeftJobChange={(v) => set('leftJob', v)}
                    />

                    <Divider sx={{ my: 3.5, borderColor: '#f1f5f9' }} />

                    {/* Section 4: Preferences, Compliance (DND) & Notes */}
                    <SectionLabel
                        icon={<TuneOutlinedIcon sx={{ fontSize: 18 }} />}
                        label="Communication Preferences & Notes"
                    />
                    <ContactPreferencesSection
                        communicationType={form.communicationType}
                        doNotCall={form.doNotCall}
                        description={form.description}
                        onToggleCommunicationType={toggleCommunicationType}
                        onDoNotCallChange={(c) => set('doNotCall', c)}
                        onDescriptionChange={(v) => set('description', v)}
                    />
                </Box>
            </Paper>

            {/* ── Bottom Sticky Action Bar ──────────────────────────────────── */}
            <FormStickyFooter
                onCancel={handleDiscard}
                onSave={() => handleSubmit(true)}
                submitting={submitting}
                saveLabel="Save Contact"
                cancelLabel="Cancel"
            />

            {/* ── Consistent Top-Right Toast Notification ─────────────────────── */}
            <AppToast
                open={toast.open}
                message={toast.message}
                severity={toast.severity}
                onClose={() => setToast((t) => ({ ...t, open: false }))}
            />
        </Box>
    );
}
