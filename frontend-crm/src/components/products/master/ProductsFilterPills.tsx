'use client';

import React from 'react';
import { Box, Chip } from '@mui/material';
import InventoryOutlinedIcon from '@mui/icons-material/InventoryOutlined';
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import NewReleasesOutlinedIcon from '@mui/icons-material/NewReleasesOutlined';
import StarBorderIcon from '@mui/icons-material/StarBorder';

export type ProductFilterTab = 'all' | 'hardware' | 'software' | 'services' | 'recently_added';

export interface ProductsFilterPillsProps {
    activeTab: ProductFilterTab;
    onTabChange: (tab: ProductFilterTab) => void;
    counts: {
        all: number;
        hardware: number;
        software: number;
        services: number;
        recentlyAdded: number;
    };
}

export function ProductsFilterPills({ activeTab, onTabChange, counts }: ProductsFilterPillsProps) {
    const tabs: Array<{
        id: ProductFilterTab;
        label: string;
        icon: React.ReactElement;
        count: number;
    }> = [
        {
            id: 'all',
            label: 'All Products',
            icon: <InventoryOutlinedIcon sx={{ fontSize: 16 }} />,
            count: counts.all,
        },
        {
            id: 'hardware',
            label: 'Hardware',
            icon: <CategoryOutlinedIcon sx={{ fontSize: 16 }} />,
            count: counts.hardware,
        },
        {
            id: 'software',
            label: 'Software & Licenses',
            icon: <StarBorderIcon sx={{ fontSize: 16 }} />,
            count: counts.software,
        },
        {
            id: 'services',
            label: 'Services & AMC',
            icon: <NewReleasesOutlinedIcon sx={{ fontSize: 16 }} />,
            count: counts.services,
        },
        {
            id: 'recently_added',
            label: 'Recently Added',
            icon: <NewReleasesOutlinedIcon sx={{ fontSize: 16 }} />,
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
                            whiteSpace: 'nowrap',
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
