'use client';

import React from 'react';
import {
    Box,
    Typography,
    TextField,
    Chip,
    Switch,
    FormControl,
    Select,
    MenuItem,
    InputAdornment,
    IconButton,
    Tooltip,
} from '@mui/material';
import { CommonActionModal } from '@/components/common/CommonActionModal';

// Icons
import VerifiedIcon from '@mui/icons-material/Verified';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import SearchIcon from '@mui/icons-material/Search';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';

import { useFormContext, useWatch, FormProvider, useForm } from 'react-hook-form';
import { useFormMode } from '@/context/FormModeContext';
import { useAuth } from '@/context/AuthContext';
import { formatDateTime } from '@/utils/date';

import {
    FormField,
    StyledSelect,
    fieldSx,
    RhfSelect,
    RhfAssignedUserCard,
    RhfToggleGroupCard,
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
    NatureOfBusiness,
    AccountStatus,
    TypeOfEntity,
    CustomerType,
    AnnualTurnover,
    NumberOfEmployees,
    SourceOfLead,
} from '@/types/organization.types';
import { OrganizationLookupModal } from '@/components/common/lookup';

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
}

function OverviewTabInner({
    form,
    set,
}: OverviewTabProps) {
    const { control, setValue } = useFormContext<OrganizationFormData>();

    const organizationName = useWatch({ control, name: 'organizationName' }) ?? form?.organizationName ?? '';
    const tradeName = useWatch({ control, name: 'tradeName' }) ?? form?.tradeName ?? '';
    const { user } = useAuth();
    const currentAccountStatus = (useWatch({ control, name: 'accountStatus' }) ?? form?.accountStatus ?? 'Active') as AccountStatus;
    const isView = useFormMode().mode === 'view';
    const [pendingInactive, setPendingInactive] = React.useState(false);
    const [orgLookupOpen, setOrgLookupOpen] = React.useState(false);
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

    const handleOrgNameChange = (val: string) => {
        // Trade name keeps following the organization name until the user gives it a value of its own.
        const tradeNameFollows = !tradeName || tradeName === organizationName;
        const opts = { shouldValidate: true, shouldDirty: true } as const;
        setValue('organizationName', val, opts);
        setValue('mailingName', val, opts);
        if (set) {
            set('organizationName', val);
            set('mailingName', val);
        }
        if (tradeNameFollows) {
            setValue('tradeName', val, opts);
            if (set) set('tradeName', val);
        }
    };

    const handleTradeNameChange = (val: string) => {
        setValue('tradeName', val, { shouldValidate: true, shouldDirty: true });
        if (set) set('tradeName', val);
    };

    // Verification is audited: switching on records when and by whom; switching off clears both.
    const handleVerifiedToggle = (checked: boolean) => {
        set('accountVerified', checked);
        set('verifiedAt', checked ? new Date().toISOString() : undefined);
        set('verifiedBy', checked ? user?.username || 'Current User' : undefined);
    };
    const verifiedCaption = form.accountVerified
        ? form.verifiedAt
            ? `${formatDateTime(form.verifiedAt)} by ${form.verifiedBy || 'Admin'}`
            : 'Verified'
        : 'Not verified';

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

                    {/* Trade Name */}
                    <FormField name="tradeName" label="Trade Name" hint="Defaults to the organization name" sx={{ mb: 0 }}>
                        <TextField
                            fullWidth
                            size="small"
                            placeholder="e.g. Mohit Traders"
                            value={tradeName}
                            onChange={(e) => handleTradeNameChange(e.target.value)}
                            sx={fieldSx}
                            slotProps={{ htmlInput: { maxLength: 200 } }}
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
                                    {verifiedCaption}
                                </Typography>
                            </Box>
                            {isView ? (
                                <Chip
                                    label={form.accountVerified ? 'Verified' : 'Not verified'}
                                    size="small"
                                    sx={{
                                        height: 24,
                                        fontSize: '0.76rem',
                                        fontWeight: 700,
                                        cursor: 'default',
                                        color: form.accountVerified ? '#16a34a' : '#64748b',
                                        backgroundColor: form.accountVerified ? '#16a34a1a' : '#64748b1a',
                                    }}
                                />
                            ) : (
                            <Switch
                                checked={form.accountVerified}
                                onChange={(e) => handleVerifiedToggle(e.target.checked)}
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
                            )}
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
                            {isView ? (
                                <Chip
                                    label={form.provideSupport}
                                    size="small"
                                    sx={{
                                        height: 24,
                                        fontSize: '0.76rem',
                                        fontWeight: 700,
                                        cursor: 'default',
                                        color: form.provideSupport === 'Yes' ? '#16a34a' : '#64748b',
                                        backgroundColor: form.provideSupport === 'Yes' ? '#16a34a1a' : '#64748b1a',
                                    }}
                                />
                            ) : (
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
                            )}
                        </Box>
                    </Box>

                    {/* Active AMC & Cloud entitlements */}
                    <RhfToggleGroupCard<OrganizationFormData>
                        items={[
                            { name: 'activeAmc', label: 'Active AMC', caption: 'Annual maintenance contract' },
                            { name: 'activeCloud', label: 'Active Cloud', caption: 'Cloud hosting subscription' },
                        ]}
                        onValueChange={(name, checked) => set(name as 'activeAmc' | 'activeCloud', checked)}
                    />

                    {/* Mailing Name (always equals Organization Name) */}
                    <FormField name="mailingName" label="Mailing Name" hint="Printed on tax invoices • follows Organization Name" sx={{ mb: 0 }}>
                        <TextField
                            fullWidth
                            size="small"
                            value={organizationName}
                            sx={{ ...fieldSx, '& .MuiOutlinedInput-root': { backgroundColor: '#f8fafc', color: '#475569' } }}
                            slotProps={{
                                htmlInput: { readOnly: true, tabIndex: -1, 'aria-readonly': true },
                                input: {
                                    endAdornment: (
                                        <InputAdornment position="end">
                                            <LockOutlinedIcon sx={{ fontSize: 16, color: '#94a3b8' }} />
                                        </InputAdornment>
                                    ),
                                },
                            }}
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
                                            <Tooltip title="Search organizations">
                                                <IconButton
                                                    size="small"
                                                    aria-label="Search organizations"
                                                    onClick={() => setOrgLookupOpen(true)}
                                                    sx={{ color: '#94a3b8', '&:hover': { color: '#1d4ed8' } }}
                                                >
                                                    <SearchIcon sx={{ fontSize: 18 }} />
                                                </IconButton>
                                            </Tooltip>
                                            <Tooltip title="Unlink parent">
                                                <span>
                                                    <IconButton
                                                        size="small"
                                                        aria-label="Unlink parent"
                                                        disabled={!form.memberOfParentCorp}
                                                        onClick={() => set('memberOfParentCorp', '')}
                                                        sx={{ color: '#94a3b8', '&:hover': { color: '#dc2626' } }}
                                                    >
                                                        <LinkOffIcon sx={{ fontSize: 18 }} />
                                                    </IconButton>
                                                </span>
                                            </Tooltip>
                                        </InputAdornment>
                                    ),
                                },
                            }}
                        />
                        <OrganizationLookupModal
                            open={orgLookupOpen}
                            onClose={() => setOrgLookupOpen(false)}
                            onSelect={(org) => set('memberOfParentCorp', org.organizationName)}
                            selectedValue={form.memberOfParentCorp}
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
                    <RhfAssignedUserCard<OrganizationFormData>
                        name="assignedUser"
                        label="Assigned to (Account Executive)"
                        required
                        roleBadge="Primary Rep"
                        onValueChange={(username) => set('assignedUser', username)}
                    />
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
