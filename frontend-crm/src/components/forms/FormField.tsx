import React from 'react';
import { Box, Typography, type SxProps, type Theme } from '@mui/material';
import { useFormMode } from '@/context/FormModeContext';
import { ReadOnlyField } from './ReadOnlyField';
import { getCountryNameByCode } from '@/data/addressMaster';
import { fieldSizeSx, resolveFieldSize, type FieldSize } from './fieldSizing';

export const fieldSx = {
    '& .MuiOutlinedInput-root': {
        borderRadius: '8px',
        backgroundColor: '#fff',
        fontSize: '0.85rem',
        '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#2563EB' },
        '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: '#2563EB',
            borderWidth: '1.5px',
        },
    },
    '& .MuiInputLabel-root.Mui-focused': { color: '#2563EB' },
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
        return { copyable, badge: true, badgeColor: value === 'Active' ? '#16a34a' : '#64748b' };
    }
    if (name === 'customerType' && value) {
        return { copyable, badge: true, badgeColor: '#1d4ed8' };
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
                sx={{ fontWeight: 600, color: '#374151', fontSize: '0.82rem', whiteSpace: 'nowrap', flexShrink: 0 }}
            >
                {label}
                {required && (
                    <Box component="span" sx={{ color: '#ef4444', ml: 0.4 }}>
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
                        <Typography variant="caption" sx={{ color: '#9ca3af', fontSize: '0.72rem' }}>
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

export function FormField({ name, viewValue, label, required, hint, size, children, sx }: FormFieldProps) {
    const { mode } = useFormMode();
    if (mode === 'view') {
        if (viewValue !== undefined) {
            return <ReadOnlyField label={label} value={viewValue} hideWhenEmpty sx={{ mb: 2, ...sx }} />;
        }
        const extracted = extractViewValue(children);
        const found = extracted.found;
        // Country fields store ISO2 codes; show the country name.
        const value = name && /country$/i.test(name) && extracted.value ? getCountryNameByCode(extracted.value) : extracted.value;
        if (found) {
            return <ReadOnlyField label={label} value={value} hideWhenEmpty {...viewPresentation(name, value)} sx={{ mb: 2, ...sx }} />;
        }
    }
    const resolvedSize = resolveFieldSize(name, undefined, size);
    return (
        <Box
            data-field={name}
            data-field-size={resolvedSize}
            sx={[{ mb: 2, ...fieldSizeSx(resolvedSize) }, ...(Array.isArray(sx) ? sx : [sx])]}
        >
            <FormFieldHeader label={label} required={required} hint={hint} compact={resolvedSize === 'xs' || resolvedSize === 'sm'} />
            {children}
        </Box>
    );
}

