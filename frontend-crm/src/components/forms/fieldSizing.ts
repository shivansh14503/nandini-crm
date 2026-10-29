import { FIELD_MAX_LENGTH } from '@/config/fieldLimits';

/**
 * Field sizing design tokens — the single source of truth for how wide a form control is drawn and how many
 * characters it accepts. Widths are caps (`maxWidth`), never minimums, so a field never grows past what its data
 * needs but still shrinks inside narrow grid cells. On phones every field stays full width for touch usability.
 */

export type FieldSize = 'xs' | 'sm' | 'md' | 'lg' | 'full';

/**
 * Kind of control being sized. Structural kinds (`multiline`, `lookup`, `composite`) always win over name-based
 * inference; the rest fall back to their default only when the field name doesn't match a known rule.
 */
export type FieldType =
    | 'text'
    | 'multiline'
    | 'number'
    | 'amount'
    | 'percentage'
    | 'phone'
    | 'email'
    | 'url'
    | 'postalCode'
    | 'identifier'
    | 'date'
    | 'time'
    | 'dateTime'
    | 'select'
    | 'lookup'
    | 'composite';

export const FIELD_SIZES: readonly FieldSize[] = ['xs', 'sm', 'md', 'lg', 'full'];

export const FIELD_SIZE_WIDTH: Readonly<Record<FieldSize, string>> = {
    /** PIN code, percentage, Yes/No, counts, units, currency code. */
    xs: '140px',
    /** Phone, date, time, PAN, IFSC, GSTIN, TAN, status, priority, short codes. */
    sm: '220px',
    /** Person name, designation, department, email, selects, amounts, URL, bank account no. */
    md: '340px',
    /** Organization / trade name, subject, lookups, street address lines. */
    lg: '520px',
    /** Textareas, chip groups, line-item tables. */
    full: '100%',
};

// Limits live in config so Zod schemas share them without importing UI code; re-exported for form callers.
export { FIELD_MAX_LENGTH };

/** Responsive cap: full width on phones, token width from the `sm` breakpoint up. */
export function fieldSizeMaxWidth(size: FieldSize): { xs: string; sm: string } {
    return { xs: '100%', sm: FIELD_SIZE_WIDTH[size] };
}

/** `sx` fragment that applies a size token to a control or its wrapper. */
export function fieldSizeSx(size: FieldSize) {
    return { width: '100%', maxWidth: fieldSizeMaxWidth(size) };
}

interface FieldRule {
    pattern: RegExp;
    size: FieldSize;
    maxLength?: number;
}

/** Exact-name tax identifiers; anchored so words like "company" (…pan…) or "distance" (…tan…) never match. */
const TAX_IDENTIFIER_PATTERN = /^(gst(in)?|pan|tan|cin)(no|number)?$|ifsc/;

/**
 * Ordered name rules, first match wins. Patterns run against the normalized leaf key: last path segment,
 * lowercased, non-alphanumerics stripped (`lineItems.0.unitPrice` → `unitprice`, `PIN Code` → `pincode`).
 */
const FIELD_RULES: readonly FieldRule[] = [
    // Long-form text
    {
        pattern: /(description|remarks?|notes?|comments?|termsandconditions?|resolution|problem(observed|reported)|^rca$|reason)/,
        size: 'full',
        maxLength: FIELD_MAX_LENGTH.longText,
    },
    // Formatted identifiers
    { pattern: /^gst(in)?(no|number)?$/, size: 'sm', maxLength: FIELD_MAX_LENGTH.gstin },
    { pattern: /^pan(no|number)?$/, size: 'sm', maxLength: FIELD_MAX_LENGTH.pan },
    { pattern: /^tan(no|number)?$/, size: 'sm', maxLength: FIELD_MAX_LENGTH.tan },
    { pattern: /ifsc/, size: 'sm', maxLength: FIELD_MAX_LENGTH.ifsc },
    { pattern: /^cin(no|number)?$/, size: 'sm', maxLength: FIELD_MAX_LENGTH.cin },
    { pattern: /^msme/, size: 'sm', maxLength: FIELD_MAX_LENGTH.msme },
    { pattern: /^(hsn|sac)(code)?$/, size: 'sm', maxLength: FIELD_MAX_LENGTH.hsn },
    { pattern: /(pincode|postalcode|zipcode|^zip$)/, size: 'xs', maxLength: FIELD_MAX_LENGTH.postalCode },
    { pattern: /(sapcode|branchcode|tallyid)/, size: 'sm', maxLength: FIELD_MAX_LENGTH.shortCode },
    // Contact channels
    { pattern: /(mobile|phone|landline|fax)\d*$|contactnumber/, size: 'sm', maxLength: FIELD_MAX_LENGTH.phone },
    { pattern: /email(address)?\d*$/, size: 'md', maxLength: FIELD_MAX_LENGTH.email },
    { pattern: /(website|url|linkedin)$/, size: 'md', maxLength: FIELD_MAX_LENGTH.url },
    // Dates & times
    { pattern: /(date|time|^dob|validuntil|deadline|expiry)$/, size: 'sm' },
    // Small numerics & flags
    { pattern: /(percent(age)?|probability|^discount$|taxrate|^tax$)/, size: 'xs' },
    { pattern: /(quantity|^qty|(?<!ac|dis)count$|^age$|^noof|^numberof|^(unit|uom)$|^currency(code)?$)/, size: 'xs' },
    { pattern: /^(donotcall|leftjob|optedout|optout)$/, size: 'xs' },
    { pattern: /(status|priority)$/, size: 'sm' },
    // Money
    { pattern: /(amount|price|cost|mrp|msp|turnover|revenue|budget|value|total|rate)$/, size: 'md' },
    // Organizations & long titles
    {
        pattern: /^(organi[sz]ation|account|legal|trade|mailing|company)name$|company$|^memberof/,
        size: 'lg',
        maxLength: FIELD_MAX_LENGTH.organizationName,
    },
    { pattern: /^(opportunity|deal|product|project)name$/, size: 'lg', maxLength: FIELD_MAX_LENGTH.organizationName },
    { pattern: /(designation|department|jobtitle|role)$/, size: 'md', maxLength: FIELD_MAX_LENGTH.shortText },
    { pattern: /(subject|title)$/, size: 'lg', maxLength: FIELD_MAX_LENGTH.title },
    { pattern: /(address|street)\d*$/, size: 'lg', maxLength: FIELD_MAX_LENGTH.address },
    { pattern: /(city|state|country|district|region|province)$/, size: 'md', maxLength: FIELD_MAX_LENGTH.shortText },
    // People & bank account
    { pattern: /(name|preparedfor)$/, size: 'md', maxLength: FIELD_MAX_LENGTH.personName },
    { pattern: /^(bank)?account(number|no)$/, size: 'md', maxLength: FIELD_MAX_LENGTH.bankAccount },
    // Remaining short codes and categorical values
    { pattern: /code$/, size: 'sm', maxLength: FIELD_MAX_LENGTH.shortCode },
    { pattern: /(type|category|source|stage|industry|segment|mode|terms|period)$|^(typeof|natureof|sourceof)/, size: 'md' },
];

const TYPE_DEFAULT_SIZE: Readonly<Record<FieldType, FieldSize>> = {
    text: 'lg',
    multiline: 'full',
    number: 'sm',
    amount: 'md',
    percentage: 'xs',
    phone: 'sm',
    email: 'md',
    url: 'md',
    postalCode: 'xs',
    identifier: 'sm',
    date: 'sm',
    time: 'sm',
    dateTime: 'md',
    select: 'md',
    lookup: 'lg',
    composite: 'full',
};

const STRUCTURAL_TYPES: ReadonlySet<FieldType> = new Set<FieldType>(['multiline', 'lookup', 'composite']);

/** Last segment of an RHF path (`lineItems.0.unitPrice` → `unitPrice`); labels like `GST No.` stay whole. */
function fieldLeaf(fieldName: string): string {
    return fieldName.split('.').filter(Boolean).pop() ?? '';
}

function normalizeFieldKey(fieldName: string): string {
    return fieldLeaf(fieldName).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function matchRule(fieldName?: string): FieldRule | undefined {
    if (!fieldName) return undefined;
    const key = normalizeFieldKey(fieldName);
    if (!key) return undefined;
    return FIELD_RULES.find((rule) => rule.pattern.test(key));
}

/** True for `is…`/`has…` boolean flags stored as Yes/No values. */
function isBooleanFlag(fieldName?: string): boolean {
    return Boolean(fieldName && /^(is|has|can)[A-Z]/.test(fieldLeaf(fieldName)));
}

/**
 * Picks the visual width for a field. Precedence: explicit size → structural type (multiline / lookup /
 * composite) → field-name rule → type default → `full` (unknown fields keep today's full-width behaviour).
 */
export function resolveFieldSize(fieldName?: string, fieldType?: FieldType, explicitSize?: FieldSize): FieldSize {
    if (explicitSize) return explicitSize;
    if (fieldType && STRUCTURAL_TYPES.has(fieldType)) return TYPE_DEFAULT_SIZE[fieldType];
    if (isBooleanFlag(fieldName)) return 'xs';
    const rule = matchRule(fieldName);
    if (rule) return rule.size;
    return fieldType ? TYPE_DEFAULT_SIZE[fieldType] : 'full';
}

/** Picks the character limit for a field: explicit value first, then the field-name rule (undefined = no limit). */
export function resolveFieldMaxLength(fieldName?: string, explicitMaxLength?: number): number | undefined {
    if (explicitMaxLength !== undefined) return explicitMaxLength;
    return matchRule(fieldName)?.maxLength;
}

/**
 * Width that fits a dropdown's longest option (closed select shows the value plus a ~32px arrow).
 * Capped at `md`: longer options are ellipsized in the closed control and shown in full in the menu.
 * Returns undefined while there are no options so name / type inference can decide.
 */
export function resolveOptionsFieldSize(options: readonly string[]): FieldSize | undefined {
    if (options.length === 0) return undefined;
    const longest = Math.max(...options.map((o) => o.length));
    if (longest <= 10) return 'xs';
    if (longest <= 20) return 'sm';
    return 'md';
}

/** Maps an HTML input `type` (plus the multiline flag) to the {@link FieldType} used for sizing. */
export function fieldTypeFromInput(inputType?: string, multiline?: boolean): FieldType {
    if (multiline) return 'multiline';
    switch (inputType) {
        case 'email':
            return 'email';
        case 'tel':
            return 'phone';
        case 'number':
            return 'number';
        case 'url':
            return 'url';
        case 'date':
            return 'date';
        case 'time':
            return 'time';
        case 'datetime-local':
            return 'dateTime';
        default:
            return 'text';
    }
}

/** True for GSTIN / PAN / TAN / CIN / IFSC fields (by name or label), which are stored uppercase. */
export function isTaxIdentifierField(nameOrLabel?: string): boolean {
    return Boolean(nameOrLabel && TAX_IDENTIFIER_PATTERN.test(normalizeFieldKey(nameOrLabel)));
}
