'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { ROUTES } from '@/config/constants';
import { useAuth } from '@/context/AuthContext';
import { useFormConfigs, useFormConfigsQuery } from '@/hooks/queries/useFormConfigs';
import { useScorecard, useScorecards } from '@/hooks/queries/useScorecards';
import type { CrmModuleKey } from '@/types/formConfig.types';
import { isAdminRole } from '@/utils/adminRoles';
import { useDisplayFormats } from '@/utils/formats';
import { StatusSummaryCards, StatusSummaryCardsSkeleton, type StatusSummaryItem } from '../StatusSummaryCards';
import { SCORECARD_MODULES, scorecardAmountsOf, useDefaultScorecard } from './scorecardModules';
import { SCORECARD_ALL_ID, buildScorecardCards, defaultScorecardConfig } from './scorecardItems';
import { resolveScorecard, type ResolvedScorecard } from './scorecardUtils';

// Kept here too for the screens that already import them from this file.
export { SCORECARD_ALL_ID } from './scorecardItems';
export type { DefaultScorecard, ScorecardAmount } from './scorecardItems';

export interface UseModuleScorecardOptions<T> {
    module: CrmModuleKey;
    /** Records the cards count (already narrowed by the screen's other views / filters). */
    rows: readonly T[];
    /** Called when the active card changes (e.g. to go back to page 1). */
    onActiveChange?: () => void;
}

export interface ModuleScorecardState<T> {
    /** Still working out whether a scorecard applies: show a skeleton rather than either set of cards. */
    loading: boolean;
    /** A scorecard (the admin's, else the screen's default cards) is in effect. */
    configured: boolean;
    /** An admin switched this list's cards off: the screen shows no cards at all (not even built-in ones). */
    hidden: boolean;
    /** The screen may show cards (built-in ones, or a saved scorecard that is on): worth a skeleton while loading. */
    expectsCards: boolean;
    /** The cards show amounts (the screen has built-in totals and a total applies). */
    withAmount: boolean;
    scorecard: ResolvedScorecard | null;
    /** Cards for StatusSummaryCards ("All" first). Empty when not configured. */
    items: StatusSummaryItem<string>[];
    activeId: string;
    setActiveId: (id: string) => void;
    /** True when the record belongs to the active card (always, when no scorecard is in effect). */
    matches: (row: T) => boolean;
    /** Admins: the gear on the "All" card opens this module in Admin › List Scorecards. */
    settingsHref: string | undefined;
}

/**
 * Scorecard of a list screen, as set up under Admin › List Scorecards: the admin's dropdown field → one colored
 * card per option (plus "All"), each with its count, share and (optionally) a money total. Without a saved
 * scorecard the screen shows its default cards (SCORECARD_MODULES), or none; a scorecard an admin switched off
 * shows nothing. Render the result with `ModuleScorecardSummary`.
 */
export function useModuleScorecard<T>({ module, rows, onActiveChange }: UseModuleScorecardOptions<T>): ModuleScorecardState<T> {
    const info = SCORECARD_MODULES[module];
    const amounts = scorecardAmountsOf<T>(module);
    const { user } = useAuth();
    const configs = useFormConfigs();
    const savedConfig = useScorecard(module);
    const defaults = useDefaultScorecard(module);
    const hidden = savedConfig ? !savedConfig.enabled : false;
    const defaultConfig = useMemo(() => (defaults ? defaultScorecardConfig(module, defaults) : null), [defaults, module]);
    // The saved scorecard; the screen's default when none is saved (or the saved one's field is gone).
    const scorecard = useMemo(
        () => (hidden ? null : (resolveScorecard(savedConfig, configs, module) ?? resolveScorecard(defaultConfig, configs, module))),
        [hidden, savedConfig, defaultConfig, configs, module]
    );
    // Until both the saved scorecard and the form (for the field's options) are in, we can't tell which cards
    // to draw; screens show a skeleton instead of flashing their built-in cards first.
    const scorecardsPending = useScorecards().isPending;
    const formConfigsPending = useFormConfigsQuery().isPending;
    const loading = scorecardsPending || (!hidden && Boolean(savedConfig ?? defaultConfig) && !scorecard && formConfigsPending);
    const [activeIdState, setActiveIdState] = useState<string>(SCORECARD_ALL_ID);

    const allLabel = savedConfig?.allLabel || info.allLabel;
    // The cards carry formatted amounts: rebuilt when the company formats change.
    const formats = useDisplayFormats();
    const cards = useMemo(
        () => (scorecard ? buildScorecardCards({ scorecard, rows, allLabel, allIcon: info.allIcon, amounts }) : null),
        // eslint-disable-next-line react-hooks/exhaustive-deps -- `formats` is read through the display store
        [scorecard, rows, allLabel, info.allIcon, amounts, formats]
    );

    // A card that disappeared (option hidden / scorecard changed) falls back to "All".
    const activeId =
        activeIdState !== SCORECARD_ALL_ID && cards?.shown.some((o) => o.value === activeIdState) ? activeIdState : SCORECARD_ALL_ID;

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

    return {
        loading,
        configured: Boolean(scorecard),
        hidden,
        expectsCards: !hidden && (info.builtInCards || Boolean(savedConfig)),
        withAmount: cards?.withAmount ?? Boolean(amounts?.length),
        scorecard,
        items: cards?.items ?? [],
        activeId,
        setActiveId,
        matches,
        settingsHref: isAdminRole(user?.role) ? ROUTES.LIST_SCORECARDS_FOR(module) : undefined,
    };
}

/**
 * The summary row of a list screen: a skeleton while loading, the scorecard's cards, else `fallback` (Leads: its
 * built-in status cards). Nothing when the admin switched the cards off or the list has none.
 */
export function ModuleScorecardSummary<T>({
    state,
    loading,
    fallback = null,
    fallbackCount,
}: {
    state: ModuleScorecardState<T>;
    /** The screen's records are still loading. */
    loading: boolean;
    /** Cards to show when no scorecard is in effect. */
    fallback?: React.ReactNode;
    /** Number of `fallback` cards, for the skeleton. */
    fallbackCount?: number;
}) {
    if (state.hidden) return null;
    if (loading || state.loading) {
        if (!state.expectsCards) return null;
        const count = state.items.length || fallbackCount || (state.scorecard ? state.scorecard.config.options.length + 1 : 5);
        return <StatusSummaryCardsSkeleton count={count} withAmount={state.withAmount} />;
    }
    if (!state.configured) return <>{fallback}</>;
    return (
        <StatusSummaryCards<string>
            items={state.items}
            activeId={state.activeId}
            onChange={state.setActiveId}
            settingsHref={state.settingsHref}
           
        />
    );
}
