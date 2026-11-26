'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import FolderOpenOutlinedIcon from '@mui/icons-material/FolderOpenOutlined';
import AccountCircleOutlinedIcon from '@mui/icons-material/AccountCircleOutlined';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';

import { CommonMasterView } from '../common/CommonMasterView';
import { MasterHeaderActions } from '../common/MasterHeaderActions';
import { buildExtendedSearchConfig } from '../common/buildExtendedSearchConfig';
import { AppToast } from '../common/AppToast';
import { type DataTableFilterItem } from '../common/DataTable';
import { useFilterController, type FilterFieldDef, type FilterOption, type ModuleFilterFields } from '../common/TableFilter';
import { useResetTab } from '@/hooks/useResetTab';
import { useAuth } from '@/context/AuthContext';
import { useDocuments } from '@/hooks/queries';
import { useFormConfigs } from '@/hooks/queries/useFormConfigs';
import { useMasterData } from '@/hooks/queries/useMasterData';
import { ROUTES } from '@/config/constants';
import { findCrmUser } from '@/services/masterData.store';
import { recordFileService } from '@/services/recordFile.service';
import type { Document } from '@/types/document.types';
import { activeOptionValues, findCategory, optionLabelMap } from '@/utils/formConfig';
import { fmtExportDateTime, fmtExportDay } from '@/utils/formats';
import { useDocumentColumns } from './documentColumns';
import { DocumentDetailDrawer } from './DocumentDetailDrawer';
import { DOCUMENT_LABELS as L, FILE_KIND_LABELS, fileKind, userName, type FileKind } from './documentDisplay';

/** Quick-view pills ('all' = none picked); they toggle off on re-click, as on the other lists. */
export type DocumentFilterTab = 'all' | 'my_documents' | 'recent';

/** Days the "Added in 7 Days" pill looks back. */
const RECENT_DAYS = 7;

/** Stable empty list while the first page loads (keeps memoized filters from recomputing). */
const NO_RECORDS: Document[] = [];

/** Sort keys that aren't plain text: the file by its name, people by full name, dates as written (ISO). */
const sortValue = (d: Document, field: string): string => {
    switch (field) {
        case 'documentFile':
            return (d.documentFile?.fileName ?? '').toLowerCase();
        case 'assignedTo':
        case 'createdBy':
            return userName(d[field]).toLowerCase();
        default:
            return String((d as unknown as Record<string, unknown>)[field] ?? '').toLowerCase();
    }
};

const row = (r: unknown) => r as Document;

/** Stored user values compare as the username. */
const normalizeUser = (value: string) => findCrmUser(value)?.username ?? value.trim();

/** The Filter dialog's fields: the Documentation fields plus the opportunity's, by the labels the forms use. */
function useDocumentFilterFields(): ModuleFilterFields {
    const configs = useFormConfigs();
    const { users } = useMasterData();
    return useMemo(() => {
        const people: FilterOption[] = users
            .filter((u) => !u.isGroupUser)
            .map((u) => ({ value: u.username, label: u.status === 'Active' ? u.name || u.username : `${u.name || u.username} (inactive)` }))
            .sort((a, b) => a.label.localeCompare(b.label));
        const stages = findCategory(configs, 'opportunity_sales_stage');
        const stageLabels = optionLabelMap(stages) ?? {};
        const kinds = Object.keys(FILE_KIND_LABELS) as FileKind[];
        const fields: FilterFieldDef[] = [
            { key: 'documentDate', label: L.documentDate, kind: 'date', getValue: (r) => row(r).documentDate },
            { key: 'createdAt', label: L.createdAt, kind: 'date', getValue: (r) => row(r).createdAt },
            { key: 'documentNo', label: L.documentNo, kind: 'text', getValue: (r) => row(r).documentNo },
            { key: 'documentFile', label: `${L.documentFile} (file name)`, kind: 'text', getValue: (r) => row(r).documentFile?.fileName ?? '' },
            {
                key: 'fileType',
                label: 'File Type',
                kind: 'options',
                options: kinds.map((k) => ({ value: k, label: FILE_KIND_LABELS[k] })),
                getValue: (r) => (row(r).documentFile ? fileKind(row(r).documentFile) : ''),
            },
            {
                key: 'salesStage',
                label: L.salesStage,
                kind: 'options',
                options: activeOptionValues(stages).map((value) => ({ value, label: stageLabels[value] ?? value })),
                getValue: (r) => row(r).salesStage,
            },
            { key: 'organizationName', label: L.organizationName, kind: 'text', getValue: (r) => row(r).organizationName },
            { key: 'opportunity', label: L.opportunity, kind: 'text', getValue: (r) => `${row(r).opportunity} ${row(r).opportunityCode}` },
            { key: 'assignedTo', label: L.assignedTo, kind: 'options', options: people, getValue: (r) => row(r).assignedTo, normalizeValue: normalizeUser },
            { key: 'createdBy', label: L.createdBy, kind: 'options', options: people, getValue: (r) => row(r).createdBy, normalizeValue: normalizeUser },
            { key: 'updatedAt', label: L.updatedAt, kind: 'date', getValue: (r) => row(r).updatedAt },
        ];
        const defaultKeys = ['documentDate', 'createdAt', 'salesStage', 'assignedTo', 'createdBy', 'organizationName', 'fileType'];
        return { fields, byKey: new Map(fields.map((f) => [f.key, f])), defaultKeys };
    }, [configs, users]);
}

/** `"a"` → `"a"` with quotes doubled, for a CSV cell. */
const csvCell = (value: string) => `"${value.replace(/"/g, '""')}"`;

function downloadBlob(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement('a');
    link.href = url;
    link.download = fileName;
    window.document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Activities › Documents: the documents added on opportunities (Documentation section), as a table with search,
 * the Filter dialog, quick pills, bulk export / download and pagination. A row opens the side drawer; the eye
 * button opens the detail page. There is no create form: documents are added from the opportunity form.
 */
export function DocumentsMasterView() {
    const router = useRouter();
    const { user } = useAuth();
    const currentUsername = user?.username || '';

    const { data: allDocuments = NO_RECORDS, refetch, isPending: listLoading } = useDocuments();
    const [activeTab, setActiveTab] = useResetTab<DocumentFilterTab>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [sortField, setSortField] = useState('createdAt');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    const filterFields = useDocumentFilterFields();
    const tableFilter = useFilterController<Document>({
        module: 'documents',
        title: 'Documents',
        fields: filterFields,
        rows: allDocuments,
        onSortChange: (s) => {
            setSortField(s.field);
            setSortOrder(s.order);
        },
        onChange: () => setPage(0),
    });
    /** Records left by the Filter dialog: pills, search and bulk actions work on these. */
    const documents = tableFilter.filteredRows;
    // Tracked by id so the drawer always shows the cached copy and closes if the document goes away.
    const [drawerDocumentId, setDrawerDocumentId] = useState<string | null>(null);
    const selectedDrawerDocument = useMemo(
        () => (drawerDocumentId ? documents.find((d) => d.id === drawerDocumentId) ?? null : null),
        [documents, drawerDocumentId]
    );
    const closeDrawer = useCallback(() => setDrawerDocumentId(null), []);
    const [toast, setToast] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' | 'warning' }>({
        open: false,
        message: '',
        severity: 'success',
    });

    // ── Quick View Pills ──────────────────────────────────────────────────────
    const isMine = useCallback((d: Document) => Boolean(currentUsername) && d.assignedTo === currentUsername, [currentUsername]);
    const isRecent = useCallback((d: Document) => {
        const added = new Date(d.createdAt).getTime();
        return Number.isFinite(added) && Date.now() - added <= RECENT_DAYS * 86_400_000;
    }, []);
    const filterItems: DataTableFilterItem<DocumentFilterTab>[] = useMemo(
        () => [
            {
                id: 'my_documents',
                label: 'My Documents',
                icon: <AccountCircleOutlinedIcon sx={{ fontSize: 16 }} />,
                count: documents.filter(isMine).length,
            },
            {
                id: 'recent',
                label: `Added in ${RECENT_DAYS} Days`,
                icon: <EventAvailableOutlinedIcon sx={{ fontSize: 16 }} />,
                count: documents.filter(isRecent).length,
            },
        ],
        [documents, isMine, isRecent]
    );

    // ── Search & Sort ─────────────────────────────────────────────────────────
    const filteredDocuments = useMemo(() => {
        const q = searchQuery.toLowerCase().trim();
        const inTab = activeTab === 'my_documents' ? documents.filter(isMine) : activeTab === 'recent' ? documents.filter(isRecent) : documents;
        const result = inTab.filter((d) => {
            if (!q) return true;
            return [
                d.documentNo,
                d.documentFile?.fileName,
                d.opportunity,
                d.opportunityCode,
                d.organizationName,
                d.contact,
                userName(d.assignedTo),
                userName(d.createdBy),
            ].some((v) => (v || '').toLowerCase().includes(q));
        });
        const dir = sortOrder === 'asc' ? 1 : -1;
        return [...result].sort((a, b) => sortValue(a, sortField).localeCompare(sortValue(b, sortField), undefined, { numeric: true }) * dir);
    }, [documents, activeTab, isMine, isRecent, searchQuery, sortField, sortOrder]);

    const paginatedDocuments = useMemo(() => {
        const start = page * rowsPerPage;
        return filteredDocuments.slice(start, start + rowsPerPage);
    }, [filteredDocuments, page, rowsPerPage]);

    // ── Bulk Actions ──────────────────────────────────────────────────────────
    const selectedDocuments = useCallback(() => {
        const ids = new Set(selectedIds);
        return documents.filter((d) => ids.has(d.id));
    }, [documents, selectedIds]);

    const handleExport = () => {
        const records = selectedDocuments();
        if (records.length === 0) {
            setToast({ open: true, message: 'Select the documents to export.', severity: 'info' });
            return;
        }
        const headers = [L.documentNo, L.documentFile, L.documentDate, 'Opportunity Code', L.opportunity, L.salesStage, L.organizationName, L.contact, L.assignedTo, L.createdBy, L.createdAt];
        const rows = records.map((d) =>
            [
                d.documentNo,
                d.documentFile?.fileName ?? '',
                // Export cells keep one fixed format whatever the company display formats.
                d.documentDate ? fmtExportDay(d.documentDate) : '',
                d.opportunityCode,
                d.opportunity,
                d.salesStage,
                d.organizationName,
                d.contact,
                userName(d.assignedTo),
                userName(d.createdBy),
                fmtExportDateTime(d.createdAt),
            ]
                .map((v) => csvCell(v || ''))
                .join(',')
        );
        // BOM so Excel reads the names as UTF-8.
        downloadBlob(new Blob(['﻿' + [headers.map(csvCell).join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8' }), `documents_export_${Date.now()}.csv`);
        setToast({ open: true, message: `Exported ${records.length} document(s) to CSV.`, severity: 'success' });
    };

    const handleDownloadFiles = async () => {
        const files = selectedDocuments().flatMap((d) => (d.documentFile ? [d.documentFile] : []));
        if (files.length === 0) {
            setToast({ open: true, message: 'The selected documents have no files to download.', severity: 'info' });
            return;
        }
        let failed = 0;
        for (const file of files) {
            try {
                const res = await fetch(recordFileService.fileUrl(file), { credentials: 'include' });
                if (!res.ok) throw new Error(String(res.status));
                downloadBlob(await res.blob(), file.fileName);
            } catch {
                failed += 1;
            }
        }
        setToast(
            failed
                ? { open: true, message: `${failed} of ${files.length} file(s) couldn't be downloaded.`, severity: 'error' }
                : { open: true, message: `Downloading ${files.length} file(s).`, severity: 'success' }
        );
    };

    // ── Columns ───────────────────────────────────────────────────────────────
    const openDrawerRecord = useCallback((record: Document) => setDrawerDocumentId(record.id), []);
    const columns = useDocumentColumns(openDrawerRecord);

    const handleSort = (field: string) => {
        const isAsc = sortField === field && sortOrder === 'asc';
        setSortOrder(isAsc ? 'desc' : 'asc');
        setSortField(field);
    };

    const searchConfig = {
        ...buildExtendedSearchConfig({
            searchQuery,
            onSearchChange: (q) => {
                setSearchQuery(q);
                setPage(0);
            },
            searchPlaceholder: 'Search by document no, file, opportunity, organization...',
            pageIds: paginatedDocuments.map((r) => r.id),
            allIds: filteredDocuments.map((r) => r.id),
            selectedIds,
            onSelectedIdsChange: setSelectedIds,
            page,
            rowsPerPage,
            totalRecords: filteredDocuments.length,
            onPageChange: setPage,
        }),
        // Read-only module: no delete (a document is removed by setting Add Document to No on its opportunity).
        bulkActionItems: [
            { id: 'export', label: 'Export Selected to CSV', onClick: handleExport },
            { id: 'download', label: 'Download Selected Files', onClick: () => void handleDownloadFiles() },
        ],
    };

    return (
        <CommonMasterView<Document, DocumentFilterTab>
            loading={listLoading}
            breadcrumbItems={[{ label: 'Activities' }, { label: 'Documents' }]}
            filterConfig={{
                filters: filterItems,
                activeFilter: activeTab,
                onFilterChange: (tab) => {
                    setActiveTab((prev) => (prev === tab ? 'all' : tab));
                    setPage(0);
                },
            }}
            tableId="documents"
            formModule={null}
            tableFilter={tableFilter}
            headerActions={() => (
                <MasterHeaderActions
                    onRefresh={async () => {
                        const { isError } = await refetch();
                        setToast(
                            isError
                                ? { open: true, message: 'Failed to refresh documents.', severity: 'error' }
                                : { open: true, message: 'Documents refreshed.', severity: 'info' }
                        );
                    }}
                />
            )}
            searchConfig={searchConfig}
            columns={columns}
            data={paginatedDocuments}
            keyExtractor={(d) => d.id}
            selectedIds={selectedIds}
            onToggleSelectRow={(id) => setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]))}
            onToggleSelectAll={(checked) => setSelectedIds(checked ? paginatedDocuments.map((d) => d.id) : [])}
            sortField={sortField}
            sortOrder={sortOrder}
            onSort={handleSort}
            onView={(d) => router.push(ROUTES.DOCUMENT_DETAIL(d.id))}
            getRowHref={(d) => ROUTES.DOCUMENT_DETAIL(d.id)}
            onRowClick={(d) => setDrawerDocumentId(d.id)}
            activeRowId={selectedDrawerDocument?.id}
            viewTooltip="View Document"
            emptyTitle="No documents found"
            emptyDescription="Documents added on opportunities (Documentation section) show up here."
            emptyIcon={<FolderOpenOutlinedIcon sx={{ fontSize: 48, color: 'var(--crm-slate-300)' }} />}
            pagination={{
                page,
                rowsPerPage,
                totalCount: filteredDocuments.length,
                entityLabel: 'Documents',
                pageSizeOptions: [10, 25, 50],
                onPageChange: setPage,
                onRowsPerPageChange: (n) => {
                    setRowsPerPage(n);
                    setPage(0);
                },
            }}
            drawer={<DocumentDetailDrawer document={selectedDrawerDocument} open={Boolean(selectedDrawerDocument)} onClose={closeDrawer} />}
            isDrawerOpen={Boolean(selectedDrawerDocument)}
            toast={
                <AppToast
                    open={toast.open}
                    message={toast.message}
                    severity={toast.severity}
                    onClose={() => setToast((prev) => ({ ...prev, open: false }))}
                />
            }
        />
    );
}
