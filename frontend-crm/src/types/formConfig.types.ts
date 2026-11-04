// ─── Admin Form & Dropdown Customization ──────────────────────────────────────
// Mirrors backend-crm/src/modules/form-configs (GET /api/form-configs).

/** In Sales navbar order (leads → opportunities → quotations → organizations → contacts), then the other forms. */
export const CRM_MODULE_KEYS = [
    'leads',
    'opportunities',
    'quotations',
    'organizations',
    'contacts',
    'products',
    'tickets',
    'partner-companies',
] as const;

export type CrmModuleKey = (typeof CRM_MODULE_KEYS)[number];

export const CRM_MODULE_LABELS: Record<CrmModuleKey, string> = {
    leads: 'Leads',
    opportunities: 'Opportunities',
    quotations: 'Quotations',
    organizations: 'Organizations',
    contacts: 'Contacts',
    products: 'Products',
    tickets: 'Tickets',
    'partner-companies': 'Partner Companies',
};

export type CrmModuleGroupKey = 'sales' | 'support' | 'inventory' | 'all';

export interface CrmModuleGroup {
    key: CrmModuleGroupKey;
    label: string;
    /** Forms of the group, in navbar order, with their navbar name. */
    modules: readonly { key: CrmModuleKey; label: string }[];
}

/** The CRM modules grouped as in the top navbar (components/layout/Navbar.tsx). Covers every CRM_MODULE_KEYS entry. */
export const CRM_MODULE_GROUPS: readonly CrmModuleGroup[] = [
    {
        key: 'sales',
        label: 'Sales',
        modules: [
            { key: 'leads', label: 'Leads' },
            { key: 'opportunities', label: 'Opportunities' },
            { key: 'quotations', label: 'Quotations' },
            { key: 'organizations', label: 'Organizations' },
            { key: 'contacts', label: 'Contacts' },
        ],
    },
    { key: 'support', label: 'Support', modules: [{ key: 'tickets', label: 'Tickets' }] },
    { key: 'inventory', label: 'Inventory', modules: [{ key: 'products', label: 'Product Catalog' }] },
    { key: 'all', label: 'All', modules: [{ key: 'partner-companies', label: 'Partner Companies' }] },
];

/** Navbar group of a module. */
export const moduleGroupOf = (module: CrmModuleKey): CrmModuleGroup =>
    CRM_MODULE_GROUPS.find((g) => g.modules.some((m) => m.key === module)) ?? CRM_MODULE_GROUPS[0];

/** Navbar name of a module (e.g. products → "Product Catalog"). */
export const moduleNavLabel = (module: CrmModuleKey): string =>
    moduleGroupOf(module).modules.find((m) => m.key === module)?.label ?? CRM_MODULE_LABELS[module];

/** Control types an admin can pick for a custom field. */
export const CUSTOM_FIELD_TYPES = [
    'text',
    'textarea',
    'number',
    'amount',
    'percentage',
    'phone',
    'email',
    'date',
    'select',
    'multiselect',
    'checkbox',
    'uppercase',
    'pincode',
] as const;

export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

/** Built-in fields can also be lookups or date + time pickers. */
export type FieldType = CustomFieldType | 'lookup' | 'datetime';

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
    text: 'Text',
    textarea: 'Text Area',
    number: 'Number',
    amount: 'Amount',
    percentage: 'Percentage',
    phone: 'Phone',
    email: 'Email',
    date: 'Date',
    select: 'Select',
    multiselect: 'Multi-Select',
    checkbox: 'Checkbox',
    uppercase: 'Uppercase Code',
    pincode: 'PIN Code',
    lookup: 'Lookup',
    datetime: 'Date & Time',
};

export type ConfigFieldSize = 'xs' | 'sm' | 'md' | 'lg' | 'full';

export interface DropdownOptionDto {
    id: string;
    categoryId: string;
    value: string;
    label: string;
    /** Extra data, e.g. `{ description }` for quotation terms templates. */
    meta: Record<string, unknown> | null;
    sortOrder: number;
    isActive: boolean;
    /** Drives backend logic: can't be archived or renamed (label edits are fine). */
    isSystem: boolean;
}

export interface DropdownCategoryDto {
    id: string;
    key: string;
    label: string;
    /** Owning module, or `shared`. */
    module: CrmModuleKey | 'shared';
    description: string;
    isSystem: boolean;
    /** CRM screens read it directly by key (lead conversion, quick create, quotations). */
    appRequired: boolean;
    /** Why it can't be deleted, or null when an admin may delete it (built-in or not). */
    lockReason: string | null;
    options: DropdownOptionDto[];
    /** Fields whose options come from this category. */
    usedBy: { module: string; fieldKey: string; label: string }[];
}

export interface FormFieldDefinitionDto {
    id: string;
    module: CrmModuleKey;
    /** RHF name for built-in fields; `cf_…` key inside `customFields` for custom fields. */
    fieldKey: string;
    label: string;
    fieldType: FieldType;
    tabKey: string;
    /** Name of an admin-created tab (null on built-in tabs). */
    tabLabel?: string | null;
    sectionKey: string;
    sectionLabel: string;
    /** Built-in fields: the section the hand-built form renders them in (null for custom fields). */
    defaultSectionKey?: string | null;
    /** Built-in fields: the tab the hand-built form renders them on (null for custom fields). */
    defaultTabKey?: string | null;
    sortOrder: number;
    fieldSize: ConfigFieldSize | null;
    /** null → the form's built-in text. */
    placeholder: string | null;
    /** null → the form's built-in text. */
    hint: string | null;
    defaultValue: string | null;
    isRequired: boolean;
    /** Can't be hidden or made optional. */
    isCoreLocked: boolean;
    /** Built-in field (fixed tab / section / type). */
    isSystem: boolean;
    isActive: boolean;
    isVisibleInForm: boolean;
    isVisibleInDrawer: boolean;
    dropdownCategoryId: string | null;
    dropdownCategoryKey: string | null;
    validationRules: Record<string, unknown> | null;
    /** A built-in field an admin deleted (kept as an inactive, hidden tombstone). */
    isDeleted?: boolean;
}

export interface ModuleTabDefinition {
    key: string;
    label: string;
    /** Admin-created tab (stored through the fields placed on it), shown after the form's built-in tabs. */
    isCustom?: boolean;
}

export interface FormConfigsPayload {
    categories: DropdownCategoryDto[];
    fieldsByModule: Record<CrmModuleKey, FormFieldDefinitionDto[]>;
    moduleTabs: Record<CrmModuleKey, ModuleTabDefinition[]>;
}

/** A section of a module form, as configured. */
export interface ConfiguredSection {
    sectionKey: string;
    sectionLabel: string;
    tabKey: string;
    fields: FormFieldDefinitionDto[];
}

// ── Admin request bodies ─────────────────────────────────────────────────────

export interface CreateCategoryPayload {
    key?: string;
    label: string;
    module: CrmModuleKey | 'shared';
    description?: string;
    options?: string[];
}

export interface UpdateCategoryPayload {
    label?: string;
    description?: string | null;
    /** Owning module, or `shared`. */
    module?: CrmModuleKey | 'shared';
}

export interface CreateOptionPayload {
    value: string;
    label?: string;
    meta?: Record<string, unknown> | null;
}

export interface UpdateOptionPayload {
    value?: string;
    label?: string;
    meta?: Record<string, unknown> | null;
    isActive?: boolean;
}

export interface CreateFieldPayload {
    module: CrmModuleKey;
    label: string;
    fieldType: CustomFieldType;
    tabKey: string;
    /** Name of the tab when it is an admin-created one (ignored on built-in tabs). */
    tabLabel?: string;
    sectionKey?: string;
    sectionLabel: string;
    fieldSize?: ConfigFieldSize | null;
    placeholder?: string;
    hint?: string;
    defaultValue?: string;
    isRequired?: boolean;
    isVisibleInForm?: boolean;
    isVisibleInDrawer?: boolean;
    dropdownCategoryKey?: string;
    newOptions?: string[];
}

export interface UpdateFieldPayload {
    label?: string;
    /** Custom select / multi-select fields only: switches between the two. */
    fieldType?: 'select' | 'multiselect';
    /** Custom fields only. */
    tabKey?: string;
    tabLabel?: string;
    sectionKey?: string;
    sectionLabel?: string;
    fieldSize?: ConfigFieldSize | null;
    placeholder?: string | null;
    hint?: string | null;
    defaultValue?: string | null;
    isRequired?: boolean;
    isVisibleInForm?: boolean;
    isVisibleInDrawer?: boolean;
    isActive?: boolean;
    dropdownCategoryKey?: string | null;
}

/** `Compliance & Legal` → `compliance_legal`: key of an admin-created tab (the API accepts ^[a-z][a-z0-9_]{1,39}$). */
export function tabKeyFromLabel(label: string): string {
    const slug = sectionKeyFromLabel(label).slice(0, 36).replace(/_+$/, '');
    if (!slug) return 'custom_tab';
    const key = /^[a-z]/.test(slug) ? slug : `tab_${slug}`;
    return key.length < 2 ? `${key}_tab` : key;
}

/** `PIPELINE & FOLLOW-UP` → `pipeline_follow_up` (same rule as the backend). */
export function sectionKeyFromLabel(label: string): string {
    return label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 80);
}
