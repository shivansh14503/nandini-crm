'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Box, useMediaQuery, useTheme } from '@mui/material';
import { RelatedModulesSidebar, RelatedRecordsTableView, DrawerStackContext, type DrawerStackContextValue } from './Drawer';
import { RelatedSecondaryDrawer, type SecondaryDrawerEntity } from './RelatedSecondaryDrawer';
import { useRelatedModulesForEntity, type CrmEntityType } from '@/config/relatedModules.config';
import { useListOrigin } from '@/utils/listOrigin';

const SIDEBAR_WIDTH = 260;
const SIDEBAR_COLLAPSED_WIDTH = 72;
/** Width of the record drawer on desktop (EntityDetailDrawer's default `md` width). */
const DRAWER_WIDTH = 580;

export interface RecordWorkspaceProps {
    entityType: CrmEntityType;
    /** The record shown on this page; the sidebar fills in once it has loaded. */
    entity: { id: string } | null | undefined;
    /** The record's display title, used to match its related records. */
    title: string;
    /** The record's own module list, used for "back" when the page wasn't reached from a list. */
    listHref: string;
    /** The page itself (navbar + detail view). */
    children: React.ReactNode;
}

/**
 * Detail page workspace: the record's related modules sidebar on the left with the detail view beside it.
 * Picking a module lays that module's table over the detail view; clicking a row opens the row's drawer beside the
 * table (sidebar + table + drawer). The drawer's eye button opens that record's own detail page, and so on; closing
 * the module table returns to the list the user started from.
 */
export function RecordWorkspace({ entityType, entity, title, listHref, children }: RecordWorkspaceProps) {
    const router = useRouter();
    const theme = useTheme();
    const listOrigin = useListOrigin(listHref);

    const isSmallScreen = useMediaQuery(theme.breakpoints.down('md'));
    const [sidebarCollapsedChoice, setSidebarCollapsedChoice] = useState<boolean | null>(null);
    const sidebarCollapsed = sidebarCollapsedChoice ?? isSmallScreen;
    const sidebarWidth = sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH;

    const [activeModuleId, setActiveModuleId] = useState<string | null>(null);
    const [drawerEntity, setDrawerEntity] = useState<SecondaryDrawerEntity | null>(null);
    const [drawerCollapsed, setDrawerCollapsed] = useState(false);

    const modules = useRelatedModulesForEntity(entityType, entity ?? null);
    const activeModule = modules.find((m) => m.id === activeModuleId);

    const selectModule = useCallback((moduleId: string) => {
        setActiveModuleId(moduleId);
        setDrawerEntity(null);
    }, []);

    // Stable handlers: the drawer re-runs its expand-on-open effect whenever `onCollapseReset` changes identity.
    const toggleDrawerCollapsed = useCallback(() => setDrawerCollapsed((prev) => !prev), []);
    const expandDrawer = useCallback(() => setDrawerCollapsed(false), []);
    const stackValue = useMemo<DrawerStackContextValue>(
        () => ({
            isCollapsed: drawerCollapsed,
            onToggleCollapse: toggleDrawerCollapsed,
            onCollapseReset: expandDrawer,
            showBookmark: true,
            persistent: true,
        }),
        [drawerCollapsed, toggleDrawerCollapsed, expandDrawer]
    );

    return (
        <>
            <RelatedModulesSidebar
                open
                modules={modules}
                activeModuleId={activeModuleId ?? undefined}
                onModuleSelect={selectModule}
                collapsed={sidebarCollapsed}
                onToggleCollapse={setSidebarCollapsedChoice}
            />

            <Box sx={{ pl: `${sidebarWidth}px`, transition: 'padding-left 0.2s ease', minWidth: 0 }}>{children}</Box>

            {entity && activeModuleId && (
                <RelatedRecordsTableView
                    key={activeModuleId}
                    open
                    moduleId={activeModuleId}
                    moduleTitle={activeModule?.label || 'Related Records'}
                    parentRecordId={entity.id}
                    parentEntityTitle={title}
                    entityData={entity}
                    entityType={entityType}
                    leftOffset={sidebarWidth}
                    rightOffset={drawerEntity ? DRAWER_WIDTH : 0}
                    isRightDrawerCollapsed={drawerCollapsed}
                    activeRowId={drawerEntity ? String(drawerEntity.data.id ?? '') : null}
                    onClose={() => router.push(listOrigin)}
                    closeTooltip="Close & return to list"
                    onRowClick={(row, moduleKey) => setDrawerEntity({ type: moduleKey, data: row })}
                />
            )}

            <DrawerStackContext.Provider value={stackValue}>
                {drawerEntity && (
                    <RelatedSecondaryDrawer
                        key={`${drawerEntity.type}:${String(drawerEntity.data.id ?? '')}`}
                        entity={drawerEntity}
                        moduleLabel={activeModule?.label}
                        parentTitle={title}
                        onClose={() => setDrawerEntity(null)}
                    />
                )}
            </DrawerStackContext.Provider>
        </>
    );
}
