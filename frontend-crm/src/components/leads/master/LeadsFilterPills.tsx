'use client';

import React from 'react';
import { Box, Chip } from '@mui/material';
import GroupOutlinedIcon from '@mui/icons-material/GroupOutlined';
import LocalFireDepartmentOutlinedIcon from '@mui/icons-material/LocalFireDepartmentOutlined';
import FiberNewOutlinedIcon from '@mui/icons-material/FiberNewOutlined';
import TodayOutlinedIcon from '@mui/icons-material/TodayOutlined';
import AccountCircleOutlinedIcon from '@mui/icons-material/AccountCircleOutlined';
import type { LeadFilterTab } from './types';

export interface LeadsFilterPillsProps {
    activeTab: LeadFilterTab;
    onTabChange: (tab: LeadFilterTab) => void;
    counts: {
        all: number;
        hot: number;
        newLeads: number;
        followupToday: number;
        myLeads: number;
    };
}

export function LeadsFilterPills({
    activeTab,
    onTabChange,
    counts,
}: LeadsFilterPillsProps) {
    const tabs: Array<{
        id: LeadFilterTab;
        label: string;
        icon: React.ReactElement;
        count: number;
        activeColor?: string;
    }> = [
        {
            id: 'all',
            label: 'All Leads',
            icon: <GroupOutlinedIcon sx={{ fontSize: 16 }} />,
            count: counts.all,
        },
        {
            id: 'hot',
            label: 'Hot Leads',
            icon: <LocalFireDepartmentOutlinedIcon sx={{ fontSize: 16 }} />,
            count: counts.hot,
            activeColor: '#dc2626',
        },
        {
            id: 'new',
            label: 'New Enquiries',
            icon: <FiberNewOutlinedIcon sx={{ fontSize: 16 }} />,
            count: counts.newLeads,
        },
        {
            id: 'followup_today',
            label: 'Followup Today',
            icon: <TodayOutlinedIcon sx={{ fontSize: 16 }} />,
            count: counts.followupToday,
            activeColor: '#d97706',
        },
        {
            id: 'my_leads',
            label: 'My Leads',
            icon: <AccountCircleOutlinedIcon sx={{ fontSize: 16 }} />,
            count: counts.myLeads,
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
                                        backgroundColor: isActive ? (tab.id === 'hot' ? '#fee2e2' : '#dbeafe') : '#e2e8f0',
                                        color: isActive ? tabColor : '#475569',
                                    }}
                                >
                                    {tab.count}
                                </Box>
                            </Box>
                        }
                        onClick={() => onTabChange(tab.id)}
                        sx={{
                            backgroundColor: isActive ? (tab.id === 'hot' ? '#fef2f2' : '#eff6ff') : '#ffffff',
                            color: isActive ? tabColor : '#334155',
                            border: isActive ? `1.5px solid ${tabColor}` : '1px solid #cbd5e1',
                            fontWeight: isActive ? 700 : 500,
                            fontSize: '0.8rem',
                            height: 32,
                            cursor: 'pointer',
                            '&:hover': {
                                backgroundColor: isActive ? (tab.id === 'hot' ? '#fee2e2' : '#dbeafe') : '#f8fafc',
                            },
                        }}
                    />
                );
            })}
        </Box>
    );
}
