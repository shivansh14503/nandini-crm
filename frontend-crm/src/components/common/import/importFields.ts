import { isGstRegistrationType, isPartnerCustomerType, NATURE_OF_PARTNER_REQUIRED_MESSAGE } from '@/config/constants';
import type { CrmModuleKey, FormConfigsPayload, FormFieldDefinitionDto } from '@/types/formConfig.types';
import { activeOptionValues, CUSTOM_FIELDS_KEY, distinctFieldLabels, findCategory, moduleFields, optionsForModule } from '@/utils/formConfig';
import { leadSourceDetailIssues } from '@/utils/leadSource';
import { normalizeToE164, isValidE164 } from '@/utils/phone';
import { IMPORT_CONFIGS } from './importConfigs';
import type { ImportEntityConfig, ImportEntityType, ImportFieldDef } from './types';

/**
 * The import wizard's fields come from the module's Form Builder configuration, the same definitions the creation
 * form renders: every active field shown on the form (custom fields included) can be mapped, with the form's label,
 * key, required flag and dropdown options. Only file uploads are left out. Mirrors importValues.ts in the backend,
 * which reads the cells again with the same rules before writing.
 */

/** Custom field cells are sent under this prefix (`customFields.region`), as the backend reads them. */
export const CUSTOM_FIELD_PREFIX = `${CUSTOM_FIELDS_KEY}.`;

/** Field types a spreadsheet can't carry. */
const NOT_IMPORTABLE_TYPES = new Set(['file']);

/** The form module each import writes. */
const ENTITY_MODULE: Record<ImportEntityType, CrmModuleKey> = {
    organizations: 'organizations',
    contacts: 'contacts',
    products: 'products',
    leads: 'leads',
    opportunities: 'opportunities',
    tickets: 'tickets',
    'partner-companies': 'partner-companies',
};

const YOU = 'you (the importer)';

/**
 * What a blank cell becomes. These fields aren't required of the spreadsheet even when the form requires them.
 * Mirrors the *_IMPORT_DEFAULTS of backend-crm/src/modules/imports/import.processor.ts.
 */
export const IMPORT_DEFAULTS: Record<ImportEntityType, Record<string, string>> = {
    organizations: {
        accountStatus: 'Active',
        registrationType: 'Registered when a GST Number is given, else Unregistered',
        assignedTo: YOU,
    },
    contacts: { assignedTo: YOU },
    products: {},
    leads: {
        leadSource: 'Other',
        status: 'New',
        followupType: 'Call',
        nextFollowupDate: 'today',
        remarks: 'Imported via bulk import',
        assignedTo: YOU,
    },
    opportunities: {
        productCategory: 'TallyPrime',
        type: 'New Business',
        salesStage: 'Qualification',
        leadSource: 'Other',
        followupType: 'Call',
        nextFollowupDate: 'today',
        remarks: 'Imported via bulk import',
        commission: 'No',
        leadGivenBy: YOU,
        assignedTo: YOU,
    },
    tickets: {
        ticketPriority: 'Normal',
        ticketStatus: 'New',
        source: 'Call',
        supportType: 'Free',
        supportMode: 'Phone Consultation',
        natureOfCall: 'the first active Nature Of Call',
        dueDate: '24 hours from the import',
        assignedTo: YOU,
    },
    'partner-companies': { natureOfPartner: 'Other', assignedTo: YOU },
};

/** Lookup fields that take a person's username. */
const USERNAME_KEYS = new Set(['assignedTo']);

const pad2 = (n: number) => String(n).padStart(2, '0');
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const monthOf = (name: string): number | null => {
    const index = MONTHS.indexOf(name.slice(0, 3).toLowerCase());
    return index === -1 ? null : index + 1;
};

function toDay(year: number, month: number, day: number): string | null {
    const fullYear = year < 100 ? 2000 + year : year;
    const date = new Date(Date.UTC(fullYear, month - 1, day));
    if (date.getUTCFullYear() !== fullYear || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return `${fullYear}-${pad2(month)}-${pad2(day)}`;
}

/** `10:30`, `10:30:00`, `4 PM`, `4:15 pm` → `HH:mm` (24 h), or null. */
function parseTime(text: string): string | null {
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
 * A date cell, day first: `2026-08-15`, `15/08/2026`, `15-08-26`, `15 Aug 2026`, `15-Aug-2026`, `Aug 15, 2026`, each
 * optionally followed by a time. Same reading as `parseImportDate` in the backend.
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
        const time = parseTime(rest);
        return time ? { date, time } : null;
    }
    return null;
}

const splitList = (value: string) => value.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
const TRUE_WORDS = new Set(['yes', 'y', 'true', '1', 'checked', 'on']);
const FALSE_WORDS = new Set(['no', 'n', 'false', '0', 'unchecked', 'off']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NUMBER_RE = /^-?\d+(\.\d+)?$/;
const AMOUNT_RE = /^\d+(\.\d{1,2})?$/;
const PINCODE_RE = /^[A-Za-z0-9\s-]{2,12}$/;

/**
 * Reads one filled cell by its field's type: the value to send (dropdowns as their stored value, dates as
 * `YYYY-MM-DD`, date-times as `YYYY-MM-DDTHH:mm`, checkboxes as Yes / No) and, when it can't be read, the error.
 */
export function normalizeImportCell(field: ImportFieldDef, cell: string): { value: string; error?: string } {
    const { label } = field;
    switch (field.fieldType) {
        case 'select':
        case 'multiselect': {
            if (!field.options) return { value: cell };
            const lookup = new Map<string, string>();
            field.options.forEach((o) => lookup.set(o.label.trim().toLowerCase(), o.value));
            field.options.forEach((o) => lookup.set(o.value.trim().toLowerCase(), o.value));
            const entries = field.fieldType === 'multiselect' ? splitList(cell) : [cell];
            const matched: string[] = [];
            for (const entry of entries) {
                const option = lookup.get(entry.toLowerCase());
                if (option === undefined) return { value: cell, error: `"${entry}" is not an option of ${label}` };
                if (!matched.includes(option)) matched.push(option);
            }
            return { value: matched.join(', ') };
        }
        case 'checkbox': {
            const word = cell.toLowerCase();
            if (TRUE_WORDS.has(word)) return { value: 'Yes' };
            if (FALSE_WORDS.has(word)) return { value: 'No' };
            return { value: cell, error: `${label} must be Yes or No` };
        }
        case 'date': {
            const parsed = parseImportDate(cell);
            return parsed ? { value: parsed.date } : { value: cell, error: `${label} must be a date (DD-MM-YYYY or YYYY-MM-DD)` };
        }
        case 'datetime': {
            const parsed = parseImportDate(cell);
            if (!parsed) return { value: cell, error: `${label} must be a date, optionally with a time (DD-MM-YYYY HH:mm)` };
            return { value: parsed.time ? `${parsed.date}T${parsed.time}` : parsed.date };
        }
        case 'phone': {
            const e164 = normalizeToE164(cell);
            return isValidE164(e164) ? { value: e164 } : { value: cell, error: `${label} must be a valid phone number` };
        }
        case 'email': {
            const emails = splitList(cell);
            const bad = emails.find((email) => !EMAIL_RE.test(email));
            return bad ? { value: cell, error: `${label}: "${bad}" is not a valid email` } : { value: emails.join(', ') };
        }
        case 'number':
        case 'amount':
        case 'percentage': {
            const value = cell.replace(/[,₹\s]/g, '').replace(/%$/, '');
            if (field.fieldType === 'number' && !NUMBER_RE.test(value)) return { value: cell, error: `${label} must be a number` };
            if (field.fieldType === 'amount' && !AMOUNT_RE.test(value)) return { value: cell, error: `${label} must be an amount (up to 2 decimals)` };
            if (field.fieldType === 'percentage' && !(NUMBER_RE.test(value) && Number(value) >= 0 && Number(value) <= 100)) {
                return { value: cell, error: `${label} must be between 0 and 100` };
            }
            return { value };
        }
        case 'pincode':
            return PINCODE_RE.test(cell) ? { value: cell } : { value: cell, error: `${label} must be a valid PIN / postal code` };
        case 'uppercase':
            return { value: cell.toUpperCase() };
        default:
            return { value: cell };
    }
}

/** The line under a field on the mapping step: what to type, and what a blank cell becomes. */
function hintFor(field: FormFieldDefinitionDto, options: { value: string; label: string }[] | undefined, fallback: string | undefined): string | undefined {
    const parts: string[] = [];
    const list = (items: string[]) => (items.length > 4 ? `${items.slice(0, 4).join(', ')} … (${items.length} options)` : items.join(', '));
    switch (field.fieldType) {
        case 'select':
            if (options?.length) parts.push(`One of: ${list(options.map((o) => o.label))}`);
            break;
        case 'multiselect':
            if (options?.length) parts.push(`Comma-separated: ${list(options.map((o) => o.label))}`);
            break;
        case 'checkbox':
            parts.push('Yes / No');
            break;
        case 'date':
            parts.push('DD-MM-YYYY or YYYY-MM-DD');
            break;
        case 'datetime':
            parts.push('DD-MM-YYYY HH:mm (time optional)');
            break;
        case 'phone':
            parts.push('10-digit mobile, or +country code');
            break;
        case 'email':
            if (field.isSystem && field.fieldKey === 'emailAddress') parts.push('Several separated by commas; the first is primary');
            break;
        default:
            if (field.isSystem && USERNAME_KEYS.has(field.fieldKey)) parts.push('Username of an active user');
    }
    if (fallback) parts.push(`Blank → ${fallback}`);
    return parts.length ? parts.join(' · ') : undefined;
}

const GENERIC_SAMPLES: Record<string, [string, string]> = {
    phone: ['9876543210', '9123456780'],
    email: ['name@example.com', 'other@example.com'],
    date: ['15-01-2026', '2026-02-20'],
    datetime: ['15-01-2026 10:30', '2026-02-20'],
    checkbox: ['Yes', 'No'],
    number: ['10', '25'],
    amount: ['1000', '2500.50'],
    percentage: ['10', '18'],
    pincode: ['400001', '560001'],
};

/** Two sample cells: the familiar ones of the old template, live dropdown options, or a value of the field's type. */
function samplesFor(
    field: FormFieldDefinitionDto,
    options: { value: string; label: string }[] | undefined,
    known: [string, string] | undefined,
): [string, string] {
    if (options?.length) {
        const offered = (cell: string) => {
            if (!cell) return true;
            const entries = field.fieldType === 'multiselect' ? splitList(cell) : [cell];
            return entries.every((e) => options.some((o) => o.value.toLowerCase() === e.toLowerCase() || o.label.toLowerCase() === e.toLowerCase()));
        };
        // A sample naming an option an admin removed would fail its own import.
        if (known && offered(known[0]) && offered(known[1])) return known;
        return [options[0].label, options[1]?.label ?? options[0].label];
    }
    if (known) return known;
    if (/Country$/.test(field.fieldKey)) return ['India', 'India'];
    if (/PostalCode$/.test(field.fieldKey)) return GENERIC_SAMPLES.pincode;
    return GENERIC_SAMPLES[field.fieldType] ?? ['', ''];
}

const sameText = (a: string | undefined, b: string) => (a ?? '').trim().toLowerCase() === b.toLowerCase();

/** The row's conditional rules, as the creation form applies them (only for fields the form has). */
function rowRulesFor(entity: ImportEntityType, keys: ReadonlySet<string>): ImportEntityConfig['rowRules'] {
    return (values) => {
        const errors: string[] = [];
        if ((entity === 'leads' || entity === 'opportunities') && keys.has('leadSource')) {
            errors.push(...leadSourceDetailIssues(values).map((issue) => issue.message.replace(/\.$/, '')));
        }
        if ((entity === 'leads' || entity === 'organizations') && keys.has('registrationType') && isGstRegistrationType(values.registrationType) && !values.gstNumber) {
            errors.push(`GST Number is required when Registration Type is ${values.registrationType}`);
        }
        if (entity === 'organizations' && keys.has('customerType') && isPartnerCustomerType(values.customerType) && !values.natureOfPartner) {
            errors.push(NATURE_OF_PARTNER_REQUIRED_MESSAGE.replace(/\.$/, ''));
        }
        if (entity === 'opportunities') {
            if (sameText(values.commission, 'Yes') && !values.commissionAmount) errors.push('Commission Amount is required when Commission is Yes');
            if (sameText(values.addDocument, 'Yes')) errors.push('Add Document Yes needs an uploaded document: import it as No and attach the document on the record');
        }
        return errors;
    };
}

/**
 * The wizard's field list for an import: the module's creation form fields from the Form Builder configuration, in
 * form order, with familiar aliases and samples from IMPORT_CONFIGS. Falls back to IMPORT_CONFIGS until it loads.
 */
export function buildImportConfig(entity: ImportEntityType, configs: FormConfigsPayload | null | undefined): ImportEntityConfig {
    const base = IMPORT_CONFIGS[entity];
    const formModule = ENTITY_MODULE[entity];
    const formFields = moduleFields(configs, formModule).filter((f) => f.isActive && f.isVisibleInForm && !NOT_IMPORTABLE_TYPES.has(f.fieldType));
    if (!configs || formFields.length === 0) return base;

    const defaults = IMPORT_DEFAULTS[entity];
    const known = new Map(base.fields.map((f) => [f.key, f]));
    const tabOrder = new Map((configs.moduleTabs[formModule] ?? []).map((tab, index) => [tab.key, index]));
    const ordered = [...formFields].sort((a, b) => (tabOrder.get(a.tabKey) ?? 99) - (tabOrder.get(b.tabKey) ?? 99) || a.sortOrder - b.sortOrder);
    // Column headers must be unique: a repeated label takes its section (City → Billing City / Shipping City), as in list columns.
    const labels = distinctFieldLabels(ordered);

    const fields: ImportFieldDef[] = ordered.map((f) => {
        const key = f.isSystem ? f.fieldKey : `${CUSTOM_FIELD_PREFIX}${f.fieldKey}`;
        const hint = f.isSystem ? known.get(f.fieldKey) : undefined;
        const category = findCategory(configs, f.dropdownCategoryKey);
        const options = category
            ? optionsForModule(category.key, activeOptionValues(category), formModule).map((value) => ({
                  value,
                  label: category.options.find((o) => o.value === value)?.label ?? value,
              }))
            : undefined;
        const fallback = f.isSystem ? defaults[f.fieldKey] : undefined;
        const label = labels.get(f.fieldKey) ?? f.label;
        const aliases = [
            ...(hint?.aliases ?? []),
            ...(hint && !sameText(hint.label, label) ? [hint.label.toLowerCase()] : []),
            ...(f.isSystem ? [] : [f.fieldKey.replace(/_/g, ' ')]),
        ];
        return {
            key,
            label,
            required: f.isRequired && !fallback,
            aliases,
            sample: samplesFor(f, options, hint?.sample),
            fieldType: f.fieldType,
            options,
            hint: hintFor(f, options, fallback),
            section: f.sectionLabel,
        };
    });
    return { ...base, fields, rowRules: rowRulesFor(entity, new Set(ordered.filter((f) => f.isSystem).map((f) => f.fieldKey))) };
}
