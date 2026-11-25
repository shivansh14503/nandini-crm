import { useCallback, useState } from 'react';
import { SCORECARD_MODULES } from '@/components/common/scorecard/scorecardModules';
import type { DefaultScorecard } from '@/components/common/scorecard/scorecardItems';
import { scorecardDropdownFields, suggestColor } from '@/components/common/scorecard/scorecardUtils';
import type { CrmModuleKey, FormConfigsPayload } from '@/types/formConfig.types';
import type { SaveScorecardPayload, ScorecardConfig, ScorecardOption } from '@/types/scorecard.types';
import { findCategory } from '@/utils/formConfig';

/**
 * Admin › List Scorecards: the module's scorecard as the admin is editing it. Nothing reaches the list screens
 * until Save; Discard goes back to what is saved.
 */

export interface DraftOption extends ScorecardOption {
    /** The option's name in the dropdown. */
    label: string;
    /** Archived in the dropdown (kept so records that still have it keep their color). */
    removed: boolean;
}

export interface ScorecardDraft {
    /**
     * The admin's own cards. False while nothing is saved and the list shows its built-in cards: the settings
     * below are only a starting point until the admin changes one (or saves). Always true on lists without
     * built-in cards, where switching the cards on shows these settings.
     */
    custom: boolean;
    /** The list shows cards. */
    enabled: boolean;
    fieldKey: string;
    /** '' = no form field: the screen's default total, or counts only. */
    currencyFieldKey: string;
    /** '' = the screen's own wording ("All Leads"). */
    allLabel: string;
    /** Card order. */
    options: DraftOption[];
    listViewColor: boolean;
    drawerViewColor: boolean;
}

/** What the list screen would show with this draft. */
export type DraftMode = 'custom' | 'builtin' | 'off';

export const draftMode = (draft: ScorecardDraft): DraftMode => (!draft.enabled ? 'off' : draft.custom ? 'custom' : 'builtin');

/**
 * The field's options as cards. `order: 'saved'` keeps `prev`'s order and puts options it doesn't have at the end
 * (dropdown order); `'dropdown'` follows the dropdown. Archived options stay only while `prev` colors them; either
 * way an option keeps the color `prev` gives its value.
 */
export function draftOptionsFor(
    configs: FormConfigsPayload | null,
    module: CrmModuleKey,
    fieldKey: string,
    prev: readonly ScorecardOption[],
    order: 'saved' | 'dropdown'
): DraftOption[] {
    const field = scorecardDropdownFields(configs, module).find((f) => f.fieldKey === fieldKey);
    const category = findCategory(configs, field?.dropdownCategoryKey);
    const prevByValue = new Map(prev.map((o) => [o.value, o]));
    const inDropdown = (category?.options ?? [])
        .filter((o) => o.isActive || prevByValue.has(o.value))
        .sort((a, b) => a.sortOrder - b.sortOrder);
    const byValue = new Map(inDropdown.map((o) => [o.value, o]));
    const sorted =
        order === 'dropdown'
            ? inDropdown
            : [
                  ...prev.map((o) => byValue.get(o.value)).filter((o): o is NonNullable<typeof o> => Boolean(o)),
                  ...inDropdown.filter((o) => !prevByValue.has(o.value)),
              ];
    return sorted.map((o, index) => {
        const before = prevByValue.get(o.value);
        return {
            value: o.value,
            label: o.label || o.value,
            color: before?.color ?? suggestColor(o.label || o.value, index),
            hidden: before?.hidden ?? false,
            removed: !o.isActive,
        };
    });
}

/** The module's status / stage dropdown, else its first dropdown ('' when it has none). */
function startingField(configs: FormConfigsPayload | null, module: CrmModuleKey): string {
    const fields = scorecardDropdownFields(configs, module);
    return (fields.find((f) => /status|stage/i.test(f.fieldKey)) ?? fields[0])?.fieldKey ?? '';
}

/**
 * The draft for what is saved: the saved scorecard; else the screen's default cards (Opportunities / Quotations
 * stages); else a starting point on the module's status / stage dropdown with suggested colors.
 */
export function initialDraft(
    configs: FormConfigsPayload | null,
    module: CrmModuleKey,
    saved: ScorecardConfig | null,
    defaults: DefaultScorecard | null
): ScorecardDraft {
    const fields = scorecardDropdownFields(configs, module);
    const savedField = saved && fields.some((f) => f.fieldKey === saved.fieldKey) ? saved.fieldKey : '';
    const defaultField = defaults && fields.some((f) => f.fieldKey === defaults.fieldKey) ? defaults.fieldKey : '';
    const fieldKey = savedField || defaultField || startingField(configs, module);
    const prevOptions = savedField ? (saved?.options ?? []) : fieldKey === defaultField ? (defaults?.options ?? []) : [];
    const { builtInCards } = SCORECARD_MODULES[module];
    return {
        custom: Boolean(saved) || !builtInCards,
        enabled: saved ? saved.enabled : builtInCards,
        fieldKey,
        currencyFieldKey: (savedField && saved?.currencyFieldKey) || '',
        allLabel: saved?.allLabel ?? '',
        options: fieldKey ? draftOptionsFor(configs, module, fieldKey, prevOptions, savedField ? 'saved' : 'dropdown') : [],
        listViewColor: saved?.listViewColor ?? true,
        drawerViewColor: saved?.drawerViewColor ?? true,
    };
}

/** The API body for a draft. */
export function draftPayload(draft: ScorecardDraft, version: number | null): SaveScorecardPayload {
    return {
        fieldKey: draft.fieldKey,
        currencyFieldKey: draft.currencyFieldKey || null,
        options: draft.options.map(({ value, color, hidden }) => ({ value, color, ...(hidden ? { hidden } : {}) })),
        listViewColor: draft.listViewColor,
        drawerViewColor: draft.drawerViewColor,
        enabled: draft.enabled,
        allLabel: draft.allLabel.trim() || null,
        version,
    };
}

/** The draft as the config the list screens would read (for the preview). */
export function draftConfig(module: CrmModuleKey, draft: ScorecardDraft): ScorecardConfig {
    return { module, ...draftPayload(draft, null), version: 0, allLabel: draft.allLabel.trim() || null, updatedBy: null, updatedAt: '' };
}

interface DraftState {
    module: CrmModuleKey;
    /** Version of the saved scorecard the draft started from (null: nothing saved). */
    version: number | null;
    /** The form configuration was loaded when the draft started (the field options come from it). */
    configsReady: boolean;
    base: ScorecardDraft;
    draft: ScorecardDraft;
}

const sameDraft = (a: ScorecardDraft, b: ScorecardDraft) => a === b || JSON.stringify(a) === JSON.stringify(b);

/**
 * The selected module's draft. It starts over when the module changes, and follows a newer save (another admin,
 * another tab) while there are no edits; with edits it keeps them and reports `outdated`.
 */
export function useScorecardDraft(
    module: CrmModuleKey,
    saved: ScorecardConfig | null,
    configs: FormConfigsPayload | null,
    defaults: DefaultScorecard | null
) {
    const savedVersion = saved?.version ?? null;
    const fresh = (): DraftState => {
        const base = initialDraft(configs, module, saved, defaults);
        return { module, version: savedVersion, configsReady: Boolean(configs), base, draft: base };
    };
    const [state, setState] = useState<DraftState>(fresh);
    const dirty = !sameDraft(state.draft, state.base);
    const stale = state.version !== savedVersion || state.configsReady !== Boolean(configs);
    // Adjusting state while rendering (as React recommends over an effect): the next render sees it caught up.
    let current = state;
    if (state.module !== module || (stale && !dirty)) {
        current = fresh();
        setState(current);
    }

    const update = useCallback((recipe: (draft: ScorecardDraft) => ScorecardDraft) => {
        setState((prev) => ({ ...prev, draft: recipe(prev.draft) }));
    }, []);

    /** A change to the cards' settings: from now on they are the admin's own cards. */
    const edit = useCallback((patch: Partial<ScorecardDraft>) => update((d) => ({ ...d, ...patch, custom: true })), [update]);

    /** Back to what is saved (the latest save, when someone saved since). */
    const discard = () => setState(fresh());

    /** After a save / reset: the draft is what is saved now. */
    const settle = (nowSaved: ScorecardConfig | null) => {
        const base = initialDraft(configs, module, nowSaved, defaults);
        setState({ module, version: nowSaved?.version ?? null, configsReady: Boolean(configs), base, draft: base });
    };

    return {
        draft: current.draft,
        base: current.base,
        dirty: current === state && dirty,
        /** Someone saved this scorecard after the draft started (Save would be refused). */
        outdated: current === state && dirty && stale,
        /** The version Save sends. */
        version: current.version,
        update,
        edit,
        discard,
        settle,
    };
}
