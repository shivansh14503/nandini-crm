'use client';

import React from 'react';
import { Box, Chip, Typography } from '@mui/material';
import type { DataTableFilterPillsProps } from './types';

export function DataTableFilterPills<TFilter extends string = string>({
    filters,
    activeFilter,
    onFilterChange,
    variant = 'chip',
}: DataTableFilterPillsProps<TFilter>) {
    if (variant === 'pill') {
        const pillBaseSx = (isActive: boolean) => ({
            px: 1.8,
            py: 0.6,
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '0.8rem',
            fontWeight: isActive ? 700 : 500,
            backgroundColor: isActive ? 'var(--mui-palette-primary-soft)' : 'var(--mui-palette-background-paper)',
            color: isActive ? 'var(--crm-text-blue-700)' : 'var(--crm-slate-600)',
            border: isActive ? '1px solid var(--crm-blue-300)' : '1px solid var(--mui-palette-border-main)',
            boxShadow: isActive ? '0 1px 2px rgb(var(--crm-accent-rgb) / 0.1)' : 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 0.8,
            transition: 'all 0.15s ease',
            '&:hover': { borderColor: 'var(--crm-blue-300)', backgroundColor: 'var(--mui-palette-primary-soft)' },
        });

        return (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                {filters.map((tab) => {
                    const isActive = activeFilter === tab.id;
                    return (
                        <Box
                            key={tab.id}
                            onClick={() => onFilterChange(tab.id)}
                            sx={pillBaseSx(isActive)}
                        >
                            {tab.icon}
                            {tab.dotColor && (
                                <Box
                                    sx={{
                                        width: 6,
                                        height: 6,
                                        borderRadius: '50%',
                                        backgroundColor: tab.dotColor,
                                    }}
                                />
                            )}
                            {tab.label}
                            {tab.count !== undefined && (
                                <Typography
                                    component="span"
                                    sx={{
                                        fontSize: '0.72rem',
                                        fontWeight: tab.id === 'all' ? 700 : 400,
                                        color: isActive && tab.id === 'all' ? 'var(--crm-text-blue-700)' : 'var(--mui-palette-text-secondary)',
                                    }}
                                >
                                    {tab.count.toLocaleString()}
                                </Typography>
                            )}
                        </Box>
                    );
                })}
            </Box>
        );
    }

    return (
        <Box sx={{ display: 'flex', gap: 1, overflowX: 'auto', pb: 0.5 }}>
            {filters.map((tab) => {
                const isActive = activeFilter === tab.id;
                const tabColor = tab.activeColor || 'var(--crm-blue-700)';
                const activeBg = tab.activeBgColor || 'var(--mui-palette-primary-soft)';
                const activeBadgeBg = tab.activeBadgeBgColor || 'var(--crm-blue-100)';

                return (
                    <Chip
                        key={tab.id}
                        icon={
                            tab.icon
                                ? React.cloneElement(tab.icon as React.ReactElement<{ sx?: object }>, {
                                      sx: {
                                          fontSize: 15,
                                          color: isActive ? `${tabColor} !important` : 'var(--mui-palette-text-secondary) !important',
                                      },
                                  })
                                : undefined
                        }
                        label={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                <span>{tab.label}</span>
                                {tab.count !== undefined && (
                                    <Box
                                        component="span"
                                        sx={{
                                            px: 0.75,
                                            py: 0.1,
                                            borderRadius: '10px',
                                            fontSize: '0.7rem',
                                            fontWeight: 700,
                                            backgroundColor: isActive ? activeBadgeBg : 'var(--crm-slate-200)',
                                            color: isActive ? (tab.activeColor || 'var(--crm-text-blue-800)') : 'var(--crm-slate-600)',
                                        }}
                                    >
                                        {tab.count}
                                    </Box>
                                )}
                            </Box>
                        }
                        onClick={() => onFilterChange(tab.id)}
                        sx={{
                            backgroundColor: isActive ? activeBg : 'var(--mui-palette-background-paper)',
                            color: isActive ? tabColor : 'var(--crm-slate-700)',
                            border: isActive
                                ? `1.5px solid ${tab.activeColor || 'var(--crm-blue-500)'}`
                                : '1px solid var(--mui-palette-border-strong)',
                            fontWeight: isActive ? 700 : 500,
                            fontSize: '0.8rem',
                            height: 32,
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            '&:hover': {
                                backgroundColor: isActive ? activeBadgeBg : 'var(--mui-palette-background-subtle)',
                            },
                        }}
                    />
                );
            })}
        </Box>
    );
}
