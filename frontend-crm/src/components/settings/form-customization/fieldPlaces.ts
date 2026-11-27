import { CRM_MODULE_KEYS, moduleNavLabel, type CrmModuleKey, type FormConfigsPayload, type FormFieldDefinitionDto } from '@/types/formConfig.types';
import { moduleFields, UNSHARED_FIELD_KEYS } from '@/utils/formConfig';
import { isShownOnConvert } from '@/utils/convertLeadFields';
import { CONVERT_FIELD_NAMES, type ConvertModule } from '@/validations/convertLead.schema';

/** Another place in the CRM that shows the same field (same backend name = same concept, see the field-naming rules). */
export interface FieldPlace {
    key: string;
    /** Form the place belongs to; 'convert' is the Convert Lead form. */
    module: CrmModuleKey | 'convert';
    /** Name of the form, as in the navbar. */
    name: string;
    /** Where it sits, e.g. "Overview › Lead Details" ("Contact" on Convert Lead). */
    location: string;
    /** The field's label there, when it differs from this row's label. */
    otherLabel?: string;
    /** On the form's configuration but hidden from the form. */
    hidden: boolean;
}

const CONVERT_MODULES = Object.keys(CONVERT_FIELD_NAMES) as ConvertModule[];
const CONVERT_RECORD_LABELS: Record<ConvertModule, string> = { contacts: 'Contact', organizations: 'Organization', opportunities: 'Opportunity' };

/**
 * Every other form that has `field` (a field with the same key on another module's form), in navbar order, then
 * Convert Lead when it shows the field. `includeConvert: false` leaves Convert Lead out (its own builder view).
 * Fields in UNSHARED_FIELD_KEYS (Customer Response) are separate fields per module: other modules' forms don't count,
 * only Convert Lead's section of the field's own module.
 */
export function fieldPlaces(configs: FormConfigsPayload, field: FormFieldDefinitionDto, { includeConvert = true } = {}): FieldPlace[] {
    const places: FieldPlace[] = [];
    const unshared = UNSHARED_FIELD_KEYS.has(field.fieldKey);
    const differentLabel = (other: FormFieldDefinitionDto) =>
        other.label.trim().toLowerCase() !== field.label.trim().toLowerCase() ? other.label : undefined;

    for (const formModule of CRM_MODULE_KEYS) {
        if (formModule === field.module || unshared) continue;
        const other = moduleFields(configs, formModule).find((f) => f.isActive && f.fieldKey === field.fieldKey);
        if (!other) continue;
        const tab = configs.moduleTabs[formModule]?.find((t) => t.key === other.tabKey)?.label ?? other.tabLabel ?? other.tabKey;
        places.push({
            key: formModule,
            module: formModule,
            name: moduleNavLabel(formModule),
            location: `${tab} › ${other.sectionLabel}`,
            otherLabel: differentLabel(other),
            hidden: !other.isVisibleInForm,
        });
    }

    if (includeConvert) {
        const records = CONVERT_MODULES.filter((record) => !unshared || record === field.module).flatMap((record) => {
            const shown = moduleFields(configs, record).find((f) => f.fieldKey === field.fieldKey && isShownOnConvert(record, f));
            return shown ? [{ module: record, shown }] : [];
        });
        if (records.length > 0) {
            places.push({
                key: 'convert',
                module: 'convert',
                name: 'Convert Lead',
                location: sectionsPhrase(records.map((r) => CONVERT_RECORD_LABELS[r.module])),
                otherLabel: records.map((r) => differentLabel(r.shown)).find(Boolean),
                hidden: false,
            });
        }
    }
    return places;
}

/** "Contact section", "Contact and Opportunity sections", "Contact, Organization and Opportunity sections". */
function sectionsPhrase(names: string[]): string {
    if (names.length === 1) return `${names[0]} section`;
    return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} sections`;
}

/** Tooltip line for one place. */
export function describePlace(place: FieldPlace): string {
    const where = place.module === 'convert' ? `Convert Lead form › ${place.location}` : `${place.name} form › ${place.location}`;
    const label = place.otherLabel ? ` · labelled '${place.otherLabel}'` : '';
    const hidden = place.hidden ? ' · hidden on that form' : '';
    return `${where}${label}${hidden}`;
}
