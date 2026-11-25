'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { getCountryNameByCode } from '@/data/addressMaster';
import {
    Box,
    Typography,
    IconButton,
    Chip,
    Tooltip,
    InputBase,
    useMediaQuery,
    useTheme,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import ConfirmationNumberOutlinedIcon from '@mui/icons-material/ConfirmationNumberOutlined';
import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined';
import HistoryEduOutlinedIcon from '@mui/icons-material/HistoryEduOutlined';
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
import ViewColumnIcon from '@mui/icons-material/ViewColumn';

import {
    ColumnVisibilityPopover,
    DataTable,
    MAX_PINNED_COLUMNS,
    isCrmModuleKey,
    useColumnVisibility,
    useFormFieldColumns,
    type DataTableColumn,
    type SortOrder,
} from '../DataTable';
import { useScorecardColumns } from '../scorecard/scorecardDisplay';
import { useLeadColumns } from '@/components/leads/leadColumns';
import { useOpportunityColumns } from '@/components/opportunities/opportunityColumns';
import { useQuotationColumns } from '@/components/quotations/quotationColumns';
import { useOrganizationColumns } from '@/components/organizations/organizationColumns';
import { useContactColumns } from '@/components/contacts/master/contactColumns';
import { useTicketColumns } from '@/components/tickets/master/ticketColumns';
import { useContractColumns } from '@/components/contracts/contractColumns';
import { useProductColumns } from '@/components/products/master/productColumns';
import type { Product } from '@/types/product.types';
import { RecordLink } from '../RecordLink';
import { ROUTES } from '@/config/constants';
import {
    resolveRelatedRecordsForModule,
    useRelatedDatasets,
    type CrmEntityType,
} from '@/config/relatedModules.config';
import { useShowRecordNumber } from '@/hooks/queries/useDocumentSeries';
import { glassSurfaceSx, GLASS_SHADOW, GLASS_RADIUS, FLOAT_INSET, NAVBAR_HEIGHT } from '@/theme/glass';
import { moduleKeyFrom, moduleTableTintVars } from '@/theme/moduleColors';
import { isShownField } from '@/utils/recordNumbers';

export interface RelatedRecordsTableViewProps {
    open: boolean;
    moduleId: string;
    moduleTitle: string;
    parentEntityTitle: string;
    leftOffset: number; // left edge (px): just past the floating related-modules dock (rail or pinned) + a 12px gap
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
        case 'contracts':
            return id ? ROUTES.CONTRACT_DETAIL(id) : undefined;
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

/** Product rows here are line items whose own id isn't the product's: link to the catalogue product instead. */
const catalogueProductId = (p: Product) => String((p as unknown as RelatedRow).productId ?? p.id);

/** 'LEAD SOURCE' → 'Lead Source'. */
function titleCaseLabel(label: string): string {
    return label.toLowerCase().replace(/(^|[\s\-/(&])([a-z])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

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
            return <HistoryEduOutlinedIcon sx={{ fontSize: 17 }} />;
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

function getColumnsForModule(moduleKey: string): DataTableColumn<RelatedRow>[] {
    const primary = (row: RelatedRow, value: unknown, mono = false) => renderPrimaryCell(value, mono, relatedRecordHref(moduleKey, row));
    switch (moduleKey) {
        case 'activities':
            return [
                { id: 'subject', label: 'Subject', minWidth: 200, sortable: true, render: (r) => primary(r, r.subject) },
                { id: 'status', label: 'Status', minWidth: 120, sortable: true, render: (r) => renderStatusPill(r.status) },
                { id: 'contact', label: 'Contact', minWidth: 150, sortable: true, accessor: 'contact' },
                { id: 'startDate', label: 'Start Date', minWidth: 130, sortable: true, accessor: 'startDate' },
                { id: 'assignedTo', label: 'Assigned User', minWidth: 140, sortable: true, accessor: 'assignedTo' },
            ];

        case 'history':
            return [
                { id: 'subject', label: 'Subject', minWidth: 210, sortable: true, render: (r) => primary(r, r.subject) },
                { id: 'status', label: 'Status', minWidth: 120, sortable: true, render: (r) => renderStatusPill(r.status) },
                { id: 'contact', label: 'Contact', minWidth: 150, sortable: true, accessor: 'contact' },
                { id: 'dateModified', label: 'Date Modified', minWidth: 140, sortable: true, accessor: 'dateModified' },
                { id: 'dateCreated', label: 'Date Created', minWidth: 140, sortable: true, accessor: 'dateCreated' },
                { id: 'dueDate', label: 'Due Date', minWidth: 130, sortable: true, accessor: 'dueDate' },
                { id: 'assignedTo', label: 'Assigned User', minWidth: 140, sortable: true, accessor: 'assignedTo' },
            ];

        case 'partner_contacts':
            return [
                { id: 'name', label: 'Name', minWidth: 180, sortable: true, render: (r) => primary(r, r.name) },
                { id: 'email', label: 'Email', minWidth: 200, sortable: true, accessor: 'email' },
                { id: 'phone', label: 'Phone', minWidth: 150, sortable: true, accessor: 'phone' },
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

        // CRM modules (leads, contacts, …) use their list page's columns; these are the quote / deal line-item extras.
        case 'products':
            return [
                { id: 'quantity', label: 'Quantity', minWidth: 100, sortable: true, render: (r) => String(r.quantity ?? '-') },
                { id: 'total', label: 'Amount', minWidth: 130, sortable: true, render: (r) => (r.total !== undefined ? formatCurrency(r.total) : formatCurrency(r.mrp)) },
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
                { id: 'assignedTo', label: 'Assigned User', minWidth: 140, sortable: true, accessor: 'assignedTo' },
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
    const theme = useTheme();
    const isWide = useMediaQuery(theme.breakpoints.up('lg'));
    const [searchQuery, setSearchQuery] = useState('');
    const [sortField, setSortField] = useState<string>('');
    const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
    const [activeRowId, setActiveRowId] = useState<string | null>(null);

    const moduleKey = useMemo(() => normalizeModuleKey(moduleId), [moduleId]);
    const tintModule = moduleKeyFrom(moduleKey);

    // A plain click on a record link opens it in the secondary drawer, like a row click.
    const openRecord = useCallback(
        (record: unknown) => {
            const row = record as RelatedRow;
            setActiveRowId(String(row.id ?? ''));
            onRowClick(row, moduleKey);
        },
        [onRowClick, moduleKey]
    );

    // CRM modules use their list page's own columns, so Modify Columns offers the same choices here as there.
    // Every hook runs (rules of hooks); only the ones that fetch data are limited to their own module.
    const [now] = useState(() => Date.now());
    const moduleColumns: Record<string, DataTableColumn<never>[]> = {
        leads: useLeadColumns(openRecord),
        opportunities: useOpportunityColumns(openRecord, { enabled: open && moduleKey === 'opportunities' }),
        quotations: useQuotationColumns(openRecord),
        organizations: useOrganizationColumns(openRecord),
        contacts: useContactColumns(openRecord, { enabled: open && moduleKey === 'contacts' }),
        tickets: useTicketColumns(openRecord, now),
        contracts: useContractColumns(openRecord),
        products: useProductColumns(openRecord, catalogueProductId),
    };
    const listPageColumns = moduleColumns[moduleKey] as DataTableColumn<RelatedRow>[] | undefined;

    const columns = useMemo(() => {
        const own = getColumnsForModule(moduleKey);
        if (listPageColumns) {
            // Products here are quote / deal line items: keep their quantity and amount next to the catalogue columns.
            const lineItemColumns = moduleKey === 'products' ? own.filter((c) => c.id === 'quantity' || c.id === 'total') : [];
            return [...listPageColumns, ...lineItemColumns];
        }
        return (
            own
                .filter((c) => isShownField(c.id, showNumber))
                // The first column identifies the record (its number or name link), so it can't be hidden.
                .map((c, i) => (i === 0 ? { ...c, locked: true } : c))
        );
    }, [moduleKey, showNumber, listPageColumns]);

    // Same field list as the module's main table: every built-in and custom form field (hidden until switched on in
    // Modify Columns, grouped by form tab), plus the scorecard colors when the admin enabled them.
    const formModule = useMemo(() => {
        const key = moduleKey === 'partner_company' ? 'partner-companies' : moduleKey;
        return isCrmModuleKey(key) ? key : undefined;
    }, [moduleKey]);
    const withFieldColumns = useScorecardColumns<RelatedRow>(useFormFieldColumns<RelatedRow>(columns, formModule), formModule);
    // Field columns come labelled in capitals; this table's headers are title case.
    const allColumns = useMemo(
        () => (withFieldColumns ?? columns).map((c) => (c.label === c.label.toUpperCase() ? { ...c, label: titleCaseLabel(c.label) } : c)),
        [withFieldColumns, columns]
    );

    // Modify Columns: one saved choice per related module, shared by every parent record that lists it.
    const {
        orderedColumns,
        visibleColumnIds,
        activeColumns,
        pinnedColumnIds,
        toggleColumn,
        setColumnsVisible,
        togglePin,
        reorderColumns,
        reorderPinned,
        resetDefaults,
    } = useColumnVisibility<RelatedRow>(allColumns, `related_${moduleKey}`);
    const [columnAnchorEl, setColumnAnchorEl] = useState<HTMLElement | null>(null);

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

    // A collapsed drawer slides fully off-screen, so the table keeps only the standard inset from the viewport edge.
    // Below `lg` there is no room beside the drawer: it floats over the table, which keeps the full width.
    const effectiveRightOffset = Math.max(FLOAT_INSET, isRightDrawerCollapsed || !isWide ? 0 : rightOffset);

    return (
        <Box
            component="section"
            sx={{
                // Floating glass panel below the navbar, keeping the same 12px gaps to the navbar, dock and drawer.
                ...glassSurfaceSx,
                position: 'fixed',
                top: FLOAT_INSET + NAVBAR_HEIGHT + FLOAT_INSET,
                bottom: FLOAT_INSET,
                left: Math.max(FLOAT_INSET, leftOffset),
                right: effectiveRightOffset,
                zIndex: 1290, // Tucks underneath both side panels
                borderRadius: GLASS_RADIUS,
                boxShadow: GLASS_SHADOW,
                display: 'flex',
                flexDirection: 'column',
                transition: 'left 0.22s cubic-bezier(0.2, 0, 0, 1), right 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                overflow: 'hidden',
            }}
        >
            {/* ── Theme-Aware Header Banner (42px) ───────────────────── */}
            <Box
                sx={{
                    height: 42,
                    minHeight: 42,
                    px: 2,
                    backgroundColor: 'color-mix(in srgb, var(--mui-palette-background-subtle) 70%, transparent)',
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

                    <Tooltip title="Modify Columns">
                        <IconButton
                            size="small"
                            aria-label="Modify Columns"
                            onClick={(e) => setColumnAnchorEl(e.currentTarget)}
                            sx={{
                                width: 26,
                                height: 26,
                                flexShrink: 0,
                                border: '1px solid var(--mui-palette-border-main)',
                                borderRadius: '6px',
                                color: 'var(--mui-palette-text-secondary)',
                                backgroundColor: 'var(--mui-palette-background-paper)',
                                transition: 'all 0.15s ease',
                                '&:hover': {
                                    borderColor: 'var(--crm-blue-300)',
                                    backgroundColor: 'var(--mui-palette-primary-soft)',
                                    color: 'var(--crm-text-blue-700)',
                                },
                            }}
                        >
                            <ViewColumnIcon sx={{ fontSize: 15 }} />
                        </IconButton>
                    </Tooltip>
                    <ColumnVisibilityPopover<RelatedRow>
                        columns={orderedColumns}
                        visibleColumnIds={visibleColumnIds}
                        onToggleColumn={toggleColumn}
                        onSetColumnsVisible={setColumnsVisible}
                        onResetDefaults={resetDefaults}
                        pinnedColumnIds={pinnedColumnIds}
                        onTogglePin={togglePin}
                        maxPinned={MAX_PINNED_COLUMNS}
                        onReorderColumns={reorderColumns}
                        onReorderPinned={reorderPinned}
                        anchorEl={columnAnchorEl}
                        onClose={() => setColumnAnchorEl(null)}
                        tableId={`related_${moduleKey}`}
                    />

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
                    columns={activeColumns}
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
