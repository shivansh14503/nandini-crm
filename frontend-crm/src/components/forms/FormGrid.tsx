'use client';

import React, { createContext, useContext } from 'react';
import { Box, type SxProps, type Theme } from '@mui/material';
import type { Breakpoint } from '@mui/material/styles';
import { FIELD_SIZES, FIELD_SIZE_WIDTH } from './fieldSizing';

type ResponsiveCount = Partial<Record<Breakpoint, number>>;

/** A number N means: 1 column on phones, up to 2 on tablets, N from `md` up. */
export type FormGridColumns = number | ResponsiveCount;

const toColumnMap = (columns: FormGridColumns): ResponsiveCount =>
    typeof columns === 'number' ? { xs: 1, sm: Math.min(2, columns), md: columns } : { xs: 1, ...columns };

const mapBreakpoints = <V,>(counts: ResponsiveCount, toValue: (count: number) => V) =>
    Object.fromEntries(Object.entries(counts).map(([bp, count]) => [bp, toValue(count)]));

const sxList = (sx?: SxProps<Theme>) => (Array.isArray(sx) ? sx : [sx]);

/** Gap replaces the fields' own bottom margin; `&&` outranks the child's single-class `mb`. */
const resetChildMarginSx = { '&& > *': { mb: 0 } };

const FormGridColumnsContext = createContext<ResponsiveCount>({ xs: 1 });

export interface FormGridProps {
    /** Column count, a number or per breakpoint (default 3 → 1 / 2 / 3). */
    columns?: FormGridColumns;
    children: React.ReactNode;
    sx?: SxProps<Theme>;
}

/**
 * Compact multi-column grid for related short fields (`PAN + GST + TAN`, `Date + Priority + Status`).
 * Each field keeps its own size cap inside its cell; `full`-size fields (textareas, chip groups) span the row.
 */
export function FormGrid({ columns = 3, children, sx }: FormGridProps) {
    const columnMap = toColumnMap(columns);
    return (
        <FormGridColumnsContext.Provider value={columnMap}>
            <Box
                sx={[
                    {
                        display: 'grid',
                        gridTemplateColumns: mapBreakpoints(columnMap, (n) => `repeat(${n}, minmax(0, 1fr))`),
                        columnGap: 3,
                        rowGap: 2.5,
                        alignItems: 'start',
                        '& > [data-field-size="full"]': { gridColumn: '1 / -1' },
                    },
                    resetChildMarginSx,
                    ...sxList(sx),
                ]}
            >
                {children}
            </Box>
        </FormGridColumnsContext.Provider>
    );
}

export interface FormGridItemProps {
    /** Columns to span; clamped to the grid's column count at each breakpoint. `full` spans the whole row. */
    span?: number | 'full';
    children: React.ReactNode;
    sx?: SxProps<Theme>;
}

/** Grid cell for content that needs more than one {@link FormGrid} column. */
export function FormGridItem({ span = 1, children, sx }: FormGridItemProps) {
    const columnMap = useContext(FormGridColumnsContext);
    const gridColumn = span === 'full' ? '1 / -1' : mapBreakpoints(columnMap, (n) => `span ${Math.min(span, n)}`);
    return <Box sx={[{ gridColumn, minWidth: 0 }, resetChildMarginSx, ...sxList(sx)]}>{children}</Box>;
}

/** Each sized field starts at its token width and grows no further than its cap; rows wrap as space runs out. */
const rowItemSizeSx = Object.fromEntries(
    FIELD_SIZES.map((size) => [
        `&& > [data-field-size="${size}"]`,
        { flex: { xs: '1 1 100%', sm: size === 'full' ? '1 1 100%' : `1 1 ${FIELD_SIZE_WIDTH[size]}` } },
    ])
);

export interface FormRowProps {
    children: React.ReactNode;
    sx?: SxProps<Theme>;
}

/**
 * Flowing row of fields, each at its natural token width (`Country md + State md + City md + PIN xs`).
 * Unlike {@link FormGrid}, columns aren't aligned across rows; use it for one logical group.
 */
export function FormRow({ children, sx }: FormRowProps) {
    return (
        <Box
            sx={[
                {
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'flex-start',
                    columnGap: 3,
                    rowGap: 2.5,
                    '&& > *': { mb: 0, minWidth: 0, flex: { xs: '1 1 100%', sm: '1 1 220px' } },
                    ...rowItemSizeSx,
                },
                ...sxList(sx),
            ]}
        >
            {children}
        </Box>
    );
}
