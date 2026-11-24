import type { SxProps, Theme } from '@mui/material';
import type { DropdownCategoryDto, FormConfigsPayload, FormFieldDefinitionDto, CrmModuleKey } from '@/types/formConfig.types';
import type { ScorecardConfig } from '@/types/scorecard.types';
import { findCategory, moduleFields } from '@/utils/formConfig';
import { readFieldValue } from '../DataTable/useFormFieldColumns';

/**
 * Colors an admin can pick for a scorecard option. They are data (stored per option), not brand UI, so they stay
 * the same in light and dark mode; every surface built from them mixes them with theme tokens to stay readable.
 */
export const SCORECARD_PALETTE: readonly { name: string; hex: string }[] = [
    { name: 'Blue', hex: '#3B82F6' },
    { name: 'Sky', hex: '#0EA5E9' },
    { name: 'Teal', hex: '#14B8A6' },
    { name: 'Green', hex: '#22C55E' },
    { name: 'Lime', hex: '#84CC16' },
    { name: 'Yellow', hex: '#EAB308' },
    { name: 'Amber', hex: '#F59E0B' },
    { name: 'Orange', hex: '#F97316' },
    { name: 'Red', hex: '#EF4444' },
    { name: 'Rose', hex: '#F43F5E' },
    { name: 'Pink', hex: '#EC4899' },
    { name: 'Fuchsia', hex: '#D946EF' },
    { name: 'Violet', hex: '#8B5CF6' },
    { name: 'Indigo', hex: '#6366F1' },
    { name: 'Brown', hex: '#A16207' },
    { name: 'Slate', hex: '#64748B' },
];

/** Hex of a palette color by name ("Green"); the first palette color for an unknown name. */
export const scorecardPaletteHex = (name: string) => SCORECARD_PALETTE.find((c) => c.name === name)?.hex ?? SCORECARD_PALETTE[0].hex;
const hexOf = scorecardPaletteHex;

/** First-time color for an option: meaning from its name (won → green, lost → red, …), else the palette in order. */
export function suggestColor(label: string, index: number): string {
    const text = label.toLowerCase();
    if (/(won|convert|closed won|complete|resolved|active|approved|accepted|paid|success)/.test(text)) return hexOf('Green');
    if (/(lost|dead|unqualified|reject|cancel|inactive|fail|declin|closed lost|junk)/.test(text)) return hexOf('Red');
    if (/(hot|urgent|critical|high)/.test(text)) return hexOf('Orange');
    if (/(new|open|fresh)/.test(text)) return hexOf('Blue');
    if (/(hold|pending|wait|process|progress|negotiat|proposal|discussion|contacted|demo|follow)/.test(text)) return hexOf('Amber');
    const rotation = ['Violet', 'Teal', 'Pink', 'Sky', 'Indigo', 'Lime', 'Fuchsia', 'Brown', 'Rose', 'Yellow'];
    return hexOf(rotation[index % rotation.length]);
}

/** Readable text in both themes: the color pulled toward the theme's strongest text (dark in light, light in dark). */
export const scorecardTextColor = (color: string) => `color-mix(in srgb, ${color} 72%, var(--crm-slate-900))`;

/** Tinted pill for a scorecard value (list cells, drawer badges). */
export function scorecardChipSx(color: string): SxProps<Theme> {
    return {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.6,
        maxWidth: '100%',
        height: 22,
        px: 1,
        borderRadius: '999px',
        fontSize: '0.72rem',
        fontWeight: 600,
        lineHeight: 1,
        whiteSpace: 'nowrap',
        color: scorecardTextColor(color),
        backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 38%, transparent)`,
    };
}

/** Single-choice dropdown fields a scorecard can count by (active, on the form). */
export function scorecardDropdownFields(configs: FormConfigsPayload | null, module: CrmModuleKey): FormFieldDefinitionDto[] {
    return moduleFields(configs, module).filter((f) => f.isActive && f.fieldType === 'select' && Boolean(f.dropdownCategoryKey));
}

/** Amount / number fields a scorecard can total. */
export function scorecardCurrencyFields(configs: FormConfigsPayload | null, module: CrmModuleKey): FormFieldDefinitionDto[] {
    return moduleFields(configs, module).filter((f) => f.isActive && (f.fieldType === 'amount' || f.fieldType === 'number'));
}

export interface ResolvedScorecard {
    config: ScorecardConfig;
    field: FormFieldDefinitionDto;
    category: DropdownCategoryDto | undefined;
    currencyField: FormFieldDefinitionDto | undefined;
    /** Display label of an option value (falls back to the value). */
    labelOf: (value: string) => string;
    /** Configured color of an option value, if any. */
    colorOf: (value: string) => string | undefined;
    /** The record's value of the scorecard field ('' when empty). */
    valueOf: (row: unknown) => string;
    /** The record's value of the currency field (0 when empty / not a number). */
    amountOf: (row: unknown) => number;
}

/** The saved scorecard joined with its form fields; null when unconfigured or its field no longer exists. */
export function resolveScorecard(
    config: ScorecardConfig | null,
    configs: FormConfigsPayload | null,
    module: CrmModuleKey | undefined
): ResolvedScorecard | null {
    if (!config || !configs || !module) return null;
    const fields = moduleFields(configs, module);
    const field = fields.find((f) => f.fieldKey === config.fieldKey && f.isActive);
    if (!field) return null;
    const category = findCategory(configs, field.dropdownCategoryKey);
    const currencyField = config.currencyFieldKey ? fields.find((f) => f.fieldKey === config.currencyFieldKey && f.isActive) : undefined;
    const labels = new Map((category?.options ?? []).map((o) => [o.value, o.label || o.value]));
    const colors = new Map(config.options.map((o) => [o.value, o.color]));
    return {
        config,
        field,
        category,
        currencyField,
        labelOf: (value) => labels.get(value) ?? value,
        colorOf: (value) => colors.get(value),
        valueOf: (row) => {
            const raw = readFieldValue(row, field);
            return raw === undefined || raw === null ? '' : String(raw);
        },
        amountOf: (row) => {
            if (!currencyField) return 0;
            const raw = readFieldValue(row, currencyField);
            const n = typeof raw === 'number' ? raw : Number(String(raw ?? '').replace(/[^0-9.-]/g, ''));
            return Number.isFinite(n) ? n : 0;
        },
    };
}

export const formatScorecardAmount = (amount: number) =>
    amount.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
