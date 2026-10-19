import React from 'react';

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

export interface EntityDetailDrawerProps {
    open: boolean;
    onClose: () => void;
    title: string;
    subtitle?: string;
    avatarText?: string;
    avatarIcon?: React.ReactNode;
    avatarBg?: string;
    verified?: boolean;
    badges?: DrawerBadgeItem[];
    headerActions?: {
        onEdit?: () => void;
        onSync?: () => void;
        onPhone?: () => void;
        custom?: React.ReactNode;
    };
    tabs: DrawerTabItem[];
    auditRevisions?: AuditRevisionItem[];
    includeChangesTab?: boolean; // Default true: automatically attaches the standardized 'Changes' tab
    changesTabLabel?: string; // Default 'Changes'
    defaultTabIndex?: number;
    statusText?: string;
    primaryAction?: {
        label: string;
        onClick: () => void;
        icon?: React.ReactNode;
    };
    secondaryAction?: {
        label: string;
        onClick: () => void;
        icon?: React.ReactNode;
    };
    width?: number | string | { xs?: string | number; sm?: string | number; md?: string | number };
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

