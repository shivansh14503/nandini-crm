import React from 'react';
import { Box, Typography, type SxProps, type Theme } from '@mui/material';
import { useFormMode } from '@/context/FormModeContext';
import { ReadOnlyField } from './ReadOnlyField';

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

export function FormField({ name, viewValue, label, required, hint, children, sx }: FormFieldProps) {
    const { mode } = useFormMode();
    if (mode === 'view') {
        if (viewValue !== undefined) {
            return <ReadOnlyField label={label} value={viewValue} hideWhenEmpty sx={{ mb: 2, ...sx }} />;
        }
        const { found, value } = extractViewValue(children);
        if (found) {
            return <ReadOnlyField label={label} value={value} hideWhenEmpty {...viewPresentation(name, value)} sx={{ mb: 2, ...sx }} />;
        }
    }
    return (
        <Box data-field={name} sx={{ mb: 2, ...sx }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.6 }}>
                <Typography
                    variant="body2"
                    sx={{
                        fontWeight: 600,
                        color: '#374151',
                        fontSize: '0.82rem',
                    }}
                >
                    {label}
                    {required && (
                        <Box component="span" sx={{ color: '#ef4444', ml: 0.4 }}>
                            *
                        </Box>
                    )}
                </Typography>
                {hint && (
                    typeof hint === 'string' ? (
                        <Typography variant="caption" sx={{ color: '#9ca3af', fontSize: '0.72rem' }}>
                            {hint}
                        </Typography>
                    ) : (
                        hint
                    )
                )}
            </Box>
            {children}
        </Box>
    );
}

