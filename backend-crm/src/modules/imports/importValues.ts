import type { FormFieldDefinitionDto } from '../form-configs/formConfig.service.js';
import type { ModuleFieldConfig } from '../form-configs/customFieldValidator.js';
import { isActivityOnlyFollowupType } from '../shared/followupTypes.js';
import type { ApiFieldError } from '../../utils/httpError.js';
import { HttpError } from '../../utils/httpError.js';
import { normalizePhone } from '../../validators/common.js';

/**
 * Turns a spreadsheet row (cells keyed by form field key) into the record's form-shaped payload, using the module's
 * Form Builder configuration: every field of the creation form can be imported, custom fields included.
 * Mirrors frontend-crm/src/components/common/import/importFields.ts, which checks the same rules in the preview.
 *
 * Cells are converted by field type: dropdowns match an active option by value or label (any case) and store its
 * value, multi-selects split on commas / semicolons, checkboxes read Yes / No, dates are read day first
 * (`15/08/2026`, `15-Aug-2026`, `2026-08-15`), date-times take an optional time (`15/08/2026 10:30`, `… 4 PM`).
 */

/** Custom field cells arrive under this prefix (`customFields.region`), so they can't clash with a built-in key. */
export const CUSTOM_FIELD_PREFIX = 'customFields.';

/** Field types a spreadsheet can't carry. */
const NOT_IMPORTABLE_TYPES = new Set(['file']);
/**
 * Built-in fields a spreadsheet can't set, per module: a product's Status (Admin only, Inactive needs a reason given
 * in its dialog), so imported products start Active. Mirrored in frontend-crm/src/components/common/import/importFields.ts.
 */
export const NOT_IMPORTABLE_FIELDS: Readonly<Record<string, ReadonlySet<string>>> = { products: new Set(['status']) };

/** Built-in fields the form keeps as a list of email rows. */
const EMAIL_LIST_KEYS = new Set(['emailAddress']);

/**
 * Built-in dropdowns the form lets you type a new value into (pick or type): a cell naming no option is kept as
 * written, and saving the record adds it to the dropdown (the product's Manufacturer, product.manufacturer.ts).
 */
export const OPEN_DROPDOWN_FIELDS: Readonly<Record<string, ReadonlySet<string>>> = { products: new Set(['manufacturer']) };

/** Older import templates named a few fields differently; their cells are read as the form's key. */
const LEGACY_KEYS: Record<string, string> = {
    email: 'emailAddress',
    billingStreet: 'billingAddress',
};

const pad2 = (n: number) => String(n).padStart(2, '0');
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function monthOf(name: string): number | null {
    const index = MONTHS.indexOf(name.slice(0, 3).toLowerCase());
    return index === -1 ? null : index + 1;
}

function toDay(year: number, month: number, day: number): string | null {
    const fullYear = year < 100 ? 2000 + year : year;
    const date = new Date(Date.UTC(fullYear, month - 1, day));
    if (date.getUTCFullYear() !== fullYear || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return `${fullYear}-${pad2(month)}-${pad2(day)}`;
}

/** `10:30`, `10:30:00`, `4 PM`, `4:15 pm` → `HH:mm` (24 h), or null. */
export function parseImportTime(text: string): string | null {
    const match = /^(\d{1,2})(?::(\d{2}))?(?::\d{2}(?:\.\d+)?)?\s*([AaPp][Mm])?\s*(Z|[+-]\d{2}:?\d{2})?$/.exec(text.trim());
    if (!match) return null;
    let hours = Number(match[1]);
    const minutes = match[2] ? Number(match[2]) : 0;
    const meridiem = match[3]?.toUpperCase();
    if (minutes > 59) return null;
    if (meridiem) {
        if (hours < 1 || hours > 12) return null;
        hours = (hours % 12) + (meridiem === 'PM' ? 12 : 0);
    } else if (hours > 23 || match[2] === undefined) {
        return null;
    }
    return `${pad2(hours)}:${pad2(minutes)}`;
}

/**
 * A date cell, day first: `2026-08-15`, `15/08/2026`, `15-08-26`, `15.08.2026`, `15 Aug 2026`, `15-Aug-2026`,
 * `Aug 15, 2026`, each optionally followed by a time (`T10:30`, ` 10:30`, ` 4 PM`). Null when unreadable.
 */
export function parseImportDate(text: string): { date: string; time: string | null } | null {
    const value = text.trim();
    const patterns: [RegExp, (m: RegExpExecArray) => string | null][] = [
        [/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/, (m) => toDay(Number(m[1]), Number(m[2]), Number(m[3]))],
        [/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})(?!\d)/, (m) => toDay(Number(m[3]), Number(m[2]), Number(m[1]))],
        [/^(\d{1,2})[\s-]+([A-Za-z]{3,9})[\s,-]+(\d{4}|\d{2})(?!\d)/, (m) => {
            const month = monthOf(m[2]);
            return month ? toDay(Number(m[3]), month, Number(m[1])) : null;
        }],
        [/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})/, (m) => {
            const month = monthOf(m[1]);
            return month ? toDay(Number(m[3]), month, Number(m[2])) : null;
        }],
    ];
    for (const [pattern, read] of patterns) {
        const match = pattern.exec(value);
        if (!match) continue;
        const date = read(match);
        if (!date) return null;
        const rest = value.slice(match[0].length).replace(/^[T\s,]+/, '');
        if (!rest) return { date, time: null };
        const time = parseImportTime(rest);
        return time ? { date, time } : null;
    }
    return null;
}

const TRUE_WORDS = new Set(['yes', 'y', 'true', '1', 'checked', 'on']);
const FALSE_WORDS = new Set(['no', 'n', 'false', '0', 'unchecked', 'off']);

/** 'A, B; C' → ['A', 'B', 'C'] (multi-value spreadsheet cells). */
export const splitList = (value: string | undefined) => (value ?? '').split(/[,;]/).map((s) => s.trim()).filter(Boolean);

/** An option's text for matching a cell: any case, runs of spaces (non-breaking ones included) as one. */
export const optionKey = (text: string) => text.replace(/[\s\u00a0]+/g, ' ').trim().toLowerCase();

/**
 * Other spellings of a numeric cell, for percentage options (`18%`): `18` and Excel's fraction of a percent-formatted
 * cell (`0.18`) both read as `18%`.
 */
function numericSpellings(entry: string): string[] {
    const text = entry.replace(/\s+/g, '');
    if (!/^\d+(\.\d+)?$/.test(text)) return [];
    const n = Number(text);
    const spellings = [`${n}%`];
    if (n > 0 && n < 1) spellings.push(`${Number((n * 100).toFixed(4))}%`);
    return spellings;
}

/**
 * The stored value of the dropdown option a cell names, by value or label: any case, extra spaces ignored, and a
 * bare or fractional number matching a percentage option. Undefined when no option matches.
 * Mirrors `matchImportOption` in frontend-crm/src/components/common/import/importFields.ts.
 */
export function matchImportOption(lookup: ReadonlyMap<string, string>, entry: string): string | undefined {
    const byKey = new Map<string, string>();
    for (const [text, value] of lookup) if (!byKey.has(optionKey(text))) byKey.set(optionKey(text), value);
    for (const candidate of [entry, ...numericSpellings(entry)]) {
        const value = byKey.get(optionKey(candidate));
        if (value !== undefined) return value;
    }
    return undefined;
}

/** `Allowed: A, B, C … (12 options)`: the options a dropdown cell may name, for its error message. */
export function allowedOptionsText(values: Iterable<string>): string {
    const list = [...new Set(values)];
    if (list.length === 0) return 'The dropdown has no active options';
    const shown = list.slice(0, 8).join(', ');
    return list.length > 8 ? `Allowed: ${shown} … (${list.length} options)` : `Allowed: ${shown}`;
}

/** Fields of the module's creation form a spreadsheet can fill: active, shown on the form, not a file upload. */
export function importableFields(config: ModuleFieldConfig): FormFieldDefinitionDto[] {
    const skipped = NOT_IMPORTABLE_FIELDS[config.module];
    return config.fields.filter(
        (f) => f.isActive && f.isVisibleInForm && !f.isDeleted && !NOT_IMPORTABLE_TYPES.has(f.fieldType) && !(f.isSystem && skipped?.has(f.fieldKey)),
    );
}

/** A row's cell for a field: its form key (custom fields under `customFields.`), else an older template's key. */
function cellOf(values: Record<string, string>, field: FormFieldDefinitionDto): string {
    if (!field.isSystem) return (values[`${CUSTOM_FIELD_PREFIX}${field.fieldKey}`] ?? '').trim();
    const own = values[field.fieldKey];
    if (own !== undefined && own.trim() !== '') return own.trim();
    const legacy = Object.entries(LEGACY_KEYS).find(([, key]) => key === field.fieldKey)?.[0];
    return legacy ? (values[legacy] ?? '').trim() : '';
}

export interface ImportPayload {
    /** Built-in fields in form shape (only the filled ones). */
    payload: Record<string, unknown>;
    /** Custom field values by key (only the filled ones). */
    customFields: Record<string, unknown>;
}

/**
 * Converts the filled cells of a row by their field's type. Throws 400 listing every cell that can't be read
 * (an unknown dropdown option, a date that isn't one, a checkbox that isn't Yes / No).
 */
export function buildImportPayload(config: ModuleFieldConfig, values: Record<string, string>): ImportPayload {
    const payload: Record<string, unknown> = {};
    const customFields: Record<string, unknown> = {};
    const issues: ApiFieldError[] = [];

    for (const field of importableFields(config)) {
        const cell = cellOf(values, field);
        if (!cell) continue;
        const path = field.isSystem ? [field.fieldKey] : ['customFields', field.fieldKey];
        const fail = (message: string) => issues.push({ path, message });
        let value: unknown = cell;

        switch (field.fieldType) {
            case 'select':
            case 'multiselect': {
                const lookup = field.dropdownCategoryId ? config.optionLookup?.get(field.dropdownCategoryId) : undefined;
                const entries = field.fieldType === 'multiselect' ? splitList(cell) : [cell];
                if (!lookup) {
                    // A list without a dropdown category (Country, State): free text, as the form's own control decides.
                    value = field.fieldType === 'multiselect' ? entries : cell;
                    break;
                }
                const open = field.isSystem && OPEN_DROPDOWN_FIELDS[config.module]?.has(field.fieldKey);
                const matched: string[] = [];
                const hidden = (option: string) => config.module !== 'activities' && field.fieldKey === 'followupType' && isActivityOnlyFollowupType(option);
                for (const entry of entries) {
                    const option = matchImportOption(lookup, entry);
                    if (option !== undefined && !hidden(option)) matched.push(option);
                    else if (open) matched.push(entry);
                    else fail(`"${entry}" is not an option of ${field.label}. ${allowedOptionsText([...lookup.values()].filter((o) => !hidden(o)))}.`);
                }
                value = field.fieldType === 'multiselect' ? [...new Set(matched)] : matched[0];
                break;
            }
            case 'checkbox': {
                const word = cell.toLowerCase();
                if (TRUE_WORDS.has(word)) value = true;
                else if (FALSE_WORDS.has(word)) value = false;
                else fail(`${field.label} must be Yes or No.`);
                break;
            }
            case 'date': {
                const parsed = parseImportDate(cell);
                if (parsed) value = parsed.date;
                else fail(`${field.label} must be a date (DD-MM-YYYY or YYYY-MM-DD).`);
                break;
            }
            case 'datetime': {
                const parsed = parseImportDate(cell);
                if (parsed) value = parsed.time ? `${parsed.date}T${parsed.time}` : parsed.date;
                else fail(`${field.label} must be a date, optionally with a time (DD-MM-YYYY HH:mm).`);
                break;
            }
            case 'phone':
                value = normalizePhone(cell);
                break;
            case 'email':
                if (field.isSystem && EMAIL_LIST_KEYS.has(field.fieldKey)) {
                    value = splitList(cell).map((email, index) => ({ email, isPrimary: index === 0, isOptedOut: false, isInvalidBounce: false }));
                }
                break;
            case 'amount':
            case 'number':
            case 'percentage':
                // Spreadsheets add thousands separators, currency and percent signs.
                value = cell.replace(/[,₹\s]/g, '').replace(/%$/, '');
                break;
            case 'uppercase':
                value = cell.toUpperCase();
                break;
            default:
                break;
        }
        if (value === undefined) continue;
        if (field.isSystem) payload[field.fieldKey] = value;
        else customFields[field.fieldKey] = value;
    }

    if (issues.length > 0) throw HttpError.badRequest(issues[0].message, issues);
    return { payload, customFields };
}

/** A `datetime` cell as read by `buildImportPayload`: the date and, when given, the time (`HH:mm`). */
export function splitDateTime(value: unknown): { date?: string; time?: string } {
    if (typeof value !== 'string' || !value) return {};
    const [date, time] = value.split('T');
    return { date, time: time || undefined };
}
