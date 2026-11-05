import type { Branding, FieldVisibility, LineItemColumnSetting, PdfColumn, PdfFieldRegistry } from './pdf.types.js';
import { DEFAULT_BRANDING } from './pdf.types.js';

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

function parseJson(json: string | null | undefined): unknown {
    if (!json) return undefined;
    try {
        return JSON.parse(json);
    } catch {
        return undefined;
    }
}

/** Registry defaults: every field at its defaultVisible, columns in catalogue order. */
export function defaultFieldVisibility(registry: PdfFieldRegistry): FieldVisibility {
    return {
        fields: Object.fromEntries(registry.fields.map((f) => [f.key, f.defaultVisible])),
        lineItemColumns: registry.lineItemColumns.map((c, index) => ({
            key: c.key,
            label: c.label,
            visible: c.defaultVisible,
            order: index,
            ...(c.widthPct !== undefined ? { widthPct: c.widthPct } : {}),
        })),
    };
}

/**
 * Merges stored visibility (JSON string or object) over the registry defaults:
 *  • unknown field keys / column keys are dropped (e.g. a deleted custom field);
 *  • fields and columns added to the registry since the template was saved get their defaults;
 *  • columns are re-numbered 0..n by their stored order (new columns go last).
 */
export function mergeFieldVisibility(registry: PdfFieldRegistry, stored: string | FieldVisibility | null | undefined): FieldVisibility {
    const defaults = defaultFieldVisibility(registry);
    const raw: unknown = typeof stored === 'string' ? parseJson(stored) : stored;
    if (!isRecord(raw)) return defaults;

    const fields = { ...defaults.fields };
    if (isRecord(raw.fields)) {
        for (const [key, value] of Object.entries(raw.fields)) {
            if (key in fields && typeof value === 'boolean') fields[key] = value;
        }
    }

    const storedColumns = new Map<string, Partial<LineItemColumnSetting>>();
    if (Array.isArray(raw.lineItemColumns)) {
        for (const col of raw.lineItemColumns) {
            if (isRecord(col) && typeof col.key === 'string') storedColumns.set(col.key, col as Partial<LineItemColumnSetting>);
        }
    }

    const merged = defaults.lineItemColumns.map((def, index) => {
        const saved = storedColumns.get(def.key);
        if (!saved) return { ...def, order: Number.MAX_SAFE_INTEGER - (defaults.lineItemColumns.length - index) };
        const label = typeof saved.label === 'string' && saved.label.trim() ? saved.label.trim().slice(0, 60) : def.label;
        const widthPct = typeof saved.widthPct === 'number' && saved.widthPct > 0 && saved.widthPct <= 100 ? saved.widthPct : def.widthPct;
        return {
            key: def.key,
            label,
            visible: typeof saved.visible === 'boolean' ? saved.visible : def.visible,
            order: typeof saved.order === 'number' && Number.isFinite(saved.order) ? saved.order : index,
            ...(widthPct !== undefined ? { widthPct } : {}),
        };
    });

    merged.sort((a, b) => a.order - b.order);
    return { fields, lineItemColumns: merged.map((col, order) => ({ ...col, order })) };
}

/** Visible columns in order, with alignment from the registry (what templates iterate as `columns`). */
export function visibleColumns(registry: PdfFieldRegistry, visibility: FieldVisibility): PdfColumn[] {
    const align = new Map(registry.lineItemColumns.map((c) => [c.key, c.align]));
    return visibility.lineItemColumns
        .filter((c) => c.visible)
        .map((c) => ({ key: c.key, label: c.label, align: align.get(c.key) ?? 'left', ...(c.widthPct !== undefined ? { widthPct: c.widthPct } : {}) }));
}

/** Flattened `show` map: field keys plus `col_<key>` for each line-item column. */
export function flattenVisibility(visibility: FieldVisibility): Record<string, boolean> {
    const show: Record<string, boolean> = { ...visibility.fields };
    for (const col of visibility.lineItemColumns) show[`col_${col.key}`] = col.visible;
    return show;
}

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Stored branding JSON over the defaults; invalid colours fall back to the default accent. */
export function mergeBranding(stored: string | Partial<Branding> | null | undefined, fallback: Branding = DEFAULT_BRANDING): Branding {
    const raw: unknown = typeof stored === 'string' ? parseJson(stored) : stored;
    const result: Branding = { ...fallback };
    if (!isRecord(raw)) return result;
    const textKeys = ['companyName', 'companyAddress', 'companyPhone', 'companyEmail', 'companyGstin', 'companyWebsite'] as const;
    for (const key of textKeys) {
        const value = raw[key];
        if (typeof value === 'string') result[key] = value.slice(0, 1000);
    }
    if (typeof raw.accentColor === 'string' && HEX_COLOR.test(raw.accentColor)) result.accentColor = raw.accentColor;
    if (typeof raw.logoAssetKey === 'string' && /^[\w.-]{1,80}$/.test(raw.logoAssetKey)) result.logoAssetKey = raw.logoAssetKey;
    else delete result.logoAssetKey;
    return result;
}
