import { useMemo } from 'react';
import { useFormConfigs } from '@/hooks/queries/useFormConfigs';
import type { CrmModuleKey } from '@/types/formConfig.types';
import { activeOptionValues, findCategory, optionLabelMap, optionsForModule } from '@/utils/formConfig';

/** A dropdown option a list's quick-view pill can filter by: the stored value and the label the admin gave it. */
export interface PillOption {
    value: string;
    label: string;
}

export interface DropdownPillOptions {
    /** Active options in admin order (the module's own subset for shared lists). */
    options: PillOption[];
    /** The active option with this value (case-insensitive), or `undefined` once an admin removed / archived it. */
    find: (value: string) => PillOption | undefined;
}

/**
 * The single source for list quick-view pills that filter by a dropdown value (Products by Type, Activities by
 * Type, Organizations by Customer Type …). It reads the same admin configuration as the forms and the Filter
 * dialog, which is refreshed when an admin saves the Dropdown Manager, so a removed option drops its pill and a
 * renamed one relabels it at once.
 *
 * Never match records against a hand-written list of option values in a pill (`['AMC', 'Services'].includes(x)`):
 * build the pill from `options` / `find` instead (see docs/system-design.md, "Filter pills follow the dropdowns").
 */
export function useDropdownPillOptions(categoryKey: string, module?: CrmModuleKey): DropdownPillOptions {
    const configs = useFormConfigs();
    return useMemo(() => {
        const category = findCategory(configs, categoryKey);
        const labels = optionLabelMap(category) ?? {};
        const options = optionsForModule(categoryKey, activeOptionValues(category), module).map((value) => ({
            value,
            label: labels[value] ?? value,
        }));
        const byValue = new Map(options.map((o) => [o.value.toLowerCase(), o]));
        return { options, find: (value: string) => byValue.get(value.toLowerCase()) };
    }, [configs, categoryKey, module]);
}

/** Same comparison the pills use: a record's stored dropdown value against an option value, ignoring case. */
export const sameOption = (stored: string | null | undefined, value: string) => (stored ?? '').toLowerCase() === value.toLowerCase();
