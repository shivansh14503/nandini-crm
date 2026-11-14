'use client';

import { useMemo } from 'react';
import { Typography } from '@mui/material';
import { useFormConfigs } from '@/hooks/queries/useFormConfigs';
import { CRM_MODULE_KEYS, type CrmModuleKey, type FormConfigsPayload, type FormFieldDefinitionDto } from '@/types/formConfig.types';
import {
    CUSTOM_FIELDS_KEY,
    distinctFieldLabels,
    findCategory,
    formatCustomValue,
    isBuiltInCountryField,
    moduleFields,
    optionLabelMap,
} from '@/utils/formConfig';
import { formatPhoneDisplay } from '@/utils/phone';
import { getCountryNameByCode } from '@/data/addressMaster';
import type { DataTableColumn } from './types';

export const isCrmModuleKey = (value: string | undefined): value is CrmModuleKey =>
    Boolean(value && (CRM_MODULE_KEYS as readonly string[]).includes(value));

/** Raw value of a form field on a record: built-in fields by key, custom fields under `customFields`. */
function readFieldValue(row: unknown, field: FormFieldDefinitionDto): unknown {
    const record = (row ?? {}) as Record<string, unknown>;
    if (field.isSystem) return record[field.fieldKey];
    const custom = record[CUSTOM_FIELDS_KEY] as Record<string, unknown> | undefined;
    return custom?.[field.fieldKey];
}

/** Display text for any form field value in a table cell ('' when empty). */
export function formatFieldCell(field: FormFieldDefinitionDto, value: unknown, configs: FormConfigsPayload | null): string {
    if (value === undefined || value === null || value === '') return '';
    if (Array.isArray(value) && value.some((item) => item && typeof item === 'object')) {
        // Repeatable lists such as emailAddresses: [{ email, isPrimary, … }]
        return value
            .map((item) => {
                if (!item || typeof item !== 'object') return String(item ?? '');
                const obj = item as Record<string, unknown>;
                return String(obj.email ?? obj.label ?? obj.name ?? obj.value ?? '');
            })
            .filter(Boolean)
            .join(', ');
    }
    if (!Array.isArray(value) && typeof value === 'object') {
        const obj = value as Record<string, unknown>;
        return String(obj.label ?? obj.name ?? obj.email ?? obj.value ?? '');
    }
    if (isBuiltInCountryField(field) && typeof value === 'string') return getCountryNameByCode(value) || value;
    if (field.fieldType === 'phone' && typeof value === 'string') return formatPhoneDisplay(value) || value;
    if (field.fieldType === 'datetime' && typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return formatCustomValue({ ...field, fieldType: 'date' }, value);
    }
    const labels = optionLabelMap(findCategory(configs, field.dropdownCategoryKey));
    return formatCustomValue(field, value, labels);
}

const LONG_TEXT_TYPES = new Set(['textarea']);

/**
 * Columns for every field of the module's form (built-in and admin-created, as configured in the form builder)
 * that the hand-built `columns` don't already show. They start hidden; users switch them on from Modify
 * Columns. Hidden / archived / deleted form fields are left out.
 */
export function useFormFieldColumns<T>(
    columns: DataTableColumn<T>[] | undefined,
    module: CrmModuleKey | undefined
): DataTableColumn<T>[] | undefined {
    const configs = useFormConfigs();

    return useMemo(() => {
        if (!columns || !module || !configs) return columns;
        const covered = new Set(columns.map((c) => c.fieldKey ?? c.id));
        // The form's tabs in order (built-in first, then admin-created ones): the column manager groups by tab,
        // like the create form and the record view do.
        const tabs = configs.moduleTabs[module] ?? [];
        const tabIndex = new Map(tabs.map((t, i) => [t.key, i]));
        const tabLabel = (field: FormFieldDefinitionDto) =>
            tabs.find((t) => t.key === field.tabKey)?.label || field.tabLabel || titleCase(field.tabKey.replace(/_/g, ' ').toUpperCase());

        const liveFields = moduleFields(configs, module).filter((f) => f.isActive && f.isVisibleInForm);
        const byKey = new Map(liveFields.map((f) => [f.fieldKey, f]));
        // Tab order first, then the field's place in the form (moduleFields is already in form order).
        const formOrder = new Map(
            liveFields.map((f, i) => [f.fieldKey, (tabIndex.get(f.tabKey) ?? tabs.length) * 10_000 + i])
        );
        const labels = distinctFieldLabels(liveFields, { reserved: columns.map((c) => c.label), skip: covered });

        // Columns the table shows by default are the Basic Columns; a hand-built one that starts hidden goes under
        // its form field's tab, like the generated ones.
        const placed = columns.map((col) => {
            const field = byKey.get(col.fieldKey ?? col.id);
            if (col.group || !col.defaultHidden || !field) return col;
            return { ...col, group: tabLabel(field), groupOrder: formOrder.get(field.fieldKey) };
        });

        const extra: DataTableColumn<T>[] = liveFields
            .filter((f) => !covered.has(f.fieldKey))
            .sort((a, b) => (formOrder.get(a.fieldKey) ?? 0) - (formOrder.get(b.fieldKey) ?? 0))
            .map((field) => {
                const isLong = LONG_TEXT_TYPES.has(field.fieldType);
                return {
                    id: field.isSystem ? field.fieldKey : `${CUSTOM_FIELDS_KEY}.${field.fieldKey}`,
                    fieldKey: field.fieldKey,
                    label: (labels.get(field.fieldKey) ?? field.label).toUpperCase(),
                    group: tabLabel(field),
                    groupOrder: formOrder.get(field.fieldKey),
                    defaultHidden: true,
                    // Master views sort on row[sortField]; custom values live one level down.
                    sortable: field.isSystem && field.fieldType !== 'multiselect',
                    sortKey: field.fieldKey,
                    minWidth: isLong ? 220 : 140,
                    width: isLong ? 280 : undefined,
                    render: (row: T) => {
                        const text = formatFieldCell(field, readFieldValue(row, field), configs);
                        return (
                            // Wraps within the column width (the table caps cell width), so the full value shows.
                            <Typography sx={{ fontSize: '0.78rem', color: text ? 'var(--crm-slate-700)' : 'var(--mui-palette-text-muted)' }}>
                                {text || '-'}
                            </Typography>
                        );
                    },
                };
            });

        return [...placed, ...extra];
    }, [columns, module, configs]);
}

/** 'PARTNER COMPANY' → 'Partner Company'; already mixed-case labels are kept. */
function titleCase(label: string): string {
    if (label !== label.toUpperCase()) return label;
    return label.toLowerCase().replace(/(^|[\s\-/(&])([a-z])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}
