'use client';

import React, { useMemo } from 'react';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import { useFormConfigs } from '@/hooks/queries/useFormConfigs';
import type { DrawerLayoutModule } from '@/lib/drawer-layout';
import type { DrawerBadgeItem, FormTabDefinition } from '../types';
import { LayoutTabSections, useDrawerLayout, useLayoutCtx, useLayoutHeader } from './DrawerLayoutRenderer';

export interface LayoutDrawerProps {
    title: string;
    subtitle: string;
    avatarIcon: React.ReactNode | undefined;
    avatarBg: string;
    badges: DrawerBadgeItem[];
    formTabs: FormTabDefinition[];
    tabContents: Record<string, React.ReactNode>;
}

/**
 * EntityDetailDrawer props for a record from the module's drawer layout (the admin's, or the built-in one): header,
 * badges, and one tab per form tab that has sections. `formTabs` supplies the icons of the form's built-in tabs;
 * `hidden` lists values not to show (e.g. the record number when Document Series hides it).
 */
export function useLayoutDrawerProps(
    module: DrawerLayoutModule,
    record: unknown,
    formTabs: readonly FormTabDefinition[],
    hidden?: ReadonlySet<string>,
): LayoutDrawerProps {
    const { layout } = useDrawerLayout(module);
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
        formTabs: tabs,
        tabContents,
    };
}
