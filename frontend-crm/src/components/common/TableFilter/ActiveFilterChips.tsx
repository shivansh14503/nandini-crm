'use client';

import { Box, Button, Chip, Typography } from '@mui/material';
import FilterListIcon from '@mui/icons-material/FilterList';
import { describeCondition, isConditionComplete } from './applyFilter';
import type { TableFilterController } from './useTableFilter';

/** The applied filter as removable chips above the table; clicking a chip reopens the dialog. */
export function ActiveFilterChips({ controller }: { controller: TableFilterController }) {
    const { criteria, fields } = controller;
    if (!criteria) return null;
    const entries = Object.entries(criteria.conditions).filter(([key, c]) => isConditionComplete(fields.byKey.get(key), c));
    if (entries.length === 0) return null;

    return (
        <Box
            sx={{
                display: 'flex',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 0.75,
                px: 1.5,
                py: 1,
                borderBottom: '1px solid #f1f5f9',
                backgroundColor: '#f8fbff',
            }}
        >
            <FilterListIcon sx={{ fontSize: 16, color: '#2563eb' }} />
            <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#1e40af', mr: 0.5 }}>
                {controller.filteredRows.length.toLocaleString('en-IN')} match
            </Typography>
            {entries.map(([key, c]) => {
                const field = fields.byKey.get(key)!;
                return (
                    <Chip
                        key={key}
                        size="small"
                        label={describeCondition(field, c)}
                        onClick={controller.open}
                        onDelete={() => controller.removeCondition(key)}
                        sx={{
                            height: 24,
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            backgroundColor: '#fff',
                            border: '1px solid #bfdbfe',
                            color: '#1e40af',
                            maxWidth: 360,
                        }}
                    />
                );
            })}
            <Button size="small" onClick={controller.clear} sx={{ textTransform: 'none', fontWeight: 700, fontSize: '0.75rem', minWidth: 0, px: 1 }}>
                Clear all
            </Button>
        </Box>
    );
}
