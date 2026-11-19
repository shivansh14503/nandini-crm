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
import { MODULE_COLORS, type ModuleColor } from '@/theme/moduleColors';

export const SEARCH_CATEGORY_META: Record<
    GlobalSearchCategory,
    { label: string; singular: string; Icon: SvgIconComponent; listHref: string; color: ModuleColor }
> = {
    leads: { label: 'Leads', singular: 'Lead', Icon: TrendingUpIcon, listHref: '/leads', color: MODULE_COLORS.leads },
    opportunities: { label: 'Opportunities', singular: 'Opportunity', Icon: WorkspacePremiumOutlinedIcon, listHref: '/opportunities', color: MODULE_COLORS.opportunities },
    quotations: { label: 'Quotations', singular: 'Quotation', Icon: RequestQuoteOutlinedIcon, listHref: '/quotations', color: MODULE_COLORS.quotations },
    organizations: { label: 'Organizations', singular: 'Organization', Icon: ApartmentIcon, listHref: '/organizations', color: MODULE_COLORS.organizations },
    contacts: { label: 'Contacts', singular: 'Contact', Icon: PersonOutlinedIcon, listHref: '/contacts', color: MODULE_COLORS.contacts },
    tickets: { label: 'Tickets', singular: 'Ticket', Icon: ConfirmationNumberOutlinedIcon, listHref: '/tickets', color: MODULE_COLORS.tickets },
    products: { label: 'Products', singular: 'Product', Icon: Inventory2OutlinedIcon, listHref: '/products', color: MODULE_COLORS.products },
    partnerCompanies: { label: 'Partner Companies', singular: 'Partner Company', Icon: HandshakeOutlinedIcon, listHref: '/partner-companies', color: MODULE_COLORS.partnerCompanies },
};

/** The module's icon on a small tile in its identity tint. */
export function ModuleIconTile({ category, size = 28 }: { category: GlobalSearchCategory; size?: number }) {
    const { Icon, color } = SEARCH_CATEGORY_META[category];
    return (
        <Box
            component="span"
            aria-hidden
            sx={{
                width: size,
                height: size,
                borderRadius: '8px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                color: color.main,
                backgroundColor: color.soft,
                border: `1px solid ${color.border}`,
            }}
        >
            <Icon sx={{ fontSize: Math.round(size * 0.57) }} />
        </Box>
    );
}

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
