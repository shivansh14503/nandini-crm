'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useFormConfigs, useFormConfigsQuery } from '@/hooks/queries/useFormConfigs';
import { useScorecard, useScorecards } from '@/hooks/queries/useScorecards';
import type { CrmModuleKey } from '@/types/formConfig.types';
import type { ScorecardConfig } from '@/types/scorecard.types';
import { isAdminRole } from '@/utils/adminRoles';
import type { StatusSummaryItem } from '../StatusSummaryCards';
import { ScorecardSettingsDialog } from './ScorecardSettingsDialog';
import { scorecardOptionLooks } from './scorecardIcons';
import { formatScorecardAmount, resolveScorecard, type ResolvedScorecard } from './scorecardUtils';

/** Id of the "All" card. */
export const SCORECARD_ALL_ID = '__all__';

/** Cards a screen shows until an admin saves a scorecard: a dropdown field and a color per option. */
export type DefaultScorecard = Pick<ScorecardConfig, 'fieldKey' | 'options'>;

/** A money value the module's list works out from each record (not a form field), e.g. a deal's Grand Total. */
export interface ScorecardAmount<T> {
    /** Saved as the scorecard's `currencyFieldKey`: `builtin.<name>`, listed by the API (BUILT_IN_SCORECARD_AMOUNTS). */
    key: string;
    /** Shown above each total and in the currency dropdown, e.g. "Actual (Before Tax)". */
    label: string;
    of: (row: T) => number;
}

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
    /**
     * The screen's own cards while no scorecard is saved; the settings dialog starts from them and "Reset to
     * default" returns to them. Keep it stable (useMemo). Without it, `configured` is false until an admin saves one.
     */
    defaultScorecard?: DefaultScorecard | null;
    /**
     * Built-in totals the admin can pick in the currency dropdown besides the form's amount fields. The first is
     * the default, shown when no currency field is picked. Totals appear on every card under the count, with their
     * label. Keep it stable (a module constant or useMemo). Without it, a currency total is the card's hint line.
     */
    amounts?: readonly ScorecardAmount<T>[];
}

export interface ModuleScorecardState<T> {
    /** Still working out whether a scorecard applies: show a skeleton rather than either set of cards. */
    loading: boolean;
    /** A scorecard (the admin's, else `defaultScorecard`) is in effect; when false the screen keeps its built-in cards. */
    configured: boolean;
    /** The cards show amounts (`amounts` was given and a total applies). */
    withAmount: boolean;
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
 * its count, share and (optionally) the total of a currency field. Screens without a saved scorecard show their
 * `defaultScorecard`, or else keep their own cards; either way they get `onEdit` + `dialog` so an admin can set
 * one up from the "All" card.
 */
export function useModuleScorecard<T>({
    module,
    rows,
    allLabel,
    allIcon,
    onActiveChange,
    onSaved,
    defaultScorecard,
    amounts,
}: UseModuleScorecardOptions<T>): ModuleScorecardState<T> {
    const { user } = useAuth();
    const configs = useFormConfigs();
    const savedConfig = useScorecard(module);
    const defaultConfig = useMemo<ScorecardConfig | null>(
        () =>
            defaultScorecard
                ? {
                      module,
                      ...defaultScorecard,
                      currencyFieldKey: null,
                      // The list column / drawer colors stay admin choices (they read the saved scorecard).
                      listViewColor: false,
                      drawerViewColor: false,
                      updatedBy: null,
                      updatedAt: '',
                  }
                : null,
        [defaultScorecard, module]
    );
    // The saved scorecard; the screen's default when none is saved (or the saved one's field is gone).
    const scorecard = useMemo(
        () => resolveScorecard(savedConfig, configs, module) ?? resolveScorecard(defaultConfig, configs, module),
        [savedConfig, defaultConfig, configs, module]
    );
    // Until both the saved scorecard and the form (for the field's options) are in, we can't tell which cards
    // to draw; screens show a skeleton instead of flashing their built-in cards first.
    const scorecardsPending = useScorecards().isPending;
    const formConfigsPending = useFormConfigsQuery().isPending;
    const loading = scorecardsPending || (Boolean(savedConfig ?? defaultConfig) && !scorecard && formConfigsPending);
    const [activeIdState, setActiveIdState] = useState<string>(SCORECARD_ALL_ID);
    const [dialogOpen, setDialogOpen] = useState(false);

    const visibleOptions = useMemo(() => scorecard?.config.options.filter((o) => !o.hidden) ?? [], [scorecard]);
    // A card that disappeared (option hidden / scorecard changed) falls back to "All".
    const activeId =
        activeIdState !== SCORECARD_ALL_ID && visibleOptions.some((o) => o.value === activeIdState) ? activeIdState : SCORECARD_ALL_ID;

    // The admin's currency pick: an amount form field, else one of the built-in totals, else the default total.
    const builtInAmount = useMemo(() => {
        if (!amounts?.length) return undefined;
        const key = scorecard?.config.currencyFieldKey;
        return amounts.find((a) => a.key === key) ?? amounts[0];
    }, [amounts, scorecard]);
    const amountOf = useMemo<((row: T) => number) | null>(() => {
        if (!scorecard) return null;
        if (scorecard.currencyField) return scorecard.amountOf;
        return builtInAmount?.of ?? null;
    }, [scorecard, builtInAmount]);
    const amountLabel = scorecard?.currencyField?.label ?? builtInAmount?.label;
    // Screens given `amounts` show every total as a labelled line under the count; others keep a currency total
    // as the card's hint line.
    const withAmount = Boolean(amounts?.length) && Boolean(amountOf);

    const items = useMemo<StatusSummaryItem<string>[]>(() => {
        if (!scorecard) return [];
        const counts = new Map<string, number>();
        const totals = new Map<string, number>();
        let grandTotal = 0;
        for (const row of rows) {
            const value = scorecard.valueOf(row);
            const rowAmount = amountOf ? amountOf(row) : 0;
            counts.set(value, (counts.get(value) ?? 0) + 1);
            totals.set(value, (totals.get(value) ?? 0) + rowAmount);
            grandTotal += rowAmount;
        }
        const looks = scorecardOptionLooks(visibleOptions.map((option) => scorecard.labelOf(option.value)));
        /** Amount line, or the hint (a currency total replaces the hint on screens without the amount line). */
        const money = (hint: string | undefined, total: number): Pick<StatusSummaryItem, 'hint' | 'amount' | 'amountLabel'> => {
            if (withAmount) return { amount: formatScorecardAmount(total), amountLabel };
            return { hint: scorecard.currencyField ? formatScorecardAmount(total) : hint };
        };
        return [
            {
                id: SCORECARD_ALL_ID,
                label: allLabel,
                count: rows.length,
                tone: 'brand',
                icon: allIcon,
                ...money(`By ${scorecard.field.label}`, grandTotal),
            },
            ...visibleOptions.map((option, index) => ({
                id: option.value,
                label: scorecard.labelOf(option.value),
                count: counts.get(option.value) ?? 0,
                color: option.color,
                icon: looks[index].icon,
                ...money(looks[index].hint, totals.get(option.value) ?? 0),
            })),
        ];
    }, [scorecard, rows, visibleOptions, allLabel, allIcon, amountOf, amountLabel, withAmount]);

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
        <ScorecardSettingsDialog
            open={dialogOpen}
            module={module}
            onClose={() => setDialogOpen(false)}
            onSaved={onSaved}
            defaultScorecard={defaultScorecard}
            builtInAmounts={amounts}
        />
    ) : null;

    return { loading, configured: Boolean(scorecard), withAmount, scorecard, items, activeId, setActiveId, matches, onEdit, dialog };
}
