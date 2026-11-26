import { getCountryNameByCode } from '@/data/addressMaster';
import { ADDRESS_PREFIXES, SYSTEM_FIELDS, type DrawerLayoutModule } from '@/lib/drawer-layout';
import type { FieldType, FormConfigsPayload, FormFieldDefinitionDto } from '@/types/formConfig.types';
import { distinctFieldLabels, findCategory, formatCustomValue, isBuiltInCountryField, isEmptyValue, moduleFields, optionLabelMap } from '@/utils/formConfig';
import { formatPhoneDisplay } from '@/utils/phone';
import { findCrmUser } from '@/services/masterData.store';
import { isPrimaryEntry, primaryFirst } from '@/utils/primaryFirst';
import { fmtDay, fmtMoney, fmtTime, getDisplayFormats } from '@/utils/formats';

/**
 * The values a drawer layout can show for a module: the form's active fields (built-in and custom, labelled so no
 * two read the same, e.g. Billing City / Shipping City) plus the module's system values (Lead Code, Rating). Also
 * reads and formats a record's value of each.
 */

export interface DrawerFieldDef {
    key: string;
    label: string;
    type: FieldType;
    /** Palette group: the form section, "Custom fields" or "Set by the system". */
    group: string;
    custom: boolean;
    /** Not a form field (Lead Code, Rating). */
    system: boolean;
    /** Admin "Visible in Drawer" switch (custom fields): shown by the "Other custom fields" block. */
    visibleInDrawer: boolean;
    categoryKey: string | null;
    form?: FormFieldDefinitionDto;
}

const SYSTEM_FIELD_DEFS: Record<string, { label: string; type: FieldType }> = {
    leadCode: { label: 'Lead Code', type: 'text' },
    rating: { label: 'Rating', type: 'select' },
    contactCode: { label: 'Contact Code', type: 'text' },
    accountCode: { label: 'Account Code', type: 'text' },
    accountVerified: { label: 'Account Verified', type: 'checkbox' },
    activeAmc: { label: 'Active AMC', type: 'checkbox' },
    activeCloud: { label: 'Active Cloud', type: 'checkbox' },
    opportunityCode: { label: 'Opportunity Code', type: 'text' },
    quotationCode: { label: 'Quotation Code', type: 'text' },
    grandTotal: { label: 'Grand Total', type: 'amount' },
    productCode: { label: 'Product Code', type: 'text' },
    ticketNumber: { label: 'Ticket Number', type: 'text' },
    contractNumber: { label: 'Contract Number', type: 'text' },
    amcFlag: { label: 'AMC', type: 'checkbox' },
    cloudFlag: { label: 'Cloud', type: 'checkbox' },
    description: { label: 'Detailed Scope / Notes', type: 'textarea' },
};

export const CUSTOM_GROUP = 'Custom fields';
export const SYSTEM_GROUP = 'Set by the system';

/** 'CONTACT PERSON' → 'Contact Person'. */
const titleCase = (text: string) => (text === text.toUpperCase() ? text.toLowerCase().replace(/(^|[\s\-/(&])([a-z])/g, (_, s: string, c: string) => s + c.toUpperCase()) : text);

export function drawerFieldsFor(configs: FormConfigsPayload | null | undefined, module: DrawerLayoutModule): DrawerFieldDef[] {
    const fields = moduleFields(configs, module).filter((f) => f.isActive);
    const labels = distinctFieldLabels(fields);
    const defs: DrawerFieldDef[] = fields.map((f) => ({
        key: f.fieldKey,
        label: labels.get(f.fieldKey) ?? f.label,
        type: f.fieldType,
        group: f.isSystem ? titleCase(f.sectionLabel || 'Details') : CUSTOM_GROUP,
        custom: !f.isSystem,
        system: false,
        visibleInDrawer: f.isVisibleInDrawer,
        categoryKey: f.dropdownCategoryKey,
        form: f,
    }));
    // Built-in sections first (in form order), custom fields after them.
    defs.sort((a, b) => Number(a.custom) - Number(b.custom));
    for (const key of SYSTEM_FIELDS[module]) {
        const meta = SYSTEM_FIELD_DEFS[key] ?? { label: key, type: 'text' as FieldType };
        defs.push({ key, label: meta.label, type: meta.type, group: SYSTEM_GROUP, custom: false, system: true, visibleInDrawer: true, categoryKey: null });
    }
    return defs;
}

export interface AddressDef {
    prefix: string;
    label: string;
}

/** The module's addresses, named after their form section (Billing Address / Shipping Address). */
export function drawerAddressesFor(configs: FormConfigsPayload | null | undefined, module: DrawerLayoutModule): AddressDef[] {
    const fields = moduleFields(configs, module);
    return ADDRESS_PREFIXES[module].map((prefix) => {
        const section = fields.find((f) => f.fieldKey === `${prefix}City` || f.fieldKey === `${prefix}Address`)?.sectionLabel;
        return { prefix, label: section ? titleCase(section) : `${prefix} address` };
    });
}

type AnyRecord = Record<string, unknown>;

export function rawFieldValue(record: AnyRecord | null | undefined, def: DrawerFieldDef): unknown {
    if (!record) return undefined;
    if (def.custom) return (record.customFields as AnyRecord | null | undefined)?.[def.key];
    return record[def.key];
}

/** Fields that store a CRM username (Assigned to, an opportunity's Lead Given By). */
const USER_FIELD_KEYS = new Set(['assignedTo', 'leadGivenBy']);

/** 125000 → '₹1,25,000' (up to 2 decimals, company number grouping). */
export const formatRupees = (value: number): string => fmtMoney(value, { minDecimals: 0, maxDecimals: 2 });

/** Whether a yes / no value (a checkbox or a system flag) is on. */
export const isOn = (value: unknown): boolean => value === true || value === 'true' || value === 'Yes';

/** '2026-11-28' → '28-Nov-2026' (the company date format once saved); anything else unchanged. */
export function formatDay(value: string): string {
    return fmtDay(value);
}

/**
 * '14:30' → '02:30 PM'. Once the company formats are saved every readable time (also a stored 12-hour text such as
 * '04:15 PM') follows the company time format; anything else is unchanged.
 */
export function formatClock(value: string): string {
    const text = value.trim();
    if (/^\d{1,2}:\d{2}$/.test(text)) return fmtTime(text, { legacy: 'hh:mm A' });
    return getDisplayFormats().customized ? fmtTime(text) : value;
}

/**
 * A record's value of the field as display strings: one per entry for lists (emails, multi-selects), dropdown
 * labels instead of stored values, phones formatted, countries named, dates in the company format (with the paired time
 * for date + time fields, e.g. nextFollowupDate + nextFollowupTime). The primary email comes first. Empty → [].
 */
export function fieldDisplayValues(record: AnyRecord | null | undefined, def: DrawerFieldDef, configs: FormConfigsPayload | null | undefined): string[] {
    return fieldDisplayEntries(record, def, configs).map((entry) => entry.text);
}

export interface FieldDisplayEntry {
    text: string;
    /** The list's primary entry (the primary email address). */
    primary: boolean;
}

/** `fieldDisplayValues` with each entry's primary flag, primary entry first (e.g. to tag the primary email). */
export function fieldDisplayEntries(record: AnyRecord | null | undefined, def: DrawerFieldDef, configs: FormConfigsPayload | null | undefined): FieldDisplayEntry[] {
    const raw = rawFieldValue(record, def);
    if (isEmptyValue(raw)) return [];
    // A yes / no value counts as empty while it is off, so "hide when empty" hides it.
    if (def.type === 'checkbox' && !isOn(raw)) return [];
    const labels = optionLabelMap(findCategory(configs, def.categoryKey));
    const one = (value: unknown): string => {
        if (value && typeof value === 'object' && 'email' in value) return String((value as { email?: unknown }).email ?? '').trim();
        // An uploaded file (Upload Doc) shows its name.
        if (value && typeof value === 'object' && 'fileName' in value) return String((value as { fileName?: unknown }).fileName ?? '').trim();
        const text = typeof value === 'string' ? value : String(value);
        if (def.type === 'phone') return formatPhoneDisplay(text) || text;
        if (def.form && isBuiltInCountryField(def.form)) return getCountryNameByCode(text) || text;
        if (def.type === 'date') return formatDay(text);
        if (def.type === 'datetime') {
            // The time is either a paired field (nextFollowupTime) or part of the value itself (dueDate, renewalReminderDate: 'YYYY-MM-DDTHH:mm').
            const paired = record?.[def.key.replace(/Date$/, 'Time')];
            const time = typeof paired === 'string' && paired.trim() ? paired : (/^\d{4}-\d{2}-\d{2}T(\d{2}:\d{2})/.exec(text)?.[1] ?? '');
            return [formatDay(text), time ? formatClock(time) : ''].filter(Boolean).join(', ');
        }
        // Users are stored by username: show their name (a typed outside referrer stays as typed).
        if (USER_FIELD_KEYS.has(def.key)) return findCrmUser(text)?.name || text;
        if (def.form) return formatCustomValue(def.form, value, labels);
        if (def.type === 'checkbox') return value === true || value === 'true' ? 'Yes' : 'No';
        if (def.type === 'amount' && !Number.isNaN(Number(value))) return formatRupees(Number(value));
        return labels?.[text] ?? text;
    };
    return primaryFirst(Array.isArray(raw) ? raw : [raw])
        .map((value) => ({ text: one(value), primary: isPrimaryEntry(value) }))
        .filter((entry) => entry.text !== '');
}
