export type ImportEntityType = 'organizations' | 'contacts' | 'products' | 'leads';

export interface ImportFieldDef {
    key: string;
    label: string;
    required: boolean;
    /** Lower-case alternative header names used for smart auto-matching. */
    aliases: string[];
    sample: [string, string];
}

export interface ImportEntityConfig {
    entity: ImportEntityType;
    singular: string;
    plural: string;
    fields: ImportFieldDef[];
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
}
