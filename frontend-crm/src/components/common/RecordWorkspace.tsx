'use client';

import React, { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { Box, useMediaQuery, useTheme } from '@mui/material';
import {
    RelatedModulesSidebar,
    RelatedRecordsTableView,
    DrawerStackContext,
    DOCK,
    dockContentOffset,
    type DrawerStackContextValue,
} from './Drawer';
import { RelatedSecondaryDrawer, type SecondaryDrawerEntity } from './RelatedSecondaryDrawer';
import { useRelatedModulesForEntity, type CrmEntityType } from '@/config/relatedModules.config';
import { useListOrigin } from '@/utils/listOrigin';

/** The dock's pinned choice, remembered per browser (localStorage; falls back to in-memory when unavailable). */
const DOCK_PINNED_KEY = 'crm.recordDock.pinned';
const dockPinnedListeners = new Set<() => void>();
let dockPinnedMemory = false;

function readDockPinned(): boolean {
    try {
        return window.localStorage.getItem(DOCK_PINNED_KEY) === '1';
    } catch {
        return dockPinnedMemory;
    }
}

function writeDockPinned(next: boolean) {
    dockPinnedMemory = next;
    try {
        window.localStorage.setItem(DOCK_PINNED_KEY, next ? '1' : '0');
    } catch {
        /* storage unavailable: memory only */
    }
    dockPinnedListeners.forEach((listener) => listener());
}

function subscribeDockPinned(listener: () => void) {
    dockPinnedListeners.add(listener);
    window.addEventListener('storage', listener);
    return () => {
        dockPinnedListeners.delete(listener);
        window.removeEventListener('storage', listener);
    };
}
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

    // Pinned docks push the page over; on small screens a pinned dock floats over the page instead.
    const isSmallScreen = useMediaQuery(theme.breakpoints.down('md'));
    const pinned = useSyncExternalStore(subscribeDockPinned, readDockPinned, () => false);
    const togglePinned = useCallback(() => writeDockPinned(!readDockPinned()), []);
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === '\\') {
                e.preventDefault();
                togglePinned();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [togglePinned]);
    const sidebarWidth = dockContentOffset(pinned && !isSmallScreen);

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
                modules={modules}
                activeModuleId={activeModuleId ?? undefined}
                onModuleSelect={selectModule}
                pinned={pinned}
                onTogglePinned={togglePinned}
            />

            {/* The navbar (<header>) keeps the full width; only the page below it makes room for the floating dock. */}
            <Box
                sx={{
                    minWidth: 0,
                    '& > :not(header)': {
                        paddingLeft: `${sidebarWidth}px`,
                        transition: 'padding-left 0.22s cubic-bezier(0.2, 0, 0, 1)',
                        // A module table floats over the page: hide the detail view so the glass sits on a calm background.
                        visibility: activeModuleId ? 'hidden' : 'visible',
                    },
                }}
            >
                {children}
            </Box>

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
                    // The drawer floats 12px in from the edge; leave the same 12px gap before it.
                    rightOffset={drawerEntity ? DRAWER_WIDTH + DOCK.inset * 2 : 0}
                    isRightDrawerCollapsed={drawerCollapsed}
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
