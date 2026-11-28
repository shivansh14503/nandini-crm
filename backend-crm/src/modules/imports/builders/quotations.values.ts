import { HttpError } from '../../../utils/httpError.js';
import { normalizeTaxRate, type LineItemDiscountType } from '../../shared/lineItems.js';

/**
 * Pure cell readers of the quotations import (builders/quotations.ts): the line item columns a spreadsheet row carries
 * (Product, Quantity, Rate, Discount, Discount Type, GST, Description, Note), the Valid Until a Validation Period
 * gives, and the "one match" rule for records a row names by its human value.
 */

/** Import-only cells of a quotation row: its one line item. Keys don't clash with the quotation form's field keys. */
export const QUOTATION_LINE_KEYS = {
    product: 'lineProduct',
    quantity: 'lineQuantity',
    rate: 'lineRate',
    discount: 'lineDiscount',
    discountType: 'lineDiscountType',
    taxRate: 'lineTaxRate',
    description: 'lineDescription',
    note: 'lineNote',
} as const;

/** A row's line item cells, trimmed ('' when blank). */
export type QuotationLineCells = Record<keyof typeof QUOTATION_LINE_KEYS, string>;

/** Reads the line item cells of a row (blank cells as ''). */
export function quotationLineCells(values: Record<string, string>): QuotationLineCells {
    const cells = {} as QuotationLineCells;
    for (const [name, key] of Object.entries(QUOTATION_LINE_KEYS) as [keyof typeof QUOTATION_LINE_KEYS, string][]) {
        cells[name] = (values[key] ?? '').trim();
    }
    return cells;
}

/** True when the row fills any line item cell. */
export const hasLineCells = (cells: QuotationLineCells): boolean => Object.values(cells).some(Boolean);

/**
 * A number cell as the line item schema reads it: thousands separators, ₹ and spaces dropped; blank → undefined.
 * Kept as text so a cell that isn't a number fails with the field's own message ("Quantity must be a number.").
 */
export function numberCell(value: string | undefined): string | undefined {
    const text = (value ?? '').replace(/[,₹\s]/g, '');
    return text === '' ? undefined : text;
}

/**
 * A GST cell as a Tax Rate (`18%`): `18`, `18%`, `GST 18%` and Excel's fraction of a percent-formatted cell (`0.18`).
 * Blank → undefined.
 */
export function taxRateCell(value: string | undefined): string | undefined {
    const text = (value ?? '').replace(/\s+/g, '');
    if (!text) return undefined;
    if (/^0?\.\d+$/.test(text)) return `${Number((Number(text) * 100).toFixed(4))}%`;
    return normalizeTaxRate(text);
}

const PERCENTAGE_WORDS = new Set(['percentage', 'percent', '%', 'pct']);
const AMOUNT_WORDS = new Set(['amount', 'flat', '₹', 'rs', 'rs.', 'inr', 'value']);

export const DISCOUNT_TYPE_MESSAGE = 'Discount Type must be Percentage or Amount.';

/**
 * The line's Discount and its type. A Discount ending in `%` is a percentage; otherwise Discount Type decides
 * (Percentage / Amount, any case), and a blank type is a percentage, as on the form.
 */
export function discountCells(discount: string, discountType: string): { discount?: string; discountType: LineItemDiscountType } {
    const word = discountType.trim().toLowerCase();
    let type: LineItemDiscountType = 'percentage';
    if (word) {
        if (PERCENTAGE_WORDS.has(word)) type = 'percentage';
        else if (AMOUNT_WORDS.has(word)) type = 'amount';
        else throw HttpError.badRequest(DISCOUNT_TYPE_MESSAGE, [{ path: ['lineItems', '0', 'discountType'], message: DISCOUNT_TYPE_MESSAGE }]);
    }
    const text = discount.trim();
    if (text.endsWith('%')) return { discount: numberCell(text.slice(0, -1)), discountType: 'percentage' };
    return { discount: numberCell(text), discountType: type };
}

/** Days of a Validation Period option written as `<n> Days` (`30 Days` → 30); null for any other wording. */
export function validationPeriodDays(period: string | undefined): number | null {
    const match = /^\s*(\d{1,4})\s*days?\s*$/i.exec(period ?? '');
    return match ? Number(match[1]) : null;
}

/**
 * Valid Until as the form computes it: the Quotation Date plus the Validation Period's days (`30 Days`), or plus
 * `fallbackDays` when the period isn't written as `<n> Days`.
 */
export function validUntilFor(quotationDate: string, validationPeriod: string | undefined, fallbackDays = 30): string {
    const days = validationPeriodDays(validationPeriod) ?? fallbackDays;
    const date = new Date(`${quotationDate}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}

/**
 * The one record a row names: 400 "<Label> 'X' was not found." when there is none, and "Several <plural> are named
 * 'X': <hint>" when the name is ambiguous. `path` points the error at the row's cell.
 */
export function onlyMatch<T>(matches: readonly T[], what: { label: string; plural: string; hint: string; path: string }, cell: string): T {
    if (matches.length === 1) return matches[0];
    const message = matches.length === 0 ? `${what.label} '${cell}' was not found.` : `Several ${what.plural} are named '${cell}': ${what.hint}`;
    throw HttpError.badRequest(message, [{ path: [what.path], message }]);
}

/** The dropdown parts of the form configuration `quotationDropdownDefaults` reads. */
export interface DropdownConfigs {
    categories: readonly {
        id: string;
        options: readonly { value: string; meta: Record<string, unknown> | null; sortOrder: number; isActive: boolean; isDefault: boolean }[];
    }[];
    fieldsByModule: Partial<Record<string, readonly { fieldKey: string; isSystem: boolean; dropdownCategoryId: string | null }[]>>;
}

/** What blank dropdown cells of a quotation row become, and the descriptions the terms options pre-fill. */
export interface QuotationDropdownDefaults {
    company: string;
    quoteStage: string;
    validationPeriod: string;
    termsAndCondition: string;
    paymentTerms: string;
    /** Terms & Condition option → its description (Terms & Condition Description). */
    termsDescriptions: ReadonlyMap<string, string>;
    /** Payment Terms option → its description (Payment Terms Description). */
    paymentDescriptions: ReadonlyMap<string, string>;
}

/** Built-in dropdowns that fall back to their first active option when the admin set no default (the API requires them). */
const REQUIRED_DROPDOWNS = new Set(['company', 'quoteStage']);

/**
 * The quotation form's dropdown defaults, as a new quotation pre-selects them: the admin's default option (Dropdown
 * Manager ☆) of each built-in dropdown, else empty; Company and Quote Stage, which every quotation needs, else take
 * their first active option. The terms options' descriptions come from their `meta.description`.
 */
export function quotationDropdownDefaults(configs: DropdownConfigs): QuotationDropdownDefaults {
    const fields = configs.fieldsByModule.quotations ?? [];
    const activeOptions = (fieldKey: string) => {
        const field = fields.find((f) => f.isSystem && f.fieldKey === fieldKey);
        const category = field?.dropdownCategoryId ? configs.categories.find((c) => c.id === field.dropdownCategoryId) : undefined;
        return [...(category?.options ?? [])].filter((o) => o.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
    };
    const pick = (fieldKey: string) => {
        const options = activeOptions(fieldKey);
        const chosen = options.find((o) => o.isDefault) ?? (REQUIRED_DROPDOWNS.has(fieldKey) ? options[0] : undefined);
        return chosen?.value ?? '';
    };
    const descriptions = (fieldKey: string) =>
        new Map(
            activeOptions(fieldKey).flatMap((o) => {
                const description = o.meta?.description;
                return typeof description === 'string' && description.trim() ? [[o.value, description] as [string, string]] : [];
            }),
        );
    return {
        company: pick('company'),
        quoteStage: pick('quoteStage'),
        validationPeriod: pick('validationPeriod'),
        termsAndCondition: pick('termsAndCondition'),
        paymentTerms: pick('paymentTerms'),
        termsDescriptions: descriptions('termsAndCondition'),
        paymentDescriptions: descriptions('paymentTerms'),
    };
}
