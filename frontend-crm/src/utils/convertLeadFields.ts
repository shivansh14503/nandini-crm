import type { FormConfigsPayload, FormFieldDefinitionDto } from '@/types/formConfig.types';
import { CONVERT_FIELD_NAMES, NOT_CHECKED_FOR_REQUIRED, type ConvertLeadFormValues, type ConvertModule } from '@/validations/convertLead.schema';
import { isEmptyValue, moduleFields, type ConfigValidationIssue } from './formConfig';

/**
 * Which Contact / Organization / Opportunity fields the Convert Lead form shows. An admin picks them per field in
 * Form Builder › Convert Lead (`isVisibleInConvert`), independently of the record's own form. Fields Convert Lead has
 * its own inputs for (CONVERT_FIELD_NAMES) use those; any other field is drawn from its configuration and sent as
 * `extraFields.<module>.<fieldKey>`. Mirrors backend-crm formConfig.defaults.ts and lead.conversion.ts.
 */

type FieldShape = Pick<FormFieldDefinitionDto, 'fieldKey' | 'fieldType' | 'isSystem' | 'dropdownCategoryKey'>;

/** Built-in fields the conversion fills in itself (from the lead or the linked records). */
const CONVERT_FILLED_FIELDS: Readonly<Record<ConvertModule, ReadonlySet<string>>> = {
    contacts: new Set(),
    organizations: new Set(['partnerCompany']),
    opportunities: new Set(['contact', 'contactNumber', 'contactEmail', 'leadGivenBy']),
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
    if (field.fieldType === 'lookup' || field.fieldType === 'datetime') return 'Picker fields can only be set on their own form';
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

/**
 * Every field of `module` in Convert Lead's order, with Convert Lead's settings applied (convertSettingsOf) and
 * `sortOrder` renumbered to that order. Fields with a Convert Lead order fill, in that order, the places they hold on
 * the record's form; the others (e.g. one added to the form later) keep their place there. Sections and tabs are
 * the record's form's.
 */
export function convertOrderedFields(configs: FormConfigsPayload | null | undefined, module: ConvertModule): FormFieldDefinitionDto[] {
    const fields = moduleFields(configs, module);
    const ranked = fields.filter((f) => f.convertSortOrder != null).sort((a, b) => (a.convertSortOrder ?? 0) - (b.convertSortOrder ?? 0));
    let next = 0;
    return fields
        .map((f) => (f.convertSortOrder != null ? ranked[next++] : f))
        .map((f, i) => ({ ...convertSettingsOf(f), sortOrder: (i + 1) * 10 }));
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
 * organization is taken as it is, so its fields aren't checked.
 */
export function convertRequiredIssues(configs: FormConfigsPayload | null | undefined, values: ConvertLeadFormValues): ConfigValidationIssue[] {
    const issues: ConfigValidationIssue[] = [];
    for (const record of Object.keys(CONVERT_FIELD_NAMES) as ConvertModule[]) {
        if (record === 'contacts' && values.existingContactId) continue;
        if (record === 'organizations' && values.existingOrganizationId) continue;
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
