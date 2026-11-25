'use client';

import { NO_PAST_DATES } from '@/utils/pastDates';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FormProvider, useWatch } from 'react-hook-form';
import { Divider } from '@mui/material';
import HistoryEduOutlinedIcon from '@mui/icons-material/HistoryEduOutlined';
import EventRepeatOutlinedIcon from '@mui/icons-material/EventRepeatOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';

import { type BreadcrumbItem } from '../common/AppBreadcrumbs';
import { type FormTabDefinition } from '../common/Drawer';
import type { RecordAuditStamp } from '../common/Drawer/RecordAuditFooter';
import { ROUTES } from '@/config/constants';
import { setSaveFlash } from '@/utils/saveFlash';
import { opportunityLabel } from '@/utils/opportunityLabel';
import { contractFormSchema } from '@/validations';
import {
    CONTRACT_PERIODS,
    CONTRACT_STATUSES,
    CONTRACT_TITLES,
    CONTRACT_TYPES,
    contractPeriodMonths,
    type ContractFormData,
} from '@/types/contract.types';
import type { ExtendedOrganization } from '@/types/organization.types';
import type { Contact } from '@/types/contact.types';
import type { Opportunity } from '@/types/opportunity.types';
import { contractService } from '@/services';
import { useContacts, useOpportunities, useOrganizations } from '@/hooks/queries';
import {
    CommonFormLayout,
    AppToast,
    FIELD_MAX_LENGTH,
    FormGrid,
    FormGridItem,
    SectionLabel,
    RhfTextField,
    RhfSelect,
    RhfLookup,
    RhfAmountField,
    RhfAssignedUserCard,
    RhfDateTimeField,
    RhfMultiAutocomplete,
    useRhfForm,
} from '@/components/forms';
import { FormConfigProvider } from '@/context/FormConfigContext';
import { DynamicModuleCustomFields } from '@/components/forms/DynamicModuleCustomFields';
import { useShowRecordNumber } from '@/hooks/queries/useDocumentSeries';
import { autoFilledTerm, contractEndDate, newContractTerm, renewalReminderFor, type AutoFilledTerm } from './contractDates';

// ─── Single Source of Truth for Contract Form Tabs ────────────────────────────
export const CONTRACT_FORM_TABS: (FormTabDefinition & { id: 'overview' })[] = [
    {
        id: 'overview',
        label: 'OVERVIEW',
        icon: <HistoryEduOutlinedIcon sx={{ fontSize: 18 }} />,
    },
];

/** A blank contract. New records also get today's term (see `newContractTerm`), worked out when the form opens. */
export const DEFAULT_CONTRACT_FORM: ContractFormData = {
    contractTitle: '',
    status: 'Not Started',
    contractValue: '',
    assignedTo: '',
    organizationName: '',
    organizationId: '',
    contact: '',
    contactId: '',
    opportunity: '',
    opportunityId: '',
    tallySerialNo: '',
    startDate: '',
    endDate: '',
    contractPeriod: '',
    renewalReminderDate: '',
    contractType: [],
    billNumber: '',
    billDate: '',
    billAmount: '',
    description: '',
};

/** The record id each lookup's name is linked to. */
const LINKED_ID_FIELDS: Readonly<Record<string, 'organizationId' | 'contactId' | 'opportunityId'>> = {
    organizationName: 'organizationId',
    contact: 'contactId',
    opportunity: 'opportunityId',
};

interface OrganizationRef {
    id?: string;
    name: string;
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Whether a contact / opportunity is on file under `org`: by id when both have one, else by name. */
const inOrganization = (record: { organizationId?: string; organizationName: string }, org: OrganizationRef) =>
    record.organizationId && org.id ? record.organizationId === org.id : sameName(record.organizationName, org.name);

/** True when every record the field could mean sits under another organization (records without one never do). */
const allOutside = (records: { organizationId?: string; organizationName: string }[], org: OrganizationRef) =>
    records.length > 0 && records.every((r) => Boolean(r.organizationName) && !inOrganization(r, org));

/** `items` narrowed to the chosen organization's when it has any, else all of them (as tickets do for contacts). */
function narrowToOrganization<T extends { organizationId?: string; organizationName: string }>(items: T[], org: OrganizationRef): T[] {
    const inOrg = org.name.trim() ? items.filter((i) => inOrganization(i, org)) : [];
    return inOrg.length > 0 ? inOrg : items;
}

const uniqueNames = (names: string[]) => Array.from(new Set(names.filter((n) => n.trim())));

export interface ContractFormProps {
    mode?: 'create' | 'edit' | 'view';
    contractId?: string;
    initialData?: Partial<ContractFormData>;
}

// Stable fallbacks while the lists load, so memoized suggestions don't recompute every render.
const EMPTY_ORGANIZATIONS: ExtendedOrganization[] = [];
const EMPTY_CONTACTS: Contact[] = [];
const EMPTY_OPPORTUNITIES: Opportunity[] = [];

export default function ContractForm({ mode = 'create', contractId, initialData }: ContractFormProps) {
    const router = useRouter();
    const [contractNumber, setContractNumber] = useState('');
    const showNumber = useShowRecordNumber();
    const [audit, setAudit] = useState<RecordAuditStamp>();

    // Read once, like the form's own defaults: a new contract starts today and runs a year.
    const [initial] = useState(() => {
        const values: ContractFormData = { ...DEFAULT_CONTRACT_FORM, ...(mode === 'create' ? newContractTerm() : {}), ...initialData };
        return { values, filled: autoFilledTerm(values) };
    });
    // End Date / Reminder values the form filled in: each follows later changes only while it still holds that value.
    const filledTerm = useRef<AutoFilledTerm>(initial.filled);

    const { methods, toast, showToast, closeToast, createSubmitHandler, stepwise } = useRhfForm<ContractFormData>({
        schema: contractFormSchema,
        noPastDates: NO_PAST_DATES.contract,
        module: 'contracts',
        defaultValues: initial.values,
        dropdownDefaults: { enabled: mode === 'create', keep: initialData },
        assigneeField: 'assignedTo',
    });

    const { reset, getValues, setValue, getFieldState, trigger, watch, control, formState } = methods;
    const { isDirty, isSubmitting } = formState;
    const contractTitle = useWatch({ control, name: 'contractTitle' });
    const organizationName = useWatch({ control, name: 'organizationName' });
    const organizationId = useWatch({ control, name: 'organizationId' });

    const { data: organizations = EMPTY_ORGANIZATIONS } = useOrganizations();
    const { data: contacts = EMPTY_CONTACTS } = useContacts();
    const { data: opportunities = EMPTY_OPPORTUNITIES } = useOpportunities();
    const organizationNames = useMemo(() => uniqueNames(organizations.map((o) => o.organizationName)), [organizations]);

    // Contact suggestions narrow to the chosen organization's contacts when it has any.
    const contactNames = useMemo(
        () => uniqueNames(narrowToOrganization(contacts, { id: organizationId, name: organizationName ?? '' }).map((c) => c.name)),
        [contacts, organizationId, organizationName]
    );
    // Opportunity suggestions and picker open on the chosen organization's opportunities.
    const opportunityFilters = useMemo(() => (organizationName?.trim() ? { organizationName } : undefined), [organizationName]);

    const shownContractNumber = showNumber('contract') ? contractNumber : '';
    const defaultBreadcrumbs: BreadcrumbItem[] = [
        { label: 'Support' },
        { label: 'Contracts', href: ROUTES.CONTRACTS },
        {
            label: mode === 'create' ? 'Create Contract' : `${mode === 'view' ? 'View' : 'Edit'}: ${contractTitle || shownContractNumber || 'Contract'}`,
        },
    ];

    // True until the saved record arrives (view / edit), so the form shows skeleton fields, not empty ones.
    const [recordLoading, setRecordLoading] = useState(Boolean(contractId));
    useEffect(() => {
        if (!contractId) return;
        let active = true;
        contractService
            .getById(contractId)
            .then((found) => {
                if (active && found) {
                    const values = { ...DEFAULT_CONTRACT_FORM, ...found };
                    setContractNumber(found.contractNumber);
                    setAudit({ createdAt: found.createdAt, createdBy: found.createdBy, updatedAt: found.updatedAt, updatedBy: found.updatedBy });
                    filledTerm.current = autoFilledTerm(values);
                    reset(values);
                }
            })
            .catch(() => {})
            .finally(() => {
                if (active) setRecordLoading(false);
            });
        return () => {
            active = false;
        };
    }, [contractId, reset]);

    // Typing another name into a lookup unlinks its record, so the API resolves the new name instead of keeping
    // the old link. Only the user's edits ('change' events) count: picking a record (from the list or by an exact
    // match) links it again right after via onSelectRecord, and the form's own setValue calls never unlink.
    useEffect(() => {
        const { unsubscribe } = watch((_values, { name, type }) => {
            const idField = name ? LINKED_ID_FIELDS[name] : undefined;
            if (type === 'change' && idField && getValues(idField)) setValue(idField, '', { shouldDirty: true });
        });
        return unsubscribe;
    }, [watch, getValues, setValue]);

    const touch = { shouldDirty: true, shouldValidate: true } as const;
    const dirty = { shouldDirty: true } as const;

    // ── Term: Start Date / Period → End Date → Renewal Reminder ─────────────
    // The reminder follows a new End Date while it still holds the value the form filled in.
    const followEndDate = (endDate: string) => {
        if (getValues('renewalReminderDate') !== filledTerm.current.renewalReminderDate) return;
        const reminder = renewalReminderFor(endDate);
        setValue('renewalReminderDate', reminder, touch);
        filledTerm.current.renewalReminderDate = reminder;
    };

    const fillEndDate = (endDate: string) => {
        setValue('endDate', endDate, touch);
        filledTerm.current.endDate = endDate;
        followEndDate(endDate);
    };

    const handleStartDateChange = (startDate: string) => {
        if (startDate && getValues('endDate') === filledTerm.current.endDate) {
            fillEndDate(contractEndDate(startDate, getValues('contractPeriod')));
        } else if (getFieldState('endDate').error) {
            // "End Date cannot be before the Start Date" may no longer hold.
            void trigger('endDate');
        }
    };

    // Picking a period with a length (1 Year, 13 Months…) always sets the End Date from the Start Date.
    const handlePeriodChange = (period: string) => {
        const startDate = getValues('startDate');
        if (startDate && contractPeriodMonths(period) !== null) fillEndDate(contractEndDate(startDate, period));
    };

    // ── Organization / contact / opportunity links ──────────────────────────
    const clearContact = () => {
        setValue('contact', '', dirty);
        setValue('contactId', '', dirty);
    };

    const clearOpportunity = () => {
        setValue('opportunity', '', dirty);
        setValue('opportunityId', '', dirty);
    };

    /** Every contact the field could mean: the linked one, else each contact of that name. */
    const currentContacts = (): Contact[] => {
        const id = getValues('contactId');
        const name = getValues('contact')?.trim() ?? '';
        if (id) return contacts.filter((c) => c.id === id);
        return name ? contacts.filter((c) => sameName(c.name, name)) : [];
    };

    const currentOpportunities = (): Opportunity[] => {
        const id = getValues('opportunityId');
        const label = getValues('opportunity')?.trim() ?? '';
        if (id) return opportunities.filter((o) => o.id === id);
        return label ? opportunities.filter((o) => sameName(opportunityLabel(o), label)) : [];
    };

    /** After the organization changed: a contact or opportunity on file under another organization no longer applies. */
    const dropRecordsOutside = (org: OrganizationRef) => {
        if (allOutside(currentContacts(), org)) clearContact();
        if (allOutside(currentOpportunities(), org)) clearOpportunity();
    };

    const handleOrganizationPicked = (org: ExtendedOrganization) => {
        setValue('organizationId', org.id, dirty);
        dropRecordsOutside({ id: org.id, name: org.organizationName });
    };

    const handleOrganizationCleared = () => {
        setValue('organizationId', '', dirty);
        clearContact();
        clearOpportunity();
    };

    const handleContactPicked = (contact: Contact) => {
        setValue('contactId', contact.id, dirty);
        if (!contact.organizationName) return;
        setValue('organizationName', contact.organizationName, touch);
        setValue('organizationId', contact.organizationId ?? '', dirty);
        dropRecordsOutside({ id: contact.organizationId, name: contact.organizationName });
    };

    // The opportunity brings its organization, contact and (when blank here) Tally serial number.
    const handleOpportunityPicked = (opportunity: Opportunity) => {
        setValue('opportunity', opportunityLabel(opportunity), touch);
        setValue('opportunityId', opportunity.id, dirty);
        if (opportunity.contact) {
            setValue('contact', opportunity.contact, touch);
            setValue('contactId', opportunity.contactId ?? '', dirty);
        }
        if (opportunity.organizationName) {
            setValue('organizationName', opportunity.organizationName, touch);
            setValue('organizationId', opportunity.organizationId ?? '', dirty);
            dropRecordsOutside({ id: opportunity.organizationId, name: opportunity.organizationName });
        }
        if (!getValues('tallySerialNo')?.trim() && opportunity.tallySerialNo) setValue('tallySerialNo', opportunity.tallySerialNo, touch);
    };

    const submit = createSubmitHandler(async (values) => {
        try {
            let saved: { id: string } | undefined;
            let message = '';
            if (mode === 'create') {
                const created = await contractService.create(values);
                saved = created;
                message = showNumber('contract') ? `Contract ${created.contractNumber} created successfully!` : 'Contract created successfully!';
            } else if (contractId) {
                saved = await contractService.update(contractId, values);
                message = 'Contract updated successfully!';
            }
            reset(values);
            if (message) setSaveFlash({ listPath: ROUTES.CONTRACTS, message, severity: 'success', recordId: saved?.id ?? contractId });
            router.push(ROUTES.CONTRACTS);
        } catch (err: unknown) {
            showToast(err instanceof Error ? err.message : 'Failed to save contract.', 'error');
        }
    });

    const handleDiscard = () => {
        router.push(ROUTES.CONTRACTS);
    };

    return (
        <FormProvider {...methods}>
            <FormConfigProvider module="contracts">
                <CommonFormLayout
                    loading={recordLoading}
                    isDirty={isDirty}
                    breadcrumbItems={defaultBreadcrumbs}
                    tabs={CONTRACT_FORM_TABS}
                    activeTab="overview"
                    onCancel={handleDiscard}
                    onSave={mode === 'view' ? () => router.push(ROUTES.CONTRACT_EDIT(contractId!)) : submit}
                    submitting={isSubmitting}
                    saveLabel={mode === 'view' ? 'Edit Contract' : mode === 'edit' ? 'Update Contract' : 'Save Contract'}
                    stepwise={stepwise}
                    cancelLabel={mode === 'view' ? 'Back' : 'Cancel'}
                    recordView={{
                        title: contractTitle || shownContractNumber || '',
                        code: shownContractNumber || undefined,
                        subtitle: organizationName || undefined,
                        avatarIcon: <HistoryEduOutlinedIcon sx={{ fontSize: 28 }} />,
                        editHref: contractId ? ROUTES.CONTRACT_EDIT(contractId) : undefined,
                        editLabel: 'Edit Contract',
                        backHref: ROUTES.CONTRACTS,
                        audit,
                    }}
                    mode={mode}
                    toast={<AppToast open={toast.open} message={toast.message} severity={toast.severity} onClose={closeToast} />}
                >
                    {/* ── Contract Details ── */}
                    <SectionLabel icon={<HistoryEduOutlinedIcon sx={{ fontSize: 18 }} />} label="Contract Details" />
                    <FormGrid columns={3} sx={{ mt: 1 }}>
                        <RhfSelect<ContractFormData>
                            name="contractTitle"
                            label="Contract Title"
                            required
                            options={CONTRACT_TITLES}
                            placeholder="Select Contract Title"
                        />
                        <RhfSelect<ContractFormData> name="status" label="Status" required options={[...CONTRACT_STATUSES]} placeholder="Select Status" />
                        <RhfAmountField<ContractFormData> name="contractValue" label="Contract Value" hint="Total contract amount (₹)" />
                        <RhfAssignedUserCard<ContractFormData> name="assignedTo" label="Contract Manager" required roleBadge="" />
                        <RhfLookup<ContractFormData, 'organization'>
                            name="organizationName"
                            label="Organization Name"
                            required
                            options={organizationNames}
                            lookupType="organization"
                            onSelectRecord={handleOrganizationPicked}
                            onClearRecord={handleOrganizationCleared}
                            placeholder="Search or select organization..."
                        />
                        <RhfLookup<ContractFormData, 'contact'>
                            name="contact"
                            label="Contact Person"
                            required
                            options={contactNames}
                            lookupType="contact"
                            onSelectRecord={handleContactPicked}
                            onClearRecord={() => setValue('contactId', '', dirty)}
                            placeholder="Search or select contact..."
                        />
                        <RhfLookup<ContractFormData, 'opportunity'>
                            name="opportunity"
                            label="Opportunity"
                            lookupType="opportunity"
                            lookupFilters={opportunityFilters}
                            onSelectRecord={handleOpportunityPicked}
                            onClearRecord={() => setValue('opportunityId', '', dirty)}
                            hint="Fills the organization and contact"
                            placeholder="Search or select opportunity..."
                        />
                        <RhfTextField<ContractFormData>
                            name="tallySerialNo"
                            label="Tally Serial Number"
                            hint="9 digits, starts with 7"
                            placeholder="e.g. 765432109"
                            numericOnly
                            maxLength={FIELD_MAX_LENGTH.tallySerialNo}
                            fieldSize="sm"
                        />
                    </FormGrid>

                    <Divider sx={{ my: 3.5, borderColor: 'var(--mui-palette-border-light)' }} />

                    {/* ── Term & Renewal ── */}
                    <SectionLabel icon={<EventRepeatOutlinedIcon sx={{ fontSize: 18 }} />} label="Term & Renewal" />
                    <FormGrid columns={3} sx={{ mt: 1 }}>
                        <RhfTextField<ContractFormData>
                            name="startDate"
                            label="Contract Start Date"
                            type="date"
                            onChange={(e) => handleStartDateChange(e.target.value)}
                        />
                        <RhfTextField<ContractFormData>
                            name="endDate"
                            label="Contract End Date"
                            type="date"
                            hint="Start Date + Contract Period"
                            onChange={(e) => followEndDate(e.target.value)}
                        />
                        <RhfSelect<ContractFormData>
                            name="contractPeriod"
                            label="Contract Period"
                            options={CONTRACT_PERIODS}
                            placeholder="Select Period"
                            hint="Sets the End Date"
                            onValueChange={handlePeriodChange}
                        />
                        <RhfDateTimeField<ContractFormData>
                            dateName="renewalReminderDate"
                            label="Renewal Reminder Date"
                            combined
                            hint="15 days before the End Date"
                        />
                        <RhfMultiAutocomplete<ContractFormData>
                            name="contractType"
                            label="Contract Type"
                            options={CONTRACT_TYPES}
                            placeholder="Select contract types..."
                            size="lg"
                        />
                    </FormGrid>

                    <Divider sx={{ my: 3.5, borderColor: 'var(--mui-palette-border-light)' }} />

                    {/* ── Billing ── */}
                    <SectionLabel icon={<ReceiptLongOutlinedIcon sx={{ fontSize: 18 }} />} label="Billing" />
                    <FormGrid columns={3} sx={{ mt: 1 }}>
                        <RhfTextField<ContractFormData>
                            name="billNumber"
                            label="Bill Number"
                            placeholder="e.g. INV-2026-0982"
                            maxLength={FIELD_MAX_LENGTH.shortCode}
                            fieldSize="sm"
                        />
                        <RhfTextField<ContractFormData> name="billDate" label="Bill Date" type="date" />
                        <RhfAmountField<ContractFormData> name="billAmount" label="Bill Amount" />
                        <FormGridItem span="full">
                            <RhfTextField<ContractFormData>
                                name="description"
                                label="Description"
                                multiline
                                minRows={3}
                                maxLength={FIELD_MAX_LENGTH.longText}
                                placeholder="Scope, visits included, special terms..."
                            />
                        </FormGridItem>
                    </FormGrid>
                    <DynamicModuleCustomFields module="contracts" tabKey="overview" sx={{ px: 0, pb: 0, mt: 3.5 }} />
                </CommonFormLayout>
            </FormConfigProvider>
        </FormProvider>
    );
}
