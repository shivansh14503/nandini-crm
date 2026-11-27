import type { CrmModuleKey } from '@/types/formConfig.types';

/**
 * Screens with a Filter dialog: the CRM module lists, Activities › Documents (no form of its own, so its fields are
 * built by the list) and Admin › Audit Log (its filter runs on the server).
 */
export type TableFilterScope = CrmModuleKey | 'documents' | 'audit-log';

/**
 * Operators of a filter condition. Mirrors FILTER_OPERATORS in
 * backend-crm/src/modules/table-filters/tableFilter.validator.ts (the backend stores criteria as-is).
 */
export type FilterOp =
    | 'in'
    | 'contains'
    | 'equals'
    | 'before'
    | 'after'
    | 'between'
    | 'today'
    | 'yesterday'
    | 'tomorrow'
    | 'this_week'
    | 'this_month'
    | 'last_7_days'
    | 'last_30_days'
    | 'next_7_days'
    | 'gte'
    | 'lte'
    | 'is';

export interface FilterCondition {
    op: FilterOp;
    /** `in`: the selected option values. */
    values?: string[];
    /** Text, a date (YYYY-MM-DD), a number of days, or yes / no. */
    value?: string;
    /** Second date of `between`. */
    value2?: string;
}

export interface FilterSort {
    field: string;
    order: 'asc' | 'desc';
}

export interface FilterCriteria {
    /** Keyed by FilterFieldDef.key. */
    conditions: Record<string, FilterCondition>;
    sort?: FilterSort;
}

/** How a field is filtered (and which control the Advanced tab shows for it). */
export type FilterFieldKind = 'options' | 'date' | 'text' | 'days' | 'number' | 'boolean';

export interface FilterOption {
    value: string;
    label: string;
}

export interface FilterFieldDef {
    key: string;
    label: string;
    kind: FilterFieldKind;
    /** `options` fields. */
    options?: FilterOption[];
    /** Raw value(s) of the field on a record. */
    getValue: (row: unknown) => unknown;
    /** Compares stored values through this (e.g. a user's name or username → username). */
    normalizeValue?: (value: string) => string;
    /** Phone numbers: matched on digits only. */
    digitsOnly?: boolean;
    /** `text` fields matched as a whole value (described as "is" instead of "contains"). */
    exactMatch?: boolean;
    /** `text` fields: hint shown in the empty box (default "Contains..."). */
    placeholder?: string;
}

export interface SavedTableFilter {
    id: string;
    module: TableFilterScope;
    kind: 'recent' | 'saved';
    name: string | null;
    criteria: FilterCriteria;
    createdAt: string;
    lastUsedAt: string;
}

export interface TableFilterLists {
    recent: SavedTableFilter[];
    saved: SavedTableFilter[];
}

export const DATE_OPERATORS: { op: FilterOp; label: string; inputs: 0 | 1 | 2 }[] = [
    { op: 'equals', label: 'Equals', inputs: 1 },
    { op: 'before', label: 'Before', inputs: 1 },
    { op: 'after', label: 'After', inputs: 1 },
    { op: 'between', label: 'Between', inputs: 2 },
    { op: 'today', label: 'Today', inputs: 0 },
    { op: 'yesterday', label: 'Yesterday', inputs: 0 },
    { op: 'tomorrow', label: 'Tomorrow', inputs: 0 },
    { op: 'this_week', label: 'This Week', inputs: 0 },
    { op: 'this_month', label: 'This Month', inputs: 0 },
    { op: 'last_7_days', label: 'Last 7 Days', inputs: 0 },
    { op: 'last_30_days', label: 'Last 30 Days', inputs: 0 },
    { op: 'next_7_days', label: 'Next 7 Days', inputs: 0 },
];

/** Operators of `days` and `number` fields. */
export const DAYS_OPERATORS: { op: FilterOp; label: string }[] = [
    { op: 'gte', label: 'At least' },
    { op: 'lte', label: 'At most' },
    { op: 'equals', label: 'Exactly' },
];

/**
 * Filter of a table column that isn't a form field (e.g. the lead Rating, an opportunity's Quote Sent, a quotation's
 * Grand Total). Set on `DataTableColumn.filter`; the Filter dialog offers every such column, so the dialog and the
 * table can't drift apart. Columns that show a form field are filtered through the form field instead.
 */
export interface ColumnFilterSpec<T = unknown> {
    kind: FilterFieldKind;
    /** The value the filter compares (default: the record property named by the column's `sortKey` / `id`). */
    getValue?: (row: T) => unknown;
    /** `options` fields. */
    options?: FilterOption[];
    /** Default: the column header in title case. */
    label?: string;
    digitsOnly?: boolean;
    normalizeValue?: (value: string) => string;
    /** `text` fields: hint shown in the empty box. */
    placeholder?: string;
}
