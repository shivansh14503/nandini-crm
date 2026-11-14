'use client';

import { useMemo } from 'react';
import { useFormConfigs } from '@/hooks/queries/useFormConfigs';
import { useMasterData } from '@/hooks/queries/useMasterData';
import { findCrmUser } from '@/services/masterData.store';
import type { CrmModuleKey, FormFieldDefinitionDto } from '@/types/formConfig.types';
import type { CrmUser } from '@/types/user.types';
import {
    activeOptionValues,
    CUSTOM_FIELDS_KEY,
    distinctFieldLabels,
    findCategory,
    isBuiltInCountryField,
    moduleFields,
    optionLabelMap,
} from '@/utils/formConfig';
import type { FilterFieldDef, FilterOption } from './types';

/**
 * Fields shown on the Advanced tab before the user adds any (the old CRM's search form, per module). Keys are form
 * field keys or the pseudo fields below; ones a module's form no longer has (deleted / hidden) are skipped.
 * Every other active form field can still be added from "Add field".
 */
export const DEFAULT_FILTER_KEYS: Record<CrmModuleKey, string[]> = {
    leads: ['nextFollowupDate', 'assignedTo', 'leadSource', 'leadType', 'status', 'productCategory', 'createdAt', 'createdBy', 'mobile', 'converted', 'ageDays', 'unmodifiedDays'],
    opportunities: ['nextFollowupDate', 'assignedTo', 'leadSource', 'type', 'salesStage', 'productCategory', 'organizationName', 'createdAt', 'createdBy', 'ageDays', 'unmodifiedDays'],
    quotations: ['quotationDate', 'validUntil', 'assignedTo', 'quoteStage', 'company', 'organizationName', 'createdAt', 'createdBy', 'ageDays', 'unmodifiedDays'],
    organizations: ['assignedUser', 'accountStatus', 'customerType', 'typeOfEntity', 'natureOfBusiness', 'sourceOfLead', 'createdAt', 'createdBy', 'ageDays', 'unmodifiedDays'],
    contacts: ['assignedTo', 'organizationName', 'designation', 'department', 'mobile', 'createdAt', 'createdBy', 'ageDays', 'unmodifiedDays'],
    products: ['category', 'type', 'taxType', 'taxRate', 'createdAt', 'createdBy', 'ageDays', 'unmodifiedDays'],
    tickets: ['dueDate', 'assignedTo', 'ticketStatus', 'ticketPriority', 'source', 'supportType', 'supportMode', 'organizationName', 'createdAt', 'createdBy', 'ageDays', 'unmodifiedDays'],
    'partner-companies': ['assignedTo', 'natureOfPartner', 'createdAt', 'createdBy', 'ageDays', 'unmodifiedDays'],
};

/** Lookup fields that hold a CRM user. */
const USER_FIELD_KEYS = new Set(['assignedTo', 'assignedUser', 'leadGivenBy', 'createdBy']);

const TEXT_TYPES = new Set(['text', 'textarea', 'email', 'uppercase', 'pincode', 'phone']);

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
    const getValue = field.isSystem
        ? (r: unknown) => record(r)[field.fieldKey]
        : (r: unknown) => (record(r)[CUSTOM_FIELDS_KEY] as Record<string, unknown> | undefined)?.[field.fieldKey];
    const base = { key: field.fieldKey, label, getValue };

    if (USER_FIELD_KEYS.has(field.fieldKey)) return { ...base, kind: 'options', options: users, normalizeValue: normalizeUser };

    switch (field.fieldType) {
        case 'select':
        case 'multiselect': {
            if (isBuiltInCountryField(field)) return null;
            const category = findCategory(configs, field.dropdownCategoryKey);
            // A select without a dropdown (e.g. an address State) is free text in practice.
            if (!category) return { ...base, kind: 'text' };
            const labels = optionLabelMap(category) ?? {};
            const options = activeOptionValues(category).map((value) => ({ value, label: labels[value] ?? value }));
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
            // Numbers / amounts aren't filterable yet.
            return null;
    }
}

export interface ModuleFilterFields {
    /** Every filterable field: the defaults first (in DEFAULT_FILTER_KEYS order), then the rest in form order. */
    fields: FilterFieldDef[];
    byKey: Map<string, FilterFieldDef>;
    defaultKeys: string[];
}

/** Filterable fields of a module, from its configured form (labels, dropdown options) plus the record audit fields. */
export function useTableFilterFields(module: CrmModuleKey): ModuleFilterFields {
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
        const pseudo = pseudoFields(module, people);
        const liveFields = moduleFields(configs, module).filter((f) => f.isActive && f.isVisibleInForm);
        // Repeated form labels get their section prefix (Billing City / Shipping City), so no two fields share a name.
        const labels = distinctFieldLabels(liveFields, { reserved: pseudo.map((f) => f.label) });
        for (const field of liveFields) add(formField(field, labels.get(field.fieldKey) ?? field.label, configs, people));
        for (const f of pseudo) add(f);

        const byKey = new Map(all.map((f) => [f.key, f]));
        const defaultKeys = DEFAULT_FILTER_KEYS[module].filter((k) => byKey.has(k));
        const rank = new Map(defaultKeys.map((k, i) => [k, i]));
        const fields = [...all].sort((a, b) => (rank.get(a.key) ?? all.length) - (rank.get(b.key) ?? all.length));
        return { fields, byKey, defaultKeys };
    }, [configs, users, module]);
}
