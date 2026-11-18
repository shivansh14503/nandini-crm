import React from 'react';
import { Box } from '@mui/material';
import ApartmentIcon from '@mui/icons-material/Apartment';
import ConfirmationNumberOutlinedIcon from '@mui/icons-material/ConfirmationNumberOutlined';
import HandshakeOutlinedIcon from '@mui/icons-material/HandshakeOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import RequestQuoteOutlinedIcon from '@mui/icons-material/RequestQuoteOutlined';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import WorkspacePremiumOutlinedIcon from '@mui/icons-material/WorkspacePremiumOutlined';
import type { SvgIconComponent } from '@mui/icons-material';
import type { GlobalSearchCategory, GlobalSearchMatch } from '@/services/globalSearch.service';

export const SEARCH_CATEGORY_META: Record<GlobalSearchCategory, { label: string; singular: string; Icon: SvgIconComponent; listHref: string }> = {
    leads: { label: 'Leads', singular: 'Lead', Icon: TrendingUpIcon, listHref: '/leads' },
    opportunities: { label: 'Opportunities', singular: 'Opportunity', Icon: WorkspacePremiumOutlinedIcon, listHref: '/opportunities' },
    quotations: { label: 'Quotations', singular: 'Quotation', Icon: RequestQuoteOutlinedIcon, listHref: '/quotations' },
    organizations: { label: 'Organizations', singular: 'Organization', Icon: ApartmentIcon, listHref: '/organizations' },
    contacts: { label: 'Contacts', singular: 'Contact', Icon: PersonOutlinedIcon, listHref: '/contacts' },
    tickets: { label: 'Tickets', singular: 'Ticket', Icon: ConfirmationNumberOutlinedIcon, listHref: '/tickets' },
    products: { label: 'Products', singular: 'Product', Icon: Inventory2OutlinedIcon, listHref: '/products' },
    partnerCompanies: { label: 'Partner Companies', singular: 'Partner Company', Icon: HandshakeOutlinedIcon, listHref: '/partner-companies' },
};

/** "PAN · AAACR1234A": which field matched, when it is not already visible in the title / subtitle. */
export function SearchMatchChip({ match, dense = false }: { match: GlobalSearchMatch; dense?: boolean }) {
    return (
        <Box
            component="span"
            sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.5,
                maxWidth: '100%',
                minWidth: 0,
                fontSize: dense ? '0.68rem' : '0.72rem',
                lineHeight: 1.5,
                color: 'var(--crm-text-blue-700)',
                backgroundColor: 'var(--mui-palette-primary-soft)',
                border: '1px solid var(--mui-palette-primary-softBorder)',
                borderRadius: '6px',
                px: 0.75,
            }}
        >
            <Box component="span" sx={{ fontWeight: 700, flexShrink: 0 }}>
                {match.label}
            </Box>
            <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>
                {match.value}
            </Box>
        </Box>
    );
}

/** Stage / status tag. */
export function SearchMetaTag({ children }: { children: React.ReactNode }) {
    return (
        <Box
            component="span"
            sx={{
                fontSize: '0.68rem',
                fontWeight: 700,
                color: 'var(--crm-slate-600)',
                backgroundColor: 'var(--mui-palette-background-hover)',
                borderRadius: '6px',
                px: 0.75,
                py: 0.2,
                flexShrink: 0,
                whiteSpace: 'nowrap',
            }}
        >
            {children}
        </Box>
    );
}
