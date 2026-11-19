'use client';

import { useScorecard } from '@/hooks/queries/useScorecards';
import type { CrmModuleKey } from '@/types/formConfig.types';

/** Built-in status colors, for values the module's scorecard doesn't color. */
function defaultStatusColor(status: string): string {
    const s = status.trim().toLowerCase();
    if (s === 'new' || s === 'open') return 'var(--crm-text-blue-700)';
    if (/lost|unqualified|cancel|reject/.test(s)) return 'var(--mui-palette-error-main)';
    if (/converted|won|resolved|closed|completed/.test(s)) return 'var(--mui-palette-success-main)';
    return 'var(--mui-palette-warning-main)';
}

/**
 * Color of a record's Status pill on its detail page (always shown, not an admin switch): the module scorecard's
 * color for the value when the scorecard counts by this field, else a built-in color by status meaning.
 */
export function useStatusPillColor(module: CrmModuleKey | undefined, fieldKey: string | undefined, value: string | undefined): string {
    const config = useScorecard(module);
    const scorecardColor = config && config.fieldKey === fieldKey && value ? config.options.find((o) => o.value === value)?.color : undefined;
    // Darkened toward the text color so light admin picks stay readable as pill text in both themes.
    if (scorecardColor) return `color-mix(in srgb, ${scorecardColor} 72%, var(--crm-slate-900))`;
    return defaultStatusColor(value ?? '');
}
