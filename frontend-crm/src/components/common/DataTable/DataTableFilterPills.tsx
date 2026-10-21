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
            backgroundColor: isActive ? '#eff6ff' : '#fff',
            color: isActive ? '#1d4ed8' : '#475569',
            border: isActive ? '1px solid #93c5fd' : '1px solid #e2e8f0',
            boxShadow: isActive ? '0 1px 2px rgba(37,99,235,0.1)' : 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 0.8,
            transition: 'all 0.15s ease',
            '&:hover': { borderColor: '#93c5fd', backgroundColor: '#eff6ff' },
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
                                        color: isActive && tab.id === 'all' ? '#1d4ed8' : '#64748b',
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
                const tabColor = tab.activeColor || '#1d4ed8';
                const activeBg = tab.activeBgColor || '#eff6ff';
                const activeBadgeBg = tab.activeBadgeBgColor || '#dbeafe';

                return (
                    <Chip
                        key={tab.id}
                        icon={
                            tab.icon
                                ? React.cloneElement(tab.icon as React.ReactElement<{ sx?: object }>, {
                                      sx: {
                                          fontSize: 15,
                                          color: isActive ? `${tabColor} !important` : '#64748b !important',
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
                                            backgroundColor: isActive ? activeBadgeBg : '#e2e8f0',
                                            color: isActive ? (tab.activeColor || '#1e40af') : '#475569',
                                        }}
                                    >
                                        {tab.count}
                                    </Box>
                                )}
                            </Box>
                        }
                        onClick={() => onFilterChange(tab.id)}
                        sx={{
                            backgroundColor: isActive ? activeBg : '#ffffff',
                            color: isActive ? tabColor : '#334155',
                            border: isActive
                                ? `1.5px solid ${tab.activeColor || '#3b82f6'}`
                                : '1px solid #cbd5e1',
                            fontWeight: isActive ? 700 : 500,
                            fontSize: '0.8rem',
                            height: 32,
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            '&:hover': {
                                backgroundColor: isActive ? activeBadgeBg : '#f8fafc',
                            },
                        }}
                    />
                );
            })}
        </Box>
    );
}
