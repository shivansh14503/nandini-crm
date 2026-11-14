import React from 'react';
import { Box, Typography, type SxProps, type Theme } from '@mui/material';
import { useFormMode } from '@/context/FormModeContext';
import { FieldNameProvider, useFieldOverride } from '@/context/FormConfigContext';
import { ReadOnlyField } from './ReadOnlyField';
import { getCountryNameByCode } from '@/data/addressMaster';
import {
    COMPACT_FIT_PX,
    contentFitSx,
    contentFitWidthPx,
    fieldSizeSx,
    isTaxIdentifierField,
    resolveFieldMaxLength,
    resolveFieldSize,
    type FieldContentFit,
    type FieldSize,
} from './fieldSizing';

export const fieldSx = {
    '& .MuiOutlinedInput-root': {
        borderRadius: '8px',
        backgroundColor: 'var(--mui-palette-background-paper)',
        fontSize: '0.85rem',
        '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--mui-palette-primary-main)' },
        '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: 'var(--mui-palette-primary-main)',
            borderWidth: '1.5px',
        },
    },
    '& .MuiInputLabel-root.Mui-focused': { color: 'var(--crm-text-blue-600)' },
};

export interface FormFieldProps {
    /** Explicit read-only content for view mode (use when the control's value can't be inferred, e.g. chip groups). */
    viewValue?: React.ReactNode;
    /** Form field key; exposed as `data-field` so validation can scroll to and focus the control. */
    name?: string;
    label: string;
    required?: boolean;
    hint?: React.ReactNode;
    /**
     * Width token for the whole field (label, control, error). Inferred from `name` when omitted;
     * unrecognised names stay full width. Exposed as `data-field-size` for {@link FormRow} / {@link FormGrid}.
     */
    size?: FieldSize;
    /**
     * What the control can hold. When the admin leaves Width on "Auto", the field is drawn just wide enough for
     * it instead of at `size`. Inferred from `name`'s character limit when omitted; `null` opts out (picker fields
     * keep one shared width).
     */
    fit?: FieldContentFit | null;
    children: React.ReactNode;
    sx?: SxProps<Theme>;
}

const COPYABLE_FIELDS = new Set([
    'gstNo',
    'gstNumber',
    'panNumber',
    'bankIfscCode',
    'accountNumber',
    'cinNo',
    'tanNumber',
    'msmeRegnNumber',
    'sapCodeTallyId',
    'showroomBranchCode',
]);
const COPYABLE_PATTERN = /(phone|mobile|email|code)$/i;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function formatViewString(text: string): string {
    if (!ISO_DATE.test(text)) return text;
    return new Date(`${text}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Collects displayable values from every value-bearing control nested inside a FormField (date + time, etc.). */
function collectViewValues(children: React.ReactNode, out: string[]): void {
    React.Children.forEach(children, (child) => {
        if (!React.isValidElement<{ value?: unknown; checked?: unknown; children?: React.ReactNode }>(child)) return;
        const { value, checked, children: nested } = child.props;
        if (typeof value === 'string' || typeof value === 'number') {
            if (String(value) !== '') out.push(formatViewString(String(value)));
        } else if (typeof checked === 'boolean') {
            out.push(checked ? 'Yes' : 'No');
        } else if (nested) {
            collectViewValues(nested, out);
        }
    });
}

function extractViewValue(children: React.ReactNode): { found: boolean; value?: string } {
    const values: string[] = [];
    collectViewValues(children, values);
    // found=true even when empty so FormField hides unfilled fields instead of rendering editable children.
    return { found: true, value: values.length > 0 ? values.join(' • ') : undefined };
}

function viewPresentation(name: string | undefined, value: string | undefined) {
    const copyable = Boolean(name && (COPYABLE_FIELDS.has(name) || COPYABLE_PATTERN.test(name)));
    if (name === 'accountStatus' && value) {
        return { copyable, badge: true, badgeColor: value === 'Active' ? 'var(--mui-palette-success-main)' : 'var(--mui-palette-text-secondary)' };
    }
    if (name === 'customerType' && value) {
        return { copyable, badge: true, badgeColor: 'var(--crm-text-blue-700)' };
    }
    return { copyable, badge: false, badgeColor: undefined };
}

/** Smallest space kept between the label and a hint; with less room the hint is hidden. */
const MIN_GAP_PX = 12;

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? React.useLayoutEffect : React.useEffect;

/**
 * Label + hint on one line, always. The header never wraps (so inputs in a grid row stay aligned): a hint
 * that doesn't fit beside the label, or any hint on a compact (`xs` / `sm`) field, is hidden instead.
 * The hint stays mounted (invisible, out of flow) so its natural width can be re-measured on resize.
 */
function FormFieldHeader({ label, required, hint, compact }: { label: string; required?: boolean; hint?: React.ReactNode; compact: boolean }) {
    const headerRef = React.useRef<HTMLDivElement>(null);
    const labelRef = React.useRef<HTMLSpanElement>(null);
    const hintRef = React.useRef<HTMLDivElement>(null);
    const [fits, setFits] = React.useState(false);

    useIsomorphicLayoutEffect(() => {
        const header = headerRef.current;
        if (!header || !hint || compact) {
            setFits(false);
            return;
        }
        const measure = () => {
            const labelWidth = labelRef.current?.offsetWidth ?? 0;
            const hintWidth = hintRef.current?.scrollWidth ?? 0;
            setFits(labelWidth + hintWidth + MIN_GAP_PX <= header.clientWidth);
        };
        measure();
        if (typeof ResizeObserver === 'undefined') return;
        const observer = new ResizeObserver(measure);
        observer.observe(header);
        return () => observer.disconnect();
    }, [hint, label, required, compact]);

    return (
        <Box
            ref={headerRef}
            sx={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'nowrap',
                minWidth: 0,
                minHeight: 20,
                overflow: 'hidden',
                columnGap: 1,
                mb: 0.6,
            }}
        >
            <Typography
                ref={labelRef}
                component="span"
                variant="body2"
                sx={{ fontWeight: 600, color: 'var(--crm-gray-700)', fontSize: '0.82rem', whiteSpace: 'nowrap', flexShrink: 0 }}
            >
                {label}
                {required && (
                    <Box component="span" sx={{ color: 'var(--crm-red-500)', ml: 0.4 }}>
                        *
                    </Box>
                )}
            </Typography>
            {hint && (
                <Box
                    ref={hintRef}
                    sx={[
                        { whiteSpace: 'nowrap', flexShrink: 0, display: 'flex', alignItems: 'center' },
                        !fits && { position: 'absolute', visibility: 'hidden', pointerEvents: 'none' },
                    ]}
                >
                    {typeof hint === 'string' ? (
                        <Typography variant="caption" sx={{ color: 'var(--crm-gray-400)', fontSize: '0.72rem' }}>
                            {hint}
                        </Typography>
                    ) : (
                        hint
                    )}
                </Box>
            )}
        </Box>
    );
}

/**
 * Set by renderers of admin-configured custom fields (which have no built-in override): `true` when the admin
 * left Width on "Auto", so the field sizes itself to its content.
 */
const FieldAutoSizeContext = React.createContext<boolean | undefined>(undefined);

export function FieldAutoSizeProvider({ auto, children }: { auto: boolean; children: React.ReactNode }) {
    return <FieldAutoSizeContext.Provider value={auto}>{children}</FieldAutoSizeContext.Provider>;
}

/** Whether the field bound to `name` is on "Auto" width in the form builder (built-in or custom field). */
export function useFieldAutoSize(name: string | undefined): boolean {
    const customFieldAuto = React.useContext(FieldAutoSizeContext);
    const override = useFieldOverride(name, { label: '' });
    return customFieldAuto ?? Boolean(override?.sizeIsAuto);
}

/** Content capacity known from the field name alone (e.g. `gstNo` → 15 chars), for wrappers around custom controls. */
function fitFromName(name: string | undefined): FieldContentFit | undefined {
    const chars = resolveFieldMaxLength(name);
    return chars ? { chars, wide: isTaxIdentifierField(name) } : undefined;
}

export function FormField({ name, viewValue, label: baseLabel, required: baseRequired, hint: baseHint, size: baseSize, fit, children, sx }: FormFieldProps) {
    const { mode } = useFormMode();
    const isAuto = useFieldAutoSize(name);
    // Admin overrides for this built-in field (inside a FormConfigProvider); undefined keeps the coded props.
    const override = useFieldOverride(name, { label: baseLabel, required: baseRequired, hint: baseHint, fieldSize: baseSize });
    if (override?.hidden) return null;
    const label = override?.label ?? baseLabel;
    const required = override?.required ?? baseRequired;
    const hint = override ? override.hint : baseHint;
    const size = override?.fieldSize ?? baseSize;

    if (mode === 'view') {
        if (viewValue !== undefined) {
            return <ReadOnlyField label={label} value={viewValue} hideWhenEmpty sx={{ mb: 2, ...sx }} />;
        }
        const extracted = extractViewValue(children);
        const found = extracted.found;
        // Country fields store ISO2 codes; show the country name. Dropdown values show their admin label.
        const value =
            name && /country$/i.test(name) && extracted.value
                ? getCountryNameByCode(extracted.value)
                : extracted.value && override?.optionLabels?.[extracted.value]
                  ? override.optionLabels[extracted.value]
                  : extracted.value;
        if (found) {
            return <ReadOnlyField label={label} value={value} hideWhenEmpty {...viewPresentation(name, value)} sx={{ mb: 2, ...sx }} />;
        }
    }
    const resolvedSize = resolveFieldSize(name, undefined, size);
    // "Auto" width in the form builder: fit the field's longest possible value (and its label) rather than a token.
    // Full-row fields (textareas, chip groups, tables) keep spanning the row.
    const contentFit = isAuto && resolvedSize !== 'full' && fit !== null ? (fit ?? fitFromName(name)) : undefined;
    const fitPx = contentFit ? contentFitWidthPx(contentFit, label, required) : undefined;
    const compact = fitPx !== undefined ? fitPx < COMPACT_FIT_PX : resolvedSize === 'xs' || resolvedSize === 'sm';
    return (
        <Box
            data-field={name}
            data-field-size={fitPx !== undefined ? 'fit' : resolvedSize}
            sx={[{ mb: 2, ...(fitPx !== undefined ? contentFitSx(fitPx) : fieldSizeSx(resolvedSize)) }, ...(Array.isArray(sx) ? sx : [sx])]}
        >
            <FormFieldHeader label={label} required={required} hint={hint} compact={compact} />
            <FieldNameProvider name={name}>{children}</FieldNameProvider>
        </Box>
    );
}

