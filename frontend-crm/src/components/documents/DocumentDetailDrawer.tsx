'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Box } from '@mui/material';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';

import { ROUTES } from '@/config/constants';
import { withListOrigin } from '@/utils/listOrigin';
import { recordFileService } from '@/services/recordFile.service';
import type { Document } from '@/types/document.types';
import { useDocument } from '@/hooks/queries';
import { EntityDetailDrawer, type DrawerBadgeItem, type FormTabDefinition } from '@/components/common/Drawer';
import { formatDay } from '@/components/common/Drawer/layout/drawerFields';
import { DocumentInfoSection, DocumentOpportunitySection } from './DocumentDetails';
import { FILE_KIND_LABELS, FileKindIcon, documentTitle, fileKind } from './documentDisplay';

export interface DocumentDetailDrawerProps {
    document: Document | null;
    open: boolean;
    onClose: () => void;
    hideBackdrop?: boolean;
}

const TABS: FormTabDefinition[] = [{ id: 'overview', label: 'Overview', icon: <ArticleOutlinedIcon sx={{ fontSize: 18 }} /> }];

/**
 * A document's side drawer: its details, the file and the opportunity it belongs to. Read-only; "Edit in
 * Opportunity" opens the opportunity form, where the Documentation section changes it.
 */
export function DocumentDetailDrawer({ document, open, onClose, hideBackdrop }: DocumentDetailDrawerProps) {
    const router = useRouter();
    const { data: fresh } = useDocument(open && document?.id ? document.id : undefined);
    const d = fresh ?? document;
    if (!d) return null;

    const badges: DrawerBadgeItem[] = [
        ...(d.documentFile ? [{ label: FILE_KIND_LABELS[fileKind(d.documentFile)] }] : []),
        ...(d.documentDate ? [{ label: formatDay(d.documentDate) }] : []),
        ...(d.opportunityCode ? [{ label: d.opportunityCode, isMonospace: true }] : []),
    ];

    return (
        <EntityDetailDrawer
            open={open}
            module="documents"
            onClose={onClose}
            hideBackdrop={hideBackdrop}
            title={documentTitle(d)}
            subtitle={[d.opportunity, d.organizationName].filter(Boolean).join(' · ')}
            avatarIcon={<FileKindIcon file={d.documentFile} size={22} />}
            avatarBg="var(--mui-palette-primary-soft)"
            verified={false}
            badges={badges}
            headerActions={{ onView: () => router.push(withListOrigin(ROUTES.DOCUMENT_DETAIL(d.id))) }}
            formTabs={TABS}
            tabContents={{
                overview: (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <DocumentInfoSection document={d} />
                        <DocumentOpportunitySection document={d} />
                    </Box>
                ),
            }}
            recordAudit={d}
            includeChangesTab={false}
            primaryAction={{
                label: 'Edit in Opportunity',
                icon: <EditOutlinedIcon sx={{ fontSize: 16 }} />,
                tooltip: 'Documents are changed from the Documentation section of their opportunity',
                onClick: () => router.push(ROUTES.OPPORTUNITY_EDIT(d.opportunityId)),
            }}
            secondaryAction={
                d.documentFile
                    ? {
                          label: 'Open File',
                          icon: <OpenInNewRoundedIcon sx={{ fontSize: 16 }} />,
                          onClick: () => window.open(recordFileService.fileUrl(d.documentFile!), '_blank', 'noopener,noreferrer'),
                      }
                    : undefined
            }
        />
    );
}
