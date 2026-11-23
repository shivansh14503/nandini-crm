import { getCountryNameByCode } from '@/data/addressMaster';
import { ADDRESS_PREFIXES, SYSTEM_FIELDS, type DrawerLayoutModule } from '@/lib/drawer-layout';
import type { FieldType, FormConfigsPayload, FormFieldDefinitionDto } from '@/types/formConfig.types';
import { distinctFieldLabels, findCategory, formatCustomValue, isBuiltInCountryField, isEmptyValue, moduleFields, optionLabelMap } from '@/utils/formConfig';
import { formatPhoneDisplay } from '@/utils/phone';

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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** '2026-11-28' → '28-Nov-2026'; anything else unchanged. */
export function formatDay(value: string): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    return m ? `${m[3]}-${MONTHS[Number(m[2]) - 1] ?? m[2]}-${m[1]}` : value;
}

/** '14:30' → '02:30 PM'; anything else unchanged. */
export function formatClock(value: string): string {
    const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
    if (!m) return value;
    const h = Number(m[1]);
    return `${String(h % 12 || 12).padStart(2, '0')}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
}

/**
 * A record's value of the field as display strings: one per entry for lists (emails, multi-selects), dropdown
 * labels instead of stored values, phones formatted, countries named, dates as dd-MMM-yyyy (with the paired time
 * for date + time fields, e.g. nextFollowupDate + nextFollowupTime). Empty → [].
 */
export function fieldDisplayValues(record: AnyRecord | null | undefined, def: DrawerFieldDef, configs: FormConfigsPayload | null | undefined): string[] {
    const raw = rawFieldValue(record, def);
    if (isEmptyValue(raw)) return [];
    const labels = optionLabelMap(findCategory(configs, def.categoryKey));
    const one = (value: unknown): string => {
        if (value && typeof value === 'object' && 'email' in value) return String((value as { email?: unknown }).email ?? '').trim();
        const text = typeof value === 'string' ? value : String(value);
        if (def.type === 'phone') return formatPhoneDisplay(text) || text;
        if (def.form && isBuiltInCountryField(def.form)) return getCountryNameByCode(text) || text;
        if (def.type === 'date') return formatDay(text);
        if (def.type === 'datetime') {
            const time = record?.[def.key.replace(/Date$/, 'Time')];
            return [formatDay(text), typeof time === 'string' && time.trim() ? formatClock(time) : ''].filter(Boolean).join(', ');
        }
        if (def.form) return formatCustomValue(def.form, value, labels);
        return labels?.[text] ?? text;
    };
    return (Array.isArray(raw) ? raw : [raw]).map(one).filter((v) => v !== '');
}
