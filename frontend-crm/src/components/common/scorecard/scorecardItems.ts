import type React from 'react';
import type { CrmModuleKey } from '@/types/formConfig.types';
import type { ScorecardConfig, ScorecardOption } from '@/types/scorecard.types';
import type { StatusSummaryItem } from '../StatusSummaryCards';
import { scorecardOptionLooks } from './scorecardIcons';
import { formatScorecardAmount, scorecardCardOptions, type ResolvedScorecard } from './scorecardUtils';

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

/**
 * A screen's default cards as a scorecard config. The list column / drawer colors stay off: they are admin
 * choices that read the saved scorecard.
 */
export function defaultScorecardConfig(module: CrmModuleKey, defaults: DefaultScorecard): ScorecardConfig {
    return {
        module,
        ...defaults,
        currencyFieldKey: null,
        listViewColor: false,
        drawerViewColor: false,
        enabled: true,
        allLabel: null,
        version: 0,
        updatedBy: null,
        updatedAt: '',
    };
}

export interface ScorecardCards {
    /** "All" first, then one card per shown option, in the admin's order. */
    items: StatusSummaryItem<string>[];
    /** The options that have a card. */
    shown: ScorecardOption[];
    /** The cards show a labelled money line (the screen has built-in totals and a total applies). */
    withAmount: boolean;
}

/**
 * The cards of a scorecard over `rows`: count, share and (optionally) a money total per option. Used by the list
 * screens and by the List Scorecards preview, so both draw exactly the same cards.
 */
export function buildScorecardCards<T>({
    scorecard,
    rows,
    allLabel,
    allIcon,
    amounts,
}: {
    scorecard: ResolvedScorecard;
    rows: readonly T[];
    allLabel: string;
    allIcon: React.ReactNode;
    /** The screen's built-in totals (the first is the default); without them a currency total is the hint line. */
    amounts?: readonly ScorecardAmount<T>[];
}): ScorecardCards {
    const shown = scorecardCardOptions(scorecard).filter((o) => !o.hidden);

    // The admin's currency pick: an amount form field, else one of the built-in totals, else the default total.
    const builtInAmount = amounts?.length ? (amounts.find((a) => a.key === scorecard.config.currencyFieldKey) ?? amounts[0]) : undefined;
    const amountOf: ((row: T) => number) | null = scorecard.currencyField ? scorecard.amountOf : (builtInAmount?.of ?? null);
    const amountLabel = scorecard.currencyField?.label ?? builtInAmount?.label;
    // Screens with built-in totals show every total as a labelled line under the count; others keep a currency
    // total as the card's hint line.
    const withAmount = Boolean(amounts?.length) && Boolean(amountOf);

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
    const looks = scorecardOptionLooks(shown.map((option) => scorecard.labelOf(option.value)));
    /** Amount line, or the hint (a currency total replaces the hint on screens without the amount line). */
    const money = (hint: string | undefined, total: number): Pick<StatusSummaryItem, 'hint' | 'amount' | 'amountLabel'> => {
        if (withAmount) return { amount: formatScorecardAmount(total), amountLabel };
        return { hint: scorecard.currencyField ? formatScorecardAmount(total) : hint };
    };
    const items: StatusSummaryItem<string>[] = [
        {
            id: SCORECARD_ALL_ID,
            label: allLabel,
            count: rows.length,
            tone: 'brand',
            icon: allIcon,
            ...money(`By ${scorecard.field.label}`, grandTotal),
        },
        ...shown.map((option, index) => ({
            id: option.value,
            label: scorecard.labelOf(option.value),
            count: counts.get(option.value) ?? 0,
            color: option.color,
            icon: looks[index].icon,
            ...money(looks[index].hint, totals.get(option.value) ?? 0),
        })),
    ];
    return { items, shown, withAmount };
}
