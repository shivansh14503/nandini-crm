'use client';

import React from 'react';
import { Box, Chip } from '@mui/material';
import TrendingUpOutlinedIcon from '@mui/icons-material/TrendingUpOutlined';
import MonetizationOnOutlinedIcon from '@mui/icons-material/MonetizationOnOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import ScheduleIcon from '@mui/icons-material/Schedule';
import AccountCircleOutlinedIcon from '@mui/icons-material/AccountCircleOutlined';
import WorkspacePremiumOutlinedIcon from '@mui/icons-material/WorkspacePremiumOutlined';
import type { OpportunityFilterTab } from './types';

export interface OpportunitiesFilterPillsProps {
    activeTab: OpportunityFilterTab;
    onTabChange: (tab: OpportunityFilterTab) => void;
    counts: {
        all: number;
        open: number;
        closingSoon: number;
        won: number;
        myDeals: number;
        highValue: number;
    };
}

export function OpportunitiesFilterPills({
    activeTab,
    onTabChange,
    counts,
}: OpportunitiesFilterPillsProps) {
    const tabs: Array<{
        id: OpportunityFilterTab;
        label: string;
        icon: React.ReactElement;
        count: number;
        activeColor?: string;
    }> = [
        {
            id: 'all',
            label: 'All Opportunities',
            icon: <TrendingUpOutlinedIcon sx={{ fontSize: 16 }} />,
            count: counts.all,
        },
        {
            id: 'open',
            label: 'Active Pipeline',
            icon: <MonetizationOnOutlinedIcon sx={{ fontSize: 16 }} />,
            count: counts.open,
            activeColor: '#2563eb',
        },
        {
            id: 'closing_soon',
            label: 'Followup Today',
            icon: <ScheduleIcon sx={{ fontSize: 16 }} />,
            count: counts.closingSoon,
            activeColor: '#d97706',
        },
        {
            id: 'won',
            label: 'Closed Won',
            icon: <CheckCircleOutlinedIcon sx={{ fontSize: 16 }} />,
            count: counts.won,
            activeColor: '#16a34a',
        },
        {
            id: 'high_value',
            label: 'High Value (₹1L+)',
            icon: <WorkspacePremiumOutlinedIcon sx={{ fontSize: 16 }} />,
            count: counts.highValue,
            activeColor: '#7c3aed',
        },
        {
            id: 'my_deals',
            label: 'My Deals',
            icon: <AccountCircleOutlinedIcon sx={{ fontSize: 16 }} />,
            count: counts.myDeals,
        },
    ];

    return (
        <Box sx={{ display: 'flex', gap: 1, overflowX: 'auto', pb: 0.5 }}>
            {tabs.map((tab) => {
                const isActive = activeTab === tab.id;
                const tabColor = tab.activeColor || '#1d4ed8';

                return (
                    <Chip
                        key={tab.id}
                        icon={React.cloneElement(tab.icon as React.ReactElement<any>, {
                            sx: {
                                fontSize: 15,
                                color: isActive ? `${tabColor} !important` : '#64748b !important',
                            },
                        })}
                        label={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                <span>{tab.label}</span>
                                <Box
                                    component="span"
                                    sx={{
                                        px: 0.75,
                                        py: 0.1,
                                        borderRadius: '10px',
                                        fontSize: '0.7rem',
                                        fontWeight: 700,
                                        backgroundColor: isActive ? '#dbeafe' : '#e2e8f0',
                                        color: isActive ? tabColor : '#475569',
                                    }}
                                >
                                    {tab.count}
                                </Box>
                            </Box>
                        }
                        onClick={() => onTabChange(tab.id)}
                        sx={{
                            backgroundColor: isActive ? '#eff6ff' : '#ffffff',
                            color: isActive ? tabColor : '#334155',
                            border: isActive ? `1.5px solid ${tabColor}` : '1px solid #cbd5e1',
                            fontWeight: isActive ? 700 : 500,
                            fontSize: '0.8rem',
                            height: 32,
                            cursor: 'pointer',
                            '&:hover': {
                                backgroundColor: isActive ? '#dbeafe' : '#f8fafc',
                            },
                        }}
                    />
                );
            })}
        </Box>
    );
}
