import { sectionKeyFromLabel, type ConvertSectionDef, type FormConfigsPayload, type FormFieldDefinitionDto } from '@/types/formConfig.types';
import { CONVERT_FIELD_NAMES, NOT_CHECKED_FOR_REQUIRED, type ConvertLeadFormValues, type ConvertModule } from '@/validations/convertLead.schema';
import { groupSections, isEmptyValue, moduleFields, type ConfigValidationIssue } from './formConfig';

/**
 * Which Contact / Organization / Opportunity fields the Convert Lead form shows. An admin picks them per field in
 * Form Builder › Convert Lead (`isVisibleInConvert`), independently of the record's own form. Fields Convert Lead has
 * its own inputs for (CONVERT_FIELD_NAMES) use those; any other field is drawn from its configuration and sent as
 * `extraFields.<module>.<fieldKey>`. Mirrors backend-crm formConfig.defaults.ts and lead.conversion.ts.
 */

type FieldShape = Pick<FormFieldDefinitionDto, 'fieldKey' | 'fieldType' | 'isSystem' | 'dropdownCategoryKey'>;

/**
 * Built-in fields the conversion fills in itself (from the lead or the linked records). Assigned To is the lead's own
 * Assigned To on every new record, so the module forms' Assigned To never reaches Convert Lead.
 */
const CONVERT_FILLED_FIELDS: Readonly<Record<ConvertModule, ReadonlySet<string>>> = {
    contacts: new Set(['assignedTo']),
    organizations: new Set(['partnerCompany', 'assignedTo']),
    opportunities: new Set(['contact', 'contactNumber', 'contactEmail', 'leadGivenBy', 'assignedTo']),
};

/** Whether Convert Lead has its own input for the field. */
export const isConvertInput = (module: ConvertModule, field: Pick<FieldShape, 'fieldKey' | 'isSystem'>) =>
    field.isSystem && field.fieldKey in CONVERT_FIELD_NAMES[module];

/**
 * Why a field can't be shown on Convert Lead, or null when it can: fields the conversion fills itself, and pickers
 * or dropdowns without a list, which need the record's own form.
 */
export function convertFieldUnavailableReason(module: ConvertModule, field: FieldShape): string | null {
    if (isConvertInput(module, field)) return null;
    if (field.isSystem && CONVERT_FILLED_FIELDS[module].has(field.fieldKey)) return 'Filled in by the conversion';
    if (field.fieldType === 'lookup' || field.fieldType === 'datetime' || field.fieldType === 'file') return 'Picker fields can only be set on their own form';
    if ((field.fieldType === 'select' || field.fieldType === 'multiselect') && !field.dropdownCategoryKey) return 'Needs its own form (no dropdown list)';
    return null;
}

/** Whether Convert Lead shows the field. */
export const isShownOnConvert = (module: ConvertModule, field: FormFieldDefinitionDto) =>
    field.isActive && !field.isDeleted && field.isVisibleInConvert && !convertFieldUnavailableReason(module, field);

/** A core field Convert Lead has an input for: it can't be taken off Convert Lead. */
export const isLockedOnConvert = (module: ConvertModule, field: FormFieldDefinitionDto) => field.isCoreLocked && isConvertInput(module, field);

/**
 * The field as Convert Lead uses it: Convert Lead's own width and "required" (Form Builder › Convert Lead) where an
 * admin set them, else the record's form settings, so a change made on the record's form reaches Convert Lead unless
 * Convert Lead has its own setting.
 */
export function convertSettingsOf<T extends FormFieldDefinitionDto>(field: T): T {
    const size = field.convertFieldSize;
    return { ...field, fieldSize: size === 'auto' ? null : (size ?? field.fieldSize), isRequired: field.convertIsRequired ?? field.isRequired };
}

/** Whether Convert Lead has its own width or "required" for the field (instead of the record's form settings). */
export const hasOwnConvertSettings = (field: FormFieldDefinitionDto) => field.convertIsRequired != null || field.convertFieldSize != null;

/** Whether Convert Lead has its own field order for `module` (instead of the record's form order). */
export const hasOwnConvertOrder = (configs: FormConfigsPayload | null | undefined, module: ConvertModule) =>
    moduleFields(configs, module).some((f) => f.convertSortOrder != null);

// ── Sections ─────────────────────────────────────────────────────────────────

/** Module setting holding Convert Lead's own sections of a record (ConvertSectionDef[]). */
export const CONVERT_SECTIONS_SETTING = 'convertSections';
/** Convert Lead has no tabs: every field it lays out sits on this one. */
export const CONVERT_TAB_KEY = 'convert';
/** Key prefix of sections made on Convert Lead (so they never clash with a section added to the form later). */
export const CONVERT_SECTION_PREFIX = 'convert_';

const isSectionDef = (value: unknown): value is ConvertSectionDef =>
    Boolean(value) && typeof (value as ConvertSectionDef).key === 'string' && typeof (value as ConvertSectionDef).label === 'string';

/** Convert Lead's own sections of `module` (renamed / deleted form sections and ones made on Convert Lead). */
export function convertSectionDefs(configs: FormConfigsPayload | null | undefined, module: ConvertModule): ConvertSectionDef[] {
    const raw = configs?.moduleSettings?.[module]?.[CONVERT_SECTIONS_SETTING];
    return Array.isArray(raw) ? raw.filter(isSectionDef) : [];
}

/**
 * Every field of `module` in Convert Lead's order and section, with Convert Lead's settings applied (convertSettingsOf).
 * - Order: fields with a Convert Lead order fill, in that order, the places they hold on the record's form; the others
 *   (e.g. one added to the form later) keep their place there. `sortOrder` is renumbered to it.
 * - Section (`sectionKey` / `sectionLabel`, all on one tab, CONVERT_TAB_KEY): the field's Convert Lead section, else
 *   its section on the record's form, named as Convert Lead renamed it or else as the form names it. A field whose
 *   section Convert Lead deleted goes to the first section left. Sections come in the order of their first field.
 * The record's form keeps its own `sectionKey`: read it from moduleFields when needed.
 */
export function convertOrderedFields(configs: FormConfigsPayload | null | undefined, module: ConvertModule): FormFieldDefinitionDto[] {
    const fields = moduleFields(configs, module);
    const ranked = fields.filter((f) => f.convertSortOrder != null).sort((a, b) => (a.convertSortOrder ?? 0) - (b.convertSortOrder ?? 0));
    let next = 0;
    const ordered = fields.map((f) => (f.convertSortOrder != null ? ranked[next++] : f));

    const defs = new Map(convertSectionDefs(configs, module).map((d) => [d.key, d]));
    const formLabels = new Map<string, string>();
    for (const f of fields) if (!formLabels.has(f.sectionKey)) formLabels.set(f.sectionKey, f.sectionLabel);
    const isLive = (key: string) => {
        const def = defs.get(key);
        return def ? !def.deleted : formLabels.has(key);
    };
    const wanted = (f: FormFieldDefinitionDto) => [f.convertSectionKey, f.sectionKey].find((k): k is string => Boolean(k) && isLive(k!));
    const fallback = ordered.map(wanted).find(Boolean) ?? [...defs.values()].find((d) => d.custom && !d.deleted)?.key;

    return ordered.map((f, i) => {
        const sectionKey = wanted(f) ?? fallback ?? f.sectionKey;
        return {
            ...convertSettingsOf(f),
            sortOrder: (i + 1) * 10,
            tabKey: CONVERT_TAB_KEY,
            sectionKey,
            sectionLabel: defs.get(sectionKey)?.label ?? formLabels.get(sectionKey) ?? f.sectionLabel,
        };
    });
}

export interface ConvertBuilderSection {
    sectionKey: string;
    sectionLabel: string;
    /** Made on Convert Lead (not a section of the record's form). */
    custom: boolean;
    /** Active fields in the section, in Convert Lead's order (shown on Convert Lead or not). */
    fields: FormFieldDefinitionDto[];
}

/**
 * Convert Lead's sections of `module` as Form Builder › Convert Lead lists them: every section holding an active field
 * (in the order of their first field), then sections made on Convert Lead that are still empty. The Convert Lead form
 * itself only shows sections with a field turned on.
 */
export function convertBuilderSections(configs: FormConfigsPayload | null | undefined, module: ConvertModule): ConvertBuilderSection[] {
    const defs = convertSectionDefs(configs, module);
    const custom = new Set(defs.filter((d) => d.custom).map((d) => d.key));
    const filled = groupSections(convertOrderedFields(configs, module).filter((f) => f.isActive)).map((s) => ({
        sectionKey: s.sectionKey,
        sectionLabel: s.sectionLabel,
        custom: custom.has(s.sectionKey),
        fields: s.fields,
    }));
    const empty = defs
        .filter((d) => d.custom && !d.deleted && !filled.some((s) => s.sectionKey === d.key))
        .map((d) => ({ sectionKey: d.key, sectionLabel: d.label, custom: true, fields: [] }));
    return [...filled, ...empty];
}

/** Key for a new Convert Lead section named `label`, free among the record's form sections and Convert Lead's own. */
export function newConvertSectionKey(configs: FormConfigsPayload | null | undefined, module: ConvertModule, label: string): string {
    const slug = sectionKeyFromLabel(label).slice(0, 60) || 'section';
    const taken = new Set([...moduleFields(configs, module).map((f) => f.sectionKey), ...convertSectionDefs(configs, module).map((d) => d.key)]);
    const root = `${CONVERT_SECTION_PREFIX}${slug}`;
    let key = root;
    for (let n = 2; taken.has(key); n++) key = `${root}_${n}`;
    return key;
}

/** The fields of `module` that Convert Lead shows, in Convert Lead's order and with its settings (convertOrderedFields). */
export const convertShownFields = (configs: FormConfigsPayload | null | undefined, module: ConvertModule) =>
    convertOrderedFields(configs, module).filter((f) => isShownOnConvert(module, f));

/** The Convert Lead form's name for a field. */
export function convertFieldName(module: ConvertModule, field: Pick<FieldShape, 'fieldKey' | 'isSystem'>): string {
    const names: Readonly<Record<string, string>> = CONVERT_FIELD_NAMES[module];
    return isConvertInput(module, field) ? names[field.fieldKey] : `extraFields.${module}.${field.fieldKey}`;
}

/**
 * Values of `module`'s extra Convert Lead fields taken from an existing record (linked as it is, so they show its
 * details): built-in fields from the record, custom fields from its `customFields`.
 */
export function extraValuesFrom(
    configs: FormConfigsPayload | null | undefined,
    module: ConvertModule,
    record: Record<string, unknown> & { customFields?: Record<string, unknown> },
): Record<string, unknown> {
    const values: Record<string, unknown> = {};
    for (const field of convertShownFields(configs, module)) {
        if (isConvertInput(module, field)) continue;
        const value = field.isSystem ? record[field.fieldKey] : record.customFields?.[field.fieldKey];
        values[field.fieldKey] = value ?? (field.fieldType === 'multiselect' ? [] : field.fieldType === 'checkbox' ? false : '');
    }
    return values;
}

const readPath = (values: unknown, path: string): unknown =>
    path.split('.').reduce<unknown>((acc, key) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[key] : undefined), values);

/**
 * "Required" of every field Convert Lead shows, as on the record's own form. A linked existing contact or
 * organization is taken as it is, and a skipped opportunity isn't created, so their fields aren't checked.
 */
export function convertRequiredIssues(configs: FormConfigsPayload | null | undefined, values: ConvertLeadFormValues): ConfigValidationIssue[] {
    const issues: ConfigValidationIssue[] = [];
    for (const record of Object.keys(CONVERT_FIELD_NAMES) as ConvertModule[]) {
        if (record === 'contacts' && values.existingContactId) continue;
        if (record === 'organizations' && values.existingOrganizationId) continue;
        if (record === 'opportunities' && !values.createOpportunity) continue;
        for (const field of convertShownFields(configs, record)) {
            if (!field.isRequired || (field.isSystem && NOT_CHECKED_FOR_REQUIRED.has(field.fieldKey))) continue;
            const name = convertFieldName(record, field);
            const value = readPath(values, name);
            if (field.fieldType === 'checkbox') {
                if (!field.isSystem && value !== true) issues.push({ path: name, message: `${field.label} must be checked.` });
            } else if (isEmptyValue(value)) {
                issues.push({ path: name, message: `${field.label} is required.` });
            }
        }
    }
    return issues;
}
