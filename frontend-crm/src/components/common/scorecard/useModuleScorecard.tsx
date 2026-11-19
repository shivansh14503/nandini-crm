'use client';

import React, { useCallback, useMemo, useState } from 'react';
import LabelOutlinedIcon from '@mui/icons-material/LabelOutlined';
import { useAuth } from '@/context/AuthContext';
import { useFormConfigs } from '@/hooks/queries/useFormConfigs';
import { useScorecard } from '@/hooks/queries/useScorecards';
import type { CrmModuleKey } from '@/types/formConfig.types';
import { isAdminRole } from '@/utils/adminRoles';
import type { StatusSummaryItem } from '../StatusSummaryCards';
import { ScorecardSettingsDialog } from './ScorecardSettingsDialog';
import { formatScorecardAmount, resolveScorecard, type ResolvedScorecard } from './scorecardUtils';

/** Id of the "All" card. */
export const SCORECARD_ALL_ID = '__all__';

export interface UseModuleScorecardOptions<T> {
    module: CrmModuleKey;
    /** Records the cards count (already narrowed by the screen's other views / filters). */
    rows: readonly T[];
    /** e.g. "All Leads". */
    allLabel: string;
    allIcon: React.ReactNode;
    /** Called when the active card changes (e.g. to go back to page 1). */
    onActiveChange?: () => void;
    /** After the dialog saves / resets, e.g. to show a toast. */
    onSaved?: (message: string) => void;
}

export interface ModuleScorecardState<T> {
    /** An admin-configured scorecard is in effect; when false the screen keeps its built-in cards. */
    configured: boolean;
    scorecard: ResolvedScorecard | null;
    /** Cards for StatusSummaryCards ("All" first). Empty when not configured. */
    items: StatusSummaryItem<string>[];
    activeId: string;
    setActiveId: (id: string) => void;
    /** True when the record belongs to the active card. */
    matches: (row: T) => boolean;
    /** Pencil handler for the "All" card; undefined for non-admins. */
    onEdit: (() => void) | undefined;
    /** The settings dialog: render it once on the screen. */
    dialog: React.ReactNode;
}

/**
 * Scorecard of a list screen: the admin's dropdown field → one colored card per option (plus "All"), each with
 * its count, share and (optionally) the total of a currency field. Screens without a saved scorecard keep their
 * own cards; they still get `onEdit` + `dialog` so an admin can set one up from the "All" card.
 */
export function useModuleScorecard<T>({
    module,
    rows,
    allLabel,
    allIcon,
    onActiveChange,
    onSaved,
}: UseModuleScorecardOptions<T>): ModuleScorecardState<T> {
    const { user } = useAuth();
    const configs = useFormConfigs();
    const config = useScorecard(module);
    const scorecard = useMemo(() => resolveScorecard(config, configs, module), [config, configs, module]);
    const [activeIdState, setActiveIdState] = useState<string>(SCORECARD_ALL_ID);
    const [dialogOpen, setDialogOpen] = useState(false);

    const visibleOptions = useMemo(() => scorecard?.config.options.filter((o) => !o.hidden) ?? [], [scorecard]);
    // A card that disappeared (option hidden / scorecard changed) falls back to "All".
    const activeId =
        activeIdState !== SCORECARD_ALL_ID && visibleOptions.some((o) => o.value === activeIdState) ? activeIdState : SCORECARD_ALL_ID;

    const items = useMemo<StatusSummaryItem<string>[]>(() => {
        if (!scorecard) return [];
        const counts = new Map<string, number>();
        const totals = new Map<string, number>();
        let grandTotal = 0;
        for (const row of rows) {
            const value = scorecard.valueOf(row);
            const amount = scorecard.amountOf(row);
            counts.set(value, (counts.get(value) ?? 0) + 1);
            totals.set(value, (totals.get(value) ?? 0) + amount);
            grandTotal += amount;
        }
        const withAmount = Boolean(scorecard.currencyField);
        return [
            {
                id: SCORECARD_ALL_ID,
                label: allLabel,
                count: rows.length,
                tone: 'brand',
                icon: allIcon,
                hint: withAmount ? formatScorecardAmount(grandTotal) : `By ${scorecard.field.label}`,
            },
            ...visibleOptions.map((option) => ({
                id: option.value,
                label: scorecard.labelOf(option.value),
                count: counts.get(option.value) ?? 0,
                color: option.color,
                icon: <LabelOutlinedIcon />,
                hint: withAmount ? formatScorecardAmount(totals.get(option.value) ?? 0) : undefined,
            })),
        ];
    }, [scorecard, rows, visibleOptions, allLabel, allIcon]);

    const setActiveId = useCallback(
        (id: string) => {
            setActiveIdState(id);
            onActiveChange?.();
        },
        [onActiveChange]
    );

    const matches = useCallback(
        (row: T) => !scorecard || activeId === SCORECARD_ALL_ID || scorecard.valueOf(row) === activeId,
        [scorecard, activeId]
    );

    const isAdmin = isAdminRole(user?.role);
    const onEdit = useMemo(() => (isAdmin ? () => setDialogOpen(true) : undefined), [isAdmin]);

    const dialog = isAdmin ? (
        <ScorecardSettingsDialog open={dialogOpen} module={module} onClose={() => setDialogOpen(false)} onSaved={onSaved} />
    ) : null;

    return { configured: Boolean(scorecard), scorecard, items, activeId, setActiveId, matches, onEdit, dialog };
}
