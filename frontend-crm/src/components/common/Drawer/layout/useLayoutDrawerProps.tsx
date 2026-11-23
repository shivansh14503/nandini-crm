'use client';

import React, { useMemo } from 'react';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import { useFormConfigs } from '@/hooks/queries/useFormConfigs';
import { useShowRecordNumber } from '@/hooks/queries/useDocumentSeries';
import type { DrawerLayoutModule } from '@/lib/drawer-layout';
import type { SeriesModule } from '@/types/documentSeries.types';
import type { DrawerBadgeItem, FormTabDefinition } from '../types';
import { RatingBadge } from '@/components/common/RatingBadge';
import { LayoutTabSections, useDrawerLayout, useLayoutCtx, useLayoutHeader } from './DrawerLayoutRenderer';

export interface LayoutDrawerProps {
    title: string;
    subtitle: string;
    avatarIcon: React.ReactNode | undefined;
    avatarBg: string;
    badges: DrawerBadgeItem[];
    /** The lead's Rating box (under the header buttons), when the record has a rating. */
    headerAside: React.ReactNode;
    formTabs: FormTabDefinition[];
    tabContents: Record<string, React.ReactNode>;
}

/** Each module's record number and its Document Series (hidden from the drawer while the series hides it). */
const RECORD_NUMBERS: Partial<Record<DrawerLayoutModule, { field: string; series: SeriesModule }>> = {
    leads: { field: 'leadCode', series: 'lead' },
    contacts: { field: 'contactCode', series: 'contact' },
    organizations: { field: 'accountCode', series: 'organization' },
    opportunities: { field: 'opportunityCode', series: 'opportunity' },
    quotations: { field: 'quotationCode', series: 'quotation' },
    products: { field: 'productCode', series: 'product' },
    tickets: { field: 'ticketNumber', series: 'ticket' },
};

/** Values the module's drawers must not show: the record number while Document Series hides it. */
export function useHiddenDrawerValues(module: DrawerLayoutModule): ReadonlySet<string> {
    const showNumber = useShowRecordNumber();
    const number = RECORD_NUMBERS[module];
    const hidden = Boolean(number && !showNumber(number.series));
    return useMemo(() => new Set(hidden && number ? [number.field] : []), [hidden, number]);
}

/**
 * EntityDetailDrawer props for a record from the module's drawer layout (the admin's, or the built-in one): header,
 * badges, and one tab per form tab that has sections. `formTabs` supplies the icons of the form's built-in tabs. The
 * record number is left out while Document Series hides it.
 */
export function useLayoutDrawerProps(module: DrawerLayoutModule, record: unknown, formTabs: readonly FormTabDefinition[]): LayoutDrawerProps {
    const { layout } = useDrawerLayout(module);
    const hidden = useHiddenDrawerValues(module);
    const configs = useFormConfigs();
    const ctx = useLayoutCtx(module, record, layout, hidden);
    const header = useLayoutHeader(layout, ctx);

    const tabs = useMemo(() => {
        const known = configs?.moduleTabs?.[module] ?? formTabs.map((t) => ({ key: t.id, label: t.label }));
        return known
            .filter((t) => (layout.tabs[t.key]?.length ?? 0) > 0)
            .map((t) => formTabs.find((f) => f.id === t.key) ?? { id: t.key, label: t.label, icon: <ArticleOutlinedIcon sx={{ fontSize: 18 }} /> });
    }, [configs, module, formTabs, layout]);

    const tabContents = Object.fromEntries(tabs.map((t) => [t.id, <LayoutTabSections key={t.id} sections={layout.tabs[t.id] ?? []} ctx={ctx} />]));

    return {
        title: header.title,
        subtitle: header.subtitle,
        avatarIcon: header.avatarIcon,
        avatarBg: header.avatarBg,
        badges: header.badges.flatMap((b) => (b.item ? [b.item] : [])),
        headerAside: header.rating ? <RatingBadge rating={header.rating.value} reason={header.rating.reason} variant="block" /> : null,
        formTabs: tabs,
        tabContents,
    };
}
