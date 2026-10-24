'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
    Box,
    Typography,
    IconButton,
    Chip,
    Tooltip,
    InputBase,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import ConfirmationNumberOutlinedIcon from '@mui/icons-material/ConfirmationNumberOutlined';
import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import PersonAddAlt1OutlinedIcon from '@mui/icons-material/PersonAddAlt1Outlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import TrendingUpOutlinedIcon from '@mui/icons-material/TrendingUpOutlined';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import RequestQuoteOutlinedIcon from '@mui/icons-material/RequestQuoteOutlined';
import HandshakeOutlinedIcon from '@mui/icons-material/HandshakeOutlined';
import AdminPanelSettingsOutlinedIcon from '@mui/icons-material/AdminPanelSettingsOutlined';

import { DataTable, type DataTableColumn, type SortOrder } from '../DataTable';
import { subscribeCrmSync } from '@/services';
import {
    resolveRelatedRecordsForModule,
    type CrmEntityType,
} from '@/config/relatedModules.config';

export interface RelatedRecordsTableViewProps {
    open: boolean;
    moduleId: string;
    moduleTitle: string;
    parentEntityTitle: string;
    leftOffset: number; // dynamically adjusts based on sidebar collapsed state (72px or 260px)
    rightOffset: number; // width of right drawer (~540px - 580px)
    isRightDrawerCollapsed?: boolean;
    onClose?: () => void;
    onRowClick: (row: Record<string, unknown>, moduleId: string) => void;
    parentRecordId?: string;
    entityData?: unknown;
    entityType?: CrmEntityType;
}

type RelatedRow = Record<string, unknown>;

const formatCurrency = (val: unknown): string => {
    const num = Number(val);
    if (!Number.isFinite(num)) return String(val ?? '-');
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0,
    }).format(num);
};

function normalizeModuleKey(moduleId: string): string {
    const normalized = moduleId.trim().toLowerCase().replace(/-/g, '_');
    if (normalized === 'quotes') return 'quotations';
    if (normalized === 'line_items') return 'products';
    return normalized;
}

function getModuleIcon(moduleKey: string): React.ReactNode {
    switch (moduleKey) {
        case 'activities':
            return <AssignmentOutlinedIcon sx={{ fontSize: 17 }} />;
        case 'tickets':
            return <ConfirmationNumberOutlinedIcon sx={{ fontSize: 17 }} />;
        case 'contacts':
            return <PeopleOutlinedIcon sx={{ fontSize: 17 }} />;
        case 'contracts':
            return <DescriptionOutlinedIcon sx={{ fontSize: 17 }} />;
        case 'history':
            return <HistoryOutlinedIcon sx={{ fontSize: 17 }} />;
        case 'leads':
            return <PersonAddAlt1OutlinedIcon sx={{ fontSize: 17 }} />;
        case 'organizations':
            return <AccountTreeOutlinedIcon sx={{ fontSize: 17 }} />;
        case 'partner_contacts':
            return <GroupsOutlinedIcon sx={{ fontSize: 17 }} />;
        case 'opportunities':
            return <TrendingUpOutlinedIcon sx={{ fontSize: 17 }} />;
        case 'member_organizations':
            return <AccountTreeOutlinedIcon sx={{ fontSize: 17 }} />;
        case 'documents':
            return <FolderOutlinedIcon sx={{ fontSize: 17 }} />;
        case 'products':
            return <Inventory2OutlinedIcon sx={{ fontSize: 17 }} />;
        case 'quotations':
            return <RequestQuoteOutlinedIcon sx={{ fontSize: 17 }} />;
        case 'partner_company':
            return <HandshakeOutlinedIcon sx={{ fontSize: 17 }} />;
        case 'security_groups':
            return <AdminPanelSettingsOutlinedIcon sx={{ fontSize: 17 }} />;
        default:
            return <AssignmentOutlinedIcon sx={{ fontSize: 17 }} />;
    }
}

function renderPrimaryCell(value: unknown, mono = false): React.ReactNode {
    return (
        <Typography
            noWrap
            sx={{
                fontSize: '0.78rem',
                fontWeight: 700,
                color: '#1d4ed8',
                fontFamily: mono ? 'monospace' : 'inherit',
                cursor: 'pointer',
                '&:hover': { textDecoration: 'underline' },
            }}
        >
            {String(value || '-')}
        </Typography>
    );
}

function renderStatusPill(status: unknown): React.ReactNode {
    const label = String(status || 'Active');
    const lower = label.toLowerCase();
    let bg = '#f1f5f9';
    let color = '#475569';
    let border = '#cbd5e1';

    if (
        lower.includes('active') ||
        lower.includes('completed') ||
        lower.includes('accepted') ||
        lower.includes('won') ||
        lower.includes('published') ||
        lower.includes('resolved')
    ) {
        bg = '#ecfdf5';
        color = '#047857';
        border = '#a7f3d0';
    } else if (
        lower.includes('open') ||
        lower.includes('sent') ||
        lower.includes('scheduled') ||
        lower.includes('new') ||
        lower.includes('in progress') ||
        lower.includes('proposal')
    ) {
        bg = '#eff6ff';
        color = '#1d4ed8';
        border = '#bfdbfe';
    } else if (lower.includes('pending') || lower.includes('negotiation') || lower.includes('warm')) {
        bg = '#fffbeb';
        color = '#b45309';
        border = '#fde68a';
    } else if (lower.includes('rejected') || lower.includes('lost') || lower.includes('expired')) {
        bg = '#fef2f2';
        color = '#b91c1c';
        border = '#fecaca';
    }

    return (
        <Chip
            label={label}
            size="small"
            sx={{
                height: 20,
                fontSize: '0.68rem',
                fontWeight: 700,
                backgroundColor: bg,
                color,
                border: `1px solid ${border}`,
            }}
        />
    );
}

function getColumnsForModule(moduleKey: string): DataTableColumn<RelatedRow>[] {
    switch (moduleKey) {
        case 'activities':
            return [
                { id: 'subject', label: 'Subject', minWidth: 200, sortable: true, render: (r) => renderPrimaryCell(r.subject) },
                { id: 'status', label: 'Status', minWidth: 120, sortable: true, render: (r) => renderStatusPill(r.status) },
                { id: 'contact', label: 'Contact', minWidth: 150, sortable: true, accessor: 'contact' },
                { id: 'startDate', label: 'Start Date', minWidth: 130, sortable: true, accessor: 'startDate' },
                { id: 'assignedUser', label: 'Assigned User', minWidth: 140, sortable: true, accessor: 'assignedUser' },
            ];

        case 'tickets':
            return [
                { id: 'ticketNumber', label: 'Ticket Number', minWidth: 140, sortable: true, render: (r) => renderPrimaryCell(r.ticketNumber, true) },
                { id: 'subject', label: 'Subject', minWidth: 210, sortable: true, accessor: 'subject' },
                { id: 'status', label: 'Status', minWidth: 120, sortable: true, render: (r) => renderStatusPill(r.status) },
                { id: 'priority', label: 'Priority', minWidth: 110, sortable: true, accessor: 'priority' },
                { id: 'supportType', label: 'Support Type', minWidth: 140, sortable: true, accessor: 'supportType' },
                { id: 'supportMode', label: 'Support Mode', minWidth: 130, sortable: true, accessor: 'supportMode' },
                { id: 'dateCreated', label: 'Date Created', minWidth: 130, sortable: true, accessor: 'dateCreated' },
                { id: 'assignedUser', label: 'Assigned User', minWidth: 140, sortable: true, accessor: 'assignedUser' },
            ];

        case 'contacts':
            return [
                { id: 'name', label: 'Name', minWidth: 180, sortable: true, render: (r) => renderPrimaryCell(r.name) },
                { id: 'organizationName', label: 'Organization', minWidth: 190, sortable: true, accessor: 'organizationName' },
                {
                    id: 'mobile',
                    label: 'Mobile / Phone',
                    minWidth: 150,
                    sortable: true,
                    render: (r) => String(r.mobile || r.officePhone || '-'),
                },
                {
                    id: 'email',
                    label: 'Email',
                    minWidth: 190,
                    sortable: true,
                    render: (r) => {
                        const emails = r.emailAddresses as Array<{ email?: string }> | undefined;
                        return String(r.email || emails?.[0]?.email || '-');
                    },
                },
                { id: 'designation', label: 'Designation', minWidth: 150, sortable: true, accessor: 'designation' },
                {
                    id: 'assignedTo',
                    label: 'Assigned User',
                    minWidth: 140,
                    sortable: true,
                    render: (r) => String(r.assignedTo || r.assignedUser || 'mittal.sharma'),
                },
            ];

        case 'contracts':
            return [
                { id: 'contractNumber', label: 'Contract Number', minWidth: 150, sortable: true, render: (r) => renderPrimaryCell(r.contractNumber, true) },
                { id: 'contractTitle', label: 'Contract Title', minWidth: 200, sortable: true, accessor: 'contractTitle' },
                { id: 'organizationName', label: 'Organization Name', minWidth: 190, sortable: true, accessor: 'organizationName' },
                { id: 'contractManager', label: 'Contract Manager', minWidth: 150, sortable: true, accessor: 'contractManager' },
                { id: 'contractValue', label: 'Contract Value', minWidth: 140, sortable: true, render: (r) => formatCurrency(r.contractValue) },
                { id: 'status', label: 'Status', minWidth: 120, sortable: true, render: (r) => renderStatusPill(r.status) },
                { id: 'contractEndDate', label: 'Contract End Date', minWidth: 150, sortable: true, accessor: 'contractEndDate' },
                { id: 'contractPeriod', label: 'Contract Period', minWidth: 140, sortable: true, accessor: 'contractPeriod' },
                { id: 'dateCreated', label: 'Date Created', minWidth: 130, sortable: true, accessor: 'dateCreated' },
            ];

        case 'history':
            return [
                { id: 'subject', label: 'Subject', minWidth: 210, sortable: true, render: (r) => renderPrimaryCell(r.subject) },
                { id: 'status', label: 'Status', minWidth: 120, sortable: true, render: (r) => renderStatusPill(r.status) },
                { id: 'contact', label: 'Contact', minWidth: 150, sortable: true, accessor: 'contact' },
                { id: 'dateModified', label: 'Date Modified', minWidth: 140, sortable: true, accessor: 'dateModified' },
                { id: 'dateCreated', label: 'Date Created', minWidth: 140, sortable: true, accessor: 'dateCreated' },
                { id: 'dueDate', label: 'Due Date', minWidth: 130, sortable: true, accessor: 'dueDate' },
                { id: 'assignedUser', label: 'Assigned User', minWidth: 140, sortable: true, accessor: 'assignedUser' },
            ];

        case 'leads':
            return [
                { id: 'leadCode', label: 'Lead Number', minWidth: 140, sortable: true, render: (r) => renderPrimaryCell(r.leadCode || r.leadNumber, true) },
                { id: 'name', label: 'Name', minWidth: 170, sortable: true, render: (r) => renderPrimaryCell(r.name) },
                { id: 'organizationName', label: 'Organization Name', minWidth: 190, sortable: true, accessor: 'organizationName' },
                { id: 'status', label: 'Status', minWidth: 130, sortable: true, render: (r) => renderStatusPill(r.status) },
                { id: 'leadSource', label: 'Lead Source', minWidth: 140, sortable: true, accessor: 'leadSource' },
                {
                    id: 'productCategory',
                    label: 'Product Category',
                    minWidth: 170,
                    sortable: false,
                    render: (r) =>
                        Array.isArray(r.productCategory) ? r.productCategory.join(', ') : String(r.productCategory || '-'),
                },
                {
                    id: 'email',
                    label: 'Email',
                    minWidth: 180,
                    sortable: false,
                    render: (r) => {
                        const emails = r.emailAddresses as Array<{ email?: string }> | undefined;
                        return String(r.email || emails?.[0]?.email || '-');
                    },
                },
                { id: 'mobile', label: 'Mobile', minWidth: 140, sortable: true, accessor: 'mobile' },
                { id: 'assignedTo', label: 'Assigned User', minWidth: 140, sortable: true, render: (r) => String(r.assignedTo || r.assignedUser || 'mittal.sharma') },
                { id: 'createdAt', label: 'Date Created', minWidth: 130, sortable: true, render: (r) => String(r.createdAt || r.dateCreated || '-') },
            ];

        case 'organizations':
            return [
                { id: 'organizationName', label: 'Organization Name', minWidth: 210, sortable: true, render: (r) => renderPrimaryCell(r.organizationName) },
                { id: 'natureOfBusiness', label: 'Nature of Business', minWidth: 170, sortable: true, accessor: 'natureOfBusiness' },
                { id: 'customerType', label: 'Customer Type', minWidth: 140, sortable: true, accessor: 'customerType' },
                { id: 'accountStatus', label: 'Status', minWidth: 120, sortable: true, render: (r) => renderStatusPill(r.accountStatus) },
                { id: 'billingCity', label: 'City', minWidth: 130, sortable: true, accessor: 'billingCity' },
                { id: 'billingState', label: 'State', minWidth: 130, sortable: true, accessor: 'billingState' },
            ];

        case 'partner_contacts':
            return [
                { id: 'name', label: 'Name', minWidth: 180, sortable: true, render: (r) => renderPrimaryCell(r.name) },
                { id: 'email', label: 'Email', minWidth: 200, sortable: true, accessor: 'email' },
                { id: 'phone', label: 'Phone', minWidth: 150, sortable: true, accessor: 'phone' },
            ];

        case 'opportunities':
            return [
                { id: 'opportunityCode', label: 'Opp Number', minWidth: 150, sortable: true, render: (r) => renderPrimaryCell(r.opportunityCode || r.oppNumber, true) },
                { id: 'organizationName', label: 'Organization Name', minWidth: 190, sortable: true, accessor: 'organizationName' },
                {
                    id: 'productCategory',
                    label: 'Product Category',
                    minWidth: 170,
                    sortable: false,
                    render: (r) =>
                        Array.isArray(r.productCategory) ? r.productCategory.join(', ') : String(r.productCategory || '-'),
                },
                { id: 'type', label: 'Type', minWidth: 140, sortable: true, accessor: 'type' },
                { id: 'salesStage', label: 'Sales Stage', minWidth: 160, sortable: true, render: (r) => renderStatusPill(r.salesStage) },
                {
                    id: 'subTotal',
                    label: 'Actual (Before Tax)',
                    minWidth: 150,
                    sortable: true,
                    render: (r) => formatCurrency(r.subTotal ?? r.grandTotal ?? 0),
                },
                { id: 'assignedTo', label: 'Assigned User', minWidth: 140, sortable: true, render: (r) => String(r.assignedTo || r.assignedUser || 'mittal.sharma') },
                { id: 'createdAt', label: 'Date Created', minWidth: 130, sortable: true, render: (r) => String(r.createdAt || r.dateCreated || '-') },
            ];

        case 'member_organizations':
            return [
                { id: 'name', label: 'Name', minWidth: 200, sortable: true, render: (r) => renderPrimaryCell(r.name) },
                { id: 'city', label: 'City', minWidth: 140, sortable: true, accessor: 'city' },
                { id: 'billingCountry', label: 'Billing Country', minWidth: 150, sortable: true, accessor: 'billingCountry' },
                { id: 'phone', label: 'Phone', minWidth: 150, sortable: true, accessor: 'phone' },
            ];

        case 'documents':
            return [
                { id: 'name', label: 'Name', minWidth: 190, sortable: true, render: (r) => renderPrimaryCell(r.name) },
                { id: 'file', label: 'File', minWidth: 180, sortable: true, accessor: 'file' },
                { id: 'documentType', label: 'Document Type', minWidth: 140, sortable: true, accessor: 'documentType' },
                { id: 'category', label: 'Category', minWidth: 140, sortable: true, accessor: 'category' },
                { id: 'status', label: 'Status', minWidth: 120, sortable: true, render: (r) => renderStatusPill(r.status) },
                { id: 'publishDate', label: 'Publish Date', minWidth: 130, sortable: true, accessor: 'publishDate' },
            ];

        case 'products':
            return [
                { id: 'productName', label: 'Product Name', minWidth: 210, sortable: true, render: (r) => renderPrimaryCell(r.productName) },
                { id: 'serialNumber', label: 'Serial Number', minWidth: 150, sortable: true, render: (r) => String(r.serialNumber || r.productCode || '-') },
                { id: 'status', label: 'Status', minWidth: 120, sortable: true, render: (r) => renderStatusPill(r.status || 'Active') },
                { id: 'warrantyPeriod', label: 'Warranty Period', minWidth: 140, sortable: true, render: (r) => String(r.warrantyPeriod || '12 Months') },
                { id: 'warrantyEndDate', label: 'Warranty End Date', minWidth: 150, sortable: true, render: (r) => String(r.warrantyEndDate || '2027-03-31') },
                { id: 'location', label: 'Location', minWidth: 140, sortable: true, render: (r) => String(r.location || 'Primary Site') },
                { id: 'updatedAt', label: 'Date Modified', minWidth: 130, sortable: true, render: (r) => String(r.updatedAt || r.dateModified || '-') },
                { id: 'createdAt', label: 'Date Created', minWidth: 130, sortable: true, render: (r) => String(r.createdAt || r.dateCreated || '-') },
            ];

        case 'quotations':
            return [
                { id: 'quotationCode', label: 'Quotation Number', minWidth: 150, sortable: true, render: (r) => renderPrimaryCell(r.quotationCode, true) },
                {
                    id: 'quotationTitle',
                    label: 'Quotation Title',
                    minWidth: 210,
                    sortable: true,
                    render: (r) => String(r.quotationTitle || r.quotationSubject || 'Quotation'),
                },
                { id: 'quoteStage', label: 'Quote Stage', minWidth: 130, sortable: true, render: (r) => renderStatusPill(r.quoteStage || r.status) },
                { id: 'contactName', label: 'Contact', minWidth: 160, sortable: true, accessor: 'contactName' },
                { id: 'organizationName', label: 'Organization', minWidth: 190, sortable: true, accessor: 'organizationName' },
                { id: 'grandTotal', label: 'Grand Total', minWidth: 140, sortable: true, render: (r) => formatCurrency(r.grandTotal) },
                { id: 'validUntil', label: 'Valid Until', minWidth: 130, sortable: true, accessor: 'validUntil' },
                { id: 'quoteDate', label: 'Date Created', minWidth: 130, sortable: true, render: (r) => String(r.quoteDate || r.createdAt || '-') },
                { id: 'assignedTo', label: 'User', minWidth: 140, sortable: true, render: (r) => String(r.assignedTo || 'mittal.sharma') },
            ];

        case 'partner_company':
            return [
                { id: 'partnerName', label: 'Partner Name', minWidth: 200, sortable: true, render: (r) => renderPrimaryCell(r.partnerName) },
                { id: 'industry', label: 'Industry', minWidth: 160, sortable: true, accessor: 'industry' },
                { id: 'officePhone', label: 'Office Phone', minWidth: 150, sortable: true, accessor: 'officePhone' },
                { id: 'assignedTo', label: 'Assigned to', minWidth: 140, sortable: true, accessor: 'assignedTo' },
            ];

        case 'security_groups':
            return [
                { id: 'name', label: 'Name', minWidth: 200, sortable: true, render: (r) => renderPrimaryCell(r.name) },
                { id: 'description', label: 'Description', minWidth: 280, sortable: true, accessor: 'description' },
            ];

        default:
            return [
                { id: 'subject', label: 'Subject', minWidth: 200, sortable: true, render: (r) => renderPrimaryCell(r.subject || r.name) },
                { id: 'status', label: 'Status', minWidth: 120, sortable: true, render: (r) => renderStatusPill(r.status) },
                { id: 'assignedUser', label: 'Assigned User', minWidth: 140, sortable: true, accessor: 'assignedUser' },
            ];
    }
}

export function RelatedRecordsTableView({
    open,
    moduleId,
    moduleTitle,
    parentEntityTitle,
    leftOffset,
    rightOffset,
    isRightDrawerCollapsed = false,
    onClose,
    onRowClick,
    parentRecordId,
    entityData,
    entityType = 'organization',
}: RelatedRecordsTableViewProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [sortField, setSortField] = useState<string>('');
    const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
    const [activeRowId, setActiveRowId] = useState<string | null>(null);
    const [syncVersion, setSyncVersion] = useState(0);

    useEffect(() => {
        const unsubscribe = subscribeCrmSync(() => {
            setSyncVersion((v) => v + 1);
        });
        return () => unsubscribe();
    }, []);

    const moduleKey = useMemo(() => normalizeModuleKey(moduleId), [moduleId]);

    const columns = useMemo(() => getColumnsForModule(moduleKey), [moduleKey]);

    const rawRecords = useMemo(() => {
        void syncVersion;
        return resolveRelatedRecordsForModule(
            moduleKey,
            parentEntityTitle,
            parentRecordId,
            entityData,
            entityType
        );
    }, [moduleKey, parentEntityTitle, parentRecordId, entityData, entityType, syncVersion]);

    const filteredAndSortedRecords = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        let list = rawRecords;

        if (q) {
            list = list.filter((row) =>
                Object.values(row).some((v) =>
                    String(v ?? '')
                        .toLowerCase()
                        .includes(q)
                )
            );
        }

        if (sortField) {
            list = [...list].sort((a, b) => {
                const valA = String(a[sortField] ?? '').toLowerCase();
                const valB = String(b[sortField] ?? '').toLowerCase();
                if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
                if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
                return 0;
            });
        }

        return list;
    }, [rawRecords, searchQuery, sortField, sortOrder]);

    if (!open) {
        return null;
    }

    const handleSort = (field: string) => {
        if (sortField === field) {
            setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortField(field);
            setSortOrder('asc');
        }
    };

    const effectiveRightOffset = isRightDrawerCollapsed ? 28 : rightOffset;

    return (
        <Box
            component="section"
            sx={{
                position: 'fixed',
                top: 0,
                bottom: 0,
                left: leftOffset,
                right: effectiveRightOffset,
                zIndex: 1290, // Tucks nicely underneath both side panels
                backgroundColor: '#ffffff',
                borderRight: '1px solid #cbd5e1', // Adds a clean edge
                display: 'flex',
                flexDirection: 'column',
                transition: 'left 0.25s cubic-bezier(0.4, 0, 0.2, 1), right 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                boxShadow: 'none', // Remove heavy shadow, let the right drawer cast its shadow over this
                overflow: 'hidden',
            }}
        >
            {/* ── Legacy Dark Slate Header Banner (42px) ───────────────────── */}
            <Box
                sx={{
                    height: 42,
                    minHeight: 42,
                    px: 2,
                    backgroundColor: '#475569',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 1.5,
                    flexShrink: 0,
                    borderBottom: '1px solid #334155',
                }}
            >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', color: '#e2e8f0' }}>
                        {getModuleIcon(moduleKey)}
                    </Box>
                    <Typography
                        noWrap
                        sx={{
                            fontSize: '0.78rem',
                            fontWeight: 800,
                            letterSpacing: '0.06em',
                            textTransform: 'uppercase',
                            color: '#ffffff',
                        }}
                    >
                        {moduleTitle}
                    </Typography>
                    <Chip
                        label={filteredAndSortedRecords.length}
                        size="small"
                        sx={{
                            height: 19,
                            minWidth: 24,
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            backgroundColor: 'rgba(255, 255, 255, 0.18)',
                            color: '#ffffff',
                            borderRadius: '6px',
                            '& .MuiChip-label': { px: 0.75 },
                        }}
                    />
                    {parentEntityTitle && (
                        <Typography
                            noWrap
                            sx={{
                                fontSize: '0.72rem',
                                fontWeight: 500,
                                color: '#cbd5e1',
                                ml: 0.5,
                                display: { xs: 'none', lg: 'inline' },
                            }}
                        >
                            • {parentEntityTitle}
                        </Typography>
                    )}
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            backgroundColor: 'rgba(15, 23, 42, 0.28)',
                            border: '1px solid rgba(255, 255, 255, 0.18)',
                            borderRadius: '6px',
                            px: 1,
                            height: 26,
                            width: { xs: 130, md: 190 },
                        }}
                    >
                        <SearchIcon sx={{ fontSize: 14, color: '#cbd5e1', mr: 0.6 }} />
                        <InputBase
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder={`Filter ${moduleTitle.toLowerCase()}...`}
                            sx={{
                                fontSize: '0.73rem',
                                color: '#ffffff',
                                width: '100%',
                                '& input::placeholder': {
                                    color: '#cbd5e1',
                                    opacity: 0.85,
                                },
                            }}
                        />
                    </Box>

                    {/* Show Close [X] button ONLY when the right drawer is collapsed */}
                    {isRightDrawerCollapsed && onClose && (
                        <Tooltip title="Close Related View & Return to Table">
                            <IconButton
                                size="small"
                                onClick={onClose}
                                aria-label="Close related view"
                                sx={{
                                    color: '#cbd5e1',
                                    p: 0.6,
                                    borderRadius: '6px',
                                    flexShrink: 0,
                                    '&:hover': {
                                        backgroundColor: 'rgba(255, 255, 255, 0.12)',
                                        color: '#ffffff',
                                    },
                                }}
                            >
                                <CloseIcon sx={{ fontSize: 18 }} />
                            </IconButton>
                        </Tooltip>
                    )}
                </Box>
            </Box>

            {/* ── Scrollable Universal DataTable Body ──────────────────────── */}
            <Box
                sx={{
                    flex: 1,
                    overflow: 'auto',
                    backgroundColor: '#ffffff',
                    display: 'flex',
                    flexDirection: 'column',
                }}
            >
                <DataTable<RelatedRow>
                    data={filteredAndSortedRecords}
                    columns={columns}
                    selectable={false}
                    sortField={sortField}
                    sortOrder={sortOrder}
                    onSort={handleSort}
                    activeRowId={activeRowId}
                    onRowClick={(row) => {
                        setActiveRowId(String(row.id ?? ''));
                        onRowClick(row, moduleKey);
                    }}
                    emptyTitle={`No ${moduleTitle.toLowerCase()} records found`}
                    emptyDescription={`No linked ${moduleTitle.toLowerCase()} records matched for ${parentEntityTitle || 'this record'}.`}
                    minHeight={240}
                />
            </Box>
        </Box>
    );
}
