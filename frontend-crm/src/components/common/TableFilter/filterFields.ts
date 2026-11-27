'use client';

import { useMemo } from 'react';
import { useFormConfigs } from '@/hooks/queries/useFormConfigs';
import { useMasterData } from '@/hooks/queries/useMasterData';
import { findCrmUser } from '@/services/masterData.store';
import type { CrmModuleKey, FormFieldDefinitionDto } from '@/types/formConfig.types';
import type { CrmUser } from '@/types/user.types';
import { COUNTRY_OPTIONS } from '@/data/addressMaster';
import type { DataTableColumn } from '../DataTable/types';
import {
    activeOptionValues,
    CUSTOM_FIELDS_KEY,
    distinctFieldLabels,
    findCategory,
    isBuiltInCountryField,
    moduleFields,
    optionLabelMap,
    optionsForModule,
} from '@/utils/formConfig';
import type { ColumnFilterSpec, FilterFieldDef, FilterOption } from './types';

/**
 * Fields shown on the Advanced tab before the user adds any (the old CRM's search form, per module). Keys are form
 * field keys or the pseudo fields below; ones a module's form no longer has (deleted / hidden) are skipped.
 * Every other active form field can still be added from "Add field".
 */
export const DEFAULT_FILTER_KEYS: Record<CrmModuleKey, string[]> = {
    leads: ['nextFollowupDate', 'assignedTo', 'leadSource', 'leadType', 'status', 'rating', 'productCategory', 'createdAt', 'createdBy', 'anyNumber', 'converted', 'ageDays', 'unmodifiedDays'],
    opportunities: ['nextFollowupDate', 'assignedTo', 'leadSource', 'type', 'salesStage', 'productCategory', 'organizationName', 'createdAt', 'createdBy', 'ageDays', 'unmodifiedDays'],
    quotations: ['quotationDate', 'validUntil', 'assignedTo', 'quoteStage', 'company', 'organizationName', 'createdAt', 'createdBy', 'ageDays', 'unmodifiedDays'],
    organizations: ['assignedTo', 'accountStatus', 'customerType', 'typeOfEntity', 'natureOfBusiness', 'leadSource', 'createdAt', 'createdBy', 'ageDays', 'unmodifiedDays'],
    contacts: ['assignedTo', 'organizationName', 'designation', 'department', 'anyNumber', 'createdAt', 'createdBy', 'ageDays', 'unmodifiedDays'],
    products: ['category', 'type', 'taxType', 'taxRate', 'createdAt', 'createdBy', 'ageDays', 'unmodifiedDays'],
    tickets: ['dueDate', 'assignedTo', 'ticketStatus', 'ticketPriority', 'source', 'supportType', 'supportMode', 'organizationName', 'createdAt', 'createdBy', 'ageDays', 'unmodifiedDays'],
    contracts: ['status', 'assignedTo', 'contractTitle', 'contractPeriod', 'organizationName', 'startDate', 'endDate', 'renewalReminderDate', 'createdAt', 'createdBy', 'ageDays', 'unmodifiedDays'],
    activities: ['followupType', 'status', 'assignedTo', 'startAt', 'relatedTo', 'organizationName', 'createdAt', 'createdBy', 'ageDays', 'unmodifiedDays'],
    'partner-companies': ['assignedTo', 'natureOfPartner', 'createdAt', 'createdBy', 'ageDays', 'unmodifiedDays'],
    referrals: ['status', 'assignedTo', 'companyName', 'designation', 'department', 'anyNumber', 'createdAt', 'createdBy', 'ageDays', 'unmodifiedDays'],
};

/** Lookup fields that hold a CRM user. */
const USER_FIELD_KEYS = new Set(['assignedTo', 'leadGivenBy', 'createdBy']);

const TEXT_TYPES = new Set(['text', 'textarea', 'email', 'uppercase', 'pincode', 'phone']);
const NUMBER_TYPES = new Set(['number', 'amount', 'percentage']);

/** Countries are stored as ISO2 codes (older records may hold the name): both compare as the code. */
const COUNTRY_FILTER_OPTIONS: FilterOption[] = COUNTRY_OPTIONS.map((c) => ({ value: c.iso2Code, label: c.countryName }));
const COUNTRY_CODE_BY_NAME = new Map(COUNTRY_OPTIONS.map((c) => [c.countryName.toLowerCase(), c.iso2Code]));
const normalizeCountry = (value: string) => COUNTRY_CODE_BY_NAME.get(value.trim().toLowerCase()) ?? value.trim().toUpperCase();

const record = (row: unknown) => (row ?? {}) as Record<string, unknown>;

/** Stored user values may be a username or a full name: both compare as the username. */
const normalizeUser = (value: string) => findCrmUser(value)?.username ?? value.replace(/\s*\(You\)\s*$/i, '').trim();

function userOptions(users: CrmUser[]): FilterOption[] {
    return users
        .filter((u) => !u.isGroupUser)
        .map((u) => ({ value: u.username, label: u.status === 'Active' ? u.name || u.username : `${u.name || u.username} (inactive)` }))
        .sort((a, b) => a.label.localeCompare(b.label));
}

/** Days since an ISO timestamp (whole days, by local calendar date). */
function daysSince(iso: unknown): number | undefined {
    if (typeof iso !== 'string' || !iso) return undefined;
    const then = new Date(iso);
    if (Number.isNaN(then.getTime())) return undefined;
    const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    return Math.round((startOf(new Date()) - startOf(then)) / 86_400_000);
}

/** A field's value on a record: built-in fields are record properties, custom ones live under customFields. */
const fieldValueOf = (field: FormFieldDefinitionDto, row: unknown): unknown =>
    field.isSystem ? record(row)[field.fieldKey] : (record(row)[CUSTOM_FIELDS_KEY] as Record<string, unknown> | undefined)?.[field.fieldKey];

/**
 * "Any Number" / "Any Email" (keys `anyNumber` / `anyEmail`, as in the record pickers): every phone field of the
 * module's form (Mobile, Office Phone, Phone 3–5, custom phone fields, …) or every email field, searched at once.
 * Only for modules whose form has such a field.
 */
function anyOfFields(liveFields: FormFieldDefinitionDto[]): FilterFieldDef[] {
    const phones = liveFields.filter((f) => f.fieldType === 'phone');
    const emails = liveFields.filter((f) => f.fieldType === 'email');
    const out: FilterFieldDef[] = [];
    if (phones.length > 0) {
        out.push({ key: 'anyNumber', label: 'Any Number', kind: 'text', digitsOnly: true, getValue: (r) => phones.map((f) => fieldValueOf(f, r)) });
    }
    if (emails.length > 0) {
        out.push({ key: 'anyEmail', label: 'Any Email', kind: 'text', getValue: (r) => emails.map((f) => fieldValueOf(f, r)) });
    }
    return out;
}

/** Built-in record fields every module has, which aren't on the forms. */
function pseudoFields(module: CrmModuleKey, users: FilterOption[]): FilterFieldDef[] {
    const fields: FilterFieldDef[] = [
        { key: 'createdAt', label: 'Date Created', kind: 'date', getValue: (r) => record(r).createdAt },
        { key: 'updatedAt', label: 'Date Modified', kind: 'date', getValue: (r) => record(r).updatedAt },
        { key: 'createdBy', label: 'Created By', kind: 'options', options: users, getValue: (r) => record(r).createdBy, normalizeValue: normalizeUser },
        { key: 'ageDays', label: 'Age (Days)', kind: 'days', getValue: (r) => daysSince(record(r).createdAt) },
        { key: 'unmodifiedDays', label: 'Unmodified Since (Days)', kind: 'days', getValue: (r) => daysSince(record(r).updatedAt) },
    ];
    if (module === 'leads') {
        fields.push({ key: 'converted', label: 'Converted', kind: 'boolean', getValue: (r) => record(r).status === 'Converted' });
    }
    return fields;
}

function formField(
    field: FormFieldDefinitionDto,
    label: string,
    configs: ReturnType<typeof useFormConfigs>,
    users: FilterOption[]
): FilterFieldDef | null {
    const getValue = (r: unknown) => fieldValueOf(field, r);
    const base = { key: field.fieldKey, label, getValue };

    if (USER_FIELD_KEYS.has(field.fieldKey)) return { ...base, kind: 'options', options: users, normalizeValue: normalizeUser };

    switch (field.fieldType) {
        case 'select':
        case 'multiselect': {
            if (isBuiltInCountryField(field)) return { ...base, kind: 'options', options: COUNTRY_FILTER_OPTIONS, normalizeValue: normalizeCountry };
            const category = findCategory(configs, field.dropdownCategoryKey);
            // A select without a dropdown (e.g. an address State) is free text in practice.
            if (!category) return { ...base, kind: 'text' };
            const labels = optionLabelMap(category) ?? {};
            const options = optionsForModule(category.key, activeOptionValues(category), field.module).map((value) => ({ value, label: labels[value] ?? value }));
            return { ...base, kind: 'options', options };
        }
        case 'date':
        case 'datetime':
            return { ...base, kind: 'date' };
        case 'checkbox':
            return { ...base, kind: 'boolean' };
        case 'lookup':
            return { ...base, kind: 'text' };
        default:
            if (TEXT_TYPES.has(field.fieldType)) return { ...base, kind: 'text', digitsOnly: field.fieldType === 'phone' };
            if (NUMBER_TYPES.has(field.fieldType)) return { ...base, kind: 'number' };
            // Uploaded files aren't filterable.
            return null;
    }
}

/** 'GRAND TOTAL' → 'Grand Total'; mixed-case headers are kept. */
function titleCase(label: string): string {
    if (label !== label.toUpperCase()) return label;
    return label.toLowerCase().replace(/(^|[\s\-/(&])([a-z])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

/**
 * Filters for the list's columns that aren't form fields (their `filter` spec). A column without a spec isn't
 * offered; in development that is logged, so a new column doesn't silently go missing from the Filter dialog.
 */
function columnFields<T>(module: CrmModuleKey, columns: DataTableColumn<T>[], known: Set<string>): FilterFieldDef[] {
    const out: FilterFieldDef[] = [];
    for (const col of columns) {
        const key = col.fieldKey ?? col.id;
        if (known.has(key) || col.filter === false) continue;
        const spec = col.filter as ColumnFilterSpec<T> | undefined;
        if (!spec) {
            if (process.env.NODE_ENV === 'development') {
                console.warn(`[TableFilter] ${module}: column "${col.id}" has no form field and no \`filter\` spec, so the Filter dialog leaves it out.`);
            }
            continue;
        }
        const prop = col.sortKey ?? col.id;
        out.push({
            key,
            label: spec.label ?? titleCase(col.label),
            kind: spec.kind,
            options: spec.options,
            digitsOnly: spec.digitsOnly,
            normalizeValue: spec.normalizeValue,
            placeholder: spec.placeholder,
            getValue: spec.getValue ? (r) => spec.getValue!(r as T) : (r) => record(r)[prop],
        });
    }
    return out;
}

export interface ModuleFilterFields {
    /** Every filterable field: the defaults first (in DEFAULT_FILTER_KEYS order), then the rest in form order. */
    fields: FilterFieldDef[];
    byKey: Map<string, FilterFieldDef>;
    defaultKeys: string[];
}

/**
 * Filterable fields of a module: its configured form (labels, dropdown options), the list's other columns (their
 * `filter` spec) and the record audit fields. Pass the list's columns so every column is a filter too.
 */
export function useTableFilterFields<T = unknown>(module: CrmModuleKey, columns?: DataTableColumn<T>[]): ModuleFilterFields {
    const configs = useFormConfigs();
    const { users } = useMasterData();

    return useMemo(() => {
        const people = userOptions(users);
        const all: FilterFieldDef[] = [];
        const seen = new Set<string>();
        const add = (f: FilterFieldDef | null) => {
            if (!f || seen.has(f.key)) return;
            seen.add(f.key);
            all.push(f);
        };
        const liveFields = moduleFields(configs, module).filter((f) => f.isActive && f.isVisibleInForm);
        const pseudo = [...anyOfFields(liveFields), ...pseudoFields(module, people)];
        // Repeated form labels get their section prefix (Billing City / Shipping City), so no two fields share a name.
        const labels = distinctFieldLabels(liveFields, { reserved: pseudo.map((f) => f.label) });
        for (const field of liveFields) add(formField(field, labels.get(field.fieldKey) ?? field.label, configs, people));
        // Columns of form fields the admin hid stay out (as in the column manager); audit columns use the pseudo fields.
        const formKeys = new Set(moduleFields(configs, module).map((f) => f.fieldKey));
        const known = new Set([...formKeys, ...pseudo.map((f) => f.key)]);
        const taken = new Set([...all.map((f) => f.label), ...pseudo.map((f) => f.label)]);
        for (const f of columnFields(module, columns ?? [], known)) add(taken.has(f.label) ? { ...f, label: `${f.label} (List)` } : f);
        for (const f of pseudo) add(f);

        const byKey = new Map(all.map((f) => [f.key, f]));
        const defaultKeys = DEFAULT_FILTER_KEYS[module].filter((k) => byKey.has(k));
        const rank = new Map(defaultKeys.map((k, i) => [k, i]));
        const fields = [...all].sort((a, b) => (rank.get(a.key) ?? all.length) - (rank.get(b.key) ?? all.length));
        return { fields, byKey, defaultKeys };
    }, [configs, users, module, columns]);
}
