'use client';

import React, { useMemo, useState } from 'react';
import { getCountryNameByCode } from '@/data/addressMaster';
import { wasModified } from './RecordAuditFooter';
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
import { RecordLink } from '../RecordLink';
import { ROUTES } from '@/config/constants';
import {
    resolveRelatedRecordsForModule,
    useRelatedDatasets,
    type CrmEntityType,
} from '@/config/relatedModules.config';
import { useDropdownOptionLabel } from '@/hooks/queries/useFormConfigs';
import { useShowRecordNumber } from '@/hooks/queries/useDocumentSeries';
import { moduleKeyFrom, moduleTableTintVars } from '@/theme/moduleColors';
import { isShownField } from '@/utils/recordNumbers';

export interface RelatedRecordsTableViewProps {
    open: boolean;
    moduleId: string;
    moduleTitle: string;
    parentEntityTitle: string;
    leftOffset: number; // dynamically adjusts based on sidebar collapsed state (72px or 260px)
    rightOffset: number; // width of right drawer (~540px - 580px)
    isRightDrawerCollapsed?: boolean;
    onClose?: () => void;
    /** Tooltip of the close button. */
    closeTooltip?: string;
    onRowClick: (row: Record<string, unknown>, moduleId: string) => void;
    parentRecordId?: string;
    entityData?: unknown;
    entityType?: CrmEntityType;
}

type RelatedRow = Record<string, unknown>;

/** The related record's full page, for modules whose rows are real records (others have no page to open). */
function relatedRecordHref(moduleKey: string, row: RelatedRow): string | undefined {
    const id = row.id ? String(row.id) : '';
    switch (moduleKey) {
        case 'leads':
            return id ? ROUTES.LEAD_DETAIL(id) : undefined;
        case 'opportunities':
            return id ? ROUTES.OPPORTUNITY_DETAIL(id) : undefined;
        case 'quotations':
            return id ? ROUTES.QUOTATION_DETAIL(id) : undefined;
        case 'organizations':
            return id ? ROUTES.ORGANIZATION_DETAIL(id) : undefined;
        case 'contacts':
            return id ? ROUTES.CONTACT_DETAIL(id) : undefined;
        case 'tickets':
            return id ? ROUTES.TICKET_DETAIL(id) : undefined;
        case 'products':
            // Line-item rows carry their own id; the catalogue product is `productId`.
            return row.productId ? ROUTES.PRODUCT_DETAIL(String(row.productId)) : undefined;
        default:
            return undefined;
    }
}

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

function renderPrimaryCell(value: unknown, mono = false, href?: string): React.ReactNode {
    // A real link when the record has a page: a plain click still bubbles to the row (secondary drawer),
    // while Ctrl / middle / right click open the page in a new tab.
    if (href && value) {
        return (
            <RecordLink
                href={href}
                sx={{
                    display: 'block',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    fontFamily: mono ? 'monospace' : 'inherit',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                }}
            >
                {String(value)}
            </RecordLink>
        );
    }
    return (
        <Typography
            noWrap
            sx={{
                fontSize: '0.78rem',
                fontWeight: 700,
                color: 'var(--crm-text-blue-700)',
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
    let bg = 'var(--mui-palette-background-hover)';
    let color = 'var(--crm-slate-600)';
    let border = 'var(--mui-palette-border-strong)';

    if (
        lower.includes('active') ||
        lower.includes('completed') ||
        lower.includes('accepted') ||
        lower.includes('won') ||
        lower.includes('published') ||
        lower.includes('resolved')
    ) {
        bg = 'var(--mui-palette-success-soft)';
        color = 'var(--crm-emerald-700)';
        border = 'var(--mui-palette-success-softBorder)';
    } else if (
        lower.includes('open') ||
        lower.includes('sent') ||
        lower.includes('scheduled') ||
        lower.includes('new') ||
        lower.includes('in progress') ||
        lower.includes('proposal')
    ) {
        bg = 'var(--mui-palette-primary-soft)';
        color = 'var(--crm-text-blue-700)';
        border = 'var(--mui-palette-primary-softBorder)';
    } else if (lower.includes('pending') || lower.includes('negotiation') || lower.includes('warm')) {
        bg = 'var(--mui-palette-warning-soft)';
        color = 'var(--crm-amber-700)';
        border = 'var(--mui-palette-warning-softBorder)';
    } else if (lower.includes('rejected') || lower.includes('lost') || lower.includes('expired')) {
        bg = 'var(--mui-palette-error-soft)';
        color = 'var(--crm-red-700)';
        border = 'var(--mui-palette-error-softBorder)';
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

function getColumnsForModule(moduleKey: string, leadSourceLabel: (value: string) => string): DataTableColumn<RelatedRow>[] {
    const primary = (row: RelatedRow, value: unknown, mono = false) => renderPrimaryCell(value, mono, relatedRecordHref(moduleKey, row));
    switch (moduleKey) {
        case 'activities':
            return [
                { id: 'subject', label: 'Subject', minWidth: 200, sortable: true, render: (r) => primary(r, r.subject) },
                { id: 'status', label: 'Status', minWidth: 120, sortable: true, render: (r) => renderStatusPill(r.status) },
                { id: 'contact', label: 'Contact', minWidth: 150, sortable: true, accessor: 'contact' },
                { id: 'startDate', label: 'Start Date', minWidth: 130, sortable: true, accessor: 'startDate' },
                { id: 'assignedUser', label: 'Assigned User', minWidth: 140, sortable: true, accessor: 'assignedUser' },
            ];

        case 'tickets':
            return [
                { id: 'ticketNumber', label: 'Ticket Number', minWidth: 140, sortable: true, render: (r) => primary(r, r.ticketNumber, true) },
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
                { id: 'name', label: 'Name', minWidth: 180, sortable: true, render: (r) => primary(r, r.name) },
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
                    render: (r) => String(r.assignedTo || r.assignedUser || '-'),
                },
            ];

        case 'contracts':
            return [
                { id: 'contractNumber', label: 'Contract Number', minWidth: 150, sortable: true, render: (r) => primary(r, r.contractNumber, true) },
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
                { id: 'subject', label: 'Subject', minWidth: 210, sortable: true, render: (r) => primary(r, r.subject) },
                { id: 'status', label: 'Status', minWidth: 120, sortable: true, render: (r) => renderStatusPill(r.status) },
                { id: 'contact', label: 'Contact', minWidth: 150, sortable: true, accessor: 'contact' },
                { id: 'dateModified', label: 'Date Modified', minWidth: 140, sortable: true, accessor: 'dateModified' },
                { id: 'dateCreated', label: 'Date Created', minWidth: 140, sortable: true, accessor: 'dateCreated' },
                { id: 'dueDate', label: 'Due Date', minWidth: 130, sortable: true, accessor: 'dueDate' },
                { id: 'assignedUser', label: 'Assigned User', minWidth: 140, sortable: true, accessor: 'assignedUser' },
            ];

        case 'leads':
            return [
                { id: 'leadCode', label: 'Lead Number', minWidth: 140, sortable: true, render: (r) => primary(r, r.leadCode || r.leadNumber, true) },
                { id: 'name', label: 'Name', minWidth: 170, sortable: true, render: (r) => primary(r, r.name) },
                { id: 'organizationName', label: 'Organization Name', minWidth: 190, sortable: true, accessor: 'organizationName' },
                { id: 'status', label: 'Status', minWidth: 130, sortable: true, render: (r) => renderStatusPill(r.status) },
                { id: 'leadSource', label: 'Lead Source', minWidth: 140, sortable: true, render: (r) => leadSourceLabel(String(r.leadSource ?? '')) },
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
                { id: 'assignedTo', label: 'Assigned User', minWidth: 140, sortable: true, render: (r) => String(r.assignedTo || r.assignedUser || '-') },
                { id: 'createdAt', label: 'Date Created', minWidth: 130, sortable: true, render: (r) => String(r.createdAt || r.dateCreated || '-') },
            ];

        case 'organizations':
            return [
                { id: 'organizationName', label: 'Organization Name', minWidth: 210, sortable: true, render: (r) => primary(r, r.organizationName) },
                { id: 'natureOfBusiness', label: 'Nature of Business', minWidth: 170, sortable: true, accessor: 'natureOfBusiness' },
                { id: 'customerType', label: 'Customer Type', minWidth: 140, sortable: true, accessor: 'customerType' },
                { id: 'accountStatus', label: 'Status', minWidth: 120, sortable: true, render: (r) => renderStatusPill(r.accountStatus) },
                { id: 'billingCity', label: 'City', minWidth: 130, sortable: true, accessor: 'billingCity' },
                { id: 'billingState', label: 'State', minWidth: 130, sortable: true, accessor: 'billingState' },
            ];

        case 'partner_contacts':
            return [
                { id: 'name', label: 'Name', minWidth: 180, sortable: true, render: (r) => primary(r, r.name) },
                { id: 'email', label: 'Email', minWidth: 200, sortable: true, accessor: 'email' },
                { id: 'phone', label: 'Phone', minWidth: 150, sortable: true, accessor: 'phone' },
            ];

        case 'opportunities':
            return [
                { id: 'opportunityCode', label: 'Opp Number', minWidth: 150, sortable: true, render: (r) => primary(r, r.opportunityCode || r.oppNumber, true) },
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
                { id: 'assignedTo', label: 'Assigned User', minWidth: 140, sortable: true, render: (r) => String(r.assignedTo || r.assignedUser || '-') },
                { id: 'createdAt', label: 'Date Created', minWidth: 130, sortable: true, render: (r) => String(r.createdAt || r.dateCreated || '-') },
            ];

        case 'member_organizations':
            return [
                { id: 'name', label: 'Name', minWidth: 200, sortable: true, render: (r) => primary(r, r.name) },
                { id: 'city', label: 'City', minWidth: 140, sortable: true, accessor: 'city' },
                {
                    id: 'billingCountry',
                    label: 'Billing Country',
                    minWidth: 150,
                    sortable: true,
                    accessor: (r) => getCountryNameByCode(typeof r.billingCountry === 'string' ? r.billingCountry : ''),
                },
                { id: 'phone', label: 'Phone', minWidth: 150, sortable: true, accessor: 'phone' },
            ];

        case 'documents':
            return [
                { id: 'name', label: 'Name', minWidth: 190, sortable: true, render: (r) => primary(r, r.name) },
                { id: 'file', label: 'File', minWidth: 180, sortable: true, accessor: 'file' },
                { id: 'documentType', label: 'Document Type', minWidth: 140, sortable: true, accessor: 'documentType' },
                { id: 'category', label: 'Category', minWidth: 140, sortable: true, accessor: 'category' },
                { id: 'status', label: 'Status', minWidth: 120, sortable: true, render: (r) => renderStatusPill(r.status) },
                { id: 'publishDate', label: 'Publish Date', minWidth: 130, sortable: true, accessor: 'publishDate' },
            ];

        case 'products':
            return [
                { id: 'productName', label: 'Product Name', minWidth: 210, sortable: true, render: (r) => primary(r, r.productName) },
                { id: 'serialNumber', label: 'Product Code', minWidth: 150, sortable: true, render: (r) => String(r.serialNumber || r.productCode || '-') },
                { id: 'status', label: 'Status', minWidth: 120, sortable: true, render: (r) => renderStatusPill(r.status || 'Active') },
                { id: 'category', label: 'Category', minWidth: 140, sortable: true, render: (r) => String(r.category || '-') },
                { id: 'quantity', label: 'Quantity', minWidth: 100, sortable: true, render: (r) => String(r.quantity ?? '-') },
                { id: 'total', label: 'Amount', minWidth: 130, sortable: true, render: (r) => (r.total !== undefined ? formatCurrency(r.total) : formatCurrency(r.mrp)) },
                {
                    id: 'updatedAt',
                    label: 'Date Modified',
                    minWidth: 130,
                    sortable: true,
                    // Blank until the product is edited after creation.
                    render: (r) =>
                        r.updatedAt
                            ? wasModified({ createdAt: r.createdAt as string, updatedAt: r.updatedAt as string, updatedBy: r.updatedBy as string })
                                ? String(r.updatedAt)
                                : ''
                            : String(r.dateModified || ''),
                },
                { id: 'createdAt', label: 'Date Created', minWidth: 130, sortable: true, render: (r) => String(r.createdAt || r.dateCreated || '-') },
            ];

        case 'quotations':
            return [
                { id: 'quotationCode', label: 'Quotation Number', minWidth: 150, sortable: true, render: (r) => primary(r, r.quotationCode, true) },
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
                { id: 'assignedTo', label: 'User', minWidth: 140, sortable: true, render: (r) => String(r.assignedTo || '-') },
            ];

        case 'partner_company':
            return [
                { id: 'partnerName', label: 'Partner Name', minWidth: 200, sortable: true, render: (r) => primary(r, r.partnerName) },
                { id: 'industry', label: 'Industry', minWidth: 160, sortable: true, accessor: 'industry' },
                { id: 'officePhone', label: 'Office Phone', minWidth: 150, sortable: true, accessor: 'officePhone' },
                { id: 'assignedTo', label: 'Assigned to', minWidth: 140, sortable: true, accessor: 'assignedTo' },
            ];

        case 'security_groups':
            return [
                { id: 'name', label: 'Name', minWidth: 200, sortable: true, render: (r) => primary(r, r.name) },
                { id: 'description', label: 'Description', minWidth: 280, sortable: true, accessor: 'description' },
            ];

        default:
            return [
                { id: 'subject', label: 'Subject', minWidth: 200, sortable: true, render: (r) => primary(r, r.subject || r.name) },
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
    closeTooltip = 'Close',
    onRowClick,
    parentRecordId,
    entityData,
    entityType = 'organization',
}: RelatedRecordsTableViewProps) {
    const showNumber = useShowRecordNumber();
    const [searchQuery, setSearchQuery] = useState('');
    const [sortField, setSortField] = useState<string>('');
    const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
    const [activeRowId, setActiveRowId] = useState<string | null>(null);

    const moduleKey = useMemo(() => normalizeModuleKey(moduleId), [moduleId]);
    const tintModule = moduleKeyFrom(moduleKey);

    const leadSourceLabel = useDropdownOptionLabel('shared_lead_source');
    const columns = useMemo(
        () =>
            getColumnsForModule(moduleKey, leadSourceLabel).filter((c) =>
                // Products list their number as `serialNumber`.
                c.id === 'serialNumber' ? showNumber('product') : isShownField(c.id, showNumber)
            ),
        [moduleKey, leadSourceLabel, showNumber]
    );

    const datasets = useRelatedDatasets(entityType, entityData, open);

    const rawRecords = useMemo(
        () =>
            resolveRelatedRecordsForModule(
                moduleKey,
                parentEntityTitle,
                parentRecordId,
                entityData,
                entityType,
                datasets
            ),
        [moduleKey, parentEntityTitle, parentRecordId, entityData, entityType, datasets]
    );

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

    // A collapsed drawer slides fully off-screen, so the table reaches the viewport edge (the bookmark tab floats above it).
    const effectiveRightOffset = isRightDrawerCollapsed ? 0 : rightOffset;

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
                backgroundColor: 'var(--mui-palette-background-paper)',
                borderRight: '1px solid var(--mui-palette-border-strong)', // Adds a clean edge
                display: 'flex',
                flexDirection: 'column',
                transition: 'left 0.25s cubic-bezier(0.4, 0, 0.2, 1), right 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                boxShadow: 'none', // Remove heavy shadow, let the right drawer cast its shadow over this
                overflow: 'hidden',
            }}
        >
            {/* ── Theme-Aware Header Banner (42px) ───────────────────── */}
            <Box
                sx={{
                    height: 42,
                    minHeight: 42,
                    px: 2,
                    backgroundColor: 'var(--mui-palette-background-subtle)',
                    color: 'var(--crm-slate-900)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 1.5,
                    flexShrink: 0,
                    borderBottom: '1px solid var(--mui-palette-border-main)',
                }}
            >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', color: 'var(--crm-text-blue-600)' }}>
                        {getModuleIcon(moduleKey)}
                    </Box>
                    <Typography
                        noWrap
                        sx={{
                            fontSize: '0.78rem',
                            fontWeight: 800,
                            letterSpacing: '0.06em',
                            textTransform: 'uppercase',
                            color: 'var(--crm-slate-900)',
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
                            backgroundColor: 'var(--mui-palette-primary-soft)',
                            color: 'var(--crm-text-blue-700)',
                            border: '1px solid var(--mui-palette-primary-softBorder)',
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
                                color: 'var(--mui-palette-text-secondary)',
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
                            backgroundColor: 'var(--mui-palette-background-paper)',
                            border: '1px solid var(--mui-palette-border-main)',
                            borderRadius: '6px',
                            px: 1,
                            height: 26,
                            width: { xs: 130, md: 190 },
                            transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
                            '&:focus-within': {
                                borderColor: 'var(--mui-palette-primary-main)',
                                boxShadow: '0 0 0 2px rgb(var(--crm-accent-rgb) / 0.18)',
                            },
                        }}
                    >
                        <SearchIcon sx={{ fontSize: 14, color: 'var(--mui-palette-text-muted)', mr: 0.6 }} />
                        <InputBase
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder={`Filter ${moduleTitle.toLowerCase()}...`}
                            sx={{
                                fontSize: '0.73rem',
                                color: 'var(--mui-palette-text-primary)',
                                width: '100%',
                                '& input::placeholder': {
                                    color: 'var(--mui-palette-text-muted)',
                                    opacity: 1,
                                },
                            }}
                        />
                    </Box>

                    {onClose && (
                        <Tooltip title={closeTooltip}>
                            <IconButton
                                size="small"
                                onClick={onClose}
                                aria-label="Close related view"
                                sx={{
                                    color: 'var(--mui-palette-text-secondary)',
                                    p: 0.6,
                                    borderRadius: '6px',
                                    flexShrink: 0,
                                    '&:hover': {
                                        backgroundColor: 'var(--mui-palette-error-soft)',
                                        color: 'var(--mui-palette-error-main)',
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
                    backgroundColor: 'var(--mui-palette-background-paper)',
                    display: 'flex',
                    flexDirection: 'column',
                    // Module tint on the table header and rows (read by DataTable).
                    ...(tintModule && moduleTableTintVars(tintModule)),
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
                    getRowHref={(row) => relatedRecordHref(moduleKey, row)}
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
