'use client';

import React from 'react';
import { Box, Tooltip } from '@mui/material';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import ApartmentIcon from '@mui/icons-material/Apartment';
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import AssignmentIndOutlinedIcon from '@mui/icons-material/AssignmentIndOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { ROUTES } from '@/config/constants';
import type { ExistingRecordMatch } from '@/services/lead.service';
import type { SeriesModule } from '@/types/documentSeries.types';
import { useShowRecordNumber } from '@/hooks/queries/useDocumentSeries';

const MATCH_MODULE: Record<ExistingRecordMatch['entityType'], SeriesModule> = { Lead: 'lead', Contact: 'contact', Organization: 'organization' };

const ENTITY: Record<ExistingRecordMatch['entityType'], { href: (id: string) => string; Icon: typeof ApartmentIcon }> = {
    Lead: { href: ROUTES.LEAD_DETAIL, Icon: AssignmentIndOutlinedIcon },
    Contact: { href: ROUTES.CONTACT_DETAIL, Icon: PersonOutlinedIcon },
    Organization: { href: ROUTES.ORGANIZATION_DETAIL, Icon: ApartmentIcon },
};

export interface ExistingRecordMatchesProps {
    matches: readonly ExistingRecordMatch[];
    /** Header line, e.g. "Mobile already in CRM". */
    title?: React.ReactNode;
}

/**
 * Amber "already in CRM" note listing the leads / contacts / organizations that already use a mobile number or
 * email. Each one links to its view page (new tab, so the form being filled isn't lost), like the organization
 * name's "Already in CRM" list. Built from spans only, so it can sit inside a field's helper text.
 */
export function ExistingRecordMatches({ matches, title = 'Already in CRM' }: ExistingRecordMatchesProps) {
    const showNumber = useShowRecordNumber();
    if (matches.length === 0) return null;
    return (
        <Box
            component="span"
            role="status"
            sx={{
                display: 'block',
                mt: 0.5,
                border: '1px solid var(--crm-amber-100)',
                borderLeft: '3px solid var(--crm-amber-500)',
                borderRadius: '6px',
                backgroundColor: 'var(--mui-palette-warning-soft)',
                overflow: 'hidden',
            }}
        >
            <Box
                component="span"
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5,
                    px: 1,
                    pt: 0.5,
                    fontSize: '0.66rem',
                    fontWeight: 700,
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                    color: 'var(--crm-amber-700)',
                }}
            >
                <WarningAmberRoundedIcon sx={{ fontSize: 14 }} />
                {title}
            </Box>
            <Box component="span" sx={{ display: 'block', py: 0.25 }}>
                {matches.map((match) => {
                    const { href, Icon } = ENTITY[match.entityType];
                    const showCode = showNumber(MATCH_MODULE[match.entityType]);
                    const details = [showCode ? match.code : undefined, match.entityType !== 'Organization' ? match.organizationName : undefined]
                        .filter(Boolean)
                        .join(' • ');
                    return (
                        <Tooltip key={`${match.entityType}:${match.id}`} title={`View ${match.entityType.toLowerCase()} (new tab)`} placement="bottom-start">
                            <Box
                                component="a"
                                href={href(match.id)}
                                target="_blank"
                                rel="noopener"
                                aria-label={`View ${match.entityType.toLowerCase()} ${match.name} in a new tab`}
                                sx={{
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    gap: 0.75,
                                    px: 1,
                                    py: 0.5,
                                    textDecoration: 'none',
                                    color: 'inherit',
                                    cursor: 'pointer',
                                    '&:hover, &:focus-visible': { backgroundColor: 'var(--crm-amber-100)', outline: 'none' },
                                    '&:hover .existing-record-name': { color: 'var(--crm-text-blue-700)', textDecoration: 'underline' },
                                    '&:hover .existing-record-open': { color: 'var(--mui-palette-primary-main)' },
                                }}
                            >
                                <Icon sx={{ fontSize: 16, mt: '1px', flexShrink: 0, color: 'var(--mui-palette-warning-main)' }} />
                                <Box component="span" sx={{ display: 'block', minWidth: 0, flex: 1 }}>
                                    <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
                                        <Box
                                            component="span"
                                            className="existing-record-name"
                                            sx={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--crm-slate-900)', wordBreak: 'break-word', lineHeight: 1.35 }}
                                        >
                                            {match.name}
                                        </Box>
                                        <Box
                                            component="span"
                                            sx={{
                                                fontSize: '0.62rem',
                                                fontWeight: 700,
                                                color: 'var(--crm-amber-700)',
                                                backgroundColor: 'var(--crm-amber-100)',
                                                borderRadius: '999px',
                                                px: 0.75,
                                                lineHeight: 1.6,
                                            }}
                                        >
                                            {match.entityType}
                                        </Box>
                                    </Box>
                                    {details && (
                                        <Box
                                            component="span"
                                            sx={{ display: 'block', fontSize: '0.7rem', color: 'var(--mui-palette-text-secondary)', wordBreak: 'break-word', lineHeight: 1.35 }}
                                        >
                                            {details}
                                        </Box>
                                    )}
                                </Box>
                                <OpenInNewIcon
                                    className="existing-record-open"
                                    sx={{ fontSize: 14, mt: '2px', flexShrink: 0, color: 'var(--mui-palette-text-secondary)' }}
                                />
                            </Box>
                        </Tooltip>
                    );
                })}
            </Box>
        </Box>
    );
}
