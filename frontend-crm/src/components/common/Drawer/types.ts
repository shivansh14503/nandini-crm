import React from 'react';
import type { SxProps, Theme } from '@mui/material';

export interface DrawerTabItem {
    id: string;
    label: string;
    icon: React.ReactNode;
    badge?: React.ReactNode | number | string;
    content: React.ReactNode;
}

export interface AuditRevisionItem {
    title: string;
    author: string;
    time: string;
    from?: string;
    to?: string;
    note?: string;
    tag?: string;
}

export interface DrawerBadgeItem {
    label: string;
    icon?: React.ReactNode;
    color?: string;
    backgroundColor?: string;
    borderColor?: string;
    isMonospace?: boolean;
}

/**
 * Standard form tab definition exported by creation forms.
 * Represents the single source of truth for tab identification, label, and icon.
 */
export interface FormTabDefinition {
    id: string;
    label: string;
    icon: React.ReactNode;
    sublabel?: string;
    badge?: React.ReactNode | number | string;
    hasDot?: boolean;
}


export interface DrawerActionButtonProps {
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
    variant?: 'text' | 'outlined' | 'contained';
    disabled?: boolean;
    tooltip?: string;
    sx?: SxProps<Theme>;
}

export interface EntityDetailDrawerProps {
    open: boolean;
    onClose: () => void;
    title: string;
    subtitle?: string;
    avatarText?: string;
    avatarIcon?: React.ReactNode;
    avatarBg?: string;
    verified?: boolean;
    loading?: boolean;
    badges?: DrawerBadgeItem[];
    headerActions?: {
        onEdit?: () => void;
        onSync?: () => void;
        onView?: () => void;
        custom?: React.ReactNode;
    };
    tabs?: DrawerTabItem[];
    formTabs?: readonly FormTabDefinition[] | FormTabDefinition[];
    tabContents?: Record<string, React.ReactNode>;
    children?: React.ReactNode;
    auditRevisions?: AuditRevisionItem[];
    includeChangesTab?: boolean; // Default true: automatically attaches the standardized 'Changes' tab
    changesTabLabel?: string; // Default 'Changes'
    defaultTabIndex?: number;
    statusText?: string;
    primaryAction?: DrawerActionButtonProps;
    secondaryAction?: DrawerActionButtonProps;
    footerActions?: React.ReactNode;
    width?: number | string | { xs?: string | number; sm?: string | number; md?: string | number };
    hideBackdrop?: boolean;
    onCollapseChange?: (collapsed: boolean) => void;
    /** Controlled collapse state. Overrides the shared stack context when provided. */
    isCollapsed?: boolean;
    /** Controlled toggle handler. Overrides the shared stack context when provided. */
    onToggleCollapse?: () => void;
    /** Whether this drawer renders the floating bookmark tab (default true). */
    showBookmark?: boolean;
}

/**
 * Dynamically builds DrawerTabItem[] by mapping directly over the creation form's exported tab definitions.
 * Eliminates duplicate/hardcoded labels across side drawers and guarantees 100% sync with creation forms.
 */
export function buildDrawerTabs<T extends string = string>(
    formTabs: readonly FormTabDefinition[] | FormTabDefinition[],
    contentMap: Partial<Record<T, React.ReactNode>>
): DrawerTabItem[] {
    return formTabs.map((tab) => ({
        id: tab.id,
        label: tab.label,
        icon: tab.icon,
        badge: tab.badge,
        content: contentMap[tab.id as T] || null,
    }));
}
