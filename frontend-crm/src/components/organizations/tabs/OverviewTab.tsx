'use client';

import React from 'react';
import {
    Box,
    Typography,
    TextField,
    Button,
    Chip,
    Switch,
    FormControl,
    Select,
    MenuItem,
    InputAdornment,
    IconButton,
    Avatar,
} from '@mui/material';
import { CommonActionModal } from '@/components/common/CommonActionModal';

// Icons
import AddIcon from '@mui/icons-material/Add';
import EmailIcon from '@mui/icons-material/Email';
import VerifiedIcon from '@mui/icons-material/Verified';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import SearchIcon from '@mui/icons-material/Search';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import ContactPageOutlinedIcon from '@mui/icons-material/ContactPageOutlined';

import { useFormContext, useWatch, FormProvider, useForm } from 'react-hook-form';

import {
    FormField,
    SectionLabel,
    StyledSelect,
    EmailRow,
    fieldSx,
    RhfSelect,
} from '@/components/forms';
import {
    NATURE_OF_BUSINESS,
    ACCOUNT_STATUSES,
    ENTITY_TYPES,
    CUSTOMER_TYPES,
    ANNUAL_TURNOVERS,
    EMPLOYEE_COUNTS,
    LEAD_SOURCES,
} from '../constants';

import type {
    OrganizationFormData,
    CorporateEmail,
    NatureOfBusiness,
    AccountStatus,
    TypeOfEntity,
    CustomerType,
    AnnualTurnover,
    NumberOfEmployees,
    SourceOfLead,
} from '@/types/organization.types';

const INACTIVITY_REASONS = [
    'Client Closed Operations',
    'Non-Payment / Dispute',
    'Shifted to Competitor',
    'Duplicate Account',
    'Temporary Pause',
    'Other',
];

export interface OverviewTabProps {
    form: OrganizationFormData;
    set: <K extends keyof OrganizationFormData>(key: K, value: OrganizationFormData[K]) => void;
    addEmail?: () => void;
    updateEmail?: (id: string, updated: CorporateEmail) => void;
    removeEmail?: (id: string) => void;
}

function OverviewTabInner({
    form,
    set,
    addEmail,
    updateEmail,
    removeEmail,
}: OverviewTabProps) {
    const { control, setValue, getValues, formState } = useFormContext<OrganizationFormData>();

    const organizationName = useWatch({ control, name: 'organizationName' }) ?? form?.organizationName ?? '';
    const mailingName = useWatch({ control, name: 'mailingName' }) ?? form?.mailingName ?? '';
    const currentAccountStatus = (useWatch({ control, name: 'accountStatus' }) ?? form?.accountStatus ?? 'Active') as AccountStatus;
    const [pendingInactive, setPendingInactive] = React.useState(false);
    const watchedNatureOfBusiness = useWatch({ control, name: 'natureOfBusiness' });
    const watchedTypeOfEntity = useWatch({ control, name: 'typeOfEntity' });
    const watchedCustomerType = useWatch({ control, name: 'customerType' });

    // Sync RHF values with external set callback if provided
    React.useEffect(() => {
        if (set && watchedNatureOfBusiness !== undefined && watchedNatureOfBusiness !== form?.natureOfBusiness) {
            set('natureOfBusiness', watchedNatureOfBusiness as NatureOfBusiness);
        }
    }, [watchedNatureOfBusiness, set, form?.natureOfBusiness]);

    React.useEffect(() => {
        if (set && watchedTypeOfEntity !== undefined && watchedTypeOfEntity !== form?.typeOfEntity) {
            set('typeOfEntity', watchedTypeOfEntity as TypeOfEntity);
        }
    }, [watchedTypeOfEntity, set, form?.typeOfEntity]);

    React.useEffect(() => {
        if (set && watchedCustomerType !== undefined && watchedCustomerType !== form?.customerType) {
            set('customerType', watchedCustomerType as CustomerType);
        }
    }, [watchedCustomerType, set, form?.customerType]);

    // Auto-copy Mailing Name when organizationName changes and mailingName is untouched or empty
    const prevOrgNameRef = React.useRef(organizationName);

    React.useEffect(() => {
        if (organizationName === prevOrgNameRef.current) return;
        prevOrgNameRef.current = organizationName;

        const currentMailing = getValues('mailingName');
        const isTouched = formState.touchedFields?.mailingName;

        if (!isTouched || !currentMailing || currentMailing.trim() === '') {
            setValue('mailingName', organizationName || '', { shouldValidate: true });
            if (set) {
                set('mailingName', organizationName || '');
            }
        }
    }, [organizationName, getValues, setValue, formState.touchedFields?.mailingName, set]);

    const handleOrgNameChange = (val: string) => {
        setValue('organizationName', val, { shouldValidate: true, shouldDirty: true });
        if (set) set('organizationName', val);

        const currentMailing = getValues('mailingName');
        const isTouched = formState.touchedFields?.mailingName;
        if (!isTouched || !currentMailing || currentMailing.trim() === '') {
            setValue('mailingName', val, { shouldValidate: true });
            if (set) set('mailingName', val);
        }
    };
    return (
        <Box sx={{ p: { xs: 2.5, md: 3.5 } }}>
            {/* ── Two-column grid ───────────────────────────────── */}
            <Box
                sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                    gap: 3.5,
                }}
            >
                {/* ── LEFT COLUMN ──────────────────────────────────── */}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                    {/* Organization Name */}
                    <FormField
                        name="organizationName"
                        label="Organization Name"
                        required
                        hint="As per official registration"
                        sx={{ mb: 0 }}
                    >
                        <TextField
                            fullWidth
                            size="small"
                            placeholder="e.g. Mohit Traders Pvt Ltd"
                            value={organizationName}
                            onChange={(e) => handleOrgNameChange(e.target.value)}
                            sx={fieldSx}
                            slotProps={{
                                input: {
                                    endAdornment: organizationName ? (
                                        <InputAdornment position="end">
                                            <VerifiedIcon sx={{ fontSize: 18, color: '#16a34a' }} />
                                        </InputAdornment>
                                    ) : undefined,
                                },
                                htmlInput: { maxLength: 200 },
                            }}
                        />
                    </FormField>

                    {/* Nature of Business */}
                    <RhfSelect<OrganizationFormData>
                        name="natureOfBusiness"
                        label="Nature of Business"
                        placeholder="Select Nature of Business"
                        options={NATURE_OF_BUSINESS}
                        required
                    />

                    {/* Account Status */}
                    <FormField
                        name="accountStatus"
                        label="Account Status"
                        hint={
                            (currentAccountStatus || 'Active') === 'Active' ? (
                                <Chip
                                    label="● Active Commercial"
                                    size="small"
                                    sx={{
                                        fontSize: '0.7rem',
                                        height: 20,
                                        backgroundColor: '#dcfce7',
                                        color: '#16a34a',
                                        fontWeight: 700,
                                    }}
                                />
                            ) : undefined
                        }
                        sx={{ mb: 0 }}
                    >
                        <StyledSelect
                            label="Account Status"
                            placeholder="Select Account Status"
                            value={currentAccountStatus || 'Active'}
                            onChange={(v) => {
                                const val = v as AccountStatus;
                                if (val === 'Inactive' && currentAccountStatus !== 'Inactive') {
                                    // Defer the change until a reason is collected.
                                    setPendingInactive(true);
                                    return;
                                }
                                setValue('accountStatus', val, { shouldValidate: true, shouldDirty: true });
                                if (set) set('accountStatus', val);
                                if (val === 'Active') {
                                    setValue('inactivityReason', '', { shouldDirty: true });
                                    if (set) set('inactivityReason', '');
                                }
                            }}
                            options={ACCOUNT_STATUSES}
                        />
                        <CommonActionModal
                            open={pendingInactive}
                            title="Reason for Inactivity"
                            description="Setting this organization to Inactive will lock the record for non-admin users."
                            reasonLabel="Reason"
                            reasonPlaceholder="Why is this organization being deactivated?"
                            presetReasons={INACTIVITY_REASONS}
                            confirmLabel="Deactivate Organization"
                            confirmColor="warning"
                            onConfirm={(reason) => {
                                setValue('accountStatus', 'Inactive', { shouldValidate: true, shouldDirty: true });
                                setValue('inactivityReason', reason, { shouldDirty: true });
                                if (set) {
                                    set('accountStatus', 'Inactive');
                                    set('inactivityReason', reason);
                                }
                                setPendingInactive(false);
                            }}
                            onClose={() => setPendingInactive(false)}
                        />
                    </FormField>

                    {/* SAP Code / Tally ID */}
                    <FormField
                        name="sapCodeTallyId"
                        label="SAP Code / Tally ID"
                        hint="ERP Master Ledger Code"
                        sx={{ mb: 0 }}
                    >
                        <TextField
                            fullWidth
                            size="small"
                            placeholder="e.g. SAP-ND-4891"
                            value={form.sapCodeTallyId}
                            onChange={(e) => set('sapCodeTallyId', e.target.value)}
                            sx={fieldSx}
                            slotProps={{
                                input: {
                                    endAdornment: (
                                        <InputAdornment position="end">
                                            <SwapHorizIcon sx={{ fontSize: 18, color: '#94a3b8' }} />
                                        </InputAdornment>
                                    ),
                                },
                            }}
                        />
                    </FormField>

                    {/* Source of Lead */}
                    <FormField name="sourceOfLead" label="Source of Lead" sx={{ mb: 0 }}>
                        <StyledSelect
                            label="Source of Lead"
                            placeholder="Select Source of Lead"
                            value={form.sourceOfLead}
                            onChange={(v) => set('sourceOfLead', v as SourceOfLead)}
                            options={LEAD_SOURCES}
                        />
                    </FormField>

                    {/* Corporate Emails */}
                    <Box>
                        <Box
                            sx={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                mb: 1.5,
                            }}
                        >
                            <SectionLabel
                                icon={<EmailIcon sx={{ fontSize: 18 }} />}
                                label="Corporate Email Addresses"
                            />
                            {addEmail && (
                                <Button
                                    size="small"
                                    startIcon={<AddIcon fontSize="small" />}
                                    onClick={addEmail}
                                    sx={{
                                        fontSize: '0.78rem',
                                        textTransform: 'none',
                                        fontWeight: 600,
                                        color: '#2563EB',
                                        border: '1px dashed #93c5fd',
                                        borderRadius: '6px',
                                        px: 1.5,
                                        py: 0.4,
                                        '&:hover': {
                                            backgroundColor: '#eff6ff',
                                            border: '1px dashed #2563EB',
                                        },
                                    }}
                                >
                                    Add Email
                                </Button>
                            )}
                        </Box>
                        {(!form?.corporateEmails || form.corporateEmails.length === 0) && (
                            <Box
                                sx={{
                                    textAlign: 'center',
                                    py: 2.5,
                                    color: '#9ca3af',
                                    fontSize: '0.8rem',
                                    border: '1px dashed #e5e7eb',
                                    borderRadius: '8px',
                                }}
                            >
                                No email addresses added yet
                            </Box>
                        )}
                        {form?.corporateEmails?.map((email) => (
                            <EmailRow
                                key={email.id}
                                email={email}
                                onChange={(updated) => updateEmail?.(email.id, updated)}
                                onRemove={() => removeEmail?.(email.id)}
                            />
                        ))}
                    </Box>

                    {/* Annual Turnover */}
                    <FormField name="annualTurnover" label="Annual Turnover" sx={{ mb: 0 }}>
                        <StyledSelect
                            label="Annual Turnover"
                            placeholder="Select Annual Turnover"
                            value={form.annualTurnover}
                            onChange={(v) => set('annualTurnover', v as AnnualTurnover)}
                            options={ANNUAL_TURNOVERS}
                        />
                    </FormField>

                    {/* Description */}
                    <FormField
                        name="description"
                        label="Add Description & Scope"
                        hint={`${form.description.length} / 1000`}
                        sx={{ mb: 0 }}
                    >
                        <TextField
                            fullWidth
                            multiline
                            minRows={4}
                            maxRows={8}
                            size="small"
                            placeholder="Describe the organization's scope, activities, and key details..."
                            value={form.description}
                            onChange={(e) => set('description', e.target.value.slice(0, 1000))}
                            sx={fieldSx}
                        />
                    </FormField>
                </Box>

                {/* ── RIGHT COLUMN ─────────────────────────────────── */}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                    {/* ── Account Verified & Provide Support Card ── */}
                    <Box
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            p: 1.75,
                            border: '1px solid #e2e8f0',
                            borderRadius: '10px',
                            backgroundColor: '#f8fafc',
                            gap: 2,
                        }}
                    >
                        {/* Left: Account Verified */}
                        <Box
                            sx={{
                                flex: 1,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                pr: 2,
                                borderRight: '1px solid #e2e8f0',
                            }}
                        >
                            <Box>
                                <Typography
                                    sx={{
                                        fontWeight: 700,
                                        color: '#1e293b',
                                        fontSize: '0.82rem',
                                        lineHeight: 1.3,
                                    }}
                                >
                                    Account Verified
                                </Typography>
                                <Typography sx={{ color: '#94a3b8', fontSize: '0.72rem' }}>
                                    KYC &amp; MSME validated
                                </Typography>
                            </Box>
                            <Switch
                                checked={form.accountVerified}
                                onChange={(e) => set('accountVerified', e.target.checked)}
                                sx={{
                                    width: 44,
                                    height: 24,
                                    p: 0,
                                    '& .MuiSwitch-switchBase': {
                                        p: '2px',
                                        '&.Mui-checked': {
                                            transform: 'translateX(20px)',
                                            color: '#fff',
                                            '& + .MuiSwitch-track': {
                                                backgroundColor: '#16a34a',
                                                opacity: 1,
                                                border: 0,
                                            },
                                        },
                                    },
                                    '& .MuiSwitch-thumb': {
                                        width: 20,
                                        height: 20,
                                        boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                                    },
                                    '& .MuiSwitch-track': {
                                        borderRadius: 12,
                                        backgroundColor: '#cbd5e1',
                                        opacity: 1,
                                    },
                                }}
                            />
                        </Box>

                        {/* Right: Provide Support */}
                        <Box
                            sx={{
                                flex: 1,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                pl: 1,
                            }}
                        >
                            <Box>
                                <Typography
                                    sx={{
                                        fontWeight: 700,
                                        color: '#1e293b',
                                        fontSize: '0.82rem',
                                        lineHeight: 1.3,
                                    }}
                                >
                                    Provide Support
                                </Typography>
                                <Typography sx={{ color: '#94a3b8', fontSize: '0.72rem' }}>
                                    Active AMC entitlement
                                </Typography>
                            </Box>
                            <FormControl size="small" sx={{ minWidth: 84 }}>
                                <Select
                                    value={form.provideSupport}
                                    onChange={(e) =>
                                        set('provideSupport', e.target.value as 'Yes' | 'No')
                                    }
                                    sx={{
                                        fontSize: '0.82rem',
                                        borderRadius: '8px',
                                        backgroundColor: '#fff',
                                        height: 34,
                                        '& .MuiOutlinedInput-notchedOutline': {
                                            borderColor: '#cbd5e1',
                                        },
                                        '&:hover .MuiOutlinedInput-notchedOutline': {
                                            borderColor: '#94a3b8',
                                        },
                                    }}
                                >
                                    <MenuItem value="Yes" sx={{ fontSize: '0.82rem' }}>
                                        Yes
                                    </MenuItem>
                                    <MenuItem value="No" sx={{ fontSize: '0.82rem' }}>
                                        No
                                    </MenuItem>
                                </Select>
                            </FormControl>
                        </Box>
                    </Box>

                    {/* Mailing Name */}
                    <FormField name="mailingName" label="Mailing Name" hint="Printed on tax invoices" sx={{ mb: 0 }}>
                        <TextField
                            fullWidth
                            size="small"
                            placeholder="e.g. Mohit Traders Private Limited, Delhi"
                            value={mailingName}
                            onChange={(e) => {
                                const val = e.target.value;
                                setValue('mailingName', val, { shouldValidate: true, shouldDirty: true });
                                if (set) set('mailingName', val);
                            }}
                            onBlur={() => {
                                setValue('mailingName', getValues('mailingName') || '', { shouldTouch: true });
                            }}
                            sx={fieldSx}
                        />
                    </FormField>

                    {/* Type of Entity */}
                    <RhfSelect<OrganizationFormData>
                        name="typeOfEntity"
                        label="Type of Entity"
                        placeholder="Select Type of Entity"
                        options={ENTITY_TYPES}
                        required
                    />

                    {/* Customer Type */}
                    <RhfSelect<OrganizationFormData>
                        name="customerType"
                        label="Customer Type"
                        placeholder="Select Customer Type"
                        options={CUSTOMER_TYPES}
                        required
                    />

                    {/* Showroom / Branch Code */}
                    <FormField
                        name="showroomBranchCode"
                        label="Showroom / Branch Code"
                        hint="Store Location ID"
                        sx={{ mb: 0 }}
                    >
                        <TextField
                            fullWidth
                            size="small"
                            placeholder="e.g. DEL-NORTH-04"
                            value={form.showroomBranchCode}
                            onChange={(e) => set('showroomBranchCode', e.target.value)}
                            sx={fieldSx}
                        />
                    </FormField>

                    {/* Member of (Parent Corporation) */}
                    <FormField name="memberOfParentCorp" label="Member of (Parent Corporation)" sx={{ mb: 0 }}>
                        <TextField
                            fullWidth
                            size="small"
                            placeholder="e.g. Apex Holdings Conglomerate Ltd."
                            value={form.memberOfParentCorp}
                            onChange={(e) => set('memberOfParentCorp', e.target.value)}
                            sx={fieldSx}
                            slotProps={{
                                input: {
                                    endAdornment: (
                                        <InputAdornment position="end" sx={{ gap: 0.5 }}>
                                            <IconButton size="small" sx={{ color: '#94a3b8' }}>
                                                <MenuBookIcon sx={{ fontSize: 18 }} />
                                            </IconButton>
                                            <IconButton size="small" sx={{ color: '#94a3b8' }}>
                                                <SearchIcon sx={{ fontSize: 18 }} />
                                            </IconButton>
                                            <IconButton size="small" sx={{ color: '#94a3b8' }}>
                                                <LinkOffIcon sx={{ fontSize: 18 }} />
                                            </IconButton>
                                        </InputAdornment>
                                    ),
                                },
                            }}
                        />
                    </FormField>

                    {/* Number of Employees */}
                    <FormField name="numberOfEmployees" label="Number of Employees" sx={{ mb: 0 }}>
                        <StyledSelect
                            label="Number of Employees"
                            placeholder="Select Number of Employees"
                            value={form.numberOfEmployees}
                            onChange={(v) => set('numberOfEmployees', v as NumberOfEmployees)}
                            options={EMPLOYEE_COUNTS}
                        />
                    </FormField>

                    {/* Assigned to (Account Executive) */}
                    <FormField label="Assigned to (Account Executive)" required sx={{ mb: 0 }}>
                        <Box
                            sx={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                p: 1.5,
                                border: '1px solid #e2e8f0',
                                borderRadius: '8px',
                                backgroundColor: '#fff',
                            }}
                        >
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                <Avatar
                                    sx={{
                                        width: 32,
                                        height: 32,
                                        fontSize: '0.78rem',
                                        fontWeight: 700,
                                        backgroundColor: '#1d4ed8',
                                    }}
                                >
                                    MS
                                </Avatar>
                                <Box>
                                    <Typography
                                        sx={{
                                            fontSize: '0.84rem',
                                            fontWeight: 600,
                                            color: '#1e293b',
                                            lineHeight: 1.2,
                                        }}
                                    >
                                        mittal.sharma
                                    </Typography>
                                    <Typography sx={{ fontSize: '0.72rem', color: '#64748b' }}>
                                        Senior Sales Specialist • North Region
                                    </Typography>
                                </Box>
                            </Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Chip
                                    label="Primary Rep"
                                    size="small"
                                    variant="outlined"
                                    sx={{
                                        fontSize: '0.7rem',
                                        height: 22,
                                        borderColor: '#cbd5e1',
                                        color: '#475569',
                                        backgroundColor: '#f8fafc',
                                    }}
                                />
                                <IconButton size="small" sx={{ color: '#94a3b8' }}>
                                    <PersonOutlinedIcon sx={{ fontSize: 18 }} />
                                </IconButton>
                                <IconButton size="small" sx={{ color: '#94a3b8' }}>
                                    <ContactPageOutlinedIcon sx={{ fontSize: 18 }} />
                                </IconButton>
                            </Box>
                        </Box>
                    </FormField>
                </Box>
            </Box>
        </Box>
    );
}

function FallbackOverviewProvider({
    children,
    defaultValues,
}: {
    children: React.ReactNode;
    defaultValues?: OrganizationFormData;
}) {
    const methods = useForm<OrganizationFormData>({
        defaultValues: {
            organizationName: defaultValues?.organizationName || '',
            mailingName: defaultValues?.mailingName || '',
            natureOfBusiness: defaultValues?.natureOfBusiness || '',
            accountStatus: defaultValues?.accountStatus || 'Active',
            typeOfEntity: defaultValues?.typeOfEntity || '',
            customerType: defaultValues?.customerType || '',
            sapCodeTallyId: defaultValues?.sapCodeTallyId || '',
            showroomBranchCode: defaultValues?.showroomBranchCode || '',
            sourceOfLead: defaultValues?.sourceOfLead || '',
            memberOfParentCorp: defaultValues?.memberOfParentCorp || '',
            numberOfEmployees: defaultValues?.numberOfEmployees || '',
            annualTurnover: defaultValues?.annualTurnover || '',
            description: defaultValues?.description || '',
            accountVerified: defaultValues?.accountVerified || false,
            provideSupport: defaultValues?.provideSupport || 'Yes',
            corporateEmails: defaultValues?.corporateEmails || [],
            registrationType: (defaultValues?.registrationType as 'Registered' | 'Unregistered') || 'Registered',
            gstNo: defaultValues?.gstNo || defaultValues?.gstNumber || '',
            ...defaultValues,
        },
    });
    return <FormProvider {...methods}>{children}</FormProvider>;
}

export function OverviewTab(props: OverviewTabProps) {
    const existing = useFormContext<OrganizationFormData>();
    if (existing) {
        return <OverviewTabInner {...props} />;
    }
    return (
        <FallbackOverviewProvider defaultValues={props.form}>
            <OverviewTabInner {...props} />
        </FallbackOverviewProvider>
    );
}
