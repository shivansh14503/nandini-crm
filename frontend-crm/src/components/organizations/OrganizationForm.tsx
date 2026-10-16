'use client';

import { useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
    Box,
    Paper,
    Typography,
    TextField,
    Select,
    MenuItem,
    FormControl,
    InputLabel,
    Switch,
    FormControlLabel,
    Button,
    IconButton,
    Chip,
    Divider,
    Alert,
    CircularProgress,
    Tooltip,
    RadioGroup,
    Radio,
    FormLabel,
    Checkbox,
    FormGroup,
    Snackbar,
    InputAdornment,
    Avatar,
} from '@mui/material';

// Icons
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import BusinessIcon from '@mui/icons-material/Business';
import EmailIcon from '@mui/icons-material/Email';
import SyncIcon from '@mui/icons-material/Sync';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined';
import WorkspacePremiumOutlinedIcon from '@mui/icons-material/WorkspacePremiumOutlined';
import ElectricBoltIcon from '@mui/icons-material/ElectricBolt';
import CloudDownloadOutlinedIcon from '@mui/icons-material/CloudDownloadOutlined';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';
import CloseIcon from '@mui/icons-material/Close';
import BookmarkBorderIcon from '@mui/icons-material/BookmarkBorder';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import VerifiedIcon from '@mui/icons-material/Verified';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import SearchIcon from '@mui/icons-material/Search';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import ContactPageOutlinedIcon from '@mui/icons-material/ContactPageOutlined';

import { organizationService } from '../../services/organization.service';
import { ROUTES } from '../../config/constants';
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
} from '../../types/organization.types';

// ─── Option lists ─────────────────────────────────────────────────────────────
const NATURE_OF_BUSINESS: NatureOfBusiness[] = [
    'Distributor / Wholesale Trading',
    'Manufacturing',
    'Retail',
    'Services',
    'IT / Software',
    'Healthcare',
    'Education',
    'Government / PSU',
    'Other',
];

const ACCOUNT_STATUSES: AccountStatus[] = ['Active', 'Inactive', 'Prospect', 'Blacklisted'];

const ENTITY_TYPES: TypeOfEntity[] = [
    'Private Limited Company (Pvt. Ltd.)',
    'Public Limited Company (Ltd.)',
    'Limited Liability Partnership (LLP)',
    'Partnership Firm',
    'Sole Proprietorship',
    'Trust / NGO',
    'Government Body',
    'Foreign Entity',
    'Other',
];

const CUSTOMER_TYPES: CustomerType[] = [
    'Authorized Reseller',
    'Direct Customer',
    'OEM Partner',
    'System Integrator',
    'End User',
    'Distributor',
    'Internal',
];

const ANNUAL_TURNOVERS: AnnualTurnover[] = [
    'Below ₹25 Lakhs',
    '₹25 Lakhs – ₹1 Cr',
    '₹1 Cr – ₹1.5 Cr',
    '₹1.5 Cr – ₹5 Cr',
    '₹5 Cr – ₹25 Cr',
    '₹25 Cr – ₹100 Cr',
    'Above ₹100 Cr',
];

const EMPLOYEE_COUNTS: NumberOfEmployees[] = [
    '1 – 10 Staff Members',
    '11 – 50 Staff Members',
    '51 – 200 Staff Members',
    '201 – 500 Staff Members',
    '500+ Staff Members',
];

const LEAD_SOURCES: SourceOfLead[] = [
    'Client Referral',
    'Website Enquiry',
    'Cold Call',
    'Email Campaign',
    'Exhibition / Trade Show',
    'LinkedIn / Social Media',
    'Partner Referral',
    'Other',
];

// ─── Default state ────────────────────────────────────────────────────────────
const DEFAULT_FORM: OrganizationFormData = {
    organizationName: '',
    mailingName: '',
    natureOfBusiness: '',
    accountStatus: '',
    typeOfEntity: '',
    customerType: '',
    sapCodeTallyId: '',
    showroomBranchCode: '',
    sourceOfLead: '',
    memberOfParentCorp: '',
    numberOfEmployees: '',
    annualTurnover: '',
    description: '',
    accountVerified: false,
    provideSupport: 'Yes',
    corporateEmails: [],
};

// ─── Tab Keys ─────────────────────────────────────────────────────────────────
type TabKey = 'overview' | 'address' | 'tax_bank' | 'partner_licensing';

// ─── Shared field styles ──────────────────────────────────────────────────────
const fieldSx = {
    '& .MuiOutlinedInput-root': {
        borderRadius: '8px',
        backgroundColor: '#fff',
        fontSize: '0.85rem',
        '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#2563EB' },
        '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: '#2563EB',
            borderWidth: '1.5px',
        },
    },
    '& .MuiInputLabel-root.Mui-focused': { color: '#2563EB' },
};

// ─── Section header ───────────────────────────────────────────────────────────
function SectionLabel({ icon, label }: { icon: React.ReactNode; label: string }) {
    return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <Box sx={{ color: '#2563EB', display: 'flex' }}>{icon}</Box>
            <Typography
                variant="subtitle2"
                sx={{
                    fontWeight: 700,
                    color: '#1e3a5f',
                    fontSize: '0.82rem',
                    letterSpacing: '0.02em',
                }}
            >
                {label}
            </Typography>
        </Box>
    );
}

// ─── Styled Select ────────────────────────────────────────────────────────────
function StyledSelect({
    label,
    value,
    onChange,
    options,
    required,
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    options: string[];
    required?: boolean;
}) {
    return (
        <FormControl fullWidth size="small" sx={fieldSx} required={required}>
            <InputLabel sx={{ fontSize: '0.85rem' }}>{label}</InputLabel>
            <Select
                value={value}
                label={label}
                onChange={(e) => onChange(e.target.value)}
                sx={{ fontSize: '0.85rem' }}
            >
                {options.map((o) => (
                    <MenuItem key={o} value={o} sx={{ fontSize: '0.85rem' }}>
                        {o}
                    </MenuItem>
                ))}
            </Select>
        </FormControl>
    );
}

// ─── Email row ────────────────────────────────────────────────────────────────
function EmailRow({
    email,
    onChange,
    onRemove,
}: {
    email: CorporateEmail;
    onChange: (updated: CorporateEmail) => void;
    onRemove: () => void;
}) {
    return (
        <Box
            sx={{
                mb: 1.5,
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                p: 1.5,
                backgroundColor: '#ffffff',
            }}
        >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <TextField
                    fullWidth
                    size="small"
                    value={email.email}
                    placeholder="e.g. contact@domain.com"
                    onChange={(e) => onChange({ ...email, email: e.target.value })}
                    sx={fieldSx}
                />
                <Tooltip title="Remove email">
                    <IconButton
                        onClick={onRemove}
                        size="small"
                        sx={{ color: '#9ca3af', '&:hover': { color: '#ef4444' }, flexShrink: 0 }}
                    >
                        <DeleteIcon fontSize="small" />
                    </IconButton>
                </Tooltip>
            </Box>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                <FormControlLabel
                    control={
                        <Radio
                            size="small"
                            checked={email.isPrimary}
                            onChange={() => onChange({ ...email, isPrimary: true })}
                            sx={{ color: '#2563EB', '&.Mui-checked': { color: '#2563EB' }, p: 0.5 }}
                        />
                    }
                    label={
                        <Typography sx={{ fontSize: '0.78rem', color: '#374151', fontWeight: 500 }}>
                            Primary Contact
                        </Typography>
                    }
                    sx={{ m: 0 }}
                />
                <FormGroup row sx={{ gap: 1.5 }}>
                    <FormControlLabel
                        control={
                            <Checkbox
                                size="small"
                                checked={email.isOptedOut}
                                onChange={(e) => onChange({ ...email, isOptedOut: e.target.checked })}
                                sx={{ p: 0.5 }}
                            />
                        }
                        label={
                            <Typography sx={{ fontSize: '0.78rem', color: '#374151' }}>
                                Opted Out (DND)
                            </Typography>
                        }
                        sx={{ m: 0 }}
                    />
                    <FormControlLabel
                        control={
                            <Checkbox
                                size="small"
                                checked={email.isInvalidBounce}
                                onChange={(e) => onChange({ ...email, isInvalidBounce: e.target.checked })}
                                sx={{ p: 0.5 }}
                            />
                        }
                        label={
                            <Typography sx={{ fontSize: '0.78rem', color: '#374151' }}>
                                Invalid Bounce
                            </Typography>
                        }
                        sx={{ m: 0 }}
                    />
                </FormGroup>
            </Box>
        </Box>
    );
}

// ─── Main form component ─────────────────────────────────────────────────────
interface OrganizationFormProps {
    mode?: 'create' | 'edit';
    initialData?: Partial<OrganizationFormData>;
    organizationId?: string;
}

export default function OrganizationForm({
    mode = 'create',
    initialData,
    organizationId,
}: OrganizationFormProps) {
    const router = useRouter();
    const [form, setForm] = useState<OrganizationFormData>({ ...DEFAULT_FORM, ...initialData });
    const [activeTab, setActiveTab] = useState<TabKey>('overview');
    const [submitting, setSubmitting] = useState(false);
    const [isDirty, setIsDirty] = useState(false);
    const [gstinInput, setGstinInput] = useState('');
    const [toast, setToast] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
        open: false,
        message: '',
        severity: 'success',
    });

    // ── Field updaters ────────────────────────────────────────────────────────
    const set = useCallback(
        <K extends keyof OrganizationFormData>(key: K, value: OrganizationFormData[K]) => {
            setForm((prev) => ({ ...prev, [key]: value }));
            setIsDirty(true);
        },
        []
    );

    // ── Email management ──────────────────────────────────────────────────────
    const addEmail = () => {
        const newEmail: CorporateEmail = {
            id: crypto.randomUUID(),
            email: '',
            isPrimary: form.corporateEmails.length === 0,
            isOptedOut: false,
            isInvalidBounce: false,
        };
        set('corporateEmails', [...form.corporateEmails, newEmail]);
    };

    const updateEmail = (id: string, updated: CorporateEmail) => {
        set(
            'corporateEmails',
            form.corporateEmails.map((e) => (e.id === id ? updated : e))
        );
    };

    const removeEmail = (id: string) => {
        set(
            'corporateEmails',
            form.corporateEmails.filter((e) => e.id !== id)
        );
    };

    // ── Calculation of completion progress ────────────────────────────────────
    const progressCount = useMemo(() => {
        let count = 0;
        if (form.organizationName.trim()) count++;
        if (form.natureOfBusiness) count++;
        if (form.accountStatus) count++;
        if (form.typeOfEntity) count++;
        if (form.customerType) count++;
        if (form.sapCodeTallyId.trim()) count++;
        if (form.sourceOfLead) count++;
        if (form.corporateEmails.length > 0) count++;
        if (form.annualTurnover) count++;
        if (form.description.trim()) count++;
        return Math.min(count, 10);
    }, [form]);

    // ── Submit logic ──────────────────────────────────────────────────────────
    const handleSubmit = async (redirectAfter: boolean) => {
        if (!form.organizationName.trim()) {
            setToast({ open: true, message: 'Organization Name is required.', severity: 'error' });
            return;
        }
        setSubmitting(true);
        try {
            if (mode === 'create') {
                await organizationService.create(form);
                setToast({ open: true, message: 'Organization created successfully!', severity: 'success' });
                if (redirectAfter) {
                    setTimeout(() => router.push(ROUTES.ORGANIZATIONS), 1000);
                } else {
                    setForm(DEFAULT_FORM);
                    setIsDirty(false);
                }
            } else if (mode === 'edit' && organizationId) {
                await organizationService.update(organizationId, form);
                setToast({ open: true, message: 'Organization updated successfully!', severity: 'success' });
                setTimeout(() => router.push(ROUTES.ORGANIZATION_DETAIL(organizationId)), 1000);
            }
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
            setToast({ open: true, message, severity: 'error' });
        } finally {
            setSubmitting(false);
        }
    };

    const handleDiscard = () => {
        if (isDirty && !confirm('You have unsaved changes. Are you sure you want to discard them?')) return;
        router.push(ROUTES.ORGANIZATIONS);
    };

    // ─── Tabs Definition ──────────────────────────────────────────────────────
    const tabs = [
        {
            id: 'overview' as const,
            label: 'Overview',
            icon: <ArticleOutlinedIcon sx={{ fontSize: 18 }} />,
            badge: `${progressCount}/10 done`,
        },
        {
            id: 'address' as const,
            label: 'Address Information',
            icon: <PlaceOutlinedIcon sx={{ fontSize: 18 }} />,
            sublabel: '(3 Locs)',
        },
        {
            id: 'tax_bank' as const,
            label: 'Tax & Bank Details',
            icon: <AccountBalanceOutlinedIcon sx={{ fontSize: 18 }} />,
            hasDot: true,
        },
        {
            id: 'partner_licensing' as const,
            label: 'Partner Company & Licensing',
            icon: <WorkspacePremiumOutlinedIcon sx={{ fontSize: 18 }} />,
        },
    ];

    // ─── Layout ───────────────────────────────────────────────────────────────
    return (
        <Box sx={{ pb: 12 }}>
            {/* ── Top action bar ─────────────────────────────────────────── */}
            <Box
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    mb: 2.5,
                    flexWrap: 'wrap',
                    gap: 2,
                }}
            >
                <Box>
                    {/* Breadcrumbs / Tag row */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                        <Typography sx={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 500 }}>
                            Sales &gt; Organizations &gt; Create &amp; Edit View
                        </Typography>
                        <Chip
                            label="● Drafting Account"
                            size="small"
                            sx={{
                                height: 20,
                                fontSize: '0.7rem',
                                fontWeight: 600,
                                backgroundColor: '#e0e7ff',
                                color: '#3730a3',
                            }}
                        />
                    </Box>

                    {/* Title */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Typography
                            variant="h5"
                            sx={{
                                fontWeight: 800,
                                color: '#0f172a',
                                fontSize: '1.45rem',
                                lineHeight: 1.2,
                            }}
                        >
                            Organization Account Master
                        </Typography>
                        <Chip
                            label={organizationId ? `ID: ${organizationId}` : 'AC-2025-0981'}
                            size="small"
                            variant="outlined"
                            sx={{
                                height: 22,
                                fontSize: '0.72rem',
                                fontWeight: 600,
                                color: '#64748b',
                                borderColor: '#cbd5e1',
                                backgroundColor: '#f8fafc',
                            }}
                        />
                    </Box>
                </Box>

                {/* Right Top Buttons */}
                <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Button
                        variant="outlined"
                        size="small"
                        onClick={handleDiscard}
                        disabled={submitting}
                        startIcon={<CloseIcon sx={{ fontSize: 16 }} />}
                        sx={{
                            borderColor: '#cbd5e1',
                            color: '#334155',
                            borderRadius: '8px',
                            fontSize: '0.82rem',
                            textTransform: 'none',
                            fontWeight: 600,
                            px: 2,
                            height: 36,
                            backgroundColor: '#fff',
                            '&:hover': { borderColor: '#94a3b8', backgroundColor: '#f8fafc' },
                        }}
                    >
                        Discard
                    </Button>
                    <Button
                        variant="outlined"
                        size="small"
                        onClick={() => handleSubmit(false)}
                        disabled={submitting}
                        startIcon={<BookmarkBorderIcon sx={{ fontSize: 16 }} />}
                        sx={{
                            borderColor: '#cbd5e1',
                            color: '#334155',
                            borderRadius: '8px',
                            fontSize: '0.82rem',
                            textTransform: 'none',
                            fontWeight: 600,
                            px: 2,
                            height: 36,
                            backgroundColor: '#fff',
                            '&:hover': { borderColor: '#94a3b8', backgroundColor: '#f8fafc' },
                        }}
                    >
                        Save as Draft
                    </Button>
                    <Button
                        variant="contained"
                        size="small"
                        onClick={() => handleSubmit(true)}
                        disabled={submitting}
                        startIcon={
                            submitting ? (
                                <CircularProgress size={14} color="inherit" />
                            ) : (
                                <SyncIcon sx={{ fontSize: 16 }} />
                            )
                        }
                        sx={{
                            background: 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)',
                            borderRadius: '8px',
                            fontSize: '0.82rem',
                            textTransform: 'none',
                            fontWeight: 700,
                            px: 2.2,
                            height: 36,
                            boxShadow: '0 2px 8px rgba(37,99,235,0.3)',
                            '&:hover': { background: 'linear-gradient(135deg, #1e40af 0%, #1d4ed8 100%)' },
                        }}
                    >
                        Save Organization &amp; Sync Tally
                        <Typography
                            component="span"
                            sx={{ fontSize: '0.7rem', opacity: 0.85, ml: 0.8, fontWeight: 500 }}
                        >
                            Ctrl+S
                        </Typography>
                    </Button>
                </Box>
            </Box>

            {/* ── GSTIN Quick-Fill Integration Card ──────────────────────── */}
            <Paper
                elevation={0}
                sx={{
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                    p: 2,
                    mb: 3,
                    backgroundColor: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: { xs: 'wrap', lg: 'nowrap' },
                    gap: 2,
                }}
            >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Box
                        sx={{
                            width: 42,
                            height: 42,
                            borderRadius: '10px',
                            backgroundColor: '#eff6ff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#2563eb',
                            flexShrink: 0,
                        }}
                    >
                        <ElectricBoltIcon sx={{ fontSize: 22 }} />
                    </Box>
                    <Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography sx={{ fontWeight: 700, fontSize: '0.92rem', color: '#0f172a' }}>
                                GSTIN Quick-Fill Integration
                            </Typography>
                            <Chip
                                label="AUTO-API"
                                size="small"
                                sx={{
                                    height: 18,
                                    fontSize: '0.65rem',
                                    fontWeight: 700,
                                    backgroundColor: '#e0e7ff',
                                    color: '#4338ca',
                                    borderRadius: '4px',
                                }}
                            />
                        </Box>
                        <Typography sx={{ color: '#64748b', fontSize: '0.76rem', mt: 0.2 }}>
                            Enter 15-digit GSTIN to auto-populate Organization Name, Trade Name, Registered Address, PAN,
                            and Tax jurisdiction directly from the Govt GSTN Portal.
                        </Typography>
                    </Box>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexShrink: 0 }}>
                    <TextField
                        size="small"
                        placeholder="07AAAAA0000A1Z5"
                        value={gstinInput}
                        onChange={(e) => setGstinInput(e.target.value.toUpperCase())}
                        sx={{
                            width: 220,
                            '& .MuiOutlinedInput-root': {
                                borderRadius: '8px',
                                fontFamily: 'monospace',
                                fontSize: '0.82rem',
                                letterSpacing: '0.05em',
                                height: 38,
                            },
                        }}
                        slotProps={{
                            input: {
                                endAdornment: (
                                    <InputAdornment position="end">
                                        <ContentPasteIcon
                                            sx={{ fontSize: 16, color: '#94a3b8', cursor: 'pointer' }}
                                        />
                                    </InputAdornment>
                                ),
                            },
                        }}
                    />
                    <Button
                        variant="outlined"
                        size="small"
                        startIcon={<CloudDownloadOutlinedIcon sx={{ fontSize: 16 }} />}
                        sx={{
                            borderColor: '#2563eb',
                            color: '#2563eb',
                            borderRadius: '8px',
                            fontSize: '0.8rem',
                            textTransform: 'none',
                            fontWeight: 600,
                            px: 2,
                            height: 38,
                            whiteSpace: 'nowrap',
                            '&:hover': { backgroundColor: '#eff6ff', borderColor: '#1d4ed8' },
                        }}
                    >
                        Fetch GST Record
                    </Button>
                </Box>
            </Paper>

            {/* ── Main form container with Tabs ─────────────────────────── */}
            <Paper
                elevation={0}
                sx={{
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    backgroundColor: '#fff',
                }}
            >
                {/* ── TABS BAR (Header of the card) ─────────────────────────── */}
                <Box
                    sx={{
                        backgroundColor: '#f8fafc',
                        borderBottom: '1px solid #e2e8f0',
                        px: 2,
                        py: 1,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        overflowX: 'auto',
                    }}
                >
                    {tabs.map((tab) => {
                        const isActive = activeTab === tab.id;
                        return (
                            <Box
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 1,
                                    px: 2,
                                    py: 1,
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    userSelect: 'none',
                                    whiteSpace: 'nowrap',
                                    transition: 'all 0.15s ease-in-out',
                                    backgroundColor: isActive ? '#ffffff' : 'transparent',
                                    border: isActive ? '1px solid #d1d5db' : '1px solid transparent',
                                    boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                                    color: isActive ? '#1e3a8a' : '#64748b',
                                    fontWeight: isActive ? 600 : 500,
                                    fontSize: '0.84rem',
                                    '&:hover': {
                                        backgroundColor: isActive ? '#ffffff' : '#f1f5f9',
                                        color: isActive ? '#1e3a8a' : '#1e293b',
                                    },
                                }}
                            >
                                <Box
                                    sx={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        color: isActive ? '#2563eb' : '#64748b',
                                    }}
                                >
                                    {tab.icon}
                                </Box>
                                <Typography sx={{ fontSize: '0.84rem', fontWeight: 'inherit', color: 'inherit' }}>
                                    {tab.label}
                                </Typography>

                                {tab.badge && (
                                    <Box
                                        sx={{
                                            px: 1,
                                            py: 0.2,
                                            borderRadius: '9999px',
                                            border: '1px solid #93c5fd',
                                            backgroundColor: '#eff6ff',
                                            color: '#2563eb',
                                            fontSize: '0.72rem',
                                            fontWeight: 600,
                                            lineHeight: 1.2,
                                        }}
                                    >
                                        {tab.badge}
                                    </Box>
                                )}

                                {tab.sublabel && (
                                    <Typography
                                        component="span"
                                        sx={{ fontSize: '0.76rem', color: '#94a3b8', fontWeight: 400 }}
                                    >
                                        {tab.sublabel}
                                    </Typography>
                                )}

                                {tab.hasDot && (
                                    <Box
                                        sx={{
                                            width: 7,
                                            height: 7,
                                            borderRadius: '50%',
                                            backgroundColor: '#f97316',
                                            ml: 0.5,
                                        }}
                                    />
                                )}
                            </Box>
                        );
                    })}
                </Box>

                {/* ── TAB CONTENT ───────────────────────────────────────────── */}
                {activeTab === 'overview' && (
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
                                <Box>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.6 }}>
                                        <Typography
                                            variant="body2"
                                            sx={{ fontWeight: 600, color: '#374151', fontSize: '0.82rem' }}
                                        >
                                            Organization Name <span style={{ color: '#ef4444' }}>*</span>
                                        </Typography>
                                        <Typography variant="caption" sx={{ color: '#9ca3af', fontSize: '0.72rem' }}>
                                            As per official registration
                                        </Typography>
                                    </Box>
                                    <TextField
                                        fullWidth
                                        size="small"
                                        placeholder="e.g. Mohit Traders Pvt Ltd"
                                        value={form.organizationName}
                                        onChange={(e) => set('organizationName', e.target.value)}
                                        sx={fieldSx}
                                        slotProps={{
                                            input: {
                                                endAdornment: form.organizationName ? (
                                                    <InputAdornment position="end">
                                                        <VerifiedIcon sx={{ fontSize: 18, color: '#16a34a' }} />
                                                    </InputAdornment>
                                                ) : undefined,
                                            },
                                            htmlInput: { maxLength: 200 },
                                        }}
                                    />
                                </Box>

                                {/* Nature of Business */}
                                <Box>
                                    <Typography
                                        variant="body2"
                                        sx={{ fontWeight: 600, color: '#374151', fontSize: '0.82rem', mb: 0.6 }}
                                    >
                                        Nature of Business <span style={{ color: '#ef4444' }}>*</span>
                                    </Typography>
                                    <StyledSelect
                                        label="Nature of Business"
                                        value={form.natureOfBusiness}
                                        onChange={(v) => set('natureOfBusiness', v as NatureOfBusiness)}
                                        options={NATURE_OF_BUSINESS}
                                        required
                                    />
                                </Box>

                                {/* Account Status */}
                                <Box>
                                    <Box
                                        sx={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            mb: 0.6,
                                            alignItems: 'center',
                                        }}
                                    >
                                        <Typography
                                            variant="body2"
                                            sx={{ fontWeight: 600, color: '#374151', fontSize: '0.82rem' }}
                                        >
                                            Account Status
                                        </Typography>
                                        {form.accountStatus === 'Active' && (
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
                                        )}
                                    </Box>
                                    <StyledSelect
                                        label="Account Status"
                                        value={form.accountStatus}
                                        onChange={(v) => set('accountStatus', v as AccountStatus)}
                                        options={ACCOUNT_STATUSES}
                                    />
                                </Box>

                                {/* SAP Code / Tally ID */}
                                <Box>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.6 }}>
                                        <Typography
                                            variant="body2"
                                            sx={{ fontWeight: 600, color: '#374151', fontSize: '0.82rem' }}
                                        >
                                            SAP Code / Tally ID
                                        </Typography>
                                        <Typography variant="caption" sx={{ color: '#9ca3af', fontSize: '0.72rem' }}>
                                            ERP Master Ledger Code
                                        </Typography>
                                    </Box>
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
                                </Box>

                                {/* Source of Lead */}
                                <Box>
                                    <Typography
                                        variant="body2"
                                        sx={{ fontWeight: 600, color: '#374151', fontSize: '0.82rem', mb: 0.6 }}
                                    >
                                        Source of Lead
                                    </Typography>
                                    <StyledSelect
                                        label="Source of Lead"
                                        value={form.sourceOfLead}
                                        onChange={(v) => set('sourceOfLead', v as SourceOfLead)}
                                        options={LEAD_SOURCES}
                                    />
                                </Box>

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
                                            + Add Email
                                        </Button>
                                    </Box>
                                    {form.corporateEmails.length === 0 && (
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
                                    {form.corporateEmails.map((email) => (
                                        <EmailRow
                                            key={email.id}
                                            email={email}
                                            onChange={(updated) => updateEmail(email.id, updated)}
                                            onRemove={() => removeEmail(email.id)}
                                        />
                                    ))}
                                </Box>

                                {/* Annual Turnover */}
                                <Box>
                                    <Typography
                                        variant="body2"
                                        sx={{ fontWeight: 600, color: '#374151', fontSize: '0.82rem', mb: 0.6 }}
                                    >
                                        Annual Turnover
                                    </Typography>
                                    <StyledSelect
                                        label="Annual Turnover"
                                        value={form.annualTurnover}
                                        onChange={(v) => set('annualTurnover', v as AnnualTurnover)}
                                        options={ANNUAL_TURNOVERS}
                                    />
                                </Box>

                                {/* Description */}
                                <Box>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.6 }}>
                                        <Typography
                                            variant="body2"
                                            sx={{ fontWeight: 600, color: '#374151', fontSize: '0.82rem' }}
                                        >
                                            Add Description &amp; Scope
                                        </Typography>
                                        <Typography variant="caption" sx={{ color: '#9ca3af', fontSize: '0.72rem' }}>
                                            {form.description.length} / 1000
                                        </Typography>
                                    </Box>
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
                                </Box>
                            </Box>

                            {/* ── RIGHT COLUMN ─────────────────────────────────── */}
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                                {/* ── EXACT MATCH: Account Verified & Provide Support Card ── */}
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
                                <Box>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.6 }}>
                                        <Typography
                                            variant="body2"
                                            sx={{ fontWeight: 600, color: '#374151', fontSize: '0.82rem' }}
                                        >
                                            Mailing Name
                                        </Typography>
                                        <Typography variant="caption" sx={{ color: '#9ca3af', fontSize: '0.72rem' }}>
                                            Printed on tax invoices
                                        </Typography>
                                    </Box>
                                    <TextField
                                        fullWidth
                                        size="small"
                                        placeholder="e.g. Mohit Traders Private Limited, Delhi"
                                        value={form.mailingName}
                                        onChange={(e) => set('mailingName', e.target.value)}
                                        sx={fieldSx}
                                    />
                                </Box>

                                {/* Type of Entity */}
                                <Box>
                                    <Typography
                                        variant="body2"
                                        sx={{ fontWeight: 600, color: '#374151', fontSize: '0.82rem', mb: 0.6 }}
                                    >
                                        Type of Entity <span style={{ color: '#ef4444' }}>*</span>
                                    </Typography>
                                    <StyledSelect
                                        label="Type of Entity"
                                        value={form.typeOfEntity}
                                        onChange={(v) => set('typeOfEntity', v as TypeOfEntity)}
                                        options={ENTITY_TYPES}
                                        required
                                    />
                                </Box>

                                {/* Customer Type */}
                                <Box>
                                    <Typography
                                        variant="body2"
                                        sx={{ fontWeight: 600, color: '#374151', fontSize: '0.82rem', mb: 0.6 }}
                                    >
                                        Customer Type <span style={{ color: '#ef4444' }}>*</span>
                                    </Typography>
                                    <StyledSelect
                                        label="Customer Type"
                                        value={form.customerType}
                                        onChange={(v) => set('customerType', v as CustomerType)}
                                        options={CUSTOMER_TYPES}
                                        required
                                    />
                                </Box>

                                {/* Showroom / Branch Code */}
                                <Box>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.6 }}>
                                        <Typography
                                            variant="body2"
                                            sx={{ fontWeight: 600, color: '#374151', fontSize: '0.82rem' }}
                                        >
                                            Showroom / Branch Code
                                        </Typography>
                                        <Typography variant="caption" sx={{ color: '#9ca3af', fontSize: '0.72rem' }}>
                                            Store Location ID
                                        </Typography>
                                    </Box>
                                    <TextField
                                        fullWidth
                                        size="small"
                                        placeholder="e.g. DEL-NORTH-04"
                                        value={form.showroomBranchCode}
                                        onChange={(e) => set('showroomBranchCode', e.target.value)}
                                        sx={fieldSx}
                                    />
                                </Box>

                                {/* Member of (Parent Corporation) */}
                                <Box>
                                    <Typography
                                        variant="body2"
                                        sx={{ fontWeight: 600, color: '#374151', fontSize: '0.82rem', mb: 0.6 }}
                                    >
                                        Member of (Parent Corporation)
                                    </Typography>
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
                                </Box>

                                {/* Number of Employees */}
                                <Box>
                                    <Typography
                                        variant="body2"
                                        sx={{ fontWeight: 600, color: '#374151', fontSize: '0.82rem', mb: 0.6 }}
                                    >
                                        Number of Employees
                                    </Typography>
                                    <StyledSelect
                                        label="Number of Employees"
                                        value={form.numberOfEmployees}
                                        onChange={(v) => set('numberOfEmployees', v as NumberOfEmployees)}
                                        options={EMPLOYEE_COUNTS}
                                    />
                                </Box>

                                {/* Assigned to (Account Executive) */}
                                <Box>
                                    <Typography
                                        variant="body2"
                                        sx={{ fontWeight: 600, color: '#374151', fontSize: '0.82rem', mb: 0.6 }}
                                    >
                                        Assigned to (Account Executive) <span style={{ color: '#ef4444' }}>*</span>
                                    </Typography>
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
                                </Box>
                            </Box>
                        </Box>
                    </Box>
                )}

                {/* ── TAB CONTENT: Address Information (Placeholder) ─────────── */}
                {activeTab === 'address' && (
                    <Box sx={{ p: 5, textAlign: 'center' }}>
                        <Box
                            sx={{
                                width: 56,
                                height: 56,
                                borderRadius: '12px',
                                backgroundColor: '#eff6ff',
                                color: '#2563eb',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                mx: 'auto',
                                mb: 2,
                            }}
                        >
                            <PlaceOutlinedIcon sx={{ fontSize: 32 }} />
                        </Box>
                        <Typography variant="h6" sx={{ fontWeight: 700, color: '#1e293b', mb: 0.5 }}>
                            Address Information (3 Locations)
                        </Typography>
                        <Typography variant="body2" sx={{ color: '#64748b', maxWidth: 480, mx: 'auto', mb: 3 }}>
                            Manage registered office, billing locations, shipping hubs, and GST jurisdictions for this
                            organization.
                        </Typography>
                        <Box
                            sx={{
                                border: '1px dashed #cbd5e1',
                                borderRadius: '10px',
                                p: 3,
                                maxWidth: 520,
                                mx: 'auto',
                                backgroundColor: '#f8fafc',
                            }}
                        >
                            <Typography
                                variant="caption"
                                sx={{
                                    color: '#94a3b8',
                                    display: 'block',
                                    mb: 1.5,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em',
                                    fontWeight: 600,
                                }}
                            >
                                Configured Locations
                            </Typography>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.2 }}>
                                <Box
                                    sx={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        p: 1.5,
                                        backgroundColor: '#fff',
                                        borderRadius: '8px',
                                        border: '1px solid #e2e8f0',
                                    }}
                                >
                                    <Box sx={{ textAlign: 'left' }}>
                                        <Typography sx={{ fontWeight: 600, fontSize: '0.84rem', color: '#1e293b' }}>
                                            1. Registered Head Office (HQ)
                                        </Typography>
                                        <Typography sx={{ fontSize: '0.75rem', color: '#64748b' }}>
                                            104, Industrial Area Phase II, Okhla, New Delhi - 110020
                                        </Typography>
                                    </Box>
                                    <Chip
                                        label="Primary"
                                        size="small"
                                        sx={{
                                            height: 22,
                                            fontSize: '0.7rem',
                                            backgroundColor: '#dcfce7',
                                            color: '#16a34a',
                                            fontWeight: 600,
                                        }}
                                    />
                                </Box>
                                <Box
                                    sx={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        p: 1.5,
                                        backgroundColor: '#fff',
                                        borderRadius: '8px',
                                        border: '1px solid #e2e8f0',
                                    }}
                                >
                                    <Box sx={{ textAlign: 'left' }}>
                                        <Typography sx={{ fontWeight: 600, fontSize: '0.84rem', color: '#1e293b' }}>
                                            2. Regional Warehouse (North)
                                        </Typography>
                                        <Typography sx={{ fontSize: '0.75rem', color: '#64748b' }}>
                                            Plot 45, Udyog Vihar Phase 4, Gurugram, Haryana - 122015
                                        </Typography>
                                    </Box>
                                    <Chip
                                        label="Dispatch Hub"
                                        size="small"
                                        sx={{
                                            height: 22,
                                            fontSize: '0.7rem',
                                            backgroundColor: '#e0e7ff',
                                            color: '#4338ca',
                                            fontWeight: 600,
                                        }}
                                    />
                                </Box>
                                <Box
                                    sx={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        p: 1.5,
                                        backgroundColor: '#fff',
                                        borderRadius: '8px',
                                        border: '1px solid #e2e8f0',
                                    }}
                                >
                                    <Box sx={{ textAlign: 'left' }}>
                                        <Typography sx={{ fontWeight: 600, fontSize: '0.84rem', color: '#1e293b' }}>
                                            3. Service Hub &amp; Showroom
                                        </Typography>
                                        <Typography sx={{ fontSize: '0.75rem', color: '#64748b' }}>
                                            Sector 63, Noida, Uttar Pradesh - 201301
                                        </Typography>
                                    </Box>
                                    <Chip
                                        label="Branch Location"
                                        size="small"
                                        sx={{
                                            height: 22,
                                            fontSize: '0.7rem',
                                            backgroundColor: '#fef3c7',
                                            color: '#b45309',
                                            fontWeight: 600,
                                        }}
                                    />
                                </Box>
                            </Box>
                        </Box>
                    </Box>
                )}

                {/* ── TAB CONTENT: Tax & Bank Details (Placeholder) ───────────── */}
                {activeTab === 'tax_bank' && (
                    <Box sx={{ p: 5, textAlign: 'center' }}>
                        <Box
                            sx={{
                                width: 56,
                                height: 56,
                                borderRadius: '12px',
                                backgroundColor: '#fff7ed',
                                color: '#f97316',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                mx: 'auto',
                                mb: 2,
                            }}
                        >
                            <AccountBalanceOutlinedIcon sx={{ fontSize: 32 }} />
                        </Box>
                        <Typography variant="h6" sx={{ fontWeight: 700, color: '#1e293b', mb: 0.5 }}>
                            Tax &amp; Bank Details
                        </Typography>
                        <Typography variant="body2" sx={{ color: '#64748b', maxWidth: 480, mx: 'auto', mb: 3 }}>
                            Configure GSTIN details, PAN card validation, bank account IFSC, TDS/TCS rates, and payment
                            mandate settings.
                        </Typography>
                        <Box
                            sx={{
                                border: '1px dashed #cbd5e1',
                                borderRadius: '10px',
                                p: 3,
                                maxWidth: 520,
                                mx: 'auto',
                                backgroundColor: '#f8fafc',
                            }}
                        >
                            <Typography
                                variant="caption"
                                sx={{
                                    color: '#94a3b8',
                                    display: 'block',
                                    mb: 1,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em',
                                    fontWeight: 600,
                                }}
                            >
                                Tax &amp; Banking Parameters
                            </Typography>
                            <Typography variant="body2" sx={{ color: '#64748b', fontSize: '0.84rem' }}>
                                GSTIN portal connection active • Direct auto-sync ready
                            </Typography>
                        </Box>
                    </Box>
                )}

                {/* ── TAB CONTENT: Partner Company & Licensing (Placeholder) ── */}
                {activeTab === 'partner_licensing' && (
                    <Box sx={{ p: 5, textAlign: 'center' }}>
                        <Box
                            sx={{
                                width: 56,
                                height: 56,
                                borderRadius: '12px',
                                backgroundColor: '#f0fdf4',
                                color: '#16a34a',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                mx: 'auto',
                                mb: 2,
                            }}
                        >
                            <WorkspacePremiumOutlinedIcon sx={{ fontSize: 32 }} />
                        </Box>
                        <Typography variant="h6" sx={{ fontWeight: 700, color: '#1e293b', mb: 0.5 }}>
                            Partner Company &amp; Licensing
                        </Typography>
                        <Typography variant="body2" sx={{ color: '#64748b', maxWidth: 480, mx: 'auto', mb: 3 }}>
                            Manage partner tier levels, OEM product authorizations, reseller certificates, and annual
                            license renewals.
                        </Typography>
                        <Box
                            sx={{
                                border: '1px dashed #cbd5e1',
                                borderRadius: '10px',
                                p: 3,
                                maxWidth: 520,
                                mx: 'auto',
                                backgroundColor: '#f8fafc',
                            }}
                        >
                            <Typography
                                variant="caption"
                                sx={{
                                    color: '#94a3b8',
                                    display: 'block',
                                    mb: 1,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em',
                                    fontWeight: 600,
                                }}
                            >
                                Licensing Status
                            </Typography>
                            <Typography variant="body2" sx={{ color: '#64748b', fontSize: '0.84rem' }}>
                                Authorized Reseller Agreement Active • Validity: 31 Dec 2026
                            </Typography>
                        </Box>
                    </Box>
                )}

                {/* ── Tally sync notice at card footer ──────────────────────── */}
                <Box
                    sx={{
                        mx: 3,
                        mb: 3,
                        p: 2,
                        borderRadius: '10px',
                        border: '1px solid #bbf7d0',
                        backgroundColor: '#f0fdf4',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: 2,
                    }}
                >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Box
                            sx={{
                                width: 32,
                                height: 32,
                                borderRadius: '8px',
                                backgroundColor: '#dcfce7',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#16a34a',
                                flexShrink: 0,
                            }}
                        >
                            <CheckCircleOutlinedIcon sx={{ fontSize: 20 }} />
                        </Box>
                        <Box>
                            <Typography
                                variant="body2"
                                sx={{ fontWeight: 700, color: '#15803d', fontSize: '0.84rem' }}
                            >
                                Tally Prime Ledger Auto-Sync Ready
                            </Typography>
                            <Typography variant="caption" sx={{ color: '#16a34a', fontSize: '0.75rem' }}>
                                Mandatory fields for GST E-Way &amp; E-Invoicing compliant ledger creation satisfied.
                            </Typography>
                        </Box>
                    </Box>

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Typography sx={{ fontSize: '0.75rem', color: '#64748b' }}>
                            Last modified by mittal.sharma (Today, 10:48 AM)
                        </Typography>
                        <Button
                            size="small"
                            variant="outlined"
                            sx={{
                                fontSize: '0.75rem',
                                textTransform: 'none',
                                fontWeight: 600,
                                color: '#334155',
                                borderColor: '#cbd5e1',
                                borderRadius: '6px',
                                height: 28,
                                px: 1.5,
                                backgroundColor: '#fff',
                                '&:hover': { backgroundColor: '#f8fafc', borderColor: '#94a3b8' },
                            }}
                        >
                            View Audit Log
                        </Button>
                    </Box>
                </Box>
            </Paper>

            {/* ── Bottom sticky action bar ──────────────────────────────────── */}
            <Box
                sx={{
                    position: 'fixed',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    backgroundColor: '#fff',
                    borderTop: '1px solid #e2e8f0',
                    px: { xs: 2, md: 4 },
                    py: 1.5,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    zIndex: 1200,
                    boxShadow: '0 -2px 10px rgba(0,0,0,0.05)',
                }}
            >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#22c55e' }} />
                    <Typography sx={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 500 }}>
                        All changes staged locally in CRM memory buffer
                    </Typography>
                </Box>

                <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                    <Button
                        variant="outlined"
                        size="small"
                        onClick={handleDiscard}
                        disabled={submitting}
                        sx={{
                            borderColor: '#cbd5e1',
                            color: '#334155',
                            borderRadius: '8px',
                            fontSize: '0.82rem',
                            textTransform: 'none',
                            fontWeight: 600,
                            px: 2.5,
                            height: 36,
                            '&:hover': { borderColor: '#94a3b8', backgroundColor: '#f8fafc' },
                        }}
                    >
                        Cancel
                    </Button>
                    <Button
                        variant="outlined"
                        size="small"
                        onClick={() => handleSubmit(false)}
                        disabled={submitting}
                        sx={{
                            borderColor: '#cbd5e1',
                            color: '#1d4ed8',
                            backgroundColor: '#eff6ff',
                            borderRadius: '8px',
                            fontSize: '0.82rem',
                            textTransform: 'none',
                            fontWeight: 600,
                            px: 2.5,
                            height: 36,
                            '&:hover': { backgroundColor: '#dbeafe', borderColor: '#93c5fd' },
                        }}
                    >
                        Save &amp; Create Another
                    </Button>
                    <Button
                        variant="contained"
                        size="small"
                        onClick={() => handleSubmit(true)}
                        disabled={submitting}
                        startIcon={
                            submitting ? (
                                <CircularProgress size={14} color="inherit" />
                            ) : undefined
                        }
                        sx={{
                            background: 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)',
                            borderRadius: '8px',
                            fontSize: '0.82rem',
                            textTransform: 'none',
                            fontWeight: 700,
                            px: 3,
                            height: 36,
                            boxShadow: '0 2px 8px rgba(37,99,235,0.3)',
                            '&:hover': { background: 'linear-gradient(135deg, #1e40af 0%, #1d4ed8 100%)' },
                        }}
                    >
                        Save Organization
                    </Button>
                </Box>
            </Box>

            {/* ── Toast ──────────────────────────────────────────────────────── */}
            <Snackbar
                open={toast.open}
                autoHideDuration={4000}
                onClose={() => setToast((t) => ({ ...t, open: false }))}
                anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
            >
                <Alert
                    severity={toast.severity}
                    variant="filled"
                    onClose={() => setToast((t) => ({ ...t, open: false }))}
                >
                    {toast.message}
                </Alert>
            </Snackbar>
        </Box>
    );
}
