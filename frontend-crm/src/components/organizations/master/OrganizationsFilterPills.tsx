'use client';

import React from 'react';
import { Box, Typography } from '@mui/material';
import HistoryIcon from '@mui/icons-material/History';
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import type { FilterTab } from './types';

export interface OrganizationsFilterPillsProps {
    activeTab: FilterTab;
    onTabChange: (tab: FilterTab) => void;
    totalCount?: number;
    recentCount?: number;
}

export function OrganizationsFilterPills({
    activeTab,
    onTabChange,
    totalCount = 11417,
    recentCount = 24,
}: OrganizationsFilterPillsProps) {
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
            {/* All Organizations */}
            <Box onClick={() => onTabChange('all')} sx={pillBaseSx(activeTab === 'all')}>
                All Organizations
                <Typography
                    component="span"
                    sx={{
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        color: activeTab === 'all' ? '#1d4ed8' : '#64748b',
                    }}
                >
                    {totalCount.toLocaleString()}
                </Typography>
            </Box>

            {/* Recently Viewed */}
            <Box onClick={() => onTabChange('recent')} sx={pillBaseSx(activeTab === 'recent')}>
                <HistoryIcon sx={{ fontSize: 15, color: '#94a3b8' }} />
                Recently Viewed
                <Typography component="span" sx={{ fontSize: '0.72rem', color: '#64748b' }}>
                    {recentCount}
                </Typography>
            </Box>

            {/* My Accounts */}
            <Box onClick={() => onTabChange('my')} sx={pillBaseSx(activeTab === 'my')}>
                <PersonOutlinedIcon sx={{ fontSize: 16, color: '#94a3b8' }} />
                My Accounts
            </Box>

            {/* Distributor/Trading */}
            <Box onClick={() => onTabChange('distributor')} sx={pillBaseSx(activeTab === 'distributor')}>
                <Box sx={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#2563eb' }} />
                Distributor/Trading
            </Box>

            {/* End User */}
            <Box onClick={() => onTabChange('enduser')} sx={pillBaseSx(activeTab === 'enduser')}>
                <Box sx={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#10b981' }} />
                End User
            </Box>
        </Box>
    );
}
