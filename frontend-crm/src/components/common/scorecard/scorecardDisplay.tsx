'use client';

import { useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import { useFormConfigs } from '@/hooks/queries/useFormConfigs';
import { useScorecard } from '@/hooks/queries/useScorecards';
import type { CrmModuleKey } from '@/types/formConfig.types';
import { CUSTOM_FIELDS_KEY } from '@/utils/formConfig';
import type { DataTableColumn } from '../DataTable/types';
import type { DrawerBadgeItem } from '../Drawer/types';
import { resolveScorecard, scorecardChipSx, scorecardTextColor } from './scorecardUtils';

/** A scorecard value as a colored pill (dot + label). */
export function ScorecardValueChip({ label, color }: { label: string; color: string }) {
    return (
        <Box component="span" sx={scorecardChipSx(color)}>
            <Box component="span" sx={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />
            <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {label}
            </Box>
        </Box>
    );
}

/**
 * With "Enable List View Column Color" on, the scorecard field's column (hand-built or generated from the form)
 * renders each value as a pill in its scorecard color. Other columns, and values without a color, are untouched.
 */
export function useScorecardColumns<T>(columns: DataTableColumn<T>[] | undefined, module: CrmModuleKey | undefined) {
    const configs = useFormConfigs();
    const config = useScorecard(module);

    return useMemo(() => {
        const scorecard = config?.listViewColor ? resolveScorecard(config, configs, module) : null;
        if (!columns || !scorecard) return columns;
        const { field } = scorecard;
        const ids = new Set([field.fieldKey, `${CUSTOM_FIELDS_KEY}.${field.fieldKey}`]);
        return columns.map((col) => {
            if (!ids.has(col.fieldKey ?? col.id) && !ids.has(col.id)) return col;
            const original = col.render;
            const column: DataTableColumn<T> = {
                ...col,
                render: (row, index) => {
                    const value = scorecard.valueOf(row);
                    const color = value ? scorecard.colorOf(value) : undefined;
                    if (color) return <ScorecardValueChip label={scorecard.labelOf(value)} color={color} />;
                    if (original) return original(row, index);
                    return <Typography sx={{ fontSize: '0.78rem', color: 'var(--mui-palette-text-muted)' }}>{value || '-'}</Typography>;
                },
            };
            return column;
        });
    }, [columns, config, configs, module]);
}

/**
 * With "Enable Detail View Column Color" on: a drawer badge for the record's scorecard value in its color
 * (null otherwise). `fieldKey` lets the drawer swap out its own badge for the same field.
 */
export function useScorecardBadge(
    module: CrmModuleKey,
    record: unknown
): (DrawerBadgeItem & { fieldKey: string }) | null {
    const configs = useFormConfigs();
    const config = useScorecard(module);

    return useMemo(() => {
        const scorecard = config?.detailViewColor ? resolveScorecard(config, configs, module) : null;
        if (!scorecard || !record) return null;
        const value = scorecard.valueOf(record);
        const color = value ? scorecard.colorOf(value) : undefined;
        if (!color) return null;
        return {
            fieldKey: scorecard.field.fieldKey,
            label: scorecard.labelOf(value),
            icon: <Box component="span" sx={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: color, display: 'inline-block' }} />,
            color: scorecardTextColor(color),
            backgroundColor: `color-mix(in srgb, ${color} 14%, var(--mui-palette-background-paper))`,
            borderColor: `color-mix(in srgb, ${color} 38%, transparent)`,
        };
    }, [config, configs, module, record]);
}
