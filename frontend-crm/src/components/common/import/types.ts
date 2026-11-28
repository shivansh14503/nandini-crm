export type ImportEntityType =
    | 'organizations'
    | 'contacts'
    | 'products'
    | 'leads'
    | 'opportunities'
    | 'tickets'
    | 'partner-companies'
    | 'quotations'
    | 'contracts'
    | 'referrals'
    | 'activities';

export interface ImportFieldDef {
    /** The form's field key (custom fields: `customFields.<key>`), which is also the key the row values are sent under. */
    key: string;
    label: string;
    required: boolean;
    /** Lower-case alternative header names used for smart auto-matching. */
    aliases: string[];
    sample: [string, string];
    /** Form Builder field type (text, select, multiselect, date, datetime, checkbox, phone, email, amount …). */
    fieldType?: string;
    /** Active dropdown options of a select / multi-select field (value stored, label shown). */
    options?: { value: string; label: string }[];
    /** A pick-or-type dropdown (the product's Manufacturer): a cell naming no option is kept as typed and added to the dropdown. */
    openOptions?: boolean;
    /** One line under the field on the mapping step: the expected format, or what a blank cell becomes. */
    hint?: string;
    /** Form section the field sits in (groups the mapping step). */
    section?: string;
    /**
     * A column the import reads that isn't a field of the module's form (a quotation's line item Product, Quantity …):
     * `buildImportConfig` keeps it after the form's fields instead of dropping it.
     */
    importOnly?: boolean;
}

export interface ImportEntityConfig {
    /** A module of the shared import (/api/import), or an admin list with its own import (Admin › Holidays). */
    entity: ImportEntityType | 'holidays';
    singular: string;
    plural: string;
    fields: ImportFieldDef[];
    /** Conditional rules across a row's normalized values (e.g. Referred By for Lead Source CA); error messages. */
    rowRules?: (values: Record<string, string>) => string[];
}

/** A raw parsed row keyed by the file's own header names. */
export type RawRow = Record<string, string>;

export interface ParsedFile {
    fileName: string;
    headers: string[];
    rows: RawRow[];
}

/** entity field key -> file header (empty string = not mapped) */
export type ColumnMapping = Record<string, string>;

export interface MappedRow {
    rowNumber: number;
    values: Record<string, string>;
    errors: string[];
    /** The error of each cell that failed, by field key (highlighted in the preview). */
    cellErrors: Record<string, string>;
}

/** The import wizard's steps (the full-size progress dialog of a background import shows the last one). */
export const IMPORT_STEPS = ['Upload File', 'Map Columns', 'Preview & Import', 'Results'] as const;
