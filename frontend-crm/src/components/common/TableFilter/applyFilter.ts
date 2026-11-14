import { DATE_OPERATORS, DAYS_OPERATORS, type FilterCondition, type FilterCriteria, type FilterFieldDef } from './types';

// ── Dates ────────────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d: Date, days: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);

/** Local calendar date (YYYY-MM-DD) of a stored date, date-time or ISO timestamp. */
export function toLocalYmd(value: unknown): string | undefined {
    if (typeof value !== 'string' || !value) return undefined;
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    // ISO timestamps (createdAt …) are UTC: show them on the user's calendar day.
    if (/T.*(Z|[+-]\d{2}:?\d{2})$/.test(value)) {
        const d = new Date(value);
        return Number.isNaN(d.getTime()) ? undefined : ymd(d);
    }
    const head = value.slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(head) ? head : undefined;
}

/** Inclusive [from, to] of a date operator ('' = open end); undefined when its inputs are missing. */
function dateRange(c: FilterCondition): [string, string] | undefined {
    const today = new Date();
    const t = ymd(today);
    switch (c.op) {
        case 'equals':
            return c.value ? [c.value, c.value] : undefined;
        case 'before':
            return c.value ? ['', ymd(addDays(new Date(`${c.value}T00:00:00`), -1))] : undefined;
        case 'after':
            return c.value ? [ymd(addDays(new Date(`${c.value}T00:00:00`), 1)), ''] : undefined;
        case 'between': {
            if (!c.value && !c.value2) return undefined;
            const [a, b] = [c.value ?? '', c.value2 ?? ''];
            return a && b && a > b ? [b, a] : [a, b];
        }
        case 'today':
            return [t, t];
        case 'yesterday': {
            const y = ymd(addDays(today, -1));
            return [y, y];
        }
        case 'tomorrow': {
            const y = ymd(addDays(today, 1));
            return [y, y];
        }
        case 'this_week': {
            // Monday-to-Sunday week.
            const monday = addDays(today, -((today.getDay() + 6) % 7));
            return [ymd(monday), ymd(addDays(monday, 6))];
        }
        case 'this_month':
            return [ymd(new Date(today.getFullYear(), today.getMonth(), 1)), ymd(new Date(today.getFullYear(), today.getMonth() + 1, 0))];
        case 'last_7_days':
            return [ymd(addDays(today, -6)), t];
        case 'last_30_days':
            return [ymd(addDays(today, -29)), t];
        case 'next_7_days':
            return [t, ymd(addDays(today, 6))];
        default:
            return undefined;
    }
}

// ── Conditions ───────────────────────────────────────────────────────────────

/** A condition with everything it needs filled in (incomplete ones are ignored, never applied). */
export function isConditionComplete(field: FilterFieldDef | undefined, c: FilterCondition | undefined): c is FilterCondition {
    if (!field || !c) return false;
    switch (field.kind) {
        case 'options':
            return c.op === 'in' && Boolean(c.values?.length);
        case 'text':
            return c.op === 'contains' && Boolean(c.value?.trim());
        case 'days':
            return Boolean(c.value?.trim()) && Number.isFinite(Number(c.value)) && ['gte', 'lte', 'equals'].includes(c.op);
        case 'boolean':
            return c.op === 'is' && (c.value === 'yes' || c.value === 'no');
        case 'date':
            return dateRange(c) !== undefined;
    }
}

/** Only the complete conditions of fields that still exist. */
export function cleanCriteria(criteria: FilterCriteria, byKey: Map<string, FilterFieldDef>): FilterCriteria {
    const conditions: FilterCriteria['conditions'] = {};
    for (const [key, c] of Object.entries(criteria.conditions)) {
        const field = byKey.get(key);
        if (!isConditionComplete(field, c)) continue;
        conditions[key] =
            field?.kind === 'text' ? { op: c.op, value: c.value?.trim() } : { op: c.op, ...(c.values ? { values: c.values } : {}), ...(c.value ? { value: c.value } : {}), ...(c.value2 ? { value2: c.value2 } : {}) };
    }
    return { conditions, ...(criteria.sort ? { sort: criteria.sort } : {}) };
}

export const activeConditionCount = (criteria: FilterCriteria | null | undefined) => (criteria ? Object.keys(criteria.conditions).length : 0);

function asStrings(value: unknown): string[] {
    if (value === undefined || value === null || value === '') return [];
    if (Array.isArray(value)) return value.flatMap(asStrings);
    if (typeof value === 'object') {
        const obj = value as Record<string, unknown>;
        return asStrings(obj.email ?? obj.name ?? obj.label ?? obj.value);
    }
    return [String(value)];
}

const digits = (s: string) => s.replace(/\D/g, '');

function matchesCondition(field: FilterFieldDef, c: FilterCondition, row: unknown): boolean {
    const raw = field.getValue(row);
    switch (field.kind) {
        case 'options': {
            const norm = field.normalizeValue ?? ((v: string) => v);
            const wanted = new Set((c.values ?? []).map((v) => norm(v).toLowerCase()));
            return asStrings(raw).some((v) => wanted.has(norm(v).toLowerCase()));
        }
        case 'text': {
            const q = (c.value ?? '').trim().toLowerCase();
            const values = asStrings(raw);
            if (field.digitsOnly && digits(q)) return values.some((v) => digits(v).includes(digits(q)));
            return values.some((v) => v.toLowerCase().includes(q));
        }
        case 'days': {
            if (typeof raw !== 'number') return false;
            const n = Number(c.value);
            return c.op === 'gte' ? raw >= n : c.op === 'lte' ? raw <= n : raw === n;
        }
        case 'boolean': {
            const truthy = raw === true || raw === 'true' || raw === 'Yes' || raw === 1;
            return c.value === 'yes' ? truthy : !truthy;
        }
        case 'date': {
            const range = dateRange(c);
            const day = toLocalYmd(raw);
            if (!range || !day) return false;
            const [from, to] = range;
            return (!from || day >= from) && (!to || day <= to);
        }
    }
}

/** Rows matching every condition (AND). Unknown / incomplete conditions are ignored. */
export function applyCriteria<T>(rows: T[], criteria: FilterCriteria | null, byKey: Map<string, FilterFieldDef>): T[] {
    if (!criteria) return rows;
    const active = Object.entries(criteria.conditions)
        .map(([key, c]) => [byKey.get(key), c] as const)
        .filter((pair): pair is readonly [FilterFieldDef, FilterCondition] => isConditionComplete(pair[0], pair[1]));
    if (active.length === 0) return rows;
    return rows.filter((row) => active.every(([field, c]) => matchesCondition(field, c, row)));
}

// ── Summaries (chips, recent list) ───────────────────────────────────────────

const fmtDate = (v?: string) => {
    if (!v) return '…';
    const [y, m, d] = v.split('-');
    return `${d}/${m}/${y}`;
};

/** "Status: New, In Process" / "Date Created: Last 7 Days" / "Age (Days): at least 30". */
export function describeCondition(field: FilterFieldDef, c: FilterCondition): string {
    switch (field.kind) {
        case 'options': {
            const labels = (c.values ?? []).map((v) => field.options?.find((o) => o.value === v)?.label ?? v);
            const shown = labels.length > 3 ? `${labels.slice(0, 3).join(', ')} +${labels.length - 3}` : labels.join(', ');
            return `${field.label}: ${shown}`;
        }
        case 'text':
            return `${field.label} contains "${c.value}"`;
        case 'days': {
            const label = DAYS_OPERATORS.find((o) => o.op === c.op)?.label.toLowerCase() ?? '';
            return `${field.label}: ${label} ${c.value}`;
        }
        case 'boolean':
            return `${field.label}: ${c.value === 'yes' ? 'Yes' : 'No'}`;
        case 'date': {
            const meta = DATE_OPERATORS.find((o) => o.op === c.op);
            if (!meta) return field.label;
            if (meta.inputs === 0) return `${field.label}: ${meta.label}`;
            if (c.op === 'between') return `${field.label}: ${fmtDate(c.value)} – ${fmtDate(c.value2)}`;
            return `${field.label}: ${c.op === 'equals' ? '' : `${meta.label.toLowerCase()} `}${fmtDate(c.value)}`;
        }
    }
}

/** Every condition summarized, in field order; conditions on fields that no longer exist are dropped. */
export function describeCriteria(criteria: FilterCriteria, byKey: Map<string, FilterFieldDef>, sortLabel?: (field: string) => string): string[] {
    const parts = Object.entries(criteria.conditions)
        .map(([key, c]) => {
            const field = byKey.get(key);
            return field && isConditionComplete(field, c) ? describeCondition(field, c) : null;
        })
        .filter((s): s is string => Boolean(s));
    if (criteria.sort) parts.push(`Order: ${sortLabel?.(criteria.sort.field) ?? criteria.sort.field} (${criteria.sort.order === 'asc' ? 'Ascending' : 'Descending'})`);
    return parts;
}
