'use client';

import React from 'react';
import { Box, Chip } from '@mui/material';
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import ScheduleIcon from '@mui/icons-material/Schedule';
import AccountCircleOutlinedIcon from '@mui/icons-material/AccountCircleOutlined';
import type { ContactFilterTab } from './types';

export interface ContactsFilterPillsProps {
    activeTab: ContactFilterTab;
    onTabChange: (tab: ContactFilterTab) => void;
    counts: {
        all: number;
        primary: number;
        myContacts: number;
        recentlyAdded: number;
    };
}

export function ContactsFilterPills({
    activeTab,
    onTabChange,
    counts,
}: ContactsFilterPillsProps) {
    const tabs: Array<{
        id: ContactFilterTab;
        label: string;
        icon: React.ReactElement;
        count: number;
    }> = [
        {
            id: 'all',
            label: 'All Contacts',
            icon: <PersonOutlinedIcon sx={{ fontSize: 16 }} />,
            count: counts.all,
        },
        {
            id: 'primary',
            label: 'Primary Contacts',
            icon: <StarBorderIcon sx={{ fontSize: 16 }} />,
            count: counts.primary,
        },
        {
            id: 'my_contacts',
            label: 'My Contacts',
            icon: <AccountCircleOutlinedIcon sx={{ fontSize: 16 }} />,
            count: counts.myContacts,
        },
        {
            id: 'recently_added',
            label: 'Recently Added',
            icon: <ScheduleIcon sx={{ fontSize: 16 }} />,
            count: counts.recentlyAdded,
        },
    ];

    return (
        <Box sx={{ display: 'flex', gap: 1, overflowX: 'auto', pb: 0.5 }}>
            {tabs.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                    <Chip
                        key={tab.id}
                        icon={React.cloneElement(tab.icon as React.ReactElement<any>, {
                            sx: {
                                fontSize: 15,
                                color: isActive ? '#1d4ed8 !important' : '#64748b !important',
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
                                        color: isActive ? '#1e40af' : '#475569',
                                    }}
                                >
                                    {tab.count}
                                </Box>
                            </Box>
                        }
                        onClick={() => onTabChange(tab.id)}
                        sx={{
                            backgroundColor: isActive ? '#eff6ff' : '#ffffff',
                            color: isActive ? '#1d4ed8' : '#334155',
                            border: isActive ? '1.5px solid #3b82f6' : '1px solid #cbd5e1',
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
